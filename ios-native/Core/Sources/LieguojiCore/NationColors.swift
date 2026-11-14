import Foundation

/// 国色分明 (本作规则): the original hands its 24 colours out by index, so two neighbours often wear
/// near-identical blues or greens. Here each state takes the colour that differs most (CIELAB ΔE) from
/// the states around it. The palette keeps the muted mineral tones of a painted chart: twelve hues in a
/// light and a middle tone, and six earths and inks.
public enum NationColors {
    public static let palette = [
        "#fec2cb", "#fec4b5", "#f9c999", "#ddd396", "#bbdba3", "#99e1bc", "#7de2db", "#77e0f7", "#a0d9ff", "#c1d1fe", "#e2c7fe", "#ffbfe6",
        "#dc7a78", "#ce845a", "#b2924a", "#8d9d50", "#61a56a", "#4aa890", "#45a5ab", "#42a1c4", "#499ce0", "#8f8fd9", "#be81c1", "#d8789e",
        "#c5b49d", "#89867f", "#9a5953", "#486d99", "#477a55", "#efe8d5",
    ]
    private static let paletteLab = palette.map(lab)

    /// CIELAB of a #rrggbb colour (D65).
    static func lab(_ hex: String) -> (l: Double, a: Double, b: Double) {
        let v = UInt32(hex.hasPrefix("#") ? String(hex.dropFirst()) : hex, radix: 16) ?? 0x808080
        func lin(_ c: UInt32) -> Double { let s = Double(c & 0xff) / 255; return s <= 0.04045 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4) }
        let r = lin(v >> 16), g = lin(v >> 8), b = lin(v)
        func f(_ t: Double) -> Double { t > 216.0 / 24389 ? cbrt(t) : (24389.0 / 27 * t + 16) / 116 }
        let x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
        return (116 * y - 16, 500 * (x - y), 200 * (y - z))
    }
    static func distance(_ p: (l: Double, a: Double, b: Double), _ q: (l: Double, a: Double, b: Double)) -> Double {
        let dl = p.l - q.l, da = p.a - q.a, db = p.b - q.b
        return (dl * dl + da * da + db * db).squareRoot()
    }
    /// How far apart two colours look (CIELAB ΔE 1976; above about 20 they are told apart at a glance).
    public static func difference(_ a: String, _ b: String) -> Double { distance(lab(a), lab(b)) }

    /// The palette colour furthest from `near` (each with the difference it is granted for standing
    /// apart: none for a neighbour, some for a state further off); among equals the one fewest states wear, then a seeded choice.
    static func best(near: [(lab: (l: Double, a: Double, b: Double), apart: Double)], worn: [Int], salt: String) -> Int {
        var bestIndex = 0, bestScore = -Double.infinity
        for i in palette.indices {
            var score = 60.0
            for n in near { score = min(score, distance(paletteLab[i], n.lab) + n.apart) }
            score -= 1.5 * Double(min(worn[i], 4))
            score += Double(Opening.hash("\(salt)/\(i)") % 1000) / 1000 * 3
            if score > bestScore { bestScore = score; bestIndex = i }
        }
        return bestIndex
    }

    /// The opening's colours from where the capitals stand and nothing else (not even the seed: the
    /// device-built preview and the finished world must agree, and the capitals are what both share).
    /// Each state looks at the states whose capitals are nearest (the six nearest must differ
    /// as much as can be, the next six may come 22 closer, the rest are free).
    public static func assign(capitals: [(x: Double, y: Double)]) -> [String] {
        let n = capitals.count
        guard n > 0 else { return [] }
        var rank = [[Int: Int]](repeating: [:], count: n)
        for i in 0..<n {
            let order = (0..<n).filter { $0 != i }.sorted {
                let a = hypot(capitals[$0].x - capitals[i].x, capitals[$0].y - capitals[i].y), b = hypot(capitals[$1].x - capitals[i].x, capitals[$1].y - capitals[i].y)
                return a != b ? a < b : $0 < $1
            }
            for (k, j) in order.enumerated() { rank[i][j] = k }
        }
        var chosen = [Int?](repeating: nil, count: n), worn = [Int](repeating: 0, count: palette.count)
        for i in 0..<n {
            var near = [(lab: (l: Double, a: Double, b: Double), apart: Double)]()
            for j in 0..<n {
                guard let c = chosen[j] else { continue }
                // Near from either side: a small state beside a large one is its neighbour too.
                let k = min(rank[i][j] ?? n, rank[j][i] ?? n)
                if k < 12 { near.append((paletteLab[c], k < 6 ? 0 : 22)) }
            }
            let c = best(near: near, worn: worn, salt: "opening/\(n)/\(i)")
            chosen[i] = c; worn[c] += 1
        }
        return chosen.map { palette[$0 ?? 0] }
    }

    /// A state founded in play: the colour furthest from the states that hold or border its land.
    static func pick(_ r: JS, provinces: [String], salt: String) -> String {
        let w = r.world
        var colorOf = [String: String]()
        for n in w.nations.asArray { colorOf[n.id.asString] = n.color.asString }
        let mine = Set(provinces)
        var around = Set<String>(), ring = Set<String>()
        for p in w.provinces.asArray where mine.contains(p.id.asString) {
            if let owner = p.controller.optionalString { around.insert(owner) }
            for q in p.neighbors.asArray { ring.insert(q.asString) }
        }
        for p in w.provinces.asArray where ring.contains(p.id.asString) && !mine.contains(p.id.asString) {
            if let owner = p.controller.optionalString { around.insert(owner) }
        }
        var near = [(lab: (l: Double, a: Double, b: Double), apart: Double)]()
        for id in around.sorted() { if let c = colorOf[id] { near.append((lab(c), 0)) } }
        var worn = [Int](repeating: 0, count: palette.count)
        for c in colorOf.values { if let i = palette.firstIndex(of: c.lowercased()) { worn[i] += 1 } }
        // The other states count a little, so the new one does not repeat a colour seen elsewhere.
        for (id, c) in colorOf.sorted(by: { $0.key < $1.key }) where !around.contains(id) { near.append((lab(c), 30)) }
        return palette[best(near: near, worn: worn, salt: salt)]
    }

    /// A new world (day zero, once): every state is recoloured from its capital's place.
    static func apply(_ r: JS) {
        guard r.clock.tick.asNumber == 0, !r.regimes.isNull, !r.regimes.distinctColors.isTruthy else { return }
        r.regimes.distinctColors = JS(true)
        let w = r.world, nations = w.nations.asArray
        var place = [String: (x: Double, y: Double)]()
        for c in w.cities.asArray { place[c.id.asString] = (c.position.x.optionalNumber ?? 0, c.position.y.optionalNumber ?? 0) }
        let capitals = nations.map { place[$0.capitalId.optionalString ?? ""] ?? (0, 0) }
        let colors = assign(capitals: capitals)
        for (n, c) in zip(nations, colors) { n.color = JS(c) }
    }
}
