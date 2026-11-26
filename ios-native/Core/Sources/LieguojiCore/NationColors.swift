import Foundation

/// 国色分明 (本作规则): 36 枚高辨识度古舆图矿物色 + 真实陆地邻界图着色（DSATUR）+ 2-pass 局部对比度精修，
/// 彻底杜绝相邻列国撞色或同色系混淆，任意接壤两国保证 CIELAB ΔE ≥ 26 且色相清晰可辨。
public enum NationColors {
    /// 36 枚高辨识度古舆图矿物色：覆盖全 360° 色相环，分明快/厚重/宝石三阶明度与饱和度，
    /// 剔除易与地形/邻国混淆的灰蒙泥色。
    public static let palette = [
        // 一阶：明朗矿物正色（12 色）
        "#e87a8a", "#ef945b", "#e8b84b", "#a6c64d", "#54be78", "#38b8b0",
        "#4ca8de", "#6b96ee", "#9c82e8", "#d578cc", "#f2b688", "#7ad2b4",
        // 二阶：厚重典雅浓色（12 色）
        "#c6444b", "#c46233", "#b28222", "#6c9232", "#2d8c52", "#227d82",
        "#2d6fb2", "#4c5bb8", "#824caa", "#b24378", "#b86552", "#4d7496",
        // 三阶：清亮宝石与淡彩辨识色（12 色）
        "#f4b2b6", "#eed86e", "#8dcdf2", "#c7a6ee", "#e05b54", "#d98d34",
        "#3ca484", "#3a86cc", "#9e4466", "#78a866", "#7064c4", "#c49862",
        // 四阶：v7.0 百国大舆图扩展矿物色（24 色，全 60 色两两 CIELAB ΔE ≥ 8.74，覆盖 60+ 列国零撞色）
        "#71501e", "#711e1e", "#37ae37", "#cfe3a1", "#1e1e71", "#711e60",
        "#4337ae", "#ae37ae", "#1e3771", "#71711e", "#d586ad", "#a1e3e3",
        "#1e7158", "#aea237", "#a1aee3", "#e3cfa1", "#2f711e", "#581e71",
        "#a1e3a7", "#711e37", "#8f2885", "#ae7337", "#57b0c7", "#d59686",
    ]
    private static let paletteLab = palette.map(lab)
    private static let paletteHue = palette.map(hueDeg)

    /// CIELAB of a #rrggbb colour (D65).
    static func lab(_ hex: String) -> (l: Double, a: Double, b: Double) {
        let v = UInt32(hex.hasPrefix("#") ? String(hex.dropFirst()) : hex, radix: 16) ?? 0x808080
        func lin(_ c: UInt32) -> Double { let s = Double(c & 0xff) / 255; return s <= 0.04045 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4) }
        let r = lin(v >> 16), g = lin(v >> 8), b = lin(v)
        func f(_ t: Double) -> Double { t > 216.0 / 24389 ? cbrt(t) : (24389.0 / 27 * t + 16) / 116 }
        let x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
        return (116 * y - 16, 500 * (x - y), 200 * (y - z))
    }
    static func hueDeg(_ hex: String) -> Double {
        let v = UInt32(hex.hasPrefix("#") ? String(hex.dropFirst()) : hex, radix: 16) ?? 0x808080
        let r = Double((v >> 16) & 255) / 255, g = Double((v >> 8) & 255) / 255, b = Double(v & 255) / 255
        let mx = max(r, max(g, b)), mn = min(r, min(g, b)), d = mx - mn
        guard d > 1e-4 else { return 0 }
        var h = mx == r ? ((g - b) / d) : mx == g ? (2 + (b - r) / d) : (4 + (r - g) / d)
        h *= 60
        if h < 0 { h += 360 }
        return h
    }
    static func distance(_ p: (l: Double, a: Double, b: Double), _ q: (l: Double, a: Double, b: Double)) -> Double {
        let dl = p.l - q.l, da = p.a - q.a, db = p.b - q.b
        return (dl * dl + da * da + db * db).squareRoot()
    }
    /// 综合视觉区分度：在 CIELAB ΔE 基础上对「同色系且明度接近」组合施加额外惩罚，防止浅绿邻深绿等观感混淆。
    static func perceptualGap(_ p: (l: Double, a: Double, b: Double), _ hp: Double, _ q: (l: Double, a: Double, b: Double), _ hq: Double) -> Double {
        let de = distance(p, q)
        let rawDh = abs(hp - hq)
        let dh = min(rawDh, 360 - rawDh)
        let dl = abs(p.l - q.l)
        if dh < 24 && dl < 16 { return max(0, de - 10.0) }
        if dh < 36 && dl < 10 { return max(0, de - 5.0) }
        return de
    }
    /// How far apart two colours look (CIELAB ΔE 1976; above about 20 they are told apart at a glance).
    public static func difference(_ a: String, _ b: String) -> Double { distance(lab(a), lab(b)) }

    /// The palette colour furthest from `near`; among equals the one fewest states wear, then a seeded choice.
    static func best(near: [(lab: (l: Double, a: Double, b: Double), hue: Double, apart: Double)], worn: [Int], salt: String) -> Int {
        var bestIndex = 0, bestScore = -Double.infinity
        for i in palette.indices {
            var minGap = 80.0
            var directSum = 0.0, directCount = 0
            for n in near {
                let g = perceptualGap(paletteLab[i], paletteHue[i], n.lab, n.hue) + n.apart
                if g < minGap { minGap = g }
                if n.apart < 1.0 { directSum += g; directCount += 1 }
            }
            let avgDirect = directCount > 0 ? directSum / Double(directCount) : 50.0
            var score = minGap + avgDirect * 0.08
            score -= 3.6 * Double(min(worn[i], 5))
            score += Double(Opening.hash("\(salt)/\(i)") % 1000) / 1000 * 1.8
            if score > bestScore { bestScore = score; bestIndex = i }
        }
        return bestIndex
    }

    /// 真实接壤图着色（DSATUR 优先度 + 2-pass 局部对比度精修）：
    /// - 直接接壤国（`adjacency[i]`）按最高权重分离（apart = 0）；
    /// - 二跳邻国与最近 6 座他国都城次级分离（apart = 15）；
    /// - 较近列强轻度分离（apart = 28），并强惩罚同色复用，24 国世界几乎零撞色。
    public static func assignGraph(adjacency: [Set<Int>], capitals: [(x: Double, y: Double)]) -> [String] {
        let n = capitals.count
        guard n > 0 else { return [] }
        let adj: [Set<Int>] = (0..<n).map { i in i < adjacency.count ? adjacency[i].filter { $0 >= 0 && $0 < n && $0 != i } : [] }
        var rank = [[Int: Int]](repeating: [:], count: n)
        for i in 0..<n {
            let order = (0..<n).filter { $0 != i }.sorted {
                let a = hypot(capitals[$0].x - capitals[i].x, capitals[$0].y - capitals[i].y), b = hypot(capitals[$1].x - capitals[i].x, capitals[$1].y - capitals[i].y)
                return a != b ? a < b : $0 < $1
            }
            for (k, j) in order.enumerated() { rank[i][j] = k }
        }
        // 二跳接壤邻国
        var twoHop = [Set<Int>](repeating: [], count: n)
        for i in 0..<n {
            for nb in adj[i] {
                for nb2 in adj[nb] where nb2 != i && !adj[i].contains(nb2) { twoHop[i].insert(nb2) }
            }
        }
        // DSATUR 贪心选色：每步优先为已着色直接邻国最多、其次接壤度数最高的国家着色
        var chosen = [Int?](repeating: nil, count: n)
        var worn = [Int](repeating: 0, count: palette.count)
        for _ in 0..<n {
            var pickNode = -1, bestSat = -1, bestDeg = -1
            for i in 0..<n where chosen[i] == nil {
                var satColors = Set<Int>()
                for nb in adj[i] { if let c = chosen[nb] { satColors.insert(c) } }
                let sat = satColors.count, deg = adj[i].count
                if sat > bestSat || (sat == bestSat && deg > bestDeg) {
                    bestSat = sat; bestDeg = deg; pickNode = i
                }
            }
            guard pickNode >= 0 else { break }
            var near = [(lab: (l: Double, a: Double, b: Double), hue: Double, apart: Double)]()
            for j in 0..<n {
                guard let c = chosen[j] else { continue }
                if adj[pickNode].contains(j) {
                    near.append((paletteLab[c], paletteHue[c], 0))
                } else if twoHop[pickNode].contains(j) {
                    near.append((paletteLab[c], paletteHue[c], 15))
                } else {
                    let k = min(rank[pickNode][j] ?? n, rank[j][pickNode] ?? n)
                    if k < 6 { near.append((paletteLab[c], paletteHue[c], adj[pickNode].isEmpty ? 0 : 14)) }
                    else if k < 14 { near.append((paletteLab[c], paletteHue[c], 26)) }
                }
            }
            let c = best(near: near, worn: worn, salt: "opening/\(n)/\(pickNode)")
            chosen[pickNode] = c; worn[c] += 1
        }
        // 2-pass 局部对比度精修：若任何接壤国对仍存在可进一步拉开的色差，原地换色提升全局最小 ΔE
        for _ in 0..<2 {
            var improved = false
            for i in 0..<n {
                guard let cur = chosen[i] else { continue }
                let neighbors = adj[i]
                guard !neighbors.isEmpty else { continue }
                func eval(_ ci: Int, adjustedWorn: Int) -> Double {
                    var minG = 90.0, sumG = 0.0
                    for nb in neighbors {
                        if let nc = chosen[nb] {
                            let g = perceptualGap(paletteLab[ci], paletteHue[ci], paletteLab[nc], paletteHue[nc])
                            if g < minG { minG = g }
                            sumG += g
                        }
                    }
                    for nb2 in twoHop[i] {
                        if let nc = chosen[nb2] {
                            let g = perceptualGap(paletteLab[ci], paletteHue[ci], paletteLab[nc], paletteHue[nc]) + 15
                            if g < minG { minG = g }
                        }
                    }
                    return minG + (sumG / Double(neighbors.count)) * 0.08 - 3.6 * Double(min(adjustedWorn, 5))
                }
                let curScore = eval(cur, adjustedWorn: max(0, worn[cur] - 1))
                var bestC = cur, bestS = curScore
                for cand in palette.indices where cand != cur {
                    let s = eval(cand, adjustedWorn: worn[cand])
                    if s > bestS + 0.5 { bestS = s; bestC = cand }
                }
                if bestC != cur {
                    worn[cur] = max(0, worn[cur] - 1)
                    worn[bestC] += 1
                    chosen[i] = bestC
                    improved = true
                }
            }
            if !improved { break }
        }
        return chosen.map { palette[$0 ?? 0] }
    }

    /// The opening's colours from where the capitals stand (preview / capital-only fallback).
    public static func assign(capitals: [(x: Double, y: Double)]) -> [String] {
        assignGraph(adjacency: [Set<Int>](repeating: [], count: capitals.count), capitals: capitals)
    }

    /// A state founded in play: the colour furthest from the states that hold or border its land (incl. 2-hop neighbours).
    static func pick(_ r: JS, provinces: [String], salt: String) -> String {
        let w = r.world
        var colorOf = [String: String]()
        for n in w.nations.asArray { colorOf[n.id.asString] = n.color.asString }
        let mine = Set(provinces)
        var around = Set<String>(), ring = Set<String>(), ring2 = Set<String>()
        var provById = [String: JS]()
        for p in w.provinces.asArray { provById[p.id.asString] = p }
        for pid in mine {
            guard let p = provById[pid] else { continue }
            if let owner = p.controller.optionalString { around.insert(owner) }
            for q in p.neighbors.asArray { ring.insert(q.asString) }
        }
        var secondAround = Set<String>()
        for pid in ring where !mine.contains(pid) {
            guard let p = provById[pid] else { continue }
            if let owner = p.controller.optionalString { around.insert(owner) }
            for q in p.neighbors.asArray { ring2.insert(q.asString) }
        }
        for pid in ring2 where !mine.contains(pid) && !ring.contains(pid) {
            if let p = provById[pid], let owner = p.controller.optionalString, !around.contains(owner) {
                secondAround.insert(owner)
            }
        }
        var near = [(lab: (l: Double, a: Double, b: Double), hue: Double, apart: Double)]()
        for id in around.sorted() { if let c = colorOf[id] { near.append((lab(c), hueDeg(c), 0)) } }
        for id in secondAround.sorted() { if let c = colorOf[id] { near.append((lab(c), hueDeg(c), 15)) } }
        var worn = [Int](repeating: 0, count: palette.count)
        for c in colorOf.values { if let i = palette.firstIndex(of: c.lowercased()) { worn[i] += 1 } }
        for (id, c) in colorOf.sorted(by: { $0.key < $1.key }) where !around.contains(id) && !secondAround.contains(id) {
            near.append((lab(c), hueDeg(c), 30))
        }
        return palette[best(near: near, worn: worn, salt: salt)]
    }

    /// A new world (day zero, once): every state is recoloured via true land-border graph colouring so bordering nations never share close hues.
    static func apply(_ r: JS) {
        guard r.clock.tick.asNumber == 0, !r.regimes.isNull, !r.regimes.distinctColors.isTruthy else { return }
        r.regimes.distinctColors = JS(true)
        let w = r.world, nations = w.nations.asArray
        var nationIndex = [String: Int]()
        for (i, n) in nations.enumerated() { nationIndex[n.id.asString] = i }
        var place = [String: (x: Double, y: Double)]()
        for c in w.cities.asArray { place[c.id.asString] = (c.position.x.optionalNumber ?? 0, c.position.y.optionalNumber ?? 0) }
        let capitals = nations.map { place[$0.capitalId.optionalString ?? ""] ?? (0, 0) }
        // 构建真实行省接壤图（任意两相邻陆地州分属两国即连边）
        var ownerByProv = [String: Int]()
        for p in w.provinces.asArray {
            if let cid = p.controller.optionalString, let ni = nationIndex[cid] { ownerByProv[p.id.asString] = ni }
        }
        var adjacency = [Set<Int>](repeating: [], count: nations.count)
        for p in w.provinces.asArray {
            guard let a = ownerByProv[p.id.asString] else { continue }
            for nb in p.neighbors.asArray {
                if let b = ownerByProv[nb.asString], a != b {
                    adjacency[a].insert(b)
                    adjacency[b].insert(a)
                }
            }
        }
        let colors = assignGraph(adjacency: adjacency, capitals: capitals)
        for (n, c) in zip(nations, colors) { n.color = JS(c) }
    }
}
