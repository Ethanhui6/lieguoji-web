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

/// 衬线数字混排：自动识别数值中的 ASCII 数字/标点用 Cormorant Garamond（高对比衬线 + 等宽防抖），
/// 汉字单位（万/亿/省/州/金/年）用 PingFang SC 清晰对齐基线。
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
                        .font(Theme.numeral(size * 1.18))
                        .foregroundStyle(color)
                        .monospacedDigit()
                } else {
                    Text(seg.text)
                        .font(Theme.sans(max(11.5, size * 0.72), weight: .regular))
                        .foregroundStyle(color == Theme.seal ? Theme.seal : Theme.ink2)
                }
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.72)
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

/// 古籍触感次级按钮（亮宣纸面 #FAF7F0 + 清晰暖墨细框 + 1.5pt 压印底缘）：一眼可辨为可点按按钮，彻底告别“与纯说明文字混淆”。
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
        let bg: Color = solid ? (accent ? Theme.seal : Theme.ink) : (accent ? Theme.seal.opacity(0.06) : Theme.paperLight)
        let stroke: Color = solid ? Color.clear : (accent ? Theme.seal.opacity(0.42) : Theme.line)
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            HStack(spacing: compact ? 5 : 7) {
                if let icon {
                    PhosphorIcon(glyph: icon, size: compact ? 13.5 : 15, weight: solid ? .fill : .light)
                }
                Text(title)
                    .font(Theme.sans(compact ? 13 : 14, weight: .medium))
                    .tracking(0.4)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(fg)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .frame(height: compact ? 34 : 40)
            .padding(.horizontal, compact ? 11 : 14)
            .background(bg, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                    .stroke(stroke, lineWidth: 0.9)
            )
            .shadow(color: solid ? Color.clear : Theme.ink.opacity(0.08), radius: 0, y: 1.5)
            .opacity(disabled ? 0.42 : 1.0)
        }
        .buttonStyle(PressStyle())
        .disabled(disabled)
    }
}

/// 古籍无框主操作按钮：松烟暖墨深底 `#241D17` + 宣纸亮白字 `#FAF7F0`，内镶极细书框线，直接写明核心后果。
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
                    .font(Theme.serif(15))
                    .tracking(0.8)
                if let consequence, !consequence.isEmpty {
                    Text("·")
                        .font(Theme.sans(13))
                        .opacity(0.65)
                    Text(consequence)
                        .font(Theme.sans(13, weight: .regular))
                        .opacity(0.9)
                        .monospacedDigit()
                }
            }
            .foregroundStyle(Theme.paperLight)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 46)
            .padding(.horizontal, 16)
            .background(
                (emphasized ? Theme.seal : Theme.ink).opacity(disabled ? 0.35 : 1.0),
                in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                    .stroke(Theme.paperLight.opacity(0.2), lineWidth: 0.7)
                    .padding(3)
            )
        }
        .buttonStyle(PressStyle())
        .disabled(disabled)
    }
}

/// 古籍平铺列表操作行：直接铺在宣纸上，左侧 Phosphor 轻线图标 + 右侧清晰纸框动作标，一眼明确“这是一枚可点按指令”。
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
                        .font(Theme.sans(12, weight: .medium))
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).stroke(Theme.seal.opacity(0.4), lineWidth: 0.75))
                } else {
                    HStack(spacing: 3) {
                        Text(actionLabel)
                            .font(Theme.sans(12, weight: .medium))
                        PhosphorIcon(glyph: .chevronRight, size: 11, weight: .light)
                    }
                    .foregroundStyle(accentConsequence ? Theme.seal : Theme.ink)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).stroke(accentConsequence ? Theme.seal.opacity(0.42) : Theme.line, lineWidth: 0.85))
                    .shadow(color: Theme.ink.opacity(0.06), radius: 0, y: 1)
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

/// 古籍线刻页签条：无厚重胶囊壳，以思源宋体/无衬线文本 + 1.5pt 朱砂下划线指示选中态。
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
                                .font(active ? Theme.serif(15) : Theme.sans(14.5, weight: .regular))
                                .tracking(active ? 1.2 : 0.4)
                                .foregroundStyle(active ? Theme.seal : Theme.ink2)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            Rectangle()
                                .fill(active ? Theme.seal : Color.clear)
                                .frame(height: 1.75)
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
