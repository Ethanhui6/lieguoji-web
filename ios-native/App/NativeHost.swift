import Foundation
import Network
import LieguojiCore

/// The engine of the running world on its own serial executor (the engine keeps static tables, so
/// every call goes through this one actor). Days, commands and saves run in Swift — on the phone, or,
/// with 远程计算, on a computer running LieguojiServer (the phone then only draws). Both paths run the
/// same EngineService requests.
actor NativeHost {
    private let service = EngineService()
    private var remote: EngineLink?
    private(set) var remoteAddress: String?
    private(set) var remoteTransport: String = ""
    private(set) var lastRTTMs: Int?
    private(set) var serverSupportsStream = false
    private(set) var parked = false
    private static var catalogs = false

    /// 玩家自定或默认配对房间码（用于远程计算与云端存档统一寻址）。
    nonisolated static var activeRoomCode: String {
        let custom = (UserDefaults.standard.string(forKey: "remote.roomCode") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "-", with: "")
            .uppercased()
        if custom.count >= 6, custom.count <= 16, custom.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) {
            return custom
        }
        return RemoteRoom.personal
    }

    static func catalogData() throws -> (traits: Data, noble: Data, cultures: Data) {
        func data(_ name: String, _ ext: String, _ dir: String) throws -> Data {
            guard let url = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: dir) else { throw EngineError.message("安装包缺少\(name)数据") }
            return try Data(contentsOf: url)
        }
        return (try data("traits", "json", "Catalog"), try data("noble-cultures", "json", "Catalog"), try data("cultures", "json", "World"))
    }
    static func loadCatalogs() throws {
        if catalogs { return }
        let c = try catalogData()
        try NativeEngine.loadCatalogs(traits: c.traits, nobleCultures: c.noble, cultures: c.cultures)
        catalogs = true
    }

    // MARK: - channel

    /// The world the computer last returned (a save), so a broken link or PC restart can recover seamlessly.
    private var lastWorld: Data?

    /// One request, on the computer when connected, else in process.
    /// 遇单次瞬时抖动先静默快速重连重试一次，避免偶发网络波动就把整局踢回本机。
    private func call(_ name: String, _ args: [String: Any] = [:], payload: Data? = nil) async -> EngineService.Reply {
        if let remote {
            let t0 = Date().timeIntervalSinceReferenceDate
            do {
                let r = try await remote.call(name, args, payload: payload)
                let ms = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
                if name == "ping" || name == "pullLatest" || name == "step" || name == "state" {
                    lastRTTMs = lastRTTMs.map { Int(Double($0) * 0.65 + Double(ms) * 0.35) } ?? ms
                }
                return r
            } catch {
                // 首次断链先尝试静默闪连恢复（仅非 open/catalogs 大包）
                remote.cancel(); self.remote = nil; remoteAddress = nil; serverSupportsStream = false
                if name != "open" && name != "catalogs" && !parked {
                    if let _ = await reattachQuick() {
                        if let fresh = self.remote, let retry = try? await fresh.call(name, args, payload: payload) {
                            return retry
                        }
                    }
                }
                lost = true
                return EngineService.Reply(ok: false, reason: "与电脑的连接中断")
            }
        }
        if parked { return EngineService.Reply(ok: false, reason: "已暂存后台，返回前台即自动续连") }
        if lost { return EngineService.Reply(ok: false, reason: "与电脑的连接中断，正在重连") }
        return service.handle(name, args, payload: payload)
    }

    /// Connects to a computer and moves the world there (catalogues first, then the current save).
    func connect(_ address: String, timeout: Double = 6, reattach: Bool = false) async throws -> String {
        let text = address.trimmingCharacters(in: .whitespaces)
        let code = text.replacingOccurrences(of: "-", with: "").uppercased()
        let link: EngineLink, label: String, transport: String
        if code.count >= 6, code.count <= 16, code.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }), !text.contains(".") {
            // 优先持久 WebSocket 高速通道（零轮询开销），若运营商拦截 WS 自动无缝降级至 HTTP/2 Gzip 中转
            let relayProbe = RelayLink(code: code)
            let status = await relayProbe.status()
            guard let status else { throw EngineError.message("连不上云端中转服务器，请检查网络。") }
            guard status.online else { throw EngineError.message("电脑不在线：请在电脑上运行「列国纪远程计算」，并核对配对码。") }
            if let ws = try? await RelayWSLink.connect(code: code, base: relayProbe.activeBase) {
                link = ws
                transport = "云端高速通道"
                label = code == Self.activeRoomCode ? "云端高速通道" : "配对码 \(code.prefix(4))-\(code.dropFirst(4))"
            } else {
                try await relayProbe.start()
                link = relayProbe
                transport = "云端中转"
                label = code == Self.activeRoomCode ? "云端中转" : "配对码 \(code.prefix(4))-\(code.dropFirst(4))"
            }
        } else {
            var host = text, port: UInt16 = 8765
            if let i = host.lastIndex(of: ":"), let p = UInt16(host[host.index(after: i)...]) { port = p; host = String(host[..<i]) }
            guard !host.isEmpty else { throw EngineError.message("请填写配对码或电脑的局域网地址") }
            let direct = RemoteLink(host: host, port: port)
            try await direct.start(timeout: timeout)
            link = direct
            transport = "局域网直连"
            label = "\(host):\(port)（局域网）"
        }
        let t0 = Date().timeIntervalSinceReferenceDate
        let hello = try await link.call("ping", [:], payload: nil)
        let rtt = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
        guard hello.ok else { link.cancel(); throw EngineError.message("对方不是列国纪远程计算服务器") }
        guard EngineWire.compatibleGreetings.contains(hello.reason) else {
            link.cancel()
            throw EngineError.message("电脑上的计算服务器版本较旧，请更新后再连接；这局先用手机计算。")
        }
        let isV5 = (hello.reason == EngineWire.greeting)

        if reattach {
            let isOpen = (try? await link.call("isOpen", [:], payload: nil))?.ok ?? false
            if isOpen {
                remote = link; remoteAddress = label; remoteTransport = transport
                lastRTTMs = rtt; serverSupportsStream = isV5
                lost = false; parked = false; lastAddress = address
                return label
            }
            // 电脑若在离开期间重启过，自动用最近热备无缝恢复世界！
            if let backup = lastWorld ?? service.engine?.save() {
                let c = try Self.catalogData()
                let catalogs = try JSONSerialization.data(withJSONObject: [
                    "traits": c.traits.base64EncodedString(),
                    "nobleCultures": c.noble.base64EncodedString(),
                    "cultures": c.cultures.base64EncodedString()
                ])
                guard (try await link.call("catalogs", [:], payload: catalogs)).ok,
                      (try await link.call("open", [:], payload: backup)).ok else {
                    link.cancel()
                    throw EngineError.message("电脑重启后恢复世界失败")
                }
                _ = try? await link.call("enableAppRules", [:], payload: nil)
                remote = link; remoteAddress = label; remoteTransport = transport
                lastRTTMs = rtt; serverSupportsStream = isV5
                lost = false; parked = false; lastAddress = address
                return label
            }
            link.cancel(); throw EngineError.message("电脑上的世界已关闭")
        }

        let c = try Self.catalogData()
        let catalogs = try JSONSerialization.data(withJSONObject: [
            "traits": c.traits.base64EncodedString(),
            "nobleCultures": c.noble.base64EncodedString(),
            "cultures": c.cultures.base64EncodedString()
        ])
        let loaded = try await link.call("catalogs", [:], payload: catalogs)
        guard loaded.ok else { link.cancel(); throw EngineError.message(loaded.reason) }
        if let save = service.engine?.save() {
            let opened = try await link.call("open", [:], payload: save)
            guard opened.ok else { link.cancel(); throw EngineError.message("电脑载入世界失败：\(opened.reason)") }
            _ = try await link.call("enableAppRules", [:], payload: nil)
            lastWorld = save
        }
        remote = link; remoteAddress = label; remoteTransport = transport
        lastRTTMs = rtt; serverSupportsStream = isV5
        lastAddress = address; lost = false; parked = false
        return label
    }

    /// Back to the phone: the computer's world comes home first.
    func disconnect() async {
        parked = false; lost = false; serverSupportsStream = false; lastRTTMs = nil
        guard let link = remote else { remoteAddress = nil; remoteTransport = ""; return }
        _ = try? await link.call("streamConfig", ["playing": false, "days": 3], payload: nil)
        if let save = try? await link.call("save", [:], payload: nil), let data = save.data {
            _ = service.handle("open", [:], payload: data); service.engine?.enableAppRules()
            lastWorld = data
        }
        link.cancel(); remote = nil; remoteAddress = nil; remoteTransport = ""
    }

    /// 退入后台：优雅暂停服务端预推演并热保留电脑内存中的世界，不触发断线降级手机计算。
    func parkForBackground() async -> Bool {
        guard let link = remote else { return parked || lost }
        if serverSupportsStream {
            _ = try? await link.call("streamConfig", ["playing": false, "days": 3], payload: nil)
            _ = try? await link.call("park", [:], payload: nil)
        }
        link.cancel()
        remote = nil
        parked = true
        lost = false
        return true
    }

    /// 回到前台：局域网优先 → 云端 WebSocket → HTTP 中转，秒级无感重挂世界并拉取最新权威状态。
    func resumeFromForeground() async -> (connected: Bool, label: String?, transport: String, rttMs: Int?, state: Data?) {
        // 已在线时做一次轻探针确认链路鲜活
        if let link = remote {
            let t0 = Date().timeIntervalSinceReferenceDate
            if let pong = try? await link.call("ping", [:], payload: nil), pong.ok {
                let rtt = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
                lastRTTMs = rtt; parked = false; lost = false
                let resumed = (try? await link.call(serverSupportsStream ? "resume" : "state", [:], payload: nil))?.data
                return (true, remoteAddress, remoteTransport, rtt, resumed)
            }
            link.cancel(); remote = nil; remoteAddress = nil; serverSupportsStream = false
        }
        guard parked || lost else { return (false, nil, "", nil, nil) }
        if let label = await reattachBest() {
            let resumed = (try? await remote?.call(serverSupportsStream ? "resume" : "state", [:], payload: nil))?.data
            return (true, label, remoteTransport, lastRTTMs, resumed)
        }
        return (false, nil, "", nil, nil)
    }

    /// The computer's link broke while it held the world; requests wait for a reattach or the fallback.
    private(set) var lost = false
    private var lastAddress: String?

    /// 单次静默闪连（仅用 2.2s 超时，快速恢复瞬间网络抖动）。
    private func reattachQuick() async -> String? {
        guard let address = lastAddress else { return nil }
        if let label = try? await connect(address, timeout: 2.2, reattach: true) { return label }
        let room = Self.activeRoomCode
        if address != room, let label = try? await connect(room, timeout: 2.8, reattach: true) { return label }
        return nil
    }

    /// 智能最优重挂：先查询房间状态拿最新局域网 IP（支持换 Wi-Fi 后的新地址），局域网优先、云端 WS 兜底。
    private func reattachBest() async -> String? {
        let room = Self.activeRoomCode
        if let status = await RelayLink(code: room).status(), status.online {
            for lanAddr in status.lan {
                if let label = try? await connect(lanAddr, timeout: 1.4, reattach: true) { return label }
            }
            if let label = try? await connect(room, timeout: 4.5, reattach: true) { return label }
        }
        if let address = lastAddress, let label = try? await connect(address, timeout: 3.5, reattach: true) { return label }
        return nil
    }

    /// Reattaches to the computer still holding the world (no upload unless PC restarted); nil if unreachable.
    func reattach() async -> String? {
        guard lost || parked else { return remoteAddress }
        return await reattachBest()
    }

    /// The computer is gone: continue on the phone from the last world it returned (the last save).
    func fallbackLocal() {
        lost = false; parked = false; serverSupportsStream = false; lastRTTMs = nil
        remote?.cancel(); remote = nil; remoteAddress = nil; remoteTransport = ""
        if let lastWorld { _ = service.handle("open", [:], payload: lastWorld); service.engine?.enableAppRules() }
    }
    var isRemote: Bool { remote != nil }
    var isRemoteActiveOrParked: Bool { remote != nil || parked || lost }

    /// 实时测速（供设置页与状态胶囊展示毫秒延迟）。
    func measureRTT() async -> Int? {
        guard let link = remote else { return nil }
        let t0 = Date().timeIntervalSinceReferenceDate
        guard let pong = try? await link.call("ping", [:], payload: nil), pong.ok else { return nil }
        let ms = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
        lastRTTMs = ms
        return ms
    }

    /// 通知 v5 电脑端开启/停止后台预推演流（让手机渲染的同时电脑已在并行计算下一步）。
    func configureRemoteStream(playing: Bool, days: Int) async {
        guard let link = remote, serverSupportsStream else { return }
        _ = try? await link.call("streamConfig", ["playing": playing, "days": max(1, min(60, days))], payload: nil)
    }

    /// 自动接入: finds this player's computer through the relay room; on the same Wi-Fi it connects
    /// directly via LAN TCP (2–8 ms), otherwise via persistent WebSocket relay. Nil when the computer is off.
    func connectAuto() async -> (label: String, transport: String, rttMs: Int?)? {
        if lost || parked {
            if let label = await reattachBest() { return (label, remoteTransport, lastRTTMs) }
            return nil
        }
        guard remote == nil, service.engine != nil else { return nil }
        let room = Self.activeRoomCode
        guard let status = await RelayLink(code: room).status(), status.online else { return nil }
        for address in status.lan {
            if let label = try? await connect(address, timeout: 1.5) { return (label, remoteTransport, lastRTTMs) }
        }
        if let label = try? await connect(room) { return (label, remoteTransport, lastRTTMs) }
        return nil
    }

    // MARK: - requests

    private var advances = AdvanceSession()

    func open(_ data: Data, world: Int) async throws -> (map: Data?, state: Data, revision: UInt64) {
        guard let revision = advances.replaceWorld(world: world) else { throw EngineError.message("世界已经切换，忽略旧的载入请求") }
        try Self.loadCatalogs()
        if remote != nil { lastWorld = data }
        let r = await call("open", payload: data)
        guard advances.revision == revision else { throw EngineError.message("世界已经切换，忽略旧的载入结果") }
        guard r.ok else { throw EngineError.message(r.reason) }
        return (r.map, r.data ?? Data(), revision)
    }

    private static let inputsLock = NSLock()
    private static var sharedGrid: (base: WorldMap, grid: TerrainGraph, document: TerrainDocument)?
    private static var creationInputs: CreationMap.Inputs?
    nonisolated static func seedSharedInputs(base: WorldMap, grid: TerrainGraph, document: TerrainDocument) {
        inputsLock.lock()
        if sharedGrid == nil { sharedGrid = (base, grid, document) }
        inputsLock.unlock()
    }
    static func loadCreationInputs() throws -> CreationMap.Inputs {
        inputsLock.lock()
        if let existing = creationInputs { inputsLock.unlock(); return existing }
        let cached = sharedGrid
        inputsLock.unlock()
        try loadCatalogs()
        guard let world = Bundle.main.url(forResource: "World", withExtension: nil),
              let resources = Bundle.main.url(forResource: "biome-resources", withExtension: "json", subdirectory: "Catalog") else { throw EngineError.message("安装包缺少建世界数据") }
        try OpeningGovernment.loadResources(Data(contentsOf: resources))
        let base = try cached?.base ?? WorldMap.load(directory: world)
        let grid = try cached?.grid ?? TerrainGraph(data: Data(contentsOf: world.appendingPathComponent("grid20k.bin")))
        let edges = try CreationMap.GridEdges(data: Data(contentsOf: world.appendingPathComponent("edges20k.bin")))
        let document = try cached?.document ?? TerrainDocument(data: Data(contentsOf: world.appendingPathComponent("doc20k.bin")))
        let x = CreationMap.Inputs(base: base, grid: grid, edges: edges, document: document)
        inputsLock.lock()
        creationInputs = x
        sharedGrid = nil
        inputsLock.unlock()
        return x
    }

    typealias Made = (map: Data?, state: Data, revision: UInt64, cityCount: Int)
    func create(_ options: NativeCreation.Options, world: Int, progress: @escaping @Sendable (String) -> Void) async throws -> Made {
        guard let revision = advances.replaceWorld(world: world) else { throw EngineError.message("世界已经切换，忽略旧的建世界请求") }
        let x = try Self.loadCreationInputs()
        let built = try autoreleasepool {
            try NativeCreation.generate(options, inputs: x, worldId: UUID().uuidString.lowercased(), runId: "fms-" + UUID().uuidString.lowercased(), progress: progress)
        }
        guard advances.revision == revision else { throw EngineError.message("世界已经切换，忽略旧的建世界结果") }
        let r: EngineService.Reply
        if remote != nil {
            let data = autoreleasepool { Data(built.json.utf8) }
            lastWorld = data
            r = await call("open", payload: data)
        } else {
            r = try autoreleasepool { service.adopt(try NativeEngine(created: built)) }
        }
        guard advances.revision == revision else { throw EngineError.message("世界已经切换，忽略旧的建世界结果") }
        guard r.ok else { throw EngineError.message(r.reason) }
        return (r.map, r.data ?? Data(), revision, built.cityCount)
    }

    func reclimate(precipitation: Double, temperatureOffset: Double, north: Double, south: Double) async throws -> Data {
        guard remote == nil, let e = service.engine else { throw EngineError.message("世界尚未载入。") }
        let json = try e.reclimate(try Self.loadCreationInputs(), precipitation: precipitation, temperatureOffset: temperatureOffset, north: north, south: south)
        struct Map: Decodable { let bin: String }
        guard let bin = Data(base64Encoded: try JSONDecoder().decode(Map.self, from: json).bin) else { throw EngineError.message("地图数据损坏") }
        return bin
    }
    func close(world: Int) async {
        guard advances.replaceWorld(world: world) != nil else { return }
        if remote != nil, serverSupportsStream {
            _ = try? await remote?.call("streamConfig", ["playing": false, "days": 3], payload: nil)
        }
        _ = await call("close")
    }

    typealias Step = Result<GameState, Error>
    func step(days: Int, revision: UInt64, producer: UInt64) async -> Step? {
        guard advances.admit(revision: revision, producer: producer) else { return nil }
        if remote == nil && !lost && !parked {
            guard let s = service.stepState(days: days) else { return .failure(EngineError.message("推演没有返回有效世界状态")) }
            return .success(s)
        }
        let op = serverSupportsStream ? "pullLatest" : "step"
        let data = await call(op, ["days": days]).data ?? Data()
        guard !data.isEmpty else { return .failure(EngineError.message("推演没有返回有效世界状态")) }
        return Result { try JSONDecoder().decode(GameState.self, from: data) }
    }
    func state() async -> Data? { await call("state").data }
    func localDayForTour() -> Int? {
        guard ShotTour.on, remote == nil, let engine = service.engine else { return nil }
        return engine.run.world.day.asInt
    }
    private func command(_ name: String, _ args: [String: Any]) async -> (ok: Bool, reason: String, state: Data?) {
        let r = await call(name, args); return (r.ok, r.reason, r.data)
    }
    private static func opt<T>(_ v: T?) -> Any { v.map { $0 as Any } ?? NSNull() }
    func armyAction(_ action: String, armyId: String, text: String = "", flag: Bool = false) async -> (ok: Bool, reason: String, state: Data?) {
        await command(action, ["armyId": armyId, "text": text, "manual": flag])
    }
    func order(armyId: String, province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("order", ["armyId": armyId, "province": province]) }
    func politics(declare: Bool, _ a: Int, _ b: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("politics", ["declare": declare, "a": a, "b": b]) }
    func fleetOrder(id: String, province: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("fleetOrder", ["id": id, "province": Self.opt(province)]) }
    func province(_ index: Int) async -> Data? { await call("province", ["index": index]).data }
    func nationInfo(_ index: Int) async -> Data? { await call("nationInfo", ["index": index]).data }
    func nationProvinces(_ index: Int) async -> Data? { await call("nationProvinces", ["n": index]).data }
    func throneCandidates(_ index: Int) async -> Data? { await call("throneCandidates", ["n": index]).data }
    func enthronePerson(_ index: Int, person: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("enthronePerson", ["n": index, "person": person]) }
    func diplomacyInfo(_ index: Int) async -> Data? { await call("diplomacyInfo", ["index": index]).data }
    func setTuning(_ data: Data) async { _ = await call("tuning", [:], payload: data) }
    func tradeInfo(_ index: Int) async -> Data? { await call("tradeInfo", ["index": index]).data }
    func armyRecord(_ id: String) async -> Data? { await call("armyRecord", ["armyId": id]).data }
    func financeInfo(_ index: Int) async -> Data? { await call("financeInfo", ["index": index]).data }
    func regionInfo(_ province: Int) async -> Data? { await call("regionInfo", ["province": province]).data }
    func renameRegion(_ province: Int, _ name: String) async -> (ok: Bool, reason: String, state: Data?) { await command("renameRegion", ["province": province, "name": name]) }
    func setRegionCenter(_ province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setRegionCenter", ["province": province]) }
    func generals() async -> Data? { await call("generals").data }
    func chronicle(_ category: String) async -> Data? { await call("chronicle", ["category": category]).data }
    func setCalendar(era: String, year: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("setCalendar", ["era": era, "year": Self.opt(year)]) }
    func setCityCulture(_ province: Int, _ culture: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setCityCulture", ["province": province, "culture": culture]) }
    func changeDebt(_ n: Int, borrow: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("debt", ["n": n, "borrow": borrow]) }
    func changeCorruption(_ n: Int, lower: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("corruption", ["n": n, "lower": lower]) }
    func inciteRebellion(_ n: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("incite", ["n": n]) }
    func setHolyProvince(_ province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setHoly", ["province": province]) }
    func foundNation(_ province: Int, war: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("foundNation", ["province": province, "war": war ? 1 : 0]) }
    func familyAction(_ id: Int, action: String) async -> (ok: Bool, reason: String, state: Data?) { await command("familyAction", ["id": id, "action": action]) }
    func setTax(_ n: Int, _ value: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setTax", ["n": n, "value": value]) }
    func familyTree(_ family: String) async -> Data? { await call("familyTree", ["family": family]).data }
    func setLivelihood(_ n: Int, _ value: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setLivelihood", ["n": n, "value": value]) }
    func setSpecialty(_ province: Int, _ good: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("setSpecialty", ["province": province, "good": Self.opt(good)]) }
    func view(_ mode: String) async -> Data? { await call("view", ["mode": mode]).data }
    func worldSettings() async -> Data? { await call("worldSettings").data }
    func worldRules() async -> Data? { await call("worldRules").data }
    func setWorldRule(_ key: String, value: Double?, revision: UInt64) async -> (ok: Bool, reason: String) {
        guard advances.revision == revision else { return (false, "世界已经切换。") }
        let result = await call("setWorldRule", ["key": key, "value": Self.opt(value), "withoutState": true])
        return (result.ok, result.reason)
    }
    func editFleet(_ id: String, ships: Int?, name: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("editFleet", ["id": id, "ships": Self.opt(ships), "name": Self.opt(name)]) }
    func setWorld(_ key: String, _ value: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setWorld", ["key": key, "value": value]) }
    func triggerCivilWar(_ n: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("triggerCivilWar", ["n": n]) }
    func rts(_ armyIds: [String], nation: Int, province: Int, defend: Bool) async -> (ok: Bool, reason: String, state: Data?) {
        await command("rts", ["armyIds": armyIds, "nation": nation, "province": province, "defend": defend])
    }
    func releaseToAI(_ armyIds: [String]) async -> (ok: Bool, reason: String, state: Data?) { await command("releaseToAI", ["armyIds": armyIds]) }
    func nationHistory(_ n: Int) async -> Data? { await call("nationHistory", ["n": n]).data }
    func nationReigns(_ n: Int) async -> Data? { await call("nationReigns", ["n": n]).data }
    func nationBreakdown(_ n: Int) async -> Data? { await call("nationBreakdown", ["n": n]).data }
    func grandInfo(_ n: Int) async -> Data? { await call("grandInfo", ["n": n]).data }
    func provinceBreakdown(_ province: Int) async -> Data? { await call("provinceBreakdown", ["province": province]).data }
    func warCompare(attacker: Int, defender: Int) async -> Data? { await call("warCompare", ["a": attacker, "b": defender]).data }
    func replayTimeline() async -> Data? { await call("replayTimeline").data }
    func territory(_ provinces: [Int], to nation: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("territory", ["provinces": provinces, "nation": nation]) }
    func retreat(armyId: String, province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("retreat", ["armyId": armyId, "province": province]) }
    func statistics(_ category: String) async -> Data? { await call("statistics", ["category": category]).data }
    func alliance(_ a: Int, with b: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("alliance", ["a": a, "b": b]) }
    func releaseVassal(_ n: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("releaseVassal", ["n": n]) }
    func makeVassal(_ vassal: Int, of overlord: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("makeVassal", ["vassal": vassal, "overlord": overlord]) }
    func annex(_ target: Int, by annexer: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("annex", ["target": target, "annexer": annexer]) }
    func setAutoDiplomacy(_ n: Int, _ enabled: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("setAutoDiplomacy", ["n": n, "enabled": enabled]) }
    func route(armyId: String) async -> [[Double]] { await call("route", ["armyId": armyId]).points ?? [] }
    func save() async -> Data? {
        let d = await call("save").data
        if remote != nil, let d { lastWorld = d }
        return d
    }
    func enableAppRules() async { _ = await call("enableAppRules") }
    func regime(_ n: Int) async -> (history: [String], trait: String) { let r = await call("regime", ["n": n]); return (r.strings ?? [], r.text ?? "") }
    func editPerson(_ id: Int, skills: [Double], traits: [String]) async -> (ok: Bool, reason: String, state: Data?) { await command("editPerson", ["id": id, "skills": skills, "traits": traits]) }
    func editNation(_ n: Int, gold: Double?, destiny: Double?, polity: String?, culture: String? = nil, religion: String? = nil) async -> (ok: Bool, reason: String, state: Data?) {
        await command("editNation", ["n": n, "gold": Self.opt(gold), "destiny": Self.opt(destiny), "polity": Self.opt(polity), "culture": Self.opt(culture), "religion": Self.opt(religion)])
    }
    func setBonus(_ n: Int, key: String, value: Double?) async -> (ok: Bool, reason: String, state: Data?) { await command("setBonus", ["n": n, "key": key, "value": Self.opt(value)]) }
    func scaleTotal(_ n: Int, key: String, value: Double) async -> (ok: Bool, reason: String, state: Data?) { await command("scaleTotal", ["n": n, "key": key, "value": value]) }
    func editParty(_ n: Int, party: Int, name: String?, seats: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("editParty", ["n": n, "party": party, "name": Self.opt(name), "seats": Self.opt(seats)]) }
    func editIdentity(_ n: Int, name: String?, color: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("editIdentity", ["n": n, "name": Self.opt(name), "color": Self.opt(color)]) }
    func setCapital(_ n: Int, province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setCapital", ["n": n, "province": province]) }
    func editProvince(_ index: Int, population: Double?, fortress: Bool?) async -> (ok: Bool, reason: String, state: Data?) { await command("editProvince", ["index": index, "population": Self.opt(population), "fortress": Self.opt(fortress)]) }
    func setTemper(_ n: Int, _ value: Double?) async -> (ok: Bool, reason: String, state: Data?) { await command("setTemper", ["n": n, "value": Self.opt(value)]) }
    func renamePerson(_ id: Int, first: String?, last: String?, age: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("renamePerson", ["id": id, "first": Self.opt(first), "last": Self.opt(last), "age": Self.opt(age)]) }
    func setStyle(_ n: Int, style: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setStyle", ["n": n, "style": style]) }
    func treaty(_ a: Int, _ b: Int, years: Int, kind: String) async -> (ok: Bool, reason: String, state: Data?) { await command("treaty", ["a": a, "b": b, "years": years, "kind": kind]) }
    func gift(_ from: Int, to: Int, gold: Double) async -> (ok: Bool, reason: String, state: Data?) { await command("gift", ["from": from, "to": to, "gold": gold]) }
    func posts(_ n: Int) async -> Data? { await call("posts", ["n": n]).data }
    func postCandidates(_ n: Int, post: String) async -> Data? { await call("postCandidates", ["n": n, "post": post]).data }
    func appointPost(_ n: Int, post: String, person: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("appointPost", ["n": n, "post": post, "person": person]) }
    func officeCandidates(_ n: Int, office: String) async -> Data? { await call("officeCandidates", ["n": n, "office": office]).data }
    func editCourt(_ n: Int, key: String, value: Double) async -> (ok: Bool, reason: String, state: Data?) { await command("editCourt", ["n": n, "key": key, "value": value]) }
    func appointOffice(_ n: Int, office: String, person: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("appointOffice", ["n": n, "office": office, "person": person]) }
    func setCourtManual(_ n: Int, manual: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("setCourtManual", ["n": n, "manual": manual]) }
    func setStateTrait(_ n: Int, trait: String?, on: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("setStateTrait", ["n": n, "trait": trait.map { $0 as Any } ?? NSNull(), "on": on ? 1 : 0]) }
    func setOfficeTitle(_ n: Int, office: String, title: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("setOfficeTitle", ["n": n, "office": office, "title": title.map { $0 as Any } ?? NSNull()]) }
    func unitProfile(_ n: Int) async -> Data? { await call("unitProfile", ["n": n]).data }
    func setUnitProfile(_ n: Int, unit: String, name: String?, power: Int?, speed: Int?, weight: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("setUnitProfile", ["n": n, "unit": unit, "name": name.map { $0 as Any } ?? NSNull(), "power": power.map { $0 as Any } ?? NSNull(), "speed": speed.map { $0 as Any } ?? NSNull(), "weight": weight.map { $0 as Any } ?? NSNull()]) }
    func leaveAlliance(_ n: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("leaveAlliance", ["n": n]) }
    func catalogEdits() async -> Data? { await call("catalogEdits", [:]).data }
    func setCultureEdit(_ culture: String, name: String?, text: String?, male: [String], female: [String]) async -> (ok: Bool, reason: String, state: Data?) { await command("setCultureEdit", ["culture": culture, "name": name.map { $0 as Any } ?? NSNull(), "text": text.map { $0 as Any } ?? NSNull(), "male": male, "female": female]) }
    func setFaithEdit(_ faith: String, name: String?, text: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("setFaithEdit", ["faith": faith, "name": name.map { $0 as Any } ?? NSNull(), "text": text.map { $0 as Any } ?? NSNull()]) }
    func mapLabels() async -> Data? { await call("mapLabels", [:]).data }
    func setMapLabel(id: Int, text: String, x: Int, y: Int, size: Int, color: String, angle: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setMapLabel", ["id": id, "text": text, "x": x, "y": y, "size": size, "color": color, "angle": angle]) }
    func removeMapLabel(id: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("removeMapLabel", ["id": id]) }
    func edit(_ name: String, _ args: [String: Any]) async -> (ok: Bool, reason: String, state: Data?) { await command(name, args) }
    func query(_ name: String, _ args: [String: Any]) async -> Data? { await call(name, args).data }
    func grantRegion(_ province: Int, size: Int, to nation: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("grantRegion", ["province": province, "size": size, "n": nation]) }
    func greatRebellion(_ province: Int, size: Int, kind: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("greatRebellion", ["province": province, "size": size, "kind": kind.map { $0 as Any } ?? NSNull()]) }
    func restoreNation(_ province: Int, nation: Int, size: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("restoreNation", ["province": province, "n": nation, "size": size]) }
    func provinceDisaster(_ province: Int, kind: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("provinceDisaster", ["province": province, "kind": kind.map { $0 as Any } ?? NSNull()]) }
    func clearArmies(_ province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("clearArmies", ["province": province]) }
    func setProvinceFaith(_ province: Int, religion: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setProvinceFaith", ["province": province, "religion": religion]) }
    func setProvinceGrain(_ province: Int, grain: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setProvinceGrain", ["province": province, "grain": grain]) }
    func setReform(_ n: Int, reform: String, on: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("setReform", ["n": n, "reform": reform, "on": on ? 1 : 0]) }
    func addArmy(_ n: Int, province: Int, count: Int = 1) async -> (ok: Bool, reason: String, state: Data?) { await command("addArmy", ["n": n, "province": province, "count": count]) }
    func editArmy(_ armyId: String, troops: Int?, unit: String?, morale: Double?) async -> (ok: Bool, reason: String, state: Data?) {
        await command("editArmy", ["armyId": armyId, "troops": Self.opt(troops), "unit": Self.opt(unit), "morale": Self.opt(morale)])
    }
}

/// A channel to LieguojiServer: direct LAN TCP, persistent WebSocket relay, or HTTP/2 relay fallback.
protocol EngineLink: AnyObject, Sendable {
    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply
    func cancel()
}

private func decodeWireReply(_ data: Data) throws -> EngineService.Reply {
    guard data.count >= 12 else { throw EngineError.message("服务器返回的数据不完整") }
    let h = EngineWire.readU32(data, at: 0)
    guard h >= 0, data.count >= 12 + h else { throw EngineError.message("服务器帧头损坏") }
    let header = data.subdata(in: 4..<4 + h)
    let d = EngineWire.readU32(data, at: 4 + h)
    guard d >= 0, data.count >= 12 + h + d else { throw EngineError.message("服务器载荷不完整") }
    let body = data.subdata(in: 8 + h..<8 + h + d)
    let m = EngineWire.readU32(data, at: 8 + h + d)
    guard m >= 0, data.count >= 12 + h + d + m else { throw EngineError.message("服务器地图数据不完整") }
    let map = data.subdata(in: 12 + h + d..<12 + h + d + m)
    return EngineService.Reply.decode(header: header, data: body, map: map)
}

/// 持久双向 WebSocket 中转通道（wss://lieguoji-web.pages.dev/api/relay/room/<code>/ws?role=phone）：
/// 单条长连接复用、二进制帧封装、12 秒主动心跳保活，消除每步新建 HTTPS 连接握手开销。
final class RelayWSLink: EngineLink, @unchecked Sendable {
    private let session: URLSession
    private let task: URLSessionWebSocketTask
    private let lock = NSLock()
    private var nextId: UInt32 = 1
    private var pending: [UInt32: CheckedContinuation<Data, Error>] = [:]
    private var closed = false
    private var heartbeatTask: Task<Void, Never>?

    private init(session: URLSession, task: URLSessionWebSocketTask) {
        self.session = session
        self.task = task
        receiveLoop()
        startHeartbeat()
    }

    static func connect(code: String, base: String) async throws -> RelayWSLink {
        let wsBase = base.replacingOccurrences(of: "https://", with: "wss://").replacingOccurrences(of: "http://", with: "ws://")
        guard let url = URL(string: wsBase + "/room/\(code)/ws?role=phone") else {
            throw EngineError.message("无效的中转 WebSocket 地址")
        }
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 30
        cfg.timeoutIntervalForResource = 600
        cfg.waitsForConnectivity = false
        let session = URLSession(configuration: cfg)
        let wsTask = session.webSocketTask(with: url)
        wsTask.maximumMessageSize = 64 * 1024 * 1024
        wsTask.resume()

        // 发起一次二进制心跳探针（<= 3.5s）确认 WS 升级成功且链路畅通
        let link = RelayWSLink(session: session, task: wsTask)
        do {
            try await link.verifyHandshake(timeoutSeconds: 3.5)
            return link
        } catch {
            link.cancel()
            throw error
        }
    }

    private func verifyHandshake(timeoutSeconds: Double) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
                    self.task.sendPing { err in
                        if let err { c.resume(throwing: err) } else { c.resume() }
                    }
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
                throw EngineError.message("WebSocket 握手超时")
            }
            _ = try await group.next()
            group.cancelAll()
        }
    }

    private func startHeartbeat() {
        heartbeatTask = Task.detached(priority: .utility) { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 12_000_000_000)
                guard let self else { return }
                let isClosed: Bool = { self.lock.lock(); defer { self.lock.unlock() }; return self.closed }()
                if isClosed { return }
                var ping = Data([4])
                var now = UInt64(Date().timeIntervalSince1970 * 1000).bigEndian
                withUnsafeBytes(of: &now) { ping.append(contentsOf: $0) }
                try? await self.task.send(.data(ping))
            }
        }
    }

    private func failAll(_ err: Error) {
        lock.lock()
        if closed { lock.unlock(); return }
        closed = true
        let map = pending
        pending.removeAll()
        lock.unlock()
        heartbeatTask?.cancel()
        for (_, cont) in map { cont.resume(throwing: err) }
    }

    private func receiveLoop() {
        task.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let err):
                self.failAll(err)
            case .success(let message):
                if case .data(let raw) = message, raw.count >= 5 {
                    let type = raw[raw.startIndex]
                    if type == 2 { // MSG_REPLY
                        let id = UInt32(EngineWire.readU32(raw, at: 1))
                        let payload = raw.subdata(in: (raw.startIndex + 5)..<raw.endIndex)
                        self.lock.lock()
                        let cont = self.pending.removeValue(forKey: id)
                        self.lock.unlock()
                        cont?.resume(returning: payload)
                    }
                }
                self.receiveLoop()
            }
        }
    }

    func cancel() {
        failAll(EngineError.message("WebSocket 连接已关闭"))
        task.cancel(with: .normalClosure, reason: nil)
        session.invalidateAndCancel()
    }

    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply {
        let reqId: UInt32 = {
            lock.lock(); defer { lock.unlock() }
            let v = nextId; nextId &+= 1; if nextId == 0 { nextId = 1 }
            return v
        }()
        var frame = Data([1]) // MSG_REQ
        frame.append(EngineWire.u32(Int(reqId)))
        frame.append(EngineWire.request(name, args, payload: payload))

        let replyData: Data = try await withCheckedThrowingContinuation { cont in
            lock.lock()
            if closed {
                lock.unlock()
                cont.resume(throwing: EngineError.message("与云端通道的连接已断开"))
                return
            }
            pending[reqId] = cont
            lock.unlock()

            task.send(.data(frame)) { [weak self] err in
                if let err, let self {
                    self.lock.lock()
                    let c = self.pending.removeValue(forKey: reqId)
                    self.lock.unlock()
                    c?.resume(throwing: err)
                }
            }
        }
        return try decodeWireReply(replyData)
    }
}

/// Through the 列国纪 relay on the game's own site (pages.dev, reachable without a VPN): HTTP/2 + gzip fallback.
final class RelayLink: EngineLink, @unchecked Sendable {
    static let bases = [
        "https://lieguoji-edge.pages.dev/api/relay",
        "https://claude-native-map.lieguoji-web.pages.dev/api/relay",
        "https://lieguoji-web.pages.dev/api/relay"
    ]
    let code: String
    private(set) var activeBase = RelayLink.bases[0]
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 65; c.timeoutIntervalForResource = 180; c.waitsForConnectivity = false
        c.httpMaximumConnectionsPerHost = 4
        return URLSession(configuration: c)
    }()
    init(code: String) { self.code = code }

    func start() async throws {
        var reached = false
        for b in Self.bases {
            var r = URLRequest(url: URL(string: b + "/room/\(code)/status")!); r.timeoutInterval = 10
            guard let (data, response) = try? await session.data(for: r), (response as? HTTPURLResponse)?.statusCode == 200,
                  let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            reached = true; activeBase = b
            if o["online"] as? Bool == true { return }
        }
        throw EngineError.message(reached ? "电脑不在线：请在电脑上运行「列国纪远程计算」，并核对配对码。" : "连不上中转服务器，请检查网络。")
    }
    func cancel() { session.invalidateAndCancel() }

    func status() async -> (online: Bool, lan: [String], savesCount: Int)? {
        for b in Self.bases {
            var r = URLRequest(url: URL(string: b + "/room/\(code)/status")!); r.timeoutInterval = 8
            guard let (data, response) = try? await session.data(for: r), (response as? HTTPURLResponse)?.statusCode == 200,
                  let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            activeBase = b
            return (o["online"] as? Bool == true, o["lan"] as? [String] ?? [], o["savesCount"] as? Int ?? 0)
        }
        return nil
    }

    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply {
        var r = URLRequest(url: URL(string: activeBase + "/room/\(code)/call")!)
        r.httpMethod = "POST"; r.setValue("application/octet-stream", forHTTPHeaderField: "content-type")
        let (data, response) = try await session.upload(for: r, from: EngineWire.request(name, args, payload: payload))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw EngineError.message(String(data: data, encoding: .utf8).flatMap { $0.isEmpty ? nil : $0 } ?? "中转出错（\(status)）") }
        return try decodeWireReply(data)
    }
}

/// A TCP link to LieguojiServer (EngineWire frames), low-latency TCP_NODELAY + TCP keepalive.
final class RemoteLink: EngineLink, @unchecked Sendable {
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "lieguoji.remote")
    init(host: String, port: UInt16) {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        tcp.enableKeepalive = true
        tcp.keepaliveIdle = 12
        tcp.keepaliveInterval = 5
        tcp.keepaliveCount = 3
        connection = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port) ?? 8765, using: NWParameters(tls: nil, tcp: tcp))
    }
    func start(timeout: Double = 5) async throws {
        let gate = Gate()
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            @Sendable func finish(_ r: Result<Void, Error>) { if gate.open() { c.resume(with: r) } }
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready: finish(.success(()))
                case .failed(let e): finish(.failure(e))
                case .waiting(let e): finish(.failure(EngineError.message("连不上电脑（\(e.localizedDescription)）。请确认服务器已运行、地址正确、手机与电脑在同一局域网。")))
                default: break
                }
            }
            connection.start(queue: queue)
            queue.asyncAfter(deadline: .now() + timeout) { finish(.failure(EngineError.message("连接超时：请确认电脑上的服务器已运行且地址正确。"))) }
        }
    }
    private final class Gate: @unchecked Sendable {
        private var done = false; private let lock = NSLock()
        func open() -> Bool { lock.lock(); defer { lock.unlock() }; if done { return false }; done = true; return true }
    }
    func cancel() { connection.cancel() }
    private func send(_ data: Data) async throws {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { e in if let e { c.resume(throwing: e) } else { c.resume() } })
        }
    }
    private func receive(_ count: Int) async throws -> Data {
        if count == 0 { return Data() }
        var out = Data()
        while out.count < count {
            let want = count - out.count
            let chunk: Data = try await withCheckedThrowingContinuation { c in
                connection.receive(minimumIncompleteLength: 1, maximumLength: want) { data, _, complete, e in
                    if let e { c.resume(throwing: e) }
                    else if let data, !data.isEmpty { c.resume(returning: data) }
                    else if complete { c.resume(throwing: EngineError.message("电脑断开了连接")) }
                    else { c.resume(returning: Data()) }
                }
            }
            out.append(chunk)
        }
        return out
    }
    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply {
        try await send(EngineWire.request(name, args, payload: payload))
        let h = EngineWire.readU32(try await receive(4), at: 0), header = try await receive(h)
        let d = EngineWire.readU32(try await receive(4), at: 0), data = try await receive(d)
        let m = EngineWire.readU32(try await receive(4), at: 0), map = try await receive(m)
        return EngineService.Reply.decode(header: header, data: data, map: map)
    }
}
