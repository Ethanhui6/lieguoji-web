import XCTest
import Foundation
@testable import LieguojiCore

/// The device-built preview world: the ported generators laid onto the bundled grid geometry.
final class PreviewTests: XCTestCase {
    func testPreviewWorldHasTheRequestedProvincesAndCapitals() throws {
        let world = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let inputs = PreviewWorld.Inputs(base: try WorldMap.load(directory: world), grid: try TerrainGraph(data: Data(contentsOf: world.appendingPathComponent("grid20k.bin"))),
                                         document: try TerrainDocument(data: Data(contentsOf: world.appendingPathComponent("doc20k.bin"))))
        let started = Date()
        let map = PreviewWorld.build(inputs, seed: "421730", template: "continents", nations: 8, cities: 80)
        print("preview built in", Date().timeIntervalSince(started), "s")
        XCTAssertEqual(map.meta.provinces.count, 80)
        XCTAssertEqual(map.meta.nations.count, 8)
        XCTAssertEqual(map.meta.cities.count, 8)
        XCTAssertEqual(map.seaRGBA.count, map.seaWidth * map.seaHeight * 4)
        let land = map.elevation.filter { $0 >= 20 }.count
        XCTAssertGreaterThan(land, 1000)
        XCTAssertEqual(map.province.indices.filter { map.elevation[$0] >= 20 && map.province[$0] < 0 }.count, 0, "every land cell has a province")
    }
}
