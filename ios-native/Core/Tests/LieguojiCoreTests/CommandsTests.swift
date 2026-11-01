import XCTest
import Foundation
@testable import LieguojiCore

/// Golden player commands from the web (src/native-export/commands-golden.test.ts): march, halt,
/// declaration of war and white peace on copies of the run, with validity and reason text.
final class CommandsTests: XCTestCase {
    func testPlayerCommandsMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let data = try Data(contentsOf: dir.appendingPathComponent("Golden/commands.json"))
        let golden = try JS.parse(data)
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        Nobility.cultures = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/revolt.json"))).cultures
        Founding.cultures = try JSONDecoder().decode([Opening.Culture].self, from: Data(contentsOf: dir.appendingPathComponent("Golden/cultures-v1.json")))
        struct Wrapper: Decodable { let statics: DiplomacyStatic }
        Session.engine = DeclarationEngine(statics: try JSONDecoder().decode(Wrapper.self, from: data).statics)
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin"))))
        for (k, v) in golden.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        CombatReader.borders = golden.borders.asArray.map { $0.asArray.map(\.asInt) }
        War26.ports = []; War26.install(); RebelWar.install(); NobleRevolt.install()
        defer { Session.uninstall() }
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            let engine = NativeEngine(run: r)
            let c = s.command
            let out: (ok: Bool, reason: String)
            switch c.kind.asString {
            case "order": out = engine.order(armyId: c.army.asString, provinceIndex: c.province.asInt)
            case "declare": out = engine.politics(declare: true, c.a.asInt, c.b.asInt)
            default: out = engine.politics(declare: false, c.a.asInt, c.b.asInt)
            }
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(4))
            if out.ok != s.ok.asBool || out.reason != s.reason.asString {
                failures += 1; if failures <= 12 { XCTFail("sample \(k) \(c.kind.asString): web \(s.ok.asBool) \(s.reason.asString) | swift \(out.ok) \(out.reason)") }; continue
            }
            if let d = r.difference(expected) { failures += 1; if failures <= 12 { XCTFail("sample \(k) \(c.kind.asString): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
