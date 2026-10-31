import XCTest
import Foundation
@testable import LieguojiCore

/// Golden calendar diplomacy from the web (src/native-export/declare-golden.test.ts): the monthly
/// schedule with the declaration evaluation as each state's step, on chained inputs.
final class DeclareTests: XCTestCase {
    func testScheduleAndDeclarationsMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let data = try Data(contentsOf: dir.appendingPathComponent("Golden/declare.json"))
        let golden = try JS.parse(data)
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        struct Wrapper: Decodable { let statics: DiplomacyStatic }
        let engine = DeclarationEngine(statics: try JSONDecoder().decode(Wrapper.self, from: data).statics)
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            DiplomacyBridge.schedule(r) { DiplomacyBridge.evaluateAlliance(r, $0, engine: engine); DiplomacyBridge.evaluateDeclaration(r, $0, engine: engine) }
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(3))
            if let d = r.difference(expected) { failures += 1; if failures <= 10 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
