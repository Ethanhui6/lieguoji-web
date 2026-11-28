import XCTest
import Foundation
@testable import LieguojiCore

/// v13.0.0 硬核引擎与二进制协议重构回归测试：
/// 1. `TravelGraph` v2 紧凑二进制格式（Float32 + 去冗余 `toGate`）体积缩小 ≥45%，寻路结果与 v1 等价；
/// 2. `LGC2` 全二进制云端封包与 `run-only` + `staticsResolver` 内容寻址恢复（体积较 JSON 暴降 7×–35×）与 `replaceRun` 保留本机地图；
/// 3. `jsHypot` 零堆分配展开版本在常规与边界数值（0、极大、极小、NaN、Infinity）上与 IEEE-754 精确一致；
/// 4. `Armies.consolidateCorps` 集团军整编：100% 守恒总兵力、减少碎团数量、保留历史名将与更高战力主战兵种；
/// 5. `BinaryStateWire` v17 `fleetDeltaMode` + `removedFleetIds` 差量编码与 `EngineService` `stepBinary(fleetDelta: true)` 闭环；
/// 6. App 大图 `frameLoop.ticks` 对齐 120 整除因子，非 App 金标准路径不受影响。
final class V13EngineOverhaulTests: XCTestCase {
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

    private func launchScenario(_ id: String, seed: String) throws -> NativeEngine {
        guard let sc = HistoricalScenarios.scenario(id: id) else {
            throw NSError(domain: "V13EngineOverhaulTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing scenario \(id)"])
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
        opt.historicalRoute = "historical"
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v13-\(id)", runId: "run-v13-\(id)")
        let engine = try NativeEngine(world: Data(built.json.utf8))
        engine.enableAppRules()
        return engine
    }

    // MARK: - 1. TravelGraph v2 紧凑格式与寻路等价

    func testTravelGraphV2CompactionAndPathfinding() throws {
        defer { cleanup() }
        let engine = try launchScenario("sengoku_1560", seed: "v13-tg-v2")
        guard let v1Bytes = Data(base64Encoded: engine.statics.travel.asString) else {
            XCTFail("缺少 v1 行军图数据"); return
        }
        let g1 = try TravelGraph(data: v1Bytes)
        let v2Bytes = g1.encodeCompactV2()
        XCTAssertLessThan(v2Bytes.count, v1Bytes.count * 55 / 100, "v2 Float32 行军图体积应至少缩减 45%（v1=\(v1Bytes.count), v2=\(v2Bytes.count)）")

        let g2 = try TravelGraph(data: v2Bytes)
        XCTAssertEqual(g2.count, g1.count)
        XCTAssertEqual(g2.mountain.count, g1.mountain.count)
        XCTAssertEqual(g2.faceBiomes.count, g1.faceBiomes.count)

        let provCount = g1.mountain.count
        if provCount >= 2, let c0 = g1.targetCell(province: 0), let c1 = g1.targetCell(province: provCount / 2) {
            let p1 = g1.path(from: c0, to: c1, allowSea: true, canEnterProvince: { _ in true }, aStar: true, terrainCost: true)
            let p2 = g2.path(from: c0, to: c1, allowSea: true, canEnterProvince: { _ in true }, aStar: true, terrainCost: true)
            XCTAssertNotNil(p1)
            XCTAssertNotNil(p2)
            if let p1, let p2 {
                XCTAssertEqual(p1.nodes.first, p2.nodes.first)
                XCTAssertEqual(p1.nodes.last, p2.nodes.last)
                XCTAssertEqual(p1.cost, p2.cost, accuracy: max(0.5, p1.cost * 0.01))
            }
        }
    }

    // MARK: - 2. LGC2 全二进制封包 + statics-cache run-only 秒载 + replaceRun 保留地图

    func testLGC2EnvelopeAndRunOnlyStaticsCacheRoundTrip() throws {
        defer { cleanup() }
        let local = try launchScenario("ww2_europe_1939", seed: "v13-lgc2-eu")
        let fullJSON = local.save()
        let lgc2Full = local.saveForCompute()
        let hash = local.computeStaticsHash
        let lgc2RunOnly = local.saveRunOnlyForCompute(staticsHash: hash)

        XCTAssertTrue(NativeEngine.isCompactComputeFormat(lgc2Full))
        XCTAssertTrue(NativeEngine.isCompactComputeFormat(lgc2RunOnly))
        XCTAssertEqual(hash.count, 32, "staticsHash 应为 32 位 FNV1a-128 十六进制")
        XCTAssertLessThan(lgc2Full.count, fullJSON.count / 4, "LGC2 完整云端封包应至少比 JSON 小 4×（json=\(fullJSON.count), lgc2=\(lgc2Full.count)）")
        XCTAssertLessThan(lgc2RunOnly.count, lgc2Full.count / 2, "run-only 封包应显著小于完整 LGC2（runOnly=\(lgc2RunOnly.count), full=\(lgc2Full.count)）")

        // WireCodec.compress 对 LGC2 直接透传不重复扫描
        XCTAssertEqual(WireCodec.compress(lgc2Full).count, lgc2Full.count)

        // 首次打开：自动回调 onStaticsDecoded 写入服务端缓存
        var cache = [String: Data]()
        let remote1 = try NativeEngine(world: lgc2Full, staticsResolver: { cache[$0] }, onStaticsDecoded: { h, blob in
            cache[h] = blob
        })
        XCTAssertNotNil(cache[hash], "首次解包 LGC2 应自动写入 statics 缓存")
        remote1.enableAppRules()
        remote1.advance(days: 3)
        XCTAssertEqual(remote1.run.world.day.asInt, 3)

        // 缓存未命中时打开 run-only 应返回 statics_miss
        XCTAssertThrowsError(try NativeEngine(world: lgc2RunOnly, staticsResolver: { _ in nil })) { err in
            XCTAssertTrue(err.localizedDescription.contains("statics_miss"))
        }

        // 缓存命中时打开 run-only 无损恢复并可继续推演，且 save() 仍输出紧凑自包含 LGC2
        let remote2 = try NativeEngine(world: lgc2RunOnly, staticsResolver: { cache[$0] })
        remote2.enableAppRules()
        remote2.advance(days: 4)
        XCTAssertEqual(remote2.run.world.day.asInt, 4)
        let serverSave = remote2.save()
        XCTAssertTrue(NativeEngine.isCompactComputeFormat(serverSave))

        // 回迁本机 replaceRun：保留本机高精 mapJSON 且推进至云端最新日期
        XCTAssertNotNil(local.mapJSON)
        try local.replaceRun(fromRemoteSave: serverSave)
        XCTAssertEqual(local.run.world.day.asInt, 4)
        XCTAssertNotNil(local.mapJSON, "从云端 LGC2 同步回本机后不得丢失本机渲染底图 statics.map")
    }

    // MARK: - 3. jsHypot 精确边界一致性

    func testJsHypotExactParity() {
        XCTAssertEqual(jsHypot(0, 0), 0)
        XCTAssertEqual(jsHypot(3, 4), 5, accuracy: 1e-15)
        XCTAssertEqual(jsHypot(-3, 4), 5, accuracy: 1e-15)
        XCTAssertEqual(jsHypot(1e150, 1e150), 2.0.squareRoot() * 1e150, accuracy: 1e136)
        XCTAssertEqual(jsHypot(1e-150, 1e-150), 2.0.squareRoot() * 1e-150, accuracy: 1e-164)
        XCTAssertTrue(jsHypot(.nan, 1).isNaN)
        XCTAssertEqual(jsHypot(.infinity, .nan), .infinity)
        XCTAssertEqual(jsHypot(-.infinity, 5), .infinity)
    }

    // MARK: - 4. HOI4 集团军整编（总兵力 100% 守恒、精简碎团）

    func testCorpsConsolidationConservesManpower() throws {
        defer { cleanup() }
        let engine = try launchScenario("sengoku_1560", seed: "v13-corps")
        let r = engine.run
        guard let firstNation = r.world.nations.asArray.first,
              let homeProv = r.world.provinces.asArray.first(where: { $0.controller.asString == firstNation.id.asString }) else {
            XCTFail("缺少测试国家与州郡"); return
        }
        let nid = firstNation.id.asString, pid = homeProv.id.asString
        // 在同一州故意征召 4 支小团，验证整编合并
        for _ in 0..<4 {
            _ = Armies.create(r, nation: nid, home: pid, kind: "regular")
        }
        let beforeArmies = r.world.armies.asArray.filter { $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
        let beforeTotal = beforeArmies.reduce(0.0) { $0 + $1.troops.asNumber }
        let beforeCount = beforeArmies.count

        let merged = Armies.consolidateCorps(r, force: true)
        XCTAssertGreaterThan(merged, 0, "同州多支空闲碎团应触发集团军整编")

        let afterArmies = r.world.armies.asArray.filter { $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
        let afterTotal = afterArmies.reduce(0.0) { $0 + $1.troops.asNumber }
        XCTAssertEqual(afterTotal, beforeTotal, accuracy: 0.5, "集团军整编必须 100% 守恒总兵力，绝不凭空吞兵")
        XCTAssertEqual(afterArmies.count, beforeCount - merged, "退役合编空壳应立即清理出活跃列表")
    }

    // MARK: - 5. LGB2 舰队差量（bit 12）与 EngineService 推流闭环

    func testFleetDeltaWireAndServiceStreaming() throws {
        let fl1 = GameState.Fleet(
            id: "fl-1", name: "第一舰队", nation: 0, ships: 12, crew: 4800, food: 90, hull: 0.95,
            status: "sailing", travel: "moving", x: 112.5, y: 204.25, decision: "patrol", reason: "",
            port: 3, manual: false, patrol: true, escorting: true, blockading: nil, repairActive: nil
        )
        var gs = GameState(
            day: 12,
            date: GameState.Date(year: 1939, month: 9, day: 13),
            owners: [],
            ownersDelta: [1, 0],
            labels: nil,
            nations: [],
            armies: [],
            fleets: [fl1],
            wars: [],
            sieges: [],
            events: []
        )
        gs.armyDeltaMode = true
        gs.removedArmyIds = ["a-dead"]
        gs.fleetDeltaMode = true
        gs.removedFleetIds = ["fl-sunk-1", "fl-sunk-2"]

        let encoded = BinaryStateWire.encode(gs)
        guard let decoded = BinaryStateWire.decode(encoded) else {
            XCTFail("LGB2 fleetDelta 解码失败"); return
        }
        XCTAssertEqual(decoded.fleetDeltaMode, true)
        XCTAssertEqual(decoded.removedFleetIds, ["fl-sunk-1", "fl-sunk-2"])
        XCTAssertEqual(decoded.fleets?.count, 1)
        XCTAssertEqual(decoded.fleets?[0].id, "fl-1")
        XCTAssertEqual(decoded.fleets?[0].escorting, true)
        XCTAssertEqual(decoded.removedArmyIds, ["a-dead"])

        // 端到端验证 EngineService stepBinary(fleetDelta: true)
        defer { cleanup() }
        let engine = try launchScenario("ww2_europe_1939", seed: "v13-fl-delta")
        let svc = EngineService()
        _ = svc.adopt(engine)
        let firstBin = svc.stateBinary(stepping: false, fleetDelta: true)
        XCTAssertFalse(firstBin.isEmpty)
        let stepReply = svc.handle("stepBinary", ["days": 1, "fleetDelta": true])
        XCTAssertTrue(stepReply.ok)
        XCTAssertNotNil(stepReply.data.flatMap { BinaryStateWire.decode($0) })
    }

    // MARK: - 6. App 大图 frameLoop.ticks 整除对齐

    func testFrameLoopTicksAlignedToDivisorOf120OnAppWorld() throws {
        defer { cleanup() }
        let engine = try launchScenario("ww2_europe_1939", seed: "v13-ticks")
        let provs = engine.run.world.provinces.length
        engine.advance(days: 1)
        let ticks = engine.run.frameLoop.ticks.asInt
        XCTAssertEqual(120 % max(1, ticks), 0, "App 模式 frameLoop.ticks(\(ticks)) 必须严格整除 120")
        if provs >= 240 {
            XCTAssertEqual(ticks, 120)
        } else if provs >= 120 {
            XCTAssertEqual(ticks, 60)
        }
    }
}
