import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

struct NationsSheet: View {
    @State private var search = ""
    @State private var livingOnly = true
    @ObservedObject var model: GameModel
    let select: (Int) -> Void
    var body: some View {
        if let map = model.map, let state = model.state {
            // A state just founded may not be in the map legend yet: list only the ones it has.
            let order = state.nations.indices.filter { $0 < map.meta.nations.count && (!livingOnly || state.nations[$0].alive) && (search.isEmpty || map.meta.nations[$0].name.localizedCaseInsensitiveContains(search)) }.sorted { state.nations[$0].provinces > state.nations[$1].provinces }
            ScrollView {
                LazyVStack(spacing: 14) {
                    SheetHeader(title: "国家", subtitle: "\(state.nations.filter(\.alive).count) 国并立")
                    VStack(spacing: 10) {
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .regular)).foregroundStyle(Theme.ink2)
                            TextField("", text: $search, prompt: Text("搜索国名").foregroundColor(Theme.ink2.opacity(0.6)))
                        }
                        .paperField()
                        ChipPicker(items: [(true, "现存"), (false, "全部（含已亡）")], selection: $livingOnly)
                        if order.isEmpty { Text("没有符合条件的国家").foregroundStyle(Theme.ink2) }
                    }.padding(.horizontal, 16)
                    Group2 {
                        ForEach(order, id: \.self) { i in
                            let n = map.meta.nations[i], s = state.nations[i]
                            Button { select(i) } label: {
                                HStack(spacing: 12) {
                                    RoundedRectangle(cornerRadius: 5).fill(Names.color(n.color)).frame(width: 22, height: 22)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack(spacing: 6) {
                                            Text(n.name).font(Theme.kai(20)).foregroundStyle(s.alive ? Theme.ink : Theme.ink2).lineLimit(1).minimumScaleFactor(0.65)
                                            if !s.alive { Text("已亡").font(Theme.kai(12)).foregroundStyle(Theme.ink2) }
                                        }
                                        HStack(spacing: 6) {
                                            Text("\(Names.polity[n.polity] ?? n.polity) · \(Names.culture[n.culture] ?? n.culture)文化").font(Theme.kai(13)).foregroundStyle(Theme.ink2).lineLimit(1)
                                            if !s.enemies.isEmpty { Text("交战").font(Theme.kai(11)).foregroundStyle(Theme.seal).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.seal.opacity(0.1), in: Capsule()) }
                                        }
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 3) {
                                        Text("\(s.provinces) 省").font(Theme.kai(17)).foregroundStyle(Theme.ink)
                                        Text("\(Names.wan(s.population))人 · \(Names.wan(s.troops))兵").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                                    }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if i != order.last { Divider2() }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            }
        }
    }
}

struct MilitarySheet: View {
    /// The screenshot tour opens this page on one tab.
    static var tourFilter: String?
    /// 联动: another page asks for this tab once (外交 › 战).
    static var openOn: String?
    /// The page opens on 军情, the war room at a glance (MilitaryOverview).
    @State private var filter = "overview"
    /// 名将谱, reread each month of the game.
    @State private var generals: [GeneralEntry] = []
    @State private var released: String?
    @ObservedObject var model: GameModel
    let select: (Int) -> Void
    var selectFleet: (Int) -> Void = { _ in }
    var flyTo: (Double, Double) -> Void = { _, _ in }
    /// 一国的军机: how many of its armies attack, relieve and guard.
    private func dutySummary(_ state: GameState, _ rows: [Int]) -> String {
        var counts = [String: Int]()
        for i in rows { if let d = state.armies[i].duty { counts[d, default: 0] += 1 } }
        return ["attacking", "staging", "supporting", "guarding"].compactMap { key -> String? in
            guard let n = counts[key], let name = ArmyRow.duties[key] else { return nil }
            return "\(name) \(n)"
        }.joined(separator: " · ")
    }
    /// The camera goes where this war is being fought: a siege first, else its armies in the field.
    private func showFront(_ map: WorldMap, _ state: GameState, _ war: GameState.War) {
        let sides = Set(war.participants.map(\.nation)).union([war.attacker, war.defender])
        if let s = state.sieges.first(where: { sides.contains($0.nation) && map.meta.provinces.indices.contains($0.province) }) {
            flyTo(Double(map.meta.provinces[s.province].x), Double(map.meta.provinces[s.province].y)); return
        }
        let inField = state.armies.first { sides.contains($0.nation) && $0.status == "fighting" } ?? state.armies.first { $0.nation == war.attacker }
        if let a = inField { flyTo(Double(a.x), Double(a.y)) }
    }
    private func warCard(_ map: WorldMap, _ state: GameState, _ war: GameState.War) -> some View {
        Group2 {
            Button { showFront(map, state, war) } label: {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        NationChip(map: map, nation: war.attacker)
                        Text("伐").font(Theme.kai(14)).foregroundStyle(Theme.seal)
                        NationChip(map: map, nation: war.defender)
                        Spacer(minLength: 4)
                        Image(systemName: "scope").font(.system(size: 14)).foregroundStyle(Theme.seal)
                    }
                    Text("\(war.casusBelli) · \(war.goal)").font(Theme.kai(13)).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8)
                    WarBalance(map: map, state: state, war: war)
                }
                .padding(.horizontal, 14).padding(.vertical, 12).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
    }
    var body: some View {
        if let map = model.map, let state = model.state {
            // Armies by state, built lazily as the list scrolls (hundreds of rows made opening slow).
            let byNation = Dictionary(grouping: state.armies.indices.filter { filter == "navy" || filter == "wars" || filter == "overview" ? false : filter == "all" || (filter == "manual" ? state.armies[$0].manual : state.armies[$0].status == "fighting" || state.armies[$0].status == "sieging") }, by: { state.armies[$0].nation })
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "军事", subtitle: "\(state.armies.count) 支军队" + ((state.fleets ?? []).isEmpty ? "" : " · \(state.fleets!.count) 支舰队"))
                    ChipPicker(items: [("overview", "军情"), ("all", "全部"), ("wars", "战局"), ("battle", "交战围城"), ("manual", "亲自指挥"), ("navy", "舰队")], selection: $filter).padding(.horizontal, 16)
                    // 全军交 AI: every army and fleet the player commands goes back to the war council.
                    let manualCount = state.armies.filter(\.manual).count
                    if manualCount > 0 {
                        HStack(spacing: 10) {
                            Text("亲自指挥 \(manualCount) 支").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                            Spacer()
                            Button {
                                Task { let out = await model.releaseToAI(armies: []); released = out.reason }
                            } label: { SecondaryLabel(title: "全部交还 AI", symbol: "cpu") }.buttonStyle(.plain)
                        }
                        .padding(.horizontal, 22)
                    }
                    if let released { Text(released).font(Theme.kai(13)).foregroundStyle(Theme.jade).padding(.horizontal, 22).transition(.opacity) }
                    if filter == "overview" { MilitaryOverview(map: map, state: state, select: select, flyTo: flyTo, generals: generals) }
                    if filter == "wars" {
                        if state.wars.isEmpty { Text("天下暂无战事").font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(.horizontal, 22) }
                        ForEach(state.wars) { war in warCard(map, state, war) }
                    }
                    if byNation.isEmpty && filter != "navy" && filter != "wars" { Text("暂无符合条件的陆军").font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(.horizontal, 22) }
                    ForEach(state.nations.indices, id: \.self) { n in
                        let rows = (byNation[n] ?? []).sorted { state.armies[$0].troops > state.armies[$1].troops }
                        if !rows.isEmpty {
                            HStack {
                                NationChip(map: map, nation: n)
                                Spacer()
                                Text("\(rows.count) 支 · \(Names.wan(rows.reduce(0) { $0 + state.armies[$1].troops })) 兵").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                            }
                            .padding(.horizontal, 22)
                            let summary = dutySummary(state, rows)
                            if !summary.isEmpty { Text(summary).font(Theme.kai(12)).foregroundStyle(Theme.seal).padding(.horizontal, 22).padding(.top, -8) }
                            Group2 {
                                ForEach(rows, id: \.self) { i in
                                    Button { select(i) } label: { ArmyRow(map: map, army: state.armies[i]) }.buttonStyle(.plain)
                                    if i != rows.last { Divider2() }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                    if filter == "all" || filter == "navy", let fleets = state.fleets, !fleets.isEmpty {
                        SectionLabel("舰队")
                        Group2 {
                            ForEach(fleets.indices, id: \.self) { i in
                                Button { selectFleet(i) } label: { FleetRow(map: map, fleet: fleets[i]) }.buttonStyle(.plain)
                                if i != fleets.indices.last { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    if filter == "all" || filter == "navy", let yards = state.yards, !yards.isEmpty {
                        SectionLabel("船坞")
                        Group2 {
                            ForEach(yards.indices, id: \.self) { i in
                                let y = yards[i]
                                HStack {
                                    Text(y.name).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                                    Spacer()
                                    Text(map.meta.nations.indices.contains(y.nation) ? map.meta.nations[y.nation].name : "").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                                    Text("重建中 · 还需 \(Int(y.months)) 月").font(Theme.kai(14)).foregroundStyle(Theme.seal)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                if i != yards.indices.last { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 24)
            }
            .onAppear { if let t = Self.tourFilter ?? Self.openOn { filter = t; Self.openOn = nil } }
            .task(id: state.day / 30) { generals = await model.generals() }
        }
    }
}

/// 战况: the two sides' field troops as one bar in their colours, the land each side holds of the
/// other's (sieges won), and how long the war has run.
struct WarBalance: View {
    let map: WorldMap; let state: GameState; let war: GameState.War
    var body: some View {
        let attackerSide = war.participants.first { $0.nation == war.attacker }?.side
        let a = Set(war.participants.filter { $0.side == attackerSide }.map(\.nation)).union([war.attacker])
        let d = Set(war.participants.filter { $0.side != attackerSide }.map(\.nation)).union([war.defender]).subtracting(a)
        let at = state.armies.reduce(0) { a.contains($1.nation) ? $0 + $1.troops : $0 }
        let dt = state.armies.reduce(0) { d.contains($1.nation) ? $0 + $1.troops : $0 }
        let share = at + dt > 0 ? Double(at) / Double(at + dt) : 0.5
        let days = max(0, state.day - war.startDay)
        let sieges = state.sieges.filter { s in (a.contains(s.nation) || d.contains(s.nation)) }.count
        VStack(alignment: .leading, spacing: 5) {
            GeometryReader { g in
                HStack(spacing: 0) {
                    Rectangle().fill(color(war.attacker)).frame(width: max(2, g.size.width * share))
                    Rectangle().fill(color(war.defender))
                }
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Theme.ink.opacity(0.25), lineWidth: 0.8))
            }
            .frame(height: 8)
            .animation(Motion.reveal, value: share)
            HStack {
                Text("\(Names.wan(at)) 兵").font(Theme.kai(13)).foregroundStyle(Theme.ink)
                Spacer()
                Text((days >= 360 ? "历时 \(days / 360) 年 \(days % 360 / 30) 月" : "历时 \(max(1, days / 30)) 月") + (sieges > 0 ? " · 围城 \(sieges)" : ""))
                    .font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                Spacer()
                Text("\(Names.wan(dt)) 兵").font(Theme.kai(13)).foregroundStyle(Theme.ink)
            }
            .monospacedDigit()
        }
    }
    private func color(_ n: Int) -> Color { n >= 0 && n < map.meta.nations.count ? Names.color(map.meta.nations[n].color) : Theme.ink2 }
}

/// One state's standing (engine diplomacyInfo).
/// The newest chronicle line above the tab bar. Each line stays at least 1.6 seconds; lines that
/// arrive meanwhile are skipped to the latest, so fast play no longer slides a new line in every step.
struct EventTicker: View {
    let latest: String?
    let open: () -> Void
    @State private var shown: String?
    @State private var changed = Date.distantPast
    @State private var pending: Task<Void, Never>?
    var body: some View {
        VStack {
            if let text = shown {
                Button(action: open) {
                    Text(text).font(Theme.kai(14)).foregroundStyle(Theme.ink).lineLimit(1)
                        .padding(.horizontal, 14).frame(height: 32).glass(Capsule())
                }
                .buttonStyle(.plain).padding(.horizontal, 30)
                .id(text).transition(.push(from: .bottom))
            }
        }
        .onAppear { shown = latest; changed = Date() }
        .onChange(of: latest) { _, next in
            pending?.cancel()
            let wait = 1.6 - Date().timeIntervalSince(changed)
            if wait <= 0 { show(next) }
            else { pending = Task { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)); if !Task.isCancelled { show(next) } } }
        }
    }
    private func show(_ text: String?) {
        guard text != shown else { return }
        withAnimation(Motion.fade) { shown = text }
        changed = Date()
    }
}

struct DiplomacyOverview: Decodable {
    struct Pact: Decodable { let nation: Int; let kind: String; let months: Int }
    struct Truce: Decodable { let nation: Int; let days: Int }
    struct Neighbor: Decodable { let nation: Int; let troops: Int }
    let allies: [Int]; let overlord: Int?; let vassals: [Int]; let pacts: [Pact]; let truces: [Truce]; let enemies: [Int]; let neighbors: [Neighbor]; let troops: Int
}

/// 邦交总览: the chosen state's allies, overlord and vassals, treaties, truces, wars and neighbours.
struct DiplomacyOverviewView: View {
    @ObservedObject var model: GameModel
    let map: WorldMap; let nation: Int; let day: Int; let troops: Int
    @State private var info: DiplomacyOverview?
    var body: some View {
        Group2 {
            if let info {
                row("盟友", info.allies, empty: "无同盟")
                Divider2()
                if let lord = info.overlord { row("宗主", [lord], empty: ""); Divider2() }
                row("附庸", info.vassals, empty: "无附庸")
                Divider2()
                row("交战", info.enemies, empty: "无战事", warn: true)
                Divider2()
                labeled("条约", info.pacts.isEmpty ? [] : info.pacts.map { ($0.nation, ($0.kind == "marriage" ? "联姻" : "互不侵犯") + " · 余 \($0.months) 月") }, empty: "无条约")
                Divider2()
                labeled("停战", info.truces.map { ($0.nation, "余 \($0.days) 日") }, empty: "无停战期")
                Divider2()
                labeled("接壤", info.neighbors.sorted { $0.troops > $1.troops }.map { n in
                    let ratio = troops > 0 ? Double(n.troops) / Double(troops) : 0
                    return (n.nation, "\(Names.wan(n.troops)) 兵" + (troops > 0 ? (ratio > 1.5 ? " · 强于我" : ratio < 0.67 ? " · 弱于我" : " · 相当") : ""))
                }, empty: "无接壤国")
            } else {
                Text("载入……").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 14)
            }
        }
        .task(id: "\(nation)-\(day)") { info = await model.diplomacyInfo(nation) }
    }
    private func name(_ n: Int) -> String { n >= 0 && n < map.meta.nations.count ? map.meta.nations[n].name : "无主" }
    private func color(_ n: Int) -> Color { n >= 0 && n < map.meta.nations.count ? Names.color(map.meta.nations[n].color) : .gray }
    private func row(_ title: String, _ nations: [Int], empty: String, warn: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title).font(Theme.kai(16)).foregroundStyle(Theme.ink2).frame(width: 44, alignment: .leading)
            if nations.isEmpty { Text(empty).font(Theme.kai(15)).foregroundStyle(Theme.ink2.opacity(0.7)) }
            else {
                Text(nations.map(name).joined(separator: "、")).font(Theme.kai(16)).foregroundStyle(warn ? Theme.seal : Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
    private func labeled(_ title: String, _ items: [(Int, String)], empty: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(title).font(Theme.kai(16)).foregroundStyle(Theme.ink2).frame(width: 44, alignment: .leading)
            if items.isEmpty { Text(empty).font(Theme.kai(15)).foregroundStyle(Theme.ink2.opacity(0.7)) }
            else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(items.indices, id: \.self) { i in
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 2).fill(color(items[i].0)).frame(width: 10, height: 10)
                            Text(name(items[i].0)).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                            Text(items[i].1).font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
}

struct DiplomacySheet: View {
    @ObservedObject var model: GameModel
    let say: (String) -> Void
    /// 联动: the camera to a state's capital, its page, the wars (军事 › 战局) and its records (纪事).
    var fly: (Int) -> Void = { _ in }
    var openNation: (Int) -> Void = { _ in }
    var openWars: () -> Void = {}
    var openChronicle: (Int) -> Void = { _ in }
    @State private var attacker = 0
    @State private var defender = 1
    var body: some View {
        if let map = model.map, let state = model.state {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "外交", subtitle: state.wars.isEmpty ? "天下太平" : "\(state.wars.count) 场战争进行中")
                    DiplomacyBoard(model: model, map: map, state: state, nation: attacker, fly: fly, openNation: openNation, openWars: openWars, openChronicle: openChronicle)
                    if !state.wars.isEmpty {
                        SectionLabel("战事")
                        Group2 {
                            ForEach(state.wars) { war in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(spacing: 8) {
                                        NationChip(map: map, nation: war.attacker)
                                        Image(systemName: "bolt.fill").font(.caption).foregroundStyle(Theme.seal)
                                        NationChip(map: map, nation: war.defender)
                                        Spacer()
                                        Button("议和") {
                                            Task { if let e = await model.makePeace(war.attacker, war.defender) { say(e) } else { say("两国议和") } }
                                        }
                                        .font(Theme.kai(15)).padding(.horizontal, 12).padding(.vertical, 5)
                                        .background(Theme.jade.opacity(0.12), in: Capsule()).foregroundStyle(Theme.jade).buttonStyle(.plain)
                                    }
                                    Text([war.casusBelli, war.goal].filter { !$0.isEmpty }.joined(separator: " · ")).font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                                    if war.participants.count > 2 {
                                        Text("参战：" + war.participants.compactMap { p in p.nation >= 0 && p.nation < map.meta.nations.count ? map.meta.nations[p.nation].name : nil }.joined(separator: "、"))
                                            .font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                                    }
                                    WarBalance(map: map, state: state, war: war)
                                }
                                .padding(16)
                                if war.id != state.wars.last?.id { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    SectionLabel("往来国与目标国")
                    Group2 {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("发起国").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                            NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive }, selection: $attacker)
                            Text("目标国").font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(.top, 6)
                            NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive && $0 != attacker }, selection: $defender)
                        }
                        .padding(14)
                        Divider2()
                        Button {
                            Task { if let e = await model.declareWar(attacker, on: defender) { say(e) } else { say(model.state?.events.last?.text ?? "已宣战") } }
                        } label: { Label("宣战", systemImage: "flag.2.crossed").font(Theme.kai(18)).frame(maxWidth: .infinity).padding(.vertical, 13).foregroundStyle(Theme.seal) }
                        .buttonStyle(.plain).disabled(attacker == defender || !state.nations.indices.contains(attacker) || !state.nations.indices.contains(defender) || !state.nations[attacker].alive || !state.nations[defender].alive)
                    }
                    .padding(.horizontal, 16)
                    SectionLabel("条约与邦交")
                    DiplomaticActions(model: model, source: attacker, target: defender, say: say).padding(.horizontal, 16)
                    SectionLabel("邦交总览")
                    DiplomacyOverviewView(model: model, map: map, nation: attacker, day: state.day / 30, troops: state.nations.indices.contains(attacker) ? state.nations[attacker].troops : 0)
                        .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
                .onChange(of: attacker) { _, value in
                    if defender == value { defender = state.nations.indices.first { $0 != value && state.nations[$0].alive } ?? -1 }
                }
            }
        }
    }
}

/// The chronicle as a hand scroll: wooden rods, entries brushed in newest first, war in vermilion,
/// peace in jade, the newest marked with a small seal.
/// 天下大势: the great powers' share of the land, the wars and the states still standing.
struct WorldSummary: View {
    @ObservedObject var model: GameModel
    var body: some View {
        if let state = model.state, let map = model.map {
            let total = max(1, state.owners.filter { $0 >= 0 }.count)
            let powers = state.nations.indices.filter { state.nations[$0].alive && $0 < map.meta.nations.count }
                .sorted { state.nations[$0].provinces > state.nations[$1].provinces }.prefix(4)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("天下大势").font(Theme.kai(18)).foregroundStyle(Theme.ink)
                    Spacer()
                    Text("\(state.nations.filter(\.alive).count) 国 · \(state.wars.count) 场战争").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                }
                // The land in one band, each great power its colour.
                GeometryReader { g in
                    HStack(spacing: 1) {
                        ForEach(Array(powers), id: \.self) { n in
                            Rectangle().fill(Names.color(map.meta.nations[n].color))
                                .frame(width: max(2, g.size.width * CGFloat(state.nations[n].provinces) / CGFloat(total)))
                        }
                        Rectangle().fill(Theme.ink.opacity(0.1))
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 8)
                ForEach(Array(powers.enumerated()), id: \.element) { i, n in
                    HStack(spacing: 8) {
                        Text(ChineseNumeral.of(i + 1)).font(Theme.kai(13)).foregroundStyle(Theme.seal).frame(width: 22)
                        RoundedRectangle(cornerRadius: 2).fill(Names.color(map.meta.nations[n].color)).frame(width: 10, height: 10)
                        Text(map.meta.nations[n].name).font(Theme.kai(15)).foregroundStyle(Theme.ink).lineLimit(1)
                        Spacer()
                        Text("\(Int((Double(state.nations[n].provinces) / Double(total) * 100).rounded()))%").font(Theme.kai(14)).foregroundStyle(Theme.ink2).monospacedDigit()
                    }
                }
            }
            .padding(14)
            .paperCard()
        }
    }
}

struct ChronicleSheet: View {
    @ObservedObject var model: GameModel
    var fly: (Int) -> Void = { _ in }
    @State private var unrolled = false
    @State private var category = "all"
    @State private var entries: [ChronicleEntry] = []
    @State private var open: String?
    /// 岁纪 counts every kind of record, whatever category is listed below.
    @State private var digest: [ChronicleEntry] = []
    /// 只看一国 and 搜寻: the list narrowed to one state's records or to a word.
    @State private var nationFilter: Int?
    /// 联动: another page asks for one state's records once (外交 › 史).
    static var openNation: Int?
    @State private var keyword = ""
    private var shown: [ChronicleEntry] {
        entries.filter { e in
            (nationFilter.map { e.nations.contains($0) } ?? true) && (keyword.isEmpty || e.text.contains(keyword) || e.reason.contains(keyword))
        }
    }
    private func yearLabel(_ year: Int) -> String { year > 0 ? "\(year)" : "前\(1 - year)" }
    private var filterName: String? {
        guard let n = nationFilter, let map = model.map, n >= 0, n < map.meta.nations.count else { return nil }
        return MapLayers.stateLabel(map.meta.nations[n].name, full: false)
    }
    static let categories = [("all", "要闻"), ("politics", "政权"), ("reform", "制度"), ("culture", "文化"), ("religion", "宗教"), ("war", "战争"), ("territory", "领土"), ("diplomacy", "外交"), ("family", "家族"), ("events", "天时人事")]
    private var era: String { (model.state?.era).flatMap { $0.isEmpty ? nil : $0 } ?? "公元" }
    /// The year of a day (the calendar runs 365¼ days a year from the state's current date).
    private func yearOf(_ day: Int) -> Int {
        guard let s = model.state else { return 1 }
        let dayOfYear = Double(s.date.month - 1) * 30.44 + Double(s.date.day - 1)
        return s.displayYear + Int(((dayOfYear - Double(s.day - day)) / 365.25).rounded(.down))
    }
    var body: some View {
        ZStack {
            MemorialPaper()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    MemorialHeader(title: "纪事", subtitle: model.state?.dateText, seal: "史")
                    WorldSummary(model: model).padding(.horizontal, 16)
                    ChronicleDigest(entries: digest, yearOf: yearOf, yearText: yearLabel).padding(.horizontal, 16)
                    // 大事记 by category: the whole chronicle (not only the latest lines), grouped by year;
                    // tap an entry for why it happened.
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Self.categories, id: \.0) { c in
                                let on = category == c.0
                                Button { category = c.0 } label: {
                                    Text(c.1).font(Theme.kai(15)).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                        .padding(.horizontal, 14).frame(height: 40)
                                        .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.2)))
                                }
                                .buttonStyle(PressStyle())
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    ChronicleFilterBar(keyword: $keyword, nation: filterName, clearNation: { nationFilter = nil }).padding(.horizontal, 16)
                    VStack(spacing: 0) {
                        let entries = shown
                        ScrollRod().padding(.horizontal, 6)
                        LazyVStack(alignment: .leading, spacing: 0) {
                            if entries.isEmpty { Text("尚无记载").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 20) }
                            ForEach(Array(entries.enumerated()), id: \.offset) { i, e in
                                let year = yearOf(e.day)
                                if i == 0 || yearOf(entries[i - 1].day) != year {
                                    Text(year > 0 ? "\(era)\(year)年" : "\(era)前\(1 - year)年").font(Theme.kai(15)).foregroundStyle(Theme.seal)
                                        .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 2)
                                }
                                Button { withAnimation(Motion.fade) { open = open == e.id ? nil : e.id } } label: {
                                    HStack(alignment: .top, spacing: 10) {
                                        KindSeal(kind: .of(e.kind), size: 20).padding(.top, 1)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(e.text).font(Theme.kai(16)).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading)
                                            if open == e.id, !e.reason.isEmpty {
                                                Text(e.reason).font(Theme.kai(13)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading)
                                            }
                                        }
                                        Spacer(minLength: 0)
                                        if i == 0 { Seal(text: "新", size: 22) }
                                    }
                                    .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 3).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                ChronicleEntryMeta(entry: e, map: model.map, today: model.state?.day ?? e.day) { n in
                                    withAnimation(Motion.fade) { nationFilter = nationFilter == n ? nil : n }
                                }
                                .padding(.leading, 48).padding(.trailing, 18).padding(.bottom, 7)
                                if open == e.id, let place = e.province {
                                    Button { fly(place) } label: {
                                        HStack(spacing: 5) {
                                            Image(systemName: "scope").font(.system(size: 12))
                                            Text("在舆图上查看").font(Theme.kai(13))
                                        }
                                        .foregroundStyle(Theme.seal).padding(.leading, 48).padding(.bottom, 8)
                                    }
                                    .buttonStyle(PressStyle())
                                }
                                if i < entries.count - 1 { Rectangle().fill(Theme.ink.opacity(0.08)).frame(height: 0.7).padding(.leading, 48).padding(.trailing, 18) }
                            }
                        }
                        .padding(.vertical, 8)
                        .background(Theme.paper2.opacity(0.55))
                        .overlay(Rectangle().stroke(Theme.ink.opacity(0.12), lineWidth: 0.8))
                        .padding(.horizontal, 16)
                        .scaleEffect(x: 1, y: unrolled ? 1 : 0.02, anchor: .top)
                        ScrollRod().padding(.horizontal, 6)
                    }
                    .padding(.horizontal, 10)
                }
                .padding(.bottom, 28)
            }
        }
        .onAppear {
            if let n = Self.openNation { nationFilter = n; Self.openNation = nil }
            withAnimation(Motion.drift) { unrolled = true }
        }
        .task(id: "\(category)-\((model.state?.day ?? 0) / 30)") { entries = await model.chronicle(category) }
        .task(id: (model.state?.day ?? 0) / 30) { digest = await model.chronicle("all") }
    }
}
