import XCTest
import Foundation
@testable import LieguojiCore

/// Golden openings from the web (src/native-export/opening-golden.test.ts): capitals, territory,
/// cultures and names on generated partitions, for generated and historical naming.
private struct OpeningGolden: Decodable {
    struct Setup: Decodable { let mode: String; let enabled: [String] }
    struct Nation: Decodable { let cultureId: String; let religionId: String; let polity: String; let name: String; let sourceKey: String; let full: String }
    struct Sample: Decodable {
        let seed: String; let template: String; let cities: Int; let count: Int; let worldId: String; let setup: Setup; let heights: String
        let seeds: [Int]; let owners: [Int]; let nations: [Nation]; let cityNames: [String]; let cityCultures: [String]
    }
    let samples: [Sample]
}

final class OpeningTests: XCTestCase {
    func testOpeningMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent(), resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let doc = try TerrainDocument(data: Data(contentsOf: resources.appendingPathComponent("doc20k.bin")))
        let cultures = try JSONDecoder().decode([Opening.Culture].self, from: Data(contentsOf: resources.appendingPathComponent("cultures.json")))
        let golden = try JSONDecoder().decode(OpeningGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/opening.json")))
        var partitions = [String: [Regions.Region]]()
        for s in golden.samples {
            let label = "\(s.seed) \(s.template) \(s.cities) \(s.setup.mode)", key = "\(s.seed) \(s.template) \(s.cities)"
            let regions = try partitions[key] ?? XCTUnwrap(Regions.partition(doc, elevations: [UInt8](Data(base64Encoded: s.heights)!).map(Int.init), cities: s.cities)).regions
            partitions[key] = regions
            let layout = Opening.layout(regions, count: s.count)
            XCTAssertEqual(layout.seeds, s.seeds, "capitals, \(label)")
            XCTAssertEqual(layout.owners, s.owners, "territory, \(label)")
            let c = try XCTUnwrap(Opening.civilization(seed: s.worldId, count: s.count, owners: layout.owners, mode: s.setup.mode, enabled: s.setup.enabled, cultures: cultures))
            XCTAssertEqual(c.nations.map { [$0.cultureId, $0.religionId, $0.polity, $0.name, $0.sourceKey, $0.full] }, s.nations.map { [$0.cultureId, $0.religionId, $0.polity, $0.name, $0.sourceKey, $0.full] }, "nations, \(label)")
            XCTAssertEqual(c.cities.map(\.name), s.cityNames, "city names, \(label)")
            XCTAssertEqual(c.cities.map(\.culture), s.cityCultures, "city cultures, \(label)")
        }
    }
}
