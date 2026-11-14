import Foundation

/// 名将谱、合纵连横、天灾随气候 (本作规则, 1.15).
extension Regimes {
    // MARK: 名将谱

    /// The ranks of the roll, by merit.
    static let generalRanks: [(merit: Double, title: String)] = [(350, "军神"), (200, "上将军"), (100, "名将"), (40, "骁将")]
    static func generalRank(_ merit: Double) -> String? { generalRanks.first { merit >= $0.merit }?.title }

    /// Who commands a state's wars: the war commander against each enemy, or the marshal where a war has none.
    static func commanders(_ r: JS, _ id: String) -> [JS] {
        var seen = Set<Int>(), out = [JS]()
        for w in Offices.wars(r, id) {
            if let p = Offices.holder(r, id, "WarCommander", w.scopeId), seen.insert(p.id.asInt).inserted { out.append(p) }
        }
        if out.isEmpty, !Offices.wars(r, id).isEmpty, let m = Offices.holder(r, id, "Marshal", Offices.stateId(r, id)) { out.append(m) }
        return out
    }

    /// Each month: the commanders of a state at war earn merit — a little for the month in the field,
    /// much more for every province the state gained in it. A commander who reaches forty enters the
    /// roll; the chronicle records it when he becomes a 名将 and a 军神, and when one of the roll dies.
    static func generalsMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        if r.regimes.generals.isNull { r.regimes.generals = .object() }
        let roll = r.regimes.generals, b = book(r, id)
        let land = r.world.provinces.asArray.reduce(0) { $1.controller.optionalString == id ? $0 + 1 : $0 }
        let gained = max(0, land - (b.landSeen.optionalNumber.map { Int($0) } ?? land))
        b.landSeen = JS(land)
        for p in commanders(r, id) where p.isAlive.asBool {
            let k = p.id.asInt.description
            if roll[k].isNull {
                let e = JS.object()
                e.id = p.id.clone(); e.name = JS(personName(p)); e.nation = JS(id); e.merit = JS(0); e.months = JS(0); e.gained = JS(0); e.sinceDay = r.world.day.clone(); e.fallen = JS(false)
                roll[k] = e
            }
            let e = roll[k], before = e.merit.optionalNumber ?? 0, after = before + 4 + Double(gained) * 12
            e.merit = JS(after); e.months = JS(e.months.asInt + 1); e.gained = JS(e.gained.asInt + gained); e.nation = JS(id); e.name = JS(personName(p))
            let was = generalRank(before), now = generalRank(after)
            if let now, now != was, now == "名将" || now == "军神" {
                _ = People.announce(r, kind: "event", text: "\(n.name.asString)\(personName(p))列为\(now)", reason: "统兵 \(e.months.asInt) 月，为国拓地 \(e.gained.asInt) 州，战功积至 \(Int(after))，名登将谱。", nations: [id], province: nil)
            }
        }
        // 将星陨落: one of the roll who served this state has died.
        for (k, e) in roll.objectEntries where e.nation.optionalString == id && !e.fallen.isTruthy && generalRank(e.merit.optionalNumber ?? 0) != nil {
            guard let p = People.person(r, Int(k) ?? -1), !p.isAlive.asBool else { continue }
            e.fallen = JS(true); e.fallenDay = r.world.day.clone()
            _ = People.announce(r, kind: "event", text: "\(n.name.asString)\(generalRank(e.merit.optionalNumber ?? 0) ?? "")\(e.name.asString)卒", reason: "一代将星陨落：生前统兵 \(e.months.asInt) 月，拓地 \(e.gained.asInt) 州。", nations: [id], province: nil)
        }
    }

    /// 名将谱 for the page: everyone who has reached a rank, the most merit first.
    static func generalsRoll(_ r: JS) -> JS {
        guard !r.regimes.isNull, !r.regimes.generals.isNull else { return .array() }
        var index = [String: Int]()
        for (i, n) in r.world.nations.asArray.enumerated() where index[n.id.asString] == nil { index[n.id.asString] = i }
        let ranked = r.regimes.generals.objectEntries.filter { generalRank($0.1.merit.optionalNumber ?? 0) != nil }
            .sorted { a, b in
                let ma = a.1.merit.optionalNumber ?? 0, mb = b.1.merit.optionalNumber ?? 0
                return ma != mb ? ma > mb : a.0 < b.0
            }
        return .array(ranked.prefix(30).map { _, e in
            let o = JS.object()
            o.id = e.id.clone(); o.name = e.name.clone(); o.nation = JS(index[e.nation.optionalString ?? ""] ?? -1)
            o.merit = JS((e.merit.optionalNumber ?? 0).rounded()); o.months = e.months.clone(); o.gained = e.gained.clone()
            o.rank = JS(generalRank(e.merit.optionalNumber ?? 0) ?? ""); o.fallen = JS(e.fallen.isTruthy)
            return o
        })
    }

    // MARK: 合纵连横

    /// 合纵: when one state holds three tenths of the world, the two strongest of its neighbours that are
    /// neither its vassals nor at war with each other league against it (at most once in two years for a
    /// given hegemon). They form an alliance, or the one without joins the other's.
    static func leagueMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let provinces = r.world.provinces.asArray
        var held = [String: Int](), total = 0
        for p in provinces { if let c = p.controller.optionalString { held[c, default: 0] += 1; total += 1 } }
        guard total > 0, held.count >= 5, Double(held[id] ?? 0) / Double(total) >= 0.3 else { return }
        let b = book(r, id)
        if let last = b.leagueKey.optionalNumber, key - Int(last) < 24 { return }
        guard chance("\(id)|\(key)|league") < 0.12 else { return }
        // The hegemon's neighbours.
        var owner = [String: String]()
        for p in provinces { owner[p.id.asString] = p.controller.optionalString ?? "" }
        var around = Set<String>()
        for p in provinces where p.controller.optionalString == id {
            for q in p.neighbors.asArray { if let o = owner[q.asString], !o.isEmpty, o != id { around.insert(o) } }
        }
        let free = around.filter { Vassals.overlord(r, $0) != id && Vassals.alive(r, $0) }
            .sorted { (held[$0] ?? 0) != (held[$1] ?? 0) ? (held[$0] ?? 0) > (held[$1] ?? 0) : $0 < $1 }
        guard free.count >= 2 else { return }
        var pair: (String, String)?
        search: for i in 0..<min(4, free.count) {
            for j in (i + 1)..<min(5, free.count) {
                let a = free[i], c = free[j]
                if atWar(r, a, c) { continue }
                let va = Vassals.allianceOf(r, a), vc = Vassals.allianceOf(r, c)
                if va != nil && vc != nil { continue }      // both already bound: no merger here
                pair = (a, c); break search
            }
        }
        guard let (a, c) = pair else { return }
        b.leagueKey = JS(key)
        let now = JS(Native.fr(r.life.gameTime.asNumber))
        if let v = Vassals.allianceOf(r, a) ?? Vassals.allianceOf(r, c) {
            let joiner = Vassals.allianceOf(r, a) == nil ? a : c
            v.members.push(JS(joiner)); v.joinedTime = now.clone()
        } else {
            let next = r.alliances.nextId.asNumber; r.alliances.nextId = JS(next + 1)
            let v = JS.object()
            v.id = JS(next); v.name = JS("\(Vassals.name(r, a))-\(Vassals.name(r, c))合纵"); v.founders = .array([JS(a), JS(c)]); v.members = .array([JS(a), JS(c)])
            v.startedTime = now.clone(); v.joinedTime = JS(-100); v.startedTick = r.clock.tick.clone(); v.endedTick = .null; v.unbreakable = JS(false)
            r.alliances.records.push(v)
        }
        Vassals.bump(r.alliances)
        Vassals.reconcileAlliances(r); DiplomacyBridge.reconcile(r)
        let share = Int((Double(held[id] ?? 0) / Double(total) * 100).rounded())
        _ = People.announce(r, kind: "diplomacy", text: "\(Vassals.name(r, a))与\(Vassals.name(r, c))合纵，共抗\(n.name.asString)",
                            reason: "\(n.name.asString)已据天下 \(share)%，邻国惧其并吞，约为盟好：今后的外部战争按盟约共同参战。", nations: [a, c, id], province: nil)
    }

    // MARK: 天灾随气候


    /// The share of a province's land that is desert (hot or cold) and that is frozen (tundra, ice).
    static func climate(_ r: JS, _ province: String) -> (arid: Double, frozen: Double) {
        let biomes = r.finance.provinces[province].cellBiomes
        guard !biomes.isNull else { return (0, 0) }
        let list = biomes.asArray
        guard !list.isEmpty else { return (0, 0) }
        var arid = 0, frozen = 0
        for b in list { let i = b.asInt; if i == 1 || i == 2 { arid += 1 } else if i == 10 || i == 11 { frozen += 1 } }
        return (Double(arid) / Double(list.count), Double(frozen) / Double(list.count))
    }
}
