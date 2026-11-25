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

/// 极简古籍交互按钮（完整回归 4.3 轻盈无影美学：扁平朱砂主态 / 纯宣纸细墨边次态，零渐变零阴影零 GPU 卡顿）。
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
        let stroke: Color = solid ? Color.clear : (accent ? Theme.seal.opacity(0.34) : Theme.line.opacity(0.75))
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
            .padding(.horizontal, compact ? 11 : 14)
            .background(
                solid ? Theme.seal : (accent ? Theme.seal.opacity(0.055) : Theme.paperLight.opacity(0.84)),
                in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                    .stroke(stroke, lineWidth: 0.7)
            )
            .opacity(disabled ? 0.42 : 1.0)
        }
        .buttonStyle(PressStyle())
        .disabled(disabled)
    }
}

/// 古籍无框主操作按钮（4.3 纯净朱砂实底 + 宣纸白字，直标核心后果，零阴影零廉价渐变）。
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
            .frame(minHeight: 44)
            .padding(.horizontal, 16)
            .background(
                Theme.seal.opacity(disabled ? 0.36 : 1.0),
                in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
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
                    .font(Theme.serif(17.5))
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
                        solid: urgent,
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

/// 二级菜单目录入口行（4.3 极简宣纸风）：将重型子模块拆入独立二级子页，秒开不卡顿且留白疏朗。
struct EditorialSubMenuRow: View {
    let title: String
    var subtitle: String? = nil
    var badge: String? = nil
    var accentBadge: Bool = false
    let icon: PhosphorGlyph
    let action: () -> Void

    var body: some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            HStack(spacing: 12) {
                PhosphorIcon(glyph: icon, size: 17, weight: accentBadge ? .fill : .light)
                    .foregroundStyle(accentBadge ? Theme.seal : Theme.ink)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(Theme.serif(15.5))
                        .tracking(0.6)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(Theme.sans(12.2))
                            .foregroundStyle(Theme.ink2)
                            .lineLimit(1)
                            .minimumScaleFactor(0.82)
                    }
                }
                Spacer(minLength: 6)
                if let badge, !badge.isEmpty {
                    PaperTag(text: badge, color: accentBadge ? Theme.seal : Theme.ink2, size: 10.5)
                }
                PhosphorIcon(glyph: .chevronRight, size: 12, weight: .light)
                    .foregroundStyle(Theme.ink2.opacity(0.65))
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// 二级子页顶部轻盈返回条（零重弹窗卡顿，页内无缝返回主页面）。
struct EditorialSubPageBar: View {
    let parentTitle: String
    let title: String
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button {
                    GameFeel.shared.tap()
                    onBack()
                } label: {
                    HStack(spacing: 4) {
                        PhosphorIcon(glyph: .chevronRight, size: 12, weight: .light)
                            .rotationEffect(.degrees(180))
                        Text("返回\(parentTitle)")
                            .font(Theme.sans(13.5))
                    }
                    .foregroundStyle(Theme.seal)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Spacer(minLength: 8)
                Text(title)
                    .font(Theme.serif(16))
                    .tracking(1.2)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
            .padding(.vertical, 8)
            EditorialDivider(inset: Theme.Layout.pageInset)
        }
    }
}
