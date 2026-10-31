import XCTest
import Foundation
@testable import LieguojiCore

/// Reads the exported resources from the repository (ios-native/Resources/World).
private func worldDirectory() -> URL {
    URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().appendingPathComponent("Resources/World")
}

final class WorldMapTests: XCTestCase {
    static let map: WorldMap = try! WorldMap.load(directory: worldDirectory())

    func testDecodesTheExportedWorld() {
        let map = Self.map
        // Reference values from the TypeScript exporter (20k original grid, seed 421730, continents).
        XCTAssertEqual(map.width, 1600); XCTAssertEqual(map.height, 900)
        XCTAssertEqual(map.cellCount, 19928)
        XCTAssertEqual(map.vertices.count, 119004 * 2)
        XCTAssertEqual(map.edges.count, 59219)
        XCTAssertEqual((0..<map.cellCount).filter(map.isLand).count, 8202)
        XCTAssertEqual(map.meta.provinces.count, 80); XCTAssertEqual(map.meta.nations.count, 8); XCTAssertEqual(map.meta.cities.count, 80)
        XCTAssertEqual(Set(map.province.filter { $0 >= 0 }).count, 80)
        XCTAssertEqual(map.edges[0], WorldMap.Edge(a: 0, b: 1, x1: 13.737160682678223, y1: 0, x2: 7.6541547775268555, y2: 6.959091663360596))
        // A province cell is always land; the web's cell→province vote leaves a few land cells unowned.
        XCTAssertTrue((0..<map.cellCount).allSatisfy { map.province[$0] < 0 || map.isLand($0) })
        XCTAssertLessThan((0..<map.cellCount).filter { map.isLand($0) && map.province[$0] < 0 }.count, 82)
    }

    func testRejectsDamagedData() throws {
        let data = try Data(contentsOf: worldDirectory().appendingPathComponent("world.bin"))
        XCTAssertThrowsError(try WorldMap(binary: data.prefix(1000), meta: Self.map.meta)) { XCTAssertEqual($0 as? WorldMap.LoadError, .truncated) }
        var bad = data; bad[0] = 0
        XCTAssertThrowsError(try WorldMap(binary: bad, meta: Self.map.meta)) { XCTAssertEqual($0 as? WorldMap.LoadError, .badMagic) }
        XCTAssertThrowsError(try WorldMap(binary: data + Data([0, 0, 0, 0]), meta: Self.map.meta))
    }

    func testPickerFindsTheCellOfEveryCityAndProvinceCentre() {
        let map = Self.map, picker = CellPicker(map: map)
        for city in map.meta.cities {
            guard let cell = picker.cell(atX: city.x, y: city.y) else { return XCTFail("no cell under \(city.name)") }
            XCTAssertTrue(map.isLand(cell))
        }
        // Every cell's first vertex-centroid is inside that cell.
        for c in stride(from: 0, to: map.cellCount, by: 97) {
            let s = Int(map.offsets[c]), e = Int(map.offsets[c + 1])
            var x: Float = 0, y: Float = 0
            for v in s..<e { x += map.vertices[v * 2]; y += map.vertices[v * 2 + 1] }
            x /= Float(e - s); y /= Float(e - s)
            XCTAssertEqual(picker.cell(atX: x, y: y), c)
        }
        XCTAssertNil(picker.cell(atX: -1, y: 10))
    }

    func testMeshAndBorders() {
        let map = Self.map, mesh = CellMesh(map: map)
        let triangles = (0..<map.cellCount).reduce(0) { $0 + Int(map.offsets[$1 + 1] - map.offsets[$1]) - 2 }
        XCTAssertEqual(mesh.indices.count, triangles * 3)
        XCTAssertTrue(mesh.indices.allSatisfy { Int($0) < map.vertices.count / 2 })
        let borders = BorderMesh(map: map)
        for k in BorderMesh.Kind.allCases { XCTAssertGreaterThan(borders.vertices[k]!.count, 0); XCTAssertEqual(borders.vertices[k]!.count % 24, 0) }
        // A nation border separates two land cells of different nations.
        let e = map.edges.first(where: { BorderMesh.kind(map: map, edge: $0) == .nation })!
        XCTAssertNotEqual(map.nation(ofCell: Int(e.a)), map.nation(ofCell: Int(e.b)))
    }

    func testPaletteFollowsTheOriginalPreset() {
        let map = Self.map, colors = map.meta.nations.map { RGB(css: $0.color)! }
        XCTAssertEqual(RGB(css: "#80b1d3"), RGB(hex: 0x80B1D3)); XCTAssertNil(RGB(css: "80b1d3"))
        let land = (0..<map.cellCount).first(where: { map.nation(ofCell: $0) == 0 })!
        let c = MapPalette.cellColor(map: map, cell: land, mode: .political, nationColors: colors)
        let gray = MapPalette.heightGray(map.elevation[land])
        XCTAssertEqual(c.r, MapPalette.linearToSrgb(gray + (MapPalette.srgbToLinear(colors[0].r) - gray) * 0.8), accuracy: 1e-6)
        let sea = (0..<map.cellCount).first(where: { !map.isLand($0) })!
        XCTAssertEqual(MapPalette.cellColor(map: map, cell: sea, mode: .political, nationColors: colors), MapPalette.cellColor(map: map, cell: sea, mode: .terrain, nationColors: colors))
        for x: Float in [0, 0.002, 0.5, 1] { XCTAssertEqual(MapPalette.linearToSrgb(MapPalette.srgbToLinear(x)), x, accuracy: 1e-5) }
    }
}

final class MapCameraTests: XCTestCase {
    let map = (width: 1600.0, height: 900.0), phone = (width: 390.0, height: 844.0)

    func testRoundTripAndAnchoredZoom() {
        let camera = MapCamera(centerX: 400, centerY: 300, scale: 2)
        let s = camera.toScreen(x: 410, y: 280, viewport: phone), w = camera.toWorld(x: s.x, y: s.y, viewport: phone)
        XCTAssertEqual(w.x, 410, accuracy: 1e-9); XCTAssertEqual(w.y, 280, accuracy: 1e-9)
        let bounds = MapCamera.scaleBounds(map: map, viewport: phone)
        let zoomed = camera.zoomed(by: 1.7, anchorX: 100, anchorY: 600, viewport: phone, bounds: bounds)
        let before = camera.toWorld(x: 100, y: 600, viewport: phone), after = zoomed.toWorld(x: 100, y: 600, viewport: phone)
        XCTAssertEqual(before.x, after.x, accuracy: 1e-9); XCTAssertEqual(before.y, after.y, accuracy: 1e-9)
        XCTAssertEqual(camera.zoomed(by: 1e6, anchorX: 0, anchorY: 0, viewport: phone, bounds: bounds).scale, bounds.upperBound)
        XCTAssertEqual(camera.zoomed(by: .nan, anchorX: 0, anchorY: 0, viewport: phone, bounds: bounds), camera)
    }

    func testCoverClampAndPan() {
        let cover = MapCamera.cover(map: map, viewport: phone)
        XCTAssertEqual(cover.scale, 844.0 / 900.0, accuracy: 1e-9)
        let far = MapCamera(centerX: -500, centerY: 5000, scale: cover.scale).clamped(map: map, viewport: phone)
        XCTAssertEqual(far.centerX, 390.0 / 2 / cover.scale, accuracy: 1e-9); XCTAssertEqual(far.centerY, 450, accuracy: 1e-9)
        let moved = cover.panned(dx: 30, dy: -10)
        XCTAssertEqual(moved.centerX, cover.centerX - 30 / cover.scale, accuracy: 1e-12)
        let mid = MapCamera.interpolate(MapCamera(centerX: 0, centerY: 0, scale: 1), MapCamera(centerX: 10, centerY: 20, scale: 4), 0.5)
        XCTAssertEqual(mid.scale, 2, accuracy: 1e-12); XCTAssertEqual(mid.centerY, 10, accuracy: 1e-12)
    }
}
