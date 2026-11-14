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

/// The record's kind as a small seal.
struct KindSeal: View {
    let kind: ChronicleKind
    var size: CGFloat = 22
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.18, style: .continuous)
        Text(kind.mark).font(Theme.kai(size * 0.6)).foregroundStyle(Theme.paper2)
            .frame(width: size, height: size)
            .background(kind.color.opacity(0.88), in: shape)
            .overlay(shape.stroke(Theme.paper2.opacity(0.55), lineWidth: 0.8).padding(1.6))
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
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text("岁纪").font(Theme.kai(18)).foregroundStyle(Theme.ink)
                Spacer()
                DigestKey(color: Theme.seal, text: "战")
                DigestKey(color: Theme.ink, text: "政")
                DigestKey(color: Theme.jade, text: "盟")
                DigestKey(color: Theme.ink2.opacity(0.45), text: "余")
            }
            if rows.isEmpty {
                Text("尚无记载").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
            } else {
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(rows) { row in
                        DigestBar(year: row, peak: peak, label: yearText(row.id), latest: row.id == rows.last?.id)
                    }
                }
                .frame(height: 96)
                if let now = rows.last {
                    Text(note(now, rows.count > 1 ? rows[rows.count - 2] : nil))
                        .font(Theme.kai(13)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(14)
        .background(Theme.paper2.opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.ink.opacity(0.15), lineWidth: 1))
    }
}

private struct DigestKey: View {
    let color: Color
    let text: String
    var body: some View {
        HStack(spacing: 3) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 9, height: 9)
            Text(text).font(Theme.kai(12)).foregroundStyle(Theme.ink2)
        }
    }
}

private struct DigestBar: View {
    let year: ChronicleDigest.Year
    let peak: Int
    let label: String
    let latest: Bool
    private func height(_ count: Int) -> CGFloat { CGFloat(count) / CGFloat(peak) * 58 }
    var body: some View {
        VStack(spacing: 3) {
            Text("\(year.total)").font(Theme.kai(11)).foregroundStyle(latest ? Theme.seal : Theme.ink2).monospacedDigit()
            VStack(spacing: 0) {
                Rectangle().fill(Theme.ink2.opacity(0.45)).frame(height: height(year.other))
                Rectangle().fill(Theme.jade).frame(height: height(year.pact))
                Rectangle().fill(Theme.ink).frame(height: height(year.politics))
                Rectangle().fill(Theme.seal).frame(height: height(year.war))
            }
            .frame(maxWidth: 22)
            .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
            Text(label).font(Theme.kai(11)).foregroundStyle(latest ? Theme.seal : Theme.ink2).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }
}

/// 搜寻 and 只看一国: a paper search box, and the state the list is narrowed to.
struct ChronicleFilterBar: View {
    @Binding var keyword: String
    let nation: String?
    let clearNation: () -> Void
    var body: some View {
        let box = RoundedRectangle(cornerRadius: 12, style: .continuous)
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").font(.system(size: 13)).foregroundStyle(Theme.ink2)
                TextField("", text: $keyword, prompt: Text("搜寻纪事").foregroundColor(Theme.ink2.opacity(0.7)))
                    .font(Theme.kai(15)).foregroundStyle(Theme.ink).tint(Theme.seal)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                if !keyword.isEmpty {
                    Button { keyword = "" } label: {
                        Image(systemName: "xmark").font(.system(size: 11)).foregroundStyle(Theme.ink2).frame(width: 24, height: 24).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12).frame(height: 36)
            .background(Theme.paper2, in: box)
            .overlay(box.stroke(Theme.line))
            if let nation {
                Button(action: clearNation) {
                    HStack(spacing: 4) {
                        Text("只看 " + nation).font(Theme.kai(14)).lineLimit(1)
                        Image(systemName: "xmark").font(.system(size: 10))
                    }
                    .foregroundStyle(Theme.paper2).padding(.horizontal, 12).frame(height: 36)
                    .background(Theme.seal, in: box)
                }
                .buttonStyle(.plain)
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
        HStack(spacing: 6) {
            Text(ChronicleKind.of(entry.kind).label + " · " + age).font(Theme.kai(12)).foregroundStyle(Theme.ink2).fixedSize()
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
            HStack(spacing: 3) {
                RoundedRectangle(cornerRadius: 2).fill(Names.color(n.color)).frame(width: 8, height: 8)
                Text(MapLayers.stateLabel(n.name, full: false)).font(Theme.kai(12)).foregroundStyle(Theme.ink2).lineLimit(1)
            }
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Theme.paper2, in: Capsule())
            .overlay(Capsule().stroke(Theme.line, lineWidth: 0.8))
        }
    }
}
