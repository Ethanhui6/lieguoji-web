import XCTest
import Foundation
@testable import LieguojiCore

/// Golden war settlements from the web (src/native-export/settle-golden.test.ts): settleWar47 with
/// each reason and advancePeace47 months, on chained inputs.
final class SettleTests: XCTestCase {
    func testSettlementMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/settle.json")))
        var input: JS?, failures = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            if s.kind.asString == "settle" { PeaceBridge.settle(r, r.nativeWars.campaigns.asArray.first { $0.id.asInt == s.war.asInt }!, reason: s.reason.asInt) }
            else { PeaceBridge.advance(r, monthStart: true) }
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(3))
            // Army fighting/idle status belongs to the force-contact reconciliation (ported separately).
            for (a, e) in zip(r.world.armies.asArray, expected.world.armies.asArray) { a.status = e.status.clone() }
            if let d = r.difference(expected) { failures += 1; if failures <= 10 { XCTFail("\(s.kind.asString) sample \(k): \(d)") } }
        }
        XCTAssertEqual(failures, 0)
    }
}
