import Foundation

/// The daily settlement on the run state (civilization47-daily settleCivilizationDayCore47): the day
/// advances; month starts age people and refresh the leader's enemy modifier; grain is produced and
/// eaten, armies refilled; armies stay fed, rebuild at home, retire and recover; month ends collect
/// taxes; the autonomous orders run; then muster and destiny; contacts and attack clocks are settled.
public enum Daily {
    static let f = Native.fr
    static let dayFactor = 1.0 / 30
    /// The autonomous army orders of the day (issueAutonomousArmyOrders47), set by the engine.
    public static var dailyOrders: ((JS) -> Void)?

    // MARK: Contacts and attack clocks (force-tick47 frame / reconcileMilitaryClock47)
    static func key(_ kind: String, _ id: String) -> String { "[\"\(kind)\",\"\(id)\"]" }
    /// frame(): contacts reconciled into the run, and the forces eligible to attack.
    @discardableResult
    public static func frame(_ r: JS) -> (eligible: Set<String>, held: Set<String>) {
        guard let bridge = Armies.bridge else { return ([], []) }
        let forces = Profile.measure("f.forces") { bridge.forces(r) }
        let result = Profile.measure("f.contacts") { ContactMotion(graph: bridge.graph).contacts(forces, bridge.contacts(r), bridge.rules(r)) }
        Profile.measure("f.write") { r.forceContacts.pairs = .array(result.contacts.map(ForceBridge.json)) }
        var eligible = Set<String>()
        let nations = r.world.nations.asArray.map(\.id.asString)
        // Read once per frame: active sieges (province|besieger) and each state pair's war status.
        var sieging = Set<String>()
        for sg in r.occupation.sieges.asArray where sg.resistance.asNumber < sg.maximum.asNumber { sieging.insert(sg.provinceId.asString + "|" + sg.controller.asString) }
        var warWith = [String: Bool]()
        func war(_ a: String, _ b: String) -> Bool {
            let k = a + "|" + b
            if let v = warWith[k] { return v }
            let v = Wars.relation(r, a, b)?.status.asString == "war"; warWith[k] = v; return v
        }
        for force in forces where !force.withdrawing {
            let k = force.key
            if result.held.contains(k) { eligible.insert(k); continue }
            guard force.kind == .army else { continue }
            let cell = bridge.graph.location(force.travel).cell, q = Int(bridge.graph.provinces[cell])
            guard q >= 0 else { continue }
            let p = r.world.provinces[q], nation = nations[force.nation]
            let controller = p.controller.asString
            if nation != controller && war(nation, controller) || sieging.contains(p.id.asString + "|" + nation) {
                eligible.insert(k)
            }
        }
        return (eligible, result.held)
    }
    static func frameTicks(_ r: JS) -> Int? { r.frameLoop.isNull ? nil : r.frameLoop.ticks.optionalNumber.map { Int($0) } ?? 20 }
    static func align(_ at: Double, _ frame: Int?) -> Double { guard let frame else { return at }; return (at / Double(frame)).rounded(.up) * Double(frame) }
    public static func reconcileAttackClock(_ r: JS, _ eligible: Set<String>, now: Double) {
        let c = r.forceClock, frame = frameTicks(r)
        for k in c.deadlines.objectKeys where !eligible.contains(k) { c.deadlines.delete(k) }
        for k in eligible.sorted(by: { Array($0.utf16).lexicographicallyPrecedes(Array($1.utf16)) }) where !c.deadlines.has(k) {
            c.deadlines[k] = JS(align(now + 2 / c.secondsPerTick.asNumber, frame))
        }
    }
    public static func reconcileMilitaryClock(_ r: JS) { reconcileAttackClock(r, frame(r).eligible, now: r.clock.tick.asNumber) }
    /// finishDailyForces47.
    static func finishForces(_ r: JS, commit: Bool = false) {
        let held = frame(r).held
        for a in r.world.armies.asArray where a.status.asString == "fighting" && !held.contains(key("army", a.id.asString)) { a.status = JS("idle") }
        reconcileMilitaryClock(r)
        for (id, m) in r.voyages.missions.objectEntries {
            let fleetAlive = r.navy.fleets.asArray.contains { $0.id.optionalString == m.fleetId.optionalString && $0.status.asString != "lost" }
            let armyAlive = r.world.armies.asArray.contains { $0.id.optionalString == m.armyId.optionalString && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
            if fleetAlive && armyAlive { continue }
            r.voyages.missions.delete(id); r.voyages.nextCheck[id] = JS(r.clock.tick.asNumber + 1200)
            let d = JS.object(); d.atTick = r.clock.tick.clone(); d.text = JS("远征部队已损失，保留历史，等待重新评估。"); r.voyages.decisions[id] = d; Vassals.bump(r.voyages)
        }
        if commit { Vassals.bump(r.armyPositions); Vassals.bump(r.fleetPositions) }
    }

    // MARK: Grain (war47-economy advanceEconomy)
    static func rationPoints(_ v: Armies.Located) -> Double {
        if v.army.status.asString == "fighting" { return 8 * dayFactor }
        if v.army.status.asString == "retreating" { return 5 * dayFactor }
        let s = v.travel.status.asString
        return (s == "moving" || s == "blocked" ? 6 : 4) * dayFactor
    }
    static func canRefill(_ v: Armies.Located) -> Bool { v.province != nil && v.army.status.asString == "idle" && ["arrived", "halted"].contains(v.travel.status.asString) }
    public static func economy(_ r: JS) {
        let w = r.world, space = Armies.space(r), management = w.statecraft
        var policies = [String: JS](); for p in management.nations.asArray { policies[p.nationId.asString] = p }
        var provinces = [String: JS](); for p in w.provinces.asArray { provinces[p.id.asString] = p }
        func atWar(_ a: String, _ b: String) -> Bool { a != b && Wars.relation(r, a, b)?.status.asString == "war" }
        func contested(_ p: JS) -> Bool { Armies.landHolders(space, p.id.asString).contains { atWar($0.nationId.asString, p.controller.asString) } }
        func capacity(_ p: JS) -> Double { r.finance.provinces[p.id.asString].maxPopulation.asNumber }
        func production(_ p: JS, _ population: Double, _ occupied: Bool) -> Double {
            (min(population, capacity(p)) * (p.terrain.asString == "plain" ? 1.12 : p.terrain.asString == "forest" ? 1.04 : 0.82) * (occupied ? 0.5 : 1)).rounded(.down)
        }
        for v in space { v.army.supplies = JS(max(0, v.army.supplies.asNumber - rationPoints(v))) }
        for p in management.nations.asArray {
            let l = JS.object()
            l.day = w.day.clone(); for k in ["openingGrain", "production", "civilianConsumed", "militaryConsumed", "territoryTransfer", "closingGrain", "starvationDeaths"] { l[k] = JS(0) }
            p.lastLedger = l
        }
        func add(_ l: JS, _ k: String, _ v: Double) { l[k] = JS(l[k].asNumber + v) }
        for economy in management.provinces.asArray {
            let province = provinces[economy.provinceId.asString]!, policy = policies[province.controller.asString]!, ledger = policy.lastLedger
            let population = economy.population.asNumber, occupied = contested(province)
            add(ledger, "openingGrain", economy.grain.asNumber)
            let produced = min(1_000_000_000_000 - economy.grain.asNumber, production(province, population, occupied))
            economy.grain = JS(economy.grain.asNumber + produced); add(ledger, "production", produced)
            func refill(_ reserve: Double) {
                if occupied { return }
                let local = space.filter { $0.province?.id.asString == province.id.asString && canRefill($0) && $0.army.nationId.asString == province.controller.asString }
                for v in local.sorted(by: { Collate.less($0.army.id.asString, $1.army.id.asString) }) {
                    let army = v.army, strength = army.troops.asNumber / 10
                    let points = max(0, min(province.supply.asNumber, 100 - army.supplies.asNumber, max(0, economy.grain.asNumber - reserve) * 6 / strength).rounded(.down))
                    let consumed = (points * strength / 6).rounded(.up)
                    economy.grain = JS(economy.grain.asNumber - consumed); add(ledger, "militaryConsumed", consumed); army.supplies = JS(army.supplies.asNumber + points)
                }
            }
            let priority = policy.priority.asString
            if priority == "military" { refill(0) }
            let consumed = min(economy.grain.asNumber, population)
            economy.grain = JS(economy.grain.asNumber - consumed); add(ledger, "civilianConsumed", consumed)
            let shortage = population - consumed
            let deaths = shortage > 0 ? min(population, (shortage * 0.002).rounded(.up)) : 0
            economy.population = JS(economy.population.asNumber - deaths); add(ledger, "starvationDeaths", deaths)
            if shortage == 0 && population < capacity(province) { economy.population = JS(min(capacity(province), population + (population * 0.0001).rounded(.down))) }
            if priority != "military" { refill(population * (priority == "civilian" ? 3 : 1)) }
            add(ledger, "closingGrain", economy.grain.asNumber)
        }
        for policy in management.nations.asArray {
            let l = policy.lastLedger, nation = w.nations.asArray.first { $0.id.asString == policy.nationId.asString }!
            let deaths = l.starvationDeaths.asNumber
            if deaths != 0 || w.day.asInt % 7 == 0 {
                event(r, "economy", "\(nation.name.asString)日粮结算\(deaths != 0 ? "：饥荒死亡 \(jsNumber(deaths))" : "")",
                      "期初 \(jsNumber(l.openingGrain.asNumber)) + 生产 \(jsNumber(l.production.asNumber)) − 民用 \(jsNumber(l.civilianConsumed.asNumber)) − 军用 \(jsNumber(l.militaryConsumed.asNumber)) = 期末 \(jsNumber(l.closingGrain.asNumber)) 人日粮。陆地粮库只补给实际停驻部队；海上部队消耗随身口粮。")
            }
        }
    }
    /// dailyEvent47.
    static func event(_ r: JS, _ kind: String, _ text: String, _ reason: String) {
        let w = r.world, id = w.nextEventId.asNumber
        let e = JS.object(); e.id = JS(id); e.day = w.day.clone(); e.kind = JS(kind); e.text = JS(text); e.reason = JS(reason)
        w.nextEventId = JS(id + 1); w.events.push(e)
        if w.events.length > 160 { w.events.asArray = Array(w.events.asArray.suffix(160)) }
    }

    // MARK: Armies of the day
    /// settleOriginalArmyDay47 (with progressOriginalReorganization47).
    static func originalArmyDay(_ r: JS) -> Bool {
        if r.originalArmy47.isNull { return false }
        let spd = r.life.secondsPerDay.asNumber
        for (id, state) in r.reorganization.active.objectEntries {
            let a = r.world.armies.asArray.first { $0.id.asString == id }, force = r.tactics.forces[id]
            guard let a, a.troops.asNumber > 0, a.status.asString != "destroyed", !force.isNull else { r.reorganization.active.delete(id); continue }
            let stock = r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == force.homeId.asString }
            let pop = max(0, min(25000, stock?.population.asNumber ?? 0))
            let full = Double(Armies.strength(r, force.homeId.asString)), duration = 20 - 10 * pop / 25000
            let amount = full * spd / duration + state.fraction.asNumber, whole = amount.rounded(.down)
            state.fraction = JS(amount - whole); a.troops = JS(min(full, a.troops.asNumber + whole)); force.fullStrength = JS(full)
            if a.troops.asNumber >= full { r.reorganization.active.delete(id); r.reorganization.completed[id] = JS((r.reorganization.completed[id].optionalNumber ?? 0) + 1) }
        }
        for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" { a.supplies = JS(100); a.morale = JS(100) }
        return true
    }
    /// retireArmiesOwned47.
    static func retire(_ r: JS) {
        let s = r.armyRetirement
        if s.isNull { return }
        let retired = r.world.armies.asArray.filter { $0.status.asString == "destroyed" && $0.troops.asNumber == 0 }
        if retired.isEmpty { return }
        let ids = Set(retired.map(\.id.asString))
        let manual = r.voyages.manualArmies.asArray.filter { !ids.contains($0.asString) }, manualChanged = manual.count != r.voyages.manualArmies.length
        for army in retired {
            let id = army.id.asString, k = key("army", id)
            let rec = JS.object()
            rec.army = army; rec.unit = r.units[id]; rec.formation = r.tactics.forces[id]; rec.travel = r.armyPositions.records[id]; rec.speed = r.forceSpeed.armies[id]
            rec.personnel = r.combatPersonnel.armies[id]; rec.combat = r.upperCombat.armies[id]
            rec.combatLosses = JS(r.forceDamage.losses[k].optionalNumber ?? 0); rec.damageCarry = JS(r.forceDamage.carry[k].optionalNumber ?? 0)
            rec.completedReorganizations = JS(r.reorganization.completed[id].optionalNumber ?? 0); rec.archivedTick = r.clock.tick.clone(); rec.archivedDay = r.world.day.clone()
            s.records[id] = rec.clone()
            for table in [r.units, r.tactics.forces, r.tactics.rounds, r.armyPositions.records, r.forceSpeed.armies, r.combatPersonnel.armies, r.upperCombat.armies, r.armyAutonomy.armies, r.reorganization.completed, r.battles.plans] { table.delete(id) }
            r.forceDamage.losses.delete(k); r.forceDamage.carry.delete(k); r.forceClock.deadlines.delete(k)
        }
        let keys = Set(retired.map { key("army", $0.id.asString) })
        r.world.armies.asArray = r.world.armies.asArray.filter { !ids.contains($0.id.asString) }
        r.voyages.manualArmies = .array(manual); if manualChanged { Vassals.bump(r.voyages) }
        r.forceContacts.pairs.asArray = r.forceContacts.pairs.asArray.filter { !keys.contains($0.a.asString) && !keys.contains($0.b.asString) }
        Vassals.bump(r.armyPositions); Vassals.bump(r.armyAutonomy)
    }
    /// recoverArmiesOwned47.
    static func recover(_ r: JS) {
        if r.armyRecovery.isNull { return }
        let space = Armies.space(r)
        var stock = [String: JS](); for p in r.world.statecraft.provinces.asArray { stock[p.provinceId.asString] = p }
        for v in space.sorted(by: { Array($0.army.id.asString.utf16).lexicographicallyPrecedes(Array($1.army.id.asString.utf16)) }) {
            let a = v.army, id = a.id.asString, formation = r.tactics.forces[id]
            guard !formation.isNull, formation.kind.asString == "regular", canRefill(v), let province = v.province,
                  province.controller.asString == a.nationId.asString, province.legalOwner.asString == a.nationId.asString,
                  !Armies.landHolders(space, province.id.asString).contains(where: { $0.nationId.asString != a.nationId.asString && Wars.relation(r, a.nationId.asString, $0.nationId.asString)?.status.asString == "war" }) else { continue }
            let missing = max(0, formation.fullStrength.asNumber - a.troops.asNumber)
            if missing == 0 { continue }
            let resource = stock[province.id.asString]!, ledger = r.world.statecraft.nations.asArray.first { $0.nationId.asString == a.nationId.asString }!.lastLedger
            let available = max(0, resource.grain.asNumber - resource.population.asNumber * 10)
            let limit = max(40, min(120, (formation.fullStrength.asNumber * 0.06).rounded(.up)))
            let recruits = min(missing, limit, resource.population.asNumber * 10, available)
            if recruits < 1 { continue }
            resource.population = JS(resource.population.asNumber - (recruits / 10).rounded(.up)); resource.grain = JS(resource.grain.asNumber - recruits)
            ledger.militaryConsumed = JS(ledger.militaryConsumed.asNumber + recruits); ledger.closingGrain = JS(ledger.closingGrain.asNumber - recruits)
            let before = a.troops.asNumber
            a.troops = JS(before + recruits)
            if before <= 180 && a.troops.asNumber > 180 {
                event(r, "system", "\(a.name.asString)补员后恢复出征能力", "在\(province.name.asString)实际停驻；补入\(jsNumber(recruits))人，扣本地人口\(jsNumber((recruits / 10).rounded(.up)))、粮储\(jsNumber(recruits))人日粮。未从其他地区或海上凭空补员。")
            }
        }
    }

    // MARK: Month end (settleFiscalMonth47, settleDestinyMonth)
    static let goldProduction: [String: Double] = ["Kingdom": 1, "Empire": 1, "Federation": Native.fr(1.05), "Republic": Native.fr(1.1), "Tribal": Native.fr(0.9), "Theocracy": Native.fr(0.95)]
    static func armyFees(_ r: JS, _ nation: String) -> (cost: Int, suspended: Bool) {
        var ids = [String: Int](); for (i, p) in r.world.provinces.asArray.enumerated() { ids[p.id.asString] = i + 1 }
        struct P { let id: Int; let owner: String?; let land: Bool; let distance: Int; let neighbors: [Int] }
        var provinces = r.world.provinces.asArray.map { p -> P in
            let d = r.upperCombat.provinces[p.id.asString].distance.asInt
            return P(id: ids[p.id.asString]!, owner: p.controller.asString, land: true, distance: d == 2147483647 ? 0 : d, neighbors: p.neighbors.asArray.map { ids[$0.asString]! })
        }
        let held = Set(r.forceContacts.pairs.asArray.flatMap { [$0.a.asString, $0.b.asString] })
        var armies = [Int](), seaIds = [Int: Int]()
        guard let bridge = Armies.bridge else { return (0, false) }
        for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" && a.nationId.asString == nation {
            let t = r.armyPositions.records[a.id.asString], loc = bridge.graph.location(bridge.travel(t)), q = Int(bridge.graph.provinces[loc.cell])
            let province: JS? = q >= 0 ? r.world.provinces[q] : nil
            let moving = ["moving", "blocked"].contains(t.status.asString)
            let active = moving || held.contains(key("army", a.id.asString)) || (province.map { $0.controller.asString != nation && Wars.relation(r, nation, $0.controller.asString)?.status.asString == "war" } ?? false)
            let reorganizing = r.reorganization.active.has(a.id.asString)
            if !reorganizing && !(a.status.asString != "retreating" && active) { continue }
            var pid: Int
            if let province { pid = ids[province.id.asString]! }
            else {
                let face = Int(bridge.graph.faces[loc.cell])
                if let s = seaIds[face] { pid = s } else { pid = r.world.provinces.length + 1 + face; seaIds[face] = pid; provinces.append(P(id: pid, owner: nil, land: false, distance: 0, neighbors: [])) }
            }
            armies.append(pid)
        }
        var byId = [Int: P](); for p in provinces { byId[p.id] = p }
        var cost = 0
        for pid in armies {
            let p = byId[pid]!
            if p.owner == nation { if p.distance > 4 { cost = Native.iadd(cost, Native.idiv(Native.imul(p.distance, min(p.distance, 12)), 2)) } }
            else if !p.land { cost = Native.iadd(cost, 420) }
            else if let n = p.neighbors.lazy.compactMap({ byId[$0] }).first(where: { $0.owner == nation }), n.id != 0 { cost = Native.iadd(cost, Native.imul(n.distance, 60)) }
        }
        let suspended = r.upperCombat.nations[nation].provinceOrder.asArray.contains { !r.upperCombat.provinces[$0.asString].connected.isTruthy }
        return (cost, suspended)
    }
    static func taxMultiplier(_ r: JS, _ nation: String) -> Double {
        let n = r.people.nations[nation]
        if n.isNull || n.leaderId.isNull { return 1 }
        let leader = r.people.persons[n.leaderId.asInt.description]
        guard !leader.isNull, leader.id.asInt > 0, leader.alive.isTruthy, leader.stateId.asInt == n.id.asInt else { return 1 }
        var total = 0.0
        for t in leader.traits.asArray { total = f(total + f(Nobility.trait(t.asString)?.taxEfficiencyModifier.optionalNumber ?? 0)) }
        return f(1 + total)
    }
    static func fiscalMonth(_ r: JS) {
        if r.world.day.asInt % 30 != 0 { return }
        Wars.reconcileCore(r)
        let month = r.world.day.asInt / 30
        for nation in r.world.nations.asArray {
            let id = nation.id.asString, n = r.finance.nations[id], u = r.upperCombat.nations[id]
            if n.lastMonth.asInt >= month || u.provinceOrder.length == 0 { continue }
            let ethnic = r.economy.nations[id].ethnic.asString, fees = armyFees(r, id), openingGold = n.gold.asInt
            let incomes = u.provinceOrder.asArray.map { pidJS -> Int in
                let pid = pidJS.asString, p = r.finance.provinces[pid], data = r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == pid }!
                let resources = p.resources.asArray.map { Treasury.Resource(base: $0.baseValue.asInt, probability: $0.probability.asNumber, affectedBy: $0.affectedBy.asArray.map(\.asString)) }
                return Treasury.provinceIncome(Treasury.ProvinceInput(population: data.population.asInt, capacity: p.maxPopulation.asInt, cells: p.cellBiomes.length, resources: resources,
                                                                      local: r.offices47.isNull ? 1 : Offices.localIncome(r, pid)),
                                               ethnic: ethnic, destiny: r.destiny.nations[id].destiny.asNumber, nationProvinces: u.provinceOrder.length, worldProvinces: r.world.provinces.length)
            }
            let out = Treasury.settle(gold: openingGold, incomes: incomes, tax: taxMultiplier(r, id), central: r.offices47.isNull ? 1 : Offices.centralIncome(r, id),
                                      armyCost: fees.cost, production: goldProduction[u.polity.asString]!, ethnic: ethnic)
            n.gold = JS(out.gold); n.goldPerMonth = JS(out.goldPerMonth); n.armyCostGold = JS(fees.cost); n.goldBattleModifier = JS(out.goldBattleModifier); n.lastMonth = JS(month)
            let l = JS.object()
            l.gold = JS(out.gold); l.goldPerMonth = JS(out.goldPerMonth); l.armyCostGold = JS(fees.cost); l.goldBattleModifier = JS(out.goldBattleModifier)
            l.baseIncome = JS(out.baseIncome); l.inventoryFactor = JS(out.inventoryFactor); l.goldBeforeArmyCost = JS(out.goldBeforeArmyCost)
            l.day = r.world.day.clone(); l.openingGold = JS(openingGold); l.reorganizationCost = JS(0); l.distanceSuspended = JS(fees.suspended)
            n.ledger = l
        }
    }
    static func destinyMonth(_ r: JS) {
        let day = r.world.day.asInt
        if day % 30 != 0 { return }
        let month = day / 30
        for n in r.world.nations.asArray {
            let id = n.id.asString, v = r.destiny.nations[id]
            let owned = r.world.provinces.asArray.filter { $0.controller.asString == id }
            if v.isNull || v.lastMonth.asInt >= month || owned.isEmpty { continue }
            let pops = owned.map { p in r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == p.id.asString }!.population.asNumber }
            let caps = owned.map { r.finance.provinces[$0.id.asString].maxPopulation.asNumber }
            let ratio = f(f(pops.reduce(0, +)) / f(caps.reduce(0, +)))
            let leaderId = r.people.nations[id].leaderId
            let leader: JS? = leaderId.isNull ? nil : r.people.persons[leaderId.asInt.description]
            var administrative: Double? = v.destiny.asNumber >= 30 ? 50 : nil
            var s = Destiny.State(destiny: v.destiny.asNumber, decrease: v.decrease.asNumber, manifestCount: v.manifestCount.asInt, manifest: v.manifest.asBool, seed: UInt32(truncatingIfNeeded: Int64(v.seed.asNumber)), lastMonth: v.lastMonth.asInt)
            let before = s.destiny, gold = r.finance.nations[id].gold.asNumber
            var lazy: Double? = nil
            if let leader, !leader.isNull, s.destiny >= f(30) { let a = People.skills(leader).administrative; administrative = a; lazy = a }
            let result = Destiny.month(&s, populationRatio: ratio, gold: Int(gold), leaderAdministrative: lazy)
            v.destiny = JS(s.destiny); v.decrease = JS(s.decrease); v.manifestCount = JS(s.manifestCount); v.manifest = JS(s.manifest); v.seed = JS(Double(s.seed))
            r.upperCombat.nations[id].destiny = JS(s.destiny)
            if result.cleared { r.tactics.mobilizations[id].recent = .array() }
            v.lastMonth = JS(month); if result.reset { v.resets = JS(v.resets.asNumber + 1) }
            let l = JS.object()
            l.day = JS(day); l.before = JS(before); l.after = JS(s.destiny); l.populationRatio = JS(ratio); l.gold = JS(gold)
            l.administrative = administrative.map { JS($0) } ?? .null; l.reset = JS(result.reset); l.clearedRecent = JS(result.cleared)
            v.ledger = l; Vassals.bump(r.destiny)
        }
    }

    /// settleCivilizationDayCore47.
    public static func settle(_ r: JS) {
        r.world.day = JS(r.world.day.asNumber + 1)
        if Profile.measure("d.people", { People.month(r) }) || r.world.day.asInt % 30 == 0 { Government.refreshLeaderCombat(r) }
        Profile.measure("d.fleets") { Naval.settleFleetFood(r) }
        Profile.measure("d.economy") { economy(r) }
        _ = Profile.measure("d.armyDay") { originalArmyDay(r) }
        Profile.measure("d.forces") { finishForces(r); retire(r); recover(r) }
        Profile.measure("d.fiscal") { fiscalMonth(r) }
        dailyOrders?(r)
        Profile.measure("d.muster") { Armies.muster(r) }; Profile.measure("d.destiny") { destinyMonth(r) }; Profile.measure("d.forces") { finishForces(r, commit: true); retire(r) }
        r.dailyEconomy.lastDay = r.world.day.clone()
    }
}
