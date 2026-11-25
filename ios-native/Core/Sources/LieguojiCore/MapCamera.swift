import Foundation

/// Map camera in points: screen = (world − center) × scale + viewport / 2.
/// The same transform drives drawing, labels and picking, so a tap always lands on the cell drawn under it.
public struct MapCamera: Equatable, Sendable {
    public var centerX: Double
    public var centerY: Double
    /// Screen points per map unit.
    public var scale: Double

    public init(centerX: Double, centerY: Double, scale: Double) {
        self.centerX = centerX.isFinite ? centerX : 0
        self.centerY = centerY.isFinite ? centerY : 0
        self.scale = (scale.isFinite && scale > 1e-6) ? scale : 1
    }

    public var isValid: Bool { centerX.isFinite && centerY.isFinite && scale.isFinite && scale > 1e-6 }

    public func toScreen(x: Double, y: Double, viewport: (width: Double, height: Double)) -> (x: Double, y: Double) {
        guard x.isFinite, y.isFinite, isValid else { return (viewport.width / 2, viewport.height / 2) }
        return ((x - centerX) * scale + viewport.width / 2, (y - centerY) * scale + viewport.height / 2)
    }
    public func toWorld(x: Double, y: Double, viewport: (width: Double, height: Double)) -> (x: Double, y: Double) {
        guard x.isFinite, y.isFinite, isValid else { return (centerX, centerY) }
        return ((x - viewport.width / 2) / scale + centerX, (y - viewport.height / 2) / scale + centerY)
    }

    /// Whole map visible ("aspect fit" with graceful margin for the scroll rollers & finials) and the closest zoom allowed (about 8 cells across a phone).
    public static func scaleBounds(map: (width: Double, height: Double), viewport: (width: Double, height: Double)) -> ClosedRange<Double> {
        let mw = max(1, map.width.isFinite ? map.width : 1600), mh = max(1, map.height.isFinite ? map.height : 900)
        let vw = max(1, viewport.width.isFinite ? viewport.width : 390), vh = max(1, viewport.height.isFinite ? viewport.height : 844)
        let rawFit = max(1e-4, min(vw / mw, vh / mh))
        let framedFit = max(1e-4, min(vw / (mw * 1.11), vh / (mh * 1.11)))
        return framedFit...(rawFit * 40)
    }
    public static func fit(map: (width: Double, height: Double), viewport: (width: Double, height: Double)) -> MapCamera {
        MapCamera(centerX: map.width / 2, centerY: map.height / 2, scale: scaleBounds(map: map, viewport: viewport).lowerBound)
    }
    /// Covers the viewport (no empty bands on a phone in portrait), which is how the game opens.
    public static func cover(map: (width: Double, height: Double), viewport: (width: Double, height: Double)) -> MapCamera {
        let bounds = scaleBounds(map: map, viewport: viewport)
        let mw = max(1, map.width), mh = max(1, map.height)
        let cover = max(viewport.width / mw, viewport.height / mh)
        let safeCover = cover.isFinite ? cover : bounds.lowerBound
        return MapCamera(centerX: mw / 2, centerY: mh / 2, scale: min(bounds.upperBound, max(bounds.lowerBound, safeCover)))
    }

    /// Moves by a screen delta (finger motion): the map follows the finger.
    public func panned(dx: Double, dy: Double) -> MapCamera {
        guard dx.isFinite, dy.isFinite, isValid else { return self }
        return MapCamera(centerX: centerX - dx / scale, centerY: centerY - dy / scale, scale: scale)
    }
    /// Zooms by a factor while the map point under the screen anchor stays under it.
    public func zoomed(by factor: Double, anchorX: Double, anchorY: Double, viewport: (width: Double, height: Double), bounds: ClosedRange<Double>) -> MapCamera {
        guard factor.isFinite, factor > 0, anchorX.isFinite, anchorY.isFinite, isValid else { return self }
        let anchor = toWorld(x: anchorX, y: anchorY, viewport: viewport)
        let next = max(1e-4, min(bounds.upperBound, max(bounds.lowerBound, scale * factor)))
        return MapCamera(centerX: anchor.x - (anchorX - viewport.width / 2) / next,
                         centerY: anchor.y - (anchorY - viewport.height / 2) / next, scale: next)
    }
    /// Keeps the map on screen: the centre may not leave the map, and a map smaller than the
    /// viewport stays centred on that axis. Also guards against NaN/Inf so the renderer never blanks out.
    public func clamped(map: (width: Double, height: Double), viewport: (width: Double, height: Double), margin: Double = 0) -> MapCamera {
        let mw = max(1, map.width.isFinite ? map.width : 1600), mh = max(1, map.height.isFinite ? map.height : 900)
        let vw = max(1, viewport.width.isFinite ? viewport.width : 390), vh = max(1, viewport.height.isFinite ? viewport.height : 844)
        let b = Self.scaleBounds(map: (mw, mh), viewport: (vw, vh))
        let safeScale = (scale.isFinite && scale > 1e-6) ? min(b.upperBound, max(b.lowerBound, scale)) : b.lowerBound
        func axis(_ c: Double, _ size: Double, _ view: Double) -> Double {
            let safeC = c.isFinite ? c : size / 2
            let half = view / 2 / safeScale
            return size + 2 * margin <= half * 2 ? size / 2 : min(size + margin - half, max(half - margin, safeC))
        }
        return MapCamera(centerX: axis(centerX, mw, vw), centerY: axis(centerY, mh, vh), scale: safeScale)
    }
    /// 计算在底部抽屉（竖屏）或右侧边栏（横屏）覆盖下，将目标世界坐标精准置于“上方/左侧可视安全区正中央”所需的镜头位置。
    public static func focused(worldX: Double, worldY: Double, scale: Double,
                               viewport: (width: Double, height: Double),
                               bottomFraction: Double = 0, trailingFraction: Double = 0,
                               topInset: Double = 96, leadInset: Double = 58) -> MapCamera {
        let safeScale = max(1e-4, scale.isFinite ? scale : 1)
        let vw = max(1, viewport.width.isFinite ? viewport.width : 390)
        let vh = max(1, viewport.height.isFinite ? viewport.height : 844)
        let targetX: Double
        if trailingFraction > 0.05 {
            let visibleRight = max(leadInset + 40, vw * (1.0 - min(0.65, trailingFraction)))
            targetX = (leadInset + visibleRight) * 0.5
        } else {
            targetX = vw * 0.5
        }
        let targetY: Double
        if bottomFraction > 0.05 {
            let visibleBottom = max(topInset + 40, vh * (1.0 - min(0.72, bottomFraction)))
            targetY = (topInset + visibleBottom) * 0.5
        } else {
            targetY = vh * 0.5
        }
        return MapCamera(
            centerX: worldX + (vw * 0.5 - targetX) / safeScale,
            centerY: worldY + (vh * 0.5 - targetY) / safeScale,
            scale: safeScale
        )
    }

    /// 查看都城: the camera that shows a place close up, the place `lift` of the screen's height above
    /// the centre (a page covers the lower part). It always zooms in to at least `closeness` × the
    /// whole-map scale, so the tap is seen even when the camera already looks at the place.
    public static func spotlight(x: Double, y: Double, from current: MapCamera, map: (width: Double, height: Double), viewport: (width: Double, height: Double),
                                 closeness: Double = 10, lift: Double = 0.2) -> MapCamera {
        guard x.isFinite, y.isFinite else { return current.clamped(map: map, viewport: viewport) }
        let b = scaleBounds(map: map, viewport: viewport)
        let baseScale = current.scale.isFinite ? current.scale : b.lowerBound
        let scale = max(1e-4, min(b.upperBound, max(baseScale, b.lowerBound * closeness)))
        return MapCamera(centerX: x, centerY: y + viewport.height * lift / scale, scale: scale).clamped(map: map, viewport: viewport)
    }
    public static func interpolate(_ a: MapCamera, _ b: MapCamera, _ t: Double) -> MapCamera {
        let k = t.isFinite ? min(1, max(0, t)) : 1
        guard a.isValid, b.isValid else { return b.isValid ? b : a }
        // Zoom interpolates in log space so a zoom animation feels uniform.
        let s = a.scale > 0 && b.scale > 0 ? exp(log(a.scale) + (log(b.scale) - log(a.scale)) * k) : b.scale
        return MapCamera(centerX: a.centerX + (b.centerX - a.centerX) * k, centerY: a.centerY + (b.centerY - a.centerY) * k, scale: s)
    }

    /// 抛物线鹰眼飞跃（Parabolic Eagle-Eye Arc）：长距离跳转时先微微拉高视野（展卷），越过山海后再俯冲落定，避免贴地瞬移眩晕。
    public static func arcInterpolate(_ a: MapCamera, _ b: MapCamera, _ t: Double, bounds: ClosedRange<Double>) -> MapCamera {
        var base = interpolate(a, b, t)
        let k = t.isFinite ? min(1, max(0, t)) : 1
        let dist = hypot(b.centerX - a.centerX, b.centerY - a.centerY)
        let minScale = max(1e-4, min(a.scale, b.scale))
        let screenSpan = dist * minScale
        if screenSpan > 260 {
            let dipStrength = min(0.38, (screenSpan - 260) / 1400 * 0.38)
            let arc = 1.0 - dipStrength * sin(.pi * k)
            base.scale = max(bounds.lowerBound, min(bounds.upperBound, base.scale * arc))
        }
        return base
    }
}
