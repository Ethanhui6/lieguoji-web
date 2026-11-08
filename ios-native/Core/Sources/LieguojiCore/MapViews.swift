import Foundation

/// The original's colour views (ViewManager.ColorViewMode, culture47-views viewGroups47 /
/// provinceColors47) and statistics panel (StatisticsInfoUI, statistics47), from the Swift run.
extension NativeEngine {
    static let familyPalette = ["#dababf", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5", "#c6b9c1", "#bc80bd", "#ccebc5", "#ffed6f", "#8dd3c7", "#eb8de7", "#FF9FAF", "#68C3DB", "#F7C3C7", "#F5E14D", "#FC61B3", "#A7A7FF", "#70DB8E", "#E6B03F", "#8AB821", "#C19D83", "#ACDEC4", "#E3CDA5", "#BA7AE2", "#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"]
    static let cultureIds = ["chinese", "japanese", "english", "arab", "roman", "french", "german", "greek", "persian", "slavic", "norse", "indian", "korean", "mongol", "turkic", "egyptian", "spanish", "italian", "vietnamese", "tibetan", "hungarian", "polish", "portuguese", "dutch", "aztec", "inca"]
    static let cultureNames = ["chinese": "中华", "japanese": "日本", "english": "英格兰", "arab": "阿拉伯", "roman": "罗马", "french": "法兰西", "german": "日耳曼", "greek": "希腊", "persian": "波斯", "slavic": "斯拉夫", "norse": "北欧", "indian": "印度", "korean": "朝鲜", "mongol": "蒙古", "turkic": "突厥", "egyptian": "埃及", "spanish": "西班牙", "italian": "意大利", "vietnamese": "越南", "tibetan": "吐蕃", "hungarian": "匈牙利", "polish": "波兰", "portuguese": "葡萄牙", "dutch": "尼德兰", "aztec": "阿兹特克", "inca": "印加"]
    static let religionIds = ["none", "confucian", "quanzhen", "zhengyi", "chan", "pureLand", "tiantai", "tantric", "whiteLotus", "manichean", "nestorian", "chineseFolk", "daoism", "buddhism", "shinto", "islam", "catholic", "orthodox", "protestant", "judaism", "hinduism", "zoroastrian", "grecoRoman", "norse", "tengri", "kemetic", "aztecFaith", "incaFaith"]
    static let religionNames = ["none": "无指定宗教", "chineseFolk": "中国民间信仰", "daoism": "道教", "buddhism": "佛教", "shinto": "神道", "islam": "伊斯兰教", "catholic": "天主教", "orthodox": "东正教", "protestant": "新教", "judaism": "犹太教", "hinduism": "印度教", "zoroastrian": "祆教", "grecoRoman": "希腊罗马多神信仰", "norse": "北欧传统信仰", "tengri": "腾格里信仰", "kemetic": "古埃及信仰", "aztecFaith": "阿兹特克信仰", "incaFaith": "印加太阳信仰"]

    static func hex(_ s: String) -> Int { Int(s.dropFirst(), radix: 16) ?? 0xffffff }
    static func css(_ v: Int) -> String { String(format: "#%06x", v & 0xffffff) }
    /// familyColor47 (GetNextFamilyColor): palette colour with hue ±0.03, saturation and value ±0.05.
    static func familyColor(_ id: Int) -> String {
        let n = familyPalette.count, c = hex(familyPalette[((id % n) + n) % n])
        let r = Double(c >> 16 & 255) / 255, g = Double(c >> 8 & 255) / 255, b = Double(c & 255) / 255, mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
        var h = 0.0
        if d > 0 { h = (mx == r ? ((g - b) / d).truncatingRemainder(dividingBy: 6) : mx == g ? (b - r) / d + 2 : (r - g) / d + 4) / 6 }
        if h < 0 { h += 1 }
        var random = DotNetRandom(Int32(truncatingIfNeeded: id))
        let hh = ((h + random.nextDouble() * 0.06 - 0.03).truncatingRemainder(dividingBy: 1) + 1).truncatingRemainder(dividingBy: 1)
        let s = min(1, max(0, (mx > 0 ? d / mx : 0) + random.nextDouble() * 0.1 - 0.05)), v = min(1, max(0, mx + random.nextDouble() * 0.1 - 0.05))
        let i = Int((hh * 6).rounded(.down)), f = hh * 6 - Double(i), p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
        let rgb = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i % 6]
        return css(Int((rgb.0 * 255).rounded()) << 16 | Int((rgb.1 * 255).rounded()) << 8 | Int((rgb.2 * 255).rounded()))
    }

    /// Province fill colours and the legend of a colour view: "state", "alliance", "culture",
    /// "family", "religion". White marks a province with no group.
    public func view(_ mode: String) -> Data {
        let r = run, w = r.world, provinces = w.provinces.asArray, nations = w.nations.asArray
        var color = [String: String](); for n in nations { color[n.id.asString] = n.color.optionalString ?? "#999999" }
        var cityOf = [String: String](); for c in w.cities.asArray { cityOf[c.provinceId.asString] = c.id.asString }
        var holder = [String: String]()
        if !r.nobility.isNull { for (id, fam) in r.nobility.families.objectEntries { for p in fam.controlledProvinces.asArray { holder[p.asString] = id } } }
        var owned = [String: Int](); for p in provinces { owned[p.controller.optionalString ?? "", default: 0] += 1 }
        var fills = [String](), legend = [(key: String, name: String, color: String, count: Int)](), groupOf = [Int]()
        func add(_ key: String?, _ name: @autoclosure () -> String, _ c: @autoclosure () -> String) -> String {
            guard let key else { groupOf.append(-1); return "#ffffff" }
            if let i = legend.firstIndex(where: { $0.key == key }) { legend[i].count += 1; groupOf.append(i); return legend[i].color }
            let col = c(); groupOf.append(legend.count); legend.append((key, name(), col, 1)); return col
        }
        // A province may be held by no listed state (a fallen one): its name is then empty, never a crash.
        var names = [String: String](); for n in nations { names[n.id.asString] = n.name.optionalString ?? "" }
        func nameOf(_ id: String) -> String { names[id] ?? "" }
        // 经济: provinces by population, in five bands from sparse to teeming.
        var population = [String: Double](); for s in w.statecraft.provinces.asArray { population[s.provinceId.asString] = s.population.optionalNumber ?? 0 }
        let sortedPop = population.values.sorted()
        func band(_ v: Double) -> Int { guard !sortedPop.isEmpty else { return 0 }; let rank = sortedPop.firstIndex { $0 >= v } ?? sortedPop.count - 1; return min(4, rank * 5 / max(1, sortedPop.count)) }
        let bandNames = ["人烟稀少", "人口疏落", "人口中等", "人口稠密", "繁华富庶"], bandColors = ["#f3ead2", "#e8d29a", "#d9b25f", "#c08a3a", "#8f5a22"]
        if mode == "region" { Districts.ensure(r) }
        for p in provinces {
            let controller = p.controller.optionalString ?? ""
            switch mode {
            case "region":
                // 区域: each region in its own colour, named after its centre.
                let rid = r.regimes.regions.of[p.id.asString].optionalNumber.map { Int($0) }
                let name = rid.flatMap { i in i < r.regimes.regions.list.length ? r.regimes.regions.list[i].name.optionalString : nil } ?? ""
                fills.append(add(rid.map { "region:\($0)" }, name, Self.familyPalette[(rid ?? 0) % Self.familyPalette.count]))
            case "alliance":
                // The alliance colour is its strongest member's; every state keeps its own name.
                if let a = Vassals.allianceOf(r, controller) {
                    // The strongest member (most provinces; the first listed on a tie).
                    var strongest = controller, most = -1
                    for m in a.members.asArray { let id = m.optionalString ?? "", n = owned[id] ?? 0; if n > most { most = n; strongest = id } }
                    fills.append(add("alliance:" + (a.id.optionalString ?? ""), a.name.optionalString ?? "同盟", color[strongest] ?? "#999999"))
                } else { fills.append(add("state:" + controller, nameOf(controller), color[controller] ?? "#999999")) }
            case "culture":
                let c = cityOf[p.id.asString].flatMap { r.civilization.cities[$0].cultureId.optionalString } ?? r.civilization.nations[controller].cultureId.optionalString
                fills.append(add(c.map { "culture:" + $0 }, Self.cultureNames[c ?? ""] ?? c ?? "", Self.familyPalette[(Self.cultureIds.firstIndex(of: c ?? "") ?? 0) % Self.familyPalette.count]))
            case "religion":
                // Each province by its own faith.
                let id = Regimes.provinceFaith(r, p)
                let valid = id != nil && id != "none"
                fills.append(add(valid ? "religion:" + id! : nil, Self.religionNames[id ?? ""] ?? Regimes.creeds[id ?? ""]?.name ?? id ?? "", Self.familyPalette[((Self.religionIds.firstIndex(of: id ?? "") ?? 1) - 1 + Self.familyPalette.count) % Self.familyPalette.count]))
            case "family":
                let id = holder[p.id.asString]
                let surname = id.flatMap { r.kin.families[$0].surname.optionalString }
                fills.append(add(id.map { "family:" + $0 }, surname.map { $0 + "家族" } ?? "", Self.familyColor(Int(id ?? "0") ?? 0)))
            case "economy":
                let b = band(population[p.id.asString] ?? 0)
                fills.append(add("band:\(b)", bandNames[b], bandColors[b]))
            case "goods":
                // 特产: each province in the colour of its specialty.
                let g = Trade.of(r, p.id.asString)
                fills.append(add("good:\(g)", Trade.goods[g], Self.goodsPalette[g % Self.goodsPalette.count]))
            case "polity":
                // 政体: each state in the colour of its form of government.
                let st = r.regimes.isNull && r.civilization.nations[controller].isNull ? nil : Regimes.style(r, controller)
                let i = st.flatMap { s in Regimes.styles.firstIndex { $0.id == s.id } } ?? 0
                fills.append(add(st.map { "style:" + $0.id }, st?.label ?? "", Self.familyPalette[(i + 3) % Self.familyPalette.count]))
            default:
                fills.append(add("state:" + controller, nameOf(controller), color[controller] ?? "#999999"))
            }
        }
        let o = JS.object()
        o.fills = .array(fills.map { JS($0) })
        // The original names each group of the view instead of the states (ViewManager
        // Update*LabelsAndBorderVisibility); the alliance view keeps every state's own name.
        if mode == "culture" || mode == "family" || mode == "religion" || mode == "polity" || mode == "region" {
            o.labels = .array(labels(groupOf).asArray.compactMap { box -> JS? in
                let g = box.nation.asInt
                guard legend.indices.contains(g), !legend[g].name.isEmpty else { return nil }
                box.name = JS(legend[g].name); box.color = JS(legend[g].color); return box
            })
        }
        o.legend = .array(legend.sorted { $0.count != $1.count ? $0.count > $1.count : $0.name < $1.name }.map { e in let x = JS.object(); x.name = JS(e.name); x.color = JS(e.color); x.count = JS(e.count); return x })
        return Data(o.json.utf8)
    }

    static let goodsPalette = ["#e8c66a", "#8a6a3a", "#a07a5a", "#c99a5e", "#6f7b86", "#e9e4d8", "#c86f9a", "#6f9a5a", "#c7552f", "#5b8fc7", "#8e3b55", "#4fa3a8", "#7a5fc0", "#f0d9a8", "#b8733a"]

    /// statistics47: 国力排行, 人口排名, 经济排行, 战争统计, 宗教信息.
    public func statistics(_ category: String) -> Data {
        let r = run, w = r.world, nations = w.nations.asArray
        var population = [String: Double](); var total = 0.0
        var stock = [String: Double](); for s in w.statecraft.provinces.asArray { let v = s.population.optionalNumber ?? 0; stock[s.provinceId.asString] = v; total += v }
        for p in w.provinces.asArray { population[p.controller.asString, default: 0] += stock[p.id.asString] ?? 0 }
        let living = nations.enumerated().filter { Vassals.alive(r, $0.element.id.asString) }
        func fmt(_ v: Double) -> String {
            // Thousands separators (Linux Foundation has no formatted()).
            let n = Int(v.rounded()), digits = Array(String(abs(n)))
            var out = ""; for (i, d) in digits.enumerated() { if i > 0 && (digits.count - i) % 3 == 0 { out += "," }; out.append(d) }
            return (n < 0 ? "-" : "") + out
        }
        var rows = [(name: String, nation: Int, value: Double, text: String, color: String?)]()
        switch category {
        case "power":
            for (i, n) in living { let v = War26.strength(r, n.id.asString); rows.append((n.name.asString, i, v, String(format: "%.1f", v), n.color.optionalString)) }
        case "population":
            for (i, n) in living { let v = population[n.id.asString] ?? 0; rows.append((n.name.asString, i, v, fmt(v), n.color.optionalString)) }
        case "economy":
            for (i, n) in living { let v = r.finance.nations[n.id.asString].gold.optionalNumber ?? 0; rows.append((n.name.asString, i, v, v < 0 ? "赤字 \(fmt(-v))" : fmt(v), n.color.optionalString)) }
        case "campaigns":
            // 战役: the latest hundred, newest first; the value is the start day (the sort key).
            let list = r.regimes.isNull || r.regimes.campaigns.isNull ? [] : r.regimes.campaigns.list.asArray.suffix(100)
            for c in list {
                let start = c.start.asNumber, end = c.end.optionalNumber ?? w.day.asNumber, days = Int(max(1, end - start))
                let sides = c.states.asArray.map { Vassals.name(r, $0.asString) }.joined(separator: "、")
                let lead = c.states.length > 0 ? nations.firstIndex { $0.id.asString == c.states[0].asString } ?? -1 : -1
                rows.append((c.name.asString, lead, start, (c.end.isNull ? "进行中 · " : "") + "\(days)天 · \(c.armies.length)军 · " + sides, lead >= 0 ? nations[lead].color.optionalString : nil))
            }
        case "war":
            for rel in w.statecraft.relations.asArray where rel.status.asString == "war" {
                let days = max(0, w.day.asNumber - rel.sinceDay.asNumber)
                rows.append(("\(Vassals.name(r, rel.a.asString)) — \(Vassals.name(r, rel.b.asString))", -1, days, "第 \(Int(days)) 天", nil))
            }
        default:
            var followers = [String: Double]()
            for (_, n) in living { if let id = r.civilization.nations[n.id.asString].religionId.optionalString { followers[id, default: 0] += population[n.id.asString] ?? 0 } }
            let all = max(1, total)
            for (id, v) in followers { rows.append((Self.religionNames[id] ?? Regimes.creeds[id]?.name ?? id, -1, v, "\(fmt(v))（\(String(format: "%.1f", v / all * 100))%）", Self.familyPalette[((Self.religionIds.firstIndex(of: id) ?? 1) - 1 + Self.familyPalette.count) % Self.familyPalette.count])) }
        }
        rows.sort { $0.value != $1.value ? $0.value > $1.value : $0.name < $1.name }
        return Data(JS.array(rows.map { row in
            let x = JS.object(); x.name = JS(row.name); x.nation = JS(row.nation); x.value = JS(row.value); x.text = JS(row.text); x.color = row.color.map { JS($0) } ?? .null; return x
        }).json.utf8)
    }
}
