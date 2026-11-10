import XCTest
@testable import LieguojiCore

/// 军机调度: how a state divides its armies among its posts.
final class WarCouncilTests: XCTestCase {
    private func force(_ id: String, _ x: Double, troops: Double = 2000, target: Int? = nil, movable: Bool = true) -> WarCouncil.Force {
        WarCouncil.Force(id: id, troops: troops, x: x, y: 0, feature: 1, target: target, movable: movable)
    }
    private func post(_ p: Int, _ x: Double, need: Double) -> WarCouncil.Post { WarCouncil.Post(province: p, x: x, y: 0, feature: 1, need: need) }

    func testOnlyAsManyArmiesAsTheInvasionCallsForTurnBack() {
        let forces = (0..<6).map { force("a\($0)", Double($0) * 10) }
        let duties = WarCouncil.assign(forces: forces, defend: [post(1, 0, need: 3000)], hold: [], holdBudget: 0, attack: [post(2, 100, need: 2500)])
        XCTAssertEqual(duties.values.filter { $0 == .defend(1) }.count, 2, "two armies of 2000 cover a need of 3000")
        XCTAssertEqual(duties["a0"], .defend(1), "the nearest go")
        XCTAssertEqual(duties["a1"], .defend(1))
        XCTAssertEqual(duties.values.filter { $0 == .attack(2) }.count, 4, "the rest stay on the offensive")
    }

    func testAnArmyAlreadyBoundForAPostKeepsItInsteadOfANearerOne() {
        let forces = [force("near", 1), force("bound", 500, target: 1)]
        let duties = WarCouncil.assign(forces: forces, defend: [post(1, 0, need: 1000)], hold: [], holdBudget: 0, attack: [post(2, 100, need: 1)])
        XCTAssertEqual(duties["bound"], .defend(1))
        XCTAssertEqual(duties["near"], .attack(2))
    }

    func testABesiegingArmyIsNotCalledAway() {
        let forces = [force("siege", 0, target: 9, movable: false), force("free", 800)]
        let duties = WarCouncil.assign(forces: forces, defend: [post(1, 0, need: 4000)], hold: [], holdBudget: 0, attack: [post(9, 0, need: 1000)])
        XCTAssertEqual(duties["siege"], .attack(9))
        XCTAssertEqual(duties["free"], .defend(1))
    }

    func testAHostTooStrongIsNotFedArmiesOneByOneUnlessItIsTheCapital() {
        let forces = [force("a", 0), force("b", 1)]
        let far = WarCouncil.assign(forces: forces, defend: [post(1, 0, need: 20000)], hold: [], holdBudget: 0, attack: [post(2, 5, need: 1000)])
        XCTAssertEqual(far["a"], .attack(2), "the armies go where they can do some good")
        let capital = WarCouncil.Post(province: 1, x: 0, y: 0, feature: 1, need: 20000, mustHold: true)
        let home = WarCouncil.assign(forces: forces, defend: [capital], hold: [], holdBudget: 0, attack: [post(2, 5, need: 1000)])
        XCTAssertEqual(home["a"], .defend(1), "a capital is held regardless")
    }

    func testHoldingForcesStayWithinTheirBudget() {
        let forces = (0..<4).map { force("a\($0)", Double($0)) }
        let duties = WarCouncil.assign(forces: forces, defend: [], hold: [post(1, 0, need: 2000), post(2, 0, need: 2000), post(3, 0, need: 2000)], holdBudget: 2500, attack: [post(4, 0, need: 1)])
        XCTAssertEqual(duties.values.filter { if case .hold = $0 { return true }; return false }.count, 2)
    }

    func testOutmatchedReliefDoesNotKeepMarchingArmiesCommitted() {
        let forces = [force("bound", 0, target: 1), force("free", 20)]
        let duties = WarCouncil.assign(forces: forces, defend: [post(1, 0, need: 20000)], hold: [], holdBudget: 0, attack: [post(2, 30, need: 1000)])
        XCTAssertEqual(duties["bound"], .attack(2), "a marching order must not commit a hopeless relief before the strength check")
        XCTAssertEqual(duties["free"], .attack(2))
    }

    func testOutmatchedReliefKeepsOnlyArmiesAlreadyEngagedThere() {
        let forces = [force("engaged", 0, target: 1, movable: false), force("bound", 10, target: 1), force("free", 20)]
        let duties = WarCouncil.assign(forces: forces, defend: [post(1, 0, need: 20000)], hold: [], holdBudget: 0, attack: [post(2, 30, need: 1000)])
        XCTAssertEqual(duties["engaged"], .defend(1), "an ongoing battle cannot be recalled")
        XCTAssertEqual(duties["bound"], .attack(2))
        XCTAssertEqual(duties["free"], .attack(2))
    }

    func testBoundReliefStillDefendsAnOutmatchedCapital() {
        let forces = [force("bound", 0, target: 1), force("free", 20)]
        let capital = WarCouncil.Post(province: 1, x: 0, y: 0, feature: 1, need: 20000, mustHold: true)
        let duties = WarCouncil.assign(forces: forces, defend: [capital], hold: [], holdBudget: 0, attack: [post(2, 30, need: 1000)])
        XCTAssertEqual(duties["bound"], .defend(1))
        XCTAssertEqual(duties["free"], .defend(1))
    }

    func testCancelledReliefCanReplaceMarchButOrdinaryAttacksKeepTheirProgress() {
        XCTAssertTrue(WarCouncil.Duty.attack(2).replaces(target: 1, decision: "supporting"))
        XCTAssertTrue(WarCouncil.Duty.attack(2).replaces(target: 1, decision: "guarding"))
        XCTAssertFalse(WarCouncil.Duty.attack(2).replaces(target: 1, decision: "attacking"))
        XCTAssertFalse(WarCouncil.Duty.attack(2).replaces(target: 1, decision: "returning"))
        XCTAssertFalse(WarCouncil.Duty.defend(1).replaces(target: 1, decision: "supporting"))
        XCTAssertTrue(WarCouncil.Duty.defend(2).replaces(target: 1, decision: "attacking"))
    }

    func testEveryFreeArmyGetsOrdersAndOnlyDefenceIsWorthARecall() {
        let forces = (0..<5).map { force("a\($0)", Double($0)) }
        let duties = WarCouncil.assign(forces: forces, defend: [], hold: [], holdBudget: 0, attack: [post(4, 0, need: 1)])
        XCTAssertEqual(duties.count, 5)
        XCTAssertFalse(WarCouncil.Duty.attack(1).urgent)
        XCTAssertTrue(WarCouncil.Duty.defend(1).urgent)
        XCTAssertTrue(WarCouncil.Duty.hold(1).urgent)
    }
}
