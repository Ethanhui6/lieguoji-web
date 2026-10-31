import XCTest
import Foundation
@testable import LieguojiCore

/// Golden destiny months and ruler skills from the web (src/native-export/destiny-golden.test.ts).
private struct DestinyGolden: Decodable {
    struct Leader: Decodable { let base: Persona.Skills; let traits: [Persona.TraitModifiers]; let skills: Persona.Skills }
    struct Input: Decodable {
        let destiny: Double; let decrease: Double; let manifestCount: Int; let manifest: Bool; let seed: UInt32; let lastMonth: Int
        let populations: [Double]; let capacities: [Double]; let gold: Double; let leader: Leader?
    }
    struct Output: Decodable { let destiny: Double; let decrease: Double; let manifestCount: Int; let manifest: Bool; let seed: UInt32; let lastMonth: Int; let reset: Bool; let cleared: Bool; let upper: Double }
    struct Sample: Decodable { let day: Int; let input: [Input]; let output: [Output] }
    let samples: [Sample]
}

final class DestinyTests: XCTestCase {
    func testDestinyAndSkillsMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JSONDecoder().decode(DestinyGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/destiny.json")))
        var skills = 0
        for (k, s) in golden.samples.enumerated() {
            for (n, i) in s.input.enumerated() {
                let o = s.output[n]
                if let l = i.leader { XCTAssertEqual(Persona.skills(base: l.base, traits: l.traits), l.skills, "skills, sample \(k) nation \(n)"); skills += 1 }
                var state = Destiny.State(destiny: i.destiny, decrease: i.decrease, manifestCount: i.manifestCount, manifest: i.manifest, seed: i.seed, lastMonth: i.lastMonth)
                let r = Destiny.settle(&state, day: s.day, populations: i.populations, capacities: i.capacities, gold: i.gold,
                                       administrative: i.leader.map { l in { Persona.skills(base: l.base, traits: l.traits).administrative } })
                XCTAssertEqual(state, Destiny.State(destiny: o.destiny, decrease: o.decrease, manifestCount: o.manifestCount, manifest: o.manifest, seed: o.seed, lastMonth: o.lastMonth), "destiny, sample \(k) nation \(n)")
                XCTAssertEqual(r?.reset ?? false, o.reset, "reset, sample \(k) nation \(n)")
                XCTAssertEqual(r?.cleared ?? false, o.cleared, "cleared, sample \(k) nation \(n)")
                if r != nil { XCTAssertEqual(state.destiny, o.upper, "upper, sample (k) nation (n)") }
            }
        }
        XCTAssertGreaterThan(skills, 100)
    }
}
