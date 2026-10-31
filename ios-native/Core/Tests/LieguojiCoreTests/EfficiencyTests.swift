import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/efficiency-golden.test.ts): every living
/// army's resolved combat inputs and the web combat reader's efficiency, every 5 days for 300 days.
private struct EfficiencyGolden: Decodable {
    struct Sample: Decodable {
        let id: String; let efficiency: Double; let input: Efficiency.Input
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: Key.self)
            id = try c.decode(String.self, forKey: .id); efficiency = try c.decode(Double.self, forKey: .efficiency)
            input = try Efficiency.Input(from: decoder)
        }
        enum Key: String, CodingKey { case id, efficiency }
    }
    let samples: [Sample]
}

final class EfficiencyTests: XCTestCase {
    func testCombatEfficiencyMatchesTheWebEngine() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden/efficiency.json")
        let golden = try JSONDecoder().decode(EfficiencyGolden.self, from: Data(contentsOf: url))
        var failures = 0
        for (k, s) in golden.samples.enumerated() {
            let got = Efficiency.compute(s.input)
            XCTAssertEqual(got, s.efficiency, "efficiency of \(s.id), sample \(k)")
            if got != s.efficiency { failures += 1; if failures > 8 { return } }
        }
        XCTAssertGreaterThan(golden.samples.count, 500)
    }
}
