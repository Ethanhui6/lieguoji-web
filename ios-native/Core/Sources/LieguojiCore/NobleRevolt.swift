import Foundation

/// Family rebellions and civil wars (civilization47-nobility-rebellion, -nobility-civil-war,
/// civilization47-rebellion transferRebelArmies47): in months 6 and 12 a family hostile to the
/// rulers may rise with the families it rallies; every December a state of 15+ provinces may fall into
/// a civil war of succession, reform, independence or overthrow. Either founds a state (or restores a
/// fallen one) on the rebels' land, moves their armies over and starts the internal war.
public enum NobleRevolt {
    static let f = Native.fr
    static let polities = ["Kingdom", "Empire", "Federation", "Republic", "Tribal", "Theocracy"]
    static func alive(_ r: JS, _ id: String) -> Bool { Vassals.alive(r, id) }
    static func monthsSince(_ r: JS, _ t: Double) -> Int { Rebellion.monthsSince(r, t) }
    static func rulingId(_ r: JS, _ nation: String) -> String {
        let v = r.nobility.rulingFamilies[nation]; return String(v.isNull ? r.people.nations[nation].id.asInt : v.asInt)
    }
    static func resistance(_ traits: [String]) -> Double { traits.reduce(0.0) { f($0 + f(Nobility.trait($1)?.rebellionResistanceModifier.optionalNumber ?? 0)) } }

    // MARK: Family rebellion (shouldFamilyRebel47 … startFamilyRebellion47)
    static func shouldRebel(_ r: JS, _ id: String) -> Bool {
        let n = r.nobility, fam = n.families[id]
        if fam.isNull || fam.ruling.asBool || fam.controlledProvinces.length == 0 || 200 > fam.influence.asNumber || !alive(r, fam.nationId.asString) { return false }
        let state = fam.nationId.asString, d = r.destiny.nations[state]
        var minimum = n.settings.familyRebelMinMonths.asNumber
        if d.manifest.isTruthy && d.manifestCount.asNumber > 0 { minimum *= 4 }
        if minimum > Double(monthsSince(r, n.lastFamilyRebellion[state].optionalNumber ?? -10000)) { return false }
        let ruling = rulingId(r, state)
        if !n.families.has(ruling) { return false }
        let rel = Nobility.relation(r, id, ruling)
        if rel > -50 { return false }
        var chance = f(f(f(f(abs(rel) / 100) * f(0.1)) + f(f(f(100 - (d.destiny.optionalNumber ?? 0)) / 100) * f(0.1))) + f(0.05))
        let p = polities.firstIndex(of: r.civilization.nations[state].polity.asString) ?? -1
        if p == 2 || p == 3 { chance = f(chance * f(0.5)) } else if p == 4 { chance = f(chance * f(1.5)) }
        let leaderId = r.people.nations[state].leaderId
        if !leaderId.isNull, let leader = People.person(r, leaderId.asInt), leader.isAlive.asBool {
            chance = f(chance * f(1 - resistance(leader.traits.isNull ? [] : leader.traits.asArray.map(\.asString))))
        }
        return chance > Nobility.Random(n: n).value()
    }
    static func rallyProbability(_ r: JS, _ rebel: String, _ target: String, _ restored: String?) -> Double {
        let n = r.nobility, a = n.families[rebel], b = n.families[target], ka = r.kin.families[rebel], kb = r.kin.families[target]
        var base = f(0.2)
        if let restored {
            if let lived = b.stateResidenceMonths[restored].optionalNumber, lived > 0 { base = lived > 240 ? f(1) : lived > 120 ? f(0.9) : lived > 60 ? f(0.8) : f(0.7) }
            if b.historicalStateIds.asArray.contains(where: { $0.asString == restored }) { base = f(base + f(0.3)) }
        }
        let here = b.stateResidenceMonths[b.nationId.asString].optionalNumber ?? 0
        if 12 > here { base = f(base + f(0.3)) } else if 60 > here { base = f(base + f(0.1)) } else if here >= 240 { base = f(base - f(0.2)) }
        var p = f(f(Nobility.relation(r, rebel, target) / 200) + base)
        if ka.cultureName.optionalString == kb.cultureName.optionalString { p = f(p + f(0.15)) }
        if let ra = a.religionId.optionalString, !ra.isEmpty, ra == b.religionId.optionalString { p = f(p + f(0.1)) }
        p = f(p + f(f(f(a.influence.asNumber - b.influence.asNumber) / 1000) * f(0.1)))
        let ruling = rulingId(r, b.nationId.asString)
        if n.families.has(ruling) && ruling != target { let rel = Nobility.relation(r, target, ruling); if -50 > rel { p = f(p + f(0.2)) } else if rel > 50 { p = f(p - f(0.2)) } }
        if b.rallyCooldown.asNumber > 0 { return 0 }
        return 0 > p ? 0 : p > 1 ? 1 : p
    }
    static func changeRelation(_ n: JS, _ a: String, _ b: String, _ d: Double) {
        if n.relations[a].isNull { n.relations[a] = .object() }
        let row = n.relations[a]; row[b] = JS(max(-100, min(100, f((row[b].optionalNumber ?? 0) + d))))
    }
    static func rally(_ r: JS, _ rebel: String, _ restored: String?) -> [String] {
        let n = r.nobility, state = n.families[rebel].nationId.asString, random = Nobility.Random(n: n)
        var joined = [String]()
        for id in n.families.objectKeys.filter({ n.families[$0].nationId.asString == state && $0 != rebel && !n.families[$0].ruling.asBool }) {
            let p = rallyProbability(r, rebel, id, restored)
            if p > random.value() { joined.append(id); n.families[id].rallyCooldown = JS(24); changeRelation(n, rebel, id, 20); changeRelation(n, id, rebel, 20) }
            else { changeRelation(n, rebel, id, -5); changeRelation(n, id, rebel, -5) }
        }
        return joined.filter { !Nobility.hasCourt(r, $0) }
    }
    static func rebelLeader(_ r: JS, _ id: String) -> JS? {
        let k = r.kin.families[id]
        if let head = People.person(r, k.headId.asInt), head.isAlive.asBool { return head }
        let list = k.memberIds.asArray.compactMap { People.person(r, $0.asInt) }.filter { $0.isAlive.asBool && $0.familyId.asInt == k.id.asInt && $0.age.asInt >= 16 && $0.age.asInt <= 60 }
        func score(_ p: JS) -> Double { let s = People.skills(p); return f(s.charisma + s.military + s.administrative) }
        return stableSorted(list) { a, b in
            let ma = a.gender.asInt == 0, mb = b.gender.asInt == 0
            if ma != mb { return ma }
            if score(a) != score(b) { return score(a) > score(b) }
            return abs(a.age.asInt - 35) < abs(b.age.asInt - 35)
        }.first
    }
    static func restorationWeight(_ r: JS, _ id: String, _ state: String) -> Double {
        let fam = r.nobility.families[id], rd = fam.rulingDuration[state].optionalNumber ?? 0
        if 12 > rd { return 0 }
        var base = 36 > rd ? f(rd * f(0.5)) : 120 > rd ? f(f(f(rd - 36) * f(0.3)) + 18) : 360 > rd ? f(f(f(rd - 120) * f(0.2)) + 43) : f(f(f(rd - 360) * f(0.1)) + 91)
        var decay = f(1)
        if let t = fam.lastRulingTime[state].optionalNumber {
            let m = Double(monthsSince(r, t))
            decay = 12 > m ? f(1) : 60 > m ? f(1 - f(f(m - 12) * f(0.005))) : 180 > m ? f(f(0.76) - f(f(m - 60) * f(0.003))) : 360 > m ? f(f(0.4) - f(f(m - 180) * f(0.001))) : f(0.22)
        }
        let nation = r.civilization.nations[state], polity = polities.firstIndex(of: nation.polity.asString) ?? -1
        let polityMul = polity == 1 ? f(1.5) : polity == 0 ? f(1.3) : polity == 3 ? f(0.7) : f(1)
        let cultureMul = r.kin.families[id].cultureName.optionalString == nation.cultureId.optionalString ? f(1.2) : f(1)
        base = min(base, 150)
        let land = min(f(Double(fam.controlledProvinces.length * 3)), 30), influence = f(f(fam.influence.asNumber / 1000) * 20)
        let restMul = max(f(0.1), f(1 - f((r.sovereignty.restorations[state].optionalNumber ?? 0) * f(0.1))))
        var w = f(f(f(f(f(f(f(base + 20) + influence) + land) * decay) * polityMul) * cultureMul) * restMul)
        if rd >= 1200 { w = f(w * f(1.5)) }
        return 0 > w ? 0 : w > 95 ? 95 : w
    }
    static func tryRestoration(_ r: JS, _ id: String) -> String? {
        let n = r.nobility, fam = n.families[id]
        for state in fam.historicalStateIds.asArray.map(\.asString) {
            if !r.people.nations.has(state) || alive(r, state) || (r.sovereignty.restorations[state].optionalNumber ?? 0) >= 15 { continue }
            let w = restorationWeight(r, id, state)
            if w > f(Nobility.Random(n: n).value() * 100) { return state }
        }
        return nil
    }
    /// transferRebelArmies47.
    static func transferArmies(_ r: JS, mother: String, rebel: String, land: Set<String>, families: [Int]) {
        let ledger = r.nobility.isNull ? JS.object() : r.nobility.armies
        var moved = 0
        for v in Armies.space(r) {
            let a = v.army, row = ledger[a.id.asString]
            if a.nationId.asString != mother || a.status.asString == "destroyed" { continue }
            let familyArmy = !row.isNull && families.contains(row.familyId.asInt)
            if !familyArmy && !land.contains(a.originId.asString) { continue }
            if !row.isNull && row.central.asBool && land.contains(a.originId.asString) { row.familyId = JS(families[0]); row.central = JS(false) }
            a.nationId = JS(rebel); a.status = JS("idle"); a.route = .array(); a.progress = JS(0)
            let t = v.travel.clone(); t.status = JS("halted"); r.armyPositions.records[a.id.asString] = t
            r.battles.plans.delete(a.id.asString); r.reorganization.active.delete(a.id.asString); r.tactics.rounds.delete(a.id.asString)
            let tick = r.clock.tick.asInt, cavalry = Armies.stateTraits(r, rebel).contains("CavalryTradition")
            let s = JS.object(); s.nationAtInitialization = JS(rebel); s.initializedTick = JS(tick); s.cavalryTradition = JS(cavalry)
            s.base = JS(Armies.speed(seed: r.world.custom.seed.asString, armyId: a.id.asString, nationId: rebel, tick: tick, cavalry: cavalry)); r.forceSpeed.armies[a.id.asString] = s
            let traits = Armies.damageTraits(r, rebel)
            let c = JS.object(); c.nationAtInitialization = JS(rebel); c.initializedTick = JS(tick); c.command = JS("central"); c.damageTraitsAtInitialization = .array(traits.map { JS($0) })
            c.damageToArmy = JS(f((traits.contains("FieldCombatElite") ? f(1.5) : 1) * 40)); c.damageToProvince = JS(f((traits.contains("SiegeCapture") ? f(1.5) : 1) * 10)); r.combatPersonnel.armies[a.id.asString] = c
            let d = JS.object(); d.targetId = .null; d.garrisonId = .null; d.campaignId = .null; d.decision = JS("waiting"); d.nextTick = JS(0); d.issuedTick = .null; d.reason = JS("等待自主军令评估。")
            r.armyAutonomy.armies[a.id.asString] = d
            let u = JS.object(); u.base = JS(f(f(1) * 1.25)); u.initializedTick = JS(tick); r.upperCombat.armies[a.id.asString] = u
            moved += 1
        }
        if moved == 0 {
            // JavaScript Set order: the land set is built from the province list in order.
            if let home = landOrder.first(where: { p in r.world.provinces.asArray.first { $0.id.asString == p }?.controller.asString == rebel }), r.world.armies.length < 500 {
                Armies.create(r, nation: rebel, home: home, kind: "emergency")
            }
        }
    }
    static var landOrder = [String]()
    /// launchNobleRevolt47.
    static func launch(_ r: JS, _ id: String, members: [String], reason: String, cb: Int, legacy: Int, goal: Int, before: () -> Void = {}, restore: String?) -> String? {
        let n = r.nobility, fam = n.families[id], mother = fam.nationId.asString
        guard let leader = rebelLeader(r, id) else { return nil }
        var provinces = [String]()
        for v in members { for p in n.families[v].controlledProvinces.asArray.map(\.asString) where !provinces.contains(p) { provinces.append(p) } }
        provinces = provinces.filter { p in r.world.provinces.asArray.first { $0.id.asString == p }?.controller.asString == mother }
        if provinces.isEmpty || provinces.count >= r.world.provinces.asArray.filter({ $0.controller.asString == mother }).count { return nil }
        let home = fam.homeProvinceId.optionalString
        provinces = stableSorted(provinces) { a, b in (a == home ? 1 : 0) > (b == home ? 1 : 0) }
        if !r.world.cities.asArray.contains(where: { $0.provinceId.asString == provinces[0] }) { return nil }
        before()
        var keep = [String: JS](); for v in members { keep[v] = n.families[v].controlledProvinces.clone() }
        landOrder = provinces
        let familyIds = members.map { Int($0)! }
        if let restore {
            for v in members { Nobility.moveFamily(r, v, restore); n.families[v].controlledProvinces = keep[v]! }
            for p in provinces { let q = r.world.provinces.asArray.first { $0.id.asString == p }!; PeaceBridge.transferEconomy(r, p, q.controller.asString, restore); q.controller = JS(restore); q.legalOwner = JS(restore) }
            let moved = Set(provinces); r.occupation.sieges.asArray = r.occupation.sieges.asArray.filter { !moved.contains($0.provinceId.asString) }
            r.world.nations.asArray.first { $0.id.asString == restore }!.capitalId = r.world.cities.asArray.first { $0.provinceId.asString == provinces[0] }!.id.clone()
            Government.relocateLostCapitals(r); Wars.reconcileCore(r); Founding.reconcilePorts?(r)
            r.chronicle.ended.delete(restore)
            r.sovereignty.restorations[restore] = JS((r.sovereignty.restorations[restore].optionalNumber ?? 0) + 1); Vassals.bump(r.sovereignty)
            let state = Vassals.name(r, restore), place = r.world.provinces.asArray.first { $0.id.asString == provinces[0] }!.name.asString
            People.announce(r, kind: "restoration", text: "\(r.kin.families[id].surname.asString)家族复国，恢复\(state)的统治", reason: "\(reason)\(state)于\(place)复国（第\(r.sovereignty.restorations[restore].asInt)次）。", nations: [restore], province: provinces[0])
            People.appointKnownPerson(r, restore, leader, cause: "restoration")
            transferArmies(r, mother: mother, rebel: restore, land: Set(provinces), families: familyIds)
            RebelWar.startInternalWar(r, rebel: restore, mother: mother, casusBelli: cb, legacyType: legacy, goalType: goal)
            return restore
        }
        let founding = Founding.foundState(r, parent: mother, provinces: provinces, reason: reason, family: Founding.RebelFamily(familyId: Int(id)!, leaderId: leader.id.asInt, moveFamilies: { state in
            for v in members { Nobility.moveFamily(r, v, state); n.families[v].controlledProvinces = keep[v]! }
            People.setRulingFamily(r, state, Int(id)!)
        }))
        let rebel = founding.nationId.asString
        transferArmies(r, mother: mother, rebel: rebel, land: Set(provinces), families: familyIds)
        RebelWar.startInternalWar(r, rebel: rebel, mother: mother, casusBelli: cb, legacyType: legacy, goalType: goal)
        return rebel
    }
    @discardableResult
    public static func startFamilyRebellion(_ r: JS, _ id: String) -> String? {
        let n = r.nobility, fam = n.families[id]
        if fam.isNull { return nil }
        let mother = fam.nationId.asString
        if !alive(r, mother) || Nobility.hasCourt(r, id) || r.foundings.isNull { return nil }
        if rebelLeader(r, id) == nil { return nil }
        let restored = tryRestoration(r, id), joined = rally(r, id, restored), name = r.kin.families[id].surname.asString
        let rebel = launch(r, id, members: [id] + joined, reason: restored != nil ? "\(name)家族起兵复国。" : "\(name)家族起兵，以家族领地建立新的国家。", cb: 15, legacy: 4, goal: 7, before: {
            People.announce(r, kind: "uprising", text: "\(name)家族叛乱", reason: "\(name)家族对统治家族的关系降至冰点，联合\(joined.count)个家族起兵。", nations: [mother], province: fam.homeProvinceId.optionalString)
        }, restore: restored)
        if rebel != nil { n.lastFamilyRebellion[mother] = r.life.gameTime.clone() }
        return rebel
    }
    static func checkFamilyRebellions(_ r: JS) {
        let n = r.nobility
        if n.isNull || !n.settings.allowFamilyRebellion.isTruthy { return }
        for id in n.families.objectKeys where n.families.has(id) && shouldRebel(r, id) { startFamilyRebellion(r, id) }
    }

    // MARK: Civil war (civilization47-nobility-civil-war)
    static let titles = [8: "爆发继承权内战", 9: "爆发改革战争", 10: "爆发分离主义叛乱", 11: "爆发推翻战争"]
    static func land(_ r: JS, _ id: String) -> Int { r.world.provinces.asArray.filter { $0.controller.asString == id }.count }
    static func top(_ r: JS, _ ids: [String]) -> String { ids.dropFirst().reduce(ids[0]) { r.nobility.families[$1].influence.asNumber > r.nobility.families[$0].influence.asNumber ? $1 : $0 } }
    static func inCivilWar(_ r: JS, _ id: String) -> Bool {
        let s = Wars.stateNumber(r, id)
        return r.nativeWars.campaigns.asArray.contains { c in
            guard c.endedTick.isNull, !c.internal.isNull, let cb = c.internal.casusBelliId.optionalNumber, cb >= 10 && cb <= 13 else { return false }
            return c.internal.motherStateId.asInt == s || c.internal.rebelStateId.asInt == s
        }
    }
    static func discontented(_ r: JS, _ state: String) -> [String]? {
        let n = r.nobility, ruling = rulingId(r, state)
        if !n.families.has(ruling) { return nil }
        return n.families.objectKeys.filter { v in let fam = n.families[v]; return fam.nationId.asString == state && !fam.ruling.asBool && fam.controlledProvinces.length > 0 && -40 > Nobility.relation(r, v, ruling) && fam.influence.asNumber > 100 }
    }
    static func distanceFromCapital(_ r: JS, _ state: String, _ province: String) -> Double {
        let capitalId = r.world.nations.asArray.first { $0.id.asString == state }!.capitalId.optionalString
        let capital = r.world.cities.asArray.first { $0.id.optionalString == capitalId }, scale = r.scale.asNumber
        let a = r.world.provinces.asArray.first { $0.id.optionalString == capital?.provinceId.optionalString }!.center, b = r.world.provinces.asArray.first { $0.id.asString == province }!.center
        return f(jsHypot(f(a.x.asNumber / scale - b.x.asNumber / scale), f(a.y.asNumber / scale - b.y.asNumber / scale)))
    }
    static func determineType(_ r: JS, _ state: String, _ rebels: [String]) -> Int {
        let n = r.nobility, ruling = rulingId(r, state), lead = top(r, rebels)
        if n.families.has(ruling) && r.kin.families[lead].surname.optionalString == r.kin.families[ruling].surname.optionalString { return 8 }
        var far = true, total = 0.0, count = 0
        outer: for v in rebels { for p in n.families[v].controlledProvinces.asArray.map(\.asString) { let d = distanceFromCapital(r, state, p); total = f(total + d); count += 1; if 10 > d { far = false; break outer } } }
        if far && count > 0 && f(total / Double(count)) > 15 { return 10 }
        if rebels.count >= 2 && 60 > (r.destiny.nations[state].destiny.optionalNumber ?? 0) {
            let culture = r.civilization.nations[state].cultureId.optionalString
            return rebels.contains { r.kin.families[$0].cultureName.optionalString != culture } ? 9 : 11
        }
        return 11
    }
    static func cause(_ r: JS, _ state: String, _ rebels: [String], _ type: Int) -> String {
        let n = r.nobility, lead = top(r, rebels), name = r.kin.families[lead].surname.asString, rulingKey = rulingId(r, state)
        let ruling: String? = n.families.has(rulingKey) ? r.kin.families[rulingKey].surname.asString : nil
        let nation = r.civilization.nations[state], stateName = Vassals.name(r, state), destiny = r.destiny.nations[state].destiny.optionalNumber ?? 0
        switch type {
        case 8:
            let leaderId = r.people.nations[state].leaderId
            if !leaderId.isNull, let leader = People.person(r, leaderId.asInt), leader.childrenIds.length == 0 { return "\(name)家族因统治者无嗣而发起继承战争" }
            return name == (ruling ?? stateName) ? "\(name)家族旁支对王位继承权提出异议" : "\(name)家族质疑\(ruling ?? "undefined")家族的统治合法性"
        case 9: return 40 > destiny ? "\(name)等家族联合起来反对腐败的\(stateName)政权" : rebels.count >= 3 ? "\(name)等\(rebels.count)个家族结成联盟推翻现政权" : "\(name)家族要求进行彻底的政治改革"
        case 10:
            if r.kin.families[lead].cultureName.optionalString != nation.cultureId.optionalString { return "\(name)家族以文化差异为由寻求独立" }
            if n.families[lead].religionId.optionalString != nation.religionId.optionalString { return "\(name)家族因宗教分歧而要求独立" }
            return "边远地区的\(name)家族不再服从中央统治"
        default:
            if let ruling, -70 > Nobility.relation(r, lead, rulingKey) { return "\(name)家族与\(ruling)家族积怨已久决意推翻其统治" }
            let rulingInfluence = ruling != nil ? n.families[rulingKey].influence.asNumber : 0
            return n.families[lead].influence.asNumber > f(rulingInfluence * f(1.5)) ? "势力强大的\(name)家族不甘屈居人下" : "\(name)家族不堪\(ruling ?? "null")家族的压迫而起兵"
        }
    }
    @discardableResult
    public static func startCivilWar(_ r: JS, _ state: String, _ list: [String]) -> String? {
        let n = r.nobility
        if inCivilWar(r, state) || r.foundings.isNull { return nil }
        var rebels = list.filter { !Nobility.hasCourt(r, $0) }
        if rebels.isEmpty { return nil }
        let type = determineType(r, state, rebels)
        n.lastCivilWar[state] = r.life.gameTime.clone()
        let lead = top(r, rebels), why = cause(r, state, rebels, type), restored = tryRestoration(r, lead)
        for v in rally(r, lead, restored) where !rebels.contains(v) { rebels.append(v) }
        let motherName = Vassals.name(r, state), surname = r.kin.families[lead].surname.asString
        guard let rebel = launch(r, lead, members: [lead] + rebels.filter { $0 != lead }, reason: "\(surname)家族领导内战，\(restored != nil ? "借内战复国。" : "叛军以家族领地建立新的国家。")",
                                 cb: type + 2, legacy: type, goal: [10, 9, 7, 8][type - 8], restore: restored) else { return nil }
        if restored == nil && type != 10 {
            let own = r.civilization.nations[rebel], from = r.civilization.nations[state].name.custom
            if !from.isNull { own.name.custom = from.clone(); r.world.nations.asArray.first { $0.id.asString == rebel }!.name = JS(nationName(own)); Vassals.bump(r.civilization) }
        }
        n.lastCivilWar[state] = r.life.gameTime.clone()
        let rebelName = Vassals.name(r, rebel), loyal = n.families.objectValues.filter { $0.nationId.asString == state }.count
        let w = JS.object()
        w.motherId = JS(state); w.type = JS(type); w.cause = JS(why); w.familyId = JS(Int(lead)!); w.familyIds = .array(rebels.map { JS(Int($0)!) }); w.rebelName = JS(rebelName); w.motherName = JS(motherName)
        n.civilWars[rebel] = w
        People.announce(r, kind: "uprising", text: "\(motherName)\(titles[type]!)", reason: "\(why)，叛军成立了\(rebelName)。\(motherName)爆发内战，\(surname)家族领导\(rebels.count)个叛乱家族对抗\(loyal)个忠诚家族。", nations: [state, rebel], province: nil)
        return rebel
    }
    /// nationName47 with a custom name (template {Name}) or the culture state title.
    static func nationName(_ n: JS) -> String {
        let custom = n.name.custom
        if custom.isNull { return Opening.stateTitle(n.name.value.asString, polity: n.polity.asString, religion: n.religionId.asString) }
        return custom.asString
    }
    static func checkStateForCivilWar(_ r: JS, _ state: String) {
        let n = r.nobility, d = r.destiny.nations[state]
        if !n.families.has(rulingId(r, state)) { return }
        var minimum = n.settings.civilWarMinMonths.asNumber
        if d.manifest.isTruthy && d.manifestCount.asNumber > 0 { minimum *= 4 }
        if minimum > Double(monthsSince(r, n.lastCivilWar[state].optionalNumber ?? -10000)) { return }
        let rebels = discontented(r, state)!, destiny = d.destiny.optionalNumber ?? 0
        if rebels.count < 2 || !(60 > destiny) { return }
        let chance = f(f(f(60 - destiny) * f(0.01)) + f(0.1))
        if chance > Nobility.Random(n: n).value() { startCivilWar(r, state, rebels) }
    }
    static func checkCivilWars(_ r: JS) {
        let n = r.nobility
        if n.isNull || !n.settings.allowCivilWar.isTruthy || r.foundings.isNull { return }
        for v in r.world.nations.asArray.map(\.id.asString) where land(r, v) >= 15 { checkStateForCivilWar(r, v) }
    }
    /// Installs the month-6/12 checks into the family step.
    public static func install() {
        Nobility.monthlyChecks = { r in
            checkFamilyRebellions(r)
            if r.life.currentDate.month.asInt == 12 { checkCivilWars(r) }
        }
    }
}
