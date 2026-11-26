import Foundation

/// The automatic opening of a new world: nation capitals and territory (opening-layout47
/// defaultLayout47) and the cultures' state and city names (civilization47-names
/// initialCivilization47, catalogue in cultures.json).
public enum Opening {
    public struct Culture: Codable, Sendable {
        public let id: String; public let label: String; public let suggestedReligion: String; public let suggestedPolity: String
        public let stateRoots: [String]; public let stateEnds: [String]; public let cityRoots: [String]; public let cityEnds: [String]
        public let historicalStates: [String]; public let historicalCities: [String]
    }
    public struct Nation: Sendable, Equatable { public let cultureId: String; public let religionId: String; public let polity: String; public let name: String; public let sourceKey: String; public let full: String }

    /// Largest province first, then farthest-point capitals, breadth-first growth, nearest capital for islands.
    public static func layout(_ regions: [Regions.Region], count: Int) -> (seeds: [Int], owners: [Int]) {
        func distance(_ a: (Double, Double), _ b: (Double, Double)) -> Double { let dx = a.0 - b.0, dy = a.1 - b.1; return dx * dx + dy * dy }
        var first = 0
        for i in regions.indices where Regions.polygonArea(regions[i].ring) > Regions.polygonArea(regions[first].ring) { first = i }
        var seeds = [first]
        while seeds.count < count {
            var best = -1, score = -1.0
            for i in regions.indices where !seeds.contains(i) {
                let d = seeds.map { distance(regions[i].center, regions[$0].center) }.min()!
                if d > score { best = i; score = d }
            }
            seeds.append(best)
        }
        var owners = [Int](repeating: -1, count: regions.count)
        for (k, s) in seeds.enumerated() { owners[s] = k }
        var queue = seeds, head = 0
        while head < queue.count { let i = queue[head]; head += 1; for next in regions[i].neighbors where owners[next] < 0 { owners[next] = owners[i]; queue.append(next) } }
        for i in regions.indices where owners[i] < 0 {
            var best = 0
            for n in seeds.indices where distance(regions[i].center, regions[seeds[n]].center) < distance(regions[i].center, regions[seeds[best]].center) { best = n }
            owners[i] = best
        }
        return (seeds, owners)
    }

    /// 有机地形阻力扩张（供自绘地图「划定列国」均衡重分使用）：山地与陡坡代价更高，天然沿山脊与河谷分疆，不生硬方正。
    public static func organicAssign(centers: [(Float, Float)], heights: [Float], neighbors: [[Int]], seeds: [Int], salt: Int = 1) -> [Int] {
        let count = centers.count
        guard count > 0, !seeds.isEmpty else { return [] }
        var owners = [Int](repeating: -1, count: count)
        var bestCost = [Float](repeating: .infinity, count: count)
        var frontier = [(node: Int, cost: Float, nation: Int)]()
        for (k, s) in seeds.enumerated() where s >= 0 && s < count {
            owners[s] = k; bestCost[s] = 0; frontier.append((s, 0, k))
        }
        // 轻微的确定性国家扩张系数差异 + 地形高差阻力，自然形成大小错落、顺山势绵延的版图
        let pace: [Float] = seeds.indices.map { 0.88 + Float((($0 * 53 + salt * 17) & 0x1F)) / 120.0 }
        while !frontier.isEmpty {
            var bestIdx = 0
            for i in 1..<frontier.count where frontier[i].cost < frontier[bestIdx].cost { bestIdx = i }
            let cur = frontier.remove(at: bestIdx)
            if cur.cost > bestCost[cur.node] + 0.001 { continue }
            for nb in neighbors[cur.node] where nb >= 0 && nb < count {
                let dx = centers[nb].0 - centers[cur.node].0, dy = centers[nb].1 - centers[cur.node].1
                let dist = max(1, (dx * dx + dy * dy).squareRoot())
                let hCur = heights.indices.contains(cur.node) ? heights[cur.node] : 30
                let hNb = heights.indices.contains(nb) ? heights[nb] : 30
                let mountainCost: Float = 1 + max(0, (hCur + hNb) * 0.5 - 52) * 0.045 + abs(hNb - hCur) * 0.025
                let jitter: Float = 0.86 + Float(((nb &* 2654435761 ^ cur.nation &* 40503 ^ salt) >> 16) & 0x1F) / 110.0
                let nextCost = cur.cost + dist * mountainCost * pace[cur.nation] * jitter
                if nextCost < bestCost[nb] {
                    bestCost[nb] = nextCost
                    owners[nb] = cur.nation
                    frontier.append((nb, nextCost, cur.nation))
                }
            }
        }
        for i in 0..<count where owners[i] < 0 {
            func d(_ s: Int) -> Float {
                let dx = centers[i].0 - centers[s].0, dy = centers[i].1 - centers[s].1
                return dx * dx + dy * dy
            }
            owners[i] = seeds.indices.min { d(seeds[$0]) < d(seeds[$1]) } ?? 0
        }
        return owners
    }

    /// 自然有机开局版图：都城优先择肥沃盆地与河海要冲，疆界按山脊与高差阻力自然延展，杜绝生硬方正的格子轮廓。
    public static func organicLayout(_ regions: [Regions.Region], count: Int, seed: String) -> (seeds: [Int], owners: [Int]) {
        guard !regions.isEmpty, count > 0 else { return ([], []) }
        let target = min(count, regions.count)
        let hSeed = hash(seed)
        let salt = Int(hSeed & 0x7FFF) + 1
        func jitter(_ idx: Int, _ step: Int) -> Double {
            let x = (UInt64(idx &+ 1) &* 2654435761) ^ (UInt64(step &+ 1) &* 40503) ^ UInt64(hSeed)
            let v = Double((x >> 11) & 0x3FF) / 1023.0
            return 0.84 + v * 0.32
        }
        func distSq(_ a: (Double, Double), _ b: (Double, Double)) -> Double {
            let dx = a.0 - b.0, dy = a.1 - b.1
            return dx * dx + dy * dy
        }
        // 首座都城：偏好开阔平原／河谷且带轻微种子差异
        var first = 0
        var firstScore = -1.0
        for i in regions.indices {
            let area = Regions.polygonArea(regions[i].ring)
            let h = regions[i].height
            let reliefBonus = (h >= 20 && h <= 56) ? 1.25 : (h > 68 ? 0.62 : 0.92)
            let sc = area * reliefBonus * jitter(i, 0)
            if sc > firstScore { firstScore = sc; first = i }
        }
        var seeds = [first]
        while seeds.count < target {
            var best = -1, bestScore = -1.0
            for i in regions.indices where !seeds.contains(i) {
                let minD = seeds.map { distSq(regions[i].center, regions[$0].center) }.min() ?? 0
                let h = regions[i].height
                let habitability = h > 68 ? 0.70 : (h <= 52 ? 1.12 : 0.95)
                let sc = minD * habitability * jitter(i, seeds.count)
                if sc > bestScore { bestScore = sc; best = i }
            }
            guard best >= 0 else { break }
            seeds.append(best)
        }
        let centers = regions.map { (Float($0.center.0), Float($0.center.1)) }
        let heights = regions.map { Float($0.height) }
        let neighbors = regions.map(\.neighbors)
        let owners = organicAssign(centers: centers, heights: heights, neighbors: neighbors, seeds: seeds, salt: salt)
        return (seeds, owners)
    }

    static func hash(_ s: String) -> UInt32 {
        var h: UInt32 = 2166136261
        for c in s.unicodeScalars { let unit = String(c).utf16.first!; h = (h ^ UInt32(unit)) &* 16777619 }
        return h
    }
    static func poolValue(_ c: Culture, _ mode: String, _ kind: String, _ index: Int) -> String {
        let roots = kind == "state" ? c.stateRoots : c.cityRoots, ends = kind == "state" ? c.stateEnds : c.cityEnds
        if mode == "historical-names" { return (kind == "state" ? c.historicalStates : c.historicalCities)[index] }
        return roots[index / ends.count] + ends[index % ends.count]
    }
    static func capacity(_ c: Culture, _ mode: String, _ kind: String) -> Int {
        mode == "historical-names" ? (kind == "state" ? c.historicalStates : c.historicalCities).count : (kind == "state" ? c.stateRoots.count * c.stateEnds.count : c.cityRoots.count * c.cityEnds.count)
    }
    static func freshName(_ c: Culture, _ mode: String, _ kind: String, _ seed: String, _ used: Set<String>) -> (value: String, sourceKey: String)? {
        let size = capacity(c, mode, kind), start = Int(hash(seed) % UInt32(size))
        for step in 0..<size {
            let index = (start + step) % size, value = poolValue(c, mode, kind, index)
            if !used.contains(value) { return (value, "\(kind)/\(c.id)/\(mode)/\(index)") }
        }
        if mode == "historical-names" { return (poolValue(c, mode, kind, start), "\(kind)/\(c.id)/\(mode)/\(start)") }
        return nil
    }
    /// stateTitle47.
    public static func stateTitle(_ base: String, polity: String, religion: String) -> String {
        let suffix: [String: String] = ["Kingdom": "王国", "Empire": "帝国", "Republic": "共和国", "Federation": "联邦", "Tribal": "部族",
                                        "Theocracy": religion == "islam" ? "哈里发国" : religion == "catholic" ? "教宗国" : "神权国"]
        return base + (suffix[polity] ?? "")
    }

    /// initialCivilization47 for the default choices (each nation takes its culture's suggested religion and polity).
    /// `preferredCultures`: optional per-nation culture override (e.g. historical scenarios) so initial families are born in the authentic culture from tick 0.
    public static func civilization(seed: String, count: Int, owners: [Int], mode: String, enabled: [String], cultures: [Culture], preferredCultures: [String]? = nil) -> (nations: [Nation], cities: [(name: String, culture: String, sourceKey: String)])? {
        let byId = Dictionary(uniqueKeysWithValues: cultures.map { ($0.id, $0) })
        var nations = [Nation](), states = Set<String>()
        for i in 0..<count {
            let preferredId = (preferredCultures != nil && i < preferredCultures!.count) ? preferredCultures![i] : nil
            let chosenId = (preferredId != nil && byId[preferredId!] != nil) ? preferredId! : enabled[i % enabled.count]
            guard let profile = byId[chosenId], let name = freshName(profile, mode, "state", "\(seed)/state/n-\(i)", states) else { return nil }
            states.insert(name.value)
            nations.append(Nation(cultureId: profile.id, religionId: profile.suggestedReligion, polity: profile.suggestedPolity, name: name.value, sourceKey: name.sourceKey,
                                  full: stateTitle(name.value, polity: profile.suggestedPolity, religion: profile.suggestedReligion)))
        }
        // One used-name set across every culture (usedCities in initialCivilization47).
        var used = Set<String>(), cities = [(name: String, culture: String, sourceKey: String)]()
        for (i, owner) in owners.enumerated() {
            let cultureId = nations[owner].cultureId
            guard let c = byId[cultureId], let name = freshName(c, mode, "city", "\(seed)/city/\(i)", used) else { return nil }
            used.insert(name.value)
            cities.append((name.value, cultureId, name.sourceKey))
        }
        return (nations, cities)
    }
}
