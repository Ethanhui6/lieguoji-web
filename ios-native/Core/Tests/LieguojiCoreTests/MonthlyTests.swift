import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples exported from the web engine (src/native-export/monthly-golden.test.ts): a year of a
/// real web world; at each month boundary every nation's treasury and destiny inputs and results.
private struct MonthlyGolden: Decodable {
    struct Province: Decodable { let province: Int; let population: Int; let capacity: Int; let cells: Int; let local: Double; let resources: [Treasury.Resource] }
    struct DestinyIn: Decodable { let destiny: Double; let decrease: Double; let manifestCount: Int; let manifest: Bool; let seed: UInt32; let lastMonth: Int }
    struct Input: Decodable {
        let gold: Int; let lastMonth: Int; let ethnic: String; let goldProduction: Double; let tax: Double; let central: Double; let fee: Int
        let provinces: [Province]; let destiny: DestinyIn; let ownedPopulation: Int; let ownedCapacity: Int; let administrative: Double?
    }
    struct Result: Decodable { let gold: Int; let goldPerMonth: Int; let goldBattleModifier: Double; let destiny: Double; let decrease: Double; let manifestCount: Int; let seed: UInt32 }
    struct Month: Decodable { let day: Int; let worldProvinces: Int; let inputs: [Input]; let results: [Result] }
    let months: [Month]
}

final class MonthlyTests: XCTestCase {
    func testTreasuryAndDestinyMatchTheWebEngineForAYear() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden/monthly.json")
        let golden = try JSONDecoder().decode(MonthlyGolden.self, from: Data(contentsOf: url))
        XCTAssertEqual(golden.months.count, 12)
        var resets = 0
        for m in golden.months {
            let month = m.day / 30
            for (n, (i, r)) in zip(i: m.inputs, r: m.results).enumerated() {
                // civilization47-fiscal settleFiscalMonth47
                if i.lastMonth < month && !i.provinces.isEmpty {
                    let incomes = i.provinces.map {
                        Treasury.provinceIncome(Treasury.ProvinceInput(population: $0.population, capacity: $0.capacity, cells: $0.cells, resources: $0.resources, local: $0.local),
                                                ethnic: i.ethnic, destiny: i.destiny.destiny, nationProvinces: i.provinces.count, worldProvinces: m.worldProvinces)
                    }
                    let s = Treasury.settle(gold: i.gold, incomes: incomes, tax: i.tax, central: i.central, armyCost: i.fee, production: i.goldProduction, ethnic: i.ethnic)
                    XCTAssertEqual(s.gold, r.gold, "gold of nation \(n) on day \(m.day)")
                    XCTAssertEqual(s.goldPerMonth, r.goldPerMonth, "income of nation \(n) on day \(m.day)")
                    XCTAssertEqual(s.goldBattleModifier, r.goldBattleModifier, "battle factor of nation \(n) on day \(m.day)")
                }
                // destiny20-state settleDestinyMonth: after the treasury, with the new gold.
                var d = Destiny.State(destiny: i.destiny.destiny, decrease: i.destiny.decrease, manifestCount: i.destiny.manifestCount, manifest: i.destiny.manifest, seed: i.destiny.seed, lastMonth: i.destiny.lastMonth)
                if i.destiny.lastMonth < month && i.ownedCapacity > 0 {
                    let ratio = Native.fr(Native.fr(Double(i.ownedPopulation)) / Native.fr(Double(i.ownedCapacity)))
                    if Destiny.month(&d, populationRatio: ratio, gold: r.gold, leaderAdministrative: i.administrative).reset { resets += 1 }
                }
                XCTAssertEqual(d.destiny, r.destiny, "destiny of nation \(n) on day \(m.day)")
                XCTAssertEqual(d.decrease, r.decrease); XCTAssertEqual(d.manifestCount, r.manifestCount); XCTAssertEqual(d.seed, r.seed)
            }
        }
        _ = resets
    }

    func testNativeRounding() {
        XCTAssertEqual(Native.roundInt(2.5), 2); XCTAssertEqual(Native.roundInt(3.5), 4); XCTAssertEqual(Native.roundInt(-2.5), -2); XCTAssertEqual(Native.roundInt(-3.5), -4)
        XCTAssertEqual(Native.iadd(2147483647, 1), -2147483648)
        XCTAssertEqual(Native.idiv(-7, 2), -3)
        XCTAssertEqual(Destiny.threshold(0), 10); XCTAssertEqual(Destiny.threshold(3), 14)
    }
}

private func zip<A, B>(i: [A], r: [B]) -> Zip2Sequence<[A], [B]> { Swift.zip(i, r) }
