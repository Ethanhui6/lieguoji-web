import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/occupation-golden.test.ts): a web world at
/// war; every other day one occupation pass with every army due.
private struct OccupationGolden: Decodable {
    struct Capture: Decodable {
        let province: Int; let army: String?
        init(from decoder: Decoder) throws { var c = try decoder.unkeyedContainer(); province = try c.decode(Int.self); army = try c.decodeIfPresent(String.self) }
    }
    struct Output: Decodable { let owners: [Int]; let captures: [Capture]; let sieges: [OccupationWorld.Siege] }
    struct Sample: Decodable { let input: OccupationWorld; let due: [String]; let output: Output }
    let samples: [Sample]
}

final class OccupationTests: XCTestCase {
    func testOccupationMatchesTheWebEngine() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden/occupation.json")
        let golden = try JSONDecoder().decode(OccupationGolden.self, from: Data(contentsOf: url))
        var captures = 0, failures = 0
        for (k, s) in golden.samples.enumerated() {
            var w = s.input
            let got = w.advance(due: Set(s.due))
            XCTAssertEqual(got.map(\.province), s.output.captures.map(\.province), "captured provinces, sample \(k)")
            XCTAssertEqual(got.map(\.army), s.output.captures.map(\.army), "captors, sample \(k)")
            XCTAssertEqual(w.owners, s.output.owners, "controllers, sample \(k)")
            XCTAssertEqual(w.sieges, s.output.sieges, "sieges, sample \(k)")
            captures += got.count
            if w.owners != s.output.owners || w.sieges != s.output.sieges { failures += 1; if failures > 5 { return } }
        }
        XCTAssertGreaterThan(captures, 0)
    }
}
