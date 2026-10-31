import Foundation

/// Government continuity and the state records of the political tick (civilization47-political-owner,
/// civilization47-capitals, civilization47-combat-state, leader-history47, state-traits47): a state that
/// loses all land ends its reign, one that regains land restores its ruler or a known candidate, lost
/// capitals move, the leader's per-enemy combat modifier is refreshed, and each reign's start/end
/// counts and each state's traits are kept.
public enum Government {
    static let f = Native.fr
    static let combatTraits = ["WellTrained", "CoreDefense", "HomelandDefense", "Conqueror", "StrengthenCore"]
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
                if sizes[pa]! != sizes[pb]! { return sizes[pa]! > sizes[pb]! }
                let la = provinces[pa]!.legalOwner.asString == id, lb = provinces[pb]!.legalOwner.asString == id
                if la != lb { return la }
                if population[pa]! != population[pb]! { return population[pa]! > population[pb]! }
                if distance(a) != distance(b) { return distance(a) < distance(b) }
                return Collate.less(a.id.asString, b.id.asString)
            }
            let next = candidates[0], captor = provinces[previous.provinceId.asString]!.controller.asString
            nation.capitalId = next.id.clone(); changed = true
            People.announce(r, kind: "capital", text: "\(nation.name.asString)迁都\(next.name.asString)", reason: "旧首都\(previous.name.asString)现由\(Vassals.name(r, captor))控制，改以\(next.name.asString)为首都。优先选择最大连片控制区内的本土城市，再依人口和距离择址。", nations: [id, captor], province: next.provinceId.asString)
        }
        if changed { Wars.reconcileCore(r) }
    }

    // MARK: Continuity (reconcileGovernmentContinuity47)
    static func closeLeaderRole(_ r: JS, _ nationId: String, _ reason: String) {
        let id = r.people.nations[nationId].leaderId
        if id.isNull { return }
        let p = People.person(r, id.asInt)!
        let roles = p.roles.asArray.filter { $0.nativeKind.optionalString == "leader" && $0.stateId.asInt == p.stateId.asInt }
        p.pastRoles.push(People.pastRole(roles[0], time: r.life.gameTime.asNumber, reason: reason))
        p.roles.asArray = p.roles.asArray.filter { role in !roles.contains { $0 === role } }
    }
    public static func reconcileContinuity(_ r: JS) {
        var changed = false
        for n in r.world.nations.asArray {
            let id = n.id.asString, land = r.world.provinces.asArray.filter { $0.controller.asString == id }, ended = r.chronicle.ended.has(id)
            let history = r.chronicle.leaders[id], last = history.asArray.last!
            if land.isEmpty && !ended {
                closeLeaderRole(r, id, "extinction"); r.chronicle.ended[id] = r.world.day.clone()
                if last.endedDay.isNull { last.endedDay = r.world.day.clone() }
                r.people.nations[id].leaderId = .null; r.people.revision = JS(r.people.revision.asNumber + 1); r.kin.lifecycle.vacancies.delete(id); r.kin.revision = JS(r.kin.revision.asNumber + 1); changed = true
                People.announce(r, kind: "extinction", text: "\(n.name.asString)失去全部领土，国家覆亡", reason: "实控领土归零，结束当前任期；人物、家族、城市与历史保留。", nations: [id], province: nil, people: [last])
            } else if !land.isEmpty && ended {
                let previous = r.kin.persons[r.sovereignty.reigns[last.id.asString].asInt.description], polity = r.civilization.nations[id].polity.asString
                r.chronicle.ended.delete(id)
                if previous.isAlive.asBool && (!["Republic", "Federation"].contains(polity) || previous.age.asInt >= 25) && (polity != "Tribal" || previous.age.asInt >= 12) {
                    People.appointKnownPerson(r, id, previous, cause: "restoration", requestedName: last.regnalName.asString)
                } else { People.resolveKnownSuccession(r, id, previous, cause: "restoration") }
                r.sovereignty.restorations[id] = JS(r.sovereignty.restorations[id].asNumber + 1); r.sovereignty.revision = JS(r.sovereignty.revision.asNumber + 1); changed = true
                let reign = history.asArray.last!, active = reign.endedDay.isNull
                let tail = active ? "，\(reign.name.asString)\(r.sovereignty.reigns[reign.id.asString].asInt == previous.id.asInt ? "复位" : "接任")" : "，领袖暂缺"
                People.announce(r, kind: "restoration", text: "\(n.name.asString)重获领土\(tail)", reason: "保留已知身份，符合本政体年龄资格的在世前任复位；否则按政体选已知候选，没有合法候选则保持空位。", nations: [id], province: land[0].id.asString, people: active ? [reign] : [])
            }
        }
        if changed { refreshLeaderCombat(r) }
        relocateLostCapitals(r)
    }

    // MARK: Records (recordReigns47, recordStateTraits47)
    public static func recordReigns(_ r: JS) {
        let ledger = r.reigns47
        if ledger.isNull { return }
        func counts(_ nationId: String) -> JS {
            .array([JS(r.world.provinces.asArray.filter { $0.controller.asString == nationId }.count), JS(r.vassals.records.asArray.filter { $0.overlordId.asString == nationId && $0.endedTick.isNull }.count)])
        }
        for (nationId, reigns) in r.chronicle.leaders.objectEntries {
            for reign in reigns.asArray {
                let row = ledger[reign.id.asString]
                if row.isNull { if reign.endedDay.isNull { let o = JS.object(); o.start = counts(nationId); o.end = .null; ledger[reign.id.asString] = o } }
                else if row.end.isNull && !reign.endedDay.isNull { row.end = counts(nationId) }
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
