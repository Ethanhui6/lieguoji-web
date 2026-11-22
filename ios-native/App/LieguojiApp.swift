import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

@main struct LieguojiApp: App {
    init() {
        // The original's map font (TW-Kai), used for every text in the app.
        if let url = Bundle.main.url(forResource: "TW-Kai", withExtension: "ttf", subdirectory: "Fonts") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        let kai = UIFont(name: Theme.fontName, size: 17) ?? .systemFont(ofSize: 17)
        UISegmentedControl.appearance().setTitleTextAttributes([.font: kai.withSize(14)], for: .normal)
        UINavigationBar.appearance().titleTextAttributes = [.font: kai]
    }
    var body: some Scene { WindowGroup { RootView().font(Theme.section).preferredColorScheme(.light).environment(\.colorScheme, .light) } }
}

/// Warm paper and ink, one vermilion seal colour and the jade of the web game.
enum Theme {
    static let fontName = "TW-Kai-98_1"
    static let paper = Color(red: 0.957, green: 0.933, blue: 0.886)
    static let paper2 = Color(red: 0.984, green: 0.972, blue: 0.945)
    static let ink = Color(red: 0.098, green: 0.082, blue: 0.063)
    static let ink2 = Color(red: 0.36, green: 0.325, blue: 0.27)
    static let line = Color(red: 0.165, green: 0.145, blue: 0.114).opacity(0.14)
    static let wash = Color(red: 0.925, green: 0.894, blue: 0.835)
    static let seal = Color(red: 0.706, green: 0.255, blue: 0.18)
    static let jade = Color(red: 0.184, green: 0.365, blue: 0.314)
    /// Backdrop behind the map. Follows the sea preset so the edges are not a different blue.
    static func seaColor(_ ocean: String) -> Color {
        let c = MapPalette.ocean(ocean).deep
        return Color(red: Double(c.r), green: Double(c.g), blue: Double(c.b))
    }
    static func kai(_ size: CGFloat) -> Font { .custom(fontName, size: size) }
    /// 字号五级（国家页等信息页统一用这几级，不再各写各的号数）：
    /// 标题 22（页名、国名）、分节 17（分节标题、主按钮）、正文 15（名称、数值、行内容）、标注 13（次要说明、单位）、注释 12（小注、标签）。
    static let title = kai(22)
    static let section = kai(17)
    static let body = kai(15)
    static let label = kai(13)
    static let caption = kai(12)
    /// 全应用统一排版尺度：卡片外边距 16、分节与页头边距 20、卡片内边距 14、模块间距 12、左侧图标对齐通道 22。
    enum Layout {
        static let pageInset: CGFloat = 16
        static let sectionInset: CGFloat = 20
        static let cardPadding: CGFloat = 14
        static let stackGap: CGFloat = 12
        static let iconGutter: CGFloat = 22
        static let headerTop: CGFloat = 10
    }
    /// Apple HIG 统一控件与同心圆角尺度：
    /// 顶栏所有胶囊与圆钮严守 44pt 等高对齐，底栏悬浮坞严守 54pt 等高且内嵌 44pt 同心朱印钮；
    /// 圆角严守同心连续曲率：面板 28pt → 外卡片 16pt → 内控件 12pt → 轻标签 10pt。
    enum Control {
        static let screenInset: CGFloat = 16
        static let topHeight: CGFloat = 44
        static let dockHeight: CGFloat = 54
        static let sealButtonSize: CGFloat = 44
        static let tickerHeight: CGFloat = 34
        static let gap: CGFloat = 8
        static let cornerSheet: CGFloat = 28
        static let cornerCard: CGFloat = 16
        static let cornerControl: CGFloat = 12
        static let cornerChip: CGFloat = 10
    }
}

enum Names {
    static let polity = ["Kingdom": "王国", "Empire": "帝国", "Federation": "联邦", "Republic": "共和国", "Tribal": "部落联盟", "Theocracy": "神权"]
    /// The cultures of the catalog in its order (CULTURE_IDS47).
    static var cultureIds = ["chinese", "japanese", "english", "arab", "roman", "french", "german", "greek", "persian", "slavic", "norse", "indian", "korean", "mongol", "turkic", "egyptian", "spanish", "italian", "vietnamese", "tibetan", "hungarian", "polish", "portuguese", "dutch", "aztec", "inca"]
    static var culture = ["chinese": "中华", "japanese": "日本", "english": "英格兰", "arab": "阿拉伯", "roman": "罗马", "french": "法兰西",
                          "german": "日耳曼", "greek": "希腊", "persian": "波斯", "slavic": "斯拉夫", "norse": "北欧", "indian": "印度",
                          "korean": "朝鲜", "mongol": "蒙古", "turkic": "突厥", "egyptian": "埃及", "spanish": "西班牙", "italian": "意大利",
                          "vietnamese": "越南", "tibetan": "吐蕃", "hungarian": "匈牙利", "polish": "波兰", "portuguese": "葡萄牙", "dutch": "尼德兰", "aztec": "阿兹特克", "inca": "印加"]
    static var religion = ["none": "无指定宗教", "confucian": "儒教", "quanzhen": "全真道", "zhengyi": "正一道", "chan": "禅宗", "pureLand": "净土宗", "tiantai": "天台宗", "tantric": "藏传密宗", "whiteLotus": "白莲教", "manichean": "明教", "nestorian": "景教", "chineseFolk": "中国民间信仰", "daoism": "道教", "buddhism": "佛教", "shinto": "神道",
                           "islam": "伊斯兰教", "catholic": "天主教", "orthodox": "东正教", "protestant": "新教", "judaism": "犹太教",
                           "hinduism": "印度教", "zoroastrian": "祆教", "grecoRoman": "希腊罗马多神信仰", "norse": "北欧传统信仰",
                           "tengri": "腾格里信仰", "kemetic": "古埃及信仰", "aztecFaith": "阿兹特克信仰", "incaFaith": "印加太阳信仰"]
    static let terrain = ["plain": "平原", "forest": "森林", "mountain": "山地"]
    static let unit = Dictionary(uniqueKeysWithValues: UnitKinds.kinds.map { ($0.key, $0.name) })
    static func travel(_ t: String) -> String { ["moving": "行军中", "arrived": "驻扎", "blocked": "受阻", "halted": "已停止"][t] ?? t }
    static func status(_ s: String) -> String { ["idle": "待命", "fighting": "交战", "retreating": "撤退", "sieging": "围城", "destroyed": "覆灭"][s] ?? s }
    static let templates: [(id: String, name: String)] = [("continents", "多大陆"), ("pangea", "联合大陆"), ("archipelago", "群岛"), ("highIsland", "高山大岛")]
    static func color(_ css: String) -> Color {
        let c = RGB(css: css) ?? RGB(0.6, 0.6, 0.6)
        return Color(red: Double(c.r), green: Double(c.g), blue: Double(c.b))
    }
    static func wan(_ n: Int) -> String { n >= 10_000 ? String(format: "%.1f万", Double(n) / 10_000) : "\(n)" }
}

// MARK: - root

struct RootView: View {
    @StateObject private var model = GameModel()
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        ZStack {
            Theme.seaColor(model.controller.display.ocean).ignoresSafeArea()
            if let legacy = model.legacyEngine {
                EngineView(host: legacy).frame(width: 1, height: 1).opacity(0.01).allowsHitTesting(false)
            }
            if let map = model.map {
                MapView(map: map, controller: model.controller).id(model.worldID).ignoresSafeArea()
            }
            switch model.phase {
            case .splash: EmptyView()
            case .title: TitleView(model: model).transition(.opacity)
            case .generating: GeneratingView(note: model.generationNote).transition(.opacity)
            case .founding: FoundingView(controller: model.controller, cancel: { model.cancelGeneration() }).transition(.opacity)
            case .playing:
                GameView(model: model)
                    .opacity(model.replayActive ? 0 : 1)
                    .allowsHitTesting(!model.replayActive)
                    .transition(.opacity)
            case .editing: if let ed = model.editor { EditorView(model: model, editor: ed).transition(.opacity) }
            }
            if model.phase == .playing && model.replayActive {
                ReplayOverlay(model: model)
                    .transition(.opacity)
                    .zIndex(50)
            }
            if model.phase == .splash { SplashView { finishSplash() }.transition(.opacity).zIndex(10) }
        }
        .animation(Motion.reveal, value: model.phase)
        // Leaving the app saves (autosave runs only every 90 days).
        // Leaving pauses and saves; coming back reattaches to the computer if its link broke meanwhile.
        .onChange(of: scenePhase) { _, phase in
            if phase == .background, model.phase == .playing { model.pause(); model.save() }
            if phase == .active, model.phase == .playing { Task { if await model.native.lost { model.remoteLost() } } }
        }
        .task { GameFeel.shared.start() }
        // 云更新: the latest balance numbers and notice; a running world takes them at once.
        .task { if await CloudConfig.shared.refresh() { await model.applyCloud() } }
        // 新世界由 Swift 在本机建成，网页引擎只在 Swift 建世界失败、读旧版存档时才按需启动（不再开机预热）。
        .task { await model.loadBackdrop() }
        .sheet(isPresented: Binding(get: { model.failure != nil }, set: { if !$0 { model.failure = nil } })) {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(title: "出了点问题", subtitle: model.failure, seal: "误")
                SealButton(title: "知道了") { model.failure = nil }.padding(.horizontal, Theme.Layout.pageInset)
            }
            .padding(.bottom, 24)
            .presentationDetents([.medium]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.section)
        }
    }

    private func finishSplash() {
        guard model.map != nil else {
            // The device-built backdrop is still being generated: wait for it.
            Task { @MainActor in while model.map == nil { try? await Task.sleep(nanoseconds: 50_000_000) }; finishSplash() }
            return
        }
        model.controller.interactive = false
        model.controller.drifting = true
        model.controller.reveal = 0
        model.phase = .title
        if ShotTour.on { Task { @MainActor in await ShotTour.start(model) } }
        // The title backdrop generates itself: sea, then land from the coast up, then the states.
        // Slow and unhurried behind the title (3.2 s read as rushed on the phone).
        Task { @MainActor in await model.playReveal(duration: 7, while: { model.phase == .title }) }
    }
}

// MARK: - launch

extension View {
    /// Rises into place after `delay` once `on` turns true.
    func rise(_ on: Bool, _ delay: Double) -> some View {
        opacity(on ? 1 : 0).offset(y: on ? 0 : 24)
            .animation(Motion.panel.delay(delay), value: on)
    }
}

/// Characters set top to bottom (a scroll's inscription).
struct VerticalText: View {
    let text: String; let size: CGFloat
    init(_ text: String, size: CGFloat) { self.text = text; self.size = size }
    var body: some View {
        VStack(spacing: size * 0.08) {
            ForEach(Array(text.enumerated()), id: \.offset) { _, ch in
                if "，；。".contains(ch) { Color.clear.frame(width: size, height: size * 0.45) } else { Text(String(ch)).font(Theme.kai(size)) }
            }
        }
    }
}

struct PrimaryLabel: View {
    let title: String; let symbol: String
    var body: some View {
        GameActionLabel(title: title, symbol: symbol).font(Theme.section).frame(maxWidth: .infinity).frame(minHeight: 50).padding(.horizontal, 12)
            .foregroundStyle(Theme.paper2).background(Theme.seal, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl - 2, style: .continuous).stroke(Theme.paper2.opacity(0.24), lineWidth: 0.7).padding(2))
            .shadow(color: Theme.seal.opacity(0.22), radius: 5, y: 2)
    }
}
struct SecondaryLabel: View {
    let title: String; let symbol: String
    var body: some View {
        GameActionLabel(title: title, symbol: symbol).font(Theme.section).frame(maxWidth: .infinity).frame(minHeight: 50).padding(.horizontal, 12)
            .foregroundStyle(Theme.ink).background(Theme.paper2.opacity(0.92), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.ink.opacity(0.16), lineWidth: 0.9))
    }
}

extension View {
    /// Frosted glass with a hairline, the iOS 17 floating-control look.
    /// Floating chrome (date, buttons, tab bar, notices) in the panels' own paper: the ink rule and
    /// the faint vermilion inner rule of Group2, so the map's controls and the pages read as one set.
    func glass<S: Shape>(_ shape: S) -> some View {
        // Apple 级克制浮层质感：统一柔白宣纸表面、0.75pt 细墨边框、微弱内描边与轻柔低海拔投影，零离屏模糊开销。
        background(shape.fill(Theme.paper2.opacity(0.96)).shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.12), radius: 9, y: 3))
            .overlay(shape.stroke(Theme.ink.opacity(0.15), lineWidth: 0.85))
            .overlay(shape.stroke(Theme.seal.opacity(0.11), lineWidth: 0.5).padding(2.5))
    }
}

/// 顶栏的圆钮：严守 44×44pt（与左上角日期胶囊绝对等高对齐），毛笔图标居中，选中态温和转朱不刺眼。
struct CircleIcon: View {
    var symbol: String = ""
    var glyph: InkGlyph? = nil
    var active = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ZStack {
            if let glyph {
                InkIcon(glyph: glyph, size: 19, weight: active ? 1.95 : 1.7, filled: active,
                        accent: active ? Theme.seal.opacity(0.24) : nil)
                    .id(glyph)
                    .transition(.asymmetric(
                        insertion: .scale(scale: 0.72).combined(with: .opacity),
                        removal: .scale(scale: 0.82).combined(with: .opacity)
                    ))
            } else {
                Image(systemName: symbol).font(.system(size: 16, weight: .medium))
            }
        }
        .foregroundStyle(active ? Theme.seal : Theme.ink)
        .frame(width: Theme.Control.topHeight, height: Theme.Control.topHeight)
        .glass(Circle())
        .overlay(Circle().strokeBorder(active ? Theme.seal.opacity(0.58) : Color.clear, lineWidth: 1.1).padding(2.5))
        .contentShape(Circle())
        .animation(Motion.tap, value: glyph)
        .animation(Motion.tap, value: active)
    }
}

/// 顶栏圆钮的按下反馈：利落下沉、淡墨晕圈外扩，松手回弹。
struct InkPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.91 : 1)
            .overlay {
                Circle().fill(Theme.seal.opacity(configuration.isPressed ? 0.12 : 0))
                    .scaleEffect(configuration.isPressed ? 1.04 : 0.6)
                    .allowsHitTesting(false)
            }
            .animation(reduceMotion ? nil : (configuration.isPressed ? .easeOut(duration: 0.14) : Motion.tap), value: configuration.isPressed)
    }
}

/// 顶栏的战事：交叉的戈与战争数。新开一场战争时戈一跳、朱圈一荡，战时轻缓呼吸。
struct WarCount: View {
    let count: Int
    @State private var bump = false
    @State private var ring = false
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: 3) {
            InkIcon(glyph: .war, size: 15, weight: 2.0, accent: Theme.seal.opacity(0.55))
                .scaleEffect(bump ? 1.35 : (pulse ? 1.07 : 1)).rotationEffect(.degrees(bump ? -10 : 0))
                .background {
                    Circle().stroke(Theme.seal.opacity(ring ? 0 : 0.6), lineWidth: 1.2).scaleEffect(ring ? 2.2 : 0.6)
                }
            Text("\(count)场战争").font(Theme.label).lineLimit(1).fixedSize()
                .contentTransition(.numericText()).animation(Motion.tap, value: count)
        }
        .foregroundStyle(Theme.seal)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { pulse = true }
        }
        .onChange(of: count) { old, new in
            guard new > old else { return }
            ring = false
            withAnimation(Motion.stamp) { bump = true }
            withAnimation(Motion.reveal) { ring = true }
            Task { try? await Task.sleep(nanoseconds: 220_000_000); withAnimation(Motion.tap) { bump = false } }
        }
    }
}

struct TabButton: View {
    let symbol: String; let title: String
    var icon: UIImage? = nil
    var glyph: InkGlyph? = nil
    var active = false
    var marker: Namespace.ID? = nil
    var flexible = true
    var compact = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: compact ? 1.5 : 2) {
                if let glyph {
                    InkIcon(glyph: glyph, size: compact ? 17 : 20, weight: active ? 2.0 : 1.65, filled: active,
                            accent: active ? Theme.seal.opacity(0.28) : Theme.seal.opacity(0.14))
                        .scaleEffect(active ? 1.05 : 1)
                        .animation(Motion.tap, value: active)
                }
                else if let icon { Image(uiImage: icon).resizable().interpolation(.high).scaledToFit().frame(width: compact ? 17 : 20, height: compact ? 17 : 20) }
                else { Image(systemName: symbol).font(.system(size: compact ? 15 : 17, weight: .medium)).symbolVariant(active ? .fill : .none) }
                Text(title).font(Theme.kai(compact ? 10 : 11)).lineLimit(1)
            }
            .foregroundStyle(active ? Theme.seal : Theme.ink)
            .frame(maxWidth: flexible ? .infinity : (compact ? 46 : 50)).frame(height: compact ? 38 : 44)
            .background {
                if compact && active, let marker {
                    RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                        .fill(Theme.seal.opacity(0.11))
                        .matchedGeometryEffect(id: "tab-bg", in: marker)
                }
            }
            .contentShape(Rectangle())
            .overlay(alignment: compact ? .leading : .bottom) {
                // 选中标：竖屏为底部短朱囊，横屏侧栏为左侧竖朱标
                if active, let marker {
                    if compact {
                        Capsule().fill(Theme.seal).frame(width: 2.6, height: 16).offset(x: 1).matchedGeometryEffect(id: "tab", in: marker)
                    } else {
                        Capsule().fill(Theme.seal).frame(width: 16, height: 2.4).offset(y: 1).matchedGeometryEffect(id: "tab", in: marker)
                    }
                }
            }
        }
        .buttonStyle(PressStyle())
    }
}

// MARK: - panels

/// 宣纸面板顶部拖拽手柄（隐藏系统指示条后的统一物理暗示，居中暖墨细条）。
struct SheetGrabber: View {
    var body: some View {
        Capsule()
            .fill(Theme.ink.opacity(0.22))
            .frame(width: 38, height: 4)
            .frame(maxWidth: .infinity)
            .padding(.top, 9).padding(.bottom, 2)
            .accessibilityHidden(true)
    }
}

/// Memorial heading: a colour tab (签条) for a state, the brush title, an ink rule that draws
/// itself, the docket line, and a small seal.
struct SheetHeader: View {
    let title: String
    var subtitle: String?
    var color: Color?
    var seal: String = "阅"
    var showGrabber = true
    @State private var inked = false
    var body: some View {
        VStack(spacing: 0) {
            if showGrabber { SheetGrabber() }
            HStack(alignment: .center, spacing: 12) {
                if let color {
                    RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 7, height: 44)
                        .shadow(color: Theme.ink.opacity(0.15), radius: 1, y: 1)
                }
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(Theme.kai(26)).foregroundStyle(Theme.ink).tracking(2).lineLimit(1).minimumScaleFactor(0.72)
                    Rectangle().fill(LinearGradient(colors: [Theme.ink.opacity(0.7), Theme.ink.opacity(0)], startPoint: .leading, endPoint: .trailing))
                        .frame(height: 1.2).scaleEffect(x: inked ? 1 : 0, anchor: .leading)
                    if let subtitle { Text(subtitle).font(Theme.label).foregroundStyle(Theme.ink2) }
                }
                Spacer(minLength: 6)
                Seal(text: seal, size: 32)
            }
            .padding(.horizontal, Theme.Layout.sectionInset)
            .padding(.top, showGrabber ? Theme.Layout.headerTop : 18)
            .padding(.bottom, 10)
        }
        .onAppear { withAnimation(Motion.reveal) { inked = true } }
    }
}

/// A folded memorial page: unified warm rice paper, Apple continuous concentric corners (16pt outer / 13.5pt inner),
/// subtle ink outer rule and faint vermilion inner rule — matching `.paperCard()` identically across the entire app.
struct Group2<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous)
        VStack(spacing: 0) { content }
            .background(
                shape.fill(Theme.paper2.opacity(0.86))
                    .shadow(color: Color(red: 0.22, green: 0.16, blue: 0.08).opacity(0.07), radius: 6, y: 2)
            )
            .overlay(shape.stroke(Theme.ink.opacity(0.15), lineWidth: 0.9))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard - 2.5, style: .continuous).stroke(Theme.seal.opacity(0.11), lineWidth: 0.55).padding(2.5))
    }
}

/// A docket line: label, a dotted leader, the value.
struct Row: View {
    let label: String; let value: String
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 16) {
                HStack(spacing: 8) { Glyph.icon(label, fallback: .edict); Text(label).foregroundStyle(Theme.ink2) }.fixedSize()
                Spacer(minLength: 12)
                Text(value).foregroundStyle(Theme.ink).monospacedDigit().fixedSize()
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) { Glyph.icon(label, fallback: .edict); Text(label).foregroundStyle(Theme.ink2) }
                Text(value).foregroundStyle(Theme.ink).monospacedDigit().fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(Theme.section).frame(minHeight: 22).padding(.horizontal, 16).padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }
}

struct Divider2: View { var body: some View { Rectangle().fill(Theme.ink.opacity(0.12)).frame(height: 0.8).padding(.horizontal, 16) } }

struct NationChip: View {
    let map: WorldMap; let nation: Int
    var body: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 3.5, style: .continuous).fill(nation >= 0 && nation < map.meta.nations.count ? Names.color(map.meta.nations[nation].color) : .gray).frame(width: 12, height: 12)
            Text(nation >= 0 && nation < map.meta.nations.count ? map.meta.nations[nation].name : "无主").font(Theme.section).foregroundStyle(Theme.ink)
        }
    }
}

/// Installed version and build (CFBundleShortVersionString / CFBundleVersion), so a sideloaded build can be identified.
enum AppVersion {
    static var text: String {
        let info = Bundle.main.infoDictionary
        return "版本 \(info?["CFBundleShortVersionString"] as? String ?? "?")（构建 \(info?["CFBundleVersion"] as? String ?? "?")）"
    }
}

/// What changed in each version, newest first.
struct ReleaseNotesSheet: View {
    static let notes: [(version: String, lines: [String])] = [
        ("2.6.0", ["【博物馆级 100 分皇帝诏书卷轴装裱 & 根治边缘重叠黑影与轴杆反向光影 Bug】彻底修复旧版卷轴四角阴影矩形十字交叉叠黑、截断以及左右紫檀轴杆高光方向互相矛盾的光影 Bug：重构为精确 45° 斜接（Mitered Trapezoids）的双层定向东南软阴影环与画心卷纸内凹弧影（四角零重叠黑斑）；左右紫檀木轴升级为 20 段连续圆柱冯氏曲面高光（统一遵循西北日照，配紫檀木纹、三层宣纸内卷层、14 段曲面鎏金铜箍、阶梯雕琢碧玉葫芦轴头、椭圆案面落影以及右上轴头朱金丝绦流苏）；上下锦绫天头地脚升级 Gouraud 连续斜向受光渐变、双层云菱织锦、立体带影玉鼻朱锦签扣与双层回纹鎏金包角。",
                   "【全新游戏内真实定向日照光影系统（西北斜阳 × 浮云掠影 × 器物立体落影）】首次在 Metal 渲染管线内实装完整动态光影系统（可在「地图显示 › 光影氛围」自由开关）：统一西北 315° 斜射暖阳与御案聚光漫反射（`studioLight`），陆地着色器按地形法线叠加向阳暖金石／背阴冷松烟明暗交界与双八度柔和浮云投影（`cloudCover`，随时间自西北向东南缓缓掠过山河与大洋）；海面着色器新增动态波浪法线贴图与西北斜阳Blinn-Phong碎金水光高光、深海涌流及海岸拍岸浪花；全图军团旗牌（`spriteShadowPipeline`）、国都、州城、海港、边塞要塞、宗教圣地与大洋古帆船均向东南方向投射柔和接地立体落影。",
                   "【列国边界与国色辨识度彻底重做（三层高辨识国界 ＋ 28 色典雅重彩矿植物国色）】根治相邻国家边界单线互相覆盖、灰粉相近色混杂缭乱的痛点：国界升级为维多利亚/P社级三层立体边线——① 各国专属向领土内侧延展的本国加深色内缘色带（`offsetPolyline` 严格朝州心定向内缩，双侧色彩各归其主）、② 暖白宣纸微反差高光衬边、③ 锐利浓墨主国界脊线（`#241B13`），并大幅柔化州郡内界（`0.30` 线宽、`0.25` 透明度）使国家版图层次一目了然；重调 28 色高区分度古图矿物植物色盘并强化邻国色差排斥。",
                   "【地图图标细节与七重等深海面全面精修】国都升级为「东南落影＋鎏金外环＋朱砂内城＋四芒金星皇冠」，州府升级青铜方城郭，普通城池配浓墨外郭与象牙城心；新增海港专属木栈桥与藏青白锚徽标（`portIcons`）；要塞升级双色条石城墙、三雉堞口、拱门与迎风朱旗；圣地升级鎏金光晕与八芒圣辉星轮；海面升级 7 道渐进等深水线、浅滩绿松石水色、近岸暗礁群以及最多 5 艘带船影、船壳甲板、三桅受光风帆、横桁索缝、桅顶朱旗与尾迹水纹的古典大帆船。",
                   "【回放系统与全作交互组件 100% 视觉交互统一 & 性能打磨】彻底清除全作残余的系统原生 `Slider` 与 `Picker`（包括回放横竖屏进度条、地图画笔放置滑条、数值修改弹窗与新兵种选择器）：为山河回放定制与 `PaperTrack` 同源的 `ReplayTimelineTrack`（单轨内嵌重大转折节点珠＋流体放大朱砂/青玉滑珠，消除双层重复进度条与底栏重复「返回当下／节点」按钮），回放播放钮统一为 `PlaySealButton` 同心朱印，右侧缩放栏与顶栏全部换用统一手绘 `InkIcon`，历史节点抽屉新增 1:1 下拉跟手关闭手势，回溯确认卡统一为 `SheetHeader` + `PrimaryLabel`/`SecondaryLabel`；补齐全部弹窗的 `28pt` 苹果连续同心圆角；光影系统在远景或高温省电态下自动裁剪军团落影并节流，兼顾满帧流畅与清凉手感。"]),
        ("2.5.0", ["【皇帝诏书级卷轴装裱与全屏御案织锦底纹】根治缩小到全图时「上方空白、下方凸出难看羊皮纸」的割裂 Bug：将羊皮纸纹理严丝合缝裁切在地图画心之内，新增全视口 GPU 织锦绫绢书案底纹（`deskPipeline`）与四边对称留白；重绘皇帝诏书级卷轴画框——四面羽化落影、三层锦绫菱格装裱边、金丝线、鎏金包角、上下嵌玉朱锦扣、七段立体紫檀木轴、卷纸层叠边缘及鎏金碧玉葫芦轴头。",
                   "【山川雪峰、内陆明湖、深岸江河与立体海面全面重绘】新增 GPU 多层海面着色器（`seaPipeline`）融合铜版水波、洋流暗涌与六道浅海等深水线，在大洋开阔处点缀古绘帆船；重绘宋元山水画意多峰连绵山脉（向阳暖坡＋背阴披麻皴笔＋双色雪山冰冠与软底影）及层次林冠；洪水泛滥算法识别内陆封闭明湖并绘以碧水湖岸与镜面微澜；江河新增水岸投影，舆图质感显著跃升。",
                   "【自然有机疆界 & 根治生成世界途中变名变色】新世界与地形预览全面引入多频域扭曲噪声与山脊高差阻力扩张（`Opening.organicLayout` / `organicAssign`），列国疆界顺山势河谷自然延展，不再方方正正；重构开卷建世管线，在开卷动画播放前即一次性启用本作名号与国色规则并同步最终元数据，彻底消除生成过程中显示一个国名/颜色、进入游戏后又突然变更的割裂感。",
                   "【山河回放彻底丝滑 & 军队清晰跨界行军】消除回放期间每帧主线程 CoreText 全城重绘与静态几何重建，改用 GPU 逐顶点色彩平滑渐变（`fadeVertex`）＋易主墨晕扫色同步驱动，彻底告别「一卡一卡」的顿挫感；修复回放军团兵种贴图键名错误与暂停隐身问题，为前十大强国常驻国都御林军王旗，并为每条活跃战线的先锋大军注入真实出发点→目标州 GPU 曲线跨界行军动画。",
                   "【全作手绘水墨图标全覆盖、苹果同心分段控件与流体动效】扩充 16 枚手绘水墨图标（内湖、群岛、增减、废除、交换、显隐、历法、封存、导出、壁纸、丝竹、时速、爵杯、人物、偃兵），补齐菜单、设置、天下诏令、州郡编辑、全部选项卡与数据行的图标缺失（`ChipPicker` 严格校验全排统一配图，彻底消除同一卡片内「有的有图标、有的纯文字」与杂色割裂）；全局动效升级为 iOS 17+ 原生 `.snappy` / `.smooth` / `.bouncy` 弹簧曲线，`ChipPicker` 升级苹果同心圆角分段滑块，`PaperTrack` 滑块新增拖动放大微晕。",
                   "【手绘地图与「划定列国」全面升级简化】自绘地图「山川」新增「内湖」「群岛」笔刷与 5×2 对称十笔刷，加入一键「抬海陆 / 降海面 / 整图平滑 / 海岸崎岖 / 随机新图」快捷条、全屏画图收起钮与横屏适配；「州郡」新增袖珍/标准/宏大/史诗四档一键规模；「划定列国」大幅简化并补齐功能：顶部内置一键「+ 新建国」、新增「单州 / 连片」双模式画笔、一键「自然重分」山河划界、完整撤销/重做，并采用与实机开局 100% 一致的国色配色。"]),
        ("2.4.0", ["【彻底根治「山河回放」顶栏失灵与无法缩放的底层元凶】查明并根治真机上回放左上角「返回当下」、右上角「节点」无法点击及舆图无法双指缩放的真正根因：`MemorialPaper` 内部 `1024×1024` 羊皮纸底图采用 `scaledToFill()` 叠加，SwiftUI `.clipped()` 仅裁视觉不裁触控，导致回放卡片生成巨型隐形触摸拦截框向上盖死顶栏按钮、向下锁死整片地图！现已从 `MemorialPaper` 源头禁用装饰纹理触控并用 `.contentShape(Rectangle())` 严守边界；重构 `ReplayOverlay` 为 `Color.clear` 无遮挡基底 + 独立顶/底/右浮层，仅在收起小手柄挂下滑手势；改由 `.sheet(onDismiss:)` 等待原生弹窗彻底关闭后再进回放；新增横屏单行 44pt 顶栏与紧凑底栏（露出 72%+ 纯地图空间供自由双指缩放），右侧增配单手「+ / − / 全图」缩放胶囊。",
                   "【全面统一回归「温润宣纸 × 暖墨 × 朱砂印」苹果同心圆角体系】彻底清理此前版本中突兀的黑块按钮与割裂白底（移除暂停态纯黑启停钮、国策黑底筛选签、新世界黑底规模钮与地图预览黑底浮标、局势浮印黑印章），启停朱印钮回归「推演朱砂实印 / 暂停宣纸朱框印」原作本色；统一全应用卡片为 `Theme.Control` 苹果连续同心圆角（面板 28pt → 外卡片 16pt → 内控件 12pt → 轻标签 10pt）与一致的暖宣纸质感，彻底消除界面割裂感。",
                   "【横屏体验专项大修】重做横屏左侧导航坞（紧凑 38pt 项高 + 苹果 22pt 连续圆角 + 左侧竖朱标，绝不再与顶栏或底部安全区冲突）；重做横屏右侧悬浮奏折面板（基于容器宽度自适应 24pt 连续圆角悬浮卡，取消硬编码屏幕宽度与负边距裁切）；优化横屏视图切换栏为 5 列宫格、新世界地图预览自适应横屏高度，以及横屏打开侧栏时自动隐去遮挡物。",
                   "【州郡详情页完全重置 & 军团详情页完全重做】点击地图州郡后，在页首最醒目位置置顶「所属国家主权大卡」（点任意处直接进入国家详情，不再深埋底部），配四格核心指标与「概览 / 地利战况 / 政区编辑」三页签及一屏直达快捷操作；军团页重构为「军令调度 / 整编队伍 / 履历战绩」三页签帅帐，将「整编队伍」提至顶部一键直达，并新增三千/一万/两万/五万快选兵力与可视化兵种换装。",
                   "【排行榜动效重做 & 外交界面全面完善】重做排行榜动画：取消切榜时清零闪白，改用丝滑弹簧进度条插值、三阶递升「魁首 / 榜眼 / 探花」颁台与数字滚动过渡；外交界面全面升级——将「切换观察国」直接融入鸿胪态势卡、新增「全部 / 交战 / 盟约 / 接壤」双边筛选与展开全套操作（议和 / 宣战 / 结盟 / 联姻 / 赠金 / 通商 / 共防 / 通牒 / 资敌），「遣使缔约」改为紧凑双边对席卡片 + 互换双方 + 实时好感态势与宣战/议和按钮，「列国战局」补齐战事汇总条与点击参战国直跳详情。"]),
        ("2.3.0", ["【彻底根治「山河回放」顶栏失灵并全面重做回放推进特效】将「山河回放」从 `GameView` 多层弹窗中剥离，直接挂载至 `RootView` 最顶层并彻底屏蔽底层 `GameView` 触控干扰，根治左上角「返回当下」与右上角「节点」点击无响应的问题（并在底部控制坞同步提供单手直达入口）；回放推进全面升级——自动比对历帧疆域易主，实时绘制弧形战役进攻箭头、前线交锋火花、先锋行军军团、强国国都守军以及基于 GPU 墨场的自然易主墨晕扫色效果；自动回溯节点留存间隔由 5 年缩短至 2 年。",
                   "【Apple 级全界面控件尺度与视觉对齐统一】确立 `Theme.Control` 全局控件规范：顶部日期胶囊、右上角全部圆形工具钮与各类提示横幅严守 `44pt` 绝对等高、`16pt` 左右屏幕基准线对齐与 `8pt` 等距排布；底部导航坞与倍速启停坞统一为 `54pt` 等高悬浮胶囊，五项页签等宽分布，启停朱印钮收束为 `44×44pt` 同心圆章（四周精确留白 `5pt`）并彻底移除外溢闪烁光环；统一柔白宣纸表面、细墨描边与克制低海拔投影。",
                   "【国家「长期政策 / 政令」彻底改版与页面去同质化】告别 24 行冗长平铺勾选列表：顶部新增苹果式「现行国策总览」洞察卡，实时汇总已行国策的攻防/岁入/人口/安定/腐化净加成；按「官制宪政 / 军制兵役 / 财税农商 / 礼教宗法」四大领域分层，将 6 组互斥制度重塑为双栏/三栏直观立国路线卡，10 项专项制度换用苹果风格拨动开关与红绿属性胶囊；三大御批诏令改为 2×2 快捷宫格；排行榜新增「魁首 / 榜眼 / 探花」前三甲颁台、外交页改为鸿胪邦交态势横卡、军事名将谱改为横向勋业画廊、系统菜单改为 2×2 视觉快捷面板，全面消除页面重复感。",
                   "【开始游戏选图细节全面升级】将 640px 高清山河预览置顶于「新世界」页首，支持一键切换「地貌浮雕 / 势力分布」实时预演与底栏陆地/山地/林泽/岸线勘测数据；四类地形格局新增手绘微缩舆图轮廓与战略标签；扩充至 6 套精选剧本（新增「战国七雄」「万国演义」）并加入一键规模档位。",
                   "【游戏画质与古图质感显著提升】为 Metal 陆地片元着色器新增双频宣纸微纤维颗粒与暖阳亮坡/冷墨背阴矿物颜料层次（拉近画面细腻锐利不发糊），启用 4× 各向异性纹理采样并保留精细古图海岸描边，强化山地立体明暗起伏与四频海面水墨晕染。"]),
        ("2.2.0", ["【紧急修复：国家「史册」页闪退与「山河回放」顶栏失灵】彻底根治点开国家「史册」页时因新立国／禅位／旧档缺失 `reigns47` 数组或 `isAlive` 空值触发的硬闪退，全面加固 `NationReigns` / `MonarchLore` 空值与 `NaN` 免疫并杜绝重复 ID；彻底修复「山河回放」左上角「返回当下」与右上角「节点」按钮无响应的重大 Bug——改用独立顶/底悬浮层消除全屏缩放对角落命中框的偏移、重构顶栏防窄屏挤压溢出，并将「历史节点」与「回溯确认」改为内置宣纸抽屉，彻底消除与主页面弹窗冲突。",
                   "【皇帝诏书卷轴装裱与地图细节全面升级】重制地图四边装裱：左右新增立体檀木卷轴、卷纸高光卷边与四端鎏金碧玉轴头，上下配黄绫朱锦装裱边（含御绫菱格暗纹、双金丝线与卷首红绫锦结）及四角回纹云角饰；升级舆图十六向鎏金罗盘（含古航海方位射线、32 分刻度环与海面祥云纹），拉近山脉新增高峰雪冠与水墨皴笔，驿道中途增设朱点驿站标记；卷轴装裱与舆图细节均可在「地图显示」独立开关。",
                   "【彻底根治卡顿、掉帧与手机发烫（含国家页专项优化）】Metal 渲染由 4× MSAA 调优为 2× MSAA（显存带宽与 GPU 发热减半）；解除看海期间每帧主线程 `waitUntilScheduled` 阻塞（仅拖拽、双指缩放与镜头飞行时同事务呈现，日常行军改为异步提交）；打开国家页等任意面板时自动休眠底层 `CADisplayLink` 与海面波浪，并缓存地图外观与国界高亮避免冗余重绘；将国家页概览、朝政、史册、政令、军事、外交外层容器全面改为 `LazyVStack`，移除开页瞬间二次重复全图染色，显著消除国家页滑动掉帧；新增「极省电」看海预设档位并调优默认均衡档负载。",
                   "【修复开屏底部白色椭圆 Bug 与军队数据误差】彻底移除开屏动画底部被裁切的横向椭圆白块，改用柔化竖向水墨渐变远山；修复国家总兵力统计包含异常/非活跃兵力、军团满编小于当前兵力、分兵缺失服役起始时间、合兵补给失真及士气/粮草越界等数据误差；修复蒙古/突厥军队编制重复出现「千户」的错误，并补全军团满员度百分比显示。",
                   "【真实历史君主年号、世数、尊号与无姓氏日本天皇】新建 `MonarchLore` 历史名号体系：日本天皇严格无姓氏、一世一元配 68 个正统日本年号（如「明治天皇 · 睦仁 · 明治三年」），皇室标注「皇室（无姓）」；中华／朝鲜／越南君主配 70 个正统年号、在位年次与庙号（太祖／太宗／武宗／仁宗／文宗／圣宗等）；欧美／斯拉夫／中东／地中海 17 个文化君主按同国同名自动递增世数（如「伊丽莎白二世」「路易十四」）并依功业特质获颁尊号（大帝／征服者／狮心王／立法者／宽仁王／残暴者等），全面同步至国家概览、朝政与历代史册。",
                   "【人物个性大幅扩充与真实在位加成可视化】在原有 27 项特质基础上新增 16 项鲜明历史个性（雄才大略、铁腕集权、仁德宽厚、精于理财、兵法大家、纵横捭阖、崇文重教、开疆雄主、明法审令、勤政爱民、海权远见、民望所归、宿将老谋、奢靡无度、刚愎自用、苛政暴戾），全部真实接入四维能力、全军攻防、国库岁入、人口增长、政局安定、腐败与外交好感，并在国家概览与朝政页新增「在位加成／掌权实效」醒目摘要条，让每一条性格都清晰可感。",
                   "【特产与贸易系统重构、政令分类清爽改版】特产由 15 项扩至 24 种分级物产（民生／战略／珍品），每类附带真实全国加成与天下垄断红利（占天下 40%+ 产区额外 +3% 商税并亮出垄断徽章），商约伙伴同步计入贸易清单；彻底清理「政令」页杂乱按钮堆砌，改版为「长期国策／内政民生／军事整备／文教宗教」四大分类页签，整合全部 24 项长期国策开关（新增统一币制、航海条例、御史监察、义务兵役）与 12 项御批政令（新增开仓赈灾、清丈田亩、军械改良、兴办太学）。",
                   "【43 政体、全 26 文化议会党派操控与 24 项深度历史事件】新增二元君主立宪、半总统共和、专家官僚制、督政府 4 种政体（总计 43 种）；为全部 26 个文化配齐历史党派库（每国议会 4–6 党）并支持一键「提前大选」「扶立新党」及逐党「扶持增席／任命组阁／改名改席／查禁」；新增 24 项朝堂、民生、军事与外交动态历史事件。",
                   "【局势快控浮印重做可一键隐藏、顶栏动效与全套设置补全】将局势快控浮印重做为精致小巧的朱墨印章微徽并内置一键「隐藏」按钮；顶栏日期新增推演实时状态脉动灯，传报横幅支持轻点立即收卷并降至更省电帧率；设置页补齐「地图局势快控浮印」「皇帝诏书卷轴装裱」「大事传报横幅」「战况伤亡飘字」「海面动态波浪」「打开面板自动暂停」等完整开关。"]),
        ("2.1.0", ["【全链路性能优化与渲染提速】重构月度与外交推演热点：引入月度预索引缓存 `MonthIndex`（一次扫描缓存各国州郡/失地/军队/交战状态/世家，消除 10+ 处月度 O(N×P) 重复扫描），外交桥梁预索引陆海军兵力消除 O(N×(A+F)) 瓶颈，将天灾判定移出逐国循环；优化 `ReplayEngine` 跳过帧零分配快路径；`GameModel` 状态应用改用 `cityByProv` 哈希查表；将 `MemorialPaper` 奏折折页与朱红竖格预烘焙为静态纹理，彻底消除弹窗动画与滑动时的逐帧 `Canvas` 卡顿。",
                   "【全 38 种政体个性与现实历史政体更迭／政变引擎】全新 `PolitySystem` 为 38 种政体赋予鲜明属性与治国个性（攻防、税赋、安定、腐败、好战度、分封制规则与阵营归属），并在国家「朝政」页新增「政局安定与变局风险仪」及主导风向分析；彻底替换旧版无厘头随机换政体，改为贴近现实历史逻辑的危机驱动演进——军事政变（由现任大将军／国防部长发难）、外戚权臣摄政／幕府架空、迫于危机推行君主立宪、民主或社会主义革命、强人独裁夺权、复辟称帝、军政府还政于民与提前大选；玩家亦可直接在朝政页手动触发符合当前政体的现实政体更迭。",
                   "【深度双边外交系统与博弈重构】全新 `DiplomacyDeep` 引入真实双边好感度（−100 至 +100）及逐项可展开的理由明细（文化宗教、阵营契合、边境摩擦、共同敌人、霸权威胁、条约与赠金），并直接接入 AI 宣战意愿；六大功能性条约全面生效（通商协定双方月入各 +6%、共同防御遇袭自动出兵协防、互不侵犯、王室联姻附带 25 年王位宣称、军事通行、十年 8% 岁币）；新增四大主动外交手段：最后通牒（割地／岁币／称臣，拒绝即开战）、反霸权包围网、谍报暗动（资助叛军／离间世家）与第三方大国斡旋停战；各国 AI 每月自主缔结通商／共防与反霸包围网；外交总览页采用渐进披露卡片与双边好感仪全面重构。",
                   "【国名与政体真实度全面净化】清理全部 26 文化与架空名库中的生硬与错位称谓（移除「中国地方」「江南帝国」「巴蜀帝国」「普鲁士国」「拉萨国」及「崇祯/嘉靖/贞观」等误作国号的年号）；新增文化宗教与政体真伪校验（杜绝「中华教宗国」「法兰西沙皇国」等跨文明失真组合）；重修军政府、执政府、法王国、民族国等政体尾缀与地图简名剥离规则，强化中华单字朝代与地理国名按政体自然适配。",
                   "【补全世家政治设计规划全部未完项】严格按政体差异化治理分封规则（共和、联邦与社会主义无封建封地，势力改由官职与财富计；摄政／幕府实权世家获显著势力加持）；修复君主驾崩时未遵守已指定继承人 `setHeir` 的遗漏，并加入改立太子引发生母世家不满的政治博弈；选侯君主与汗国驾崩改为前三强世家推举新君；朝堂新增「元首＋实权掌权者」统一双轨卡片、12 个月世家势力曲线 `Sparkline` 与核心成员摘要；新增「赐封一州」（12 月冷却）与「削藩夺地」（触及 −50 关系与 200 势力即刻触发谋逆）完整互动闭环。",
                   "【全新水墨仪式动效与物理交互手势】`HeraldScene` 新增四套 60fps 工笔水墨仪式动画——政变（旧印裂纹与朱戟斜劈）、改制／革命（旧印淡出与鎏金新玺定鼎）、缔约／包围网（双旗合符与玉印涟漪）、最后通牒（朱砂敕令羽箭冲击）；融入物理交互设计：在实时舆图新增可随手拖甩、按初速度物理投影自动吸附至屏幕四角的「局势快控浮印」（`FloatingTacticalPill`），长按操作菜单升级 1:1 下滑跟手关闭与上拉平方根橡皮筋阻尼。"]),
        ("2.0.2", ["【全作 UI 视觉统一、光学对齐与字体一致性（融合四篇交互设计准则）】全面审查并统一整局 UI 界面：彻底清除残余系统字体泄漏，全应用 100% 统一为全字库正楷（`TW-Kai`）五阶字号体系；严格执行光学对齐（Optical Alignment），统一全作页面卡片外边距（16pt）、分节与页头基准线（20pt）及行内图标通道（22pt），并为播放三角、倒放、定位准星与冠冕加入几何中心微调；遵循渐进式披露（Progressive Disclosure）将「新世界」气候与纬度等进阶滑杆收纳为带实时摘要的折叠节，首屏更清爽；所有自定义宣纸半屏/全屏面板顶部补齐暖墨拖拽手柄（`SheetGrabber`）；建立长期复用的《列国纪 UI/交互设计规范与开发审查提示词》（`docs/UI_DESIGN_SPEC.md`）。",
                   "【补全 16 枚手绘水墨功能图标】在 `InkIcons.swift` 中新绘舆图准星（定位）、时光回溯（回放）、倒放双刃、单步回退/前进、检索镜、巧匠调尺（设置）、双弧换图、典籍书函（卷宗）、纳卷归匣（导入）、绘疆画笔、关隘盾徽（要塞）、海港铁锚、边关烽火、鸣金收兵（撤退）与行军锋箭共 16 枚工笔水墨图标，全面接入标题页、国家页、军事页、快捷菜单、纪事与回放控制台。",
                   "【山河回放全面修复与功能补完】彻底修复从纪事/国家页进入「山河回放」时因面板关闭自动恢复实时推演覆盖回放画面的 Bug；修复回放浮层层级过低及点击舆图误弹州郡/军团面板的问题（回放置于最高层级并锁定底层点选，保留双指自由缩放平移）；将关键帧采样加密为每 30 天及任意疆域易主即录制，修复新开局单帧下正放/倒放/步进按钮无响应的问题（新增单帧引导与一键返回推演录制）；拖动进度滑条时自动暂停计时器防止抢占；顶部新增「实时大国疆域占比条」动态展示列国兴衰份额，底部控制台支持下划或点按手柄折叠为紧凑悬浮胶囊。",
                   "【国名舆图排布优化】升级 App 规则国名内点采样算法：在领土腹地按最深极点、质心最近点与四象限腹心均匀选取最多 16 处候选锚点，大幅改善弧形、沿海与狭长帝国的国名落位；将最大倾角收敛至 ±20° 以内并给予水平排版清晰度加权，同时自动避让本国都城坐标，减少国名压盖首都圈。",
                   "【军队 AI 军机逻辑大幅升级】军机处新增围城危急度感知（优先驰援危城与都城）、多轴进攻防扎堆（主攻轴线兵力充裕后自动分兵开辟副攻包抄轴线，不再全军挤向同一敌州）、战略目标加权（直捣敌都、乘胜攻克已围之城、避实击虚突破空虚防线）；新增敌境兵疲粮尽（士气过低或断粮）自动撤回休整、行军途中前方敌势骤增（>1.85× 我方合围兵力）自动中止孤军送死，以及和平时期面向强邻边境最高 3.2× 的屯兵警觉权重。",
                   "【临界阻尼弹簧动效、战场特效与性能优化】将全局交互动画升级为 WWDC23 临界阻尼弹簧（`Motion.tap / panel / drift` 默认不回弹、跟手利落，印章落印保留克制弹性）；升级交锋暖金微芒与宣纸镶边兵力条、攻占双层国色余波与双圈事件印晕；移除 `HeraldScene` 60fps Canvas 离屏高斯模糊与阵亡墨团 `CAShapeLayer` 离屏阴影，并为回放跳帧启用快速重绘路径（跳过静态城标与省界重建）及驻军计数 O(1) 预索引，显著降低帧耗时与发热。"]),
        ("2.0.1", ["【后期闪退彻底加固】全面清查并移除引擎推演、立国、内战、叛乱、迁都与人物生死中的强制解包（`!`）与自定义文化缺失崩溃点，同时为 `MapCamera`、`MapRenderer` 与点击坐标加入全链路 `NaN` / 无穷值免疫，大幅提升后期长期推演稳定性。",
                   "【根治中华后期反复出现「大金」与国名/政体失真】彻底修复「大金」循环根因（规范化基名去重使「大金 / 金 / 金帝国」共享唯一键值，防止字库耗尽反复命中「金」，并封顶旧邦无限复国循环）；大幅扩充全部 26 种文化的历史国名库（中华扩至 120+ 朝代/古国、欧亚各主流文化大幅扩充）及中华男女名与姓氏库；重修政体与国名契合规则：选定政体后再挑适配基名，改制共和/联邦/社会主义等现代政体自动转为「中原共和国」「江南联邦」等地理国名，杜绝「大金共和国」「大汉民主国」「第二大金」「西凉王国」等失真怪名，历史复国改采「后秦 / 南宋 / 续明」与「法兰西第二共和国」等自然序数格式。",
                   "【修复点军队报错与满屏白色 Bug】点击军队与舰队改为按稳定 ID 追踪，军团在推演中合编或覆灭时显示清晰的宣纸提示页而非空白视图；彻底堵死相机飞往军团时 `NaN` 坐标污染 `MapCamera` 导致的 Metal 满屏白屏问题，并修复密集驻军聚类时潜在的整数溢出陷阱。",
                   "【修复国名偶发不显示、开屏底线与国界不明显】引擎侧取消单州小国标注跳过限制、并在改名/新立国时立刻刷新标注；渲染侧修复淡入中途复用的国名透明度卡死为 0 的问题，并为国名新增六向避让与微缩保底，避免蹭到首都圈就消失；修复开屏动画下方横向渐变条造成的横线 Bug（改为柔和径向云岚并延伸山脚遮挡）；将选中态通知改为响应式发布并升级选中大国界为「鎏金外晕 + 朱墨双线」，点击任意国家国界立显。",
                   "【国家页面新增「史册」历代君主世系】国家页新增「史册」页签，完整记录历代皇帝/君主姓名、尊号、氏族、在位起止年份、四维能力、特质、强势程度评级（盖世雄主 / 一代明君 / 中兴之主 / 守成之君 / 平庸之主 / 丧土之君 / 失政之君）与 0–100 强势条、登基→巅峰→退位国土大小与附庸数变化、历代疆域柱状图，以及每任君主在位大事记；每代都城、柱条与每一条史册事件均支持一键定位地图。",
                   "【大事记新增「山河回放」正放 / 倒放 / 拖动 / 节点回溯】引擎新增轻量 RLE 版图关键帧录制与周期性可续推历史快照；在纪事页与国家史册页均可一键进入「山河回放」，直接于可自由缩放的舆图上支持正放、倒放、1×–4× 调速、时间轴滑条自由拖动、重大转折节点跳转，以及一键「回到此节点继续推演」改写历史。",
                   "【战局、长按菜单、开局选图与自绘地图全面加强】军事「战局」页新增战事总览条、可点击参战国签、攻守兵力占比与中线平衡刻度；长按菜单升级弹簧展开动效；开局「新世界」新增「华夏群雄 / 列国争霸 / 大航海群岛 / 丝路万邦」四大精选剧本、文化大区快选与山河预览加载动画；自绘地图新增三步流程指引与「细 / 中 / 阔 / 巨」快捷笔刷档位。"]),
        ("2.0.0", ["【全纯 Swift 运行时完成】启动与常规游玩不再初始化、不再挂载隐藏的网页引擎（WKWebView 零开销），地形、建世、推演、指令、外交、政令与存档全部由本机 Swift 引擎独立完成；仅在读取极早期旧版 JSON 存档或远程气候回退时才按需按次载入后备引擎，内存占用更低、启动更轻快。",
                   "【国家页面 2.0 深度操控重做】国家页顶栏新增五键快捷操控条（划疆、放兵、颁诏、疆土、都城）；新增「政令」页，提供八大御批国策（休养生息、全国大征兵、犒赏三军、整顿吏治、加固边防、推行文教、统一国教、大赦世家）及「禅位择君」拥立指定在世宗亲／贤臣登基；新增「疆土」总管页，支持全境州郡搜索、按人口／城防／州名排序、批量施政与逐州快捷操控（飞看舆图、委任总督、本州征兵、筑拆要塞、提升城防、迁都、立圣地）。",
                   "【军事、朝政与外交页统筹升级】国家「军事」新增全军统筹指令栏（全军补员、回防都城、全军交 AI、船坞下水新舰队、地图放兵）；「朝政」新增一键补齐空缺总督与禅位择君入口，默认展开朝堂与朝堂世家、精简折叠总督／议会／百官并展示实时摘要；「外交」新增全面停战与四面出击，点击邦交国签可弹出快捷操控菜单（飞往都城、立即议和／宣战）；全局外交页拆分为「邦交总览 / 外交施令 / 当前战事」三标签并移除重复的旧总览区块，大幅消除界面臃肿。",
                   "【顶部与全作交互动效重做】修复地图视图切换栏展开时纵向橡皮压扁变形，改为自右上角平滑微移展开；顶栏圆钮告别遮罩闪烁，改用利落缩放切换与选中朱砂扩散光环；顶栏日期胶囊可点直达纪事、战争数可点直达战局；多标签页 `ChipPicker` 全面升级为可横滑、带 `matchedGeometryEffect` 滑动朱印底衬，五至七个标签永不挤压截断。",
                   "【长页面滚动流畅度与统一排版】彻底排查并修复页面滑动卡顿根因：移除 `InkIcon` 的每图标离屏模糊与 `.drawingGroup()`（改为纯矢量双层水墨笔触，更锐利且零离屏渲染）；将 `Group2` 与 `paperCard` 阴影下沉至纯底图路径并取消入屏纵向弹跳；国家页、族谱、排行、纪事、州郡、军团、诏令全面改用 `LazyVStack`；用零 `GeometryReader` 的轻量 `InkBar` 替换行内进度条；移除纪事卷外层破坏懒加载的纵向缩放包装；国家页加载改为并行 `async let`；统一全应用卡片边距（16pt）与分节标题边距（20pt）。",
                   "【水墨与战场细节微调】在保持既有墨场核心不变的前提下，为战争墨迹前沿加入细腻的宣纸毛细湿墨暗边，温润化易主扫色前沿色调，为围城圈补充轻缓外扩波纹，并柔化战况飘字上浮缓动曲线。",
                   "【问题修复】修复军事页默认「军情」底部误显「暂无符合条件的陆军」；修复点击君主编辑时将女皇／女王性别硬编码为男性的问题（引擎同步导出 `ruler.female`）；修复州郡页在世界切换瞬间潜在数组越界风险；修复外交页默认发起／目标国已亡时未自动重置为现存国家的问题。"]),
        ("1.25.0", ["【国名与命名规则重做】整理全部 26 种文化的历史国名、架空国名、男女名与家族姓氏库，剔除错性别、错年代、姓名混入及“家/人/氏”脏尾缀；彻底杜绝「波兰王国王国」「安安」等拼接怪名。新建世界（含历史与架空模式）及中途立国均自动匹配地道政体称谓与纯净国名，地图简名完整剥离苏丹国、公国、汗国、社会主义共和国及单字朝代冠字「大」（保留大理、大越等专名）。",
                    "【国名基名与模板升级】国家自定义「国号国色」支持单独修改基名（保留当前政体与模板）、8 套预设命名模板及 `{名} {号} {序} {姓}` 占位符实时预览；宗室更迭或改姓时含 `{姓}` 的国号自动刷新；修复暂停状态下连点「随机国名/随机地名」不换名的问题。",
                    "【家族系统与世家政治全面丰富】同国世家开局不再撞姓，已婚配偶与新婚配对象保留独立本姓（族谱标明出身世家，不再出现同姓成婚）；人物改名与家族改姓同步刷新全谱、朝堂与君主史册；族谱页新增家族概览、旁系宗亲、立为家主、指定继承人与允许女性继承开关。",
                    "【世家往来与门阀博弈】族谱页新增「世家往来」与「本族纪事」：开局生成差异化朝堂世家格局，推演中每月演绎姻亲援手、通好结盟、门阀倾轧、言归于好、输财助国等动态；玩家可随时撮合两家联姻（关系 +25）、斡旋修好、挑拨离间、赏赐安抚、削夺权柄，并可在朝堂「扶立新世家」赐封州郡。",
                    "【全新应用图标与手绘水墨 UI 图标】重绘应用图标为宣纸青绿山水舆图配朱砂鎏金城楼印章；重做游戏内全套毛笔水墨图标，彻底消除选中态生硬方框底色，新增宗祠、玉璧连环、礼器九鼎、方孔铜钱、文房笔墨、圣光法轮、商贸货箱、九州井田、冠冕、诏书、同心结与朱印启停钮，统一地图视图切换条、排行榜、底栏与操作菜单视觉。",
                    "【动效细化】升级开场动画（舆图金墨等高线铺展、印章落印朱砂气波与山水云岚）、大事传报（鎏金木轴弹性展卷，新增世家联姻红绸双玉佩与世家大变朱印动画，丰富宣战气波与议和玉环）、推演启停朱印呼吸光环、底栏微弹切换及长按地图双重水墨朱砂涟漪。"]),
        ("1.24.0", ["【新世界在手机上直接建成】新世界不再交给隐藏的网页引擎去建，而是由手机上的 Swift 引擎直接建成：地形、州郡、各国、人物与家族、财政与征兵、首批军队与舰队、外交与开局战争、地图（河流、海岸、海面、国名）一次完成，建好就是运行中的世界。与以前的网页引擎在同一种子下逐字节相同，规则与数值没有改动，旧存档照常读取。",
                    "【快了约十倍】模拟器上同一世界（12 国 140 州、开局即战乱）：以前网页引擎建世界 20.6 秒、交接 2.1 秒，另需约 1 秒启动；现在 2.4 秒建成。开创动画结束时世界就已备好。",
                    "【不再开机预热网页引擎】启动时不再在后台加载网页引擎，开机更轻；只有读取很早的旧版存档、或 Swift 建世界意外失败时才按需启动它作为后备。",
                    "【陆地太碎自动加州数】群岛等破碎陆地放不下所选州数时，州数按原来的步长增加直到放得下，与以前一致；自绘地图、划定列国、重算气候也都改由 Swift 完成。"]),
        ("1.23.0", ["【墨迹重做：顺着地块渗开】战争墨迹不再是以军队为圆心的圆形墨团、也不再是等宽的笔刷线，而是落在地图本身的地块上：军队在敌境走过、驻扎、围城的地方，墨从路线向四周的地块渗开，平原渗得远、山地渗得近，每块地的远近另有一点起伏，所以边缘参差不齐、顺着地势，像墨洇进宣纸。墨按军队走到哪里依次显出。",
                    "【墨留到打完】走过的地方一直留着墨，直到这片地被攻下、议和，或一年没有军队再经过。几支同国军队挨在一起时合算兵力，墨渗得更宽、连成一片；驻扎越久渗得越开，二十天封顶。守军在本土相持时，身边的敌墨会淡去。",
                    "【攻下即复原】一州被攻下后，这一州里的墨立即全部收起，整州换成新主人的颜色，不留斑驳的墨块；议和后墨在一秒多里淡去。",
                    "【墨迹更省】以前每帧都要在两张整图纹理上落墨、演进；现在推演每一步才在后台算一次（两百支军队约 7 毫秒，不占主线程），显卡每帧只画一遍合成。",
                    "【缩放不卡】放大缩小时地名换字号改为在后台重画，画好前先把旧字图按比例顶着（以前跨过一档字号时，一帧里同步重画几百个地名）；地名避让改为按屏幕网格只比附近的名字（以前两两相比）；字图缓存从 500 张改为按内存计（四百多城来回缩放不再被挤掉重画）；缩放中同时冒出的大量地名不再各起一段淡入动画。"]),
        ("1.22.0", ["【墨迹留在走过的地方】军队在敌境走过、驻扎、围过的地方，墨留在纸上，约一年半才慢慢淡去（以前一个月就褪光，军队一走墨就没了）。守军会把身边的敌墨一点点推淡；议和或这片地被攻下后，那里的墨当即清掉，下次再开战不会冒出旧墨。",
                    "【墨团相融】每支军队是一团墨，几支挨近时墨团相加、连成一片并变大，同处军队越多墨团越大（有上限，不会铺满一国）；不再是一个个互不相干的圆圈。围城的墨与旁边军队的墨也一起算，交界处不再空一块。",
                    "【墨色不再出空洞】几国军队的墨团重叠处，颜色归到最近的一国（以前混色对不上交战国，重叠处会空出一块）。",
                    "【自定义改成分类格】国家页「自定义」先是一屏放得下的十个分类（国号国色、都城疆域、国库国运、国家加成、政体、文化宗教、国策性情、国家特性、军队兵种、官职称号），每格写着现状；点进去只显示这一类，顶部一排分类签可直接跳到别的类，不用再一路往下翻。概览里点政体、文化宗教、国策会直接打开对应分类。改变政体前先确认。",
                    "【长按面板分类】长按地图的快捷面板顶部加分类签（军队、疆域、叛乱、民生、文化、天灾、国家），一次只显示一类，记住上次停在哪类；遣散本州军队、举兵立国、全国煽动、退出同盟先确认一次。",
                    "【字号统一】全应用页面的字号收为五级（标题 22、分节 17、正文 15、标注 13、注释 12），以前十一号到十八号各写各的；分节卡片的边距统一。",
                    "【国家页更短】概览里的财政、特产与贸易、国史，军事里的兵种构成默认收起，收起时标题右边写一行摘要（月入与国库、最近一条国史）；每一节展开或收起会被记住。",
                    "【性能】暂停且画面静止时墨场不再每帧重画（以前驻扎的军队每帧都落一笔）。"]),
        ("1.21.0", ["【后期不再停战】推演十余年后各国不再开战、军队原地不动的根因：叛乱与独立的内战，两边军队互不进攻，内战永远打不完；越积越多之后，各大国都挂着几场内战，既被“在战”挡住、又被叛军连年动员的大军牵制，再也不对外宣战。现在内战的敌国同样是军队的作战目标，叛军会被镇压或打出独立，内战逐一了结。同一世界推演三十年：第 16–30 年每年仍新开三到九场战争，六到七成军队在行军（以前第 13 年起一场战争都没有、九成九军队原地不动）。",
                    "【墨迹与国色一致】战争墨迹的颜色改为与该国领土完全同一算法（国色、高度灰、国色浓度、山影），墨落到哪里，那里看上去就是这个国家的地；去掉掺墨压深、外圈水痕和深色湿边。",
                    "【只在敌境晕开】墨迹只显示在与落墨方正在交战的敌国领土上：本国、友邦、借道的第三国不显示，议和后旧敌土地上的墨立刻消失；军队撤回本国后，留在敌境的墨照样按天褪去。",
                    "【范围收窄】行军墨迹收回到一条路宽（半径 0.55 → 0.4 格距）；驻扎洇开改为随停留天数长大、二十天封顶，最大约一个格距宽；落墨改为取较浓者，同一处反复落墨不再越积越宽（以前驻扎几十天能洇开一个多州）。",
                    "【特效不再盖字】交战、围城、攻占、阵亡、事件印、宣战箭头整层移到地名之下，国名、城名始终压在最上面；战况飘字单独放在地名之上、字号改小、只浮起一小段。",
                    "【交战与围城标记重做】交战双刃缩小到约原来的七成，兵力条细成一道，紧贴军队上方；墨烟与火星收小。围城由“旗＋横条＋火焰粒子”改为一枚小城圈：宣纸底、细墨圈，进攻方国色的弧随占领进度从正上方顺时针合拢，中间一点国色缓缓呼吸。标记出现时淡入、结束时淡出，不再一下子跳出跳没。",
                    "【攻占不再糊一片】去掉攻占时铺开的半透明色盘和三道粗环（放大后近两百点宽，盖住整片地名）；换色交给地图扫色，原处只插一面小旗：旗杆落下、落地一圈细墨荡开、旗面招展后淡去。",
                    "【宣战一笔写出】宣战箭头由粗红虚线改为一道细朱笔，从进攻方都城带一点弧度写向对方都城，写完落下箭头，停一停后淡去。战争箭头变细、略透明，描边减淡。",
                    "【传报改窄条】大事传报由 116 点高的大卷轴改为 58 点高的窄条：左侧一幅小画（展卷、旗、长戈、朱墨等原画面缩小），右侧类别与事由；最宽 340 点，挂在顶栏下，不再遮住地图中部；停留时间缩短约一成半。",
                    "【其他】事件印缩小（30 → 21 点）、墨圈改为细线不填色；阵亡墨团与飞溅收小；宣战诉求图标缩小。"]),
        ("1.20.0", ["【墨迹跟着军队走】军队墨迹改在显卡上逐帧落墨：按军队图标此刻画出的位置一笔一笔落下，紧跟图标、没有断档；相邻两笔首尾相接，慢走、急行军、30 帧或 120 帧都一样连贯。驻扎时按推演天数向四周洇开（暂停不长），守军把身边的敌墨推淡，围城时墨在州界之内从进攻军处铺开；几路军队、几处战场的墨落在同一张纸上，自然连成一片。",
                    "【易主统一扫色】攻占、反叛、割地、新立国，以及改朝换代在家族等视图里的换色，都从种子点扫过去：攻占从入城的军队起，其余从新主人的首都起；同一批换主的州共用一条前沿、跨州连续，一批最长约 2.4 秒。未到处仍是旧色，前沿一道淡墨湿边。攻占后敌军仍在州里交战时，敌军在这片新占的土地上落自己的墨，画面不再打架。",
                    "【改朝换代的墨圈】政变、篡位、复辟、改制等大事，从首都扫过全国一道墨圈。",
                    "【阵亡动画】在军队图标此刻所在的位置倒下（以前用上一步的引擎坐标，图标走在半路或在城下排成圆环时差得很远）；一步里相继覆灭的几支按先后错开，图标在原处停到自己的那一刻、与动画同时消失；动画是一团掺着本国色的墨洇开、几点飞溅、一圈震痕、军旗向一侧倾倒下沉。同处扎堆的几支合为一处，墨团随之变大。",
                    "【宣战与传报】宣战改为一段画面：一卷纸从中间展开，两国国色的燕尾旗从卷轴两端擎出、迎风招展，两杆长戈一笔一笔写出、交叉，交点溅开一团朱墨，然后两国国名与事由入场。议和是两旗相向靠拢、一条绶带系起、中间一枚玉璧；攻克是一面旗从天而降插下、国色洇开；起义、复辟、绝嗣、迁都各有自己的画面。",
                    "【顶栏图标】图标改为毛笔笔触：起笔略顿、行笔饱满、收笔出锋，底下一层淡墨；开合时新笔画由左向右写出；按下有一圈淡墨洇开，选中时笔色与内圈转朱。战争数前是一对交叉的戈，新开战时戈一跳、朱圈一荡。",
                    "【修复】CI 模拟器构建从 1.18.0 起失败（真机才有的上屏回调），截图巡览恢复。"]),
        ("1.19.0", ["【沙盘墨场】战争晕染改为全图一张墨场：军队在敌境走过的路线落下一道墨，按军队实际经过的先后显现，宽窄随兵力；停下驻扎的地方随天数向四周洇开；围城时以进攻军为中心，墨的范围随占领进度长到铺满全州。不再整州整片地换色。",
                    "【相邻战区一起算】行军、驻留、围城、守军相持都落在同一张墨场上，相邻几处同时打仗时墨自然连成一片；以前交战的州整块让位给“战场地面”、军队已进州但还没开始围城的州没有颜色、区域内部的州要等前沿从边界推过来才见色，所以会出现某州莫名空着。“战场地面”已并入墨场。",
                    "【守军推回、撤军褪墨】守方军队在本土与敌相持时，把身边的敌墨一点点推回；进攻军撤走或解围后，墨按天慢慢褪去；借道友邦、本国领土不着墨。",
                    "【攻占扫满】底色换成新主人的那一刻，从已染处沿州内扫满（未到达处保持旧色），画面不跳；和约割地等没有军队的易主仍整州渐变。浓度动画全在着色器里按时刻插值，静止时不占显示链路。"]),
        ("1.18.0", ["【连片推进】同一进攻方、相邻（共享陆地边）的被占州合成一片：整片沿陆地从实际进入边界算一张连续的“抵达距离”，前沿穿过州界时形状、方向与速度自然接续，不再每到一州重新起一圈；几个入口同时推进时在交汇处自然合拢，不重复叠色。飞地、隔海的州与只在角点相接的州各自成片。",
                    "【分批加入、合并与拆分都连续】新州加入时从进入边界或邻州现有的前沿接着走；两片连通、或因战况拆开时，各州带着当前看到的覆盖面积换到新的距离场，再用约半秒形变过渡；进度更新只调整目标，不重启动画；增援、反攻、解围、换进攻方都从当前画面过渡。",
                    "【攻占顺势铺满】无守军到达即占、或围城走完易主时，新主人的颜色从进入方向铺满全州；底色换成新主人的那一刻已到达处画面不跳，未到达处保持旧色直到前沿推过。和约割地等没有军队的易主仍整州渐变。",
                    "【省份不再持续闪动】旧的易主渐变全图只有一个起点：上一次渐变未完又有州易主（高倍速打仗时几乎一直如此），先前已变色的州会被打回更早的旧色再渐变一次，看起来一直在闪。现改为逐顶点渐变，每个顶点从自己当时显示的颜色开始，互不打断。战场地面在预算内保持已显示者优先（以前第 10 名上下的州每步进出名单、反复淡出淡入），墨晕细节随缩放连续过渡（以前在固定比例处硬切）。",
                    "【后台结果按代次安装】归属变化后的颜色与边界在后台重算：以前只认最新一次，高倍速下可能一直等不到结果；现在不比屏幕上旧的结果先装上，更新的到了再换，旧结果不会盖掉新结果。",
                    "【统一时钟】易主渐变、战场地面与占领晕染按同一帧时刻、实际经过时间推进，帧率不同表现一致；暂停、回到前台从当前画面接着走，读档、换世界时清空旧晕染。"]),
        ("1.17.2", ["【家族视图不再闪退】地图切到「家族」（以及文化、宗教、政体、区域、同盟）视图时，若分组多于国家数，排地名时会越界导致应用退出——家族数常多于国家数，所以「家族」视图最容易触发。现已修正，各视图的名字也按本组名字的长短排布。"]),
        ("1.17.1", ["【占领晕染】正被占领、没有接战的州，进攻方的颜色从其军队实际所在的一侧（军队在州心时取进军方向）洇入，面积随占领进度推进，守方颜色退向对侧；解围则守方铺回，易主则进攻方铺满后淡去。同屏先画交战，其次按占领进度，最多十处。",
                    "【地名不再闪烁】缩放停在临界处时，已显示的国名、城名要再缩小一成多才隐去，不再反复出没。"]),
        ("1.17.0", ["【缩放不再割裂】地图画面与国名、军队兵力字、特效改为同一帧上屏：以前 Metal 地图晚一帧出现，双指缩放、拖动时名字与边界、军旗与兵力字相互错开。",
                    "【军队图标】远看缩小到 11 点、随缩放增长、近看封顶 26 点：远景能看清战线与地名，近景不再大到遮住整州；兵力字随之同规则显示。同处多军排成小圆环时，点哪支就选中哪支（以前按未偏移的中心判断，密集时会选错），点选范围随图标大小。",
                    "【同盟图】每个同盟一种分明的墨色（朱、靛、石绿、藤黄……），同一局里不因其他同盟成立或解散而变色；不在同盟的国家统一淡纸色；地图上写同盟名、其余国家写本国名。图例只列同盟并标出州数，点一行可看成员，再点直达该国国家页或外交总览。",
                    "【图层】玩家手绘的河流改与天然河流同层，不再压在国界、城池和军队上面。"]),
        ("1.16.1", ["【族谱不再闪退】族谱改为宽容读取：人物记录缺字段、类型不符、成员重复、亲缘成环或世系极深时照常分代显示，不再因个别异常记录让整个应用退出；数字编辑框不再接受会导致闪退的超大数、非数字（如 1e20、nan），并写明原因。",
                    "【族谱操作】成员操作执行期间不再接受连点；「设定年龄」改为同时调整生年，下个月按生年重算后不再被改回；操作结果提示后自动重读族谱。",
                    "【页面状态】族谱、国家、外交、财政、贸易页载入失败时写明原因并给出「重试」，不再一直停在「载入……」；请求返回前若已读档或换世界，旧世界的结果一律丢弃。"]),
        ("1.16.0", ["【更流畅】推演每日计算量降低两到三成（同一存档、同样结果下实测：200 州世界 112→90 毫秒，140 州世界 74→52 毫秒，电脑上测得），每步交给画面的世界状态不再转成文本再解析，手机端每步少做两次整份转换。同样的推演，手机更凉、更快。",
                    "【战场地面】交战所在的州，地面按参战各方兵力分成各方国色，像墨色从各自进来的方向洇开、在中间推挤；兵力占优的一方向前推进，盟军合为一块；战斗结束胜方铺满后淡去。设置「地图显示」可关闭。",
                    "【行军不再来回晃】驻防边境的军队不再因为对面军队走动就被改派回头；行军路线的之字形在画面上抹平；驻扎的军队停稳不漂移；交战动作放缓。",
                    "【军情一字】放大地图时，兵力前标一字：战、退、集、守、援、征、行，一眼看出每支军队在做什么。",
                    "【事件印】建国、宣战、丰收、通商、名臣、天灾、瘟疫、革命、篡位，地图上统一为一圈墨晕加一方一字印（立、战、丰、商、才、灾、疫、革、篡），同屏最多三方。",
                    "【朱印统一】全作印章用同一印面：一字印居中、两字竖排、三四字两列，大小、边框、颜色一致（原先一字印偏在左半边）。界面动效统一为几种节奏。",
                    "【修正】近看时都城名被自己的首都圈挡住不显示；政体名统一为「部落联盟」，国号后缀为「部族」。"]),
        ("1.15.0", ["【名将谱】各国战时的统帅按战功入谱：统兵每月有功，为国拓地功劳更大。战功满四十称骁将，一百称名将，二百称上将军，三百五十称军神；成为名将、军神和将星陨落都记入大事记。军事页「军情」里可以看名将谱。",
                    "【合纵连横】一国占到天下三成时，它的邻国里最强的两国会结盟对抗（同一个霸主两年内至多一次），大事记记为「某与某合纵，共抗某」。大国不再一路滚雪球。",
                    "【天灾随气候】水旱蝗疫、地震和祥瑞原来就有，这一版让它们看地方：荒漠州郡不发洪水而是旱灾，冰原冻土不闹蝗灾而是雪灾。",
                    "【首都名】修正上一版首都名在常规缩放下仍不显示：放大后的名字被自己的首都圈挡掉了。",
                    "【外交】外交页顶部新增邦交总览：战争、同盟、停战、接壤四个数；「同盟一览」列出每个联盟和成员；所选国家与各国的关系列成一张表，交战、同盟、宗主、附庸、条约、停战、接壤强弱一目了然。点一行镜头飞到对方都城并亮起朱印环；行尾的小印可以直接去该国的国家页、战局和纪事。",
                    "【朝堂】暂停时打开国家页不再改动世界：官员去世留下的空缺改为每月补任，不在查看朝堂时临时补。"]),
        ("1.14.0", ["【易主】大事记说换了人，就真的换人。以前禅让只改国号，皇帝还是原来那位；革命之后旧君主留任总统。现在禅让由势力最强的别家贤能者受禅登基，革命后的共和国选出新元首，复辟由别家登位，政党夺权和军人交权也换上新政权自己的人。国号、宗室、任期和纪事同步变化；没有别家可以继位时，禅让不会发生。",
                    "【元首与掌权者】政体分出两个位子。君主立宪里国王或天皇是虚位元首，首相掌国政，随大选组阁，民怨深重时会被倒阁，君主在位如故；议会共和有总统和总理；幕府里天皇在位、征夷大将军掌权；帝制由皇帝亲政，另设丞相、关白、维齐尔等辅政；人民共和是主席加总理。国家页分两行显示，并标出「虚位」「掌国政」。",
                    "【掌权者真正掌权】掌权的是首相、将军或摄政王时，国势（军略、守御、财政、民生）、对外好战程度、外交、税收、国运和战场上的统帅加成都按他的能力和特质计算；名义元首只影响安定。",
                    "【更替必书】首相、丞相等每一次换人都记入大事记并写明原因：大选组阁、倒阁、卒于任上、岁末考核罢免、奉君命改任。",
                    "【天皇只有一位】同时存在的几个日本文化帝国里，只有最早的一国君主称天皇，其余称大王；两国交战时（南北朝）双方都称天皇。",
                    "【大事记】新增「岁纪」：近八年每年的记载数，按战事、政局、盟约分色，并附一句当年纪要。每条记载前有分类小印，下面标出距今多久和涉及的国家；点国家只看该国的记载；新增搜索框。",
                    "【军事】军事页新增默认页「军情」：交战、围城、行军、驻守各多少支；列国兵势；围城和两军交锋列表，点一下镜头就过去；天下兵种构成；最强之军；断粮与溃退的军队。",
                    "【首都名】首都的名字在进入游戏时的常规缩放下就能看到（最小 11 号字），不必放得很大。",
                    "【国名位置】国名在本国腹地的几个候选位置里选能写得最大的那一处：沿领土走向排布，离边界留出余地，不压边界、不挤出疆域。"]),
        ("1.13.0", ["【地图展开】修复上一版之后地图缩不回整图：两指捏合可以一直缩小到整幅地图都在屏幕里。进入游戏时仍然铺满整屏。",
                    "【查看都城】国家页的「在地图上查看都城」以前看起来没有反应（打开国家页时镜头已经对着都城，而且被面板挡住）。现在点一下，面板自动降到最低一档，镜头平滑移过去并放大，都城落在屏幕上方，朱印双环收拢在都城上闪动三次。",
                    "【国名不闪】每有一个州郡易主，地图上所有国名都会消失再淡入一次，打仗时就成了不停闪烁。现在还在的国名原地保留，位置只动了一点的也不挪动，只有新出现的国名才淡入。",
                    "【国色分明】相邻国家不再撞色。新世界按都城远近给每个国家挑与四邻差别最大的颜色，色板换成三十种矿物色（十二种色相各分浅、中两阶，另加六种土色墨色），仍是宣纸上的柔和色调。推演中新成立的国家也会避开周围国家的颜色。只对新建的世界生效，已有存档保持原色。",
                    "【海面】水线由三道加到五道，越往外越淡越疏；海浪改成两三道叠在一起的叠浪纹，每道浪下带一条细细的刻线阴影，冷色海和暖色海上都看得清；沿岸浅水加了浅滩短划；整片海面有了笔刷晕染的深浅变化，不再是一块平色。",
                    "【国势图标】国家页「国势」里军略、守御、民生、安定各有了图标，不再只有财政一行带图标。"]),
        ("1.12.0", ["【战争】修复开战后双方都不出兵、一直在边境集结：集结最多等 15 天，兵力不足时最多等 30 天，到期带着现有兵力进攻，不再无限期等待。",
                    "【全军交 AI】军事页新增「全部交还 AI」，亲自指挥过的军队和舰队一次交回军机调度。框选部队后也可以点「交AI」。手动下令打完仗的部队交还后，会继续进攻或反击。",
                    "【京畿驻军】战时都城常驻约八分之一兵力。进攻时，距离相近的目标优先打人口多的州郡。原作战时选目标只按距离计算，这两条是本作规则；原作的首都优先只用于和平时期驻防，本作已照原作实现。",
                    "【国名】历史国名库扩充到每种文化 22–90 个。新世界按文化随机政体细分：苏丹国、公国、选侯国、沙皇国、幕府、汗国、城邦、商业共和国、邦联等，每局不再千篇一律。规则仍按原政体计算。复国按原作格式加序号，如「第二秦帝国」。",
                    "【启动动画】改成宣纸画面：纸上晕开墨迹、远山淡入、「列國紀」逐字写出、盖上朱印，再从白纸过渡到开卷地图。系统启动屏也改成同色宣纸，不再闪一下。",
                    "【主页】背景开卷从 3.2 秒放慢到 7 秒，背景平移速度降到原来的约 4 成。",
                    "【勘定国界】开卷时国界原先是蓝色，改用「天下初定」相同的配色，前后不再跳色。",
                    "【首都】首都仍用原作三重圈，图标放大约四分之一。排地名时先给首都图标留位，首都名排在国名前面，国名不再盖住首都。",
                    "【发热】「均衡」档行军帧率由 60 降到 30，推演占用由 80% 降到 65%。手机微热时行军降到 30 帧，发热严重时降到 20 帧。以前用默认「均衡」的玩家会自动换成新档位。",
                    "【本机计算】自动接入电脑默认关闭，推演全部在手机上完成；需要时可以在「设置 › 远程计算」打开。",
                    "【画面边缘】地图铺满整屏，包括刘海、灵动岛和底部 Home 条区域，最小缩放也不会露出地图外的底色。去掉原先贴着地图边缘的米色纸带和黑线，改为宣纸色的淡淡做旧暗角。主页顶部、地图页上下改为淡墨渐隐，不再出现色带或硬边。"]),
        ("1.11.0", ["【开卷动画】新世界与进入游戏的动画重做成一幅画的过程：先是一张白纸，海水晕开，陆地留白；墨线勾出海岸，赭墨染出山河；各国颜色从都城向四境晕开，最后才落下国界、城池与地名。每一层都是渐显，不再整块跳出。",
                    "【入场】地图画完后，上下的控件带弹性滑入；读档进场的镜头更舒缓。",
                    "【集结出击】需要几支军队合打的目标，不再一支一支送上去：先到目标旁的本国州郡集结，兵力大致到齐再一同进攻；兵力远不够时就在边境等待，不去送死。估算敌情时把目标邻州的敌军也算进去。军事页会标出「集结」。",
                    "【知难而退】进入敌境的军队遇到远多于己方的敌军时，会退回最近的本国州郡重新集结，不再迎着数倍之敌硬冲。",
                    "【推演提速】每天的战场结算由六次并为两次，陆军、舰队的调度改为分批进行。实测四个世界三年推演，战斗次数与易主数基本不变，一天的计算时间约为原来的四成，高倍速更跟得上。",
                    "【叛乱】默认更克制：国家要到 24 州以上才会大规模分裂，开局一年半内不起大乱，起义概率降低，让大国有机会走向统一。可在「天下诏令与规则」里调回。"]),
        ("1.10.3", ["【连续操作】单步尚在排队时立刻开始再暂停，已执行的单步仍能完成显示，防止日期停在旧值。",
                    "【舆图更新】边界加粗、外交着色和领土更新分别核对后台任务，选中国家或州郡时不再互相取消，易主后的城池和省界也能完成更新。",
                    "【画面卡顿】外交着色与易主同时发生时，过期颜色交给最新后台结果替换，避免在面板滑入时临时重算全图颜色；颜色浓度调整也移到后台。",
                    "【验证】增加固定世界、暂停状态下的国家、州郡、军队和排行面板采样，核对前后存档一致；性能改善幅度和真机表现继续按实测记录。"]),
        ("1.10.2", ["【暂停恢复】旧推演循环返回时不再追加下一步，恢复或单步以后，旧结果也不能覆盖新的显示时间与军队位置。",
                    "【切换世界】读档、建世与地图解码在等待后重新核对世界归属；排队的旧请求不能推进或替换新世界。",
                    "【连续单步】快速点击的单步按顺序处理，再开始推演时先等待已提交的单步，避免日期来回跳动。",
                    "【验证】新增真实引擎上的快速暂停、恢复和单步巡览，并检查暂停后的显示日期与引擎日期一致；面板布局卡顿和纯 Swift 建世仍继续处理。"]),
        ("1.10.1", ["【军机调度】非都城防线兵力悬殊时，尚在途中的回援部队不再被提前锁死在原目标上；能够转向其他战场，避免继续零散驰援。已经交战的部队保留战位，都城仍优先保卫。",
                    "【军令衔接】军机取消回援或调整把守任务后，新的部署会真正替换旧的在途军令；正常进攻同一目标继续保留已有行军进度，玩家接管、撤退与交战保护不变。",
                    "【远程计算】引擎协议更新，电脑服务器需与本版配套；旧服务器不会接管使用新调度规则的世界。",
                    "【后续】纯 Swift 建世尚未全部接通，仍保留现有创建流程；造舰与改革特质的完整机制、真机性能验收继续待补。"]),
        ("1.10.0", ["【军机调度】打仗的国家不再各军自行其是：先按来犯之敌调拨兵力回援，够用就停，其余军队继续进攻；不进攻的边境留兵把守，防止被第三国偷袭。",
                    "【进军】主力集中对付一个主要敌人，分几路推进；打下一地后从当前位置继续向敌国都城前进，不再掉头去打离老家近的地方。收复失地也集中兵力，不再一州派一支军队。",
                    "【和谈】兵力占优的一方不会因打了几个月就草草收场；援军还在路上的大国不急着割地；僵持的战争才会因厌战结束。打到只剩残局的敌国会被直接吞并。",
                    "【统一】单次叛乱的规模大幅缩小（最多 12 州），大国叛乱门槛提高，打下来的江山不再一场起义就丢掉一半。",
                    "【修复卡死】两军临近接战距离时可能出现计算空转，游戏会卡住数分钟，已修复。",
                    "【修复闪退】一支军队覆灭、同时又新建一支时可能闪退，已修复。",
                    "【军事页】每支军队标出主攻、回援或把守，每国显示兵力分配；新增「战局」分页，查看所有战争的兵力对比，点一下镜头飞到战场。",
                    "【纪事】展开一条有地点的记载，可以「在舆图上查看」。",
                    "【大事暂停】设置里可打开：宣战、起义、亡国时自动暂停，不错过关键时刻。"]),
        ("1.9.0", ["【生成世界】进度条改为引擎的真实进度，不再先走到 100% 然后干等；等待超过 20 秒可放弃回标题，超过 3 分钟自动重启建世引擎并提示，不会再无限卡住。",
                   "【生成世界】州郡数偏少时（如联合大陆 35 州、群岛 12 州）引擎划不出疆域，以前会失败报错；现在州郡数自动上调到能成立的数目，并在开局提示。",
                   "【稳定】手机内存紧张时系统回收建世引擎，不再把正在玩的世界踢回标题；局中开新世界时，旧世界尚未结算的一步不再写到新地图上。",
                   "【远程计算】App 只接入同版本的电脑服务器；旧版服务器不再接手世界，这局留在手机上计算。电脑端需更新到本版。",
                   "【新功能·山河预览】新世界页直接显示这个地形和种子会生成的山河，可一键换一方山河，看中了再开创。",
                   "【新功能·世界卷宗】开创新世界时，推演满一个月的旧世界自动收进卷宗，不再被覆盖；标题页和菜单都能展卷继续，也可以焚毁不要的。",
                   "【画面】标题和开局时海面上不再漂着无主的兵牌；陆地升起之前海面是干净的深海，不再提前露出海岸的影子。",
                   "【画面】地图外框的墨线改为暖褐色，竖排题词去掉错位的标点，各处图标按钮的文字基线对齐；军队在路上显示「途中」，不再误写成「海上」。"]),
        ("1.8.0", ["【动画】叛乱、复国等特效改在事发州郡显示；兵力对比条随战况平滑变化；国家页切换标签时内容淡入；被避让的地名重新出现时淡入。",
                    "【修复】重算气候现在会真正更新地貌、河流和海岸水线；无主之地不再发生叛乱或被当作旧邦复国。",
                    "【舆图细节】地图新增沿岸水线与浅水、沙岸、海上波纹、罗盘和比例尺；放大后可见草丛、沙丘、丘陵、田亩与城市间的道路；可在地图显示里关闭。",
                    "【气候与自建文化】新世界和自绘地图可调降水、气温、南北纬度；游戏中可在山河图页重算气候与河流（仅开局的世界）；可新建全新的文化和宗教，所有列表与地图图例同步显示。",
                    "【世界编辑·续】疆土页：无主之地（可设不可征服）、行政区新建绘制删除与重生成、家族封地绘制擦除与除爵、自动放弃孤立行省、协助盟友开关；同盟页：改名、改色、踢人、拉人、铁盟、解散；山河图页：手绘河流、按文化重命名全部城市、随机地名、地图图片（缩放、旋转、透明、前后层）；国家页：新增兵种、军事档案与文化宗教的导入导出、国名模板、随机国名；州郡可锁定城防与人口；天下规则新增叛乱与事件频率。",
                    "【世界编辑】菜单新增世界编辑页，对照原作的编辑面板：笔刷（国家、文化、信仰、圣地、要塞、人口、瘟疫饥荒与平灾，划过州郡即可落笔）；地图标注（自定义文字、字号、颜色、倾斜，存入存档）；文化宗教改名、写描述、追加人名；导出地图截图与大事记、清空大事记。",
                    "【国家自定义】新增国家特性逐项开关与全开全关、官职称号修改、兵种档案（名称、战力、行速、征募权重，可禁用某兵种）、强制退出同盟。原有自定义内容全部保留。",
                    "【地图边框】按原作规则重做：地图外沿一条纸色宽边，外侧三道细墨线，地图之外是整张羊皮纸；可以把地图拖到露出边框。",
                    "【战斗】地图上的交战处显示双方兵力对比条；占绝对优势的国家会集中大军先灭最弱的敌人。",
                    "【流畅度】页面打开时不再随每步行军重绘；240 州下接战判定、占领结算、行军排序都不再重复计算。",
                    "【引擎】行军、接战判定、占领结算不再重复计算：测试中 240 州每日推演由约 241 毫秒降到约 162 毫秒，80 州由约 61 毫秒降到约 41 毫秒。"]),
        ("1.7.0", ["【大叛乱】民变不再只丢一州：安定度过低的国家会爆发波及大片州郡的叛乱，驻军倒戈，叛军一次拿下一个地区，分农民起义、军阀割据、神国起义、藩镇独立、旧邦复国五种，新朝、义军、军政府、神国各有国号。",
                    "【节奏】停战期由三到十二年缩短为一年，战争目标翻倍，占优一方乘胜不收兵，厌战来得更晚，开战更频繁。",
                    "【属性】君主的军事、行政、魅力与国运、腐化直接影响进攻、防御、岁入、人口增长和安定，国家页新增「国势」一栏把数值摆出来。",
                    "【制度】新增科举、郡县、分封、均田、两税、募兵、府兵、议会、大宪章、海禁、开海等二十种制度，各有实际效果，各国会自行变法，玩家可在国家页点选颁行或废止。",
                    "【文化宗教】新增文化事件与涵化、宗教事件、复辟与神权建国；大事记改为要闻、政权、制度、文化、宗教、战争、领土等分类，州郡易手单列到领土，不再刷屏。",
                    "【长按地图】长按任一州郡打开快捷面板：放军、遣散、划地、迁都、立国、要塞、圣地、五种叛乱、旧邦复国、人口存粮、特产、文化、信仰、天灾、国库国运、宣战，一页全有。",
                    "【横屏专用界面】手机横屏时功能栏竖排在左侧，所有页面从右侧滑出，地图不再被遮挡，可向右滑动关闭。",
                    "【都城】灭国后不再残留都城标识；都城名在地图上以朱红显示，国家页可一键定位。",
                    "【国名避让】国名改放在领土最深处，沿本国最长的一段土地排布并按地块缩放，不再压到邻国；重叠的国名和城市名自动让位，放大后再显示，大的优先，飞地的同名也不会挤在一起。",
                    "【改朝换代】义军、军政府、神国站稳后会改制：义军首领称帝立新朝或建革命政权，军阀黄袍加身、还政于民或自任元首，神国转为教廷或世俗王朝；衰败的王朝也会被权臣禅代，国号随之更易。",
                    "【快捷面板扩充】长按面板新增军令（全军来援、全军固守、查看本州军队）、连片划入、全国煽动、停止全部战争、结盟、归附、吞并、更改政体、颁行制度、好战程度、军威加成。",
                    "【240 州优化】行军改为军队各自结算到节点，不再因某一支到达节点就让全图重算一遍。",
                    "【视觉打磨】状态栏隐藏，地图上下加墨色过渡；各页数据栏文字、数值和进度条对齐；去掉标题色条下的残线，印章大小统一；兵种色带不再溢出卡片；排行榜用各国国色；列国列表国名不再折行；改朝换代等重大事件以顶部小横幅通报，不遮挡地图；都城名改为朱红。",
                    "【大事记去重】叛乱的建国记录与叛乱记录合并。"]),
        ("1.6.0", ["【悬殊之战】兵力相差两倍以上时伤害与围城随之提高（最多 ×2.5 与 ×3），十倍之敌失地过半才乞和，占绝对优势的一方不再因厌战半途停战，小国背水加成在四倍劣势时失效。",
                    "【冷门政权】各国会按文化与宗教演变出苏丹国、哈里发国、幕府、沙皇专制、汗国、商业共和、城邦、骑士团国、教宗国、政教合一、选侯君主、摄政、封建王国、军政府、独裁等，国号随之改变。",
                    "【事件翻倍】事件再增 26 种（共 50 余种），频率提高一倍，全部有实际结果：水患、雪灾、军器革新、士卒逃亡、募兵成军、屯田、储位之争、弹劾权贵、和亲、蛮族寇掠、掘得宝藏、君主励精图治或沉湎酒色等；灾害、人才、财富、政变等事件在地图上有对应特效。",
                    "【放置军队】放置模式顶部新增数量滑条（1～30），拖动选择后点按或一指划过州郡即可成批放下军队，落点有光效和飘字，滑条有震动。",
                    "【名字】同名军队自动编为「第二团、第三团」；九大文化各增数十个人名；中华等十八种文化各增二十到四十个地名，每局随机替换约一半城市。",
                    "【修复】举债不再每月刷屏；国家破产后债务大幅减免，不会紧接着再次破产；例行编军不再进入要闻。"]),
        ("1.5.0", ["【国名·对照原作】一个国家的领土被别国隔成几块时，每一块各写一个国名（太小的碎块除外），不再把一个国名写在几块领土的中间、压在别国头上。",
                    "【动画·符合直觉】州郡易主时颜色在约 0.7 秒内由旧主渐变为新主，不再一帧跳变；被歼灭、解散或并入他军的部队在原地渐隐消失，不再凭空不见。",
                    "【战时留守】交战时都城受威胁（敌军进入都城、兵临邻州或占了邻州），必留一军守都：已在都城的那支原地留守；都城空虚时，本国境内的一支回师留守，不再倾巢而出。",
                    "【小国坚韧】不足 8 州的国家背水一战，所部承受的战斗伤害随州数减少而降低（1 州时少 25%，云端可调），强国不再一季之内吞掉小邻国。",
                    "【自绘地图】新增「崎岖」笔刷：在笔刷范围内随机起伏，画出的海岸与山脊不再圆滑生硬；地形工具改为五列排布。",
                    "【施政与赤字】施政改为君主才干与国运各占一半，不再几乎人人为 0（施政越高腐化越低）。国库不能再无限透支：赤字自动转入国债，负债超过 48 个月收入即国家破产。",
                    "【宗教细分】中华宗教细分为儒教、民间信仰、道教、全真道、正一道、佛教、禅宗、净土宗、天台宗、藏传密宗，另有白莲教、明教、景教；东亚各国开局按文化取其一为国教。每种宗教作为国教都有实际效果（开战意愿、岁入、攻守、国运、人口、腐化）。",
                    "【州郡信仰】每州有自己的信仰：被征服后保留旧教、逐月改宗（同宗相近的改得快）；异教州更易叛乱，异端（白莲教、明教）会揭竿起事。国中信仰统一得国运，四分五裂损国运，国教信众不足三成时朝廷改宗；持有本教圣地每年国运 +1。宗教地图按各州实际信仰上色，国家页显示信仰构成。",
                    "【政权更迭】国势危殆时，议席够多的共产党、法西斯党、军人派会发动革命、夺权、政变，真正改变政体（改国号、一党执政，国库国运受损）；反对派发动总罢工（损失一月岁入、夺议席）和学潮（损国运）。",
                    "【天下事件】新增二十多种有实际结果的事件：粮价飞涨、铸币贬值、贪墨案、清丈田亩、兴修水利（人口上限）、修驿道（补给）、增筑城防、大火、流民迁徙与起事、海盗、开科取士（官员能力）、名医止疫、宫闱丑闻、权臣专擅（家族势力）、犒军、欠饷、整训扩编、大赦、通胀、毁寺灭教、大兴寺观、异端传入等。",
                    "【长按菜单】长按不再弹系统菜单：按住时该行下沉并染上淡朱色，随后震动一下，弹出纸面卡片菜单，选项逐条浮现；族谱操作、在此立国也改用这张卡片。",
                    "【操作反馈】所有按钮都有回应：整肃吏治、改税制、举债偿债、改特产、改文化、划地等，结果直接显示在当前页顶部（以前的提示被全屏页面挡住，看起来像没反应），并有成功或失败的震动。",
                    "【党派】党派按文化取材：纳粹党、德国社会民主党、中央党，布尔什维克、孟什维克，国民党、中国共产党，立宪政友会、大政翼赞会，长枪党，复兴党、穆斯林兄弟会等共七十余个；分十二种路线（共产主义、社会民主、农民派、改革派、自由主义、商业派、保守主义、宗教保守、君主派、军人派、民族主义、法西斯），各有三项政策和实际效果（开战意愿、岁入、攻守、国运、人口、腐化）。新增法西斯、国家社会主义两种政体。",
                    "【党派对抗】议席不再每次选举重新抽签：丢地、缺钱、腐败、负债时执政党逐月失席，选举在现有议席上摇摆；路线对立的大党爆发街头冲突，弱势内阁被倒阁，共产或法西斯执政党可查禁反对党，大党会分裂出新党，全部记入国史。",
                    "【家族对抗】世家之间结世仇、联姻修好、朝堂排挤、刺杀家主，势力与彼此关系随之变化；世家一栏标出宿敌。",
                    "【金融】新增国债：战时缺钱自动举债，也可在财政栏手动举债、偿债；利率随负债升高，利息按月扣除；负债超过 48 个月收入则国家破产（赖掉一半、国库清零、国运 −10、腐化 +10）。负债沉重会拖累执政党。",
                    "【天灾】瘟疫和饥荒变为持续数月的灾害：瘟疫每月减员并向邻州蔓延，最多波及 12 州，州郡页标出灾情，平息时记入国史。",
                    "【官称】官职名称再按文化和政体细分：关白、领议政、大维齐尔、萨特拉普、执政官、大盖特曼、人民委员、帝国元帅、老中、万户长等。",
                    "【界面统一·图示】从标题、新世界、设置到游戏内各页，统一一套纸面朱印样式：所有分页按钮（国家页、菜单、军事、排行等）在文字上方配线描图标；所有开关、数字调节、信息行和可编辑行按名称自动配朱色小图标，不再是一列列纯文字。",
                    "【新世界】改用与其他页相同的标题与朱印、分节标题；地形改为带示意图的卡片（多大陆、联合大陆、群岛、高山大岛各有图示与一句说明），开局与命名改为带图示的二选一卡片，删去冗长的技术说明。",
                    "【行军不扭】军队转弯、停下、掉头或改道时，新一段路程直接朝目标走，延续的方向最多占该段六成，不再画出向外鼓的弧线、左右摇摆；几支军队同驻一处围成一圈后出发，保持原来的错位前进，不再一出发就从圈上跳回中心。",
                    "【界面统一】各页卡片统一为同一种纸底墨框样式（圆角、边线、内朱线、投影一致），国力走势、兵种构成、外交分组、对阵图不再各用各的圆角与描边；状态、称职、执政、立场、帅旗、州郡属性等小标签统一为同一种标签样式。",
                    "【流畅】打开国家页时为盟友与敌国上色、切换地图图层时的整图着色改在后台计算，打开页面不再卡一下。",
                    "【战争·修复】战争结束后进攻箭头不再残留：箭头只为仍在交战的国家而画（以前回国的军队也会把箭头留在原处）。",
                    "【战争·修复】宣战后与敌国不接壤（隔海或隔着第三国）时，军队不再在家干等到停战：会向距离最近的敌国州郡远征（渡海或借道）。",
                    "【上帝之手】玩家亲自宣战不再受停战期限制；两国不接壤时自动改用其他可用的宣战理由（吞并、文化统一、强制改宗等）。AI 仍须遵守停战。",
                    "【朝堂】官职名称随政体而变：帝国 丞相·大司农·太尉，王国 宰相·司农·大将军，共和 总理·财政部长·国防部长，联邦、神权、部族各有其名；总督在共和制下称州长。每行只留官称、在任者、称职与否，修改能力改为长按。",
                    "【党派】每个党派都有党纲（主战、主和、重商、重农、改革、守旧），执政党的党纲实际影响开战意愿、岁入或国运，议会里写明。",
                    "【世家】各世家移入朝政页底部的「世家」折叠栏，并写明作用：子弟出任官职、执掌封地，离心至谋逆可能举兵；点家族看族谱，长按改拥戴关系。",
                    "【国家性格】每个国家有一种性格（开疆拓土、尚武、守成持重、重商务实、崇信教化、中庸），影响开战意愿、攻守、岁入或国运，显示在朝堂特性里。",
                    "【军事页】重做：总兵力、军队数、交战数、平均士气一览；兵种构成条与图例；每支军队带兵种图标、状态（交战/行军/驻守/撤退）、所在州郡与士气条；舰队与战事卡片。",
                    "【外交页】重做：交战、同盟、宗主、附庸、停战、条约分组，以国家色块标签列出（点标签飞到该国），停战与条约注明剩余年限。",
                    "【自定义】国色可用系统取色器自由调色；迁都改为在地图上直接点选（页面暂时收起，点完自动回到国家页）；政体列表收为折叠的两列卡片。",
                    "【都城】地图上的都城标记加大并改为金环红心，一眼可辨；国家页基本信息显示都城，点一下即可在地图上点选迁都。",
                    "【天下大事】随机事件由 5 种扩充到 16 种，并有实在后果：蝗灾（一州存粮去六成）、地震（城防降一级）、洪水（存粮尽失）、大旱、瘟疫（全国人口 −3%）、人丁兴旺、名将出世（全军士气 +15）、兵变（一军折损两成）、盗匪蜂起、天降祥瑞、发现矿藏、学者云集、诸藩朝贡等，均记入国史。",
                    "【军队特性·军功】军队按参战次数晋升：新军 → 劲旅（2 战）→ 精锐（6 战）→ 百战之师（12 战），每级攻击 +6%、受伤 −4%；军队页写明军功等级。",
                    "【海军·海上封锁】敌国舰队占住本国港口时，按被封港口占本国港口的比例，每月最多少收三成国库收入；州郡页标出「封锁」。",
                    "【自绘地图·划定列国】自绘地图新增第三步「划定列国」（原作编辑器的绘制国家、设为都城、建立国家）：选一国在地图上涂抹州郡划入该国、移动都城、点州郡新建国家（最多 24 国）、删除国家（其地由邻国补齐），开辟天下时按你划定的版图建国。",
                    "【原作补全·圣地】每个宗教都有一处圣地（原作的圣地与「圣城」城市类型）：开局取该教国家中人口最多的州，此后不随疆界变动；地图上以金色四芒星标在城旁，宗教卡片写明圣地及今属哪国；州郡页可「设为本教圣地」。",
                    "【地图·要塞】城防 3 级以上的州郡在城池旁标出城垛图标，一眼看出哪里是要塞。",
                    "【节奏·对照原作】领土易手更频繁：围城速度 ×6（原为 ×4），各国更好战（2.6，原为 2.0），两场战争之间休整 2 个月（原为 3）；以上都可云端调。",
                    "【大地图性能】按 240 州、16 国的大地图实测优化：超过 80 州的地图每州常备军按地图大小的平方根递减（240 州约为 0.58 倍），全图行军规模与原作相当；行军推演每一步只看仍在行进的军队，并以数组记各军所在区域，不再逐军按字符串查位置；每日钱粮结算先把军队按州郡归好，不再每个州郡把全图军队筛两遍。",
                    "【性能】行军推演每一步只重算真正移动了的军队位置（以前每一步把全图二百多支军队全部重算一遍）。",
                    "【世界编辑·在此立国】州郡页新增「在此立国」：选「和平独立」则本州立即成为新国家（按本州文化生成国号、君主与家族，双方不开战）；选「举兵独立」则本州起兵反抗原主（可能复兴故国）。该国最后一州与无城池之州不可。",
                    "【共和国／联邦大选】以前共和国、联邦的元首终身在位，只在去世时按紧急规则补位；现在四年一度大选时按原作共和国候选规则（能力、家族势力、战功）择优当选，在任满八年者不得再选，纪事记录「在大选中当选」。",
                    "【性能】军队自主调度每批只查本批军队所属国家的战事（以前每次把所有国家都查一遍）。",
                    "【对阵图】一州之内有多国军队时，按交战关系分成几场：守方与其盟军对攻方，另有不相干的两国在此交战则另起一张「遭遇」图；从军队页打开时自家那一场排在最前。",
                    "【家族·族谱】族谱里点在世族人即可：修改能力与天赋、设定年龄、为其婚配、添一子女、处死（原作族谱的操作），处死会按原作规则让官职、家主、王位由他人接任。",
                    "【官职】朝政页新增「各州总督」：每个州郡的总督与称职程度一目了然，点州郡即可改任；朝廷百官在官职不多时默认展开。",
                    "【州郡】点地块的州郡页新增总督（及称职与否）、据此为封地的世家、民心（每次叛乱检定的起事概率，≥40% 标为民变）。",
                    "【叛乱】朝政页新增「叛乱形势」：说明本国此刻能否生乱（太平期、州郡不足、立国未久、距上次叛乱太近、国运稳固），并列出最可能起事的州郡与每次检定的起事概率。",
                    "【原作补全·煽动叛乱】国家页「国家行为」新增「煽动叛乱」：在该国随机一个州郡（不含都城和战区）煽动起事，自立为新国家（原作功能）。",
                    "【2.0 计划表全部完成】五个阶段（平滑行军、军牌与驻军、统一图标、对照原作的寻路、战斗表现）都已落地。",
                    "【寻路·对照原作】原作的海路代价远低于陆路，长途行军会选择渡海；现在应用世界里海上行程按一半计价，远征更常走海路。",
                    "【界面】全部系统图标改为细笔画（原为粗体），与楷书文字和水墨图标协调，不再显得生硬。",
                    "【性能】逐帧交战判定：两次行军之间位置、交战和战争状态都没变时直接沿用上次的结果（以前三帧里有两帧在重复计算同样的东西）。"]),
        ("1.4.0", ["【寻路·对照原作】原作寻路用 A* 算法：朝着目标方向搜索。我们原来每次都把半张地图的格子搜一遍，而军队 AI 每选一个目标都要算一次路线；现在改为 A*，结果同样是最短路线，但只搜索通往目标的一条走廊，军令计算明显变快。",
                    "【开局动画】生成地图与开场背景的「陆地升起」有马赛克：高度按格子计算，每个格子整块跳出来。真正的原因是相邻格子不共用顶点、各按自己的高度显示，边界处颜色断开；现在升起改为按地图位置的连续起伏计算，相邻格子在交界处取值相同，海岸线成片地漫上来。",
                    "【横屏】地图图层切换在横屏时太高、被底栏挡住，横屏改为四列网格。",
                    "【国家页】特产与贸易、朝堂、议会、军队、国史、外交等默认展开，不再一打开全是收起的标题（朝廷百官名单较长，仍默认收起）。",
                    "【流畅】打开页面暂停推演时不再重画地图和全部国名（关闭页面恢复推演时自然会更新），各页面打开时的顿挫进一步减少。"]),
        ("1.3.0", ["【性能】行军计算大幅提速：交战关系以前每走一小步就全图重算（60 天里 5141 次），现在只在两军相遇、进入新地区或交战方移动时才算（189 次），测试服务器上推演一天由约 122 毫秒降到约 72 毫秒；相遇计算也只给附近有敌军的军队算速度。",
                    "【流畅】打开任何页面时会暂停推演，并把积攒的领土与国名变化画到地图上——以前这一步正好压在页面滑入动画里，每个页面都卡一下；现在等页面滑入后再画。",
                    "【流畅】打开页面卡顿：自动体检测出反复打开国家页时最长卡 430 毫秒、42 次明显卡顿，原因是国家页数据（全部人物、家族）在主线程解析；所有面板数据改到后台解析。",
                    "【速度】推演与界面并行：以前手机上引擎算完一步、主线程再更新界面，两者轮流，一天的耗时是两者之和；现在引擎算下一步的同时界面更新上一步，同样耗电下每秒能推进更多天。",
                    "【国名·对照原作】国名不再一律横排：沿国土的长轴倾斜（最多 35°），长度按国土沿该方向的跨度，领土因战争变化时随之重新摆放。",
                    "【测试】自动截图巡览新增「卡顿体检」：边推演边连续拖动地图、反复打开关闭国家页，记录主线程帧间隔（平均、95%、最差、超过 50 毫秒的卡顿次数），每次构建都能看到流畅度数据。",
                    "【新功能·国力走势】国家页顶部新增国力走势图：每月记录一次国力，显示近十年曲线和涨跌幅，一个国家是在崛起还是衰落一眼可见。",
                    "【性能】军队行军计算：以前任何一支军队走到一个路点，都要把全图约两百支军队的交战关系重算一遍；现在附近没有敌军时直接跳过，只在敌对军队同处一地时才计算。港口名单缓存，不再每检查一条路线就重建一次。",
                    "【战斗】败退中的军队在地图上变淡，一眼看出谁在溃逃；战争箭头改细、加深色描边，不再又粗又亮压住地图。",
                    "【界面】国家页顶部四个数字格去掉铅笔记号（点一下仍可修改），不再四个铅笔排一排。",
                    "【海战】海上交战不再用陆战的刀光，改为舷炮齐射：炮口火光、白色硝烟随风飘散、落弹处水花一圈圈扩开。",
                    "【界面】各页数据行去掉 0.38 加的系统小图标（与纸墨风格不搭、显得杂乱），只在数字格保留。",
                    "【军队·对照原作】军牌下方显示兵力（如 3200、1.2万），地图放大到一定程度时出现，跟着军队走。",
                    "【战斗·对照原作】交战处换上原作的刀光动画（两把刀交击的 40 帧循环），每处战场节奏错开；原来只有一个很小的闪烁记号。",
                    "【寻路·对照原作】原作寻路给「不在港口登船」加了 450 的代价，所以军队渡海都从港口上船；现在照此处理：没有港口的州郡下海要多走约四十步的路程，军队会绕到港口登船。",
                    "【行军·对照原作】原作把行军路线平滑成曲线、匀速前进；我们以前每一步直线滑行、下一步突然转向，看起来一顿一顿、走折线。现在每一步都沿着上一步的方向和速度出发，整条路线连贯成弧线。",
                    "【军队·对照原作】军牌改为原作的方形底牌；驻扎的军队会在驻地缓慢游动（原作军队在州郡内随机走动），不再像钉在地图上；港口不动。",
                    "【音乐】五首原作曲目从原作无损音轨重新编码：由 98 kbps 提到 256 kbps，并留出 2 dB 余量（原音轨峰值几乎顶满，压缩后播放时会削波破音）；音质明显更好。",
                    "【启动动画】改用应用图标的玉雕城门：深海蓝底上图标缓缓升起定格，一道光扫过，「列國紀」三字依次写出，随后整体推向世界。",
                    "【创建世界】点「创建」后不再出现单独的加载动画，直接进入海水铺满、陆地升起的开国流程，无缝衔接。",
                    "【自定义】所有改数的地方都加了拖动条，按各项的实际范围拖动（如施政 0–100、关系 −100–100、财政加成 −50%–200%、人口增长 −20%–50%），也可以直接输入。国家加成逐项核对过都会实际生效：财政加成每月增收、进攻与防守加成乘在每一次交战伤害上、人口增长每月作用于各州郡、行军速度乘在全国军队的速度上。",
                    "【军队AI·分兵合击】军队不再全部扑向同一个目标：每个目标只需要足够的兵力（那里敌军的 1.5 倍，空城约两支军队），同袍已经凑够的目标就留给他们，其余军队去打别处，整条战线同时推进；本国失地仍优先派兵收复。上一版的「集中兵力」会让所有军队滚雪球般挤到一处，现已改掉。",
                    "【修复】大部队行军时上下左右扭动：为避免图标重叠，驻在同一处的军队会围成一圈，但行军中的军队每一步都重新排圈、来回跳动。现在只有停驻的军队才散开，且每支军队在圈里的位置固定。",
                    "【修复·震动】战报（宣战、议和、攻陷）每条都震、每场新战斗都震，战争一多手机就震个不停；现在战报至多每 5 秒震一次，新战斗至多每 8 秒一次，力度也调轻。",
                    "【音乐】加大音频缓冲，推演繁忙时音乐不再因丢帧而发出爆音。",
                    "【修复】交给叛军等新国家的军队缺少「故乡」记录，被军令系统每次跳过，此后再也收不到命令、一直站在原地；现在以本国第一个州郡为故乡，照常调度。",
                    "【测试】三年战争体检新增「进攻军队集中在单一目标的比例」，用来确认军队分兵。"]),
        ("1.2.0", ["【政权更替】原作的叛乱门槛按数百个州郡的地图定，这里的地图州郡少，几乎永远触发不了：国家要有 30 个州郡才会闹行省叛乱、开局两年内不许叛乱、家族要威望 200 且关系低于 −50 才起事。现在改为 8 个州郡、开局半年、威望 120 与关系 −35，家族起事概率 ×1.6；叛乱、内战、复国、新国家明显更频繁。",
                    "【节奏】战争再提速：开战三个月起厌战、一年内打不下去；战局占优半年即强制结算；宣战意愿 ×2、两场战争间隔 3 个月。以上数值都可由云端调整。",
                    "【修复·战争】议和后进攻的军队留在原地不回国：停战后对方领土不再给通行权，回国路线全被拒绝，军队就一直站着。现在回国的军队可穿过任何不与本国交战的土地；若仍无路可走（飞地、海路断绝），滞留六十天后遣返本国最近的州郡，并记入大事记。",
                    "【测试】新增「三年战争体检」：每次构建都自动推演三年，统计战争场数与持续时间、领土易手次数、军队规模，并找出议和后仍滞留外国的军队；有军队滞留超过半年即判为失败。",
                    "【云更新】游戏启动时自动从服务器拉取最新的平衡数值（杀伤力、攻城、议和、厌战、宣战间隔、军队与舰队规模）、各档推演速度和公告，改了马上生效，不用重新安装；没网时沿用上次拉到的。新功能和新界面仍需装新版本（iOS 不允许下载运行新代码）。主页底部显示当前云配置版本，有公告时显示在主按钮上方。",
                    "【原作补全·腐化度】国家页财政里新增腐化度：按原作分为政治清明、轻度、中度、严重腐败四级，国土越大、税越重、施政越差就越高，每月吃掉一部分收入，严重时国运逐月下降；可花四个月收入「降低腐败」，或自定义「加深腐败」。",
                    "【包含 1.1.0】行军计算提速、前线分配、海军争夺制海权、交战军队前冲后撤动画。",
                    "【节奏】交战杀伤力提高到原来的两倍（「战斗烈度」仍可调）：兵力相当的两军以前要磨一整年，现在几周内就分出胜负；攻城速度由三倍再提到四倍。",
                    "【节奏】议和更早：达成战争目标 4 个月即可议和，战局占优 9 个月即可强制结算；打满半年开始厌战、一年半彻底打不下去（原作是五年和十年）；各国更好战（宣战意愿 ×1.5，两场战争至少间隔 4 个月），僵持的战争会在一两年内收场，领土与政权更替更快。",
                    "【修复】多支军队驻在同一座城或在同一处交战时，图标叠成一团看不清；现在围成一圈散开，每支都看得见。"]),
        ("1.1.0", ["【性能】军队行军每一小步都要给每支军队拼一次所在地区的名字（「陆地/州郡号」）再按名字分组，一步两次；改为按数字分组，只在两军真正相遇时才生成名字。1.0 因军队增多而变慢的那部分推演时间可以省回来。",
                    "【军队AI·前线分配】本国被入侵的每个州郡先派兵守住，直到赶去的兵力压过那里的敌军；所有失地都有人守了，才集中兵力进攻。不再一窝蜂扑向同一处、其他边境空虚。",
                    "【海军AI·制海权】交战时十支舰队里六支出海作战（原为约三成）；除夺回本国港口外，优先寻找停泊着敌方舰队的港湾决战，争夺制海权。",
                    "【战斗动画】正在交战的军队，军牌和棋子在地图上前冲、后撤，每支军队节奏各不相同，一眼就能看出哪里在打。"]),
        ("1.0.0", ["【正式版】版本号进入 1.0。",
                    "【海军】开局舰队由 1 艘船、40 名水手改为 3 艘船、120 名水手（舰体、口粮随之），海战规模与声势明显增大。",
                    "【军队图标】每支陆军脚下加一块本国颜色的圆形军牌（深色描边），棋子改为浅色立在上面：以前浅色棋子混在地形里几乎看不见，现在任何缩放下都能一眼找到军队、分清敌我。",
                    "【节奏】攻城速度提高到原来的三倍（这张地图州郡少而大，原先一座城要围很久，领土几乎不动）；一国两场战争之间的冷却由 12 个月缩短到 6 个月；达成战争目标后 6 个月即可议和，战局一边倒时 18 个月即可强制结算（原为 12 和 36 个月），领土易手和政权更替明显更频繁。",
                    "【军队AI·协助盟友】参战盟友的州郡被敌军攻入或占领时，本国军队会把它列入目标，前去救援、收复（原作的「协助盟友占领土地」）；仍遵循上一版的强弱掂量与集中兵力。",
                    "【对阵图】点开正在交战或被围的州郡、或点开交战中的军队，顶部显示对阵图：守方与攻方国家、各自兵力、一条随战况伸缩的强弱条，以及双方每支军队的兵种、兵力和士气；点军队可直接打开。",
                    "【战况飘字】推演中每一步的交战伤亡在战场上方飘出（朱红为陆战伤亡，蓝色为海战船体损失），一眼看出哪里在打、打得多狠；手机发热时自动停用。",
                    "【开局动画】陆地升起时海岸线有一道墨线随之推进，国家颜色像墨渗入纸面一样成片晕开，而不是整张图同时变色。"]),
        ("0.39.0", ["【启动动画】重做为「夜幕山河」：墨色底上，朱红旭日缓缓升起，金色经纬线自行勾画出一只地球，「列國紀」三字自上而下落笔，印章按下，随后夜幕向外散开露出世界。只用图形和渐变，不用模糊和阴影，构建背景世界时也不掉帧。",
                    "【主页】重新设计：顶部墨色渐隐，竖排大字标题、印章与一句古语；底部纸色渐显，主按钮改为朱印样式的「开创新世界」（附一行说明），有存档时出现「继续上次的世界」，导入存档、设置、更新改为三个图标方块；各元素依次浮现。",
                    "【性能·主页】背景地图漂移由每秒 60 帧降到 30 帧（每秒只移 8 点，看不出差别，地图和国名重绘减半）；主页不再刷海浪；面板阴影改为只画在底板形状上，不再每帧额外离屏合成；建世界用的引擎等启动动画和主页展开结束后才启动，不再和动画抢处理器。",
                    "【修复】启动中过早点「新世界」时，引擎可能被加载两次、第一次请求永远等不到结果；现在同一时间只加载一次。"]),
        ("0.38.0", ["【军队AI】出兵前先掂量强弱：敌军兵力超过本军加上同袍援军 1.6 倍的地方不去硬碰（本国被入侵的州郡除外，照样回援）；同袍已在合击的目标，只要不比最近的目标远太多，就优先去会合（集中兵力），不再各自零散送死。",
                    "【军队数量】每个州郡在本土最多可驻三支常备军（原为两支），全国常备军上限由每州 1.5 支提到 2.2 支，天下总数上限 900 支。",
                    "【节奏】1× 由每秒 10 天提到 15 天，各档同比加快；新增 16× 档（每步最多 40 天）。手机算不过来时仍会自动少推几天，不会卡顿。",
                    "【界面】各页的数据行和数字格都配上小图标（人口、兵力、士气、粮草、国库、国运、州郡、战役等），一眼可辨；数字格打开页面时依次浮现。"]),
        ("0.37.0", ["【原作补全】战役：两军在某州郡交战即开启一场战役，按原作命名「第N次某地战役」（N 为该地第几次战役），之后在此参战的军队都记入同一战役，三天无战事即告结束；大事记记下战役爆发。",
                    "【原作补全】排行新增「战役」：最近一百场战役的名称、进行中与否、持续天数、参战军队数和交战各国；军队页显示「当前战役」和参加过的战役数。",
                    "【设置·可回退】推演与画面新增「进场镜头拉远」「动画先快后缓（关闭为匀速）」两个开关，可退回上一版的效果；调试里新增「恢复默认设置」，地图显示与推演画面的全部设置一键还原（世界与存档不受影响）。",
                    "【性能】地图缩小到军旗上不显示字时，行军中不再每帧收集全部军队的位置。"]),
        ("0.36.0", ["【动画】生成世界、标题背景、进入游戏时「陆地从海中升起、国色铺开」的动画改由显卡逐帧绘制：以前每帧都在主线程重算整张地图每个顶点的颜色并重建缓冲，所以卡顿掉帧；现在只传一个进度值，跟屏幕刷新率一样顺滑。",
                    "【动画】这段动画不再每帧刷新整个界面（以前每秒六十次触发全部 SwiftUI 面板和地图同步），面板上的阶段文字每秒只更新十次；节奏改为先快后缓。",
                    "【动画】进入游戏（新世界或读档）时镜头从近处缓缓拉远到全图，陆地同时升起。",
                    "【原作补全】军团信息：军队页显示当前状态（休整待命／前往进攻某地／前往防守某地／在海洋中航行／交战中／撤退中）、征召于何地、服役时长、满编兵力、参战次数、战史共歼灭敌军、折损，以及将领此刻的打算。",
                    "【原作补全】州郡页新增战争状态（和平中／与几国交战）、城市防御力、被围时的占领进度条（谁在围城、城防还剩多少），以及生物群系分布。",
                    "【原作补全】天下诏令新增「停止所有战争」（国与国的战争全部停战，内战与叛乱照旧）和「解除所有同盟」，执行前会确认。",
                    "【原作补全】排行新增「当前战争」：每场战争的攻守双方、开战理由和持续时间，点一下进入攻方国家。",
                    "【原作补全】国家页显示国教的圣书与三条教规，以及全天下的信徒人数和奉行国家数（原作有的宗教用原作文字）。",
                    "【原作补全】地图显示新增「经纬线」开关。"]),
        ("0.35.0", ["【发热】地图改为最多 2 倍像素绘制（3 倍屏上显卡负担减半以上，文字仍是原清晰度）；只有军队在走时地图每秒 60 帧，不再一直 120 帧；高帧率默认关闭，只在拖动缩放地图时生效。",
                    "【发热】战场标记、旗帜飘动、行军箭头、海浪这些循环动画限制在每秒 30 帧（以前战争期间整屏一直跑 120 帧）。",
                    "【设置】菜单 › 声音与其他 › 推演与画面：新增「画面档位」（省电／均衡／流畅，一键设定），以及可单独调节的拖动地图帧率（30/60/120）、行军帧率（30/60/120）、动画帧率（15/30/60）、地图清晰度（低／中／高／原生）、推演占用（50%～全速），「发热时自动降档」可关闭。旧版的高帧率开关会自动换成对应设置。",
                    "【发热】推演每一步都给处理器留出空闲，不再让一个核心满负荷连轴转；手机变热或开启低电量模式时，自动降到 30 帧、加长休息、暂停海浪与战场烟雾，降温后恢复。",
                    "【原作补全】国家特性接通：奋战至死（不因厌战求和，丢掉九成国土才投降）、欺凌弱小（挑最弱的邻国开战）、不畏强权（挑最强的邻国开战）、全面战争（与接壤的国家都更容易开战）。",
                    "【原作补全】朝堂页显示本国的国家特性及其效果（原作名称与说明）。"]),
        ("0.34.0", ["【性能】军队行军不再每走到一个格点就打断整轮推演，只在交战开始或结束时才停下结算：多军队大地图的推演从每日约 400 毫秒降到约 80 毫秒（约快 5 倍）。",
                    "【性能】每日军令不再为每支军队重扫全图军队与州郡：敌军位置、各国领土、边境与失地每天只统计一次（原先「军队数×州郡数×军队数」，大地图上是卡死的主因）。",
                    "【性能】占领判定只看有军队或在围城的州郡，不再一天二三十次遍历全图；每步导出状态时州郡归属改为查表，国名位置在推演中最多每四步重算一次，标签网格只读一次。",
                    "【性能】州郡易手时，整张地图的上色、国界、省界和城市标记全部改在后台计算后一次换上，主线程不再卡顿；推演中地图归属最多每 0.5 秒刷新一次，暂停时立即补上。",
                    "【性能】高倍速时每步可推进更多天（地图在显卡上平滑过渡），大地图在 4×、8× 下真正变快；军队基础行军速度再提高 25%。",
                    "【修复】省界与国界不重合：两者改为同一套平滑曲线——每两个州郡之间的边界只平滑一次，归属不同时画成国界、相同时画成省界，不再错开。"]),
        ("0.33.0", ["【原作补全】区域：相邻的四到六个州郡编成一个区域，以中心城市命名（某某道）；州郡页显示所属区域、州数和人口，可改区域名、设为区域中心；地图视图新增「区域」。",
                    "【大事记】纪事改为完整大事记：不再只显示最近三十条，按「战争／政事／外交／家族／天时人事」分类，按年份分段，点一条可看到事情的来由。",
                    "【设置】「声音与其他」新增「推演与画面」：显示军队、显示战争箭头、军队图标大小（0.6～1.6 倍）、高帧率开关（关闭后 60 帧更省电）、自动存档间隔（1／2／5 分钟或关闭）。",
                    "【性能】每月征兵不再为每个州郡重扫全部军队、重算全部军队位置，改为每国统计一次。"]),
        ("0.32.0", ["【经济】国家页新增「财政」：国库与两年走势、土地税收、国库过盈时的收入递减、贸易增收、军费、每月净入，以及国库多寡对战力的倍率（原作规则，以前看不到）。",
                    "【经济】税制可选「轻徭薄赋／常税／重税」：重税收入 +30% 但国运逐月下降、人口流失；轻徭薄赋收入 −20% 但国运上升、人口增长加快，每月真实生效。",
                    "【经济】地图视图新增「特产」，按特产给州郡上色；海上按原作出现商船，沿航线在和平国家的港口之间往返，交战双方的航线上没有商船。",
                    "【原作补全】壁纸模式（菜单 › 游戏）：隐藏所有按钮，地图缓缓漂移，轻点返回。",
                    "【原作补全】纪年与日期：可改年号和今年的年份（只改显示，不影响推演）。",
                    "【原作补全】编辑行省：州郡页可改本地文化（文化视图随之变化）和特产。",
                    "【原作补全】女性君主使用女性称号：女王、女皇、女酋长、女教宗、可敦、女沙皇等。",
                    "【说明】原作的「自动翻译」需要联网的翻译服务，手机离线版不做；创意工坊按你的要求不做。"]),
        ("0.31.0", ["【原作补全】特产与贸易：每个州郡按地形出产一种特产（粮食、木材、毛皮、马匹、铁矿、食盐、丝绸、茶叶、香料、瓷器、美酒、鱼获、宝石、棉布、铜矿），州郡页可改；国家拥有的特产种类越多、与接壤和同盟的和平国家互通有无越多，每月收入越高（国家页「特产与贸易」显示贸易伙伴与增收）。",
                    "【原作补全】生计（民族特性）：国家页显示农耕／游牧／海洋／渔猎／商贸，点开即可更改，影响收入，海洋国家海战有加成。",
                    "【原作补全】族谱：国家页「朝政」里点任一贵族世家，按世代列出族人、配偶、家主与官职，已故者以灰字标出。",
                    "【流畅】推演时军队的移动改由显卡逐帧完成：每一步只写一次起止位置，不再每一帧在处理器上重建全部军队的顶点和缓冲（军队越多越卡的主要原因）；跟随军队的兵力字样改为预先栅格化，不再每帧重绘阴影。",
                    "【战争】战争箭头重画：由浅到深六段渐变，不再是两截色块拼接；箭头头部加大。",
                    "【海洋】按原作在海面上随机掀起浪花：使用原作的浪花动画（64 帧），在视野内的海上此起彼伏，可在「粒子特效」开关里关闭。",
                    "【战争】军队本身的行军速度提高一倍（本作的州郡比原作大得多，按原作速度横穿一省太慢）；行军快慢不再只靠推演日数。",
                    "【战争】接战距离加大到约三四个军队图标：行军中的两军在野外、边界就会遭遇开打，不再全挤到城下才交战。",
                    "【战争】军队数量更接近原作：每州郡最多两支常备军，全国常备军上限由省数的三分之二提高到一倍半，全图上限 700 支。",
                    "【画面】军队图标再缩小约四分之一，远景最小 14 点；代表兵力的后排棋子改小、改淡，紧贴在前排棋子后面，不再像一大片阴影。",
                    "【界面】人物卡精简：一行显示姓名、性别年龄、四项能力缩写和一支小笔，天赋改为小标签（完整说明在编辑页）；去掉每张卡下的「点人物可修改」提示和自定义页开头的大段说明。",
                    "【修复】测试里开启应用规则后没有清理全局钩子，导致后面的原作对照测试失败；现在每次打开世界都会清掉上一局的好战与条约钩子。",
                    "【军令】点开军队新增八项操作：亲自指挥／交还 AI、就地驻守、回师本国驻地、补充兵员（按缺额花国库、从驻地征丁）、分兵（一半兵力另成一军）、合兵（并入同州郡的本国军队）、改名、解散（兵员回乡）。原有的调兵、撤退、停止、整编、定位保留。",
                    "【舰队】舰队页新增「亲自指挥／交还 AI 自主巡防」。",
                    "【流畅】创建世界与读档时，地图的地貌、省界、国界和城市图标改在后台与世界一起生成，点「创建」后进入生成画面不再卡一下。",
                    "【性能】占领判定里每支军队的战力只算一次（原先每省算两遍）。",
                    "【界面】新世界页的国家数、省份数不再重复显示两次标题和数值；排行页的分类改为与其他页面相同的纸面按钮。"]),
        ("0.30.0", ["【战争】交战改为按距离：敌军接近到约两个军队图标的距离才接战，同一省有敌军时向本省城池进军迎敌，走到城下才围城；不再隔着半个省开打，也不再两军擦肩而过。",
                    "【战争】停战或没有战争目标时，按原作 Army.Idle：留在他国的军队先撤回本国，再按原作首都圈与边境权重选驻地；以前会原地待命、一直不动。本国被敌军或叛军占着的失地，军队会主动收复。",
                    "【战争】外交页每场战争加战况条：双方兵力对比、历时、围城数。",
                    "【行军】地形减速改回原作（荒漠、冰川 0.7，山地 0.5，高原 0.7，其余不减）；1 倍速为原作的每秒 10 天，2×、4×、8× 依次翻倍。",
                    "【海军】舰队停泊在本国港口时逐月扩编，最多 5 艘；地图上按船数显示 1～3 艘船；舰队页可改船只数（1～10）与舰队名。战船与港口图标改画成与兵种棋子同一套风格。",
                    "【自定义】天下诏令新增「天下规则」：战争频率（0 为止战）、战斗烈度、行军速度、征兵规模、造舰速度，都接入真实计算。",
                    "【外交】新增邦交总览：盟友、宗主与附庸、交战国、联姻与互不侵犯条约（余月）、停战（余日）、接壤国兵力与强弱。",
                    "【地图】省界改为平滑的半透明墨线，任何缩放都清楚可见，默认打开；州郡页新增「地利」表，列出各兵种在此地形的攻守加减（与战斗实际计算相同）。",
                    "【画面】开局点开始时军队不再整体「瞬移」滑动；军队图标缩小约两成；底部纪事条每条至少停 1.6 秒，高倍速不再每步滑动。",
                    "【界面】菜单分「游戏 / 地图显示 / 声音与其他」三页，显示设置分四组；国家页分页、顶部弹出消息、日期栏与底栏统一为面板同款纸面与朱印，弹出动画与其他横幅一致。",
                    "【性能】推演去掉重复计算（外交关系建索引、每步状态一次汇总、军队目的地直接查表），实测每推演一天的耗时降低约三成；自动存档改为推演中最多每 2 分钟一次，不再每隔几秒卡顿；单次慢步不再拖慢之后的推演节奏；帧率面板移到顶部，并显示推演耗时。"]),
        ("0.29.0", ["海军造舰：被击沉的舰队不再永远消失。只要本国仍握有它的母港，船坞用六个月造成新舰并重新出港；军事页新增「船坞」一栏，显示正在重建的舰队和剩余月数。",
                    "「船舶大师」生效：君主有此特质时造舰时间减半（原作造舰时间 ×0.5）。",
                    "「改革家」生效：改革家登位时按其内政能力做一次变法判定，成功则在位期间施政 +15%，失败国运 −3；改革家在位时政体动荡的几率减半。",
                    "人物页不再标「（本版未生效）」。",
                    "减少卡顿：推演中切到文化、宗教等着色视图时，视图最多每 0.6 秒重算一次，不再每一步都排队占用推演。",
                    "设置里的「显示帧率」现在还显示推演每日耗时、每步推进几天和界面更新耗时，方便看出卡在哪里。"]),
        ("0.28.0", ["战争改回原作的按省交战：同一省里的敌军就会交锋，围城也按省进行。上一版把交战改成「两军坐标必须完全重合」，结果军队互相穿过、全挤在城点上，这一版修好。",
                    "交战中的两支军队重新画成面对面相遇的位置，不再叠在同一点上。",
                    "兵种图标重绘成一整套棋子：同样的底座、灰边和白底，地图上按国色上色（与原作的上色方式相同）。只有顶部区分兵种：兵卒、长枪、盾牌、弓、弩、马、披甲马、马背弓、帅旗、战象。",
                    "兵力档改用一到三枚棋子表示，不再用小圆点；统帅、御驾亲征的帅旗画在棋子后面（御驾亲征为金色）。修好帅旗以前根本画不出来的问题。",
                    "军队图标在屏幕上最小 26 点，远景也看得清。",
                    "顶部日期和战争数不再折成两行。"]),
        ("0.26.13", ["截图行程会打开最大国家的人物页。君主写上目录里已有的船舶大师和改革家，画面上能看到「（本版未生效）」。"]),
        ("0.26.12", ["人物行上，船舶大师和改革家在原有说明后面标明「（本版未生效）」。任命和改天赋时也能看到同一句说明。",
                    "载入、重算、查找电脑和朱红按钮忙碌时，改用生成世界那条墨条，不再用系统转圈。",
                    "纸面滑杆改成墨轨和朱点，数值和原来一样。"]),
        ("0.26.11", ["生成世界的进度不再用系统转圈，只留纸面上的文句和墨条。国库、赠金改用纸面输入框。新世界的国家数和省份数，加减下面改用同一条纸面滑杆。"]),
        ("0.26.10", ["常备军仍走常规目标。应急军和玩家放置的军队不是原作驻军，没有叛省打分，所以没有改成另一条目标。打分用的地块特征没有改。"]),
        ("0.26.9", ["行军路过已有敌军的省会停下来接战，不再只盯着远处的目标。开战时只在被打的本省和边境敌省之间挑目标；没有这类目标就原地待命，不强制撤回。驻军和叛军分路还没有军队类型，没有另做。"]),
        ("0.26.8", ["生成进度的文字跟着地图走。中途截图停在「冲刷江河」，不再停在「注水成海」。"]),
        ("0.26.7", ["截图行程会停在「注水成海」和大陆升起的中途，再拍设置和新世界。游戏里的纸面面板不再显示系统拉条。"]),
        ("0.26.6", ["府城圆标加大，仍小于国家首都的外环，普通城保持原大小。港口、要塞、圣地仍没有城市类型。",
                    "文化、宗教、迁都、州郡这些长列表改在宣纸上点选，不再弹出系统菜单。围城进度改成纸面上的墨条。"]),
        ("0.26.5", ["国家页点「人物」「战争」「外交」进入下一页，返回回到国家页。国家页默认只占屏幕大约四成，地图留在六成以上。基本信息仍是打开就展开。",
                    "人物页标题是「人物」。君主、继承人、行政首脑、财政主管、常备军统帅五节默认展开。有总督或战时统帅时同样展开。",
                    "打开国家页，或点中某州郡时，该国国界加粗一倍。没有单独的玩家国家。",
                    "战争页沿用已恢复的宣战理由和战争目标原文。国际理由是目录里的六条，不是八条，也不是九条。",
                    "新世界的文化勾选标明为文化集。宗教跟着文化。雪原、沙漠、战争规则偏好和高度图三档，生成接口不接收，没有空开关。"]),
        ("0.26.4", ["设置、新世界、显示设置、自绘地图、军团士气和国家页的国运与能力，改用已有的纸面滑杆和宣纸面板。出错提示和放弃地图不再用系统弹窗。"]),
        ("0.26.3", ["开场和生成世界恢复上一版的「注水成海」流程，不再用短淡入替换。",
                    "国家失去最后一块实控领土的同一刻，该国还有兵力的军队被清除，不再停在地图上发呆，也不再改去进攻或投奔盟国。清除时兵力、士气、军粮写 0，行军停下。这是按现有「失去作战能力」的写法收束（简化）。",
                    "省会、海色、省界、显示设置、州郡地形标题、国家页只展开基本信息，仍是 0.26.2 的内容。"]),
        ("0.26.2", ["省会比普通城更清楚，国家首都仍是三环。港口、要塞、圣地还没有城市类型，所以不加那些图标。",
                    "海水默认改为原作预设：浅海 #3c9cff、深海 #1487ff、海岸 #5f5f5f。原先的暖纸海色留在显示设置里（网页适配）。行省边界默认关闭，打开后是 #B2B2B2。",
                    "显示设置新增航线、暗边、羊皮纸、国名缩放、完整国名。拨动后地图立刻变，并会记住。国名缩放用的是原来颜色浓度那一行的纸面滑杆。",
                    "州郡页的地形小标题与地上的地形标签一致，不再出现「平原」旁边标着「热带雨林」。",
                    "国家页打开时只有基本信息展开，其余分节点开，展开动画 0.25 秒。纸面样式不变。"]),
        ("0.26.1", ["国界补入海岸、湖岸和世界边缘，国家外轮廓闭合。领土、军队、舰队等检查页面统一暂停推演，关闭后仅恢复原本正在运行的世界。",
                    "原生接战改为实际位置相遇，计算跨步相遇防止高速穿越；移除远距离交战时把图标拉到中点的表现补丁。进攻走到省城坐标，抵达后才结算占领。此为原生修复，原作完整军事规则仍需继续核查。",
                    "失去全部实控领土的国家仍可选择被敌国占领的法理领土作为反攻目标。朝堂与百官增加直接修改在任人物属性入口。",
                    "取消军队头顶旗帜与姓氏，主将改用侧边小徽记。港口全部标注；征伐主将可更换，家族拥戴关系与施政可编辑。完整海战及开局实际兵力突减仍在排查。"]),
        ("0.26.0", ["行军丝滑：每支军队在两步之间匀速走完（以前是先快后慢的追赶，看起来一顿一顿）；推演速度改为按手机实际算力自适应，算不过来就少算几天，不再卡顿。",
                    "新兵与重组：新征的军队在驻地淡入出现；被打光的军队先在战场倒下（墨迹散开），再在故乡淡入重组，不再像以前那样整支「尸体」滑过半张地图。",
                    "战争画面精简：交战处只留原作的双剑动画和淡淡的墨影，去掉了红圈；两军之间的连线改细改淡。",
                    "地图卷轴边缘：地图四周像旧卷轴一样渐渐泛褐，外加一粗一细两道墨框。",
                    "国家页点数字即改：疆域（绘制）、人口（全国按比例）、兵力（全军按比例）、国库、国运、月入加成都可以直接点开修改；点君主可改其姓名、年岁、能力与天赋；政体与文化点开即到自定义；议会的每个党派可改名、改席位。",
                    "国家加成（自定义页）：财政加成（每月增收）、进攻加成（军队伤害）、防守加成（承受伤害减少）、人口增长（每年各州人口）、行军速度（全国军队），都按真实规则生效。",
                    "地形影响行军：沙漠、雨林、沼泽、冰川、苔原、针叶林都会拖慢军队（如炎热荒漠六成速度、冰川一半、沼泽六成），草原最快；山地四成五、高原六成五。州郡页显示该地地形与行军快慢。",
                    "地图细节加回来：山峰与森林更密，沙漠有沙丘与碎石，沼泽有水纹与芦苇，草原、苔原、冰原的纹样也更多。"]),
        ("0.25.2", ["修复 0.25.1 安装包编译失败（国家页军事分类的军队列表一处代码），0.25.0 起的全部内容随此版发布。"]),
        ("0.25.2", ["修复 0.25.1 安装包编译失败（国家页军事分类的军队列表一处代码），0.25.0 起的全部内容随此版发布。"]),
        ("0.25.1", ["修复：通到海岸的国界线在平滑后差一点没连上海岸，现在两端准确接到海岸线；0.25.0 的全部内容随此版发布。"]),
        ("0.25.0", ["地图边缘还原原作：国界改用原作的平滑曲线（同海岸线一样的 CurveBasis 四段样条，取自原作 SmoothBorderLines），每国国界连成一整条柔和的线，不再是一格一格的锯齿台阶。",
                    "国家页分为五类：概览（君主、政体、文化宗教、国运、政体沿革、国史）、朝政（朝堂、议会、朝廷百官、家族人物）、军事（本国军队一览，点一支直接打开，帅旗与御驾标出；战争）、外交（外交关系、条约、国家行为）、自定义。",
                    "高度自定义，改完即时生效：国号（地图名字立即重画）、国色（十六色，疆域与国界随之变色）、迁都（核心州郡与防守加成随新都重算）、好战程度（直接决定此国 AI 主动宣战的倾向，可交还君主性情决定）、州郡人口（决定税收与兵源）、筑拆要塞（要塞守军防御三倍）、绘制疆域；国库、国运、文化、宗教、政体、征兵照旧。人物可改姓名与年岁，以及四项能力与天赋。",
                    "推演速度接近原作：原作一秒约十天，现在 1× 每步三天、每秒四步，2× / 4× / 8× 依次加快到每秒约二十、四十、六十余天，战争、攻城、反叛与家族兴衰都快了许多。",
                    "大事传报：起义、复辟、绝嗣、迁都像宣战与议和一样以朱印传报弹出，并有对应震动。"]),
        ("0.24.5", ["内部：自动截图增加行军连拍（逐秒跟拍一支行军中的军队），用于排查军队瞬移、隔空交战。游戏内容与 0.24.4 相同。"]),
        ("0.24.6", ["围城标记移除圆盘，改为小旗与横向抵抗进度条，减少地图遮挡。",
                    "战时守备：相邻州郡有实际敌军时，在本国实控州郡保留一支可用驻军，其余可继续推进；敌军离开后重新评估。不接管玩家军令、撤退或正在交战的部队。",
                    "回援优先：本国实控州郡已被敌军进入时，部队新选目标优先回援，不再因好战性格直接选择深入敌境。正在执行的行军暂不强制打断。",
                    "这是原生版战术适配，不增加小国隐藏倍率，不改变战斗伤害。完整协同、战力评估与开局自由省界编辑仍未完成。"]),
        ("0.24.5", ["国家页增加在地图上放置新军：点击州郡征募，禁止重复提交，拖动不连续刷兵。继续使用现有征募规则。",
                    "新增世界外圈双线边框，与地图坐标一致。此为纸面风格适配，原作外框细节仍待核实。",
                    "交战移除圆圈与双剑叠加，改为小幅朱红接触闪线，保留有限烟尘。新出现军队使用 0.4 秒显现。",
                    "尚未修复：重组军队真实位置跳变、战时协同留守、小国数值平衡、开局自由画省界与创建文化国家。"]),
        ("0.24.4", ["军队图标改为简洁的单一标记：每支军队一个粗线条兵种符号，国色填充、墨色描边——剑（步兵）、长枪、盾、弓、弩、马首（骑兵）、披甲马首（重骑）、马首加弓（骑射）、羽冠头盔（精锐）、象首（战象）、帆船、锚（港口）。至少 22 点大，远看也一目了然。",
                    "兵力改为标记下方的一至三个白点（不足两千一点，两千到六千两点，六千以上三点），不再画成一堆小人。帅旗保留。"]),
        ("0.24.3", ["修复地图上完全看不到军队：新画的兵种小人在 iPhone 的广色域屏幕上生成了地图引擎不支持的图片格式，贴图加载失败后整组军队都没画出来。现改为标准 8 位位图，并在加载失败时直接写入贴图兜底。"]),
        ("0.24.2", ["交战标记不再盖住军队：双剑缩小并挂在两军上方，外圈改为小纸圈；屏幕上挨在一起的几场交战只显示一个标记，下面的兵种小人和帅旗都露出来。"]),
        ("0.24.1", ["修复 0.24.0 安装包编译失败（兵种选择格与小人阵列两处代码），0.24.0 的全部内容随此版发布。"]),
        ("0.24.0", ["军队换回原作的兵种小人，并重新精绘：步兵持剑、枪兵长枪、盾兵大盾、弓兵挽弓、弩兵端弩、骑兵、披甲重骑、骑射、羽盔精锐、战象、战船，按国色着色、加墨色描边，任何底色上都清楚。圆章与兵力数字去掉。",
                    "兵力用小人数表示：不足两千一个，两千到六千两个，六千以上三个，排成小阵；具体人数在军团页查看。",
                    "帅旗：交战国兵力最多的一支军队竖起帅旗——有大将军或元帅时插国色帅旗，旗上写主将的姓；没有将帅时由君主御驾亲征，竖金色御旗，旗上写「御」。与引擎的战斗规则一致（将领的军事能力决定战斗加成）。军团页显示「主将」或「御驾亲征」。",
                    "兵种扩充到二十四种：在步、弓、盾、骑、精锐之外新增枪兵、弩兵、重骑、骑射，以及各文化特色兵——武士（日本）、军团（罗马、意大利）、战象（印度、越南）、长弓（英格兰）、马穆鲁克（阿拉伯、埃及）、怯薛（蒙古、突厥、吐蕃）、连弩（中华、朝鲜）、狂战士（北欧）、方阵（希腊）、具装骑兵（波斯）、骑士（法兰西、西班牙、葡萄牙）、长枪佣兵（日耳曼、尼德兰）、翼骑兵（波兰、匈牙利）、美洲豹武士（阿兹特克、印加）、射击军（斯拉夫）。",
                    "兵种相克，实际参与战斗结算：枪兵克骑兵（伤害 ×1.4），骑兵冲弓弩（×1.35）却畏枪阵（×0.75），弓兵压制步兵与枪兵，弩兵穿透重骑与战象，骑射袭扰步卒，战象冲垮步阵并惊散马群，步兵克枪兵与弓兵。各兵种的速度与地形加成不同（骑兵平原强、林山弱；弓盾山地坚守）。",
                    "征兵按国家文化决定兵种组成：草原民族多骑兵与骑射，各文化有约一成特色兵；开局军队也按文化重新编成。整编时可从二十四个兵种中任选，下方显示其长处与弱点。新建的世界生效。"]),
        ("0.23.1", ["军队圆章再放大到至少 20 点；兵力纸签在全图视野下也显示（上一版只在拉近后才出现）。"]),
        ("0.23.0", ["军队一眼看清是谁的：每支军队改为一枚国色圆章，墨边，中间是白色兵种纹样（步、弓、盾、骑、精锐、舰队），任何缩放下都不小于 16 点；以前是灰色小图标乘国色，远看几乎是黑点。",
                    "兵力标签：圆章下方挂一张小纸签写兵力，地图稍一拉近就显示（以前要拉得很近）。",
                    "交战标记放大，并加一圈跳动的朱红圆环，在整张地图上也能一眼找到哪里在打仗；远景下不再缩得很小。",
                    "地图配色：国家颜色默认浓度降到七成，山地、森林、荒漠透出来；设置里仍可调回。",
                    "地形更自然：山峰从远到近依次绘制、彼此遮挡，大小不一并略有错位，不再排成一行行；森林按成片的林区分布，有疏有密，不再均匀铺满全国。"]),
        ("0.22.3", ["界面统一：上两版新加的外交行动、国家搜索、军队筛选、地图编辑器笔刷设置原先用的是系统默认控件（圆角输入框、分段选择、系统按钮、系统开关），现全部换成游戏的纸面控件——纸笺输入框、朱红选签、朱红「遣使」按钮、纸面开关与滑杆。",
                    "国家页的文化、宗教、征兵驻地、割让州郡改为纸面下拉行（显示当前值，点开选择），不再是系统选择器。",
                    "外交行动按钮改为「遣使」，成功提示「国书已达」。"]),
        ("0.22.2", ["自然地形的群落颜色与山地明暗改为共享顶点过渡，减少地块碎片感；国界和地形高度不变。",
                    "自绘地图增加强度、柔和度、目标高度与海岸保护，实际参与气候、河流与州郡生成，支持原有撤销重做。",
                    "地形工具换用统一线条图标，主要操作按钮统一图标尺寸与触控高度。信息行在窄屏自动改为上下布局。",
                    "按钮按压改为轻微缩放与短反馈，响应系统减少动态效果。新增地形编辑与明暗连续性回归测试。真机视觉与帧率仍待验证。"]),
        ("0.22.1", ["外交总页增加互不侵犯、王室联姻、同盟与赠金入口，复用真实外交命令；等待期间禁用重复提交，显示执行结果。",
                    "国家页增加搜索与现存国家筛选，军事页增加交战／围城与玩家军令筛选。",
                    "折叠分节的箭头连续旋转，统一最小触控高度；卡片入场收敛到 0.2 秒，跟随系统减少动态效果设置。",
                    "限制地图装饰特效数量，视野外的交锋与围城动画暂停，重新进入视野接续播放；模拟规则不变。",
                    "全新海青、玉白与朱红城阙地图图标。真机帧率与触控视觉效果待验证。"]),
        ("0.22.0", ["新增八种文化（共二十六种）：越南、吐蕃、匈牙利、波兰、葡萄牙、尼德兰、阿兹特克、印加。每种都有八十座左右真实历史城市、五十个以上男名、四十五个以上女名、三十个家族，以及真实国号与历史人物；元首称号随文化（赞普、特拉托阿尼、萨帕·印卡等）。新建世界时可选。",
                    "新增两种宗教：阿兹特克信仰、印加太阳信仰。",
                    "连电脑计算更快：经中转时，手机在显示这一步的同时已经向电脑要下一步，电脑不再空等；电脑交回结果的同一次请求顺便取走下一个任务，每步少一次往返。经中转时自动存档改为每 120 天一次（存档要把整个世界传回手机）。需要同时更新电脑端程序。",
                    "界面统一：各面板的分节标题统一为朱红竖笔加标题的样式（设置、军团、宣战、国家页折叠栏、诏令），字号收拢到统一的几档。"]),
        ("0.21.0", ["打开菜单不再掉帧：打开国家、军事、外交、纪事、排行、菜单等大面板时世界自动暂停，关闭后自动继续（以前每推演一天整张面板都要重画，引擎也在抢算力）；面板打开时背后的地图降到每秒 30 帧。州郡、军团这类小面板照常推演。设置里可关闭。",
                    "修复打开「联盟」视图闪退：有的州郡控制者查不到国名时会崩溃，现已安全处理。",
                    "地形不再满屏是山：山峰只画在更高处并稀疏排列，森林、丘陵、沙丘、草甸、苔原等装饰大幅减少，山川看起来更像真实的山脉走向。",
                    "州郡属性：州郡页显示引擎实际计算的属性——核心（近国都，守军 +15%）或边地、山地（易守难攻）、要塞（城防等级）、富庶、粮仓、善治（地方官增收）。",
                    "政体扩充到三十二种：新增封建王国、选侯君主、苏丹国、公国、摄政、沙皇专制、幕府、专制帝国、城邦共和、商业共和、议会共和、总统共和、社会主义、独裁、革命委员会、邦联、联合王国、哈里发国、教宗国、政教合一、骑士团国、汗国、酋邦，各有国号与元首称号（苏丹、沙皇、征夷大将军、总督、总理、总书记、元首、委员长、大团长、可汗……）。",
                    "朝廷百官：在宰相、司农、大将军之外新增二十个职位（户部、兵部、礼部、刑部、工部、吏部、御史、太傅、水师提督、鸿胪、少府、禁军、皇城司、太史、太仆、盐铁、漕运、国子监、都护、内侍），官名随传统变化——东方为尚书，西方为大臣，共和国为部长，教会与草原各有称谓；任职者的能力每月实际影响国库、国运或各军士气；可逐一任命，候选人只在打开国家页时计算。",
                    "新增「经济」「政体」两种地图视图：经济按人口分五档着色，政体按各国政体着色并写出政体名。"]),
        ("0.20.0", ["政体扩充为十种：君主专制、君主立宪、帝制、军政府、民主共和、人民共和（共产主义）、寡头共和、联邦共和、神权、部落联盟。国号与元首称号随政体变化（如「某某人民共和国」主席、共和国总统、军政府最高统帅、寡头共和执政官）；改政体的页面重做为带说明的列表。",
                    "党派与议会：君主立宪、各类共和与联邦国家有自己的党派和议席（共产主义国家一党执政），国家页显示议席色带与执政党；每四年大选，议席重新分配，最大党上台执政并记入纪事。",
                    "外交新增：互不侵犯条约（五／十／二十年，期内 AI 不会对缔约国宣战）、王室联姻（十年互不兴兵）、赠送金帛、割让州郡；国家页显示现有条约与剩余年限。",
                    "军队编制：按兵力定为集团军、军、师、旅、团、营，并按国家编番号（如「第二师」）；叫法随文化变化——罗马为军团、大队、百人队，蒙古与突厥为万户、千户、百户，日本为师团、旅团、联队。军团页显示番号与编制，军事列表按兵力排序并显示每国军队总数与总兵力。",
                    "修复切到后台后报错：切后台会暂停并存档；与电脑的连接被系统切断后，回来时自动重新接上电脑（世界一直在电脑上，不会丢进度），多次连不上才改用手机继续。",
                    "远程计算更快：经中转时每步推演两倍天数，中转返回的数据压缩后传输；手机等太久而放弃的请求会被撤回，电脑不再执行过期请求；远程时每 30 天自动存档一次。"]),
        ("0.19.1", ["远程计算改为傻瓜式：设置里只显示「已连接你的电脑／正在等你的电脑上线」、一个「立即查找」按钮和自动开关，不再出现输入框；手动输入地址收进「高级」。手机进入世界即自动接入，不用填写任何东西。"]),
        ("0.19.0", ["自动接入电脑，零操作：手机版和电脑端「列国纪远程计算」内置同一个专属房间，电脑端第一次运行后设为开机自动运行；以后只要电脑开着，手机一进入世界就自动接入电脑计算（之后每 90 秒重试一次，电脑晚开机也会接上）。同一 Wi-Fi 下自动走局域网直连（快），在外面走中转；「设置 › 远程计算」可关闭。",
                    "修复城市名在新世界里不显示：以前开局时地图沿用了生成预览，预览里城市还没有名字，之后不再重建；现在进入正式世界时城市名会重新生成。",
                    "修复大批军队一起行军时乱跳：以前的错开算法会让一起行军的军队每一步互换位置；现在每支军队固定一个微小偏移，行军队列保持原样，叠在一起时也能分清。",
                    "自由任命官员：朝堂里点宰相、司农、大将军，列出本国可任人选（按引擎的才能匹配排序，附属性与天赋），点谁任谁；新增「亲自任免」开关，打开后朝廷不再自行换人。人物属性与天赋仍可在「人物」里修改。",
                    "国家自定义新增文化与宗教：可随时改变一国的文化和宗教。",
                    "文化库扩充：新增朝鲜、蒙古、突厥、埃及、西班牙、意大利六种文化，各配真实国名、八十余座历史城市、五十余个男名、四十余个女名、三十余个家族与历史人物，以及大汗、可汗、苏丹、法老等称号；新增腾格里信仰、古埃及信仰两种宗教。新世界里可勾选使用。",
                    "修复新世界「国家」数量按钮不灵：整个按钮都能点，长按可连续加减，下方加滑杆可直接拖动。"]),
        ("0.18.0", ["新增「自绘地图」（同原作地图编辑器）：新世界面板里点「自己绘制地图」，以所选地形为底图（或换成随机大陆、群岛、空白海洋），用笔刷亲手画山川海陆：海洋、平原、丘陵、山地、雪峰、抬高、压低、平滑八种笔刷，笔刷大小可调，单指绘制、双指移动缩放，随时撤销与重做。",
                    "每画完一笔都按原作的气候算法重算：高度与纬度、降水决定哪里长成森林、草原、热带雨林，哪里变成沙漠、苔原和冰川，海水按深浅着色；画笔经过时先用临时颜色即时显示。",
                    "画好后「下一步：分州郡」：调节州郡数（10–480）与国家数（2–24），即时预览按原作定居分区算法划出的州郡边界和列国起家疆域。",
                    "「开辟天下」：引擎在你画的地形上原样生成正式世界——江河、城市、地名、人物、军队、外交全部照常；新世界面板里选的文化、开局和平或混战、命名方式同样生效。"]),
        ("0.17.0", ["修复城市名不见了：上一版把城市名的显示门槛提得太高，要放得很大才出现；现已改回（比原先稍早出现）。",
                    "军队真正丝滑移动：所有军队都画在引擎里的真实位置，不再有「驻扎点」——以前休整的军队画在州郡里的另一个点，一出发或一交战就跳到真实位置、打完再跳回去，这就是交战前后的瞬移；挤在一起的军团由错开排列分开。图标逼近目标不再限速（高倍速下限速会越落越远，最后直接跳过去）。",
                    "列国大事有动画：五谷丰登时都城金粒升腾，商路大开金币四溅，名臣辈出光芒绽开，天灾乌云压城、骤雨倾泻，瘟疫青雾弥漫；革命、复辟在都城盖下朱红「革」字大印，篡位盖下「篡」字印并划过一道血痕。",
                    "纳贡：附庸每月把岁入的一成上缴宗主国，每年正月记入纪事。",
                    "纪事页新增「天下大势」：列强疆域占比色带、前四强排名与占比、存续国家与战争数。",
                    "顶部栏在电脑计算时显示电脑图标。",
                    "远程计算的 Windows 服务器改用 Swift 6.1 构建（5.10 与新版 Visual Studio 不兼容）。"]),
        ("0.16.0", ["远程计算不再需要局域网：电脑上的「列国纪远程计算」启动后自动连上列国纪中转服务器，窗口显示一个配对码（如 ABCD-2345，保存在程序旁的 pairing.txt，以后不变）。手机在「远程计算」里填一次配对码即可连接，用流量在外面也行；以后每次进入世界都会自动接入电脑。同一 Wi-Fi 下也可以填局域网地址直连，速度更快。",
                    "中转走游戏自己的站点（pages.dev），国内不用翻墙；电脑不在线时会提示先运行电脑端程序。"]),
        ("0.15.0", ["新增「远程计算」：电脑负责推演，手机只负责画面。在 Windows 电脑上运行「列国纪远程计算」LieguojiServer.exe（随本版一起构建，下载包里附使用说明），窗口会显示电脑地址；手机与电脑连同一个 Wi-Fi，在「菜单 › 远程计算」或主页「设置」里填入地址点连接，当前世界会搬到电脑上继续推演。断开时世界搬回手机；连接意外中断会自动切回本机，用电脑最后一次返回的世界接着玩。",
                    "军队不再重叠、不再闪烁：挤在一起的军团会自动错开排列；以前每帧兵种图层的绘制顺序随机，重叠的图标会来回闪，现已固定。",
                    "军队页重做：国色兵种军牌、状态一行看完（交战／行军、所在地 → 目的地、指挥），新增「定位」；新增「整编」可直接修改兵力（±1k、±5k 或输入）、兵种和士气。",
                    "从军事列表、州郡页点军团或舰队，镜头直接飞到那支部队并放大，面板自动降低让出地图。",
                    "修复点保存没有反应：菜单「保存」会提示已保存或保存失败；国家自定义、人物修改、征兵成功后都有明确提示和震动。"]),
        ("0.14.0", ["修复闪退：切换文化、家族、宗教等地图视图后放大地图，巨大的群体名称会被渲染成几千像素的图片导致内存耗尽闪退；现在文字图片最大只渲染 96 点、超出部分缩放，超过屏幕的名称直接隐藏。",
                    "倍速真正生效：倍速改为每步推演的天数（1×、2×、4×、8×），引擎一次推进多天、地图与面板只刷新一次，高倍速明显更快。",
                    "生成世界重做：地形升起延长到九秒并按阶段逐层出现——海洋、大陆、山脉、江河、森林草原、州郡界线、列国国色、国界、城市与地名，进度文字与地图同步；之后的世家、军队、邦交各停留片刻再进入世界，不再一闪而过。生成动画不再每帧重算全图配色，更流畅。",
                    "军队不再瞬移：只有跨越大半张地图的整编回城才直接出现，其余一律走过去，并限制最高行进速度，远距离也是走过去而不是一闪而过。",
                    "阵亡动画改为水墨：兵种图标以国色描出、倾斜下沉褪去，地上晕开一团墨迹再慢慢干去。",
                    "攻占州郡时，新主人插下一面飘扬的国旗。",
                    "图标统一：底栏与顶栏换成一套同笔触的手绘线条图标——城楼（国家）、交戟（军事）、卷轴（外交）、书册（纪事）、阶台（排行）、山水（视图）、令旗（即时战略）；当前标签线条加粗。",
                    "文字减负：城市名要放大更多才显示，兵力数字也要放大到一定程度才出现；攻城横幅只在攻下都城时弹出。",
                    "性能：休整军队的显示位置缓存（以前每步为每支军队重算多边形落点）；文字图片缓存上限降低，内存更省。"]),
        ("0.13.0", ["军队 AI 有了性格：温和、持重的国家先肃清本国被入侵的州郡再出击；好战之国的军队优先深入敌境攻城略地，而不是先去援助盟友。",
                    "权臣篡位：朝政废弛（施政低于 40）时，势力超过宗室 1.2 倍、与宗室关系 ≤ −50 的谋逆世家可能不经内战直接政变，族中最有才干的成年人登位，改朝换代写入国史，旧宗室势力大衰、国运 −8。",
                    "革命、复辟、篡位会像宣战一样弹出诏告横幅。"]),
        ("0.12.0", ["家族派系：朝堂里每个世家标出对宗室的立场——拥戴、中立、离心、谋逆（谋逆即达到原作家族叛乱门槛：与宗室关系 ≤ −50、势力 200 以上且有封地，随时可能举兵）。家族叛乱与内战沿用原作规则照常发生。",
                    "AI 有了性格：每国按君主天赋（鹰派、雄心勃勃、易怒、统一者……更好战；鸽派、仁慈、耐心、厌战……更温和）与政体（帝国、部族更进取，共和、联邦更持重）决定宣战门槛，好战之君更常开战、温和之君更少用兵；国家页「国策」显示好战／进取／持重／温和／求和。",
                    "列国大事：各国每月有小概率遇到五谷丰登、天灾、名臣辈出、瘟疫、商路大开，实际增减国库与国运，并记入纪事。"]),
        ("0.11.0", ["大版本合集：军队、地形、政体、自定义、音乐与界面。",
                    "军队不再瞬移：每支军队的图标每帧向引擎位置平滑逼近，长距离、进出交战、战后归位都走过去；交战双方相距较近时走到一起碰头开打，相隔一整个州郡时各向对方推进一段，不会再出现在别的州郡。",
                    "军队覆灭动画：军旗摇晃、倒下、淡出，同时冒起黑烟（所有离场的军团都有）。",
                    "地形更真实、更丰富：整张地图按坡度做明暗（西北光照），山地立体；高山加雪顶，针叶林画成松树，新增丘陵、沙丘、草甸、稀树草原的金合欢、苔原与冰原纹理。",
                    "政体更迭（同原作国家兴衰）：国家在施政低下、失地、君主年迈时可能爆发革命——王国、帝国变为共和国或联邦，共和国可能复辟帝制，再次称帝时国号为「某某第二帝国」「第三帝国」；神权、部族革命后成为王国。每种政体有实际加成（帝国国运、共和国国库等）每月生效，革命会损国库与国运。国家页显示政体沿革。",
                    "自定义：点国家页人物可修改魅力、军事、外交、行政四项属性和最多四项天赋（天赋会改变实际能力）；国家页新增「自定义」——修改国库、国运，改易政体（国名随之变化），在本国州郡征募新军。",
                    "音乐与触感：加入原作五首背景音乐（随机播放，可调音量、切歌）；宣战、媾和、攻城、交战、建国都有震动反馈；设置里可开关音乐、震动和粒子特效。",
                    "生成世界的实时进度：注水成海、抬升大陆、隆起山脉、冲刷江河、播撒森林草原荒漠、划分州郡、分封列国……文字与地图上正在出现的地形一一对应，之后是营建城邦、诞生世家人物、编练军队、缔结邦交，带进度条与已完成清单；地形升起放慢到五秒。",
                    "开场动画重做：毛笔圆相一笔画成、远山水墨晕开、「列國紀」逐字写出、朱印落下。主页改为竖排题签（每次随机一句古语）并加入「设置」「更新」。",
                    "底部菜单打开不再卡顿：纸面纹理改为预先合成的一张图（以前每帧实时正片叠底），折页一次绘制；军事列表按需加载。国家改名后地图上的国名也会更新。"]),
        ("0.10.0", ["大版本：政治、绘制疆域、奏折界面。",
                    "新增「朝堂」（国家页默认展开）：施政水平（由君主才干与国运决定，带进度条）、中枢增收；宰相、司农、大将军三大要职的任职者、年龄与是否称职（按才能匹配，称职／平庸／失职）；地方官覆盖州郡数；各场战争的征讨主将；占领他国与失地州数；本国贵族世家按势力排列，标出宗室、人丁与封地。全部取自引擎里原作的官职与贵族系统。",
                    "新增「绘制疆域」（同原作画地图改国界）：在国家页「国家行为」里点「绘制疆域」，回到地图后点选或用一指拖过州郡，即划入该国（法理与实控同时转移），两指照常移动缩放，顶部横幅点「完成」结束。",
                    "奏折界面：纸面加入折页——每一折明暗交替、折痕淡影，顶端是深红锦缎包边与金线，像展开的奏折；底栏「国家」「军事」换成原作的旗帜骑士、十字盾线条图标，其余图标统一线宽。"]),
        ("0.9.34", ["交战不再隔着老远：按原作规则同一州郡内的敌军即进入交战，以前两军各画在自己的位置上看起来隔很远；现在交战双方会走到一起，图标相互贴近，双剑在两军之间交击（只改显示，不改推演）。去掉了上一版的交锋虚线。",
                    "修复瞬移：一步内移动较远（高倍速、进出交战）时以前会直接跳过去，现在都平滑滑行，只有跨越大半张地图的整编回城才直接出现。",
                    "修复周期性卡顿：自动存档会序列化整个世界并在主线程写文件，每 30 天卡一下；现在改为每 90 天自动存一次、文件在后台写入，暂停和切出应用时也会存档。",
                    "兵力数字改版：去掉方框，改为毛笔字配纸色描边（和地图地名同一风格），更小更清爽。"]),
        ("0.9.33", ["性能：军团路线记录解析一次后缓存（只在军团真的移动或改令时重新解析），交战判定每帧不再重复解析全部军团；行军规则里的宣战表改为字典查找。"]),
        ("0.9.32", ["交战看得清谁打谁：两支接触的军团之间画出一条交锋线，各半段是双方国色，虚线向交战点流动，双剑在中间交击；不用文字也一眼分清交战双方。"]),
        ("0.9.31", ["性能：围城与占领结算改为按州郡索引查找围城、宣战关系每次只查一遍，不再「每个州郡 × 每处围城」反复扫描；战争越多、地图越大，提速越明显。"]),
        ("0.9.30", ["放大地图显示更多细节：放大到一定程度后，每支军团图标下方出现兵力（如 1.2万），舰队显示船数；标签跟随图标一起滑行，缩小后自动隐藏。",
                    "修复：点军团改为按图标当前画出的位置判定（行军滑行途中也能点中），点击范围稍放大。",
                    "性能：行军写回只做浅拷贝；每帧交战判定把围城与宣战关系一次读好，不再逐军团扫描；外交关系查询去掉临时数组分配。"]),
        ("0.9.29", ["新世界可选更多开局设定（同原作文化世界）：开局「列国和平／群雄混战」、命名「历史真名／按文化生成」，以及勾选出现哪些文化（中华、日本、英格兰、阿拉伯、罗马等 12 种，至少留一种）。",
                    "生成地图更连贯：地形升起后直接进入世界，不再重建整张地图而突然停顿一下。",
                    "舰队图标换成原作的运输船图标。",
                    "战场烟雾大幅减淡缩小，火星减少，只有前 4 处战场冒烟，不再遮挡地图；围城火焰、军团覆灭黑烟也更小。",
                    "国家页重排：顶部一排疆域、人口、兵力、国库；有战争时「战争」自动展开并标出场数；「人物」默认收起并显示人数，不再一打开满屏人物。"]),
        ("0.9.28", ["舰队面板重做：船只、船员、舰体（带耐久条）、口粮一排数字；「停留港口」改为本国港口列表，按离舰队远近排序并标出距离和现泊港，点选后「起航」；也可点「地图选港」直接在地图上点港口州郡。",
                    "地图上的港口锚标不再铺满全图：只在选中舰队时显示本国可停港口，以及被他国占领的港口。",
                    "军团面板整理：兵力、士气（带士气条，低落时朱红警示）、粮草一排；交战中「调兵」置灰并提示只能撤退；所在州郡越界不再闪退。",
                    "性能：引擎行军结算只写回实际移动了的军队，配合上版州郡索引缓存，推演每日耗时再降约两成。"]),
        ("0.9.27", ["性能：军团行军改为连续滑行——图标移动时长自动匹配每一步推演的耗时，匀速前进，不再走一下停一下。",
                    "修复：交战军团不再瞬移到交战点（去掉了显示上的靠拢偏移），按引擎真实位置走到一起。",
                    "去掉交战双方的文字标签，地图更清爽；粒子烟火只在前几处战场显示，降低耗电和掉帧。",
                    "性能：地图每次刷新不再逐个比对全部州郡；国家页改为每十天刷新一次，不再和推演抢算力；引擎行军计算缓存州郡索引。"]),
        ("0.9.26", ["修复：在国家页之间滑动切换时，地图上的外交关系着色会被上一页清掉；迟到的刷新也不再覆盖当前国家的着色。",
                    "修复：州郡页里点军团改为滑入军团页并可「返回州郡」，不再丢失来路。",
                    "修复：新建国家尚未进入图例时打开「国家」列表可能闪退；州郡法理归属、都城索引越界的潜在闪退。"]),
        ("0.9.25", ["面板交互重做：所有面板共用一张奏折，切换时整页左右滑动，不再先收起再弹出；从列国、排行、州郡点进国家，或从军事点进军团，顶部出现「返回列国／返回军事」，逐页退回。",
                    "底部标签栏：当前打开的面板对应标签变为朱红，并有一道朱红短线在标签之间滑动。",
                    "提示改为奏折纸条：带「令」字印，从底栏上方升起，点按即收；连续提示不再互相吞掉。",
                    "地图视图：选好视图后切换器自动卷起；点地图时切换器也会收起；图例位置随底栏对齐。",
                    "日期数字滚动变化，事件栏新事件自下而上推入；选择州郡、切换视图、翻页时有轻触反馈。"]),
        ("0.9.24", ["家族、文化、宗教视图按原作改为按群体命名：地图上画出群体的轮廓并写群体名（如某某氏、某某文化、某某教），不再显示国名；联盟视图仍显示国名。",
                    "交战改为接触才开打：两军在地图上走到一起，图标相向靠拢后才出现交战动画，不再隔很远就开战。",
                    "交战标签：双剑下方显示双方国色与国名（甲 ⚔ 乙），一眼看清谁在打谁。",
                    "新增粒子动效：交战处硝烟升腾、火星四溅；围城处火焰与余烬；军团覆灭时冒出黑烟；新国建立时国色烟花和升起的旗帜；宣战时被宣战国都城出现红色冲击波。",
                    "纸面重做：奏折纸底不再撑大界面，修复视图切换背后的大片空白和统计面板左侧被裁；视图切换改为竖向卷展。"]),
        ("0.9.23", ["新增即时战略模式（原作 RTSController）：点右上角虚线框按钮，在地图上拖出方框选中一国的多支军团，再点目的地一起出发；可选进攻模式（行军、途中接战）或防御模式（撤退式行军）。选中的军团高亮显示。",
                   "国家详情新增「国史」：列出与该国有关的历史纪事，新近在前。"]),
        ("0.9.22", ["军队新增「撤退」令（原作防御模式）：点选目的地后以撤退方式行军，途中不主动接战，抵达安全地区后恢复待命。",
                   "省份页新增「划入他国」（原作地图编辑·绘制国家）：把该省划给所选国家，法理与实控同时转移，经济、核心区、港口、围城、首都与亡国一并结算。",
                   "修复进攻箭头不显示：引擎一直在生成箭头（测试中战争期间每天 4–6 支），是画面用的遮罩在手机上不显示；改为直接绘制，由浅到深、首粗尾细，轮廓 1 秒内画出。"]),
        ("0.9.21", ["新增「天下诏令」（原作全局设置，菜单进入）：世界自动外交、最长战争期限、各国自主结盟、行省叛乱开关与间隔、家族叛乱与内战开关和间隔、附庸叛变；以诏书样式呈现，每次更改都记入纪事。",
                   "国家行为新增「触发内战」：规则同原作（两个家族时须对方有领地、关系低于 −30、影响力高于 100；三个以上家族时与统治家族关系最差的两个起兵），不满足时说明原因。",
                   "纪事改为卷轴：上下木轴、展开动画，战事朱点、外交玉点，最新一条盖「新」字小印。"]),
        ("0.9.20", ["新增原作省份进攻箭头：被敌军进攻的省份上，从进攻方相邻省份指来弯曲粗箭头（进攻方国色由浅到深、首粗尾细、1 秒长出），规则同原作：按进攻军队数画 1 到 3 支，进攻方失去出发省份时箭头消失。原作默认只显示所选国家的战争，这里默认全部显示。",
                   "海战也显示原作双剑交锋动画，出现在两支舰队相接处。",
                   "地图视图（原作 1–6 视图）：国家、联盟、文化、家族、宗教、地形，右上角按钮展开纸质切换条，选中项以朱印标出；非国家视图左下角显示图例。",
                   "新增「排行」（原作统计面板）：国力排行、人口排名、经济排行、战争统计、宗教信息，以奏折样式呈现，名次用汉字数字，墨条依次刷出；点国家可进入国家详情。",
                   "所有面板改为古纸奏折样式：古纸底纹与朱色竖格，毛笔标题配墨线与朱印，信息卡片外墨内朱双边框并像纸张展开，条目以点线连接标签与数值。"]),
        ("0.9.19", ["战斗动画改用原作双剑交锋（40 帧、每秒 12 帧），出现在两军实际相接处；交战中的军队站在真实位置，不再隔着半个省开打。",
                   "宣战时一道红色流动箭头从进攻国首都指向防守国首都（2 秒）；战争目标省份依次落下宣称标记（宣称国颜色），停留后淡出。",
                   "战争结束时，每个参战国首都上方升起和平鸽。",
                   "军队与舰队行军动画改为每帧只更新插值，推进与缩放时更省电（来自 0.9.18 未发布版）。",
                   "手动舰队军令接通（来自 0.9.18 未发布版）。"]),
        ("0.9.17", ["【手机上能点到】新建的世界启用开阔海规则：与地图外缘相连的海面算作外海，首府临外海的省份获得港湾，各国开局各有一支舰队（老存档保持原样，不出现舰队）。",
                    "【手机上能点到】地图上显示舰队（帆船图标）和港口（锚图标，按控制国着色）；点舰队打开舰队面板（船只、船员、舰体、口粮、状态、AI 部署与理由）；「军事」面板列出全部舰队；省份面板显示海港控制者与控制度。",
                    "【手机上能点到】舰队由 AI 自主部署：按原作港口拥挤权重驻防、余粮不足回港补给、战时按原作比例选出进攻舰队争夺敌港；停在本国安全港口锚点按日补粮，断粮减员。",
                    "【手机上能点到】海战伤害计入舰体、船员和船只损失；统帅的海战特质（如「海战精通」+30%）计入舰队战力，与网页一致。",
                    "【仍在核心代码】海路图与首府港湾生成移植到 Swift，在 4 种地形样本上与网页逐位一致；开阔海世界和平 120 天、开战 120 天整日推进与网页逐位一致（含舰队、港口账本）。",
                    "【简化】「造船大师」（造舰时间 ×0.5）当前规则没有造舰系统，暂无效果；「改革者」没有可用的原作公式，只显示说明。手动舰令尚未开放。",
                    "【未在真机验证】以上只在 CI 通过，未在真机上验证。"]),
        ("0.9.16", ["【仍在核心代码】新世界政府段第二部分移植到 Swift：每省初始人口与人口上限、省份资源抽取、各国经济方式、首批常备军征募、首月国库结算、开局国运，在 4 种地形样本上与网页逐位一致（含键序）。手机上暂无变化。",
                    "【未在真机验证】以上只在 CI 通过。"]),
        ("0.9.15", ["【手机上能点到】国家详情「人物」分节里，每条特质后面显示原作的效果说明（取自原作特质描述的中文文本，共 27 条）。",
                    "【更正】核对原作反汇编记录后确认：特质正／中／负分档（四维修正之和 >5 / <−5）、抽取比例 40/30/30、每人 1–3 条、精锐 ×10 都与原作一致；删去 0.9.7 里“特质分档与原作有差异”的说法。",
                    "【未在真机验证】以上只在 CI 构建通过，未在真机上验证。"]),
        ("0.9.14", ["【仍在核心代码】新世界创建的政府段第一部分移植到 Swift：每省地貌比例、高程分析、财政格子与临海、省防御地貌，在 4 种地形样本上与网页逐位一致。手机上暂无变化。",
                    "【未在真机验证】以上只在 CI 通过。"]),
        ("0.9.13", ["【手机上能点到】新世界页新增「省份」数字框：自由输入省份数（不少于国家数，最多 480，与网页引擎同一上下限），每省一城，省份按地形均分大小（与网页同一分区算法）；预览地图与正式世界用同一省份数。",
                    "【仍在核心代码】正式世界目前仍由内置网页引擎建立后交给 Swift；Swift 端的国家财政与首批征兵（政府段）、海陆军初始化（军事段）尚在移植，移植完才能完全脱离网页引擎建世界。",
                    "【未在真机验证】以上只在 CI 构建通过，未在真机上验证；省份很多（数百）时的生成耗时未测。"]),
        ("0.9.12", ["【手机上能点到】字体统一：内置楷体（全字库正楷体 TW-Kai，政府资料开放授权）由 2617 字扩到 7799 字（含 GB2312 全部汉字与全部名称目录用字），人名、地名不再混入系统字体。",
                    "【手机上能点到】地图国名去掉国家色描边，改为与城市名相同的浅纸色细描边。",
                    "【手机上能点到】人物特质补齐中文（统一者、越战越勇、厌战、海军精通、船舶大师、改革家、天生领袖、难以服众），不再显示英文。宣战／议和横幅的图标改为文字「对」「与」。",
                    "【简化】国名描边样式按 Bob 的反馈改动，网页为国家色描边，此处与网页不同。",
                    "【未在真机验证】以上只在 CI 构建通过，未在真机上验证。"]),
        ("0.9.11", ["【手机上能点到】军队详情新增「目的地」（行军中显示终点省份）与「指挥」：玩家军令、AI 远征（集结／出航／返航）或 AI 自主调度。",
                    "【手机上能点到】军事列表每支军队显示「→ 目的地」。调兵（点地图选目的地）、停止、行军路线照旧。",
                    "【仍在核心代码】军队 AI 的进攻目标选择与轮转军令已在 Swift 中逐帧运行（与网页一致），界面只显示结果，不显示 AI 的内部评分。",
                    "【未在真机验证】以上只在 CI 构建通过，未在真机上验证。"]),
        ("0.9.10", ["【手机上能点到】国家详情「战争」卡片新增战争分数条（-100 至 +100，按本国立场显示，绿为占优、红为劣势）；原有战争目标、双方阵亡、持续时间与「停战」按钮保留。",
                    "【手机上能点到】「外交」分节新增停战期列表：与哪国停战、还需几年、几年规则；敌对、同盟、宗主、附庸照旧。宣战按钮在「国家行为」分节。",
                    "【简化】战争分数用网页和平 AI 的同一算式（战斗 20%、占领 50%、目标 30%），原作公式未核实。",
                    "【未在真机验证】以上只在 CI 构建通过，未在真机上验证。"]),
        ("0.9.9", ["【手机上能点到】菜单新增「导出存档（备份）」：先保存，再用系统分享面板存到“文件”或隔空投送；文件名带日期。",
                   "【手机上能点到】标题页和菜单新增「导入存档」：选一个 .lgj 文件读入；原存档先备份为「导入前备份.lgj」。",
                   "【手机上能点到】存档文件夹在“文件”App 的「我的 iPhone › 列国纪」里可见，重签前可自行拷出。",
                   "【未在真机验证】以上只在 CI 构建通过，未在真机上验证；跨设备导入未测试。"]),
        ("0.9.8", ["【手机上能点到】菜单新增「显示设置」：国界、省界、城市名、城市图标、地形与植被可分别开关；国家颜色浓度滑杆 0.2–1。设置会记住。",
                   "【简化】颜色浓度是把国家色向地形底色混合，原作的具体浓度算法未核实；默认 1.0 与网页一致。",
                   "【未在真机验证】以上只在 CI 构建通过，未在真机上验证。"]),
        ("0.9.7", ["【手机上能点到】国家详情改为原作的折叠分节：基本信息（默认展开）、国家行为、战争、人物、外交；点标题折叠或展开，动画 0.25 秒。",
                   "【手机上能点到】新增「人物」分节（默认展开）：君主、统治家族继承人、在任官员（行政首脑、财政主管、常备军统帅、总督、战时统帅），显示姓名、性别、年龄、四项能力与特质。",
                   "【手机上能点到】菜单顶部显示版本与构建号；本页即「本版新增」。",
                   "【仍在核心代码】新世界创建的文化世界段（省份、人口粮食、君主、家族、贵族领地）已在本机算出并与网页逐位一致，但新世界仍由网页引擎创建，玩法无变化。",
                   "【简化】原作国家面板共 10 节；领袖记录、国家特性、历史记录、资源四节原作运行时生成的内容待核，本版不显示，不补造。",
                   "【简化】家族人数年龄、女性继承 30% 等沿用网页版数值（见文档）。",
                   "【未在真机验证】本版只经 GitHub 编译与核心测试，未在真机上试过分节动画、人物分节与帧率。"]),
        ("0.9.6", ["新增国家详情（还原原作国家信息面板）：君主、政体、文化、宗教、国库与月入、国运、人口兵力；外交关系列出敌对国家、同盟、宗主国与附庸。",
                   "国家的战争卡片：宣战理由、战争目标、进攻方与防守方各国、双方阵亡、持续时间，可直接停战。",
                   "国家行为：宣战、缔结盟约（两国已在交战则先停战，规则同原作强制结盟）、退出同盟、收为附庸、解除附庸、吞并、自主外交开关。",
                   "打开国家详情时地图标出关系：敌国红、盟国蓝、附庸绿、宗主紫。",
                   "从「国家」列表或省份页的「国家详情」进入。",
                   "修复：叛乱、内战新建的国家现在有名字、颜色和国界线。"]),
        ("0.9.5", ["游戏改由本机 Swift 引擎运行：世界建好后，推进、交战、外交、家族、叛乱、玩家军令与宣战议和全部在本机计算，与网页引擎逐位一致（对照测试覆盖整天循环与 20 天连续推进）。",
                   "推进更快：测试中本机引擎每天耗时低于网页引擎，长时间游玩不随存档变大而变慢。",
                   "存档直接保存完整世界，读档不再从头重放，大世界读档更快。",
                   "网页引擎只用于生成新世界；0.9.4 的存档仍可读取，读入后自动转为新存档。"]),
        ("0.9.4", ["人名、地名改用各文化真实名字：12 种文化全部启用，城市与国家取自真实历史地名（长安、京都、伦敦、巴格达、科尔多瓦、基辅……），同一世界不重名。",
                   "名库大幅扩充：每种文化男名、女名、姓氏增至原来的两到五倍，人物重名明显减少。",
                   "修复双指缩放时地图跳动：抬起或放下一根手指不再突然位移，缩放时不再被拖动重复带走。",
                   "修复越玩越卡：省份易主时只更新国名，城市名不再整批重绘；国界线改在后台计算；文字图片按字号缓存，缩放更顺。",
                   "名库变化后旧存档无法继续，请新建世界。"]),
        ("0.9.3", ["点「新世界」后，地形、河流、省份和首都由本机立即算出，生成动画马上开始；完整世界（人物、军队）在后台建好后无缝接上。",
                   "标题画面的背景地图每次启动随机生成一张新的。",
                   "本机生成与网页引擎对同一种子逐格一致（高度、气候、河流、省份、首都均经对照测试）。",
                   "新增「更新内容」页。"]),
        ("0.9.2", ["军队平滑行军；交战火焰脉冲；围城进度环；攻城国色闪光；宣战、议和、攻克印章横幅。"]),
        ("0.9.1", ["固定浅色纸面，不随深色模式变灰；自绘控件；国名描边改为字下圆角描边；启动与界面动画；新地图图标。"]),
        ("0.9.0", ["原生界面 + 网页原引擎：交战、占领、议和、家族等规则与网页完全一致；启动动画、标题生成动画、统一原作字体。"]),
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "本版新增与更新内容", subtitle: AppVersion.text)
                ForEach(Self.notes, id: \.version) { note in
                    Group2 {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(note.version).font(Theme.kai(20)).foregroundStyle(Theme.seal)
                            ForEach(note.lines, id: \.self) { line in
                                HStack(alignment: .top, spacing: 8) { Text("·").foregroundStyle(Theme.ink2); Text(line).font(Theme.body).foregroundStyle(Theme.ink) }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 24)
        }
    }
}
