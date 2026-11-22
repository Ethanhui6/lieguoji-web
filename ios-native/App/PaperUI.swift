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
    /// 性能优化：将奏折折页光影与朱红竖格预烘焙为静态纹理，彻底消除 Sheet 弹起／缩放动画期间逐帧 Canvas 重绘卡顿。
    private static let ruledTexture: UIImage? = {
        guard let base = texture else { return nil }
        let size = base.size, rect = CGRect(origin: .zero, size: size)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            base.draw(in: rect)
            let cg = ctx.cgContext
            let panel: CGFloat = 170
            var x: CGFloat = 0, i = 0
            let space = CGColorSpaceCreateDeviceRGB()
            while x < size.width {
                let c0 = (i % 2 == 0 ? UIColor.white.withAlphaComponent(0.10) : UIColor.black.withAlphaComponent(0.035)).cgColor
                let c1 = UIColor.clear.cgColor
                if let g = CGGradient(colorsSpace: space, colors: [c0, c1] as CFArray, locations: [0, 1]) {
                    cg.saveGState()
                    cg.clip(to: CGRect(x: x, y: 0, width: panel, height: size.height))
                    cg.drawLinearGradient(g, start: CGPoint(x: x, y: 0), end: CGPoint(x: x + panel, y: 0), options: [])
                    cg.restoreGState()
                }
                if x > 0 {
                    cg.setStrokeColor(UIColor(red: 0.4, green: 0.3, blue: 0.18, alpha: 0.10).cgColor)
                    cg.setLineWidth(1.2)
                    cg.move(to: CGPoint(x: x, y: 0))
                    cg.addLine(to: CGPoint(x: x, y: size.height))
                    cg.strokePath()
                }
                x += panel; i += 1
            }
            cg.setStrokeColor(UIColor(Theme.seal).withAlphaComponent(0.06).cgColor)
            cg.setLineWidth(0.8)
            var c: CGFloat = 28
            while c < size.width {
                cg.move(to: CGPoint(x: c, y: 0))
                cg.addLine(to: CGPoint(x: c, y: size.height))
                c += 42
            }
            cg.strokePath()
        }
    }()
    var body: some View {
        // The base colour takes exactly the offered size; the pre-baked image is an overlay clipped to
        // it. Crucially, `scaledToFill()` on a 1024×1024 square extends its hit-test rect far beyond
        // `.clipped()`/`.clipShape()` in SwiftUI, so both decorative overlays MUST disable hit-testing
        // and the base must clip hit-testing via `.contentShape(Rectangle())`.
        let image = rules ? (Self.ruledTexture ?? Self.texture) : Self.texture
        let paper = Theme.paper
            .overlay {
                if let t = image {
                    Image(uiImage: t).resizable().scaledToFill().allowsHitTesting(false)
                }
            }
            .overlay(alignment: .top) {
                // The brocade binding of a memorial's cover: a deep red band edged in gold.
                if rules && fullBleed {
                    VStack(spacing: 0) {
                        LinearGradient(colors: [Color(red: 0.45, green: 0.12, blue: 0.08), Color(red: 0.6, green: 0.18, blue: 0.11)], startPoint: .top, endPoint: .bottom).frame(height: 5)
                        Rectangle().fill(Color(red: 0.78, green: 0.62, blue: 0.3).opacity(0.85)).frame(height: 1)
                    }
                    .allowsHitTesting(false)
                }
            }
            .clipped()
            .contentShape(Rectangle())
        if fullBleed { paper.ignoresSafeArea() } else { paper }
    }
}

/// 全作统一的苹果流体物理动效（iOS 17+ 原生 `.snappy` / `.smooth` / `.bouncy` 弹簧曲线：利落跟手、克制回弹、落印有质感）：
enum Motion {
    /// 点按、开关、滑块与分段控件反馈（苹果原生 snappy 流体弹簧）。
    static let tap = Animation.snappy(duration: 0.24, extraBounce: 0.06)
    /// 面板切换、展开收起、布局变化（跟手顺滑无拖尾）。
    static let panel = Animation.snappy(duration: 0.34, extraBounce: 0.03)
    /// 较大的位移（整页滑入、数据条生长、镜头与浮印吸附）。
    static let drift = Animation.smooth(duration: 0.44)
    /// 纯透明度与颜色淡入淡出。
    static let fade = Animation.easeOut(duration: 0.18)
    /// 墨迹显现、细线展开与图表绘制。
    static let reveal = Animation.easeOut(duration: 0.42)
    /// 落印确认（标题印、宣战印、警报跃动）：饱满弹性，如朱印压纸。
    static let stamp = Animation.bouncy(duration: 0.36, extraBounce: 0.20)
}

/// 印面：全作统一的朱印。始终是正方形，按字数定版式，使一字印与多字印的视觉重量一致——
/// 一字居中大字；两字竖排一列；三、四字两列，自右列起、自上而下（传统印文读序）。
/// 统一的圆角、内框细线、朱色与压印斑驳；`filled` 为假时是白文转朱文的描边印（用于可点的链接印）。
struct SealFace: View {
    let text: String
    var size: CGFloat = 40
    var color: Color = Theme.seal
    var filled = true
    var body: some View {
        let chars = Array(text.prefix(4)).map(String.init)
        let ink = filled ? Theme.paper2 : color
        let shape = RoundedRectangle(cornerRadius: size * 0.12, style: .continuous)
        ZStack {
            if filled { shape.fill(color) } else { shape.fill(Theme.paper2) }
            // 压印斑驳：几处纸色细点，让印面像真的盖在纸上（位置由字决定，固定不闪）。
            if filled { SealSpecks(seed: text).fill(Theme.paper2.opacity(0.16)) }
            shape.inset(by: size * 0.07).stroke(ink.opacity(filled ? 0.75 : 0.6), lineWidth: max(0.8, size * 0.025))
            Group {
                switch chars.count {
                case 0: EmptyView()
                case 1: Text(chars[0]).font(Theme.kai(size * 0.6))
                case 2: VStack(spacing: -size * 0.04) { ForEach(chars.indices, id: \.self) { Text(chars[$0]).font(Theme.kai(size * 0.36)) } }
                default:
                    // 右列先读：右列放前一半，左列放后一半。
                    let half = (chars.count + 1) / 2
                    HStack(spacing: size * 0.02) {
                        VStack(spacing: -size * 0.03) { ForEach(half..<chars.count, id: \.self) { Text(chars[$0]).font(Theme.kai(size * 0.34)) } }
                        VStack(spacing: -size * 0.03) { ForEach(0..<half, id: \.self) { Text(chars[$0]).font(Theme.kai(size * 0.34)) } }
                    }
                }
            }
            .foregroundStyle(ink)
        }
        .frame(width: size, height: size)
        .overlay(filled ? nil : shape.stroke(color.opacity(0.7), lineWidth: max(0.8, size * 0.03)))
    }
}

/// 印面斑驳：由印文定出的几处小圆点（同一方印每次都一样）。
private struct SealSpecks: Shape {
    let seed: String
    func path(in r: CGRect) -> Path {
        var h: UInt32 = 2166136261
        for u in seed.utf8 { h = (h ^ UInt32(u)) &* 16777619 }
        var p = Path()
        for _ in 0..<7 {
            h = (h ^ (h >> 13)) &* 2246822519
            let x = CGFloat(h & 0xff) / 255, y = CGFloat((h >> 8) & 0xff) / 255, s = 0.02 + CGFloat((h >> 16) & 0x0f) / 15 * 0.035
            p.addEllipse(in: CGRect(x: r.minX + x * r.width, y: r.minY + y * r.height, width: s * r.width, height: s * r.width * 0.7))
        }
        return p
    }
}

/// A vermilion seal pressed onto the page (the headings' seal): the unified face, slightly rotated, stamped in once.
struct Seal: View {
    let text: String
    var size: CGFloat = 40
    @State private var pressed = false
    var body: some View {
        SealFace(text: text, size: size)
            .rotationEffect(.degrees(-4))
            .scaleEffect(pressed ? 1 : 1.35).opacity(pressed ? 0.94 : 0)
            .onAppear { withAnimation(Motion.stamp) { pressed = true } }
    }
}

/// A memorial heading: brush title, an ink rule and a seal; the subtitle reads like the docket line.
struct MemorialHeader: View {
    let title: String
    var subtitle: String?
    var seal: String = "御览"
    var showGrabber = true
    @State private var inked = false
    var body: some View {
        VStack(spacing: 0) {
            if showGrabber { SheetGrabber() }
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title).font(Theme.kai(28)).foregroundStyle(Theme.ink).tracking(3).lineLimit(1).minimumScaleFactor(0.75)
                    Rectangle().fill(LinearGradient(colors: [Theme.ink.opacity(0.75), Theme.ink.opacity(0)], startPoint: .leading, endPoint: .trailing))
                        .frame(height: 1.5).scaleEffect(x: inked ? 1 : 0, anchor: .leading)
                    if let subtitle { Text(subtitle).font(Theme.label).foregroundStyle(Theme.ink2) }
                }
                Spacer(minLength: 8)
                Seal(text: seal, size: 32)
            }
            .padding(.horizontal, Theme.Layout.sectionInset)
            .padding(.top, showGrabber ? Theme.Layout.headerTop : 18)
        }
        .onAppear { withAnimation(Motion.reveal) { inked = true } }
    }
}

enum ChineseNumeral {
    static let digits = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
    /// 1 → 一, 10 → 十, 12 → 十二, 21 → 二十一 (ranks up to 99).
    static func of(_ n: Int) -> String {
        if n < 10 { return digits[max(0, n)] }
        if n >= 100 { return "\(n)" }
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
    var glyph: InkGlyph {
        switch self {
        case .state: return .nation
        case .alliance: return .alliance
        case .culture: return .culture
        case .family: return .house
        case .religion: return .religion
        case .polity: return .polity
        case .economy: return .economy
        case .goods: return .goods
        case .region: return .region
        case .terrain: return .views
        }
    }
}

/// A strip of paper tabs that glides cleanly from the top-right button without squashing icons.
struct MapViewSwitcher: View {
    @Binding var mode: MapViewMode
    @Binding var open: Bool
    @Namespace private var marker
    /// Landscape: the column of views was taller than the screen and ran under the bottom bar; it
    /// becomes a grid of four.
    @Environment(\.verticalSizeClass) private var vertical
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous)
        Group {
            if vertical == .compact {
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(50), spacing: 2), count: 5), spacing: 2) { buttons }
            } else {
                VStack(spacing: 2) { buttons }
            }
        }
        .padding(5)
        .glass(shape)
        .offset(y: open ? 0 : -14)
        .scaleEffect(open ? 1 : 0.94, anchor: .topTrailing)
        .opacity(open ? 1 : 0)
        .animation(Motion.panel, value: open)
    }
    @ViewBuilder private var buttons: some View {
        ForEach(MapViewMode.allCases) { m in
            Button {
                withAnimation(Motion.tap) { mode = m }
            } label: {
                VStack(spacing: 3) {
                    InkIcon(glyph: m.glyph, size: 17, weight: mode == m ? 1.9 : 1.55, filled: mode == m,
                            accent: mode == m ? Theme.paper2.opacity(0.32) : Theme.seal.opacity(0.28))
                        .scaleEffect(mode == m ? 1.06 : 1)
                    Text(m.title).font(Theme.label)
                }
                .foregroundStyle(mode == m ? Theme.paper2 : Theme.ink)
                .frame(width: 50, height: 46)
                .background {
                    if mode == m {
                        RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                            .fill(Theme.seal)
                            .matchedGeometryEffect(id: "seal", in: marker)
                            .shadow(color: Theme.seal.opacity(0.28), radius: 4, y: 2)
                    }
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
    /// 点一行（带成员的同盟）：查看成员。
    var open: ((MapViewData.Entry) -> Void)? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(mode.title + "图").font(Theme.body).foregroundStyle(Theme.ink)
                Spacer(minLength: 4)
                Text("\(legend.count)").font(Theme.caption).foregroundStyle(Theme.ink2)
            }
            Rectangle().fill(Theme.ink.opacity(0.2)).frame(height: 0.8)
            ForEach(Array(legend.prefix(6).enumerated()), id: \.offset) { _, e in
                HStack(spacing: 7) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous).fill(Names.color(e.color)).frame(width: 12, height: 12)
                        .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(Theme.ink.opacity(0.22), lineWidth: 0.5))
                    Text(e.name.isEmpty ? "—" : e.name).font(Theme.label).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.82)
                    Spacer(minLength: 4)
                    Text("\(e.count)省").font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize()
                    if e.members != nil && open != nil { Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.ink2.opacity(0.6)) }
                }
                .frame(minHeight: 22).contentShape(Rectangle())
                .onTapGesture { if e.members != nil { open?(e) } }
                .transition(.opacity.combined(with: .move(edge: .leading)))
            }
        }
        .padding(12).frame(width: 224)
        .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
    }
}

struct MapViewData: Decodable {
    /// key：「alliance:ID」「none」等；members：同盟成员的国家序号（同盟图）。
    struct Entry: Decodable, Equatable { let name: String; let color: String; let count: Int; var key: String? = nil; var members: [Int]? = nil }
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
    @State private var entered = false
    @State private var switchTick = 0
    @Namespace private var catPill
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ZStack {
            MemorialPaper()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    MemorialHeader(title: Self.categories.first { $0.id == category }?.title ?? "", subtitle: model.state.map { "\($0.dateText) · 呈御览" }, seal: "奏折")
                    ScrollViewReader { proxy in
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 7) {
                                ForEach(Self.categories, id: \.id) { c in
                                    let on = category == c.id
                                    Button {
                                        GameFeel.shared.tap()
                                        withAnimation(Motion.tap) { category = c.id }
                                    } label: {
                                        HStack(spacing: 5) {
                                            if let g = GameActionLabel.glyph(for: Self.categoryIcon[c.id] ?? "") {
                                                InkIcon(glyph: g, size: 15, weight: on ? 1.85 : 1.55, filled: on,
                                                        accent: on ? Theme.paper2.opacity(0.3) : Theme.seal.opacity(0.24))
                                                    .foregroundStyle(on ? Theme.paper2 : Theme.seal.opacity(0.88))
                                            } else {
                                                Image(systemName: Self.categoryIcon[c.id] ?? "list.number").font(.system(size: 13)).foregroundStyle(on ? Theme.paper2 : Theme.seal.opacity(0.85))
                                            }
                                            Text(c.title).font(Theme.body).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                        }
                                        .padding(.horizontal, 14).frame(height: 38)
                                        .background {
                                            let shape = RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                                            if on {
                                                shape.fill(Theme.seal)
                                                    .matchedGeometryEffect(id: "stat-cat", in: catPill)
                                                    .shadow(color: Theme.seal.opacity(0.24), radius: 5, y: 2)
                                            } else {
                                                shape.fill(Theme.paper2.opacity(0.88))
                                                    .overlay(shape.stroke(Theme.ink.opacity(0.15), lineWidth: 0.9))
                                            }
                                        }
                                    }
                                    .buttonStyle(PressStyle())
                                    .id(c.id)
                                }
                            }
                            .padding(.horizontal, Theme.Layout.pageInset)
                        }
                        .onChange(of: category) { _, next in withAnimation(Motion.tap) { proxy.scrollTo(next, anchor: .center) } }
                    }
                    let top = max(1, rows.map { abs($0.value) }.max() ?? 1)
                    let showPodium = rows.count >= 3 && category != "wars" && category != "campaigns"
                    // 天下前三甲颁台（魁首 / 榜眼 / 探花）：三阶递升弹簧入场，切换榜单丝滑过渡零闪白
                    if showPodium {
                        podiumStrip(rows: Array(rows.prefix(3)), top: top)
                            .padding(.horizontal, Theme.Layout.pageInset)
                            .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .top)))
                    }
                    let restOffset = showPodium ? 3 : 0
                    let shownRows = Array(rows.dropFirst(restOffset))
                    Group2 {
                        LazyVStack(spacing: 0) {
                            ForEach(Array(shownRows.enumerated()), id: \.element.id) { offset, row in
                                let i = offset + restOffset
                                let frac = entered ? abs(row.value) / top : 0
                                Button {
                                    if row.nation >= 0 {
                                        GameFeel.shared.tap()
                                        openNation(row.nation)
                                    }
                                } label: {
                                    HStack(spacing: 12) {
                                        Text(ChineseNumeral.of(i + 1))
                                            .font(Theme.kai(i < 3 ? 20 : 16))
                                            .foregroundStyle(i < 3 ? Theme.seal : Theme.ink2)
                                            .frame(width: 34)
                                        VStack(alignment: .leading, spacing: 5) {
                                            HStack(spacing: 6) {
                                                if let c = row.color {
                                                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                                                        .fill(Names.color(c))
                                                        .frame(width: 10, height: 10)
                                                }
                                                Text(row.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                                                Spacer(minLength: 6)
                                                Text(row.text)
                                                    .font(Theme.label)
                                                    .foregroundStyle(row.value < 0 ? Theme.seal : Theme.ink2)
                                                    .monospacedDigit()
                                                    .contentTransition(.numericText())
                                            }
                                            InkBar(fraction: frac, color: row.color.map { Names.color($0) } ?? Theme.seal, height: 5, gradient: true)
                                                .animation(reduceMotion ? nil : Motion.drift.delay(min(0.22, Double(offset) * 0.022)), value: frac)
                                        }
                                    }
                                    .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
                                }
                                .buttonStyle(PressStyle())
                                if offset < shownRows.count - 1 {
                                    Divider2()
                                }
                            }
                            if rows.isEmpty {
                                Text(category == "war" || category == "wars" || category == "campaigns" ? "天下无战事" : "暂无记录")
                                    .font(Theme.section).foregroundStyle(Theme.ink2)
                                    .frame(maxWidth: .infinity).padding(30)
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                    .animation(reduceMotion ? nil : Motion.panel, value: switchTick)
                }
                .padding(.bottom, 28)
            }
        }
        .task(id: "\(category)-\(model.state?.day ?? 0)") {
            let next = category == "wars" ? Self.currentWars(model.state, model.map) : await model.statistics(category)
            withAnimation(reduceMotion ? nil : Motion.panel) {
                rows = next
                switchTick &+= 1
            }
            if !entered {
                try? await Task.sleep(nanoseconds: 40_000_000)
                withAnimation(reduceMotion ? nil : Motion.drift) { entered = true }
            }
        }
    }

    @ViewBuilder
    private func podiumStrip(rows: [StatisticsRow], top: Double) -> some View {
        let medals: [(rank: Int, label: String, color: Color, lift: CGFloat, delay: Double)] = [
            (1, "榜眼", Theme.jade, 0, 0.06),
            (0, "魁首", Theme.seal, 12, 0.0),
            (2, "探花", Color(red: 0.64, green: 0.45, blue: 0.16), 0, 0.11),
        ]
        HStack(alignment: .bottom, spacing: 9) {
            ForEach(medals, id: \.rank) { m in
                let row = rows[m.rank]
                let tint = row.color.map { Names.color($0) } ?? m.color
                let share = min(1, max(0.08, abs(row.value) / max(1, top)))
                Button {
                    if row.nation >= 0 {
                        GameFeel.shared.tap()
                        openNation(row.nation)
                    }
                } label: {
                    VStack(spacing: 6) {
                        SealFace(text: m.label, size: m.rank == 0 ? 32 : 26, color: m.color)
                            .scaleEffect(entered ? 1 : 0.72)
                            .animation(reduceMotion ? nil : Motion.stamp.delay(m.delay), value: entered)
                        RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                            .fill(tint)
                            .frame(width: m.rank == 0 ? 30 : 22, height: 3.5)
                        Text(row.name)
                            .font(m.rank == 0 ? Theme.section : Theme.body)
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1).minimumScaleFactor(0.75)
                        Text(row.text)
                            .font(Theme.caption)
                            .foregroundStyle(m.rank == 0 ? Theme.seal : Theme.ink2)
                            .monospacedDigit().lineLimit(1).minimumScaleFactor(0.72)
                            .contentTransition(.numericText())
                        InkBar(fraction: entered ? share : 0, color: tint, height: 3.5, gradient: true)
                            .padding(.top, 2)
                            .animation(reduceMotion ? nil : Motion.drift.delay(m.delay + 0.06), value: entered)
                            .animation(reduceMotion ? nil : Motion.panel, value: share)
                    }
                    .padding(.horizontal, 10).padding(.vertical, m.rank == 0 ? 14 : 11)
                    .frame(maxWidth: .infinity)
                    .paperCard(tint: m.rank == 0 ? Theme.seal : nil)
                    .padding(.bottom, m.lift)
                    .opacity(entered ? 1 : 0)
                    .offset(y: entered ? 0 : 18)
                    .animation(reduceMotion ? nil : Motion.panel.delay(m.delay), value: entered)
                }
                .buttonStyle(PressStyle())
            }
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
                LazyVStack(alignment: .leading, spacing: 14) {
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
                                .font(Theme.label).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset)
                        }
                        Text("钦此。").font(Theme.title).foregroundStyle(Theme.ink).frame(maxWidth: .infinity, alignment: .trailing).padding(.horizontal, Theme.Layout.sectionInset)
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
            HStack(spacing: 10) {
                Glyph.icon(title, size: 15, fallback: .edict)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Theme.section).foregroundStyle(Theme.seal)
                    Text(note).font(Theme.caption).foregroundStyle(Theme.ink2)
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
            Glyph.icon(title, size: 15, fallback: .settings)
            Text(title).font(Theme.section).foregroundStyle(Theme.ink2)
            Spacer()
            Button { GameFeel.shared.tap(); setRule(key, max(range.lowerBound, value - step)) } label: { Image(systemName: "minus").font(.system(size: 14, weight: .regular)).frame(width: 36, height: 32) }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line)).disabled(value <= range.lowerBound)
            Text(value == 0 && zero != nil ? zero! : "\(value)%").font(Theme.section).foregroundStyle(value == 100 ? Theme.ink : Theme.seal).frame(minWidth: 64).contentTransition(.numericText())
            Button { GameFeel.shared.tap(); setRule(key, min(range.upperBound, value + step)) } label: { Image(systemName: "plus").font(.system(size: 14, weight: .regular)).frame(width: 36, height: 32) }
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
            Text(title).font(Theme.section).foregroundStyle(Theme.ink2)
            Spacer()
            Button { apply(key, max(range.lowerBound, value - step)) } label: { Image(systemName: "minus").font(.system(size: 14, weight: .regular)).frame(width: 36, height: 32) }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line)).disabled(value <= range.lowerBound)
            Text(value == 0 && zero != nil ? zero! : "\(value) \(unit)").font(Theme.section).foregroundStyle(Theme.ink).frame(minWidth: 64).contentTransition(.numericText())
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
            RoundedRectangle(cornerRadius: 5, style: .continuous).fill(LinearGradient(colors: [Color(red: 0.42, green: 0.22, blue: 0.12), Color(red: 0.22, green: 0.1, blue: 0.05), Color(red: 0.36, green: 0.18, blue: 0.09)], startPoint: .top, endPoint: .bottom)).frame(height: 14)
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
            RoundedRectangle(cornerRadius: 1.5, style: .continuous).fill(Theme.seal).frame(width: 3, height: 15)
            Text(title).font(Theme.section).foregroundStyle(Theme.ink)
        }
        .frame(maxWidth: inset ? .infinity : nil, alignment: .leading)
        .padding(.horizontal, inset ? Theme.Layout.sectionInset : 0)
    }
}

// MARK: paper controls — every panel uses these instead of the system controls, so inputs,
// choices and confirmations look the same everywhere.

extension View {
    /// A paper input field: a cream capsule with a fine ink rule.
    func paperField(width: CGFloat? = nil) -> some View {
        self.font(Theme.section).foregroundStyle(Theme.ink).tint(Theme.seal)
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
        Button { GameFeel.shared.tap(); open = true } label: {
            HStack(spacing: 10) {
                Glyph.icon(title, size: 15, fallback: .edict)
                Text(title).font(Theme.body).foregroundStyle(Theme.ink2)
                Spacer(minLength: 12)
                Text(items.first { $0.0 == selection }?.1 ?? "请选择").font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
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
                                GameFeel.shared.tap()
                                selection = items[i].0
                                open = false
                            } label: {
                                HStack(spacing: 10) {
                                    Text(items[i].1).font(Theme.section).foregroundStyle(items[i].0 == selection ? Theme.seal : Theme.ink).lineLimit(1)
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
            .presentationDetents([.medium, .large])
            .presentationCornerRadius(Theme.Control.cornerSheet)
            .presentationBackground { MemorialPaper() }
            .presentationDragIndicator(.hidden)
            .font(Theme.section)
        }
    }
}

/// 详情数据未到时的占位：载入中写「载入……」；载入失败写明原因并给「重试」（以前失败也一直停在载入中）。
struct PanelPending: View {
    let failed: Bool
    var reason = "未能载入：世界可能已切换，或此项已不存在。"
    var busy = false
    let retry: () -> Void
    var body: some View {
        if failed {
            VStack(spacing: 10) {
                Text(reason).font(Theme.label).foregroundStyle(Theme.ink2).multilineTextAlignment(.center)
                Button(action: retry) {
                    Text("重试").font(Theme.body).foregroundStyle(Theme.seal).padding(.horizontal, 16).padding(.vertical, 6)
                        .overlay(Capsule().stroke(Theme.seal.opacity(0.6), lineWidth: 1))
                }
                .buttonStyle(PressStyle())
            }
            .frame(maxWidth: .infinity).padding(.vertical, 14).padding(.horizontal, 12)
        } else if busy {
            InkBusy(text: "载入……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(40)
        } else {
            Text("载入……").font(Theme.body).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 14)
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
            if let text { Text(text).font(Theme.label).foregroundStyle(Theme.ink2) }
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
            withAnimation(Motion.reveal.repeatForever(autoreverses: true)) { slide = true }
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
                Text(title).font(Theme.section)
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
        HStack(spacing: 10) {
            HStack(spacing: 6) {
                Glyph.icon(title, size: 13)
                Text(title).font(Theme.body).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(minWidth: 68, alignment: .leading)
            PaperTrack(value: $value, range: range, step: step, onEditingChanged: onEditingChanged)
            Text(format(value)).font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit().frame(width: 50, alignment: .trailing)
                .contentTransition(.numericText())
        }
        .accessibilityElement(children: .combine)
        .accessibilityAdjustableAction { direction in
            let delta = step ?? max((range.upperBound - range.lowerBound) / 20, 0.0001)
            let next = value + (direction == .increment ? delta : -delta)
            value = min(range.upperBound, max(range.lowerBound, next))
        }
    }
}

/// 墨轨与朱砂滑珠：拖动时滑珠如苹果控制中心般柔润放大并亮起微晕，松手弹性回位。
struct PaperTrack: View {
    @Binding var value: Double
    let range: ClosedRange<Double>
    var step: Double?
    var onEditingChanged: ((Bool) -> Void)?
    @State private var dragging = false
    private var fraction: Double {
        let span = range.upperBound - range.lowerBound
        guard span > 0 else { return 0 }
        return min(1, max(0, (value - range.lowerBound) / span))
    }
    var body: some View {
        GeometryReader { g in
            let width = max(g.size.width, 1)
            let thumb: CGFloat = 15
            let x = (width - thumb) * CGFloat(fraction)
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.ink.opacity(0.11)).frame(height: dragging ? 5.5 : 4)
                Capsule().fill(Theme.seal).frame(width: x + thumb / 2, height: dragging ? 5.5 : 4)
                ZStack {
                    Circle()
                        .fill(Theme.seal.opacity(dragging ? 0.22 : 0))
                        .frame(width: dragging ? 26 : 15, height: dragging ? 26 : 15)
                    Circle()
                        .fill(Theme.seal)
                        .frame(width: thumb, height: thumb)
                        .overlay(Circle().stroke(Theme.paper2, lineWidth: 2))
                        .shadow(color: Theme.seal.opacity(dragging ? 0.34 : 0.16), radius: dragging ? 4 : 2, y: 1)
                        .scaleEffect(dragging ? 1.18 : 1.0)
                }
                .frame(width: thumb, height: thumb)
                .offset(x: x)
            }
            .frame(maxHeight: .infinity)
            .animation(Motion.tap, value: dragging)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { drag in
                    if !dragging { dragging = true; onEditingChanged?(true) }
                    write(drag.location.x, width: width)
                }
                .onEnded { drag in
                    write(drag.location.x, width: width)
                    dragging = false
                    onEditingChanged?(false)
                })
        }
        .frame(height: 26)
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

// MARK: 统一卡片、轻量进度条与标签

/// 零 GeometryReader 的轻量墨条：用缩放矩形配胶囊裁剪，滚动列表内零二次布局抖动。
struct InkBar: View {
    let fraction: Double
    var color: Color = Theme.ink.opacity(0.65)
    var track: Color = Theme.ink.opacity(0.1)
    var height: CGFloat = 5
    var gradient = false
    var body: some View {
        let clamped = min(1, max(0, fraction.isFinite ? fraction : 0))
        ZStack(alignment: .leading) {
            Capsule().fill(track)
            if clamped > 0.001 {
                Group {
                    if gradient {
                        Rectangle().fill(LinearGradient(colors: [color.opacity(0.95), color.opacity(0.48)], startPoint: .leading, endPoint: .trailing))
                    } else {
                        Rectangle().fill(color)
                    }
                }
                .scaleEffect(x: max(0.015, clamped), y: 1, anchor: .leading)
            }
        }
        .frame(height: height)
        .clipShape(Capsule())
    }
}

extension View {
    /// The one unified card look of every page (matching Group2 identically): warm rice paper,
    /// Apple continuous 16pt corners, subtle ink outer rule and concentric 13.5pt vermilion inner rule.
    func paperCard(tint: Color? = nil) -> some View {
        let shape = RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous)
        return self
            .background(
                shape.fill(Theme.paper2.opacity(0.86))
                    .shadow(color: Color(red: 0.22, green: 0.16, blue: 0.08).opacity(0.07), radius: 6, y: 2)
            )
            .background((tint ?? .clear).opacity(0.055), in: shape)
            .overlay(shape.stroke((tint ?? Theme.ink).opacity(tint == nil ? 0.15 : 0.34), lineWidth: 0.9))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard - 2.5, style: .continuous).stroke((tint ?? Theme.seal).opacity(0.11), lineWidth: 0.55).padding(2.5))
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
            .animation(Motion.tap, value: pressing)
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
    @Binding var dragProgress: CGFloat
    @State private var shown = false
    @State private var dragY: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(menu.title).font(Theme.section).foregroundStyle(Theme.ink).tracking(1).lineLimit(1)
                if let s = menu.subtitle { Text(s).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2) }
            }
            .padding(.horizontal, 18).padding(.top, 16).padding(.bottom, 12)
            ForEach(Array(menu.items.enumerated()), id: \.element.id) { i, item in
                Divider2()
                Button { GameFeel.shared.tap(); close(); item.action() } label: {
                    HStack(spacing: 12) {
                        if let g = GameActionLabel.glyph(for: item.symbol) {
                            InkIcon(glyph: g, size: 16, weight: 1.75, accent: Theme.seal.opacity(0.28))
                                .foregroundStyle(Theme.seal).frame(width: 22)
                        } else {
                            Image(systemName: item.symbol).font(.system(size: 15)).foregroundStyle(Theme.seal).frame(width: 22)
                        }
                        Text(item.title).font(Theme.section).foregroundStyle(item.destructive ? Theme.seal : Theme.ink)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.ink2.opacity(0.5))
                    }
                    .padding(.horizontal, 18).padding(.vertical, 13).contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                // The rows settle in one after another with spring physics.
                .opacity(shown ? 1 : 0).offset(y: shown ? 0 : 10)
                .animation(Motion.panel.delay(0.025 * Double(i)), value: shown)
            }
        }
        .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.ink.opacity(0.2), lineWidth: 1))
        .overlay(alignment: .top) { Capsule().fill(Theme.seal.opacity(0.7)).frame(width: 40, height: 4).padding(.top, 7) }
        .shadow(color: .black.opacity(0.24), radius: 22, y: 10)
        .padding(.horizontal, 32)
        // 手势物理（Emil Kowalski /gestures）：下滑 1:1 跟手关闭，上拉橡皮筋阻尼回弹
        .offset(y: dragY)
        .scaleEffect(1 - min(0.06, max(0, dragY / 1400)))
        .gesture(
            DragGesture(minimumDistance: 6)
                .onChanged { v in
                    let dy = v.translation.height
                    if dy >= 0 {
                        dragY = dy
                        dragProgress = min(1, dy / 180)
                    } else {
                        // 上拉橡皮筋阻力：平方根阻尼，既有弹性又不跑飞
                        dragY = -sqrt(abs(dy)) * 3.4
                        dragProgress = 0
                    }
                }
                .onEnded { v in
                    let projected = v.predictedEndTranslation.height
                    if dragY > 85 || projected > 165 {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { dragY = 260; dragProgress = 1 }
                        close()
                    } else {
                        withAnimation(Motion.panel) { dragY = 0; dragProgress = 0 }
                    }
                }
        )
        .onAppear { shown = true; dragY = 0; dragProgress = 0 }
    }
}
private struct PressMenuHost: ViewModifier {
    @Binding var menu: PressMenu?
    @State private var dragProgress: CGFloat = 0
    func body(content: Content) -> some View {
        content.overlay {
            ZStack {
                if let m = menu {
                    Color.black.opacity(max(0.04, 0.34 * (1 - Double(dragProgress) * 0.8))).ignoresSafeArea()
                        .onTapGesture { dismiss() }.transition(.opacity)
                    PressMenuCard(menu: m, close: dismiss, dragProgress: $dragProgress).id(m.id)
                        .transition(.scale(scale: 0.90).combined(with: .opacity))
                }
            }
            .animation(Motion.panel, value: menu?.id)
        }
    }
    private func dismiss() { menu = nil; dragProgress = 0; PressGuard.fired = false }
}

// MARK: 深度数据动效组件（双边好感仪、政局风险仪、四角物理吸附悬浮局势珠）

/// 双边外交好感仪（-100…+100）：中轴零点，亲善青玉向右伸展，敌视朱砂向左伸展，数值变动丝滑弹簧过渡。
struct OpinionGauge: View {
    let score: Int
    var height: CGFloat = 6
    var body: some View {
        let clamped = max(-100, min(100, score))
        let frac = CGFloat(abs(clamped)) / 100.0
        let positive = clamped >= 0
        GeometryReader { g in
            let half = g.size.width / 2
            ZStack(alignment: .center) {
                Capsule().fill(Theme.ink.opacity(0.09))
                if clamped != 0 {
                    let barW = max(3, half * frac)
                    RoundedRectangle(cornerRadius: height / 2, style: .continuous)
                        .fill(positive ? Theme.jade : Theme.seal)
                        .frame(width: barW, height: height)
                        .offset(x: positive ? barW / 2 : -barW / 2)
                        .animation(Motion.panel, value: clamped)
                }
                Rectangle().fill(Theme.ink.opacity(0.35)).frame(width: 1.2, height: height + 3)
            }
        }
        .frame(height: height)
    }
}

/// 政局安定与政变风险双态仪：低风险青玉沉稳，高风险朱砂脉动示警。
struct StabilityRiskMeter: View {
    let stability: Int
    let risk: Int
    let level: String
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var tone: Color {
        risk >= 68 ? Theme.seal : risk >= 44 ? Color(red: 0.78, green: 0.42, blue: 0.14) : Theme.jade
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                HStack(spacing: 5) {
                    Circle().fill(tone).frame(width: 7, height: 7)
                        .scaleEffect(risk >= 44 && pulse && !reduceMotion ? 1.38 : 1)
                        .opacity(risk >= 44 && pulse && !reduceMotion ? 0.55 : 1)
                    Text("政局 · \(level)").font(Theme.body).foregroundStyle(Theme.ink)
                }
                Spacer()
                Text("安定 \(stability) · 变局风险 \(risk)%").font(Theme.caption).foregroundStyle(risk >= 44 ? tone : Theme.ink2).monospacedDigit()
            }
            InkBar(fraction: Double(max(0, min(100, risk))) / 100.0, color: tone, height: 5.5, gradient: true)
                .animation(Motion.panel, value: risk)
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

/// 精致可隐藏的四角吸附局势浮印：收起时为一枚小巧朱墨印章（战事时亮出微徽），轻点展开战况/外交/回放/启停/倍速与一键隐藏。
struct FloatingTacticalPill: View {
    @ObservedObject var model: GameModel
    let openWars: () -> Void
    let openDiplomacy: () -> Void
    let openReplay: () -> Void
    let onHide: () -> Void
    let landscape: Bool

    private enum Corner: Int { case topLeading, topTrailing, bottomLeading, bottomTrailing }
    @State private var corner: Corner = .bottomTrailing
    @State private var expanded = false
    @State private var dragOffset: CGSize = .zero
    @State private var dragging = false

    private func anchor(in size: CGSize, safe: EdgeInsets) -> CGPoint {
        let padX: CGFloat = landscape ? max(safe.leading + 76, 86) : Theme.Control.screenInset
        let trailPad: CGFloat = landscape ? max(safe.trailing + 16, 20) : Theme.Control.screenInset
        let topY: CGFloat = safe.top + (landscape ? 64 : 68)
        let botY: CGFloat = max(topY + 64, size.height - safe.bottom - (landscape ? 54 : 134))
        let pillW: CGFloat = expanded ? 228 : Theme.Control.topHeight
        let leftX = padX + pillW / 2
        let rightX = max(leftX, size.width - trailPad - pillW / 2)
        switch corner {
        case .topLeading: return CGPoint(x: leftX, y: topY)
        case .topTrailing: return CGPoint(x: rightX, y: topY)
        case .bottomLeading: return CGPoint(x: leftX, y: botY)
        case .bottomTrailing: return CGPoint(x: rightX, y: botY)
        }
    }

    var body: some View {
        GeometryReader { g in
            let wars = model.state?.wars.count ?? 0
            let pos = anchor(in: g.size, safe: g.safeAreaInsets)
            pillContent(wars: wars)
                .gesture(dragGesture(pos: pos, size: g.size))
                .position(x: pos.x + dragOffset.width, y: pos.y + dragOffset.height)
                .animation(Motion.panel, value: expanded)
        }
        .coordinateSpace(name: "tacticalPillSpace")
        .ignoresSafeArea()
    }

    private func pillContent(wars: Int) -> some View {
        let strokeColor = wars > 0 ? Theme.seal.opacity(0.4) : Theme.ink.opacity(0.16)
        let shadowColor = Color(red: 0.12, green: 0.09, blue: 0.05).opacity(dragging ? 0.24 : 0.14)
        return HStack(spacing: 4) {
            toggleSealButton(wars: wars)
            if expanded {
                expandedTools(wars: wars)
            }
        }
        .padding(.horizontal, expanded ? 8 : 6).padding(.vertical, 6)
        .background(Theme.paper2.opacity(0.96), in: Capsule())
        .overlay(Capsule().stroke(strokeColor, lineWidth: 0.9))
        .overlay(Capsule().stroke(Theme.seal.opacity(0.13), lineWidth: 0.5).padding(2.5))
        .shadow(color: shadowColor, radius: dragging ? 12 : 7, y: dragging ? 5 : 2.5)
        .scaleEffect(dragging ? 1.05 : 1.0)
        .contentShape(Capsule())
    }

    private func toggleSealButton(wars: Int) -> some View {
        let badgeText = "\(min(99, wars))"
        return Button {
            GameFeel.shared.tap()
            withAnimation(Motion.panel) { expanded.toggle() }
        } label: {
            ZStack(alignment: .topTrailing) {
                SealFace(text: wars > 0 ? "战" : "印", size: 28, color: wars > 0 ? Theme.seal : Theme.jade)
                    .rotationEffect(.degrees(expanded ? -12 : 0))
                if !expanded && wars > 0 {
                    Text(badgeText)
                        .font(Theme.kai(9)).foregroundStyle(Theme.paper2).monospacedDigit()
                        .padding(.horizontal, 4).frame(minWidth: 15).frame(height: 14)
                        .background(Theme.seal, in: Capsule())
                        .overlay(Capsule().stroke(Theme.paper2, lineWidth: 1))
                        .offset(x: 5, y: -4)
                }
            }
            .frame(width: 30, height: 30)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func expandedTools(wars: Int) -> some View {
        Rectangle().fill(Theme.ink.opacity(0.14)).frame(width: 0.8, height: 18).padding(.horizontal, 2)
        pillButton(tint: Theme.seal) {
            if model.playing { model.pause() } else { model.play() }
        } content: {
            InkIcon(glyph: model.playing ? .pause : .play, size: 13, weight: 1.9)
        }
        pillButton(tint: model.speed > 1 ? Theme.seal : Theme.ink) {
            model.cycleSpeed()
        } content: {
            Text("\(model.speed)×").font(Theme.caption).monospacedDigit()
        }
        pillButton(tint: wars > 0 ? Theme.seal : Theme.ink) {
            withAnimation(Motion.tap) { expanded = false }
            openWars()
        } content: {
            InkIcon(glyph: .war, size: 14, weight: 1.75)
        }
        pillButton(tint: Theme.jade) {
            withAnimation(Motion.tap) { expanded = false }
            openDiplomacy()
        } content: {
            InkIcon(glyph: .diplomacy, size: 14, weight: 1.75)
        }
        pillButton(tint: Theme.ink) {
            withAnimation(Motion.tap) { expanded = false }
            openReplay()
        } content: {
            InkIcon(glyph: .replay, size: 14, weight: 1.75)
        }
        Rectangle().fill(Theme.ink.opacity(0.14)).frame(width: 0.8, height: 18).padding(.horizontal, 1)
        pillButton(tint: Theme.ink2) {
            withAnimation(Motion.tap) { expanded = false }
            onHide()
        } content: {
            Image(systemName: "eye.slash").font(.system(size: 12, weight: .regular))
        }
        .accessibilityLabel("隐藏局势浮印")
    }

    private func dragGesture(pos: CGPoint, size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 6, coordinateSpace: .named("tacticalPillSpace"))
            .onChanged { v in
                dragging = true
                dragOffset = v.translation
            }
            .onEnded { v in
                let projectedX = pos.x + v.predictedEndTranslation.width
                let projectedY = pos.y + v.predictedEndTranslation.height
                let isRight = projectedX >= size.width / 2
                let isBottom = projectedY >= size.height / 2
                let next: Corner = isBottom ? (isRight ? .bottomTrailing : .bottomLeading) : (isRight ? .topTrailing : .topLeading)
                GameFeel.shared.tap()
                withAnimation(Motion.panel) {
                    corner = next
                    dragOffset = .zero
                    dragging = false
                }
            }
    }

    private func pillButton<C: View>(tint: Color, action: @escaping () -> Void, @ViewBuilder content: () -> C) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            content().foregroundStyle(tint).frame(width: 26, height: 28).contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
    }
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
                            Text(text).font(Theme.body).foregroundStyle(Theme.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
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
                .animation(Motion.tap, value: text)
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
