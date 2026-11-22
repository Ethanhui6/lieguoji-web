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
        let light = RGB(hex: 0xEAE0C8), ink = RGB(hex: 0x453E30), shadowInk = RGB(hex: 0x3A3327)
        let snowSun = RGB(hex: 0xFAF7F0), snowShade = RGB(hex: 0xC6D7E3)
        let treeDark = RGB(hex: 0x325039), treeMid = RGB(hex: 0x456949), treeLit = RGB(hex: 0x628558), trunk = RGB(hex: 0x354834)
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
            let pick = UInt32(truncatingIfNeeded: i &* 2654435761) >> 16 % 100
            if h >= 55 && (h < 57 || pick < 12) { continue }
            if forest && pick < 20 { continue }
            let jx = Float(i * 7919 % 13) - 6, jy = Float(i * 104_729 % 11) - 5
            let x = map.sites[i * 2] + jx * 0.6, y = map.sites[i * 2 + 1] + jy * 0.6
            let key = Int64(floor(map.sites[i * 2] / 22)) << 32 | Int64(Int32(floor(map.sites[i * 2 + 1] / 22))) & 0xFFFF_FFFF
            if occupied.contains(key) { continue }
            occupied.insert(key)
            if h >= 55 {
                // 宋元工笔山水群峰：柔和山脚底影 + 主峰与左右副峰三叠构图 + 披麻皴阴影 + 高山双色冰川雪冠
                let v1 = Float(i * 37 % 101) / 100
                let v2 = Float(i * 73 % 97) / 97
                let w = (6.5 + (h - 55) * 0.14) * (0.82 + v1 * 0.45)
                let height = (9.5 + (h - 55) * 0.24) * (0.85 + v1 * 0.34)
                let peakX = x + (v2 - 0.5) * 3.6
                let peakY = y - height

                // 山脚柔和落影（令群山自然扎根大地，不再悬空生硬）
                m.fill([x - w * 1.35, y + 3.8, x - w * 0.5, y + 1.4, x + w * 0.6, y + 1.6, x + w * 1.4, y + 4.4, x + w * 0.3, y + 5.6, x - w * 0.7, y + 5.2], shadowInk, alpha: 0.12)

                // 后景副峰（稍低、略偏左或右，形成连绵山脉群落感）
                let subSide: Float = v2 > 0.5 ? -1 : 1
                let subX = x + subSide * w * 0.62
                let subY = y - height * (0.58 + v1 * 0.14)
                let subW = w * 0.68
                let subPoly: [Float] = [subX - subW, y + 2.8, subX - subW * 0.45, subY + (y - subY) * 0.45, subX, subY, subX + subW * 0.5, subY + (y - subY) * 0.52, subX + subW, y + 2.8]
                m.fill(subPoly, light, alpha: 0.28)
                m.fill([subX, subY, subX + subW * 0.5, subY + (y - subY) * 0.52, subX + subW, y + 2.8, subX + subW * 0.08, y + 1.8], ink, alpha: 0.22)
                m.polyline([subX - subW, y + 2.8, subX - subW * 0.45, subY + (y - subY) * 0.45, subX, subY, subX + subW * 0.5, subY + (y - subY) * 0.52, subX + subW, y + 2.8], width: 0.52, ink, alpha: 0.52)

                // 前景主峰轮廓（受光西北暖阳面 + 背光东南墨青面 + 蜿蜒中脊线）
                let lMidX = peakX - w * 0.56, lMidY = peakY + height * 0.48
                let rMidX = peakX + w * 0.48, rMidY = peakY + height * 0.44
                let spineX = peakX - w * 0.08, spineY = peakY + height * 0.56
                let mainPoly: [Float] = [x - w * 1.15, y + 3.6, lMidX, lMidY, peakX, peakY, rMidX, rMidY, x + w * 1.18, y + 3.6]
                m.fill(mainPoly, light, alpha: 0.42)
                // 背阴坡墨青层次
                m.fill([peakX, peakY, rMidX, rMidY, x + w * 1.18, y + 3.6, x + w * 0.12, y + 2.6, spineX, spineY], ink, alpha: 0.30)
                // 精致山脊线与轮廓墨线
                m.polyline(mainPoly, width: 0.72, ink, alpha: 0.70)
                m.polyline([peakX, peakY, spineX, spineY, x - w * 0.16, y + 3.2], width: 0.58, ink, alpha: 0.65)
                // 披麻皴侧坡细笔触
                for k in 0..<4 {
                    let t = Float(k + 1) / 5.0
                    let sx = peakX + (x + w * 0.92 - peakX) * t * 0.68
                    let sy = peakY + (y + 2.5 - peakY) * t * 0.72
                    m.segment(sx, sy, sx + w * 0.22, sy + height * 0.22, width: 0.42, shadowInk, alpha: 0.38)
                }

                // 真实高山雪峰（h >= 68 覆盖冰川雪冠，区分受光雪白与背阴冰蓝雪影）
                if h >= 68 {
                    let snowFrac: Float = min(0.54, 0.28 + (h - 68) * 0.012)
                    let slX = peakX + (lMidX - peakX) * snowFrac * 1.45, slY = peakY + (lMidY - peakY) * snowFrac * 1.45
                    let srX = peakX + (rMidX - peakX) * snowFrac * 1.45, srY = peakY + (rMidY - peakY) * snowFrac * 1.45
                    let scX = peakX + (spineX - peakX) * snowFrac * 1.35, scY = peakY + (spineY - peakY) * snowFrac * 1.35
                    // 西北向阳雪坡（暖玉白）
                    m.fill([peakX, peakY, slX, slY, (slX + scX) * 0.5, scY - 0.7, scX, scY], snowSun, alpha: 0.92)
                    // 东南背阴雪坡（冷冰蓝，立体感极强）
                    m.fill([peakX, peakY, scX, scY, (scX + srX) * 0.5, srY + 0.6, srX, srY], snowShade, alpha: 0.88)
                    // 副峰高海拔亦可落雪
                    if h >= 76 {
                        let ss = snowFrac * 0.75
                        m.fill([subX, subY, subX - subW * ss * 0.55, subY + (y - subY) * ss * 0.65, subX + subW * ss * 0.1, subY + (y - subY) * ss * 0.55], snowSun, alpha: 0.82)
                        m.fill([subX, subY, subX + subW * ss * 0.1, subY + (y - subY) * ss * 0.55, subX + subW * ss * 0.58, subY + (y - subY) * ss * 0.68], snowShade, alpha: 0.78)
                    }
                }
            } else if biome == 9 {
                // 针叶泰加林：多层松柏塔形轮廓 + 柔和林底暗影
                let pineDark = RGB(hex: 0x264130), pineLit = RGB(hex: 0x3B5E46)
                for (dx, dy, sc) in [(Float(-3.4), Float(1.2), Float(0.88)), (0.6, -2.0, 1.08), (4.2, 1.8, 0.92)] {
                    let cx = x + dx, cy = y + dy
                    m.disc(cx, cy + 3.4 * sc, radius: 2.3 * sc, shadowInk, alpha: 0.14, sides: 8)
                    m.fill([cx, cy - 7.5 * sc, cx - 2.3 * sc, cy - 2.4 * sc, cx - 1.1 * sc, cy - 2.4 * sc, cx - 3.0 * sc, cy + 2.2 * sc, cx + 3.0 * sc, cy + 2.2 * sc, cx + 1.1 * sc, cy - 2.4 * sc, cx + 2.3 * sc, cy - 2.4 * sc], pineDark, alpha: 0.58)
                    m.fill([cx, cy - 7.5 * sc, cx - 2.0 * sc, cy - 2.4 * sc, cx - 0.1 * sc, cy + 2.0 * sc], pineLit, alpha: 0.36)
                    m.segment(cx, cy + 2.0 * sc, cx, cy + 4.4 * sc, width: 0.55, trunk, alpha: 0.62)
                }
            } else {
                // 温带/热带阔叶丛林：层叠圆润树冠（暗叶底 + 苍翠主冠 + 暖阳冠顶高光）
                let dark = (biome == 7 || biome == 8) ? RGB(hex: 0x254D31) : treeDark
                let mid = (biome == 7 || biome == 8) ? RGB(hex: 0x386E43) : treeMid
                let lit = (biome == 7 || biome == 8) ? RGB(hex: 0x568F56) : treeLit
                for (dx, dy, sc) in [(Float(-3.5), Float(1.4), Float(0.9)), (1.2, -2.0, 1.08), (4.8, 1.6, 0.88)] {
                    let cx = x + dx, cy = y + dy
                    m.disc(cx + 0.4, cy + 3.2 * sc, radius: 2.6 * sc, shadowInk, alpha: 0.13, sides: 8)
                    m.segment(cx, cy + 0.5, cx, cy + 4.2 * sc, width: 0.6, trunk, alpha: 0.62)
                    m.disc(cx, cy - 0.6 * sc, radius: 3.1 * sc, dark, alpha: 0.54, sides: 9)
                    m.disc(cx - 0.5 * sc, cy - 1.5 * sc, radius: 2.5 * sc, mid, alpha: 0.52, sides: 9)
                    m.disc(cx - 1.0 * sc, cy - 2.2 * sc, radius: 1.4 * sc, lit, alpha: 0.44, sides: 7)
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
        // 强化山脉起伏与河谷明暗层次（0.79…1.16），即便覆盖政区配色仍保持精致立体地形质感。
        let lx: Float = -0.707, ly: Float = -0.707
        return (0..<map.cellCount).map { c in
            guard map.isLand(c) else { return 1 }
            let lit = gx[c] * lx + gy[c] * ly
            let elevBoost = max(0, Float(map.elevation[c]) - 55) * 0.0012
            return 1 + min(0.16, max(-0.21, lit * 0.105)) + elevBoost
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
    /// `wide` nations（点击国家或打开国家详情页时）以暖金亮晕 + 醒目朱墨双层描边勾勒完整疆域轮廓，
    /// 一眼就能看清所选国家的全部陆地、海岸与飞地国界线。
    public static func outlines(_ map: WorldMap, wide: Set<Int> = []) -> ColoredMesh {
        let colors = map.meta.nations.map { RGB(css: $0.line) ?? RGB(0.2, 0.2, 0.2) }
        var m = ColoredMesh()
        // Each state's border edges, joined into lines and smoothed with the original's curve
        // (BorderDataProcessor.UpdateStateLine → SmoothBorderLines, CurveBasis(points, 4)), so a
        // border runs as one soft line instead of the cells' stair steps.
        for s in stride(from: 0, to: map.coast.count, by: 4) {
            m.segment(map.coast[s], map.coast[s + 1], map.coast[s + 2], map.coast[s + 3], width: lineWidth, coastColor, alpha: 1)
        }
        let allPairs = boundaries(map)
        var emphasisLines: [(lines: [[Float]], color: RGB)] = []
        // The state borders are the shared province-pair curves whose two sides belong to different
        // states (or one side is water), so they lie exactly on the province lines.
        for pair in allPairs {
            let oa = owner(map, pair.a), ob = owner(map, pair.b)
            guard oa != ob else { continue }
            for n in [oa, ob].compactMap({ $0 }) where n < colors.count {
                if wide.contains(n) {
                    emphasisLines.append((pair.lines, colors[n]))
                } else {
                    for line in pair.lines { m.polyline(line, width: lineWidth, colors[n], alpha: 1) }
                }
            }
        }
        // 选中国家国界置于最顶层：先铺宣金亮边，再压深朱红/深色醒目实线，在任何底色下都轮廓分明。
        if !emphasisLines.isEmpty {
            let halo = RGB(0.99, 0.94, 0.72)
            let seal = RGB(0.76, 0.17, 0.12)
            for item in emphasisLines {
                for line in item.lines { m.polyline(line, width: lineWidth * 4.8, halo, alpha: 0.78) }
            }
            for item in emphasisLines {
                let c = RGB(item.color.r * 0.35 + seal.r * 0.65, item.color.g * 0.35 + seal.g * 0.65, item.color.b * 0.35 + seal.b * 0.65)
                for line in item.lines { m.polyline(line, width: lineWidth * 2.5, c, alpha: 1) }
            }
        }
        return m
    }

    /// The state holding a province (nil for water, −1, or none).
    static func owner(_ map: WorldMap, _ province: Int) -> Int? {
        guard province >= 0, province < map.meta.provinces.count else { return nil }
        let n = map.meta.provinces[province].nation
        return n >= 0 && n < map.meta.nations.count ? n : nil
    }
    /// Every boundary between two provinces (or a province and the sea, −1), joined and smoothed once
    /// with the original's curve, by the pair it separates. Province lines and state borders are both
    /// drawn from these, so a border never strays from the province line under it. Cached per
    /// geometry (the land and its provinces), not per owner.
    public static func boundaries(_ map: WorldMap) -> [(a: Int, b: Int, lines: [[Float]])] {
        var h: UInt64 = 1469598103934665603
        for (i, p) in map.province.enumerated() where i % 7 == 0 { h = (h ^ UInt64(UInt32(bitPattern: p)) ^ (map.isLand(i) ? 1 << 40 : 0)) &* 1099511628211 }
        let key = "\(map.cellCount)|\(map.edges.count)|\(map.meta.provinces.count)|\(h)"
        boundaryLock.lock()
        if let c = boundaryCache, c.key == key { boundaryLock.unlock(); return c.value }
        boundaryLock.unlock()
        func side(_ cell: Int32) -> Int {
            let c = Int(cell)
            guard c >= 0, c < map.cellCount, map.isLand(c) else { return -1 }
            return Int(map.province[c])
        }
        var groups = [Int64: [BorderCurve.Segment]]()
        for edge in map.edges {
            let a = side(edge.a), b = side(edge.b)
            guard a != b else { continue }
            let lo = min(a, b), hi = max(a, b)
            groups[Int64(lo) << 32 | Int64(hi & 0xFFFF_FFFF), default: []].append(.init(edge.x1, edge.y1, edge.x2, edge.y2))
        }
        let value = groups.keys.sorted().map { k -> (a: Int, b: Int, lines: [[Float]]) in
            (Int(Int32(truncatingIfNeeded: k >> 32)), Int(Int32(truncatingIfNeeded: k & 0xFFFF_FFFF)), BorderCurve.smooth(BorderCurve.chain(groups[k]!)))
        }
        boundaryLock.lock(); boundaryCache = (key, value); boundaryLock.unlock()
        return value
    }
    private static var boundaryCache: (key: String, value: [(a: Int, b: Int, lines: [[Float]])])?
    private static let boundaryLock = NSLock()

    /// The heavy map layers of one world, built off the main thread (world generation, loading) and
    /// handed to the renderer, which otherwise built them on the main thread as the map appeared —
    /// the hitch right after 创建世界. `key` ties them to the exact geometry and ownership.
    public struct Prepared: Sendable {
        public let key: String
        public let provinceLines: [Float], relief: [Float], outlines: [Float], icons: [Float]
        public let ornaments: [Float], fine: [Float], sea: [UInt8]
        /// RevealFields.swift.
        public let reveal: [Float]
    }
    public static func key(_ map: WorldMap) -> String {
        "\(map.cellCount)|\(map.meta.provinces.count)|\(map.width)x\(map.height)|\(map.rivers.count)|\(map.meta.cities.count)|"
            + map.meta.provinces.map { String($0.nation) }.joined(separator: ",") + "|" + map.meta.nations.map(\.line).joined(separator: ",")
    }
    public static func prepare(_ map: WorldMap) -> Prepared {
        Prepared(key: key(map), provinceLines: provinceLines(map).vertices, relief: relief(map).vertices, outlines: outlines(map).vertices, icons: cityIcons(map).vertices, ornaments: ornaments(map).vertices, fine: fineDetail(map).vertices, sea: waterlines(map), reveal: revealFields(map))
    }

    /// Province borders inside the land: every edge between two land provinces, joined and smoothed
    /// with the state lines' curve, in a thin translucent ink — clear at every zoom, as the original's
    /// are, and never the cells' stair steps.
    public static let provinceInk = RGB(hex: 0x4A4036)
    public static func provinceLines(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        // Inside a state only: where the owners differ, the state border is drawn on the same curve.
        for pair in boundaries(map) where pair.a >= 0 && pair.b >= 0 && owner(map, pair.a) == owner(map, pair.b) {
            for line in pair.lines { m.polyline(line, width: lineWidth * 0.42, provinceInk, alpha: 0.5) }
        }
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

    /// 博物馆级「御览手卷」装裱画框：
    /// 1. 柔和多层御案落影：整卷平铺于织锦案头，四周与轴杆下方投射细腻渐变暖影；
    /// 2. 宫廷三层绫锦装裱框（外紫檀细框 → 朱红锦边 → 御黄云锦绫边 + 菱格云锦暗纹 + 双道鎏金丝线 + 四角鎏金云纹包角 + 上下朱锦玉别子锦结）；
    /// 3. 左右 7 层圆柱立体紫檀卷轴杆 + 宣纸内卷高光边 + 鎏金雕花箍环 + 青碧玉葫芦轴头；
    /// 4. 画心内缘柔和卷纸弧面投影，拉远看全图宛如一卷恢宏考究的御批万里舆图。
    public static func scrollFrame(width w: Float, height h: Float) -> ColoredMesh {
        var m = ColoredMesh()
        let deskShadow = RGB(hex: 0x26180C)
        let paperCurl = RGB(hex: 0x563D22)
        let silkIvory = RGB(hex: 0xDFCFA9)
        let silkGold = RGB(hex: 0xC69B4D)
        let silkDeep = RGB(hex: 0x8A6326)
        let brocadeRed = RGB(hex: 0x7A2319)
        let brocadeDark = RGB(hex: 0x52150F)
        let woodShadow = RGB(hex: 0x1E0F07)
        let woodDark = RGB(hex: 0x321B0E)
        let woodMid = RGB(hex: 0x5F381E)
        let woodWarm = RGB(hex: 0x855530)
        let woodLight = RGB(hex: 0xB38353)
        let jadeDark = RGB(hex: 0x2E5548)
        let jade = RGB(hex: 0x4A7C6A)
        let jadeLight = RGB(hex: 0x8AB7A5)
        let goldBright = RGB(hex: 0xE8C87A)
        let ink = RGB(hex: 0x2B2014)

        func rect(_ x0: Float, _ y0: Float, _ x1: Float, _ y1: Float, _ c: RGB, alpha: Float = 1) {
            m.fill([x0, y0, x1, y0, x1, y1, x0, y1], c, alpha: alpha)
        }
        func vBand(_ x0: Float, _ x1: Float, _ y0: Float, _ y1: Float, _ c: RGB, left: Float, right: Float) {
            m.band(SIMD2(x0, y0), SIMD2(x0, y1), SIMD2(x1, y1), SIMD2(x1, y0), c, outer: left, inner: right)
        }
        func hBand(_ x0: Float, _ x1: Float, _ y0: Float, _ y1: Float, _ c: RGB, top: Float, bottom: Float) {
            m.band(SIMD2(x0, y0), SIMD2(x1, y0), SIMD2(x1, y1), SIMD2(x0, y1), c, outer: top, inner: bottom)
        }

        let unit = min(w, h)
        let curlShadow = unit * 0.048
        let trimH = unit * 0.036
        let rollerW = unit * 0.044
        let capOut = unit * 0.022
        let shadowSpread = unit * 0.042
        let leftEdge = -rollerW * 0.85
        let rightEdge = w + rollerW * 0.85

        // 0. 手卷投射在织锦御案上的柔和立体落影（上下四边自然羽化，彻底消除贴图生硬边界）
        hBand(leftEdge - shadowSpread * 0.3, rightEdge + shadowSpread * 0.3, -trimH - shadowSpread, -trimH, deskShadow, top: 0, bottom: 0.24)
        hBand(leftEdge - shadowSpread * 0.3, rightEdge + shadowSpread * 0.3, h + trimH, h + trimH + shadowSpread * 1.25, deskShadow, top: 0.34, bottom: 0)
        vBand(leftEdge - shadowSpread * 1.1, leftEdge, -trimH - capOut, h + trimH + capOut, deskShadow, left: 0, right: 0.30)
        vBand(rightEdge, rightEdge + shadowSpread * 1.2, -trimH - capOut, h + trimH + capOut, deskShadow, left: 0.32, right: 0)

        // 1. 画心内缘柔和宣纸卷曲投影（左右较深模拟卷轴弧面，上下轻柔烘托画心）
        vBand(0, curlShadow * 0.32, 0, h, deskShadow, left: 0.32, right: 0.13)
        vBand(curlShadow * 0.32, curlShadow * 1.15, 0, h, paperCurl, left: 0.13, right: 0)
        vBand(w - curlShadow * 0.32, w, 0, h, deskShadow, left: 0.13, right: 0.32)
        vBand(w - curlShadow * 1.15, w - curlShadow * 0.32, 0, h, paperCurl, left: 0, right: 0.13)
        hBand(0, w, 0, curlShadow * 0.55, paperCurl, top: 0.18, bottom: 0)
        hBand(0, w, h - curlShadow * 0.55, h, paperCurl, top: 0, bottom: 0.18)

        // 2. 上下三层御制绫锦装裱框（外深紫檀镶边 → 朱锦边 → 暖黄云锦绫边 + 菱格云锦暗纹 + 双鎏金丝线）
        let outerRim = trimH * 0.12
        let redBand = trimH * 0.36
        let innerSlip = trimH * 0.14
        // 顶边
        rect(-rollerW * 0.3, -trimH, w + rollerW * 0.3, 0, silkGold, alpha: 0.98)
        rect(-rollerW * 0.3, -innerSlip, w + rollerW * 0.3, 0, silkIvory, alpha: 0.96)
        rect(-rollerW * 0.3, -trimH + outerRim, w + rollerW * 0.3, -trimH + outerRim + redBand, brocadeRed, alpha: 0.98)
        rect(-rollerW * 0.3, -trimH, w + rollerW * 0.3, -trimH + outerRim, brocadeDark, alpha: 0.98)
        // 底边
        rect(-rollerW * 0.3, h, w + rollerW * 0.3, h + trimH, silkGold, alpha: 0.98)
        rect(-rollerW * 0.3, h, w + rollerW * 0.3, h + innerSlip, silkIvory, alpha: 0.96)
        rect(-rollerW * 0.3, h + trimH - outerRim - redBand, w + rollerW * 0.3, h + trimH - outerRim, brocadeRed, alpha: 0.98)
        rect(-rollerW * 0.3, h + trimH - outerRim, w + rollerW * 0.3, h + trimH, brocadeDark, alpha: 0.98)

        // 御绫双道鎏金丝线与云锦菱格暗纹
        let threadW = max(0.9, unit * 0.0014)
        for gy in [-trimH + outerRim, -trimH + outerRim + redBand, -innerSlip, h + innerSlip, h + trimH - outerRim - redBand, h + trimH - outerRim] {
            m.segment(0, gy, w, gy, width: threadW, goldBright, alpha: 0.88)
        }
        let brocadeStep = max(26, unit * 0.038)
        let diamondR = trimH * 0.19
        var bx: Float = brocadeStep * 0.5
        while bx < w - brocadeStep * 0.3 {
            for by in [-innerSlip - (trimH - outerRim - redBand - innerSlip) * 0.5, h + innerSlip + (trimH - outerRim - redBand - innerSlip) * 0.5] {
                m.polyline([bx - diamondR, by, bx, by - diamondR * 0.68, bx + diamondR, by, bx, by + diamondR * 0.68, bx - diamondR, by], width: threadW * 0.8, silkDeep, alpha: 0.48)
                m.disc(bx, by, radius: diamondR * 0.18, goldBright, alpha: 0.55, sides: 6)
            }
            bx += brocadeStep
        }

        // 上下正中「御制朱锦玉别子」锦带扣饰
        let midX = w * 0.5
        for (y0, y1) in [(-trimH * 1.04, -innerSlip * 0.7), (h + innerSlip * 0.7, h + trimH * 1.04)] {
            let cy = (y0 + y1) * 0.5
            let cw = trimH * 1.75
            rect(midX - cw, y0, midX + cw, y1, brocadeRed, alpha: 0.99)
            m.polyline([midX - cw + 1.4, y0 + 1.4, midX + cw - 1.4, y0 + 1.4, midX + cw - 1.4, y1 - 1.4, midX - cw + 1.4, y1 - 1.4, midX - cw + 1.4, y0 + 1.4], width: threadW, goldBright, alpha: 0.92)
            m.disc(midX, cy, radius: trimH * 0.24, jade, alpha: 0.98)
            m.disc(midX, cy, radius: trimH * 0.14, jadeLight, alpha: 0.92)
            m.disc(midX - cw * 0.58, cy, radius: trimH * 0.11, goldBright, alpha: 0.92)
            m.disc(midX + cw * 0.58, cy, radius: trimH * 0.11, goldBright, alpha: 0.92)
        }

        // 画心内外双层细金墨框 + 四角传统回纹鎏金包角
        let ruleIn = unit * 0.0085
        let ruleOut = unit * 0.0035
        m.polyline([ruleIn, ruleIn, w - ruleIn, ruleIn, w - ruleIn, h - ruleIn, ruleIn, h - ruleIn, ruleIn, ruleIn], width: max(1.0, unit * 0.0017), silkDeep, alpha: 0.65)
        m.polyline([ruleOut, ruleOut, w - ruleOut, ruleOut, w - ruleOut, h - ruleOut, ruleOut, h - ruleOut, ruleOut, ruleOut], width: max(0.75, unit * 0.0012), ink, alpha: 0.48)

        let cLen = unit * 0.044, cStep = unit * 0.013, cw = max(1.3, unit * 0.0023)
        for (sx, sy, ox, oy) in [(Float(1), Float(1), ruleIn, ruleIn), (-1, 1, w - ruleIn, ruleIn), (1, -1, ruleIn, h - ruleIn), (-1, -1, w - ruleIn, h - ruleIn)] {
            m.polyline([ox, oy + sy * cLen, ox, oy, ox + sx * cLen, oy], width: cw * 1.4, brocadeRed, alpha: 0.88)
            m.polyline([ox + sx * cStep, oy + sy * (cLen * 0.72), ox + sx * cStep, oy + sy * cStep, ox + sx * (cLen * 0.72), oy + sy * cStep], width: cw * 0.95, silkGold, alpha: 0.92)
            m.disc(ox + sx * cStep * 1.45, oy + sy * cStep * 1.45, radius: cw * 1.25, goldBright, alpha: 0.90)
        }

        // 3. 左右 7 层圆柱立体紫檀卷轴杆 + 多叠卷纸侧边 + 鎏金雕花箍环 + 青碧玉葫芦轴头
        func drawRoller(x0: Float, x1: Float, inwardRight: Bool) {
            let rw = x1 - x0
            let yTop = -trimH - capOut * 0.25, yBot = h + trimH + capOut * 0.25
            // 7 段圆柱平滑光照带
            rect(x0, yTop, x1, yBot, woodShadow, alpha: 0.99)
            rect(x0 + rw * 0.08, yTop, x1 - rw * 0.08, yBot, woodDark, alpha: 0.98)
            rect(x0 + rw * 0.17, yTop, x1 - rw * 0.17, yBot, woodMid, alpha: 0.96)
            let warmA = inwardRight ? x0 + rw * 0.24 : x0 + rw * 0.36
            let warmB = inwardRight ? x0 + rw * 0.64 : x0 + rw * 0.76
            rect(warmA, yTop, warmB, yBot, woodWarm, alpha: 0.94)
            let hiA = inwardRight ? x0 + rw * 0.32 : x0 + rw * 0.48
            let hiB = inwardRight ? x0 + rw * 0.52 : x0 + rw * 0.68
            rect(hiA, yTop, hiB, yBot, woodLight, alpha: 0.92)
            let specX = (hiA + hiB) * 0.5
            m.segment(specX, yTop, specX, yBot, width: max(1.2, rw * 0.09), goldBright, alpha: 0.52)

            // 卷入木轴的多叠宣纸高光卷边（让左右真像卷起来的圣旨纸筒）
            let curl1 = inwardRight ? x1 - rw * 0.07 : x0 + rw * 0.07
            let curl2 = inwardRight ? x1 - rw * 0.15 : x0 + rw * 0.15
            m.segment(curl1, 0, curl1, h, width: max(1.4, rw * 0.11), RGB(hex: 0xEFE3C8), alpha: 0.92)
            m.segment(curl2, 0, curl2, h, width: max(0.8, rw * 0.06), RGB(hex: 0xCBB994), alpha: 0.78)

            // 轴杆上下鎏金雕花箍环
            let ringH = trimH * 0.76
            for ry in [-trimH, h + trimH - ringH] {
                rect(x0 - rw * 0.07, ry, x1 + rw * 0.07, ry + ringH, silkDeep, alpha: 0.98)
                rect(x0 - rw * 0.04, ry + ringH * 0.12, x1 + rw * 0.04, ry + ringH * 0.88, silkGold, alpha: 0.98)
                rect(hiA, ry + ringH * 0.12, hiB, ry + ringH * 0.88, goldBright, alpha: 0.95)
                m.polyline([x0 - rw * 0.07, ry, x1 + rw * 0.07, ry], width: max(0.9, unit * 0.0014), ink, alpha: 0.58)
                m.polyline([x0 - rw * 0.07, ry + ringH, x1 + rw * 0.07, ry + ringH], width: max(0.9, unit * 0.0014), ink, alpha: 0.58)
            }

            // 上下两端青碧玉葫芦轴头 + 鎏金宝顶
            let capW = rw * 0.82, cx = (x0 + x1) * 0.5
            for (yA, yB, tipY) in [(yTop - capOut, yTop, yTop - capOut - capOut * 0.22), (yBot, yBot + capOut, yBot + capOut + capOut * 0.22)] {
                rect(cx - capW * 0.5, yA, cx + capW * 0.5, yB, jadeDark, alpha: 0.99)
                rect(cx - capW * 0.4, yA, cx + capW * 0.4, yB, jade, alpha: 0.98)
                rect(cx - capW * 0.18, yA, cx + capW * 0.14, yB, jadeLight, alpha: 0.92)
                // 鎏金宝顶圆帽
                m.disc(cx, tipY, radius: capW * 0.34, silkGold, alpha: 0.98, sides: 12)
                m.disc(cx - capW * 0.08, tipY, radius: capW * 0.16, goldBright, alpha: 0.95, sides: 10)
            }
        }
        drawRoller(x0: -rollerW * 0.85, x1: rollerW * 0.22, inwardRight: true)
        drawRoller(x0: w - rollerW * 0.22, x1: w + rollerW * 0.85, inwardRight: false)

        return m
    }

    /// The original's World.InitMapFrame on a map of up to 60000 cells: a paper band #DED1C5 of 6.96 world
    /// units along the map's edge and, outside it, black rules at 24 (0.15 thick), 25 and 30 (0.3 thick).
    /// One world unit is 1600/240 map units.
    public static func mapMount(width w: Float, height h: Float) -> ColoredMesh {
        var m = ColoredMesh()
        let unit: Float = 1600.0 / 240.0, paper = RGB(hex: 0xDED1C5), ink = RGB(hex: 0x4A3A28)
        func ring(_ offset: Float, _ thickness: Float, _ color: RGB) {
            let out = offset + thickness / 2, inn = offset - thickness / 2
            let a0 = SIMD2<Float>(-out, -out), a1 = SIMD2<Float>(w + out, -out), a2 = SIMD2<Float>(w + out, h + out), a3 = SIMD2<Float>(-out, h + out)
            let b0 = SIMD2<Float>(-inn, -inn), b1 = SIMD2<Float>(w + inn, -inn), b2 = SIMD2<Float>(w + inn, h + inn), b3 = SIMD2<Float>(-inn, h + inn)
            m.band(a0, a1, b1, b0, color, outer: 1, inner: 1)
            m.band(a1, a2, b2, b1, color, outer: 1, inner: 1)
            m.band(a2, a3, b3, b2, color, outer: 1, inner: 1)
            m.band(a3, a0, b0, b3, color, outer: 1, inner: 1)
        }
        ring(0, 6.96 * unit, paper)
        ring(25, 0.3 * unit, ink)
        ring(30, 0.3 * unit, ink)
        ring(24, 0.15 * unit, ink)
        return m
    }

    public enum CityMark: Equatable, Sendable { case capital, provinceSeat, city }
    /// The capital's outer ring in capital units (1.5 × cityUnit); the labels keep clear of it.
    public static let capitalOuter: Double = 2.2

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
                // 都城: larger than any seat and unmistakable — an ink rim, a gold ring, a vermilion heart.
                // Drawn a quarter larger than before (same rings), so it is found at a glance.
                let k = Float(capitalOuter / 1.75)
                m.disc(city.x, city.y, radius: 1.75 * k * c, black); m.disc(city.x, city.y, radius: 1.42 * k * c, RGB(0.9, 0.72, 0.3)); m.disc(city.x, city.y, radius: 1.08 * k * c, black)
                m.disc(city.x, city.y, radius: 0.82 * k * c, white); m.disc(city.x, city.y, radius: 0.5 * k * c, RGB(0.72, 0.16, 0.12))
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
        return NamingCatalog.stripStateTitle(name)
    }

    /// Lanes between harbour points, walking sea cells so the line stays on water. Colour is the
    /// measured sea-route grey. The stroke width is a presentation choice: the original's serialized
    /// width and dash are not in this client, so the line is solid.
    public static let seaLaneWidth: Float = 0.55
    public static func seaLanes(_ map: WorldMap, ports: [(x: Float, y: Float)]) -> ColoredMesh {
        var mesh = ColoredMesh()
        for lane in seaLanePaths(map, ports: ports) {
            mesh.polyline(lane.points.flatMap { [$0.x, $0.y] }, width: seaLaneWidth, MapPalette.seaLane, alpha: 0.95)
        }
        return mesh
    }
    /// The lanes themselves: for each harbour, the sea path to its nearest other harbour, with the
    /// two harbours' indices (the merchant ships sail them).
    public static func seaLanePaths(_ map: WorldMap, ports: [(x: Float, y: Float)]) -> [(from: Int, to: Int, points: [SIMD2<Float>])] {
        var out = [(from: Int, to: Int, points: [SIMD2<Float>])]()
        let points = ports.filter { $0.x.isFinite && $0.y.isFinite }
        guard points.count >= 2, points.count == ports.count, map.cellCount > 0, map.sites.count >= map.cellCount * 2 else { return out }
        var neighbors = [[Int]](repeating: [], count: map.cellCount)
        for edge in map.edges {
            let a = Int(edge.a), b = Int(edge.b)
            guard a >= 0, b >= 0, a < map.cellCount, b < map.cellCount, !map.isLand(a), !map.isLand(b) else { continue }
            neighbors[a].append(b); neighbors[b].append(a)
        }
        func site(_ cell: Int) -> SIMD2<Float> { SIMD2(map.sites[cell * 2], map.sites[cell * 2 + 1]) }
        var docks = [Int](), seenDock = Set<Int>(), portOf = [Int: Int]()
        for (pi, point) in points.enumerated() {
            var best = -1, bestD = Float.greatestFiniteMagnitude
            for cell in 0..<map.cellCount where !map.isLand(cell) {
                let s = site(cell), d = (s.x - point.x) * (s.x - point.x) + (s.y - point.y) * (s.y - point.y)
                if d < bestD { bestD = d; best = cell }
            }
            if best >= 0, seenDock.insert(best).inserted { docks.append(best); portOf[best] = pi }
        }
        guard docks.count >= 2 else { return out }
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
            out.append((portOf[start] ?? 0, portOf[end] ?? 0, chain.map(site)))
        }
        return out
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
