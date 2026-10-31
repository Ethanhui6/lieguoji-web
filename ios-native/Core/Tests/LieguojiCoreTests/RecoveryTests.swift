import XCTest
import Foundation
@testable import LieguojiCore

/// Golden recovery passes from the web (src/native-export/recovery-golden.test.ts).
private struct RecoveryGolden: Decodable {
    struct Input: Decodable { let wars: [[Int]]; let provinces: [Recovery.Province]; let armies: [Recovery.Army] }
    struct Output: Decodable { let troops: [Double]; let populations: [Double]; let grain: [Double]; let consumed: [Double]; let events: [String] }
    struct Sample: Decodable { let input: Input; let output: Output }
    let samples: [Sample]
}

final class RecoveryTests: XCTestCase {
    func testRecoveryMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JSONDecoder().decode(RecoveryGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/recovery.json")))
        XCTAssertGreaterThan(golden.samples.count, 20)
        for (k, s) in golden.samples.enumerated() {
            var provinces = s.input.provinces, armies = s.input.armies
            let wars = Set(s.input.wars.map { [min($0[0], $0[1]), max($0[0], $0[1])] })
            let out = Recovery.day(provinces: &provinces, armies: &armies, nations: s.output.consumed.count, wars: wars)
            XCTAssertEqual(armies.map(\.troops), s.output.troops, "troops, sample \(k)")
            XCTAssertEqual(provinces.map(\.population), s.output.populations, "populations, sample \(k)")
            XCTAssertEqual(provinces.map(\.grain), s.output.grain, "grain, sample \(k)")
            XCTAssertEqual(out.consumed, s.output.consumed, "ledger, sample \(k)")
            XCTAssertEqual(out.events, s.output.events, "events, sample \(k)")
        }
    }
}
