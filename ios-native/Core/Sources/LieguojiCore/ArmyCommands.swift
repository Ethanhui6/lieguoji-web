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
        // 战略特产「铁矿」(索引 4) 降低募兵补员军械费用 18%
        let unitCost = (UnitKinds.enabled && Trade.holdings(r, a.nationId.asString)[4, default: 0] > 0) ? 0.41 : 0.5
        let n = min(missing, Int(gold / unitCost), people)
        guard n > 0 else { return (false, gold < unitCost ? "国库不足，无法补员。" : "驻地人口不足，无法补员。") }
        a.troops = JS(a.troops.asInt + n)
        fin.gold = JS(gold - Double(n) * unitCost)
        if let stock { stock.population = JS((stock.population.optionalNumber ?? 0) - Double(n)) }
        let discountNote = unitCost < 0.5 ? "（铁矿特产 −18%）" : ""
        return (true, "\(a.name.asString)补充兵员 \(n) 人，耗金 \(Int((Double(n) * unitCost).rounded()))\(discountNote)。")
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
        let full = max(Double(half * 2), r.tactics.forces[id].fullStrength.optionalNumber ?? Double(half * 2))
        let halfFull = max(Double(half), (full / 2).rounded())
        let remFull = max(Double(a.troops.asInt), full - halfFull)
        if !r.tactics.forces[nid].isNull { r.tactics.forces[nid].fullStrength = JS(halfFull) }
        if !r.tactics.forces[id].isNull { r.tactics.forces[id].fullStrength = JS(remFull) }
        if !r.forceSpeed.armies[nid].isNull { r.forceSpeed.armies[nid].initializedTick = JS(r.clock.tick.asNumber) }
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
        let ta = max(0, a.troops.asNumber), tb = max(0, b.troops.asNumber)
        let mergedTroops = Int((ta + tb).rounded())
        let ma = min(100, max(0, a.morale.asNumber)), mb = min(100, max(0, b.morale.asNumber))
        let sa = min(100, max(0, a.supplies.asNumber)), sb = min(100, max(0, b.supplies.asNumber))
        b.morale = JS(min(100, max(0, ((ma * ta + mb * tb) / max(1, ta + tb)).rounded())))
        b.supplies = JS(min(100, max(0, ((sa * ta + sb * tb) / max(1, ta + tb)).rounded())))
        b.troops = JS(mergedTroops)
        let fb = r.tactics.forces[target], fa = r.tactics.forces[id]
        if !fb.isNull {
            let newFull = max(Double(mergedTroops), (fb.fullStrength.optionalNumber ?? tb) + (fa.fullStrength.optionalNumber ?? ta))
            fb.fullStrength = JS(newFull)
        }
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

    /// 水师战略任务指令（制海巡弋 / 护航掩护 / 封锁敌港 / 破交袭扰 / 归港修整）。
    public func setFleetMission(_ id: String, mission raw: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let fl = Naval.fleets(r).first(where: { $0.id.asString == id && $0.status.asString != "lost" }) else { return (false, "这支舰队不存在或已沉没。") }
        guard let m = MaritimeWarfare.FleetMission(rawValue: raw) else { return (false, "未知的水师战略指令。") }
        _ = MaritimeWarfare.fleetMeta(r, fleet: fl)
        if !r.regimes.isNull {
            r.regimes.fleetMeta[id].mission = JS(m.rawValue)
            r.regimes.fleetMeta[id].playerMission = JS(true)
        }
        // 下达战略指令后交由舰队立刻按该指令自主执行（并重置下次评估时刻）
        r.voyages.manualFleets = .array(r.voyages.manualFleets.asArray.filter { $0.asString != id })
        fl.patrol = JS(true)
        if !r.navalAutonomy.isNull { let row = r.navalAutonomy.fleets[id]; if !row.isNull { row.nextTick = JS(0) } }
        Vassals.bump(r.voyages)
        return (true, "\(fl.name.asString)奉命执行「\(m.label)」：\(m.note)")
    }

    /// 全军水师战略统调：一键为该国全部现役舰队统一下达制海、护航、封锁、破交或归港修整指令。
    public func setNationNavalDoctrine(_ nationIndex: Int, mission raw: String) -> (ok: Bool, reason: String) {
        let r = run
        let nations = r.world.nations.asArray
        guard nations.indices.contains(nationIndex) else { return (false, "国家不存在。") }
        guard let m = MaritimeWarfare.FleetMission(rawValue: raw) else { return (false, "未知的水师战略指令。") }
        let nid = nations[nationIndex].id.asString
        let myFleets = Naval.fleets(r).filter { $0.nationId.asString == nid && $0.status.asString != "lost" && $0.ships.asInt > 0 }
        guard !myFleets.isEmpty else { return (false, "该国当前尚无现役水师舰队。") }
        for fl in myFleets {
            _ = setFleetMission(fl.id.asString, mission: m.rawValue)
        }
        return (true, "\(nations[nationIndex].name.asString)全水师（共 \(myFleets.count) 支舰队）已统一奉行「\(m.label)」。")
    }

    /// 三舰种编制重编（格式 "主力,轻舰,炮舰"，总艘数 1…12，同步更新水兵、船体与海粮）。
    public func setFleetComposition(_ id: String, spec: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let fl = Naval.fleets(r).first(where: { $0.id.asString == id && $0.status.asString != "lost" }) else { return (false, "这支舰队不存在或已沉没。") }
        let parts = spec.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard parts.count == 3 else { return (false, "舰种编制参数无效。") }
        let h = max(0, parts[0]), l = max(0, parts[1]), g = max(0, parts[2])
        let total = h + l + g
        guard (1...12).contains(total) else { return (false, "舰队总战船须为 1 至 12 艘。") }
        let oldShips = max(1, fl.ships.asInt)
        let oldHullRatio = min(1.0, max(0.25, (r.maritime.hulls[id].optionalNumber ?? Double(oldShips * 100)) / Double(oldShips * 100)))
        fl.ships = JS(total)
        fl.crew = JS(total * 200)
        fl.food = JS(max(fl.food.asInt, total * 200 * 45))
        r.maritime.hulls[id] = JS(Double(total) * 100.0 * max(oldHullRatio, 0.85))
        _ = MaritimeWarfare.fleetMeta(r, fleet: fl)
        if !r.regimes.isNull {
            r.regimes.fleetMeta[id].heavy = JS(h)
            r.regimes.fleetMeta[id].light = JS(l)
            r.regimes.fleetMeta[id].gunboats = JS(g)
        }
        return (true, "\(fl.name.asString)已整编：主力 \(h) · 巡弋 \(l) · 炮舰 \(g)（共 \(total) 艘）。")
    }

    /// 舰队紧急船坞抢修与补给（在安全本国港立即修复；在外海则改命归港修整并立即返航）。
    public func refitFleetNow(_ id: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let fl = Naval.fleets(r).first(where: { $0.id.asString == id && $0.status.asString != "lost" }) else { return (false, "这支舰队不存在或已沉没。") }
        let nation = fl.nationId.asString
        let ships = max(1, fl.ships.asInt)
        let maxHull = Double(ships) * 100.0
        let curHull = r.maritime.hulls[id].optionalNumber ?? maxHull
        let maxCrew = ships * 200
        let rec = r.fleetPositions.records[id]
        let atFriendlyPort: Bool = {
            guard let bridge = Armies.bridge, let sea = Naval.sea, !rec.isNull else { return false }
            let pt = bridge.graph.location(bridge.travel(rec)).point
            guard let p = sea.ports.first(where: { jsHypot(pt.x - $0.center.x, pt.y - $0.center.y) <= 28 }) else { return false }
            return r.portControl.ports[p.provinceId].landOwnerId.optionalString == nation && !MaritimeWarfare.isPortBlockaded(r, provinceId: p.provinceId, landOwner: nation)
        }()
        if atFriendlyPort {
            r.maritime.hulls[id] = JS(min(maxHull, curHull + maxHull * 0.45))
            fl.crew = JS(maxCrew)
            fl.food = JS(max(fl.food.asInt, maxCrew * 55))
            if let nat = r.world.nations.asArray.first(where: { $0.id.asString == nation }) {
                nat.gold = JS(max(0, nat.gold.asNumber - 100))
            }
            return (true, "\(fl.name.asString)完成紧急船坞抢修与海粮满载（耗资 100 金）。")
        } else {
            return setFleetMission(id, mission: "refit")
        }
    }

    /// 为舰队委任本国水师提督（择取本国在世武略最高将才，实装海战火力与指挥加成）。
    public func assignFleetAdmiral(_ id: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let fl = Naval.fleets(r).first(where: { $0.id.asString == id && $0.status.asString != "lost" }) else { return (false, "这支舰队不存在或已沉没。") }
        let nation = fl.nationId.asString
        _ = MaritimeWarfare.fleetMeta(r, fleet: fl)
        var bestName: String? = nil
        var bestScore = -1.0
        var bestBonus = 10
        var bestSkill = SeaDominion.AdmiralSkill.fireAttack
        // v14.0.0 修复：读取真实人物表 r.kin.persons（旧版误读空字段 r.people.people 导致永远回退「镇海都督」），并统一走 NativeEngine.displayPersonName！
        let sid = Offices.stateId(r, nation)
        if !r.kin.isNull, !r.kin.persons.isNull {
            for p in r.kin.persons.objectValues {
                guard case .object = p.storage, p.isAlive.optionalBool == true else { continue }
                guard p.stateId.asInt == sid, (p.age.optionalNumber ?? 0) >= 18 else { continue }
                let mil = People.skills(p).military
                let traits = p.traits.isNull ? [] : p.traits.asArray.compactMap(\.optionalString)
                let navalTrait = traits.contains("NavalMastery") ? 35.0 : (traits.contains("ShipMaster") ? 20.0 : 0.0)
                let score = mil + navalTrait
                if score > bestScore {
                    bestScore = score
                    bestName = NativeEngine.displayPersonName(p)
                    bestBonus = max(8, min(32, Int((mil / 4.2 + (navalTrait > 0 ? 10 : 0)).rounded())))
                    bestSkill = SeaDominion.AdmiralSkill.pick(traits: traits, military: mil, seed: p.id.asInt)
                }
            }
        }
        let chosen = bestName ?? "镇海都督"
        if !r.regimes.isNull {
            r.regimes.fleetMeta[id].admiralName = JS(chosen)
            r.regimes.fleetMeta[id].admiralBonus = JS(bestBonus)
            r.regimes.fleetMeta[id].admiralSkill = JS(bestSkill.rawValue)
        }
        Daily.event(r, "politics", "委任\(chosen)为\(fl.name.asString)水师提督〔\(bestSkill.label)〕", "提督统帅水师出征，舰队海战战力提升 +\(bestBonus)%，特技「\(bestSkill.label)」：\(bestSkill.note)")
        return (true, "已委任「\(chosen)」出任水师提督（火力 +\(bestBonus)% · 特技「\(bestSkill.label)」）。")
    }

    /// 改名.
    public func renameArmy(_ id: String, name: String) -> (ok: Bool, reason: String) {
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...12).contains(t.count) else { return (false, "军名须为 1 到 12 个字。") }
        a.name = JS(t)
        return (true, "已更名为\(t)。")
    }

    /// 整编军部：更改军队职能分部（御林禁军/野战主力/边防镇戍/轻骑前锋/攻城炮旅），可选同步换授本文化对应编制番号。
    public func setArmyBranch(_ id: String, branch raw: String, rename: Bool = true) -> (ok: Bool, reason: String) {
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        guard let br = Regimes.ArmyBranch(rawValue: raw) else { return (false, "未知的军队职能分部。") }
        let newTitle = Regimes.reorganizeArmyBranch(run, army: a, branch: br, rename: rename)
        return (true, "已整编为\(br.label)「\(newTitle)」，\(br.roleNote)")
    }

    /// 换授名将：自动从本国在世成年人物中甄选武略最高之将才，授以常备军统帅（战时兼授征讨大将），立竿见影提升军团实战攻防。
    public func appointBestCommander(_ id: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        let nid = a.nationId.asString
        let sid = Offices.stateId(r, nid)
        let curMarshal = Offices.holder(r, nid, "Marshal", sid)?.id.asInt ?? -1
        var pool = [(p: JS, score: Double)]()
        for p in r.kin.persons.objectValues {
            guard case .object = p.storage, p.isAlive.optionalBool == true else { continue }
            guard p.stateId.asInt == sid, (p.age.optionalNumber ?? 0) >= 18 else { continue }
            let mil = People.skills(p).military
            let traits = Set(p.traits.isNull ? [] : p.traits.asArray.compactMap(\.optionalString))
            var sc = mil
            if traits.contains("Tactician") || traits.contains("Strategist") || traits.contains("BattleHardened") || traits.contains("Veteran") { sc += 12 }
            if traits.contains("Conqueror") || traits.contains("Brave") || traits.contains("Genius") { sc += 8 }
            if traits.contains("Incompetent") || traits.contains("Craven") { sc -= 18 }
            pool.append((p, sc))
        }
        pool.sort { $0.score > $1.score }
        guard let top = pool.first else { return (false, "本国暂无可授帅印的成年将才。") }
        let chosen = (top.p.id.asInt == curMarshal && pool.count > 1 && pool[1].score >= top.score - 5) ? pool[1].p : top.p
        let ctx = Offices.context(r, nid)
        Offices.appoint(ctx, "Marshal", 0, sid, chosen.id.asInt)
        for w in Offices.wars(r, nid) {
            Offices.appoint(ctx, "WarCommander", 2, w.scopeId, chosen.id.asInt)
        }
        Government.refreshLeaderCombat(r)
        let cmd = Regimes.activeCommander(r, nation: nid, enemy: Offices.wars(r, nid).first?.enemy)
        let fullName = NativeEngine.displayPersonName(chosen)
        let milVal = Int(People.skills(chosen).military.rounded())
        let pctStr = cmd.map { " · 实战攻防 \($0.combatBonusPct >= 0 ? "+" : "−")\(abs($0.combatBonusPct))%" } ?? ""
        People.recordHistory(r, kind: "politics", text: "拜\(fullName)为全军主帅",
                             reason: "于\(a.name.asString)临阵换将，授\(fullName)（武略 \(milVal)）节制三军\(pctStr)。",
                             nations: [nid], province: nil)
        return (true, "已拜「\(fullName)」为主帅（武略 \(milVal)\(pctStr)）！")
    }

    /// 急补粮饷：耗 90 金立刻将该军补给补满至 100 并提振士气 +22（危急前线一键续命）。
    public func fieldResupply(_ id: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        let nid = a.nationId.asString
        let fin = r.finance.nations[nid]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        guard gold >= 90 else { return (false, "国库不足 90 金，无法前线急补粮饷。") }
        if !fin.isNull { fin.gold = JS(max(0, gold - 90)) }
        a.supplies = JS(100)
        a.morale = JS(min(100, (a.morale.optionalNumber ?? 50) + 22))
        return (true, "\(a.name.asString)急补粮饷完成：粮草满额（100），士气 +22（耗 90 金）。")
    }

    /// 军中演武：非交战时耗 80 金强化单军历练 +15（进阶精锐/王牌/无双勋阶）、士气 +12。
    public func fieldDrill(_ id: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let a = liveArmy(id) else { return (false, "这支军队不存在或已覆灭。") }
        guard a.status.asString != "fighting" else { return (false, "交战中无法列阵演武。") }
        let nid = a.nationId.asString
        let fin = r.finance.nations[nid]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        guard gold >= 80 else { return (false, "国库不足 80 金，无法组织军中演武。") }
        if !fin.isNull { fin.gold = JS(max(0, gold - 80)) }
        Regimes.enable(r)
        if r.regimes.armyXP.isNull { r.regimes.armyXP = JS.object() }
        let before = r.regimes.armyXP[id].optionalNumber ?? 0
        let after = min(100, before + 15)
        r.regimes.armyXP[id] = JS(after)
        a.morale = JS(min(100, (a.morale.optionalNumber ?? 60) + 12))
        let rankLabel = after >= 80 ? "无双虎师" : after >= 55 ? "王牌精锐" : after >= 30 ? "百战精锐" : "常备正军"
        return (true, "\(a.name.asString)演武大成：历练升至 \(Int(after))（\(rankLabel)），士气 +12（耗 80 金）。")
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
