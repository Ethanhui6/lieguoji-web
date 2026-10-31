import XCTest
import Foundation
@testable import LieguojiCore

/// Golden office months from the web (src/native-export/offices-golden.test.ts): every state's
/// stateOfficeMonth47 on chained inputs, then the income and rebellion effects.
final class OfficesTests: XCTestCase {
    func testOfficeAIMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/offices.json")))
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            for n in r.world.nations.asArray { Offices.month(r, n.id.asString) }
            if let d = r.difference(expected) { failures += 1; if failures <= 10 { XCTFail("sample \(k): \(d)") } }
            XCTAssertEqual(r.world.nations.asArray.map { Offices.centralIncome(r, $0.id.asString) }, s.effects.central.asArray.map(\.asNumber), "central, sample \(k)")
            XCTAssertEqual(r.world.provinces.asArray.map { Offices.localIncome(r, $0.id.asString) }, s.effects.local.asArray.map(\.asNumber), "local, sample \(k)")
            XCTAssertEqual(r.world.provinces.asArray.map { Offices.localRebellion(r, $0.id.asString) }, s.effects.rebellion.asArray.map(\.asNumber), "rebellion, sample \(k)")
        }
        XCTAssertEqual(failures, 0)
    }
}
