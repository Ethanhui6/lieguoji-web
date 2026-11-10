import XCTest
import Foundation
@testable import LieguojiCore

/// 开卷: the fields the reveal shader reads.
final class RevealFieldsTests: XCTestCase {
    func testInkRunsFromTheShoreAndColourFromTheCapital() throws {
        let world = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let map = try WorldMap.load(directory: world)
        let fields = MapLayers.revealFields(map)
        XCTAssertEqual(fields.count, map.vertices.count)
        XCTAssertTrue(fields.allSatisfy { $0 >= 0 && $0 <= 1 })
        // Corners shared with the sea stand lower than the corners inland.
        var shore = [Float](), inland = [Float]()
        var seaCorners = Set<UInt64>()
        func key(_ v: Int) -> UInt64 { UInt64(map.vertices[v * 2].bitPattern) << 32 | UInt64(map.vertices[v * 2 + 1].bitPattern) }
        for c in 0..<map.cellCount where !map.isLand(c) {
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) { seaCorners.insert(key(v)) }
        }
        for c in 0..<map.cellCount where map.isLand(c) {
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                if seaCorners.contains(key(v)) { shore.append(fields[v * 2]) } else { inland.append(fields[v * 2]) }
            }
        }
        XCTAssertFalse(shore.isEmpty)
        XCTAssertLessThan(shore.reduce(0, +) / Float(shore.count), inland.reduce(0, +) / Float(inland.count))
        // A state's colour begins at its capital and ends at its farthest corner.
        let nation = try XCTUnwrap(map.meta.nations.indices.first { map.meta.cities.indices.contains(map.meta.nations[$0].capital) })
        let city = map.meta.cities[map.meta.nations[nation].capital]
        var nearest: Float = 2, farthest: Float = -1
        for c in 0..<map.cellCount where map.isLand(c) && map.nation(ofCell: c) == nation {
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                let dx: Float = map.vertices[v * 2] - city.x, dy: Float = map.vertices[v * 2 + 1] - city.y
                if dx * dx + dy * dy < 900 { nearest = min(nearest, fields[v * 2 + 1]) }
                farthest = max(farthest, fields[v * 2 + 1])
            }
        }
        XCTAssertLessThan(nearest, 0.4)
        XCTAssertEqual(farthest, 1, accuracy: 0.001)
    }
}
