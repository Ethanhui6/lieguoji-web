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
    private func hopeless(wantWar: Bool) throws {
        defer { cleanup() }
        let engine = try world(), r = engine.run
        let nations = r.world.nations.asArray, provinces = r.world.provinces.asArray
        var pair: (Int, Int)?
        search: for (i, n) in nations.enumerated() {
            for p in provinces where p.controller.asString == n.id.asString {
                for q in p.neighbors.asArray {
                    guard let o = provinces.first(where: { $0.id.asString == q.asString }), o.controller.asString != n.id.asString, let j = nations.firstIndex(where: { $0.id.asString == o.controller.asString }) else { continue }
                    if RunWindow.atWar(r, n.id.asString, o.controller.asString) == wantWar { pair = (i, j); break search }
                }
            }
        }
        guard let (a, b) = pair else { print("LOPSIDED no pair wantWar=\(wantWar)"); return }
        let ida = nations[a].id.asString, idb = nations[b].id.asString
        for x in r.world.armies.asArray where x.nationId.asString == ida { x.troops = JS(x.troops.asNumber * 20) }
        let start = provinces.filter { $0.controller.asString == idb }.count
        if !wantWar { let d = engine.politics(declare: true, a, b); print("LOPSIDED declared \(d.ok) \(d.reason)") }
        var firstLoss = -1, ended = -1
        func held() -> Int { r.world.provinces.asArray.filter { $0.controller.asString == idb }.count }
        for day in 1...360 {
            engine.advance(days: 1)
            if firstLoss < 0 && held() < start { firstLoss = day }
            if day % 60 == 0 || day == 15 {
                var status = [String: Int](), decision = [String: Int](), there = 0
                let owner = Dictionary(r.world.provinces.asArray.map { ($0.id.asString, $0.controller.asString) }, uniquingKeysWith: { a, _ in a })
                for x in r.world.armies.asArray where x.nationId.asString == ida && x.troops.asNumber > 0 {
                    status[x.status.asString, default: 0] += 1
                    decision[r.armyAutonomy.armies[x.id.asString].decision.optionalString ?? "-", default: 0] += 1
                    if owner[x.provinceId.asString] == idb { there += 1 }
                }
                let foe = r.world.armies.asArray.filter { $0.nationId.asString == idb }.reduce(0) { $0 + $1.troops.asNumber }
                print("LOPSIDED day \(day) held \(held()) inEnemyLand \(there) status \(status) decision \(decision) enemyTroops \(Int(foe)) odds \(Int(Regimes.odds(r, ida, idb)))")
            }
            if ended < 0 && !RunWindow.atWar(r, ida, idb) { ended = day; break }
        }
        let troopsA = r.world.armies.asArray.filter { $0.nationId.asString == ida }.reduce(0) { $0 + $1.troops.asNumber }
        print("LOPSIDED wantWar=\(wantWar) provinces \(start) → \(held()), first loss day \(firstLoss), war ended day \(ended), attacker troops \(Int(troopsA)), worldAuto \(r.diplomacy.worldAuto.isTruthy)")
    }
    func testHopelessDeclaredWar() throws { try hopeless(wantWar: false) }
    func testHopelessOngoingWar() throws { try hopeless(wantWar: true) }

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
