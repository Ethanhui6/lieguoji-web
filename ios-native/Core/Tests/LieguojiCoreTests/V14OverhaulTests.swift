import XCTest
import Foundation
@testable import LieguojiCore

/// v14.0.0 终极深度引擎重构 × LGST v2 二进制网格 × HPA* 走廊寻路 × 历史事件公平性与人名统一回归测试：
/// 1. 零分配 `JS.parse`（整数/小数/科学计数法/无转义与转义字符串/JS 数字键顺序）精确一致；
/// 2. `LGST v2` 二进制 `labelGrid` + `DecodedStatics` RAM LRU 零重复解析；
/// 3. `TravelGraph.corridorPath` 2 级省域走廊 HPA* 有效连通；
/// 4. `CombatReader.inputs` 共享 `SupplyContext` 与无共享版本精确一致；
/// 5. 历史事件严格月份门控、太平洋开局真分叉、永久 `eventICBonus`、多槽 `campaignBuffs` 叠加、`law:` 联动动员、`callAllies=0` 独宣隔盟与 `assignFleetAdmiral` 真人名。
final class V14OverhaulTests: XCTestCase {
    private static var cachedInputs: CreationMap.Inputs?

    private func loadInputsAndAtlas() throws -> CreationMap.Inputs {
        if let cached = Self.cachedInputs { return cached }
        let inp = try NativeCreationTests.inputs()
        let atlasDir = NativeCreationTests.resources.appendingPathComponent("HistoricalAtlas")
        HistoricalBasemaps.registerDefaultAtlasDirectory(atlasDir)
        HistoricalBasemaps.loadAtlasDirectory(atlasDir)
        Self.cachedInputs = inp
        return inp
    }

    private func cleanup() {
        Session.uninstall()
        UnitKinds.enabled = false
        DeclarationEngine.temper = nil
        DeclarationEngine.pact = nil
        DeclarationEngine.stance = nil
        ArmyAutonomy.temper = nil
    }

    private func launchScenario(_ id: String, seed: String, route: String = "historical") throws -> NativeEngine {
        guard let sc = HistoricalScenarios.scenario(id: id) else {
            throw NSError(domain: "V14OverhaulTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing scenario \(id)"])
        }
        let inputs = try loadInputsAndAtlas()
        var opt = NativeCreation.Options(
            seed: seed,
            template: "continents",
            count: sc.nations.count,
            cityCount: sc.provinceCount,
            relations: "historical",
            naming: "historical-names",
            cultures: []
        )
        opt.historicalScenario = sc
        opt.historicalRoute = route
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v14-\(id)", runId: "run-v14-\(id)")
        let engine = try NativeEngine(world: Data(built.json.utf8))
        engine.enableAppRules()
        return engine
    }

    // MARK: - 1. 快速零分配 JS.parse 与数字键顺序一致性

    func testFastJSParseParityAndNumericKeyOrder() throws {
        let json = """
        {
          "10": 100,
          "2": -42.125,
          "b": "plain ascii & 中文字符串",
          "1": 0,
          "esc": "line1\\n\\t\\"quoted\\"\\u4E2D",
          "sci": 1.25e-4,
          "big": 9007199254740991,
          "arr": [0, -0, 3.14159265358979, true, false, null]
        }
        """
        let obj = try JS.parse(Data(json.utf8))
        let keys = obj.objectKeys
        XCTAssertEqual(keys, ["1", "2", "10", "b", "esc", "sci", "big", "arr"], "JS 对象必须保持数组索引升序在前的规范键序")
        XCTAssertEqual(obj["1"].asNumber, 0)
        XCTAssertEqual(obj["2"].asNumber, -42.125, accuracy: 1e-12)
        XCTAssertEqual(obj["10"].asNumber, 100)
        XCTAssertEqual(obj["b"].asString, "plain ascii & 中文字符串")
        XCTAssertEqual(obj["esc"].asString, "line1\n\t\"quoted\"中")
        XCTAssertEqual(obj["sci"].asNumber, 1.25e-4, accuracy: 1e-12)
        XCTAssertEqual(obj["big"].asNumber, 9007199254740991.0, accuracy: 1.0)
        XCTAssertEqual(obj["arr"][2].asNumber, 3.14159265358979, accuracy: 1e-12)

        // 批量数字键（模拟 persons["1".."400"]）必须升序无丢失
        var parts = [String]()
        for i in stride(from: 400, through: 1, by: -1) {
            parts.append("\"\(i)\":\(i)")
        }
        let bulk = try JS.parse(Data(("{" + parts.joined(separator: ",") + "}").utf8))
        let bkeys = bulk.objectKeys
        XCTAssertEqual(bkeys.count, 400)
        XCTAssertEqual(bkeys.first, "1")
        XCTAssertEqual(bkeys[1], "2")
        XCTAssertEqual(bkeys.last, "400")
    }

    // MARK: - 2. LGST v2 二进制 labelGrid 与 DecodedStatics RAM LRU 缓存

    func testLGSTv2BinaryLabelGridAndDecodedStaticsCache() throws {
        defer { cleanup() }
        let local = try launchScenario("sengoku_1560", seed: "v14-lgst2")
        let lgc2 = local.saveForCompute()
        let hash = local.computeStaticsHash
        let runOnly = local.saveRunOnlyForCompute(staticsHash: hash)

        var rawCache = [String: Data]()
        var ramCache = [String: NativeEngine.DecodedStatics]()

        let e1 = try NativeEngine(
            world: lgc2,
            staticsResolver: { rawCache[$0] },
            onStaticsDecoded: { rawCache[$0] = $1 },
            decodedStaticsResolver: { ramCache[$0] },
            onStaticsParsed: { ramCache[$0] = $1 }
        )
        e1.enableAppRules()
        XCTAssertNotNil(ramCache[hash], "首次打开 LGC2 应自动写入 DecodedStatics RAM 缓存")
        XCTAssertNotNil(ramCache[hash]?.labelGrid, "LGST v2 应直接以二进制形式保存并恢复 labelGridCache")

        // 第二次用 run-only + RAM 命中：0 次磁盘/TravelGraph/JSON 重解析！
        var rawLookupCalled = false
        let e2 = try NativeEngine(
            world: runOnly,
            staticsResolver: { h in rawLookupCalled = true; return rawCache[h] },
            decodedStaticsResolver: { ramCache[$0] }
        )
        e2.enableAppRules()
        XCTAssertFalse(rawLookupCalled, "命中 RAM DecodedStatics 时不应再去磁盘解包 LGST 字节块")
        XCTAssertEqual(e2.run.world.day.asInt, e1.run.world.day.asInt)
        let st1 = e1.gameState(includeLabels: true, slim: false)
        let st2 = e2.gameState(includeLabels: true, slim: false)
        XCTAssertEqual(st1.owners.count, st2.owners.count)
        XCTAssertEqual(st1.labels?.count ?? 0, st2.labels?.count ?? 0)
    }

    // MARK: - 3. 2 级省域走廊 HPA* 寻路有效性

    func testCorridorPathHPAStarValidity() throws {
        defer { cleanup() }
        let engine = try launchScenario("sengoku_1560", seed: "v14-hpa")
        guard let g = Armies.bridge?.graph else { XCTFail("缺少 TravelGraph"); return }
        let provCount = g.mountain.count
        var tested = 0
        for p0 in stride(from: 0, to: provCount, by: max(1, provCount / 8)) {
            guard let c0 = g.targetCell(province: p0) else { continue }
            for p1 in stride(from: provCount - 1, through: 0, by: -max(1, provCount / 8)) where p1 != p0 {
                guard let c1 = g.targetCell(province: p1) else { continue }
                let full = g.path(from: c0, to: c1, allowSea: false, canEnterProvince: { _ in true }, aStar: true, terrainCost: true)
                let hpa = g.corridorPath(from: c0, to: c1, canEnterProvince: { _ in true }, terrainCost: true)
                XCTAssertEqual(hpa != nil, full != nil, "同陆块走廊 HPA* 连通性必须与全图 A* 一致")
                if let hpa, let full {
                    XCTAssertEqual(hpa.nodes.first, c0)
                    XCTAssertEqual(hpa.nodes.last, c1)
                    XCTAssertLessThanOrEqual(hpa.cost, full.cost * 1.15 + 1.0, "HPA* 走廊代价不应严重偏离最优")
                    tested += 1
                    break
                }
            }
            if tested >= 4 { break }
        }
        XCTAssertGreaterThan(tested, 0, "至少应完成 1 条跨省同陆块 HPA* 寻路验证")
    }

    // MARK: - 4. CombatReader 共享 SupplyContext 精确等价

    func testCombatReaderSharedSupplyContextParity() throws {
        defer { cleanup() }
        let engine = try launchScenario("ww2_europe_1939", seed: "v14-supply")
        let r = engine.run
        var ctx: ArmyTactics.SupplyContext? = nil
        var checked = 0
        for a in r.world.armies.asArray.prefix(12) {
            let pid = a.provinceId.optionalString
            let idx = pid.flatMap { id in r.world.provinces.asArray.firstIndex { $0.id.asString == id } }
            let solo = CombatReader.inputs(r, a, idx)
            let shared = CombatReader.inputs(r, a, idx, supplyCtx: &ctx)
            XCTAssertEqual(solo.damageToArmy, shared.damageToArmy, accuracy: 1e-9)
            XCTAssertEqual(solo.damageToProvince, shared.damageToProvince, accuracy: 1e-9)
            XCTAssertEqual(solo.multiplier, shared.multiplier)
            checked += 1
        }
        XCTAssertGreaterThan(checked, 0)
        XCTAssertNotNil(ctx, "共享调用后应已构建可复用 SupplyContext")
    }

    // MARK: - 5. HOI4 历史事件公平性、月份门控、永久 IC、多槽 Buff、法案动员联动与提督命名

    func testHistoricalEventsFairnessAndMechanisms() throws {
        defer { cleanup() }
        // 5A. 1936 二战前夜开局推进不应提前触发 1939 年 9 月闪击波兰
        let eu36 = try launchScenario("ww2_eve_1936", seed: "v14-eu36", route: "historical")
        eu36.advance(days: 15)
        let fired36 = eu36.run.regimes.histEvents.fired
        XCTAssertFalse(fired36["fall_weiss_1939"].isTruthy, "1936 年绝不能提前触发 1939 年闪击波兰")

        // 5B. 永久 eventICBonus 在月度 NuclearWarfare.monthlyTick 后不归零；多槽 campaignBuffs 正确叠加且封顶
        let r36 = eu36.run
        guard let ger = r36.world.nations.asArray.first else { XCTFail("缺少国家"); return }
        let gid = ger.id.asString
        NuclearWarfare.ensureInitialized(r36)
        let baselineBonus = r36.regimes.hoi4.nations[gid].eventICBonus.optionalNumber ?? 0
        NuclearWarfare.addEventIC(r36, nationId: gid, delta: 24)
        let bonusBefore = r36.regimes.hoi4.nations[gid].eventICBonus.optionalNumber ?? 0
        XCTAssertEqual(bonusBefore, baselineBonus + 24, accuracy: 0.01)
        NuclearWarfare.month(r36, key: 1)
        let bonusAfter = r36.regimes.hoi4.nations[gid].eventICBonus.optionalNumber ?? 0
        XCTAssertEqual(bonusAfter, bonusBefore, accuracy: 0.01, "事件永久 IC 加成不得被月度平滑清零")

        // 法案同步动员等级
        NuclearWarfare.syncMobilizationFromReform(r36, nationId: gid, reformId: "total_mobilization")
        XCTAssertEqual(r36.regimes.hoi4.nations[gid].mobilization.asString, "total", "推行总体战法案必须联动 NuclearWarfare 动员等级")

        // 多槽 campaignBuffs 叠加与软上限
        MilitaryDoctrines.grantCampaignBuff(r36, nationId: gid, label: "闪电突击", attackPct: 25, defensePct: 10, speedMult: 1.25, navalPct: 0, durationDays: 120)
        MilitaryDoctrines.grantCampaignBuff(r36, nationId: gid, label: "空地协同", attackPct: 30, defensePct: 15, speedMult: 1.30, navalPct: 10, durationDays: 120)
        let combined = MilitaryDoctrines.activeCampaignBuff(r36, nationId: gid)
        XCTAssertNotNil(combined)
        XCTAssertEqual(combined?.attackPct ?? 0, 45.0, accuracy: 0.01, "双槽叠加应触发 +45% 公平软上限")
        XCTAssertEqual(combined?.defensePct ?? 0, 25.0, accuracy: 0.01, "双槽防御应正确累加而非互相覆盖")
        XCTAssertTrue(combined?.label.contains("闪电突击") == true && combined?.label.contains("空地协同") == true)

        // 5C. 1941 亚太剧本开局日美尚未交战（确保珍珠港南进/北进真分叉）
        cleanup()
        let asia41 = try launchScenario("ww2_asia_1941", seed: "v14-asia41", route: "sandbox")
        let r41 = asia41.run
        let jpId = HistoricalEvents.nationId(r41, specId: "japan")
        let usId = HistoricalEvents.nationId(r41, specId: "usa_pacific")
        XCTAssertNotNil(jpId)
        XCTAssertNotNil(usId)
        if let jpId, let usId {
            XCTAssertFalse(RunWindow.atWar(r41, jpId, usId), "1941 亚太剧本开局第 0 日日美不应预设交战，交由珍珠港事件真实分叉")
        }

        // 5D. assignFleetAdmiral 读取真实人物表 r.kin.persons（非硬编码「镇海都督」）
        let fleets = r41.naval.fleets.asArray
        if let firstFleet = fleets.first, let fid = firstFleet.id.optionalString {
            let res = asia41.assignFleetAdmiral(fid)
            XCTAssertTrue(res.ok)
            let assignedName = firstFleet.admiral.optionalString ?? ""
            XCTAssertFalse(assignedName.isEmpty)
            XCTAssertNotEqual(assignedName, "镇海都督", "存在存活将领时应优先任命真实人名而非兜底头衔")
        }
    }
}
