import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/army-ai-golden.test.ts): two years of a web
/// world at war; every 15 days a full sweep of the five-army batch cursor on a copy (as it stands, and
/// with every retry timer expired). Each batch lists the armies it changed; Swift runs the batches in
/// sequence on its own state.
private struct ArmyAIGolden: Decodable {
    struct Change: Decodable {
        let index: Int; let army: ArmyAIWorld.Army
        init(from decoder: Decoder) throws { var c = try decoder.unkeyedContainer(); index = try c.decode(Int.self); army = try c.decode(ArmyAIWorld.Army.self) }
    }
    struct Batch: Decodable { let cursor: Int; let changes: [Change] }
    struct Sample: Decodable { let input: ArmyAIWorld; let batches: [Batch] }
    let statics: ArmyAIStatic
    let samples: [Sample]
}

final class ArmyAITests: XCTestCase {
    func testArmyOrdersMatchTheWebEngine() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let graph = try TravelGraph(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/travel.bin")))
        let golden = try JSONDecoder().decode(ArmyAIGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/army-ai.json")))
        let engine = ArmyAutonomy(statics: golden.statics, graph: graph)
        let savedTargets = ArmyAutonomy.originalRegularTargets
        ArmyAutonomy.originalRegularTargets = false
        defer { ArmyAutonomy.originalRegularTargets = savedTargets }
        var checked = 0, orders = 0, failures = 0
        for (k, s) in golden.samples.enumerated() {
            let travels = s.input.armies.map { ArmyTravel(record: $0.travel, graph: graph) }
            if travels.contains(where: { $0 == nil }) { continue }
            var w = s.input, t = travels.map { $0! }
            for (b, batch) in s.batches.enumerated() {
                let before = w
                engine.issueBatch(&w, travels: &t)
                checked += 1
                XCTAssertEqual(w.cursor, batch.cursor, "cursor, sample \(k) batch \(b)")
                var expected = before.armies
                for c in batch.changes { expected[c.index] = c.army }
                for (i, (got, want)) in zip(w.armies, expected).enumerated() {
                    if want.travel != before.armies[i].travel { orders += 1 }
                    XCTAssertEqual(got.travel, want.travel, "travel of \(want.id), sample \(k) batch \(b)")
                    XCTAssertEqual(got.status, want.status, "status of \(want.id), sample \(k) batch \(b)")
                    XCTAssertEqual(got.row, want.row, "decision of \(want.id), sample \(k) batch \(b)")
                    if got != want { failures += 1 }
                }
                if failures > 8 { return }
                // Continue from the web state so one difference does not cascade.
                w.armies = expected
                t = expected.map { ArmyTravel(record: $0.travel, graph: graph) ?? t[0] }
            }
        }
        XCTAssertGreaterThan(checked, 100)
        XCTAssertGreaterThan(orders, 20)
    }

    func testGarrisonRandomIsAUnitStream() {
        let r = ArmyAutonomy.garrisonRandom("421730/force-1/3/garrison47")
        let a = r(), b = r()
        XCTAssertTrue(a >= 0 && a < 1 && b >= 0 && b < 1 && a != b)
    }
}


extension ArmyAITests {
    func testNativeBatchKeepsAFrontGuardWithoutTakingManualOrders() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let graph = try TravelGraph(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/travel.bin")))
        let golden = try JSONDecoder().decode(ArmyAIGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/army-ai.json")))
        let pair = golden.statics.provinces.indices.lazy.compactMap { p -> (Int, Int)? in
            guard graph.targetCell(province: p) != nil else { return nil }
            guard let q = golden.statics.provinces[p].neighbors.first(where: { graph.targetCell(province: $0) != nil }) else { return nil }
            return (p, q)
        }.first
        let (p, q) = try XCTUnwrap(pair)
        let pc = try XCTUnwrap(graph.targetCell(province: p)), qc = try XCTUnwrap(graph.targetCell(province: q))
        var world = try XCTUnwrap(golden.samples.first).input
        let template = try XCTUnwrap(world.armies.first)
        world.owners = Array(repeating: 1, count: world.owners.count); world.owners[p] = 0
        world.wars = [[0, 1]]; world.alliances = []; world.vassals = []
        world.campaigns = [.init(id: 1, ended: false, internal: false,
                                participants: [.init(nation: 0, side: 0), .init(nation: 1, side: 1)])]
        world.armies = (0..<3).map { i in
            var a = template
            let cell = i == 2 ? qc : pc, point = graph.centers[cell]
            a.id = "guard-test-\(i)"; a.nation = i == 2 ? 1 : 0; a.troops = i == 0 ? 2000 : 1000
            a.home = i == 2 ? q : p; a.anchor = a.home; a.manual = false; a.busy = false; a.engaged = false
            a.status = "idle"; a.row = .init()
            a.travel = .init(version: 2, origin: .init(x: point.x, y: point.y), destination: nil,
                             nodes: [Int(graph.ids[cell])], leg: 0, offset: 0, crossed: false, status: "arrived")
            return a
        }
        let travel = world.armies.map { ArmyTravel(record: $0.travel, graph: graph)! }
        let engine = ArmyAutonomy(statics: golden.statics, graph: graph)
        let saved = ArmyAutonomy.temper; ArmyAutonomy.temper = { _ in 1.4 }
        defer { ArmyAutonomy.temper = saved }
        var context = ArmyAutonomy.Context(engine: engine, w: world, travels: travel)
        context.run([0])
        XCTAssertEqual(context.w.armies[0].row.decision, "garrison")
        XCTAssertEqual(context.w.armies[0].row.garrison, p)
        XCTAssertEqual(context.travels[0], travel[0])
        world.armies[0].manual = true
        context = ArmyAutonomy.Context(engine: engine, w: world, travels: travel)
        context.run([0])
        XCTAssertEqual(context.w.armies[0].row.decision, "manual")
        XCTAssertEqual(context.travels[0], travel[0])
    }

    func testPassingBattleRetargetsTheCurrentProvince() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let graph = try TravelGraph(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/travel.bin")))
        let golden = try JSONDecoder().decode(ArmyAIGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/army-ai.json")))
        let pair = golden.statics.provinces.indices.lazy.compactMap { p -> (Int, Int)? in
            guard graph.targetCell(province: p) != nil else { return nil }
            guard let q = golden.statics.provinces[p].neighbors.first(where: { graph.targetCell(province: $0) != nil }) else { return nil }
            return (p, q)
        }.first
        let (p, q) = try XCTUnwrap(pair)
        let pc = try XCTUnwrap(graph.targetCell(province: p))
        var world = try XCTUnwrap(golden.samples.first).input
        let template = try XCTUnwrap(world.armies.first)
        world.owners = Array(repeating: 0, count: world.owners.count)
        world.wars = [[0, 1]]; world.alliances = []; world.vassals = []
        world.campaigns = [.init(id: 7, ended: false, internal: false, participants: [.init(nation: 0, side: 0), .init(nation: 1, side: 1)])]
        let point = graph.centers[pc]
        world.armies = (0..<2).map { i in
            var a = template
            a.id = "battle-\(i)"; a.nation = i; a.troops = 1000; a.home = p; a.anchor = p
            a.manual = false; a.busy = false; a.engaged = false; a.status = i == 0 ? "idle" : "idle"
            a.row = i == 0 ? .init(target: q) : .init()
            a.travel = .init(version: 1, origin: .init(x: point.x, y: point.y), destination: nil,
                             nodes: [Int(graph.ids[pc]), Int(graph.ids[pc])], leg: 0, offset: 0, crossed: false, status: i == 0 ? "moving" : "arrived")
            return a
        }
        let travel = world.armies.map { ArmyTravel(record: $0.travel, graph: graph)! }
        let saved = ArmyAutonomy.originalRegularTargets
        ArmyAutonomy.originalRegularTargets = true
        defer { ArmyAutonomy.originalRegularTargets = saved }
        var context = ArmyAutonomy.Context(engine: ArmyAutonomy(statics: golden.statics, graph: graph), w: world, travels: travel)
        context.run([0])
        XCTAssertEqual(context.w.armies[0].row.decision, "attacking")
        XCTAssertEqual(context.w.armies[0].row.target, p)
        XCTAssertEqual(context.w.armies[0].row.campaign, 7)
        XCTAssertEqual(context.travels[0].status, .halted)
    }

    func testRegularCandidatesAreInvadedHomeAndBorderOnly() {
        XCTAssertEqual(ArmyAutonomy.Context.regularCandidateIds(invaded: [3, 3], borders: [8, 3, 1]), [3, 8, 1])
    }
}
