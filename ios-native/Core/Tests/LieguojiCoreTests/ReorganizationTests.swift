import XCTest
import Foundation
@testable import LieguojiCore

/// Golden reorganization days from the web (src/native-export/reorganization-golden.test.ts).
private struct ReorganizationGolden: Decodable {
    struct Input: Decodable { let secondsPerDay: Double; let populations: [Double]; let others: [Double]; let active: [Reorganization.Active] }
    struct Output: Decodable { let active: Bool; let fraction: Double; let troops: Double; let fullStrength: Double; let completed: Int }
    struct Sample: Decodable { let input: Input; let output: [Output] }
    let samples: [Sample]
}

final class ReorganizationTests: XCTestCase {
    func testReorganizationMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JSONDecoder().decode(ReorganizationGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/reorganization.json")))
        XCTAssertGreaterThan(golden.samples.count, 20)
        for (k, s) in golden.samples.enumerated() {
            var active = s.input.active
            let out = Reorganization.day(&active, populations: s.input.populations, others: s.input.others, secondsPerDay: s.input.secondsPerDay)
            for (i, o) in s.output.enumerated() where s.input.active[i].alive {
                XCTAssertEqual(out[i].active, o.active, "active, sample \(k) \(i)")
                XCTAssertEqual(active[i].troops, o.troops, "troops, sample \(k) \(i)")
                XCTAssertEqual(out[i].fullStrength, o.fullStrength, "full strength, sample \(k) \(i)")
                XCTAssertEqual(active[i].completed, o.completed, "completed, sample \(k) \(i)")
                if o.active { XCTAssertEqual(active[i].fraction, o.fraction, "fraction, sample \(k) \(i)") }
            }
        }
    }
}
