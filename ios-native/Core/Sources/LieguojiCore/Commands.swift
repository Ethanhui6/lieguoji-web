import Foundation

/// The player's commands on the Swift run (culture47-orders applyMilitary47 for armies,
/// civilization47-political-owner applyPoliticalCommand47 for war and peace). Each returns the
/// web's reason text; nothing changes when a command is refused.
extension NativeEngine {
    /// Uses the existing fleet resolver: combat, access and sea routes stay authoritative.
    public func fleetOrder(fleetId: String, provinceIndex: Int?) -> (ok: Bool, reason: String) {
        let action: Naval.Command
        var portId: String? = nil, provinceId: String? = nil
        if let index = provinceIndex {
            guard run.world.provinces.asArray.indices.contains(index),
                  let port = Naval.sea?.ports.first(where: { $0.provinceId == run.world.provinces[index].id.asString }) else {
                return (false, "目标省份没有可用海港。")
            }
            portId = port.id; provinceId = port.provinceId
            action = .sail(port: port.id)
        } else { action = .halt }
        switch Naval.resolve(run, fleetId, action) {
        case .failure(let error): return (false, error.reason)
        case .success(let resolved):
            guard Naval.issue(run, fleetId, action, player: true) else { return (false, "舰队军令未生效。") }
            let row = run.navalAutonomy.fleets[fleetId], order = run.portControl.fleets[fleetId]
            let nation = resolved.fleet.nationId.asString
            if let pid = provinceId, let portId {
                let occ = run.portControl.ports[pid].occupierId.optionalString ?? ""
                let attacking = !occ.isEmpty && occ != nation && RunWindow.atWar(run, nation, occ)
                if !row.isNull {
                    row.assignedPortId = JS(portId)
                    row.decision = JS(attacking ? "attacking" : "manual")
                    row.reason = JS(attacking ? "玩家军令：跨海夺取敌方海港并实施海上封锁。" : "玩家军令：按真实海路驶往目标港口驻泊。")
                }
                if !order.isNull {
                    order.targetId = attacking ? JS(pid) : .null
                    order.active = JS(attacking)
                }
                return (true, attacking ? "舰队已起航，跨海夺取并封锁\(resolved.name)。" : "舰队已按真实海路前往\(resolved.name)。")
            } else {
                if !row.isNull { row.assignedPortId = .null; row.decision = JS("manual"); row.reason = JS("玩家军令：在当前海域下锚待命。") }
                if !order.isNull { order.targetId = .null; order.active = JS(false) }
                return (true, "舰队已在实际位置停止航行。")
            }
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
            if Regimes.unconquerable(r, ida) || Regimes.unconquerable(r, idb) { return (false, "无主之地不可征服。") }
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
        // 总督, 封地世家 and 民心 (the chance this province rises at a rebellion check).
        if let owner = p.controller.optionalString {
            if let g = Offices.holder(r, owner, "Governor", index + 1) {
                o.governor = personView(g, role: "").name; o.governorFit = JS(Offices.suitability(r, owner, "Governor", index + 1))
            }
            if !r.nobility.isNull, let fam = Nobility.holder(r.nobility, id) {
                let surname = r.kin.families[fam].surname.optionalString ?? ""
                o.house = JS(surname.isEmpty ? "无名氏" : surname + "氏")
            }
            if !r.foundings.isNull, r.foundings.enabled.isTruthy, let chance = Rebellion.provinceChance(r, owner, id) { o.unrest = JS(chance) }
            if let d = Regimes.disasterAt(r, id) { o.disaster = JS(d) }
            // 信仰: this province's own, when it differs from its holder's.
            if let f = Regimes.provinceFaith(r, p), f != r.civilization.nations[owner].religionId.optionalString {
                o.faith = JS(Regimes.creeds[f]?.name ?? f); o.heresy = JS(Regimes.creeds[f]?.heresy == true)
            }
            // 海上封锁: an enemy fleet holds this province's port.
            if !r.portControl.isNull, !r.portControl.ports.isNull, let fleet = r.portControl.ports[id].occupierId.optionalString, fleet != owner, RunWindow.atWar(r, owner, fleet) {
                o.blockade = JS(nation(fleet))
            }
        }
        // 城市防御力 and 占领进度: each siege of this province (resistance left of its maximum).
        let sieges = r.occupation.isNull || r.occupation.sieges.isNull ? [] : r.occupation.sieges.asArray.filter { $0.provinceId.asString == id }
        o.sieges = .array(sieges.map { s in
            let x = JS.object(); x.nation = JS(nation(s.attacker.optionalString)); x.resistance = JS(s.resistance.optionalNumber ?? 0); x.maximum = JS(s.maximum.optionalNumber ?? 0); return x
        })
        // 地形 and the pace an army marches over it (app rules), from the province's main biome.
        let ratios = land.isNull || land.biomes.isNull ? [] : land.biomes.asArray.map(\.asNumber)
        let main = ratios.indices.max { ratios[$0] < ratios[$1] } ?? 4
        let isMtn = land.mountain.isTruthy
        let tProf = ForceMotion.terrainProfile(biome: main, mountain: isMtn)
        let curSeason = WorldSeason.of(month: r.life.currentDate.month.asInt)
        o.terrain = JS(["海滨", "炎热荒漠", "寒冷荒漠", "稀树草原", "草原", "热带季雨林", "温带森林", "热带雨林", "温带雨林", "针叶林", "苔原", "冰川", "沼泽"][min(12, main)])
        o.pace = JS(UnitKinds.enabled ? tProf.speed : (isMtn ? 0.5 : ForceMotion.terrainSpeed[min(ForceMotion.terrainSpeed.count - 1, main)]))
        o.terrainTax = JS(tProf.tax)
        o.terrainAttrition = JS(tProf.attritionLabel)
        o.terrainDefense = JS(tProf.defenseBonus)
        o.terrainSummary = JS(tProf.summary)
        // 州郡繁盛度、战略定位与当令节气实效（均由真实人口、存粮、总督、港口、围城与灾荒动态算出）
        let popVal = stock?.population.asNumber ?? 0
        let capVal = max(1.0, r.finance.provinces[id].maxPopulation.asNumber)
        let grainVal = stock?.grain.asNumber ?? 0
        let hasPort = !r.portControl.isNull && !r.portControl.ports.isNull && !r.portControl.ports[id].isNull
        let govFit = o.governorFit.optionalNumber ?? 0
        let occupied = o.owner.asInt != o.controller.asInt
        let popScore: Double = min(1.0, popVal / capVal) * 44.0
        let grainScore: Double = min(1.0, grainVal / max(800.0, popVal * 0.25)) * 18.0
        var prosp = Int((popScore + grainScore).rounded())
        if o.core.isTruthy { prosp += 10 }
        if hasPort { prosp += 10 }
        if govFit >= 0.4 { prosp += 14 } else if govFit < 0 { prosp -= 8 }
        if !sieges.isEmpty { prosp -= 26 }
        if occupied { prosp -= 18 }
        if !o.disaster.isNull { prosp -= 22 }
        if !o.blockade.isNull { prosp -= 12 }
        if (o.unrest.optionalNumber ?? 0) >= 35 { prosp -= 10 }
        prosp = max(5, min(100, prosp))
        o.prosperity = JS(prosp)
        o.prosperityLabel = JS(prosp >= 80 ? "殷富繁华" : prosp >= 62 ? "安居乐业" : prosp >= 44 ? "民生尚可" : prosp >= 26 ? "凋敝承创" : "战火残破")
        let role: String = {
            if isMtn || d.manualFortress.isTruthy || (o.defense.optionalNumber ?? 1) >= 3 { return "咽喉雄关" }
            if hasPort { return "通海良港" }
            if (main == 4 || main == 3) && capVal >= 12000 { return "鱼米沃野" }
            if main == 1 || main == 2 || main == 10 || main == 11 || main == 12 { return "边荒险地" }
            if main >= 5 && main <= 9 { return "林莽要冲" }
            return "腹心州郡"
        }()
        o.strategicRole = JS(role)
        o.seasonName = JS(curSeason.fullName)
        let coldLand = isMtn || main == 10 || main == 11 || main == 2
        let sNote: String = {
            switch curSeason {
            case .winter:
                return coldLand ? "隆冬严寒：山原积雪封道，客军粮耗 +45% 并加剧冻伤减员" : "隆冬休兵：本州月税 −10%，敌军粮秣补给吃紧"
            case .spring:
                return "仲春复苏：友军休整补给加快（+25%），雪融水丰"
            case .summer:
                return (main == 1) ? "盛夏酷暑：大漠烈日炙烤，行军补给仍需严密筹措" : "盛夏畅行：官道通畅，正宜行军与大举出征"
            case .autumn:
                return "金秋丰稔：秋收充盈，本州月税增收 +12% 且军粮充足"
            }
        }()
        o.seasonNote = JS(sNote)
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

    /// The remaining route of an army or fleet in map units (remainingArmyTravelPoints47 / scale).
    public func route(armyId: String) -> [[Double]] {
        let r = run
        let t = !r.armyPositions.records[armyId].isNull ? r.armyPositions.records[armyId] : r.fleetPositions.records[armyId]
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
        // The player is above the truces in app worlds (god mode): only the AI waits them out.
        DiplomacyWorld.ignoreTruce = r.regimes.enabled.isTruthy
        defer { DiplomacyWorld.ignoreTruce = false }
        let known = w.relations.count
        var c = DeclarationEngine.Context(engine: engine, world: w)
        guard let a = c.states.firstIndex(where: { $0.index == ai }), let b = c.states.firstIndex(where: { $0.index == di }),
              !c.states[a].dead, !c.states[b].dead, a != b, !c.atWar(a, b) else { return "宣战双方无效或已交战。" }
        let truce = c.w.truce(c.relation(a, b))
        if truce.blocked { return "停战期尚未结束（\(truce.required) 年规则）。" }
        if c.states[a].vassal || c.w.overlordOf(di) == ai { return "附庸不能自主发动外战，宗主不能向自己的附庸宣战；可先解除关系。" }
        // God mode: a state with no land to contest next to the other may still be sent to war on any other
        // casus belli it holds (annexation, cultural unity, forced conversion, colonisation).
        guard let cb = c.usable(1, a, b) ?? (r.regimes.enabled.isTruthy ? [2, 6, 7, 8, 3].lazy.compactMap({ c.usable($0, a, b) }).first : nil) else { return "两国没有可争夺的相邻土地或外交海域。" }
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

    /// The state's own history: chronicle entries naming it, newest first (with province index for map locate).
    public func nationHistory(_ index: Int, limit: Int = 80) -> Data {
        let r = run
        guard r.world.nations.asArray.indices.contains(index) else { return Data("[]".utf8) }
        let id = r.world.nations[index].id.asString
        var pi = [String: Int]()
        for (i, p) in r.world.provinces.asArray.enumerated() { pi[p.id.asString] = i }
        var capProv: Int?
        if let cid = r.world.nations[index].capitalId.optionalString,
           let city = r.world.cities.asArray.first(where: { $0.id.optionalString == cid }) {
            capProv = pi[city.provinceId.asString]
        }
        let rows = r.chronicle.entries.asArray.reversed().filter { e in !e.nationIds.isNull && e.nationIds.asArray.contains { $0.asString == id } }.prefix(limit)
        return Data(JS.array(rows.map { e in
            let o = JS.object()
            o.day = e.day; o.text = e.text; o.kind = e.kind
            if let reason = e.reason.optionalString, !reason.isEmpty { o.reason = JS(reason) }
            if let pid = e.provinceId.optionalString, let idx = pi[pid] { o.province = JS(idx) }
            else if let capProv { o.province = JS(capProv) }
            return o
        }).json.utf8)
    }
}
