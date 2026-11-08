import Foundation

/// 政体更迭 (regime changes): a state in turmoil can fall to revolution — a kingdom or empire becomes
/// a republic or federation, a republic can restore the crown (a restored empire is the Second, the
/// Third…), a theocracy or tribe becomes a kingdom. Each polity also carries its standing bonus, applied
/// every month. Turned on for worlds the app runs (`r.regimes.enabled`); a run without the flag (the
/// engine's parity goldens) is untouched. Deterministic: the monthly roll hashes state and month.
public enum Regimes {
    static let titles = ["Kingdom": "王国", "Empire": "帝国", "Federation": "联邦", "Republic": "共和国", "Tribal": "部族", "Theocracy": "神权国"]
    static let ordinals = ["", "", "第二", "第三", "第四", "第五", "第六"]
    /// Monthly standing bonus of each polity (gold share of income, destiny points).
    public static let traits: [String: String] = [
        "Empire": "帝国：皇权集中，国运每月 +0.3",
        "Kingdom": "王国：王权稳固，国运每月 +0.15、国库每月 +1%",
        "Republic": "共和国：商贸兴盛，国库每月 +3%",
        "Federation": "联邦：诸邦共治，国库每月 +2%、更不易爆发革命",
        "Theocracy": "神权国：信仰凝聚，国运每月 +0.25",
        "Tribal": "部族：骁勇善战，革命后转为王国",
    ]

    /// A state's temper for the AI: its ruler's traits and its polity (warlike > 1 > peaceful).
    public static func temper(_ r: JS, _ id: String) -> Double {
        var t = 1.0
        if let leader = r.people.nations[id].leaderId.optionalNumber, let p = People.person(r, Int(leader)), !p.traits.isNull {
            let w: [String: Double] = ["Hawkish": 1.35, "Ambitious": 1.2, "Wrathful": 1.15, "Cruel": 1.1, "Brave": 1.08, "Unifier": 1.15, "Strategist": 1.05,
                                       "Dovish": 0.72, "Merciful": 0.85, "Patient": 0.88, "WarWeary": 0.75, "Craven": 0.8, "Just": 0.92]
            for trait in p.traits.asArray { t *= w[trait.asString] ?? 1 }
        }
        // 自定义好战程度 overrides the ruler's and the polity's temper.
        if !r.regimes.isNull, let set = r.regimes.temper[id].optionalNumber { return min(1.6, max(0.6, set)) }
        switch r.civilization.nations[id].polity.optionalString ?? "" {
        case "Empire": t *= 1.12
        case "Tribal": t *= 1.1
        case "Republic": t *= 0.9
        case "Federation": t *= 0.85
        default: break
        }
        return min(1.6, max(0.6, t))
    }

    // MARK: 政体细分 (styles)
    /// A form of government over one of the engine's six polities: its own name ending, head-of-state
    /// title and party system. The engine's rules follow the base polity.
    public struct Style: Sendable { public let id: String, base: String, label: String, suffix: String, title: String?, parties: Bool, single: String? }
    public static let styles: [Style] = [
        Style(id: "absolute", base: "Kingdom", label: "君主专制", suffix: "王国", title: nil, parties: false, single: nil),
        Style(id: "constitutional", base: "Kingdom", label: "君主立宪", suffix: "王国", title: nil, parties: true, single: nil),
        Style(id: "empire", base: "Empire", label: "帝制", suffix: "帝国", title: nil, parties: false, single: nil),
        Style(id: "junta", base: "Empire", label: "军政府", suffix: "国", title: "最高统帅", parties: false, single: nil),
        Style(id: "democratic", base: "Republic", label: "民主共和", suffix: "共和国", title: "总统", parties: true, single: nil),
        Style(id: "communist", base: "Republic", label: "人民共和（共产主义）", suffix: "人民共和国", title: "主席", parties: true, single: "共产党"),
        Style(id: "oligarchic", base: "Republic", label: "寡头共和", suffix: "共和国", title: "执政官", parties: true, single: nil),
        Style(id: "federal", base: "Federation", label: "联邦共和", suffix: "联邦", title: "联邦主席", parties: true, single: nil),
        Style(id: "theocracy", base: "Theocracy", label: "神权", suffix: "", title: nil, parties: false, single: nil),
        Style(id: "tribal", base: "Tribal", label: "部落联盟", suffix: "部族", title: nil, parties: false, single: nil),
        Style(id: "feudal", base: "Kingdom", label: "封建王国", suffix: "王国", title: nil, parties: false, single: nil),
        Style(id: "elective", base: "Kingdom", label: "选侯君主", suffix: "王国", title: "选王", parties: false, single: nil),
        Style(id: "sultanate", base: "Kingdom", label: "苏丹国", suffix: "苏丹国", title: "苏丹", parties: false, single: nil),
        Style(id: "principality", base: "Kingdom", label: "公国", suffix: "公国", title: "大公", parties: false, single: nil),
        Style(id: "regency", base: "Kingdom", label: "摄政", suffix: "王国", title: "摄政王", parties: false, single: nil),
        Style(id: "tsardom", base: "Empire", label: "沙皇专制", suffix: "沙皇国", title: "沙皇", parties: false, single: nil),
        Style(id: "shogunate", base: "Empire", label: "幕府", suffix: "幕府", title: "征夷大将军", parties: false, single: nil),
        Style(id: "despotism", base: "Empire", label: "专制帝国", suffix: "帝国", title: nil, parties: false, single: nil),
        Style(id: "citystate", base: "Republic", label: "城邦共和", suffix: "城邦", title: "执政官", parties: true, single: nil),
        Style(id: "merchant", base: "Republic", label: "商业共和", suffix: "共和国", title: "总督", parties: true, single: nil),
        Style(id: "parliamentary", base: "Republic", label: "议会共和", suffix: "共和国", title: "总理", parties: true, single: nil),
        Style(id: "presidential", base: "Republic", label: "总统共和", suffix: "共和国", title: "总统", parties: true, single: nil),
        Style(id: "socialist", base: "Republic", label: "社会主义", suffix: "社会主义共和国", title: "总书记", parties: true, single: "劳动党"),
        Style(id: "dictatorship", base: "Republic", label: "独裁", suffix: "国", title: "元首", parties: false, single: nil),
        Style(id: "council", base: "Republic", label: "革命委员会", suffix: "共和国", title: "委员长", parties: true, single: "革命党"),
        Style(id: "confederation", base: "Federation", label: "邦联", suffix: "邦联", title: "邦联主席", parties: true, single: nil),
        Style(id: "union", base: "Federation", label: "联合王国", suffix: "联合王国", title: "君主", parties: true, single: nil),
        Style(id: "caliphate", base: "Theocracy", label: "哈里发国", suffix: "哈里发国", title: "哈里发", parties: false, single: nil),
        Style(id: "papacy", base: "Theocracy", label: "教宗国", suffix: "教宗国", title: "教宗", parties: false, single: nil),
        Style(id: "lamaism", base: "Theocracy", label: "政教合一", suffix: "国", title: "法王", parties: false, single: nil),
        Style(id: "order", base: "Theocracy", label: "骑士团国", suffix: "骑士团国", title: "大团长", parties: false, single: nil),
        Style(id: "khanate", base: "Tribal", label: "汗国", suffix: "汗国", title: "可汗", parties: false, single: nil),
        Style(id: "chiefdom", base: "Tribal", label: "酋邦", suffix: "酋邦", title: "大酋长", parties: false, single: nil),
    ]
    static let defaultStyle = ["Kingdom": "absolute", "Empire": "empire", "Republic": "democratic", "Federation": "federal", "Theocracy": "theocracy", "Tribal": "tribal"]
    public static func style(_ r: JS, _ id: String) -> Style {
        let polity = r.civilization.nations[id].polity.optionalString ?? "Kingdom"
        let chosen = r.regimes.isNull ? nil : r.regimes.nations[id].style.optionalString
        if let chosen, let s = styles.first(where: { $0.id == chosen && $0.base == polity }) { return s }
        return styles.first { $0.id == defaultStyle[polity] } ?? styles[0]
    }
    /// The state's name for its base name and style (a restored empire's ordinal kept by the caller).
    static func title(_ r: JS, _ id: String, base: String, style s: Style) -> String {
        if s.id == "theocracy" || s.suffix.isEmpty { return Opening.stateTitle(base, polity: s.base, religion: r.civilization.nations[id].religionId.optionalString ?? "") }
        return base + s.suffix
    }

    // MARK: 朝廷职位 (posts)
    /// Twenty posts beyond the engine's three central offices. Each is held by a person of the state;
    /// the skill it calls for drives a monthly effect: treasury (gold), fortune (destiny) or the armies'
    /// morale. Titles follow the state's tradition.
    public struct Post: Sendable { public let id: String; public let skill: Int; public let effect: String; public let titles: [String] }
    // titles: east, west, republic, church, steppe. skill: 0 charisma, 1 military, 2 diplomatic, 3 administrative.
    public static let posts: [Post] = [
        Post(id: "revenue", skill: 3, effect: "gold", titles: ["户部尚书", "财政大臣", "财政部长", "司库主教", "必阇赤"]),
        Post(id: "war", skill: 1, effect: "morale", titles: ["兵部尚书", "陆军大臣", "国防部长", "护教军统领", "万户长"]),
        Post(id: "rites", skill: 2, effect: "destiny", titles: ["礼部尚书", "外务大臣", "外交部长", "礼仪枢机", "使臣长"]),
        Post(id: "justice", skill: 3, effect: "destiny", titles: ["刑部尚书", "大法官", "司法部长", "宗教裁判长", "札鲁忽赤"]),
        Post(id: "works", skill: 3, effect: "gold", titles: ["工部尚书", "工务大臣", "建设部长", "营造执事", "工匠长"]),
        Post(id: "personnel", skill: 3, effect: "destiny", titles: ["吏部尚书", "宫廷总管", "内政部长", "教区总铎", "怯薛长"]),
        Post(id: "censor", skill: 2, effect: "destiny", titles: ["御史大夫", "监察总长", "监察委员长", "监督主教", "断事官"]),
        Post(id: "tutor", skill: 0, effect: "destiny", titles: ["太傅", "王储导师", "教育部长", "神学院长", "智者"]),
        Post(id: "admiral", skill: 1, effect: "morale", titles: ["水师提督", "海军大臣", "海军部长", "圣舰队长", "船队长"]),
        Post(id: "envoy", skill: 2, effect: "destiny", titles: ["鸿胪寺卿", "首席使节", "驻外大使", "教廷使节", "通使"]),
        Post(id: "treasury", skill: 3, effect: "gold", titles: ["少府监", "国库总管", "央行行长", "教产总管", "仓官"]),
        Post(id: "guard", skill: 1, effect: "morale", titles: ["禁军统领", "近卫军长", "卫戍司令", "圣殿卫队长", "怯薛统领"]),
        Post(id: "spy", skill: 2, effect: "destiny", titles: ["皇城司使", "密探总管", "情报局长", "密使", "探马赤"]),
        Post(id: "history", skill: 0, effect: "destiny", titles: ["太史令", "宫廷史官", "档案馆长", "编年修士", "说唱人"]),
        Post(id: "horse", skill: 1, effect: "morale", titles: ["太仆卿", "马政大臣", "后勤部长", "骑士团军需", "牧马官"]),
        Post(id: "salt", skill: 3, effect: "gold", titles: ["盐铁使", "专卖总监", "工商部长", "什一税官", "商队长"]),
        Post(id: "grain", skill: 3, effect: "gold", titles: ["漕运总督", "粮务大臣", "农业部长", "施赈执事", "屯田官"]),
        Post(id: "academy", skill: 0, effect: "destiny", titles: ["国子祭酒", "学院院长", "科学院长", "大学神父", "博士"]),
        Post(id: "frontier", skill: 1, effect: "morale", titles: ["都护", "边境总督", "边防司令", "边区主教", "镇守千户"]),
        Post(id: "palace", skill: 0, effect: "destiny", titles: ["内侍监", "宫务大臣", "办公厅主任", "教宗内廷长", "斡耳朵总管"]),
    ]
    public static func tradition(_ r: JS, _ id: String) -> Int {
        let s = style(r, id), culture = r.civilization.nations[id].cultureId.optionalString ?? ""
        if s.base == "Republic" || s.base == "Federation" { return 2 }
        if s.base == "Theocracy" { return 3 }
        if s.base == "Tribal" || culture == "mongol" || culture == "turkic" { return 4 }
        if ["chinese", "korean", "japanese"].contains(culture) { return 0 }
        return 1
    }
    static func skill(_ p: JS, _ k: Int) -> Double { let s = People.skills(p); return [s.charisma, s.military, s.diplomatic, s.administrative][k] }
    /// The living adults of a state, for the posts (read when the panel opens, not every day).
    static func adults(_ r: JS, _ id: String) -> [JS] {
        let sid = Offices.stateId(r, id)
        return r.kin.persons.objectValues.filter { $0.isAlive.asBool && $0.stateId.asInt == sid && ($0.age.optionalNumber ?? 0) >= 18 && ($0.age.optionalNumber ?? 0) <= 75 }
    }
    /// Fills empty posts with the ablest free people (once, when the court is looked at or monthly when filled).
    static func fillPosts(_ r: JS, _ id: String) {
        let b = book(r, id)
        if b.posts.isNull { b.posts = JS.object() }
        let empty = posts.filter { p in
            guard let pid = b.posts[p.id].optionalNumber, let person = People.person(r, Int(pid)), person.isAlive.asBool else { return true }
            return false
        }
        guard !empty.isEmpty, !r.offices47.nations[id].manual.isTruthy else { return }
        var taken = Set(b.posts.objectValues.compactMap { $0.optionalNumber.map { Int($0) } })
        let pool = adults(r, id)
        for p in empty {
            guard let best = pool.filter({ !taken.contains($0.id.asInt) }).max(by: { skill($0, p.skill) < skill($1, p.skill) }) else { break }
            b.posts[p.id] = JS(best.id.asInt); taken.insert(best.id.asInt)
        }
    }
    /// Monthly effects of the filled posts.
    static func postEffects(_ r: JS, _ id: String, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let b = book(r, id)
        guard !b.posts.isNull else { return }
        var morale = 0.0
        for p in posts {
            guard let pid = b.posts[p.id].optionalNumber, let person = People.person(r, Int(pid)), person.isAlive.asBool else { continue }
            let e = (skill(person, p.skill) - 50) / 50
            switch p.effect {
            case "gold": addGold(0.004 * e)
            case "destiny": addDestiny(0.02 * e)
            default: morale += 0.15 * e
            }
        }
        if morale != 0 {
            for a in r.world.armies.asArray where a.nationId.optionalString == id && a.troops.asNumber > 0 {
                a.morale = JS(min(100, max(0, (a.morale.optionalNumber ?? 0) + morale)))
            }
        }
    }

    // MARK: 党派 (parties)
    static let partyNames = ["自由党", "保守党", "民主党", "共和党", "进步党", "人民党", "国民党", "社会党", "工党", "民族党", "联邦党", "改革党", "农民党", "统一党", "立宪党", "公民党"]
    static let oligarchs = ["元老派", "商人公会", "贵族院派", "将门派"]
    /// Seats out of 100 for each party of a state with a party system (made once, re-dealt at elections).
    static func parties(_ r: JS, _ id: String, _ s: Style, seed: Int) -> JS {
        var h: UInt32 = 0x811c9dc5
        for u in "\(id)|\(seed)|parties".utf8 { h = (h ^ UInt32(u)) &* 0x1000193 }
        func next() -> UInt32 { h = h &* 1664525 &+ 1013904223; return h >> 8 }
        var names: [String]
        if let single = s.single { names = [single] }
        else if s.id == "oligarchic" { names = oligarchs }
        else {
            var pool = partyNames; names = []
            for _ in 0..<(3 + Int(next() % 2)) { names.append(pool.remove(at: Int(next() % UInt32(pool.count)))) }
        }
        var weights = names.map { _ in Double(10 + next() % 40) }
        if s.single != nil { weights = [100] }
        let total = weights.reduce(0, +)
        var seats = weights.map { Int(($0 / total * 100).rounded()) }
        seats[0] += 100 - seats.reduce(0, +)
        return .array(zip(names, seats).map { n, v in let o = JS.object(); o.name = JS(n); o.seats = JS(max(0, v)); return o })
    }
    /// Every four years a state with parties re-deals its seats; a new largest party takes power.
    static func election(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let s = style(r, id)
        guard s.parties, s.single == nil else { return }
        let b = book(r, id)
        if b.parties.isNull { b.parties = parties(r, id, s, seed: key); return }
        guard key % 48 == Offices.stateId(r, id) % 48 else { return }
        let before = b.parties.asArray.max { $0.seats.asInt < $1.seats.asInt }?.name.optionalString
        b.parties = parties(r, id, s, seed: key)
        let after = b.parties.asArray.max { $0.seats.asInt < $1.seats.asInt }?.name.optionalString ?? ""
        let text = after == before ? "\(n.name.asString)大选：\(after)连任执政" : "\(n.name.asString)大选：\(after)上台执政"
        _ = People.announce(r, kind: "event", text: text, reason: "四年一度的议会选举，议席重新分配；最大党组织政府。", nations: [id], province: nil)
    }

    // MARK: 条约 (treaties)
    /// A live treaty between two states (pact or marriage), if any.
    public static func treaty(_ r: JS, _ a: String, _ b: String) -> JS? {
        guard !r.regimes.isNull, !r.regimes.pacts.isNull else { return nil }
        let now = r.regimes.month.asInt
        return r.regimes.pacts.asArray.first { p in
            let x = p.a.asString, y = p.b.asString
            return ((x == a && y == b) || (x == b && y == a)) && p.until.asInt > now
        }
    }

    public static func enable(_ r: JS) {
        if r.regimes.isNull { let o = JS.object(); o.nations = JS.object(); o.month = JS(-1); r.regimes = o }
        r.regimes.enabled = JS(true)
        Shipyards.remember(r)
    }
    static func monthKey(_ r: JS) -> Int { r.life.currentDate.year.asInt * 12 + r.life.currentDate.month.asInt }

    /// After each day: on a new month, every state's polity bonus and its revolution roll.
    public static func day(_ r: JS) {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        let key = monthKey(r)
        if r.regimes.month.asInt == key { return }
        r.regimes.month = JS(key)
        if DeclarationEngine.temper != nil { DeclarationEngine.nationIds = r.world.nations.asArray.map(\.id.asString) }
        // Treaties end in their month.
        if !r.regimes.pacts.isNull { r.regimes.pacts = .array(r.regimes.pacts.asArray.filter { $0.until.asInt > key }) }
        for n in r.world.nations.asArray {
            let id = n.id.asString
            guard Vassals.alive(r, id) else { continue }
            month(r, n, id, key)
        }
        Shipyards.month(r)
    }

    /// 国家加成 (自定义), in percent: income, attack, defense, growth (a year), speed. nil when unset.
    public static let bonusKeys = ["income", "attack", "defense", "growth", "speed"]
    public static func bonus(_ r: JS, _ id: String, _ key: String) -> Double? {
        guard !r.regimes.isNull, !r.regimes.bonus.isNull else { return nil }
        return r.regimes.bonus[id][key].optionalNumber
    }
    /// Damage multiplier for `attacker`'s army hitting `victim`'s (attack and defence bonuses, and the
    /// world's combat intensity).
    static func combatBonus(_ r: JS, attacker: String, victim: String) -> Double {
        let a = bonus(r, attacker, "attack") ?? 0, d = bonus(r, victim, "defense") ?? 0
        // App worlds fight at twice the original's lethality: evenly matched armies used to grind for a
        // whole year; a battle now decides within weeks (战斗烈度 still scales it).
        return max(0.2, (1 + a / 100) / max(0.2, 1 + d / 100)) * rule(r, "damage") * Tuning.current.lethality
    }

    /// 天下规则 (自定义): world-wide rates in percent of normal — war frequency, combat intensity, march
    /// speed, levy size and shipbuilding speed. 100 (or unset) is the normal game.
    public static let ruleKeys = ["war", "damage", "march", "levy", "ships"]
    public static let ruleRanges: [String: ClosedRange<Double>] = ["war": 0...300, "damage": 25...400, "march": 25...300, "levy": 25...400, "ships": 25...400]
    public static func rule(_ r: JS, _ key: String) -> Double {
        guard !r.regimes.isNull, let v = r.regimes.world[key].optionalNumber else { return 1 }
        return max(0.05, v / 100)
    }

    static func book(_ r: JS, _ id: String) -> JS {
        if r.regimes.nations[id].isNull {
            let b = JS.object(); b.history = .array([JS(r.civilization.nations[id].polity.optionalString ?? "Kingdom")]); b.empires = JS(r.civilization.nations[id].polity.optionalString == "Empire" ? 1 : 0); b.calm = JS(0)
            r.regimes.nations[id] = b
        }
        return r.regimes.nations[id]
    }

    static func month(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let polity = r.civilization.nations[id].polity.optionalString ?? "Kingdom"
        let fin = r.finance.nations[id], gain = max(0, fin.goldPerMonth.optionalNumber ?? 0)
        let destiny = r.destiny.nations[id]
        func addGold(_ share: Double) { if !fin.isNull { fin.gold = JS((fin.gold.optionalNumber ?? 0) + gain * share) } }
        func addDestiny(_ v: Double) { if !destiny.isNull { destiny.destiny = JS(max(0, min(100, (destiny.destiny.optionalNumber ?? 0) + v))) } }
        switch polity {
        case "Empire": addDestiny(0.3)
        case "Kingdom": addDestiny(0.15); addGold(0.01)
        case "Republic": addGold(0.03)
        case "Federation": addGold(0.02)
        case "Theocracy": addDestiny(0.25)
        default: break
        }
        // 国家加成 (自定义): extra income and population growth each month.
        if let income = bonus(r, id, "income"), income != 0 { addGold(income / 100) }
        if let growth = bonus(r, id, "growth"), growth != 0 {
            let owned = Set(r.world.provinces.asArray.filter { $0.controller.optionalString == id }.map(\.id.asString))
            for s in r.world.statecraft.provinces.asArray where owned.contains(s.provinceId.asString) {
                s.population = JS(max(100, ((s.population.optionalNumber ?? 0) * (1 + growth / 1200)).rounded()))
            }
        }
        // 特产与贸易: the kinds of goods held and bought from partners at peace add to the income.
        let trade = Trade.share(r, id).rate
        if trade > 0 { addGold(trade) }
        // 税制 and the treasury record (财政).
        Finance.month(r, id, addGold: addGold, addDestiny: addDestiny)
        happenings(r, n, id, key, gain: gain, addGold: addGold, addDestiny: addDestiny)
        postEffects(r, id, addGold: addGold, addDestiny: addDestiny)
        tribute(r, n, id, gain: gain)
        // 国力走势: the state's strength once a month, the last ten years.
        if r.regimes.power.isNull { r.regimes.power = JS.object() }
        var power = r.regimes.power[id].isNull ? [JS]() : r.regimes.power[id].asArray
        power.append(JS((War26.strength(r, id) * 10).rounded() / 10))
        r.regimes.power[id] = .array(Array(power.suffix(120)))
        coup(r, n, id, key)
        election(r, n, id, key)
        reform(r, n, id, key)
        let b = book(r, id)
        b.calm = JS(b.calm.asInt + 1)
        // Turmoil: weak government, lost land, a very old ruler; no revolution within two years of one.
        guard b.calm.asInt >= 24 else { return }
        let provinces = r.world.provinces.asArray
        let held = provinces.filter { $0.controller.optionalString == id }.count
        guard held >= 3 else { return }
        let lost = provinces.filter { ($0.legalOwner.optionalString ?? $0.controller.optionalString) == id && $0.controller.optionalString != id }.count
        let governance = Offices.governance(r, id)
        var risk = 0.0015 + (governance < 0.3 ? 0.004 : 0) + Double(lost) / Double(held + lost) * 0.02
        if let leader = r.people.nations[id].leaderId.optionalNumber, let p = People.person(r, Int(leader)), (p.age.optionalNumber ?? 0) > 70 { risk += 0.0015 }
        if polity == "Federation" { risk *= 0.6 }
        // A reformer on the throne channels unrest into reform: half the risk.
        if rulerHas(r, id, { $0.isReformer.isTruthy }) { risk *= 0.5 }
        var h: UInt32 = 0x811c9dc5
        for u in "\(id)|\(key)|regime".utf8 { h = (h ^ UInt32(u)) &* 0x1000193 }
        guard Double(h) / 4294967296 < risk else { return }
        let next: String
        switch polity {
        case "Empire", "Kingdom": next = (h >> 7) % 3 == 0 ? "Federation" : "Republic"
        case "Republic", "Federation": next = b.history.asArray.contains(where: { $0.asString == "Empire" || $0.asString == "Kingdom" }) ? "Empire" : "Kingdom"
        default: next = "Kingdom"
        }
        change(r, id, to: next, reason: polity == "Republic" || polity == "Federation" ? "复辟" : "革命")
    }

    /// 纳贡 (app rule): a vassal sends a tenth of its monthly income to its overlord; each January the
    /// chronicle records it.
    static func tribute(_ r: JS, _ n: JS, _ id: String, gain: Double) {
        guard gain > 0, let lord = Vassals.overlord(r, id), lord != id else { return }
        let mine = r.finance.nations[id], theirs = r.finance.nations[lord]
        guard !mine.isNull, !theirs.isNull else { return }
        let amount = min(mine.gold.optionalNumber ?? 0, gain * 0.1)
        guard amount > 0 else { return }
        mine.gold = JS((mine.gold.optionalNumber ?? 0) - amount); theirs.gold = JS((theirs.gold.optionalNumber ?? 0) + amount)
        if r.life.currentDate.month.asInt == 1, let lordName = r.world.nations.asArray.first(where: { $0.id.asString == lord })?.name.asString {
            _ = People.announce(r, kind: "event", text: "\(n.name.asString)向\(lordName)纳贡", reason: "附庸每月以岁入一成上缴宗主国。", nations: [id, lord], province: nil)
        }
    }

    /// 权臣篡位 (app rule): a plotting house (relation to the rulers ≤ −50) stronger than the ruling house,
    /// in a badly governed state, may seize the throne without a war: its ablest adult takes the throne
    /// through the engine's own appointment (chronicle, roles, ruling house), the old reign closes.
    static func coup(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        guard !r.nobility.isNull, !r.nobility.families.isNull, Offices.governance(r, id) < 0.4 else { return }
        let ruling = r.nobility.rulingFamilies[id].optionalNumber.map { String(Int($0)) } ?? ""
        guard !ruling.isEmpty, r.nobility.families.has(ruling) else { return }
        let rulingInfluence = r.nobility.families[ruling].influence.optionalNumber ?? 0
        var h: UInt32 = 0x811c9dc5
        for u in "\(id)|\(key)|coup".utf8 { h = (h ^ UInt32(u)) &* 0x1000193 }
        guard Double(h) / 4294967296 < 0.004 else { return }
        let rivals = r.nobility.families.objectEntries.filter { key, fam in
            key != ruling && fam.nationId.optionalString == id && (fam.influence.optionalNumber ?? 0) > rulingInfluence * 1.2
                && !r.kin.families[key].isNull && Nobility.relation(r, key, ruling) <= -50
        }
        guard let usurper = rivals.max(by: { ($0.1.influence.optionalNumber ?? 0) < ($1.1.influence.optionalNumber ?? 0) }) else { return }
        let adults = People.livingOwn(r, r.kin.families[usurper.0]).filter { ($0.age.optionalNumber ?? 0) >= 18 }
        func ability(_ p: JS) -> Double { let s = People.skills(p); return s.military + s.administrative + s.charisma + s.diplomatic }
        guard let claimant = adults.max(by: { ability($0) < ability($1) }) else { return }
        let oldName = n.name.asString, house = r.kin.families[usurper.0].surname.optionalString ?? ""
        if let lid = r.people.nations[id].leaderId.optionalNumber, let lp = People.person(r, Int(lid)),
           lp.roles.asArray.contains(where: { $0.nativeKind.optionalString == "leader" && $0.stateId.asInt == lp.stateId.asInt }) {
            Government.closeLeaderRole(r, id, "usurpation")
        }
        _ = People.appointKnownPerson(r, id, claimant, cause: "usurpation")
        Government.refreshLeaderCombat(r)
        r.nobility.families[ruling].influence = JS(max(0, rulingInfluence * 0.6))
        let d = r.destiny.nations[id]
        if !d.isNull { d.destiny = JS(max(0, (d.destiny.optionalNumber ?? 0) - 8)) }
        _ = People.announce(r, kind: "politics", text: "\(oldName)权臣\(house)氏篡位", reason: "宗室失德、朝政废弛，势力凌驾宗室的\(house)氏发动政变，族中贤能者登位；旧宗室势力大衰，国运 −8。", nations: [id], province: nil)
    }

    /// Whether the state's living ruler has a trait matching the catalogue test.
    static func rulerHas(_ r: JS, _ id: String, _ test: (JS) -> Bool) -> Bool {
        let lid = r.people.nations[id].leaderId
        guard !lid.isNull, let p = People.person(r, lid.asInt), !p.traits.isNull else { return false }
        return p.traits.asArray.contains { Nobility.trait($0.asString).map(test) ?? false }
    }

    /// 改革家 (the original's Reformer: a reform check when he comes to power, by his administration,
    /// that changes the state's corruption). Once per reign: success raises governance by 0.15 for as
    /// long as he reigns; failure costs three points of destiny.
    static func reform(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let lid = r.people.nations[id].leaderId
        guard !lid.isNull, rulerHas(r, id, { $0.isReformer.isTruthy }), let p = People.person(r, lid.asInt) else { return }
        if r.regimes.reform.isNull { r.regimes.reform = .object() }
        if r.regimes.reform[id].leader.optionalNumber == lid.asNumber { return }
        let row = JS.object(); row.leader = lid.clone()
        let admin = People.skills(p).administrative, chance = min(0.9, max(0.15, admin / 100))
        var h: UInt32 = 0x811c9dc5
        for u in "\(id)|\(key)|reform".utf8 { h = (h ^ UInt32(u)) &* 0x1000193 }
        let who = n.name.asString + "君主"
        if Double(h) / 4294967296 < chance {
            row.bonus = JS(0.15)
            _ = People.announce(r, kind: "politics", text: who + "推行变法", reason: "改革家登位，整顿吏治、裁汰冗员：在位期间施政 +15%。", nations: [id], province: nil)
        } else {
            row.bonus = JS(0)
            let d = r.destiny.nations[id]
            if !d.isNull { d.destiny = JS(max(0, (d.destiny.optionalNumber ?? 0) - 3)) }
            _ = People.announce(r, kind: "politics", text: who + "变法受阻", reason: "改革家登位推行新政，朝野阻挠未能成功：国运 −3。", nations: [id], province: nil)
        }
        r.regimes.reform[id] = row
    }

    /// Rare monthly happenings that make each state's history its own: a bumper harvest, a disaster, a
    /// generation of able ministers, a plague. Deterministic per state and month.
    static func happenings(_ r: JS, _ n: JS, _ id: String, _ key: Int, gain: Double, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        var h: UInt32 = 0x811c9dc5
        for u in "\(id)|\(key)|event".utf8 { h = (h ^ UInt32(u)) &* 0x1000193 }
        let roll = Double(h) / 4294967296, name = n.name.asString
        func say(_ text: String, _ reason: String) { _ = People.announce(r, kind: "event", text: text, reason: reason, nations: [id], province: nil) }
        if roll < 0.004 {
            addGold(2); say("\(name)五谷丰登", "风调雨顺，仓廪充实：国库多收两月岁入。")
        } else if roll < 0.007 {
            let fin = r.finance.nations[id]; if !fin.isNull { fin.gold = JS((fin.gold.optionalNumber ?? 0) * 0.85) }
            addDestiny(-3); say("\(name)遭遇天灾", "水旱相继，赈济耗费：国库减一成半，国运 −3。")
        } else if roll < 0.009 {
            addDestiny(5); say("\(name)名臣辈出", "朝中贤能云集，政通人和：国运 +5。")
        } else if roll < 0.0105 {
            addDestiny(-5); say("\(name)瘟疫流行", "疫病蔓延，民生凋敝：国运 −5。")
        } else if roll < 0.0115 && gain > 0 {
            addGold(4); say("\(name)商路大开", "远方商旅络绎不绝：国库多收四月岁入。")
        }
    }

    /// Sets a state's polity and retitles it; a restored empire counts its ordinal.
    @discardableResult
    public static func change(_ r: JS, _ id: String, to polity: String, reason: String) -> String {
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return "" }
        let civ = r.civilization.nations[id]
        let old = civ.polity.optionalString ?? "Kingdom", oldName = n.name.asString
        civ.polity = JS(polity)
        let b = r.regimes.isNull ? nil : book(r, id)
        var prefix = ""
        if polity == "Empire", let b {
            b.empires = JS(b.empires.asInt + 1)
            if b.empires.asInt >= 2 { prefix = ordinals[min(ordinals.count - 1, b.empires.asInt)] }
        }
        if let b { b.history.push(JS(polity)); b.calm = JS(0) }
        let base = civ.name.value.optionalString ?? oldName
        if let b { b.parties = .null }
        let s = style(r, id)
        n.name = JS(prefix.isEmpty ? title(r, id, base: base, style: s) : base + prefix + (titles[polity] ?? ""))
        // Turmoil costs: a fifth of the treasury and ten points of destiny.
        let fin = r.finance.nations[id]
        if !fin.isNull { fin.gold = JS((fin.gold.optionalNumber ?? 0) * 0.8) }
        let d = r.destiny.nations[id]
        if !d.isNull { d.destiny = JS(max(0, (d.destiny.optionalNumber ?? 0) - 10)) }
        _ = People.announce(r, kind: "politics", text: "\(oldName)\(reason)，改称\(n.name.asString)",
                            reason: "\(titles[old] ?? old)政体倾覆，\(titles[polity] ?? polity)建立；国库与国运受损，新政体的加成即日起生效。", nations: [id], province: nil)
        return n.name.asString
    }
}

extension NativeEngine {
    /// Turns on the app-only rules (regime changes) for this run.
    /// 改易政体 by style (君主立宪、人民共和…): the base polity changes as a revolution would; the style
    /// sets the name ending, the head's title and the parties.
    public func setStyle(_ index: Int, style: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), let s = Regimes.styles.first(where: { $0.id == style }) else { return (false, "政体不存在。") }
        Regimes.enable(r)
        let id = nations[index].id.asString
        let b = Regimes.book(r, id)
        b.style = JS(style)
        if r.civilization.nations[id].polity.optionalString != s.base {
            Regimes.change(r, id, to: s.base, reason: "改制")
            Government.reconcileContinuity(r)
        } else {
            b.parties = .null
            nations[index].name = JS(Regimes.title(r, id, base: r.civilization.nations[id].name.value.optionalString ?? nations[index].name.asString, style: s))
        }
        return (true, "已改行\(s.label)")
    }
    /// 外交: a non-aggression pact or a marriage between two states for some years (no war between them).
    public func treaty(_ a: Int, _ b: Int, years: Int, kind: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(a), nations.indices.contains(b), a != b else { return (false, "国家不存在。") }
        let x = nations[a].id.asString, y = nations[b].id.asString
        if Wars.relation(r, x, y)?.status.asString == "war" { return (false, "两国正在交战，须先议和。") }
        Regimes.enable(r)
        if r.regimes.pacts.isNull { r.regimes.pacts = .array() }
        let p = JS.object(); p.a = JS(x); p.b = JS(y); p.kind = JS(kind); p.until = JS(max(0, r.regimes.month.asInt) + max(1, years) * 12)
        r.regimes.pacts.push(p)
        let an = nations[a].name.asString, bn = nations[b].name.asString
        let text = kind == "marriage" ? "\(an)与\(bn)联姻" : "\(an)与\(bn)缔结\(years)年互不侵犯条约"
        _ = People.announce(r, kind: "event", text: text, reason: kind == "marriage" ? "两国王室联姻，\(years)年内互不兴兵。" : "条约期内双方不得相互宣战。", nations: [x, y], province: nil)
        return (true, text)
    }
    /// 朝廷职位: the posts with their titles (by tradition), holders and the effect each brings.
    public func posts(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let id = nations[index].id.asString
        Regimes.enable(r)
        Regimes.fillPosts(r, id)
        let t = Regimes.tradition(r, id), b = Regimes.book(r, id)
        let out = JS.array()
        for p in Regimes.posts {
            let e = JS.object(); e.id = JS(p.id); e.title = JS(p.titles[t]); e.effect = JS(p.effect); e.skill = JS(p.skill)
            if let pid = b.posts[p.id].optionalNumber, let person = People.person(r, Int(pid)), person.isAlive.asBool {
                let v = personView(person, role: p.titles[t]); e.holder = v; e.value = JS(Regimes.skill(person, p.skill).rounded())
            }
            out.push(e)
        }
        return Data(out.json.utf8)
    }
    /// Candidates for a post, ablest in its skill first.
    public func postCandidates(_ index: Int, post: String) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), let p = Regimes.posts.first(where: { $0.id == post }) else { return nil }
        let out = JS.array()
        for person in Regimes.adults(r, nations[index].id.asString).sorted(by: { Regimes.skill($0, p.skill) > Regimes.skill($1, p.skill) }).prefix(15) { out.push(personView(person, role: "")) }
        return Data(out.json.utf8)
    }
    public func appointPost(_ index: Int, post: String, personId: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), Regimes.posts.contains(where: { $0.id == post }) else { return (false, "职位不存在。") }
        guard let person = People.person(r, personId), person.isAlive.asBool else { return (false, "此人已不在人世。") }
        Regimes.enable(r)
        let b = Regimes.book(r, nations[index].id.asString)
        if b.posts.isNull { b.posts = JS.object() }
        b.posts[post] = JS(personId)
        return (true, "已任命\(personView(person, role: "").name.asString)")
    }

    /// 赠金: gold from one treasury to another.
    public func gift(_ from: Int, to: Int, gold: Double) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(from), nations.indices.contains(to), from != to else { return (false, "国家不存在。") }
        let a = r.finance.nations[nations[from].id.asString], b = r.finance.nations[nations[to].id.asString]
        guard !a.isNull, !b.isNull else { return (false, "国库不存在。") }
        let amount = min(max(0, gold), a.gold.optionalNumber ?? 0)
        guard amount > 0 else { return (false, "国库空虚，无金可赠。") }
        a.gold = JS((a.gold.optionalNumber ?? 0) - amount); b.gold = JS((b.gold.optionalNumber ?? 0) + amount)
        let text = "\(nations[from].name.asString)赠\(nations[to].name.asString)\(Int(amount))金"
        _ = People.announce(r, kind: "event", text: text, reason: "国书往来，金帛相赠。", nations: [nations[from].id.asString, nations[to].id.asString], province: nil)
        return (true, text)
    }

    public func enableAppRules() {
        Regimes.enable(run)
        let r = run
        UnitKinds.enabled = true
        Armies.bridge?.reconcileContacts(r)  // Drop obsolete province-wide contacts before the first volley.
        // Once per world: the opening fleets sail with three ships (one ship of forty hands made sea
        // battles all but invisible); hull, crew and stores follow.
        if !r.regimes.isNull && !r.regimes.navyMustered.isTruthy {
            r.regimes.navyMustered = JS(true)
            for fl in Naval.fleets(r) where fl.status.asString != "lost" && fl.ships.asInt < Tuning.current.openingShips {
                let id = fl.id.asString, old = max(1, fl.ships.asNumber)
                let condition = r.maritime.isNull ? 1 : min(1, max(0.05, (r.maritime.hulls[id].optionalNumber ?? old * 100) / (old * 100)))
                let n = Double(Tuning.current.openingShips)
                fl.ships = JS(Int(n)); fl.crew = JS(Int((40 * n * condition).rounded(.up))); fl.food = JS(max(fl.food.asNumber, 2400 * n))
                if !r.maritime.isNull { r.maritime.hulls[id] = JS((100 * n * condition).rounded()) }
            }
        }
        // Once per world: the opening armies take their culture's arms (renamed to match).
        if !r.regimes.isNull && !r.regimes.armsByCulture.isTruthy {
            r.regimes.armsByCulture = JS(true)
            for a in r.world.armies.asArray {
                let id = a.id.asString, old = UnitKinds.name(r.units[id].optionalString ?? "Infantry")
                let k = UnitKinds.pick(culture: r.civilization.nations[a.nationId.asString].cultureId.optionalString ?? "", id: id)
                r.units[id] = JS(k.key)
                let name = a.name.asString
                if name.hasSuffix(old) { a.name = JS(String(name.dropLast(old.count)) + k.name) }
            }
        }
        DeclarationEngine.nationIds = r.world.nations.asArray.map(\.id.asString)
        // A state's temper, times the world's war frequency (天下规则).
        DeclarationEngine.temper = { id in Regimes.temper(r, id) * Regimes.rule(r, "war") * Tuning.current.warEagerness }
        DeclarationEngine.pact = { a, b in
            let ids = DeclarationEngine.nationIds
            guard ids.indices.contains(a), ids.indices.contains(b) else { return false }
            return Regimes.treaty(r, ids[a], ids[b]) != nil
        }
        DeclarationEngine.stance = { id in Armies.stateTraits(r, id) }
        ArmyAutonomy.temper = { index in
            let ids = DeclarationEngine.nationIds
            return ids.indices.contains(index) ? Regimes.temper(r, ids[index]) : 1
        }
    }

    /// Polity history and the current polity's bonus, for the state panel.
    public func regime(_ index: Int) -> (history: [String], trait: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return ([], "") }
        let id = nations[index].id.asString, polity = r.civilization.nations[id].polity.optionalString ?? ""
        let history = r.regimes.isNull || r.regimes.nations[id].isNull ? [polity] : r.regimes.nations[id].history.asArray.map(\.asString)
        return (history.map { Regimes.titles[$0] ?? $0 }, Regimes.traits[polity] ?? "")
    }

    /// 自定义人物: base skills (charisma, military, diplomatic, administrative; 0…100) and traits.
    public func editPerson(_ id: Int, skills: [Double], traits: [String]) -> (ok: Bool, reason: String) {
        guard let p = People.person(run, id) else { return (false, "人物不存在。") }
        guard skills.count == 4 else { return (false, "属性不完整。") }
        let keys = Array(NativeEngine.traitLabels.keys)
        let chosen = traits.compactMap { t in NativeEngine.traitLabels.first { $0.value == t }?.key ?? (keys.contains(t) ? t : nil) }.filter { People.traits[$0] != nil }
        let base = p.base.isNull ? JS.object() : p.base
        for (k, v) in zip(["charisma", "military", "diplomatic", "administrative"], skills) { base[k] = JS(min(100, max(0, v.rounded()))) }
        p.base = base
        p.traits = .array(Array(chosen.prefix(4)).map { JS($0) })
        return (true, "人物属性已修改。")
    }

    /// A war command uses the enemy state's office scope, not the central court scope.
    private func officeScope(_ index: Int, _ token: String) -> (office: String, kind: Int, scope: Int)? {
        let nations = run.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let id = nations[index].id.asString
        if Offices.central.contains(token) { return (token, 0, Offices.stateId(run, id)) }
        let parts = token.split(separator: ":")
        // 总督: "Governor:<province index>", a province the state holds.
        if parts.count == 2, parts[0] == "Governor", let p = Int(parts[1]) {
            let provinces = run.world.provinces.asArray
            guard provinces.indices.contains(p), provinces[p].controller.asString == id else { return nil }
            return ("Governor", 1, p + 1)
        }
        guard parts.count == 2, parts[0] == "WarCommander", let enemy = Int(parts[1]), nations.indices.contains(enemy),
              let war = Offices.wars(run, id).first(where: { $0.enemy == nations[enemy].id.asString }) else { return nil }
        return ("WarCommander", 2, war.scopeId)
    }

    public func editCourt(_ index: Int, key: String, value: Double) -> (ok: Bool, reason: String) {
        guard value.isFinite, run.world.nations.asArray.indices.contains(index) else { return (false, "国家或数值无效。") }
        let id = run.world.nations[index].id.asString
        if key == "governance" {
            if run.regimes.governance.isNull { run.regimes.governance = .object() }
            if value < 0 { run.regimes.governance.delete(id) }
            else { run.regimes.governance[id] = JS(min(1, value / 100)) }
            return (true, "施政已更新。")
        }
        guard key.hasPrefix("house:"), !run.nobility.isNull else { return (false, "设置不存在。") }
        let family = String(key.dropFirst(6)), ruling = run.nobility.rulingFamilies[id].optionalNumber.map { String(Int($0)) }
        guard run.nobility.families[family].nationId.optionalString == id, let ruling, family != ruling,
              !run.nobility.families[ruling].isNull else { return (false, "只能修改本国非宗室家族对宗室的关系。") }
        if run.nobility.relations[family].isNull { run.nobility.relations[family] = .object() }
        let row = run.nobility.relations[family]
        row[ruling] = JS(0)
        // relation() applies marriage, religion, geography and the ruler's charisma. Remove the
        // clamp by measuring its zero-offset result; the next read and monthly rules use this row.
        let base = Nobility.relation(run, family, ruling, bounded: false)
        row[ruling] = JS(min(100, max(-100, value)) - base)
        return (true, "家族关系已更新。")
    }

    /// 任命官员: the people who may hold a central office, ablest first (the engine's own ranking).
    public func officeCandidates(_ index: Int, office: String) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard let target = officeScope(index, office) else { return nil }
        let id = nations[index].id.asString
        var ctx = Offices.context(r, id)
        let list = Offices.candidates(&ctx, target.office, target.scope).prefix(15)
        let out = JS.array()
        for (p, score) in list {
            let v = personView(p, role: "")
            v.score = JS(score.rounded())
            out.push(v)
        }
        return Data(out.json.utf8)
    }
    /// 任命官员: puts a person into a central office (replacing its holder).
    public func appointOffice(_ index: Int, office: String, personId: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard let target = officeScope(index, office) else { return (false, "官职不存在，或战争已经结束。") }
        guard let p = People.person(r, personId), p.isAlive.asBool else { return (false, "此人已不在人世。") }
        let id = nations[index].id.asString, ctx = Offices.context(r, id)
        guard p.stateId.asInt == ctx.stateId else { return (false, "只能任命本国之人。") }
        Offices.appoint(ctx, target.office, target.kind, target.scope, personId)
        return (true, "已任命\(personView(p, role: "").name.asString)")
    }
    /// 朝廷自主任免 on or off: off keeps the player's appointments (the court no longer fills or reviews offices).
    public func setCourtManual(_ index: Int, manual: Bool) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        Offices.book(r, nations[index].id.asString).manual = JS(manual)
        return (true, manual ? "官员由你亲自任免" : "朝廷恢复自主任免")
    }

    /// 自定义国家: treasury, destiny and polity (the name follows the polity).
    public func editNation(_ index: Int, gold: Double?, destiny: Double?, polity: String?, culture: String? = nil, religion: String? = nil) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let id = nations[index].id.asString
        if let gold, !r.finance.nations[id].isNull { r.finance.nations[id].gold = JS(max(0, gold)) }
        if let destiny, !r.destiny.nations[id].isNull { r.destiny.nations[id].destiny = JS(min(100, max(0, destiny))) }
        let civ = r.civilization.nations[id]
        if let culture, !culture.isEmpty, !civ.isNull { civ.cultureId = JS(culture) }
        if let religion, !religion.isEmpty, !civ.isNull { civ.religionId = JS(religion) }
        if let polity, Regimes.titles[polity] != nil, polity != r.civilization.nations[id].polity.optionalString {
            Regimes.change(r, id, to: polity, reason: "改制")
            Government.reconcileContinuity(r)
        }
        return (true, "国家设定已修改。")
    }

    /// 自定义军团: troop strength (1…500 000), unit type and morale (0…100).
    public func editArmy(_ armyId: String, troops: Int?, unit: String?, morale: Double?) -> (ok: Bool, reason: String) {
        let r = run
        guard let a = r.world.armies.asArray.first(where: { $0.id.asString == armyId }), a.troops.asNumber > 0 else { return (false, "这支军队不存在或已覆灭。") }
        if let troops {
            let t = min(500_000, max(1, troops))
            a.troops = JS(t)
            let force = r.tactics.forces[armyId]
            if !force.isNull && (force.fullStrength.optionalNumber ?? 0) < Double(t) { force.fullStrength = JS(t) }
        }
        if let unit, UnitKinds.byKey[unit] != nil { r.units[armyId] = JS(unit) }
        if let morale { a.morale = JS(min(100, max(0, morale.rounded()))) }
        return (true, "\(a.name.asString)已整编。")
    }

    /// 自定义国名、国色: the state's name and colour (its border line follows the colour).
    public func editIdentity(_ index: Int, name: String?, color: String?) -> (ok: Bool, reason: String) {
        let nations = run.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let n = nations[index]
        if let name {
            let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (1...12).contains(t.count) else { return (false, "国名须为 1 到 12 个字。") }
            guard !nations.enumerated().contains(where: { $0.offset != index && $0.element.name.optionalString == t }) else { return (false, "已有同名国家。") }
            n.name = JS(t)
        }
        if let color {
            let hex = color.hasPrefix("#") ? String(color.dropFirst()) : color
            guard hex.count == 6, UInt32(hex, radix: 16) != nil else { return (false, "颜色格式不对。") }
            n.color = JS("#" + hex.uppercased())
        }
        return (true, "国号与国色已更改。")
    }
    /// 迁都: the capital moves to a city the state controls (core distances follow).
    public func setCapital(_ index: Int, province: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray, provinces = r.world.provinces.asArray
        guard nations.indices.contains(index), provinces.indices.contains(province) else { return (false, "国家或州郡不存在。") }
        let n = nations[index], id = n.id.asString, p = provinces[province]
        guard p.controller.optionalString == id else { return (false, "只能迁都到本国实控的州郡。") }
        guard let city = r.world.cities.asArray.first(where: { $0.provinceId.asString == p.id.asString }) else { return (false, "该州郡没有城池。") }
        n.capitalId = city.id.clone()
        Wars.reconcileCore(r)
        People.announce(r, kind: "capital", text: "\(n.name.asString)迁都\(city.name.asString)", reason: "朝廷下诏迁都。", nations: [id], province: p.id.asString)
        return (true, "已迁都\(city.name.asString)。")
    }
    /// 自定义州郡: population (and the grain that feeds it), and a manual fortress (defence 3).
    public func editProvince(_ index: Int, population: Double?, fortress: Bool?) -> (ok: Bool, reason: String) {
        let r = run, provinces = r.world.provinces.asArray
        guard provinces.indices.contains(index) else { return (false, "州郡不存在。") }
        let id = provinces[index].id.asString
        if let population, let stock = r.world.statecraft.provinces.asArray.first(where: { $0.provinceId.asString == id }) {
            stock.population = JS(min(5_000_000, max(100, population.rounded())))
        }
        if let fortress {
            let d = r.upperCombat.provinces[id]
            if !d.isNull { d.manualSet = JS(true); d.manualFortress = JS(fortress); d.locked = JS(false) }
        }
        return (true, "州郡设定已修改。")
    }
    /// 好战程度 (0.6 peaceable … 1.6 warlike), or nil for the ruler's own temper.
    public func setTemper(_ index: Int, _ value: Double?) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), !r.regimes.isNull else { return (false, "国家不存在。") }
        if r.regimes.temper.isNull { r.regimes.temper = JS.object() }
        let id = nations[index].id.asString
        if let value { r.regimes.temper[id] = JS(min(1.6, max(0.6, value))) } else { r.regimes.temper.delete(id) }
        return (true, value == nil ? "好战程度随君主性情" : "好战程度已设定")
    }
    /// 国家加成 (自定义, percent): income −50…+200, attack/defense −50…+100, growth −20…+50 a
    /// year, speed −50…+100; nil clears it. Each acts on the real rules (monthly gold, battle damage,
    /// population each month, march speed).
    public func setBonus(_ index: Int, key: String, value: Double?) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), !r.regimes.isNull, Regimes.bonusKeys.contains(key) else { return (false, "无此加成。") }
        if r.regimes.bonus.isNull { r.regimes.bonus = JS.object() }
        let id = nations[index].id.asString
        if r.regimes.bonus[id].isNull { r.regimes.bonus[id] = JS.object() }
        let range: ClosedRange<Double> = key == "income" ? -50...200 : key == "growth" ? -20...50 : -50...100
        if let value { r.regimes.bonus[id][key] = JS(min(range.upperBound, max(range.lowerBound, value.rounded()))) } else { r.regimes.bonus[id].delete(key) }
        return (true, "加成已设定。")
    }

    /// 天下规则 (自定义): sets one world rate (percent; nil restores 100).
    public func setWorldRule(_ key: String, value: Double?) -> (ok: Bool, reason: String) {
        guard let range = Regimes.ruleRanges[key] else { return (false, "无此规则。") }
        Regimes.enable(run)
        if run.regimes.world.isNull { run.regimes.world = JS.object() }
        if let value, value.isFinite { run.regimes.world[key] = JS(min(range.upperBound, max(range.lowerBound, value.rounded()))) } else { run.regimes.world.delete(key) }
        return (true, "天下规则已更改。")
    }
    /// The world rates in percent, every key present.
    public func worldRules() -> Data? {
        let o = JS.object()
        for k in Regimes.ruleKeys { o[k] = JS((Regimes.rule(run, k) * 100).rounded()) }
        return Data(o.json.utf8)
    }

    /// 整编舰队 (自定义): a fleet's name and its ships (1…10); hull, crew and stores follow the ships.
    public func editFleet(_ fleetId: String, ships: Int?, name: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.navy.isNull, let fl = Naval.fleets(r).first(where: { $0.id.asString == fleetId }), fl.status.asString != "lost" else { return (false, "这支舰队不存在或已沉没。") }
        if let name {
            let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (1...12).contains(t.count) else { return (false, "名字须为 1 到 12 个字。") }
            fl.name = JS(t)
        }
        if let ships {
            let n = min(10, max(1, ships)), old = max(1, fl.ships.asNumber)
            let condition = min(1, max(0.05, (r.maritime.hulls[fleetId].optionalNumber ?? old * 100) / (old * 100)))
            fl.ships = JS(n)
            r.maritime.hulls[fleetId] = JS((Double(n) * 100 * condition).rounded())
            fl.crew = JS(Int((Double(n) * 40 * condition).rounded(.up)))
            fl.food = JS(max(fl.food.asNumber, Double(n) * 2400))
        }
        return (true, "\(fl.name.asString)已整编。")
    }
    /// 党派 (自定义): a party's name and seats (0…100); the largest party governs.
    public func editParty(_ index: Int, party: Int, name: String?, seats: Int?) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), !r.regimes.isNull else { return (false, "国家不存在。") }
        let b = Regimes.book(r, nations[index].id.asString)
        guard !b.parties.isNull, b.parties.asArray.indices.contains(party) else { return (false, "此国没有这个党派。") }
        let p = b.parties.asArray[party]
        if let name { let t = name.trimmingCharacters(in: .whitespaces); if !t.isEmpty { p.name = JS(String(t.prefix(10))) } }
        if let seats { p.seats = JS(min(100, max(0, seats))) }
        return (true, "党派已修改。")
    }
    /// 自定义总人口、总兵力: scales every province (or every army) of the state so the total is `value`.
    public func scaleTotal(_ index: Int, key: String, value: Double) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), value >= 0 else { return (false, "数值无效。") }
        let id = nations[index].id.asString
        if key == "population" {
            let owned = Set(r.world.provinces.asArray.filter { $0.controller.optionalString == id }.map(\.id.asString))
            let rows = r.world.statecraft.provinces.asArray.filter { owned.contains($0.provinceId.asString) }
            let total = rows.reduce(0.0) { $0 + ($1.population.optionalNumber ?? 0) }
            guard total > 0, !rows.isEmpty else { return (false, "此国没有州郡。") }
            let k = min(50, max(0.02, value / total))
            for s in rows { s.population = JS(min(5_000_000, max(100, ((s.population.optionalNumber ?? 0) * k).rounded()))) }
            return (true, "总人口已改。")
        }
        let armies = r.world.armies.asArray.filter { $0.nationId.asString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
        let total = armies.reduce(0.0) { $0 + $1.troops.asNumber }
        guard total > 0 else { return (false, "此国没有军队，可在「自定义」征兵。") }
        let k = min(50, max(0.02, value / total))
        for a in armies {
            let t = min(500_000, max(1, Int((a.troops.asNumber * k).rounded())))
            a.troops = JS(t)
            let force = r.tactics.forces[a.id.asString]
            if !force.isNull && (force.fullStrength.optionalNumber ?? 0) < Double(t) { force.fullStrength = JS(t) }
        }
        return (true, "总兵力已改。")
    }
    /// 自定义人物: name and age.
    public func renamePerson(_ id: Int, first: String?, last: String?, age: Int?) -> (ok: Bool, reason: String) {
        guard let p = People.person(run, id) else { return (false, "人物不存在。") }
        if let first { let t = first.trimmingCharacters(in: .whitespaces); if !t.isEmpty { p.firstName = JS(String(t.prefix(8))) } }
        if let last { p.lastName = JS(String(last.trimmingCharacters(in: .whitespaces).prefix(8))) }
        if let age { p.age = JS(min(110, max(0, age))) }
        return (true, "人物已修改。")
    }

    /// 添加军队: a new legion of the state raised in one of its provinces.
    public func addArmy(_ index: Int, province: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray, provinces = r.world.provinces.asArray
        guard nations.indices.contains(index), provinces.indices.contains(province) else { return (false, "国家或州郡不存在。") }
        let id = nations[index].id.asString, p = provinces[province]
        guard p.controller.optionalString == id else { return (false, "只能在本国实控的州郡征兵。") }
        guard Armies.homeCells[p.id.asString] != nil else { return (false, "该州郡无法驻军。") }
        Armies.create(r, nation: id, home: p.id.asString, kind: "emergency")
        Daily.reconcileMilitaryClock(r)
        return (true, "\(p.name.asString)征募新军一支。")
    }
}
