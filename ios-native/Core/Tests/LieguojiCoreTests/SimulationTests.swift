import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples exported from the web engine (src/native-export/economy-golden.test.ts).
private struct EconomyGolden: Decodable {
    struct Day: Decodable { let population: [Int]; let grain: [Int]; let supplies: [Double] }
    let initial: EconomyStart
    let dayFactor: Double
    let days: [Day]
}

final class SimulationTests: XCTestCase {
    func testDailyEconomyMatchesTheWebEngineForSixtyDays() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Golden/economy.json")
        let golden = try JSONDecoder().decode(EconomyGolden.self, from: Data(contentsOf: url))
        XCTAssertEqual(golden.dayFactor, DailyEconomy.dayFactor)
        var s = SimState(start: golden.initial)
        for (d, expected) in golden.days.enumerated() {
            s.day += 1
            DailyEconomy.advance(&s, dayFactor: golden.dayFactor)
            XCTAssertEqual(s.provinces.map(\.population), expected.population, "population on day \(d + 1)")
            XCTAssertEqual(s.provinces.map(\.grain), expected.grain, "grain on day \(d + 1)")
            XCTAssertEqual(s.armies.map(\.supplies), expected.supplies, "army supplies on day \(d + 1)")
            DailyEconomy.originalArmyReset(&s)
        }
    }

    func testCalendarMatchesTheWebDates() {
        XCTAssertEqual(IsoDate.start.text, "公元1年1月1日")
        XCTAssertEqual(IsoDate.start.plus(days: 31), IsoDate(year: 1, month: 2, day: 1))
        XCTAssertEqual(IsoDate.start.plus(days: 365), IsoDate(year: 2, month: 1, day: 1))
        // Year 4 is a leap year: 29 February exists.
        XCTAssertEqual(IsoDate(year: 4, month: 2, day: 28).plus(days: 1), IsoDate(year: 4, month: 2, day: 29))
        XCTAssertEqual(IsoDate(year: 100, month: 2, day: 28).plus(days: 1), IsoDate(year: 100, month: 3, day: 1))
        XCTAssertEqual(IsoDate.start.plus(days: -1), IsoDate(year: 0, month: 12, day: 31))
        XCTAssertEqual(IsoDate(year: 0, month: 12, day: 31).text, "公元前1年12月31日")
        for n in [0, 1, 59, 365, 1460, 36524, 146097] { XCTAssertEqual(IsoDate.start.plus(days: n).plus(days: -n), IsoDate.start) }
    }

    func testSimulationActorAdvancesTheClock() async throws {
        let map = WorldMapTests.map
        let sim = Simulation(start: map.meta.economy)
        let s = await sim.advance(days: 3)
        XCTAssertEqual(s.day, 3); XCTAssertEqual(s.tick, 360); XCTAssertEqual(s.date, IsoDate(year: 1, month: 1, day: 4))
        XCTAssertTrue(s.armies.allSatisfy { $0.supplies == 100 })
        XCTAssertEqual(map.meta.economy.armies.count, 51)
    }
}
