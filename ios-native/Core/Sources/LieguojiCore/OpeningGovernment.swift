import Foundation

/// The government stage of new-world creation (civilization47-government attachGovernment47), part 1:
/// the per-province land scan shared by settlement25-terrain (buildTerrainContext), settlement25-cells
/// (buildProvinceCells) and settlement25-combat (buildProvinceCombat). Each clipped land face of the
/// drawing mesh belongs to exactly one province (point-in-polygon of its centre).
public enum OpeningGovernment {
    static let f = Native.fr
    static let genericBiomeDefense: [Double] = [1, 2.5, 2.5, 1.3, 1, 1, 1, 1.2, 1.2, 1, 2, 4, 1.5]

    struct Group {
        let id: String; let polygon: [(Double, Double)]
        let minX: Double, maxX: Double, minY: Double, maxY: Double
        var counts = [Double](repeating: 0, count: 13)
        var land = [Int](), landSeen = Set<Int>()   // terrain: land vertices, insertion order
        var all = Set<Int>()                         // cells/combat: every face vertex
        var area = 0.0
    }
    static func contains(_ poly: [(Double, Double)], _ p: (Double, Double)) -> Bool {
        var inside = false, j = poly.count - 1
        for i in 0..<poly.count { let a = poly[i], b = poly[j]; if (a.1 > p.1) != (b.1 > p.1) && p.0 < (b.0 - a.0) * (p.1 - a.1) / (b.1 - a.1) + a.0 { inside.toggle() }; j = i }
        return inside
    }
    static func area(_ p: [(Double, Double)]) -> Double {
        var s = 0.0; for i in 0..<p.count { let a = p[i], b = p[(i + 1) % p.count]; s = s + a.0 * b.1 - b.0 * a.1 }; return abs(s) / 2
    }

    /// One pass over the mesh. `provinces`: world.provinces (id, polygon).
    static func scan(_ d: TerrainDocument, elevations h: [Int], ids: [UInt8], provinces: [JS], scale: Double) -> [Group] {
        let points = d.points.map { (f($0.0), f($0.1)) }
        var groups = provinces.map { p -> Group in
            let poly = p.polygon.asArray.map { ($0.x.asNumber, $0.y.asNumber) }
            return Group(id: p.id.asString, polygon: poly, minX: poly.map(\.0).min()!, maxX: poly.map(\.0).max()!, minY: poly.map(\.1).min()!, maxY: poly.map(\.1).max()!)
        }
        func cell(_ n: Double) -> Int { min(31, max(0, Int((n / 1000 * 32).rounded(.down)))) }
        var bins = [Int: [Int]]()
        for (k, g) in groups.enumerated() { for y in cell(g.minY)...cell(g.maxY) { for x in cell(g.minX)...cell(g.maxX) { bins[y * 32 + x, default: []].append(k) } } }
        var t = 0
        while t < d.triangles.count {
            let tri = [d.triangles[t], d.triangles[t + 1], d.triangles[t + 2]]; t += 3
            guard tri.contains(where: { h[$0] > 20 }) else { continue }
            var ring = [(Double, Double)]()
            for i in 0..<3 {
                let a = tri[i], b = tri[(i + 1) % 3], ha = h[a], hb = h[b]
                if ha >= 20 { ring.append(points[a]) }
                if (ha >= 20) != (hb >= 20) {
                    let lo = min(a, b), hi = max(a, b), u = Double(20 - h[lo]) / Double(h[hi] - h[lo])
                    ring.append((points[lo].0 + u * (points[hi].0 - points[lo].0), points[lo].1 + u * (points[hi].1 - points[lo].1)))
                }
            }
            let a = area(ring); if a < 1e-7 { continue }
            var sx = 0.0, sy = 0.0; for p in ring { sx += p.0; sy += p.1 }
            let center = (sx / Double(ring.count) * scale, sy / Double(ring.count) * scale)
            let matches = (bins[cell(center.1) * 32 + cell(center.0)] ?? []).filter { k in
                let g = groups[k]; if center.0 < g.minX || center.0 > g.maxX || center.1 < g.minY || center.1 > g.maxY { return false }
                return contains(g.polygon, center)
            }
            guard matches.count == 1 else { continue }
            let k = matches[0], land = tri.filter { h[$0] >= 20 }
            groups[k].area += a * scale * scale
            for v in land { groups[k].counts[Int(ids[v])] += a / Double(land.count); if groups[k].landSeen.insert(v).inserted { groups[k].land.append(v) } }
            for v in tri { groups[k].all.insert(v) }
        }
        return groups
    }

    /// nativeBiomeRatios.
    static func ratios(_ counts: [Double]) -> [Double] {
        var total = 0.0; for (i, n) in counts.enumerated() where i != 0 && n > 0 { total += n }
        return counts.enumerated().map { i, n in i != 0 && n > 0 && total > 0 ? f(f(n) / f(total)) : 0 }
    }
    /// analyzeElevation.
    static func elevation(_ heights: [Int]) -> (average: Double, deviation: Double, high: Double, veryHigh: Double, mountain: Bool, plateau: Bool) {
        let n = Double(heights.count); if heights.isEmpty { return (0, 0, 0, 0, false, false) }
        var sum = 0.0; for x in heights { sum += Double(x) }
        let average = f(sum / n), high = f(Double(heights.filter { $0 > 60 }.count) / n), veryHigh = f(Double(heights.filter { $0 > 80 }.count) / n)
        var acc = 0.0; for x in heights { let d = f(f(Double(x)) - average); acc += f(d * d) }
        let variance = f(f(acc) / f(n)), dev = f(variance.squareRoot())
        let mountain = (veryHigh >= f(0.15) || high >= f(0.30)) && dev > 5
        return (average, dev, high, veryHigh, mountain, average > 60 && !mountain)
    }

    /// terrainContext, finance cells (cellBiomes, seaNeighbor) and upperCombat provinces, keyed by province id in world order.
    public static func provinceGeography(_ d: TerrainDocument, elevations h: [Int], provinces: [JS], scale: Double) -> (terrain: JS, cells: [String: JS], combat: JS, order: [String]) {
        let ids = Climate.surface(d, elevations: h).ids
        let groups = scan(d, elevations: h, ids: ids, provinces: provinces, scale: scale)
        let terrain = JS.object(); terrain.version = JS(1); terrain.algorithm = JS("clipped-face-biome-area-v1")
        let tp = JS.object(), combat = JS.object(); var cells = [String: JS]()
        for g in groups {
            let e = elevation(g.land.map { h[$0] })
            let o = JS.object(); o.biomes = .array(ratios(g.counts).map { JS($0) })
            o.average = JS(e.average); o.deviation = JS(e.deviation); o.high = JS(e.high); o.veryHigh = JS(e.veryHigh); o.mountain = JS(e.mountain); o.plateau = JS(e.plateau)
            o.samples = JS(g.land.count); o.area = JS(g.area); tp[g.id] = o
            let vertices = g.all.sorted()
            let c = JS.object(); c.cellBiomes = .array(vertices.map { JS(Int(ids[$0])) })
            c.seaNeighbor = JS(vertices.contains { v in d.neighbors[v].contains { !g.all.contains($0) && h[$0] < 20 } }); cells[g.id] = c
            var counts = [Int](repeating: 0, count: 13), order = [Int]()
            for v in vertices { let b = Int(ids[v]); if counts[b] == 0 { order.append(b) }; counts[b] += 1 }
            var dominant = 0, maximum = 0; for b in order where counts[b] > maximum { maximum = counts[b]; dominant = b }
            let candidate = max(e.mountain ? 3 : e.plateau ? 1.5 : 1, f(genericBiomeDefense[dominant]))
            let p = JS.object(); p.biomeCounts = .array(counts.map { JS($0) }); p.biomeOrder = .array(order.map { JS($0) })
            p.storedDefense = JS(min(3, max(1, candidate))); p.locked = JS(false); p.manualSet = JS(false); p.manualFortress = JS(false)
            p.distance = JS(2147483647); p.connected = JS(false); combat[g.id] = p
        }
        terrain.provinces = tp
        return (terrain, cells, combat, groups.map(\.id))
    }
}
