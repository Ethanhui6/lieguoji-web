import XCTest
import Foundation
@testable import LieguojiCore

/// v4.2.9 稳定性与回归压力测试：
/// 1. 验证流式 UTF-8 序列化 `JS.jsonData` 与 `Data(JS.json.utf8)` 逐字节完全一致；
/// 2. 覆盖真实用户路径：4 大地形模板（多大陆/联合大陆/群岛/高山大岛）× 和平/战乱 × `organicBorders: true` × 12 组多样种子与国数州数组合，
///    逐一完成建世、启用 App 规则、地图与图元准备、推演与存档回读，杜绝真机随机种子触发 `precondition` / `!` 闪退。
final class CreationStabilityTests: XCTestCase {
    func testJsonDataMatchesJsonStringByteForByte() throws {
        let obj = JS.object()
        obj["empty"] = JS("")
        obj["plain"] = JS("大唐帝国 · Tang Empire 12345")
        obj["escaped"] = JS("line1\nline2\r\t\"quote\"\\slash\u{0007}\u{001F}")
        obj["boolT"] = JS(true)
        obj["boolF"] = JS(false)
        obj["nullVal"] = .null
        obj["intVal"] = JS(42)
        obj["bigInt"] = JS(900_719_925_474_099.0)
        obj["floatVal"] = JS(3.1415926)
        obj["nanVal"] = JS(Double.nan)
        obj["infVal"] = JS(Double.infinity)
        obj["nested"] = JS.array([JS.object(), JS.array([JS(1), JS("二"), JS(false)]), .null])
        obj["key\"with\\esc\n"] = JS("ok")

        let expected = Data(obj.json.utf8)
        let streamed = obj.jsonData(reserveCapacity: 128)
        XCTAssertEqual(streamed, expected)

        // 同时验证解析回读与原对象无差异（非有限数转为 null）
        let parsed = try JS.parse(streamed)
        XCTAssertEqual(parsed["escaped"].asString, "line1\nline2\r\t\"quote\"\\slash\u{0007}\u{001F}")
        XCTAssertTrue(parsed["nanVal"].isNull)
        XCTAssertTrue(parsed["infVal"].isNull)
        XCTAssertEqual(parsed["plain"].asString, "大唐帝国 · Tang Empire 12345")
    }

    func testOrganicMultiTemplateCreationAndSaveRoundTrip() throws {
        defer {
            Session.uninstall()
            UnitKinds.enabled = false
            DeclarationEngine.temper = nil
            DeclarationEngine.pact = nil
            DeclarationEngine.opinionBias = nil
            DeclarationEngine.stance = nil
            ArmyAutonomy.temper = nil
        }
        let inputs = try NativeCreationTests.inputs()
        let cases: [(seed: String, template: String, nations: Int, cities: Int, relations: String)] = [
            ("429001", "continents", 8, 80, "peace"),
            ("429002", "continents", 12, 120, "war"),
            ("429003", "pangea", 8, 80, "peace"),
            ("429004", "pangea", 10, 100, "war"),
            ("429005", "archipelago", 6, 70, "peace"),
            ("429006", "archipelago", 8, 90, "war"),
            ("429007", "highIsland", 6, 65, "peace"),
            ("429008", "highIsland", 9, 95, "war"),
            ("171999", "continents", 4, 40, "war"),
            ("888888", "pangea", 14, 140, "peace"),
            ("314159", "archipelago", 5, 55, "war"),
            ("271828", "highIsland", 7, 75, "peace"),
        ]
        var vertexCounts = Set<Int>()
        for c in cases {
            var opt = NativeCreation.Options(seed: c.seed, template: c.template, count: c.nations, cityCount: c.cities, relations: c.relations, naming: "historical-names", cultures: [])
            opt.organicBorders = true
            let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "w-\(c.seed)", runId: "fms-\(c.seed)")
            let engine = try NativeEngine(created: built)
            engine.enableAppRules()
            guard let mapData = engine.mapJSON else {
                XCTFail("\(c.template)/\(c.seed): missing mapJSON"); continue
            }
            struct SavedMap: Decodable { let bin: String; let meta: WorldMeta }
            let decodedMap = try JSONDecoder().decode(SavedMap.self, from: mapData)
            guard let bin = Data(base64Encoded: decodedMap.bin) else {
                XCTFail("\(c.template)/\(c.seed): bad base64 bin"); continue
            }
            let world = try WorldMap(binary: bin, meta: decodedMap.meta)
            vertexCounts.insert(world.vertices.count)
            XCTAssertGreaterThan(world.cellCount, 0)
            XCTAssertGreaterThan(world.vertices.count, 0)
            XCTAssertGreaterThanOrEqual(world.meta.nations.count, 2)
            XCTAssertGreaterThanOrEqual(world.meta.provinces.count, world.meta.nations.count)

            // 验证着色与地形山影长度严格对齐（防止渲染层越界）
            let palette = world.meta.nations.map { RGB(css: $0.color) ?? RGB(0.5, 0.5, 0.5) }
            let landColors = CellMesh.colors(map: world, mode: .political, nationColors: palette)
            let terrainColors = CellMesh.colors(map: world, mode: .terrain, nationColors: palette)
            let hillshade = MapLayers.vertexHillshade(world)
            XCTAssertEqual(landColors.count, (world.vertices.count / 2) * 4)
            XCTAssertEqual(terrainColors.count, landColors.count)
            XCTAssertEqual(hillshade.count, world.vertices.count / 2)

            // 推演 3 日并验证流式存盘与回读完整闭环
            let day0 = engine.gameState(includeLabels: false).day
            engine.advance(days: 3)
            let state = engine.gameState(includeLabels: true)
            XCTAssertEqual(state.day, day0 + 3)
            if c.seed == "429001" || c.seed == "429006" {
                let saved = engine.save()
                XCTAssertGreaterThan(saved.count, 100_000)
                let reloaded = try NativeEngine(world: saved)
                XCTAssertEqual(reloaded.gameState(includeLabels: false).day, day0 + 3)
            }
        }
        XCTAssertGreaterThanOrEqual(vertexCounts.count, 1)
    }
}
