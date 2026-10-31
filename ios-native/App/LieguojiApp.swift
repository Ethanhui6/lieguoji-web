import SwiftUI
import LieguojiCore

@main struct LieguojiApp: App {
    var body: some Scene { WindowGroup { RootView() } }
}

/// Loads the bundled world once, off the main thread.
struct RootView: View {
    @State private var world: WorldMap?
    @State private var failure: String?
    var body: some View {
        Group {
            if let world { GameView(map: world) }
            else if let failure { ContentUnavailableView("无法载入地图", systemImage: "exclamationmark.triangle", description: Text(failure)) }
            else { ProgressView("正在载入地图…").controlSize(.large) }
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
    case province(Int), nations, about
    var id: String {
        switch self { case .province(let p): return "p\(p)"; case .nations: return "nations"; case .about: return "about" }
    }
}

struct GameView: View {
    let map: WorldMap
    @StateObject private var controller = MapController()
    @State private var panel: Panel?

    var body: some View {
        MapView(map: map, controller: controller)
            .ignoresSafeArea()
            .overlay(alignment: .top) { topBar }
            .overlay(alignment: .bottomTrailing) { cornerButtons }
            .onChange(of: controller.selectedProvince) { _, province in
                if let province { panel = .province(province) } else if case .province = panel { panel = nil }
            }
            .sheet(item: $panel, onDismiss: {
                // Swiping the province panel away clears the selection; switching panels does not.
                if panel == nil { controller.selectedProvince = nil }
            }) { panel in
                switch panel {
                case .province(let p):
                    ProvinceSheet(map: map, province: p, controller: controller)
                        .presentationDetents([.height(230), .medium, .large])
                        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                        .presentationDragIndicator(.visible)
                case .nations:
                    NationsSheet(map: map) { capitalProvince in
                        self.panel = nil
                        controller.fly(to: capitalProvince)
                        controller.selectedProvince = capitalProvince
                    }
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                case .about:
                    AboutSheet(map: map, controller: controller).presentationDetents([.medium])
                }
            }
            .sensoryFeedback(.selection, trigger: controller.mode)
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text("列国纪").font(.headline)
                Text("\(map.meta.nations.count) 国 · \(map.meta.provinces.count) 省 · \(map.meta.cities.count) 城").font(.caption).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(.regularMaterial, in: Capsule())
            Spacer()
            Menu {
                Picker("地图模式", selection: $controller.mode) {
                    Label("政治", systemImage: "flag").tag(MapMode.political)
                    Label("地形", systemImage: "mountain.2").tag(MapMode.terrain)
                }
            } label: {
                Image(systemName: controller.mode == .political ? "flag.fill" : "mountain.2.fill").glassCircle()
            }
            .accessibilityLabel("地图模式")
            Button { panel = .nations } label: { Image(systemName: "list.bullet").glassCircle() }
                .accessibilityLabel("国家列表")
        }
        .padding(.horizontal, 16).padding(.top, 6)
    }

    private var cornerButtons: some View {
        VStack(spacing: 10) {
            Button { controller.resetRequest = UUID() } label: { Image(systemName: "scope").glassCircle() }
                .accessibilityLabel("回到全图")
            Button { panel = .about } label: { Image(systemName: "info").glassCircle() }
                .accessibilityLabel("关于原生版")
        }
        .padding(16)
        .padding(.bottom, 8)
    }
}

extension Image {
    /// Round floating control on material, the system map-control look.
    func glassCircle() -> some View {
        font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.primary)
            .frame(width: 44, height: 44)
            .background(.regularMaterial, in: Circle())
            .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
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

struct ProvinceSheet: View {
    let map: WorldMap
    let province: Int
    @ObservedObject var controller: MapController
    var body: some View {
        let p = map.meta.provinces[province]
        let nation = p.nation >= 0 ? map.meta.nations[p.nation] : nil
        let cities = map.meta.cities.filter { $0.province == province }
        NavigationStack {
            List {
                Section {
                    if let nation {
                        LabeledContent("所属国家") {
                            HStack(spacing: 6) { Circle().fill(Names.color(nation.color)).frame(width: 10, height: 10); Text(nation.name) }
                        }
                        LabeledContent("政体", value: Names.polity[nation.polity] ?? nation.polity)
                        LabeledContent("文化", value: Names.culture[nation.culture] ?? nation.culture)
                        LabeledContent("宗教", value: Names.religion[nation.religion] ?? nation.religion)
                    } else {
                        LabeledContent("所属国家", value: "无")
                    }
                    LabeledContent("地形", value: Names.terrain[p.terrain] ?? p.terrain)
                }
                if !cities.isEmpty {
                    Section("城市") {
                        ForEach(cities, id: \.id) { c in
                            let capital = nation.map { $0.capital >= 0 && map.meta.cities[$0.capital].id == c.id } ?? false
                            Label(c.name, systemImage: capital ? "star.fill" : "building.2")
                        }
                    }
                }
            }
            .navigationTitle(p.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { controller.fly(to: province) } label: { Label("定位", systemImage: "location.fill") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { controller.selectedProvince = nil } label: { Image(systemName: "xmark.circle.fill").symbolRenderingMode(.hierarchical) }
                        .accessibilityLabel("关闭")
                }
            }
        }
    }
}

struct NationRow: Identifiable {
    let index: Int
    let nation: WorldMeta.Nation
    let provinces: Int
    var id: Int { index }
}

struct NationsSheet: View {
    let map: WorldMap
    let select: (Int) -> Void
    var body: some View {
        let rows = map.meta.nations.enumerated().map { item in
            NationRow(index: item.offset, nation: item.element, provinces: map.meta.provinces.filter { $0.nation == item.offset }.count)
        }.sorted { $0.provinces > $1.provinces }
        NavigationStack {
            List(rows) { row in
                Button {
                    let capital = row.nation.capital >= 0 ? map.meta.cities[row.nation.capital].province : nil
                    if let target = capital ?? map.meta.provinces.firstIndex(where: { $0.nation == row.index }) { select(target) }
                } label: {
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 4).fill(Names.color(row.nation.color)).frame(width: 22, height: 22)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.nation.name).font(.body.weight(.semibold)).foregroundStyle(.primary)
                            Text("\(Names.culture[row.nation.culture] ?? row.nation.culture) · \(Names.polity[row.nation.polity] ?? row.nation.polity)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(row.provinces) 省").font(.callout.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("国家").navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct AboutSheet: View {
    let map: WorldMap
    @ObservedObject var controller: MapController
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("SwiftUI 界面 + Metal 地图，没有网页运行时。")
                    Text("地图来自网页版同一套生成：原作 20k 格网、种子 \(map.meta.seed)、\(map.meta.template == "continents" ? "大陆" : map.meta.template)模板，开局第 0 日的国家与城市。")
                    Text("阶段 2：地图、手势与查看面板。游戏规则（时间推进、战争、外交、家族）尚未移植到 Swift，暂时不能推演。")
                        .foregroundStyle(.secondary)
                }
                Section {
                    Toggle("帧时间叠层", isOn: $controller.showMetrics)
                } footer: {
                    Text("按需重绘：静止时不绘制。叠层显示连续操作时的绘制间隔，不是 GPU 耗时；120Hz 由设备决定。")
                }
            }
            .navigationTitle("原生版 · 阶段 2").navigationBarTitleDisplayMode(.inline)
        }
    }
}
