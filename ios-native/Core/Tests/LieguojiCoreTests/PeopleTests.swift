import XCTest
import Foundation
@testable import LieguojiCore

/// Golden people lifecycle steps from the web (src/native-export/people-golden.test.ts): the people
/// view of the run before a month or a ruler's death, and the patch the web step made to it.
final class PeopleTests: XCTestCase {
    func apply(_ patch: JS, to root: JS) {
        for op in patch.items {
            let path = op.p.items.map(\.string)
            var node = root
            for k in path.dropLast() { node = node[k] }
            if op.d.truthy { node.delete(path.last!) } else { node[path.last!] = op.v.clone() }
        }
    }
    func testPeopleLifecycleMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/people.json")))
        People.loadTraits(golden.traits)
        var deaths = 0
        for (k, s) in golden.samples.items.enumerated() {
            let r = s.input, expected = r.clone()
            apply(s.patch, to: expected)
            if s.kind.string == "die" {
                People.die(r, r.kin.persons[s.personId.int.description], cause: s.cause.string)
            } else {
                XCTAssertTrue(People.month(r))
            }
            deaths += r.kin.lifecycle.deaths.count
            XCTAssertNil(r.difference(expected), "\(s.kind.string), sample \(k)")
        }
        XCTAssertGreaterThan(deaths, 0)
    }
}
