import XCTest
@testable import LieguojiCore

final class BorderCurveTests: XCTestCase {
    func testChainJoinsSegmentsIntoOneLoop() {
        let square = [BorderCurve.Segment(0, 0, 10, 0), BorderCurve.Segment(10, 10, 10, 0), BorderCurve.Segment(10, 10, 0, 10), BorderCurve.Segment(0, 10, 0, 0)]
        let lines = BorderCurve.chain(square)
        XCTAssertEqual(lines.count, 1)
        XCTAssertEqual(lines[0].count, 5)
        XCTAssertEqual(lines[0].first, lines[0].last)
    }
    func testSmoothRoundsCornersAndKeepsOpenEnds() {
        let open = BorderCurve.chain([BorderCurve.Segment(0, 0, 10, 0), BorderCurve.Segment(10, 0, 10, 10)])
        let flat = BorderCurve.smooth(open)[0]
        XCTAssertGreaterThan(flat.count, 6)
        // Open lines (borders running into the coast) end exactly on their end points.
        XCTAssertEqual(flat[0], 0, accuracy: 0.001); XCTAssertEqual(flat[1], 0, accuracy: 0.001)
        XCTAssertEqual(flat[flat.count - 2], 10, accuracy: 0.001); XCTAssertEqual(flat[flat.count - 1], 10, accuracy: 0.001)
        // The corner (10, 0) is cut: no sample sits on it.
        for i in stride(from: 2, to: flat.count - 2, by: 2) { XCTAssertFalse(abs(flat[i] - 10) < 0.01 && abs(flat[i + 1]) < 0.01) }
    }
    func testPoliticalPerimeterIncludesWaterAndExcludesInternalEdges() {
        let map = WorldMapTests.map
        let lines = MapLayers.stateEdges(map)
        var expected = [Int: Int](), shoreEdges = 0
        for edge in map.edges {
            func owner(_ c: Int32) -> Int? {
                guard c >= 0, map.isLand(Int(c)) else { return nil }
                return map.nation(ofCell: Int(c))
            }
            let a = owner(edge.a), b = owner(edge.b)
            if a == b { continue }
            if a == nil || b == nil { shoreEdges += 1 }
            for n in [a, b].compactMap({ $0 }) { expected[n, default: 0] += 1 }
        }
        XCTAssertGreaterThan(shoreEdges, 0)
        XCTAssertEqual(lines.mapValues { $0.count }, expected)
        // Turning a formerly owned cell into water must expose its neighbours' boundary.
        var edited = map
        let boundaryCells = Set(map.edges.filter { e in
            guard e.a >= 0, e.b >= 0 else { return true }
            return !map.isLand(Int(e.a)) || !map.isLand(Int(e.b)) || map.nation(ofCell: Int(e.a)) != map.nation(ofCell: Int(e.b))
        }.flatMap { [Int($0.a), Int($0.b)] })
        let cell = try! XCTUnwrap((0..<map.cellCount).first { map.nation(ofCell: $0) != nil && map.isLand($0) && !boundaryCells.contains($0) })
        edited.elevation[cell] = 0
        XCTAssertNotEqual(MapLayers.stateEdges(edited).mapValues { $0.count }, lines.mapValues { $0.count })
    }
}
