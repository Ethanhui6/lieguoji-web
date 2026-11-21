import XCTest
@testable import LieguojiCore

/// 2.0 国家政务、大军统筹、批量外交、禅位择君与疆土总管单元测试。
final class NationDecreesTests: XCTestCase {
    private func appWorld() throws -> NativeEngine {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.run.clock.tick = JS(0)
        engine.enableAppRules()
        return engine
    }

    private func cleanup() {
        Session.uninstall()
        UnitKinds.enabled = false
        DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil
    }

    func testAllEightNationDecrees() throws {
        defer { cleanup() }
        let engine = try appWorld()
        let r = engine.run
        let id = r.world.nations[0].id.asString

        // 1. 休养生息
        let beforePop = r.world.statecraft.provinces.asArray
            .filter { s in r.world.provinces.asArray.contains { $0.id.asString == s.provinceId.asString && $0.controller.optionalString == id } }
            .reduce(0.0) { $0 + ($1.population.optionalNumber ?? 0) }
        let resProsper = engine.nationDecree(0, kind: "prosper")
        XCTAssertTrue(resProsper.ok, resProsper.reason)
        let afterPop = r.world.statecraft.provinces.asArray
            .filter { s in r.world.provinces.asArray.contains { $0.id.asString == s.provinceId.asString && $0.controller.optionalString == id } }
            .reduce(0.0) { $0 + ($1.population.optionalNumber ?? 0) }
        XCTAssertGreaterThan(afterPop, beforePop)

        // 2. 全国大征兵
        let armiesBefore = r.world.armies.asArray.filter { $0.nationId.optionalString == id && $0.troops.asNumber > 0 }.count
        let resMob = engine.nationDecree(0, kind: "mobilize")
        XCTAssertTrue(resMob.ok, resMob.reason)
        let armiesAfter = r.world.armies.asArray.filter { $0.nationId.optionalString == id && $0.troops.asNumber > 0 }.count
        XCTAssertGreaterThan(armiesAfter, armiesBefore)

        // 3. 犒赏三军
        if let firstArmy = r.world.armies.asArray.first(where: { $0.nationId.optionalString == id && $0.troops.asNumber > 0 }) {
            firstArmy.morale = JS(40)
            let resReward = engine.nationDecree(0, kind: "rewardArmies")
            XCTAssertTrue(resReward.ok, resReward.reason)
            XCTAssertGreaterThanOrEqual(firstArmy.morale.asNumber, 75)
            XCTAssertEqual(firstArmy.supplies.asNumber, 100)
        }

        // 4. 整顿吏治
        Finance.setCorruption(r, id, 45)
        let resAnti = engine.nationDecree(0, kind: "antiCorruption")
        XCTAssertTrue(resAnti.ok, resAnti.reason)
        XCTAssertLessThan(Finance.corruption(r, id), 45)

        // 5. 加固边防
        let resFort = engine.nationDecree(0, kind: "fortifyBorder")
        XCTAssertTrue(resFort.ok, resFort.reason)

        // 6. 推行文教（先给一座己方城设异文化）
        let ownedPid = r.world.provinces.asArray.first { $0.controller.optionalString == id }!.id.asString
        if let city = r.world.cities.asArray.first(where: { $0.provinceId.asString == ownedPid }) {
            let stateCult = r.civilization.nations[id].cultureId.asString
            r.civilization.cities[city.id.asString].cultureId = JS(stateCult == "greek" ? "roman" : "greek")
            let resCult = engine.nationDecree(0, kind: "assimilateCulture")
            XCTAssertTrue(resCult.ok, resCult.reason)
            XCTAssertEqual(r.civilization.cities[city.id.asString].cultureId.asString, stateCult)
        }

        // 7. 统一国教
        let stateFaith = r.civilization.nations[id].religionId.asString
        if r.regimes.faith.isNull { r.regimes.faith = .object() }
        r.regimes.faith[ownedPid] = JS(stateFaith == "daoism" ? "buddhism" : "daoism")
        let resFaith = engine.nationDecree(0, kind: "convertFaith")
        XCTAssertTrue(resFaith.ok, resFaith.reason)
        XCTAssertEqual(Regimes.provinceFaith(r, r.world.provinces.asArray.first { $0.id.asString == ownedPid }!), stateFaith)

        // 8. 大赦安抚世家
        let ruling = String(People.rulingFamilyId(r, id))
        if let other = r.nobility.families.objectEntries.first(where: { $0.1.nationId.optionalString == id && $0.0 != ruling })?.0 {
            let before = r.nobility.relations[other][ruling].optionalNumber ?? 0
            let resAmnesty = engine.nationDecree(0, kind: "amnesty")
            XCTAssertTrue(resAmnesty.ok, resAmnesty.reason)
            let after = r.nobility.relations[other][ruling].optionalNumber ?? 0
            XCTAssertGreaterThan(after, before)
        }
    }

    func testMilitaryDiplomacyThroneAndProvinces() throws {
        defer { cleanup() }
        let engine = try appWorld()
        let r = engine.run

        // 疆土总管清单导出
        let provData = try XCTUnwrap(engine.nationProvinces(0))
        let provArr = try XCTUnwrap(JSONSerialization.jsonObject(with: provData) as? [[String: Any]])
        XCTAssertFalse(provArr.isEmpty)
        XCTAssertNotNil(provArr[0]["name"])
        XCTAssertNotNil(provArr[0]["defense"])

        // 一键补齐总督（先清空一个）
        let id = r.world.nations[0].id.asString
        Offices.book(r, id).assignments = .array()
        let fill = engine.nationDiplomacyOrder(0, kind: "fillGovernors")
        XCTAssertTrue(fill.ok, fill.reason)

        // 船坞下水新舰队（找一个有港口的国家）
        if let portPid = Naval.sea?.ports.first?.provinceId,
           let ownerId = r.world.provinces.asArray.first(where: { $0.id.asString == portPid })?.controller.optionalString,
           let ownerIdx = r.world.nations.asArray.firstIndex(where: { $0.id.asString == ownerId }) {
            let beforeFleets = Naval.fleets(r).filter { $0.nationId.optionalString == ownerId && $0.status.asString != "lost" }.count
            let launch = engine.nationMilitaryOrder(ownerIdx, kind: "launchFleet")
            XCTAssertTrue(launch.ok, launch.reason)
            let afterFleets = Naval.fleets(r).filter { $0.nationId.optionalString == ownerId && $0.status.asString != "lost" }.count
            XCTAssertEqual(afterFleets, beforeFleets + 1)
            // 推演一天确认新舰队在完整周期下不出错。
            engine.advance(days: 1)
        }

        // 禅位择君 + ruler.female 导出
        let candData = try XCTUnwrap(engine.throneCandidates(0))
        let cands = try XCTUnwrap(JSONSerialization.jsonObject(with: candData) as? [[String: Any]])
        XCTAssertFalse(cands.isEmpty)
        let pickedId = try XCTUnwrap(cands[0]["id"] as? Int)
        // 设定所选人物为女性，验证 ruler.female 字段正确导出
        People.person(r, pickedId)?.gender = JS(1)
        let enthrone = engine.enthronePerson(0, personId: pickedId)
        XCTAssertTrue(enthrone.ok, enthrone.reason)
        XCTAssertEqual(r.people.nations[id].leaderId.asInt, pickedId)
        let infoData = try XCTUnwrap(engine.nationInfo(0))
        let info = try XCTUnwrap(JSONSerialization.jsonObject(with: infoData) as? [String: Any])
        let ruler = try XCTUnwrap(info["ruler"] as? [String: Any])
        XCTAssertEqual(ruler["female"] as? Bool, true)

        // 批量外交：四面出击 -> 全面停战
        let war = engine.nationDiplomacyOrder(0, kind: "warNeighbors")
        if war.ok {
            let peace = engine.nationDiplomacyOrder(0, kind: "peaceAll")
            XCTAssertTrue(peace.ok, peace.reason)
        }

        // 军事指令：全军回防 -> 全军交 AI
        let recall = engine.nationMilitaryOrder(0, kind: "recall")
        if recall.ok {
            let rel = engine.nationMilitaryOrder(0, kind: "releaseAll")
            XCTAssertTrue(rel.ok, rel.reason)
        }

        // EngineService RPC 路由验证
        let service = EngineService()
        _ = service.adopt(engine)
        XCTAssertTrue(service.handle("nationProvinces", ["n": 0]).ok)
        XCTAssertTrue(service.handle("throneCandidates", ["n": 0]).ok)
        XCTAssertTrue(service.handle("nationDecree", ["n": 0, "kind": "prosper"]).ok)
    }
}
