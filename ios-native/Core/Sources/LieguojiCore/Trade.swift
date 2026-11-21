import Foundation

/// 特产与贸易（深化版）：24 种历史特产按地理与气候自然分布，分「民生 / 战略 / 珍品」三档；
/// 持有或经和平通商购入特产不仅显著提升月度商贸岁入（珍品价值翻倍、独占全球 40%+ 产量触发垄断红利），
/// 战略特产（良马、铁矿、精钢、良木、药材、盐铁、石料、纸墨等）更直接转化为全军攻防、人口增长与安定度加成！
public enum Trade {
    public struct GoodProfile: Sendable {
        public let name: String
        public let tier: String       // "民生" / "战略" / "珍品"
        public let weight: Double     // 贸易价值权重（1.0 / 1.5 / 2.4）
        public let effectText: String // 直观展示给玩家的真实加成说明
        public let attack: Double
        public let defense: Double
        public let income: Double
        public let growth: Double
        public let stability: Double
    }

    public static let profiles: [GoodProfile] = [
        GoodProfile(name: "粮食", tier: "民生", weight: 1.0, effectText: "人口年增 +0.8% · 民心安定 +2", attack: 0, defense: 0, income: 0.5, growth: 0.8, stability: 2),
        GoodProfile(name: "良木", tier: "战略", weight: 1.3, effectText: "全军防御 +2% · 造船筑城", attack: 0, defense: 2, income: 1.0, growth: 0, stability: 0),
        GoodProfile(name: "毛皮", tier: "珍品", weight: 1.8, effectText: "商贸岁入 +2.5% · 寒地耐战", attack: 0, defense: 1, income: 2.5, growth: 0, stability: 0),
        GoodProfile(name: "良马", tier: "战略", weight: 1.6, effectText: "全军进攻 +3.5% · 骑兵驰骋", attack: 3.5, defense: 0, income: 0.5, growth: 0, stability: 0),
        GoodProfile(name: "铁矿", tier: "战略", weight: 1.7, effectText: "全军进攻 +3% · 防御 +2%", attack: 3.0, defense: 2.0, income: 1.0, growth: 0, stability: 0),
        GoodProfile(name: "海盐", tier: "民生", weight: 1.5, effectText: "盐税丰厚 · 岁入 +3% · 安定 +1", attack: 0, defense: 0, income: 3.0, growth: 0.3, stability: 1),
        GoodProfile(name: "丝绸", tier: "珍品", weight: 2.4, effectText: "宫廷奢品 · 岁入 +4.5%", attack: 0, defense: 0, income: 4.5, growth: 0, stability: 1),
        GoodProfile(name: "茶叶", tier: "珍品", weight: 2.0, effectText: "茶马互市 · 岁入 +3.5% · 安定 +1", attack: 0, defense: 0, income: 3.5, growth: 0.2, stability: 1),
        GoodProfile(name: "香料", tier: "珍品", weight: 2.5, effectText: "远洋暴利 · 岁入 +5%", attack: 0, defense: 0, income: 5.0, growth: 0, stability: 0),
        GoodProfile(name: "瓷器", tier: "珍品", weight: 2.3, effectText: "名窑远销 · 岁入 +4%", attack: 0, defense: 0, income: 4.0, growth: 0, stability: 1),
        GoodProfile(name: "美酒", tier: "民生", weight: 1.4, effectText: "岁入 +2% · 士气与安定 +2", attack: 1.0, defense: 0, income: 2.0, growth: 0, stability: 2),
        GoodProfile(name: "鱼获", tier: "民生", weight: 1.0, effectText: "沿海富庶 · 人口年增 +0.7%", attack: 0, defense: 0, income: 0.8, growth: 0.7, stability: 1),
        GoodProfile(name: "宝石", tier: "珍品", weight: 2.6, effectText: "传世奇珍 · 岁入 +5%", attack: 0, defense: 0, income: 5.0, growth: 0, stability: 0),
        GoodProfile(name: "棉布", tier: "民生", weight: 1.4, effectText: "衣被天下 · 岁入 +2% · 人口 +0.4%", attack: 0, defense: 0, income: 2.0, growth: 0.4, stability: 1),
        GoodProfile(name: "铜矿", tier: "战略", weight: 1.6, effectText: "铸钱铸器 · 岁入 +2.5% · 进攻 +1.5%", attack: 1.5, defense: 0, income: 2.5, growth: 0, stability: 0),
        GoodProfile(name: "金银", tier: "珍品", weight: 2.8, effectText: "国库充盈 · 岁入 +6%", attack: 0, defense: 0, income: 6.0, growth: 0, stability: 0),
        GoodProfile(name: "药材", tier: "战略", weight: 1.7, effectText: "济世抗疫 · 人口年增 +1.0% · 安定 +2", attack: 0, defense: 1.0, income: 1.5, growth: 1.0, stability: 2),
        GoodProfile(name: "石料", tier: "战略", weight: 1.3, effectText: "营建要塞 · 全军防御 +3%", attack: 0, defense: 3.0, income: 0.8, growth: 0, stability: 1),
        GoodProfile(name: "硝石", tier: "战略", weight: 1.9, effectText: "火器攻城 · 全军进攻 +4%", attack: 4.0, defense: 0, income: 0.5, growth: 0, stability: 0),
        GoodProfile(name: "纸墨", tier: "战略", weight: 1.6, effectText: "文教兴盛 · 安定 +3 · 岁入 +1.5%", attack: 0, defense: 0, income: 1.5, growth: 0.2, stability: 3),
        GoodProfile(name: "象牙", tier: "珍品", weight: 2.2, effectText: "贡品奇货 · 岁入 +4%", attack: 0, defense: 0, income: 4.0, growth: 0, stability: 0),
        GoodProfile(name: "琥珀", tier: "珍品", weight: 2.1, effectText: "北海珍宝 · 岁入 +3.5% · 安定 +1", attack: 0, defense: 0, income: 3.5, growth: 0, stability: 1),
        GoodProfile(name: "羊毛", tier: "民生", weight: 1.3, effectText: "纺织兴旺 · 岁入 +2% · 防御 +1%", attack: 0, defense: 1.0, income: 2.0, growth: 0.2, stability: 0),
        GoodProfile(name: "蔗糖", tier: "珍品", weight: 1.9, effectText: "热带种植 · 岁入 +3.5% · 人口 +0.4%", attack: 0, defense: 0, income: 3.5, growth: 0.4, stability: 1),
    ]

    public static let goods: [String] = profiles.map(\.name)

    /// 按主生物群落（0 海 … 12 湿地）分配地理特产，山地单独分配矿藏与药材。
    static let byBiome: [[Int]] = [
        [11, 5, 21],             // 0 海滨/浅海
        [5, 12, 8, 15, 18],      // 1 热漠
        [4, 14, 3, 18, 22],      // 2 冷漠/荒原
        [3, 13, 8, 20, 23],      // 3 稀树草原
        [0, 3, 10, 22, 13],      // 4 温带草原
        [8, 7, 13, 23, 20],      // 5 热带季雨林
        [1, 10, 6, 19, 16],      // 6 温带落叶林
        [8, 12, 1, 20, 23, 16],  // 7 热带雨林
        [1, 7, 9, 6, 19],        // 8 亚热带/温带常绿林
        [2, 1, 4, 21, 16],       // 9 针叶林
        [2, 11, 21, 17],         // 10 苔原
        [2, 12, 15],             // 11 冰原
        [0, 11, 6, 16, 19],      // 12 湿地/河网
    ]
    static let mountain = [4, 14, 12, 15, 17, 16, 18]

    /// The province's specialty (index into `goods`): a custom one, or one of its land's by a fixed hash.
    public static func of(_ r: JS, _ provinceId: String) -> Int {
        if !r.regimes.isNull, let set = r.regimes.specialty[provinceId].optionalNumber {
            return min(goods.count - 1, max(0, Int(set)))
        }
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
        for p in Regimes.monthLand(r, id) { out[of(r, p.id.asString), default: 0] += 1 }
        return out
    }

    /// 全球各特产总产区数（用于计算一国是否形成 ≥40% 垄断红利）。
    static func worldTotals(_ r: JS) -> [Int: Int] {
        var out = [Int: Int]()
        for p in r.world.provinces.asArray where !(p.controller.optionalString ?? "").isEmpty {
            out[of(r, p.id.asString), default: 0] += 1
        }
        return out
    }

    /// Trading partners: states at peace that border this one, its allies, and active trade-treaty partners.
    static func partners(_ r: JS, _ id: String) -> [String] {
        var out = Set<String>()
        if let idx = Regimes.currentMonthIndex, idx.world == ObjectIdentifier(r) {
            for p in idx.provincesByNation[id] ?? [] {
                for q in p.neighbors.asArray { if let o = idx.ownerByPid[q.asString], o != id, !o.isEmpty { out.insert(o) } }
            }
        } else {
            let provinces = r.world.provinces.asArray
            var owner = [String: String](); for p in provinces { owner[p.id.asString] = p.controller.asString }
            for p in provinces where p.controller.asString == id {
                for q in p.neighbors.asArray { if let o = owner[q.asString], o != id, !o.isEmpty { out.insert(o) } }
            }
        }
        if let a = Vassals.allianceOf(r, id) { for m in a.members.asArray where m.asString != id { out.insert(m.asString) } }
        if !r.regimes.isNull && !r.regimes.pacts.isNull {
            let now = r.regimes.month.asInt
            for p in r.regimes.pacts.asArray where p.kind.optionalString == "trade" && p.until.asInt > now {
                if p.a.asString == id { out.insert(p.b.asString) }
                else if p.b.asString == id { out.insert(p.a.asString) }
            }
        }
        return out.filter { Regimes.monthLandCount(r, $0) > 0 && Wars.relation(r, id, $0)?.status.asString != "war" }.sorted()
    }

    /// 汇总本国特产带来的真实可感知国家加成（接入 Regimes.leverage：攻防、岁入、人口与安定）。
    public static func nationalBonuses(_ r: JS, _ id: String) -> (attack: Double, defense: Double, income: Double, growth: Double, stability: Double, monopolies: [String]) {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy else { return (0, 0, 0, 0, 0, []) }
        let mine = holdings(r, id)
        guard !mine.isEmpty else { return (0, 0, 0, 0, 0, []) }
        var atk = 0.0, def = 0.0, inc = 0.0, gro = 0.0, sta = 0.0
        for (k, count) in mine where profiles.indices.contains(k) {
            let pr = profiles[k]
            // 多产区递减收益（1 州 100%，2 州 130%，4+ 州 160%），防止超大国属性爆炸
            let mult = min(1.6, 1.0 + Double(max(0, count - 1)) * 0.22)
            atk += pr.attack * mult
            def += pr.defense * mult
            inc += pr.income * mult * 0.55
            gro += pr.growth * mult
            sta += pr.stability * mult * 0.65
        }
        return (min(14, atk), min(12, def), min(18, inc), min(3.5, gro), min(10, sta), [])
    }

    /// The monthly share of a state's income its trade adds: weighted by good rarity + bought goods + trade treaties.
    public static func share(_ r: JS, _ id: String) -> (own: Int, bought: Int, rate: Double) {
        let mine = holdings(r, id)
        let mineKeys = Set(mine.keys)
        var bought = Set<Int>()
        for p in partners(r, id) { bought.formUnion(holdings(r, p).keys) }
        bought.subtract(mineKeys)
        let ownWeight = mineKeys.reduce(0.0) { $0 + (profiles.indices.contains($1) ? profiles[$1].weight : 1.0) }
        let boughtWeight = bought.reduce(0.0) { $0 + (profiles.indices.contains($1) ? profiles[$1].weight : 1.0) }
        let rate = min(0.16, 0.011 * ownWeight) + min(0.18, 0.006 * boughtWeight)
        return (mineKeys.count, bought.count, rate)
    }
}

extension NativeEngine {
    /// 特产与贸易 of one state: its goods (name, tier, effect, monopoly), its partners, bonuses and monthly income.
    public func tradeInfo(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        var at = [String: Int](); for (i, n) in nations.enumerated() where at[n.id.asString] == nil { at[n.id.asString] = i }
        let id = nations[index].id.asString, o = JS.object()
        let mine = Trade.holdings(r, id)
        let world = Trade.worldTotals(r)
        var monopolyNames = [String]()
        o.goods = .array(mine.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.map { k, v in
            let pr = Trade.profiles[min(Trade.profiles.count - 1, max(0, k))]
            let total = max(1, world[k] ?? v)
            let mono = v >= 2 && Double(v) / Double(total) >= 0.40
            if mono { monopolyNames.append(pr.name) }
            let x = JS.object()
            x.name = JS(pr.name); x.provinces = JS(v); x.tier = JS(pr.tier); x.effect = JS(pr.effectText); x.monopoly = JS(mono)
            return x
        })
        o.partners = .array(Trade.partners(r, id).compactMap { p -> JS? in
            guard let i = at[p] else { return nil }
            let lacks = Set(Trade.holdings(r, p).keys).subtracting(mine.keys).sorted()
            let hasPact = DiplomacyDeep.hasTreaty(r, id, p, kind: "trade")
            let x = JS.object(); x.nation = JS(i); x.goods = .array(lacks.map { JS(Trade.goods[$0]) }); x.treaty = JS(hasPact); return x
        })
        let s = Trade.share(r, id)
        let bonus = Trade.nationalBonuses(r, id)
        let monoRate = Double(min(3, monopolyNames.count)) * 0.03
        let finalRate = s.rate + monoRate
        o.rate = JS((finalRate * 1000).rounded() / 10)
        o.income = JS(((r.finance.nations[id].goldPerMonth.optionalNumber ?? 0) * finalRate).rounded())
        var parts = [String]()
        if bonus.attack > 0.4 { parts.append("进攻 +\(Int(bonus.attack.rounded()))%") }
        if bonus.defense > 0.4 { parts.append("防御 +\(Int(bonus.defense.rounded()))%") }
        if bonus.income > 0.4 { parts.append("产值 +\(Int(bonus.income.rounded()))%") }
        if bonus.growth > 0.2 { parts.append("人口 +\(String(format: "%.1f", bonus.growth))%") }
        if bonus.stability > 0.4 { parts.append("安定 +\(Int(bonus.stability.rounded()))") }
        o.bonusSummary = JS(parts.isEmpty ? "暂无战略特产加成" : parts.joined(separator: " · "))
        o.monopolies = .array(monopolyNames.map { JS($0) })
        return Data(o.json.utf8)
    }

    /// 族谱: one noble house's members — name, sex, age, alive, parents, spouse, children, the head,
    /// heir, estate metadata, and collateral branches.
    /// 只读、容错：任何字段缺失或类型不符都不会中止（旧存档、手改存档、半途中断的操作都可能留下这类记录），
    /// 成员 ID 去重、无对应人物者略去，数值一律为有限整数/小数。
    public func familyTree(_ familyId: String) -> Data? {
        let r = run, fam = r.kin.families[familyId]
        guard case .object = fam.storage else { return nil }
        let o = JS.object()
        let famSurname = NamingCatalog.cleanSurname(fam.surname.optionalString ?? "")
        o.surname = JS(famSurname)
        o.head = JS(Self.personId(fam.headId))
        o.heir = JS(Self.personId(fam.heirId))
        o.allowFemale = JS(fam.allowFemaleInheritance.optionalBool ?? false)
        o.culture = JS(fam.cultureName.optionalString ?? "")
        let nid = fam.nationId.optionalString ?? ""
        o.nationId = JS(nid)
        o.nationName = JS(r.world.nations.isNull ? "" : (r.world.nations.asArray.first(where: { $0.id.asString == nid })?.name.optionalString ?? ""))
        let noble = r.nobility.isNull ? JS.null : r.nobility.families[familyId]
        if case .object = noble.storage {
            let rulingById = !nid.isEmpty && String(People.rulingFamilyId(r, nid)) == familyId
            o.ruling = JS((noble.ruling.optionalBool ?? false) || rulingById)
            let inf = noble.influence.optionalNumber ?? 0
            let wlt = noble.wealth.optionalNumber ?? 0
            o.influence = JS(inf.isFinite ? inf.rounded() : 0)
            o.wealth = JS(wlt.isFinite ? wlt.rounded() : 0)
            var pNames = [String: String]()
            if !r.world.provinces.isNull {
                for p in r.world.provinces.asArray { pNames[p.id.asString] = p.name.optionalString ?? p.id.asString }
            }
            let held: [JS] = { if case .array(let a) = noble.controlledProvinces.storage { return a }; return [] }()
            o.provinces = .array(held.compactMap(\.optionalString).map { JS(pNames[$0] ?? $0) })
            let fiefAllowed = Regimes.allowsFiefs(r, nid)
            o.allowsFiefs = JS(fiefAllowed)
            if !r.regimes.isNull, !r.regimes.houseHistory.isNull, !r.regimes.houseHistory[familyId].isNull {
                o.influenceHistory = r.regimes.houseHistory[familyId]
            } else {
                o.influenceHistory = .array([JS(inf.isFinite ? inf.rounded() : 0)])
            }
            let cd = (!r.regimes.isNull && !r.regimes.fiefCooldown.isNull) ? (r.regimes.fiefCooldown[familyId].optionalNumber.map(Int.init) ?? 0) : 0
            o.fiefCooldown = JS(cd)
            let gov = Regimes.governor(r, nid)
            o.governing = JS(gov != nil && String(gov!.familyId.asInt) == familyId)
        } else {
            o.ruling = JS(false); o.influence = JS(0); o.wealth = JS(0); o.provinces = .array()
            o.allowsFiefs = JS(true); o.influenceHistory = .array(); o.fiefCooldown = JS(0); o.governing = JS(false)
        }
        o.relations = FamilyPolitics.relationsView(r, familyId: familyId)
        o.events = FamilyPolitics.recentEvents(r, familyId: familyId)
        func makeMember(_ m: JS, seen: inout Set<Int>, collateral: Bool) -> JS? {
            let id = Self.personId(m)
            guard id > 0, seen.insert(id).inserted, let p = People.person(r, id), case .object = p.storage else { return nil }
            let v = personView(p, role: "")
            let x = JS.object()
            x.id = JS(id); x.name = v.name; x.female = v.female; x.age = v.age
            x.alive = JS(p.isAlive.optionalBool ?? ((p.deathTime.optionalNumber ?? 0) <= 0))
            x.father = JS(Self.personId(p.fatherId)); x.mother = JS(Self.personId(p.motherId)); x.spouse = JS(Self.personId(p.spouseId))
            let roles: [JS] = { if case .array(let a) = p.roles.storage { return a }; return [] }()
            x.title = JS(roles.first?.title.optionalString ?? "")
            x.traits = v.traits; x.skills = v.skills
            let last = NamingCatalog.cleanSurname(p.lastName.optionalString ?? "")
            let natal = NamingCatalog.cleanSurname(p.natalSurname.optionalString ?? (last != famSurname ? last : ""))
            x.natalHouse = JS(natal != famSurname ? natal : "")
            x.collateral = JS(collateral)
            return x
        }
        var seen = Set<Int>()
        let ids: [JS] = { if case .array(let a) = fam.memberIds.storage { return a }; return [] }()
        o.members = .array(ids.compactMap { makeMember($0, seen: &seen, collateral: false) })
        let colIds: [JS] = { if case .array(let a) = fam.collateralMemberIds.storage { return a }; return [] }()
        o.collaterals = .array(colIds.compactMap { makeMember($0, seen: &seen, collateral: true) })
        return Data(o.json.utf8)
    }
    /// 人物 ID：有限的正整数，其余（缺失、非数、越界）记为 0。
    static func personId(_ v: JS) -> Int {
        guard let n = v.optionalNumber, n.isFinite, n >= 1, n < 1e15 else { return 0 }
        return Int(n)
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
