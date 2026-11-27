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

    /// v10.0.0 五维综合国力拆解（工业产能、海陆军质与战略投送、四线科技代差、核心人口与有效疆域、外交安定与凝聚力），
    /// 彻底替代旧版仅凭「领土数×5 + 兵力数」导致广袤荒原或暴兵国虚高、二战德/英/美/日被严重低估的问题。
    public struct CompositePower: Sendable {
        public let total: Double
        public let industry: Double
        public let military: Double
        public let tech: Double
        public let landPop: Double
        public let diplomacy: Double
    }

    public static func compositePower(_ r: JS, _ id: String) -> CompositePower {
        // 1. 工业产能与现代经济底盘（非线性工业指数拉开列强与农业小国代差，月财政与国库为辅）
        let indIdx = NuclearWarfare.industryIndex(r, nationId: id)
        let fin = r.finance.isNull ? JS.null : r.finance.nations[id]
        let gold = max(0.0, fin.gold.optionalNumber ?? 0.0)
        let income = max(0.0, fin.goldPerMonth.optionalNumber ?? 0.0)
        // v11.0.0 统一读取 NuclearWarfare 真核账本（兼容旧存档 r.regimes.nuclear 兜底），修复局内建造反应堆与核弹不计入综合国力的 Bug！
        let legacyReactors = r.regimes.isNull || r.regimes.nuclear.isNull ? 0.0 : max(0.0, r.regimes.nuclear[id].reactors.optionalNumber ?? 0.0)
        let reactors = max(Double(NuclearWarfare.reactors(r, nationId: id)), legacyReactors)
        let indCore: Double = pow(max(0.15, indIdx), 1.42) * 46.0
        let indCash: Double = min(28.0, (income + 1.0).squareRoot() * 1.45) + min(10.0, (gold + 1.0).squareRoot() * 0.10)
        let industryScore: Double = indCore + indCash + reactors * 8.0

        // 2. 四线科技现代化水平（陆军/经济/治国/海军 1..6 级，平方阶梯体现科技代差）
        let tMil: Int = WorldDepth.techLevel(r, nation: id, branch: .military)
        let tEco: Int = WorldDepth.techLevel(r, nation: id, branch: .economy)
        let tSta: Int = WorldDepth.techLevel(r, nation: id, branch: .statecraft)
        let tNav: Int = WorldDepth.techLevel(r, nation: id, branch: .naval)
        let techScore: Double = Double(tMil * tMil) * 2.8 + Double(tEco * tEco) * 2.5 + Double(tSta * tSta) * 1.6 + Double(tNav * tNav) * 2.2

        // 3. 军队质量、海军远洋投送与战略威慑（数量递减防人海碾压，乘以科技与工业质量权重）
        var armyRaw = 0.0, navyRaw = 0.0
        let cargo = r.transports.cargo.isNull ? [] : r.transports.cargo.asArray.map(\.army)
        for a in r.world.armies.asArray + cargo where a.nationId.asString == id && a.status.asString != "destroyed" {
            let troops = max(0.0, a.troops.asNumber)
            let morale = max(35.0, min(115.0, a.morale.optionalNumber ?? 80.0)) / 80.0
            armyRaw += (troops / 2200.0) * morale
        }
        for fl in (r.navy.fleets.isNull ? [] : r.navy.fleets.asArray) where fl.nationId.asString == id && fl.status.asString != "lost" {
            navyRaw += max(0.0, min(14.0, fl.ships.asNumber)) / 4.0
        }
        let dampedArmy: Double = armyRaw <= 22.0 ? armyRaw : (22.0 + (armyRaw - 22.0) * 0.42)
        let landQuality: Double = 0.55 + 0.19 * Double(tMil) + 0.24 * indIdx.squareRoot()
        let navBonus: Double = (r.regimes.isNull || r.regimes.historicalPower.isNull) ? 0.0 : (r.regimes.historicalPower[id].navalPowerBonus.optionalNumber ?? 0.0)
        let legacyNukes: Double = (r.regimes.isNull || r.regimes.nuclear.isNull) ? 0.0 : max(0.0, r.regimes.nuclear[id].nukes.optionalNumber ?? 0.0)
        let nukes: Double = max(Double(NuclearWarfare.nukes(r, nationId: id)), legacyNukes)
        let landPart: Double = dampedArmy * landQuality * 2.35
        let seaPart: Double = navyRaw * (4.5 + 1.15 * Double(tNav)) * (1.0 + navBonus * 1.65)
        let militaryScore: Double = landPart + seaPart + nukes * 25.0

        // 4. 有效核心人口与递减疆域（西伯利亚/荒原广土强烈递减，避免未开发大片空地虚高国力）
        var owned = 0
        var ownedIds = Set<String>()
        for p in r.world.provinces.asArray where p.controller.asString == id {
            owned += 1
            ownedIds.insert(p.id.asString)
        }
        var totalPop = 0.0
        for sp in r.world.statecraft.provinces.asArray where ownedIds.contains(sp.provinceId.asString) {
            totalPop += max(0.0, sp.population.optionalNumber ?? 0.0)
        }
        let dampedLand: Double = owned <= 14 ? Double(owned) * 1.35 : (18.9 + (Double(owned) - 14.0) * 0.42)
        let popScore: Double = min(38.0, (totalPop / 1000.0).squareRoot() * 1.45)
        let landPopScore: Double = dampedLand + popScore

        // 5. 外交阵营、政局安定、战争动员凝聚力与附庸体系
        let stability = max(0.0, min(100.0, Regimes.leverage(r, id).stability))
        let destiny = max(0.0, r.destiny.isNull ? 50.0 : (r.destiny.nations[id].destiny.optionalNumber ?? 50.0))
        let warSupport = NuclearWarfare.warSupport(r, nationId: id)
        var allies = 0
        if !r.alliances.isNull && !r.alliances.records.isNull {
            for rec in r.alliances.records.asArray where rec.endedTick.isNull {
                // v11.0.0 修复字段名：同盟记录实际字段为 rec.members（此前误读 rec.memberIds 致全图外交同盟分永久归零！）
                let memberArr = rec.members.isArray ? rec.members.asArray : rec.memberIds.asArray
                let members = memberArr.map(\.asString)
                if members.contains(id) { allies += max(0, members.count - 1) }
            }
        }
        var vassals = 0
        if !r.vassals.isNull && !r.vassals.records.isNull {
            for rec in r.vassals.records.asArray where rec.endedTick.isNull && rec.overlordId.asString == id {
                vassals += 1
            }
        }
        let diplomacyScore: Double = stability * 0.14 + min(10.0, destiny / 10.0) + warSupport * 0.10
            + min(16.0, Double(allies) * 3.0) + min(14.0, Double(vassals) * 5.0)

        let total = max(1.0, industryScore + militaryScore + techScore + landPopScore + diplomacyScore)
        return CompositePower(
            total: total,
            industry: industryScore,
            military: militaryScore,
            tech: techScore,
            landPop: landPopScore,
            diplomacy: diplomacyScore
        )
    }

    /// war26Strength (State.GetStrength with the web unit scales; App 模式使用真实五维综合国力).
    public static func strength(_ r: JS, _ id: String) -> Double {
        if UnitKinds.enabled && !r.regimes.isNull && r.regimes.enabled.isTruthy {
            return compositePower(r, id).total
        }
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
                return !ArmyOrders.canTraverse(r, nation: nation, controller: provinces[q].controller.asString,
                                               anchor: anchor, retreat: retreat)
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
