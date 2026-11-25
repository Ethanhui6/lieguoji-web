import SwiftUI
import LieguojiCore

enum NewWorldWarRules {
    private static let key = "lieguoji.newWorldWarRules"

    static var values: [String: Int] {
        UserDefaults.standard.dictionary(forKey: key) as? [String: Int] ?? [:]
    }

    static func set(_ rule: String, to value: Int) {
        var next = values
        next[rule] = value == 100 ? nil : value
        UserDefaults.standard.set(next, forKey: key)
    }

    static func reset() { UserDefaults.standard.removeObject(forKey: key) }
}

struct WarRuleSettings: View {
    var model: GameModel? = nil
    @State private var rates: [String: Int]?
    @State private var writing = false
    @State private var issue: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(model == nil ? "新世界默认规则" : "本局全局规则")
            Text(model == nil ? "应用于之后新建的世界。" : "应用于本局所有国家，随存档保存。")
                .font(Theme.caption).foregroundStyle(Theme.ink2)
                .padding(.horizontal, Theme.Layout.pageInset)
            if let rates {
                Group2 {
                    WarRateRows(values: rates, change: change)
                    if model == nil {
                        Divider2()
                        Button {
                            NewWorldWarRules.reset()
                            self.rates = [:]
                        } label: { MenuRow(symbol: "arrow.counterclockwise", title: "恢复新世界默认规则") }
                            .buttonStyle(.plain)
                    }
                }
                .disabled(writing)
                .padding(.horizontal, Theme.Layout.pageInset)
                Text("100% 为常态。战争频率设为 0 后停止自动宣战，进行中的战争仍会继续。")
                    .font(Theme.caption).foregroundStyle(Theme.ink2)
                    .padding(.horizontal, Theme.Layout.pageInset)
            } else if issue == nil {
                InkBusy(text: "读取战争规则……").frame(maxWidth: .infinity)
            } else {
                Button("重新读取") { Task { await load() } }
                    .buttonStyle(.plain)
                    .padding(.horizontal, Theme.Layout.pageInset)
            }
            if let issue {
                Text(issue).font(Theme.caption).foregroundStyle(Theme.seal)
                    .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
        .task { await load() }
    }

    private func load() async {
        issue = nil
        if let model {
            let current = await model.worldRules()
            guard !current.isEmpty else { issue = "暂时无法读取当前世界的战争规则。"; return }
            rates = current
        } else {
            rates = NewWorldWarRules.values
        }
    }

    private func change(_ key: String, _ value: Int) {
        guard !writing else { return }
        if let model {
            writing = true
            Task {
                defer { writing = false }
                issue = await model.setWorldRule(key, Double(value))
                if issue == nil { rates?[key] = value }
            }
        } else {
            NewWorldWarRules.set(key, to: value)
            rates?[key] = value
        }
    }
}

struct WarRateRows: View {
    let values: [String: Int]
    let change: (String, Int) -> Void

    private struct Rate: Identifiable {
        let id: String
        let title: String
    }
    private static let rates = [
        Rate(id: "war", title: "战争频率"), Rate(id: "damage", title: "战斗烈度"),
        Rate(id: "march", title: "行军速度"), Rate(id: "levy", title: "征兵规模"),
        Rate(id: "ships", title: "造舰速度"), Rate(id: "navyScale", title: "水师规模"),
        Rate(id: "seaTransport", title: "跨海运力"), Rate(id: "rebel", title: "叛乱频率"),
        Rate(id: "event", title: "事件频率")
    ]

    var body: some View {
        ForEach(Self.rates) { rate in
            let range = Regimes.ruleRanges[rate.id] ?? 0...400
            let lo = Int(range.lowerBound), hi = Int(range.upperBound)
            let value = values[rate.id] ?? 100
            HStack(spacing: 10) {
                Glyph.icon(rate.title, size: 15, fallback: .settings)
                Text(rate.title).font(Theme.body).foregroundStyle(Theme.ink)
                Spacer(minLength: 6)
                Button { GameFeel.shared.tap(); change(rate.id, max(lo, value - 25)) } label: {
                    InkIcon(glyph: .minus, size: 13, weight: 1.8).frame(width: 34, height: 30)
                }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink)
                .background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
                .disabled(value <= lo)
                Text(value == 0 ? "关闭" : "\(value)%").font(Theme.body).monospacedDigit()
                    .foregroundStyle(value == 100 ? Theme.ink : Theme.seal)
                    .frame(minWidth: 50).contentTransition(.numericText())
                Button { GameFeel.shared.tap(); change(rate.id, min(hi, value + 25)) } label: {
                    InkIcon(glyph: .plus, size: 13, weight: 1.8).frame(width: 34, height: 30)
                }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink)
                .background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
                .disabled(value >= hi)
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            if rate.id != Self.rates.last?.id { Divider2() }
        }
    }
}
