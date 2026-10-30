/// World-space camera, independent of UIKit, pixels, and display refresh rate.
public struct MapCamera: Sendable, Equatable {
    public var x: Double
    public var y: Double
    public private(set) var scale: Double
    public init(x: Double = 800, y: Double = 450, scale: Double = 1) {
        self.x = x; self.y = y
        self.scale = scale.isFinite ? min(8, max(0.1, scale)) : 1
    }
    public func world(screenX: Double, screenY: Double, width: Double, height: Double) -> (x: Double, y: Double) {
        (x + (screenX - width / 2) / scale, y + (screenY - height / 2) / scale)
    }
    public mutating func pan(dx: Double, dy: Double) {
        guard dx.isFinite, dy.isFinite else { return }
        x -= dx / scale; y -= dy / scale
    }
    public mutating func zoom(factor: Double, anchorX: Double, anchorY: Double, width: Double, height: Double) {
        guard factor.isFinite, factor > 0 else { return }
        let before = world(screenX: anchorX, screenY: anchorY, width: width, height: height)
        scale = min(8, max(0.1, scale * factor))
        let after = world(screenX: anchorX, screenY: anchorY, width: width, height: height)
        x += before.x - after.x; y += before.y - after.y
    }
    public func intersects(minX: Double, minY: Double, maxX: Double, maxY: Double, width: Double, height: Double) -> Bool {
        let halfWidth = width / (2 * scale), halfHeight = height / (2 * scale)
        return maxX >= x - halfWidth && minX <= x + halfWidth && maxY >= y - halfHeight && minY <= y + halfHeight
    }
}
