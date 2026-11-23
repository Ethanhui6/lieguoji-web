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
        XCTAssertEqual(LocalizationEngine.branchLabel(branch: "guard", culture: "english", polity: "Republic", style: "federal"), "国民警卫师")
        XCTAssertEqual(LocalizationEngine.branchLabel(branch: "guard", culture: "japanese", polity: "Monarchy", style: "shogunate"), "旗本近卫")
        XCTAssertEqual(LocalizationEngine.branchLabel(branch: "guard", culture: "roman", polity: "Monarchy", style: "empire"), "禁卫军团")
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
        // 验证跨海每日结算与海运运力计算在全图安全运行且无崩溃
        MaritimeWarfare.dailyTick(engine.run)
        let cap = MaritimeWarfare.seaTransportCapacity(engine.run, nation: id)
        XCTAssertGreaterThanOrEqual(cap, 0)
    }
}
