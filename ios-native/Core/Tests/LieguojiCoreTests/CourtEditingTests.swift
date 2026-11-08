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
    func testGovernorFamilyActionsAndRebellionOutlook() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        defer { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil }
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        engine.advance(days: 40)
        let r = engine.run, id = r.world.nations[0].id.asString
        _ = engine.nationInfo(0); _ = engine.province(0)
        // 总督: any held province can be given a governor; another state's cannot.
        let provinces = r.world.provinces.asArray
        let mine = try XCTUnwrap(provinces.indices.first { provinces[$0].controller.asString == id })
        let candidates = try JS.parse(try XCTUnwrap(engine.officeCandidates(0, office: "Governor:" + String(mine))))
        let person = try XCTUnwrap(candidates.asArray.first).id.asInt
        XCTAssertTrue(engine.appointOffice(0, office: "Governor:" + String(mine), personId: person).ok)
        XCTAssertEqual(Offices.holder(r, id, "Governor", mine + 1)?.id.asInt, person)
        if let other = provinces.indices.first(where: { provinces[$0].controller.asString != id }) { XCTAssertNil(engine.officeCandidates(0, office: "Governor:" + String(other))) }
        // 叛乱形势 reads without changing anything.
        let before = r.foundings.isNull ? "" : r.foundings.json
        let o = Rebellion.outlook(r, id)
        XCTAssertFalse(o.status.asString.isEmpty)
        XCTAssertEqual(r.foundings.isNull ? "" : r.foundings.json, before)
        // 在此立国: a province with a city of a state with other land becomes a new state at peace.
        let before2 = r.world.nations.length
        let ps = r.world.provinces.asArray
        if let pick = ps.indices.first(where: { i in
            let owner = ps[i].controller.asString
            return Vassals.alive(r, owner) && ps.filter { $0.controller.asString == owner }.count >= 3
                && r.world.cities.asArray.contains { $0.provinceId.asString == ps[i].id.asString } && Rebellion.capitalProvince(r, owner) != ps[i].id.asString
        }) {
            let result = engine.foundNation(pick, war: false)
            XCTAssertTrue(result.ok, result.reason)
            XCTAssertEqual(r.world.nations.length, before2 + 1)
            XCTAssertEqual(r.world.provinces[pick].controller.asString, r.world.nations.asArray.last!.id.asString)
            _ = engine.state(includeLabels: true)
        }
        // 族谱: marry an unmarried adult, give the couple a child, execute.
        guard !r.nobility.isNull, !r.kin.isNull else { return }
        let single = r.kin.families.objectEntries.flatMap { $0.1.memberIds.isNull ? [] : $0.1.memberIds.asArray }.compactMap { People.person(r, $0.asInt) }
            .first { $0.isAlive.asBool && $0.age.asInt >= 18 && $0.age.asInt <= 40 && ($0.spouseId.asInt == 0 || People.person(r, $0.spouseId.asInt)?.isAlive.asBool != true) }
        guard let p = single else { return }
        XCTAssertTrue(engine.familyAction(p.id.asInt, action: "spouse").ok)
        XCTAssertNotEqual(p.spouseId.asInt, 0)
        let mother = p.gender.asInt == 1 ? p : People.person(r, p.spouseId.asInt)!
        let children = mother.childrenIds.length
        XCTAssertTrue(engine.familyAction(p.id.asInt, action: "child").ok)
        XCTAssertEqual(mother.childrenIds.length, children + 1)
        XCTAssertTrue(engine.familyAction(p.id.asInt, action: "kill").ok)
        XCTAssertFalse(p.isAlive.asBool)
        XCTAssertFalse(engine.familyAction(p.id.asInt, action: "kill").ok)
    }
}
