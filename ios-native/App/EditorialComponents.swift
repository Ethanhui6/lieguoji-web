import SwiftUI

/// 新中式极简古籍编辑风核心组件库（全部采用非泛型独立结构体，零卡片套娃、零廉价特效、高留白呼吸感）。

/// 1px 淡墨分割线（rgba(44, 36, 30, 0.12)）。
struct EditorialDivider: View {
    var inset: CGFloat = 0
    var body: some View {
        Rectangle()
            .fill(Theme.hairline)
            .frame(height: 0.75)
            .padding(.horizontal, inset)
    }
}

/// 古典清秀数值混排（回归旧版 TW-Kai 等高数字 + 等宽防抖）：数字清晰端正，汉字单位基线自然齐平。
struct EditorialValueText: View {
    let raw: String
    var size: CGFloat = 20
    var color: Color = Theme.ink

    init(_ raw: String, size: CGFloat = 20, color: Color = Theme.ink) {
        self.raw = raw
        self.size = size
        self.color = color
    }

    var body: some View {
        let parts = Self.splitSegments(raw)
        HStack(alignment: .firstTextBaseline, spacing: 1.5) {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, seg in
                if seg.isNum {
                    Text(seg.text)
                        .font(Theme.numeral(size))
                        .foregroundStyle(color)
                        .monospacedDigit()
                } else {
                    Text(seg.text)
                        .font(Theme.sans(max(11.5, size * 0.74), weight: .regular))
                        .foregroundStyle(color == Theme.seal ? Theme.seal : Theme.ink2)
                }
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.74)
        .fixedSize(horizontal: true, vertical: false)
    }

    private struct Seg { let text: String; let isNum: Bool }
    private static func splitSegments(_ s: String) -> [Seg] {
        guard !s.isEmpty else { return [] }
        var out = [Seg]()
        var cur = ""
        var curNum: Bool? = nil
        func isNumChar(_ c: Character) -> Bool {
            c.isASCII && (c.isNumber || "+-−.%×,/:".contains(c))
        }
        for ch in s {
            let num = isNumChar(ch)
            if curNum == nil {
                curNum = num
                cur.append(ch)
            } else if curNum == num {
                cur.append(ch)
            } else {
                out.append(Seg(text: cur, isNum: curNum!))
                cur = String(ch)
                curNum = num
            }
        }
        if !cur.isEmpty, let curNum {
            out.append(Seg(text: cur, isNum: curNum))
        }
        return out
    }
}

/// 古籍分节标题：思源宋体 + 疏朗字距 + 左侧极细 Phosphor 图标 + 底部 1px 淡墨线。
struct EditorialSectionHeader: View {
    let title: String
    var icon: PhosphorGlyph? = nil
    var trailing: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let icon {
                    PhosphorIcon(glyph: icon, size: 15, weight: .light)
                        .foregroundStyle(Theme.ink2)
                }
                Text(title)
                    .font(Theme.serif(16))
                    .foregroundStyle(Theme.ink)
                    .tracking(1.8)
                Spacer(minLength: 8)
                if let trailing, !trailing.isEmpty {
                    Text(trailing)
                        .font(Theme.sans(12))
                        .foregroundStyle(Theme.ink2)
                        .lineLimit(1)
                }
            }
            EditorialDivider()
        }
    }
}

/// 疏朗呼吸感交互按钮：实心主按钮回归特色朱砂红 `#A83226`，次级按钮改用淡绢轻底与 0.65pt 极细边（零厚重黑框与硬投影）。
struct EditorialTactileButton: View {
    let title: String
    var icon: PhosphorGlyph? = nil
    var accent: Bool = false
    var solid: Bool = false
    var compact: Bool = false
    var fullWidth: Bool = false
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        let fg: Color = solid ? Theme.paperLight : (accent ? Theme.seal : Theme.ink)
        let bg: Color = solid ? Theme.seal : (accent ? Theme.seal.opacity(0.07) : Theme.wash.opacity(0.55))
        let stroke: Color = solid ? Theme.paperLight.opacity(0.22) : (accent ? Theme.seal.opacity(0.28) : Theme.hairline)
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            HStack(spacing: compact ? 5 : 7) {
                if let icon {
                    PhosphorIcon(glyph: icon, size: compact ? 13.5 : 15, weight: solid ? .fill : .light)
                }
                Text(title)
                    .font(Theme.sans(compact ? 13 : 14, weight: .regular))
                    .tracking(0.5)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(fg)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .frame(height: compact ? 34 : 40)
            .padding(.horizontal, compact ? 12 : 15)
            .background(bg, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                    .stroke(stroke, lineWidth: solid ? 0.65 : 0.65)
                    .padding(solid ? 2.5 : 0)
            )
            .opacity(disabled ? 0.42 : 1.0)
        }
        .buttonStyle(PressStyle())
        .disabled(disabled)
    }
}

/// 古籍特色朱砂主操作按钮：恢复招牌朱砂红底 `#A83226` 配宣纸白字与极细内书框，直接写明核心后果。
struct EditorialInkButton: View {
    let title: String
    var consequence: String? = nil
    var icon: PhosphorGlyph? = nil
    var emphasized: Bool = false
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                if let icon {
                    PhosphorIcon(glyph: icon, size: 15, weight: .light)
                }
                Text(title)
                    .font(Theme.serif(15.5))
                    .tracking(1.0)
                if let consequence, !consequence.isEmpty {
                    Text("·")
                        .font(Theme.sans(13))
                        .opacity(0.65)
                    Text(consequence)
                        .font(Theme.sans(13, weight: .regular))
                        .opacity(0.92)
                        .monospacedDigit()
                }
            }
            .foregroundStyle(Theme.paperLight)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 46)
            .padding(.horizontal, 16)
            .background(
                Theme.seal.opacity(disabled ? 0.35 : 1.0),
                in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                    .stroke(Theme.paperLight.opacity(0.24), lineWidth: 0.7)
                    .padding(3)
            )
        }
        .buttonStyle(PressStyle())
        .disabled(disabled)
    }
}

/// 古籍平铺列表操作行：直接铺在宣纸上，左侧 Phosphor 轻线图标 + 右侧淡墨柔底动作指示，疏朗克制零按钮堆砌。
struct EditorialActionRow: View {
    let title: String
    var detail: String? = nil
    var consequence: String? = nil
    var icon: PhosphorGlyph
    var actionLabel: String = "执行"
    var accentConsequence: Bool = false
    var active: Bool = false
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            HStack(alignment: .center, spacing: 12) {
                PhosphorIcon(glyph: icon, size: 17, weight: active ? .fill : .light)
                    .foregroundStyle(active ? Theme.seal : Theme.ink)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(title)
                            .font(Theme.serif(15))
                            .foregroundStyle(active ? Theme.seal : Theme.ink)
                        if let consequence, !consequence.isEmpty {
                            Text(consequence)
                                .font(Theme.sans(12.5, weight: .regular))
                                .foregroundStyle(accentConsequence ? Theme.seal : Theme.ink2)
                                .monospacedDigit()
                                .lineLimit(1)
                        }
                    }
                    if let detail, !detail.isEmpty {
                        Text(detail)
                            .font(Theme.sans(12.5))
                            .foregroundStyle(Theme.ink2)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 8)
                if active {
                    Text("施行中")
                        .font(Theme.sans(12, weight: .regular))
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                } else {
                    HStack(spacing: 3) {
                        Text(actionLabel)
                            .font(Theme.sans(12.5, weight: .regular))
                        PhosphorIcon(glyph: .chevronRight, size: 11, weight: .light)
                    }
                    .foregroundStyle(accentConsequence ? Theme.seal : Theme.ink2)
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(accentConsequence ? Theme.seal.opacity(0.07) : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
            .padding(.vertical, 13)
            .contentShape(Rectangle())
            .opacity(disabled ? 0.45 : 1.0)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}

/// 古籍线刻页签条：选中与未选中严格共用同一古典正楷字形，仅以朱砂色与底部 1.8pt 朱砂线区分（彻底消除点击换字体割裂感）。
struct EditorialTabStrip<Value: Hashable>: View {
    let items: [(Value, String)]
    @Binding var selection: Value

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(items.indices, id: \.self) { i in
                    let item = items[i]
                    let active = selection == item.0
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { selection = item.0 }
                    } label: {
                        VStack(spacing: 9) {
                            Text(item.1)
                                .font(Theme.serif(15))
                                .tracking(0.8)
                                .foregroundStyle(active ? Theme.seal : Theme.ink2)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            Rectangle()
                                .fill(active ? Theme.seal : Color.clear)
                                .frame(height: 1.8)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            EditorialDivider()
        }
    }
}

/// 页顶单一焦点摘要条（渐进式披露核心：每页顶部只突出 1 项最核心的当前状态或待办议案，零套娃阴影）。
struct EditorialFocusLead: View {
    let eyebrow: String
    let headline: String
    var detail: String? = nil
    var urgent: Bool = false
    var actionTitle: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Rectangle()
                .fill(urgent ? Theme.seal : Theme.ink.opacity(0.32))
                .frame(width: 2)
            VStack(alignment: .leading, spacing: 6) {
                Text(eyebrow)
                    .font(Theme.sans(11.5, weight: .medium))
                    .tracking(1.2)
                    .foregroundStyle(urgent ? Theme.seal : Theme.ink2)
                Text(headline)
                    .font(Theme.serif(17))
                    .tracking(0.8)
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail, !detail.isEmpty {
                    Text(detail)
                        .font(Theme.sans(13))
                        .foregroundStyle(Theme.ink2)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let actionTitle, let onAction {
                    EditorialTactileButton(
                        title: actionTitle,
                        icon: .chevronRight,
                        accent: urgent,
                        compact: true,
                        action: onAction
                    )
                    .padding(.top, 4)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}
