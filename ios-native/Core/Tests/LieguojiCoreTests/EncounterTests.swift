import XCTest
@testable import LieguojiCore

final class EncounterTests: XCTestCase {
    func testSweptMeetingAndNearMiss() {
        let a = TravelPoint(x: 0, y: 0), b = TravelPoint(x: 20, y: 0)
        let right = TravelPoint(x: 10, y: 0), left = TravelPoint(x: -10, y: 0)
        XCTAssertEqual(EncounterGeometry.meetingTime(a, right, b, left, limit: 2), 1)
        XCTAssertNil(EncounterGeometry.meetingTime(a, right, .init(x: 20, y: 1), left, limit: 2))
        XCTAssertNil(EncounterGeometry.meetingTime(a, right, b, right, limit: 2))
    }
    func testEngagementReachMeetsBeforeTheyCoincide() {
        let a = TravelPoint(x: 0, y: 0), b = TravelPoint(x: 100, y: 0)
        let right = TravelPoint(x: 10, y: 0), left = TravelPoint(x: -10, y: 0)
        // Closing at 20 a second from 100 apart, they engage at 10 apart: after 4.5 seconds.
        XCTAssertEqual(EncounterGeometry.meetingTime(a, right, b, left, limit: 10, reach: 10)!, 4.5, accuracy: 1e-9)
        // Passing 8 apart is within a reach of 10, but not of 5.
        XCTAssertNotNil(EncounterGeometry.meetingTime(a, right, .init(x: 100, y: 8), left, limit: 10, reach: 10))
        XCTAssertNil(EncounterGeometry.meetingTime(a, right, .init(x: 100, y: 8), left, limit: 10, reach: 5))
        XCTAssertTrue(EncounterGeometry.touching(a, .init(x: 6, y: 8), reach: 10))
        XCTAssertFalse(EncounterGeometry.touching(a, .init(x: 6, y: 8), reach: 9.9))
    }
    func testSameProvinceDoesNotStartRemoteBattleOrPreserveOldContact() throws {
        let resources = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let graph = try TravelGraph(data: Data(contentsOf: resources.appendingPathComponent("travel.bin")))
        let cell = try XCTUnwrap(graph.targetCell(province: 0))
        let a = graph.centers[cell], b = TravelPoint(x: a.x + 10, y: a.y)
        var forces = [MovingForce(kind: .army, id: "a", nation: 0, withdrawing: false, travel: .stationed(at: a, cell: cell)),
                      MovingForce(kind: .army, id: "b", nation: 1, withdrawing: false, travel: .stationed(at: b, cell: cell))]
        var rules = ContactMotion.Rules(enemy: { $0 != $1 }, canEnter: { _, _ in true }, speed: { _, _ in 10 }, seaRegion: { $0 }, provinceID: { String($0) })
        let motion = ContactMotion(graph: graph)
        let legacy = motion.contacts(forces, [], rules)
        XCTAssertEqual(legacy.contacts.count, 1)
        rules.physicalContact = true
        XCTAssertTrue(motion.contacts(forces, legacy.contacts, rules).contacts.isEmpty)
        // Two exact-point journeys within one cell meet halfway during a large step.
        forces[0].travel.destination = b; forces[0].travel.status = .moving
        forces[1].travel.destination = a; forces[1].travel.status = .moving
        let result = motion.advance(&forces, previous: [], seconds: 2, rules: rules, stopAtEvent: false)
        XCTAssertEqual(result.contacts.count, 1)
        XCTAssertEqual(result.held.count, 2)
        XCTAssertEqual(graph.location(forces[0].travel).point.x, a.x + 5, accuracy: 0.00001)
        XCTAssertEqual(graph.location(forces[1].travel).point.x, a.x + 5, accuracy: 0.00001)
    }
}
