import Foundation

/// 党派政治、家族对抗、国债与持续性天灾 (app rules; every draw is a hash of the state and the month, so a
/// world replays the same).
extension Regimes {
    // MARK: 党纲

    /// A party's line: where it stands (axis, left to right), its policies, and what they do while it governs.
    public struct Platform: Sendable {
        public let name: String, axis: Double, policies: [String]
        public var temper = 1.0, income = 0.0, destiny = 0.0, attack = 0.0, defense = 0.0, growth = 0.0, corruption = 0.0
        public var text: String {
            var out = [String]()
            if temper != 1 { out.append("开战意愿 ×\(String(format: "%.2f", temper))") }
            if income != 0 { out.append("岁入 \(income > 0 ? "+" : "")\(Int(income))%") }
            if attack != 0 { out.append("进攻 +\(Int(attack))%") }
            if defense != 0 { out.append("受伤 −\(Int(defense))%") }
            if destiny != 0 { out.append("国运每年 \(destiny > 0 ? "+" : "")\(String(format: "%.1f", destiny * 12))") }
            if growth != 0 { out.append("人口年增 +\(String(format: "%.1f", growth))%") }
            if corruption != 0 { out.append("腐化 \(corruption > 0 ? "+" : "")\(Int(corruption))") }
            return out.joined(separator: "，")
        }
    }
    static let platforms: [String: Platform] = [
        "共产主义": Platform(name: "共产主义", axis: -3, policies: ["计划经济", "土地公有", "工人委员会"], temper: 1.1, income: 4, corruption: 6),
        "社会民主": Platform(name: "社会民主", axis: -2, policies: ["福利国家", "累进税制", "工会权利"], temper: 0.9, income: -2, destiny: 0.05, growth: 0.3),
        "农民派": Platform(name: "农民派", axis: -1, policies: ["减租减息", "垦荒屯田", "乡村自治"], income: 2, growth: 0.5),
        "改革派": Platform(name: "改革派", axis: -0.5, policies: ["整顿吏治", "革新法度", "兴办学堂"], temper: 1.05, income: 3, corruption: -8),
        "自由主义": Platform(name: "自由主义", axis: 0.5, policies: ["自由贸易", "公民权利", "小政府"], temper: 0.9, income: 6),
        "商业派": Platform(name: "商业派", axis: 1, policies: ["减税通商", "开放港口", "特许公司"], temper: 0.9, income: 8, corruption: 4),
        "保守主义": Platform(name: "保守主义", axis: 1.5, policies: ["维护传统", "财政稳健", "强军守土"], temper: 0.95, destiny: 0.08, defense: 4),
        "宗教保守": Platform(name: "宗教保守", axis: 2, policies: ["政教协和", "道德立法", "传教兴学"], destiny: 0.12, growth: 0.1),
        "君主派": Platform(name: "君主派", axis: 2.2, policies: ["拥护王室", "贵族特权", "传统秩序"], destiny: 0.1),
        "军人派": Platform(name: "军人派", axis: 2.6, policies: ["军费优先", "军官干政", "扩编征兵"], temper: 1.2, income: -3, attack: 6, defense: 4),
        "民族主义": Platform(name: "民族主义", axis: 2.8, policies: ["民族统一", "关税壁垒", "扩军备战"], temper: 1.2, income: -2, attack: 5),
        "法西斯": Platform(name: "法西斯", axis: 3.5, policies: ["领袖原则", "全民动员", "对外扩张"], temper: 1.4, income: -4, destiny: -0.05, attack: 10, corruption: 8),
    ]
    /// Each party's line.
    static let partyLine: [String: String] = [
        // 通用
        "自由党": "自由主义", "保守党": "保守主义", "民主党": "社会民主", "共和党": "商业派", "进步党": "改革派", "人民党": "农民派", "国民党": "民族主义", "社会党": "社会民主",
        "工党": "社会民主", "民族党": "民族主义", "联邦党": "保守主义", "改革党": "改革派", "农民党": "农民派", "统一党": "民族主义", "立宪党": "保守主义", "公民党": "自由主义",
        "共产党": "共产主义", "社会民主党": "社会民主", "自由民主党": "自由主义", "基督教民主党": "宗教保守", "绿党": "社会民主", "保王党": "君主派", "军人党": "军人派", "法西斯党": "法西斯", "民族阵线": "民族主义",
        // 寡头与一党
        "元老派": "保守主义", "商人公会": "商业派", "贵族院派": "君主派", "将门派": "军人派", "劳动党": "共产主义", "革命党": "共产主义", "国家法西斯党": "法西斯", "纳粹党": "法西斯",
        // 中华
        "中国国民党": "民族主义", "中国共产党": "共产主义", "中国青年党": "民族主义", "民主同盟": "自由主义", "致公党": "商业派", "立宪派": "保守主义", "北洋军人派": "军人派", "农工党": "农民派",
        // 日本
        "立宪政友会": "保守主义", "立宪民政党": "自由主义", "大政翼赞会": "法西斯", "日本共产党": "共产主义", "社会大众党": "社会民主", "皇道派": "军人派",
        // 英格兰
        "辉格党": "自由主义", "托利党": "保守主义", "英国法西斯联盟": "法西斯",
        // 日耳曼
        "德国社会民主党": "社会民主", "中央党": "宗教保守", "德国共产党": "共产主义", "德国民族人民党": "民族主义", "基督教民主联盟": "宗教保守",
        // 法兰西
        "雅各宾派": "改革派", "吉伦特派": "自由主义", "正统保王派": "君主派", "激进党": "改革派", "法国共产党": "共产主义", "法兰西行动": "法西斯",
        // 意大利
        "意大利共产党": "共产主义", "天主教民主党": "宗教保守", "意大利社会党": "社会民主",
        // 斯拉夫
        "布尔什维克": "共产主义", "孟什维克": "社会民主", "社会革命党": "农民派", "立宪民主党": "自由主义", "十月党": "保守主义", "黑色百人团": "民族主义", "白军派": "军人派",
        // 阿拉伯、波斯、突厥
        "复兴党": "民族主义", "穆斯林兄弟会": "宗教保守", "华夫脱党": "自由主义", "自由军官团": "军人派", "图德党": "共产主义", "伊斯兰共和党": "宗教保守",
        "共和人民党": "改革派", "团结进步委员会": "民族主义", "祖国党": "保守主义", "正义发展党": "宗教保守",
        // 西班牙
        "长枪党": "法西斯", "共和左翼": "社会民主", "卡洛斯派": "君主派", "全国劳工联盟": "共产主义",
    ]
    /// The parties a state of this culture draws on (its own history first).
    static let partyPools: [String: [String]] = [
        "chinese": ["中国国民党", "中国共产党", "中国青年党", "民主同盟", "致公党", "立宪派", "北洋军人派", "农工党"],
        "japanese": ["立宪政友会", "立宪民政党", "大政翼赞会", "日本共产党", "社会大众党", "皇道派", "自由民主党"],
        "english": ["保守党", "自由党", "工党", "辉格党", "托利党", "英国法西斯联盟", "共产党"],
        "german": ["纳粹党", "德国社会民主党", "中央党", "德国共产党", "德国民族人民党", "自由民主党", "基督教民主联盟", "绿党"],
        "french": ["雅各宾派", "吉伦特派", "正统保王派", "激进党", "社会党", "法国共产党", "法兰西行动"],
        "italian": ["国家法西斯党", "意大利共产党", "天主教民主党", "意大利社会党", "自由党"],
        "slavic": ["布尔什维克", "孟什维克", "社会革命党", "立宪民主党", "十月党", "黑色百人团", "白军派"],
        "arab": ["复兴党", "穆斯林兄弟会", "华夫脱党", "自由军官团", "共产党"],
        "egyptian": ["华夫脱党", "穆斯林兄弟会", "自由军官团", "民族党", "共产党"],
        "persian": ["图德党", "民族阵线", "伊斯兰共和党", "复兴党", "自由党"],
        "turkic": ["共和人民党", "团结进步委员会", "祖国党", "正义发展党", "共产党"],
        "spanish": ["长枪党", "共和左翼", "卡洛斯派", "全国劳工联盟", "社会党", "自由党"],
    ]
    static let genericParties = ["自由党", "保守党", "社会民主党", "共和党", "进步党", "人民党", "民族党", "社会党", "工党", "联邦党", "改革党", "农民党", "统一党", "立宪党", "公民党",
                                 "共产党", "自由民主党", "基督教民主党", "绿党", "保王党", "军人党", "法西斯党", "民族阵线"]
    static func partyPool(_ r: JS, _ id: String) -> [String] { partyPools[r.civilization.nations[id].cultureId.optionalString ?? ""] ?? genericParties }
    public static func platform(_ party: String) -> Platform { platforms[partyLine[party] ?? "改革派"]! }
    /// The governing party's line, for a state with parties.
    static func governing(_ r: JS, _ id: String) -> Platform? {
        guard !r.regimes.isNull, !r.regimes.nations[id].isNull, !r.regimes.nations[id].parties.isNull else { return nil }
        guard let top = r.regimes.nations[id].parties.asArray.max(by: { $0.seats.asInt < $1.seats.asInt }) else { return nil }
        return platform(top.name.asString)
    }

    // MARK: 党派对抗

    static func draw(_ text: String) -> UInt32 {
        var h: UInt32 = 0x811c9dc5
        for u in text.utf8 { h = (h ^ UInt32(u)) &* 0x1000193 }
        h ^= h >> 13; h = h &* 0x5bd1e995; h ^= h >> 15
        return h
    }
    static func chance(_ text: String) -> Double { Double(draw(text)) / 4294967296 }
    /// How the country feels about its government, −1…1: lost land, an empty treasury, corruption, debt.
    static func mood(_ r: JS, _ id: String) -> Double {
        var m = 0.1
        let lost = r.world.provinces.asArray.reduce(0) { $1.legalOwner.optionalString == id && $1.controller.optionalString != id ? $0 + 1 : $0 }
        m -= min(0.8, Double(lost) / 6)
        let corruption = Finance.corruption(r, id)
        if corruption >= 40 { m -= 0.25 }
        if (r.finance.nations[id].gold.optionalNumber ?? 0) <= 0 { m -= 0.3 }
        if debtLevel(r, id) >= 2 { m -= 0.2 }
        return max(-1, min(1, m))
    }
    /// Moves seats between two parties, keeping the chamber at 100.
    private static func shift(_ list: [JS], from a: Int, to b: Int, _ n: Int) {
        let k = min(n, max(0, list[a].seats.asInt - 1))
        list[a].seats = JS(list[a].seats.asInt - k); list[b].seats = JS(list[b].seats.asInt + k)
    }
    /// A month of party politics: the government pays for bad times, enemies of the left and right fight in
    /// the streets, cabinets fall, one-party-minded governments ban their rivals, large parties split.
    static func partyMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let s = style(r, id), b = book(r, id)
        guard s.parties, s.single == nil, !b.parties.isNull, b.parties.length >= 2 else { return }
        var list = b.parties.asArray
        func order() -> [Int] { list.indices.sorted { list[$0].seats.asInt != list[$1].seats.asInt ? list[$0].seats.asInt > list[$1].seats.asInt : $0 < $1 } }
        var rank = order()
        let ruling = rank[0], opposition = rank[1], m = mood(r, id), name = n.name.asString
        func say(_ text: String, _ reason: String) { _ = People.announce(r, kind: "politics", text: text, reason: reason, nations: [id], province: nil) }
        func party(_ i: Int) -> String { list[i].name.asString }
        // The government's standing moves a seat or two every few months.
        if key % 3 == 0 {
            if m < -0.15 { shift(list, from: ruling, to: opposition, 1 + Int(-m * 3)) }
            else if m > 0.05, let small = rank.last, small != ruling { shift(list, from: small, to: ruling, 1) }
        }
        let tag = "\(id)|\(key)|party", roll = chance(tag)
        let far = list.indices.flatMap { i in list.indices.filter { j in j > i && abs(platform(party(i)).axis - platform(party(j)).axis) >= 3 && list[i].seats.asInt >= 10 && list[j].seats.asInt >= 10 }.map { (i, $0) } }
        if roll < 0.02, !far.isEmpty {
            // 街头对抗
            let (a, c) = far[Int(draw(tag + "a") % UInt32(far.count))]
            let winner = draw(tag + "w") % 2 == 0 ? a : c, loser = winner == a ? c : a
            shift(list, from: loser, to: winner, 3)
            let d = r.destiny.nations[id]
            if !d.isNull { d.destiny = JS(max(0, (d.destiny.optionalNumber ?? 0) - 1.5)) }
            say("\(name)\(party(a))与\(party(c))爆发街头冲突", "\(platform(party(a)).name)与\(platform(party(c)).name)势不两立，流血冲突后\(party(winner))声势大涨（议席 +3），国运 −1.5。")
        } else if roll < 0.05, list[ruling].seats.asInt < 50, m < -0.1 {
            // 倒阁
            shift(list, from: ruling, to: opposition, 9)
            rank = order()
            if rank[0] == opposition { say("\(name)内阁倒台，\(party(opposition))组阁", "\(party(ruling))失去议会信任，不信任案通过，\(party(opposition))（\(platform(party(opposition)).name)）上台执政。") }
            else { say("\(name)\(party(ruling))内阁险遭倒阁", "不信任案差几票未过，\(party(opposition))议席大增。") }
        } else if roll < 0.06, list[ruling].seats.asInt >= 55, ["共产主义", "法西斯"].contains(platform(party(ruling)).name), list.count >= 3 {
            // 查禁
            let axis = platform(party(ruling)).axis
            let target = list.indices.filter { $0 != ruling }.max { abs(platform(party($0)).axis - axis) < abs(platform(party($1)).axis - axis) }!
            let banned = party(target), seats = list[target].seats.asInt, head = party(ruling)
            list[ruling].seats = JS(list[ruling].seats.asInt + seats)
            list.remove(at: target)
            say("\(name)查禁\(banned)", "执政的\(head)取缔反对党，其 \(seats) 席尽归执政党。")
        } else if roll < 0.068, list[ruling].seats.asInt >= 60, list.count < 6 {
            // 分裂
            let pool = partyPool(r, id).filter { p in !list.contains { $0.name.asString == p } }
            if !pool.isEmpty {
                let fresh = pool[Int(draw(tag + "p") % UInt32(pool.count))], old = party(ruling)
                list[ruling].seats = JS(list[ruling].seats.asInt - 14)
                let x = JS.object(); x.name = JS(fresh); x.seats = JS(14); list.append(x)
                say("\(old)分裂，\(fresh)另立门户", "党内路线之争公开化，14 名议员出走，组建\(fresh)（\(platform(fresh).name)）。")
            }
        }
        b.parties = .array(list)
    }

    // MARK: 家族对抗

    static func adjustRelation(_ n: JS, _ a: String, _ b: String, _ delta: Double) {
        for (x, y) in [(a, b), (b, a)] {
            if n.relations[x].isNull { n.relations[x] = .object() }
            n.relations[x][y] = JS(max(-100, min(100, (n.relations[x][y].optionalNumber ?? 0) + delta)))
        }
    }
    /// A month among the state's great houses: feuds, marriages, struggles for power, assassinations.
    static func feudMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        guard !r.nobility.isNull, !r.nobility.families.isNull else { return }
        let houses = r.nobility.families.objectEntries.filter { $0.1.nationId.optionalString == id && !r.kin.families[$0.0].isNull }
            .sorted { ($0.1.influence.optionalNumber ?? 0) != ($1.1.influence.optionalNumber ?? 0) ? ($0.1.influence.optionalNumber ?? 0) > ($1.1.influence.optionalNumber ?? 0) : $0.0 < $1.0 }
        guard houses.count >= 2 else { return }
        let tag = "\(id)|\(key)|feud", roll = chance(tag)
        guard roll < 0.07 else { return }
        let top = Array(houses.prefix(6)), i = Int(draw(tag + "a") % UInt32(top.count))
        var j = Int(draw(tag + "b") % UInt32(top.count)); if j == i { j = (j + 1) % top.count }
        let (ka, a) = top[i], (kb, b) = top[j]
        func house(_ k: String) -> String { (r.kin.families[k].surname.optionalString ?? "无名") + "氏" }
        func say(_ text: String, _ reason: String) { _ = People.announce(r, kind: "family", text: text, reason: reason, nations: [id], province: nil) }
        let state = n.name.asString
        if roll < 0.03 {
            adjustRelation(r.nobility, ka, kb, -22)
            b.influence = JS((b.influence.optionalNumber ?? 0) * 0.93)
            say("\(state)\(house(ka))与\(house(kb))结下世仇", "两家为封地与官位反目，彼此关系 −22，\(house(kb))势力受挫。")
        } else if roll < 0.05 {
            adjustRelation(r.nobility, ka, kb, 22)
            say("\(state)\(house(ka))与\(house(kb))联姻修好", "两家结为姻亲，彼此关系 +22。")
        } else if roll < 0.065 {
            let taken = (b.influence.optionalNumber ?? 0) * 0.08
            b.influence = JS((b.influence.optionalNumber ?? 0) - taken); a.influence = JS((a.influence.optionalNumber ?? 0) + taken)
            adjustRelation(r.nobility, ka, kb, -10)
            say("\(state)\(house(ka))排挤\(house(kb))", "朝堂争权，\(house(kb))失势，势力转入\(house(ka))之手。")
        } else {
            let k = r.kin.families[kb], leader = r.people.nations[id].leaderId.optionalNumber.map { Int($0) }
            guard let head = People.person(r, k.headId.asInt), head.isAlive.asBool, head.id.asInt != leader else { return }
            let name = head.identity.name.optionalString ?? ""
            adjustRelation(r.nobility, ka, kb, -35)
            People.die(r, head, cause: "executed")
            say("\(house(kb))家主\(name)遇刺身亡", "坊间皆疑\(house(ka))所为，两家势同水火（关系 −35），家主之位由族人继承。")
        }
    }

    // MARK: 国债

    static func debt(_ r: JS, _ id: String) -> Double { r.regimes.isNull || r.regimes.debt.isNull ? 0 : r.regimes.debt[id].optionalNumber ?? 0 }
    static func setDebt(_ r: JS, _ id: String, _ v: Double) {
        if r.regimes.debt.isNull { r.regimes.debt = JS.object() }
        r.regimes.debt[id] = JS(max(0, v).rounded())
    }
    static func monthlyIncome(_ r: JS, _ id: String) -> Double { max(1, r.finance.nations[id].goldPerMonth.optionalNumber ?? 1) }
    /// Months of income owed → 0 sound, 1 strained, 2 heavy, 3 on the brink.
    static func debtLevel(_ r: JS, _ id: String) -> Int {
        let months = debt(r, id) / monthlyIncome(r, id)
        return months < 6 ? 0 : months < 18 ? 1 : months < 36 ? 2 : 3
    }
    /// The monthly rate: dearer the deeper the state is in debt.
    static func interestRate(_ r: JS, _ id: String) -> Double { min(0.03, 0.006 + debt(r, id) / monthlyIncome(r, id) * 0.0004) }
    /// A month of the debt: interest falls due, a state short of money at war borrows, a rich one repays,
    /// and one too deep goes bankrupt.
    static func debtMonth(_ r: JS, _ n: JS, _ id: String) {
        let fin = r.finance.nations[id]
        guard !fin.isNull else { return }
        let income = monthlyIncome(r, id)
        var owed = debt(r, id), gold = fin.gold.optionalNumber ?? 0
        let atWar = r.world.statecraft.relations.asArray.contains { ($0.a.asString == id || $0.b.asString == id) && $0.status.asString == "war" }
        if atWar && gold < income && owed < income * 24 {
            owed += income * 6; gold += income * 6
            _ = People.announce(r, kind: "event", text: "\(n.name.asString)举债充军费", reason: "战事吃紧，国库告罄，向商贾借银 \(Int(income * 6)) 金。", nations: [id], province: nil)
        } else if gold > income * 15 && owed > 0 {
            let pay = min(owed, income * 3)
            owed -= pay; gold -= pay
        }
        if owed > 0 {
            let interest = owed * interestRate(r, id), paid = min(max(0, gold), interest)
            gold -= paid; owed += interest - paid
        }
        // A treasury in the red is money borrowed: the deficit joins the debt instead of running on for ever.
        if gold < 0 { owed -= gold; gold = 0 }
        if owed > income * 48 {
            // 国家破产
            owed *= 0.5; gold = 0
            let d = r.destiny.nations[id]
            if !d.isNull { d.destiny = JS(max(0, (d.destiny.optionalNumber ?? 0) - 10)) }
            Finance.setCorruption(r, id, Finance.corruption(r, id) + 10)
            _ = People.announce(r, kind: "politics", text: "\(n.name.asString)国家破产", reason: "债台高筑，无力偿付：赖掉一半国债，国库清零，国运 −10，腐化 +10。", nations: [id], province: nil)
        }
        fin.gold = JS(gold.rounded()); setDebt(r, id, owed)
    }

    // MARK: 持续性天灾

    static let disasterText: [String: (name: String, effect: String)] = [
        "plague": ("瘟疫", "每月人口 −1.2%，向邻州蔓延"),
        "famine": ("饥荒", "每月人口 −0.5%，存粮减两成半"),
    ]
    /// A disaster begins in a province (nothing if that province already has one).
    static func startDisaster(_ r: JS, kind: String, province: String, months: Int) {
        if r.regimes.disasters.isNull { r.regimes.disasters = .array() }
        guard !r.regimes.disasters.asArray.contains(where: { d in d.kind.asString == kind && d.provinces.asArray.contains { $0.asString == province } }) else { return }
        let d = JS.object(); d.kind = JS(kind); d.provinces = .array([JS(province)]); d.months = JS(months)
        r.regimes.disasters.push(d)
    }
    static func disasterAt(_ r: JS, _ province: String) -> String? {
        guard !r.regimes.isNull, !r.regimes.disasters.isNull else { return nil }
        return r.regimes.disasters.asArray.first { d in d.provinces.asArray.contains { $0.asString == province } }?.kind.asString
    }
    /// Once a world-month: every disaster strikes its provinces, plagues spread to neighbours, and they burn out.
    static func disasterMonth(_ r: JS, _ key: Int) {
        guard !r.regimes.disasters.isNull, r.regimes.disasterMonth.optionalNumber != Double(key) else { return }
        r.regimes.disasterMonth = JS(key)
        var stock = [String: JS](); for s in r.world.statecraft.provinces.asArray { stock[s.provinceId.asString] = s }
        var byId = [String: JS](); for p in r.world.provinces.asArray { byId[p.id.asString] = p }
        var left = [JS]()
        for (i, d) in r.regimes.disasters.asArray.enumerated() {
            let kind = d.kind.asString, plague = kind == "plague"
            var places = d.provinces.asArray.map(\.asString)
            for p in places {
                guard let s = stock[p] else { continue }
                s.population = JS(max(100, (s.population.asNumber * (plague ? 0.988 : 0.995)).rounded()))
                if !plague { s.grain = JS((s.grain.asNumber * 0.75).rounded()) }
            }
            if plague && places.count < 12 {
                for p in places {
                    guard let at = byId[p] else { continue }
                    for q in at.neighbors.asArray.map(\.asString) where !places.contains(q) && places.count < 12 && chance("\(key)|\(i)|\(p)|\(q)") < 0.2 { places.append(q) }
                }
            }
            d.provinces = .array(places.map { JS($0) })
            d.months = JS(d.months.asInt - 1)
            if d.months.asInt > 0 { left.append(d) }
            else {
                let nations = Array(Set(places.compactMap { byId[$0]?.controller.optionalString })).sorted()
                _ = People.announce(r, kind: "event", text: (disasterText[kind]?.name ?? "天灾") + "平息", reason: "波及 \(places.count) 州，历时数月，终告结束。", nations: nations, province: nil)
            }
        }
        r.regimes.disasters = .array(left)
    }
}

extension NativeEngine {
    /// 举债 / 偿债: borrow a year's income, or pay back as much of it as the treasury allows.
    public func changeDebt(_ index: Int, borrow: Bool) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), !r.regimes.isNull else { return (false, "国家不存在。") }
        let id = nations[index].id.asString, fin = r.finance.nations[id], income = Regimes.monthlyIncome(r, id)
        let gold = fin.gold.optionalNumber ?? 0, owed = Regimes.debt(r, id)
        if borrow {
            guard owed < income * 36 else { return (false, "债台高筑，已无人肯借。") }
            let sum = (income * 12).rounded()
            fin.gold = JS(gold + sum); Regimes.setDebt(r, id, owed + sum)
            return (true, "举债 \(Int(sum)) 金。")
        }
        guard owed > 0 else { return (false, "本国没有国债。") }
        let pay = min(owed, max(0, gold))
        guard pay > 0 else { return (false, "国库空虚，无力偿债。") }
        fin.gold = JS(gold - pay); Regimes.setDebt(r, id, owed - pay)
        return (true, "偿还国债 \(Int(pay)) 金。")
    }
}
