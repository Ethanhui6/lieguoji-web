import XCTest
import Foundation
@testable import LieguojiCore

/// Open-sea world with starting fleets (src/native-export/navy-day-golden.test.ts), naval ledgers compared.
/// Golden whole days from the web session (src/native-export/day-golden.test.ts): 120 ticks of
/// military frames, orders, daily settlement and politics from the web state at a day boundary,
/// compared on the whole run except the port ledger (ported separately).
final class NavyDayTests: XCTestCase {
    func testOpenSeaDayMatchesTheWeb() throws { try check("navy-day.json") }
    func testOpenSeaWarDayMatchesTheWeb() throws { try check("navy-war-day.json") }
    func check(_ file: String) throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let data = try Data(contentsOf: dir.appendingPathComponent("Golden/" + file))
        let golden = try JS.parse(data)
        let catalog = world.deletingLastPathComponent().appendingPathComponent("Catalog")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: catalog.appendingPathComponent("traits.json")), nobleCultures: Data(contentsOf: catalog.appendingPathComponent("noble-cultures.json")),
                                      cultures: Data(contentsOf: world.appendingPathComponent("cultures.json")))
        Naval.sea = Naval.Sea(golden.sea); Naval.cellsCache = nil
        War26.ports = golden.seaPorts.asArray.map { ($0[0].asString, $0[1].asInt) }
        struct Wrapper: Decodable { let statics: DiplomacyStatic }
        Session.engine = DeclarationEngine(statics: try JSONDecoder().decode(Wrapper.self, from: data).statics)
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin"))))
        for (k, v) in golden.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        CombatReader.borders = golden.borders.asArray.map { $0.asArray.map(\.asInt) }
        RunWindow.afterOccupation = nil
        defer { Naval.sea = nil; Session.uninstall(); Profile.enabled = false; print(Profile.report.split(separator: "\n").map { "PROFILE " + $0 }.joined(separator: "\n")) }
        Profile.reset(); Profile.enabled = true
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            Session.advance(r, ticks: 120)
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(4))
            if ProcessInfo.processInfo.environment["NAVY_DEBUG"] != nil, k < 2 {
                let a = Set(r.world.events.asArray.map(\.json)); for e in expected.world.events.asArray where !a.contains(e.json) { FileHandle.standardError.write(("WANT " + e.json.prefix(500) + "\n").data(using: .utf8)!) }
                let b = Set(expected.world.events.asArray.map(\.json)); for e in r.world.events.asArray where !b.contains(e.json) { FileHandle.standardError.write(("GOT " + e.json.prefix(500) + "\n").data(using: .utf8)!) }
            }
            if let d = r.difference(expected) { failures += 1; if failures <= 6 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
