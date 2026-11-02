import XCTest
@testable import LieguojiCore

final class TerrainPresentationTests: XCTestCase {
    func testBrushProtectsLandAndSeaAndClampsHeight() {
        func paint(_ current: Double, _ target: Double, _ protect: Bool) -> UInt8 {
            TerrainBrush.height(current: current, target: target, delta: 0, falloff: 1, strength: 2, softness: 1, protectCoast: protect)
        }
        XCTAssertEqual(paint(21, 0, true), 20)
        XCTAssertEqual(paint(18, 100, true), 19)
        XCTAssertLessThan(paint(21, 0, false), 20)
        XCTAssertGreaterThan(paint(18, 100, false), 19)
        XCTAssertEqual(paint(98, 200, false), 100)
        XCTAssertEqual(paint(2, -100, false), 0)
    }

    func testBrushEdgeAndStrength() {
        func paint(_ falloff: Double, _ strength: Double, _ softness: Double) -> UInt8 {
            TerrainBrush.height(current: 30, target: 80, delta: 0, falloff: falloff, strength: strength, softness: softness, protectCoast: false)
        }
        XCTAssertEqual(paint(0, 2, 1), 30)
        XCTAssertGreaterThan(paint(1, 2, 1), paint(1, 0.2, 1))
        XCTAssertGreaterThan(paint(0.5, 1, 0.3), paint(0.5, 1, 2))
    }

    func testReliefSharesLightingWithoutChangingGeography() {
        let map = WorldMapTests.map
        let light = MapLayers.vertexHillshade(map)
        XCTAssertEqual(light.count, map.vertices.count / 2)
        var shared: [UInt64: Float] = [:]
        for v in light.indices {
            XCTAssertTrue(light[v].isFinite && light[v] >= 0.819 && light[v] <= 1.141)
            let key = UInt64(map.vertices[v * 2].bitPattern) << 32 | UInt64(map.vertices[v * 2 + 1].bitPattern)
            if let previous = shared[key] { XCTAssertEqual(previous, light[v]) }
            shared[key] = light[v]
        }
        var flat = map
        flat.elevation = Array(repeating: 30, count: flat.cellCount)
        let flatLight = MapLayers.vertexHillshade(flat)
        XCTAssertTrue(flatLight.allSatisfy { $0 == 1 })
        XCTAssertEqual(map.vertices, flat.vertices)
        XCTAssertEqual(map.province, flat.province)
    }
}
