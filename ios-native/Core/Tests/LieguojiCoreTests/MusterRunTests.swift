import XCTest
import Foundation
@testable import LieguojiCore

/// Golden musters on the run from the web (src/native-export/muster-run-golden.test.ts): musterMonth47
/// with full army creation, on chained inputs.
final class MusterRunTests: XCTestCase {
    func testMusterOnTheRunMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/muster-run.json")))
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin"))))
        for (k, v) in golden.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            Armies.muster(r)
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(3))
            if let d = r.difference(expected) { failures += 1; if failures <= 10 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
