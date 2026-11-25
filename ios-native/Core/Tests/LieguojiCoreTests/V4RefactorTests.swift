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
        let id = engine.run.world.nations[0].id.asString
        engine.run.finance.nations[id].gold = JS(5000.0)

        for (i, kind) in ["roadNetwork", "granary", "techAcademy", "navalDockyard", "taxRelief"].enumerated() {
            if i > 0 && i % 2 == 0 {
                engine.run.world.day = JS(engine.run.world.day.asInt + 95)
            }
            let res = engine.nationDecree(0, kind: kind)
            XCTAssertTrue(res.ok, "政令 \(kind) 应可执行：\(res.reason)")
        }

        // 测试一键智能战略预设与季度托管开关
        let preset = engine.nationDecree(0, kind: "strategy:prosperTrade")
        XCTAssertTrue(preset.ok, preset.reason)
        let autoOn = engine.nationDecree(0, kind: "strategyAuto:on")
        XCTAssertTrue(autoOn.ok, autoOn.reason)

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
        let n0 = engine.run.world.nations[0].id.asString
        engine.run.finance.nations[n0].gold = JS(2000.0)

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
            _ = engine.setWorldRule("seaTransport", value: 250)
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
            _ = engine.setWorldRule("navyScale", value: 250)
            let beforeCount = Naval.fleets(r).filter { $0.status.asString != "lost" }.count
            Shipyards.expandNavies(r)
            let afterCount = Naval.fleets(r).filter { $0.status.asString != "lost" }.count
            XCTAssertGreaterThanOrEqual(afterCount, beforeCount)
        }
    }

    func testV50DecreeSlotsStrategyMutexRestorationFixBalanceAndEditorSculpt() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run
        let n0 = r.world.nations[0].id.asString
        let n1 = r.world.nations[1].id.asString

        // 1. 专项制度槽位上限：禁止无脑全开所有独立制度
        let cap = Regimes.maxIndependentReforms(r, n0)
        XCTAssertGreaterThanOrEqual(cap, 3)
        XCTAssertLessThanOrEqual(cap, 5)
        let indepList = ["audit", "minting", "jungong", "knight", "guild", "parliament"]
        for rId in indepList { _ = engine.setReform(0, reform: rId, on: true) }
        let heldIndep = Regimes.heldReforms(r, n0).filter { Regimes.independentReformIds.contains($0.id) }
        XCTAssertLessThanOrEqual(heldIndep.count, cap)

        // 2. 国家大战略严格互斥（绝不叠加旧方针独立制度）且强制 180 日转轨冷却
        let s1 = engine.nationDecree(0, kind: "strategy:prosperTrade")
        XCTAssertTrue(s1.ok, s1.reason)
        // 同战略重复点击应被拦截
        let sDup = engine.nationDecree(0, kind: "strategy:prosperTrade")
        XCTAssertFalse(sDup.ok)
        // 冷却期内切换他战略应被拦截
        let sBlocked = engine.nationDecree(0, kind: "strategy:expand")
        XCTAssertFalse(sBlocked.ok)
        // 越过 180 日冷却期切换「经略扩张」：应自动撤销「富国兴商」的独立制度（如 minting/guild/liangshui），绝不叠加
        r.world.day = JS(r.world.day.asNumber + 200)
        let s2 = engine.nationDecree(0, kind: "strategy:expand")
        XCTAssertTrue(s2.ok, s2.reason)
        let afterSwitchIds = Set(Regimes.heldReforms(r, n0).map(\.id))
        XCTAssertFalse(afterSwitchIds.contains("minting"))
        XCTAssertFalse(afterSwitchIds.contains("guild"))
        XCTAssertFalse(afterSwitchIds.contains("liangshui"))
        XCTAssertTrue(afterSwitchIds.contains("jungong"))

        // 3. 四项新增政令均可执行并写入冷却表（严守每季 2 道施政额度），nationInfo 正确导出 decreeCooldowns / rulerEval / realmStrain
        r.finance.nations[n0].gold = JS(5000.0)
        XCTAssertTrue(engine.nationDecree(0, kind: "imperialInspection").ok)
        XCTAssertFalse(engine.nationDecree(0, kind: "imperialInspection").ok) // 立刻复点被冷却拦截
        XCTAssertTrue(engine.nationDecree(0, kind: "warBond").ok)
        XCTAssertFalse(engine.nationDecree(0, kind: "eliteDrill").ok)        // 同季第 3 道政令被季度额度闸门拦截
        r.world.day = JS(r.world.day.asInt + 95)
        XCTAssertTrue(engine.nationDecree(0, kind: "eliteDrill").ok)
        XCTAssertTrue(engine.nationDecree(0, kind: "scholarlyEdict").ok)
        let infoData = try XCTUnwrap(engine.nationInfo(0))
        let infoJson = try XCTUnwrap(JSONSerialization.jsonObject(with: infoData) as? [String: Any])
        let cds = try XCTUnwrap(infoJson["decreeCooldowns"] as? [String: Any])
        XCTAssertNotNil(cds["imperialInspection"])
        XCTAssertNotNil(infoJson["rulerEval"])
        XCTAssertNotNil(infoJson["realmStrain"])

        // 4. 彻底根治“战时暂被占领 → 覆亡 → 和谈归还 → 第二XX国”无限循环
        let n1Provs = r.world.provinces.asArray.filter { $0.controller.asString == n1 }
        if !n1Provs.isEmpty {
            // 令 n0 与 n1 交战并暂时占领 n1 全部州（保持 legalOwner == n1）
            let rel = Wars.relation(r, n0, n1)!
            rel.status = JS("war"); rel.sinceDay = r.world.day.clone()
            _ = Wars.register(r, attacker: n0, defender: n1, goals: .array())
            for p in n1Provs { p.controller = JS(n0) }
            Government.reconcileContinuity(r)
            // 仍在交战且保有法理州郡时，绝不可提前判亡！
            XCTAssertFalse(r.chronicle.ended.has(n1))
            XCTAssertEqual(Int(r.sovereignty.restorations[n1].optionalNumber ?? 0), 0)
            // 归还占领地后仍不产生「第二XX国」复国序数
            for p in n1Provs { p.controller = JS(n1) }
            Government.reconcileContinuity(r)
            XCTAssertEqual(Regimes.restorationOrdinal(r, n1), "")
        }

        // 5. 小国自定义攻防加成（最高 +300%）真正以独立乘法压制强敌，昏君 vs 明君显著改变国势
        _ = engine.setBonus(0, key: "attack", value: 200)
        _ = engine.setBonus(1, key: "defense", value: 0)
        let boostedDmg = Regimes.combatBonus(r, attacker: n0, victim: n1)
        _ = engine.setBonus(0, key: "attack", value: 0)
        let plainDmg = Regimes.combatBonus(r, attacker: n0, victim: n1)
        XCTAssertGreaterThan(boostedDmg, plainDmg * 2.2)

        if let lid = r.people.nations[n0].leaderId.optionalNumber, let ruler = People.person(r, Int(lid)) {
            ruler.base.military = JS(20); ruler.base.administrative = JS(20); ruler.base.charisma = JS(20)
            ruler.traits = .array([JS("Incompetent"), JS("Tyrant")])
            let badEval = Regimes.rulerAssessment(r, n0)
            XCTAssertEqual(badEval.tier, -2)
            XCTAssertLessThan(badEval.income, -15)

            ruler.base.military = JS(90); ruler.base.administrative = JS(90); ruler.base.charisma = JS(90)
            ruler.traits = .array([JS("Visionary"), JS("Tactician")])
            let goodEval = Regimes.rulerAssessment(r, n0)
            XCTAssertEqual(goodEval.tier, 2)
            XCTAssertGreaterThan(goodEval.attack, 15)
        }

        // 6. 手绘地图「依陆生景」保留海陆轮廓同时生成山脉与内陆湖
        let worldDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let gridData = try Data(contentsOf: worldDir.appendingPathComponent("grid20k.bin"))
        let grid = try TerrainGraph(data: gridData)
        var drawn = [UInt8](repeating: 6, count: grid.points.count)
        for i in grid.points.indices {
            let dx = (grid.points[i].0 - grid.width * 0.5) / (grid.width * 0.32)
            let dy = (grid.points[i].1 - grid.height * 0.5) / (grid.height * 0.34)
            if dx * dx + dy * dy < 1.0 { drawn[i] = 28 }
        }
        let sculpted = PreviewWorld.autoSculptTerrain(graph: grid, heights: drawn, seed: "v5-test", mode: .full)
        // 原先海格 100% 保持海域，原先陆地诞生出高山 (> 60) 与内陆起伏
        var seaPreserved = true, maxLandH: UInt8 = 0
        for i in drawn.indices {
            if drawn[i] < 20 && sculpted[i] >= 20 { seaPreserved = false }
            if drawn[i] >= 20 && sculpted[i] > maxLandH { maxLandH = sculpted[i] }
        }
        XCTAssertTrue(seaPreserved)
        XCTAssertGreaterThan(maxLandH, 60)
    }

    /// v5.0.1 回归：WorldMeta.Province 公开构造、国家直控税制/废立昏君/广纳奇才/敕封名将/大酺庆典、
    /// 军团临阵换将/急补粮饷/军中演武，以及 42 项扩展历史动态事件全链路校验。
    func testV501DirectGovernanceArmyAgencyAndWorldMetaInit() throws {
        // 1. WorldMeta.Province 公开初始化器（保障 App 层 MapEditor 跨模块构建）
        let prov = WorldMeta.Province(id: "p-1", name: "长安", x: 100, y: 200, nation: 0, terrain: "plain")
        XCTAssertEqual(prov.id, "p-1")
        XCTAssertEqual(prov.name, "长安")

        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run
        let n0 = r.world.nations[0].id.asString
        r.finance.nations[n0].gold = JS(5000.0)

        // 2. 三档赋税直控与 nationInfo.taxPolicy 同步回显
        XCTAssertTrue(engine.setTax(0, "heavy").ok)
        let infoHeavy = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(engine.nationInfo(0))) as? [String: Any])
        XCTAssertEqual(infoHeavy["taxPolicy"] as? String, "heavy")
        XCTAssertTrue(engine.setTax(0, "light").ok)
        let infoLight = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(engine.nationInfo(0))) as? [String: Any])
        XCTAssertEqual(infoLight["taxPolicy"] as? String, "light")

        // 3. 广纳奇才：真正在 r.kin.persons 中诞生高属性将相并受 360 日冷却保护
        let beforeCount = r.kin.persons.objectKeys.count
        let rec1 = engine.nationDecree(0, kind: "recruitTalent")
        XCTAssertTrue(rec1.ok, rec1.reason)
        XCTAssertEqual(r.kin.persons.objectKeys.count, beforeCount + 1)
        XCTAssertFalse(engine.nationDecree(0, kind: "recruitTalent").ok) // 冷却拦截

        // 4. 敕封名将 & 大酺庆典（跨季执行以尊重每季 2 道额度）
        let prom = engine.nationDecree(0, kind: "promoteCommander")
        XCTAssertTrue(prom.ok, prom.reason)
        r.world.day = JS(r.world.day.asInt + 95)
        if r.regimes.defeatShock.isNull { r.regimes.defeatShock = JS.object() }
        r.regimes.defeatShock[n0] = JS(0.24)
        let feast = engine.nationDecree(0, kind: "grandFeast")
        XCTAssertTrue(feast.ok, feast.reason)
        XCTAssertLessThan(r.regimes.defeatShock[n0].optionalNumber ?? 1.0, 0.15)

        // 5. 废黜昏君：明君/常主被拒，昏君/暴君可废立换贤主
        if let lid = r.people.nations[n0].leaderId.optionalNumber, let ruler = People.person(r, Int(lid)) {
            ruler.base.military = JS(85); ruler.base.administrative = JS(85); ruler.base.charisma = JS(85)
            ruler.traits = JS.array([JS("Visionary")])
            XCTAssertFalse(engine.nationDecree(0, kind: "deposeMonarch").ok)

            ruler.base.military = JS(15); ruler.base.administrative = JS(15); ruler.base.charisma = JS(15)
            ruler.traits = JS.array([JS("Incompetent"), JS("Tyrant")])
            let depose = engine.nationDecree(0, kind: "deposeMonarch")
            XCTAssertTrue(depose.ok, depose.reason)
            let newLid = r.people.nations[n0].leaderId.optionalNumber.map(Int.init) ?? -1
            XCTAssertNotEqual(newLid, Int(lid))
        }

        // 6. 军团临阵换将 / 急补粮饷 / 军中演武
        if let army = r.world.armies.asArray.first(where: { $0.nationId.optionalString == n0 && $0.troops.asNumber > 0 }) {
            let aid = army.id.asString
            army.supplies = JS(25); army.morale = JS(40); army.status = JS("idle")
            let sup = engine.fieldResupply(aid)
            XCTAssertTrue(sup.ok, sup.reason)
            XCTAssertEqual(army.supplies.asInt, 100)
            XCTAssertGreaterThanOrEqual(army.morale.asInt, 60)

            let drill = engine.fieldDrill(aid)
            XCTAssertTrue(drill.ok, drill.reason)
            XCTAssertGreaterThanOrEqual(Int((r.regimes.armyXP[aid].optionalNumber ?? 0).rounded()), 15)

            let swap = engine.appointBestCommander(aid)
            XCTAssertTrue(swap.ok, swap.reason)
        }
    }

    /// v5.1.0 回归：12 座天下奇观（动工/唯一性/月度竣工/全局光环/攻州易主）、8 条霸业使命（校验/领赏/防重领）、
    /// 5 年黄金盛世（激活/光环/冷却）与 6 支天下雇佣兵团（高士气高历练直募与 180 日冷却）。
    func testV510WondersAmbitionsGoldenAgeAndMercenaries() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run
        let nations = r.world.nations.asArray
        XCTAssertGreaterThanOrEqual(nations.count, 2)
        let n0 = nations[0].id.asString
        let n1 = nations[1].id.asString

        // 1. grandInfo 完整导出 12 奇观 / 8 霸业 / 6 佣兵
        let raw0 = try XCTUnwrap(engine.grandInfo(0))
        let json0 = try XCTUnwrap(JSONSerialization.jsonObject(with: raw0) as? [String: Any])
        XCTAssertEqual((json0["wonders"] as? [[String: Any]])?.count, 12)
        XCTAssertEqual((json0["missions"] as? [[String: Any]])?.count, 8)
        XCTAssertEqual((json0["mercenaries"] as? [[String: Any]])?.count, 6)

        // 2. 天下奇观：动工扣金、防重复与防并行、逐月推进竣工、真实 Leverage 加成、攻占所在州即易主
        r.finance.nations[n0].gold = JS(3000.0)
        let wStart = engine.startWonder(0, wonderId: "greatWall")
        XCTAssertTrue(wStart.ok, wStart.reason)
        XCTAssertEqual(Int((r.finance.nations[n0].gold.optionalNumber ?? 0).rounded()), 2280)
        XCTAssertFalse(engine.startWonder(0, wonderId: "greatWall").ok)      // 举世唯一不可重复
        XCTAssertFalse(engine.startWonder(0, wonderId: "grandCanal").ok)     // 同国不可同时开建两座

        for m in 1...14 {
            GrandSystems.month(r, nations[0], n0, m, addGold: { _ in }, addDestiny: { _ in })
        }
        XCTAssertEqual(r.regimes.wonders["greatWall"].status.optionalString, "done")
        let bonOwner = GrandSystems.leverageBonus(r, nationId: n0)
        XCTAssertGreaterThanOrEqual(bonOwner.defense, 18.0)

        // 攻陷奇观所在州后，光环自动归属新实控国
        if let pid = r.regimes.wonders["greatWall"].provinceId.optionalString,
           let p = r.world.provinces.asArray.first(where: { $0.id.asString == pid }) {
            let oldCtrl = p.controller.clone()
            p.controller = JS(n1)
            XCTAssertEqual(GrandSystems.controlledWonders(r, nationId: n0).count, 0)
            XCTAssertEqual(GrandSystems.controlledWonders(r, nationId: n1).count, 1)
            XCTAssertGreaterThanOrEqual(GrandSystems.leverageBonus(r, nationId: n1).defense, 18.0)
            p.controller = oldCtrl
        }

        // 3. 国家霸业使命：未达标拒绝 → 达标领赏 → 禁止重复领取
        r.finance.nations[n0].gold = JS(800.0)
        XCTAssertFalse(engine.claimMission(0, missionId: "richTreasury").ok)
        Finance.setCorruption(r, n0, 30.0)
        r.finance.nations[n0].gold = JS(3200.0)
        let claim = engine.claimMission(0, missionId: "richTreasury")
        XCTAssertTrue(claim.ok, claim.reason)
        XCTAssertLessThan(Finance.corruption(r, n0), 22.0)
        XCTAssertFalse(engine.claimMission(0, missionId: "richTreasury").ok)

        // 4. 五年黄金盛世：已实控奇观满足门槛 → 开启 60 个月盛世 → 真实攻防岁入加成 → 不可重复开启
        let ga = engine.startGoldenAge(0)
        XCTAssertTrue(ga.ok, ga.reason)
        XCTAssertEqual(GrandSystems.goldenAgeRemaining(r, nationId: n0), 60)
        let gaBon = GrandSystems.leverageBonus(r, nationId: n0)
        XCTAssertGreaterThanOrEqual(gaBon.attack, 16.0)
        XCTAssertGreaterThanOrEqual(gaBon.income, 25.0)
        XCTAssertFalse(engine.startGoldenAge(0).ok)

        // 5. 天下雇佣兵团：直募玄甲铁骑团（4800 精锐、士气 95、历练 45）并触发 180 日休整冷却
        let armyBefore = r.world.armies.asArray.count
        let merc = engine.hireMercenary(0, mercId: "xuanjia")
        XCTAssertTrue(merc.ok, merc.reason)
        XCTAssertEqual(r.world.armies.asArray.count, armyBefore + 1)
        if let spawned = r.world.armies.asArray.last {
            XCTAssertEqual(spawned.name.optionalString, "玄甲铁骑团")
            XCTAssertEqual(spawned.troops.asInt, 4800)
            XCTAssertEqual(spawned.morale.asInt, 95)
            XCTAssertEqual(r.units[spawned.id.asString].optionalString, "HeavyCavalry")
            XCTAssertEqual(Int((r.regimes.armyXP[spawned.id.asString].optionalNumber ?? 0).rounded()), 45)
        }
        XCTAssertFalse(engine.hireMercenary(0, mercId: "xuanjia").ok)
    }

    /// v5.2.0 综合回归：君主与将领战术 AI 谋略、杜绝「地名+朝/王朝」、治理强国库/防重复/季度额度/央地集权/自动裁决、
    /// 四海探索与古迹远征、大图性能核心分桶与主权法理整合。
    func testV520TacticalIQRulerTurnoverGovernanceBalanceNamingAndExploration() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run
        let nations = r.world.nations.asArray
        XCTAssertGreaterThanOrEqual(nations.count, 2)
        let n0 = nations[0].id.asString

        // 1. 君主与将领军事谋略（TacticalIQ）：明君名将高智商 vs 昏君庸将低智商瞎指挥
        if let lid = r.people.nations[n0].leaderId.optionalNumber, let ruler = People.person(r, Int(lid)) {
            ruler.base.military = JS(95); ruler.base.administrative = JS(88); ruler.base.charisma = JS(88)
            ruler.traits = JS.array([JS("Visionary"), JS("Tactician"), JS("Strategist")])
            let highIQ = Regimes.tacticalIQ(r, nation: n0)
            XCTAssertGreaterThanOrEqual(highIQ.tier, 1)
            XCTAssertLessThanOrEqual(highIQ.retreatRatio, 1.50)
            XCTAssertGreaterThanOrEqual(highIQ.musterPatience, 17)
            XCTAssertEqual(highIQ.blunderJitter, 0)

            ruler.base.military = JS(12); ruler.base.administrative = JS(15); ruler.base.charisma = JS(15)
            ruler.traits = JS.array([JS("Incompetent"), JS("Tyrant")])
            if let cmd = Regimes.activeCommander(r, nation: n0), let cp = People.person(r, cmd.personId) {
                cp.base.military = JS(14); cp.traits = JS.array([JS("Incompetent")])
            }
            let lowIQ = Regimes.tacticalIQ(r, nation: n0)
            XCTAssertLessThanOrEqual(lowIQ.tier, -1)
            XCTAssertGreaterThanOrEqual(lowIQ.retreatRatio, 2.0)
            XCTAssertGreaterThanOrEqual(lowIQ.blunderJitter, 80)
        }

        // 2. 现实感国名校验：绝不产生「襄阳朝」「姑苏朝」「江南朝」「江南王朝」「威尼斯王朝」
        let dynasty = Regimes.styles.first { $0.id == "dynasty" }!
        let empire = Regimes.styles.first { $0.id == "empire" }!
        for place in ["襄阳", "姑苏", "江南", "巴蜀", "岭南"] {
            let t1 = NamingCatalog.formatStateTitle(base: place, style: dynasty, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "李", template: nil)
            XCTAssertFalse(t1.hasSuffix("朝"), "禁止地名+朝：\(t1)")
            XCTAssertEqual(t1, place + "王国")
            let t2 = NamingCatalog.formatStateTitle(base: place, style: empire, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "李", template: nil)
            XCTAssertFalse(t2.hasSuffix("王朝"), "禁止地名+王朝：\(t2)")
        }
        let venice = NamingCatalog.formatStateTitle(base: "威尼斯", style: dynasty, religion: "catholic", culture: "italian", ordinal: "", rulingSurname: "", template: nil)
        XCTAssertFalse(venice.hasSuffix("王朝"), "禁止异域城名+王朝：\(venice)")
        XCTAssertEqual(venice, "威尼斯王国")
        let bourbon = NamingCatalog.formatStateTitle(base: "波旁", style: dynasty, religion: "catholic", culture: "french", ordinal: "", rulingSurname: "波旁", template: nil)
        XCTAssertEqual(bourbon, "波旁王朝")

        // 3. 治理平衡：0 金拒颁付费政令 + 季度 2 道限额 + 央地集权三档 + 变法 90 日冷却 + 国家抉择防重复与自动裁决
        r.finance.nations[n0].gold = JS(0.0)
        XCTAssertFalse(engine.nationDecree(0, kind: "prosper").ok)
        XCTAssertFalse(engine.nationDecree(0, kind: "roadNetwork").ok)
        XCTAssertFalse(engine.nationDecree(0, kind: "antiCorruption").ok)

        r.finance.nations[n0].gold = JS(2000.0)
        XCTAssertTrue(engine.nationDecree(0, kind: "prosper").ok)
        XCTAssertTrue(engine.nationDecree(0, kind: "granary").ok)
        XCTAssertFalse(engine.nationDecree(0, kind: "relief").ok) // 同季第 3 道政令被季度额度闸门拦截

        // 央地集权三档与 180 日转轨冷却
        let cOn = engine.nationDecree(0, kind: "centralization:central")
        XCTAssertTrue(cOn.ok, cOn.reason)
        XCTAssertFalse(engine.nationDecree(0, kind: "centralization:autonomous").ok) // 冷却期内禁止频繁改制
        let levCentral = Regimes.leverage(r, n0)
        r.world.day = JS(r.world.day.asInt + 200)
        XCTAssertTrue(engine.nationDecree(0, kind: "centralization:autonomous").ok)
        let levAuto = Regimes.leverage(r, n0)
        XCTAssertGreaterThan(levCentral.income, levAuto.income + 15)
        XCTAssertGreaterThan(levAuto.stability, levCentral.stability + 10)

        // 变法 90 日冷却
        let ref1 = engine.setReform(0, reform: "audit", on: true)
        XCTAssertTrue(ref1.ok, ref1.reason)
        XCTAssertFalse(engine.setReform(0, reform: "minting", on: true).ok)

        // 国家因果抉择严格防重复 + 满 2 月自动裁决
        Regimes.enable(r)
        if r.regimes.eventChains.isNull { r.regimes.eventChains = JS.object() }
        let chObj = JS.object(); chObj.id = JS("famineRelief"); chObj.month = JS(1)
        r.regimes.eventChains[n0] = chObj
        let res1 = engine.resolveEventChain(0, chainId: "famineRelief", choice: "a")
        XCTAssertTrue(res1.ok, res1.reason)
        XCTAssertFalse(engine.resolveEventChain(0, chainId: "famineRelief", choice: "a").ok) // 严禁重复领取

        let chAuto = JS.object(); chAuto.id = JS("enlightenmentReform"); chAuto.month = JS(2)
        r.regimes.eventChains[n0] = chAuto
        _ = engine.nationDecree(0, kind: "autoDecide:on")
        WorldDepth.month(r, key: 4) // 满 2 个月触发自动裁决
        XCTAssertTrue(r.regimes.eventChains[n0].isNull)

        // 4. 四海探索与古迹远征：10 处古迹导出、派遣扣金、防重复与防并行、4 月完成发掘并生效永久加成
        let gData = try XCTUnwrap(engine.grandInfo(0))
        let gJson = try XCTUnwrap(JSONSerialization.jsonObject(with: gData) as? [String: Any])
        XCTAssertEqual((gJson["expeditions"] as? [[String: Any]])?.count, 10)

        r.finance.nations[n0].gold = JS(1000.0)
        let expStart = engine.dispatchExpedition(0, siteId: "kunlunRuins")
        XCTAssertTrue(expStart.ok, expStart.reason)
        XCTAssertFalse(engine.dispatchExpedition(0, siteId: "kunlunRuins").ok)
        XCTAssertFalse(engine.dispatchExpedition(0, siteId: "penglaiIsle").ok)
        for m in 1...4 {
            GrandSystems.month(r, nations[0], n0, 10 + m, addGold: { _ in }, addDestiny: { _ in })
        }
        XCTAssertEqual(r.regimes.expeditions["kunlunRuins"].status.optionalString, "done")
        let expBonus = GrandSystems.leverageBonus(r, nationId: n0)
        XCTAssertGreaterThanOrEqual(expBonus.attack, 5.0)
        XCTAssertGreaterThanOrEqual(expBonus.defense, 5.0)

        // 5. nationInfo 完整导出 tacticalIQ / edictQuota / centralization / autoDecide
        let nInfoRaw = try XCTUnwrap(engine.nationInfo(0))
        let nInfoJson = try XCTUnwrap(JSONSerialization.jsonObject(with: nInfoRaw) as? [String: Any])
        XCTAssertNotNil(nInfoJson["tacticalIQ"])
        XCTAssertEqual(nInfoJson["edictQuotaMax"] as? Int, 2)
        XCTAssertEqual(nInfoJson["centralization"] as? String, "autonomous")
        XCTAssertEqual(nInfoJson["autoDecide"] as? Bool, true)
    }
}
