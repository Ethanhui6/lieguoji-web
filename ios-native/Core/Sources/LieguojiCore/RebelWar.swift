import Foundation

/// What happens once a province rebels (civilization47-rebellion tryRebel47's second half): the
/// province leaves its family, a former owner may be restored or a new state is founded, the mother
/// state's armies there are destroyed, the mother declares the internal war and the rebels raise armies.
public enum RebelWar {
    static let f = Native.fr

    /// rebellionBlocker47.
    static func blocked(_ r: JS, _ province: String) -> Bool {
        if r.foundings.isNull { return true }
        guard let p = r.world.provinces.asArray.first(where: { $0.id.asString == province }),
              let nation = r.world.nations.asArray.first(where: { $0.id.asString == p.controller.asString }) else { return true }
        if r.world.cities.asArray.first(where: { $0.id.optionalString == nation.capitalId.optionalString })?.provinceId.asString == province { return true }
        if !r.world.cities.asArray.contains(where: { $0.provinceId.asString == province }) { return true }
        if r.world.provinces.asArray.filter({ $0.controller.asString == nation.id.asString }).count < 2 { return true }
        return r.world.nations.length >= 50
    }
    static func destroyArmies(_ r: JS, _ nation: String, _ province: String) {
        for v in Armies.space(r) where v.army.nationId.asString == nation && v.province?.id.asString == province {
            let a = v.army
            a.troops = JS(0); a.status = JS("destroyed"); a.morale = JS(0); a.supplies = JS(0); a.route = .array(); a.progress = JS(0)
            let t = v.travel.clone(); t.status = JS("halted"); r.armyPositions.records[a.id.asString] = t
            r.battles.plans.delete(a.id.asString); r.reorganization.active.delete(a.id.asString); r.tactics.rounds.delete(a.id.asString)
        }
    }
    /// startInternalWar47: the mother state declares on the rebels.
    public static func startInternalWar(_ r: JS, rebel: String, mother: String, casusBelli: Int, legacyType: Int, goalType: Int = 7) {
        if Wars.relation(r, rebel, mother)?.status.asString == "war" { return }
        let rs = Wars.stateNumber(r, rebel), ms = Wars.stateNumber(r, mother)
        let internalWar = JS.object(); internalWar.casusBelliId = JS(casusBelli); internalWar.legacyType = JS(legacyType); internalWar.rebelStateId = JS(rs); internalWar.motherStateId = JS(ms)
        let members = Vassals.buildParticipants(r, attacker: mother, defender: rebel, rebel: rs, mother: ms)
        Vassals.openCoalitionRelations(r, members)
        let goal = JS.object(); goal.id = JS(1); goal.type = JS(goalType); goal.addedBy = JS(rs); goal.target = JS(ms); goal.beneficiary = JS(rs)
        let scope = JS.object(); scope.provinceIds = .array(); scope.requiredCount = JS(0); goal.scope = scope
        Wars.register(r, attacker: mother, defender: rebel, goals: .array([goal]), internalWar: internalWar, members: members)
        r.nativeDiplomacy.nations[mother].activeTime = JS(f(r.life.gameTime.asNumber)); r.nativeDiplomacy.nations[rebel].passiveTime = JS(f(r.life.gameTime.asNumber)); Vassals.bump(r.nativeDiplomacy)
    }
    static func spawn(_ r: JS, _ rebel: String, _ count: Int) {
        let owned = r.world.provinces.asArray.filter { $0.controller.asString == rebel }
        if owned.isEmpty { return }
        for _ in 0..<count {
            if r.world.armies.length >= 500 { break }
            Armies.create(r, nation: rebel, home: owned[Rebellion.range(r.foundings, 0, owned.count)].id.asString, kind: "emergency")
        }
    }
    static func restore(_ r: JS, _ id: String, _ province: String) {
        let p = r.world.provinces.asArray.first { $0.id.asString == province }!, from = p.controller.asString
        PeaceBridge.transferEconomy(r, province, from, id); p.controller = JS(id); p.legalOwner = JS(id)
        r.occupation.sieges.asArray = r.occupation.sieges.asArray.filter { $0.provinceId.asString != province }
        r.world.nations.asArray.first { $0.id.asString == id }!.capitalId = r.world.cities.asArray.first { $0.provinceId.asString == province }!.id.clone()
        Government.relocateLostCapitals(r); Wars.reconcileCore(r); Founding.reconcilePorts?(r)
        Government.reconcileContinuity(r)
        let tick = r.clock.tick.asNumber
        if let entry = r.chronicle.entries.asArray.reversed().first(where: { $0.kind.asString == "restoration" && $0.tick.asNumber == tick && $0.nationIds.asArray.contains { $0.asString == id } }) {
            entry.text = JS("\(Vassals.name(r, id))于\(p.name.asString)复国")
            if let e = r.world.events.asArray.first(where: { $0.id.optionalNumber == entry.sourceEventId.optionalNumber }) { e.text = entry.text.clone() }
        }
    }
    /// Installs the rebellion as Rebellion's success path.
    public static func install() {
        Rebellion.onRebel = { r, province, force in
            let s = r.foundings, p = r.world.provinces.asArray.first { $0.id.asString == province }!, owner = p.controller.asString
            if blocked(r, province) { return false }
            if !r.nobility.isNull { for fam in r.nobility.families.objectValues { fam.controlledProvinces.asArray = fam.controlledProvinces.asArray.filter { $0.asString != province } } }
            People.announce(r, kind: "uprising", text: "\(p.name.asString)发生叛乱", reason: "\(Vassals.name(r, owner))的\(p.name.asString)起兵反抗。", nations: [owner], province: province)
            let months = s.coreMonths[province]
            let candidates = months.isNull ? [] : months.objectEntries.filter { id, m in
                id != owner && m.asNumber > 20 && !Vassals.alive(r, id) && (force || (r.sovereignty.restorations[id].optionalNumber ?? 0) < 15)
            }.map(\.0)
            let rebel: String
            if !candidates.isEmpty && Rebellion.range(s, 0, 100) < 50 {
                rebel = candidates[Rebellion.range(s, 0, candidates.count)]; destroyArmies(r, owner, province); restore(r, rebel, province)
            } else {
                destroyArmies(r, owner, province)
                rebel = Founding.foundState(r, parent: owner, provinces: [province], reason: "叛军按行省文化建立新的国家，领袖与家族按原作新国家初始化生成。").nationId.asString
            }
            Wars.reconcileLosses(r); Vassals.reconcileAlliances(r); DiplomacyBridge.reconcile(r); Wars.reconcileIdentities(r)
            startInternalWar(r, rebel: rebel, mother: owner, casusBelli: 14, legacyType: 2)
            spawn(r, rebel, max(1, Int(f(r.destiny.nations[rebel].destiny.asNumber / 15).rounded(.down))))
            Rebellion.recordNew(r, s, owner)
            return true
        }
        Rebellion.spawnArmy = { r, nation, province in Armies.create(r, nation: nation, home: province, kind: "emergency") }
    }
}
