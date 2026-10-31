import XCTest
import Foundation
@testable import LieguojiCore

/// Golden forced family rebellions and civil wars from the web (src/native-export/revolt-golden.test.ts): founding or
/// restoration, the internal war and the rebel armies, compared on the whole run (static and naval
/// ledgers excluded).
final class RevoltTests: XCTestCase {
    func testFamilyRebellionsAndCivilWarsMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/revolt.json")))
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
            let result = s.civil.asBool ? NobleRevolt.startCivilWar(r, s.args.state.asString, s.args.list.asArray.map { $0.asString }) : NobleRevolt.startFamilyRebellion(r, s.args.family.asString)
            XCTAssertEqual(result, s.result.optionalString, "result, sample (k)")
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(4))
            if let d = r.difference(expected) { failures += 1; if failures <= 10 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
