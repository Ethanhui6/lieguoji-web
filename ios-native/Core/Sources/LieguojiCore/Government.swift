import Foundation

/// Government continuity and the state records of the political tick (civilization47-political-owner,
/// civilization47-capitals, civilization47-combat-state, leader-history47, state-traits47): a state that
/// loses all land ends its reign, one that regains land restores its ruler or a known candidate, lost
/// capitals move, the leader's per-enemy combat modifier is refreshed, and each reign's start/end
/// counts and each state's traits are kept.
public enum Government {
    static let f = Native.fr
    static let combatTraits = ["WellTrained", "CoreDefense", "HomelandDefense", "Conqueror", "StrengthenCore"]
    /// The original's names and descriptions (I2 localization).
    static let stateTraitText: [String: (String, String)] = [
        "FightToTheEnd": ("奋战至死", "永远不会投降，直到最后一兵一卒"), "StrengthenCore": ("强化核心", "核心省份上限占比增加"),
        "ManifestDestiny": ("天命昭昭", "命由天定，一往无前，天赋荣光，唯我独尊"), "BullyTheWeak": ("欺凌弱小", "选择最弱小的国家发动进攻"),
        "DefyTheStrong": ("不畏强权", "选择最强大的国家发动攻击"), "TotalWar": ("全面战争", "与每一个接触的国家发生战争"),
        "WellTrained": ("训练有素", "无视负面地形对军队战斗力的削弱"), "CoreDefense": ("核心守卫", "在核心领土上战斗力增加"),
        "CavalryTradition": ("骑兵传统", "军队移动速度增加"), "HomelandDefense": ("国土防卫", "在防守的时候战斗力增加"),
        "Conqueror": ("我来，我见，我征服", "在进攻时战斗力增加"), "SiegeCapture": ("攻城略地", "能够快速的占领地方行省"),
        "FieldCombatElite": ("野战精英", "能够快速的击败敌人的军队"),
    ]
    static let stateTraits = ["FightToTheEnd", "StrengthenCore", "ManifestDestiny", "BullyTheWeak", "DefyTheStrong", "TotalWar", "WellTrained", "CoreDefense", "CavalryTradition", "HomelandDefense", "Conqueror", "SiegeCapture", "FieldCombatElite"]

    // MARK: Leader combat (refreshLeaderCombat47)
    static func enemyIds(_ r: JS, _ id: String) -> [String] {
        let state = r.people.nations[id].id.asInt
        var result = Set<String>()
        for war in r.nativeWars.campaigns.asArray where war.endedTick.isNull {
            guard let own = war.participants.asArray.first(where: { $0.stateId.asInt == state }) else { continue }
            for m in war.participants.asArray where m.side.asInt != own.side.asInt { result.insert(Wars.nationOf(r.nativeWars, m.stateId.asInt)) }
        }
        return result.sorted { Array($0.utf16).lexicographicallyPrecedes(Array($1.utf16)) }
    }
    public static func refreshLeaderCombat(_ r: JS) {
        for n in r.world.nations.asArray {
            let id = n.id.asString, leaderId = r.people.nations[id].leaderId
            let person = leaderId.isNull ? nil : People.person(r, leaderId.asInt)
            let enemies = enemyIds(r, id)
            var modifier = 0.0
            for t in (person.map { $0.traits.isNull ? [] : $0.traits.asArray.map(\.asString) } ?? []) {
                let v = f(Nobility.trait(t)?.combatModifierPerEnemy.optionalNumber ?? 0)
                if v != 0 { modifier = max(f(-0.5), min(f(0.5), f(f(Double(enemies.count)) * v))); break }
            }
            let l = JS.object()
            l.leaderId = person.map { $0.id.clone() } ?? .null; l.traitNames = person.map { $0.traits.isNull ? .array() : $0.traits.clone() } ?? .array()
            l.enemyIds = .array(enemies.map { JS($0) }); l.refreshedTick = r.clock.tick.clone(); l.modifier = JS(modifier)
            r.combatPersonnel.nations[id].leader = l
        }
    }

    // MARK: Capitals (relocateLostCapitals47)
    public static func relocateLostCapitals(_ r: JS) {
        var provinces = [String: JS](); for p in r.world.provinces.asArray { provinces[p.id.asString] = p }
        var changed = false
        for nation in r.world.nations.asArray {
            let id = nation.id.asString
            guard let previous = r.world.cities.asArray.first(where: { $0.id.optionalString == nation.capitalId.optionalString }), provinces[previous.provinceId.asString]?.controller.asString != id else { continue }
            let owned = r.world.provinces.asArray.filter { $0.controller.asString == id }
            if owned.isEmpty { continue }
            var sizes = [String: Int](), seen = Set<String>()
            for p in owned where !seen.contains(p.id.asString) {
                var component = [p]; seen.insert(p.id.asString); var i = 0
                while i < component.count {
                    for nb in component[i].neighbors.asArray.map(\.asString) { if let q = provinces[nb], q.controller.asString == id, !seen.contains(nb) { seen.insert(nb); component.append(q) } }
                    i += 1
                }
                for q in component { sizes[q.id.asString] = component.count }
            }
            var population = [String: Double](); for p in r.world.statecraft.provinces.asArray { population[p.provinceId.asString] = p.population.asNumber }
            func distance(_ c: JS) -> Double { let dx = c.position.x.asNumber - previous.position.x.asNumber, dy = c.position.y.asNumber - previous.position.y.asNumber; return dx * dx + dy * dy }
            let candidates = stableSorted(r.world.cities.asArray.filter { provinces[$0.provinceId.asString]?.controller.asString == id }) { a, b in
                let pa = a.provinceId.asString, pb = b.provinceId.asString
                let sa = sizes[pa] ?? 0, sb = sizes[pb] ?? 0
                if sa != sb { return sa > sb }
                let la = provinces[pa]?.legalOwner.optionalString == id, lb = provinces[pb]?.legalOwner.optionalString == id
                if la != lb { return la }
                let popA = population[pa] ?? 0, popB = population[pb] ?? 0
                if popA != popB { return popA > popB }
                if distance(a) != distance(b) { return distance(a) < distance(b) }
                return Collate.less(a.id.asString, b.id.asString)
            }
            guard let next = candidates.first else { continue }
            let captor = provinces[previous.provinceId.asString]?.controller.optionalString ?? ""
            nation.capitalId = next.id.clone(); changed = true
            People.announce(r, kind: "capital", text: "\(nation.name.asString)迁都\(next.name.asString)", reason: "旧首都\(previous.name.asString)现由\(Vassals.name(r, captor))控制，改以\(next.name.asString)为首都。优先选择最大连片控制区内的本土城市，再依人口和距离择址。", nations: captor.isEmpty ? [id] : [id, captor], province: next.provinceId.asString)
        }
        if changed { Wars.reconcileCore(r) }
    }

    // MARK: Continuity (reconcileGovernmentContinuity47)
    static func closeLeaderRole(_ r: JS, _ nationId: String, _ reason: String) {
        let id = r.people.nations[nationId].leaderId
        if id.isNull { return }
        guard let p = People.person(r, id.asInt), !p.roles.isNull else { return }
        let roles = p.roles.asArray.filter { $0.nativeKind.optionalString == "leader" && $0.stateId.asInt == p.stateId.asInt }
        guard let first = roles.first else { return }
        if p.pastRoles.isNull { p.pastRoles = .array() }
        p.pastRoles.push(People.pastRole(first, time: r.life.gameTime.asNumber, reason: reason))
        p.roles.asArray = p.roles.asArray.filter { role in !roles.contains { $0 === role } }
    }
    public static func reconcileContinuity(_ r: JS) {
        var changed = false
        for n in r.world.nations.asArray {
            let id = n.id.asString, land = r.world.provinces.asArray.filter { $0.controller.asString == id }, ended = r.chronicle.ended.has(id)
            let history = r.chronicle.leaders[id]
            guard !history.isNull, let last = history.asArray.last else { continue }
            if land.isEmpty && !ended {
                closeLeaderRole(r, id, "extinction"); r.chronicle.ended[id] = r.world.day.clone()
                // Last province removed this tick: a dead state does not keep field armies.
                // Positive-strength armies are cleared here (DestroyArmy), not left idle and not sent to allies.
                clearCollapsedArmies(r, id)
                if last.endedDay.isNull { last.endedDay = r.world.day.clone() }
                r.people.nations[id].leaderId = .null; r.people.revision = JS(r.people.revision.asNumber + 1); r.kin.lifecycle.vacancies.delete(id); r.kin.revision = JS(r.kin.revision.asNumber + 1); changed = true
                People.announce(r, kind: "extinction", text: "\(n.name.asString)失去全部领土，国家覆亡", reason: "实控领土归零，结束当前任期；人物、家族、城市与历史保留。", nations: [id], province: nil, people: [last])
            } else if !land.isEmpty && ended {
                let prevKey = r.sovereignty.reigns[last.id.asString].asInt.description
                let previous = r.kin.persons[prevKey], polity = r.civilization.nations[id].polity.optionalString ?? "Kingdom"
                r.chronicle.ended.delete(id)
                if !previous.isNull && previous.isAlive.asBool && (!["Republic", "Federation"].contains(polity) || previous.age.asInt >= 25) && (polity != "Tribal" || previous.age.asInt >= 12) {
                    People.appointKnownPerson(r, id, previous, cause: "restoration", requestedName: last.regnalName.optionalString)
                } else if !previous.isNull { People.resolveKnownSuccession(r, id, previous, cause: "restoration") }
                r.sovereignty.restorations[id] = JS((r.sovereignty.restorations[id].optionalNumber ?? 0) + 1); r.sovereignty.revision = JS(r.sovereignty.revision.asNumber + 1); changed = true
                Regimes.retitleRestored(r, id)
                let reign = history.asArray.last ?? last, active = reign.endedDay.isNull
                let tail = active ? "，\(reign.name.asString)\(!previous.isNull && r.sovereignty.reigns[reign.id.asString].asInt == previous.id.asInt ? "复位" : "接任")" : "，领袖暂缺"
                People.announce(r, kind: "restoration", text: "\(n.name.asString)重获领土\(tail)", reason: "保留已知身份，符合本政体年龄资格的在世前任复位；否则按政体选已知候选，没有合法候选则保持空位。", nations: [id], province: land[0].id.asString, people: active ? [reign] : [])
            }
        }
        if changed { refreshLeaderCombat(r) }
        relocateLostCapitals(r)
    }

    /// Armies of a state that already has no provinces. App rules only, so web-parity runs keep their armies.
    /// Clears follow this client's existing destroyed-army write (SIMPLIFIED_ next to the original component list).
    static func clearCollapsedArmies(_ r: JS, _ nationId: String) {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        guard !r.world.provinces.asArray.contains(where: { $0.controller.asString == nationId }) else { return }
        for a in r.world.armies.asArray where a.nationId.asString == nationId && a.troops.asNumber > 0 && a.status.asString != "destroyed" {
            let id = a.id.asString
            a.troops = JS(0); a.status = JS("destroyed"); a.morale = JS(0); a.supplies = JS(0); a.route = .array(); a.progress = JS(0)
            if !r.armyPositions.isNull {
                let t = r.armyPositions.records[id]
                if !t.isNull { t.status = JS("halted") }
            }
            if !r.battles.isNull { r.battles.plans.delete(id) }
            if !r.reorganization.isNull { r.reorganization.active.delete(id) }
            if !r.tactics.isNull { r.tactics.rounds.delete(id) }
        }
    }

    // MARK: Records (recordReigns47, recordStateTraits47)
    public static func recordReigns(_ r: JS) {
        let ledger = r.reigns47
        if ledger.isNull { return }
        let app = !r.regimes.isNull && r.regimes.enabled.isTruthy
        var provinceCounts = [String: Int](), vassalCounts = [String: Int]()
        for p in r.world.provinces.asArray { if let c = p.controller.optionalString { provinceCounts[c, default: 0] += 1 } }
        for v in r.vassals.records.asArray where v.endedTick.isNull { if let o = v.overlordId.optionalString { vassalCounts[o, default: 0] += 1 } }
        func counts(_ nationId: String) -> JS {
            .array([JS(provinceCounts[nationId] ?? 0), JS(vassalCounts[nationId] ?? 0)])
        }
        var capitalByNation = [String: String](), nameByNation = [String: String]()
        if app {
            var cityProv = [String: String]()
            for c in r.world.cities.asArray { if let cid = c.id.optionalString, let pid = c.provinceId.optionalString { cityProv[cid] = pid } }
            for n in r.world.nations.asArray {
                let nid = n.id.asString
                nameByNation[nid] = n.name.optionalString ?? ""
                if let cid = n.capitalId.optionalString, let pid = cityProv[cid] { capitalByNation[nid] = pid }
            }
        }
        for (nationId, reigns) in r.chronicle.leaders.objectEntries {
            let curLand = provinceCounts[nationId] ?? 0
            for reign in reigns.asArray {
                let rid = reign.id.asString
                let row = ledger[rid]
                if row.isNull {
                    if reign.endedDay.isNull {
                        let o = JS.object(); o.start = counts(nationId); o.end = .null
                        if app {
                            o.peak = JS(curLand)
                            if let cp = capitalByNation[nationId] { o.capital = JS(cp) }
                            if let sn = nameByNation[nationId], !sn.isEmpty { o.stateName = JS(sn) }
                            if let pol = r.civilization.nations[nationId].polity.optionalString { o.polity = JS(pol) }
                        }
                        ledger[rid] = o
                    }
                } else {
                    if app && reign.endedDay.isNull {
                        let prevPeak = row.peak.optionalNumber.map(Int.init) ?? (row.start[0].optionalNumber.map(Int.init) ?? 0)
                        if curLand > prevPeak { row.peak = JS(curLand) }
                        if row.capital.isNull, let cp = capitalByNation[nationId] { row.capital = JS(cp) }
                        if row.stateName.isNull, let sn = nameByNation[nationId], !sn.isEmpty { row.stateName = JS(sn) }
                        if row.polity.isNull, let pol = r.civilization.nations[nationId].polity.optionalString { row.polity = JS(pol) }
                    }
                    if row.end.isNull && !reign.endedDay.isNull { row.end = counts(nationId) }
                }
            }
        }
    }
    static func generateStateTraits(_ seed: String, _ nationId: String) -> [String] {
        var s = People.nameSeed("\(seed)/state-traits47/\(nationId)")
        func next() -> Double { s = s &* 1664525 &+ 1013904223; return Double(s) / 4294967296 }
        let count = 2 + Int((next() * 4).rounded(.down))
        var pool = stateTraits, out = [String]()
        while out.count < count && !pool.isEmpty { out.append(pool.remove(at: Int((next() * Double(pool.count)).rounded(.down)))) }
        return out
    }
    public static func recordStateTraits(_ r: JS) {
        let ledger = r.stateTraits47
        if ledger.isNull { return }
        for n in r.world.nations.asArray {
            let id = n.id.asString
            if ledger[id].isNull { ledger[id] = .array(generateStateTraits(r.world.custom.seed.asString, id).map { JS($0) }) }
            let traits = ledger[id].asArray.map(\.asString), combat = r.upperCombat.nations[id]
            if combat.isNull { continue }
            let want = combatTraits.filter { traits.contains($0) }
            if want != combat.traits.asArray.map(\.asString) { combat.traits = .array(want.map { JS($0) }) }
            let personnel = r.combatPersonnel.nations[id]
            if !personnel.isNull { personnel.damageTraits = .array(["FieldCombatElite", "SiegeCapture"].filter { traits.contains($0) }.map { JS($0) }) }
            let destiny = r.destiny.nations[id], manifest = traits.contains("ManifestDestiny")
            if !destiny.isNull && destiny.manifest.asBool != manifest {
                destiny.manifest = JS(manifest)
                if manifest {
                    var rng = Destiny.Random(seed: UInt32(truncatingIfNeeded: Int64(destiny.seed.asNumber)))
                    destiny.manifestCount = JS(rng.intRange(2, 5)); destiny.seed = JS(Double(rng.seed))
                }
                r.destiny.revision = JS(r.destiny.revision.asNumber + 1)
            }
        }
    }
}
