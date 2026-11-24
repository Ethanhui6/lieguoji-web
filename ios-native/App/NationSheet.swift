import SwiftUI
import LieguojiCore

/// The nation panel (original StateInfoUI): ruler and state, treasury and destiny, diplomatic
/// relations, the state's wars, and the state-level actions (国家行为). While open, the map shows
/// the state's relations: enemies red, allies blue, vassals green, the overlord magenta.
struct NationInfo: Decodable {
    struct Ruler: Decodable {
        let name: String; let title: String; let age: Double
        var female: Bool? = nil; var id: Int? = nil; var traits: [String]? = nil; var skills: [Double]? = nil
        var styledName: String? = nil; var eraName: String? = nil; var eraYearText: String? = nil
        var honorific: String? = nil; var surnameLessImperial: Bool? = nil; var traitSummary: [String]? = nil
    }
    /// 国家加成 (自定义) in percent: income, attack, defense, growth, speed.
    var bonus: [String: Double]? = nil
    /// 生计 (民族特性): Agriculture, Nomadic, Maritime, FishAndHunting, Commercial, Other.
    var livelihood: String? = nil
    struct Alliance: Decodable { let name: String; let members: [Int] }
    struct Side: Decodable { let nations: [Int]; let losses: Double }
    struct War: Decodable, Identifiable { let id: Int; let casusBelli: String; let goals: [String]; let months: Double; let sides: [Side]; let side: Int; let score: Double? }
    struct Person: Decodable, Identifiable { let id: Int?; let role: String; let name: String; let age: Double; let female: Bool; let traits: [String]; let skills: [Double]
        var key: Int { id ?? -1 } }
    let name: String; let culture: String; let religion: String; let polity: String
    var baseName: String? = nil; var nameTemplate: String? = nil; var rulingSurname: String? = nil; var restorationOrdinal: String? = nil
    let gold: Double; let goldPerMonth: Double; let destiny: Double
    let alive: Bool; let auto: Bool; let worldAuto: Bool
    let ruler: Ruler?
    /// 元首与掌权者: the head of government's seat where the form of government has one (首相、总理、
    /// 丞相、征夷大将军…), who holds it, and whether he, not the head of state, governs.
    struct Heads: Decodable { let premierTitle: String; let premierRules: Bool; let elected: Bool; var premierName: String? = nil; var premierId: Int? = nil; var premierHouseId: String? = nil }
    var heads: Heads? = nil
    struct ActualRuler: Decodable { let id: Int; let name: String; let title: String; var houseId: String? = nil; var houseName: String? = nil }
    struct PolityDetail: Decodable {
        struct Transition: Decodable, Identifiable { let id: String; let title: String; let subtitle: String; let targetStyle: String; let dramatic: Bool }
        let camp: String; let fiefRule: String; let allowsFiefs: Bool
        let summary: String; let traitLine: String
        let stability: Int; let coupRisk: Int; let coupLevel: String
        let pressure: String; let likelyPath: String
        var defeatShock: Int? = nil
        var mood: Int? = nil
        let transitions: [Transition]
    }
    var polityDetail: PolityDetail? = nil
    struct Claim: Decodable, Identifiable { let nation: Int; let years: Int; var id: Int { nation } }
    var claims: [Claim]? = nil
    struct CourtPower: Decodable {
        let crown: Int; let houses: Int; let military: Int; let council: Int
        let dominant: String; let effect: String; var regency: String? = nil
        var title: String? = nil; var pillars: [String]? = nil; var imbalance: String? = nil
    }
    var courtPower: CourtPower? = nil
    struct CourtAgenda: Decodable {
        struct Choice: Decodable, Identifiable {
            let id: String; let label: String; let tag: String; let detail: String; let tone: String
        }
        let id: String; let title: String; let desc: String
        let support: String; let oppose: String; let effect: String
        var tag: String? = nil
        var cooldownDays: Int? = nil
        var resolvedTitle: String? = nil
        var resolvedOutcome: String? = nil
        var choices: [Choice]? = nil
    }
    var agenda: CourtAgenda? = nil
    struct SeaTransport: Decodable {
        let used: Int; let capacity: Int
        let totalPorts: Int; let blockadedPorts: Int; let unblockedPorts: Int
        var controlScore: Int? = nil; var controlLabel: String? = nil; var tradeBonusPct: Int? = nil
    }
    var seaTransport: SeaTransport? = nil
    struct ReputationInfo: Decodable {
        let score: Int; let label: String; let opinionMod: Int
    }
    var reputation: ReputationInfo? = nil
    struct TechRow: Decodable, Identifiable {
        let id: String; let label: String; let short: String
        let level: Int; let progress: Int; let tierName: String
        let effect: String; let investCost: Int
    }
    var tech: [TechRow]? = nil
    struct ActiveChain: Decodable, Identifiable {
        struct Choice: Decodable, Identifiable {
            let id: String; let label: String; let tag: String; let detail: String
        }
        let id: String; let title: String; let category: String; let desc: String
        let choices: [Choice]
    }
    var activeChain: ActiveChain? = nil
    var strategy: String? = nil
    var autoStrategy: Bool? = nil
    var globalAutoGovern: Bool? = nil
    struct CultureDoctrineInfo: Decodable { let title: String; let summary: String; let effectLine: String }
    var cultureDoctrine: CultureDoctrineInfo? = nil
    var holdsHolySite: Bool? = nil
    var emblem: String? = nil
    let enemies: [Int]; let alliance: Alliance?; let overlord: Int; let vassals: [Int]
    let wars: [War]
    struct Truce: Decodable { let nation: Int; let years: Int; let required: Int }
    let truces: [Truce]?
    let people: [Person]?
    struct Office: Decodable { let office: String; let name: String; let age: Double; let fit: Double; let person: Int? }
    struct Commander: Decodable { let name: String; let age: Double; let enemy: Int; let person: Int? }
    struct House: Decodable {
        let id: String?; let name: String; var surname: String? = nil; var headName: String? = nil; var keyMembers: String? = nil
        var allowFemale: Bool? = nil; let influence: Double; let provinces: Int; let ruling: Bool; var governing: Bool? = nil; var nominalRoyal: Bool? = nil
        let members: Int; let stance: String?; let relation: Double?; var rival: String? = nil
        var history: [Double]? = nil; var fiefCooldown: Int? = nil
    }
    struct Court: Decodable {
        let governance: Double; let centralIncome: Double; let offices: [Office]; let temper: Double?; let manual: Bool?
        var fiefRule: String? = nil; var allowsFiefs: Bool? = nil; var actualRuler: ActualRuler? = nil
        struct Trait: Decodable { let name: String; let text: String }
        let traits: [Trait]?
        /// 叛乱形势: whether provinces can rise now and the likeliest ones.
        struct Unrest: Decodable { struct Spot: Decodable { let name: String; let chance: Int }; let status: String; let open: Bool; let destiny: Double?; let provinces: [Spot] }
        let rebellion: Unrest?
        struct Governor: Decodable { let province: Int; let name: String; let holder: String?; let fit: Double?; let person: Int? }
        let governorList: [Governor]?
        let provinces: Int; let occupied: Int; let lost: Int; let governors: Int
        let commanders: [Commander]; let houses: [House]
    }
    let court: Court?
    struct Party: Decodable { let name: String; let seats: Int; var line: String? = nil; var effect: String? = nil; var policies: [String]? = nil }
    struct Treaty: Decodable { let nation: Int; let kind: String; let years: Int }
    let style: String?; let styleLabel: String?
    /// 宗教: the state faith's effect and the realm by faith.
    struct FaithShare: Decodable { let id: String; let name: String; let provinces: Int; let heresy: Bool }
    var creedEffect: String? = nil; var faiths: [FaithShare]? = nil
    /// 国势 and 制度.
    struct Sway: Decodable { let name: String; let value: String; let text: String }
    struct ReformRow: Decodable { let id: String; let name: String; let text: String; let on: Bool }
    var sway: [Sway]? = nil; var reforms: [ReformRow]? = nil
    struct TraitToggle: Decodable { let key: String; let name: String; let text: String; let on: Bool }
    var allTraits: [TraitToggle]? = nil; var customTitles: [String: String]? = nil
    /// 国力走势: monthly strength, the last ten years.
    var power: [Double]? = nil
    let parties: [Party]?
    let treaties: [Treaty]?
}

/// CollapsibleSectionUI (original StateInfoNewUI sections): a header with a chevron; 0.25 s fold
/// animation (m_AnimationDuration). The default state is given per section (m_StartExpanded).
struct FoldSection<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let title: String
    var summary: String?
    private let key: String
    @State var expanded: Bool
    @ViewBuilder let content: () -> Content
    /// 展开与否按标题（去掉括号里的数目）记住，下次打开还是玩家上次的样子；收起时标题右侧给一行摘要，
    /// 不展开也知道大概，页面不用一路往下翻。
    init(_ title: String, expanded: Bool, summary: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title; self.summary = summary; self.content = content
        key = "fold." + (title.components(separatedBy: "（").first ?? title)
        _expanded = State(initialValue: (UserDefaults.standard.object(forKey: key) as? Bool) ?? expanded)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                GameFeel.shared.tap()
                withAnimation(reduceMotion ? nil : Motion.panel) { expanded.toggle() }
                UserDefaults.standard.set(expanded, forKey: key)
            } label: {
                HStack(spacing: 8) {
                    SectionLabel(title, inset: false).fixedSize()
                    Spacer(minLength: 6)
                    if !expanded, let summary, !summary.isEmpty {
                        Text(summary).font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8).transition(.opacity)
                    }
                    InkIcon(glyph: .chevronDown, size: 15, weight: 1.65).foregroundStyle(Theme.ink2).rotationEffect(.degrees(expanded ? 180 : 0))
                }
                .padding(.horizontal, Theme.Layout.sectionInset).frame(minHeight: 44).contentShape(Rectangle())
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
    /// 查看都城: the page drops to its lowest stop so the map above it is seen.
    var lower: () -> Void = {}
    /// 绘制疆域: paint provinces on the map for this state.
    var paint: (Int) -> Void = { _ in }
    var placeArmy: (Int) -> Void = { _ in }
    /// 地图点选: asks the player to tap a province on the map (the page closes meanwhile and reopens).
    var pickProvince: (String, @escaping (Int) -> Void) -> Void = { _, _ in }
    /// Opens an army's page (the military tab lists the state's armies).
    var openArmy: (Int) -> Void = { _ in }
    var openFleet: (String) -> Void = { _ in }
    var openPeople: () -> Void = {}
    var openWars: () -> Void = {}
    var openTalks: () -> Void = {}
    var openReplay: (() -> Void)? = nil
    /// A secondary page opened from the nation sheet. Nil is the nation sheet itself.
    var focus: Focus? = nil
    enum Focus { case people, wars, talks }
    @State private var editing: NationInfo.Person?
    @State private var pickingLivelihood = false
    @State private var tree: TreePick?
    struct TreePick: Identifiable { let id: String; let name: String }
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
    @State private var failed = false
    /// 分类：精简为五页（概览 / 朝政 / 军事 / 外交 / 治理），免横滑翻找；政令、疆土、史册、定制统一归入「治理」。
    enum Tab: String, CaseIterable { case overview = "概览", court = "朝政", military = "军事", diplomacy = "外交", govern = "治理" }
    @State private var tab: Tab = .overview
    @State private var governSub = "decrees"
    @State private var enthroning = false
    @State private var confirmWarNeighbors = false
    @State private var pressMenu: PressMenu?
    @State private var flash: String?
    /// The screenshot tour opens the page on a given tab.
    static var tourTab: Tab?
    static var tourGovernSub: String?
    /// CI 巡游：载入后直接打开第一个世家的族谱（从真实入口进出族谱）。
    static var tourFamily = false
    @State private var nameText = ""
    @State private var capitalProvince = -1
    @State private var customColor = Color(red: 0.6, green: 0.3, blue: 0.2)
    @State private var temperValue = 1.0
    @State private var temperSet = false
    @State private var provinceChoice = -1
    @State private var populationText = ""
    /// 自定义的分类（nil 为总览）与等待确认的政体。
    @State private var customPane: CustomPane?
    @State private var styleConfirm: String?
    /// CI 巡游：自定义页直接打开某一类。
    static var tourPane: CustomPane?
    /// 点数字即改: the value being edited.
    @State private var numberEdit: NumberEdit?
    struct NumberEdit: Identifiable { let id = UUID(); let title: String; let unit: String; let value: Double; let apply: (Double) async -> String? }
    @State private var partyEdit: PartyEdit?
    struct PartyEdit: Identifiable { let id: Int; let name: String; let seats: Int }
    @State private var creatingHouse = false
    @State private var newHouseProvince = -1
    @State private var newHouseSurname = ""
    @State private var history: [GameState.Event] = []
    @State private var picking: Pick?
    @State private var target = -1
    @State private var transitionConfirm: NationInfo.PolityDetail.Transition?
    @State private var ultimatumDemand = "tribute"
    @State private var covertKind = "fundRebels"
    @State private var bodyReady = false
    @State private var showingBreakdown = false
    enum Pick: String, Identifiable {
        case war = "宣战", alliance = "缔结盟约", vassal = "收为附庸", annex = "吞并"
        case pact = "互不侵犯条约", marriage = "王室联姻", trade = "通商协定", defense = "共同防御条约"
        case gift = "赠送金帛", cede = "割让州郡", ultimatum = "发出最后通牒", covert = "谍报暗动", coalition = "反霸权包围网"
        var id: String { rawValue }
        var prompt: String {
            switch self {
            case .war: return "选择目标国家"; case .alliance: return "选择结盟国家"; case .vassal: return "选择成为附庸的国家"; case .annex: return "选择被吞并的国家（全部领土并入本国）"
            case .pact: return "选择缔约国家与年限，期内双方不会相互宣战"; case .marriage: return "两国王室联姻（礼聘 150 金），十年免战并互留王位宣称"
            case .trade: return "双方互开商埠，每月财政各额外增收 6%"; case .defense: return "任一方遇袭时，缔约伙伴自动出兵协防"
            case .gift: return "选择受赠国家与金额（大幅提升双边好感）"; case .cede: return "选择割让的州郡与接收国家"
            case .ultimatum: return "以兵压境迫使对方割地、纳贡或称臣；拒绝则当场宣战！"
            case .covert: return "暗中资助敌国叛军或离间其朝堂世家（有败露风险）"
            case .coalition: return "选择要联手遏制的霸主，号召对其敌视的诸国签署共同防御"
            }
        }
        var icon: String {
            switch self {
            case .war: return "flag.2.crossed"; case .alliance: return "person.2.fill"; case .vassal: return "crown"; case .annex: return "map"
            case .pact: return "doc.text"; case .marriage: return "heart.circle"; case .trade: return "shippingbox.fill"; case .defense: return "shield.lefthalf.filled"
            case .gift: return "dollarsign.circle"; case .cede: return "rectangle.portrait.and.arrow.right"
            case .ultimatum: return "flame.fill"; case .covert: return "eye.slash"; case .coalition: return "person.3.fill"
            }
        }
        var hostile: Bool { self == .war || self == .annex || self == .ultimatum || self == .covert }
    }

    var body: some View {
        if let map = model.map, let state = model.state, state.nations.indices.contains(nation) {
            let meta = nation < map.meta.nations.count ? map.meta.nations[nation] : nil
            let s = state.nations[nation]
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    if let focus {
                        focusPage(focus, info: info, map: map, state: state, meta: meta)
                    } else {
                    let lex = LocalizationEngine.lexicon(culture: info?.culture ?? s.culture ?? meta?.culture, polity: info?.polity ?? s.polity ?? meta?.polity, style: info?.style)
                    SheetHeader(title: meta?.name ?? info?.name ?? "", subtitle: s.alive ? "\(s.provinces) \(lex.adminUnit) · \(s.cities) 城" : "已亡", color: meta.map { Names.color($0.color) }, seal: info?.emblem ?? "国")
                    if let info {
                        // Original section order: BasicInfo (only one expanded by default), Action, War, Family, Diplomacy.
                        // 卷首: the state at a glance, then its ruler and identity.
                        // Every number here can be tapped and changed (点一下数字即可修改).
                        StatStrip(tiles: [
                            StatTile(label: "疆域", value: "\(s.provinces)\(lex.adminUnit)", edit: info.alive ? { paint(nation) } : nil),
                            StatTile(label: "人口", value: Names.wan(s.population), edit: info.alive ? {
                                numberEdit = NumberEdit(title: "全国人口", unit: "人", value: Double(s.population)) { v in await model.scaleTotal(nation, key: "population", value: v) }
                            } : nil),
                            StatTile(label: "兵力", value: Names.wan(s.troops), edit: info.alive ? {
                                numberEdit = NumberEdit(title: "全国兵力", unit: "人", value: Double(s.troops)) { v in await model.scaleTotal(nation, key: "troops", value: v) }
                            } : nil),
                            StatTile(label: "国库", value: Names.wan(Int(info.gold)), warn: info.goldPerMonth < 0, edit: info.alive ? {
                                numberEdit = NumberEdit(title: "国库", unit: "金", value: info.gold) { v in await model.editNation(nation, gold: v, destiny: nil, polity: nil) }
                            } : nil),
                        ])
                        NationTabs(tab: $tab, courtTitle: lex.courtTabTitle)
                        if bodyReady || ShotTour.on {
                            tabContent(info, map, state)
                        }
                    } else {
                        PanelPending(failed: failed, busy: true) { Task { await reload() } }
                    }
                    }
                }
                .padding(.bottom, 36)
            }
            .scrollContentBackground(.hidden)
            .ignoresSafeArea(.container, edges: .bottom)
            .pressMenuHost($pressMenu)
            .paperToast($flash)
            .task(id: state.day / 30) {
                await reload()
                if Self.tourFamily, tree == nil, let h = info?.court?.houses.first(where: { $0.id != nil }), let id = h.id { tree = TreePick(id: id, name: h.name) }
            }
            .task(id: tab) {
                if tab == .court, postList.isEmpty { postList = await model.posts(nation) }
            }
            .onAppear {
                if let t = Self.tourTab {
                    tab = t
                    if let sub = Self.tourGovernSub { governSub = sub }
                    customPane = Self.tourPane
                }
                if !bodyReady { Task { await Task.yield(); bodyReady = true } }
                model.controller.relationsNation = nation
                if focus == nil, let p = map.meta.nations.indices.contains(nation) ? map.meta.nations[nation].capital : nil, p >= 0, p < map.meta.cities.count {
                    let capProv = map.meta.cities[p].province
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) { fly(capProv) }
                }
            }
            // Pages slide: the next state's page may already show its colours, so only clear our own.
            .onDisappear { if model.controller.relationsNation == nation { model.controller.relationsNation = nil; model.controller.relations = [:] } }
            .sheet(item: $appointing) { target in
                AppointSheet(model: model, nation: nation, office: target.office, post: target.post, who: info) { person, name in
                    appointing = nil
                    if let post = target.post {
                        Task { await run(success: "已任命\(name)为\(post.title)") { await model.appointPost(nation, post: post.id, person: person) } }
                    } else {
                        Task { await run(success: "已任命\(name)为\((target.office.hasPrefix("WarCommander") ? "征伐主将" : Self.title(String(target.office.split(separator: ":").first ?? ""), info)))") { await model.appointOffice(nation, office: target.office, person: person) } }
                    }
                }
                .background(MemorialPaper().ignoresSafeArea())
                .presentationDetents([.medium, .large]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground(Theme.paper).presentationDragIndicator(.hidden).font(Theme.section)
            }
            .sheet(item: $editing) { p in
                PersonEditor(person: p) { skills, traits, first, last, age in
                    editing = nil
                    Task {
                        await run(success: "\(p.name)已修改") {
                            if let e = await model.renamePerson(p.key, first: first, last: last, age: age) { return e }
                            return await model.editPerson(p.key, skills: skills, traits: traits)
                        }
                    }
                }
                .background(MemorialPaper().ignoresSafeArea())
                .presentationDetents([.large]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground(Theme.paper).presentationDragIndicator(.hidden).font(Theme.section)
            }
            .sheet(item: $picking) { pick in pickSheet(pick, map, state).background(MemorialPaper().ignoresSafeArea()).presentationDetents([.medium]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground(Theme.paper).presentationDragIndicator(.hidden).font(Theme.section) }
            .sheet(item: $tree, onDismiss: { Task { await reload() } }) { t in
                FamilyTreeSheet(model: model, family: t.id, name: t.name)
                    .background(MemorialPaper().ignoresSafeArea())
                    .presentationDetents([.medium, .large]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground(Theme.paper).presentationDragIndicator(.hidden)
            }
            .sheet(item: $numberEdit) { e in
                NumberEditSheet(title: e.title, unit: e.unit, value: e.value) { v in
                    numberEdit = nil
                    Task { await run(success: "\(e.title)已改为 \(Int(v))\(e.unit)") { await e.apply(v) } }
                }
                .background(MemorialPaper().ignoresSafeArea())
                .presentationDetents([.height(370)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground(Theme.paper).presentationDragIndicator(.hidden).font(Theme.section)
            }
            .sheet(item: $partyEdit) { p in
                PartyEditSheet(name: p.name, seats: p.seats) { name, seats in
                    partyEdit = nil
                    Task { await run(success: "\(name)已修改") { await model.editParty(nation, party: p.id, name: name, seats: seats) } }
                }
                .background(MemorialPaper().ignoresSafeArea())
                .presentationDetents([.height(340)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground(Theme.paper).presentationDragIndicator(.hidden).font(Theme.section)
            }
            .sheet(isPresented: $creatingHouse) {
                let lex = LocalizationEngine.lexicon(culture: info?.culture ?? s.culture ?? meta?.culture, polity: info?.polity ?? s.polity ?? meta?.polity, style: info?.style)
                let owned = state.owners.indices.filter { state.owners[$0] == nation && $0 < map.meta.provinces.count }
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "扶立新\(lex.houseUnitLabel)", subtitle: lex.isRepublican ? "在指定\(lex.adminUnit)设立新地方派系与财团" : "赐封\(lex.adminUnit)，册立新门阀", seal: "政")
                    Group2 {
                        PaperMenu(title: "选定\(lex.adminUnit)", items: owned.map { ($0, map.meta.provinces[$0].name) }, selection: $newHouseProvince)
                    }
                    .padding(.horizontal, 16)
                    TextField("", text: $newHouseSurname, prompt: Text("名称／族姓（留空按本国文化自动取名）").foregroundColor(Theme.ink2.opacity(0.6)))
                        .paperField().padding(.horizontal, 16)
                    SealButton(title: lex.isRepublican ? "核准设立" : "颁诏册立", disabled: !owned.contains(newHouseProvince)) {
                        let p = newHouseProvince
                        let s = newHouseSurname.trimmingCharacters(in: .whitespacesAndNewlines)
                        creatingHouse = false
                        Task {
                            await run(success: "新\(lex.houseUnitLabel)已设立") {
                                await model.edit("createHouse", ["n": nation, "province": p, "surname": s.isEmpty ? NSNull() as Any : s as Any])
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 22)
                .background(MemorialPaper().ignoresSafeArea())
                .presentationDetents([.height(340)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground(Theme.paper).presentationDragIndicator(.hidden).font(Theme.section)
            }
            .sheet(isPresented: $enthroning) {
                EnthroneSheet(model: model, nation: nation, stateName: meta?.name ?? info?.name ?? "", culture: info?.culture ?? s.culture, polity: info?.polity ?? s.polity, style: info?.style) { personId, name in
                    enthroning = false
                    Task { await run(success: "已推举\(name)就任执政") { await model.enthronePerson(nation, person: personId) } }
                }
                .background(MemorialPaper().ignoresSafeArea())
                .presentationDetents([.medium, .large]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground(Theme.paper).presentationDragIndicator(.hidden).font(Theme.section)
            }
            .sheet(isPresented: $showingBreakdown) {
                NationBreakdownSheet(model: model, nation: nation, nationName: meta?.name ?? info?.name ?? "")
                    .background(MemorialPaper().ignoresSafeArea())
                    .presentationDetents([.medium, .large]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground(Theme.paper).presentationDragIndicator(.hidden).font(Theme.section)
            }
        }
    }

    @ViewBuilder private func focusPage(_ page: Focus, info: NationInfo?, map: WorldMap, state: GameState, meta: WorldMeta.Nation?) -> some View {
        let title = page == .people ? "人物" : page == .wars ? "战争" : "外交"
        SheetHeader(title: title, subtitle: meta?.name ?? info?.name, color: meta.map { Names.color($0.color) }, seal: page == .people ? "人" : page == .wars ? "战" : "交")
        if let info {
            switch page {
            case .people: peoplePage(info.people ?? [])
            case .wars: warPage(info, map)
            case .talks: diplomacyTab(info, map, state, startExpanded: true)
            }
        } else {
            PanelPending(failed: failed, busy: true) { Task { await reload() } }
        }
    }
    /// 人物: five identity groups, each open. Extra roles already in the data (总督、战时统帅) open the same way.
    @ViewBuilder private func peoplePage(_ list: [NationInfo.Person]) -> some View {
        // Office sections under the polity's own titles (丞相、总理、战酋…), as the court shows them.
        let polity = info
        let sections: [(String, [NationInfo.Person])] = [
            (info?.ruler?.title ?? "君主", list.filter { $0.role == "君主" }),
            ("继承人", list.filter { $0.role == "继承人" }),
            (info?.heads?.premierTitle ?? Self.title("Chancellor", polity), list.filter { $0.role == "行政首脑" }),
            (Self.title("Steward", polity), list.filter { $0.role == "财政主管" }),
            (Self.title("Marshal", polity), list.filter { $0.role == "常备军统帅" }),
        ]
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                FoldSection(section.0, expanded: true) { peopleList(section.1, empty: "无") }
            }
            let governors = list.filter { $0.role.hasPrefix("总督") }
            if !governors.isEmpty { FoldSection(Self.title("Governor", polity) + "（\(governors.count)）", expanded: governors.count <= 6) { peopleList(governors, empty: "无") } }
            let commanders = list.filter { $0.role == "战时统帅" }
            if !commanders.isEmpty { FoldSection("战时统帅", expanded: true) { peopleList(commanders, empty: "无") } }
        }
    }
    @ViewBuilder private func warPage(_ info: NationInfo, _ map: WorldMap) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("国际宣战理由按目录登记的六条：\(WarText.internationalCasus.map { WarText.casusBelli($0) }.joined(separator: "、"))。编号 4、5 没有登记。")
                .font(Theme.label).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset).fixedSize(horizontal: false, vertical: true)
            Text("战争目标：索取若干省、占领若干省、吞并全境、附庸。目录另外允许索取赔款，以及迫使目标改信本国宗教。")
                .font(Theme.label).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset).fixedSize(horizontal: false, vertical: true)
            Text("结束原文：\(WarText.endReasons.filter { $0.0 != 9 }.map(\.1).joined(separator: "、"))，另有首都沦陷。进行中的战争不写还没发生的结束原因。")
                .font(Theme.label).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset).fixedSize(horizontal: false, vertical: true)
            Group2 {
                if info.wars.isEmpty { Row(label: "战争", value: "暂无战争") }
                ForEach(info.wars) { war in
                    warCard(war, map)
                    if war.id != info.wars.last?.id { Divider2() }
                }
            }
            .padding(.horizontal, 16)
        }
    }
    @ViewBuilder private func overviewTab(_ info: NationInfo, _ map: WorldMap, _ state: GameState) -> some View {
        let ovLex = LocalizationEngine.lexicon(culture: info.culture, polity: info.polity, style: info.style)
        let sNat = state.nations[nation]
        let capName: String = {
            guard nation < map.meta.nations.count else { return "王畿" }
            let capIdx = map.meta.nations[nation].capital
            return map.meta.cities.indices.contains(capIdx) ? map.meta.cities[capIdx].name : "王畿"
        }()
        let myFleets = (state.fleets ?? []).filter { $0.nation == nation && $0.status != "lost" }
        let rulerSummary: String = {
            if let r = info.ruler {
                let display = (r.styledName ?? r.name).trimmingCharacters(in: .whitespaces)
                let title = r.title.trimmingCharacters(in: .whitespaces)
                let full = (!title.isEmpty && !display.contains(title)) ? "\(title) \(display)" : display
                return "\(full)执掌国柄"
            }
            return "中枢摄理国政"
        }()
        let postureSummary: String = {
            if !info.wars.isEmpty {
                return "现卷入 \(info.wars.count) 场战事，麾下常备军 \(Names.wan(sNat.troops))" + (myFleets.isEmpty ? "" : "、水师战船 \(myFleets.reduce(0) { $0 + $1.ships }) 艘")
            }
            return "四境暂得承平，拥兵 \(Names.wan(sNat.troops))" + (myFleets.isEmpty ? "" : "、水师战船 \(myFleets.reduce(0) { $0 + $1.ships }) 艘")
        }()

        VStack(alignment: .leading, spacing: 14) {
                let heroClip: String = {
                    if !info.wars.isEmpty {
                        if (info.seaTransport?.totalPorts ?? 0) >= 2 && !myFleets.isEmpty && nation % 2 == 1 { return "herald-naval" }
                        if info.wars.count >= 2 || (info.wars.first?.months ?? 0) >= 16 { return "herald-siege" }
                        return "herald-war"
                    }
                    if (info.polityDetail?.coupRisk ?? 0) >= 48 { return "herald-uprising" }
                    if (info.seaTransport?.totalPorts ?? 0) >= 2 && !myFleets.isEmpty {
                        return nation % 2 == 0 ? "herald-voyage-fleet" : "herald-voyage"
                    }
                    if info.alliance != nil && nation % 2 == 0 { return "herald-alliance" }
                    if ovLex.isRepublican { return "herald-reform" }
                    switch nation % 3 {
                    case 0: return "herald-coronation"
                    case 1: return "herald-regime"
                    default: return "herald-peace"
                    }
                }()
                if InkVideoStage.hasVideo(heroClip) {
                    InkVideoStage(clip: heroClip, cornerRadius: 12, tint: !info.wars.isEmpty ? Theme.seal : Theme.jade)
                        .frame(height: 68)
                        .padding(.horizontal, 16)
                }

                // 国情卷宗导语（仿原作国策档案卷首叙事，一眼纵览政体、都城、执政与海陆军势，附透明数值拆解入口）
                Group2 {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            ArtEmblem(image: BundleArt.sealCourt, size: 22, fallback: .crown)
                            Text("国情卷宗").font(Theme.section).foregroundStyle(Theme.ink)
                            PaperTag(text: info.styleLabel ?? Names.polity[info.polity] ?? info.polity, color: Theme.seal, size: 10)
                            if let culName = Names.culture[info.culture] {
                                PaperTag(text: culName, color: Theme.jade, size: 10)
                            }
                            Spacer()
                            Button {
                                GameFeel.shared.scrollOpen()
                                showingBreakdown = true
                            } label: {
                                Text("数值明细").font(Theme.caption).foregroundStyle(Theme.jade)
                                    .padding(.horizontal, 8).padding(.vertical, 3)
                                    .background(Theme.jade.opacity(0.10), in: Capsule())
                                    .overlay(Capsule().stroke(Theme.jade.opacity(0.30), lineWidth: 0.7))
                            }
                            .buttonStyle(PressStyle())
                        }
                        Text("\(info.name)定鼎于\(capName)，领 \(sNat.provinces) \(ovLex.adminUnit) \(sNat.cities) 城；今由\(rulerSummary)，\(postureSummary)。")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 12)
                }
                .padding(.horizontal, 16)

                // 共和/立宪等议会制国家：在概览首屏即展示紧凑议会席位分布条（一键直达议政页掌控议会）
                if let parties = info.parties, !parties.isEmpty {
                    let sortedP = parties.sorted { $0.seats > $1.seats }
                    let rulingP = sortedP.first
                    Group2 {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack(spacing: 6) {
                                InkIcon(glyph: .polity, size: 15, weight: 1.8, accent: Theme.jade.opacity(0.24)).foregroundStyle(Theme.jade)
                                Text("议会格局").font(Theme.section).foregroundStyle(Theme.ink)
                                if let r = rulingP { PaperTag(text: "执政 · \(r.name) \(r.seats)席", color: Theme.seal, size: 10) }
                                Spacer()
                                Button {
                                    GameFeel.shared.tap()
                                    withAnimation(Motion.tap) { tab = .court }
                                } label: {
                                    Text("进议会 ›").font(Theme.caption).foregroundStyle(Theme.seal)
                                }
                                .buttonStyle(.plain)
                            }
                            GeometryReader { g in
                                HStack(spacing: 1.5) {
                                    ForEach(Array(parties.enumerated()), id: \.offset) { i, p in
                                        Rectangle().fill(Self.partyColor(i)).frame(width: max(3, g.size.width * CGFloat(p.seats) / 100))
                                    }
                                }
                                .clipShape(Capsule())
                            }
                            .frame(height: 8)
                            WrapLayout(spacing: 8) {
                                ForEach(Array(sortedP.prefix(4).enumerated()), id: \.offset) { _, p in
                                    let idx = parties.firstIndex { $0.name == p.name } ?? 0
                                    HStack(spacing: 4) {
                                        Circle().fill(Self.partyColor(idx)).frame(width: 7, height: 7)
                                        Text("\(p.name) \(p.seats)席").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12)
                    }
                    .padding(.horizontal, 16)
                }

                // 文明文化学说 × 国教教义与圣地实效卡（清晰呈现高权重文化与宗教加成）
                if info.cultureDoctrine != nil || !(info.creedEffect ?? "").isEmpty {
                    Group2 {
                        VStack(alignment: .leading, spacing: 8) {
                            if let doc = info.cultureDoctrine {
                                HStack(spacing: 6) {
                                    InkIcon(glyph: .culture, size: 15, weight: 1.8, accent: Theme.jade.opacity(0.24)).foregroundStyle(Theme.jade)
                                    Text("文化学说 · \(doc.title)").font(Theme.section).foregroundStyle(Theme.ink)
                                    Spacer()
                                    if let culName = Names.culture[info.culture] { PaperTag(text: culName, color: Theme.jade, size: 10) }
                                }
                                Text(doc.summary).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                                WrapLayout(spacing: 5) {
                                    ForEach(doc.effectLine.components(separatedBy: " · "), id: \.self) { token in
                                        let neg = token.contains("−") || token.contains("-")
                                        Text(token).font(Theme.caption).foregroundStyle(neg ? Theme.seal : Theme.jade)
                                            .padding(.horizontal, 7).padding(.vertical, 2.5)
                                            .background((neg ? Theme.seal : Theme.jade).opacity(0.10), in: Capsule())
                                    }
                                }
                            }
                            if let creedText = info.creedEffect, !creedText.isEmpty {
                                if info.cultureDoctrine != nil { Divider2() }
                                HStack(spacing: 6) {
                                    InkIcon(glyph: .religion, size: 15, weight: 1.8, accent: Theme.gold.opacity(0.24)).foregroundStyle(Theme.gold)
                                    Text("国教 · \(Names.religion[info.religion] ?? info.religion)").font(Theme.section).foregroundStyle(Theme.ink)
                                    Spacer()
                                    if info.holdsHolySite == true {
                                        PaperTag(text: "圣地庇佑 +12%战力/+15%税", color: Theme.gold, size: 10)
                                    }
                                }
                                Text(creedText).font(Theme.caption).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12)
                    }
                    .padding(.horizontal, 16)
                }

                NationDepthSection(model: model, nation: nation, info: info, onReload: { await reload() }, onMessage: { flash = $0 })

                if info.alive {
                    HStack(spacing: 8) {
                        Button {
                            GameFeel.shared.tap()
                            if nation < map.meta.nations.count, map.meta.cities.indices.contains(map.meta.nations[nation].capital) {
                                let c = map.meta.cities[map.meta.nations[nation].capital]
                                lower(); model.controller.showPlace(x: Double(c.x), y: Double(c.y))
                            }
                        } label: {
                            HStack(spacing: 5) {
                                InkIcon(glyph: .locate, size: 15, weight: 1.7)
                                Text("定位都城").font(Theme.label)
                            }
                            .foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity).frame(height: 36)
                            .background(Theme.paper2.opacity(0.85), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.line, lineWidth: 0.7))
                        }
                        .buttonStyle(PressStyle())

                        Button { GameFeel.shared.tap(); paint(nation) } label: {
                            HStack(spacing: 5) {
                                InkIcon(glyph: .brush, size: 15, weight: 1.7)
                                Text("绘制疆域").font(Theme.label)
                            }
                            .foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity).frame(height: 36)
                            .background(Theme.paper2.opacity(0.85), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.line, lineWidth: 0.7))
                        }
                        .buttonStyle(PressStyle())

                        Button { GameFeel.shared.tap(); placeArmy(nation) } label: {
                            HStack(spacing: 5) {
                                InkIcon(glyph: .military, size: 15, weight: 1.7)
                                Text("放置新军").font(Theme.label)
                            }
                            .foregroundStyle(Theme.seal)
                            .frame(maxWidth: .infinity).frame(height: 36)
                            .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.seal.opacity(0.32), lineWidth: 0.7))
                        }
                        .buttonStyle(PressStyle())
                    }
                    .padding(.horizontal, 16)
                }
                if let p = info.power, p.count >= 2 {
                    // 国力走势: rise and fall at a glance.
                    Group2 {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("国力走势").font(Theme.label).foregroundStyle(Theme.ink2)
                                let change = (p.last ?? 0) - (p.first ?? 0)
                                Text((change >= 0 ? "↑ " : "↓ ") + String(format: "%.0f%%", abs(change) / max(1, p.first ?? 1) * 100))
                                    .font(Theme.section).foregroundStyle(change >= 0 ? Theme.jade : Theme.seal)
                                Text(p.count >= 24 ? "近 \(p.count / 12) 年" : "近 \(p.count) 个月").font(Theme.caption).foregroundStyle(Theme.ink2)
                            }
                            Sparkline(values: p).frame(height: 44)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                    }
                    .padding(.horizontal, 16)
                }
                if let sway = info.sway, !sway.isEmpty {
                    let warCount = info.wars.count
                    let lostProvs = info.court?.lost ?? 0
                    let season = WorldSeason.of(month: state.date.month)
                    FoldSection("国势五维", expanded: true, summary: "\(season.fullName) · " + (warCount > 0 ? "战事 \(warCount) 场" : "天下承平")) {
                        Group2 {
                            VStack(alignment: .leading, spacing: 0) {
                                HStack(spacing: 8) {
                                    PaperTag(text: season.fullName, color: season == .winter ? Color(red: 0.24, green: 0.44, blue: 0.62) : season == .autumn ? Color(red: 0.74, green: 0.42, blue: 0.12) : Theme.jade, size: 11)
                                    Text(season.summary).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 9)
                                if warCount > 0 || lostProvs > 0 {
                                    Divider2()
                                    let exhaustion = min(100, warCount * 18 + lostProvs * 12 + (info.polityDetail?.defeatShock ?? 0))
                                    HStack(spacing: 8) {
                                        InkIcon(glyph: .war, size: 14, weight: 1.7).foregroundStyle(exhaustion >= 40 ? Theme.seal : Theme.ink2)
                                        Text("战事疲弊").font(Theme.body).foregroundStyle(Theme.ink2)
                                        Spacer()
                                        Text(exhaustion >= 60 ? "兵疲民困（\(exhaustion)%）" : exhaustion >= 30 ? "军需吃紧（\(exhaustion)%）" : "尚可持久（\(exhaustion)%）")
                                            .font(Theme.label).foregroundStyle(exhaustion >= 40 ? Theme.seal : Theme.ink)
                                    }
                                    .padding(.horizontal, 16).padding(.vertical, 9)
                                }
                                ForEach(Array(sway.enumerated()), id: \.offset) { _, row in
                                    Divider2()
                                    let g: InkGlyph = row.name.contains("军") ? .military : row.name.contains("守") ? .fortress : row.name.contains("财") ? .economy : row.name.contains("民") ? .house : .crown
                                    HStack(spacing: 10) {
                                        InkIcon(glyph: g, size: 15, weight: 1.7).foregroundStyle(Theme.seal.opacity(0.85)).frame(width: 18)
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(row.name).font(Theme.body).foregroundStyle(Theme.ink)
                                            Text(row.text).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8)
                                        }
                                        Spacer(minLength: 6)
                                        Text(row.value).font(Theme.section).foregroundStyle(Theme.ink).monospacedDigit()
                                    }
                                    .padding(.horizontal, 16).padding(.vertical, 8)
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                FoldSection("基本信息", expanded: true) {
                    Group2 {
                        if let r = info.ruler {
                            let eraSuffix: String = {
                                if let e = r.eraYearText, !e.isEmpty { return " · \(e)" }
                                if let h = r.honorific, !h.isEmpty { return " · \(h)" }
                                return ""
                            }()
                            let baseRuler = (r.styledName.flatMap { $0.isEmpty ? nil : $0 }) ?? r.name
                            let displayRuler = baseRuler + "（\(Int(r.age))岁）" + eraSuffix + (info.heads?.premierRules == true ? " · 虚位" : "")
                            EditRow(label: r.title, value: displayRuler) {
                                if let id = r.id { editing = NationInfo.Person(id: id, role: r.title, name: r.name, age: r.age, female: r.female ?? false, traits: r.traits ?? [], skills: r.skills ?? [50, 50, 50, 50]) }
                            }
                            if let summary = r.traitSummary, !summary.isEmpty {
                                HStack(alignment: .top, spacing: 6) {
                                    PaperTag(text: "在位加成", color: Theme.jade, size: 10)
                                    Text(summary.joined(separator: " · ")).font(Theme.caption).foregroundStyle(Theme.ink)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 16).padding(.bottom, 10)
                            }
                            Divider2()
                        }
                        // 掌权者: the head of government under the form's own title, apart from the head of state.
                        if let h = info.heads {
                            Row(label: h.premierTitle, value: (h.premierName ?? "出缺") + (h.premierRules ? " · 掌国政" : "") + (h.elected ? " · 大选组阁" : ""))
                            Divider2()
                        }
                        EditRow(label: "政体", value: info.styleLabel ?? Names.polity[info.polity] ?? info.polity) { governSub = "custom"; customPane = .polity; tab = .govern }; Divider2()
                        // 都城: tap to move it by tapping the map.
                        EditRow(label: "都城", value: capitalName(map, nation < map.meta.nations.count ? map.meta.nations[nation] : nil) ?? "—") {
                            let owned = state.owners.indices.filter { state.owners[$0] == nation }
                            pickProvince("点选新都城：本国有城池的州郡") { p in
                                guard owned.contains(p), map.meta.cities.contains(where: { $0.province == p }) else { say("只能迁都到本国有城池的州郡"); GameFeel.shared.notify(.error); return }
                                Task { await run(success: "迁都\(map.meta.provinces[p].name)") { await model.setCapital(nation, province: p) } }
                            }
                        }
                        Divider2()
                        EditRow(label: "文化 · 宗教", value: "\(Names.culture[info.culture] ?? info.culture) · \(Names.religion[info.religion] ?? info.religion)") { governSub = "custom"; customPane = .faith; tab = .govern }; Divider2()
                        ReformCard(model: model, nation: nation, info: info, say: { flash = $0 }, reload: { await reload() })
                        if Faith.catalog[info.religion] != nil { FaithCard(religion: info.religion, state: model.state, map: map, effect: info.creedEffect, shares: info.faiths); Divider2() }
                        EditRow(label: "月入", value: "\(Int(info.goldPerMonth).formatted()) 金" + Self.percent(info.bonus?["income"])) {
                            numberEdit = NumberEdit(title: "月入加成（%）", unit: "%", value: info.bonus?["income"] ?? 0) { v in await model.setBonus(nation, key: "income", value: v) }
                        }
                        Divider2()
                        EditRow(label: "国运", value: String(format: "%.0f", info.destiny)) {
                            numberEdit = NumberEdit(title: "国运（0–100）", unit: "", value: info.destiny) { v in await model.editNation(nation, gold: nil, destiny: v, polity: nil) }
                        }
                        Divider2()
                        EditRow(label: "生计", value: Livelihood.name(info.livelihood ?? "")) { pickingLivelihood = true }
                    }
                    .padding(.horizontal, 16)
                    .confirmationDialog("生计（民族特性）", isPresented: $pickingLivelihood, titleVisibility: .visible) {
                        ForEach(Livelihood.all, id: \.key) { l in
                            Button("\(l.name) · \(l.note)") { Task { await run { await model.setLivelihood(nation, l.key) } } }
                        }
                    }
                }
                FoldSection("财政", expanded: false, summary: "月入 \(Int(info.goldPerMonth).formatted()) 金 · 国库 \(Names.wan(Int(info.gold)))") { FinanceSection(model: model, nation: nation, day: state.day / 30, say: { flash = $0 }) }
                FoldSection("特产与贸易", expanded: false, summary: "特产、商路与贸易伙伴") { TradeSection(model: model, map: map, nation: nation, day: state.day / 30) }
                if !regime.history.isEmpty {
                    // 政体沿革: the polities this state has had, and the current one's standing bonus.
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            ForEach(Array(regime.history.suffix(6).enumerated()), id: \.offset) { i, p in
                                if i > 0 { InkIcon(glyph: .chevronRight, size: 10, weight: 1.8).foregroundStyle(Theme.ink2) }
                                Text(p).font(Theme.label).foregroundStyle(i == min(5, regime.history.count - 1) ? Theme.seal : Theme.ink2)
                            }
                        }
                        if !regime.trait.isEmpty { Text(regime.trait).font(Theme.label).foregroundStyle(Theme.ink2) }
                    }
                    .padding(.horizontal, Theme.Layout.sectionInset)
                }
                // 国史: the chronicle entries naming this state, newest first (each locatable on the map).
                FoldSection("国史", expanded: false, summary: history.first.map { "第\($0.day + 1)日 · " + $0.text } ?? "尚无记载") {
                    Group2 {
                        Button { withAnimation(Motion.tap) { governSub = "history"; tab = .govern } } label: {
                            HStack(spacing: 8) {
                                ArtEmblem(image: BundleArt.sealChronicle, size: 24, fallback: .chronicle)
                                Text("查看历代执政世系、强势评级与完整史册").font(Theme.body).foregroundStyle(Theme.seal)
                                Spacer()
                                InkIcon(glyph: .chevronRight, size: 12, weight: 1.7).foregroundStyle(Theme.seal)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if !history.isEmpty { Divider2() }
                        if history.isEmpty { Row(label: "国史", value: "尚无记载") }
                        ForEach(Array(history.prefix(20).enumerated()), id: \.offset) { i, e in
                            HStack(alignment: .top, spacing: 8) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("第\(e.day + 1)日").font(Theme.caption).foregroundStyle(Theme.ink2)
                                    Text(e.text).font(Theme.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                                }
                                Spacer(minLength: 6)
                                if let p = e.province, map.meta.provinces.indices.contains(p) {
                                    Button {
                                        GameFeel.shared.tap()
                                        lower()
                                        let pr = map.meta.provinces[p]
                                        model.controller.showPlace(x: Double(pr.x), y: Double(pr.y))
                                        fly(p)
                                    } label: {
                                        InkIcon(glyph: .locate, size: 13, weight: 1.7).foregroundStyle(Theme.seal)
                                            .frame(width: 26, height: 26).background(Theme.seal.opacity(0.08), in: Circle())
                                    }
                                    .buttonStyle(PressStyle())
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 9)
                            if i < min(history.count, 20) - 1 { Divider2() }
                        }
                    }
                    .padding(.horizontal, 16)
                }
        }
    }
    @ViewBuilder private func courtTab(_ info: NationInfo, _ map: WorldMap, _ state: GameState) -> some View {
        let lex = LocalizationEngine.lexicon(culture: info.culture, polity: info.polity, style: info.style)
        VStack(alignment: .leading, spacing: 14) {
                // 中枢元首与实际掌权者统一卡片（落实多政体双轨掌权展示 + 年号尊号与在位性格实效）
                if info.alive {
                    Group2 {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 12) {
                                // 国家元首
                                Button {
                                    if let r = info.ruler, let id = r.id {
                                        editing = NationInfo.Person(id: id, role: r.title, name: r.name, age: r.age, female: r.female ?? false, traits: r.traits ?? [], skills: r.skills ?? [50, 50, 50, 50])
                                    }
                                } label: {
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack(spacing: 5) {
                                            Text(info.ruler?.title ?? "君主").font(Theme.caption).foregroundStyle(Theme.seal)
                                            if let era = info.ruler?.eraYearText, !era.isEmpty {
                                                PaperTag(text: era, color: Theme.seal, size: 10)
                                            } else if let hon = info.ruler?.honorific, !hon.isEmpty {
                                                PaperTag(text: hon, color: Theme.jade, size: 10)
                                            }
                                            if info.heads?.premierRules == true { PaperTag(text: "虚位", color: Theme.ink2, size: 10) }
                                        }
                                        Text(info.ruler?.styledName ?? info.ruler?.name ?? "空缺").font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                                        if let r = info.ruler {
                                            Text("\(Int(r.age))岁 · 点按编辑").font(Theme.caption).foregroundStyle(Theme.ink2)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)

                                if let h = info.heads {
                                    Divider().frame(height: 36)
                                    Button {
                                        if let hid = h.premierHouseId, !hid.isEmpty {
                                            tree = TreePick(id: hid, name: info.court?.actualRuler?.houseName ?? "掌权世家")
                                        } else {
                                            appointing = AppointTarget(office: "Chancellor")
                                        }
                                    } label: {
                                        VStack(alignment: .leading, spacing: 3) {
                                            HStack(spacing: 5) {
                                                Text(h.premierTitle).font(Theme.caption).foregroundStyle(h.premierRules ? Theme.seal : Theme.jade)
                                                if h.premierRules { PaperTag(text: "实权", color: Theme.seal, size: 10) }
                                            }
                                            Text(h.premierName ?? "出缺").font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                                            Text(info.court?.actualRuler?.houseName.map { "\($0) · 点看族谱" } ?? (h.elected ? "议会推举" : "中枢辅政"))
                                                .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            if let summary = info.ruler?.traitSummary, !summary.isEmpty {
                                Divider2()
                                VStack(alignment: .leading, spacing: 6) {
                                    PaperTag(text: "掌权实效", color: Theme.jade, size: 10)
                                    WrapLayout(spacing: 5) {
                                        ForEach(summary, id: \.self) { item in
                                            let neg = item.contains("-") || item.contains("−")
                                            Text(item)
                                                .font(Theme.caption).monospacedDigit()
                                                .foregroundStyle(neg ? Theme.seal : Theme.jade)
                                                .padding(.horizontal, 7).padding(.vertical, 2.5)
                                                .background((neg ? Theme.seal : Theme.jade).opacity(0.10), in: Capsule())
                                                .fixedSize()
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 14)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)

                    // 共和国 / 联邦 / 君主立宪等议会制政体：议会与政党格局大幅前置并默认展开，一眼统揽执政党、议席与改选！
                    if let parties = info.parties, !parties.isEmpty {
                        parliamentSection(info: info, parties: parties)
                    }

                    // 动态四方权力天平（完全按文化 × 政体切换，共和绝不出现朝堂／世家／文官）
                    if let cp = info.courtPower {
                        let pillars = (cp.pillars?.count == 4 ? cp.pillars! : lex.pillarShort)
                        Group2 {
                            VStack(alignment: .leading, spacing: 9) {
                                HStack(spacing: 6) {
                                    ArtEmblem(image: BundleArt.sealCourt, size: 24, fallback: .polity)
                                    Text(cp.title ?? lex.powerBalanceTitle).font(Theme.section).foregroundStyle(Theme.ink)
                                    Spacer()
                                    PaperTag(text: "主导 · \(cp.dominant)", color: Theme.seal, size: 11)
                                }
                                if let reg = cp.regency, !reg.isEmpty {
                                    HStack(spacing: 6) {
                                        InkIcon(glyph: .crown, size: 13, weight: 1.75).foregroundStyle(Theme.seal)
                                        Text(reg).font(Theme.caption).foregroundStyle(Theme.seal).fixedSize(horizontal: false, vertical: true)
                                    }
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                                if let warn = cp.imbalance, !warn.isEmpty {
                                    HStack(spacing: 6) {
                                        InkIcon(glyph: .fire, size: 13, weight: 1.75).foregroundStyle(Theme.seal)
                                        Text(warn).font(Theme.caption).foregroundStyle(Theme.seal).fixedSize(horizontal: false, vertical: true)
                                    }
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                                GeometryReader { g in
                                    let w = g.size.width
                                    HStack(spacing: 1.5) {
                                        Rectangle().fill(Theme.seal).frame(width: max(6, w * CGFloat(cp.crown) / 100))
                                        Rectangle().fill(Color(red: 0.72, green: 0.48, blue: 0.16)).frame(width: max(6, w * CGFloat(cp.houses) / 100))
                                        Rectangle().fill(Theme.ink).frame(width: max(6, w * CGFloat(cp.military) / 100))
                                        Rectangle().fill(Theme.jade).frame(width: max(6, w * CGFloat(cp.council) / 100))
                                    }
                                    .clipShape(Capsule())
                                }
                                .frame(height: 8)
                                HStack(spacing: 6) {
                                    powerPillarChip(pillars[0], pct: cp.crown, color: Theme.seal, code: "crown")
                                    powerPillarChip(pillars[1], pct: cp.houses, color: Color(red: 0.72, green: 0.48, blue: 0.16), code: "houses")
                                    powerPillarChip(pillars[2], pct: cp.military, color: Theme.ink, code: "military")
                                    powerPillarChip(pillars[3], pct: cp.council, color: Theme.jade, code: "council")
                                }
                                Text("\(cp.effect)（轻点任一方可主动扶植调衡）").font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 14)
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    // 当期多分支大政议案（内置 180 日议期冷却锁，彻底杜绝无限点击刷资源）
                    if let ag = info.agenda {
                        let cd = ag.cooldownDays ?? 0
                        Group2 {
                            VStack(alignment: .leading, spacing: 9) {
                                HStack(spacing: 6) {
                                    ArtEmblem(image: BundleArt.sealCouncil, size: 24, fallback: .edict)
                                    Text(cd > 0 ? (ag.resolvedTitle ?? ag.title) : ag.title).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                                    Spacer()
                                    PaperTag(text: cd > 0 ? "休会 · 余\(cd)日" : (ag.tag ?? lex.agendaTag), color: cd > 0 ? Theme.ink2 : Theme.jade, size: 10)
                                }
                                if cd > 0 {
                                    Text(ag.resolvedOutcome ?? "本期议案已表决通过，待下届议期开启后将呈递新案。")
                                        .font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                                    HStack(spacing: 6) {
                                        InkIcon(glyph: .calendar, size: 12, weight: 1.7).foregroundStyle(Theme.jade)
                                        Text("本议期已定案落印 · 距下届\(ag.tag ?? lex.agendaTag)尚余 \(cd) 日").font(Theme.caption).foregroundStyle(Theme.jade)
                                        Spacer()
                                    }
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(Theme.jade.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                } else {
                                    Text(ag.desc).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                                    HStack(spacing: 10) {
                                        Text("力主：\(ag.support)").font(Theme.caption).foregroundStyle(Theme.jade)
                                        Text("·").foregroundStyle(Theme.ink2)
                                        Text("阻挠：\(ag.oppose)").font(Theme.caption).foregroundStyle(Theme.seal)
                                        Spacer()
                                    }
                                    if let choices = ag.choices, !choices.isEmpty {
                                        VStack(spacing: 7) {
                                            ForEach(choices) { ch in
                                                let tint: Color = ch.tone == "force" ? Theme.seal : ch.tone == "compromise" ? Theme.jade : ch.tone == "bargain" ? Color(red: 0.72, green: 0.48, blue: 0.16) : Theme.ink2
                                                Button {
                                                    GameFeel.shared.tap()
                                                    Task { await run { await model.nationDecree(nation, kind: ch.id) } }
                                                } label: {
                                                    HStack(alignment: .center, spacing: 8) {
                                                        VStack(alignment: .leading, spacing: 2) {
                                                            HStack(spacing: 5) {
                                                                Text(ch.label).font(Theme.label).foregroundStyle(Theme.ink)
                                                                PaperTag(text: ch.tag, color: tint, size: 10)
                                                            }
                                                            Text(ch.detail).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                                                        }
                                                        Spacer(minLength: 4)
                                                        InkIcon(glyph: .chevronRight, size: 12, weight: 1.8).foregroundStyle(tint)
                                                    }
                                                    .padding(.horizontal, 11).padding(.vertical, 8)
                                                    .background(tint.opacity(0.06), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                                                    .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(tint.opacity(0.26), lineWidth: 0.8))
                                                    .contentShape(Rectangle())
                                                }
                                                .buttonStyle(PressStyle())
                                            }
                                        }
                                    } else {
                                        HStack(spacing: 10) {
                                            Text(ag.effect).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                                            Spacer(minLength: 4)
                                            Button {
                                                GameFeel.shared.tap()
                                                Task { await run { await model.nationDecree(nation, kind: ag.id) } }
                                            } label: {
                                                HStack(spacing: 4) {
                                                    InkIcon(glyph: .edict, size: 13, weight: 1.8)
                                                    Text(lex.forceActionLabel).font(Theme.label)
                                                }
                                                .foregroundStyle(Theme.paper2)
                                                .padding(.horizontal, 12).frame(height: 30)
                                                .background(Theme.seal, in: Capsule())
                                            }
                                            .buttonStyle(PressStyle())
                                        }
                                    }
                                }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 14)
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    // 政体个性、政局安定与政变风险仪 + 现实政体更迭入口
                    if let pd = info.polityDetail {
                        Group2 {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack(spacing: 6) {
                                    Text(info.styleLabel ?? Names.polity[info.polity] ?? info.polity).font(Theme.section).foregroundStyle(Theme.ink)
                                    PaperTag(text: pd.camp + "阵营", color: Theme.ink, size: 11)
                                    PaperTag(text: pd.fiefRule, color: pd.allowsFiefs ? Theme.jade : Theme.ink2, size: 11)
                                    Spacer()
                                }
                                Text(pd.summary).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                                Text(pd.traitLine).font(Theme.caption).foregroundStyle(Theme.seal)
                                Divider2()
                                StabilityRiskMeter(stability: pd.stability, risk: pd.coupRisk, level: pd.coupLevel)
                                if let shock = pd.defeatShock, shock >= 5 {
                                    HStack(spacing: 6) {
                                        PaperTag(text: "战败震荡 −\(shock)%", color: Theme.seal, size: 11)
                                        if let mood = pd.mood {
                                            Text("朝野民心 \(mood >= 0 ? "+\(mood)" : "\(mood)")").font(Theme.caption).foregroundStyle(mood < -20 ? Theme.seal : Theme.ink2)
                                        }
                                        Spacer()
                                    }
                                }
                                Text("主导风向：\(pd.pressure)（\(pd.likelyPath)）").font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 14)
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)

                        if !pd.transitions.isEmpty {
                            FoldSection("政体更迭与政变（\(pd.transitions.count) 项）", expanded: false, summary: "立宪 · 政变 · 革命 · 复辟") {
                                Group2 {
                                    ForEach(Array(pd.transitions.enumerated()), id: \.element.id) { idx, tr in
                                        Button {
                                            GameFeel.shared.tap()
                                            transitionConfirm = tr
                                        } label: {
                                            HStack(spacing: 10) {
                                                InkIcon(glyph: tr.dramatic ? .war : .polity, size: 17, weight: 1.75, accent: (tr.dramatic ? Theme.seal : Theme.jade).opacity(0.24))
                                                    .foregroundStyle(tr.dramatic ? Theme.seal : Theme.jade)
                                                    .frame(width: 28, height: 28)
                                                    .background((tr.dramatic ? Theme.seal : Theme.jade).opacity(0.09), in: Circle())
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(tr.title).font(Theme.body).foregroundStyle(Theme.ink)
                                                    Text(tr.subtitle).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                                                }
                                                Spacer(minLength: 4)
                                                InkIcon(glyph: .chevronRight, size: 12, weight: 1.7).foregroundStyle(tr.dramatic ? Theme.seal : Theme.jade)
                                            }
                                            .padding(.horizontal, 14).padding(.vertical, 10)
                                            .contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain)
                                        if idx < pd.transitions.count - 1 { Divider2() }
                                    }
                                }
                                .padding(.horizontal, Theme.Layout.pageInset)
                            }
                            .confirmationDialog(transitionConfirm?.title ?? "", isPresented: Binding(get: { transitionConfirm != nil }, set: { if !$0 { transitionConfirm = nil } }), titleVisibility: .visible) {
                                if let tr = transitionConfirm {
                                    Button("确认执行：\(tr.title)", role: tr.dramatic ? .destructive : nil) {
                                        transitionConfirm = nil
                                        Task { await run { await model.regimeTransition(nation, action: tr.id) } }
                                    }
                                }
                                Button("取消", role: .cancel) { transitionConfirm = nil }
                            } message: {
                                Text(transitionConfirm?.subtitle ?? "")
                            }
                        }
                    }

                    HStack(spacing: 8) {
                        Button {
                            GameFeel.shared.tap()
                            Task { await run(success: "已为\(lex.adminPlural)补齐\(lex.governorTitle)") { await model.edit("nationDiplomacyOrder", ["n": nation, "kind": "fillGovernors"]) } }
                        } label: { paneAction("补齐\(lex.governorTitle)", "person.badge.plus") }.buttonStyle(PressStyle())
                        Button {
                            GameFeel.shared.tap()
                            enthroning = true
                        } label: { paneAction(lex.successionAction, "crown") }.buttonStyle(PressStyle())
                        Button {
                            GameFeel.shared.tap()
                            openPeople()
                        } label: { paneAction("人物录", "person") }.buttonStyle(PressStyle())
                    }
                    .padding(.horizontal, 16)
                }
                if let court = info.court, info.alive { FoldSection(lex.courtSectionTitle, expanded: true) { courtView(court, map) } }
                if let court = info.court, info.alive, !court.houses.isEmpty {
                    FoldSection("\(lex.housesSectionTitle)（\(court.houses.count)）", expanded: court.houses.count <= 4, summary: "\(court.houses.count) 家\(lex.houseUnitLabel)") { housesSection(court) }
                }
                if let list = info.court?.governorList, !list.isEmpty, info.alive {
                    let filled = list.filter { $0.holder != nil }.count
                    FoldSection("\(lex.adminPlural)\(lex.governorTitle)（\(filled)/\(list.count)）", expanded: list.count <= 6, summary: filled == list.count ? "全部满员" : "空缺 \(list.count - filled) \(lex.adminUnit)") {
                        Group2 {
                            ForEach(Array(list.enumerated()), id: \.offset) { i, g in
                                Button { appointing = AppointTarget(office: "Governor:\(g.province)") } label: {
                                    HStack(spacing: 10) {
                                        Text(g.name).font(Theme.body).foregroundStyle(Theme.ink).frame(width: 96, alignment: .leading).lineLimit(1).minimumScaleFactor(0.7)
                                        Text(g.holder ?? "空缺").font(Theme.body).foregroundStyle(g.holder == nil ? Theme.ink2 : Theme.ink).lineLimit(1)
                                        Spacer()
                                        if let fit = g.fit {
                                            Text(fit >= 0.4 ? "称职" : fit >= 0 ? "平庸" : "失职").font(Theme.label)
                                                .foregroundStyle(fit >= 0.4 ? Theme.jade : fit >= 0 ? Theme.ink2 : Theme.seal)
                                        }
                                        InkIcon(glyph: .chevronRight, size: 12, weight: 1.6).foregroundStyle(Theme.ink2)
                                    }
                                    .padding(.horizontal, 16).padding(.vertical, 8).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                if i < list.count - 1 { Divider2() }
                            }
                            Text("称职的\(lex.governorTitle)每月为本\(lex.adminUnit)增税至多 12%，并压低地方动荡。轻点即可改任。").font(Theme.caption).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.vertical, 8)
                        }
                        .padding(.horizontal, 16)
                    }
                }
                if let u = info.court?.rebellion, info.alive {
                    FoldSection("叛乱形势", expanded: u.open, summary: u.open ? "有起事之虞" : "尚属安定") {
                        Group2 {
                            HStack(spacing: 10) {
                                InkIcon(glyph: u.open ? .fire : .peace, size: 15, weight: 1.7).foregroundStyle(u.open ? Theme.seal : Theme.jade)
                                Text(u.status).font(Theme.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 6)
                                if let d = u.destiny { Text("国运 \(Int(d))").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit() }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            ForEach(Array(u.provinces.enumerated()), id: \.offset) { _, p in
                                Divider2()
                                HStack(spacing: 10) {
                                    Text(p.name).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                                    Spacer()
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(Theme.ink.opacity(0.1))
                                        Capsule().fill(p.chance >= 40 ? Theme.seal : Theme.ink.opacity(0.55)).frame(width: 70 * CGFloat(min(100, p.chance)) / 100)
                                    }
                                    .frame(width: 70, height: 4)
                                    Text("\(p.chance)%").font(Theme.label).foregroundStyle(u.open ? Theme.ink : Theme.ink2).monospacedDigit().frame(width: 40, alignment: .trailing)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 7)
                            }
                            Text("国运越低、离都城越远的\(lex.adminUnit)越易起事；称职的\(lex.governorTitle)可压低动荡。派系异动见「\(lex.housesSectionTitle)」。").font(Theme.caption).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.vertical, 8).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 16)
                    }
                }
                if !postList.isEmpty {
                    let filledPosts = postList.filter { $0.holder != nil }.count
                    FoldSection("\(lex.officialsSectionTitle)（\(filledPosts)/\(postList.count)）", expanded: false, summary: "在任 \(filledPosts) 席") {
                        Group2 {
                            ForEach(Array(postList.enumerated()), id: \.offset) { i, p in
                                Button { appointing = AppointTarget(office: "post-" + p.id, post: p) } label: {
                                    HStack(spacing: 10) {
                                        Text(p.title).font(Theme.body).foregroundStyle(Theme.ink).frame(width: 108, alignment: .leading).lineLimit(1).minimumScaleFactor(0.7)
                                        Text(p.holder?.name ?? "空缺").font(Theme.body).foregroundStyle(p.holder == nil ? Theme.ink2 : Theme.ink).lineLimit(1)
                                        Spacer()
                                        if let v = p.value { Text("\(["魅", "军", "外", "政"][min(3, max(0, p.skill))])\(Int(v))").font(Theme.caption).foregroundStyle(v >= 60 ? Theme.jade : v < 40 ? Theme.seal : Theme.ink2).monospacedDigit() }
                                        InkIcon(glyph: p.effect == "gold" ? .economy : p.effect == "morale" ? .military : .crown, size: 13, weight: 1.6).foregroundStyle(Theme.ink2)
                                    }
                                    .padding(.horizontal, 16).padding(.vertical, 8).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                if let person = p.holder, person.key >= 0 {
                                    Button { editing = person } label: { Row(label: "修改" + person.name + "的属性", value: "能力与天赋 ›") }.buttonStyle(.plain)
                                }
                                if i < postList.count - 1 { Divider2() }
                            }
                            Text("称职的官员每月增国库、国运或各军士气；不称职则相反。").font(Theme.caption).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.vertical, 8)
                        }
                        .padding(.horizontal, 16)
                    }
                }
        }
    }
    @ViewBuilder private func militaryTab(_ info: NationInfo, _ map: WorldMap, _ state: GameState) -> some View {
        // 军事: the forces at a glance (strength, armies, battles, morale), what they are made of, every
        // army with its arm, state and morale (tap to open), the fleets, and the wars as cards.
        let mine = state.armies.indices.filter { state.armies[$0].nation == nation }
        let troops = mine.reduce(0) { $0 + state.armies[$1].troops }
        let morale = mine.isEmpty ? 0 : mine.reduce(0) { $0 + state.armies[$1].morale } / mine.count
        let fighting = mine.filter { state.armies[$0].status == "fighting" }.count
        let fleets = (state.fleets ?? []).filter { $0.nation == nation }
        let tint = nation < map.meta.nations.count ? Names.color(map.meta.nations[nation].color) : Theme.ink2
        LazyVStack(alignment: .leading, spacing: 14) {
            StatStrip(tiles: [
                StatTile(label: "总兵力", value: Names.wan(troops)),
                StatTile(label: "军队", value: "\(mine.count)支"),
                StatTile(label: "交战", value: "\(fighting)支", warn: fighting > 0),
                StatTile(label: "士气", value: "\(morale)", fraction: Double(morale) / 100, warn: morale < 40),
            ])
            NationMilitaryControlBar(
                model: model,
                nation: nation,
                alive: info.alive,
                onPlaceArmy: { placeArmy(nation) },
                onToast: { flash = $0 },
                onReload: { await reload() }
            )
            if !mine.isEmpty {
                // 集团军群、五部职能编制与战神谱实时加持总览
                let groupRows: [(name: String, count: Int, troops: Int, bonus: Int, composition: String, synergy: String)] = {
                    var mapGrp = [String: (count: Int, troops: Int, bonus: Int, composition: String, synergy: String)]()
                    for idx in mine {
                        let a = state.armies[idx]
                        guard let g = a.armyGroup, !g.isEmpty else { continue }
                        var cur = mapGrp[g] ?? (0, 0, a.groupBonus ?? 6, a.groupComposition ?? "", a.groupSynergy ?? "")
                        cur.count += 1; cur.troops += a.troops; cur.bonus = max(cur.bonus, a.groupBonus ?? 6)
                        if cur.composition.isEmpty, let comp = a.groupComposition { cur.composition = comp }
                        if cur.synergy.isEmpty, let syn = a.groupSynergy { cur.synergy = syn }
                        mapGrp[g] = cur
                    }
                    return mapGrp.map { ($0.key, $0.value.count, $0.value.troops, $0.value.bonus, $0.value.composition, $0.value.synergy) }
                        .sorted { $0.troops != $1.troops ? $0.troops > $1.troops : $0.name < $1.name }
                }()
                let branchRows: [(label: String, note: String, count: Int, troops: Int)] = {
                    var mapBr = [String: (note: String, count: Int, troops: Int)]()
                    for idx in mine {
                        let a = state.armies[idx]
                        let lbl = a.branchLabel ?? "野战主力"
                        var cur = mapBr[lbl] ?? (a.branchNote ?? "", 0, 0)
                        cur.count += 1; cur.troops += a.troops
                        mapBr[lbl] = cur
                    }
                    return mapBr.map { ($0.key, $0.value.note, $0.value.count, $0.value.troops) }
                        .sorted { $0.troops != $1.troops ? $0.troops > $1.troops : $0.label < $1.label }
                }()
                let nationWarGod = mine.compactMap { state.armies[$0].warGodAura }.first
                let milLex = LocalizationEngine.lexicon(culture: info.culture, polity: info.polity, style: info.style)

                FoldSection("\(milLex.militaryFormationTitle)与职能分部", expanded: true, summary: groupRows.isEmpty ? "\(branchRows.count) 类职能分部" : "\(groupRows.count) 支集团军 · \(branchRows.count) 类分部") {
                    Group2 {
                        VStack(alignment: .leading, spacing: 10) {
                            if let wg = nationWarGod, !wg.isEmpty {
                                let natCul = model.map?.meta.nations.indices.contains(nation) == true ? model.map!.meta.nations[nation].culture : nil
                                HStack(alignment: .top, spacing: 8) {
                                    ArtEmblem(image: BundleArt.warCrest(for: natCul), size: 28, fallback: .military)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("战神谱在阵加持").font(Theme.caption).foregroundStyle(Theme.seal)
                                        Text(wg).font(Theme.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(10)
                                .background(Theme.seal.opacity(0.07), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            }
                            if !groupRows.isEmpty {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("战区集团军协同（同战区 2 支以上友军自动成群）").font(Theme.caption).foregroundStyle(Theme.ink2)
                                    ForEach(groupRows, id: \.name) { g in
                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack(spacing: 8) {
                                                PaperTag(text: "总协同+\(g.bonus)%", color: Theme.seal, size: 11)
                                                Text(g.name).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                                                Spacer(minLength: 4)
                                                Text("\(g.count) 支 · \(Names.wan(g.troops))").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                                            }
                                            if !g.composition.isEmpty || !g.synergy.isEmpty {
                                                Text([g.composition, g.synergy].filter { !$0.isEmpty }.joined(separator: " · "))
                                                    .font(Theme.caption).foregroundStyle(Theme.jade).lineLimit(1).minimumScaleFactor(0.82)
                                            }
                                        }
                                    }
                                }
                                Divider2()
                            }
                            VStack(alignment: .leading, spacing: 7) {
                                Text("常备军职能分部").font(Theme.caption).foregroundStyle(Theme.ink2)
                                ForEach(branchRows, id: \.label) { b in
                                    HStack(alignment: .top, spacing: 8) {
                                        PaperTag(text: b.label, color: Theme.jade, size: 11)
                                        VStack(alignment: .leading, spacing: 1) {
                                            HStack {
                                                Text("\(b.count) 支 · \(Names.wan(b.troops))").font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit()
                                                Spacer()
                                            }
                                            if !b.note.isEmpty {
                                                Text(b.note).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 14)
                    }
                    .padding(.horizontal, 16)
                }

                // 兵种构成: troops by arm, as one bar and a legend with each arm's piece.
                let byUnit = Dictionary(grouping: mine, by: { state.armies[$0].unit })
                    .map { (unit: $0.key, troops: $0.value.reduce(0) { $0 + state.armies[$1].troops }, count: $0.value.count) }
                    .sorted { $0.troops != $1.troops ? $0.troops > $1.troops : $0.unit < $1.unit }
                FoldSection("兵种构成", expanded: false) {
                    Group2 {
                        VStack(alignment: .leading, spacing: 10) {
                            GeometryReader { g in
                                HStack(spacing: 1.5) {
                                    ForEach(Array(byUnit.enumerated()), id: \.offset) { i, u in
                                        Rectangle().fill(tint.opacity(1 - Double(min(i, 5)) * 0.14)).frame(width: max(2, (g.size.width - CGFloat(byUnit.count - 1) * 1.5) * CGFloat(u.troops) / CGFloat(max(1, troops))))
                                    }
                                }
                                .frame(width: g.size.width, alignment: .leading)
                                .clipShape(Capsule())
                            }
                            .frame(height: 10)
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 8) {
                                ForEach(Array(byUnit.enumerated()), id: \.offset) { i, u in
                                    HStack(spacing: 6) {
                                        UnitMark(unit: u.unit, color: tint.opacity(1 - Double(min(i, 5)) * 0.14)).frame(width: 22, height: 22)
                                        Text(Names.unit[u.unit] ?? u.unit).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                                        Spacer(minLength: 2)
                                        Text("\(u.count)支 · \(Int((Double(u.troops) / Double(max(1, troops)) * 100).rounded()))%").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 14)
                    }
                    .padding(.horizontal, 16)
                }
            }
            FoldSection("军队（\(mine.count) 支 · \(Names.wan(troops))）", expanded: true) {
                Group2 {
                    if mine.isEmpty { Row(label: "军队", value: "暂无军队") }
                    let sorted = Array(mine.sorted { state.armies[$0].troops > state.armies[$1].troops }.prefix(30))
                    ForEach(Array(sorted.enumerated()), id: \.offset) { k, i in
                        let a = state.armies[i]
                        let status: (String, Color) = a.status == "fighting" ? ("交战", Theme.seal) : a.status == "retreating" ? ("撤退", Color(red: 0.72, green: 0.45, blue: 0.15)) : a.travel == "moving" ? ("行军", Theme.jade) : ("驻守", Theme.ink2)
                        Button { openArmy(i) } label: {
                            HStack(spacing: 10) {
                                UnitMark(unit: a.unit, color: tint).frame(width: 30, height: 30)
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 6) {
                                        Text(a.name).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                                        if let br = a.branchLabel, !br.isEmpty { PaperTag(text: br, color: Theme.jade, size: 10) }
                                        let lexMil = LocalizationEngine.lexicon(culture: info.culture, polity: info.polity, style: info.style)
                                        if a.banner != nil { PaperTag(text: a.banner == "ruler" ? (lexMil.isRepublican ? "元首" : "御驾") : "帅旗", size: 10) }
                                    }
                                    HStack(spacing: 6) {
                                        PaperTag(text: status.0, color: status.1, size: 10)
                                        if a.embarked == true { PaperTag(text: "登船渡海", color: Theme.jade, size: 10) }
                                        if let ld = a.landingDays, ld > 0 { PaperTag(text: "两栖抢滩\(ld)日", color: Theme.seal, size: 10) }
                                        if a.seaSupplyCut == true { PaperTag(text: "海路断补", color: Theme.seal, size: 10) }
                                        if let grp = a.armyGroup, !grp.isEmpty {
                                            Text(grp).font(Theme.caption).foregroundStyle(Theme.seal).lineLimit(1)
                                        } else {
                                            Text(Names.unit[a.unit] ?? a.unit).font(Theme.caption).foregroundStyle(Theme.ink2)
                                        }
                                        if map.meta.provinces.indices.contains(a.province) { Text("· " + map.meta.provinces[a.province].name).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1) }
                                    }
                                }
                                Spacer(minLength: 6)
                                VStack(alignment: .trailing, spacing: 4) {
                                    Text(Names.wan(a.troops)).font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit()
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(Theme.ink.opacity(0.1))
                                        Capsule().fill(a.morale < 30 ? Theme.seal : Theme.jade).frame(width: 46 * CGFloat(min(100, max(0, a.morale))) / 100)
                                    }
                                    .frame(width: 46, height: 4)
                                }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if k < sorted.count - 1 { Divider2() }
                    }
                    if mine.count > 30 { Text("另有 \(mine.count - 30) 支较小的军队").font(Theme.caption).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.vertical, 8) }
                }
                .padding(.horizontal, 16)
            }
            if let st = info.seaTransport, (st.totalPorts > 0 || !fleets.isEmpty) {
                let escortCnt = fleets.filter { $0.escorting == true }.count
                let blockCnt = fleets.filter { $0.blockading == true }.count
                Group2 {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            InkIcon(glyph: .anchor, size: 15, weight: 1.85).foregroundStyle(Theme.jade)
                            Text("海运运力与制海权").font(Theme.section).foregroundStyle(Theme.ink)
                            if let sc = st.controlScore {
                                PaperTag(text: "制海 \(sc)% · \(st.controlLabel ?? "")", color: sc >= 65 ? Theme.jade : sc < 40 ? Theme.seal : Theme.gold, size: 10)
                            }
                            Spacer()
                            PaperTag(text: "运力 \(st.used)/\(st.capacity) 船队", color: st.capacity == 0 ? Theme.seal : (st.used >= st.capacity ? Color(red: 0.72, green: 0.48, blue: 0.16) : Theme.jade), size: 11)
                        }
                        HStack(spacing: 8) {
                            Text("可用海港 \(st.unblockedPorts)/\(st.totalPorts)").font(Theme.caption).foregroundStyle(st.blockadedPorts > 0 ? Theme.seal : Theme.ink2).monospacedDigit()
                            if st.blockadedPorts > 0 { PaperTag(text: "\(st.blockadedPorts)港遭封锁", color: Theme.seal, size: 10) }
                            if escortCnt > 0 { PaperTag(text: "\(escortCnt)舰护航", color: Theme.jade, size: 10) }
                            if blockCnt > 0 { PaperTag(text: "\(blockCnt)舰封锁敌港", color: Theme.ink, size: 10) }
                            Spacer()
                            if info.alive {
                                Button {
                                    GameFeel.shared.tap()
                                    Task { await run { await model.nationDecree(nation, kind: "navalDockyard") } }
                                } label: {
                                    Text("扩建船坞 +2").font(Theme.caption).foregroundStyle(Theme.jade)
                                        .padding(.horizontal, 9).frame(height: 26)
                                        .background(Theme.jade.opacity(0.09), in: Capsule())
                                        .overlay(Capsule().stroke(Theme.jade.opacity(0.28), lineWidth: 0.7))
                                }
                                .buttonStyle(PressStyle())
                            }
                        }
                        Text("陆军须自未封锁海港登船渡海；无战舰护航的运兵船队易遭敌水师海上截杀，近海友军舰队可提供两栖抢滩舰炮火力支援。")
                            .font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 12)
                }
                .padding(.horizontal, 16)
            }
            if !fleets.isEmpty {
                FoldSection("水师舰队（\(fleets.count) 支 · \(fleets.reduce(0) { $0 + $1.ships }) 艘）", expanded: true) {
                    Group2 {
                        ForEach(Array(fleets.enumerated()), id: \.offset) { k, f in
                            let cls = FleetText.classes(f)
                            Button {
                                GameFeel.shared.tap()
                                openFleet(f.id)
                            } label: {
                                HStack(spacing: 10) {
                                    UnitMark(unit: "Fleet", color: tint).frame(width: 34, height: 34)
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 6) {
                                            Text(f.name).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                                            PaperTag(text: f.blockading == true ? "封锁敌港" : f.escorting == true ? "护航掩护" : FleetText.mission(f.mission), color: f.blockading == true ? Theme.seal : Theme.jade, size: 10)
                                        }
                                        Text("主\(cls.h)/快\(cls.l)/炮\(cls.g) · 水兵 \(Names.wan(f.crew))" + ((f.admiral?.isEmpty == false) ? " · 提督\(f.admiral!)" : ""))
                                            .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                                    }
                                    Spacer(minLength: 6)
                                    VStack(alignment: .trailing, spacing: 4) {
                                        Text("\(f.ships) 艘").font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit()
                                        InkBar(fraction: f.hull, color: f.hull < 0.35 ? Theme.danger : tint, height: 4).frame(width: 44)
                                    }
                                    InkIcon(glyph: .chevronRight, size: 12, weight: 1.7).foregroundStyle(Theme.ink2)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if k < fleets.count - 1 { Divider2() }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            if !info.wars.isEmpty {
                FoldSection("战事（\(info.wars.count)）", expanded: true) {
                    Group2 {
                        ForEach(info.wars) { war in
                            warCard(war, map)
                            if war.id != info.wars.last?.id { Divider2() }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
        }
    }
    @ViewBuilder func diplomacyTab(_ info: NationInfo, _ map: WorldMap, _ state: GameState, startExpanded: Bool = true) -> some View {
        // 外交: each relation as a row of state chips in its colour (tap a chip to open that state), then
        // treaties, then the state's own acts.
        let groups: [(title: String, glyph: InkGlyph, color: Color, nations: [Int], note: (Int) -> String?)] = [
            ("交战", .war, Theme.seal, info.enemies, { _ in nil }),
            ("同盟" + (info.alliance.map { "·" + $0.name } ?? ""), .alliance, Color(red: 0.2, green: 0.4, blue: 0.65), (info.alliance?.members ?? []).filter { $0 != nation }, { _ in nil }),
            ("宗主", .crown, Color(red: 0.6, green: 0.3, blue: 0.6), info.overlord >= 0 ? [info.overlord] : [], { _ in nil }),
            ("附庸", .fortress, Theme.jade, info.vassals, { _ in nil }),
            ("停战", .peace, Theme.ink2, (info.truces ?? []).map(\.nation), { n in (info.truces ?? []).first { $0.nation == n }.map { "余\($0.years)年" } }),
            ("条约", .diplomacy, Color(red: 0.72, green: 0.52, blue: 0.14), (info.treaties ?? []).map(\.nation), { n in (info.treaties ?? []).first { $0.nation == n }.map { DiplomacyOverview.treatyLabel($0.kind) + " · 余\(max(1, $0.years))年" } }),
            ("王位宣称", .crown, Color(red: 0.68, green: 0.44, blue: 0.12), (info.claims ?? []).map(\.nation), { n in (info.claims ?? []).first { $0.nation == n }.map { "宣称 · 余\($0.years)年" } }),
        ]
        let shown = groups.filter { !$0.nations.isEmpty }
        LazyVStack(alignment: .leading, spacing: 14) {
            if info.alive {
                HStack(spacing: 10) {
                    if !info.enemies.isEmpty {
                        Button {
                            GameFeel.shared.tap()
                            Task { await run(success: "已与全部敌国停战") { await model.edit("nationDiplomacyOrder", ["n": nation, "kind": "peaceAll"]) } }
                        } label: { paneAction("全面停战（\(info.enemies.count)）", "hand.raised") }.buttonStyle(PressStyle())
                    }
                    Button {
                        GameFeel.shared.tap()
                        confirmWarNeighbors = true
                    } label: { paneAction("向周边邻国宣战", "flag.2.crossed") }.buttonStyle(PressStyle())
                }
                .padding(.horizontal, 16)
                .confirmationDialog("向周边邻国四面出击？", isPresented: $confirmWarNeighbors, titleVisibility: .visible) {
                    Button("即刻向至多 4 个邻国宣战", role: .destructive) {
                        Task { await run(success: "已向周边邻国宣战") { await model.edit("nationDiplomacyOrder", ["n": nation, "kind": "warNeighbors"]) } }
                    }
                    Button("取消", role: .cancel) {}
                } message: { Text("不会攻击盟友、宗主、附庸或停战期内国家。") }
            }
            FoldSection("外交关系", expanded: startExpanded) {
                Group2 {
                    if shown.isEmpty {
                        Row(label: "外交", value: "与天下诸国相安无事")
                    }
                    ForEach(Array(shown.enumerated()), id: \.offset) { idx, g in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                InkIcon(glyph: g.glyph, size: 14, weight: 1.7, accent: g.color.opacity(0.24)).foregroundStyle(g.color)
                                Text(g.title).font(Theme.body).foregroundStyle(Theme.ink)
                                PaperTag(text: "\(g.nations.count)", color: g.color)
                                Spacer()
                            }
                            FlowChips(items: g.nations.filter { $0 >= 0 && $0 < map.meta.nations.count }.map { n in
                                (n, map.meta.nations[n].name, Names.color(map.meta.nations[n].color), g.note(n))
                            }) { other in
                                let otherName = map.meta.nations[other].name
                                let capProv = map.meta.cities.indices.contains(map.meta.nations[other].capital) ? map.meta.cities[map.meta.nations[other].capital].province : 0
                                let isEnemy = info.enemies.contains(other)
                                var items: [PressMenuItem] = [
                                    PressMenuItem(title: "飞往\(otherName)都城", symbol: "map") { lower(); fly(capProv) },
                                ]
                                if info.alive {
                                    if isEnemy {
                                        items.append(PressMenuItem(title: "与\(otherName)立即议和", symbol: "scroll") {
                                            Task { await run(success: "已与\(otherName)议和") { await model.makePeace(nation, other) } }
                                        })
                                    } else if info.overlord < 0 {
                                        items.append(PressMenuItem(title: "向\(otherName)宣战", symbol: "flag.2.crossed", destructive: true) {
                                            Task { await run(success: "已向\(otherName)宣战") { await model.declareWar(nation, on: other) } }
                                        })
                                    }
                                }
                                pressMenu = PressMenu(title: otherName, subtitle: g.note(other) ?? g.title, items: items)
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 11)
                        if idx < shown.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }
            if info.alive { FoldSection("国家行为", expanded: startExpanded) { actions(info, map) } }
        }
    }
    /// The capital's city name (the legend's capital is a city index).
    func capitalName(_ map: WorldMap, _ n: WorldMeta.Nation?) -> String? {
        guard let n, map.meta.cities.indices.contains(n.capital) else { return nil }
        let c = map.meta.cities[n.capital]
        let province = map.meta.provinces.indices.contains(c.province) ? map.meta.provinces[c.province].name : ""
        return c.name.isEmpty ? province : (province.isEmpty || province == c.name ? c.name : "\(c.name)（\(province)）")
    }
    static func hex(_ c: Color) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(c).getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X", Int((max(0, min(1, r)) * 255).rounded()), Int((max(0, min(1, g)) * 255).rounded()), Int((max(0, min(1, b)) * 255).rounded()))
    }
    /// 国色 choices: the original's map palette.
    static let palette = ["#C0392B", "#E67E22", "#F1C40F", "#A0B83C", "#27AE60", "#16A085", "#2E86C1", "#5B4BA0",
                          "#8E44AD", "#D35490", "#A0522D", "#7F8C8D", "#E8A5A0", "#F5CBA7", "#A9DFBF", "#AED6F1"]
    static func partyColor(_ i: Int) -> Color {
        [Color(red: 0.75, green: 0.2, blue: 0.15), Color(red: 0.2, green: 0.4, blue: 0.65), Color(red: 0.85, green: 0.6, blue: 0.2), Color(red: 0.3, green: 0.55, blue: 0.3), Color(red: 0.5, green: 0.35, blue: 0.6)][i % 5]
    }
    static func temperName(_ t: Double) -> String { t >= 1.3 ? "好战" : t >= 1.1 ? "进取" : t > 0.9 ? "持重" : t > 0.75 ? "温和" : "求和" }
    static func stanceColor(_ s: String) -> Color {
        switch s { case "宗室", "掌权": return Theme.seal; case "名义宗室": return Color(red: 0.62, green: 0.45, blue: 0.18); case "拥戴": return Theme.jade; case "谋逆": return Color(red: 0.45, green: 0.08, blue: 0.08); case "离心": return Color(red: 0.72, green: 0.45, blue: 0.15); default: return Theme.ink2 }
    }
    /// The forms of government (engine Regimes.styles): label, and what they bring.
    static let styles: [(id: String, label: String, note: String)] = [
        ("absolute", "君主专制", "王国 · 国王独断"), ("constitutional", "君主立宪", "王国 · 议会与党派"),
        ("dualMonarchy", "二元君主立宪", "王国 · 君主握实权、议会参政"),
        ("empire", "帝制", "帝国 · 皇帝"), ("junta", "军政府", "国 · 最高统帅"),
        ("fascist", "法西斯", "国 · 领袖 · 国家法西斯党"), ("nazi", "国家社会主义", "国 · 元首 · 纳粹党"),
        ("democratic", "民主共和", "共和国 · 总统 · 多党选举"), ("semiPresidential", "半总统共和", "共和国 · 总统与总理共治"),
        ("communist", "人民共和（共产主义）", "人民共和国 · 主席 · 一党执政"),
        ("oligarchic", "寡头共和", "共和国 · 执政官 · 元老与商会"), ("technocracy", "专家官僚制", "共和国 · 首席执政官 · 精英治国"),
        ("directorate", "督政府", "共和国 · 首席督政官 · 委员会"),
        ("federal", "联邦共和", "联邦 · 联邦主席 · 多党"),
        ("theocracy", "政教合一", "教宗国 / 哈里发国 / 法王领"), ("tribal", "部落联盟", "部族 · 酋长或可汗"),
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
    static let officeTitle = ["Chancellor": "宰相", "Steward": "司农", "Marshal": "大将军", "Governor": "总督"]
    static let officeDuty = ["Chancellor": "总理朝政 · 增国库", "Steward": "掌钱粮 · 增国库", "Marshal": "统率三军", "Governor": "治一州 · 增税收、压叛乱"]
    /// 官称随政体: the same three offices and the governor under each polity's own titles.
    static let titlesByPolity: [String: [String: String]] = [
        "Empire": ["Chancellor": "丞相", "Steward": "大司农", "Marshal": "太尉", "Governor": "刺史"],
        "Kingdom": ["Chancellor": "宰相", "Steward": "司农", "Marshal": "大将军", "Governor": "总督"],
        "Republic": ["Chancellor": "总理", "Steward": "财政部长", "Marshal": "国防部长", "Governor": "州长"],
        "Federation": ["Chancellor": "联邦总理", "Steward": "联邦财长", "Marshal": "联邦军司令", "Governor": "州长"],
        "Theocracy": ["Chancellor": "枢机首辅", "Steward": "圣库总管", "Marshal": "圣殿统领", "Governor": "主教"],
        "Tribal": ["Chancellor": "大长老", "Steward": "掌粮官", "Marshal": "战酋", "Governor": "部族头人"],
    ]
    /// 官称: the form of government first, then the culture for a monarchy, then the polity.
    static let titlesByStyle: [String: [String: String]] = [
        "communist": ["Chancellor": "总理", "Steward": "财政人民委员", "Marshal": "国防人民委员", "Governor": "省委书记"],
        "socialist": ["Chancellor": "总理", "Steward": "财政人民委员", "Marshal": "国防人民委员", "Governor": "省委书记"],
        "council": ["Chancellor": "革委会主任", "Steward": "财经委员", "Marshal": "军事委员", "Governor": "地方委员"],
        "fascist": ["Chancellor": "内阁首相", "Steward": "经济大臣", "Marshal": "帝国元帅", "Governor": "大区长官"],
        "nazi": ["Chancellor": "帝国总理", "Steward": "经济部长", "Marshal": "帝国元帅", "Governor": "大区长官"],
        "junta": ["Chancellor": "国务总理", "Steward": "军需总监", "Marshal": "总参谋长", "Governor": "军管专员"],
        "dictatorship": ["Chancellor": "国务总理", "Steward": "财政总监", "Marshal": "总参谋长", "Governor": "专员"],
        "sultanate": ["Chancellor": "大维齐尔", "Steward": "迪万长官", "Marshal": "大埃米尔", "Governor": "帕夏"],
        "caliphate": ["Chancellor": "大维齐尔", "Steward": "迪万长官", "Marshal": "大埃米尔", "Governor": "埃米尔"],
        "shogunate": ["Chancellor": "老中", "Steward": "勘定奉行", "Marshal": "侍大将", "Governor": "大名"],
        "tsardom": ["Chancellor": "首席大臣", "Steward": "国库大臣", "Marshal": "陆军元帅", "Governor": "督军"],
        "khanate": ["Chancellor": "断事官", "Steward": "掌帑官", "Marshal": "万户长", "Governor": "千户长"],
        "papacy": ["Chancellor": "枢机国务卿", "Steward": "圣库总管", "Marshal": "教廷卫队长", "Governor": "主教"],
        "order": ["Chancellor": "副团长", "Steward": "司库骑士", "Marshal": "元帅骑士", "Governor": "分团长"],
        "merchant": ["Chancellor": "首席议员", "Steward": "财务官", "Marshal": "舰队统帅", "Governor": "商站总督"],
        "citystate": ["Chancellor": "首席执政", "Steward": "财务官", "Marshal": "将军", "Governor": "督政"],
        "dualMonarchy": ["Chancellor": "帝国首相", "Steward": "财政大臣", "Marshal": "皇家元帅", "Governor": "省督"],
        "semiPresidential": ["Chancellor": "内阁总理", "Steward": "财政部长", "Marshal": "国防部长", "Governor": "州长"],
        "technocracy": ["Chancellor": "首席委员", "Steward": "计委主任", "Marshal": "防务总监", "Governor": "行政专员"],
        "directorate": ["Chancellor": "首席督政", "Steward": "财政督政", "Marshal": "军务督政", "Governor": "地方督政"],
    ]
    static let titlesByCulture: [String: [String: String]] = [
        "japanese": ["Chancellor": "关白", "Steward": "勘定奉行", "Marshal": "征夷大将军", "Governor": "国守"],
        "korean": ["Chancellor": "领议政", "Steward": "户曹判书", "Marshal": "都元帅", "Governor": "观察使"],
        "vietnamese": ["Chancellor": "丞相", "Steward": "户部尚书", "Marshal": "大将军", "Governor": "镇守"],
        "arab": ["Chancellor": "大维齐尔", "Steward": "迪万长官", "Marshal": "大埃米尔", "Governor": "瓦利"],
        "egyptian": ["Chancellor": "维齐尔", "Steward": "司库", "Marshal": "大将军", "Governor": "州长"],
        "persian": ["Chancellor": "大维齐尔", "Steward": "司库", "Marshal": "斯帕赫巴德", "Governor": "萨特拉普"],
        "turkic": ["Chancellor": "大维齐尔", "Steward": "财政官", "Marshal": "大埃米尔", "Governor": "贝伊"],
        "mongol": ["Chancellor": "中书令", "Steward": "掌帑官", "Marshal": "万户长", "Governor": "达鲁花赤"],
        "tibetan": ["Chancellor": "大论", "Steward": "粮官", "Marshal": "大将", "Governor": "节儿"],
        "indian": ["Chancellor": "迪万", "Steward": "司库", "Marshal": "军事统帅", "Governor": "纳瓦卜"],
        "roman": ["Chancellor": "执政官", "Steward": "财务官", "Marshal": "军团统帅", "Governor": "行省总督"],
        "greek": ["Chancellor": "首席执政", "Steward": "司库", "Marshal": "将军", "Governor": "督政"],
        "english": ["Chancellor": "首席大臣", "Steward": "财政大臣", "Marshal": "元帅", "Governor": "郡长"],
        "french": ["Chancellor": "首相", "Steward": "财政总监", "Marshal": "大元帅", "Governor": "省督"],
        "german": ["Chancellor": "宰相", "Steward": "财政大臣", "Marshal": "陆军元帅", "Governor": "邦伯"],
        "spanish": ["Chancellor": "首席大臣", "Steward": "财政大臣", "Marshal": "总司令", "Governor": "总督"],
        "portuguese": ["Chancellor": "首席大臣", "Steward": "财政大臣", "Marshal": "总司令", "Governor": "总督"],
        "italian": ["Chancellor": "首席大臣", "Steward": "财务官", "Marshal": "雇佣军统帅", "Governor": "执政"],
        "dutch": ["Chancellor": "大议长", "Steward": "财政官", "Marshal": "执政统帅", "Governor": "省督"],
        "slavic": ["Chancellor": "首席大臣", "Steward": "国库大臣", "Marshal": "军统帅", "Governor": "督军"],
        "polish": ["Chancellor": "大法官", "Steward": "国库总管", "Marshal": "大盖特曼", "Governor": "沃伊沃达"],
        "hungarian": ["Chancellor": "帕拉丁", "Steward": "司库", "Marshal": "总司令", "Governor": "伊什潘"],
        "norse": ["Chancellor": "首席大臣", "Steward": "司库", "Marshal": "元帅", "Governor": "雅尔"],
        "aztec": ["Chancellor": "蛇女官", "Steward": "税吏长", "Marshal": "鹰武士统帅", "Governor": "城邦之主"],
        "inca": ["Chancellor": "大祭司", "Steward": "结绳总管", "Marshal": "大将", "Governor": "四方总督"],
    ]
    static func title(_ office: String, _ who: NationInfo?) -> String {
        if let t = who?.customTitles?[office] { return t }
        if let t = titlesByStyle[who?.style ?? ""]?[office] { return t }
        if who?.polity == "Kingdom" || who?.polity == "Empire", let t = titlesByCulture[who?.culture ?? ""]?[office] { return t }
        return titlesByPolity[who?.polity ?? ""]?[office] ?? officeTitle[office] ?? office
    }
    /// 朝堂: governance gauge, the three central offices with their holders' fit, local rule, war
    /// commanders and the noble houses by influence.
    @ViewBuilder private func courtView(_ c: NationInfo.Court, _ map: WorldMap) -> some View {
        VStack(spacing: 10) {
            StatStrip(tiles: [
                StatTile(label: "施政", value: "\(Int((c.governance * 100).rounded()))", fraction: c.governance, warn: c.governance < 0.3, edit: {
                    numberEdit = NumberEdit(title: "施政（0–100；-1 恢复自动）", unit: "", value: c.governance * 100) { v in await model.editCourt(nation, key: "governance", value: v) }
                }),
                StatTile(label: "中枢增收", value: String(format: "%+.0f%%", (c.centralIncome - 1) * 100), warn: c.centralIncome < 1),
                StatTile(label: "地方官", value: "\(c.governors)/\(c.provinces)", fraction: c.provinces > 0 ? Double(c.governors) / Double(c.provinces) : 0),
                StatTile(label: "国策", value: Self.temperName(c.temper ?? 1), warn: (c.temper ?? 1) > 1.25, edit: { governSub = "custom"; customPane = .temper; tab = .govern }),
            ])
            if let traits = c.traits, !traits.isEmpty {
                // 国家特性 (the original's state traits), each with what it does.
                Group2 {
                    ForEach(Array(traits.enumerated()), id: \.offset) { i, t in
                        if i > 0 { Divider2() }
                        HStack(spacing: 12) {
                            Text(t.name).font(Theme.body).foregroundStyle(Theme.ink)
                            Spacer(minLength: 8)
                            Text(t.text).font(Theme.caption).foregroundStyle(Theme.ink2).multilineTextAlignment(.trailing)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 8)
                    }
                }
                .padding(.horizontal, 16)
            }
            // 三公: one compact row each — the polity's title, the holder, how well he serves. Tap to
            // appoint; press and hold to change the holder's abilities.
            Group2 {
                ForEach(Array(c.offices.enumerated()), id: \.offset) { i, o in
                    let person = info?.people?.first(where: { $0.id == o.person })
                    Button { if !PressGuard.consume() { appointing = AppointTarget(office: o.office) } } label: {
                        HStack(spacing: 10) {
                            Text(Self.title(o.office, info)).font(Theme.body).foregroundStyle(Theme.paper2).lineLimit(1).minimumScaleFactor(0.6)
                                .frame(width: 70, height: 26).background(Theme.seal.opacity(o.name.isEmpty ? 0.35 : 0.85), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                            Text(o.name.isEmpty ? "空缺" : o.name).font(Theme.body).foregroundStyle(o.name.isEmpty ? Theme.ink2 : Theme.ink).lineLimit(1)
                            if !o.name.isEmpty { Text("\(Int(o.age))岁").font(Theme.caption).foregroundStyle(Theme.ink2) }
                            Spacer(minLength: 6)
                            if !o.name.isEmpty {
                                // Fit −1…1: how well the holder's skills suit the office.
                                PaperTag(text: o.fit >= 0.4 ? "称职" : o.fit >= 0 ? "平庸" : "失职", color: o.fit >= 0.4 ? Theme.jade : o.fit >= 0 ? Theme.ink2 : Theme.seal)
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .pressMenu({
                        var items = [PressMenuItem(title: "改任他人", symbol: "person.crop.circle.badge.plus") { appointing = AppointTarget(office: o.office) }]
                        if let person, person.key >= 0 { items.append(PressMenuItem(title: "修改能力与天赋", symbol: "slider.horizontal.3") { editing = person }) }
                        return PressMenu(title: Self.title(o.office, info), subtitle: o.name.isEmpty ? "空缺" : o.name, items: items)
                    }, present: { pressMenu = $0 })
                    if i < c.offices.count - 1 { Divider2() }
                }
                Divider2()
                let lexCourt = LocalizationEngine.lexicon(culture: info?.culture, polity: info?.polity, style: info?.style)
                PaperSwitch(title: "亲自任免（\(lexCourt.isRepublican ? "政府" : "朝廷")不再自行换人）", on: Binding(get: { c.manual ?? false }, set: { on in Task { await run(success: on ? "官员由你亲自任免" : "\(lexCourt.isRepublican ? "政府" : "朝廷")恢复自主任免") { await model.setCourtManual(nation, manual: on) } } }))
            }
            .padding(.horizontal, 16)
            if c.occupied > 0 || c.lost > 0 || !c.commanders.isEmpty {
                Group2 {
                    if c.occupied > 0 || c.lost > 0 {
                        HStack {
                            if c.occupied > 0 {
                                HStack(spacing: 5) {
                                    InkIcon(glyph: .command, size: 14, weight: 1.7)
                                    Text("占他国 \(c.occupied) 州")
                                }
                                .foregroundStyle(Theme.jade)
                            }
                            Spacer()
                            if c.lost > 0 {
                                HStack(spacing: 5) {
                                    InkIcon(glyph: .retreat, size: 14, weight: 1.7)
                                    Text("失地 \(c.lost) 州")
                                }
                                .foregroundStyle(Theme.seal)
                            }
                        }
                        .font(Theme.body).padding(.horizontal, 16).padding(.vertical, 9)
                        if !c.commanders.isEmpty { Divider2() }
                    }
                    ForEach(Array(c.commanders.enumerated()), id: \.offset) { i, w in
                        let person = info?.people?.first(where: { $0.id == w.person })
                        Button { if !PressGuard.consume() { appointing = AppointTarget(office: "WarCommander:\(w.enemy)") } } label: {
                            HStack(spacing: 10) {
                                InkIcon(glyph: .war, size: 14, weight: 1.75).foregroundStyle(Theme.seal)
                                Text("征讨").font(Theme.label).foregroundStyle(Theme.ink2)
                                if map.meta.nations.indices.contains(w.enemy) { NationChip(map: map, nation: w.enemy).scaleEffect(0.85, anchor: .leading) }
                                Spacer()
                                Text(w.name).font(Theme.body).foregroundStyle(Theme.ink)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 8).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .pressMenu({
                            guard let person, person.key >= 0 else { return nil }
                            return PressMenu(title: "征讨主将", subtitle: w.name, items: [PressMenuItem(title: "修改能力与天赋", symbol: "slider.horizontal.3") { editing = person }])
                        }, present: { pressMenu = $0 })
                        if i < c.commanders.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
    /// 世家: the noble houses and what they do — their members fill the offices, their land is their
    /// fief, and a house estranged from the ruling one rises in arms (谋逆).
    @ViewBuilder private func housesSection(_ c: NationInfo.Court) -> some View {
        let fiefAllowed = c.allowsFiefs ?? true
        let lex = LocalizationEngine.lexicon(culture: info?.culture, polity: info?.polity, style: info?.style)
        VStack(spacing: 8) {
            Text(fiefAllowed
                 ? "\(lex.houseUnitLabel)执掌官职与领地（\(c.fiefRule ?? lex.fiefRuleLabel)）；关系 ≤ −50 且势力 ≥ 200、有封地者可能举兵异动。点按看族谱，长按赐封／削权／改关系。"
                 : "当前政体（\(c.fiefRule ?? lex.fiefRuleLabel)）不设封建封地，各\(lex.houseUnitLabel)影响力源于公职与资本。点按看谱系，长按资助／制衡。")
                .font(Theme.caption).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset).frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            if !c.houses.isEmpty {
                Group2 {
                    ForEach(Array(c.houses.enumerated()), id: \.offset) { i, h in
                        Button {
                            if !PressGuard.consume(), let id = h.id { tree = TreePick(id: id, name: h.name) }
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 7) {
                                    Text(h.name).font(Theme.body).foregroundStyle(Theme.ink)
                                    let rawStance = h.stance ?? (h.ruling ? (lex.isRepublican ? "执政系" : "宗室") : nil)
                                    if let stance = rawStance {
                                        let shownStance = (lex.isRepublican && stance == "宗室") ? "执政系" : stance
                                        PaperTag(text: shownStance, color: Self.stanceColor(stance), size: 11)
                                    }
                                    if let foe = h.rival { Text("宿敌 " + foe).font(Theme.caption).foregroundStyle(Theme.seal).lineLimit(1) }
                                    Spacer(minLength: 4)
                                    Text(fiefAllowed ? "\(h.members)人 · \(h.provinces)\(lex.adminUnit)" : "\(h.members)人 · 势\(Int(h.influence))").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                                    if let hist = h.history, hist.count >= 2 {
                                        Sparkline(values: hist).frame(width: 48, height: 18)
                                    } else {
                                        InkBar(fraction: min(1, max(0, h.influence / 1000)), color: h.ruling ? Theme.seal : Theme.ink.opacity(0.6), height: 4)
                                            .frame(width: 48)
                                    }
                                }
                                if let summary = h.keyMembers, !summary.isEmpty {
                                    HStack(spacing: 6) {
                                        Text(summary).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                                        if fiefAllowed, (h.fiefCooldown ?? 0) > 0 {
                                            Text("· 封地冷却 \(h.fiefCooldown ?? 0)月").font(Theme.caption).foregroundStyle(Theme.seal.opacity(0.8))
                                        }
                                        if h.allowFemale == true { Text("· 男女平等").font(Theme.caption).foregroundStyle(Theme.jade) }
                                    }
                                } else if let head = h.headName, !head.isEmpty {
                                    HStack(spacing: 8) {
                                        Text("代表：\(head)").font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                                        if h.allowFemale == true { Text("男女平等继承").font(Theme.caption).foregroundStyle(Theme.jade) }
                                    }
                                }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 9)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .pressMenu({
                            guard let id = h.id else { return nil }
                            var items = [PressMenuItem(title: "查看谱系、往来与改名", symbol: "person.3") { tree = TreePick(id: id, name: h.name) }]
                            if fiefAllowed {
                                let cd = h.fiefCooldown ?? 0
                                items.append(PressMenuItem(title: cd > 0 ? "封赏一\(lex.adminUnit)（冷却余 \(cd) 月）" : "封赏一\(lex.adminUnit)领地（势力 +25，关系 +15）", symbol: "map") {
                                    Task { await run { await model.grantFief(nation, family: id) } }
                                })
                                if !h.ruling && h.provinces > 0 {
                                    items.append(PressMenuItem(title: "收回领地（关系 −30 · 谨防激变！）", symbol: "flame", destructive: true) {
                                        Task { await run { await model.revokeFief(nation, family: id) } }
                                    })
                                }
                            }
                            if !h.ruling {
                                items.append(PressMenuItem(title: lex.isRepublican ? "资助结好（势力 +40，关系 +20）" : "赏赐安抚（势力 +40，关系 +20）", symbol: "seal") {
                                    Task { await run(success: "已资助\(h.name)") { await model.edit("houseDiplomacy", ["a": id, "b": NSNull(), "kind": "favor"]) } }
                                })
                                items.append(PressMenuItem(title: lex.isRepublican ? "审查制衡（势力 −60，关系 −25）" : "削夺权柄（势力 −60，关系 −25）", symbol: "bolt.slash", destructive: true) {
                                    Task { await run(success: "已制衡\(h.name)") { await model.edit("houseDiplomacy", ["a": id, "b": NSNull(), "kind": "suppress"]) } }
                                })
                                items.append(PressMenuItem(title: "修改协作关系（现 \(Int(h.relation ?? 0))）", symbol: "slider.horizontal.3") {
                                    numberEdit = NumberEdit(title: h.name + (lex.isRepublican ? "与执政阵营关系（-100–100）" : "对宗室关系（-100–100）"), unit: "", value: h.relation ?? 0) { v in await model.editCourt(nation, key: "house:" + id, value: v) }
                                })
                            }
                            return PressMenu(title: h.name, subtitle: fiefAllowed ? "\(h.members) 人 · \(h.provinces) \(lex.adminUnit) · 势力 \(Int(h.influence))" : "\(h.members) 人 · \(lex.fiefRuleLabel) · 势力 \(Int(h.influence))", items: items)
                        }, present: { pressMenu = $0 })
                        if i < c.houses.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }
            if info?.alive == true, let state = model.state, let map = model.map {
                let owned = state.owners.indices.filter { state.owners[$0] == nation && $0 < map.meta.provinces.count }
                if let firstOwned = owned.first {
                    Button {
                        GameFeel.shared.tap()
                        newHouseProvince = firstOwned
                        newHouseSurname = ""
                        creatingHouse = true
                    } label: {
                        HStack(spacing: 6) {
                            InkIcon(glyph: .house, size: 15, weight: 1.8)
                            Text("扶立新\(lex.houseUnitLabel)").font(Theme.body)
                        }
                        .foregroundStyle(Theme.seal)
                        .frame(maxWidth: .infinity).frame(height: 38)
                        .background(Theme.paper2.opacity(0.85), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.seal.opacity(0.35)))
                    }
                    .buttonStyle(PressStyle())
                    .padding(.horizontal, 16)
                }
            }
        }
    }

    /// 置顶议会与政党格局组件（共和国/联邦/立宪国默认直接展开在「议政」页最顶部）。
    @ViewBuilder private func parliamentSection(info: NationInfo, parties: [NationInfo.Party]) -> some View {
        let topParty = parties.max(by: { $0.seats < $1.seats })
        FoldSection("议会与政党格局（\(parties.count) 党 · \(info.styleLabel ?? "")）", expanded: true, summary: topParty.map { "执政：\($0.name)（\($0.seats)席）" }) {
            Group2 {
                // 议席分布条
                GeometryReader { g in
                    HStack(spacing: 1) {
                        ForEach(Array(parties.enumerated()), id: \.offset) { i, p in
                            Rectangle().fill(Self.partyColor(i)).frame(width: max(2, g.size.width * CGFloat(p.seats) / 100))
                        }
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 10).padding(.horizontal, 16).padding(.top, 12)
                if info.alive {
                    HStack(spacing: 8) {
                        Button {
                            GameFeel.shared.tap()
                            Task { await run { await model.regimeTransition(nation, action: "snapElection") } }
                        } label: {
                            Text("提前大选").font(Theme.caption).foregroundStyle(Theme.seal)
                                .padding(.horizontal, 10).frame(height: 28)
                                .background(Theme.seal.opacity(0.08), in: Capsule())
                                .overlay(Capsule().stroke(Theme.seal.opacity(0.28), lineWidth: 0.8))
                        }
                        .buttonStyle(PressStyle())
                        Button {
                            GameFeel.shared.tap()
                            Task { await run { await model.partyAction(nation, party: -1, action: "found") } }
                        } label: {
                            Text("扶立新党").font(Theme.caption).foregroundStyle(Theme.jade)
                                .padding(.horizontal, 10).frame(height: 28)
                                .background(Theme.jade.opacity(0.08), in: Capsule())
                                .overlay(Capsule().stroke(Theme.jade.opacity(0.28), lineWidth: 0.8))
                        }
                        .buttonStyle(PressStyle())
                        Spacer()
                        Text("点按操控政党").font(Theme.caption).foregroundStyle(Theme.ink2)
                    }
                    .padding(.horizontal, 16).padding(.top, 8)
                }
                ForEach(Array(parties.sorted { $0.seats > $1.seats }.enumerated()), id: \.offset) { i, p in
                    let index = parties.firstIndex { $0.name == p.name } ?? 0
                    Button {
                        if info.alive {
                            pressMenu = PressMenu(
                                title: p.name,
                                subtitle: "\(p.line ?? "议会政党") · 现占 \(p.seats) 席",
                                items: [
                                    PressMenuItem(title: "扶持增席（+12 席）", symbol: "arrow.up.circle") {
                                        Task { await run { await model.partyAction(nation, party: index, action: "boost") } }
                                    },
                                    PressMenuItem(title: "任命组阁执政", symbol: "crown") {
                                        Task { await run { await model.partyAction(nation, party: index, action: "appoint") } }
                                    },
                                    PressMenuItem(title: "自定义党名与议席", symbol: "pencil") {
                                        partyEdit = PartyEdit(id: index, name: p.name, seats: p.seats)
                                    },
                                    PressMenuItem(title: "查禁此党（国运 −3）", symbol: "xmark.octagon", destructive: true) {
                                        Task { await run { await model.partyAction(nation, party: index, action: "ban") } }
                                    },
                                ]
                            )
                        } else {
                            partyEdit = PartyEdit(id: index, name: p.name, seats: p.seats)
                        }
                    } label: {
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 2).fill(Self.partyColor(index)).frame(width: 10, height: 10)
                            Text(p.name).font(Theme.body).foregroundStyle(Theme.ink)
                            if let line = p.line { Text(line).font(Theme.caption).foregroundStyle(Self.partyColor(index)).padding(.horizontal, 5).padding(.vertical, 1).overlay(Capsule().stroke(Self.partyColor(index).opacity(0.6))) }
                            if i == 0 { PaperTag(text: "执政") }
                            Spacer()
                            Text("\(p.seats) 席").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                            InkIcon(glyph: .chevronRight, size: 12, weight: 1.7).foregroundStyle(Theme.seal.opacity(0.75))
                        }
                        .padding(.horizontal, 16).padding(.top, 7).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if let policies = p.policies { Text(policies.joined(separator: " · ")).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8).padding(.leading, 34).padding(.trailing, 16).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 6) }
                }
                if let top = topParty, let effect = top.effect {
                    Text("执政 · \(top.name)（\(top.line ?? "")）：\(effect)。每四年改选，可随时扶持、组阁、查禁或扶立新党。").font(Theme.caption).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.bottom, 10).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func reload() async {
        // 优先秒开核心 NationInfo（彻底根治 1073ms 国家页首开卡顿），史册与政体演进随后异步补载不阻塞首帧。
        let loadedInfo = await model.nationInfo(nation)
        info = loadedInfo; failed = loadedInfo == nil
        let nextRel = relationColors()
        if model.controller.relationsNation == nation && model.controller.relations != nextRel {
            model.controller.relations = nextRel
        }
        async let historyTask = model.nationHistory(nation)
        async let regimeTask = model.regime(nation)
        let (loadedHistory, loadedRegime) = await (historyTask, regimeTask)
        history = loadedHistory
        regime = loadedRegime
        if tab == .court { postList = await model.posts(nation) }
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
    func warCard(_ war: NationInfo.War, _ map: WorldMap) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(war.casusBelli.isEmpty ? "战争" : war.casusBelli).font(Theme.section).foregroundStyle(Theme.seal)
                Spacer()
                Text(war.side == 0 ? "发起方" : war.side == 1 ? "防御方" : "中立").font(Theme.label).foregroundStyle(Theme.ink2)
            }
            if !war.goals.isEmpty { Text("战争目标：" + war.goals.joined(separator: "、")).font(Theme.label).foregroundStyle(Theme.ink2) }
            ForEach(Array(war.sides.enumerated()), id: \.offset) { i, side in
                Text("\(i == 0 ? "进攻方" : "防守方")：\(names(side.nations, map))（阵亡 \(Int(side.losses).formatted())）").font(Theme.body).foregroundStyle(Theme.ink)
            }
            if let score = war.score {
                // Attacker's view; shown from this nation's side.
                let mine = war.side == 1 ? -score : score
                HStack(spacing: 8) {
                    Text("战争分数").font(Theme.label).foregroundStyle(Theme.ink2)
                    InkBar(fraction: min(1, abs(mine) / 100), color: mine >= 0 ? Theme.jade : Theme.seal, track: Theme.ink.opacity(0.08), height: 6)
                    Text("\(mine >= 0 ? "+" : "")\(Int(mine))").font(Theme.body).foregroundStyle(mine >= 0 ? Theme.jade : Theme.seal).monospacedDigit()
                }
            }
            HStack {
                Text("持续 \(Int(war.months) / 12) 年 \(Int(war.months) % 12) 月").font(Theme.label).foregroundStyle(Theme.ink2)
                Spacer()
                if war.side >= 0, let enemy = war.sides[1 - war.side].nations.first(where: { $0 >= 0 }) {
                    Button("停战") { Task { await run { await model.makePeace(nation, enemy) } } }
                        .font(Theme.body).padding(.horizontal, 12).padding(.vertical, 5)
                        .background(Theme.jade.opacity(0.12), in: Capsule()).foregroundStyle(Theme.jade).buttonStyle(.plain)
                }
            }
        }
        .padding(16)
    }
    /// 人物: monarch, heir, office holders with age, traits and the four skills.
    func peopleList(_ list: [NationInfo.Person], empty: String = "暂无记录") -> some View {
        Group2 {
            if list.isEmpty { Row(label: "人物", value: empty) }
            ForEach(Array(list.enumerated()), id: \.offset) { i, p in
                // One compact card: name and age with a small brush to edit, the four skills as short
                // numbers, the traits as tags (their full descriptions are in the editor).
                Button { if p.key >= 0 { editing = p } } label: {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text(p.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                        // A governor's province (the role is 总督·某州) as a small tag after the name.
                        if p.role.hasPrefix("总督·") { Text(String(p.role.dropFirst(3))).font(Theme.caption).foregroundStyle(Theme.seal).lineLimit(1) }
                        else if list.count > 1 && p.role != "君主" { Text(p.role).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1) }
                        Text("\(p.female ? "女" : "男") · \(Int(p.age))").font(Theme.label).foregroundStyle(Theme.ink2)
                        Spacer()
                        if p.skills.count == 4 {
                            Text("魅\(Int(p.skills[0])) 军\(Int(p.skills[1])) 外\(Int(p.skills[2])) 政\(Int(p.skills[3]))").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                        }
                        if p.key >= 0 { InkIcon(glyph: .brush, size: 12, weight: 1.7).foregroundStyle(Theme.seal.opacity(0.75)) }
                    }
                    if !p.traits.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 5) {
                                ForEach(p.traits, id: \.self) { t in
                                    Text(t).font(Theme.caption).foregroundStyle(Theme.ink)
                                        .padding(.horizontal, 7).padding(.vertical, 2)
                                        .background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 9)
                .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if i < list.count - 1 { Divider2() }
            }
        }
        .padding(.horizontal, 16)
    }

    /// 五页主体：概览 / 朝政 / 军事 / 外交 / 治理（内含政令、疆土、史册、定制四子项）。
    @ViewBuilder private func tabContent(_ info: NationInfo, _ map: WorldMap, _ state: GameState) -> some View {
        switch tab {
        case .overview: overviewTab(info, map, state)
        case .court: courtTab(info, map, state)
        case .military: militaryTab(info, map, state)
        case .diplomacy: diplomacyTab(info, map, state)
        case .govern:
            VStack(alignment: .leading, spacing: 12) {
                ChipPicker(items: [
                    ("decrees", "政令"),
                    ("territory", "疆土"),
                    ("history", "史册"),
                    ("custom", "定制"),
                ], selection: $governSub)
                .padding(.horizontal, 16)
                switch governSub {
                case "territory":
                    NationTerritoryTab(
                        model: model,
                        nation: nation,
                        alive: info.alive,
                        day: state.day / 30,
                        culture: info.culture,
                        polity: info.polity,
                        style: info.style,
                        onFly: { p in lower(); fly(p) },
                        onAppointGovernor: { p in appointing = AppointTarget(office: "Governor:\(p)") },
                        onToast: { flash = $0 },
                        onReload: { await reload() },
                        onPresentMenu: { pressMenu = $0 }
                    )
                case "history":
                    NationHistoryTab(
                        model: model,
                        nation: nation,
                        map: map,
                        history: history,
                        fly: fly,
                        lower: lower,
                        onOpenReplay: openReplay
                    )
                case "custom":
                    if info.alive { customView(info, map, state) }
                    else { Text("此国已亡，无可设定。").font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, 20) }
                default:
                    NationDecreesTab(
                        model: model,
                        nation: nation,
                        info: info,
                        onToast: { flash = $0 },
                        onReload: { await reload() },
                        onEnthrone: { enthroning = true }
                    )
                }
            }
        }
    }
    /// 自定义：以前十几节设置从上到下排成一长条，要一直往下翻；现在先是一屏放得下的分类格（每格写着现状），
    /// 点进去只显示这一类，顶部一排分类签可直接跳到别的类，左上“自定义”回到总览。
    enum CustomPane: String, CaseIterable, Identifiable {
        case identity = "国号国色", capital = "都城疆域", treasury = "国库国运", bonus = "国家加成", polity = "政体"
        case faith = "文化宗教", temper = "国策性情", traits = "国家特性", army = "军队兵种", offices = "官职称号"
        var id: String { rawValue }
        var symbol: String {
            switch self {
            case .identity: return "paintpalette"; case .capital: return "building.columns"; case .treasury: return "banknote"
            case .bonus: return "chart.line.uptrend.xyaxis"; case .polity: return "crown"; case .faith: return "books.vertical"
            case .temper: return "flame"; case .traits: return "seal"; case .army: return "shield.lefthalf.filled"; case .offices: return "person.text.rectangle"
            }
        }
    }
    @ViewBuilder private func customView(_ info: NationInfo, _ map: WorldMap, _ state: GameState) -> some View {
        let owned = state.owners.indices.filter { state.owners[$0] == nation && $0 < map.meta.provinces.count }
        let current = map.meta.nations.indices.contains(nation) ? map.meta.nations[nation] : nil
        if let pane = customPane {
            VStack(alignment: .leading, spacing: 12) {
                customBar(pane)
                customPaneBody(pane, info, map, state, owned: owned, current: current)
                    .id(pane)
                    .transition(.opacity.combined(with: .offset(x: 10)))
            }
            .animation(Motion.fade, value: pane)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                // 2.8.4 新增：天命笔 · 上帝导演神迹台（一键天降雄主 / 天降神兵 / 天赐巨帑 / 共主邦联 / 大乱分裂）
                Group2 {
                    VStack(alignment: .leading, spacing: 9) {
                        HStack(spacing: 6) {
                            ArtEmblem(image: BundleArt.sealCourt, size: 24, fallback: .crown)
                            Text("天命笔 · 上帝导演神迹台").font(Theme.section).foregroundStyle(Theme.ink)
                            Spacer()
                            Text("即点即应").font(Theme.caption).foregroundStyle(Theme.ink2)
                        }
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                miracleButton(title: "天降雄主", note: "四维95+·国运95", glyph: .crown, tint: Theme.seal) {
                                    Task { await run { await model.nationDecree(nation, kind: "miracle:ruler") } }
                                }
                                miracleButton(title: "天降神兵", note: "3支满编精锐禁军", glyph: .military, tint: Theme.seal) {
                                    Task { await run { await model.nationDecree(nation, kind: "miracle:legions") } }
                                }
                                miracleButton(title: "天赐巨帑", note: "+5000金·满仓清腐", glyph: .economy, tint: Theme.jade) {
                                    Task { await run { await model.nationDecree(nation, kind: "miracle:treasury") } }
                                }
                                miracleButton(title: "共主邦联", note: "联姻邻邦合为一脉", glyph: .marriage, tint: Theme.jade) {
                                    Task { await run { await model.nationDecree(nation, kind: "miracle:personalUnion") } }
                                }
                                miracleButton(title: "藩镇分裂", note: "立即引爆内战割据", glyph: .fire, tint: Theme.ink) {
                                    Task { await run { await model.triggerCivilWar(nation) } }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 14)
                }
                .padding(.horizontal, 16)

                Text("点一类进入修改；改动立即生效。").font(Theme.label).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(CustomPane.allCases) { p in customCard(p, summary: customSummary(p, info, map, current: current, owned: owned.count), tint: p == .identity ? current.map { Names.color($0.color) } : nil) }
                }
                .padding(.horizontal, 16)
            }
        }
    }
    /// 每格的现状（一行）。
    private func customSummary(_ p: CustomPane, _ info: NationInfo, _ map: WorldMap, current: WorldMeta.Nation?, owned: Int) -> String {
        switch p {
        case .identity: return current?.name ?? info.name
        case .capital: return "\(capitalName(map, current) ?? "无都城") · \(owned)州"
        case .treasury: return "国库\(Names.wan(Int(info.gold))) · 国运\(Int(info.destiny))"
        case .bonus:
            let set = Self.bonuses.filter { (info.bonus?[$0.key] ?? 0) != 0 }.count
            return set == 0 ? "未设加成" : "已设 \(set) 项"
        case .polity: return Self.styles.first { $0.id == (info.style ?? "") }?.label ?? info.styleLabel ?? "—"
        case .faith: return "\(Names.culture[info.culture] ?? info.culture) · \(Names.religion[info.religion] ?? info.religion)"
        case .temper: return Self.temperName(info.court?.temper ?? 1)
        case .traits:
            let on = (info.allTraits ?? []).filter { $0.on }.count
            return "已开 \(on)/\((info.allTraits ?? []).count) 项"
        case .army: return "放置新军 · 征兵 · 兵种"
        case .offices: return "宰辅与将帅的称号"
        }
    }
    private func customCard(_ p: CustomPane, summary: String, tint: Color?) -> some View {
        Button { GameFeel.shared.tap(); withAnimation(Motion.fade) { customPane = p } } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill((tint ?? Theme.seal).opacity(tint == nil ? 0.09 : 0.9))
                    if let g = GameActionLabel.glyph(for: p.symbol) {
                        InkIcon(glyph: g, size: 17, weight: 1.7, accent: (tint == nil ? Theme.seal : Theme.paper2).opacity(0.26))
                            .foregroundStyle(tint == nil ? Theme.seal : Theme.paper2)
                    } else {
                        Image(systemName: p.symbol).font(.system(size: 15, weight: .regular)).foregroundStyle(tint == nil ? Theme.seal : Theme.paper2)
                    }
                }
                .frame(width: 32, height: 32)
                VStack(alignment: .leading, spacing: 3) {
                    Text(p.rawValue).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                    Text(summary).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.75)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .background(Theme.paper2.opacity(0.75), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
    }
    /// 分类页顶栏：返回总览，与一排可横滑的分类签（直接跳到别的类，不用退回去再找）。
    private func customBar(_ pane: CustomPane) -> some View {
        HStack(spacing: 10) {
            Button { GameFeel.shared.tap(); withAnimation(Motion.fade) { customPane = nil } } label: {
                HStack(spacing: 3) { InkIcon(glyph: .chevronRight, size: 13, weight: 1.8).rotationEffect(.degrees(180)); Text("总览").font(Theme.body) }
                    .foregroundStyle(Theme.seal).frame(height: 32).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Rectangle().fill(Theme.line).frame(width: 0.8, height: 18)
            ScrollViewReader { reader in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(CustomPane.allCases) { p in
                            Button { GameFeel.shared.tap(); withAnimation(Motion.fade) { customPane = p } } label: {
                                Text(p.rawValue).font(Theme.label).foregroundStyle(p == pane ? Theme.paper2 : Theme.ink)
                                    .padding(.horizontal, 10).frame(height: 30)
                                    .background(p == pane ? Theme.seal : Theme.paper2.opacity(0.75), in: Capsule())
                                    .overlay(Capsule().stroke(p == pane ? Theme.seal : Theme.line))
                            }
                            .buttonStyle(PressStyle()).id(p)
                        }
                    }
                    .padding(.vertical, 1).padding(.trailing, 8)
                }
                .clipped()
                .onAppear { reader.scrollTo(pane, anchor: .center) }
                .onChange(of: pane) { _, p in withAnimation(Motion.fade) { reader.scrollTo(p, anchor: .center) } }
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }
    /// 一个分类里的卡片：统一内边距与行距（与 Row / EditRow / Divider2 的 16pt 水平基线严丝合缝对齐）。
    private func paneCard<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        Group2 { VStack(alignment: .leading, spacing: 12) { content() }.padding(.horizontal, 16).padding(.vertical, 14) }.padding(.horizontal, Theme.Layout.pageInset)
    }
    private func paneNote(_ text: String) -> some View {
        Text(text).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
    }
    @ViewBuilder private func customPaneBody(_ pane: CustomPane, _ info: NationInfo, _ map: WorldMap, _ state: GameState, owned: [Int], current: WorldMeta.Nation?) -> some View {
        switch pane {
        case .identity:
            paneCard {
                HStack(spacing: 10) {
                    TextField("", text: $nameText, prompt: Text(current?.name ?? "国号").foregroundColor(Theme.ink2.opacity(0.6))).paperField()
                    Button {
                        let t = nameText
                        Task { await run(success: "国号改为\(t)") { await model.editIdentity(nation, name: t, color: nil) } }
                        nameText = ""
                    } label: { Text("更名").font(Theme.body).foregroundStyle(nameText.isEmpty ? Theme.ink2 : Theme.seal).frame(width: 52, height: 40) }
                    .buttonStyle(.plain).disabled(nameText.isEmpty)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 8), spacing: 8) {
                    ForEach(Self.palette, id: \.self) { hex in
                        let on = current?.color.uppercased() == hex
                        Button { GameFeel.shared.tap(); Task { await run(success: "国色已更改") { await model.editIdentity(nation, name: nil, color: hex) } } } label: {
                            Circle().fill(Names.color(hex)).frame(height: 30)
                                .overlay(Circle().stroke(on ? Theme.ink : Theme.line, lineWidth: on ? 2.5 : 1))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                // 自选国色：系统调色板，选好后点“用此色”。
                HStack(spacing: 10) {
                    ColorPicker("自选颜色", selection: $customColor, supportsOpacity: false).font(Theme.body).foregroundStyle(Theme.ink)
                    Button {
                        let hex = Self.hex(customColor)
                        Task { await run(success: "国色已更改") { await model.editIdentity(nation, name: nil, color: hex) } }
                    } label: { Text("用此色").font(Theme.label).foregroundStyle(Theme.paper2).padding(.horizontal, 12).frame(height: 32).background(customColor, in: Capsule()).overlay(Capsule().stroke(Theme.ink.opacity(0.25))) }
                    .buttonStyle(PressStyle())
                }
                Divider2()
                VStack(alignment: .leading, spacing: 8) {
                    Text("国家旌旗纹章印记（显示于国家页卷首大印）").font(Theme.label).foregroundStyle(Theme.ink2)
                    let emblemChoices: [String] = ["龙", "鹰", "鼎", "狮", "狼", "樱", "剑", "日", "月", "莲", "凰", "聖"]
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 8) {
                        ForEach(emblemChoices, id: \.self) { sym in
                            let on: Bool = (info.emblem ?? "国") == sym
                            Button {
                                GameFeel.shared.tap()
                                Task { await run(success: "旌旗纹章已改为「\(sym)」") { await model.nationDecree(nation, kind: "emblem:\(sym)") } }
                            } label: {
                                SealFace(text: sym, size: 30, color: on ? Theme.seal : Theme.ink2.opacity(0.65))
                                    .padding(3)
                                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(on ? Theme.seal : Color.clear, lineWidth: 1.5))
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                }
            }
            .onAppear { if let c = current?.color { customColor = Names.color(c) } }
            NationExtrasView(model: model, nation: nation, info: info, who: info, part: .naming, say: { flash = $0 }, reload: { await reload() })
        case .capital:
            paneCard {
                Row(label: "现今都城", value: capitalName(map, current) ?? "—").font(Theme.body).padding(.horizontal, -16)
                // 迁都在地图上点选：页面让开，玩家点本国有城池的州郡后回到这里。
                HStack(spacing: 10) {
                    Button {
                        pickProvince("点选新都城：本国有城池的州郡") { p in
                            guard owned.contains(p), map.meta.cities.contains(where: { $0.province == p }) else { say("只能迁都到本国有城池的州郡"); GameFeel.shared.notify(.error); return }
                            Task { await run(success: "迁都\(map.meta.provinces[p].name)") { await model.setCapital(nation, province: p) } }
                        }
                    } label: { paneAction("地图上选新都城", "hand.tap") }.buttonStyle(PressStyle())
                    Button { paint(nation) } label: { paneAction("绘制疆域", "paintbrush.pointed") }.buttonStyle(PressStyle())
                }
            }
            paneCard {
                PaperMenu(title: "州郡", items: [(-1, "选择本国州郡")] + owned.map { ($0, map.meta.provinces[$0].name) }, selection: $provinceChoice).padding(.horizontal, -16)
                if provinceChoice >= 0 {
                    HStack(spacing: 10) {
                        Text("人口").font(Theme.body).foregroundStyle(Theme.ink2)
                        TextField("", text: $populationText, prompt: Text("例如 50000").foregroundColor(Theme.ink2.opacity(0.6))).keyboardType(.numberPad).multilineTextAlignment(.trailing).paperField()
                        Text("人").font(Theme.body).foregroundStyle(Theme.ink2)
                    }
                    HStack(spacing: 8) {
                        SealButton(title: "定人口", disabled: Double(populationText) == nil) {
                            let p = provinceChoice, v = Double(populationText)
                            Task { await run(success: "人口已改") { await model.editProvince(p, population: v, fortress: nil) } }
                            populationText = ""
                        }
                        SealButton(title: "筑要塞") { let p = provinceChoice; Task { await run(success: "已筑要塞") { await model.editProvince(p, population: nil, fortress: true) } } }
                        SealButton(title: "拆要塞") { let p = provinceChoice; Task { await run(success: "已拆要塞") { await model.editProvince(p, population: nil, fortress: false) } } }
                    }
                } else {
                    paneNote("选一个州郡后可改人口、筑或拆要塞。")
                }
            }
        case .treasury:
            paneCard {
                HStack {
                    Text("国库").font(Theme.body).foregroundStyle(Theme.ink)
                    Spacer()
                    TextField("", text: $goldText, prompt: Text("\(Int(info.gold))").foregroundColor(Theme.ink2.opacity(0.6)))
                        .keyboardType(.numberPad).multilineTextAlignment(.trailing).paperField(width: 130)
                    Text("金").font(Theme.body).foregroundStyle(Theme.ink2)
                }
                PaperSlider(title: "国运", value: $destinyValue, range: 0...100, step: 1) { "\(Int($0))" }
                SealButton(title: "颁行") {
                    let gold = Double(goldText)
                    Task { await run(success: "国库与国运已修改") { await model.editNation(nation, gold: gold, destiny: destinyValue, polity: nil) } }
                    goldText = ""
                }
            }
            .onAppear { destinyValue = info.destiny }
        case .bonus:
            Group2 {
                VStack(spacing: 0) {
                    ForEach(Array(Self.bonuses.enumerated()), id: \.offset) { i, b in
                        EditRow(label: b.label, value: Self.percent(info.bonus?[b.key], zero: "无") + " · " + b.note) {
                            // 引擎自己的范围（Regimes.setBonus），滑条正好覆盖它。
                            let r = b.key == "income" ? "-50–200" : b.key == "growth" ? "-20–50" : "-50–100"
                            numberEdit = NumberEdit(title: b.label + "（\(r)%）", unit: "%", value: info.bonus?[b.key] ?? 0) { v in await model.setBonus(nation, key: b.key, value: v) }
                        }
                        if i < Self.bonuses.count - 1 { Divider2() }
                    }
                }
            }
            .padding(.horizontal, 16)
            paneNote("点一项用滑条调整；加成直接改变推演里的收入、战力、人口增长与行军。").padding(.horizontal, Theme.Layout.sectionInset)
        case .polity:
            paneCard {
                paneNote("改行后国号与元首称号随之改变；改变基本政体如同革命，国库与国运受损，会先问一次。")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(Self.styles, id: \.id) { s in
                        let on = s.id == (info.style ?? "")
                        Button { if !on { GameFeel.shared.tap(); styleConfirm = s.id } } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.label).font(Theme.body).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                                Text(s.note).font(Theme.caption).foregroundStyle(on ? Theme.paper2.opacity(0.85) : Theme.ink2).lineLimit(1).minimumScaleFactor(0.6)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 10).padding(.vertical, 8)
                            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Theme.seal : Theme.line))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
            }
            .confirmationDialog("改行\(Self.styles.first { $0.id == styleConfirm }?.label ?? "")？", isPresented: Binding(get: { styleConfirm != nil }, set: { if !$0 { styleConfirm = nil } }), titleVisibility: .visible) {
                Button("改行", role: .destructive) {
                    if let id = styleConfirm, let s = Self.styles.first(where: { $0.id == id }) { Task { await run(success: "已改行\(s.label)") { await model.setStyle(nation, style: id) } } }
                    styleConfirm = nil
                }
                Button("取消", role: .cancel) { styleConfirm = nil }
            } message: { Text("国号与元首称号随之改变；改变基本政体国库与国运受损。") }
        case .faith:
            paneCard {
                PaperMenu(title: "文化", items: Names.cultureIds.map { ($0, Names.culture[$0] ?? $0) }, selection: $cultureChoice).padding(.horizontal, -16)
                PaperMenu(title: "宗教", items: Names.religion.keys.sorted().map { ($0, Names.religion[$0] ?? $0) }, selection: $religionChoice).padding(.horizontal, -16)
                SealButton(title: "颁行", disabled: cultureChoice == info.culture && religionChoice == info.religion) {
                    let c = cultureChoice, r = religionChoice
                    Task { await run(success: "文化与宗教已更改") { await model.editNation(nation, gold: nil, destiny: nil, polity: nil, culture: c, religion: r) } }
                }
            }
            .onAppear { cultureChoice = info.culture; religionChoice = info.religion }
        case .temper:
            paneCard {
                PaperSwitch(title: "自定义好战程度", on: Binding(get: { temperSet }, set: { on in
                    temperSet = on
                    let v = temperValue
                    Task { await run { await model.setTemper(nation, on ? v : nil) } }
                })).padding(.horizontal, -16)
                if temperSet {
                    PaperSlider(title: Self.temperName(temperValue), value: $temperValue, range: 0.6...1.6, step: 0.05) { String(format: "%.2f", $0) }
                    SealButton(title: "定下国策") { let v = temperValue; Task { await run(success: "国策已定：\(Self.temperName(v))") { await model.setTemper(nation, v) } } }
                } else {
                    paneNote("现由君主性情与政体决定：\(Self.temperName(info.court?.temper ?? 1))。打开后可自己定下好战程度，影响宣战与出兵的积极程度。")
                }
            }
            .onAppear { temperValue = info.court?.temper ?? 1 }
        case .traits:
            NationExtrasView(model: model, nation: nation, info: info, who: info, part: .traits, say: { flash = $0 }, reload: { await reload() })
        case .army:
            paneCard {
                Button { placeArmy(nation) } label: { paneAction("在地图上放置新军", "plus.circle") }.buttonStyle(PressStyle())
                HStack(spacing: 10) {
                    PaperMenu(title: "征兵于", items: [(-1, "选择州郡")] + owned.map { ($0, map.meta.provinces[$0].name) }, selection: $levyProvince).padding(.horizontal, -16)
                    SealButton(title: "征兵", disabled: levyProvince < 0) {
                        let p = levyProvince
                        Task { await run(success: "已征募新军") { await model.addArmy(nation, province: p) } }
                    }
                    .frame(width: 84)
                }
            }
            NationExtrasView(model: model, nation: nation, info: info, who: info, part: .units, say: { flash = $0 }, reload: { await reload() })
        case .offices:
            NationExtrasView(model: model, nation: nation, info: info, who: info, part: .titles, say: { flash = $0 }, reload: { await reload() })
        }
    }
    /// 分类页里的主要操作（图标 + 字，等宽两格）。
    private func paneAction(_ title: String, _ symbol: String) -> some View {
        HStack(spacing: 6) {
            if let g = GameActionLabel.glyph(for: symbol) { InkIcon(glyph: g, size: 16, weight: 1.7) }
            else { Image(systemName: symbol).font(.system(size: 15)) }
            Text(title).font(Theme.body).lineLimit(1).minimumScaleFactor(0.8)
        }
            .foregroundStyle(Theme.seal).frame(maxWidth: .infinity).frame(height: 44)
            .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Theme.seal.opacity(0.3)))
    }

    private func powerPillarChip(_ label: String, pct: Int, color: Color, code: String) -> some View {
        Button {
            GameFeel.shared.tap()
            Task { await run { await model.nationDecree(nation, kind: "balancePower:\(code)") } }
        } label: {
            HStack(spacing: 4) {
                Circle().fill(color).frame(width: 6.5, height: 6.5)
                Text("\(label) \(pct)%").font(Theme.caption).foregroundStyle(Theme.ink).monospacedDigit().lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 5)
            .background(color.opacity(0.09), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(color.opacity(0.28), lineWidth: 0.7))
        }
        .buttonStyle(PressStyle())
    }

    private func miracleButton(title: String, note: String, glyph: InkGlyph, tint: Color, action: @escaping () -> Void) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 5) {
                    InkIcon(glyph: glyph, size: 15, weight: 1.8, accent: tint.opacity(0.24)).foregroundStyle(tint)
                    Text(title).font(Theme.label).foregroundStyle(Theme.ink)
                }
                Text(note).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
            }
            .padding(.horizontal, 11).padding(.vertical, 8)
            .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(tint.opacity(0.28), lineWidth: 0.8))
        }
        .buttonStyle(PressStyle())
    }
    /// 国家行为 (CultureNationActions47)：分为「邦交与条约」和「军事与博弈」两大区，层次分明。
    private func actions(_ info: NationInfo, _ map: WorldMap) -> some View {
        let vassal = info.overlord >= 0
        return VStack(alignment: .leading, spacing: 10) {
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    Text("邦交与条约").font(Theme.caption).foregroundStyle(Theme.ink2)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        action("缔结盟约", "person.2.fill", Theme.jade, disabled: vassal) { target = -1; picking = .alliance }
                        action("退出同盟", "person.badge.minus", Theme.ink, disabled: info.alliance == nil) { Task { await run { await model.alliance(nation, with: -1) } } }
                        action("互不侵犯", "doc.text", Theme.jade, disabled: false) { target = -1; picking = .pact }
                        action("通商协定", "shippingbox.fill", Theme.jade, disabled: false) { target = -1; picking = .trade }
                        action("共同防御", "shield.lefthalf.filled", Theme.jade, disabled: vassal) { target = -1; picking = .defense }
                        action("王室联姻", "heart.circle", Theme.jade, disabled: false) { target = -1; picking = .marriage }
                        action("赠送金帛", "dollarsign.circle", Theme.ink, disabled: false) { target = -1; picking = .gift }
                        action("解除附庸", "link.badge.plus", Theme.ink, disabled: !vassal) { Task { await run { await model.releaseVassal(nation) } } }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 14)
                Divider2()
                VStack(alignment: .leading, spacing: 10) {
                    Text("军事与博弈").font(Theme.caption).foregroundStyle(Theme.ink2)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        action("宣战", "flag.2.crossed", Theme.seal, disabled: vassal) { target = -1; picking = .war }
                        action("最后通牒", "flame.fill", Theme.seal, disabled: vassal) { target = -1; picking = .ultimatum }
                        action("反霸包围网", "person.3.fill", Theme.seal, disabled: vassal) { target = -1; picking = .coalition }
                        action("收为附庸", "crown", Theme.jade, disabled: vassal) { target = -1; picking = .vassal }
                        action("吞并", "map", Theme.seal, disabled: false) { target = -1; picking = .annex }
                        action("割让州郡", "rectangle.portrait.and.arrow.right", Theme.seal, disabled: false) { target = -1; cedeProvince = -1; picking = .cede }
                        action("谍报资敌", "eye.slash", Theme.ink, disabled: false) { target = -1; picking = .covert }
                        action("触发内战", "flame", Theme.seal, disabled: false) { Task { await run { await model.triggerCivilWar(nation) } } }
                        action("煽动叛乱", "flame.fill", Theme.seal, disabled: !info.alive) { Task { await run { await model.inciteRebellion(nation) } } }
                        action("绘制疆域", "paintbrush.pointed.fill", Theme.ink, disabled: false) { paint(nation) }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 14)
                Divider2()
                PaperSwitch(title: "自主外交\(info.worldAuto ? "" : "（全局已关闭）")", on: Binding(get: { info.auto }, set: { on in Task { await run { await model.setAutoDiplomacy(nation, on) } } }))
            }
            .padding(.horizontal, 16)
            if vassal { Text("附庸国无法自主行使外交权力，需独立").font(Theme.label).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset) }
        }
    }
    private func action(_ title: String, _ icon: String, _ color: Color, disabled: Bool, _ perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            GameActionLabel(title: title, symbol: icon).font(Theme.body).frame(maxWidth: .infinity, minHeight: 42).padding(.horizontal, 8).padding(.vertical, 4)
                .background(color.opacity(disabled ? 0.04 : 0.1), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
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
                    if pick == .pact || pick == .trade || pick == .defense {
                        Divider2()
                        ChipPicker(items: [(5, "五年"), (10, "十年"), (20, "二十年")], selection: $pactYears).padding(12)
                    }
                    if pick == .ultimatum {
                        Divider2()
                        ChipPicker(items: [("tribute", "索要十年岁币"), ("province", "割让边境一州"), ("vassal", "迫其称臣附庸")], selection: $ultimatumDemand).padding(12)
                    }
                    if pick == .covert {
                        Divider2()
                        ChipPicker(items: [("fundRebels", "资助敌国叛军"), ("sowDiscord", "离间朝堂世家")], selection: $covertKind).padding(12)
                    }
                    if pick == .gift {
                        Divider2()
                        HStack {
                            Text("金额").font(Theme.body).foregroundStyle(Theme.ink)
                            Spacer()
                            TextField("", text: $giftText).keyboardType(.numberPad).multilineTextAlignment(.trailing).paperField(width: 110)
                            Text("金").font(Theme.body).foregroundStyle(Theme.ink2)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                    }
                    if pick == .cede {
                        Divider2()
                        PaperMenu(title: "州郡", items: [(-1, "选择本国州郡")] + state.owners.indices.filter { state.owners[$0] == nation && $0 < map.meta.provinces.count }.map { ($0, map.meta.provinces[$0].name) }, selection: $cedeProvince)
                    }
                    Divider2()
                    Button {
                        let t = target, years = pactYears, gold = Double(giftText) ?? 0, province = cedeProvince
                        let dem = ultimatumDemand, cov = covertKind; picking = nil
                        Task { await run {
                            switch pick {
                            case .war: return await model.declareWar(nation, on: t)
                            case .alliance: return await model.alliance(nation, with: t)
                            case .vassal: return await model.makeVassal(t, of: nation)
                            case .annex: return await model.annex(t, by: nation)
                            case .pact: return await model.treaty(nation, t, years: years, kind: "pact")
                            case .trade: return await model.treaty(nation, t, years: years, kind: "trade")
                            case .defense: return await model.treaty(nation, t, years: years, kind: "defense")
                            case .marriage: return await model.treaty(nation, t, years: 10, kind: "marriage")
                            case .gift: return await model.gift(nation, to: t, gold: gold)
                            case .ultimatum: return await model.sendUltimatum(nation, to: t, demand: dem)
                            case .covert: return await model.covertAction(nation, target: t, kind: cov)
                            case .coalition: return await model.formCoalition(nation, against: t)
                            case .cede:
                                if province < 0 { return "请选择要割让的州郡" }
                                return await model.grant(province: province, to: t)
                            }
                        } }
                    } label: {
                        GameActionLabel(title: "确认\(pick.rawValue)", symbol: pick.icon).font(Theme.section).frame(maxWidth: .infinity).padding(.vertical, 13)
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
        if let reason = await command() { flash = reason; GameFeel.shared.notify(.error) }
        else { flash = success ?? model.state?.events.last?.text ?? "已执行"; GameFeel.shared.notify(.success) }
        await reload()
    }
}

/// 国家页分类: five tabs with polity-aware second tab title (朝政 / 议政 / 国政 / 国务 / 军政 / 教政 / 部政).
struct NationTabs: View {
    @Binding var tab: NationSheet.Tab
    var courtTitle: String = "朝政"
    var body: some View {
        ChipPicker(items: NationSheet.Tab.allCases.map { t in (t, t == .court ? courtTitle : t.rawValue) }, selection: $tab)
            .padding(.horizontal, 16)
    }
}

extension NationSheet {
    /// 国家加成: what each one changes in the rules.
    static let bonuses: [(key: String, label: String, note: String)] = [
        ("income", "财政加成", "每月国库增收"), ("attack", "进攻加成", "军队伤害"), ("defense", "防守加成", "承受伤害减少"),
        ("growth", "人口增长", "每年州郡人口"), ("speed", "行军速度", "全国军队"),
    ]
    static func percent(_ v: Double?, zero: String = "") -> String {
        guard let v, v != 0 else { return zero.isEmpty ? "" : zero }
        return (zero.isEmpty ? "（" : "") + (v > 0 ? "+" : "") + "\(Int(v))%" + (zero.isEmpty ? "）" : "")
    }
}
