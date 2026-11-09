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
        let sx = Float(w) / map.width, sy = Float(h) / map.height, reach = Int((26 * max(sx, sy)).rounded(.up))
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
        let rings: [(at: Float, strength: Float)] = [(6, 0.72), (12.5, 0.5), (20, 0.3)]
        let unit = 1 / max(sx, sy)
        var mask = [UInt8](repeating: 0, count: w * h * 2)
        for p in 0..<(w * h) where distance[p] > 0 {
            let d = Float(distance[p]) * unit
            var light: Float = 0
            for r in rings { light = max(light, max(0, 1 - abs(d - r.at) / max(1, unit)) * r.strength) }
            mask[p * 2] = UInt8(light * 255); mask[p * 2 + 1] = UInt8(max(0, 1 - d / 16) * 0.2 * 255)
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

    /// Always on the map: the sand edge of the land, wave marks on the open sea, the compass and the scale.
    public static func ornaments(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let sand = RGB(hex: 0xE9D9AE), wave = RGB(hex: 0xD5E4E2), ink = RGB(hex: 0x2E2518), paper = RGB(hex: 0xEFE4C8)
        let coast = coastLines(map)
        for i in stride(from: 0, to: coast.count - 3, by: 4) {
            m.segment(coast[i], coast[i + 1], coast[i + 2], coast[i + 3], width: 3.4, sand, alpha: 0.3)
        }
        let shore = shoreCells(map)
        // Waves keep well off the coast, and a slow field gathers them into patches.
        var taken = Set<Int64>()
        for c in 0..<map.cellCount where !map.isLand(c) && !shore[c] && hash(c &* 3 &+ 11) % 12 == 0 {
            let x = map.sites[c * 2], y = map.sites[c * 2 + 1]
            if sin(x * 0.017 + 0.4) * sin(y * 0.021 + 1.9) < -0.2 { continue }
            let key = Int64(floor(x / 30)) << 32 | Int64(Int32(floor(y / 30))) & 0xFFFF_FFFF
            if !taken.insert(key).inserted { continue }
            var line = [Float]()
            for k in 0...8 { let t = Float(k) / 8; line += [x - 7 + 14 * t, y + sin(t * 2 * .pi * 1.5) * 1.3] }
            m.polyline(line, width: 0.55, wave, alpha: 0.42)
        }
        // The compass stands in the emptiest corner of the sea.
        let (cx, cy) = compassCorner(map)
        let radius: Float = 52
        func ring(_ r: Float, _ width: Float, _ alpha: Float) {
            var p = [Float]()
            for k in 0...64 { let a = Float(k) / 64 * 2 * .pi; p += [cx + cos(a) * r, cy + sin(a) * r] }
            m.polyline(p, width: width, ink, alpha: alpha)
        }
        ring(radius * 0.74, 0.7, 0.7); ring(radius * 0.68, 0.4, 0.6)
        func spike(_ angle: Float, _ length: Float, _ waist: Float) {
            let tip = (cx + cos(angle) * length, cy + sin(angle) * length)
            let l = (cx + cos(angle - .pi / 2) * waist, cy + sin(angle - .pi / 2) * waist), r = (cx + cos(angle + .pi / 2) * waist, cy + sin(angle + .pi / 2) * waist)
            m.fill([tip.0, tip.1, l.0, l.1, cx, cy], ink, alpha: 0.82)
            m.fill([tip.0, tip.1, cx, cy, r.0, r.1], paper, alpha: 0.9)
            m.polyline([l.0, l.1, tip.0, tip.1, r.0, r.1], width: 0.4, ink, alpha: 0.75)
        }
        for k in 0..<8 where k % 2 == 1 { spike(Float(k) * .pi / 4, radius * 0.56, 6) }
        for k in 0..<8 where k % 2 == 0 { spike(Float(k) * .pi / 4, radius, 8) }
        m.disc(cx, cy, radius: 3, ink, alpha: 0.9)
        // A pointer past the north tip.
        m.fill([cx, cy - radius - 11, cx - 4, cy - radius - 3, cx + 4, cy - radius - 3], ink, alpha: 0.85)
        // The scale bar below it, its parts ink and paper in turn.
        let bar: Float = 18, x0 = cx - bar * 2.5, y0 = cy + radius + 12
        for k in 0..<5 {
            let x = x0 + Float(k) * bar
            m.fill([x, y0, x + bar, y0, x + bar, y0 + 3.6, x, y0 + 3.6], k % 2 == 0 ? ink : paper, alpha: 0.88)
        }
        m.polyline([x0, y0, x0 + bar * 5, y0, x0 + bar * 5, y0 + 3.6, x0, y0 + 3.6, x0, y0], width: 0.45, ink, alpha: 0.8)
        return m
    }

    /// Close up only: what lies between the mountains and woods.
    public static func fineDetail(_ map: WorldMap) -> ColoredMesh {
        var m = ColoredMesh()
        let grass = RGB(hex: 0x4F5F36), dune = RGB(hex: 0x876C3C), hill = RGB(hex: 0x57503A), field = RGB(hex: 0xC9B27A), furrow = RGB(hex: 0x74633A), road = RGB(hex: 0x5C4728)
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
            if h >= 55 || (biome >= 5 && biome <= 9) { continue }
            let key = Int64(floor(x / 13)) << 32 | Int64(Int32(floor(y / 13))) & 0xFFFF_FFFF
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
            }
        }
        return m
    }
}
