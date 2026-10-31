import Foundation

/// The military state of the run in the typed form of the motion and contact ports (force-runtime47
/// actualForces47, force-motion47): armies and fleets with their travel records (cell ids ↔ graph
/// indices), contacts, and the contact reconciliation after a political change.
public final class ForceBridge {
    public let graph: TravelGraph
    let index: [Int: Int]
    public init(graph: TravelGraph) {
        self.graph = graph
        var m = [Int: Int](); for (i, id) in graph.ids.enumerated() { m[Int(id)] = i }; index = m
    }
    static let statuses: [String: ArmyTravel.Status] = ["moving": .moving, "arrived": .arrived, "blocked": .blocked, "halted": .halted]
    static func point(_ p: JS) -> TravelPoint { TravelPoint(x: p.x.asNumber, y: p.y.asNumber) }
    static func json(_ p: TravelPoint) -> JS { let o = JS.object(); o.x = JS(p.x); o.y = JS(p.y); return o }

    public func travel(_ t: JS) -> ArmyTravel {
        var a = ArmyTravel(origin: Self.point(t.origin), nodes: t.nodes.asArray.map { index[$0.asInt]! })
        a.leg = t.leg.asInt; a.offset = t.offset.asNumber; a.crossed = t.crossed.asBool; a.status = Self.statuses[t.status.asString]!
        if t.version.asInt == 2 { a.destination = Self.point(t.destination) }
        return a
    }
    public func write(_ a: ArmyTravel, to t: JS) {
        t.origin = Self.json(a.origin); t.nodes = .array(a.nodes.map { JS(Int(graph.ids[$0])) }); t.leg = JS(a.leg); t.offset = JS(a.offset); t.crossed = JS(a.crossed)
        t.status = JS(Self.statuses.first { $0.value == a.status }!.key)
        if let d = a.destination { t.destination = Self.json(d) }
    }
    /// actualForces47: live armies, then fleets with hulls.
    public func forces(_ r: JS) -> [MovingForce] {
        var nation = [String: Int](); for (i, n) in r.world.nations.asArray.enumerated() { nation[n.id.asString] = i }
        var out = [MovingForce]()
        for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" {
            out.append(MovingForce(kind: .army, id: a.id.asString, nation: nation[a.nationId.asString]!, withdrawing: a.status.asString == "retreating", travel: travel(r.armyPositions.records[a.id.asString])))
        }
        for f in (r.navy.fleets.isNull ? [] : r.navy.fleets.asArray) where f.status.asString != "lost" && r.maritime.hulls[f.id.asString].asNumber > 0 {
            out.append(MovingForce(kind: .fleet, id: f.id.asString, nation: nation[f.nationId.asString]!, withdrawing: (r.maritime.retreating[f.id.asString].optionalNumber ?? 0) > r.clock.tick.asNumber,
                                   travel: travel(r.fleetPositions.records[f.id.asString])))
        }
        return out
    }
    public func contacts(_ r: JS) -> [ForceContact] {
        r.forceContacts.pairs.asArray.map { c in
            ForceContact(a: c.a.asString, b: c.b.asString, cellA: c.cellA.asInt, cellB: c.cellB.asInt, pointA: Self.point(c.pointA), pointB: Self.point(c.pointB), area: c.area.asString)
        }
    }
    public static func json(_ c: ForceContact) -> JS {
        let o = JS.object(); o.a = JS(c.a); o.b = JS(c.b); o.cellA = JS(c.cellA); o.cellB = JS(c.cellB); o.pointA = json(c.pointA); o.pointB = json(c.pointB); o.area = JS(c.area); return o
    }
    /// The motion rules of the run: war between nations, water province of a sea face, province ids.
    public func rules(_ r: JS, canEnter: @escaping (MovingForce, Int) -> Bool = { _, _ in false }, speed: @escaping (MovingForce, Int) -> Double = { _, _ in 0 }) -> ContactMotion.Rules {
        let nations = r.world.nations.asArray.map(\.id.asString)
        var war = Set<Int>()
        for p in r.world.statecraft.relations.asArray where p.status.asString == "war" {
            if let a = nations.firstIndex(of: p.a.asString), let b = nations.firstIndex(of: p.b.asString) { war.insert(min(a, b) * 4096 + max(a, b)) }
        }
        var regions = [Int: Int]()
        for w in r.diplomaticGeography.water.asArray { for face in w.faces.asArray { regions[face.asInt] = w.id.asInt } }
        let provinceIds = r.world.provinces.asArray.map(\.id.asString)
        return ContactMotion.Rules(enemy: { a, b in a != b && war.contains(min(a, b) * 4096 + max(a, b)) }, canEnter: canEnter, speed: speed,
                                   seaRegion: { regions[$0]! }, provinceID: { provinceIds[$0] })
    }
    /// reconcileForceContactsOwned47 + the status update of reconcileDiplomaticForces47.
    public func reconcileContacts(_ r: JS) {
        let result = ContactMotion(graph: graph).contacts(forces(r), contacts(r), rules(r))
        r.forceContacts.pairs = .array(result.contacts.map(Self.json))
        for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" && a.status.asString != "retreating" {
            a.status = JS(result.held.contains("[\"army\",\"\(a.id.asString)\"]") ? "fighting" : "idle")
        }
    }
}
