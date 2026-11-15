import XCTest
@testable import LieguojiCore

/// 占领与战场墨晕：入境即晕、方向与入境方向一致、兵力定分界、撤出即收。
final class InkFrontTests: XCTestCase {
    /// 两国交战；州 0 属国 0（西），州 1 属国 1（东），各州中心 (0,0) 与 (100,0)，半径 40。
    private let disks = [InkFront.Disk(center: SIMD2(0, 0), radius: 40), InkFront.Disk(center: SIMD2(100, 0), radius: 40)]
    private func state(_ armies: [(id: String, nation: Int, troops: Int, province: Int, x: Float, y: Float)], owners: [Int] = [0, 1], sieges: [(Int, Int, Double)] = []) throws -> GameState {
        func nation(_ enemies: [Int]) -> [String: Any] {
            ["provinces": 1, "cities": 1, "population": 1000, "grain": 0, "troops": 0, "gold": 0, "destiny": 0, "enemies": enemies, "alive": true]
        }
        let json: [String: Any] = [
            "day": 1, "date": ["year": 1, "month": 1, "day": 1], "owners": owners,
            "nations": [nation([1]), nation([0])],
            "armies": armies.map { a in ["id": a.id, "name": a.id, "nation": a.nation, "troops": a.troops, "unit": "", "status": "idle", "travel": "moving",
                                         "province": a.province, "supplies": 0, "morale": 0, "x": a.x, "y": a.y, "manual": false] as [String: Any] },
            "wars": [], "sieges": sieges.map { ["province": $0.0, "nation": $0.1, "progress": $0.2] }, "events": [],
        ]
        return try JSONDecoder().decode(GameState.self, from: JSONSerialization.data(withJSONObject: json))
    }
    private func dot(_ a: SIMD2<Float>, _ b: SIMD2<Float>) -> Float { a.x * b.x + a.y * b.y }

    func testInkStartsTheStepAnArmyEntersFromItsSide() throws {
        let ink = InkFront()
        // 西边的军队向东行进，还在本国。
        XCTAssertTrue(ink.update(try state([("a", 0, 5000, 0, 52, 0)]), disks: disks).isEmpty)
        // 下一步越过州界（x≈60）进入敌州：这一步就有墨晕，来向朝西。
        let grounds = ink.update(try state([("a", 0, 5000, 1, 66, 0)]), disks: disks)
        XCTAssertEqual(grounds.count, 1)
        let g = try XCTUnwrap(grounds.first)
        XCTAssertEqual(g.province, 1); XCTAssertFalse(g.contested)
        XCTAssertGreaterThan(dot(g.camps[0].direction, SIMD2(-1, 0)), 0.95, "墨色应从入境的西侧洇进")
        XCTAssertGreaterThan(g.camps[0].reach, 0.1, "入境当步就要开始晕染")
        // 渲染端按时间常数逼近：入境后 0.3 秒内覆盖面已明显可见。
        var reach: Float = 0
        for _ in 0..<18 { reach = InkFront.ease(reach, toward: g.camps[0].reach, seconds: 1.0 / 60, tau: 0.25) }
        XCTAssertGreaterThan(reach, g.camps[0].reach * 0.6)
        // 继续深入后仍从原入境方向晕开（不随军队位置漂移）。
        let deeper = try XCTUnwrap(ink.update(try state([("a", 0, 5000, 1, 100, 30)]), disks: disks).first)
        XCTAssertGreaterThan(dot(deeper.camps[0].direction, SIMD2(-1, 0)), 0.95)
    }

    func testEntryFromTheNorthInksFromTheNorth() throws {
        let ink = InkFront()
        _ = ink.update(try state([("a", 0, 3000, 0, 100, -60)], owners: [0, 1]), disks: disks)
        let g = try XCTUnwrap(ink.update(try state([("a", 0, 3000, 1, 100, -34)]), disks: disks).first)
        XCTAssertGreaterThan(dot(g.camps[0].direction, SIMD2(0, -1)), 0.95)
    }

    func testOccupationSpreadsWithTheSiegeAndDefendersSplitByStrength() throws {
        let ink = InkFront()
        _ = ink.update(try state([("a", 0, 6000, 0, 55, 0)]), disks: disks)
        // 围城进度过半：覆盖面随之过半。
        let half = try XCTUnwrap(ink.update(try state([("a", 0, 6000, 1, 70, 0)], sieges: [(1, 0, 0.4)]), disks: disks).first)
        XCTAssertGreaterThan(half.camps[0].reach, 0.6)
        // 守军赶到：变成交战，双方各占一侧，兵力 2:1。
        let battle = try XCTUnwrap(ink.update(try state([("a", 0, 6000, 1, 72, 0), ("d", 1, 3000, 1, 100, 0)]), disks: disks).first)
        XCTAssertTrue(battle.contested)
        let attacker = try XCTUnwrap(battle.camps.first { $0.nation == 0 }), defender = try XCTUnwrap(battle.camps.first { $0.nation == 1 })
        XCTAssertGreaterThan(dot(attacker.direction, SIMD2(-1, 0)), 0.95)
        XCTAssertGreaterThan(dot(defender.direction, SIMD2(1, 0)), 0.95, "守在州心的守军从进攻方的对面推进")
        XCTAssertEqual(attacker.troops / (attacker.troops + defender.troops), 2.0 / 3.0, accuracy: 0.01)
        // 进攻方撤出：该州不再有墨晕（渲染端收拢淡去）。
        XCTAssertTrue(ink.update(try state([("a", 0, 6000, 0, 50, 0), ("d", 1, 3000, 1, 100, 0)]), disks: disks).isEmpty)
    }

    func testOwnArmiesAtHomeLeaveNoInk() throws {
        let ink = InkFront()
        XCTAssertTrue(ink.update(try state([("a", 0, 6000, 0, 0, 0), ("b", 1, 6000, 1, 100, 0)]), disks: disks).isEmpty)
    }
}
