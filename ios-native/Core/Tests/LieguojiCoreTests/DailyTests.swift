import XCTest
import Foundation
@testable import LieguojiCore

/// Golden daily settlements from the web (src/native-export/daily-golden.test.ts): the pending day
/// boundary settled without autonomous orders, compared on the whole run.
final class DailyTests: XCTestCase {
    func testDailySettlementMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/daily.json")))
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin"))))
        for (k, v) in golden.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        Daily.dailyOrders = nil
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            Daily.settle(r)
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(4))
            if let d = r.difference(expected) { failures += 1; if failures <= 12 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
