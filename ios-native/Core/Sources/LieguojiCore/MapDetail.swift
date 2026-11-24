import Foundation

/// 舆图细节: what an old chart carries beyond the land and sea: waterlines along the coast, a sand edge, wave
/// marks, a compass rose and scale bar; and, close up, grass, dunes, hills, ploughed fields and the roads between cities.
extension MapLayers {
    private static func hash(_ i: Int) -> UInt32 { UInt32(truncatingIfNeeded: i &* 2654435761) >> 16 }

    /// The coast as segments. A preview map has no smoothed coast yet: its cell edges stand in.
    private static func coastLines(_ map: WorldMap) -> [Float] {
        if !map.coast.isEmpty { return map.coast }
        var out = [Float]()
        for e in map.edges where e.a >= 0 && e.b >= 0 && map.isLand(Int(e.a)) != map.isLand(Int(e.b)) { out += [e.x1, e.y1, e.x2, e.y2] }
        return out
    }
    /// 勾勒海岸: the shore as one ink line, drawn while the land is still blank paper (开卷).
    public static func coastInk(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let ink = RGB(hex: 0x2E2518), coast = coastLines(map)
        for i in stride(from: 0, to: coast.count - 3, by: 4) {
            m.segment(coast[i], coast[i + 1], coast[i + 2], coast[i + 3], width: 1.5, ink, alpha: 0.6)
        }
        return m
    }
    /// The emptiest corner of the sea, where the compass stands.
    public static func compassCorner(_ map: WorldMap) -> (x: Float, y: Float) {
        let inset: Float = 118
        let corners: [(Float, Float)] = [(inset, inset), (map.width - inset, inset), (inset, map.height - inset), (map.width - inset, map.height - inset)]
        var best = corners[0], fewest = Int.max
        for (cx, cy) in corners {
            var n = 0
            for c in 0..<map.cellCount where map.isLand(c) {
                let dx: Float = map.sites[c * 2] - cx, dy: Float = map.sites[c * 2 + 1] - cy
                if dx * dx + dy * dy < 9025 { n += 1 }
            }
            if n < fewest { fewest = n; best = (cx, cy) }
        }
        return (best.0, best.1)
    }

    /// Cells that touch the other element (land next to sea, sea next to land).
    private static func shoreCells(_ map: WorldMap) -> [Bool] {
        var shore = [Bool](repeating: false, count: map.cellCount)
        for e in map.edges where e.a >= 0 && e.b >= 0 {
            let a = Int(e.a), b = Int(e.b)
            if map.isLand(a) != map.isLand(b) { shore[a] = true; shore[b] = true }
        }
        return shore
    }

    /// Old-chart waterlines: for each sea pixel, how strongly a line and the paler shallows lie on it (two bytes).
    public static func waterlines(_ map: WorldMap) -> [UInt8] {
        let w = map.seaWidth, h = map.seaHeight
        let coast = coastLines(map)
        guard w > 1, h > 1, map.seaRGBA.count == w * h * 4, coast.count >= 4 else { return [] }
        let sx = Float(w) / map.width, sy = Float(h) / map.height, reach = Int((42 * max(sx, sy)).rounded(.up))
        var distance = [Int16](repeating: -1, count: w * h)
        var frontier = [Int32]()
        for i in stride(from: 0, to: coast.count - 3, by: 4) {
            let x1 = coast[i] * sx, y1 = coast[i + 1] * sy, x2 = coast[i + 2] * sx, y2 = coast[i + 3] * sy
            let steps = max(1, Int(max(abs(x2 - x1), abs(y2 - y1)).rounded(.up)))
            for s in 0...steps {
                let t = Float(s) / Float(steps), x = Int(x1 + (x2 - x1) * t), y = Int(y1 + (y2 - y1) * t)
                guard x >= 0, y >= 0, x < w, y < h, distance[y * w + x] < 0 else { continue }
                distance[y * w + x] = 0; frontier.append(Int32(y * w + x))
            }
        }
        var level: Int16 = 0
        while !frontier.isEmpty, Int(level) < reach {
            level += 1
            var next = [Int32]()
            // Four neighbours and eight in turn keep the rings round rather than square.
            let diagonal = level % 2 == 0
            for c in frontier {
                let x = Int(c) % w, y = Int(c) / w
                for dy in -1...1 { for dx in -1...1 where dx != 0 || dy != 0 {
                    if !diagonal && dx != 0 && dy != 0 { continue }
                    let nx = x + dx, ny = y + dy
                    guard nx >= 0, ny >= 0, nx < w, ny < h, distance[ny * w + nx] < 0 else { continue }
                    distance[ny * w + nx] = level; next.append(Int32(ny * w + nx))
                } }
            }
            frontier = next
        }
        // 五道清锐由浓渐淡的宋画等深水线 + 澄澈碧青浅海陆棚过渡（彻底告别灰白浑浊宽边，近岸水色清亮通透）
        let rings: [(at: Float, strength: Float)] = [(2.6, 0.72), (6.8, 0.52), (12.4, 0.35), (19.6, 0.21), (28.8, 0.11)]
        let unit = 1 / max(sx, sy)
        var mask = [UInt8](repeating: 0, count: w * h * 2)
        for p in 0..<(w * h) where distance[p] > 0 {
            let d = Float(distance[p]) * unit
            var light: Float = 0
            for r in rings { light = max(light, max(0, 1 - abs(d - r.at) / max(0.85, unit * 0.92)) * r.strength) }
            let shelf = pow(max(0, 1 - d / 26), 1.35) * 0.44
            mask[p * 2] = UInt8(min(255, light * 255)); mask[p * 2 + 1] = UInt8(min(255, shelf * 255))
        }
        // 单遍柔滑抗锯齿，既消除锯齿阶梯又保留宋代海图等深线的清锐笔锋。
        var next = mask
        for y in 1..<(h - 1) { for x in 1..<(w - 1) where distance[y * w + x] >= 0 {
            let center = Int(mask[(y * w + x) * 2]) * 4
            let cross = Int(mask[((y - 1) * w + x) * 2]) + Int(mask[((y + 1) * w + x) * 2])
                + Int(mask[(y * w + x - 1) * 2]) + Int(mask[(y * w + x + 1) * 2])
            next[(y * w + x) * 2] = UInt8((center + cross) / 8)
        } }
        mask = next
        return mask
    }
    /// Lays the waterlines on the sea once it has its colours (a preset's recolouring keeps only depth).
    public static func applyWaterlines(_ mask: [UInt8], to rgba: inout [UInt8]) {
        guard mask.count * 2 == rgba.count else { return }
        for p in 0..<(mask.count / 2) where mask[p * 2] != 0 || mask[p * 2 + 1] != 0 {
            let light = Float(mask[p * 2]) / 255 * 0.56, shallow = Float(mask[p * 2 + 1]) / 255, i = p * 4
            func blend(_ v: UInt8, _ shelf: Float, _ line: Float) -> UInt8 {
                var c = Float(v)
                c += (shelf - c) * shallow
                c += (line - c) * light
                return UInt8(max(0, min(255, c)))
            }
            rgba[i] = blend(rgba[i], 146, 214)
            rgba[i + 1] = blend(rgba[i + 1], 198, 232)
            rgba[i + 2] = blend(rgba[i + 2], 204, 229)
        }
    }

    /// 水墨晕染: the sea is not one flat wash. Three octaves of smooth noise make it a little lighter and
    /// darker in slow patches, as a brush leaves it, whatever the sea's colours (cold or warm preset).
    /// At most ±`depth` of each channel; the same for the same size, so a recoloured sea keeps its wash.
    public static func applySeaWash(width w: Int, height h: Int, to rgba: inout [UInt8], depth: Float = 0.068) {
        guard w > 1, h > 1, rgba.count == w * h * 4 else { return }
        func lattice(_ x: Int, _ y: Int, _ salt: Int) -> Float { Float(hash(x &* 73856093 ^ y &* 19349663 ^ salt &* 83492791) & 0xFFF) / Float(0xFFF) }
        func noise(_ x: Float, _ y: Float, _ salt: Int) -> Float {
            let x0 = Int(floor(x)), y0 = Int(floor(y)), fx = x - Float(x0), fy = y - Float(y0)
            let u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
            let a = lattice(x0, y0, salt), b = lattice(x0 + 1, y0, salt), c = lattice(x0, y0 + 1, salt), d = lattice(x0 + 1, y0 + 1, salt)
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
        }
        // The patches are sized against the texture's short side, so a map of any size is washed alike.
        // 四频水墨海晕 + 细密宣纸海图颗粒，拉近海面更富古图质感。
        let unit = Float(min(w, h))
        for y in 0..<h {
            for x in 0..<w {
                let px = Float(x) / unit, py = Float(y) / unit
                let n = noise(px * 4.5, py * 4.5, 1) * 0.46
                    + noise(px * 12, py * 12, 2) * 0.28
                    + noise(px * 30, py * 30, 3) * 0.16
                    + noise(px * 72, py * 72, 4) * 0.10
                let k = 1 + (n - 0.5) * 2 * depth, i = (y * w + x) * 4
                rgba[i] = UInt8(max(0, min(255, Float(rgba[i]) * k)))
                rgba[i + 1] = UInt8(max(0, min(255, Float(rgba[i + 1]) * k)))
                rgba[i + 2] = UInt8(max(0, min(255, Float(rgba[i + 2]) * (k + 0.008))))
            }
        }
    }

    /// 识别封闭内陆湖泊：从地图四边水格 BFS 泛洪标记外海，其余被陆地环抱的水格即真实内陆湖泊。
    private static func inlandLakeCells(_ map: WorldMap) -> [Bool] {
        let n = map.cellCount
        guard n > 0 else { return [] }
        var adj = [[Int]](repeating: [], count: n)
        for e in map.edges where e.a >= 0 && e.b >= 0 {
            let a = Int(e.a), b = Int(e.b)
            if a < n && b < n && !map.isLand(a) && !map.isLand(b) {
                adj[a].append(b); adj[b].append(a)
            }
        }
        var ocean = [Bool](repeating: false, count: n)
        var q = [Int](), head = 0
        let pad: Float = 18
        for c in 0..<n where !map.isLand(c) {
            let x = map.sites[c * 2], y = map.sites[c * 2 + 1]
            if x <= pad || y <= pad || x >= map.width - pad || y >= map.height - pad {
                ocean[c] = true; q.append(c)
            }
        }
        while head < q.count {
            let cur = q[head]; head += 1
            for nb in adj[cur] where !ocean[nb] { ocean[nb] = true; q.append(nb) }
        }
        var lakes = [Bool](repeating: false, count: n)
        for c in 0..<n where !map.isLand(c) && !ocean[c] { lakes[c] = true }
        return lakes
    }

    /// Always on the map: smooth mitered watercolor coastal shoal/surf/beach transition & inland freshwater lakes.
    /// 全部海岸浅滩采用 BorderCurve.chain + BorderCurve.smooth 连续斜接平滑带（零折角重叠珠点与锯齿缺口）。
    public static func ornaments(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let shoalOuter = RGB(hex: 0x4EA3B3)
        let surfMist = RGB(hex: 0xE6F2EC)
        let shoalInner = RGB(hex: 0xDFD2B0)
        let lakeShallow = RGB(hex: 0x7EB9B6)
        let lakeRim = RGB(hex: 0x4F7D87)
        let coast = coastLines(map)
        var coastSegs = [BorderCurve.Segment]()
        coastSegs.reserveCapacity(coast.count / 4)
        for i in stride(from: 0, to: max(0, coast.count - 3), by: 4) {
            coastSegs.append(.init(coast[i], coast[i + 1], coast[i + 2], coast[i + 3]))
        }
        let smoothCoasts = BorderCurve.smooth(BorderCurve.chain(coastSegs))
        // 三层无缝斜接海岸晕带：外层碧青浅海陆棚 → 中层薄雾浪沫 → 内层暖沙岸线
        for loop in smoothCoasts {
            m.smoothPolyline(loop, width: 8.4, shoalOuter, alpha: 0.14)
        }
        for loop in smoothCoasts {
            m.smoothPolyline(loop, width: 3.8, surfMist, alpha: 0.22)
        }
        for loop in smoothCoasts {
            m.smoothPolyline(loop, width: 2.0, shoalInner, alpha: 0.30)
        }
        // 内陆湖泊柔润碧青水色与连续平滑湖岸线
        let lakes = inlandLakeCells(map)
        for c in 0..<map.cellCount where lakes[c] {
            let s0 = Int(map.offsets[c]), s1 = Int(map.offsets[c + 1])
            if s1 - s0 >= 3 {
                var poly = [Float]()
                poly.reserveCapacity((s1 - s0) * 2)
                for v in s0..<s1 { poly.append(map.vertices[v * 2]); poly.append(map.vertices[v * 2 + 1]) }
                m.fill(poly, lakeShallow, alpha: 0.36)
            }
        }
        var lakeSegs = [BorderCurve.Segment]()
        for e in map.edges where e.a >= 0 && e.b >= 0 {
            let a = Int(e.a), b = Int(e.b)
            if (lakes[a] && map.isLand(b)) || (lakes[b] && map.isLand(a)) {
                lakeSegs.append(.init(e.x1, e.y1, e.x2, e.y2))
            }
        }
        for loop in BorderCurve.smooth(BorderCurve.chain(lakeSegs)) {
            m.smoothPolyline(loop, width: 1.05, lakeRim, alpha: 0.48)
        }
        return m
    }

    /// Close up only: delicate curved imperial post-roads (`驿道`), river-mouth deltas (`河口沙洲`) & fine highland contour hachures (`山脊刻纹`).
    /// 全手绘舆图精细铜版笔触，放大细看既有丰富古图地理肌理，又绝不杂乱遮挡国界与城池。
    public static func fineDetail(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let road = RGB(hex: 0x5C4728)
        let milestone = RGB(hex: 0x8E3B2B)
        let ridgeInk = RGB(hex: 0x5B4B39)
        let forestInk = RGB(hex: 0x3D5B42)
        let deltaWater = RGB(hex: 0x6AAAB5)

        // 1. 山脊微刻线（铜版古图柔和短弧，赋予高地近观肌理）与林野点苔
        for c in 0..<map.cellCount where map.isLand(c) && (hash(c &* 17 &+ 3) % 5 == 0) {
            let h = map.elevation[c]
            let x = map.sites[c * 2], y = map.sites[c * 2 + 1]
            if h >= 58 {
                let tilt = Float(hash(c &* 29) % 100) / 100 * 0.5 - 0.25
                let span: Float = h >= 72 ? 4.2 : 3.0
                let lift: Float = h >= 72 ? 1.55 : 1.05
                let pts: [Float] = [
                    x - span, y + lift * 0.55 + tilt,
                    x - span * 0.35, y - lift * 0.45,
                    x + span * 0.30, y - lift * 0.55,
                    x + span, y + lift * 0.60 - tilt
                ]
                m.smoothPolyline(pts, width: 0.48, ridgeInk, alpha: h >= 72 ? 0.24 : 0.16)
            } else if h >= 24 && h <= 46 && (hash(c &* 43 &+ 7) % 3 == 0) {
                let bio = c < map.biome.count ? Int(map.biome[c]) : 0
                if bio == 5 || bio == 6 || bio == 7 || bio == 8 || bio == 9 {
                    m.disc(x, y, radius: 1.05, forestInk, alpha: 0.14, sides: 7)
                    m.disc(x + 1.9, y + 0.7, radius: 0.82, forestInk, alpha: 0.12, sides: 6)
                }
            }
        }

        // 2. 近岸低洼河口浅滩点纹（沿平缓入海口自然点缀清碧浅沙纹理）
        let shore = shoreCells(map)
        for c in 0..<map.cellCount where shore[c] && map.isLand(c) && map.elevation[c] <= 23 && (hash(c &* 53 &+ 11) % 6 == 0) {
            let x = map.sites[c * 2], y = map.sites[c * 2 + 1]
            m.disc(x, y, radius: 1.45, deltaWater, alpha: 0.18, sides: 8)
            m.disc(x + 2.1, y - 0.9, radius: 0.95, deltaWater, alpha: 0.14, sides: 6)
        }

        // 3. 官道驿路与中途驿站
        var firstCity = [Int: (Float, Float)]()
        for c in map.meta.cities where firstCity[c.province] == nil { firstCity[c.province] = (c.x, c.y) }
        var near = [Int: Set<Int>]()
        for e in map.edges where e.a >= 0 && e.b >= 0 && map.isLand(Int(e.a)) && map.isLand(Int(e.b)) {
            let a = Int(map.province[Int(e.a)]), b = Int(map.province[Int(e.b)])
            if a >= 0 && b >= 0 && a != b { near[a, default: []].insert(b); near[b, default: []].insert(a) }
        }
        var drawn = Set<Int64>()
        for (a, list) in near.sorted(by: { $0.key < $1.key }) {
            guard let pa = firstCity[a] else { continue }
            let candidates: [(Int, (Float, Float))] = list.compactMap { other -> (Int, (Float, Float))? in
                guard let p = firstCity[other] else { return nil }
                return (other, p)
            }
            func gap(_ p: (Float, Float)) -> Float { let x: Float = p.0 - pa.0, y: Float = p.1 - pa.1; return x * x + y * y }
            let nearest = candidates.sorted { (l: (Int, (Float, Float)), r: (Int, (Float, Float))) -> Bool in
                let dl: Float = gap(l.1), dr: Float = gap(r.1)
                return dl != dr ? dl < dr : l.0 < r.0
            }.prefix(2)
            for (b, pb) in nearest {
                let id = Int64(min(a, b)) << 32 | Int64(max(a, b))
                if !drawn.insert(id).inserted { continue }
                let dx: Float = pb.0 - pa.0, dy: Float = pb.1 - pa.1
                let len: Float = max(1, (dx * dx + dy * dy).squareRoot())
                let wobble: Float = Float(hash(a &* 31 &+ b) % 100) / 100 - 0.5
                let bend: Float = wobble * len * 0.22
                let mx: Float = (pa.0 + pb.0) / 2 - dy / len * bend
                let my: Float = (pa.1 + pb.1) / 2 + dx / len * bend
                let steps = max(6, Int(len / 5))
                func at(_ t: Float) -> (Float, Float) {
                    let u: Float = 1 - t, p0: Float = u * u, p1: Float = 2 * u * t, p2: Float = t * t
                    let x: Float = p0 * pa.0 + p1 * mx + p2 * pb.0
                    let y: Float = p0 * pa.1 + p1 * my + p2 * pb.1
                    return (x, y)
                }
                for k in stride(from: 1, to: steps - 1, by: 2) {
                    let p = at(Float(k) / Float(steps)), q = at(Float(k + 1) / Float(steps))
                    m.segment(p.0, p.1, q.0, q.1, width: 0.72, road, alpha: 0.52)
                }
                // 驿道中途朱点驿站标记（长驿道设驿）
                if steps >= 10 {
                    let mid = at(0.5)
                    m.disc(mid.0, mid.1, radius: 0.85, milestone, alpha: 0.62, sides: 8)
                }
            }
        }
        return m
    }
}
