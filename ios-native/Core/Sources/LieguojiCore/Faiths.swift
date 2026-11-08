import Foundation

/// 宗教（州郡信仰、教派、改宗与教乱）、政权更迭（党派夺权）和天下事件 (app rules; hash-drawn, so a world
/// replays the same).
extension Regimes {
    // MARK: 教派

    /// A faith: its family (close faiths convert into each other faster), whether the state treats it as a
    /// heresy, and what it does as a state's religion.
    public struct Creed: Sendable {
        public let name: String, family: String
        public var heresy = false
        public var temper = 1.0, income = 0.0, destiny = 0.0, attack = 0.0, defense = 0.0, growth = 0.0, corruption = 0.0
        public var text: String {
            var out = [String]()
            if temper != 1 { out.append("开战意愿 ×\(String(format: "%.2f", temper))") }
            if income != 0 { out.append("岁入 \(income > 0 ? "+" : "")\(Int(income))%") }
            if attack != 0 { out.append("进攻 +\(Int(attack))%") }
            if defense != 0 { out.append("受伤 −\(Int(defense))%") }
            if destiny != 0 { out.append("国运每年 +\(String(format: "%.1f", destiny * 12))") }
            if growth != 0 { out.append("人口年增 +\(String(format: "%.1f", growth))%") }
            if corruption != 0 { out.append("腐化 \(corruption > 0 ? "+" : "")\(Int(corruption))") }
            if heresy { out.append("信众易起事") }
            return out.isEmpty ? "无特别加成" : out.joined(separator: "，")
        }
    }
    public static let creeds: [String: Creed] = [
        // 中华诸教
        "confucian": Creed(name: "儒教", family: "华夏", temper: 0.9, destiny: 0.1, corruption: -3),
        "chineseFolk": Creed(name: "中国民间信仰", family: "华夏", growth: 0.1),
        "daoism": Creed(name: "道教", family: "道门", destiny: 0.05, growth: 0.1),
        "quanzhen": Creed(name: "全真道", family: "道门", destiny: 0.05, growth: 0.2),
        "zhengyi": Creed(name: "正一道", family: "道门", destiny: 0.08),
        "buddhism": Creed(name: "佛教", family: "释门", temper: 0.9, destiny: 0.05),
        "chan": Creed(name: "禅宗", family: "释门", temper: 0.9, income: 2),
        "pureLand": Creed(name: "净土宗", family: "释门", temper: 0.85, growth: 0.3),
        "tiantai": Creed(name: "天台宗", family: "释门", temper: 0.92, destiny: 0.06),
        "tantric": Creed(name: "藏传密宗", family: "释门", temper: 0.95, destiny: 0.1),
        "whiteLotus": Creed(name: "白莲教", family: "释门", heresy: true, temper: 1.15, growth: 0.2),
        "manichean": Creed(name: "明教", family: "光明", heresy: true, temper: 1.1, attack: 3),
        "nestorian": Creed(name: "景教", family: "基督", income: 2),
        // 世界诸教
        "shinto": Creed(name: "神道", family: "神道", defense: 4),
        "islam": Creed(name: "伊斯兰教", family: "天方", temper: 1.1, attack: 3),
        "catholic": Creed(name: "天主教", family: "基督", destiny: 0.08),
        "orthodox": Creed(name: "东正教", family: "基督", destiny: 0.06, defense: 3),
        "protestant": Creed(name: "新教", family: "基督", income: 4),
        "judaism": Creed(name: "犹太教", family: "亚伯拉罕", income: 3),
        "hinduism": Creed(name: "印度教", family: "天竺", growth: 0.3),
        "zoroastrian": Creed(name: "祆教", family: "光明", destiny: 0.05),
        "grecoRoman": Creed(name: "希腊罗马多神信仰", family: "多神", income: 2),
        "norse": Creed(name: "北欧传统信仰", family: "多神", temper: 1.2, attack: 5),
        "tengri": Creed(name: "腾格里信仰", family: "草原", temper: 1.1, attack: 4),
        "kemetic": Creed(name: "古埃及信仰", family: "多神", destiny: 0.05),
        "aztecFaith": Creed(name: "阿兹特克信仰", family: "美洲", temper: 1.2, attack: 3),
        "incaFaith": Creed(name: "印加太阳信仰", family: "美洲", growth: 0.2),
    ]
    static func stateCreed(_ r: JS, _ id: String) -> Creed? {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy, let f = r.civilization.nations[id].religionId.optionalString else { return nil }
        return creeds[f]
    }
    /// A province's own faith (its holder's until it has been given one).
    static func provinceFaith(_ r: JS, _ province: JS) -> String? {
        if !r.regimes.isNull, !r.regimes.faith.isNull, let f = r.regimes.faith[province.id.asString].optionalString { return f }
        return r.civilization.nations[province.controller.asString].religionId.optionalString
    }
    /// How much likelier a province is to rise for its faith (points on the rebellion check).
    static func faithUnrest(_ r: JS, _ province: JS) -> Int {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy, let f = provinceFaith(r, province),
              let state = r.civilization.nations[province.controller.asString].religionId.optionalString, f != state else { return 0 }
        if creeds[f]?.heresy == true { return 20 }
        return creeds[f]?.family == creeds[state]?.family ? 4 : 10
    }
    /// The sects of the Sinosphere, drawn once when the rules first run; provinces start with a scattering
    /// of neighbouring sects.
    static func faithSetup(_ r: JS) {
        guard r.regimes.faithReady.isNull else { return }
        r.regimes.faithReady = JS(true)
        if r.regimes.faith.isNull { r.regimes.faith = JS.object() }
        let seed = r.world.custom.seed.optionalString ?? ""
        func pick(_ list: [String], _ tag: String) -> String { list[Int(draw(seed + "|" + tag) % UInt32(list.count))] }
        let pools: [String: [String]] = [
            "chinese": ["confucian", "confucian", "chineseFolk", "daoism", "quanzhen", "zhengyi", "buddhism", "chan", "pureLand", "tiantai"],
            "korean": ["confucian", "confucian", "chan", "pureLand"],
            "vietnamese": ["confucian", "chan", "pureLand", "chineseFolk"],
            "japanese": ["shinto", "shinto", "chan", "pureLand", "tiantai"],
            "tibetan": ["tantric"],
        ]
        for n in r.world.nations.asArray {
            let id = n.id.asString, civ = r.civilization.nations[id]
            guard let culture = civ.cultureId.optionalString, let pool = pools[culture] else { continue }
            let creed = pick(pool, id + "|sect")
            civ.religionId = JS(creed)
            setHouses(r, id, creed)
        }
        let sinic = ["confucian", "chineseFolk", "daoism", "quanzhen", "zhengyi", "buddhism", "chan", "pureLand", "tiantai"]
        for p in r.world.provinces.asArray {
            let pid = p.id.asString, state = r.civilization.nations[p.controller.asString].religionId.optionalString ?? ""
            let scattered = sinic.contains(state) && chance(seed + "|" + pid + "|scatter") < 0.25
            r.regimes.faith[pid] = JS(scattered ? pick(sinic, pid + "|local") : state)
        }
    }
    /// The state's noble houses and their people follow its faith.
    static func setHouses(_ r: JS, _ id: String, _ creed: String) {
        guard !r.nobility.isNull, !r.nobility.families.isNull else { return }
        for (key, fam) in r.nobility.families.objectEntries where fam.nationId.optionalString == id {
            fam.religionId = JS(creed)
            for m in People.ids(r.kin.families[key].memberIds) { People.person(r, m)?.religionId = JS(creed) }
        }
    }
    /// A province rises in the name of a cause (never the capital, a battlefield, or a state's last land).
    @discardableResult
    static func rise(_ r: JS, _ owner: String, _ p: JS) -> Bool {
        let pid = p.id.asString
        guard !r.foundings.isNull, Rebellion.capitalProvince(r, owner) != pid, !Rebellion.provinceAtWar(r, pid),
              r.world.provinces.asArray.reduce(0, { $1.controller.optionalString == owner ? $0 + 1 : $0 }) >= 3 else { return false }
        return Rebellion.tryRebel(r, pid, force: true)
    }
    /// A month of a state's faith: its blessings, the slow conversion of its provinces, unity or discord,
    /// its holy land, heretic risings, and a ruler who gives up a faith few still hold.
    static func faithMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        faithSetup(r)
        guard let creedId = r.civilization.nations[id].religionId.optionalString else { return }
        let creed = creeds[creedId], name = n.name.asString
        func say(_ text: String, _ reason: String, _ p: JS? = nil) { _ = People.announce(r, kind: "religion", text: text, reason: reason, nations: [id], province: p?.id.optionalString) }
        if let creed { if creed.income != 0 { addGold(creed.income / 100) }; if creed.destiny != 0 { addDestiny(creed.destiny) } }
        let land = r.world.provinces.asArray.filter { $0.controller.asString == id }
        guard !land.isEmpty else { return }
        var count = [String: Int]()
        for p in land {
            let pid = p.id.asString
            var f = provinceFaith(r, p) ?? creedId
            if f != creedId {
                let close = creeds[f]?.family == creed?.family, rate = creeds[f]?.heresy == true ? 0.015 : close ? 0.05 : 0.02
                if chance("\(pid)|\(key)|convert") < rate { f = creedId }
                r.regimes.faith[pid] = JS(f)
            }
            count[f, default: 0] += 1
        }
        let unity = Double(count[creedId] ?? 0) / Double(land.count)
        if unity >= 0.8 { addDestiny(0.03) } else if unity < 0.5 { addDestiny(-0.1) }
        // 圣地: a state holding its faith's holy land is blessed for it.
        if let h = holyProvinces(r).first(where: { $0.religion == creedId }), r.world.provinces[h.province].controller.optionalString == id { addDestiny(0.08) }
        // 改宗: a faith almost no one in the realm still holds is given up.
        if unity < 0.3, let top = count.max(by: { $0.value != $1.value ? $0.value < $1.value : $0.key > $1.key })?.key, top != creedId, chance("\(id)|\(key)|apostasy") < 0.08 {
            r.civilization.nations[id].religionId = JS(top)
            setHouses(r, id, top)
            say("\(name)改奉\(creeds[top]?.name ?? top)", "国中信\(creed?.name ?? "旧教")者已不足三成，朝廷顺从民心，改定国教。")
            return
        }
        // 教乱: a heretic province may rise.
        for p in land where (provinceFaith(r, p).flatMap { creeds[$0]?.heresy }) == true && chance("\(p.id.asString)|\(key)|heresy") < 0.012 {
            let cult = creeds[provinceFaith(r, p)!]?.name ?? "邪教"
            if rise(r, id, p) { say("\(p.name.asString)\(cult)徒揭竿而起", "教众烧香结社，聚众起事，占据\(p.name.asString)自立。", p); return }
        }
    }

    // MARK: 政权更迭

    /// Every style the seizures can reach exists (a typo would silently do nothing).
    static func applyStyleProbe(_ r: JS, _ id: String) -> Bool { ["communist", "fascist", "nazi", "junta"].allSatisfy { s in styles.contains { $0.id == s } } }

    /// Sets a state's form of government: a change of base polity is a revolution (treasury and fortune suffer).
    static func applyStyle(_ r: JS, _ id: String, _ style: String, reason: String) {
        guard let s = styles.first(where: { $0.id == style }), let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return }
        let b = book(r, id)
        b.style = JS(style)
        if r.civilization.nations[id].polity.optionalString != s.base {
            change(r, id, to: s.base, reason: reason)
            Government.reconcileContinuity(r)
        } else {
            b.parties = .null
            n.name = JS(title(r, id, base: r.civilization.nations[id].name.value.optionalString ?? n.name.asString, style: s))
        }
    }
    /// When a state is in crisis, a strong extreme party may take it: revolution, a march on the capital, a coup.
    static func seizure(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let s = style(r, id), b = book(r, id)
        guard s.parties, s.single == nil, !b.parties.isNull, mood(r, id) < -0.3 else { return }
        let german = r.civilization.nations[id].cultureId.optionalString == "german"
        for (line, target, verb) in [("共产主义", "communist", "革命"), ("法西斯", german ? "nazi" : "fascist", "夺权"), ("军人派", "junta", "政变")] {
            guard let party = b.parties.asArray.first(where: { platform($0.name.asString).name == line && $0.seats.asInt >= 28 }), chance("\(id)|\(key)|seize|\(line)") < 0.06 else { continue }
            let who = party.name.asString, old = n.name.asString
            applyStyle(r, id, target, reason: who + verb)
            _ = People.announce(r, kind: "politics", text: "\(who)在\(old)\(verb)成功", reason: "国势危殆、民怨沸腾，手握 \(party.seats.asInt) 席的\(who)推翻旧政府，改行\(styles.first { $0.id == target }?.label ?? target)。", nations: [id], province: nil)
            return
        }
    }
    /// Unions and students: strikes cost a month's taxes and fill the left's benches.
    static func unrestMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let s = style(r, id), b = book(r, id)
        guard s.parties, s.single == nil, !b.parties.isNull, mood(r, id) < 0 else { return }
        let list = b.parties.asArray, roll = chance("\(id)|\(key)|strike")
        guard let top = list.indices.max(by: { list[$0].seats.asInt < list[$1].seats.asInt }) else { return }
        if roll < 0.05, let left = list.indices.filter({ platform(list[$0].name.asString).axis < -1 && $0 != top }).first {
            let k = min(3, max(0, list[top].seats.asInt - 1))
            list[top].seats = JS(list[top].seats.asInt - k); list[left].seats = JS(list[left].seats.asInt + k)
            addGold(-1)
            _ = People.announce(r, kind: "politics", text: "\(n.name.asString)爆发总罢工", reason: "\(list[left].name.asString)号召工人罢工：损失一月岁入，议席 +\(k)。", nations: [id], province: nil)
        } else if roll < 0.08 {
            addDestiny(-1)
            _ = People.announce(r, kind: "politics", text: "\(n.name.asString)学潮四起", reason: "青年学子上街请愿，抨击\(list[top].name.asString)：国运 −1。", nations: [id], province: nil)
        }
    }

    // MARK: 天下事件

    /// One state's chance at a month's event; each changes the game, none is only words.
    static func eventsMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let tag = "\(id)|\(key)|chronicle", roll = chance(tag)
        guard roll < 0.14 else { return }
        let which = Int(draw(tag + "|which") % 52), pick = Int(draw(tag + "|pick") >> 4), name = n.name.asString
        if which >= 26 { moreEvents(r, n, id, key, which - 26, pick, addGold: addGold, addDestiny: addDestiny); return }
        let land = r.world.provinces.asArray.filter { $0.controller.asString == id }
        guard !land.isEmpty else { return }
        let place = land[pick % land.count], pid = place.id.asString, pname = place.name.asString
        let stock = r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == pid }
        let mine = Set(land.map(\.id.asString))
        func every(_ body: (JS) -> Void) { for s in r.world.statecraft.provinces.asArray where mine.contains(s.provinceId.asString) { body(s) } }
        let armies = r.world.armies.asArray.filter { $0.nationId.asString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
        func say(_ text: String, _ reason: String, _ p: JS? = nil) { _ = People.announce(r, kind: "event", text: text, reason: reason, nations: [id], province: p?.id.optionalString) }
        func corrupt(_ d: Double) { Finance.setCorruption(r, id, Finance.corruption(r, id) + d) }
        let houses = r.nobility.isNull || r.nobility.families.isNull ? [] : r.nobility.families.objectEntries.filter { $0.1.nationId.optionalString == id }
        let ruling = r.nobility.rulingFamilies[id].optionalNumber.map { String(Int($0)) }
        switch which {
        case 0: every { $0.grain = JS(($0.grain.asNumber * 0.85).rounded()) }; addGold(-0.5); say("\(name)粮价飞涨", "奸商囤积，米贵如珠：全国存粮 −15%，平抑粮价耗半月岁入。")
        case 1: addGold(3); corrupt(6); say("\(name)铸币贬值", "朝廷滥铸劣币充实国库：国库增三月岁入，腐化 +6。")
        case 2: addGold(-1); corrupt(5); say("\(name)税吏贪墨案发", "层层侵吞：损失一月岁入，腐化 +5。")
        case 3: addGold(1); corrupt(-5); say("\(name)清丈田亩", "查出隐田，赋税得实：国库增一月岁入，腐化 −5。")
        case 4:
            let f = r.finance.provinces[pid]
            if !f.isNull { f.maxPopulation = JS((f.maxPopulation.asNumber * 1.08).rounded()) }
            addGold(-1); say("\(pname)兴修水利", "开渠引灌，沃野千里：人口上限 +8%，耗一月岁入。", place)
        case 5: place.supply = JS(min(100, (place.supply.optionalNumber ?? 0) + 5)); addDestiny(1); say("\(pname)修通驿道", "邮驿四达：本州军粮补给 +5，国运 +1。", place)
        case 6:
            let d = r.upperCombat.provinces[pid]
            if !d.isNull, let v = d.storedDefense.optionalNumber { d.storedDefense = JS(min(10, v + 1)) }
            addGold(-1); say("\(pname)增筑城防", "加高城垣，广积滚木：城防 +1 级，耗一月岁入。", place)
        case 7:
            stock?.population = JS(max(100, ((stock?.population.asNumber ?? 100) * 0.97).rounded()))
            let d = r.upperCombat.provinces[pid]
            if !d.isNull, let v = d.storedDefense.optionalNumber, v > 1 { d.storedDefense = JS(v - 1) }
            say("\(pname)大火", "烈焰连烧三日：人口 −3%，城防 −1 级。", place)
        case 8:
            guard land.count >= 2, let s = stock else { return }
            let other = land[(pick + 1) % land.count], moved = (s.population.asNumber * 0.04).rounded()
            guard let t = r.world.statecraft.provinces.asArray.first(where: { $0.provinceId.asString == other.id.asString }) else { return }
            s.population = JS(max(100, s.population.asNumber - moved)); t.population = JS(t.population.asNumber + moved)
            say("\(pname)流民迁往\(other.name.asString)", "灾民扶老携幼而去：\(Int(moved)) 人迁徙。", place)
        case 9: addGold(-0.5); say("\(name)商队遇劫", "盗匪截断商路：损失半月岁入。")
        case 10:
            guard Naval.blockade(r, id).ports > 0 else { return }
            addGold(-1); say("\(name)海盗猖獗", "沿海商船屡遭劫掠：损失一月岁入。")
        case 11:
            guard mood(r, id) < 0.05 else { return }
            if rise(r, id, place) { say("\(pname)流民起事", "饥寒交迫，啸聚山林，据\(pname)自立。", place) }
        case 12:
            guard !r.offices47.isNull, !r.offices47.nations[id].assignments.isNull else { return }
            for x in r.offices47.nations[id].assignments.asArray where x.officeId.optionalString != "Governor" { if let h = x.holderId.optionalNumber, let p = People.person(r, Int(h)) { p.base.administrative = JS(min(100, p.base.administrative.asNumber + 3)) } }
            addGold(-0.5); say("\(name)开科取士", "天下英才尽入彀中：在朝官员行政 +3，耗半月岁入。")
        case 13:
            every { $0.population = JS(($0.population.asNumber * 1.005).rounded()) }
            if !r.regimes.disasters.isNull {
                r.regimes.disasters = .array(r.regimes.disasters.asArray.filter { d in !d.provinces.asArray.contains { mine.contains($0.asString) } })
            }
            say("\(name)名医济世", "妙手回春，疫病遂止：境内瘟疫饥荒平息，人口 +0.5%。")
        case 14:
            addDestiny(-3)
            if let k = ruling, r.nobility.families.has(k) { r.nobility.families[k].influence = JS((r.nobility.families[k].influence.optionalNumber ?? 0) * 0.92) }
            say("\(name)宫闱丑闻", "内廷秽闻传遍朝野：国运 −3，宗室势力 −8%。")
        case 15:
            guard let top = houses.filter({ $0.0 != ruling }).max(by: { ($0.1.influence.optionalNumber ?? 0) < ($1.1.influence.optionalNumber ?? 0) }) else { return }
            top.1.influence = JS((top.1.influence.optionalNumber ?? 0) * 1.1); corrupt(8)
            say("\(name)权臣专擅", "\(r.kin.families[top.0].surname.optionalString ?? "")氏把持朝政，卖官鬻爵：该族势力 +10%，腐化 +8。")
        case 16: for a in armies { a.morale = JS(min(100, a.morale.asNumber + 10)) }; addGold(-1); say("\(name)犒赏三军", "赐酒肉金帛：全军士气 +10，耗一月岁入。")
        case 17:
            guard (r.finance.nations[id].gold.optionalNumber ?? 0) < monthlyIncome(r, id) * 2 else { return }
            for a in armies { a.morale = JS(max(0, a.morale.asNumber - 15)) }
            say("\(name)军饷拖欠", "国库空虚，士卒怨望：全军士气 −15。")
        case 18:
            guard !armies.isEmpty else { return }
            let a = armies[pick % armies.count]
            a.troops = JS((a.troops.asNumber * 1.15).rounded()); addGold(-0.5)
            say("\(a.name.asString)整训扩编", "精选壮勇，日夜操演：该军兵力 +15%，耗半月岁入。")
        case 19: addDestiny(-2); say("\(name)童谣四起", "「天命将改」的谶语传遍街巷：国运 −2。")
        case 20: every { $0.population = JS(($0.population.asNumber * 1.005).rounded()) }; addDestiny(2); addGold(-0.5); say("\(name)大赦天下", "减免积欠，赦宥囚徒：人口 +0.5%，国运 +2，耗半月岁入。")
        case 21: addGold(1); addDestiny(1); say("\(name)万国来朝", "远邦使节携珍宝而至：国库增一月岁入，国运 +1。")
        case 22:
            guard debtLevel(r, id) >= 2 else { return }
            every { $0.grain = JS(($0.grain.asNumber * 0.9).rounded()) }; corrupt(3); say("\(name)通货膨胀", "国债压顶，物价腾贵：全国存粮 −10%，腐化 +3。")
        case 23:
            // 法难: the state strips the temples of another faith.
            let other = land.filter { provinceFaith(r, $0) != r.civilization.nations[id].religionId.optionalString }
            guard !other.isEmpty, let state = r.civilization.nations[id].religionId.optionalString else { return }
            for p in other where chance("\(p.id.asString)|\(key)|purge") < 0.5 { r.regimes.faith[p.id.asString] = JS(state) }
            addGold(3); addDestiny(-3)
            say("\(name)毁寺灭教", "朝廷勒令异教还俗，没收庙产：国库增三月岁入，国运 −3，半数异教州郡改宗。")
        case 24:
            addGold(-2); addDestiny(4)
            let state = r.civilization.nations[id].religionId.optionalString ?? ""
            r.regimes.faith[pid] = JS(state)
            say("\(name)大兴寺观", "敕建\(creeds[state]?.name ?? "")大庙于\(pname)：耗两月岁入，国运 +4，本州皈依国教。", place)
        default:
            // 白莲东传: a heresy takes root.
            let heresy = draw(tag + "|cult") % 2 == 0 ? "whiteLotus" : "manichean"
            r.regimes.faith[pid] = JS(heresy)
            say("\(creeds[heresy]?.name ?? "")传入\(pname)", "秘密结社在乡野流传，日后恐生事端（本州易起事）。", place)
        }
    }
}

extension NativeEngine {
    /// 宗教构成: the state's provinces by faith, largest first.
    func faithShares(_ id: String) -> JS {
        let r = run
        var count = [String: Int]()
        let land = r.world.provinces.asArray.filter { $0.controller.asString == id }
        for p in land { if let f = Regimes.provinceFaith(r, p) { count[f, default: 0] += 1 } }
        return .array(count.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.map { k, v in
            let o = JS.object(); o.id = JS(k); o.name = JS(Regimes.creeds[k]?.name ?? k); o.provinces = JS(v); o.heresy = JS(Regimes.creeds[k]?.heresy == true); return o
        })
    }
}
