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
        let fortune = r.destiny.nations[id].destiny.optionalNumber ?? 50, graft = Finance.corruption(r, id), sum = reformSum(r, id)
        var l = Leverage()
        l.attack = (mil - 50) * 0.8 + (fortune - 50) * 0.25 - graft * 0.15 + sum.attack
        l.defense = (mil - 50) * 0.4 + (cha - 50) * 0.2 + (fortune - 50) * 0.25 - graft * 0.1 + sum.defense
        l.income = (adm - 50) * 0.8 - graft * 0.3 + sum.income
        l.growth = (adm - 50) * 0.1 + (cha - 50) * 0.1 + sum.growth
        l.corruption = sum.corruption
        _ = grit(r, id)
        let land = Double(gritCache?.counts[id] ?? 0), total = max(1, Double(gritCache?.counts.values.reduce(0, +) ?? 1))
        var owed = 0.0
        if !r.finance.nations[id].isNull { let income = max(1, monthlyIncome(r, id)); owed = min(15, debt(r, id) / income / 12 * 10) }
        l.stability = 60 + (adm - 50) * 0.35 + (cha - 50) * 0.35 + (fortune - 50) * 0.4 - graft * 0.4 - max(0, land - 10) - owed - (land / total > 0.3 ? 10 : 0) + sum.stability
        return l
    }
    static func attributeMonth(_ r: JS, _ id: String, addGold: (Double) -> Void) {
        let l = leverage(r, id)
        if l.income != 0 { addGold(l.income / 100) }
        guard l.growth != 0 else { return }
        let owned = Set(r.world.provinces.asArray.filter { $0.controller.optionalString == id }.map(\.id.asString))
        for s in r.world.statecraft.provinces.asArray where owned.contains(s.provinceId.asString) {
            s.population = JS(max(100, (s.population.asNumber * (1 + l.growth / 1200)).rounded()))
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
        let land = r.world.provinces.asArray.filter { $0.controller.asString == id }
        guard !land.isEmpty else { return }
        // 涵化: a province of another culture slowly takes the state's ways.
        let own = r.civilization.nations[id].cultureId.optionalString ?? ""
        if chance(tag + "|blend") < 0.06 {
            let cities = r.world.cities.asArray.filter { c in land.contains { $0.id.asString == c.provinceId.asString } && r.civilization.cities[c.id.asString].cultureId.optionalString != own }
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
            for a in r.world.armies.asArray where a.nationId.asString == id && a.troops.asNumber > 0 { a.morale = JS(min(100, a.morale.asNumber + 5)) }
            say("\(name)胡服骑射", "移风易俗，习练骑射：全军士气 +5。")
        case 10: addDestiny(-2); corrupt(3); say("\(name)奢靡成风", "竞相夸富，世风日下：国运 −2，腐化 +3。")
        default: addGold(2); addDestiny(1); say("\(name)文艺复兴", "巨匠云集，城邦争相延揽：国库增两月岁入，国运 +1。")
        }
    }

    static func religionMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let tag = "\(id)|\(key)|religion", name = n.name.asString
        guard chance(tag) < 0.04, let faith = r.civilization.nations[id].religionId.optionalString else { return }
        let land = r.world.provinces.asArray.filter { $0.controller.asString == id }, creed = creeds[faith]?.name ?? "本教"
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
    static let dynastyNames = "大顺 大西 大汉 大楚 大齐 大夏 大周 大宋 大燕 大蜀 大赵 大梁 后汉 后周 后唐 后蜀 西楚 南唐 北汉 东吴 新朝 天完 大中 大明 大元 大金 大理 南诏".split(separator: " ").map(String.init)
    static let holyNames: [String: [String]] = [
        "chineseFolk": ["太平", "黄天", "五斗米", "天师"], "daoism": ["太平", "黄天", "玄都", "天师"], "quanzhen": ["全真", "玄都"], "zhengyi": ["天师", "龙虎"],
        "whiteLotus": ["白莲", "弥勒", "龙华", "无生"], "manichean": ["明尊", "光明", "摩尼"], "buddhism": ["佛", "净土", "弥勒"], "chan": ["禅林", "菩提"], "pureLand": ["净土", "极乐"], "tiantai": ["天台"], "tantric": ["金刚", "香巴拉"],
        "islam": ["圣战", "马赫迪", "绿旗"], "catholic": ["圣殿", "千年", "圣约"], "protestant": ["再洗礼", "新耶路撒冷", "千禧"], "orthodox": ["第三罗马", "圣山"], "shinto": ["神风", "八幡"], "hinduism": ["梵天", "湿婆"], "zoroastrian": ["圣火"],
    ]
    static let moreStates: [String: [String]] = [
        "chinese": "吴越 荆楚 巴蜀 关陇 河朔 燕云 岭南 江东 中山 代 鲁 卫 陈 蔡 曹 宋 郑 韩 魏 赵 秦 晋 齐 楚 燕 越 吴 夏 商 周".split(separator: " ").map(String.init),
        "japanese": "甲斐 越后 尾张 萨摩 长州 土佐 陆奥 出羽 近江 美浓 肥后 丰后".split(separator: " ").map(String.init),
        "english": "威塞克斯 麦西亚 诺森布里亚 东盎格利亚 肯特 苏塞克斯 康沃尔 约克 兰开斯特 苏格兰 威尔士 爱尔兰".split(separator: " ").map(String.init),
        "arab": "倭马亚 阿拔斯 法蒂玛 阿尤布 马穆鲁克 穆瓦希德 穆拉比特 哈姆丹 塔希尔 萨法尔 布韦希 希贾兹".split(separator: " ").map(String.init),
        "roman": "西罗马 东罗马 高卢 不列颠尼亚 伊利里亚 达契亚 叙利亚 潘诺尼亚 阿非利加 希斯帕尼亚".split(separator: " ").map(String.init),
        "french": "勃艮第 阿基坦 诺曼底 布列塔尼 普罗旺斯 香槟 安茹 图卢兹 加斯科涅 洛林".split(separator: " ").map(String.init),
        "german": "普鲁士 巴伐利亚 萨克森 士瓦本 法兰克尼亚 汉诺威 符腾堡 黑森 勃兰登堡 奥地利 波西米亚 蒂罗尔".split(separator: " ").map(String.init),
        "greek": "马其顿 伊庇鲁斯 色雷斯 雅典 斯巴达 底比斯 尼西亚 特拉布宗 帕加马 本都".split(separator: " ").map(String.init),
        "persian": "萨珊 帕提亚 萨法维 恺加 阿契美尼德 花剌子模 塞尔柱 呼罗珊 粟特 巴克特里亚".split(separator: " ").map(String.init),
        "slavic": "基辅罗斯 莫斯科 诺夫哥罗德 弗拉基米尔 梁赞 特维尔 塞尔维亚 保加利亚 克罗地亚 摩拉维亚".split(separator: " ").map(String.init),
        "mongol": "察合台 窝阔台 伊儿 钦察 瓦剌 鞑靼 准噶尔 喀尔喀 土默特 科尔沁".split(separator: " ").map(String.init),
        "turkic": "奥斯曼 塞尔柱 葛逻禄 回鹘 突厥 哈喇 帖木儿 克里米亚 喀山 布哈拉".split(separator: " ").map(String.init),
        "indian": "孔雀 笈多 莫卧儿 朱罗 马拉塔 维查耶纳伽尔 德里 孟加拉 拉其普特 锡克".split(separator: " ").map(String.init),
        "korean": "高句丽 百济 新罗 高丽 朝鲜 渤海 加耶 后百济 泰封".split(separator: " ").map(String.init),
    ]
    private static func unusedName(_ r: JS, _ pool: [String], _ tag: String) -> String? {
        guard !pool.isEmpty else { return nil }
        let used = Set(r.civilization.nations.objectValues.compactMap { $0.name.value.optionalString })
        let start = Int(draw(tag) % UInt32(pool.count))
        return (0..<pool.count).lazy.map { pool[(start + $0) % pool.count] }.first { !used.contains($0) }
    }
    private static func retitle(_ r: JS, _ id: String, base: String?, style styleId: String?) {
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return }
        let c = r.civilization.nations[id], b = book(r, id)
        if let base { c.name.value = JS(base) }
        if let styleId, let s = styles.first(where: { $0.id == styleId }) { c.polity = JS(s.base); b.style = JS(styleId); b.parties = .null }
        n.name = JS(title(r, id, base: c.name.value.asString, style: style(r, id)))
    }
    /// The founding notice was written before the rising took its name.
    private static func renameFounding(_ r: JS, from old: String, to new: String) {
        guard old != new else { return }
        let fix: (JS) -> Void = { $0.text = JS($0.text.asString.replacingOccurrences(of: old, with: new)) }
        r.chronicle.entries.asArray.suffix(6).filter { $0.text.asString.hasPrefix(old) }.forEach(fix)
        r.world.events.asArray.suffix(6).filter { $0.text.asString.hasPrefix(old) }.forEach(fix)
    }
    /// How many provinces a rising in this state takes with it.
    static func uprisingSize(_ r: JS, _ owner: String) -> Int {
        let land = r.world.provinces.asArray.reduce(0) { $1.controller.optionalString == owner ? $0 + 1 : $0 }
        let share = 0.2 + min(0.35, max(0, 55 - leverage(r, owner).stability) / 60)
        return max(2, min(40, Int(Double(land) * share)))
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
        guard let p = byId[seed], p.controller.asString == owner, Rebellion.capitalProvince(r, owner) != seed,
              let city = r.world.cities.asArray.first(where: { $0.provinceId.asString == seed }) else { return nil }
        let land = region(r, owner, seed, max(1, size), byId), s = r.foundings, c = r.civilization
        let tag = "\(owner)|\(seed)|\(Int(r.clock.tick.asNumber))|rise", cityCulture = c.cities[city.id.asString].cultureId.optionalString ?? ""
        // 潜在复国民族: a dead state with years on this land, or of this land's people.
        var heirs = [String]()
        if restoring == nil, wanted == nil || wanted == "restoration" {
            let months = s.coreMonths[seed]
            heirs = months.isNull ? [] : months.objectEntries.filter { $0.0 != owner && $0.1.asNumber > 3 && !Vassals.alive(r, $0.0) }.map(\.0).sorted()
            if heirs.isEmpty { heirs = r.world.nations.asArray.map(\.id.asString).filter { !Vassals.alive(r, $0) && c.nations[$0].cultureId.optionalString == cityCulture }.sorted() }
        }
        let heir = restoring ?? (!heirs.isEmpty && (wanted == "restoration" || chance(tag + "|restore") < 0.55) ? heirs[Int(draw(tag + "|heir") % UInt32(heirs.count))] : nil)
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
            let foundedAs = Vassals.name(r, rebel)
            defer { renameFounding(r, from: foundedAs, to: Vassals.name(r, rebel)) }
            switch kind {
            case "peasant":
                if cityCulture == "chinese" { retitle(r, rebel, base: unusedName(r, dynastyNames, tag + "|name"), style: "dynasty") }
                else { retitle(r, rebel, base: p.name.asString, style: "peasant") }
            case "warlord": retitle(r, rebel, base: p.name.asString, style: "warlord")
            case "holy":
                let creed = heretic ? faith : stateFaith
                if !creed.isEmpty { c.nations[rebel].religionId = JS(creed) }
                retitle(r, rebel, base: unusedName(r, holyNames[creed] ?? ["圣火", "天启", "神谕"], tag + "|name") ?? p.name.asString, style: "holy")
            default:
                if let extra = unusedName(r, moreStates[cityCulture] ?? [], tag + "|name"), chance(tag + "|extra") < 0.6 { retitle(r, rebel, base: extra, style: nil) }
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
        for n in r.world.nations.asArray {
            let id = n.id.asString
            guard Vassals.alive(r, id) else { continue }
            let owned = r.world.provinces.asArray.filter { $0.controller.asString == id }
            guard owned.count >= 5 else { continue }
            let b = book(r, id)
            if let last = b.lastUprising.optionalNumber, Double(key) - last < 8 { continue }
            var calm = leverage(r, id).stability
            if r.world.statecraft.relations.asArray.contains(where: { ($0.a.asString == id || $0.b.asString == id) && $0.status.asString == "war" }) { calm -= 6 }
            let tag = "\(id)|\(key)|uprising", risk = max(0, 55 - calm) / 100 * 0.35 * Tuning.current.unrest + (owned.count > 20 ? 0.004 : 0)
            guard chance(tag) < risk else { continue }
            let capital = Rebellion.capitalProvince(r, id)
            var weighted = [(String, UInt32)]()
            for p in owned where p.id.asString != capital && r.world.cities.asArray.contains(where: { $0.provinceId.asString == p.id.asString }) {
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
        let c = r.civilization.nations[id], tag = "\(id)|\(key)|mature", land = r.world.provinces.asArray.reduce(0) { $1.controller.optionalString == id ? $0 + 1 : $0 }
        let months = Rebellion.monthsSince(r, Rebellion.bornTime(r, id)), atWar = Rebellion.rebelWar(r, id) != nil
        let parent = c.parentId.optionalString, fallen = parent.map { !Vassals.alive(r, $0) } ?? false
        guard months >= 6, !atWar || land >= 8 else { return }
        guard chance(tag) < (fallen ? 0.3 : land >= 8 ? 0.16 : 0.08) else { return }
        let culture = c.cultureId.optionalString ?? "", old = n.name.asString, pick = draw(tag + "|how") % 10
        func dynasty() -> String? { culture == "chinese" ? unusedName(r, dynastyNames, tag + "|name") : unusedName(r, moreStates[culture] ?? [], tag + "|name") }
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
        addDestiny(5)
        _ = People.announce(r, kind: "politics", text: "\(old)改制，建立\(n.name.asString)", reason: how + "国运 +5。", nations: [id], province: nil)
    }
    /// 禅让: a failing crown is replaced by a new house under a new dynastic name, with the land unchanged.
    static func dynastyMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let polity = r.civilization.nations[id].polity.optionalString ?? "", culture = r.civilization.nations[id].cultureId.optionalString ?? "", tag = "\(id)|\(key)|mandate"
        guard polity == "Empire" || polity == "Kingdom", leverage(r, id).stability < 45, chance(tag) < 0.008 else { return }
        guard let base = culture == "chinese" ? unusedName(r, dynastyNames, tag + "|name") : unusedName(r, moreStates[culture] ?? [], tag + "|name") else { return }
        let old = n.name.asString
        retitle(r, id, base: base, style: culture == "chinese" ? "dynasty" : nil)
        Finance.setCorruption(r, id, Finance.corruption(r, id) * 0.6)
        _ = People.announce(r, kind: "politics", text: "\(old)禅位，\(n.name.asString)代之", reason: "权臣逼宫，旧主逊位，新朝肃清积弊：国号更易，腐化大减。", nations: [id], province: nil)
    }
    /// 复辟 and 神权: a republic that once had a crown may take it back; a devout state may become a holy kingdom.
    static func orderMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        dynastyMonth(r, n, id, key)
        let polity = r.civilization.nations[id].polity.optionalString ?? "Kingdom", tag = "\(id)|\(key)|order", b = book(r, id)
        if polity == "Republic" || polity == "Federation", chance(tag) < 0.006 {
            guard let old = b.history.asArray.last(where: { $0.asString == "Empire" || $0.asString == "Kingdom" })?.asString else { return }
            change(r, id, to: old, reason: "复辟")
            return
        }
        if polity != "Theocracy", chance(tag + "|holy") < 0.002 {
            let was = n.name.asString
            applyStyle(r, id, "holy", reason: "神权")
            _ = People.announce(r, kind: "religion", text: "\(was)改建\(n.name.asString)", reason: "教门掌权，神职治国，君主自称受命于天。", nations: [id], province: nil)
        }
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
