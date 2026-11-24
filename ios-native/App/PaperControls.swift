import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

struct ChipPicker<T: Hashable>: View {
    let items: [(T, String)]
    @Binding var selection: T
    @Namespace private var pill
    var body: some View {
        let useScroll = items.count > 5 || (items.count == 5 && items.contains { $0.1.count > 4 })
        VStack(spacing: 0) {
            if useScroll {
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 20) {
                            ForEach(items.indices, id: \.self) { i in
                                chip(items[i], segmented: false)
                                    .id(items[i].0)
                            }
                        }
                        .padding(.horizontal, 2)
                    }
                    .onAppear { proxy.scrollTo(selection, anchor: .center) }
                    .onChange(of: selection) { _, next in
                        withAnimation(Motion.tap) { proxy.scrollTo(next, anchor: .center) }
                    }
                }
            } else {
                HStack(spacing: 0) {
                    ForEach(items.indices, id: \.self) { i in
                        chip(items[i], segmented: true)
                    }
                }
            }
            Rectangle().fill(Theme.hairline).frame(height: 0.75)
        }
    }
    private func chip(_ item: (T, String), segmented: Bool) -> some View {
        let on = item.0 == selection
        return Button {
            GameFeel.shared.tap()
            withAnimation(Motion.tap) { selection = item.0 }
        } label: {
            VStack(spacing: 8) {
                Text(item.1)
                    .font(on ? Theme.serif(14.5) : Theme.sans(14, weight: .regular))
                    .tracking(on ? 1.0 : 0.3)
                    .foregroundStyle(on ? Theme.seal : Theme.ink2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                ZStack {
                    Color.clear.frame(height: 1.75)
                    if on {
                        Rectangle()
                            .fill(Theme.seal)
                            .frame(height: 1.75)
                            .matchedGeometryEffect(id: "chip-underline", in: pill)
                    }
                }
            }
            .padding(.top, 8)
            .padding(.horizontal, segmented ? 4 : 2)
            .frame(maxWidth: segmented ? .infinity : nil)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// − value + (replaces the system stepper).
struct PaperStepper: View {
    let title: String
    @Binding var value: Int
    let range: ClosedRange<Int>
    let unit: String
    /// − value + with whole-button hit areas (the bare icons were easy to miss inside a scrolling
    /// sheet), hold to repeat, a tick of haptics, and a slider beneath for big moves.
    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                HStack(spacing: 8) { Glyph.icon(title, size: 15); Text(title).font(Theme.section).foregroundStyle(Theme.ink2) }
                Spacer()
                stepButton("minus", -1)
                Text("\(value) \(unit)").font(Theme.title).foregroundStyle(Theme.ink).frame(minWidth: 64)
                    .monospacedDigit().contentTransition(.numericText()).animation(Motion.tap, value: value)
                stepButton("plus", 1)
            }
            // The bare track for big moves: the title and the value are already on the line above.
            PaperTrack(value: Binding(get: { Double(value) }, set: { let v = Int($0.rounded()); if v != value { value = v; GameFeel.shared.tap() } }),
                       range: Double(range.lowerBound)...Double(range.upperBound), step: 1, onEditingChanged: nil)
                .padding(.leading, 4)
        }
    }
    private func stepButton(_ symbol: String, _ delta: Int) -> some View {
        let enabled = delta < 0 ? value > range.lowerBound : value < range.upperBound
        return Button { change(delta) } label: {
            InkIcon(glyph: delta < 0 ? .minus : .plus, size: 14, weight: 1.85)
                .foregroundStyle(enabled ? Theme.ink : Theme.ink2.opacity(0.4))
                .frame(width: 46, height: 38)
                .background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
                .contentShape(Capsule())
        }
        .buttonStyle(PressStyle())
        .onLongPressGesture(minimumDuration: 0.38, maximumDistance: 8, pressing: { pressing in
            repeatTask?.cancel()
            guard pressing else { return }
            repeatTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 380_000_000)
                while !Task.isCancelled { change(delta); try? await Task.sleep(nanoseconds: 90_000_000) }
            }
        }, perform: {})
    }
    @State private var repeatTask: Task<Void, Never>?
    private func change(_ delta: Int) {
        let next = min(range.upperBound, max(range.lowerBound, value + delta))
        if next != value { value = next; GameFeel.shared.tap() }
    }
}

/// A paper switch (replaces the system toggle).
struct PaperSwitch: View {
    let title: String
    @Binding var on: Bool
    var body: some View {
        Button {
            GameFeel.shared.tap()
            withAnimation(Motion.tap) { on.toggle() }
        } label: {
            HStack(spacing: 10) {
                Glyph.icon(title, size: 15, fallback: .settings)
                Text(title).font(Theme.section).foregroundStyle(Theme.ink)
                Spacer()
                ZStack(alignment: on ? .trailing : .leading) {
                    Capsule()
                        .fill(on ? Theme.seal : Theme.wash)
                        .overlay(Capsule().stroke(on ? Color.clear : Theme.ink.opacity(0.14), lineWidth: 0.8))
                        .frame(width: 50, height: 30)
                    Circle()
                        .fill(Theme.paper2)
                        .frame(width: 24, height: 24)
                        .padding(3)
                        .shadow(color: Color(red: 0.14, green: 0.10, blue: 0.05).opacity(0.20), radius: 2.5, y: 1.2)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Nation chips in a wrapping grid (replaces the system menu picker).
struct NationGrid: View {
    let map: WorldMap
    let nations: [Int]
    @Binding var selection: Int
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
            ForEach(nations, id: \.self) { n in
                let on = n == selection
                Button { withAnimation(Motion.tap) { selection = n } } label: {
                    HStack(spacing: 6) {
                        RoundedRectangle(cornerRadius: 4, style: .continuous).fill(Names.color(map.meta.nations[n].color)).frame(width: 12, height: 12)
                        Text(map.meta.nations[n].name).font(Theme.body).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(Theme.ink).frame(maxWidth: .infinity).frame(height: 38)
                    .background(on ? Theme.wash : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Theme.seal : Theme.line, lineWidth: on ? 2 : 1))
                }
                .buttonStyle(PressStyle())
            }
        }
    }
}

// 大事传报（宣战、议和、攻克……）见 HeraldScene.swift。

// MARK: - fleets (open-sea worlds)

/// A stat on a memorial: the label, a large value and an optional gauge.
struct StatTile: View {
    let label: String
    let value: String
    var fraction: Double? = nil
    var warn = false
    /// 点一下数字即可修改: the tile becomes a button with a small brush mark.
    var edit: (() -> Void)? = nil
    /// In a strip where another tile has a bar, keep the room for one so every value sits on one line.
    var reserveBar = false
    /// 同一排 StatStrip 仅在全部列皆有对应水墨微标时统一显示图标，杜绝单列突兀带图标。
    var showIcon = true
    var body: some View {
        Group {
            if let edit {
                Button(action: edit) { content }
                    .buttonStyle(PressStyle())
            } else { content }
        }
    }
    private var content: some View {
        VStack(alignment: .leading, spacing: 6) {
            Group {
                if showIcon {
                    GlyphLabel(text: label)
                } else {
                    Text(label)
                }
            }
            .font(Theme.sans(12)).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.78)
            .frame(height: 16, alignment: .leading)
            EditorialValueText(value, size: 20, color: warn ? Theme.seal : Theme.ink)
                .frame(height: 26, alignment: .leading)
                .contentTransition(.numericText()).animation(Motion.tap, value: value)
            if let fraction {
                InkBar(fraction: fraction, color: warn ? Theme.seal : Theme.ink.opacity(0.62), height: 2.5)
                    .animation(Motion.panel, value: fraction)
            } else if reserveBar { Color.clear.frame(height: 2.5) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10).padding(.vertical, 13)
        .contentShape(Rectangle())
    }
}

/// 平铺于宣纸上的四列核心数值栏（高对比 Cormorant Garamond 衬线数字 + 1px 淡墨纵线分割，零卡片盒嵌套）。
struct StatStrip: View {
    let tiles: [StatTile]
    private func tile(_ i: Int, _ bars: Bool, _ uniformIcons: Bool) -> StatTile {
        var t = tiles[i]
        t.reserveBar = bars
        t.showIcon = uniformIcons
        return t
    }
    var body: some View {
        let bars = tiles.contains { $0.fraction != nil }
        let uniformIcons = !tiles.isEmpty && tiles.allSatisfy { Glyph.of($0.label) != nil }
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                ForEach(tiles.indices, id: \.self) { i in
                    if i > 0 { Rectangle().fill(Theme.hairline).frame(width: 0.75).frame(maxHeight: .infinity).padding(.vertical, 12) }
                    tile(i, bars, uniformIcons)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            Rectangle().fill(Theme.hairline).frame(height: 0.75)
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }
}
