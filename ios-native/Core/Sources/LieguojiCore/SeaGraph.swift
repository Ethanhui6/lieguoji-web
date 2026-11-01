import Foundation

/// Sea geography (src/fms/play/sea-path.ts seaGraph) and capital harbours
/// (src/fms/play/war46-geography.ts buildHarbors46). Renderer triangles clipped at h=20;
/// face centres connect through their shared wet-edge midpoint.
public struct SeaLink: Sendable { public let to: Int; public let gate: TravelPoint; public let distance: Double }
public final class SeaNode: @unchecked Sendable {
    public let id: Int, center: TravelPoint, polygon: [TravelPoint]
    public var links: [SeaLink] = [], component = -1, ocean = false
    init(id: Int, center: TravelPoint, polygon: [TravelPoint]) { self.id = id; self.center = center; self.polygon = polygon }
}
public struct SeaPort: Sendable { public let id: String, provinceId: String, node: Int, shore: TravelPoint }
public struct HarborSite: Sendable {
    public let id: String, provinceId: String, capitalId: String, capitalCell: Int, anchor: Int
    public let shore: TravelPoint, component: Int, seeds: [Int], cells: [Int]
    public var js: JS {
        let o = JS.object(), sh = JS.object(); sh["x"] = JS(shore.x); sh["y"] = JS(shore.y)
        o["id"] = JS(id); o["provinceId"] = JS(provinceId); o["capitalId"] = JS(capitalId); o["capitalCell"] = JS(capitalCell); o["anchor"] = JS(anchor)
        o["shore"] = sh; o["component"] = JS(component); o["seeds"] = .array(seeds.map { JS($0) }); o["cells"] = .array(cells.map { JS($0) })
        return o
    }
}

public struct SeaGraph: @unchecked Sendable {
    public let order: [Int]
    public let nodes: [Int: SeaNode]
    public let ports: [SeaPort]

    /// Point-pair key equal iff the web's `${x},${y}` string key is equal (-0 prints as 0).
    struct EdgeKey: Hashable { let a: [UInt64], b: [UInt64]
        init(_ p: TravelPoint, _ q: TravelPoint) {
            func bits(_ v: Double) -> UInt64 { (v == 0 ? 0.0 : v).bitPattern }
            let x = [bits(p.x), bits(p.y)], y = [bits(q.x), bits(q.y)]
            if x.lexicographicallyPrecedes(y) { a = x; b = y } else { a = y; b = x }
        }
    }
    static func dist(_ a: TravelPoint, _ b: TravelPoint) -> Double { jsHypot(a.x - b.x, a.y - b.y) }
    static func mid(_ a: TravelPoint, _ b: TravelPoint) -> TravelPoint { TravelPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) }
    static func point(_ v: JS) -> TravelPoint { TravelPoint(x: v.x.asNumber, y: v.y.asNumber) }

    public init(_ d: TerrainDocument, elevations: [Int], provinces: [JS]) {
        let f = Native.fr, scale = 1000 / max(d.width, d.height)
        let pts = d.points.map { TravelPoint(x: f($0.0), y: f($0.1)) }, h = elevations.map { f(Double($0)) }
        var nodes = [Int: SeaNode](), order = [Int]()
        var edgeIndex = [Int: Int](), edges = [(ids: [Int], a: Int, b: Int)](), coasts = [(node: Int, a: TravelPoint, b: TravelPoint)]()
        let n = pts.count
        func scaled(_ p: TravelPoint) -> TravelPoint { TravelPoint(x: p.x * scale, y: p.y * scale) }
        func crossing(_ a0: Int, _ b0: Int) -> TravelPoint {
            var a = a0, b = b0; if a > b { swap(&a, &b) }
            if h[a] == 20 { return pts[a] }; if h[b] == 20 { return pts[b] }
            let t = (20 - h[a]) / (h[b] - h[a])
            return TravelPoint(x: pts[a].x + (pts[b].x - pts[a].x) * t, y: pts[a].y + (pts[b].y - pts[a].y) * t)
        }
        let tr = d.triangles
        var off = 0
        while off < tr.count {
            let ids = [tr[off], tr[off + 1], tr[off + 2]], id = off / 3
            var ring = [(p: TravelPoint, shore: Bool)]()
            for i in 0..<3 {
                let a = ids[i], b = ids[(i + 1) % 3], k = min(a, b) * n + max(a, b)
                if let e = edgeIndex[k] { edges[e].ids.append(id) } else { edgeIndex[k] = edges.count; edges.append((ids: [id], a: a, b: b)) }
                if h[a] < 20 { ring.append((pts[a], false)) }
                if (h[a] < 20) != (h[b] < 20) { ring.append((crossing(a, b), true)) }
            }
            off += 3
            if ring.count < 3 { continue }
            let polygon = ring.map { scaled($0.p) }, o = polygon[0]
            var area = 0.0
            for i in 0..<polygon.count { let a = polygon[i], b = polygon[(i + 1) % polygon.count]; area = area + (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) }
            if abs(area) <= 0 { continue }
            var sx = 0.0, sy = 0.0; for p in polygon { sx += p.x }; for p in polygon { sy += p.y }
            nodes[id] = SeaNode(id: id, center: TravelPoint(x: sx / Double(polygon.count), y: sy / Double(polygon.count)), polygon: polygon); order.append(id)
            for i in 0..<ring.count { let a = ring[i], b = ring[(i + 1) % ring.count]; if a.shore && b.shore && SeaGraph.dist(a.p, b.p) > 0 { coasts.append((id, scaled(a.p), scaled(b.p))) } }
        }
        var exterior = Set<Int>()
        let w = f(d.width), ht = f(d.height)
        for e in edges {
            if h[e.a] >= 20 && h[e.b] >= 20 { continue }
            let a = h[e.a] < 20 ? pts[e.a] : crossing(e.a, e.b), b = h[e.b] < 20 ? pts[e.b] : crossing(e.a, e.b)
            if SeaGraph.dist(a, b) <= 0 { continue }
            let gate = scaled(SeaGraph.mid(a, b)), left = nodes[e.ids[0]], right = e.ids.count > 1 ? nodes[e.ids[1]] : nil
            let onBoundary = (a.x == 0 && b.x == 0) || (a.y == 0 && b.y == 0) || (a.x == w && b.x == w) || (a.y == ht && b.y == ht)
            if e.ids.count == 1, let l = left, onBoundary { exterior.insert(l.id) }
            guard let l = left, let r = right else { continue }
            let cost = SeaGraph.dist(l.center, gate) + SeaGraph.dist(gate, r.center)
            l.links.append(SeaLink(to: r.id, gate: gate, distance: cost)); r.links.append(SeaLink(to: l.id, gate: gate, distance: cost))
        }
        var component = 0
        for sid in order where nodes[sid]!.component < 0 {
            let start = nodes[sid]!; var queue = [start]; start.component = component; var ocean = false, i = 0
            while i < queue.count { let x = queue[i]; i += 1; if exterior.contains(x.id) { ocean = true }; for l in x.links { let nx = nodes[l.to]!; if nx.component < 0 { nx.component = component; queue.append(nx) } } }
            for x in queue { x.ocean = ocean }; component += 1
        }
        var owners = [EdgeKey: String]()
        for p in provinces { let poly = p.polygon.asArray.map(SeaGraph.point); for i in 0..<poly.count { owners[EdgeKey(poly[i], poly[(i + 1) % poly.count])] = p.id.asString } }
        var best = [String: (port: SeaPort, length: Double)](), bestOrder = [String]()
        for c in coasts {
            let nd = nodes[c.node]!; guard let pid = owners[EdgeKey(c.a, c.b)], nd.ocean else { continue }
            let id = "port-\(pid)-\(nd.component)", length = SeaGraph.dist(c.a, c.b)
            if length > (best[id]?.length ?? 0) { if best[id] == nil { bestOrder.append(id) }; best[id] = (SeaPort(id: id, provinceId: pid, node: nd.id, shore: SeaGraph.mid(c.a, c.b)), length) }
        }
        self.order = order; self.nodes = nodes; self.ports = bestOrder.map { best[$0]!.port }
    }

    /// buildHarbors46 for 'capital-neighbor-v1' / 'capital-neighbor-v2'.
    public func harbors(_ d: TerrainDocument, provinces: [JS], cities: [JS], method: String) -> [HarborSite] {
        let f = Native.fr, scale = 1000 / max(d.width, d.height), tr = d.triangles, n = d.points.count
        var faces = [[TravelPoint]](), owners = [Int: Int](), near = [Set<Int>](), uses = [Int: Int]()
        var off = 0
        while off < tr.count {
            let id = off / 3, ids = [tr[off], tr[off + 1], tr[off + 2]]
            faces.append(ids.map { TravelPoint(x: f(d.points[$0].0) * scale, y: f(d.points[$0].1) * scale) }); near.append([id])
            for j in 0..<3 { let a = ids[j], b = ids[(j + 1) % 3], k = min(a, b) * n + max(a, b); uses[k, default: 0] += 1
                if let other = owners[k] { near[id].insert(other); near[other].insert(id) } else { owners[k] = id } }
            off += 3
        }
        let v2 = method == "capital-neighbor-v2"
        var openComponents = Set<Int>()
        if v2 { off = 0; while off < tr.count { for j in 0..<3 { let a = tr[off + j], b = tr[off + (j + 1) % 3]; if uses[min(a, b) * n + max(a, b)] == 1, let nd = nodes[off / 3] { openComponents.insert(nd.component) } }; off += 3 } }
        func open(_ id: Int) -> Bool { let nd = nodes[id]!; return v2 ? openComponents.contains(nd.component) : nd.ocean }
        var shoreOwners = [EdgeKey: String]()
        for p in provinces { let poly = p.polygon.asArray.map(SeaGraph.point); for i in 0..<poly.count { shoreOwners[EdgeKey(poly[i], poly[(i + 1) % poly.count])] = p.id.asString } }
        var coasts = [String: [(node: Int, shore: TravelPoint)]](), sizes = [Int: Int]()
        for id in order { let nd = nodes[id]!; sizes[nd.component, default: 0] += 1
            for i in 0..<nd.polygon.count { let a = nd.polygon[i], b = nd.polygon[(i + 1) % nd.polygon.count]; if let o = shoreOwners[EdgeKey(a, b)] { coasts[o, default: []].append((id, SeaGraph.mid(a, b))) } } }
        func inside(_ p: TravelPoint, _ ring: [TravelPoint]) -> Bool {
            let s = (0..<3).map { i -> Double in let a = ring[i], b = ring[(i + 1) % 3]; return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) }
            return s.allSatisfy { $0 >= -1e-8 } || s.allSatisfy { $0 <= 1e-8 }
        }
        var sites = [HarborSite]()
        for province in provinces {
            let pid = province.id.asString
            guard let city = cities.first(where: { $0.provinceId.asString == pid }) else { continue }
            let pos = SeaGraph.point(city.position)
            guard let cell = faces.firstIndex(where: { inside(pos, $0) }) else { continue }
            let candidates = (coasts[pid] ?? []).filter { near[cell].contains($0.node) && open($0.node) && (sizes[nodes[$0.node]!.component] ?? 0) >= 20 }
            guard let first = candidates.first else { continue }
            let component = nodes[first.node]!.component
            var seeds = [Int](), seen = Set<Int>()
            for c in candidates where nodes[c.node]!.component == component && seen.insert(c.node).inserted { seeds.append(c.node) }
            var cells = seeds, inCells = Set(seeds), q = seeds.map { ($0, 0) }, i = 0
            while i < q.count { let (id, depth) = q[i]; i += 1; if depth >= 5 { continue }
                for e in nodes[id]!.links { let nx = nodes[e.to]!; if open(nx.id) && nx.component == component && !inCells.contains(nx.id) { inCells.insert(nx.id); cells.append(nx.id); q.append((nx.id, depth + 1)) } } }
            sites.append(HarborSite(id: "port-\(pid)-\(component)", provinceId: pid, capitalId: city.id.asString, capitalCell: cell, anchor: first.node, shore: first.shore, component: component, seeds: seeds, cells: cells))
        }
        return sites
    }
}
