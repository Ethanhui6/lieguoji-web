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
    struct Person: Decodable, Identifiable { let id: Int?; let role: String; let name: String; let age: Double; let female: Bool; let traits: [String]; let skills: [Double]
        var key: Int { id ?? -1 } }
    let name: String; let culture: String; let religion: String; let polity: String
    let gold: Double; let goldPerMonth: Double; let destiny: Double
    let alive: Bool; let auto: Bool; let worldAuto: Bool
    let ruler: Ruler?
    let enemies: [Int]; let alliance: Alliance?; let overlord: Int; let vassals: [Int]
    let wars: [War]
    struct Truce: Decodable { let nation: Int; let years: Int; let required: Int }
    let truces: [Truce]?
    let people: [Person]?
    struct Office: Decodable { let office: String; let name: String; let age: Double; let fit: Double; let person: Int? }
    struct Commander: Decodable { let name: String; let age: Double; let enemy: Int }
    struct House: Decodable { let name: String; let influence: Double; let provinces: Int; let ruling: Bool; let members: Int; let stance: String?; let relation: Double? }
    struct Court: Decodable {
        let governance: Double; let centralIncome: Double; let offices: [Office]; let temper: Double?; let manual: Bool?
        let provinces: Int; let occupied: Int; let lost: Int; let governors: Int
        let commanders: [Commander]; let houses: [House]
    }
    let court: Court?
    struct Party: Decodable { let name: String; let seats: Int }
    struct Treaty: Decodable { let nation: Int; let kind: String; let years: Int }
    let style: String?; let styleLabel: String?
    let parties: [Party]?
    let treaties: [Treaty]?
}

/// CollapsibleSectionUI (original StateInfoNewUI sections): a header with a chevron; 0.25 s fold
/// animation (m_AnimationDuration). The default state is given per section (m_StartExpanded).
struct FoldSection<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let title: String
    @State var expanded: Bool
    @ViewBuilder let content: () -> Content
    init(_ title: String, expanded: Bool, @ViewBuilder content: @escaping () -> Content) { self.title = title; _expanded = State(initialValue: expanded); self.content = content }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { expanded.toggle() } } label: {
                HStack {
                    SectionLabel(title, inset: false)
                    Spacer()
                    Image(systemName: "chevron.down").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink2).rotationEffect(.degrees(expanded ? 180 : 0))
                }
                .padding(.horizontal, 22).frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(expanded ? "已展开" : "已收起")
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
    /// 绘制疆域: paint provinces on the map for this state.
    var paint: (Int) -> Void = { _ in }
    @State private var editing: NationInfo.Person?
    @State private var regime: (history: [String], trait: String) = ([], "")
    @State private var goldText = ""
    @State private var destinyValue = 0.0
    @State private var levyProvince = -1
    /// 任命: the office whose candidates are listed.
    @State private var appointing: AppointTarget?
    struct AppointTarget: Identifiable { let office: String; var post: GameModel.PostInfo? = nil; var id: String { office } }
    @State private var postList: [GameModel.PostInfo] = []
    @State private var cultureChoice = ""
    @State private var pactYears = 10
    @State private var giftText = "500"
    @State private var cedeProvince = -1
    @State private var religionChoice = ""
    @State private var info: NationInfo?
    @State private var history: [GameState.Event] = []
    @State private var picking: Pick?
    @State private var target = -1
    enum Pick: String, Identifiable {
        case war = "宣战", alliance = "缔结盟约", vassal = "收为附庸", annex = "吞并"
        case pact = "互不侵犯条约", marriage = "王室联姻", gift = "赠送金帛", cede = "割让州郡"
        var id: String { rawValue }
        var prompt: String {
            switch self {
            case .war: return "选择目标国家"; case .alliance: return "选择结盟国家"; case .vassal: return "选择成为附庸的国家"; case .annex: return "选择被吞并的国家（全部领土并入本国）"
            case .pact: return "选择缔约国家与年限，期内双方不会相互宣战"; case .marriage: return "两国王室联姻，十年内互不兴兵"
            case .gift: return "选择受赠国家与金额"; case .cede: return "选择割让的州郡与接收国家"
            }
        }
        var icon: String {
            switch self {
            case .war: return "flag.2.crossed"; case .alliance: return "person.2.fill"; case .vassal: return "crown"; case .annex: return "map"
            case .pact: return "doc.text"; case .marriage: return "heart.circle"; case .gift: return "dollarsign.circle"; case .cede: return "rectangle.portrait.and.arrow.right"
            }
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
                        // 卷首: the state at a glance, then its ruler and identity.
                        StatStrip(tiles: [
                            StatTile(label: "疆域", value: "\(s.provinces)州"),
                            StatTile(label: "人口", value: Names.wan(s.population)),
                            StatTile(label: "兵力", value: Names.wan(s.troops)),
                            StatTile(label: "国库", value: Names.wan(Int(info.gold)), warn: info.goldPerMonth < 0),
                        ])
                        FoldSection("基本信息", expanded: true) {
                            Group2 {
                                if let r = info.ruler { Row(label: r.title, value: "\(r.name)（\(Int(r.age)) 岁）"); Divider2() }
                                Row(label: "政体", value: Names.polity[info.polity] ?? info.polity); Divider2()
                                Row(label: "文化 · 宗教", value: "\(Names.culture[info.culture] ?? info.culture) · \(Names.religion[info.religion] ?? info.religion)"); Divider2()
                                Row(label: "月入", value: "\(Int(info.goldPerMonth).formatted()) 金"); Divider2()
                                Row(label: "国运", value: String(format: "%.0f", info.destiny))
                            }
                            .padding(.horizontal, 16)
                        }
                        if let court = info.court, info.alive { FoldSection("朝堂", expanded: true) { courtView(court, map) } }
                        if !regime.history.isEmpty {
                            // 政体沿革: the polities this state has had, and the current one's standing bonus.
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 6) {
                                    ForEach(Array(regime.history.suffix(6).enumerated()), id: \.offset) { i, p in
                                        if i > 0 { Image(systemName: "arrow.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.ink2) }
                                        Text(p).font(Theme.kai(14)).foregroundStyle(i == min(5, regime.history.count - 1) ? Theme.seal : Theme.ink2)
                                    }
                                }
                                if !regime.trait.isEmpty { Text(regime.trait).font(Theme.kai(13)).foregroundStyle(Theme.ink2) }
                            }
                            .padding(.horizontal, 24)
                        }
                        if !postList.isEmpty {
                            FoldSection("朝廷百官（\(postList.filter { $0.holder != nil }.count)/\(postList.count)）", expanded: false) {
                                Group2 {
                                    ForEach(Array(postList.enumerated()), id: \.offset) { i, p in
                                        Button { appointing = AppointTarget(office: "post-" + p.id, post: p) } label: {
                                            HStack(spacing: 10) {
                                                Text(p.title).font(Theme.kai(15)).foregroundStyle(Theme.ink).frame(width: 108, alignment: .leading).lineLimit(1).minimumScaleFactor(0.7)
                                                Text(p.holder?.name ?? "空缺").font(Theme.kai(15)).foregroundStyle(p.holder == nil ? Theme.ink2 : Theme.ink).lineLimit(1)
                                                Spacer()
                                                if let v = p.value { Text("\(["魅", "军", "外", "政"][min(3, max(0, p.skill))])\(Int(v))").font(Theme.kai(12)).foregroundStyle(v >= 60 ? Theme.jade : v < 40 ? Theme.seal : Theme.ink2).monospacedDigit() }
                                                Image(systemName: p.effect == "gold" ? "dollarsign.circle" : p.effect == "morale" ? "shield" : "sparkles").font(.system(size: 12)).foregroundStyle(Theme.ink2)
                                            }
                                            .padding(.horizontal, 16).padding(.vertical, 8).contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain)
                                        if i < postList.count - 1 { Divider2() }
                                    }
                                    Text("称职的官员每月增国库（$）、国运（✦）或各军士气（盾）；不称职则相反。").font(Theme.kai(12)).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.vertical, 8)
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                        if let parties = info.parties, !parties.isEmpty {
                            FoldSection("议会（\(info.styleLabel ?? "")）", expanded: true) {
                                Group2 {
                                    // Seats in one band, then each party.
                                    GeometryReader { g in
                                        HStack(spacing: 1) {
                                            ForEach(Array(parties.enumerated()), id: \.offset) { i, p in
                                                Rectangle().fill(Self.partyColor(i)).frame(width: max(2, g.size.width * CGFloat(p.seats) / 100))
                                            }
                                        }
                                        .clipShape(Capsule())
                                    }
                                    .frame(height: 10).padding(.horizontal, 16).padding(.top, 12)
                                    ForEach(Array(parties.sorted { $0.seats > $1.seats }.enumerated()), id: \.offset) { i, p in
                                        HStack(spacing: 8) {
                                            RoundedRectangle(cornerRadius: 2).fill(Self.partyColor(parties.firstIndex { $0.name == p.name } ?? 0)).frame(width: 10, height: 10)
                                            Text(p.name).font(Theme.kai(15)).foregroundStyle(Theme.ink)
                                            if i == 0 { Text("执政").font(Theme.kai(12)).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.seal, in: Capsule()) }
                                            Spacer()
                                            Text("\(p.seats) 席").font(Theme.kai(14)).foregroundStyle(Theme.ink2).monospacedDigit()
                                        }
                                        .padding(.horizontal, 16).padding(.vertical, 6)
                                    }
                                    Text("每四年改选一次，最大党组织政府。").font(Theme.kai(12)).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.bottom, 10)
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                        if let treaties = info.treaties, !treaties.isEmpty {
                            FoldSection("条约（\(treaties.count)）", expanded: false) {
                                Group2 {
                                    ForEach(Array(treaties.enumerated()), id: \.offset) { i, t in
                                        Row(label: t.kind == "marriage" ? "联姻" : "互不侵犯", value: (map.meta.nations.indices.contains(t.nation) ? map.meta.nations[t.nation].name : "") + " · 余\(max(1, t.years))年")
                                        if i < treaties.count - 1 { Divider2() }
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                        if info.alive { FoldSection("国家行为", expanded: false) { actions(info, map) } }
                        if info.alive { FoldSection("自定义", expanded: false) { customView(info, map, state) } }
                        FoldSection(info.wars.isEmpty ? "战争" : "战争（\(info.wars.count)）", expanded: !info.wars.isEmpty) {
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
                        FoldSection("人物（\(info.people?.count ?? 0)）", expanded: false) { peopleList(info.people ?? []) }
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
                        // 国史: the chronicle entries naming this state, newest first.
                        FoldSection("国史", expanded: false) {
                            Group2 {
                                if history.isEmpty { Row(label: "国史", value: "尚无记载") }
                                ForEach(Array(history.prefix(20).enumerated()), id: \.offset) { i, e in
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("第\(e.day + 1)日").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                                        Text(e.text).font(Theme.kai(15)).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 9)
                                    if i < min(history.count, 20) - 1 { Divider2() }
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
            .task(id: state.day / 10) { await reload() }
            .onAppear { model.controller.relationsNation = nation; model.controller.relations = relationColors(); if let p = map.meta.nations.indices.contains(nation) ? map.meta.nations[nation].capital : nil, p >= 0, p < map.meta.cities.count { fly(map.meta.cities[p].province) } }
            // Pages slide: the next state's page may already show its colours, so only clear our own.
            .onDisappear { if model.controller.relationsNation == nation { model.controller.relationsNation = nil; model.controller.relations = [:] } }
            .sheet(item: $appointing) { target in
                AppointSheet(model: model, nation: nation, office: target.office, post: target.post) { person, name in
                    appointing = nil
                    if let post = target.post {
                        Task { await run(success: "已任命\(name)为\(post.title)") { await model.appointPost(nation, post: post.id, person: person) } }
                    } else {
                        Task { await run(success: "已任命\(name)为\(Self.officeTitle[target.office] ?? target.office)") { await model.appointOffice(nation, office: target.office, person: person) } }
                    }
                }
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.font(Theme.kai(17))
            }
            .sheet(item: $editing) { p in
                PersonEditor(person: p) { skills, traits in
                    editing = nil
                    Task { await run(success: "\(p.name)的属性与天赋已修改") { await model.editPerson(p.key, skills: skills, traits: traits) } }
                }
                .presentationDetents([.large]).presentationBackground { MemorialPaper() }.font(Theme.kai(17))
            }
            .sheet(item: $picking) { pick in pickSheet(pick, map, state).presentationDetents([.medium]).presentationBackground { MemorialPaper() }.font(Theme.kai(17)) }
        }
    }

    static func partyColor(_ i: Int) -> Color {
        [Color(red: 0.75, green: 0.2, blue: 0.15), Color(red: 0.2, green: 0.4, blue: 0.65), Color(red: 0.85, green: 0.6, blue: 0.2), Color(red: 0.3, green: 0.55, blue: 0.3), Color(red: 0.5, green: 0.35, blue: 0.6)][i % 5]
    }
    static func temperName(_ t: Double) -> String { t >= 1.3 ? "好战" : t >= 1.1 ? "进取" : t > 0.9 ? "持重" : t > 0.75 ? "温和" : "求和" }
    static func stanceColor(_ s: String) -> Color {
        switch s { case "宗室": return Theme.seal; case "拥戴": return Theme.jade; case "谋逆": return Color(red: 0.45, green: 0.08, blue: 0.08); case "离心": return Color(red: 0.72, green: 0.45, blue: 0.15); default: return Theme.ink2 }
    }
    /// The forms of government (engine Regimes.styles): label, and what they bring.
    static let styles: [(id: String, label: String, note: String)] = [
        ("absolute", "君主专制", "王国 · 国王独断"), ("constitutional", "君主立宪", "王国 · 议会与党派"),
        ("empire", "帝制", "帝国 · 皇帝"), ("junta", "军政府", "国 · 最高统帅"),
        ("democratic", "民主共和", "共和国 · 总统 · 多党选举"), ("communist", "人民共和（共产主义）", "人民共和国 · 主席 · 一党执政"),
        ("oligarchic", "寡头共和", "共和国 · 执政官 · 元老与商会"), ("federal", "联邦共和", "联邦 · 联邦主席 · 多党"),
        ("theocracy", "神权", "神权国 · 宗教领袖"), ("tribal", "部落联盟", "部族 · 酋长或可汗"),
        ("feudal", "封建王国", "王国 · 君主"),
        ("elective", "选侯君主", "王国 · 选王"),
        ("sultanate", "苏丹国", "苏丹国 · 苏丹"),
        ("principality", "公国", "公国 · 大公"),
        ("regency", "摄政", "王国 · 摄政王"),
        ("tsardom", "沙皇专制", "沙皇国 · 沙皇"),
        ("shogunate", "幕府", "幕府 · 征夷大将军"),
        ("despotism", "专制帝国", "帝国 · 君主"),
        ("citystate", "城邦共和", "城邦 · 执政官 · 多党"),
        ("merchant", "商业共和", "共和国 · 总督 · 多党"),
        ("parliamentary", "议会共和", "共和国 · 总理 · 多党"),
        ("presidential", "总统共和", "共和国 · 总统 · 多党"),
        ("socialist", "社会主义", "社会主义共和国 · 总书记 · 劳动党执政"),
        ("dictatorship", "独裁", "国 · 元首"),
        ("council", "革命委员会", "共和国 · 委员长 · 革命党执政"),
        ("confederation", "邦联", "邦联 · 邦联主席 · 多党"),
        ("union", "联合王国", "联合王国 · 君主 · 多党"),
        ("caliphate", "哈里发国", "哈里发国 · 哈里发"),
        ("papacy", "教宗国", "教宗国 · 教宗"),
        ("lamaism", "政教合一", "国 · 法王"),
        ("order", "骑士团国", "骑士团国 · 大团长"),
        ("khanate", "汗国", "汗国 · 可汗"),
        ("chiefdom", "酋邦", "酋邦 · 大酋长"),
    ]
    static let officeTitle = ["Chancellor": "宰相", "Steward": "司农", "Marshal": "大将军"]
    static let officeDuty = ["Chancellor": "总理朝政 · 增国库", "Steward": "掌钱粮 · 增国库", "Marshal": "统率三军"]
    /// 朝堂: governance gauge, the three central offices with their holders' fit, local rule, war
    /// commanders and the noble houses by influence.
    @ViewBuilder private func courtView(_ c: NationInfo.Court, _ map: WorldMap) -> some View {
        VStack(spacing: 10) {
            StatStrip(tiles: [
                StatTile(label: "施政", value: "\(Int((c.governance * 100).rounded()))", fraction: c.governance, warn: c.governance < 0.3),
                StatTile(label: "中枢增收", value: String(format: "%+.0f%%", (c.centralIncome - 1) * 100), warn: c.centralIncome < 1),
                StatTile(label: "地方官", value: "\(c.governors)/\(c.provinces)", fraction: c.provinces > 0 ? Double(c.governors) / Double(c.provinces) : 0),
                StatTile(label: "国策", value: Self.temperName(c.temper ?? 1), warn: (c.temper ?? 1) > 1.25),
            ])
            Group2 {
                ForEach(Array(c.offices.enumerated()), id: \.offset) { i, o in
                    Button { appointing = AppointTarget(office: o.office) } label: {
                    HStack(spacing: 12) {
                        Text(Self.officeTitle[o.office] ?? o.office).font(Theme.kai(15)).foregroundStyle(Theme.paper2)
                            .frame(width: 52, height: 26).background(Theme.seal.opacity(o.name.isEmpty ? 0.35 : 0.85), in: RoundedRectangle(cornerRadius: 4))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(o.name.isEmpty ? "空缺" : "\(o.name)（\(Int(o.age))岁）").font(Theme.kai(16)).foregroundStyle(o.name.isEmpty ? Theme.ink2 : Theme.ink)
                            Text(Self.officeDuty[o.office] ?? "").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                        }
                        Spacer()
                        if !o.name.isEmpty {
                            // Fit −1…1: how well the holder's skills suit the office.
                            Text(o.fit >= 0.4 ? "称职" : o.fit >= 0 ? "平庸" : "失职").font(Theme.kai(13))
                                .foregroundStyle(o.fit >= 0.4 ? Color(red: 0.25, green: 0.45, blue: 0.25) : o.fit >= 0 ? Theme.ink2 : Theme.seal)
                        }
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.ink2)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if i < c.offices.count - 1 { Divider2() }
                }
                Divider2()
                PaperSwitch(title: "亲自任免官员（朝廷不再自行换人）", on: Binding(get: { c.manual ?? false }, set: { on in Task { await run(success: on ? "官员由你亲自任免" : "朝廷恢复自主任免") { await model.setCourtManual(nation, manual: on) } } }))
            }
            .padding(.horizontal, 16)
            Text("点官职可从本国人物中任命；点「人物」里的人可修改其属性与天赋。").font(Theme.kai(12)).foregroundStyle(Theme.ink2).padding(.horizontal, 24).frame(maxWidth: .infinity, alignment: .leading)
            if c.occupied > 0 || c.lost > 0 || !c.commanders.isEmpty {
                Group2 {
                    if c.occupied > 0 { Row(label: "占领他国", value: "\(c.occupied) 州"); Divider2() }
                    if c.lost > 0 { Row(label: "失地", value: "\(c.lost) 州"); Divider2() }
                    ForEach(Array(c.commanders.enumerated()), id: \.offset) { i, w in
                        Row(label: "征讨" + (map.meta.nations.indices.contains(w.enemy) ? map.meta.nations[w.enemy].name : "") + "主将", value: w.name)
                        if i < c.commanders.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }
            if !c.houses.isEmpty {
                Group2 {
                    ForEach(Array(c.houses.enumerated()), id: \.offset) { i, h in
                        HStack(spacing: 10) {
                            Text(h.name).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                            if let stance = h.stance ?? (h.ruling ? "宗室" : nil) {
                                Text(stance).font(Theme.kai(12)).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1)
                                    .background(Self.stanceColor(stance), in: Capsule())
                            }
                            Spacer()
                            Text("\(h.members)人 · \(h.provinces)州").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                            // Influence 0…1000 as a short gauge.
                            ZStack(alignment: .leading) {
                                Capsule().fill(Theme.ink.opacity(0.1))
                                Capsule().fill(h.ruling ? Theme.seal : Theme.ink.opacity(0.6)).frame(width: 54 * min(1, max(0, h.influence / 1000)))
                            }
                            .frame(width: 54, height: 4)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 9)
                        if i < c.houses.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func reload() async {
        info = await model.nationInfo(nation)
        history = await model.nationHistory(nation)
        regime = await model.regime(nation)
        postList = await model.posts(nation)
        if model.controller.relationsNation == nation { model.controller.relations = relationColors() }
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
                Button { if p.key >= 0 { editing = p } } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(p.role).font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                        Spacer()
                        Text("\(p.name)（\(p.female ? "女" : "男")，\(Int(p.age)) 岁）").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                    }
                    if p.skills.count == 4 {
                        Text("魅力 \(Int(p.skills[0])) · 军事 \(Int(p.skills[1])) · 外交 \(Int(p.skills[2])) · 行政 \(Int(p.skills[3]))").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                    }
                    ForEach(p.traits, id: \.self) { t in
                        (Text(t).foregroundStyle(Theme.ink) + Text(TraitText.effect[t].map { "：" + $0 } ?? "").foregroundStyle(Theme.ink2)).font(Theme.kai(13))
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if i < list.count - 1 { Divider2() }
            }
            if !list.isEmpty { Text("点人物可修改属性与天赋").font(Theme.kai(12)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 6) }
        }
        .padding(.horizontal, 16)
    }

    /// 自定义: treasury, destiny, polity (revolution by decree) and raising a legion.
    @ViewBuilder private func customView(_ info: NationInfo, _ map: WorldMap, _ state: GameState) -> some View {
        let owned = state.owners.indices.filter { state.owners[$0] == nation && $0 < map.meta.provinces.count }
        VStack(spacing: 10) {
            Group2 {
                HStack {
                    Text("国库").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                    Spacer()
                    TextField("", text: $goldText, prompt: Text("\(Int(info.gold))").foregroundColor(Theme.ink2.opacity(0.6)))
                        .font(Theme.kai(17)).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width: 120)
                    Text("金").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                VStack(alignment: .leading, spacing: 4) {
                    Text("国运 \(Int(destinyValue))").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                    Slider(value: $destinyValue, in: 0...100, step: 1).tint(Theme.seal)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                Button {
                    let gold = Double(goldText)
                    Task { await run(success: "国库与国运已修改") { await model.editNation(nation, gold: gold, destiny: destinyValue, polity: nil) } }
                    goldText = ""
                } label: { Text("颁行").font(Theme.kai(17)).foregroundStyle(Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 11) }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .onAppear { destinyValue = info.destiny }
            Text("文化与宗教").font(Theme.kai(13)).foregroundStyle(Theme.ink2).padding(.horizontal, 24).frame(maxWidth: .infinity, alignment: .leading)
            Group2 {
                PaperMenu(title: "文化", items: Names.cultureIds.map { ($0, Names.culture[$0] ?? $0) }, selection: $cultureChoice)
                Divider2()
                PaperMenu(title: "宗教", items: Names.religion.keys.sorted().map { ($0, Names.religion[$0] ?? $0) }, selection: $religionChoice)
                Divider2()
                Button {
                    let c = cultureChoice, r = religionChoice
                    Task { await run(success: "文化与宗教已更改") { await model.editNation(nation, gold: nil, destiny: nil, polity: nil, culture: c, religion: r) } }
                } label: { Text("颁行").font(Theme.kai(17)).foregroundStyle(Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 11) }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .onAppear { cultureChoice = info.culture; religionChoice = info.religion }
            Text("改易政体（国号与元首称号随之改变；改变基本政体如同革命，国库与国运受损）").font(Theme.kai(13)).foregroundStyle(Theme.ink2).padding(.horizontal, 24).frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            Group2 {
                ForEach(Array(Self.styles.enumerated()), id: \.offset) { i, s in
                    let on = s.id == (info.style ?? "")
                    Button { if !on { Task { await run(success: "已改行\(s.label)") { await model.setStyle(nation, style: s.id) } } } } label: {
                        HStack(spacing: 12) {
                            Image(systemName: on ? "largecircle.fill.circle" : "circle").foregroundStyle(on ? Theme.seal : Theme.ink.opacity(0.3))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.label).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                                Text(s.note).font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
                        .background(on ? Theme.seal.opacity(0.06) : .clear)
                    }
                    .buttonStyle(.plain)
                    if i < Self.styles.count - 1 { Divider2() }
                }
            }
            .padding(.horizontal, 16)
            Text("征募新军").font(Theme.kai(13)).foregroundStyle(Theme.ink2).padding(.horizontal, 24).frame(maxWidth: .infinity, alignment: .leading)
            Group2 {
                PaperMenu(title: "驻地", items: [(-1, "选择州郡")] + owned.map { ($0, map.meta.provinces[$0].name) }, selection: $levyProvince)
                Divider2()
                Button {
                    let p = levyProvince
                    Task { await run(success: "已征募新军") { await model.addArmy(nation, province: p) } }
                } label: { Label("征兵", systemImage: "plus.circle").font(Theme.kai(17)).foregroundStyle(levyProvince < 0 ? Theme.ink2 : Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 11) }
                .buttonStyle(.plain).disabled(levyProvince < 0)
            }
            .padding(.horizontal, 16)
        }
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
                    action("触发内战", "flame", Theme.seal, disabled: false) { Task { await run { await model.triggerCivilWar(nation) } } }
                    action("绘制疆域", "paintbrush.pointed.fill", Theme.ink, disabled: false) { paint(nation) }
                    action("互不侵犯", "doc.text", Theme.jade, disabled: false) { target = -1; picking = .pact }
                    action("王室联姻", "heart.circle", Theme.jade, disabled: false) { target = -1; picking = .marriage }
                    action("赠送金帛", "dollarsign.circle", Theme.ink, disabled: false) { target = -1; picking = .gift }
                    action("割让州郡", "rectangle.portrait.and.arrow.right", Theme.seal, disabled: false) { target = -1; cedeProvince = -1; picking = .cede }
                }
                .padding(14)
                Divider2()
                PaperSwitch(title: "自主外交\(info.worldAuto ? "" : "（全局已关闭）")", on: Binding(get: { info.auto }, set: { on in Task { await run { await model.setAutoDiplomacy(nation, on) } } }))
            }
            .padding(.horizontal, 16)
            if vassal { Text("附庸国无法自主行使外交权力，需独立").font(Theme.kai(13)).foregroundStyle(Theme.ink2).padding(.horizontal, 22) }
        }
    }
    private func action(_ title: String, _ icon: String, _ color: Color, disabled: Bool, _ perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            GameActionLabel(title: title, symbol: icon).font(Theme.kai(16)).frame(maxWidth: .infinity, minHeight: 44).padding(.horizontal, 8).padding(.vertical, 4)
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
                    if pick == .pact {
                        Divider2()
                        ChipPicker(items: [(5, "五年"), (10, "十年"), (20, "二十年")], selection: $pactYears).padding(12)
                    }
                    if pick == .gift {
                        Divider2()
                        HStack {
                            Text("金额").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                            Spacer()
                            TextField("", text: $giftText).font(Theme.kai(17)).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width: 110)
                            Text("金").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                    }
                    if pick == .cede {
                        Divider2()
                        PaperMenu(title: "州郡", items: [(-1, "选择本国州郡")] + state.owners.indices.filter { state.owners[$0] == nation && $0 < map.meta.provinces.count }.map { ($0, map.meta.provinces[$0].name) }, selection: $cedeProvince)
                    }
                    Divider2()
                    Button {
                        let t = target, years = pactYears, gold = Double(giftText) ?? 0, province = cedeProvince; picking = nil
                        Task { await run {
                            switch pick {
                            case .war: return await model.declareWar(nation, on: t)
                            case .alliance: return await model.alliance(nation, with: t)
                            case .vassal: return await model.makeVassal(t, of: nation)
                            case .annex: return await model.annex(t, by: nation)
                            case .pact: return await model.treaty(nation, t, years: years, kind: "pact")
                            case .marriage: return await model.treaty(nation, t, years: 10, kind: "marriage")
                            case .gift: return await model.gift(nation, to: t, gold: gold)
                            case .cede:
                                if province < 0 { return "请选择要割让的州郡" }
                                return await model.grant(province: province, to: t)
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
    /// Runs a state-level order; a failure says why, a success says `success` (or the newest chronicle line).
    private func run(success: String? = nil, _ command: () async -> String?) async {
        if let reason = await command() { say(reason); GameFeel.shared.notify(.error) }
        else { say(success ?? model.state?.events.last?.text ?? "已执行"); GameFeel.shared.notify(.success) }
        await reload()
    }
}

/// Each trait's effect description, from the original's Traits/CharacterTraits/localization.csv
/// (CharacterTraitDesc_*, Chinese column), keyed by the web's trait label. Only these 27 strings are
/// copied; see ios-native/Resources/SOURCE.md.
enum TraitText {
    static let effect: [String: String] = [
        "天才": "拥有超凡的智慧和卓越的头脑",
        "勇敢": "在战斗中无所畏惧，深受士兵敬仰",
        "魅力超凡": "天生的领导者，能激发他人的忠诚",
        "行政天才": "在管理国家事务方面表现卓越",
        "外交家": "擅长谈判和建立关系",
        "公正": "判断公平公正，深受人民爱戴",
        "战略家": "军事战术和战略大师",
        "仁慈": "对被征服者表现出仁慈，更倾向于宽恕和恢复被征服家族的领地",
        "耐心": "愿意等待合适的时机",
        "懦弱": "胆小怕事，为士兵所不齿",
        "残暴": "对被征服者毫不留情，更倾向于清洗和剥夺被征服家族的一切",
        "无能": "缺乏有效治理的能力",
        "贪婪": "痴迷于财富和个人利益",
        "偏执": "到处都看到敌人",
        "易怒": "容易发怒，惩罚严厉",
        "雄心勃勃": "有着远大的抱负，渴望权力",
        "长袖善舞": "擅长社交，作为族长或国家领导人时，其他势力对其好感度+20",
        "鹰派": "强硬派，紧急动员时可额外征召30%的军队",
        "鸽派": "温和派，无法进行紧急动员",
        "统一者": "立志整合同文化诸邦 倾向对同文化邻国发动统一战争",
        "越战越勇": "面对多线作战时愈发勇猛，每个敌对国家增加5%战斗力（最多50%）",
        "厌战": "厌倦战争，每个敌对国家减少5%战斗力（最多-50%）",
        "海军精通": "精通海战指挥 使所属国家海军战斗力提升30%",
        "船舶大师": "精通船舶建造 使军舰建造时间减少50%",
        "改革家": "天生的改革家，上台时会触发改革判定，基于内政能力调整国家腐败度",
        "天生领袖": "天生的领导者，作为家族首领时增加50点家族影响力",
        "难以服众": "缺乏威望和号召力，作为家族首领时减少50点家族影响力"
    ]
}

/// 自定义人物: the four base skills (0…100) and up to four traits (天赋).
struct PersonEditor: View {
    let person: NationInfo.Person
    let save: ([Double], [String]) -> Void
    @State private var skills: [Double] = [50, 50, 50, 50]
    @State private var traits: [String] = []
    static let skillNames = ["魅力", "军事", "外交", "行政"]
    static let allTraits = ["天才", "勇敢", "魅力超凡", "行政天才", "外交家", "公正", "战略家", "仁慈", "耐心", "改革家", "天生领袖", "统一者", "越战越勇", "海军精通", "船舶大师", "长袖善舞", "雄心勃勃", "鹰派", "鸽派", "懦弱", "残暴", "无能", "贪婪", "偏执", "易怒", "厌战", "难以服众"]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: person.name, subtitle: "\(person.role) · \(Int(person.age)) 岁", seal: "改")
                Group2 {
                    ForEach(0..<4, id: \.self) { i in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(Self.skillNames[i]).font(Theme.kai(16)).foregroundStyle(Theme.ink); Spacer(); Text("\(Int(skills[i]))").font(Theme.kai(17)).foregroundStyle(Theme.seal).monospacedDigit() }
                            Slider(value: $skills[i], in: 0...100, step: 1).tint(Theme.seal)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        if i < 3 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
                Text("天赋（最多四项，影响实际能力）").font(Theme.kai(14)).foregroundStyle(Theme.ink2).padding(.horizontal, 24)
                Group2 {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 82), spacing: 8)], spacing: 8) {
                        ForEach(Self.allTraits, id: \.self) { t in
                            let on = traits.contains(t)
                            Button {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    if on { traits.removeAll { $0 == t } } else if traits.count < 4 { traits.append(t) }
                                }
                            } label: {
                                Text(t).font(Theme.kai(14)).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                                    .frame(maxWidth: .infinity).frame(height: 32)
                                    .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 8))
                                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(on ? Color.clear : Theme.line))
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                    .padding(12)
                }
                .padding(.horizontal, 16)
                Button { save(skills, traits) } label: { PrimaryLabel(title: "颁旨", symbol: "checkmark.seal") }.buttonStyle(PressStyle()).padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
        .onAppear { if person.skills.count == 4 { skills = person.skills }; traits = person.traits }
    }
}

/// 任命官员: the people who may take an office, ablest first; a tap appoints.
struct AppointSheet: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let office: String
    var post: GameModel.PostInfo? = nil
    let appoint: (Int, String) -> Void
    @State private var people: [NationInfo.Person] = []
    @State private var loaded = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "任命" + (post?.title ?? NationSheet.officeTitle[office] ?? office), subtitle: post.map { ["按魅力", "按军事", "按外交", "按行政"][min(3, max(0, $0.skill))] + "择优" } ?? NationSheet.officeDuty[office], seal: "任")
                Group2 {
                    if loaded && people.isEmpty { Text("本国暂无合适人选").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 16) }
                    if !loaded { ProgressView().frame(maxWidth: .infinity).padding(20) }
                    ForEach(Array(people.enumerated()), id: \.offset) { i, p in
                        Button { if let id = p.id { appoint(id, p.name) } } label: {
                            HStack(spacing: 10) {
                                Text(ChineseNumeral.of(i + 1)).font(Theme.kai(13)).foregroundStyle(Theme.seal).frame(width: 22)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("\(p.name)（\(p.female ? "女" : "男")，\(Int(p.age)) 岁）").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                                    if p.skills.count == 4 {
                                        Text("魅力 \(Int(p.skills[0])) · 军事 \(Int(p.skills[1])) · 外交 \(Int(p.skills[2])) · 行政 \(Int(p.skills[3]))").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                                    }
                                    if !p.traits.isEmpty { Text(p.traits.joined(separator: "、")).font(Theme.kai(12)).foregroundStyle(Theme.ink2) }
                                }
                                Spacer()
                                Image(systemName: "checkmark.seal").foregroundStyle(Theme.seal)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if i < people.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
        .task {
            if let post { people = await model.postCandidates(nation, post: post.id) } else { people = await model.officeCandidates(nation, office: office) }
            loaded = true
        }
    }
}
