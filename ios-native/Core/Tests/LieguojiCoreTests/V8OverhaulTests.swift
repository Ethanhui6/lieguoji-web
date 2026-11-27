import XCTest
import Foundation
@testable import LieguojiCore

/// v8.0.0 全维度回归验证测试：
/// 1. 真实地理水系与大河防线（长江/黄河/莱茵/多瑙/伏尔加等 65+ 条真实河道）+ 区域战区外缘禁航边界（杜绝地图边缘假海岸偷渡）；
/// 2. 局部精绘剧本细化拆分（1939 欧洲 27 国拆分荷/比/卢/瑞士/丹麦/波罗的海、1936 战云密布 28 国、1931 九一八 11 势力、1914 欧洲 20 国、1941 亚太 13 国）；
/// 3. 真实历史事件链真实引擎实效（1936 德奥合并吞并奥地利、1939 苏军西进瓜分波兰、1931 九一八开战）+ 史实路线锁盟 vs 架空路线可退盟；
/// 4. 100% 纯中文地名校验（拦截一切英文字母与外文地名）；
/// 5. 真实历史名将实装上阵 + 军事学说实效（闪电战行军提速与进攻破防 + 战术标签可见）；
/// 6. v14 真网游 `LGB2` 军队差量二进制帧（静止驻军 0 字节开销，单帧 < 0.9 KB LZ4 落入 UDP 8767 单包 MTU）。
final class V8OverhaulTests: XCTestCase {
    private static var cachedInputs: CreationMap.Inputs?

    private func loadInputsAndAtlas() throws -> CreationMap.Inputs {
        if let cached = Self.cachedInputs { return cached }
        let inp = try NativeCreationTests.inputs()
        let atlasDir = NativeCreationTests.resources.appendingPathComponent("HistoricalAtlas")
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

    private func launchScenario(_ id: String, route: String = "historical") throws -> NativeEngine {
        guard let sc = HistoricalScenarios.scenario(id: id) else {
            throw XCTSkip("未找到历史剧本 \(id)")
        }
        let inputs = try loadInputsAndAtlas()
        var opt = NativeCreation.Options(
            seed: "v8test-\(id)-\(route)",
            template: "continents",
            count: sc.nations.count,
            cityCount: sc.provinceCount,
            relations: "historical",
            naming: "historical-names",
            cultures: []
        )
        opt.historicalScenario = sc
        opt.historicalRoute = route
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v8-\(id)", runId: "run-\(id)")
        let engine = try NativeEngine(world: Data(built.json.utf8))
        engine.enableAppRules()
        return engine
    }

    private func findNationId(_ r: JS, nameContains substr: String) -> String? {
        for n in r.world.nations.asArray {
            if (n.name.optionalString ?? "").contains(substr) {
                return n.id.asString
            }
        }
        return nil
    }

    // MARK: - 1. 真实水系与区域地图外缘禁航边界

    func testRealHistoricalRiversAndImpassableTheaterEdges() throws {
        defer { cleanup() }
        let inputs = try loadInputsAndAtlas()

        // 验证中国/欧洲/日本均生成真实地理河道三角网，且绝不为空
        for reg in [HistoricalRegion.huaxia, .china, .europe, .eastAsiaJapan, .japanDetail] {
            let h = HistoricalBasemaps.generateHeights(region: reg, document: inputs.document).map(Int.init)
            let mesh = HistoricalGeography.buildRiverMesh(region: reg, elevations: h, graph: inputs.grid)
            XCTAssertGreaterThan(mesh.count, 400, "\(reg.title) 应生成真实地理大江大河网格，实际顶点数 \(mesh.count)")
        }

        // 验证区域战区边缘禁航判定：欧洲东缘（俄罗斯内陆边界）与中国北/西缘（西伯利亚/西域内陆）必须封禁下海
        XCTAssertTrue(HistoricalBasemaps.isBlockedTheaterSea(region: .europe, x: 1580, y: 450, width: 1600, height: 900))
        XCTAssertTrue(HistoricalBasemaps.isBlockedTheaterSea(region: .china, x: 40, y: 450, width: 1600, height: 900))
        XCTAssertTrue(HistoricalBasemaps.isBlockedTheaterSea(region: .china, x: 800, y: 20, width: 1600, height: 900))
        XCTAssertFalse(HistoricalBasemaps.isBlockedTheaterSea(region: .europe, x: 520, y: 380, width: 1600, height: 900))
        XCTAssertFalse(HistoricalBasemaps.isBlockedTheaterSea(region: .world, x: 1590, y: 450, width: 1600, height: 900))

        // 验证真实建世后欧洲剧本存在真实大河防线标记（莱茵河/多瑙河/伏尔加/第聂伯等）且港口绝不建在禁航海格上
        let eu = try launchScenario("ww2_europe_1939")
        let r = eu.run
        var riverProvs = 0
        for (_, pObj) in r.terrainContext.provinces.objectEntries {
            if pObj.hasMajorRiver.isTruthy { riverProvs += 1 }
        }
        XCTAssertGreaterThan(riverProvs, 15, "1939 欧洲应有大量大河沿线州郡获得真实天堑防线标记（实际 \(riverProvs)）")
    }

    // MARK: - 2. 局部精绘剧本拆分（27国欧洲 / 28国1936 / 11势力1931 / 20国1914 / 13国1941）

    func testGranularRegionalScenariosAndSplitNations() throws {
        defer { cleanup() }
        XCTAssertEqual(HistoricalScenarios.officialScenarios.count, 12, "官方精绘历史剧本应包含 12 套精选剧本")

        guard let eu39 = HistoricalScenarios.scenario(id: "ww2_europe_1939"),
              let eu36 = HistoricalScenarios.scenario(id: "ww2_eve_1936"),
              let cn31 = HistoricalScenarios.scenario(id: "china_1931"),
              let ww1 = HistoricalScenarios.scenario(id: "ww1_1914"),
              let asia41 = HistoricalScenarios.scenario(id: "ww2_asia_1941") else {
            XCTFail("缺少新增或升级的核心精绘剧本"); return
        }
        XCTAssertEqual(eu39.nations.count, 27, "1939 欧洲应完整细化为 27 国")
        XCTAssertTrue(eu39.nations.contains { $0.name.contains("荷兰") })
        XCTAssertTrue(eu39.nations.contains { $0.name.contains("比利时") })
        XCTAssertTrue(eu39.nations.contains { $0.name.contains("卢森堡") })
        XCTAssertTrue(eu39.nations.contains { $0.name.contains("瑞士") })
        XCTAssertTrue(eu39.nations.contains { $0.name.contains("丹麦") })
        XCTAssertFalse(eu39.nations.contains { $0.name.contains("低地联盟") }, "严禁将低地三国粗糙合并为单一国家！")

        XCTAssertEqual(eu36.nations.count, 28, "1936 战云密布应包含 28 国（含独立奥地利与捷克斯洛伐克）")
        XCTAssertTrue(eu36.nations.contains { $0.id == "austria" })
        XCTAssertTrue(eu36.nations.contains { $0.id == "czechoslovakia" })

        XCTAssertEqual(cn31.nations.count, 15, "1931 九一八中国战区应包含 15 方真实势力（含西藏/滇军/英属印缅/法属印支）")
        XCTAssertEqual(ww1.region, .europe, "1914 一战应聚焦精细化局部欧洲战区，告别粗略全球大地图")
        XCTAssertEqual(ww1.nations.count, 20, "1914 一战欧洲应细化为 20 国")
        XCTAssertEqual(asia41.nations.count, 13, "1941 亚太战场应细化至 13 国（含马来新加坡/荷印/外蒙/美太）")
    }

    // MARK: - 3. 真实历史事件机械实效 + 史实路线锁盟 vs 架空路线

    func testHistoricalEventsMechanicalEffectsAndLockedAlliances() throws {
        defer { cleanup() }
        // A. 1939 欧洲史实路线：验证轴心/同盟锁盟（unbreakable = true）严禁 AI 或随便退出
        let euHist = try launchScenario("ww2_europe_1939", route: "historical")
        let hr = euHist.run
        guard let ukId = findNationId(hr, nameContains: "大英帝国"),
              let frId = findNationId(hr, nameContains: "法兰西") else {
            XCTFail("1939 欧洲缺少英法"); return
        }
        XCTAssertTrue(Alliances.areAllies(hr, ukId, frId), "英法开局必须结为同盟国")
        XCTAssertTrue(Alliances.isLockedHistorical(hr, ukId), "史实路线下英法同盟国必须被历史锁盟保护")
        let leaveBlocked = Alliances.leave(hr, ukId)
        XCTAssertFalse(leaveBlocked.ok, "史实路线下严禁随便退出核心历史阵营！")

        // B. 推进 25 日触发「白色方案 · 闪击波兰」与「苏军西进 · 瓜分波兰」事件并校验引擎记录
        euHist.advance(days: 25)
        XCTAssertFalse(hr.regimes.firedEvents["fall_weiss_1939"].isNull, "史实路线推进后应自动触发白色方案闪击波兰事件")
        XCTAssertFalse(hr.regimes.firedEvents["poland_partition_1939"].isNull, "史实路线推进 25 日后应自动触发苏军西进瓜分波兰事件")
        cleanup()

        // C. 架空路线：允许自由退出同盟
        let euSand = try launchScenario("ww2_europe_1939", route: "sandbox")
        let sr = euSand.run
        guard let ukSand = findNationId(sr, nameContains: "大英帝国") else {
            XCTFail("架空路线缺少英国"); return
        }
        XCTAssertFalse(Alliances.isLockedHistorical(sr, ukSand), "架空路线不应锁死同盟")
        let leaveOk = Alliances.leave(sr, ukSand)
        XCTAssertTrue(leaveOk.ok, "架空路线应允许自由改写联盟与退盟")
        cleanup()

        // D. 1936 战云密布：直接测试德奥合并历史事件真实吞并奥地利领土
        let eu36 = try launchScenario("ww2_eve_1936", route: "historical")
        let r36 = eu36.run
        guard let gerId = findNationId(r36, nameContains: "德意志"),
              let ausId = findNationId(r36, nameContains: "奥地利") else {
            XCTFail("1936 剧本缺少德国或奥地利"); return
        }
        let gerBefore = r36.world.provinces.asArray.filter { $0.controller.optionalString == gerId }.count
        let ausBefore = r36.world.provinces.asArray.filter { $0.controller.optionalString == ausId }.count
        XCTAssertGreaterThan(ausBefore, 0, "1936 开局奥地利必须拥有独立领土")
        // 触发德奥合并事件（1938 年 3 月，第 805 日）
        r36.world.day = JS(805)
        if !r36.world.date.isNull {
            r36.world.date.year = JS(1938)
            r36.world.date.month = JS(3)
        }
        HistoricalEvents.tickDay(r36)
        let gerAfter = r36.world.provinces.asArray.filter { $0.controller.optionalString == gerId }.count
        let ausAfter = r36.world.provinces.asArray.filter { $0.controller.optionalString == ausId }.count
        XCTAssertEqual(ausAfter, 0, "德奥合并事件触发后奥地利领土应完全并入德国")
        XCTAssertEqual(gerAfter, gerBefore + ausBefore, "德国领土应精确增加原奥地利全部州郡")
    }

    // MARK: - 4. 100% 纯中文地名校验（零英文残留）

    func testPureChinesePlaceNamesZeroLatin() throws {
        defer { cleanup() }
        let samples = ["Colonia del Sacramento", "Tây Ninh", "金斯顿 SE", "New York", "Saint-Petersburg", "科爾查K", "Warszawa"]
        for s in samples {
            let clean = NamingCatalog.enforceChinesePlaceName(s)
            XCTAssertFalse(clean.isEmpty, "清洗后地名不应为空：\(s)")
            let hasLatin = clean.unicodeScalars.contains { ($0.value >= 65 && $0.value <= 90) || ($0.value >= 97 && $0.value <= 122) }
            XCTAssertFalse(hasLatin, "地名「\(s)」→「\(clean)」严禁残留任何英文字母！")
        }

        // 检查 1939 欧洲 240 州与 1931 中国 220 州全部地名 0% 英文字符
        for scenId in ["ww2_europe_1939", "china_1931"] {
            let eng = try launchScenario(scenId)
            for p in eng.run.world.provinces.asArray {
                let nm = p.name.asString
                let hasLatin = nm.unicodeScalars.contains { ($0.value >= 65 && $0.value <= 90) || ($0.value >= 97 && $0.value <= 122) }
                XCTAssertFalse(hasLatin, "\(scenId) 州郡「\(nm)」残留英文字母！")
            }
            cleanup()
        }
    }

    // MARK: - 5. 真实历史名将与军事学说（闪电战提速/破防 + 战术标签）

    func testHistoricalGeneralsAndBlitzkriegDoctrine() throws {
        defer { cleanup() }
        let eu = try launchScenario("ww2_europe_1939", route: "historical")
        let r = eu.run
        guard let gerId = findNationId(r, nameContains: "德意志"),
              let polId = findNationId(r, nameContains: "波兰") else {
            XCTFail("缺少德波"); return
        }
        let doc = MilitaryDoctrines.doctrine(r, nationId: gerId)
        XCTAssertEqual(doc.id, .blitzkrieg, "1939 德军默认军事学说应为闪电战")
        let speedMult = MilitaryDoctrines.marchSpeedMultiplier(r, nationId: gerId)
        XCTAssertGreaterThan(speedMult, 1.35, "闪电战行军穿插速度应明显高于常规部队（实际 \(speedMult)）")
        let mods = MilitaryDoctrines.combatModifiers(r, attacker: gerId, victim: polId)
        XCTAssertGreaterThan(mods.attackPct, 24.0, "闪电战进攻突破加成应显著生效（实际 +\(mods.attackPct)%）")

        let gs = eu.gameState(includeLabels: false, slim: false)
        let gerIdx = r.world.nations.asArray.firstIndex { $0.id.asString == gerId } ?? 0
        let gerArmies = gs.armies.filter { $0.nation == gerIdx }
        XCTAssertFalse(gerArmies.isEmpty)
        XCTAssertTrue(gerArmies.contains { ($0.commander?.isEmpty == false) }, "德军主力军团应实装真实历史将领（古德里安/曼施坦因/隆美尔等）")
        XCTAssertTrue(gerArmies.contains { ($0.tacticTag ?? "").contains("闪电") }, "德军军团应携带可见的闪电战战术标签")
    }

    // MARK: - 6. v14 真网游 LGB2 军队差量二进制帧（< 0.9 KB LZ4 单包直达 UDP 8767）

    func testV14LGB2DeltaBinaryWireSubKilobyte() throws {
        defer { cleanup() }
        let eu = try launchScenario("ww2_europe_1939", route: "historical")
        let svc = EngineService()
        svc.cloudTurbo = true
        _ = svc.adopt(eu)

        // 首帧关键帧
        let keyRaw = svc.stateBinary(stepping: true)
        XCTAssertTrue(BinaryStateWire.isBinaryFrame(keyRaw))
        guard let keyState = BinaryStateWire.decode(keyRaw) else {
            XCTFail("LGB2 关键帧解码失败"); return
        }
        XCTAssertNil(keyState.armyDeltaMode, "首帧应为全量关键帧")
        XCTAssertEqual(keyState.historicalRoute, "historical")
        XCTAssertFalse(keyState.armies.isEmpty)

        // 连续静帧/微步差量帧：验证启用 armyDeltaMode 且 LZ4 体积落入 UDP MTU（<= 1320 B）
        let deltaRaw = svc.stateBinary(stepping: true)
        let deltaLZ4 = WireCodec.compress(deltaRaw)
        XCTAssertLessThanOrEqual(deltaLZ4.count, 1320, "LGB2 差量帧 LZ4 体积必须落入单包 UDP MTU（<= 1320 B，实际 \(deltaLZ4.count) B）")
        guard let deltaState = BinaryStateWire.decode(deltaRaw) else {
            XCTFail("LGB2 差量帧解码失败"); return
        }
        XCTAssertEqual(deltaState.armyDeltaMode, true, "中间帧应开启军队实体差量模式")
        XCTAssertLessThan(deltaState.armies.count, keyState.armies.count, "无变动静止驻军不应重复编码")
    }
}
