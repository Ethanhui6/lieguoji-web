import Foundation

/// The monthly muster (civilization47-monthly-muster musterMonth47): standing armies raised from
/// safe home provinces up to two thirds of the legal land, idle emergency armies disbanded in
/// peace, and the destiny/ruler emergency mobilization in war with its yearly and five-year cooldowns.
public enum Muster {
    public struct Unit: Codable, Sendable { public let key: String, name: String }
    /// military-profile unitProfiles, cycled by army number.
    public static let units = [Unit(key: "Infantry", name: "步兵"), Unit(key: "Archer", name: "弓兵"), Unit(key: "Shield", name: "盾兵"), Unit(key: "Cavalry", name: "骑兵"), Unit(key: "Elite", name: "精锐")]

    public struct Trait: Codable, Sendable { public let modifier: Double, allowed: Bool }
    public struct Nation: Codable, Sendable {
        public let name: String, coreThreshold: Double, destiny: Double, traits: [Trait]?
        public var lastMonth: Int?, recent: [Int]
    }
    public struct Province: Codable, Sendable {
        public let name: String, city: String?, controller: Int, legal: Int, distance: Double, neighbors: [Int]
        /// The nations whose armies hold this province's land (army-space47 landHolders47).
        public let holders: [Int]
        public var population: Double
    }
    public struct Army: Codable, Sendable {
        public let id: String, nation: Int, kind: String, home: Int, province: Int, travel: String
        public var alive: Bool, status: String
    }
    public struct Created: Codable, Sendable, Equatable { public let id: String, name: String, nation: Int, home: Int, troops: Int, unit: String, kind: String }
    public struct World: Sendable {
        public var day: Int, nextArmyId: Int, seed: UInt32
        public var nations: [Nation], provinces: [Province], armies: [Army]
        /// Populations of provinces outside the world map that still count toward the median.
        public var others: [Double]
        public var wars: Set<[Int]>
        public init(day: Int, nextArmyId: Int, seed: UInt32, nations: [Nation], provinces: [Province], armies: [Army], others: [Double], wars: [[Int]]) {
            self.day = day; self.nextArmyId = nextArmyId; self.seed = seed; self.nations = nations; self.provinces = provinces; self.armies = armies; self.others = others
            self.wars = Set(wars.map { [min($0[0], $0[1]), max($0[0], $0[1])] })
        }
        func atWar(_ a: Int, _ b: Int) -> Bool { a != b && wars.contains([min(a, b), max(a, b)]) }
    }
    public struct Outcome: Sendable { public var created = [Created](), disbanded = [String](), titles = [String]() }

    /// muster21-rules sourceLegionStrength.
    public static func legionStrength(_ population: Double, median: Double) -> Int {
        if median <= 0 { return 2000 }
        let raw = (max(0, population) * 2000 / median).rounded(.down)
        return Int(max(1000, min(3000, ((raw + 50) / 100).rounded(.down) * 100)))
    }
    static func median(_ w: World) -> Double {
        let values = (w.provinces.map(\.population) + w.others).sorted(), mid = values.count >> 1
        return values.count % 2 == 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2
    }
    /// native-economy nativeMonthlyEmergencyQuantity: destiny/100×10 × the ruler's positive modifiers,
    /// vetoed by a trait that forbids emergency mobilization.
    public static func emergencyQuantity(destiny: Double, traits: [Trait]?) -> (allowed: Bool, count: Int) {
        var multiplier = Native.fr(1)
        for t in traits ?? [] {
            if !t.allowed { return (false, 0) }
            if t.modifier > 0 { multiplier = Native.fr(multiplier + t.modifier) }
        }
        let v = (Native.fr(Native.fr(Native.fr(destiny / Native.fr(100)) * Native.fr(10)) * multiplier)).rounded(.up)
        return (true, !v.isFinite || v < -2147483648 || v > 2147483647 ? Int(Int32.min) : Int(v))
    }

    public static func month(_ w: inout World) -> Outcome {
        var out = Outcome()
        let month = w.day / 30
        var used = Set(w.armies.map(\.id))
        func safe(_ p: Int, _ n: Int) -> Bool { !w.provinces[p].holders.contains { w.atWar($0, n) } }
        func create(_ n: Int, _ home: Int, _ kind: String) -> Int {
            var id: String
            repeat { id = "force-\(w.nextArmyId)"; w.nextArmyId += 1 } while used.contains(id)
            used.insert(id)
            let troops = legionStrength(w.provinces[home].population, median: median(w)), unit = units[(w.nextArmyId - 2) % units.count]
            let p = w.provinces[home]
            out.created.append(Created(id: id, name: (p.city ?? p.name) + (kind == "emergency" ? "动员" : "") + unit.name, nation: n, home: home, troops: troops, unit: unit.key, kind: kind))
            w.armies.append(Army(id: id, nation: n, kind: kind, home: home, province: home, travel: "arrived", alive: true, status: "idle"))
            return troops
        }
        for n in w.nations.indices {
            let owned = w.provinces.indices.filter { w.provinces[$0].controller == n }, land = owned.filter { w.provinces[$0].legal == n }
            let cap = land.isEmpty ? 0 : max(1, Int((Double(land.count) * Native.fr(2.0 / 3.0)).rounded(.down)))
            var formed = 0, cost = 0
            for p in land {
                let live = w.armies.filter(\.alive)
                if live.filter({ $0.nation == n && $0.kind != "emergency" }).count >= cap || w.armies.count >= 500 { break }
                if !safe(p, n) || live.contains(where: { $0.home == p }) { continue }
                let required = Int((Double(legionStrength(w.provinces[p].population, median: median(w))) / 10 + 0.5).rounded(.down))
                if w.provinces[p].population < Double(required) { continue }
                _ = create(n, p, "regular"); w.provinces[p].population -= Double(required); formed += 1; cost += required
            }
            if formed > 0 { out.titles.append("\(w.nations[n].name)新编\(formed)支常备军") }
            if !w.wars.contains(where: { $0.contains(n) }) {
                let total = w.armies.filter { $0.alive && $0.nation == n && $0.kind == "emergency" }.count
                let eligible = w.armies.indices.filter { i in let a = w.armies[i]
                    return a.nation == n && a.status == "idle" && a.kind == "emergency" && a.province >= 0 && w.provinces[a.province].controller == n && (a.travel == "arrived" || a.travel == "halted") }
                let limit = Int((Double(total) * 0.1).rounded(.up))
                for i in eligible.prefix(limit) { w.armies[i].alive = false; w.armies[i].status = "destroyed"; out.disbanded.append(w.armies[i].id) }
                let count = min(eligible.count, limit)
                if count > 0 { out.titles.append("\(w.nations[n].name)遣散\(count)支应急军") }
                continue
            }
            let history = w.nations[n]
            if let last = history.lastMonth, month - last < 12 { continue }
            if history.recent.count == 3 && month - history.recent[0] < 60 { continue }
            let cores = owned.filter { w.provinces[$0].distance <= history.coreThreshold }, ids = Set(cores)
            if !cores.contains(where: { w.provinces[$0].neighbors.contains { !ids.contains($0) && w.atWar(n, w.provinces[$0].controller) } }) { continue }
            let q = emergencyQuantity(destiny: history.destiny, traits: history.traits), places = (cores.isEmpty ? owned : cores).filter { safe($0, n) }
            if !q.allowed || q.count < 0 || places.isEmpty || w.armies.count + q.count > 500 { continue }
            w.nations[n].lastMonth = month; w.nations[n].recent = Array((history.recent + [month]).suffix(3))
            for _ in 0..<q.count { w.seed = w.seed &* 1664525 &+ 1013904223; _ = create(n, places[Int(w.seed % UInt32(places.count))], "emergency") }
            if q.count > 0 { out.titles.append("\(w.nations[n].name)进行一次紧急动员，征招\(q.count)个军团") }
        }
        return out
    }
}

/// Wounded-army recovery (army-recovery47 recoverArmiesOwned47): once a day, stationary regular
/// armies on their own uncontested legal land draw replacements from the province's remaining people
/// and the grain above a ten-day civilian reserve.
public enum Recovery {
    public struct Province: Codable, Sendable {
        public let controller: Int, legal: Int, holders: [Int]
        public var population: Double, grain: Double
    }
    public struct Army: Codable, Sendable {
        public let id: String, name: String, nation: Int, status: String, travel: String, province: Int, kind: String, fullStrength: Double
        public var troops: Double
    }
    /// Returns the grain each nation's military ledger consumed and the recovery announcements.
    public static func day(provinces: inout [Province], armies: inout [Army], nations: Int, wars: Set<[Int]>) -> (consumed: [Double], events: [String]) {
        var consumed = [Double](repeating: 0, count: nations), events = [String]()
        func atWar(_ a: Int, _ b: Int) -> Bool { a != b && wars.contains([min(a, b), max(a, b)]) }
        for i in armies.indices.sorted(by: { armies[$0].id < armies[$1].id }) {
            let a = armies[i], p = a.province
            guard a.kind == "regular", p >= 0, a.status == "idle", a.travel == "arrived" || a.travel == "halted",
                  provinces[p].controller == a.nation, provinces[p].legal == a.nation, !provinces[p].holders.contains(where: { atWar(a.nation, $0) }) else { continue }
            let missing = max(0, a.fullStrength - a.troops)
            if missing == 0 { continue }
            let reserve = provinces[p].population * 10, available = max(0, provinces[p].grain - reserve)
            let limit = max(40, min(120, (a.fullStrength * 0.06).rounded(.up)))
            let recruits = min(missing, limit, provinces[p].population * 10, available)
            if recruits < 1 { continue }
            provinces[p].population -= (recruits / 10).rounded(.up); provinces[p].grain -= recruits; consumed[a.nation] += recruits
            armies[i].troops += recruits
            if a.troops <= 180 && armies[i].troops > 180 { events.append("\(a.name)补员后恢复出征能力") }
        }
        return (consumed, events)
    }
}
