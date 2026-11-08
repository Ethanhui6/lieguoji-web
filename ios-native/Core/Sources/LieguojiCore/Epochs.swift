import Foundation

/// 兵力悬殊、冷门政权、第二批事件与人名扩充 (app rules; every draw is a hash of the state and the month).
extension Regimes {
    // MARK: 兵力悬殊

    static var armyTotals: (world: ObjectIdentifier, day: Double, troops: [String: Double])?
    /// A state's standing troops, counted once a day.
    static func troops(_ r: JS, _ id: String) -> Double {
        let day = r.world.day.optionalNumber ?? 0, world = ObjectIdentifier(r)
        if armyTotals?.world != world || armyTotals?.day != day {
            var t = [String: Double]()
            for a in (r.world.armies.isNull ? [] : r.world.armies.asArray) { if let n = a.nationId.optionalString, let v = a.troops.optionalNumber, v > 0 { t[n, default: 0] += v } }
            armyTotals = (world, day, t)
        }
        return armyTotals?.troops[id] ?? 0
    }
    /// How many of a's soldiers there are for each of b's.
    static func odds(_ r: JS, _ a: String, _ b: String) -> Double { troops(r, a) / max(1, troops(r, b)) }
    /// Damage when one side far outnumbers the other (from two to one, up to ×2.5).
    static func overwhelm(_ odds: Double) -> Double { odds > 2 ? min(2.5, pow(odds / 2, 0.4)) : 1 }
    /// Siege speed for the same (up to ×3): more men on the walls.
    static func siegeOdds(_ r: JS, _ attacker: String, _ holder: String) -> Double {
        let o = odds(r, attacker, holder)
        return o > 2 ? min(3, (o / 2).squareRoot()) : 1
    }

    // MARK: 冷门政权

    /// A state's form of government may drift to one its culture and faith suit: sultanates, shogunates,
    /// caliphates, tsardoms, khanates, merchant republics, military orders…
    static func regimeDrift(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let tag = "\(id)|\(key)|drift", roll = chance(tag)
        guard roll < 0.012 else { return }
        let civ = r.civilization.nations[id], polity = civ.polity.optionalString ?? "", culture = civ.cultureId.optionalString ?? "", faith = civ.religionId.optionalString ?? ""
        let land = r.world.provinces.asArray.reduce(0) { $1.controller.optionalString == id ? $0 + 1 : $0 }
        var list = [String]()
        switch polity {
        case "Kingdom":
            list = ["feudal", "elective", "regency", "constitutional", "principality"]
            if faith == "islam" || culture == "turkic" || culture == "arab" { list += ["sultanate", "sultanate"] }
        case "Empire":
            list = ["despotism"]
            if culture == "japanese" { list += ["shogunate", "shogunate"] }
            if culture == "slavic" { list += ["tsardom", "tsardom"] }
        case "Republic":
            list = ["parliamentary", "presidential", "oligarchic"]
            if ["italian", "dutch", "portuguese", "greek"].contains(culture) { list += ["merchant", "merchant"] }
            if land <= 6 { list.append("citystate") }
        case "Federation": list = ["confederation", "union"]
        case "Theocracy":
            if faith == "islam" { list = ["caliphate"] } else if faith == "catholic" { list = ["papacy", "order"] } else if ["tantric", "buddhism", "chan", "pureLand", "tiantai"].contains(faith) { list = ["lamaism"] } else { list = ["order", "lamaism"] }
        case "Tribal":
            list = ["chiefdom"]
            if culture == "mongol" || culture == "turkic" { list += ["khanate", "khanate"] }
        default: break
        }
        // Rarer still: a change of the whole order.
        if roll < 0.002 {
            if polity == "Kingdom" || polity == "Empire" {
                if faith == "islam" { list = ["caliphate"] } else if faith == "catholic" { list = ["papacy"] } else if faith == "tantric" { list = ["lamaism"] } else { list = ["junta", "dictatorship"] }
            } else if polity == "Republic" { list = ["dictatorship", "junta", "council"] }
        }
        let current = style(r, id).id
        list = list.filter { $0 != current }
        guard !list.isEmpty else { return }
        let target = list[Int(draw(tag + "|to") % UInt32(list.count))], old = n.name.asString
        applyStyle(r, id, target, reason: "变更国体")
        let label = styles.first { $0.id == target }?.label ?? target
        _ = People.announce(r, kind: "politics", text: "\(old)改行\(label)", reason: "时移世易，国体更张，改称\(n.name.asString)。", nations: [id], province: nil)
    }

    // MARK: 第二批事件

    static func moreEvents(_ r: JS, _ n: JS, _ id: String, _ key: Int, _ which: Int, _ pick: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let name = n.name.asString, land = r.world.provinces.asArray.filter { $0.controller.asString == id }
        guard !land.isEmpty else { return }
        let place = land[pick % land.count], pname = place.name.asString
        let mine = Set(land.map(\.id.asString))
        var stock = [String: JS](); for s in r.world.statecraft.provinces.asArray where mine.contains(s.provinceId.asString) { stock[s.provinceId.asString] = s }
        func every(_ body: (JS) -> Void) { for s in stock.values { body(s) } }
        let armies = r.world.armies.asArray.filter { $0.nationId.asString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
        func say(_ text: String, _ reason: String, _ p: JS? = nil, kind: String = "event") { _ = People.announce(r, kind: kind, text: text, reason: reason, nations: [id], province: p?.id.optionalString) }
        func corrupt(_ d: Double) { Finance.setCorruption(r, id, Finance.corruption(r, id) + d) }
        let leader = r.people.nations[id].leaderId.optionalNumber.flatMap { People.person(r, Int($0)) }
        let houses = r.nobility.isNull || r.nobility.families.isNull ? [] : r.nobility.families.objectEntries.filter { $0.1.nationId.optionalString == id }.sorted { ($0.1.influence.optionalNumber ?? 0) > ($1.1.influence.optionalNumber ?? 0) }
        let ruling = r.nobility.rulingFamilies[id].optionalNumber.map { String(Int($0)) }
        func grainPop(_ p: JS, grain: Double, people: Double) {
            guard let s = stock[p.id.asString] else { return }
            s.grain = JS((s.grain.asNumber * grain).rounded()); s.population = JS(max(100, (s.population.asNumber * people).rounded()))
        }
        func raise(_ a: JS, _ k: Double, morale: Double = 0) { a.troops = JS(max(1, (a.troops.asNumber * k).rounded(.down))); a.morale = JS(max(0, min(100, a.morale.asNumber + morale))) }
        func skill(_ p: JS, _ d: Double) { for k in ["administrative", "military", "diplomatic", "charisma"] { p.base[k] = JS(max(0, min(100, (p.base[k].optionalNumber ?? 50) + d))) } }
        switch which {
        case 0:
            for i in 0..<min(3, land.count) { grainPop(land[(pick + i) % land.count], grain: 0.7, people: 0.98) }
            say("\(pname)一带水患", "大河决口，连淹数州：受灾州郡存粮 −30%，人口 −2%。", place)
        case 1: every { $0.grain = JS(($0.grain.asNumber * 0.8).rounded()) }; say("\(name)大雪封路", "连月风雪，转运断绝：全国存粮 −20%。")
        case 2: addDestiny(-2); say("\(name)彗星经天", "星变示警，人心惶惶：国运 −2。")
        case 3: every { $0.grain = JS(($0.grain.asNumber * 1.2).rounded()) }; say("\(name)五谷丰登", "秋收大稔：全国存粮 +20%。")
        case 4: addGold(2); say("\(name)互市大开", "茶马互市，胡商云集：国库增两月岁入。")
        case 5: addGold(3); say("\(name)商路大开", "驼铃不绝，关税丰厚：国库增三月岁入。")
        case 6: addGold(-2); say("\(name)银矿枯竭", "矿脉断绝，铸钱无源：损失两月岁入。")
        case 7: for a in armies { raise(a, 1.03) }; say("\(name)军器革新", "新式甲械配发各军：全军兵力 +3%。")
        case 8: for a in armies { a.morale = JS(max(0, a.morale.asNumber - 8)) }; say("\(name)军中疫病", "营中时疫流行：全军士气 −8。")
        case 9:
            guard !armies.isEmpty else { return }
            for i in 0..<min(2, armies.count) { raise(armies[(pick + i) % armies.count], 0.85, morale: -10) }
            say("\(name)士卒逃亡", "思乡厌战，夜半逃营：两支军队兵力 −15%，士气 −10。")
        case 10:
            guard land.count >= 1, Armies.homeCells[place.id.asString] != nil else { return }
            Armies.create(r, nation: id, home: place.id.asString, kind: "emergency"); Daily.reconcileMilitaryClock(r); addGold(-1)
            say("\(pname)募兵成军", "招募乡勇，编为新军：新增一军，耗一月岁入。", place)
        case 11:
            for i in 0..<min(2, land.count) { let f = r.finance.provinces[land[(pick + i) % land.count].id.asString]; if !f.isNull { f.maxPopulation = JS((f.maxPopulation.asNumber * 1.04).rounded()) } }
            say("\(pname)屯田垦荒", "移民实边，广开阡陌：两州人口上限 +4%。", place)
        case 12: addGold(1); corrupt(-2); say("\(name)编审户口", "清查人丁，赋役得均：国库增一月岁入，腐化 −2。")
        case 13: addDestiny(-1); corrupt(2); say("\(name)大兴文字狱", "因言获罪，士人噤声：国运 −1，腐化 +2。")
        case 14: addGold(-1); corrupt(-6); say("\(name)重修律法", "颁行新律，严惩贪墨：腐化 −6，耗一月岁入。")
        case 15:
            guard let k = ruling, r.nobility.families.has(k), let rival = houses.first(where: { $0.0 != k }) else { return }
            r.nobility.families[k].influence = JS((r.nobility.families[k].influence.optionalNumber ?? 0) * 0.95)
            rival.1.influence = JS((rival.1.influence.optionalNumber ?? 0) * 1.05)
            adjustRelation(r.nobility, k, rival.0, -12)
            say("\(name)储位之争", "诸子争立，外戚干政：宗室势力 −5%，\(r.kin.families[rival.0].surname.optionalString ?? "")氏势力 +5%，两家关系 −12。", nil, kind: "family")
        case 16: addDestiny(2); corrupt(-2); say("\(name)忠臣死谏", "直言敢谏，朝野震动：国运 +2，腐化 −2。")
        case 17:
            guard let top = houses.first(where: { $0.0 != ruling }) else { return }
            top.1.influence = JS((top.1.influence.optionalNumber ?? 0) * 0.94); corrupt(-4)
            say("\(name)弹劾权贵", "御史交章弹劾\(r.kin.families[top.0].surname.optionalString ?? "")氏：该族势力 −6%，腐化 −4。", nil, kind: "family")
        case 18: addGold(-1); addDestiny(2); say("\(name)和亲修好", "遣公主远嫁，厚赠妆奁：耗一月岁入，国运 +2。")
        case 19: for a in armies { a.morale = JS(min(100, a.morale.asNumber + 5)) }; addGold(-0.3); say("\(name)边境摩擦", "戍卒与邻邦屡起冲突，军心反振：全军士气 +5，军费小增。")
        case 20: grainPop(place, grain: 0.6, people: 0.97); say("\(pname)遭蛮族寇掠", "胡骑突至，焚掠而去：本州存粮 −40%，人口 −3%。", place)
        case 21: addGold(4); say("\(name)掘得前朝宝藏", "地窖之中金银满箱：国库增四月岁入。")
        case 22:
            guard let p = leader else { return }
            skill(p, 4); say("\(name)君主励精图治", "宵衣旰食，勤于政事：君主各项能力 +4。")
        case 23:
            guard let p = leader else { return }
            skill(p, -5); addDestiny(-1); say("\(name)君主沉疴不起", "久病缠身，政事荒废：君主各项能力 −5，国运 −1。")
        case 24:
            guard let p = leader else { return }
            skill(p, -3); corrupt(6); say("\(name)君主沉湎酒色", "不理朝政，佞幸当道：君主能力 −3，腐化 +6。")
        default:
            every { $0.population = JS(($0.population.asNumber * 1.01).rounded()) }
            say("\(name)婴戏盈门", "连年无事，户口繁息：全国人口 +1%。")
        }
    }
}

// MARK: 人名扩充

extension Nobility {
    static let moreMale: [String: [String]] = [
        "japanese": "义昭 信玄 谦信 政宗 幸村 元就 光秀 利家 清正 正则 长政 胜赖 忠胜 康政 直政 景胜 兼续 宗麟 义弘 久秀".split(separator: " ").map(String.init),
        "english": "奥斯瓦尔德 埃格伯特 阿瑟尔斯坦 哈罗德 罗兰 杰弗里 西蒙 休伯特 兰斯洛特 珀西瓦尔 克拉伦斯 塞德里克 埃德蒙 奈杰尔 吉尔伯特 蒙哥马利 温斯顿 霍雷肖 奥利弗 伯特兰".split(separator: " ").map(String.init),
        "arab": "萨拉丁 哈伦 马蒙 穆阿维叶 阿里 欧麦尔 奥斯曼 哈立德 扎希尔 纳西尔 拜巴尔斯 马哈茂德 塔里克 乌萨马 贾法尔 伊德里斯 阿拔斯 法蒂玛德 阿明 穆塔西姆".split(separator: " ").map(String.init),
        "roman": "恺撒 西庇阿 格拉古 苏拉 庞培 克拉苏 安东尼 阿格里帕 图拉真 哈德良 奥勒留 君士坦丁 查士丁尼 贝利撒留 卡米卢斯 法比乌斯 马略 西塞罗 布鲁图斯 卡托".split(separator: " ").map(String.init),
        "french": "查理曼 克洛维 腓力 路易 亨利 弗朗索瓦 拿破仑 蒂雷纳 孔代 黎塞留 马扎然 罗贝尔 于格 戈弗雷 拉法耶特 内伊 缪拉 达武 贝尔纳多特 科尔贝".split(separator: " ").map(String.init),
        "german": "俾斯麦 腓特烈 奥托 康拉德 巴巴罗萨 毛奇 隆美尔 曼施坦因 瓦伦斯坦 布吕歇尔 格奈森瑙 克劳塞维茨 洛塔尔 亨里希 鲁道夫 马克西米利安 卡尔 沃尔夫冈 齐格弗里德 阿尔布雷希特".split(separator: " ").map(String.init),
        "greek": "伯里克利 地米斯托克利 亚历山大 莱桑德 阿格西劳斯 伊巴密浓达 皮洛士 梭伦 德摩斯梯尼 色诺芬 修昔底德 埃帕米农 阿尔西比亚德 托勒密 塞琉古 安提戈努斯 卡山德 利西马科斯 菲利普 狄奥多西".split(separator: " ").map(String.init),
        "persian": "居鲁士 大流士 薛西斯 阿尔达希尔 沙普尔 霍斯劳 纳迪尔 阿拔斯 伊斯梅尔 鲁斯塔姆 贾姆希德 法里东 卡姆比西斯 巴赫拉姆 库巴德 亚兹底格德 阿巴卡 卡里姆 塔赫玛斯普 萨尔贡".split(separator: " ").map(String.init),
        "slavic": "伊凡 彼得 亚历山大 德米特里 弗拉基米尔 雅罗斯拉夫 斯维亚托斯拉夫 涅夫斯基 库图佐夫 苏沃洛夫 鲍里斯 瓦西里 米哈伊尔 阿列克谢 尼古拉 康斯坦丁 伊戈尔 奥列格 留里克 波将金".split(separator: " ").map(String.init),
    ]
    static let moreFemale: [String: [String]] = [
        "japanese": "阿市 茶茶 千代 浓姬 北政所 筱 静 巴 樱 枫 葵 百合 雪 菖蒲".split(separator: " ").map(String.init),
        "english": "玛蒂尔达 埃莉诺 伊丽莎白 维多利亚 安妮 简 格温多林 罗温娜 贝雅特丽丝 奥利维亚 康斯坦斯 艾格尼丝".split(separator: " ").map(String.init),
        "arab": "法蒂玛 阿伊莎 哈蒂嘉 祖贝达 莱拉 萨菲娅 玛丽亚姆 努尔 雅斯敏 沙贾拉".split(separator: " ").map(String.init),
        "roman": "莉薇娅 阿格里皮娜 科妮莉亚 克劳迪娅 尤利娅 福尔维娅 奥克塔维娅 塞维莉娅 普罗库拉 瓦莱里娅".split(separator: " ").map(String.init),
        "french": "贞德 布朗歇 卡特琳 玛丽 约瑟芬 蓬帕杜 克洛蒂尔德 阿基坦 伊莎贝尔 吉纳维芙".split(separator: " ").map(String.init),
        "german": "玛丽亚 特蕾莎 克里姆希尔德 布伦希尔德 希尔德加德 路易丝 阿德尔海德 奥蒂莉 卡塔琳娜 索菲".split(separator: " ").map(String.init),
        "greek": "奥林匹娅丝 阿斯帕西娅 萨福 海伦 希帕蒂娅 克利奥帕特拉 伊琳娜 狄奥多拉 安娜 佐伊".split(separator: " ").map(String.init),
        "persian": "阿托莎 帕丽萨 罗克珊 普兰 阿扎尔 沙赫拉查德 蒂娜 阿米蒂斯 法兰吉丝 希琳".split(separator: " ").map(String.init),
        "slavic": "奥尔加 叶卡捷琳娜 伊丽莎白 安娜 索菲亚 塔季扬娜 娜塔莉亚 柳德米拉 薇拉 玛尔法".split(separator: " ").map(String.init),
    ]
    /// A culture's given names, with the larger list in app worlds.
    static func givenPool(_ profile: JS, _ culture: String, gender: Int) -> [JS] {
        let base = (gender == 0 ? profile.givenMale : profile.givenFemale).asArray
        guard UnitKinds.enabled else { return base }
        return base + ((gender == 0 ? moreMale : moreFemale)[culture] ?? []).map { JS($0) }
    }
}
