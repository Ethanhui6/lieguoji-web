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
                            InkIcon(glyph: .search, size: 15, weight: 1.65).foregroundStyle(Theme.ink2)
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
                                    RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Names.color(n.color)).frame(width: 22, height: 22)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack(spacing: 6) {
                                            Text(n.name).font(Theme.section).foregroundStyle(s.alive ? Theme.ink : Theme.ink2).lineLimit(1).minimumScaleFactor(0.7)
                                            if !s.alive { Text("已亡").font(Theme.caption).foregroundStyle(Theme.ink2) }
                                        }
                                        HStack(spacing: 6) {
                                            Text("\(Names.polity[n.polity] ?? n.polity) · \(Names.culture[n.culture] ?? n.culture)文化").font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1)
                                            if !s.enemies.isEmpty { Text("交战").font(Theme.caption).foregroundStyle(Theme.seal).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.seal.opacity(0.1), in: Capsule()) }
                                        }
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 3) {
                                        Text("\(s.provinces) 省").font(Theme.section).foregroundStyle(Theme.ink)
                                        Text("\(Names.wan(s.population))人 · \(Names.wan(s.troops))兵").font(Theme.label).foregroundStyle(Theme.ink2)
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
    var openNation: (Int) -> Void = { _ in }
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
        let alliesCount = max(0, war.participants.count - 2)
        return Group2 {
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 8) {
                    let atkCulture = map.meta.nations.indices.contains(war.attacker) ? map.meta.nations[war.attacker].culture : nil
                    Button { GameFeel.shared.tap(); openNation(war.attacker) } label: { NationChip(map: map, nation: war.attacker) }.buttonStyle(.plain)
                    ArtEmblem(image: BundleArt.warCrest(for: atkCulture), size: 22, fallback: .war)
                    Button { GameFeel.shared.tap(); openNation(war.defender) } label: { NationChip(map: map, nation: war.defender) }.buttonStyle(.plain)
                    Spacer(minLength: 4)
                    Button { GameFeel.shared.tap(); showFront(map, state, war) } label: {
                        HStack(spacing: 4) {
                            InkIcon(glyph: .locate, size: 13, weight: 1.7)
                            Text("前线").font(Theme.caption)
                        }
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, 9).frame(height: 26)
                        .background(Theme.seal.opacity(0.09), in: Capsule())
                        .overlay(Capsule().stroke(Theme.seal.opacity(0.3), lineWidth: 0.8))
                    }
                    .buttonStyle(PressStyle())
                }
                HStack(spacing: 6) {
                    Text([war.casusBelli, war.goal].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: 4)
                    if alliesCount > 0 {
                        PaperTag(text: "另 \(alliesCount) 国参战", color: Theme.ink2)
                    }
                }
                WarBalance(map: map, state: state, war: war)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
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
                            Text("亲自指挥 \(manualCount) 支").font(Theme.label).foregroundStyle(Theme.ink2)
                            Spacer()
                            Button {
                                Task { let out = await model.releaseToAI(armies: []); released = out.reason }
                            } label: { SecondaryLabel(title: "全部交还 AI", symbol: "cpu") }.buttonStyle(.plain)
                        }
                        .padding(.horizontal, Theme.Layout.sectionInset)
                    }
                    if let released { Text(released).font(Theme.label).foregroundStyle(Theme.jade).padding(.horizontal, Theme.Layout.sectionInset).transition(.opacity) }
                    if filter == "overview" { MilitaryOverview(map: map, state: state, select: select, flyTo: flyTo, generals: generals) }
                    if filter == "wars" {
                        if !state.wars.isEmpty {
                            let involved = Set(state.wars.flatMap { [$0.attacker, $0.defender] + $0.participants.map(\.nation) })
                            let frontTroops = state.armies.reduce(0) { involved.contains($1.nation) ? $0 + $1.troops : $0 }
                            let fightingNow = state.armies.filter { $0.status == "fighting" }.count
                            StatStrip(tiles: [
                                StatTile(label: "战事", value: "\(state.wars.count)场", warn: true),
                                StatTile(label: "参战国", value: "\(involved.count)国"),
                                StatTile(label: "前线兵力", value: Names.wan(frontTroops)),
                                StatTile(label: "交锋/围城", value: "\(fightingNow)/\(state.sieges.count)"),
                            ])
                        }
                        if state.wars.isEmpty { Text("天下暂无战事").font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset) }
                        ForEach(state.wars) { war in warCard(map, state, war) }
                    }
                    if byNation.isEmpty && filter != "navy" && filter != "wars" && filter != "overview" { Text("暂无符合条件的陆军").font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset) }
                    ForEach(state.nations.indices, id: \.self) { n in
                        let rows = (byNation[n] ?? []).sorted { state.armies[$0].troops > state.armies[$1].troops }
                        if !rows.isEmpty {
                            HStack {
                                NationChip(map: map, nation: n)
                                Spacer()
                                Text("\(rows.count) 支 · \(Names.wan(rows.reduce(0) { $0 + state.armies[$1].troops })) 兵").font(Theme.label).foregroundStyle(Theme.ink2)
                            }
                            .padding(.horizontal, Theme.Layout.sectionInset)
                            let summary = dutySummary(state, rows)
                            if !summary.isEmpty { Text(summary).font(Theme.caption).foregroundStyle(Theme.seal).padding(.horizontal, Theme.Layout.sectionInset).padding(.top, -8) }
                            Group2 {
                                ForEach(rows, id: \.self) { i in
                                    Button { select(i) } label: { ArmyRow(map: map, army: state.armies[i]) }.buttonStyle(.plain)
                                    if i != rows.last { Divider2() }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                    if filter == "navy" {
                        let activeFleets = (state.fleets ?? []).filter { $0.status != "lost" }
                        let totalShips = activeFleets.reduce(0) { $0 + $1.ships }
                        let seaFights = (state.seaBattles ?? []).count
                        let blockadedPorts = (state.ports ?? []).filter { $0.blockaded == true || $0.occupier != $0.owner || $0.value < 99.5 }.count
                        StatStrip(tiles: [
                            StatTile(label: "现役舰队", value: "\(activeFleets.count)支"),
                            StatTile(label: "总战船", value: "\(totalShips)艘"),
                            StatTile(label: "海港/封锁", value: "\((state.ports ?? []).count)/\(blockadedPorts)", warn: blockadedPorts > 0),
                            StatTile(label: "海战/船坞", value: "\(seaFights)/\((state.yards ?? []).count)", warn: seaFights > 0),
                        ])
                        if let sbs = state.seaBattles, !sbs.isEmpty {
                            SectionLabel("当前海上会战（\(sbs.count) 处交火海域）")
                            if !UIAccessibility.isReduceMotionEnabled, InkVideoStage.hasVideo("herald-naval") {
                                InkVideoStage(clip: "herald-naval", cornerRadius: 10, tint: Theme.seal)
                                    .frame(height: 56)
                                    .padding(.horizontal, 16)
                            }
                            Group2 {
                                ForEach(Array(sbs.enumerated()), id: \.offset) { idx, sb in
                                    let na = sb.count >= 4 ? Int(sb[2]) : -1
                                    let nb = sb.count >= 4 ? Int(sb[3]) : -1
                                    let sa = sb.count >= 6 ? Int(sb[4]) : 0
                                    let sbStrength = sb.count >= 6 ? Int(sb[5]) : 0
                                    Button {
                                        GameFeel.shared.tap()
                                        if sb.count >= 2 { flyTo(sb[0], sb[1]) }
                                    } label: {
                                        HStack(spacing: 10) {
                                            InkIcon(glyph: .war, size: 15, weight: 1.75).foregroundStyle(Theme.danger)
                                            if map.meta.nations.indices.contains(na) { NationChip(map: map, nation: na) }
                                            Text("vs").font(Theme.caption).foregroundStyle(Theme.ink2)
                                            if map.meta.nations.indices.contains(nb) { NationChip(map: map, nation: nb) }
                                            Spacer()
                                            if sa + sbStrength > 0 {
                                                Text("\(Names.wan(sa)) : \(Names.wan(sbStrength))").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                            }
                                            PaperTag(text: "观战", color: Theme.seal, size: 10)
                                        }
                                        .padding(.horizontal, 14).padding(.vertical, 10).contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    if idx < sbs.count - 1 { Divider2() }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                    if filter == "all" || filter == "navy", let fleets = state.fleets, !fleets.isEmpty {
                        SectionLabel("水师舰队")
                        Group2 {
                            ForEach(fleets.indices, id: \.self) { i in
                                Button { selectFleet(i) } label: { FleetRow(map: map, fleet: fleets[i]) }.buttonStyle(.plain)
                                if i != fleets.indices.last { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    } else if filter == "navy" {
                        Text("天下尚无现役水师舰队").font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset)
                    }
                    if filter == "all" || filter == "navy", let yards = state.yards, !yards.isEmpty {
                        SectionLabel("船坞")
                        Group2 {
                            ForEach(yards.indices, id: \.self) { i in
                                let y = yards[i]
                                HStack {
                                    Text(y.name).font(Theme.body).foregroundStyle(Theme.ink)
                                    Spacer()
                                    Text(map.meta.nations.indices.contains(y.nation) ? map.meta.nations[y.nation].name : "").font(Theme.label).foregroundStyle(Theme.ink2)
                                    Text("重建中 · 还需 \(Int(y.months)) 月").font(Theme.label).foregroundStyle(Theme.seal)
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
        let attPct = Int((share * 100).rounded())
        let defPct = 100 - attPct
        let days = max(0, state.day - war.startDay)
        let sieges = state.sieges.filter { s in (a.contains(s.nation) || d.contains(s.nation)) }.count
        VStack(alignment: .leading, spacing: 5) {
            GeometryReader { g in
                ZStack {
                    HStack(spacing: 0) {
                        Rectangle().fill(color(war.attacker)).frame(width: max(2, g.size.width * share))
                        Rectangle().fill(color(war.defender))
                    }
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Theme.ink.opacity(0.25), lineWidth: 0.8))
                    // 中线刻度，便于一眼看出双方强弱优劣
                    Rectangle().fill(Theme.paper2.opacity(0.9)).frame(width: 1.5, height: 10)
                }
            }
            .frame(height: 10)
            .animation(Motion.reveal, value: share)
            HStack {
                Text("攻 \(Names.wan(at))（\(attPct)%）").font(Theme.caption).foregroundStyle(Theme.ink)
                Spacer()
                Text((days >= 360 ? "\(days / 360)年\(days % 360 / 30)月" : "\(max(1, days / 30))月") + (sieges > 0 ? " · 围城\(sieges)" : ""))
                    .font(Theme.caption).foregroundStyle(sieges > 0 ? Theme.seal : Theme.ink2)
                Spacer()
                Text("守 \(Names.wan(dt))（\(defPct)%）").font(Theme.caption).foregroundStyle(Theme.ink)
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
                    HStack(spacing: 7) {
                        Circle().fill(Theme.seal).frame(width: 6, height: 6)
                            .overlay(Circle().stroke(Theme.seal.opacity(0.3), lineWidth: 2.5))
                        Text(text).font(Theme.label).foregroundStyle(Theme.ink).lineLimit(1)
                    }
                    .padding(.horizontal, 14).frame(height: Theme.Control.tickerHeight).glass(Capsule())
                }
                .buttonStyle(PressStyle()).padding(.horizontal, 4)
                .id(text).transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .move(edge: .top).combined(with: .opacity)))
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
    struct Reason: Decodable, Identifiable { let label: String; let delta: Int; var id: String { "\(label)-\(delta)" } }
    struct TreatyTag: Decodable, Identifiable { let kind: String; let label: String; let months: Int; var id: String { "\(kind)-\(months)" } }
    struct OpinionEntry: Decodable, Identifiable {
        let nation: Int; let score: Int; let stance: String; let hegemonThreat: Int; let troops: Int
        let neighbor: Bool; let claim: Bool; let claimedBy: Bool
        let treaties: [TreatyTag]; let reasons: [Reason]
        var id: Int { nation }
    }
    struct Hegemon: Decodable, Identifiable { let nation: Int; let threat: Int; var id: Int { nation } }
    struct MediatableWar: Decodable, Identifiable { let a: Int; let b: Int; var id: String { "\(a)-\(b)" } }
    let allies: [Int]; let overlord: Int?; let vassals: [Int]; let pacts: [Pact]; let truces: [Truce]; let enemies: [Int]; let neighbors: [Neighbor]; let troops: Int
    var opinions: [OpinionEntry]? = nil
    var hegemons: [Hegemon]? = nil
    var mediatableWars: [MediatableWar]? = nil

    static func treatyLabel(_ kind: String) -> String {
        switch kind {
        case "marriage": return "联姻"
        case "trade": return "通商"
        case "defense": return "共防"
        case "access": return "通行"
        case "tribute": return "岁币"
        default: return "互不侵犯"
        }
    }
}

/// 邦交总览: the chosen state's allies, overlord and vassals, treaties, truces, wars and neighbours.
struct DiplomacyOverviewView: View {
    @ObservedObject var model: GameModel
    let map: WorldMap; let nation: Int; let day: Int; let troops: Int
    @State private var info: DiplomacyOverview?
    @State private var failed = false
    @State private var attempt = 0
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
                labeled("条约", info.pacts.isEmpty ? [] : info.pacts.map { ($0.nation, DiplomacyOverview.treatyLabel($0.kind) + " · 余 \($0.months) 月") }, empty: "无条约")
                Divider2()
                labeled("停战", info.truces.map { ($0.nation, "余 \($0.days) 日") }, empty: "无停战期")
                Divider2()
                labeled("接壤", info.neighbors.sorted { $0.troops > $1.troops }.map { n in
                    let ratio = troops > 0 ? Double(n.troops) / Double(troops) : 0
                    return (n.nation, "\(Names.wan(n.troops)) 兵" + (troops > 0 ? (ratio > 1.5 ? " · 强于我" : ratio < 0.67 ? " · 弱于我" : " · 相当") : ""))
                }, empty: "无接壤国")
            } else {
                PanelPending(failed: failed) { attempt += 1 }
            }
        }
        .task(id: "\(nation)-\(day)-\(attempt)") { info = await model.diplomacyInfo(nation); failed = info == nil }
    }
    private func name(_ n: Int) -> String { n >= 0 && n < map.meta.nations.count ? map.meta.nations[n].name : "无主" }
    private func color(_ n: Int) -> Color { n >= 0 && n < map.meta.nations.count ? Names.color(map.meta.nations[n].color) : .gray }
    private func row(_ title: String, _ nations: [Int], empty: String, warn: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title).font(Theme.body).foregroundStyle(Theme.ink2).frame(width: 44, alignment: .leading)
            if nations.isEmpty { Text(empty).font(Theme.body).foregroundStyle(Theme.ink2.opacity(0.7)) }
            else {
                Text(nations.map(name).joined(separator: "、")).font(Theme.body).foregroundStyle(warn ? Theme.seal : Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
    private func labeled(_ title: String, _ items: [(Int, String)], empty: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(title).font(Theme.body).foregroundStyle(Theme.ink2).frame(width: 44, alignment: .leading)
            if items.isEmpty { Text(empty).font(Theme.body).foregroundStyle(Theme.ink2.opacity(0.7)) }
            else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(items.indices, id: \.self) { i in
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 2).fill(color(items[i].0)).frame(width: 10, height: 10)
                            Text(name(items[i].0)).font(Theme.body).foregroundStyle(Theme.ink)
                            Text(items[i].1).font(Theme.label).foregroundStyle(Theme.ink2)
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
    @State private var tab = "board"
    @State private var attacker = 0
    @State private var defender = 1
    @State private var pickingRole: PickRole? = nil
    @State private var pairInfo: DiplomacyOverview? = nil

    private enum PickRole: String, Identifiable {
        case board, source, target
        var id: String { rawValue }
        var title: String {
            switch self {
            case .board: return "切换观察国家"
            case .source: return "选择发起国"
            case .target: return "选择目标国"
            }
        }
    }

    var body: some View {
        if let map = model.map, let state = model.state {
            let alive = state.nations.indices
                .filter { state.nations[$0].alive && $0 < map.meta.nations.count }
                .sorted { state.nations[$0].provinces != state.nations[$1].provinces ? state.nations[$0].provinces > state.nations[$1].provinces : $0 < $1 }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "外交", subtitle: state.wars.isEmpty ? "四海承平 · 邦交纵横" : "\(state.wars.count) 场战争进行中 · \(alive.count) 国存世", seal: "盟")
                    ChipPicker(items: [("board", "邦交总览"), ("actions", "遣使缔约"), ("wars", "列国战局")], selection: $tab)
                        .padding(.horizontal, Theme.Layout.pageInset)

                    if tab == "board" {
                        DiplomacyBoard(
                            model: model, map: map, state: state, nation: attacker,
                            fly: fly, openNation: openNation, openWars: openWars, openChronicle: openChronicle,
                            onSwitchNation: alive.count > 1 ? { pickingRole = .board } : nil
                        )
                    } else if tab == "actions" {
                        envoyPanel(map: map, state: state, alive: alive)
                    } else {
                        warsPanel(map: map, state: state, aliveCount: alive.count)
                    }
                }
                .padding(.bottom, 24)
                .onAppear {
                    if !alive.contains(attacker), let first = alive.first { attacker = first }
                    if !alive.contains(defender) || defender == attacker { defender = alive.first { $0 != attacker } ?? -1 }
                }
                .onChange(of: attacker) { _, value in
                    if defender == value || !alive.contains(defender) { defender = alive.first { $0 != value } ?? -1 }
                }
            }
            .task(id: "\(tab)-\(attacker)-\(defender)-\(state.day / 30)") {
                guard tab == "actions", alive.contains(attacker) else { return }
                pairInfo = await model.diplomacyInfo(attacker)
            }
            .sheet(item: $pickingRole) { role in
                nationPickerSheet(role: role, map: map, state: state, alive: alive)
                    .presentationDetents([.medium, .large])
                    .presentationBackground { MemorialPaper() }
                    .presentationDragIndicator(.hidden)
                    .presentationCornerRadius(Theme.Control.cornerSheet)
                    .font(Theme.section)
            }
        }
    }

    // MARK: - 遣使缔约：双边对席卡片 + 实时好感态势 + 宣战/议和 + 深度条约台

    @ViewBuilder
    private func envoyPanel(map: WorldMap, state: GameState, alive: [Int]) -> some View {
        let validPair = attacker != defender && state.nations.indices.contains(attacker) && state.nations.indices.contains(defender)
            && state.nations[attacker].alive && state.nations[defender].alive
        let atWar = validPair && state.wars.contains { w in
            (w.attacker == attacker && w.defender == defender) || (w.attacker == defender && w.defender == attacker)
                || (w.participants.contains { $0.nation == attacker } && w.participants.contains { $0.nation == defender })
        }
        let opinion = pairInfo?.opinions?.first(where: { $0.nation == defender })

        SectionLabel("往来对席（轻点切换双方）")
        Group2 {
            VStack(spacing: 12) {
                HStack(spacing: 8) {
                    envoySeat(roleLabel: "发起国", nation: attacker, map: map, state: state) { pickingRole = .source }
                    Button {
                        guard validPair else { return }
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) {
                            let tmp = attacker
                            attacker = defender
                            defender = tmp
                        }
                    } label: {
                        InkIcon(glyph: .swap, size: 15, weight: 1.85)
                            .foregroundStyle(Theme.seal)
                            .frame(width: 34, height: 34)
                            .background(Theme.seal.opacity(0.10), in: Circle())
                            .overlay(Circle().strokeBorder(Theme.seal.opacity(0.28), lineWidth: 0.8))
                    }
                    .buttonStyle(PressStyle())
                    envoySeat(roleLabel: "目标国", nation: defender, map: map, state: state) { pickingRole = .target }
                }

                if validPair {
                    Divider2()
                    HStack(spacing: 10) {
                        if let opinion {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 6) {
                                    Text("双边好感").font(Theme.caption).foregroundStyle(Theme.ink2)
                                    PaperTag(
                                        text: "\(opinion.stance) \(opinion.score > 0 ? "+" : "")\(opinion.score)",
                                        color: atWar || opinion.score <= -22 ? Theme.seal : opinion.score >= 25 ? Theme.jade : Theme.ink2,
                                        size: 11
                                    )
                                }
                                OpinionGauge(score: opinion.score, height: 5)
                            }
                        } else {
                            Text(atWar ? "两国正处于交战状态" : "两国当前处于和平状态")
                                .font(Theme.label).foregroundStyle(atWar ? Theme.seal : Theme.ink2)
                            Spacer()
                        }
                        if atWar {
                            Button {
                                GameFeel.shared.tap()
                                Task {
                                    if let e = await model.makePeace(attacker, defender) { say(e) }
                                    else { say("两国已缔结停战和约") }
                                }
                            } label: {
                                HStack(spacing: 5) {
                                    InkIcon(glyph: .peace, size: 14, weight: 1.85, accent: Theme.paper2.opacity(0.3))
                                    Text("立即议和")
                                }
                                    .font(Theme.label).foregroundStyle(Theme.paper2)
                                    .padding(.horizontal, 14).frame(height: 36)
                                    .background(Theme.jade, in: Capsule())
                            }
                            .buttonStyle(PressStyle())
                        } else {
                            Button {
                                GameFeel.shared.tap()
                                Task {
                                    if let e = await model.declareWar(attacker, on: defender) { say(e) }
                                    else { say(model.state?.events.last?.text ?? "已宣战") }
                                }
                            } label: {
                                HStack(spacing: 5) {
                                    InkIcon(glyph: .war, size: 14, weight: 1.85, accent: Theme.paper2.opacity(0.3))
                                    Text("立即宣战")
                                }
                                    .font(Theme.label).foregroundStyle(Theme.paper2)
                                    .padding(.horizontal, 14).frame(height: 36)
                                    .background(Theme.seal, in: Capsule())
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                }
            }
            .padding(14)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        SectionLabel("条约、联姻与博弈")
        DiplomaticActions(model: model, source: attacker, target: defender, say: say)
            .padding(.horizontal, Theme.Layout.pageInset)
    }

    private func envoySeat(roleLabel: String, nation: Int, map: WorldMap, state: GameState, action: @escaping () -> Void) -> some View {
        let valid = nation >= 0 && nation < map.meta.nations.count && state.nations.indices.contains(nation)
        let color = valid ? Names.color(map.meta.nations[nation].color) : Theme.ink2
        let title = valid ? MapLayers.stateLabel(map.meta.nations[nation].name, full: false) : "请选择"
        let provs = valid ? state.nations[nation].provinces : 0
        return Button {
            GameFeel.shared.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 3.5, style: .continuous).fill(color).frame(width: 6, height: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(roleLabel).font(Theme.kai(11)).foregroundStyle(Theme.ink2)
                    Text(title).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                    if valid { Text("\(provs) 州").font(Theme.kai(10)).foregroundStyle(Theme.ink2).monospacedDigit() }
                }
                Spacer(minLength: 2)
                InkIcon(glyph: .chevronDown, size: 12, weight: 1.8).foregroundStyle(Theme.ink2)
            }
            .padding(.horizontal, 10).padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(Theme.paper.opacity(0.65), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).strokeBorder(Theme.ink.opacity(0.14), lineWidth: 0.85))
            .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        }
        .buttonStyle(PressStyle())
    }

    // MARK: - 列国战局

    @ViewBuilder
    private func warsPanel(map: WorldMap, state: GameState, aliveCount: Int) -> some View {
        let belligerents = Set(state.wars.flatMap { [$0.attacker, $0.defender] + $0.participants.map(\.nation) }).count
        StatStrip(tiles: [
            StatTile(label: "进行战事", value: "\(state.wars.count)", warn: !state.wars.isEmpty),
            StatTile(label: "参战列国", value: "\(belligerents)"),
            StatTile(label: "围城战场", value: "\(state.sieges.count)", warn: !state.sieges.isEmpty),
            StatTile(label: "天下存国", value: "\(aliveCount)"),
        ])

        SectionLabel(state.wars.isEmpty ? "当前战事" : "列国战事（\(state.wars.count) 场）")
        if state.wars.isEmpty {
            Group2 { Row(label: "战事", value: "天下太平，暂无交战") }
                .padding(.horizontal, Theme.Layout.pageInset)
        } else {
            VStack(spacing: 10) {
                ForEach(state.wars) { war in
                    VStack(alignment: .leading, spacing: 9) {
                        HStack(spacing: 6) {
                            Button {
                                GameFeel.shared.tap()
                                openNation(war.attacker)
                            } label: { NationChip(map: map, nation: war.attacker) }
                            .buttonStyle(PressStyle())
                            InkIcon(glyph: .war, size: 14, weight: 1.9).foregroundStyle(Theme.seal)
                            Button {
                                GameFeel.shared.tap()
                                openNation(war.defender)
                            } label: { NationChip(map: map, nation: war.defender) }
                            .buttonStyle(PressStyle())
                            Spacer(minLength: 4)
                            LinkSeal(mark: "都", color: Theme.ink2) { fly(war.defender) }
                            Button {
                                GameFeel.shared.tap()
                                Task { if let e = await model.makePeace(war.attacker, war.defender) { say(e) } else { say("两国议和停战") } }
                            } label: {
                                Text("议和").font(Theme.label).foregroundStyle(Theme.jade)
                                    .padding(.horizontal, 11).frame(height: 28)
                                    .background(Theme.jade.opacity(0.11), in: Capsule())
                                    .overlay(Capsule().stroke(Theme.jade.opacity(0.35), lineWidth: 0.8))
                            }
                            .buttonStyle(PressStyle())
                        }
                        let meta = [war.casusBelli, war.goal].filter { !$0.isEmpty }.joined(separator: " · ")
                        if !meta.isEmpty { Text(meta).font(Theme.label).foregroundStyle(Theme.ink2) }
                        if war.participants.count > 2 {
                            Text("参战：" + war.participants.compactMap { p in p.nation >= 0 && p.nation < map.meta.nations.count ? map.meta.nations[p.nation].name : nil }.joined(separator: "、"))
                                .font(Theme.caption).foregroundStyle(Theme.ink2)
                        }
                        WarBalance(map: map, state: state, war: war)
                    }
                    .padding(14)
                    .paperCard(tint: Theme.seal)
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    // MARK: - 选国弹窗

    @ViewBuilder
    private func nationPickerSheet(role: PickRole, map: WorldMap, state: GameState, alive: [Int]) -> some View {
        let excluded = role == .target ? attacker : -1
        let list = alive.filter { $0 != excluded }
        let selected = role == .target ? defender : attacker
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: role.title, subtitle: "按疆域规模排序，轻点即选", seal: "选")
                Group2 {
                    ForEach(Array(list.enumerated()), id: \.element) { idx, n in
                        let on = n == selected
                        let troops = state.armies.reduce(0) { $1.nation == n ? $0 + $1.troops : $0 }
                        Button {
                            GameFeel.shared.tap()
                            if role == .target { defender = n } else { attacker = n }
                            pickingRole = nil
                        } label: {
                            HStack(spacing: 10) {
                                RoundedRectangle(cornerRadius: 3.5, style: .continuous).fill(Names.color(map.meta.nations[n].color)).frame(width: 8, height: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(map.meta.nations[n].name).font(Theme.section).foregroundStyle(on ? Theme.seal : Theme.ink)
                                    Text("\(state.nations[n].provinces) 州 · \(Names.wan(troops)) 兵").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                }
                                Spacer()
                                if on {
                                    Image(systemName: "checkmark.circle.fill").font(.system(size: 16)).foregroundStyle(Theme.seal)
                                }
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .background(on ? Theme.seal.opacity(0.06) : Color.clear)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if idx < list.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
            .padding(.bottom, 24)
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
                    Text("天下大势").font(Theme.section).foregroundStyle(Theme.ink)
                    Spacer()
                    Text("\(state.nations.filter(\.alive).count) 国 · \(state.wars.count) 场战争").font(Theme.label).foregroundStyle(Theme.ink2)
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
                        Text(ChineseNumeral.of(i + 1)).font(Theme.label).foregroundStyle(Theme.seal).frame(width: 22)
                        RoundedRectangle(cornerRadius: 2).fill(Names.color(map.meta.nations[n].color)).frame(width: 10, height: 10)
                        Text(map.meta.nations[n].name).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                        Spacer()
                        Text("\(Int((Double(state.nations[n].provinces) / Double(total) * 100).rounded()))%").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
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
    var openReplay: (Int?) -> Void = { _ in }
    @State private var page = "annals"
    @State private var category = "all"
    @State private var entries: [ChronicleEntry] = []
    @State private var open: String?
    @State private var limit = 80
    /// 岁纪 counts every kind of record, whatever category is listed below.
    @State private var digest: [ChronicleEntry] = []
    @State private var timeline: ReplayTimelineData?
    /// 只看一国 and 搜寻: the list narrowed to one state's records or to a word.
    @State private var nationFilter: Int?
    /// 联动: another page asks for one state's records once (外交 › 史).
    static var openNation: Int?
    @State private var keyword = ""

    private struct YearGroup: Identifiable {
        let id: Int
        let items: [ChronicleEntry]
    }

    private var shown: [ChronicleEntry] {
        entries.filter { e in
            (nationFilter.map { e.nations.contains($0) } ?? true)
                && (keyword.isEmpty || e.text.contains(keyword) || e.reason.contains(keyword))
        }
    }
    private func yearLabel(_ year: Int) -> String { year > 0 ? "\(year)" : "前\(1 - year)" }
    private var filterName: String? {
        guard let n = nationFilter, let map = model.map, n >= 0, n < map.meta.nations.count else { return nil }
        return MapLayers.stateLabel(map.meta.nations[n].name, full: false)
    }
    static let categories: [(String, String)] = [
        ("all", "要闻"), ("war", "战争"), ("territory", "领土"), ("politics", "政权"),
        ("diplomacy", "外交"), ("reform", "制度"), ("culture", "文化"), ("religion", "宗教"),
        ("family", "家族"), ("events", "人事")
    ]
    private var era: String { (model.state?.era).flatMap { $0.isEmpty ? nil : $0 } ?? "公元" }
    /// The year of a day (the calendar runs 365¼ days a year from the state's current date).
    private func yearOf(_ day: Int) -> Int {
        guard let s = model.state else { return 1 }
        let dayOfYear = Double(s.date.month - 1) * 30.44 + Double(s.date.day - 1)
        return s.displayYear + Int(((dayOfYear - Double(s.day - day)) / 365.25).rounded(.down))
    }

    private func grouped(_ list: [ChronicleEntry]) -> [YearGroup] {
        var out: [YearGroup] = []
        for e in list {
            let y = yearOf(e.day)
            if let last = out.last, last.id == y {
                out[out.count - 1] = YearGroup(id: y, items: last.items + [e])
            } else {
                out.append(YearGroup(id: y, items: [e]))
            }
        }
        return out
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: "史记", subtitle: model.state?.dateText, seal: "史")

                ChipPicker(items: [("annals", "编年大事"), ("era", "兴衰长卷")], selection: $page)
                    .padding(.horizontal, Theme.Layout.pageInset)

                if page == "annals" {
                    annalsBody
                } else {
                    eraOverviewBody
                }
            }
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .onAppear {
            if let n = Self.openNation { nationFilter = n; Self.openNation = nil }
        }
        .onChange(of: category) { _, _ in limit = 80 }
        .task(id: "\(category)-\((model.state?.day ?? 0) / 30)") {
            entries = await model.chronicle(category)
        }
        .task(id: "\(page)-\((model.state?.day ?? 0) / 30)") {
            if page == "era" {
                digest = await model.chronicle("all")
                timeline = await model.replayTimeline()
            }
        }
    }

    @ViewBuilder
    private var annalsBody: some View {
        let allShown = shown
        let visible = Array(allShown.prefix(limit))
        let groups = grouped(visible)
        let newestId = allShown.first?.id

        // 精简山河回放快捷入口（与列国/外交卡片 1:1 统一视觉语言）
        Button {
            GameFeel.shared.tap()
            openReplay(nil)
        } label: {
            HStack(spacing: 11) {
                ArtEmblem(image: BundleArt.sealReplay, size: 36, fallback: .replay)
                VStack(alignment: .leading, spacing: 2) {
                    Text("山河回放 · 时光倒流").font(Theme.section).foregroundStyle(Theme.ink)
                    Text("纵览版图兴替，拖动进度或回溯至历史节点").font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                }
                Spacer(minLength: 6)
                HStack(spacing: 4) {
                    InkIcon(glyph: .replay, size: 13, weight: 1.8)
                    Text("回放").font(Theme.label)
                }
                .foregroundStyle(Theme.paper2)
                .padding(.horizontal, 12).frame(height: 30)
                .background(Theme.seal, in: Capsule())
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .paperCard(tint: Theme.seal)
        }
        .buttonStyle(PressStyle())
        .padding(.horizontal, Theme.Layout.pageInset)

        // 搜索 + 只看一国
        ChronicleFilterBar(keyword: $keyword, nation: filterName, clearNation: { nationFilter = nil })
            .padding(.horizontal, Theme.Layout.pageInset)

        // 轻盈胶囊分类筛选（与军事/外交筛选签完全同高同曲率）
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(Self.categories, id: \.0) { c in
                    let on = category == c.0
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { category = c.0 }
                    } label: {
                        Text(c.1).font(Theme.label)
                            .foregroundStyle(on ? Theme.paper2 : Theme.ink)
                            .padding(.horizontal, 13).frame(height: 32)
                            .background(on ? Theme.seal : Theme.paper2.opacity(0.9), in: Capsule())
                            .overlay(Capsule().strokeBorder(on ? Color.clear : Theme.ink.opacity(0.16), lineWidth: 0.85))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        if groups.isEmpty {
            Group2 {
                Row(label: "史册记载", value: keyword.isEmpty && nationFilter == nil ? "尚无记载" : "未找到相符的纪事")
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        } else {
            ForEach(groups) { group in
                let y = group.id
                HStack(spacing: 6) {
                    SectionLabel(y > 0 ? "\(era)\(y)年" : "\(era)前\(1 - y)年", inset: false)
                    Spacer()
                    Text("\(group.items.count) 记").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                }
                .padding(.horizontal, Theme.Layout.sectionInset)
                .padding(.top, 2)

                Group2 {
                    ForEach(Array(group.items.enumerated()), id: \.offset) { idx, e in
                        chronicleRow(e, isNewest: e.id == newestId)
                        if idx < group.items.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            if allShown.count > limit {
                Button {
                    GameFeel.shared.tap()
                    withAnimation(Motion.panel) { limit += 80 }
                } label: {
                    SecondaryLabel(title: "加载更早史册（余 \(allShown.count - limit) 条）", symbol: "book.pages")
                }
                .buttonStyle(PressStyle())
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
    }

    @ViewBuilder
    private func chronicleRow(_ e: ChronicleEntry, isNewest: Bool) -> some View {
        let isOpen = open == e.id
        VStack(alignment: .leading, spacing: 6) {
            Button {
                GameFeel.shared.tap()
                withAnimation(Motion.panel) { open = isOpen ? nil : e.id }
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    KindSeal(kind: .of(e.kind), size: 22).padding(.top, 1)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(e.text)
                            .font(Theme.body)
                            .foregroundStyle(Theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.leading)
                        if isOpen, !e.reason.isEmpty {
                            Text(e.reason)
                                .font(Theme.label)
                                .foregroundStyle(Theme.ink2)
                                .fixedSize(horizontal: false, vertical: true)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    Spacer(minLength: 4)
                    if isNewest {
                        PaperTag(text: "新", color: Theme.seal, size: 11)
                    } else {
                        InkIcon(glyph: .chevronDown, size: 11, weight: 1.7)
                            .foregroundStyle(Theme.ink2.opacity(0.65))
                            .rotationEffect(.degrees(isOpen ? 180 : 0))
                            .padding(.top, 5)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            ChronicleEntryMeta(entry: e, map: model.map, today: model.state?.day ?? e.day) { n in
                GameFeel.shared.tap()
                withAnimation(Motion.tap) { nationFilter = nationFilter == n ? nil : n }
            }
            .padding(.leading, 32)

            if isOpen {
                HStack(spacing: 8) {
                    if let place = e.province {
                        Button {
                            GameFeel.shared.tap()
                            fly(place)
                        } label: {
                            HStack(spacing: 5) {
                                InkIcon(glyph: .locate, size: 12, weight: 1.8)
                                Text("定位舆图").font(Theme.caption)
                            }
                            .foregroundStyle(Theme.seal)
                            .padding(.horizontal, 10).frame(height: 28)
                            .background(Theme.seal.opacity(0.09), in: Capsule())
                            .overlay(Capsule().strokeBorder(Theme.seal.opacity(0.28), lineWidth: 0.7))
                        }
                        .buttonStyle(PressStyle())
                    }
                    Button {
                        GameFeel.shared.tap()
                        openReplay(e.day)
                    } label: {
                        HStack(spacing: 5) {
                            InkIcon(glyph: .replay, size: 12, weight: 1.8)
                            Text("此日回放").font(Theme.caption)
                        }
                        .foregroundStyle(Theme.jade)
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(Theme.jade.opacity(0.10), in: Capsule())
                        .overlay(Capsule().strokeBorder(Theme.jade.opacity(0.28), lineWidth: 0.7))
                    }
                    .buttonStyle(PressStyle())
                    Spacer(minLength: 0)
                }
                .padding(.leading, 32)
                .padding(.top, 2)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(isOpen ? Theme.seal.opacity(0.035) : Color.clear)
    }

    @ViewBuilder
    private var eraOverviewBody: some View {
        WorldSummary(model: model)
            .padding(.horizontal, Theme.Layout.pageInset)

        if let tl = timeline, tl.frames.count >= 2 {
            ChronicleDynastyScroll(timeline: tl) { day in
                GameFeel.shared.tap()
                openReplay(day)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        } else {
            Group2 {
                Row(label: "兴衰长卷", value: "推演满 30 天并留存历史帧后自动生成")
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        ChronicleDigest(entries: digest, yearOf: yearOf, yearText: yearLabel)
            .padding(.horizontal, Theme.Layout.pageInset)
    }
}

/// 纪事页「列国兴衰时间长卷」：横向展示各历史节点的列强疆域消长色带与头号霸主，点击任一节点即可直接跳转至该日山河回放。
struct ChronicleDynastyScroll: View {
    let timeline: ReplayTimelineData
    var onSelectDay: (Int) -> Void

    private var sampledFrames: [ReplayTimelineData.Frame] {
        let all = timeline.frames
        guard all.count > 28 else { return all }
        let step = max(1, all.count / 24)
        var out: [ReplayTimelineData.Frame] = []
        for (i, f) in all.enumerated() {
            if i == 0 || i == all.count - 1 || f.major || i % step == 0 {
                out.append(f)
            }
        }
        return out
    }

    private func nationColor(_ idx: Int) -> Color {
        guard idx >= 0, idx < timeline.nations.count else { return Theme.ink2 }
        return Names.color(timeline.nations[idx].color)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                ArtEmblem(image: BundleArt.sealChronicle, size: 26, fallback: .chronicle)
                Text("列国兴衰长卷").font(Theme.section).foregroundStyle(Theme.ink)
                Spacer(minLength: 4)
                Text("共 \(timeline.frames.count) 帧 · 点按直达回放").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 7) {
                    ForEach(sampledFrames) { f in
                        Button {
                            onSelectDay(f.day)
                        } label: {
                            VStack(spacing: 4) {
                                GeometryReader { geo in
                                    let slices = f.topPowers ?? [ReplayTimelineData.PowerSlice(i: f.topNation, p: max(1, f.topProvinces))]
                                    let total = max(1, slices.reduce(0) { $0 + max(1, $1.p) })
                                    VStack(spacing: 0.5) {
                                        ForEach(slices.prefix(5)) { sl in
                                            Rectangle()
                                                .fill(nationColor(sl.i))
                                                .frame(height: max(3, geo.size.height * CGFloat(sl.p) / CGFloat(total)))
                                        }
                                    }
                                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                                            .strokeBorder(f.major ? Theme.seal : Theme.ink.opacity(0.16), lineWidth: f.major ? 1.1 : 0.6)
                                    )
                                }
                                .frame(width: 26, height: 58)

                                Text(MapLayers.stateLabel(f.topName, full: false))
                                    .font(Theme.kai(10))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                                    .frame(width: 38)
                                Text(f.year > 0 ? "\(f.year)年" : "前\(1 - f.year)")
                                    .font(Theme.kai(9).monospacedDigit())
                                    .foregroundStyle(f.major ? Theme.seal : Theme.ink2)
                                    .lineLimit(1)
                            }
                            .padding(.vertical, 6)
                            .padding(.horizontal, 4)
                            .background(
                                f.major ? Theme.seal.opacity(0.07) : Theme.paper2.opacity(0.75),
                                in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous)
                                    .strokeBorder(f.major ? Theme.seal.opacity(0.28) : Theme.ink.opacity(0.08), lineWidth: 0.6)
                            )
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .padding(14)
        .paperCard()
    }
}
