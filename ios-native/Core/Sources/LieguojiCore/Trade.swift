import Foundation

/// 特产与贸易 (app rules): every province yields one specialty of its land; a state earns more the
/// more kinds it holds, and trades at peace with its neighbours and allies for the kinds it lacks —
/// the original's specialties carried between states (its merchant ships), as monthly income.
public enum Trade {
    public static let goods = ["粮食", "木材", "毛皮", "马匹", "铁矿", "食盐", "丝绸", "茶叶", "香料", "瓷器", "美酒", "鱼获", "宝石", "棉布", "铜矿"]
    /// Candidate goods by main biome (0 sea … 12 wetland), mountains apart.
    static let byBiome: [[Int]] = [[11, 5], [5, 12, 8], [4, 14, 3], [3, 13, 8], [0, 3, 10], [8, 7, 13], [1, 10, 6],
                                   [8, 12, 1], [1, 7, 9], [2, 1, 4], [2, 11], [2, 12], [0, 11, 6]]
    static let mountain = [4, 14, 12]

    /// The province's specialty (index into `goods`): a custom one, or one of its land's by a fixed hash.
    public static func of(_ r: JS, _ provinceId: String) -> Int {
        if !r.regimes.isNull, let set = r.regimes.specialty[provinceId].optionalNumber { return Int(set) }
        let land = r.terrainContext.provinces[provinceId]
        let ratios = land.isNull || land.biomes.isNull ? [] : land.biomes.asArray.map(\.asNumber)
        let main = ratios.indices.max { ratios[$0] < ratios[$1] } ?? 4
        let list = land.mountain.isTruthy ? mountain : byBiome[min(12, max(0, main))]
        var h: UInt32 = 0x811c9dc5
        for u in provinceId.utf8 { h = (h ^ UInt32(u)) &* 0x1000193 }
        return list[Int(h % UInt32(list.count))]
    }

    /// The kinds a state holds, with how many provinces yield each.
    static func holdings(_ r: JS, _ id: String) -> [Int: Int] {
        var out = [Int: Int]()
        for p in r.world.provinces.asArray where p.controller.asString == id { out[of(r, p.id.asString), default: 0] += 1 }
        return out
    }
    /// Trading partners: states at peace that border this one, and its allies.
    static func partners(_ r: JS, _ id: String) -> [String] {
        let provinces = r.world.provinces.asArray
        var owner = [String: String](); for p in provinces { owner[p.id.asString] = p.controller.asString }
        var out = Set<String>()
        for p in provinces where p.controller.asString == id {
            for q in p.neighbors.asArray { if let o = owner[q.asString], o != id, !o.isEmpty { out.insert(o) } }
        }
        if let a = Vassals.allianceOf(r, id) { for m in a.members.asArray where m.asString != id { out.insert(m.asString) } }
        return out.filter { Vassals.alive(r, $0) && Wars.relation(r, id, $0)?.status.asString != "war" }.sorted()
    }
    /// The monthly share of a state's income its trade adds: 1% per kind held (up to 10) and 0.5% per
    /// kind bought from partners that it lacks (up to 15%).
    public static func share(_ r: JS, _ id: String) -> (own: Int, bought: Int, rate: Double) {
        let mine = Set(holdings(r, id).keys)
        var bought = Set<Int>()
        for p in partners(r, id) { bought.formUnion(holdings(r, p).keys) }
        bought.subtract(mine)
        let rate = min(0.10, 0.01 * Double(mine.count)) + min(0.15, 0.005 * Double(bought.count))
        return (mine.count, bought.count, rate)
    }
}

extension NativeEngine {
    /// 特产与贸易 of one state: its goods (name and provinces), its partners with what each sells it,
    /// and the share of income its trade adds each month.
    public func tradeInfo(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        var at = [String: Int](); for (i, n) in nations.enumerated() where at[n.id.asString] == nil { at[n.id.asString] = i }
        let id = nations[index].id.asString, o = JS.object()
        let mine = Trade.holdings(r, id)
        o.goods = .array(mine.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.map { k, v in let x = JS.object(); x.name = JS(Trade.goods[k]); x.provinces = JS(v); return x })
        o.partners = .array(Trade.partners(r, id).compactMap { p -> JS? in
            guard let i = at[p] else { return nil }
            let lacks = Set(Trade.holdings(r, p).keys).subtracting(mine.keys).sorted()
            let x = JS.object(); x.nation = JS(i); x.goods = .array(lacks.map { JS(Trade.goods[$0]) }); return x
        })
        let s = Trade.share(r, id)
        o.rate = JS((s.rate * 1000).rounded() / 10)
        o.income = JS(((r.finance.nations[id].goldPerMonth.optionalNumber ?? 0) * s.rate).rounded())
        return Data(o.json.utf8)
    }

    /// 族谱: one noble house's members — name, sex, age, alive, parents, spouse, children, the head.
    public func familyTree(_ familyId: String) -> Data? {
        let r = run, fam = r.kin.families[familyId]
        guard !fam.isNull else { return nil }
        let o = JS.object()
        o.surname = fam.surname.isNull ? JS("") : fam.surname
        o.head = fam.headId.isNull ? JS(0) : fam.headId
        o.members = .array((fam.memberIds.isNull ? [] : fam.memberIds.asArray).compactMap { m -> JS? in
            guard let p = People.person(r, m.asInt) else { return nil }
            let v = personView(p, role: "")
            let x = JS.object()
            x.id = p.id; x.name = v.name; x.female = v.female; x.age = v.age; x.alive = JS(p.isAlive.asBool)
            x.father = JS(p.fatherId.optionalNumber ?? 0); x.mother = JS(p.motherId.optionalNumber ?? 0); x.spouse = JS(p.spouseId.optionalNumber ?? 0)
            x.title = JS((p.roles.isNull ? [] : p.roles.asArray).first?.title.optionalString ?? "")
            return x
        })
        return Data(o.json.utf8)
    }

    /// 生计 (民族特性): Agriculture, Nomadic, Maritime, FishAndHunting, Commercial or Other; it sets the
    /// state's income and growth factors (Monthly) and Maritime its sea battles.
    public func setLivelihood(_ index: Int, _ value: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), ["Agriculture", "Nomadic", "Maritime", "FishAndHunting", "Commercial", "Other"].contains(value) else { return (false, "无此生计。") }
        let e = r.economy.nations[nations[index].id.asString]
        guard !e.isNull else { return (false, "此国没有经济记录。") }
        e.ethnic = JS(value)
        return (true, "生计已更改。")
    }

    /// 改特产: a province's specialty (nil restores its land's own).
    public func setSpecialty(_ province: Int, _ good: Int?) -> (ok: Bool, reason: String) {
        let r = run, provinces = r.world.provinces.asArray
        guard provinces.indices.contains(province) else { return (false, "州郡不存在。") }
        Regimes.enable(r)
        if r.regimes.specialty.isNull { r.regimes.specialty = JS.object() }
        let id = provinces[province].id.asString
        if let good, Trade.goods.indices.contains(good) { r.regimes.specialty[id] = JS(good) } else { r.regimes.specialty.delete(id) }
        return (true, "特产已更改。")
    }
}
