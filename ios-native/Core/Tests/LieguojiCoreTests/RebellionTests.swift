import XCTest
import Foundation
@testable import LieguojiCore

/// Golden province rebellion days from the web (src/native-export/rebellion-golden.test.ts).
final class RebellionTests: XCTestCase {
    func testRebellionChecksMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/rebellion.json")))
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        var input: JS?, failures = 0, checked = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            // A rebellion that happened founds a state: that path is the founding module's.
            if s.rebelled.asBool { continue }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            Rebellion.advance(r)
            if s.monthly.asBool { for n in r.world.nations.asArray { Rebellion.stateMonth(r, n.id.asString) } }
            checked += 1
            if let d = r.difference(expected) { failures += 1; if failures <= 10 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertGreaterThan(checked, 80)
        XCTAssertEqual(failures, 0)
    }
}
