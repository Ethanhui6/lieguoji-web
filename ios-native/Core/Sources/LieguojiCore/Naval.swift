import Foundation

/// Fleets on the run state: fleet commands (fleet-commands47), the autonomous naval orders
/// (civilization47-naval-ai issueAutonomousNavalOrders47 with the native naval-roles,
/// naval-deployment and port-occupation kernels), port land reconciliation and the port interval
/// (civilization47-ports), and the daily fleet rations (civilization47-upkeep settleFleetFood47).
public enum Naval {
    static let f = Native.fr
    static let scheduleTicks = 40

    // MARK: Sea facts (native-statics seaStatic)
    public struct Port { public let id: String, provinceId: String, node: Int, center: TravelPoint }
    public struct Sea {
        public let components: [Int]
        public let ports: [Port]
        public init(_ v: JS) {
            components = v.components.asArray.map(\.asInt)
            ports = v.ports.asArray.map { Port(id: $0[0].asString, provinceId: $0[1].asString, node: $0[2].asInt, center: TravelPoint(x: $0[3].asNumber, y: $0[4].asNumber)) }
        }
        func component(_ face: Int) -> Int { components.indices.contains(face) ? components[face] : -1 }
    }
    /// The running world's sea facts (nil for a world without them: no ports, no fleets).
    public static var sea: Sea?
    static var cellsCache: (key: String, value: [String: Set<Int>])?
    /// harborCells46 from the harbour layout of the run.
    static func harborCells(_ r: JS) -> [String: Set<Int>] {
        let sites = r.harbors.isNull ? [] : r.harbors.sites.asArray, key = sites.map(\.id.asString).joined(separator: "|") + "#\(sites.count)"
        if let c = cellsCache, c.key == key { return c.value }
        var out = [String: Set<Int>](); for s in sites { out[s.id.asString] = Set(s.cells.asArray.map(\.asInt)) }
        cellsCache = (key, out); return out
    }
    static func atWar(_ r: JS, _ a: String, _ b: String) -> Bool { RunWindow.atWar(r, a, b) }
    static func fleetKey(_ id: String) -> String { "[\"fleet\",\"\(id)\"]" }
    static func fleets(_ r: JS) -> [JS] { r.navy.isNull || r.navy.fleets.isNull ? [] : r.navy.fleets.asArray }

    // MARK: Presence (navalPresence47)
    struct Present { let fleet: JS; let point: TravelPoint; let cell: Int; let face: Int }
    struct Presence { let fleets: [Present]; let held: Set<String>; let cells: [String: Set<Int>]
        func atPort(_ id: String) -> [Present] { let c = cells[id] ?? []; return fleets.filter { c.contains($0.face) } }
    }
    static func presence(_ r: JS) -> Presence {
        let bridge = Armies.bridge!, g = bridge.graph
        let held = ContactMotion(graph: g).contacts(bridge.forces(r), bridge.contacts(r), bridge.rules(r)).held
        let list = fleets(r).filter { $0.status.asString != "lost" }.map { fl -> Present in
            let loc = g.location(bridge.travel(r.fleetPositions.records[fl.id.asString]))
            return Present(fleet: fl, point: loc.point, cell: loc.cell, face: Int(g.faces[loc.cell]))
        }
        return Presence(fleets: list, held: held, cells: harborCells(r))
    }
    static func landHolders(_ space: [Armies.Located], _ province: String) -> [JS] {
        space.filter { $0.province?.id.asString == province && $0.army.status.asString != "retreating" }.map(\.army)
    }

    // MARK: Native kernels (native-war/port-occupation, naval-roles, naval-deployment)
    static func portTarget(_ p: JS, _ actor: String, _ enemy: (String) -> Bool) -> Bool {
        p.occupierId.asString != actor && (p.landOwnerId.asString == actor ? enemy(p.occupierId.asString) : enemy(p.landOwnerId.asString))
    }
    static func portAttack(_ p: JS, _ actor: String, _ strength: Double, _ dt: Double, _ enemy: (String) -> Bool) -> Bool {
        let land = p.landOwnerId.asString, occ = p.occupierId.asString
        if actor == land && occ == actor { p.value = JS(min(100, f(p.value.asNumber + f(f(dt) * 2)))); return false }
        if !portTarget(p, actor, enemy) && occ != actor { return false }
        if actor != land && !enemy(land) { return false }
        let delta = f(f(f(f(min(1, max(0, f(strength)))) + f(0.6)) * 15) * f(dt))
        if occ == actor { p.value = JS(min(100, f(p.value.asNumber + delta))); return false }
        p.value = JS(f(p.value.asNumber - delta)); if p.value.asNumber > 0 { return false }
        p.occupierId = JS(actor); p.value = JS(10); return true
    }
    static func portRecovery(_ p: JS, _ landOwner: String, _ holderPresent: Bool, _ otherPresent: Bool, _ dt: Double) {
        if p.landOwnerId.asString != landOwner { p.landOwnerId = JS(landOwner); p.occupierId = JS(landOwner); p.value = JS(100); return }
        if p.occupierId.asString != landOwner {
            if holderPresent { p.value = JS(min(100, f(p.value.asNumber + f(dt)))) }
            else { p.value = JS(f(p.value.asNumber - f(f(dt) * 2))); if p.value.asNumber <= 0 { p.occupierId = JS(landOwner); p.value = JS(5) } }
        } else if !otherPresent { p.value = JS(min(100, f(p.value.asNumber + f(f(dt) * 2)))) }
    }
    static func attackCount(_ count: Int) -> Int {
        if count <= 0 { return 0 }
        // App worlds (制海权): six fleets in ten put to sea against the enemy (the original: about a third).
        var n = max(0, min(count, Int(f(f(Double(count)) * f(UnitKinds.enabled ? Tuning.current.navyAttackShare : 0.35)).rounded(.up))))
        if count >= 2 { n = min(n, count - 1) }
        return max(1, n)
    }
    struct Candidate { let id: String; let ordinal: Int; let frontline: Bool; let strength: Double }
    static func attackFleets(_ c: [Candidate]) -> [String] {
        let sorted = c.enumerated().sorted { x, y in
            let a = x.element, b = y.element
            if a.frontline != b.frontline { return a.frontline }
            if a.strength != b.strength { return a.strength > b.strength }
            if a.ordinal != b.ordinal { return a.ordinal < b.ordinal }
            return x.offset < y.offset
        }.map(\.element)
        return Array(sorted.prefix(attackCount(c.count))).map(\.id)
    }
    struct IdleRow { let id: String; let present: Int; let assigned: Int; var weight = 0.0; var crowded = false }
    static func idleWeights(_ ports: [IdleRow], war: Bool, preferred: String?, current: String?, home: String?) -> [IdleRow] {
        let rows = ports.map { p -> IdleRow in
            let count = max(p.present, p.assigned); var w = f(1 / f(Double(count + 1)))
            if p.id == preferred { w = f(w * f(1.35)) }; if p.id == current { w = f(w * f(1.2)) }; if p.id == home { w = f(w * f(war ? 0.95 : 1.15)) }
            let crowded = count >= (war ? 3 : 2); if crowded { w = max(f(0.05), f(w * f(0.25))) }
            var q = p; q.weight = w; q.crowded = crowded; return q
        }
        let free = rows.filter { !$0.crowded }; return free.isEmpty ? rows : free
    }
    static func chooseIdle(_ rows: [IdleRow], _ draw: () -> Double) -> IdleRow? {
        if rows.isEmpty { return nil }
        var total = 0.0; for row in rows { total = f(total + max(0, row.weight)) }
        if total <= 0 { return rows[min(rows.count - 1, Int((draw() * Double(rows.count)).rounded(.down)))] }
        let pick = f(f(draw()) * total); var sum = 0.0
        for row in rows { sum = f(sum + max(0, row.weight)); if sum >= pick { return row } }
        return rows.last
    }
    static func idleDelay(_ war: Bool, _ draw: () -> Double) -> Double { let lo = war ? 12.0 : 18, hi = war ? 20.0 : 32; return f(lo + f(f(draw()) * (hi - lo))) }
    static func draw(_ s: JS) -> Double {
        var x = UInt32(s.rng.asNumber); x ^= x << 13; x ^= x >> 17; x ^= x << 5; s.rng = JS(Double(x)); return Double(x) / 4294967296
    }
    static func ration(_ crew: Int) -> Int { Int((Double(crew) * (1.0 / 30)).rounded(.up)) }
    static func speed(_ r: JS) -> Double { f(2.2) * ForceMotion.mapUnitsPerNativeUnit * r.forceClock.secondsPerTick.asNumber }

    // MARK: Volley input (civilization47-combat combatReader47 volley.navy)
    /// The fleet's national destiny, maritime livelihood and its living leader's naval modifier
    /// (nativeNavalCharacter47: the ordered float32 sum of navalCombatModifier, e.g. NavalMastery +0.3).
    static func combatInput(_ r: JS, _ nation: String) -> Volley.NavalInput {
        let id = r.people.nations[nation].leaderId
        var leader: Double?
        if !id.isNull, let p = People.person(r, id.asInt) {
            var sum = 0.0
            for name in (p.traits.isNull ? [] : p.traits.asArray.map(\.asString)) { sum = f(sum + f(Nobility.trait(name)?.navalCombatModifier.optionalNumber ?? 0)) }
            leader = sum
        }
        return Volley.NavalInput(destiny: r.upperCombat.nations[nation].destiny.asNumber, maritime: r.economy.nations[nation].ethnic.optionalString == "Maritime", leader: leader)
    }

    // MARK: Ports (civilization47-ports)
    static func revise(_ r: JS) { Vassals.bump(r.portControl) }
    /// reconcilePortLandOwnersOwned47.
    public static func reconcileLandOwners(_ r: JS) {
        guard let sea, !r.portControl.isNull else { return }
        for port in sea.ports {
            let p = r.portControl.ports[port.provinceId]
            guard !p.isNull, let land = r.world.provinces.asArray.first(where: { $0.id.asString == port.provinceId }) else { continue }
            if p.landOwnerId.asString != land.controller.asString {
                p.landOwnerId = land.controller.clone(); p.occupierId = land.controller.clone(); p.value = JS(100); revise(r)
            }
        }
    }
    /// The port interval of one motion segment from its start presence (settlePortInterval47).
    static func settlePorts(_ r: JS, _ view: Presence, retreating: [String: Double], hulls: [String: Double], from: Double, seconds: Double) {
        guard let sea, seconds > 0, !r.portControl.isNull else { return }
        let s = r.portControl, original = s.json
        for port in sea.ports {
            let p = s.ports[port.provinceId]; if p.isNull { continue }
            let present = view.atPort(port.id), land = p.landOwnerId.asString, occ = p.occupierId.asString
            portRecovery(p, land, present.contains { $0.fleet.nationId.asString == occ }, present.contains { $0.fleet.nationId.asString != land }, seconds)
        }
        for v in view.fleets {
            let fl = v.fleet, id = fl.id.asString, nation = fl.nationId.asString
            if view.held.contains(fleetKey(id)) || (retreating[id] ?? -.infinity) > from { continue }
            let hull = hulls[id] ?? 0
            for port in sea.ports where view.cells[port.id]?.contains(v.face) == true {
                let p = s.ports[port.provinceId], enemy = { (x: String) in atWar(r, nation, x) }
                if !portTarget(p, nation, enemy) || !portAttack(p, nation, hull / (fl.ships.asNumber * 100), seconds, enemy) { continue }
                let order = s.fleets[id]; order.forwardBaseId = JS(port.provinceId); order.targetId = .null
                let name = r.world.cities.asArray.first { $0.provinceId.asString == port.provinceId }?.name.asString ?? r.world.provinces.asArray.first { $0.id.asString == port.provinceId }!.name.asString
                let w = r.world, eid = w.nextEventId.asNumber, e = JS.object()
                e.id = JS(eid); e.day = w.day.clone(); e.kind = JS("system"); e.text = JS("\(fl.name.asString)控制\(name)海港"); e.reason = JS("舰队实际处于港湾内并完成争夺；仅海港控制变化，城市和陆地不随之吞并。")
                w.nextEventId = JS(eid + 1); w.events.push(e); if w.events.length > 160 { w.events.asArray = Array(w.events.asArray.suffix(160)) }
            }
        }
        if s.json != original { revise(r) }
    }
    /// The start state a motion segment's port interval reads.
    struct Segment { let view: Presence; let retreating: [String: Double]; let hulls: [String: Double] }
    static func segment(_ r: JS) -> Segment? {
        guard sea != nil, !fleets(r).isEmpty, Armies.bridge != nil else { return nil }
        var ret = [String: Double](), hulls = [String: Double]()
        if !r.maritime.retreating.isNull { for (k, v) in r.maritime.retreating.objectEntries { ret[k] = v.asNumber } }
        for (k, v) in r.maritime.hulls.objectEntries { hulls[k] = v.asNumber }
        return Segment(view: presence(r), retreating: ret, hulls: hulls)
    }

    // MARK: Fleet commands (fleet-commands47)
    enum Command { case halt; case sail(port: String) }
    struct Resolved { let fleet: JS; let travel: JS; let points: [TravelPoint]; let portId: String?; let name: String }
    static func remainingPoints(_ t: ArmyTravel, _ g: TravelGraph) -> [TravelPoint] {
        var points = [g.location(t).point]
        if t.status == .arrived || t.status == .halted { return points }
        func add(_ p: TravelPoint) { if points.last! != p { points.append(p) } }
        if let d = t.destination, t.nodes.count == 1 { add(d); return points }
        var s = t
        for leg in t.leg..<(t.nodes.count - 1) { s.leg = leg; guard let part = g.segment(s) else { break }; if leg != t.leg || !t.crossed { add(part.gate) }; add(part.end) }
        return points
    }
    static func resolve(_ r: JS, _ id: String, _ action: Command) -> Result<Resolved, ArmyOrders.Refused> {
        let bridge = Armies.bridge!, g = bridge.graph
        guard let fl = fleets(r).first(where: { $0.id.asString == id && $0.status.asString != "lost" }), fl.crew.asNumber > 0 else { return .failure(.init(reason: "舰队不存在或已经失去战斗力。")) }
        let held = ContactMotion(graph: g).contacts(bridge.forces(r), bridge.contacts(r), bridge.rules(r)).held
        if held.contains(fleetKey(id)) || (r.maritime.retreating[id].optionalNumber ?? -.infinity) > r.clock.tick.asNumber { return .failure(.init(reason: "舰队正在交锋或脱离战场，普通改令不能取消这段过程。")) }
        let record = r.fleetPositions.records[id], current = bridge.travel(record), at = g.location(current)
        switch action {
        case .halt:
            if current.status == .halted || current.status == .arrived { return .failure(.init(reason: "舰队已经停止航行。")) }
            let t = record.clone(); t.status = JS("halted")
            return .success(Resolved(fleet: fl, travel: t, points: [at.point], portId: nil, name: "当前位置"))
        case .sail(let portId):
            guard let port = sea?.ports.first(where: { $0.id == portId }) else { return .failure(.init(reason: "当前地图不存在这个海港。")) }
            let cellId = port.node * 2 + 1
            guard let cell = g.cell(id: cellId), g.isSea(cell) else { return .failure(.init(reason: "舰队目标必须位于真实海面。")) }
            let land = r.world.provinces.asArray.first { $0.id.asString == port.provinceId }!, nation = fl.nationId.asString
            if !RunWindow.access(r, nation, land.controller.asString) && !atWar(r, nation, land.controller.asString) { return .failure(.init(reason: "中立国家尚未授予港口通行权。")) }
            let destination = port.center
            if current.status == .moving && current.destination != nil && current.nodes.last == cell && current.destination == destination { return .failure(.init(reason: "舰队正在前往这个精确目标。")) }
            if (current.status == .arrived || current.status == .halted) && at.cell == cell && at.point == destination { return .failure(.init(reason: "舰队已经抵达这个位置。")) }
            guard let path = g.path(from: at.cell, to: cell, allowSea: true, canEnterProvince: { _ in false }) else { return .failure(.init(reason: "当前海域与目标之间没有相连的水路。")) }
            let t = JS.object()
            t.version = JS(2); t.armyId = JS(id); t.origin = ForceBridge.json(at.point); t.destination = ForceBridge.json(destination)
            t.nodes = .array(path.nodes.map { JS(Int(g.ids[$0])) }); t.leg = JS(0); t.offset = JS(0); t.crossed = JS(false)
            t.status = JS(path.nodes.count == 1 && jsHypot(at.point.x - destination.x, at.point.y - destination.y) == 0 ? "arrived" : "moving")
            let name = (r.world.cities.asArray.first { $0.provinceId.asString == port.provinceId }?.name.asString ?? land.name.asString) + "港"
            return .success(Resolved(fleet: fl, travel: t, points: remainingPoints(bridge.travel(t), g), portId: port.id, name: name))
        }
    }
    /// previewFleetCommand47: validity and actual route length.
    static func preview(_ r: JS, _ id: String, _ action: Command) -> (valid: Bool, distance: Double) {
        guard case .success(let v) = resolve(r, id, action) else { return (false, 0) }
        var d = 0.0; for i in 1..<max(1, v.points.count) { d = d + jsHypot(v.points[i].x - v.points[i - 1].x, v.points[i].y - v.points[i - 1].y) }
        return (true, d)
    }
    /// issueFleetOrderOwned47.
    @discardableResult
    static func issue(_ r: JS, _ id: String, _ action: Command, player: Bool = false) -> Bool {
        guard case .success(let v) = resolve(r, id, action) else { return false }
        r.fleetPositions.records[id] = v.travel; Vassals.bump(r.fleetPositions)
        let fl = v.fleet
        fl.route = .array(); fl.progress = JS(0); fl.dockId = .null; fl.targetId = v.portId.map { JS($0) } ?? .null
        fl.status = JS(v.travel.status.asString == "moving" ? "sailing" : "anchored")
        if player {
            if !r.voyages.manualFleets.asArray.contains(where: { $0.asString == id }) { r.voyages.manualFleets.push(JS(id)) }
            Vassals.bump(r.voyages)
        }
        var halt = false; if case .halt = action { halt = true }
        Daily.event(r, "order", "\(fl.name.asString)\(halt ? "停止航行" : "驶往" + v.name)", "军令从实际海面位置生效，抵达码头前不提前补粮；不依赖旧港口或城市锚点。")
        return true
    }

    // MARK: Autonomous orders (issueAutonomousNavalOrders47)
    public static func issueAutonomous(_ r: JS) {
        let s = r.navalAutonomy
        guard !s.isNull else { return }
        let now = r.clock.tick.asNumber
        if now == s.lastTick.asNumber { return }
        guard let sea, Armies.bridge != nil, !fleets(r).isEmpty else { s.lastTick = JS(now); s.revision = JS(s.revision.asNumber + 1); return }
        reconcileLandOwners(r)
        let view = presence(r), space = Armies.space(r), portBefore = r.portControl.json
        var landById = [String: JS](), stockById = [String: JS](), portById = [String: Port]()
        for p in r.world.provinces.asArray where landById[p.id.asString] == nil { landById[p.id.asString] = p }
        for p in r.world.statecraft.provinces.asArray where stockById[p.provinceId.asString] == nil { stockById[p.provinceId.asString] = p }
        for p in sea.ports where portById[p.id] == nil { portById[p.id] = p }
        let nations = r.world.nations.asArray.map(\.id.asString)
        var wars = [String: Bool]()
        func war(_ id: String) -> Bool { if let v = wars[id] { return v }; let v = nations.contains { atWar(r, id, $0) }; wars[id] = v; return v }
        var byComponent = [Int: [Port]](), safeCache = [String: [Port]]()
        func candidatesIn(_ c: Int) -> [Port] { if let v = byComponent[c] { return v }; let v = sea.ports.filter { sea.component($0.node) == c }; byComponent[c] = v; return v }
        func safeIn(_ nation: String, _ c: Int, _ low: Bool) -> [Port] {
            let key = "\(nation)|\(c)|\(low)"; if let v = safeCache[key] { return v }
            let v = candidatesIn(c).filter { p in
                let land = landById[p.provinceId]!, stock = stockById[p.provinceId]!
                return land.controller.asString == nation && land.legalOwner.asString == nation && r.portControl.ports[p.provinceId].occupierId.asString == nation
                    && !landHolders(space, p.provinceId).contains { atWar(r, nation, $0.nationId.asString) } && (!low || stock.grain.asNumber > stock.population.asNumber * 10)
            }
            safeCache[key] = v; return v
        }
        let all = fleets(r)
        if now >= s.nextRoleTick.asNumber {
            var ids = [JS]()
            for n in nations where war(n) {
                let c = view.fleets.filter { $0.fleet.nationId.asString == n }.map { v -> Candidate in
                    let fl = v.fleet, fid = fl.id.asString
                    let home = s.fleets[fid].homePortId.optionalString.flatMap { portById[$0] }, p = home.flatMap { landById[$0.provinceId] }
                    let frontline = p.map { p in landHolders(space, p.id.asString).contains { atWar(r, n, $0.nationId.asString) } || p.neighbors.asArray.contains { atWar(r, n, landById[$0.asString]!.controller.asString) } } ?? false
                    return Candidate(id: fid, ordinal: all.firstIndex { $0.id.asString == fid }!, frontline: frontline, strength: f(r.maritime.hulls[fid].asNumber / (fl.ships.asNumber * 100)))
                }
                ids += attackFleets(c).map { JS($0) }
            }
            r.portControl.attackFleetIds = .array(ids)
            s.nextRoleTick = JS(now + Double(scheduleTicks))
        }
        let speed = speed(r)
        for fl in all {
            let id = fl.id.asString, nation = fl.nationId.asString, row = s.fleets[id], order = r.portControl.fleets[id]
            let enemy = { (x: String) in atWar(r, nation, x) }, atWarNow = war(nation), actual = view.fleets.first { $0.fleet.id.asString == id }
            func note(_ d: String, _ reason: String) { row.decision = JS(d); row.reason = JS(reason) }
            if let fb = order.forwardBaseId.optionalString, r.portControl.ports[fb].occupierId.optionalString != nation { order.forwardBaseId = .null }
            if let t = order.targetId.optionalString, r.portControl.ports[t].isNull || !portTarget(r.portControl.ports[t], nation, enemy) { order.targetId = .null }
            if order.lastWar.asBool && !atWarNow { order.active = JS(false); order.targetId = .null; order.forwardBaseId = .null; row.nextTick = JS(now) }
            order.lastWar = JS(atWarNow)
            guard let actual else { note("lost", "舰队已经损失，保留部署历史。"); row.assignedPortId = .null; order.active = JS(false); order.targetId = .null; continue }
            if r.voyages.manualFleets.asArray.contains(where: { $0.asString == id }) || !fl.patrol.asBool {
                row.assignedPortId = .null; order.active = JS(false); order.targetId = .null; note("manual", "保留玩家军令；恢复自主指挥后再重新评估。"); continue
            }
            if view.held.contains(fleetKey(id)) || (r.maritime.retreating[id].optionalNumber ?? -.infinity) > now { note("busy", "实际海战或撤离尚未结束，保留当前航向。"); continue }
            let moving = r.fleetPositions.records[id].status.asString == "moving", component = sea.component(actual.face)
            let candidates = candidatesIn(component), low = fl.food.asNumber < fl.crew.asNumber * 30, safe = safeIn(nation, component, low)
            let assigned = row.assignedPortId.optionalString
            let goal = assigned.flatMap { a in candidates.first { $0.id == a } }
            let goalAttack = goal.map { g in order.targetId.optionalString == g.provinceId && portTarget(r.portControl.ports[g.provinceId], nation, enemy) } ?? false
            let goalHome = goal.map { g in safe.contains { $0.id == g.id } } ?? false
            if assigned != nil && !goalAttack && !goalHome || low && row.decision.asString != "resupply" { row.nextTick = JS(now) }
            if now < row.nextTick.asNumber { continue }
            row.nextTick = JS(now + Double(scheduleTicks))
            if moving && (goalHome || goalAttack && !low || assigned == nil && !low) { continue }
            if !moving && goalAttack && !low && view.atPort(goal!.id).contains(where: { $0.fleet.id.asString == id }) { note("attacking", "已在目标港湾，按实际存在时间争夺海港。"); continue }
            if moving { issue(r, id, .halt); row.assignedPortId = .null; order.targetId = .null }
            func atAnchor(_ p: Port) -> Bool { p.node == actual.face && jsHypot(actual.point.x - p.center.x, actual.point.y - p.center.y) <= 1e-8 }
            func start(_ pid: String, _ d: String, _ reason: String) { issue(r, id, .sail(port: pid)); row.assignedPortId = JS(pid); row.issuedTick = JS(now); note(d, reason) }
            let here = safe.first(where: atAnchor)
            if low, let here { row.assignedPortId = JS(here.id); order.targetId = .null; note("resupply", "实际停在安全本国锚点，等待日结从当地粮储补给。"); continue }
            let home = candidates.first { $0.id == row.homePortId.optionalString }
            let homeLost = home.map { r.portControl.ports[$0.provinceId].occupierId.asString != nation } ?? false
            let rationNow = Double(ration(fl.crew.asInt)), food = fl.food.asNumber, crew = fl.crew.asNumber
            func days(_ d: Double) -> Double { (d / speed / 120).rounded(.up) }
            if !low && atWarNow && (r.portControl.attackFleetIds.asArray.contains { $0.asString == id } || homeLost || goalAttack) {
                var best: (port: Port, control: JS, distance: Double)?
                for port in candidates where portTarget(r.portControl.ports[port.provinceId], nation, enemy) {
                    let control = r.portControl.ports[port.provinceId]
                    var row0: (port: Port, control: JS, distance: Double)?
                    if atAnchor(port) { row0 = (port, control, 0) }
                    else { let p = preview(r, id, .sail(port: port.id)); if p.valid && food >= rationNow * (days(p.distance) + 3) + crew * 30 { row0 = (port, control, p.distance) } }
                    guard let c = row0 else { continue }
                    // App worlds (制海权): after retaking our own ports, seek the enemy fleet where it lies at anchor.
                    func rankOf(_ x: (port: Port, control: JS, distance: Double)) -> Int {
                        if x.control.landOwnerId.asString == nation { return 0 }
                        if UnitKinds.enabled && view.atPort(x.port.id).contains(where: { enemy($0.fleet.nationId.asString) }) { return 1 }
                        return UnitKinds.enabled ? 2 : 1
                    }
                    let rank = rankOf(c), bestRank = best.map(rankOf) ?? 3
                    if best == nil || rank < bestRank || rank == bestRank && c.distance < best!.distance { best = c }
                }
                if let best {
                    order.targetId = JS(best.port.provinceId)
                    if atAnchor(best.port) { row.assignedPortId = JS(best.port.id); note("attacking", "在实际敌港等待争夺完成。") }
                    else { start(best.port.id, "attacking", best.control.landOwnerId.asString == nation ? "先夺回本国海港；沿真实海路航行。" : "前往可在余粮范围内抵达的敌港。") }
                    continue
                }
            }
            var available = [(port: Port, distance: Double)]()
            for port in safe {
                if atAnchor(port) { available.append((port, 0)); continue }
                let p = preview(r, id, .sail(port: port.id))
                if p.valid && (low || food >= rationNow * (days(p.distance) + 3)) { available.append((port, p.distance)) }
            }
            var chosen: (port: Port, distance: Double)?
            if low { chosen = available.enumerated().sorted { $0.element.distance != $1.element.distance ? $0.element.distance < $1.element.distance : $0.offset < $1.offset }.first?.element }
            else {
                let rows = idleWeights(available.map { v in
                    IdleRow(id: v.port.id, present: view.atPort(v.port.id).filter { $0.fleet.nationId.asString == nation }.count,
                            assigned: view.fleets.filter { o in
                                let other = o.fleet, oid = other.id.asString
                                return other.nationId.asString == nation && other.patrol.asBool && !r.voyages.manualFleets.asArray.contains { $0.asString == oid } && !view.held.contains(fleetKey(oid))
                                    && !((r.maritime.retreating[oid].optionalNumber ?? -.infinity) > now) && s.fleets[oid].decision.asString == "guarding" && s.fleets[oid].assignedPortId.optionalString == v.port.id
                            }.count)
                }, war: atWarNow, preferred: assigned, current: here?.id, home: row.homePortId.optionalString)
                let pick = chooseIdle(rows) { draw(s) }
                chosen = available.first { $0.port.id == pick?.id }
            }
            order.targetId = .null
            guard let chosen else { row.assignedPortId = .null; note("no-route", low ? "同一海域没有有余粮且可达的安全本国海港；保留实际位置。" : "当前没有满足海路与余粮条件的敌港或本国驻泊港。"); continue }
            row.nextTick = JS(now + (idleDelay(atWarNow) { draw(s) } * Double(scheduleTicks)).rounded(.up))
            if atAnchor(chosen.port) { row.assignedPortId = JS(chosen.port.id); note(low ? "resupply" : "guarding", low ? "等待实际日粮补给。" : "在本国锚点驻防。") }
            else { start(chosen.port.id, low ? "resupply" : "guarding", low ? "余粮不足，沿真实海路返回最近可补粮港口。" : "按原作港口拥挤权重重新部署。") }
        }
        if r.portControl.json != portBefore { revise(r) }
        s.lastTick = JS(now); s.revision = JS(s.revision.asNumber + 1)
    }

    // MARK: Daily rations (settleFleetFood47)
    public static func settleFleetFood(_ r: JS) {
        guard let sea, Armies.bridge != nil else { return }
        let all = fleets(r); reconcileLandOwners(r)
        if all.isEmpty { return }
        let view = presence(r), space = Armies.space(r)
        for fl in all where fl.status.asString != "lost" {
            let id = fl.id.asString, nation = fl.nationId.asString, travel = r.fleetPositions.records[id]
            guard let at = view.fleets.first(where: { $0.fleet.id.asString == id }) else { continue }
            var port: Port?
            if ["arrived", "halted"].contains(travel.status.asString) && !view.held.contains(fleetKey(id)) && !((r.maritime.retreating[id].optionalNumber ?? -.infinity) > r.clock.tick.asNumber) {
                port = sea.ports.first { p in
                    let land = r.world.provinces.asArray.first { $0.id.asString == p.provinceId }!
                    return at.face == p.node && jsHypot(at.point.x - p.center.x, at.point.y - p.center.y) <= 1e-8 && land.controller.asString == nation && land.legalOwner.asString == nation
                        && r.portControl.ports[p.provinceId].occupierId.optionalString == nation && !landHolders(space, p.provinceId).contains { atWar(r, $0.nationId.asString, nation) }
                }
            }
            if let port {
                let stock = r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == port.provinceId }!
                let amount = max(0, min(fl.crew.asNumber * 60 - fl.food.asNumber, stock.grain.asNumber - stock.population.asNumber * 10))
                stock.grain = JS(stock.grain.asNumber - amount); fl.food = JS(fl.food.asNumber + amount)
            }
            let rr = Double(ration(fl.crew.asInt)), starving = fl.food.asNumber < rr
            fl.food = JS(max(0, fl.food.asNumber - rr)); if !starving { continue }
            let crew = fl.crew.asInt, lost = min(crew, max(1, Int((Double(crew) * 0.05).rounded(.down))))
            fl.crew = JS(crew - lost); Wars.recordLoss(r, nation, "crew", lost)
            Daily.event(r, "supply", "\(fl.name.asString)断粮损失\(lost)名船员", "只有实际停在安全本国港口锚点才能补粮；不足一日粮按当前船员5%向下取整、至少1人减员。")
            if fl.crew.asInt > 0 { continue }
            Wars.recordLoss(r, nation, "hull", value: r.maritime.hulls[id].asNumber); Wars.recordLoss(r, nation, "ships", fl.ships.asInt); r.maritime.hulls[id] = JS(0)
            fl.status = JS("lost"); fl.patrol = JS(false); fl.dockId = .null; fl.targetId = .null; fl.route = .array(); fl.progress = JS(0)
            let t = travel.clone(); t.status = JS("halted"); r.fleetPositions.records[id] = t; r.maritime.retreating.delete(id)
            let order = r.portControl.fleets[id]; order.active = JS(false); order.targetId = .null; order.forwardBaseId = .null
            r.portControl.attackFleetIds = .array(r.portControl.attackFleetIds.asArray.filter { $0.asString != id }); revise(r)
        }
    }
}
