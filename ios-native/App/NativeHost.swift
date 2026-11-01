import Foundation
import LieguojiCore

/// The Swift engine of the running world on its own serial executor (the engine keeps static
/// tables, so every call goes through this one actor). The web engine only builds new worlds; the
/// world is then handed over here (`nativeWorld()`), and days, commands and saves run in Swift.
actor NativeHost {
    private var engine: NativeEngine?
    private var lastOwners: [Int] = []
    private static var catalogs = false

    static func loadCatalogs() throws {
        if catalogs { return }
        func data(_ name: String, _ ext: String, _ dir: String) throws -> Data {
            guard let url = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: dir) else { throw EngineError.message("安装包缺少\(name)数据") }
            return try Data(contentsOf: url)
        }
        try NativeEngine.loadCatalogs(traits: try data("traits", "json", "Catalog"), nobleCultures: try data("noble-cultures", "json", "Catalog"), cultures: try data("cultures", "json", "World"))
        catalogs = true
    }

    /// Opens `{run, statics}` (from the web bridge or a save). Returns the saved map, when the
    /// statics carry one, and the first state.
    func open(_ data: Data) throws -> (map: Data?, state: Data) {
        try Self.loadCatalogs()
        let e = try NativeEngine(world: data)
        engine = e
        lastOwners = []
        return (e.mapJSON, state())
    }
    var isOpen: Bool { engine != nil }
    func close() { engine = nil }

    /// The state for the views; nation labels only when ownership changed.
    private func state() -> Data {
        guard let e = engine else { return Data() }
        let owners = e.run.world.provinces.asArray.map { p in e.run.world.nations.asArray.firstIndex { $0.id.asString == p.controller.asString } ?? -1 }
        let labels = owners != lastOwners
        lastOwners = owners
        return e.state(includeLabels: labels)
    }
    func step(days: Int) -> Data {
        engine?.advance(days: days)
        return state()
    }
    func order(armyId: String, province: Int) -> (ok: Bool, reason: String, state: Data?) {
        guard let e = engine else { return (false, "世界尚未载入。", nil) }
        let out = e.order(armyId: armyId, provinceIndex: province)
        return (out.ok, out.reason, out.ok ? state() : nil)
    }
    func politics(declare: Bool, _ a: Int, _ b: Int) -> (ok: Bool, reason: String, state: Data?) {
        guard let e = engine else { return (false, "世界尚未载入。", nil) }
        let out = e.politics(declare: declare, a, b)
        return (out.ok, out.reason, out.ok ? state() : nil)
    }
    func province(_ index: Int) -> Data? { engine?.province(index) }
    func nationInfo(_ index: Int) -> Data? { engine?.nationInfo(index) }
    private func command(_ out: (ok: Bool, reason: String)?) -> (ok: Bool, reason: String, state: Data?) {
        guard let out else { return (false, "世界尚未载入。", nil) }
        return (out.ok, out.reason, out.ok ? state() : nil)
    }
    func alliance(_ a: Int, with b: Int) -> (ok: Bool, reason: String, state: Data?) { command(engine?.alliance(a, with: b)) }
    func releaseVassal(_ n: Int) -> (ok: Bool, reason: String, state: Data?) { command(engine?.releaseVassal(n)) }
    func setAutoDiplomacy(_ n: Int, _ enabled: Bool) -> (ok: Bool, reason: String, state: Data?) { command(engine?.setAutoDiplomacy(n, enabled: enabled)) }
    func route(armyId: String) -> [[Double]] { engine?.route(armyId: armyId) ?? [] }
    func save() -> Data? { engine?.save() }
}
