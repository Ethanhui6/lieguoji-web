import XCTest
import Foundation
@testable import LieguojiCore

/// Golden per-frame army orders on the run from the web (src/native-export/army-orders-golden.test.ts):
/// the five rotating orders of one frame boundary, compared on the whole run.
final class ArmyOrdersTests: XCTestCase {
    func testArmyOrdersMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/army-orders.json")))
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin"))))
        for (k, v) in golden.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        CombatReader.borders = golden.borders.asArray.map { $0.asArray.map(\.asInt) }
        RunWindow.afterOccupation = nil; RunWindow.afterTick = nil
        var input: JS?, failures = 0, issued = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            let out = ArmyOrders.issueBatch(r)
            if out { issued += 1 }
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(4))
            if out != s.issued.asBool { failures += 1; if failures <= 12 { XCTFail("sample \(k) issued: web \(s.issued.asBool)") }; continue }
            if let d = r.difference(expected) { failures += 1; if failures <= 12 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertGreaterThan(issued, 20)
        XCTAssertEqual(failures, 0)
    }
}
