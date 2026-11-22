import SwiftUI

/// 全功能深度外交遣使台：覆盖通商、共防、互不侵犯、联姻宣称、军事通行、岁币、同盟、赠金、最后通牒与谍报资敌。
struct DiplomaticActions: View {
    @ObservedObject var model: GameModel
    let source: Int
    let target: Int
    let say: (String) -> Void
    @State private var action = "trade"
    @State private var years = 10
    @State private var gold = "200"
    @State private var demand = "tribute"
    @State private var covertKind = "fundRebels"
    @State private var sending = false
    @State private var feedback = ""

    private var valid: Bool {
        guard let state = model.state, source != target,
              state.nations.indices.contains(source), state.nations.indices.contains(target) else { return false }
        return state.nations[source].alive && state.nations[target].alive
    }

    private static let friendlyActions: [(id: String, title: String, glyph: InkGlyph)] = [
        ("trade", "通商", .goods),
        ("defense", "共防", .fortress),
        ("pact", "互不侵犯", .peace),
        ("marriage", "联姻", .marriage),
        ("access", "通行", .march),
        ("alliance", "同盟", .alliance),
        ("gift", "赠金", .economy),
    ]
    private static let hostileActions: [(id: String, title: String, glyph: InkGlyph)] = [
        ("ultimatum", "最后通牒", .fire),
        ("covert", "谍报资敌", .eye),
    ]

    private var note: String {
        switch action {
        case "trade": return "双方互开商埠，每月财政各额外增收 6%，邦交升温（开战即废）。"
        case "defense": return "缔结共同防御条约：任一方遇袭时，另一方自动出兵协防。"
        case "pact": return "条约期内两国不得相互宣战，缓和边境紧张。"
        case "marriage": return "两国王室联姻（礼聘 150 金）：十年免战、邦交大增，并互留 25 年王位宣称。"
        case "access": return "开放边境关隘，互予军事通行权并增进互信。"
        case "gift": return "从发起国国库拨款相赠，按金额大幅提升双边好感度。"
        case "ultimatum": return "以重兵压境下达最后通牒：对方弱小则含恨屈服，否则当场宣战！"
        case "covert": return "暗派密使扰乱敌国朝堂或资助叛军；有 35% 概率败露引发外交交恶。"
        default: return "邀约加入正式军事同盟，共享攻守大局。"
        }
    }

    private func actionChip(_ item: (id: String, title: String, glyph: InkGlyph), hostile: Bool = false) -> some View {
        let on = action == item.id
        let tint = hostile ? Theme.seal : Theme.jade
        return Button {
            GameFeel.shared.tap()
            withAnimation(Motion.tap) { action = item.id }
        } label: {
            HStack(spacing: 4) {
                InkIcon(glyph: item.glyph, size: 13, weight: on ? 1.9 : 1.65, accent: (on ? Theme.paper2 : tint).opacity(0.26))
                Text(item.title).font(Theme.label).lineLimit(1).minimumScaleFactor(0.75)
            }
            .foregroundStyle(on ? Theme.paper2 : (hostile ? Theme.seal : Theme.ink))
            .frame(maxWidth: .infinity).frame(height: 34)
            .background(on ? (hostile ? Theme.seal : Theme.jade) : Theme.paper.opacity(0.72), in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).strokeBorder(on ? Color.clear : (hostile ? Theme.seal.opacity(0.28) : Theme.ink.opacity(0.14)), lineWidth: 0.85))
        }
        .buttonStyle(PressStyle())
    }

    var body: some View {
        Group2 {
            VStack(alignment: .leading, spacing: 12) {
                Text("邦交盟好").font(Theme.caption).foregroundStyle(Theme.ink2)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 7), count: 4), spacing: 7) {
                    ForEach(Self.friendlyActions, id: \.id) { item in actionChip(item) }
                }
                Text("强硬博弈").font(Theme.caption).foregroundStyle(Theme.seal)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 7), GridItem(.flexible(), spacing: 7)], spacing: 7) {
                    ForEach(Self.hostileActions, id: \.id) { item in actionChip(item, hostile: true) }
                }
                Divider2()
                if ["pact", "trade", "defense", "access"].contains(action) {
                    ChipPicker(items: [(5, "五年"), (10, "十年"), (20, "二十年")], selection: $years)
                } else if action == "gift" {
                    HStack(spacing: 10) {
                        Text("赠金").font(Theme.body).foregroundStyle(Theme.ink2)
                        TextField("", text: $gold, prompt: Text("200").foregroundColor(Theme.ink2.opacity(0.6)))
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing).paperField()
                        Text("金").font(Theme.body).foregroundStyle(Theme.ink2)
                    }
                } else if action == "ultimatum" {
                    ChipPicker(items: [("tribute", "索要十年岁币"), ("province", "割让边境一州"), ("vassal", "迫其称臣附庸")], selection: $demand)
                } else if action == "covert" {
                    ChipPicker(items: [("fundRebels", "资助敌国叛军"), ("sowDiscord", "离间朝堂世家")], selection: $covertKind)
                }
                Text(note).font(Theme.label).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                SealButton(title: sending ? "正在传达…" : (action == "ultimatum" ? "颁下通牒" : action == "covert" ? "密遣细作" : "遣使致书"), busy: sending,
                           disabled: !valid || (action == "gift" && !(Double(gold).map { $0.isFinite && $0 > 0 } ?? false))) {
                    let a = source, b = target, selected = action, duration = years, amount = Double(gold) ?? 0
                    let dem = demand, cov = covertKind
                    sending = true
                    Task { @MainActor in
                        let error: String?
                        switch selected {
                        case "alliance": error = await model.alliance(a, with: b)
                        case "gift": error = await model.gift(a, to: b, gold: amount)
                        case "ultimatum": error = await model.sendUltimatum(a, to: b, demand: dem)
                        case "covert": error = await model.covertAction(a, target: b, kind: cov)
                        default: error = await model.treaty(a, b, years: selected == "marriage" ? 10 : duration, kind: selected)
                        }
                        feedback = error ?? (model.state?.events.last?.text ?? "国书已达")
                        sending = false
                        say(feedback)
                    }
                }
                if !feedback.isEmpty { Text(feedback).font(Theme.label).foregroundStyle(Theme.ink).accessibilityLabel("执行结果：" + feedback) }
            }
            .padding(14)
        }
        .onChange(of: source) { _, _ in feedback = "" }
        .onChange(of: target) { _, _ in feedback = "" }
    }
}
