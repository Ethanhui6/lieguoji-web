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
    /// An army entering a battle.
    static func battle(_ r: JS, _ id: String) {
        guard on, !r.regimes.isNull else { return }
        let e = entry(r, id); e.battles = JS((e.battles.optionalNumber ?? 0) + 1)
    }
}
