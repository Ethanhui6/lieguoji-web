import Foundation

/// 名将谱（战神谱实时加持）、多兵种军团分部与集团军协同编组、合纵连横、天灾随气候 (本作规则).
extension Regimes {
    // MARK: 战神谱（名将谱与实战加持）

    /// 战神谱阶位与真实战场光环（在阵活将实时为所属国主力军团提供攻防、围城与行军加成）。
    public struct WarGodTier: Sendable {
        public let merit: Double
        public let title: String
        public let attackPct: Double
        public let defensePct: Double
        public let siegePct: Double
        public let speedPct: Double
        public var buffText: String {
            var parts = [String]()
            if attackPct > 0 && attackPct == defensePct { parts.append("攻防+\(Int(attackPct))%") }
            else {
                if attackPct > 0 { parts.append("进攻+\(Int(attackPct))%") }
                if defensePct > 0 { parts.append("防御+\(Int(defensePct))%") }
            }
            if siegePct > 0 { parts.append("围城+\(Int(siegePct))%") }
            if speedPct > 0 { parts.append("行军+\(Int(speedPct))%") }
            return parts.joined(separator: " · ")
        }
    }

    public static let warGodTiers: [WarGodTier] = [
        WarGodTier(merit: 350, title: "军神", attackPct: 18, defensePct: 18, siegePct: 28, speedPct: 10),
        WarGodTier(merit: 200, title: "上将军", attackPct: 12, defensePct: 12, siegePct: 18, speedPct: 6),
        WarGodTier(merit: 100, title: "名将", attackPct: 8, defensePct: 8, siegePct: 12, speedPct: 0),
        WarGodTier(merit: 40, title: "骁将", attackPct: 5, defensePct: 0, siegePct: 6, speedPct: 0),
    ]

    static let generalRanks: [(merit: Double, title: String)] = warGodTiers.map { ($0.merit, $0.title) }
    static func generalTier(_ merit: Double) -> WarGodTier? { warGodTiers.first { merit >= $0.merit } }
    static func generalRank(_ merit: Double) -> String? { generalTier(merit)?.title }

    /// 依据功勋与战绩授予战神谱专属称号。
    static func generalEpithet(merit: Double, gained: Int, months: Int) -> String {
        if merit >= 350 && gained >= 14 { return "无双战神" }
        if merit >= 350 { return "常胜军神" }
        if gained >= 10 { return "破城名将" }
        if months >= 36 { return "百战宿将" }
        if merit >= 200 { return "冠军大将" }
        if gained >= 5 { return "开疆悍将" }
        if merit >= 100 { return "威震边陲" }
        return "百战骁将"
    }

    /// 战神专属兵法特技：依真实战绩与将领特质觉醒，为全军叠加特色实战加成。
    public struct WarGodSkill: Sendable {
        public let name: String
        public let note: String
        public let attackPct: Double
        public let defensePct: Double
        public let siegePct: Double
        public let speedPct: Double
    }

    static func warGodSkill(merit: Double, gained: Int, months: Int, traits: Set<String>) -> WarGodSkill {
        if traits.contains("Conqueror") || traits.contains("Unifier") || gained >= 10 {
            return WarGodSkill(name: "神机破城", note: "围城破防额外 +18%", attackPct: 0, defensePct: 0, siegePct: 18, speedPct: 0)
        }
        if traits.contains("Tactician") || traits.contains("Genius") || merit >= 350 {
            return WarGodSkill(name: "兵仙奇谋", note: "全军攻防 +6% · 围城 +10%", attackPct: 6, defensePct: 6, siegePct: 10, speedPct: 0)
        }
        if traits.contains("Brave") || traits.contains("Hawkish") || gained >= 5 {
            return WarGodSkill(name: "破阵无双", note: "野战进攻额外 +8%", attackPct: 8, defensePct: 0, siegePct: 0, speedPct: 0)
        }
        if traits.contains("IronFist") || traits.contains("Stoic") || months >= 24 {
            return WarGodSkill(name: "铁壁金汤", note: "全军防线额外 +12%", attackPct: 0, defensePct: 12, siegePct: 0, speedPct: 0)
        }
        return WarGodSkill(name: "千里奔袭", note: "全军行军额外 +8% · 攻 +4%", attackPct: 4, defensePct: 0, siegePct: 0, speedPct: 8)
    }

    private static func combinedBuffText(tier: WarGodTier, skill: WarGodSkill) -> String {
        let atk = Int(tier.attackPct + skill.attackPct)
        let def = Int(tier.defensePct + skill.defensePct)
        let sge = Int(tier.siegePct + skill.siegePct)
        let spd = Int(tier.speedPct + skill.speedPct)
        var parts = [String]()
        if atk > 0 && atk == def { parts.append("攻防+\(atk)%") }
        else {
            if atk > 0 { parts.append("攻+\(atk)%") }
            if def > 0 { parts.append("防+\(def)%") }
        }
        if sge > 0 { parts.append("围城+\(sge)%") }
        if spd > 0 { parts.append("行军+\(spd)%") }
        return parts.joined(separator: " · ")
    }

    private static var warGodCacheTick: Int = -1
    private static var warGodCacheWorld: ObjectIdentifier?
    private static var warGodCacheMap: [String: (name: String, rank: String, epithet: String, tier: WarGodTier, skill: WarGodSkill, buffSummary: String)] = [:]

    /// 读取某国当前在任战神谱主将提供的真实战场加持（含阶位光环 + 专属兵法特技；每 Tick 缓存一次，O(1) 查询）。
    public static func warGodAura(_ r: JS, nationId: String) -> (name: String, rank: String, epithet: String, tier: WarGodTier, skill: WarGodSkill, buffSummary: String)? {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy, !r.regimes.generals.isNull else { return nil }
        let tick = r.clock.tick.asInt
        let wid = ObjectIdentifier(r)
        if warGodCacheTick != tick || warGodCacheWorld != wid {
            warGodCacheTick = tick
            warGodCacheWorld = wid
            warGodCacheMap.removeAll(keepingCapacity: true)
            let roll = r.regimes.generals
            for n in r.world.nations.asArray {
                let nid = n.id.asString
                var activeIds = Set<Int>()
                for p in commanders(r, nid) where p.isAlive.asBool { activeIds.insert(p.id.asInt) }
                if let m = Offices.holder(r, nid, "Marshal", Offices.stateId(r, nid)), m.isAlive.asBool { activeIds.insert(m.id.asInt) }
                var best: (pid: Int, name: String, merit: Double, gained: Int, months: Int, tier: WarGodTier)?
                for pid in activeIds {
                    let e = roll[String(pid)]
                    guard !e.isNull, !e.fallen.isTruthy else { continue }
                    let merit = e.merit.optionalNumber ?? 0
                    guard let tier = generalTier(merit) else { continue }
                    if best == nil || merit > best!.merit {
                        best = (pid, e.name.optionalString ?? "名将", merit, e.gained.asInt, e.months.asInt, tier)
                    }
                }
                if let b = best {
                    let person = People.person(r, b.pid)
                    let traits = Set(person?.traits.isArray == true ? person!.traits.asArray.compactMap(\.optionalString) : [])
                    let skill = warGodSkill(merit: b.merit, gained: b.gained, months: b.months, traits: traits)
                    let summary = combinedBuffText(tier: b.tier, skill: skill)
                    warGodCacheMap[nid] = (b.name, b.tier.title, generalEpithet(merit: b.merit, gained: b.gained, months: b.months), b.tier, skill, summary)
                }
            }
        }
        return warGodCacheMap[nationId]
    }

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
            let e = roll[k], before = e.merit.optionalNumber ?? 0, after = before + 5 + Double(gained) * 14
            e.merit = JS(after); e.months = JS(e.months.asInt + 1); e.gained = JS(e.gained.asInt + gained); e.nation = JS(id); e.name = JS(personName(p))
            let was = generalRank(before), nowTier = generalTier(after), now = nowTier?.title
            if let now, let tier = nowTier, now != was, now == "名将" || now == "上将军" || now == "军神" {
                _ = People.announce(r, kind: "event", text: "\(n.name.asString)\(personName(p))晋封\(now)（登战神谱）", reason: "统兵 \(e.months.asInt) 月，为国拓地 \(e.gained.asInt) 州，战功积至 \(Int(after))；全军实时加持：\(tier.buffText)。", nations: [id], province: nil)
            }
        }
        // 将星陨落: one of the roll who served this state has died.
        for (k, e) in roll.objectEntries where e.nation.optionalString == id && !e.fallen.isTruthy && generalRank(e.merit.optionalNumber ?? 0) != nil {
            guard let p = People.person(r, Int(k) ?? -1), !p.isAlive.asBool else { continue }
            e.fallen = JS(true); e.fallenDay = r.world.day.clone()
            _ = People.announce(r, kind: "event", text: "\(n.name.asString)\(generalRank(e.merit.optionalNumber ?? 0) ?? "")\(e.name.asString)卒", reason: "一代将星陨落：生前统兵 \(e.months.asInt) 月，拓地 \(e.gained.asInt) 州。", nations: [id], province: nil)
        }
    }

    /// 战神谱 for the page: everyone who has reached a rank, the most merit first (with epithet, live aura buff & active status).
    static func generalsRoll(_ r: JS) -> JS {
        guard !r.regimes.isNull, !r.regimes.generals.isNull else { return .array() }
        var index = [String: Int]()
        for (i, n) in r.world.nations.asArray.enumerated() where index[n.id.asString] == nil { index[n.id.asString] = i }
        var activeCommanders = Set<Int>()
        for n in r.world.nations.asArray {
            let nid = n.id.asString
            for p in commanders(r, nid) where p.isAlive.asBool { activeCommanders.insert(p.id.asInt) }
            if let m = Offices.holder(r, nid, "Marshal", Offices.stateId(r, nid)), m.isAlive.asBool { activeCommanders.insert(m.id.asInt) }
        }
        let ranked = r.regimes.generals.objectEntries.filter { generalTier($0.1.merit.optionalNumber ?? 0) != nil }
            .sorted { a, b in
                let ma = a.1.merit.optionalNumber ?? 0, mb = b.1.merit.optionalNumber ?? 0
                return ma != mb ? ma > mb : a.0 < b.0
            }
        return .array(ranked.prefix(30).map { key, e in
            let merit = e.merit.optionalNumber ?? 0
            let tier = generalTier(merit)!
            let fallen = e.fallen.isTruthy
            let pid = Int(key) ?? e.id.asInt
            let person = People.person(r, pid)
            let traits = Set(person?.traits.isArray == true ? person!.traits.asArray.compactMap(\.optionalString) : [])
            let skill = warGodSkill(merit: merit, gained: e.gained.asInt, months: e.months.asInt, traits: traits)
            let o = JS.object()
            o.id = e.id.clone(); o.name = e.name.clone(); o.nation = JS(index[e.nation.optionalString ?? ""] ?? -1)
            o.merit = JS(merit.rounded()); o.months = e.months.clone(); o.gained = e.gained.clone()
            o.rank = JS(tier.title); o.fallen = JS(fallen)
            o.epithet = JS(generalEpithet(merit: merit, gained: e.gained.asInt, months: e.months.asInt))
            o.buff = JS(combinedBuffText(tier: tier, skill: skill))
            o.skill = JS(skill.name)
            o.skillNote = JS(skill.note)
            o.active = JS(!fallen && activeCommanders.contains(pid))
            return o
        })
    }

    // MARK: 多兵种军团职能分部与集团军协同编组

    /// 国家军队五大职能分部：各自承担真实战略职责并在战斗/围城/行军中发挥对应特性。
    public enum ArmyBranch: String, CaseIterable, Sendable {
        case guardCorps = "guard"
        case field = "field"
        case garrison = "garrison"
        case vanguard = "vanguard"
        case siege = "siege"

        public var label: String {
            switch self {
            case .guardCorps: return "御林禁军"
            case .field: return "野战主力"
            case .garrison: return "边防镇戍"
            case .vanguard: return "轻骑前锋"
            case .siege: return "攻城炮旅"
            }
        }
        public var shortTag: String {
            switch self {
            case .guardCorps: return "禁军"
            case .field: return "主力"
            case .garrison: return "边防"
            case .vanguard: return "前锋"
            case .siege: return "炮旅"
            }
        }
        public var roleNote: String {
            switch self {
            case .guardCorps: return "拱卫京畿与御驾决战 · 攻+10% 防+15% · 被动「护驾死战」近畿防御再+12%"
            case .field: return "正面会战主力中坚 · 攻+12% · 被动「中坚会战」集团军协同再+4%"
            case .garrison: return "扼守关隘险要与本土守备 · 守+18% · 被动「深沟高垒」本土守御再+10%"
            case .vanguard: return "穿插奔袭与截断粮道 · 行军+15% 攻+8% · 被动「疾袭冲阵」主动进攻再+6%"
            case .siege: return "攻坚破城与重炮火力支援 · 围城+28% · 被动「重炮破城」打要塞再+15%"
            }
        }
        public var attackFactor: Double {
            switch self {
            case .guardCorps: return 1.10
            case .field: return 1.12
            case .garrison: return 1.00
            case .vanguard: return 1.08
            case .siege: return 1.05
            }
        }
        public var defenseFactor: Double {
            switch self {
            case .guardCorps: return 1.15
            case .field: return 1.00
            case .garrison: return 1.18
            case .vanguard: return 0.96
            case .siege: return 0.98
            }
        }
        public var siegeFactor: Double { self == .siege ? 1.28 : (self == .guardCorps ? 1.08 : 1.0) }
        public var speedFactor: Double { self == .vanguard ? 1.15 : (self == .siege ? 0.94 : 1.0) }
    }

    /// 依据国家文化、驻地角色、兵种与已有部队配比，为新军分配真实职能分部与地道军号。
    public static func assignArmyBranchAndName(_ r: JS, nation: String, armyId: String, home: String, unitKey: String, unitName: String, kind: String) -> (branch: ArmyBranch, name: String) {
        let culture = r.civilization.isNull ? "" : (r.civilization.nations[nation].cultureId.optionalString ?? "")
        let isCapital = (Rebellion.capitalProvince(r, nation) == home)
        let existing = r.world.armies.asArray.filter { $0.nationId.asString == nation && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
        var counts = [ArmyBranch: Int]()
        for a in existing { counts[armyBranch(r, armyId: a.id.asString, unitKey: r.units[a.id.asString].optionalString ?? "Infantry"), default: 0] += 1 }
        let total = max(1, existing.count)

        let branch: ArmyBranch = {
            if kind == "emergency" { return .garrison }
            let role = UnitKinds.byKey[unitKey]?.role
            if (isCapital || counts[.guardCorps, default: 0] == 0) && (role == .elite || role == .heavy || counts[.guardCorps, default: 0] < max(1, total / 6)) {
                return .guardCorps
            }
            if role == .cavalry || role == .horseArcher { return .vanguard }
            if (role == .archer || role == .crossbow || role == .elephant) && counts[.siege, default: 0] <= max(1, total / 4) {
                return .siege
            }
            if role == .shield || role == .spear {
                return counts[.garrison, default: 0] <= counts[.field, default: 0] ? .garrison : .field
            }
            return counts[.field, default: 0] <= counts[.garrison, default: 0] + 1 ? .field : .garrison
        }()

        if !r.regimes.isNull {
            if r.regimes.armyBranches.isNull { r.regimes.armyBranches = .object() }
            r.regimes.armyBranches[armyId] = JS(branch.rawValue)
        }

        let cityName = r.world.cities.asArray.first { $0.provinceId.asString == home }?.name.optionalString
            ?? r.world.provinces.asArray.first { $0.id.asString == home }?.name.optionalString ?? ""
        let shortPlace = String(cityName.prefix(3))
        let h = Int(draw("\(r.world.custom.seed.optionalString ?? "")|aname|\(nation)|\(armyId)"))

        let titlePool: [String] = {
            switch culture {
            case "chinese", "korean", "vietnamese":
                switch branch {
                case .guardCorps: return ["神策禁军", "羽林亲军", "龙骧禁卫", "虎贲御林军", "殿前卫军", "天策亲卫"]
                case .field:      return ["征东野战军", "破虏主力军", "平南方面军", "定北主力军", "安西征讨军", "神武野战军"]
                case .garrison:   return ["\(shortPlace)镇戍军", "\(shortPlace)边防军", "\(shortPlace)守备营", "关隘戍卫军"]
                case .vanguard:   return ["骁骑前锋营", "飞熊轻骑军", "白马游击军", "铁骑先锋营", "疾风轻骑团"]
                case .siege:      return ["神机破城营", "霹雳攻城军", "虎蹲炮兵旅", "冲阵工程营"]
                }
            case "japanese":
                switch branch {
                case .guardCorps: return ["近卫师团", "旗本御亲卫", "御所禁卫旅"]
                case .field:      return ["\(shortPlace)野战师团", "征讨主力军", "中央机动师团"]
                case .garrison:   return ["\(shortPlace)镇守旅", "\(shortPlace)警备团", "城下守备队"]
                case .vanguard:   return ["疾风骑兵旅", "先阵突击队", "游骑先锋团"]
                case .siege:      return ["铁炮攻城队", "大筒破城旅", "工兵攻坚队"]
                }
            case "mongol", "turkic":
                switch branch {
                case .guardCorps: return ["怯薛亲卫万户", "可汗护卫军", "金帐近卫团"]
                case .field:      return ["中军主力万户", "左翼征伐万户", "右翼铁骑军"]
                case .garrison:   return ["\(shortPlace)镇守千户", "边关屯戍军"]
                case .vanguard:   return ["苍狼先锋千户", "奔袭轻骑万户", "游牧侦骑军"]
                case .siege:      return ["回回炮攻城营", "破城工兵营"]
                }
            case "arab", "persian", "egyptian":
                switch branch {
                case .guardCorps: return ["苏丹禁卫军", "不死亲卫团", "近卫铁甲军"]
                case .field:      return ["\(shortPlace)主力军团", "远征野战军", "中央常备军"]
                case .garrison:   return ["\(shortPlace)要塞守备军", "边疆戍卫团"]
                case .vanguard:   return ["沙漠轻骑前锋", "弯刀游击旅", "疾风骑兵团"]
                case .siege:      return ["重型投石炮旅", "攻城工兵团"]
                }
            default:
                // 欧美／罗马／斯拉夫等真实军事番号风格
                switch branch {
                case .guardCorps: return ["皇家近卫军团", "帝国禁卫师", "王室铁卫军", "近卫胸甲师"]
                case .field:      return ["\(shortPlace)野战军", "中央主力军团", "远征野战师", "常备野战军"]
                case .garrison:   return ["\(shortPlace)边防军", "\(shortPlace)要塞守备旅", "国土防卫师"]
                case .vanguard:   return ["骠骑前锋团", "轻骑机动旅", "游骑侦察纵队", "龙骑先锋团"]
                case .siege:      return ["皇家攻城炮旅", "重炮攻坚团", "工程破城师"]
                }
            }
        }()

        let rawTitle = titlePool[h % titlePool.count]
        return (branch, uniqueArmyTitle(r, rawTitle))
    }

    private static func uniqueArmyTitle(_ r: JS, _ rawTitle: String) -> String {
        let used = Set(r.world.armies.asArray.filter { $0.troops.asNumber > 0 }.compactMap { $0.name.optionalString })
        if !used.contains(rawTitle) { return rawTitle }
        for k in 1..<99 {
            let num = MonarchLore.chineseNumeral(k)
            let candidate = "第\(num)\(rawTitle)"
            if !used.contains(candidate) { return candidate }
        }
        return rawTitle
    }

    /// 玩家或政令主动整编军队职能分部（立即生效并刷新集团军诸兵协同缓存）。
    public static func reorganizeArmyBranch(_ r: JS, army: JS, branch: ArmyBranch, rename: Bool) -> String {
        let aid = army.id.asString
        let nation = army.nationId.asString
        let home = army.provinceId.asString
        if !r.regimes.isNull {
            if r.regimes.armyBranches.isNull { r.regimes.armyBranches = .object() }
            r.regimes.armyBranches[aid] = JS(branch.rawValue)
        }
        groupCacheTick = -1
        if rename {
            let culture = r.civilization.isNull ? "" : (r.civilization.nations[nation].cultureId.optionalString ?? "")
            let cityName = r.world.cities.asArray.first { $0.provinceId.asString == home }?.name.optionalString
                ?? r.world.provinces.asArray.first { $0.id.asString == home }?.name.optionalString ?? ""
            let shortPlace = String(cityName.prefix(3))
            let pool: [String] = {
                switch culture {
                case "chinese", "korean", "vietnamese":
                    switch branch {
                    case .guardCorps: return ["神策禁军", "羽林亲军", "龙骧禁卫", "虎贲御林军"]
                    case .field:      return ["征东野战军", "破虏主力军", "平南方面军", "定北主力军"]
                    case .garrison:   return ["\(shortPlace)镇戍军", "\(shortPlace)边防军", "关隘戍卫军"]
                    case .vanguard:   return ["骁骑前锋营", "飞熊轻骑军", "铁骑先锋营"]
                    case .siege:      return ["神机破城营", "霹雳攻城军", "虎蹲炮兵旅"]
                    }
                case "japanese":
                    switch branch {
                    case .guardCorps: return ["近卫师团", "旗本御亲卫", "御所禁卫旅"]
                    case .field:      return ["\(shortPlace)野战师团", "征讨主力军", "中央机动师团"]
                    case .garrison:   return ["\(shortPlace)镇守旅", "\(shortPlace)警备团"]
                    case .vanguard:   return ["疾风骑兵旅", "先阵突击队"]
                    case .siege:      return ["铁炮攻城队", "大筒破城旅"]
                    }
                case "mongol", "turkic":
                    switch branch {
                    case .guardCorps: return ["怯薛亲卫万户", "可汗护卫军"]
                    case .field:      return ["中军主力万户", "左翼征伐万户"]
                    case .garrison:   return ["\(shortPlace)镇守千户", "边关屯戍军"]
                    case .vanguard:   return ["苍狼先锋千户", "奔袭轻骑万户"]
                    case .siege:      return ["回回炮攻城营", "破城工兵营"]
                    }
                default:
                    switch branch {
                    case .guardCorps: return ["皇家近卫军团", "帝国禁卫师", "王室铁卫军"]
                    case .field:      return ["\(shortPlace)野战军", "中央主力军团", "常备野战军"]
                    case .garrison:   return ["\(shortPlace)边防军", "\(shortPlace)要塞守备旅"]
                    case .vanguard:   return ["骠骑前锋团", "轻骑机动旅", "龙骑先锋团"]
                    case .siege:      return ["皇家攻城炮旅", "重炮攻坚团"]
                    }
                }
            }()
            let h = Int(draw("\(aid)|reorg|\(branch.rawValue)|\(r.clock.tick.asInt)"))
            let title = uniqueArmyTitle(r, pool[h % pool.count])
            army.name = JS(title)
            return title
        }
        return army.name.asString
    }

    public static func armyBranch(_ r: JS, armyId: String, unitKey: String) -> ArmyBranch {
        if !r.regimes.isNull, !r.regimes.armyBranches.isNull, let raw = r.regimes.armyBranches[armyId].optionalString, let b = ArmyBranch(rawValue: raw) {
            return b
        }
        // 旧存档或未显式写入的军队按兵种与编号稳定推断分部
        let role = UnitKinds.byKey[unitKey]?.role
        if role == .elite { return .guardCorps }
        if role == .cavalry || role == .horseArcher { return .vanguard }
        if role == .archer || role == .crossbow || role == .elephant { return .siege }
        if role == .shield || role == .spear { return .garrison }
        return .field
    }

    /// 集团军／方面军动态战区编组（每 Tick 缓存一次，O(A) 扫描；同战区友军自动协同，多兵种分部同阵更触发「诸兵合击」加成）。
    public struct ArmyGroupInfo: Sendable {
        public let name: String
        public let theatre: String
        public let count: Int
        public let troops: Int
        public let bonusPct: Int
        public let distinctBranches: Int
        public let synergyBonusPct: Int
        public var totalBonusPct: Int { bonusPct + synergyBonusPct }
        public let composition: String
        public let synergyLabel: String
    }
    private static var groupCacheTick: Int = -1
    private static var groupCacheWorld: ObjectIdentifier?
    private static var groupCacheMap: [String: ArmyGroupInfo] = [:]

    public static func armyGroup(_ r: JS, armyId: String) -> ArmyGroupInfo? {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return nil }
        let tick = r.clock.tick.asInt
        let wid = ObjectIdentifier(r)
        if groupCacheTick != tick || groupCacheWorld != wid {
            rebuildArmyGroups(r)
            groupCacheTick = tick
            groupCacheWorld = wid
        }
        return groupCacheMap[armyId]
    }

    private static func rebuildArmyGroups(_ r: JS) {
        groupCacheMap.removeAll(keepingCapacity: true)
        var provCenter = [String: (x: Double, y: Double)]()
        for p in r.world.provinces.asArray {
            provCenter[p.id.asString] = (p.center.x.asNumber, p.center.y.asNumber)
        }
        var capPos = [String: (x: Double, y: Double)]()
        var cultureOf = [String: String]()
        for n in r.world.nations.asArray {
            let nid = n.id.asString
            cultureOf[nid] = r.civilization.nations[nid].cultureId.optionalString ?? ""
            if let capProv = Rebellion.capitalProvince(r, nid), let pt = provCenter[capProv] {
                capPos[nid] = pt
            }
        }
        // 按（国家 + 战区方位）聚合当前活跃野战部队，并统计诸兵种分部构成
        struct BucketKey: Hashable { let nation: String; let theatre: String }
        var buckets = [BucketKey: [(id: String, troops: Int, branch: ArmyBranch)]]()
        for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" {
            let nid = a.nationId.asString, aid = a.id.asString
            let pid = a.provinceId.asString
            let pt = provCenter[pid] ?? (0, 0)
            let cap = capPos[nid] ?? pt
            let dx = pt.x - cap.x, dy = pt.y - cap.y
            let dist = (dx * dx + dy * dy).squareRoot()
            let theatre: String
            if dist < 45 {
                theatre = "京畿"
            } else if abs(dx) >= abs(dy) {
                theatre = dx >= 0 ? "东线" : "西线"
            } else {
                theatre = dy >= 0 ? "南线" : "北线"
            }
            let unitKey = r.units[aid].optionalString ?? "Infantry"
            let br = armyBranch(r, armyId: aid, unitKey: unitKey)
            buckets[BucketKey(nation: nid, theatre: theatre), default: []].append((aid, Int(a.troops.asNumber.rounded()), br))
        }
        for (key, members) in buckets where members.count >= 2 {
            let totalTroops = members.reduce(0) { $0 + $1.troops }
            let bonusPct = members.count >= 4 ? 14 : (members.count == 3 ? 10 : 6)
            var brCount = [ArmyBranch: Int]()
            for m in members { brCount[m.branch, default: 0] += 1 }
            let distinct = brCount.count
            let synergyBonus = distinct >= 3 ? 7 : (distinct == 2 ? 4 : 0)
            let comp = ArmyBranch.allCases.compactMap { b -> String? in
                guard let c = brCount[b], c > 0 else { return nil }
                return "\(b.shortTag)×\(c)"
            }.joined(separator: " · ")
            let synLabel = synergyBonus > 0 ? "诸兵合击（\(distinct)部协同 +\(synergyBonus)%）" : ""
            let cult = cultureOf[key.nation] ?? ""
            let groupTitle: String = {
                if key.theatre == "京畿" {
                    return ["chinese", "korean", "vietnamese"].contains(cult) ? "京畿卫戍集团军" : "中央卫戍集团军"
                }
                if cult == "japanese" { return "\(key.theatre)方面军" }
                if cult == "mongol" || cult == "turkic" { return "\(key.theatre)大汗军团群" }
                return "\(key.theatre)第一集团军"
            }()
            let info = ArmyGroupInfo(
                name: groupTitle,
                theatre: key.theatre,
                count: members.count,
                troops: totalTroops,
                bonusPct: bonusPct,
                distinctBranches: distinct,
                synergyBonusPct: synergyBonus,
                composition: comp,
                synergyLabel: synLabel
            )
            for m in members { groupCacheMap[m.id] = info }
        }
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
