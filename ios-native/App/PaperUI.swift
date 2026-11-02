import SwiftUI
import LieguojiCore

// MARK: - Paper and memorial language
//
// Panels read like an imperial memorial (奏折) on aged paper: the original parchment texture under
// a warm wash, faint vermilion column rules, a double border, brush (TW-Kai) headings with a
// vermilion seal, Chinese numerals for ranks, and ink that unfolds rather than pops.

/// Aged paper: the original parchment, warmed, with faint vertical memorial rules.
struct MemorialPaper: View {
    var rules = true
    /// Full-bleed under a whole sheet; false for small paper chips (it must not grow past them).
    var fullBleed = true
    /// The parchment multiplied onto the paper colour once, with its warm wash: drawing it is then a
    /// plain image (a live multiply blend made every sheet animation render offscreen and stutter).
    private static let texture: UIImage? = {
        guard let url = Bundle.main.url(forResource: "parchment", withExtension: "jpg", subdirectory: "World"), let parchment = UIImage(contentsOfFile: url.path) else { return nil }
        let size = CGSize(width: 1024, height: 1024), rect = CGRect(origin: .zero, size: size)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor(Theme.paper).setFill(); ctx.fill(rect)
            let k = max(size.width / parchment.size.width, size.height / parchment.size.height)
            let w = parchment.size.width * k, h = parchment.size.height * k
            parchment.draw(in: CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h), blendMode: .multiply, alpha: 0.55)
            let colors = [UIColor(red: 0.98, green: 0.95, blue: 0.88, alpha: 0.55).cgColor, UIColor.clear.cgColor, UIColor(red: 0.55, green: 0.42, blue: 0.25, alpha: 0.10).cgColor] as CFArray
            if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.5, 1]) {
                ctx.cgContext.drawLinearGradient(g, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
            }
        }
    }()
    var body: some View {
        // The base colour takes exactly the offered size; the texture and folds are overlays clipped to
        // it, so the paper never widens or lengthens the view it backs.
        let paper = Theme.paper
            .overlay { if let t = Self.texture { Image(uiImage: t).resizable().scaledToFill() } }
            .overlay {
                if rules {
                    // A memorial folds like an accordion: alternate panels catch the light differently,
                    // each crease a soft shadow line; faint vermilion column rules inside. One canvas draw.
                    Canvas { ctx, size in
                        let panel: CGFloat = 136
                        var x: CGFloat = 0, i = 0
                        while x < size.width {
                            let colors: [Color] = i % 2 == 0 ? [Color.white.opacity(0.10), .clear] : [Color.black.opacity(0.035), .clear]
                            ctx.fill(Path(CGRect(x: x, y: 0, width: panel, height: size.height)),
                                     with: .linearGradient(Gradient(colors: colors), startPoint: CGPoint(x: x, y: 0), endPoint: CGPoint(x: x + panel, y: 0)))
                            if x > 0 { ctx.stroke(Path { p in p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x, y: size.height)) }, with: .color(Color(red: 0.4, green: 0.3, blue: 0.18).opacity(0.10)), lineWidth: 1) }
                            x += panel; i += 1
                        }
                        var rule = Path(), c: CGFloat = 22
                        while c < size.width { rule.move(to: CGPoint(x: c, y: 0)); rule.addLine(to: CGPoint(x: c, y: size.height)); c += 34 }
                        ctx.stroke(rule, with: .color(Theme.seal.opacity(0.06)), lineWidth: 0.6)
                    }
                    .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .top) {
                // The brocade binding of a memorial's cover: a deep red band edged in gold.
                if rules && fullBleed {
                    VStack(spacing: 0) {
                        LinearGradient(colors: [Color(red: 0.45, green: 0.12, blue: 0.08), Color(red: 0.6, green: 0.18, blue: 0.11)], startPoint: .top, endPoint: .bottom).frame(height: 5)
                        Rectangle().fill(Color(red: 0.78, green: 0.62, blue: 0.3).opacity(0.85)).frame(height: 1)
                    }
                }
            }
            .clipped()
        if fullBleed { paper.ignoresSafeArea() } else { paper }
    }
}

/// A vermilion seal: square, white characters cut into red, slightly rotated, pressed in.
struct Seal: View {
    let text: String
    var size: CGFloat = 40
    @State private var pressed = false
    var body: some View {
        let chars = Array(text)
        VStack(spacing: 0) {
            ForEach(0..<((chars.count + 1) / 2), id: \.self) { row in
                HStack(spacing: 0) {
                    ForEach(0..<2, id: \.self) { col in
                        let i = col * ((chars.count + 1) / 2) + row
                        Text(i < chars.count ? String(chars[chars.count - 1 - i]) : "").font(Theme.kai(size * 0.36)).foregroundStyle(Theme.paper2)
                            .frame(width: size * 0.42, height: size * 0.42)
                    }
                }
            }
        }
        .padding(size * 0.06)
        .background(Theme.seal, in: RoundedRectangle(cornerRadius: size * 0.08))
        .overlay(RoundedRectangle(cornerRadius: size * 0.06).stroke(Theme.paper2.opacity(0.7), lineWidth: 1).padding(size * 0.05))
        .rotationEffect(.degrees(-6))
        .scaleEffect(pressed ? 1 : 1.6).opacity(pressed ? 0.92 : 0)
        .onAppear { withAnimation(.spring(response: 0.38, dampingFraction: 0.55).delay(0.15)) { pressed = true } }
    }
}

/// A memorial heading: brush title, an ink rule and a seal; the subtitle reads like the docket line.
struct MemorialHeader: View {
    let title: String
    var subtitle: String?
    var seal: String = "御览"
    @State private var inked = false
    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(Theme.kai(30)).foregroundStyle(Theme.ink).tracking(4)
                Rectangle().fill(LinearGradient(colors: [Theme.ink.opacity(0.75), Theme.ink.opacity(0)], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 1.5).scaleEffect(x: inked ? 1 : 0, anchor: .leading)
                if let subtitle { Text(subtitle).font(Theme.kai(14)).foregroundStyle(Theme.ink2) }
            }
            Spacer(minLength: 8)
            Seal(text: seal, size: 46)
        }
        .padding(.horizontal, 22).padding(.top, 22)
        .onAppear { withAnimation(.easeOut(duration: 0.6)) { inked = true } }
    }
}

enum ChineseNumeral {
    static let digits = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
    /// 1 → 一, 10 → 十, 12 → 十二, 21 → 二十一 (ranks up to 99).
    static func of(_ n: Int) -> String {
        if n < 10 { return digits[max(0, n)] }
        let t = n / 10, u = n % 10
        return (t == 1 ? "" : digits[t]) + "十" + (u == 0 ? "" : digits[u])
    }
}

// MARK: - Map views

/// The original's colour views (keys 1–6 of ViewManager) plus the terrain map.
enum MapViewMode: String, CaseIterable, Identifiable {
    case state, alliance, culture, family, religion, polity, economy, terrain
    var id: String { rawValue }
    var title: String { ["state": "国家", "alliance": "联盟", "culture": "文化", "family": "家族", "religion": "宗教", "polity": "政体", "economy": "经济", "terrain": "地形"][rawValue]! }
    var symbol: String { ["state": "flag.fill", "alliance": "person.3.fill", "culture": "character.book.closed.fill", "family": "house.fill", "religion": "sun.max.fill", "polity": "building.columns.fill", "economy": "chart.bar.fill", "terrain": "mountain.2.fill"][rawValue]! }
}

/// A strip of paper tabs that unrolls from the button; the selected view is marked by a sliding seal.
struct MapViewSwitcher: View {
    @Binding var mode: MapViewMode
    @Binding var open: Bool
    @Namespace private var marker
    var body: some View {
        VStack(spacing: 2) {
            ForEach(MapViewMode.allCases) { m in
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { mode = m }
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: m.symbol).font(.system(size: 13, weight: .semibold))
                        Text(m.title).font(Theme.kai(13))
                    }
                    .foregroundStyle(mode == m ? Theme.paper2 : Theme.ink)
                    .frame(width: 50, height: 46)
                    .background {
                        if mode == m { RoundedRectangle(cornerRadius: 9).fill(Theme.seal).matchedGeometryEffect(id: "seal", in: marker).shadow(color: Theme.seal.opacity(0.35), radius: 4, y: 2) }
                    }
                }
                .buttonStyle(PressStyle())
            }
        }
        .padding(5)
        .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 14)))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.ink.opacity(0.18), lineWidth: 1))
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(Theme.seal.opacity(0.25), lineWidth: 0.6).padding(3))
        .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.2), radius: 12, y: 5)
        .scaleEffect(x: 1, y: open ? 1 : 0.05, anchor: .top).opacity(open ? 1 : 0)
        .animation(.spring(response: 0.42, dampingFraction: 0.82), value: open)
    }
}

/// The legend of a colour view: a paper slip listing the largest groups with their colours.
struct MapViewLegend: View {
    let mode: MapViewMode
    let legend: [MapViewData.Entry]
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(mode.title + "图").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                Spacer(minLength: 4)
                Text("\(legend.count)").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
            }
            Rectangle().fill(Theme.ink.opacity(0.25)).frame(height: 0.8)
            ForEach(Array(legend.prefix(6).enumerated()), id: \.offset) { i, e in
                HStack(spacing: 7) {
                    RoundedRectangle(cornerRadius: 2).fill(Names.color(e.color)).frame(width: 12, height: 12)
                        .overlay(RoundedRectangle(cornerRadius: 2).stroke(Theme.ink.opacity(0.25), lineWidth: 0.5))
                    Text(e.name.isEmpty ? "—" : e.name).font(Theme.kai(13)).foregroundStyle(Theme.ink).lineLimit(1)
                    Spacer(minLength: 4)
                    Text("\(e.count)省").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                }
                .transition(.opacity.combined(with: .move(edge: .leading)))
            }
        }
        .padding(12).frame(width: 168)
        .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 12)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.ink.opacity(0.18), lineWidth: 1))
        .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.18), radius: 10, y: 4)
    }
}

struct MapViewData: Decodable {
    struct Entry: Decodable, Equatable { let name: String; let color: String; let count: Int }
    let fills: [String]
    let legend: [Entry]
    /// Group name boxes (culture, family, religion views); nil keeps the state names.
    let labels: [GroupLabel]?
}

/// A map name box for a group of a colour view: LabelUtility box with the group's name.
struct GroupLabel: Decodable, Equatable {
    let name: String
    let box: WorldMeta.LabelBox
    enum K: String, CodingKey { case name }
    init(from decoder: Decoder) throws {
        name = try decoder.container(keyedBy: K.self).decode(String.self, forKey: .name)
        box = try WorldMeta.LabelBox(from: decoder)
    }
}

// MARK: - Rankings (StatisticsInfoUI)

struct StatisticsRow: Decodable, Identifiable {
    var id: String { name }
    let name: String; let nation: Int; let value: Double; let text: String; let color: String?
}

/// The statistics panel as a memorial: five folds (国力、人口、经济、战争、宗教), ranks in Chinese
/// numerals, ink bars that brush in one after another.
struct StatisticsSheet: View {
    @ObservedObject var model: GameModel
    let openNation: (Int) -> Void
    static let categories: [(id: String, title: String)] = [("power", "国力排行"), ("population", "人口排名"), ("economy", "经济排行"), ("war", "战争统计"), ("religion", "宗教信息")]
    @State private var category = "power"
    @State private var rows: [StatisticsRow] = []
    @State private var brushed = false
    @Namespace private var fold
    var body: some View {
        ZStack {
            MemorialPaper()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    MemorialHeader(title: Self.categories.first { $0.id == category }?.title ?? "", subtitle: model.state.map { "\($0.dateText) · 呈御览" }, seal: "奏折")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(Self.categories, id: \.id) { c in
                                Button { withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { category = c.id } } label: {
                                    Text(c.title).font(Theme.kai(15)).foregroundStyle(category == c.id ? Theme.seal : Theme.ink2)
                                        .padding(.horizontal, 12).padding(.vertical, 8)
                                        .background {
                                            if category == c.id {
                                                VStack(spacing: 0) { Spacer(); Rectangle().fill(Theme.seal).frame(height: 2) }.matchedGeometryEffect(id: "fold", in: fold)
                                            }
                                        }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    let top = max(1, rows.map { abs($0.value) }.max() ?? 1)
                    VStack(spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                            Button { if row.nation >= 0 { openNation(row.nation) } } label: {
                                HStack(spacing: 12) {
                                    Text(ChineseNumeral.of(i + 1)).font(Theme.kai(i < 3 ? 22 : 17)).foregroundStyle(i < 3 ? Theme.seal : Theme.ink2).frame(width: 34)
                                    VStack(alignment: .leading, spacing: 5) {
                                        HStack {
                                            if let c = row.color { RoundedRectangle(cornerRadius: 2).fill(Names.color(c)).frame(width: 10, height: 10) }
                                            Text(row.name).font(Theme.kai(18)).foregroundStyle(Theme.ink).lineLimit(1)
                                            Spacer(minLength: 6)
                                            Text(row.text).font(Theme.kai(14)).foregroundStyle(row.value < 0 ? Theme.seal : Theme.ink2).monospacedDigit()
                                        }
                                        // The ink bar brushes in, staggered by rank.
                                        GeometryReader { g in
                                            Capsule().fill(LinearGradient(colors: [Theme.ink.opacity(0.78), Theme.ink.opacity(0.35)], startPoint: .leading, endPoint: .trailing))
                                                .frame(width: max(2, g.size.width * CGFloat(abs(row.value) / top)) * (brushed ? 1 : 0.001), height: 4)
                                                .animation(.easeOut(duration: 0.55).delay(Double(i) * 0.05), value: brushed)
                                        }
                                        .frame(height: 4)
                                    }
                                }
                                .padding(.horizontal, 18).padding(.vertical, 11).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if i < rows.count - 1 { Rectangle().fill(Theme.ink.opacity(0.1)).frame(height: 0.7).padding(.leading, 64) }
                        }
                        if rows.isEmpty { Text(category == "war" ? "天下无战事" : "暂无记录").font(Theme.kai(17)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(30) }
                    }
                    .background(Theme.paper2.opacity(0.45), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.ink.opacity(0.12), lineWidth: 1))
                    .padding(.horizontal, 14)
                }
                .padding(.bottom, 28)
            }
        }
        .task(id: "\(category)-\(model.state?.day ?? 0)") {
            let next = await model.statistics(category)
            if next.map(\.name) != rows.map(\.name) { brushed = false }
            rows = next
            try? await Task.sleep(nanoseconds: 30_000_000)
            brushed = true
        }
    }
}

// MARK: - Edicts (天下诏令)

struct WorldSettings: Decodable {
    let worldAuto: Bool; let maximumMonths: Int; let alliances: Bool
    let rebellion: Bool?; let rebellionMonths: Int
    let families: Bool?; let familyMonths: Int; let civilWar: Bool?; let civilMonths: Int
    let vassals: Bool?
}

/// The original's world AI and rule settings as an imperial edict: each change is proclaimed.
struct EdictSheet: View {
    @ObservedObject var model: GameModel
    let say: (String) -> Void
    @State private var s: WorldSettings?
    var body: some View {
        ZStack {
            MemorialPaper()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    MemorialHeader(title: "天下诏令", subtitle: "奉天承运，诏曰：", seal: "诏")
                    if let s {
                        section("外交") {
                            toggle("世界自动外交", s.worldAuto, "worldAuto")
                            Divider2()
                            stepper("最长战争期限", s.maximumMonths, 0...480, 6, "月", "maximumMonths", zero: "不限")
                        }
                        section("联盟") { toggle("各国自主结盟", s.alliances, "alliances") }
                        if let rebellion = s.rebellion {
                            section("行省叛乱") {
                                toggle("允许行省叛乱", rebellion, "rebellion")
                                Divider2()
                                stepper("叛乱最短间隔", s.rebellionMonths, 0...240, 6, "月", "rebellionMonths")
                            }
                        }
                        if let families = s.families, let civil = s.civilWar {
                            section("家族") {
                                toggle("允许家族叛乱", families, "families")
                                Divider2()
                                stepper("家族叛乱间隔", s.familyMonths, 0...240, 6, "月", "familyMonths")
                                Divider2()
                                toggle("允许内战", civil, "civilWar")
                                Divider2()
                                stepper("内战最短间隔", s.civilMonths, 0...240, 6, "月", "civilMonths")
                            }
                        }
                        if let vassals = s.vassals { section("附庸") { toggle("允许附庸叛变", vassals, "vassals") } }
                        Text("钦此。").font(Theme.kai(20)).foregroundStyle(Theme.ink).frame(maxWidth: .infinity, alignment: .trailing).padding(.horizontal, 26)
                    } else { ProgressView().frame(maxWidth: .infinity).padding(40) }
                }
                .padding(.bottom, 28)
            }
        }
        .task { await reload() }
    }
    private func reload() async { s = await model.worldSettings() }
    private func apply(_ key: String, _ value: Int) {
        Task { if let e = await model.setWorld(key, value) { say(e) } else { say("诏令已颁行") }; await reload() }
    }
    @ViewBuilder private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        SectionLabel(title)
        Group2 { content() }.padding(.horizontal, 16)
    }
    private func toggle(_ title: String, _ on: Bool, _ key: String) -> some View {
        PaperSwitch(title: title, on: Binding(get: { on }, set: { apply(key, $0 ? 1 : 0) }))
    }
    private func stepper(_ title: String, _ value: Int, _ range: ClosedRange<Int>, _ step: Int, _ unit: String, _ key: String, zero: String? = nil) -> some View {
        HStack(spacing: 10) {
            Text(title).font(Theme.kai(17)).foregroundStyle(Theme.ink2)
            Spacer()
            Button { apply(key, max(range.lowerBound, value - step)) } label: { Image(systemName: "minus").font(.system(size: 14, weight: .bold)).frame(width: 36, height: 32) }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line)).disabled(value <= range.lowerBound)
            Text(value == 0 && zero != nil ? zero! : "\(value) \(unit)").font(Theme.kai(18)).foregroundStyle(Theme.ink).frame(minWidth: 64).contentTransition(.numericText())
            Button { apply(key, min(range.upperBound, value + step)) } label: { Image(systemName: "plus").font(.system(size: 14, weight: .bold)).frame(width: 36, height: 32) }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line)).disabled(value >= range.upperBound)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
}

// MARK: - Chronicle as a hand scroll (纪事卷)

/// A wooden scroll rod with brass caps, top and bottom of the chronicle.
struct ScrollRod: View {
    var body: some View {
        HStack(spacing: 0) {
            Capsule().fill(LinearGradient(colors: [Color(red: 0.72, green: 0.56, blue: 0.25), Color(red: 0.45, green: 0.32, blue: 0.12)], startPoint: .top, endPoint: .bottom)).frame(width: 14, height: 20)
            RoundedRectangle(cornerRadius: 5).fill(LinearGradient(colors: [Color(red: 0.42, green: 0.22, blue: 0.12), Color(red: 0.22, green: 0.1, blue: 0.05), Color(red: 0.36, green: 0.18, blue: 0.09)], startPoint: .top, endPoint: .bottom)).frame(height: 14)
            Capsule().fill(LinearGradient(colors: [Color(red: 0.72, green: 0.56, blue: 0.25), Color(red: 0.45, green: 0.32, blue: 0.12)], startPoint: .top, endPoint: .bottom)).frame(width: 14, height: 20)
        }
        .shadow(color: .black.opacity(0.25), radius: 3, y: 2)
    }
}

/// The one heading style for sections in every panel: a short seal-red stroke and the title.
struct SectionLabel: View {
    let title: String; var inset = true
    init(_ title: String, inset: Bool = true) { self.title = title; self.inset = inset }
    var body: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 1).fill(Theme.seal).frame(width: 3, height: 15)
            Text(title).font(Theme.kai(17)).foregroundStyle(Theme.ink)
        }
        .frame(maxWidth: inset ? .infinity : nil, alignment: .leading)
        .padding(.horizontal, inset ? 22 : 0)
    }
}
