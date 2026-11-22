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
    /// 四顶点平滑色阶四边形（用于圆柱木轴、鎏金箍环、碧玉轴头与绫锦丝光的连续 GPU 高洛德光照）。
    public mutating func gradientQuad(_ a: SIMD2<Float>, _ b: SIMD2<Float>, _ c: SIMD2<Float>, _ d: SIMD2<Float>, _ ca: RGB, _ cb: RGB, _ cc: RGB, _ cd: RGB, alpha: Float = 1) {
        vertex(a.x, a.y, ca, alpha); vertex(b.x, b.y, cb, alpha); vertex(c.x, c.y, cc, alpha)
        vertex(a.x, a.y, ca, alpha); vertex(c.x, c.y, cc, alpha); vertex(d.x, d.y, cd, alpha)
    }
    /// 连续斜接（Miter-Joined）平滑折线带：相邻线段严格共享角平分线顶点，彻底消除旧版逐段方头重叠造成的「竹节黑点」与折角毛刺。
    public mutating func smoothPolyline(_ points: [Float], width: Float, _ color: RGB, alpha: Float) {
        let count = points.count / 2
        guard count >= 2, width > 0 else { return }
        var pts = [SIMD2<Float>]()
        pts.reserveCapacity(count)
        for i in 0..<count {
            let p = SIMD2(points[i * 2], points[i * 2 + 1])
            if let last = pts.last, hypot(p.x - last.x, p.y - last.y) < 1e-4 { continue }
            pts.append(p)
        }
        let m = pts.count
        guard m >= 2 else { return }
        let closed = m >= 3 && hypot(pts[0].x - pts[m - 1].x, pts[0].y - pts[m - 1].y) < 1e-3
        let segCount = m - 1
        var normals = [SIMD2<Float>](repeating: .zero, count: segCount)
        for i in 0..<segCount {
            let d = pts[i + 1] - pts[i]
            let len = max(1e-5, (d.x * d.x + d.y * d.y).squareRoot())
            normals[i] = SIMD2(-d.y / len, d.x / len)
        }
        let half = width * 0.5
        var miters = [SIMD2<Float>](repeating: .zero, count: m)
        for i in 0..<m {
            let nPrev: SIMD2<Float>
            let nNext: SIMD2<Float>
            if i == 0 {
                nPrev = closed ? normals[segCount - 1] : normals[0]
                nNext = normals[0]
            } else if i == m - 1 {
                nPrev = normals[segCount - 1]
                nNext = closed ? normals[0] : normals[segCount - 1]
            } else {
                nPrev = normals[i - 1]
                nNext = normals[i]
            }
            let sum = nPrev + nNext
            let sLen = (sum.x * sum.x + sum.y * sum.y).squareRoot()
            if sLen < 1e-4 {
                miters[i] = nNext * half
            } else {
                let u = sum / sLen
                let dot = max(0.42, abs(u.x * nNext.x + u.y * nNext.y))
                let scale = min(1.55, 1.0 / dot) * half
                miters[i] = u * scale
            }
        }
        for i in 0..<segCount {
            let p0 = pts[i], p1 = pts[i + 1]
            let m0 = miters[i], m1 = miters[i + 1]
            let l0 = p0 + m0, r0 = p0 - m0
            let l1 = p1 + m1, r1 = p1 - m1
            vertex(l0.x, l0.y, color, alpha); vertex(r0.x, r0.y, color, alpha); vertex(l1.x, l1.y, color, alpha)
            vertex(l1.x, l1.y, color, alpha); vertex(r0.x, r0.y, color, alpha); vertex(r1.x, r1.y, color, alpha)
        }
    }

    /// 连续斜接（Miter-Joined）单侧水彩渐隐内晕带：外缘紧贴国界主线（`edgeAlpha`），向本国领土内侧平滑过渡至完全透明（`innerAlpha = 0`），
    /// 彻底消除旧版偏移折线的双硬边、拐角断裂与重叠黑斑，呈现古典手绘舆图般柔润通透的国界内晕。
    public mutating func innerGradientRibbon(_ points: [Float], width: Float, side: Float, _ color: RGB, edgeAlpha: Float, innerAlpha: Float = 0) {
        let count = points.count / 2
        guard count >= 2, width > 0, side != 0 else { return }
        var pts = [SIMD2<Float>]()
        pts.reserveCapacity(count)
        for i in 0..<count {
            let p = SIMD2(points[i * 2], points[i * 2 + 1])
            if let last = pts.last, hypot(p.x - last.x, p.y - last.y) < 1e-4 { continue }
            pts.append(p)
        }
        let m = pts.count
        guard m >= 2 else { return }
        let closed = m >= 3 && hypot(pts[0].x - pts[m - 1].x, pts[0].y - pts[m - 1].y) < 1e-3
        let segCount = m - 1
        let sgn: Float = side >= 0 ? 1 : -1
        var normals = [SIMD2<Float>](repeating: .zero, count: segCount)
        for i in 0..<segCount {
            let d = pts[i + 1] - pts[i]
            let len = max(1e-5, (d.x * d.x + d.y * d.y).squareRoot())
            normals[i] = SIMD2(-d.y / len * sgn, d.x / len * sgn)
        }
        var miters = [SIMD2<Float>](repeating: .zero, count: m)
        for i in 0..<m {
            let nPrev: SIMD2<Float>
            let nNext: SIMD2<Float>
            if i == 0 {
                nPrev = closed ? normals[segCount - 1] : normals[0]
                nNext = normals[0]
            } else if i == m - 1 {
                nPrev = normals[segCount - 1]
                nNext = closed ? normals[0] : normals[segCount - 1]
            } else {
                nPrev = normals[i - 1]
                nNext = normals[i]
            }
            let sum = nPrev + nNext
            let sLen = (sum.x * sum.x + sum.y * sum.y).squareRoot()
            if sLen < 1e-4 {
                miters[i] = nNext * width
            } else {
                let u = sum / sLen
                let dot = max(0.45, abs(u.x * nNext.x + u.y * nNext.y))
                let scale = min(1.45, 1.0 / dot) * width
                miters[i] = u * scale
            }
        }
        for i in 0..<segCount {
            let p0 = pts[i], p1 = pts[i + 1]
            let q0 = p0 + miters[i], q1 = p1 + miters[i + 1]
            vertex(p0.x, p0.y, color, edgeAlpha); vertex(q0.x, q0.y, color, innerAlpha); vertex(p1.x, p1.y, color, edgeAlpha)
            vertex(p1.x, p1.y, color, edgeAlpha); vertex(q0.x, q0.y, color, innerAlpha); vertex(q1.x, q1.y, color, innerAlpha)
        }
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
        // 高山提亮也纳入光照上限，保留雪峰和向阳坡的纹理。
        let lx: Float = -0.707, ly: Float = -0.707
        return (0..<map.cellCount).map { c in
            guard map.isLand(c) else { return 1 }
            let lit = gx[c] * lx + gy[c] * ly
            let elevBoost = max(0, Float(map.elevation[c]) - 56) * 0.0014
            return min(1.14, 1 + max(-0.16, lit * 0.095) + elevBoost)
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

    /// 三层清晰国界体系（参考经典大战略地图与宋元古舆图）：
    /// 1. 两侧本国加深色内晕边（沿着各自疆域内侧铺展，彻底区分相邻两国的归属范围）；
    /// 2. 极轻暖宣纸分隔微亮边（防止深色大国相接时颜色互咬）；
    /// 3. 锐利深墨脊国界主线（让国界与省界形成清晰视觉层级，全局整洁分明毫不缭乱）；
    /// `wide` 选中国家则在最顶层叠加鎏金亮晕与醒目朱墨国界。
    public static func outlines(_ map: WorldMap, wide: Set<Int> = []) -> ColoredMesh {
        let lineColors = map.meta.nations.map { RGB(css: $0.line) ?? RGB(0.24, 0.20, 0.16) }
        let fillColors = map.meta.nations.map { RGB(css: $0.color) ?? RGB(0.55, 0.50, 0.45) }
        let provs = map.meta.provinces
        let frontierInk = RGB(hex: 0x241B13)
        let frontierIvory = RGB(hex: 0xF7EFE0)
        let coastInk = RGB(hex: 0x3D352B)
        var m = ColoredMesh()

        // 1. 清晰柔和的海岸墨线（略细于陆地国界，主次分明）
        for s in stride(from: 0, to: map.coast.count, by: 4) {
            m.segment(map.coast[s], map.coast[s + 1], map.coast[s + 2], map.coast[s + 3], width: lineWidth * 0.92, coastInk, alpha: 0.88)
        }

        let allPairs = boundaries(map)
        var landFrontierLines: [[Float]] = []
        var emphasisLines: [(lines: [[Float]], color: RGB)] = []

        func ribbonColor(_ n: Int) -> RGB {
            let f = fillColors[n], l = lineColors[n]
            // 结合饱和国色与加深界色，令本国内晕边明艳醒目而不发脏
            return RGB(max(0, min(1, f.r * 0.48 + l.r * 0.52)),
                       max(0, min(1, f.g * 0.48 + l.g * 0.52)),
                       max(0, min(1, f.b * 0.48 + l.b * 0.52)))
        }
        /// 判定该段折线的左法线 (-dy, dx) 是否指向参考州中心：用于把每个国家的内晕边严密偏移到各自疆域内侧。
        func sideSign(_ line: [Float], toward provIndex: Int) -> Float {
            guard provs.indices.contains(provIndex), line.count >= 4 else { return 0 }
            let px = provs[provIndex].x, py = provs[provIndex].y
            let mid = (line.count / 4) * 2
            let i0 = max(0, min(line.count - 4, mid))
            let x1 = line[i0], y1 = line[i0 + 1], x2 = line[i0 + 2], y2 = line[i0 + 3]
            let dx = x2 - x1, dy = y2 - y1
            let mx = (x1 + x2) * 0.5, my = (y1 + y2) * 0.5
            let dot = (-dy) * (px - mx) + dx * (py - my)
            return dot >= 0 ? 1 : -1
        }

        // 2. 各国疆域内侧水彩渐隐晕边（外缘紧贴国界主线、向内平滑渐隐至 0 透明度，零双硬边、零拐角断裂）
        for pair in allPairs {
            let oa = owner(map, pair.a), ob = owner(map, pair.b)
            guard oa != ob else { continue }
            let isLandBorder = oa != nil && ob != nil
            if isLandBorder { landFrontierLines.append(contentsOf: pair.lines) }
            if let na = oa, na < lineColors.count {
                if wide.contains(na) { emphasisLines.append((pair.lines, lineColors[na])) }
                let rc = ribbonColor(na)
                let wRim = isLandBorder ? lineWidth * 2.55 : lineWidth * 1.38
                for line in pair.lines {
                    let sgn = sideSign(line, toward: pair.a)
                    if sgn != 0 { m.innerGradientRibbon(line, width: wRim, side: sgn, rc, edgeAlpha: isLandBorder ? 0.56 : 0.30, innerAlpha: 0.0) }
                }
            }
            if let nb = ob, nb < lineColors.count {
                if wide.contains(nb) { emphasisLines.append((pair.lines, lineColors[nb])) }
                let rc = ribbonColor(nb)
                let wRim = isLandBorder ? lineWidth * 2.55 : lineWidth * 1.38
                for line in pair.lines {
                    let sgn = sideSign(line, toward: pair.b)
                    if sgn != 0 { m.innerGradientRibbon(line, width: wRim, side: sgn, rc, edgeAlpha: isLandBorder ? 0.56 : 0.30, innerAlpha: 0.0) }
                }
            }
        }

        // 3. 陆地国界连续斜接暖白微衬边 + 锐利浓墨主脊线（无重叠竹节黑点，一眼区分相邻列国）
        for line in landFrontierLines {
            m.smoothPolyline(line, width: lineWidth * 1.38, frontierIvory, alpha: 0.24)
        }
        for line in landFrontierLines {
            m.smoothPolyline(line, width: lineWidth * 0.94, frontierInk, alpha: 0.92)
        }

        // 4. 选中国家国界置于最顶层：宣金亮边 + 深朱红实线，轮廓清晰聚焦
        if !emphasisLines.isEmpty {
            let halo = RGB(0.99, 0.94, 0.72)
            let seal = RGB(0.76, 0.17, 0.12)
            for item in emphasisLines {
                for line in item.lines { m.smoothPolyline(line, width: lineWidth * 4.5, halo, alpha: 0.80) }
            }
            for item in emphasisLines {
                let c = RGB(item.color.r * 0.35 + seal.r * 0.65, item.color.g * 0.35 + seal.g * 0.65, item.color.b * 0.35 + seal.b * 0.65)
                for line in item.lines { m.smoothPolyline(line, width: lineWidth * 2.35, c, alpha: 1) }
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
        // 州郡内界采用无重叠斜接细丝，拉近匀净无竹节黑点、远观绝不与国界主脊线抢戏。
        for pair in boundaries(map) where pair.a >= 0 && pair.b >= 0 && owner(map, pair.a) == owner(map, pair.b) {
            for line in pair.lines { m.smoothPolyline(line, width: lineWidth * 0.28, provinceInk, alpha: 0.23) }
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

    /// 100 分博物馆级「御览万里手卷」装裱画框（彻底根治四角重叠暗斑与轴杆光照矛盾 Bug）：
    /// 1. 严格 45° 斜接羽化落影（与全局西北日照一致，向东南柔和投射，零重叠、零矩形硬边）；
    /// 2. 24 段连续高洛德圆柱光照紫檀卷轴（双轴统一西北受光，附柔和木纹、镜面高光、卷纸多层断面、鎏金雕花轴箍、雕刻青碧玉葫芦轴头与朱锦金穗流苏）；
    /// 3. 御制多层云锦绫裱（立体斜切外包边 → 朱锦边 → 暖金云锦菱格如意花纹 → 隔水牙白内衬 → 四角双层鎏金回纹包角 → 上下带影嵌玉朱锦玉别子）；
    /// 4. 画心内缘 45° 无缝斜接宣纸卷曲微影（左深右浅贴合西北来光）。
    public static func scrollFrame(width w: Float, height h: Float) -> ColoredMesh {
        var m = ColoredMesh()
        let deskShadow = RGB(hex: 0x201309)
        let paperCurl = RGB(hex: 0x4E361E)
        let silkIvory = RGB(hex: 0xE5D8B8)
        let silkGoldLight = RGB(hex: 0xD8B467)
        let silkGold = RGB(hex: 0xC29648)
        let silkDeep = RGB(hex: 0x825A20)
        let brocadeLit = RGB(hex: 0x8F2D21)
        let brocadeRed = RGB(hex: 0x762118)
        let brocadeDark = RGB(hex: 0x47120C)
        let woodDark = RGB(hex: 0x25130A)
        let woodMid = RGB(hex: 0x5C351C)
        let woodHi = RGB(hex: 0xB88552)
        let jadeDark = RGB(hex: 0x24473B)
        let jadeMid = RGB(hex: 0x497D6A)
        let jadeHi = RGB(hex: 0x9AD0BB)
        let goldDark = RGB(hex: 0x6D4D1B)
        let goldMid = RGB(hex: 0xC89C47)
        let goldBright = RGB(hex: 0xF5DD99)
        let paperEdge = RGB(hex: 0xEFE4CA)
        let paperEdgeShade = RGB(hex: 0xC5B28D)
        let ink = RGB(hex: 0x281D12)

        func lerpRGB(_ a: RGB, _ b: RGB, _ t: Float) -> RGB {
            let k = max(0, min(1, t))
            return RGB(a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k)
        }
        func rect(_ x0: Float, _ y0: Float, _ x1: Float, _ y1: Float, _ c: RGB, alpha: Float = 1) {
            m.fill([x0, y0, x1, y0, x1, y1, x0, y1], c, alpha: alpha)
        }
        /// 严格 45° 斜接羽化外阴影环：四边在转角严丝合缝，绝不重叠产生黑方块！
        func miterShadowRing(x0: Float, y0: Float, x1: Float, y1: Float, spreadL: Float, spreadT: Float, spreadR: Float, spreadB: Float, color: RGB, innerA: Float, outerA: Float = 0) {
            let iTL = SIMD2<Float>(x0, y0), iTR = SIMD2<Float>(x1, y0), iBR = SIMD2<Float>(x1, y1), iBL = SIMD2<Float>(x0, y1)
            let oTL = SIMD2<Float>(x0 - spreadL, y0 - spreadT), oTR = SIMD2<Float>(x1 + spreadR, y0 - spreadT)
            let oBR = SIMD2<Float>(x1 + spreadR, y1 + spreadB), oBL = SIMD2<Float>(x0 - spreadL, y1 + spreadB)
            m.band(oTL, oTR, iTR, iTL, color, outer: outerA, inner: innerA * 0.72)
            m.band(oTR, oBR, iBR, iTR, color, outer: outerA, inner: innerA)
            m.band(oBR, oBL, iBL, iBR, color, outer: outerA, inner: innerA * 1.08)
            m.band(oBL, oTL, iTL, iBL, color, outer: outerA, inner: innerA * 0.78)
        }
        /// 连续 24 段圆柱 Phong 光照（统一西北来光 lx = -0.62, lz = 0.78，镜面与漫反射自然平滑过渡）。
        func cylinder(_ x0: Float, _ x1: Float, _ y0: Float, _ y1: Float, dark: RGB, mid: RGB, hi: RGB, spec: RGB, specPow: Float = 18, specAmt: Float = 0.42, steps: Int = 20) {
            let dx = (x1 - x0) / Float(steps)
            func shadeAt(_ u: Float) -> RGB {
                // u in 0...1 -> theta in -pi/2 ... +pi/2
                let theta = (u - 0.5) * .pi
                let nx = sin(theta), nz = max(0.05, cos(theta))
                let diff = max(0, nx * (-0.62) + nz * 0.78)
                let bounce = max(0, nx * 0.45 + nz * 0.25) * 0.16
                let lum = min(1, diff * 0.88 + bounce + 0.08)
                // 半程向量（西北主光 + 正视视角）产生丝缎高光带
                let hx: Float = -0.35, hz: Float = 0.936
                let sp = powf(max(0, nx * hx + nz * hz), specPow) * specAmt
                var base = lum < 0.5 ? lerpRGB(dark, mid, lum * 2) : lerpRGB(mid, hi, (lum - 0.5) * 2)
                base = lerpRGB(base, spec, min(0.85, sp))
                return base
            }
            for s in 0..<steps {
                let u0 = Float(s) / Float(steps), u1 = Float(s + 1) / Float(steps)
                let xa = x0 + dx * Float(s), xb = x0 + dx * Float(s + 1)
                let c0 = shadeAt(u0), c1 = shadeAt(u1)
                m.gradientQuad(SIMD2(xa, y0), SIMD2(xb, y0), SIMD2(xb, y1), SIMD2(xa, y1), c0, c1, c1, c0, alpha: 1)
            }
        }
        /// 柔和椭圆形定向落影（用于轴头与锦扣底部）。
        func softEllipseShadow(cx: Float, cy: Float, rx: Float, ry: Float, alpha: Float) {
            for layer in 0..<3 {
                let s: Float = 1.0 + Float(layer) * 0.34
                let a = alpha * (layer == 0 ? 0.52 : layer == 1 ? 0.28 : 0.14)
                var pts = [Float]()
                for k in 0..<18 {
                    let ang = Float(k) / 18 * 2 * .pi
                    pts.append(cx + cos(ang) * rx * s)
                    pts.append(cy + sin(ang) * ry * s)
                }
                m.fill(pts, deskShadow, alpha: a)
            }
        }

        let unit = min(w, h)
        let trimH = unit * 0.040
        let rollerW = unit * 0.048
        let capOut = unit * 0.028
        let leftX0 = -rollerW * 0.86, leftX1 = rollerW * 0.20
        let rightX0 = w - rollerW * 0.20, rightX1 = w + rollerW * 0.86
        let rollTop = -trimH - capOut * 0.18, rollBot = h + trimH + capOut * 0.18

        // 0. 无缝 45° 斜接御案定向落影（西北主光 → 东南柔影，零重叠黑块！）
        miterShadowRing(
            x0: leftX0, y0: -trimH, x1: rightX1, y1: h + trimH,
            spreadL: unit * 0.022, spreadT: unit * 0.020, spreadR: unit * 0.052, spreadB: unit * 0.058,
            color: deskShadow, innerA: 0.34, outerA: 0
        )
        // 第二层远距柔和环境光遮蔽（让整卷稳稳贴合在锦案上）
        miterShadowRing(
            x0: leftX0 - unit * 0.008, y0: -trimH - unit * 0.006, x1: rightX1 + unit * 0.018, y1: h + trimH + unit * 0.020,
            spreadL: unit * 0.036, spreadT: unit * 0.032, spreadR: unit * 0.078, spreadB: unit * 0.084,
            color: deskShadow, innerA: 0.15, outerA: 0
        )

        // 1. 画心内缘 45° 无缝斜接宣纸卷曲投影（左卷轴投下暖影，上下微阴，零转角重影！）
        let cL = unit * 0.052, cR = unit * 0.036, cT = unit * 0.026, cB = unit * 0.020
        let oTL = SIMD2<Float>(0, 0), oTR = SIMD2<Float>(w, 0), oBR = SIMD2<Float>(w, h), oBL = SIMD2<Float>(0, h)
        let iTL = SIMD2<Float>(cL, cT), iTR = SIMD2<Float>(w - cR, cT), iBR = SIMD2<Float>(w - cR, h - cB), iBL = SIMD2<Float>(cL, h - cB)
        // 外近轴深影 + 内缓释羽化
        let mTL = SIMD2<Float>(cL * 0.28, cT * 0.28), mTR = SIMD2<Float>(w - cR * 0.28, cT * 0.28)
        let mBR = SIMD2<Float>(w - cR * 0.28, h - cB * 0.28), mBL = SIMD2<Float>(cL * 0.28, h - cB * 0.28)
        m.band(oBL, oTL, mTL, mBL, deskShadow, outer: 0.30, inner: 0.13)
        m.band(mBL, mTL, iTL, iBL, paperCurl, outer: 0.13, inner: 0)
        m.band(oTR, oBR, mBR, mTR, deskShadow, outer: 0.22, inner: 0.09)
        m.band(mTR, mBR, iBR, iTR, paperCurl, outer: 0.09, inner: 0)
        m.band(oTL, oTR, mTR, mTL, deskShadow, outer: 0.20, inner: 0.08)
        m.band(mTL, mTR, iTR, iTL, paperCurl, outer: 0.08, inner: 0)
        m.band(oBR, oBL, mBL, mBR, paperCurl, outer: 0.13, inner: 0)

        // 2. 上下御制多层云锦装裱边（带丝绸斜向光泽渐变与立体包边）
        let outerRim = trimH * 0.13
        let redBand = trimH * 0.34
        let innerSlip = trimH * 0.14
        let frameX0 = leftX1 - rollerW * 0.25, frameX1 = rightX0 + rollerW * 0.25
        // 顶边（向阳微亮）
        m.gradientQuad(SIMD2(frameX0, -trimH), SIMD2(frameX1, -trimH), SIMD2(frameX1, 0), SIMD2(frameX0, 0), silkGoldLight, silkGold, silkGold, silkGoldLight, alpha: 0.99)
        rect(frameX0, -innerSlip, frameX1, 0, silkIvory, alpha: 0.98)
        m.gradientQuad(SIMD2(frameX0, -trimH + outerRim), SIMD2(frameX1, -trimH + outerRim), SIMD2(frameX1, -trimH + outerRim + redBand), SIMD2(frameX0, -trimH + outerRim + redBand), brocadeLit, brocadeRed, brocadeRed, brocadeLit, alpha: 0.99)
        rect(frameX0, -trimH, frameX1, -trimH + outerRim, brocadeDark, alpha: 0.99)
        // 顶边最外缘受光金线
        let threadW = max(0.85, unit * 0.0014)
        m.segment(frameX0, -trimH + outerRim * 0.45, frameX1, -trimH + outerRim * 0.45, width: threadW * 0.7, goldBright, alpha: 0.45)

        // 底边（略沉背阴）
        m.gradientQuad(SIMD2(frameX0, h), SIMD2(frameX1, h), SIMD2(frameX1, h + trimH), SIMD2(frameX0, h + trimH), silkGold, silkDeep, silkDeep, silkGold, alpha: 0.99)
        rect(frameX0, h, frameX1, h + innerSlip, silkIvory, alpha: 0.97)
        m.gradientQuad(SIMD2(frameX0, h + trimH - outerRim - redBand), SIMD2(frameX1, h + trimH - outerRim - redBand), SIMD2(frameX1, h + trimH - outerRim), SIMD2(frameX0, h + trimH - outerRim), brocadeRed, brocadeDark, brocadeDark, brocadeRed, alpha: 0.99)
        rect(frameX0, h + trimH - outerRim, frameX1, h + trimH, brocadeDark, alpha: 0.99)

        // 六道贯通全幅的鎏金丝线（左右严丝合缝衔入卷轴）
        for gy in [-trimH + outerRim, -trimH + outerRim + redBand, -innerSlip, h + innerSlip, h + trimH - outerRim - redBand, h + trimH - outerRim] {
            m.segment(frameX0, gy, frameX1, gy, width: threadW, goldBright, alpha: 0.88)
        }
        // 云锦绫面细密菱格如意暗花（交错重菱＋中心金蕊）
        let brocadeStep = max(24, unit * 0.034)
        let diamondR = trimH * 0.21
        let topMidY = -innerSlip - (trimH - outerRim - redBand - innerSlip) * 0.5
        let botMidY = h + innerSlip + (trimH - outerRim - redBand - innerSlip) * 0.5
        var bx: Float = brocadeStep * 0.5
        while bx < w - brocadeStep * 0.3 {
            for by in [topMidY, botMidY] {
                m.polyline([bx - diamondR, by, bx, by - diamondR * 0.65, bx + diamondR, by, bx, by + diamondR * 0.65, bx - diamondR, by], width: threadW * 0.78, silkDeep, alpha: 0.52)
                m.polyline([bx - diamondR * 0.56, by, bx, by - diamondR * 0.36, bx + diamondR * 0.56, by, bx, by + diamondR * 0.36, bx - diamondR * 0.56, by], width: threadW * 0.55, goldBright, alpha: 0.48)
                m.disc(bx, by, radius: diamondR * 0.14, goldBright, alpha: 0.68, sides: 6)
            }
            bx += brocadeStep
        }

        // 上下正中「嵌玉朱锦玉别子」锦带扣饰（带柔和东南落影与玉面高光）
        let midX = w * 0.5
        for (y0, y1) in [(-trimH * 1.05, -innerSlip * 0.65), (h + innerSlip * 0.65, h + trimH * 1.05)] {
            let cy = (y0 + y1) * 0.5, cw = trimH * 1.85
            // 锦扣东南投影
            rect(midX - cw + 2.5, y0 + 2.5, midX + cw + 3.2, y1 + 3.2, deskShadow, alpha: 0.28)
            rect(midX - cw, y0, midX + cw, y1, brocadeRed, alpha: 0.99)
            m.gradientQuad(SIMD2(midX - cw, y0), SIMD2(midX + cw, y0), SIMD2(midX + cw, cy), SIMD2(midX - cw, cy), brocadeLit, brocadeRed, brocadeRed, brocadeRed, alpha: 0.85)
            m.polyline([midX - cw + 1.5, y0 + 1.5, midX + cw - 1.5, y0 + 1.5, midX + cw - 1.5, y1 - 1.5, midX - cw + 1.5, y1 - 1.5, midX - cw + 1.5, y0 + 1.5], width: threadW * 1.05, goldBright, alpha: 0.94)
            // 中心嵌青碧玉（暗底 → 玉身 → 西北晶润高光）
            m.disc(midX + 0.8, cy + 1.0, radius: trimH * 0.29, deskShadow, alpha: 0.32, sides: 16)
            m.disc(midX, cy, radius: trimH * 0.28, goldMid, alpha: 0.98, sides: 16)
            m.disc(midX, cy, radius: trimH * 0.23, jadeDark, alpha: 0.98, sides: 16)
            m.disc(midX - 0.5, cy - 0.5, radius: trimH * 0.19, jadeMid, alpha: 0.96, sides: 14)
            m.disc(midX - trimH * 0.06, cy - trimH * 0.06, radius: trimH * 0.09, jadeHi, alpha: 0.92, sides: 10)
            // 左右鎏金双铆钉
            for sx in [Float(-1), 1] {
                let rx = midX + sx * cw * 0.62
                m.disc(rx + 0.5, cy + 0.6, radius: trimH * 0.12, deskShadow, alpha: 0.28, sides: 10)
                m.disc(rx, cy, radius: trimH * 0.11, goldMid, alpha: 0.96, sides: 10)
                m.disc(rx - 0.4, cy - 0.4, radius: trimH * 0.055, goldBright, alpha: 0.95, sides: 8)
            }
        }

        // 画心内外双层细金墨框 + 四角传统双层回纹鎏金包角
        let ruleIn = unit * 0.009, ruleOut = unit * 0.0035
        m.polyline([ruleIn, ruleIn, w - ruleIn, ruleIn, w - ruleIn, h - ruleIn, ruleIn, h - ruleIn, ruleIn, ruleIn], width: max(1.0, unit * 0.0017), silkDeep, alpha: 0.68)
        m.polyline([ruleOut, ruleOut, w - ruleOut, ruleOut, w - ruleOut, h - ruleOut, ruleOut, h - ruleOut, ruleOut, ruleOut], width: max(0.75, unit * 0.0012), ink, alpha: 0.52)

        let cLen = unit * 0.048, cStep = unit * 0.013, cw = max(1.3, unit * 0.0023)
        for (sx, sy, ox, oy) in [(Float(1), Float(1), ruleIn, ruleIn), (-1, 1, w - ruleIn, ruleIn), (1, -1, ruleIn, h - ruleIn), (-1, -1, w - ruleIn, h - ruleIn)] {
            m.polyline([ox, oy + sy * cLen, ox, oy, ox + sx * cLen, oy], width: cw * 1.45, brocadeRed, alpha: 0.90)
            m.polyline([ox + sx * cStep, oy + sy * (cLen * 0.78), ox + sx * cStep, oy + sy * cStep, ox + sx * (cLen * 0.78), oy + sy * cStep], width: cw * 0.95, silkGoldLight, alpha: 0.94)
            // 回纹拐钩
            let hook = cStep * 1.9
            m.polyline([ox + sx * hook, oy + sy * (cStep * 2.7), ox + sx * hook, oy + sy * hook, ox + sx * (cStep * 2.7), oy + sy * hook], width: cw * 0.72, goldBright, alpha: 0.85)
            m.disc(ox + sx * cStep * 1.4, oy + sy * cStep * 1.4, radius: cw * 1.15, goldBright, alpha: 0.92, sides: 10)
        }

        // 3. 左右 24 段光滑圆柱立体紫檀卷轴 + 卷纸侧叠断面 + 鎏金雕花轴箍 + 雕刻青碧玉葫芦轴头 + 朱锦丝绦
        func drawRoller(x0: Float, x1: Float, inwardRight: Bool, addTassel: Bool) {
            let rw = x1 - x0, cx = (x0 + x1) * 0.5
            let capW = rw * 0.82

            // 轴头下方独立椭圆柔影（投向东南方，严密吻合西北日照）
            softEllipseShadow(cx: cx + rw * 0.16, cy: rollTop - capOut * 0.5 + rw * 0.18, rx: capW * 0.62, ry: capOut * 0.72, alpha: 0.34)
            softEllipseShadow(cx: cx + rw * 0.16, cy: rollBot + capOut * 0.5 + rw * 0.22, rx: capW * 0.66, ry: capOut * 0.78, alpha: 0.38)

            // 圆柱木轴主体（平滑连续 20 段 Phong 漫反射＋丝缎镜面高光）
            cylinder(x0, x1, rollTop, rollBot, dark: woodDark, mid: woodMid, hi: woodHi, spec: goldBright, specPow: 22, specAmt: 0.34, steps: 20)

            // 细腻紫檀木纹直丝（极低透明度增加手工打磨实木触感）
            for g in [Float(0.22), 0.38, 0.56, 0.74] {
                let gx = x0 + rw * g
                m.segment(gx, rollTop + 2, gx, rollBot - 2, width: max(0.55, rw * 0.025), woodDark, alpha: 0.22)
            }

            // 卷入木轴的多叠宣纸高光卷边与上下卷纸断面（立显真实圣旨卷筒层次）
            let curl1 = inwardRight ? x1 - rw * 0.05 : x0 + rw * 0.05
            let curl2 = inwardRight ? x1 - rw * 0.12 : x0 + rw * 0.12
            let curl3 = inwardRight ? x1 - rw * 0.18 : x0 + rw * 0.18
            m.segment(curl1, 0, curl1, h, width: max(1.6, rw * 0.11), paperEdge, alpha: 0.95)
            m.segment(curl2, 0, curl2, h, width: max(0.95, rw * 0.065), paperEdgeShade, alpha: 0.85)
            m.segment(curl3, 0, curl3, h, width: max(0.7, rw * 0.045), deskShadow, alpha: 0.45)

            // 上下鎏金雕花圆柱箍环（与木轴同一西北光照）
            let ringH = trimH * 0.78
            for ry in [-trimH, h + trimH - ringH] {
                let rx0 = x0 - rw * 0.075, rx1 = x1 + rw * 0.075
                cylinder(rx0, rx1, ry, ry + ringH, dark: goldDark, mid: goldMid, hi: goldBright, spec: RGB(1, 0.97, 0.86), specPow: 16, specAmt: 0.52, steps: 14)
                // 上下凸棱与中腰雕刻细线
                m.segment(rx0, ry, rx1, ry, width: max(1.0, unit * 0.0016), ink, alpha: 0.65)
                m.segment(rx0, ry + ringH, rx1, ry + ringH, width: max(1.0, unit * 0.0016), ink, alpha: 0.65)
                m.segment(rx0 + 1, ry + ringH * 0.22, rx1 - 1, ry + ringH * 0.22, width: threadW * 0.75, goldDark, alpha: 0.55)
                m.segment(rx0 + 1, ry + ringH * 0.78, rx1 - 1, ry + ringH * 0.78, width: threadW * 0.75, goldDark, alpha: 0.55)
            }

            // 上下两端雕刻青碧玉葫芦轴头 + 鎏金领环 + 圆润玉顶金珠
            for (yA, yB, isTop) in [(rollTop - capOut, rollTop, true), (rollBot, rollBot + capOut, false)] {
                let neckY = isTop ? yB - capOut * 0.22 : yA + capOut * 0.22
                let bodyA = isTop ? yA + capOut * 0.12 : neckY
                let bodyB = isTop ? neckY : yB - capOut * 0.12
                // 鎏金颈环
                cylinder(cx - capW * 0.54, cx + capW * 0.54, min(neckY, isTop ? yB : yA), max(neckY, isTop ? yB : yA), dark: goldDark, mid: goldMid, hi: goldBright, spec: RGB(1, 0.97, 0.88), specPow: 14, specAmt: 0.5, steps: 10)
                // 碧玉主体（20 段柔和温润玉光）
                cylinder(cx - capW * 0.48, cx + capW * 0.48, bodyA, bodyB, dark: jadeDark, mid: jadeMid, hi: jadeHi, spec: RGB(0.92, 0.99, 0.96), specPow: 24, specAmt: 0.48, steps: 14)
                // 玉顶圆帽与鎏金宝珠
                let tipY = isTop ? yA : yB
                m.disc(cx, tipY, radius: capW * 0.42, jadeDark, alpha: 0.98, sides: 16)
                m.disc(cx - capW * 0.05, tipY, radius: capW * 0.36, jadeMid, alpha: 0.96, sides: 14)
                m.disc(cx - capW * 0.14, tipY + (isTop ? -capW * 0.06 : capW * 0.06), radius: capW * 0.15, jadeHi, alpha: 0.88, sides: 10)
                let beadY = isTop ? tipY - capW * 0.30 : tipY + capW * 0.30
                m.disc(cx, beadY, radius: capW * 0.20, goldMid, alpha: 0.99, sides: 12)
                m.disc(cx - capW * 0.06, beadY - capW * 0.05, radius: capW * 0.09, goldBright, alpha: 0.96, sides: 8)
            }

            // 右上轴头垂挂一缕典雅「朱锦金穗丝绦」，点睛皇家御卷细节
            if addTassel {
                let tx = x1 + rw * 0.06, ty0 = rollTop + trimH * 0.45
                // 丝绦投向案面的淡影
                m.polyline([tx + 2.4, ty0 + 2.5, tx + rw * 0.44, ty0 + trimH * 1.45, tx + rw * 0.32, ty0 + trimH * 3.15], width: max(1.8, rw * 0.08), deskShadow, alpha: 0.22)
                // 朱红编织丝带 + 如意玉结 + 鎏金流苏穗
                m.polyline([tx, ty0, tx + rw * 0.38, ty0 + trimH * 1.35, tx + rw * 0.26, ty0 + trimH * 2.95], width: max(1.7, rw * 0.075), brocadeRed, alpha: 0.96)
                m.polyline([tx - 0.5, ty0, tx + rw * 0.35, ty0 + trimH * 1.35], width: max(0.7, rw * 0.03), goldBright, alpha: 0.72)
                let knotX = tx + rw * 0.26, knotY = ty0 + trimH * 2.95
                m.disc(knotX, knotY, radius: rw * 0.13, brocadeLit, alpha: 0.98, sides: 10)
                m.disc(knotX, knotY, radius: rw * 0.065, goldBright, alpha: 0.96, sides: 8)
                for s in -2...2 {
                    let fx = knotX + Float(s) * rw * 0.048
                    m.segment(knotX, knotY + rw * 0.08, fx, knotY + trimH * 1.15, width: max(0.65, rw * 0.032), s % 2 == 0 ? goldBright : brocadeRed, alpha: 0.90)
                }
            }
        }
        drawRoller(x0: leftX0, x1: leftX1, inwardRight: true, addTassel: false)
        drawRoller(x0: rightX0, x1: rightX1, inwardRight: false, addTassel: true)

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

    /// 精绘城池徽记（附统一东南柔影）：
    /// - 国都：落影 + 墨环 + 鎏金城廓 + 象牙护城河 + 朱砂内城 + 鎏金四芒星辉；
    /// - 府城：落影 + 墨石城垣 + 宣白内坊 + 鎏金方印内城 + 墨心；
    /// - 城邑：落影 + 墨圈 + 温润象牙城心。
    public static func cityIcons(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let shadow = RGB(hex: 0x1E140A)
        let ink = RGB(hex: 0x261B12)
        let ivory = RGB(hex: 0xFAF3E3)
        let gold = RGB(hex: 0xD9AD4B)
        let goldHi = RGB(hex: 0xF8E4A6)
        let seal = RGB(hex: 0xA8261B)
        let bronze = RGB(hex: 0x8F6B36)
        let u = cityUnit, c = cityUnit * 1.5
        for (mark, city) in zip(cityMarks(map), map.meta.cities) {
            let x = city.x, y = city.y
            switch mark {
            case .capital:
                let k = Float(capitalOuter / 1.75)
                let r = 1.75 * k * c
                m.disc(x + r * 0.20, y + r * 0.24, radius: r * 1.06, shadow, alpha: 0.30, sides: 20)
                m.disc(x, y, radius: r, ink, sides: 20)
                m.disc(x, y, radius: r * 0.84, gold, sides: 20)
                m.disc(x, y, radius: r * 0.66, ink, sides: 18)
                m.disc(x, y, radius: r * 0.55, ivory, sides: 18)
                m.disc(x, y, radius: r * 0.42, seal, sides: 16)
                // 中心鎏金四芒皇星
                let sr = r * 0.34, sw = r * 0.11
                m.fill([x, y - sr, x + sw, y - sw, x + sr, y, x + sw, y + sw, x, y + sr, x - sw, y + sw, x - sr, y, x - sw, y - sw], goldHi, alpha: 0.98)
            case .provinceSeat:
                let s = u * 1.72
                m.disc(x + s * 0.22, y + s * 0.26, radius: s * 1.06, shadow, alpha: 0.26, sides: 16)
                m.disc(x, y, radius: s, ink, sides: 16)
                m.disc(x, y, radius: 0.74 * s, ivory, sides: 16)
                // 府城方形青铜内城墙与城心
                let q = 0.42 * s
                m.fill([x - q, y - q, x + q, y - q, x + q, y + q, x - q, y + q], bronze, alpha: 0.95)
                m.disc(x, y, radius: 0.22 * s, ink, sides: 10)
            case .city:
                m.disc(x + u * 0.24, y + u * 0.28, radius: u * 1.06, shadow, alpha: 0.24, sides: 12)
                m.disc(x, y, radius: u, ink, sides: 14)
                m.disc(x, y, radius: 0.60 * u, ivory, sides: 14)
                m.disc(x, y, radius: 0.22 * u, ink, sides: 8)
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
