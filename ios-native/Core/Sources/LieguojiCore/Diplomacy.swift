import Foundation

/// Static diplomatic geography of the world (war30-geography diplomaticProvinceView): land provinces
/// numbered 1…n in world order, water provinces after them; neighbour lists include coasts. Exported
/// by src/native-export/diplomacy-golden.test.ts (diplomacyStatic) into world.json.
public struct DiplomacyStatic: Codable, Sendable {
    public struct Land: Codable, Sendable { public let id: String; public let neighbors: [Int]; public let land: [Int]; public let x: Double; public let y: Double; public let wet: [String] }
    public struct Water: Codable, Sendable { public let id: Int; public let neighbors: [Int]; public let x: Double; public let y: Double }
    public let land: [Land]
    public let water: [Water]
}

/// Everything the monthly declaration evaluation reads and writes (diplomacySnapshot in the exporter).
/// Nations are indices into world.nations; provinces are world province indices.
public struct DiplomacyWorld: Codable, Sendable, Equatable {
    public struct Pools: Codable, Sendable, Equatable { public var power: Double; public var startWar: Double; public var endWar: Double; public var efficiency: Double }
    public struct Trait: Codable, Sendable, Equatable { public let name: String; public let bonus: Double }
    public struct Leader: Codable, Sendable, Equatable { public var alive: Bool; public var traits: [Trait]; public var diplomatic: Double }
    public struct Nation: Codable, Sendable, Equatable {
        public var id: Int
        public var provinces: [Int]
        public var overlord: Int
        public var auto: Bool
        public var expansionism: Double
        public var culture: Int
        public var polity: Int
        public var alliance: Int
        public var leader: Leader?
        public var activeTime: Double?
        public var passiveTime: Double?
        public var pools: Pools
        public var strength: Double
        public var troops: [Int]
        public var ships: [Int]
    }
    public struct Relation: Codable, Sendable, Equatable { public var a: Int; public var b: Int; public var lastWar: Double?; public var warCount: Int? }
    public struct Statecraft: Codable, Sendable, Equatable { public var a: Int; public var b: Int; public var war: Bool; public var truceUntilDay: Int }
    public struct Alliance: Codable, Sendable, Equatable { public var ended: Bool; public var members: [Int] }
    public struct Start: Codable, Sendable, Equatable { public let year: Int; public let month: Int; public let day: Int }

    public var gameTime: Double
    public var originTime: Double
    public var secondsPerDay: Double
    public var start: Start
    public var day: Int
    public var worldAuto: Bool
    public var rng: UInt32
    public var draws: Int
    public var nations: [Nation]
    /// Map culture of each land province (sovereignty), as culture catalogue index + 1.
    public var cultures: [Int]
    public var connected: [Bool]
    public var relations: [Relation]
    public var statecraft: [Statecraft]
    public var alliances: [Alliance]
    public var vassals: [[Int]]
}

/// A declared war (Declaration46 + War46Campaign participants).
public struct DeclaredWar: Sendable, Equatable {
    public struct Goal: Sendable, Equatable { public let id: Int; public let type: Int; public let scope: [Int]; public let requiredCount: Int }
    public struct Member: Sendable, Equatable { public let state: Int; public let side: Int; public let role: Int }
    public let casusBelli: Int
    public let attacker: Int
    public let defender: Int
    public let goals: [Goal]
    public let participants: [Member]
}

/// Native calendar arithmetic for diplomacy (character-calendar + civilization47-iso-calendar):
/// game seconds → whole days from the start date, then whole calendar months / years.
enum DiplomacyCalendar {
    static func leap(_ y: Int) -> Bool { y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) }
    static func monthLength(_ y: Int, _ m: Int) -> Int { m == 2 ? (leap(y) ? 29 : 28) : [4, 6, 9, 11].contains(m) ? 30 : 31 }
    static func fdiv(_ a: Int, _ b: Int) -> Int { Int((Double(a) / Double(b)).rounded(.down)) }
    static func startOfYear(_ year: Int) -> Int { let y = year - 1; return 365 * y + fdiv(y, 4) - fdiv(y, 100) + fdiv(y, 400) }
    typealias D = (year: Int, month: Int, day: Int)
    static func dayNumber(_ d: D) -> Int {
        var r = startOfYear(d.year) + d.day - 1
        for m in 1..<d.month { r += monthLength(d.year, m) }
        return r
    }
    static func fromDayNumber(_ day: Int) -> D {
        var low = Int((Double(day) / 365.2425).rounded(.down)) + 1
        while startOfYear(low) > day { low -= 1 }
        while startOfYear(low + 1) <= day { low += 1 }
        var remaining = day - startOfYear(low), month = 1
        while remaining >= monthLength(low, month) { remaining -= monthLength(low, month); month += 1 }
        return (low, month, remaining + 1)
    }
    static let minDate: D = (-9998, 1, 1), maxDate: D = (9999, 12, 31)
    static func date(_ time: Double, secondsPerDay: Double, start: D) -> D {
        let days = time / Native.fr(secondsPerDay)
        if days.isNaN { return start }
        if days <= -2147483648 { return minDate }
        if days >= 2147483647 { return maxDate }
        return fromDayNumber(dayNumber(start) + Int(days.rounded(.towardZero)))
    }
    static func compare(_ a: D, _ b: D) -> Int { dayNumber(a) - dayNumber(b) }
    static func wholeYears(_ s: D, _ e: D) -> Int {
        let difference = e.year - s.year, candidate: D = (e.year, s.month, min(s.day, monthLength(e.year, s.month)))
        let order = compare(candidate, e)
        return difference > 0 && order > 0 ? difference - 1 : difference < 0 && order < 0 ? difference + 1 : difference
    }
    static func wholeMonths(_ s: D, _ e: D) -> Int {
        let difference = (e.year - s.year) * 12 + e.month - s.month, candidate: D = (e.year, e.month, min(s.day, monthLength(e.year, e.month)))
        let order = compare(candidate, e)
        return difference > 0 && order > 0 ? difference - 1 : difference < 0 && order < 0 ? difference + 1 : difference
    }
}

/// original System.Math.Round ToEven with 0 digits (native-round.ts).
func nativeRoundToEven(_ value: Double) -> Double {
    guard abs(value) < 1e16 else { return value }
    let integral = value.rounded(.towardZero), fraction = value - integral
    if value < 0 { return fraction == -0.5 ? (integral.truncatingRemainder(dividingBy: 2) == 0 ? integral : integral - 1) : (value - 0.5).rounded(.up) }
    return fraction == 0.5 ? (integral.truncatingRemainder(dividingBy: 2) == 0 ? integral : integral + 1) : (value + 0.5).rounded(.down)
}

/// NativeWarIdSet (war26-native.ts): a set whose iteration order follows reusable slots.
struct NativeWarIdSet {
    private var slots: [Int?] = [], free: [Int] = [], indices: [Int: Int] = [:]
    var count: Int { indices.count }
    func contains(_ id: Int) -> Bool { indices[id] != nil }
    mutating func insert(_ id: Int) {
        guard indices[id] == nil else { return }
        let slot = free.popLast() ?? slots.count
        if slot == slots.count { slots.append(id) } else { slots[slot] = id }
        indices[id] = slot
    }
    mutating func remove(_ id: Int) {
        guard let slot = indices.removeValue(forKey: id) else { return }
        slots[slot] = nil; free.append(slot)
        if indices.isEmpty { slots = []; free = [] }
    }
    var ordered: [Int] { slots.compactMap { $0 } }
}

/// A Set that iterates in insertion order (JavaScript Set).
struct OrderedIDs {
    private(set) var items: [Int] = []
    private var members = Set<Int>()
    mutating func insert(_ id: Int) { if members.insert(id).inserted { items.append(id) } }
    func contains(_ id: Int) -> Bool { members.contains(id) }
    var count: Int { items.count }
}

extension DiplomacyWorld {
    static let initialWarTime = -8.988465674311579e307

    /// diplomacyRandom46: the persisted browser PRNG (mulberry32 step), as float32 by its callers.
    mutating func random() -> Double {
        rng = rng &+ 0x6d2b79f5
        var t = rng
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        draws += 1
        return Double(t ^ (t >> 14)) / 4294967296
    }

    func calendarStart() -> DiplomacyCalendar.D { (start.year, start.month, start.day) }
    func monthsSince(_ time: Double?) -> Int {
        let s = calendarStart()
        return DiplomacyCalendar.wholeMonths(DiplomacyCalendar.date(time ?? originTime, secondsPerDay: secondsPerDay, start: s), DiplomacyCalendar.date(Native.fr(gameTime), secondsPerDay: secondsPerDay, start: s))
    }
    func yearsSince(_ time: Double) -> Int {
        let s = calendarStart()
        return DiplomacyCalendar.wholeYears(DiplomacyCalendar.date(time, secondsPerDay: secondsPerDay, start: s), DiplomacyCalendar.date(Native.fr(gameTime), secondsPerDay: secondsPerDay, start: s))
    }
    /// relation46: created on first use with no war history.
    func relation(_ a: Int, _ b: Int) -> Relation {
        relations.first { $0.a == a && $0.b == b || $0.a == b && $0.b == a } ?? Relation(a: a, b: b, lastWar: -200, warCount: 0)
    }
    /// truce46: required years (3 × repetitions, at most 12) and whether the truce still blocks.
    func truce(_ p: Relation) -> (required: Int, elapsed: Int?, blocked: Bool) {
        let required = p.warCount.map { Native.imul(min(3, max(0, Native.i32($0 - 1))) + 1, 3) } ?? 12
        let elapsed = p.lastWar.map { yearsSince($0) }
        let old = statecraft.first { [$0.a, $0.b].contains(p.a) && [$0.a, $0.b].contains(p.b) }
        return (required, elapsed, elapsed.map { $0 < required } ?? (day < (old?.truceUntilDay ?? 0)))
    }
    public func atWar(_ a: Int, _ b: Int) -> Bool { a != b && statecraft.contains { $0.war && ($0.a == a && $0.b == b || $0.a == b && $0.b == a) } }
    func allianceOf(_ n: Int) -> Int? { alliances.indices.first { !alliances[$0].ended && alliances[$0].members.contains(n) } }
    func overlordOf(_ n: Int) -> Int? { vassals.first { $0[1] == n }?[0] }

    /// war26Strength from the nation's armies, fleets and provinces.
    public static func strength(troops: [Int], ships: [Int], provinces: Int) -> Double {
        let f = Native.fr
        var army = 0.0, navy = 0.0
        for t in troops { army = f(army + f(f(Double(max(0, t))) / f(2000))) }
        for s in ships { navy = f(navy + f(f(Double(max(0, min(5, s)))) / f(5))) }
        return f(f(f(f(navy + navy) + f(army + army)) + f(f(Double(provinces)) * f(5))) + f(1))
    }
}

/// evaluateDeclaration47 with its native kernels (declaration, candidates, affinity, casus belli,
/// goals, claim growth, side building). One context per evaluation, like the web.
public struct DeclarationEngine: Sendable {
    struct Province { let id: Int; let center: Int; var stateId: Int; let isLand: Bool; let neighbors: [Int] }
    struct State {
        let index: Int, id: Int, dead: Bool, vassal: Bool, auto: Bool, expansionism: Double, culture: Int, polity: Int
        let provinces: [Int] // diplomatic province ids, acquisition order
        var neighbors = OrderedIDs(), seaNeighbors = OrderedIDs(), features = Set<Int>()
        let alliance: Int?
        var provinceCount: Int { provinces.count }
    }
    struct CB { let id: Int; let allowedGoals: [Int]; let dedicatedAnnex: Bool; let annexThreshold: Int; let requiresUnifier: Bool; let minimumSameCulture: Int; let forceDecisiveCede: Bool; let unificationBonus: Bool }
    static let supported: [CB] = [
        CB(id: 1, allowedGoals: [2, 1, 3, 6], dedicatedAnnex: false, annexThreshold: 1, requiresUnifier: false, minimumSameCulture: 0, forceDecisiveCede: false, unificationBonus: false),
        CB(id: 2, allowedGoals: [3], dedicatedAnnex: true, annexThreshold: 2147483647, requiresUnifier: false, minimumSameCulture: 0, forceDecisiveCede: false, unificationBonus: false),
        CB(id: 6, allowedGoals: [1], dedicatedAnnex: false, annexThreshold: 1, requiresUnifier: true, minimumSameCulture: 2, forceDecisiveCede: true, unificationBonus: true),
    ]

    let statics: DiplomacyStatic
    public init(statics: DiplomacyStatic) { self.statics = statics }

    /// One monthly evaluation for `nation` (nativeSpendDeclarationPower around nativeEvaluateDeclaration).
    public func evaluate(_ w: inout DiplomacyWorld, nation: Int) -> DeclaredWar? {
        guard w.worldAuto, w.nations.indices.contains(nation), w.nations[nation].auto, w.overlordOf(nation) == nil else { return nil }
        let f = Native.fr
        guard f(w.nations[nation].pools.startWar) > f(100) else { return nil }
        var c = Context(engine: self, world: w)
        let result = c.evaluateDeclaration(nation)
        w = c.w
        w.nations[nation].pools.startWar = result == nil ? f(f(w.nations[nation].pools.startWar) * f(0.5)) : 0
        return result
    }

    struct Context {
        let engine: DeclarationEngine
        var w: DiplomacyWorld
        var provinces: [Province] = []
        var states: [State] = []
        var stateByID: [Int: Int] = [:]
        var affinityCache: [Int64: Double] = [:], atWarCache: [Int64: Bool] = [:], sameWarCache: [Int64: Bool] = [:]
        var ranking: [Int] = []
        var dominant = false

        init(engine: DeclarationEngine, world: DiplomacyWorld) {
            self.engine = engine; w = world
            let s = engine.statics, landCount = s.land.count
            var owner = [Int](repeating: 0, count: landCount)
            for n in w.nations { for p in n.provinces { owner[p] = n.id } }
            provinces = s.land.enumerated().map { i, p in Province(id: i + 1, center: i, stateId: owner[i], isLand: true, neighbors: p.neighbors) }
            provinces += s.water.map { Province(id: $0.id, center: $0.id - 1, stateId: 0, isLand: false, neighbors: $0.neighbors) }
            states = w.nations.enumerated().map { i, n in
                State(index: i, id: n.id, dead: n.provinces.isEmpty, vassal: n.overlord != -1, auto: n.auto, expansionism: n.expansionism, culture: n.culture, polity: n.polity,
                      provinces: n.provinces.map { $0 + 1 }, alliance: w.allianceOf(i))
            }
            for (i, st) in states.enumerated() { stateByID[st.id] = i }
            for i in states.indices { updateNeighbors(i) }
            // Features: connected land components, numbered in province order.
            var visited = Set<Int>(), feature = 0
            for p in provinces where p.isLand && !visited.contains(p.id) {
                feature += 1; var queue = [p.id]; visited.insert(p.id); var k = 0
                while k < queue.count {
                    let current = provinces[queue[k] - 1]; k += 1
                    if let si = stateByID[current.stateId] { states[si].features.insert(feature) }
                    for id in current.neighbors { let next = provinces[id - 1]; if next.isLand && !visited.contains(id) { visited.insert(id); queue.append(id) } }
                }
            }
            // Ranking by strength, descending, stable.
            let live = states.indices.filter { !states[$0].dead }
            ranking = live.enumerated().sorted { a, b in
                let x = strength(a.element), y = strength(b.element)
                return x != y ? x > y : a.offset < b.offset
            }.map(\.element)
            if let top = ranking.first {
                var sum = 0.0; for s in ranking.dropFirst() { sum = Native.fr(sum + strength(s)) }
                dominant = strength(top) > Native.fr(sum * 1.5)
            }
        }

        func lookup(_ id: Int) -> Province { provinces[id - 1] }
        func strength(_ s: Int) -> Double { w.nations[states[s].index].strength }

        /// nativeUpdateDiplomaticNeighbors: land neighbours, then states across up to four water hops.
        mutating func updateNeighbors(_ si: Int) {
            var land = OrderedIDs(), sea = OrderedIDs()
            let me = states[si].id
            var queue = [Int](), queued = Set<Int>()
            for source in states[si].provinces {
                for id in lookup(source).neighbors {
                    let p = lookup(id)
                    if p.isLand { if p.stateId != me && p.stateId != 0 { land.insert(p.stateId) } }
                    else if queued.insert(p.id).inserted { queue.append(p.id) }
                }
            }
            var visited = Set<Int>(), head = 0
            for _ in 0..<4 {
                let end = queue.count
                while head < end {
                    let p = lookup(queue[head]); head += 1
                    if visited.contains(p.id) { continue }
                    visited.insert(p.id)
                    for id in p.neighbors {
                        let n = lookup(id)
                        if n.isLand { if n.stateId != me && n.stateId != 0 { sea.insert(n.stateId) } }
                        else if !visited.contains(n.id) { queue.append(n.id) }
                    }
                }
            }
            states[si].neighbors = land; states[si].seaNeighbors = sea
        }

        func coastal(_ p: Province) -> Bool { p.neighbors.contains { !lookup($0).isLand } }
        func landAdjacent(_ p: Province, _ attacker: Int) -> Bool { p.neighbors.contains { let n = lookup($0); return n.isLand && n.stateId == attacker } }
        func nearSea(_ s: Int) -> Bool { states[s].provinces.contains { coastal(lookup($0)) } }
        func intersects(_ a: Int, _ b: Int) -> Bool {
            states[b].provinces.contains { id in let p = lookup(id); return !w.connected[id - 1] && !coastal(p) && landAdjacent(p, states[a].id) }
        }
        func atWar(_ a: Int, _ b: Int) -> Bool { w.atWar(states[a].index, states[b].index) }
        func enemies(_ a: Int) -> [Int] { states.indices.filter { atWar(a, $0) } }
        func leader(_ s: Int) -> DiplomacyWorld.Leader? { w.nations[states[s].index].leader }
        func unifier(_ s: Int) -> Bool { leader(s)?.traits.contains { $0.name == "Unifier" } ?? false }
        func ambitious(_ s: Int) -> Bool { leader(s)?.traits.contains { $0.name == "Ambitious" } ?? false }
        func superPower(_ s: Int) -> Bool {
            guard let first = ranking.first else { return false }
            return s == first || ranking.count > 1 && s == ranking[1] && strength(s) > Native.fr(strength(first) * 0.5)
        }
        /// relation46 creates the pair's record on first use (the bridge mirrors the new rows into the run).
        mutating func relation(_ a: Int, _ b: Int) -> DiplomacyWorld.Relation {
            let x = states[a].index, y = states[b].index
            if let p = w.relations.first(where: { $0.a == x && $0.b == y || $0.a == y && $0.b == x }) { return p }
            let p = DiplomacyWorld.Relation(a: x, b: y, lastWar: -200, warCount: 0)
            w.relations.append(p)
            return p
        }
        static func key(_ a: Int, _ b: Int) -> Int64 { (Int64(min(a, b)) << 32) | Int64(max(a, b)) }

        static let systemAffinity: [[Double]] = [[10, -10, 10, 10, 0, 5], [15, -30, -20, -20, 0, 0], [10, -20, 20, 20, -10, -20],
                                                 [10, -20, 20, 20, -10, -20], [0, -10, -10, -10, 25, 0], [10, -10, -10, -10, 0, -20]]

        /// nativeDiplomaticAffinity (GetAffinity 8963E0).
        mutating func affinity(_ s: Int, _ t: Int) -> Double {
            let f = Native.fr, key = Context.key(states[s].id, states[t].id)
            if let v = affinityCache[key] { return v }
            var war: Bool
            if let v = atWarCache[key] { war = v } else { war = atWar(s, t); atWarCache[key] = war }
            var value = 0.0
            if superPower(t) || superPower(s) { value = f(value - 100) }
            else if dominant && !superPower(s) { value = f(value + 25) }
            if states[t].neighbors.count == 1 && states[t].neighbors.contains(states[s].id) && !nearSea(t) { value = f(value - 200) }
            if intersects(s, t) || intersects(t, s) { value = f(value - 300) }
            value = f(value + (states[s].neighbors.contains(states[t].id) ? -25 : 25))
            value = f(value + (states[s].features.isDisjoint(with: states[t].features) ? -10 : -25))
            if war { value = f(value - 500); sameWarCache[key] = true }
            else {
                var shared: Bool
                if let v = sameWarCache[key] { shared = v } else {
                    let targets = Set(enemies(t)); shared = enemies(s).contains { targets.contains($0) }; sameWarCache[key] = shared
                }
                if shared { value = f(value + 50) }
            }
            if states[s].culture == states[t].culture { value = f(value + 15) }
            if let l = leader(t) { for trait in l.traits where trait.name == "SocialButterfly" && trait.bonus > 0 { value = f(value + f(trait.bonus)); break } }
            let difference = Native.i32(states[s].provinceCount - states[t].provinceCount)
            value = f(value + Double(max(-20, min(0, difference / 5))))
            let p = relation(s, t), truce = w.truce(p), years = truce.elapsed ?? 10000
            if !war && Double(years) > f(3) && value > 20 { value = 20 }
            if let a = states[s].alliance, a == states[t].alliance { value = f(value + 30) }
            if !war && truce.required >= years { value = f(value + 100) }
            let ps = states[s].polity, pt = states[t].polity
            if Context.systemAffinity.indices.contains(ps) && Context.systemAffinity[ps].indices.contains(pt) { value = f(value + Context.systemAffinity[ps][pt]) }
            if let l = leader(t), l.alive { value = f(value + f(f(l.diplomatic) - 50)) }
            affinityCache[key] = value
            return value
        }

        func hasSameCultureCedeable(_ a: Int, _ d: Int, minimum: Int) -> Bool { sameCultureProvinces(a, d).count >= minimum }
        func sameCultureProvinces(_ a: Int, _ d: Int) -> [Int] {
            let sea = states[a].seaNeighbors.contains(states[d].id)
            return states[d].provinces.filter { id in
                let p = lookup(id)
                return p.isLand && engine.statics.land.indices.contains(id - 1) && culture(ofProvince: id) == states[a].culture && (landAdjacent(p, states[a].id) || sea && coastal(p))
            }
        }
        func culture(ofProvince id: Int) -> Int { w.cultures.indices.contains(id - 1) ? w.cultures[id - 1] : 0 }

        func hasCedeable(_ a: Int, _ d: Int) -> Bool {
            let sea = states[a].seaNeighbors.contains(states[d].id)
            return states[d].provinces.contains { id in let p = lookup(id); return p.isLand && (landAdjacent(p, states[a].id) || sea && coastal(p)) }
        }
        func canUse(_ cb: CB, _ a: Int, _ d: Int) -> Bool {
            if a == d || states[d].dead { return false }
            if !states[a].neighbors.contains(states[d].id) && !states[a].seaNeighbors.contains(states[d].id) { return false }
            if cb.requiresUnifier && !unifier(a) { return false }
            if cb.minimumSameCulture > 0 { return hasSameCultureCedeable(a, d, minimum: cb.minimumSameCulture) }
            let cedeable = hasCedeable(a, d)
            for goal in cb.allowedGoals {
                if [0, 1, 2, 6].contains(goal) && cedeable { return true }
                if goal == 3 && states[d].provinceCount >= 1 && (cb.dedicatedAnnex || states[d].provinceCount <= cb.annexThreshold) { return true }
                if goal == 4 && states[d].provinceCount >= 1 && !states[d].vassal { return true }
                if goal == 11 && states[d].provinceCount >= 1 { return true }
            }
            return false
        }
        func usable(_ id: Int, _ a: Int, _ d: Int) -> CB? { DeclarationEngine.supported.first { $0.id == id }.flatMap { canUse($0, a, d) ? $0 : nil } }

        mutating func weight(_ cb: CB, _ a: Int, _ d: Int) -> Double {
            let f = Native.fr
            let attack = f(strength(a)), defend = f(strength(d)), sum = f(attack + defend)
            if sum <= 0 { return 0 }
            let share = f(attack / sum), hostility = Native.clamp01(f(-f(affinity(a, d)) / f(50)))
            let expansion = Native.clamp01(f(f(states[a].expansionism) - 1)), ambition: Double = ambitious(a) ? 1 : 0
            var value = f(f(f(share + f(hostility * f(0.08))) + f(expansion * f(0.08))) + f(ambition * f(0.04)))
            if cb.unificationBonus { value = f(value + (share >= f(0.45) && unifier(a) ? f(0.15) : 0)) }
            return Native.clamp01(value)
        }

        func suppressed(_ a: Int) -> Bool {
            let f = Native.fr, own = f(strength(a))
            var total = 0.0
            for e in enemies(a) { total = f(total + f(strength(e))) }
            return total > 0 && f(total + total) > own
        }

        func unificationExemption(_ a: Int, _ d: Int) -> Bool {
            guard unifier(a) else { return false }
            let f = Native.fr, attack = f(strength(a)), defend = f(strength(d)), sum = f(attack + defend)
            if sum > 0 && f(attack / sum) < f(0.45) { return false }
            return usable(6, a, d) != nil
        }

        mutating func candidates(_ a: Int) -> [Int] {
            var seen = Set<Int>(), out = [Int]()
            for id in states[a].neighbors.items + states[a].seaNeighbors.items {
                if !seen.insert(id).inserted { continue }
                guard let t = stateByID[id] else { continue }
                if states[t].dead || t == a || atWar(a, t) || w.overlordOf(states[t].index) == states[a].index { continue }
                if let al = states[a].alliance, w.alliances[al].members.contains(states[t].index) { continue }
                if states[t].vassal {
                    let f = Native.fr, lord = w.overlordOf(states[t].index).map { f(w.nations[$0].strength) } ?? 0
                    if f(f(strength(t)) + lord) > f(strength(a)) { continue }
                }
                let p = relation(a, t), truce = w.truce(p)
                let elapsed = truce.blocked ? -1 : truce.elapsed ?? 10000
                if elapsed < truce.required { continue }
                if Native.fr(affinity(a, t)) > 0 && !unificationExemption(a, t) { continue }
                out.append(t)
            }
            return out
        }

        mutating func choose(_ a: Int, _ d: Int, fallback: CB) -> CB? {
            let f = Native.fr, attack = f(strength(a)), defend = f(strength(d)), sum = f(attack + defend), share = sum > 0 ? f(attack / sum) : f(0.5)
            let defenderLand = states[d].provinceCount, attackerLand = states[a].provinceCount
            if share >= f(0.75) && (defenderLand <= 5 || Native.imul(defenderLand, 4) <= attackerLand) {
                if let annex = usable(2, a, d), f(w.random()) < f(0.8) { return annex }
            }
            if let unify = usable(6, a, d) { return unify }
            // CB 7 (conversion) and 3 (vassalization) are outside the supported catalog.
            if fallback.id != 7 { return fallback }
            return usable(1, a, d)
        }

        // MARK: goals

        func positionDistance(_ l: Province, _ r: Province) -> Double {
            let f = Native.fr, s = engine.statics
            func pos(_ c: Int) -> (Double, Double)? {
                if c < s.land.count { return (s.land[c].x, s.land[c].y) }
                let k = c - s.land.count; return s.water.indices.contains(k) ? (s.water[k].x, s.water[k].y) : nil
            }
            if let a = pos(l.center), let b = pos(r.center) {
                let dx = f(f(a.0) - f(b.0)), dz = f(f(a.1) - f(b.1)), dy = 0.0
                return f(f(f(dy * dy) + f(dx * dx)) + f(dz * dz))
            }
            let delta = Native.i32(l.id - r.id), negative = Native.i32(-delta)
            return f(Double(negative < 0 ? delta : negative))
        }

        /// claimEntry47: the enemy province nearest our land, by land border first, then across a shared sea.
        func claimEntry(_ a: Int, _ b: Int) -> Int? {
            let s = engine.statics, ai = states[a].index, bi = states[b].index
            let ours = w.nations[ai].provinces.sorted(), enemy = w.nations[bi].provinces.sorted()
            var owner = [Int](repeating: -1, count: s.land.count)
            for (i, n) in w.nations.enumerated() { for p in n.provinces { owner[p] = i } }
            func near(_ p: Int) -> Double { ours.map { q in jsHypot(s.land[p].x - s.land[q].x, s.land[p].y - s.land[q].y) }.min() ?? .infinity }
            func order(_ list: [Int]) -> [Int] { list.map { ($0, near($0)) }.sorted { $0.1 != $1.1 ? $0.1 < $1.1 : s.land[$0.0].id < s.land[$1.0].id }.map(\.0) }
            let land = enemy.filter { p in s.land[p].land.contains { owner[$0] == ai } }
            if let first = order(land).first { return first }
            let seas = Set(ours.flatMap { s.land[$0].wet })
            return order(enemy.filter { p in s.land[p].wet.contains { seas.contains($0) } }).first
        }

        func compactFrontier(_ frontier: NativeWarIdSet, _ selected: NativeWarIdSet, anchor: Province, defender: Int) -> Province? {
            let f = Native.fr
            var best: Province?, bestShared = -1, bestDistance = 3.4028234663852886e38
            for id in frontier.ordered {
                let p = lookup(id)
                guard p.isLand, p.stateId == defender else { continue }
                var shared = 0; for n in p.neighbors where selected.contains(n) { shared += 1 }
                let d = f(positionDistance(p, anchor))
                if shared > bestShared || shared == bestShared && (d < bestDistance || abs(f(d - bestDistance)) < f(0.001) && best != nil && p.id < best!.id) {
                    best = p; bestShared = shared; bestDistance = d
                }
            }
            return best
        }
        func appendDefenderNeighbors(_ p: Province, _ defender: Int, _ selected: NativeWarIdSet, _ frontier: inout NativeWarIdSet) {
            for id in p.neighbors where !selected.contains(id) { let n = lookup(id); if n.isLand && n.stateId == defender { frontier.insert(n.id) } }
        }
        /// nativeGrowClaimComponent: a connected block of defender provinces from the entry province.
        func growClaim(seed: Province, defender: Int, count: Int) -> [Int] {
            guard seed.isLand, seed.stateId == defender else { return [] }
            var selected = NativeWarIdSet(), result = [seed.id]
            selected.insert(seed.id)
            var frontier = NativeWarIdSet()
            for id in selected.ordered { let p = lookup(id); if p.isLand && p.stateId == defender { appendDefenderNeighbors(p, defender, selected, &frontier) } }
            while result.count < count && frontier.count > 0 {
                guard let chosen = compactFrontier(frontier, selected, anchor: seed, defender: defender) else { break }
                frontier.remove(chosen.id)
                if selected.contains(chosen.id) { continue }
                selected.insert(chosen.id); result.append(chosen.id)
                appendDefenderNeighbors(chosen, defender, selected, &frontier)
            }
            return result
        }
        static func occupyCount(_ attack: Double, _ defend: Double, _ count: Int) -> Int {
            if count <= 1 { return 1 }
            let f = Native.fr, a = f(attack), d = f(defend), sum = f(a + d), share = sum > 0 ? f(a / sum) : f(0.5)
            let boost = max(0, min(1, f(f(share - f(0.45)) * 2)))
            let third = Int(f(f(Double(count)) / f(3)).rounded(.up)), scaled = Int(nativeRoundToEven(f(f(Double(count)) * boost)))
            return max(1, min(count, max(2, third, scaled)))
        }

        mutating func goals(_ cb: CB, _ a: Int, _ d: Int) -> [DeclaredWar.Goal] {
            guard canUse(cb, a, d) else { return [] }
            let f = Native.fr
            let territorial = cb.allowedGoals.contains { [0, 1, 2].contains($0) }, reparations = cb.allowedGoals.contains(6)
            let cedeable: [Int]
            if cb.minimumSameCulture > 0 { cedeable = sameCultureProvinces(a, d) }
            else if territorial || reparations {
                let sea = states[a].seaNeighbors.contains(states[d].id)
                cedeable = states[d].provinces.filter { id in let p = lookup(id); return landAdjacent(p, states[a].id) || sea && coastal(p) }
            } else { cedeable = [] }
            if territorial && !cedeable.isEmpty {
                if cb.forceDecisiveCede { return [DeclaredWar.Goal(id: 1, type: 1, scope: cedeable, requiredCount: 0)] }
                let count = cedeable.count <= 1 ? 1 : Context.occupyCount(strength(a), strength(d), cedeable.count)
                var chosen = claimEntry(a, d).map { growClaim(seed: lookup($0 + 1), defender: states[d].id, count: count) } ?? []
                if chosen.isEmpty { chosen = Array(cedeable.prefix(count)) }
                let attack = f(strength(a)), defend = f(strength(d)), sum = f(attack + defend), share = sum > 0 ? f(attack / sum) : f(0.5)
                let cede = share >= f(0.65) && cb.allowedGoals.contains(1)
                var result = [DeclaredWar.Goal(id: 1, type: cede ? 1 : 2, scope: chosen, requiredCount: cede ? 0 : min(count, chosen.count))]
                if reparations && f(w.random()) < f(0.35) { result.append(DeclaredWar.Goal(id: 2, type: 6, scope: cedeable, requiredCount: 1)) }
                return result
            }
            if cb.allowedGoals.contains(3) && states[d].provinceCount >= 1 && (cb.dedicatedAnnex || states[d].provinceCount <= cb.annexThreshold) {
                return [DeclaredWar.Goal(id: 1, type: 3, scope: [], requiredCount: 0)]
            }
            return []
        }

        // MARK: start

        /// nativeBuildWarSides: principals, their alliance members, then vassal kin; first side wins.
        func sides(attacker a: Int, defender d: Int) -> [DeclaredWar.Member] {
            var result = [DeclaredWar.Member](), seen = Set<Int>()
            func add(_ s: Int?, _ side: Int, _ role: Int) { guard let s, !states[s].dead, seen.insert(states[s].id).inserted else { return }; result.append(.init(state: states[s].id, side: side, role: role)) }
            func state(ofNation n: Int) -> Int? { states.firstIndex { $0.index == n } }
            func vassals(_ s: Int) -> [Int?] { w.vassals.filter { $0[0] == states[s].index }.map { state(ofNation: $0[1]) } }
            func kin(_ s: Int, _ side: Int) {
                if w.vassals.contains(where: { $0[0] == states[s].index }) { for v in vassals(s) { add(v, side, 2) } }
                if let lordNation = w.overlordOf(states[s].index) { guard let lord = state(ofNation: lordNation) else { return }; add(lord, side, 2); for v in vassals(lord) { add(v, side, 2) } }
            }
            func side(_ s: Int, _ which: Int, _ role: Int) {
                add(s, which, role)
                let members = w.allianceOf(states[s].index).map { w.alliances[$0].members } ?? []
                for m in members { guard let ally = state(ofNation: m), ally != s else { continue }; add(ally, which, 2); kin(ally, which) }
                kin(s, which)
            }
            side(a, 0, 0); side(d, 1, 1)
            return result
        }

        mutating func start(_ a: Int, _ d: Int, cb: Int, goals: [DeclaredWar.Goal]) -> DeclaredWar? {
            let ai = states[a].index, di = states[d].index
            guard let k = w.statecraft.firstIndex(where: { [$0.a, $0.b].contains(ai) && [$0.a, $0.b].contains(di) }), !w.statecraft[k].war,
                  !w.truce(relation(a, d)).blocked, claimEntry(a, d) != nil else { return nil }
            let members = sides(attacker: a, defender: d)
            guard members.first(where: { $0.state == states[a].id })?.side == 0, members.first(where: { $0.state == states[d].id })?.side == 1 else { return nil }
            for x in members where x.side == 0 { for y in members where y.side == 1 {
                guard let xa = stateByID[x.state].map({ states[$0].index }), let yb = stateByID[y.state].map({ states[$0].index }),
                      let p = w.statecraft.firstIndex(where: { [$0.a, $0.b].contains(xa) && [$0.a, $0.b].contains(yb) }) else { continue }
                if !w.statecraft[p].war { w.statecraft[p].war = true; w.statecraft[p].truceUntilDay = 0 }
            } }
            w.nations[ai].activeTime = Native.fr(w.gameTime); w.nations[di].passiveTime = Native.fr(w.gameTime)
            return DeclaredWar(casusBelli: cb, attacker: ai, defender: di, goals: goals, participants: members)
        }

        mutating func evaluateDeclaration(_ nation: Int) -> DeclaredWar? {
            guard let a = states.firstIndex(where: { $0.index == nation }) else { return nil }
            let st = states[a]
            if st.dead || st.vassal || !w.worldAuto || !st.auto { return nil }
            if w.monthsSince(w.nations[nation].activeTime) < 12 || w.monthsSince(w.nations[nation].passiveTime) < 12 { return nil }
            if suppressed(a) { return nil }
            var best = Native.fr(0.55), target: Int?, chosenCB: CB?
            for candidate in candidates(a) {
                let usableList = DeclarationEngine.supported.filter { canUse($0, a, candidate) }
                for cb in usableList { let v = Native.fr(weight(cb, a, candidate)); if v > best { best = v; target = candidate; chosenCB = cb } }
            }
            guard let target, let fallback = chosenCB, let chosen = choose(a, target, fallback: fallback) else { return nil }
            let g = goals(chosen, a, target)
            guard !g.isEmpty else { return nil }
            return start(a, target, cb: chosen.id, goals: g)
        }
    }
}

/// Diplomacy start exported with the world (src/native-export/diplomacy-state.ts).
public struct DiplomacyStart: Codable, Sendable {
    public struct Schedule: Codable, Sendable, Equatable {
        public struct Nation: Codable, Sendable, Equatable { public var updateDay: Int; public var updatedMonth: Int }
        public var month: Int; public var lastDay: Int; public var nations: [Nation]
    }
    public let statics: DiplomacyStatic
    public let world: DiplomacyWorld
    public let schedule: Schedule
}

/// Original CasusBelliServiceV2 names and WarV2 goal descriptions (casus-labels47.ts).
public enum WarText {
    public static func casusBelli(_ id: Int) -> String {
        [1: "领土征服", 2: "吞并", 3: "霸权臣服", 6: "文化统一", 7: "强制改宗", 8: "空白开拓", 10: "继承内战", 11: "改革内战", 12: "独立内战", 13: "推翻内战", 14: "行省叛乱", 15: "家族叛乱", 16: "傀儡反抗"][id] ?? "未知"
    }
    public static func goal(_ type: Int, _ count: Int) -> String {
        switch type {
        case 0, 1: return "索取\(count)省"
        case 2: return "占领\(count)省"
        case 3: return "吞并全境"
        case 4: return "附庸"
        case 6: return "索取赔款"
        default: return "未知"
        }
    }
    /// WarV2DeclaredEvent.GetDescription.
    public static func declared(attacker: String, defender: String, war: DeclaredWar) -> String {
        let goal = war.goals.first.map { self.goal($0.type, $0.scope.count) } ?? "未知"
        let base = "\(attacker)以\(casusBelli(war.casusBelli))为由对\(defender)宣战，目标：\(goal)"
        let a = war.participants.filter { $0.side == 0 }.count, d = war.participants.filter { $0.side == 1 }.count
        return a > 1 || d > 1 ? "\(base)（\(attacker)方\(a)国 vs \(defender)方\(d)国）" : base
    }
}

/// Diplomacy inside the Swift simulation: the declaration engine on the live world, the monthly
/// calendar (advanceDiplomaticSchedule46) and the record of wars.
public struct DiplomacyState: Sendable, Equatable {
    public struct War: Sendable, Equatable {
        public let declared: DeclaredWar
        public let startDay: Int
        public var endDay: Int?
    }
    public struct Entry: Sendable, Equatable { public let day: Int; public let text: String }
    public static func == (a: DiplomacyState, b: DiplomacyState) -> Bool { a.world == b.world && a.schedule == b.schedule && a.wars == b.wars && a.chronicle == b.chronicle }

    public var world: DiplomacyWorld
    public var schedule: DiplomacyStart.Schedule
    public var wars: [War] = []
    public var chronicle: [Entry] = []
    let engine: DeclarationEngine
    public let names: [String]

    public init(start: DiplomacyStart, names: [String]) {
        world = start.world; schedule = start.schedule; engine = DeclarationEngine(statics: start.statics); self.names = names
    }

    func date(day: Int) -> DiplomacyCalendar.D {
        DiplomacyCalendar.fromDayNumber(DiplomacyCalendar.dayNumber(world.calendarStart()) + day)
    }

    /// One new day. `owners` is each world province's controller, `troops` each nation's living army
    /// sizes. Returns the wars declared today.
    public mutating func advance(day: Int, tick: Int, owners: [Int], troops: [[Int]]) -> [DeclaredWar] {
        let f = Native.fr
        world.day = day
        world.gameTime = f(Double(tick) / Double(SimState.ticksPerDay) * world.secondsPerDay)
        // Acquisition order: provinces kept stay in place, newly controlled ones are appended.
        for n in world.nations.indices {
            let kept = world.nations[n].provinces.filter { owners.indices.contains($0) && owners[$0] == n }
            let gained = owners.indices.filter { owners[$0] == n && !kept.contains($0) }
            world.nations[n].provinces = kept + gained
            world.nations[n].troops = troops.indices.contains(n) ? troops[n] : []
            world.nations[n].strength = DiplomacyWorld.strength(troops: world.nations[n].troops, ships: world.nations[n].ships, provinces: world.nations[n].provinces.count)
        }
        guard day == schedule.lastDay + 1 else { schedule.lastDay = day; return [] }
        let d = date(day: day), month = d.year * 12 + d.month - 1
        let live = world.nations.indices.filter { !world.nations[$0].provinces.isEmpty }
        if month != schedule.month {
            schedule.month = month
            let days = DiplomacyCalendar.monthLength(d.year, d.month)
            for n in live { schedule.nations[n].updateDay = 1 + Int((world.random() * Double(days)).rounded(.down)) }
        }
        schedule.lastDay = day
        var declared = [DeclaredWar]()
        for n in world.nations.indices where live.contains(n) && schedule.nations[n].updateDay <= d.day && schedule.nations[n].updatedMonth != month {
            var p = world.nations[n].pools
            p.efficiency = f(20); p.power = f(f(p.power) + p.efficiency); p.endWar = f(f(p.endWar) + p.efficiency); p.startWar = f(f(p.startWar) + p.efficiency)
            world.nations[n].pools = p
            schedule.nations[n].updatedMonth = month
            if let war = engine.evaluate(&world, nation: n) {
                declared.append(war)
                wars.append(War(declared: war, startDay: day))
                chronicle.append(Entry(day: day, text: WarText.declared(attacker: names[war.attacker], defender: names[war.defender], war: war)))
            }
        }
        return declared
    }

    /// Player declaration (declareWar47): territorial conquest only, with the web checks.
    public mutating func declare(attacker: Int, defender: Int, day: Int) -> String? {
        var c = DeclarationEngine.Context(engine: engine, world: world)
        guard let a = c.states.firstIndex(where: { $0.index == attacker }), let b = c.states.firstIndex(where: { $0.index == defender }),
              !c.states[a].dead, !c.states[b].dead, a != b, !c.atWar(a, b) else { return "宣战双方无效或已交战。" }
        let truce = world.truce(c.relation(a, b))
        if truce.blocked { return "停战期尚未结束（\(truce.required) 年规则）。" }
        if c.states[a].vassal || world.overlordOf(defender) == attacker { return "附庸不能自主发动外战，宗主不能向自己的附庸宣战；可先解除关系。" }
        guard let cb = c.usable(1, a, b) else { return "两国没有可争夺的相邻土地或外交海域。" }
        let goals = c.goals(cb, a, b)
        guard !goals.isEmpty, let war = c.start(a, b, cb: cb.id, goals: goals) else { return "没有可执行的陆地或跨海进攻路线。" }
        world = c.w
        wars.append(War(declared: war, startDay: day))
        chronicle.append(Entry(day: day, text: WarText.declared(attacker: names[war.attacker], defender: names[war.defender], war: war)))
        return nil
    }

    /// Player white peace (settleWar47 type 11): the war relations between the two sides end, land
    /// stays as it is; the war count and last-war time start the truce.
    public mutating func makePeace(_ a: Int, _ b: Int, day: Int) -> String? {
        let ida = world.nations[a].id, idb = world.nations[b].id
        guard let k = wars.lastIndex(where: { w in
            w.endDay == nil && w.declared.participants.contains { $0.state == ida } && w.declared.participants.contains { $0.state == idb }
            && w.declared.participants.first { $0.state == ida }?.side != w.declared.participants.first { $0.state == idb }?.side
        }) else { return "两国当前没有可结束的战争。" }
        let war = wars[k].declared
        var ids = [Int: Int](); for (i, n) in world.nations.enumerated() { ids[n.id] = i }
        for x in war.participants where x.side == 0 { for y in war.participants where y.side == 1 {
            guard let xa = ids[x.state], let yb = ids[y.state] else { continue }
            if let p = world.statecraft.firstIndex(where: { [$0.a, $0.b].contains(xa) && [$0.a, $0.b].contains(yb) }) { world.statecraft[p].war = false }
            if let r = world.relations.firstIndex(where: { [$0.a, $0.b].contains(xa) && [$0.a, $0.b].contains(yb) }) {
                world.relations[r].warCount = world.relations[r].warCount.map { $0 + 1 }; world.relations[r].lastWar = Native.fr(world.gameTime)
            } else { world.relations.append(.init(a: min(xa, yb), b: max(xa, yb), lastWar: Native.fr(world.gameTime), warCount: 1)) }
        } }
        wars[k].endDay = day
        chronicle.append(Entry(day: day, text: "\(names[war.attacker])与\(names[war.defender])议和，维持现有疆界"))
        return nil
    }

    /// Ordered pairs of nations at war (both directions).
    public var warPairs: Set<[Int]> { Set(world.statecraft.filter(\.war).flatMap { [[$0.a, $0.b], [$0.b, $0.a]] }) }
}
