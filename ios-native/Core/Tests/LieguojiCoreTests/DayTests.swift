import XCTest
import Foundation
@testable import LieguojiCore

/// Golden whole days from the web session (src/native-export/day-golden.test.ts): 120 ticks of
/// military frames, orders, daily settlement and politics from the web state at a day boundary,
/// compared on the whole run except the port ledger (ported separately).
final class DayTests: XCTestCase {
    func testWholeDayMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let data = try Data(contentsOf: dir.appendingPathComponent("Golden/day.json"))
        let golden = try JS.parse(data)
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        Nobility.cultures = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/revolt.json"))).cultures
        Founding.cultures = try JSONDecoder().decode([Opening.Culture].self, from: Data(contentsOf: world.appendingPathComponent("cultures.json")))
        War26.ports = golden.seaPorts.asArray.map { ($0[0].asString, $0[1].asInt) }
        struct Wrapper: Decodable { let statics: DiplomacyStatic }
        Session.engine = DeclarationEngine(statics: try JSONDecoder().decode(Wrapper.self, from: data).statics)
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin"))))
        for (k, v) in golden.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        CombatReader.borders = golden.borders.asArray.map { $0.asArray.map(\.asInt) }
        RunWindow.afterOccupation = nil
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            Session.advance(r, ticks: 120)
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(4))
            r.portControl = expected.portControl
            if let d = r.difference(expected) { failures += 1; if failures <= 12 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
