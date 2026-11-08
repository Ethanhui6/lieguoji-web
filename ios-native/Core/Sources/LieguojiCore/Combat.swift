import Foundation

/// ICU root collation for the ASCII keys the web compares with `localeCompare` / Intl.Collator
/// (force keys and contact pair keys): punctuation and symbols first in CLDR order, then digits,
/// then letters. Every character used has a distinct primary weight, so a weighted lexicographic
/// comparison is exact.
enum Collate {
    static let order: [Character] = Array("_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ")
    static let rank: [Character: Int] = Dictionary(uniqueKeysWithValues: order.enumerated().map { ($1, $0) })
    static func less(_ a: String, _ b: String) -> Bool {
        var i = a.makeIterator(), j = b.makeIterator()
        while true {
            switch (i.next(), j.next()) {
            case (nil, nil): return false
            case (nil, _): return true
            case (_, nil): return false
            case let (x?, y?):
                if x == y { continue }
                let rx = rank[x] ?? 1000 + Int(x.unicodeScalars.first!.value), ry = rank[y] ?? 1000 + Int(y.unicodeScalars.first!.value)
                if rx != ry { return rx < ry }
            }
        }
    }
}

/// One army or fleet in the shared motion phase (force-motion47 MovingForce47).
public struct MovingForce: Sendable, Equatable {
    public enum Kind: String, Sendable { case army, fleet }
    public var kind: Kind
    public var id: String
    public var nation: Int
    public var withdrawing: Bool
    public var travel: ArmyTravel
    public var key: String { "[\"\(kind.rawValue)\",\"\(id)\"]" }
    public init(kind: Kind, id: String, nation: Int, withdrawing: Bool, travel: ArmyTravel) { self.kind = kind; self.id = id; self.nation = nation; self.withdrawing = withdrawing; self.travel = travel }
}

/// A recorded encounter between two hostile forces (ForceContact47): their exact points and cells at
/// contact and the area (land province, water province or shared gate) it belongs to.
public struct ForceContact: Sendable, Equatable {
    public var a: String, b: String, cellA: Int, cellB: Int, pointA: TravelPoint, pointB: TravelPoint, area: String
    public init(a: String, b: String, cellA: Int, cellB: Int, pointA: TravelPoint, pointB: TravelPoint, area: String) {
        self.a = a; self.b = b; self.cellA = cellA; self.cellB = cellB; self.pointA = pointA; self.pointB = pointB; self.area = area
    }
}

/// The shared motion phase with contacts (force-motion47 advanceForceContactsCore47): all armies
/// and fleets advance by one event cursor; hostile forces in one land province, one water province
/// or meeting at a gate are held in contact and stop.
public struct ContactMotion {
    public struct Rules {
        public var enemy: (Int, Int) -> Bool
        public var canEnter: (MovingForce, Int) -> Bool
        public var speed: (MovingForce, Int) -> Double
        public var seaRegion: (Int) -> Int
        public var provinceID: (Int) -> String
        public var physicalContact = false
        /// With physical contact: the distance at which enemies engage (engine units).
        public var reach = EncounterGeometry.epsilon
        public init(enemy: @escaping (Int, Int) -> Bool, canEnter: @escaping (MovingForce, Int) -> Bool, speed: @escaping (MovingForce, Int) -> Double,
                    seaRegion: @escaping (Int) -> Int, provinceID: @escaping (Int) -> String) {
            self.enemy = enemy; self.canEnter = canEnter; self.speed = speed; self.seaRegion = seaRegion; self.provinceID = provinceID
        }
    }
    public struct Result { public var contacts: [ForceContact]; public var held: Set<String>; public var elapsed: Double; public var unused: Double; public var positions: [String: Position]? = nil }
    /// The last sort of the forces by key (the set rarely changes between calls).
    nonisolated(unsafe) static var orderCache: (keys: [String], order: [Int])?

    let graph: TravelGraph
    public init(graph: TravelGraph) { self.graph = graph }

    struct Position { let point: TravelPoint; let cell: Int }
    func positions(_ forces: [MovingForce]) -> [String: Position] {
        var out = [String: Position](); for f in forces { let l = graph.location(f.travel); out[f.key] = Position(point: l.point, cell: l.cell) }; return out
    }
    /// The area a cell lies in as a number (a land province's index, or −1 − its sea region), for
    /// grouping forces each step without building every force's area name (the name is built only for
    /// a pair that actually meets).
    func areaKey(_ cell: Int, _ rules: Rules) -> Int {
        let q = Int(graph.provinces[cell])
        return q >= 0 ? q : -1 - rules.seaRegion(Int(graph.faces[cell]))
    }
    func area(_ cell: Int, _ rules: Rules) -> String {
        let q = Int(graph.provinces[cell])
        return q >= 0 ? "land/" + rules.provinceID(q) : "sea/\(rules.seaRegion(Int(graph.faces[cell])))"
    }
    static func pairKey(_ a: String, _ b: String) -> String {
        let s = [a, b].sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }
        func json(_ x: String) -> String { "\"" + x.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }
        return "[" + json(s[0]) + "," + json(s[1]) + "]"
    }
    func pair(_ a0: String, _ b0: String, _ p: [String: Position], _ area: String) -> ForceContact {
        var a = a0, b = b0
        if b.utf16.lexicographicallyPrecedes(a.utf16) { swap(&a, &b) }
        let x = p[a]!, y = p[b]!
        return ForceContact(a: a, b: b, cellA: Int(graph.ids[x.cell]), cellB: Int(graph.ids[y.cell]), pointA: x.point, pointB: y.point, area: area)
    }

    /// contacts(): keep still-valid old pairs, add every hostile pair sharing an area, hold their members.
    func contacts(_ forces: [MovingForce], _ old: [ForceContact], _ rules: Rules, _ ready: [String: Position]? = nil) -> (contacts: [ForceContact], held: Set<String>, positions: [String: Position]) {
        let p = ready ?? positions(forces)
        var byKey = [String: MovingForce](); for f in forces { byKey[f.key] = f }
        var pairs = [String: ForceContact](), order = [String]()
        func put(_ c: ForceContact) { let k = ContactMotion.pairKey(c.a, c.b); if pairs[k] == nil { order.append(k) }; pairs[k] = c }
        func eligible(_ a: MovingForce, _ b: MovingForce, sea: Bool) -> Bool {
            rules.enemy(a.nation, b.nation) && (sea || !a.withdrawing && !b.withdrawing)
                && (!rules.physicalContact || EncounterGeometry.touching(p[a.key]!.point, p[b.key]!.point, reach: rules.reach))
        }
        for c in old {
            guard let a = p[c.a], let b = p[c.b], let fa = byKey[c.a], let fb = byKey[c.b] else { continue }
            let departed = c.area.hasPrefix("sea/") && (fa.withdrawing || fb.withdrawing) && area(a.cell, rules) != area(b.cell, rules)
            if !departed && a.point == c.pointA && b.point == c.pointB && Int(graph.ids[a.cell]) == c.cellA && Int(graph.ids[b.cell]) == c.cellB && eligible(fa, fb, sea: c.area.hasPrefix("sea/")) { put(c) }
        }
        var groups = [Int: [String]](), groupOrder = [Int]()
        for f in forces { let ar = areaKey(p[f.key]!.cell, rules); if groups[ar] == nil { groupOrder.append(ar) }; groups[ar, default: []].append(f.key) }
        var held = Set<String>()
        for ar in groupOrder {
            let group = groups[ar]!
            if group.count < 2 { continue }
            let sea = ar < 0
            var war = false, name: String?
            for i in 0..<group.count { for j in (i + 1)..<max(i + 1, group.count) {
                let a = group[i], b = group[j]
                if !eligible(byKey[a]!, byKey[b]!, sea: sea) { continue }
                if name == nil { name = area(p[a]!.cell, rules) }
                war = true; put(pair(a, b, p, name!))
            } }
            if war && !rules.physicalContact && sea { for id in group where !byKey[id]!.withdrawing { held.insert(id) } }
        }
        for k in order { let c = pairs[k]!; for id in [c.a, c.b] where !(byKey[id]?.withdrawing ?? true) { held.insert(id) } }
        let sorted = order.sorted { Collate.less($0, $1) }.map { pairs[$0]! }
        return (sorted, held, p)
    }

    static func identity(_ pairs: [ForceContact]) -> [String] {
        pairs.map { "[\"\($0.a)\",\"\($0.b)\",\"\($0.area)\"]" }.sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }
    }

    /// Whether two forces of states at war stand in one area (a province or sea region).
    func hostileShare(_ p: [String: Position], _ forces: [MovingForce], _ rules: Rules) -> Bool {
        var byArea = [Int: [Int]]()
        for (i, f) in forces.enumerated() { if let c = p[f.key]?.cell { byArea[areaKey(c, rules), default: []].append(i) } }
        for list in byArea.values where list.count > 1 {
            for x in 0..<list.count - 1 { for y in (x + 1)..<list.count where rules.enemy(forces[list[x]].nation, forces[list[y]].nation) { return true } }
        }
        return false
    }
    /// One call of advanceForceContacts47 (stopAtEvent as force-tick47 uses it). Forces are mutated in place.
    public func advance(_ input: inout [MovingForce], previous: [ForceContact], seconds: Double, rules: Rules, stopAtEvent: Bool, known: (contacts: [ForceContact], held: Set<String>, positions: [String: Position])? = nil) -> Result {
        // The phase keeps the forces in collation order of their keys.
        let order = Profile.measure("a.sort") { () -> [Int] in
            guard rules.physicalContact else { return input.indices.sorted { Collate.less(input[$0].key, input[$1].key) } }
            let keys = input.map(\.key)
            if let c = ContactMotion.orderCache, c.keys == keys { return c.order }
            let sorted = input.indices.sorted { Collate.less(keys[$0], keys[$1]) }
            ContactMotion.orderCache = (keys, sorted)
            return sorted
        }
        var forces = order.map { input[$0] }
        defer { for (k, i) in order.enumerated() { input[i] = forces[k] } }
        var book = previous, remaining = seconds, events = 0
        let initial = known ?? Profile.measure("a.initial") { contacts(forces, book, rules) }
        if stopAtEvent && ContactMotion.identity(initial.contacts) != ContactMotion.identity(book) {
            return Result(contacts: initial.contacts, held: initial.held, elapsed: 0, unused: seconds)
        }
        var current = initial
        // Forces that may still move in this call (arrived and halted ones stay so), and each force's area
        // as a number, kept current as movers move: every step used to look every force's position up by
        // its string key to group them (the bulk of a step on a map of several hundred armies).
        var active = forces.indices.filter { forces[$0].travel.status != .arrived && forces[$0].travel.status != .halted }
        var areaOf = forces.map { areaKey(initial.positions[$0.key]!.cell, rules) }
        // A force's speed over a cell does not change within one call: worked out once per cell.
        var speedAt = [(cell: Int, v: Double)](repeating: (-1, 0), count: forces.count)
        struct Mover { let f: Int; let seg: TravelSegment; let speed: Double; let end: Double; let time: Double; let bonus: Double }
        // App worlds: a step lasts at least a sixth of the call. Stepping every force to whichever of several
        // hundred reaches a node first split a call into dozens of whole-map steps; a force that gets
        // to its node inside a step now carries the time left over into its next stretch, so nobody slows.
        let quantum = rules.physicalContact ? seconds / 6 : 0
        var credit = rules.physicalContact ? [Double](repeating: 0, count: forces.count) : []
        while remaining > 0 {
            events += 1; if events > 100_000 { break }
            Profile.measure("a.event") {}
            book = current.contacts
            var movers = [Mover]()
            let t0 = Profile.enabled ? Date.timeIntervalSinceReferenceDate : 0
            active.removeAll { forces[$0].travel.status == .arrived || forces[$0].travel.status == .halted }
            for i in active {
                let s = forces[i].travel
                if current.held.contains(forces[i].key) { if !credit.isEmpty { credit[i] = 0 }; continue }
                guard let seg = graph.segment(s) else { continue }
                if !seg.local && !s.crossed && (s.offset == 0 || s.offset == seg.toGate) && !rules.canEnter(forces[i], seg.b) { forces[i].travel.status = .blocked; continue }
                forces[i].travel.status = .moving
                let end = seg.local || s.crossed ? seg.distance : seg.toGate, left = end - s.offset
                let over = s.crossed ? seg.b : seg.a
                var v = 0.0
                if left != 0 {
                    if speedAt[i].cell == over { v = speedAt[i].v } else { v = rules.speed(forces[i], over); speedAt[i] = (over, v) }
                }
                let bonus = credit.isEmpty ? 0 : credit[i], time = left == 0 ? 0 : v > 0 ? left / v : Double.infinity
                movers.append(Mover(f: i, seg: seg, speed: v, end: end, time: max(0, time - bonus), bonus: bonus))
            }
            if Profile.enabled { Profile.add("a.movers", Date.timeIntervalSinceReferenceDate - t0) }
            var dt = movers.reduce(remaining) { min($0, $1.time) }
            if dt < quantum { dt = min(remaining, quantum) }
            var meetingHit = false
            let t1 = Profile.enabled ? Date.timeIntervalSinceReferenceDate : 0
            if rules.physicalContact && dt > 0 {
                // Each segment is linear until the next gate. Solve the relative motion before
                // stepping, so fast opposing columns cannot tunnel through each other.
                let positions = current.positions
                let zero = TravelPoint(x: 0, y: 0)
                var groups = [Int: [Int]]()
                // Only areas a mover stands in: two forces standing still cannot come to meet (a touching
                // pair would already be in contact).
                let moving = Set(movers.map { areaOf[$0.f] })
                for i in forces.indices where moving.contains(areaOf[i]) { groups[areaOf[i], default: []].append(i) }
                // Only areas where hostile forces meet need the relative-motion solve.
                groups = groups.filter { _, list in
                    list.count > 1 && list.indices.dropLast().contains { k in list[(k + 1)...].contains { rules.enemy(forces[list[k]].nation, forces[$0].nation) } }
                }
                // Velocities only for the movers in those areas (they used to be worked out for every mover).
                var velocities = [String: TravelPoint]()
                if !groups.isEmpty {
                    let hot = Set(groups.values.joined())
                    for m in movers where m.time > 0 && m.time.isFinite && hot.contains(m.f) {
                        let key = forces[m.f].key, p = positions[key]!.point
                        let end = m.seg.local || forces[m.f].travel.crossed ? m.seg.end : m.seg.gate
                        velocities[key] = TravelPoint(x: (end.x - p.x) / m.time, y: (end.y - p.y) / m.time)
                    }
                }
                for group in groups.values { for k in group.indices { for l in (k + 1)..<group.count {
                    let a = forces[group[k]], b = forces[group[l]]
                    guard rules.enemy(a.nation, b.nation), !a.withdrawing, !b.withdrawing,
                          !current.held.contains(a.key), !current.held.contains(b.key) else { continue }
                    let pa = positions[a.key]!, pb = positions[b.key]!
                    guard areaKey(pa.cell, rules) == areaKey(pb.cell, rules) else { continue }
                    if let t = EncounterGeometry.meetingTime(pa.point, velocities[a.key] ?? zero, pb.point, velocities[b.key] ?? zero, limit: dt, reach: rules.reach) { dt = min(dt, t); meetingHit = true }
                } } }
            }
            if Profile.enabled { Profile.add("a.meet", Date.timeIntervalSinceReferenceDate - t1) }
            if dt > 0 {
                for m in movers {
                    let o = forces[m.f].travel.offset
                    forces[m.f].travel.offset = m.time <= dt ? m.end : m.seg.local ? min(m.end, o + (dt + m.bonus) * m.speed) : o + (dt + m.bonus) * m.speed
                    if !credit.isEmpty { credit[m.f] = m.time <= dt ? dt - m.time : 0 }
                }
                remaining = max(0, remaining - dt)
            }
            func reached(_ m: Mover) -> Bool { m.time <= dt || m.seg.local && forces[m.f].travel.offset == m.end }
            var interiorEnd: [String: Position]?
            if !rules.physicalContact && remaining == 0 && book.isEmpty && current.held.isEmpty && !forces.contains(where: \.withdrawing) && !movers.contains(where: reached) {
                let end = positions(forces)
                interiorEnd = end
                if forces.allSatisfy({ end[$0.key]!.cell == current.positions[$0.key]?.cell }) {
                    current = ([], [], end)
                    break
                }
            }
            let tR = Profile.enabled ? Date.timeIntervalSinceReferenceDate : 0
            defer { if Profile.enabled { Profile.add("a.step", Date.timeIntervalSinceReferenceDate - tR) } }
            for m in movers where reached(m) {
                if m.seg.local { forces[m.f].travel.offset = m.seg.distance; forces[m.f].travel.status = .arrived }
                else if forces[m.f].travel.crossed {
                    forces[m.f].travel.leg += 1; forces[m.f].travel.offset = 0; forces[m.f].travel.crossed = false
                    if forces[m.f].travel.leg == forces[m.f].travel.nodes.count - 1 { forces[m.f].travel.status = .arrived }
                }
            }
            let requests = movers.filter { m in
                let s = forces[m.f].travel
                return !m.seg.local && m.time <= dt && s.status != .arrived && !s.crossed && s.nodes[s.leg] == m.seg.a && s.offset == m.seg.toGate
            }
            // Only movers changed place since the last positions: the rest are copied (the same values a
            // whole recompute gives).
            func moved() -> [String: Position] {
                var out = current.positions
                for m in movers { let l = graph.location(forces[m.f].travel); out[forces[m.f].key] = Position(point: l.point, cell: l.cell) }
                return out
            }
            // Only the gate meetings of parity worlds read the positions before the crossing.
            let before = requests.isEmpty || rules.physicalContact ? [:] : moved()
            var admitted = [Mover]()
            for m in requests { if rules.canEnter(forces[m.f], m.seg.b) { admitted.append(m) } else { forces[m.f].travel.status = .blocked } }
            var stopped = Set<String>(), meetings = [(a: String, b: String, area: String)]()
            for i in admitted.indices { for j in (i + 1)..<max(i + 1, admitted.count) {
                let a = admitted[i], b = admitted[j], fa = forces[a.f], fb = forces[b.f]
                if a.seg.a == b.seg.b && a.seg.b == b.seg.a && !fa.withdrawing && !fb.withdrawing && rules.enemy(fa.nation, fb.nation) {
                    stopped.insert(fa.key); stopped.insert(fb.key)
                    let ids = [Int(graph.ids[a.seg.a]), Int(graph.ids[a.seg.b])].sorted()
                    meetings.append((fa.key, fb.key, "gate/\(ids[0])/\(ids[1])"))
                }
            } }
            for m in admitted where !stopped.contains(forces[m.f].key) {
                let f = forces[m.f], ar = area(m.seg.b, rules)
                for g in forces where g.key != f.key {
                    guard let v = before[g.key] else { continue }
                    if !rules.physicalContact && area(v.cell, rules) == ar && rules.enemy(f.nation, g.nation) && (ar.hasPrefix("sea/") || !f.withdrawing && !g.withdrawing) { meetings.append((f.key, g.key, ar)) }
                }
            }
            for m in admitted where !stopped.contains(forces[m.f].key) {
                forces[m.f].travel.crossed = true
                if forces[m.f].travel.offset == m.seg.distance {
                    forces[m.f].travel.leg += 1; forces[m.f].travel.offset = 0; forces[m.f].travel.crossed = false
                    if forces[m.f].travel.leg == forces[m.f].travel.nodes.count - 1 { forces[m.f].travel.status = .arrived }
                }
            }
            let t2 = Profile.enabled ? Date.timeIntervalSinceReferenceDate : 0
            let after: [String: Position]
            if let end = interiorEnd { after = end } else {
                // In place: the table is taken out of the current state (so it is not copied) and only the
                // movers' entries are rewritten — copying it at every step cost as much as the step.
                var p = current.positions
                current.positions = [:]
                for m in movers { let l = graph.location(forces[m.f].travel); p[forces[m.f].key] = Position(point: l.point, cell: l.cell) }
                after = p
            }
            if Profile.enabled { Profile.add("a.after", Date.timeIntervalSinceReferenceDate - t2) }
            let oldArea = movers.map { areaOf[$0.f] }
            for m in movers { if let p = after[forces[m.f].key] { areaOf[m.f] = areaKey(p.cell, rules) } }
            var merged = book
            for m in meetings {
                let c = pair(m.a, m.b, after, m.area), k = ContactMotion.pairKey(c.a, c.b)
                if let i = merged.firstIndex(where: { ContactMotion.pairKey($0.a, $0.b) == k }) { merged[i] = c } else { merged.append(c) }
            }
            // App worlds: with no contact standing or met this step and no two hostile forces sharing an
            // area, no engagement can begin — skip the whole contact rebuild (the bulk of a busy day: it ran
            // at every node any of some two hundred armies reached).
            // App worlds: contacts change only when two hostile forces meet (the solve above stopped the
            // step there), a force crosses into another area, or a force in a contact moves. Otherwise the
            // contact set stands as it is and the rebuild (half the cost of a busy day) is skipped.
            let tS = Profile.enabled ? Date.timeIntervalSinceReferenceDate : 0
            if rules.physicalContact && !meetingHit && merged.count == book.count {
                let members = Set(current.contacts.flatMap { [$0.a, $0.b] })
                let shifted = movers.indices.contains { j in
                    let m = movers[j]
                    return members.contains(forces[m.f].key) || oldArea[j] != areaOf[m.f]
                }
                if Profile.enabled { Profile.add("a.shift", Date.timeIntervalSinceReferenceDate - tS) }
                if !shifted { current = (current.contacts, current.held, after); continue }
            }
            let held0 = ContactMotion.identity(current.contacts)
            let t3 = Profile.enabled ? Date.timeIntervalSinceReferenceDate : 0
            current = contacts(forces, merged, rules, after)
            if Profile.enabled { Profile.add("a.contacts", Date.timeIntervalSinceReferenceDate - t3) }
            // App worlds (physical contact): contacts are re-read at every step of this loop, so the
            // window only needs to end when an engagement begins or ends — not each time any army on the
            // map reaches a node, which split a day into dozens of whole-map passes (frame, occupation,
            // positions) as armies grew faster and more numerous. Parity worlds stop at every node.
            if stopAtEvent && (rules.physicalContact ? ContactMotion.identity(current.contacts) != held0 : movers.contains(where: reached)) { break }
        }
        return Result(contacts: current.contacts, held: current.held, elapsed: seconds - remaining, unused: remaining, positions: current.positions)
    }
}

/// One volley (force-volley47 + force-losses47 applyActualVolley47): every due force strikes the
/// hostile forces it is in contact with, from one pre-damage snapshot; damage accumulates with a
/// fractional carry; dead armies are reorganized at home (original rule) or destroyed.
public enum Volley {
    public struct Hit: Sendable, Equatable { public let attacker: String; public let victim: String; public let damage: Double }
    public struct ArmyInput: Sendable { public let efficiency: Double; public let damageToArmy: Double; public let multiplier: Double
        public init(efficiency: Double, damageToArmy: Double, multiplier: Double) { self.efficiency = efficiency; self.damageToArmy = damageToArmy; self.multiplier = multiplier } }
    public struct NavalInput: Sendable { public let destiny: Double; public let maritime: Bool; public let leader: Double?
        public init(destiny: Double, maritime: Bool, leader: Double?) { self.destiny = destiny; self.maritime = maritime; self.leader = leader } }

    static func armyHit(_ efficiency: Double, _ enemies: Int, _ elite: Bool, _ damageToArmy: Double, _ multiplier: Double) -> Double {
        let f = Native.fr
        let raw = f(f(f(f(efficiency) * f(damageToArmy)) * max(1, f(multiplier))) / f(Double(enemies)))
        return elite ? f(raw * f(0.1)) : raw
    }
    static func navalFactor(_ v: NavalInput) -> Double {
        let f = Native.fr
        var factor = max(f(0.1), min(10, f(f(v.destiny) / f(30))))
        if v.maritime { factor = f(factor * f(1.5)) }
        let modifier = v.leader.map(f) ?? 0
        if abs(modifier) > f(0.001) { factor = f(factor * max(f(0.1), f(1 + modifier))) }
        return factor
    }
    static func navyHit(_ factor: Double, _ victims: Int, army: Bool) -> Double { let f = Native.fr; return f(f(f(factor) * f(army ? 320 : 40)) / f(Double(victims))) }

    /// forceVolley47: the hits of every due force, in key order.
    public static func hits(forces: [MovingForce], contacts: [ForceContact], due: [String], enemy: (Int, Int) -> Bool, onLand: (MovingForce) -> Bool,
                            elite: (MovingForce) -> Bool, army: (MovingForce) -> ArmyInput, navy: (MovingForce) -> NavalInput,
                            counter: ((MovingForce, MovingForce) -> Double)? = nil) -> [Hit] {
        var byKey = [String: MovingForce](), edges = [String: Set<String>]()
        for f in forces { byKey[f.key] = f }
        for c in contacts { edges[c.a, default: []].insert(c.b); edges[c.b, default: []].insert(c.a) }
        let codeOrder: (String, String) -> Bool = { $0.utf16.lexicographicallyPrecedes($1.utf16) }
        var out = [Hit]()
        for id in due.sorted(by: codeOrder) {
            guard let a = byKey[id] else { continue }
            let enemies = (edges[id] ?? []).sorted(by: codeOrder).compactMap { byKey[$0] }.filter { enemy(a.nation, $0.nation) }
            if a.kind == .army {
                let targets = enemies.filter { $0.kind == .army }
                if targets.isEmpty { continue }
                let v = army(a)
                for b in targets {
                    let hit = armyHit(v.efficiency, targets.count, elite(b), v.damageToArmy, v.multiplier)
                    out.append(Hit(attacker: id, victim: b.key, damage: counter.map { hit * $0(a, b) } ?? hit))
                }
            } else {
                let factor = navalFactor(navy(a))
                for kind in [MovingForce.Kind.fleet, .army] {
                    let targets = enemies.filter { $0.kind == kind && !onLand($0) }
                    for b in targets { out.append(Hit(attacker: id, victim: b.key, damage: navyHit(factor, targets.count, army: kind == .army))) }
                }
            }
        }
        return out
    }
}
