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
    var body: some Scene { WindowGroup { RootView().font(Theme.kai(17)).preferredColorScheme(.light).environment(\.colorScheme, .light) } }
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
    static let sea = Color(red: 0x52 / 255, green: 0x7C / 255, blue: 0x86 / 255)
    static func kai(_ size: CGFloat) -> Font { .custom(fontName, size: size) }
}

enum Names {
    static let polity = ["Kingdom": "王国", "Empire": "帝国", "Federation": "联邦", "Republic": "共和国", "Tribal": "部落", "Theocracy": "神权"]
    /// The 12 cultures of the catalog in its order (CULTURE_IDS47).
    static let cultureIds = ["chinese", "japanese", "english", "arab", "roman", "french", "german", "greek", "persian", "slavic", "norse", "indian"]
    static let culture = ["chinese": "中华", "japanese": "日本", "english": "英格兰", "arab": "阿拉伯", "roman": "罗马", "french": "法兰西",
                          "german": "日耳曼", "greek": "希腊", "persian": "波斯", "slavic": "斯拉夫", "norse": "北欧", "indian": "印度"]
    static let religion = ["none": "无指定宗教", "chineseFolk": "中国民间信仰", "daoism": "道教", "buddhism": "佛教", "shinto": "神道",
                           "islam": "伊斯兰教", "catholic": "天主教", "orthodox": "东正教", "protestant": "新教", "judaism": "犹太教",
                           "hinduism": "印度教", "zoroastrian": "祆教", "grecoRoman": "希腊罗马多神信仰", "norse": "北欧传统信仰"]
    static let terrain = ["plain": "平原", "forest": "森林", "mountain": "山地"]
    static let unit = ["Infantry": "步兵", "Archer": "弓兵", "Shield": "盾兵", "Cavalry": "骑兵", "Elite": "精锐"]
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
            Theme.sea.ignoresSafeArea()
            EngineView(host: model.engine).frame(width: 1, height: 1).opacity(0.01).allowsHitTesting(false)
            if let map = model.map {
                MapView(map: map, controller: model.controller).id(model.worldID).ignoresSafeArea()
            }
            switch model.phase {
            case .splash: EmptyView()
            case .title: TitleView(model: model).transition(.opacity)
            case .generating: GeneratingView(note: model.generationNote).transition(.opacity)
            case .founding: FoundingView(reveal: model.controller.reveal).transition(.opacity)
            case .playing: GameView(model: model).transition(.opacity)
            }
            if model.phase == .splash { SplashView { finishSplash() }.transition(.opacity).zIndex(10) }
        }
        .animation(.easeInOut(duration: 0.45), value: model.phase)
        // Leaving the app saves (autosave runs only every 90 days).
        .onChange(of: scenePhase) { _, phase in if phase == .background, model.phase == .playing { model.save() } }
        .task { GameFeel.shared.start() }
        .task { await model.loadBackdrop(); try? await model.engine.start() }
        .alert("出了点问题", isPresented: Binding(get: { model.failure != nil }, set: { if !$0 { model.failure = nil } })) {
            Button("好") { model.failure = nil }
        } message: { Text(model.failure ?? "") }
        .tint(Theme.seal)
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
        // The title backdrop generates itself: sea, then land from the coast up, then the states.
        Task { @MainActor in
            let start = Date()
            while model.phase == .title {
                let t = Float(Date().timeIntervalSince(start) / 3.2)
                model.controller.reveal = min(1, t)
                if t >= 1 { break }
                try? await Task.sleep(nanoseconds: 16_000_000)
            }
            model.controller.reveal = 1
        }
    }
}

// MARK: - launch

/// The launch animation: a vermilion seal is stamped on the paper, the name appears beneath it.
struct SplashView: View {
    let done: () -> Void
    /// Ink: a brush circle (圆相) draws itself, mountains wash in, the title is written stroke by
    /// stroke and the seal is pressed beside it.
    @State private var brush: CGFloat = 0
    @State private var hills = false
    @State private var written = 0
    @State private var stamped = false
    static let title = ["列", "國", "紀"]
    var body: some View {
        ZStack {
            MemorialPaper(rules: false)
            // Distant ink-wash mountains.
            VStack {
                Spacer()
                ZStack {
                    InkHills(seed: 1).fill(Theme.ink.opacity(0.07)).frame(height: 190).offset(y: hills ? 0 : 40)
                    InkHills(seed: 2).fill(Theme.ink.opacity(0.11)).frame(height: 140).offset(y: hills ? 10 : 60)
                }
                .opacity(hills ? 1 : 0)
            }
            .ignoresSafeArea()
            VStack(spacing: 22) {
                ZStack {
                    Circle().trim(from: 0, to: brush).stroke(Theme.ink.opacity(0.75), style: StrokeStyle(lineWidth: 9, lineCap: .round))
                        .rotationEffect(.degrees(-80)).frame(width: 170, height: 170).blur(radius: 0.6)
                    HStack(spacing: 4) {
                        ForEach(0..<3, id: \.self) { i in
                            Text(Self.title[i]).font(Theme.kai(46)).foregroundStyle(Theme.ink)
                                .opacity(written > i ? 1 : 0).blur(radius: written > i ? 0 : 8).scaleEffect(written > i ? 1 : 1.25)
                        }
                    }
                    SealMark(size: 40).rotationEffect(.degrees(-6)).offset(x: 78, y: 62)
                        .scaleEffect(stamped ? 1 : 1.8).opacity(stamped ? 1 : 0)
                }
                Text("架空世界 · 列国兴衰").font(Theme.kai(15)).tracking(5).foregroundStyle(Theme.ink2).opacity(stamped ? 1 : 0)
            }
        }
        .task {
            withAnimation(.easeInOut(duration: 0.9)) { brush = 0.93 }
            withAnimation(.easeOut(duration: 1.4)) { hills = true }
            try? await Task.sleep(nanoseconds: 450_000_000)
            for i in 1...3 {
                withAnimation(.easeOut(duration: 0.35)) { written = i }
                try? await Task.sleep(nanoseconds: 220_000_000)
            }
            withAnimation(.spring(response: 0.32, dampingFraction: 0.55)) { stamped = true }
            GameFeel.shared.thud()
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            done()
        }
    }
}

/// A ridge of ink-wash mountains across the bottom of a frame (seeded peaks).
struct InkHills: Shape {
    let seed: Int
    func path(in rect: CGRect) -> Path {
        var p = Path(), x: CGFloat = 0
        p.move(to: CGPoint(x: 0, y: rect.maxY))
        var s = UInt32(seed &* 2654435761 % 4294967291)
        func next() -> CGFloat { s = s &* 1664525 &+ 1013904223; return CGFloat(s >> 8) / CGFloat(1 << 24) }
        p.addLine(to: CGPoint(x: 0, y: rect.maxY - rect.height * 0.4))
        while x < rect.width {
            let w = rect.width * (0.12 + next() * 0.14), peak = rect.height * (0.45 + next() * 0.55)
            p.addQuadCurve(to: CGPoint(x: x + w, y: rect.maxY - rect.height * (0.25 + next() * 0.3)), control: CGPoint(x: x + w * 0.5, y: rect.maxY - peak * 1.3))
            x += w
        }
        p.addLine(to: CGPoint(x: rect.width, y: rect.maxY)); p.closeSubpath()
        return p
    }
}

/// The app's seal: a vermilion rounded square with 列国 in the original's Kai script.
struct SealMark: View {
    var size: CGFloat
    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.2, style: .continuous)
            .fill(Theme.seal)
            .overlay(RoundedRectangle(cornerRadius: size * 0.15, style: .continuous).stroke(Theme.paper.opacity(0.85), lineWidth: size * 0.028).padding(size * 0.07))
            .overlay(Text("列").font(Theme.kai(size * 0.62)).foregroundStyle(Theme.paper))
            .frame(width: size, height: size)
            .shadow(color: Theme.seal.opacity(0.25), radius: size * 0.08, y: size * 0.03)
    }
}

// MARK: - title

struct TitleView: View {
    @ObservedObject var model: GameModel
    @State private var importing = false
    @State private var creating = false
    @State private var shown = false
    @State private var settings = false
    @State private var notes = false
    /// A line of the classics under the title, changing each launch.
    private static let mottos = ["天下大势，分久必合，合久必分", "兴，百姓苦；亡，百姓苦", "江山如画，一时多少豪杰", "运筹帷幄之中，决胜千里之外", "苟利国家生死以"]
    @State private var motto = TitleView.mottos.randomElement()!
    var body: some View {
        VStack(spacing: 0) {
            // The vertical title and motto over the drifting world, like a scroll's inscription.
            HStack(alignment: .top) {
                Spacer()
                HStack(alignment: .top, spacing: 14) {
                    VerticalText(motto, size: 15).foregroundStyle(Theme.ink2)
                    VerticalText("列國紀", size: 46).foregroundStyle(Theme.ink)
                    SealMark(size: 34).rotationEffect(.degrees(-5)).padding(.top, 6)
                }
                .padding(.vertical, 18).padding(.horizontal, 16)
                .background(MemorialPaper(rules: false, fullBleed: false).opacity(0.9).clipShape(RoundedRectangle(cornerRadius: 12)))
                .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.18), radius: 10, y: 4)
                .padding(.trailing, 22).padding(.top, 20)
                .offset(y: shown ? 0 : -30).opacity(shown ? 1 : 0)
            }
            Spacer()
            VStack(spacing: 18) {
                Text("架空世界 · 列国兴衰").font(Theme.kai(16)).tracking(4).foregroundStyle(Theme.ink2)
                VStack(spacing: 12) {
                    Button { creating = true } label: { PrimaryLabel(title: "新世界", symbol: "globe.asia.australia") }
                    if model.hasSave {
                        Button { Task { await model.continueGame() } } label: { SecondaryLabel(title: "继续", symbol: "book.closed") }
                    }
                    Button { importing = true } label: { SecondaryLabel(title: "导入存档", symbol: "tray.and.arrow.down") }
                    HStack(spacing: 12) {
                        Button { settings = true } label: { SecondaryLabel(title: "设置", symbol: "slider.horizontal.3") }
                        Button { notes = true } label: { SecondaryLabel(title: "更新", symbol: "sparkles") }
                    }
                }
                .padding(.top, 4)
                .buttonStyle(PressStyle())
            }
            .padding(.horizontal, 28).padding(.vertical, 30)
            .frame(maxWidth: 420)
            .glass(RoundedRectangle(cornerRadius: 30, style: .continuous))
            .padding(.horizontal, 20).padding(.bottom, 34)
            .offset(y: shown ? 0 : 60).opacity(shown ? 1 : 0)
        }
        .onAppear { withAnimation(.spring(response: 0.7, dampingFraction: 0.85).delay(model.controller.reveal < 1 ? 1.4 : 0.1)) { shown = true } }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data, .item]) { result in
            if case .success(let url) = result { Task { await model.importSave(from: url) } }
        }
        .sheet(isPresented: $creating) {
            NewWorldSheet { options in creating = false; Task { await model.generate(options) } }
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }
        }
        .sheet(isPresented: $settings) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "设置", subtitle: AppVersion.text, seal: "设")
                    Text("远程计算").font(Theme.kai(17)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
                    RemoteSettings(model: model)
                    Text("声音与触感").font(Theme.kai(17)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
                    FeelSettings()
                }
                .padding(.bottom, 24)
            }
            .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }
        }
        .sheet(isPresented: $notes) { ReleaseNotesSheet().presentationDetents([.large]).presentationBackground { MemorialPaper() } }
    }
}

/// Characters set top to bottom (a scroll's inscription).
struct VerticalText: View {
    let text: String; let size: CGFloat
    init(_ text: String, size: CGFloat) { self.text = text; self.size = size }
    var body: some View {
        VStack(spacing: size * 0.08) {
            ForEach(Array(text.enumerated()), id: \.offset) { _, ch in
                Text(String(ch) == "，" || String(ch) == "；" ? "︐" : String(ch)).font(Theme.kai(size))
            }
        }
    }
}

struct PrimaryLabel: View {
    let title: String; let symbol: String
    var body: some View {
        Label(title, systemImage: symbol).font(Theme.kai(21)).frame(maxWidth: .infinity).frame(height: 54)
            .foregroundStyle(Theme.paper2).background(Theme.seal, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
struct SecondaryLabel: View {
    let title: String; let symbol: String
    var body: some View {
        Label(title, systemImage: symbol).font(Theme.kai(21)).frame(maxWidth: .infinity).frame(height: 54)
            .foregroundStyle(Theme.ink).background(Theme.paper2.opacity(0.9), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.line))
    }
}

/// 生成地图: the original's terrain templates and the number of states.
struct NewWorldSheet: View {
    let start: (GameModel.NewWorld) -> Void
    @State private var options = GameModel.NewWorld()
    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 20) {
            Text("新世界").font(Theme.kai(28)).foregroundStyle(Theme.ink)
            VStack(alignment: .leading, spacing: 10) {
                Text("地形").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                ChipPicker(items: Names.templates.map { ($0.id, $0.name) }, selection: $options.template)
            }
            PaperStepper(title: "国家", value: $options.nations, range: 2...24, unit: "国")
            HStack {
                Text("省份").font(Theme.kai(17)).foregroundStyle(Theme.ink2)
                Spacer()
                TextField("", text: $options.provinces, prompt: Text("80").foregroundColor(Theme.ink2.opacity(0.6)))
                    .font(Theme.kai(18)).foregroundStyle(Theme.ink).keyboardType(.numberPad).multilineTextAlignment(.trailing).tint(Theme.seal)
                    .padding(.horizontal, 12).frame(width: 110, height: 38).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
                Text("个").font(Theme.kai(17)).foregroundStyle(Theme.ink2)
            }
            Text("可填 \(options.nations)–480，每省一城，按地形均分大小；实际生成 \(options.provinceCount) 省。").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            HStack {
                Text("种子").font(Theme.kai(17)).foregroundStyle(Theme.ink2)
                Spacer()
                TextField("", text: $options.seed, prompt: Text("随机").foregroundColor(Theme.ink2.opacity(0.6)))
                    .font(Theme.kai(18)).foregroundStyle(Theme.ink).keyboardType(.numberPad).multilineTextAlignment(.trailing).tint(Theme.seal)
                    .padding(.horizontal, 12).frame(width: 160, height: 38).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("开局").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                ChipPicker(items: [("peace", "列国和平"), ("war", "群雄混战")], selection: $options.relations)
            }
            VStack(alignment: .leading, spacing: 10) {
                Text("命名").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                ChipPicker(items: [("historical-names", "历史真名"), ("culture-generated", "按文化生成")], selection: $options.naming)
            }
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("文化").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                    Spacer()
                    Button(options.cultures.count == Names.cultureIds.count ? "只留一种" : "全选") {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            options.cultures = options.cultures.count == Names.cultureIds.count ? ["chinese"] : Set(Names.cultureIds)
                        }
                    }
                    .font(Theme.kai(14)).foregroundStyle(Theme.seal)
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 8)], spacing: 8) {
                    ForEach(Names.cultureIds, id: \.self) { c in
                        let on = options.cultures.contains(c)
                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                // At least one culture stays chosen.
                                if on { if options.cultures.count > 1 { options.cultures.remove(c) } } else { options.cultures.insert(c) }
                            }
                        } label: {
                            Text(Names.culture[c] ?? c).font(Theme.kai(15)).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                .frame(maxWidth: .infinity).frame(height: 36)
                                .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Color.clear : Theme.line))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                Text("各国从所选文化中取名、取宗教与政体。").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            }
            Button { start(options) } label: { PrimaryLabel(title: "生成地图", symbol: "wand.and.stars") }.buttonStyle(PressStyle()).padding(.top, 6)
        }
        .padding(24)
        }
        .scrollIndicators(.hidden)
    }
}

/// While the engine builds a world: ink drops spreading on paper.
struct GeneratingView: View {
    let note: String
    @State private var phase = false
    var body: some View {
        ZStack {
            Theme.paper.opacity(0.92).ignoresSafeArea()
            VStack(spacing: 22) {
                ZStack {
                    ForEach(0..<3) { i in
                        Circle().stroke(Theme.ink.opacity(0.5), lineWidth: 1.2).frame(width: 46, height: 46)
                            .scaleEffect(phase ? 2.4 : 0.4).opacity(phase ? 0 : 0.8)
                            .animation(.easeOut(duration: 2.1).repeatForever(autoreverses: false).delay(Double(i) * 0.7), value: phase)
                    }
                    SealMark(size: 54)
                }
                .frame(height: 140)
                Text(note.isEmpty ? "请稍候" : note).font(Theme.kai(20)).foregroundStyle(Theme.ink)
                Text("地形、海岸、河流、国家与城市依次成形").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
            }
        }
        .onAppear { phase = true }
    }
}

// MARK: - game

enum Panel: Identifiable, Equatable {
    case province(Int), army(Int), fleet(Int), nation(Int), nations, military, diplomacy, chronicle, menu, statistics, edicts
    var id: String {
        switch self {
        case .province(let p): return "p\(p)"
        case .army(let a): return "a\(a)"
        case .fleet(let f): return "f\(f)"
        case .nation(let n): return "n\(n)"
        case .statistics: return "statistics"
        case .edicts: return "edicts"
        case .nations: return "nations"
        case .military: return "military"
        case .diplomacy: return "diplomacy"
        case .chronicle: return "chronicle"
        case .menu: return "menu"
        }
    }
    /// The name on the back row (返回 …) of the page this panel was opened from.
    var title: String {
        switch self {
        case .province: return "州郡"
        case .army: return "军团"
        case .fleet: return "舰队"
        case .nation: return "国家"
        case .statistics: return "排行"
        case .edicts: return "诏令"
        case .nations: return "列国"
        case .military: return "军事"
        case .diplomacy: return "外交"
        case .chronicle: return "纪事"
        case .menu: return "菜单"
        }
    }
    /// The bottom tab this panel belongs to (highlighted while it is open).
    var tab: String? {
        switch self {
        case .nations, .nation: return "nations"
        case .military, .army, .fleet: return "military"
        case .diplomacy: return "diplomacy"
        case .chronicle: return "chronicle"
        case .statistics: return "statistics"
        default: return nil
        }
    }
}

struct GameView: View {
    @ObservedObject var model: GameModel
    @ObservedObject private var controller: MapController
    @State private var panel: Panel?
    /// Pages the open sheet came from: one sheet stays up and its pages slide in place (返回 goes back).
    @State private var trail: [Panel] = []
    /// The last page shown, kept while the sheet slides away so it does not go blank.
    @State private var lastPanel: Panel?
    /// Going back slides the page in from the leading edge.
    @State private var backward = false
    @State private var toast: String?
    @State private var toastSerial = 0
    @State private var viewsOpen = false
    /// The pending map pick is a retreat (原作防御模式) rather than a march.
    @State private var marchRetreat = false
    @State private var rtsDefend = false
    /// The unit sheets' height; a pick from a list drops it low so the map shows the unit.
    @State private var unitDetent: PresentationDetent = .height(320)
    @Namespace private var tabMarker
    init(model: GameModel) { self.model = model; _controller = ObservedObject(wrappedValue: model.controller) }

    var body: some View {
        ZStack {
            Color.clear
        }
        .overlay(alignment: .top) {
            VStack(spacing: 8) {
                topBar
                if controller.marchingArmy != nil { marchBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if controller.marchingFleet != nil { fleetBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if controller.paintNation != nil { paintBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if !controller.groupArmies.isEmpty { rtsBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if let h = model.herald, let map = model.map {
                    HeraldBanner(herald: h, map: map).id(h.id)
                        .transition(.asymmetric(insertion: .move(edge: .top).combined(with: .scale(scale: 0.85)).combined(with: .opacity), removal: .opacity.combined(with: .scale(scale: 0.95))))
                }
            }
            .animation(.spring(response: 0.5, dampingFraction: 0.78), value: model.herald)
                .offset(y: controller.reveal >= 1 ? 0 : -80)
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: controller.marchingArmy)
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: controller.marchingFleet)
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: controller.paintNation)
        }
        .overlay(alignment: .bottom) { bottomBar.offset(y: controller.reveal >= 1 ? 0 : 120) }
        .overlay(alignment: .bottomLeading) {
            if !model.viewLegend.isEmpty {
                MapViewLegend(mode: model.mapView, legend: model.viewLegend).padding(.leading, 14).padding(.bottom, model.state?.events.isEmpty == false ? 120 : 80)
                    .transition(.asymmetric(insertion: .scale(scale: 0.4, anchor: .bottomLeading).combined(with: .opacity), removal: .opacity))
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.82), value: model.viewLegend)
        .overlay(alignment: .topTrailing) {
            MapViewSwitcher(mode: $model.mapView, open: $viewsOpen).allowsHitTesting(viewsOpen).padding(.top, 52).padding(.trailing, 14)
        }
        .overlay(alignment: .bottom) {
            if let toast {
                HStack(spacing: 10) {
                    Seal(text: "令", size: 22)
                    Text(toast).font(Theme.kai(16)).foregroundStyle(Theme.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.leading, 10).padding(.trailing, 16).padding(.vertical, 10)
                .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous)))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.2), lineWidth: 1))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.seal.opacity(0.22), lineWidth: 0.6).padding(3))
                .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.2), radius: 10, y: 4)
                .padding(.horizontal, 32).padding(.bottom, 116)
                .id(toastSerial)
                .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.92, anchor: .bottom)), removal: .opacity.combined(with: .offset(y: -12))))
                .onTapGesture { self.toast = nil }
            }
        }
        .animation(.spring(response: 0.38, dampingFraction: 0.8), value: toastSerial)
        .animation(.easeOut(duration: 0.22), value: toast)
        .opacity(controller.reveal >= 1 ? 1 : 0)
        .animation(.spring(response: 0.55, dampingFraction: 0.85), value: controller.reveal >= 1)
        .onAppear {
            controller.drifting = false
            controller.onGroupTarget = { province in
                let armies = controller.groupArmies, defend = rtsDefend
                Task {
                    let out = await model.rts(armies: armies, to: province, defend: defend)
                    say(out.reason)
                    if out.ok { controller.groupArmies = [] }
                    model.refreshArmies()
                }
            }
            controller.onPaint = { province in
                guard let n = controller.paintNation, model.state?.owners.indices.contains(province) == true, model.state?.owners[province] != n else { return }
                Task { if let error = await model.grant(province: province, to: n) { say(error) } }
            }
            controller.onFleetTarget = { province in
                guard let index = controller.marchingFleet, let fleet = model.fleet(index) else { controller.marchingFleet = nil; return }
                Task {
                    let name = model.map?.meta.provinces.indices.contains(province) == true ? model.map!.meta.provinces[province].name : ""
                    if let error = await model.fleetOrder(id: fleet.id, province: province) { say(error) }
                    else { say("\(fleet.name)起航，前往\(name)港"); controller.marchingFleet = nil }
                    model.refreshArmies()
                }
            }
            controller.onMarchTarget = { province in
                guard let army = controller.marchingArmy else { return }
                Task {
                    let retreat = marchRetreat
                    let error: String?
                    if retreat { error = await model.retreat(army: army, to: province) } else { error = await model.order(army: army, to: province) }
                    if let error { say(error) }
                    else { say("\(model.army(army)?.name ?? "军队")\(retreat ? "撤往" : "前往")\(model.map?.meta.provinces[province].name ?? "")"); controller.marchingArmy = nil; marchRetreat = false }
                    model.refreshArmies()
                }
            }
        }
        .onChange(of: controller.groupArmies) { _, _ in model.refreshArmies() }
        .onChange(of: model.notice) { _, n in if let n { say(n); model.notice = nil } }
        .onChange(of: controller.marchingFleet) { _, _ in model.refreshArmies() }
        .onChange(of: model.mapView) { _, _ in
            // Choosing a view rolls the switcher back up a moment later.
            Task { try? await Task.sleep(nanoseconds: 280_000_000); withAnimation { viewsOpen = false } }
        }
        .sensoryFeedback(.selection, trigger: model.mapView)
        .onChange(of: panel) { _, p in if let p { lastPanel = p } }
        .sensoryFeedback(.impact(weight: .light), trigger: panel?.id)
        .sensoryFeedback(.selection, trigger: controller.selectedProvince)
        .onChange(of: controller.selectedArmy) { _, army in
            model.refreshArmies()
            if let army { show(.army(army)) } else if case .army = panel { panel = nil }
        }
        .onChange(of: controller.selectedFleet) { _, fleet in
            model.refreshArmies()
            if let fleet { show(.fleet(fleet)) } else if case .fleet = panel { panel = nil }
        }
        .onChange(of: controller.selectedProvince) { _, province in
            if province != nil { withAnimation { viewsOpen = false } }
            if let province { show(.province(province)) } else if case .province = panel { panel = nil }
        }
        .sheet(isPresented: Binding(get: { panel != nil }, set: { if !$0 { panel = nil } }), onDismiss: {
            trail = []
            if panel == nil { controller.selectedProvince = nil; controller.selectedFleet = nil; if controller.marchingArmy == nil { controller.selectedArmy = nil } }
        }) {
            if let panel = panel ?? lastPanel {
                sheet(for: panel)
                    .id(panel.id)
                    .transition(.asymmetric(insertion: .move(edge: backward ? .leading : .trailing).combined(with: .opacity),
                                            removal: .move(edge: backward ? .trailing : .leading).combined(with: .opacity)))
                    .safeAreaInset(edge: .top, spacing: 0) { if let last = trail.last { backRow(last) } }
                    .presentationBackground { MemorialPaper() }.presentationDragIndicator(.visible).presentationCornerRadius(28).font(Theme.kai(17))
            }
        }
    }

    /// Opens a page from inside the sheet: the current page goes on the trail.
    private func open(_ next: Panel) {
        guard next != panel else { return }
        backward = false
        withAnimation(.spring(response: 0.42, dampingFraction: 0.88)) {
            if let panel { trail.append(panel); if trail.count > 8 { trail.removeFirst() } }
            panel = next
        }
    }
    /// A map pick or a bottom tab starts a fresh docket (no trail); an open sheet slides to it.
    private func show(_ next: Panel) {
        guard next != panel else { return }
        backward = false
        if panel == nil { trail = []; panel = next; return }
        withAnimation(.spring(response: 0.42, dampingFraction: 0.88)) { trail = []; panel = next }
    }
    private func back() {
        guard let last = trail.last else { return }
        backward = true
        withAnimation(.spring(response: 0.42, dampingFraction: 0.88)) { trail.removeLast(); panel = last }
    }
    private func backRow(_ last: Panel) -> some View {
        HStack {
            Button { back() } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold))
                    Text("返回" + last.title).font(Theme.kai(15))
                }
                .foregroundStyle(Theme.seal).padding(.horizontal, 12).frame(height: 30)
                .background(Theme.seal.opacity(0.08), in: Capsule())
                .overlay(Capsule().stroke(Theme.seal.opacity(0.25), lineWidth: 0.8))
            }
            .buttonStyle(PressStyle())
            Spacer()
        }
        .padding(.horizontal, 18).padding(.top, 14)
    }

    @ViewBuilder private func sheet(for panel: Panel) -> some View {
        switch panel {
        case .province(let p):
            ProvinceSheet(model: model, province: p, openNation: { n in open(.nation(n)) }, openArmy: { a in unitDetent = .height(320); open(.army(a)); controller.selectedArmy = a; locate(army: a) }).presentationDetents([.height(300), .medium, .large]).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .army(let a):
            ArmySheet(model: model, army: a, say: say, locate: { locate(army: a) }, onMarch: {
                marchRetreat = false; controller.marchingArmy = a; self.panel = nil; say("点选地图上的目的地")
            }, onHalt: { Task { if let e = await model.order(army: a, to: nil) { say(e) } } }, onRetreat: {
                marchRetreat = true; controller.marchingArmy = a; self.panel = nil; say("点选撤退的目的地（途中不主动接战）")
            })
            .presentationDetents([.height(320), .medium, .large], selection: $unitDetent).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .fleet(let f):
            FleetSheet(model: model, fleet: f, pickOnMap: {
                controller.marchingFleet = f; self.panel = nil; say("点选地图上本国的港口州郡")
            }).presentationDetents([.height(320), .medium, .large], selection: $unitDetent).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .nation(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, paint: { n in
                controller.paintNation = n; self.panel = nil
                say("绘制疆域：点选或用一指拖过州郡，划入\(model.map?.meta.nations.indices.contains(n) == true ? model.map!.meta.nations[n].name : "")；两指移动地图")
            })
                .presentationDetents([.medium, .large]).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .edicts:
            EdictSheet(model: model, say: say).presentationDetents([.medium, .large])
        case .statistics:
            StatisticsSheet(model: model) { n in open(.nation(n)) }.presentationDetents([.medium, .large]).presentationBackground(.clear)
        case .nations:
            NationsSheet(model: model) { n in open(.nation(n)) }.presentationDetents([.medium, .large])
        case .military:
            MilitarySheet(model: model, select: { army in
                // The army's docket slides in over the roster (返回军事 goes back); the sheet drops low and
                // the camera flies to the army itself.
                unitDetent = .height(320)
                open(.army(army)); controller.selectedArmy = army
                locate(army: army)
            }, selectFleet: { fleet in
                unitDetent = .height(320)
                open(.fleet(fleet)); controller.selectedFleet = fleet
                if let f = model.fleet(fleet) { controller.fly(x: Double(f.x), y: Double(f.y)) }
            }).presentationDetents([.medium, .large])
        case .diplomacy:
            DiplomacySheet(model: model, say: say).presentationDetents([.medium, .large])
        case .chronicle:
            ChronicleSheet(model: model).presentationDetents([.medium, .large])
        case .menu:
            MenuSheet(model: model, controller: controller, openEdicts: { open(.edicts) }, say: say) { self.panel = nil }.presentationDetents([.medium, .large])
        }
    }

    /// The camera to where the army is drawn now.
    private func locate(army: Int) {
        guard let a = model.army(army) else { return }
        let drawn = controller.placed?(a.id)
        controller.fly(x: drawn?.0 ?? Double(a.x), y: drawn?.1 ?? Double(a.y))
    }

    private func say(_ text: String) {
        toastSerial += 1
        let serial = toastSerial
        toast = text
        Task { try? await Task.sleep(nanoseconds: 2_400_000_000); if toastSerial == serial { toast = nil } }
    }

    // MARK: chrome

    private var topBar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Text(model.state?.dateText ?? "").font(Theme.kai(17)).foregroundStyle(Theme.ink).monospacedDigit()
                    .contentTransition(.numericText()).animation(.snappy(duration: 0.25), value: model.state?.dateText)
                if let wars = model.state?.wars.count, wars > 0 {
                    HStack(spacing: 3) { Circle().fill(Theme.seal).frame(width: 6, height: 6); Text("\(wars)场战争").font(Theme.kai(13)).foregroundStyle(Theme.seal) }
                }
            }
            .padding(.horizontal, 16).frame(height: 42).glass(Capsule())
            Spacer()
            Button { withAnimation { viewsOpen.toggle() } } label: { CircleIcon(glyph: viewsOpen ? .close : .views) }
                .buttonStyle(PressStyle())
            Button {
                if controller.boxSelecting || !controller.groupArmies.isEmpty { controller.boxSelecting = false; controller.groupArmies = []; model.refreshArmies() }
                else { controller.boxSelecting = true; say("即时战略：在地图上拖出方框选择军队") }
            } label: { CircleIcon(glyph: controller.boxSelecting || !controller.groupArmies.isEmpty ? .close : .command) }.buttonStyle(PressStyle())
            Button { show(.menu) } label: { CircleIcon(glyph: .menu) }.buttonStyle(PressStyle())
        }
        .padding(.horizontal, 14).padding(.top, 2)
    }

    /// 即时战略 banner: the selected count, 进攻/防御 mode and cancel.
    private var rtsBanner: some View {
        HStack(spacing: 10) {
            Text("已选 \(controller.groupArmies.count) 支军团 · 点选目的地").font(Theme.kai(15)).foregroundStyle(Theme.ink)
            HStack(spacing: 0) {
                ForEach([false, true], id: \.self) { defend in
                    Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { rtsDefend = defend } } label: {
                        Text(defend ? "防御" : "进攻").font(Theme.kai(14)).foregroundStyle(rtsDefend == defend ? Theme.paper2 : Theme.ink)
                            .padding(.horizontal, 10).padding(.vertical, 5).background(rtsDefend == defend ? Theme.seal : Color.clear, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Theme.wash, in: Capsule())
            Button("取消") { controller.groupArmies = []; model.refreshArmies() }.font(Theme.kai(15)).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 14).frame(height: 42).glass(Capsule())
    }

    private var paintBanner: some View {
        HStack(spacing: 10) {
            let n = controller.paintNation ?? -1, nation = model.map.flatMap { $0.meta.nations.indices.contains(n) ? $0.meta.nations[n] : nil }
            RoundedRectangle(cornerRadius: 3).fill(nation.map { Names.color($0.color) } ?? Theme.ink2).frame(width: 14, height: 14)
            Text("绘制\(nation?.name ?? "")疆域").font(Theme.kai(16)).foregroundStyle(Theme.ink)
            Button("完成") { controller.paintNation = nil }.font(Theme.kai(16)).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 16).frame(height: 40).glass(Capsule())
    }

    private var fleetBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "anchor").foregroundStyle(Theme.seal)
            Text("舰队：点选停留的港口").font(Theme.kai(16)).foregroundStyle(Theme.ink)
            Button("取消") { controller.marchingFleet = nil; model.refreshArmies() }.font(Theme.kai(16)).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 16).frame(height: 40).glass(Capsule())
    }

    private var marchBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.triangle.turn.up.right.diamond.fill").foregroundStyle(Theme.seal)
            Text(marchRetreat ? "撤退：点选目的地" : "调兵：点选目的地").font(Theme.kai(16)).foregroundStyle(Theme.ink)
            Button("取消") { controller.marchingArmy = nil; controller.selectedArmy = nil; model.refreshArmies() }.font(Theme.kai(16)).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 16).frame(height: 40).glass(Capsule())
    }

    private var bottomBar: some View {
        VStack(spacing: 10) {
            if let event = model.state?.events.last {
                Button { show(.chronicle) } label: {
                    Text(event.text).font(Theme.kai(14)).foregroundStyle(Theme.ink).lineLimit(1)
                        .padding(.horizontal, 14).frame(height: 32).glass(Capsule())
                }
                .buttonStyle(.plain).padding(.horizontal, 30)
                .id(event.text).transition(.push(from: .bottom))
            }
            HStack(spacing: 10) {
                HStack(spacing: 0) {
                    TabButton(symbol: "building.columns", title: "国家", glyph: .nation, active: panel?.tab == "nations", marker: tabMarker) { show(.nations) }
                    TabButton(symbol: "shield", title: "军事", glyph: .military, active: panel?.tab == "military", marker: tabMarker) { show(.military) }
                    TabButton(symbol: "scroll", title: "外交", glyph: .diplomacy, active: panel?.tab == "diplomacy", marker: tabMarker) { show(.diplomacy) }
                    TabButton(symbol: "book", title: "纪事", glyph: .chronicle, active: panel?.tab == "chronicle", marker: tabMarker) { show(.chronicle) }
                    TabButton(symbol: "chart.bar.xaxis", title: "排行", glyph: .ranking, active: panel?.tab == "statistics", marker: tabMarker) { show(.statistics) }
                }
                .animation(.spring(response: 0.35, dampingFraction: 0.8), value: panel?.tab)
                .padding(.horizontal, 6).frame(height: 58).glass(Capsule())
                HStack(spacing: 2) {
                    Button { model.cycleSpeed() } label: { Text("\(model.speed)×").font(Theme.kai(18)).foregroundStyle(Theme.ink).frame(width: 40, height: 50).contentTransition(.numericText()) }
                        .buttonStyle(PressStyle())
                    Button { model.togglePlay() } label: {
                        Image(systemName: model.playing ? "pause.fill" : "play.fill").font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Theme.paper2).frame(width: 46, height: 46).background(Theme.seal, in: Circle())
                            .contentTransition(.symbolEffect(.replace))
                    }
                    .buttonStyle(PressStyle())
                    .sensoryFeedback(.impact(weight: .light), trigger: model.playing)
                }
                .padding(.horizontal, 6).frame(height: 58).glass(Capsule())
            }
        }
        .animation(.easeOut(duration: 0.3), value: model.state?.events.last?.text)
        .padding(.horizontal, 12).padding(.bottom, 4)
    }
}

extension View {
    /// Frosted glass with a hairline, the iOS 17 floating-control look.
    func glass<S: Shape>(_ shape: S) -> some View {
        background(Theme.paper2.opacity(0.97), in: shape)
            .overlay(shape.stroke(Theme.ink.opacity(0.12), lineWidth: 1))
            .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.18), radius: 14, y: 5)
    }
}

struct CircleIcon: View {
    var symbol: String = ""
    var glyph: InkGlyph? = nil
    var body: some View {
        Group {
            if let glyph { InkIcon(glyph: glyph, size: 20) } else { Image(systemName: symbol).font(.system(size: 16, weight: .medium)) }
        }
        .foregroundStyle(Theme.ink).frame(width: 42, height: 42).glass(Circle())
    }
}

/// The original's grey line icons (Texture2D exports), drawn as templates in ink or vermilion.
enum OriginalIcon {
    static func image(_ name: String) -> UIImage? {
        Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "World").flatMap { UIImage(contentsOfFile: $0.path) }?.withRenderingMode(.alwaysTemplate)
    }
    static let nation = image("icon-nation"), military = image("icon-military")
}

struct TabButton: View {
    let symbol: String; let title: String
    var icon: UIImage? = nil
    var glyph: InkGlyph? = nil
    var active = false
    var marker: Namespace.ID? = nil
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                if let glyph { InkIcon(glyph: glyph, size: 23, weight: active ? 2.1 : 1.7) }
                else if let icon { Image(uiImage: icon).resizable().interpolation(.high).scaledToFit().frame(width: 22, height: 22) }
                else { Image(systemName: symbol).font(.system(size: 18, weight: .medium)).symbolVariant(active ? .fill : .none) }
                Text(title).font(Theme.kai(12))
            }
            .foregroundStyle(active ? Theme.seal : Theme.ink).frame(width: 50, height: 50).contentShape(Rectangle())
            .overlay(alignment: .bottom) {
                // The vermilion mark under the open tab slides between tabs.
                if active, let marker {
                    Capsule().fill(Theme.seal).frame(width: 16, height: 2.5).offset(y: 1).matchedGeometryEffect(id: "tab", in: marker)
                }
            }
        }
        .buttonStyle(PressStyle())
    }
}

// MARK: - panels

/// Memorial heading: a colour tab (签条) for a state, the brush title, an ink rule that draws
/// itself, the docket line, and a small seal.
struct SheetHeader: View {
    let title: String
    var subtitle: String?
    var color: Color?
    var seal: String = "阅"
    @State private var inked = false
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if let color {
                VStack(spacing: 0) {
                    RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 40)
                    Rectangle().fill(Theme.seal.opacity(0.7)).frame(width: 1.5, height: 8)
                }
                .shadow(color: Theme.ink.opacity(0.15), radius: 1, y: 1)
            }
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(Theme.kai(28)).foregroundStyle(Theme.ink).tracking(2).lineLimit(1).minimumScaleFactor(0.7)
                Rectangle().fill(LinearGradient(colors: [Theme.ink.opacity(0.7), Theme.ink.opacity(0)], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 1.2).scaleEffect(x: inked ? 1 : 0, anchor: .leading)
                if let subtitle { Text(subtitle).font(Theme.kai(14)).foregroundStyle(Theme.ink2) }
            }
            Spacer(minLength: 6)
            Seal(text: seal, size: 32)
        }
        .padding(.horizontal, 22).padding(.top, 22).padding(.bottom, 10)
        .onAppear { withAnimation(.easeOut(duration: 0.55)) { inked = true } }
    }
}

/// A folded memorial page: translucent rice paper, an ink outer rule and a vermilion inner rule;
/// it unfolds when it first appears.
struct Group2<Content: View>: View {
    @ViewBuilder let content: Content
    @State private var unfolded = false
    var body: some View {
        VStack(spacing: 0) { content }
            .background(Theme.paper2.opacity(0.62), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.2), lineWidth: 1))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.seal.opacity(0.16), lineWidth: 0.6).padding(3))
            .shadow(color: Color(red: 0.25, green: 0.18, blue: 0.08).opacity(0.08), radius: 6, y: 2)
            .scaleEffect(x: 1, y: unfolded ? 1 : 0.94, anchor: .top).opacity(unfolded ? 1 : 0)
            .onAppear { withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { unfolded = true } }
    }
}

/// A docket line: label, a dotted leader, the value.
struct Row: View {
    let label: String; let value: String
    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 8) {
            Text(label).foregroundStyle(Theme.ink2).layoutPriority(1)
            Line().stroke(Theme.ink.opacity(0.25), style: StrokeStyle(lineWidth: 1, lineCap: .round, dash: [1, 4])).frame(height: 1).offset(y: -4)
            Text(value).foregroundStyle(Theme.ink).multilineTextAlignment(.trailing).layoutPriority(1)
        }
        .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12)
    }
    private struct Line: Shape { func path(in r: CGRect) -> Path { Path { p in p.move(to: CGPoint(x: 0, y: r.midY)); p.addLine(to: CGPoint(x: r.width, y: r.midY)) } } }
}

struct Divider2: View { var body: some View { Rectangle().fill(Theme.ink.opacity(0.12)).frame(height: 0.8).padding(.horizontal, 16) } }

struct NationChip: View {
    let map: WorldMap; let nation: Int
    var body: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 3).fill(nation >= 0 && nation < map.meta.nations.count ? Names.color(map.meta.nations[nation].color) : .gray).frame(width: 12, height: 12)
            Text(nation >= 0 && nation < map.meta.nations.count ? map.meta.nations[nation].name : "无主").font(Theme.kai(18)).foregroundStyle(Theme.ink)
        }
    }
}

struct ProvinceSheet: View {
    @ObservedObject var model: GameModel
    let province: Int
    var openNation: (Int) -> Void = { _ in }
    var openArmy: (Int) -> Void = { _ in }
    @State private var granting = false
    @State private var grantTarget = -1
    @State private var info: ProvinceInfo?
    var body: some View {
        if let map = model.map {
            let p = map.meta.provinces[province]
            let owner = model.state.flatMap { $0.owners.indices.contains(province) ? $0.owners[province] : nil } ?? p.nation
            let nation = owner >= 0 && owner < map.meta.nations.count ? map.meta.nations[owner] : nil
            let armies = model.state?.armies.enumerated().filter { $0.element.province == province } ?? []
            ScrollView {
                VStack(spacing: 14) {
                    SheetHeader(title: p.name, subtitle: nation.map { "\($0.name) · \(Names.terrain[p.terrain] ?? p.terrain)" } ?? Names.terrain[p.terrain], color: nation.map { Names.color($0.color) })
                    Group2 {
                        if let info {
                            Row(label: "人口", value: info.population.formatted()); Divider2()
                            Row(label: "人口上限", value: info.capacity.formatted()); Divider2()
                            Row(label: "存粮", value: Int(info.grain).formatted()); Divider2()
                            if info.owner != info.controller, info.owner >= 0, info.owner < map.meta.nations.count { Row(label: "法理归属", value: map.meta.nations[info.owner].name); Divider2() }
                        }
                        if let n = nation {
                            Row(label: "政体", value: Names.polity[n.polity] ?? n.polity); Divider2(); Row(label: "文化", value: Names.culture[n.culture] ?? n.culture); Divider2()
                            Button { openNation(owner) } label: {
                                HStack { Text("国家详情").foregroundStyle(Theme.ink); Spacer(); Text(n.name).foregroundStyle(Theme.ink2); Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2) }
                                    .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider2()
                            Button { grantTarget = -1; granting = true } label: {
                                HStack { Text("划入他国（绘制国家）").foregroundStyle(Theme.ink); Spacer(); Image(systemName: "paintbrush.pointed").font(.caption).foregroundStyle(Theme.seal) }
                                    .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    if let siege = model.state?.sieges.first(where: { $0.province == province }) {
                        Group2 {
                            HStack { Text("围城").foregroundStyle(Theme.seal); Spacer(); NationChip(map: map, nation: siege.nation) }.padding(.horizontal, 16).padding(.top, 12)
                            ProgressView(value: min(1, max(0, siege.progress))).tint(Theme.seal).padding(16)
                        }
                        .padding(.horizontal, 16)
                    }
                    if let port = model.state?.ports?.first(where: { $0.province == province }) {
                        Group2 {
                            Row(label: "海港", value: port.occupier == port.owner ? "本国控制" : "被占领"); Divider2()
                            if port.occupier >= 0, port.occupier < map.meta.nations.count { Row(label: "港口控制", value: map.meta.nations[port.occupier].name); Divider2() }
                            Row(label: "控制度", value: "\(Int(port.value))")
                        }
                        .padding(.horizontal, 16)
                    }
                    if !armies.isEmpty {
                        Group2 {
                            ForEach(armies, id: \.element.id) { pair in
                                Button { openArmy(pair.offset) } label: { ArmyRow(map: map, army: pair.element) }.buttonStyle(.plain)
                                if pair.element.id != armies.last?.element.id { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 24)
            }
            .task(id: model.state?.day) { info = await model.provinceInfo(province) }
            .sheet(isPresented: $granting) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        SheetHeader(title: "绘制国家", subtitle: "\(p.name)划入所选国家，法理与实控同时转移", seal: "绘")
                        if let state = model.state {
                            Group2 {
                                NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive && $0 != owner && $0 < map.meta.nations.count }, selection: $grantTarget).padding(14)
                                Divider2()
                                Button {
                                    let t = grantTarget; granting = false
                                    Task { _ = await model.grant(province: province, to: t); info = await model.provinceInfo(province) }
                                } label: { Label("确认划入", systemImage: "paintbrush.pointed.fill").font(Theme.kai(18)).frame(maxWidth: .infinity).padding(.vertical, 13).foregroundStyle(grantTarget < 0 ? Theme.ink2 : Theme.seal) }
                                .buttonStyle(.plain).disabled(grantTarget < 0)
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.bottom, 24)
                }
                .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.font(Theme.kai(17))
            }
        }
    }
}

struct ArmyRow: View {
    let map: WorldMap; let army: GameState.Army
    static func dest(_ map: WorldMap, _ a: GameState.Army) -> String {
        guard let d = a.destination, d >= 0, d < map.meta.provinces.count else { return "" }
        return " → " + map.meta.provinces[d].name
    }
    /// Who commands the army: a player order, an AI expedition (voyages mission phase), or army AI.
    static func command(_ a: GameState.Army) -> String {
        if a.manual { return "玩家军令" }
        let phases = ["assembling": "集结", "outbound": "出航", "returning": "返航"]
        if let m = a.mission, !m.isEmpty { return "AI 远征 · \(phases[m] ?? m)" }
        return "AI 自主调度"
    }
    var body: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 3).fill(army.nation >= 0 && army.nation < map.meta.nations.count ? Names.color(map.meta.nations[army.nation].color) : .gray).frame(width: 10, height: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(army.name).font(Theme.kai(18)).foregroundStyle(Theme.ink)
                Text("\(Names.unit[army.unit] ?? army.unit) · \(map.meta.provinces.indices.contains(army.province) ? map.meta.provinces[army.province].name : "海上") · \(Names.status(army.status))\(Self.dest(map, army))").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            }
            Spacer()
            Text(Names.wan(army.troops)).font(Theme.kai(18)).foregroundStyle(Theme.ink)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
    }
}

struct ArmySheet: View {
    @ObservedObject var model: GameModel
    let army: Int
    var say: (String) -> Void = { _ in }
    var locate: () -> Void = {}
    let onMarch: () -> Void
    let onHalt: () -> Void
    var onRetreat: () -> Void = {}
    @State private var editing = false
    @State private var troopsText = ""
    @State private var unit = ""
    @State private var morale = 100.0
    static let units = [("Infantry", "步兵"), ("Archer", "弓兵"), ("Shield", "盾兵"), ("Cavalry", "骑兵"), ("Elite", "精锐")]
    var body: some View {
        if let map = model.map, let a = model.army(army) {
            let nation = a.nation >= 0 && a.nation < map.meta.nations.count ? map.meta.nations[a.nation] : nil
            let tint = nation.map { Names.color($0.color) } ?? Theme.ink2
            let fighting = a.status == "fighting"
            ScrollView {
                VStack(spacing: 14) {
                    // 军牌: the unit's mark in its state's colour beside the name.
                    HStack(spacing: 14) {
                        UnitMark(unit: a.unit, color: tint).frame(width: 46, height: 46)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(a.name).font(Theme.kai(26)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                            HStack(spacing: 6) {
                                RoundedRectangle(cornerRadius: 2).fill(tint).frame(width: 10, height: 10)
                                Text("\(nation?.name ?? "") · \(Names.unit[a.unit] ?? a.unit)").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                            }
                        }
                        Spacer()
                        Button(action: locate) { InkIcon(glyph: .views, size: 20).foregroundStyle(Theme.seal).frame(width: 40, height: 40).background(Theme.seal.opacity(0.08), in: Circle()) }
                            .buttonStyle(PressStyle()).accessibilityLabel("定位")
                    }
                    .padding(.horizontal, 22).padding(.top, 22)
                    StatStrip(tiles: [
                        StatTile(label: "兵力", value: Names.wan(a.troops)),
                        StatTile(label: "士气", value: "\(a.morale)", fraction: Double(a.morale) / 100, warn: a.morale < 30),
                        StatTile(label: "粮草", value: "\(a.supplies)", fraction: Double(min(100, a.supplies)) / 100, warn: a.supplies <= 10),
                    ])
                    // Status as one plain line instead of a table.
                    HStack(spacing: 8) {
                        Text(fighting ? "交战中" : a.travel == "moving" ? "行军中" : Names.status(a.status)).font(Theme.kai(14)).foregroundStyle(Theme.paper2)
                            .padding(.horizontal, 8).padding(.vertical, 3).background(fighting ? Theme.seal : Theme.ink2, in: Capsule())
                        Text(map.meta.provinces.indices.contains(a.province) ? map.meta.provinces[a.province].name : "海上").font(Theme.kai(15)).foregroundStyle(Theme.ink)
                        if let d = a.destination, d >= 0, d < map.meta.provinces.count {
                            Image(systemName: "arrow.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.ink2)
                            Text(map.meta.provinces[d].name).font(Theme.kai(15)).foregroundStyle(Theme.seal)
                        }
                        Spacer()
                        Text(ArmyRow.command(a)).font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                    }
                    .padding(.horizontal, 22)
                    HStack(spacing: 10) {
                        Button(action: onMarch) { PrimaryLabel(title: "调兵", symbol: "arrow.triangle.turn.up.right.diamond") }.disabled(fighting).opacity(fighting ? 0.5 : 1)
                        Button(action: onRetreat) { SecondaryLabel(title: "撤退", symbol: "arrow.uturn.backward") }
                        if a.travel == "moving" || a.travel == "blocked" { Button(action: onHalt) { SecondaryLabel(title: "停止", symbol: "stop.fill") }.transition(.scale.combined(with: .opacity)) }
                    }
                    .buttonStyle(.plain).padding(.horizontal, 16)
                    .animation(.spring(response: 0.35, dampingFraction: 0.8), value: a.travel)
                    // 整编 (custom): strength, arm and morale.
                    Button { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { editing.toggle() } } label: {
                        HStack { Text("整编（自定义）").font(Theme.kai(16)).foregroundStyle(Theme.ink); Spacer(); Image(systemName: editing ? "chevron.up" : "chevron.down").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.ink2) }
                            .padding(.horizontal, 24).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if editing {
                        Group2 {
                            HStack(spacing: 8) {
                                Text("兵力").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                                Spacer()
                                ForEach([-5000, -1000], id: \.self) { d in stepButton(d, a.troops) }
                                TextField("", text: $troopsText, prompt: Text("\(a.troops)").foregroundColor(Theme.ink2.opacity(0.6)))
                                    .font(Theme.kai(17)).keyboardType(.numberPad).multilineTextAlignment(.center).frame(width: 84)
                                    .padding(.vertical, 5).background(Theme.paper2, in: RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.line))
                                ForEach([1000, 5000], id: \.self) { d in stepButton(d, a.troops) }
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            Divider2()
                            ChipPicker(items: Self.units, selection: $unit).padding(.horizontal, 12).padding(.vertical, 10)
                            Divider2()
                            VStack(alignment: .leading, spacing: 4) {
                                Text("士气 \(Int(morale))").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                                Slider(value: $morale, in: 0...100, step: 1).tint(Theme.seal)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 8)
                            Divider2()
                            Button {
                                let troops = Int(troopsText)
                                Task {
                                    let error = await model.editArmy(a.id, troops: troops, unit: unit == a.unit ? nil : unit, morale: morale)
                                    say(error ?? "\(a.name)已整编"); GameFeel.shared.notify(error == nil ? .success : .error)
                                    if error == nil { troopsText = "" }
                                }
                            } label: { Text("颁行").font(Theme.kai(17)).foregroundStyle(Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 11) }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 16)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                        .onAppear { unit = a.unit; morale = Double(a.morale) }
                    }
                }
                .padding(.bottom, 24)
            }
        }
    }
    private func stepButton(_ delta: Int, _ current: Int) -> some View {
        Button {
            let base = Int(troopsText) ?? current
            troopsText = String(max(1, base + delta))
        } label: {
            Text(delta > 0 ? "+\(delta / 1000)k" : "\(delta / 1000)k").font(Theme.kai(13)).foregroundStyle(Theme.ink)
                .frame(width: 38, height: 30).background(Theme.paper2, in: RoundedRectangle(cornerRadius: 7)).overlay(RoundedRectangle(cornerRadius: 7).stroke(Theme.line))
        }
        .buttonStyle(PressStyle())
    }
}

/// The original's unit mark (World/unit-*.png) in a state's colour.
struct UnitMark: View {
    let unit: String; let color: Color
    private static var cache = [String: UIImage]()
    var body: some View {
        Group {
            if let img = Self.image(unit) { Image(uiImage: img).resizable().renderingMode(.template).scaledToFit().foregroundStyle(color) }
            else { InkIcon(glyph: .military).foregroundStyle(color) }
        }
        .padding(6)
        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(color.opacity(0.6), lineWidth: 1.2))
    }
    static func image(_ unit: String) -> UIImage? {
        if let c = cache[unit] { return c }
        guard let url = Bundle.main.url(forResource: "unit-" + unit, withExtension: "png", subdirectory: "World"), let img = UIImage(contentsOfFile: url.path) else { return nil }
        cache[unit] = img; return img
    }
}

struct NationsSheet: View {
    @ObservedObject var model: GameModel
    let select: (Int) -> Void
    var body: some View {
        if let map = model.map, let state = model.state {
            // A state just founded may not be in the map legend yet: list only the ones it has.
            let order = state.nations.indices.filter { $0 < map.meta.nations.count }.sorted { state.nations[$0].provinces > state.nations[$1].provinces }
            ScrollView {
                VStack(spacing: 14) {
                    SheetHeader(title: "国家", subtitle: "\(state.nations.filter(\.alive).count) 国并立")
                    Group2 {
                        ForEach(order, id: \.self) { i in
                            let n = map.meta.nations[i], s = state.nations[i]
                            Button { select(i) } label: {
                                HStack(spacing: 12) {
                                    RoundedRectangle(cornerRadius: 5).fill(Names.color(n.color)).frame(width: 22, height: 22)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack(spacing: 6) {
                                            Text(n.name).font(Theme.kai(20)).foregroundStyle(s.alive ? Theme.ink : Theme.ink2)
                                            if !s.enemies.isEmpty { Text("交战").font(Theme.kai(12)).foregroundStyle(Theme.seal).padding(.horizontal, 6).padding(.vertical, 1).background(Theme.seal.opacity(0.1), in: Capsule()) }
                                            if !s.alive { Text("已亡").font(Theme.kai(12)).foregroundStyle(Theme.ink2) }
                                        }
                                        Text("\(Names.polity[n.polity] ?? n.polity) · \(Names.culture[n.culture] ?? n.culture)文化").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 3) {
                                        Text("\(s.provinces) 省").font(Theme.kai(17)).foregroundStyle(Theme.ink)
                                        Text("\(Names.wan(s.population))人 · \(Names.wan(s.troops))兵").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                                    }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if i != order.last { Divider2() }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            }
        }
    }
}

struct MilitarySheet: View {
    @ObservedObject var model: GameModel
    let select: (Int) -> Void
    var selectFleet: (Int) -> Void = { _ in }
    var body: some View {
        if let map = model.map, let state = model.state {
            // Armies by state, built lazily as the list scrolls (hundreds of rows made opening slow).
            let byNation = Dictionary(grouping: state.armies.indices, by: { state.armies[$0].nation })
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "军事", subtitle: "\(state.armies.count) 支军队" + ((state.fleets ?? []).isEmpty ? "" : " · \(state.fleets!.count) 支舰队"))
                    if let fleets = state.fleets, !fleets.isEmpty {
                        Text("舰队").font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
                        Group2 {
                            ForEach(fleets.indices, id: \.self) { i in
                                Button { selectFleet(i) } label: { FleetRow(map: map, fleet: fleets[i]) }.buttonStyle(.plain)
                                if i != fleets.indices.last { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    ForEach(state.nations.indices, id: \.self) { n in
                        let rows = byNation[n] ?? []
                        if !rows.isEmpty {
                            NationChip(map: map, nation: n).padding(.horizontal, 22)
                            Group2 {
                                ForEach(rows, id: \.self) { i in
                                    Button { select(i) } label: { ArmyRow(map: map, army: state.armies[i]) }.buttonStyle(.plain)
                                    if i != rows.last { Divider2() }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                }
                .padding(.bottom, 24)
            }
        }
    }
}

struct DiplomacySheet: View {
    @ObservedObject var model: GameModel
    let say: (String) -> Void
    @State private var attacker = 0
    @State private var defender = 1
    var body: some View {
        if let map = model.map, let state = model.state {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "外交", subtitle: state.wars.isEmpty ? "天下太平" : "\(state.wars.count) 场战争进行中")
                    if !state.wars.isEmpty {
                        Group2 {
                            ForEach(state.wars) { war in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(spacing: 8) {
                                        NationChip(map: map, nation: war.attacker)
                                        Image(systemName: "bolt.fill").font(.caption).foregroundStyle(Theme.seal)
                                        NationChip(map: map, nation: war.defender)
                                        Spacer()
                                        Button("议和") {
                                            Task { if let e = await model.makePeace(war.attacker, war.defender) { say(e) } else { say("两国议和") } }
                                        }
                                        .font(Theme.kai(15)).padding(.horizontal, 12).padding(.vertical, 5)
                                        .background(Theme.jade.opacity(0.12), in: Capsule()).foregroundStyle(Theme.jade).buttonStyle(.plain)
                                    }
                                    Text([war.casusBelli, war.goal].filter { !$0.isEmpty }.joined(separator: " · ")).font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                                    if war.participants.count > 2 {
                                        Text("参战：" + war.participants.compactMap { p in p.nation >= 0 && p.nation < map.meta.nations.count ? map.meta.nations[p.nation].name : nil }.joined(separator: "、"))
                                            .font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                                    }
                                }
                                .padding(16)
                                if war.id != state.wars.last?.id { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    Text("宣战").font(Theme.kai(17)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
                    Group2 {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("宣战国").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                            NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive }, selection: $attacker)
                            Text("目标国").font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(.top, 6)
                            NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive && $0 != attacker }, selection: $defender)
                        }
                        .padding(14)
                        Divider2()
                        Button {
                            Task { if let e = await model.declareWar(attacker, on: defender) { say(e) } else { say(model.state?.events.last?.text ?? "已宣战") } }
                        } label: { Label("宣战", systemImage: "flag.2.crossed").font(Theme.kai(18)).frame(maxWidth: .infinity).padding(.vertical, 13).foregroundStyle(Theme.seal) }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            }
        }
    }
}

/// The chronicle as a hand scroll: wooden rods, entries brushed in newest first, war in vermilion,
/// peace in jade, the newest marked with a small seal.
struct ChronicleSheet: View {
    @ObservedObject var model: GameModel
    @State private var unrolled = false
    var body: some View {
        ZStack {
            MemorialPaper()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    MemorialHeader(title: "纪事", subtitle: model.state?.dateText, seal: "史")
                    VStack(spacing: 0) {
                        ScrollRod().padding(.horizontal, 6)
                        VStack(alignment: .leading, spacing: 0) {
                            let events = Array((model.state?.events ?? []).reversed())
                            ForEach(Array(events.enumerated()), id: \.offset) { i, e in
                                HStack(alignment: .top, spacing: 10) {
                                    Circle().fill(color(e.kind)).frame(width: 7, height: 7).padding(.top, 8)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("第\(e.day + 1)日").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                                        Text(e.text).font(Theme.kai(16)).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                                    }
                                    Spacer(minLength: 0)
                                    if i == 0 { Seal(text: "新", size: 22) }
                                }
                                .padding(.horizontal, 18).padding(.vertical, 9)
                                .opacity(unrolled ? 1 : 0).offset(y: unrolled ? 0 : -6)
                                .animation(.easeOut(duration: 0.35).delay(min(0.6, Double(i) * 0.03)), value: unrolled)
                                if i < events.count - 1 { Rectangle().fill(Theme.ink.opacity(0.08)).frame(height: 0.7).padding(.leading, 35).padding(.trailing, 18) }
                            }
                        }
                        .padding(.vertical, 8)
                        .background(Theme.paper2.opacity(0.55))
                        .overlay(Rectangle().stroke(Theme.ink.opacity(0.12), lineWidth: 0.8))
                        .padding(.horizontal, 16)
                        .scaleEffect(x: 1, y: unrolled ? 1 : 0.02, anchor: .top)
                        ScrollRod().padding(.horizontal, 6)
                    }
                    .padding(.horizontal, 10)
                }
                .padding(.bottom, 28)
            }
        }
        .onAppear { withAnimation(.spring(response: 0.6, dampingFraction: 0.86)) { unrolled = true } }
    }
    private func color(_ kind: String) -> Color {
        switch kind { case "war", "battle", "uprising", "civilWar", "rebellion": return Theme.seal; case "peace", "diplomacy": return Theme.jade; default: return Theme.ink2.opacity(0.6) }
    }
}

struct MenuSheet: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    var openEdicts: () -> Void = {}
    var say: (String) -> Void = { _ in }
    let close: () -> Void
    @State private var creating = false
    @State private var notes = false
    @State private var exported: ExportFile?
    @State private var importing = false
    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader(title: "菜单", subtitle: AppVersion.text)
            Group2 {
                Button {
                    Task { let ok = await model.saveNow(); GameFeel.shared.notify(ok ? .success : .error); say(ok ? "已保存" : "保存失败"); close() }
                } label: { MenuRow(symbol: "square.and.arrow.down", title: "保存") }.buttonStyle(.plain)
                Divider2()
                Button { Task { exported = await model.exportCopy().map(ExportFile.init) } } label: { MenuRow(symbol: "square.and.arrow.up", title: "导出存档（备份）") }.buttonStyle(.plain)
                Divider2()
                Button { importing = true } label: { MenuRow(symbol: "tray.and.arrow.down", title: "导入存档") }.buttonStyle(.plain)
                Divider2()
                Button { openEdicts() } label: { MenuRow(symbol: "scroll.fill", title: "天下诏令（外交、联盟、叛乱、家族、附庸）") }.buttonStyle(.plain)
                Divider2()
                Button { creating = true } label: { MenuRow(symbol: "globe.asia.australia", title: "新世界") }.buttonStyle(.plain)
                Divider2()
                Button { close(); model.backToTitle() } label: { MenuRow(symbol: "house", title: "返回标题") }.buttonStyle(.plain)
                Divider2()
                Button { notes = true } label: { MenuRow(symbol: "sparkles", title: "本版新增与更新内容") }.buttonStyle(.plain)
                Divider2()
                PaperSwitch(title: "显示帧率", on: $controller.showMetrics)
            }
            .padding(.horizontal, 16)
            Text("远程计算").font(Theme.kai(17)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
            RemoteSettings(model: model)
            Text("声音与触感").font(Theme.kai(17)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
            FeelSettings()
            Text("显示设置").font(Theme.kai(17)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
            Group2 {
                PaperSwitch(title: "国界", on: $controller.display.borders)
                Divider2()
                PaperSwitch(title: "行省边界", on: $controller.display.provinceLines)
                Divider2()
                PaperSwitch(title: "城市名称", on: $controller.display.cityNames)
                Divider2()
                PaperSwitch(title: "城市图标", on: $controller.display.cityIcons)
                Divider2()
                PaperSwitch(title: "植被与地貌图标", on: $controller.display.vegetation)
                Divider2()
                VStack(alignment: .leading, spacing: 4) {
                    Text("国家颜色浓度 \(Int(controller.display.colorDensity * 100))%").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                    Slider(value: $controller.display.colorDensity, in: 0.2...1, step: 0.1).tint(Theme.jade)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            }
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 24)
        }
        .sheet(isPresented: $creating) {
            NewWorldSheet { options in creating = false; close(); Task { await model.generate(options) } }
                .presentationDetents([.medium]).presentationBackground { MemorialPaper() }
        }
        .sheet(item: $exported) { file in ShareSheet(items: [file.url]) }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data, .item]) { result in
            if case .success(let url) = result { close(); Task { await model.importSave(from: url) } }
        }
        .sheet(isPresented: $notes) { ReleaseNotesSheet().presentationDetents([.large]).presentationBackground { MemorialPaper() } }
    }
}

struct ExportFile: Identifiable { let url: URL; var id: String { url.absoluteString } }

/// UIActivityViewController for exporting a save file.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
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
                                HStack(alignment: .top, spacing: 8) { Text("·").foregroundStyle(Theme.ink2); Text(line).font(Theme.kai(16)).foregroundStyle(Theme.ink) }
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

/// Over the rising device-built world while the engine founds its nations, people and armies.
struct FoundingView: View {
    let reveal: Float
    /// The world's generation as it happens (like a world being made in a sandbox game): each stage
    /// names what the map is drawing at that moment — the sea, the land rising from the coast, the
    /// mountains, the rivers, forests and plains, the provinces, the states' colours — and then the
    /// engine's work: cities, houses and people, armies, relations. Finished stages stay listed.
    static let stages: [(until: Float, text: String)] = [
        (0.06, "注水成海"), (0.24, "抬升大陆"), (0.38, "隆起山脉与高原"), (0.45, "冲刷江河"),
        (0.55, "播撒森林、草原与荒漠"), (0.65, "划分州郡"), (0.75, "分封列国"), (0.85, "勘定国界"), (1.00, "营建城邦与港口"),
    ]
    static let later = ["诞生世家与人物", "编练军队", "缔结邦交", "天下初定"]
    @State private var started = Date()
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.35)) { context in
            let waited = reveal >= 1 ? context.date.timeIntervalSince(started) : 0
            let laterIndex = min(Self.later.count - 1, Int(waited / 0.8))
            let current = reveal < 1 ? (Self.stages.firstIndex { reveal < $0.until } ?? Self.stages.count - 1) : Self.stages.count + laterIndex
            let all = Self.stages.map(\.text) + Self.later
            let progress = reveal < 1 ? Double(reveal) * 0.85 : min(1, 0.85 + waited / 0.8 / Double(Self.later.count) * 0.15)
            VStack {
                Spacer()
                VStack(alignment: .leading, spacing: 10) {
                    // The last finished stages, faded, above the one at work.
                    ForEach(max(0, current - 3)..<current, id: \.self) { i in
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.jade)
                            Text(all[i]).font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                        }
                        .opacity(0.45 + 0.18 * Double(i - (current - 3)))
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    HStack(spacing: 10) {
                        ProgressView().tint(Theme.seal).scaleEffect(0.8)
                        Text(all[min(current, all.count - 1)] + "……").font(Theme.kai(19)).foregroundStyle(Theme.ink)
                            .id(current).transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
                    }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.ink.opacity(0.1))
                            Capsule().fill(Theme.seal).frame(width: g.size.width * progress)
                        }
                    }
                    .frame(height: 4)
                    Text("\(Int(progress * 100))%").font(Theme.kai(12)).foregroundStyle(Theme.ink2).monospacedDigit()
                }
                .animation(.spring(response: 0.45, dampingFraction: 0.85), value: current)
                .animation(.easeOut(duration: 0.3), value: progress)
                .padding(.horizontal, 20).padding(.vertical, 16)
                .frame(maxWidth: 360, alignment: .leading)
                .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.ink.opacity(0.18), lineWidth: 1))
                .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.2), radius: 12, y: 5)
                .padding(.bottom, 40)
            }
            .onChange(of: reveal >= 1) { _, done in if done { started = Date() } }
        }
    }
}

struct MenuRow: View {
    let symbol: String; let title: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).frame(width: 24).foregroundStyle(Theme.seal)
            Text(title).font(Theme.kai(18)).foregroundStyle(Theme.ink)
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 16).padding(.vertical, 13).contentShape(Rectangle())
    }
}

/// Pressed buttons sink slightly, like paper under a finger.
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 0.96 : 1).opacity(configuration.isPressed ? 0.86 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// A row of paper chips (replaces the system segmented control).
struct ChipPicker<T: Hashable>: View {
    let items: [(T, String)]
    @Binding var selection: T
    var body: some View {
        HStack(spacing: 8) {
            ForEach(items.indices, id: \.self) { i in
                let item = items[i], on = item.0 == selection
                Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { selection = item.0 } } label: {
                    Text(item.1).font(Theme.kai(16)).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(on ? Color.clear : Theme.line))
                }
                .buttonStyle(PressStyle())
            }
        }
    }
}

/// − value + (replaces the system stepper).
struct PaperStepper: View {
    let title: String
    @Binding var value: Int
    let range: ClosedRange<Int>
    let unit: String
    var body: some View {
        HStack(spacing: 12) {
            Text(title).font(Theme.kai(17)).foregroundStyle(Theme.ink2)
            Spacer()
            Button { if value > range.lowerBound { value -= 1 } } label: { Image(systemName: "minus").font(.system(size: 15, weight: .bold)).frame(width: 40, height: 36) }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
            Text("\(value) \(unit)").font(Theme.kai(19)).foregroundStyle(Theme.ink).frame(minWidth: 56)
            Button { if value < range.upperBound { value += 1 } } label: { Image(systemName: "plus").font(.system(size: 15, weight: .bold)).frame(width: 40, height: 36) }
                .buttonStyle(PressStyle()).foregroundStyle(Theme.ink).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
        }
    }
}

/// A paper switch (replaces the system toggle).
struct PaperSwitch: View {
    let title: String
    @Binding var on: Bool
    var body: some View {
        Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { on.toggle() } } label: {
            HStack {
                Text(title).font(Theme.kai(18)).foregroundStyle(Theme.ink)
                Spacer()
                ZStack(alignment: on ? .trailing : .leading) {
                    Capsule().fill(on ? Theme.seal : Theme.wash).frame(width: 50, height: 30)
                    Circle().fill(Theme.paper2).frame(width: 24, height: 24).padding(3).shadow(color: .black.opacity(0.15), radius: 2, y: 1)
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
                Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { selection = n } } label: {
                    HStack(spacing: 6) {
                        RoundedRectangle(cornerRadius: 3).fill(Names.color(map.meta.nations[n].color)).frame(width: 12, height: 12)
                        Text(map.meta.nations[n].name).font(Theme.kai(16)).lineLimit(1).minimumScaleFactor(0.7)
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

/// A war declared, a peace made or a city taken: a seal and the text, dropped in from the top.
struct HeraldBanner: View {
    let herald: GameModel.Herald
    let map: WorldMap
    @State private var stamped = false
    var body: some View {
        let (word, color): (String, Color) = herald.kind == .war ? ("宣战", Theme.seal) : herald.kind == .peace ? ("议和", Theme.jade) : ("攻克", Theme.ink)
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 9, style: .continuous).fill(color)
                .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(Theme.paper2.opacity(0.85), lineWidth: 1.2).padding(3))
                .overlay(Text(word).font(Theme.kai(15)).foregroundStyle(Theme.paper2))
                .frame(width: 46, height: 46)
                .scaleEffect(stamped ? 1 : 1.5).rotationEffect(.degrees(stamped ? 0 : -12)).opacity(stamped ? 1 : 0)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    ForEach(Array(herald.nations.enumerated()), id: \.offset) { pair in
                        if pair.offset > 0 { Text(herald.kind == .peace ? "与" : "对").font(Theme.kai(14)).foregroundStyle(color) }
                        NationChip(map: map, nation: pair.element)
                    }
                }
                Text(herald.text).font(Theme.kai(15)).foregroundStyle(Theme.ink2).lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: 440)
        .glass(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.horizontal, 14)
        .onAppear { withAnimation(.spring(response: 0.36, dampingFraction: 0.55).delay(0.12)) { stamped = true } }
    }
}

// MARK: - fleets (open-sea worlds)

enum FleetText {
    static func status(_ s: String) -> String { ["docked": "停泊", "sailing": "航行", "anchored": "下锚", "lost": "已损失"][s] ?? s }
    static func decision(_ d: String) -> String {
        ["waiting": "待命", "attacking": "进攻敌港", "guarding": "驻防", "resupply": "回港补给", "manual": "玩家指挥", "busy": "交战中", "lost": "已损失", "no-route": "无可达港口"][d] ?? d
    }
}

struct FleetRow: View {
    let map: WorldMap
    let fleet: GameState.Fleet
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "sailboat.fill").foregroundStyle(fleet.nation >= 0 && fleet.nation < map.meta.nations.count ? Names.color(map.meta.nations[fleet.nation].color) : Theme.ink2)
            VStack(alignment: .leading, spacing: 3) {
                Text(fleet.name).font(Theme.kai(18)).foregroundStyle(Theme.ink)
                Text("\(FleetText.status(fleet.status)) · \(FleetText.decision(fleet.decision))").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            }
            Spacer()
            Text("\(fleet.ships) 船 · \(fleet.crew) 人").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
    }
}

/// A stat on a memorial: the label, a large value and an optional gauge.
struct StatTile: View {
    let label: String
    let value: String
    var fraction: Double? = nil
    var warn = false
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            Text(value).font(Theme.kai(21)).foregroundStyle(warn ? Theme.seal : Theme.ink).lineLimit(1).minimumScaleFactor(0.6).monospacedDigit()
                .contentTransition(.numericText()).animation(.snappy, value: value)
            if let fraction {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.ink.opacity(0.1))
                        Capsule().fill(warn ? Theme.seal : Theme.ink.opacity(0.65)).frame(width: g.size.width * min(1, max(0, fraction)))
                    }
                }
                .frame(height: 4).animation(.spring(response: 0.5, dampingFraction: 0.85), value: fraction)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 10)
    }
}

/// A row of stat tiles in one memorial fold, split by hairlines.
struct StatStrip: View {
    let tiles: [StatTile]
    var body: some View {
        Group2 {
            HStack(spacing: 0) {
                ForEach(tiles.indices, id: \.self) { i in
                    if i > 0 { Rectangle().fill(Theme.ink.opacity(0.12)).frame(width: 0.8).padding(.vertical, 10) }
                    tiles[i]
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

struct FleetSheet: View {
    @State private var target = -1
    @State private var sending = false
    @State private var feedback = ""
    @State private var allPorts = false

    @ObservedObject var model: GameModel
    let fleet: Int
    /// Pick the port on the map instead of the list.
    var pickOnMap: () -> Void = {}
    var body: some View {
        if let map = model.map, let f = model.fleet(fleet) {
            let nation = f.nation >= 0 && f.nation < map.meta.nations.count ? map.meta.nations[f.nation] : nil
            let busy = f.decision == "busy" || f.status == "lost"
            // Ports this fleet may stay at: its own state's harbours (held by it), nearest first.
            let ports: [(port: GameState.Port, distance: Double)] = (model.state?.ports ?? []).filter { $0.occupier == f.nation && map.meta.provinces.indices.contains($0.province) }
                .map { (port: $0, distance: hypot(Double($0.x - f.x), Double($0.y - f.y))) }.sorted { $0.distance < $1.distance }
            let shown = allPorts ? ports : Array(ports.prefix(6))
            ScrollView {
                VStack(spacing: 14) {
                    SheetHeader(title: f.name, subtitle: nation.map { "\($0.name) · 舰队 · \(FleetText.status(f.status))" }, color: nation.map { Names.color($0.color) }, seal: "舟")
                    StatStrip(tiles: [
                        StatTile(label: "船只", value: "\(f.ships)"),
                        StatTile(label: "船员", value: Names.wan(f.crew)),
                        StatTile(label: "舰体", value: "\(Int((f.hull * 100).rounded()))%", fraction: f.hull, warn: f.hull < 0.35),
                        StatTile(label: "口粮", value: "\(f.food)", warn: f.food <= 0),
                    ])
                    Group2 {
                        Row(label: "指挥", value: f.manual || !f.patrol ? "玩家指挥" : "AI · " + FleetText.decision(f.decision)); Divider2()
                        if f.port >= 0, f.port < map.meta.provinces.count { Row(label: "停留港口", value: map.meta.provinces[f.port].name + "港"); Divider2() }
                        if !f.reason.isEmpty { Text(f.reason).font(Theme.kai(14)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 10) }
                    }
                    .padding(.horizontal, 16)

                    HStack {
                        Text("停留港口").font(Theme.kai(18)).foregroundStyle(Theme.ink)
                        Spacer()
                        Button(action: pickOnMap) { Label("地图选港", systemImage: "hand.tap").font(Theme.kai(14)).foregroundStyle(Theme.seal) }.buttonStyle(PressStyle()).disabled(busy)
                    }
                    .padding(.horizontal, 24)
                    Group2 {
                        if ports.isEmpty {
                            Text("本国没有可停留的港口").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 16)
                        }
                        ForEach(shown, id: \.port.province) { item in
                            let on = target == item.port.province
                            Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { target = on ? -1 : item.port.province } } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "anchor").font(.system(size: 14, weight: .semibold)).foregroundStyle(on ? Theme.seal : Theme.ink2).frame(width: 22)
                                    Text(map.meta.provinces[item.port.province].name + "港").font(Theme.kai(17)).foregroundStyle(Theme.ink)
                                    if item.port.province == f.port { Text("现泊").font(Theme.kai(12)).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.ink2, in: Capsule()) }
                                    Spacer()
                                    Text("\(Int(item.distance)) 里").font(Theme.kai(14)).foregroundStyle(Theme.ink2).monospacedDigit()
                                    Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Theme.seal : Theme.ink.opacity(0.25))
                                }
                                .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
                                .background(on ? Theme.seal.opacity(0.07) : .clear)
                            }
                            .buttonStyle(.plain)
                            if item.port.province != shown.last?.port.province { Divider2() }
                        }
                        if ports.count > 6 {
                            Divider2()
                            Button { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { allPorts.toggle() } } label: {
                                Text(allPorts ? "收起" : "展开全部 \(ports.count) 港").font(Theme.kai(15)).foregroundStyle(Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 10)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)

                    HStack(spacing: 10) {
                        Button {
                            sending = true
                            Task { feedback = await model.fleetOrder(id: f.id, province: target) ?? "起航，前往\(map.meta.provinces.indices.contains(target) ? map.meta.provinces[target].name : "")港"; sending = false; if feedback.hasPrefix("起航") { target = -1 } }
                        } label: { PrimaryLabel(title: "起航", symbol: "sailboat") }
                        .disabled(sending || target < 0 || busy).opacity(target < 0 || busy ? 0.5 : 1)
                        Button {
                            sending = true
                            Task { feedback = await model.fleetOrder(id: f.id, province: nil) ?? "舰队已下锚"; sending = false }
                        } label: { SecondaryLabel(title: "下锚停航", symbol: "stop.fill") }
                        .disabled(sending || busy).opacity(busy ? 0.5 : 1)
                    }
                    .buttonStyle(.plain).padding(.horizontal, 16)
                    .animation(.easeOut(duration: 0.2), value: target)
                    if !feedback.isEmpty {
                        Text(feedback).font(Theme.kai(14)).foregroundStyle(Theme.seal).transition(.opacity)
                    }
                    Text(busy ? "交战或撤退中的舰队不能改令" : "只能停留本国港口；目标须有连通海路").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                }
                .padding(.bottom, 24)
                .animation(.easeOut(duration: 0.25), value: feedback)
            }
        }
    }
}
