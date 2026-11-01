import XCTest
import Foundation
@testable import LieguojiCore

/// Golden military frames on the run from the web (src/native-export/run-window-golden.test.ts):
/// one frame of motion, volleys and occupation with the political-occupation record, compared on
/// the whole run.
final class RunWindowTests: XCTestCase {
    func testMilitaryWindowOnTheRunMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/run-window.json")))
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin"))))
        for (k, v) in golden.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        CombatReader.borders = golden.borders.asArray.map { $0.asArray.map(\.asInt) }
        RunWindow.afterOccupation = nil; RunWindow.afterTick = nil
        var input: JS?, failures = 0, volleys = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            let out = RunWindow.advance(r, ticks: Daily.frameTicks(r) ?? 20)
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(4))
            let web = s.volleys.asArray.map { "\($0.at.asNumber)/\($0.hits.asInt)/\($0.losses.asInt)" }, mine = out.volleys.map { "\($0.at)/\($0.hits)/\($0.losses)" }
            volleys += web.count
            if web != mine { failures += 1; if failures <= 12 { XCTFail("sample \(k) volleys: web \(web) swift \(mine)") }; continue }
            if let d = r.difference(expected) { failures += 1; if failures <= 12 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertGreaterThan(volleys, 5)
        XCTAssertEqual(failures, 0)
    }
}
