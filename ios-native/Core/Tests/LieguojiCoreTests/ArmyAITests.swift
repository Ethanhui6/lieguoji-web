import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/army-ai-golden.test.ts): two years of a web
/// world at war; every 15 days a full sweep of the five-army batch cursor on a copy (as it stands, and
/// with every retry timer expired). Each batch lists the armies it changed; Swift runs the batches in
/// sequence on its own state.
private struct ArmyAIGolden: Decodable {
    struct Change: Decodable {
        let index: Int; let army: ArmyAIWorld.Army
        init(from decoder: Decoder) throws { var c = try decoder.unkeyedContainer(); index = try c.decode(Int.self); army = try c.decode(ArmyAIWorld.Army.self) }
    }
    struct Batch: Decodable { let cursor: Int; let changes: [Change] }
    struct Sample: Decodable { let input: ArmyAIWorld; let batches: [Batch] }
    let statics: ArmyAIStatic
    let samples: [Sample]
}

final class ArmyAITests: XCTestCase {
    func testArmyOrdersMatchTheWebEngine() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let graph = try TravelGraph(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/travel.bin")))
        let golden = try JSONDecoder().decode(ArmyAIGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/army-ai.json")))
        let engine = ArmyAutonomy(statics: golden.statics, graph: graph)
        var checked = 0, orders = 0, failures = 0
        for (k, s) in golden.samples.enumerated() {
            let travels = s.input.armies.map { ArmyTravel(record: $0.travel, graph: graph) }
            if travels.contains(where: { $0 == nil }) { continue }
            var w = s.input, t = travels.map { $0! }
            for (b, batch) in s.batches.enumerated() {
                let before = w
                engine.issueBatch(&w, travels: &t)
                checked += 1
                XCTAssertEqual(w.cursor, batch.cursor, "cursor, sample \(k) batch \(b)")
                var expected = before.armies
                for c in batch.changes { expected[c.index] = c.army }
                for (i, (got, want)) in zip(w.armies, expected).enumerated() {
                    if want.travel != before.armies[i].travel { orders += 1 }
                    XCTAssertEqual(got.travel, want.travel, "travel of \(want.id), sample \(k) batch \(b)")
                    XCTAssertEqual(got.status, want.status, "status of \(want.id), sample \(k) batch \(b)")
                    XCTAssertEqual(got.row, want.row, "decision of \(want.id), sample \(k) batch \(b)")
                    if got != want { failures += 1 }
                }
                if failures > 8 { return }
                // Continue from the web state so one difference does not cascade.
                w.armies = expected
                t = expected.map { ArmyTravel(record: $0.travel, graph: graph) ?? t[0] }
            }
        }
        XCTAssertGreaterThan(checked, 100)
        XCTAssertGreaterThan(orders, 20)
    }

    func testGarrisonRandomIsAUnitStream() {
        let r = ArmyAutonomy.garrisonRandom("421730/force-1/3/garrison47")
        let a = r(), b = r()
        XCTAssertTrue(a >= 0 && a < 1 && b >= 0 && b < 1 && a != b)
    }
}
