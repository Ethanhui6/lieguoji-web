import XCTest
import Foundation
@testable import LieguojiCore

/// Golden musters from the web (src/native-export/muster-golden.test.ts): a copy of the world at war
/// moved to a month boundary every ten days for three years and mustered.
private struct MusterGolden: Decodable {
    struct Input: Decodable {
        let day: Int; let nextArmyId: Int; let seed: UInt32; let armyCount: Int
        let nations: [Muster.Nation]; let provinces: [Muster.Province]; let others: [Double]; let wars: [[Int]]; let armies: [Muster.Army]
    }
    struct History: Decodable { let lastMonth: Int?; let recent: [Int] }
    struct Output: Decodable {
        let created: [Muster.Created]; let disbanded: [String]; let populations: [Double]; let mobilizations: [History]
        let seed: UInt32; let nextArmyId: Int; let titles: [String]
    }
    struct Sample: Decodable { let input: Input; let output: Output }
    let units: [Muster.Unit]; let samples: [Sample]
}

final class MusterTests: XCTestCase {
    func testMusterMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let golden = try JSONDecoder().decode(MusterGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/muster.json")))
        XCTAssertEqual(golden.units.map(\.key), Muster.units.map(\.key))
        XCTAssertEqual(golden.units.map(\.name), Muster.units.map(\.name))
        for (k, s) in golden.samples.enumerated() {
            let i = s.input
            XCTAssertEqual(i.armies.count, i.armyCount)
            var w = Muster.World(day: i.day, nextArmyId: i.nextArmyId, seed: i.seed, nations: i.nations, provinces: i.provinces, armies: i.armies, others: i.others, wars: i.wars)
            let out = Muster.month(&w)
            XCTAssertEqual(out.created, s.output.created, "created, sample \(k)")
            XCTAssertEqual(out.disbanded, s.output.disbanded, "disbanded, sample \(k)")
            XCTAssertEqual(w.provinces.map(\.population), s.output.populations, "populations, sample \(k)")
            XCTAssertEqual(w.nations.map(\.lastMonth), s.output.mobilizations.map(\.lastMonth), "last mobilization, sample \(k)")
            XCTAssertEqual(w.nations.map(\.recent), s.output.mobilizations.map(\.recent), "recent mobilizations, sample \(k)")
            XCTAssertEqual(w.seed, s.output.seed, "seed, sample \(k)")
            XCTAssertEqual(w.nextArmyId, s.output.nextArmyId, "next army, sample \(k)")
            XCTAssertEqual(out.titles, s.output.titles, "chronicle, sample \(k)")
        }
    }
}
