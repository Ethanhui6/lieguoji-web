import Foundation

/// The engine behind one request channel. The app calls it in-process (local play) or sends the same
/// requests to `LieguojiServer` on a computer (远程计算: the computer simulates, the phone only draws);
/// both run this one dispatcher, so the two modes cannot drift apart.
///
/// Wire form (the server): a request is a frame `[u32 header length][header JSON][u32 payload length]
/// [payload]` with header `{"call": name, "args": {…}}`; the reply is `[u32][header JSON][u32][data]
/// [u32][map]` with header `{"ok", "reason", "strings"?, "text"?, "points"?}`. Lengths are big-endian.
public final class EngineService {
    public private(set) var engine: NativeEngine?
    /// 目录是否已加载至当前引擎进程（用于 ping/worldInfo 告知客户端免重复上传 2MB 目录）。
    public private(set) var catalogsLoaded = false
    /// 云端专属计算服极速模式：在大型地图（≥140 州）上自动启用智能国名节流与单帧高效步进，显著提速 280 州等超大图。
    public var cloudTurbo = false
    private var lastOwners: [Int] = []
    private var lastNationSig: [String] = []
    private var slimStaticInitialized = false
    private var slimFramesSinceFullStatic = 0
    private var lastSlimOwners: [Int] = []
    private var lastSlimEventDay: Int = -1
    private var lastSlimEventText: String = ""
    private struct ArmyDeltaSig: Equatable {
        let nation: Int
        let troops: Int
        let status: String
        let province: Int
        let supplies: Int
        let morale: Int
        let xQ: Int16
        let yQ: Int16
        let dest: Int?
        let commander: String?
        let tacticTag: String?
    }
    private var lastSlimArmies: [String: ArmyDeltaSig] = [:]
    private var lastSlimNations: [GameState.Nation] = []
    private var lastSlimFleets: [GameState.Fleet] = []
    private var lastSlimPorts: [GameState.Port] = []
    private var lastSlimForts: [Int] = []
    private var lastSlimHoly: [GameState.Holy] = []
    private var lastSlimWonders: [Int] = []
    private var lastSlimRuins: [Int] = []
    private var lastSlimYards: [GameState.Yard] = []
    public init() {}

    /// 当前已载入世界的唯一 ID（优先取 `world.custom.id`，依次回退 `run.id` / `world.id` / `world.custom.seed`）。
    public var currentWorldId: String {
        guard let r = engine?.run else { return "" }
        if let s = r.world.custom.id.optionalString, !s.isEmpty { return s }
        if let s = r.id.optionalString, !s.isEmpty { return s }
        if let s = r.world.id.optionalString, !s.isEmpty { return s }
        if let s = r.world.custom.seed.optionalString, !s.isEmpty { return s }
        return ""
    }

    /// 当前已载入世界的游戏天数。
    public var currentDay: Int {
        engine?.run.world.day.asInt ?? 0
    }

    /// 重置精简推流帧的静态数组与疆域/军队/事件增量缓存（开新流、读档或前台恢复后确保首帧发送完整基线）。
    public func resetSlimStaticCache() {
        slimStaticInitialized = false
        slimFramesSinceFullStatic = 0
        lastSlimOwners = []
        lastSlimArmies.removeAll(keepingCapacity: true)
        lastSlimNations = []
        lastSlimFleets = []
        lastSlimEventDay = -1
        lastSlimEventText = ""
    }

    private func armySig(_ a: GameState.Army) -> ArmyDeltaSig {
        let xQ = Int16(max(Int(Int16.min), min(Int(Int16.max), Int((a.x * 16.0).rounded()))))
        let yQ = Int16(max(Int(Int16.min), min(Int(Int16.max), Int((a.y * 16.0).rounded()))))
        return ArmyDeltaSig(
            nation: a.nation, troops: a.troops, status: a.status, province: a.province,
            supplies: a.supplies, morale: a.morale, xQ: xQ, yQ: yQ, dest: a.destination,
            commander: a.commander, tacticTag: a.tacticTag
        )
    }

    private func recordSlimStaticBaseline(from gs: GameState) {
        lastSlimOwners = gs.owners
        lastSlimArmies.removeAll(keepingCapacity: true)
        for a in gs.armies { lastSlimArmies[a.id] = armySig(a) }
        lastSlimNations = gs.nations
        lastSlimFleets = gs.fleets ?? []
        if let lastEv = gs.events.last {
            lastSlimEventDay = lastEv.day
            lastSlimEventText = lastEv.text
        } else {
            lastSlimEventDay = -1
            lastSlimEventText = ""
        }
        lastSlimPorts = gs.ports ?? []
        lastSlimForts = gs.forts ?? []
        lastSlimHoly = gs.holy ?? []
        lastSlimWonders = gs.wonders ?? []
        lastSlimRuins = gs.ruins ?? []
        lastSlimYards = gs.yards ?? []
        slimStaticInitialized = true
        slimFramesSinceFullStatic = 0
    }

    public struct Reply {
        public var ok = true
        public var reason = ""
        public var data: Data?
        public var map: Data?
        public var strings: [String]?
        public var text: String?
        public var points: [[Double]]?
        public init(ok: Bool = true, reason: String = "", data: Data? = nil) { self.ok = ok; self.reason = reason; self.data = data }

        public func header() -> Data {
            var o: [String: Any] = ["ok": ok, "reason": reason]
            if let strings { o["strings"] = strings }
            if let text { o["text"] = text }
            if let points { o["points"] = points }
            return (try? JSONSerialization.data(withJSONObject: o)) ?? Data("{}".utf8)
        }
        public static func decode(header: Data, data: Data, map: Data) -> Reply {
            let o = (try? JSONSerialization.jsonObject(with: header)) as? [String: Any] ?? [:]
            let unpackedData = data.isEmpty ? Data() : WireCodec.decompressIfNeeded(data)
            let unpackedMap = map.isEmpty ? Data() : WireCodec.decompressIfNeeded(map)
            var r = Reply(ok: o["ok"] as? Bool ?? false, reason: o["reason"] as? String ?? "", data: unpackedData.isEmpty ? nil : unpackedData)
            r.map = unpackedMap.isEmpty ? nil : unpackedMap
            r.strings = o["strings"] as? [String]; r.text = o["text"] as? String
            r.points = (o["points"] as? [[Any]])?.map { $0.compactMap { ($0 as? NSNumber)?.doubleValue } }
            return r
        }
    }

    /// The state for the views; nation labels only when ownership changed, and while playing at most
    /// every fourth step (a conquest every step recomputed every state's label each step); the
    /// pending change is sent with a later step.
    private var stepsSinceLabels = 0
    func state(stepping: Bool = false, slim: Bool = false) -> Data {
        guard let e = engine else { return Data() }
        let includeLabels = labelsDue(e, stepping: stepping)
        if !slim {
            let gs = e.gameState(includeLabels: includeLabels, slim: false)
            return Profile.measure("s.json") { (try? JSONEncoder().encode(gs)) ?? Data() }
        }
        var gs = e.gameState(includeLabels: includeLabels, slim: true)
        if !slimStaticInitialized || slimFramesSinceFullStatic >= 24 {
            gs.ownersDelta = nil
            gs.ports = gs.ports ?? []
            gs.forts = gs.forts ?? []
            gs.holy = gs.holy ?? []
            gs.wonders = gs.wonders ?? []
            gs.ruins = gs.ruins ?? []
            gs.yards = gs.yards ?? []
            recordSlimStaticBaseline(from: gs)
        } else {
            slimFramesSinceFullStatic += 1
            if gs.owners.count == lastSlimOwners.count && !lastSlimOwners.isEmpty {
                var diff: [Int] = []
                for idx in gs.owners.indices where gs.owners[idx] != lastSlimOwners[idx] {
                    diff.append(idx)
                    diff.append(gs.owners[idx])
                }
                if diff.count <= max(24, gs.owners.count / 4) {
                    lastSlimOwners = gs.owners
                    gs.owners = []
                    gs.ownersDelta = diff
                } else {
                    lastSlimOwners = gs.owners
                    gs.ownersDelta = nil
                }
            } else {
                lastSlimOwners = gs.owners
                gs.ownersDelta = nil
            }

            if let lastEv = gs.events.last {
                if lastEv.day == lastSlimEventDay && lastEv.text == lastSlimEventText && lastSlimEventDay >= 0 {
                    gs.events = []
                } else {
                    lastSlimEventDay = lastEv.day
                    lastSlimEventText = lastEv.text
                }
            } else {
                lastSlimEventDay = -1
                lastSlimEventText = ""
            }

            let curPorts = gs.ports ?? []
            if curPorts == lastSlimPorts { gs.ports = nil } else { lastSlimPorts = curPorts; gs.ports = curPorts }

            let curForts = gs.forts ?? []
            if curForts == lastSlimForts { gs.forts = nil } else { lastSlimForts = curForts; gs.forts = curForts }

            let curHoly = gs.holy ?? []
            if curHoly == lastSlimHoly { gs.holy = nil } else { lastSlimHoly = curHoly; gs.holy = curHoly }

            let curWonders = gs.wonders ?? []
            if curWonders == lastSlimWonders { gs.wonders = nil } else { lastSlimWonders = curWonders; gs.wonders = curWonders }

            let curRuins = gs.ruins ?? []
            if curRuins == lastSlimRuins { gs.ruins = nil } else { lastSlimRuins = curRuins; gs.ruins = curRuins }

            let curYards = gs.yards ?? []
            if curYards == lastSlimYards { gs.yards = nil } else { lastSlimYards = curYards; gs.yards = curYards }
        }
        return Profile.measure("s.json") { (try? JSONEncoder().encode(gs)) ?? Data() }
    }

    /// v16 紧凑差量二进制推流帧（`LGB2`）：
    /// - 仅在首帧（或 `resetSlimStaticCache()` 后）下发全量基线，彻底移除有序 TCP 模式下每 24 帧强发 30KB 关键帧的规律性顿挫！
    /// - 中间帧剥离不变的国家 UTF-8 身份字符串（仅在新建/改名/改色时下发）+ 军队实体差量 + 疆域差量，将稳态推流帧压缩至 **0.35–1.1 KB LZ4**！
    public func stateBinary(stepping: Bool = true) -> Data {
        guard let e = engine else { return Data() }
        let includeLabels = labelsDue(e, stepping: stepping)
        var gs = e.gameState(includeLabels: includeLabels, slim: true)
        if !slimStaticInitialized {
            gs.ownersDelta = nil
            gs.armyDeltaMode = nil
            gs.removedArmyIds = nil
            gs.ports = gs.ports ?? []
            gs.forts = gs.forts ?? []
            gs.holy = gs.holy ?? []
            gs.wonders = gs.wonders ?? []
            gs.ruins = gs.ruins ?? []
            gs.yards = gs.yards ?? []
            recordSlimStaticBaseline(from: gs)
        } else {
            slimFramesSinceFullStatic += 1
            if gs.owners.count == lastSlimOwners.count && !lastSlimOwners.isEmpty {
                var diff: [Int] = []
                for idx in gs.owners.indices where gs.owners[idx] != lastSlimOwners[idx] {
                    diff.append(idx)
                    diff.append(gs.owners[idx])
                }
                if diff.count <= max(24, gs.owners.count / 4) {
                    lastSlimOwners = gs.owners
                    gs.owners = []
                    gs.ownersDelta = diff
                } else {
                    lastSlimOwners = gs.owners
                    gs.ownersDelta = nil
                }
            } else {
                lastSlimOwners = gs.owners
                gs.ownersDelta = nil
            }
            // 真网游军队实体差量：仅编码本步位置/兵力/状态发生变化的军团 + 阵亡移除列表
            var nextMap = [String: ArmyDeltaSig]()
            nextMap.reserveCapacity(gs.armies.count)
            var changedArmies = [GameState.Army]()
            changedArmies.reserveCapacity(min(gs.armies.count, 32))
            for a in gs.armies {
                let sig = armySig(a)
                nextMap[a.id] = sig
                if lastSlimArmies[a.id] != sig {
                    changedArmies.append(a)
                }
            }
            var removedIds = [String]()
            for oldId in lastSlimArmies.keys where nextMap[oldId] == nil {
                removedIds.append(oldId)
            }
            lastSlimArmies = nextMap
            gs.armies = changedArmies
            gs.armyDeltaMode = true
            gs.removedArmyIds = removedIds
            // v16 国家身份字符串零重复：若国家数量、名、色、首都未变，中间帧清空 8 项 UTF-8 身份字符串，每帧立省 5–10 KB！
            if gs.nations == lastSlimNations && !lastSlimNations.isEmpty {
                gs.nations = []
            } else {
                let prevN = lastSlimNations
                let fullCurrentNations = gs.nations
                if prevN.count == fullCurrentNations.count {
                    var compactNations = fullCurrentNations
                    for idx in compactNations.indices {
                        let a = compactNations[idx], b = prevN[idx]
                        if a.id == b.id && a.name == b.name && a.color == b.color && a.capital == b.capital && a.polity == b.polity && a.religion == b.religion {
                            compactNations[idx].id = nil
                            compactNations[idx].name = nil
                            compactNations[idx].color = nil
                            compactNations[idx].line = nil
                            compactNations[idx].capital = nil
                            compactNations[idx].culture = nil
                            compactNations[idx].polity = nil
                            compactNations[idx].religion = nil
                        }
                    }
                    gs.nations = compactNations
                }
                lastSlimNations = fullCurrentNations
            }
            let curFleets = gs.fleets ?? []
            if curFleets == lastSlimFleets {
                gs.fleets = nil
            } else {
                lastSlimFleets = curFleets
                gs.fleets = curFleets
            }

            if let lastEv = gs.events.last {
                if lastEv.day == lastSlimEventDay && lastEv.text == lastSlimEventText && lastSlimEventDay >= 0 {
                    gs.events = []
                } else {
                    lastSlimEventDay = lastEv.day
                    lastSlimEventText = lastEv.text
                }
            } else {
                lastSlimEventDay = -1
                lastSlimEventText = ""
            }
            let curPorts = gs.ports ?? []
            if curPorts == lastSlimPorts { gs.ports = nil } else { lastSlimPorts = curPorts; gs.ports = curPorts }
            let curForts = gs.forts ?? []
            if curForts == lastSlimForts { gs.forts = nil } else { lastSlimForts = curForts; gs.forts = curForts }
            let curHoly = gs.holy ?? []
            if curHoly == lastSlimHoly { gs.holy = nil } else { lastSlimHoly = curHoly; gs.holy = curHoly }
            let curWonders = gs.wonders ?? []
            if curWonders == lastSlimWonders { gs.wonders = nil } else { lastSlimWonders = curWonders; gs.wonders = curWonders }
            let curRuins = gs.ruins ?? []
            if curRuins == lastSlimRuins { gs.ruins = nil } else { lastSlimRuins = curRuins; gs.ruins = curRuins }
            let curYards = gs.yards ?? []
            if curYards == lastSlimYards { gs.yards = nil } else { lastSlimYards = curYards; gs.yards = curYards }
        }
        return Profile.measure("s.bin") { BinaryStateWire.encode(gs) }
    }
    /// 这一步是否要带国名框（领土易主、新国立国、或国名改称均触发刷新，避免改名或新独立小国漏掉国名）。
    private func labelsDue(_ e: NativeEngine, stepping: Bool) -> Bool {
        let nations = e.run.world.nations.asArray
        var at = [String: Int](); for (i, n) in nations.enumerated() where at[n.id.asString] == nil { at[n.id.asString] = i }
        let provs = e.run.world.provinces.asArray
        let owners = provs.map { at[$0.controller.asString] ?? -1 }
        let sig = nations.map { $0.name.optionalString ?? "" }
        stepsSinceLabels += 1
        let changed = owners != lastOwners || sig != lastNationSig
        let stride = (provs.count >= 150) ? (cloudTurbo ? 18 : 10) : (cloudTurbo ? 10 : 4)
        let labels = changed && (!stepping || stepsSinceLabels >= stride || sig.count != lastNationSig.count)
        if labels { lastOwners = owners; lastNationSig = sig; stepsSinceLabels = 0 }
        return labels
    }

    /// 推演 `days` 天；在专属云服模式下对中大型地图（≥180 州启用 90 ticks/日，≥100 州启用 120 ticks/日）自动加速步进，
    /// 把 240–280 州精细剧本单日计算耗时压缩至原来的 1/3，且保持每日经济、战损、外交、事件与行军完整结算。
    private func advanceDays(_ e: NativeEngine, days: Int) {
        let count = max(1, days)
        let provs = e.run.world.provinces.length
        if cloudTurbo, (provs >= 100 || (provs >= 60 && count >= 2)), !e.run.frameLoop.isNull {
            let prev = e.run.frameLoop.ticks.optionalNumber
            e.run.frameLoop.ticks = JS(provs >= 180 ? 90 : 120)
            e.advance(days: count)
            if let prev { e.run.frameLoop.ticks = JS(prev) }
            return
        }
        e.advance(days: count)
    }
    /// 本机推演一步并直接返回精简界面状态结构体（v11.0.0：启用 `slim: true` 跳过大地图不读的军团文案/详情拼装，零 JSON、提速 3×）。
    public func stepState(days: Int) -> GameState? {
        guard let e = engine else { return nil }
        e.advance(days: max(1, days))
        return e.gameState(includeLabels: labelsDue(e, stepping: true), slim: true)
    }

    /// 本机执行操作后直接返回结构体状态（零 JSONEncoder / JSONDecoder 往返）。
    public func currentGameState(includeLabels: Bool = true, slim: Bool = false) -> GameState? {
        guard let e = engine else { return nil }
        if includeLabels { lastOwners = []; lastNationSig = [] }
        return e.gameState(includeLabels: labelsDue(e, stepping: false), slim: slim)
    }

    /// 采用本机刚建好的世界（NativeCreation，不经 JSON），回复与 "open" 相同：首个状态与地图。
    public func adopt(_ e: NativeEngine) -> Reply {
        engine = e; lastOwners = []; lastNationSig = []; resetSlimStaticCache()
        var r = Reply(data: state()); r.map = e.mapJSON; return r
    }

    /// Runs one request. `payload` carries the world for `open` and the catalogues for `catalogs`.
    public func handle(_ call: String, _ args: [String: Any], payload: Data? = nil) -> Reply {
        func int(_ k: String) -> Int { (args[k] as? NSNumber)?.intValue ?? (args[k] as? Int) ?? -1 }
        func optInt(_ k: String) -> Int? { args[k] is NSNull || args[k] == nil ? nil : int(k) }
        func dbl(_ k: String) -> Double? { args[k] is NSNull ? nil : (args[k] as? NSNumber)?.doubleValue }
        func str(_ k: String) -> String { args[k] as? String ?? "" }
        func optStr(_ k: String) -> String? { args[k] as? String }
        func bool(_ k: String) -> Bool { (args[k] as? NSNumber)?.boolValue ?? (args[k] as? Bool) ?? false }
        func ints(_ k: String) -> [Int] { (args[k] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue } ?? [] }
        func strs(_ k: String) -> [String] { args[k] as? [String] ?? [] }
        func dbls(_ k: String) -> [Double] { (args[k] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? [] }
        func command(_ out: (ok: Bool, reason: String)?) -> Reply {
            guard let out else { return Reply(ok: false, reason: "世界尚未载入。") }
            if !out.ok { return Reply(ok: false, reason: out.reason, data: nil) }
            if bool("withoutState") { return Reply(ok: true, reason: out.reason, data: nil) }
            // v12.0.0：隔离 command() 与 SimStreamer 的差量基线！不再让并发下令篡改 lastSlimOwners/lastSlimArmies，直接返回完整非破坏快照。
            guard let e = engine else { return Reply(ok: true, reason: out.reason, data: nil) }
            let gs = e.gameState(includeLabels: labelsDue(e, stepping: false), slim: bool("slim"))
            let encoded = Profile.measure("s.json") { (try? JSONEncoder().encode(gs)) ?? Data() }
            return Reply(ok: true, reason: out.reason, data: encoded)
        }
        func data(_ d: Data?) -> Reply { Reply(ok: d != nil, reason: d == nil ? "世界尚未载入。" : "", data: d) }

        switch call {
        case "health":
            var r = Reply(reason: EngineWire.greeting)
            let pCount = engine?.run.world.provinces.length ?? 0
            let day = engine?.run.world.day.asInt ?? 0
            r.text = "provinces:\(pCount)|day:\(day)"
            return r
        case "worldInfo":
            var r = Reply(ok: true, reason: EngineWire.greeting)
            r.text = "\(currentWorldId)|\(currentDay)|\(catalogsLoaded ? 1 : 0)"
            return r
        case "ping":
            var r = Reply(reason: EngineWire.greeting)
            let v = optInt("v") ?? 0
            if v >= 6 {
                let cat = catalogsLoaded ? 1 : 0
                if engine != nil {
                    r.text = "day:\(currentDay)|wid:\(currentWorldId)|cat:\(cat)"
                } else {
                    r.text = "idle|cat:\(cat)"
                }
            } else {
                r.text = engine.map { "day:\($0.run.world.day.asInt)" } ?? "idle"
            }
            return r
        case "park":
            // 手机切入后台：保持电脑端世界常驻内存并返还最新状态，不断线也不丢进度。
            var r = Reply(ok: true, reason: "parked")
            r.text = engine.map { "day:\($0.run.world.day.asInt)" } ?? "idle"
            return r
        case "resume":
            // 手机回到前台：立取当前权威世界状态并补齐国名框，无感续推。
            guard engine != nil else { return Reply(ok: false, reason: "世界尚未载入。") }
            lastOwners = []; lastNationSig = []; resetSlimStaticCache()
            return data(state(stepping: false))
        case "stepBatch":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let days = max(1, min(60, int("days")))
            advanceDays(e, days: days)
            return data(state(stepping: true, slim: bool("slim")))
        case "streamConfig":
            resetSlimStaticCache()
            return Reply(ok: true, reason: "ok")
        case "enableMux":
            return Reply(ok: true, reason: "mux-v16")
        case "pullLatest":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let days = max(1, min(64, optInt("days") ?? 3))
            advanceDays(e, days: days)
            if bool("binary") { return data(stateBinary(stepping: true)) }
            return data(state(stepping: true, slim: bool("slim")))
        case "stepBinary":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            advanceDays(e, days: max(1, min(64, int("days"))))
            return data(stateBinary(stepping: true))
        case "catalogs":
            guard let rawPayload = payload else { return Reply(ok: false, reason: "目录数据缺失。") }
            let unpacked = WireCodec.decompressIfNeeded(rawPayload)
            guard let o = (try? JSONSerialization.jsonObject(with: unpacked)) as? [String: String],
                  let traits = o["traits"].flatMap({ Data(base64Encoded: $0) }), let noble = o["nobleCultures"].flatMap({ Data(base64Encoded: $0) }),
                  let cultures = o["cultures"].flatMap({ Data(base64Encoded: $0) }) else { return Reply(ok: false, reason: "目录数据缺失。") }
            do { try NativeEngine.loadCatalogs(traits: traits, nobleCultures: noble, cultures: cultures); catalogsLoaded = true; return Reply() }
            catch { return Reply(ok: false, reason: error.localizedDescription) }
        case "open":
            guard let rawPayload = payload else { return Reply(ok: false, reason: "缺少世界数据。") }
            let unpacked = WireCodec.decompressIfNeeded(rawPayload)
            // v12.0.0：先释放旧引擎（1–2 GB 内存）再解析新世界，彻底根除 4C4G 轻量云换局 OOM 崩溃死循环！
            engine = nil; lastOwners = []; lastNationSig = []; resetSlimStaticCache()
            do {
                let e = try NativeEngine(world: unpacked)
                engine = e
                // 远程同步无需倒传 2–30MB 的 mapJSON 与完整 state()，支持 withoutMap / withoutState 毫秒级回包！
                let replyData: Data? = bool("withoutState") ? nil : state(slim: bool("slim"))
                var r = Reply(data: replyData)
                if !bool("withoutMap") { r.map = e.mapJSON }
                return r
            } catch { return Reply(ok: false, reason: error.localizedDescription) }
        case "isOpen": return Reply(ok: engine != nil)
        case "close": engine = nil; lastOwners = []; lastNationSig = []; resetSlimStaticCache(); return Reply()
        case "step":
            if let e = engine { advanceDays(e, days: max(1, int("days"))) }
            return data(engine == nil ? nil : state(stepping: true, slim: bool("slim")))
        case "state": return data(engine == nil ? nil : state())
        case "order": return command(engine?.order(armyId: str("armyId"), provinceIndex: int("province")))
        case "retreat": return command(engine?.order(armyId: str("armyId"), provinceIndex: int("province"), retreat: true))
        case "politics": return command(engine?.politics(declare: bool("declare"), int("a"), int("b")))
        case "fleetOrder": return command(engine?.fleetOrder(fleetId: str("id"), provinceIndex: optInt("province")))
        case "province": return data(engine?.province(int("index")))
        case "nationInfo": return data(engine?.nationInfo(int("index")))
        case "diplomacyInfo": return data(engine?.diplomacyInfo(int("index")))
        // 云端调校: the balance numbers from the cloud config（v11.0.0 补齐 LZ4 解压，修复远程 tuning 恒报调校数据无效）.
        case "tuning":
            guard let rawPayload = payload else { return Reply(ok: false, reason: "调校数据无效。") }
            let unpacked = WireCodec.decompressIfNeeded(rawPayload)
            guard let t = try? JSONDecoder().decode(Tuning.self, from: unpacked) else { return Reply(ok: false, reason: "调校数据无效。") }
            Tuning.current = t
            return Reply(ok: true, reason: "")
        case "tradeInfo": return data(engine?.tradeInfo(int("index")))
        case "armyRecord": return data(engine?.armyRecord(str("armyId")))
        case "financeInfo": return data(engine?.financeInfo(int("index")))
        case "regionInfo": return data(engine?.regionInfo(int("province")))
        case "renameRegion": return command(engine?.renameRegion(int("province"), str("name")))
        case "setRegionCenter": return command(engine?.setRegionCenter(int("province")))
        case "chronicle": return data(engine?.chronicle(str("category")))
        case "generals": return data(engine?.generals())
        case "setCalendar": return command(engine?.setCalendar(era: str("era"), year: optInt("year")))
        case "setCityCulture": return command(engine?.setCityCulture(int("province"), str("culture")))
        case "debt": return command(engine?.changeDebt(int("n"), borrow: bool("borrow")))
        case "corruption": return command(engine?.changeCorruption(int("n"), lower: bool("lower")))
        case "incite": return command(engine?.inciteRebellion(int("n")))
        case "setHoly": return command(engine?.setHolyProvince(int("province"), religion: optStr("religion")))
        case "foundNation": return command(engine?.foundNation(int("province"), war: int("war") == 1))
        case "familyAction": return command(engine?.familyAction(int("id"), action: str("action")))
        case "setTax": return command(engine?.setTax(int("n"), str("value")))
        case "familyTree": return data(engine?.familyTree(str("family")))
        case "setLivelihood": return command(engine?.setLivelihood(int("n"), str("value")))
        case "setSpecialty": return command(engine?.setSpecialty(int("province"), optInt("good")))
        case "view": return data(engine?.view(str("mode")))
        case "worldSettings": return data(engine?.worldSettings())
        case "setWorld": return command(engine?.setWorld(str("key"), int("value")))
        case "triggerCivilWar": return command(engine?.triggerCivilWar(int("n")))
        case "rts": return command(engine?.rtsOrder(armyIds: strs("armyIds"), nation: int("nation"), province: int("province"), defend: bool("defend")))
        case "nationHistory": return data(engine?.nationHistory(int("n")))
        case "territory": return command(engine?.territoryEdit(ints("provinces"), to: int("nation")))
        case "statistics": return data(engine?.statistics(str("category")))
        case "alliance": return command(engine?.alliance(int("a"), with: int("b")))
        case "releaseVassal": return command(engine?.releaseVassal(int("n")))
        case "makeVassal": return command(engine?.makeVassal(int("vassal"), of: int("overlord")))
        case "annex": return command(engine?.annex(int("target"), by: int("annexer")))
        case "setAutoDiplomacy": return command(engine?.setAutoDiplomacy(int("n"), enabled: bool("enabled")))
        case "route":
            var r = Reply(); r.points = engine?.route(armyId: str("armyId")) ?? []; return r
        case "save": return data(engine?.save())
        case "enableAppRules": engine?.enableAppRules(); return Reply()
        // Where a day goes (Profile.swift): switched on, then read back as text.
        case "profile": Profile.reset(); Profile.enabled = bool("on"); return Reply()
        case "profileReport": return Reply(data: Data(Profile.report.utf8))
        case "regime":
            let g: (history: [String], trait: String) = engine?.regime(int("n")) ?? (history: [], trait: "")
            var r = Reply(); r.strings = g.history; r.text = g.trait; return r
        case "editPerson": return command(engine?.editPerson(int("id"), skills: dbls("skills"), traits: strs("traits")))
        case "setBonus": return command(engine?.setBonus(int("n"), key: str("key"), value: dbl("value")))
        case "setWorldRule":
            let result = engine?.setWorldRule(str("key"), value: dbl("value"))
            if bool("withoutState"), let result { return Reply(ok: result.ok, reason: result.reason) }
            return command(result)
        case "worldRules": return data(engine?.worldRules())
        case "editFleet": return command(engine?.editFleet(str("id"), ships: optInt("ships"), name: optStr("name")))
        case "scaleTotal": return command(engine?.scaleTotal(int("n"), key: str("key"), value: dbl("value") ?? -1))
        case "editParty": return command(engine?.editParty(int("n"), party: int("party"), name: optStr("name"), seats: optInt("seats")))
        case "editIdentity": lastOwners = []; return command(engine?.editIdentity(int("n"), name: optStr("name"), color: optStr("color")))
        case "setCapital": lastOwners = []; return command(engine?.setCapital(int("n"), province: int("province")))
        case "editProvince": return command(engine?.editProvince(int("index"), population: dbl("population"), fortress: args["fortress"] is NSNull || args["fortress"] == nil ? nil : bool("fortress")))
        case "setTemper": return command(engine?.setTemper(int("n"), dbl("value")))
        case "renamePerson": return command(engine?.renamePerson(int("id"), first: optStr("first"), last: optStr("last"), age: optInt("age")))
        case "editNation": return command(engine?.editNation(int("n"), gold: dbl("gold"), destiny: dbl("destiny"), polity: optStr("polity"), culture: optStr("culture"), religion: optStr("religion")))
        case "setStyle": return command(engine?.setStyle(int("n"), style: str("style")))
        case "treaty": return command(engine?.treaty(int("a"), int("b"), years: int("years"), kind: str("kind")))
        case "gift": return command(engine?.gift(int("from"), to: int("to"), gold: dbl("gold") ?? 0))
        case "posts": return data(engine?.posts(int("n")))
        case "postCandidates": return data(engine?.postCandidates(int("n"), post: str("post")))
        case "appointPost": return command(engine?.appointPost(int("n"), post: str("post"), personId: int("person")))
        case "officeCandidates": return data(engine?.officeCandidates(int("n"), office: str("office")))
        case "appointOffice": return command(engine?.appointOffice(int("n"), office: str("office"), personId: int("person")))
        case "editCourt": return command(engine?.editCourt(int("n"), key: str("key"), value: dbl("value") ?? .nan))
        case "setCourtManual": return command(engine?.setCourtManual(int("n"), manual: bool("manual")))
        case "createCulture": return command(engine?.createCulture(base: str("base"), name: str("name")))
        case "createFaith": return command(engine?.createFaith(name: str("name")))
        case "createBlankLand": return command(engine?.createBlankLand(int("province"), name: str("name"), unconquerable: int("unconquerable") == 1))
        case "allianceList": return data(engine?.allianceList())
        case "editAlliance": return command(engine?.editAlliance(int("i"), name: optStr("name"), color: optStr("color"), unbreakable: optInt("unbreakable").map { $0 == 1 }))
        case "allianceMember": return command(engine?.allianceMember(int("i"), nation: int("n"), join: int("join") == 1))
        case "disbandAlliance": return command(engine?.disbandAlliance(int("i")))
        case "districtList": return data(engine?.districtList())
        case "setDistrict": return command(engine?.setDistrict(int("province"), region: int("region"), name: optStr("name")))
        case "deleteDistrict": return command(engine?.deleteDistrict(int("region")))
        case "regenerateDistricts": return command(engine?.regenerateDistricts())
        case "familyList": return data(engine?.familyList())
        case "setFamilyLand": return command(engine?.setFamilyLand(int("province"), family: optStr("family")))
        case "editFamily": lastOwners = []; return command(engine?.editFamily(str("family"), surname: optStr("surname"), influence: optInt("influence").map(Double.init), strip: int("strip") == 1, allowFemale: optInt("allowFemale").map { $0 == 1 }))
        case "marryHouses": return command(engine?.marryHouses(str("a"), with: str("b")))
        case "houseDiplomacy": return command(engine?.houseDiplomacy(str("a"), with: optStr("b"), kind: str("kind")))
        case "createHouse": lastOwners = []; return command(engine?.createHouse(int("n"), province: int("province"), surname: optStr("surname")))
        case "setProvinceDefense": return command(engine?.setProvinceDefense(int("province"), level: optInt("level")))
        case "lockPopulation": return command(engine?.lockPopulation(int("province"), lock: int("lock") == 1))
        case "placeNames": return data(engine?.placeNames())
        case "renameAllByCulture": return command(engine?.renameAllByCulture())
        case "randomProvinceName": return command(engine?.randomProvinceName(int("province")))
        case "randomNationName": lastOwners = []; return command(engine?.randomNationName(int("n")))
        case "setNameTemplate": lastOwners = []; return command(engine?.setNameTemplate(int("n"), template: optStr("template")))
        case "setBaseName": lastOwners = []; return command(engine?.setBaseName(int("n"), base: str("base")))
        case "mapExtras": return data(engine?.mapExtras())
        case "addMapRiver": return command(engine?.addMapRiver(points: dbls("points")))
        case "clearMapRivers": return command(engine?.clearMapRivers())
        case "setMapImage": return command(engine?.setMapImage(id: int("id"), name: str("name"), data: optStr("data"), x: Double(int("x")), y: Double(int("y")), width: Double(int("width")), angle: Double(int("angle")) / 1000, alpha: Double(int("alpha")) / 1000, front: int("front") == 1, visible: int("visible") == 1))
        case "removeMapImage": return command(engine?.removeMapImage(id: int("id")))
        case "addExtraUnit": return command(engine?.addExtraUnit(int("n"), base: str("base"), name: str("name"), power: Double(int("power")), speed: Double(int("speed")), weight: Double(int("weight"))))
        case "extraUnits": return data(engine?.extraUnits(int("n")))
        case "removeExtraUnit": return command(engine?.removeExtraUnit(int("n"), at: int("i")))
        case "exportPackage": return data(engine?.exportPackage(int("n")))
        case "importPackage": return command(engine?.importPackage(int("n"), text: str("text")))
        case "setStateTrait": return command(engine?.setStateTrait(int("n"), trait: optStr("trait"), on: int("on") == 1))
        case "setOfficeTitle": return command(engine?.setOfficeTitle(int("n"), office: str("office"), title: optStr("title")))
        case "unitProfile": return data(engine?.unitProfile(int("n")))
        case "setUnitProfile": return command(engine?.setUnitProfile(int("n"), unit: str("unit"), name: optStr("name"), power: optInt("power").map(Double.init), speed: optInt("speed").map(Double.init), weight: optInt("weight").map(Double.init)))
        case "leaveAlliance":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let idx = int("n")
            let nations = e.run.world.nations.asArray
            if UnitKinds.enabled && HistoricalEvents.isHistoricalRoute(e.run), nations.indices.contains(idx) {
                let res = Alliances.leave(e.run, nations[idx].id.asString)
                return command(res)
            }
            return command(e.leaveAllianceForced(idx))
        case "catalogEdits": return data(engine?.catalogEdits())
        case "setCultureEdit": return command(engine?.setCultureEdit(str("culture"), name: optStr("name"), text: optStr("text"), male: strs("male"), female: strs("female")))
        case "setFaithEdit": return command(engine?.setFaithEdit(str("faith"), name: optStr("name"), text: optStr("text")))
        case "mapLabels": return data(engine?.mapLabels())
        case "setMapLabel": return command(engine?.setMapLabel(id: int("id"), text: str("text"), x: Double(int("x")), y: Double(int("y")), size: Double(int("size")), color: str("color"), angle: Double(int("angle")) / 1000))
        case "removeMapLabel": return command(engine?.removeMapLabel(id: int("id")))
        case "grantRegion": return command(engine?.grantRegion(int("province"), size: int("size"), to: int("n")))
        case "greatRebellion": return command(engine?.greatRebellion(int("province"), size: int("size"), kind: optStr("kind")))
        case "restoreNation": return command(engine?.restoreNation(int("province"), nation: int("n"), size: int("size")))
        case "provinceDisaster": return command(engine?.provinceDisaster(int("province"), kind: optStr("kind")))
        case "clearArmies": return command(engine?.clearArmies(int("province")))
        case "setProvinceFaith": return command(engine?.setProvinceFaith(int("province"), religion: str("religion")))
        case "setProvinceGrain": return command(engine?.setProvinceGrain(int("province"), grain: Double(int("grain"))))
        case "setReform": return command(engine?.setReform(int("n"), reform: str("reform"), on: int("on") == 1))
        case "addArmy": return command(engine?.addArmy(int("n"), province: int("province"), count: optInt("count") ?? 1))
        case "editArmy": return command(engine?.editArmy(str("armyId"), troops: optInt("troops"), unit: optStr("unit"), morale: dbl("morale")))
        case "armyManual": return command(engine?.setArmyManual(str("armyId"), manual: bool("manual")))
        case "releaseToAI": return command(engine?.releaseToAI(armyIds: strs("armyIds")))
        case "holdArmy": return command(engine?.holdArmy(str("armyId")))
        case "returnHome": return command(engine?.returnHome(str("armyId")))
        case "reinforceArmy": return command(engine?.reinforceArmy(str("armyId")))
        case "splitArmy": return command(engine?.splitArmy(str("armyId")))
        case "mergeArmy": return command(engine?.mergeArmy(str("armyId"), into: str("text")))
        case "disbandArmy": return command(engine?.disbandArmy(str("armyId")))
        case "renameArmy": return command(engine?.renameArmy(str("armyId"), name: str("text")))
        case "setArmyBranch": return command(engine?.setArmyBranch(str("armyId"), branch: str("text"), rename: bool("manual")))
        case "appointBestCommander": return command(engine?.appointBestCommander(str("armyId")))
        case "fieldResupply": return command(engine?.fieldResupply(str("armyId")))
        case "fieldDrill": return command(engine?.fieldDrill(str("armyId")))
        case "fleetManual": return command(engine?.setFleetManual(str("armyId"), manual: bool("manual")))
        case "fleetMission": return command(engine?.setFleetMission(str("armyId"), mission: str("text")))
        case "fleetComposition": return command(engine?.setFleetComposition(str("armyId"), spec: str("text")))
        case "fleetRepair": return command(engine?.refitFleetNow(str("armyId")))
        case "fleetAdmiral": return command(engine?.assignFleetAdmiral(str("armyId")))
        case "nationNavalDoctrine": return command(engine?.setNationNavalDoctrine(int("n"), mission: str("text")))
        case "nationDecree": return command(engine?.nationDecree(int("n"), kind: str("kind")))
        case "nationMilitaryOrder": return command(engine?.nationMilitaryOrder(int("n"), kind: str("kind")))
        case "nationDiplomacyOrder": return command(engine?.nationDiplomacyOrder(int("n"), kind: str("kind")))
        case "throneCandidates": return data(engine?.throneCandidates(int("n")))
        case "enthronePerson": lastOwners = []; return command(engine?.enthronePerson(int("n"), personId: int("person")))
        case "nationProvinces": return data(engine?.nationProvinces(int("n")))
        case "nationReigns": return data(engine?.nationReigns(int("n")))
        case "replayTimeline": return data(engine?.replayTimeline())
        case "regimeTransition": lastOwners = []; return command(engine?.regimeTransition(int("n"), action: str("action")))
        case "sendUltimatum": lastOwners = []; return command(engine?.sendUltimatum(int("from"), to: int("to"), demand: str("demand")))
        case "formCoalition": return command(engine?.formCoalition(int("caller"), against: int("target")))
        case "covertAction": lastOwners = []; return command(engine?.covertAction(int("from"), target: int("target"), kind: str("kind")))
        case "mediatePeace": return command(engine?.mediatePeace(int("mediator"), between: int("a"), and: int("b")))
        case "grantFief": return command(engine?.grantFief(int("n"), familyId: str("family"), provinceIndex: optInt("province")))
        case "revokeFief": lastOwners = []; return command(engine?.revokeFief(int("n"), familyId: str("family")))
        case "partyAction": return command(engine?.partyAction(int("n"), partyIndex: int("party"), action: str("action")))
        case "setArmyFormation": return command(engine?.setArmyFormation(str("armyId"), formation: str("text")))
        case "setArmyFieldOrder": return command(engine?.setArmyFieldOrder(str("armyId"), order: str("text")))
        case "upgradeShipyard": return command(engine?.upgradeShipyard(provinceIndex: int("province")))
        case "queueShipbuilding": return command(engine?.queueShipbuilding(nationIndex: int("n"), provinceIndex: int("province"), fleetId: optStr("fleetId"), spec: str("spec")))
        case "buildProvinceInfra": return command(engine?.buildProvinceInfra(int("province"), slot: str("slot")))
        case "investTech": return command(engine?.investTech(int("n"), branch: str("branch")))
        case "resolveEventChain": return command(engine?.resolveEventChain(int("n"), chainId: str("chainId"), choice: str("choice")))
        case "nationBreakdown": return data(engine?.nationBreakdown(int("n")))
        case "provinceBreakdown": return data(engine?.provinceBreakdown(int("province")))
        case "warCompare": return data(engine?.warCompare(attacker: int("a"), defender: int("b")))
        case "grandInfo": return data(engine?.grandInfo(int("n")))
        case "startWonder": return command(engine?.startWonder(int("n"), wonderId: str("wonder"), provinceIndex: optInt("province")))
        case "claimMission": return command(engine?.claimMission(int("n"), missionId: str("mission")))
        case "startGoldenAge": return command(engine?.startGoldenAge(int("n")))
        case "hireMercenary": return command(engine?.hireMercenary(int("n"), mercId: str("merc")))
        case "dispatchExpedition": return command(engine?.dispatchExpedition(int("n"), siteId: str("site")))
        case "nuclearInfo":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let idx = int("n")
            let nations = e.run.world.nations.asArray
            guard nations.indices.contains(idx) else { return Reply(ok: false, reason: "目标国家不存在。") }
            return data(Data(NuclearWarfare.statusJS(e.run, nationId: nations[idx].id.asString).json.utf8))
        case "buildReactor":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let idx = int("n")
            let nations = e.run.world.nations.asArray
            guard nations.indices.contains(idx) else { return Reply(ok: false, reason: "目标国家不存在。") }
            let res = NuclearWarfare.buildReactor(e.run, nationId: nations[idx].id.asString)
            return command((ok: res.ok, reason: res.text))
        case "nuclearStrike":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let idx = optInt("attacker") ?? int("n")
            let prov = int("province")
            let nations = e.run.world.nations.asArray
            guard nations.indices.contains(idx) else { return Reply(ok: false, reason: "发起国不存在。") }
            let res = NuclearWarfare.nuclearStrike(e.run, attackerId: nations[idx].id.asString, provinceIndex: prov)
            if res.ok { lastOwners = [] }
            return command((ok: res.ok, reason: res.text))
        case "mobilizeIndustry":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let idx = int("n")
            let nations = e.run.world.nations.asArray
            guard nations.indices.contains(idx) else { return Reply(ok: false, reason: "目标国家不存在。") }
            let rawLevel = str("level").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let normLevel: String = (rawLevel == "war" || rawLevel == "wareconomy") ? "war_economy" : rawLevel
            let res = NuclearWarfare.setMobilization(e.run, nationId: nations[idx].id.asString, level: normLevel)
            return command((ok: res.ok, reason: res.text))
        case "setRebelMode":
            return command(engine?.setRebelMode(str("mode")))
        case "eraMilitaryInfo":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let era = EraMilitarySystem.currentEra(e.run)
            let summary = EraMilitarySystem.eraSummaryJS(e.run)
            let unitRows = EraMilitarySystem.eraUnits(for: era).map { k -> JS in
                let u = JS.object()
                u.key = JS(k.key)
                u.name = JS(k.name)
                u.note = JS(k.note)
                return u
            }
            summary.allowedUnits = .array(unitRows)
            return data(Data(summary.json.utf8))
        case "resolveHistoricalEvent":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let choiceIdx = max(0, optInt("choiceIndex") ?? optInt("choice") ?? 0)
            let res = HistoricalEvents.resolveChoice(e.run, eventId: str("eventId"), choiceIndex: choiceIdx)
            lastOwners = []
            return command(res)
        case "setDoctrine":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let idx = int("n")
            let nations = e.run.world.nations.asArray
            let rawDoc = optStr("doctrineId") ?? str("doctrine")
            guard nations.indices.contains(idx),
                  let did = MilitaryDoctrines.DoctrineId(rawValue: rawDoc) else {
                return Reply(ok: false, reason: "军事学说或国家参数无效。")
            }
            return command(MilitaryDoctrines.setDoctrine(e.run, nationId: nations[idx].id.asString, doctrineId: did))
        case "doctrineInfo":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let idx = int("n")
            let nations = e.run.world.nations.asArray
            guard nations.indices.contains(idx) else { return Reply(ok: false, reason: "目标国家不存在。") }
            let nid = nations[idx].id.asString
            let era = HistoricalEra.current(e.run)
            let cur = MilitaryDoctrines.doctrine(e.run, nationId: nid)
            let o = JS.object()
            o.activeId = JS(cur.id.rawValue)
            o.activeName = JS(cur.name)
            o.activeTag = JS(cur.shortTag)
            o.activeSummary = JS(cur.summary)
            o.historicalRoute = JS(HistoricalEvents.isHistoricalRoute(e.run) ? "historical" : "sandbox")
            if let buff = MilitaryDoctrines.activeCampaignBuff(e.run, nationId: nid) {
                o.campaignBuff = JS(buff.label)
            }
            o.available = .array(MilitaryDoctrines.allSpecs(for: era).map { sp in
                let s = JS.object()
                s.id = JS(sp.id.rawValue)
                s.name = JS(sp.name)
                s.shortTag = JS(sp.shortTag)
                s.summary = JS(sp.summary)
                s.marchPct = JS(Int(((sp.marchSpeedMult - 1.0) * 100.0).rounded()))
                s.attackPct = JS(Int(sp.attackBonusPct.rounded()))
                s.defensePct = JS(Int(sp.defenseBonusPct.rounded()))
                s.navalPct = JS(Int(sp.navalBonusPct.rounded()))
                return s
            })
            var gens = [JS]()
            for a in e.run.world.armies.asArray where a.nationId.optionalString == nid {
                if let c = MilitaryDoctrines.commander(e.run, armyId: a.id.asString) {
                    let g = JS.object()
                    g.armyId = JS(a.id.asString)
                    g.armyName = JS(a.name.asString)
                    g.name = JS(c.name)
                    g.title = JS(c.title)
                    g.military = JS(c.military)
                    g.tactic = JS(c.tacticTag)
                    gens.append(g)
                }
            }
            o.commanders = .array(gens)
            return data(Data(o.json.utf8))
        case "setPlayerNation":
            guard let e = engine else { return Reply(ok: false, reason: "世界尚未载入。") }
            let idx = int("n")
            let nations = e.run.world.nations.asArray
            if nations.indices.contains(idx) {
                Regimes.enable(e.run)
                e.run.regimes.playerNationId = JS(nations[idx].id.asString)
            } else if !e.run.regimes.isNull {
                e.run.regimes.playerNationId = .null
            }
            return Reply()
        default: return Reply(ok: false, reason: "未知请求 \(call)。")
        }
    }
}

/// 自动接入: the room this player's phone and computer meet in without typing anything (built into both
/// the app and the server; a pairing.txt next to the server overrides it).
public enum RemoteRoom {
    public static let personal = "ECZV5UL3UV"
    public static let port: UInt16 = 8765
}

/// Frame helpers shared by the server and the app's remote link.
public enum EngineWire {
    /// v6：全双工多路复用主动推流（TCP Mux + Relay Push）+ 跨平台 LZ4 二进制压缩 + 精简推演帧。
    /// 向下兼容 v5/v4 服务器，玩家未更新电脑端时亦可正常连接。
    public static let greeting = "列国纪远程计算·6"
    public static let compatibleGreetings: Set<String> = ["列国纪远程计算·6", "列国纪远程计算·5", "列国纪远程计算·4"]

    // Full-duplex multiplexed TCP frame types (after `enableMux` handshake)
    public static let muxRequest: UInt8 = 1
    public static let muxReply: UInt8 = 2
    public static let muxPush: UInt8 = 3
    public static let muxPing: UInt8 = 4
    public static let muxPong: UInt8 = 5
    /// v8 滑动窗口背压确认帧（客户端消费完一帧立刻回传 9 字节 ACK，彻底根除 TCP Bufferbloat 与跳月瞬移）。
    public static let muxAck: UInt8 = 6
    /// v13 紧凑二进制 `LGB1` 差量推流帧（单帧 < 1 KB，3 Mbps 轻量云服满帧无排队）。
    public static let muxBinaryPush: UInt8 = 7

    public static func u32(_ n: Int) -> Data { var v = UInt32(n).bigEndian; return Data(bytes: &v, count: 4) }
    public static func readU32(_ d: Data, at i: Int) -> Int { d[d.startIndex + i..<d.startIndex + i + 4].reduce(0) { $0 << 8 | Int($1) } }
    public static func muxFrame(type: UInt8, id: UInt32, body: Data) -> Data {
        var out = Data(capacity: 9 + body.count)
        out.append(type)
        out.append(u32(Int(id)))
        out.append(u32(body.count))
        out.append(body)
        return out
    }
    public static func request(_ call: String, _ args: [String: Any], payload: Data?, compressPayload: Bool = false) -> Data {
        let header = (try? JSONSerialization.data(withJSONObject: ["call": call, "args": args])) ?? Data("{}".utf8)
        var out = u32(header.count); out.append(header)
        let raw = payload ?? Data()
        let p = (compressPayload && raw.count >= 256) ? WireCodec.compress(raw) : raw
        out.append(u32(p.count)); out.append(p)
        return out
    }
    public static func reply(_ r: EngineService.Reply, compress: Bool = false) -> Data {
        let header = r.header()
        let rawData = r.data ?? Data()
        let rawMap = r.map ?? Data()
        let data = (compress && rawData.count >= 256) ? WireCodec.compress(rawData) : rawData
        let map = (compress && rawMap.count >= 256) ? WireCodec.compress(rawMap) : rawMap
        var out = u32(header.count); out.append(header)
        out.append(u32(data.count)); out.append(data)
        out.append(u32(map.count)); out.append(map)
        return out
    }
}
