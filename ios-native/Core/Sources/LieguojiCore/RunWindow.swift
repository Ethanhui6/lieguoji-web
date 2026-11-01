import Foundation

/// The military window on the run state (force-tick47 advanceMilitaryWindowCore47 with the real47
/// rules of civilization47-military): at each frame boundary the occupation pass, the attack clock and
/// the due volleys (with the loss, war-damage, kill and family-merit ledgers), then motion event by
/// event; captures transfer the economy, refresh the core, log, and enter the chronicle.
public enum RunWindow {
    static let f = Native.fr
    /// Port land owners after an occupation pass (reconcilePortLandOwnersOwned47), set by the engine.
    public static var afterOccupation: ((JS) -> Void)?
    /// The calendar, political tick and orders after each tick (the real47 afterTick), set by the engine.
    public static var afterTick: ((JS, _ dailyPending: Bool, _ boundary: Bool) -> Void)?
    public struct Salvo: Equatable { public let at: Double; public let due: [String]; public let hits: Int; public let losses: Int }

    static func key(_ kind: String, _ id: String) -> String { "[\"\(kind)\",\"\(id)\"]" }
    static func atWar(_ r: JS, _ a: String, _ b: String) -> Bool { a != b && Wars.relation(r, a, b)?.status.asString == "war" }
    /// militaryAccess46.
    static func access(_ r: JS, _ a: String, _ b: String) -> Bool {
        a == b || !atWar(r, a, b) && (r.alliances.records.asArray.contains { $0.endedTick.isNull && $0.members.asArray.contains { $0.asString == a } && $0.members.asArray.contains { $0.asString == b } }
            || r.vassals.records.asArray.contains { $0.endedTick.isNull && $0.overlordId.asString == a && $0.vassalId.asString == b })
    }
    static func provinceIndex(_ bridge: ForceBridge, _ travel: ArmyTravel) -> Int? {
        let q = Int(bridge.graph.provinces[bridge.graph.location(travel).cell]); return q >= 0 ? q : nil
    }
    static func log(_ r: JS, _ kind: String, _ text: String, _ reason: String) { Daily.event(r, kind, text, reason) }

    // MARK: Resistance capacity (occupation resistanceCapacity)
    static func area(_ p: JS) -> Double {
        let poly = p.polygon.asArray
        var s = 0.0
        for (i, a) in poly.enumerated() { let b = poly[(i + 1) % poly.count]; s = s + a.x.asNumber * b.y.asNumber - b.x.asNumber * a.y.asNumber }
        return abs(s) / 2
    }
    static func capacity(_ r: JS, _ p: JS) -> Double {
        let all = r.world.provinces.asArray
        let total = all.reduce(0.0) { $0 + area($1) }
        return max(1, 400 * area(p) * Double(all.count) / max(1, total))
    }

    // MARK: Attack clock
    static func reschedule(_ r: JS, _ k: String, now: Double) {
        let c = r.forceClock
        let rng = UInt32(c.rng.asNumber) &* 1664525 &+ 1013904223
        c.rng = JS(Double(rng)); c.draws = JS(c.draws.asNumber + 1)
        let range = f(f(1) + f(f(2) * f(Double(rng) / 4294967296)))
        c.deadlines[k] = JS(Daily.align(now + f(f(2) * range) / c.secondsPerTick.asNumber, Daily.frameTicks(r)))
    }

    // MARK: Occupation (war47-occupation advanceOwnedTacticsOccupation47)
    static func provinceCombat(_ r: JS, _ a: JS, _ index: Int) -> (efficiency: Double, damageToProvince: Double, multiplier: Int) {
        let c = CombatReader.inputs(r, a, index)
        return (Efficiency.compute(c.input), c.damageToProvince, c.multiplier)
    }
    /// occupy(): skipped when there is no siege and no army holds hostile land; otherwise one pass with
    /// the due armies, then the ownership callbacks. Returns whether the pass ran.
    @discardableResult
    static func occupy(_ r: JS, now: Double, due: Set<String>) -> Bool {
        guard Armies.bridge != nil else { return false }
        let space = Armies.space(r)
        if r.occupation.sieges.length == 0 && !space.contains(where: { $0.province != nil && $0.army.status.asString != "retreating" && atWar(r, $0.army.nationId.asString, $0.province!.controller.asString) }) { return false }
        let previous = r.world.provinces.asArray.map(\.controller.asString)
        let armyDue = Set(space.filter { due.contains(key("army", $0.army.id.asString)) }.map(\.army.id.asString))
        let w = r.world, tick = now.rounded(.down)
        // reconcileOccupation.
        r.occupation.sieges = .array(r.occupation.sieges.asArray.filter { s in
            guard let p = w.provinces.asArray.first(where: { $0.id.asString == s.provinceId.asString }) else { return false }
            return p.controller.asString == s.controller.asString && atWar(r, s.attacker.asString, s.controller.asString)
        })
        var local = [String: [JS]]()
        for v in space where v.province != nil { local[v.province!.id.asString, default: []].append(v.army) }
        for (index, p) in w.provinces.asArray.enumerated() {
            let pid = p.id.asString
            let group = (local[pid] ?? []).filter { $0.status.asString != "retreating" }
            var siege = r.occupation.sieges.asArray.first { $0.provinceId.asString == pid }
            if siege == nil && !group.contains(where: { atWar(r, $0.nationId.asString, p.controller.asString) }) { continue }
            // forcesFromGroup.
            var powers = [String: Double](), order = [String]()
            for a in group {
                let c = provinceCombat(r, a, index), e = c.efficiency * Double(c.multiplier), n = a.nationId.asString
                if n != p.controller.asString && atWar(r, n, p.controller.asString) { if powers[n] == nil { order.append(n) }; powers[n, default: 0] += e }
            }
            let attacker = order.sorted { x, y in powers[x]! != powers[y]! ? powers[x]! > powers[y]! : Collate.less(x, y) }.first
            if attacker == nil && siege == nil { continue }
            let attackers = group.filter { $0.nationId.asString == attacker }
            let defenders = group.filter { attacker != nil && $0.nationId.asString != attacker! && atWar(r, $0.nationId.asString, attacker!) }
            let immediate = r.tactics.unopposed.asString == "takeover" && !attackers.isEmpty && defenders.isEmpty
            if siege == nil, let attacker {
                let m = capacity(r, p)
                let s = JS.object(); s.provinceId = JS(pid); s.controller = p.controller.clone(); s.attacker = JS(attacker); s.maximum = JS(m); s.resistance = JS(m); s.started = JS(tick); s.pulse = JS(tick)
                r.occupation.sieges.push(s); siege = s
                if !immediate { log(r, "battle", "\(p.name.asString)\(w.cities.asArray.contains { $0.provinceId.optionalString == pid } ? "争夺城防" : "争夺地区")", "对军交锋和地区抵抗分别结算；每军独立计时，守军同时回补抵抗。") }
            }
            guard let s = siege else { continue }
            if let attacker { s.attacker = JS(attacker) }
            var conqueror: String? = immediate ? attacker : nil
            var captor: String? = immediate ? attackers.map(\.id.asString).sorted(by: Collate.less).first : nil
            if immediate { s.resistance = JS(0) }
            else {
                for a in group.filter({ armyDue.contains($0.id.asString) }).sorted(by: { Collate.less($0.id.asString, $1.id.asString) }) {
                    let c = provinceCombat(r, a, index), base = f(c.damageToProvince * c.efficiency), damage = c.multiplier == 2 ? f(f(base) * 2) : base
                    let n = a.nationId.asString
                    if n == p.controller.asString { s.resistance = JS(min(s.maximum.asNumber, s.resistance.asNumber + damage)) }
                    else if atWar(r, n, p.controller.asString) { s.attacker = JS(n); s.resistance = JS(max(0, s.resistance.asNumber - damage)) }
                    s.pulse = JS(tick)
                    if s.resistance.asNumber == 0 { conqueror = n; captor = a.id.asString; break }
                }
            }
            if s.resistance.asNumber == 0, let next = conqueror {
                let old = p.controller.asString
                PeaceBridge.transferEconomy(r, pid, old, next); p.controller = JS(next)
                if let captor, !r.nobility.isNull { Nobility.conquestMerit(r, captor) }
                Wars.reconcileCore(r)
                let name = w.nations.asArray.first { $0.id.asString == next }!.name.asString
                log(r, "occupation", "\(name)\(immediate ? "接管" : "攻下")\(p.name.asString)",
                    immediate ? "驻军已实际抵达，本地区没有敌军，按空城接管规则立即换旗；只改变本地区实控，不吞并全国。" : "实际军队攻击耗尽地区抵抗；只改变本地区实控，法理归属和其他领土保留。")
                r.occupation.sieges = .array(r.occupation.sieges.asArray.filter { $0 !== s })
            } else if attacker == nil && s.resistance.asNumber == s.maximum.asNumber {
                r.occupation.sieges = .array(r.occupation.sieges.asArray.filter { $0 !== s })
            }
        }
        afterOccupation?(r)
        politicalOccupation(r, previous)
        return true
    }
    /// recordPoliticalOccupation47.
    static func politicalOccupation(_ r: JS, _ previous: [String]) {
        var changed = false
        for (i, p) in r.world.provinces.asArray.enumerated() where previous[i] != p.controller.asString {
            changed = true
            let names = [previous[i], p.controller.asString].map { id in r.world.nations.asArray.first { $0.id.asString == id }!.name.asString }
            People.recordHistory(r, kind: "occupation", text: "\(p.name.asString)被\(names[1])占领", reason: "实际控制从\(names[0])转移至\(names[1])；城市、地形与法理归属分别保留。",
                                 nations: [previous[i], p.controller.asString], province: p.id.asString)
        }
        if changed { Government.reconcileContinuity(r) }
    }

    // MARK: Volley (force-accounting47 applyAccountedVolley47)
    /// reorganizeDefeatedArmy47.
    static func reorganize(_ r: JS, _ a: JS) -> Bool {
        if r.originalArmy47.isNull || r.originalArmy47.kills.isNull { return false }
        let force = r.tactics.forces[a.id.asString]
        if force.isNull || force.kind.asString == "emergency" { return false }
        guard let home = r.world.provinces.asArray.first(where: { $0.id.asString == force.homeId.asString }), home.controller.asString == a.nationId.asString else { return false }
        if r.world.armies.asArray.contains(where: { $0.id.asString != a.id.asString && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" && r.tactics.forces[$0.id.asString].homeId.optionalString == home.id.asString && $0.nationId.asString == a.nationId.asString }) { return false }
        guard let cell = Armies.homeCells[home.id.asString] else { return false }
        let full = Armies.strength(r, home.id.asString)
        a.provinceId = home.id.clone(); a.status = JS("idle"); a.route = .array(); a.progress = JS(0); a.troops = JS(max(1, Int((Double(full) * 0.1).rounded(.down)))); a.morale = JS(100); a.supplies = JS(100)
        force.fullStrength = JS(full)
        let t = JS.object()
        t.version = JS(1); t.armyId = a.id.clone(); t.origin = home.center.clone(); t.nodes = .array([JS(cell)]); t.leg = JS(0); t.offset = JS(0); t.crossed = JS(false); t.status = JS("arrived")
        r.armyPositions.records[a.id.asString] = t
        r.battles.plans.delete(a.id.asString); r.tactics.rounds.delete(a.id.asString)
        let o = JS.object(); o.startedTick = r.clock.tick.clone(); o.fraction = JS(0); r.reorganization.active[a.id.asString] = o
        Daily.event(r, "battle", "\(a.name.asString)在故乡重组", "兵力打光后于\(home.name.asString)以一成兵力重新集结，按原作重组时长逐步补满。")
        return true
    }
    static func volley(_ r: JS, due: [String]) -> (hits: Int, losses: Int) {
        guard let bridge = Armies.bridge else { return (0, 0) }
        let forces = bridge.forces(r)
        var armies = [String: JS](); for a in r.world.armies.asArray { armies[a.id.asString] = a }
        let hits = Volley.hits(forces: forces, contacts: bridge.contacts(r), due: due, enemy: { a, b in a != b && atWarIndex(r, a, b) },
                                      onLand: { provinceIndex(bridge, $0.travel) != nil }, elite: { $0.kind == .army && r.units[$0.id].optionalString == "Elite" },
                                      army: { force in
                                          let c = CombatReader.inputs(r, armies[force.id]!, provinceIndex(bridge, force.travel))
                                          return Volley.ArmyInput(efficiency: Efficiency.compute(c.input), damageToArmy: c.damageToArmy, multiplier: Double(c.multiplier))
                                      },
                                      navy: { _ in Volley.NavalInput(destiny: 0, maritime: false, leader: nil) })
        let armyKeys = Dictionary(uniqueKeysWithValues: forces.filter { $0.kind == .army }.map { ($0.key, $0.id) })
        // creditArmyKills47.
        if !r.originalArmy47.isNull && !r.originalArmy47.kills.isNull {
            let kills = r.originalArmy47.kills
            for h in hits { guard let id = armyKeys[h.attacker], armyKeys[h.victim] != nil else { continue }; kills[id] = JS((kills[id].optionalNumber ?? 0) + h.damage * 10) }
        }
        var incoming = [String: Double]()
        for h in hits { incoming[h.victim, default: 0] += h.damage }
        let state = r.forceDamage, carryBefore = Dictionary(uniqueKeysWithValues: state.carry.objectEntries.map { ($0.0, $0.1.asNumber) })
        var casualties = [(key: String, strength: Int)]()
        for force in forces where force.kind == .army {
            let k = force.key
            guard let raw = incoming[k] else { continue }
            let total = raw * 10 + (state.carry[k].optionalNumber ?? 0), whole = total.rounded(.down)
            state.carry[k] = JS(total - whole)
            let a = armies[force.id]!, before = a.troops.asInt, strength = min(before, Int(whole))
            a.troops = JS(before - strength)
            if strength > 0 { a.morale = JS(max(0, a.morale.asNumber - max(0.2, Double(strength) / Double(max(1, before)) * 46))) }
            if a.troops.asInt == 0 && !reorganize(r, a) {
                a.status = JS("destroyed"); a.morale = JS(0); a.route = .array(); a.progress = JS(0)
                let t = r.armyPositions.records[force.id].clone(); t.status = JS("halted"); r.armyPositions.records[force.id] = t
                r.battles.plans.delete(force.id)
            }
            state.losses[k] = JS((state.losses[k].optionalNumber ?? 0) + Double(strength))
            casualties.append((k, strength))
        }
        // reconcileForceContactsOwned47 among the living, then fighting without contact → idle.
        let clean = ContactMotion(graph: bridge.graph).contacts(bridge.forces(r), bridge.contacts(r), bridge.rules(r))
        r.forceContacts.pairs = .array(clean.contacts.map(ForceBridge.json))
        for a in r.world.armies.asArray where a.status.asString == "fighting" && !clean.held.contains(key("army", a.id.asString)) { a.status = JS("idle") }
        // Ledgers: raw war damage, losses by enemy, then family battle merit.
        Wars.reconcileLosses(r)
        let nationOf = Dictionary(uniqueKeysWithValues: forces.map { ($0.key, r.world.nations[$0.nation].id.asString) })
        var attackers = [String: [String]]()
        for h in hits {
            let a = nationOf[h.attacker]!, b = nationOf[h.victim]!
            if armyKeys[h.attacker] != nil && armyKeys[h.victim] != nil { Wars.recordDamage(r, killer: a, victim: b, amount: h.damage) }
            if h.damage > 0 && !(attackers[h.victim] ?? []).contains(a) { attackers[h.victim, default: []].append(a) }
        }
        for c in casualties {
            let enemies = (carryBefore[c.key] ?? 0) > 0 ? [] : attackers[c.key] ?? []
            Wars.recordLoss(r, nationOf[c.key]!, "combat", c.strength, enemies: enemies)
        }
        if !r.nobility.isNull {
            for h in hits { if let id = armyKeys[h.attacker], armyKeys[h.victim] != nil { Nobility.battleMerit(r, id, h.damage) } }
        }
        return (hits.count, casualties.reduce(0) { $0 + $1.strength })
    }
    static func atWarIndex(_ r: JS, _ a: Int, _ b: Int) -> Bool { atWar(r, r.world.nations[a].id.asString, r.world.nations[b].id.asString) }

    // MARK: Motion (force-runtime47 advanceOwnedActualForces47)
    static func motion(_ r: JS, seconds: Double) -> ContactMotion.Result {
        let bridge = Armies.bridge!, g = bridge.graph
        var armies = [String: JS](); for a in r.world.armies.asArray { armies[a.id.asString] = a }
        let anchors = r.originalArmy47.isNull ? false : r.originalArmy47.paths.optionalNumber == 1
        let index = Dictionary(uniqueKeysWithValues: r.world.provinces.asArray.enumerated().map { ($0.element.id.asString, $0.offset) })
        let seconds0 = r.forceClock.secondsPerTick.asNumber
        let rules = bridge.rules(r, canEnter: { force, cell in
            let q = Int(g.provinces[cell])
            if force.kind == .fleet { return q < 0 }
            let a = armies[force.id]!
            if q < 0 { return r.reorganization.active[force.id].isNull }
            let c = r.world.provinces[q].controller.asString, n = a.nationId.asString
            let anchor = anchors ? index[a.provinceId.asString].map { r.world.provinces[$0].controller.asString } : nil
            return access(r, n, c) || c == anchor || a.status.asString != "retreating" && atWar(r, n, c)
        }, speed: { force, cell in
            if force.kind == .fleet { return f(2.2) * ForceMotion.mapUnitsPerNativeUnit * seconds0 }
            return ForceMotion.armySpeed(base: r.forceSpeed.armies[force.id].base.asNumber, unitSpeed: CombatReader.unitSpeed(r.units[force.id].asString), cell: cell, graph: g, secondsPerTick: seconds0)
        })
        var moving = bridge.forces(r)
        let out = ContactMotion(graph: g).advance(&moving, previous: bridge.contacts(r), seconds: seconds, rules: rules, stopAtEvent: true)
        for m in moving {
            let book = m.kind == .army ? r.armyPositions : r.fleetPositions
            let t = book.records[m.id].clone(); bridge.write(m.travel, to: t); book.records[m.id] = t
        }
        r.forceContacts.pairs = .array(out.contacts.map(ForceBridge.json))
        let space = Armies.space(r)
        var safe = Set<String>()
        for v in space where v.army.status.asString == "retreating" && ["arrived", "halted"].contains(v.travel.status.asString) {
            guard let p = v.province, access(r, v.army.nationId.asString, p.controller.asString) else { continue }
            if !space.contains(where: { $0.province?.id.asString == p.id.asString && $0.army.status.asString != "retreating" && atWar(r, v.army.nationId.asString, $0.army.nationId.asString) }) { safe.insert(v.army.id.asString) }
        }
        for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" {
            let id = a.id.asString
            a.status = JS(safe.contains(id) ? "idle" : a.status.asString == "retreating" ? "retreating" : out.held.contains(key("army", id)) ? "fighting" : "idle")
        }
        Vassals.bump(r.armyPositions); Vassals.bump(r.fleetPositions)
        return out
    }

    // MARK: The window
    /// advanceMilitaryWindowCore47 for `ticks` within the current day. Returns the volleys and whether
    /// the day boundary was reached (the run then needs its daily settlement).
    @discardableResult
    public static func advance(_ r: JS, ticks: Int) -> (volleys: [Salvo], dailyPending: Bool) {
        let F = Daily.frameTicks(r), start = r.clock.tick.asInt, end = start + ticks, untilDay = (r.world.day.asInt + 1) * 120
        var now = Double(F.map { start / $0 * $0 } ?? start), volleys = [Salvo](), events = 0
        if ticks < 1 || end > untilDay { return ([], false) }
        for tick in start + 1...end {
            let boundary = F == nil || tick % F! == 0
            if boundary {
                while true {
                    events += 1; if events > 100_000 { break }
                    Profile.measure("w.occupy") { occupy(r, now: now, due: []) }
                    Profile.measure("w.frame") { Daily.reconcileAttackClock(r, Daily.frame(r).eligible, now: now) }
                    let due = r.forceClock.deadlines.objectEntries.filter { $0.1.asNumber <= now }.map(\.0).sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }
                    if !due.isEmpty {
                        for k in due { reschedule(r, k, now: now) }
                        let out = Profile.measure("w.volley") { volley(r, due: due) }
                        volleys.append(Salvo(at: now, due: due, hits: out.hits, losses: out.losses))
                        Profile.measure("w.occupy") { occupy(r, now: now, due: Set(due)) }
                        Profile.measure("w.frame") { Daily.reconcileAttackClock(r, Daily.frame(r).eligible, now: now) }
                    }
                    if now == Double(tick) { break }
                    let stop = F != nil ? Double(tick) : min(Double(tick), r.forceClock.deadlines.objectValues.map(\.asNumber).min() ?? Double(tick))
                    let moved = Profile.measure("w.motion") { motion(r, seconds: stop - now) }
                    now = moved.unused == 0 ? stop : now + moved.elapsed
                }
            }
            for (id, until) in (r.maritime.retreating.isNull ? [] : r.maritime.retreating.objectEntries) where until.asNumber <= Double(tick) { r.maritime.retreating.delete(id) }
            r.clock.tick = JS(tick); r.forceClock.now = JS(tick)
            Profile.measure("w.afterTick") { afterTick?(r, tick == untilDay, boundary) }
            if !boundary { continue }
            Profile.measure("w.frame") { Daily.reconcileAttackClock(r, Daily.frame(r).eligible, now: Double(tick)) }
        }
        return (volleys, r.clock.tick.asInt == untilDay)
    }
}

extension Nobility {
    static func leaderFamily(_ r: JS, _ nation: String) -> Int? {
        let id = r.people.nations[nation].leaderId
        if id.isNull { return nil }
        let p = r.kin.persons[String(id.asInt)]
        return p.isNull ? nil : p.familyId.asInt
    }
    static func contribute(_ n: JS, _ nation: String, _ family: Int, _ v: Double) {
        if n.families[String(family)].isNull { return }
        if n.warContributions[nation].isNull { n.warContributions[nation] = .object() }
        let s = n.warContributions[nation]; s[String(family)] = JS(f((s[String(family)].optionalNumber ?? 0) + v))
    }
    static func destroyed(_ n: JS, _ family: Int, _ v: Double) {
        let fam = n.families[String(family)]; if fam.isNull { return }
        var t = f(v + fam.totalEnemyDestroyed.asNumber); if !t.isFinite || 0 > t { t = 0 }; fam.totalEnemyDestroyed = JS(t)
    }
    static func conquered(_ n: JS, _ family: Int, _ count: Int) {
        let fam = n.families[String(family)]; if !fam.isNull { fam.totalProvincesConquered = JS(fam.totalProvincesConquered.asNumber + Double(count)) }
    }
    /// recordBattleMerit47.
    static func battleMerit(_ r: JS, _ armyId: String, _ amount: Double) {
        let n = r.nobility; if n.isNull || !(amount > 0) { return }
        guard let a = r.world.armies.asArray.first(where: { $0.id.asString == armyId }), let row = army(r, armyId), let leader = leaderFamily(r, a.nationId.asString) else { return }
        let nation = a.nationId.asString, p = polities.firstIndex(of: r.civilization.nations[nation].polity.asString) ?? -1, share = f(amount * f(0.1))
        let familyId = row.familyId.asInt, central = row.central.asBool
        func whole(_ id: Int) { if id <= 0 { return }; destroyed(n, id, amount); contribute(n, nation, id, share) }
        if p <= 1 { if central && leader > 0 { whole(leader) } else if familyId > 0 { whole(familyId) } else { whole(leader) } }
        else if p <= 3 {
            if familyId > 0 {
                if leader <= 0 { return }
                let half = f(amount * f(0.5)); destroyed(n, familyId, half); destroyed(n, leader, half)
                contribute(n, nation, familyId, f(share * f(0.5))); contribute(n, nation, leader, f(share * f(0.5)))
            } else { whole(leader) }
        } else if familyId > 0 { whole(familyId) } else { whole(leader) }
    }
    /// recordConquestMerit47.
    static func conquestMerit(_ r: JS, _ armyId: String, _ count: Int = 1) {
        let n = r.nobility; if n.isNull || count <= 0 { return }
        guard let a = r.world.armies.asArray.first(where: { $0.id.asString == armyId }), let row = army(r, armyId), let leader = leaderFamily(r, a.nationId.asString) else { return }
        let nation = a.nationId.asString, p = polities.firstIndex(of: r.civilization.nations[nation].polity.asString) ?? -1, share = f(Double(count * 5))
        let familyId = row.familyId.asInt, central = row.central.asBool
        func whole(_ id: Int) { if id <= 0 { return }; conquered(n, id, count); contribute(n, nation, id, share) }
        if p <= 1 { if central && leader > 0 { whole(leader) } else if familyId > 0 { whole(familyId) } else { whole(leader) } }
        else if p <= 3 {
            if familyId > 0 { conquered(n, familyId, count); contribute(n, nation, familyId, f(share * f(0.5))); if leader > 0 { contribute(n, nation, leader, f(share * f(0.5))) } }
            else { whole(leader) }
        } else if familyId > 0 { whole(familyId) } else { whole(leader) }
    }
}
