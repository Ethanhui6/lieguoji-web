import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/settlement-golden.test.ts): every active
/// external war every 30 days for three years, settled on copies with each peace reason.
private struct SettlementGolden: Decodable {
    struct Gold: Decodable { let id: Int; let gold: Double }
    struct Output: Decodable {
        let winnerSide: Int?; let enforcedGoals: [Int]; let transfers: [Settlement.Transfer]; let effects: [Settlement.Effect]
        let outcomes: [[Int]]; let provinceStates: [Int]; let gold: [Gold]
    }
    struct Sample: Decodable { let reason: Int; let war: PeaceWar; let world: PeaceWorld; let output: Output }
    let samples: [Sample]
}

final class SettlementTests: XCTestCase {
    func testSettlementsMatchTheWebEngine() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden/settlement.json")
        let golden = try JSONDecoder().decode(SettlementGolden.self, from: Data(contentsOf: url))
        var failures = 0, transfers = 0
        for (k, s) in golden.samples.enumerated() {
            var world = s.world
            guard let r = Settlement.settle(war: s.war, world: &world, reason: s.reason) else { XCTFail("no plan, sample \(k)"); continue }
            let label = "war \(s.war.id) reason \(s.reason), sample \(k)"
            XCTAssertEqual(r.winnerSide, s.output.winnerSide, "winner, \(label)")
            XCTAssertEqual(r.enforcedGoals, s.output.enforcedGoals, "enforced goals, \(label)")
            XCTAssertEqual(r.applied, s.output.transfers, "transfers, \(label)")
            XCTAssertEqual(r.effects, s.output.effects, "effects, \(label)")
            XCTAssertEqual(r.outcomes, s.output.outcomes, "outcomes, \(label)")
            XCTAssertEqual(world.provinceStates, s.output.provinceStates, "ownership, \(label)")
            for g in s.output.gold { XCTAssertEqual(world.states.first { $0.id == g.id }?.gold, g.gold, "treasury of \(g.id), \(label)") }
            transfers += r.applied.count
            if r.winnerSide != s.output.winnerSide || r.applied != s.output.transfers || r.outcomes != s.output.outcomes { failures += 1; if failures > 6 { return } }
        }
        XCTAssertGreaterThan(transfers, 0)
    }
}
