import Foundation

/// The original's world-editor orders 停止所有战争 and 解除所有同盟, and an army's service record
/// (军团信息: where it was raised, how long it has served, its battles and the enemies it struck down).
extension NativeEngine {
    /// 停止所有战争: every war between states ends in a white peace (civil wars and rebellions go on).
    func stopAllWars() -> (ok: Bool, reason: String) {
        let r = run
        let open = r.nativeWars.campaigns.asArray.filter { $0.endedTick.isNull && $0.internal.isNull }
        guard !open.isEmpty else { return (false, "天下没有进行中的国与国战争。") }
        for c in open where c.endedTick.isNull { _ = PeaceBridge.settle(r, c, reason: 11) }
        War26.reconcileForces(r, []); Government.reconcileContinuity(r); DiplomacyBridge.reconcile(r)
        let text = "诏令天下罢兵"
        People.announce(r, kind: "diplomacy", text: text, reason: "全局指令：\(open.count)场国与国的战争就地停战，各国已占之地按停战处理；内战与叛乱不受影响。", nations: [], province: nil)
        afterGlobalOrder()
        return (true, "\(text)：\(open.count)场战争停战。")
    }

    /// 煽动叛乱 (the original's InciteRebellion: 「随机省份煽动叛乱，成立新的国家」): a random province of
    /// the state, not its capital and not a battlefield, rises and founds a new state.
    func inciteRebellion(_ index: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), !r.foundings.isNull else { return (false, "这个世界没有启用叛乱规则。") }
        let id = nations[index].id.asString, capital = Rebellion.capitalProvince(r, id)
        let list = r.world.provinces.asArray.filter { $0.controller.asString == id && $0.id.asString != capital && !Rebellion.provinceAtWar(r, $0.id.asString) }
        guard list.count >= 2 else { return (false, "该国州郡太少，煽动不起叛乱。") }
        for p in list.shuffled() where Rebellion.tryRebel(r, p.id.asString, force: true) {
            afterGlobalOrder()
            return (true, "\(p.name.asString)揭竿而起，自立为国。")
        }
        return (false, "煽动未成：各州郡都无人响应。")
    }
    /// 解除所有同盟: every alliance is dissolved (the states may ally again later if 自主结盟 is on).
    func dissolveAllAlliances() -> (ok: Bool, reason: String) {
        let r = run
        guard !r.alliances.isNull else { return (false, "这个世界没有联盟。") }
        let live = r.alliances.records.asArray.filter { $0.endedTick.isNull && $0.members.length > 0 }
        guard !live.isEmpty else { return (false, "天下没有现存的联盟。") }
        var done = 0
        for v in live where Vassals.dissolve(r, v, actor: v.members[0].asString, force: true) { done += 1 }
        People.announce(r, kind: "diplomacy", text: "诏令解散天下诸盟", reason: "全局指令：\(done)个联盟解散，盟约不再约束参战。", nations: [], province: nil)
        afterGlobalOrder()
        return (true, "\(done)个联盟已解散。")
    }

    /// 军团信息: the army's home province, days in service, battles, troops it struck down and lost, and
    /// what its commanders are about (the AI's own reason).
    public func armyRecord(_ id: String) -> Data? {
        let r = run
        guard let a = r.world.armies.asArray.first(where: { $0.id.asString == id }) else { return nil }
        let o = JS.object(), provinces = r.world.provinces.asArray
        let home = r.tactics.forces[id].homeId.optionalString ?? a.originId.optionalString ?? ""
        o.home = JS(provinces.firstIndex { $0.id.asString == home } ?? -1)
        let since = r.forceSpeed.armies[id].initializedTick.optionalNumber
        o.days = JS(since.map { max(0, ((r.clock.tick.asNumber - $0) / 120).rounded(.down)) } ?? 0)
        o.full = JS(r.tactics.forces[id].fullStrength.optionalNumber ?? a.troops.asNumber)
        o.levy = JS(r.tactics.forces[id].kind.optionalString == "emergency")
        let rec = r.regimes.isNull || r.regimes.record.isNull ? JS.null : r.regimes.record[id]
        o.kills = JS((rec.isNull ? 0 : rec.kills.optionalNumber ?? 0).rounded())
        o.losses = JS((rec.isNull ? 0 : rec.losses.optionalNumber ?? 0).rounded())
        o.battles = JS(rec.isNull ? 0 : rec.battles.optionalNumber ?? 0)
        o.reason = JS(r.armyAutonomy.armies[id].reason.optionalString ?? "")
        // 当前战役 and the campaigns it has fought in.
        let all = r.regimes.isNull || r.regimes.campaigns.isNull ? [] : r.regimes.campaigns.list.asArray.filter { c in c.armies.asArray.contains { $0.asString == id } }
        o.campaigns = JS(all.count)
        o.campaign = JS(all.last { $0.end.isNull }?.name.optionalString ?? "")
        return Data(o.json.utf8)
    }
}

/// 军团战史 (app rules): kept on the run so it is saved with the world.
enum ArmyLedger {
    static func entry(_ r: JS, _ id: String) -> JS {
        if r.regimes.record.isNull { r.regimes.record = JS.object() }
        if r.regimes.record[id].isNull { r.regimes.record[id] = JS.object() }
        return r.regimes.record[id]
    }
    static var on: Bool { UnitKinds.enabled }
    /// Troops struck down by `attacker` and lost by `victim` in one volley.
    static func hit(_ r: JS, attacker: String, victim: String, troops: Double) {
        guard on, !r.regimes.isNull, troops > 0 else { return }
        let a = entry(r, attacker); a.kills = JS((a.kills.optionalNumber ?? 0) + troops)
        let v = entry(r, victim); v.losses = JS((v.losses.optionalNumber ?? 0) + troops)
    }
    /// 战役 (the original's CampaignManager): the first battle in a province opens a campaign named after
    /// it, 第N次某地战役 (N counts that province's campaigns); every army that fights there joins it, and
    /// it ends after three days without fighting. Kept in regimes.campaigns (list, per-province count,
    /// the active one by province).
    static func campaigns(_ r: JS, _ space: [Armies.Located]) {
        guard on, !r.regimes.isNull else { return }
        if r.regimes.campaigns.isNull {
            let b = JS.object(); b.list = .array(); b.count = JS.object(); b.active = JS.object(); r.regimes.campaigns = b
        }
        let book = r.regimes.campaigns, day = r.world.day.asNumber
        var fighting = [String: (province: JS, armies: [JS])]()
        for v in space where v.army.status.asString == "fighting" {
            guard let p = v.province else { continue }
            fighting[p.id.asString, default: (p, [])].armies.append(v.army)
        }
        for pid in fighting.keys.sorted() {
            let (p, armies) = fighting[pid]!
            let c: JS
            if let i = book.active[pid].optionalNumber { c = book.list[Int(i)] } else {
                let n = (book.count[pid].optionalNumber ?? 0) + 1
                book.count[pid] = JS(n)
                let x = JS.object()
                x.name = JS("第\(Int(n))次\(p.name.asString)战役"); x.province = JS(pid); x.start = JS(day); x.end = .null
                x.armies = .array(); x.states = .array(); x.peak = JS(0)
                book.active[pid] = JS(book.list.length); book.list.push(x)
                c = x
                let states = Array(Set(armies.map { $0.nationId.asString })).sorted()
                People.announce(r, kind: "battle", text: x.name.asString + "爆发", reason: states.map { Vassals.name(r, $0) }.joined(separator: "、") + "的军队在\(p.name.asString)交战。", nations: states, province: pid)
            }
            c.last = JS(day)
            var ids = Set(c.armies.asArray.map(\.asString)), states = Set(c.states.asArray.map(\.asString))
            for a in armies {
                if ids.insert(a.id.asString).inserted { c.armies.push(a.id.clone()) }
                if states.insert(a.nationId.asString).inserted { c.states.push(a.nationId.clone()) }
            }
            let troops = armies.reduce(0.0) { $0 + $1.troops.asNumber }
            if troops > c.peak.asNumber { c.peak = JS(troops) }
        }
        for pid in book.active.objectKeys where fighting[pid] == nil {
            let c = book.list[book.active[pid].asInt]
            if day - (c.last.optionalNumber ?? day) >= 3 { c.end = JS(day); book.active.delete(pid) }
        }
    }
    /// An army entering a battle.
    static func battle(_ r: JS, _ id: String) {
        guard on, !r.regimes.isNull else { return }
        let e = entry(r, id); e.battles = JS((e.battles.optionalNumber ?? 0) + 1)
    }
}

/// 族谱操作 (the original's FamilyTreeUI actions: 添加配偶、添加子女、处死): edits to one house's members.
extension NativeEngine {
    func familyAction(_ personId: Int, action: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = People.person(r, personId) else { return (false, "人物不存在。") }
        guard p.isAlive.asBool else { return (false, "此人已故。") }
        let name = p.identity.name.optionalString ?? p.firstName.optionalString ?? "此人"
        switch action {
        case "kill":
            People.die(r, p, cause: "executed")
            People.recordHistory(r, kind: "family", text: "\(name)被处死", reason: "族谱中下令处死；其官职、家主与王位按原作规则由他人继承。", nations: [], province: nil)
            afterGlobalOrder()
            return (true, "\(name)已被处死。")
        case "spouse":
            guard p.age.asInt >= 16 else { return (false, "未满十六岁，不能婚配。") }
            if p.spouseId.asInt != 0, People.person(r, p.spouseId.asInt)?.isAlive.asBool == true { return (false, "此人已有配偶。") }
            guard !r.nobility.isNull, p.familyId.asInt > 0 else { return (false, "此人不属任何家族。") }
            let family = r.kin.families[p.familyId.asInt.description]
            guard !family.isNull else { return (false, "此人不属任何家族。") }
            let random = Nobility.Random(n: r.nobility), gender = p.gender.asInt == 0 ? 1 : 0
            let culture = p.cultureName.optionalString ?? family.cultureName.asString, profile = Nobility.cultures[culture]
            guard !profile.isNull else { return (false, "此人的文化没有人名表。") }
            let pool = (gender == 0 ? profile.givenMale : profile.givenFemale).asArray, houses = profile.houses.asArray
            guard !pool.isEmpty, !houses.isEmpty else { return (false, "此人的文化没有人名表。") }
            let first = pool[random.intRange(0, pool.count)].asString, last = houses[random.intRange(0, houses.count)].asString
            let s = Nobility.createNamed(r, first: first, last: last, gender: gender, culture: culture, source: "spouse", religionId: p.religionId, identity: Nobility.personName(culture, given: first, house: last, gender: gender), random: random)
            var age = Native.fr(p.age.asNumber + random.floatRange(-6, 6)); if age < 16 { age = random.floatRange(16, 20) }
            let life = r.life
            s.birthTime = JS(Native.fr(life.gameTime.asNumber - age * 365.25 * life.secondsPerDay.asNumber))
            s.age = JS(People.yearSince(r, s.birthTime.asNumber, now: r.kin.ageTime.asNumber))
            s.familyId = family.id.clone(); s.stateId = p.stateId.clone()
            p.spouseId = s.id.clone(); s.spouseId = p.id.clone(); p.marriageType = JS(0); s.marriageType = JS(0)
            family.memberIds.push(s.id.clone()); r.kin.persons[s.id.asInt.description] = s
            let lp = JS.object(); lp.source = JS("native-family"); lp.birthTime = s.birthTime.clone(); lp.age = s.age.clone(); lp.initialAge = .null; lp.updatedMonth = r.kin.lastAgeMonth.clone()
            life.persons[s.id.asInt.description] = lp
            Nobility.bump(r.people); Nobility.bump(r.kin); Nobility.bump(life)
            let spouseName = s.identity.name.optionalString ?? first
            People.recordHistory(r, kind: "family", text: "\(name)与\(spouseName)成婚", reason: "族谱中为其婚配。", nations: [family.nationId.asString], province: nil)
            return (true, "\(name)与\(spouseName)成婚。")
        case "child":
            guard !r.nobility.isNull, let spouse = People.person(r, p.spouseId.asInt), spouse.isAlive.asBool else { return (false, "此人尚无在世配偶，先为其婚配。") }
            let mother = p.gender.asInt == 1 ? p : spouse, father = mother === p ? spouse : p
            guard mother.gender.asInt == 1, father.gender.asInt == 0 else { return (false, "夫妇无法生育。") }
            guard mother.age.asInt <= 50 else { return (false, "母亲年事已高，不能生育。") }
            guard mother.childrenIds.length < 10 else { return (false, "子女已经太多。") }
            let familyId = father.familyId.asInt > 0 ? father.familyId.asInt : mother.familyId.asInt
            guard familyId > 0, !r.kin.families[familyId.description].isNull else { return (false, "此人不属任何家族。") }
            let before = mother.childrenIds.length
            Nobility.createChild(r, r.nobility, familyId.description, mother, Nobility.Random(n: r.nobility))
            guard mother.childrenIds.length > before, let child = People.person(r, mother.childrenIds.asArray.last!.asInt) else { return (false, "未能添子。") }
            let childName = child.identity.name.optionalString ?? child.firstName.optionalString ?? ""
            return (true, "\(name)家添\(child.gender.asInt == 1 ? "女" : "子")\(childName)。")
        default:
            return (false, "无此操作。")
        }
    }
}

/// 在此立国 (the original's world editor: a new state in a chosen province): peacefully, or by rising
/// against its owner (a rebellion in that province).
extension NativeEngine {
    func foundNation(_ province: Int, war: Bool) -> (ok: Bool, reason: String) {
        let r = run, provinces = r.world.provinces.asArray
        guard provinces.indices.contains(province) else { return (false, "州郡不存在。") }
        let p = provinces[province], pid = p.id.asString, owner = p.controller.asString
        guard !r.foundings.isNull, Vassals.alive(r, owner) else { return (false, "此地无主，或这个世界没有建国规则。") }
        guard r.world.cities.asArray.contains(where: { $0.provinceId.asString == pid }) else { return (false, "此州没有城池，无法立国。") }
        guard provinces.filter({ $0.controller.asString == owner }).count >= 2 else { return (false, "这是该国最后一州，无法再分出新国。") }
        if war {
            guard Rebellion.tryRebel(r, pid, force: true) else { return (false, "此州无人响应起事。") }
            afterGlobalOrder()
            return (true, "\(p.name.asString)举兵反抗，自立为国。")
        }
        let record = Founding.foundState(r, parent: owner, provinces: [pid], reason: "世界编辑：\(p.name.asString)和平独立，按原作新国家初始化领袖与家族。")
        Wars.reconcileLosses(r); Vassals.reconcileAlliances(r); DiplomacyBridge.reconcile(r); Wars.reconcileIdentities(r)
        afterGlobalOrder()
        let name = r.world.nations.asArray.first { $0.id.asString == record.nationId.asString }?.name.asString ?? "新国"
        return (true, "\(name)于\(p.name.asString)和平立国。")
    }
}
