import SwiftUI
import LieguojiCore

/// 军情: the war room at a glance, the military page's first tab. What is happening now (armies
/// fighting, besieging, marching, resting), who is strong (the six largest hosts), where to look
/// (sieges and battles: tap to go there), what the armies are made of, the largest armies and the
/// ones in trouble (tap to open). Everything is read from the state already on the phone.
struct MilitaryOverview: View {
    let map: WorldMap
    let state: GameState
    let select: (Int) -> Void
    let flyTo: (Double, Double) -> Void
    /// 名将谱: the commanders who earned a rank in their states' wars.
    var generals: [GeneralEntry] = []

    struct Power: Identifiable { let id: Int; let troops: Int; let armies: Int }
    struct Share: Identifiable { let id: String; let troops: Int }
    struct Clash: Identifiable { let id: Int; let first: Int; let second: Int }

    private func name(_ n: Int) -> String { map.meta.nations.indices.contains(n) ? MapLayers.stateLabel(map.meta.nations[n].name, full: false) : "无主" }
    private func color(_ n: Int) -> Color { map.meta.nations.indices.contains(n) ? Names.color(map.meta.nations[n].color) : Theme.ink2 }
    private func place(_ p: Int) -> String { map.meta.provinces.indices.contains(p) ? map.meta.provinces[p].name : "途中" }

    private var counts: [(title: String, value: Int, hot: Bool)] {
        var moving = 0, fighting = 0, sieging = 0, resting = 0
        for a in state.armies {
            if a.status == "fighting" { fighting += 1 }
            else if a.status == "sieging" { sieging += 1 }
            else if a.travel == "moving" { moving += 1 }
            else { resting += 1 }
        }
        return [("交战", fighting, fighting > 0), ("围城", sieging, sieging > 0), ("行军", moving, false), ("驻守", resting, false)]
    }
    private var powers: [Power] {
        var troops = [Int: Int](), armies = [Int: Int]()
        for a in state.armies { troops[a.nation, default: 0] += a.troops; armies[a.nation, default: 0] += 1 }
        let all = troops.map { Power(id: $0.key, troops: $0.value, armies: armies[$0.key] ?? 0) }
        return Array(all.sorted { $0.troops != $1.troops ? $0.troops > $1.troops : $0.id < $1.id }.prefix(6))
    }
    private var kinds: [Share] {
        var byKind = [String: Int]()
        for a in state.armies { byKind[Names.unit[a.unit] ?? a.unit, default: 0] += a.troops }
        let all = byKind.map { Share(id: $0.key, troops: $0.value) }
        return Array(all.sorted { $0.troops != $1.troops ? $0.troops > $1.troops : $0.id < $1.id }.prefix(6))
    }
    private var clashes: [Clash] {
        var out = [Clash]()
        for (i, pair) in (state.contacts ?? []).enumerated() where pair.count >= 2 && state.armies.indices.contains(pair[0]) && state.armies.indices.contains(pair[1]) {
            out.append(Clash(id: i, first: pair[0], second: pair[1]))
            if out.count == 5 { break }
        }
        return out
    }
    private var strongest: [Int] {
        let order = state.armies.indices.sorted { state.armies[$0].troops != state.armies[$1].troops ? state.armies[$0].troops > state.armies[$1].troops : $0 < $1 }
        return Array(order.prefix(5))
    }
    private var troubled: [Int] {
        let bad = state.armies.indices.filter { state.armies[$0].supplies <= 0 || state.armies[$0].status == "retreating" }
        return Array(bad.sorted { state.armies[$0].troops > state.armies[$1].troops }.prefix(4))
    }

    var body: some View {
        let powers = self.powers, kinds = self.kinds, clashes = self.clashes, troubled = self.troubled
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                ForEach(counts, id: \.0) { c in CountTile(title: c.title, value: c.value, hot: c.hot) }
            }
            .padding(.horizontal, 16)

            if !powers.isEmpty {
                SectionLabel("列国兵势")
                VStack(spacing: 9) {
                    ForEach(powers) { p in
                        ShareBar(color: color(p.id), title: name(p.id), value: Names.wan(p.troops) + " · \(p.armies) 军",
                                 share: Double(p.troops) / Double(max(1, powers[0].troops)))
                    }
                }
                .padding(12).paperCard().padding(.horizontal, 14)
            }

            if !state.sieges.isEmpty {
                SectionLabel("围城 \(state.sieges.count) 处")
                Group2 {
                    let shown = Array(state.sieges.prefix(6).enumerated())
                    ForEach(shown, id: \.offset) { i, s in
                        Button { go(province: s.province) } label: { SiegeRow(place: place(s.province), by: name(s.nation), color: color(s.nation), progress: s.progress) }
                            .buttonStyle(.plain)
                        if i != shown.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }

            if !clashes.isEmpty {
                SectionLabel("两军交锋")
                Group2 {
                    ForEach(clashes) { c in
                        let a = state.armies[c.first], b = state.armies[c.second]
                        Button { flyTo(Double(a.x), Double(a.y)) } label: {
                            ClashRow(left: a.name, leftColor: color(a.nation), leftTroops: a.troops, right: b.name, rightColor: color(b.nation), rightTroops: b.troops, place: place(a.province))
                        }
                        .buttonStyle(.plain)
                        if c.id != clashes.last?.id { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }

            if !kinds.isEmpty {
                SectionLabel("天下兵种")
                VStack(spacing: 9) {
                    ForEach(kinds) { k in
                        ShareBar(color: Theme.ink2, title: k.id, value: Names.wan(k.troops), share: Double(k.troops) / Double(max(1, kinds[0].troops)))
                    }
                }
                .padding(12).paperCard().padding(.horizontal, 14)
            }

            if !generals.isEmpty {
                SectionLabel("名将谱")
                Group2 {
                    let shown = Array(generals.prefix(8))
                    ForEach(shown) { g in
                        GeneralRow(entry: g, state: name(g.nation), color: color(g.nation))
                        if g.id != shown.last?.id { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }

            if !strongest.isEmpty {
                SectionLabel("最强之军")
                armyList(strongest)
            }
            if !troubled.isEmpty {
                SectionLabel("断粮与溃退")
                armyList(troubled)
            }
            if state.armies.isEmpty {
                Text("天下无兵").font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
            }
        }
    }

    private func go(province: Int) {
        guard map.meta.provinces.indices.contains(province) else { return }
        flyTo(Double(map.meta.provinces[province].x), Double(map.meta.provinces[province].y))
    }
    private func armyList(_ rows: [Int]) -> some View {
        Group2 {
            ForEach(rows, id: \.self) { i in
                Button { select(i) } label: { ArmyRow(map: map, army: state.armies[i]) }.buttonStyle(.plain)
                if i != rows.last { Divider2() }
            }
        }
        .padding(.horizontal, 16)
    }
}

private struct CountTile: View {
    let title: String
    let value: Int
    let hot: Bool
    var body: some View {
        VStack(spacing: 2) {
            Text("\(value)").font(Theme.kai(22)).foregroundStyle(hot ? Theme.seal : Theme.ink).monospacedDigit()
            Text(title).font(Theme.kai(13)).foregroundStyle(Theme.ink2)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 10)
        .paperCard(tint: hot ? Theme.seal : nil)
    }
}

/// A named bar: the name and the figure on one line, the share as a bar under them.
private struct ShareBar: View {
    let color: Color
    let title: String
    let value: String
    let share: Double
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
                Text(title).font(Theme.kai(15)).foregroundStyle(Theme.ink).lineLimit(1)
                Spacer(minLength: 6)
                Text(value).font(Theme.kai(14)).foregroundStyle(Theme.ink2).monospacedDigit().lineLimit(1)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.ink.opacity(0.08))
                    Capsule().fill(color.opacity(0.9)).frame(width: max(3, g.size.width * CGFloat(min(1, max(0, share)))))
                }
            }
            .frame(height: 6)
        }
    }
}

private struct SiegeRow: View {
    let place: String
    let by: String
    let color: Color
    let progress: Double
    /// The engine reports a share (0…1) or a percentage; both read as a share here.
    private var share: Double { min(1, max(0, progress > 1 ? progress / 100 : progress)) }
    var body: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 10, height: 30)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(place).font(Theme.kai(17)).foregroundStyle(Theme.ink).lineLimit(1)
                    Text(by + "围攻").font(Theme.kai(12)).foregroundStyle(Theme.ink2).lineLimit(1)
                    Spacer(minLength: 4)
                    Text("\(Int((share * 100).rounded()))%").font(Theme.kai(14)).foregroundStyle(Theme.seal).monospacedDigit()
                }
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.ink.opacity(0.08))
                        Capsule().fill(Theme.seal.opacity(0.85)).frame(width: max(3, g.size.width * CGFloat(share)))
                    }
                }
                .frame(height: 5)
            }
            Image(systemName: "scope").font(.system(size: 13)).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
    }
}

/// One of the roll: rank, name, state, months in command, provinces won, merit.
private struct GeneralRow: View {
    let entry: GeneralEntry
    let state: String
    let color: Color
    var body: some View {
        HStack(spacing: 10) {
            PaperTag(text: entry.rank, color: entry.fallen ? Theme.ink2 : Theme.seal)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(entry.name).font(Theme.kai(17)).foregroundStyle(entry.fallen ? Theme.ink2 : Theme.ink).lineLimit(1)
                    if entry.fallen { Text("已故").font(Theme.kai(12)).foregroundStyle(Theme.ink2) }
                }
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 8, height: 8)
                    Text(state + " · 统兵 " + String(entry.months) + " 月 · 拓地 " + String(entry.gained) + " 州").font(Theme.kai(12)).foregroundStyle(Theme.ink2).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 1) {
                Text(String(Int(entry.merit))).font(Theme.kai(17)).foregroundStyle(Theme.ink).monospacedDigit()
                Text("战功").font(Theme.kai(11)).foregroundStyle(Theme.ink2)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
    }
}

private struct ClashRow: View {
    let left: String
    let leftColor: Color
    let leftTroops: Int
    let right: String
    let rightColor: Color
    let rightTroops: Int
    let place: String
    var body: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2).fill(leftColor).frame(width: 8, height: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(left).font(Theme.kai(15)).foregroundStyle(Theme.ink).lineLimit(1)
                Text(Names.wan(leftTroops)).font(Theme.kai(12)).foregroundStyle(Theme.ink2).monospacedDigit()
            }
            Spacer(minLength: 4)
            VStack(spacing: 1) {
                Text("战").font(Theme.kai(15)).foregroundStyle(Theme.seal)
                Text(place).font(Theme.kai(11)).foregroundStyle(Theme.ink2).lineLimit(1)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 1) {
                Text(right).font(Theme.kai(15)).foregroundStyle(Theme.ink).lineLimit(1)
                Text(Names.wan(rightTroops)).font(Theme.kai(12)).foregroundStyle(Theme.ink2).monospacedDigit()
            }
            RoundedRectangle(cornerRadius: 2).fill(rightColor).frame(width: 8, height: 22)
        }
        .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
    }
}
