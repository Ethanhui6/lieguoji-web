import XCTest
import Foundation
@testable import LieguojiCore

final class WorldRulesTests: XCTestCase {
    func testUnsetRulesAreNormalAndSetOnesScale() {
        let r = JS.object()
        XCTAssertEqual(Regimes.rule(r, "war"), 1)
        r.regimes = JS.object(); r.regimes.world = JS.object()
        r.regimes.world.war = JS(200); r.regimes.world.damage = JS(50); r.regimes.world.levy = JS(0)
        XCTAssertEqual(Regimes.rule(r, "war"), 2)
        XCTAssertEqual(Regimes.rule(r, "damage"), 0.5)
        XCTAssertEqual(Regimes.rule(r, "march"), 1)
        // Zero still leaves a floor, so no rate divides by zero.
        XCTAssertGreaterThan(Regimes.rule(r, "levy"), 0)
    }

    func testCombatIntensityScalesBothSides() {
        let r = JS.object()
        r.regimes = JS.object(); r.regimes.world = JS.object(); r.regimes.world.damage = JS(150)
        // 战斗烈度 times the cloud-tuned lethality of app worlds.
        XCTAssertEqual(Regimes.combatBonus(r, attacker: "n-0", victim: "n-1"), 1.5 * Tuning.current.lethality / Regimes.grit(r, "n-1"), accuracy: 1e-9)
    }

    func testLiveWarSettingsAreKeptInTheSave() throws {
        let world = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden/bridge-world.json")
        let service = EngineService()
        defer { Session.uninstall() }
        XCTAssertTrue(service.handle("open", [:], payload: try Data(contentsOf: world)).ok)
        let reply = service.handle("setWorldRule", ["key": "war", "value": 0, "withoutState": true])
        XCTAssertTrue(reply.ok)
        XCTAssertNil(reply.data)
        let run = try XCTUnwrap(service.engine?.run)
        XCTAssertEqual(Regimes.rule(run, "war"), 0)
        XCTAssertEqual(Regimes.rule(run, "damage"), 1)
        let saved = try XCTUnwrap(service.handle("save", [:]).data)
        XCTAssertTrue(service.handle("open", [:], payload: saved).ok)
        XCTAssertEqual(Regimes.rule(try XCTUnwrap(service.engine?.run), "war"), 0)
    }
}
