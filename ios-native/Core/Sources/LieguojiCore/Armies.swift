import Foundation

/// Armies on the run state: where each live army stands (army-space47), new armies with every record
/// they need (civilization47-monthly-muster createForce47) and the monthly muster (musterMonth47).
public enum Armies {
    static let f = Native.fr
    /// The force bridge (travel graph) of the running world.
    public static var bridge: ForceBridge?
    /// The travel cell under each province centre (locateTravelCell47 of the province's centre).
    public static var homeCells = [String: Int]()

    // MARK: Army space (readArmySpace47)
    public struct Located { public let army: JS; public let travel: JS; public let province: JS?; public let cell: Int }
    public static func space(_ r: JS) -> [Located] {
        guard let bridge else { return [] }
        var out = [Located]()
        // Each army's cell, kept per travel record: every move writes a new record object (positions are
        // never edited in place), so a record seen before stands where it stood. The record is held, so
        // its identity cannot be reused. The world is read several times a tick; decoding every army's
        // path each time was the largest share of a day on maps of a few hundred armies.
        if spaceWorld != ObjectIdentifier(r) { spaceCache = [:]; spaceWorld = ObjectIdentifier(r) }
        let provinces = r.world.provinces
        for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" {
            let id = a.id.asString, t = r.armyPositions.records[id]
            let cell: Int
            if let c = spaceCache[id], c.record === t { cell = c.cell }
            else { cell = bridge.graph.location(bridge.travel(t)).cell; spaceCache[id] = (t, cell) }
            let q = Int(bridge.graph.provinces[cell])
            out.append(Located(army: a, travel: t, province: q >= 0 ? provinces[q] : nil, cell: cell))
        }
        if spaceCache.count > out.count * 2 + 64 {
            let live = Set(out.map { $0.army.id.asString })
            spaceCache = spaceCache.filter { live.contains($0.key) }
        }
        return out
    }
    static var spaceCache = [String: (record: JS, cell: Int)]()
    static var spaceWorld: ObjectIdentifier?
    /// landHolders47: armies standing on the province's land, retreaters excluded.
    public static func landHolders(_ space: [Located], _ province: String) -> [JS] {
        space.filter { $0.province?.id.asString == province && $0.army.status.asString != "retreating" }.map(\.army)
    }

    // MARK: New armies (createForce47)
    static func stateTraits(_ r: JS, _ id: String) -> [String] {
        if r.stateTraits47.isNull { return [] }
        let l = r.stateTraits47[id]
        return l.isNull ? Government.generateStateTraits(r.world.custom.seed.asString, id) : l.asArray.map(\.asString)
    }
    static func damageTraits(_ r: JS, _ id: String) -> [String] {
        if !r.stateTraits47.isNull { let t = stateTraits(r, id); return ["FieldCombatElite", "SiegeCapture"].filter { t.contains($0) } }
        let d = r.combatPersonnel.nations[id].damageTraits
        return d.isNull ? [] : d.asArray.map(\.asString)
    }
    static func speed(seed: String, armyId: String, nationId: String, tick: Int, cavalry: Bool) -> Double {
        func json(_ s: String) -> String { "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }
        let h = People.nameSeed("[\(json(seed)),\(json(armyId)),\(json(nationId)),\(tick),\"army-speed47\"]")
        let draw = f(Double(h) / 4294967296), ordinary = f(f(f(0.7) + f(f(f(1.1) - f(0.7)) * draw)) * f(1.5))
        return cavalry ? f(1.9499999284744263) : ordinary
    }
    static func median(_ r: JS) -> Double {
        let values = r.world.statecraft.provinces.asArray.map(\.population.asNumber).sorted(), mid = values.count >> 1
        return values.count % 2 == 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2
    }
    public static func strength(_ r: JS, _ home: String) -> Int {
        Muster.legionStrength(r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == home }!.population.asNumber, median: median(r))
    }
    @discardableResult
    public static func create(_ r: JS, nation: String, home: String, kind: String) -> Int {
        let t = r.tactics
        var id: String
        repeat { id = "force-\(t.nextArmyId.asInt)"; t.nextArmyId = JS(t.nextArmyId.asNumber + 1) } while t.forces.has(id)
        let p = r.world.provinces.asArray.first { $0.id.asString == home }!, cell = homeCells[home]!
        // 天下规则: the world's levy size scales new armies (app rules only).
        let troops = UnitKinds.enabled ? max(1, Int((Double(strength(r, home)) * Regimes.rule(r, "levy")).rounded())) : strength(r, home)
        var unit = Muster.units[(t.nextArmyId.asInt - 2) % Muster.units.count]
        // App rules: the state's culture decides its arms, unique troops included.
        if UnitKinds.enabled {
            let k = UnitKinds.pick(culture: r.civilization.nations[nation].cultureId.optionalString ?? "", id: id)
            unit = Muster.Unit(key: k.key, name: k.name)
        }
        let name = r.world.cities.asArray.first { $0.provinceId.asString == home }?.name.asString ?? p.name.asString
        let a = JS.object()
        a.id = JS(id); a.name = JS(name + (kind == "emergency" ? "动员" : "") + unit.name); a.nationId = JS(nation); a.provinceId = JS(home); a.originId = JS(home)
        a.troops = JS(troops); a.morale = JS(80); a.supplies = JS(100); a.status = JS("idle"); a.route = .array(); a.progress = JS(0)
        r.world.armies.push(a)
        r.units[id] = JS(unit.key)
        let force = JS.object(); force.homeId = JS(home); force.kind = JS(kind); force.fullStrength = JS(troops); t.forces[id] = force
        let travel = JS.object()
        travel.version = JS(1); travel.armyId = JS(id); travel.origin = p.center.clone(); travel.nodes = .array([JS(cell)]); travel.leg = JS(0); travel.offset = JS(0); travel.crossed = JS(false); travel.status = JS("arrived")
        r.armyPositions.records[id] = travel
        let tick = r.clock.tick.asInt, cavalry = stateTraits(r, nation).contains("CavalryTradition")
        let s = JS.object(); s.nationAtInitialization = JS(nation); s.initializedTick = JS(tick); s.cavalryTradition = JS(cavalry)
        s.base = JS(speed(seed: r.world.custom.seed.asString, armyId: id, nationId: nation, tick: tick, cavalry: cavalry)); r.forceSpeed.armies[id] = s
        let traits = damageTraits(r, nation)
        let c = JS.object(); c.nationAtInitialization = JS(nation); c.initializedTick = JS(tick); c.command = JS("central"); c.damageTraitsAtInitialization = .array(traits.map { JS($0) })
        c.damageToArmy = JS(f((traits.contains("FieldCombatElite") ? f(1.5) : 1) * 40)); c.damageToProvince = JS(f((traits.contains("SiegeCapture") ? f(1.5) : 1) * 10)); r.combatPersonnel.armies[id] = c
        let d = JS.object(); d.targetId = .null; d.garrisonId = .null; d.campaignId = .null; d.decision = JS("waiting"); d.nextTick = JS(0); d.issuedTick = .null; d.reason = JS("等待自主军令评估。")
        r.armyAutonomy.armies[id] = d
        let u = JS.object(); u.base = JS(f(f(1) * 1.25)); u.initializedTick = JS(tick); r.upperCombat.armies[id] = u
        return troops
    }

    // MARK: Monthly muster (musterMonth47)
    public static func muster(_ r: JS) {
        let day = r.world.day.asInt, month = day / 30
        if day % 30 != 0 || r.dailyEconomy.lastMusterMonth.asInt >= month { return }
        Wars.reconcileCore(r)
        func atWar(_ a: String, _ b: String) -> Bool { a != b && Wars.relation(r, a, b)?.status.asString == "war" }
        func safe(_ province: String, _ nation: String) -> Bool { !landHolders(space(r), province).contains { atWar($0.nationId.asString, nation) } }
        func alive(_ a: JS) -> Bool { a.troops.asNumber > 0 && a.status.asString != "destroyed" }
        for n in r.world.nations.asArray {
            let id = n.id.asString, owned = r.world.provinces.asArray.filter { $0.controller.asString == id }, land = owned.filter { $0.legalOwner.asString == id }
            // App worlds: this map's provinces are far larger and fewer than the original's, so a state
            // keeps up to two standing armies a province and one and a half per province in all (the original:
            // one a province, two thirds of them), for armies as numerous as the original's.
            // App worlds raise more: up to three a province at home and 2.2 a province in all (900 in the world).
            let app = UnitKinds.enabled, perHome = app ? Tuning.current.armiesAtHome : 1, globalCap = app ? Tuning.current.armyCap : 500
            // Large maps (over 80 provinces): fewer armies a province, falling with the square root of the
            // map's size (240 provinces: 0.58 of the rate), so the world holds about as many columns on the
            // move as the original's maps do and a day of marching stays affordable.
            let scale = app ? min(1, (80 / Double(max(80, r.world.provinces.length))).squareRoot()) : 1
            let cap = land.isEmpty ? 0 : max(1, Int((Double(land.count) * f(app ? Tuning.current.armiesPerProvince * scale : 2.0 / 3.0)).rounded(.down)))
            var formed = 0, cost = 0
            // Counted once per state and kept current as armies form (the loop used to refilter every army
            // and rebuild every army's position for each province). Same results: a new army is this
            // state's, regular, at home in its province, and its own armies never make a province unsafe.
            let live = r.world.armies.asArray.filter(alive)
            var standing = live.filter { $0.nationId.asString == id && r.tactics.forces[$0.id.asString].kind.asString != "emergency" }.count
            var atHome = [String: Int](); for a in live { atHome[r.tactics.forces[a.id.asString].homeId.asString, default: 0] += 1 }
            var total = r.world.armies.length
            let here = space(r)
            func safeHere(_ province: String) -> Bool { !landHolders(here, province).contains { atWar($0.nationId.asString, id) } }
            for p in land {
                if standing >= cap || total >= globalCap { break }
                if !safeHere(p.id.asString) || (atHome[p.id.asString] ?? 0) >= perHome { continue }
                let data = r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == p.id.asString }!
                let required = Int((Double(strength(r, p.id.asString)) / 10 + 0.5).rounded(.down))
                if data.population.asNumber < Double(required) { continue }
                create(r, nation: id, home: p.id.asString, kind: "regular"); data.population = JS(data.population.asNumber - Double(required)); formed += 1; cost += required
                standing += 1; atHome[p.id.asString, default: 0] += 1; total += 1
            }
            if formed > 0 { People.announce(r, kind: "diplomacy", text: "\(n.name.asString)新编\(formed)支常备军", reason: "按故乡编制征集，本次扣内部人口\(cost)；每支新军同时建立真实位置、速度和基础战力记录。", nations: [id], province: nil) }
            let war = r.world.statecraft.relations.asArray.contains { ($0.a.asString == id || $0.b.asString == id) && $0.status.asString == "war" }
            if !war {
                let sp = space(r)
                let total = r.world.armies.asArray.filter { alive($0) && $0.nationId.asString == id && r.tactics.forces[$0.id.asString].kind.asString == "emergency" }.count
                let eligible = sp.filter { v in v.army.nationId.asString == id && v.army.status.asString == "idle" && r.tactics.forces[v.army.id.asString].kind.asString == "emergency"
                    && v.province?.controller.asString == id && ["arrived", "halted"].contains(v.travel.status.asString) }
                let limit = Int((Double(total) * 0.1).rounded(.up))
                for v in eligible.prefix(limit) {
                    let a = v.army
                    a.troops = JS(0); a.status = JS("destroyed"); a.morale = JS(0); a.supplies = JS(0); a.route = .array(); a.progress = JS(0)
                    let t = v.travel.clone(); t.status = JS("halted"); r.armyPositions.records[a.id.asString] = t
                    r.battles.plans.delete(a.id.asString); r.reorganization.active.delete(a.id.asString); r.tactics.rounds.delete(a.id.asString)
                }
                let count = min(eligible.count, limit)
                if count > 0 { People.announce(r, kind: "diplomacy", text: "\(n.name.asString)遣散\(count)支应急军", reason: "和平月结，仅遣散实际回到本国陆地停驻的应急军；海上、在途或尚未归国者保留。不记作战死。", nations: [id], province: nil) }
                continue
            }
            let history = r.tactics.mobilizations[id]
            if !history.lastMonth.isNull && month - history.lastMonth.asInt < 12 || history.recent.length == 3 && month - history.recent[0].asInt < 60 { continue }
            let threshold = r.upperCombat.nations[id].coreThreshold.asNumber
            let cores = owned.filter { r.upperCombat.provinces[$0.id.asString].distance.asNumber <= threshold }, ids = Set(cores.map(\.id.asString))
            if !cores.contains(where: { c in c.neighbors.asArray.contains { nb in !ids.contains(nb.asString) && atWar(id, r.world.provinces.asArray.first { $0.id.asString == nb.asString }!.controller.asString) } }) { continue }
            let leaderId = r.people.nations[id].leaderId
            let traits: [Muster.Trait]? = leaderId.isNull ? nil : r.people.persons[leaderId.asInt.description].traits.asArray.map { t in
                let x = Nobility.trait(t.asString); return Muster.Trait(modifier: x?.emergencyMobilizationModifier.optionalNumber ?? 0, allowed: x?.canEmergencyMobilization.optionalBool != false)
            }
            let q = Muster.emergencyQuantity(destiny: r.destiny.nations[id].destiny.asNumber, traits: traits)
            let places = (cores.isEmpty ? owned : cores).filter { safe($0.id.asString, id) }
            if !q.allowed || q.count < 0 || places.isEmpty || r.world.armies.length + q.count > 500 { continue }
            history.lastMonth = JS(month); history.recent = .array(Array((history.recent.asArray.map(\.asInt) + [month]).suffix(3)).map { JS($0) })
            for _ in 0..<q.count {
                let seed = UInt32(truncatingIfNeeded: Int64(t(r).seed.asNumber)) &* 1664525 &+ 1013904223
                t(r).seed = JS(Double(seed))
                create(r, nation: id, home: places[Int(seed % UInt32(places.count))].id.asString, kind: "emergency")
            }
            if q.count > 0 { People.announce(r, kind: "diplomacy", text: "\(n.name.asString)进行一次紧急动员，征招\(q.count)个军团", reason: "原月检国运与君主特性决定数量；网页按安全核心集结、保留年度与五年冷却，不扣常备兵源或粮储。", nations: [id], province: nil) }
        }
        r.dailyEconomy.lastMusterMonth = JS(month)
    }
    static func t(_ r: JS) -> JS { r.tactics }
}
