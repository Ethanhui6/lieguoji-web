import SwiftUI
import LieguojiCore

// MARK: - v5.1.0 大战略扩展数据模型（天下奇观 / 霸业使命 / 黄金盛世 / 雇佣兵团）

struct GrandInfoData: Decodable {
    struct WonderRow: Decodable, Identifiable {
        let id: String
        let name: String
        let category: String
        let cost: Int
        let months: Int
        let coastalOnly: Bool
        let effectLine: String
        let flavor: String
        let status: String // "available" | "building" | "done"
        let mine: Bool
        let holderName: String
        let provinceName: String
        let provinceIndex: Int
        let progress: Int
    }
    struct MissionRow: Decodable, Identifiable {
        let id: String
        let title: String
        let category: String
        let goalText: String
        let rewardText: String
        let current: Int
        let target: Int
        let done: Bool
        let claimed: Bool
        let statusLine: String
    }
    struct MercRow: Decodable, Identifiable {
        let id: String
        let name: String
        let unit: String
        let troops: Int
        let xp: Int
        let cost: Int
        let note: String
        let cooldownDays: Int
    }

    let gold: Double
    let hasPort: Bool
    let goldenAgeLeft: Int
    let goldenAgeCooldown: Int
    let goldenAgeEligible: Bool
    let goldenAgeRequirement: String
    let wonders: [WonderRow]
    let missions: [MissionRow]
    let mercenaries: [MercRow]
}

extension GameModel {
    func grandInfo(_ nation: Int) async -> GrandInfoData? {
        await query(GrandInfoData.self) { await self.native.grandInfo(nation) }
    }

    func startWonder(_ nation: Int, wonder: String, province: Int? = nil) async -> String? {
        var args: [String: Any] = ["n": nation, "wonder": wonder]
        if let province { args["province"] = province }
        let err = await edit("startWonder", args)
        if err == nil { GameFeel.shared.scrollOpen() }
        return err
    }

    func claimMission(_ nation: Int, mission: String) async -> String? {
        let err = await edit("claimMission", ["n": nation, "mission": mission])
        if err == nil { GameFeel.shared.notify(.success) }
        return err
    }

    func startGoldenAge(_ nation: Int) async -> String? {
        let err = await edit("startGoldenAge", ["n": nation])
        if err == nil { GameFeel.shared.scrollOpen() }
        return err
    }

    func hireMercenary(_ nation: Int, merc: String) async -> String? {
        let err = await edit("hireMercenary", ["n": nation, "merc": merc])
        if err == nil { GameFeel.shared.orderMarch() }
        return err
    }
}

// MARK: - 二级子页 1：天下奇观与国家大工程（4.3 极简宣纸风，按需加载零卡顿）

struct NationWondersSubPage: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let alive: Bool
    let onLocateProvince: (Int) -> Void
    let onMessage: (String) -> Void
    let onRefreshParent: () async -> Void

    @State private var data: GrandInfoData?
    @State private var filter = "all"
    @State private var busy = false

    private func reload() async {
        data = await model.grandInfo(nation)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let data {
                let owned = data.wonders.filter { $0.status == "done" && $0.mine }
                let building = data.wonders.first { $0.status == "building" && $0.mine }

                VStack(alignment: .leading, spacing: 10) {
                    EditorialFocusLead(
                        eyebrow: "天下奇观 · 举世唯一（攻占所在州即易主）",
                        headline: building.map { "兴建中：\($0.name)（\($0.progress)/\($0.months)月）" }
                            ?? (owned.isEmpty ? "尚未建成传世奇观" : "本国实控 \(owned.count) 座传世奇观"),
                        detail: building.map { "动工于\($0.provinceName) · \($0.effectLine)" }
                            ?? (owned.isEmpty ? "择一传世大工程斥资动工，竣工即享永久全局加成，亦须防强敌夺州。" : owned.map(\.name).joined(separator: " · ")),
                        urgent: building != nil
                    )
                    if let b = building {
                        InkBar(fraction: Double(b.progress) / Double(max(1, b.months)), color: Theme.seal, track: Theme.hairline, height: 3)
                    }
                    EditorialDivider()
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                ChipPicker(items: [("all", "全部 12 座"), ("available", "可动工"), ("built", "已落成/在建")], selection: $filter)
                    .padding(.horizontal, Theme.Layout.pageInset)

                let shown = data.wonders.filter { w in
                    switch filter {
                    case "available": return w.status == "available"
                    case "built": return w.status != "available"
                    default: return true
                    }
                }

                if shown.isEmpty {
                    Text("当前分类下暂无奇观工程。").font(Theme.body).foregroundStyle(Theme.ink2)
                        .padding(.horizontal, Theme.Layout.pageInset)
                } else {
                    Group2 {
                        LazyVStack(spacing: 0) {
                            ForEach(Array(shown.enumerated()), id: \.element.id) { idx, w in
                                wonderRow(w, hasBuilding: building != nil, gold: data.gold, hasPort: data.hasPort)
                                if idx < shown.count - 1 { Divider2() }
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
            } else {
                PanelPending(failed: false, busy: true) { Task { await reload() } }
            }
        }
        .task { await reload() }
    }

    private func wonderRow(_ w: GrandInfoData.WonderRow, hasBuilding: Bool, gold: Double, hasPort: Bool) -> some View {
        let canBuild = alive && w.status == "available" && !hasBuilding && gold >= Double(w.cost) && (!w.coastalOnly || hasPort)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(w.name)
                    .font(Theme.serif(16))
                    .foregroundStyle(w.mine ? Theme.seal : Theme.ink)
                PaperTag(text: w.category, color: Theme.ink2, size: 10.5)
                if w.coastalOnly {
                    PaperTag(text: "须海港", color: Theme.ink2, size: 10)
                }
                Spacer(minLength: 4)
                if w.status == "done" {
                    PaperTag(text: w.mine ? "本国实控" : "\(w.holderName)持有", color: w.mine ? Theme.seal : Theme.ink2, size: 10.5)
                } else if w.status == "building" {
                    PaperTag(text: "\(w.holderName)在建 \(w.progress)/\(w.months)月", color: Theme.seal, size: 10.5)
                } else {
                    Text("\(w.cost) 金 · \(w.months) 月")
                        .font(Theme.sans(12.5))
                        .foregroundStyle(gold >= Double(w.cost) ? Theme.ink : Theme.seal)
                        .monospacedDigit()
                }
            }

            Text(w.effectLine)
                .font(Theme.sans(13))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(w.flavor + (w.provinceName.isEmpty ? "" : " · 坐落于\(w.provinceName)"))
                .font(Theme.sans(12))
                .foregroundStyle(Theme.ink2)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                if w.status == "available" {
                    EditorialTactileButton(
                        title: hasBuilding ? "已有在建工程" : (w.coastalOnly && !hasPort ? "缺少沿海海港" : (gold < Double(w.cost) ? "国库不足（需 \(w.cost) 金）" : "动工兴建 · \(w.cost) 金")),
                        icon: .edict,
                        accent: canBuild,
                        solid: canBuild,
                        compact: true,
                        disabled: busy || !canBuild
                    ) {
                        guard !busy else { return }
                        busy = true
                        Task {
                            let err = await model.startWonder(nation, wonder: w.id)
                            await reload()
                            await onRefreshParent()
                            onMessage(err ?? "奇观「\(w.name)」已正式奠基动工！")
                            busy = false
                        }
                    }
                } else if w.provinceIndex >= 0 {
                    EditorialTactileButton(title: "前往\(w.provinceName)", icon: .locate, compact: true) {
                        onLocateProvince(w.provinceIndex)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 14)
    }
}

// MARK: - 二级子页 2：国家霸业使命与黄金盛世

struct NationAmbitionsSubPage: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let alive: Bool
    let onMessage: (String) -> Void
    let onRefreshParent: () async -> Void

    @State private var data: GrandInfoData?
    @State private var busy = false

    private func reload() async {
        data = await model.grandInfo(nation)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let data {
                // 1. 黄金盛世核心区块
                VStack(alignment: .leading, spacing: 10) {
                    EditorialFocusLead(
                        eyebrow: data.goldenAgeLeft > 0 ? "黄金盛世进行中 · 尚余 \(data.goldenAgeLeft) 个月" : "国家黄金盛世 · 60 个月全方位爆发",
                        headline: data.goldenAgeLeft > 0 ? "四海升平 · 盛世加成生效中" : "开启五年黄金盛世",
                        detail: data.goldenAgeLeft > 0
                            ? "全军攻 +16% 守 +14% · 全国岁入 +25% · 人口年增 +3% · 安定 +15 · 腐化 −10"
                            : (data.goldenAgeCooldown > 0
                                ? "蓄势冷却中（余 \(data.goldenAgeCooldown) 月）· 攻 +16% 守 +14% · 岁入 +25% · 安定 +15"
                                : "\(data.goldenAgeRequirement)"),
                        urgent: data.goldenAgeLeft > 0 || data.goldenAgeEligible
                    )
                    if alive && data.goldenAgeLeft == 0 {
                        EditorialInkButton(
                            title: data.goldenAgeCooldown > 0 ? "蓄势冷却中（余 \(data.goldenAgeCooldown) 月）" : "颁诏开启黄金盛世",
                            consequence: "60 月 · 岁入+25% 攻+16%",
                            disabled: busy || !data.goldenAgeEligible
                        ) {
                            guard !busy else { return }
                            busy = true
                            Task {
                                let err = await model.startGoldenAge(nation)
                                await reload()
                                await onRefreshParent()
                                onMessage(err ?? "五年黄金盛世已启！")
                                busy = false
                            }
                        }
                    }
                    EditorialDivider()
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                // 2. 八大霸业使命清单
                let claimedCount = data.missions.filter(\.claimed).count
                SectionLabel("国家霸业使命（已完成 \(claimedCount)/\(data.missions.count)）")
                Group2 {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(data.missions.enumerated()), id: \.element.id) { idx, m in
                            missionRow(m)
                            if idx < data.missions.count - 1 { Divider2() }
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            } else {
                PanelPending(failed: false, busy: true) { Task { await reload() } }
            }
        }
        .task { await reload() }
    }

    private func missionRow(_ m: GrandInfoData.MissionRow) -> some View {
        let frac = Double(min(m.target, max(0, m.current))) / Double(max(1, m.target))
        let canClaim = alive && m.done && !m.claimed
        return VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(m.title)
                    .font(Theme.serif(15.5))
                    .foregroundStyle(canClaim ? Theme.seal : Theme.ink)
                PaperTag(text: m.category, color: Theme.ink2, size: 10.5)
                Spacer(minLength: 4)
                if m.claimed {
                    PaperTag(text: "已领赏", color: Theme.ink2, size: 10.5)
                } else if m.done {
                    PaperTag(text: "已达成", color: Theme.seal, size: 10.5)
                } else {
                    Text(m.statusLine)
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.ink2)
                        .monospacedDigit()
                }
            }
            Text("目标：\(m.goalText)")
                .font(Theme.sans(12.5))
                .foregroundStyle(Theme.ink2)
            Text("赏赐：\(m.rewardText)")
                .font(Theme.sans(12.5))
                .foregroundStyle(m.claimed ? Theme.ink2 : Theme.ink)
            if !m.claimed {
                InkBar(fraction: frac, color: m.done ? Theme.seal : Theme.ink.opacity(0.45), track: Theme.hairline, height: 2.5)
            }
            if canClaim {
                EditorialTactileButton(title: "受命领赏", icon: .crown, accent: true, solid: true, compact: true, disabled: busy) {
                    guard !busy else { return }
                    busy = true
                    Task {
                        let err = await model.claimMission(nation, mission: m.id)
                        await reload()
                        await onRefreshParent()
                        onMessage(err ?? "已领取「\(m.title)」赏赐！")
                        busy = false
                    }
                }
                .padding(.top, 2)
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 13)
    }
}

// MARK: - 二级子页 3：天下雇佣兵团（6 支百战精锐直赴战局）

struct NationMercenariesSubPage: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let alive: Bool
    let tint: Color
    let onMessage: (String) -> Void
    let onRefreshParent: () async -> Void

    @State private var data: GrandInfoData?
    @State private var busy = false

    private func reload() async {
        data = await model.grandInfo(nation)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let data {
                VStack(alignment: .leading, spacing: 8) {
                    EditorialFocusLead(
                        eyebrow: "天下游侠与百战佣兵 · 现存国库 \(Int(data.gold).formatted()) 金",
                        headline: "重金延揽海外与江湖精锐成军",
                        detail: "雇佣兵团自带 4,200–5,500 满编精兵、高士气（95）与精锐历练（45–60），即刻集结于本国都城投入实战（每团 180 日休整期）。",
                        urgent: false
                    )
                    EditorialDivider()
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                Group2 {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(data.mercenaries.enumerated()), id: \.element.id) { idx, m in
                            mercRow(m, gold: data.gold)
                            if idx < data.mercenaries.count - 1 { Divider2() }
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            } else {
                PanelPending(failed: false, busy: true) { Task { await reload() } }
            }
        }
        .task { await reload() }
    }

    private func mercRow(_ m: GrandInfoData.MercRow, gold: Double) -> some View {
        let onCD = m.cooldownDays > 0
        let canHire = alive && !onCD && gold >= Double(m.cost)
        return HStack(alignment: .center, spacing: 12) {
            UnitMark(unit: m.unit, color: tint)
                .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(m.name)
                        .font(Theme.serif(15.5))
                        .foregroundStyle(Theme.ink)
                    PaperTag(text: "\(m.troops)人 · 历练\(m.xp)", color: Theme.ink2, size: 10.5)
                }
                Text(m.note)
                    .font(Theme.sans(12.2))
                    .foregroundStyle(Theme.ink2)
                    .lineLimit(2)
            }
            Spacer(minLength: 6)
            EditorialTactileButton(
                title: onCD ? "余 \(m.cooldownDays) 日" : "\(m.cost) 金招募",
                accent: canHire,
                solid: canHire,
                compact: true,
                disabled: busy || !canHire
            ) {
                guard !busy else { return }
                busy = true
                Task {
                    let err = await model.hireMercenary(nation, merc: m.id)
                    await reload()
                    await onRefreshParent()
                    onMessage(err ?? "已招募「\(m.name)」成军！")
                    busy = false
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 13)
    }
}
