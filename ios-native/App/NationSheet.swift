import SwiftUI
import LieguojiCore

/// The nation panel (original StateInfoUI): ruler and state, treasury and destiny, diplomatic
/// relations, the state's wars, and the state-level actions (国家行为). While open, the map shows
/// the state's relations: enemies red, allies blue, vassals green, the overlord magenta.
struct NationInfo: Decodable {
    struct Ruler: Decodable { let name: String; let title: String; let age: Double }
    struct Alliance: Decodable { let name: String; let members: [Int] }
    struct Side: Decodable { let nations: [Int]; let losses: Double }
    struct War: Decodable, Identifiable { let id: Int; let casusBelli: String; let goals: [String]; let months: Double; let sides: [Side]; let side: Int; let score: Double? }
    struct Person: Decodable { let role: String; let name: String; let age: Double; let female: Bool; let traits: [String]; let skills: [Double] }
    let name: String; let culture: String; let religion: String; let polity: String
    let gold: Double; let goldPerMonth: Double; let destiny: Double
    let alive: Bool; let auto: Bool; let worldAuto: Bool
    let ruler: Ruler?
    let enemies: [Int]; let alliance: Alliance?; let overlord: Int; let vassals: [Int]
    let wars: [War]
    struct Truce: Decodable { let nation: Int; let years: Int; let required: Int }
    let truces: [Truce]?
    let people: [Person]?
}

/// CollapsibleSectionUI (original StateInfoNewUI sections): a header with a chevron; 0.25 s fold
/// animation (m_AnimationDuration). The default state is given per section (m_StartExpanded).
struct FoldSection<Content: View>: View {
    let title: String
    @State var expanded: Bool
    @ViewBuilder let content: () -> Content
    init(_ title: String, expanded: Bool, @ViewBuilder content: @escaping () -> Content) { self.title = title; _expanded = State(initialValue: expanded); self.content = content }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { withAnimation(.easeInOut(duration: 0.25)) { expanded.toggle() } } label: {
                HStack {
                    Text(title).font(Theme.kai(17)).foregroundStyle(Theme.ink)
                    Spacer()
                    Image(systemName: expanded ? "chevron.up" : "chevron.down").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink2)
                }
                .padding(.horizontal, 22).padding(.vertical, 6).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if expanded { content().transition(.opacity.combined(with: .move(edge: .top))) }
        }
        .clipped()
    }
}

struct NationSheet: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let say: (String) -> Void
    let fly: (Int) -> Void
    @State private var info: NationInfo?
    @State private var picking: Pick?
    @State private var target = -1
    enum Pick: String, Identifiable {
        case war = "宣战", alliance = "缔结盟约", vassal = "收为附庸", annex = "吞并"
        var id: String { rawValue }
        var prompt: String {
            switch self { case .war: return "选择目标国家"; case .alliance: return "选择结盟国家"; case .vassal: return "选择成为附庸的国家"; case .annex: return "选择被吞并的国家（全部领土并入本国）" }
        }
        var icon: String {
            switch self { case .war: return "flag.2.crossed"; case .alliance: return "person.2.fill"; case .vassal: return "crown"; case .annex: return "map" }
        }
        var hostile: Bool { self == .war || self == .annex }
    }

    var body: some View {
        if let map = model.map, let state = model.state, state.nations.indices.contains(nation) {
            let meta = nation < map.meta.nations.count ? map.meta.nations[nation] : nil
            let s = state.nations[nation]
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: meta?.name ?? info?.name ?? "", subtitle: s.alive ? "\(s.provinces) 省 · \(s.cities) 城" : "已亡", color: meta.map { Names.color($0.color) })
                    if let info {
                        // Original section order: BasicInfo (only one expanded by default), Action, War, Family, Diplomacy.
                        FoldSection("基本信息", expanded: true) {
                            Group2 {
                                if let r = info.ruler { Row(label: r.title, value: "\(r.name)（\(Int(r.age)) 岁）"); Divider2() }
                                Row(label: "政体", value: Names.polity[info.polity] ?? info.polity); Divider2()
                                Row(label: "文化", value: Names.culture[info.culture] ?? info.culture); Divider2()
                                Row(label: "宗教", value: Names.religion[info.religion] ?? info.religion); Divider2()
                                Row(label: "国库", value: "\(Int(info.gold).formatted()) 金（月入 \(Int(info.goldPerMonth).formatted())）"); Divider2()
                                Row(label: "国运", value: String(format: "%.0f", info.destiny)); Divider2()
                                Row(label: "人口与兵力", value: "\(Names.wan(s.population))人 · \(Names.wan(s.troops))兵")
                            }
                            .padding(.horizontal, 16)
                        }
                        if info.alive { FoldSection("国家行为", expanded: false) { actions(info, map) } }
                        FoldSection("战争", expanded: false) {
                            Group2 {
                                if info.wars.isEmpty { Row(label: "战争", value: "暂无战争") }
                                ForEach(info.wars) { war in
                                    warCard(war, map)
                                    if war.id != info.wars.last?.id { Divider2() }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                        // The family/people panel opens fully expanded in the original; title 人物.
                        FoldSection("人物", expanded: true) { peopleList(info.people ?? []) }
                        FoldSection("外交", expanded: false) {
                            Group2 {
                                let rows = relationRows(info, map)
                                if rows.isEmpty { Row(label: "外交", value: "暂无外交关系") }
                                ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                                    Row(label: row.0, value: row.1)
                                    if i < rows.count - 1 { Divider2() }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(40)
                    }
                }
                .padding(.bottom, 24)
            }
            .task(id: state.day) { await reload() }
            .onAppear { model.controller.relations = relationColors(); if let p = map.meta.nations.indices.contains(nation) ? map.meta.nations[nation].capital : nil, p >= 0, p < map.meta.cities.count { fly(map.meta.cities[p].province) } }
            .onDisappear { model.controller.relations = [:] }
            .sheet(item: $picking) { pick in pickSheet(pick, map, state).presentationDetents([.medium]).presentationBackground(Theme.paper).font(Theme.kai(17)) }
        }
    }

    private func reload() async {
        info = await model.nationInfo(nation)
        model.controller.relations = relationColors()
    }
    /// StateRelationsHighlighter colours.
    private func relationColors() -> [Int: UInt32] {
        guard let info else { return [:] }
        var out = [Int: UInt32]()
        for e in info.enemies where e >= 0 { out[e] = 0xff0000 }
        for m in info.alliance?.members ?? [] where m >= 0 && m != nation { out[m] = 0x0000ff }
        for v in info.vassals where v >= 0 { out[v] = 0x00ff00 }
        if info.overlord >= 0 { out[info.overlord] = 0xff00ff }
        return out
    }
    private func names(_ list: [Int], _ map: WorldMap) -> String { list.filter { $0 >= 0 && $0 < map.meta.nations.count }.map { map.meta.nations[$0].name }.joined(separator: "、") }
    /// StateInfoUI.UpdateDiplomacySection.
    private func relationRows(_ info: NationInfo, _ map: WorldMap) -> [(String, String)] {
        var rows = [(String, String)]()
        if !info.enemies.isEmpty { rows.append(("敌对国家", names(info.enemies, map))) }
        if let a = info.alliance { rows.append(("同盟国家", "\(a.name)：\(names(a.members.filter { $0 != nation }, map))")) }
        if info.overlord >= 0 { rows.append(("宗主国", names([info.overlord], map))) }
        if !info.vassals.isEmpty { rows.append(("附庸", names(info.vassals, map))) }
        for t in info.truces ?? [] { rows.append(("停战", "\(names([t.nation], map))：还需 \(t.years) 年（\(t.required) 年规则）")) }
        return rows
    }
    private func warCard(_ war: NationInfo.War, _ map: WorldMap) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(war.casusBelli.isEmpty ? "战争" : war.casusBelli).font(Theme.kai(18)).foregroundStyle(Theme.seal)
                Spacer()
                Text(war.side == 0 ? "发起方" : war.side == 1 ? "防御方" : "中立").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            }
            if !war.goals.isEmpty { Text("战争目标：" + war.goals.joined(separator: "、")).font(Theme.kai(14)).foregroundStyle(Theme.ink2) }
            ForEach(Array(war.sides.enumerated()), id: \.offset) { i, side in
                Text("\(i == 0 ? "进攻方" : "防守方")：\(names(side.nations, map))（阵亡 \(Int(side.losses).formatted())）").font(Theme.kai(14)).foregroundStyle(Theme.ink)
            }
            if let score = war.score {
                // Attacker's view; shown from this nation's side.
                let mine = war.side == 1 ? -score : score
                HStack(spacing: 8) {
                    Text("战争分数").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.ink.opacity(0.08))
                            Capsule().fill(mine >= 0 ? Theme.jade : Theme.seal).frame(width: g.size.width * min(1, abs(mine) / 100))
                        }
                    }.frame(height: 6)
                    Text("\(mine >= 0 ? "+" : "")\(Int(mine))").font(Theme.kai(14)).foregroundStyle(mine >= 0 ? Theme.jade : Theme.seal).monospacedDigit()
                }
            }
            HStack {
                Text("持续 \(Int(war.months) / 12) 年 \(Int(war.months) % 12) 月").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                Spacer()
                if war.side >= 0, let enemy = war.sides[1 - war.side].nations.first(where: { $0 >= 0 }) {
                    Button("停战") { Task { await run { await model.makePeace(nation, enemy) } } }
                        .font(Theme.kai(15)).padding(.horizontal, 12).padding(.vertical, 5)
                        .background(Theme.jade.opacity(0.12), in: Capsule()).foregroundStyle(Theme.jade).buttonStyle(.plain)
                }
            }
        }
        .padding(16)
    }
    /// 人物: monarch, heir, office holders with age, traits and the four skills.
    private func peopleList(_ list: [NationInfo.Person]) -> some View {
        Group2 {
            if list.isEmpty { Row(label: "人物", value: "暂无记录") }
            ForEach(Array(list.enumerated()), id: \.offset) { i, p in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(p.role).font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                        Spacer()
                        Text("\(p.name)（\(p.female ? "女" : "男")，\(Int(p.age)) 岁）").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                    }
                    if p.skills.count == 4 {
                        Text("魅力 \(Int(p.skills[0])) · 军事 \(Int(p.skills[1])) · 外交 \(Int(p.skills[2])) · 行政 \(Int(p.skills[3]))").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                    }
                    if !p.traits.isEmpty { Text("特质：" + p.traits.joined(separator: "、")).font(Theme.kai(13)).foregroundStyle(Theme.ink2) }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                if i < list.count - 1 { Divider2() }
            }
        }
        .padding(.horizontal, 16)
    }
    /// 国家行为 (CultureNationActions47).
    private func actions(_ info: NationInfo, _ map: WorldMap) -> some View {
        let vassal = info.overlord >= 0
        return VStack(alignment: .leading, spacing: 10) {
            Group2 {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    action("宣战", "flag.2.crossed", Theme.seal, disabled: vassal) { target = -1; picking = .war }
                    action("缔结盟约", "person.2.fill", Theme.jade, disabled: vassal) { target = -1; picking = .alliance }
                    action("退出同盟", "person.badge.minus", Theme.ink, disabled: info.alliance == nil) { Task { await run { await model.alliance(nation, with: -1) } } }
                    action("解除附庸", "link.badge.plus", Theme.ink, disabled: !vassal) { Task { await run { await model.releaseVassal(nation) } } }
                    action("收为附庸", "crown", Theme.jade, disabled: vassal) { target = -1; picking = .vassal }
                    action("吞并", "map", Theme.seal, disabled: false) { target = -1; picking = .annex }
                }
                .padding(14)
                Divider2()
                Toggle(isOn: Binding(get: { info.auto }, set: { on in Task { await run { await model.setAutoDiplomacy(nation, on) } } })) {
                    Text("自主外交\(info.worldAuto ? "" : "（全局已关闭）")").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                }
                .tint(Theme.jade).padding(.horizontal, 16).padding(.vertical, 10)
            }
            .padding(.horizontal, 16)
            if vassal { Text("附庸国无法自主行使外交权力，需独立").font(Theme.kai(13)).foregroundStyle(Theme.ink2).padding(.horizontal, 22) }
        }
    }
    private func action(_ title: String, _ icon: String, _ color: Color, disabled: Bool, _ perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            Label(title, systemImage: icon).font(Theme.kai(16)).frame(maxWidth: .infinity).padding(.vertical, 10)
                .background(color.opacity(disabled ? 0.04 : 0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .foregroundStyle(disabled ? Theme.ink2.opacity(0.5) : color)
        }
        .buttonStyle(.plain).disabled(disabled)
    }
    private func pickSheet(_ pick: Pick, _ map: WorldMap, _ state: GameState) -> some View {
        let others = state.nations.indices.filter { $0 != nation && state.nations[$0].alive && $0 < map.meta.nations.count }
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: pick.rawValue, subtitle: pick.prompt)
                Group2 {
                    NationGrid(map: map, nations: others, selection: $target).padding(14)
                    Divider2()
                    Button {
                        let t = target; picking = nil
                        Task { await run {
                            switch pick {
                            case .war: return await model.declareWar(nation, on: t)
                            case .alliance: return await model.alliance(nation, with: t)
                            case .vassal: return await model.makeVassal(t, of: nation)
                            case .annex: return await model.annex(t, by: nation)
                            }
                        } }
                    } label: {
                        Label("确认\(pick.rawValue)", systemImage: pick.icon).font(Theme.kai(18)).frame(maxWidth: .infinity).padding(.vertical, 13)
                            .foregroundStyle(target < 0 ? Theme.ink2 : pick.hostile ? Theme.seal : Theme.jade)
                    }
                    .buttonStyle(.plain).disabled(target < 0)
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
    }
    /// Runs a command; a refusal shows its reason, a success the chronicle line.
    private func run(_ command: () async -> String?) async {
        if let reason = await command() { say(reason) } else { say(model.state?.events.last?.text ?? "已执行") }
        await reload()
    }
}
