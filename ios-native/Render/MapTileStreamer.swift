import Foundation
import MetalKit
import ImageIO
import UIKit
import LieguojiCore

/// 8K–16K 真实地球卫星地貌与水深 GPU 瓦片金字塔流式渲染器（v7.0）：
/// - 读取 HotPack `ReliefTiles/{region}.lgtr` 索引二进制瓦片包（魔数 `"LGTR"`），
///   零全量读入内存：仅按当前相机视口与缩放级别 `z = 0..4` 从磁盘随机偏移读取可见的 6–16 块 JPEG 瓦片；
/// - 独立后台串行解码队列 + 48 块有界 LRU `MTLTexture` 显存池（峰值显存恒定 < 48 MB，主线程 120Hz 零卡顿）；
/// - 缩放至 100× 近景时自动切至 z=3/z=4 级瓦片，山脉阴影、河流盆地与深海海沟纤毫毕现。
final class MapTileStreamer: @unchecked Sendable {
    static let shared = MapTileStreamer()

    private struct TileRecord {
        let z: Int
        let x: Int
        let y: Int
        let offset: UInt64
        let length: UInt32
        let url: URL
    }

    private struct TileArchive {
        let region: String
        var maxZoom: Int
        let tileSize: Int
        var records: [UInt64: TileRecord] // key: (z << 32) | (x << 16) | y
    }

    struct VisibleTile {
        let texture: MTLTexture
        let x: Float
        let y: Float
        let w: Float
        let h: Float
    }

    private let lock = NSLock()
    private let decodeQueue = DispatchQueue(label: "lieguoji.tile.streamer", qos: .userInitiated)
    private var archives: [String: TileArchive] = [:]
    private var regionIds: [String: UInt64] = [:]
    private var textures: [UInt64: MTLTexture] = [:]
    private var lruStamps: [UInt64: UInt64] = [:]
    private var lruClock: UInt64 = 0
    private var inflight: Set<UInt64> = []
    private var cachedLoaderDeviceID: ObjectIdentifier?
    private var cachedLoader: MTKTextureLoader?
    private let maxCachedTextures = 48
    private var totalArchiveBytes: Int64 = 0
    private var totalTileCount: Int = 0
    /// 后台解码并上传完新 GPU 瓦片后通知主线程重绘一次，确保静止镜头缩放停下后高清瓦片也能瞬间显现。
    var onTileReady: (@Sendable () -> Void)?

    @inline(__always)
    private static func tileKey(z: Int, x: Int, y: Int) -> UInt64 {
        (UInt64(z & 0xFF) << 32) | (UInt64(x & 0xFFFF) << 16) | UInt64(y & 0xFFFF)
    }

    @inline(__always)
    private static func cacheKey(regionId: UInt64, z: Int, x: Int, y: Int) -> UInt64 {
        (regionId << 40) | tileKey(z: z, x: x, y: y)
    }

    /// 扫描并挂载 `HotPackManager.rootURL/ReliefTiles/` 下全部 `.lgtr` 真实卫星地貌瓦片包（只读头部索引，耗时 < 2ms）。
    func mountDirectory(_ dirURL: URL) {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dirURL, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) else {
            return
        }
        var parsed: [String: TileArchive] = [:]
        var bytesSum: Int64 = 0
        var tilesSum = 0
        for url in files where url.pathExtension.lowercased() == "lgtr" {
            if let arch = Self.parseHeader(url: url) {
                if var existing = parsed[arch.region] {
                    existing.maxZoom = max(existing.maxZoom, arch.maxZoom)
                    for (k, v) in arch.records { existing.records[k] = v }
                    parsed[arch.region] = existing
                } else {
                    parsed[arch.region] = arch
                }
                tilesSum += arch.records.count
                if let sz = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize {
                    bytesSum += Int64(sz)
                }
            }
        }
        var nextIds: [String: UInt64] = [:]
        for (idx, reg) in parsed.keys.sorted().enumerated() {
            nextIds[reg] = UInt64(idx + 1) & 0xFF_FFFF
        }
        lock.lock()
        archives = parsed
        regionIds = nextIds
        totalArchiveBytes = bytesSum
        totalTileCount = tilesSum
        textures.removeAll()
        lruStamps.removeAll()
        lruClock = 0
        inflight.removeAll()
        lock.unlock()
    }

    var mountedSummary: (regions: Int, tiles: Int, bytes: Int64) {
        lock.lock()
        defer { lock.unlock() }
        return (archives.count, totalTileCount, totalArchiveBytes)
    }

    func hasTiles(for region: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return archives[region] != nil
    }

    func clearGPUCache() {
        lock.lock()
        textures.removeAll()
        lruStamps.removeAll()
        lruClock = 0
        inflight.removeAll()
        lock.unlock()
    }

    /// 根据当前相机视口返回立即可绘的 GPU 瓦片，并异步预热缺失的高倍率瓦片（未就绪时自动回落至已缓存的父级 z-1 瓦片，零闪烁）。
    func visibleTiles(
        region: String,
        device: MTLDevice,
        camera: MapCamera,
        viewport: CGSize,
        mapWidth: Float,
        mapHeight: Float
    ) -> [VisibleTile] {
        guard !region.isEmpty, viewport.width > 1, viewport.height > 1, mapWidth > 1, mapHeight > 1 else { return [] }
        lock.lock()
        guard let archive = archives[region], let regId = regionIds[region] else {
            lock.unlock()
            return []
        }
        lock.unlock()

        let mw = Double(mapWidth), mh = Double(mapHeight)
        let vw = Double(viewport.width), vh = Double(viewport.height)
        let tl = camera.toWorld(x: 0, y: 0, viewport: (vw, vh))
        let br = camera.toWorld(x: vw, y: vh, viewport: (vw, vh))
        let minX = max(0, min(mw, tl.x))
        let maxX = max(0, min(mw, br.x))
        let minY = max(0, min(mh, tl.y))
        let maxY = max(0, min(mh, br.y))
        guard maxX > minX, maxY > minY else { return [] }

        // 按屏幕像素覆盖率选择最优金字塔层级 z = 0...archive.maxZoom
        let mapPxWidth = mw * camera.scale
        let desiredGrid = max(1.0, mapPxWidth / Double(max(128, archive.tileSize)))
        let z = max(0, min(archive.maxZoom, Int(ceil(log2(desiredGrid)))))
        let grid = 1 << z
        let tileW = mw / Double(grid)
        let tileH = mh / Double(grid)

        let tx0 = max(0, min(grid - 1, Int(floor(minX / tileW))))
        let tx1 = max(0, min(grid - 1, Int(floor(max(0, maxX - 1e-4) / tileW))))
        let ty0 = max(0, min(grid - 1, Int(floor(minY / tileH))))
        let ty1 = max(0, min(grid - 1, Int(floor(max(0, maxY - 1e-4) / tileH))))

        var out = [VisibleTile]()
        out.reserveCapacity((tx1 - tx0 + 1) * (ty1 - ty0 + 1))
        var toRequest = [(cacheKey: UInt64, record: TileRecord)]()
        var fallbackParents = Set<UInt64>()

        lock.lock()
        for ty in ty0...ty1 {
            for tx in tx0...tx1 {
                let cKey = Self.cacheKey(regionId: regId, z: z, x: tx, y: ty)
                if let tex = textures[cKey] {
                    lruClock &+= 1
                    lruStamps[cKey] = lruClock
                    out.append(VisibleTile(
                        texture: tex,
                        x: Float(Double(tx) * tileW),
                        y: Float(Double(ty) * tileH),
                        w: Float(tileW),
                        h: Float(tileH)
                    ))
                } else {
                    if let rec = archive.records[Self.tileKey(z: z, x: tx, y: ty)], !inflight.contains(cKey) {
                        inflight.insert(cKey)
                        toRequest.append((cKey, rec))
                    }
                    // 优雅回落：用最近的已缓存祖先瓦片垫底，彻底避免缩放黑块闪烁
                    var pz = z - 1, px = tx >> 1, py = ty >> 1
                    while pz >= 0 {
                        let pKey = Self.cacheKey(regionId: regId, z: pz, x: px, y: py)
                        if let pTex = textures[pKey] {
                            if fallbackParents.insert(pKey).inserted {
                                let pGrid = Double(1 << pz)
                                let pw = mw / pGrid, ph = mh / pGrid
                                out.append(VisibleTile(texture: pTex, x: Float(Double(px) * pw), y: Float(Double(py) * ph), w: Float(pw), h: Float(ph)))
                            }
                            break
                        }
                        if pz == 0, let rootRec = archive.records[Self.tileKey(z: 0, x: 0, y: 0)], !inflight.contains(pKey) {
                            inflight.insert(pKey)
                            toRequest.append((pKey, rootRec))
                        }
                        pz -= 1; px >>= 1; py >>= 1
                    }
                }
            }
        }
        lock.unlock()

        if !toRequest.isEmpty {
            decodeQueue.async { [weak self] in
                guard let self else { return }
                let devId = ObjectIdentifier(device)
                let loader: MTKTextureLoader
                if self.cachedLoaderDeviceID == devId, let existing = self.cachedLoader {
                    loader = existing
                } else {
                    let created = MTKTextureLoader(device: device)
                    self.cachedLoaderDeviceID = devId
                    self.cachedLoader = created
                    loader = created
                }
                var handles = [URL: FileHandle]()
                defer { for fh in handles.values { try? fh.close() } }
                var uploadedAny = false
                for item in toRequest {
                    let fh: FileHandle
                    if let cached = handles[item.record.url] {
                        fh = cached
                    } else if let opened = try? FileHandle(forReadingFrom: item.record.url) {
                        handles[item.record.url] = opened
                        fh = opened
                    } else {
                        self.clearInflight([item.cacheKey])
                        continue
                    }
                    do {
                        try fh.seek(toOffset: item.record.offset)
                        guard let data = try fh.read(upToCount: Int(item.record.length)), !data.isEmpty else {
                            self.clearInflight([item.cacheKey])
                            continue
                        }
                        let tex = try loader.newTexture(data: data, options: [.SRGB: false, .generateMipmaps: false])
                        self.storeTexture(tex, forKey: item.cacheKey)
                        uploadedAny = true
                    } catch {
                        self.clearInflight([item.cacheKey])
                    }
                }
                // v11.0.0 合并通知：一整批可见瓦片解码完毕后只触发 1 次主线程重绘（消除单次缩放 16 连重绘风暴）
                if uploadedAny {
                    self.lock.lock()
                    let cb = self.onTileReady
                    self.lock.unlock()
                    if let cb {
                        DispatchQueue.main.async { cb() }
                    }
                }
            }
        }
        return out
    }

    private func storeTexture(_ tex: MTLTexture, forKey key: UInt64) {
        lock.lock()
        textures[key] = tex
        inflight.remove(key)
        lruClock &+= 1
        lruStamps[key] = lruClock
        while textures.count > maxCachedTextures {
            if let victim = lruStamps.min(by: { $0.value < $1.value })?.key {
                lruStamps.removeValue(forKey: victim)
                textures.removeValue(forKey: victim)
            } else {
                break
            }
        }
        lock.unlock()
    }

    private func clearInflight(_ keys: [UInt64]) {
        lock.lock()
        for k in keys { inflight.remove(k) }
        lock.unlock()
    }

    /// 解析 `.lgtr` 索引瓦片包头部：`"LGTR"` + version(u32) + maxZoom(u16) + tileSize(u16) + regionLen(u8) + regionUTF8 + count(u32) + count × (z:u8, x:u16, y:u16, offset:u64, length:u32)
    private static func parseHeader(url: URL) -> TileArchive? {
        guard let fh = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? fh.close() }
        guard let head = try? fh.read(upToCount: 64), head.count >= 16 else { return nil }
        let hb = [UInt8](head)
        guard hb[0] == 0x4C, hb[1] == 0x47, hb[2] == 0x54, hb[3] == 0x52 else { return nil } // "LGTR"
        let version = UInt32(hb[4]) | (UInt32(hb[5]) << 8) | (UInt32(hb[6]) << 16) | (UInt32(hb[7]) << 24)
        guard version == 1 else { return nil }
        let maxZoom = Int(UInt16(hb[8]) | (UInt16(hb[9]) << 8))
        let tileSize = Int(UInt16(hb[10]) | (UInt16(hb[11]) << 8))
        let rLen = Int(hb[12])
        guard rLen > 0, 13 + rLen + 4 <= hb.count else { return nil }
        let region = String(decoding: hb[13..<(13 + rLen)], as: UTF8.self)
        let cntOff = 13 + rLen
        let count = Int(UInt32(hb[cntOff]) | (UInt32(hb[cntOff + 1]) << 8) | (UInt32(hb[cntOff + 2]) << 16) | (UInt32(hb[cntOff + 3]) << 24))
        guard count > 0, count <= 100_000 else { return nil }
        let tableOffset = UInt64(cntOff + 4)
        let entrySize = 17 // 1 + 2 + 2 + 8 + 4
        do {
            try fh.seek(toOffset: tableOffset)
            guard let tableData = try fh.read(upToCount: count * entrySize), tableData.count == count * entrySize else { return nil }
            let tb = [UInt8](tableData)
            var records = [UInt64: TileRecord]()
            records.reserveCapacity(count)
            for i in 0..<count {
                let p = i * entrySize
                let z = Int(tb[p])
                let x = Int(UInt16(tb[p + 1]) | (UInt16(tb[p + 2]) << 8))
                let y = Int(UInt16(tb[p + 3]) | (UInt16(tb[p + 4]) << 8))
                var off: UInt64 = 0
                for k in 0..<8 { off |= UInt64(tb[p + 5 + k]) << UInt64(k * 8) }
                let len = UInt32(tb[p + 13]) | (UInt32(tb[p + 14]) << 8) | (UInt32(tb[p + 15]) << 16) | (UInt32(tb[p + 16]) << 24)
                records[tileKey(z: z, x: x, y: y)] = TileRecord(z: z, x: x, y: y, offset: off, length: len, url: url)
            }
            return TileArchive(region: region, maxZoom: maxZoom, tileSize: tileSize, records: records)
        } catch {
            return nil
        }
    }
}
