import Foundation

/// The original province battle arrows (battle-arrows47 BattleArrowState47, after
/// Province.UpdateAttackArrow 0x45E030 / EnableBattleArrow 0x452120):
/// - a province of at least 6 cells held by a state keeps its arrows while any army targets it;
///   with none they are dropped and its arrow-start set is cleared;
/// - an arrow is dropped once its source province no longer belongs to the attacker;
/// - new arrows only when the province has none: the enemy armies targeting it are grouped by
///   state, the two largest groups each get 1 (more than 1 army), 2 (more than 5) or 3 (more than 7)
///   arrows from their own neighbouring provinces, the largest first, skipping a neighbour this
///   province already attacks;
/// - an arrow runs neighbour centre → this centre, bent through the border crossing of the cell
///   path, pushed outwards by 0.3 × the shorter half; a path under 2.4 units stops the province's
///   arrows for that update.
/// Presentation only: it reads the run and never changes it.
public final class BattleArrows {
    public struct Arrow: Sendable {
        public let source: Int, target: Int, attacker: Int, defender: Int
        public let start: TravelPoint, control: TravelPoint, end: TravelPoint
        public let born: Int
    }
    private var arrows = [Int: [Arrow]]()
    private var starts = [Int: Set<Int>]()
    private var mids = [Int64: TravelPoint?]()
    private var neighbors: [[Int]]?
    public init() {}
    public var all: [Arrow] { arrows.keys.sorted().flatMap { arrows[$0]! } }

    static let unitsPerMap = 240.0 / 1600, minCells = 6, minLength = 2.4
    static func count(_ armies: Int) -> Int { armies > 7 ? 3 : armies > 5 ? 2 : armies > 1 ? 1 : 0 }

    /// provinceNeighbors47: provinces whose land cells touch, in cell order.
    static func neighbors(_ g: TravelGraph) -> [[Int]] {
        g.byProvince.enumerated().map { province, cells in
            var list = [Int]()
            for c in cells { for k in g.linkStart[c]..<g.linkStart[c + 1] { let q = Int(g.provinces[g.linkTo[k]]); if q >= 0 && q != province && !list.contains(q) { list.append(q) } } }
            return list
        }
    }
    /// pathMidPoint47: the first border crossing of the cheapest cell path between the two centres.
    static func midPoint(_ g: TravelGraph, _ from: Int, _ to: Int, _ centers: [TravelPoint]) -> TravelPoint? {
        let allowed = Set(g.byProvince[from] + g.byProvince[to])
        func nearest(_ p: Int) -> Int {
            var best = -1, d = Double.infinity
            for c in g.byProvince[p] { let e = jsHypot(g.centers[c].x - centers[p].x, g.centers[c].y - centers[p].y); if e < d { d = e; best = c } }
            return best
        }
        let start = nearest(from), goal = nearest(to)
        if start < 0 || goal < 0 { return nil }
        var dist = [start: 0.0], prev = [Int: Int](), open = [start]
        while !open.isEmpty {
            var at = -1, low = Double.infinity, index = 0
            for (i, c) in open.enumerated() { let d = dist[c]!; if d < low { low = d; at = c; index = i } }
            open.remove(at: index)
            if at == goal { break }
            for k in g.linkStart[at]..<g.linkStart[at + 1] {
                let b = g.linkTo[k]; if !allowed.contains(b) { continue }
                let d = low + g.linkDistance[k]
                if d < (dist[b] ?? .infinity) { dist[b] = d; prev[b] = at; if !open.contains(b) { open.append(b) } }
            }
        }
        if dist[goal] == nil { return nil }
        var path = [goal]; while path[0] != start { path.insert(prev[path[0]]!, at: 0) }
        for i in 0..<(path.count - 1) where g.provinces[path[i]] != g.provinces[path[i + 1]] {
            let a = g.centers[path[i]], b = g.centers[path[i + 1]]
            return TravelPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
        }
        return nil
    }

    /// One Province.Update pass in province order; `day` stamps new arrows (they grow in over 1 s).
    public func update(_ r: JS, day: Int) {
        guard let g = Armies.bridge?.graph else { return }
        if neighbors == nil { neighbors = Self.neighbors(g) }
        let provinces = r.world.provinces.asArray, nations = r.world.nations.asArray
        var nationIndex = [String: Int](); for (i, n) in nations.enumerated() { nationIndex[n.id.asString] = i }
        let owner = provinces.map { nationIndex[$0.controller.asString] ?? -1 }
        let centers = provinces.map { TravelPoint(x: $0.center.x.asNumber, y: $0.center.y.asNumber) }
        var provinceIndex = [String: Int](); for (i, p) in provinces.enumerated() { provinceIndex[p.id.asString] = i }
        // The states of the living armies targeting each province, in army order.
        var targeting = [Int: [Int]]()
        for a in r.world.armies.asArray where a.status.asString != "destroyed" && a.troops.asNumber > 0 {
            guard let t = r.armyAutonomy.armies[a.id.asString].targetId.optionalString, let p = provinceIndex[t], let n = nationIndex[a.nationId.asString] else { continue }
            targeting[p, default: []].append(n)
        }
        let scale = r.scale.asNumber
        for p in provinces.indices {
            if g.byProvince.indices.contains(p) == false || g.byProvince[p].count < Self.minCells || owner[p] < 0 { continue }
            let armies = targeting[p] ?? []
            if armies.isEmpty { arrows[p] = nil; starts[p]?.removeAll(); continue }
            let kept = (arrows[p] ?? []).filter { owner[$0.source] == $0.attacker }
            if !kept.isEmpty { arrows[p] = kept; continue }
            arrows[p] = nil
            // EnableBattleArrow.
            var counts = [(Int, Int)]()
            for s in armies where s != owner[p] { if let i = counts.firstIndex(where: { $0.0 == s }) { counts[i].1 += 1 } else { counts.append((s, 1)) } }
            // Largest groups first; a stable sort keeps the first-seen state on a tie.
            var order = Array(counts.indices)
            order.sort { x, y in counts[x].1 != counts[y].1 ? counts[x].1 > counts[y].1 : x < y }
            let groups = order.prefix(2).map { counts[$0] }
            if groups.isEmpty { continue }
            var byState = [Int: [Int]]()
            for n in neighbors![p] { byState[owner[n], default: []].append(n) }
            var made = [Arrow](), set = starts[p] ?? []
            outer: for (state, count) in groups {
                let sources = byState[state] ?? []
                var rank = Array(sources.indices)
                rank.sort { x, y in
                    let cx = g.byProvince[sources[x]].count, cy = g.byProvince[sources[y]].count
                    return cx != cy ? cx > cy : x < y
                }
                let picks = rank.prefix(Self.count(count)).map { sources[$0] }
                for n in picks {
                    if starts[n]?.contains(p) == true { continue }
                    let key = Int64(n) << 32 | Int64(p)
                    if mids[key] == nil { mids[key] = .some(Self.midPoint(g, n, p, centers)) }
                    guard let mid = mids[key]! else { break outer }
                    func units(_ a: TravelPoint, _ b: TravelPoint) -> Double { jsHypot(a.x - b.x, a.y - b.y) / scale * Self.unitsPerMap }
                    let d1 = units(centers[n], mid), d2 = units(mid, centers[p])
                    if d1 + d2 < Self.minLength { break outer }
                    let vx = mid.x - (centers[n].x + centers[p].x) / 2, vy = mid.y - (centers[n].y + centers[p].y) / 2, len = jsHypot(vx, vy)
                    let push = min(d1, d2) * 0.3 / Self.unitsPerMap * scale
                    let control = len > 1e-9 ? TravelPoint(x: mid.x + vx / len * push, y: mid.y + vy / len * push) : mid
                    made.append(Arrow(source: n, target: p, attacker: owner[n], defender: owner[p], start: centers[n], control: control, end: centers[p], born: day))
                    set.insert(n)
                }
            }
            starts[p] = set
            if !made.isEmpty { arrows[p] = made }
        }
    }
}
