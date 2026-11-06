import XCTest
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
        XCTAssertEqual(Regimes.combatBonus(r, attacker: "n-0", victim: "n-1"), 1.5, accuracy: 1e-9)
    }
}
