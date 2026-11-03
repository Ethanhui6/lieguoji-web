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
}
