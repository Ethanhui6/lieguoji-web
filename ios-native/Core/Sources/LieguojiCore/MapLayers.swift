import Foundation

/// Coloured triangles in map units: x, y, r, g, b, a per vertex (sRGB, straight alpha).
/// Strokes are widened in map units, so they zoom with the map exactly as the web's Pixi
/// Graphics strokes inside the world container.
public struct ColoredMesh: Sendable {
    public private(set) var vertices: [Float] = []
    public init() {}
    public var vertexCount: Int { vertices.count / 6 }

    private mutating func vertex(_ x: Float, _ y: Float, _ c: RGB, _ a: Float) {
        vertices.append(contentsOf: [x, y, c.r, c.g, c.b, a])
    }
    /// A filled simple polygon (flat x, y pairs), triangulated by ear clipping.
    public mutating func fill(_ points: [Float], _ color: RGB, alpha: Float) {
        for i in Triangulation.earClip(points) { vertex(points[i * 2], points[i * 2 + 1], color, alpha) }
    }
    /// One stroke segment with square caps (half a width past each end) so joints close.
    public mutating func segment(_ x1: Float, _ y1: Float, _ x2: Float, _ y2: Float, width: Float, _ color: RGB, alpha: Float) {
        let dx = x2 - x1, dy = y2 - y1, length = (dx * dx + dy * dy).squareRoot()
        guard length > 0 else { return }
        let ux = dx / length * width / 2, uy = dy / length * width / 2
        let ax = x1 - ux, ay = y1 - uy, bx = x2 + ux, by = y2 + uy, nx = -uy, ny = ux
        vertex(ax + nx, ay + ny, color, alpha); vertex(ax - nx, ay - ny, color, alpha); vertex(bx + nx, by + ny, color, alpha)
        vertex(bx + nx, by + ny, color, alpha); vertex(ax - nx, ay - ny, color, alpha); vertex(bx - nx, by - ny, color, alpha)
    }
    /// An open polyline (moveTo / lineTo …, then stroke).
    public mutating func polyline(_ points: [Float], width: Float, _ color: RGB, alpha: Float) {
        guard points.count >= 4 else { return }
        for i in stride(from: 0, to: points.count - 2, by: 2) { segment(points[i], points[i + 1], points[i + 2], points[i + 3], width: width, color, alpha: alpha) }
    }
    public mutating func disc(_ x: Float, _ y: Float, radius: Float, _ color: RGB, alpha: Float = 1, sides: Int = 20) {
        for k in 0..<sides {
            let a0 = Float(k) / Float(sides) * 2 * .pi, a1 = Float(k + 1) / Float(sides) * 2 * .pi
            vertex(x, y, color, alpha); vertex(x + cos(a0) * radius, y + sin(a0) * radius, color, alpha); vertex(x + cos(a1) * radius, y + sin(a1) * radius, color, alpha)
        }
    }
}

public enum Triangulation {
    /// Ear clipping for small simple polygons in either winding; returns vertex indices, three per triangle.
    public static func earClip(_ points: [Float]) -> [Int] {
        let n = points.count / 2
        guard n >= 3 else { return [] }
        func x(_ i: Int) -> Float { points[i * 2] }
        func y(_ i: Int) -> Float { points[i * 2 + 1] }
        var area: Float = 0
        for i in 0..<n { let j = (i + 1) % n; area += x(i) * y(j) - x(j) * y(i) }
        var ring = Array(0..<n)
        if area < 0 { ring.reverse() }
        func cross(_ a: Int, _ b: Int, _ c: Int) -> Float { (x(b) - x(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (x(c) - x(a)) }
        func inside(_ p: Int, _ a: Int, _ b: Int, _ c: Int) -> Bool { cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0 }
        var out: [Int] = []
        var guardCount = 0
        while ring.count > 3 && guardCount < n * n {
            guardCount += 1
            var clipped = false
            for k in 0..<ring.count {
                let a = ring[(k + ring.count - 1) % ring.count], b = ring[k], c = ring[(k + 1) % ring.count]
                guard cross(a, b, c) > 0 else { continue }
                if ring.contains(where: { $0 != a && $0 != b && $0 != c && inside($0, a, b, c) }) { continue }
                out.append(contentsOf: [a, b, c]); ring.remove(at: k); clipped = true; break
            }
            if !clipped { break }
        }
        if ring.count == 3 { out.append(contentsOf: ring) }
        return out
    }
}

/// Map ornaments of the web renderer, built once per world.
public enum MapLayers {
    /// Reference-paper river colour (original-play-renderer: ORIGINAL_PRESETS[7] rivers [.38, .69, .74]).
    public static let river = RGB(0.38, 0.69, 0.74)
    /// FMS_STATE_LINE_WIDTH and FMS_COAST_LINE_WIDTH: 0.25 world units of the original → map units.
    public static let lineWidth: Float = 0.25 / (240.0 / 1600.0)
    public static let coastColor = RGB(hex: 0x5F5F5F)
    /// ORIGINAL_CITY_UNIT (Shapes CityMain, 0.23 world units) and the capital's 1.5×.
    public static let cityUnit: Float = 0.23 / (240.0 / 1600.0)

    /// original-relief.ts drawOriginalRelief: a mountain for h ≥ 55, a tree group for forest
    /// biomes 5…9 at 22 ≤ h < 55; never on a cell touching the sea; at most one per 23-unit square.
    public static func relief(_ map: WorldMap) -> ColoredMesh {
        var touchesSea = [Bool](repeating: false, count: map.cellCount)
        for e in map.edges where e.a >= 0 && e.b >= 0 {
            let a = Int(e.a), b = Int(e.b)
            if map.elevation[b] < WorldMap.seaLevel { touchesSea[a] = true }
            if map.elevation[a] < WorldMap.seaLevel { touchesSea[b] = true }
        }
        let light = RGB(hex: 0xDDD1B1), ink = RGB(hex: 0x514D3C), tree = RGB(hex: 0x405D45), trunk = RGB(hex: 0x354A35)
        var occupied = Set<Int64>()
        var m = ColoredMesh()
        for i in 0..<map.cellCount {
            let h = Float(map.elevation[i]), biome = map.biome[i]
            let forest = h >= 22 && h < 55 && biome >= 5 && biome <= 9
            if h < 55 && !forest { continue }
            if touchesSea[i] { continue }
            let x = map.sites[i * 2], y = map.sites[i * 2 + 1]
            let key = Int64(floor(x / 23)) << 32 | Int64(Int32(floor(y / 23))) & 0xFFFF_FFFF
            if occupied.contains(key) { continue }
            occupied.insert(key)
            if h >= 55 {
                let variation = Float(i * 37 % 101) / 100, w = 5 + (h - 55) * 0.08
                let top = y - (8 + (h - 55) * 0.19) * (0.85 + variation * 0.3), peak = x - 2 + variation * 3
                let ridge: [Float] = [x - w - 3, y + 4, x - w * 0.6, y - 2, x - w * 0.35, y - 1, peak, top, x + w * 0.3, y - 3, x + w * 0.55, y - 5, x + w + 3, y + 4]
                m.fill(ridge, light, alpha: 0.32)
                m.polyline(ridge, width: 0.65, ink, alpha: 0.62)
                m.fill([peak, top, x + w * 0.3, y - 3, x + w * 0.55, y - 5, x + w + 3, y + 4, x + 1, y + 1], ink, alpha: 0.23)
                m.polyline([peak, top, x - 2, y - 1, x - 4, y + 3], width: 0.5, ink, alpha: 0.6)
                for k in 0..<4 {
                    let fk = Float(k)
                    m.segment(x + fk * 1.6, y - 3 + fk, x + fk * 1.6 + 2, y + 2 + fk * 0.5, width: 0.45, ink, alpha: 0.45)
                }
            } else {
                for (dx, dy) in [(Float(-3), Float(1)), (2, -2), (5, 2)] {
                    let cx = x + dx, cy = y + dy
                    m.fill([cx, cy - 5, cx - 2.5, cy, cx - 1, cy, cx - 3, cy + 3, cx + 3, cy + 3, cx + 1, cy, cx + 2.5, cy], tree, alpha: 0.4)
                    m.segment(cx, cy + 2, cx, cy + 5, width: 0.5, trunk, alpha: 0.55)
                }
            }
        }
        return m
    }

    /// StateLineRenderer outlines on the shared cell edges: each state strokes its own outline in its
    /// adjusted colour (both sides of a border), then the smoothed coastline in grey.
    public static func outlines(_ map: WorldMap) -> ColoredMesh {
        let colors = map.meta.nations.map { RGB(css: $0.line) ?? RGB(0.2, 0.2, 0.2) }
        var m = ColoredMesh()
        for e in map.edges where e.a >= 0 && e.b >= 0 {
            let na = map.nation(ofCell: Int(e.a)), nb = map.nation(ofCell: Int(e.b))
            guard map.isLand(Int(e.a)) && map.isLand(Int(e.b)), na != nb else { continue }
            for n in [na, nb] { if let n { m.segment(e.x1, e.y1, e.x2, e.y2, width: lineWidth, colors[n], alpha: 1) } }
        }
        for s in stride(from: 0, to: map.coast.count, by: 4) {
            m.segment(map.coast[s], map.coast[s + 1], map.coast[s + 2], map.coast[s + 3], width: lineWidth, coastColor, alpha: 1)
        }
        return m
    }

    /// Shapes CityMain (black disc, white centre 0.56) and CityCapitalFinal (1.3 / 0.885 / 0.43 rings).
    public static func cityIcons(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let capitals = Set(map.meta.nations.compactMap { $0.capital >= 0 ? $0.capital : nil })
        let black = RGB(0, 0, 0), white = RGB(1, 1, 1), u = cityUnit, c = cityUnit * 1.5
        for (i, city) in map.meta.cities.enumerated() {
            if capitals.contains(i) {
                m.disc(city.x, city.y, radius: 1.3 * c, black); m.disc(city.x, city.y, radius: 0.885 * c, white); m.disc(city.x, city.y, radius: 0.43 * c, black)
            } else {
                m.disc(city.x, city.y, radius: u, black, sides: 14); m.disc(city.x, city.y, radius: 0.56 * u, white, sides: 14)
            }
        }
        return m
    }

    /// TextMeshPro auto-size inside a LabelUtility box (original-labels47 autoFontSize47): `em` is
    /// the text size at font size 10 in box units (width, height per character run).
    public static func labelFontSize(box: WorldMeta.LabelBox, emWidth: Float, emHeight: Float) -> Float {
        let fit = min(box.width * 10 / max(1e-6, emWidth), box.height * 10 / max(1e-6, emHeight))
        return max(box.fontMin, min(box.fontMax, fit))
    }
    /// Map units per font-size point (MAP_UNIT47 / 10).
    public static let fontUnit: Float = (1600.0 / 240.0) / 10
}
