import SwiftUI
import LieguojiCore

/// 国家页顶部的五键快捷操控条：划疆、放兵、颁诏、疆土、看都城，让高频操控一触即达。
struct NationQuickBar: View {
    var decreeTitle: String = "颁诏"
    let onPaint: () -> Void
    let onPlaceArmy: () -> Void
    let onDecrees: () -> Void
    let onTerritory: () -> Void
    let onCapital: () -> Void
    var body: some View {
        HStack(spacing: 7) {
            quickButton(title: "划疆", glyph: .views, tint: Theme.ink, action: onPaint)
            quickButton(title: "放兵", glyph: .military, tint: Theme.seal, action: onPlaceArmy)
            quickButton(title: decreeTitle, glyph: .edict, tint: Theme.seal, action: onDecrees)
            quickButton(title: "疆土", glyph: .region, tint: Theme.jade, action: onTerritory)
            quickButton(title: "都城", glyph: .crown, tint: Theme.ink, action: onCapital)
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }
    private func quickButton(title: String, glyph: InkGlyph, tint: Color, action: @escaping () -> Void) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            VStack(spacing: 3) {
                InkIcon(glyph: glyph, size: 17, weight: 1.75, accent: tint.opacity(0.24))
                    .foregroundStyle(tint)
                Text(title).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1)
            }
            .frame(maxWidth: .infinity).frame(height: 48)
            .background(Theme.paper2.opacity(0.86), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.16), lineWidth: 0.9))
        }
        .buttonStyle(PressStyle())
    }
}

/// 国家页「政令」标签：苹果级视觉层次重塑——顶部国策总效洞察卡 + 四大治国领域（互斥路线对照卡 + 专项国策拨钮）+ 双列御批诏令宫格。
struct NationDecreesTab: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let info: NationInfo
    let onToast: (String) -> Void
    let onReload: () async -> Void
    let onEnthrone: () -> Void
    @State private var busy = false
    @State private var category: Category = .reforms
    @State private var reformDomain: ReformDomain = .all

    enum Category: String, CaseIterable {
        case reforms = "长期国策"
        case domestic = "内政基建"
        case military = "军事海运"
        case culture = "文教外交"
    }

    struct StrategyPreset: Identifiable {
        let id: String
        let title: String
        let note: String
        let glyph: InkGlyph
        let tone: Color
    }

    static let strategies: [StrategyPreset] = [
        StrategyPreset(id: "warMobilize",  title: "战时动员", note: "义务兵役 · 军功授爵", glyph: .war, tone: Theme.seal),
        StrategyPreset(id: "prosperTrade", title: "富国兴商", note: "开海通商 · 工商行会", glyph: .economy, tone: Theme.jade),
        StrategyPreset(id: "stabilize",    title: "固本维稳", note: "反腐审计 · 均田安民", glyph: .polity, tone: Theme.ink),
        StrategyPreset(id: "expand",       title: "经略扩张", note: "海陆并进 · 强军拓土", glyph: .military, tone: Theme.seal),
        StrategyPreset(id: "techFocus",    title: "格物兴科", note: "贤能取士 · 宪政革新", glyph: .chronicle, tone: Theme.jade),
    ]

    enum ReformDomain: String, CaseIterable {
        case all = "全部"
        case governance = "官制宪政"
        case military = "军制兵役"
        case economy = "财税农商"
        case faith = "礼教宗法"
    }

    struct MutexGroup: Identifiable {
        let id: String
        let domain: ReformDomain
        let title: String
        let hint: String
        let ids: [String]
    }

    struct IndependentSpec {
        let id: String
        let domain: ReformDomain
    }

    static let mutexGroups: [MutexGroup] = [
        MutexGroup(id: "selection", domain: .governance, title: "选官取士路线", hint: "互斥 · 二选一或均不施行", ids: ["keju", "jiupin"]),
        MutexGroup(id: "local", domain: .governance, title: "地方行政体制", hint: "互斥 · 二选一或均不施行", ids: ["junxian", "fengjian"]),
        MutexGroup(id: "army", domain: .military, title: "国家兵役制度", hint: "互斥 · 择一立军", ids: ["fubing", "mubing", "conscription"]),
        MutexGroup(id: "land", domain: .economy, title: "田制与人身制度", hint: "互斥 · 决定农税与人口", ids: ["juntian", "serf", "free"]),
        MutexGroup(id: "sea", domain: .economy, title: "海疆与海外贸易", hint: "互斥 · 开海或闭关", ids: ["seaopen", "sealock"]),
        MutexGroup(id: "church", domain: .faith, title: "国教与政教关系", hint: "互斥 · 二选一或均不施行", ids: ["stateChurch", "secular"]),
    ]

    static let independentSpecs: [IndependentSpec] = [
        IndependentSpec(id: "audit", domain: .governance),
        IndependentSpec(id: "parliament", domain: .governance),
        IndependentSpec(id: "charter", domain: .governance),
        IndependentSpec(id: "jungong", domain: .military),
        IndependentSpec(id: "knight", domain: .military),
        IndependentSpec(id: "minting", domain: .economy),
        IndependentSpec(id: "liangshui", domain: .economy),
        IndependentSpec(id: "tiaobian", domain: .economy),
        IndependentSpec(id: "guild", domain: .economy),
        IndependentSpec(id: "navyAct", domain: .economy),
    ]

    static let reformCatalog: [String: Regimes.Reform] = Dictionary(uniqueKeysWithValues: Regimes.reforms.map { ($0.id, $0) })

    struct EffectChip: Identifiable {
        let id: String
        let text: String
        let good: Bool
    }

    static func effectChips(for id: String) -> [EffectChip] {
        guard let eff = reformCatalog[id]?.effect else { return [] }
        var out = [EffectChip]()
        func push(_ key: String, _ label: String, _ val: Double, unit: String = "%", invertGood: Bool = false) {
            guard val != 0 else { return }
            let sign = val > 0 ? "+" : "−"
            let good = invertGood ? (val < 0) : (val > 0)
            out.append(EffectChip(id: "\(id)-\(key)", text: "\(label)\(sign)\(Int(abs(val)))\(unit)", good: good))
        }
        push("atk", "攻", eff.attack)
        push("def", "防", eff.defense)
        push("inc", "税", eff.income)
        push("gro", "人丁", eff.growth)
        push("stb", "安定", eff.stability, unit: "")
        push("cor", "腐化", eff.corruption, unit: "", invertGood: true)
        return out
    }

    static func netChips(for activeIds: [String]) -> [EffectChip] {
        var atk = 0.0, def = 0.0, inc = 0.0, gro = 0.0, stb = 0.0, cor = 0.0
        for id in activeIds {
            guard let e = reformCatalog[id]?.effect else { continue }
            atk += e.attack; def += e.defense; inc += e.income; gro += e.growth; stb += e.stability; cor += e.corruption
        }
        var out = [EffectChip]()
        func push(_ key: String, _ label: String, _ val: Double, unit: String = "%", invertGood: Bool = false) {
            guard val != 0 else { return }
            let sign = val > 0 ? "+" : "−"
            let good = invertGood ? (val < 0) : (val > 0)
            out.append(EffectChip(id: "net-\(key)", text: "\(label) \(sign)\(Int(abs(val)))\(unit)", good: good))
        }
        push("atk", "军攻", atk)
        push("def", "军防", def)
        push("inc", "岁入", inc)
        push("gro", "人口", gro)
        push("stb", "安定", stb, unit: "")
        push("cor", "腐化", cor, unit: "", invertGood: true)
        return out
    }

    struct DecreeItem: Identifiable {
        let id: String
        let category: Category
        let title: String
        let badge: String
        let note: String
        let glyph: InkGlyph
        let tone: Color
    }

    static let decrees: [DecreeItem] = [
        // 内政基建（6 项）
        DecreeItem(id: "prosper", category: .domestic, title: "休养生息", badge: "人丁 +3%", note: "存粮 +20% · 国运 +5", glyph: .goods, tone: Theme.jade),
        DecreeItem(id: "antiCorruption", category: .domestic, title: "整顿吏治", badge: "腐化 −15", note: "肃清贪墨 · 国运 +4", glyph: .polity, tone: Theme.jade),
        DecreeItem(id: "relief", category: .domestic, title: "开仓赈灾", badge: "耗 180 金", note: "存粮 +30% · 国运 +4", glyph: .economy, tone: Theme.jade),
        DecreeItem(id: "landSurvey", category: .domestic, title: "清丈田亩", badge: "得半岁税", note: "厘清税籍 · 腐化 −10", glyph: .region, tone: Theme.ink),
        DecreeItem(id: "roadNetwork", category: .domestic, title: "交通基建", badge: "增丁+商税", note: "驰道驿路 · 人丁+2% · +180金", glyph: .views, tone: Theme.jade),
        DecreeItem(id: "granary", category: .domestic, title: "战略粮储", badge: "存粮 +45%", note: "广设常平义仓 · 国运 +5", glyph: .goods, tone: Theme.ink),
        // 军事海运（6 项）
        DecreeItem(id: "mobilize", category: .military, title: "全国大征兵", badge: "急征 3 军", note: "重镇紧急编练 · 国运 −4", glyph: .military, tone: Theme.seal),
        DecreeItem(id: "rewardArmies", category: .military, title: "犒赏三军", badge: "士气 +35", note: "全军振奋 · 军粮补满", glyph: .command, tone: Theme.seal),
        DecreeItem(id: "fortifyBorder", category: .military, title: "加固边防", badge: "城防 +1", note: "边塞至多 12 处修城", glyph: .nation, tone: Theme.ink),
        DecreeItem(id: "armsUpgrade", category: .military, title: "军械改良", badge: "耗 260 金", note: "士气 +20 · 全军整补", glyph: .war, tone: Theme.seal),
        DecreeItem(id: "navalDockyard", category: .military, title: "海运船坞", badge: "运力 +2", note: "扩建跨海船队 · 舰体全修", glyph: .anchor, tone: Theme.jade),
        DecreeItem(id: "techAcademy", category: .military, title: "格物兴科", badge: "军政 +4", note: "科研革新 · 全军士气 +15", glyph: .chronicle, tone: Theme.seal),
        // 文教外交（6 项）
        DecreeItem(id: "assimilateCulture", category: .culture, title: "推行文教", badge: "教化归心", note: "境内城池归入主体文化", glyph: .culture, tone: Theme.ink),
        DecreeItem(id: "convertFaith", category: .culture, title: "统一国教", badge: "礼法一统", note: "全境归奉主体信仰", glyph: .religion, tone: Theme.ink),
        DecreeItem(id: "amnesty", category: .culture, title: "大赦安抚", badge: "情谊 +20", note: "缓和国内各派系关系", glyph: .house, tone: Theme.jade),
        DecreeItem(id: "academy", category: .culture, title: "兴办国立院", badge: "耗 200 金", note: "能力精进 · 腐化 −4 · 国运 +3", glyph: .chronicle, tone: Theme.jade),
        DecreeItem(id: "envoyGoodwill", category: .culture, title: "遣使修好", badge: "好感 +18", note: "走访非交战邻国 · 缓和孤立", glyph: .alliance, tone: Theme.jade),
        DecreeItem(id: "taxRelief", category: .culture, title: "减赋安民", badge: "国运 +6", note: "民生纾困 · 腐化 −10", glyph: .peace, tone: Theme.jade),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !info.alive {
                Text("此国已亡，无法颁布政令。").font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset)
            } else {
                // 全图统一自动委托总控条（置顶一键掌控全天下自动施政，绝不强迫逐国手动点开设置）
                globalDelegationCard

                // 顶部主分类切换（长期国策 vs 三大御批诏令）
                ChipPicker(items: Category.allCases.map { ($0, $0.rawValue) }, selection: $category)
                    .padding(.horizontal, Theme.Layout.pageInset)

                if category == .reforms {
                    reformsSection
                } else {
                    decreesGridSection
                }

                // 禅位择君置于底部独立卡，不挤占核心政策视区
                throneCard
            }
        }
    }

    @ViewBuilder
    private var globalDelegationCard: some View {
        let globalOn = info.globalAutoGovern ?? true
        let nationOn = info.autoStrategy ?? globalOn
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                InkIcon(glyph: .edict, size: 17, weight: 1.85, accent: (globalOn ? Theme.jade : Theme.seal).opacity(0.24))
                    .foregroundStyle(globalOn ? Theme.jade : Theme.seal)
                VStack(alignment: .leading, spacing: 2) {
                    Text("自动治理委托").font(Theme.section).foregroundStyle(Theme.ink)
                    Text(globalOn ? "已统一委托天下各国自动施政，无需逐国手动" : "全图已转为手动治理，可一键恢复统一委托")
                        .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2)
                }
                Spacer(minLength: 4)
            }
            HStack(spacing: 8) {
                Button {
                    GameFeel.shared.tap()
                    runDecreeKind(globalOn ? "globalAutoGovern:off" : "globalAutoGovern:on",
                                  fallback: globalOn ? "已关闭全图统一委托" : "已开启全图列国统一自动治理")
                } label: {
                    HStack(spacing: 5) {
                        Circle().fill(globalOn ? Theme.paper2 : Theme.jade).frame(width: 6.5, height: 6.5)
                        Text(globalOn ? "全图自动中 · 点按关闭" : "一键全图自动治理").font(Theme.caption)
                    }
                    .foregroundStyle(globalOn ? Theme.paper2 : Theme.jade)
                    .frame(maxWidth: .infinity).frame(height: 34)
                    .background(globalOn ? Theme.jade : Theme.jade.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(globalOn ? Color.clear : Theme.jade.opacity(0.32), lineWidth: 0.8))
                }
                .buttonStyle(PressStyle())
                .disabled(busy)

                Button {
                    GameFeel.shared.tap()
                    runDecreeKind(nationOn ? "strategyAuto:off" : "strategyAuto:on",
                                  fallback: nationOn ? "本国已切为手动接管" : "本国已恢复自动治理")
                } label: {
                    HStack(spacing: 5) {
                        Circle().fill(nationOn ? Theme.jade : Theme.seal).frame(width: 6.5, height: 6.5)
                        Text(nationOn ? "本国：委托中" : "本国：已接管").font(Theme.caption)
                    }
                    .foregroundStyle(nationOn ? Theme.ink : Theme.seal)
                    .frame(maxWidth: .infinity).frame(height: 34)
                    .background((nationOn ? Theme.ink : Theme.seal).opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke((nationOn ? Theme.ink : Theme.seal).opacity(0.24), lineWidth: 0.8))
                }
                .buttonStyle(PressStyle())
                .disabled(busy)
            }
        }
        .padding(14)
        .paperCard(tint: globalOn ? Theme.jade : Theme.seal)
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    @ViewBuilder
    private var reformsSection: some View {
        let list = info.reforms ?? []
        let byId = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0) })
        let activeRows = list.filter(\.on)
        let net = Self.netChips(for: activeRows.map(\.id))

        // 1. 一键智能战略预设 + 季度自动托管（按战时/兴商/维稳/扩张/科研自动组合最优互斥国策）
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("智能战略一键调配").font(Theme.section).foregroundStyle(Theme.ink)
                    Text("轻点方案自动匹配互斥国策与权力重心").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                Spacer()
                let autoOn = info.autoStrategy == true
                Button {
                    GameFeel.shared.tap()
                    runDecreeKind(autoOn ? "strategyAuto:off" : "strategyAuto:on", fallback: autoOn ? "已关闭智能托管" : "已开启季度智能托管")
                } label: {
                    HStack(spacing: 4) {
                        Circle().fill(autoOn ? Theme.jade : Theme.ink2.opacity(0.45)).frame(width: 6.5, height: 6.5)
                        Text(autoOn ? "自动托管中" : "开启托管").font(Theme.caption)
                    }
                    .foregroundStyle(autoOn ? Theme.jade : Theme.ink2)
                    .padding(.horizontal, 9).frame(height: 28)
                    .background((autoOn ? Theme.jade : Theme.ink).opacity(0.09), in: Capsule())
                    .overlay(Capsule().stroke((autoOn ? Theme.jade : Theme.ink).opacity(0.24), lineWidth: 0.7))
                }
                .buttonStyle(PressStyle())
                .disabled(busy)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 7) {
                    ForEach(Self.strategies) { sp in
                        let active = info.strategy == sp.id
                        Button {
                            GameFeel.shared.tap()
                            runDecreeKind("strategy:\(sp.id)", fallback: "已启用「\(sp.title)」方案")
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    InkIcon(glyph: sp.glyph, size: 12, weight: 1.8).foregroundStyle(active ? Theme.paper2 : sp.tone)
                                    Text(sp.title).font(Theme.label).foregroundStyle(active ? Theme.paper2 : Theme.ink)
                                }
                                Text(sp.note).font(Theme.caption).foregroundStyle(active ? Theme.paper2.opacity(0.85) : Theme.ink2).lineLimit(1)
                            }
                            .padding(.horizontal, 11).padding(.vertical, 7)
                            .background(active ? sp.tone : Theme.paper2.opacity(0.9), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(active ? Color.clear : sp.tone.opacity(0.25), lineWidth: 0.85))
                        }
                        .buttonStyle(PressStyle())
                        .disabled(busy)
                    }
                }
            }
        }
        .padding(14)
        .paperCard()
        .padding(.horizontal, Theme.Layout.pageInset)

        // 2. 苹果式国策总效洞察卡（Apple Insight Card 构图）
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("现行国策总览").font(Theme.caption).foregroundStyle(Theme.ink2)
                    Text("已施行 \(activeRows.count) 项制度").font(Theme.section).foregroundStyle(Theme.ink).monospacedDigit()
                }
                Spacer()
                Text("\(activeRows.count)/\(max(1, list.count))")
                    .font(Theme.kai(20)).foregroundStyle(Theme.seal).monospacedDigit()
            }
            InkBar(fraction: Double(activeRows.count) / Double(max(1, list.count)), color: Theme.seal, track: Theme.ink.opacity(0.08), height: 4.5)
            if net.isEmpty {
                Text("尚未确立长期国策，可在下方择定立国路线或开启专项制度。")
                    .font(Theme.caption).foregroundStyle(Theme.ink2)
            } else {
                WrapLayout(spacing: 6) {
                    ForEach(net) { chip in
                        Text(chip.text)
                            .font(Theme.caption)
                            .foregroundStyle(chip.good ? Theme.jade : Theme.seal)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background((chip.good ? Theme.jade : Theme.seal).opacity(0.10), in: Capsule())
                    }
                }
            }
        }
        .padding(14)
        .paperCard()
        .padding(.horizontal, Theme.Layout.pageInset)

        // 2. 四大治国领域细分筛选（统一温润朱砂选中态，告别突兀黑底）
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(ReformDomain.allCases, id: \.self) { dom in
                    let on = reformDomain == dom
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { reformDomain = dom }
                    } label: {
                        Text(dom.rawValue)
                            .font(Theme.label)
                            .foregroundStyle(on ? Theme.paper2 : Theme.ink)
                            .padding(.horizontal, 12).frame(height: 30)
                            .background(on ? Theme.seal : Theme.paper2.opacity(0.88), in: Capsule())
                            .overlay(Capsule().stroke(on ? Color.clear : Theme.ink.opacity(0.15), lineWidth: 0.85))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        if list.isEmpty {
            Group2 { Row(label: "国策", value: "当前政体暂无可选长期国策") }
                .padding(.horizontal, Theme.Layout.pageInset)
        } else {
            // 3. 互斥立国路线（双栏/三栏直观对照卡片）
            let groups = Self.mutexGroups.filter { g in
                (reformDomain == .all || g.domain == reformDomain) && g.ids.contains { byId[$0] != nil }
            }
            if !groups.isEmpty {
                SectionLabel("立国路线（同组互斥）")
                ForEach(groups) { g in
                    let available = g.ids.compactMap { byId[$0] }
                    mutexRouteCard(group: g, rows: available)
                }
            }

            // 4. 专项制度拨钮（Apple Settings Switch 风格）
            let groupedIds = Set(Self.mutexGroups.flatMap(\.ids))
            let specIds = Set(Self.independentSpecs.map(\.id))
            let specRows: [NationInfo.ReformRow] = Self.independentSpecs.compactMap { spec in
                guard reformDomain == .all || spec.domain == reformDomain else { return nil }
                return byId[spec.id]
            }
            let extraRows: [NationInfo.ReformRow] = reformDomain == .all
                ? list.filter { !groupedIds.contains($0.id) && !specIds.contains($0.id) }
                : []
            let independents = specRows + extraRows
            if !independents.isEmpty {
                SectionLabel("专项制度（独立开关）")
                Group2 {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(independents.enumerated()), id: \.element.id) { idx, r in
                            independentSwitchRow(r)
                            if idx < independents.count - 1 { Divider2() }
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
    }

    private func mutexRouteCard(group: MutexGroup, rows: [NationInfo.ReformRow]) -> some View {
        let activeName = rows.first(where: \.on)?.name
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(group.title).font(Theme.body).foregroundStyle(Theme.ink)
                Spacer()
                if let activeName {
                    Text("已行 · \(activeName)")
                        .font(Theme.caption).foregroundStyle(Theme.seal)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Theme.seal.opacity(0.10), in: Capsule())
                } else {
                    Text(group.hint).font(Theme.caption).foregroundStyle(Theme.ink2)
                }
            }
            HStack(spacing: 8) {
                ForEach(rows, id: \.id) { r in
                    let chips = Self.effectChips(for: r.id)
                    Button { toggleReform(r) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 4) {
                                Text(r.name)
                                    .font(Theme.body)
                                    .foregroundStyle(r.on ? Theme.seal : Theme.ink)
                                    .lineLimit(1).minimumScaleFactor(0.8)
                                Spacer(minLength: 2)
                                Image(systemName: r.on ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 15))
                                    .foregroundStyle(r.on ? Theme.seal : Theme.ink2.opacity(0.35))
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                ForEach(chips.prefix(3)) { chip in
                                    Text(chip.text)
                                        .font(Theme.kai(11))
                                        .foregroundStyle(chip.good ? Theme.jade : Theme.seal)
                                        .lineLimit(1)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, minHeight: 82, alignment: .topLeading)
                        .background(r.on ? Theme.seal.opacity(0.07) : Theme.paper.opacity(0.58), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(r.on ? Theme.seal.opacity(0.55) : Theme.ink.opacity(0.12), lineWidth: r.on ? 1.2 : 0.8))
                        .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    }
                    .buttonStyle(PressStyle())
                    .disabled(busy)
                }
            }
        }
        .padding(13)
        .paperCard()
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    private func independentSwitchRow(_ r: NationInfo.ReformRow) -> some View {
        let chips = Self.effectChips(for: r.id)
        return Button { toggleReform(r) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(r.name).font(Theme.body).foregroundStyle(r.on ? Theme.ink : Theme.ink.opacity(0.88))
                    if !chips.isEmpty {
                        HStack(spacing: 5) {
                            ForEach(chips.prefix(3)) { chip in
                                Text(chip.text)
                                    .font(Theme.kai(11))
                                    .foregroundStyle(chip.good ? Theme.jade : Theme.seal)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background((chip.good ? Theme.jade : Theme.seal).opacity(0.09), in: Capsule())
                            }
                        }
                    } else {
                        Text(r.text).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                    }
                }
                Spacer(minLength: 6)
                // Apple 规范 Switch 控件（轨道 Track + 圆钮 Thumb）
                ZStack(alignment: r.on ? .trailing : .leading) {
                    Capsule()
                        .fill(r.on ? Theme.seal : Theme.ink.opacity(0.16))
                        .frame(width: 44, height: 26)
                    Circle()
                        .fill(Theme.paper2)
                        .shadow(color: .black.opacity(0.16), radius: 2, y: 1)
                        .frame(width: 22, height: 22)
                        .padding(2)
                }
                .animation(Motion.tap, value: r.on)
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    @ViewBuilder
    private var decreesGridSection: some View {
        let items = Self.decrees.filter { $0.category == category }
        let lex = LocalizationEngine.lexicon(culture: info.culture, polity: info.polity, style: info.style)
        SectionLabel("\(lex.decreePrefix)\(category.rawValue)（点击立即施行）")
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(items) { item in
                Button { issue(item) } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            InkIcon(glyph: item.glyph, size: 18, weight: 1.85, accent: item.tone.opacity(0.22))
                                .foregroundStyle(item.tone)
                                .frame(width: 32, height: 32)
                                .background(item.tone.opacity(0.10), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                            Spacer()
                            Text(item.badge)
                                .font(Theme.kai(11)).foregroundStyle(item.tone)
                                .padding(.horizontal, 7).padding(.vertical, 2.5)
                                .background(item.tone.opacity(0.09), in: Capsule())
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                            Text(item.note).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2)
                        }
                        Spacer(minLength: 0)
                        HStack {
                            Spacer()
                            Text(lex.enactVerb).font(Theme.kai(11)).foregroundStyle(item.tone)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
                    .paperCard()
                    .opacity(busy ? 0.55 : 1)
                    .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
                }
                .buttonStyle(PressStyle())
                .disabled(busy)
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    private var throneCard: some View {
        let lex = LocalizationEngine.lexicon(culture: info.culture, polity: info.polity, style: info.style)
        return Group2 {
            Button {
                GameFeel.shared.tap()
                onEnthrone()
            } label: {
                HStack(spacing: 10) {
                    InkIcon(glyph: .crown, size: 18, weight: 1.85, accent: Theme.seal.opacity(0.26))
                        .foregroundStyle(Theme.seal)
                        .frame(width: 32, height: 32)
                        .background(Theme.seal.opacity(0.09), in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(lex.successionAction).font(Theme.body).foregroundStyle(Theme.ink)
                        Text(info.ruler.map { "现任：\($0.styledName ?? ($0.title + $0.name))" } ?? "择本国在世贤能执掌国政")
                            .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    InkIcon(glyph: .chevronRight, size: 12, weight: 1.7).foregroundStyle(Theme.seal)
                }
                .padding(.horizontal, 14).padding(.vertical, 10).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    private func runDecreeKind(_ kind: String, fallback: String) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await model.edit("nationDecree", ["n": nation, "kind": kind])
            await onReload()
            if let err {
                onToast(err)
                GameFeel.shared.notify(.error)
            } else {
                onToast(fallback)
                GameFeel.shared.notify(.success)
            }
            busy = false
        }
    }

    private func toggleReform(_ r: NationInfo.ReformRow) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await model.setReform(nation, reform: r.id, on: !r.on)
            await onReload()
            if let err {
                onToast(err)
                GameFeel.shared.notify(.error)
            } else {
                onToast(r.on ? "已废止「\(r.name)」" : "已施行「\(r.name)」")
                GameFeel.shared.notify(.success)
            }
            busy = false
        }
    }

    private func issue(_ item: DecreeItem) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await model.edit("nationDecree", ["n": nation, "kind": item.id])
            await onReload()
            if let err {
                onToast(err)
                GameFeel.shared.notify(.error)
            } else {
                onToast(model.state?.events.last?.text ?? "\(item.title)已颁行")
                GameFeel.shared.notify(.success)
            }
            busy = false
        }
    }
}

/// 国家页「疆土」总管标签：全境行政区搜索、排序、批量施政与逐区快捷操控（严格联动文化 × 政体区划称谓）。
struct NationTerritoryTab: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let alive: Bool
    let day: Int
    var culture: String? = nil
    var polity: String? = nil
    var style: String? = nil
    let onFly: (Int) -> Void
    let onAppointGovernor: (Int) -> Void
    let onToast: (String) -> Void
    let onReload: () async -> Void
    let onPresentMenu: (PressMenu) -> Void

    enum SortMode: String, CaseIterable {
        case population = "按人口"
        case defense = "按城防"
        case name = "按地名"
    }

    private var lex: LocalizationEngine.Lexicon {
        LocalizationEngine.lexicon(culture: culture, polity: polity, style: style)
    }

    @State private var rows: [GameModel.NationProvinceRow] = []
    @State private var loaded = false
    @State private var query = ""
    @State private var sort: SortMode = .population
    @State private var revision = 0
    @State private var busy = false

    private var filtered: [GameModel.NationProvinceRow] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let list = q.isEmpty ? rows : rows.filter {
            $0.name.localizedCaseInsensitiveContains(q)
                || $0.specialty.localizedCaseInsensitiveContains(q)
                || ($0.governor ?? "").localizedCaseInsensitiveContains(q)
                || ($0.familyName ?? "").localizedCaseInsensitiveContains(q)
        }
        switch sort {
        case .population:
            return list.sorted { $0.capital != $1.capital ? $0.capital : $0.population > $1.population }
        case .defense:
            return list.sorted { $0.defense != $1.defense ? $0.defense > $1.defense : $0.population > $1.population }
        case .name:
            return list.sorted { $0.name < $1.name }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !alive {
                Text("此国已亡，已无实控疆土。").font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset)
            } else {
                // 全境批量操控条
                HStack(spacing: 8) {
                    bulkChip("加固边防", glyph: .nation, tone: Theme.ink) { runBulk("nationDecree", ["n": nation, "kind": "fortifyBorder"], fallback: "边防已加固") }
                    bulkChip("补齐\(lex.governorTitle)", glyph: .polity, tone: Theme.jade) { runBulk("nationDiplomacyOrder", ["n": nation, "kind": "fillGovernors"], fallback: "已补齐\(lex.governorTitle)") }
                    bulkChip("同化文化", glyph: .culture, tone: Theme.ink) { runBulk("nationDecree", ["n": nation, "kind": "assimilateCulture"], fallback: "文化已同化") }
                    bulkChip("统一国教", glyph: .religion, tone: Theme.seal) { runBulk("nationDecree", ["n": nation, "kind": "convertFaith"], fallback: "国教已统一") }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                // 搜索与排序
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        InkIcon(glyph: .search, size: 14, weight: 1.7).foregroundStyle(Theme.ink2)
                        TextField("", text: $query, prompt: Text("搜\(lex.adminUnit)名、特产、\(lex.governorTitle)或\(lex.houseUnitLabel)").foregroundColor(Theme.ink2.opacity(0.6)))
                        if !query.isEmpty {
                            Button { query = "" } label: { InkIcon(glyph: .close, size: 12, weight: 1.8).foregroundStyle(Theme.ink2) }
                                .buttonStyle(.plain)
                        }
                    }
                    .paperField()
                    ChipPicker(items: SortMode.allCases.map { ($0, $0.rawValue) }, selection: $sort)
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                let shown = filtered
                SectionLabel("实控\(lex.adminPlural)（\(shown.count)/\(rows.count)）")
                if !loaded {
                    InkBusy(text: "清点疆土……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(24)
                } else if shown.isEmpty {
                    Group2 {
                        Row(label: lex.adminUnit, value: query.isEmpty ? "暂无实控\(lex.adminUnit)" : "无匹配\(lex.adminUnit)")
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                } else {
                    Group2 {
                        LazyVStack(spacing: 0) {
                            ForEach(Array(shown.enumerated()), id: \.element.id) { idx, row in
                                Button { openMenu(for: row) } label: {
                                    provinceRow(row)
                                }
                                .buttonStyle(.plain)
                                if idx < shown.count - 1 { Divider2() }
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
            }
        }
        .task(id: "\(nation)-\(day)-\(revision)") {
            guard alive else { return }
            rows = await model.nationProvinces(nation)
            loaded = true
        }
    }

    private func bulkChip(_ title: String, glyph: InkGlyph, tone: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                InkIcon(glyph: glyph, size: 15, weight: 1.75, accent: tone.opacity(0.24)).foregroundStyle(tone)
                Text(title).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity).frame(height: 44)
            .background(Theme.paper2.opacity(0.88), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.16), lineWidth: 0.9))
            .opacity(busy ? 0.55 : 1)
        }
        .buttonStyle(PressStyle())
        .disabled(busy)
    }

    private func provinceRow(_ row: GameModel.NationProvinceRow) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Text(row.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                if row.capital { PaperTag(text: "都城", color: Theme.seal, size: 11) }
                if row.fortress { PaperTag(text: "要塞", color: Theme.ink, size: 11) }
                if row.port { PaperTag(text: "海港", color: Theme.jade, size: 11) }
                if row.armies > 0 { PaperTag(text: "\(row.armies)军", color: Theme.seal.opacity(0.85), size: 11) }
                Spacer(minLength: 4)
                Text(Names.wan(row.population) + "人").font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit()
                InkIcon(glyph: .chevronRight, size: 12, weight: 1.7).foregroundStyle(Theme.seal.opacity(0.75))
            }
            HStack(spacing: 8) {
                Text("城防 \(row.defense) 级").font(Theme.caption).foregroundStyle(row.defense >= 3 ? Theme.jade : Theme.ink2)
                if !row.specialty.isEmpty { Text("· \(row.specialty)").font(Theme.caption).foregroundStyle(Theme.ink2) }
                if let g = row.governor {
                    Text("· \(lex.governorTitle) \(g)").font(Theme.caption).foregroundStyle((row.governorFit ?? 0) >= 0.3 ? Theme.jade : Theme.ink2).lineLimit(1)
                } else {
                    Text("· 缺\(lex.governorTitle)").font(Theme.caption).foregroundStyle(Theme.seal.opacity(0.85))
                }
                if let fam = row.familyName {
                    Spacer(minLength: 2)
                    Text(fam).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 9).contentShape(Rectangle())
    }

    private func openMenu(for row: GameModel.NationProvinceRow) {
        var items: [PressMenuItem] = [
            PressMenuItem(title: "在舆图上查看\(row.name)", symbol: "map") { onFly(row.index) },
            PressMenuItem(title: row.governor == nil ? "委任本\(lex.adminUnit)\(lex.governorTitle)" : "改任本\(lex.adminUnit)\(lex.governorTitle)（现：\(row.governor!)）", symbol: "building.columns") { onAppointGovernor(row.index) },
            PressMenuItem(title: "在本\(lex.adminUnit)征募 1 支新军", symbol: "flag.2.crossed") {
                runAction("已在\(row.name)征募新军") { await model.addArmy(nation, province: row.index, count: 1) }
            },
            PressMenuItem(title: row.fortress ? "拆除要塞" : "修筑要塞（城防加强）", symbol: "building.2") {
                runAction(row.fortress ? "\(row.name)要塞已拆" : "\(row.name)已筑要塞") {
                    await model.editProvince(row.index, population: nil, fortress: !row.fortress)
                }
            },
            PressMenuItem(title: "提升城防至 \(min(10, row.defense + 1)) 级", symbol: "shield") {
                runAction("\(row.name)城防升至 \(min(10, row.defense + 1)) 级") {
                    await model.edit("setProvinceDefense", ["province": row.index, "level": min(10, row.defense + 1)])
                }
            },
        ]
        if !row.capital {
            items.append(PressMenuItem(title: "迁都至\(row.name)", symbol: "crown") {
                runAction("已迁都\(row.name)") { await model.setCapital(nation, province: row.index) }
            })
        }
        items.append(PressMenuItem(title: "定为本国国教圣地", symbol: "sun.max") {
            runAction("\(row.name)已定为圣地") { await model.setHolyProvince(row.index) }
        })
        onPresentMenu(PressMenu(title: row.name, subtitle: "人口 \(Names.wan(row.population)) · 城防 \(row.defense) 级 · \(row.specialty)", items: items))
    }

    private func runBulk(_ call: String, _ args: [String: Any], fallback: String) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await model.edit(call, args)
            revision += 1
            await onReload()
            onToast(err ?? fallback)
            GameFeel.shared.notify(err == nil ? .success : .error)
            busy = false
        }
    }

    private func runAction(_ okText: String, _ op: @escaping () async -> String?) {
        Task {
            let err = await op()
            revision += 1
            await onReload()
            onToast(err ?? okText)
            GameFeel.shared.notify(err == nil ? .success : .error)
        }
    }
}

/// 国家页「军事」顶部的全军统筹指令栏：全军补员、全军回防、全军交 AI、船坞下水新舰队、地图放兵。
struct NationMilitaryControlBar: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let alive: Bool
    let onPlaceArmy: () -> Void
    let onToast: (String) -> Void
    let onReload: () async -> Void
    @State private var busy = false

    var body: some View {
        if alive {
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    orderBtn("全军补员", glyph: .military, tone: Theme.jade) { send("reinforceAll", ok: "已为缺编军队补员") }
                    orderBtn("回防都城", glyph: .command, tone: Theme.ink) { send("recall", ok: "已下令全军回防") }
                    orderBtn("全军交AI", glyph: .polity, tone: Theme.ink) { send("releaseAll", ok: "已全部交还 AI") }
                    orderBtn("下水新舰", glyph: .views, tone: Theme.seal) { send("launchFleet", ok: "新舰队已下水成军") }
                }
                Button {
                    GameFeel.shared.tap()
                    onPlaceArmy()
                } label: {
                    HStack(spacing: 6) {
                        InkIcon(glyph: .military, size: 16, weight: 1.85, accent: Theme.seal.opacity(0.28))
                        Text("在地图上点划放置新军").font(Theme.body)
                    }
                    .foregroundStyle(Theme.seal)
                    .frame(maxWidth: .infinity).frame(height: 40)
                    .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.seal.opacity(0.32), lineWidth: 1))
                }
                .buttonStyle(PressStyle())
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    private func orderBtn(_ title: String, glyph: InkGlyph, tone: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                InkIcon(glyph: glyph, size: 15, weight: 1.75, accent: tone.opacity(0.24)).foregroundStyle(tone)
                Text(title).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity).frame(height: 44)
            .background(Theme.paper2.opacity(0.88), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.16), lineWidth: 0.9))
            .opacity(busy ? 0.55 : 1)
        }
        .buttonStyle(PressStyle())
        .disabled(busy)
    }

    private func send(_ kind: String, ok: String) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await model.edit("nationMilitaryOrder", ["n": nation, "kind": kind])
            await onReload()
            onToast(err ?? ok)
            GameFeel.shared.notify(err == nil ? .success : .error)
            busy = false
        }
    }
}

/// 换届择贤／禅位择君弹窗：严格按政体适配称谓，共和政体不出现禅位与宗室字样。
struct EnthroneSheet: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let stateName: String
    var culture: String? = nil
    var polity: String? = nil
    var style: String? = nil
    let onPicked: (Int, String) -> Void
    @State private var candidates: [NationInfo.Person] = []
    @State private var loaded = false
    @State private var confirm: NationInfo.Person?

    private var lex: LocalizationEngine.Lexicon {
        LocalizationEngine.lexicon(culture: culture, polity: polity, style: style)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: lex.successionAction, subtitle: "\(stateName) · 择一在世成年贤能出任\(lex.leaderTitle)", seal: "政")
                Group2 {
                    if !loaded {
                        InkBusy(text: "遴选人选……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(24)
                    } else if candidates.isEmpty {
                        Row(label: "人选", value: "本国暂无其他年满十六岁的在世人选")
                    } else {
                        ForEach(Array(candidates.enumerated()), id: \.offset) { idx, p in
                            Button { confirm = p } label: {
                                HStack(spacing: 10) {
                                    Text(ChineseNumeral.of(idx + 1)).font(Theme.label).foregroundStyle(Theme.seal).frame(width: 22)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack(spacing: 6) {
                                            Text(p.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                                            PaperTag(text: p.role, color: idx == 0 ? Theme.seal : Theme.ink2, size: 11)
                                            Text("\(p.female ? "女" : "男") · \(Int(p.age))岁").font(Theme.caption).foregroundStyle(Theme.ink2)
                                        }
                                        if p.skills.count == 4 {
                                            Text("魅\(Int(p.skills[0])) · 军\(Int(p.skills[1])) · 外\(Int(p.skills[2])) · 政\(Int(p.skills[3]))")
                                                .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                        }
                                    }
                                    Spacer(minLength: 4)
                                    InkIcon(glyph: .crown, size: 14, weight: 1.75).foregroundStyle(Theme.seal)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 9).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if idx < candidates.count - 1 { Divider2() }
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
            .padding(.bottom, 24)
        }
        .task {
            candidates = await model.throneCandidates(nation)
            loaded = true
        }
        .confirmationDialog(confirm.map { "推举\($0.name)出任\(lex.leaderTitle)？" } ?? "", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            if let p = confirm, let id = p.id {
                Button("即刻\(lex.successionAction)", role: .destructive) {
                    confirm = nil
                    onPicked(id, p.name)
                }
            }
            Button("取消", role: .cancel) { confirm = nil }
        } message: {
            Text(lex.isRepublican ? "现任\(lex.leaderTitle)将和平卸任，所选人选即刻宣誓就任新一任国家元首。" : "原\(lex.leaderTitle)将和平卸任，所选人物成为新任\(lex.leaderTitle)。")
        }
    }
}
