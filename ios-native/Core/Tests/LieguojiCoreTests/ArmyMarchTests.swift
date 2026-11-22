import XCTest
import Foundation
@testable import LieguojiCore

/// 行军不来回：目标稳定时，军队在界面上的位置逐日前进，不出现方向反转（往返晃动）。
final class ArmyMarchTests: XCTestCase {
    func test稳定目标下行军不往返() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        defer { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil }
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        // 停战：不让交战打断行军，只看行军本身。
        _ = engine.setWorld("stopWars", 1)
        let r = engine.run
        let army = try XCTUnwrap(r.world.armies.asArray.first { $0.troops.asNumber > 0 && $0.status.asString == "idle" })
        let id = army.id.asString
        let here = try XCTUnwrap(Armies.space(r).first { $0.army.id.asString == id }?.province)
        let provinces = r.world.provinces.asArray
        func far(_ p: JS) -> Double { jsHypot(p.center.x.asNumber - here.center.x.asNumber, p.center.y.asNumber - here.center.y.asNumber) }
        // 本国最远且可达的州：玩家军令（接管后军机不会改派）。
        var ordered = false
        for i in provinces.indices.sorted(by: { far(provinces[$0]) > far(provinces[$1]) }) where provinces[i].controller.asString == army.nationId.asString {
            if engine.order(armyId: id, provinceIndex: i).ok { ordered = true; break }
        }
        XCTAssertTrue(ordered, "应能找到可达的目的地")
        var last: (x: Float, y: Float)?, heading: (x: Float, y: Float)?, moves = 0, reversals = 0
        for _ in 0..<90 {
            engine.advance(days: 1)
            guard let a = engine.gameState(includeLabels: false).armies.first(where: { $0.id == id }) else { break }
            if let p = last {
                let d = (x: a.x - p.x, y: a.y - p.y), len = (d.x * d.x + d.y * d.y).squareRoot()
                if len > 0.05 {
                    if let h = heading {
                        let hl = (h.x * h.x + h.y * h.y).squareRoot()
                        if (d.x * h.x + d.y * h.y) / (len * hl) < -0.7 { reversals += 1 }
                    }
                    heading = d; moves += 1
                }
            }
            last = (a.x, a.y)
            if a.travel != "moving" && moves > 0 { break }
        }
        XCTAssertGreaterThan(moves, 3, "军队应已行军若干日")
        XCTAssertEqual(reversals, 0, "稳定目标下行军出现了往返")
    }

    /// 地形参与寻路（Item 2）：小幅绕行优先避开高山走平地，大幅绕行仍可翻越山隘；关掉 terrainCost 保持几何原样。
    func testTerrainPathfindingDetoursAroundMountainAndMatchesSpeed() throws {
        func makeGraph(detourEdge: Double) throws -> TravelGraph {
            var d = Data()
            func w32(_ v: UInt32) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
            func wi32(_ v: Int32) { w32(UInt32(bitPattern: v)) }
            func wf64(_ v: Double) { var x = v.bitPattern.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
            func wu8(_ v: UInt8) { d.append(v) }
            // 4 cells in 4 provinces: 0(plain start), 1(mountain pass), 2(plain goal), 3(plain valley detour)
            let centers: [(Double, Double)] = [(0, 0), (10, 0), (20, 0), (10, detourEdge)]
            let links: [[(Int, Double)]] = [
                [(1, 10), (3, detourEdge)],
                [(0, 10), (2, 10)],
                [(1, 10), (3, detourEdge)],
                [(0, detourEdge), (2, detourEdge)],
            ]
            let totalLinks = links.reduce(0) { $0 + $1.count }
            w32(0x5654474c); w32(1); w32(4); w32(UInt32(totalLinks)); w32(4); w32(4)
            var start = 0
            for i in 0..<4 {
                wi32(Int32(i)); wi32(Int32(i)); wi32(Int32(i))
                wf64(centers[i].0); wf64(centers[i].1); w32(UInt32(start))
                start += links[i].count
            }
            w32(UInt32(start))
            for i in 0..<4 {
                for (to, dist) in links[i] {
                    wi32(Int32(to))
                    wf64((centers[i].0 + centers[to].0) / 2); wf64((centers[i].1 + centers[to].1) / 2)
                    wf64(dist); wf64(dist / 2); wf64(dist)
                }
            }
            // Province flags: province 1 is mountain; 0, 2, 3 are plains.
            for p in 0..<4 {
                wu8(p == 1 ? 1 : 0); wu8(0); wf64(centers[p].0); wf64(centers[p].1)
            }
            for _ in 0..<4 { wu8(3) } // plain biome
            return try TravelGraph(data: d)
        }

        // 1) 短绕行：直穿山地几何 20、行军等效 30；平地绕行 26 < 30 -> 启用地形寻路时绕行平地谷道！
        let shortDetour = try makeGraph(detourEdge: 13)
        let flatPath = try XCTUnwrap(shortDetour.path(from: 0, to: 2, canEnterProvince: { _ in true }, terrainCost: false))
        let terrainPath = try XCTUnwrap(shortDetour.path(from: 0, to: 2, canEnterProvince: { _ in true }, terrainCost: true))
        XCTAssertEqual(flatPath.nodes, [0, 1, 2], "关闭 terrainCost 应保持纯几何最短路")
        XCTAssertEqual(terrainPath.nodes, [0, 3, 2], "启用 terrainCost 时小幅平地绕行应避开高山")
        XCTAssertEqual(terrainPath.cost, 26, accuracy: 1e-4)

        // 2) 长绕行：平地绕行 36 > 山地等效 30 -> 仍可经山隘翻越，不死绕远路。
        let longDetour = try makeGraph(detourEdge: 18)
        let mountainPass = try XCTUnwrap(longDetour.path(from: 0, to: 2, canEnterProvince: { _ in true }, terrainCost: true))
        XCTAssertEqual(mountainPass.nodes, [0, 1, 2], "绕行过远时应选择翻越山隘")
        XCTAssertEqual(mountainPass.cost, 30, accuracy: 1e-4)
    }
}
