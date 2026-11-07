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
