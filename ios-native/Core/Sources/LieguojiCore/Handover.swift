import Foundation

/// 易主 (本作规则): when the chronicle says a throne or a government changed hands, the ruler changes
/// with it. 禅让 used to change the state's name alone and a revolution only its polity: the old
/// emperor went on reigning under the new dynasty's name, the deposed king sat on as president.
extension Regimes {
    enum Handover {
        /// 禅让、篡位、复辟: the strongest house other than the ruler's gives its ablest adult.
        case otherHouse
        /// 革命、还政于民: chosen by the republic's candidate rule, the old ruler barred.
        case elected
    }

    /// The living ruler of the state.
    static func ruler(_ r: JS, _ id: String) -> JS? {
        guard let lid = r.people.nations[id].leaderId.optionalNumber, let p = People.person(r, Int(lid)), p.isAlive.asBool else { return nil }
        return p
    }

    /// Who would take over; nothing is changed. Nil when the state has nobody else to offer.
    static func claimant(_ r: JS, _ id: String, _ how: Handover) -> JS? {
        let old = ruler(r, id), oldId = old?.id.asInt ?? 0, oldFamily = old?.familyId.asInt ?? -1
        let stateId = r.people.nations[id].id.asInt
        let families = People.electionFamilies(r, id).filter { $0.k.stateId.asInt == stateId }
        switch how {
        case .elected:
            return People.republicLeader(r, families: families, excluding: oldId)
        case .otherHouse:
            func ability(_ p: JS) -> Double { let s = People.skills(p); return s.military + s.administrative + s.charisma + s.diplomatic }
            let rivals = families.filter { $0.k.id.asInt != oldFamily }
                .sorted { $0.influence != $1.influence ? $0.influence > $1.influence : $0.k.id.asInt < $1.k.id.asInt }
            for house in rivals {
                let adults = People.livingOwn(r, house.k).filter { ($0.age.optionalNumber ?? 0) >= 18 && $0.id.asInt != oldId }
                    .sorted { $0.id.asInt < $1.id.asInt }
                var best: JS?
                for p in adults where best == nil || ability(p) > ability(best!) { best = p }
                if let best { return best }
            }
            return nil
        }
    }

    /// The claimant takes the state through the engine's own appointment: the old reign closes, the new
    /// one opens in the chronicle, the leader's role and the ruling house move with it. Returns the new
    /// ruler's name for the notice.
    @discardableResult
    static func install(_ r: JS, _ id: String, _ heir: JS, cause: String) -> String {
        if let old = ruler(r, id), !old.roles.isNull,
           old.roles.asArray.contains(where: { $0.nativeKind.optionalString == "leader" && $0.stateId.asInt == old.stateId.asInt }) {
            Government.closeLeaderRole(r, id, cause)
        }
        _ = People.appointKnownPerson(r, id, heir, cause: cause)
        Government.refreshLeaderCombat(r)
        let house = r.kin.families[heir.familyId.asInt.description].surname.optionalString ?? ""
        return house + (heir.identity.given.optionalString ?? "")
    }

    /// After a change of polity (革命、复辟、政党夺权): the new order seats its own head. A republic or a
    /// federation elects one; a crown goes to the strongest house other than the fallen ruler's.
    /// Returns the new ruler's name, or nil when the old ruler stays for want of anyone else.
    @discardableResult
    static func seat(_ r: JS, _ id: String) -> String? {
        let polity = r.civilization.nations[id].polity.optionalString ?? ""
        let republic = polity == "Republic" || polity == "Federation"
        guard let heir = claimant(r, id, republic ? .elected : .otherHouse) else { return nil }
        return install(r, id, heir, cause: republic ? "election" : "restoration")
    }

    /// 禅让: the crown passes to another house under a new dynastic name; the land is unchanged. Nil (and
    /// nothing changed) when no other house can take it.
    static func abdicate(_ r: JS, _ n: JS, _ id: String, base: String, style: String?) -> String? {
        guard let heir = claimant(r, id, .otherHouse) else { return nil }
        let old = n.name.asString
        retitleState(r, id, base: base, style: style)
        let who = install(r, id, heir, cause: "usurpation")
        Finance.setCorruption(r, id, Finance.corruption(r, id) * 0.6)
        _ = People.announce(r, kind: "politics", text: "\(old)禅位于\(who)，\(n.name.asString)代之",
                            reason: "权臣逼宫，旧主逊位，\(who)受禅登基：国号更易，宗室换姓，腐化大减。", nations: [id], province: nil)
        return who
    }
}
