import XCTest
@testable import LieguojiCore

/// 1.13: the three map regressions found on the phone.
final class MapCameraRegressionTests: XCTestCase {
    private let map = (width: 1600.0, height: 900.0)
    private let phone = (width: 390.0, height: 844.0)

    /// 地图展开: zoomed all the way out, the whole map is on screen (1.12 stopped at covering the screen,
    /// which on a phone in portrait showed a quarter of the map at most).
    func testWholeMapIsReachable() {
        let b = MapCamera.scaleBounds(map: map, viewport: phone)
        let out = MapCamera(centerX: 3, centerY: 3, scale: b.lowerBound).clamped(map: map, viewport: phone)
        let topLeft = out.toScreen(x: 0, y: 0, viewport: phone), bottomRight = out.toScreen(x: map.width, y: map.height, viewport: phone)
        XCTAssertGreaterThanOrEqual(topLeft.x, -0.001); XCTAssertGreaterThanOrEqual(topLeft.y, -0.001)
        XCTAssertLessThanOrEqual(bottomRight.x, phone.width + 0.001); XCTAssertLessThanOrEqual(bottomRight.y, phone.height + 0.001)
        // The game still opens covering the screen, and that is inside the zoom range.
        let cover = MapCamera.cover(map: map, viewport: phone)
        XCTAssertGreaterThan(cover.scale, b.lowerBound)
        XCTAssertTrue(b.contains(cover.scale))
    }

    /// 查看都城: the camera moves and zooms even when it already looks at the capital from afar, and the
    /// capital lands in the upper part of the screen, clear of the page below.
    func testSpotlightAlwaysShowsTheCapital() {
        let b = MapCamera.scaleBounds(map: map, viewport: phone)
        let capital = (x: 820.0, y: 430.0)
        let looking = MapCamera(centerX: capital.x, centerY: capital.y, scale: b.lowerBound * 4)
        let target = MapCamera.spotlight(x: capital.x, y: capital.y, from: looking, map: map, viewport: phone)
        XCTAssertGreaterThan(target.scale, looking.scale * 2)
        let at = target.toScreen(x: capital.x, y: capital.y, viewport: phone)
        XCTAssertEqual(at.x, phone.width / 2, accuracy: 0.5)
        XCTAssertEqual(at.y, phone.height * 0.3, accuracy: 0.5)
        // Already closer than the spotlight zoom: the zoom is kept, the capital is still brought up.
        let close = MapCamera(centerX: 100, centerY: 100, scale: b.lowerBound * 20)
        let kept = MapCamera.spotlight(x: capital.x, y: capital.y, from: close, map: map, viewport: phone)
        XCTAssertEqual(kept.scale, close.scale, accuracy: 1e-9)
        XCTAssertEqual(kept.toScreen(x: capital.x, y: capital.y, viewport: phone).y, phone.height * 0.3, accuracy: 0.5)
        // A capital in the corner of the map stays on screen.
        let corner = MapCamera.spotlight(x: 5, y: 5, from: looking, map: map, viewport: phone)
        let c = corner.toScreen(x: 5, y: 5, viewport: phone)
        XCTAssertTrue(c.x >= 0 && c.x <= phone.width && c.y >= 0 && c.y <= phone.height)
    }

    /// 国名不闪: a border change keeps every name that is still there, in place when it barely moved.
    func testNamesSurviveBorderChanges() {
        typealias P = NameStability.Placement
        let old = [P(text: "齐", x: 100, y: 100, em: 40, angle: 0), P(text: "楚", x: 400, y: 300, em: 60, angle: 0.2), P(text: "燕", x: 700, y: 80, em: 20, angle: 0)]
        // 齐 drifts a little, 楚 grows a lot, 燕 is gone, 秦 is new.
        let fresh = [P(text: "楚", x: 430, y: 320, em: 90, angle: 0.2), P(text: "齐", x: 108, y: 104, em: 42, angle: 0.03), P(text: "秦", x: 900, y: 500, em: 30, angle: 0)]
        let m = NameStability.match(old: old, fresh: fresh)
        XCTAssertEqual(m[0], .init(reuse: 1, keep: false))
        XCTAssertEqual(m[1], .init(reuse: 0, keep: true))
        XCTAssertEqual(m[2], .init(reuse: nil, keep: false))
        // Unchanged borders: everything is reused and nothing moves.
        XCTAssertTrue(NameStability.match(old: old, fresh: old).enumerated().allSatisfy { $0.element == .init(reuse: $0.offset, keep: true) })
        // Two names with the same text (a state in two parts): each continues its nearest, once.
        let twin = [P(text: "晋", x: 0, y: 0, em: 30, angle: 0), P(text: "晋", x: 500, y: 0, em: 30, angle: 0)]
        let after = [P(text: "晋", x: 495, y: 2, em: 30, angle: 0), P(text: "晋", x: 3, y: 1, em: 30, angle: 0), P(text: "晋", x: 250, y: 0, em: 30, angle: 0)]
        XCTAssertEqual(NameStability.match(old: twin, fresh: after).map(\.reuse), [1, 0, nil])
    }
}

/// 海面细节: the brush's wash on the sea texture.
final class SeaWashTests: XCTestCase {
    func testTheWashIsGentleRepeatableAndVaried() {
        let w = 96, h = 54
        func sea(_ r: UInt8, _ g: UInt8, _ b: UInt8) -> [UInt8] { (0..<(w * h)).flatMap { _ in [r, g, b, 255] } }
        // The cold (original) deep sea and the warm one.
        for base in [(UInt8(0x14), UInt8(0x87), UInt8(0xFF)), (UInt8(0x52), UInt8(0x7C), UInt8(0x86))] {
            var a = sea(base.0, base.1, base.2), b = a
            MapLayers.applySeaWash(width: w, height: h, to: &a)
            MapLayers.applySeaWash(width: w, height: h, to: &b)
            XCTAssertEqual(a, b)
            var seen = Set<UInt8>()
            for p in 0..<(w * h) {
                // The green channel never saturates in either sea: within ±5.5 % (and rounding) of the flat colour.
                let g = Double(a[p * 4 + 1]), flat = Double(base.1)
                XCTAssertLessThanOrEqual(abs(g - flat), flat * 0.055 + 1.01)
                XCTAssertEqual(a[p * 4 + 3], 255)
                seen.insert(a[p * 4 + 1])
            }
            XCTAssertGreaterThan(seen.count, 5, "the wash must vary across the sea")
        }
        // A texture of the wrong size is left alone.
        var odd: [UInt8] = [1, 2, 3]
        MapLayers.applySeaWash(width: w, height: h, to: &odd)
        XCTAssertEqual(odd, [1, 2, 3])
    }
}
