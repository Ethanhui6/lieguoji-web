import SwiftUI
import CoreText
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
    var body: some Scene { WindowGroup { RootView().font(Theme.kai(17)) } }
}

/// Warm paper and ink, one vermilion seal colour and the jade of the web game.
enum Theme {
    static let fontName = "TW-Kai-98_1"
    static let paper = Color(red: 0.957, green: 0.933, blue: 0.886)
    static let paper2 = Color(red: 0.984, green: 0.972, blue: 0.945)
    static let ink = Color(red: 0.165, green: 0.145, blue: 0.114)
    static let ink2 = Color(red: 0.46, green: 0.424, blue: 0.369)
    static let line = Color(red: 0.165, green: 0.145, blue: 0.114).opacity(0.1)
    static let seal = Color(red: 0.706, green: 0.255, blue: 0.18)
    static let jade = Color(red: 0.184, green: 0.365, blue: 0.314)
    static let sea = Color(red: 0x52 / 255, green: 0x7C / 255, blue: 0x86 / 255)
    static func kai(_ size: CGFloat) -> Font { .custom(fontName, size: size) }
}

enum Names {
    static let polity = ["Kingdom": "王国", "Empire": "帝国", "Federation": "联邦", "Republic": "共和国", "Tribal": "部落", "Theocracy": "神权"]
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
            case .playing: GameView(model: model).transition(.opacity)
            }
            if model.phase == .splash { SplashView { finishSplash() }.transition(.opacity).zIndex(10) }
        }
        .animation(.easeInOut(duration: 0.45), value: model.phase)
        .task { await model.loadBackdrop(); try? await model.engine.start() }
        .alert("出了点问题", isPresented: Binding(get: { model.failure != nil }, set: { if !$0 { model.failure = nil } })) {
            Button("好") { model.failure = nil }
        } message: { Text(model.failure ?? "") }
        .tint(Theme.seal)
    }

    private func finishSplash() {
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
    @State private var stamped = false
    @State private var named = false
    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea()
            VStack(spacing: 26) {
                SealMark(size: 132)
                    .scaleEffect(stamped ? 1 : 1.6)
                    .opacity(stamped ? 1 : 0)
                    .rotationEffect(.degrees(stamped ? 0 : -8))
                Text("列國紀").font(Theme.kai(40)).tracking(10).foregroundStyle(Theme.ink)
                    .opacity(named ? 1 : 0).offset(y: named ? 0 : 8)
                Text("架空世界 · 列国兴衰").font(Theme.kai(15)).tracking(4).foregroundStyle(Theme.ink2)
                    .opacity(named ? 1 : 0)
            }
        }
        .task {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.62)) { stamped = true }
            try? await Task.sleep(nanoseconds: 450_000_000)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            withAnimation(.easeOut(duration: 0.6)) { named = true }
            try? await Task.sleep(nanoseconds: 1_250_000_000)
            done()
        }
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
    @State private var creating = false
    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 18) {
                Text("列國紀").font(Theme.kai(56)).tracking(12).foregroundStyle(Theme.ink)
                Text("架空世界 · 列国兴衰").font(Theme.kai(16)).tracking(4).foregroundStyle(Theme.ink2)
                VStack(spacing: 12) {
                    Button { creating = true } label: { PrimaryLabel(title: "新世界", symbol: "globe.asia.australia") }
                    if model.hasSave {
                        Button { Task { await model.continueGame() } } label: { SecondaryLabel(title: "继续", symbol: "book.closed") }
                    }
                }
                .padding(.top, 10)
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 28).padding(.vertical, 30)
            .frame(maxWidth: 420)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(Color.white.opacity(0.35)))
            .padding(.horizontal, 20).padding(.bottom, 34)
        }
        .sheet(isPresented: $creating) {
            NewWorldSheet { options in creating = false; Task { await model.generate(options) } }
                .presentationDetents([.medium]).presentationBackground(Theme.paper)
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
        VStack(alignment: .leading, spacing: 20) {
            Text("新世界").font(Theme.kai(28)).foregroundStyle(Theme.ink)
            VStack(alignment: .leading, spacing: 8) {
                Text("地形").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                Picker("地形", selection: $options.template) { ForEach(Names.templates, id: \.id) { Text($0.name).tag($0.id) } }.pickerStyle(.segmented)
            }
            Stepper(value: $options.nations, in: 2...24) {
                HStack { Text("国家").foregroundStyle(Theme.ink2); Spacer(); Text("\(options.nations) 国").foregroundStyle(Theme.ink) }.font(Theme.kai(17))
            }
            HStack {
                Text("种子").font(Theme.kai(17)).foregroundStyle(Theme.ink2)
                TextField("随机", text: $options.seed).font(Theme.kai(17)).keyboardType(.numberPad).multilineTextAlignment(.trailing)
            }
            Spacer(minLength: 0)
            Button { start(options) } label: { PrimaryLabel(title: "生成地图", symbol: "wand.and.stars") }.buttonStyle(.plain)
        }
        .padding(24)
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
    case province(Int), army(Int), nations, military, diplomacy, chronicle, menu
    var id: String {
        switch self {
        case .province(let p): return "p\(p)"
        case .army(let a): return "a\(a)"
        case .nations: return "nations"
        case .military: return "military"
        case .diplomacy: return "diplomacy"
        case .chronicle: return "chronicle"
        case .menu: return "menu"
        }
    }
}

struct GameView: View {
    @ObservedObject var model: GameModel
    @ObservedObject private var controller: MapController
    @State private var panel: Panel?
    @State private var toast: String?
    init(model: GameModel) { self.model = model; _controller = ObservedObject(wrappedValue: model.controller) }

    var body: some View {
        ZStack {
            Color.clear
        }
        .overlay(alignment: .top) { VStack(spacing: 8) { topBar; if controller.marchingArmy != nil { marchBanner } } }
        .overlay(alignment: .bottom) { bottomBar }
        .overlay(alignment: .center) {
            if let toast {
                Text(toast).font(Theme.kai(16)).foregroundStyle(Theme.ink).multilineTextAlignment(.center).padding(.horizontal, 18).padding(.vertical, 12)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous)).padding(.horizontal, 40)
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .opacity(controller.reveal >= 1 ? 1 : 0)
        .animation(.easeOut(duration: 0.4), value: controller.reveal >= 1)
        .onAppear {
            controller.drifting = false
            controller.onMarchTarget = { province in
                guard let army = controller.marchingArmy else { return }
                Task {
                    if let error = await model.order(army: army, to: province) { say(error) }
                    else { say("\(model.army(army)?.name ?? "军队")前往\(model.map?.meta.provinces[province].name ?? "")"); controller.marchingArmy = nil }
                    model.refreshArmies()
                }
            }
        }
        .onChange(of: controller.selectedArmy) { _, army in
            model.refreshArmies()
            if let army { panel = .army(army) } else if case .army = panel { panel = nil }
        }
        .onChange(of: controller.selectedProvince) { _, province in
            if let province { panel = .province(province) } else if case .province = panel { panel = nil }
        }
        .sheet(item: $panel, onDismiss: {
            if panel == nil { controller.selectedProvince = nil; if controller.marchingArmy == nil { controller.selectedArmy = nil } }
        }) { panel in
            sheet(for: panel).presentationBackground(Theme.paper).presentationDragIndicator(.visible).presentationCornerRadius(28).font(Theme.kai(17))
        }
    }

    @ViewBuilder private func sheet(for panel: Panel) -> some View {
        switch panel {
        case .province(let p):
            ProvinceSheet(model: model, province: p).presentationDetents([.height(300), .medium, .large]).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .army(let a):
            ArmySheet(model: model, army: a, onMarch: {
                controller.marchingArmy = a; self.panel = nil; say("点选地图上的目的地")
            }, onHalt: { Task { if let e = await model.order(army: a, to: nil) { say(e) } } })
            .presentationDetents([.height(320), .medium]).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .nations:
            NationsSheet(model: model) { province in self.panel = nil; controller.fly(to: province) }.presentationDetents([.medium, .large])
        case .military:
            MilitarySheet(model: model) { army in
                self.panel = nil
                if let p = model.army(army)?.province, p >= 0 { controller.fly(to: p) }
                controller.selectedArmy = army
            }.presentationDetents([.medium, .large])
        case .diplomacy:
            DiplomacySheet(model: model, say: say).presentationDetents([.medium, .large])
        case .chronicle:
            ChronicleSheet(model: model).presentationDetents([.medium, .large])
        case .menu:
            MenuSheet(model: model, controller: controller) { self.panel = nil }.presentationDetents([.medium])
        }
    }

    private func say(_ text: String) {
        toast = text
        Task { try? await Task.sleep(nanoseconds: 2_000_000_000); if toast == text { toast = nil } }
    }

    // MARK: chrome

    private var topBar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Text(model.state?.dateText ?? "").font(Theme.kai(17)).foregroundStyle(Theme.ink)
                if let wars = model.state?.wars.count, wars > 0 {
                    HStack(spacing: 3) { Circle().fill(Theme.seal).frame(width: 6, height: 6); Text("\(wars)场战争").font(Theme.kai(13)).foregroundStyle(Theme.seal) }
                }
            }
            .padding(.horizontal, 16).frame(height: 42).glass(Capsule())
            Spacer()
            Menu {
                Picker("图层", selection: $controller.mode) {
                    Label("政治", systemImage: "flag").tag(MapMode.political)
                    Label("地形", systemImage: "mountain.2").tag(MapMode.terrain)
                }
            } label: { CircleIcon(symbol: "square.3.layers.3d") }
            Button { panel = .menu } label: { CircleIcon(symbol: "ellipsis") }
        }
        .padding(.horizontal, 14).padding(.top, 2)
    }

    private var marchBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.triangle.turn.up.right.diamond.fill").foregroundStyle(Theme.seal)
            Text("调兵：点选目的地").font(Theme.kai(16)).foregroundStyle(Theme.ink)
            Button("取消") { controller.marchingArmy = nil; controller.selectedArmy = nil; model.refreshArmies() }.font(Theme.kai(16)).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 16).frame(height: 40).glass(Capsule())
    }

    private var bottomBar: some View {
        VStack(spacing: 10) {
            if let event = model.state?.events.last {
                Button { panel = .chronicle } label: {
                    Text(event.text).font(Theme.kai(14)).foregroundStyle(Theme.ink).lineLimit(1)
                        .padding(.horizontal, 14).frame(height: 32).glass(Capsule())
                }
                .buttonStyle(.plain).padding(.horizontal, 30)
                .id(event.text).transition(.opacity)
            }
            HStack(spacing: 10) {
                HStack(spacing: 0) {
                    TabButton(symbol: "building.columns", title: "国家") { panel = .nations }
                    TabButton(symbol: "shield", title: "军事") { panel = .military }
                    TabButton(symbol: "scroll", title: "外交") { panel = .diplomacy }
                    TabButton(symbol: "book", title: "纪事") { panel = .chronicle }
                }
                .padding(.horizontal, 6).frame(height: 58).glass(Capsule())
                HStack(spacing: 2) {
                    Button { model.cycleSpeed() } label: { Text("\(model.speed)×").font(Theme.kai(17)).foregroundStyle(Theme.ink).frame(width: 40, height: 50) }
                    Button { model.togglePlay() } label: {
                        Image(systemName: model.playing ? "pause.fill" : "play.fill").font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Theme.paper2).frame(width: 46, height: 46).background(Theme.seal, in: Circle())
                    }
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
        background(.regularMaterial, in: shape).overlay(shape.stroke(Color.white.opacity(0.4), lineWidth: 0.5)).shadow(color: .black.opacity(0.12), radius: 12, y: 4)
    }
}

struct CircleIcon: View {
    let symbol: String
    var body: some View {
        Image(systemName: symbol).font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.ink).frame(width: 42, height: 42).glass(Circle())
    }
}

struct TabButton: View {
    let symbol: String; let title: String; let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: symbol).font(.system(size: 18))
                Text(title).font(Theme.kai(12))
            }
            .foregroundStyle(Theme.ink).frame(width: 56, height: 50).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - panels

struct SheetHeader: View {
    let title: String
    var subtitle: String?
    var color: Color?
    var body: some View {
        HStack(spacing: 12) {
            if let color { RoundedRectangle(cornerRadius: 4).fill(color).frame(width: 8, height: 36) }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.kai(28)).foregroundStyle(Theme.ink)
                if let subtitle { Text(subtitle).font(Theme.kai(14)).foregroundStyle(Theme.ink2) }
            }
            Spacer()
        }
        .padding(.horizontal, 22).padding(.top, 22).padding(.bottom, 10)
    }
}

struct Group2<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack(spacing: 0) { content }
            .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.line))
    }
}

struct Row: View {
    let label: String; let value: String
    var body: some View {
        HStack { Text(label).foregroundStyle(Theme.ink2); Spacer(); Text(value).foregroundStyle(Theme.ink) }
            .font(Theme.kai(17)).padding(.horizontal, 16).padding(.vertical, 12)
    }
}

struct Divider2: View { var body: some View { Rectangle().fill(Theme.line).frame(height: 1).padding(.leading, 16) } }

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
                            if info.owner != info.controller, info.owner >= 0 { Row(label: "法理归属", value: map.meta.nations[info.owner].name); Divider2() }
                        }
                        if let n = nation { Row(label: "政体", value: Names.polity[n.polity] ?? n.polity); Divider2(); Row(label: "文化", value: Names.culture[n.culture] ?? n.culture) }
                    }
                    .padding(.horizontal, 16)
                    if let siege = model.state?.sieges.first(where: { $0.province == province }) {
                        Group2 {
                            HStack { Text("围城").foregroundStyle(Theme.seal); Spacer(); NationChip(map: map, nation: siege.nation) }.padding(.horizontal, 16).padding(.top, 12)
                            ProgressView(value: min(1, max(0, siege.progress))).tint(Theme.seal).padding(16)
                        }
                        .padding(.horizontal, 16)
                    }
                    if !armies.isEmpty {
                        Group2 {
                            ForEach(armies, id: \.element.id) { pair in
                                Button { model.controller.selectedArmy = pair.offset } label: { ArmyRow(map: map, army: pair.element) }.buttonStyle(.plain)
                                if pair.element.id != armies.last?.element.id { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 24)
            }
            .task(id: model.state?.day) { info = await model.provinceInfo(province) }
        }
    }
}

struct ArmyRow: View {
    let map: WorldMap; let army: GameState.Army
    var body: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 3).fill(army.nation >= 0 && army.nation < map.meta.nations.count ? Names.color(map.meta.nations[army.nation].color) : .gray).frame(width: 10, height: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(army.name).font(Theme.kai(18)).foregroundStyle(Theme.ink)
                Text("\(Names.unit[army.unit] ?? army.unit) · \(army.province >= 0 ? map.meta.provinces[army.province].name : "海上") · \(Names.status(army.status))").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
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
    let onMarch: () -> Void
    let onHalt: () -> Void
    var body: some View {
        if let map = model.map, let a = model.army(army) {
            let nation = a.nation >= 0 && a.nation < map.meta.nations.count ? map.meta.nations[a.nation] : nil
            ScrollView {
                VStack(spacing: 14) {
                    SheetHeader(title: a.name, subtitle: nation.map { "\($0.name) · \(Names.unit[a.unit] ?? a.unit)" }, color: nation.map { Names.color($0.color) })
                    Group2 {
                        Row(label: "兵力", value: a.troops.formatted()); Divider2()
                        Row(label: "所在", value: a.province >= 0 ? map.meta.provinces[a.province].name : "海上"); Divider2()
                        Row(label: "状态", value: "\(Names.status(a.status)) · \(Names.travel(a.travel))"); Divider2()
                        Row(label: "粮草", value: "\(a.supplies)"); Divider2()
                        Row(label: "士气", value: "\(a.morale)")
                    }
                    .padding(.horizontal, 16)
                    HStack(spacing: 10) {
                        Button(action: onMarch) { PrimaryLabel(title: "调兵", symbol: "arrow.triangle.turn.up.right.diamond") }
                        if a.travel == "moving" || a.travel == "blocked" { Button(action: onHalt) { SecondaryLabel(title: "停止", symbol: "stop.fill") } }
                    }
                    .buttonStyle(.plain).padding(.horizontal, 16)
                    if !a.manual { Text("未下令时由 AI 自主指挥").font(Theme.kai(13)).foregroundStyle(Theme.ink2) }
                }
                .padding(.bottom, 24)
            }
        }
    }
}

struct NationsSheet: View {
    @ObservedObject var model: GameModel
    let select: (Int) -> Void
    var body: some View {
        if let map = model.map, let state = model.state {
            let order = state.nations.indices.sorted { state.nations[$0].provinces > state.nations[$1].provinces }
            ScrollView {
                VStack(spacing: 14) {
                    SheetHeader(title: "国家", subtitle: "\(state.nations.filter(\.alive).count) 国并立")
                    Group2 {
                        ForEach(order, id: \.self) { i in
                            let n = map.meta.nations[i], s = state.nations[i]
                            Button {
                                let capital = n.capital >= 0 ? map.meta.cities[n.capital].province : nil
                                if let target = capital ?? state.owners.firstIndex(of: i) { select(target) }
                            } label: {
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
    var body: some View {
        if let map = model.map, let state = model.state {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "军事", subtitle: "\(state.armies.count) 支军队")
                    ForEach(state.nations.indices, id: \.self) { n in
                        let rows = state.armies.indices.filter { state.armies[$0].nation == n }
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
                        Picker("宣战国", selection: $attacker) { ForEach(map.meta.nations.indices, id: \.self) { Text(map.meta.nations[$0].name).tag($0) } }
                            .padding(.horizontal, 16).padding(.vertical, 6)
                        Divider2()
                        Picker("目标国", selection: $defender) { ForEach(map.meta.nations.indices, id: \.self) { Text(map.meta.nations[$0].name).tag($0) } }
                            .padding(.horizontal, 16).padding(.vertical, 6)
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

struct ChronicleSheet: View {
    @ObservedObject var model: GameModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "纪事", subtitle: model.state?.dateText)
                Group2 {
                    ForEach(Array((model.state?.events ?? []).reversed().enumerated()), id: \.offset) { pair in
                        VStack(alignment: .leading, spacing: 3) {
                            Text("第\(pair.element.day + 1)日").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                            Text(pair.element.text).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 10)
                        if pair.offset < (model.state?.events.count ?? 0) - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
    }
}

struct MenuSheet: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let close: () -> Void
    @State private var creating = false
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader(title: "菜单")
            Group2 {
                Button { model.save(); close() } label: { MenuRow(symbol: "square.and.arrow.down", title: "保存") }.buttonStyle(.plain)
                Divider2()
                Button { creating = true } label: { MenuRow(symbol: "globe.asia.australia", title: "新世界") }.buttonStyle(.plain)
                Divider2()
                Button { close(); model.backToTitle() } label: { MenuRow(symbol: "house", title: "返回标题") }.buttonStyle(.plain)
                Divider2()
                Toggle(isOn: $controller.showMetrics) { Text("显示帧率").font(Theme.kai(17)).foregroundStyle(Theme.ink) }.padding(.horizontal, 16).padding(.vertical, 8)
            }
            .padding(.horizontal, 16)
            Spacer()
        }
        .sheet(isPresented: $creating) {
            NewWorldSheet { options in creating = false; close(); Task { await model.generate(options) } }
                .presentationDetents([.medium]).presentationBackground(Theme.paper)
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
