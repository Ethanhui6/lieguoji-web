import SwiftUI

/// All actions use the same engine commands as the nation page, including its validation.
struct DiplomaticActions: View {
    @ObservedObject var model: GameModel
    let source: Int
    let target: Int
    let say: (String) -> Void
    @State private var action = "pact"
    @State private var years = 10
    @State private var gold = "100"
    @State private var sending = false
    @State private var feedback = ""
    private var valid: Bool {
        guard let state = model.state, source != target,
              state.nations.indices.contains(source), state.nations.indices.contains(target) else { return false }
        return state.nations[source].alive && state.nations[target].alive
    }
    private static let actions = [("pact", "互不侵犯"), ("marriage", "联姻"), ("alliance", "同盟"), ("gift", "赠金")]
    private var note: String {
        switch action {
        case "pact": return "条约期内两国不会向彼此宣战。"
        case "marriage": return "缔结十年王室联姻；资格由外交规则判定。"
        case "gift": return "从发起国国库转入目标国，金额受国库限制。"
        default: return "邀请目标国加入同盟，结果由两国关系决定。"
        }
    }
    var body: some View {
        Group2 {
            VStack(alignment: .leading, spacing: 12) {
                ChipPicker(items: Self.actions, selection: $action)
                if action == "pact" {
                    ChipPicker(items: [(5, "五年"), (10, "十年"), (20, "二十年")], selection: $years)
                } else if action == "gift" {
                    HStack(spacing: 10) {
                        Text("赠金").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                        TextField("", text: $gold, prompt: Text("100").foregroundColor(Theme.ink2.opacity(0.6)))
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing).paperField()
                        Text("金").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                    }
                }
                Text(note).font(Theme.kai(13)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                SealButton(title: sending ? "正在传达…" : "遣使", busy: sending,
                           disabled: !valid || (action == "gift" && !(Double(gold).map { $0.isFinite && $0 > 0 } ?? false))) {
                    let a = source, b = target, selected = action, duration = years, amount = Double(gold) ?? 0
                    sending = true
                    Task { @MainActor in
                        let error: String?
                        switch selected {
                        case "alliance": error = await model.alliance(a, with: b)
                        case "gift": error = await model.gift(a, to: b, gold: amount)
                        default: error = await model.treaty(a, b, years: selected == "marriage" ? 10 : duration, kind: selected)
                        }
                        feedback = error ?? "国书已达"
                        sending = false
                        say(feedback)
                    }
                }
                if !feedback.isEmpty { Text(feedback).font(Theme.kai(13)).foregroundStyle(Theme.ink).accessibilityLabel("执行结果：" + feedback) }
            }
            .padding(14)
        }
        .onChange(of: source) { _, _ in feedback = "" }
        .onChange(of: target) { _, _ in feedback = "" }
    }
}
