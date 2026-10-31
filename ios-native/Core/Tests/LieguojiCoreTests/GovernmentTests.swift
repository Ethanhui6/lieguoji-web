import XCTest
import Foundation
@testable import LieguojiCore

/// Golden government continuity and records from the web (src/native-export/government-golden.test.ts).
final class GovernmentTests: XCTestCase {
    func testContinuityAndRecordsMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/government.json")))
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            Government.reconcileContinuity(r); Government.recordReigns(r); Government.recordStateTraits(r)
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(3))
            if let d = r.difference(expected) { failures += 1; if failures <= 10 { XCTFail("\(s.variant.asString) sample \(k): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
