import SwiftUI
import LieguojiCore

/// 纪事的分类: what kind of record a line is. One character in a small seal marks it in the list,
/// and the yearly digest counts by it.
enum ChronicleKind {
    case war, land, politics, reform, culture, faith, house, pact, event

    static func of(_ kind: String) -> ChronicleKind {
        switch kind {
        case "war", "battle", "uprising", "emergency", "regular", "civilWar", "rebellion": return .war
        case "occupation", "siege": return .land
        case "politics", "accession", "extinction", "restoration", "capital", "founding": return .politics
        case "reform": return .reform
        case "culture": return .culture
        case "religion": return .faith
        case "family", "marriage", "birth", "death": return .house
        case "diplomacy", "peace", "alliance", "vassal": return .pact
        default: return .event
        }
    }
    var mark: String {
        switch self {
        case .war: return "战"
        case .land: return "土"
        case .politics: return "政"
        case .reform: return "制"
        case .culture: return "文"
        case .faith: return "教"
        case .house: return "族"
        case .pact: return "盟"
        case .event: return "事"
        }
    }
    var label: String {
        switch self {
        case .war: return "战事"
        case .land: return "领土"
        case .politics: return "政权"
        case .reform: return "制度"
        case .culture: return "文化"
        case .faith: return "宗教"
        case .house: return "家族"
        case .pact: return "外交"
        case .event: return "人事"
        }
    }
    var color: Color {
        switch self {
        case .war, .land: return Theme.seal
        case .pact: return Theme.jade
        case .politics, .reform: return Theme.ink
        default: return Theme.ink2
        }
    }
}

/// 二级信息列表极简图标：彻底清除史记/外交列表左侧琐碎彩色迷你插图，
/// 统一改用 Phosphor `light` 单色细线图标（#6E655D 浅墨；战事/领土重大变动克制点朱砂红 #A83226）。
struct KindSeal: View {
    let kind: ChronicleKind
    var size: CGFloat = 15
    private var glyph: PhosphorGlyph {
        switch kind {
        case .war: return .war
        case .land: return .flag
        case .politics: return .crown
        case .reform: return .scales
        case .culture: return .culture
        case .faith: return .religion
        case .house: return .familyTree
        case .pact: return .diplomacy
        case .event: return .edict
        }
    }
    private var tint: Color {
        (kind == .war || kind == .land) ? Theme.seal : Theme.ink2
    }
    var body: some View {
        PhosphorIcon(glyph: glyph, size: min(16, max(14, size)), weight: .light)
            .foregroundStyle(tint)
            .frame(width: 18, height: 18)
            .accessibilityLabel(kind.label)
    }
}

/// 岁纪: the last eight years at a glance. Each year is a bar of its records — wars and lost land in
/// vermilion, changes of government in ink, treaties in jade, the rest pale — and the historian's
/// one-line note on the latest year.
struct ChronicleDigest: View {
    let entries: [ChronicleEntry]
    let yearOf: (Int) -> Int
    let yearText: (Int) -> String

    fileprivate struct Year: Identifiable {
        let id: Int
        var war = 0, politics = 0, pact = 0, other = 0
        var total: Int { war + politics + pact + other }
    }
    private var years: [Year] {
        var byYear = [Int: Year]()
        for e in entries {
            let y = yearOf(e.day)
            var row = byYear[y] ?? Year(id: y)
            switch ChronicleKind.of(e.kind) {
            case .war, .land: row.war += 1
            case .politics, .reform: row.politics += 1
            case .pact: row.pact += 1
            default: row.other += 1
            }
            byYear[y] = row
        }
        let latest = byYear.values.sorted { $0.id > $1.id }.prefix(8)
        return Array(latest.reversed())
    }
    private func note(_ now: Year, _ before: Year?) -> String {
        var parts = [String]()
        if now.war > 0 { parts.append("战事 \(now.war) 起") }
        if now.politics > 0 { parts.append("政局 \(now.politics) 变") }
        if now.pact > 0 { parts.append("盟约和议 \(now.pact) 件") }
        if now.other > 0 { parts.append("人事 \(now.other) 条") }
        var text = parts.isEmpty ? "是岁无事可记" : "是岁" + parts.joined(separator: "，")
        if let before, before.total > 0 {
            if now.war > before.war { text += "；兵事多于去岁" }
            else if now.war < before.war { text += "；兵事少于去岁" }
            else if now.war == 0 { text += "；四境无战" }
        }
        return text + "。"
    }
    var body: some View {
        let rows = years
        let peak = max(1, rows.map(\.total).max() ?? 1)
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                HStack(spacing: 7) {
                    PhosphorIcon(glyph: .chronicle, size: 15, weight: .light)
                        .foregroundStyle(Theme.ink2)
                    Text("岁纪").font(Theme.serif(16)).foregroundStyle(Theme.ink).tracking(1.6)
                }
                Spacer()
                DigestKey(color: Theme.seal, text: "战")
                DigestKey(color: Theme.ink, text: "政")
                DigestKey(color: Theme.ink.opacity(0.45), text: "盟")
                DigestKey(color: Theme.ink2.opacity(0.28), text: "余")
            }
            EditorialDivider()
            if rows.isEmpty {
                Text("尚无记载").font(Theme.label).foregroundStyle(Theme.ink2)
            } else {
                HStack(alignment: .bottom, spacing: 8) {
                    ForEach(rows) { row in
                        DigestBar(year: row, peak: peak, label: yearText(row.id), latest: row.id == rows.last?.id)
                    }
                }
                .frame(height: 104)
                .padding(.top, 4)
                if let now = rows.last {
                    Text(note(now, rows.count > 1 ? rows[rows.count - 2] : nil))
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.ink2)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            EditorialDivider()
        }
        .padding(.vertical, 6)
    }
}

private struct DigestKey: View {
    let color: Color
    let text: String
    var body: some View {
        HStack(spacing: 4) {
            Rectangle().fill(color).frame(width: 8, height: 8)
            Text(text).font(Theme.caption).foregroundStyle(Theme.ink2)
        }
    }
}

private struct DigestBar: View {
    let year: ChronicleDigest.Year
    let peak: Int
    let label: String
    let latest: Bool
    private func height(_ count: Int) -> CGFloat { CGFloat(count) / CGFloat(peak) * 62 }
    var body: some View {
        VStack(spacing: 4) {
            Text("\(year.total)")
                .font(Theme.numeral(13))
                .foregroundStyle(latest ? Theme.seal : Theme.ink2)
                .monospacedDigit()
            VStack(spacing: 0) {
                Rectangle().fill(Theme.ink2.opacity(0.28)).frame(height: height(year.other))
                Rectangle().fill(Theme.ink.opacity(0.45)).frame(height: height(year.pact))
                Rectangle().fill(Theme.ink).frame(height: height(year.politics))
                Rectangle().fill(Theme.seal).frame(height: height(year.war))
            }
            .frame(maxWidth: 16)
            .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
            Text(label)
                .font(Theme.numeral(12))
                .foregroundStyle(latest ? Theme.seal : Theme.ink2)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }
}

/// 搜寻 and 只看一国: 极简宣纸细线搜寻栏，移除重边框与红底胶囊。
struct ChronicleFilterBar: View {
    @Binding var keyword: String
    let nation: String?
    let clearNation: () -> Void
    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                PhosphorIcon(glyph: .search, size: 15, weight: .light).foregroundStyle(Theme.ink2)
                TextField("", text: $keyword, prompt: Text("搜寻史册……").foregroundColor(Theme.ink2.opacity(0.6)))
                    .font(Theme.body).foregroundStyle(Theme.ink).tint(Theme.seal)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                if !keyword.isEmpty {
                    Button { keyword = "" } label: {
                        PhosphorIcon(glyph: .close, size: 12, weight: .light)
                            .foregroundStyle(Theme.ink2)
                            .frame(width: 24, height: 24)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12).frame(height: 40)
            .background(Theme.paper2.opacity(0.6), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))

            if let nation {
                Button(action: clearNation) {
                    HStack(spacing: 5) {
                        Text(nation).font(Theme.sans(12, weight: .medium)).lineLimit(1)
                        PhosphorIcon(glyph: .close, size: 10, weight: .light)
                    }
                    .foregroundStyle(Theme.paperLight)
                    .padding(.horizontal, 12).frame(height: 40)
                    .background(Theme.seal, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(PressStyle())
            }
        }
    }
}

/// Under a record: its kind, how long ago it was, and the states it concerns (tap one to see only its records).
struct ChronicleEntryMeta: View {
    let entry: ChronicleEntry
    let map: WorldMap?
    let today: Int
    let pick: (Int) -> Void
    private var age: String {
        let d = max(0, today - entry.day)
        return d == 0 ? "今日" : d < 30 ? "\(d) 日前" : d < 365 ? "\(d / 30) 月前" : "\(d / 365) 年前"
    }
    private var involved: [Int] {
        guard let map else { return [] }
        var seen = Set<Int>()
        let unique = entry.nations.filter { $0 >= 0 && $0 < map.meta.nations.count && seen.insert($0).inserted }
        return Array(unique.prefix(3))
    }
    var body: some View {
        HStack(spacing: 8) {
            Text(ChronicleKind.of(entry.kind).label + " · " + age)
                .font(Theme.sans(11.5))
                .foregroundStyle(Theme.ink2)
                .fixedSize()
            ForEach(involved, id: \.self) { n in
                Button { pick(n) } label: { NationTag(map: map, nation: n) }.buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }
}

private struct NationTag: View {
    let map: WorldMap?
    let nation: Int
    var body: some View {
        if let map, nation >= 0, nation < map.meta.nations.count {
            let n = map.meta.nations[nation]
            HStack(spacing: 4) {
                Rectangle().fill(Names.color(n.color)).frame(width: 6, height: 6)
                Text(MapLayers.stateLabel(n.name, full: false))
                    .font(Theme.sans(11.5))
                    .foregroundStyle(Theme.ink2)
                    .lineLimit(1)
            }
            .padding(.horizontal, 6).padding(.vertical, 2)
            .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(Theme.hairline, lineWidth: 0.65))
        }
    }
}
