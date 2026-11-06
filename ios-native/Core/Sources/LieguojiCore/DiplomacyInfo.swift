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
        return Data(o.json.utf8)
    }
}
