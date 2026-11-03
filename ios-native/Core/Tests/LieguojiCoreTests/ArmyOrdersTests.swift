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
    func testLiveRunRetainsDefenderAndHonorsPlayerTakeover() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let world = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/army-orders.json")))
        let r = golden.samples[0].input.clone()
        let graph = try TravelGraph(data: Data(contentsOf: world.appendingPathComponent("travel.bin")))
        let oldBridge = Armies.bridge; Armies.bridge = ForceBridge(graph: graph)
        defer { Armies.bridge = oldBridge }
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
        for province in provinces { province.controller = JS(enemy) }
        provinces[p].controller = JS(nation)
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
        XCTAssertEqual(r.armyAutonomy.armies[id].decision.asString, "garrison")
        XCTAssertEqual(r.armyAutonomy.armies[id].garrisonId.asString, provinces[p].id.asString)
        XCTAssertEqual(r.armyPositions.records[id].json, before)
        r.voyages.manualArmies = .array([JS(id)])
        ArmyOrders.selection(r, [id])
        XCTAssertEqual(r.armyAutonomy.armies[id].decision.asString, "manual")
        XCTAssertEqual(r.armyPositions.records[id].json, before)
    }
}
