import Foundation

/// The original's colour views (ViewManager.ColorViewMode, culture47-views viewGroups47 /
/// provinceColors47) and statistics panel (StatisticsInfoUI, statistics47), from the Swift run.
extension NativeEngine {
    static let familyPalette = ["#dababf", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5", "#c6b9c1", "#bc80bd", "#ccebc5", "#ffed6f", "#8dd3c7", "#eb8de7", "#FF9FAF", "#68C3DB", "#F7C3C7", "#F5E14D", "#FC61B3", "#A7A7FF", "#70DB8E", "#E6B03F", "#8AB821", "#C19D83", "#ACDEC4", "#E3CDA5", "#BA7AE2", "#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"]
    static let cultureIds = ["chinese", "japanese", "english", "arab", "roman", "french", "german", "greek", "persian", "slavic", "norse", "indian"]
    static let cultureNames = ["chinese": "中华", "japanese": "日本", "english": "英格兰", "arab": "阿拉伯", "roman": "罗马", "french": "法兰西", "german": "日耳曼", "greek": "希腊", "persian": "波斯", "slavic": "斯拉夫", "norse": "北欧", "indian": "印度"]
    static let religionIds = ["none", "chineseFolk", "daoism", "buddhism", "shinto", "islam", "catholic", "orthodox", "protestant", "judaism", "hinduism", "zoroastrian", "grecoRoman", "norse"]
    static let religionNames = ["none": "无指定宗教", "chineseFolk": "中国民间信仰", "daoism": "道教", "buddhism": "佛教", "shinto": "神道", "islam": "伊斯兰教", "catholic": "天主教", "orthodox": "东正教", "protestant": "新教", "judaism": "犹太教", "hinduism": "印度教", "zoroastrian": "祆教", "grecoRoman": "希腊罗马多神信仰", "norse": "北欧传统信仰"]

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
        var owned = [String: Int](); for p in provinces { owned[p.controller.asString, default: 0] += 1 }
        var fills = [String](), legend = [(key: String, name: String, color: String, count: Int)]()
        func add(_ key: String?, _ name: @autoclosure () -> String, _ c: @autoclosure () -> String) -> String {
            guard let key else { return "#ffffff" }
            if let i = legend.firstIndex(where: { $0.key == key }) { legend[i].count += 1; return legend[i].color }
            let col = c(); legend.append((key, name(), col, 1)); return col
        }
        for p in provinces {
            let controller = p.controller.asString
            switch mode {
            case "alliance":
                // The alliance colour is its strongest member's; every state keeps its own name.
                if let a = Vassals.allianceOf(r, controller) {
                    let strongest = a.members.asArray.map(\.asString).enumerated().sorted { (owned[$0.element] ?? 0) != (owned[$1.element] ?? 0) ? (owned[$0.element] ?? 0) > (owned[$1.element] ?? 0) : $0.offset < $1.offset }.first?.element ?? controller
                    fills.append(add("alliance:" + a.id.asString, a.name.asString, color[strongest] ?? "#999999"))
                } else { fills.append(add("state:" + controller, Vassals.name(r, controller), color[controller] ?? "#999999")) }
            case "culture":
                let c = cityOf[p.id.asString].flatMap { r.civilization.cities[$0].cultureId.optionalString } ?? r.civilization.nations[controller].cultureId.optionalString
                fills.append(add(c.map { "culture:" + $0 }, Self.cultureNames[c ?? ""] ?? c ?? "", Self.familyPalette[(Self.cultureIds.firstIndex(of: c ?? "") ?? 0) % Self.familyPalette.count]))
            case "religion":
                let id = r.civilization.nations[controller].religionId.optionalString
                let valid = id != nil && id != "none"
                fills.append(add(valid ? "religion:" + id! : nil, Self.religionNames[id ?? ""] ?? id ?? "", Self.familyPalette[((Self.religionIds.firstIndex(of: id ?? "") ?? 1) - 1 + Self.familyPalette.count) % Self.familyPalette.count]))
            case "family":
                let id = holder[p.id.asString]
                let surname = id.flatMap { r.kin.families[$0].surname.optionalString }
                fills.append(add(id.map { "family:" + $0 }, surname.map { $0 + "家族" } ?? "", Self.familyColor(Int(id ?? "0") ?? 0)))
            default:
                fills.append(add("state:" + controller, Vassals.name(r, controller), color[controller] ?? "#999999"))
            }
        }
        let o = JS.object()
        o.fills = .array(fills.map { JS($0) })
        o.legend = .array(legend.sorted { $0.count != $1.count ? $0.count > $1.count : $0.name < $1.name }.map { e in let x = JS.object(); x.name = JS(e.name); x.color = JS(e.color); x.count = JS(e.count); return x })
        return Data(o.json.utf8)
    }

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
        case "war":
            for rel in w.statecraft.relations.asArray where rel.status.asString == "war" {
                let days = max(0, w.day.asNumber - rel.sinceDay.asNumber)
                rows.append(("\(Vassals.name(r, rel.a.asString)) — \(Vassals.name(r, rel.b.asString))", -1, days, "第 \(Int(days)) 天", nil))
            }
        default:
            var followers = [String: Double]()
            for (_, n) in living { if let id = r.civilization.nations[n.id.asString].religionId.optionalString { followers[id, default: 0] += population[n.id.asString] ?? 0 } }
            let all = max(1, total)
            for (id, v) in followers { rows.append((Self.religionNames[id] ?? id, -1, v, "\(fmt(v))（\(String(format: "%.1f", v / all * 100))%）", Self.familyPalette[((Self.religionIds.firstIndex(of: id) ?? 1) - 1 + Self.familyPalette.count) % Self.familyPalette.count])) }
        }
        rows.sort { $0.value != $1.value ? $0.value > $1.value : $0.name < $1.name }
        return Data(JS.array(rows.map { row in
            let x = JS.object(); x.name = JS(row.name); x.nation = JS(row.nation); x.value = JS(row.value); x.text = JS(row.text); x.color = row.color.map { JS($0) } ?? .null; return x
        }).json.utf8)
    }
}
