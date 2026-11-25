import SwiftUI
import LieguojiCore

// MARK: - Decodable Payloads (Pack 2: 透明数值拆解 / 战前实力双边对比)

struct BreakdownLine: Decodable, Identifiable {
    let label: String
    let value: String
    let tone: String
    var id: String { "\(label)|\(value)" }
}

struct NationBreakdownData: Decodable {
    let tax: [BreakdownLine]
    let military: [BreakdownLine]
    let naval: [BreakdownLine]
    let stability: [BreakdownLine]
}

struct ProvinceBreakdownData: Decodable {
    let items: [BreakdownLine]
}

struct WarCompareData: Decodable {
    struct Side: Decodable {
        let name: String
        let provinces: Int
        let armies: Int
        let troops: Int
        let ships: Int
        let gold: Int
        let milTech: Int
        let navTech: Int
        let seaControl: Int
        let seaLabel: String
        let defeatShock: Int
        let reputation: Int
        let allyCount: Int
        let allyNames: [String]
        let allyTroops: Int
    }
    let attacker: Side
    let defender: Side
    let breaksTreaty: Bool
    let reputationImpact: Int
    let warning: String
}

// MARK: - GameModel Pack 2 RPC Bridges

extension GameModel {
    func setArmyFormation(armyId: String, formation: String) async -> (ok: Bool, message: String) {
        let out = await armyAction("setArmyFormation", armyId: armyId, text: formation)
        if out.ok { GameFeel.shared.orderMarch() }
        return out
    }

    func setArmyFieldOrder(armyId: String, order: String) async -> (ok: Bool, message: String) {
        let out = await armyAction("setArmyFieldOrder", armyId: armyId, text: order)
        if out.ok { GameFeel.shared.orderMarch() }
        return out
    }

    func upgradeShipyard(province: Int) async -> String? {
        let err = await edit("upgradeShipyard", ["province": province])
        if err == nil { GameFeel.shared.orderAnchor() }
        return err
    }

    func queueShipbuilding(nation: Int, province: Int, fleetId: String?, spec: String) async -> String? {
        var args: [String: Any] = ["n": nation, "province": province, "spec": spec]
        if let fleetId, !fleetId.isEmpty { args["fleetId"] = fleetId }
        let err = await edit("queueShipbuilding", args)
        if err == nil { GameFeel.shared.orderAnchor() }
        return err
    }

    func setNationNavalDoctrine(nation: Int, mission: String) async -> String? {
        let err = await edit("nationNavalDoctrine", ["n": nation, "text": mission])
        if err == nil { GameFeel.shared.orderAnchor() }
        return err
    }

    func buildProvinceInfra(province: Int, slot: String) async -> String? {
        let err = await edit("buildProvinceInfra", ["province": province, "slot": slot])
        if err == nil { GameFeel.shared.tap() }
        return err
    }

    func investTech(nation: Int, branch: String) async -> String? {
        let err = await edit("investTech", ["n": nation, "branch": branch])
        if err == nil { GameFeel.shared.tap() }
        return err
    }

    func resolveEventChain(nation: Int, chainId: String, choice: String) async -> String? {
        let err = await edit("resolveEventChain", ["n": nation, "chainId": chainId, "choice": choice])
        if err == nil { GameFeel.shared.scrollOpen() }
        return err
    }

    func nationBreakdown(_ nation: Int) async -> NationBreakdownData? {
        await query(NationBreakdownData.self) { await self.native.nationBreakdown(nation) }
    }

    func provinceBreakdown(_ province: Int) async -> ProvinceBreakdownData? {
        await query(ProvinceBreakdownData.self) { await self.native.provinceBreakdown(province) }
    }

    func warCompare(attacker: Int, defender: Int) async -> WarCompareData? {
        await query(WarCompareData.self) { await self.native.warCompare(attacker: attacker, defender: defender) }
    }
}

// MARK: - 1. 全核心数值透明修正拆解弹窗（Unciv / Paradox 风格）

struct NationBreakdownSheet: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let nationName: String
    @State private var data: NationBreakdownData?
    @State private var tab = "tax"
    @Environment(\.dismiss) private var dismiss

    private func rows(_ d: NationBreakdownData) -> [BreakdownLine] {
        switch tab {
        case "military": return d.military
        case "naval": return d.naval
        case "stability": return d.stability
        default: return d.tax
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "数值明细拆解", subtitle: "\(nationName) · 各项实时修正因子", seal: "算")
                ChipPicker(items: [("tax", "财政月税"), ("military", "陆军战力"), ("naval", "海军制海"), ("stability", "安定信誉")], selection: $tab)
                    .padding(.horizontal, Theme.Layout.pageInset)

                if let data {
                    BreakdownCard(lines: rows(data))
                        .padding(.horizontal, Theme.Layout.pageInset)
                } else {
                    PanelPending(failed: false, busy: true) { Task { self.data = await model.nationBreakdown(nation) } }
                }
            }
            .padding(.bottom, 32)
        }
        .scrollContentBackground(.hidden)
        .ignoresSafeArea(.container, edges: .bottom)
        .task { data = await model.nationBreakdown(nation) }
    }
}

struct ProvinceBreakdownSheet: View {
    @ObservedObject var model: GameModel
    let province: Int
    let provinceName: String
    @State private var data: ProvinceBreakdownData?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "州郡明细拆解", subtitle: "\(provinceName) · 地形、特产与基建实效", seal: "算")
                if let data {
                    BreakdownCard(lines: data.items)
                        .padding(.horizontal, Theme.Layout.pageInset)
                } else {
                    PanelPending(failed: false, busy: true) { Task { self.data = await model.provinceBreakdown(province) } }
                }
            }
            .padding(.bottom, 32)
        }
        .scrollContentBackground(.hidden)
        .ignoresSafeArea(.container, edges: .bottom)
        .task { data = await model.provinceBreakdown(province) }
    }
}

struct BreakdownCard: View {
    let lines: [BreakdownLine]
    private func toneColor(_ tone: String) -> Color {
        switch tone {
        case "good": return Theme.jade
        case "bad": return Theme.seal
        default: return Theme.ink
        }
    }
    var body: some View {
        Group2 {
            if lines.isEmpty {
                Text("暂无有效修正项").font(Theme.body).foregroundStyle(Theme.ink2)
                    .frame(maxWidth: .infinity).padding(.vertical, 16)
            } else {
                ForEach(Array(lines.enumerated()), id: \.element.id) { idx, line in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Circle()
                            .fill(toneColor(line.tone).opacity(0.75))
                            .frame(width: 6, height: 6)
                        Text(line.label)
                            .font(Theme.body).foregroundStyle(Theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        Text(line.value)
                            .font(Theme.label).foregroundStyle(toneColor(line.tone))
                            .monospacedDigit()
                            .multilineTextAlignment(.trailing)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    if idx < lines.count - 1 { Divider2() }
                }
            }
        }
    }
}

// MARK: - 2. 宣战前「敌我双边实力对比卡」

struct WarCompareSheet: View {
    @ObservedObject var model: GameModel
    let attacker: Int
    let defender: Int
    let onConfirm: () -> Void
    let onCancel: () -> Void
    @State private var data: WarCompareData?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "战前实力评估", subtitle: "权衡双方兵力、水师、盟友与国际信誉", seal: "战")
                let compareClip = InkVideoStage.pick(from: ["herald-ultimatum", "herald-camp-muster", "herald-war", "herald-cavalry", "herald-beacon"], seed: attacker &* 31 &+ defender)
                if InkVideoStage.hasVideo(compareClip) {
                    InkVideoStage(clip: compareClip, cornerRadius: 12, tint: Theme.seal)
                        .frame(height: 64)
                        .padding(.horizontal, Theme.Layout.pageInset)
                }

                if let d = data {
                    Group2 {
                        VStack(spacing: 0) {
                            HStack {
                                Text(d.attacker.name).font(Theme.section).foregroundStyle(Theme.jade).frame(maxWidth: .infinity, alignment: .leading)
                                Text("对比项").font(Theme.caption).foregroundStyle(Theme.ink2)
                                Text(d.defender.name).font(Theme.section).foregroundStyle(Theme.seal).frame(maxWidth: .infinity, alignment: .trailing)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 11)
                            Divider2()
                            compareRow("疆土州郡", "\(d.attacker.provinces) 州", "\(d.defender.provinces) 州", leftWins: d.attacker.provinces >= d.defender.provinces)
                            Divider2()
                            compareRow("常备兵力", "\(Names.wan(d.attacker.troops))（\(d.attacker.armies)军）", "\(Names.wan(d.defender.troops))（\(d.defender.armies)军）", leftWins: d.attacker.troops >= d.defender.troops)
                            Divider2()
                            compareRow("水师舰船", "\(d.attacker.ships) 艘 · \(d.attacker.seaControl)%", "\(d.defender.ships) 艘 · \(d.defender.seaControl)%", leftWins: d.attacker.ships >= d.defender.ships)
                            Divider2()
                            compareRow("军备/航海", "\(d.attacker.milTech)阶 / \(d.attacker.navTech)阶", "\(d.defender.milTech)阶 / \(d.defender.navTech)阶", leftWins: (d.attacker.milTech + d.attacker.navTech) >= (d.defender.milTech + d.defender.navTech))
                            Divider2()
                            compareRow("国库军资", "\(Names.wan(d.attacker.gold)) 金", "\(Names.wan(d.defender.gold)) 金", leftWins: d.attacker.gold >= d.defender.gold)
                            Divider2()
                            compareRow("预计盟援", d.attacker.allyCount > 0 ? "\(d.attacker.allyCount)国(\(Names.wan(d.attacker.allyTroops)))" : "孤军",
                                       d.defender.allyCount > 0 ? "\(d.defender.allyCount)国(\(Names.wan(d.defender.allyTroops)))" : "无援",
                                       leftWins: d.attacker.allyTroops >= d.defender.allyTroops)
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)

                    if !d.defender.allyNames.isEmpty {
                        Group2 {
                            HStack(spacing: 8) {
                                InkIcon(glyph: .alliance, size: 15, weight: 1.75).foregroundStyle(Theme.seal)
                                Text("敌方可能响应参战盟友：\(d.defender.allyNames.joined(separator: "、"))")
                                    .font(Theme.caption).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    Group2 {
                        HStack(alignment: .top, spacing: 8) {
                            InkIcon(glyph: .war, size: 15, weight: 1.8).foregroundStyle(d.breaksTreaty ? Theme.danger : Theme.ink2)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(d.warning)
                                    .font(Theme.caption)
                                    .foregroundStyle(d.breaksTreaty ? Theme.danger : Theme.ink2)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text("外交信誉影响：\(d.reputationImpact)")
                                    .font(Theme.caption)
                                    .foregroundStyle(d.breaksTreaty ? Theme.danger : Theme.ink2)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)

                    HStack(spacing: 10) {
                        Button(action: onCancel) {
                            SecondaryLabel(title: "暂缓用兵", symbol: "xmark")
                        }
                        Button {
                            GameFeel.shared.notify(.warning)
                            onConfirm()
                        } label: {
                            PrimaryLabel(title: d.breaksTreaty ? "毁约强宣" : "正式宣战", symbol: "flame.fill")
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, Theme.Layout.pageInset)
                } else {
                    PanelPending(failed: false, busy: true) { Task { data = await model.warCompare(attacker: attacker, defender: defender) } }
                }
            }
            .padding(.bottom, 32)
        }
        .scrollContentBackground(.hidden)
        .ignoresSafeArea(.container, edges: .bottom)
        .task { data = await model.warCompare(attacker: attacker, defender: defender) }
    }

    private func compareRow(_ label: String, _ left: String, _ right: String, leftWins: Bool) -> some View {
        HStack(spacing: 6) {
            Text(left).font(Theme.label).foregroundStyle(leftWins ? Theme.jade : Theme.ink).monospacedDigit()
                .frame(maxWidth: .infinity, alignment: .leading).lineLimit(1).minimumScaleFactor(0.75)
            Text(label).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize()
            Text(right).font(Theme.label).foregroundStyle(!leftWins ? Theme.seal : Theme.ink).monospacedDigit()
                .frame(maxWidth: .infinity, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.75)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
    }
}

// MARK: - 3. 陆军深度战术面板（五阵型 / 四野战指令 / 精锐勋阶 / 补给线 / 兵种克制）

struct ArmyTacticsPanel: View {
    @ObservedObject var model: GameModel
    let army: GameState.Army
    let map: WorldMap
    let onMessage: (String) -> Void
    @State private var busy = false

    private var activeFormation: String { army.formation ?? "standard" }
    private var activeOrder: String { army.fieldOrder ?? "normal" }

    var body: some View {
        let counter = ArmyTactics.counterReport(for: army.unit)
        let strongText = counter.strong.isEmpty ? "均衡交锋" : counter.strong.joined(separator: " · ")
        let weakText = counter.weak.isEmpty ? "无明显短板" : counter.weak.joined(separator: " · ")
        let supState = ArmyTactics.SupplyState(rawValue: army.supplyState ?? "full") ?? .full
        let supColor: Color = supState == .cut ? Theme.danger : supState == .strained ? Theme.gold : Theme.jade
        let originName: String? = {
            guard let oi = army.supplyOriginProvince, map.meta.provinces.indices.contains(oi) else { return nil }
            return map.meta.provinces[oi].name
        }()

        // 精锐勋阶 + 实时补给线 + 兵种克制情报卡
        Group2 {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 7) {
                    let tier = army.veterancy ?? 0
                    PaperTag(text: army.veterancyLabel ?? "新募", color: tier >= 2 ? Theme.gold : Theme.ink2, size: 11)
                    if tier > 0 {
                        Text("战功 +\(tier * 6)% 攻 · 减伤 \(tier * 4)%").font(Theme.caption).foregroundStyle(Theme.ink2)
                    } else {
                        Text("历战积累可晋升精锐/百战/虎贲").font(Theme.caption).foregroundStyle(Theme.ink2)
                    }
                    Spacer(minLength: 4)
                    PaperTag(text: supState.label, color: supColor, size: 11)
                }
                if let originName {
                    Text("后勤粮道：由 \(originName) 供粮 · \(supState == .cut ? "深入敌境失联，士气与兵员持续损耗" : supState == .strained ? "补给线拉长，宜防敌军截断" : "补给充裕，每月自然补员")")
                        .font(Theme.caption).foregroundStyle(supColor).fixedSize(horizontal: false, vertical: true)
                }
                Divider2()
                HStack(spacing: 8) {
                    Text("克制").font(Theme.caption).foregroundStyle(Theme.jade)
                    Text(strongText).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.76)
                    Spacer(minLength: 4)
                    Text("畏惧").font(Theme.caption).foregroundStyle(Theme.seal)
                    Text(weakText).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.76)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        // 战阵选择（五阵）
        SectionLabel("临阵阵型（影响攻防、速度与耗粮）")
        Group2 {
            VStack(alignment: .leading, spacing: 8) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                    ForEach(ArmyTactics.Formation.allCases, id: \.rawValue) { f in
                        let on = activeFormation == f.rawValue
                        Button {
                            guard !busy, !on else { return }
                            busy = true
                            Task {
                                let out = await model.setArmyFormation(armyId: army.id, formation: f.rawValue)
                                onMessage(out.message)
                                busy = false
                            }
                        } label: {
                            VStack(spacing: 2) {
                                Text(f.label).font(Theme.label).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1).minimumScaleFactor(0.8)
                                Text(f.short).font(Theme.kai(10)).foregroundStyle(on ? Theme.paper2.opacity(0.92) : Theme.ink2).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 7).padding(.horizontal, 4)
                            .background(on ? Theme.seal : Theme.paper.opacity(0.65), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(on ? Theme.seal : Theme.ink.opacity(0.12), lineWidth: 0.8))
                        }
                        .buttonStyle(PressStyle()).disabled(busy)
                    }
                }
                if let curF = ArmyTactics.Formation(rawValue: activeFormation) {
                    Text("当前阵效：\(curF.note)").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
            }
            .padding(10)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        // 野战军令（四令）
        SectionLabel("野战专项军令")
        Group2 {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                ForEach(ArmyTactics.FieldOrder.allCases, id: \.rawValue) { ord in
                    let on = activeOrder == ord.rawValue
                    Button {
                        guard !busy, !on else { return }
                        busy = true
                        Task {
                            let out = await model.setArmyFieldOrder(armyId: army.id, order: ord.rawValue)
                            onMessage(out.message)
                            busy = false
                        }
                    } label: {
                        HStack(spacing: 6) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ord.label).font(Theme.label).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                Text(ord.note).font(Theme.kai(10)).foregroundStyle(on ? Theme.paper2.opacity(0.9) : Theme.ink2).lineLimit(1).minimumScaleFactor(0.75)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 8)
                        .background(on ? Theme.jade : Theme.paper.opacity(0.65), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(on ? Theme.jade : Theme.ink.opacity(0.12), lineWidth: 0.8))
                    }
                    .buttonStyle(PressStyle()).disabled(busy)
                }
            }
            .padding(10)
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }
}

// MARK: - 4. 海军船坞建造与提督专精面板

struct FleetShipyardPanel: View {
    @ObservedObject var model: GameModel
    let fleet: GameState.Fleet
    let map: WorldMap
    let onMessage: (String) -> Void
    @State private var busy = false
    @State private var newHeavy = 2
    @State private var newLight = 1
    @State private var newGun = 1

    private var portProvince: Int { fleet.port }
    private var portName: String {
        map.meta.provinces.indices.contains(portProvince) ? (map.meta.provinces[portProvince].name + "港") : "母港"
    }

    var body: some View {
        let lvl = model.state?.ports?.first(where: { $0.province == portProvince })?.shipyardLevel ?? 1
        let maxCap = lvl >= 3 ? 12 : (lvl == 2 ? 8 : 5)
        let upgradeCost = lvl == 1 ? 260 : 480
        let newTotal = max(1, newHeavy + newLight + newGun)
        let newCost = newHeavy * 110 + newLight * 85 + newGun * 100
        let nationFleets = (model.state?.fleets ?? []).filter { $0.nation == fleet.nation && $0.status != "lost" }

        SectionLabel("全水师战略统调（共 \(nationFleets.count) 支舰队）")
        Group2 {
            VStack(alignment: .leading, spacing: 10) {
                Text("一键向本国全部现役舰队下达统一海域方略，便于跨海登陆护航或全线封港：")
                    .font(Theme.caption).foregroundStyle(Theme.ink2)
                HStack(spacing: 6) {
                    ForEach(MaritimeWarfare.FleetMission.allCases, id: \.rawValue) { m in
                        doctrineChip(m, nationFleets: nationFleets)
                    }
                }
            }
            .padding(14)
        }
        .padding(.horizontal, Theme.Layout.pageInset)

        SectionLabel("船坞扩建与自建舰队（\(portName)）")
        Group2 {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    PaperTag(text: "\(lvl)级船坞", color: lvl >= 3 ? Theme.gold : Theme.jade, size: 11)
                    Text("单舰队上限 \(maxCap) 艘 · 造舰提速 \(lvl == 1 ? "标准" : lvl == 2 ? "+25%" : "+45%")")
                        .font(Theme.caption).foregroundStyle(Theme.ink2)
                    Spacer(minLength: 4)
                    if lvl < 3 {
                        Button {
                            guard !busy, portProvince >= 0 else { return }
                            busy = true
                            Task {
                                let err = await model.upgradeShipyard(province: portProvince)
                                onMessage(err ?? "\(portName)船坞已扩建至 \(lvl + 1) 级")
                                busy = false
                            }
                        } label: {
                            Text("升\(lvl + 1)级·\(upgradeCost)金")
                                .font(Theme.caption).foregroundStyle(Theme.seal)
                                .padding(.horizontal, 9).padding(.vertical, 5)
                                .background(Theme.seal.opacity(0.08), in: Capsule())
                                .overlay(Capsule().stroke(Theme.seal.opacity(0.32), lineWidth: 0.7))
                        }
                        .buttonStyle(PressStyle()).disabled(busy)
                    } else {
                        PaperTag(text: "满级巨坞", color: Theme.gold, size: 10)
                    }
                }

                Divider2()
                Text("为本舰队快速增造单舰（完工自动编入）：")
                    .font(Theme.caption).foregroundStyle(Theme.ink2)

                HStack(spacing: 7) {
                    buildChip("增造主力×1", cost: "110金", spec: "1,0,0", targetFleet: fleet.id)
                    buildChip("增造快舰×1", cost: "85金", spec: "0,1,0", targetFleet: fleet.id)
                    buildChip("增造炮舰×1", cost: "100金", spec: "0,0,1", targetFleet: fleet.id)
                }

                Divider2()
                HStack {
                    Text("在本港自订新水师编成（1–8 艘）").font(Theme.caption).foregroundStyle(Theme.ink2)
                    Spacer()
                    Text("共 \(newTotal) 艘 · \(newCost)金").font(Theme.caption).foregroundStyle(Theme.seal).monospacedDigit()
                }
                HStack(spacing: 6) {
                    miniShipCounter(label: "主力", count: $newHeavy, others: newLight + newGun)
                    miniShipCounter(label: "快舰", count: $newLight, others: newHeavy + newGun)
                    miniShipCounter(label: "炮舰", count: $newGun, others: newHeavy + newLight)
                }

                Button {
                    guard !busy, portProvince >= 0 else { return }
                    busy = true
                    let spec = "\(newHeavy),\(newLight),\(newGun)"
                    Task {
                        let err = await model.queueShipbuilding(nation: fleet.nation, province: portProvince, fleetId: nil, spec: spec)
                        onMessage(err ?? "已在\(portName)船台立项编成全新水师（主\(newHeavy)/快\(newLight)/炮\(newGun)）")
                        busy = false
                    }
                } label: {
                    HStack(spacing: 6) {
                        PhosphorIcon(glyph: .anchor, size: 14, weight: .light)
                        Text("立项另建新舰队（主\(newHeavy)/快\(newLight)/炮\(newGun) · \(newCost)金）").font(Theme.label)
                    }
                    .foregroundStyle(Theme.paperLight)
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(Theme.seal, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(PressStyle()).disabled(busy || portProvince < 0)
            }
            .padding(14)
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    private func doctrineChip(_ m: MaritimeWarfare.FleetMission, nationFleets: [GameState.Fleet]) -> some View {
        let shortTitle: String
        switch m {
        case .patrol: shortTitle = "巡弋"
        case .escort: shortTitle = "护航"
        case .blockade: shortTitle = "封锁"
        case .raid: shortTitle = "破交"
        case .refit: shortTitle = "修整"
        }
        let isAllOn = !nationFleets.isEmpty && nationFleets.allSatisfy { ($0.mission ?? "patrol") == m.rawValue }
        return Button {
            guard !busy else { return }
            busy = true
            Task {
                let err = await model.setNationNavalDoctrine(nation: fleet.nation, mission: m.rawValue)
                onMessage(err ?? "本国全水师已统一奉行「\(m.label)」方略")
                busy = false
            }
        } label: {
            Text(shortTitle)
                .font(Theme.caption)
                .foregroundStyle(isAllOn ? Theme.paperLight : Theme.ink)
                .frame(maxWidth: .infinity).padding(.vertical, 7)
                .background(isAllOn ? Theme.seal : Theme.wash.opacity(0.65), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(isAllOn ? Color.clear : Theme.hairline, lineWidth: 0.7))
        }
        .buttonStyle(PressStyle()).disabled(busy)
    }

    private func miniShipCounter(label: String, count: Binding<Int>, others: Int) -> some View {
        HStack(spacing: 4) {
            Text(label).font(Theme.caption).foregroundStyle(Theme.ink2)
            Spacer(minLength: 2)
            Button {
                GameFeel.shared.tap()
                if count.wrappedValue > 0 && count.wrappedValue + others > 1 { count.wrappedValue -= 1 }
            } label: {
                Text("−").font(Theme.label).foregroundStyle(Theme.ink)
                    .frame(width: 22, height: 22)
                    .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
            }.buttonStyle(.plain)
            Text("\(count.wrappedValue)").font(Theme.label).foregroundStyle(Theme.ink).monospacedDigit().frame(minWidth: 14)
            Button {
                GameFeel.shared.tap()
                if count.wrappedValue + others < 8 { count.wrappedValue += 1 }
            } label: {
                Text("+").font(Theme.label).foregroundStyle(Theme.ink)
                    .frame(width: 22, height: 22)
                    .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 7).padding(.vertical, 6)
        .frame(maxWidth: .infinity)
        .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(Theme.hairline, lineWidth: 0.65))
    }

    private func buildChip(_ title: String, cost: String, spec: String, targetFleet: String) -> some View {
        Button {
            guard !busy, portProvince >= 0 else { return }
            busy = true
            Task {
                let err = await model.queueShipbuilding(nation: fleet.nation, province: portProvince, fleetId: targetFleet, spec: spec)
                onMessage(err ?? "船台已开工：\(title)")
                busy = false
            }
        } label: {
            VStack(spacing: 2) {
                Text(title).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.8)
                Text(cost).font(Theme.kai(10.5)).foregroundStyle(Theme.ink2)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 7).padding(.horizontal, 4)
            .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(Theme.hairline, lineWidth: 0.65))
        }
        .buttonStyle(PressStyle()).disabled(busy || portProvince < 0)
    }
}

// MARK: - 5. 州郡五槽基建与特产战略实效面板

struct ProvinceInfraSection: View {
    @ObservedObject var model: GameModel
    let province: Int
    let info: ProvinceInfo
    let onRefresh: () async -> Void
    let onMessage: (String) -> Void
    @State private var busy = false

    var body: some View {
        if let effect = info.specialtyEffect, !effect.isEmpty {
            Group2 {
                HStack(spacing: 8) {
                    PaperTag(text: info.specialtyTier ?? "战略特产", color: Theme.gold, size: 11)
                    Text("\(info.specialty ?? "物产")：\(effect)")
                        .font(Theme.caption).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        if let slots = info.infra, !slots.isEmpty {
            SectionLabel("州郡五槽营建（水利 / 商埠 / 城垣 / 船坞 / 书院）")
            Group2 {
                VStack(spacing: 0) {
                    ForEach(Array(slots.enumerated()), id: \.element.id) { idx, row in
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 6) {
                                    Text(row.label).font(Theme.body).foregroundStyle(Theme.ink)
                                    HStack(spacing: 3) {
                                        ForEach(1...3, id: \.self) { lv in
                                            Circle()
                                                .fill(lv <= row.level ? Theme.jade : Theme.ink.opacity(0.14))
                                                .frame(width: 6, height: 6)
                                        }
                                    }
                                    Text("Lv.\(row.level)").font(Theme.caption).foregroundStyle(row.level > 0 ? Theme.jade : Theme.ink2).monospacedDigit()
                                }
                                Text(row.effect).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8)
                            }
                            Spacer(minLength: 6)
                            if row.level >= 3 {
                                PaperTag(text: "满级", color: Theme.gold, size: 10)
                            } else if row.available {
                                Button {
                                    guard !busy else { return }
                                    busy = true
                                    Task {
                                        let err = await model.buildProvinceInfra(province: province, slot: row.id)
                                        onMessage(err ?? "已兴建 \(row.level + 1) 级\(row.label)")
                                        await onRefresh()
                                        busy = false
                                    }
                                } label: {
                                    Text("建\(row.level + 1)级 · \(row.cost)金")
                                        .font(Theme.caption).foregroundStyle(Theme.seal)
                                        .padding(.horizontal, 9).padding(.vertical, 5)
                                        .background(Theme.seal.opacity(0.09), in: Capsule())
                                        .overlay(Capsule().stroke(Theme.seal.opacity(0.32), lineWidth: 0.75))
                                }
                                .buttonStyle(PressStyle()).disabled(busy)
                            } else {
                                Text("需沿海港").font(Theme.caption).foregroundStyle(Theme.ink2)
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        if idx < slots.count - 1 { Divider2() }
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }
}

// MARK: - 6. 国家四线科技演进、外交信誉与多阶段因果事件链面板

struct NationDepthSection: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let info: NationInfo
    let onReload: () async -> Void
    let onMessage: (String) -> Void
    @State private var busy = false

    private func chainClip(_ cat: String, id: String) -> String {
        let seed = abs(id.hashValue)
        switch cat {
        case "voyage": return InkVideoStage.pick(from: ["herald-voyage", "herald-voyage-fleet", "herald-harbor-trade", "herald-longship-raid"], seed: seed)
        case "reform": return InkVideoStage.pick(from: ["herald-reform", "herald-exam-hall", "herald-library", "herald-parliament", "herald-mint"], seed: seed)
        case "relief": return InkVideoStage.pick(from: ["herald-relief", "herald-festival", "herald-silkroad", "herald-locust"], seed: seed)
        case "war": return InkVideoStage.pick(from: ["herald-war", "herald-cavalry", "herald-artillery", "herald-camp-muster", "herald-beacon"], seed: seed)
        case "politics": return InkVideoStage.pick(from: ["herald-senate", "herald-coronation", "herald-succession", "herald-spy", "herald-banquet"], seed: seed)
        default: return InkVideoStage.pick(from: ["herald-regime", "herald-vassal-tribute", "herald-cathedral", "herald-monastery", "herald-comet"], seed: seed)
        }
    }

    var body: some View {
        // 1. 待裁决的多阶段因果事件链（含 6 个月后因果回响）
        if let chain = info.activeChain, info.alive {
            SectionLabel("国是大事 · 因果抉择")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    let clip = chainClip(chain.category, id: chain.id)
                    if InkVideoStage.hasVideo(clip) {
                        InkVideoStage(clip: clip, cornerRadius: 10, tint: Theme.seal)
                            .frame(height: 62)
                    }
                    HStack(spacing: 6) {
                        PaperTag(text: "因果链", color: Theme.seal, size: 10)
                        Text(chain.title).font(Theme.section).foregroundStyle(Theme.ink)
                        Spacer()
                    }
                    Text(chain.desc)
                        .font(Theme.caption).foregroundStyle(Theme.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(chain.choices) { ch in
                        Button {
                            guard !busy else { return }
                            busy = true
                            Task {
                                let err = await model.resolveEventChain(nation: nation, chainId: chain.id, choice: ch.id)
                                onMessage(err ?? "已颁行「\(ch.label)」")
                                await onReload()
                                busy = false
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 6) {
                                    Text(ch.label).font(Theme.body).foregroundStyle(Theme.ink)
                                    PaperTag(text: ch.tag, color: ch.id == "a" ? Theme.seal : Theme.jade, size: 10)
                                    Spacer()
                                    InkIcon(glyph: .chevronRight, size: 11, weight: 1.8).foregroundStyle(Theme.seal)
                                }
                                Text(ch.detail).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.horizontal, 12).padding(.vertical, 9)
                            .background(Theme.paper.opacity(0.72), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.seal.opacity(0.24), lineWidth: 0.8))
                        }
                        .buttonStyle(PressStyle()).disabled(busy)
                    }
                }
                .padding(14)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        // 2. 四线时代科技演进 + 国际信誉条
        if let tech = info.tech, !tech.isEmpty {
            FoldSection("四线科技演进与国际信誉", expanded: true, summary: tech.map { "\($0.short)\($0.level)阶" }.joined(separator: " · ")) {
                Group2 {
                    VStack(alignment: .leading, spacing: 0) {
                        if let rep = info.reputation {
                            HStack(spacing: 8) {
                                PaperTag(text: "信誉 \(rep.score)", color: rep.score >= 70 ? Theme.jade : rep.score < 45 ? Theme.seal : Theme.ink2, size: 11)
                                Text(rep.label).font(Theme.body).foregroundStyle(Theme.ink)
                                Spacer()
                                if rep.opinionMod != 0 {
                                    Text("邦交 \(rep.opinionMod > 0 ? "+" : "")\(rep.opinionMod)")
                                        .font(Theme.caption).foregroundStyle(rep.opinionMod > 0 ? Theme.jade : Theme.seal).monospacedDigit()
                                }
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            Divider2()
                        }
                        ForEach(Array(tech.enumerated()), id: \.element.id) { idx, row in
                            VStack(alignment: .leading, spacing: 5) {
                                HStack(spacing: 7) {
                                    PaperTag(text: "\(row.short) \(row.level)阶", color: row.level >= 4 ? Theme.gold : Theme.jade, size: 11)
                                    Text(row.tierName).font(Theme.body).foregroundStyle(Theme.ink)
                                    Spacer()
                                    if row.level < 5 && info.alive {
                                        Button {
                                            guard !busy else { return }
                                            busy = true
                                            Task {
                                                let err = await model.investTech(nation: nation, branch: row.id)
                                                onMessage(err ?? "已拨款加速\(row.label)")
                                                await onReload()
                                                busy = false
                                            }
                                        } label: {
                                            Text("资助 · \(row.investCost)金")
                                                .font(Theme.caption).foregroundStyle(Theme.seal)
                                                .padding(.horizontal, 8).padding(.vertical, 4)
                                                .background(Theme.seal.opacity(0.09), in: Capsule())
                                                .overlay(Capsule().stroke(Theme.seal.opacity(0.30), lineWidth: 0.75))
                                        }
                                        .buttonStyle(PressStyle()).disabled(busy)
                                    } else if row.level >= 5 {
                                        PaperTag(text: "臻极", color: Theme.gold, size: 10)
                                    }
                                }
                                HStack(spacing: 8) {
                                    InkBar(fraction: Double(min(100, max(0, row.progress))) / 100.0, color: Theme.jade, height: 4.5)
                                    Text("\(row.progress)%").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit().frame(width: 34, alignment: .trailing)
                                }
                                Text(row.effect).font(Theme.caption).foregroundStyle(Theme.ink2)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            if idx < tech.count - 1 { Divider2() }
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
    }
}
