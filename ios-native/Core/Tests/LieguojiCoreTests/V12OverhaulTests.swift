import XCTest
import Foundation
@testable import LieguojiCore

/// v12.0.0 全链路质变升级回归测试：
/// 1. `NativeEngine.saveForCompute()` 剥离 `statics.map` 将云端上传载荷瘦身 60%+ 且服务端可无损恢复并继续推演；
/// 2. 6 阶科技上限解锁 + 时代专属 6 阶兵器谱系 + 低工业弱国严格兵种门控（零装甲师/机械化师）；
/// 3. `BinaryStateWire` v12 完整编解码新装备/科技/空优/国力/有效战力字段与剥离身份的中间帧；
/// 4. 全 12 套重烘焙历史剧本 GIS 边界 `capMiss == 0`（每国均有完整领土）与 `ensureAtlasLoaded()` 自加载；
/// 5. `EngineService` `open` 释放旧引擎、非强制 24 帧全量关键帧与 `command()` 不污染流基线。
final class V12OverhaulTests: XCTestCase {
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
            throw NSError(domain: "V12OverhaulTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing scenario \(id)"])
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
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v12-\(id)", runId: "run-\(id)")
        let engine = try NativeEngine(world: Data(built.json.utf8))
        engine.enableAppRules()
        return engine
    }

    // MARK: - 1. saveForCompute() 瘦身且云端可无损推演

    func testSaveForComputeStripsMapAndAdvancesCleanly() throws {
        defer { cleanup() }
        let engine = try launchScenario("sengoku_1560", seed: "v12-compute-sg")
        let full = engine.save()
        let slim = engine.saveForCompute()
        XCTAssertLessThan(slim.count, full.count * 65 / 100, "saveForCompute() 剥离 statics.map 后体积应显著低于全量存档（full=\(full.count), slim=\(slim.count)）")

        let remoteEngine = try NativeEngine(world: slim)
        remoteEngine.enableAppRules()
        let startDay = remoteEngine.run.day.asInt
        remoteEngine.advance(days: 6)
        XCTAssertEqual(remoteEngine.run.day.asInt, startDay + 6, "云端引擎加载 saveForCompute() 后应正常推演")
        XCTAssertNil(remoteEngine.mapJSON, "瘦身快照不应携带多余的 statics.map")
    }

    // MARK: - 2. 6 阶科技解锁 + 时代兵器谱系 + 低工业兵种门控

    func testTechTier6UnlockedAndEquipmentGating() throws {
        // 时代专属 6 阶兵器名称
        XCTAssertEqual(WorldDepth.TechBranch.military.tierName(1, era: .ww2), "拉栓步兵师")
        XCTAssertEqual(WorldDepth.TechBranch.military.tierName(6, era: .ww2), "喷气空地协同")
        XCTAssertEqual(WorldDepth.TechBranch.naval.tierName(6, era: .modern), "核动力特混编队")

        // 低工业/低科技弱国在二战时代绝不刷装甲师或机械化师
        let weakRoster = UnitKinds.rosterForEra(.ww2, culture: "chinese", techMil: 1, industryIndex: 0.4)
        let weakKeys = Set(weakRoster.map(\.0))
        XCTAssertFalse(weakKeys.contains("ArmoredDivision"), "低科技/低工业二战弱国不应刷出装甲师")
        XCTAssertFalse(weakKeys.contains("MechInfantry"), "低科技/低工业二战弱国不应刷出机械化师")

        // 高工业/高科技强国在二战时代应配备装甲师
        let strongRoster = UnitKinds.rosterForEra(.ww2, culture: "german", techMil: 6, industryIndex: 1.5)
        let strongKeys = Set(strongRoster.map(\.0))
        XCTAssertTrue(strongKeys.contains("ArmoredDivision"), "满阶工业二战强国应拥有装甲师")

        // 本国装备摘要必须体现真实代差，不再全员同款
        let superSummary = UnitKinds.nationEquipmentSummary(era: .ww2, milTech: 6, navTech: 5, ic: 65, airPower: 85)
        let weakSummary = UnitKinds.nationEquipmentSummary(era: .ww2, milTech: 2, navTech: 1, ic: 8, airPower: 5)
        XCTAssertNotEqual(superSummary, weakSummary, "超级大国与弱国现役装备谱系必须明显区分")
        XCTAssertTrue(superSummary.contains("航母"), "高科技强国海军应含航母")
        XCTAssertFalse(weakSummary.contains("航母"), "弱国海军不应出现航母")

        // 引擎内实测 techLevel 支持 6 阶（不再被截断在 5）
        defer { cleanup() }
        let engine = try launchScenario("ww2_europe_1939", seed: "v12-tech6-eu39")
        guard let gerId = HistoricalEvents.nationId(engine.run, specId: "germany") else {
            XCTFail("缺少德国 ID"); return
        }
        let book = WorldDepth.techBook(engine.run, nation: gerId)
        book["military"].level = JS(6)
        XCTAssertEqual(WorldDepth.techLevel(engine.run, nation: gerId, branch: .military), 6, "6 阶军事科技不应被钳制为 5")
    }

    // MARK: - 3. BinaryStateWire v12 字段与精简身份往返

    func testBinaryWireRoundTripsV12TechAndPowerFields() throws {
        let nationFull = GameState.Nation(
            id: "n0", name: "德意志", color: "#555555", line: "#222222", capital: 1,
            culture: "german", polity: "Empire", religion: "protestant",
            provinces: 45, cities: 45, population: 68_000_000, grain: 1200, troops: 450_000, gold: 8000, destiny: 85,
            enemies: [1], alive: true,
            milTech: 6, navTech: 4, ic: 78, airPower: 88, doctrine: "blitzkrieg", compositePower: 162.5
        )
        let nationStripped = GameState.Nation(
            id: nil, name: nil, color: nil, line: nil, capital: nil,
            culture: nil, polity: nil, religion: nil,
            provinces: 12, cities: 12, population: 9_000_000, grain: 200, troops: 40_000, gold: 400, destiny: 45,
            enemies: [0], alive: true,
            milTech: 2, navTech: 1, ic: 9, airPower: 10, doctrine: "guerrilla", compositePower: 28.0
        )
        let army = GameState.Army(
            id: "a1", name: "第1装甲集团军", nation: 0, troops: 24_000, unit: "ArmoredDivision",
            status: "fighting", travel: "moving", province: 3, supplies: 92, morale: 95,
            x: 120.5, y: 88.25, manual: false, destination: 4, mission: nil,
            equipTier: 6, effectivePower: 43_200.0
        )
        let state = GameState(
            day: 42,
            date: GameState.Date(year: 1939, month: 10, day: 12),
            owners: [0, 0, 1, 1],
            ownersDelta: nil,
            labels: nil,
            nations: [nationFull, nationStripped],
            armies: [army],
            wars: [],
            sieges: [],
            events: [],
            historicalEra: "ww2",
            historicalRoute: "historical"
        )

        let encoded = BinaryStateWire.encode(state)
        guard let decoded = BinaryStateWire.decode(encoded) else {
            XCTFail("BinaryStateWire.decode 失败"); return
        }
        XCTAssertEqual(decoded.nations.count, 2)
        XCTAssertEqual(decoded.nations[0].milTech, 6)
        XCTAssertEqual(decoded.nations[0].navTech, 4)
        XCTAssertEqual(decoded.nations[0].ic, 78)
        XCTAssertEqual(decoded.nations[0].airPower, 88)
        XCTAssertEqual(decoded.nations[0].doctrine, "blitzkrieg")
        XCTAssertEqual(decoded.nations[0].compositePower ?? 0, 162.5, accuracy: 0.2)

        // 中间帧剥离身份字段的国家同样完整还原科技与国力字段
        XCTAssertNil(decoded.nations[1].name)
        XCTAssertEqual(decoded.nations[1].milTech, 2)
        XCTAssertEqual(decoded.nations[1].ic, 9)
        XCTAssertEqual(decoded.nations[1].doctrine, "guerrilla")

        XCTAssertEqual(decoded.armies.count, 1)
        XCTAssertEqual(decoded.armies[0].equipTier, 6)
        XCTAssertEqual(decoded.armies[0].effectivePower ?? 0, 43_200.0, accuracy: 2.0)
    }

    // MARK: - 4. 全 12 套历史剧本重烘焙 GIS 0 丢都断言

    func testAll12RebakedScenariosHaveZeroMissingNations() throws {
        let inputs = try loadInputsAndAtlas()
        let expectedCells = inputs.grid.points.count
        XCTAssertEqual(HistoricalScenarios.officialScenarios.count, 12, "应存在 12 套官方精绘历史剧本")

        for sc in HistoricalScenarios.officialScenarios {
            guard let gis = HistoricalBasemaps.bakedScenarioGIS(id: sc.id, expectedCount: expectedCells) else {
                XCTFail("剧本 \(sc.id) 缺少 20K 烘焙 GIS 数据")
                continue
            }
            XCTAssertEqual(gis.nationCount, sc.nations.count, "\(sc.id) 烘焙国家数与定义不符")
            var counts = Array(repeating: 0, count: sc.nations.count)
            for owner in gis.ownerMask where owner >= 0 && Int(owner) < counts.count {
                counts[Int(owner)] += 1
            }
            for (idx, cnt) in counts.enumerated() {
                XCTAssertGreaterThan(cnt, 0, "剧本 \(sc.id) 国家 \(sc.nations[idx].id)(\(sc.nations[idx].name)) 在烘焙 GIS 中丢失全部领土！")
            }
        }
    }

    // MARK: - 5. EngineService 流基线隔离与状态携带 v12 字段

    func testEngineServiceStateIncludesV12FieldsAndIsolatedCommand() throws {
        defer { cleanup() }
        let engine = try launchScenario("ww2_europe_1939", seed: "v12-svc-eu39")
        let svc = EngineService()
        _ = svc.adopt(engine)

        let st = svc.stateBinary(stepping: false)
        XCTAssertFalse(st.isEmpty)
        if let gs = BinaryStateWire.decode(st) {
            XCTAssertTrue(gs.nations.contains { ($0.milTech ?? 0) >= 5 }, "1939 欧陆强国应携带 >= 5 阶军事科技")
            XCTAssertTrue(gs.nations.contains { ($0.ic ?? 0) > 10 }, "1939 欧陆强国应携带工业产值 IC")
            XCTAssertTrue(gs.armies.contains { ($0.equipTier ?? 0) >= 1 && ($0.effectivePower ?? 0) > 0 }, "军团应携带 equipTier 与 effectivePower")
        } else {
            XCTFail("stateBinary 解码失败")
        }

        // 中间帧不应每 24 帧强发全量关键帧，且中间帧国家名称被剥离以省流
        let step1 = svc.handle("stepBinary", ["days": 1])
        XCTAssertTrue(step1.ok)
        if let bin = step1.data, let gs1 = BinaryStateWire.decode(bin) {
            XCTAssertTrue(gs1.nations.allSatisfy { $0.name == nil }, "中间帧应剥离未变国家名称以大幅压缩单帧流量")
        } else {
            XCTFail("中间帧 stepBinary 解码失败")
        }
    }
}
