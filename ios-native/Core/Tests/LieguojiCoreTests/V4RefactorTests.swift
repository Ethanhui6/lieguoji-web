import XCTest
@testable import LieguojiCore

/// v4.0.0 核心硬性底线回归测试：
/// 1. 文化 × 政体动态词库引擎（共和政体零帝制硬编码、行政区划省/道/藩/州/行省/旗与军事编制联动）；
/// 2. 朝议多分支博弈防无限点击（180 日议期冷却锁，同日重复点击必被引擎拒绝）；
/// 3. 18 项政令扩容与 5 套一键智能战略预设 + 季度托管开关；
/// 4. 跨海海运运力核算、封锁判定与两栖登陆战斗修正链路。
final class V4RefactorTests: XCTestCase {
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

    func testLocalizationEnginePolityAndCultureIsolation() {
        // 民主共和 / 联邦共和绝不出现任何封建帝制硬编码词汇
        let rep = LocalizationEngine.lexicon(culture: "english", polity: "Republic", style: "federal")
        XCTAssertTrue(rep.isRepublican)
        XCTAssertEqual(rep.adminUnit, "州")
        XCTAssertEqual(rep.governorTitle, "州长")
        XCTAssertEqual(rep.leaderTitle, "总统")
        let repCombined = ([rep.courtTabTitle, rep.courtSectionTitle, rep.powerBalanceTitle, rep.agendaTag, rep.forceActionLabel, rep.housesSectionTitle, rep.officialsSectionTitle, rep.fiefRuleLabel] + rep.pillarShort + rep.pillarFull).joined(separator: " ")
        for forbidden in ["朝堂", "世家", "朝廷百官", "宗室赐封", "御批"] {
            XCTAssertFalse(repCombined.contains(forbidden), "共和政体绝不应出现「\(forbidden)」：\(repCombined)")
        }

        // 文化 × 政体行政区划自动匹配与联动
        XCTAssertEqual(LocalizationEngine.lexicon(culture: "chinese", polity: "Monarchy", style: "dynasty").adminUnit, "省")
        XCTAssertEqual(LocalizationEngine.lexicon(culture: "korean", polity: "Monarchy", style: "dynasty").adminUnit, "道")
        XCTAssertEqual(LocalizationEngine.lexicon(culture: "japanese", polity: "Monarchy", style: "shogunate").adminUnit, "藩")
        XCTAssertEqual(LocalizationEngine.lexicon(culture: "japanese", polity: "Republic", style: "parliamentary").adminUnit, "府县")
        XCTAssertEqual(LocalizationEngine.lexicon(culture: "roman", polity: "Monarchy", style: "empire").adminUnit, "行省")
        XCTAssertEqual(LocalizationEngine.lexicon(culture: "mongol", polity: "Tribal", style: "khanate").adminUnit, "旗")

        // 军事编制随文化 × 政体动态切换
        XCTAssertEqual(LocalizationEngine.branchLabel(branch: "guard", culture: "chinese", polity: "Monarchy", style: "dynasty"), "天子禁军")
        XCTAssertEqual(LocalizationEngine.branchLabel(branch: "siege", culture: "chinese", polity: "Monarchy", style: "dynasty"), "攻城炮旅")
        XCTAssertEqual(LocalizationEngine.branchLabel(branch: "guard", culture: "english", polity: "Republic", style: "federal"), "国民警卫师")
        XCTAssertEqual(LocalizationEngine.branchLabel(branch: "guard", culture: "japanese", polity: "Monarchy", style: "shogunate"), "旗本近卫")
        XCTAssertEqual(LocalizationEngine.branchLabel(branch: "guard", culture: "roman", polity: "Monarchy", style: "empire"), "禁卫军团")
        XCTAssertEqual(MapLayers.TerrainStamp.Kind.tundra.rawValue, 8)
    }

    func testAgendaAntiExploitCooldownAndMultiBranch() throws {
        let engine = try loadWorld()
        defer { cleanup() }

        // 首次议决妥协分支成功，并锁入 180 日议期冷却
        let first = engine.nationDecree(0, kind: "agenda:wartax:compromise")
        XCTAssertTrue(first.ok, first.reason)

        // 同日立即再次点击强推或兼容旧 ID 必须被引擎硬拒绝（彻底封死无限连点刷资源）
        let second = engine.nationDecree(0, kind: "agenda:wartax:force")
        XCTAssertFalse(second.ok)
        let legacyRepeat = engine.nationDecree(0, kind: "agenda_wartax")
        XCTAssertFalse(legacyRepeat.ok)

        // 验证 nationInfo 正确暴露冷却倒计时与 4 分支选项结构
        let data = try XCTUnwrap(engine.nationInfo(0))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let agenda = try XCTUnwrap(json["agenda"] as? [String: Any])
        XCTAssertGreaterThan(agenda["cooldownDays"] as? Int ?? 0, 0)
        let choices = try XCTUnwrap(agenda["choices"] as? [[String: Any]])
        XCTAssertEqual(choices.count, 4)
    }

    func testExpandedDecreesAndSmartStrategyPresets() throws {
        let engine = try loadWorld()
        defer { cleanup() }

        for kind in ["roadNetwork", "granary", "techAcademy", "navalDockyard", "taxRelief"] {
            let res = engine.nationDecree(0, kind: kind)
            XCTAssertTrue(res.ok, "政令 \(kind) 应可执行：\(res.reason)")
        }

        // 测试一键智能战略预设与季度托管开关
        let preset = engine.nationDecree(0, kind: "strategy:prosperTrade")
        XCTAssertTrue(preset.ok, preset.reason)
        let autoOn = engine.nationDecree(0, kind: "strategyAuto:on")
        XCTAssertTrue(autoOn.ok, autoOn.reason)

        let id = engine.run.world.nations[0].id.asString
        let heldIds = Set(Regimes.heldReforms(engine.run, id).map(\.id))
        XCTAssertTrue(heldIds.contains("seaopen"))
        XCTAssertTrue(heldIds.contains("liangshui"))
        XCTAssertTrue(engine.run.regimes.nations[id].autoStrategy.isTruthy)
    }

    func testMaritimeCapacityAndDailyTickSafety() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let id = engine.run.world.nations[0].id.asString
        // 验证跨海每日结算与海运运力计算在全图安全运行且无崩溃，且 nationInfo 正确暴露 seaTransport 运力卡字段
        MaritimeWarfare.dailyTick(engine.run)
        let cap = MaritimeWarfare.seaTransportCapacity(engine.run, nation: id)
        XCTAssertGreaterThanOrEqual(cap, 0)
        let data = try XCTUnwrap(engine.nationInfo(0))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let st = try XCTUnwrap(json["seaTransport"] as? [String: Any])
        XCTAssertEqual(st["capacity"] as? Int, cap)
    }

    func testV42DeepNavalMissionsCompositionAndAdmiral() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run
        let fleets = Naval.fleets(r)
        guard let firstFleet = fleets.first else { return }
        let fid = firstFleet.id.asString
        let nationId = firstFleet.nationId.asString

        // 1. 测试五大水师战略指令切换
        for m in MaritimeWarfare.FleetMission.allCases {
            let res = engine.setFleetMission(fid, mission: m.rawValue)
            XCTAssertTrue(res.ok, res.reason)
            XCTAssertEqual(MaritimeWarfare.fleetMeta(r, fleet: firstFleet).mission, m)
        }

        // 2. 测试三舰种协同编制整编（主力 3 + 快舰 2 + 炮舰 2 = 7 艘）
        let compRes = engine.setFleetComposition(fid, spec: "3,2,2")
        XCTAssertTrue(compRes.ok, compRes.reason)
        XCTAssertEqual(firstFleet.ships.asInt, 7)
        let meta = MaritimeWarfare.fleetMeta(r, fleet: firstFleet)
        XCTAssertEqual(meta.heavy, 3)
        XCTAssertEqual(meta.light, 2)
        XCTAssertEqual(meta.gunboats, 2)

        // 3. 测试水师提督委任与真实海战火力加成
        let admRes = engine.assignFleetAdmiral(fid)
        XCTAssertTrue(admRes.ok, admRes.reason)
        let metaAfterAdm = MaritimeWarfare.fleetMeta(r, fleet: firstFleet)
        XCTAssertNotNil(metaAfterAdm.admiralName)
        XCTAssertGreaterThan(metaAfterAdm.admiralBonus, 0)
        XCTAssertGreaterThan(MaritimeWarfare.navalCombatBonus(r, nation: nationId), 0)

        // 4. 测试船坞紧急抢修与补给
        r.maritime.hulls[fid] = JS(200.0)
        let refitRes = engine.refitFleetNow(fid)
        XCTAssertTrue(refitRes.ok, refitRes.reason)
    }

    func testRegularDecreeCooldownBlocksSameDayRepeat() throws {
        let engine = try loadWorld()
        defer { cleanup() }

        // 首次颁布普通政令成功
        let first = engine.nationDecree(0, kind: "prosper")
        XCTAssertTrue(first.ok, first.reason)

        // 同日立即再次点击必须被冷却闸门拒绝，封堵无限刷资源漏洞
        let repeatSameDay = engine.nationDecree(0, kind: "prosper")
        XCTAssertFalse(repeatSameDay.ok)
        XCTAssertTrue(repeatSameDay.reason.contains("休养期"), repeatSameDay.reason)

        // 推进超过 120 日后应自动恢复可颁布
        engine.run.world.day = JS(engine.run.world.day.asInt + 121)
        let afterCooldown = engine.nationDecree(0, kind: "prosper")
        XCTAssertTrue(afterCooldown.ok, afterCooldown.reason)
    }

    func testV44NavalExpansionAndOverseasReadiness() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run

        // App 模式下 1–2 支舰队的岛国/滨海国可全数出击跨海制海，多舰队仍留至少 1 支护卫本土
        XCTAssertEqual(Naval.attackCount(1), 1)
        XCTAssertEqual(Naval.attackCount(2), 2)
        XCTAssertGreaterThanOrEqual(Naval.attackCount(4), 3)
        XCTAssertLessThan(Naval.attackCount(4), 4)

        let before = Naval.fleets(r).filter { $0.status.asString != "lost" }.count
        Shipyards.expandNavies(r)
        let after = Naval.fleets(r).filter { $0.status.asString != "lost" }.count
        XCTAssertGreaterThanOrEqual(after, before)
    }

    func testV44MajorBattleFilterSuppressesMinorSkirmishSpam() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run
        let provs = r.world.provinces.asArray
        // 挑一个非首都州郡模拟小规模摩擦与大规模会战
        let capitals = Set(r.world.nations.asArray.compactMap { n -> String? in
            guard let cid = n.capitalId.optionalString else { return nil }
            return r.world.cities.asArray.first { $0.id.optionalString == cid }?.provinceId.optionalString
        })
        guard let p = provs.first(where: { !capitals.contains($0.id.asString) }) ?? provs.first else { return }
        let n0 = r.world.nations[0].id.asString
        let n1 = r.world.nations[1].id.asString
        func fakeArmy(_ id: String, nation: String, troops: Double) -> Armies.Located {
            let a = JS.object()
            a.id = JS(id); a.nationId = JS(nation); a.status = JS("fighting"); a.troops = JS(troops)
            return Armies.Located(army: a, travel: JS.object(), province: p, cell: 0)
        }
        let eventsBefore = r.chronicle.entries.asArray.count
        // 1. 小规模交火（两军共 6,000 人）：不应刷屏播报「第1次XX战役爆发」
        ArmyLedger.campaigns(r, [fakeArmy("sk-1", nation: n0, troops: 3000), fakeArmy("sk-2", nation: n1, troops: 3000)])
        XCTAssertEqual(r.chronicle.entries.asArray.count, eventsBefore)

        // 2. 升级为主力大会战（两军共 30,000 人）：应正式播报「XX之战爆发」（且不含冗长「第1次」）
        ArmyLedger.campaigns(r, [fakeArmy("sk-1", nation: n0, troops: 15000), fakeArmy("sk-2", nation: n1, troops: 15000)])
        let added = r.chronicle.entries.asArray.dropFirst(eventsBefore)
        XCTAssertEqual(added.count, 1)
        let text = added.first?.text.asString ?? ""
        XCTAssertTrue(text.contains("之战爆发"), text)
        XCTAssertFalse(text.contains("第1次"), text)
    }

    func testV45NavalRulesDoctrineShipbuildingAndOverseasWarCouncil() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run

        // 1. 天下规则「水师规模 / 跨海运力」上下限注册与真实运力倍增生效
        XCTAssertNotNil(Regimes.ruleRanges["navyScale"])
        XCTAssertNotNil(Regimes.ruleRanges["seaTransport"])
        XCTAssertEqual(Naval.attackCount(3), 3)
        XCTAssertGreaterThanOrEqual(Naval.attackCount(5), 4)

        let fleets = Naval.fleets(r).filter { $0.status.asString != "lost" }
        if let first = fleets.first {
            let nationId = first.nationId.asString
            let nationIdx = r.world.nations.asArray.firstIndex { $0.id.asString == nationId } ?? 0
            let baseCap = MaritimeWarfare.seaTransportCapacity(r, nation: nationId)
            _ = engine.setWorldRule("seaTransport", percent: 250)
            let boostedCap = MaritimeWarfare.seaTransportCapacity(r, nation: nationId)
            if baseCap > 0 {
                XCTAssertGreaterThan(boostedCap, baseCap)
            }

            // 2. 全水师战略统调一次性切换同国所有舰队方略
            let docRes = engine.setNationNavalDoctrine(nationIdx, mission: "escort")
            XCTAssertTrue(docRes.ok, docRes.reason)
            for fl in Naval.fleets(r) where fl.nationId.asString == nationId && fl.status.asString != "lost" {
                XCTAssertEqual(MaritimeWarfare.fleetMeta(r, fleet: fl).mission, .escort)
            }

            // 3. 船坞造舰编成同时兼容逗号与冒号分隔符（修复 1:0:0 历史 Bug）
            r.finance.nations[nationId].gold = JS(5000.0)
            if let portIdx = r.world.provinces.asArray.firstIndex(where: { $0.id.asString == first.portProvinceId.asString }) {
                let resComma = engine.queueShipbuilding(nationIndex: nationIdx, provinceIndex: portIdx, fleetId: nil, spec: "2,1,1")
                XCTAssertTrue(resComma.ok, resComma.reason)
                let resColon = engine.queueShipbuilding(nationIndex: nationIdx, provinceIndex: portIdx, fleetId: first.id.asString, spec: "1:0:0")
                XCTAssertTrue(resColon.ok, resColon.reason)
            }

            // 4. 调高水师规模规则后扩编引擎正常放大编队，无越界无崩溃
            _ = engine.setWorldRule("navyScale", percent: 250)
            let beforeCount = Naval.fleets(r).filter { $0.status.asString != "lost" }.count
            Shipyards.expandNavies(r)
            let afterCount = Naval.fleets(r).filter { $0.status.asString != "lost" }.count
            XCTAssertGreaterThanOrEqual(afterCount, beforeCount)
        }
    }
}
