import Foundation

/// Province partition (settlement25-mesh landFaces / mergeRing, settlement25-regions, settlement25-cuts,
/// settlement47-regions perimeter unions): land is clipped at h = 20 into faces, then merged into the
/// requested number of compact provinces along natural divides; each province picks its city site.
public enum Regions {
    public struct Vertex: Sendable { public let key: String; public let x: Double; public let y: Double }
    public struct Face: Sendable { public var ring: [Vertex]; public var neighbors: [Int]; public let height: Double; public let source: [Int] }
    public struct Region: Sendable {
        public let ring: [Vertex]; public let area: Double; public let center: (Double, Double); public let height: Double
        public let members: [Int]; public let neighbors: [Int]
    }

    static func edgeKey(_ a: Vertex, _ b: Vertex) -> String { a.key.utf16.lexicographicallyPrecedes(b.key.utf16) ? a.key + "/" + b.key : b.key + "/" + a.key }
    static func polygonArea(_ p: [Vertex]) -> Double {
        var sum = 0.0; for i in p.indices { let a = p[i], b = p[(i + 1) % p.count]; sum = sum + a.x * b.y - b.x * a.y }
        return abs(sum) / 2
    }
    static func middle(_ ring: [Vertex]) -> (Double, Double) {
        var x = 0.0, y = 0.0; for p in ring { x += p.x }; for p in ring { y += p.y }
        return (x / Double(ring.count), y / Double(ring.count))
    }

    /// landFaces: triangles clipped at the h = 20 contour, uniformly oriented, with shared-edge neighbours.
    public static func landFaces(_ d: TerrainDocument, _ elevations: [Int]) -> [Face] {
        let points = d.points.enumerated().map { Vertex(key: "p\($0.offset)", x: Native.fr($0.element.0), y: Native.fr($0.element.1)) }
        var crossings = [String: Vertex](), faces = [Face]()
        func crossing(_ a0: Int, _ b0: Int) -> Vertex {
            let a = min(a0, b0), b = max(a0, b0)
            if elevations[a] == 20 { return points[a] }
            if elevations[b] == 20 { return points[b] }
            let key = "e\(a):\(b)"; if let old = crossings[key] { return old }
            let t = Double(20 - elevations[a]) / Double(elevations[b] - elevations[a])
            let v = Vertex(key: key, x: points[a].x + t * (points[b].x - points[a].x), y: points[a].y + t * (points[b].y - points[a].y))
            crossings[key] = v; return v
        }
        var offset = 0
        while offset < d.triangles.count {
            let ids = [d.triangles[offset], d.triangles[offset + 1], d.triangles[offset + 2]]; offset += 3
            if !ids.contains(where: { elevations[$0] > 20 }) { continue }
            var ring = [Vertex]()
            for i in 0..<3 {
                let a = ids[i], b = ids[(i + 1) % 3], insideA = elevations[a] >= 20, insideB = elevations[b] >= 20
                if insideA { ring.append(points[a]) }
                if insideA != insideB { ring.append(crossing(a, b)) }
            }
            var unique = [Vertex](), at = [String: Int]()
            for v in ring { if let i = at[v.key] { unique[i] = v } else { at[v.key] = unique.count; unique.append(v) } }
            if unique.count < 3 || polygonArea(unique) < 1e-7 { continue }
            var signed = 0.0; for i in unique.indices { let a = unique[i], b = unique[(i + 1) % unique.count]; signed = signed + a.x * b.y - b.x * a.y }
            if signed < 0 { unique.reverse() }
            faces.append(Face(ring: unique, neighbors: [], height: Double(ids.reduce(0) { $0 + elevations[$1] }) / 3, source: ids))
        }
        var owners = [String: Int]()
        for i in faces.indices { for j in faces[i].ring.indices {
            let key = edgeKey(faces[i].ring[j], faces[i].ring[(j + 1) % faces[i].ring.count])
            if let other = owners[key] { faces[other].neighbors.append(i); faces[i].neighbors.append(other) } else { owners[key] = i }
        } }
        return faces
    }

    /// mergeRing: union along shared edges; nil for holes, point contacts or more than 200 vertices.
    static func mergeRing(_ a: [Vertex], _ b: [Vertex]) -> [Vertex]? {
        var keys = [String](), edges = [String: (Vertex, Vertex)](), shared = 0
        for ring in [a, b] { for i in ring.indices {
            let from = ring[i], to = ring[(i + 1) % ring.count], key = edgeKey(from, to)
            if edges[key] != nil { edges[key] = nil; shared += 1 } else { edges[key] = (from, to); keys.append(key) }
        } }
        let live = keys.filter { edges[$0] != nil }
        if shared == 0 || live.count < 3 || live.count > 200 { return nil }
        var outgoing = [String: (Vertex, Vertex)]()
        for k in live { let e = edges[k]!; if outgoing[e.0.key] != nil { return nil }; outgoing[e.0.key] = e }
        let start = edges[live[0]]!.0
        var ring = [Vertex](), next = start
        while let e = outgoing[next.key] { ring.append(next); outgoing[next.key] = nil; next = e.1 }
        return next.key == start.key && outgoing.isEmpty ? ring : nil
    }

    struct Border { var length: Double; var resistance: Double; var edges: Int }
    /// A JavaScript Map<number, Border>: insertion order, delete-then-set appends.
    struct Adjacency {
        var keys: [Int] = []; var values: [Int: Border] = [:]
        subscript(_ k: Int) -> Border? { values[k] }
        mutating func set(_ k: Int, _ v: Border) { if values[k] == nil { keys.append(k) }; values[k] = v }
        mutating func delete(_ k: Int) { if values.removeValue(forKey: k) != nil { keys.removeAll { $0 == k } } }
        mutating func clear() { keys = []; values = [:] }
    }
    struct Cluster { var ring: [Vertex]; var area: Double; var x: Double; var y: Double; var height: Double; var members: [Int]; var adjacent = Adjacency(); var revision = 0; var live = true }
    struct Entry { let a: Int, b: Int, ar: Int, br: Int, cost: Double }
    struct Queue {
        var values: [Entry] = []
        func less(_ a: Entry, _ b: Entry) -> Bool { a.cost < b.cost || a.cost == b.cost && (a.a < b.a || a.a == b.a && a.b < b.b) }
        mutating func push(_ e: Entry) {
            values.append(e); var i = values.count - 1
            while i > 0 { let p = (i - 1) >> 1; if !less(e, values[p]) { break }; values[i] = values[p]; i = p }
            values[i] = e
        }
        mutating func pop() -> Entry? {
            guard !values.isEmpty else { return nil }
            let first = values[0], last = values.removeLast()
            if values.isEmpty { return first }
            var i = 0
            while i * 2 + 1 < values.count {
                var child = i * 2 + 1
                if child + 1 < values.count && less(values[child + 1], values[child]) { child += 1 }
                if !less(values[child], last) { break }
                values[i] = values[child]; i = child
            }
            values[i] = last
            return first
        }
    }

    /// settlementRegions47: the established unions (with the cut fallback), and if they stall the
    /// perimeter-aware unions. Nil when the web also fails.
    public static func partition(_ d: TerrainDocument, elevations: [Int], cities: Int) -> (regions: [Region], perimeter: Bool)? {
        let faces = landFaces(d, elevations)
        let surface = Climate.surface(d, elevations: elevations)
        // Only the explicit stall of the established unions falls back to the perimeter unions.
        switch unions(d, elevations, faces, surface, cities, perimeter: false) {
        case .ok(let r): return (r, false)
        case .failed: return nil
        case .stalled: break
        }
        if case .ok(let r) = unions(d, elevations, faces, surface, cities, perimeter: true) { return (r, true) }
        return nil
    }

    enum Outcome { case ok([Region]), stalled, failed }
    static func unions(_ d: TerrainDocument, _ elevations: [Int], _ faces: [Face], _ surface: Climate.Surface, _ cities: Int, perimeter: Bool) -> Outcome {
        let scale = 1000 / max(d.width, d.height)
        if !perimeter {
            if faces.count < cities { return .failed }
            var visited = [Bool](repeating: false, count: faces.count), components = 0
            for i in faces.indices where !visited[i] {
                components += 1; var q = [i]; visited[i] = true; var h = 0
                while h < q.count { for j in faces[q[h]].neighbors where !visited[j] { visited[j] = true; q.append(j) }; h += 1 }
            }
            if components > cities { return .failed }
        }
        var rivers = Set<String>()
        for (a, b) in surface.rivers.segments { rivers.insert(edgeKey(Vertex(key: "p\(a)", x: 0, y: 0), Vertex(key: "p\(b)", x: 0, y: 0))) }
        var clusters = faces.enumerated().map { i, f -> Cluster in let p = middle(f.ring); return Cluster(ring: f.ring, area: polygonArea(f.ring), x: p.0, y: p.1, height: f.height, members: [i]) }
        var edges = [String: Int]()
        for i in faces.indices { let f = faces[i]; for k in f.ring.indices {
            let a = f.ring[k], b = f.ring[(k + 1) % f.ring.count], key = edgeKey(a, b), length = jsHypot(a.x - b.x, a.y - b.y)
            if let j = edges[key] {
                let resistance = 1 + max(0, (f.height + faces[j].height) / 2 - 55) / 18 + abs(f.height - faces[j].height) / 15 + (rivers.contains(key) ? 3 : 0)
                let border = Border(length: length, resistance: length * resistance, edges: 1)
                clusters[i].adjacent.set(j, border); clusters[j].adjacent.set(i, border)
            } else { edges[key] = i }
        } }
        var heap = Queue()
        func offer(_ aa: Int, _ bb: Int) {
            let a = min(aa, bb), b = max(aa, bb), x = clusters[a], y = clusters[b]
            guard x.live, y.live, let border = x.adjacent[b] else { return }
            let dx = x.x - y.x, dy = x.y - y.y
            let ward = (dx * dx + dy * dy) * x.area * y.area / (x.area + y.area)
            let neck = 1 + min(4, min(x.area, y.area).squareRoot() / max(border.length, 1e-9))
            let cost: Double
            if perimeter {
                let boundary = Double(x.ring.count + y.ring.count - 2 * border.edges), r = boundary / 200
                cost = ward * neck * border.resistance / border.length * (1 + r * r)
            } else {
                let r = max(0, Double(x.ring.count + y.ring.count - 2 * border.edges - 60) / 60)
                cost = ward * neck * border.resistance / border.length * (1 + r * r)
            }
            heap.push(Entry(a: a, b: b, ar: x.revision, br: y.revision, cost: cost))
        }
        for i in clusters.indices { for j in clusters[i].adjacent.keys where i < j { offer(i, j) } }
        var count = clusters.count
        while count > cities {
            guard let e = heap.pop() else {
                if perimeter { return .failed }
                guard let alternative = cuts(faces, cities) else { return .stalled }
                for i in clusters.indices { clusters[i].live = false }
                var owner = [Int](repeating: 0, count: faces.count)
                for (id, r) in alternative.enumerated() {
                    var area = 0.0, x = 0.0, y = 0.0, height = 0.0
                    for i in r.members { owner[i] = id; let a = polygonArea(faces[i].ring), p = middle(faces[i].ring); area += a; x += p.0 * a; y += p.1 * a; height += faces[i].height * a }
                    clusters[id] = Cluster(ring: r.ring, area: area, x: x / area, y: y / area, height: height / area, members: r.members)
                }
                for i in faces.indices { for j in faces[i].neighbors where owner[i] != owner[j] { clusters[owner[i]].adjacent.set(owner[j], Border(length: 1, resistance: 1, edges: 1)) } }
                break
            }
            let a = clusters[e.a], b = clusters[e.b]
            if !a.live || !b.live || a.revision != e.ar || b.revision != e.br { continue }
            guard let ring = mergeRing(a.ring, b.ring) else { continue }
            let area = a.area + b.area
            clusters[e.a].x = (a.x * a.area + b.x * b.area) / area
            clusters[e.a].y = (a.y * a.area + b.y * b.area) / area
            clusters[e.a].height = (a.height * a.area + b.height * b.area) / area
            clusters[e.a].area = area; clusters[e.a].ring = ring; clusters[e.a].members.append(contentsOf: b.members)
            clusters[e.a].revision += 1; clusters[e.b].live = false; count -= 1
            clusters[e.a].adjacent.delete(e.b)
            for j in b.adjacent.keys where j != e.a {
                let border = b.adjacent[j]!
                let next = clusters[e.a].adjacent[j].map { Border(length: $0.length + border.length, resistance: $0.resistance + border.resistance, edges: $0.edges + border.edges) } ?? border
                clusters[e.a].adjacent.set(j, next)
                clusters[j].adjacent.delete(e.b); clusters[j].adjacent.set(e.a, next)
            }
            clusters[e.b].adjacent.clear()
            for j in clusters[e.a].adjacent.keys { offer(e.a, j) }
        }
        let ids = clusters.indices.filter { clusters[$0].live }
        var index = [Int: Int](); for (k, id) in ids.enumerated() { index[id] = k }
        var regions = [Region]()
        for id in ids {
            let c = clusters[id]
            if c.area * scale * scale < 0.01 { return .failed }
            var best = c.members[0], score = Double.infinity
            let radius = (c.area / Double.pi).squareRoot()
            for i in c.members {
                let f = faces[i], p = middle(f.ring), heights = f.source.map { elevations[$0] }
                let slope = Double(heights.max()! - heights.min()!)
                let water = f.source.contains { j in surface.rivers.riverIds[j] > 0 || d.neighbors[j].contains { elevations[$0] < 20 } }
                let value = jsHypot(p.0 - c.x, p.1 - c.y) / radius + max(0, f.height - 35) / 30 + slope / 35 - (water ? 0.15 : 0)
                if value < score { score = value; best = i }
            }
            regions.append(Region(ring: c.ring, area: c.area, center: middle(faces[best].ring), height: c.height, members: c.members, neighbors: c.adjacent.keys.map { index[$0]! }))
        }
        if perimeter {
            var seen = [Int](repeating: 0, count: faces.count)
            for r in regions {
                if r.ring.count < 3 || r.ring.count > 200 { return .failed }
                var faceArea = 0.0
                for m in r.members { if m < 0 || m >= faces.count { return .failed }; seen[m] += 1; if seen[m] > 1 { return .failed }; faceArea += polygonArea(faces[m].ring) }
                if abs(faceArea - polygonArea(r.ring)) > max(1e-6, faceArea * 1e-8) { return .failed }
            }
            if regions.count != cities || seen.contains(where: { $0 != 1 }) { return .failed }
        }
        return .ok(regions)
    }

    /// cutSettlementFaces: the bounded recursive splitter used when unions get stuck at low counts.
    static func cuts(_ faces: [Face], _ count: Int) -> [(ring: [Vertex], members: [Int])]? {
        let areas = faces.map { polygonArea($0.ring) }, points = faces.map { middle($0.ring) }
        func components(_ ids: [Int]) -> [[Int]] {
            var left = OrderedSet(ids), out = [[Int]]()
            while let first = left.first {
                var q = [first]; left.remove(first); var h = 0
                while h < q.count { for j in faces[q[h]].neighbors where left.remove(j) { q.append(j) }; h += 1 }
                out.append(q)
            }
            return out
        }
        func ring(_ ids: [Int]) -> [Vertex]? {
            var keys = [String](), edges = [String: (Vertex, Vertex)]()
            for id in ids { let r = faces[id].ring; for i in r.indices {
                let a = r[i], b = r[(i + 1) % r.count], key = edgeKey(a, b)
                if edges[key] != nil { edges[key] = nil } else { edges[key] = (a, b); keys.append(key) }
            } }
            let live = keys.filter { edges[$0] != nil }
            if live.count < 3 || live.count > 200 { return nil }
            var out = [String: (Vertex, Vertex)]()
            for k in live { let e = edges[k]!; if out[e.0.key] != nil { return nil }; out[e.0.key] = e }
            let start = edges[live[0]]!.0
            var result = [Vertex](), p = start
            while let e = out[p.key] { result.append(e.0); out[p.key] = nil; p = e.1 }
            return p.key == start.key && out.isEmpty ? result : nil
        }
        var work = 0
        func weight(_ g: [Int]) -> Double { g.reduce(0) { $0 + areas[$1] } }
        func allocate(_ groups: [[Int]], _ quota: Int) -> [Int]? {
            if groups.count > quota { return nil }
            var counts = groups.map { _ in 1 }; let weights = groups.map(weight)
            for _ in groups.count..<max(groups.count, quota) {
                var best = -1
                for i in groups.indices where counts[i] < groups[i].count && (best < 0 || weights[i] / Double(counts[i]) > weights[best] / Double(counts[best])) { best = i }
                if best < 0 { return nil }
                counts[best] += 1
            }
            return counts
        }
        func divide(_ ids: [Int], _ quota: Int) -> [(ring: [Vertex], members: [Int])]? {
            work += 1; if work > max(2048, count * 32) { return nil }
            if quota == 1 { return ring(ids).map { [($0, ids)] } }
            let total = weight(ids)
            var cx = 0.0, cy = 0.0; for i in ids { cx += points[i].0 * areas[i] }; for i in ids { cy += points[i].1 * areas[i] }; cx /= total; cy /= total
            var xx = 0.0, yy = 0.0, xy = 0.0
            for i in ids { let x = points[i].0 - cx, y = points[i].1 - cy; xx += x * x * areas[i]; yy += y * y * areas[i]; xy += x * y * areas[i] }
            let angle = 0.5 * atan2(2 * xy, xx - yy), leftQuota = quota / 2
            for rotate in [0, Double.pi / 2] {
                let ux = cos(angle + rotate), uy = sin(angle + rotate)
                let order = ids.sorted { a, b in
                    let v = (points[a].0 - points[b].0) * ux + (points[a].1 - points[b].1) * uy
                    return v != 0 && !v.isNaN ? v < 0 : a < b
                }
                for adjustment in [0, -0.04, 0.04] {
                    let goal = total * (Double(leftQuota) / Double(quota) + adjustment)
                    var sum = 0.0, cut = 0
                    while cut < order.count - 1 && sum < goal { sum += areas[order[cut]]; cut += 1 }
                    var left = components(Array(order[0..<cut])), right = components(Array(order[cut...]))
                    if left.count != 1 || right.count != 1 {
                        left = left.enumerated().sorted { weight($0.element) != weight($1.element) ? weight($0.element) > weight($1.element) : $0.offset < $1.offset }.map(\.element)
                        right = right.enumerated().sorted { weight($0.element) != weight($1.element) ? weight($0.element) > weight($1.element) : $0.offset < $1.offset }.map(\.element)
                        let a = left[0] + right.dropFirst().flatMap { $0 }, b = right[0] + left.dropFirst().flatMap { $0 }
                        left = components(a); right = components(b)
                        if left.count != 1 || right.count != 1 { continue }
                    }
                    guard let lq = allocate(left, leftQuota), let rq = allocate(right, quota - leftQuota) else { continue }
                    let groups = left + right, quotas = lq + rq
                    var result = [(ring: [Vertex], members: [Int])](), valid = true
                    for i in groups.indices { guard let pieces = divide(groups[i], quotas[i]) else { valid = false; break }; result.append(contentsOf: pieces) }
                    if valid { return result }
                }
            }
            return nil
        }
        let groups = components(Array(faces.indices))
        guard let quotas = allocate(groups, count) else { return nil }
        var result = [(ring: [Vertex], members: [Int])]()
        for i in groups.indices { guard let pieces = divide(groups[i], quotas[i]) else { return nil }; result.append(contentsOf: pieces) }
        return result
    }
}

/// A Set iterating in insertion order with removal (JavaScript Set used as a work list).
struct OrderedSet {
    private var items: [Int]; private var alive: Set<Int>; private var head = 0
    init(_ ids: [Int]) { items = ids; alive = Set(ids) }
    var first: Int? { mutating get { while head < items.count && !alive.contains(items[head]) { head += 1 }; return head < items.count ? items[head] : nil } }
    @discardableResult mutating func remove(_ id: Int) -> Bool { alive.remove(id) != nil }
}
