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
        happenings(r, n, id, key, gain: gain, addGold: addGold, addDestiny: addDestiny)
        tribute(r, n, id, gain: gain)
        coup(r, n, id, key)
        election(r, n, id, key)
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
        DeclarationEngine.nationIds = r.world.nations.asArray.map(\.id.asString)
        DeclarationEngine.temper = { id in Regimes.temper(r, id) }
        DeclarationEngine.pact = { a, b in
            let ids = DeclarationEngine.nationIds
            guard ids.indices.contains(a), ids.indices.contains(b) else { return false }
            return Regimes.treaty(r, ids[a], ids[b]) != nil
        }
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

    /// 任命官员: the people who may hold a central office, ablest first (the engine's own ranking).
    public func officeCandidates(_ index: Int, office: String) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), Offices.central.contains(office) else { return nil }
        let id = nations[index].id.asString
        var ctx = Offices.context(r, id)
        let list = Offices.candidates(&ctx, office, ctx.stateId).prefix(15)
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
        guard nations.indices.contains(index), Offices.central.contains(office) else { return (false, "官职不存在。") }
        guard let p = People.person(r, personId), p.isAlive.asBool else { return (false, "此人已不在人世。") }
        let id = nations[index].id.asString, ctx = Offices.context(r, id)
        guard p.stateId.asInt == ctx.stateId else { return (false, "只能任命本国之人。") }
        Offices.appoint(ctx, office, 0, ctx.stateId, personId)
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
        if let unit, ["Infantry", "Archer", "Shield", "Cavalry", "Elite"].contains(unit) { r.units[armyId] = JS(unit) }
        if let morale { a.morale = JS(min(100, max(0, morale.rounded()))) }
        return (true, "\(a.name.asString)已整编。")
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
