import XCTest
@testable import LieguojiCore

final class CourtEditingTests: XCTestCase {
    func testCommandsReachGovernanceFamilyRelationAndWarOffice() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden")
        let r = try JS.parse(Data(contentsOf: dir.appendingPathComponent("offices.json"))).samples[0].input.clone()
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        let engine = NativeEngine(run: r), nations = r.world.nations.asArray
        r.regimes = .object()
        let id = nations[0].id.asString
        let original = Offices.governance(r, id)
        XCTAssertTrue(engine.editCourt(0, key: "governance", value: 90).ok)
        XCTAssertEqual(Offices.governance(r, id), 0.9, accuracy: 0.0001)
        XCTAssertTrue(engine.editCourt(0, key: "governance", value: -1).ok)
        XCTAssertEqual(Offices.governance(r, id), original)
        XCTAssertFalse(engine.editCourt(0, key: "governance", value: .nan).ok)
        let houses = r.nobility.families.objectEntries.filter { $0.1.nationId.asString == id }.map(\.0).sorted()
        XCTAssertGreaterThan(houses.count, 1)
        guard houses.count > 1 else { return }
        r.nobility.rulingFamilies[id] = JS(Int(houses[0])!)
        XCTAssertTrue(engine.editCourt(0, key: "house:" + houses[1], value: -60).ok)
        XCTAssertEqual(Nobility.relation(r, houses[1], houses[0]), -60, accuracy: 0.001)
        XCTAssertTrue(engine.editCourt(0, key: "house:" + houses[1], value: 40).ok)
        XCTAssertEqual(Nobility.relation(r, houses[1], houses[0]), 40, accuracy: 0.001)
        XCTAssertFalse(engine.editCourt(0, key: "house:" + houses[0], value: 0).ok)
        let relation = JS.object(); relation.a = JS(id); relation.b = nations[1].id.clone(); relation.status = JS("war")
        r.world.statecraft.relations.push(relation)
        let candidates = try JS.parse(try XCTUnwrap(engine.officeCandidates(0, office: "WarCommander:1")))
        let person = try XCTUnwrap(candidates.asArray.first).id.asInt
        XCTAssertTrue(engine.appointOffice(0, office: "WarCommander:1", personId: person).ok)
        XCTAssertEqual(Offices.holder(r, id, "WarCommander", Offices.stateId(r, nations[1].id.asString))?.id.asInt, person)
        relation.status = JS("peace")
        XCTAssertFalse(engine.appointOffice(0, office: "WarCommander:1", personId: person).ok)
    }
}
