import Foundation

/// 区域 (the original's districts): neighbouring provinces grouped into regions of four to six, each
/// named after its centre city. Built once per world from the land's adjacency (not from who holds
/// it), kept in the run so names and centres can be edited.
public enum Districts {
    static func ensure(_ r: JS) {
        if !r.regimes.isNull, !r.regimes.regions.isNull { return }
        Regimes.enable(r)
        let provinces = r.world.provinces.asArray
        var index = [String: Int](); for (i, p) in provinces.enumerated() { index[p.id.asString] = i }
        var cityName = [String: String](); for c in r.world.cities.asArray { cityName[c.provinceId.asString] = c.name.asString }
        var regionOf = [Int](repeating: -1, count: provinces.count)
        let book = JS.object(), of = JS.object()
        var rows = [JS]()
        for start in provinces.indices where regionOf[start] < 0 {
            let next = rows.count
            var h: UInt32 = 0x811c9dc5
            for u in provinces[start].id.asString.utf8 { h = (h ^ UInt32(u)) &* 0x1000193 }
            let target = 4 + Int(h % 3)
            var members = [start], queue = [start], cursor = 0
            regionOf[start] = next
            while cursor < queue.count && members.count < target {
                let p = queue[cursor]; cursor += 1
                for q in provinces[p].neighbors.asArray {
                    guard let qi = index[q.asString], regionOf[qi] < 0, members.count < target else { continue }
                    regionOf[qi] = next; members.append(qi); queue.append(qi)
                }
            }
            let center = provinces[start].id.asString
            let row = JS.object()
            row.id = JS(next); row.center = JS(center)
            row.name = JS((cityName[center] ?? provinces[start].name.asString) + "道")
            rows.append(row)
            for m in members { of[provinces[m].id.asString] = JS(next) }
        }
        book.of = of; book.list = .array(rows)
        r.regimes.regions = book
    }
    static func region(_ r: JS, _ provinceId: String) -> JS? {
        ensure(r)
        guard let id = r.regimes.regions.of[provinceId].optionalNumber else { return nil }
        let list = r.regimes.regions.list
        return Int(id) < list.length ? list[Int(id)] : nil
    }
    /// The region index of every province (−1 when none), for the map view.
    static func indexes(_ r: JS) -> [Int] {
        ensure(r)
        return r.world.provinces.asArray.map { r.regimes.regions.of[$0.id.asString].optionalNumber.map { Int($0) } ?? -1 }
    }
}

extension NativeEngine {
    /// The region of a province: its name and centre, its provinces and people.
    public func regionInfo(_ province: Int) -> Data? {
        let r = run, provinces = r.world.provinces.asArray
        guard provinces.indices.contains(province), let g = Districts.region(r, provinces[province].id.asString) else { return nil }
        let rid = g.id.asInt
        let members = provinces.indices.filter { r.regimes.regions.of[provinces[$0].id.asString].optionalNumber.map { Int($0) } == rid }
        var stock = [String: Double](); for s in r.world.statecraft.provinces.asArray { stock[s.provinceId.asString] = s.population.optionalNumber ?? 0 }
        let population = members.reduce(0.0) { $0 + (stock[provinces[$1].id.asString] ?? 0) }
        let o = JS.object()
        o.id = JS(rid); o.name = g.name
        o.center = JS(provinces.firstIndex { $0.id.asString == g.center.asString } ?? -1)
        o.provinces = .array(members.map { JS($0) })
        o.population = JS(population.rounded())
        return Data(o.json.utf8)
    }
    /// 区域更名.
    public func renameRegion(_ province: Int, _ name: String) -> (ok: Bool, reason: String) {
        let r = run, provinces = r.world.provinces.asArray
        let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard provinces.indices.contains(province), (1...10).contains(t.count), let g = Districts.region(r, provinces[province].id.asString) else { return (false, "区域名须为 1 到 10 个字。") }
        g.name = JS(t)
        return (true, "区域已更名为\(t)。")
    }
    /// 设为区域中心: this province becomes its region's centre (the region takes its city's name).
    public func setRegionCenter(_ province: Int) -> (ok: Bool, reason: String) {
        let r = run, provinces = r.world.provinces.asArray
        guard provinces.indices.contains(province), let g = Districts.region(r, provinces[province].id.asString) else { return (false, "州郡不存在。") }
        let pid = provinces[province].id.asString
        g.center = JS(pid)
        let city = r.world.cities.asArray.first { $0.provinceId.asString == pid }?.name.asString ?? provinces[province].name.asString
        g.name = JS(city + "道")
        return (true, "\(city)已设为区域中心。")
    }

    /// 大事记: the chronicle, newest first, by category (all, war, politics, family, diplomacy, events),
    /// with each entry's reason and the states it names.
    public func chronicle(_ category: String, limit: Int = 400) -> Data {
        let r = run
        var at = [String: Int](); for (i, n) in r.world.nations.asArray.enumerated() where at[n.id.asString] == nil { at[n.id.asString] = i }
        let kinds: [String: Set<String>] = [
            "war": ["war", "battle", "occupation", "uprising", "emergency", "regular", "civilWar", "rebellion", "siege"],
            "politics": ["politics", "accession", "extinction", "restoration", "capital", "founding"],
            "family": ["family", "marriage", "birth", "death"],
            "diplomacy": ["diplomacy", "peace", "alliance", "vassal"],
            "events": ["event"],
        ]
        let allow = kinds[category]
        let rows = Array(r.chronicle.entries.asArray.reversed().lazy.filter { e in allow.map { $0.contains(e.kind.asString) } ?? true }.prefix(limit))
        return Data(JS.array(rows.map { e in
            let o = JS.object(); o.day = e.day; o.text = e.text; o.kind = e.kind
            o.reason = e.reason.isNull ? JS("") : e.reason
            o.nations = .array((e.nationIds.isNull ? [] : e.nationIds.asArray).compactMap { at[$0.asString].map { JS($0) } })
            return o
        }).json.utf8)
    }
}
