import XCTest
@testable import LieguojiCore

final class UnitKindsTests: XCTestCase {
    func testEveryKindHasTablesAndSpeed() {
        for k in UnitKinds.kinds {
            XCTAssertNotNil(Efficiency.tables[k.key], k.key)
            XCTAssertNotNil(CombatReader.unitSpeeds[k.key], k.key)
        }
        // The original's units keep their exact tables.
        XCTAssertEqual(Efficiency.tables["Cavalry"]?.power, 1.25)
        XCTAssertEqual(CombatReader.unitSpeeds["Shield"], 0.9)
    }
    func testCounters() {
        XCTAssertGreaterThan(UnitKinds.counter("Spear", "Cavalry"), 1)
        XCTAssertLessThan(UnitKinds.counter("Cavalry", "Spear"), 1)
        XCTAssertGreaterThan(UnitKinds.counter("Knight", "Archer"), 1)
        XCTAssertEqual(UnitKinds.counter("Elite", "Infantry"), 1)
        XCTAssertEqual(UnitKinds.counter("Unknown", "Infantry"), 1)
    }
    func testPickIsDeterministicAndCultural() {
        XCTAssertEqual(UnitKinds.pick(culture: "mongol", id: "force-7").key, UnitKinds.pick(culture: "mongol", id: "force-7").key)
        let picks = (0..<400).map { UnitKinds.pick(culture: "japanese", id: "force-\($0)").key }
        XCTAssertTrue(picks.contains("Samurai"))
        XCTAssertFalse(picks.contains("Keshig"))
        let steppe = (0..<400).filter { ["Cavalry", "HorseArcher", "HeavyCavalry", "Keshig"].contains(UnitKinds.pick(culture: "mongol", id: "force-\($0)").key) }.count
        XCTAssertGreaterThan(steppe, 160)
    }
}
