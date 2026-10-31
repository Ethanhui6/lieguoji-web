import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web engine (src/native-export/window-golden.test.ts): one military frame
/// (occupation, attack clock, volleys, motion with contacts) from a frame boundary, every 4 days of a war.
private struct WindowGolden: Decodable {
    struct Clock: Decodable {
        let secondsPerTick: Double; let now: Double; let rng: UInt32; let draws: Int; let deadlines: [String: Double]
        enum K: String, CodingKey { case secondsPerTick, now, rng, draws, deadlines }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            secondsPerTick = try c.decode(Double.self, forKey: .secondsPerTick); now = try c.decode(Double.self, forKey: .now)
            rng = try c.decode(UInt32.self, forKey: .rng); draws = try c.decode(Int.self, forKey: .draws)
            var list = try c.nestedUnkeyedContainer(forKey: .deadlines), out = [String: Double]()
            while !list.isAtEnd { var pair = try list.nestedUnkeyedContainer(); out[try pair.decode(String.self)] = try pair.decode(Double.self) }
            deadlines = out
        }
    }
    struct Input: Decodable {
        let world: CombatWorld; let clock: Clock; let sieges: [OccupationWorld.Siege]; let reorganize: Bool
        let homes: [MilitaryState.Home]; let efficiency: [String: MilitaryState.Combat]
    }
    struct Volley: Decodable { let at: Double; let due: [String]; let hits: Int; let losses: Int }
    struct Output: Decodable { let world: CombatWorld; let clock: Clock; let sieges: [OccupationWorld.Siege]; let volleys: [Volley] }
    struct Sample: Decodable { let input: Input; let output: Output }
    let statics: WindowStatic
    let samples: [Sample]
}

final class WindowTests: XCTestCase {
    func testMilitaryFramesMatchTheWebEngine() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let graph = try TravelGraph(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/travel.bin")))
        let golden = try JSONDecoder().decode(WindowGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/window.json")))
        let window = MilitaryWindow(graph: graph, statics: golden.statics)
        var failures = 0, volleys = 0, misses = 0
        for (k, sample) in golden.samples.enumerated() {
            let i = sample.input
            var s = MilitaryState(world: i.world, clock: AttackClock(secondsPerTick: i.clock.secondsPerTick, now: i.clock.now, rng: i.clock.rng, draws: i.clock.draws, deadlines: i.clock.deadlines),
                                  sieges: i.sieges, reorganize: i.reorganize, homes: i.homes, combat: i.efficiency)
            let got = window.frame(&s)
            let o = sample.output
            // The exported table covers the current and neighbouring provinces; a lookup outside it is counted.
            misses += s.misses
            XCTAssertEqual(got.map(\.due), o.volleys.map(\.due), "volley due sets, sample \(k)")
            XCTAssertEqual(got.map(\.hits), o.volleys.map(\.hits), "volley hits, sample \(k)")
            XCTAssertEqual(got.map(\.losses), o.volleys.map(\.losses), "volley losses, sample \(k)")
            XCTAssertEqual(s.clock.rng, o.clock.rng, "clock random, sample \(k)"); XCTAssertEqual(s.clock.draws, o.clock.draws)
            XCTAssertEqual(s.clock.deadlines, o.clock.deadlines, "deadlines, sample \(k)")
            XCTAssertEqual(s.world.owners, o.world.owners, "controllers, sample \(k)")
            XCTAssertEqual(s.sieges, o.sieges, "sieges, sample \(k)")
            XCTAssertEqual(s.world.contacts, o.world.contacts, "contacts, sample \(k)")
            let want = Dictionary(uniqueKeysWithValues: o.world.forces.map { ($0.key, $0) })
            XCTAssertEqual(Set(s.world.forces.map(\.key)), Set(want.keys), "living forces, sample \(k)")
            for f in s.world.forces {
                guard let e = want[f.key] else { continue }
                XCTAssertEqual(f.travel, e.travel, "travel of \(f.key), sample \(k)")
                XCTAssertEqual(f.troops, e.troops, "troops of \(f.key), sample \(k)")
                XCTAssertEqual(f.morale, e.morale, "morale of \(f.key), sample \(k)")
                XCTAssertEqual(f.status, e.status, "status of \(f.key), sample \(k)")
            }
            volleys += got.count
            if s.world.owners != o.world.owners || s.clock.rng != o.clock.rng || got.map(\.losses) != o.volleys.map(\.losses) { failures += 1; if failures > 5 { return } }
        }
        XCTAssertGreaterThan(volleys, 0)
        XCTAssertLessThan(misses, 3, "efficiency lookups outside the exported table")
    }
}
