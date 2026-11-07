import XCTest
import Foundation
@testable import LieguojiCore

/// Three years of a live world with the app rules on, audited day by day the way a player would notice
/// trouble: armies left standing abroad after a peace, how long wars last, how often land changes hands.
/// Prints AUDIT lines; fails only on armies stranded abroad for half a year.
final class WarAuditTests: XCTestCase {
    func testThreeYearsOfWar() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        defer { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil }
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        let r = engine.run, days = 1080, start = Date(), statesAtFirst = r.world.nations.length
        var standing = [String: Int](), worst = [String: Int]()
        var owners = r.world.provinces.asArray.map(\.controller.asString), changes = 0, peaks = 0
        // 分兵: each month, for every state with three or more armies on the march, the share heading for
        // its single most popular target (1.0 = every army on one point).
        var focus = [Double]()
        for day in 0..<days {
            engine.advance(days: 1)
            if day % 30 == 29 {
                var byNation = [String: [String: Int]]()
                for a in r.world.armies.asArray where a.troops.asNumber > 0 {
                    let t = r.armyAutonomy.armies[a.id.asString].targetId
                    if !t.isNull && r.armyAutonomy.armies[a.id.asString].decision.optionalString == "attacking" { byNation[a.nationId.asString, default: [:]][t.asString, default: 0] += 1 }
                }
                for targets in byNation.values {
                    let total = targets.values.reduce(0, +)
                    if total >= 3 { focus.append(Double(targets.values.max()!) / Double(total)) }
                }
            }
            for v in Armies.space(r) {
                let a = v.army, id = a.id.asString, n = a.nationId.asString
                guard let p = v.province, a.troops.asNumber > 0 else { standing[id] = 0; continue }
                let c = p.controller.asString, still = ["arrived", "halted"].contains(v.travel.status.asString)
                if c != n && still && !RunWindow.atWar(r, n, c) && !RunWindow.access(r, n, c) && a.status.asString != "fighting" {
                    standing[id, default: 0] += 1; worst[id] = max(worst[id] ?? 0, standing[id]!)
                } else { standing[id] = 0 }
            }
            let now = r.world.provinces.asArray.map(\.controller.asString)
            changes += zip(owners, now).filter { $0 != $1 }.count; owners = now
            peaks = max(peaks, r.world.armies.asArray.filter { $0.troops.asNumber > 0 }.count)
        }
        let wars = r.nativeWars.campaigns.asArray.filter { $0.internal.isNull }, ended = wars.filter { !$0.endedTick.isNull }
        let lengths = ended.map { ($0.endedTick.asNumber - $0.openedTick.asNumber) / 120 }
        print("AUDIT \(days) days in \(Int(Date().timeIntervalSince(start)))s")
        print("AUDIT wars started \(wars.count), ended \(ended.count), still open \(wars.count - ended.count)")
        print("AUDIT war length days: average \(lengths.isEmpty ? 0 : Int(lengths.reduce(0, +) / Double(lengths.count))), longest \(Int(lengths.max() ?? 0))")
        print("AUDIT provinces changed hands \(changes) (\(changes * 360 / days) a year); armies at most \(peaks)")
        print("AUDIT attacking armies on one target (share, monthly average): \(focus.isEmpty ? 0 : Int(focus.reduce(0, +) / Double(focus.count) * 100))%")
        let alive = r.world.nations.asArray.filter { Vassals.alive(r, $0.id.asString) }.count
        print("AUDIT states: \(statesAtFirst) at first, \(r.world.nations.length) ever (rebels and successors), \(alive) alive")
        let stranded = worst.filter { $0.value > 60 }.sorted { $0.value > $1.value }
        print("AUDIT armies standing abroad at peace over 60 days: \(stranded.count)")
        for (id, d) in stranded.prefix(8) {
            let row = r.armyAutonomy.armies[id]
            print("AUDIT   \(id) \(d) days · \(row.decision.optionalString ?? "") · \(row.reason.optionalString ?? "")")
        }
        XCTAssertTrue(stranded.allSatisfy { $0.value <= 180 }, "armies stranded abroad for half a year")
    }
}
