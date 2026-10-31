import XCTest
import Foundation
@testable import LieguojiCore

/// Golden forced rebellions from the web (src/native-export/uprising-golden.test.ts): founding or
/// restoration, the internal war and the rebel armies, compared on the whole run (static and naval
/// ledgers excluded).
final class UprisingTests: XCTestCase {
    func testRebellionSuccessMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/uprising.json")))
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray; Nobility.cultures = golden.cultures
        Founding.cultures = try JSONDecoder().decode([Opening.Culture].self, from: Data(contentsOf: world.appendingPathComponent("cultures.json")))
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin"))))
        for (k, v) in golden.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        RebelWar.install()
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            XCTAssertEqual(Rebellion.tryRebel(r, s.province.asString, force: true), s.rebelled.asBool)
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(4))
            if let d = r.difference(expected) { failures += 1; if failures <= 10 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
