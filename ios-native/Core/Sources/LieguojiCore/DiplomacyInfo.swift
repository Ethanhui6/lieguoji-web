import Foundation

extension NativeEngine {
    /// 邦交总览: one state's standing with the others — allies, overlord and vassals, treaties and
    /// marriages with the months left, truces with the days left, the states at war with it, and the
    /// states it borders (with their field troops), by nation index.
    public func diplomacyInfo(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        var at = [String: Int](); for (i, n) in nations.enumerated() where at[n.id.asString] == nil { at[n.id.asString] = i }
        let id = nations[index].id.asString, o = JS.object()
        func ints(_ xs: [Int]) -> JS { .array(xs.map { JS($0) }) }

        let alliance = Vassals.allianceOf(r, id)
        o.allies = ints((alliance?.members.asArray ?? []).compactMap { at[$0.asString] }.filter { $0 != index })
        o.overlord = Vassals.overlord(r, id).flatMap { at[$0] }.map { JS($0) } ?? .null
        o.vassals = ints((r.vassals.isNull ? [] : r.vassals.records.asArray).filter { $0.endedTick.isNull && $0.overlordId.asString == id }.compactMap { at[$0.vassalId.asString] })

        let month = r.regimes.isNull ? 0 : r.regimes.month.asInt
        var pacts = [JS]()
        if !r.regimes.isNull, !r.regimes.pacts.isNull {
            for p in r.regimes.pacts.asArray where p.a.asString == id || p.b.asString == id {
                guard let other = at[p.a.asString == id ? p.b.asString : p.a.asString] else { continue }
                let x = JS.object(); x.nation = JS(other); x.kind = JS(p.kind.optionalString ?? "pact"); x.months = JS(max(0, p.until.asInt - month)); pacts.append(x)
            }
        }
        o.pacts = .array(pacts)

        let day = r.world.day.optionalNumber.map { Int($0) } ?? 0
        var truces = [JS](), enemies = [Int]()
        for rel in (r.world.statecraft.isNull ? [] : r.world.statecraft.relations.asArray) where rel.a.asString == id || rel.b.asString == id {
            guard let other = at[rel.a.asString == id ? rel.b.asString : rel.a.asString], Vassals.alive(r, nations[other].id.asString) else { continue }
            if rel.status.asString == "war" { enemies.append(other); continue }
            let until = rel.truceUntilDay.optionalNumber.map { Int($0) } ?? 0
            if until > day { let x = JS.object(); x.nation = JS(other); x.days = JS(until - day); truces.append(x) }
        }
        o.truces = .array(truces)
        o.enemies = ints(enemies)

        // Neighbours: states holding a province next to one of ours, with their field troops.
        let provinces = r.world.provinces.asArray
        var byId = [String: JS](); for p in provinces { byId[p.id.asString] = p }
        var seen = Set<Int>()
        for p in provinces where p.controller.asString == id {
            for q in p.neighbors.asArray {
                guard let other = byId[q.asString].flatMap({ at[$0.controller.asString] }), other != index else { continue }
                seen.insert(other)
            }
        }
        var troops = [String: Int]()
        for a in r.world.armies.asArray where a.troops.asNumber > 0 { troops[a.nationId.asString, default: 0] += a.troops.asInt }
        o.neighbors = .array(seen.sorted().map { n in let x = JS.object(); x.nation = JS(n); x.troops = JS(troops[nations[n].id.asString] ?? 0); return x })
        o.troops = JS(troops[id] ?? 0)

        // 深度外交总览：逐国双边好感 (-100…+100)、立场、逐项理由、有效条约、王位宣称与霸权威胁；以及全球霸主与可调停战事。
        if !r.regimes.isNull, r.regimes.enabled.isTruthy {
            var relatedSet = seen
            for x in enemies { relatedSet.insert(x) }
            for x in (alliance?.members.asArray ?? []).compactMap({ at[$0.asString] }) where x != index { relatedSet.insert(x) }
            if let lord = Vassals.overlord(r, id).flatMap({ at[$0] }) { relatedSet.insert(lord) }
            for p in pacts { relatedSet.insert(p.nation.asInt) }
            // 也补入前 6 个最强存活大国，方便与远方强国纵横捭阖
            let topPowers = nations.indices.filter { $0 != index && Vassals.alive(r, nations[$0].id.asString) && !Regimes.isBlank(r, nations[$0].id.asString) }
                .sorted { (troops[nations[$0].id.asString] ?? 0) > (troops[nations[$1].id.asString] ?? 0) }
            for tp in topPowers.prefix(6) { relatedSet.insert(tp) }

            let opRows = relatedSet.filter { $0 != index && nations.indices.contains($0) && Vassals.alive(r, nations[$0].id.asString) && !Regimes.isBlank(r, nations[$0].id.asString) }.sorted().map { other -> JS in
                let oid = nations[other].id.asString
                let rep = DiplomacyDeep.opinion(r, id, oid)
                let x = JS.object()
                x.nation = JS(other)
                x.score = JS(rep.score)
                x.stance = JS(rep.stance)
                x.hegemonThreat = JS(rep.hegemonThreat)
                x.troops = JS(troops[oid] ?? 0)
                x.neighbor = JS(seen.contains(other))
                x.claim = JS(DiplomacyDeep.hasThroneClaim(r, claimant: id, target: oid))
                x.claimedBy = JS(DiplomacyDeep.hasThroneClaim(r, claimant: oid, target: id))
                x.treaties = .array(DiplomacyDeep.activeTreaties(r, id, oid).map { t in
                    let tk = t.kind.optionalString ?? "pact"
                    let obj = JS.object()
                    obj.kind = JS(tk)
                    obj.label = JS(DiplomacyDeep.treatyLabels[tk] ?? "条约")
                    obj.months = JS(max(1, t.until.asInt - month))
                    return obj
                })
                x.reasons = .array(rep.reasons.map { reason in
                    let obj = JS.object(); obj.label = JS(reason.label); obj.delta = JS(reason.delta); return obj
                })
                return x
            }
            o.opinions = .array(opRows)

            // 天下霸主榜（霸权威胁 >= 15）
            let hegemons = nations.indices.compactMap { i -> JS? in
                let nid = nations[i].id.asString
                guard i != index, Vassals.alive(r, nid), !Regimes.isBlank(r, nid) else { return nil }
                let th = DiplomacyDeep.hegemonThreat(r, of: nid)
                guard th >= 15 else { return nil }
                let x = JS.object(); x.nation = JS(i); x.threat = JS(th); return x
            }
            o.hegemons = .array(hegemons)

            // 可斡旋的第三方交战对（前 8 组）
            var pairs = [JS]()
            for rel in r.world.statecraft.relations.asArray where rel.status.asString == "war" {
                let ra = rel.a.asString, rb = rel.b.asString
                guard ra != id && rb != id, let ia = at[ra], let ib = at[rb], Vassals.alive(r, ra), Vassals.alive(r, rb) else { continue }
                let x = JS.object(); x.a = JS(ia); x.b = JS(ib); pairs.append(x)
                if pairs.count >= 8 { break }
            }
            o.mediatableWars = .array(pairs)
        }
        return Data(o.json.utf8)
    }
}
