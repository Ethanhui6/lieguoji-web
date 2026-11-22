import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

struct ChipPicker<T: Hashable>: View {
    let items: [(T, String)]
    @Binding var selection: T
    @Namespace private var pill
    var body: some View {
        // 严格视觉一致性：只有当整排所有选项均配有手绘图标时才展示图标，杜绝同一排中「有的有图标、有的纯文字」的割裂感。
        let showIcons = !items.isEmpty && items.allSatisfy { Glyph.of($0.1) != nil }
        if items.count > 4 {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(items.indices, id: \.self) { i in
                            chip(items[i], showIcons: showIcons, segmented: false)
                                .id(items[i].0)
                        }
                    }
                    .padding(.vertical, 1)
                }
                .onAppear { proxy.scrollTo(selection, anchor: .center) }
                .onChange(of: selection) { _, next in
                    withAnimation(Motion.tap) { proxy.scrollTo(next, anchor: .center) }
                }
            }
        } else {
            // 苹果式同心圆角分段控件（外槽 14pt continuous + 3.5pt 内边距 + 内滑块 10.5pt continuous）
            let outerShape = RoundedRectangle(cornerRadius: 14, style: .continuous)
            HStack(spacing: 4) {
                ForEach(items.indices, id: \.self) { i in
                    chip(items[i], showIcons: showIcons, segmented: true)
                }
            }
            .padding(3.5)
            .background(Theme.wash.opacity(0.68), in: outerShape)
            .overlay(outerShape.stroke(Theme.ink.opacity(0.11), lineWidth: 0.8))
        }
    }
    private func chip(_ item: (T, String), showIcons: Bool, segmented: Bool) -> some View {
        let on = item.0 == selection
        let corner: CGFloat = segmented ? 10.5 : Theme.Control.cornerControl
        return Button {
            GameFeel.shared.tap()
            withAnimation(Motion.tap) { selection = item.0 }
        } label: {
            VStack(spacing: 2) {
                if showIcons, let s = Glyph.of(item.1) {
                    if let g = GameActionLabel.glyph(for: s) {
                        InkIcon(glyph: g, size: 15, weight: on ? 1.85 : 1.55, filled: on,
                                accent: on ? Theme.paper2.opacity(0.3) : Theme.seal.opacity(0.24))
                            .foregroundStyle(on ? Theme.paper2 : Theme.seal.opacity(0.86))
                            .frame(height: 17)
                    } else {
                        Image(systemName: s).font(.system(size: 13, weight: .regular))
                            .foregroundStyle(on ? Theme.paper2 : Theme.seal.opacity(0.85))
                            .frame(height: 17)
                    }
                }
                Text(item.1).font(Theme.body).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
            }
            .padding(.horizontal, segmented ? 4 : 13)
            .frame(minWidth: segmented ? nil : 62, maxWidth: segmented ? .infinity : nil)
            .frame(height: showIcons ? 46 : 36)
            .background {
                let shape = RoundedRectangle(cornerRadius: corner, style: .continuous)
                if on {
                    shape.fill(Theme.seal)
                        .matchedGeometryEffect(id: "chip-pill", in: pill)
                        .shadow(color: Theme.seal.opacity(0.24), radius: 4, y: 1.5)
                } else if !segmented {
                    shape.fill(Theme.paper2.opacity(0.88))
                        .overlay(shape.stroke(Theme.ink.opacity(0.14), lineWidth: 0.85))
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: corner, style: .continuous))
        }
        .buttonStyle(PressStyle())
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
        return Image(systemName: symbol).font(.system(size: 15, weight: .regular)).foregroundStyle(enabled ? Theme.ink : Theme.ink2.opacity(0.4))
            .frame(width: 46, height: 38)
            .background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
            .contentShape(Capsule())
            .onTapGesture { change(delta) }
            .onLongPressGesture(minimumDuration: 0.35, pressing: { pressing in
                repeatTask?.cancel()
                guard pressing else { return }
                repeatTask = Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 350_000_000)
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
    @State private var appeared = false
    var body: some View {
        Group {
            if let edit {
                Button(action: edit) { content }
                    .buttonStyle(PressStyle())
            } else { content }
        }
        // Tiles rise into place when a page opens.
        .opacity(appeared ? 1 : 0).offset(y: appeared ? 0 : 8)
        .onAppear { withAnimation(Motion.panel) { appeared = true } }
    }
    private var content: some View {
        VStack(alignment: .leading, spacing: 5) {
            GlyphLabel(text: label).font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.7)
            Text(value).font(Theme.title).foregroundStyle(warn ? Theme.seal : Theme.ink).lineLimit(1).minimumScaleFactor(0.62).monospacedDigit()
                .contentTransition(.numericText()).animation(Motion.tap, value: value)
            if let fraction {
                InkBar(fraction: fraction, color: warn ? Theme.seal : Theme.ink.opacity(0.65), height: 4)
                    .animation(Motion.panel, value: fraction)
            } else if reserveBar { Color.clear.frame(height: 4) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

/// A row of stat tiles in one memorial fold, split by hairlines.
struct StatStrip: View {
    let tiles: [StatTile]
    private func tile(_ i: Int, _ bars: Bool) -> StatTile { var t = tiles[i]; t.reserveBar = bars; return t }
    var body: some View {
        Group2 {
            let bars = tiles.contains { $0.fraction != nil }
            HStack(alignment: .top, spacing: 0) {
                ForEach(tiles.indices, id: \.self) { i in
                    if i > 0 { Rectangle().fill(Theme.ink.opacity(0.12)).frame(width: 0.8).frame(maxHeight: .infinity).padding(.vertical, 10) }
                    tile(i, bars)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
    }
}
