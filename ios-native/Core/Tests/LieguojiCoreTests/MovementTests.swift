import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/travel-export.test.ts): one march order per
/// nation through the real web session, then 120 days × 6 frames of the shared force motion phase.
private struct MovementGolden: Decodable {
    struct Army: Decodable { let id: String; let base: Double; let unitSpeed: Double; let cell: Int; let x: Double; let y: Double; let status: String }
    struct Order: Decodable { let army: Int; let province: Int; let nodes: [Int] }
    let startTick: Double; let secondsPerTick: Double; let frameTicks: Double
    let nations: [Int]; let controllers: [Int]; let armies: [Army]; let orders: [Order]; let frames: [[[Double]]]
}

final class MovementTests: XCTestCase {
    private func resources() -> URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Resources/World")
    }

    func testHypotMatchesV8() {
        XCTAssertEqual(jsHypot(3, 4), 5); XCTAssertEqual(jsHypot(0, 0), 0); XCTAssertEqual(jsHypot(-5, 12), 13)
    }

    func testMarchOrdersAndMotionMatchTheWebEngine() throws {
        let g = try TravelGraph(data: Data(contentsOf: resources().appendingPathComponent("travel.bin")))
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden/movement.json")
        let golden = try JSONDecoder().decode(MovementGolden.self, from: Data(contentsOf: url))

        // Orders: the province's target cell, then the plain Dijkstra path under the nation's access.
        var forces = [ArmyTravel](), armyOf = [Int](), homes = [Int]()
        for o in golden.orders {
            let a = golden.armies[o.army], nation = golden.nations[o.army]
            let start = try XCTUnwrap(g.cell(id: a.cell)), target = try XCTUnwrap(g.targetCell(province: o.province))
            let home = g.provinces[start] >= 0 ? golden.controllers[Int(g.provinces[start])] : -1
            let path = g.path(from: start, to: target) { q in golden.controllers[q] == nation || golden.controllers[q] == home }
            let nodes = try XCTUnwrap(path).nodes
            XCTAssertEqual(nodes.map { Int(g.ids[$0]) }, o.nodes, "path of army \(a.id)")
            forces.append(ArmyTravel(origin: TravelPoint(x: a.x, y: a.y), nodes: nodes)); armyOf.append(o.army); homes.append(home)
        }
        let rules = ForceMotion.Rules(
            canEnter: { f, cell in
                let q = Int(g.provinces[cell]); if q < 0 { return true }
                return golden.controllers[q] == golden.nations[armyOf[f]] || golden.controllers[q] == homes[f]
            },
            speed: { f, cell in
                let a = golden.armies[armyOf[f]]
                return ForceMotion.armySpeed(base: a.base, unitSpeed: a.unitSpeed, cell: cell, graph: g, secondsPerTick: golden.secondsPerTick)
            })
        for (n, expected) in golden.frames.enumerated() {
            ForceMotion.frame(&forces, graph: g, start: golden.startTick + Double(n) * golden.frameTicks, frameTicks: golden.frameTicks, rules: rules)
            for (i, row) in expected.enumerated() {
                let s = forces[i]
                XCTAssertEqual(Double(s.leg), row[0], "leg of order \(i) frame \(n)")
                XCTAssertEqual(s.offset, row[1], "offset of order \(i) frame \(n)")
                XCTAssertEqual(s.crossed ? 1 : 0, row[2], "crossed of order \(i) frame \(n)")
                XCTAssertEqual(Double(s.status.rawValue), row[3], "status of order \(i) frame \(n)")
                if s.offset != row[1] { return }
            }
        }
    }
}
