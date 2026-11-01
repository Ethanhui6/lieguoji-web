import Foundation

/// The nation panel (original StateInfoUI, web CultureNationRelations47 / campaign-card47) and the
/// state-level diplomatic actions of the web's global orders (civilization47-global-orders).
extension NativeEngine {
    func nationIndex(_ id: String?) -> Int { id.flatMap { s in run.world.nations.asArray.firstIndex { $0.id.asString == s } } ?? -1 }

    /// Ruler, polity, culture, religion, treasury and destiny, relations (enemies, alliance,
    /// overlord, vassals), the nation's wars as cards, and its autonomy switch.
    public func nationInfo(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let id = nations[index].id.asString, civ = r.civilization.nations[id]
        let o = JS.object()
        o.name = nations[index].name
        o.culture = civ.cultureId.isNull ? JS("") : civ.cultureId; o.religion = civ.religionId.isNull ? JS("") : civ.religionId; o.polity = civ.polity.isNull ? JS("") : civ.polity
        o.gold = JS(r.finance.nations[id].gold.optionalNumber ?? 0); o.goldPerMonth = JS(r.finance.nations[id].goldPerMonth.optionalNumber ?? 0)
        o.destiny = JS(r.destiny.nations[id].destiny.optionalNumber ?? 0)
        o.alive = JS(Vassals.alive(r, id)); o.auto = JS(r.diplomacy.nations[id].optionalBool == true); o.worldAuto = JS(r.diplomacy.worldAuto.isTruthy)
        // Ruler.
        let leaderId = r.people.nations[id].leaderId
        if !leaderId.isNull, let p = People.person(r, leaderId.asInt) {
            let culture = p.cultureName.optionalString ?? civ.cultureId.optionalString ?? ""
            let first = p.firstName.optionalString ?? "", last = p.lastName.optionalString ?? ""
            let familyFirst = Nobility.cultures[culture].familyFirst.optionalBool ?? (culture == "chinese" || culture == "japanese")
            let ruler = JS.object()
            ruler.name = JS(familyFirst ? last + first : last.isEmpty ? first : first + "·" + last)
            ruler.title = JS(People.rulerTitle(culture: civ.cultureId.optionalString ?? "", polity: civ.polity.optionalString ?? "", religion: civ.religionId.optionalString ?? "", gender: p.gender.optionalNumber.map { Int($0) } ?? 0))
            ruler.age = JS(p.age.optionalNumber ?? 0)
            o.ruler = ruler
        } else { o.ruler = .null }
        // Relations.
        o.enemies = .array(r.world.statecraft.relations.asArray.filter { $0.status.asString == "war" && ($0.a.asString == id || $0.b.asString == id) }.map { JS(nationIndex($0.a.asString == id ? $0.b.asString : $0.a.asString)) })
        if let alliance = Vassals.allianceOf(r, id) {
            let a = JS.object(); a.name = alliance.name; a.members = .array(alliance.members.asArray.map { JS(nationIndex($0.asString)) }); o.alliance = a
        } else { o.alliance = .null }
        o.overlord = JS(nationIndex(Vassals.overlord(r, id)))
        o.vassals = .array(r.vassals.records.asArray.filter { $0.endedTick.isNull && $0.overlordId.asString == id }.map { JS(nationIndex($0.vassalId.asString)) })
        // Wars (campaign-card47): sides, goals, losses, duration.
        let stateNation = Dictionary(uniqueKeysWithValues: r.nativeWars.nationIds.asArray.map { ($0[0].asInt, $0[1].asString) })
        o.wars = .array(r.nativeWars.campaigns.asArray.filter { $0.endedTick.isNull }.compactMap { c -> JS? in
            let all = c.participants.asArray + (c.destroyedParticipants.isNull ? [] : c.destroyedParticipants.asArray)
            guard all.contains(where: { stateNation[$0.stateId.asInt] == id }) else { return nil }
            let card = JS.object()
            card.id = c.id
            let d = r.nativeDiplomacy.declarations.asArray.first { $0.warId.asInt == c.id.asInt }
            card.casusBelli = JS(d.map { WarText.casusBelli($0.casusBelliId.asInt) } ?? "")
            card.goals = .array(c.goals.asArray.map { g in JS(WarText.goal(g.type.asInt, g.scope.isNull || g.scope.provinceIds.isNull ? 0 : g.scope.provinceIds.length)) })
            card.months = JS(((r.clock.tick.asNumber - c.openedTick.asNumber) / 120 / 30).rounded(.down))
            card.sides = .array([0, 1].map { side in
                let s = JS.object()
                s.nations = .array(c.participants.asArray.filter { $0.side.asInt == side }.map { JS(nationIndex(stateNation[$0.stateId.asInt])) })
                let members = Set(all.filter { $0.side.asInt == side }.map { $0.stateId.asInt })
                s.losses = JS((c.deaths.isNull ? [] : c.deaths.asArray).filter { members.contains($0[0].asInt) }.reduce(0.0) { $0 + $1[1].asNumber }.rounded())
                return s
            })
            let mine = c.participants.asArray.first { stateNation[$0.stateId.asInt] == id }
            card.side = JS(mine.map { $0.side.asInt } ?? -1)
            return card
        })
        return Data(o.json.utf8)
    }

    /// Global order follow-up (applyGlobalOrder47): vassals, alliances, continuity, diplomacy and
    /// attack clocks are reconciled after every state-level action.
    func afterGlobalOrder() {
        let r = run
        Vassals.reconcileVassals(r); Vassals.reconcileAlliances(r); Government.reconcileContinuity(r); DiplomacyBridge.reconcile(r)
        Daily.reconcileMilitaryClock(r)
    }

    /// Alliance (applyAllianceOwned47 unite / leave) between two states, or leaving (b < 0).
    public func alliance(_ a: Int, with b: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(a) else { return (false, "该国已不存在。") }
        let ida = nations[a].id.asString
        if !Vassals.alive(r, ida) { return (false, "该国已不存在。") }
        if b < 0 {
            if !Vassals.leaveAlliance(r, ida, force: true) { return (false, "该国当前没有联盟。") }
            afterGlobalOrder(); return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "已退出同盟。")
        }
        guard nations.indices.contains(b), a != b, Vassals.alive(r, nations[b].id.asString) else { return (false, "结盟对象无效。") }
        let idb = nations[b].id.asString
        let va = Vassals.allianceOf(r, ida), vb = Vassals.allianceOf(r, idb)
        if let va, let vb, va === vb { return (false, "两国已在同一联盟。") }
        // Native ForceAlliance ends every campaign opposing the pair (reason 8).
        for c in r.nativeWars.campaigns.asArray where c.endedTick.isNull && Wars.coversPair(c, r.nativeWars, ida, idb) { _ = PeaceBridge.settle(r, c, reason: 8) }
        War26.reconcileForces(r, []); DiplomacyBridge.reconcile(r)
        let now = JS(Native.fr(r.life.gameTime.asNumber))
        func notice(_ text: String, _ reason: String, _ ids: [String]) { People.announce(r, kind: "diplomacy", text: text, reason: reason, nations: ids, province: nil) }
        func join(_ v: JS, _ id: String, record: Bool = true) {
            v.members.push(JS(id)); v.joinedTime = now.clone(); Vassals.bump(r.alliances)
            if record { notice("\(Vassals.name(r, id))加入\(v.name.asString)", "今后的外部战争按当前盟约决定参战；不补入既有战争。", v.members.asArray.map(\.asString)) }
        }
        switch (va, vb) {
        case (nil, nil):
            let n = r.alliances.nextId.asNumber; r.alliances.nextId = JS(n + 1)
            let v = JS.object()
            v.id = JS(n); v.name = JS("\(Vassals.name(r, ida))-\(Vassals.name(r, idb))联盟"); v.founders = .array([JS(ida), JS(idb)]); v.members = .array([JS(ida), JS(idb)])
            v.startedTime = now.clone(); v.joinedTime = JS(-100); v.startedTick = r.clock.tick.clone(); v.endedTick = .null; v.unbreakable = JS(false)
            r.alliances.records.push(v); Vassals.bump(r.alliances)
            notice("\(Vassals.name(r, ida))与\(Vassals.name(r, idb))结成联盟", "双方将在今后的宣战中共同参战；联盟不转移领土。", [ida, idb])
        case (nil, let vb?): join(vb, ida)
        case (let va?, nil): join(va, idb)
        case (let va?, let vb?):
            let members = va.members.asArray.map(\.asString)
            _ = Vassals.dissolve(r, va, actor: ida, force: true)
            for m in members { join(vb, m, record: false) }
            notice("\(va.name.asString)并入\(vb.name.asString)", "合并盟约，保留目标联盟；取消所选两国相对参战的战争，其他战争保留。", vb.members.asArray.map(\.asString))
        }
        afterGlobalOrder()
        return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "已结盟。")
    }

    /// releaseVassal47 (解除附庸).
    public func releaseVassal(_ index: Int) -> (ok: Bool, reason: String) {
        let r = run
        guard r.world.nations.asArray.indices.contains(index), Vassals.release(r, r.world.nations[index].id.asString) else { return (false, "该国不是附庸。") }
        afterGlobalOrder()
        return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "已解除附庸。")
    }

    /// applyDiplomacy (nation scope): the state's own diplomacy on or off.
    public func setAutoDiplomacy(_ index: Int, enabled: Bool) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let n = nations[index], id = n.id.asString
        if r.diplomacy.nations[id].optionalBool == enabled { return (false, "该国自动外交没有变化。") }
        let reason = "\(enabled ? "允许" : "禁止")\(n.name.asString)自主外交。"
        var details = ["关闭后该国不自主宣战，但仍会防御，也仍可能被其他国家宣战。", "普通自动议和至少需要一名存活参战国开启自主外交；世界战争期限另行约束。"]
        if !r.diplomacy.worldAuto.isTruthy { details.append("世界自动外交当前关闭，本国开关将在世界开关开启后生效。") }
        Vassals.bump(r.diplomacy)
        r.diplomacy.nations[id] = JS(enabled)
        Daily.event(r, "system", reason, details.joined(separator: " "))
        afterGlobalOrder()
        return (true, reason)
    }
}
