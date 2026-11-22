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
        // 六道由浓渐淡的木刻等深水线 + 柔润翡翠浅滩过渡（海岸更细腻立体）
        let rings: [(at: Float, strength: Float)] = [(4.2, 0.78), (9.2, 0.62), (15.2, 0.46), (22.5, 0.34), (31.5, 0.23), (42.0, 0.14)]
        let unit = 1 / max(sx, sy)
        var mask = [UInt8](repeating: 0, count: w * h * 2)
        for p in 0..<(w * h) where distance[p] > 0 {
            let d = Float(distance[p]) * unit
            var light: Float = 0
            for r in rings { light = max(light, max(0, 1 - abs(d - r.at) / max(1, unit)) * r.strength) }
            mask[p * 2] = UInt8(light * 255); mask[p * 2 + 1] = UInt8(max(0, 1 - d / 28) * 0.34 * 255)
        }
        // The sea texture is coarse: two soft passes take the stair steps out of the lines.
        for _ in 0..<2 {
            var next = mask
            for y in 1..<(h - 1) { for x in 1..<(w - 1) where distance[y * w + x] >= 0 {
                var sum = 0
                for dy in -1...1 { for dx in -1...1 { sum += Int(mask[((y + dy) * w + x + dx) * 2]) } }
                next[(y * w + x) * 2] = UInt8(sum / 9)
            } }
            mask = next
        }
        return mask
    }
    /// Lays the waterlines on the sea once it has its colours (a preset's recolouring keeps only depth).
    public static func applyWaterlines(_ mask: [UInt8], to rgba: inout [UInt8]) {
        guard mask.count * 2 == rgba.count else { return }
        for p in 0..<(mask.count / 2) where mask[p * 2] != 0 || mask[p * 2 + 1] != 0 {
            let light = Float(mask[p * 2]) / 255, shallow = Float(mask[p * 2 + 1]) / 255, i = p * 4
            func blend(_ v: UInt8, _ pale: Float) -> UInt8 { var c = Float(v); c += (pale - c) * shallow; c += (238 - c) * light; return UInt8(max(0, min(255, c))) }
            rgba[i] = blend(rgba[i], 186); rgba[i + 1] = blend(rgba[i + 1], 214); rgba[i + 2] = blend(rgba[i + 2], 206)
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

    /// Always on the map: inland lakes, the sand edge of the land, wave marks & classical sailing vessels on the open sea, the compass and the scale.
    public static func ornaments(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let sand = RGB(hex: 0xE9D9AE), wave = RGB(hex: 0xD5E4E2), ink = RGB(hex: 0x2E2518), paper = RGB(hex: 0xEFE4C8)
        let lakeShallow = RGB(hex: 0x8FC7C4), lakeGleam = RGB(hex: 0xE6F4F1), lakeRim = RGB(hex: 0x4A7782)
        let coast = coastLines(map)
        for i in stride(from: 0, to: coast.count - 3, by: 4) {
            m.segment(coast[i], coast[i + 1], coast[i + 2], coast[i + 3], width: 3.6, sand, alpha: 0.34)
        }
        // 真实内陆湖泊绘制：碧青湖面润色、浅湖环岸与水平镜面波纹，清晰区别于辽阔外海
        let lakes = inlandLakeCells(map)
        var lakeShimmer = Set<Int64>()
        for c in 0..<map.cellCount where lakes[c] {
            let x = map.sites[c * 2], y = map.sites[c * 2 + 1]
            let s0 = Int(map.offsets[c]), s1 = Int(map.offsets[c + 1])
            if s1 - s0 >= 3 {
                var poly = [Float]()
                poly.reserveCapacity((s1 - s0) * 2)
                for v in s0..<s1 { poly.append(map.vertices[v * 2]); poly.append(map.vertices[v * 2 + 1]) }
                m.fill(poly, lakeShallow, alpha: 0.36)
            }
            let lk = Int64(floor(x / 16)) << 32 | Int64(Int32(floor(y / 16))) & 0xFFFF_FFFF
            if lakeShimmer.insert(lk).inserted {
                m.segment(x - 4.2, y, x + 4.2, y, width: 0.48, lakeGleam, alpha: 0.65)
                m.segment(x - 2.4, y + 2.0, x + 2.6, y + 2.0, width: 0.38, lakeRim, alpha: 0.36)
            }
        }
        for e in map.edges where e.a >= 0 && e.b >= 0 {
            let a = Int(e.a), b = Int(e.b)
            if (lakes[a] && map.isLand(b)) || (lakes[b] && map.isLand(a)) {
                m.segment(e.x1, e.y1, e.x2, e.y2, width: 1.35, lakeRim, alpha: 0.62)
            }
        }
        let shore = shoreCells(map)
        // Waves keep well off the coast, and a slow field gathers them into patches.
        var taken = Set<Int64>()
        // 叠浪: where the field gathers them the waves come stacked three deep, each crest shorter and
        // fainter than the one before and set off to the side; elsewhere one or two. Every crest has a
        // thin dark line under it (the engraver's shadow), so it reads on the pale warm sea as well as
        // on the blue one. Lengths, phase and spacing vary from mark to mark.
        let trough = RGB(hex: 0x23424E)
        var shipSpots: [(Float, Float)] = []
        for c in 0..<map.cellCount where !map.isLand(c) && !lakes[c] && !shore[c] && hash(c &* 3 &+ 11) % 7 == 0 {
            let x = map.sites[c * 2], y = map.sites[c * 2 + 1]
            let field = sin(x * 0.017 + 0.4) * sin(y * 0.021 + 1.9)
            if field < -0.3 { continue }
            let key = Int64(floor(x / 24)) << 32 | Int64(Int32(floor(y / 24))) & 0xFFFF_FFFF
            if !taken.insert(key).inserted { continue }
            let h = Int(hash(c &* 7 &+ 5))
            if h % 41 == 0 && x > 140 && x < map.width - 140 && y > 120 && y < map.height - 120 {
                shipSpots.append((x, y))
            }
            let crests = field > 0.3 ? 3 : h % 3 == 0 ? 1 : 2
            let half = 5.5 + Float(h % 5), phase = Float(h % 7)
            for k in 0..<crests {
                let reach = half * (1 - Float(k) * 0.2), left = x - reach + (k % 2 == 0 ? 0 : half * 0.4), top = y + Float(k) * 2.7
                var line = [Float](), shade = [Float]()
                for s in 0...10 {
                    let t = Float(s) / 10
                    // The swell dies away towards both ends of the stroke.
                    let px = left + 2 * reach * t, py = top + sin(t * 2 * .pi * 1.5 + phase) * 1.25 * (1 - abs(t - 0.5) * 0.9)
                    line += [px, py]; shade += [px, py + 0.6]
                }
                m.polyline(shade, width: 0.5, trough, alpha: 0.17 - Float(k) * 0.03)
                m.polyline(line, width: 0.62 - Float(k) * 0.08, wave, alpha: 0.52 - Float(k) * 0.09)
            }
        }
        // 浅滩: short pale dashes along the coast in the shallows, as old charts mark shoal water.
        for c in 0..<map.cellCount where !map.isLand(c) && !lakes[c] && shore[c] && hash(c &* 5 &+ 3) % 2 == 0 {
            let x = map.sites[c * 2], y = map.sites[c * 2 + 1], h = Int(hash(c &* 13 &+ 1))
            let dx = Float(h % 9) / 4 - 1, dy = Float(h / 9 % 9) / 4 - 1
            m.segment(x + dx - 0.9, y + dy, x + dx + 0.9, y + dy, width: 0.42, sand, alpha: 0.5)
        }
        // 精致十六向鎏金罗盘（含古航海方位射线、外圈 32 分刻度环、朱砂北针、八大主向与八小副向指针）
        let (cx, cy) = compassCorner(map)
        // 远洋手绘古航海帆船剪影（至多 3 艘，严格避开陆地与罗盘，赋予大洋古典舆图神韵）
        let hullColor = RGB(hex: 0x4A3321), sailColor = RGB(hex: 0xF0E6CE), pennantColor = RGB(hex: 0x9E3629)
        var placedShips: [(Float, Float)] = []
        for (sx, sy) in shipSpots where placedShips.count < 3 {
            let dc = hypot(sx - cx, sy - cy)
            guard dc > 150 else { continue }
            guard !placedShips.contains(where: { hypot($0.0 - sx, $0.1 - sy) < 260 }) else { continue }
            var nearLand = false
            for c in stride(from: 0, to: map.cellCount, by: 7) where map.isLand(c) {
                let dx = map.sites[c * 2] - sx, dy = map.sites[c * 2 + 1] - sy
                if dx * dx + dy * dy < 44 * 44 { nearLand = true; break }
            }
            if nearLand { continue }
            placedShips.append((sx, sy))
            let dir: Float = placedShips.count % 2 == 0 ? -1 : 1
            // 船尾水波纹
            m.polyline([sx - 10 * dir, sy + 5.2, sx - 3 * dir, sy + 4.4, sx + 5 * dir, sy + 5.3, sx + 11 * dir, sy + 4.6], width: 0.55, wave, alpha: 0.55)
            // 船身
            m.fill([sx - 8.5 * dir, sy + 1.2, sx + 9.2 * dir, sy + 0.8, sx + 6.4 * dir, sy + 4.4, sx - 6.2 * dir, sy + 4.4], hullColor, alpha: 0.72)
            // 主桅与前桅满帆
            m.segment(sx - 0.5 * dir, sy + 1.0, sx - 0.5 * dir, sy - 10.5, width: 0.65, ink, alpha: 0.68)
            m.fill([sx - 0.5 * dir, sy - 9.4, sx + 6.4 * dir, sy - 4.8, sx + 5.4 * dir, sy - 0.4, sx - 1.2 * dir, sy - 1.2], sailColor, alpha: 0.78)
            m.polyline([sx - 0.5 * dir, sy - 9.4, sx + 6.4 * dir, sy - 4.8, sx + 5.4 * dir, sy - 0.4, sx - 1.2 * dir, sy - 1.2], width: 0.45, ink, alpha: 0.55)
            m.fill([sx - 5.2 * dir, sy - 6.2, sx - 1.4 * dir, sy - 3.6, sx - 2.0 * dir, sy - 0.8, sx - 5.8 * dir, sy - 1.4], sailColor, alpha: 0.68)
            // 桅顶朱红小旗
            m.fill([sx - 0.5 * dir, sy - 10.6, sx - 4.2 * dir, sy - 9.6, sx - 0.5 * dir, sy - 8.8], pennantColor, alpha: 0.78)
        }
        let radius: Float = 56
        let gold = RGB(hex: 0xB88B3B), seal = RGB(hex: 0xA63628)
        // 古航海图方位射线（自罗盘轻柔向外延展，极低透明度衬托古舆图韵味）
        let raySpan = min(map.width, map.height) * 0.26
        for k in 0..<16 {
            let a = Float(k) * .pi / 8
            let len = k % 4 == 0 ? raySpan : raySpan * 0.72
            let x1 = max(8, min(map.width - 8, cx + cos(a) * len))
            let y1 = max(8, min(map.height - 8, cy + sin(a) * len))
            m.segment(cx + cos(a) * (radius * 0.92), cy + sin(a) * (radius * 0.92), x1, y1, width: k % 4 == 0 ? 0.45 : 0.3, gold, alpha: k % 4 == 0 ? 0.22 : 0.13)
        }
        func ring(_ r: Float, _ width: Float, _ alpha: Float, _ col: RGB = ink) {
            var p = [Float]()
            for k in 0...64 { let a = Float(k) / 64 * 2 * .pi; p += [cx + cos(a) * r, cy + sin(a) * r] }
            m.polyline(p, width: width, col, alpha: alpha)
        }
        ring(radius * 0.86, 0.9, 0.72, gold); ring(radius * 0.76, 0.75, 0.75); ring(radius * 0.66, 0.45, 0.55)
        // 外圈 32 等分航海刻度线
        for k in 0..<32 {
            let a = Float(k) / 32 * 2 * .pi
            let r0 = radius * (k % 4 == 0 ? 0.66 : 0.72), r1 = radius * 0.86
            m.segment(cx + cos(a) * r0, cy + sin(a) * r0, cx + cos(a) * r1, cy + sin(a) * r1, width: k % 4 == 0 ? 0.65 : 0.35, ink, alpha: 0.55)
        }
        func spike(_ angle: Float, _ length: Float, _ waist: Float, _ darkCol: RGB = ink) {
            let tip = (cx + cos(angle) * length, cy + sin(angle) * length)
            let l = (cx + cos(angle - .pi / 2) * waist, cy + sin(angle - .pi / 2) * waist), r = (cx + cos(angle + .pi / 2) * waist, cy + sin(angle + .pi / 2) * waist)
            m.fill([tip.0, tip.1, l.0, l.1, cx, cy], darkCol, alpha: 0.86)
            m.fill([tip.0, tip.1, cx, cy, r.0, r.1], paper, alpha: 0.92)
            m.polyline([l.0, l.1, tip.0, tip.1, r.0, r.1], width: 0.42, ink, alpha: 0.75)
        }
        for k in 0..<16 where k % 2 == 1 { spike(Float(k) * .pi / 8, radius * 0.42, 3.6, gold) }
        for k in 0..<8 where k % 2 == 1 { spike(Float(k) * .pi / 4, radius * 0.62, 6) }
        for k in 0..<8 where k % 2 == 0 { spike(Float(k) * .pi / 4, radius, 8.2, k == 6 ? seal : ink) }
        m.disc(cx, cy, radius: 4.5, gold, alpha: 0.95)
        m.disc(cx, cy, radius: 2.2, seal, alpha: 0.95)
        // 北向朱砂指尖与外海祥云纹饰
        m.fill([cx, cy - radius - 13, cx - 4.8, cy - radius - 3, cx + 4.8, cy - radius - 3], seal, alpha: 0.9)
        // 古图祥云角纹（点缀在罗盘两侧开阔海面）
        for side in [Float(-1), 1] {
            let qx = cx + side * (radius + 20), qy = cy + 6
            var curl = [Float]()
            for s in 0...14 {
                let t = Float(s) / 14 * 1.8 * .pi
                let rr = 4.5 + t * 1.4
                curl += [qx + side * cos(t) * rr, qy + sin(t) * rr * 0.65]
            }
            m.polyline(curl, width: 0.65, gold, alpha: 0.52)
        }
        // The scale bar below it, its parts ink and paper in turn.
        let bar: Float = 18, x0 = cx - bar * 2.5, y0 = cy + radius + 13
        for k in 0..<5 {
            let x = x0 + Float(k) * bar
            m.fill([x, y0, x + bar, y0, x + bar, y0 + 3.8, x, y0 + 3.8], k % 2 == 0 ? ink : paper, alpha: 0.9)
        }
        m.polyline([x0, y0, x0 + bar * 5, y0, x0 + bar * 5, y0 + 3.8, x0, y0 + 3.8, x0, y0], width: 0.5, gold, alpha: 0.85)
        return m
    }

    /// Close up only: what lies between the mountains and woods.
    public static func fineDetail(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let grass = RGB(hex: 0x4F5F36), dune = RGB(hex: 0x876C3C), hill = RGB(hex: 0x57503A), field = RGB(hex: 0xC9B27A), furrow = RGB(hex: 0x74633A), road = RGB(hex: 0x5C4728)
        let snow = RGB(hex: 0xF5EFE0), peakInk = RGB(hex: 0x3D352A), milestone = RGB(hex: 0x8E3B2B)
        let shore = shoreCells(map)
        var cityGrid = [Int64: [(Float, Float)]]()
        func cell(_ x: Float, _ y: Float) -> Int64 { Int64(floor(x / 24)) << 32 | Int64(Int32(floor(y / 24))) & 0xFFFF_FFFF }
        for c in map.meta.cities { cityGrid[cell(c.x, c.y), default: []].append((c.x, c.y)) }
        func nearCity(_ x: Float, _ y: Float) -> Bool {
            let gx = Int64(floor(x / 24)), gy = Int64(floor(y / 24))
            for dx in -1...1 { for dy in -1...1 {
                for c in cityGrid[(gx + Int64(dx)) << 32 | Int64(Int32(gy + Int64(dy))) & 0xFFFF_FFFF] ?? [] {
                    let ox = c.0 - x, oy = c.1 - y
                    if ox * ox + oy * oy < 26 * 26 && ox * ox + oy * oy > 7 * 7 { return true }
                }
            } }
            return false
        }
        var taken = Set<Int64>()
        for c in 0..<map.cellCount where map.isLand(c) && !shore[c] {
            let h = Float(map.elevation[c]), biome = map.biome[c], x = map.sites[c * 2], y = map.sites[c * 2 + 1], pick = hash(c) % 100
            let key = Int64(floor(x / 13)) << 32 | Int64(Int32(floor(y / 13))) & 0xFFFF_FFFF
            if h >= 58 {
                // 高峰雪冠与水墨山脊皴笔（拉近山脉可见细致山峰层次）
                if pick < 36 && taken.insert(key).inserted {
                    let span: Float = 5.2 + Float(hash(c &+ 7) % 3)
                    let ht: Float = 4.6 + Float(hash(c &+ 13) % 3)
                    m.fill([x, y - ht, x - span * 0.42, y - ht * 0.35, x + span * 0.42, y - ht * 0.35], snow, alpha: 0.72)
                    m.polyline([x - span, y, x, y - ht, x + span, y], width: 0.55, peakInk, alpha: 0.52)
                    m.segment(x + span * 0.12, y - ht * 0.8, x + span * 0.65, y - ht * 0.1, width: 0.4, peakInk, alpha: 0.35)
                }
                continue
            }
            if h >= 55 || (biome >= 5 && biome <= 9) { continue }
            if h < 40 && pick < 32 && nearCity(x, y) {
                if !taken.insert(key).inserted { continue }
                // Ploughed strips, each patch lying its own way.
                let a = Float(hash(c &+ 5) % 180) * .pi / 180, ux = cos(a), uy = sin(a), vx = -uy, vy = ux, w: Float = 5, d: Float = 3
                m.fill([x - ux * w - vx * d, y - uy * w - vy * d, x + ux * w - vx * d, y + uy * w - vy * d, x + ux * w + vx * d, y + uy * w + vy * d, x - ux * w + vx * d, y - uy * w + vy * d], field, alpha: 0.2)
                for k in -1...1 { let o = Float(k) * d * 0.6; m.segment(x - ux * w + vx * o, y - uy * w + vy * o, x + ux * w + vx * o, y + uy * w + vy * o, width: 0.3, furrow, alpha: 0.28) }
                continue
            }
            if pick >= 42 || !taken.insert(key).inserted { continue }
            if h >= 38 {
                // A low hill.
                var p = [Float](); for k in 0...6 { let t = Float(k) / 6 * .pi; p += [x - cos(t) * 6, y - sin(t) * 3.2] }
                m.polyline(p, width: 0.5, hill, alpha: 0.46)
                m.segment(x + 2.5, y - 1.8, x + 4.5, y - 0.3, width: 0.4, hill, alpha: 0.32)
            } else if biome == 1 || biome == 2 {
                // Dunes.
                for k in 0..<2 {
                    let oy = Float(k) * 3.2, ox = Float(k) * 2.4
                    var p = [Float](); for j in 0...6 { let t = Float(j) / 6; p += [x - 6 + ox + 12 * t, y + oy - sin(t * .pi) * 2.2] }
                    m.polyline(p, width: 0.45, dune, alpha: 0.44)
                }
            } else {
                // A tuft of grass.
                m.segment(x, y, x - 1.7, y - 3, width: 0.4, grass, alpha: 0.48)
                m.segment(x, y, x, y - 3.8, width: 0.4, grass, alpha: 0.48)
                m.segment(x, y, x + 1.7, y - 3, width: 0.4, grass, alpha: 0.48)
            }
        }
        // Roads: each province seat joined by land to its nearest few neighbours.
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
                    m.segment(p.0, p.1, q.0, q.1, width: 0.7, road, alpha: 0.5)
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
