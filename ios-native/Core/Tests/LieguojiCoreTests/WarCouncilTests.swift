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

    func testAColumnGathersBesideItsTargetAndGoesInTogether() {
        func army(_ id: String, at province: Int?, target: Int? = nil, pledged: Bool = false, waited: Double = 0, movable: Bool = true) -> WarCouncil.Force {
            WarCouncil.Force(id: id, troops: 2000, x: 0, y: 0, feature: 1, target: target, movable: movable, province: province, still: true, pledged: pledged, waited: waited)
        }
        let goal = post(9, 0, need: 6000), orders: [String: WarCouncil.Duty] = ["a": .attack(9), "b": .attack(9), "c": .attack(9)]
        // Nobody is at the gathering place yet: all three are sent there first.
        var forces = [army("a", at: 1), army("b", at: 2), army("c", at: 3)]
        var out = WarCouncil.muster(orders, forces: forces, attack: [goal], rally: [9: 5])
        XCTAssertEqual(out["a"], .stage(at: 5, goal: 9))
        XCTAssertEqual(out["c"], .stage(at: 5, goal: 9))
        // Two of three have gathered: not yet four fifths of the column.
        forces = [army("a", at: 5, target: 9, pledged: true), army("b", at: 5, target: 9, pledged: true), army("c", at: 3, target: 9, pledged: true)]
        out = WarCouncil.muster(orders, forces: forces, attack: [goal], rally: [9: 5])
        XCTAssertEqual(out["a"], .stage(at: 5, goal: 9))
        // All three stand ready: they go in.
        forces = [army("a", at: 5, target: 9, pledged: true), army("b", at: 5, target: 9, pledged: true), army("c", at: 5, target: 9, pledged: true)]
        out = WarCouncil.muster(orders, forces: forces, attack: [goal], rally: [9: 5])
        XCTAssertEqual(out["a"], .attack(9))
        XCTAssertEqual(out["c"], .attack(9))
        // Once two are on the march, the third follows without waiting behind.
        forces = [army("a", at: 5, target: 9), army("b", at: 5, target: 9), army("c", at: 5, target: 9, pledged: true)]
        out = WarCouncil.muster(orders, forces: forces, attack: [goal], rally: [9: 5])
        XCTAssertEqual(out["c"], .attack(9))
        // A column that has waited too long goes with what it has.
        forces = [army("a", at: 5, target: 9, pledged: true, waited: 50), army("b", at: 2), army("c", at: 3)]
        out = WarCouncil.muster(orders, forces: forces, attack: [goal], rally: [9: 5])
        XCTAssertEqual(out["a"], .attack(9))
        // Far too few for the target: they wait however long, and are not sent in to be beaten.
        let fortress = post(9, 0, need: 20000)
        forces = [army("a", at: 5, target: 9, pledged: true, waited: 90), army("b", at: 5, target: 9, pledged: true, waited: 90), army("c", at: 5, target: 9, pledged: true, waited: 90)]
        out = WarCouncil.muster(orders, forces: forces, attack: [fortress], rally: [9: 5])
        XCTAssertEqual(out["a"], .stage(at: 5, goal: 9))
        // A lone army, and a target with no land of ours beside it, are not held back.
        XCTAssertEqual(WarCouncil.muster(["a": .attack(9)], forces: [army("a", at: 1)], attack: [goal], rally: [9: 5])["a"], .attack(9))
        XCTAssertEqual(WarCouncil.muster(orders, forces: [army("a", at: 1), army("b", at: 2), army("c", at: 3)], attack: [goal], rally: [:])["a"], .attack(9))
        XCTAssertEqual(WarCouncil.Duty.stage(at: 5, goal: 9).province, 5)
        XCTAssertFalse(WarCouncil.Duty.stage(at: 5, goal: 9).urgent)
        XCTAssertTrue(WarCouncil.Duty.attack(9).replaces(target: 5, decision: "staging"))
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
