import Foundation

/// The military state of the run in the typed form of the motion and contact ports (force-runtime47
/// actualForces47, force-motion47): armies and fleets with their travel records (cell ids ↔ graph
/// indices), contacts, and the contact reconciliation after a political change.
public final class ForceBridge {
    public let graph: TravelGraph
    let index: [Int: Int]
    var staticRegions: [Int: Int]?
    var staticRegionArray: [Int] = []
    var staticProvinceIds = [String]()
    public init(graph: TravelGraph) {
        self.graph = graph
        var m = [Int: Int](); for (i, id) in graph.ids.enumerated() { m[Int(id)] = i }; index = m
    }
    static let statuses: [String: ArmyTravel.Status] = ["moving": .moving, "arrived": .arrived, "blocked": .blocked, "halted": .halted]
    static func point(_ p: JS) -> TravelPoint { TravelPoint(x: p.x.asNumber, y: p.y.asNumber) }
    static func json(_ p: TravelPoint) -> JS { let o = JS.object(); o.x = JS(p.x); o.y = JS(p.y); return o }

    /// Parsed travel records. Records are replaced (never edited) when a force moves or gets an order,
    /// so a record object parses once; the cache keeps the object alive (its identity cannot be reused)
    /// and re-checks the fields that change with movement.
    private var parsed = [ObjectIdentifier: (record: JS, travel: ArmyTravel, nodes: Int, status: String)]()
    public func travel(_ t: JS) -> ArmyTravel {
        let id = ObjectIdentifier(t)
        if let c = parsed[id], c.record === t, c.travel.leg == t.leg.asInt, c.travel.offset == t.offset.asNumber, c.nodes == t.nodes.length, c.status == t.status.asString { return c.travel }
        let value = parse(t)
        if parsed.count > 8192 { parsed.removeAll(keepingCapacity: true) }
        parsed[id] = (t, value, t.nodes.length, t.status.asString)
        return value
    }
    private func parse(_ t: JS) -> ArmyTravel {
        var a = ArmyTravel(origin: Self.point(t.origin), nodes: t.nodes.asArray.map { index[$0.asInt]! })
        a.leg = t.leg.asInt; a.offset = t.offset.asNumber; a.crossed = t.crossed.asBool; a.status = Self.statuses[t.status.asString]!
        if t.version.asInt == 2 { a.destination = Self.point(t.destination) }
        return a
    }
    /// 只写行军中会变化的字段（起点、路径、终点与记录相同）。
    func writeProgress(_ a: ArmyTravel, to t: JS) {
        t.leg = JS(a.leg); t.offset = JS(a.offset); t.crossed = JS(a.crossed)
        t.status = JS(Self.statusNames[a.status.rawValue])
    }
    static let statusNames = ["moving", "arrived", "blocked", "halted"]
    /// 记下一条刚写好的记录的解析结果（与 parse(t) 相同），省去下一次解析。
    func remember(_ t: JS, _ a: ArmyTravel) {
        if parsed.count > 8192 { parsed.removeAll(keepingCapacity: true) }
        parsed[ObjectIdentifier(t)] = (t, a, a.nodes.count, Self.statusNames[a.status.rawValue])
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
    /// The engagement distance of app worlds, in engine units: eighteen display units, so columns meet
    /// in the field and at the border, not only at the city they march on.
    public static func engageReach(_ r: JS) -> Double { 18 * max(0.0001, r.scale.optionalNumber ?? 1) }
    /// The motion rules of the run: war between nations, water province of a sea face, province ids.
    public func rules(_ r: JS, canEnter: @escaping (MovingForce, Int) -> Bool = { _, _ in false }, speed: @escaping (MovingForce, Int) -> Double = { _, _ in 0 }) -> ContactMotion.Rules {
        let nations = r.world.nations.asArray
        let nCount = nations.count
        var nationAt = [String: Int](minimumCapacity: nCount)
        for (i, n) in nations.enumerated() {
            let id = n.id.asString
            if nationAt[id] == nil { nationAt[id] = i }
        }
        // v14.0.0：扁平 N×N Bool 交战矩阵 + 扁平海域表数组，消灭 contacts 内层 Set/Dictionary 哈希开销！
        var warMatrix = [Bool](repeating: false, count: nCount * nCount)
        for p in r.world.statecraft.relations.asArray where p.status.asString == "war" {
            if let a = nationAt[p.a.asString], let b = nationAt[p.b.asString], a != b {
                warMatrix[a * nCount + b] = true
                warMatrix[b * nCount + a] = true
            }
        }
        // The water region of each sea face and the province ids are fixed for a world.
        if staticRegions == nil || staticProvinceIds.count != r.world.provinces.length {
            var regions = [Int: Int]()
            var maxFace = -1
            for w in r.diplomaticGeography.water.asArray {
                let wid = w.id.asInt
                for face in w.faces.asArray {
                    let fi = face.asInt
                    regions[fi] = wid
                    if fi > maxFace { maxFace = fi }
                }
            }
            var regArr = [Int](repeating: Int.min, count: max(0, maxFace + 1))
            for (fi, wid) in regions where fi >= 0 && fi < regArr.count { regArr[fi] = wid }
            staticRegions = regions
            staticRegionArray = regArr
            staticProvinceIds = r.world.provinces.asArray.map(\.id.asString)
        }
        let regions = staticRegions!, regArr = staticRegionArray, provinceIds = staticProvinceIds
        var rules = ContactMotion.Rules(
            enemy: { a, b in a >= 0 && b >= 0 && a < nCount && b < nCount && warMatrix[a * nCount + b] },
            canEnter: canEnter,
            speed: speed,
            seaRegion: { f in (f >= 0 && f < regArr.count && regArr[f] != Int.min) ? regArr[f] : regions[f]! },
            provinceID: { provinceIds[$0] }
        )
        rules.physicalContact = r.regimes.enabled.isTruthy
        rules.reach = Self.engageReach(r)
        return rules
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
