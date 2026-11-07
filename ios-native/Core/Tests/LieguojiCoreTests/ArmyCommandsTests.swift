import XCTest
import Foundation
@testable import LieguojiCore

/// 军令 on a live app world: split, merge, reinforce, hold, hand back, rename and disband keep the
/// run consistent and the simulation keeps running; the new panels' data decodes.
final class ArmyCommandsTests: XCTestCase {
    func testArmyOrdersKeepTheRunPlayable() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        // enableAppRules installs global hooks; later parity tests must run without them.
        defer { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil }
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        func live() -> [JS] { engine.run.world.armies.asArray.filter { $0.troops.asNumber > 0 && $0.status.asString != "destroyed" } }
        let army = try XCTUnwrap(live().first { $0.troops.asInt >= 400 && $0.status.asString != "fighting" })
        let id = army.id.asString, troops = army.troops.asInt, before = live().count

        XCTAssertTrue(engine.splitArmy(id).ok)
        XCTAssertEqual(live().count, before + 1)
        let part = try XCTUnwrap(live().last)
        XCTAssertEqual(part.troops.asInt + army.troops.asInt, troops)
        XCTAssertFalse(engine.run.armyPositions.records[part.id.asString].isNull)
        engine.advance(days: 2)

        if live().contains(where: { $0.id.asString == part.id.asString }), part.status.asString != "fighting", army.status.asString != "fighting" {
            let merged = engine.mergeArmy(part.id.asString, into: id)
            if merged.ok { XCTAssertEqual(part.status.asString, "destroyed") }
        }
        _ = engine.reinforceArmy(id)
        XCTAssertTrue(engine.holdArmy(id).ok)
        XCTAssertTrue(engine.run.voyages.manualArmies.asArray.contains { $0.asString == id })
        XCTAssertTrue(engine.setArmyManual(id, manual: false).ok)
        XCTAssertFalse(engine.run.voyages.manualArmies.asArray.contains { $0.asString == id })
        XCTAssertTrue(engine.renameArmy(id, name: "试锋营").ok)
        XCTAssertEqual(army.name.asString, "试锋营")
        if army.status.asString != "fighting" { XCTAssertTrue(engine.disbandArmy(id).ok); XCTAssertEqual(army.troops.asInt, 0) }

        // The world rules, the diplomacy overview and the state keep working after the orders.
        XCTAssertTrue(engine.setWorldRule("war", value: 200).ok)
        XCTAssertEqual(try JS.parse(XCTUnwrap(engine.worldRules())).war.asNumber, 200)
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: XCTUnwrap(engine.diplomacyInfo(0))))
        // 特产与贸易, 生计, 族谱.
        let trade = try JS.parse(XCTUnwrap(engine.tradeInfo(0)))
        XCTAssertGreaterThan(trade.goods.length, 0)
        XCTAssertTrue(engine.setLivelihood(0, "Commercial").ok)
        XCTAssertFalse(engine.setLivelihood(0, "Nonsense").ok)
        XCTAssertTrue(engine.setSpecialty(0, 6).ok)
        XCTAssertEqual(Trade.of(engine.run, engine.run.world.provinces[0].id.asString), 6)
        if let family = engine.run.kin.families.objectKeys.first {
            XCTAssertGreaterThan(try JS.parse(XCTUnwrap(engine.familyTree(family))).members.length, 0)
        }
        // 军团信息 and the world editor's 停止所有战争 / 解除所有同盟.
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: XCTUnwrap(engine.armyRecord(id))))
        _ = engine.setWorld("dissolveAlliances", 1)
        _ = engine.setWorld("stopWars", 1)
        XCTAssertFalse(engine.run.nativeWars.campaigns.asArray.contains { $0.endedTick.isNull && $0.internal.isNull })
        XCTAssertFalse(engine.run.alliances.records.asArray.contains { $0.endedTick.isNull && $0.members.length > 0 })
        engine.advance(days: 3)
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: engine.state(includeLabels: false)))
    }
}
