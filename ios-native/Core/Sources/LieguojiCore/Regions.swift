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

    /// mergeRing: union along shared edges; nil for holes, point contacts or more than `maxVertices` vertices (200 for 20K parity, 480 for 60K/120K high-res meshes).
    static func mergeRing(_ a: [Vertex], _ b: [Vertex], maxVertices: Int = 200) -> [Vertex]? {
        var keys = [String](), edges = [String: (Vertex, Vertex)](), shared = 0
        for ring in [a, b] { for i in ring.indices {
            let from = ring[i], to = ring[(i + 1) % ring.count], key = edgeKey(from, to)
            if edges[key] != nil { edges[key] = nil; shared += 1 } else { edges[key] = (from, to); keys.append(key) }
        } }
        let live = keys.filter { edges[$0] != nil }
        if shared == 0 || live.count < 3 || live.count > maxVertices { return nil }
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
    struct Cluster { var ring: [Vertex]; var area: Double; var effArea: Double = 0; var x: Double; var y: Double; var height: Double; var members: [Int]; var adjacent = Adjacency(); var revision = 0; var live = true }
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

    /// App 新世界专用：清理面积极小且孤立的海上礁石/细碎微岛（避免 4 格礁石占掉 80 城名额导致 1% 面积边角小城）。
    /// 不修改原版黄金测试路径（默认不调用）。
    public static func cleanTinyIslets(_ d: TerrainDocument, elevations: [Int], cities: Int) -> [Int] {
        let faces = landFaces(d, elevations)
        guard !faces.isEmpty, cities > 0 else { return elevations }
        var visited = [Bool](repeating: false, count: faces.count)
        var comps = [(members: [Int], area: Double)]()
        var totalArea = 0.0
        for i in faces.indices where !visited[i] {
            var q = [i]; visited[i] = true; var h = 0, area = 0.0
            while h < q.count {
                let u = q[h]; h += 1
                area += polygonArea(faces[u].ring)
                for v in faces[u].neighbors where !visited[v] { visited[v] = true; q.append(v) }
            }
            totalArea += area
            comps.append((q, area))
        }
        guard comps.count > 1, totalArea > 0 else { return elevations }
        let targetArea = totalArea / Double(cities)
        let largestIdx = comps.indices.max(by: { comps[$0].area < comps[$1].area }) ?? 0
        var out = elevations
        var droppedArea = 0.0
        // 按面积从小到大清理微岛，总剔除面积不超过总陆地的 4.5%，确保大中岛屿完整保留。
        for idx in comps.indices.sorted(by: { comps[$0].area < comps[$1].area }) {
            guard idx != largestIdx else { continue }
            let c = comps[idx]
            guard c.area < targetArea * 0.16 && c.members.count < 28 else { continue }
            guard droppedArea + c.area <= totalArea * 0.045 else { break }
            droppedArea += c.area
            for f in c.members {
                for s in faces[f].source where out.indices.contains(s) && out[s] >= 20 { out[s] = 19 }
            }
        }
        return out
    }

    /// settlementRegions47: the established unions (with the cut fallback), and if they stall the
    /// perimeter-aware unions. Nil when the web also fails.
    public static func partition(_ d: TerrainDocument, elevations: [Int], cities: Int, surface known: Climate.Surface? = nil, balanceAreas: Bool = false) -> (regions: [Region], perimeter: Bool, faces: [Face])? {
        let faces = landFaces(d, elevations)
        let surface = known ?? Climate.surface(d, elevations: elevations)
        // Only the explicit stall of the established unions falls back to the perimeter unions.
        switch unions(d, elevations, faces, surface, cities, perimeter: false, balanceAreas: balanceAreas) {
        case .ok(let r): return (r, false, faces)
        case .failed: return nil
        case .stalled: break
        }
        if case .ok(let r) = unions(d, elevations, faces, surface, cities, perimeter: true, balanceAreas: balanceAreas) { return (r, true, faces) }
        return nil
    }

    /// 历史国界锁定分州（v6.0.0 真实 GIS 历史剧本专用）：
    /// 按 `ownerMask`（每格所属历史国家序号，-1 为海）将陆地三角面严格锁定在各自历史国界内聚合分州，
    /// 绝不跨国界合并；按 `sqrt(nationArea)` 公平分配各国州郡配额，保证列强与中小国均有精致版图分辨率。
    public static func partitionWithinBorders(
        _ d: TerrainDocument,
        elevations: [Int],
        ownerMask: [Int8],
        cities: Int
    ) -> (regions: [Region], owners: [Int])? {
        guard let res = partitionWithinBordersWithFaces(d, elevations: elevations, ownerMask: ownerMask, cities: cities) else {
            return nil
        }
        return (res.regions, res.owners)
    }

    /// 与 `partitionWithinBorders` 同源，并额外返回 `faces` 供计算每州真实人口/工业密度均值。
    /// v10.0.0：传入 `popDensity` 与 `historicalRegion` 时，启用**非均匀地理密度分州** + 真实大河分界阻力：
    /// 俄罗斯/西伯利亚/青藏/戈壁等低密度广袤区自然合并为疏朗大州，而欧洲核心/日本/华北江南/台湾/香港/新加坡等稠密战略区自然保持精致细分小州！
    public static func partitionWithinBordersWithFaces(
        _ d: TerrainDocument,
        elevations: [Int],
        ownerMask: [Int8],
        cities: Int,
        surface known: Climate.Surface? = nil,
        historicalRegion: HistoricalRegion? = nil,
        popDensity: [UInt8]? = nil
    ) -> (regions: [Region], owners: [Int], faces: [Face])? {
        let faces = landFaces(d, elevations)
        guard !faces.isEmpty, !ownerMask.isEmpty else { return nil }
        let surface = known ?? Climate.surface(d, elevations: elevations)
        let pointCount = min(elevations.count, ownerMask.count)

        // 1. 为每个陆地三角面按其 3 个源顶点的 ownerMask 多数表决确定所属历史国家（-2 = 剧本外无人之地，不可通行与占领）
        var faceOwner = [Int](repeating: -1, count: faces.count)
        for (fi, f) in faces.enumerated() {
            var votes = [Int: Int]()
            var wastelandVotes = 0
            for v in f.source where v >= 0 && v < pointCount && elevations[v] >= 20 {
                let o = Int(ownerMask[v])
                if o >= 0 { votes[o, default: 0] += 1 }
                else if o == -2 { wastelandVotes += 1 }
            }
            if votes.isEmpty && wastelandVotes == 0 {
                for v in f.source where v >= 0 && v < pointCount {
                    let o = Int(ownerMask[v])
                    if o >= 0 { votes[o, default: 0] += 1 }
                    else if o == -2 { wastelandVotes += 1 }
                }
            }
            if let best = votes.max(by: {
                if $0.value != $1.value { return $0.value < $1.value }
                let ha = UInt32(truncatingIfNeeded: fi &* 2654435761 ^ ($0.key &* 2246822519))
                let hb = UInt32(truncatingIfNeeded: fi &* 2654435761 ^ ($1.key &* 2246822519))
                return ha < hb
            }) {
                if wastelandVotes > best.value {
                    faceOwner[fi] = -2
                } else {
                    faceOwner[fi] = best.key
                }
            } else if wastelandVotes > 0 {
                faceOwner[fi] = -2
            }
        }

        // 沿陆地邻接面 BFS 填补极少数未命中面（仅填 -1 海岸微缝，严禁侵入 -2 无人之地！）
        var queue = faceOwner.indices.filter { faceOwner[$0] >= 0 || faceOwner[$0] == -2 }
        guard faceOwner.contains(where: { $0 >= 0 }) else { return nil }
        var head = 0
        while head < queue.count {
            let cur = queue[head]; head += 1
            for nb in faces[cur].neighbors where faceOwner[nb] == -1 {
                faceOwner[nb] = faceOwner[cur]
                queue.append(nb)
            }
        }
        if faceOwner.contains(where: { $0 == -1 }) {
            let ownedCells = (0..<pointCount).filter { elevations[$0] >= 20 && (ownerMask[$0] >= 0 || ownerMask[$0] == -2) }
            for fi in faces.indices where faceOwner[fi] == -1 {
                let c = middle(faces[fi].ring)
                var bestO = 0, bestD = Double.infinity
                for cell in ownedCells {
                    let dx = d.points[cell].0 - c.0, dy = d.points[cell].1 - c.1
                    let dd = dx * dx + dy * dy
                    if dd < bestD { bestD = dd; bestO = Int(ownerMask[cell]) }
                }
                faceOwner[fi] = bestO
            }
        }

        // 2. 清理国界折角处 1–2 个三角面的极细孤立碎角（跳过 -2 无人之地；仅当该国主体在别处且该碎角被邻国包夹时并入邻国）
        do {
            var totalByOwner = [Int: Int]()
            for o in faceOwner where o >= 0 { totalByOwner[o, default: 0] += 1 }
            var visited = [Bool](repeating: false, count: faces.count)
            var compCountsByOwner = [Int: Int]()
            var comps = [(owner: Int, members: [Int])]()
            for fi in faces.indices where !visited[fi] && faceOwner[fi] >= 0 {
                let own = faceOwner[fi]
                var q = [fi]; visited[fi] = true; var h = 0
                while h < q.count {
                    let u = q[h]; h += 1
                    for nb in faces[u].neighbors where !visited[nb] && faceOwner[nb] == own {
                        visited[nb] = true; q.append(nb)
                    }
                }
                compCountsByOwner[own, default: 0] += 1
                comps.append((own, q))
            }
            for comp in comps where comp.members.count <= 2 {
                guard (compCountsByOwner[comp.owner] ?? 0) > 1,
                      (totalByOwner[comp.owner] ?? 0) > comp.members.count * 4 else { continue }
                var foreignVotes = [Int: Int]()
                for fi in comp.members {
                    for nb in faces[fi].neighbors where faceOwner[nb] != comp.owner && faceOwner[nb] >= 0 {
                        foreignVotes[faceOwner[nb], default: 0] += 1
                    }
                }
                if let targetOwner = foreignVotes.max(by: { $0.value == $1.value ? $0.key > $1.key : $0.value < $1.value })?.key {
                    for fi in comp.members { faceOwner[fi] = targetOwner }
                    compCountsByOwner[comp.owner, default: 1] -= 1
                    totalByOwner[comp.owner, default: 0] -= comp.members.count
                    totalByOwner[targetOwner, default: 0] += comp.members.count
                }
            }
        }

        // 3. 统计各国真实面积、地理密度加权有效面积（effArea）、面数与连通分块数（跳过 -2 无人之地）：
        // v10.0.0：低密度广袤荒原（西伯利亚/青藏/戈壁）自动压低密度权重合并为大州，稠密要冲（欧陆核心/日本/中原/台湾/香港/新加坡）自动抬高权重细分出精巧小州！
        var nationArea = [Int: Double]()
        var nationEffArea = [Int: Double]()
        var nationFaceCount = [Int: Int]()
        var nationCompCount = [Int: Int]()
        var faceAreas = [Double](repeating: 0, count: faces.count)
        var faceEffAreas = [Double](repeating: 0, count: faces.count)
        let hasPopDensity = (popDensity?.isEmpty == false)
        for (fi, f) in faces.enumerated() {
            let a = polygonArea(f.ring)
            faceAreas[fi] = a
            let densityWeight: Double
            if hasPopDensity, let popArr = popDensity {
                var sum = 0
                var cnt = 0
                for v in f.source where v >= 0 && v < popArr.count && elevations[v] >= 20 {
                    let pd = Int(popArr[v])
                    if pd > 0 { sum += pd; cnt += 1 }
                }
                let avgPop = cnt > 0 ? Double(sum) / Double(cnt) : 85.0
                let dNorm = max(0.12, avgPop / 100.0)
                densityWeight = max(0.20, min(3.50, pow(dNorm, 1.38)))
            } else {
                densityWeight = 1.0
            }
            let ea = a * densityWeight
            faceEffAreas[fi] = ea
            let o = faceOwner[fi]
            guard o >= 0 else { continue }
            nationArea[o, default: 0] += a
            nationEffArea[o, default: 0] += ea
            nationFaceCount[o, default: 0] += 1
        }
        do {
            var visited = [Bool](repeating: false, count: faces.count)
            for fi in faces.indices where !visited[fi] && faceOwner[fi] >= 0 {
                let own = faceOwner[fi]
                var q = [fi]; visited[fi] = true; var h = 0
                while h < q.count {
                    let u = q[h]; h += 1
                    for nb in faces[u].neighbors where !visited[nb] && faceOwner[nb] == own {
                        visited[nb] = true; q.append(nb)
                    }
                }
                nationCompCount[own, default: 0] += 1
            }
        }

        let activeOwners = nationArea.keys.sorted()
        guard !activeOwners.isEmpty else { return nil }
        var targetPerNation = [Int: Int]()
        var minTotal = 0
        for o in activeOwners {
            let m = min(nationFaceCount[o] ?? 1, max(1, nationCompCount[o] ?? 1))
            targetPerNation[o] = m
            minTotal += m
        }
        let provCap = d.points.count > 80_000 ? 2600 : (d.points.count > 25_000 ? 1400 : 720)
        let ringVertexCap = d.points.count > 25_000 ? 480 : 200
        let requestedTotal = max(minTotal, min(provCap, cities))
        var sqrtWeights = [Int: Double]()
        var sumSqrt = 0.0
        for o in activeOwners {
            let w = max(1e-6, (nationEffArea[o] ?? nationArea[o] ?? 1.0)).squareRoot()
            sqrtWeights[o] = w
            sumSqrt += w
        }
        var currentTotal = minTotal
        while currentTotal < requestedTotal {
            var bestOwner = -1
            var bestPriority = -Double.infinity
            for o in activeOwners {
                let cur = targetPerNation[o] ?? 1
                let cap = nationFaceCount[o] ?? 1
                guard cur < cap else { continue }
                let ideal = Double(requestedTotal) * ((sqrtWeights[o] ?? 1.0) / max(1e-9, sumSqrt))
                let priority = ideal / Double(cur)
                if priority > bestPriority || (priority == bestPriority && o < bestOwner) {
                    bestPriority = priority
                    bestOwner = o
                }
            }
            if bestOwner < 0 { break }
            targetPerNation[bestOwner, default: 1] += 1
            currentTotal += 1
        }

        // 4. 初始化聚簇与全图邻接（保留跨国邻接以准确构建 Region.neighbors，但入队合并严格禁止跨国！）
        var rivers = Set<String>()
        for (a, b) in surface.rivers.segments {
            rivers.insert(edgeKey(Vertex(key: "p\(a)", x: 0, y: 0), Vertex(key: "p\(b)", x: 0, y: 0)))
        }
        // v9.0.0：投影真实地理大河线段，为跨河/贴河相邻三角面施加自然河道分界阻力（仿 HOI4 沿河划州）
        struct RiverSeg2D { let x1: Double, y1: Double, x2: Double, y2: Double, minX: Double, maxX: Double, minY: Double, maxY: Double, tier: Double }
        var realRiverSegs = [RiverSeg2D]()
        if let hreg = historicalRegion, hreg != .custom {
            let lonMin = hreg.lonMin - 2.0, lonMax = hreg.lonMax + 2.0
            let latMin = hreg.latMin - 2.0, latMax = hreg.latMax + 2.0
            for rv in HistoricalGeography.realRivers where rv.points.count >= 2 {
                let inBounds = rv.points.contains { $0.lon >= lonMin && $0.lon <= lonMax && $0.lat >= latMin && $0.lat <= latMax }
                guard inBounds else { continue }
                let pts = rv.points.map { HistoricalBasemaps.project(lon: $0.lon, lat: $0.lat, region: hreg, width: d.width, height: d.height) }
                let tier = Double(rv.tier)
                for k in 0..<(pts.count - 1) {
                    let p1 = pts[k], p2 = pts[k + 1]
                    realRiverSegs.append(RiverSeg2D(
                        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
                        minX: min(p1.x, p2.x) - 5.5, maxX: max(p1.x, p2.x) + 5.5,
                        minY: min(p1.y, p2.y) - 5.5, maxY: max(p1.y, p2.y) + 5.5,
                        tier: tier
                    ))
                }
            }
        }
        func riverResistance(_ mx: Double, _ my: Double, _ c1: (Double, Double), _ c2: (Double, Double)) -> Double {
            guard !realRiverSegs.isEmpty else { return 0 }
            var best = 0.0
            for s in realRiverSegs {
                if mx < s.minX || mx > s.maxX || my < s.minY || my > s.maxY { continue }
                let vx = s.x2 - s.x1, vy = s.y2 - s.y1
                let l2 = vx * vx + vy * vy
                guard l2 > 1e-6 else { continue }
                let t = max(0.0, min(1.0, ((mx - s.x1) * vx + (my - s.y1) * vy) / l2))
                let px = s.x1 + t * vx, py = s.y1 + t * vy
                let distSq = (mx - px) * (mx - px) + (my - py) * (my - py)
                if distSq <= 22.0 {
                    // 两侧面心若分居大河两岸，显著提升阻力，促使合并沿河岸止步
                    let s1 = (c1.0 - s.x1) * vy - (c1.1 - s.y1) * vx
                    let s2 = (c2.0 - s.x1) * vy - (c2.1 - s.y1) * vx
                    let bonus = (s1 * s2 <= 0) ? (3.2 + s.tier * 1.6) : (1.2 + s.tier * 0.5)
                    if bonus > best { best = bonus }
                }
            }
            return best
        }

        var clusters = faces.enumerated().map { i, f -> Cluster in
            let p = middle(f.ring)
            var cl = Cluster(ring: f.ring, area: faceAreas[i], effArea: faceEffAreas[i], x: p.0, y: p.1, height: f.height, members: [i])
            if faceOwner[i] < 0 { cl.live = false }
            return cl
        }
        let clusterOwner = faceOwner
        var liveCount = nationFaceCount
        var nationTargetEffArea = [Int: Double]()
        for o in activeOwners {
            nationTargetEffArea[o] = (nationEffArea[o] ?? nationArea[o] ?? 1.0) / Double(max(1, targetPerNation[o] ?? 1))
        }

        var edgeOwner = [String: Int]()
        for i in faces.indices where faceOwner[i] >= 0 {
            let f = faces[i]
            for k in f.ring.indices {
                let a = f.ring[k], b = f.ring[(k + 1) % f.ring.count]
                let key = edgeKey(a, b)
                let length = jsHypot(a.x - b.x, a.y - b.y)
                if let j = edgeOwner[key] {
                    let realRv = realRiverSegs.isEmpty ? 0.0 : riverResistance((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (clusters[i].x, clusters[i].y), (clusters[j].x, clusters[j].y))
                    let resistance = 1 + max(0, (f.height + faces[j].height) / 2 - 55) / 18 + abs(f.height - faces[j].height) / 15 + (rivers.contains(key) ? 3 : 0) + realRv
                    let border = Border(length: length, resistance: length * resistance, edges: 1)
                    clusters[i].adjacent.set(j, border)
                    clusters[j].adjacent.set(i, border)
                } else {
                    edgeOwner[key] = i
                }
            }
        }

        var heap = Queue()
        func offer(_ aa: Int, _ bb: Int) {
            let a = min(aa, bb), b = max(aa, bb)
            let owner = clusterOwner[a]
            // 严格国界锁定：无人之地与不同历史国家的聚簇永不入队、永不合并！
            guard owner >= 0, owner == clusterOwner[b] else { return }
            guard (liveCount[owner] ?? 0) > (targetPerNation[owner] ?? 1) else { return }
            let x = clusters[a], y = clusters[b]
            guard x.live, y.live, let border = x.adjacent[b] else { return }
            let dx = x.x - y.x, dy = x.y - y.y
            // v10.0.0：使用地理密度加权有效面积 effArea 驱动 Ward 合并代价，使低密度荒原（西伯利亚/青藏）自动聚合成宽阔大州、稠密都会自动保留精致小州！
            let xa = x.effArea, ya = y.effArea
            let ward = (dx * dx + dy * dy) * xa * ya / max(1e-9, xa + ya)
            let neck = 1 + min(4, min(x.area, y.area).squareRoot() / max(border.length, 1e-9))
            let tEffArea = nationTargetEffArea[owner] ?? 1.0
            let minA = min(xa, ya), floorA = tEffArea * 0.48
            let smallFactor = minA < floorA ? max(0.08, (minA / max(1e-9, floorA)) * 0.40) : 1.0
            let boundary = Double(x.ring.count + y.ring.count - 2 * border.edges)
            let r = boundary / 200.0
            let cost = ward * neck * border.resistance / max(border.length, 1e-9) * (1 + r * r) * smallFactor
            heap.push(Entry(a: a, b: b, ar: x.revision, br: y.revision, cost: cost))
        }

        for i in clusters.indices {
            for j in clusters[i].adjacent.keys where i < j && clusterOwner[i] == clusterOwner[j] {
                offer(i, j)
            }
        }

        while let e = heap.pop() {
            let a = clusters[e.a], b = clusters[e.b]
            if !a.live || !b.live || a.revision != e.ar || b.revision != e.br { continue }
            let owner = clusterOwner[e.a]
            if owner != clusterOwner[e.b] { continue }
            if (liveCount[owner] ?? 0) <= (targetPerNation[owner] ?? 1) { continue }
            guard let ring = mergeRing(a.ring, b.ring, maxVertices: ringVertexCap) else { continue }

            let area = a.area + b.area
            clusters[e.a].x = (a.x * a.area + b.x * b.area) / max(1e-9, area)
            clusters[e.a].y = (a.y * a.area + b.y * b.area) / max(1e-9, area)
            clusters[e.a].height = (a.height * a.area + b.height * b.area) / max(1e-9, area)
            clusters[e.a].area = area
            clusters[e.a].effArea = a.effArea + b.effArea
            clusters[e.a].ring = ring
            clusters[e.a].members.append(contentsOf: b.members)
            clusters[e.a].revision += 1
            clusters[e.b].live = false
            liveCount[owner, default: 1] -= 1

            clusters[e.a].adjacent.delete(e.b)
            for j in b.adjacent.keys where j != e.a {
                guard let border = b.adjacent[j] else { continue }
                let next = clusters[e.a].adjacent[j].map {
                    Border(length: $0.length + border.length, resistance: $0.resistance + border.resistance, edges: $0.edges + border.edges)
                } ?? border
                clusters[e.a].adjacent.set(j, next)
                clusters[j].adjacent.delete(e.b)
                clusters[j].adjacent.set(e.a, next)
            }
            clusters[e.b].adjacent.clear()
            if (liveCount[owner] ?? 0) > (targetPerNation[owner] ?? 1) {
                for j in clusters[e.a].adjacent.keys where clusterOwner[j] == owner {
                    offer(e.a, j)
                }
            }
        }

        // 5. 生成最终合法 Region 列表与严格 100% 对齐的历史归属数组 owners
        let liveIds = clusters.indices.filter { clusters[$0].live }
        guard !liveIds.isEmpty else { return nil }
        var index = [Int: Int]()
        index.reserveCapacity(liveIds.count)
        for (k, id) in liveIds.enumerated() { index[id] = k }

        var regions = [Region]()
        var owners = [Int]()
        regions.reserveCapacity(liveIds.count)
        owners.reserveCapacity(liveIds.count)

        for id in liveIds {
            let c = clusters[id]
            guard let firstMember = c.members.first else { continue }
            var best = firstMember, score = Double.infinity
            let radius = max(1e-3, (c.area / Double.pi).squareRoot())
            for fi in c.members {
                let f = faces[fi], p = middle(f.ring)
                let hs = f.source.map { $0 >= 0 && $0 < elevations.count ? elevations[$0] : 20 }
                let slope = Double((hs.max() ?? 20) - (hs.min() ?? 20))
                let water = f.source.contains { j in
                    j >= 0 && j < surface.rivers.riverIds.count &&
                    (surface.rivers.riverIds[j] > 0 || (j < d.neighbors.count && d.neighbors[j].contains { $0 >= 0 && $0 < elevations.count && elevations[$0] < 20 }))
                }
                let value = jsHypot(p.0 - c.x, p.1 - c.y) / radius + max(0, f.height - 35) / 30 + slope / 35 - (water ? 0.15 : 0)
                if value < score { score = value; best = fi }
            }
            let nbs = c.adjacent.keys.compactMap { index[$0] }
            regions.append(Region(ring: c.ring, area: c.area, center: middle(faces[best].ring), height: c.height, members: c.members, neighbors: nbs))
            owners.append(clusterOwner[id])
        }
        return regions.isEmpty ? nil : (regions, owners, faces)
    }

    enum Outcome { case ok([Region]), stalled, failed }
    static func unions(_ d: TerrainDocument, _ elevations: [Int], _ faces: [Face], _ surface: Climate.Surface, _ cities: Int, perimeter: Bool, balanceAreas: Bool = false) -> Outcome {
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
        let targetArea = clusters.reduce(0.0) { $0 + $1.area } / Double(max(1, cities))
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
            // App 新世界面积均衡：极小边角州在合并队列中获得优先折扣，避免被山河阻力孤立成 1%–3% 细碎边角。
            let smallFactor: Double = {
                guard balanceAreas, targetArea > 0 else { return 1.0 }
                let minA = min(x.area, y.area), floorA = targetArea * 0.45
                return minA < floorA ? max(0.08, (minA / floorA) * 0.40) : 1.0
            }()
            if perimeter {
                let boundary = Double(x.ring.count + y.ring.count - 2 * border.edges), r = boundary / 200
                cost = ward * neck * border.resistance / border.length * (1 + r * r) * smallFactor
            } else {
                let r = max(0, Double(x.ring.count + y.ring.count - 2 * border.edges - 60) / 60)
                cost = ward * neck * border.resistance / border.length * (1 + r * r) * smallFactor
            }
            heap.push(Entry(a: a, b: b, ar: x.revision, br: y.revision, cost: cost))
        }
        for i in clusters.indices { for j in clusters[i].adjacent.keys where i < j { offer(i, j) } }
        let ringVertexCap = d.points.count > 25_000 ? 480 : 200
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
            guard let ring = mergeRing(a.ring, b.ring, maxVertices: ringVertexCap) else { continue }
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
                if r.ring.count < 3 || r.ring.count > ringVertexCap { return .failed }
                var faceArea = 0.0
                for m in r.members { if m < 0 || m >= faces.count { return .failed }; seen[m] += 1; if seen[m] > 1 { return .failed }; faceArea += polygonArea(faces[m].ring) }
                if abs(faceArea - polygonArea(r.ring)) > max(1e-6, faceArea * 1e-8) { return .failed }
            }
            if regions.count != cities || seen.contains(where: { $0 != 1 }) { return .failed }
        }
        return .ok(regions)
    }

    /// 手绘州郡建图（v5.0 地图工坊 Step 2 专用）：
    /// 根据玩家在地图格网上手绘的 `cellProvinces`（每格一个州编号，-1 表示未划）生成完全合法、闭环无孔、可直接进入实机推演的 `[Region]`。
    public static func fromCellAssignment(
        _ d: TerrainDocument,
        elevations: [Int],
        cellProvinces: [Int],
        surface known: Climate.Surface? = nil
    ) -> (regions: [Region], faces: [Face])? {
        let faces = landFaces(d, elevations)
        guard !faces.isEmpty else { return nil }
        let surface = known ?? Climate.surface(d, elevations: elevations)

        // 1. 逐面按源格多数表决初始州编号，未涂色陆面用最近邻 BFS 自动归属，确保零孤立陆面
        var faceOwner = [Int](repeating: -1, count: faces.count)
        for (fi, f) in faces.enumerated() {
            var votes = [Int: Int]()
            for s in f.source where s >= 0 && s < cellProvinces.count && elevations[s] >= 20 {
                let p = cellProvinces[s]
                if p >= 0 { votes[p, default: 0] += 1 }
            }
            if let best = votes.max(by: { $0.value == $1.value ? $0.key > $1.key : $0.value < $1.value })?.key {
                faceOwner[fi] = best
            }
        }
        var queue = faceOwner.indices.filter { faceOwner[$0] >= 0 }
        if queue.isEmpty { return nil }
        var head = 0
        while head < queue.count {
            let cur = queue[head]; head += 1
            for nb in faces[cur].neighbors where faceOwner[nb] < 0 {
                faceOwner[nb] = faceOwner[cur]
                queue.append(nb)
            }
        }
        // 仍有孤立海岛未被涂色时，独立自成一州
        var nextAutoId = (faceOwner.max() ?? 0) + 1
        for fi in faces.indices where faceOwner[fi] < 0 {
            var q = [fi]; faceOwner[fi] = nextAutoId; var h = 0
            while h < q.count {
                let cur = q[h]; h += 1
                for nb in faces[cur].neighbors where faceOwner[nb] < 0 {
                    faceOwner[nb] = nextAutoId; q.append(nb)
                }
            }
            nextAutoId += 1
        }

        // 2. 拆分为严格连通的州域片区，并将过碎（< 4 面）孤片并入最长公共边界邻州
        var compId = [Int](repeating: -1, count: faces.count)
        var groups = [[Int]]()
        for fi in faces.indices where compId[fi] < 0 {
            let pid = faceOwner[fi], cid = groups.count
            var q = [fi]; compId[fi] = cid; var h = 0
            while h < q.count {
                let cur = q[h]; h += 1
                for nb in faces[cur].neighbors where compId[nb] < 0 && faceOwner[nb] == pid {
                    compId[nb] = cid; q.append(nb)
                }
            }
            groups.append(q)
        }
        func simpleRing(_ ids: [Int]) -> [Vertex]? {
            var keys = [String](), edges = [String: (Vertex, Vertex)]()
            for id in ids {
                let r = faces[id].ring
                for i in r.indices {
                    let a = r[i], b = r[(i + 1) % r.count], key = edgeKey(a, b)
                    if edges[key] != nil { edges[key] = nil } else { edges[key] = (a, b); keys.append(key) }
                }
            }
            let live = keys.filter { edges[$0] != nil }
            if live.count < 3 { return nil }
            var out = [String: (Vertex, Vertex)]()
            for k in live {
                let e = edges[k]!
                if out[e.0.key] != nil { return nil }
                out[e.0.key] = e
            }
            let start = edges[live[0]]!.0
            var result = [Vertex](), p = start
            while let e = out[p.key] { result.append(e.0); out[p.key] = nil; p = e.1 }
            return p.key == start.key && out.isEmpty ? result : nil
        }
        func mergeSmallOrHoled() {
            var changed = true, passes = 0
            while changed && passes < 6 {
                changed = false; passes += 1
                for g in groups.indices where !groups[g].isEmpty {
                    let needsMerge = groups[g].count < 4 || simpleRing(groups[g]) == nil
                    guard needsMerge else { continue }
                    var borderCounts = [Int: Int]()
                    for fi in groups[g] {
                        for nb in faces[fi].neighbors {
                            let og = compId[nb]
                            if og != g && og >= 0 && !groups[og].isEmpty { borderCounts[og, default: 0] += 1 }
                        }
                    }
                    guard let target = borderCounts.max(by: { $0.value < $1.value })?.key else { continue }
                    for fi in groups[g] { compId[fi] = target }
                    groups[target].append(contentsOf: groups[g])
                    groups[g].removeAll()
                    changed = true
                }
            }
        }
        mergeSmallOrHoled()

        // 3. 构造最终 Region 列表（超大无环片自动退回安全切分，确保 100% 合法闭合多边形）
        var finalMemberGroups = [[Int]]()
        var finalRings = [[Vertex]]()
        for g in groups where !g.isEmpty {
            if let ring = simpleRing(g), ring.count <= 200 {
                finalMemberGroups.append(g)
                finalRings.append(ring)
            } else if let split = cuts(faces, max(2, min(8, g.count / 12))) {
                // 若玩家手绘了环抱孔洞的巨州，借用安全切割保证多边形简单闭合
                let subset = Set(g)
                let filtered = split.filter { $0.members.contains(where: { subset.contains($0) }) }
                if !filtered.isEmpty {
                    for s in filtered { finalMemberGroups.append(s.members); finalRings.append(s.ring) }
                } else if let r = simpleRing(g) {
                    finalMemberGroups.append(g); finalRings.append(r)
                }
            } else if let r = simpleRing(g) {
                finalMemberGroups.append(g); finalRings.append(r)
            }
        }
        guard finalMemberGroups.count >= 2 else { return nil }

        // 重新映射每面归属与邻接表
        var ownerOfFace = [Int](repeating: -1, count: faces.count)
        for (ri, mems) in finalMemberGroups.enumerated() {
            for fi in mems { ownerOfFace[fi] = ri }
        }
        var adjSets = [Set<Int>](repeating: [], count: finalMemberGroups.count)
        for fi in faces.indices {
            let a = ownerOfFace[fi]; guard a >= 0 else { continue }
            for nb in faces[fi].neighbors {
                let b = ownerOfFace[nb]
                if b >= 0 && b != a { adjSets[a].insert(b); adjSets[b].insert(a) }
            }
        }
        var regions = [Region]()
        regions.reserveCapacity(finalMemberGroups.count)
        for (ri, mems) in finalMemberGroups.enumerated() {
            let ring = finalRings[ri]
            var area = 0.0, cx = 0.0, cy = 0.0, hSum = 0.0
            for fi in mems {
                let a = polygonArea(faces[fi].ring), p = middle(faces[fi].ring)
                area += a; cx += p.0 * a; cy += p.1 * a; hSum += faces[fi].height * a
            }
            let safeArea = max(1e-6, area)
            let mx = cx / safeArea, my = cy / safeArea, mh = hSum / safeArea
            var best = mems[0], score = Double.infinity
            let radius = max(1e-3, (safeArea / Double.pi).squareRoot())
            for fi in mems {
                let f = faces[fi], p = middle(f.ring), hs = f.source.map { elevations[$0] }
                let slope = Double((hs.max() ?? 20) - (hs.min() ?? 20))
                let water = f.source.contains { j in surface.rivers.riverIds[j] > 0 || d.neighbors[j].contains { elevations[$0] < 20 } }
                let value = jsHypot(p.0 - mx, p.1 - my) / radius + max(0, f.height - 35) / 30 + slope / 35 - (water ? 0.15 : 0)
                if value < score { score = value; best = fi }
            }
            regions.append(Region(ring: ring, area: safeArea, center: middle(faces[best].ring), height: mh, members: mems, neighbors: adjSets[ri].sorted()))
        }
        return (regions, faces)
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
