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
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 3.5, style: .continuous)
                .fill(army.nation >= 0 && army.nation < map.meta.nations.count ? Names.color(map.meta.nations[army.nation].color) : .gray)
                .frame(width: 8, height: 32)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(army.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                    Text(Echelon.name(troops: army.troops, culture: map.meta.nations.indices.contains(army.nation) ? map.meta.nations[army.nation].culture : ""))
                        .font(Theme.caption).foregroundStyle(Theme.ink2)
                        .padding(.horizontal, 6).padding(.vertical, 1.5)
                        .background(Theme.wash, in: Capsule())
                    if let duty = army.duty.flatMap({ Self.duties[$0] }) {
                        Text(duty).font(Theme.caption).foregroundStyle(Theme.seal)
                            .padding(.horizontal, 6).padding(.vertical, 1.5)
                            .background(Theme.seal.opacity(0.09), in: Capsule())
                            .overlay(Capsule().stroke(Theme.seal.opacity(0.35), lineWidth: 0.7))
                    }
                }
                Text("\(Names.unit[army.unit] ?? army.unit) · \(map.meta.provinces.indices.contains(army.province) ? map.meta.provinces[army.province].name : "途中") · \(Names.status(army.status))\(Self.dest(map, army))")
                    .font(Theme.label).foregroundStyle(Theme.ink2)
            }
            Spacer()
            Text(Names.wan(army.troops)).font(Theme.section).foregroundStyle(Theme.ink).monospacedDigit()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2)
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
                                    PaperTag(text: "御驾亲征", color: Theme.seal, size: 11)
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
                    }
                    .padding(.horizontal, Theme.Layout.sectionInset).padding(.top, 2)

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
                .padding(.bottom, 24)
            }
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
                .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet)
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
                .presentationDetents([.height(280)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet)
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
        // 状态与行军路线条
        HStack(spacing: 8) {
            let statusColor: Color = fighting ? Theme.seal : (a.travel == "moving" ? Theme.jade : Theme.ink2)
            PaperTag(text: fighting ? "交战中" : a.travel == "moving" ? "行军中" : Names.status(a.status), color: statusColor, size: 12)
            Text(map.meta.provinces.indices.contains(a.province) ? map.meta.provinces[a.province].name : "途中")
                .font(Theme.body).foregroundStyle(Theme.ink)
            if let d = a.destination, d >= 0, d < map.meta.provinces.count {
                Image(systemName: "arrow.right").font(.system(size: 11, weight: .regular)).foregroundStyle(Theme.ink2)
                Text(map.meta.provinces[d].name).font(Theme.body).foregroundStyle(Theme.seal)
            }
            Spacer(minLength: 4)
            Text(ArmyRow.command(a)).font(Theme.caption).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .paperCard()
        .padding(.horizontal, Theme.Layout.pageInset)

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
}

struct FleetRow: View {
    let map: WorldMap
    let fleet: GameState.Fleet
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "sailboat.fill").foregroundStyle(fleet.nation >= 0 && fleet.nation < map.meta.nations.count ? Names.color(map.meta.nations[fleet.nation].color) : Theme.ink2)
            VStack(alignment: .leading, spacing: 3) {
                Text(fleet.name).font(Theme.section).foregroundStyle(Theme.ink)
                Text("\(FleetText.status(fleet.status)) · \(FleetText.decision(fleet.decision))").font(Theme.label).foregroundStyle(Theme.ink2)
            }
            Spacer()
            Text("\(fleet.ships) 船 · \(fleet.crew) 人").font(Theme.body).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
    }
}

struct FleetSheet: View {
    @State private var target = -1
    /// 整编舰队: ship count and name edits.
    @State private var shipsEdit = false
    @State private var renaming = false
    @State private var newName = ""
    @State private var sending = false
    @State private var feedback = ""
    @State private var allPorts = false

    @ObservedObject var model: GameModel
    let fleet: Int
    var fleetId: String? = nil
    /// Pick the port on the map instead of the list.
    var pickOnMap: () -> Void = {}
    var onClose: () -> Void = {}
    var body: some View {
        if let map = model.map, let resolved = model.resolveFleet(id: fleetId, fallback: fleet) {
            let f = resolved.fleet
            let nation = f.nation >= 0 && f.nation < map.meta.nations.count ? map.meta.nations[f.nation] : nil
            let busy = f.decision == "busy" || f.status == "lost"
            // Ports this fleet may stay at: its own state's harbours (held by it), nearest first.
            let ports: [(port: GameState.Port, distance: Double)] = (model.state?.ports ?? []).filter { $0.occupier == f.nation && map.meta.provinces.indices.contains($0.province) }
                .map { (port: $0, distance: hypot(Double($0.x - f.x), Double($0.y - f.y))) }.sorted { $0.distance < $1.distance }
            let shown = allPorts ? ports : Array(ports.prefix(6))
            ScrollView {
                LazyVStack(spacing: 14) {
                    SheetHeader(title: f.name, subtitle: nation.map { "\($0.name) · 舰队 · \(FleetText.status(f.status))" }, color: nation.map { Names.color($0.color) }, seal: "舟")
                    StatStrip(tiles: [
                        StatTile(label: "船只", value: "\(f.ships)", edit: f.status == "lost" ? nil : { shipsEdit = true }),
                        StatTile(label: "船员", value: Names.wan(f.crew)),
                        StatTile(label: "舰体", value: "\(Int((f.hull * 100).rounded()))%", fraction: f.hull, warn: f.hull < 0.35),
                        StatTile(label: "口粮", value: "\(f.food)", warn: f.food <= 0),
                    ])
                    Group2 {
                        Button { newName = f.name; renaming = true } label: {
                            HStack { Text("舰队名").font(Theme.body).foregroundStyle(Theme.ink2); Spacer(); Text(f.name).font(Theme.body).foregroundStyle(Theme.ink); Image(systemName: "pencil").font(.system(size: 12, weight: .regular)).foregroundStyle(Theme.seal) }
                                .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain).disabled(f.status == "lost"); Divider2()
                        Row(label: "指挥", value: f.manual || !f.patrol ? "玩家指挥" : "AI · " + FleetText.decision(f.decision)); Divider2()
                        if f.port >= 0, f.port < map.meta.provinces.count { Row(label: "停留港口", value: map.meta.provinces[f.port].name + "港"); Divider2() }
                        if !f.reason.isEmpty { Text(f.reason).font(Theme.label).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 10) }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)

                    HStack {
                        SectionLabel("停留港口", inset: false)
                        Spacer()
                        Button(action: pickOnMap) { Label("地图选港", systemImage: "hand.tap").font(Theme.label).foregroundStyle(Theme.seal) }.buttonStyle(PressStyle()).disabled(busy)
                    }
                    .padding(.horizontal, Theme.Layout.sectionInset)
                    Group2 {
                        if ports.isEmpty {
                            Text("本国没有可停留的港口").font(Theme.body).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 16)
                        }
                        ForEach(shown, id: \.port.province) { item in
                            let on = target == item.port.province
                            Button { withAnimation(Motion.tap) { target = on ? -1 : item.port.province } } label: {
                                HStack(spacing: 10) {
                                    InkIcon(glyph: .anchor, size: 15, weight: 1.7).foregroundStyle(on ? Theme.seal : Theme.ink2).frame(width: Theme.Layout.iconGutter)
                                    Text(map.meta.provinces[item.port.province].name + "港").font(Theme.section).foregroundStyle(Theme.ink)
                                    if item.port.province == f.port {
                                        Text("现泊").font(Theme.caption).foregroundStyle(Theme.jade)
                                            .padding(.horizontal, 6).padding(.vertical, 1.5)
                                            .background(Theme.jade.opacity(0.12), in: Capsule())
                                    }
                                    Spacer()
                                    Text("\(Int(item.distance)) 里").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                                    Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Theme.seal : Theme.ink.opacity(0.25))
                                }
                                .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
                                .background(on ? Theme.seal.opacity(0.07) : .clear)
                            }
                            .buttonStyle(.plain)
                            if item.port.province != shown.last?.port.province { Divider2() }
                        }
                        if ports.count > 6 {
                            Divider2()
                            Button { withAnimation(Motion.panel) { allPorts.toggle() } } label: {
                                Text(allPorts ? "收起" : "展开全部 \(ports.count) 港").font(Theme.body).foregroundStyle(Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 10)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)

                    HStack(spacing: 10) {
                        Button {
                            sending = true
                            Task { feedback = await model.fleetOrder(id: f.id, province: target) ?? "起航，前往\(map.meta.provinces.indices.contains(target) ? map.meta.provinces[target].name : "")港"; sending = false; if feedback.hasPrefix("起航") { target = -1 } }
                        } label: { PrimaryLabel(title: "起航", symbol: "sailboat") }
                        .disabled(sending || target < 0 || busy).opacity(target < 0 || busy ? 0.5 : 1)
                        Button {
                            sending = true
                            Task { feedback = await model.fleetOrder(id: f.id, province: nil) ?? "舰队已下锚"; sending = false }
                        } label: { SecondaryLabel(title: "下锚停航", symbol: "stop.fill") }
                        .disabled(sending || busy).opacity(busy ? 0.5 : 1)
                    }
                    .buttonStyle(.plain).padding(.horizontal, Theme.Layout.pageInset)
                    .animation(Motion.fade, value: target)
                    if f.status != "lost" {
                        let mine = f.manual || !f.patrol
                        Button {
                            Task { let out = await model.armyAction("fleetManual", armyId: f.id, flag: !mine); feedback = out.message }
                        } label: { SecondaryLabel(title: mine ? "交还 AI 自主巡防" : "亲自指挥", symbol: mine ? "cpu" : "person.fill") }
                        .buttonStyle(.plain).padding(.horizontal, Theme.Layout.pageInset)
                    }
                    if !feedback.isEmpty {
                        Text(feedback).font(Theme.label).foregroundStyle(Theme.seal).transition(.opacity)
                    }
                    Text(busy ? "交战或撤退中的舰队不能改令" : "只能停留本国港口；目标须有连通海路").font(Theme.label).foregroundStyle(Theme.ink2)
                }
                .padding(.bottom, 24)
                .animation(Motion.fade, value: feedback)
            }
            .sheet(isPresented: $shipsEdit) {
                NumberEditSheet(title: "\(f.name)船只", unit: "艘", value: Double(f.ships), range: 1...10) { v in
                    shipsEdit = false
                    Task { feedback = await model.editFleet(f.id, ships: Int(v.rounded()), name: nil) ?? "已整编为 \(min(10, max(1, Int(v.rounded())))) 艘" }
                }
                .presentationDetents([.height(370)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet).font(Theme.section)
            }
            .sheet(isPresented: $renaming) {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "舰队更名", subtitle: "现名 \(f.name)", seal: "改")
                    TextField("", text: $newName).paperField().padding(.horizontal, Theme.Layout.pageInset)
                    SealButton(title: "颁行", disabled: newName.trimmingCharacters(in: .whitespaces).isEmpty) {
                        renaming = false
                        Task { feedback = await model.editFleet(f.id, ships: nil, name: newName) ?? "已更名为\(newName)" }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 16)
                .presentationDetents([.height(280)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet).font(Theme.section)
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
                        Image(systemName: symbol).font(.system(size: 15, weight: .regular))
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
