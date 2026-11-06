import Foundation

/// The per-frame army orders on the run state (civilization47-army-ai issueArmyBatchOrders47 with the
/// original army rules): five calls rotate over the living armies; each chosen army keeps its task,
/// rests, attacks the best regular target, garrisons, or returns home, and every order goes through the
/// same checks as a player command (army-commands47), with its event and position revision.
public enum ArmyOrders {
    static let f = Native.fr
    static let retry = 20

    // MARK: Geography (travelFeatures47, provinceGeography47)
    struct Geography { let cellFeature: [Int]; let coasts: Set<Int>; let provinceFeature: [String: Int] }
    static var cache: (graph: ObjectIdentifier, value: Geography)?
    static func geography(_ r: JS, _ bridge: ForceBridge) -> Geography {
        let g = bridge.graph
        if let c = cache, c.graph == ObjectIdentifier(bridge) { return c.value }
        var feature = [Int](repeating: -1, count: g.count), next = 0
        for start in 0..<g.count where feature[start] < 0 {
            feature[start] = next; var queue = [start], k = 0
            while k < queue.count {
                let a = queue[k]; k += 1
                for l in g.linkStart[a]..<g.linkStart[a + 1] { let b = g.linkTo[l]; if feature[b] < 0 && g.isSea(b) == g.isSea(start) { feature[b] = next; queue.append(b) } }
            }
            next += 1
        }
        var coasts = Set<Int>(), provinceFeature = [String: Int]()
        for (i, p) in r.world.provinces.asArray.enumerated() {
            if let cell = Armies.homeCells[p.id.asString].flatMap({ g.cell(id: $0) }) { provinceFeature[p.id.asString] = feature[cell] }
            if g.byProvince[i].contains(where: { c in (g.linkStart[c]..<g.linkStart[c + 1]).contains { g.isSea(g.linkTo[$0]) } }) { coasts.insert(i) }
        }
        let value = Geography(cellFeature: feature, coasts: coasts, provinceFeature: provinceFeature)
        cache = (ObjectIdentifier(bridge), value)
        return value
    }

    // MARK: Commands (army-commands47)
    enum Action { case halt; case move(province: Int, retreat: Bool) }
    struct Refused: Error { let reason: String }
    static func engaged(_ r: JS, _ a: JS) -> Bool {
        let id = a.id.asString, k = Daily.key("army", id)
        return a.status.asString == "fighting" || r.battles.engagements.asArray.contains { $0.armies.asArray.contains { $0.asString == id } }
            || r.forceContacts.pairs.asArray.contains { $0.a.asString == k || $0.b.asString == k }
    }
    static func safeRetreatEnd(_ r: JS, _ here: Armies.Located, _ space: [Armies.Located]) -> Bool {
        guard let p = here.province, !engaged(r, here.army), RunWindow.access(r, here.army.nationId.asString, p.controller.asString) else { return false }
        return !space.contains { $0.province?.id.asString == p.id.asString && $0.army.status.asString != "retreating" && RunWindow.atWar(r, here.army.nationId.asString, $0.army.nationId.asString) }
    }
    /// resolve(): the travel record and target name of an order, or the refusal.
    static func resolve(_ r: JS, _ id: String, _ action: Action) -> Result<(travel: JS, name: String), Refused> {
        let bridge = Armies.bridge!, g = bridge.graph, space = Armies.space(r)
        guard let here = space.first(where: { $0.army.id.asString == id }) else { return .failure(Refused(reason: "这支军队不存在或已失去战斗力。")) }
        let a = here.army, nation = a.nationId.asString
        if engaged(r, a) { return .failure(Refused(reason: "交锋中请先脱离交锋，不能用停止或改令取消战斗。")) }
        let enemiesHere = here.province.map { p in space.contains { $0.province?.id.asString == p.id.asString && $0.army.status.asString != "retreating" && RunWindow.atWar(r, nation, $0.army.nationId.asString) } } ?? false
        let hostile = here.province.map { RunWindow.atWar(r, nation, $0.controller.asString) } ?? false
        var retreat = false
        if case .move(_, let v) = action { retreat = v }
        if !r.regimes.enabled.isTruthy && (hostile || enemiesHere) && !retreat { return .failure(Refused(reason: "当前地区尚未安全，只能撤退或等待交锋与占领完成。")) }
        if a.status.asString == "retreating", case .move = action, !retreat, !safeRetreatEnd(r, here, space) { return .failure(Refused(reason: "撤退途中不能改为进攻，请先抵达安全地区。")) }
        let travel = bridge.travel(here.travel)
        switch action {
        case .halt:
            if travel.status == .arrived || travel.status == .halted { return .failure(Refused(reason: "军队已经停止移动。")) }
            let t = here.travel.clone(); t.status = JS("halted"); return .success((t, "当前位置"))
        case .move(let province, let v):
            let p = r.world.provinces[province]
            guard let target = g.targetCell(province: province) else { return .failure(Refused(reason: "目标不在当前地图的实际海陆网格中。")) }
            if target == travel.nodes.last && travel.status == .moving { return .failure(Refused(reason: "军队正在前往这个目标。")) }
            let original = !r.originalArmy47.isNull && r.originalArmy47.paths.optionalNumber == 1
            let anchor = original ? r.world.provinces.asArray.first { $0.id.asString == a.provinceId.asString }?.controller.asString : nil
            let allowSea = r.reorganization.active[id].isNull
            guard let path = g.path(from: here.cell, to: target, allowSea: allowSea, canEnterProvince: { q in
                let c = r.world.provinces[q].controller.asString
                return RunWindow.access(r, nation, c) || c == anchor || !v && RunWindow.atWar(r, nation, c)
            }) else { return .failure(Refused(reason: allowSea ? "没有符合当前外交通行限制的海陆路线。" : "重编期间保留陆上行军，暂不能进入海域。")) }
            let point = g.location(travel).point
            let t = JS.object()
            t.version = JS(1); t.armyId = JS(id); t.origin = ForceBridge.json(point); t.nodes = .array(path.nodes.map { JS(Int(g.ids[$0])) })
            t.leg = JS(0); t.offset = JS(0); t.crossed = JS(false); t.status = JS(path.nodes.count == 1 ? "arrived" : "moving")
            if r.regimes.enabled.isTruthy {
                t.version = JS(2); t.destination = ForceBridge.json(g.targets[province])
                t.status = JS(EncounterGeometry.touching(point, g.targets[province]) ? "arrived" : "moving")
            }
            return .success((t, p.name.asString))
        }
    }
    /// issueArmyOrderOwned47 (autonomous source). Returns whether the order was valid.
    @discardableResult
    static func issue(_ r: JS, _ id: String, _ action: Action, player: Bool = false) -> Bool {
        guard case .success(let value) = resolve(r, id, action) else { return false }
        let a = r.world.armies.asArray.first { $0.id.asString == id }!
        r.armyPositions.records[id] = value.travel
        a.route = .array(); a.progress = JS(0)
        var retreat = a.status.asString == "retreating"
        if case .move(_, let v) = action { retreat = v }
        let space = Armies.space(r), status = value.travel.status.asString
        a.status = JS(retreat && (!["arrived", "halted"].contains(status) || !safeRetreatEnd(r, space.first { $0.army.id.asString == id }!, space)) ? "retreating" : "idle")
        r.battles.plans.delete(id)
        if player { takeover(r, id) }
        var halt = false; if case .halt = action { halt = true }
        Daily.event(r, "order", "\(a.name.asString)\(halt ? "停止行军" : "前往" + value.name)", "军令从实际海陆位置生效；连续经过相邻地块，停止或改令不回跳旧城市。")
        Vassals.bump(r.armyPositions)
        return true
    }
    /// playerTakeover: the army leaves autonomy; an expedition it carried is released.
    static func takeover(_ r: JS, _ id: String) {
        let s = r.voyages
        if !s.manualArmies.asArray.contains(where: { $0.asString == id }) { s.manualArmies.push(JS(id)) }
        for (nation, mission) in s.missions.objectEntries where mission.armyId.optionalString == id {
            s.missions.delete(nation); s.nextCheck[nation] = JS(r.clock.tick.asNumber + 120)
            let d = JS.object(); d.atTick = r.clock.tick.clone(); d.text = JS("玩家已接管该远征，自动调度不覆盖手动军令。"); s.decisions[nation] = d
            let fleetId = mission.fleetId.optionalString
            if ["assembling", "returning"].contains(mission.phase.optionalString ?? ""), !s.manualFleets.asArray.contains(where: { $0.optionalString == fleetId }),
               !r.transports.cargo.asArray.contains(where: { $0.fleetId.optionalString == fleetId }),
               let fleet = r.navy.fleets.asArray.first(where: { $0.id.optionalString == fleetId }), fleet.status.asString != "lost" { fleet.patrol = JS(true) }
        }
        Vassals.bump(s)
    }
    static func reason(_ r: JS, _ id: String, _ action: Action) -> String? {
        if case .failure(let e) = resolve(r, id, action) { return e.reason }
        return nil
    }

    // MARK: Enemies (regularCampaigns47, stateBorderReader55)
    static func enemies(_ r: JS, _ nation: String) -> [(nation: String, campaign: Int)] {
        let ids = r.nativeWars.nationIds.asArray
        guard let own = ids.first(where: { $0[1].asString == nation })?[0].asInt else { return [] }
        var out = [(nation: String, campaign: Int)]()
        for c in r.nativeWars.campaigns.asArray where c.endedTick.isNull && !c.internal.isTruthy {
            guard let p = c.participants.asArray.first(where: { $0.stateId.asInt == own }) else { continue }
            for e in c.participants.asArray where e.side.asInt != p.side.asInt {
                guard let id = ids.first(where: { $0[0].asInt == e.stateId.asInt })?[1].asString else { continue }
                if RunWindow.atWar(r, nation, id) && !out.contains(where: { $0.nation == id }) { out.append((id, c.id.asInt)) }
            }
        }
        return out
    }
    static func stateBorders(_ r: JS, _ nation: String, _ regular: Set<String>) -> [Int] {
        var out = [Int](), seen = Set<Int>()
        for (p, province) in r.world.provinces.asArray.enumerated() where province.controller.asString == nation {
            var unique = [Int](), u = Set<Int>()
            for q in CombatReader.borders[p] where q >= 0 && u.insert(q).inserted { unique.append(q) }
            for q in unique {
                let c = r.world.provinces[q].controller.asString
                if c != nation && regular.contains(c) && seen.insert(q).inserted { out.append(q) }
            }
        }
        return out
    }

    // MARK: Garrison (native-war army-deployment)
    static func chooseIdle(_ r: JS, _ a: JS, owned: [Int], home: Int, geo: Geography) -> Int? {
        let nation = a.nationId.asString, w = r.world
        let owner = { (q: Int) in w.provinces[q].controller.asString }
        let capitalId = w.nations.asArray.first { $0.id.asString == nation }?.capitalId.optionalString
        let cp = w.cities.asArray.first { $0.id.optionalString == capitalId }.flatMap { c in w.provinces.asArray.firstIndex { $0.id.asString == c.provinceId.asString } }
        var area = Set<Int>()
        if let cp, owner(cp) == nation { area.insert(cp); for id in w.provinces[cp].neighbors.asArray { if let q = index(r, id.asString), owner(q) == nation { area.insert(q) } } }
        var priority = [(Int, Double)](), secondary = [(Int, Double)]()
        func weight(_ p: Int) -> Double { geo.coasts.contains(p) ? 0.5 : 2 }
        func targeting(_ p: Int) -> Int {
            let id = w.provinces[p].id.asString
            return w.armies.asArray.filter { $0.troops.asNumber > 0 && r.armyAutonomy.armies[$0.id.asString].garrisonId.optionalString == id }.count
        }
        for p in owned {
            let ns = w.provinces[p].neighbors.asArray.compactMap { index(r, $0.asString) }
            let border = geo.coasts.contains(p) || ns.contains { owner($0) != nation }
            if !border || area.contains(p) { continue }
            let ally = ns.contains { owner($0) != nation && RunWindow.access(r, nation, owner($0)) }
            if targeting(p) >= (ally ? 1 : 4) { continue }
            let foreign = ns.contains { owner($0) != nation }
            if foreign { priority.append((p, ally ? f(0.2) : weight(p))) } else { secondary.append((p, ally ? f(0.2) : weight(p))) }
        }
        for p in owned where area.contains(p) && targeting(p) < 4 { priority.append((p, weight(p))) }
        let random = ArmyAutonomy.garrisonRandom("\(w.custom.seed.asString)/\(a.id.asString)/\(w.day.asInt)/garrison47")
        let list = !priority.isEmpty && !secondary.isEmpty ? (f(random()) < f(0.18) ? secondary : priority) : !priority.isEmpty ? priority : secondary
        if list.isEmpty {
            if owned.contains(home) { return home }
            return owned.isEmpty ? nil : owned[min(owned.count - 1, Int((random() * Double(owned.count)).rounded(.down)))]
        }
        var total = 0.0; for p in list { total = f(total + p.1) }
        if total <= 0 { return list[min(list.count - 1, Int((random() * Double(list.count)).rounded(.down)))].0 }
        let draw = f(f(random()) * total)
        var sum = 0.0
        for p in list { sum = f(sum + p.1); if sum >= draw { return p.0 } }
        return list.last!.0
    }
    static func index(_ r: JS, _ id: String) -> Int? { r.world.provinces.asArray.firstIndex { $0.id.asString == id } }

    // MARK: The batch (army-batch47 consumeArmyBatch47, issueArmySelection47)
    /// issueArmyBatchOrders47: whether any army was selected this frame.
    @discardableResult
    public static func issueBatch(_ r: JS) -> Bool {
        if !r.regimes.isNull, r.regimes.enabled.isTruthy, !r.chronicle.isNull {
            for n in r.world.nations.asArray where r.chronicle.ended.has(n.id.asString) { Government.clearCollapsedArmies(r, n.id.asString) }
        }
        let s = r.armyBatch
        if s.isNull || r.clock.tick.asNumber == s.lastTick.asNumber { return false }
        let live = r.world.armies.asArray.filter { $0.troops.asNumber > 0 }.map(\.id.asString)
        var cursor = s.cursor.asInt, selected = [String]()
        if !live.isEmpty { for _ in 0..<5 { if cursor >= live.count { cursor = 0 }; selected.append(live[cursor]); cursor += 1 } }
        s.cursor = JS(cursor); s.lastTick = r.clock.tick.clone(); s.calls = JS(s.calls.asNumber + Double(selected.count))
        if selected.isEmpty { return false }
        selection(r, selected)
        return true
    }
    static func selection(_ r: JS, _ ids: [String]) {
        guard let bridge = Armies.bridge else { return }
        let g = bridge.graph, state = r.armyAutonomy, geo = geography(r, bridge), tick = r.clock.tick.asInt
        let space = Armies.space(r), held = Set(r.forceContacts.pairs.asArray.flatMap { [$0.a.asString, $0.b.asString] })
        let ports = Set(r.harbors.sites.asArray.map(\.provinceId.asString))
        var enemyMaps = [String: [(nation: String, campaign: Int)]]()
        for n in r.world.nations.asArray { enemyMaps[n.id.asString] = enemies(r, n.id.asString) }
        for id in ids {
            let a = r.world.armies.asArray.first { $0.id.asString == id }!, row = state.armies[id], nation = a.nationId.asString
            let en = enemyMaps[nation] ?? [], enemySet = Set(en.map(\.nation))
            func note(_ d: String, _ reason: String, clear: Bool = false) {
                row.decision = JS(d); row.reason = JS(reason); row.nextTick = JS(tick + retry)
                if clear { row.targetId = .null; row.campaignId = .null; row.issuedTick = .null }
            }
            func halt() { if reason(r, id, .halt) == nil { issue(r, id, .halt) } }
            func controller(_ pid: String) -> String? { r.world.provinces.asArray.first { $0.id.asString == pid }?.controller.asString }
            if !en.isEmpty || !row.garrisonId.isNull && controller(row.garrisonId.asString) != nation { row.garrisonId = .null }
            
            guard let here = space.first(where: { $0.army.id.asString == id }) else { row.garrisonId = .null; note("lost", "部队已失去战斗力，保留既有军令历史。", clear: true); continue }
            if r.voyages.manualArmies.asArray.contains(where: { $0.asString == id }) { row.garrisonId = .null; note("manual", "玩家已接管，自主指挥保留其军令。", clear: true); continue }
            if held.contains(Daily.key("army", id)) || a.status.asString == "fighting" || !r.reorganization.active[id].isNull { note("busy", "正在实际交锋或整编，保留当前任务。"); continue }
            if tick < row.nextTick.asInt { continue }
            func enemyAt(_ pid: String) -> String? {
                space.first { $0.province?.id.asString == pid && $0.army.status.asString != "retreating" && enemySet.contains($0.army.nationId.asString) }?.army.nationId.asString
            }
            let target = row.targetId.isNull ? nil : r.world.provinces.asArray.first { $0.id.asString == row.targetId.asString }
            let targetEnemy: String? = target.flatMap { t in enemySet.contains(t.controller.asString) ? t.controller.asString : RunWindow.access(r, nation, t.controller.asString) ? enemyAt(t.id.asString) : nil }
            let ongoing = here.travel.status.asString == "moving"
            let targetOwned = target?.controller.asString == nation
            let garrisonIsTarget = !row.garrisonId.isNull && row.garrisonId.asString == target?.id.asString
            if ongoing && (row.targetId.isNull || targetEnemy != nil || row.decision.asString == "returning" && targetOwned || row.decision.asString == "staging" && targetOwned && !en.isEmpty
                           || garrisonIsTarget && targetOwned && en.isEmpty || a.status.asString == "retreating") {
                if garrisonIsTarget && targetOwned && en.isEmpty { note("garrison", "正在沿原定路线前往驻地，保留既有行军进度。") } else { row.nextTick = JS(tick + retry) }
                continue
            }
            if a.status.asString != "retreating", let p = here.province, RunWindow.atWar(r, nation, p.controller.asString),
               !r.regimes.enabled.isTruthy || RunWindow.atCity(here, bridge: bridge) { note("busy", "部队已在敌方真实陆地，等待交锋或地区抵抗结算。"); continue }
            var attack = [Int](), attackSet = Set<Int>()
            func add(_ p: Int) { if attackSet.insert(p).inserted { attack.append(p) } }
            let provinces = r.world.provinces.asArray
            let owned = provinces.indices.filter { provinces[$0].controller.asString == nation }
            let invaded = owned.filter { enemyAt(provinces[$0].id.asString) != nil }
            // The running native world's tactical policy, gated by its existing app-rule marker.
            if r.regimes.enabled.isTruthy, invaded.isEmpty, !ongoing, a.status.asString != "retreating",
               let hp = here.province, hp.controller.asString == nation {
                let threatened = hp.neighbors.asArray.contains { enemyAt($0.asString) != nil }
                let local = space.filter { $0.province?.id.asString == hp.id.asString && $0.army.nationId.asString == nation }.map { f in
                    let key = f.army.id.asString
                    return FrontGuard.Force(id: key, troops: f.army.troops.asInt,
                        available: !r.voyages.manualArmies.asArray.contains { $0.asString == key }
                            && !held.contains(Daily.key("army", key)) && r.reorganization.active[key].isNull
                            && f.army.status.asString != "retreating" && f.army.status.asString != "fighting"
                            && f.travel.status.asString != "moving")
                }
                if FrontGuard.choose(local, threatened: threatened) == id {
                    row.targetId = hp.id.clone(); row.garrisonId = hp.id.clone(); row.campaignId = .null
                    note("garrison", "相邻地区有敌军，保留一支部队守卫已控制州郡；威胁解除后重新部署。")
                    continue
                }
            }
            if a.status.asString != "retreating" && !en.isEmpty {
                for p in invaded { add(p) }
                for p in stateBorders(r, nation, enemySet) { add(p) }
                if invaded.isEmpty {
                    for (p, province) in provinces.enumerated() where province.controller.asString != nation && RunWindow.access(r, nation, province.controller.asString) {
                        if enemyAt(province.id.asString) != nil { add(p) }
                        for q in province.neighbors.asArray { if let qi = index(r, q.asString), enemySet.contains(provinces[qi].controller.asString) { add(qi) } }
                    }
                }
                for (p, province) in provinces.enumerated() where enemySet.contains(province.controller.asString) && geo.coasts.contains(p) { add(p) }
            }
            let location = g.location(bridge.travel(here.travel))
            guard let homeIndex = index(r, r.tactics.forces[id].homeId.asString) else { continue }
            let home = (provinces[homeIndex].center.x.asNumber, provinces[homeIndex].center.y.asNumber)
            var candidates = attack.map { p in
                ArmyAutonomy.Context.Target(id: p, x: provinces[p].center.x.asNumber, y: provinces[p].center.y.asNumber, feature: geo.provinceFeature[provinces[p].id.asString] ?? -1,
                                            protruding: CombatReader.protruding(r, p), port: ports.contains(provinces[p].id.asString))
            }
            if r.regimes.enabled.isTruthy, !invaded.isEmpty {
                let defense = candidates.filter { invaded.contains($0.id) }
                if !defense.isEmpty { candidates = defense }
            }
            var chosen: Int?, why = ""
            while !candidates.isEmpty {
                guard let p = ArmyAutonomy.Context.regularTarget(location.point, home, geo.cellFeature[location.cell], candidates) else { break }
                if let refused = reason(r, id, .move(province: p.id, retreat: false)) { why = refused; candidates.removeAll { $0.id == p.id }; continue }
                issue(r, id, .move(province: p.id, retreat: false)); chosen = p.id; break
            }
            if let p = chosen {
                let c = provinces[p].controller.asString, enemy = enemySet.contains(c) ? c : enemyAt(provinces[p].id.asString)!
                row.targetId = provinces[p].id.clone(); row.campaignId = JS(en.first { $0.nation == enemy }!.campaign); row.issuedTick = JS(tick)
                note(c == nation || RunWindow.access(r, nation, c) ? "supporting" : "attacking", "按原目标优先级选定真实陆地，并通过当前外交通行和海陆路径校验。")
                continue
            }
            if en.isEmpty, let hp = here.province, hp.controller.asString == nation {
                var gid: Int? = row.garrisonId.isNull ? nil : index(r, row.garrisonId.asString)
                if gid == nil { gid = chooseIdle(r, a, owned: owned, home: homeIndex, geo: geo) }
                if let gid {
                    let pid = provinces[gid].id.asString
                    row.garrisonId = JS(pid)
                    if hp.id.asString == pid {
                        if ongoing { halt() }
                        row.targetId = JS(pid); row.campaignId = .null; if row.issuedTick.isNull { row.issuedTick = JS(tick) }
                        note("garrison", "驻守已分配的本国地区，保留驻地，不每天重抽。"); continue
                    }
                    if let refused = reason(r, id, .move(province: gid, retreat: false)) { why = refused }
                    else {
                        issue(r, id, .move(province: gid, retreat: false))
                        row.targetId = JS(pid); row.campaignId = .null; row.issuedTick = JS(tick); note("garrison", "按原作首都圈与边境驻防权重部署，沿真实路线前往驻地。"); continue
                    }
                }
            }
            if let hp = here.province, hp.controller.asString == nation {
                if ongoing { halt() }
                note(attack.isEmpty ? "waiting" : "no-route", why.isEmpty ? "当前没有可执行的常规战争目标，留在本国驻地。" : why, clear: true); continue
            }
            let point = location.point
            let homes = owned.enumerated().sorted { x, y in
                let dx = jsHypot(provinces[x.element].center.x.asNumber - point.x, provinces[x.element].center.y.asNumber - point.y)
                let dy = jsHypot(provinces[y.element].center.x.asNumber - point.x, provinces[y.element].center.y.asNumber - point.y)
                return dx != dy ? dx < dy : x.offset < y.offset
            }.map(\.element)
            var returning = false
            for p in homes {
                if let refused = reason(r, id, .move(province: p, retreat: true)) { why = refused; continue }
                issue(r, id, .move(province: p, retreat: true))
                row.targetId = provinces[p].id.clone(); row.campaignId = .null; row.issuedTick = JS(tick); note("returning", "原目标已结束，从实际位置撤回本国。"); returning = true; break
            }
            if !returning {
                if ongoing && (here.province == nil || !RunWindow.atWar(r, nation, here.province!.controller.asString)) { halt() }
                note("no-route", why.isEmpty ? "暂时没有符合当前通行权的返乡路线，保留实际位置。" : why, clear: true)
            }
        }
        state.lastDay = r.world.day.clone(); state.revision = JS(state.revision.asNumber + 1)
    }
}
