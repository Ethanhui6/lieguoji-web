import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

struct ArmyRow: View {
    let map: WorldMap; let army: GameState.Army
    static let duties = ["attacking": "主攻", "supporting": "回援", "guarding": "把守", "staging": "集结"]
    static func dest(_ map: WorldMap, _ a: GameState.Army) -> String {
        guard let d = a.destination, d >= 0, d < map.meta.provinces.count else { return "" }
        return " → " + map.meta.provinces[d].name
    }
    /// Who commands the army: a player order, an AI expedition (voyages mission phase), or army AI.
    static func command(_ a: GameState.Army) -> String {
        if a.manual { return "玩家军令" }
        let phases = ["assembling": "集结", "outbound": "出航", "returning": "返航"]
        if let m = a.mission, !m.isEmpty { return "AI 远征 · \(phases[m] ?? m)" }
        return "AI 自主调度"
    }
    var body: some View {
        let tint = army.nation >= 0 && army.nation < map.meta.nations.count ? Names.color(map.meta.nations[army.nation].color) : Theme.ink2
        HStack(spacing: 10) {
            UnitMark(unit: army.embarked == true ? "Transport" : army.unit, color: tint)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(army.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                    if let br = army.branchLabel, !br.isEmpty {
                        Text(br).font(Theme.caption).foregroundStyle(Theme.jade)
                            .padding(.horizontal, 6).padding(.vertical, 1.5)
                            .background(Theme.jade.opacity(0.10), in: Capsule())
                    } else {
                        Text(Echelon.name(troops: army.troops, culture: map.meta.nations.indices.contains(army.nation) ? map.meta.nations[army.nation].culture : ""))
                            .font(Theme.caption).foregroundStyle(Theme.ink2)
                            .padding(.horizontal, 6).padding(.vertical, 1.5)
                            .background(Theme.wash, in: Capsule())
                    }
                    if let duty = army.duty.flatMap({ Self.duties[$0] }) {
                        Text(duty).font(Theme.caption).foregroundStyle(Theme.seal)
                            .padding(.horizontal, 6).padding(.vertical, 1.5)
                            .background(Theme.seal.opacity(0.09), in: Capsule())
                            .overlay(Capsule().stroke(Theme.seal.opacity(0.35), lineWidth: 0.7))
                    }
                }
                let grpPrefix = army.armyGroup.map { "\($0) · " } ?? ""
                Text("\(grpPrefix)\(Names.unit[army.unit] ?? army.unit) · \(map.meta.provinces.indices.contains(army.province) ? map.meta.provinces[army.province].name : "途中") · \(Names.status(army.status))\(Self.dest(map, army))")
                    .font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1)
            }
            Spacer()
            Text(Names.wan(army.troops)).font(Theme.section).foregroundStyle(Theme.ink).monospacedDigit()
            InkIcon(glyph: .chevronRight, size: 12, weight: 1.6).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
    }
}

/// 军团详情（重做版）：军牌 + 四格核心指标 + 三页签（军令调度 / 整编队伍 / 履历战绩），整编队伍一触即达不再深埋底部。
struct ArmySheet: View {
    @ObservedObject var model: GameModel
    let army: Int
    var armyId: String? = nil
    var say: (String) -> Void = { _ in }
    var locate: () -> Void = {}
    let onMarch: () -> Void
    let onHalt: () -> Void
    var onRetreat: () -> Void = {}
    var onClose: () -> Void = {}
    @Environment(\.inSidePanel) private var inSidePanel
    @Environment(\.hasBackBar) private var hasBackBar
    @Environment(\.sidePanelClose) private var sidePanelClose

    private enum Tab: String, CaseIterable {
        case orders = "军令调度"
        case reorganize = "整编队伍"
        case service = "履历战绩"
    }

    @State private var tab: Tab = .orders
    @State private var merging = false
    @State private var renaming = false
    @State private var disbanding = false
    @State private var newName = ""
    @State private var troopsText = ""
    @State private var unit = ""
    @State private var morale = 100.0
    @State private var syncedArmyId = ""
    @State private var autoRenameBranch = true

    static let units = UnitKinds.kinds.map { ($0.key, $0.name) }

    var body: some View {
        if let map = model.map, let resolved = model.resolveArmy(id: armyId, fallback: army) {
            let armyIndex = resolved.index
            let a = resolved.army
            let nation = a.nation >= 0 && a.nation < map.meta.nations.count ? map.meta.nations[a.nation] : nil
            let tint = nation.map { Names.color($0.color) } ?? Theme.ink2
            let fighting = a.status == "fighting"
            let peers = (model.state?.armies ?? []).enumerated().filter {
                $0.element.id != a.id && $0.element.nation == a.nation && $0.element.province == a.province && $0.element.province >= 0 && $0.element.status != "fighting"
            }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    SheetGrabber()

                    // 1. 军牌抬头：国色兵徽 + 军号编制 + 主将徽记 + 定位圆钮
                    HStack(spacing: 12) {
                        UnitMark(unit: a.unit, color: tint).frame(width: 48, height: 48)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(a.name).font(Theme.kai(24)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.72)
                                if a.banner == "ruler" {
                                    let lexArmy = LocalizationEngine.lexicon(culture: nation?.culture, polity: nation?.polity, style: nil)
                                    PaperTag(text: lexArmy.isRepublican ? "元首亲征" : "御驾亲征", color: Theme.seal, size: 11)
                                }
                            }
                            HStack(spacing: 6) {
                                RoundedRectangle(cornerRadius: 2.5, style: .continuous).fill(tint).frame(width: 9, height: 9)
                                Text("\(nation?.name ?? "") · \(model.state.map { Echelon.designation($0, map, army: armyIndex) } ?? "") · \(Names.unit[a.unit] ?? a.unit)")
                                    .font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1)
                            }
                            if let c = a.commander {
                                Text(a.banner == "ruler" ? "亲征主帅：\(c)" : "主将：\(c)")
                                    .font(Theme.caption).foregroundStyle(a.banner == "ruler" ? Theme.seal : Theme.ink2)
                            }
                        }
                        Spacer(minLength: 4)
                        Button {
                            GameFeel.shared.tap()
                            locate()
                        } label: {
                            InkIcon(glyph: .locate, size: 18, weight: 1.8, accent: Theme.seal.opacity(0.24))
                                .foregroundStyle(Theme.seal)
                                .frame(width: 40, height: 40)
                                .background(Theme.paper2.opacity(0.92), in: Circle())
                                .overlay(Circle().stroke(Theme.seal.opacity(0.32), lineWidth: 0.9))
                        }
                        .buttonStyle(PressStyle()).accessibilityLabel("定位")
                        if inSidePanel, !hasBackBar, let close = sidePanelClose {
                            CardCloseButton(action: close)
                        }
                    }
                    .padding(.horizontal, Theme.Layout.sectionInset).padding(.top, inSidePanel && !hasBackBar ? 12 : 2)

                    // 2. 四格核心指标
                    StatStrip(tiles: [
                        StatTile(label: "编制", value: Echelon.name(troops: a.troops, culture: nation?.culture ?? "")),
                        StatTile(label: "兵力", value: Names.wan(a.troops)),
                        StatTile(label: "士气", value: "\(a.morale)", fraction: Double(a.morale) / 100, warn: a.morale < 30),
                        StatTile(label: "粮草", value: "\(a.supplies)", fraction: Double(min(100, a.supplies)) / 100, warn: a.supplies <= 10),
                    ])

                    // 3. 顶置三页签：军令调度 / 整编队伍（一触直达！） / 履历战绩
                    ChipPicker(items: Tab.allCases.map { ($0, $0.rawValue) }, selection: $tab)
                        .padding(.horizontal, Theme.Layout.pageInset)

                    switch tab {
                    case .orders:
                        ordersSection(map: map, a: a, fighting: fighting, peers: peers)
                    case .reorganize:
                        reorganizeSection(a: a)
                    case .service:
                        serviceSection(a: a)
                    }
                }
                .padding(.bottom, 36)
            }
            .scrollContentBackground(.hidden)
            .ignoresSafeArea(.container, edges: .bottom)
            .onAppear { syncEditor(for: a) }
            .onChange(of: a.id) { _, _ in syncEditor(for: a) }
            .onChange(of: tab) { _, next in if next == .reorganize { syncEditor(for: a) } }
            .confirmationDialog("解散\(a.name)？", isPresented: $disbanding, titleVisibility: .visible) {
                Button("解散（\(a.troops) 人回乡）", role: .destructive) { act("disbandArmy", a) }
            }
            .sheet(isPresented: $merging) {
                VStack(alignment: .leading, spacing: 12) {
                    SheetHeader(title: "合兵", subtitle: "\(a.name)并入同州郡的本国军队", seal: "合")
                    Group2 {
                        ForEach(peers, id: \.element.id) { p in
                            Button { merging = false; act("mergeArmy", a, text: p.element.id) } label: {
                                HStack {
                                    Text(p.element.name).font(Theme.section).foregroundStyle(Theme.ink)
                                    Spacer()
                                    Text("\(Names.wan(p.element.troops)) 兵").font(Theme.label).foregroundStyle(Theme.ink2)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if p.element.id != peers.last?.element.id { Divider2() }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                    Spacer(minLength: 0)
                }
                .presentationDetents([.medium]).background(MemorialPaper().ignoresSafeArea()).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet)
            }
            .sheet(isPresented: $renaming) {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "军队更名", subtitle: "现名 \(a.name)", seal: "改")
                    TextField("", text: $newName).paperField().padding(.horizontal, Theme.Layout.pageInset)
                    SealButton(title: "颁行", disabled: newName.trimmingCharacters(in: .whitespaces).isEmpty) {
                        renaming = false
                        act("renameArmy", a, text: newName)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 16)
                .presentationDetents([.height(280)]).background(MemorialPaper().ignoresSafeArea()).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet)
            }
        } else {
            VStack(spacing: 16) {
                SheetHeader(title: "军团已变动", subtitle: "该军团在推演中已覆灭、合编或遣散", seal: "军")
                Text("当前点选的军团已不在战列之中，请返回舆图点选其他军队。")
                    .font(Theme.body).foregroundStyle(Theme.ink2)
                    .multilineTextAlignment(.center).padding(.horizontal, 28)
                Button(action: onClose) { PrimaryLabel(title: "返回舆图", symbol: "map") }
                    .buttonStyle(PressStyle()).padding(.horizontal, 28)
                Spacer(minLength: 0)
            }
            .padding(.bottom, 24)
        }
    }

    // MARK: - 页签一：军令调度

    @ViewBuilder
    private func ordersSection(map: WorldMap, a: GameState.Army, fighting: Bool, peers: [(offset: Int, element: GameState.Army)]) -> some View {
        let armyClip: String = {
            let cul = (map.meta.nations.indices.contains(a.nation) ? map.meta.nations[a.nation].culture : "").lowercased()
            let seed = abs(a.id.hashValue)
            if a.status == "sieging" {
                return InkVideoStage.pick(from: ["herald-artillery", "herald-siege", "herald-capture"], seed: seed)
            }
            if WorldSeason.of(month: model.state?.date.month ?? 4) == .winter {
                return InkVideoStage.pick(from: ["herald-winter-march", "herald-war", "herald-ambush"], seed: seed)
            }
            if a.unit == "Cavalry" || cul.contains("mongol") || cul.contains("turk") || cul.contains("steppe") {
                return InkVideoStage.pick(from: ["herald-cavalry", "herald-knights-joust", "herald-desert-war"], seed: seed)
            }
            if cul.contains("japan") { return InkVideoStage.pick(from: ["herald-samurai-charge", "herald-ambush", "herald-war"], seed: seed) }
            if cul.contains("arab") || cul.contains("persian") || cul.contains("egypt") { return InkVideoStage.pick(from: ["herald-desert-war", "herald-cavalry", "herald-war"], seed: seed) }
            return InkVideoStage.pick(from: ["herald-war", "herald-ambush", "herald-knights-joust", "herald-camp-muster"], seed: seed)
        }()
        if (fighting || a.status == "sieging"), InkVideoStage.hasVideo(armyClip) {
            InkVideoStage(clip: armyClip, cornerRadius: 12, tint: Theme.seal)
                .frame(height: 72)
                .padding(.horizontal, Theme.Layout.pageInset)
        }
        // 状态、行军路线、补给粮道与当令节气综合战备卡
        let curSeason = WorldSeason.of(month: model.state?.date.month ?? 4)
        let supplyState: (text: String, color: Color) = a.supplies <= 15 ? ("断粮危殆（非战斗减员）", Theme.seal)
            : a.supplies <= 45 ? ("粮草吃紧（宜回师补给）", Color(red: 0.72, green: 0.45, blue: 0.15))
            : ("粮道充盈", Theme.jade)
        let readiness: (text: String, color: Color) = {
            if a.morale >= 85 && a.supplies >= 70 && a.troops >= 4000 { return ("锐气鼎盛", Theme.jade) }
            if a.morale < 35 || a.supplies < 25 { return ("疲惫低迷", Theme.seal) }
            return ("战备齐整", Theme.ink)
        }()
        Group2 {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    let statusColor: Color = fighting ? Theme.seal : (a.travel == "moving" ? Theme.jade : Theme.ink2)
                    PaperTag(text: fighting ? "交战中" : a.travel == "moving" ? "行军中" : Names.status(a.status), color: statusColor, size: 12)
                    Text(map.meta.provinces.indices.contains(a.province) ? map.meta.provinces[a.province].name : "途中")
                        .font(Theme.body).foregroundStyle(Theme.ink)
                    if let d = a.destination, d >= 0, d < map.meta.provinces.count {
                        InkIcon(glyph: .chevronRight, size: 11, weight: 1.7).foregroundStyle(Theme.ink2)
                        Text(map.meta.provinces[d].name).font(Theme.body).foregroundStyle(Theme.seal)
                    }
                    Spacer(minLength: 4)
                    Text(ArmyRow.command(a)).font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                if let note = a.routeNote, !note.isEmpty {
                    HStack(spacing: 5) {
                        InkIcon(glyph: .march, size: 12, weight: 1.7).foregroundStyle(Theme.jade)
                        Text(note).font(Theme.caption).foregroundStyle(Theme.ink2)
                    }
                }
                Divider2()
                HStack(spacing: 8) {
                    PaperTag(text: readiness.text, color: readiness.color, size: 11)
                    Text(supplyState.text).font(Theme.caption).foregroundStyle(supplyState.color)
                    Spacer(minLength: 4)
                    PaperTag(text: curSeason.fullName, color: curSeason == .winter ? Color(red: 0.24, green: 0.44, blue: 0.62) : curSeason == .autumn ? Color(red: 0.74, green: 0.42, blue: 0.12) : Theme.jade, size: 11)
                }
                if let br = a.branchLabel, !br.isEmpty {
                    Divider2()
                    HStack(alignment: .top, spacing: 7) {
                        PaperTag(text: br, color: Theme.jade, size: 11)
                        Text(a.branchNote ?? "常备军分部编制").font(Theme.caption).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
                if let grp = a.armyGroup, !grp.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 7) {
                            PaperTag(text: "集团军", color: Theme.ink, size: 11)
                            Text("\(grp)\(a.groupBonus.map { " · 总协同攻防 +\($0)%" } ?? "")")
                                .font(Theme.caption).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                        if let comp = a.groupComposition, !comp.isEmpty {
                            Text([comp, a.groupSynergy ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(Theme.caption).foregroundStyle(Theme.jade).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                if let wg = a.warGodAura, !wg.isEmpty {
                    let armyCul = map.meta.nations.indices.contains(a.nation) ? map.meta.nations[a.nation].culture : nil
                    HStack(alignment: .center, spacing: 7) {
                        ArtEmblem(image: BundleArt.warCrest(for: armyCul), size: 22, fallback: .military)
                        Text(wg).font(Theme.caption).foregroundStyle(Theme.seal).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 11)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        // 深度战术体系：精锐勋阶 + 实时补给线 + 兵种克制 + 五阵型 + 四野战指令
        ArmyTacticsPanel(model: model, army: a, map: map) { msg in
            say(msg)
        }

        // 主行军指令排：调兵 / 撤退 / 停止
        HStack(spacing: 10) {
            Button(action: onMarch) { PrimaryLabel(title: "调兵", symbol: "arrow.triangle.turn.up.right.diamond") }
                .disabled(fighting).opacity(fighting ? 0.5 : 1)
            Button(action: onRetreat) { SecondaryLabel(title: "撤退", symbol: "arrow.uturn.backward") }
            if a.travel == "moving" || a.travel == "blocked" {
                Button(action: onHalt) { SecondaryLabel(title: "停止", symbol: "stop.fill") }
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .buttonStyle(.plain)
        .padding(.horizontal, Theme.Layout.pageInset)
        .animation(Motion.tap, value: a.travel)

        // 2×4 军机令格
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
            ArmyChip(title: a.manual ? "交还AI" : "亲自指挥", symbol: a.manual ? "cpu" : "person.fill") { act("armyManual", a, flag: !a.manual) }
            ArmyChip(title: "驻守", symbol: "flag.fill") { act("holdArmy", a) }
            ArmyChip(title: "回师", symbol: "house.fill") { act("returnHome", a) }
            ArmyChip(title: "补员", symbol: "person.3.fill", disabled: fighting) { act("reinforceArmy", a) }
            ArmyChip(title: "分兵", symbol: "arrow.triangle.branch", disabled: fighting || a.troops < 400) { act("splitArmy", a) }
            ArmyChip(title: "合兵", symbol: "arrow.triangle.merge", disabled: fighting || peers.isEmpty) { merging = true }
            ArmyChip(title: "改名", symbol: "pencil") { newName = a.name; renaming = true }
            ArmyChip(title: "解散", symbol: "xmark.circle", disabled: fighting, danger: true) { disbanding = true }
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        if a.province >= 0, let s = model.state {
            BattleBoard(province: a.province, state: s, map: map, focusNation: a.nation)
        }
    }

    // MARK: - 页签二：整编队伍（置顶标签直达，可视化编辑兵力、兵种与士气）

    @ViewBuilder
    private func reorganizeSection(a: GameState.Army) -> some View {
        SectionLabel("职能分部整编（五部军制）")
        Group2 {
            VStack(alignment: .leading, spacing: 8) {
                let currentBranch = a.branch ?? "field"
                ForEach(Regimes.ArmyBranch.allCases, id: \.rawValue) { br in
                    let active = currentBranch == br.rawValue
                    Button {
                        guard !active else { return }
                        GameFeel.shared.tap()
                        act("setArmyBranch", a, text: br.rawValue, flag: autoRenameBranch)
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            PaperTag(text: br.label, color: active ? Theme.seal : Theme.jade, size: 11)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(br.roleNote)
                                    .font(Theme.caption)
                                    .foregroundStyle(active ? Theme.ink : Theme.ink2)
                                    .multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 4)
                            if active {
                                PaperTag(text: "当前", color: Theme.seal, size: 10)
                            } else {
                                Text("改编").font(Theme.caption).foregroundStyle(Theme.seal)
                            }
                        }
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(active ? Theme.seal.opacity(0.08) : Theme.paper2.opacity(0.55), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(active ? Theme.seal.opacity(0.42) : Theme.ink.opacity(0.10), lineWidth: 0.85))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                Divider2().padding(.horizontal, -14)
                PaperSwitch(title: "改编时同步换授本文化对应番号", on: $autoRenameBranch)
                    .padding(.horizontal, -14)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        SectionLabel("兵力编制")
        Group2 {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    Text("兵力").font(Theme.body).foregroundStyle(Theme.ink2)
                    Spacer()
                    ForEach([-5000, -1000], id: \.self) { d in stepButton(d, a.troops) }
                    TextField("", text: $troopsText, prompt: Text("\(a.troops)").foregroundColor(Theme.ink2.opacity(0.6)))
                        .font(Theme.section).keyboardType(.numberPad).multilineTextAlignment(.center).frame(width: 82)
                        .padding(.vertical, 6)
                        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(Theme.ink.opacity(0.16), lineWidth: 0.85))
                    ForEach([1000, 5000], id: \.self) { d in stepButton(d, a.troops) }
                }
                // 一键常用规模快选
                HStack(spacing: 7) {
                    ForEach([(3000, "三千"), (10000, "一万"), (20000, "两万"), (50000, "五万")], id: \.0) { val, title in
                        let active = (Int(troopsText) ?? a.troops) == val
                        Button {
                            GameFeel.shared.tap()
                            troopsText = String(val)
                        } label: {
                            Text(title).font(Theme.caption)
                                .foregroundStyle(active ? Theme.paper2 : Theme.ink)
                                .frame(maxWidth: .infinity).frame(height: 28)
                                .background(active ? Theme.seal : Theme.wash.opacity(0.75), in: Capsule())
                        }
                        .buttonStyle(PressStyle())
                    }
                }
            }
            .padding(14)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        SectionLabel("兵种换装")
        Group2 {
            UnitGrid(selection: $unit)
                .padding(14)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        SectionLabel("军心士气")
        Group2 {
            PaperSlider(title: "士气", value: $morale, range: 0...100, step: 1) { "\(Int($0))" }
                .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        SealButton(title: "颁行整编") {
            let troops = Int(troopsText)
            Task {
                let error = await model.editArmy(a.id, troops: troops, unit: unit == a.unit ? nil : unit, morale: morale)
                say(error ?? "\(a.name)已整编")
                GameFeel.shared.notify(error == nil ? .success : .error)
                if error == nil { troopsText = "" }
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    // MARK: - 页签三：履历战绩

    @ViewBuilder
    private func serviceSection(a: GameState.Army) -> some View {
        if let k = UnitKinds.byKey[a.unit] {
            HStack(spacing: 10) {
                SealFace(text: String(k.name.prefix(1)), size: 28, color: Theme.jade)
                VStack(alignment: .leading, spacing: 2) {
                    Text("兵种特性 · \(k.name)").font(Theme.body).foregroundStyle(Theme.ink)
                    Text(k.note).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .paperCard()
            .padding(.horizontal, Theme.Layout.pageInset)
        }
        ArmyServiceView(model: model, army: a)
    }

    private func syncEditor(for a: GameState.Army) {
        if syncedArmyId != a.id {
            syncedArmyId = a.id
            troopsText = ""
            unit = a.unit
            morale = Double(a.morale)
        } else if unit.isEmpty {
            unit = a.unit
            morale = Double(a.morale)
        }
    }

    /// Runs one army order and says what happened.
    private func act(_ action: String, _ a: GameState.Army, text: String = "", flag: Bool = false) {
        Task {
            let out = await model.armyAction(action, armyId: a.id, text: text, flag: flag)
            say(out.message); GameFeel.shared.notify(out.ok ? .success : .error)
        }
    }

    private func stepButton(_ delta: Int, _ current: Int) -> some View {
        Button {
            GameFeel.shared.tap()
            let base = Int(troopsText) ?? current
            troopsText = String(max(1, base + delta))
        } label: {
            Text(delta > 0 ? "+\(delta / 1000)k" : "\(delta / 1000)k")
                .font(Theme.label).foregroundStyle(Theme.ink)
                .frame(width: 38, height: 32)
                .background(Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(Theme.ink.opacity(0.15), lineWidth: 0.85))
        }
        .buttonStyle(PressStyle())
    }
}

/// The original's unit mark (World/unit-*.png) in a state's colour.
struct UnitMark: View {
    let unit: String; let color: Color
    var body: some View {
        Group {
            if let img = UnitArt.tinted(unit, UIColor(color), side: 96) { Image(uiImage: img).resizable().scaledToFit() }
            else { InkIcon(glyph: .military).foregroundStyle(color) }
        }
        .padding(6)
        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(color.opacity(0.58), lineWidth: 1.15))
    }
}

enum FleetText {
    static func status(_ s: String) -> String { ["docked": "停泊", "sailing": "航行", "anchored": "下锚", "lost": "已损失"][s] ?? s }
    static func decision(_ d: String) -> String {
        ["waiting": "待命", "attacking": "进攻敌港", "guarding": "驻防", "resupply": "回港补给", "manual": "玩家指挥", "busy": "交战中", "lost": "已损失", "no-route": "无可达港口"][d] ?? d
    }
    static func mission(_ m: String?) -> String {
        ["patrol": "制海巡弋", "escort": "护航掩护", "blockade": "封锁敌港", "raid": "破交袭扰", "refit": "归港修整"][m ?? "patrol"] ?? "制海巡弋"
    }
    static func rankBadge(xp: Int?, ships: Int) -> (text: String, color: Color) {
        let v = xp ?? 0
        if v >= 120 { return ("无敌舰队", Theme.seal) }
        if v >= 60 { return ("镇海主力", Theme.gold) }
        if v >= 25 || ships >= 5 { return ("精锐水师", Theme.jade) }
        return ("新编水师", Theme.ink2)
    }
    static func classes(_ f: GameState.Fleet) -> (h: Int, l: Int, g: Int) {
        let total = max(1, f.ships)
        if let h = f.heavy, let l = f.light, let g = f.gunboats, h + l + g > 0 {
            return (h, l, g)
        }
        let h = max(1, (total + 1) / 3)
        let l = max(0, (total - h + 1) / 2)
        let g = max(0, total - h - l)
        return (h, l, g)
    }
    /// 净化引擎内部调度说明，统一转换为地道水师军机奏报用语，杜绝底层技术词外露。
    static func cleanReason(_ f: GameState.Fleet) -> String {
        if f.blockading == true { return "封锁敌港航道，截夺海贸商税" }
        if f.escorting == true { return "掩护跨海运兵船队安全渡海" }
        if f.repairActive == true { return "驻泊本国船坞整修舰体与海粮" }
        if f.decision == "busy" { return "正与敌国水师激战争夺制海权" }
        if f.decision == "attacking" { return "扬帆奔袭敌方海港，准备夺港封锁" }
        if f.decision == "resupply" { return "返航母港补充淡水海粮与水兵" }
        let raw = f.reason.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty || raw.contains("原作") || raw.contains("权重") || raw.contains("AI") {
            return f.status == "sailing" ? "奉命巡弋近海航道，护卫海疆" : "锚泊母港整备，待机出航镇海"
        }
        return raw
    }
}

struct FleetRow: View {
    let map: WorldMap
    let fleet: GameState.Fleet
    var body: some View {
        let tint = fleet.nation >= 0 && fleet.nation < map.meta.nations.count ? Names.color(map.meta.nations[fleet.nation].color) : Theme.ink2
        let isFighting = fleet.decision == "busy"
        let isBlockading = fleet.blockading == true || fleet.decision == "attacking"
        let isEscorting = fleet.escorting == true
        let isRepairing = fleet.repairActive == true
        let badgeColor: Color = isFighting ? Theme.danger : isBlockading ? Theme.seal : isEscorting ? Theme.jade : fleet.manual ? Theme.gold : Theme.jade
        let cls = FleetText.classes(fleet)
        let portLabel = fleet.port >= 0 && map.meta.provinces.indices.contains(fleet.port) ? map.meta.provinces[fleet.port].name + "港" : "外海巡航"
        HStack(spacing: 12) {
            UnitMark(unit: "Fleet", color: tint).frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(fleet.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                    PaperTag(
                        text: isFighting ? "海战交火" : isBlockading ? "封锁夺港" : isEscorting ? "护航掩护" : isRepairing ? "船坞修整" : FleetText.mission(fleet.mission),
                        color: badgeColor,
                        size: 10
                    )
                }
                Text("\(FleetText.status(fleet.status)) · \(portLabel) · 主\(cls.h)/快\(cls.l)/炮\(cls.g)" + ((fleet.admiral?.isEmpty == false) ? " · 提督\(fleet.admiral!)" : ""))
                    .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 4) {
                Text("\(fleet.ships) 艘").font(Theme.section).foregroundStyle(Theme.ink).monospacedDigit()
                InkBar(fraction: fleet.hull, color: fleet.hull < 0.35 ? Theme.danger : tint, height: 4)
                    .frame(width: 44)
            }
            InkIcon(glyph: .chevronRight, size: 12, weight: 1.7).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
    }
}

private struct PortSelectDot: View {
    let on: Bool
    let color: Color
    var body: some View {
        Circle()
            .fill(on ? color : Color.clear)
            .frame(width: 18, height: 18)
            .overlay(Circle().stroke(on ? color : Theme.ink.opacity(0.28), lineWidth: 1.4))
            .overlay {
                if on {
                    InkIcon(glyph: .peace, size: 10, weight: 2.2).foregroundStyle(Theme.paper2)
                }
            }
    }
}

struct FleetSheet: View {
    private enum Tab: String, CaseIterable {
        case orders = "水师军令"
        case reorganize = "舰种编制"
        case ports = "制海态势"
    }

    private struct EnemyPortItem {
        let port: GameState.Port
        let distance: Double
        let reclaim: Bool
    }

    private struct FriendlyPortItem {
        let port: GameState.Port
        let distance: Double
    }

    @State private var tab: Tab = .orders
    @State private var target = -1
    @State private var draftHeavy = 1
    @State private var draftLight = 1
    @State private var draftGunboats = 1
    @State private var newName = ""
    @State private var syncedFleetId = ""
    @State private var sending = false
    @State private var feedback = ""
    @State private var allFriendlyPorts = false
    @State private var allEnemyPorts = false

    @ObservedObject var model: GameModel
    let fleet: Int
    var fleetId: String? = nil
    /// Pick the port on the map instead of the list.
    var pickOnMap: () -> Void = {}
    var onClose: () -> Void = {}
    @Environment(\.inSidePanel) private var inSidePanel
    @Environment(\.hasBackBar) private var hasBackBar
    @Environment(\.sidePanelClose) private var sidePanelClose

    var body: some View {
        if let map = model.map, let resolved = model.resolveFleet(id: fleetId, fallback: fleet) {
            let f = resolved.fleet
            let nation = f.nation >= 0 && f.nation < map.meta.nations.count ? map.meta.nations[f.nation] : nil
            let tint = nation.map { Names.color($0.color) } ?? Theme.ink2
            let busy = f.decision == "busy" || f.status == "lost"
            let enemies = Set(model.state?.nations.indices.contains(f.nation) == true ? model.state!.nations[f.nation].enemies : [])
            let allMapPorts = (model.state?.ports ?? []).filter { map.meta.provinces.indices.contains($0.province) }
            let enemyPorts: [EnemyPortItem] = allMapPorts.compactMap { p in
                let isReclaim = p.owner == f.nation && p.occupier != f.nation
                let isEnemyHeld = enemies.contains(p.occupier) || enemies.contains(p.owner)
                guard isReclaim || isEnemyHeld else { return nil }
                guard p.occupier != f.nation || p.value < 99.5 else { return nil }
                return EnemyPortItem(port: p, distance: hypot(Double(p.x - f.x), Double(p.y - f.y)), reclaim: isReclaim)
            }.sorted { a, b in
                if a.reclaim != b.reclaim { return a.reclaim && !b.reclaim }
                return a.distance < b.distance
            }
            let friendlyPorts: [FriendlyPortItem] = allMapPorts.filter { $0.occupier == f.nation }
                .map { FriendlyPortItem(port: $0, distance: hypot(Double($0.x - f.x), Double($0.y - f.y))) }
                .sorted { $0.distance < $1.distance }
            let shownEnemy = allEnemyPorts ? enemyPorts : Array(enemyPorts.prefix(5))
            let shownFriendly = allFriendlyPorts ? friendlyPorts : Array(friendlyPorts.prefix(6))
            let targetIsEnemy = enemyPorts.contains { $0.port.province == target }
            let rank = FleetText.rankBadge(xp: f.experience, ships: f.ships)
            let cls = FleetText.classes(f)
            let curMission = f.mission ?? "patrol"

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    fleetTopSummary(f: f, nation: nation, tint: tint, rank: rank, cls: cls, curMission: curMission)

                    switch tab {
                    case .orders:
                        fleetOrdersSection(
                            map: map,
                            f: f,
                            busy: busy,
                            curMission: curMission,
                            enemyPortsCount: enemyPorts.count,
                            shownEnemy: shownEnemy,
                            friendlyPortsCount: friendlyPorts.count,
                            shownFriendly: shownFriendly,
                            targetIsEnemy: targetIsEnemy
                        )
                    case .reorganize:
                        fleetReorganizeSection(f: f, cls: cls)
                    case .ports:
                        fleetPortsSection(map: map, f: f, tint: tint, enemies: enemies, allMapPorts: allMapPorts)
                    }
                }
                .padding(.bottom, 24)
                .animation(Motion.fade, value: feedback)
            }
            .onAppear {
                syncDraft(f)
            }
            .onChange(of: f.id) { _, _ in
                syncDraft(f)
            }
        } else {
            VStack(spacing: 16) {
                SheetHeader(title: "舰队已变动", subtitle: "该舰队已沉没、返坞或解散", seal: "舟")
                Button(action: onClose) { PrimaryLabel(title: "返回舆图", symbol: "map") }
                    .buttonStyle(PressStyle()).padding(.horizontal, 28)
                Spacer(minLength: 0)
            }
            .padding(.bottom, 24)
        }
    }

    @ViewBuilder
    private func fleetTopSummary(
        f: GameState.Fleet,
        nation: WorldMeta.Nation?,
        tint: Color,
        rank: (text: String, color: Color),
        cls: (h: Int, l: Int, g: Int),
        curMission: String
    ) -> some View {
        SheetGrabber()

        HStack(spacing: 12) {
            UnitMark(unit: "Fleet", color: tint).frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(f.name).font(Theme.kai(24)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                    PaperTag(text: rank.text, color: rank.color, size: 11)
                    PaperTag(
                        text: FleetText.mission(curMission),
                        color: f.decision == "busy" ? Theme.danger : f.blockading == true ? Theme.seal : Theme.jade,
                        size: 11
                    )
                }
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 2.5, style: .continuous).fill(tint).frame(width: 9, height: 9)
                    Text("\(nation?.name ?? "") · 主力\(cls.h) / 快舰\(cls.l) / 炮舰\(cls.g) · \(FleetText.status(f.status))")
                        .font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.76)
                }
            }
            Spacer(minLength: 4)
            Button {
                GameFeel.shared.tap()
                model.controller.fly(x: Double(f.x), y: Double(f.y))
            } label: {
                InkIcon(glyph: .locate, size: 18, weight: 1.8, accent: Theme.seal.opacity(0.24))
                    .foregroundStyle(Theme.seal)
                    .frame(width: 40, height: 40)
                    .background(Theme.paper2.opacity(0.92), in: Circle())
                    .overlay(Circle().stroke(Theme.seal.opacity(0.32), lineWidth: 0.9))
            }
            .buttonStyle(PressStyle()).accessibilityLabel("定位舰队")
            if inSidePanel, !hasBackBar, let close = sidePanelClose {
                CardCloseButton(action: close)
            }
        }
        .padding(.horizontal, Theme.Layout.sectionInset).padding(.top, inSidePanel && !hasBackBar ? 12 : 2)

        StatStrip(tiles: [
            StatTile(label: "战船", value: "\(f.ships)艘", edit: f.status == "lost" ? nil : { withAnimation(Motion.panel) { tab = .reorganize } }),
            StatTile(label: "水兵", value: Names.wan(f.crew)),
            StatTile(label: "舰体", value: "\(Int((f.hull * 100).rounded()))%", fraction: f.hull, warn: f.hull < 0.35),
            StatTile(label: "海粮", value: "\(f.food)", fraction: Double(min(100, max(0, f.food / max(1, f.crew / 2)))) / 100, warn: f.food <= f.crew * 15),
        ])

        Group2 {
            HStack(spacing: 10) {
                InkIcon(glyph: .military, size: 16, weight: 1.75).foregroundStyle(Theme.seal)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("水师提督：\(f.admiral ?? "未委任")").font(Theme.section).foregroundStyle(Theme.ink)
                        if let skillLabel = f.admiralSkillLabel, !skillLabel.isEmpty {
                            PaperTag(text: skillLabel, color: Theme.gold, size: 10)
                        }
                        if let bonus = f.admiralBonus, bonus > 0 {
                            PaperTag(text: "海战火力 +\(bonus)%", color: Theme.seal, size: 10)
                        }
                        if f.repairActive == true {
                            PaperTag(text: "船坞抢修中", color: Theme.jade, size: 10)
                        }
                    }
                    Text(([f.admiralSkillNote, "战功 \(f.experience ?? 0)", FleetText.cleanReason(f)]
                        .compactMap { $0 }.filter { !$0.isEmpty }).joined(separator: " · "))
                        .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2)
                }
                Spacer(minLength: 4)
                Button {
                    GameFeel.shared.tap()
                    Task {
                        let out = await model.armyAction("fleetAdmiral", armyId: f.id)
                        feedback = out.message
                        GameFeel.shared.notify(out.ok ? .success : .error)
                    }
                } label: {
                    Text(f.admiral == nil ? "委任提督" : "易帅").font(Theme.caption).foregroundStyle(Theme.seal)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Theme.seal.opacity(0.10), in: Capsule())
                        .overlay(Capsule().stroke(Theme.seal.opacity(0.35), lineWidth: 0.8))
                }
                .buttonStyle(PressStyle()).disabled(f.status == "lost")
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        ChipPicker(items: Tab.allCases.map { ($0, $0.rawValue) }, selection: $tab)
            .padding(.horizontal, Theme.Layout.pageInset)

        if !feedback.isEmpty {
            HStack(spacing: 8) {
                InkIcon(glyph: .edict, size: 14, weight: 1.7).foregroundStyle(Theme.seal)
                Text(feedback).font(Theme.label).foregroundStyle(Theme.seal)
            }
            .padding(.horizontal, Theme.Layout.sectionInset)
            .transition(.opacity)
        }
    }

    @ViewBuilder
    private func fleetOrdersSection(
        map: WorldMap,
        f: GameState.Fleet,
        busy: Bool,
        curMission: String,
        enemyPortsCount: Int,
        shownEnemy: [EnemyPortItem],
        friendlyPortsCount: Int,
        shownFriendly: [FriendlyPortItem],
        targetIsEnemy: Bool
    ) -> some View {
        let fleetClip: String = {
            let cul = (map.meta.nations.indices.contains(f.nation) ? map.meta.nations[f.nation].culture : "").lowercased()
            let seed = abs(f.id.hashValue)
            if curMission == "blockade" { return InkVideoStage.pick(from: ["herald-blockade", "herald-galleon-broadside", "herald-naval"], seed: seed) }
            if curMission == "escort" || curMission == "patrol" { return InkVideoStage.pick(from: ["herald-harbor-trade", "herald-voyage-fleet", "herald-voyage"], seed: seed) }
            if cul.contains("nordic") || cul.contains("viking") { return InkVideoStage.pick(from: ["herald-longship-raid", "herald-naval", "herald-blockade"], seed: seed) }
            if cul.contains("chinese") || cul.contains("japan") { return InkVideoStage.pick(from: ["herald-fire-ships", "herald-naval", "herald-voyage-fleet"], seed: seed) }
            return InkVideoStage.pick(from: ["herald-galleon-broadside", "herald-naval", "herald-fire-ships", "herald-blockade"], seed: seed)
        }()
        if InkVideoStage.hasVideo(fleetClip) {
            InkVideoStage(clip: fleetClip, cornerRadius: 12, tint: Theme.seal)
                .frame(height: 74)
                .padding(.horizontal, Theme.Layout.pageInset)
        }

        SectionLabel("水师战略任务指令（五略）")
        Group2 {
            VStack(spacing: 7) {
                ForEach(MaritimeWarfare.FleetMission.allCases, id: \.rawValue) { m in
                    fleetMissionRow(f: f, mission: m, active: curMission == m.rawValue, busy: busy)
                }
            }
            .padding(12)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        // 船坞扩建（1-3级）与船台自建舰队面板
        FleetShipyardPanel(model: model, fleet: f, map: map) { msg in
            feedback = msg
        }

        HStack(spacing: 10) {
            Button {
                GameFeel.shared.tap()
                Task {
                    let out = await model.armyAction("fleetRepair", armyId: f.id)
                    feedback = out.message
                    GameFeel.shared.notify(out.ok ? .success : .error)
                }
            } label: {
                SecondaryLabel(title: f.hull < 0.96 || f.food < f.crew * 40 ? "船坞紧急抢修补给" : "满编战备巡航", symbol: "wrench.and.screwdriver")
            }
            .disabled(busy)

            if f.status != "lost" {
                let mine = f.manual || !f.patrol
                Button {
                    Task {
                        let out = await model.armyAction("fleetManual", armyId: f.id, flag: !mine)
                        feedback = out.message
                        GameFeel.shared.tap()
                    }
                } label: {
                    SecondaryLabel(title: mine ? "交还都督巡防" : "亲自统帅航向", symbol: mine ? "cpu" : "person.fill")
                }
            }
        }
        .buttonStyle(.plain).padding(.horizontal, Theme.Layout.pageInset)

        if enemyPortsCount > 0 {
            HStack {
                SectionLabel("敌港封锁 · 跨海夺港", inset: false)
                Spacer()
                PaperTag(text: "交战目标 \(enemyPortsCount) 港", color: Theme.danger, size: 10)
            }
            .padding(.horizontal, Theme.Layout.sectionInset)
            Group2 {
                ForEach(shownEnemy, id: \.port.province) { item in
                    enemyPortRow(map: map, item: item)
                    if item.port.province != shownEnemy.last?.port.province { Divider2() }
                }
                if enemyPortsCount > 5 {
                    Divider2()
                    Button { withAnimation(Motion.panel) { allEnemyPorts.toggle() } } label: {
                        Text(allEnemyPorts ? "收起敌方海港" : "展开全部 \(enemyPortsCount) 处交战海港")
                            .font(Theme.body).foregroundStyle(Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 10)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        HStack {
            SectionLabel("本国海港 · 驻泊补粮", inset: false)
            Spacer()
            Button(action: pickOnMap) {
                GameActionLabel(title: "地图选港", symbol: "hand.tap").font(Theme.label).foregroundStyle(Theme.seal)
            }
            .buttonStyle(PressStyle()).disabled(busy)
        }
        .padding(.horizontal, Theme.Layout.sectionInset)
        Group2 {
            if friendlyPortsCount == 0 {
                Text("本国当前没有已控制的海港").font(Theme.body).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 16)
            }
            ForEach(shownFriendly, id: \.port.province) { item in
                friendlyPortRow(map: map, f: f, item: item)
                if item.port.province != shownFriendly.last?.port.province { Divider2() }
            }
            if friendlyPortsCount > 6 {
                Divider2()
                Button { withAnimation(Motion.panel) { allFriendlyPorts.toggle() } } label: {
                    Text(allFriendlyPorts ? "收起" : "展开全部 \(friendlyPortsCount) 港")
                        .font(Theme.body).foregroundStyle(Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 10)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        HStack(spacing: 10) {
            Button {
                sending = true
                Task {
                    let pName = map.meta.provinces.indices.contains(target) ? map.meta.provinces[target].name : ""
                    let err = await model.fleetOrder(id: f.id, province: target)
                    feedback = err ?? (targetIsEnemy ? "战舰起航，跨海夺取\(pName)港" : "起航，驶往\(pName)港")
                    sending = false
                    if err == nil { target = -1; GameFeel.shared.notify(.success) } else { GameFeel.shared.notify(.error) }
                }
            } label: { PrimaryLabel(title: targetIsEnemy ? "起航夺港" : "拔锚起航", symbol: targetIsEnemy ? "flame.fill" : "sailboat") }
            .disabled(sending || target < 0 || busy).opacity(target < 0 || busy ? 0.5 : 1)

            Button {
                sending = true
                Task {
                    feedback = await model.fleetOrder(id: f.id, province: nil) ?? "舰队已在当前海面下锚"
                    sending = false
                }
            } label: { SecondaryLabel(title: "下锚待命", symbol: "stop.fill") }
            .disabled(sending || busy).opacity(busy ? 0.5 : 1)
        }
        .buttonStyle(.plain).padding(.horizontal, Theme.Layout.pageInset)
        .animation(Motion.fade, value: target)
    }

    @ViewBuilder
    private func fleetMissionRow(f: GameState.Fleet, mission: MaritimeWarfare.FleetMission, active: Bool, busy: Bool) -> some View {
        Button {
            GameFeel.shared.tap()
            Task {
                let out = await model.armyAction("fleetMission", armyId: f.id, text: mission.rawValue)
                feedback = out.message
                GameFeel.shared.notify(out.ok ? .success : .error)
            }
        } label: {
            HStack(spacing: 10) {
                PaperTag(text: mission.label, color: active ? Theme.seal : Theme.jade, size: 11)
                Text(mission.note)
                    .font(Theme.caption)
                    .foregroundStyle(active ? Theme.ink : Theme.ink2)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                if active {
                    PaperTag(text: "奉行中", color: Theme.seal, size: 10)
                } else {
                    Text("传令").font(Theme.caption).foregroundStyle(Theme.seal)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(active ? Theme.seal.opacity(0.08) : Theme.paper2.opacity(0.55), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(active ? Theme.seal.opacity(0.42) : Theme.ink.opacity(0.10), lineWidth: 0.85))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain).disabled(busy)
    }

    @ViewBuilder
    private func enemyPortRow(map: WorldMap, item: EnemyPortItem) -> some View {
        let on = target == item.port.province
        let pName = map.meta.provinces[item.port.province].name + "港"
        let holderName = map.meta.nations.indices.contains(item.port.occupier) ? map.meta.nations[item.port.occupier].name : "敌军"
        let tagLabel = item.reclaim ? "收复本港" : (item.port.blockaded == true ? "已封锁" : "夺港封锁")
        let tagColor = item.reclaim ? Theme.gold : Theme.danger
        Button {
            withAnimation(Motion.tap) { target = on ? -1 : item.port.province }
        } label: {
            HStack(spacing: 10) {
                InkIcon(glyph: .war, size: 15, weight: 1.7)
                    .foregroundStyle(on ? Theme.danger : Theme.seal)
                    .frame(width: Theme.Layout.iconGutter)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(pName).font(Theme.section).foregroundStyle(Theme.ink)
                        PaperTag(text: tagLabel, color: tagColor, size: 10)
                    }
                    Text("现由\(holderName)把持 · 港控 \(Int(item.port.value.rounded()))%")
                        .font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                Spacer()
                Text("\(Int(item.distance)) 里").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                PortSelectDot(on: on, color: Theme.danger)
            }
            .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
            .background(on ? Theme.danger.opacity(0.08) : .clear)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func friendlyPortRow(map: WorldMap, f: GameState.Fleet, item: FriendlyPortItem) -> some View {
        let on = target == item.port.province
        Button {
            withAnimation(Motion.tap) { target = on ? -1 : item.port.province }
        } label: {
            HStack(spacing: 10) {
                InkIcon(glyph: .anchor, size: 15, weight: 1.7)
                    .foregroundStyle(on ? Theme.seal : Theme.ink2)
                    .frame(width: Theme.Layout.iconGutter)
                Text(map.meta.provinces[item.port.province].name + "港").font(Theme.section).foregroundStyle(Theme.ink)
                if item.port.province == f.port {
                    PaperTag(text: "现泊", color: Theme.jade, size: 10)
                }
                if item.port.owner != f.nation {
                    PaperTag(text: "占领港", color: Theme.gold, size: 10)
                }
                Spacer()
                Text("\(Int(item.distance)) 里").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                PortSelectDot(on: on, color: Theme.seal)
            }
            .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
            .background(on ? Theme.seal.opacity(0.07) : .clear)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func fleetReorganizeSection(f: GameState.Fleet, cls: (h: Int, l: Int, g: Int)) -> some View {
        let draftTotal = max(1, draftHeavy + draftLight + draftGunboats)
        let hShare = Int((Double(draftHeavy) / Double(draftTotal) * 100).rounded())
        let lShare = Int((Double(draftLight) / Double(draftTotal) * 100).rounded())
        let gShare = max(0, 100 - hShare - lShare)
        SectionLabel("三舰种协同编制（主力战舰 / 巡弋快舰 / 封锁炮舰）")
        Group2 {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("总编制：\(draftTotal) 艘战船 · \(draftTotal * 200) 水兵").font(Theme.section).foregroundStyle(Theme.ink)
                    Spacer()
                    PaperTag(text: "主\(hShare)% · 快\(lShare)% · 炮\(gShare)%", color: Theme.seal, size: 10)
                }
                GeometryReader { geo in
                    let w = max(10, geo.size.width)
                    HStack(spacing: 2) {
                        if draftHeavy > 0 {
                            RoundedRectangle(cornerRadius: 3).fill(Theme.seal)
                                .frame(width: max(6, w * CGFloat(draftHeavy) / CGFloat(draftTotal)))
                        }
                        if draftLight > 0 {
                            RoundedRectangle(cornerRadius: 3).fill(Theme.jade)
                                .frame(width: max(6, w * CGFloat(draftLight) / CGFloat(draftTotal)))
                        }
                        if draftGunboats > 0 {
                            RoundedRectangle(cornerRadius: 3).fill(Theme.gold)
                                .frame(width: max(6, w * CGFloat(draftGunboats) / CGFloat(draftTotal)))
                        }
                    }
                }
                .frame(height: 8)

                shipClassStepper(
                    title: "主力战舰（楼船/战列）",
                    note: "正面海战决战火力 +\(Int((Double(draftHeavy) / Double(draftTotal) * 16).rounded()))%，压制敌方主力水师",
                    color: Theme.seal,
                    count: $draftHeavy,
                    otherSum: draftLight + draftGunboats
                )
                Divider2()
                shipClassStepper(
                    title: "巡弋快舰（艨艟/巡洋）",
                    note: "护航与破交截杀半径 +\(Int((Double(draftLight) / Double(draftTotal) * 34).rounded())) 里，猎杀敌运兵船",
                    color: Theme.jade,
                    count: $draftLight,
                    otherSum: draftHeavy + draftGunboats
                )
                Divider2()
                shipClassStepper(
                    title: "封锁炮舰（火舫/臼炮）",
                    note: "港口封锁压制与海贸截夺 +\(Int((Double(draftGunboats) / Double(draftTotal) * 45).rounded()))%，支援两栖抢滩岸轰",
                    color: Theme.gold,
                    count: $draftGunboats,
                    otherSum: draftHeavy + draftLight
                )

                SealButton(
                    title: "颁行三舰种整编（共 \(draftTotal) 艘）",
                    disabled: f.status == "lost" || (draftHeavy == cls.h && draftLight == cls.l && draftGunboats == cls.g && draftTotal == f.ships)
                ) {
                    let spec = "\(draftHeavy),\(draftLight),\(draftGunboats)"
                    Task {
                        let out = await model.armyAction("fleetComposition", armyId: f.id, text: spec)
                        feedback = out.message
                        GameFeel.shared.notify(out.ok ? .success : .error)
                    }
                }
            }
            .padding(14)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        SectionLabel("水师舰号更定")
        Group2 {
            VStack(alignment: .leading, spacing: 10) {
                TextField("输入新舰号", text: $newName).paperField()
                SealButton(
                    title: "更定舰号",
                    disabled: f.status == "lost" || newName.trimmingCharacters(in: .whitespaces).isEmpty || newName == f.name
                ) {
                    let trimmed = newName.trimmingCharacters(in: .whitespaces)
                    Task {
                        let err = await model.editFleet(f.id, ships: nil, name: trimmed)
                        feedback = err ?? "舰队已更名为「\(trimmed)」"
                        GameFeel.shared.notify(err == nil ? .success : .error)
                    }
                }
            }
            .padding(14)
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    @ViewBuilder
    private func fleetPortsSection(
        map: WorldMap,
        f: GameState.Fleet,
        tint: Color,
        enemies: Set<Int>,
        allMapPorts: [GameState.Port]
    ) -> some View {
        let allFleets = (model.state?.fleets ?? []).filter { $0.status != "lost" }
        let myShips = allFleets.filter { $0.nation == f.nation }.reduce(0) { $0 + $1.ships }
        let enemyShips = allFleets.filter { enemies.contains($0.nation) }.reduce(0) { $0 + $1.ships }
        let myPorts = allMapPorts.filter { $0.owner == f.nation || $0.occupier == f.nation }
        let blockedMyPorts = myPorts.filter { $0.blockaded == true || ($0.owner == f.nation && $0.occupier != f.nation) }.count

        SectionLabel("制海权与海运对比")
        Group2 {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("本国战船 \(myShips) 艘").font(Theme.section).foregroundStyle(Theme.jade)
                    Spacer()
                    Text("交战敌舰 \(enemyShips) 艘").font(Theme.section).foregroundStyle(enemyShips > 0 ? Theme.danger : Theme.ink2)
                }
                let totalS = max(1, myShips + enemyShips)
                InkBar(fraction: Double(myShips) / Double(totalS), color: tint, height: 6)
                Text("控制海港 \(myPorts.count) 处（受封锁 \(blockedMyPorts) 处）· 跨海运力取决于未封锁海港与现役战船规模")
                    .font(Theme.caption).foregroundStyle(Theme.ink2)
            }
            .padding(14)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        SectionLabel("本国海港与封锁态势（\(myPorts.count) 港）")
        Group2 {
            if myPorts.isEmpty {
                Text("本国当前无沿海港口").font(Theme.body).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 16)
            }
            ForEach(Array(myPorts.enumerated()), id: \.element.province) { idx, p in
                myPortStatusRow(map: map, f: f, tint: tint, p: p)
                if idx < myPorts.count - 1 { Divider2() }
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        let myYards = (model.state?.yards ?? []).filter { $0.nation == f.nation }
        if !myYards.isEmpty {
            SectionLabel("船坞建造队列")
            Group2 {
                ForEach(Array(myYards.enumerated()), id: \.offset) { idx, y in
                    HStack {
                        InkIcon(glyph: .settings, size: 15, weight: 1.7).foregroundStyle(Theme.seal).frame(width: Theme.Layout.iconGutter)
                        Text(y.name).font(Theme.section).foregroundStyle(Theme.ink)
                        Spacer()
                        PaperTag(text: "建造中 · 约 \(max(1, Int(y.months.rounded()))) 个月下水", color: Theme.gold, size: 10)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    if idx < myYards.count - 1 { Divider2() }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    @ViewBuilder
    private func myPortStatusRow(map: WorldMap, f: GameState.Fleet, tint: Color, p: GameState.Port) -> some View {
        let pName = map.meta.provinces[p.province].name + "港"
        let blockaded = p.blockaded == true || (p.owner == f.nation && p.occupier != f.nation)
        let occupiedEnemy = p.owner != f.nation && p.occupier == f.nation
        let contested = p.value < 99.5
        HStack(spacing: 10) {
            InkIcon(glyph: .anchor, size: 15, weight: 1.7)
                .foregroundStyle(blockaded ? Theme.danger : occupiedEnemy ? Theme.gold : Theme.jade)
                .frame(width: Theme.Layout.iconGutter)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(pName).font(Theme.section).foregroundStyle(Theme.ink)
                    if blockaded {
                        let occName = map.meta.nations.indices.contains(p.occupier) && p.occupier != f.nation ? map.meta.nations[p.occupier].name : "敌舰"
                        PaperTag(text: "遭\(occName)封锁", color: Theme.danger, size: 10)
                    } else if occupiedEnemy {
                        PaperTag(text: "跨海占领", color: Theme.gold, size: 10)
                    } else if contested {
                        PaperTag(text: "港湾交锋", color: Theme.seal, size: 10)
                    } else {
                        PaperTag(text: "海路畅通", color: Theme.jade, size: 10)
                    }
                }
                HStack(spacing: 8) {
                    Text("港控度 \(Int(p.value.rounded()))%").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                    InkBar(fraction: p.value / 100.0, color: blockaded ? Theme.danger : tint, height: 4).frame(width: 68)
                }
            }
            Spacer()
            Button {
                GameFeel.shared.tap()
                model.controller.fly(x: Double(p.x), y: Double(p.y))
            } label: {
                Text("查看").font(Theme.caption).foregroundStyle(Theme.seal)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Theme.seal.opacity(0.1), in: Capsule())
            }
            .buttonStyle(PressStyle())
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }

    @ViewBuilder
    private func shipClassStepper(title: String, note: String, color: Color, count: Binding<Int>, otherSum: Int) -> some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2.5).fill(color).frame(width: 6, height: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.section).foregroundStyle(Theme.ink)
                Text(note).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            HStack(spacing: 8) {
                Button {
                    GameFeel.shared.tap()
                    if count.wrappedValue > 0 && (count.wrappedValue + otherSum) > 1 {
                        count.wrappedValue -= 1
                    }
                } label: {
                    Text("−").font(Theme.section).foregroundStyle(Theme.ink)
                        .frame(width: 30, height: 28)
                        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(Theme.ink.opacity(0.15), lineWidth: 0.8))
                }
                .buttonStyle(PressStyle())

                Text("\(count.wrappedValue)艘").font(Theme.section).foregroundStyle(Theme.ink).monospacedDigit().frame(width: 38)

                Button {
                    GameFeel.shared.tap()
                    if (count.wrappedValue + otherSum) < 12 {
                        count.wrappedValue += 1
                    }
                } label: {
                    Text("+").font(Theme.section).foregroundStyle(Theme.ink)
                        .frame(width: 30, height: 28)
                        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(Theme.ink.opacity(0.15), lineWidth: 0.8))
                }
                .buttonStyle(PressStyle())
            }
        }
    }

    private func syncDraft(_ f: GameState.Fleet) {
        guard syncedFleetId != f.id else { return }
        syncedFleetId = f.id
        let cls = FleetText.classes(f)
        draftHeavy = cls.h
        draftLight = cls.l
        draftGunboats = cls.g
        newName = f.name
    }
}

/// One army order as a small paper chip: symbol over a two-character name.
struct ArmyChip: View {
    let title: String; let symbol: String
    var disabled = false
    var danger = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Group {
                    if let g = GameActionLabel.glyph(for: symbol) {
                        InkIcon(glyph: g, size: 17, weight: 1.75)
                    } else {
                        InkIcon(glyph: .military, size: 17, weight: 1.75)
                    }
                }
                .frame(height: 19)
                Text(title).font(Theme.label).lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(danger ? Theme.seal : Theme.ink)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(Theme.paper2.opacity(0.9), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(danger ? Theme.seal.opacity(0.42) : Theme.ink.opacity(0.14), lineWidth: 0.9))
            .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        }
        .buttonStyle(PressStyle())
        .disabled(disabled).opacity(disabled ? 0.45 : 1)
    }
}

/// Every arm in a grid of paper chips, the chosen one's strengths beneath.
struct UnitGrid: View {
    @Binding var selection: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                ForEach(UnitKinds.kinds, id: \.key) { k in
                    let on = k.key == selection
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { selection = k.key }
                    } label: {
                        Text(k.name).font(Theme.label).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity).frame(height: 36)
                            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.15), lineWidth: 0.85))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            if let k = UnitKinds.byKey[selection] {
                Text(k.note).font(Theme.label).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
