import Foundation

/// The fixed war plans of each declared war (war26-state reconcileWar26 / buildWar26Goal with the
/// recovered WarProvinceQueryV2 leaves of war26-native): a new war freezes the initial owners and,
/// for each side, the enemy provinces it means to take (a compact component grown from the best
/// land contact or overseas port, sized by ChooseOccupyCount); an ended war is closed.
public enum War26 {
    static let f = Native.fr
    static let floatMax = 3.4028234663852886e38
    /// Harbour ports of the sea graph (graphFor47): land province id and water component.
    public static var ports = [(province: String, component: Int)]()

    /// IL2CPP HashSet<int>: slot enumeration, deleted slots reused last-in first-out.
    struct IdSet {
        var slots = [Int?](), free = [Int](), indices = [Int: Int]()
        var count: Int { indices.count }
        func has(_ id: Int) -> Bool { indices[id] != nil }
        mutating func add(_ id: Int) { if has(id) { return }; let slot = free.popLast() ?? slots.count; if slot == slots.count { slots.append(id) } else { slots[slot] = id }; indices[id] = slot }
        mutating func delete(_ id: Int) {
            guard let slot = indices.removeValue(forKey: id) else { return }
            slots[slot] = nil; free.append(slot)
            if indices.isEmpty { slots = []; free = [] }
        }
        var values: [Int] { slots.compactMap { $0 } }
    }

    /// war26Strength (State.GetStrength with the web unit scales).
    static func strength(_ r: JS, _ id: String) -> Double {
        var army = 0.0, navy = 0.0
        let cargo = r.transports.cargo.isNull ? [] : r.transports.cargo.asArray.map(\.army)
        for a in r.world.armies.asArray + cargo where a.nationId.asString == id && a.status.asString != "destroyed" { army = f(army + f(f(max(0, a.troops.asNumber)) / f(2000))) }
        for n in (r.navy.fleets.isNull ? [] : r.navy.fleets.asArray) where n.nationId.asString == id && n.status.asString != "lost" { navy = f(navy + f(f(max(0, min(5, n.ships.asNumber))) / f(5))) }
        let owned = Double(r.world.provinces.asArray.filter { $0.controller.asString == id }.count)
        return f(f(f(f(navy + navy) + f(army + army)) + f(f(owned) * f(5))) + f(1))
    }
    /// nativeChooseOccupyCount.
    static func occupyCount(_ attacker: Double, _ defender: Double, _ count: Int) -> Int {
        if count <= 1 { return 1 }
        let a = f(attacker), d = f(defender), sum = f(a + d), share = sum > 0 ? f(a / sum) : f(0.5), boost = max(0, min(1, f(f(share - f(0.45)) * 2)))
        let third = Int(f(f(Double(count)) / f(3)).rounded(.up))
        return max(1, min(count, max(2, max(third, Int(roundToEven(f(f(Double(count)) * boost)))))))
    }
    /// nativeRoundToEven(value, 0).
    static func roundToEven(_ value: Double) -> Double {
        if !(abs(value) < 1e16) { return value }
        let integral = value.rounded(.towardZero), fraction = value - integral
        if value < 0 { return fraction == -0.5 ? (integral.truncatingRemainder(dividingBy: 2) == 0 ? integral : integral - 1) : (value - 0.5).rounded(.up) }
        return fraction == 0.5 ? (integral.truncatingRemainder(dividingBy: 2) == 0 ? integral : integral + 1) : (value + 0.5).rounded(.down)
    }
    /// landComponents: the first province of each land-connected group.
    static func lands(_ r: JS) -> [String: String] {
        let provinces = r.world.provinces.asArray
        var byId = [String: JS](); for p in provinces { byId[p.id.asString] = p }
        var known = [String: String]()
        for p in provinces where known[p.id.asString] == nil {
            var queue = [p.id.asString], i = 0; known[p.id.asString] = p.id.asString
            while i < queue.count { for n in byId[queue[i]]!.neighbors.asArray where known[n.asString] == nil { known[n.asString] = p.id.asString; queue.append(n.asString) }; i += 1 }
        }
        return known
    }

    /// buildWar26Goal.
    static func goal(_ r: JS, _ nation: String, _ enemy: String) -> JS {
        let w = r.world, provinces = w.provinces.asArray
        var number = [String: Int](); for (i, p) in provinces.enumerated() { number[p.id.asString] = i }
        let state = provinces.map { p in w.nations.asArray.firstIndex { $0.id.asString == p.controller.asString } ?? -1 }
        let defender = w.nations.asArray.firstIndex { $0.id.asString == enemy } ?? -1
        let neighbors = provinces.map { $0.neighbors.asArray.map { number[$0.asString]! } }
        func distance(_ a: Int, _ b: Int) -> Double {
            let pa = provinces[a].center, pb = provinces[b].center
            let dx = f(f(pa.x.asNumber) - f(pb.x.asNumber)), dy = f(f(0) - f(0)), dz = f(f(pa.y.asNumber) - f(pb.y.asNumber))
            return f(f(f(dy * dy) + f(dx * dx)) + f(dz * dz))
        }
        let enemyList = provinces.indices.filter { provinces[$0].controller.asString == enemy }, ours = provinces.indices.filter { provinces[$0].controller.asString == nation }
        func near(_ p: Int) -> Double { ours.reduce(Double.infinity) { min($0, distance(p, $1)) } }
        func contact(_ p: Int) -> Int { neighbors[p].filter { provinces[$0].controller.asString == nation }.count }
        let land = enemyList.filter { contact($0) > 0 }.sorted { a, b in contact(a) != contact(b) ? contact(a) > contact(b) : near(a) != near(b) ? near(a) < near(b) : a < b }
        let lands = self.lands(r)
        let owned = Set(ours.map { provinces[$0].id.asString })
        let starts = ports.filter { owned.contains($0.province) }
        let seaIds = Set(ports.filter { p in starts.contains { lands[$0.province] != lands[p.province] && $0.component == p.component } }.map(\.province))
        let sea = enemyList.filter { seaIds.contains(provinces[$0].id.asString) }.sorted { a, b in near(a) != near(b) ? near(a) < near(b) : a < b }
        let seed = land.first ?? sea.first
        let count = enemyList.isEmpty ? 0 : occupyCount(strength(r, nation), strength(r, enemy), enemyList.count)
        var result = [Int]()
        if let seed, state[seed] == defender {
            // nativeGrowClaimComponent → nativeGrowClaimFrontier.
            var selected = IdSet(); selected.add(seed); result.append(seed)
            var frontier = IdSet()
            func append(_ p: Int) { for n in neighbors[p] where !selected.has(n) && state[n] == defender { frontier.add(n) } }
            for id in selected.values where state[id] == defender { append(id) }
            while result.count < count && frontier.count > 0 {
                var best: Int?, bestShared = -1, bestDistance = floatMax
                for p in frontier.values where state[p] == defender {
                    let shared = neighbors[p].filter { selected.has($0) }.count, d = f(distance(p, seed))
                    if shared > bestShared || shared == bestShared && (d < bestDistance || abs(f(d - bestDistance)) < f(0.001) && best != nil && p < best!) { best = p; bestShared = shared; bestDistance = d }
                }
                guard let chosen = best else { break }
                frontier.delete(chosen)
                if selected.has(chosen) { continue }
                selected.add(chosen); result.append(chosen); append(chosen)
            }
        }
        let o = JS.object()
        o.nationId = JS(nation); o.enemyId = JS(enemy); o.provinceIds = .array(result.map { provinces[$0].id.clone() }); o.requestedCount = JS(count)
        o.entry = JS(!land.isEmpty ? "land" : seed != nil ? "sea" : "unavailable")
        return o
    }

    /// reconcileWar26.
    public static func reconcile(_ r: JS) {
        let s = r.warfare, tick = r.clock.tick
        var active = Set<String>()
        for rel in r.world.statecraft.relations.asArray where rel.status.asString == "war" {
            let id = "\(rel.a.asString)/\(rel.b.asString)/\(jsNumber(rel.sinceDay.asNumber))"; active.insert(id)
            if s.campaigns.asArray.contains(where: { $0.id.asString == id && $0.endedTick.isNull }) { continue }
            let c = JS.object()
            c.id = JS(id); c.a = rel.a.clone(); c.b = rel.b.clone(); c.sinceDay = rel.sinceDay.clone(); c.openedTick = tick.clone(); c.endedTick = .null
            let owners = JS.object(); for p in r.world.provinces.asArray { owners[p.id.asString] = p.controller.clone() }; c.initialOwners = owners
            c.goals = .array([goal(r, rel.a.asString, rel.b.asString), goal(r, rel.b.asString, rel.a.asString)])
            s.campaigns.push(c); Vassals.bump(s)
        }
        for c in s.campaigns.asArray where c.endedTick.isNull && !active.contains(c.id.asString) { c.endedTick = tick.clone(); Vassals.bump(s) }
        if s.campaigns.length > 1500 {
            let all = s.campaigns.asArray
            s.campaigns = .array(all.filter { $0.endedTick.isNull } + Array(all.filter { !$0.endedTick.isNull }.suffix(200))); Vassals.bump(s)
        }
    }

    /// reconcileDiplomaticForces47 without the port ledger (ported separately): sieges reconciled,
    /// the core refreshed, contacts and army statuses rebuilt, attack clocks, the leader's enemy
    /// modifier, then the war plans and loss ledgers.
    public static func reconcileForces(_ r: JS, _ participants: Set<String>) {
        r.occupation.sieges = .array(r.occupation.sieges.asArray.filter { s in
            guard let p = r.world.provinces.asArray.first(where: { $0.id.asString == s.provinceId.asString }) else { return false }
            return p.controller.asString == s.controller.asString && RunWindow.atWar(r, s.attacker.asString, s.controller.asString)
        })
        Wars.reconcileCore(r)
        invalidateRoutes(r)
        Armies.bridge?.reconcileContacts(r)
        Daily.reconcileMilitaryClock(r)
        Government.refreshLeaderCombat(r)
        reconcile(r); Wars.reconcileLosses(r)
    }
    /// invalidatePoliticalRoutes47: a marching army whose remaining land route crosses a province it
    /// may no longer enter stops where it is and is re-evaluated the next day.
    static func invalidateRoutes(_ r: JS) {
        guard let bridge = Armies.bridge else { return }
        let g = bridge.graph, provinces = r.world.provinces.asArray
        let original = !r.originalArmy47.isNull && r.originalArmy47.paths.optionalNumber == 1
        for a in r.world.armies.asArray {
            let id = a.id.asString, t = r.armyPositions.records[id]
            if t.isNull || t.status.asString != "moving" { continue }
            let nation = a.nationId.asString, retreat = a.status.asString == "retreating"
            let anchor = original ? provinces.first { $0.id.asString == a.provinceId.asString }?.controller.asString : nil
            let rest = t.nodes.asArray.dropFirst(t.leg.asInt + 1)
            let blocked = rest.contains { node in
                guard let cell = g.cell(id: node.asInt) else { return false }
                let q = Int(g.provinces[cell]); if q < 0 { return false }
                let c = provinces[q].controller.asString
                return !(RunWindow.access(r, nation, c) || c == anchor || !retreat && RunWindow.atWar(r, nation, c))
            }
            if !blocked { continue }
            let h = t.clone(); h.status = JS("halted"); r.armyPositions.records[id] = h; Vassals.bump(r.armyPositions)
            let order = r.armyAutonomy.armies[id]
            order.targetId = .null; order.campaignId = .null; order.issuedTick = .null; order.nextTick = r.clock.tick.clone(); order.decision = JS("waiting")
            order.reason = JS("外交改变了通行权，部队在实际位置停止，下一日重新评估。"); Vassals.bump(r.armyAutonomy)
        }
    }
    /// Install the hooks of declarations and peace.
    public static func install() {
        DiplomacyBridge.reconcileWarPlans = { reconcile($0); Wars.reconcileLosses($0) }
        PeaceBridge.reconcileForces = { reconcileForces($0, $1) }
    }
}
