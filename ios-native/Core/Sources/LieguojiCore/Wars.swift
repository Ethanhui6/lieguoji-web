import Foundation

/// The war ledgers on the run state, ported line by line: core distances (core-refresh51 with the
/// native BFS), the war registry (war46-wars, war46-coalition, war28 participants), the fixed war26
/// campaign plans' bookkeeping and the loss ledger (war27-losses).
public enum Wars {
    static let f = Native.fr

    // MARK: Core distances (core-refresh51, native-combat core-distance)
    static func coreDistances(_ byId: [String: JS], _ state: String, _ capital: String, _ order: [String]) -> [String: (distance: Int, connected: Bool)] {
        var visited: Set<String> = [capital], queue = [capital], result = [capital: (distance: 0, connected: true)]
        var depth = 0, cursor = 0
        while cursor < queue.count {
            let end = queue.count
            while cursor < end {
                for id in byId[queue[cursor]]!.neighbors.asArray.map(\.asString) {
                    let next = byId[id]!
                    if next.controller.asString != state || visited.contains(id) { continue }
                    result[id] = (depth + 1, true); queue.append(id); visited.insert(id)
                }
                cursor += 1
            }
            depth += 1
        }
        for id in order where !visited.contains(id) { depth += 1; result[id] = (depth, false) }
        return result
    }
    /// reconcileCore: province order kept in acquisition order, then distances from the capital.
    public static func reconcileCore(_ r: JS) {
        let w = r.world, u = r.upperCombat
        let ids = Set(w.nations.asArray.map(\.id.asString))
        for id in u.nations.objectKeys where !ids.contains(id) { u.nations.delete(id) }
        var byId = [String: JS](); for p in w.provinces.asArray { byId[p.id.asString] = p }
        for n in w.nations.asArray {
            let nid = n.id.asString
            var s = u.nations[nid]
            if s.isNull {
                func initial(_ key: String, _ count: Int) -> Int { Int(People.nameSeed("\(w.custom.seed.optionalString ?? "")/\(key)/\(nid)") % UInt32(count)) }
                s = .object(); s.polity = JS(Nobility.polities[initial("native-no-culture-polity", 6)]); s.traits = .array(); s.destiny = JS(10 + initial("native-destiny", 80))
                s.coreThreshold = JS(2); s.coreYear = JS(w.day.asInt / 360); s.provinceOrder = .array(); u.nations[nid] = s
            }
            let owned = Set(w.provinces.asArray.filter { $0.controller.asString == nid }.map(\.id.asString))
            var order = s.provinceOrder.asArray.map(\.asString).filter { owned.contains($0) }
            let existing = Set(order)
            for p in w.provinces.asArray where owned.contains(p.id.asString) && !existing.contains(p.id.asString) { order.append(p.id.asString) }
            s.provinceOrder = .array(order.map { JS($0) })
            let capital = w.cities.asArray.first { $0.id.optionalString == n.capitalId.optionalString }.map(\.provinceId.asString)
            let distances = capital.flatMap { owned.contains($0) ? coreDistances(byId, nid, $0, order) : nil }
            for id in order {
                let d = distances?[id]
                u.provinces[id].distance = JS(d?.distance ?? 2147483647); u.provinces[id].connected = JS(d?.connected ?? false)
            }
        }
    }

    // MARK: Registry (war46-wars, war46-coalition)
    static func revise(_ s: JS) { s.revision = JS(s.revision.asNumber + 1) }
    public static func stateNumber(_ r: JS, _ id: String) -> Int { r.people.nations[id].id.asInt }
    static func nationOf(_ s: JS, _ stateId: Int) -> String { s.nationIds.asArray.first { $0[0].asInt == stateId }![1].asString }
    static func relationIdentity(_ a: String, _ b: String, _ since: Int) -> String { a < b ? "\(a)/\(b)/\(since)" : "\(b)/\(a)/\(since)" }
    static func provinceNumber(_ s: JS, _ id: String) -> Int { (s.provinceIds.asArray.firstIndex { $0.asString == id } ?? -1) + 1 }
    /// orderedWar28Provinces: acquisition order, newly conquered land appended.
    public static func orderedProvinces(_ r: JS, _ nation: String) -> [JS] {
        var owned = [String: JS](), keys = [String]()
        for p in r.world.provinces.asArray where p.controller.asString == nation { owned[p.id.asString] = p; keys.append(p.id.asString) }
        var seen = Set<String>(), ordered = [String]()
        let order = r.upperCombat.nations[nation].provinceOrder
        for id in (order.isNull ? [] : order.asArray.map(\.asString)) where owned[id] != nil && seen.insert(id).inserted { ordered.append(id) }
        return (ordered + keys.filter { !seen.contains($0) }).map { owned[$0]! }
    }
    static func members(_ c: JS, current: Bool) -> [JS] { current ? c.participants.asArray : c.participants.asArray + c.destroyedParticipants.asArray }
    public static func opposedPairs(_ s: JS, _ c: JS, currentOnly: Bool = false) -> [(String, String)] {
        let all = members(c, current: currentOnly)
        var pairs = [(String, String)]()
        for a in all where a.side.asInt == 0 { for b in all where b.side.asInt == 1 { pairs.append((nationOf(s, a.stateId.asInt), nationOf(s, b.stateId.asInt))) } }
        return pairs
    }
    public static func participantNations(_ s: JS, _ c: JS) -> [String] { members(c, current: false).map { nationOf(s, $0.stateId.asInt) } }
    public static func diplomaticEndPairs(_ s: JS, _ c: JS) -> [(String, String)] { opposedPairs(s, c, currentOnly: !c.coalition.isNull) }
    public static func coversPair(_ c: JS, _ s: JS, _ a: String, _ b: String) -> Bool { opposedPairs(s, c).contains { [$0.0, $0.1].contains(a) && [$0.0, $0.1].contains(b) } }
    static func relation(_ r: JS, _ a: String, _ b: String) -> JS? {
        r.world.statecraft.relations.asArray.first { [$0.a.asString, $0.b.asString].contains(a) && [$0.a.asString, $0.b.asString].contains(b) }
    }
    /// registerWar46.
    @discardableResult
    public static func register(_ r: JS, attacker: String, defender: String, goals: JS, history: String = "complete", internalWar: JS? = nil, members: JS? = nil) -> JS {
        let s = r.nativeWars, rel = relation(r, attacker, defender)!
        let relationId = relationIdentity(attacker, defender, rel.sinceDay.asInt)
        if let existing = s.campaigns.asArray.first(where: { $0.relationId.asString == relationId && $0.endedTick.isNull }) { return existing }
        let ids = [stateNumber(r, attacker), stateNumber(r, defender)], complete = history == "complete"
        let c = JS.object()
        if let internalWar { c.internal = internalWar.clone() }
        if let members { let co = JS.object(); co.version = JS(1); co.members = members.clone(); co.departures = .array(); c.coalition = co }
        c.id = s.nextId.clone(); c.relationId = JS(relationId); c.nations = .array([rel.a.clone(), rel.b.clone()])
        c.attacker = complete ? JS(attacker) : .null; c.defender = complete ? JS(defender) : .null
        c.startTime = complete ? JS(f(r.life.gameTime.asNumber)) : .null; c.openedTick = r.clock.tick.clone(); c.endedTick = .null; c.history = JS(history)
        if let members { c.participants = .array(members.asArray.map { m in let o = JS.object(); o.stateId = m.stateId.clone(); o.side = m.side.clone(); return o }) }
        else { c.participants = .array(ids.enumerated().map { i, id in let o = JS.object(); o.stateId = JS(id); o.side = JS(i); return o }) }
        c.destroyedParticipants = .array(); c.initialOwners = .array(); c.initialProvinceCounts = .array(); c.initialCapitals = .array()
        c.goals = goals.clone(); c.kills = .array(); c.deaths = .array(); c.settlement = .null
        if complete {
            for nation in c.participants.asArray.map({ nationOf(s, $0.stateId.asInt) }) {
                let stateId = stateNumber(r, nation), owned = orderedProvinces(r, nation)
                c.initialProvinceCounts.push(.array([JS(stateId), JS(owned.count)]))
                for p in owned { c.initialOwners.push(.array([JS(provinceNumber(s, p.id.asString)), JS(stateId)])) }
                let capitalId = r.world.nations.asArray.first { $0.id.asString == nation }!.capitalId.optionalString
                if let capital = r.world.cities.asArray.first(where: { $0.id.optionalString == capitalId }) {
                    c.initialCapitals.push(.array([JS(stateId), JS(provinceNumber(s, capital.provinceId.asString))]))
                }
            }
        }
        revise(s); s.nextId = JS(s.nextId.asNumber + 1); s.campaigns.push(c)
        return c
    }
    /// reconcileWar28Identities: nations founded later get their numeric identity.
    public static func reconcileIdentities(_ r: JS) {
        let s = r.nativeWars
        var additions = [JS]()
        for n in r.world.nations.asArray {
            let id = stateNumber(r, n.id.asString)
            if !s.nationIds.asArray.contains(where: { $0[1].asString == n.id.asString }) { additions.append(.array([JS(id), n.id.clone()])) }
        }
        if !additions.isEmpty { revise(s); for a in additions { s.nationIds.push(a) } }
    }
    /// reconcileParticipants28.
    public static func reconcileParticipants(_ r: JS) {
        let s = r.nativeWars
        for c in s.campaigns.asArray where c.endedTick.isNull {
            let vanished = c.participants.asArray.filter { p in
                guard let n = r.people.nations.objectEntries.first(where: { $0.1.id.asInt == p.stateId.asInt })?.0 else { return true }
                return !r.world.provinces.asArray.contains { $0.controller.asString == n }
            }
            if !vanished.isEmpty {
                revise(s); c.participants.asArray = c.participants.asArray.filter { p in !vanished.contains { $0 === p } }
                for v in vanished { c.destroyedParticipants.push(v) }
            }
            let alive = r.world.statecraft.relations.asArray.contains { relationIdentity($0.a.asString, $0.b.asString, $0.sinceDay.asInt) == c.relationId.asString && $0.status.asString == "war" }
            if !alive { revise(s); c.endedTick = r.clock.tick.clone() }
        }
    }
    /// war28DamageSink: raw float damage per attacker and victim in the first opposed active war.
    public static func recordDamage(_ r: JS, killer: String, victim: String, amount: Double, warId: Int? = nil) {
        guard amount > 0 else { return }
        let s = r.nativeWars, k = stateNumber(r, killer), v = stateNumber(r, victim)
        func opposite(_ c: JS) -> Bool {
            guard c.endedTick.isNull, let a = c.participants.asArray.first(where: { $0.stateId.asInt == k }), let b = c.participants.asArray.first(where: { $0.stateId.asInt == v }) else { return false }
            return a.side.asInt != b.side.asInt
        }
        guard let c = s.campaigns.asArray.first(where: { (warId == nil || $0.id.asInt == warId!) && opposite($0) }) else { return }
        let kills = c.kills.asArray.first { $0[0].asInt == k }, deaths = c.deaths.asArray.first { $0[0].asInt == v }
        let nextKills = f((kills?[1].asNumber ?? 0) + amount), nextDeaths = f((deaths?[1].asNumber ?? 0) + amount)
        revise(s)
        if let kills { kills[1] = JS(nextKills) } else { c.kills.push(.array([JS(k), JS(nextKills)])) }
        if let deaths { deaths[1] = JS(nextDeaths) } else { c.deaths.push(.array([JS(v), JS(nextDeaths)])) }
    }

    // MARK: Losses (war27-losses)
    static let lossKinds = ["combat", "pursuit", "rout", "starvation", "crew", "hull", "ships", "cargo"]
    static func zeroLosses() -> JS { let o = JS.object(); for k in lossKinds { o[k] = JS(0) }; return o }
    public static func reconcileLosses(_ r: JS) {
        let s = r.losses, war = r.warfare
        var changed = false
        for n in r.world.nations.asArray where s.nations[n.id.asString].isNull {
            let a = JS.object(); a.total = zeroLosses(); a.unassigned = zeroLosses(); s.nations[n.id.asString] = a; changed = true
        }
        for c in war.campaigns.asArray where s.campaigns[c.id.asString].isNull {
            let o = JS.object(); o.history = JS("complete"); o.fromTick = r.clock.tick.clone()
            let l = JS.object(); l[c.a.asString] = zeroLosses(); l[c.b.asString] = zeroLosses(); o.losses = l
            s.campaigns[c.id.asString] = o; changed = true
        }
        let ids = Set(war.campaigns.asArray.map(\.id.asString))
        for id in s.campaigns.objectKeys where !ids.contains(id) { s.campaigns.delete(id); changed = true }
        if changed { revise(s) }
    }
    /// lossRecorder.
    public static func recordLoss(_ r: JS, _ nation: String, _ kind: String, _ amount: Int, enemies: [String] = []) {
        if amount == 0 { return }
        let s = r.losses, account = s.nations[nation]
        var sources = [String](); for e in enemies where !sources.contains(e) { sources.append(e) }
        var target = account.unassigned
        if sources.count == 1 && kind != "rout" && kind != "starvation",
           let c = r.warfare.campaigns.asArray.first(where: { $0.endedTick.isNull && ($0.a.asString == nation && $0.b.asString == sources[0] || $0.b.asString == nation && $0.a.asString == sources[0]) }) {
            target = s.campaigns[c.id.asString].losses[nation]
        }
        account.total[kind] = JS(account.total[kind].asNumber + Double(amount)); target[kind] = JS(target[kind].asNumber + Double(amount)); revise(s)
    }
}
