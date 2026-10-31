import Foundation

/// Coalitions, alliances' bookkeeping and vassals on the run state (war46-alliance / war46-vassals,
/// civilization47-diplomatic-world coalition building with the native side builder, civilization47-
/// alliance reconcile, civilization47-vassal and civilization47-vassal-manager).
public enum Vassals {
    static let f = Native.fr
    static func alive(_ r: JS, _ id: String) -> Bool { r.world.provinces.asArray.contains { $0.controller.asString == id } }
    static func name(_ r: JS, _ id: String) -> String { r.world.nations.asArray.first { $0.id.asString == id }!.name.asString }
    public static func allianceOf(_ r: JS, _ id: String) -> JS? { r.alliances.records.asArray.first { $0.endedTick.isNull && $0.members.asArray.contains { $0.asString == id } } }
    public static func overlord(_ r: JS, _ id: String) -> String? { r.vassals.records.asArray.first { $0.vassalId.asString == id && $0.endedTick.isNull }?.overlordId.asString }
    static func bump(_ s: JS) { s.revision = JS(s.revision.asNumber + 1) }

    // MARK: Coalitions (buildParticipants47 / nativeBuildWarSides, openCoalitionRelations47)
    public static func buildParticipants(_ r: JS, attacker: String, defender: String, rebel: Int? = nil, mother: Int? = nil) -> JS {
        struct S { let id: Int; let key: String; let dead: Bool }
        let states = r.world.nations.asArray.map { n in S(id: r.people.nations[n.id.asString].id.asInt, key: n.id.asString, dead: !alive(r, n.id.asString)) }
        func find(_ key: String) -> S? { states.first { $0.key == key } }
        func byId(_ id: Int) -> S? { states.first { $0.id == id } }
        let a = find(attacker)!, b = find(defender)!, time = r.life.gameTime
        var result = [JS](), seen = Set<Int>()
        func add(_ s: S?, _ side: Int, _ role: Int, _ primary: Bool) {
            guard let s, !s.dead, seen.insert(s.id).inserted else { return }
            let m = JS.object(); m.stateId = JS(s.id); m.side = JS(side); m.role = JS(role); m.joinedAt = time.clone(); m.isPrimary = JS(primary); result.append(m)
        }
        func vassalsOf(_ s: S) -> [S?] { r.vassals.records.asArray.filter { $0.endedTick.isNull && $0.overlordId.asString == s.key }.map { find($0.vassalId.asString) } }
        func kin(_ s: S?, _ side: Int) {
            guard let s else { return }
            if r.vassals.records.asArray.contains(where: { $0.endedTick.isNull && $0.overlordId.asString == s.key }) { for v in vassalsOf(s) { add(v, side, 2, false) } }
            if let lordKey = overlord(r, s.key) { guard let lord = find(lordKey) else { return }; add(lord, side, 2, false); for v in vassalsOf(lord) { add(v, side, 2, false) } }
        }
        func side(_ s: S, _ which: Int, _ role: Int) {
            add(s, which, role, true)
            for allyKey in allianceOf(r, s.key)?.members.asArray.map(\.asString) ?? [] { if allyKey == s.key { continue }; let ally = find(allyKey); add(ally, which, 2, false); kin(ally, which) }
            kin(s, which)
        }
        if let rebel, let mother {
            let rs = byId(rebel), ms = byId(mother)
            if let rs, let ms, rs.id != ms.id, [a.id, b.id].contains(rs.id), [a.id, b.id].contains(ms.id) {
                let rebelSide = rs.id == a.id ? 0 : 1; add(rs, rebelSide, rebelSide, true); side(ms, rebelSide == 0 ? 1 : 0, rebelSide == 0 ? 1 : 0)
            } else { add(a, 0, 0, true); side(b, 1, 1) }
        } else { side(a, 0, 0); side(b, 1, 1) }
        return .array(result)
    }
    public static func openCoalitionRelations(_ r: JS, _ members: JS) {
        func key(_ id: Int) -> String { r.world.nations.asArray.first { r.people.nations[$0.id.asString].id.asInt == id }!.id.asString }
        for a in members.asArray where a.side.asInt == 0 { for b in members.asArray where b.side.asInt == 1 {
            let p = Wars.relation(r, key(a.stateId.asInt), key(b.stateId.asInt))!
            if p.status.asString != "war" { p.status = JS("war"); p.sinceDay = r.world.day.clone(); p.truceUntilDay = JS(0) }
        } }
    }

    // MARK: Alliances (reconcileAlliances47, leaveAlliance47)
    static func dissolve(_ r: JS, _ v: JS, actor: String?, force: Bool = false) -> Bool {
        if !v.endedTick.isNull || v.unbreakable.isTruthy && !force { return false }
        let members = v.members.asArray.map(\.asString)
        v.members = .array(); v.endedTick = r.clock.tick.clone()
        if let actor {
            for id in members { r.alliances.lastAction[id] = JS(f(r.life.gameTime.asNumber)) }
            let base = v.name.asString.hasSuffix("联盟") ? String(v.name.asString.dropLast(2)) : v.name.asString
            People.announce(r, kind: "diplomacy", text: "\(base)联盟被\(name(r, actor))解散", reason: "\(name(r, actor))终止联盟；既有战争与土地归属保留。", nations: members, province: nil)
        }
        bump(r.alliances); return true
    }
    public static func reconcileAlliances(_ r: JS) {
        for n in r.world.nations.asArray where !r.alliances.lastAction.has(n.id.asString) { r.alliances.lastAction[n.id.asString] = JS(-100); bump(r.alliances) }
        let live = Set(r.world.provinces.asArray.map(\.controller.asString))
        for v in r.alliances.records.asArray where v.endedTick.isNull {
            let members = v.members.asArray.filter { live.contains($0.asString) }
            if members.count != v.members.length { v.members = .array(members); bump(r.alliances) }
            if v.members.length < 2 { _ = dissolve(r, v, actor: nil, force: true) }
        }
    }
    @discardableResult
    public static func leaveAlliance(_ r: JS, _ id: String, force: Bool = false) -> Bool {
        guard let v = allianceOf(r, id) else { return false }
        let dead = !alive(r, id)
        if v.unbreakable.isTruthy && !force && !dead { return false }
        v.members = .array(v.members.asArray.filter { $0.asString != id }); v.joinedTime = JS(f(r.life.gameTime.asNumber)); bump(r.alliances)
        if !dead { People.announce(r, kind: "diplomacy", text: "\(name(r, id))退出\(v.name.asString)", reason: "退出盟约不等于退出战争，已参加的战争仍继续。", nations: [id] + v.members.asArray.map(\.asString), province: nil) }
        if v.members.length == 1 { _ = dissolve(r, v, actor: v.members[0].asString, force: force || dead) }
        return true
    }

    // MARK: Vassals (civilization47-vassal)
    @discardableResult
    public static func release(_ r: JS, _ vassalId: String, reason: String = "released") -> Bool {
        guard let v = r.vassals.records.asArray.first(where: { $0.vassalId.asString == vassalId && $0.endedTick.isNull }) else { return false }
        let destroyed = reason == "overlord-destroyed", lord = v.overlordId.asString
        v.endedTick = r.clock.tick.clone(); v.endReason = JS(reason); bump(r.vassals)
        People.announce(r, kind: "diplomacy", text: destroyed ? "\(name(r, vassalId))因\(name(r, lord))的灭亡而获得独立" : "\(name(r, vassalId))从\(name(r, lord))的统治下获得独立",
                        reason: destroyed ? "宗主失去全部领土，附庸恢复独立外交。" : reason == "independence" ? "独立战争和约生效，宗属关系解除。" : "解除附庸：宗属关系结束，恢复独立外交。", nations: [vassalId, lord], province: nil)
        return true
    }
    public static func reconcileVassals(_ r: JS) {
        for v in r.vassals.records.asArray where v.endedTick.isNull {
            if !alive(r, v.vassalId.asString) { v.endedTick = r.clock.tick.clone(); v.endReason = JS("vassal-destroyed"); bump(r.vassals) }
            else if !alive(r, v.overlordId.asString) { release(r, v.vassalId.asString, reason: "overlord-destroyed") }
        }
    }

    // MARK: Vassal manager (civilization47-vassal-manager)
    static let reasons = ["powerful": "实力已接近宗主", "war": "宗主在战争中溃败", "destiny": "国运高于宗主", "development": "长期发展积累了实力", "default": "独立意愿触发"]
    static func tributeAmount(_ perMonth: Double, _ rate: Double) -> Int { Native.roundInt(f(f(f(Double(Native.i32(Int(perMonth)))) * f(rate)) * 12)) }
    static func rebellion(years: Int, ratio input: Double, resistance: Double, destinyDifference: Double, collapsed: () -> Bool, random: () -> Double) -> String? {
        if years < 12 { return nil }
        let ratio = f(input)
        var chance = f(f(ratio * f(0.05)) * f(1 - f(resistance)))
        if ratio > f(0.85) { return "powerful" }
        if collapsed() {
            chance = f(chance * f(1.5)); if ratio > f(0.4) { chance = f(chance * f(1.3)) }
            if chance > random() { return "war" }
        }
        let difference = f(destinyDifference)
        if difference > 30 { chance = f(chance + f(min(f(difference * f(0.002)), f(0.2)) * ratio)); if chance > random() { return "destiny" } }
        if years >= 10 { chance = f(chance + f(min(f(f(Double(years)) * f(0.01)), f(0.3)) * ratio)); if ratio > f(0.3) && chance > random() { return "development" } }
        chance = max(f(0.002), min(f(0.1), chance))
        return chance > random() ? "default" : nil
    }
    /// advanceVassalManager47; `collapsed(r, stateId)` is the peace AI's collapse check for an active war.
    public static func advanceManager(_ r: JS) {
        let s = r.vassalManager
        if r.world.day.asInt == s.lastDay.asInt { return }
        s.lastDay = r.world.day.clone(); bump(s)
        if !s.enabled.asBool { return }
        let date = r.life.currentDate
        if date.month.asInt == 12 {
            for v in r.vassals.records.asArray where v.endedTick.isNull && v.updateDay.asInt == date.day.asInt && alive(r, v.vassalId.asString) && alive(r, v.overlordId.asString) {
                let a = r.finance.nations[v.vassalId.asString], b = r.finance.nations[v.overlordId.asString]
                let gold = Native.i32(a.gold.asInt), lordGold = Native.i32(b.gold.asInt), atWar = Wars.relation(r, v.vassalId.asString, v.overlordId.asString)?.status.asString == "war"
                let receipt = JS.object()
                receipt.vassalId = v.vassalId.clone(); receipt.overlordId = v.overlordId.clone(); receipt.tick = r.clock.tick.clone(); receipt.year = date.year.clone(); receipt.dateDay = date.day.clone()
                var newGold = gold, newLord = lordGold
                if atWar { receipt.status = JS("at-war"); receipt.amount = .null }
                else {
                    let amount = tributeAmount(a.goldPerMonth.asNumber, v.tributeRate.asNumber)
                    if gold < amount { receipt.status = JS("insufficient"); receipt.amount = JS(amount) }
                    else { receipt.status = JS("paid"); receipt.amount = JS(amount); newGold = Native.iadd(gold, -amount); newLord = Native.iadd(lordGold, amount) }
                }
                s.receipts.push(receipt); if s.receipts.length > 256 { s.receipts.asArray = Array(s.receipts.asArray.suffix(256)) }
                a.gold = JS(newGold); b.gold = JS(newLord)
            }
        }
        var pending = [(vassal: String, lord: String, reason: String, years: Int)]()
        for v in r.vassals.records.asArray where v.endedTick.isNull && v.updateDay.asInt == date.day.asInt && alive(r, v.vassalId.asString) && alive(r, v.overlordId.asString) {
            let vassal = v.vassalId.asString, lordKey = v.overlordId.asString, lord = Wars.stateNumber(r, lordKey)
            let leaderId = r.people.nations[lordKey].leaderId
            var resistance = 0.0
            if !leaderId.isNull, leaderId.asInt > 0 {
                let leader = r.people.persons[leaderId.asInt.description]
                if !leader.isNull && leader.alive.isTruthy { for t in leader.traits.asArray.map(\.asString) { resistance = f(resistance + f(Nobility.trait(t)?.rebellionResistanceModifier.optionalNumber ?? 0)) } }
            }
            let ratio = f(PeaceBridge.strength(r, vassal) / PeaceBridge.strength(r, lordKey))
            let difference = f(r.destiny.nations[vassal].destiny.asNumber - r.destiny.nations[lordKey].destiny.asNumber)
            let years = People.yearSince(r, v.time.asNumber)
            let reason = rebellion(years: years, ratio: ratio, resistance: resistance, destinyDifference: difference, collapsed: {
                r.nativeWars.campaigns.asArray.contains { c in
                    c.endedTick.isNull && c.history.asString == "complete" && c.participants.asArray.contains { $0.stateId.asInt == lord } && PeaceAI(war: PeaceBridge.war(c), world: PeaceBridge.world(r)).collapsed(lord)
                }
            }, random: { f(Diplomatic.random(r.nativeDiplomacy)) })
            if let reason, date.month.asInt % 3 == 0 { pending.append((vassal, lordKey, reason, years)) }
        }
        for p in pending {
            if Wars.relation(r, p.vassal, p.lord)?.status.asString == "war" { continue }
            let a = Wars.stateNumber(r, p.vassal), b = Wars.stateNumber(r, p.lord)
            let internalWar = JS.object(); internalWar.casusBelliId = JS(16); internalWar.legacyType = JS(10); internalWar.rebelStateId = JS(a); internalWar.motherStateId = JS(b)
            let members = buildParticipants(r, attacker: p.vassal, defender: p.lord, rebel: a, mother: b)
            openCoalitionRelations(r, members)
            let goal = JS.object(); goal.id = JS(1); goal.type = JS(7); goal.addedBy = JS(a); goal.target = JS(b); goal.beneficiary = JS(a)
            let scope = JS.object(); scope.provinceIds = .array(); scope.requiredCount = JS(0); goal.scope = scope
            let war = Wars.register(r, attacker: p.vassal, defender: p.lord, goals: .array([goal]), internalWar: internalWar, members: members)
            let row = JS.object(); row.warId = war.id.clone(); row.vassalId = JS(p.vassal); row.overlordId = JS(p.lord); row.tick = r.clock.tick.clone(); row.years = JS(p.years); row.reason = JS(p.reason)
            s.rebellions.push(row)
            r.nativeDiplomacy.nations[p.vassal].activeTime = JS(f(r.life.gameTime.asNumber)); r.nativeDiplomacy.nations[p.lord].passiveTime = JS(f(r.life.gameTime.asNumber)); bump(r.nativeDiplomacy)
            People.announce(r, kind: "diplomacy", text: "傀儡国\(name(r, p.vassal))发生叛变", reason: "反抗宗主国\(name(r, p.lord))：\(reasons[p.reason]!)；已附属 \(p.years) 年。保持宗属关系直到实际和约解除，交战期间不缴贡金。", nations: [p.vassal, p.lord], province: nil)
        }
    }
}

/// The persisted diplomacy stream (civilization47-diplomatic-state diplomacyRandom46: mulberry32).
public enum Diplomatic {
    public static func random(_ s: JS) -> Double {
        let rng = UInt32(truncatingIfNeeded: Int64(s.rng.asNumber)) &+ 0x6d2b79f5
        s.rng = JS(Double(rng))
        var t = rng
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        s.draws = JS(s.draws.asNumber + 1)
        return Double(t ^ (t >> 14)) / 4294967296
    }
}
