import Foundation

/// 治乱 (app rules): what a ruler and a state's institutions are worth, the great risings that take whole
/// regions at once (after the original's 大叛乱, 复国 and 潜在复国民族), and the reforms, culture and religion
/// that fill the chronicle between wars. Every draw is a hash of the state and the month.
extension Regimes {
    // MARK: 属性的分量

    public struct Leverage: Sendable { public var attack = 0.0, defense = 0.0, income = 0.0, growth = 0.0, stability = 0.0, corruption = 0.0 }
    static var leverageCache: (world: ObjectIdentifier, day: Double, values: [String: Leverage])?
    /// What the ruler's abilities, the state's fortune, its corruption, debts and institutions add up to.
    public static func leverage(_ r: JS, _ id: String) -> Leverage {
        let day = r.world.day.optionalNumber ?? 0, world = ObjectIdentifier(r)
        if leverageCache?.world != world || leverageCache?.day != day { leverageCache = (world, day, [:]) }
        if let v = leverageCache?.values[id] { return v }
        let v = computeLeverage(r, id)
        leverageCache?.values[id] = v
        return v
    }
    private static func computeLeverage(_ r: JS, _ id: String) -> Leverage {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy else { return Leverage() }
        var mil = 50.0, adm = 50.0, cha = 50.0
        if let leader = r.people.nations[id].leaderId.optionalNumber, let p = People.person(r, Int(leader)), !p.base.isNull, p.isAlive.isTruthy {
            let s = People.skills(p)
            mil = s.military; adm = s.administrative; cha = s.charisma
        }
        // 实际掌权者: where the head of government rules, the state is run by his abilities; the head of
        // state's charisma still counts for stability (legitimacy).
        let crown = cha
        let leaderPerson = r.people.nations[id].leaderId.optionalNumber.flatMap { People.person(r, Int($0)) }
        let activePerson = governor(r, id) ?? leaderPerson
        if let g = governor(r, id) { let s = People.skills(g); mil = s.military; adm = s.administrative; cha = s.charisma }
        let fortune = r.destiny.nations[id].destiny.optionalNumber ?? 50, graft = Finance.corruption(r, id), sum = reformSum(r, id)
        let prof = styleProfile(r, id)
        let pTrait = MonarchLore.traitEffects(of: activePerson)
        let goodsBonus = Trade.nationalBonuses(r, id)
        var l = Leverage()
        l.attack = (mil - 50) * 0.8 + (fortune - 50) * 0.25 - graft * 0.15 + sum.attack + prof.attack + pTrait.attack + goodsBonus.attack
        l.defense = (mil - 50) * 0.4 + (cha - 50) * 0.2 + (fortune - 50) * 0.25 - graft * 0.1 + sum.defense + prof.defense + pTrait.defense + goodsBonus.defense
        l.income = (adm - 50) * 0.8 - graft * 0.3 + sum.income + prof.income + pTrait.income + goodsBonus.income
        l.growth = (adm - 50) * 0.1 + (cha - 50) * 0.1 + sum.growth + pTrait.growth + goodsBonus.growth
        l.corruption = sum.corruption + prof.corruption + pTrait.corruption
        _ = grit(r, id)
        let land = Double(gritCache?.counts[id] ?? 0), total = max(1, Double(gritCache?.counts.values.reduce(0, +) ?? 1))
        var owed = 0.0
        if !r.finance.nations[id].isNull { let income = max(1, monthlyIncome(r, id)); owed = min(15, debt(r, id) / income / 12 * 10) }
        l.stability = 60 + (adm - 50) * 0.35 + (crown - 50) * 0.35 + (fortune - 50) * 0.4 - graft * 0.4 - max(0, land - 10) - owed - (land / total > 0.3 ? 10 : 0) + sum.stability + prof.stability + pTrait.stability + goodsBonus.stability
        return l
    }
    static func attributeMonth(_ r: JS, _ id: String, addGold: (Double) -> Void) {
        let l = leverage(r, id)
        if l.income != 0 { addGold(l.income / 100) }
        guard l.growth != 0 else { return }
        for p in monthLand(r, id) {
            if let s = monthStock(r, p.id.asString) {
                s.population = JS(max(100, (s.population.asNumber * (1 + l.growth / 1200)).rounded()))
            }
        }
    }

    // MARK: 制度

    public struct Reform: Sendable { public let id: String, name: String; let polities: [String]?; let conflicts: [String]; public let effect: Leverage
        public var text: String {
            var parts = [String]()
            func add(_ label: String, _ v: Double, _ unit: String = "%") { if v != 0 { parts.append("\(label) \(v > 0 ? "+" : "−")\(Int(abs(v)))\(unit)") } }
            add("进攻", effect.attack); add("防御", effect.defense); add("岁入", effect.income); add("人口增长", effect.growth); add("安定", effect.stability, ""); add("腐化", effect.corruption, "")
            return parts.joined(separator: "，")
        }
    }
    public static let reforms: [Reform] = [
        Reform(id: "keju", name: "科举取士", polities: ["Kingdom", "Empire"], conflicts: ["jiupin"], effect: Leverage(income: 3, stability: 4, corruption: -5)),
        Reform(id: "jiupin", name: "九品中正", polities: ["Kingdom", "Empire"], conflicts: ["keju"], effect: Leverage(defense: 4, stability: 3, corruption: 5)),
        Reform(id: "junxian", name: "郡县制", polities: ["Kingdom", "Empire", "Republic"], conflicts: ["fengjian"], effect: Leverage(income: 5, stability: 5)),
        Reform(id: "fengjian", name: "分封诸侯", polities: ["Kingdom", "Empire", "Tribal"], conflicts: ["junxian"], effect: Leverage(defense: 8, income: -2, stability: -5)),
        Reform(id: "juntian", name: "均田令", polities: nil, conflicts: ["serf"], effect: Leverage(income: 3, growth: 4, stability: 4)),
        Reform(id: "liangshui", name: "两税法", polities: nil, conflicts: [], effect: Leverage(income: 8, corruption: 2)),
        Reform(id: "tiaobian", name: "一条鞭法", polities: nil, conflicts: [], effect: Leverage(income: 10, stability: -2)),
        Reform(id: "fubing", name: "府兵制", polities: nil, conflicts: ["mubing"], effect: Leverage(defense: 10, income: 2)),
        Reform(id: "mubing", name: "募兵制", polities: nil, conflicts: ["fubing"], effect: Leverage(attack: 10, income: -5)),
        Reform(id: "jungong", name: "军功授爵", polities: ["Kingdom", "Empire", "Tribal"], conflicts: [], effect: Leverage(attack: 12, stability: -4)),
        Reform(id: "knight", name: "骑士制度", polities: ["Kingdom", "Empire", "Theocracy"], conflicts: [], effect: Leverage(attack: 7, defense: 3)),
        Reform(id: "guild", name: "行会特许", polities: ["Republic", "Federation", "Kingdom"], conflicts: [], effect: Leverage(income: 7, corruption: 2)),
        Reform(id: "serf", name: "农奴制", polities: ["Kingdom", "Empire", "Tribal"], conflicts: ["free", "juntian"], effect: Leverage(income: 5, growth: -5, stability: -5)),
        Reform(id: "free", name: "废除奴役", polities: nil, conflicts: ["serf"], effect: Leverage(income: -3, growth: 5, stability: 5)),
        Reform(id: "parliament", name: "议会制度", polities: ["Republic", "Federation", "Kingdom"], conflicts: [], effect: Leverage(attack: -3, stability: 7, corruption: -3)),
        Reform(id: "charter", name: "大宪章", polities: ["Kingdom", "Republic", "Federation"], conflicts: [], effect: Leverage(stability: 6, corruption: -6)),
        Reform(id: "sealock", name: "海禁", polities: nil, conflicts: ["seaopen"], effect: Leverage(income: -6, stability: 5)),
        Reform(id: "seaopen", name: "开海通商", polities: nil, conflicts: ["sealock"], effect: Leverage(income: 9, corruption: 3)),
        Reform(id: "stateChurch", name: "国教制度", polities: nil, conflicts: ["secular"], effect: Leverage(defense: 4, stability: 5)),
        Reform(id: "secular", name: "政教分离", polities: ["Republic", "Federation", "Kingdom"], conflicts: ["stateChurch"], effect: Leverage(income: 4, stability: 2)),
        Reform(id: "minting", name: "统一币制", polities: nil, conflicts: [], effect: Leverage(income: 7, stability: 3, corruption: -3)),
        Reform(id: "navyAct", name: "航海条例", polities: nil, conflicts: ["sealock"], effect: Leverage(attack: 4, income: 8)),
        Reform(id: "audit", name: "御史监察", polities: nil, conflicts: [], effect: Leverage(income: 2, stability: 5, corruption: -8)),
        Reform(id: "conscription", name: "义务兵役", polities: nil, conflicts: ["fubing"], effect: Leverage(attack: 8, defense: 6, growth: -2)),
    ]
    static func heldReforms(_ r: JS, _ id: String) -> [Reform] {
        guard !r.regimes.isNull, !r.regimes.nations[id].reforms.isNull else { return [] }
        let held = Set(r.regimes.nations[id].reforms.asArray.map(\.asString))
        return reforms.filter { held.contains($0.id) }
    }
    static func reformSum(_ r: JS, _ id: String) -> Leverage {
        var s = Leverage()
        for f in heldReforms(r, id) {
            s.attack += f.effect.attack; s.defense += f.effect.defense; s.income += f.effect.income; s.growth += f.effect.growth; s.stability += f.effect.stability; s.corruption += f.effect.corruption
        }
        return s
    }
    /// Turns an institution on (those it cannot stand beside are repealed) or off.
    static func setReform(_ r: JS, _ id: String, _ f: Reform, on: Bool) {
        let b = book(r, id)
        var held = b.reforms.isNull ? [String]() : b.reforms.asArray.map(\.asString)
        held.removeAll { $0 == f.id || (on && f.conflicts.contains($0)) }
        if on { held.append(f.id) }
        b.reforms = .array(held.map { JS($0) })
    }
    static func reformMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void) {
        let tag = "\(id)|\(key)|reform"
        guard chance(tag) < 0.035 else { return }
        let polity = r.civilization.nations[id].polity.optionalString ?? "Kingdom", held = heldReforms(r, id)
        let open = reforms.filter { f in !held.contains { $0.id == f.id } && (f.polities?.contains(polity) ?? true) }
        guard !open.isEmpty else { return }
        let f = open[Int(draw(tag + "|which") % UInt32(open.count))]
        // At most five at once: the oldest gives way.
        if held.count >= 5, let oldest = book(r, id).reforms.asArray.first?.asString, let old = reforms.first(where: { $0.id == oldest }) { setReform(r, id, old, on: false) }
        let replaced = held.filter { f.conflicts.contains($0.id) }.map(\.name)
        setReform(r, id, f, on: true)
        addGold(-1)
        _ = People.announce(r, kind: "reform", text: "\(n.name.asString)推行\(f.name)", reason: (replaced.isEmpty ? "" : "废\(replaced.joined(separator: "、"))。") + "朝议既定，颁行天下，耗一月岁入：\(f.text)。", nations: [id], province: nil)
    }

    // MARK: 文化与宗教

    static func cultureMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let name = n.name.asString, tag = "\(id)|\(key)|culture"
        let land = monthLand(r, id)
        guard !land.isEmpty else { return }
        // 涵化: a province of another culture slowly takes the state's ways.
        let own = r.civilization.nations[id].cultureId.optionalString ?? ""
        if chance(tag + "|blend") < 0.06 {
            let ownedPids = Set(land.map(\.id.asString))
            let cities = r.world.cities.asArray.filter { c in ownedPids.contains(c.provinceId.asString) && r.civilization.cities[c.id.asString].cultureId.optionalString != own }
            if !cities.isEmpty {
                let c = cities[Int(draw(tag + "|city") % UInt32(cities.count))]
                r.civilization.cities[c.id.asString].cultureId = JS(own)
                _ = People.announce(r, kind: "culture", text: "\(c.name.asString)风俗渐同\(name)", reason: "移民杂处，语言衣冠日渐相同：该城文化改为本国文化，因信仰与文化而起的动乱随之减少。", nations: [id], province: c.provinceId.optionalString)
            }
        }
        guard chance(tag) < 0.05 else { return }
        func corrupt(_ d: Double) { Finance.setCorruption(r, id, Finance.corruption(r, id) + d) }
        func say(_ text: String, _ reason: String) { _ = People.announce(r, kind: "culture", text: text, reason: reason, nations: [id], province: nil) }
        switch Int(draw(tag + "|which") % 12) {
        case 0: addDestiny(2); say("\(name)诗文鼎盛", "文人辈出，名篇传诵：国运 +2。")
        case 1: addDestiny(1); corrupt(-3); say("\(name)百家争鸣", "学派林立，议论蜂起：国运 +1，腐化 −3。")
        case 2: addGold(-1); addDestiny(3); say("\(name)大修国史", "开馆修史，以正正统：耗一月岁入，国运 +3。")
        case 3: addGold(-1); corrupt(-4); say("\(name)广开书院", "兴学育才，士风一振：耗一月岁入，腐化 −4。")
        case 4: addGold(1); say("\(name)戏曲勃兴", "勾栏瓦舍，日夜笙歌：国库增一月岁入。")
        case 5: addGold(-2); addDestiny(4); say("\(name)营建宏伟宫阙", "大兴土木，四方来观：耗两月岁入，国运 +4。")
        case 6: addDestiny(1); say("\(name)颁行新历", "钦天监重定历法，农时不误：国运 +1。")
        case 7: addGold(1); addDestiny(1); say("\(name)改革文字", "书同文，政令通达：国库增一月岁入，国运 +1。")
        case 8: addDestiny(2); say("\(name)礼乐复兴", "重定礼制，朝会肃然：国运 +2。")
        case 9:
            for a in monthArmies(r, id) { a.morale = JS(min(100, a.morale.asNumber + 5)) }
            say("\(name)胡服骑射", "移风易俗，习练骑射：全军士气 +5。")
        case 10: addDestiny(-2); corrupt(3); say("\(name)奢靡成风", "竞相夸富，世风日下：国运 −2，腐化 +3。")
        default: addGold(2); addDestiny(1); say("\(name)文艺复兴", "巨匠云集，城邦争相延揽：国库增两月岁入，国运 +1。")
        }
    }

    static func religionMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let tag = "\(id)|\(key)|religion", name = n.name.asString
        guard chance(tag) < 0.04, let faith = r.civilization.nations[id].religionId.optionalString else { return }
        let land = monthLand(r, id), creed = creeds[faith]?.name ?? "本教"
        guard !land.isEmpty else { return }
        if r.regimes.faith.isNull { r.regimes.faith = .object() }
        func say(_ text: String, _ reason: String, _ p: JS? = nil) { _ = People.announce(r, kind: "religion", text: text, reason: reason, nations: [id], province: p?.id.optionalString) }
        func corrupt(_ d: Double) { Finance.setCorruption(r, id, Finance.corruption(r, id) + d) }
        let others = land.filter { provinceFaith(r, $0) != faith }, pick = Int(draw(tag + "|pick") >> 4)
        switch Int(draw(tag + "|which") % 10) {
        case 0: addGold(-1); addDestiny(3); say("\(name)大兴寺观", "敕建名刹，度僧万众：耗一月岁入，国运 +3。")
        case 1: addGold(3); addDestiny(-3); say("\(name)毁寺没产", "收寺田入官，勒僧尼还俗：国库增三月岁入，国运 −3。")
        case 2:
            for p in others.prefix(3) { r.regimes.faith[p.id.asString] = JS(faith) }
            say("\(name)传教四方", "僧侣遍行州县：至多三州改信\(creed)，异教动乱随之平息。")
        case 3:
            guard !others.isEmpty else { return }
            for p in others { r.regimes.faith[p.id.asString] = JS(faith) }
            addDestiny(-2); say("\(name)严禁异端", "捕杀邪教，焚其经卷：全国改信\(creed)，国运 −2。")
        case 4: addDestiny(2); corrupt(-2); say("\(name)高僧讲经", "万人空巷，朝野敬服：国运 +2，腐化 −2。")
        case 5:
            let p = land[pick % land.count]
            r.regimes.faith[p.id.asString] = JS("whiteLotus"); say("\(p.name.asString)秘密结社", "白莲香会暗中传习：该州信仰转为白莲教，动乱风险大增。", p)
        case 6: addGold(-1); addDestiny(2); say("\(name)遣使朝圣", "朝圣之旅往返万里：耗一月岁入，国运 +2。")
        case 7: corrupt(5); addGold(2); say("\(name)鬻牒敛财", "出卖度牒赎券，民怨沸腾：国库增两月岁入，腐化 +5。")
        case 8: addDestiny(-3); say("\(name)教门纷争", "诸派攻讦，互斥异端：国运 −3。")
        default: addDestiny(2); say("\(name)宗教宽容", "诏令诸教并存，各安其业：国运 +2。")
        }
    }

    // MARK: 大叛乱

    static let rebelLabels = ["peasant": "农民起义", "warlord": "军阀割据", "holy": "神国起义", "secession": "藩镇独立", "restoration": "复国运动"]
    static let holyNames: [String: [String]] = [
        "chineseFolk": ["太平", "黄天", "五斗米", "天师", "玄元", "天道", "太清"],
        "daoism": ["太平", "黄天", "玄都", "天师", "玉清", "紫微", "无极"],
        "quanzhen": ["全真", "玄都", "重阳", "长春"], "zhengyi": ["天师", "龙虎", "正一"],
        "whiteLotus": ["白莲", "弥勒", "龙华", "无生", "明王", "红巾"], "manichean": ["明尊", "光明", "摩尼", "明教"],
        "buddhism": ["佛", "净土", "弥勒", "法王", "莲华"], "chan": ["禅林", "菩提", "曹溪"],
        "pureLand": ["净土", "极乐", "莲邦"], "tiantai": ["天台", "法华"], "tantric": ["金刚", "香巴拉", "密宗"],
        "islam": ["圣战", "马赫迪", "绿旗", "正统", "星月"], "catholic": ["圣殿", "千年", "圣约", "圣十字", "神圣"],
        "protestant": ["再洗礼", "新耶路撒冷", "千禧", "圣约"], "orthodox": ["第三罗马", "圣山", "圣索菲亚"],
        "shinto": ["神风", "八幡", "天照", "高天原"], "hinduism": ["梵天", "湿婆", "毗湿奴", "法轮"], "zoroastrian": ["圣火", "光明", "阿胡拉"],
    ]
    private static func unusedName(_ r: JS, _ pool: [String], _ tag: String) -> String? {
        guard !pool.isEmpty else { return nil }
        let used = NamingCatalog.usedStateKeys(r)
        let start = Int(draw(tag) % UInt32(pool.count))
        return (0..<pool.count).lazy.map { pool[(start + $0) % pool.count] }.first {
            let cleaned = NamingCatalog.cleanStateBase($0)
            let key = NamingCatalog.canonicalStateKey(cleaned)
            return !cleaned.isEmpty && !used.contains(cleaned) && !used.contains(key)
        }
    }
    /// For Handover.swift (禅让): the same renaming.
    static func retitleState(_ r: JS, _ id: String, base: String?, style: String?) { retitle(r, id, base: base, style: style) }
    private static func retitle(_ r: JS, _ id: String, base: String?, style styleId: String?) {
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return }
        let c = r.civilization.nations[id], b = book(r, id)
        if let base, !base.isEmpty { c.name.value = JS(NamingCatalog.cleanStateBase(base)) }
        if let styleId, let s = styles.first(where: { $0.id == styleId }) { c.polity = JS(s.base); b.style = JS(styleId); b.parties = .null }
        let finalStyle = style(r, id)
        let culture = c.cultureId.optionalString ?? ""
        var currentBase = NamingCatalog.cleanStateBase(c.name.value.optionalString ?? MapLayers.stateLabel(n.name.asString, full: false))
        // 政体与基名现实校验：如改行现代共和/联邦/军政府而原名仍为纯朝代号，则自动更换为本文化地道地理名。
        if base == nil && b.nameTemplate.optionalString == nil && c.name.custom.isNull {
            let adapted = NamingCatalog.adaptBaseForStyle(base: currentBase, culture: culture, style: finalStyle, seed: "\(r.world.custom.seed.asString)|\(id)|\(finalStyle.id)|\(r.clock.tick.asInt)", used: NamingCatalog.usedStateKeys(r))
            if adapted != currentBase && !adapted.isEmpty {
                currentBase = adapted
                c.name.value = JS(adapted)
            }
        }
        n.name = JS(title(r, id, base: currentBase, style: finalStyle))
    }
    /// The rising's own notice says who rose and where: the routine founding line would only repeat it.
    private static func dropFoundingNotice(_ r: JS, _ name: String) {
        let founding: (JS) -> Bool = { $0.text.asString.hasPrefix(name) && $0.text.asString.contains("成立于") }
        r.chronicle.entries.asArray = r.chronicle.entries.asArray.filter { !founding($0) }
        r.world.events.asArray = r.world.events.asArray.filter { !founding($0) }
    }
    /// How many provinces a rising in this state takes with it.
    static func uprisingSize(_ r: JS, _ owner: String) -> Int {
        let land = r.world.provinces.asArray.reduce(0) { $1.controller.optionalString == owner ? $0 + 1 : $0 }
        // A rising shakes a realm without carving it in two: a fifth to over half of a great state used to go at once.
        let share = 0.1 + min(0.15, max(0, 55 - leverage(r, owner).stability) / 120)
        return max(2, min(12, Int(Double(land) * share)))
    }
    /// The land around `seed` that rises with it: connected, the owner's, never the capital.
    static func region(_ r: JS, _ owner: String, _ seed: String, _ size: Int, _ byId: [String: JS], sparing: Bool = true) -> [String] {
        let capital = sparing ? Rebellion.capitalProvince(r, owner) : nil
        var list = [seed], seen: Set<String> = [seed], i = 0
        while i < list.count && list.count < size {
            for q in byId[list[i]]?.neighbors.asArray.map(\.asString) ?? [] where !seen.contains(q) && list.count < size {
                seen.insert(q)
                if let p = byId[q], p.controller.asString == owner, q != capital { list.append(q) }
            }
            i += 1
        }
        return list
    }
    /// A rising: `seed` and the land around it leave `owner` at once for a restored state, a peasant host, a
    /// holy kingdom, a warlord or a breakaway province; the garrisons there go over and the owner goes to war.
    @discardableResult
    static func raise(_ r: JS, owner: String, seed: String, size: Int, kind wanted: String? = nil, restoring: String? = nil) -> (rebel: String, text: String)? {
        var byId = [String: JS](); for p in r.world.provinces.asArray { byId[p.id.asString] = p }
        guard !isBlank(r, owner), let p = byId[seed], p.controller.asString == owner, Rebellion.capitalProvince(r, owner) != seed,
              let city = r.world.cities.asArray.first(where: { $0.provinceId.asString == seed }) else { return nil }
        let land = region(r, owner, seed, max(1, size), byId), s = r.foundings, c = r.civilization
        let tag = "\(owner)|\(seed)|\(Int(r.clock.tick.asNumber))|rise", cityCulture = c.cities[city.id.asString].cultureId.optionalString ?? ""
        // 潜在复国民族: 优先有真实历史法理（coreMonths）且复国未超过 3 次的旧邦；无历史法理时仅以较低概率复国，杜绝同一死国（如大金）无限反复复活。
        var heirs = [String]()
        var coreHeir = false
        if restoring == nil, wanted == nil || wanted == "restoration" {
            let months = s.coreMonths[seed]
            let eligible: (String) -> Bool = { nid in
                nid != owner && !Vassals.alive(r, nid) && !isBlank(r, nid) && (r.sovereignty.restorations[nid].optionalNumber ?? 0) < 3
            }
            heirs = months.isNull ? [] : months.objectEntries.filter { $0.1.asNumber > 6 && eligible($0.0) }.map(\.0).sorted()
            if !heirs.isEmpty {
                coreHeir = true
            } else {
                heirs = r.world.nations.asArray.map(\.id.asString).filter {
                    eligible($0) && c.nations[$0].cultureId.optionalString == cityCulture
                }.sorted()
            }
        }
        let restoreProb = coreHeir ? 0.45 : 0.22
        let heir = restoring ?? (!heirs.isEmpty && (wanted == "restoration" || chance(tag + "|restore") < restoreProb) ? heirs[Int(draw(tag + "|heir") % UInt32(heirs.count))] : nil)
        if heir == nil && r.world.nations.length >= 160 { return nil }
        if wanted == "restoration" && heir == nil { return nil }
        let faith = provinceFaith(r, p) ?? "", stateFaith = c.nations[owner].religionId.optionalString ?? "", heretic = faith != stateFaith
        var kind = wanted ?? "secession"
        if wanted == nil {
            let weights: [(String, UInt32)] = [("peasant", Finance.corruption(r, owner) > 35 ? 4 : 2), ("warlord", 2), ("holy", heretic ? 5 : 1), ("secession", 3)]
            var roll = draw(tag + "|kind") % weights.reduce(0) { $0 + $1.1 }
            for (k, w) in weights { if roll < w { kind = k; break }; roll -= w }
        }
        if heir != nil { kind = "restoration" }
        let ownerName = Vassals.name(r, owner), inRegion = Set(land)
        if !r.nobility.isNull { for fam in r.nobility.families.objectValues { fam.controlledProvinces.asArray = fam.controlledProvinces.asArray.filter { !inRegion.contains($0.asString) } } }
        for q in land { RebelWar.destroyArmies(r, owner, q) }
        r.occupation.sieges.asArray = r.occupation.sieges.asArray.filter { !inRegion.contains($0.provinceId.asString) }
        let rebel: String
        if let heir {
            rebel = heir
            RebelWar.restore(r, heir, seed)
            for q in land.dropFirst() { if let x = byId[q] { PeaceBridge.transferEconomy(r, q, owner, heir); x.controller = JS(heir); x.legalOwner = JS(heir) } }
            Government.relocateLostCapitals(r); Wars.reconcileCore(r); Founding.reconcilePorts?(r)
        } else {
            rebel = Founding.foundState(r, parent: owner, provinces: land, reason: (rebelLabels[kind] ?? "叛乱") + "：\(land.count)州一同举事。").nationId.asString
            dropFoundingNotice(r, Vassals.name(r, rebel))
            switch kind {
            case "peasant":
                if cityCulture == "chinese" {
                    let dynPick = unusedName(r, NamingCatalog.dynastyPool(culture: "chinese"), tag + "|name")
                        ?? NamingCatalog.pickStateBase(culture: "chinese", mode: c.mode.optionalString ?? "historical-names", seed: tag + "|peasant", used: NamingCatalog.usedStateKeys(r), styleId: "dynasty")
                    retitle(r, rebel, base: dynPick, style: "dynasty")
                } else {
                    let regPick = unusedName(r, NamingCatalog.modernRegionStates[cityCulture] ?? [], tag + "|peasant-reg") ?? NamingCatalog.cleanStateBase(p.name.asString)
                    retitle(r, rebel, base: regPick, style: "peasant")
                }
            case "warlord":
                let regPick = unusedName(r, NamingCatalog.modernRegionStates[cityCulture] ?? [], tag + "|warlord-reg") ?? NamingCatalog.cleanStateBase(p.name.asString)
                retitle(r, rebel, base: regPick, style: "warlord")
            case "holy":
                let creed = heretic ? faith : stateFaith
                if !creed.isEmpty { c.nations[rebel].religionId = JS(creed) }
                retitle(r, rebel, base: unusedName(r, holyNames[creed] ?? ["圣火", "天启", "神谕"], tag + "|name") ?? p.name.asString, style: "holy")
            default:
                if let extra = unusedName(r, NamingCatalog.historicalExtraStates[cityCulture] ?? [], tag + "|name"), chance(tag + "|extra") < 0.6 { retitle(r, rebel, base: extra, style: nil) }
            }
        }
        let rebelName = Vassals.name(r, rebel), label = rebelLabels[kind] ?? "叛乱"
        let text = "\(ownerName)爆发\(label)，\(rebelName)据有\(land.count)州"
        _ = People.announce(r, kind: "uprising", text: text, reason: "\(p.name.asString)率先举事，邻近州郡纷纷响应，驻军倒戈；\(ownerName)调兵平叛。", nations: [owner, rebel], province: seed)
        Wars.reconcileLosses(r); Vassals.reconcileAlliances(r); DiplomacyBridge.reconcile(r); Wars.reconcileIdentities(r)
        RebelWar.startInternalWar(r, rebel: rebel, mother: owner, casusBelli: 14, legacyType: 2)
        RebelWar.spawn(r, rebel, max(3, min(30, land.count * 2)))
        Rebellion.recordNew(r, s, owner)
        return (rebel, text)
    }
    /// Once a world-month: states that have lost the people's trust come apart.
    static func uprisingsMonth(_ r: JS, _ key: Int) {
        guard !r.foundings.isNull, r.foundings.enabled.isTruthy, Rebellion.monthsSince(r, Rebellion.never) >= Tuning.current.calmMonths else { return }
        let cityPids = Set(r.world.cities.asArray.map(\.provinceId.asString))
        for n in r.world.nations.asArray {
            let id = n.id.asString
            guard monthLandCount(r, id) >= 5, !isBlank(r, id) else { continue }
            let owned = monthLand(r, id)
            let b = book(r, id)
            if let last = b.lastUprising.optionalNumber, Double(key) - last < 8 { continue }
            var calm = leverage(r, id).stability
            if isAtWar(r, id) { calm -= 6 }
            let tag = "\(id)|\(key)|uprising", risk = (max(0, 55 - calm) / 100 * 0.35 * Tuning.current.unrest + (owned.count > 20 ? 0.004 : 0)) * rule(r, "rebel")
            guard chance(tag) < risk else { continue }
            let capital = Rebellion.capitalProvince(r, id)
            var weighted = [(String, UInt32)]()
            for p in owned where p.id.asString != capital && cityPids.contains(p.id.asString) {
                let distance = r.upperCombat.provinces[p.id.asString].distance.optionalNumber ?? 1
                weighted.append((p.id.asString, UInt32(max(1, distance + 2 + Double(faithUnrest(r, p))))))
            }
            guard !weighted.isEmpty else { continue }
            var roll = draw(tag + "|seed") % weighted.reduce(0) { $0 + $1.1 }, seed = weighted[0].0
            for (q, w) in weighted { if roll < w { seed = q; break }; roll -= w }
            // An enclave cannot carry a region with it: start where the land joins up.
            var byId = [String: JS](); for p in owned { byId[p.id.asString] = p }
            if region(r, id, seed, 2, byId).count < 2, let joined = weighted.first(where: { region(r, id, $0.0, 2, byId).count >= 2 }) { seed = joined.0 }
            if raise(r, owner: id, seed: seed, size: uprisingSize(r, id)) != nil { b.lastUprising = JS(key) }
        }
    }
    /// 改朝换代: a rebel host does not stay one. Once its war is won or it holds enough land it builds a state:
    /// the peasant leader takes the throne and names a dynasty, the warlord crowns himself, hands power to
    /// a parliament or rules as dictator, the holy kingdom settles into a church state or a crown.
    static func maturityMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addDestiny: (Double) -> Void) {
        let current = style(r, id).id
        guard ["peasant", "warlord", "holy"].contains(current) else { return }
        let c = r.civilization.nations[id], tag = "\(id)|\(key)|mature", land = monthLandCount(r, id)
        let months = Rebellion.monthsSince(r, Rebellion.bornTime(r, id)), atWar = Rebellion.rebelWar(r, id) != nil
        let parent = c.parentId.optionalString, fallen = parent.map { !Vassals.alive(r, $0) } ?? false
        guard months >= 6, !atWar || land >= 8 else { return }
        guard chance(tag) < (fallen ? 0.3 : land >= 8 ? 0.16 : 0.08) else { return }
        let culture = c.cultureId.optionalString ?? "", old = n.name.asString, pick = draw(tag + "|how") % 10
        func dynasty() -> String? {
            unusedName(r, NamingCatalog.dynastyPool(culture: culture), tag + "|name")
                ?? NamingCatalog.pickStateBase(culture: culture, mode: c.mode.optionalString ?? "historical-names", seed: tag + "|mat", used: NamingCatalog.usedStateKeys(r), styleId: culture == "chinese" ? "dynasty" : nil)
        }
        let crown = land >= 10 ? (culture == "chinese" ? "dynasty" : "empire") : land >= 4 ? (culture == "chinese" ? "dynasty" : "absolute") : "principality"
        var target = crown, base = dynasty(), how = "开国建制，设官分职，改元称帝。"
        switch current {
        case "peasant":
            if pick < 2 { target = "council"; base = nil; how = "义军公议，废除旧制，推举委员治国。" }
            else { how = "义军入主，首领登基，封赏功臣，定国号、立太庙。" }
        case "warlord":
            if pick < 3 { target = "presidential"; base = nil; how = "军人交权，召开国会，选举总统，还政于民。" }
            else if pick < 5 { target = "dictatorship"; base = nil; how = "大帅废军政府，自任元首，大权独揽。" }
            else { how = "大帅黄袍加身，受百官劝进，建号开国。" }
        default:
            if pick < 4 { target = "theocracy"; base = nil; how = "教众定鼎，立教规为国法，设教廷治民。" }
            else { how = "教主还俗称帝，教团转为官僚，以世俗治国。" }
        }
        guard target != current else { return }
        retitle(r, id, base: base, style: target)
        book(r, id).parties = .null
        // 军人交权、选举总统: the general does hand over, to whoever the vote chooses.
        if target == "presidential" { seat(r, id) }
        addDestiny(5)
        _ = People.announce(r, kind: "politics", text: "\(old)改制，建立\(n.name.asString)", reason: how + "国运 +5。", nations: [id], province: nil)
    }
    /// 禅让: a failing crown is replaced by a new house under a new dynastic name, with the land unchanged.
    static func dynastyMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        if !r.foundings.isNull && !r.foundings.enabled.isTruthy { return }
        guard rule(r, "rebel") > 0, rule(r, "event") > 0 else { return }
        let polity = r.civilization.nations[id].polity.optionalString ?? "", culture = r.civilization.nations[id].cultureId.optionalString ?? "", tag = "\(id)|\(key)|mandate"
        guard polity == "Empire" || polity == "Kingdom", leverage(r, id).stability < 45, chance(tag) < 0.008 else { return }
        guard let base = unusedName(r, NamingCatalog.dynastyPool(culture: culture), tag + "|name")
                ?? NamingCatalog.pickStateBase(culture: culture, mode: r.civilization.mode.optionalString ?? "historical-names", seed: tag + "|abd", used: NamingCatalog.usedStateKeys(r), styleId: culture == "chinese" ? "dynasty" : nil) else { return }
        // The throne itself passes to another house (Handover.swift); with no other house there is no 禅让.
        _ = abdicate(r, n, id, base: base, style: culture == "chinese" ? "dynasty" : nil)
    }
    /// 禅让：王朝失道衰微时由权臣受禅改朝（其余政体复辟／神权转向均已交由 `realisticPoliticsMonth` 按现实危机条件触发）。
    static func orderMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        dynastyMonth(r, n, id, key)
    }
}

extension NativeEngine {
    private func provinceAt(_ index: Int) -> JS? { let list = run.world.provinces.asArray; return list.indices.contains(index) ? list[index] : nil }
    /// 大叛乱: this province and the land around it rise.
    public func greatRebellion(_ index: Int, size: Int, kind: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = provinceAt(index), !r.foundings.isNull else { return (false, "这个世界没有启用叛乱规则。") }
        guard let result = Regimes.raise(r, owner: p.controller.asString, seed: p.id.asString, size: max(1, min(60, size)), kind: kind) else { return (false, kind == "restoration" ? "这片土地没有可复国的旧邦。" : "都城或无城之地起不了事，请换一州。") }
        afterGlobalOrder()
        return (true, result.text)
    }
    /// 复国: a fallen state returns on this province and the land around it.
    public func restoreNation(_ index: Int, nation: Int, size: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard let p = provinceAt(index), nations.indices.contains(nation), !r.foundings.isNull else { return (false, "命令无效。") }
        let id = nations[nation].id.asString
        guard !Vassals.alive(r, id) else { return (false, "\(nations[nation].name.asString)尚未亡国。") }
        guard let result = Regimes.raise(r, owner: p.controller.asString, seed: p.id.asString, size: max(1, min(60, size)), restoring: id) else { return (false, "都城或无城之地不能复国，请换一州。") }
        afterGlobalOrder()
        return (true, result.text)
    }
    /// Starts a plague or famine here, or (kind nil) ends what is afflicting this province.
    public func provinceDisaster(_ index: Int, kind: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = provinceAt(index), !r.regimes.isNull else { return (false, "州郡不存在。") }
        let id = p.id.asString
        if let kind {
            Regimes.startDisaster(r, kind: kind, province: id, months: 6)
            return (true, "\(p.name.asString)天灾已降。")
        }
        if !r.regimes.disasters.isNull {
            for d in r.regimes.disasters.asArray { d.provinces = .array(d.provinces.asArray.filter { $0.asString != id }) }
            r.regimes.disasters = .array(r.regimes.disasters.asArray.filter { $0.provinces.length > 0 })
        }
        return (true, "\(p.name.asString)灾情已平。")
    }
    /// Removes every army standing in this province.
    public func clearArmies(_ index: Int) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = provinceAt(index) else { return (false, "州郡不存在。") }
        let id = p.id.asString, there = Set(Armies.space(r).filter { $0.province?.id.asString == id && $0.army.troops.asNumber > 0 }.map { $0.army.nationId.asString })
        guard !there.isEmpty else { return (false, "本州没有军队。") }
        for n in there.sorted() { RebelWar.destroyArmies(r, n, id) }
        afterGlobalOrder()
        return (true, "\(p.name.asString)的军队已遣散。")
    }
    public func setProvinceFaith(_ index: Int, religion: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = provinceAt(index), !r.regimes.isNull else { return (false, "州郡不存在。") }
        if r.regimes.faith.isNull { r.regimes.faith = .object() }
        r.regimes.faith[p.id.asString] = JS(religion)
        return (true, "\(p.name.asString)的信仰已更改。")
    }
    public func setProvinceGrain(_ index: Int, grain: Double) -> (ok: Bool, reason: String) {
        guard let p = provinceAt(index), let s = run.world.statecraft.provinces.asArray.first(where: { $0.provinceId.asString == p.id.asString }) else { return (false, "州郡不存在。") }
        s.grain = JS(max(0, min(50_000_000, grain.rounded())))
        return (true, "\(p.name.asString)存粮已修改。")
    }
    /// 连片划入: this province and the land joined to it (of the same owner) go to another state.
    public func grantRegion(_ index: Int, size: Int, to nation: Int) -> (ok: Bool, reason: String) {
        let provinces = run.world.provinces.asArray
        guard let p = provinceAt(index) else { return (false, "州郡不存在。") }
        var byId = [String: JS](), at = [String: Int]()
        for (i, q) in provinces.enumerated() { byId[q.id.asString] = q; at[q.id.asString] = i }
        let list = Regimes.region(run, p.controller.asString, p.id.asString, max(1, min(80, size)), byId, sparing: false)
        return territoryEdit(list.compactMap { at[$0] }, to: nation)
    }
    public func setReform(_ index: Int, reform: String, on: Bool) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), let f = Regimes.reforms.first(where: { $0.id == reform }), !r.regimes.isNull else { return (false, "制度不存在。") }
        Regimes.setReform(r, nations[index].id.asString, f, on: on)
        return (true, on ? "已颁行\(f.name)" : "已废止\(f.name)")
    }
}
