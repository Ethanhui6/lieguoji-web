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
    private var remote: EngineLink?
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
                // The link broke (the app went to the background, the network blinked): the world is safe
                // on the computer. Reattach later instead of falling back to an older copy at once.
                remote.cancel(); self.remote = nil; remoteAddress = nil; lost = true
                return EngineService.Reply(ok: false, reason: "与电脑的连接中断")
            }
        }
        if lost { return EngineService.Reply(ok: false, reason: "与电脑的连接中断，正在重连") }
        return service.handle(name, args, payload: payload)
    }

    /// Connects to a computer and moves the world there (catalogues first, then the current save).
    func connect(_ address: String, timeout: Double = 6, reattach: Bool = false) async throws -> String {
        let text = address.trimmingCharacters(in: .whitespaces)
        // A pairing code (letters and digits, no dots) goes through the relay; an address is direct.
        let code = text.replacingOccurrences(of: "-", with: "").uppercased()
        let link: EngineLink, label: String
        if code.count >= 6, code.count <= 16, code.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }), !text.contains(".") {
            let relay = RelayLink(code: code)
            try await relay.start()
            link = relay; label = code == RemoteRoom.personal ? "中转" : "配对码 \(code.prefix(4))-\(code.dropFirst(4))"
        } else {
            var host = text, port: UInt16 = 8765
            if let i = host.lastIndex(of: ":"), let p = UInt16(host[host.index(after: i)...]) { port = p; host = String(host[..<i]) }
            guard !host.isEmpty else { throw EngineError.message("请填写配对码或电脑的局域网地址") }
            let direct = RemoteLink(host: host, port: port)
            try await direct.start(timeout: timeout)
            link = direct; label = "\(host):\(port)"
        }
        let hello = try await link.call("ping", [:], payload: nil)
        guard hello.ok else { link.cancel(); throw EngineError.message("对方不是列国纪远程计算服务器") }
        if reattach {
            // The computer kept the world while the phone was away: use it as it is.
            guard (try await link.call("isOpen", [:], payload: nil)).ok else { link.cancel(); throw EngineError.message("电脑上的世界已关闭") }
            remote = link; remoteAddress = label; lost = false; lastAddress = address
            return label
        }
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
        remote = link; remoteAddress = label; lastAddress = address; lost = false
        return label
    }
    /// Back to the phone: the computer's world comes home first.
    func disconnect() async {
        guard let link = remote else { return }
        if let save = try? await link.call("save", [:], payload: nil), let data = save.data {
            _ = service.handle("open", [:], payload: data); service.engine?.enableAppRules()
        }
        link.cancel(); remote = nil; remoteAddress = nil
    }
    /// The computer's link broke while it held the world; requests wait for a reattach or the fallback.
    private(set) var lost = false
    private var lastAddress: String?
    /// Reattaches to the computer still holding the world (no upload); nil if it cannot be reached.
    func reattach() async -> String? {
        guard lost, let address = lastAddress else { return nil }
        if let label = try? await connect(address, timeout: 4, reattach: true) { return label }
        if address != RemoteRoom.personal, let label = try? await connect(RemoteRoom.personal, reattach: true) { return label }
        return nil
    }
    /// The computer is gone: continue on the phone from the last world it returned (the last save).
    func fallbackLocal() {
        lost = false
        if let lastWorld { _ = service.handle("open", [:], payload: lastWorld); service.engine?.enableAppRules() }
    }
    var isRemote: Bool { remote != nil }

    /// 自动接入: finds this player's computer through the relay room built into the app; on the same
    /// network it connects directly (fast), otherwise through the relay. Nil when the computer is off.
    func connectAuto() async -> String? {
        if lost { return await reattach() }
        guard remote == nil, service.engine != nil else { return nil }
        guard let status = await RelayLink(code: RemoteRoom.personal).status(), status.online else { return nil }
        for address in status.lan {
            if let label = try? await connect(address, timeout: 1.5) { return label + "（局域网）" }
        }
        return try? await connect(RemoteRoom.personal)
    }

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
    func state() async -> Data? { await call("state").data }
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
    func addArmy(_ n: Int, province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("addArmy", ["n": n, "province": province]) }
    func editArmy(_ armyId: String, troops: Int?, unit: String?, morale: Double?) async -> (ok: Bool, reason: String, state: Data?) {
        await command("editArmy", ["armyId": armyId, "troops": Self.opt(troops), "unit": Self.opt(unit), "morale": Self.opt(morale)])
    }
    func setStartYear(_ year: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setStartYear", ["year": year]) }
    func clearNavy() async -> (ok: Bool, reason: String, state: Data?) { await command("clearNavy", [:]) }
    func limitReligions(_ count: Int, pool: [String]) async -> (ok: Bool, reason: String, state: Data?) {
        await command("limitReligions", ["count": count, "pool": pool])
    }
}

/// A channel to LieguojiServer: direct on the local network, or through the relay.
protocol EngineLink: AnyObject, Sendable {
    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply
    func cancel()
}

/// Through the 列国纪 relay on the game's own site (pages.dev, reachable without a VPN): the phone posts
/// each request to the room of the computer's pairing code and gets the computer's reply back. No local
/// network or public address needed on either side.
final class RelayLink: EngineLink, @unchecked Sendable {
    static let bases = ["https://lieguoji-web.pages.dev/api/relay", "https://claude-native-map.lieguoji-web.pages.dev/api/relay"]
    let code: String
    private var base = RelayLink.bases[0]
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 200; c.timeoutIntervalForResource = 600; c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()
    init(code: String) { self.code = code }
    /// Finds a relay that answers and checks the computer is online.
    func start() async throws {
        var reached = false
        for b in Self.bases {
            var r = URLRequest(url: URL(string: b + "/room/\(code)/status")!); r.timeoutInterval = 12
            guard let (data, response) = try? await session.data(for: r), (response as? HTTPURLResponse)?.statusCode == 200,
                  let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            reached = true; base = b
            if o["online"] as? Bool == true { return }
        }
        throw EngineError.message(reached ? "电脑不在线：请在电脑上运行「列国纪远程计算」，并核对配对码。" : "连不上中转服务器，请检查网络。")
    }
    func cancel() { session.invalidateAndCancel() }
    /// Whether the room's computer is online, and its local addresses.
    func status() async -> (online: Bool, lan: [String])? {
        for b in Self.bases {
            var r = URLRequest(url: URL(string: b + "/room/\(code)/status")!); r.timeoutInterval = 10
            guard let (data, response) = try? await session.data(for: r), (response as? HTTPURLResponse)?.statusCode == 200,
                  let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            base = b
            return (o["online"] as? Bool == true, o["lan"] as? [String] ?? [])
        }
        return nil
    }
    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply {
        var r = URLRequest(url: URL(string: base + "/room/\(code)/call")!)
        r.httpMethod = "POST"; r.setValue("application/octet-stream", forHTTPHeaderField: "content-type")
        let (data, response) = try await session.upload(for: r, from: EngineWire.request(name, args, payload: payload))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw EngineError.message(String(data: data, encoding: .utf8).flatMap { $0.isEmpty ? nil : $0 } ?? "中转出错（\(status)）") }
        guard data.count >= 12 else { throw EngineError.message("中转返回的数据不完整") }
        let h = EngineWire.readU32(data, at: 0), header = data.subdata(in: 4..<4 + h)
        let d = EngineWire.readU32(data, at: 4 + h), body = data.subdata(in: 8 + h..<8 + h + d)
        let m = EngineWire.readU32(data, at: 8 + h + d), map = data.subdata(in: 12 + h + d..<12 + h + d + m)
        return EngineService.Reply.decode(header: header, data: body, map: map)
    }
}

/// A TCP link to LieguojiServer (EngineWire frames), one request at a time.
final class RemoteLink: EngineLink, @unchecked Sendable {
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "lieguoji.remote")
    init(host: String, port: UInt16) {
        let tcp = NWProtocolTCP.Options(); tcp.noDelay = true
        connection = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port) ?? 8765, using: NWParameters(tls: nil, tcp: tcp))
    }
    func start(timeout: Double = 6) async throws {
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
            queue.asyncAfter(deadline: .now() + timeout) { finish(.failure(EngineError.message("连接超时：请确认电脑上的服务器已运行且地址正确。"))) }
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
