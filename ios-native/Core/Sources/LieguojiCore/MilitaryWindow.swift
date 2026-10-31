import Foundation

/// The attack clock (force-clock47): each engaged force fires 2 scaled seconds after it engages,
/// then every 2 × Range(1, 3) seconds from a persisted LCG; deadlines align to frame boundaries.
public struct AttackClock: Sendable, Equatable {
    public var secondsPerTick: Double
    public var now: Double
    public var rng: UInt32
    public var draws: Int
    public var deadlines: [String: Double]
    public init(secondsPerTick: Double, now: Double, rng: UInt32, draws: Int, deadlines: [String: Double]) {
        self.secondsPerTick = secondsPerTick; self.now = now; self.rng = rng; self.draws = draws; self.deadlines = deadlines
    }
    static func align(_ at: Double, _ frame: Int) -> Double { (at / Double(frame)).rounded(.up) * Double(frame) }
    /// reconcileAttackClock47: drop forces no longer engaged, start the newly engaged.
    mutating func reconcile(_ eligible: Set<String>, now: Double, frame: Int) {
        for key in deadlines.keys where !eligible.contains(key) { deadlines.removeValue(forKey: key) }
        for key in eligible.sorted(by: { $0.utf16.lexicographicallyPrecedes($1.utf16) }) where deadlines[key] == nil {
            deadlines[key] = AttackClock.align(now + 2 / secondsPerTick, frame)
        }
    }
    /// rescheduleAttack47.
    mutating func reschedule(_ key: String, now: Double, frame: Int) {
        rng = rng &* 1664525 &+ 1013904223; draws += 1
        let f = Native.fr, range = f(f(1) + f(f(2) * f(Double(rng) / 4294967296)))
        deadlines[key] = AttackClock.align(now + f(f(2) * range) / secondsPerTick, frame)
    }
}

/// Static inputs of the military window.
public struct WindowStatic: Codable, Sendable {
    public let provinceIds: [String]
    public let nationIds: [String]
    public let secondsPerTick: Double
    public let frameTicks: Int
    public let seaRegions: [[Int]]
    public let capacity: [Double]
    public let neighbors: [[Int]]
    public let unopposed: String
    public var combat: CombatStatic { CombatStatic(provinceIds: provinceIds, secondsPerTick: secondsPerTick, frameTicks: frameTicks, seaRegions: seaRegions) }
}

/// Everything one military frame reads and writes: forces and contacts, the attack clock, sieges,
/// reorganization homes, and each army's resolved efficiency inputs by province.
public struct MilitaryState: Sendable {
    public struct Home: Codable, Sendable { public let key: String; public let emergency: Bool; public let home: Int; public let homeCell: Int; public let homeX: Double; public let homeY: Double; public let full: Int }
    public struct Combat: Codable, Sendable {
        public let input: Efficiency.Input
        public let damageToArmy: Double; public let damageToProvince: Double; public let multiplier: Int
        public init(from decoder: Decoder) throws {
            input = try Efficiency.Input(from: decoder)
            let c = try decoder.container(keyedBy: K.self)
            damageToArmy = try c.decode(Double.self, forKey: .damageToArmy); damageToProvince = try c.decode(Double.self, forKey: .damageToProvince); multiplier = try c.decode(Int.self, forKey: .multiplier)
        }
        public func encode(to encoder: Encoder) throws {}
        enum K: String, CodingKey { case damageToArmy, damageToProvince, multiplier }
    }
    public var world: CombatWorld
    public var clock: AttackClock
    public var sieges: [OccupationWorld.Siege]
    public var reorganize: Bool
    public var homes: [Home]
    /// "armyId|province" (−1 at sea) → combat inputs.
    public var combat: [String: Combat]
    public var misses = 0
    public init(world: CombatWorld, clock: AttackClock, sieges: [OccupationWorld.Siege], reorganize: Bool, homes: [Home], combat: [String: Combat]) {
        self.world = world; self.clock = clock; self.sieges = sieges; self.reorganize = reorganize; self.homes = homes; self.combat = combat
    }
}

public struct MilitaryWindow {
    public let graph: TravelGraph
    public let statics: WindowStatic
    public init(graph: TravelGraph, statics: WindowStatic) { self.graph = graph; self.statics = statics }
    public struct Volley: Sendable, Equatable { public let at: Double; public let due: [String]; public let hits: Int; public let losses: Int }

    func province(_ s: MilitaryState, _ i: Int) -> Int {
        guard let t = ArmyTravel(record: s.world.forces[i].travel, graph: graph) else { return -1 }
        return Int(graph.provinces[graph.location(t).cell])
    }
    func combat(_ s: inout MilitaryState, _ id: String, _ p: Int) -> MilitaryState.Combat? {
        if let c = s.combat["\(id)|\(p)"] { return c }
        s.misses += 1; return nil
    }

    /// frame(): reconcile contacts (written back) and the attack-eligible forces.
    func contactFrame(_ s: inout MilitaryState) -> Set<String> {
        let w = s.world, g = graph
        var moving = w.forces.map { f in MovingForce(kind: f.kind == "fleet" ? .fleet : .army, id: f.id, nation: f.nation, withdrawing: f.withdrawing, travel: ArmyTravel(record: f.travel, graph: g)!) }
        moving.sort { Collate.less($0.key, $1.key) }
        let c = ContactMotion(graph: g).contacts(moving, w.contactList(g), w.rules(g, statics.combat))
        s.world.contacts = c.contacts.map(CombatWorld.contact)
        var eligible = Set<String>()
        for (i, f) in s.world.forces.enumerated() where !f.withdrawing {
            let p = f.kind == "army" ? province(s, i) : -1
            if c.held.contains(f.key) || p >= 0 && (w.atWar(f.nation, w.owners[p]) || s.sieges.contains { $0.province == p && $0.controller == f.nation && $0.resistance < $0.maximum }) { eligible.insert(f.key) }
        }
        return eligible
    }

    /// occupy(): one occupation pass with the due armies, skipped when nothing can change.
    func occupy(_ s: inout MilitaryState, now: Double, due: Set<String>) -> Bool {
        let w = s.world
        let onHostileLand = w.forces.indices.contains { i in
            let f = w.forces[i]; guard f.kind == "army", f.status != "retreating" else { return false }
            let p = province(s, i); return p >= 0 && w.atWar(f.nation, w.owners[p])
        }
        if s.sieges.isEmpty && !onHostileLand { return false }
        var armies = [OccupationWorld.Army]()
        for (i, f) in w.forces.enumerated() where f.kind == "army" {
            let p = province(s, i)
            var e = 0.0, d = 0.0, m = 1
            if p >= 0, let c = combat(&s, f.id, p) { e = Efficiency.compute(c.input); d = c.damageToProvince; m = c.multiplier }
            armies.append(.init(id: f.id, nation: f.nation, province: p, status: f.status, efficiency: e, damageToProvince: d, multiplier: m))
        }
        let armyDue = Set(w.forces.filter { $0.kind == "army" && due.contains($0.key) }.map(\.id))
        var o = OccupationWorld(tick: Int(now.rounded(.down)), nationIds: statics.nationIds, owners: w.owners, wars: w.wars, armies: armies, sieges: s.sieges, capacity: statics.capacity, unopposed: statics.unopposed)
        _ = o.advance(due: armyDue)
        s.world.owners = o.owners; s.sieges = o.sieges
        return true
    }

    /// applyAccountedVolley47 with combat values resolved for each army's current province.
    func volley(_ s: inout MilitaryState, due: Set<String>) -> (hits: Int, losses: Int) {
        var armies = [CombatWorld.VolleyInputs.Army]()
        let homes = Dictionary(uniqueKeysWithValues: s.homes.map { ($0.key, $0) })
        for (i, f) in s.world.forces.enumerated() where f.kind == "army" {
            let p = province(s, i), c = combat(&s, f.id, p), h = homes[f.key]
            armies.append(.init(key: f.key, efficiency: c.map { Efficiency.compute($0.input) } ?? 0, damageToArmy: c?.damageToArmy ?? 40, multiplier: Double(c?.multiplier ?? 1),
                                emergency: h?.emergency ?? true, home: h?.home ?? -1, homeCell: h?.homeCell ?? -1, homeX: h?.homeX ?? 0, homeY: h?.homeY ?? 0, full: h?.full ?? 0))
        }
        let inputs = CombatWorld.VolleyInputs(navyCountToHull: 1, reorganize: s.reorganize, armies: armies, fleets: [])
        let before = Dictionary(uniqueKeysWithValues: s.world.forces.map { ($0.key, $0.losses) })
        let hits = s.world.volley(due: due.sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }, inputs: inputs, graph: graph, statics: statics.combat)
        let losses = s.world.forces.reduce(0) { $0 + $1.losses - (before[$1.key] ?? $1.losses) }
        // actualForces47 lists only the living.
        s.world.forces.removeAll { $0.kind == "army" ? $0.troops <= 0 || $0.status == "destroyed" : $0.status == "lost" || $0.hull <= 0 }
        return (hits.count, losses)
    }

    /// One virtual frame from a frame boundary (force-tick47 advanceMilitaryWindowCore47 without
    /// daily hooks): occupation, attack clock, due volleys, then motion event by event.
    public func frame(_ s: inout MilitaryState) -> [Volley] {
        let F = statics.frameTicks
        var now = s.clock.now, volleys = [Volley](), events = 0
        let tick = now + Double(F)
        while true {
            events += 1; if events > 100_000 { break }
            _ = occupy(&s, now: now, due: [])
            var eligible = contactFrame(&s)
            s.clock.reconcile(eligible, now: now, frame: F)
            let due = s.clock.deadlines.filter { $0.value <= now }.map(\.key).sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }
            if !due.isEmpty {
                for key in due { s.clock.reschedule(key, now: now, frame: F) }
                let out = volley(&s, due: Set(due))
                volleys.append(Volley(at: now, due: due, hits: out.hits, losses: out.losses))
                _ = occupy(&s, now: now, due: Set(due))
                eligible = contactFrame(&s)
                s.clock.reconcile(eligible, now: now, frame: F)
            }
            if now == tick { break }
            let moved = s.world.advanceMotion(seconds: tick - now, graph: graph, statics: statics.combat)
            now = moved.unused == 0 ? tick : now + moved.elapsed
        }
        s.clock.now = tick
        let eligible = contactFrame(&s)
        s.clock.reconcile(eligible, now: tick, frame: F)
        return volleys
    }
}
