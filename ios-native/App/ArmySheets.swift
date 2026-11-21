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
            RoundedRectangle(cornerRadius: 3).fill(army.nation >= 0 && army.nation < map.meta.nations.count ? Names.color(map.meta.nations[army.nation].color) : .gray).frame(width: 10, height: 30)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(army.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                    Text(Echelon.name(troops: army.troops, culture: map.meta.nations.indices.contains(army.nation) ? map.meta.nations[army.nation].culture : ""))
                        .font(Theme.caption).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.ink2, in: Capsule())
                    if let duty = army.duty.flatMap({ Self.duties[$0] }) {
                        Text(duty).font(Theme.caption).foregroundStyle(Theme.seal).padding(.horizontal, 5).padding(.vertical, 1)
                            .overlay(Capsule().stroke(Theme.seal.opacity(0.55), lineWidth: 0.8))
                    }
                }
                Text("\(Names.unit[army.unit] ?? army.unit) · \(map.meta.provinces.indices.contains(army.province) ? map.meta.provinces[army.province].name : "途中") · \(Names.status(army.status))\(Self.dest(map, army))").font(Theme.label).foregroundStyle(Theme.ink2)
            }
            Spacer()
            Text(Names.wan(army.troops)).font(Theme.section).foregroundStyle(Theme.ink)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
    }
}

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
    @State private var editing = false
    @State private var merging = false
    @State private var renaming = false
    @State private var disbanding = false
    @State private var newName = ""
    @State private var troopsText = ""
    @State private var unit = ""
    @State private var morale = 100.0
    static let units = UnitKinds.kinds.map { ($0.key, $0.name) }
    var body: some View {
        if let map = model.map, let resolved = model.resolveArmy(id: armyId, fallback: army) {
            let armyIndex = resolved.index
            let a = resolved.army
            let nation = a.nation >= 0 && a.nation < map.meta.nations.count ? map.meta.nations[a.nation] : nil
            let tint = nation.map { Names.color($0.color) } ?? Theme.ink2
            let fighting = a.status == "fighting"
            ScrollView {
                LazyVStack(spacing: 14) {
                    SheetGrabber()
                    // 军牌: the unit's mark in its state's colour beside the name.
                    HStack(spacing: 14) {
                        UnitMark(unit: a.unit, color: tint).frame(width: 46, height: 46)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(a.name).font(Theme.kai(26)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                            HStack(spacing: 6) {
                                RoundedRectangle(cornerRadius: 2).fill(tint).frame(width: 10, height: 10)
                                Text("\(nation?.name ?? "") · \(model.state.map { Echelon.designation($0, map, army: armyIndex) } ?? "") · \(Names.unit[a.unit] ?? a.unit)").font(Theme.label).foregroundStyle(Theme.ink2)
                            }
                        }
                        Spacer()
                        Button(action: locate) { InkIcon(glyph: .locate, size: 19, weight: 1.75, accent: Theme.seal.opacity(0.24)).foregroundStyle(Theme.seal).frame(width: 42, height: 42).background(Theme.seal.opacity(0.08), in: Circle()) }
                            .buttonStyle(PressStyle()).accessibilityLabel("定位")
                    }
                    .padding(.horizontal, Theme.Layout.sectionInset).padding(.top, 2)
                    // The arm's strengths and weaknesses, and who leads it.
                    VStack(alignment: .leading, spacing: 4) {
                        if let k = UnitKinds.byKey[a.unit] { Text(k.note).font(Theme.label).foregroundStyle(Theme.ink2) }
                        if let c = a.commander { Text(a.banner == "ruler" ? "御驾亲征：\(c)" : "主将：\(c)").font(Theme.label).foregroundStyle(a.banner == "ruler" ? Theme.seal : Theme.ink) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, Theme.Layout.sectionInset)
                    StatStrip(tiles: [
                        StatTile(label: "编制", value: Echelon.name(troops: a.troops, culture: nation?.culture ?? "")),
                        StatTile(label: "兵力", value: Names.wan(a.troops)),
                        StatTile(label: "士气", value: "\(a.morale)", fraction: Double(a.morale) / 100, warn: a.morale < 30),
                        StatTile(label: "粮草", value: "\(a.supplies)", fraction: Double(min(100, a.supplies)) / 100, warn: a.supplies <= 10),
                    ])
                    // Status as one plain line instead of a table.
                    HStack(spacing: 8) {
                        Text(fighting ? "交战中" : a.travel == "moving" ? "行军中" : Names.status(a.status)).font(Theme.label).foregroundStyle(Theme.paper2)
                            .padding(.horizontal, 8).padding(.vertical, 3).background(fighting ? Theme.seal : Theme.ink2, in: Capsule())
                        Text(map.meta.provinces.indices.contains(a.province) ? map.meta.provinces[a.province].name : "途中").font(Theme.body).foregroundStyle(Theme.ink)
                        if let d = a.destination, d >= 0, d < map.meta.provinces.count {
                            Image(systemName: "arrow.right").font(.system(size: 11, weight: .regular)).foregroundStyle(Theme.ink2)
                            Text(map.meta.provinces[d].name).font(Theme.body).foregroundStyle(Theme.seal)
                        }
                        Spacer()
                        Text(ArmyRow.command(a)).font(Theme.label).foregroundStyle(Theme.ink2)
                    }
                    .padding(.horizontal, Theme.Layout.sectionInset)
                    HStack(spacing: 10) {
                        Button(action: onMarch) { PrimaryLabel(title: "调兵", symbol: "arrow.triangle.turn.up.right.diamond") }.disabled(fighting).opacity(fighting ? 0.5 : 1)
                        Button(action: onRetreat) { SecondaryLabel(title: "撤退", symbol: "arrow.uturn.backward") }
                        if a.travel == "moving" || a.travel == "blocked" { Button(action: onHalt) { SecondaryLabel(title: "停止", symbol: "stop.fill") }.transition(.scale.combined(with: .opacity)) }
                    }
                    .buttonStyle(.plain).padding(.horizontal, 16)
                    .animation(Motion.tap, value: a.travel)
                    // 军令: command, stance and the army's own changes, in one grid of paper chips.
                    let peers = (model.state?.armies ?? []).enumerated().filter { $0.element.id != a.id && $0.element.nation == a.nation && $0.element.province == a.province && $0.element.province >= 0 && $0.element.status != "fighting" }
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
                    .padding(.horizontal, 16)
                    .confirmationDialog("解散\(a.name)？", isPresented: $disbanding, titleVisibility: .visible) {
                        Button("解散（\(a.troops) 人回乡）", role: .destructive) { act("disbandArmy", a) }
                    }
                    .sheet(isPresented: $merging) {
                        VStack(alignment: .leading, spacing: 12) {
                            SheetHeader(title: "合兵", subtitle: "\(a.name)并入同州郡的本国军队", seal: "合")
                            Group2 {
                                ForEach(peers, id: \.element.id) { p in
                                    Button { merging = false; act("mergeArmy", a, text: p.element.id) } label: {
                                        HStack { Text(p.element.name).font(Theme.section).foregroundStyle(Theme.ink); Spacer(); Text("\(Names.wan(p.element.troops)) 兵").font(Theme.label).foregroundStyle(Theme.ink2) }
                                            .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    if p.element.id != peers.last?.element.id { Divider2() }
                                }
                            }
                            .padding(.horizontal, 16)
                            Spacer(minLength: 0)
                        }
                        .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
                    }
                    .sheet(isPresented: $renaming) {
                        VStack(alignment: .leading, spacing: 14) {
                            SheetHeader(title: "军队更名", subtitle: "现名 \(a.name)", seal: "改")
                            TextField("", text: $newName).paperField().padding(.horizontal, Theme.Layout.pageInset)
                            SealButton(title: "颁行", disabled: newName.trimmingCharacters(in: .whitespaces).isEmpty) { renaming = false; act("renameArmy", a, text: newName) }
                                .padding(.horizontal, Theme.Layout.pageInset)
                        }
                        .padding(.bottom, 16)
                        .presentationDetents([.height(280)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
                    }
                    if a.province >= 0, let s = model.state { BattleBoard(province: a.province, state: s, map: map, focusNation: a.nation) }
                    ArmyServiceView(model: model, army: a)
                    // 整编 (custom): strength, arm and morale.
                    Button { withAnimation(Motion.panel) { editing.toggle() } } label: {
                        HStack { Text("整编（自定义）").font(Theme.body).foregroundStyle(Theme.ink); Spacer(); Image(systemName: editing ? "chevron.up" : "chevron.down").font(.system(size: 13, weight: .regular)).foregroundStyle(Theme.ink2) }
                            .padding(.horizontal, Theme.Layout.sectionInset).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if editing {
                        Group2 {
                            HStack(spacing: 8) {
                                Text("兵力").font(Theme.body).foregroundStyle(Theme.ink)
                                Spacer()
                                ForEach([-5000, -1000], id: \.self) { d in stepButton(d, a.troops) }
                                TextField("", text: $troopsText, prompt: Text("\(a.troops)").foregroundColor(Theme.ink2.opacity(0.6)))
                                    .font(Theme.section).keyboardType(.numberPad).multilineTextAlignment(.center).frame(width: 84)
                                    .padding(.vertical, 5).background(Theme.paper2, in: RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.line))
                                ForEach([1000, 5000], id: \.self) { d in stepButton(d, a.troops) }
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            Divider2()
                            UnitGrid(selection: $unit).padding(.horizontal, 12).padding(.vertical, 10)
                            Divider2()
                            PaperSlider(title: "士气", value: $morale, range: 0...100, step: 1) { "\(Int($0))" }
                                .padding(.horizontal, 16).padding(.vertical, 8)
                            Divider2()
                            Button {
                                let troops = Int(troopsText)
                                Task {
                                    let error = await model.editArmy(a.id, troops: troops, unit: unit == a.unit ? nil : unit, morale: morale)
                                    say(error ?? "\(a.name)已整编"); GameFeel.shared.notify(error == nil ? .success : .error)
                                    if error == nil { troopsText = "" }
                                }
                            } label: { Text("颁行").font(Theme.section).foregroundStyle(Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 11) }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 16)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                        .onAppear { unit = a.unit; morale = Double(a.morale) }
                    }
                }
                .padding(.bottom, 24)
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
    /// Runs one army order and says what happened.
    private func act(_ action: String, _ a: GameState.Army, text: String = "", flag: Bool = false) {
        Task {
            let out = await model.armyAction(action, armyId: a.id, text: text, flag: flag)
            say(out.message); GameFeel.shared.notify(out.ok ? .success : .error)
        }
    }
    private func stepButton(_ delta: Int, _ current: Int) -> some View {
        Button {
            let base = Int(troopsText) ?? current
            troopsText = String(max(1, base + delta))
        } label: {
            Text(delta > 0 ? "+\(delta / 1000)k" : "\(delta / 1000)k").font(Theme.label).foregroundStyle(Theme.ink)
                .frame(width: 38, height: 30).background(Theme.paper2, in: RoundedRectangle(cornerRadius: 7)).overlay(RoundedRectangle(cornerRadius: 7).stroke(Theme.line))
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
        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(color.opacity(0.6), lineWidth: 1.2))
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
                    .padding(.horizontal, 16)

                    HStack {
                        Text("停留港口").font(Theme.section).foregroundStyle(Theme.ink)
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
                                    if item.port.province == f.port { Text("现泊").font(Theme.caption).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.ink2, in: Capsule()) }
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
                    .padding(.horizontal, 16)

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
                    .buttonStyle(.plain).padding(.horizontal, 16)
                    .animation(Motion.fade, value: target)
                    if f.status != "lost" {
                        let mine = f.manual || !f.patrol
                        Button {
                            Task { let out = await model.armyAction("fleetManual", armyId: f.id, flag: !mine); feedback = out.message }
                        } label: { SecondaryLabel(title: mine ? "交还 AI 自主巡防" : "亲自指挥", symbol: mine ? "cpu" : "person.fill") }
                        .buttonStyle(.plain).padding(.horizontal, 16)
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
                .presentationDetents([.height(370)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.section)
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
                .presentationDetents([.height(280)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.section)
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
                        InkIcon(glyph: g, size: 17, weight: 1.7)
                    } else {
                        Image(systemName: symbol).font(.system(size: 15, weight: .regular))
                    }
                }
                .frame(height: 19)
                Text(title).font(Theme.label).lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(danger ? Theme.seal : Theme.ink)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(Theme.paper2.opacity(0.9), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(danger ? Theme.seal.opacity(0.4) : Theme.line))
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
                    Button { selection = k.key } label: {
                        Text(k.name).font(Theme.label).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity).frame(height: 34)
                            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(on ? Color.clear : Theme.line))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            if let k = UnitKinds.byKey[selection] { Text(k.note).font(Theme.label).foregroundStyle(Theme.ink2) }
        }
    }
}
