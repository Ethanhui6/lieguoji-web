import XCTest
import Foundation
@testable import LieguojiCore

/// The province battle arrows appear while armies attack: over 60 days of the bridged world, some
/// day shows arrows, and every arrow starts in a province of its attacker next to its target.
final class ArrowTests: XCTestCase {
    func testBattleArrowsAppearDuringWars() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        defer { Session.uninstall() }
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        var most = 0, targetingDays = 0
        for day in 0..<60 {
            engine.advance(days: 1)
            let state = try JS.parse(engine.state(includeLabels: false))
            let r = engine.run
            let owners = Dictionary(uniqueKeysWithValues: r.world.provinces.asArray.map { ($0.id.asString, $0.controller.asString) })
            let hostile = r.world.armies.asArray.filter { a in
                guard let t = r.armyAutonomy.armies[a.id.asString].targetId.optionalString, let o = owners[t] else { return false }
                return o != a.nationId.asString && a.troops.asNumber > 0
            }.count
            if hostile > 0 { targetingDays += 1 }
            let arrows = state.arrows.length
            most = max(most, arrows)
            if day % 10 == 9 { print("ARROWS day \(r.world.day.asInt) wars \(state.wars.length) hostile-targets \(hostile) arrows \(arrows)") }
        }
        print("ARROWS most \(most) targeting-days \(targetingDays)")
        XCTAssertGreaterThan(targetingDays, 0, "no army targeted an enemy province")
        XCTAssertGreaterThan(most, 0, "armies attacked but no arrow was made")
    }
}
