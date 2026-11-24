import XCTest
@testable import LieguojiCore

/// v4.2.2 陆海完全体 + 深度策略系统 + 透明数值拆解 + 战前对比全量单元测试。
final class StrategyDepthTests: XCTestCase {
    private func loadWorld() throws -> NativeEngine {
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
        DeclarationEngine.temper = nil
        DeclarationEngine.pact = nil
        DeclarationEngine.opinionBias = nil
        DeclarationEngine.stance = nil
        ArmyAutonomy.temper = nil
    }

    func testArmyFormationsFieldOrdersVeterancySupplyAndCounters() throws {
        let engine = try loadWorld()
        defer { cleanup() }

        let armies = engine.run.world.armies.asArray
        XCTAssertFalse(armies.isEmpty)
        let a = armies[0]
        let aid = a.id.asString

        // 1. 切换五类阵型 + 四类野战指令
        let fRes = engine.setArmyFormation(aid, formation: "wedge")
        XCTAssertTrue(fRes.ok, fRes.reason)
        XCTAssertEqual(ArmyTactics.formation(engine.run, armyId: aid), .wedge)

        let oRes = engine.setArmyFieldOrder(aid, order: "entrench")
        XCTAssertTrue(oRes.ok, oRes.reason)
        XCTAssertEqual(ArmyTactics.fieldOrder(engine.run, armyId: aid), .entrench)

        // 2. 四阶老兵勋阶演算
        let r = engine.run
        if r.regimes.record.isNull { r.regimes.record = .object() }
        let rec = JS.object(); rec.battles = JS(12); rec.kills = JS(32000)
        r.regimes.record[aid] = rec
        let vet = ArmyTactics.veterancyInfo(r, armyId: aid, nationId: a.nationId.asString)
        XCTAssertEqual(vet.rank, 3)
        XCTAssertTrue(vet.label == "虎贲劲旅" || vet.label == "近卫劲旅", "unexpected veterancy label: \(vet.label)")

        // 3. 补给线与每日结算安全运行
        let provIdx = r.world.provinces.asArray.firstIndex(where: { $0.id.asString == a.provinceId.asString })
        let sup = ArmyTactics.supplyStatus(r, army: a, provinceIndex: provIdx)
        XCTAssertFalse(sup.state.label.isEmpty)
        ArmyTactics.dailyTick(r)

        // 4. 兵种克制清单完整返回
        let cr = ArmyTactics.counterReport(for: "Spear")
        XCTAssertFalse(cr.strong.isEmpty)
    }

    func testSeaDominionShipyardBuildQueueAdmiralAndSeaControl() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run

        // 确保国库充足以测试船坞升级与造舰队列
        let n0 = r.world.nations[0].id.asString
        r.finance.nations[n0].gold = JS(5000)

        // 统一 200 水兵/艘、12000 粮/艘
        XCTAssertEqual(SeaDominion.crewPerShip, 200)
        XCTAssertEqual(SeaDominion.foodPerShip, 12_000)

        // 海域制海权与提督特技枚举
        let sea = SeaDominion.seaControl(r, nation: n0)
        XCTAssertGreaterThanOrEqual(sea.score, 0)
        XCTAssertLessThanOrEqual(sea.score, 100)
        XCTAssertEqual(SeaDominion.AdmiralSkill.allCases.count, 4)

        // 若地图含海港则测试船坞升级（Lv1 → Lv2）与造舰队列推进
        if let port = Naval.sea?.ports.first,
           let pIdx = r.world.provinces.asArray.firstIndex(where: { $0.id.asString == port.provinceId }) {
            let pid = port.provinceId
            let ownerId = r.world.provinces[pIdx].controller.asString
            r.finance.nations[ownerId].gold = JS(5000)
            let up = engine.upgradeShipyard(provinceIndex: pIdx)
            XCTAssertTrue(up.ok, up.reason)
            XCTAssertEqual(SeaDominion.shipyardLevel(r, provinceId: pid), 2)
            XCTAssertEqual(SeaDominion.maxShipsForPort(r, provinceId: pid), 8)

            let ownerIdx = r.world.nations.asArray.firstIndex(where: { $0.id.asString == ownerId }) ?? 0
            let q = engine.queueShipbuilding(nationIndex: ownerIdx, provinceIndex: pIdx, fleetId: nil, spec: "1:1:0")
            XCTAssertTrue(q.ok, q.reason)
            for _ in 0..<25 { SeaDominion.advanceBuildQueue(r) }
        }
    }

    func testWorldDepthInfraTechReputationEventChainsBreakdownsAndWarCompare() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run
        let n0 = r.world.nations[0].id.asString
        r.finance.nations[n0].gold = JS(8000)

        // 1. 州郡五槽基建建造与真实税收/粮产加成
        let ownedIdx = r.world.provinces.asArray.firstIndex(where: { $0.controller.asString == n0 }) ?? 0
        let ownedPid = r.world.provinces[ownedIdx].id.asString
        let mkt = engine.buildProvinceInfra(ownedIdx, slot: "market")
        XCTAssertTrue(mkt.ok, mkt.reason)
        XCTAssertEqual(WorldDepth.infraLevel(r, provinceId: ownedPid, slot: .market), 1)
        XCTAssertGreaterThan(WorldDepth.provinceTaxMultiplier(r, provinceId: ownedPid), 1.0)

        let irr = engine.buildProvinceInfra(ownedIdx, slot: "irrigation")
        XCTAssertTrue(irr.ok, irr.reason)
        XCTAssertGreaterThan(WorldDepth.provinceGrainMultiplier(r, provinceId: ownedPid), 1.0)

        // 2. 四线科技投资与阶梯升级
        for _ in 0..<4 {
            let inv = engine.investTech(0, branch: "military")
            XCTAssertTrue(inv.ok, inv.reason)
        }
        XCTAssertGreaterThanOrEqual(WorldDepth.techLevel(r, nation: n0, branch: .military), 2)

        // 3. 外交信誉与 16 组多阶段因果事件链 + 6 个月后回响
        XCTAssertEqual(WorldDepth.eventChainTemplates.count, 16)
        let beforeRep = WorldDepth.reputation(r, nation: n0)
        let ch = engine.resolveEventChain(0, chainId: "famineRelief", choice: "a")
        XCTAssertTrue(ch.ok, ch.reason)
        XCTAssertGreaterThan(WorldDepth.reputation(r, nation: n0), beforeRep)
        XCTAssertGreaterThanOrEqual(r.regimes.pendingEchoes.asArray.count, 1)

        // 推进 6 个月触发二阶段因果回响
        let curM = max(1, r.regimes.month.asInt)
        WorldDepth.month(r, key: curM + 6)

        // 4. 全数值透明拆解 & 战前双边实力对比 JSON 完整性校验
        let nData = try XCTUnwrap(engine.nationBreakdown(0))
        let nJson = try XCTUnwrap(JSONSerialization.jsonObject(with: nData) as? [String: Any])
        XCTAssertNotNil(nJson["tax"])
        XCTAssertNotNil(nJson["military"])
        XCTAssertNotNil(nJson["naval"])
        XCTAssertNotNil(nJson["stability"])

        let pData = try XCTUnwrap(engine.provinceBreakdown(ownedIdx))
        let pJson = try XCTUnwrap(JSONSerialization.jsonObject(with: pData) as? [String: Any])
        XCTAssertFalse((pJson["items"] as? [[String: Any]] ?? []).isEmpty)

        if r.world.nations.asArray.count >= 2 {
            let wData = try XCTUnwrap(engine.warCompare(attacker: 0, defender: 1))
            let wJson = try XCTUnwrap(JSONSerialization.jsonObject(with: wData) as? [String: Any])
            XCTAssertNotNil(wJson["attacker"])
            XCTAssertNotNil(wJson["defender"])
            XCTAssertNotNil(wJson["warning"])
        }
    }
}
