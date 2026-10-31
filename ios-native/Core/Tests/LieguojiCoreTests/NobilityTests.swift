import XCTest
import Foundation
@testable import LieguojiCore

/// Golden family steps from the web (src/native-export/nobility-golden.test.ts): inputs chained as
/// patches on the previous input, each with the patch advanceNobility47 made to it.
final class NobilityTests: XCTestCase {
    static func apply(_ patch: JS, to root: JS) {
        for op in patch.asArray {
            let path = op.p.asArray.map(\.asString)
            var node = root
            for k in path.dropLast() { node = node[k] }
            if op.d.isTruthy { node.delete(path.last!) } else { node[path.last!] = op.v.clone() }
        }
    }
    func testFamilyStepMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json")))
        People.loadTraits(golden.traits); Nobility.traitList = golden.traits.asArray; Nobility.cultures = golden.cultures
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); Self.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            Self.apply(s.patch, to: expected)
            Nobility.advance(r)
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(3))
            if let d = r.difference(expected) { failures += 1; if failures <= 12 { XCTFail("sample \(k)\(s.forced.isNull ? "" : " forced"): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
