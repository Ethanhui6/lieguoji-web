import Foundation
import Network
import LieguojiCore

/// The engine of the running world on its own serial executor (the engine keeps static tables, so
/// every call goes through this one actor). The web engine only builds new worlds; the world is then
/// handed over here (`nativeWorld()`), and days, commands and saves run in Swift — on the phone, or,
/// with 远程计算, on a computer running LieguojiServer (the phone then only draws). Both paths run the
/// same EngineService requests.
actor NativeHost {
    private let service = EngineService()
    private var remote: RemoteLink?
    private(set) var remoteAddress: String?
    private static var catalogs = false

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

    // MARK: channel

    /// The world the computer last returned (a save), so a broken link can continue on the phone.
    private var lastWorld: Data?

    /// One request, on the computer when connected, else in process. A broken link falls back to the
    /// phone with the last world the computer returned.
    private func call(_ name: String, _ args: [String: Any] = [:], payload: Data? = nil) async -> EngineService.Reply {
        if let remote {
            do { return try await remote.call(name, args, payload: payload) }
            catch {
                await dropRemote()
                return EngineService.Reply(ok: false, reason: "与电脑的连接中断，已切回本机计算：\(error.localizedDescription)")
            }
        }
        return service.handle(name, args, payload: payload)
    }

    /// Connects to a computer and moves the world there (catalogues first, then the current save).
    func connect(_ address: String) async throws -> String {
        var host = address.trimmingCharacters(in: .whitespaces), port: UInt16 = 8765
        if let i = host.lastIndex(of: ":"), let p = UInt16(host[host.index(after: i)...]) { port = p; host = String(host[..<i]) }
        guard !host.isEmpty else { throw EngineError.message("请填写电脑的局域网地址") }
        let link = RemoteLink(host: host, port: port)
        try await link.start()
        let hello = try await link.call("ping", [:], payload: nil)
        guard hello.ok else { link.cancel(); throw EngineError.message("对方不是列国纪远程计算服务器") }
        let c = try Self.catalogData()
        let catalogs = try JSONSerialization.data(withJSONObject: ["traits": c.traits.base64EncodedString(), "nobleCultures": c.noble.base64EncodedString(), "cultures": c.cultures.base64EncodedString()])
        let loaded = try await link.call("catalogs", [:], payload: catalogs)
        guard loaded.ok else { link.cancel(); throw EngineError.message(loaded.reason) }
        // The running world moves to the computer.
        if let save = service.engine?.save() {
            let opened = try await link.call("open", [:], payload: save)
            guard opened.ok else { link.cancel(); throw EngineError.message("电脑载入世界失败：\(opened.reason)") }
            _ = try await link.call("enableAppRules", [:], payload: nil)
            lastWorld = save
        }
        remote = link; remoteAddress = "\(host):\(port)"
        return "\(host):\(port)"
    }
    /// Back to the phone: the computer's world comes home first.
    func disconnect() async {
        guard let link = remote else { return }
        if let save = try? await link.call("save", [:], payload: nil), let data = save.data {
            _ = service.handle("open", [:], payload: data); service.engine?.enableAppRules()
        }
        link.cancel(); remote = nil; remoteAddress = nil
    }
    private func dropRemote() async {
        remote?.cancel(); remote = nil; remoteAddress = nil
        if let lastWorld { _ = service.handle("open", [:], payload: lastWorld); service.engine?.enableAppRules() }
    }
    var isRemote: Bool { remote != nil }

    // MARK: requests

    /// Opens `{run, statics}` (from the web bridge or a save). Returns the saved map, when the
    /// statics carry one, and the first state.
    func open(_ data: Data) async throws -> (map: Data?, state: Data) {
        try Self.loadCatalogs()
        if remote != nil { lastWorld = data }
        let r = await call("open", payload: data)
        guard r.ok else { throw EngineError.message(r.reason) }
        return (r.map, r.data ?? Data())
    }
    func close() async { _ = await call("close") }
    func step(days: Int) async -> Data { await call("step", ["days": days]).data ?? Data() }
    private func command(_ name: String, _ args: [String: Any]) async -> (ok: Bool, reason: String, state: Data?) {
        let r = await call(name, args); return (r.ok, r.reason, r.data)
    }
    private static func opt<T>(_ v: T?) -> Any { v.map { $0 as Any } ?? NSNull() }
    func order(armyId: String, province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("order", ["armyId": armyId, "province": province]) }
    func politics(declare: Bool, _ a: Int, _ b: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("politics", ["declare": declare, "a": a, "b": b]) }
    func fleetOrder(id: String, province: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("fleetOrder", ["id": id, "province": Self.opt(province)]) }
    func province(_ index: Int) async -> Data? { await call("province", ["index": index]).data }
    func nationInfo(_ index: Int) async -> Data? { await call("nationInfo", ["index": index]).data }
    func view(_ mode: String) async -> Data? { await call("view", ["mode": mode]).data }
    func worldSettings() async -> Data? { await call("worldSettings").data }
    func setWorld(_ key: String, _ value: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setWorld", ["key": key, "value": value]) }
    func triggerCivilWar(_ n: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("triggerCivilWar", ["n": n]) }
    func rts(_ armyIds: [String], nation: Int, province: Int, defend: Bool) async -> (ok: Bool, reason: String, state: Data?) {
        await command("rts", ["armyIds": armyIds, "nation": nation, "province": province, "defend": defend])
    }
    func nationHistory(_ n: Int) async -> Data? { await call("nationHistory", ["n": n]).data }
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
    func editNation(_ n: Int, gold: Double?, destiny: Double?, polity: String?) async -> (ok: Bool, reason: String, state: Data?) {
        await command("editNation", ["n": n, "gold": Self.opt(gold), "destiny": Self.opt(destiny), "polity": Self.opt(polity)])
    }
    func addArmy(_ n: Int, province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("addArmy", ["n": n, "province": province]) }
    func editArmy(_ armyId: String, troops: Int?, unit: String?, morale: Double?) async -> (ok: Bool, reason: String, state: Data?) {
        await command("editArmy", ["armyId": armyId, "troops": Self.opt(troops), "unit": Self.opt(unit), "morale": Self.opt(morale)])
    }
}

/// A TCP link to LieguojiServer (EngineWire frames), one request at a time.
final class RemoteLink: @unchecked Sendable {
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "lieguoji.remote")
    init(host: String, port: UInt16) {
        let tcp = NWProtocolTCP.Options(); tcp.noDelay = true
        connection = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port) ?? 8765, using: NWParameters(tls: nil, tcp: tcp))
    }
    func start() async throws {
        let gate = Gate()
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            func finish(_ r: Result<Void, Error>) { if gate.open() { c.resume(with: r) } }
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready: finish(.success(()))
                case .failed(let e): finish(.failure(e))
                case .waiting(let e): finish(.failure(EngineError.message("连不上电脑（\(e.localizedDescription)）。请确认服务器已运行、地址正确、手机与电脑在同一局域网。")))
                default: break
                }
            }
            connection.start(queue: queue)
            queue.asyncAfter(deadline: .now() + 6) { finish(.failure(EngineError.message("连接超时：请确认电脑上的服务器已运行且地址正确。"))) }
        }
    }
    /// Resumes a continuation once (the connection may report several states).
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
