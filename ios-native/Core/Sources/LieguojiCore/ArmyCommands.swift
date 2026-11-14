import Foundation

/// 军令 (the army page): who commands it, holding, marching home, reinforcing from the treasury,
/// splitting, merging, disbanding and renaming. Each acts on the run's own army records, so the
/// simulation carries on from them.
extension NativeEngine {
    private func liveArmy(_ id: String) -> JS? {
        run.world.armies.asArray.first { $0.id.asString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
    }
    private func isManual(_ id: String) -> Bool { run.voyages.manualArmies.asArray.contains { $0.asString == id } }
    private func setManual(_ id: String, _ on: Bool) {
        let r = run
        if on { if !isManual(id) { r.voyages.manualArmies.push(JS(id)) } }
        else {
            r.voyages.manualArmies = .array(r.voyages.manualArmies.asArray.filter { $0.asString != id })
            let row = r.armyAutonomy.armies[id]
            if !row.isNull { row.decision = JS("waiting"); row.nextTick = JS(0); row.targetId = .null; row.reason = JS("交还自主指挥，等待下一次军令评估。") }
            Vassals.bump(r.armyAutonomy)
        }
        Vassals.bump(r.voyages)
    }

    /// 亲自指挥 / 交还 AI.
    public func setArmyManual(_ id: String, manual: Bool) -> (ok: Bool, reason: String) {
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        setManual(id, manual)
        return (true, manual ? "\(a.name.asString)由你亲自指挥，AI 不再调动。" : "\(a.name.asString)交还 AI 自主调度。")
    }

    /// 全军交 AI: the given armies (all armies the player commands when the list is empty) and, with
    /// an empty list, every fleet the player commands go back to the war council at its next pass.
    public func releaseToAI(armyIds: [String]) -> (ok: Bool, reason: String) {
        let r = run
        let ids = armyIds.isEmpty ? r.voyages.manualArmies.asArray.map(\.asString) : armyIds
        var armies = 0
        for id in ids where liveArmy(id) != nil {
            let wasManual = isManual(id)
            setManual(id, false)
            // A box-selected army the AI already commands is sent for a fresh plan as well.
            if !wasManual { let row = r.armyAutonomy.armies[id]; if !row.isNull { row.nextTick = JS(0) } }
            armies += 1
        }
        var fleets = 0
        if armyIds.isEmpty {
            for id in r.voyages.manualFleets.asArray.map(\.asString) { if setFleetManual(id, manual: false).ok { fleets += 1 } }
        }
        if armies == 0 && fleets == 0 { return (false, "没有可交还 AI 的军队。") }
        Vassals.bump(r.armyAutonomy)
        return (true, "\(armies) 支军队" + (fleets > 0 ? "、\(fleets) 支舰队" : "") + "交还 AI，下一轮军机调度即重新部署。")
    }

    /// 驻守: stop where it stands and stay (the AI no longer moves it).
    public func holdArmy(_ id: String) -> (ok: Bool, reason: String) {
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        if run.armyPositions.records[id].status.asString == "moving" { _ = order(armyId: id, provinceIndex: -1) }
        setManual(id, true)
        return (true, "\(a.name.asString)就地驻守。")
    }

    /// 回师: march back to its home province.
    public func returnHome(_ id: String) -> (ok: Bool, reason: String) {
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        let home = run.tactics.forces[id].homeId.optionalString ?? a.originId.optionalString ?? ""
        guard let index = run.world.provinces.asArray.firstIndex(where: { $0.id.asString == home }) else { return (false, "找不到这支军队的驻地。") }
        let out = order(armyId: id, provinceIndex: index)
        return out.ok ? (true, "\(a.name.asString)回师\(run.world.provinces[index].name.asString)。") : out
    }

    /// 补充兵员: refill to full strength from the treasury (half a coin a soldier) and the home
    /// province's people.
    public func reinforceArmy(_ id: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        guard a.status.asString != "fighting" else { return (false, "交战中无法补员。") }
        let force = r.tactics.forces[id], full = force.fullStrength.optionalNumber.map { Int($0) } ?? a.troops.asInt
        let missing = full - a.troops.asInt
        guard missing > 0 else { return (false, "兵员已满。") }
        let fin = r.finance.nations[a.nationId.asString]
        let gold = fin.gold.optionalNumber ?? 0
        let home = force.homeId.optionalString ?? ""
        let stock = r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == home }
        let people = Int(max(0, (stock?.population.optionalNumber ?? 0) - 100))
        let n = min(missing, Int(gold / 0.5), people)
        guard n > 0 else { return (false, gold < 0.5 ? "国库不足，无法补员。" : "驻地人口不足，无法补员。") }
        a.troops = JS(a.troops.asInt + n)
        fin.gold = JS(gold - Double(n) * 0.5)
        if let stock { stock.population = JS((stock.population.optionalNumber ?? 0) - Double(n)) }
        return (true, "\(a.name.asString)补充兵员 \(n) 人，耗金 \(Int((Double(n) * 0.5).rounded()))。")
    }

    /// 分兵: half the troops form a new army at the same spot, with the same arm, orders and records.
    public func splitArmy(_ id: String) -> (ok: Bool, reason: String) {
        let r = run, t = r.tactics
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        guard a.status.asString != "fighting", r.reorganization.active[id].isNull else { return (false, "交战或整编中无法分兵。") }
        guard a.troops.asInt >= 400 else { return (false, "兵力不足四百，无法再分。") }
        var nid: String
        repeat { nid = "force-\(t.nextArmyId.asInt)"; t.nextArmyId = JS(t.nextArmyId.asNumber + 1) } while t.forces.has(nid)
        let half = a.troops.asInt / 2
        let b = a.clone()
        b.id = JS(nid); b.name = JS(a.name.asString + "分部"); b.troops = JS(half)
        a.troops = JS(a.troops.asInt - half)
        r.world.armies.push(b)
        for table in [r.units, r.tactics.forces, r.armyPositions.records, r.forceSpeed.armies, r.combatPersonnel.armies, r.upperCombat.armies, r.armyAutonomy.armies] where !table[id].isNull {
            table[nid] = table[id].clone()
        }
        if !r.armyPositions.records[nid].isNull { r.armyPositions.records[nid].armyId = JS(nid) }
        let full = r.tactics.forces[id].fullStrength.optionalNumber ?? Double(half * 2)
        if !r.tactics.forces[nid].isNull { r.tactics.forces[nid].fullStrength = JS((full / 2).rounded()) }
        if !r.tactics.forces[id].isNull { r.tactics.forces[id].fullStrength = JS(full - (full / 2).rounded()) }
        if isManual(id) { r.voyages.manualArmies.push(JS(nid)) }
        Vassals.bump(r.armyPositions); Vassals.bump(r.armyAutonomy)
        Daily.reconcileMilitaryClock(r)
        return (true, "\(a.name.asString)分出 \(half) 人，另成一军。")
    }

    /// 合兵: this army joins another of its state in the same province (troops, strength and morale).
    public func mergeArmy(_ id: String, into target: String) -> (ok: Bool, reason: String) {
        let r = run
        guard id != target, let a = liveArmy(id), let b = liveArmy(target), a.nationId.asString == b.nationId.asString else { return (false, "只能并入本国的另一支军队。") }
        guard a.status.asString != "fighting", b.status.asString != "fighting" else { return (false, "交战中无法合兵。") }
        guard let here = Armies.space(r).first(where: { $0.army.id.asString == id })?.province?.id.asString,
              Armies.space(r).first(where: { $0.army.id.asString == target })?.province?.id.asString == here else { return (false, "两军须在同一州郡。") }
        let ta = a.troops.asNumber, tb = b.troops.asNumber
        b.morale = JS(((a.morale.asNumber * ta + b.morale.asNumber * tb) / max(1, ta + tb)).rounded())
        b.troops = JS(Int(ta + tb))
        let fb = r.tactics.forces[target], fa = r.tactics.forces[id]
        if !fb.isNull { fb.fullStrength = JS((fb.fullStrength.optionalNumber ?? tb) + (fa.fullStrength.optionalNumber ?? ta)) }
        retire(a)
        return (true, "\(a.name.asString)并入\(b.name.asString)，合兵 \(Int(ta + tb)) 人。")
    }

    /// 解散: the soldiers go home (to the home province's people); the army is removed.
    public func disbandArmy(_ id: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        guard a.status.asString != "fighting" else { return (false, "交战中无法解散。") }
        let home = r.tactics.forces[id].homeId.optionalString ?? ""
        if let stock = r.world.statecraft.provinces.asArray.first(where: { $0.provinceId.asString == home }) {
            stock.population = JS((stock.population.optionalNumber ?? 0) + a.troops.asNumber)
        }
        let name = a.name.asString, n = a.troops.asInt
        retire(a)
        return (true, "\(name)解散，\(n) 人解甲归田。")
    }

    /// 舰队：亲自指挥 / 交还 AI 自主巡防.
    public func setFleetManual(_ id: String, manual: Bool) -> (ok: Bool, reason: String) {
        let r = run
        guard let fl = Naval.fleets(r).first(where: { $0.id.asString == id && $0.status.asString != "lost" }) else { return (false, "这支舰队不存在或已沉没。") }
        if manual {
            if !r.voyages.manualFleets.asArray.contains(where: { $0.asString == id }) { r.voyages.manualFleets.push(JS(id)) }
        } else {
            r.voyages.manualFleets = .array(r.voyages.manualFleets.asArray.filter { $0.asString != id })
            fl.patrol = JS(true)
            if !r.navalAutonomy.isNull { let row = r.navalAutonomy.fleets[id]; if !row.isNull { row.nextTick = JS(0) } }
        }
        Vassals.bump(r.voyages)
        return (true, manual ? "\(fl.name.asString)由你亲自指挥。" : "\(fl.name.asString)交还 AI 自主巡防。")
    }

    /// 改名.
    public func renameArmy(_ id: String, name: String) -> (ok: Bool, reason: String) {
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...12).contains(t.count) else { return (false, "军名须为 1 到 12 个字。") }
        a.name = JS(t)
        return (true, "已更名为\(t)。")
    }

    /// Marks an army gone the way a destroyed one is (the daily retirement then archives it).
    private func retire(_ a: JS) {
        let r = run, id = a.id.asString
        a.troops = JS(0); a.status = JS("destroyed"); a.morale = JS(0); a.supplies = JS(0); a.route = .array(); a.progress = JS(0)
        let t = r.armyPositions.records[id]
        if !t.isNull { t.status = JS("halted") }
        if !r.battles.isNull { r.battles.plans.delete(id) }
        if !r.reorganization.isNull { r.reorganization.active.delete(id) }
        if !r.tactics.isNull { r.tactics.rounds.delete(id) }
        r.voyages.manualArmies = .array(r.voyages.manualArmies.asArray.filter { $0.asString != id })
        Vassals.bump(r.armyPositions)
        Daily.reconcileMilitaryClock(r)
    }
}
