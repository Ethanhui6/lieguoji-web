import Foundation

/// The military state the combat port works on (src/native-export/combat-golden.test.ts
/// forceSnapshot): every living army and fleet with its journey, speed, policy and strength, the
/// recorded contacts, and the political facts motion and combat read.
public struct CombatWorld: Codable, Sendable, Equatable {
    public struct Point: Codable, Sendable, Equatable { public let x: Double; public let y: Double }
    public struct Contact: Codable, Sendable, Equatable { public var a: String; public var b: String; public var cellA: Int; public var cellB: Int; public var pointA: Point; public var pointB: Point; public var area: String }
    public struct Force: Codable, Sendable, Equatable {
        public var key: String; public var kind: String; public var id: String; public var nation: Int; public var withdrawing: Bool
        public var travel: ArmyAIWorld.Travel
        public var base: Double; public var unitSpeed: Double; public var elite: Bool; public var anchor: Int; public var status: String; public var allowSea: Bool
        public var troops: Int; public var morale: Double; public var hull: Int; public var crew: Int; public var ships: Int
        public var carry: Double; public var losses: Int
    }
    public var tick: Int
    public var owners: [Int]
    public var wars: [[Int]]
    public var alliances: [[Int]]
    public var vassals: [[Int]]
    public var forces: [Force]
    public var contacts: [Contact]

    public func atWar(_ a: Int, _ b: Int) -> Bool { a != b && wars.contains { $0[0] == a && $0[1] == b || $0[0] == b && $0[1] == a } }
    public func access(_ a: Int, _ b: Int) -> Bool {
        a == b || !atWar(a, b) && (alliances.contains { $0.contains(a) && $0.contains(b) } || vassals.contains { $0[0] == a && $0[1] == b })
    }
}

/// Static combat inputs: province ids (contact areas), water province of each sea face, clock.
public struct CombatStatic: Codable, Sendable {
    public let provinceIds: [String]
    public let secondsPerTick: Double
    public let frameTicks: Int
    public let seaRegions: [[Int]]
}

extension CombatWorld {
    func moving(_ g: TravelGraph) -> [MovingForce] {
        forces.map { f in
            var t = ArmyTravel(record: f.travel, graph: g) ?? ArmyTravel(origin: TravelPoint(x: f.travel.origin.x, y: f.travel.origin.y), nodes: [0])
            if t.nodes.isEmpty { t = ArmyTravel(origin: t.origin, nodes: [0]) }
            return MovingForce(kind: f.kind == "fleet" ? .fleet : .army, id: f.id, nation: f.nation, withdrawing: f.withdrawing, travel: t)
        }
    }
    func record(_ t: ArmyTravel, _ g: TravelGraph, version: Int) -> ArmyAIWorld.Travel {
        .init(version: t.destination == nil ? 1 : 2, origin: .init(x: t.origin.x, y: t.origin.y), destination: t.destination.map { .init(x: $0.x, y: $0.y) },
              nodes: t.nodes.map { Int(g.ids[$0]) }, leg: t.leg, offset: t.offset, crossed: t.crossed, status: t.statusText)
    }
    func contactList(_ g: TravelGraph) -> [ForceContact] {
        contacts.map { ForceContact(a: $0.a, b: $0.b, cellA: $0.cellA, cellB: $0.cellB, pointA: TravelPoint(x: $0.pointA.x, y: $0.pointA.y), pointB: TravelPoint(x: $0.pointB.x, y: $0.pointB.y), area: $0.area) }
    }
    static func contact(_ c: ForceContact) -> Contact {
        Contact(a: c.a, b: c.b, cellA: c.cellA, cellB: c.cellB, pointA: Point(x: c.pointA.x, y: c.pointA.y), pointB: Point(x: c.pointB.x, y: c.pointB.y), area: c.area)
    }

    func rules(_ g: TravelGraph, _ s: CombatStatic) -> ContactMotion.Rules {
        var regions = [Int: Int](); for r in s.seaRegions { regions[r[0]] = r[1] }
        let owners = self.owners, byKey = Dictionary(uniqueKeysWithValues: forces.map { ($0.key, $0) }), seconds = s.secondsPerTick
        let me = self
        return ContactMotion.Rules(
            enemy: { me.atWar($0, $1) },
            canEnter: { f, cell in
                let q = Int(g.provinces[cell])
                if f.kind == .fleet { return q < 0 }
                guard let a = byKey[f.key] else { return false }
                if q < 0 { return a.allowSea }
                let c = owners[q], anchor = a.anchor >= 0 ? owners[a.anchor] : nil
                return me.access(a.nation, c) || c == anchor || a.status != "retreating" && me.atWar(a.nation, c)
            },
            speed: { f, cell in
                if f.kind == .fleet { return Native.fr(2.2) * ForceMotion.mapUnitsPerNativeUnit * seconds }
                let a = byKey[f.key]!
                return ForceMotion.armySpeed(base: a.base, unitSpeed: a.unitSpeed, cell: cell, graph: g, secondsPerTick: seconds)
            },
            seaRegion: { regions[$0] ?? -1 },
            provinceID: { s.provinceIds[$0] })
    }

    /// advanceOwnedActualForces47: one motion call, then the army status rules (retreat completed on
    /// safe land → idle; held → fighting; otherwise idle).
    public mutating func advanceMotion(seconds: Double, graph g: TravelGraph, statics s: CombatStatic) -> ContactMotion.Result {
        let r = rules(g, s)
        var moving = self.moving(g)
        let out = ContactMotion(graph: g).advance(&moving, previous: contactList(g), seconds: seconds, rules: r, stopAtEvent: true)
        for (i, m) in moving.enumerated() { forces[i].travel = record(m.travel, g, version: forces[i].travel.version) }
        contacts = out.contacts.map(CombatWorld.contact)
        // safelyArrived, read from the positions after motion with the statuses before.
        var holders = [Int: [Int]]()
        for (i, f) in forces.enumerated() where f.kind == "army" { let q = Int(g.provinces[g.location(moving[i].travel).cell]); if q >= 0 { holders[q, default: []].append(i) } }
        var safe = Set<Int>()
        for (i, f) in forces.enumerated() where f.kind == "army" && f.status == "retreating" && (moving[i].travel.status == .arrived || moving[i].travel.status == .halted) {
            let q = Int(g.provinces[g.location(moving[i].travel).cell])
            guard q >= 0, access(f.nation, owners[q]) else { continue }
            if !(holders[q] ?? []).contains(where: { forces[$0].status != "retreating" && atWar(f.nation, forces[$0].nation) }) { safe.insert(i) }
        }
        for i in forces.indices where forces[i].kind == "army" {
            forces[i].status = safe.contains(i) ? "idle" : forces[i].status == "retreating" ? "retreating" : out.held.contains(forces[i].key) ? "fighting" : "idle"
            forces[i].withdrawing = forces[i].status == "retreating"
        }
        return out
    }

    /// Army reorganization inputs (original rule) and per-force combat values read from the web's
    /// combat reader.
    public struct VolleyInputs: Codable, Sendable {
        public struct Army: Codable, Sendable {
            public let key: String; public let efficiency: Double; public let damageToArmy: Double; public let multiplier: Double
            public let emergency: Bool; public let home: Int; public let homeCell: Int; public let homeX: Double; public let homeY: Double; public let full: Int
        }
        public struct Fleet: Codable, Sendable { public let key: String; public let destiny: Double; public let maritime: Bool; public let leader: Double? }
        public let navyCountToHull: Double
        public let reorganize: Bool
        public let armies: [Army]
        public let fleets: [Fleet]
    }

    /// applyActualVolley47: hits from one snapshot, damage with carry, deaths, reorganization at home,
    /// then contacts reconciled among the living.
    public mutating func volley(due: [String], inputs v: VolleyInputs, graph g: TravelGraph, statics s: CombatStatic) -> [Volley.Hit] {
        let moving = self.moving(g)
        let armyIn = Dictionary(uniqueKeysWithValues: v.armies.map { ($0.key, $0) }), fleetIn = Dictionary(uniqueKeysWithValues: v.fleets.map { ($0.key, $0) })
        let byKey = Dictionary(uniqueKeysWithValues: forces.map { ($0.key, $0) })
        let hits = Volley.hits(forces: moving, contacts: contactList(g), due: due, enemy: { atWar($0, $1) },
                               onLand: { g.provinces[g.location($0.travel).cell] >= 0 }, elite: { byKey[$0.key]?.elite ?? false },
                               army: { let a = armyIn[$0.key]!; return Volley.ArmyInput(efficiency: a.efficiency, damageToArmy: a.damageToArmy, multiplier: a.multiplier) },
                               navy: { let n = fleetIn[$0.key]!; return Volley.NavalInput(destiny: n.destiny, maritime: n.maritime, leader: n.leader) })
        var incoming = [String: Double]()
        for h in hits { incoming[h.victim, default: 0] += h.damage }
        var alive = Set(forces.indices)
        for i in forces.indices {
            let key = forces[i].key
            guard let raw = incoming[key] else { continue }
            let total = raw * (forces[i].kind == "army" ? 10 : v.navyCountToHull) + forces[i].carry
            let whole = total.rounded(.down); forces[i].carry = total - whole
            var strength = 0
            if forces[i].kind == "army" {
                let before = forces[i].troops
                strength = min(before, Int(whole)); forces[i].troops -= strength
                if strength > 0 { forces[i].morale = max(0, forces[i].morale - max(0.2, Double(strength) / Double(max(1, before)) * 46)) }
                if forces[i].troops == 0 {
                    if v.reorganize, let a = armyIn[key], !a.emergency, a.home >= 0, owners[a.home] == forces[i].nation, a.homeCell >= 0, let cell = g.cell(id: a.homeCell),
                       !forces.indices.contains(where: { $0 != i && forces[$0].kind == "army" && forces[$0].troops > 0 && forces[$0].status != "destroyed" && armyIn[forces[$0].key]?.home == a.home && forces[$0].nation == forces[i].nation }) {
                        forces[i].troops = max(1, Int((Double(a.full) * 0.1).rounded(.down))); forces[i].morale = 100; forces[i].status = "idle"
                        forces[i].travel = record(ArmyTravel(origin: TravelPoint(x: a.homeX, y: a.homeY), nodes: [cell]), g, version: 1)
                        forces[i].allowSea = false
                    } else {
                        forces[i].status = "destroyed"; forces[i].morale = 0
                        var t = moving[i].travel; t.status = .halted; forces[i].travel = record(t, g, version: forces[i].travel.version)
                        alive.remove(i)
                    }
                }
            } else {
                let before = forces[i].hull, oldCrew = forces[i].crew
                strength = min(before, Int(whole)); forces[i].hull = before - strength
                forces[i].crew = min(oldCrew, Int((Double(forces[i].hull) / Double(forces[i].ships * 100) * Double(forces[i].ships) * 40).rounded(.up)))
                if forces[i].hull == 0 {
                    forces[i].status = "lost"
                    var t = moving[i].travel; t.status = .halted; forces[i].travel = record(t, g, version: forces[i].travel.version)
                    alive.remove(i)
                }
            }
            forces[i].losses += strength
        }
        // reconcileForceContactsOwned47 among the living, then fighting without contact → idle.
        let living = forces.indices.filter { alive.contains($0) }
        var after = living.map { i -> MovingForce in
            let f = forces[i]
            return MovingForce(kind: f.kind == "fleet" ? .fleet : .army, id: f.id, nation: f.nation, withdrawing: f.withdrawing, travel: ArmyTravel(record: f.travel, graph: g)!)
        }
        after.sort { Collate.less($0.key, $1.key) }
        let clean = ContactMotion(graph: g).contacts(after, contactList(g), rules(g, s))
        contacts = clean.contacts.map(CombatWorld.contact)
        for i in forces.indices where forces[i].kind == "army" && forces[i].status == "fighting" && !clean.held.contains(forces[i].key) { forces[i].status = "idle" }
        return hits
    }
}
