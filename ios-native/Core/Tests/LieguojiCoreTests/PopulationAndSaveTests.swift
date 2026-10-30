import XCTest
@testable import LieguojiCore
final class PopulationAndSaveTests: XCTestCase {
    func testOriginalPopulationInitialization() throws {
        let input = NativePopulation.Input(biomes: [0,6,11],perCellFactor: 100,growthRate: 1,statePercentage: 0.5,provinceRandom: 1)
        let result = try NativePopulation.initialize(input)
        XCTAssertEqual(result.maximum,6550); XCTAssertEqual(result.population,3275)
        var war = input; war.atWar = true
        XCTAssertEqual(try NativePopulation.initialize(war).population,3176)
        var locked = input; locked.maximumLocked = true; locked.oldMaximum = 1000; locked.oldPopulation = 10
        XCTAssertEqual(try NativePopulation.initialize(locked).population,300)
        var bad = input; bad.biomes = [-1]
        XCTAssertThrowsError(try NativePopulation.initialize(bad))
        bad = input; bad.growthRate = .infinity
        XCTAssertThrowsError(try NativePopulation.initialize(bad))
    }
    func testSaveRestoreBackupAndVersionRejection() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = NativeSaveStore(directory: directory,rulesVersion: "test-1")
        let id = UUID()
        try await store.save(["population":3275],id: id)
        try await store.save(["population":3176],id: id)
        let restored = try await store.load([String:Int].self,id: id)
        XCTAssertEqual(restored,["population":3176])
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent(id.uuidString+".json.backup").path))
        let incompatible = NativeSaveStore(directory: directory,rulesVersion: "test-2")
        do { _ = try await incompatible.load([String:Int].self,id: id); XCTFail("Must reject incompatible rules") }
        catch NativeSaveStore.Failure.unsupportedVersion {}
        let unchanged = try await store.load([String:Int].self,id: id)
        XCTAssertEqual(unchanged,restored)
    }
}
