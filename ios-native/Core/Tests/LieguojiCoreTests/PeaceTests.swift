import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/peace-golden.test.ts): every active war,
/// every 10 days for three years, with the war score, weariness, collapse, goals and peace reason.
private struct PeaceGolden: Decodable {
    struct Output: Decodable {
        let score: PeaceAI.Score; let attackerWeariness: Double; let defenderWeariness: Double; let forceSettle: Double; let months: Int
        let attackerCollapsed: Bool; let defenderCollapsed: Bool; let goalsAchieved: Bool; let autonomous: Bool; let reason: Int?
    }
    struct Sample: Decodable { let war: PeaceWar; let world: PeaceWorld; let output: Output }
    let samples: [Sample]
}

final class PeaceTests: XCTestCase {
    func testPeaceDecisionsMatchTheWebEngine() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden/peace.json")
        let golden = try JSONDecoder().decode(PeaceGolden.self, from: Data(contentsOf: url))
        var failures = 0, reasons = 0
        for (k, s) in golden.samples.enumerated() {
            let ai = PeaceAI(war: s.war, world: s.world), o = s.output, label = "war \(s.war.id), sample \(k)"
            XCTAssertEqual(ai.months(), o.months, "months, \(label)")
            XCTAssertEqual(ai.score(), o.score, "score, \(label)")
            XCTAssertEqual(ai.weariness(s.war.primaryAttackerId), o.attackerWeariness, "attacker weariness, \(label)")
            XCTAssertEqual(ai.weariness(s.war.primaryDefenderId), o.defenderWeariness, "defender weariness, \(label)")
            XCTAssertEqual(ai.forceSettleThreshold(), o.forceSettle, "force settle, \(label)")
            XCTAssertEqual(ai.collapsed(s.war.primaryAttackerId), o.attackerCollapsed, "attacker collapse, \(label)")
            XCTAssertEqual(ai.collapsed(s.war.primaryDefenderId), o.defenderCollapsed, "defender collapse, \(label)")
            XCTAssertEqual(ai.allGoalsAchieved(), o.goalsAchieved, "goals, \(label)")
            XCTAssertEqual(ai.hasAutonomousParticipant(), o.autonomous, "autonomy, \(label)")
            XCTAssertEqual(ai.decide(), o.reason, "peace reason, \(label)")
            if o.reason != nil { reasons += 1 }
            if ai.score() != o.score || ai.decide() != o.reason { failures += 1; if failures > 6 { return } }
        }
        XCTAssertGreaterThan(golden.samples.count, 50)
        _ = reasons
    }
}
