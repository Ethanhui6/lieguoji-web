import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

/// The launch animation on the game's own rice paper (the system launch screen is the same paper
/// colour, so the hand-over from the home screen does not flash): a drop of ink soaks into the sheet,
/// far hills wash in along the bottom, 列國紀 is brushed stroke-down one character at a time, the
/// vermilion seal is pressed beside it, then the ink fades and the blank sheet becomes the world's
/// own paper, on which the title map is painted (its reveal starts from blank paper too). Shapes and
/// gradients only (no blur, no offscreen blend), so it holds the frame rate while the backdrop is built.
struct SplashView: View {
    let done: () -> Void
    @State private var soaked = false
    @State private var contours = false
    @State private var hills = false
    @State private var brushed = 0
    @State private var stamped = false
    @State private var stampRing = false
    @State private var motto = false
    @State private var dried = false
    static let title = ["列", "國", "紀"]
    static let night = Color(red: 0.035, green: 0.09, blue: 0.11)
    static let gold = Color(red: 0.86, green: 0.74, blue: 0.5)
    static let sea = Color(red: 0.07, green: 0.2, blue: 0.24)
    var body: some View {
        ZStack {
            MemorialPaper(rules: false).ignoresSafeArea()
            // 舆图金墨等高线：在宣纸上轻轻铺展，不耗离屏渲染。
            InkContours()
                .trim(from: 0, to: contours ? 1 : 0)
                .stroke(Self.gold.opacity(0.32), style: StrokeStyle(lineWidth: 1.1, lineCap: .round))
                .ignoresSafeArea()
                .opacity(dried ? 0 : 1)
            // The ink drop: two soft rings spreading behind the title.
            ZStack {
                Circle().fill(RadialGradient(colors: [Theme.ink.opacity(0.13), Theme.ink.opacity(0.05), .clear], center: .center, startRadius: 0, endRadius: 190))
                    .frame(width: 380, height: 380).scaleEffect(soaked ? 1 : 0.15)
                Circle().fill(RadialGradient(colors: [Theme.seal.opacity(0.08), .clear], center: .center, startRadius: 0, endRadius: 120))
                    .frame(width: 240, height: 240).offset(x: 40, y: -30).scaleEffect(soaked ? 1 : 0.3)
            }
            .opacity(soaked && !dried ? 1 : 0).offset(y: -40)
            // 远近两重水墨远山：底部采用竖向柔化墨韵渐变，彻底消除椭圆白块与横线断层。
            VStack(spacing: 0) {
                Spacer()
                ZStack(alignment: .bottom) {
                    InkHills(seed: 11)
                        .fill(LinearGradient(colors: [Theme.ink.opacity(0.085), Theme.ink.opacity(0.03), .clear], startPoint: .top, endPoint: .bottom))
                        .frame(height: 195)
                    InkHills(seed: 4)
                        .fill(LinearGradient(colors: [Theme.ink.opacity(0.13), Theme.ink.opacity(0.06), Theme.ink.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                        .frame(height: 122)
                }
                .offset(y: hills ? 0 : 38).opacity(hills && !dried ? 1 : 0)
            }
            .ignoresSafeArea()
            HStack(alignment: .top, spacing: 18) {
                VStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in
                        // Each character is uncovered from the top down, as a brush writes it.
                        Text(Self.title[i]).font(Theme.kai(66)).foregroundStyle(Theme.ink)
                            .mask(alignment: .top) {
                                Rectangle().scaleEffect(x: 1, y: brushed > i ? 1 : 0.001, anchor: .top)
                            }
                    }
                }
                VStack(spacing: 14) {
                    ZStack {
                        Circle()
                            .stroke(Theme.seal.opacity(stampRing ? 0 : (stamped ? 0.55 : 0)), lineWidth: 2)
                            .frame(width: 52, height: 52)
                            .scaleEffect(stampRing ? 2.1 : 0.75)
                        SealMark(size: 42).rotationEffect(.degrees(-6))
                            .scaleEffect(stamped ? 1 : 1.75).opacity(stamped ? 1 : 0)
                    }
                    VerticalText("架空世界列国兴衰", size: 14).foregroundStyle(Theme.ink2)
                        .opacity(motto ? 1 : 0).offset(y: motto ? 0 : -8)
                }
                .padding(.top, 12)
            }
            .offset(y: -40)
            .opacity(dried ? 0 : 1).scaleEffect(dried ? 1.03 : 1)
        }
        .task {
            withAnimation(.easeOut(duration: 1.1)) { soaked = true }
            withAnimation(.easeOut(duration: 1.4)) { contours = true }
            withAnimation(.easeOut(duration: 1.3).delay(0.15)) { hills = true }
            try? await Task.sleep(nanoseconds: 280_000_000)
            for i in 1...3 {
                withAnimation(Motion.reveal) { brushed = i }
                try? await Task.sleep(nanoseconds: 260_000_000)
            }
            try? await Task.sleep(nanoseconds: 140_000_000)
            withAnimation(Motion.stamp) { stamped = true }
            withAnimation(.easeOut(duration: 0.6)) { stampRing = true }
            GameFeel.shared.tap()
            withAnimation(Motion.reveal.delay(0.15)) { motto = true }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            withAnimation(Motion.reveal) { dried = true }
            try? await Task.sleep(nanoseconds: 420_000_000)
            done()
        }
    }
}

/// 宣纸背后的舆图等高波线（纯矢量路径，零离屏模糊，保持开场 60 帧）。
private struct InkContours: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        for i in 0..<4 {
            let y = rect.height * (0.24 + CGFloat(i) * 0.14)
            let amp = CGFloat(14 + i * 6)
            p.move(to: CGPoint(x: -10, y: y))
            p.addCurve(to: CGPoint(x: rect.width + 10, y: y - amp * 0.4),
                       control1: CGPoint(x: rect.width * 0.32, y: y - amp),
                       control2: CGPoint(x: rect.width * 0.68, y: y + amp))
        }
        return p
    }
}

/// A ridge of ink-wash mountains across the bottom of a frame (seeded peaks).
struct InkHills: Shape {
    let seed: Int
    func path(in rect: CGRect) -> Path {
        var p = Path(), x: CGFloat = 0
        let bottom = rect.maxY + 60
        p.move(to: CGPoint(x: 0, y: bottom))
        var s = UInt32(seed &* 2654435761 % 4294967291)
        func next() -> CGFloat { s = s &* 1664525 &+ 1013904223; return CGFloat(s >> 8) / CGFloat(1 << 24) }
        p.addLine(to: CGPoint(x: 0, y: rect.maxY - rect.height * 0.4))
        while x < rect.width {
            let w = rect.width * (0.12 + next() * 0.14), peak = rect.height * (0.45 + next() * 0.55)
            p.addQuadCurve(to: CGPoint(x: x + w, y: rect.maxY - rect.height * (0.25 + next() * 0.3)), control: CGPoint(x: x + w * 0.5, y: rect.maxY - peak * 1.3))
            x += w
        }
        p.addLine(to: CGPoint(x: rect.width, y: bottom)); p.closeSubpath()
        return p
    }
}

/// The app's seal: a vermilion rounded square with 列国 in the original's Kai script.
struct SealMark: View {
    var size: CGFloat
    var body: some View {
        // 与全作朱印同一印面（一字印）。
        SealFace(text: "列", size: size).shadow(color: Theme.seal.opacity(0.25), radius: size * 0.08, y: size * 0.03)
    }
}

// MARK: - title

struct TitleView: View {
    @ObservedObject var model: GameModel
    @State private var importing = false
    @State private var creating = false
    @State private var archive = false
    @State private var shown = false
    @State private var settings = false
    @State private var warRulesOpen = false
    @State private var notes = false
    /// A line of the classics under the title, changing each launch.
    private static let mottos = ["天下大势，分久必合，合久必分", "兴，百姓苦；亡，百姓苦", "江山如画，一时多少豪杰", "运筹帷幄之中，决胜千里之外", "苟利国家生死以"]
    @State private var motto = TitleView.mottos.randomElement()!
    @ObservedObject private var cloud = CloudConfig.shared
    var body: some View {
        ZStack {
            // Ink at the top, paper at the bottom: the title and the actions read over any world.
            // A soft ink wash from the very top edge (no band under the status bar): it fades out over a third.
            LinearGradient(stops: [.init(color: SplashView.night.opacity(0.5), location: 0), .init(color: SplashView.night.opacity(0.22), location: 0.16), .init(color: SplashView.night.opacity(0), location: 0.4),
                                   .init(color: Theme.paper.opacity(0), location: 0.5), .init(color: Theme.paper.opacity(0.96), location: 0.74)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea().allowsHitTesting(false)
            // An ink wash down the left, behind the title and the line of the classics.
            LinearGradient(colors: [SplashView.night.opacity(0.72), SplashView.night.opacity(0)], startPoint: .leading, endPoint: .trailing)
                .frame(width: 300).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.32), .init(color: .clear, location: 0.46)], startPoint: .top, endPoint: .bottom))
                .ignoresSafeArea().allowsHitTesting(false)
            VStack(spacing: 0) {
                // The inscription: the title brushed top to bottom, the seal, and a line of the classics.
                HStack(alignment: .top, spacing: 14) {
                    VStack(spacing: 4) {
                        ForEach(Array(SplashView.title.enumerated()), id: \.offset) { i, ch in
                            Text(ch).font(Theme.kai(56)).foregroundStyle(Theme.paper)
                                .opacity(shown ? 1 : 0).offset(y: shown ? 0 : -12)
                                .animation(Motion.panel.delay(Double(i) * 0.08), value: shown)
                        }
                    }
                    VStack(alignment: .center, spacing: 12) {
                        SealMark(size: 30).rotationEffect(.degrees(-6))
                        VerticalText(motto, size: 13).foregroundStyle(SplashView.gold)
                    }
                    .padding(.top, 8)
                    .opacity(shown ? 1 : 0).animation(Motion.reveal.delay(0.3), value: shown)
                    Spacer()
                }
                .padding(.leading, 26).padding(.top, 12)
                Spacer()
                VStack(spacing: 12) {
                    if let notice = cloud.notice {
                        HStack(spacing: 6) {
                            InkIcon(glyph: .edict, size: 13, weight: 1.75).foregroundStyle(Theme.seal)
                            Text(notice).font(Theme.kai(13)).foregroundStyle(Theme.ink).lineLimit(2)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Theme.paper2.opacity(0.95), in: Capsule()).overlay(Capsule().stroke(Theme.seal.opacity(0.3)))
                        .rise(shown, 0)
                    }
                    Text("架空世界 · 列国兴衰").font(Theme.body).tracking(6).foregroundStyle(Theme.ink2)
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
                        Button { archive = true } label: { TileAction(title: "世界卷宗", symbol: "books.vertical") }
                        Button { settings = true } label: { TileAction(title: "设置", symbol: "slider.horizontal.3") }
                        Button { notes = true } label: { TileAction(title: "更新", symbol: "book.pages") }
                    }
                    .rise(shown, 0.16)
                    Text(AppVersion.text + (cloud.version > 0 ? " · 云配置 \(cloud.version)" : "")).font(Theme.caption).foregroundStyle(Theme.ink2.opacity(0.75)).padding(.top, 2)
                }
                .buttonStyle(PressStyle())
                .frame(maxWidth: 440)
                .padding(.horizontal, Theme.Layout.sectionInset).padding(.bottom, 26)
            }
        }
        .statusBarHidden()
        .onAppear {
            model.controller.sheetOpen = (creating || archive || settings || notes || importing)
            shown = false
            withAnimation(Motion.drift.delay(model.controller.reveal < 1 ? 0.9 : 0.1)) { shown = true }
        }
        .onDisappear { model.controller.sheetOpen = false }
        .onChange(of: creating || archive || settings || notes || importing) { _, open in
            model.controller.sheetOpen = open
        }
        .onChange(of: model.tourTitle) { _, name in
            settings = name == "settings"
            creating = name == "new-world"
            archive = name == "archive"
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data, .item]) { result in
            if case .success(let url) = result { Task { await model.importSave(from: url) } }
        }
        .sheet(isPresented: $creating) {
            NewWorldSheet(start: { options in creating = false; Task { await model.generate(options) } }, draw: { options in creating = false; model.openEditor(options) }, inputs: model.previewInputs)
                .presentationDetents([.medium, .large]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $archive) {
            WorldArchiveSheet(model: model) { world in archive = false; Task { await model.openArchived(world) } }
                .presentationDetents([.medium, .large]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $settings) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "设置", subtitle: AppVersion.text, seal: "设")
                    Group2 {
                        DisclosureGroup("战争规则", isExpanded: $warRulesOpen) {
                            WarRuleSettings()
                                .padding(.top, 8)
                        }
                        .font(Theme.section).tint(Theme.seal)
                        .padding(.horizontal, 16).padding(.vertical, 12)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                    MapDisplaySettings(controller: model.controller)
                    SectionLabel("性能与帧率")
                    Group2 {
                        FrameSettings(controller: model.controller)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                    SectionLabel("声音与触感")
                    FeelSettings()
                    SectionLabel("远程计算")
                    RemoteSettings(model: model)
                }
                .padding(.bottom, 24)
            }
            .presentationDetents([.medium, .large]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $notes) { ReleaseNotesSheet().presentationDetents([.large]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden) }
    }
}

/// 山河预览 off the main thread: the template's heights for this seed, drawn small.
func terrainThumbnail(_ inputs: PreviewWorld.Inputs, seed: String, template: String, previewNations: Int = 0) -> (image: UIImage, stats: PreviewWorld.ThumbnailStats)? {
    let t = PreviewWorld.thumbnail(inputs, heights: TerrainGenerator.generate(graph: inputs.grid, seed: seed, template: template), width: 440, nations: previewNations, seed: seed)
    guard let provider = CGDataProvider(data: Data(t.rgba) as CFData),
          let image = CGImage(width: t.width, height: t.height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: t.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue), provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return nil }
    return (UIImage(cgImage: image), t.stats)
}

/// The title screen's main action: a vermilion seal plate (or a paper one) with an icon, a title and a
/// line of what it does.
struct HeroAction: View {
    let title: String; let detail: String; let symbol: String
    var primary = true
    var body: some View {
        HStack(spacing: 14) {
            Group {
                if let g = GameActionLabel.glyph(for: symbol) {
                    InkIcon(glyph: g, size: 22, weight: 1.85, accent: primary ? Theme.seal.opacity(0.26) : Theme.paper2.opacity(0.32))
                } else {
                    Image(systemName: symbol).font(.system(size: 22, weight: .medium))
                }
            }
            .foregroundStyle(primary ? Theme.seal : Theme.paper2)
            .frame(width: 46, height: 46)
            .background(primary ? Theme.paper2 : Theme.seal, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(Theme.title).foregroundStyle(primary ? Theme.paper2 : Theme.ink)
                Text(detail).font(Theme.caption).foregroundStyle(primary ? Theme.paper2.opacity(0.84) : Theme.ink2).lineLimit(1)
            }
            Spacer(minLength: 6)
            InkIcon(glyph: .chevronRight, size: 13, weight: 1.8).foregroundStyle(primary ? Theme.paper2.opacity(0.85) : Theme.ink2)
        }
        .padding(.horizontal, Theme.Layout.cardPadding).frame(height: 74)
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
            Group {
                if let g = GameActionLabel.glyph(for: symbol) {
                    InkIcon(glyph: g, size: 19, weight: 1.75, accent: Theme.seal.opacity(0.24))
                } else {
                    Image(systemName: symbol).font(.system(size: 18, weight: .medium))
                }
            }
            .foregroundStyle(Theme.seal).frame(height: 22)
            Text(title).font(Theme.label).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity).frame(height: 64)
        .background(Theme.paper2.opacity(0.95), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.line))
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// 生成地图: the original's terrain templates and the number of states.
struct NewWorldSheet: View {
    let start: (GameModel.NewWorld) -> Void
    /// 自绘地图 with these options.
    var draw: ((GameModel.NewWorld) -> Void)? = nil
    /// The original grid, for the picture of the land this seed makes.
    var inputs: PreviewWorld.Inputs? = nil
    @Environment(\.verticalSizeClass) private var verticalClass
    @State private var options = GameModel.NewWorld()
    /// The seed used while the field is left blank, so the land shown is the land founded.
    @State private var rolled = String(UInt32.random(in: 0...UInt32.max))
    @State private var terrain: UIImage?
    @State private var terrainStats: PreviewWorld.ThumbnailStats?
    @State private var previewShowNations = true
    @State private var renderingTerrain = false
    @State private var selectedPreset: String? = nil
    private var seed: String { options.seed.isEmpty ? rolled : options.seed }
    private var chosen: GameModel.NewWorld { var o = options; o.seed = seed; return o }
    struct ScenarioPreset: Identifiable {
        let id: String; let title: String; let note: String; let seal: String; let symbol: String
        let template: String; let nations: Int; let provinces: Int; let relations: String; let cultures: Set<String>
    }
    static let presets: [ScenarioPreset] = [
        ScenarioPreset(id: "huaxia", title: "华夏群雄", note: "中原大陆 · 诸侯并起", seal: "夏", symbol: "crown", template: "pangea", nations: 12, provinces: 140, relations: "peace", cultures: ["chinese", "korean", "mongol", "vietnamese", "japanese"]),
        ScenarioPreset(id: "zhanguo", title: "战国七雄", note: "七强接壤 · 合纵连横", seal: "战", symbol: "flag.2.crossed", template: "pangea", nations: 7, provinces: 110, relations: "war", cultures: ["chinese"]),
        ScenarioPreset(id: "warring", title: "列国争霸", note: "多陆交锋 · 开局即战", seal: "霸", symbol: "flag.2.crossed", template: "continents", nations: 14, provinces: 160, relations: "war", cultures: Set(Names.cultureIds)),
        ScenarioPreset(id: "voyage", title: "大航海群岛", note: "星罗海岛 · 舟师竞渡", seal: "海", symbol: "water.waves", template: "archipelago", nations: 10, provinces: 120, relations: "peace", cultures: ["english", "french", "spanish", "portuguese", "dutch", "italian", "japanese", "chinese"]),
        ScenarioPreset(id: "silkroad", title: "丝路万邦", note: "高原群山 · 东西汇通", seal: "丝", symbol: "mountain.2", template: "highIsland", nations: 12, provinces: 130, relations: "peace", cultures: ["chinese", "mongol", "turkic", "persian", "arab", "indian", "greek", "italian", "slavic"]),
        ScenarioPreset(id: "myriad", title: "万国演义", note: "二十诸侯 · 乱世纷争", seal: "万", symbol: "globe.asia.australia", template: "continents", nations: 20, provinces: 210, relations: "peace", cultures: Set(Names.cultureIds)),
    ]
    struct ScalePreset: Identifiable { let id: String; let title: String; let nations: Int; let provinces: Int }
    static let scalePresets: [ScalePreset] = [
        ScalePreset(id: "compact", title: "袖珍 · 6国", nations: 6, provinces: 80),
        ScalePreset(id: "standard", title: "标准 · 12国", nations: 12, provinces: 140),
        ScalePreset(id: "grand", title: "宏大 · 18国", nations: 18, provinces: 200),
        ScalePreset(id: "epic", title: "史诗 · 24国", nations: 24, provinces: 260),
    ]
    struct CultureGroup: Identifiable { let id: String; let title: String; let list: Set<String> }
    static let cultureGroups: [CultureGroup] = [
        CultureGroup(id: "east", title: "东亚", list: ["chinese", "japanese", "korean", "vietnamese", "mongol"]),
        CultureGroup(id: "euro", title: "欧洲", list: ["english", "french", "german", "italian", "spanish", "portuguese", "dutch", "polish", "slavic", "norse", "greek", "roman", "hungarian"]),
        CultureGroup(id: "silk", title: "亚非", list: ["arab", "persian", "turkic", "indian", "egyptian", "tibetan"]),
        CultureGroup(id: "all", title: "全选", list: Set(Names.cultureIds)),
    ]
    /// Each terrain template's picture, playstyle badge and description.
    static let templateArt: [String: (tag: String, note: String)] = [
        "continents": ("陆海兼备", "数块大陆隔海相望"),
        "pangea": ("中原逐鹿", "一整块大陆，列国接壤"),
        "archipelago": ("舟师争霸", "星罗棋布的群岛海湾"),
        "highIsland": ("关隘天险", "群山耸立的高原大岛"),
    ]
    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            SheetHeader(title: "新世界", subtitle: "择一方山河 · 启一卷史诗", seal: "新")

            // 1. 顶部实时高清山河预览卡（支持「地形地貌 / 势力分布」即时切换 + 陆海山地实测数据 + 换图按钮）
            if inputs != nil { terrainCard.padding(.horizontal, Theme.Layout.pageInset) }

            // 2. 精选剧本（6 套差异化历史/沙盒格局）
            SectionLabel("精选剧本")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Self.presets) { p in
                        let on = selectedPreset == p.id
                        Button {
                            GameFeel.shared.tap()
                            withAnimation(Motion.panel) {
                                selectedPreset = p.id
                                options.template = p.template
                                options.nations = p.nations
                                options.provinces = String(p.provinces)
                                options.relations = p.relations
                                options.cultures = p.cultures
                                options.naming = "historical-names"
                            }
                        } label: {
                            HStack(spacing: 9) {
                                SealFace(text: p.seal, size: 28, color: on ? Theme.paper2 : Theme.seal, filled: !on)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 5) {
                                        Text(p.title).font(Theme.body).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                        Text("\(p.nations)国").font(Theme.kai(11))
                                            .foregroundStyle(on ? Theme.paper2.opacity(0.9) : Theme.seal)
                                    }
                                    Text(p.note).font(Theme.caption).foregroundStyle(on ? Theme.paper2.opacity(0.84) : Theme.ink2)
                                }
                            }
                            .padding(.horizontal, 12).padding(.vertical, 9)
                            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.16), lineWidth: 0.85))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            // 3. 地形模板（2×2 手绘微缩山河轮廓卡 + 战略标签）
            SectionLabel("山河格局")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(Names.templates, id: \.id) { t in
                    let on = options.template == t.id, art = Self.templateArt[t.id]
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { selectedPreset = nil; options.template = t.id }
                    } label: {
                        HStack(spacing: 10) {
                            TerrainSilhouette(template: t.id, active: on)
                                .frame(width: 38, height: 34)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    Text(t.name).font(Theme.body).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1)
                                    if let tag = art?.tag {
                                        Text(tag).font(Theme.kai(10))
                                            .foregroundStyle(on ? Theme.paper2.opacity(0.92) : Theme.seal)
                                            .padding(.horizontal, 5).padding(.vertical, 1)
                                            .background(on ? Theme.paper2.opacity(0.18) : Theme.seal.opacity(0.09), in: Capsule())
                                    }
                                }
                                Text(art?.note ?? "").font(Theme.caption).foregroundStyle(on ? Theme.paper2.opacity(0.84) : Theme.ink2).lineLimit(1).minimumScaleFactor(0.75)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 11).frame(height: 62)
                        .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.16), lineWidth: 0.85))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            // 4. 天下规模（一键快捷档位 + 精细步进器）
            SectionLabel("天下规模")
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 7) {
                    ForEach(Self.scalePresets) { sp in
                        let on = options.nations == sp.nations && options.provinceCount == sp.provinces
                        Button {
                            GameFeel.shared.tap()
                            withAnimation(Motion.tap) {
                                selectedPreset = nil
                                options.nations = sp.nations
                                options.provinces = String(sp.provinces)
                            }
                        } label: {
                            Text(sp.title).font(Theme.kai(12)).lineLimit(1).minimumScaleFactor(0.78)
                                .foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                .frame(maxWidth: .infinity).frame(height: 34)
                                .background(on ? Theme.seal : Theme.paper2.opacity(0.88), in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.15), lineWidth: 0.85))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                Group2 {
                    VStack(spacing: 10) {
                        PaperStepper(title: "国家数", value: $options.nations, range: 2...24, unit: "国")
                        Divider2()
                        PaperStepper(title: "州郡数", value: Binding(get: { options.provinceCount }, set: { options.provinces = String($0) }), range: options.nations...480, unit: "州")
                        Divider2()
                        HStack(spacing: 10) {
                            InkIcon(glyph: .refresh, size: 16, weight: 1.7).foregroundStyle(Theme.seal).frame(width: Theme.Layout.iconGutter)
                            Text("山河种子").font(Theme.body).foregroundStyle(Theme.ink2)
                            Spacer()
                            TextField("", text: $options.seed, prompt: Text("随机 · \(rolled.prefix(6))").foregroundColor(Theme.ink2.opacity(0.6)))
                                .paperField(width: 156).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                        }
                    }
                    .padding(12)
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
            // 渐进式披露：低频气候与纬度微调默认收起为带实时摘要的折叠节，保持开局界面清爽直观
            FoldSection("气候与纬度", expanded: false, summary: "降水 \(options.climate.rain)% · 气温 \(options.climate.temperature >= 0 ? "+" : "")\(options.climate.temperature)°") {
                VStack(spacing: 10) {
                    PaperStepper(title: "降水", value: $options.climate.rain, range: 10...200, unit: "%")
                    PaperStepper(title: "气温修正", value: $options.climate.temperature, range: -30...30, unit: "°")
                    PaperStepper(title: "北界纬度", value: $options.climate.north, range: -80...90, unit: "")
                    PaperStepper(title: "南界纬度", value: $options.climate.south, range: -90...80, unit: "")
                }
                .padding(Theme.Layout.cardPadding)
                .paperCard()
                .padding(.horizontal, Theme.Layout.pageInset)
            }
            SectionLabel("开局局势")
            HStack(spacing: 10) {
                choice("peace", "列国和平", "leaf", "各国相安，渐起争端", selection: $options.relations)
                choice("war", "群雄混战", "flag.2.crossed", "开局即四面开战", selection: $options.relations)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
            SectionLabel("命名体系")
            HStack(spacing: 10) {
                choice("historical-names", "历史真名", "book.closed", "取自史书的国名人名", selection: $options.naming)
                choice("culture-generated", "按文化生成", "character.book.closed", "按各文化新造名字", selection: $options.naming)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
            HStack(spacing: 8) {
                SectionLabel("文明文化（\(options.cultures.count)）", inset: false)
                Spacer()
                ForEach(Self.cultureGroups) { g in
                    Button(g.title) {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { options.cultures = g.list }
                    }
                    .font(Theme.caption).foregroundStyle(options.cultures == g.list ? Theme.paper2 : Theme.seal)
                    .padding(.horizontal, 9).frame(height: 26)
                    .background(options.cultures == g.list ? Theme.seal : Theme.seal.opacity(0.08), in: Capsule())
                }
            }
            .padding(.horizontal, Theme.Layout.sectionInset)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 8)], spacing: 8) {
                ForEach(Names.cultureIds, id: \.self) { c in
                    let on = options.cultures.contains(c)
                    Button {
                        withAnimation(Motion.tap) {
                            // At least one culture stays chosen.
                            if on { if options.cultures.count > 1 { options.cultures.remove(c) } } else { options.cultures.insert(c) }
                        }
                    } label: {
                        Text(Names.culture[c] ?? c).font(Theme.body).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                            .frame(maxWidth: .infinity).frame(height: 36)
                            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.16), lineWidth: 0.85))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
            Text("各国从所选文化中取名、宗教与政体。").font(Theme.caption).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset)
            VStack(spacing: 10) {
                Button { start(chosen) } label: { PrimaryLabel(title: "生成地图 · 启幕推演", symbol: "map") }.buttonStyle(PressStyle())
                if let draw {
                    Button { draw(chosen) } label: { SecondaryLabel(title: "手绘自定义地图", symbol: "paintbrush.pointed") }.buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset).padding(.top, 4)
        }
        .padding(.vertical, 18)
        }
        .scrollIndicators(.hidden)
        .task(id: "\(seed)|\(options.template)|\(previewShowNations ? options.nations : 0)") { await drawTerrain() }
    }
    /// 高清山河预览卡：统一温润宣纸胶囊浮标（移除深黑底块）、自适应横屏高度，并展示地形/势力切换与实测勘测数据。
    private var terrainCard: some View {
        let compactH = verticalClass == .compact
        return VStack(spacing: 0) {
            ZStack(alignment: .bottomTrailing) {
                Group {
                    if let terrain { Image(uiImage: terrain).resizable().scaledToFill().transition(.opacity) } else { Theme.paper2 }
                }
                .frame(maxWidth: .infinity)
                .frame(height: compactH ? 168 : 204)
                .clipped()
                .overlay(alignment: .topLeading) {
                    HStack(spacing: 5) {
                        Text(Names.templates.first(where: { $0.id == options.template })?.name ?? options.template)
                            .font(Theme.caption).foregroundStyle(Theme.ink)
                        Text("· \(options.nations)国 \(options.provinceCount)州")
                            .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                    }
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Theme.paper2.opacity(0.92), in: Capsule())
                    .overlay(Capsule().stroke(Theme.ink.opacity(0.16), lineWidth: 0.75))
                    .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.14), radius: 5, y: 2)
                    .padding(10)
                }
                .overlay(alignment: .topTrailing) {
                    // 地形图 / 势力分布实时切换宣纸胶囊
                    HStack(spacing: 2) {
                        ForEach([(false, "地貌"), (true, "势力")], id: \.0) { mode, label in
                            Button {
                                GameFeel.shared.tap()
                                withAnimation(Motion.tap) { previewShowNations = mode }
                            } label: {
                                Text(label).font(Theme.kai(11))
                                    .foregroundStyle(previewShowNations == mode ? Theme.paper2 : Theme.ink)
                                    .padding(.horizontal, 9).frame(height: 24)
                                    .background(previewShowNations == mode ? Theme.seal : Color.clear, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(2.5)
                    .background(Theme.paper2.opacity(0.92), in: Capsule())
                    .overlay(Capsule().stroke(Theme.ink.opacity(0.16), lineWidth: 0.75))
                    .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.14), radius: 5, y: 2)
                    .padding(10)
                }
                .overlay {
                    if renderingTerrain {
                        ZStack {
                            Theme.paper.opacity(0.30)
                            InkBusy()
                        }
                        .transition(.opacity)
                    }
                }
                Button {
                    GameFeel.shared.tap()
                    options.seed = ""; rolled = String(UInt32.random(in: 0...UInt32.max))
                } label: {
                    HStack(spacing: 5) {
                        InkIcon(glyph: .refresh, size: 13, weight: 1.8)
                        Text("换一方山河").font(Theme.label)
                    }
                    .foregroundStyle(Theme.paper2).padding(.horizontal, 12).frame(height: 32)
                    .background(Theme.seal, in: Capsule())
                    .shadow(color: Theme.seal.opacity(0.28), radius: 5, y: 2)
                }
                .buttonStyle(PressStyle()).padding(10)
            }
            // 底部地理勘测条：实时显示陆地占比、山地比例、林地与海岸特征
            HStack(spacing: 10) {
                if let st = terrainStats {
                    atlasStat(label: "陆地", value: "\(st.landPercent)%")
                    Divider().frame(height: 12)
                    atlasStat(label: "山地", value: "\(st.mountainPercent)%")
                    Divider().frame(height: 12)
                    atlasStat(label: "林泽", value: "\(st.forestPercent)%")
                    Divider().frame(height: 12)
                    atlasStat(label: "岸线", value: st.coastKind)
                } else {
                    Text("正在勘测此方山河地貌……").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(Theme.paper2.opacity(0.92))
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous).stroke(Theme.ink.opacity(0.18), lineWidth: 0.9))
        .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.10), radius: 8, y: 3)
        .animation(Motion.fade, value: renderingTerrain)
    }

    private func atlasStat(label: String, value: String) -> some View {
        HStack(spacing: 3) {
            Text(label).font(Theme.kai(11)).foregroundStyle(Theme.ink2)
            Text(value).font(Theme.kai(12)).foregroundStyle(Theme.ink).monospacedDigit()
        }
    }

    private func drawTerrain() async {
        guard let inputs else { return }
        if terrain != nil {
            // 切换剧本/国家数/种子时短暂防抖，避免快速连点引发多次后台 20k 网格光栅化抢占 CPU。
            try? await Task.sleep(nanoseconds: 110_000_000)
            guard !Task.isCancelled else { return }
        }
        renderingTerrain = true
        let seed = self.seed, template = options.template, n = previewShowNations ? options.nations : 0
        let res = await Task.detached(priority: .userInitiated) { terrainThumbnail(inputs, seed: seed, template: template, previewNations: n) }.value
        guard !Task.isCancelled else { return }
        withAnimation(Motion.fade) {
            terrain = res?.image
            terrainStats = res?.stats
            renderingTerrain = false
        }
    }
    /// A two-way choice as an illustrated card.
    private func choice(_ id: String, _ title: String, _ symbol: String, _ note: String, selection: Binding<String>) -> some View {
        let on = selection.wrappedValue == id
        return Button { withAnimation(Motion.tap) { selection.wrappedValue = id } } label: {
            VStack(spacing: 4) {
                Group {
                    if let g = GameActionLabel.glyph(for: symbol) {
                        InkIcon(glyph: g, size: 21, weight: 1.75)
                    } else {
                        Image(systemName: symbol).font(.system(size: 21, weight: .light))
                    }
                }
                .foregroundStyle(on ? Theme.paper2 : Theme.seal)
                Text(title).font(Theme.body).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                Text(note).font(Theme.caption).foregroundStyle(on ? Theme.paper2.opacity(0.85) : Theme.ink2).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 10)
            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.2)))
        }
        .buttonStyle(PressStyle())
    }
}

/// 开局选图页 4 种地形格局的手绘微缩舆图轮廓（多大陆 / 联合大陆 / 群岛 / 高山大岛）。
private struct TerrainSilhouette: View {
    let template: String
    let active: Bool
    var body: some View {
        let fg = active ? Theme.paper2 : Theme.seal
        let sea = active ? Theme.paper2.opacity(0.14) : Theme.jade.opacity(0.11)
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(sea)
            Canvas { ctx, size in
                let w = size.width, h = size.height
                func blob(_ pts: [(CGFloat, CGFloat)], fill: Color, stroke: Color) {
                    var p = Path()
                    guard let first = pts.first else { return }
                    p.move(to: CGPoint(x: first.0 * w, y: first.1 * h))
                    for pt in pts.dropFirst() { p.addLine(to: CGPoint(x: pt.0 * w, y: pt.1 * h)) }
                    p.closeSubpath()
                    ctx.fill(p, with: .color(fill))
                    ctx.stroke(p, with: .color(stroke), lineWidth: 1.0)
                }
                let landFill = fg.opacity(active ? 0.30 : 0.22)
                let landStroke = fg.opacity(active ? 0.92 : 0.82)
                switch template {
                case "pangea":
                    blob([(0.18, 0.30), (0.45, 0.16), (0.76, 0.24), (0.86, 0.50), (0.72, 0.78), (0.42, 0.84), (0.16, 0.66)], fill: landFill, stroke: landStroke)
                case "archipelago":
                    blob([(0.16, 0.24), (0.34, 0.20), (0.36, 0.38), (0.20, 0.42)], fill: landFill, stroke: landStroke)
                    blob([(0.54, 0.18), (0.76, 0.22), (0.80, 0.42), (0.58, 0.40)], fill: landFill, stroke: landStroke)
                    blob([(0.24, 0.58), (0.44, 0.56), (0.46, 0.78), (0.26, 0.80)], fill: landFill, stroke: landStroke)
                    blob([(0.62, 0.60), (0.84, 0.56), (0.82, 0.80), (0.64, 0.78)], fill: landFill, stroke: landStroke)
                case "highIsland":
                    blob([(0.18, 0.46), (0.38, 0.20), (0.66, 0.22), (0.84, 0.52), (0.68, 0.80), (0.32, 0.78)], fill: landFill, stroke: landStroke)
                    var ridge = Path()
                    ridge.move(to: CGPoint(x: 0.32 * w, y: 0.58 * h))
                    ridge.addLine(to: CGPoint(x: 0.48 * w, y: 0.34 * h))
                    ridge.addLine(to: CGPoint(x: 0.60 * w, y: 0.54 * h))
                    ridge.addLine(to: CGPoint(x: 0.68 * w, y: 0.42 * h))
                    ridge.addLine(to: CGPoint(x: 0.76 * w, y: 0.60 * h))
                    ctx.stroke(ridge, with: .color(landStroke), style: StrokeStyle(lineWidth: 1.3, lineCap: .round, lineJoin: .round))
                default: // continents
                    blob([(0.12, 0.24), (0.42, 0.18), (0.48, 0.48), (0.34, 0.78), (0.14, 0.64)], fill: landFill, stroke: landStroke)
                    blob([(0.56, 0.22), (0.86, 0.26), (0.88, 0.58), (0.66, 0.80), (0.54, 0.56)], fill: landFill, stroke: landStroke)
                }
            }
        }
    }
}

// While the engine builds a world: ink drops spreading on paper.
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

/// 经典开卷阶段浮卡：铺纸注海 → 勾勒海岸 → 晕染山河 → 冲刷江河 → 划分州郡 → 分封列国 → 勘定国界 → 营建城邦，
/// 实时跟随显卡开卷时钟与引擎建世阶段推进。
struct FoundingView: View {
    @ObservedObject var controller: MapController
    let cancel: () -> Void
    private var reveal: Float { controller.reveal }
    static let stages: [(until: Float, text: String)] = [
        (0.15, "铺纸注海"), (0.30, "勾勒海岸"), (0.44, "晕染山河"), (0.50, "冲刷江河，播撒林木"),
        (0.56, "划分州郡"), (0.75, "分封列国"), (0.85, "勘定国界"), (1.00, "营建城邦与港口"),
    ]
    static let later = ["诞生世家与人物", "编练军队", "缔结邦交", "天下初定"]
    @State private var started = Date()
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.35)) { context in
            let waited = reveal >= 1 ? context.date.timeIntervalSince(started) : 0
            let laterIndex = min(Self.later.count - 1, controller.foundingStage)
            let current = reveal < 1 ? (Self.stages.firstIndex { reveal < $0.until } ?? Self.stages.count - 1) : Self.stages.count + laterIndex
            let all = Self.stages.map(\.text) + Self.later
            let creep: Double = (1 - exp(-waited / 8)) * 0.9
            let progress: Double = reveal < 1 ? Double(reveal) * 0.85 : 0.85 + (Double(laterIndex) + creep) / Double(Self.later.count) * 0.15
            VStack {
                Spacer()
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(max(0, current - 3)..<current, id: \.self) { i in
                        HStack(spacing: 8) {
                            InkIcon(glyph: .peace, size: 12, weight: 1.8).foregroundStyle(Theme.jade)
                            Text(all[i]).font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                        }
                        .opacity(0.45 + 0.18 * Double(i - (current - 3)))
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    HStack(spacing: 8) {
                        SealFace(text: "卷", size: 22, color: Theme.seal)
                        Text(all[min(current, all.count - 1)] + "……").font(Theme.kai(20)).foregroundStyle(Theme.ink)
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
                    if waited > 20 {
                        HStack(spacing: 8) {
                            Text("比平时久一些，仍在推算").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                            Spacer(minLength: 8)
                            Button(action: cancel) { Text("放弃，回标题").font(Theme.kai(13)).foregroundStyle(Theme.seal) }.buttonStyle(PressStyle())
                        }
                        .transition(.opacity)
                    }
                }
                .animation(Motion.panel, value: current)
                .animation(Motion.fade, value: progress)
                .animation(Motion.fade, value: waited > 20)
                .padding(.horizontal, 20).padding(.vertical, 16)
                .frame(maxWidth: 360, alignment: .leading)
                .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerSheet, style: .continuous))
                .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.2), radius: 12, y: 5)
                .padding(.bottom, 40)
            }
            .onChange(of: reveal >= 1) { _, done in if done { started = Date() } }
        }
    }
}
