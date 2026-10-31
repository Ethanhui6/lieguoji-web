import XCTest
import Foundation
@testable import LieguojiCore

/// Golden people lifecycle steps from the web (src/native-export/people-golden.test.ts): the people
/// view of the run before a month or a ruler's death, and the patch the web step made to it.
final class PeopleTests: XCTestCase {
    func apply(_ patch: JS, to root: JS) {
        for op in patch.asArray {
            let path = op.p.asArray.map(\.asString)
            var node = root
            for k in path.dropLast() { node = node[k] }
            if op.d.isTruthy { node.delete(path.last!) } else { node[path.last!] = op.v.clone() }
        }
    }
    func testPeopleLifecycleMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/people.json")))
        People.loadTraits(golden.traits)
        var deaths = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            let r = s.input, expected = r.clone()
            apply(s.patch, to: expected)
            if s.kind.asString == "die" {
                People.die(r, r.kin.persons[s.personId.asInt.description], cause: s.cause.asString)
            } else {
                XCTAssertTrue(People.month(r))
            }
            // The exported view keeps the chronicle's last three entries.
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(3))
            deaths += r.kin.lifecycle.deaths.length
            XCTAssertNil(r.difference(expected), "\(s.kind.asString), sample \(k)")
        }
        XCTAssertGreaterThan(deaths, 0)
    }
}
