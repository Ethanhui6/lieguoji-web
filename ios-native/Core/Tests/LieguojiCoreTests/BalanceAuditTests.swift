import XCTest
import Foundation
@testable import LieguojiCore

/// What a player sees over time: how a hopeless war goes, and how much the world repeats itself.
final class BalanceAuditTests: XCTestCase {
    private func world() throws -> NativeEngine {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        return engine
    }
    private func cleanup() { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil }

    /// A great power against a neighbour with a fraction of its troops.
    func testHopelessWarEndsQuickly() throws {
        defer { cleanup() }
        let engine = try world(), r = engine.run
        let nations = r.world.nations.asArray, provinces = r.world.provinces.asArray
        var pair: (Int, Int)?
        for (i, n) in nations.enumerated() {
            for p in provinces where p.controller.asString == n.id.asString {
                for q in p.neighbors.asArray {
                    if let o = provinces.first(where: { $0.id.asString == q.asString }), o.controller.asString != n.id.asString, let j = nations.firstIndex(where: { $0.id.asString == o.controller.asString }) { pair = (i, j); break }
                }
                if pair != nil { break }
            }
            if pair != nil { break }
        }
        let (a, b) = try XCTUnwrap(pair), ida = nations[a].id.asString, idb = nations[b].id.asString
        for x in r.world.armies.asArray where x.nationId.asString == ida { x.troops = JS(x.troops.asNumber * 20); r.tactics.forces[x.id.asString].fullStrength = JS(x.troops.asNumber) }
        let start = provinces.filter { $0.controller.asString == idb }.count
        let declared = engine.politics(declare: true, a, b)
        print("LOPSIDED declared \(declared.ok) \(declared.reason)")
        var firstLoss = -1, ended = -1
        for day in 1...360 {
            engine.advance(days: 1)
            let held = r.world.provinces.asArray.filter { $0.controller.asString == idb }.count
            if firstLoss < 0 && held < start { firstLoss = day }
            if ended < 0 && !RunWindow.atWar(r, ida, idb) { ended = day; break }
        }
        let troopsA = r.world.armies.asArray.filter { $0.nationId.asString == ida }.reduce(0) { $0 + $1.troops.asNumber }
        print("LOPSIDED provinces \(start) → \(r.world.provinces.asArray.filter { $0.controller.asString == idb }.count), first loss day \(firstLoss), war ended day \(ended), attacker troops \(Int(troopsA))")
    }

    /// Two years of world: what the chronicle says over and over, and which names are used twice.
    func testRepetition() throws {
        defer { cleanup() }
        let engine = try world(), r = engine.run
        engine.advance(days: 720)
        let names = r.world.nations.asArray.map(\.name.asString).sorted { $0.count > $1.count }
        func kind(_ text: String) -> String {
            var t = text
            for n in names { t = t.replacingOccurrences(of: n, with: "某国") }
            return t.filter { !$0.isNumber }
        }
        var freq = [String: Int]()
        for e in r.chronicle.entries.asArray { freq[kind(e.text.asString), default: 0] += 1 }
        print("REPEAT chronicle \(r.chronicle.entries.length) entries, \(freq.count) kinds")
        for (t, c) in freq.sorted(by: { $0.value > $1.value }).prefix(12) { print("REPEAT \(c)× \(t.prefix(30))") }
        func dup(_ list: [String]) -> String {
            var c = [String: Int](); for x in list { c[x, default: 0] += 1 }
            let d = c.filter { $0.value > 1 }
            return "\(list.count) names, \(d.count) repeated: " + d.sorted { $0.value > $1.value }.prefix(6).map { "\($0.key)×\($0.value)" }.joined(separator: " ")
        }
        print("REPEAT armies " + dup(r.world.armies.asArray.filter { $0.troops.asNumber > 0 }.map(\.name.asString)))
        print("REPEAT people " + dup(r.kin.persons.objectValues.filter { $0.isAlive.asBool }.compactMap { $0.firstName.optionalString }))
        let styles = r.world.nations.asArray.map { Regimes.style(r, $0.id.asString).label }
        print("REPEAT regimes " + dup(styles))
    }
}
