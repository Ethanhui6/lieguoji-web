import Foundation

/// Province rebellions (civilization47-rebellion): conquest stamps, monthly random update days and core
/// months per province, the ordinary rebellion chance on even months, and a weakened superpower's own
/// rebellion check in its monthly step. The success path (a new or restored state, its war and rebel
/// armies) is the founding module's (`onRebel`).
public enum Rebellion {
    static let f = Native.fr
    static let never = -10000.0
    /// The rebellion that happens once a province's check succeeds (founding/restoration, war, armies).
    public static var onRebel: ((JS, String, Bool) -> Bool)?
    /// Rebel reinforcement army creation (createForce47 emergency) in a province.
    public static var spawnArmy: ((JS, String, String) -> Void)?

    static func value(_ s: JS) -> Double { let x = JSMath.lcg(s.random.state.asNumber); s.random.state = JS(x); s.random.draws = JS(s.random.draws.asNumber + 1); return x / 4294967296 }
    static func range(_ s: JS, _ lo: Int, _ hi: Int) -> Int { lo + Int((value(s) * Double(hi - lo)).rounded(.down)) }
    static func alive(_ r: JS, _ id: String) -> Bool { Vassals.alive(r, id) }
    static func monthsSince(_ r: JS, _ t: Double) -> Int {
        let spd = r.life.secondsPerDay.asNumber, s = People.start(r)
        return DiplomacyCalendar.wholeMonths(DiplomacyCalendar.date(t, secondsPerDay: spd, start: s), DiplomacyCalendar.date(f(r.life.gameTime.asNumber), secondsPerDay: spd, start: s))
    }
    static func capitalProvince(_ r: JS, _ id: String) -> String? {
        let capitalId = r.world.nations.asArray.first { $0.id.asString == id }?.capitalId.optionalString
        return r.world.cities.asArray.first { $0.id.optionalString == capitalId }?.provinceId.asString
    }
    static func isCore(_ r: JS, _ province: String, _ owner: String) -> Bool { r.upperCombat.provinces[province].distance.asNumber <= r.upperCombat.nations[owner].coreThreshold.asNumber }
    static func manifest(_ r: JS, _ id: String) -> Int { r.destiny.nations[id].manifestCount.optionalNumber.map { Int($0) } ?? 0 }
    static func destiny(_ r: JS, _ id: String) -> Double { r.destiny.nations[id].destiny.asNumber }
    static func bornTime(_ r: JS, _ id: String) -> Double { r.foundings.records.asArray.first { $0.nationId.asString == id }?.gameTime.asNumber ?? 0 }
    static func roundHalfEven(_ v: Double) -> Int {
        let rounded = (v + 0.5).rounded(.down)
        return abs(v.truncatingRemainder(dividingBy: 1)) == 0.5 && Int(rounded) % 2 != 0 ? Int(rounded) - 1 : Int(rounded)
    }
    /// superSuperPower47.
    public static func superSuperPower(_ r: JS, _ id: String) -> Bool {
        let living = r.world.nations.asArray.filter { alive(r, $0.id.asString) }.map { ($0.id.asString, PeaceBridge.strength(r, $0.id.asString)) }
            .sorted { $0.1 != $1.1 ? $0.1 > $1.1 : Collate.less($0.0, $1.0) }
        if living.isEmpty { return false }
        if living.count == 1 { return living[0].0 == id }
        let sum = living.reduce(0.0) { f($0 + $1.1) }
        guard let own = living.prefix(2).first(where: { $0.0 == id }) else { return false }
        return own.1 > f(sum * f(0.3))
    }
    static func maxRecent(_ r: JS, _ id: String) -> Int {
        let m = manifest(r, id)
        if m == 0 { return 10000 }
        let d = destiny(r, id), base = d < 13 ? 12 : d < 20 ? 7 : d < 25 ? 5 : 4
        return max(1, base - m)
    }
    @discardableResult
    static func pruneRecent(_ r: JS, _ s: JS, _ id: String) -> [Double] {
        var q = s.recent[id].isNull ? [] : s.recent[id].asArray.map(\.asNumber)
        while let first = q.first, monthsSince(r, first) > 26 { q.removeFirst() }
        if q.isEmpty { s.recent.delete(id) } else { s.recent[id] = .array(q.map { JS($0) }) }
        return q
    }
    static func canAllowNew(_ r: JS, _ s: JS, _ id: String) -> Bool { pruneRecent(r, s, id).count < maxRecent(r, id) }
    static func recordNew(_ r: JS, _ s: JS, _ id: String) {
        var q = pruneRecent(r, s, id)
        q.append(r.life.gameTime.asNumber)
        let m = maxRecent(r, id)
        while q.count > m { q.removeFirst() }
        s.recent[id] = .array(q.map { JS($0) }); s.lastRebel[id] = r.life.gameTime.clone()
    }
    static func canProvinceRebel(_ r: JS, _ s: JS, _ id: String, _ province: String) -> Bool {
        if monthsSince(r, never) < 24 || !canAllowNew(r, s, id) { return false }
        let threshold = (r.upperCombat.provinces[province].connected.isTruthy ? s.destinyToRebelConnected.asNumber : s.destinyToRebel.asNumber) - Double(manifest(r, id)) + 5
        if destiny(r, id) > threshold { return false }
        if r.world.provinces.asArray.filter({ $0.controller.asString == id }).count < 30 { return false }
        var interval = f(s.minMonths.asNumber)
        if destiny(r, id) < 15 && superSuperPower(r, id) { interval = f(interval / 6) }
        if interval > Double(monthsSince(r, s.lastRebel[id].optionalNumber ?? 0)) { return false }
        return monthsSince(r, bornTime(r, id)) >= 15
    }
    static func provinceAtWar(_ r: JS, _ province: String) -> Bool {
        let p = r.world.provinces.asArray.first { $0.id.asString == province }!
        if r.occupation.sieges.asArray.contains(where: { $0.provinceId.asString == province }) { return true }
        return p.neighbors.asArray.contains { n in
            guard let q = r.world.provinces.asArray.first(where: { $0.id.asString == n.asString }) else { return false }
            return q.controller.asString != p.controller.asString && Wars.relation(r, p.controller.asString, q.controller.asString)?.status.asString == "war"
        }
    }
    /// tryRebel47's checks; true when the province rebels (the rebellion itself is `onRebel`).
    @discardableResult
    public static func tryRebel(_ r: JS, _ province: String, force: Bool) -> Bool {
        let s = r.foundings, p = r.world.provinces.asArray.first { $0.id.asString == province }!, owner = p.controller.asString
        if !force {
            if !s.enabled.isTruthy || capitalProvince(r, owner) == province { return false }
            let c = r.upperCombat.provinces[province]
            if c.distance.asNumber <= r.upperCombat.nations[owner].coreThreshold.asNumber && manifest(r, owner) > 1 { return false }
            if !canProvinceRebel(r, s, owner, province) { return false }
            if monthsSince(r, s.conquered[province].time.asNumber) < 8 { return false }
            if provinceAtWar(r, province) { return false }
            var chance = min(80, Native.imul(Native.i32(c.distance.asInt + 2), 5))
            if monthsSince(r, never) < 18 { chance = Int((Double(chance) * f(0.1)).rounded(.towardZero)) }
            if !r.offices47.isNull { chance = roundHalfEven(f(Double(chance) * Offices.localRebellion(r, province))) }
            chance = max(0, min(100, chance))
            if !(range(s, 0, 100) < chance) { return false }
        }
        guard let onRebel else { return false }
        return onRebel(r, province, force)
    }
    static func updateCoreMonths(_ r: JS, _ s: JS, _ province: String) {
        let p = r.world.provinces.asArray.first { $0.id.asString == province }!, owner = p.controller.asString, core = isCore(r, province, owner)
        let m = s.coreMonths[province].isNull ? JS.object() : s.coreMonths[province]
        if core { m[owner] = JS(f((m[owner].optionalNumber ?? 0) + 1)) }
        let decay = f(core ? 0.7 : 0.3)
        for id in m.objectKeys where id != owner { let v = f(m[id].asNumber - decay); if 0 > v { m.delete(id) } else { m[id] = JS(v) } }
        if m.objectKeys.isEmpty { s.coreMonths.delete(province) } else { s.coreMonths[province] = m }
    }
    /// processRebellion47 (State.ProcessRebellion for a weakened superpower).
    static func process(_ r: JS, _ id: String) {
        let s = r.foundings
        if s.isNull || !s.enabled.isTruthy || !alive(r, id) { return }
        let d = destiny(r, id)
        if monthsSince(r, never) < 24 || d > 30 || !superSuperPower(r, id) || !canAllowNew(r, s, id) { return }
        let capital = capitalProvince(r, id)
        let owned = r.upperCombat.nations[id].provinceOrder.asArray.map(\.asString).filter { pid in r.world.provinces.asArray.first { $0.id.asString == pid }?.controller.asString == id }
        let list = owned.filter { d > 13 ? !isCore(r, $0, id) && !provinceAtWar(r, $0) : !provinceAtWar(r, $0) && $0 != capital }
        if list.isEmpty { return }
        var chance = f(f(f(min(1, max(0, f(f(30 - d) / 20)))) * f(0.3)) + f(0.35)); chance = f(chance / 2)
        let leaderId = r.people.nations[id].leaderId
        if !leaderId.isNull {
            let leader = r.people.persons[leaderId.asInt.description]
            if !leader.isNull && leader.alive.isTruthy {
                var resistance = 0.0
                for t in leader.traits.asArray.map(\.asString) { resistance = f(resistance + f(Nobility.trait(t)?.rebellionResistanceModifier.optionalNumber ?? 0)) }
                chance = f(f(1 - resistance) * chance)
            }
        }
        let offices = !r.offices47.isNull
        if offices { var sum = 0.0; for pid in list { sum = f(sum + Offices.localRebellion(r, pid)) }; chance = f(chance * f(sum / Double(list.count))) }
        if monthsSince(r, never) < 18 { chance = f(chance * f(0.1)) }
        if value(s) > chance { return }
        var pick: String
        if !offices { pick = list[min(list.count - 1, Int((value(s) * Double(list.count)).rounded(.down)))] }
        else {
            let weights = list.map { Offices.localRebellion(r, $0) }
            var total = 0.0; for w in weights { total = f(total + w) }
            pick = list[0]
            if total > 0 {
                var roll = f(value(s) * total); pick = list[list.count - 1]
                for i in list.indices { roll = f(roll - weights[i]); if !(0 < roll) { pick = list[i]; break } }
            }
        }
        if tryRebel(r, pick, force: true) { recordNew(r, s, id) }
    }
    static func rebelWar(_ r: JS, _ id: String) -> JS? {
        let state = Wars.stateNumber(r, id)
        return r.nativeWars.campaigns.asArray.first { $0.endedTick.isNull && $0.internal.casusBelliId.optionalNumber == 14 && $0.internal.rebelStateId.optionalNumber == Double(state) }
    }
    /// stateRebellionMonth47: rebel reinforcements, then the superpower check.
    public static func stateMonth(_ r: JS, _ id: String) {
        let s = r.foundings
        if !s.isNull && alive(r, id), let war = rebelWar(r, id) {
            let months = monthsSince(r, war.startTime.optionalNumber ?? f(war.openedTick.asNumber / 120 * r.life.secondsPerDay.asNumber))
            if months <= 36 && months % 3 == 0 {
                let owned = r.world.provinces.asArray.filter { $0.controller.asString == id }
                if !owned.isEmpty && r.world.armies.length < 500 { spawnArmy?(r, id, owned[range(s, 0, owned.count)].id.asString) }
            }
        }
        process(r, id)
    }
    /// advanceRebellion47 (daily).
    public static func advance(_ r: JS) {
        let s = r.foundings
        if s.isNull { return }
        for p in r.world.provinces.asArray {
            let c = s.conquered[p.id.asString]
            if c.controller.asString != p.controller.asString { let o = JS.object(); o.controller = p.controller.clone(); o.time = r.life.gameTime.clone(); s.conquered[p.id.asString] = o }
        }
        let date = r.life.currentDate, month = date.year.asInt * 12 + date.month.asInt - 1
        if month != s.month.asInt {
            s.month = JS(month)
            if People.yearSince(r, s.recalTime.asNumber) > 10 {
                s.recalTime = r.life.gameTime.clone(); s.destinyToRebelConnected = JS(range(s, 5, 10)); s.destinyToRebel = JS(s.destinyToRebelConnected.asNumber + 10)
            }
            let days = DiplomacyCalendar.monthLength(date.year.asInt, date.month.asInt)
            let updates = JS.object()
            for p in r.world.provinces.asArray { updates[p.id.asString] = JS(range(s, 1, days + 1)) }
            s.updateDays = updates
        }
        let day = date.day.asInt, even = date.month.asInt % 2 == 0
        for p in r.world.provinces.asArray where s.updateDays[p.id.asString].asInt == day {
            updateCoreMonths(r, s, p.id.asString)
            if even && tryRebel(r, p.id.asString, force: false) { Wars.reconcileLosses(r); Vassals.reconcileAlliances(r); DiplomacyBridge.reconcile(r) }
        }
    }
}
