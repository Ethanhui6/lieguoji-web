import SwiftUI
import CoreText
import LieguojiCore

@main struct LieguojiApp: App {
    init() {
        // The original's map font (TW-Kai), registered for this process only.
        if let url = Bundle.main.url(forResource: "TW-Kai", withExtension: "ttf", subdirectory: "Fonts") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
    var body: some Scene { WindowGroup { RootView() } }
}

/// The web game's warm paper palette (culture47.css: --paper, --ink, --line, --accent …).
enum Theme {
    static let paper = Color(red: 0xF7 / 255, green: 0xF2 / 255, blue: 0xE4 / 255)
    static let paper2 = Color(red: 0xFF / 255, green: 0xFD / 255, blue: 0xF7 / 255)
    static let ink = Color(red: 0x2A / 255, green: 0x2B / 255, blue: 0x24 / 255)
    static let ink2 = Color(red: 0x6B / 255, green: 0x64 / 255, blue: 0x50 / 255)
    static let line = Color(red: 0xA3 / 255, green: 0x94 / 255, blue: 0x71 / 255).opacity(0.32)
    static let accent = Color(red: 0x2F / 255, green: 0x5D / 255, blue: 0x50 / 255)
    static let accentSoft = Color(red: 0xE2 / 255, green: 0xEE / 255, blue: 0xE7 / 255)
    static func kai(_ size: CGFloat) -> Font { .custom("TW-Kai-98_1", size: size) }
}

/// Loads the bundled world once, off the main thread.
struct RootView: View {
    @State private var world: WorldMap?
    @State private var failure: String?
    var body: some View {
        ZStack {
            Color(red: 0x52 / 255, green: 0x7C / 255, blue: 0x86 / 255).ignoresSafeArea()
            if let world { GameView(map: world) }
            else if let failure { ContentUnavailableView("无法载入地图", systemImage: "exclamationmark.triangle", description: Text(failure)).background(Theme.paper) }
            else {
                VStack(spacing: 14) {
                    Text("列国纪").font(Theme.kai(44)).foregroundStyle(Theme.paper)
                    ProgressView().tint(Theme.paper)
                }
            }
        }
        .task {
            guard world == nil, let url = Bundle.main.url(forResource: "World", withExtension: nil) else {
                if world == nil { failure = "安装包缺少地图资源" }; return
            }
            do { world = try await Task.detached(priority: .userInitiated) { try WorldMap.load(directory: url) }.value }
            catch { failure = String(describing: error) }
        }
    }
}

enum Panel: Identifiable, Equatable {
    case province(Int), nations, history, ranking, menu, pending(String)
    var id: String {
        switch self {
        case .province(let p): return "p\(p)"
        case .nations: return "nations"
        case .history: return "history"
        case .ranking: return "ranking"
        case .menu: return "menu"
        case .pending(let t): return "pending-\(t)"
        }
    }
}

struct GameView: View {
    let map: WorldMap
    @StateObject private var controller = MapController()
    @State private var panel: Panel?
    @State private var toast: String?

    var body: some View {
        MapView(map: map, controller: controller)
            .ignoresSafeArea()
            .overlay(alignment: .top) { topBar }
            .overlay(alignment: .leading) { rail.padding(.leading, 10) }
            .overlay(alignment: .bottom) { bottomBar }
            .overlay(alignment: .bottomTrailing) { zoomControls.padding(.trailing, 12).padding(.bottom, 74) }
            .overlay(alignment: .center) {
                if let toast {
                    Text(toast).font(.subheadline).foregroundStyle(Theme.ink).padding(.horizontal, 16).padding(.vertical, 10)
                        .background(Theme.paper, in: Capsule()).overlay(Capsule().stroke(Theme.line)).shadow(color: .black.opacity(0.15), radius: 10, y: 3)
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                }
            }
            .animation(.easeOut(duration: 0.2), value: toast)
            .onChange(of: controller.selectedProvince) { _, province in
                if let province { panel = .province(province) } else if case .province = panel { panel = nil }
            }
            .sheet(item: $panel, onDismiss: {
                // Swiping the province panel away clears the selection; switching panels does not.
                if panel == nil { controller.selectedProvince = nil }
            }) { panel in
                sheet(for: panel)
                    .presentationBackground(Theme.paper)
                    .presentationDragIndicator(.visible)
                    .tint(Theme.accent)
            }
            .sensoryFeedback(.selection, trigger: controller.mode)
    }

    @ViewBuilder private func sheet(for panel: Panel) -> some View {
        switch panel {
        case .province(let p):
            ProvinceSheet(map: map, province: p, controller: controller)
                .presentationDetents([.height(260), .medium, .large])
                .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .nations:
            NationsSheet(map: map) { province in
                self.panel = nil
                controller.fly(to: province)
                controller.selectedProvince = province
            }.presentationDetents([.medium, .large])
        case .history:
            HistorySheet(map: map).presentationDetents([.medium, .large])
        case .ranking:
            RankingSheet(map: map).presentationDetents([.medium, .large])
        case .menu:
            MenuSheet(map: map, controller: controller).presentationDetents([.medium, .large])
        case .pending(let title):
            PendingSheet(title: title).presentationDetents([.height(240)])
        }
    }

    private func say(_ text: String) {
        toast = text
        Task { try? await Task.sleep(nanoseconds: 1_800_000_000); if toast == text { toast = nil } }
    }

    // MARK: chrome (the web game's layout: date top-left, actions top-right, rail on the left,
    // play controls at the bottom, the latest event bottom-left, zoom bottom-right)

    private var topBar: some View {
        HStack(spacing: 8) {
            Text("公元1年1月1日").font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(Theme.ink)
                .padding(.horizontal, 14).frame(height: 38).paperCapsule()
            Spacer()
            HStack(spacing: 2) {
                Menu {
                    Picker("图层", selection: $controller.mode) {
                        Label("政治", systemImage: "flag").tag(MapMode.political)
                        Label("地形", systemImage: "mountain.2").tag(MapMode.terrain)
                    }
                } label: { ChromeIcon(symbol: "square.3.layers.3d") }
                .accessibilityLabel("图层")
                Button { panel = .menu } label: { ChromeIcon(symbol: "ellipsis") }.accessibilityLabel("菜单")
                Button { panel = .pending("存档") } label: { ChromeIcon(symbol: "square.and.arrow.down") }.accessibilityLabel("存档")
            }
            .padding(.horizontal, 4).frame(height: 38).paperCapsule()
        }
        .padding(.horizontal, 12).padding(.top, 4)
    }

    private var rail: some View {
        VStack(spacing: 2) {
            RailButton(symbol: "building.columns", title: "国家") { panel = .nations }
            RailButton(symbol: "shield", title: "军事") { panel = .pending("军事") }
            RailButton(symbol: "book", title: "历史") { panel = .history }
            RailButton(symbol: "chart.bar", title: "排行") { panel = .ranking }
            RailButton(symbol: "pencil", title: "编辑") { panel = .pending("地图编辑") }
            RailButton(symbol: "slider.horizontal.3", title: "AI") { panel = .pending("AI 设置") }
            RailButton(symbol: "dice", title: "生成") { panel = .pending("生成世界") }
        }
        .padding(.vertical, 8).padding(.horizontal, 4)
        .background(Theme.paper.opacity(0.96), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.line))
        .shadow(color: .black.opacity(0.14), radius: 10, y: 3)
    }

    private var bottomBar: some View {
        HStack(alignment: .bottom) {
            Button { panel = .history } label: {
                HStack(spacing: 8) {
                    Image(systemName: "book").font(.system(size: 14)).foregroundStyle(Theme.ink2)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("1年1月1日").font(.caption2).foregroundStyle(Theme.ink2)
                        Text(map.meta.events.first?.text ?? "").font(.caption.weight(.semibold)).foregroundStyle(Theme.ink).lineLimit(2).multilineTextAlignment(.leading)
                    }
                    Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Theme.ink2)
                }
                .padding(.horizontal, 12).padding(.vertical, 8).frame(maxWidth: 260, alignment: .leading)
                .background(Theme.paper.opacity(0.96), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line))
                .shadow(color: .black.opacity(0.12), radius: 8, y: 2)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 8)
            HStack(spacing: 4) {
                Button { say("时间推进还在用 Swift 重写，尚不能推演") } label: { ChromeIcon(symbol: "play.fill") }
                Text("1倍速").font(.footnote.weight(.semibold)).foregroundStyle(Theme.ink)
                Button { say("时间推进还在用 Swift 重写，尚不能推演") } label: { ChromeIcon(symbol: "forward.end") }
            }
            .padding(.horizontal, 6).frame(height: 44).paperCapsule()
        }
        .padding(.horizontal, 12).padding(.bottom, 6)
    }

    private var zoomControls: some View {
        VStack(spacing: 0) {
            Button { controller.zoom(1.6) } label: { ChromeIcon(symbol: "plus") }.accessibilityLabel("放大")
            Divider().frame(width: 24)
            Button { controller.zoom(1 / 1.6) } label: { ChromeIcon(symbol: "minus") }.accessibilityLabel("缩小")
            Divider().frame(width: 24)
            Button { controller.resetRequest = UUID() } label: { ChromeIcon(symbol: "arrow.up.left.and.arrow.down.right") }.accessibilityLabel("全图")
        }
        .padding(.vertical, 2)
        .background(Theme.paper.opacity(0.96), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line))
        .shadow(color: .black.opacity(0.12), radius: 8, y: 2)
    }
}

struct ChromeIcon: View {
    let symbol: String
    var body: some View {
        Image(systemName: symbol).font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.ink).frame(width: 38, height: 38).contentShape(Rectangle())
    }
}

struct RailButton: View {
    let symbol: String
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: symbol).font(.system(size: 17, weight: .regular))
                Text(title).font(.system(size: 11))
            }
            .foregroundStyle(Theme.ink).frame(width: 48, height: 46).contentShape(Rectangle())
        }
        .buttonStyle(RailStyle())
    }
}

struct RailStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Theme.accentSoft : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension View {
    func paperCapsule() -> some View {
        background(Theme.paper.opacity(0.96), in: Capsule()).overlay(Capsule().stroke(Theme.line)).shadow(color: .black.opacity(0.13), radius: 8, y: 2)
    }
}

enum Names {
    static let polity = ["Kingdom": "王国", "Empire": "帝国", "Federation": "联邦", "Republic": "共和国", "Tribal": "部落", "Theocracy": "神权"]
    static let culture = ["chinese": "中华", "japanese": "日本", "english": "英格兰", "arab": "阿拉伯", "roman": "罗马", "french": "法兰西",
                          "german": "日耳曼", "greek": "希腊", "persian": "波斯", "slavic": "斯拉夫", "norse": "北欧", "indian": "印度"]
    static let religion = ["none": "无指定宗教", "chineseFolk": "中国民间信仰", "daoism": "道教", "buddhism": "佛教", "shinto": "神道",
                           "islam": "伊斯兰教", "catholic": "天主教", "orthodox": "东正教", "protestant": "新教", "judaism": "犹太教",
                           "hinduism": "印度教", "zoroastrian": "祆教", "grecoRoman": "希腊罗马多神信仰", "norse": "北欧传统信仰"]
    static let terrain = ["plain": "平原", "forest": "森林", "mountain": "山地"]
    static func color(_ css: String) -> Color {
        let c = RGB(css: css) ?? RGB(0.6, 0.6, 0.6)
        return Color(red: Double(c.r), green: Double(c.g), blue: Double(c.b))
    }
}

/// Sheet header in the game's style: Kai title, optional colour bar, close button.
struct SheetHeader: View {
    let title: String
    var subtitle: String?
    var color: Color?
    var close: (() -> Void)?
    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            if let color { RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 6, height: 34) }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.kai(26)).foregroundStyle(Theme.ink)
                if let subtitle { Text(subtitle).font(.caption).foregroundStyle(Theme.ink2) }
            }
            Spacer()
            if let close {
                Button(action: close) { Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.ink2).frame(width: 30, height: 30).background(Theme.paper2, in: Circle()).overlay(Circle().stroke(Theme.line)) }
                    .accessibilityLabel("关闭")
            }
        }
        .padding(.horizontal, 20).padding(.top, 22).padding(.bottom, 8)
    }
}

/// A row card like the web panel's grouped rows.
struct InfoRow: View {
    let label: String
    let value: String
    var body: some View {
        HStack { Text(label).foregroundStyle(Theme.ink2); Spacer(); Text(value).foregroundStyle(Theme.ink).fontWeight(.medium) }
            .font(.subheadline).padding(.horizontal, 14).padding(.vertical, 11)
    }
}

struct PaperGroup<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack(spacing: 0) { content }
            .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line))
    }
}

struct ProvinceSheet: View {
    let map: WorldMap
    let province: Int
    @ObservedObject var controller: MapController
    var body: some View {
        let p = map.meta.provinces[province]
        let nation = p.nation >= 0 ? map.meta.nations[p.nation] : nil
        let cities = map.meta.cities.filter { $0.province == province }
        VStack(spacing: 0) {
            SheetHeader(title: p.name, subtitle: nation.map { "\($0.name) · \(Names.terrain[p.terrain] ?? p.terrain)" }, color: nation.map { Names.color($0.color) }) { controller.selectedProvince = nil }
            ScrollView {
                VStack(spacing: 12) {
                    PaperGroup {
                        if let nation {
                            InfoRow(label: "所属国家", value: nation.name); Divider().padding(.leading, 14)
                            InfoRow(label: "政体", value: Names.polity[nation.polity] ?? nation.polity); Divider().padding(.leading, 14)
                            InfoRow(label: "文化", value: Names.culture[nation.culture] ?? nation.culture); Divider().padding(.leading, 14)
                            InfoRow(label: "宗教", value: Names.religion[nation.religion] ?? nation.religion); Divider().padding(.leading, 14)
                        }
                        InfoRow(label: "地形", value: Names.terrain[p.terrain] ?? p.terrain)
                    }
                    if !cities.isEmpty {
                        PaperGroup {
                            ForEach(cities, id: \.id) { c in
                                let capital = nation.map { $0.capital >= 0 && map.meta.cities[$0.capital].id == c.id } ?? false
                                HStack {
                                    Text(c.name).font(Theme.kai(19)).foregroundStyle(Theme.ink)
                                    Spacer()
                                    if capital { Text("首都").font(.caption.weight(.semibold)).foregroundStyle(Theme.accent).padding(.horizontal, 8).padding(.vertical, 3).background(Theme.accentSoft, in: Capsule()) }
                                }
                                .padding(.horizontal, 14).padding(.vertical, 10)
                            }
                        }
                    }
                    Button { controller.fly(to: province) } label: {
                        Label("定位到地图", systemImage: "scope").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous)).foregroundStyle(Theme.accent)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
        }
    }
}

struct NationRow: Identifiable {
    let index: Int
    let nation: WorldMeta.Nation
    let provinces: Int
    let cities: Int
    var id: Int { index }
}

func nationRows(_ map: WorldMap) -> [NationRow] {
    map.meta.nations.enumerated().map { item in
        let owned = Set(map.meta.provinces.indices.filter { map.meta.provinces[$0].nation == item.offset })
        return NationRow(index: item.offset, nation: item.element, provinces: owned.count, cities: map.meta.cities.filter { owned.contains($0.province) }.count)
    }.sorted { $0.provinces > $1.provinces }
}

struct NationsSheet: View {
    let map: WorldMap
    let select: (Int) -> Void
    var body: some View {
        VStack(spacing: 0) {
            SheetHeader(title: "国家", subtitle: "\(map.meta.nations.count) 国 · 点按定位到首都")
            ScrollView {
                PaperGroup {
                    ForEach(nationRows(map)) { row in
                        Button {
                            let capital = row.nation.capital >= 0 ? map.meta.cities[row.nation.capital].province : nil
                            if let target = capital ?? map.meta.provinces.firstIndex(where: { $0.nation == row.index }) { select(target) }
                        } label: {
                            HStack(spacing: 12) {
                                RoundedRectangle(cornerRadius: 4).fill(Names.color(row.nation.color)).frame(width: 20, height: 20)
                                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(Names.color(row.nation.line), lineWidth: 1.5))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(row.nation.name).font(Theme.kai(20)).foregroundStyle(Theme.ink)
                                    Text("\(Names.culture[row.nation.culture] ?? row.nation.culture)文化 · \(Names.polity[row.nation.polity] ?? row.nation.polity) · \(Names.religion[row.nation.religion] ?? row.nation.religion)")
                                        .font(.caption).foregroundStyle(Theme.ink2)
                                }
                                Spacer()
                                Text("\(row.provinces) 省").font(.callout.monospacedDigit()).foregroundStyle(Theme.ink2)
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 11).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if row.index != nationRows(map).last?.index { Divider().padding(.leading, 46) }
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
        }
    }
}

struct HistorySheet: View {
    let map: WorldMap
    var body: some View {
        VStack(spacing: 0) {
            SheetHeader(title: "大事记", subtitle: "公元1年1月1日 · 开篇")
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(Array(map.meta.events.enumerated()), id: \.offset) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("1年1月1日").font(.caption2).foregroundStyle(Theme.ink2)
                            Text(item.element.text).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                            if !item.element.reason.isEmpty { Text(item.element.reason).font(.caption).foregroundStyle(Theme.ink2) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line))
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
        }
    }
}

struct RankingSheet: View {
    let map: WorldMap
    var body: some View {
        VStack(spacing: 0) {
            SheetHeader(title: "排行", subtitle: "按行省数量 · 开局")
            ScrollView {
                PaperGroup {
                    ForEach(Array(nationRows(map).enumerated()), id: \.element.id) { item in
                        HStack(spacing: 12) {
                            Text("\(item.offset + 1)").font(.headline.monospacedDigit()).foregroundStyle(item.offset < 3 ? Theme.accent : Theme.ink2).frame(width: 24)
                            Circle().fill(Names.color(item.element.nation.color)).frame(width: 12, height: 12)
                            Text(item.element.nation.name).font(Theme.kai(19)).foregroundStyle(Theme.ink)
                            Spacer()
                            Text("\(item.element.provinces) 省 · \(item.element.cities) 城").font(.callout.monospacedDigit()).foregroundStyle(Theme.ink2)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        if item.offset < map.meta.nations.count - 1 { Divider().padding(.leading, 50) }
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
        }
    }
}

struct MenuSheet: View {
    let map: WorldMap
    @ObservedObject var controller: MapController
    var body: some View {
        VStack(spacing: 0) {
            SheetHeader(title: "菜单选项")
            ScrollView {
                VStack(spacing: 12) {
                    PaperGroup {
                        Toggle(isOn: $controller.showMetrics) { Text("帧时间叠层").foregroundStyle(Theme.ink) }.padding(.horizontal, 14).padding(.vertical, 8)
                    }
                    PaperGroup {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("原生版 0.3.0").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                            Text("SwiftUI 界面 + Metal 地图，没有网页运行时。地图来自网页版同一套生成：原作 20k 格网、种子 \(map.meta.seed)，开局第 0 日。画面按网页版的原作纸地图外观：海岸距离海面、羊皮纸、河流、山林、台湾楷体国名。")
                                .font(.caption).foregroundStyle(Theme.ink2)
                            Text("游戏规则（时间推进、战争、外交、家族）正在用 Swift 重写，暂时不能推演。").font(.caption).foregroundStyle(Theme.ink2)
                        }
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
        }
    }
}

struct PendingSheet: View {
    let title: String
    var body: some View {
        VStack(spacing: 0) {
            SheetHeader(title: title)
            Text("这一项在网页版已经有，原生版正在用 Swift 重写游戏规则，完成后在这里开放。")
                .font(.subheadline).foregroundStyle(Theme.ink2).padding(.horizontal, 20).frame(maxWidth: .infinity, alignment: .leading)
            Spacer()
        }
    }
}
