import Foundation

/// The Swift engine of a running world: the web run (JSValue model) and its static geometry
/// (src/native-bridge/native-statics.ts), advanced by `Session`. Saves hold the run and the
/// statics, so a world reloads without replaying its journal.
public final class NativeEngine {
    public static let saveFormat = "lieguoji-native-game-2"
    public static let compactMagic: [UInt8] = [0x4C, 0x47, 0x43, 0x32] // "LGC2"
    public static let staticsMagic: [UInt8] = [0x4C, 0x47, 0x53, 0x54] // "LGST"
    public private(set) var run: JS
    /// The original province battle arrows (presentation state, kept between days).
    let battleArrows = BattleArrows()
    let statics: JS
    /// v13.0.0：直接持有的二进制行军图（避免 LGC2 编解码再绕道 48 MB Base64 JSON）。
    private var travelGraph: TravelGraph?
    private var cachedStaticsHash: String?
    /// v13.0.0：推流精简帧国家科技/工业/空优/综合国力缓存（每 5 日或格局变动刷新）。
    var nationTechCache: (key: Int, rows: [String: (milTech: Int, navTech: Int, ic: Int, airPower: Int, doctrine: String, compositePower: Double, quality: Double)])?
    /// The statics' label grid as arrays (NativeView.labels).
    var labelGridCache: (points: [Double], cells: [Int])?
    /// 同盟图：每个同盟用过的墨色序号（只供显示，不入存档）。同一局里同盟颜色不因别的同盟解散或成立而改变。
    var allianceInk = [String: Int]()

    public static func isCompactComputeFormat(_ data: Data) -> Bool {
        guard data.count >= 12 else { return false }
        let s = data.startIndex
        return data[s] == compactMagic[0] && data[s + 1] == compactMagic[1]
            && data[s + 2] == compactMagic[2] && data[s + 3] == compactMagic[3]
    }

    /// Catalogs shared by every world: native character traits, family naming by culture and the
    /// opening cultures (Resources/Catalog, Resources/World/cultures.json).
    public static func loadCatalogs(traits: Data, nobleCultures: Data, cultures: Data) throws {
        let t = try JS.parse(traits)
        People.loadTraits(t); Nobility.traitList = t.asArray
        Nobility.cultures = try JS.parse(nobleCultures)
        Founding.cultures = try JSONDecoder().decode([Opening.Culture].self, from: cultures)
    }

    /// `{run, statics}` from the web bridge (nativeWorld) or a save of this format, OR v13 `LGC2` compact binary envelope.
    public init(
        world data: Data,
        staticsResolver: ((String) -> Data?)? = nil,
        onStaticsDecoded: ((String, Data) -> Void)? = nil
    ) throws {
        if Self.isCompactComputeFormat(data) {
            let parsed = try Self.decodeCompactEnvelope(data, staticsResolver: staticsResolver, onStaticsDecoded: onStaticsDecoded)
            self.run = parsed.run
            self.statics = parsed.statics
            self.travelGraph = parsed.graph
            self.cachedStaticsHash = parsed.hash.isEmpty ? nil : parsed.hash
        } else {
            let o = try JS.parse(data)
            if !o.format.isNull && o.format.asString != Self.saveFormat { throw NativeEngineError.message("这不是列国纪存档。") }
            run = o.run; statics = o.statics
        }
        UnitKinds.enabled = false  // until enableAppRules: a plain run keeps the original's five units
        // Nor the app's war temper and treaty hooks of a world opened before this one.
        DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.opinionBias = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil
        try install()
    }
    /// A run whose statics are already installed (module tests).
    init(run: JS) { self.run = run; statics = .object() }
    /// 纯 Swift 建好的新世界（NativeCreation.generate）。
    public convenience init(created world: NativeCreation.World) throws { try self.init(created: world.run, statics: world.statics) }
    /// 建新世界：Swift 刚生成的整局与静态几何（NativeCreation）。
    init(created run: JS, statics: JS) throws {
        self.run = run; self.statics = statics
        UnitKinds.enabled = false
        DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.opinionBias = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil
        try install()
    }
    func install() throws {
        let graph: TravelGraph
        if let g = travelGraph {
            graph = g
        } else {
            guard let bytes = Data(base64Encoded: statics.travel.asString) else { throw NativeEngineError.message("行军图数据损坏。") }
            graph = try TravelGraph(data: bytes)
            self.travelGraph = graph
        }
        Armies.bridge = ForceBridge(graph: graph)
        Armies.homeCells = [:]; for (k, v) in statics.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        CombatReader.borders = statics.borders.asArray.map { $0.asArray.map(\.asInt) }
        War26.ports = statics.seaPorts.asArray.map { ($0[0].asString, $0[1].asInt) }
        let diplomacy = Data(statics.diplomacy.json.utf8)
        Session.engine = DeclarationEngine(statics: try JSONDecoder().decode(DiplomacyStatic.self, from: diplomacy))
        ArmyOrders.cache = nil
        Naval.sea = statics.sea.isNull ? nil : Naval.Sea(statics.sea); Naval.cellsCache = nil
        RunWindow.afterOccupation = nil
    }
    /// The world map (`{bin, meta}` of the bridge) the statics carry, as JSON.
    public var mapJSON: Data? { statics.map.isNull ? nil : statics.map.jsonData(reserveCapacity: 1_048_576) }
    /// 重算气候：同一片陆地按新的气候重画生物群系、群系色与河流（网页 engine.ts reclimate）；国家与规则不动。
    /// 新地图写回静态几何（存档带新地图），返回 `{bin, meta}` JSON。
    public func reclimate(_ x: CreationMap.Inputs, precipitation: Double, temperatureOffset: Double, north: Double, south: Double) throws -> Data {
        guard !statics.map.isNull, let bin = Data(base64Encoded: statics.map.bin.asString) else { throw NativeEngineError.message("这局没有地图数据，无法重算气候。") }
        let meta = statics.map.meta
        let old = try WorldMap(binary: bin, meta: try JSONDecoder().decode(WorldMeta.self, from: meta.jsonData(reserveCapacity: 65_536)))
        Climate.precipitationInput = precipitation; Climate.temperatureOffset = temperatureOffset; Climate.north = north; Climate.south = south
        let built = CreationMap.build(x, run: run, elevations: old.elevation.map(Int.init), seed: meta.seed.optionalString ?? "", template: meta.template.optionalString ?? "")
        let map = JS.object(); map.bin = built.map.bin; map.meta = meta
        statics.map = map
        return map.jsonData(reserveCapacity: 1_048_576)
    }
    /// Whole days.
    public func advance(days: Int) {
        let count = max(1, days)
        // v13.0.0：App 规则超大地图（≥240 州对齐 120 ticks/帧、≥120 州对齐 60 ticks/帧，均为 120 的严格整除因子），
        // 本机与云端共享同一确定性步长，单日窗口/行军/寻路批次开销立降 50%+；非 App 金标准测试完全不受影响。
        if UnitKinds.enabled && !run.regimes.isNull && run.regimes.enabled.isTruthy && !run.frameLoop.isNull {
            let provs = run.world.provinces.length
            let targetTicks: Double = provs >= 240 ? 120 : (provs >= 120 ? 60 : (run.frameLoop.ticks.optionalNumber ?? 30))
            if run.frameLoop.ticks.optionalNumber != targetTicks {
                run.frameLoop.ticks = JS(targetTicks)
            }
        }
        for _ in 0..<count { Session.advance(run, ticks: 120); Regimes.day(run) }
    }
    public func save() -> Data {
        // 云服 LGC2 实例不含 Base64 statics.travel 与 map，直接输出紧凑 LGC2（~8MB 取代 66MB，秒存秒载）
        if statics.travel.isNull && travelGraph != nil {
            return saveForCompute()
        }
        let o = JS.object(); o.format = JS(Self.saveFormat); o.run = run; o.statics = statics
        return o.jsonData(reserveCapacity: 4_194_304)
    }

    /// v13.0.0 静态几何内容指纹（FNV1a-128，32 位十六进制）：用于云服 `statics-cache` 内容寻址，重连/同图上传直省 90%+ 流量。
    public var computeStaticsHash: String {
        if let cached = cachedStaticsHash { return cached }
        var h1: UInt64 = 0xcbf29ce484222325
        var h2: UInt64 = 0x84222325cbf29ce4
        @inline(__always) func mix(_ v: UInt64) {
            h1 ^= v; h1 &*= 0x100000001b3
            h2 ^= v &+ 0x9e3779b97f4a7c15; h2 &*= 0x100000001b3
        }
        if let g = travelGraph {
            mix(UInt64(g.ids.count))
            mix(UInt64(g.linkTo.count))
            mix(UInt64(g.mountain.count))
            mix(UInt64(g.faceBiomes.count))
            let strideC = max(1, g.ids.count / 256)
            var i = 0
            while i < g.ids.count {
                mix(UInt64(bitPattern: Int64(g.ids[i])))
                mix(UInt64(bitPattern: Int64(g.provinces[i])))
                mix(UInt64(Float(g.centers[i].x).bitPattern))
                mix(UInt64(Float(g.centers[i].y).bitPattern))
                i += strideC
            }
            let strideB = max(1, g.faceBiomes.count / 256)
            var b = 0
            while b < g.faceBiomes.count {
                mix(UInt64(g.faceBiomes[b]))
                b += strideB
            }
        }
        mix(UInt64(statics.borders.length))
        mix(UInt64(statics.seaPorts.length))
        mix(UInt64(statics.homeCells.objectEntries.count))
        if !statics.labelGrid.isNull {
            mix(UInt64(statics.labelGrid.cellsX.asInt))
            mix(UInt64(statics.labelGrid.cells.length))
        }
        let hex = String(format: "%016llx%016llx", h1, h2)
        cachedStaticsHash = hex
        return hex
    }

    /// 将当前静态几何（Float32 v2 行军图 + 去 map/travel 后的其余 statics）打包为二进制 `LGST` 块。
    public func encodeStaticsBlob() -> Data {
        let travelBytes: Data
        if let g = travelGraph {
            travelBytes = g.encodeCompactV2()
        } else if let raw = Data(base64Encoded: statics.travel.asString), let g = try? TravelGraph(data: raw) {
            self.travelGraph = g
            travelBytes = g.encodeCompactV2()
        } else {
            travelBytes = Data()
        }
        let rest = JS.object()
        for (k, v) in statics.objectEntries where k != "map" && k != "travel" {
            rest[k] = v
        }
        let restJSON = rest.jsonData(reserveCapacity: 524_288)
        var out = Data(capacity: 13 + travelBytes.count + restJSON.count)
        out.append(contentsOf: Self.staticsMagic)
        out.append(1)
        Self.appendU32LE(&out, UInt32(travelBytes.count))
        out.append(travelBytes)
        Self.appendU32LE(&out, UInt32(restJSON.count))
        out.append(restJSON)
        return out
    }

    /// v13.0.0 全二进制云端计算封包（`LGC2`）：
    /// - 剔除 `statics.map` + 彻底消除 `48 MB` Base64 JSON `statics.travel`，改用 Float32 v2 行军图 + 分块 LZ4 压缩；
    /// - 835 州超大图冷上传从 **65.8 MB → ~9–11 MB**，服务端解析从 **1.75s → < 350ms**！
    public func saveForCompute() -> Data {
        let hash = computeStaticsHash
        let hashBytes = Array(hash.utf8)
        let rawRun = run.jsonData(reserveCapacity: 2_097_152)
        let compRun = WireCodec.compress(rawRun)
        let runIsComp = WireCodec.isCompressed(compRun)
        let rawStatics = encodeStaticsBlob()
        let compStatics = WireCodec.compress(rawStatics)
        let staticsIsComp = WireCodec.isCompressed(compStatics)

        var flags: UInt8 = 0x01 // hasStatics
        if runIsComp { flags |= 0x02 }
        if staticsIsComp { flags |= 0x04 }

        var out = Data(capacity: 16 + hashBytes.count + compRun.count + compStatics.count)
        out.append(contentsOf: Self.compactMagic)
        out.append(1) // version
        out.append(flags)
        Self.appendU16LE(&out, UInt16(min(65535, hashBytes.count)))
        out.append(contentsOf: hashBytes.prefix(65535))
        Self.appendU32LE(&out, UInt32(compRun.count))
        out.append(compRun)
        Self.appendU32LE(&out, UInt32(compStatics.count))
        out.append(compStatics)
        return out
    }

    /// v13.0.0 纯运行态增量封包（`LGC2` run-only）：当云服 `hasStatics(hash)` 命中时，仅上传压缩后的 `run`（**~1.8 MB**，较旧版 65.8 MB 暴降 35×！）。
    public func saveRunOnlyForCompute(staticsHash: String? = nil) -> Data {
        let hash = staticsHash ?? computeStaticsHash
        let hashBytes = Array(hash.utf8)
        let rawRun = run.jsonData(reserveCapacity: 2_097_152)
        let compRun = WireCodec.compress(rawRun)
        let runIsComp = WireCodec.isCompressed(compRun)
        let flags: UInt8 = runIsComp ? 0x02 : 0x00

        var out = Data(capacity: 12 + hashBytes.count + compRun.count)
        out.append(contentsOf: Self.compactMagic)
        out.append(1) // version
        out.append(flags)
        Self.appendU16LE(&out, UInt16(min(65535, hashBytes.count)))
        out.append(contentsOf: hashBytes.prefix(65535))
        Self.appendU32LE(&out, UInt32(compRun.count))
        out.append(compRun)
        return out
    }

    /// 从远程返回的世界数据（JSON 或 `LGC2`）仅更新当前本机引擎的 `run` 状态，完好保留本机高精渲染底图 `statics.map`！
    public func replaceRun(fromRemoteSave data: Data) throws {
        if Self.isCompactComputeFormat(data) {
            let newRun = try Self.extractRunFromCompactEnvelope(data)
            self.run = newRun
        } else {
            let o = try JS.parse(data)
            guard !o.run.isNull else { throw NativeEngineError.message("远程存档缺少运行态。") }
            self.run = o.run
        }
        self.nationTechCache = nil
        ArmyOrders.cache = nil
        Naval.cellsCache = nil
        Armies.spaceCache = [:]
    }

    private static func appendU16LE(_ out: inout Data, _ v: UInt16) {
        var le = v.littleEndian
        withUnsafeBytes(of: &le) { out.append(contentsOf: $0) }
    }
    private static func appendU32LE(_ out: inout Data, _ v: UInt32) {
        var le = v.littleEndian
        withUnsafeBytes(of: &le) { out.append(contentsOf: $0) }
    }
    private static func readU16LE(_ data: Data, at offset: Int) throws -> UInt16 {
        guard offset + 2 <= data.count else { throw NativeEngineError.message("计算封包头损坏。") }
        let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt16.self) }
        return UInt16(littleEndian: v)
    }
    private static func readU32LE(_ data: Data, at offset: Int) throws -> UInt32 {
        guard offset + 4 <= data.count else { throw NativeEngineError.message("计算封包长度损坏。") }
        let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        return UInt32(littleEndian: v)
    }

    private static func extractRunFromCompactEnvelope(_ data: Data) throws -> JS {
        guard data.count >= 12 else { throw NativeEngineError.message("LGC2 封包过短。") }
        let s = data.startIndex
        let version = data[s + 4]
        guard version == 1 else { throw NativeEngineError.message("不支持的 LGC2 版本：\(version)") }
        let flags = data[s + 5]
        let hashLen = Int(try readU16LE(data, at: 6))
        let runLenOff = 8 + hashLen
        let runLen = Int(try readU32LE(data, at: runLenOff))
        let runStart = runLenOff + 4
        guard runStart + runLen <= data.count else { throw NativeEngineError.message("LGC2 运行态截断。") }
        let rawRunSlice = data.subdata(in: (s + runStart)..<(s + runStart + runLen))
        let runBytes = (flags & 0x02) != 0 ? WireCodec.decompressIfNeeded(rawRunSlice) : rawRunSlice
        return try JS.parse(runBytes)
    }

    private static func decodeCompactEnvelope(
        _ data: Data,
        staticsResolver: ((String) -> Data?)?,
        onStaticsDecoded: ((String, Data) -> Void)?
    ) throws -> (run: JS, statics: JS, graph: TravelGraph, hash: String) {
        guard data.count >= 12 else { throw NativeEngineError.message("LGC2 封包过短。") }
        let s = data.startIndex
        let version = data[s + 4]
        guard version == 1 else { throw NativeEngineError.message("不支持的 LGC2 版本：\(version)") }
        let flags = data[s + 5]
        let hashLen = Int(try readU16LE(data, at: 6))
        guard 8 + hashLen + 4 <= data.count else { throw NativeEngineError.message("LGC2 指纹越界。") }
        let hash = hashLen > 0 ? String(decoding: data[(s + 8)..<(s + 8 + hashLen)], as: UTF8.self) : ""
        let runLenOff = 8 + hashLen
        let runLen = Int(try readU32LE(data, at: runLenOff))
        let runStart = runLenOff + 4
        guard runStart + runLen <= data.count else { throw NativeEngineError.message("LGC2 运行态截断。") }
        let rawRunSlice = data.subdata(in: (s + runStart)..<(s + runStart + runLen))
        let runBytes = (flags & 0x02) != 0 ? WireCodec.decompressIfNeeded(rawRunSlice) : rawRunSlice
        let runObj = try JS.parse(runBytes)

        let rawStaticsBlob: Data
        if (flags & 0x01) != 0 {
            let stLenOff = runStart + runLen
            let stLen = Int(try readU32LE(data, at: stLenOff))
            let stStart = stLenOff + 4
            guard stStart + stLen <= data.count else { throw NativeEngineError.message("LGC2 静态几何截断。") }
            let stSlice = data.subdata(in: (s + stStart)..<(s + stStart + stLen))
            rawStaticsBlob = (flags & 0x04) != 0 ? WireCodec.decompressIfNeeded(stSlice) : stSlice
            if !hash.isEmpty && !rawStaticsBlob.isEmpty {
                onStaticsDecoded?(hash, rawStaticsBlob)
            }
        } else {
            guard !hash.isEmpty, let cached = staticsResolver?(hash), !cached.isEmpty else {
                throw NativeEngineError.message("statics_miss:\(hash)")
            }
            rawStaticsBlob = cached
        }

        // 解码 LGST 二进制静态块
        guard rawStaticsBlob.count >= 13 else { throw NativeEngineError.message("LGST 静态块损坏。") }
        let bs = rawStaticsBlob.startIndex
        guard rawStaticsBlob[bs] == staticsMagic[0], rawStaticsBlob[bs + 1] == staticsMagic[1],
              rawStaticsBlob[bs + 2] == staticsMagic[2], rawStaticsBlob[bs + 3] == staticsMagic[3],
              rawStaticsBlob[bs + 4] == 1 else {
            throw NativeEngineError.message("LGST 魔数或版本无效。")
        }
        let travelLen = Int(try readU32LE(rawStaticsBlob, at: 5))
        let travelStart = 9
        guard travelStart + travelLen + 4 <= rawStaticsBlob.count else { throw NativeEngineError.message("LGST 行军图截断。") }
        let travelBytes = rawStaticsBlob.subdata(in: (bs + travelStart)..<(bs + travelStart + travelLen))
        let restLenOff = travelStart + travelLen
        let restLen = Int(try readU32LE(rawStaticsBlob, at: restLenOff))
        let restStart = restLenOff + 4
        guard restStart + restLen <= rawStaticsBlob.count else { throw NativeEngineError.message("LGST 元数据截断。") }
        let restJSON = rawStaticsBlob.subdata(in: (bs + restStart)..<(bs + restStart + restLen))

        let graph = try TravelGraph(data: travelBytes)
        let staticsObj = try JS.parse(restJSON)
        return (runObj, staticsObj, graph, hash)
    }
}

public enum NativeEngineError: LocalizedError {
    case message(String)
    public var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
}
