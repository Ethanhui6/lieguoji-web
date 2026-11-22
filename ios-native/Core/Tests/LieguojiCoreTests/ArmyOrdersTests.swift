import XCTest
import Foundation
@testable import LieguojiCore

/// Golden per-frame army orders on the run from the web (src/native-export/army-orders-golden.test.ts):
/// the five rotating orders of one frame boundary, compared on the whole run.
final class ArmyOrdersTests: XCTestCase {
    func testArmyOrdersMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/army-orders.json")))
        let traits = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/nobility.json"))).traits
        People.loadTraits(traits); Nobility.traitList = traits.asArray
        Armies.bridge = ForceBridge(graph: try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin"))))
        for (k, v) in golden.homeCells.objectEntries { Armies.homeCells[k] = v.asInt }
        CombatReader.borders = golden.borders.asArray.map { $0.asArray.map(\.asInt) }
        RunWindow.afterOccupation = nil; RunWindow.afterTick = nil
        var input: JS?, failures = 0, issued = 0
        for (k, s) in golden.samples.asArray.enumerated() {
            if let previous = input { let next = previous.clone(); NobilityTests.apply(s.inputPatch, to: next); input = next } else { input = s.input }
            let r = input!.clone(), expected = input!.clone()
            NobilityTests.apply(s.patch, to: expected)
            let out = ArmyOrders.issueBatch(r)
            if out { issued += 1 }
            r.chronicle.entries.asArray = Array(r.chronicle.entries.asArray.suffix(4))
            if out != s.issued.asBool { failures += 1; if failures <= 12 { XCTFail("sample \(k) issued: web \(s.issued.asBool)") }; continue }
            if let d = r.difference(expected) { failures += 1; if failures <= 12 { XCTFail("sample \(k): \(d)") } }
        }
        XCTAssertGreaterThan(issued, 20)
        XCTAssertEqual(failures, 0)
    }
}


extension ArmyOrdersTests {
    func testDiplomacyRevalidationKeepsNeutralReturnRoute() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let r = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/army-orders.json"))).samples[0].input.clone()
        let graph = try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin")))
        let oldBridge = Armies.bridge
        Armies.bridge = ForceBridge(graph: graph)
        defer { Armies.bridge = oldBridge }
        let provinces = r.world.provinces.asArray
        let army = try XCTUnwrap(r.world.armies.asArray.first), nation = army.nationId.asString
        let neutral = try XCTUnwrap(r.world.nations.asArray.map(\.id.asString).first {
            $0 != nation && !RunWindow.atWar(r, nation, $0) && !RunWindow.access(r, nation, $0)
        })
        let from = try XCTUnwrap(provinces.indices.compactMap { graph.targetCell(province: $0) }.first)
        let route = try XCTUnwrap(provinces.indices.lazy.compactMap { p -> [Int]? in
            guard let to = graph.targetCell(province: p),
                  let path = graph.path(from: from, to: to, allowSea: false, canEnterProvince: { _ in true }),
                  Set(path.nodes.map { graph.provinces[$0] }).count >= 3 else { return nil }
            return path.nodes
        }.first)
        let start = Int(graph.provinces[route[0]]), end = Int(graph.provinces[route.last!])
        for cell in route {
            let p = Int(graph.provinces[cell])
            provinces[p].controller = JS(p == start || p == end ? nation : neutral)
        }
        r.regimes = .object(); r.regimes.enabled = JS(true)
        army.provinceId = provinces[start].id.clone(); army.status = JS("retreating")
        r.world.armies = .array([army])
        let travel = r.armyPositions.records[army.id.asString]
        travel.nodes = .array(route.map { JS(Int(graph.ids[$0])) })
        travel.leg = JS(0); travel.status = JS("moving")

        War26.invalidateRoutes(r)
        XCTAssertEqual(r.armyPositions.records[army.id.asString].status.asString, "moving")
        let relations = r.world.statecraft.relations
        let relation = Wars.relation(r, nation, neutral) ?? .object()
        if relation.a.isNull {
            relation.a = JS(nation); relation.b = JS(neutral)
            relations.push(relation)
        }
        relation.status = JS("war")
        War26.invalidateRoutes(r)
        XCTAssertEqual(r.armyPositions.records[army.id.asString].status.asString, "halted")
    }

    func testLiveRunRetainsDefenderAndHonorsPlayerTakeover() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/army-orders.json")))
        let r = golden.samples[0].input.clone()
        let graph = try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin")))
        let oldBridge = Armies.bridge
        Armies.bridge = ForceBridge(graph: graph)
        let oldBorders = CombatReader.borders
        CombatReader.borders = Array(repeating: [], count: r.world.provinces.length)
        defer { Armies.bridge = oldBridge; CombatReader.borders = oldBorders }
        let nation = try XCTUnwrap(r.world.nations.asArray.first { !ArmyOrders.enemies(r, $0.id.asString).isEmpty }).id.asString
        let enemy = try XCTUnwrap(ArmyOrders.enemies(r, nation).first).nation
        let provinces = r.world.provinces.asArray
        let pair = provinces.indices.lazy.compactMap { p -> (Int, Int)? in
            guard graph.targetCell(province: p) != nil else { return nil }
            for neighbor in provinces[p].neighbors.asArray {
                if let q = provinces.firstIndex(where: { $0.id.asString == neighbor.asString }), graph.targetCell(province: q) != nil { return (p, q) }
            }
            return nil
        }.first
        let (p, q) = try XCTUnwrap(pair)
        // Rightful owners follow the controllers: no land counts as lost (收复失地 targets are tested apart).
        for province in provinces { province.controller = JS(enemy); province.legalOwner = JS(enemy) }
        provinces[p].controller = JS(nation); provinces[p].legalOwner = JS(nation)
        r.world.armies.asArray = Array(r.world.armies.asArray.prefix(3))
        XCTAssertEqual(r.world.armies.length, 3)
        r.forceContacts.pairs = .array(); r.voyages.manualArmies = .array()
        r.regimes = .object(); r.regimes.enabled = JS(true)
        for (i, a) in r.world.armies.asArray.enumerated() {
            let at = i == 2 ? q : p, id = a.id.asString
            let cell = try XCTUnwrap(graph.targetCell(province: at))
            a.nationId = JS(i == 2 ? enemy : nation); a.troops = JS(i == 0 ? 2000 : 1000); a.status = JS("idle")
            a.provinceId = provinces[at].id.clone()
            r.reorganization.active.delete(id)
            let travel = r.armyPositions.records[id]
            travel.version = JS(1); travel.origin = provinces[at].center.clone(); travel.nodes = .array([JS(Int(graph.ids[cell]))])
            travel.leg = JS(0); travel.offset = JS(0); travel.crossed = JS(false); travel.status = JS("arrived")
            r.armyAutonomy.armies[id].nextTick = JS(0); r.armyAutonomy.armies[id].targetId = .null
        }
        let id = r.world.armies[0].id.asString
        let before = r.armyPositions.records[id].json
        ArmyOrders.selection(r, [id])
        // Homeland remains, but this province has no land battle and the border reader may be empty.
        // Empty regular candidates go idle in place. They are not pinned as a garrison and not sent home.
        XCTAssertEqual(r.armyAutonomy.armies[id].decision.asString, "waiting")
        XCTAssertTrue(r.armyAutonomy.armies[id].targetId.isNull)
        XCTAssertEqual(r.armyPositions.records[id].json, before)
        r.voyages.manualArmies = .array([JS(id)])
        ArmyOrders.selection(r, [id])
        XCTAssertEqual(r.armyAutonomy.armies[id].decision.asString, "manual")
        XCTAssertEqual(r.armyPositions.records[id].json, before)
        // Last province lost: the state collapses and its positive-strength armies are removed
        // the same tick. They are not left idle and not ordered onto enemy land.
        provinces[p].controller = JS(enemy); provinces[p].legalOwner = JS(nation)
        r.voyages.manualArmies = .array(); r.armyAutonomy.armies[id].nextTick = JS(0)
        Government.reconcileContinuity(r)
        let fallen = r.world.armies.asArray.first { $0.id.asString == id }!
        XCTAssertEqual(fallen.status.asString, "destroyed")
        XCTAssertEqual(fallen.troops.asNumber, 0)
        XCTAssertEqual(r.armyPositions.records[id].status.asString, "halted")
        ArmyOrders.selection(r, [id])
        XCTAssertNotEqual(r.armyAutonomy.armies[id].decision.asString, "attacking")
        XCTAssertNotEqual(r.armyPositions.records[id].status.asString, "moving")
    }
}

extension ArmyOrdersTests {
    /// 平叛：本作世界里内战（叛乱、独立）的敌国也是军队的作战目标；原作规则（web 对照）仍只认常规战争。
    /// 原先内战两边的军队互不进攻，内战永不结束，十余年后各国挂满内战、不再对外宣战，全图军队停摆。
    func testAppWorldsFightInternalWars() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/army-orders.json")))
        let r = golden.samples[0].input.clone()
        let nation = try XCTUnwrap(r.world.nations.asArray.first { !ArmyOrders.enemies(r, $0.id.asString).isEmpty }).id.asString
        let war = try XCTUnwrap(ArmyOrders.enemies(r, nation).first)
        let campaign = try XCTUnwrap(r.nativeWars.campaigns.asArray.first { $0.id.asInt == war.campaign })
        let internalWar = JS.object(); internalWar.casusBelliId = JS(14); internalWar.legacyType = JS(2)
        campaign.internal = internalWar
        // 原作规则：内战不在常规战争之列。
        r.regimes = .null
        XCTAssertFalse(ArmyOrders.enemies(r, nation).contains { $0.nation == war.nation && $0.campaign == war.campaign })
        // 本作世界：内战敌国照样出兵。
        r.regimes = .object(); r.regimes.enabled = JS(true)
        XCTAssertTrue(ArmyOrders.enemies(r, nation).contains { $0.nation == war.nation && $0.campaign == war.campaign })
    }
}
