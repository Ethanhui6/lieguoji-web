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
    var body: some View {
        Group2 {
            VStack(alignment: .leading, spacing: 12) {
                Picker("外交行动", selection: $action) {
                    Text("互不侵犯").tag("pact")
                    Text("王室联姻").tag("marriage")
                    Text("缔结同盟").tag("alliance")
                    Text("赠送金帛").tag("gift")
                }.tint(Theme.jade)
                if action == "pact" {
                    Picker("条约年限", selection: $years) {
                        Text("五年").tag(5); Text("十年").tag(10); Text("二十年").tag(20)
                    }.pickerStyle(.segmented)
                } else if action == "gift" {
                    HStack {
                        Text("赠金金额")
                        TextField("金额", text: $gold).keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing).textFieldStyle(.roundedBorder)
                        Text("金")
                    }
                }
                Text(action == "pact" ? "条约期内两国 AI 不会向彼此宣战。" : action == "marriage" ? "缔结十年王室联姻条约；资格由外交规则判定。" : action == "gift" ? "从发起国国库转入目标国，金额受实际国库限制。" : "邀请目标国加入同盟，结果由当前外交关系决定。")
                    .font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                Button {
                    let a = source, b = target, selected = action, duration = years, amount = Double(gold) ?? 0
                    sending = true
                    Task { @MainActor in
                        let error: String?
                        switch selected {
                        case "alliance": error = await model.alliance(a, with: b)
                        case "gift": error = await model.gift(a, to: b, gold: amount)
                        default: error = await model.treaty(a, b, years: selected == "marriage" ? 10 : duration, kind: selected)
                        }
                        feedback = error ?? "外交行动已生效"
                        sending = false
                        say(feedback)
                    }
                } label: {
                    HStack {
                        if sending { ProgressView() }
                        Text(sending ? "正在传达…" : "确认外交行动")
                    }.frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent).tint(Theme.jade)
                .disabled(sending || !valid || (action == "gift" && !(Double(gold).map { $0.isFinite && $0 > 0 } ?? false)))
                if !feedback.isEmpty { Text(feedback).font(Theme.kai(14)).foregroundStyle(Theme.ink).accessibilityLabel("执行结果：" + feedback) }
            }.padding(16).disabled(sending)
        }
        .onChange(of: source) { _, _ in feedback = "" }
        .onChange(of: target) { _, _ in feedback = "" }
    }
}
