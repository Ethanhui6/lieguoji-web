import SwiftUI
import Combine
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
            guard !Task.isCancelled else { return }
            for i in 1...3 {
                withAnimation(Motion.reveal) { brushed = i }
                try? await Task.sleep(nanoseconds: 260_000_000)
                guard !Task.isCancelled else { return }
            }
            try? await Task.sleep(nanoseconds: 140_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(Motion.stamp) { stamped = true }
            withAnimation(.easeOut(duration: 0.6)) { stampRing = true }
            GameFeel.shared.tap()
            withAnimation(Motion.reveal.delay(0.15)) { motto = true }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(Motion.reveal) { dried = true }
            try? await Task.sleep(nanoseconds: 420_000_000)
            guard !Task.isCancelled else { return }
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

/// The app's seal: authentic carved cinnabar seal stamp (「龍」).
struct SealMark: View {
    var size: CGFloat
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.14, style: .continuous)
                .fill(Theme.paperLight.opacity(0.92))
                .frame(width: size * 1.08, height: size * 1.08)
            Seal(text: "龙", size: size)
        }
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
    @State private var authOpen = false
    @State private var hubOpen = false
    @State private var hubTab = "profile"
    @State private var updateSheetOpen = false
    @State private var hotUpdateSheetOpen = false
    @State private var createDetent: PresentationDetent = .fraction(0.89)
    @State private var pendingLaunchTask: Task<Void, Never>?
    private var anySheetOpen: Bool {
        creating || archive || settings || notes || importing || authOpen || hubOpen || updateSheetOpen || hotUpdateSheetOpen
    }
    /// A line of the classics under the title, changing each launch (merges hot-updated mottos).
    private static let mottos = ["天下大势，分久必合，合久必分", "兴，百姓苦；亡，百姓苦", "江山如画，一时多少豪杰", "运筹帷幄之中，决胜千里之外", "苟利国家生死以"]
    @State private var motto = (TitleView.mottos + HotPackManager.shared.extraMottos).randomElement() ?? "天下大势，分久必合，合久必分"
    @ObservedObject private var platform = OnlinePlatform.shared
    @ObservedObject private var hotPack = HotPackManager.shared
    var body: some View {
        ZStack {
            // Ink at the top, paper at the bottom: the title and the actions read over any world.
            // A soft ink wash from the very top edge (no band under the status bar): it fades out over a third.
            LinearGradient(stops: [.init(color: SplashView.night.opacity(0.5), location: 0), .init(color: SplashView.night.opacity(0.22), location: 0.16), .init(color: SplashView.night.opacity(0), location: 0.4),
                                   .init(color: Theme.paper.opacity(0), location: 0.5), .init(color: Theme.paper.opacity(0.96), location: 0.74)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea().allowsHitTesting(false)
            // 左上角题名墨晕衬底：改用纯径向渐变替代全屏 .mask 离屏合成，彻底消除主页 Metal 地图上方的离屏合成掉帧。
            RadialGradient(
                colors: [SplashView.night.opacity(0.68), SplashView.night.opacity(0.28), SplashView.night.opacity(0)],
                center: .topLeading,
                startRadius: 20,
                endRadius: 340
            )
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
                    VStack(alignment: .trailing, spacing: 6) {
                        TitleOnlineHeader(
                            platform: platform,
                            hotPack: hotPack,
                            onOpenHub: { tab in hubTab = tab; hubOpen = true },
                            onOpenAuth: { authOpen = true },
                            onOpenHotUpdate: { hotUpdateSheetOpen = true }
                        )
                        if let upd = platform.updateInfo, upd.hasAppUpdate {
                            Button {
                                GameFeel.shared.tap()
                                updateSheetOpen = true
                            } label: {
                                HStack(spacing: 5) {
                                    PhosphorIcon(glyph: .lightning, size: 11, weight: .fill)
                                    Text("发现新版 v\(upd.latestVersion) · 满速更新")
                                        .font(Theme.caption)
                                        .monospacedDigit()
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.76)
                                }
                                .foregroundStyle(Theme.paperLight)
                                .padding(.horizontal, 10)
                                .frame(minHeight: 34)
                                .background(Theme.seal, in: Capsule())
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                    .frame(maxWidth: 196, alignment: .trailing)
                    .padding(.trailing, 18)
                    .padding(.top, 8)
                    .opacity(shown ? 1 : 0)
                    .animation(Motion.reveal.delay(0.24), value: shown)
                }
                .padding(.leading, 26).padding(.top, 12)
                Spacer()
                VStack(spacing: 12) {
                    HotpatchSyncBanner(platform: platform, hotPack: hotPack)
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
                        Button {
                            hubTab = "update"
                            hubOpen = true
                        } label: { TileAction(title: platform.updateInfo?.hasAppUpdate == true ? "有新版" : "云更新", symbol: "book.pages") }
                    }
                    .rise(shown, 0.16)
                    Button {
                        GameFeel.shared.tap()
                        hubTab = "update"
                        hubOpen = true
                    } label: {
                        let hpVer = max(CloudConfig.shared.version, platform.hotpatchVersion)
                        let hpPart = hpVer > 0 ? " · 云热更 v\(hpVer)" : ""
                        let rttPart = platform.apiRTTMs.map { " · \($0)ms" } ?? ""
                        Text("\(AppVersion.text)\(hpPart)\(rttPart)")
                            .font(Theme.caption).foregroundStyle(Theme.ink2.opacity(0.78)).monospacedDigit()
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                }
                .buttonStyle(PressStyle())
                .frame(maxWidth: 440)
                .padding(.horizontal, Theme.Layout.sectionInset).padding(.bottom, 26)
            }
        }
        .statusBarHidden()
        .onAppear {
            model.controller.sheetOpen = anySheetOpen
            model.controller.sheetBottomFraction = anySheetOpen ? 0.89 : 0
            shown = false
            withAnimation(Motion.drift.delay(model.controller.reveal < 1 ? 0.9 : 0.1)) { shown = true }
        }
        .onDisappear {
            model.controller.sheetOpen = false
            model.controller.sheetBottomFraction = 0
            pendingLaunchTask?.cancel()
            pendingLaunchTask = nil
        }
        .onChange(of: anySheetOpen) { _, open in
            model.controller.sheetOpen = open
            model.controller.sheetBottomFraction = open ? 0.89 : 0
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
            NewWorldSheet(
                start: { options in
                    creating = false
                    pendingLaunchTask?.cancel()
                    pendingLaunchTask = Task { @MainActor in
                        if !ShotTour.on {
                            try? await Task.sleep(nanoseconds: 230_000_000)
                        }
                        guard !Task.isCancelled else { return }
                        await model.generate(options)
                    }
                },
                draw: { options in
                    creating = false
                    pendingLaunchTask?.cancel()
                    pendingLaunchTask = Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 210_000_000)
                        guard !Task.isCancelled else { return }
                        model.openEditor(options)
                    }
                },
                startScenario: { scenario in
                    creating = false
                    pendingLaunchTask?.cancel()
                    pendingLaunchTask = Task { @MainActor in
                        if !ShotTour.on {
                            try? await Task.sleep(nanoseconds: 230_000_000)
                        }
                        guard !Task.isCancelled else { return }
                        await model.generateHistorical(scenario)
                    }
                },
                drawScenario: { scenario in
                    creating = false
                    pendingLaunchTask?.cancel()
                    pendingLaunchTask = Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 210_000_000)
                        guard !Task.isCancelled else { return }
                        var opts = GameModel.NewWorld()
                        let cap = NativeHost.selectedResolutionTier.maxProvinces
                        opts.historicalScenario = scenario
                        opts.nations = max(2, min(100, scenario.nations.count))
                        opts.provinces = String(max(opts.nations, min(cap, scenario.provinceCount)))
                        model.openEditor(opts)
                        model.editor?.applyHistoricalScenario(scenario)
                    }
                },
                inputs: model.previewInputs
            )
            .presentationDetents([.medium, .fraction(0.89)], selection: $createDetent).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $archive) {
            WorldArchiveSheet(model: model, open: { world in
                archive = false
                pendingLaunchTask?.cancel()
                pendingLaunchTask = Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 220_000_000)
                    guard !Task.isCancelled else { return }
                    await model.openArchived(world)
                }
            }, onCloudOpened: { archive = false })
            .presentationDetents([.medium, .fraction(0.89)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
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
                    SectionLabel("远程计算与云端存档")
                    RemoteSettings(model: model)
                }
                .padding(.bottom, 24)
            }
            .presentationDetents([.medium, .fraction(0.89)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $notes) { ReleaseNotesSheet().presentationDetents([.fraction(0.89)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden) }
        .sheet(isPresented: $authOpen) {
            AuthPortalSheet(platform: platform, onAuthenticated: {
                hubTab = "profile"
                hubOpen = true
            })
            .presentationDetents([.fraction(0.92)])
            .presentationCornerRadius(Theme.Control.cornerSheet)
            .presentationBackground { MemorialPaper() }
            .presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $hubOpen) {
            OnlineHubSheet(platform: platform, model: model, initialTab: hubTab, onOpenArchive: {
                pendingLaunchTask?.cancel()
                pendingLaunchTask = Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 240_000_000)
                    guard !Task.isCancelled else { return }
                    archive = true
                }
            })
            .presentationDetents([.fraction(0.92)])
            .presentationCornerRadius(Theme.Control.cornerSheet)
            .presentationBackground { MemorialPaper() }
            .presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $updateSheetOpen) {
            CloudUpdateSheet(platform: platform)
                .onReceive(platform.$showUpdateSheet.dropFirst()) { shown in
                    if !shown { updateSheetOpen = false }
                }
                .interactiveDismissDisabled(platform.updateInfo?.forceUpdate == true)
                .presentationDetents([.fraction(0.88)])
                .presentationCornerRadius(Theme.Control.cornerSheet)
                .presentationBackground { MemorialPaper() }
                .presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $hotUpdateSheetOpen) {
            HotUpdateSheet(hotPack: hotPack) {
                await model.applyCloud()
            }
            .presentationDetents([.fraction(0.86)])
            .presentationCornerRadius(Theme.Control.cornerSheet)
            .presentationBackground { MemorialPaper() }
            .presentationDragIndicator(.hidden)
        }
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

/// 标题页主操作钮（与游戏内 4.3 极简宣纸风 100% 统一：纯净扁平朱砂主钮 / 亮宣细墨次钮，零厚影零杂边）。
struct HeroAction: View {
    let title: String; let detail: String; let symbol: String
    var primary = true
    var body: some View {
        HStack(spacing: 14) {
            InkIcon(glyph: GameActionLabel.glyph(for: symbol) ?? .edict, size: 21, weight: 1.7, filled: false)
                .foregroundStyle(primary ? Theme.paperLight : Theme.seal)
            .frame(width: 40, height: 40)
            .background(primary ? Theme.paperLight.opacity(0.14) : Theme.seal.opacity(0.07), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(Theme.serif(20)).tracking(1.6).foregroundStyle(primary ? Theme.paperLight : Theme.ink)
                Text(detail).font(Theme.caption).foregroundStyle(primary ? Theme.paperLight.opacity(0.84) : Theme.ink2).lineLimit(1)
            }
            Spacer(minLength: 6)
            PhosphorIcon(glyph: .chevronRight, size: 14, weight: .light)
                .foregroundStyle(primary ? Theme.paperLight.opacity(0.85) : Theme.ink2)
        }
        .padding(.horizontal, 16).frame(height: 66)
        .background(primary ? Theme.seal : Theme.paperLight.opacity(0.96), in: RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous)
                .stroke(primary ? Color.clear : Theme.hairline, lineWidth: 0.75)
        )
        .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
    }
}

/// 标题页底排四枚极简宣纸功钮（与游戏内 4.3 留白统一，零阴影零多余套边）。
struct TileAction: View {
    let title: String; let symbol: String
    var body: some View {
        VStack(spacing: 6) {
            InkIcon(glyph: GameActionLabel.glyph(for: symbol) ?? .edict, size: 19, weight: 1.6)
                .foregroundStyle(Theme.ink).frame(height: 22)
            Text(title).font(Theme.label).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity).frame(height: 60)
        .background(Theme.paperLight.opacity(0.94), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
        .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
    }
}

/// 生成地图: the original's terrain templates and the number of states.
struct NewWorldSheet: View {
    enum LaunchMode: String, CaseIterable, Identifiable {
        case standard = "标准架空"
        case historical = "历史剧本"
        case workshop = "玩家工坊"
        var id: String { rawValue }
        var seal: String {
            switch self {
            case .standard: return "新"
            case .historical: return "史"
            case .workshop: return "坊"
            }
        }
        var subtitle: String {
            switch self {
            case .standard: return "择一方山河 · 启一卷史诗"
            case .historical: return "真实世界地理底图 · 史实名君格局"
            case .workshop: return "本机自绘典藏 · 云端玩家舆图工坊"
            }
        }
    }

    let start: (GameModel.NewWorld) -> Void
    /// 自绘地图 with these options.
    var draw: ((GameModel.NewWorld) -> Void)? = nil
    /// 直接开启官方或工坊历史剧本。
    var startScenario: ((HistoricalScenario) -> Void)? = nil
    /// 将历史剧本载入自绘地图编辑器微调。
    var drawScenario: ((HistoricalScenario) -> Void)? = nil
    /// The original grid, for the picture of the land this seed makes.
    var inputs: PreviewWorld.Inputs? = nil
    @Environment(\.verticalSizeClass) private var verticalClass
    @State private var launchMode: LaunchMode = .standard
    @State private var options = GameModel.NewWorld()
    /// The seed used while the field is left blank, so the land shown is the land founded.
    @State private var rolled = String(UInt32.random(in: 0...UInt32.max))
    @State private var terrain: UIImage?
    @State private var previousTerrain: UIImage?
    @State private var terrainSerial: Int = 0
    @State private var terrainStats: PreviewWorld.ThumbnailStats?
    @State private var previewShowNations = true
    @State private var renderingTerrain = false
    @State private var immediateRoll = true
    @State private var refreshSpin: Double = 0
    @State private var seedCopied = false
    @State private var seedCopySerial = 0
    @State private var selectedPreset: String? = nil
    private var seed: String { options.seed.isEmpty ? rolled : options.seed }
    private var chosen: GameModel.NewWorld { var o = options; o.seed = seed; return o }
    struct ScenarioPreset: Identifiable {
        let id: String; let title: String; let note: String; let seal: String; let symbol: String
        let template: String; let nations: Int; let provinces: Int; let relations: String; let cultures: Set<String>
    }
    @ObservedObject private var hotPack = HotPackManager.shared
    private var allPresets: [ScenarioPreset] {
        var seen = Set(Self.presets.map(\.id))
        var out = Self.presets
        for p in hotPack.extraScenarios where seen.insert(p.id).inserted {
            let validCultures = Set(p.cultures.filter { Names.culture[$0] != nil })
            out.append(ScenarioPreset(
                id: p.id, title: p.title, note: p.note, seal: p.seal, symbol: p.symbol,
                template: p.template, nations: max(2, min(28, p.nations)), provinces: max(20, min(320, p.provinces)),
                relations: p.relations == "war" ? "war" : "peace",
                cultures: validCultures.isEmpty ? Set(Names.cultureIds) : validCultures
            ))
        }
        return out
    }
    static let presets: [ScenarioPreset] = [
        ScenarioPreset(id: "huaxia", title: "华夏群雄", note: "中原大陆 · 诸侯并起", seal: "夏", symbol: "crown", template: "pangea", nations: 12, provinces: 140, relations: "peace", cultures: ["chinese", "korean", "mongol", "vietnamese", "japanese"]),
        ScenarioPreset(id: "zhanguo", title: "战国七雄", note: "七强接壤 · 合纵连横", seal: "战", symbol: "flag.2.crossed", template: "pangea", nations: 7, provinces: 110, relations: "war", cultures: ["chinese"]),
        ScenarioPreset(id: "seahegemon", title: "海权争霸", note: "岛国舰队 · 跨海即战", seal: "舰", symbol: "anchor", template: "archipelago", nations: 10, provinces: 125, relations: "war", cultures: ["english", "spanish", "portuguese", "dutch", "japanese", "chinese", "norse", "italian"]),
        ScenarioPreset(id: "steppe", title: "大漠铁骑", note: "草原诸部 · 铁骑纵横", seal: "骑", symbol: "flag.2.crossed", template: "pangea", nations: 10, provinces: 135, relations: "war", cultures: ["mongol", "turkic", "chinese", "persian", "slavic", "hungarian", "tibetan"]),
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
            SheetHeader(title: "新世界", subtitle: launchMode.subtitle, seal: launchMode.seal)

            // 三段式宋韵开世模式切换（标准架空 | 历史剧本 | 玩家工坊）
            HStack(spacing: 4) {
                ForEach(LaunchMode.allCases) { m in
                    let on = launchMode == m
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.panel) { launchMode = m }
                    } label: {
                        HStack(spacing: 5) {
                            Text(m.rawValue)
                                .font(Theme.serif(14.5))
                                .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.84)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background(on ? Theme.seal : Color.clear, in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(3.5)
            .background(Theme.wash.opacity(0.62), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
            .padding(.horizontal, Theme.Layout.pageInset)

            switch launchMode {
            case .standard:
                standardBuilderContent
            case .historical:
                HistoricalAtlasBrowserView(
                    inputs: inputs,
                    onPlayScenario: { sc in startScenario?(sc) },
                    onEditScenario: drawScenario
                )
            case .workshop:
                PlayerWorkshopBrowserView(
                    inputs: inputs,
                    onPlayScenario: { sc in startScenario?(sc) },
                    onOpenEditor: { draw?(chosen) },
                    onEditScenario: drawScenario
                )
            }
        }
        .padding(.vertical, 18)
        }
        .scrollIndicators(.hidden)
        .task(id: "\(launchMode.rawValue)|\(seed)|\(options.template)|\(previewShowNations ? options.nations : 0)") {
            guard launchMode == .standard else { return }
            await drawTerrain()
        }
        .task(id: seedCopySerial) {
            guard seedCopySerial > 0 else { return }
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(Motion.fade) { seedCopied = false }
        }
    }

    @ViewBuilder
    private var standardBuilderContent: some View {
            // 1. 顶部实时高清山河预览卡（支持「地形地貌 / 势力分布」即时切换 + 陆海山地实测数据 + 换图按钮）
            if inputs != nil { terrainCard.padding(.horizontal, Theme.Layout.pageInset) }

            // 2. 精选剧本（内置 8 套 + 云端热更动态扩展剧本，免换包随时扩充）
            SectionLabel(hotPack.extraScenarios.isEmpty ? "精选剧本" : "精选剧本（含 \(hotPack.extraScenarios.count) 套热更剧本）")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(allPresets) { p in
                        let on = selectedPreset == p.id
                        Button {
                            GameFeel.shared.tap()
                            immediateRoll = true
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
                            HStack(spacing: 10) {
                                SealFace(text: p.seal, size: 28, color: on ? Theme.paperLight : Theme.seal, filled: false)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(p.title).font(Theme.serif(15)).foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                        Text("\(p.nations)国").font(Theme.numeral(13))
                                            .foregroundStyle(on ? Theme.paperLight.opacity(0.88) : Theme.seal)
                                            .monospacedDigit()
                                    }
                                    Text(p.note).font(Theme.caption).foregroundStyle(on ? Theme.paperLight.opacity(0.8) : Theme.ink2)
                                }
                            }
                            .padding(.horizontal, 13).padding(.vertical, 10)
                            .background(on ? Theme.seal : Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.7))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            // 3. 地形模板（2×2 精细等高线微缩舆图卡 + 特色朱砂选中态与轻盈宣纸未选态）
            SectionLabel("山河格局")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(Names.templates, id: \.id) { t in
                    let on = options.template == t.id, art = Self.templateArt[t.id]
                    Button {
                        GameFeel.shared.tap()
                        immediateRoll = true
                        withAnimation(Motion.tap) { selectedPreset = nil; options.template = t.id }
                    } label: {
                        HStack(spacing: 9) {
                            TerrainSilhouette(template: t.id, active: on)
                                .frame(width: 48, height: 48)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(t.name)
                                    .font(Theme.serif(15))
                                    .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.86)
                                if let tag = art?.tag {
                                    Text(tag)
                                        .font(Theme.caption)
                                        .foregroundStyle(on ? Theme.paperLight.opacity(0.92) : Theme.seal)
                                        .lineLimit(1)
                                }
                                Text(art?.note ?? "")
                                    .font(Theme.sans(11))
                                    .foregroundStyle(on ? Theme.paperLight.opacity(0.78) : Theme.ink2)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.76)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 10)
                        .frame(minHeight: 74)
                        .background(on ? Theme.seal : Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.7))
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
                            immediateRoll = true
                            withAnimation(Motion.tap) {
                                selectedPreset = nil
                                options.nations = sp.nations
                                options.provinces = String(sp.provinces)
                            }
                        } label: {
                            Text(sp.title).font(Theme.sans(12.5)).lineLimit(1).minimumScaleFactor(0.76)
                                .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                .frame(maxWidth: .infinity).frame(height: 36)
                                .background(on ? Theme.seal : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.65))
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
            SectionLabel("叛乱设置")
            RebelModeSelector(selection: $options.rebelMode, compact: false)
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
                    let active = options.cultures == g.list
                    Button(g.title) {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { options.cultures = g.list }
                    }
                    .font(Theme.caption)
                    .foregroundStyle(active ? Theme.paperLight : Theme.ink)
                    .padding(.horizontal, 10).frame(height: 28)
                    .background(active ? Theme.seal : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(active ? Color.clear : Theme.hairline, lineWidth: 0.65))
                }
            }
            .padding(.horizontal, Theme.Layout.sectionInset)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 8)], spacing: 8) {
                ForEach(Names.cultureIds, id: \.self) { c in
                    let on = options.cultures.contains(c)
                    Button {
                        withAnimation(Motion.tap) {
                            if on { if options.cultures.count > 1 { options.cultures.remove(c) } } else { options.cultures.insert(c) }
                        }
                    } label: {
                        Text(Names.culture[c] ?? c).font(Theme.body).foregroundStyle(on ? Theme.paperLight : Theme.ink)
                            .frame(maxWidth: .infinity).frame(height: 36)
                            .background(on ? Theme.seal : Theme.wash.opacity(0.52), in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.65))
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
    /// 高清山河预览卡：双缓冲水墨溶叠过渡（彻底移除丑陋的全宽横线进度条）、宣纸胶囊浮标、战略地势评语与顺滑换图旋钮。
    private var terrainCard: some View {
        let compactH = verticalClass == .compact
        return VStack(spacing: 0) {
            ZStack(alignment: .bottomTrailing) {
                ZStack {
                    Theme.paper2
                    if let previousTerrain {
                        Image(uiImage: previousTerrain)
                            .resizable()
                            .interpolation(.high)
                            .scaledToFill()
                    }
                    if let terrain {
                        Image(uiImage: terrain)
                            .resizable()
                            .interpolation(.high)
                            .scaledToFill()
                            .id(terrainSerial)
                            .transition(.opacity.combined(with: .scale(scale: 1.022)))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: compactH ? 168 : 204)
                .clipped()
                .contentShape(Rectangle())
                .onTapGesture {
                    GameFeel.shared.tap()
                    immediateRoll = true
                    withAnimation(Motion.tap) { previewShowNations.toggle() }
                }
                .overlay(alignment: .topLeading) {
                    Button {
                        UIPasteboard.general.string = seed
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { seedCopied = true }
                        seedCopySerial &+= 1
                    } label: {
                        HStack(spacing: 5) {
                            Text(Names.templates.first(where: { $0.id == options.template })?.name ?? options.template)
                                .font(Theme.caption).foregroundStyle(Theme.ink)
                            Text(seedCopied ? "· 已复制种子" : "· \(options.nations)国 \(options.provinceCount)州")
                                .font(Theme.caption).foregroundStyle(seedCopied ? Theme.seal : Theme.ink2).monospacedDigit()
                        }
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Theme.paper2.opacity(0.92), in: Capsule())
                        .overlay(Capsule().stroke(Theme.ink.opacity(0.16), lineWidth: 0.75))
                        .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.14), radius: 5, y: 2)
                    }
                    .buttonStyle(PressStyle())
                    .padding(10)
                }
                .overlay(alignment: .topTrailing) {
                    // 地形图 / 势力分布实时切换宣纸胶囊
                    HStack(spacing: 2) {
                        ForEach([(false, "地貌"), (true, "势力")], id: \.0) { mode, label in
                            Button {
                                GameFeel.shared.tap()
                                immediateRoll = true
                                withAnimation(Motion.tap) { previewShowNations = mode }
                            } label: {
                                Text(label).font(Theme.caption)
                                    .foregroundStyle(previewShowNations == mode ? Theme.paperLight : Theme.ink)
                                    .padding(.horizontal, 10).frame(height: 26)
                                    .background(previewShowNations == mode ? Theme.seal : Color.clear, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(2.5)
                    .background(Theme.paperLight.opacity(0.94), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
                    .padding(10)
                }
                Button {
                    GameFeel.shared.tap()
                    immediateRoll = true
                    withAnimation(.snappy(duration: 0.36, extraBounce: 0.10)) {
                        refreshSpin += 180
                    }
                    options.seed = ""
                    rolled = String(UInt32.random(in: 0...UInt32.max))
                } label: {
                    HStack(spacing: 5) {
                        InkIcon(glyph: .refresh, size: 13.5, weight: 1.75)
                            .rotationEffect(.degrees(refreshSpin))
                        Text("换一方山河").font(Theme.label)
                    }
                    .foregroundStyle(Theme.paperLight).padding(.horizontal, 13).frame(height: 34)
                    .background(Theme.seal.opacity(renderingTerrain ? 0.82 : 0.96), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.paperLight.opacity(0.24), lineWidth: 0.7))
                }
                .buttonStyle(PressStyle()).padding(10)
            }
            // 底部地理勘测条：单行不换行 + 清晰古典数字 + 右侧战略评语
            HStack(spacing: 7) {
                if let st = terrainStats {
                    atlasStat(label: "陆地", value: "\(st.landPercent)%")
                    Rectangle().fill(Theme.hairline).frame(width: 0.75, height: 12)
                    atlasStat(label: "山地", value: "\(st.mountainPercent)%")
                    Rectangle().fill(Theme.hairline).frame(width: 0.75, height: 12)
                    atlasStat(label: "林泽", value: "\(st.forestPercent)%")
                    Spacer(minLength: 4)
                    Text(terrainVerdict(st))
                        .font(Theme.caption)
                        .foregroundStyle(Theme.seal)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                } else {
                    Text("正在铺宣勘绘山河……").font(Theme.caption).foregroundStyle(Theme.ink2)
                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(Theme.paperLight)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
    }

    private func terrainVerdict(_ st: PreviewWorld.ThumbnailStats) -> String {
        if st.landPercent <= 28 || options.template == "archipelago" {
            return "星罗海疆 · 舟师争雄"
        }
        if st.mountainPercent >= 26 {
            return "崇山天险 · 关隘易守"
        }
        if st.forestPercent >= 38 {
            return "林泽丰茂 · 奇兵伏击"
        }
        if st.landPercent >= 56 {
            return "广袤中土 · 铁骑逐鹿"
        }
        return "\(st.coastKind) · 陆海兼资"
    }

    private func atlasStat(label: String, value: String) -> some View {
        HStack(spacing: 3) {
            Text(label).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1).fixedSize(horizontal: true, vertical: false)
            EditorialValueText(value, size: 13.5, color: Theme.ink)
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private func drawTerrain() async {
        guard let inputs else { return }
        let fast = immediateRoll || terrain == nil
        immediateRoll = false
        if !fast {
            // 仅在连续拨动数字步进器时轻微防抖 65ms；点击「换一方山河」零延迟立即生成！
            try? await Task.sleep(nanoseconds: 65_000_000)
            guard !Task.isCancelled else { return }
        }
        renderingTerrain = true
        let seed = self.seed, template = options.template, n = previewShowNations ? options.nations : 0
        let res = await Task.detached(priority: .userInitiated) { terrainThumbnail(inputs, seed: seed, template: template, previewNations: n) }.value
        guard !Task.isCancelled else { return }
        if let nextImage = res?.image {
            previousTerrain = terrain
            withAnimation(.smooth(duration: 0.30)) {
                terrain = nextImage
                terrainSerial &+= 1
                terrainStats = res?.stats
                renderingTerrain = false
            }
        } else {
            renderingTerrain = false
        }
    }
    /// A two-way tactile choice card (deep ink active / tactile rice paper inactive).
    private func choice(_ id: String, _ title: String, _ symbol: String, _ note: String, selection: Binding<String>) -> some View {
        let on = selection.wrappedValue == id
        return Button { GameFeel.shared.tap(); withAnimation(Motion.tap) { selection.wrappedValue = id } } label: {
            VStack(spacing: 5) {
                InkIcon(glyph: GameActionLabel.glyph(for: symbol) ?? .edict, size: 20, weight: 1.7, filled: on)
                    .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                Text(title).font(Theme.serif(15)).foregroundStyle(on ? Theme.paperLight : Theme.ink)
                Text(note).font(Theme.caption).foregroundStyle(on ? Theme.paperLight.opacity(0.8) : Theme.ink2).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 11).padding(.horizontal, 6)
            .background(on ? Theme.seal : Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.7))
        }
        .buttonStyle(PressStyle())
    }
}

/// 开局选图页 4 种「山河格局」的精细微型等高线舆图缩略图（多大陆 / 联合大陆 / 群岛 / 高山大岛）：
/// 采用闭合 Catmull-Rom 有机海岸曲线、浅滩晕圈、多层海拔等高线、山脊人字峰与海浪纹绘就，彻底告别粗糙多边形。
private struct TerrainSilhouette: View {
    let template: String
    let active: Bool

    /// 将控制点列表生成顺滑闭合的有机海岸曲线（Catmull-Rom 样条转三次贝塞尔）。
    private static func organicLoop(_ pts: [(CGFloat, CGFloat)], in size: CGSize) -> Path {
        let n = pts.count
        guard n >= 3 else { return Path() }
        let cg = pts.map { CGPoint(x: $0.0 * size.width, y: $0.1 * size.height) }
        var p = Path()
        p.move(to: cg[0])
        for i in 0..<n {
            let p0 = cg[(i - 1 + n) % n]
            let p1 = cg[i]
            let p2 = cg[(i + 1) % n]
            let p3 = cg[(i + 2) % n]
            let c1 = CGPoint(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6)
            let c2 = CGPoint(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6)
            p.addCurve(to: p2, control1: c1, control2: c2)
        }
        p.closeSubpath()
        return p
    }

    var body: some View {
        let seaTop = active ? Color.white.opacity(0.16) : Color(red: 0.72, green: 0.82, blue: 0.84).opacity(0.46)
        let seaBot = active ? Color.black.opacity(0.14) : Color(red: 0.56, green: 0.71, blue: 0.77).opacity(0.42)
        let shoalColor = active ? Theme.paper2.opacity(0.14) : Color(red: 0.82, green: 0.89, blue: 0.88).opacity(0.72)
        let landBase = active ? Theme.paper2.opacity(0.28) : Color(red: 0.86, green: 0.80, blue: 0.65).opacity(0.95)
        let landMid = active ? Theme.paper2.opacity(0.24) : Color(red: 0.71, green: 0.74, blue: 0.52).opacity(0.76)
        let landHigh = active ? Theme.paper2.opacity(0.32) : Color(red: 0.64, green: 0.54, blue: 0.37).opacity(0.68)
        let coastStroke = active ? Theme.paper2.opacity(0.92) : Theme.ink.opacity(0.62)
        let contourStroke = active ? Theme.paper2.opacity(0.48) : Theme.ink.opacity(0.26)
        let waveStroke = active ? Theme.paper2.opacity(0.42) : Color(red: 0.28, green: 0.48, blue: 0.58).opacity(0.45)
        let ridgeStroke = active ? Theme.paper2.opacity(0.96) : Theme.seal.opacity(0.86)

        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(LinearGradient(colors: [seaTop, seaBot], startPoint: .topLeading, endPoint: .bottomTrailing))
            Canvas { ctx, size in
                let w = size.width, h = size.height

                // 微弱航海经纬格线
                var grid = Path()
                grid.move(to: CGPoint(x: w * 0.5, y: 2)); grid.addLine(to: CGPoint(x: w * 0.5, y: h - 2))
                grid.move(to: CGPoint(x: 2, y: h * 0.5)); grid.addLine(to: CGPoint(x: w - 2, y: h * 0.5))
                ctx.stroke(grid, with: .color(waveStroke.opacity(0.35)), style: StrokeStyle(lineWidth: 0.5, dash: [2, 2.5]))

                func drawWave(_ x: CGFloat, _ y: CGFloat, _ span: CGFloat) {
                    var wp = Path()
                    let x0 = x * w, y0 = y * h, sw = span * w
                    wp.move(to: CGPoint(x: x0, y: y0))
                    wp.addQuadCurve(to: CGPoint(x: x0 + sw * 0.5, y: y0), control: CGPoint(x: x0 + sw * 0.25, y: y0 - 1.8))
                    wp.addQuadCurve(to: CGPoint(x: x0 + sw, y: y0), control: CGPoint(x: x0 + sw * 0.75, y: y0 + 1.8))
                    ctx.stroke(wp, with: .color(waveStroke), style: StrokeStyle(lineWidth: 0.85, lineCap: .round))
                }

                func drawLand(_ pts: [(CGFloat, CGFloat)], contour: [(CGFloat, CGFloat)]? = nil, high: [(CGFloat, CGFloat)]? = nil) {
                    let path = Self.organicLoop(pts, in: size)
                    // 沿海浅滩晕圈
                    ctx.stroke(path, with: .color(shoalColor), style: StrokeStyle(lineWidth: 3.4, lineJoin: .round))
                    // 陆地底色与海岸线
                    ctx.fill(path, with: .color(landBase))
                    if let c = contour {
                        let cp = Self.organicLoop(c, in: size)
                        ctx.fill(cp, with: .color(landMid))
                        ctx.stroke(cp, with: .color(contourStroke), style: StrokeStyle(lineWidth: 0.65, lineJoin: .round))
                    }
                    if let hi = high {
                        let hp = Self.organicLoop(hi, in: size)
                        ctx.fill(hp, with: .color(landHigh))
                        ctx.stroke(hp, with: .color(contourStroke), style: StrokeStyle(lineWidth: 0.65, lineJoin: .round))
                    }
                    ctx.stroke(path, with: .color(coastStroke), style: StrokeStyle(lineWidth: 1.05, lineJoin: .round))
                }

                func drawPeak(_ cx: CGFloat, _ cy: CGFloat, _ rw: CGFloat, _ rh: CGFloat, snow: Bool = false) {
                    var m = Path()
                    m.move(to: CGPoint(x: (cx - rw) * w, y: (cy + rh) * h))
                    m.addLine(to: CGPoint(x: cx * w, y: (cy - rh) * h))
                    m.addLine(to: CGPoint(x: (cx + rw) * w, y: (cy + rh) * h))
                    ctx.stroke(m, with: .color(ridgeStroke), style: StrokeStyle(lineWidth: 1.15, lineCap: .round, lineJoin: .round))
                    if snow {
                        var sn = Path()
                        sn.move(to: CGPoint(x: (cx - rw * 0.42) * w, y: (cy - rh * 0.14) * h))
                        sn.addLine(to: CGPoint(x: cx * w, y: (cy - rh) * h))
                        sn.addLine(to: CGPoint(x: (cx + rw * 0.42) * w, y: (cy - rh * 0.14) * h))
                        sn.closeSubpath()
                        ctx.fill(sn, with: .color(active ? Theme.paper2 : Color.white.opacity(0.92)))
                    }
                }

                switch template {
                case "pangea":
                    // 联合大陆：气势恢宏的中央主陆 + 东南海湾 + 双阶等高圈 + 纵贯山脊
                    drawLand(
                        [(0.16, 0.34), (0.28, 0.16), (0.52, 0.13), (0.76, 0.22), (0.86, 0.42),
                         (0.78, 0.62), (0.64, 0.56), (0.58, 0.78), (0.36, 0.84), (0.18, 0.70), (0.12, 0.52)],
                        contour: [(0.26, 0.38), (0.42, 0.24), (0.66, 0.28), (0.72, 0.46), (0.54, 0.66), (0.30, 0.66)],
                        high: [(0.38, 0.42), (0.52, 0.34), (0.60, 0.46), (0.46, 0.54)]
                    )
                    drawPeak(0.45, 0.42, 0.065, 0.06)
                    drawPeak(0.55, 0.44, 0.055, 0.05)
                    drawWave(0.70, 0.78, 0.18)
                    drawWave(0.10, 0.86, 0.16)

                case "archipelago":
                    // 群岛：大小错落的七座弧形列岛与环礁，海波萦绕
                    drawWave(0.38, 0.49, 0.22)
                    drawWave(0.12, 0.76, 0.18)
                    drawWave(0.66, 0.20, 0.18)
                    drawLand(
                        [(0.12, 0.28), (0.26, 0.16), (0.42, 0.22), (0.38, 0.38), (0.20, 0.40)],
                        contour: [(0.22, 0.26), (0.32, 0.24), (0.32, 0.33), (0.21, 0.33)]
                    )
                    drawLand(
                        [(0.54, 0.30), (0.70, 0.26), (0.84, 0.36), (0.78, 0.50), (0.60, 0.48)],
                        contour: [(0.64, 0.36), (0.74, 0.35), (0.74, 0.43), (0.64, 0.42)]
                    )
                    drawLand([(0.18, 0.58), (0.34, 0.54), (0.40, 0.66), (0.28, 0.72), (0.16, 0.66)])
                    drawLand(
                        [(0.52, 0.64), (0.68, 0.60), (0.80, 0.70), (0.72, 0.84), (0.54, 0.80)],
                        contour: [(0.60, 0.70), (0.70, 0.69), (0.69, 0.77), (0.60, 0.76)]
                    )
                    // 散布小礁屿
                    drawLand([(0.44, 0.16), (0.52, 0.14), (0.53, 0.22), (0.45, 0.23)])
                    drawLand([(0.41, 0.76), (0.48, 0.75), (0.49, 0.83), (0.42, 0.84)])
                    drawLand([(0.82, 0.56), (0.89, 0.55), (0.90, 0.62), (0.83, 0.63)])

                case "highIsland":
                    // 高山大岛：轮廓峻拔的大岛 + 三阶同心等高线 + 层叠山脊雪峰
                    drawWave(0.08, 0.22, 0.16)
                    drawWave(0.76, 0.82, 0.16)
                    drawLand(
                        [(0.14, 0.50), (0.24, 0.24), (0.48, 0.15), (0.74, 0.22), (0.86, 0.46),
                         (0.78, 0.74), (0.52, 0.84), (0.24, 0.76)],
                        contour: [(0.24, 0.50), (0.34, 0.30), (0.54, 0.26), (0.72, 0.36), (0.72, 0.62), (0.50, 0.72), (0.28, 0.64)],
                        high: [(0.34, 0.50), (0.44, 0.36), (0.62, 0.40), (0.62, 0.58), (0.44, 0.62)]
                    )
                    drawPeak(0.38, 0.52, 0.085, 0.085, snow: false)
                    drawPeak(0.62, 0.52, 0.085, 0.085, snow: false)
                    drawPeak(0.50, 0.44, 0.115, 0.13, snow: true)

                default: // continents
                    // 多大陆：隔海相望的三大有机大陆 + 曲折海湾 + 海峡波纹 + 内陆高地等高线
                    drawWave(0.41, 0.54, 0.18)
                    drawWave(0.45, 0.22, 0.15)
                    // 西北主陆
                    drawLand(
                        [(0.10, 0.26), (0.26, 0.14), (0.43, 0.20), (0.45, 0.38), (0.34, 0.48),
                         (0.38, 0.64), (0.22, 0.72), (0.10, 0.56)],
                        contour: [(0.18, 0.30), (0.32, 0.24), (0.34, 0.40), (0.22, 0.54)]
                    )
                    drawPeak(0.26, 0.34, 0.06, 0.055)
                    // 东南主陆
                    drawLand(
                        [(0.58, 0.24), (0.78, 0.16), (0.90, 0.32), (0.86, 0.56), (0.72, 0.72),
                         (0.56, 0.62), (0.60, 0.44), (0.52, 0.36)],
                        contour: [(0.66, 0.32), (0.80, 0.28), (0.80, 0.52), (0.66, 0.54)]
                    )
                    drawPeak(0.73, 0.41, 0.06, 0.055)
                    // 南方海岛
                    drawLand([(0.34, 0.76), (0.50, 0.74), (0.54, 0.85), (0.38, 0.87)])
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(active ? Theme.paper2.opacity(0.36) : Theme.ink.opacity(0.20), lineWidth: 0.85)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 7.5, style: .continuous)
                    .stroke(active ? Theme.paper2.opacity(0.16) : Theme.gold.opacity(0.28), lineWidth: 0.5)
                    .padding(1.8)
            )
        }
    }
}

// 引擎建世铺卷过场：宣纸暖光水墨晕圈 + 鎏金经纬微环 + 书法朱印「开卷」，零离屏模糊。
struct GeneratingView: View {
    let note: String
    @State private var pulse = false
    @State private var spin = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ZStack {
            MemorialPaper(rules: false).ignoresSafeArea()
            VStack(spacing: 18) {
                ZStack {
                    // 宣纸微暖水墨晕环（纯渐变，零离屏开销）
                    ForEach(0..<3, id: \.self) { i in
                        Circle()
                            .stroke(
                                i == 0 ? Theme.seal.opacity(0.38) : SplashView.gold.opacity(0.45),
                                lineWidth: i == 0 ? 1.4 : 1.0
                            )
                            .frame(width: 58, height: 58)
                            .scaleEffect(pulse && !reduceMotion ? 2.35 : 0.72)
                            .opacity(pulse && !reduceMotion ? 0 : 0.82)
                            .animation(
                                reduceMotion ? nil : .easeOut(duration: 2.2).repeatForever(autoreverses: false).delay(Double(i) * 0.72),
                                value: pulse
                            )
                    }
                    // 细金经纬虚线仪环
                    Circle()
                        .stroke(SplashView.gold.opacity(0.55), style: StrokeStyle(lineWidth: 1.0, dash: [4, 5]))
                        .frame(width: 84, height: 84)
                        .rotationEffect(.degrees(spin && !reduceMotion ? 360 : 0))
                        .animation(reduceMotion ? nil : .linear(duration: 18).repeatForever(autoreverses: false), value: spin)
                    SealFace(text: "开卷", size: 48)
                        .shadow(color: Theme.seal.opacity(0.28), radius: 10, y: 4)
                }
                .frame(height: 136)
                VStack(spacing: 6) {
                    Text(note.isEmpty ? "铺宣勘舆，请稍候" : note)
                        .font(Theme.kai(20))
                        .foregroundStyle(Theme.ink)
                    Text("山川海陆、江河州郡与列国邦交依次成形")
                        .font(Theme.kai(13))
                        .foregroundStyle(Theme.ink2)
                }
            }
            .padding(.horizontal, 28)
        }
        .onAppear {
            guard !reduceMotion else { return }
            pulse = true
            spin = true
        }
        .onDisappear {
            pulse = false
            spin = false
        }
    }
}

// MARK: - game

/// v12.0.0 双阶段御卷建世浮卡（根治“前期停在 1% 卡死不动 → 突然一闪而过看不懂细节”）：
/// - 第一阶段「勘舆筹算 (0%→32%)」：实时跟随引擎地形/海陆/列国/纹理构建进度，配活墨微光条与动态阶段文案，绝不僵死在 1%；
/// - 第二阶段「丹青展卷 (32%→100%)」：以 4.8 秒柔和节奏逐笔呈现八重山河画卷，右侧提供 44pt 高对比「跳过动画 ›」按钮随时秒进！
struct FoundingView: View {
    @ObservedObject var controller: MapController
    var note: String = ""
    let cancel: () -> Void
    private var liveReveal: Float { controller.revealNow ?? controller.reveal }

    struct StageMeta: Equatable {
        let until: Float
        let seal: String
        let title: String
        let poetic: String
    }

    static let prepStages: [StageMeta] = [
        StageMeta(until: 0.08, seal: "筹", title: "勘测真实地形与海陆轮廓", poetic: "正在调取高精度地理底图并并行演算海洋"),
        StageMeta(until: 0.16, seal: "勘", title: "划定州郡山川与水系航道", poetic: "正在生成山脉流域、海港与不可通行边界"),
        StageMeta(until: 0.24, seal: "封", title: "初始化各国政权与部队编制", poetic: "正在按史实落位都城、国境、将领与军备代阶"),
        StageMeta(until: 0.32, seal: "绘", title: "装配高精舆图纹理 · 即将展卷", poetic: "山河着色与国名版式就绪，丹青立现"),
    ]

    static let stages: [StageMeta] = [
        StageMeta(until: 0.15, seal: "海", title: "铺纸注海", poetic: "澄墨入宣，四海波兴"),
        StageMeta(until: 0.30, seal: "岸", title: "勾勒海岸", poetic: "岬湾初定，洲岛分明"),
        StageMeta(until: 0.44, seal: "山", title: "晕染山河", poetic: "青绿皴染，峰峦叠翠"),
        StageMeta(until: 0.50, seal: "川", title: "疏浚江河", poetic: "大河奔流，林木蔚然"),
        StageMeta(until: 0.56, seal: "州", title: "划分州郡", poetic: "经纬分疆，郡县棋布"),
        StageMeta(until: 0.75, seal: "国", title: "分封列国", poetic: "裂土封侯，诸雄并起"),
        StageMeta(until: 0.85, seal: "界", title: "勘定国界", poetic: "四境既明，雄关星列"),
        StageMeta(until: 1.00, seal: "城", title: "营建城邦", poetic: "城郭宏开，通商海港"),
    ]

    @State private var started = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { context in
            let reveal = liveReveal
            let elapsed = max(0, context.date.timeIntervalSince(started))
            let inPrepPhase = (controller.revealClock == nil && reveal < 0.05)
            let canSkip = !inPrepPhase && controller.revealClock != nil && reveal > 0.06 && !ShotTour.on

            // Phase 1 (0% -> 32%): 实时根据 foundingStage (0..3) 与平滑计时推进，让玩家看得见每一步真实计算，绝不假死在 1%
            let stageFloor = Double(min(3, max(0, controller.foundingStage))) * 0.075
            let prepCreep = (1.0 - exp(-elapsed / 1.8)) * 0.24
            let prepProgress = min(0.31, max(0.04, max(stageFloor + 0.05, prepCreep)))
            let prepIndex = min(Self.prepStages.count - 1, max(controller.foundingStage, Int(prepProgress / 0.08)))

            // Phase 2 (32% -> 100%): 4.8s 柔和分段展卷动画，每笔清晰可见
            let revealStageIdx = Self.stages.firstIndex { reveal < $0.until } ?? (Self.stages.count - 1)
            let progress: Double = inPrepPhase
                ? prepProgress
                : min(1.0, max(0.32, 0.32 + Double(min(1.0, max(0.0, reveal))) * 0.68))

            let headerMeta: StageMeta = {
                if inPrepPhase {
                    let base = Self.prepStages[prepIndex]
                    if !note.isEmpty && note != "正在生成地形" {
                        return StageMeta(until: base.until, seal: base.seal, title: note, poetic: base.poetic)
                    }
                    return base
                }
                return Self.stages[revealStageIdx]
            }()
            let stepIndex = inPrepPhase ? prepIndex : revealStageIdx
            let stepTotal = inPrepPhase ? Self.prepStages.count : Self.stages.count
            let prevTitle: String? = (!inPrepPhase && revealStageIdx > 0) ? Self.stages[revealStageIdx - 1].title : nil

            VStack {
                Spacer()
                VStack(alignment: .leading, spacing: 11) {
                    FoundingCartoucheHeader(
                        meta: headerMeta,
                        inPrepPhase: inPrepPhase,
                        stepIndex: stepIndex,
                        stepTotal: stepTotal,
                        prevTitle: prevTitle
                    )
                    .equatable()

                    // 双阶段进度条：准备阶段叠加流动活墨提示，展卷阶段 60fps 丝滑朱砂进度
                    if inPrepPhase {
                        VStack(spacing: 5) {
                            ZStack(alignment: .leading) {
                                Capsule().fill(Theme.hairline)
                                Capsule().fill(Theme.seal)
                                    .scaleEffect(x: progress, y: 1, anchor: .leading)
                            }
                            .frame(height: 4)
                            InkBusy(tint: Theme.seal.opacity(0.65), track: Theme.ink.opacity(0.06))
                                .frame(height: 3)
                        }
                    } else {
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.hairline)
                            Capsule().fill(Theme.seal)
                                .scaleEffect(x: progress, y: 1, anchor: .leading)
                        }
                        .frame(height: 4)
                    }

                    HStack(spacing: 8) {
                        EditorialValueText("\(Int((progress * 100).rounded()))%", size: 15.5, color: Theme.ink)
                        Text(inPrepPhase ? "勘舆筹算 · 阶段 \(stepIndex + 1)/\(stepTotal)" : "丹青展卷 · 第 \(stepIndex + 1)/\(stepTotal) 笔")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .monospacedDigit()
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        if canSkip {
                            Button {
                                GameFeel.shared.tap()
                                controller.skipReveal()
                            } label: {
                                Text("跳过动画 ›")
                                    .font(Theme.label)
                                    .foregroundStyle(Theme.paperLight)
                                    .padding(.horizontal, 12)
                                    .frame(minHeight: 36)
                                    .background(Theme.seal, in: Capsule())
                            }
                            .buttonStyle(PressStyle())
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                    }

                    if elapsed > 20 {
                        HStack(spacing: 8) {
                            Text("高精图集数据较多，仍在推算")
                                .font(Theme.kai(13))
                                .foregroundStyle(Theme.ink2)
                            Spacer(minLength: 8)
                            Button(action: cancel) {
                                Text("放弃，回标题")
                                    .font(Theme.kai(13))
                                    .foregroundStyle(Theme.seal)
                                    .frame(minHeight: 36)
                            }
                            .buttonStyle(PressStyle())
                        }
                        .transition(.opacity)
                    }
                }
                .padding(.horizontal, 18).padding(.vertical, 15)
                .frame(maxWidth: 368, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Theme.paperLight.opacity(0.96))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Theme.hairline, lineWidth: 0.9)
                        .allowsHitTesting(false)
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 34)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear { started = Date() }
    }
}

/// 等值隔离的开卷抬头与阶段步进：仅在阶段跃迁时重绘，60fps 进度刷新零额外排版开销。
private struct FoundingCartoucheHeader: View, Equatable {
    let meta: FoundingView.StageMeta
    let inPrepPhase: Bool
    let stepIndex: Int
    let stepTotal: Int
    let prevTitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Theme.seal.opacity(0.11))
                        .frame(width: 44, height: 44)
                    SealFace(text: meta.seal, size: 36)
                        .id(meta.seal)
                        .transition(.scale(scale: 0.84).combined(with: .opacity))
                }
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(meta.title)
                            .font(Theme.serif(17.5))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .id(meta.title)
                            .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
                        if let prevTitle {
                            Text("· 已成\(prevTitle)")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .lineLimit(1)
                        }
                    }
                    Text(meta.poetic)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.84)
                        .id(meta.poetic)
                        .transition(.opacity)
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 5) {
                ForEach(0..<max(1, stepTotal), id: \.self) { i in
                    let done = i < stepIndex
                    let active = i == stepIndex
                    Capsule()
                        .fill(done ? Theme.ink.opacity(0.65) : (active ? Theme.seal : Theme.hairline))
                        .frame(width: active ? 18 : 7, height: 4)
                }
                Spacer(minLength: 0)
                if inPrepPhase {
                    Text("构建地图中")
                        .font(Theme.sans(10.5))
                        .foregroundStyle(Theme.seal)
                }
            }
        }
        .animation(Motion.panel, value: meta.title)
    }
}
