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
            Seal(text: seal, size: 32)
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
    case state, alliance, culture, family, religion, polity, economy, goods, region, terrain
    var id: String { rawValue }
    var title: String { ["state": "国家", "alliance": "联盟", "culture": "文化", "family": "家族", "religion": "宗教", "polity": "政体", "economy": "经济", "goods": "特产", "region": "区域", "terrain": "地形"][rawValue]! }
    var symbol: String { ["state": "flag.fill", "alliance": "person.3.fill", "culture": "character.book.closed.fill", "family": "house.fill", "religion": "sun.max.fill", "polity": "building.columns.fill", "economy": "chart.bar.fill", "goods": "shippingbox.fill", "region": "square.grid.3x3.fill", "terrain": "mountain.2.fill"][rawValue]! }
}

/// A strip of paper tabs that unrolls from the button; the selected view is marked by a sliding seal.
struct MapViewSwitcher: View {
    @Binding var mode: MapViewMode
    @Binding var open: Bool
    @Namespace private var marker
    /// Landscape: the column of views was taller than the screen and ran under the bottom bar; it
    /// becomes a grid of four.
    @Environment(\.verticalSizeClass) private var vertical
    var body: some View {
        Group {
            if vertical == .compact {
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(50), spacing: 2), count: 4), spacing: 2) { buttons }
            } else {
                VStack(spacing: 2) { buttons }
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
    @ViewBuilder private var buttons: some View {
        ForEach(MapViewMode.allCases) { m in
            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { mode = m }
            } label: {
                VStack(spacing: 3) {
                    Image(systemName: m.symbol).font(.system(size: 13, weight: .regular))
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
    static let categoryIcon = ["power": "chart.bar.fill", "population": "person.3", "economy": "banknote", "wars": "flag.2.crossed", "campaigns": "scope", "war": "chart.xyaxis.line", "religion": "book.closed"]
    static let categories: [(id: String, title: String)] = [("power", "国力排行"), ("population", "人口排名"), ("economy", "经济排行"), ("wars", "当前战争"), ("campaigns", "战役"), ("war", "战争统计"), ("religion", "宗教信息")]
    /// 当前战争: attacker against defender, the cause and how long it has lasted (longest first).
    static func currentWars(_ state: GameState?, _ map: WorldMap?) -> [StatisticsRow] {
        guard let state, let map else { return [] }
        func name(_ n: Int) -> String { n >= 0 && n < map.meta.nations.count ? map.meta.nations[n].name : "?" }
        return state.wars.map { w in
            let days = max(0, state.day - w.startDay), y = days / 360, m = days % 360 / 30
            let span = y > 0 ? "\(y)年\(m)个月" : "\(m)个月"
            return StatisticsRow(name: "\(name(w.attacker)) 攻 \(name(w.defender))", nation: w.attacker, value: Double(days), text: "\(w.casusBelli) · \(span)",
                                 color: w.attacker >= 0 && w.attacker < map.meta.nations.count ? map.meta.nations[w.attacker].color : nil)
        }
        .sorted { $0.value > $1.value }
    }
    @State private var category = "power"
    @State private var rows: [StatisticsRow] = []
    @State private var brushed = false
    var body: some View {
        ZStack {
            MemorialPaper()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    MemorialHeader(title: Self.categories.first { $0.id == category }?.title ?? "", subtitle: model.state.map { "\($0.dateText) · 呈御览" }, seal: "奏折")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(Self.categories, id: \.id) { c in
                                // The same paper chips as the other pages' tabs (scrolling: five of them).
                                let on = category == c.id
                                Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { category = c.id } } label: {
                                    HStack(spacing: 5) {
                                        Image(systemName: Self.categoryIcon[c.id] ?? "list.number").font(.system(size: 13)).foregroundStyle(on ? Theme.paper2 : Theme.seal.opacity(0.85))
                                        Text(c.title).font(Theme.kai(15)).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                    }
                                    .padding(.horizontal, 14).frame(height: 40)
                                    .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.2)))
                                }
                                .buttonStyle(PressStyle())
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
                                            Capsule().fill(LinearGradient(colors: [(row.color.map { Names.color($0) } ?? Theme.ink).opacity(0.95), (row.color.map { Names.color($0) } ?? Theme.ink).opacity(0.45)], startPoint: .leading, endPoint: .trailing))
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
                        if rows.isEmpty { Text(category == "war" || category == "wars" || category == "campaigns" ? "天下无战事" : "暂无记录").font(Theme.kai(17)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(30) }
                    }
                    .background(Theme.paper2.opacity(0.45), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.ink.opacity(0.12), lineWidth: 1))
                    .padding(.horizontal, 14)
                }
                .padding(.bottom, 28)
            }
        }
        .task(id: "\(category)-\(model.state?.day ?? 0)") {
            let next = category == "wars" ? Self.currentWars(model.state, model.map) : await model.statistics(category)
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

/// The ranges of the world rates (Regimes.ruleRanges), in percent.
enum WorldRuleRange {
    static func of(_ key: String) -> ClosedRange<Int> {
        switch key { case "war": return 0...300; case "march": return 25...300; case "rebel", "event": return 0...400; default: return 25...400 }
    }
}

/// The original's world AI and rule settings as an imperial edict: each change is proclaimed.
struct EdictSheet: View {
    @ObservedObject var model: GameModel
    let say: (String) -> Void
    @State private var s: WorldSettings?
    /// 天下规则: world rates in percent of normal.
    @State private var rules: [String: Int] = [:]
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
                        section("天下") {
                            order("停止所有战争", "国与国的战争全部就地停战（内战与叛乱照旧）", "stopWars")
                            Divider2()
                            order("解除所有同盟", "现有联盟全部解散", "dissolveAlliances")
                        }
                        if !rules.isEmpty {
                            section("天下规则") {
                                ruleStepper("战争频率", "war", 25, zero: "止战")
                                Divider2()
                                ruleStepper("战斗烈度", "damage", 25)
                                Divider2()
                                ruleStepper("行军速度", "march", 25)
                                Divider2()
                                ruleStepper("征兵规模", "levy", 25)
                                Divider2()
                                ruleStepper("造舰速度", "ships", 25)
                                Divider2()
                                ruleStepper("叛乱频率", "rebel", 25)
                                Divider2()
                                ruleStepper("事件频率", "event", 25)
                            }
                            Text("以常态为 100%。战争频率影响各国宣战意愿，战斗烈度影响交战伤亡，征兵规模影响新征军队的兵力，造舰速度影响舰队重建与扩编。")
                                .font(Theme.kai(13)).foregroundStyle(Theme.ink2).padding(.horizontal, 26)
                        }
                        Text("钦此。").font(Theme.kai(20)).foregroundStyle(Theme.ink).frame(maxWidth: .infinity, alignment: .trailing).padding(.horizontal, 26)
                    } else { InkBusy(text: "载入……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(40) }
                }
                .padding(.bottom, 28)
            }
        }
        .task { await reload() }
    }
    private func reload() async { s = await model.worldSettings(); rules = await model.worldRules() }
    @State private var confirming: (title: String, key: String)?
    /// A one-off world order (the original's world editor), confirmed first.
    private func order(_ title: String, _ note: String, _ key: String) -> some View {
        Button { confirming = (title, key) } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Theme.kai(17)).foregroundStyle(Theme.seal)
                    Text(note).font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .regular)).foregroundStyle(Theme.ink2)
            }
            .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .confirmationDialog(confirming?.title ?? "", isPresented: Binding(get: { confirming?.key == key }, set: { if !$0 { confirming = nil } }), titleVisibility: .visible) {
            Button(title, role: .destructive) {
                confirming = nil
                apply(key, 1)
            }
        }
    }
    private func ruleStepper(_ title: String, _ key: String, _ step: Int, zero: String? = nil) -> some View {
        let value = rules[key] ?? 100
        let range = WorldRuleRange.of(key)
        return HStack(spacing: 10) {
            Text(title).font(Theme.kai(17)).foregroundStyle(Theme.ink2)
            Spacer()
            Button { setRule(key, max(range.lowerBound, value - step)) } label: { Image(systemName: "minus").font(.system(size: 14, weight: .regular)).frame(width: 36, height: 32) }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line)).disabled(value <= range.lowerBound)
            Text(value == 0 && zero != nil ? zero! : "\(value)%").font(Theme.kai(18)).foregroundStyle(value == 100 ? Theme.ink : Theme.seal).frame(minWidth: 64).contentTransition(.numericText())
            Button { setRule(key, min(range.upperBound, value + step)) } label: { Image(systemName: "plus").font(.system(size: 14, weight: .regular)).frame(width: 36, height: 32) }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line)).disabled(value >= range.upperBound)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
    private func setRule(_ key: String, _ value: Int) {
        rules[key] = value
        Task { if let e = await model.setWorldRule(key, Double(value)) { say(e) } else { say("诏令已颁行") }; rules = await model.worldRules() }
    }
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
            Glyph.icon(title, size: 15)
            Text(title).font(Theme.kai(17)).foregroundStyle(Theme.ink2)
            Spacer()
            Button { apply(key, max(range.lowerBound, value - step)) } label: { Image(systemName: "minus").font(.system(size: 14, weight: .regular)).frame(width: 36, height: 32) }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line)).disabled(value <= range.lowerBound)
            Text(value == 0 && zero != nil ? zero! : "\(value) \(unit)").font(Theme.kai(18)).foregroundStyle(Theme.ink).frame(minWidth: 64).contentTransition(.numericText())
            Button { apply(key, min(range.upperBound, value + step)) } label: { Image(systemName: "plus").font(.system(size: 14, weight: .regular)).frame(width: 36, height: 32) }
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

// MARK: paper controls — every panel uses these instead of the system controls, so inputs,
// choices and confirmations look the same everywhere.

extension View {
    /// A paper input field: a cream capsule with a fine ink rule.
    func paperField(width: CGFloat? = nil) -> some View {
        self.font(Theme.kai(17)).foregroundStyle(Theme.ink).tint(Theme.seal)
            .padding(.horizontal, 14).frame(width: width, height: 40)
            .frame(maxWidth: width == nil ? .infinity : nil)
            .background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
    }
}

/// A labelled choice from a long list (cultures, provinces): the row shows the current value and
/// opens a parchment list, in place of the system menu.
struct PaperMenu<T: Hashable>: View {
    let title: String
    let items: [(T, String)]
    @Binding var selection: T
    @State private var open = false
    var body: some View {
        Button { open = true } label: {
            HStack(spacing: 10) {
                Text(title).font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                Spacer(minLength: 12)
                Text(items.first { $0.0 == selection }?.1 ?? "请选择").font(Theme.kai(17)).foregroundStyle(Theme.ink).lineLimit(1)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .regular)).foregroundStyle(Theme.ink2)
            }
            .padding(.horizontal, 16).frame(minHeight: 46).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $open) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    SheetHeader(title: title, subtitle: "点一行选定", seal: "选")
                    Group2 {
                        if items.isEmpty { Row(label: title, value: "没有可选项") }
                        ForEach(items.indices, id: \.self) { i in
                            Button {
                                selection = items[i].0
                                open = false
                            } label: {
                                HStack(spacing: 10) {
                                    Text(items[i].1).font(Theme.kai(17)).foregroundStyle(items[i].0 == selection ? Theme.seal : Theme.ink).lineLimit(1)
                                    Spacer()
                                    if items[i].0 == selection { Image(systemName: "checkmark").font(.system(size: 13, weight: .regular)).foregroundStyle(Theme.seal) }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if i < items.count - 1 { Divider2() }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            }
            .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
        }
    }
}

/// The founding progress bar when the fraction is not known yet: an ink track and a vermilion segment.
struct InkBusy: View {
    var text: String? = nil
    var tint: Color = Theme.seal
    var track: Color = Theme.ink.opacity(0.1)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var slide = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let text { Text(text).font(Theme.kai(14)).foregroundStyle(Theme.ink2) }
            GeometryReader { g in
                let span = max(18, g.size.width * 0.35)
                ZStack(alignment: .leading) {
                    Capsule().fill(track)
                    Capsule().fill(tint).frame(width: span).offset(x: reduceMotion ? 0 : (slide ? max(0, g.size.width - span) : 0))
                }
            }
            .frame(height: 4)
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { slide = true }
        }
    }
}

/// The confirming action of a panel: a full-width seal-red plate.
struct SealButton: View {
    let title: String
    var busy = false
    var disabled = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { InkBusy(tint: Theme.paper2, track: Theme.paper2.opacity(0.35)).frame(width: 44) }
                Text(title).font(Theme.kai(18))
            }
            .foregroundStyle(Theme.paper2).frame(maxWidth: .infinity).frame(height: 48)
            .background(Theme.seal.opacity(disabled ? 0.35 : 1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(PressStyle()).disabled(disabled || busy)
    }
}

/// Label, seal-red track and value on one line. The thumb is vermilion on the same ink bar as founding.
struct PaperSlider: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    var step: Double? = nil
    var onEditingChanged: ((Bool) -> Void)? = nil
    let format: (Double) -> String
    var body: some View {
        HStack(spacing: 12) {
            Text(title).font(Theme.kai(16)).foregroundStyle(Theme.ink2).frame(width: 68, alignment: .leading)
            PaperTrack(value: $value, range: range, step: step, onEditingChanged: onEditingChanged)
            Text(format(value)).font(Theme.kai(16)).foregroundStyle(Theme.ink).monospacedDigit().frame(width: 52, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAdjustableAction { direction in
            let delta = step ?? max((range.upperBound - range.lowerBound) / 20, 0.0001)
            let next = value + (direction == .increment ? delta : -delta)
            value = min(range.upperBound, max(range.lowerBound, next))
        }
    }
}

/// Ink track and vermilion thumb. Values stay on the same binding as the old slider.
struct PaperTrack: View {
    @Binding var value: Double
    let range: ClosedRange<Double>
    var step: Double?
    var onEditingChanged: ((Bool) -> Void)?
    private var fraction: Double {
        let span = range.upperBound - range.lowerBound
        guard span > 0 else { return 0 }
        return min(1, max(0, (value - range.lowerBound) / span))
    }
    var body: some View {
        GeometryReader { g in
            let width = max(g.size.width, 1)
            let thumb: CGFloat = 14
            let x = (width - thumb) * CGFloat(fraction)
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.ink.opacity(0.1)).frame(height: 4)
                Capsule().fill(Theme.seal).frame(width: x + thumb / 2, height: 4)
                Circle().fill(Theme.seal).frame(width: thumb, height: thumb)
                    .overlay(Circle().stroke(Theme.paper, lineWidth: 2))
                    .offset(x: x)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { drag in
                    onEditingChanged?(true)
                    write(drag.location.x, width: width)
                }
                .onEnded { drag in
                    write(drag.location.x, width: width)
                    onEditingChanged?(false)
                })
        }
        .frame(height: 22)
    }
    private func write(_ location: CGFloat, width: CGFloat) {
        let span = range.upperBound - range.lowerBound
        guard width > 0, span > 0 else { return }
        let t = min(1, max(0, Double(location / width)))
        var next = range.lowerBound + t * span
        if let step, step > 0 {
            let n = ((next - range.lowerBound) / step).rounded()
            next = min(range.upperBound, max(range.lowerBound, range.lowerBound + n * step))
        }
        value = next
    }
}

// MARK: 统一卡片与标签

extension View {
    /// The one card look of every page (Group2's): paper, an ink rim, a fine vermilion inner line and a
    /// soft shadow. `tint` washes the paper faintly in a colour (a relation group, a side in battle).
    func paperCard(tint: Color? = nil) -> some View {
        self
            .background(Theme.paper2.opacity(0.62), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .background((tint ?? .clear).opacity(0.07), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke((tint ?? Theme.ink).opacity(tint == nil ? 0.2 : 0.35), lineWidth: 1))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.seal.opacity(0.16), lineWidth: 0.6).padding(3))
            .shadow(color: Color(red: 0.25, green: 0.18, blue: 0.08).opacity(0.08), radius: 6, y: 2)
    }
}

/// The one tag look: a short word on a filled capsule (状态、等级、立场…).
struct PaperTag: View {
    let text: String
    var color: Color = Theme.seal
    var size: CGFloat = 12
    var body: some View {
        Text(text).font(Theme.kai(size)).foregroundStyle(Theme.paper2).lineLimit(1).fixedSize()
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(color, in: Capsule())
    }
}


// MARK: 长按菜单与页内提示

struct PressMenuItem: Identifiable { let id = UUID(); let title: String; let symbol: String; var destructive = false; let action: () -> Void }
struct PressMenu: Identifiable { let id = UUID(); let title: String; var subtitle: String? = nil; let items: [PressMenuItem] }
/// A long press also ends as a tap on the row's button: the button asks this first.
enum PressGuard {
    static var fired = false
    static func consume() -> Bool { defer { fired = false }; return fired }
}
/// The row sinks and tints under the finger, then a tick of haptics and the paper menu.
private struct LongPressLift: ViewModifier {
    let menu: () -> PressMenu?
    let present: (PressMenu) -> Void
    @GestureState private var pressing = false
    func body(content: Content) -> some View {
        content
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Theme.seal.opacity(pressing ? 0.1 : 0)))
            .scaleEffect(pressing ? 0.965 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.7), value: pressing)
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.38).updating($pressing) { v, s, _ in s = v }.onEnded { _ in
                guard let m = menu() else { return }
                PressGuard.fired = true
                GameFeel.shared.tap()
                present(m)
            })
    }
}
private struct PressMenuCard: View {
    let menu: PressMenu
    let close: () -> Void
    @State private var shown = false
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(menu.title).font(Theme.kai(19)).foregroundStyle(Theme.ink).lineLimit(1)
                if let s = menu.subtitle { Text(s).font(Theme.kai(12)).foregroundStyle(Theme.ink2).lineLimit(2) }
            }
            .padding(.horizontal, 18).padding(.vertical, 12)
            ForEach(Array(menu.items.enumerated()), id: \.element.id) { i, item in
                Divider2()
                Button { GameFeel.shared.tap(); close(); item.action() } label: {
                    HStack(spacing: 12) {
                        Image(systemName: item.symbol).font(.system(size: 15)).foregroundStyle(Theme.seal).frame(width: 22)
                        Text(item.title).font(Theme.kai(17)).foregroundStyle(item.destructive ? Theme.seal : Theme.ink)
                        Spacer()
                    }
                    .padding(.horizontal, 18).padding(.vertical, 13).contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                // The rows settle in one after another.
                .opacity(shown ? 1 : 0).offset(y: shown ? 0 : 8)
                .animation(.easeOut(duration: 0.22).delay(0.04 * Double(i)), value: shown)
            }
        }
        .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous)))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.ink.opacity(0.22), lineWidth: 1))
        .overlay(alignment: .top) { Rectangle().fill(Theme.seal).frame(height: 3).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous)) }
        .shadow(color: .black.opacity(0.25), radius: 18, y: 8)
        .padding(.horizontal, 44)
        .onAppear { shown = true }
    }
}
private struct PressMenuHost: ViewModifier {
    @Binding var menu: PressMenu?
    func body(content: Content) -> some View {
        content.overlay {
            ZStack {
                if let m = menu {
                    Color.black.opacity(0.3).ignoresSafeArea().onTapGesture { dismiss() }.transition(.opacity)
                    PressMenuCard(menu: m, close: dismiss).id(m.id).transition(.scale(scale: 0.84).combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.34, dampingFraction: 0.78), value: menu?.id)
        }
    }
    private func dismiss() { menu = nil; PressGuard.fired = false }
}
/// A message inside a page (the game's own toast sits under a full-height sheet, where nothing showed).
private struct PaperToastHost: ViewModifier {
    @Binding var text: String?
    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                ZStack {
                    if let text {
                        HStack(spacing: 8) {
                            Seal(text: "令", size: 20)
                            Text(text).font(Theme.kai(15)).foregroundStyle(Theme.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous)))
                        .paperCard()
                        .shadow(color: .black.opacity(0.2), radius: 10, y: 4)
                        .padding(.horizontal, 28).padding(.top, 10)
                        .id(text)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .onTapGesture { self.text = nil }
                    }
                }
                .animation(.spring(response: 0.36, dampingFraction: 0.8), value: text)
            }
            .task(id: text) {
                guard text != nil else { return }
                try? await Task.sleep(nanoseconds: 2_400_000_000)
                if !Task.isCancelled { text = nil }
            }
    }
}
extension View {
    func pressMenu(_ menu: @escaping () -> PressMenu?, present: @escaping (PressMenu) -> Void) -> some View { modifier(LongPressLift(menu: menu, present: present)) }
    func pressMenuHost(_ menu: Binding<PressMenu?>) -> some View { modifier(PressMenuHost(menu: menu)) }
    func paperToast(_ text: Binding<String?>) -> some View { modifier(PaperToastHost(text: text)) }
}
