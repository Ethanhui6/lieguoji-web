import Foundation

/// Map camera in points: screen = (world − center) × scale + viewport / 2.
/// The same transform drives drawing, labels and picking, so a tap always lands on the cell drawn under it.
public struct MapCamera: Equatable, Sendable {
    public var centerX: Double
    public var centerY: Double
    /// Screen points per map unit.
    public var scale: Double

    public init(centerX: Double, centerY: Double, scale: Double) {
        self.centerX = centerX; self.centerY = centerY; self.scale = scale
    }

    public func toScreen(x: Double, y: Double, viewport: (width: Double, height: Double)) -> (x: Double, y: Double) {
        ((x - centerX) * scale + viewport.width / 2, (y - centerY) * scale + viewport.height / 2)
    }
    public func toWorld(x: Double, y: Double, viewport: (width: Double, height: Double)) -> (x: Double, y: Double) {
        ((x - viewport.width / 2) / scale + centerX, (y - viewport.height / 2) / scale + centerY)
    }

    /// Whole map visible ("aspect fit") and the closest zoom allowed (about 8 cells across a phone).
    public static func scaleBounds(map: (width: Double, height: Double), viewport: (width: Double, height: Double)) -> ClosedRange<Double> {
        let fit = min(viewport.width / map.width, viewport.height / map.height)
        return fit...(fit * 40)
    }
    public static func fit(map: (width: Double, height: Double), viewport: (width: Double, height: Double)) -> MapCamera {
        MapCamera(centerX: map.width / 2, centerY: map.height / 2, scale: scaleBounds(map: map, viewport: viewport).lowerBound)
    }
    /// Covers the viewport (no empty bands on a phone in portrait), which is how the game opens.
    public static func cover(map: (width: Double, height: Double), viewport: (width: Double, height: Double)) -> MapCamera {
        let bounds = scaleBounds(map: map, viewport: viewport)
        let cover = max(viewport.width / map.width, viewport.height / map.height)
        return MapCamera(centerX: map.width / 2, centerY: map.height / 2, scale: min(bounds.upperBound, max(bounds.lowerBound, cover)))
    }

    /// Moves by a screen delta (finger motion): the map follows the finger.
    public func panned(dx: Double, dy: Double) -> MapCamera {
        MapCamera(centerX: centerX - dx / scale, centerY: centerY - dy / scale, scale: scale)
    }
    /// Zooms by a factor while the map point under the screen anchor stays under it.
    public func zoomed(by factor: Double, anchorX: Double, anchorY: Double, viewport: (width: Double, height: Double), bounds: ClosedRange<Double>) -> MapCamera {
        guard factor.isFinite, factor > 0 else { return self }
        let anchor = toWorld(x: anchorX, y: anchorY, viewport: viewport)
        let next = min(bounds.upperBound, max(bounds.lowerBound, scale * factor))
        return MapCamera(centerX: anchor.x - (anchorX - viewport.width / 2) / next,
                         centerY: anchor.y - (anchorY - viewport.height / 2) / next, scale: next)
    }
    /// Keeps the map on screen: the centre may not leave the map, and a map smaller than the
    /// viewport stays centred on that axis.
    public func clamped(map: (width: Double, height: Double), viewport: (width: Double, height: Double)) -> MapCamera {
        func axis(_ c: Double, _ size: Double, _ view: Double) -> Double {
            let half = view / 2 / scale
            return size <= half * 2 ? size / 2 : min(size - half, max(half, c))
        }
        return MapCamera(centerX: axis(centerX, map.width, viewport.width), centerY: axis(centerY, map.height, viewport.height), scale: scale)
    }
    public static func interpolate(_ a: MapCamera, _ b: MapCamera, _ t: Double) -> MapCamera {
        // Zoom interpolates in log space so a zoom animation feels uniform.
        let s = a.scale > 0 && b.scale > 0 ? exp(log(a.scale) + (log(b.scale) - log(a.scale)) * t) : b.scale
        return MapCamera(centerX: a.centerX + (b.centerX - a.centerX) * t, centerY: a.centerY + (b.centerY - a.centerY) * t, scale: s)
    }
}
