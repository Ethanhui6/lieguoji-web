import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/diplomacy-golden.test.ts): four years of a
/// web world, every nation's monthly declaration evaluation on a copy (as it stands, and with its
/// declaration pool and cooldowns opened). Inputs are the full diplomatic snapshot; outputs the
/// pools, random stream and the declared war.
private struct DiplomacyGolden: Decodable {
    struct Goal: Decodable { let id: Int; let type: Int; let scope: [Int]; let requiredCount: Int }
    struct Member: Decodable { let state: Int; let side: Int; let role: Int }
    struct War: Decodable { let casusBelli: Int; let attacker: Int; let defender: Int; let goals: [Goal]; let participants: [Member]; let atWar: [[Int]] }
    struct Output: Decodable { let pools: DiplomacyWorld.Pools; let rng: UInt32; let draws: Int; let war: War? }
    struct Sample: Decodable { let nation: Int; let forced: Bool; let input: DiplomacyWorld; let output: Output }
    let statics: DiplomacyStatic
    let samples: [Sample]
}

final class DiplomacyTests: XCTestCase {
    func testDeclarationsMatchTheWebEngine() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden/diplomacy.json")
        let golden = try JSONDecoder().decode(DiplomacyGolden.self, from: Data(contentsOf: url))
        let engine = DeclarationEngine(statics: golden.statics)
        var wars = 0, failures = 0
        for (k, s) in golden.samples.enumerated() {
            for n in s.input.nations {
                XCTAssertEqual(DiplomacyWorld.strength(troops: n.troops, ships: n.ships, provinces: n.provinces.count), n.strength, "strength, sample \(k)")
            }
            var w = s.input
            let war = engine.evaluate(&w, nation: s.nation)
            let label = "sample \(k) nation \(s.nation) forced \(s.forced)"
            XCTAssertEqual(w.nations[s.nation].pools, s.output.pools, "pools, \(label)")
            XCTAssertEqual(w.rng, s.output.rng, "random, \(label)"); XCTAssertEqual(w.draws, s.output.draws, "draws, \(label)")
            XCTAssertEqual(war?.attacker, s.output.war?.attacker, "attacker, \(label)")
            XCTAssertEqual(war?.defender, s.output.war?.defender, "defender, \(label)")
            if let e = s.output.war, let war {
                wars += 1
                XCTAssertEqual(war.casusBelli, e.casusBelli, "casus belli, \(label)")
                XCTAssertEqual(war.goals.map { [$0.id, $0.type, $0.requiredCount] }, e.goals.map { [$0.id, $0.type, $0.requiredCount] }, "goals, \(label)")
                XCTAssertEqual(war.goals.map(\.scope), e.goals.map(\.scope), "goal provinces, \(label)")
                XCTAssertEqual(war.participants.map { [$0.state, $0.side, $0.role] }, e.participants.map { [$0.state, $0.side, $0.role] }, "sides, \(label)")
                let pairs = Set(w.statecraft.filter(\.war).map { [min($0.a, $0.b), max($0.a, $0.b)] }), expected = Set(e.atWar.map { [min($0[0], $0[1]), max($0[0], $0[1])] })
                XCTAssertEqual(pairs, expected, "relations at war, \(label)")
            }
            if w.nations[s.nation].pools != s.output.pools || (war == nil) != (s.output.war == nil) { failures += 1; if failures > 5 { return } }
        }
        XCTAssertGreaterThan(wars, 5)
    }

    func testCalendarAndRounding() {
        XCTAssertEqual(nativeRoundToEven(2.5), 2); XCTAssertEqual(nativeRoundToEven(3.5), 4); XCTAssertEqual(nativeRoundToEven(-2.5), -2)
        XCTAssertEqual(DiplomacyCalendar.wholeMonths((1, 1, 31), (1, 2, 28)), 1)
        XCTAssertEqual(DiplomacyCalendar.wholeMonths((1, 1, 31), (1, 3, 1)), 1)
        XCTAssertEqual(DiplomacyCalendar.wholeYears((-9998, 1, 1), (1, 1, 1)), 9999)
    }
}
