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
    /// A quad a→b→c→d whose alpha runs from `outer` (a, b) to `inner` (d, c): a soft band.
    public mutating func band(_ a: SIMD2<Float>, _ b: SIMD2<Float>, _ c: SIMD2<Float>, _ d: SIMD2<Float>, _ color: RGB, outer: Float, inner: Float) {
        vertex(a.x, a.y, color, outer); vertex(b.x, b.y, color, outer); vertex(c.x, c.y, color, inner)
        vertex(a.x, a.y, color, outer); vertex(c.x, c.y, color, inner); vertex(d.x, d.y, color, inner)
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
        // Groves: a slow field over the map decides where woods stand thick and where they thin out.
        func grove(_ x: Float, _ y: Float) -> Float { sin(x * 0.011 + 1.3) * sin(y * 0.013 + 0.7) + 0.6 * sin((x + y) * 0.006 + 2.1) }
        // Drawn from the top of the map down, so nearer peaks and trees overlap the ones behind.
        let order = (0..<map.cellCount).sorted { map.sites[$0 * 2 + 1] < map.sites[$1 * 2 + 1] }
        for i in order {
            let h = Float(map.elevation[i]), biome = map.biome[i]
            let forest = h >= 22 && h < 55 && biome >= 5 && biome <= 9
            if h < 55 && !forest { continue }
            if touchesSea[i] { continue }
            if forest && grove(map.sites[i * 2], map.sites[i * 2 + 1]) < -0.45 { continue }
            // Sparser than one mark per square: real ranges read as ridgelines, not a carpet of peaks.
            let pick = UInt32(truncatingIfNeeded: i &* 2654435761) >> 16 % 100
            // Fuller than 0.21 (it had thinned the land too far): more peaks along the ranges, denser woods.
            if h >= 55 && (h < 58 || pick < 15) { continue }
            if forest && pick < 22 { continue }
            let jx = Float(i * 7919 % 13) - 6, jy = Float(i * 104_729 % 11) - 5
            let x = map.sites[i * 2] + jx * 0.6, y = map.sites[i * 2 + 1] + jy * 0.6
            let key = Int64(floor(map.sites[i * 2] / 23)) << 32 | Int64(Int32(floor(map.sites[i * 2 + 1] / 23))) & 0xFFFF_FFFF
            if occupied.contains(key) { continue }
            occupied.insert(key)
            if h >= 55 {
                let variation = Float(i * 37 % 101) / 100, w = (5 + (h - 55) * 0.11) * (0.75 + variation * 0.6)
                let top = y - (8 + (h - 55) * 0.19) * (0.85 + variation * 0.3), peak = x - 2 + variation * 3
                let ridge: [Float] = [x - w - 3, y + 4, x - w * 0.6, y - 2, x - w * 0.35, y - 1, peak, top, x + w * 0.3, y - 3, x + w * 0.55, y - 5, x + w + 3, y + 4]
                m.fill(ridge, light, alpha: 0.32)
                m.polyline(ridge, width: 0.65, ink, alpha: 0.62)
                m.fill([peak, top, x + w * 0.3, y - 3, x + w * 0.55, y - 5, x + w + 3, y + 4, x + 1, y + 1], ink, alpha: 0.23)
                m.polyline([peak, top, x - 2, y - 1, x - 4, y + 3], width: 0.5, ink, alpha: 0.6)
                if h >= 72 {
                    // Snow on the high peaks.
                    let s = (top - y) * 0.32
                    m.fill([peak, top, peak - w * 0.28, top - s, peak - w * 0.1, top - s * 0.8, peak + w * 0.12, top - s * 1.05, peak + w * 0.3, top - s * 0.85], RGB(hex: 0xF7F4EC), alpha: 0.85)
                }
                for k in 0..<4 {
                    let fk = Float(k)
                    m.segment(x + fk * 1.6, y - 3 + fk, x + fk * 1.6 + 2, y + 2 + fk * 0.5, width: 0.45, ink, alpha: 0.45)
                }
            } else if biome == 9 {
                // Taiga: tall dark conifers.
                let pine = RGB(hex: 0x2F4A33)
                for (dx, dy) in [(Float(-3), Float(1)), (1, -2), (4, 2)] {
                    let cx = x + dx, cy = y + dy
                    m.fill([cx, cy - 7, cx - 2, cy - 2, cx - 1, cy - 2, cx - 2.6, cy + 2, cx + 2.6, cy + 2, cx + 1, cy - 2, cx + 2, cy - 2], pine, alpha: 0.5)
                    m.segment(cx, cy + 2, cx, cy + 4.5, width: 0.5, trunk, alpha: 0.55)
                }
            } else {
                for (dx, dy) in [(Float(-3), Float(1)), (2, -2), (5, 2)] {
                    let cx = x + dx, cy = y + dy
                    m.fill([cx, cy - 5, cx - 2.5, cy, cx - 1, cy, cx - 3, cy + 3, cx + 3, cy + 3, cx + 1, cy, cx + 2.5, cy], tree, alpha: 0.4)
                    m.segment(cx, cy + 2, cx, cy + 5, width: 0.5, trunk, alpha: 0.55)
                }
            }
        }
        // Further detail, on a finer grid and never under the original's marks: rounded hills, dunes,
        // grass tufts, savanna acacias, tundra and ice. Presentation only.
        var fine = Set<Int64>()
        let sand = RGB(hex: 0xA88A55), grass = RGB(hex: 0x6F7F3C), acacia = RGB(hex: 0x56653A), frost = RGB(hex: 0xFFFFFF), moss = RGB(hex: 0x7A6E52)
        for i in 0..<map.cellCount {
            let h = Float(map.elevation[i]), biome = map.biome[i]
            guard h >= Float(WorldMap.seaLevel) + 2, !touchesSea[i] else { continue }
            let x = map.sites[i * 2], y = map.sites[i * 2 + 1]
            let coarse = Int64(floor(x / 23)) << 32 | Int64(Int32(floor(y / 23))) & 0xFFFF_FFFF
            if occupied.contains(coarse) && (h >= 55 || (h >= 22 && biome >= 5 && biome <= 9)) { continue }
            let key = Int64(floor(x / 20)) << 32 | Int64(Int32(floor(y / 20))) & 0xFFFF_FFFF
            if fine.contains(key) { continue }
            let v = Float(i * 53 % 97) / 97
            if h >= 46 && h < 62 {
                if v > 0.35 { continue }
                fine.insert(key)
                // Rounded hills: two soft mounds.
                m.polyline([x - 6, y + 2, x - 4, y - 1.5, x - 1.5, y - 2.5, x + 1, y - 1, x + 2, y + 1], width: 0.55, ink, alpha: 0.45)
                m.polyline([x + 0.5, y + 2.5, x + 2.5, y, x + 4.5, y - 0.8, x + 6.5, y + 2.5], width: 0.5, ink, alpha: 0.38)
            } else if biome == 1 || biome == 2 {
                if v > 0.7 { continue }
                fine.insert(key)
                // Dunes: wind-ridged sand, a crest shaded on its lee, and scattered stones.
                m.fill([x - 6, y + 1, x - 2, y - 2.2, x + 1, y - 0.8, x + 5, y - 2.4, x + 7, y + 1], sand, alpha: 0.18)
                m.polyline([x - 6, y, x - 3, y - 1.8, x, y - 0.6, x + 3, y - 2, x + 6, y - 0.4], width: 0.6, sand, alpha: 0.65)
                m.polyline([x - 4, y + 3, x - 1, y + 1.6, x + 2, y + 2.6, x + 5, y + 1.4], width: 0.45, sand, alpha: 0.5)
                if v < 0.25 { m.disc(x + 4, y + 3.5, radius: 0.5, ink, alpha: 0.35, sides: 6); m.disc(x - 5, y + 3, radius: 0.4, ink, alpha: 0.3, sides: 6) }
            } else if biome == 12 {
                if v > 0.6 { continue }
                fine.insert(key)
                // Marsh: still water lines and reeds.
                let reed = RGB(hex: 0x4F6B4A), water = RGB(hex: 0x6F8F98)
                m.segment(x - 5, y + 2, x + 5, y + 2, width: 0.45, water, alpha: 0.55)
                m.segment(x - 3, y + 3.5, x + 3, y + 3.5, width: 0.4, water, alpha: 0.45)
                for dx in [Float(-3), -1, 2] { m.segment(x + dx, y + 2, x + dx + 0.4, y - 2.5, width: 0.4, reed, alpha: 0.6) }
            } else if biome == 4 {
                if v > 0.3 { continue }
                fine.insert(key)
                // Grassland tufts.
                for dx in [Float(-3), 2] {
                    m.segment(x + dx, y + 1.5, x + dx - 1, y - 1.2, width: 0.4, grass, alpha: 0.55)
                    m.segment(x + dx, y + 1.5, x + dx, y - 1.8, width: 0.4, grass, alpha: 0.55)
                    m.segment(x + dx, y + 1.5, x + dx + 1, y - 1.2, width: 0.4, grass, alpha: 0.55)
                }
            } else if biome == 3 {
                if v > 0.25 { continue }
                fine.insert(key)
                // Savanna: a lone flat-topped acacia.
                m.fill([x - 3.5, y - 2.5, x - 2, y - 4, x + 2, y - 4, x + 3.5, y - 2.5, x, y - 1.8], acacia, alpha: 0.5)
                m.segment(x, y - 2, x, y + 2, width: 0.5, trunk, alpha: 0.55)
            } else if biome == 10 {
                if v > 0.3 { continue }
                fine.insert(key)
                // Tundra: low moss and stones.
                m.polyline([x - 4, y + 1, x - 2.5, y - 0.6, x - 1, y + 1], width: 0.45, moss, alpha: 0.5)
                m.polyline([x + 1, y + 1.5, x + 2.5, y, x + 4, y + 1.5], width: 0.45, moss, alpha: 0.5)
            } else if biome == 11 {
                if v > 0.6 { continue }
                fine.insert(key)
                // Ice field: pale cracks.
                m.polyline([x - 5, y - 1, x - 1, y + 1, x + 2, y - 1.5, x + 5, y + 0.5], width: 0.5, frost, alpha: 0.7)
                m.segment(x - 1, y + 1, x - 2, y + 3.5, width: 0.4, frost, alpha: 0.6)
            }
        }
        return m
    }

    /// Hill shading: each land cell lit from the north-west by its slope (neighbour elevations), a
    /// factor 0.82…1.14 for its colour. Presentation only.
    public static func hillshade(_ map: WorldMap) -> [Float] {
        var gx = [Float](repeating: 0, count: map.cellCount), gy = gx
        for e in map.edges where e.a >= 0 && e.b >= 0 {
            let a = Int(e.a), b = Int(e.b)
            let dx = map.sites[b * 2] - map.sites[a * 2], dy = map.sites[b * 2 + 1] - map.sites[a * 2 + 1]
            let len = max(0.001, (dx * dx + dy * dy).squareRoot())
            let ha = max(Float(WorldMap.seaLevel), Float(map.elevation[a])), hb = max(Float(WorldMap.seaLevel), Float(map.elevation[b]))
            let s = (hb - ha) / len
            gx[a] += dx / len * s; gy[a] += dy / len * s
            gx[b] += dx / len * s; gy[b] += dy / len * s
        }
        // Light from the upper left: a slope rising towards it is lit, facing away is shaded.
        let lx: Float = -0.707, ly: Float = -0.707
        return (0..<map.cellCount).map { c in
            guard map.isLand(c) else { return 1 }
            let lit = gx[c] * lx + gy[c] * ly
            return 1 + min(0.14, max(-0.18, lit * 0.09))
        }
    }

    /// Smooth the lighting at shared geometric vertices without blending political ownership.
    /// Built only when the terrain changes; the GPU interpolates the cached vertex colours.
    public static func vertexHillshade(_ map: WorldMap) -> [Float] {
        let cells = hillshade(map)
        var sums: [UInt64: (Float, Int)] = [:]
        func key(_ v: Int) -> UInt64 {
            UInt64(map.vertices[v * 2].bitPattern) << 32 | UInt64(map.vertices[v * 2 + 1].bitPattern)
        }
        for c in 0..<map.cellCount where map.isLand(c) {
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                let k = key(v), old = sums[k] ?? (0, 0)
                sums[k] = (old.0 + cells[c], old.1 + 1)
            }
        }
        return (0..<(map.vertices.count / 2)).map { v in
            guard let sum = sums[key(v)] else { return 1 }
            return sum.0 / Float(sum.1)
        }
    }

    /// StateLineRenderer outlines on the shared cell edges: each state strokes its own outline in its
    /// adjusted colour (both sides of a border), then the smoothed coastline in grey.
    /// `wide` nations are drawn at twice the line width. The app passes the open nation and the owner of the selected province.
    public static func outlines(_ map: WorldMap, wide: Set<Int> = []) -> ColoredMesh {
        let colors = map.meta.nations.map { RGB(css: $0.line) ?? RGB(0.2, 0.2, 0.2) }
        var m = ColoredMesh()
        // Each state's border edges, joined into lines and smoothed with the original's curve
        // (BorderDataProcessor.UpdateStateLine → SmoothBorderLines, CurveBasis(points, 4)), so a
        // border runs as one soft line instead of the cells' stair steps.
        for s in stride(from: 0, to: map.coast.count, by: 4) {
            m.segment(map.coast[s], map.coast[s + 1], map.coast[s + 2], map.coast[s + 3], width: lineWidth, coastColor, alpha: 1)
        }
        let perNation = stateEdges(map)
        for n in perNation.keys.sorted() {
            let width = wide.contains(n) ? lineWidth * 2 : lineWidth
            for line in BorderCurve.smooth(BorderCurve.chain(perNation[n]!)) { m.polyline(line, width: width, colors[n], alpha: 1) }
        }
        return m
    }

    /// The heavy map layers of one world, built off the main thread (world generation, loading) and
    /// handed to the renderer, which otherwise built them on the main thread as the map appeared —
    /// the hitch right after 创建世界. `key` ties them to the exact geometry and ownership.
    public struct Prepared: Sendable {
        public let key: String
        public let provinceLines: [Float], relief: [Float], outlines: [Float], icons: [Float]
    }
    public static func key(_ map: WorldMap) -> String {
        "\(map.cellCount)|\(map.meta.provinces.count)|\(map.width)x\(map.height)|\(map.rivers.count)|\(map.meta.cities.count)|"
            + map.meta.provinces.map { String($0.nation) }.joined(separator: ",") + "|" + map.meta.nations.map(\.line).joined(separator: ",")
    }
    public static func prepare(_ map: WorldMap) -> Prepared {
        Prepared(key: key(map), provinceLines: provinceLines(map).vertices, relief: relief(map).vertices, outlines: outlines(map).vertices, icons: cityIcons(map).vertices)
    }

    /// Province borders inside the land: every edge between two land provinces, joined and smoothed
    /// with the state lines' curve, in a thin translucent ink — clear at every zoom, as the original's
    /// are, and never the cells' stair steps.
    public static let provinceInk = RGB(hex: 0x4A4036)
    public static func provinceLines(_ map: WorldMap) -> ColoredMesh {
        var segments = [BorderCurve.Segment]()
        for edge in map.edges {
            let a = Int(edge.a), b = Int(edge.b)
            guard a >= 0, b >= 0, a < map.cellCount, b < map.cellCount, map.isLand(a), map.isLand(b), map.province[a] != map.province[b] else { continue }
            segments.append(.init(edge.x1, edge.y1, edge.x2, edge.y2))
        }
        var m = ColoredMesh()
        for line in BorderCurve.smooth(BorderCurve.chain(segments)) { m.polyline(line, width: lineWidth * 0.42, provinceInk, alpha: 0.5) }
        return m
    }

    /// Full political perimeter, including islands, lake holes and the edge of the world.
    /// Water never inherits an owner from a stale province assignment after terrain editing.
    static func stateEdges(_ map: WorldMap) -> [Int: [BorderCurve.Segment]] {
        func owner(_ cell: Int32) -> Int? {
            guard cell >= 0, Int(cell) < map.cellCount, map.isLand(Int(cell)),
                  let n = map.nation(ofCell: Int(cell)), n < map.meta.nations.count else { return nil }
            return n
        }
        var result = [Int: [BorderCurve.Segment]]()
        for edge in map.edges {
            let a = owner(edge.a), b = owner(edge.b)
            guard a != b else { continue }
            for n in [a, b].compactMap({ $0 }) {
                result[n, default: []].append(.init(edge.x1, edge.y1, edge.x2, edge.y2))
            }
        }
        return result
    }

    /// 卷轴边缘 (the original's mapframes and dark border): the paper browns towards the map's edge
    /// like an old scroll, and a thick and a thin ink rule frame it.
    public static func scrollFrame(width w: Float, height h: Float) -> ColoredMesh {
        var m = ColoredMesh()
        let brown = RGB(hex: 0x4A3418), ink = RGB(hex: 0x2B2116)
        func ring(_ inset: Float, _ depth: Float, _ color: RGB, outer: Float, inner: Float) {
            let a0 = SIMD2<Float>(inset, inset), a1 = SIMD2<Float>(w - inset, inset), a2 = SIMD2<Float>(w - inset, h - inset), a3 = SIMD2<Float>(inset, h - inset)
            let i = inset + depth
            let b0 = SIMD2<Float>(i, i), b1 = SIMD2<Float>(w - i, i), b2 = SIMD2<Float>(w - i, h - i), b3 = SIMD2<Float>(i, h - i)
            m.band(a0, a1, b1, b0, color, outer: outer, inner: inner)
            m.band(a1, a2, b2, b1, color, outer: outer, inner: inner)
            m.band(a2, a3, b3, b2, color, outer: outer, inner: inner)
            m.band(a3, a0, b0, b3, color, outer: outer, inner: inner)
        }
        // Burnt edge: dark at the rim, gone a little way in (two bands for a soft curve).
        let depth = min(w, h) * 0.05
        ring(0, depth * 0.35, brown, outer: 0.55, inner: 0.22)
        ring(depth * 0.35, depth * 0.65, brown, outer: 0.22, inner: 0)
        // The double rule.
        ring(3.2, 2.0, ink, outer: 0.85, inner: 0.85)
        ring(7.2, 0.6, ink, outer: 0.7, inner: 0.7)
        return m
    }

    public enum CityMark: Equatable, Sendable { case capital, provinceSeat, city }

    /// Nation capitals keep the triple ring. The city nearest each province centre is that province's
    /// seat. Any other city in the province keeps the ordinary double ring. Port, fortress and holy
    /// icons need a city type this metadata does not carry, so they are not guessed.
    public static func cityMarks(_ map: WorldMap) -> [CityMark] {
        let capitals = Set(map.meta.nations.compactMap { $0.capital >= 0 && map.meta.cities.indices.contains($0.capital) ? $0.capital : nil })
        var best = [Int: (index: Int, distance: Float)]()
        for (i, city) in map.meta.cities.enumerated() {
            guard map.meta.provinces.indices.contains(city.province) else { continue }
            let p = map.meta.provinces[city.province]
            let dx = city.x - p.x, dy = city.y - p.y, d = dx * dx + dy * dy
            if let old = best[city.province], old.distance < d || (old.distance == d && old.index < i) { continue }
            best[city.province] = (i, d)
        }
        let seats = Set(best.values.map(\.index))
        return map.meta.cities.indices.map { capitals.contains($0) ? .capital : seats.contains($0) ? .provinceSeat : .city }
    }

    /// Shapes CityMain (black disc, white centre 0.56) and CityCapitalFinal (1.3 / 0.885 / 0.43 rings).
    /// A province seat uses the same discs, drawn clearer than an ordinary city and smaller than a capital.
    /// The seat radius (1.7× a town, under the capital's 1.95× outer ring) is a presentation choice (网页适配), not a measured original size.
    public static func cityIcons(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let black = RGB(0, 0, 0), white = RGB(1, 1, 1), u = cityUnit, c = cityUnit * 1.5
        for (mark, city) in zip(cityMarks(map), map.meta.cities) {
            switch mark {
            case .capital:
                m.disc(city.x, city.y, radius: 1.3 * c, black); m.disc(city.x, city.y, radius: 0.885 * c, white); m.disc(city.x, city.y, radius: 0.43 * c, black)
            case .provinceSeat:
                // Larger than a town (u) and still inside the capital's outer ring (1.95u). The white
                // disc is wide so the black rim and the centre pip read at the close-up used in screenshots.
                let s = u * 1.7
                m.disc(city.x, city.y, radius: s, black, sides: 16); m.disc(city.x, city.y, radius: 0.72 * s, white, sides: 16); m.disc(city.x, city.y, radius: 0.34 * s, black, sides: 12)
            case .city:
                m.disc(city.x, city.y, radius: u, black, sides: 14); m.disc(city.x, city.y, radius: 0.56 * u, white, sides: 14)
            }
        }
        return m
    }

    /// Full nation name, or the same name with a known polity suffix removed. Names that do not end
    /// in one of those suffixes are left as written (a custom title is not trimmed).
    public static func stateLabel(_ name: String, full: Bool) -> String {
        guard !full else { return name }
        let suffixes = ["人民共和国", "哈里发国", "教宗国", "神权国", "共和国", "王国", "帝国", "联邦", "部族", "部落"]
        for suffix in suffixes where name.hasSuffix(suffix) && name.count > suffix.count { return String(name.dropLast(suffix.count)) }
        return name
    }

    /// Lanes between harbour points, walking sea cells so the line stays on water. Colour is the
    /// measured sea-route grey. The stroke width is a presentation choice: the original's serialized
    /// width and dash are not in this client, so the line is solid.
    public static let seaLaneWidth: Float = 0.55
    public static func seaLanes(_ map: WorldMap, ports: [(x: Float, y: Float)]) -> ColoredMesh {
        var mesh = ColoredMesh()
        let points = ports.filter { $0.x.isFinite && $0.y.isFinite }
        guard points.count >= 2, map.cellCount > 0, map.sites.count >= map.cellCount * 2 else { return mesh }
        var neighbors = [[Int]](repeating: [], count: map.cellCount)
        for edge in map.edges {
            let a = Int(edge.a), b = Int(edge.b)
            guard a >= 0, b >= 0, a < map.cellCount, b < map.cellCount, !map.isLand(a), !map.isLand(b) else { continue }
            neighbors[a].append(b); neighbors[b].append(a)
        }
        func site(_ cell: Int) -> SIMD2<Float> { SIMD2(map.sites[cell * 2], map.sites[cell * 2 + 1]) }
        var docks = [Int](), seenDock = Set<Int>()
        for point in points {
            var best = -1, bestD = Float.greatestFiniteMagnitude
            for cell in 0..<map.cellCount where !map.isLand(cell) {
                let s = site(cell), d = (s.x - point.x) * (s.x - point.x) + (s.y - point.y) * (s.y - point.y)
                if d < bestD { bestD = d; best = cell }
            }
            if best >= 0, seenDock.insert(best).inserted { docks.append(best) }
        }
        guard docks.count >= 2 else { return mesh }
        let goals = Set(docks)
        var linked = Set<UInt64>()
        func pair(_ a: Int, _ b: Int) -> UInt64 { let x = UInt64(min(a, b)), y = UInt64(max(a, b)); return x << 32 | y }
        for start in docks {
            var queue = [start], from = [Int: Int](), seen: Set<Int> = [start], found: Int?, index = 0
            while index < queue.count {
                let cell = queue[index]; index += 1
                if cell != start, goals.contains(cell) { found = cell; break }
                for next in neighbors[cell] where seen.insert(next).inserted { from[next] = cell; queue.append(next) }
            }
            guard let end = found, linked.insert(pair(start, end)).inserted else { continue }
            var chain = [end], cursor = end
            while let previous = from[cursor] { chain.append(previous); cursor = previous; if cursor == start { break } }
            chain.reverse()
            var flat = [Float](); flat.reserveCapacity(chain.count * 2)
            for cell in chain { let s = site(cell); flat.append(s.x); flat.append(s.y) }
            mesh.polyline(flat, width: seaLaneWidth, MapPalette.seaLane, alpha: 0.95)
        }
        return mesh
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

/// The original's border smoothing (MathUtility.Basis / CurveBasis / CurveBasisClosed and
/// BorderCalculationHelper.SmoothBorderLines, as recovered in the web's coast-curve.ts).
public enum BorderCurve {
    public struct Segment: Sendable { let x1, y1, x2, y2: Float; init(_ a: Float, _ b: Float, _ c: Float, _ d: Float) { x1 = a; y1 = b; x2 = c; y2 = d } }
    static func basis(_ t: Float) -> (Float, Float, Float, Float) {
        let t2 = t * t, t3 = t2 * t
        return ((1 - t * 3 + t2 * 3 - t3) / 6, (4 - t2 * 6 + t3 * 3) / 6, (t * 3 + 1 + t2 * 3 - t3 * 3) / 6, t3 / 6)
    }
    private static func mix(_ p: [SIMD2<Float>], _ b: (Float, Float, Float, Float)) -> SIMD2<Float> { p[0] * b.0 + p[1] * b.1 + p[2] * b.2 + p[3] * b.3 }
    /// Segments sharing exact endpoints joined into maximal lines; a loop repeats its first point.
    public static func chain(_ segments: [Segment]) -> [[SIMD2<Float>]] {
        func key(_ x: Float, _ y: Float) -> UInt64 { UInt64(x.bitPattern) << 32 | UInt64(y.bitPattern) }
        var ends = [UInt64: [Int]]()
        for (i, s) in segments.enumerated() { ends[key(s.x1, s.y1), default: []].append(i); ends[key(s.x2, s.y2), default: []].append(i) }
        var used = [Bool](repeating: false, count: segments.count)
        func next(_ p: SIMD2<Float>) -> Int? { ends[key(p.x, p.y)]?.first { !used[$0] } }
        func extend(_ line: inout [SIMD2<Float>]) {
            while let i = next(line[line.count - 1]) {
                used[i] = true
                let s = segments[i], at = line[line.count - 1]
                line.append(s.x1 == at.x && s.y1 == at.y ? SIMD2(s.x2, s.y2) : SIMD2(s.x1, s.y1))
            }
        }
        func tip(_ i: Int) -> Bool { ends[key(segments[i].x1, segments[i].y1)]?.count == 1 || ends[key(segments[i].x2, segments[i].y2)]?.count == 1 }
        let order = segments.indices.sorted { (tip($0) ? 0 : 1, $0) < (tip($1) ? 0 : 1, $1) }
        var out = [[SIMD2<Float>]]()
        for start in order where !used[start] {
            used[start] = true
            var s = segments[start]
            if ends[key(s.x2, s.y2)]?.count == 1 { s = Segment(s.x2, s.y2, s.x1, s.y1) }
            var line = [SIMD2(s.x1, s.y1), SIMD2(s.x2, s.y2)]
            extend(&line)
            if line[0] != line[line.count - 1] {
                var head = [line[0]]
                extend(&head)
                if head.count > 1 { line.insert(contentsOf: head.dropFirst().reversed(), at: 0) }
            }
            out.append(line)
        }
        return out
    }
    /// CurveBasis(points, 4) per line as flat x, y pairs (closed lines wrap around).
    public static func smooth(_ lines: [[SIMD2<Float>]], segments: Int = 4) -> [[Float]] {
        lines.map { pts in
            let n = pts.count
            guard n >= 2 else { return [] }
            var curve = [SIMD2<Float>]()
            let closed = n >= 3 && abs(pts[0].x - pts[n - 1].x) < 0.001 && abs(pts[0].y - pts[n - 1].y) < 0.001
            if closed {
                let ring = Array(pts.dropLast()), m = ring.count
                for i in 0..<m {
                    let p = [ring[(m - 1 + i) % m], ring[i], ring[(i + 1) % m], ring[(i + 2) % m]]
                    for j in 0...segments { curve.append(mix(p, basis(Float(j) / Float(segments)))) }
                }
                if let f = curve.first { curve.append(f) }
            } else {
                for i in 0..<(n - 1) {
                    // Mirrored end points make an open line start and end exactly where it meets the
                    // coast (a repeated end point, as for the original's closed state outlines, stops short).
                    let p = [i > 0 ? pts[i - 1] : pts[i] * 2 - pts[i + 1], pts[i], pts[i + 1], i < n - 2 ? pts[i + 2] : pts[i + 1] * 2 - pts[i]]
                    for j in (i != 0 ? 1 : 0)...segments { curve.append(mix(p, basis(Float(j) / Float(segments)))) }
                }
            }
            var flat = [Float](); var last: SIMD2<Float>?
            for (k, q) in curve.enumerated() {
                if let l = last, k != curve.count - 1, abs(q.x - l.x) < 0.001, abs(q.y - l.y) < 0.001 { continue }
                flat.append(q.x); flat.append(q.y); last = q
            }
            return flat
        }
    }
}
