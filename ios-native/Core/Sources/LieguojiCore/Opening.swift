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
    public static func civilization(seed: String, count: Int, owners: [Int], mode: String, enabled: [String], cultures: [Culture]) -> (nations: [Nation], cities: [(name: String, culture: String)])? {
        let byId = Dictionary(uniqueKeysWithValues: cultures.map { ($0.id, $0) })
        var nations = [Nation](), states = Set<String>()
        for i in 0..<count {
            guard let profile = byId[enabled[i % enabled.count]], let name = freshName(profile, mode, "state", "\(seed)/state/n-\(i)", states) else { return nil }
            states.insert(name.value)
            nations.append(Nation(cultureId: profile.id, religionId: profile.suggestedReligion, polity: profile.suggestedPolity, name: name.value, sourceKey: name.sourceKey,
                                  full: stateTitle(name.value, polity: profile.suggestedPolity, religion: profile.suggestedReligion)))
        }
        var used = [String: Set<String>](), cities = [(name: String, culture: String)]()
        for (i, owner) in owners.enumerated() {
            let cultureId = nations[owner].cultureId
            guard let c = byId[cultureId], let name = freshName(c, mode, "city", "\(seed)/city/\(i)", used[cultureId] ?? []) else { return nil }
            used[cultureId, default: []].insert(name.value)
            cities.append((name.value, cultureId))
        }
        return (nations, cities)
    }
}
