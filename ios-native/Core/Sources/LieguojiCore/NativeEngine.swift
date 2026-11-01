import Foundation

/// The Swift engine of a running world: the web run (JSValue model) and its static geometry
/// (src/native-bridge/native-statics.ts), advanced by `Session`. Saves hold the run and the
/// statics, so a world reloads without replaying its journal.
public final class NativeEngine {
    public static let saveFormat = "lieguoji-native-game-2"
    public private(set) var run: JS
    let statics: JS

    /// Catalogs shared by every world: native character traits, family naming by culture and the
    /// opening cultures (Resources/Catalog, Resources/World/cultures.json).
    public static func loadCatalogs(traits: Data, nobleCultures: Data, cultures: Data) throws {
        let t = try JS.parse(traits)
        People.loadTraits(t); Nobility.traitList = t.asArray
        Nobility.cultures = try JS.parse(nobleCultures)
        Founding.cultures = try JSONDecoder().decode([Opening.Culture].self, from: cultures)
    }

    /// `{run, statics}` from the web bridge (nativeWorld) or a save of this format.
    public init(world data: Data) throws {
        let o = try JS.parse(data)
        if !o.format.isNull && o.format.asString != Self.saveFormat { throw NativeEngineError.message("这不是列国纪存档。") }
        run = o.run; statics = o.statics
        try install()
    }
    func install() throws {
        guard let bytes = Data(base64Encoded: statics.travel.asString) else { throw NativeEngineError.message("行军图数据损坏。") }
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: bytes))
        Armies.homeCells = [:]; for (k, v) in statics.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        CombatReader.borders = statics.borders.asArray.map { $0.asArray.map(\.asInt) }
        War26.ports = statics.seaPorts.asArray.map { ($0[0].asString, $0[1].asInt) }
        let diplomacy = Data(statics.diplomacy.json.utf8)
        Session.engine = DeclarationEngine(statics: try JSONDecoder().decode(DiplomacyStatic.self, from: diplomacy))
        ArmyOrders.cache = nil
        RunWindow.afterOccupation = nil
    }
    /// Whole days.
    public func advance(days: Int) { for _ in 0..<max(1, days) { Session.advance(run, ticks: 120) } }
    public func save() -> Data {
        let o = JS.object(); o.format = JS(Self.saveFormat); o.run = run; o.statics = statics
        return Data(o.json.utf8)
    }
}

public enum NativeEngineError: LocalizedError {
    case message(String)
    public var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
}
