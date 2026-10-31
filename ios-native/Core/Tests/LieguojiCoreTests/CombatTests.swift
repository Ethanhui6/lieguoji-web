import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/combat-golden.test.ts): a web world at war;
/// every other day one frame of the shared motion phase with contacts, and one volley in which every
/// engaged force is due.
private struct CombatGolden: Decodable {
    struct Step: Decodable { let seconds: Double; let elapsed: Double; let unused: Double }
    struct ForceOut: Decodable { let key: String; let travel: ArmyAIWorld.Travel; let status: String }
    struct MotionOut: Decodable { let forces: [ForceOut]; let contacts: [CombatWorld.Contact] }
    struct Motion: Decodable { let input: CombatWorld; let steps: [Step]; let output: MotionOut }
    struct Hit: Decodable { let attacker: String; let victim: String; let nativeDamage: Double }
    struct VForce: Decodable { let key: String; let troops: Int; let morale: Double; let status: String; let travel: ArmyAIWorld.Travel }
    struct VolleyOut: Decodable { let hits: [Hit]; let forces: [VForce]; let carry: [String: Double]; let losses: [String: Int]; let contacts: [CombatWorld.Contact] }
    struct VolleySample: Decodable { let input: CombatWorld; let inputs: CombatWorld.VolleyInputs; let due: [String]; let output: VolleyOut }
    let statics: CombatStatic
    let motion: [Motion]
    let volleys: [VolleySample]
}

final class CombatTests: XCTestCase {
    private func load() throws -> (CombatGolden, TravelGraph) {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let graph = try TravelGraph(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/travel.bin")))
        return (try JSONDecoder().decode(CombatGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/combat.json"))), graph)
    }

    func testMotionWithContactsMatchesTheWebEngine() throws {
        let (golden, graph) = try load()
        var failures = 0, contacts = 0
        for (k, m) in golden.motion.enumerated() {
            var w = m.input
            let tick = Double(w.tick), end = tick + Double(golden.statics.frameTicks)
            var now = tick, steps = [CombatGolden.Step]()
            while now < end {
                let out = w.advanceMotion(seconds: end - now, graph: graph, statics: golden.statics)
                steps.append(.init(seconds: end - now, elapsed: out.elapsed, unused: out.unused))
                now = out.unused == 0 ? end : now + out.elapsed
                if steps.count > 200 { break }
            }
            XCTAssertEqual(steps.map(\.elapsed), m.steps.map(\.elapsed), "event times, sample \(k)")
            let got = Dictionary(uniqueKeysWithValues: w.forces.map { ($0.key, $0) })
            for f in m.output.forces {
                guard let g = got[f.key] else { XCTFail("missing \(f.key), sample \(k)"); continue }
                XCTAssertEqual(g.travel, f.travel, "travel of \(f.key), sample \(k)")
                if f.key.hasPrefix("[\"army") { XCTAssertEqual(g.status, f.status, "status of \(f.key), sample \(k)") }
                if g.travel != f.travel { failures += 1 }
            }
            XCTAssertEqual(w.contacts, m.output.contacts, "contacts, sample \(k)")
            contacts += m.output.contacts.count
            if w.contacts != m.output.contacts { failures += 1 }
            if failures > 6 { return }
        }
        XCTAssertGreaterThan(contacts, 0)
    }

    func testVolleysMatchTheWebEngine() throws {
        let (golden, graph) = try load()
        var failures = 0, hits = 0
        for (k, v) in golden.volleys.enumerated() {
            var w = v.input
            let out = w.volley(due: v.due, inputs: v.inputs, graph: graph, statics: golden.statics)
            XCTAssertEqual(out.map { [$0.attacker, $0.victim] }, v.output.hits.map { [$0.attacker, $0.victim] }, "hit pairs, sample \(k)")
            XCTAssertEqual(out.map(\.damage), v.output.hits.map(\.nativeDamage), "damage, sample \(k)")
            hits += out.count
            let want = Dictionary(uniqueKeysWithValues: v.output.forces.map { ($0.key, $0) })
            for f in w.forces {
                guard let e = want[f.key] else { continue }
                let fleet = f.kind == "fleet"
                XCTAssertEqual(fleet ? f.hull : f.troops, e.troops, "strength of \(f.key), sample \(k)")
                XCTAssertEqual(fleet ? Double(f.crew) : f.morale, e.morale, "morale or crew of \(f.key), sample \(k)")
                XCTAssertEqual(f.status, e.status, "status of \(f.key), sample \(k)")
                XCTAssertEqual(f.travel, e.travel, "travel of \(f.key), sample \(k)")
                XCTAssertEqual(f.carry, v.output.carry[f.key] ?? 0, "carry of \(f.key), sample \(k)")
                XCTAssertEqual(f.losses, v.output.losses[f.key] ?? 0, "losses of \(f.key), sample \(k)")
                if (fleet ? f.hull : f.troops) != e.troops || f.status != e.status { failures += 1 }
            }
            XCTAssertEqual(w.contacts, v.output.contacts, "contacts after the volley, sample \(k)")
            if failures > 6 { return }
        }
        XCTAssertGreaterThan(hits, 0)
    }

    func testCollationOrdersKeysLikeICU() {
        XCTAssertTrue(Collate.less("[\"army\",\"force-1\"]", "[\"army\",\"force-12\"]"))
        XCTAssertTrue(Collate.less("[\"[\\\"army\\\",\\\"force-1\\\"]\"]", "[\"[\\\"army\\\",\\\"force-12\\\"]\"]"))
        XCTAssertTrue(Collate.less("[\"army\",\"force-9\"]", "[\"fleet\",\"fleet-1\"]"))
    }
}
