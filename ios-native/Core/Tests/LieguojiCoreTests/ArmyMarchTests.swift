import XCTest
import Foundation
@testable import LieguojiCore

/// 行军不来回：目标稳定时，军队在界面上的位置逐日前进，不出现方向反转（往返晃动）。
final class ArmyMarchTests: XCTestCase {
    func test稳定目标下行军不往返() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        defer { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil }
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        // 停战：不让交战打断行军，只看行军本身。
        _ = engine.setWorld("stopWars", 1)
        let r = engine.run
        let army = try XCTUnwrap(r.world.armies.asArray.first { $0.troops.asNumber > 0 && $0.status.asString == "idle" })
        let id = army.id.asString
        let here = try XCTUnwrap(Armies.space(r).first { $0.army.id.asString == id }?.province)
        let provinces = r.world.provinces.asArray
        func far(_ p: JS) -> Double { jsHypot(p.center.x.asNumber - here.center.x.asNumber, p.center.y.asNumber - here.center.y.asNumber) }
        // 本国最远且可达的州：玩家军令（接管后军机不会改派）。
        var ordered = false
        for i in provinces.indices.sorted(by: { far(provinces[$0]) > far(provinces[$1]) }) where provinces[i].controller.asString == army.nationId.asString {
            if engine.order(armyId: id, provinceIndex: i).ok { ordered = true; break }
        }
        XCTAssertTrue(ordered, "应能找到可达的目的地")
        var last: (x: Float, y: Float)?, heading: (x: Float, y: Float)?, moves = 0, reversals = 0
        for _ in 0..<90 {
            engine.advance(days: 1)
            guard let a = engine.gameState(includeLabels: false).armies.first(where: { $0.id == id }) else { break }
            if let p = last {
                let d = (x: a.x - p.x, y: a.y - p.y), len = (d.x * d.x + d.y * d.y).squareRoot()
                if len > 0.05 {
                    if let h = heading {
                        let hl = (h.x * h.x + h.y * h.y).squareRoot()
                        if (d.x * h.x + d.y * h.y) / (len * hl) < -0.7 { reversals += 1 }
                    }
                    heading = d; moves += 1
                }
            }
            last = (a.x, a.y)
            if a.travel != "moving" && moves > 0 { break }
        }
        XCTAssertGreaterThan(moves, 3, "军队应已行军若干日")
        XCTAssertEqual(reversals, 0, "稳定目标下行军出现了往返")
    }
}
