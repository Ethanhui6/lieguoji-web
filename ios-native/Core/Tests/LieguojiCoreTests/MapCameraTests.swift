import XCTest
@testable import LieguojiCore
final class MapCameraTests: XCTestCase {
    func testZoomPreservesWorldPointUnderFingers() {
        var camera = MapCamera()
        let before = camera.world(screenX: 120, screenY: 200, width: 390, height: 844)
        camera.zoom(factor: 2, anchorX: 120, anchorY: 200, width: 390, height: 844)
        let after = camera.world(screenX: 120, screenY: 200, width: 390, height: 844)
        XCTAssertEqual(before.x, after.x, accuracy: 0.000001)
        XCTAssertEqual(before.y, after.y, accuracy: 0.000001)
    }
    func testPanningAndTileCulling() {
        var camera = MapCamera(x: 100, y: 100, scale: 2)
        camera.pan(dx: 40, dy: -20)
        XCTAssertEqual(camera.x, 80); XCTAssertEqual(camera.y, 110)
        XCTAssertTrue(camera.intersects(minX: 70, minY: 100, maxX: 90, maxY: 120, width: 100, height: 100))
        XCTAssertFalse(camera.intersects(minX: 200, minY: 200, maxX: 300, maxY: 300, width: 100, height: 100))
    }
    func testScaleLimitsAndInvalidInput() {
        var camera = MapCamera(scale: .nan)
        XCTAssertEqual(camera.scale, 1)
        camera.zoom(factor: 100, anchorX: 50, anchorY: 50, width: 100, height: 100)
        XCTAssertEqual(camera.scale, 8)
        let before = camera
        camera.pan(dx: .infinity, dy: 0)
        camera.zoom(factor: .nan, anchorX: 50, anchorY: 50, width: 100, height: 100)
        XCTAssertEqual(camera, before)
    }
}
