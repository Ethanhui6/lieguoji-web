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
    /// Backdrop behind the map. Follows the sea preset so the edges are not a different blue.
    static func seaColor(_ ocean: String) -> Color {
        let c = MapPalette.ocean(ocean).deep
        return Color(red: Double(c.r), green: Double(c.g), blue: Double(c.b))
    }
    static func kai(_ size: CGFloat) -> Font { .custom(fontName, size: size) }
}

enum Names {
    static let polity = ["Kingdom": "王国", "Empire": "帝国", "Federation": "联邦", "Republic": "共和国", "Tribal": "部落", "Theocracy": "神权"]
    /// The cultures of the catalog in its order (CULTURE_IDS47).
    static let cultureIds = ["chinese", "japanese", "english", "arab", "roman", "french", "german", "greek", "persian", "slavic", "norse", "indian", "korean", "mongol", "turkic", "egyptian", "spanish", "italian", "vietnamese", "tibetan", "hungarian", "polish", "portuguese", "dutch", "aztec", "inca"]
    static let culture = ["chinese": "中华", "japanese": "日本", "english": "英格兰", "arab": "阿拉伯", "roman": "罗马", "french": "法兰西",
                          "german": "日耳曼", "greek": "希腊", "persian": "波斯", "slavic": "斯拉夫", "norse": "北欧", "indian": "印度",
                          "korean": "朝鲜", "mongol": "蒙古", "turkic": "突厥", "egyptian": "埃及", "spanish": "西班牙", "italian": "意大利",
                          "vietnamese": "越南", "tibetan": "吐蕃", "hungarian": "匈牙利", "polish": "波兰", "portuguese": "葡萄牙", "dutch": "尼德兰", "aztec": "阿兹特克", "inca": "印加"]
    static let religion = ["none": "无指定宗教", "chineseFolk": "中国民间信仰", "daoism": "道教", "buddhism": "佛教", "shinto": "神道",
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
            EngineView(host: model.engine).frame(width: 1, height: 1).opacity(0.01).allowsHitTesting(false)
            if let map = model.map {
                MapView(map: map, controller: model.controller).id(model.worldID).ignoresSafeArea()
            }
            switch model.phase {
            case .splash: EmptyView()
            case .title: TitleView(model: model).transition(.opacity)
            case .generating: GeneratingView(note: model.generationNote).transition(.opacity)
            case .founding: FoundingView(controller: model.controller).transition(.opacity)
            case .playing: GameView(model: model).transition(.opacity)
            case .editing: if let ed = model.editor { EditorView(model: model, editor: ed).transition(.opacity) }
            }
            if model.phase == .splash { SplashView { finishSplash() }.transition(.opacity).zIndex(10) }
        }
        .animation(.easeInOut(duration: 0.45), value: model.phase)
        // Leaving the app saves (autosave runs only every 90 days).
        // Leaving pauses and saves; coming back reattaches to the computer if its link broke meanwhile.
        .onChange(of: scenePhase) { _, phase in
            if phase == .background, model.phase == .playing { model.pause(); model.save() }
            if phase == .active, model.phase == .playing { Task { if await model.native.lost { model.remoteLost() } } }
        }
        .task { GameFeel.shared.start() }
        .task {
            await model.loadBackdrop()
            // The world-building engine starts once the launch and the title reveal have played: starting
            // it during them made both stutter. 新世界 waits for it if pressed earlier.
            var waited = 0
            while (model.phase == .splash || model.controller.revealClock != nil) && waited < 60 { try? await Task.sleep(nanoseconds: 100_000_000); waited += 1 }
            try? await model.engine.start()
        }
        .sheet(isPresented: Binding(get: { model.failure != nil }, set: { if !$0 { model.failure = nil } })) {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(title: "出了点问题", subtitle: model.failure, seal: "误")
                SealButton(title: "知道了") { model.failure = nil }.padding(.horizontal, 22)
            }
            .padding(.bottom, 24)
            .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
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
        Task { @MainActor in await model.playReveal(duration: 3.2, while: { model.phase == .title }) }
    }
}

// MARK: - launch

/// The launch animation: a vermilion seal is stamped on the paper, the name appears beneath it.
struct SplashView: View {
    let done: () -> Void
    /// 夜幕山河: on an ink-dark ground a vermilion sun rises behind a globe's gold meridians drawing
    /// themselves; the title is brushed in top to bottom, the seal is pressed, then the dark lifts away
    /// to the world. Shapes and gradients only (no blur, no shadow), so it holds the frame rate while
    /// the backdrop world is being built.
    @State private var sun = false
    @State private var lines: CGFloat = 0
    @State private var written = 0
    @State private var stamped = false
    @State private var motto = false
    @State private var lifted = false
    static let title = ["列", "國", "紀"]
    static let night = Color(red: 0.085, green: 0.07, blue: 0.055)
    static let gold = Color(red: 0.82, green: 0.68, blue: 0.42)
    var body: some View {
        ZStack {
            Self.night.ignoresSafeArea()
            // The rising sun: a soft vermilion disc behind everything.
            Circle()
                .fill(RadialGradient(colors: [Theme.seal.opacity(0.9), Theme.seal.opacity(0.35), Theme.seal.opacity(0)], center: .center, startRadius: 10, endRadius: 190))
                .frame(width: 380, height: 380)
                .offset(y: sun ? -40 : 120).opacity(sun ? 1 : 0)
            // A globe: meridians and parallels in thin gold, drawing themselves.
            ZStack {
                ForEach(0..<5, id: \.self) { i in
                    Ellipse().trim(from: 0, to: lines).stroke(Self.gold.opacity(0.42 - Double(i) * 0.05), lineWidth: 0.9)
                        .frame(width: 280 - CGFloat(i) * 62, height: 280)
                }
                ForEach([-70, 0, 70], id: \.self) { y in
                    Capsule().fill(Self.gold.opacity(y == 0 ? 0.5 : 0.25))
                        .frame(width: (y == 0 ? 280 : 250) * lines, height: 0.9).offset(y: CGFloat(y))
                }
                Circle().trim(from: 0, to: lines).stroke(Self.gold.opacity(0.6), lineWidth: 1.2).frame(width: 280, height: 280).rotationEffect(.degrees(-90))
            }
            .rotationEffect(.degrees(lifted ? 8 : 0))
            // The title, brushed in from the top.
            VStack(spacing: 18) {
                VStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in
                        Text(Self.title[i]).font(Theme.kai(62)).foregroundStyle(Theme.paper)
                            .opacity(written > i ? 1 : 0).offset(y: written > i ? 0 : -14).scaleEffect(written > i ? 1 : 1.15)
                    }
                }
                SealMark(size: 38).rotationEffect(.degrees(-6))
                    .scaleEffect(stamped ? 1 : 2.2).opacity(stamped ? 1 : 0)
                Text("架空世界 · 列国兴衰").font(Theme.kai(14)).tracking(7).foregroundStyle(Self.gold)
                    .opacity(motto ? 1 : 0).offset(y: motto ? 0 : 8)
            }
        }
        .scaleEffect(lifted ? 1.08 : 1).opacity(lifted ? 0 : 1)
        .task {
            withAnimation(.easeOut(duration: 1.6)) { sun = true }
            withAnimation(.easeInOut(duration: 1.3)) { lines = 1 }
            try? await Task.sleep(nanoseconds: 380_000_000)
            for i in 1...3 {
                withAnimation(.spring(response: 0.42, dampingFraction: 0.8)) { written = i }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { stamped = true }
            GameFeel.shared.thud()
            withAnimation(.easeOut(duration: 0.5).delay(0.15)) { motto = true }
            try? await Task.sleep(nanoseconds: 1_050_000_000)
            withAnimation(.easeIn(duration: 0.45)) { lifted = true }
            try? await Task.sleep(nanoseconds: 380_000_000)
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
        ZStack {
            // Ink at the top, paper at the bottom: the title and the actions read over any world.
            LinearGradient(stops: [.init(color: SplashView.night.opacity(0.62), location: 0), .init(color: SplashView.night.opacity(0), location: 0.38),
                                   .init(color: Theme.paper.opacity(0), location: 0.52), .init(color: Theme.paper.opacity(0.94), location: 0.86)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea().allowsHitTesting(false)
            VStack(spacing: 0) {
                // The inscription: the title brushed top to bottom, the seal, and a line of the classics.
                HStack(alignment: .top, spacing: 14) {
                    VStack(spacing: 4) {
                        ForEach(Array(SplashView.title.enumerated()), id: \.offset) { i, ch in
                            Text(ch).font(Theme.kai(56)).foregroundStyle(Theme.paper)
                                .opacity(shown ? 1 : 0).offset(y: shown ? 0 : -12)
                                .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(Double(i) * 0.08), value: shown)
                        }
                    }
                    VStack(alignment: .center, spacing: 12) {
                        SealMark(size: 30).rotationEffect(.degrees(-6))
                        VerticalText(motto, size: 13).foregroundStyle(SplashView.gold)
                    }
                    .padding(.top, 8)
                    .opacity(shown ? 1 : 0).animation(.easeOut(duration: 0.6).delay(0.3), value: shown)
                    Spacer()
                }
                .padding(.leading, 26).padding(.top, 12)
                Spacer()
                VStack(spacing: 12) {
                    Text("架空世界 · 列国兴衰").font(Theme.kai(14)).tracking(6).foregroundStyle(Theme.ink2)
                    Button { creating = true } label: {
                        HeroAction(title: "开创新世界", detail: "生成山河 · 分封列国 · 自观兴衰", symbol: "globe.asia.australia")
                    }
                    .rise(shown, 0.05)
                    if model.hasSave {
                        Button { Task { await model.continueGame() } } label: {
                            HeroAction(title: "继续上次的世界", detail: "从最近的存档接着推演", symbol: "book.closed", primary: false)
                        }
                        .rise(shown, 0.1)
                    }
                    HStack(spacing: 10) {
                        Button { importing = true } label: { TileAction(title: "导入存档", symbol: "tray.and.arrow.down") }
                        Button { settings = true } label: { TileAction(title: "设置", symbol: "slider.horizontal.3") }
                        Button { notes = true } label: { TileAction(title: "更新", symbol: "sparkles") }
                    }
                    .rise(shown, 0.16)
                    Text(AppVersion.text).font(Theme.kai(11)).foregroundStyle(Theme.ink2.opacity(0.7)).padding(.top, 2)
                }
                .buttonStyle(PressStyle())
                .frame(maxWidth: 440)
                .padding(.horizontal, 22).padding(.bottom, 26)
            }
        }
        .onAppear { shown = false; withAnimation(.spring(response: 0.7, dampingFraction: 0.85).delay(model.controller.reveal < 1 ? 1.2 : 0.1)) { shown = true } }
        .onChange(of: model.tourTitle) { _, name in
            settings = name == "settings"
            creating = name == "new-world"
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data, .item]) { result in
            if case .success(let url) = result { Task { await model.importSave(from: url) } }
        }
        .sheet(isPresented: $creating) {
            NewWorldSheet(start: { options in creating = false; Task { await model.generate(options) } }, draw: { options in creating = false; model.openEditor(options) })
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $settings) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "设置", subtitle: AppVersion.text, seal: "设")
                    MapDisplaySettings(controller: model.controller)
                    SectionLabel("远程计算")
                    RemoteSettings(model: model)
                    SectionLabel("声音与触感")
                    FeelSettings()
                }
                .padding(.bottom, 24)
            }
            .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $notes) { ReleaseNotesSheet().presentationDetents([.large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden) }
    }
}

/// The title screen's main action: a vermilion seal plate (or a paper one) with an icon, a title and a
/// line of what it does.
struct HeroAction: View {
    let title: String; let detail: String; let symbol: String
    var primary = true
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol).font(.system(size: 22, weight: .medium))
                .foregroundStyle(primary ? Theme.seal : Theme.paper2)
                .frame(width: 46, height: 46)
                .background(primary ? Theme.paper2 : Theme.seal, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(Theme.kai(21)).foregroundStyle(primary ? Theme.paper2 : Theme.ink)
                Text(detail).font(Theme.kai(12)).foregroundStyle(primary ? Theme.paper2.opacity(0.8) : Theme.ink2).lineLimit(1)
            }
            Spacer(minLength: 6)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(primary ? Theme.paper2.opacity(0.8) : Theme.ink2)
        }
        .padding(.horizontal, 14).frame(height: 74)
        .background((primary ? Theme.seal : Theme.paper2), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        // A seal's inner rule.
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(primary ? Theme.paper2.opacity(0.35) : Theme.seal.opacity(0.18), lineWidth: 0.8).padding(4))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(primary ? Color.clear : Theme.line))
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// A small square action under the main ones: icon over a word.
struct TileAction: View {
    let title: String; let symbol: String
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 18, weight: .medium)).foregroundStyle(Theme.seal)
            Text(title).font(Theme.kai(14)).foregroundStyle(Theme.ink)
        }
        .frame(maxWidth: .infinity).frame(height: 64)
        .background(Theme.paper2.opacity(0.95), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.line))
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

extension View {
    /// Rises into place after `delay` once `on` turns true.
    func rise(_ on: Bool, _ delay: Double) -> some View {
        opacity(on ? 1 : 0).offset(y: on ? 0 : 24)
            .animation(.spring(response: 0.55, dampingFraction: 0.82).delay(delay), value: on)
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
        GameActionLabel(title: title, symbol: symbol).font(Theme.kai(18)).frame(maxWidth: .infinity).frame(minHeight: 54).padding(.horizontal, 10)
            .foregroundStyle(Theme.paper2).background(Theme.seal, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
struct SecondaryLabel: View {
    let title: String; let symbol: String
    var body: some View {
        GameActionLabel(title: title, symbol: symbol).font(Theme.kai(18)).frame(maxWidth: .infinity).frame(minHeight: 54).padding(.horizontal, 10)
            .foregroundStyle(Theme.ink).background(Theme.paper2.opacity(0.9), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.line))
    }
}

/// 生成地图: the original's terrain templates and the number of states.
struct NewWorldSheet: View {
    let start: (GameModel.NewWorld) -> Void
    /// 自绘地图 with these options.
    var draw: ((GameModel.NewWorld) -> Void)? = nil
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
            PaperStepper(title: "省份", value: Binding(get: { options.provinceCount }, set: { options.provinces = String($0) }), range: options.nations...480, unit: "省")
            Text("每省一城，按地形均分大小；实际生成 \(options.provinceCount) 省。").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            HStack {
                Text("种子").font(Theme.kai(17)).foregroundStyle(Theme.ink2)
                Spacer()
                TextField("", text: $options.seed, prompt: Text("随机").foregroundColor(Theme.ink2.opacity(0.6)))
                    .paperField(width: 160).keyboardType(.numberPad).multilineTextAlignment(.trailing)
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
                    Text("文化集").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
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
                Text("各国从所选文化中取名、取宗教与政体。宗教跟着文化走，这里没有单独的宗教集。").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                Text("生成只接受种子、地形、国家数、省份数、开局和平或开战、文化集和命名。雪原、沙漠、战争规则的新游戏偏好，以及高度图二万、三万、四万格，生成接口都不接收，所以这里不放空开关。高度图固定为二万格。").font(Theme.kai(13)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
            }
            Button { start(options) } label: { PrimaryLabel(title: "生成地图", symbol: "wand.and.stars") }.buttonStyle(PressStyle()).padding(.top, 6)
            if let draw {
                Button { draw(options) } label: { SecondaryLabel(title: "自己绘制地图", symbol: "paintbrush.pointed") }.buttonStyle(PressStyle())
                Text("以所选地形为底图，亲手画山川、海陆，再划分州郡与列国。").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            }
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
    case province(Int), army(Int), fleet(Int), nation(Int), people(Int), nationWars(Int), nationTalks(Int), nations, military, diplomacy, chronicle, menu, statistics, edicts
    var id: String {
        switch self {
        case .province(let p): return "p\(p)"
        case .army(let a): return "a\(a)"
        case .fleet(let f): return "f\(f)"
        case .nation(let n): return "n\(n)"
        case .people(let n): return "people\(n)"
        case .nationWars(let n): return "wars\(n)"
        case .nationTalks(let n): return "talks\(n)"
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
        case .people: return "人物"
        case .nationWars: return "战争"
        case .nationTalks: return "外交"
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
        case .nations, .nation, .people, .nationWars, .nationTalks: return "nations"
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
    /// 壁纸模式: the controls hide and the map drifts; a tap anywhere returns.
    @State private var wallpaper = false
    /// The pending map pick is a retreat (原作防御模式) rather than a march.
    @State private var marchRetreat = false
    @State private var rtsDefend = false
    /// The unit sheets' height; a pick from a list drops it low so the map shows the unit.
    @State private var unitDetent: PresentationDetent = .height(320)
    /// Nation pages stay under about 40% so the map keeps at least 60% of the screen.
    @State private var nationDetent: PresentationDetent = .fraction(0.38)
    /// The world was paused by a big panel and resumes when it closes.
    @State private var pausedByPanel = false
    @Namespace private var tabMarker
    init(model: GameModel) { self.model = model; _controller = ObservedObject(wrappedValue: model.controller) }

    var body: some View {
        ZStack {
            Color.clear
        }
        .task {
            guard ShotTour.on else { return }
            await ShotTour.play(model, show: { p in
                if case .people = p { nationDetent = .large }
                if let p { show(p) } else { panel = nil }
            }, views: { viewsOpen = $0 })
        }
        .overlay(alignment: .top) {
            VStack(spacing: 8) {
                topBar
                if controller.marchingArmy != nil { marchBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if controller.marchingFleet != nil { fleetBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if controller.paintNation != nil { paintBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if !controller.groupArmies.isEmpty { rtsBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if let h = model.herald, let map = model.map {
                    // Slides down and fades like the other top banners (调兵、绘制、即时战略).
                    HeraldBanner(herald: h, map: map).id(h.id)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.4, dampingFraction: 0.85), value: model.herald)
                .offset(y: controller.reveal >= 1 ? 0 : -80)
                .opacity(wallpaper ? 0 : 1).allowsHitTesting(!wallpaper)
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: controller.marchingArmy)
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: controller.marchingFleet)
                .animation(.spring(response: 0.4, dampingFraction: 0.85), value: controller.paintNation)
        }
        .overlay(alignment: .bottom) { bottomBar.offset(y: controller.reveal >= 1 ? 0 : 120).opacity(wallpaper ? 0 : 1).allowsHitTesting(!wallpaper) }
        .overlay {
            if wallpaper {
                Color.clear.contentShape(Rectangle()).ignoresSafeArea()
                    .onTapGesture { withAnimation(.easeInOut(duration: 0.5)) { wallpaper = false }; controller.drifting = false }
                    .overlay(alignment: .bottom) { Text("轻点返回").font(Theme.kai(13)).foregroundStyle(Theme.paper2.opacity(0.7)).padding(.bottom, 30) }
            }
        }
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
                guard let n = controller.paintNation, model.state?.owners.indices.contains(province) == true else { return }
                if controller.placingArmy {
                    guard !controller.placementBusy else { return }
                    controller.placementBusy = true
                    Task {
                        let error = await model.addArmy(n, province: province)
                        controller.placementBusy = false
                        say(error ?? "新军已在所选州郡集结")
                    }
                    return
                }
                guard model.state?.owners[province] != n else { return }
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
        .onChange(of: panel) { old, p in
            if let p { lastPanel = p }
            // All inspection pages share one pause policy, including map picks.
            controller.sheetOpen = p != nil
            if p != nil, model.playing { pausedByPanel = true; model.pause(saving: false) }
            if p == nil, pausedByPanel { pausedByPanel = false; model.play() }
            _ = old
        }
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
                    .presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(28).font(Theme.kai(17))
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
            ProvinceSheet(model: model, province: p, openNation: { n in nationDetent = .fraction(0.38); open(.nation(n)) }, openArmy: { a in unitDetent = .height(320); open(.army(a)); controller.selectedArmy = a; locate(army: a) }).presentationDetents([.height(300), .medium, .large]).presentationBackgroundInteraction(.enabled(upThrough: .medium))
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
                controller.placingArmy = false; controller.paintNation = n; self.panel = nil
                say("绘制疆域：点选或用一指拖过州郡，划入\(model.map?.meta.nations.indices.contains(n) == true ? model.map!.meta.nations[n].name : "")；两指移动地图")
            }, placeArmy: { n in
                controller.marchingArmy = nil; controller.marchingFleet = nil; controller.groupArmies = []
                controller.placingArmy = true; controller.paintNation = n; self.panel = nil
                say("点选本国州郡放置新军；拖动移动地图，点完成退出。征募仍受游戏规则约束。")
            }, openArmy: { a in open(.army(a)) }, openPeople: { nationDetent = .fraction(0.38); open(.people(n)) }, openWars: { nationDetent = .fraction(0.38); open(.nationWars(n)) }, openTalks: { nationDetent = .fraction(0.38); open(.nationTalks(n)) })
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.38)))
        case .people(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, focus: .people)
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.38)))
        case .nationWars(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, focus: .wars)
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.38)))
        case .nationTalks(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, focus: .talks)
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.38)))
        case .edicts:
            EdictSheet(model: model, say: say).presentationDetents([.medium, .large])
        case .statistics:
            StatisticsSheet(model: model) { n in nationDetent = .fraction(0.38); open(.nation(n)) }.presentationDetents([.medium, .large]).presentationBackground(.clear)
        case .nations:
            NationsSheet(model: model) { n in nationDetent = .fraction(0.38); open(.nation(n)) }.presentationDetents([.medium, .large])
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
            MenuSheet(model: model, controller: controller, openEdicts: { open(.edicts) },
                      wallpaper: { self.panel = nil; withAnimation(.easeInOut(duration: 0.6)) { wallpaper = true }; controller.drifting = true }, say: say) { self.panel = nil }.presentationDetents([.medium, .large])
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
                    .lineLimit(1).minimumScaleFactor(0.7).fixedSize(horizontal: true, vertical: false)
                    .contentTransition(.numericText()).animation(.snappy(duration: 0.25), value: model.state?.dateText)
                if let wars = model.state?.wars.count, wars > 0 {
                    HStack(spacing: 3) { Circle().fill(Theme.seal).frame(width: 6, height: 6); Text("\(wars)场战争").font(Theme.kai(13)).foregroundStyle(Theme.seal).lineLimit(1).fixedSize() }
                }
                // 远程计算: the computer simulates.
                if model.remoteAddress != nil {
                    Image(systemName: "desktopcomputer").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.jade)
                        .transition(.scale.combined(with: .opacity))
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
            Text(controller.placingArmy ? "为\(nation?.name ?? "")放置新军" : "绘制\(nation?.name ?? "")疆域").font(Theme.kai(16)).foregroundStyle(Theme.ink)
            Button("完成") { controller.paintNation = nil; controller.placingArmy = false }.font(Theme.kai(16)).foregroundStyle(Theme.seal)
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
            EventTicker(latest: model.state?.events.last?.text) { show(.chronicle) }
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
        .padding(.horizontal, 12).padding(.bottom, 4)
    }
}

extension View {
    /// Frosted glass with a hairline, the iOS 17 floating-control look.
    /// Floating chrome (date, buttons, tab bar, notices) in the panels' own paper: the ink rule and
    /// the faint vermilion inner rule of Group2, so the map's controls and the pages read as one set.
    func glass<S: Shape>(_ shape: S) -> some View {
        // The shadow belongs to the plain shape behind the content (a path shadow), not to the whole
        // panel: over a map that redraws every frame, a view shadow cost an offscreen pass each frame.
        background(shape.fill(Theme.paper2.opacity(0.97)).shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.16), radius: 12, y: 4))
            .overlay(shape.stroke(Theme.ink.opacity(0.2), lineWidth: 1))
            .overlay(shape.stroke(Theme.seal.opacity(0.16), lineWidth: 0.6).padding(3))
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ViewBuilder let content: Content
    @State private var unfolded = false
    var body: some View {
        VStack(spacing: 0) { content }
            .background(Theme.paper2.opacity(0.62), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.2), lineWidth: 1))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.seal.opacity(0.16), lineWidth: 0.6).padding(3))
            .shadow(color: Color(red: 0.25, green: 0.18, blue: 0.08).opacity(0.08), radius: 6, y: 2)
            .scaleEffect(x: 1, y: unfolded ? 1 : 0.94, anchor: .top).opacity(unfolded ? 1 : 0)
            .onAppear { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { unfolded = true } }
    }
}

/// A docket line: label, a dotted leader, the value.
struct Row: View {
    let label: String; let value: String
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                GlyphLabel(text: label).foregroundStyle(Theme.ink2).fixedSize()
                Spacer(minLength: 12)
                Text(value).foregroundStyle(Theme.ink).monospacedDigit().fixedSize()
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(label).foregroundStyle(Theme.ink2)
                Text(value).foregroundStyle(Theme.ink).monospacedDigit().fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(Theme.kai(17)).frame(minHeight: 22).padding(.horizontal, 16).padding(.vertical, 12)
        .accessibilityElement(children: .combine)
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
    @State private var pickingGood = false
    @State private var pickingCulture = false
    @State private var region: RegionInfo?
    @State private var regionActions = false
    @State private var renamingRegion = false
    @State private var regionName = ""
    var body: some View {
        if let map = model.map {
            let p = map.meta.provinces[province]
            let owner = model.state.flatMap { $0.owners.indices.contains(province) ? $0.owners[province] : nil } ?? p.nation
            let nation = owner >= 0 && owner < map.meta.nations.count ? map.meta.nations[owner] : nil
            let armies = model.state?.armies.enumerated().filter { $0.element.province == province } ?? []
            ScrollView {
                VStack(spacing: 14) {
                    SheetHeader(title: p.name, subtitle: nation.map { "\($0.name) · \(Self.terrainLine(info, p.terrain))" } ?? Self.terrainLine(info, p.terrain), color: nation.map { Names.color($0.color) })
                    if let info {
                        // 州郡属性: core or frontier, mountain, fortress, rich, granary, well governed.
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(Array(info.kinds.enumerated()), id: \.offset) { _, k in
                                    VStack(spacing: 2) {
                                        Text(k.0).font(Theme.kai(15)).foregroundStyle(Theme.paper2)
                                            .padding(.horizontal, 10).padding(.vertical, 4).background(k.0 == "边地" ? Theme.ink2 : Theme.seal, in: RoundedRectangle(cornerRadius: 5))
                                        Text(k.1).font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                                    }
                                }
                            }
                            .padding(.horizontal, 22)
                        }
                        if let arms = info.combat, !arms.isEmpty {
                            // 地利: how this land favours each arm (attacking into it / holding it).
                            Group2 {
                                HStack {
                                    Text("地利").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                                    Spacer()
                                    Text("进攻").font(Theme.kai(13)).foregroundStyle(Theme.ink2).frame(width: 58, alignment: .trailing)
                                    Text("防守").font(Theme.kai(13)).foregroundStyle(Theme.ink2).frame(width: 58, alignment: .trailing)
                                }
                                .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 4)
                                ForEach(arms.indices, id: \.self) { i in
                                    HStack {
                                        Text(arms[i].unit).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                                        Spacer()
                                        Self.percent(arms[i].attack).frame(width: 58, alignment: .trailing)
                                        Self.percent(arms[i].defense).frame(width: 58, alignment: .trailing)
                                    }
                                    .padding(.horizontal, 16).padding(.vertical, 5)
                                }
                                Spacer(minLength: 6)
                            }
                            .padding(.horizontal, 16)
                        }
                        ProvinceWarView(info: info, owner: owner, state: model.state, map: map)
                    }
                    Group2 {
                        if let info {
                            Row(label: "人口", value: info.population.formatted()); Divider2()
                            Row(label: "人口上限", value: info.capacity.formatted()); Divider2()
                            Row(label: "存粮", value: Int(info.grain).formatted()); Divider2()
                            if let good = info.specialty {
                                Button { pickingGood = true } label: {
                                    HStack { Text("特产").foregroundStyle(Theme.ink2); Spacer(); Text(good).foregroundStyle(Theme.ink); Image(systemName: "pencil").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.seal.opacity(0.7)) }
                                        .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .confirmationDialog("特产", isPresented: $pickingGood, titleVisibility: .visible) {
                                    ForEach(Array(Trade.goods.enumerated()), id: \.offset) { i, n in
                                        Button(n) { Task { _ = await model.setSpecialty(province, i); self.info = await model.provinceInfo(province) } }
                                    }
                                    Button("恢复本地特产") { Task { _ = await model.setSpecialty(province, nil); self.info = await model.provinceInfo(province) } }
                                }
                                Divider2()
                            }
                            if let g = region {
                                Button { regionActions = true } label: {
                                    HStack { Text("区域").foregroundStyle(Theme.ink2); Spacer(); Text("\(g.name) · \(g.provinces.count)州 · \(Names.wan(Int(g.population)))人").foregroundStyle(Theme.ink).lineLimit(1); Image(systemName: "pencil").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.seal.opacity(0.7)) }
                                        .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .confirmationDialog(g.name, isPresented: $regionActions, titleVisibility: .visible) {
                                    Button("区域更名") { regionName = g.name; renamingRegion = true }
                                    if g.center != province { Button("设为区域中心") { Task { _ = await model.setRegionCenter(province); region = await model.regionInfo(province) } } }
                                }
                                .sheet(isPresented: $renamingRegion) {
                                    VStack(alignment: .leading, spacing: 14) {
                                        SheetHeader(title: "区域更名", subtitle: "现名 \(g.name)", seal: "改")
                                        TextField("", text: $regionName).paperField().padding(.horizontal, 22)
                                        SealButton(title: "颁行", disabled: regionName.trimmingCharacters(in: .whitespaces).isEmpty) {
                                            renamingRegion = false
                                            Task { _ = await model.renameRegion(province, regionName); region = await model.regionInfo(province) }
                                        }
                                        .padding(.horizontal, 22)
                                    }
                                    .padding(.bottom, 16)
                                    .presentationDetents([.height(280)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
                                }
                                Divider2()
                            }
                            Button { pickingCulture = true } label: {
                                HStack { Text("本地文化").foregroundStyle(Theme.ink2); Spacer(); Text(Names.culture[info.cityCulture ?? ""] ?? info.cityCulture ?? "—").foregroundStyle(Theme.ink); Image(systemName: "pencil").font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.seal.opacity(0.7)) }
                                    .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .confirmationDialog("本地文化", isPresented: $pickingCulture, titleVisibility: .visible) {
                                ForEach(Names.culture.keys.sorted(), id: \.self) { k in
                                    Button(Names.culture[k] ?? k) { Task { _ = await model.setCityCulture(province, k); self.info = await model.provinceInfo(province) } }
                                }
                            }
                            Divider2()
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
                            GeometryReader { g in
                                let filled = min(1, max(0, siege.progress))
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Theme.ink.opacity(0.08))
                                    Capsule().fill(Theme.seal).frame(width: g.size.width * filled)
                                }
                            }
                            .frame(height: 6).padding(.horizontal, 16).padding(.bottom, 14)
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
            .task(id: model.state?.day) { info = await model.provinceInfo(province); if region == nil { region = await model.regionInfo(province) } }
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
                                    Task { _ = await model.grant(province: province, to: t); self.info = await model.provinceInfo(province) }
                                } label: { Label("确认划入", systemImage: "paintbrush.pointed.fill").font(Theme.kai(18)).frame(maxWidth: .infinity).padding(.vertical, 13).foregroundStyle(grantTarget < 0 ? Theme.ink2 : Theme.seal) }
                                .buttonStyle(.plain).disabled(grantTarget < 0)
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.bottom, 24)
                }
                .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
            }
        }
    }
}

extension ProvinceSheet {
    /// Subtitle uses the same land name as the tags. The coarse plain/forest/mountain field can
    /// disagree with the biome (平原 beside 热带雨林); the tag wins once the province is loaded.
    static func terrainLine(_ info: ProvinceInfo?, _ stored: String) -> String {
        if info?.mountain == true { return "山地" }
        if let name = info?.terrain, !name.isEmpty { return name }
        return Names.terrain[stored] ?? stored
    }
    /// A terrain multiplier as a signed percent: seal red when it helps, faded when it hurts.
    static func percent(_ v: Double) -> some View {
        let p = Int(((v - 1) * 100).rounded())
        return Text(p == 0 ? "—" : (p > 0 ? "+\(p)%" : "\(p)%")).font(Theme.kai(15)).monospacedDigit()
            .foregroundStyle(p > 0 ? Theme.seal : p < 0 ? Theme.ink2 : Theme.ink)
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
                HStack(spacing: 6) {
                    Text(army.name).font(Theme.kai(18)).foregroundStyle(Theme.ink).lineLimit(1)
                    Text(Echelon.name(troops: army.troops, culture: map.meta.nations.indices.contains(army.nation) ? map.meta.nations[army.nation].culture : ""))
                        .font(Theme.kai(12)).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.ink2, in: Capsule())
                }
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
    @State private var merging = false
    @State private var renaming = false
    @State private var disbanding = false
    @State private var newName = ""
    @State private var troopsText = ""
    @State private var unit = ""
    @State private var morale = 100.0
    static let units = UnitKinds.kinds.map { ($0.key, $0.name) }
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
                                Text("\(nation?.name ?? "") · \(model.state.map { Echelon.designation($0, map, army: army) } ?? "") · \(Names.unit[a.unit] ?? a.unit)").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                            }
                        }
                        Spacer()
                        Button(action: locate) { InkIcon(glyph: .views, size: 20).foregroundStyle(Theme.seal).frame(width: 40, height: 40).background(Theme.seal.opacity(0.08), in: Circle()) }
                            .buttonStyle(PressStyle()).accessibilityLabel("定位")
                    }
                    .padding(.horizontal, 22).padding(.top, 22)
                    // The arm's strengths and weaknesses, and who leads it.
                    VStack(alignment: .leading, spacing: 4) {
                        if let k = UnitKinds.byKey[a.unit] { Text(k.note).font(Theme.kai(14)).foregroundStyle(Theme.ink2) }
                        if let c = a.commander { Text(a.banner == "ruler" ? "御驾亲征：\(c)" : "主将：\(c)").font(Theme.kai(14)).foregroundStyle(a.banner == "ruler" ? Theme.seal : Theme.ink) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 22)
                    StatStrip(tiles: [
                        StatTile(label: "编制", value: Echelon.name(troops: a.troops, culture: nation?.culture ?? "")),
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
                    // 军令: command, stance and the army's own changes, in one grid of paper chips.
                    let peers = (model.state?.armies ?? []).enumerated().filter { $0.offset != army && $0.element.nation == a.nation && $0.element.province == a.province && $0.element.province >= 0 && $0.element.status != "fighting" }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                        ArmyChip(title: a.manual ? "交还AI" : "亲自指挥", symbol: a.manual ? "cpu" : "person.fill") { act("armyManual", a, flag: !a.manual) }
                        ArmyChip(title: "驻守", symbol: "flag.fill") { act("holdArmy", a) }
                        ArmyChip(title: "回师", symbol: "house.fill") { act("returnHome", a) }
                        ArmyChip(title: "补员", symbol: "person.3.fill", disabled: fighting) { act("reinforceArmy", a) }
                        ArmyChip(title: "分兵", symbol: "arrow.triangle.branch", disabled: fighting || a.troops < 400) { act("splitArmy", a) }
                        ArmyChip(title: "合兵", symbol: "arrow.triangle.merge", disabled: fighting || peers.isEmpty) { merging = true }
                        ArmyChip(title: "改名", symbol: "pencil") { newName = a.name; renaming = true }
                        ArmyChip(title: "解散", symbol: "xmark.circle", disabled: fighting, danger: true) { disbanding = true }
                    }
                    .padding(.horizontal, 16)
                    .confirmationDialog("解散\(a.name)？", isPresented: $disbanding, titleVisibility: .visible) {
                        Button("解散（\(a.troops) 人回乡）", role: .destructive) { act("disbandArmy", a) }
                    }
                    .sheet(isPresented: $merging) {
                        VStack(alignment: .leading, spacing: 12) {
                            SheetHeader(title: "合兵", subtitle: "\(a.name)并入同州郡的本国军队", seal: "合")
                            Group2 {
                                ForEach(peers, id: \.element.id) { p in
                                    Button { merging = false; act("mergeArmy", a, text: p.element.id) } label: {
                                        HStack { Text(p.element.name).font(Theme.kai(17)).foregroundStyle(Theme.ink); Spacer(); Text("\(Names.wan(p.element.troops)) 兵").font(Theme.kai(14)).foregroundStyle(Theme.ink2) }
                                            .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    if p.element.id != peers.last?.element.id { Divider2() }
                                }
                            }
                            .padding(.horizontal, 16)
                            Spacer(minLength: 0)
                        }
                        .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
                    }
                    .sheet(isPresented: $renaming) {
                        VStack(alignment: .leading, spacing: 14) {
                            SheetHeader(title: "军队更名", subtitle: "现名 \(a.name)", seal: "改")
                            TextField("", text: $newName).paperField().padding(.horizontal, 22)
                            SealButton(title: "颁行", disabled: newName.trimmingCharacters(in: .whitespaces).isEmpty) { renaming = false; act("renameArmy", a, text: newName) }
                                .padding(.horizontal, 22)
                        }
                        .padding(.bottom, 16)
                        .presentationDetents([.height(280)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
                    }
                    ArmyServiceView(model: model, army: a)
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
                            UnitGrid(selection: $unit).padding(.horizontal, 12).padding(.vertical, 10)
                            Divider2()
                            PaperSlider(title: "士气", value: $morale, range: 0...100, step: 1) { "\(Int($0))" }
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
    /// Runs one army order and says what happened.
    private func act(_ action: String, _ a: GameState.Army, text: String = "", flag: Bool = false) {
        Task {
            let out = await model.armyAction(action, armyId: a.id, text: text, flag: flag)
            say(out.message); GameFeel.shared.notify(out.ok ? .success : .error)
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
    var body: some View {
        Group {
            if let img = UnitArt.tinted(unit, UIColor(color), side: 96) { Image(uiImage: img).resizable().scaledToFit() }
            else { InkIcon(glyph: .military).foregroundStyle(color) }
        }
        .padding(6)
        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(color.opacity(0.6), lineWidth: 1.2))
    }
}

struct NationsSheet: View {
    @State private var search = ""
    @State private var livingOnly = true
    @ObservedObject var model: GameModel
    let select: (Int) -> Void
    var body: some View {
        if let map = model.map, let state = model.state {
            // A state just founded may not be in the map legend yet: list only the ones it has.
            let order = state.nations.indices.filter { $0 < map.meta.nations.count && (!livingOnly || state.nations[$0].alive) && (search.isEmpty || map.meta.nations[$0].name.localizedCaseInsensitiveContains(search)) }.sorted { state.nations[$0].provinces > state.nations[$1].provinces }
            ScrollView {
                LazyVStack(spacing: 14) {
                    SheetHeader(title: "国家", subtitle: "\(state.nations.filter(\.alive).count) 国并立")
                    VStack(spacing: 10) {
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink2)
                            TextField("", text: $search, prompt: Text("搜索国名").foregroundColor(Theme.ink2.opacity(0.6)))
                        }
                        .paperField()
                        ChipPicker(items: [(true, "现存"), (false, "全部（含已亡）")], selection: $livingOnly)
                        if order.isEmpty { Text("没有符合条件的国家").foregroundStyle(Theme.ink2) }
                    }.padding(.horizontal, 16)
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
    @State private var filter = "all"
    @ObservedObject var model: GameModel
    let select: (Int) -> Void
    var selectFleet: (Int) -> Void = { _ in }
    var body: some View {
        if let map = model.map, let state = model.state {
            // Armies by state, built lazily as the list scrolls (hundreds of rows made opening slow).
            let byNation = Dictionary(grouping: state.armies.indices.filter { filter == "navy" ? false : filter == "all" || (filter == "manual" ? state.armies[$0].manual : state.armies[$0].status == "fighting" || state.armies[$0].status == "sieging") }, by: { state.armies[$0].nation })
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "军事", subtitle: "\(state.armies.count) 支军队" + ((state.fleets ?? []).isEmpty ? "" : " · \(state.fleets!.count) 支舰队"))
                    ChipPicker(items: [("all", "全部"), ("battle", "交战围城"), ("manual", "亲自指挥"), ("navy", "舰队")], selection: $filter).padding(.horizontal, 16)
                    if byNation.isEmpty && filter != "navy" { Text("暂无符合条件的陆军").font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(.horizontal, 22) }
                    ForEach(state.nations.indices, id: \.self) { n in
                        let rows = (byNation[n] ?? []).sorted { state.armies[$0].troops > state.armies[$1].troops }
                        if !rows.isEmpty {
                            HStack {
                                NationChip(map: map, nation: n)
                                Spacer()
                                Text("\(rows.count) 支 · \(Names.wan(rows.reduce(0) { $0 + state.armies[$1].troops })) 兵").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                            }
                            .padding(.horizontal, 22)
                            Group2 {
                                ForEach(rows, id: \.self) { i in
                                    Button { select(i) } label: { ArmyRow(map: map, army: state.armies[i]) }.buttonStyle(.plain)
                                    if i != rows.last { Divider2() }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                    if filter == "all" || filter == "navy", let fleets = state.fleets, !fleets.isEmpty {
                        SectionLabel("舰队")
                        Group2 {
                            ForEach(fleets.indices, id: \.self) { i in
                                Button { selectFleet(i) } label: { FleetRow(map: map, fleet: fleets[i]) }.buttonStyle(.plain)
                                if i != fleets.indices.last { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    if filter == "all" || filter == "navy", let yards = state.yards, !yards.isEmpty {
                        SectionLabel("船坞")
                        Group2 {
                            ForEach(yards.indices, id: \.self) { i in
                                let y = yards[i]
                                HStack {
                                    Text(y.name).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                                    Spacer()
                                    Text(map.meta.nations.indices.contains(y.nation) ? map.meta.nations[y.nation].name : "").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                                    Text("重建中 · 还需 \(Int(y.months)) 月").font(Theme.kai(14)).foregroundStyle(Theme.seal)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                if i != yards.indices.last { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 24)
            }
        }
    }
}

/// 战况: the two sides' field troops as one bar in their colours, the land each side holds of the
/// other's (sieges won), and how long the war has run.
struct WarBalance: View {
    let map: WorldMap; let state: GameState; let war: GameState.War
    var body: some View {
        let attackerSide = war.participants.first { $0.nation == war.attacker }?.side
        let a = Set(war.participants.filter { $0.side == attackerSide }.map(\.nation)).union([war.attacker])
        let d = Set(war.participants.filter { $0.side != attackerSide }.map(\.nation)).union([war.defender]).subtracting(a)
        let at = state.armies.reduce(0) { a.contains($1.nation) ? $0 + $1.troops : $0 }
        let dt = state.armies.reduce(0) { d.contains($1.nation) ? $0 + $1.troops : $0 }
        let share = at + dt > 0 ? Double(at) / Double(at + dt) : 0.5
        let days = max(0, state.day - war.startDay)
        let sieges = state.sieges.filter { s in (a.contains(s.nation) || d.contains(s.nation)) }.count
        VStack(alignment: .leading, spacing: 5) {
            GeometryReader { g in
                HStack(spacing: 0) {
                    Rectangle().fill(color(war.attacker)).frame(width: max(2, g.size.width * share))
                    Rectangle().fill(color(war.defender))
                }
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Theme.ink.opacity(0.25), lineWidth: 0.8))
            }
            .frame(height: 8)
            .animation(.easeOut(duration: 0.4), value: share)
            HStack {
                Text("\(Names.wan(at)) 兵").font(Theme.kai(13)).foregroundStyle(Theme.ink)
                Spacer()
                Text((days >= 360 ? "历时 \(days / 360) 年 \(days % 360 / 30) 月" : "历时 \(max(1, days / 30)) 月") + (sieges > 0 ? " · 围城 \(sieges)" : ""))
                    .font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                Spacer()
                Text("\(Names.wan(dt)) 兵").font(Theme.kai(13)).foregroundStyle(Theme.ink)
            }
            .monospacedDigit()
        }
    }
    private func color(_ n: Int) -> Color { n >= 0 && n < map.meta.nations.count ? Names.color(map.meta.nations[n].color) : Theme.ink2 }
}

/// One state's standing (engine diplomacyInfo).
/// The newest chronicle line above the tab bar. Each line stays at least 1.6 seconds; lines that
/// arrive meanwhile are skipped to the latest, so fast play no longer slides a new line in every step.
struct EventTicker: View {
    let latest: String?
    let open: () -> Void
    @State private var shown: String?
    @State private var changed = Date.distantPast
    @State private var pending: Task<Void, Never>?
    var body: some View {
        VStack {
            if let text = shown {
                Button(action: open) {
                    Text(text).font(Theme.kai(14)).foregroundStyle(Theme.ink).lineLimit(1)
                        .padding(.horizontal, 14).frame(height: 32).glass(Capsule())
                }
                .buttonStyle(.plain).padding(.horizontal, 30)
                .id(text).transition(.push(from: .bottom))
            }
        }
        .onAppear { shown = latest; changed = Date() }
        .onChange(of: latest) { _, next in
            pending?.cancel()
            let wait = 1.6 - Date().timeIntervalSince(changed)
            if wait <= 0 { show(next) }
            else { pending = Task { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)); if !Task.isCancelled { show(next) } } }
        }
    }
    private func show(_ text: String?) {
        guard text != shown else { return }
        withAnimation(.easeOut(duration: 0.3)) { shown = text }
        changed = Date()
    }
}

struct DiplomacyOverview: Decodable {
    struct Pact: Decodable { let nation: Int; let kind: String; let months: Int }
    struct Truce: Decodable { let nation: Int; let days: Int }
    struct Neighbor: Decodable { let nation: Int; let troops: Int }
    let allies: [Int]; let overlord: Int?; let vassals: [Int]; let pacts: [Pact]; let truces: [Truce]; let enemies: [Int]; let neighbors: [Neighbor]; let troops: Int
}

/// 邦交总览: the chosen state's allies, overlord and vassals, treaties, truces, wars and neighbours.
struct DiplomacyOverviewView: View {
    @ObservedObject var model: GameModel
    let map: WorldMap; let nation: Int; let day: Int; let troops: Int
    @State private var info: DiplomacyOverview?
    var body: some View {
        Group2 {
            if let info {
                row("盟友", info.allies, empty: "无同盟")
                Divider2()
                if let lord = info.overlord { row("宗主", [lord], empty: ""); Divider2() }
                row("附庸", info.vassals, empty: "无附庸")
                Divider2()
                row("交战", info.enemies, empty: "无战事", warn: true)
                Divider2()
                labeled("条约", info.pacts.isEmpty ? [] : info.pacts.map { ($0.nation, ($0.kind == "marriage" ? "联姻" : "互不侵犯") + " · 余 \($0.months) 月") }, empty: "无条约")
                Divider2()
                labeled("停战", info.truces.map { ($0.nation, "余 \($0.days) 日") }, empty: "无停战期")
                Divider2()
                labeled("接壤", info.neighbors.sorted { $0.troops > $1.troops }.map { n in
                    let ratio = troops > 0 ? Double(n.troops) / Double(troops) : 0
                    return (n.nation, "\(Names.wan(n.troops)) 兵" + (troops > 0 ? (ratio > 1.5 ? " · 强于我" : ratio < 0.67 ? " · 弱于我" : " · 相当") : ""))
                }, empty: "无接壤国")
            } else {
                Text("载入……").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 14)
            }
        }
        .task(id: "\(nation)-\(day)") { info = await model.diplomacyInfo(nation) }
    }
    private func name(_ n: Int) -> String { n >= 0 && n < map.meta.nations.count ? map.meta.nations[n].name : "无主" }
    private func color(_ n: Int) -> Color { n >= 0 && n < map.meta.nations.count ? Names.color(map.meta.nations[n].color) : .gray }
    private func row(_ title: String, _ nations: [Int], empty: String, warn: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title).font(Theme.kai(16)).foregroundStyle(Theme.ink2).frame(width: 44, alignment: .leading)
            if nations.isEmpty { Text(empty).font(Theme.kai(15)).foregroundStyle(Theme.ink2.opacity(0.7)) }
            else {
                Text(nations.map(name).joined(separator: "、")).font(Theme.kai(16)).foregroundStyle(warn ? Theme.seal : Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
    private func labeled(_ title: String, _ items: [(Int, String)], empty: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(title).font(Theme.kai(16)).foregroundStyle(Theme.ink2).frame(width: 44, alignment: .leading)
            if items.isEmpty { Text(empty).font(Theme.kai(15)).foregroundStyle(Theme.ink2.opacity(0.7)) }
            else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(items.indices, id: \.self) { i in
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 2).fill(color(items[i].0)).frame(width: 10, height: 10)
                            Text(name(items[i].0)).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                            Text(items[i].1).font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
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
                LazyVStack(alignment: .leading, spacing: 14) {
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
                                    WarBalance(map: map, state: state, war: war)
                                }
                                .padding(16)
                                if war.id != state.wars.last?.id { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    SectionLabel("往来国与目标国")
                    Group2 {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("发起国").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                            NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive }, selection: $attacker)
                            Text("目标国").font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(.top, 6)
                            NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive && $0 != attacker }, selection: $defender)
                        }
                        .padding(14)
                        Divider2()
                        Button {
                            Task { if let e = await model.declareWar(attacker, on: defender) { say(e) } else { say(model.state?.events.last?.text ?? "已宣战") } }
                        } label: { Label("宣战", systemImage: "flag.2.crossed").font(Theme.kai(18)).frame(maxWidth: .infinity).padding(.vertical, 13).foregroundStyle(Theme.seal) }
                        .buttonStyle(.plain).disabled(attacker == defender || !state.nations.indices.contains(attacker) || !state.nations.indices.contains(defender) || !state.nations[attacker].alive || !state.nations[defender].alive)
                    }
                    .padding(.horizontal, 16)
                    SectionLabel("条约与邦交")
                    DiplomaticActions(model: model, source: attacker, target: defender, say: say).padding(.horizontal, 16)
                    SectionLabel("邦交总览")
                    DiplomacyOverviewView(model: model, map: map, nation: attacker, day: state.day / 30, troops: state.nations.indices.contains(attacker) ? state.nations[attacker].troops : 0)
                        .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
                .onChange(of: attacker) { _, value in
                    if defender == value { defender = state.nations.indices.first { $0 != value && state.nations[$0].alive } ?? -1 }
                }
            }
        }
    }
}

/// The chronicle as a hand scroll: wooden rods, entries brushed in newest first, war in vermilion,
/// peace in jade, the newest marked with a small seal.
/// 天下大势: the great powers' share of the land, the wars and the states still standing.
struct WorldSummary: View {
    @ObservedObject var model: GameModel
    var body: some View {
        if let state = model.state, let map = model.map {
            let total = max(1, state.owners.filter { $0 >= 0 }.count)
            let powers = state.nations.indices.filter { state.nations[$0].alive && $0 < map.meta.nations.count }
                .sorted { state.nations[$0].provinces > state.nations[$1].provinces }.prefix(4)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("天下大势").font(Theme.kai(18)).foregroundStyle(Theme.ink)
                    Spacer()
                    Text("\(state.nations.filter(\.alive).count) 国 · \(state.wars.count) 场战争").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                }
                // The land in one band, each great power its colour.
                GeometryReader { g in
                    HStack(spacing: 1) {
                        ForEach(Array(powers), id: \.self) { n in
                            Rectangle().fill(Names.color(map.meta.nations[n].color))
                                .frame(width: max(2, g.size.width * CGFloat(state.nations[n].provinces) / CGFloat(total)))
                        }
                        Rectangle().fill(Theme.ink.opacity(0.1))
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 8)
                ForEach(Array(powers.enumerated()), id: \.element) { i, n in
                    HStack(spacing: 8) {
                        Text(ChineseNumeral.of(i + 1)).font(Theme.kai(13)).foregroundStyle(Theme.seal).frame(width: 22)
                        RoundedRectangle(cornerRadius: 2).fill(Names.color(map.meta.nations[n].color)).frame(width: 10, height: 10)
                        Text(map.meta.nations[n].name).font(Theme.kai(15)).foregroundStyle(Theme.ink).lineLimit(1)
                        Spacer()
                        Text("\(Int((Double(state.nations[n].provinces) / Double(total) * 100).rounded()))%").font(Theme.kai(14)).foregroundStyle(Theme.ink2).monospacedDigit()
                    }
                }
            }
            .padding(14)
            .background(Theme.paper2.opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.ink.opacity(0.15), lineWidth: 1))
        }
    }
}

struct ChronicleSheet: View {
    @ObservedObject var model: GameModel
    @State private var unrolled = false
    @State private var category = "all"
    @State private var entries: [ChronicleEntry] = []
    @State private var open: String?
    static let categories = [("all", "全部"), ("war", "战争"), ("politics", "政事"), ("diplomacy", "外交"), ("family", "家族"), ("events", "天时人事")]
    private var era: String { (model.state?.era).flatMap { $0.isEmpty ? nil : $0 } ?? "公元" }
    /// The year of a day (the calendar runs 365¼ days a year from the state's current date).
    private func yearOf(_ day: Int) -> Int {
        guard let s = model.state else { return 1 }
        let dayOfYear = Double(s.date.month - 1) * 30.44 + Double(s.date.day - 1)
        return s.displayYear + Int(((dayOfYear - Double(s.day - day)) / 365.25).rounded(.down))
    }
    var body: some View {
        ZStack {
            MemorialPaper()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    MemorialHeader(title: "纪事", subtitle: model.state?.dateText, seal: "史")
                    WorldSummary(model: model).padding(.horizontal, 16)
                    // 大事记 by category: the whole chronicle (not only the latest lines), grouped by year;
                    // tap an entry for why it happened.
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Self.categories, id: \.0) { c in
                                let on = category == c.0
                                Button { category = c.0 } label: {
                                    Text(c.1).font(Theme.kai(15)).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                        .padding(.horizontal, 14).frame(height: 36)
                                        .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(on ? Color.clear : Theme.line))
                                }
                                .buttonStyle(PressStyle())
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    VStack(spacing: 0) {
                        ScrollRod().padding(.horizontal, 6)
                        LazyVStack(alignment: .leading, spacing: 0) {
                            if entries.isEmpty { Text("尚无记载").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 20) }
                            ForEach(Array(entries.enumerated()), id: \.offset) { i, e in
                                let year = yearOf(e.day)
                                if i == 0 || yearOf(entries[i - 1].day) != year {
                                    Text(year > 0 ? "\(era)\(year)年" : "\(era)前\(1 - year)年").font(Theme.kai(15)).foregroundStyle(Theme.seal)
                                        .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 2)
                                }
                                Button { withAnimation(.easeOut(duration: 0.2)) { open = open == e.id ? nil : e.id } } label: {
                                    HStack(alignment: .top, spacing: 10) {
                                        Circle().fill(color(e.kind)).frame(width: 7, height: 7).padding(.top, 8)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(e.text).font(Theme.kai(16)).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading)
                                            if open == e.id, !e.reason.isEmpty {
                                                Text(e.reason).font(Theme.kai(13)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.leading)
                                            }
                                        }
                                        Spacer(minLength: 0)
                                        if i == 0 { Seal(text: "新", size: 22) }
                                    }
                                    .padding(.horizontal, 18).padding(.vertical, 8).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                if i < entries.count - 1 { Rectangle().fill(Theme.ink.opacity(0.08)).frame(height: 0.7).padding(.leading, 35).padding(.trailing, 18) }
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
        .task(id: "\(category)-\((model.state?.day ?? 0) / 30)") { entries = await model.chronicle(category) }
    }
    private func color(_ kind: String) -> Color {
        switch kind { case "war", "battle", "uprising", "civilWar", "rebellion": return Theme.seal; case "peace", "diplomacy": return Theme.jade; default: return Theme.ink2.opacity(0.6) }
    }
}

struct MenuSheet: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    var openEdicts: () -> Void = {}
    var wallpaper: () -> Void = {}
    var say: (String) -> Void = { _ in }
    let close: () -> Void
    @State private var creating = false
    @State private var notes = false
    @State private var exported: ExportFile?
    @State private var importing = false
    /// 菜单 in three pages: the game (saves, worlds, edicts), the map's look, and the rest.
    @State private var page = "game"
    @State private var calendar = false
    @State private var eraText = ""
    @State private var yearText = ""
    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader(title: "菜单", subtitle: AppVersion.text)
            ChipPicker(items: [("game", "游戏"), ("map", "地图显示"), ("other", "声音与其他")], selection: $page).padding(.horizontal, 16)
            switch page {
            case "map":
                MapDisplaySettings(controller: controller)
            case "other":
                SectionLabel("声音与触感")
                FeelSettings()
                SectionLabel("远程计算")
                RemoteSettings(model: model)
                SectionLabel("推演与画面")
                Group2 {
                    PaperSwitch(title: "显示军队", on: $controller.play.showArmies)
                    Divider2()
                    PaperSwitch(title: "显示战争箭头", on: $controller.play.warArrows)
                    Divider2()
                    PaperSlider(title: "军队图标", value: $controller.play.iconScale, range: 0.6...1.6, step: 0.1) { String(format: "%.1f×", $0) }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                    Divider2()
                    FrameSettings(play: $controller.play)
                    Divider2()
                    PaperSwitch(title: "进场镜头拉远", on: $controller.play.introCamera)
                    Divider2()
                    PaperSwitch(title: "动画先快后缓（关闭为匀速）", on: $controller.play.easeReveal)
                    Divider2()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("自动存档").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                        ChipPicker(items: [(60, "1分钟"), (120, "2分钟"), (300, "5分钟"), (0, "关闭")], selection: $controller.play.autosave)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                }
                .padding(.horizontal, 16)
                SectionLabel("调试")
                Group2 {
                    PaperSwitch(title: "显示帧率与推演耗时", on: $controller.showMetrics)
                    Divider2()
                    ResetSettingsRow(controller: controller, say: say)
                }
                .padding(.horizontal, 16)
            default:
                SectionLabel("存档")
                Group2 {
                    Button {
                        Task { let ok = await model.saveNow(); GameFeel.shared.notify(ok ? .success : .error); say(ok ? "已保存" : "保存失败"); close() }
                    } label: { MenuRow(symbol: "square.and.arrow.down", title: "保存") }.buttonStyle(.plain)
                    Divider2()
                    Button { Task { exported = await model.exportCopy().map(ExportFile.init) } } label: { MenuRow(symbol: "square.and.arrow.up", title: "导出存档（备份）") }.buttonStyle(.plain)
                    Divider2()
                    Button { importing = true } label: { MenuRow(symbol: "tray.and.arrow.down", title: "导入存档") }.buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                SectionLabel("世界")
                Group2 {
                    Button { openEdicts() } label: { MenuRow(symbol: "scroll.fill", title: "天下诏令与规则") }.buttonStyle(.plain)
                    Divider2()
                    Button { creating = true } label: { MenuRow(symbol: "globe.asia.australia", title: "新世界") }.buttonStyle(.plain)
                    Divider2()
                    Button { wallpaper() } label: { MenuRow(symbol: "photo.on.rectangle", title: "壁纸模式") }.buttonStyle(.plain)
                    Divider2()
                    Button { calendar = true } label: { MenuRow(symbol: "calendar", title: "纪年与日期") }.buttonStyle(.plain)
                    Divider2()
                    Button { close(); model.backToTitle() } label: { MenuRow(symbol: "house", title: "返回标题") }.buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                Group2 {
                    Button { notes = true } label: { MenuRow(symbol: "sparkles", title: "本版新增与更新内容") }.buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
            }
        }
        .padding(.bottom, 24)
        .animation(.easeOut(duration: 0.2), value: page)
        }
        .sheet(isPresented: $creating) {
            NewWorldSheet(start: { options in creating = false; close(); Task { await model.generate(options) } }, draw: { options in creating = false; close(); model.openEditor(options) })
                .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(item: $exported) { file in ShareSheet(items: [file.url]) }
        .sheet(isPresented: $calendar) {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "纪年与日期", subtitle: model.state?.dateText ?? "", seal: "历")
                HStack { Text("年号").font(Theme.kai(16)).foregroundStyle(Theme.ink2).frame(width: 70, alignment: .leading); TextField("公元", text: $eraText).paperField() }.padding(.horizontal, 22)
                HStack { Text("今年为").font(Theme.kai(16)).foregroundStyle(Theme.ink2).frame(width: 70, alignment: .leading); TextField("\(model.state?.displayYear ?? 1)", text: $yearText).keyboardType(.numbersAndPunctuation).paperField(); Text("年").font(Theme.kai(16)).foregroundStyle(Theme.ink2) }.padding(.horizontal, 22)
                Text("只改纪年的显示（年号与年份），推演的时间不变；留空年号即用「公元」。").font(Theme.kai(12)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
                SealButton(title: "颁行", disabled: false) {
                    calendar = false
                    Task { if let e = await model.setCalendar(era: eraText, year: Int(yearText)) { say(e) } else { say("纪年已改") } }
                }
                .padding(.horizontal, 22)
            }
            .padding(.bottom, 16)
            .presentationDetents([.height(340)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data, .item]) { result in
            if case .success(let url) = result { close(); Task { await model.importSave(from: url) } }
        }
        .sheet(isPresented: $notes) { ReleaseNotesSheet().presentationDetents([.large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden) }
    }
}

/// The map switches. Same paper rows as the rest of the menus.
struct MapDisplaySettings: View {
    @ObservedObject var controller: MapController
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel("界线")
            Group2 {
                PaperSwitch(title: "国界", on: $controller.display.borders)
                Divider2()
                PaperSwitch(title: "行省边界", on: $controller.display.provinceLines)
                Divider2()
                PaperSwitch(title: "航线", on: $controller.display.seaRoutes)
                Divider2()
                PaperSwitch(title: "经纬线", on: Binding(get: { controller.display.gridLines == true }, set: { controller.display.gridLines = $0 }))
            }
            .padding(.horizontal, 16)
            SectionLabel("城市与地貌")
            Group2 {
                PaperSwitch(title: "城市名称", on: $controller.display.cityNames)
                Divider2()
                PaperSwitch(title: "城市图标", on: $controller.display.cityIcons)
                Divider2()
                PaperSwitch(title: "植被与地貌图标", on: $controller.display.vegetation)
            }
            .padding(.horizontal, 16)
            SectionLabel("国名")
            Group2 {
                PaperSwitch(title: "完整国名", on: $controller.display.fullNationNames)
                Divider2()
                PaperSlider(title: "大小", value: $controller.display.nationNameScale, range: 0.5...2, step: 0.05) { String(format: "%.2f", $0) }
                    .padding(.horizontal, 16).padding(.vertical, 10)
            }
            .padding(.horizontal, 16)
            SectionLabel("画面")
            Group2 {
                PaperSwitch(title: "羊皮纸", on: $controller.display.parchment)
                Divider2()
                PaperSwitch(title: "暗边", on: $controller.display.darkEdges)
                Divider2()
                PaperSlider(title: "国色浓度", value: $controller.display.colorDensity, range: 0.2...1, step: 0.1) { "\(Int($0 * 100))%" }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                VStack(alignment: .leading, spacing: 8) {
                    Text("海色").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                    ChipPicker(items: [("original", "原作海蓝"), ("warm", "暖纸海色")], selection: $controller.display.ocean)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            }
            .padding(.horizontal, 16)
        }
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
    /// Observes the map clock. A plain Float copied into this view stayed on 注水成海 while the land kept rising.
    @ObservedObject var controller: MapController
    private var reveal: Float { controller.reveal }
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
                    ForEach(max(0, current - 3)..<current, id: \.self) { i in
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.jade)
                            Text(all[i]).font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                        }
                        .opacity(0.45 + 0.18 * Double(i - (current - 3)))
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    Text(all[min(current, all.count - 1)] + "……").font(Theme.kai(20)).foregroundStyle(Theme.ink)
                        .id(current).transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1).opacity(configuration.isPressed ? 0.86 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// A row of paper chips (replaces the system segmented control).
/// 恢复默认设置: the map display and the 推演与画面 settings back to how a new install starts (the
/// worlds and saves are untouched). Every newer change in those settings can be undone this way.
struct ResetSettingsRow: View {
    @ObservedObject var controller: MapController
    let say: (String) -> Void
    @State private var asking = false
    var body: some View {
        Button { asking = true } label: {
            HStack {
                Text("恢复默认设置").font(Theme.kai(18)).foregroundStyle(Theme.seal)
                Spacer()
                Image(systemName: "arrow.counterclockwise").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.seal)
            }
            .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .confirmationDialog("恢复地图显示与推演画面的默认设置？", isPresented: $asking, titleVisibility: .visible) {
            Button("恢复默认", role: .destructive) {
                controller.play = PlaySettings(); controller.display = DisplaySettings()
                say("已恢复默认设置")
            }
        } message: { Text("世界与存档不受影响。") }
    }
}

/// 画面档位 and each frame rate, the map's sharpness and the simulation's share of the processor.
struct FrameSettings: View {
    @Binding var play: PlaySettings
    private func row<T: Hashable>(_ title: String, _ note: String, _ items: [(T, String)], _ value: Binding<T>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                Spacer()
                Text(note).font(Theme.kai(12)).foregroundStyle(Theme.ink2)
            }
            ChipPicker(items: items, selection: value)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
    }
    var body: some View {
        VStack(spacing: 0) {
            row("画面档位", play.preset == "custom" ? "自定" : "一键设定下面各项", PlaySettings.presets.map { ($0.key, $0.name) } + (play.preset == "custom" ? [("custom", "自定")] : []), $play.preset)
            Divider2()
            row("拖动地图帧率", "拖动、缩放时", [(30, "30"), (60, "60"), (120, "120")], $play.mapFPS)
            Divider2()
            row("行军帧率", "军队移动时", [(30, "30"), (60, "60"), (120, "120")], $play.marchFPS)
            Divider2()
            row("动画帧率", "海浪、战场、旗帜", [(15, "15"), (30, "30"), (60, "60")], $play.effectFPS)
            Divider2()
            row("地图清晰度", "越高越耗电", [(1.0, "低"), (1.5, "中"), (2.0, "高"), (3.0, "原生")], $play.renderScale)
            Divider2()
            row("推演占用", "越高越快、越热", [(50, "50%"), (65, "65%"), (80, "80%"), (100, "全速")], $play.simLoad)
            Divider2()
            PaperSwitch(title: "发热时自动降档", on: $play.autoCool)
            Text("手机变热或开启低电量模式时，帧率降到 30、推演多休息、暂停海浪和战场烟雾，降温后恢复。")
                .font(Theme.kai(12)).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.bottom, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

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
    /// − value + with whole-button hit areas (the bare icons were easy to miss inside a scrolling
    /// sheet), hold to repeat, a tick of haptics, and a slider beneath for big moves.
    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                Text(title).font(Theme.kai(17)).foregroundStyle(Theme.ink2)
                Spacer()
                stepButton("minus", -1)
                Text("\(value) \(unit)").font(Theme.kai(20)).foregroundStyle(Theme.ink).frame(minWidth: 64)
                    .monospacedDigit().contentTransition(.numericText()).animation(.snappy(duration: 0.2), value: value)
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
        return Image(systemName: symbol).font(.system(size: 15, weight: .bold)).foregroundStyle(enabled ? Theme.ink : Theme.ink2.opacity(0.4))
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
    var body: some View {
        let (word, color): (String, Color) = {
            switch herald.kind {
            case .war: return ("宣战", Theme.seal)
            case .peace: return ("议和", Theme.jade)
            case .capture: return ("攻克", Theme.ink)
            case .uprising: return ("起义", Color(red: 0.55, green: 0.12, blue: 0.1))
            case .restoration: return ("复辟", Color(red: 0.62, green: 0.45, blue: 0.12))
            case .extinction: return ("绝嗣", Theme.ink2)
            case .capital: return ("迁都", Theme.jade)
            }
        }()
        HStack(spacing: 12) {
            // The pages' own vermilion seal (SheetHeader), pressed in the same way.
            Seal(text: word, size: 40)
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
        .glass(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 14)
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
    /// 点一下数字即可修改: the tile becomes a button with a small brush mark.
    var edit: (() -> Void)? = nil
    @State private var appeared = false
    var body: some View {
        Group {
            if let edit {
                Button(action: edit) { content.overlay(alignment: .topTrailing) { Image(systemName: "pencil").font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.seal.opacity(0.7)).padding(6) } }
                    .buttonStyle(PressStyle())
            } else { content }
        }
        // Tiles rise into place when a page opens.
        .opacity(appeared ? 1 : 0).offset(y: appeared ? 0 : 8)
        .onAppear { withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { appeared = true } }
    }
    private var content: some View {
        VStack(alignment: .leading, spacing: 5) {
            GlyphLabel(text: label).font(Theme.kai(13)).foregroundStyle(Theme.ink2)
            Text(value).font(Theme.kai(20)).foregroundStyle(warn ? Theme.seal : Theme.ink).lineLimit(1).minimumScaleFactor(0.6).monospacedDigit()
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
        .contentShape(Rectangle())
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
    /// 整编舰队: ship count and name edits.
    @State private var shipsEdit = false
    @State private var renaming = false
    @State private var newName = ""
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
                        StatTile(label: "船只", value: "\(f.ships)", edit: f.status == "lost" ? nil : { shipsEdit = true }),
                        StatTile(label: "船员", value: Names.wan(f.crew)),
                        StatTile(label: "舰体", value: "\(Int((f.hull * 100).rounded()))%", fraction: f.hull, warn: f.hull < 0.35),
                        StatTile(label: "口粮", value: "\(f.food)", warn: f.food <= 0),
                    ])
                    Group2 {
                        Button { newName = f.name; renaming = true } label: {
                            HStack { Text("舰队名").font(Theme.kai(16)).foregroundStyle(Theme.ink2); Spacer(); Text(f.name).font(Theme.kai(16)).foregroundStyle(Theme.ink); Image(systemName: "pencil").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.seal) }
                                .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain).disabled(f.status == "lost"); Divider2()
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
                    if f.status != "lost" {
                        let mine = f.manual || !f.patrol
                        Button {
                            Task { let out = await model.armyAction("fleetManual", armyId: f.id, flag: !mine); feedback = out.message }
                        } label: { SecondaryLabel(title: mine ? "交还 AI 自主巡防" : "亲自指挥", symbol: mine ? "cpu" : "person.fill") }
                        .buttonStyle(.plain).padding(.horizontal, 16)
                    }
                    if !feedback.isEmpty {
                        Text(feedback).font(Theme.kai(14)).foregroundStyle(Theme.seal).transition(.opacity)
                    }
                    Text(busy ? "交战或撤退中的舰队不能改令" : "只能停留本国港口；目标须有连通海路").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                }
                .padding(.bottom, 24)
                .animation(.easeOut(duration: 0.25), value: feedback)
            }
            .sheet(isPresented: $shipsEdit) {
                NumberEditSheet(title: "\(f.name)船只", unit: "艘", value: Double(f.ships)) { v in
                    shipsEdit = false
                    Task { feedback = await model.editFleet(f.id, ships: Int(v.rounded()), name: nil) ?? "已整编为 \(min(10, max(1, Int(v.rounded())))) 艘" }
                }
                .presentationDetents([.height(300)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
            }
            .sheet(isPresented: $renaming) {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "舰队更名", subtitle: "现名 \(f.name)", seal: "改")
                    TextField("", text: $newName).paperField().padding(.horizontal, 22)
                    SealButton(title: "颁行", disabled: newName.trimmingCharacters(in: .whitespaces).isEmpty) {
                        renaming = false
                        Task { feedback = await model.editFleet(f.id, ships: nil, name: newName) ?? "已更名为\(newName)" }
                    }
                    .padding(.horizontal, 22)
                }
                .padding(.bottom, 16)
                .presentationDetents([.height(280)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
            }
        }
    }
}

/// One army order as a small paper chip: symbol over a two-character name.
struct ArmyChip: View {
    let title: String; let symbol: String
    var disabled = false
    var danger = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: symbol).font(.system(size: 15, weight: .semibold))
                Text(title).font(Theme.kai(14)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(danger ? Theme.seal : Theme.ink)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(Theme.paper2.opacity(0.9), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(danger ? Theme.seal.opacity(0.4) : Theme.line))
        }
        .buttonStyle(PressStyle())
        .disabled(disabled).opacity(disabled ? 0.45 : 1)
    }
}

/// Every arm in a grid of paper chips, the chosen one's strengths beneath.
struct UnitGrid: View {
    @Binding var selection: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                ForEach(UnitKinds.kinds, id: \.key) { k in
                    let on = k.key == selection
                    Button { selection = k.key } label: {
                        Text(k.name).font(Theme.kai(14)).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity).frame(height: 34)
                            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(on ? Color.clear : Theme.line))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            if let k = UnitKinds.byKey[selection] { Text(k.note).font(Theme.kai(13)).foregroundStyle(Theme.ink2) }
        }
    }
}
