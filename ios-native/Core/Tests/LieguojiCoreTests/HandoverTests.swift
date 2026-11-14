import XCTest
@testable import LieguojiCore

/// 易主: a notice that the throne or the government changed hands is matched by the ruler, the reign,
/// the ruling house, the state's name and its polity.
final class HandoverTests: XCTestCase {
    private func world() throws -> NativeEngine {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        engine.advance(days: 10)
        return engine
    }
    private func cleanUp() {
        Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil
    }

    /// What must hold of a state's head at any time.
    private func assertConsistent(_ r: JS, _ id: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let leader = try XCTUnwrap(Regimes.ruler(r, id), file: file, line: line)
        let reigns = r.chronicle.leaders[id].asArray, reign = try XCTUnwrap(reigns.last, file: file, line: line)
        // The open reign is the last one and belongs to the person the state calls its leader.
        XCTAssertTrue(reign.endedDay.isNull, file: file, line: line)
        XCTAssertEqual(r.sovereignty.reigns[reign.id.asString].asInt, leader.id.asInt, file: file, line: line)
        for earlier in reigns.dropLast() { XCTAssertFalse(earlier.endedDay.isNull, "an earlier reign is still open", file: file, line: line) }
        // Exactly one living person holds the leader's role of this state, and it is that person.
        XCTAssertEqual(leader.roles.asArray.filter { $0.nativeKind.optionalString == "leader" }.count, 1, file: file, line: line)
        // The reign was opened under the polity the state has now.
        XCTAssertEqual(r.civilization.rulers[reign.id.asString].polityAtAccession.optionalString, r.civilization.nations[id].polity.optionalString, file: file, line: line)
        if !r.nobility.isNull, let ruling = r.nobility.rulingFamilies[id].optionalNumber { XCTAssertEqual(Int(ruling), leader.familyId.asInt, file: file, line: line) }
    }

    func testAbdicationChangesTheRulerWithTheName() throws {
        let engine = try world(); defer { cleanUp() }
        let r = engine.run
        // A state with another house able to take the throne.
        let nation = try XCTUnwrap(r.world.nations.asArray.first { Regimes.ruler(r, $0.id.asString) != nil && Regimes.claimant(r, $0.id.asString, .otherHouse) != nil })
        let id = nation.id.asString, before = try XCTUnwrap(Regimes.ruler(r, id)), oldName = nation.name.asString, reigns = r.chronicle.leaders[id].length
        let who = try XCTUnwrap(Regimes.abdicate(r, nation, id, base: "新朝", style: nil))
        let after = try XCTUnwrap(Regimes.ruler(r, id))
        XCTAssertNotEqual(after.id.asInt, before.id.asInt, "the old ruler still reigns after 禅让")
        XCTAssertNotEqual(after.familyId.asInt, before.familyId.asInt, "禅让 passes the throne to another house")
        XCTAssertNotEqual(nation.name.asString, oldName)
        XCTAssertTrue(nation.name.asString.contains("新朝"))
        XCTAssertEqual(r.chronicle.leaders[id].length, reigns + 1)
        XCTAssertFalse(before.roles.asArray.contains { $0.nativeKind.optionalString == "leader" }, "the old ruler keeps the leader's role")
        XCTAssertFalse(who.isEmpty)
        // The chronicle names the state before and after and the new ruler.
        let notice = try XCTUnwrap(r.chronicle.entries.asArray.last { $0.text.asString.contains("禅位于") })
        XCTAssertTrue(notice.text.asString.hasPrefix(oldName) && notice.text.asString.contains(who) && notice.text.asString.contains(nation.name.asString))
        try assertConsistent(r, id)
    }

    func testRevolutionAndRestorationSeatANewHead() throws {
        let engine = try world(); defer { cleanUp() }
        let r = engine.run
        let nation = try XCTUnwrap(r.world.nations.asArray.first {
            let id = $0.id.asString, polity = r.civilization.nations[id].polity.optionalString ?? ""
            return (polity == "Kingdom" || polity == "Empire") && Regimes.ruler(r, id) != nil && Regimes.claimant(r, id, .elected) != nil
        })
        let id = nation.id.asString, king = try XCTUnwrap(Regimes.ruler(r, id))
        // 革命: the crown falls, the republic elects its head; the king does not stay on as president.
        _ = Regimes.change(r, id, to: "Republic", reason: "革命")
        XCTAssertNotNil(Regimes.seat(r, id))
        let president = try XCTUnwrap(Regimes.ruler(r, id))
        XCTAssertNotEqual(president.id.asInt, king.id.asInt)
        XCTAssertEqual(r.civilization.nations[id].polity.optionalString, "Republic")
        try assertConsistent(r, id)
        // 复辟: the crown returns to a house other than the president's, where there is one.
        _ = Regimes.change(r, id, to: "Kingdom", reason: "复辟")
        if Regimes.seat(r, id) != nil {
            let crowned = try XCTUnwrap(Regimes.ruler(r, id))
            XCTAssertNotEqual(crowned.id.asInt, president.id.asInt)
            XCTAssertNotEqual(crowned.familyId.asInt, president.familyId.asInt)
            try assertConsistent(r, id)
        }
    }

    /// Nobody else to offer: nothing changes and no notice is written.
    func testNoClaimantNoAbdication() throws {
        let engine = try world(); defer { cleanUp() }
        let r = engine.run
        guard let nation = r.world.nations.asArray.first(where: { Regimes.ruler(r, $0.id.asString) != nil && Regimes.claimant(r, $0.id.asString, .otherHouse) == nil }) else { return }
        let id = nation.id.asString, name = nation.name.asString, ruler = Regimes.ruler(r, id)?.id.asInt, entries = r.chronicle.entries.length
        XCTAssertNil(Regimes.abdicate(r, nation, id, base: "新朝", style: nil))
        XCTAssertEqual(nation.name.asString, name)
        XCTAssertEqual(Regimes.ruler(r, id)?.id.asInt, ruler)
        XCTAssertEqual(r.chronicle.entries.length, entries)
    }
}

/// 元首与掌权者: the head of state and the head of government are two seats.
final class HeadsTests: XCTestCase {
    private func world() throws -> NativeEngine {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        engine.advance(days: 10)
        return engine
    }
    private func cleanUp() {
        Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil
    }
    private func make(_ r: JS, _ id: String, culture: String, polity: String, style: String) {
        let c = r.civilization.nations[id]
        c.cultureId = JS(culture); c.polity = JS(polity)
        Regimes.book(r, id).style = JS(style)
    }

    func testEachFormNamesItsSeats() throws {
        let engine = try world(); defer { cleanUp() }
        let r = engine.run, id = r.world.nations[0].id.asString
        // 君主立宪: the crown reigns, an elected prime minister governs.
        make(r, id, culture: "english", polity: "Kingdom", style: "constitutional")
        XCTAssertEqual(Regimes.seats(r, id), .init(head: "国王", premier: "首相", premierRules: true, elected: true))
        make(r, id, culture: "japanese", polity: "Kingdom", style: "constitutional")
        XCTAssertEqual(Regimes.seats(r, id), .init(head: "天皇", premier: "首相", premierRules: true, elected: true))
        // 议会共和: president and premier.
        make(r, id, culture: "french", polity: "Republic", style: "parliamentary")
        XCTAssertEqual(Regimes.seats(r, id), .init(head: "总统", premier: "总理", premierRules: true, elected: true))
        // 幕府: the emperor reigns, the shogun rules, and nobody elects him.
        make(r, id, culture: "japanese", polity: "Empire", style: "shogunate")
        XCTAssertEqual(Regimes.seats(r, id), .init(head: "天皇", premier: "征夷大将军", premierRules: true, elected: false))
        // 帝制: the emperor rules through a chancellor he appoints.
        make(r, id, culture: "chinese", polity: "Empire", style: "empire")
        XCTAssertEqual(Regimes.seats(r, id), .init(head: "皇帝", premier: "丞相", premierRules: false, elected: false))
        // 人民共和: chairman and premier, the chairman in charge.
        make(r, id, culture: "chinese", polity: "Republic", style: "communist")
        XCTAssertEqual(Regimes.seats(r, id), .init(head: "主席", premier: "总理", premierRules: false, elected: false))
        // 总统共和: one seat.
        make(r, id, culture: "english", polity: "Republic", style: "presidential")
        XCTAssertEqual(Regimes.seats(r, id), .init(head: nil, premier: nil, premierRules: false, elected: false))
    }

    func testOnlyOneEmperorOfJapanUnlessTwoCourtsAreAtWar() throws {
        let engine = try world(); defer { cleanUp() }
        let r = engine.run, nations = r.world.nations.asArray
        let living = nations.map { $0.id.asString }.filter { Vassals.alive(r, $0) }
        try XCTSkipIf(living.count < 2)
        let elder = living[0], younger = living[1]
        make(r, elder, culture: "japanese", polity: "Empire", style: "empire")
        make(r, younger, culture: "japanese", polity: "Empire", style: "empire")
        XCTAssertEqual(Regimes.seats(r, elder).head, "天皇")
        XCTAssertEqual(Regimes.seats(r, younger).head, "大王")
        // 南北朝: two courts at war both claim the title.
        let war = JS.object(); war.a = JS(elder); war.b = JS(younger); war.status = JS("war")
        r.world.statecraft.relations.push(war)
        XCTAssertEqual(Regimes.seats(r, elder).head, "天皇")
        XCTAssertEqual(Regimes.seats(r, younger).head, "天皇")
    }

    func testAnElectionChangesThePrimeMinisterAndNeverTheCrown() throws {
        let engine = try world(); defer { cleanUp() }
        let r = engine.run
        let nation = try XCTUnwrap(r.world.nations.asArray.first { Regimes.ruler(r, $0.id.asString) != nil && Vassals.alive(r, $0.id.asString) })
        let id = nation.id.asString, index = r.world.nations.asArray.firstIndex { $0.id.asString == id }!
        // The player's own 改制 to 君主立宪 (the ruler stays: only the form changes).
        XCTAssertTrue(engine.setStyle(index, style: "constitutional").ok)
        let crown = try XCTUnwrap(Regimes.ruler(r, id)).id.asInt, reigns = r.chronicle.leaders[id].length
        let sid = Offices.stateId(r, id)
        // Two general elections (the month whose number matches the state's place in the cycle).
        for round in 1...2 {
            Regimes.cabinet(r, nation, id, sid % 48 + 48 * round)
            XCTAssertEqual(Regimes.ruler(r, id)?.id.asInt, crown, "the election replaced the crown")
            XCTAssertEqual(r.chronicle.leaders[id].length, reigns, "the election opened a new reign")
            if let premier = Regimes.premier(r, id) { XCTAssertNotEqual(premier.id.asInt, crown, "the crown sits as its own prime minister") }
        }
        // The page's data carries both seats.
        let info = try JS.parse(try XCTUnwrap(engine.nationInfo(index)))
        XCTAssertTrue(["首相", "内阁总理", "宰相"].contains(info.heads.premierTitle.optionalString ?? ""))
        XCTAssertTrue(info.heads.premierRules.isTruthy)
        XCTAssertFalse((info.ruler.title.optionalString ?? "").isEmpty)
    }
}
