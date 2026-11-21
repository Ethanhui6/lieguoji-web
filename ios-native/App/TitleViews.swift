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
            // Far and near hills in two washes along the bottom of the sheet.
            VStack(spacing: 0) {
                Spacer()
                ZStack(alignment: .bottom) {
                    InkHills(seed: 11).fill(Theme.ink.opacity(0.06)).frame(height: 195)
                    LinearGradient(colors: [.clear, Theme.paper.opacity(0.55), .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(height: 28).offset(x: hills ? 24 : -48, y: -76)
                    InkHills(seed: 4).fill(Theme.ink.opacity(0.10)).frame(height: 125)
                }
                .offset(y: hills ? 0 : 50).opacity(hills && !dried ? 1 : 0)
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
            withAnimation(.easeOut(duration: 1.4)) { soaked = true }
            withAnimation(.easeOut(duration: 1.8)) { contours = true }
            withAnimation(.easeOut(duration: 1.6).delay(0.2)) { hills = true }
            try? await Task.sleep(nanoseconds: 350_000_000)
            for i in 1...3 {
                withAnimation(Motion.reveal) { brushed = i }
                try? await Task.sleep(nanoseconds: 300_000_000)
            }
            try? await Task.sleep(nanoseconds: 150_000_000)
            withAnimation(Motion.stamp) { stamped = true }
            withAnimation(.easeOut(duration: 0.7)) { stampRing = true }
            GameFeel.shared.tap()
            withAnimation(Motion.reveal.delay(0.15)) { motto = true }
            try? await Task.sleep(nanoseconds: 1_300_000_000)
            withAnimation(Motion.reveal) { dried = true }
            try? await Task.sleep(nanoseconds: 450_000_000)
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
                            Image(systemName: "megaphone.fill").font(.system(size: 12)).foregroundStyle(Theme.seal)
                            Text(notice).font(Theme.kai(13)).foregroundStyle(Theme.ink).lineLimit(2)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Theme.paper2.opacity(0.95), in: Capsule()).overlay(Capsule().stroke(Theme.seal.opacity(0.3)))
                        .rise(shown, 0)
                    }
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
                        Button { archive = true } label: { TileAction(title: "世界卷宗", symbol: "books.vertical") }
                        Button { settings = true } label: { TileAction(title: "设置", symbol: "slider.horizontal.3") }
                        Button { notes = true } label: { TileAction(title: "更新", symbol: "sparkles") }
                    }
                    .rise(shown, 0.16)
                    Text(AppVersion.text + (cloud.version > 0 ? " · 云配置 \(cloud.version)" : "")).font(Theme.kai(11)).foregroundStyle(Theme.ink2.opacity(0.7)).padding(.top, 2)
                }
                .buttonStyle(PressStyle())
                .frame(maxWidth: 440)
                .padding(.horizontal, 22).padding(.bottom, 26)
            }
        }
        .statusBarHidden()
        .onAppear { shown = false; withAnimation(Motion.drift.delay(model.controller.reveal < 1 ? 1.2 : 0.1)) { shown = true } }
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
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $archive) {
            WorldArchiveSheet(model: model) { world in archive = false; Task { await model.openArchived(world) } }
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

/// 山河预览 off the main thread: the template's heights for this seed, drawn small.
func terrainThumbnail(_ inputs: PreviewWorld.Inputs, seed: String, template: String) -> UIImage? {
    let t = PreviewWorld.thumbnail(inputs, heights: TerrainGenerator.generate(graph: inputs.grid, seed: seed, template: template), width: 480)
    guard let provider = CGDataProvider(data: Data(t.rgba) as CFData),
          let image = CGImage(width: t.width, height: t.height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: t.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue), provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return nil }
    return UIImage(cgImage: image)
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
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .regular)).foregroundStyle(primary ? Theme.paper2.opacity(0.8) : Theme.ink2)
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
            Image(systemName: symbol).font(.system(size: 18, weight: .medium)).foregroundStyle(Theme.seal).frame(height: 22)
            Text(title).font(Theme.kai(14)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.8)
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
    @State private var options = GameModel.NewWorld()
    /// The seed used while the field is left blank, so the land shown is the land founded.
    @State private var rolled = String(UInt32.random(in: 0...UInt32.max))
    @State private var terrain: UIImage?
    private var seed: String { options.seed.isEmpty ? rolled : options.seed }
    private var chosen: GameModel.NewWorld { var o = options; o.seed = seed; return o }
    /// Each terrain template's picture and one line of what it makes.
    static let templateArt: [String: (symbol: String, note: String)] = [
        "continents": ("globe.asia.australia", "数块大陆隔海相望"),
        "pangea": ("globe.europe.africa", "一整块大陆，列国接壤"),
        "archipelago": ("water.waves", "星罗棋布的海岛"),
        "highIsland": ("mountain.2", "群山耸立的大岛"),
    ]
    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 18) {
            SheetHeader(title: "新世界", subtitle: "开辟一方天下", seal: "新")
            SectionLabel("地形")
            // 地形: a card each, with its picture.
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(Names.templates, id: \.id) { t in
                    let on = options.template == t.id, art = Self.templateArt[t.id]
                    Button { withAnimation(Motion.tap) { options.template = t.id } } label: {
                        HStack(spacing: 10) {
                            Image(systemName: art?.symbol ?? "map").font(.system(size: 24, weight: .light)).foregroundStyle(on ? Theme.paper2 : Theme.seal).frame(width: 34)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.name).font(Theme.kai(16)).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                Text(art?.note ?? "").font(Theme.kai(11)).foregroundStyle(on ? Theme.paper2.opacity(0.85) : Theme.ink2).lineLimit(1).minimumScaleFactor(0.7)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 12).frame(height: 58)
                        .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.2)))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, 22)
            if inputs != nil { terrainCard.padding(.horizontal, 22) }
            SectionLabel("规模")
            VStack(alignment: .leading, spacing: 12) {
                PaperStepper(title: "国家", value: $options.nations, range: 2...24, unit: "国")
                PaperStepper(title: "州郡", value: Binding(get: { options.provinceCount }, set: { options.provinces = String($0) }), range: options.nations...480, unit: "州")
                HStack(spacing: 10) {
                    Image(systemName: "dice").font(.system(size: 16)).foregroundStyle(Theme.seal).frame(width: 22)
                    Text("种子").font(Theme.kai(17)).foregroundStyle(Theme.ink2)
                    Spacer()
                    TextField("", text: $options.seed, prompt: Text("随机").foregroundColor(Theme.ink2.opacity(0.6)))
                        .paperField(width: 160).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                }
            }
            .padding(.horizontal, 22)
            SectionLabel("气候")
            VStack(spacing: 10) {
                PaperStepper(title: "降水", value: $options.climate.rain, range: 10...200, unit: "%")
                PaperStepper(title: "气温修正", value: $options.climate.temperature, range: -30...30, unit: "°")
                PaperStepper(title: "北界纬度", value: $options.climate.north, range: -80...90, unit: "")
                PaperStepper(title: "南界纬度", value: $options.climate.south, range: -90...80, unit: "")
            }
            .padding(.horizontal, 22)
            SectionLabel("开局")
            HStack(spacing: 10) {
                choice("peace", "列国和平", "leaf", "各国相安，渐起争端", selection: $options.relations)
                choice("war", "群雄混战", "flag.2.crossed", "开局即四面开战", selection: $options.relations)
            }
            .padding(.horizontal, 22)
            SectionLabel("命名")
            HStack(spacing: 10) {
                choice("historical-names", "历史真名", "book.closed", "取自史书的国名人名", selection: $options.naming)
                choice("culture-generated", "按文化生成", "character.book.closed", "按各文化新造名字", selection: $options.naming)
            }
            .padding(.horizontal, 22)
            HStack {
                SectionLabel("文化", inset: false)
                Spacer()
                Button(options.cultures.count == Names.cultureIds.count ? "只留一种" : "全选") {
                    withAnimation(Motion.tap) {
                        options.cultures = options.cultures.count == Names.cultureIds.count ? ["chinese"] : Set(Names.cultureIds)
                    }
                }
                .font(Theme.kai(14)).foregroundStyle(Theme.seal)
            }
            .padding(.horizontal, 22)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 8)], spacing: 8) {
                ForEach(Names.cultureIds, id: \.self) { c in
                    let on = options.cultures.contains(c)
                    Button {
                        withAnimation(Motion.tap) {
                            // At least one culture stays chosen.
                            if on { if options.cultures.count > 1 { options.cultures.remove(c) } } else { options.cultures.insert(c) }
                        }
                    } label: {
                        Text(Names.culture[c] ?? c).font(Theme.kai(15)).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                            .frame(maxWidth: .infinity).frame(height: 36)
                            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.2)))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, 22)
            Text("各国从所选文化中取名、宗教与政体。").font(Theme.kai(12)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
            VStack(spacing: 10) {
                Button { start(chosen) } label: { PrimaryLabel(title: "生成地图", symbol: "wand.and.stars") }.buttonStyle(PressStyle())
                if let draw {
                    Button { draw(chosen) } label: { SecondaryLabel(title: "自己绘制地图", symbol: "paintbrush.pointed") }.buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, 22).padding(.top, 4)
        }
        .padding(.vertical, 18)
        }
        .scrollIndicators(.hidden)
        .task(id: seed + "|" + options.template) { await drawTerrain() }
    }
    /// 山河预览: the land this template and seed will make, before anything is founded.
    private var terrainCard: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let terrain { Image(uiImage: terrain).resizable() } else { Theme.paper2 }
            }
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.3), lineWidth: 1))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.paper2.opacity(0.4), lineWidth: 0.6).padding(3))
            Button {
                options.seed = ""; rolled = String(UInt32.random(in: 0...UInt32.max))
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 12, weight: .medium))
                    Text("换一方山河").font(Theme.kai(13))
                }
                .foregroundStyle(Theme.paper2).padding(.horizontal, 12).frame(height: 30)
                .background(Theme.seal, in: Capsule())
            }
            .buttonStyle(PressStyle()).padding(9)
        }
    }
    private func drawTerrain() async {
        guard let inputs else { return }
        let seed = self.seed, template = options.template
        let image = await Task.detached(priority: .userInitiated) { terrainThumbnail(inputs, seed: seed, template: template) }.value
        guard !Task.isCancelled else { return }
        withAnimation(Motion.fade) { terrain = image }
    }
    /// A two-way choice as an illustrated card.
    private func choice(_ id: String, _ title: String, _ symbol: String, _ note: String, selection: Binding<String>) -> some View {
        let on = selection.wrappedValue == id
        return Button { withAnimation(Motion.tap) { selection.wrappedValue = id } } label: {
            VStack(spacing: 4) {
                Image(systemName: symbol).font(.system(size: 22, weight: .light)).foregroundStyle(on ? Theme.paper2 : Theme.seal)
                Text(title).font(Theme.kai(15)).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                Text(note).font(Theme.kai(11)).foregroundStyle(on ? Theme.paper2.opacity(0.85) : Theme.ink2).lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 10)
            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Color.clear : Theme.ink.opacity(0.2)))
        }
        .buttonStyle(PressStyle())
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

/// Over the rising device-built world while the engine founds its nations, people and armies.
struct FoundingView: View {
    /// Observes the map clock. A plain Float copied into this view stayed on 注水成海 while the land kept rising.
    @ObservedObject var controller: MapController
    /// Gives up on this world (offered once the engine has taken unusually long).
    let cancel: () -> Void
    private var reveal: Float { controller.reveal }
    /// The world's generation as it happens (like a world being made in a sandbox game): each stage
    /// names what the map is drawing at that moment — the sea, the land rising from the coast, the
    /// mountains, the rivers, forests and plains, the provinces, the states' colours — and then the
    /// engine's work: cities, houses and people, armies, relations. Finished stages stay listed.
    static let stages: [(until: Float, text: String)] = [
        (0.15, "铺纸注海"), (0.30, "勾勒海岸"), (0.44, "晕染山河"), (0.50, "冲刷江河，播撒林木"),
        (0.56, "划分州郡"), (0.75, "分封列国"), (0.85, "勘定国界"), (1.00, "营建城邦与港口"),
    ]
    static let later = ["诞生世家与人物", "编练军队", "缔结邦交", "天下初定"]
    @State private var started = Date()
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.35)) { context in
            let waited = reveal >= 1 ? context.date.timeIntervalSince(started) : 0
            // The engine's own stage, not a timer: the bar never says done before the world is.
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
                            Image(systemName: "checkmark").font(.system(size: 11, weight: .regular)).foregroundStyle(Theme.jade)
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
                .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.ink.opacity(0.18), lineWidth: 1))
                .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.2), radius: 12, y: 5)
                .padding(.bottom, 40)
            }
            .onChange(of: reveal >= 1) { _, done in if done { started = Date() } }
        }
    }
}
