import Foundation

/// The player's commands on the Swift run (culture47-orders applyMilitary47 for armies,
/// civilization47-political-owner applyPoliticalCommand47 for war and peace). Each returns the
/// web's reason text; nothing changes when a command is refused.
extension NativeEngine {
    /// Uses the existing fleet resolver: combat, access and sea routes stay authoritative.
    public func fleetOrder(fleetId: String, provinceIndex: Int?) -> (ok: Bool, reason: String) {
        let action: Naval.Command
        if let index = provinceIndex {
            guard run.world.provinces.asArray.indices.contains(index),
                  let port = Naval.sea?.ports.first(where: { $0.provinceId == run.world.provinces[index].id.asString }) else {
                return (false, "目标省份没有可用海港。")
            }
            action = .sail(port: port.id)
        } else { action = .halt }
        switch Naval.resolve(run, fleetId, action) {
        case .failure(let error): return (false, error.reason)
        case .success:
            guard Naval.issue(run, fleetId, action, player: true) else { return (false, "舰队军令未生效。") }
            return (true, provinceIndex == nil ? "舰队已在实际位置停止航行。" : "舰队已按真实海路前往目标港口。")
        }
    }

    /// A march to a province or a halt (provinceIndex < 0), as a player order: the army comes
    /// under manual control.
    /// `retreat`: the original 防御模式 — move as a retreat (does not seek battle on the way).
    public func order(armyId: String, provinceIndex: Int, retreat: Bool = false) -> (ok: Bool, reason: String) {
        let r = run
        let action: ArmyOrders.Action = provinceIndex < 0 ? .halt : .move(province: provinceIndex, retreat: retreat)
        if provinceIndex >= r.world.provinces.length { return (false, "目标不在当前地图的实际海陆网格中。") }
        switch ArmyOrders.resolve(r, armyId, action) {
        case .failure(let e): return (false, e.reason)
        case .success(let value):
            let reason = provinceIndex < 0 ? "在当前位置停止行军，保留这支军队和随身物资。" : "从当前位置前往\(value.name)；途中遇敌、失去通行权或断粮会改变进程。"
            ArmyOrders.issue(r, armyId, action, player: true)
            let row = r.armyAutonomy.armies[armyId]
            if !row.isNull {
                row.decision = JS("manual"); row.targetId = .null; row.garrisonId = .null; row.campaignId = .null
                row.issuedTick = r.clock.tick.clone(); row.nextTick = r.clock.tick.clone(); row.reason = JS("玩家军令生效，自主决策保留手动控制。")
                Vassals.bump(r.armyAutonomy)
            }
            return (true, reason)
        }
    }

    /// declareWar47 (territorial conquest) or settleWar47 type 11 (white peace) between two states.
    public func politics(declare: Bool, _ a: Int, _ b: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(a), nations.indices.contains(b), a != b else { return (false, "外交命令无效。") }
        let ida = nations[a].id.asString, idb = nations[b].id.asString
        if declare {
            guard let engine = Session.engine else { return (false, "外交数据尚未载入。") }
            if let refused = DiplomacyBridge.declareWar(r, ida, idb, engine: engine) { return (false, refused) }
            if !r.reigns47.isNull {
                if r.forcedWars47.isNull { r.forcedWars47 = .array() }
                r.forcedWars47.push(r.nativeWars.campaigns.asArray.last!.id.clone())
            }
            War26.reconcileForces(r, [])
            Government.reconcileContinuity(r); DiplomacyBridge.reconcile(r)
            return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "")
        }
        let s = r.nativeWars
        guard let c = s.campaigns.asArray.first(where: { $0.endedTick.isNull && Wars.coversPair($0, s, ida, idb) }) else { return (false, "两国当前没有可结束的战争。") }
        _ = PeaceBridge.settle(r, c, reason: 11)
        Government.reconcileContinuity(r); DiplomacyBridge.reconcile(r)
        return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "")
    }

    /// Province sheet (engine.ts province()).
    public func province(_ index: Int) -> Data? {
        let r = run, w = r.world
        guard w.provinces.asArray.indices.contains(index) else { return nil }
        let p = w.provinces[index], id = p.id.asString
        let stock = w.statecraft.provinces.asArray.first { $0.provinceId.asString == id }
        func nation(_ s: String?) -> Int { s.flatMap { s in w.nations.asArray.firstIndex { $0.id.asString == s } } ?? -1 }
        let o = JS.object()
        o.population = JS(stock?.population.optionalNumber ?? 0); o.grain = JS(stock?.grain.optionalNumber ?? 0)
        o.capacity = JS(r.finance.provinces[id].maxPopulation.optionalNumber ?? 0); o.supply = p.supply.isNull ? JS(0) : p.supply
        o.controller = JS(nation(p.controller.optionalString)); o.owner = JS(nation(p.legalOwner.optionalString ?? p.controller.optionalString))
        // What the engine already weighs for this land: core (near the state's heart: +15% defence),
        // the fortification level, mountain ground and its biomes (combat), local income (governor).
        let d = r.upperCombat.provinces[id], holder = r.upperCombat.nations[p.controller.optionalString ?? ""]
        let distance = d.distance.optionalNumber ?? 2147483647
        o.core = JS(!holder.isNull && distance != 2147483647 && distance <= (holder.coreThreshold.optionalNumber ?? 0))
        o.defense = JS(d.isNull ? 1 : min(10, max(1, d.storedDefense.optionalNumber ?? 1)))
        let land = r.terrainContext.provinces[id]
        o.mountain = JS(land.mountain.isTruthy)
        o.biomes = land.isNull || land.biomes.isNull ? .array() : land.biomes
        o.income = JS(Offices.localIncome(r, id))
        // 地形 and the pace an army marches over it (app rules), from the province's main biome.
        let ratios = land.isNull || land.biomes.isNull ? [] : land.biomes.asArray.map(\.asNumber)
        let main = ratios.indices.max { ratios[$0] < ratios[$1] } ?? 4
        o.terrain = JS(["海滨", "炎热荒漠", "寒冷荒漠", "稀树草原", "草原", "热带季雨林", "温带森林", "热带雨林", "温带雨林", "针叶林", "苔原", "冰川", "沼泽"][min(12, main)])
        o.pace = JS(land.mountain.isTruthy ? 0.5 : ForceMotion.terrainSpeed[min(ForceMotion.terrainSpeed.count - 1, main)])
        // 特产 (app rules) and its index for the custom picker.
        let good = Trade.of(r, id)
        o.specialty = JS(Trade.goods[good]); o.specialtyIndex = JS(good)
        if let city = w.cities.asArray.first(where: { $0.provinceId.asString == id }) { o.cityCulture = r.civilization.cities[city.id.asString].cultureId }
        // 地利: what this land does to each of the original's arms in battle (Efficiency's terrain
        // tables, the same numbers the volleys use), attacking into it and defending it.
        o.combat = .array([("Infantry", "步兵"), ("Archer", "弓兵"), ("Shield", "盾兵"), ("Cavalry", "骑兵"), ("Elite", "精锐")].map { key, name in
            let x = JS.object(); x.unit = JS(name)
            x.attack = JS(Efficiency.unitModifier(unit: key, attacking: true, ratios: ratios, mountain: land.mountain.isTruthy))
            x.defense = JS(Efficiency.unitModifier(unit: key, attacking: false, ratios: ratios, mountain: land.mountain.isTruthy))
            return x
        })
        return Data(o.json.utf8)
    }

    /// The remaining route of an army in map units (remainingArmyTravelPoints47 / scale).
    public func route(armyId: String) -> [[Double]] {
        let r = run, t = r.armyPositions.records[armyId]
        guard !t.isNull, let bridge = Armies.bridge else { return [] }
        let g = bridge.graph, travel = bridge.travel(t), sc = r.scale.asNumber
        var points = [g.location(travel).point]
        if travel.status == .moving {
            func add(_ p: TravelPoint) { if let l = points.last, l.x == p.x && l.y == p.y { return }; points.append(p) }
            if let d = travel.destination, travel.nodes.count == 1 { add(d) }
            else { for leg in travel.leg..<max(travel.leg, travel.nodes.count - 1) { var at = travel; at.leg = leg; if let seg = g.segment(at), !seg.local { if leg != travel.leg || !travel.crossed { add(seg.gate) }; add(seg.end) } } }
        }
        return points.map { [$0.x / sc, $0.y / sc] }
    }
}

extension DiplomacyBridge {
    /// declareWar47: the player's territorial conquest with the web's checks; nil when declared.
    public static func declareWar(_ r: JS, _ attacker: String, _ defender: String, engine: DeclarationEngine) -> String? {
        let nations = r.world.nations.asArray
        guard let ai = nations.firstIndex(where: { $0.id.asString == attacker }), let di = nations.firstIndex(where: { $0.id.asString == defender }) else { return "宣战双方无效或已交战。" }
        var w = world(r)
        let known = w.relations.count
        var c = DeclarationEngine.Context(engine: engine, world: w)
        guard let a = c.states.firstIndex(where: { $0.index == ai }), let b = c.states.firstIndex(where: { $0.index == di }),
              !c.states[a].dead, !c.states[b].dead, a != b, !c.atWar(a, b) else { return "宣战双方无效或已交战。" }
        let truce = c.w.truce(c.relation(a, b))
        if truce.blocked { return "停战期尚未结束（\(truce.required) 年规则）。" }
        if c.states[a].vassal || c.w.overlordOf(di) == ai { return "附庸不能自主发动外战，宗主不能向自己的附庸宣战；可先解除关系。" }
        guard let cb = c.usable(1, a, b) else { return "两国没有可争夺的相邻土地或外交海域。" }
        let goals = c.goals(cb, a, b)
        if goals.isEmpty { return "没有可执行的陆地或跨海进攻路线。" }
        guard let war = c.start(a, b, cb: cb.id, goals: goals) else {
            // start() declines quietly, except when the two sides cannot face each other
            // (buildParticipants47 throws its own reason).
            let relation = c.w.statecraft.first { [$0.a, $0.b].contains(ai) && [$0.a, $0.b].contains(di) }
            if let relation, !relation.war, !c.w.truce(c.relation(a, b)).blocked, c.claimEntry(a, b) != nil {
                let members = c.sides(attacker: a, defender: b)
                if members.first(where: { $0.state == c.states[a].id })?.side != 0 || members.first(where: { $0.state == c.states[b].id })?.side != 1 { return "主攻与主守不能组成相对战方。" }
            }
            return "没有可执行的陆地或跨海进攻路线。"
        }
        w = c.w
        mirrorRelations(r, w, from: known)
        r.nativeDiplomacy.rng = JS(Double(w.rng)); r.nativeDiplomacy.draws = JS(w.draws)
        _ = start(r, war)
        return nil
    }
}

extension NativeEngine {
    /// applyRtsOrder47 (原作 RTSController 即时战略模式): the selected armies of one state move to the
    /// province together — attack mode marches and fights on the way, defend mode moves as a retreat.
    /// Armies of another state, gone, or with no way there are skipped; at least one must move.
    public func rtsOrder(armyIds: [String], nation: Int, province: Int, defend: Bool) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard r.world.provinces.asArray.indices.contains(province) else { return (false, "目标行省不存在。") }
        guard nations.indices.contains(nation) else { return (false, "即时战略命令无效。") }
        let state = nations[nation].id.asString
        var moved = 0
        for id in armyIds {
            guard let a = r.world.armies.asArray.first(where: { $0.id.asString == id }), a.nationId.asString == state,
                  a.troops.asNumber > 0, a.status.asString != "destroyed" else { continue }
            let action = ArmyOrders.Action.move(province: province, retreat: defend)
            guard case .success = ArmyOrders.resolve(r, id, action) else { continue }
            ArmyOrders.issue(r, id, action, player: true)
            let row = r.armyAutonomy.armies[id]
            if !row.isNull {
                row.decision = JS("manual"); row.targetId = .null; row.garrisonId = .null; row.campaignId = .null
                row.issuedTick = r.clock.tick.clone(); row.nextTick = r.clock.tick.clone(); row.reason = JS("即时战略模式：玩家直接指挥。")
            }
            moved += 1
        }
        if moved == 0 { return (false, "选中的军团都无法前往该行省。") }
        Vassals.bump(r.armyAutonomy)
        return (true, "\(moved) 支军团\(defend ? "以防御模式撤往" : "以进攻模式前往")\(r.world.provinces[province].name.asString)。")
    }

    /// The state's own history: chronicle entries naming it, newest first.
    public func nationHistory(_ index: Int, limit: Int = 60) -> Data {
        let r = run
        guard r.world.nations.asArray.indices.contains(index) else { return Data("[]".utf8) }
        let id = r.world.nations[index].id.asString
        let rows = r.chronicle.entries.asArray.reversed().filter { e in !e.nationIds.isNull && e.nationIds.asArray.contains { $0.asString == id } }.prefix(limit)
        return Data(JS.array(rows.map { e in let o = JS.object(); o.day = e.day; o.text = e.text; o.kind = e.kind; return o }).json.utf8)
    }
}
