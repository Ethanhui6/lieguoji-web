import SwiftUI
import LieguojiCore

/// 邦交 at a glance, the diplomacy page's first part: how many wars, alliances, truces and neighbours;
/// every alliance with its members; and the chosen state's relation to every state it has one with
/// (at war, allied, overlord, vassal, treaty, truce, neighbour and how strong), each a row that takes
/// the camera to that state's capital and leads on to its page, to the wars and to its records.
/// Only what the engine already keeps is shown: no new mechanism.
struct DiplomacyBoard: View {
    @ObservedObject var model: GameModel
    let map: WorldMap
    let state: GameState
    let nation: Int
    /// The camera to a state's capital.
    let fly: (Int) -> Void
    let openNation: (Int) -> Void
    let openWars: () -> Void
    let openChronicle: (Int) -> Void
    @State private var info: DiplomacyOverview?
    @State private var alliances: [GameModel.AllianceRow] = []

    struct Relation: Identifiable {
        let id: Int
        var tags: [(text: String, color: Color)] = []
        var note = ""
        var rank = 9
        var atWar = false
    }
    private func name(_ n: Int) -> String { map.meta.nations.indices.contains(n) ? MapLayers.stateLabel(map.meta.nations[n].name, full: false) : "无主" }
    private func color(_ n: Int) -> Color { map.meta.nations.indices.contains(n) ? Names.color(map.meta.nations[n].color) : Theme.ink2 }

    /// One row per state the chosen state has anything to do with, the gravest relation first.
    private func relations(_ info: DiplomacyOverview) -> [Relation] {
        var rows = [Int: Relation]()
        func add(_ n: Int, _ text: String, _ color: Color, rank: Int, note: String = "", war: Bool = false) {
            guard n != nation, n >= 0, n < state.nations.count, state.nations[n].alive else { return }
            var r = rows[n] ?? Relation(id: n)
            r.tags.append((text, color)); r.rank = min(r.rank, rank)
            if !note.isEmpty { r.note = r.note.isEmpty ? note : r.note + " · " + note }
            if war { r.atWar = true }
            rows[n] = r
        }
        for n in info.enemies { add(n, "交战", Theme.seal, rank: 0, war: true) }
        for n in info.allies { add(n, "同盟", Theme.jade, rank: 1) }
        if let lord = info.overlord { add(lord, "宗主", Theme.ink, rank: 2) }
        for n in info.vassals { add(n, "附庸", Theme.ink, rank: 2) }
        for p in info.pacts { add(p.nation, p.kind == "marriage" ? "联姻" : "互不侵犯", Theme.jade, rank: 3, note: "余 \(p.months) 月") }
        for t in info.truces { add(t.nation, "停战", Theme.ink2, rank: 4, note: "余 \(max(1, t.days / 30)) 月") }
        for n in info.neighbors {
            let ratio = info.troops > 0 ? Double(n.troops) / Double(info.troops) : 0
            add(n.nation, "接壤", Theme.ink2.opacity(0.75), rank: 5, note: Names.wan(n.troops) + " 兵" + (info.troops > 0 ? (ratio > 1.5 ? "，强于我" : ratio < 0.67 ? "，弱于我" : "，相当") : ""))
        }
        return rows.values.sorted { $0.rank != $1.rank ? $0.rank < $1.rank : $0.id < $1.id }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                CountTile(title: "战争", value: state.wars.count, hot: !state.wars.isEmpty)
                CountTile(title: "同盟", value: alliances.count, hot: false)
                CountTile(title: "停战", value: info?.truces.count ?? 0, hot: false)
                CountTile(title: "接壤", value: info?.neighbors.count ?? 0, hot: false)
            }
            .padding(.horizontal, 16)

            if !alliances.isEmpty {
                SectionLabel("同盟一览")
                VStack(spacing: 8) {
                    ForEach(alliances) { a in AllianceCard(alliance: a, name: name, color: color, fly: fly) }
                }
                .padding(.horizontal, 14)
            }

            SectionLabel(name(nation) + "的邦交")
            Group2 {
                if let info {
                    let rows = relations(info)
                    if rows.isEmpty {
                        Text("与各国素无往来").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 14)
                    }
                    ForEach(rows) { r in
                        RelationRow(relation: r, name: name(r.id), color: color(r.id), fly: { fly(r.id) }, openNation: { openNation(r.id) },
                                    openWars: openWars, openChronicle: { openChronicle(r.id) })
                        if r.id != rows.last?.id { Divider2() }
                    }
                } else {
                    Text("载入……").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 14)
                }
            }
            .padding(.horizontal, 16)
        }
        .task(id: "\(nation)-\(state.day / 30)") {
            info = await model.diplomacyInfo(nation)
            alliances = await model.allianceList()
        }
    }
}

/// One alliance: its name, 铁盟 when it cannot be left, and its members (tap one to go to its capital).
private struct AllianceCard: View {
    let alliance: GameModel.AllianceRow
    let name: (Int) -> String
    let color: (Int) -> Color
    let fly: (Int) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 2).fill(Names.color(alliance.color)).frame(width: 10, height: 10)
                Text(alliance.name).font(Theme.kai(16)).foregroundStyle(Theme.ink).lineLimit(1)
                if alliance.unbreakable { PaperTag(text: "铁盟", color: Theme.ink) }
                Spacer(minLength: 4)
                Text("\(alliance.members.count) 国").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            }
            FlowChips(items: alliance.members.map { n -> (Int, String, Color, String?) in (n, name(n), color(n), nil) }) { n in fly(n) }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
    }
}

/// A state and what it is to the chosen one. The row itself goes to its capital; the small buttons
/// lead to its page, to the wars (when at war) and to its records.
private struct RelationRow: View {
    let relation: DiplomacyBoard.Relation
    let name: String
    let color: Color
    let fly: () -> Void
    let openNation: () -> Void
    let openWars: () -> Void
    let openChronicle: () -> Void
    var body: some View {
        HStack(spacing: 8) {
            Button(action: fly) {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 10, height: 30)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 5) {
                            Text(name).font(Theme.kai(17)).foregroundStyle(Theme.ink).lineLimit(1)
                            ForEach(Array(relation.tags.enumerated()), id: \.offset) { _, t in PaperTag(text: t.text, color: t.color) }
                        }
                        if !relation.note.isEmpty { Text(relation.note).font(Theme.kai(12)).foregroundStyle(Theme.ink2).lineLimit(1) }
                    }
                    Spacer(minLength: 4)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if relation.atWar { LinkSeal(mark: "战", color: Theme.seal, action: openWars) }
            LinkSeal(mark: "史", color: Theme.ink2, action: openChronicle)
            LinkSeal(mark: "国", color: Theme.jade, action: openNation)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
    }
}

/// A small round seal that leads to another page.
private struct LinkSeal: View {
    let mark: String
    let color: Color
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(mark).font(Theme.kai(13)).foregroundStyle(color)
                .frame(width: 30, height: 30)
                .background(Theme.paper2, in: Circle())
                .overlay(Circle().stroke(color.opacity(0.55), lineWidth: 0.9))
        }
        .buttonStyle(PressStyle())
    }
}
