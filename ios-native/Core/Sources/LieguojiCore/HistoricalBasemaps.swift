import Foundation
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif

/// 真实历史地理底图分区（中原华夏、中国、欧洲、东亚与太平洋、日本列岛、地中海与欧亚、世界、自定义画布）。
public enum HistoricalRegion: String, Codable, CaseIterable, Sendable, Identifiable {
    case huaxia = "huaxia"
    case china = "china"
    case europe = "europe"
    case eastAsiaJapan = "east_asia_japan"
    case japanDetail = "japan_detail"
    case mediterranean = "mediterranean"
    case world = "world"
    case custom = "custom"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .huaxia: return "中原华夏精图"
        case .china: return "中国全图"
        case .europe: return "欧洲全图"
        case .eastAsiaJapan: return "东亚与太平洋"
        case .japanDetail: return "日本列岛精图"
        case .mediterranean: return "地中海与欧亚"
        case .world: return "世界全图"
        case .custom: return "自定义地图"
        }
    }

    public var subtitle: String {
        switch self {
        case .huaxia: return "中原·江南·巴蜀·塞北高精版图"
        case .china: return "中原、江南、巴蜀、塞北、西域与朝鲜半岛"
        case .europe: return "西欧、中东欧、巴尔干、不列颠、北欧与地中海"
        case .eastAsiaJapan: return "日本列岛、朝鲜、东亚大陆、中南半岛与吕宋海疆"
        case .japanDetail: return "九州·四国·本州·奥羽令制国精图"
        case .mediterranean: return "罗马·拜占庭·近东环海地图"
        case .world: return "五大洲四大洋完整格局 · 全球争霸舞台"
        case .custom: return "自定义绘制山海地形与历史势力"
        }
    }

    public var badge: String {
        switch self {
        case .huaxia: return "华夏"
        case .china: return "神州"
        case .europe: return "欧陆"
        case .eastAsiaJapan: return "东亚"
        case .japanDetail: return "扶桑"
        case .mediterranean: return "地中海"
        case .world: return "全球"
        case .custom: return "自绘"
        }
    }

    public var lonMin: Double {
        switch self {
        case .huaxia: return 95.5
        case .china: return 73.0
        case .europe: return -11.5
        case .eastAsiaJapan: return 92.0
        case .japanDetail: return 128.0
        case .mediterranean: return -10.0
        case .world: return -168.0
        case .custom: return 0.0
        }
    }

    public var lonMax: Double {
        switch self {
        case .huaxia: return 129.0
        case .china: return 136.0
        case .europe: return 46.5
        case .eastAsiaJapan: return 147.5
        case .japanDetail: return 146.5
        case .mediterranean: return 55.0
        case .world: return 176.0
        case .custom: return 100.0
        }
    }

    public var latMin: Double {
        switch self {
        case .huaxia: return 18.0
        case .china: return 17.5
        case .europe: return 34.5
        case .eastAsiaJapan: return 4.5
        case .japanDetail: return 30.0
        case .mediterranean: return 24.0
        case .world: return -55.0
        case .custom: return 0.0
        }
    }

    public var latMax: Double {
        switch self {
        case .huaxia: return 44.5
        case .china: return 54.0
        case .europe: return 67.5
        case .eastAsiaJapan: return 49.5
        case .japanDetail: return 46.0
        case .mediterranean: return 56.0
        case .world: return 72.0
        case .custom: return 100.0
        }
    }

    public var pad: Double {
        switch self {
        case .huaxia: return 0.025
        case .china: return 0.025
        case .europe: return 0.025
        case .eastAsiaJapan: return 0.025
        case .japanDetail: return 0.035
        case .mediterranean: return 0.025
        case .world: return 0.02
        case .custom: return 0.03
        }
    }
}

/// 真实世界地理底图投影、1:10m Natural Earth 离线 GIS 资源加载与高程场生成器。
public enum HistoricalBasemaps {
    /// 离线烘焙的历史剧本逐格归属与真实人口/工业密度数据（`scenarios_gis.bin`）。
    public struct BakedScenarioGIS: Sendable {
        public let id: String
        public let region: String
        public let nationCount: Int
        public let ownerMask: [Int8]
        public let popDensity: [UInt8]

        public init(id: String, region: String, nationCount: Int, ownerMask: [Int8], popDensity: [UInt8]) {
            self.id = id
            self.region = region
            self.nationCount = nationCount
            self.ownerMask = ownerMask
            self.popDensity = popDensity
        }
    }

    /// 全球 4,200 座真实中文地名城市库条目（`cities_zh.json`）。
    public struct GazetteerCity: Codable, Sendable {
        public let n: String
        public let lon: Double
        public let lat: Double
        public let pop: Double
        public let cap: Int
        public let iso: String

        public init(n: String, lon: Double, lat: Double, pop: Double, cap: Int, iso: String) {
            self.n = n
            self.lon = lon
            self.lat = lat
            self.pop = pop
            self.cap = cap
            self.iso = iso
        }
    }

    private struct BakedBasemap: Sendable {
        let name: String
        let lonMin: Double
        let lonMax: Double
        let latMin: Double
        let latMax: Double
        let pad: Double
        let heights: [UInt8]
    }

    private final class AtlasStore: @unchecked Sendable {
        private let lock = NSLock()
        private var basemaps: [String: BakedBasemap] = [:]
        private var scenarios: [String: BakedScenarioGIS] = [:]
        private var cities: [GazetteerCity] = []

        func mergeBasemaps(_ map: [String: BakedBasemap]) {
            lock.lock(); defer { lock.unlock() }
            for (k, v) in map {
                basemaps["\(k)@\(v.heights.count)"] = v
                if basemaps[k] == nil || v.heights.count == 19_928 { basemaps[k] = v }
            }
        }

        func mergeScenarios(_ map: [String: BakedScenarioGIS], cellCount: Int? = nil) {
            lock.lock(); defer { lock.unlock() }
            for (k, v) in map {
                let cnt = cellCount ?? v.ownerMask.count
                scenarios["\(k)@\(cnt)"] = v
                if scenarios[k] == nil || cnt == 19_928 { scenarios[k] = v }
            }
        }

        func setBasemaps(_ map: [String: BakedBasemap]) {
            lock.lock(); defer { lock.unlock() }
            for (k, v) in map {
                basemaps["\(k)@\(v.heights.count)"] = v
                basemaps[k] = v
            }
        }

        func setScenarios(_ map: [String: BakedScenarioGIS]) {
            lock.lock(); defer { lock.unlock() }
            for (k, v) in map {
                scenarios["\(k)@\(v.ownerMask.count)"] = v
                scenarios[k] = v
            }
        }

        func setCities(_ list: [GazetteerCity]) {
            lock.lock(); defer { lock.unlock() }
            if list.count >= cities.count { cities = list }
        }

        func basemap(for key: String, expectedCount: Int? = nil) -> BakedBasemap? {
            lock.lock(); defer { lock.unlock() }
            if let expectedCount, let exact = basemaps["\(key)@\(expectedCount)"] { return exact }
            return basemaps[key]
        }

        func scenario(for id: String, expectedCount: Int? = nil) -> BakedScenarioGIS? {
            lock.lock(); defer { lock.unlock() }
            if let expectedCount, let exact = scenarios["\(id)@\(expectedCount)"] { return exact }
            return scenarios[id]
        }

        func allCities() -> [GazetteerCity] {
            lock.lock(); defer { lock.unlock() }
            return cities
        }

        func hasBasemaps() -> Bool {
            lock.lock(); defer { lock.unlock() }
            return !basemaps.isEmpty
        }
    }

    private static let store = AtlasStore()

    /// 安全读取 `HistoricalAtlas` / `HDMeshes` / `Encyclopedia` 目录下的多分辨率底图、剧本 GIS 与 50,000+ 真实城市地名库。
    public static func loadAtlasDirectory(_ dirURL: URL) {
        for bmFile in ["basemaps.bin", "basemaps_60k.bin", "basemaps_120k.bin"] {
            let url = dirURL.appendingPathComponent(bmFile)
            if let data = try? Data(contentsOf: url), let parsed = parseBasemaps(data) {
                store.mergeBasemaps(parsed)
            }
        }
        for scFile in ["scenarios_gis.bin", "scenarios_gis_60k.bin", "scenarios_gis_120k.bin"] {
            let url = dirURL.appendingPathComponent(scFile)
            if let data = try? Data(contentsOf: url), let parsed = parseScenariosGIS(data) {
                store.mergeScenarios(parsed)
            }
        }
        for cityFile in ["cities_50k_zh.json", "cities_zh.json"] {
            let citiesURL = dirURL.appendingPathComponent(cityFile)
            if let data = try? Data(contentsOf: citiesURL),
               let decoded = try? JSONDecoder().decode([GazetteerCity].self, from: data),
               !decoded.isEmpty {
                // v8.0.0 严格保证加载的每一座城市名均为 100% 纯中文，彻底拦截外文残留
                let cleaned = decoded.map { c in
                    GazetteerCity(
                        n: NamingCatalog.enforceChinesePlaceName(c.n),
                        lon: c.lon, lat: c.lat, pop: c.pop, cap: c.cap, iso: c.iso
                    )
                }
                store.setCities(cleaned)
            }
        }
    }

    /// v8.0.0 区域历史剧本的真实地图外缘禁航判定（单位为地图画布像素坐标 `x in 0...width`, `y in 0...height`）：
    /// 彻底封堵区域底图边缘的假运河/假海岸（如欧洲东缘俄罗斯内陆边界、中国北缘西缘西伯利亚与西域边界、
    /// 地中海南缘撒哈拉边界），使舰队与渡海部队绝对不能绕行地图边缘或在假边界建港下海！
    public static func isBlockedTheaterSea(region: HistoricalRegion, x: Double, y: Double, width: Double, height: Double) -> Bool {
        guard region != .world && region != .custom else { return false }
        let nx = x / max(1.0, width)
        let ny = y / max(1.0, height)
        // 所有区域剧本的最外圈 2.6% 画幅边框一律作为不可通航地图边界，杜绝船只贴着地图框绕行
        if nx < 0.026 || nx > 0.974 || ny < 0.026 || ny > 0.974 { return true }
        switch region {
        case .europe:
            // 欧洲东缘（俄罗斯内陆乌拉尔线）、东北极地冻海与东南内陆边缘禁止假海岸下海
            if nx > 0.945 { return true }
            if ny < 0.055 && nx > 0.56 { return true }
            if ny > 0.92 && nx > 0.78 { return true }
            return false
        case .huaxia, .china:
            // 华夏/中国全图的北缘（漠北西伯利亚）与西缘（西域高原内陆）均为陆疆边界，绝不可下海
            if ny < 0.060 || nx < 0.060 { return true }
            if ny > 0.92 && nx < 0.30 { return true }
            return false
        case .eastAsiaJapan:
            // 东亚与太平洋的北缘（西伯利亚内陆）与西缘（青藏/印度内陆）严禁假海岸通航
            if ny < 0.055 || nx < 0.055 { return true }
            return false
        case .mediterranean:
            // 地中海的北缘（北欧陆地）、东缘（波斯内陆）与南缘（撒哈拉腹地）均为陆疆边界
            if ny < 0.055 || nx > 0.945 || ny > 0.940 { return true }
            return false
        case .japanDetail:
            return false
        case .world, .custom:
            return false
        }
    }

    public static func registerBakedScenario(_ gis: BakedScenarioGIS, cellCount: Int? = nil) {
        store.mergeScenarios([gis.id: gis], cellCount: cellCount)
    }

    public static func bakedScenarioGIS(id: String, expectedCount: Int? = nil) -> BakedScenarioGIS? {
        store.scenario(for: id, expectedCount: expectedCount)
    }

    public static func globalCities() -> [GazetteerCity] {
        store.allCities()
    }

    public static func hasBakedAtlas() -> Bool {
        store.hasBasemaps()
    }

    public static func bakedHeights(region: HistoricalRegion, expectedCount: Int) -> [UInt8]? {
        guard let bm = store.basemap(for: region.rawValue, expectedCount: expectedCount), bm.heights.count == expectedCount else { return nil }
        return bm.heights
    }

    private static func readUInt16LE(_ bytes: [UInt8], at offset: inout Int) -> UInt16? {
        guard offset + 2 <= bytes.count else { return nil }
        let v = UInt16(bytes[offset]) | (UInt16(bytes[offset + 1]) << 8)
        offset += 2
        return v
    }

    private static func readUInt32LE(_ bytes: [UInt8], at offset: inout Int) -> UInt32? {
        guard offset + 4 <= bytes.count else { return nil }
        let v = UInt32(bytes[offset])
            | (UInt32(bytes[offset + 1]) << 8)
            | (UInt32(bytes[offset + 2]) << 16)
            | (UInt32(bytes[offset + 3]) << 24)
        offset += 4
        return v
    }

    private static func readDoubleLE(_ bytes: [UInt8], at offset: inout Int) -> Double? {
        guard offset + 8 <= bytes.count else { return nil }
        var bits: UInt64 = 0
        for i in 0..<8 {
            bits |= UInt64(bytes[offset + i]) << UInt64(i * 8)
        }
        offset += 8
        let val = Double(bitPattern: bits)
        return val.isFinite ? val : nil
    }

    private static func readUTF8(_ bytes: [UInt8], length: Int, at offset: inout Int) -> String? {
        guard length >= 0, offset + length <= bytes.count else { return nil }
        let slice = bytes[offset..<(offset + length)]
        offset += length
        return String(decoding: slice, as: UTF8.self)
    }

    private static func parseBasemaps(_ data: Data) -> [String: BakedBasemap]? {
        let bytes = [UInt8](data)
        guard bytes.count >= 16,
              bytes[0] == 0x4C, bytes[1] == 0x47, bytes[2] == 0x41, bytes[3] == 0x42 else { return nil } // "LGAB"
        var o = 4
        guard let version = readUInt32LE(bytes, at: &o), version == 1,
              let regionCount = readUInt32LE(bytes, at: &o), regionCount <= 64,
              let cellCountU32 = readUInt32LE(bytes, at: &o), cellCountU32 > 0, cellCountU32 <= 250_000 else {
            return nil
        }
        let cellCount = Int(cellCountU32)
        var out = [String: BakedBasemap]()
        out.reserveCapacity(Int(regionCount))
        for _ in 0..<regionCount {
            guard o < bytes.count else { return nil }
            let nameLen = Int(bytes[o]); o += 1
            guard let name = readUTF8(bytes, length: nameLen, at: &o),
                  let lonMin = readDoubleLE(bytes, at: &o),
                  let lonMax = readDoubleLE(bytes, at: &o),
                  let latMin = readDoubleLE(bytes, at: &o),
                  let latMax = readDoubleLE(bytes, at: &o),
                  let pad = readDoubleLE(bytes, at: &o),
                  o + cellCount <= bytes.count else {
                return nil
            }
            let heights = Array(bytes[o..<(o + cellCount)])
            o += cellCount
            out[name] = BakedBasemap(name: name, lonMin: lonMin, lonMax: lonMax, latMin: latMin, latMax: latMax, pad: pad, heights: heights)
        }
        return out
    }

    private static func parseScenariosGIS(_ data: Data) -> [String: BakedScenarioGIS]? {
        let bytes = [UInt8](data)
        guard bytes.count >= 16,
              bytes[0] == 0x4C, bytes[1] == 0x47, bytes[2] == 0x48, bytes[3] == 0x53 else { return nil } // "LGHS"
        var o = 4
        guard let version = readUInt32LE(bytes, at: &o), version == 1,
              let count = readUInt32LE(bytes, at: &o), count <= 256,
              let cellCountU32 = readUInt32LE(bytes, at: &o), cellCountU32 > 0, cellCountU32 <= 250_000 else {
            return nil
        }
        let cellCount = Int(cellCountU32)
        var out = [String: BakedScenarioGIS]()
        out.reserveCapacity(Int(count))
        for _ in 0..<count {
            guard o < bytes.count else { return nil }
            let idLen = Int(bytes[o]); o += 1
            guard let id = readUTF8(bytes, length: idLen, at: &o), o < bytes.count else { return nil }
            let regionLen = Int(bytes[o]); o += 1
            guard let region = readUTF8(bytes, length: regionLen, at: &o),
                  let nationCountU16 = readUInt16LE(bytes, at: &o),
                  o + cellCount * 2 <= bytes.count else {
                return nil
            }
            var owners = [Int8]()
            owners.reserveCapacity(cellCount)
            for idx in o..<(o + cellCount) {
                owners.append(Int8(bitPattern: bytes[idx]))
            }
            o += cellCount
            let popDensity = Array(bytes[o..<(o + cellCount)])
            o += cellCount
            out[id] = BakedScenarioGIS(id: id, region: region, nationCount: Int(nationCountU16), ownerMask: owners, popDensity: popDensity)
        }
        return out
    }
    private struct ProjectionFrame: Sendable {
        let lonMin: Double
        let latMax: Double
        let cosScale: Double
        let scale: Double
        let originX: Double
        let originY: Double
    }

    private struct GeoPolygon: Sendable {
        let lons: [Double]
        let lats: [Double]
        let minLon: Double
        let maxLon: Double
        let minLat: Double
        let maxLat: Double

        init(_ vertices: [(Double, Double)]) {
            var xs = [Double]()
            var ys = [Double]()
            xs.reserveCapacity(vertices.count)
            ys.reserveCapacity(vertices.count)
            var loX = Double.infinity
            var hiX = -Double.infinity
            var loY = Double.infinity
            var hiY = -Double.infinity
            for (lon, lat) in vertices {
                xs.append(lon)
                ys.append(lat)
                if lon < loX { loX = lon }
                if lon > hiX { hiX = lon }
                if lat < loY { loY = lat }
                if lat > hiY { hiY = lat }
            }
            self.lons = xs
            self.lats = ys
            self.minLon = loX
            self.maxLon = hiX
            self.minLat = loY
            self.maxLat = hiY
        }

        func contains(lon: Double, lat: Double) -> Bool {
            guard lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat else { return false }
            let n = lons.count
            guard n >= 3 else { return false }
            var inside = false
            var j = n - 1
            for i in 0..<n {
                let yi = lats[i], yj = lats[j]
                if (yi > lat) != (yj > lat) {
                    let xi = lons[i], xj = lons[j]
                    let xIntersect = (xj - xi) * (lat - yi) / (yj - yi) + xi
                    if lon < xIntersect {
                        inside.toggle()
                    }
                }
                j = i
            }
            return inside
        }

        /// 点到多边形边界的最短距离平方（以经度乘 `cosScale` 后的近似球面度为单位），超出 `limitSq` 直接跳过。
        func minEdgeDistanceSq(lon: Double, lat: Double, cosScale: Double, limitDeg: Double) -> Double {
            guard lon >= minLon - limitDeg / max(0.25, cosScale),
                  lon <= maxLon + limitDeg / max(0.25, cosScale),
                  lat >= minLat - limitDeg,
                  lat <= maxLat + limitDeg else {
                return Double.infinity
            }
            let n = lons.count
            guard n >= 2 else { return Double.infinity }
            var best = Double.infinity
            let px = lon * cosScale
            let py = lat
            var j = n - 1
            for i in 0..<n {
                let ax = lons[j] * cosScale, ay = lats[j]
                let bx = lons[i] * cosScale, by = lats[i]
                let abx = bx - ax, aby = by - ay
                let abLenSq = abx * abx + aby * aby
                let dSq: Double
                if abLenSq < 1e-12 {
                    let dx = px - ax, dy = py - ay
                    dSq = dx * dx + dy * dy
                } else {
                    let t = max(0.0, min(1.0, ((px - ax) * abx + (py - ay) * aby) / abLenSq))
                    let cx = ax + abx * t, cy = ay + aby * t
                    let dx = px - cx, dy = py - cy
                    dSq = dx * dx + dy * dy
                }
                if dSq < best { best = dSq }
                j = i
            }
            return best
        }
    }

    private struct MountainRange: Sendable {
        let lon: Double
        let lat: Double
        let radiusLon: Double
        let radiusLat: Double
        let peak: Double
    }

    private struct RegionGeometry: Sendable {
        let landPolygons: [GeoPolygon]
        let seaHolePolygons: [GeoPolygon]
        let mountainRanges: [MountainRange]
        let coastBandDeg: Double
        let warpAmpDeg: Double
        let cosScale: Double
    }

    private static func frame(region: HistoricalRegion, width: Double, height: Double) -> ProjectionFrame {
        let w = max(1.0, width)
        let h = max(1.0, height)
        let baked = store.basemap(for: region.rawValue)
        let lonMin = baked?.lonMin ?? region.lonMin
        let lonMax = baked?.lonMax ?? region.lonMax
        let latMin = baked?.latMin ?? region.latMin
        let latMax = baked?.latMax ?? region.latMax
        let pad = baked?.pad ?? region.pad
        let cosScale: Double
        if region == .custom {
            cosScale = 1.0
        } else if region == .world {
            cosScale = 0.86
        } else {
            let midLat = (latMin + latMax) * 0.5
            cosScale = max(0.25, cos(midLat * Double.pi / 180.0))
        }
        let spanX = max(1e-6, (lonMax - lonMin) * cosScale)
        let spanY = max(1e-6, latMax - latMin)
        let marginX = w * pad
        let marginY = h * pad
        let availW = max(1.0, w - marginX * 2.0)
        let availH = max(1.0, h - marginY * 2.0)
        let scale = min(availW / spanX, availH / spanY)
        let usedW = spanX * scale
        let usedH = spanY * scale
        let originX = (w - usedW) * 0.5
        let originY = (h - usedH) * 0.5
        return ProjectionFrame(
            lonMin: lonMin,
            latMax: latMax,
            cosScale: cosScale,
            scale: scale,
            originX: originX,
            originY: originY
        )
    }

    /// 将真实经纬度 `(lon, lat)` 投影到地图画布坐标 `(x, y)`（与 `bake_v600_atlas.mjs` 逐位一致）。
    public static func project(lon: Double, lat: Double, region: HistoricalRegion, width: Double, height: Double) -> (x: Double, y: Double) {
        let f = frame(region: region, width: width, height: height)
        let x = f.originX + (lon - f.lonMin) * f.cosScale * f.scale
        let y = f.originY + (f.latMax - lat) * f.scale
        return (x, y)
    }

    /// 将地图画布坐标 `(x, y)` 反算回真实经纬度 `(lon, lat)`。
    public static func unproject(x: Double, y: Double, region: HistoricalRegion, width: Double, height: Double) -> (lon: Double, lat: Double) {
        let f = frame(region: region, width: width, height: height)
        let lon = f.lonMin + (x - f.originX) / (f.cosScale * f.scale)
        let lat = f.latMax - (y - f.originY) / f.scale
        return (lon, lat)
    }

    /// 按历史地理底图生成高程数组（`0...100`，`< 20` 为海，`>= 20` 为陆）：
    /// 优先返回离线烘焙的 1:10m Natural Earth 真地形 `basemaps.bin`，未载入或点数不符时优雅回退至内置程序几何。
    public static func generateHeights(region: HistoricalRegion, points: [(Double, Double)], width: Double, height: Double) -> [UInt8] {
        guard !points.isEmpty else { return [] }
        if region == .custom {
            return generateCustomCanvasHeights(points: points, width: width, height: height)
        }
        if let baked = bakedHeights(region: region, expectedCount: points.count) {
            return baked
        }
        let geom = geometry(for: region)
        let f = frame(region: region, width: width, height: height)
        let invScale = 1.0 / f.scale
        let invLonScale = 1.0 / (f.cosScale * f.scale)
        let coastBand = geom.coastBandDeg
        let warpAmp = geom.warpAmpDeg
        let cosScale = geom.cosScale

        var out = [UInt8](repeating: 4, count: points.count)
        for i in points.indices {
            let px = points[i].0
            let py = points[i].1
            let rawLon = f.lonMin + (px - f.originX) * invLonScale
            let rawLat = f.latMax - (py - f.originY) * invScale

            // 极轻微的确定性海岸自然起伏扰动，既柔化多边形折线，又绝不封死狭窄海峡
            let wLon = (sin(rawLat * 1.9 + rawLon * 0.7) * 0.6 + cos(rawLat * 4.3 - rawLon * 2.9) * 0.4) * warpAmp
            let wLat = (cos(rawLon * 1.7 - rawLat * 0.9) * 0.6 + sin(rawLon * 3.9 + rawLat * 3.1) * 0.4) * warpAmp
            let lon = rawLon + wLon
            let lat = rawLat + wLat

            var isLand = false
            for poly in geom.landPolygons {
                if poly.contains(lon: lon, lat: lat) {
                    isLand = true
                    break
                }
            }
            if isLand {
                for hole in geom.seaHolePolygons {
                    if hole.contains(lon: lon, lat: lat) {
                        isLand = false
                        break
                    }
                }
            }

            // 计算到最近海岸线（或内海湖岸）的平滑距离
            var minDistSq = Double.infinity
            for poly in geom.landPolygons {
                let dSq = poly.minEdgeDistanceSq(lon: lon, lat: lat, cosScale: cosScale, limitDeg: coastBand)
                if dSq < minDistSq { minDistSq = dSq }
            }
            for hole in geom.seaHolePolygons {
                let dSq = hole.minEdgeDistanceSq(lon: lon, lat: lat, cosScale: cosScale, limitDeg: coastBand)
                if dSq < minDistSq { minDistSq = dSq }
            }
            let dist = minDistSq.isFinite ? minDistSq.squareRoot() : coastBand

            // 柔和确定性地形微起伏（±4）
            let relief = sin(rawLon * 0.85 + rawLat * 1.15) * 2.1
                + cos(rawLon * 2.1 - rawLat * 1.7) * 1.3
                + sin(rawLon * 4.7 + rawLat * 5.3) * 0.6

            if !isLand {
                // 近岸浅海陆架渐变（18 → 2），配合宋代古舆图水波海岸渲染
                let t = min(1.0, dist / coastBand)
                let shelf = 18.2 - pow(t, 0.72) * 16.0 + relief * 0.25
                out[i] = UInt8(max(2, min(18, Int(shelf.rounded()))))
            } else {
                // 沿海低地平原（23…36）+ 真实造山带高斯隆起（最高至 92 雪峰）
                let inland = min(1.0, dist / (coastBand * 0.85))
                var elev = 23.5 + inland * 11.5 + relief
                for m in geom.mountainRanges {
                    let dx = (rawLon - m.lon) / m.radiusLon
                    let dy = (rawLat - m.lat) / m.radiusLat
                    let r2 = dx * dx + dy * dy
                    if r2 < 9.0 {
                        elev += m.peak * exp(-0.5 * r2)
                    }
                }
                out[i] = UInt8(max(21, min(92, Int(elev.rounded()))))
            }
        }
        return out
    }

    public static func generateHeights(region: HistoricalRegion, graph: TerrainGraph) -> [UInt8] {
        if region != .custom, let baked = bakedHeights(region: region, expectedCount: graph.points.count) {
            return baked
        }
        var heights = generateHeights(region: region, points: graph.points, width: graph.width, height: graph.height)
        if region != .custom {
            removeMicroSpeckles(&heights, neighbors: graph.neighbors, minCells: 4)
        }
        return heights
    }

    public static func generateHeights(region: HistoricalRegion, document: TerrainDocument) -> [UInt8] {
        if region != .custom, let baked = bakedHeights(region: region, expectedCount: document.points.count) {
            return baked
        }
        var heights = generateHeights(region: region, points: document.points, width: document.width, height: document.height)
        if region != .custom {
            removeMicroSpeckles(&heights, neighbors: document.neighbors, minCells: 4)
        }
        return heights
    }

    /// 清理极小（< minCells 格）的纯多边形尖角噪点碎格，同时完整保留全部真实大小岛屿。
    private static func removeMicroSpeckles(_ heights: inout [UInt8], neighbors: [[Int]], minCells: Int) {
        let n = min(heights.count, neighbors.count)
        guard n > 0 else { return }
        var visited = [Bool](repeating: false, count: n)
        for i in 0..<n where !visited[i] && heights[i] >= 20 {
            var comp = [i]
            visited[i] = true
            var head = 0
            while head < comp.count {
                let u = comp[head]
                head += 1
                for v in neighbors[u] where v >= 0 && v < n && !visited[v] && heights[v] >= 20 {
                    visited[v] = true
                    comp.append(v)
                }
            }
            if comp.count < minCells {
                for u in comp { heights[u] = 17 }
            }
        }
    }

    private static func generateCustomCanvasHeights(points: [(Double, Double)], width: Double, height: Double) -> [UInt8] {
        let w = max(1.0, width), h = max(1.0, height)
        var out = [UInt8](repeating: 10, count: points.count)
        for i in points.indices {
            let ux = (points[i].0 / w - 0.5) * 2.0
            let uy = (points[i].1 / h - 0.5) * 2.0
            let wave = sin(ux * 3.8 + uy * 2.4) * 0.08 + cos(ux * 2.1 - uy * 4.2) * 0.06
            let r = (ux * ux * 1.15 + uy * uy * 1.45).squareRoot() + wave
            if r < 0.72 {
                let elev = 26.0 + (0.72 - r) * 34.0 + sin(ux * 7.0) * cos(uy * 6.0) * 5.0
                out[i] = UInt8(max(22, min(78, Int(elev.rounded()))))
            } else {
                let d = min(1.0, (r - 0.72) / 0.45)
                out[i] = UInt8(max(3, min(18, Int((18.0 - d * 15.0).rounded()))))
            }
        }
        return out
    }

    // MARK: - 四大真实世界历史底图多边形、内海与山脉几何库

    private static func geometry(for region: HistoricalRegion) -> RegionGeometry {
        switch region {
        case .huaxia, .china: return chinaGeometry
        case .europe, .mediterranean: return europeGeometry
        case .eastAsiaJapan, .japanDetail: return eastAsiaJapanGeometry
        case .world: return worldGeometry
        case .custom: return chinaGeometry
        }
    }

    // 1. 中国全图（神州本体 + 辽东/山东/雷州半岛 + 海南 + 台湾 + 朝鲜半岛 + 蒙古高原 + 藏疆 + 九州东缘）
    private static let chinaGeometry: RegionGeometry = {
        let mainland: [(Double, Double)] = [
            // 西北至北疆（帕米尔 → 准噶尔 → 阿尔泰 → 漠北 → 外兴安岭/黑龙江）
            (73.2, 39.0), (74.5, 41.2), (79.5, 44.5), (82.5, 47.0), (87.5, 49.5),
            (92.0, 51.2), (99.0, 52.5), (107.0, 53.6), (115.0, 53.8), (122.0, 54.0),
            (129.0, 53.2), (135.2, 52.0), (137.8, 49.0), (136.5, 45.8), (134.8, 43.5),
            (131.8, 42.9), (130.6, 42.3),
            // 朝鲜半岛东岸 → 南岸 → 西岸
            (129.2, 40.9), (127.6, 39.2), (129.3, 37.6), (129.5, 35.8), (129.1, 35.1),
            (127.6, 34.6), (126.3, 34.4), (126.3, 35.7), (126.6, 37.5), (125.2, 38.0),
            (125.4, 39.5), (124.3, 39.9),
            // 辽东半岛与渤海湾
            (123.1, 39.6), (121.6, 38.8), (121.3, 39.3), (122.2, 40.5), (121.0, 40.9),
            (119.7, 39.9), (117.7, 39.0), (118.8, 37.9), (119.2, 37.1),
            // 山东半岛
            (120.7, 37.8), (122.6, 37.4), (121.6, 36.7), (120.3, 36.0), (119.3, 35.0),
            // 苏北 → 长江口 → 杭州湾 → 浙闽粤海岸
            (119.8, 34.2), (120.9, 32.7), (121.9, 31.3), (120.8, 30.3), (122.0, 29.8),
            (121.5, 28.4), (120.7, 27.5), (119.8, 26.2), (118.6, 24.6), (116.7, 23.3),
            (114.6, 22.6), (113.5, 22.2), (111.3, 21.4),
            // 雷州半岛与北部湾
            (110.5, 20.2), (109.7, 20.5), (109.2, 21.5), (108.0, 21.5),
            // 交趾（北越）→ 滇南 → 喜马拉雅南缘 → 喀喇昆仑
            (106.7, 20.8), (105.9, 19.6), (106.4, 18.0), (103.5, 18.5), (101.0, 20.6),
            (98.5, 22.2), (97.2, 24.8), (94.0, 26.8), (89.0, 27.3), (84.0, 28.3),
            (80.0, 30.2), (76.5, 33.2), (74.0, 36.0),
        ]
        let taiwan: [(Double, Double)] = [
            (121.5, 25.3), (122.0, 24.9), (121.6, 23.8), (121.1, 22.6), (120.8, 21.9),
            (120.2, 22.6), (120.0, 23.5), (120.4, 24.5), (121.0, 25.1),
        ]
        let hainan: [(Double, Double)] = [
            (110.3, 20.1), (111.0, 19.6), (110.5, 18.7), (109.6, 18.2),
            (108.7, 18.6), (108.6, 19.4), (109.5, 19.9),
        ]
        let kyushu: [(Double, Double)] = [
            (130.8, 33.9), (131.7, 33.2), (131.5, 31.8), (130.6, 31.1),
            (129.8, 31.8), (129.6, 33.1), (130.2, 33.7),
        ]
        let qinghaiLake: [(Double, Double)] = [
            (99.6, 37.2), (100.7, 37.1), (100.8, 36.6), (99.8, 36.5),
        ]
        let baikal: [(Double, Double)] = [
            (103.8, 51.6), (105.5, 52.0), (107.6, 53.0), (109.2, 54.6),
            (108.4, 54.9), (106.5, 53.4), (104.5, 52.3),
        ]
        let mountains: [MountainRange] = [
            // 青藏高原主体与喜马拉雅
            MountainRange(lon: 88.5, lat: 32.5, radiusLon: 9.5, radiusLat: 4.0, peak: 42),
            MountainRange(lon: 85.0, lat: 28.8, radiusLon: 7.5, radiusLat: 1.9, peak: 34),
            MountainRange(lon: 95.5, lat: 30.8, radiusLon: 5.0, radiusLat: 2.8, peak: 32),
            // 昆仑山、祁连山、天山、阿尔泰
            MountainRange(lon: 84.0, lat: 36.4, radiusLon: 7.0, radiusLat: 1.5, peak: 34),
            MountainRange(lon: 98.5, lat: 37.8, radiusLon: 4.2, radiusLat: 1.3, peak: 28),
            MountainRange(lon: 83.5, lat: 42.8, radiusLon: 7.5, radiusLat: 1.4, peak: 34),
            MountainRange(lon: 90.0, lat: 47.6, radiusLon: 4.5, radiusLat: 1.8, peak: 26),
            // 横断山脉与云贵高原
            MountainRange(lon: 100.2, lat: 28.5, radiusLon: 2.3, radiusLat: 3.6, peak: 34),
            MountainRange(lon: 104.5, lat: 25.8, radiusLon: 3.8, radiusLat: 2.0, peak: 18),
            // 秦岭、大巴山、太行山、燕山
            MountainRange(lon: 108.5, lat: 33.6, radiusLon: 3.8, radiusLat: 1.0, peak: 26),
            MountainRange(lon: 113.6, lat: 37.8, radiusLon: 1.4, radiusLat: 2.6, peak: 20),
            MountainRange(lon: 117.5, lat: 40.8, radiusLon: 2.8, radiusLat: 1.1, peak: 18),
            // 南岭、武夷山、江南丘陵
            MountainRange(lon: 113.0, lat: 25.2, radiusLon: 3.6, radiusLat: 1.2, peak: 18),
            MountainRange(lon: 117.5, lat: 26.8, radiusLon: 1.8, radiusLat: 2.2, peak: 20),
            // 大兴安岭、长白山、杭爱山
            MountainRange(lon: 121.2, lat: 48.0, radiusLon: 2.0, radiusLat: 3.8, peak: 22),
            MountainRange(lon: 128.0, lat: 42.2, radiusLon: 2.2, radiusLat: 1.8, peak: 24),
            MountainRange(lon: 100.0, lat: 47.2, radiusLon: 4.5, radiusLat: 1.6, peak: 22),
            // 台湾中央山脉
            MountainRange(lon: 121.1, lat: 23.7, radiusLon: 0.6, radiusLat: 1.3, peak: 26),
        ]
        return RegionGeometry(
            landPolygons: [GeoPolygon(mainland), GeoPolygon(taiwan), GeoPolygon(hainan), GeoPolygon(kyushu)],
            seaHolePolygons: [GeoPolygon(qinghaiLake), GeoPolygon(baikal)],
            mountainRanges: mountains,
            coastBandDeg: 3.6,
            warpAmpDeg: 0.08,
            cosScale: cos(35.75 * Double.pi / 180.0)
        )
    }()

    // 2. 欧洲全图（伊比利亚、法兰西、低地、日耳曼、波兰、西俄、意大利+西西里+撒丁+科西嘉、巴尔干+希腊+克里特、小亚细亚、不列颠+爱尔兰、斯堪的纳维亚+日德兰+冰岛、北非岸带）
    private static let europeGeometry: RegionGeometry = {
        let europeMain: [(Double, Double)] = [
            // 伊比利亚大西洋岸 → 比斯开湾 → 布列塔尼 → 诺曼底 → 低地 → 德国北海岸
            (-9.0, 37.0), (-9.4, 38.7), (-8.9, 41.2), (-9.3, 43.1), (-7.0, 43.6),
            (-2.0, 43.4), (-1.2, 45.6), (-2.3, 47.2), (-4.7, 48.4), (-1.8, 49.7),
            (0.2, 49.5), (1.8, 51.0), (4.3, 52.3), (6.5, 53.5), (8.6, 53.9),
            // 日德兰半岛（丹麦）
            (8.2, 55.5), (8.5, 57.1), (10.6, 57.7), (10.8, 55.4), (9.9, 54.4),
            // 波罗的海南岸（北德 → 波兰 → 波罗的海三国 → 圣彼得堡）
            (12.2, 54.2), (14.6, 53.9), (18.6, 54.4), (21.0, 55.7), (24.0, 57.0),
            (24.7, 59.5), (29.8, 60.0),
            // 芬兰湾北岸 → 波的尼亚湾 → 瑞典东岸与南端 → 挪威峡湾 → 北角 → 科拉与白海
            (28.0, 60.5), (24.9, 60.2), (21.3, 60.6), (21.4, 63.0), (25.0, 65.5),
            (21.4, 64.6), (17.6, 61.1), (18.2, 59.3), (16.4, 56.2), (13.0, 55.4),
            (12.0, 57.7), (10.7, 59.9), (6.8, 58.0), (5.1, 60.4), (6.2, 62.5),
            (10.3, 63.5), (14.4, 67.2), (18.8, 69.5), (25.8, 70.6), (31.0, 69.8),
            (38.5, 68.4), (43.5, 66.4), (48.5, 67.8),
            // 东界（西俄罗斯 → 伏尔加 → 高加索 → 黑海东岸 → 亚速海 → 克里米亚 → 黑海西岸）
            (50.5, 61.0), (50.5, 52.0), (48.5, 45.8), (47.5, 42.0), (45.2, 39.6),
            (41.6, 41.6), (39.7, 43.6), (37.4, 44.9), (39.2, 47.1), (36.6, 45.3),
            (34.1, 44.4), (32.5, 45.4), (33.5, 46.2), (30.7, 46.5), (28.7, 44.2),
            (27.9, 42.5), (28.9, 41.2),
            // 色雷斯 → 希腊半岛与伯罗奔尼撒 → 亚得里亚海东岸（达尔马提亚）
            (26.0, 40.6), (23.0, 40.5), (22.9, 39.2), (24.0, 37.7), (22.5, 36.5),
            (21.2, 37.8), (20.0, 39.8), (19.3, 41.5), (16.4, 43.5), (13.6, 45.5),
            // 意大利靴形半岛
            (12.3, 45.4), (12.6, 44.1), (14.3, 42.5), (16.2, 41.9), (18.5, 40.1),
            (17.2, 40.4), (16.0, 38.0), (15.8, 39.8), (14.2, 40.8), (12.2, 41.8),
            (10.3, 43.6), (8.9, 44.4),
            // 法南普罗旺斯 → 加泰罗尼亚 → 直布罗陀
            (7.3, 43.7), (5.3, 43.3), (3.1, 42.5), (2.2, 41.4), (0.0, 39.5),
            (-0.7, 37.6), (-5.4, 36.0), (-6.3, 36.5),
        ]
        // 小亚细亚（安纳托利亚）：西隔博斯普鲁斯与爱琴海，东连高加索
        let anatolia: [(Double, Double)] = [
            (29.3, 41.1), (32.5, 41.8), (36.4, 41.4), (41.6, 41.6), (45.2, 40.5),
            (46.0, 37.0), (41.5, 36.5), (36.2, 36.4), (34.4, 36.7), (30.7, 36.7),
            (27.2, 36.9), (26.7, 38.5), (26.2, 40.0), (27.8, 40.5),
        ]
        let greatBritain: [(Double, Double)] = [
            (-5.6, 50.1), (-3.5, 50.4), (-1.1, 50.7), (1.4, 51.1), (1.8, 52.6),
            (0.2, 53.5), (-0.2, 54.4), (-1.6, 55.6), (-2.1, 56.8), (-1.8, 57.7),
            (-3.2, 58.6), (-5.1, 58.6), (-5.9, 57.1), (-5.5, 55.4), (-4.7, 54.8),
            (-3.1, 53.4), (-4.8, 53.2), (-5.3, 51.8), (-4.4, 51.1),
        ]
        let ireland: [(Double, Double)] = [
            (-9.8, 51.5), (-7.2, 52.1), (-6.0, 52.3), (-6.1, 53.6), (-5.5, 54.6),
            (-6.2, 55.3), (-8.2, 55.2), (-10.1, 54.2), (-10.4, 52.9), (-10.2, 51.8),
        ]
        let iceland: [(Double, Double)] = [
            (-23.8, 64.0), (-20.0, 63.4), (-15.0, 64.2), (-13.5, 65.4),
            (-16.0, 66.5), (-22.0, 66.3), (-24.2, 65.4),
        ]
        let sicily: [(Double, Double)] = [
            (12.4, 37.8), (14.2, 38.1), (15.6, 38.2), (15.3, 36.7), (13.6, 37.1), (12.5, 37.5),
        ]
        let sardinia: [(Double, Double)] = [
            (8.2, 41.2), (9.6, 41.2), (9.9, 39.8), (9.5, 38.9), (8.3, 39.0), (8.1, 40.3),
        ]
        let corsica: [(Double, Double)] = [
            (8.4, 43.0), (9.8, 43.1), (9.9, 41.4), (8.7, 41.2), (8.2, 42.1),
        ]
        let crete: [(Double, Double)] = [
            (23.4, 35.7), (26.5, 35.6), (26.6, 34.8), (23.5, 34.8),
        ]
        let cyprus: [(Double, Double)] = [
            (32.0, 35.3), (34.8, 35.7), (34.4, 34.6), (32.2, 34.4),
        ]
        let zealand: [(Double, Double)] = [
            (10.8, 56.1), (12.9, 56.2), (12.8, 55.0), (11.0, 54.9),
        ]
        // 北非地中海南岸（摩洛哥 → 阿尔及利亚 → 突尼斯 → 利比亚），完整衬托地中海海域
        let northAfrica: [(Double, Double)] = [
            (-10.5, 32.0), (-9.6, 33.8), (-6.0, 35.8), (-2.0, 35.2), (3.1, 36.8),
            (8.5, 37.0), (10.6, 37.2), (11.2, 35.0), (11.5, 33.4), (15.0, 32.6),
            (20.0, 32.6), (25.5, 32.0), (25.5, 30.8), (-10.5, 30.8),
        ]
        let mountains: [MountainRange] = [
            // 阿尔卑斯山脉（西、中、东）
            MountainRange(lon: 7.5, lat: 45.8, radiusLon: 2.3, radiusLat: 1.1, peak: 44),
            MountainRange(lon: 11.5, lat: 46.8, radiusLon: 3.0, radiusLat: 1.0, peak: 44),
            MountainRange(lon: 14.5, lat: 47.1, radiusLon: 2.0, radiusLat: 0.9, peak: 34),
            // 比利牛斯、亚平宁、伊比利亚高原
            MountainRange(lon: 0.5, lat: 42.7, radiusLon: 2.4, radiusLat: 0.65, peak: 34),
            MountainRange(lon: 13.0, lat: 42.3, radiusLon: 1.3, radiusLat: 2.4, peak: 24),
            MountainRange(lon: -4.0, lat: 40.2, radiusLon: 3.2, radiusLat: 1.8, peak: 20),
            // 喀尔巴阡山脉与巴尔干山脉
            MountainRange(lon: 22.8, lat: 48.2, radiusLon: 2.8, radiusLat: 1.2, peak: 28),
            MountainRange(lon: 25.0, lat: 45.7, radiusLon: 2.2, radiusLat: 1.2, peak: 28),
            MountainRange(lon: 19.5, lat: 43.0, radiusLon: 2.6, radiusLat: 1.6, peak: 26),
            MountainRange(lon: 22.0, lat: 39.8, radiusLon: 1.8, radiusLat: 1.6, peak: 22),
            // 斯堪的纳维亚山脉
            MountainRange(lon: 8.5, lat: 61.5, radiusLon: 2.2, radiusLat: 2.4, peak: 32),
            MountainRange(lon: 15.0, lat: 66.2, radiusLon: 2.5, radiusLat: 2.8, peak: 34),
            // 高加索山脉与安纳托利亚高原
            MountainRange(lon: 43.5, lat: 42.8, radiusLon: 3.6, radiusLat: 1.1, peak: 46),
            MountainRange(lon: 35.0, lat: 39.0, radiusLon: 5.5, radiusLat: 1.4, peak: 28),
            // 苏格兰高地
            MountainRange(lon: -4.2, lat: 57.2, radiusLon: 1.4, radiusLat: 1.1, peak: 22),
        ]
        return RegionGeometry(
            landPolygons: [
                GeoPolygon(europeMain), GeoPolygon(anatolia),
                GeoPolygon(greatBritain), GeoPolygon(ireland), GeoPolygon(iceland),
                GeoPolygon(sicily), GeoPolygon(sardinia), GeoPolygon(corsica),
                GeoPolygon(crete), GeoPolygon(cyprus), GeoPolygon(zealand),
                GeoPolygon(northAfrica),
            ],
            seaHolePolygons: [],
            mountainRanges: mountains,
            coastBandDeg: 2.8,
            warpAmpDeg: 0.06,
            cosScale: cos(51.25 * Double.pi / 180.0)
        )
    }()

    // 3. 东亚与日本（高精日本列岛本州/九州/四国/北海道/琉球/库页 + 台湾 + 海南 + 吕宋北 + 朝鲜 + 东亚大陆/满洲/俄远东/中南半岛北）
    private static let eastAsiaJapanGeometry: RegionGeometry = {
        let mainland: [(Double, Double)] = [
            // 西缘（缅甸/滇川甘蒙 → 外兴安岭 → 鞑靼海峡 → 滨海边疆区）
            (92.5, 51.0), (112.0, 51.0), (132.0, 51.0), (141.4, 51.0), (140.8, 49.0),
            (139.2, 46.8), (137.0, 44.8), (135.2, 43.6), (132.8, 42.9), (131.0, 42.4),
            // 朝鲜半岛
            (129.3, 41.0), (127.6, 39.2), (129.3, 37.6), (129.5, 35.8), (129.1, 35.1),
            (127.6, 34.6), (126.3, 34.4), (126.3, 35.7), (126.6, 37.5), (125.2, 38.0),
            (125.4, 39.5), (124.3, 39.9),
            // 辽东与渤海湾
            (123.1, 39.6), (121.6, 38.8), (121.3, 39.3), (122.2, 40.5), (121.0, 40.9),
            (119.7, 39.9), (117.7, 39.0), (118.8, 37.9), (119.2, 37.1),
            // 山东半岛
            (120.7, 37.8), (122.6, 37.4), (121.6, 36.7), (120.3, 36.0), (119.3, 35.0),
            // 长三角 → 闽粤 → 雷州 → 北部湾 → 越南顺化 → 泰北/缅甸下缘
            (119.8, 34.2), (120.9, 32.7), (121.9, 31.3), (120.8, 30.3), (122.0, 29.8),
            (121.5, 28.4), (120.7, 27.5), (119.8, 26.2), (118.6, 24.6), (116.7, 23.3),
            (114.6, 22.6), (113.5, 22.2), (111.3, 21.4),
            (110.5, 20.2), (109.7, 20.5), (109.2, 21.5), (108.0, 21.5),
            (106.7, 20.8), (105.9, 19.6), (106.7, 18.0), (108.4, 17.0),
            (95.0, 17.0), (94.0, 19.5), (92.5, 22.0),
        ]
        // 本州（34 顶点精绘：东北、关东房总、伊豆、骏河湾、伊势湾、纪伊半岛、濑户内海北岸、中国地方、能登半岛、津轻海峡）
        let honshu: [(Double, Double)] = [
            (141.3, 41.4), (142.0, 39.6), (141.5, 38.2), (140.9, 36.9), (140.9, 35.7),
            (140.3, 34.9), (139.8, 35.5), (139.2, 35.2), (138.9, 34.6), (138.4, 35.0),
            (137.2, 34.6), (136.8, 35.1), (136.8, 34.4), (135.8, 33.4), (135.1, 34.1),
            (135.4, 34.7), (134.1, 34.6), (132.5, 34.3), (131.0, 33.9),
            (130.9, 34.4), (131.8, 34.8), (133.1, 35.5), (134.8, 35.7), (136.1, 35.9),
            (136.7, 37.3), (137.3, 37.4), (137.2, 36.8), (138.2, 37.2), (139.2, 38.0),
            (139.9, 39.3), (139.9, 40.3), (140.3, 41.2),
        ]
        let hokkaido: [(Double, Double)] = [
            (140.1, 41.5), (141.2, 41.8), (141.0, 42.3), (143.2, 41.9), (144.4, 42.9),
            (145.8, 43.4), (145.2, 44.3), (144.0, 44.1), (142.8, 44.7), (141.7, 45.5),
            (141.3, 43.9), (140.2, 43.2), (139.8, 42.1),
        ]
        let kyushu: [(Double, Double)] = [
            (130.9, 33.9), (131.8, 33.4), (131.9, 32.5), (131.4, 31.4), (130.7, 31.0),
            (130.2, 31.4), (129.9, 32.3), (129.6, 33.2), (130.2, 33.7),
        ]
        let shikoku: [(Double, Double)] = [
            (133.0, 34.1), (134.6, 34.2), (134.7, 33.7), (134.1, 33.2),
            (133.3, 33.4), (132.7, 32.7), (132.2, 33.4),
        ]
        let okinawa: [(Double, Double)] = [
            (128.6, 27.3), (128.9, 26.4), (127.8, 25.6), (126.9, 26.1), (127.5, 27.1),
        ]
        let sakhalin: [(Double, Double)] = [
            (142.0, 50.8), (143.4, 50.8), (143.8, 48.8), (142.9, 47.4),
            (143.3, 46.0), (142.0, 46.0), (141.8, 48.2),
        ]
        let taiwan: [(Double, Double)] = [
            (121.5, 25.3), (122.0, 24.9), (121.6, 23.8), (121.1, 22.6), (120.8, 21.9),
            (120.2, 22.6), (120.0, 23.5), (120.4, 24.5), (121.0, 25.1),
        ]
        let hainan: [(Double, Double)] = [
            (110.3, 20.1), (111.0, 19.6), (110.5, 18.7), (109.6, 18.2),
            (108.7, 18.6), (108.6, 19.4), (109.5, 19.9),
        ]
        // 吕宋岛北半与马尼拉湾（为二战亚太提供真实可玩菲律宾岛屿港口）
        let luzonNorth: [(Double, Double)] = [
            (120.3, 19.7), (122.2, 19.8), (122.7, 18.6), (122.4, 17.3),
            (120.2, 17.3), (119.6, 18.3), (119.9, 19.2),
        ]
        let mountains: [MountainRange] = [
            // 日本阿尔卑斯与富士山、奥羽山脉、大雪山
            MountainRange(lon: 137.8, lat: 36.0, radiusLon: 1.2, radiusLat: 0.9, peak: 36),
            MountainRange(lon: 140.6, lat: 39.0, radiusLon: 0.8, radiusLat: 1.6, peak: 26),
            MountainRange(lon: 143.1, lat: 43.6, radiusLon: 1.1, radiusLat: 0.9, peak: 26),
            MountainRange(lon: 131.0, lat: 32.7, radiusLon: 0.7, radiusLat: 0.9, peak: 22),
            // 台湾中央山脉、朝鲜太白与盖马高原
            MountainRange(lon: 121.1, lat: 23.7, radiusLon: 0.6, radiusLat: 1.3, peak: 28),
            MountainRange(lon: 128.4, lat: 37.8, radiusLon: 0.9, radiusLat: 2.0, peak: 24),
            MountainRange(lon: 127.8, lat: 41.2, radiusLon: 1.8, radiusLat: 1.3, peak: 26),
            // 长白山与锡霍特山脉
            MountainRange(lon: 128.2, lat: 42.3, radiusLon: 2.2, radiusLat: 1.5, peak: 26),
            MountainRange(lon: 136.0, lat: 46.2, radiusLon: 2.2, radiusLat: 2.5, peak: 24),
            // 秦岭、横断山、云贵高原、南岭、武夷山
            MountainRange(lon: 107.8, lat: 33.6, radiusLon: 3.4, radiusLat: 1.0, peak: 26),
            MountainRange(lon: 100.5, lat: 28.2, radiusLon: 3.0, radiusLat: 3.8, peak: 38),
            MountainRange(lon: 103.5, lat: 24.5, radiusLon: 3.6, radiusLat: 2.2, peak: 24),
            MountainRange(lon: 112.8, lat: 25.2, radiusLon: 3.2, radiusLat: 1.2, peak: 18),
            MountainRange(lon: 117.5, lat: 26.8, radiusLon: 1.7, radiusLat: 2.0, peak: 20),
        ]
        return RegionGeometry(
            landPolygons: [
                GeoPolygon(mainland), GeoPolygon(honshu), GeoPolygon(hokkaido),
                GeoPolygon(kyushu), GeoPolygon(shikoku), GeoPolygon(okinawa),
                GeoPolygon(sakhalin), GeoPolygon(taiwan), GeoPolygon(hainan),
                GeoPolygon(luzonNorth),
            ],
            seaHolePolygons: [],
            mountainRanges: mountains,
            coastBandDeg: 2.6,
            warpAmpDeg: 0.05,
            cosScale: cos(33.75 * Double.pi / 180.0)
        )
    }()

    // 4. 世界全图（北美+阿拉斯加+中美+古巴+格陵兰、南美、欧亚非完整大陆+英爱+冰岛+马达加斯加+斯里兰卡+日本+台湾+东南亚诸岛+澳新）
    private static let worldGeometry: RegionGeometry = {
        let northAmerica: [(Double, Double)] = [
            // 阿拉斯加 → 加拿大北极 → 哈德逊湾 → 拉布拉多 → 美东 → 佛罗里达 → 墨西哥湾 → 尤卡坦 → 中美洲地峡
            (-166.0, 60.0), (-165.0, 66.0), (-156.0, 71.0), (-136.0, 69.5), (-115.0, 69.0),
            (-95.0, 69.0), (-84.0, 64.0), (-92.0, 61.0), (-92.0, 56.0), (-82.0, 52.0),
            (-78.0, 56.0), (-78.0, 62.5), (-65.0, 60.0), (-55.5, 52.0), (-60.0, 45.5),
            (-67.0, 45.0), (-70.0, 42.0), (-75.5, 35.5), (-81.0, 31.0), (-80.2, 25.0),
            (-82.5, 25.2), (-83.5, 29.5), (-90.0, 29.0), (-97.2, 26.0), (-97.0, 20.0),
            (-91.0, 18.5), (-89.5, 21.5), (-87.0, 21.0), (-88.0, 16.0), (-83.5, 15.0),
            (-83.0, 10.0), (-78.0, 9.0), (-78.2, 7.2), (-83.0, 8.2), (-86.5, 11.5),
            (-92.0, 14.5), (-100.0, 16.5), (-105.5, 20.0), (-109.0, 24.5), (-113.0, 31.0),
            (-111.5, 24.0), (-114.5, 27.5), (-117.2, 32.5), (-122.5, 38.0), (-124.5, 48.0),
            (-135.0, 57.0), (-148.0, 60.5), (-161.0, 55.5),
        ]
        let southAmerica: [(Double, Double)] = [
            (-78.0, 9.0), (-72.0, 11.5), (-62.0, 10.5), (-52.0, 5.0), (-48.0, 0.0),
            (-35.0, -5.8), (-35.0, -9.5), (-39.0, -15.0), (-41.0, -22.5), (-48.5, -26.5),
            (-53.5, -34.0), (-58.0, -35.0), (-58.0, -38.5), (-65.0, -42.5), (-68.5, -52.5),
            (-66.5, -55.2), (-71.5, -54.5), (-74.5, -47.0), (-73.5, -37.0), (-71.0, -20.0),
            (-76.5, -13.5), (-81.2, -5.0), (-79.5, 1.5),
        ]
        let greenland: [(Double, Double)] = [
            (-52.0, 60.0), (-43.0, 59.8), (-35.0, 65.5), (-22.0, 70.0), (-19.0, 73.5),
            (-55.0, 73.5), (-70.0, 72.0), (-58.0, 67.5),
        ]
        let cuba: [(Double, Double)] = [
            (-85.5, 22.8), (-79.5, 23.8), (-73.5, 20.8), (-74.8, 19.0), (-81.5, 20.4), (-85.4, 20.8),
        ]
        let eurasia: [(Double, Double)] = [
            // 伊比利亚 → 欧洲大西洋岸 → 斯堪的纳维亚 → 北冰洋 → 堪察加 → 东亚 → 中南半岛与马来半岛 → 印度 → 波斯湾 → 阿拉伯 → 地中海
            (-9.0, 37.0), (-9.2, 43.2), (-2.0, 43.5), (-4.5, 48.4), (2.0, 51.0),
            (8.5, 54.0), (10.5, 57.5), (10.5, 54.2), (18.5, 54.5), (24.5, 59.5),
            (29.5, 60.0), (21.5, 60.8), (24.5, 65.5), (18.5, 60.0), (13.0, 55.5),
            (10.5, 59.8), (5.5, 60.5), (11.0, 64.5), (19.0, 69.5), (28.0, 70.5),
            (42.0, 67.0), (65.0, 70.0), (95.0, 73.0), (135.0, 72.0), (170.0, 66.5),
            (163.0, 60.0), (162.0, 52.0), (156.5, 51.0), (155.0, 59.0), (141.0, 58.0),
            (140.5, 49.0), (135.0, 43.5), (130.5, 42.0), (129.3, 35.2), (126.2, 34.6),
            (124.5, 39.8), (118.5, 39.0), (122.4, 37.2), (119.5, 34.5), (121.8, 31.2),
            (120.0, 26.0), (114.0, 22.2), (108.5, 21.0), (106.5, 18.0), (109.2, 12.5),
            (105.0, 8.8), (100.5, 13.5), (102.0, 6.0), (104.2, 1.3), (101.0, 1.8),
            (98.5, 8.0), (97.5, 16.5), (93.5, 16.5), (91.5, 22.0), (86.5, 20.5),
            (80.2, 13.0), (77.5, 8.0), (73.0, 19.0), (68.5, 23.0), (66.5, 25.0),
            (57.5, 26.2), (49.5, 30.2), (48.0, 29.0), (52.0, 24.5), (56.5, 25.8), (59.8, 22.5), (53.5, 16.5),
            (43.5, 12.8), (40.5, 19.5), (35.0, 29.5), (32.5, 30.8), (35.5, 33.5),
            (36.0, 36.5), (27.0, 37.0), (26.5, 40.5), (29.0, 41.2), (23.5, 37.5),
            (20.0, 39.8), (14.0, 45.5), (18.2, 40.2), (15.8, 38.0), (12.2, 42.0),
            (8.8, 44.4), (3.0, 42.5), (-0.5, 38.0), (-5.5, 36.0),
        ]
        let africa: [(Double, Double)] = [
            (32.5, 30.8), (34.5, 27.0), (38.0, 21.0), (42.5, 12.5), (51.0, 11.5),
            (45.5, 2.0), (40.0, -4.5), (40.5, -14.5), (35.0, -25.0), (28.0, -33.0),
            (18.5, -34.5), (14.5, -23.0), (12.0, -15.5), (12.0, -6.0), (9.5, 4.0),
            (2.0, 6.2), (-7.5, 4.5), (-13.5, 9.0), (-17.5, 14.8), (-16.0, 22.0),
            (-10.0, 30.5), (-5.8, 35.8), (3.0, 36.8), (10.5, 37.0), (11.5, 33.0),
            (19.5, 32.5), (25.5, 31.5), (31.5, 31.4),
        ]
        let madagascar: [(Double, Double)] = [
            (49.2, -12.0), (50.4, -15.5), (47.5, -24.8), (44.0, -25.5), (43.5, -20.0), (46.5, -15.5),
        ]
        let greatBritain: [(Double, Double)] = [
            (-5.8, 50.0), (1.8, 51.2), (1.8, 53.0), (-1.5, 55.8), (-2.0, 58.6),
            (-5.5, 58.6), (-5.8, 55.0), (-5.2, 51.5),
        ]
        let ireland: [(Double, Double)] = [
            (-11.8, 50.8), (-6.0, 51.4), (-5.6, 55.8), (-11.4, 55.6), (-11.8, 52.8),
        ]
        let iceland: [(Double, Double)] = [
            (-25.0, 62.8), (-12.5, 62.8), (-12.2, 66.8), (-24.8, 66.8),
        ]
        let sriLanka: [(Double, Double)] = [
            (78.6, 10.6), (83.2, 10.0), (83.4, 5.2), (78.8, 5.2),
        ]
        let japan: [(Double, Double)] = [
            (129.6, 31.0), (132.5, 32.0), (136.5, 33.6), (140.8, 35.2), (142.2, 39.5),
            (145.6, 43.2), (144.8, 45.2), (140.5, 44.6), (138.8, 39.5), (136.2, 37.5),
            (132.2, 35.6), (129.4, 33.6),
        ]
        let taiwan: [(Double, Double)] = [
            (119.4, 21.0), (123.8, 21.6), (124.2, 26.6), (119.6, 26.0),
        ]
        let philippines: [(Double, Double)] = [
            (120.0, 18.8), (123.0, 18.6), (126.4, 9.0), (125.0, 6.2), (121.5, 7.5), (119.5, 14.5),
        ]
        let sumatra: [(Double, Double)] = [
            (95.2, 5.5), (99.0, 3.5), (105.8, -5.8), (103.5, -6.2), (98.0, 0.2), (95.0, 3.0),
        ]
        let java: [(Double, Double)] = [
            (105.0, -5.4), (116.4, -6.0), (116.2, -9.8), (105.2, -9.4),
        ]
        let borneo: [(Double, Double)] = [
            (116.5, 7.2), (119.0, 4.5), (117.5, -3.5), (111.0, -4.0), (108.8, 1.5), (112.5, 4.5),
        ]
        let newGuinea: [(Double, Double)] = [
            (131.5, -1.5), (141.0, -2.5), (150.5, -9.8), (146.0, -10.2), (137.0, -6.5), (131.5, -4.2),
        ]
        let australia: [(Double, Double)] = [
            (113.5, -22.0), (122.0, -17.0), (131.0, -11.5), (136.5, -12.0), (137.0, -16.0),
            (141.0, -16.5), (142.5, -11.0), (146.0, -17.0), (153.5, -26.5), (151.0, -34.5),
            (147.0, -38.5), (140.0, -37.5), (134.0, -33.0), (124.0, -33.0), (115.0, -34.5),
            (113.0, -26.0),
        ]
        let newZealand: [(Double, Double)] = [
            (173.0, -34.5), (178.2, -37.8), (174.5, -41.5), (168.5, -46.8),
            (166.2, -45.5), (171.2, -41.0), (172.0, -36.5),
        ]
        let blackSeaHole: [(Double, Double)] = [
            (28.0, 42.0), (30.5, 46.2), (38.0, 45.2), (41.4, 42.2), (35.5, 41.2), (29.2, 41.2),
        ]
        let caspianHole: [(Double, Double)] = [
            (47.2, 46.5), (53.2, 46.5), (54.0, 38.0), (49.5, 36.8), (47.5, 41.0),
        ]
        let greatLakesHole: [(Double, Double)] = [
            (-91.5, 47.8), (-84.0, 48.2), (-79.5, 44.0), (-83.5, 42.2), (-88.0, 42.5), (-91.5, 46.2),
        ]
        let mountains: [MountainRange] = [
            // 落基山、安第斯山
            MountainRange(lon: -114.0, lat: 46.0, radiusLon: 6.5, radiusLat: 11.0, peak: 34),
            MountainRange(lon: -107.0, lat: 36.0, radiusLon: 5.0, radiusLat: 6.0, peak: 30),
            MountainRange(lon: -70.5, lat: -22.0, radiusLon: 3.5, radiusLat: 16.0, peak: 42),
            MountainRange(lon: -76.0, lat: -6.0, radiusLon: 3.5, radiusLat: 10.0, peak: 36),
            // 喜马拉雅与青藏高原
            MountainRange(lon: 87.0, lat: 32.5, radiusLon: 11.0, radiusLat: 5.0, peak: 48),
            MountainRange(lon: 75.0, lat: 37.5, radiusLon: 6.0, radiusLat: 3.5, peak: 36),
            // 阿尔卑斯、乌拉尔、高加索、伊朗高原、埃塞俄比亚高原、东非高原
            MountainRange(lon: 10.5, lat: 46.5, radiusLon: 4.5, radiusLat: 2.0, peak: 38),
            MountainRange(lon: 59.5, lat: 59.0, radiusLon: 2.5, radiusLat: 7.5, peak: 26),
            MountainRange(lon: 43.5, lat: 42.5, radiusLon: 4.0, radiusLat: 2.0, peak: 38),
            MountainRange(lon: 53.0, lat: 33.0, radiusLon: 7.0, radiusLat: 3.5, peak: 26),
            MountainRange(lon: 39.0, lat: 9.5, radiusLon: 4.0, radiusLat: 3.5, peak: 32),
            MountainRange(lon: 35.0, lat: -3.0, radiusLon: 3.5, radiusLat: 6.0, peak: 24),
        ]
        return RegionGeometry(
            landPolygons: [
                GeoPolygon(northAmerica), GeoPolygon(southAmerica), GeoPolygon(greenland), GeoPolygon(cuba),
                GeoPolygon(eurasia), GeoPolygon(africa), GeoPolygon(madagascar),
                GeoPolygon(greatBritain), GeoPolygon(ireland), GeoPolygon(iceland),
                GeoPolygon(sriLanka), GeoPolygon(japan), GeoPolygon(taiwan), GeoPolygon(philippines),
                GeoPolygon(sumatra), GeoPolygon(java), GeoPolygon(borneo), GeoPolygon(newGuinea),
                GeoPolygon(australia), GeoPolygon(newZealand),
            ],
            seaHolePolygons: [GeoPolygon(blackSeaHole), GeoPolygon(caspianHole), GeoPolygon(greatLakesHole)],
            mountainRanges: mountains,
            coastBandDeg: 9.5,
            warpAmpDeg: 0.22,
            cosScale: cos(8.5 * Double.pi / 180.0)
        )
    }()
}
