import SwiftUI
import LieguojiCore

/// 外交页的视角：玩家是上帝视角，不固定扮演某国。nil 为“天下”（全局总览），否则为所选国家。
/// （以前外交页把“宣战发起国”选择器的默认值——第 0 号国家——当成“我国”，看不出依据。）
struct DiplomacyViewpointBar: View {
    let map: WorldMap
    let state: GameState
    @Binding var viewpoint: Int?
    /// 地图上当前选中州郡的归属国（有则给出“地图所选”的快捷切换）。
    let picked: Int?
    /// 手动换了视角（镜头随之去该国都城）。
    var onPick: (Int?) -> Void = { _ in }
    private func name(_ n: Int) -> String { map.meta.nations.indices.contains(n) ? MapLayers.stateLabel(map.meta.nations[n].name, full: false) : "无主" }
    private func color(_ n: Int) -> Color { map.meta.nations.indices.contains(n) ? Names.color(map.meta.nations[n].color) : Theme.ink2 }
    var body: some View {
        let alive = state.nations.indices.filter { state.nations[$0].alive && $0 < map.meta.nations.count }
            .sorted { state.nations[$0].provinces != state.nations[$1].provinces ? state.nations[$0].provinces > state.nations[$1].provinces : $0 < $1 }
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("视角").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                if let v = viewpoint {
                    RoundedRectangle(cornerRadius: 2).fill(color(v)).frame(width: 12, height: 12)
                    Text(name(v)).font(Theme.kai(18)).foregroundStyle(Theme.ink)
                    Text("之邦交").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                } else {
                    Text("天下").font(Theme.kai(18)).foregroundStyle(Theme.ink)
                    Text("（上帝视角，不代表任何一国）").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                }
                Spacer(minLength: 0)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    chip("天下", nil, swatch: nil)
                    if let p = picked, alive.contains(p), p != viewpoint { chip("地图所选 · " + name(p), p, swatch: color(p)) }
                    ForEach(alive, id: \.self) { n in chip(name(n), n, swatch: color(n)) }
                }
                .padding(.vertical, 2)
            }
        }
        .padding(.horizontal, 16)
    }
    private func chip(_ title: String, _ n: Int?, swatch: Color?) -> some View {
        let on = viewpoint == n
        return Button { withAnimation(Motion.tap) { viewpoint = n }; onPick(n) } label: {
            HStack(spacing: 5) {
                if let swatch { RoundedRectangle(cornerRadius: 2).fill(swatch).frame(width: 10, height: 10) }
                Text(title).font(Theme.kai(14)).lineLimit(1)
            }
            .foregroundStyle(on ? Theme.paper2 : Theme.ink)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(on ? Theme.seal : Theme.paper2, in: Capsule())
            .overlay(Capsule().stroke(on ? Color.clear : Theme.ink.opacity(0.2), lineWidth: 1))
        }
        .buttonStyle(PressStyle())
    }
}

/// 邦交 at a glance, the diplomacy page's first part. Without a viewpoint (天下): every war, alliance,
/// truce and treaty between all states as one web, tap a state to take its view. With one: how many
/// wars, alliances, truces and neighbours it has; every alliance; and its relation to every state it
/// has one with, each a row that takes the camera to that state's capital and leads on to its page,
/// to the wars and to its records. Only what the engine already keeps is shown: no new mechanism.
struct DiplomacyBoard: View {
    @ObservedObject var model: GameModel
    let map: WorldMap
    let state: GameState
    let nation: Int?
    /// The camera to a state's capital.
    let fly: (Int) -> Void
    let openNation: (Int) -> Void
    let openWars: () -> Void
    let openChronicle: (Int) -> Void
    /// 在关系网上点一国：以它为视角。
    var choose: (Int) -> Void = { _ in }
    @State private var info: DiplomacyOverview?
    @State private var web: [Int: DiplomacyOverview] = [:]
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
    private func relations(_ info: DiplomacyOverview, of nation: Int) -> [Relation] {
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
            var strength: String = Names.wan(n.troops) + " 兵"
            if info.troops > 0 { strength += ratio > 1.5 ? "，强于" + name(nation) : ratio < 0.67 ? "，弱于" + name(nation) : "，相当" }
            add(n.nation, "接壤", Theme.ink2.opacity(0.75), rank: 5, note: strength)
        }
        return rows.values.sorted { $0.rank != $1.rank ? $0.rank < $1.rank : $0.id < $1.id }
    }
    /// 天下的停战对数（每对只算一次）。
    private var truceCount: Int {
        var pairs = Set<[Int]>()
        for (n, i) in web { for t in i.truces { pairs.insert([min(n, t.nation), max(n, t.nation)]) } }
        return pairs.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                CountTile(title: "战争", value: state.wars.count, hot: !state.wars.isEmpty)
                CountTile(title: "同盟", value: alliances.count, hot: false)
                if nation == nil {
                    CountTile(title: "停战", value: truceCount, hot: false)
                    CountTile(title: "列国", value: state.nations.filter(\.alive).count, hot: false)
                } else {
                    CountTile(title: "停战", value: info?.truces.count ?? 0, hot: false)
                    CountTile(title: "接壤", value: info?.neighbors.count ?? 0, hot: false)
                }
            }
            .padding(.horizontal, 16)

            if let nation {
                SectionLabel(name(nation) + "的邦交")
                Group2 {
                    if let info {
                        let rows = relations(info, of: nation)
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
            } else {
                SectionLabel("天下邦交图")
                RelationWeb(map: map, state: state, web: web, alliances: alliances, choose: choose).padding(.horizontal, 16)
            }

            if !alliances.isEmpty {
                SectionLabel("同盟一览")
                VStack(spacing: 8) {
                    ForEach(alliances) { a in AllianceCard(alliance: a, name: name, color: color, fly: fly) }
                }
                .padding(.horizontal, 14)
            }
        }
        .task(id: "\(nation ?? -1)-\(state.day / 30)") {
            alliances = await model.allianceList()
            if let nation { info = await model.diplomacyInfo(nation) }
            else {
                var all = [Int: DiplomacyOverview]()
                for n in state.nations.indices where state.nations[n].alive { if let i = await model.diplomacyInfo(n) { all[n] = i } }
                web = all
            }
        }
    }
}

/// 天下邦交图：列国围成一圈（大国在上，点的大小随领土），之间连线表示关系——
/// 朱色实线交战、青色实线同盟、墨色虚线宗藩、淡墨点线停战、青色点线盟约。点一国即以它为视角。
struct RelationWeb: View {
    let map: WorldMap
    let state: GameState
    let web: [Int: DiplomacyOverview]
    let alliances: [GameModel.AllianceRow]
    let choose: (Int) -> Void
    private struct Edge: Hashable { let a: Int; let b: Int; let kind: Int }
    var body: some View {
        let nodes = Array(state.nations.indices.filter { state.nations[$0].alive && $0 < map.meta.nations.count }
            .sorted { state.nations[$0].provinces != state.nations[$1].provinces ? state.nations[$0].provinces > state.nations[$1].provinces : $0 < $1 }.prefix(32))
        let largest = max(1, nodes.map { state.nations[$0].provinces }.max() ?? 1)
        let edges = makeEdges(Set(nodes))
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { g in
                let side = min(g.size.width, g.size.height), center = CGPoint(x: g.size.width / 2, y: g.size.height / 2), radius = side / 2 - 46
                let at: [Int: CGPoint] = Dictionary(uniqueKeysWithValues: nodes.enumerated().map { i, n in
                    let a = -Double.pi / 2 + Double(i) / Double(max(1, nodes.count)) * 2 * .pi
                    return (n, CGPoint(x: center.x + cos(a) * radius, y: center.y + sin(a) * radius))
                })
                ZStack {
                    Canvas { ctx, _ in
                        for e in edges {
                            guard let p = at[e.a], let q = at[e.b] else { continue }
                            var path = Path(); path.move(to: p)
                            // 弦略向圆心弯，交叉处不至于糊成一团。
                            path.addQuadCurve(to: q, control: CGPoint(x: (p.x + q.x) / 2 * 0.8 + center.x * 0.2, y: (p.y + q.y) / 2 * 0.8 + center.y * 0.2))
                            let (c, w, dash): (Color, CGFloat, [CGFloat]) = {
                                switch e.kind {
                                case 0: return (Theme.seal, 2.2, [])
                                case 1: return (Theme.jade, 2, [])
                                case 2: return (Theme.ink.opacity(0.7), 1.4, [5, 3])
                                case 3: return (Theme.ink2.opacity(0.6), 1.2, [1.5, 3])
                                default: return (Theme.jade.opacity(0.7), 1.2, [1.5, 3])
                                }
                            }()
                            ctx.stroke(path, with: .color(c), style: StrokeStyle(lineWidth: w, lineCap: .round, dash: dash))
                        }
                    }
                    ForEach(nodes, id: \.self) { n in
                        let p = at[n] ?? center
                        let d = 10 + 16 * sqrt(CGFloat(state.nations[n].provinces) / CGFloat(largest))
                        // 国名沿半径排在圆外，不压节点与连线。
                        let ux = (p.x - center.x) / max(1, radius), uy = (p.y - center.y) / max(1, radius)
                        Button { choose(n) } label: {
                            ZStack {
                                Circle().fill(Names.color(map.meta.nations[n].color)).frame(width: d, height: d)
                                    .overlay(Circle().stroke(Theme.ink.opacity(0.55), lineWidth: 1))
                                Text(MapLayers.stateLabel(map.meta.nations[n].name, full: false)).font(Theme.kai(11)).foregroundStyle(Theme.ink).lineLimit(1).fixedSize()
                                    .padding(.horizontal, 2).background(Theme.paper2.opacity(0.85), in: Capsule())
                                    .offset(x: ux * (d / 2 + 24), y: uy * (d / 2 + 10))
                            }
                        }
                        .buttonStyle(PressStyle())
                        .position(x: p.x, y: p.y)
                    }
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .frame(maxWidth: 420).frame(maxWidth: .infinity)
            HStack(spacing: 12) {
                legend(Theme.seal, "交战", []); legend(Theme.jade, "同盟", []); legend(Theme.ink.opacity(0.7), "宗藩", [5, 3])
                legend(Theme.ink2.opacity(0.6), "停战", [1.5, 3]); legend(Theme.jade.opacity(0.7), "盟约", [1.5, 3])
            }
            .frame(maxWidth: .infinity)
            if web.isEmpty { Text("载入……").font(Theme.kai(13)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity) }
            Text("点一国即以它为视角查看其邦交").font(Theme.kai(12)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity)
        }
        .padding(12)
        .paperCard()
    }
    private func legend(_ c: Color, _ text: String, _ dash: [CGFloat]) -> some View {
        HStack(spacing: 4) {
            Canvas { ctx, size in var p = Path(); p.move(to: CGPoint(x: 0, y: size.height / 2)); p.addLine(to: CGPoint(x: size.width, y: size.height / 2)); ctx.stroke(p, with: .color(c), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: dash)) }
                .frame(width: 16, height: 8)
            Text(text).font(Theme.kai(11)).foregroundStyle(Theme.ink2)
        }
    }
    /// 每对国家只画最重的一种关系：交战 > 同盟 > 宗藩 > 停战 > 盟约。
    private func makeEdges(_ shown: Set<Int>) -> [Edge] {
        var best = [[Int]: Int]()
        func add(_ a: Int, _ b: Int, _ kind: Int) {
            guard a != b, shown.contains(a), shown.contains(b) else { return }
            let k = [min(a, b), max(a, b)]
            best[k] = min(best[k] ?? 9, kind)
        }
        for (i, s) in state.nations.enumerated() where s.alive { for e in s.enemies { add(i, e, 0) } }
        for a in alliances { for x in a.members { for y in a.members where x < y { add(x, y, 1) } } }
        for (n, i) in web {
            for v in i.vassals { add(n, v, 2) }
            for t in i.truces { add(n, t.nation, 3) }
            for p in i.pacts { add(n, p.nation, 4) }
        }
        // 交战画在最上层。
        return best.map { Edge(a: $0.key[0], b: $0.key[1], kind: $0.value) }.sorted { $0.kind != $1.kind ? $0.kind > $1.kind : ($0.a, $0.b) < ($1.a, $1.b) }
    }
}

// One alliance: its name, 铁盟 when it cannot be left, and its members (tap one to go to its capital).
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
            // 可点的链接印：与全作同一印面，朱文描边（不实填，表示可点而非落款）。
            SealFace(text: mark, size: 28, color: color, filled: false)
        }
        .buttonStyle(PressStyle())
    }
}
