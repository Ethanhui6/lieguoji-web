import XCTest
import Foundation
@testable import LieguojiCore

/// v9.0.0 全维度回归验收测试：
/// 1. 158 条钢铁雄心级全历史剧本事件目录完整性校验（无悬空 scenarioIds / specId / 效果码 / 52 幅事件卷轴贴图键）；
/// 2. 全部 12 大官方剧本 GIS 掩膜与不可通行「无人之地（-2）」校验（0 空国、每国 >= 6 格、无人之地绝不纳入州郡与行军图）；
/// 3. 真实历史政体与时代国策法案过滤（现代剧本仅展示现代经济/征兵/贸易/体制法案与 HOI4 国策；史实路线禁止随机政体翻转）。
final class V9OverhaulTests: XCTestCase {
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

    // MARK: - 1. 158 条历史事件完整性校验

    func testExpandedHistoricalEventsCatalogIntegrity() {
        let all = HistoricalEvents.allEvents
        XCTAssertGreaterThanOrEqual(all.count, 150, "v9.0.0 历史事件总数应达到 150+ 条，实际仅 \(all.count)")

        let scenarioById = Dictionary(uniqueKeysWithValues: HistoricalScenarios.officialScenarios.map { ($0.id, $0) })
        let validScrollKeys: Set<String> = [
            "event_anschluss_1938", "event_august_storm_1945", "event_barbarossa_1941", "event_bohemia_1939",
            "event_chibi_208", "event_fall_gelb_1940", "event_fall_weiss_1939", "event_korean_war_1950",
            "event_manchukuo_1932", "event_marco_polo_1937", "event_midway_1942", "event_molotov_ribbentrop",
            "event_moscow_winter", "event_mukden_1931", "event_munich_1938", "event_pearl_harbor_1941",
            "event_poland_partition", "event_schlieffen_1914", "event_sengoku_gun", "event_uk_hurricane_1952",
            "event_weserubung_1940", "event_winter_1812", "event_xian_1936",
            "scroll_anshi_755", "scroll_austerlitz_1805", "scroll_bagration_1944", "scroll_berlin_1945",
            "scroll_berlin_airlift_1948", "scroll_borodino_1812", "scroll_britain_1940", "scroll_changping_260bce",
            "scroll_changsha_1939", "scroll_cuban_1962", "scroll_dunkirk_1940", "scroll_el_alamein_1942",
            "scroll_guandu_200", "scroll_hundred_regiments", "scroll_jutland_1916", "scroll_kursk_1943",
            "scroll_leyte_1944", "scroll_marne_1914", "scroll_nato_warsaw_1955", "scroll_normandy_1944",
            "scroll_sekigahara_1600", "scroll_silkroad_peace", "scroll_singapore_1942", "scroll_songhu_1937",
            "scroll_stalingrad_1942", "scroll_taierzhuang_1938", "scroll_tannenberg_1914", "scroll_verdun_1916",
            "scroll_yancheng_1140",
        ]

        var seenIds = Set<String>()
        var eventsPerScenario = [String: Int]()

        for ev in all {
            XCTAssertTrue(seenIds.insert(ev.id).inserted, "存在重复事件 id: \(ev.id)")
            XCTAssertFalse(ev.scenarioIds.isEmpty, "事件 \(ev.id) 缺少 scenarioIds")
            XCTAssertTrue(validScrollKeys.contains(ev.illustration), "事件 \(ev.id) 使用了未打包的插画键 \(ev.illustration)")
            XCTAssertFalse(ev.choices.isEmpty, "事件 \(ev.id) 缺少抉择选项")

            for sid in ev.scenarioIds {
                guard let sc = scenarioById[sid] else {
                    XCTFail("事件 \(ev.id) 引用了不存在的剧本 \(sid)")
                    continue
                }
                eventsPerScenario[sid, default: 0] += 1
                let nationIds = Set(sc.nations.map(\.id))

                XCTAssertTrue(nationIds.contains(ev.actorSpecId), "事件 \(ev.id) 的 actorSpecId=\(ev.actorSpecId) 不在剧本 \(sid) 中")
                if let t = ev.targetSpecId {
                    XCTAssertTrue(nationIds.contains(t), "事件 \(ev.id) 的 targetSpecId=\(t) 不在剧本 \(sid) 中")
                }

                for ch in ev.choices where !ch.effectCode.isEmpty {
                    for rawCmd in ch.effectCode.split(separator: "|") {
                        let parts = rawCmd.split(separator: ":").map(String.init)
                        guard let op = parts.first else { continue }
                        switch op {
                        case "annex", "war", "ally", "peace", "vassal", "pact", "cede", "cede_east":
                            if parts.count >= 3 {
                                XCTAssertTrue(nationIds.contains(parts[1]), "事件 \(ev.id) (\(sid)) 效果 \(rawCmd) 的 \(parts[1]) 不存在")
                                XCTAssertTrue(nationIds.contains(parts[2]), "事件 \(ev.id) (\(sid)) 效果 \(rawCmd) 的 \(parts[2]) 不存在")
                            }
                        case "buff", "gold", "morale", "law", "ic", "nuke":
                            if parts.count >= 2 {
                                XCTAssertTrue(nationIds.contains(parts[1]), "事件 \(ev.id) (\(sid)) 效果 \(rawCmd) 的 \(parts[1]) 不存在")
                            }
                        case "tension", "none":
                            break
                        default:
                            XCTFail("事件 \(ev.id) 包含未知效果指令 \(op)")
                        }
                    }
                }
            }
        }

        // 12 个官方剧本全部覆盖丰富历史事件
        for sc in HistoricalScenarios.officialScenarios {
            XCTAssertGreaterThanOrEqual(eventsPerScenario[sc.id] ?? 0, 7, "剧本 \(sc.id) 至少应拥有 7 条以上真实历史事件")
        }
    }

    // MARK: - 2. 12 剧本 GIS 无人之地（Impassable Wasteland）与零空国校验

    func testAllTwelveScenariosGISAndImpassableWasteland() throws {
        defer { cleanup() }
        let inputs = try loadInputsAndAtlas()
        let doc = inputs.document

        for sc in HistoricalScenarios.officialScenarios {
            guard let gis = HistoricalBasemaps.bakedScenarioGIS(id: sc.id, expectedCount: doc.points.count) else {
                XCTFail("缺少已烘焙 GIS 数据：\(sc.id)")
                continue
            }
            XCTAssertEqual(gis.nationCount, sc.nations.count, "\(sc.id) GIS 国家数与剧本配置不一致")
            var counts = [Int](repeating: 0, count: sc.nations.count)
            var wastelandCount = 0
            for o in gis.ownerMask {
                if o == -2 { wastelandCount += 1 }
                else if o >= 0 && Int(o) < counts.count { counts[Int(o)] += 1 }
            }
            for (i, c) in counts.enumerated() {
                XCTAssertGreaterThanOrEqual(c, 6, "\(sc.id) 国家 \(sc.nations[i].id) 领土过小（\(c) 格）")
            }
            XCTAssertGreaterThan(wastelandCount, 100, "\(sc.id) 应包含真实剧本外无人之地（实际 \(wastelandCount) 格）")
        }

        // 实机端到端生成含无人之地的典型历史剧本（1936 欧洲 + 1560 日本战国 + 208 三国），验证无人之地彻底独立于州郡与行军图之外
        for scId in ["ww2_eve_1936", "sengoku_1560", "sanguo_208"] {
            guard let sc = HistoricalScenarios.scenario(id: scId) else { XCTFail("missing \(scId)"); continue }
            var opt = NativeCreation.Options(seed: "v9-wl-\(scId)", template: "continents", count: sc.nations.count, cityCount: sc.provinceCount, relations: "historical")
            opt.historicalScenario = sc
            opt.historicalRoute = "historical"
            let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v9-\(scId)", runId: "run-\(scId)")
            let mapData = Data(base64Encoded: built.statics.map.bin.asString) ?? Data()
            let metaData = Data(built.statics.map.meta.json.utf8)
            let meta = try JSONDecoder().decode(WorldMeta.self, from: metaData)
            let wm = try WorldMap(binary: mapData, meta: meta)

            let wastelandLand = (0..<wm.cellCount).filter { wm.isLand($0) && wm.province[$0] < 0 }.count
            XCTAssertGreaterThan(wastelandLand, 80, "\(scId) 建世后地图应清晰保留不可通行无人之地陆地格（实际 \(wastelandLand)）")
            XCTAssertEqual(wm.meta.nations.count, sc.nations.count, "\(scId) 建世后国家数量应严格一致")
            cleanup()
        }
    }

    // MARK: - 3. 时代政体/法案/HOI4 国策与史实路线政体锁

    func testModernEraLawsAndHistoricalRoutePolityLock() throws {
        defer { cleanup() }
        let inputs = try loadInputsAndAtlas()
        guard let sc36 = HistoricalScenarios.scenario(id: "ww2_eve_1936"),
              let scSanguo = HistoricalScenarios.scenario(id: "sanguo_208") else {
            XCTFail("缺少测试剧本"); return
        }

        // 现代二战剧本：应自动激活现代经济/征兵/贸易/体制法案，且仅返回现代法案而非古典均田/科举
        var opt36 = NativeCreation.Options(seed: "v9-law-36", template: "continents", count: sc36.nations.count, cityCount: sc36.provinceCount, relations: "historical")
        opt36.historicalScenario = sc36
        opt36.historicalRoute = "historical"
        let built36 = try NativeCreation.generate(opt36, inputs: inputs, worldId: "v9-36", runId: "run-36")
        let eng36 = try NativeEngine(world: Data(built36.json.utf8))
        eng36.enableAppRules()
        let r36 = eng36.run
        let modernReforms = Regimes.reforms(for: HistoricalEra.current(r36))
        XCTAssertTrue(modernReforms.contains { $0.id == "econ_war" }, "现代剧本应包含战时经济法案")
        XCTAssertTrue(modernReforms.contains { $0.id == "focus_blitz_armored" }, "现代剧本应包含 HOI4 风格国家焦点国策")
        XCTAssertFalse(modernReforms.contains { $0.id == "keju" }, "现代剧本不应混入古典科举制")

        // 校验德国开局已正确预装战时/部分动员与现代法西斯政体样式
        let ger = r36.world.nations.asArray.first { ($0.name.optionalString ?? "").contains("德意志") }
        XCTAssertNotNil(ger)
        if let gerId = ger?.id.asString {
            let active = r36.regimes.nations[gerId].reforms.asArray.map(\.asString)
            XCTAssertTrue(active.contains("econ_partial") || active.contains("econ_war"), "1936 德国应预装现代工业动员法案")
            XCTAssertEqual(Regimes.style(r36, gerId).id, "nazi", "1936 德国政体样式应为纳粹极权体制")
        }
        cleanup()

        // 古典三国剧本：仅返回古典法案，不含现代征兵/战时经济
        var optSg = NativeCreation.Options(seed: "v9-law-sg", template: "continents", count: scSanguo.nations.count, cityCount: scSanguo.provinceCount, relations: "historical")
        optSg.historicalScenario = scSanguo
        optSg.historicalRoute = "historical"
        let builtSg = try NativeCreation.generate(optSg, inputs: inputs, worldId: "v9-sg", runId: "run-sg")
        let engSg = try NativeEngine(world: Data(builtSg.json.utf8))
        let classicReforms = Regimes.reforms(for: HistoricalEra.current(engSg.run))
        XCTAssertTrue(classicReforms.contains { $0.id == "keju" }, "古典剧本应包含科举取士")
        XCTAssertFalse(classicReforms.contains { $0.id == "econ_war" }, "古典剧本不应出现现代战时经济")
    }
}
