import SwiftUI
import UIKit
import MetalKit
import LieguojiCore

/// State shared between SwiftUI panels and the Metal map.
@MainActor final class MapController: ObservableObject {
    @Published var mode: MapMode = .political
    /// The selected state's relations on the map (StateRelationsHighlighter): nation → 0xRRGGBB.
    @Published var relations: [Int: UInt32] = [:]
    /// A colour view's province fills (nil: the state view).
    @Published var viewFills: [RGB]?
    /// The state whose relation colours are shown (its sheet page set them).
    @Published var relationsNation: Int?
    /// A colour view's group names, shown instead of the state names (nil: state names).
    @Published var viewLabels: [GroupLabel]?
    @Published var selectedProvince: Int?
    @Published var showMetrics = false
    /// The next army update places every icon at once (a world just opened), with no walk or fade.
    var snapArmies = false
    /// The simulation's own costs for the metrics overlay (set by the game each step; not published).
    var simText = ""
    /// 显示设置 (web 0.5.40 map display options), kept between launches.
    @Published var display = DisplaySettings.load() { didSet { display.save() } }
    /// 推演与画面 settings (armies shown, war arrows, icon size, frame rate, autosave).
    @Published var play = PlaySettings.load() { didSet { play.save() } }
    /// Province to fly to; the id makes repeated requests for the same province animate again.
    @Published var focus: (province: Int, id: UUID)?
    @Published var resetRequest = UUID() { didSet { onFramingRequest?() } }
    /// 地图展开: the camera draws back until the whole map is on screen.
    @Published var unrollRequest = UUID() { didSet { onFramingRequest?() } }
    var onFramingRequest: (() -> Void)?
    /// The camera's scale now and the scale at which the whole map fits (CI checks the map can be unrolled).
    var cameraScale: (() -> (scale: Double, fit: Double))?
    /// CI 测量：当前的地图渲染器。
    var renderer: (() -> MapRenderer?)?
    /// Zoom by a factor around the screen centre (the + / − buttons).
    @Published var zoomRequest: (factor: Double, id: UUID)?
    /// Army icons and the selected army's remaining route, from the simulation (nil keeps the opening icons).
    @Published var armies: [MapRenderer.ArmySprite]? { didSet { armiesRevision &+= 1 } }
    @Published var route: [SIMD2<Float>] = [] { didSet { armiesRevision &+= 1 } }
    private(set) var armiesRevision = 0
    @Published var selectedArmy: Int?
    /// 选中军队的稳定 ID（推演中数组下标变化或军队覆灭时仍能准确找回，避免点军团出现空白页）。
    @Published var selectedArmyId: String?
    /// A tapped fleet (index in the state's fleets); fleet sprites carry army −(index + 1).
    @Published var selectedFleet: Int?
    @Published var selectedFleetId: String?
    /// While set, the next tap on land is the march destination of this army.
    @Published var marchingArmy: Int?
    var onMarchTarget: ((Int) -> Void)?
    /// 即时战略模式: a one-finger drag draws a selection box instead of panning.
    @Published var boxSelecting = false
    /// The armies chosen by the box (indices into armies); a tap then picks their destination.
    @Published var groupArmies: [Int] = []
    var onGroupTarget: ((Int) -> Void)?
    /// Battles, sieges and capture flashes over the map.
    @Published var effects = MapEffects()
    /// The live world (ownership and nation labels follow the engine); nil keeps the opening map.
    @Published var world: WorldMap? { didSet { worldRevision &+= 1 } }
    /// Bumped on every world change: the map compares this instead of every province.
    private(set) var worldRevision = 0
    /// How long army icons glide to their next positions (the play step interval).
    var tween: Double = 0.3
    /// Troop / ship counts by army or fleet id, shown under the icons when zoomed in.
    var troopTexts: [String: String] = [:]
    /// Per-army strength ratio (troops / full) or fleet hull (0…1), rendered as a crisp bar directly under each icon.
    var troopRatios: [String: Float] = [:]
    var troopBarColors: [String: RGB] = [:]
    /// 战争晕染（墨场）：本步的行军、守军、围城与最近的攻占（GameModel.refreshWashes），与世界代次（读档、换世界时变）。
    var washes = WashFrame.empty
    /// 本步阵亡军队（军队标识 → 阵亡时刻，秒，自本步动画开始）：图标停到那一刻，阵亡动画同时开始。
    var deathDelays: [String: Double] = [:]
    var washEpoch = 0
    /// CI 巡览演示占领晕染时为真：推演不覆盖演示输入。
    var washDemo = false
    /// 当前着色视图的标识（同一视图里填色随推演刷新时渐变，换视图时瞬切）。
    var viewKey = ""
    /// 四时节气光影相位（0..1，由模拟日期驱动）。
    var seasonPhase: Float = -1
    /// 实时活跃天时与灾异州郡（暴雪/大旱/洪涝/瘟疫/丰年），同步驱动 GPU 地表着色与全屏/局部天气粒子层。
    var weatherZones: [WeatherOverlayView.Zone] = []
    var weatherGPUZones: [(x: Float, y: Float, radius: Float, kind: Float)] = []
    var weatherRevision: Int = 0
    /// 玩家最近一次主动触碰地图的时刻（用于观战巡弋导演镜头自动礼让手动操作）。
    var lastUserTouchTime: CFTimeInterval = 0
    /// 沉浸式自适应 HUD 回调：玩家拖拽/双指缩放浏览地图时自动收起外围功能栏；轻点画布时唤回 HUD。
    var onMapBrowsing: ((Bool) -> Void)?
    var onMapTap: ((Bool) -> Void)?
    /// Where the icon with this key is drawn now (set by the map view).
    var placed: ((String) -> (Double, Double)?)?
    /// CI 连续帧对比: the state names on screen in this frame and how opaque each is drawn.
    var nameFrame: (() -> [String: Float])?
    /// Harbour points in map units. The sea-route layer is rebuilt when this changes.
    @Published var seaPorts: [SIMD2<Float>] = []
    /// 要塞 marks: the cities of fortified provinces, in map units.
    @Published var forts: [SIMD2<Float>] = []
    /// 圣地 marks: the cities of holy provinces, in map units.
    @Published var holy: [SIMD2<Float>] = []
    /// A fleet waiting for its port: the next province tap is its destination.
    @Published var marchingFleet: Int?
    /// 绘制疆域: provinces tapped or dragged over go to this state.
    @Published var paintNation: Int?
    @Published var placingArmy = false
    /// 一次放置的军队数.
    @Published var placeCount = 1
    var placementBusy = false
    /// 自绘地图: one finger draws terrain (world point per move; nil = the stroke ended).
    var terrainBrush = false
    var onTerrainStroke: ((Double, Double) -> Void)?
    var onTerrainStrokeEnd: (() -> Void)?
    /// The drawn terrain to show; bump the revision to redraw (sea texture too when seaDirty).
    var editorMap: WorldMap?
    var editorSeaDirty = false
    @Published var editorRevision = 0
    /// The brush circle under the finger (map units), drawn while painting.
    var brushRadius: Double = 30
    var onPaint: ((Int) -> Void)?
    /// 世界编辑的笔刷: its name on the banner and what it does to a province.
    @Published var brushName: String?
    var brushAction: ((Int) -> Void)?
    /// 地图标注.
    @Published var customLabels: [GameModel.MapLabel] = []
    @Published var customImages: [GameModel.MapImage] = []
    @Published var customRivers: [[Float]] = []
    /// 长按地图: the province and the finger's place in the view.
    var onLongPress: ((Int, CGPoint) -> Void)?
    /// 地图点选: a page asked for a province (a new capital…): the prompt on the banner and what the tap does.
    @Published var pickPrompt: String?
    var onPick: ((Int) -> Void)?
    /// A sheet covers the map: it redraws at 30 frames a second.
    var sheetOpen = false { didSet { onSheet?() } }
    var onSheet: (() -> Void)?
    var onFleetTarget: ((Int) -> Void)?
    /// Generation reveal (title screen), 0…1; labels and markers appear at 1.
    @Published var reveal: Float = 1
    /// A reveal played on the map's display link (smooth, without a SwiftUI update each frame); the
    /// published `reveal` then only follows it coarsely for the panels. `push`: the camera eases in.
    private(set) var revealClock: (from: Float, to: Float, start: CFTimeInterval, duration: Double, push: Bool)?
    private(set) var revealClockSerial = 0
    var mapMountToken = 0
    var onMapMounted: (() -> Void)?
    var onRevealClock: (() -> Void)?
    /// Battle losses to float over the map (map point, text, at sea).
    var onHits: (([(x: Float, y: Float, text: String, naval: Bool)]) -> Void)?
    func animateReveal(from: Float = 0, to: Float = 1, duration: Double, push: Bool = false) {
        revealClockSerial &+= 1
        revealClock = (from, to, CACurrentMediaTime(), max(0.05, duration), push)
        onRevealClock?()
    }
    /// The clock's value now (nil when none runs); it clears itself at the end.
    var revealNow: Float? {
        guard let c = revealClock else { return nil }
        let x = min(1, (CACurrentMediaTime() - c.start) / c.duration)
        // Ease out: the land rises quickly, then settles (linear when 动画缓动 is off).
        let e = play.easeReveal ? Float(1 - pow(1 - x, 2.2)) : Float(x)
        return c.from + (c.to - c.from) * e
    }
    var revealDone: Bool { revealClock.map { CACurrentMediaTime() - $0.start >= $0.duration } ?? true }
    func endReveal() { revealClock = nil }
    /// Title screen: the map is a backdrop and takes no gestures.
    @Published var interactive = true
    /// 山河回放期间锁定地图单击与长按（允许自由拖拽缩放舆图，但不弹出州郡/军团/快捷面板干扰回放）。
    @Published var replayLocked = false
    /// 山河回放单步／播放推进时开启墨晕扫色、战役箭头与行军军队动效（快速拖滑条时关闭以保持零延迟跟手）。
    var replayAnimate = false
    /// 山河回放快速拖拽时间轴期间为真：仅刷新各州颜色，延后重建国界与国名框，松手时一次性补齐。
    var replayScrubbing = false
    /// Slow drift of the title backdrop.
    @Published var drifting = false
    /// How far the engine has got once the map has risen (FoundingView.later).
    @Published var foundingStage = 0
    func fly(to province: Int) { focus = (province, UUID()) }
    /// Flies to a map point and zooms in (an army or fleet), the point above the sheet.
    @Published var focusPoint: (x: Double, y: Double, id: UUID)?
    func fly(x: Double, y: Double) { focusPoint = (x, y, UUID()) }
    func zoom(_ factor: Double) { zoomRequest = (factor, UUID()) }
    /// 查看都城: the camera glides to the place, zooms in and a vermilion seal ring closes on it.
    @Published var spotlight: (x: Double, y: Double, id: UUID)?
    func showPlace(x: Double, y: Double) { spotlight = (x, y, UUID()) }
}

/// Map display options kept between launches. v3 resets older saves once so the province borders
/// (now smoothed ink lines) start on.
struct DisplaySettings: Codable, Equatable {
    var borders = true
    /// Province borders: smoothed translucent ink lines, on by default (provinces read as clearly as the original's).
    var provinceLines = true
    var cityNames = true
    var cityIcons = true
    var vegetation = true
    /// State colours over the terrain: balanced so hills, forests, deserts, marshes and glaciers read clearly.
    var colorDensity = 0.66
    /// Sea routes between harbours. Default on.
    var seaRoutes = true
    /// Scroll-edge darkening. Default on (IsEnableDarkBorder).
    var darkEdges = true
    /// 皇帝诏书卷轴装裱（左右檀木滚轴、鎏金碧玉轴头与四角回纹，nil 沿用 darkEdges 默认开启）。
    var scrollMount: Bool? = nil
    /// 舆图细节 (nil in older settings: on).
    var mapDetail: Bool? = nil
    /// Parchment multiply. Preset 0 has it on; the serialized toggle's runtime winner is unresolved,
    /// so this build follows preset 0 and labels the switch 网页适配.
    var parchment = true
    /// State-name scale. Default 1. The 0.5–2 range matches the web display slider, not a measured original limit.
    var nationNameScale = 1.0
    /// Full state titles. Off, a known polity suffix is dropped from the map label.
    var fullNationNames = true
    /// "original" is preset 0. "warm" keeps the previous paper sea (网页适配).
    var ocean = "original"
    /// 经纬线 (the original's GridLines). Optional so settings saved before it still load.
    var gridLines: Bool? = nil
    /// 战争晕染：军队在敌境走过、驻留、围城处洇开进攻方颜色（nil：旧设置，默认开）。
    var battleGround: Bool? = nil
    /// 光影氛围：统一西北日照立体明暗、柔和浮云投影、海面波光与军团城池落影（nil：默认开）。
    var lighting: Bool? = nil
    static let key = "displaySettings.v3"
    static func load() -> DisplaySettings {
        guard let data = UserDefaults.standard.data(forKey: key), let v = try? JSONDecoder().decode(DisplaySettings.self, from: data) else { return DisplaySettings() }
        return v
    }
    func save() { if let data = try? JSONEncoder().encode(self) { UserDefaults.standard.set(data, forKey: Self.key) } }
}

/// 推演与画面 (the original's IsDisplayArmy and the like), kept between launches.
struct PlaySettings: Codable, Equatable {
    var showArmies = true
    var warArrows = true
    var iconScale = 1.0
    /// Frames a second while the map is dragged or zoomed, while armies march, and for
    /// looping effects (waves, battle slashes, flags, marching arrows): unlocked to 60fps by default for silky fluidity.
    var mapFPS = 60
    var marchFPS = 60
    var effectFPS = 60
    /// Pixels per point the map is drawn at (capped at the screen's own; the names stay sharp).
    var renderScale = 2.0
    /// The share of real time the simulation may keep a core busy, in percent.
    var simLoad = 55
    /// Lower the frames and rest the simulation when the phone runs hot or in Low Power Mode.
    var autoCool = true
    /// 可回退: the entry camera (eases out to the whole world) and the reveal's ease (else linear, as before).
    var introCamera = true
    var easeReveal = true
    /// Autosave while playing, seconds (0: off; pausing and leaving still save).
    var autosave = 120
    /// 大事暂停: a declaration of war, a rising or a state's end stops the clock.
    var pauseOnNews = false
    /// 界面与看海偏好（保留旧版字段名以兼容已存设置；已移除冗余悬浮小笺，统一交由顶栏与底栏操作）。
    var showTacticalPill = false
    var showScrollPlacard = false
    var showReplayPlacard = true
    var directorCruise = false
    var showHeralds = true
    var showBattleFloats = true
    var seaWaves = true
    var pauseOnSheet = true
    static let key = "playSettings.v1"
    init() {}
    private enum Keys: String, CodingKey { case showArmies, warArrows, iconScale, highFrameRate, mapFPS, marchFPS, effectFPS, renderScale, simLoad, autoCool, introCamera, easeReveal, autosave, pauseOnNews, showTacticalPill, showScrollPlacard, showReplayPlacard, directorCruise, showHeralds, showBattleFloats, seaWaves, pauseOnSheet }
    // Every field is optional in a stored setting: older versions saved fewer (and a 高帧率 switch).
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        showArmies = try c.decodeIfPresent(Bool.self, forKey: .showArmies) ?? true
        warArrows = try c.decodeIfPresent(Bool.self, forKey: .warArrows) ?? true
        iconScale = try c.decodeIfPresent(Double.self, forKey: .iconScale) ?? 1
        mapFPS = try c.decodeIfPresent(Int.self, forKey: .mapFPS) ?? ((try c.decodeIfPresent(Bool.self, forKey: .highFrameRate)) == true ? 120 : 60)
        marchFPS = try c.decodeIfPresent(Int.self, forKey: .marchFPS) ?? 60
        effectFPS = try c.decodeIfPresent(Int.self, forKey: .effectFPS) ?? 60
        renderScale = try c.decodeIfPresent(Double.self, forKey: .renderScale) ?? 2
        simLoad = try c.decodeIfPresent(Int.self, forKey: .simLoad) ?? 55
        autoCool = try c.decodeIfPresent(Bool.self, forKey: .autoCool) ?? true
        introCamera = try c.decodeIfPresent(Bool.self, forKey: .introCamera) ?? true
        easeReveal = try c.decodeIfPresent(Bool.self, forKey: .easeReveal) ?? true
        autosave = try c.decodeIfPresent(Int.self, forKey: .autosave) ?? 120
        pauseOnNews = try c.decodeIfPresent(Bool.self, forKey: .pauseOnNews) ?? false
        showTacticalPill = false
        showScrollPlacard = false
        showReplayPlacard = try c.decodeIfPresent(Bool.self, forKey: .showReplayPlacard) ?? true
        directorCruise = try c.decodeIfPresent(Bool.self, forKey: .directorCruise) ?? false
        showHeralds = try c.decodeIfPresent(Bool.self, forKey: .showHeralds) ?? true
        showBattleFloats = try c.decodeIfPresent(Bool.self, forKey: .showBattleFloats) ?? true
        seaWaves = try c.decodeIfPresent(Bool.self, forKey: .seaWaves) ?? true
        pauseOnSheet = try c.decodeIfPresent(Bool.self, forKey: .pauseOnSheet) ?? true
        // 自动迁移旧版被压低到 24/20fps 的默认均衡档至丝滑 60/60fps，彻底消除低帧率卡顿感。
        if mapFPS == 60 && (marchFPS == 24 || marchFPS == 30) && (effectFPS == 20 || effectFPS == 30) && renderScale == 2 {
            marchFPS = 60; effectFPS = 60
        }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(showArmies, forKey: .showArmies); try c.encode(warArrows, forKey: .warArrows); try c.encode(iconScale, forKey: .iconScale)
        try c.encode(mapFPS, forKey: .mapFPS); try c.encode(marchFPS, forKey: .marchFPS); try c.encode(effectFPS, forKey: .effectFPS)
        try c.encode(renderScale, forKey: .renderScale); try c.encode(simLoad, forKey: .simLoad); try c.encode(autoCool, forKey: .autoCool)
        try c.encode(introCamera, forKey: .introCamera); try c.encode(easeReveal, forKey: .easeReveal)
        try c.encode(autosave, forKey: .autosave); try c.encode(pauseOnNews, forKey: .pauseOnNews)
        try c.encode(showTacticalPill, forKey: .showTacticalPill); try c.encode(showScrollPlacard, forKey: .showScrollPlacard)
        try c.encode(showReplayPlacard, forKey: .showReplayPlacard); try c.encode(directorCruise, forKey: .directorCruise)
        try c.encode(showHeralds, forKey: .showHeralds)
        try c.encode(showBattleFloats, forKey: .showBattleFloats); try c.encode(seaWaves, forKey: .seaWaves)
        try c.encode(pauseOnSheet, forKey: .pauseOnSheet)
    }
    /// 画面档位: 极省电看海, 省电, 均衡, 流畅 (nil: the values were set one by one).
    static let presets: [(key: String, name: String, mapFPS: Int, marchFPS: Int, effectFPS: Int, renderScale: Double, simLoad: Int)] = [
        ("cool", "极省电", 30, 30, 30, 1.5, 45),
        ("saver", "省电", 60, 45, 45, 1.75, 55),
        ("balanced", "均衡", 60, 60, 60, 2, 60),
        ("smooth", "流畅", 120, 120, 60, 3, 85),
    ]
    var preset: String {
        get { Self.presets.first { $0.mapFPS == mapFPS && $0.marchFPS == marchFPS && $0.effectFPS == effectFPS && $0.renderScale == renderScale && $0.simLoad == simLoad }?.key ?? "custom" }
        set {
            guard let p = Self.presets.first(where: { $0.key == newValue }) else { return }
            mapFPS = p.mapFPS; marchFPS = p.marchFPS; effectFPS = p.effectFPS; renderScale = p.renderScale; simLoad = p.simLoad
        }
    }
    static func load() -> PlaySettings {
        guard let data = UserDefaults.standard.data(forKey: key), let v = try? JSONDecoder().decode(PlaySettings.self, from: data) else { return PlaySettings() }
        return v
    }
    func save() { if let data = try? JSONEncoder().encode(self) { UserDefaults.standard.set(data, forKey: Self.key) } }
}

struct MapView: UIViewRepresentable {
    let map: WorldMap
    @ObservedObject var controller: MapController

    func makeCoordinator() -> Coordinator { Coordinator(map: map, controller: controller) }
    func makeUIView(context: Context) -> MapContainerView { context.coordinator.build() }
    func updateUIView(_ view: MapContainerView, context: Context) { context.coordinator.sync() }
    static func dismantleUIView(_ view: MapContainerView, coordinator: Coordinator) { coordinator.stop() }

    @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var map: WorldMap
        let controller: MapController
        private let picker: CellPicker
        private var container: MapContainerView!
        private var mtk: MTKView!
        private var renderer: MapRenderer?
        private let overlayHost = UIView()
        private let overlayCanvas = UIView()
        private var labels: MapLabelsView!
        private let effects = EffectsView()
        private let floats = UIView()
        private let troops = TroopLabelsView()
        private var shownEffects = MapEffects()
        private var shownRevision = -1
        private var shownArmiesRevision = -1
        private var shownEditorRevision = 0
        private var shownViewLabels: [GroupLabel]?
        private var lastAppearanceKey: (mode: MapMode, highlight: Int?, relations: [Int: UInt32], fills: [RGB]?, view: String)?
        private var lastBorderWide: Set<Int> = []
        private var scrollEdgeMargin: Double { (controller.display.scrollMount ?? controller.display.darkEdges) ? 78 : 12 }
        private var panning = false
        private var cameraInteractive: Bool { pinching || panning || animation != nil || hypot(velocity.x, velocity.y) > 8 }
        /// 地图画心 [0, map.width] × [0, map.height] 在屏幕坐标系里的精确裁剪框，确保国名、箭头与特效严守卷轴画框内缘。
        private func mapScreenRect(camera: MapCamera, viewport: CGSize) -> CGRect {
            guard viewport.width > 0, viewport.height > 0 else { return .zero }
            let vp = (width: Double(viewport.width), height: Double(viewport.height))
            let tl = camera.toScreen(x: 0, y: 0, viewport: vp)
            let br = camera.toScreen(x: Double(map.width), y: Double(map.height), viewport: vp)
            guard tl.x.isFinite, tl.y.isFinite, br.x.isFinite, br.y.isFinite else { return CGRect(origin: .zero, size: viewport) }
            let raw = CGRect(x: tl.x, y: tl.y, width: max(0, br.x - tl.x), height: max(0, br.y - tl.y))
            let clipped = raw.intersection(CGRect(origin: .zero, size: viewport))
            return clipped.isNull ? .zero : clipped
        }
        /// 仅在手指拖拽、双指缩放或镜头飞行期间启用同事务呈现，其余看海行军帧改用异步提交，彻底解除主线程 waitUntilScheduled 阻塞与发热。
        private func setSyncPresent(_ sync: Bool) {
            guard mtk != nil, mtk.presentsWithTransaction != sync else { return }
            mtk.presentsWithTransaction = sync
        }
        private func syncWaves() {
            let want = !controller.drifting && !controller.sheetOpen && controller.reveal >= 1 && controller.play.seaWaves
            if want { effects.startWaves() } else { effects.stopWaves() }
        }
        private let metrics = UILabel()
        private let weather = WeatherOverlayView()
        private var shownWeatherRevision = -1
        private func syncWeather() {
            guard let renderer, mtk != nil else { return }
            let active = !controller.drifting && !controller.sheetOpen && controller.reveal >= 1
            weather.update(seasonPhase: controller.seasonPhase, zones: controller.weatherZones, camera: renderer.camera, viewport: mtk.bounds.size, active: active)
        }
        private var stats = FrameStatistics()
        private var lastFrame: CFTimeInterval = 0
        private var lastReport: CFTimeInterval = 0
        private var link: CADisplayLink?
        private var velocity = CGPoint.zero
        private var animation: (from: MapCamera, to: MapCamera, start: CFTimeInterval, duration: Double)?
        private var lastPinch = CGPoint.zero
        private var pinching = false, pinchTouches = 2
        private var placed = false
        private var focusID: UUID?
        private var focusPointID: UUID?
        private var resetID: UUID?
        private var zoomID: UUID?
        private var unrollID: UUID?
        private var spotlightID: UUID?
        /// The seal ring over a spotlit place; it follows the map while it shows.
        private var spot: (x: Double, y: Double, layer: CALayer)?
        private func placeSpot() {
            guard let spot, let renderer else { return }
            let p = renderer.camera.toScreen(x: spot.x, y: spot.y, viewport: viewport)
            CATransaction.begin(); CATransaction.setDisableActions(true)
            spot.layer.position = CGPoint(x: p.x, y: p.y)
            CATransaction.commit()
        }
        /// 朱印高亮: two vermilion rings close in on the place like a seal pressed on paper, a soft wash
        /// of cinnabar under them, and they pulse three times before fading.
        private func showSpot(x: Double, y: Double) {
            spot?.layer.removeFromSuperlayer()
            let seal = UIColor(red: 0.706, green: 0.255, blue: 0.18, alpha: 1)
            let root = CALayer()
            func ring(_ radius: CGFloat, width: CGFloat, fill: CGFloat, dash: [NSNumber]?) -> CAShapeLayer {
                let l = CAShapeLayer()
                l.path = UIBezierPath(ovalIn: CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2)).cgPath
                l.strokeColor = seal.cgColor; l.lineWidth = width; l.fillColor = seal.withAlphaComponent(fill).cgColor; l.lineDashPattern = dash
                return l
            }
            let inner = ring(30, width: 3, fill: 0.10, dash: nil), outer = ring(40, width: 1.2, fill: 0, dash: [7, 5])
            root.addSublayer(outer); root.addSublayer(inner)
            labels.layer.addSublayer(root)
            let duration = 3.2
            let press = CAKeyframeAnimation(keyPath: "transform.scale")
            press.values = [3.2, 1, 1.18, 1, 1.18, 1, 1.18, 1]; press.keyTimes = [0, 0.2, 0.33, 0.46, 0.59, 0.72, 0.85, 1]
            let fade = CAKeyframeAnimation(keyPath: "opacity")
            fade.values = [0, 1, 1, 0]; fade.keyTimes = [0, 0.16, 0.82, 1]
            let turn = CABasicAnimation(keyPath: "transform.rotation.z"); turn.fromValue = 0; turn.toValue = Double.pi / 2; turn.duration = duration
            outer.add(turn, forKey: "turn")
            for a in [press, fade] as [CAKeyframeAnimation] { a.duration = duration; a.timingFunctions = nil; a.calculationMode = .cubic; a.isRemovedOnCompletion = false; a.fillMode = .forwards; root.add(a, forKey: a.keyPath) }
            spot = (x, y, root); placeSpot()
            DispatchQueue.main.asyncAfter(deadline: .now() + duration + 0.05) { [weak self, weak root] in
                root?.removeFromSuperlayer()
                if let self, self.spot?.layer === root { self.spot = nil }
            }
        }
        private let selection = UISelectionFeedbackGenerator()
        private let impact = UIImpactFeedbackGenerator(style: .light)
        private var mountNotified = false
        private var appliedRevealSerial = -1

        init(map: WorldMap, controller: MapController) {
            self.map = map; self.controller = controller; picker = CellPicker(map: map)
            super.init()
            resetID = controller.resetRequest
            unrollID = controller.unrollRequest
        }

        var mapSize: (width: Double, height: Double) { (Double(map.width), Double(map.height)) }
        var viewport: (width: Double, height: Double) { (Double(mtk.bounds.width), Double(mtk.bounds.height)) }
        /// From the whole map on screen (地图展开: the chart lies unrolled on its paper) to the closest zoom.
        /// The game opens covering the screen (MapCamera.cover); 1.12 made that the furthest zoom too, and
        /// the map could no longer be unrolled.
        var bounds: ClosedRange<Double> { MapCamera.scaleBounds(map: mapSize, viewport: viewport) }

        func build() -> MapContainerView {
            container = MapContainerView()
            container.clipsToBounds = true
            mtk = MTKView(frame: .zero, device: MTLCreateSystemDefaultDevice())
            mtk.clipsToBounds = true
            // Beyond the map: the paper of its mounting (#DED1C5).
            mtk.clearColor = MTLClearColor(red: 0.87, green: 0.82, blue: 0.77, alpha: 1)
            mtk.isPaused = true
            mtk.enableSetNeedsDisplay = true
            // 默认关闭同事务阻塞；仅在拖拽/缩放/镜头飞行时由 setSyncPresent(true) 临时开启，防止看海与开页时主线程被 waitUntilScheduled 拖卡发烫。
            mtk.presentsWithTransaction = false
            mtk.preferredFramesPerSecond = 60
            mtk.autoResizeDrawable = true
            // 地图清晰度 (default 2×): on a 3× screen the map (drawn with 4× multisampling) cost more than twice
            // the GPU work for no visible gain; the names and labels above it stay at full resolution.
            mtk.contentScaleFactor = min(UIScreen.main.scale, controller.play.renderScale)
            renderer = MapRenderer(view: mtk, map: map, parchmentURL: Bundle.main.url(forResource: "parchment", withExtension: "jpg", subdirectory: "World"),
                                   unitURL: { Bundle.main.url(forResource: "unit-\($0)", withExtension: "png", subdirectory: "World") })
            let initialReveal = controller.revealNow ?? controller.reveal
            renderer?.setReveal(initialReveal)
            mtk.delegate = renderer
            renderer?.onDraw = { [weak self] t in self?.frameDrawn(t) }
            renderer?.onOutlines = { [weak self] in self?.startLink(); self?.mtk.setNeedsDisplay() }
            controller.onRevealClock = { [weak self] in self?.revealStarted() }
            controller.onHits = { [weak self] hits in
                guard let self, self.controller.play.showBattleFloats, !self.controller.sheetOpen, let renderer = self.renderer else { return }
                let size = self.mtk.bounds.size, vp = (width: Double(size.width), height: Double(size.height))
                for h in hits {
                    let s = renderer.camera.toScreen(x: Double(h.x), y: Double(h.y), viewport: vp)
                    guard s.x > 10, s.y > 60, s.x < vp.width - 10, s.y < vp.height - 60 else { continue }
                    self.effects.float(h.text, at: CGPoint(x: s.x, y: s.y - 18), naval: h.naval)
                }
            }
            labels = MapLabelsView(map: map)
            labels?.alpha = CGFloat(max(0, min(1, (initialReveal - 0.85) / 0.15)))
            effects.alpha = CGFloat(max(0, min(1, (initialReveal - 0.9) / 0.1)))
            mtk.frame = container.bounds; mtk.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(mtk)
            // 统一将全部地图覆盖层（战争特效、国名地名、飘字、兵力条）收入 overlayHost -> overlayCanvas，
            // 通过 overlayHost.clipsToBounds 硬件剪裁在卷轴画心内（零 layer.mask 离屏渲染开销）。
            overlayHost.frame = container.bounds
            overlayHost.isUserInteractionEnabled = false; overlayHost.clipsToBounds = true
            overlayCanvas.frame = container.bounds
            overlayCanvas.isUserInteractionEnabled = false
            overlayHost.addSubview(overlayCanvas)
            container.addSubview(overlayHost)
            // 战争特效在地名之下（地图之上）：交战、围城、攻占、事件印都不盖住国名与城名；
            // 战况飘字与兵力条另放在地名之上。
            for v in [effects, labels!, floats, troops, weather] as [UIView] {
                v.frame = overlayCanvas.bounds; v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                v.isUserInteractionEnabled = false; v.clipsToBounds = true
                overlayCanvas.addSubview(v)
            }
            effects.floatHost = floats.layer
            // Sea points for the waves: open-sea cell centres, thinned to a few thousand.
            var spots = [CGPoint]()
            let cells = map.cellCount, stride = max(1, cells / 3000)
            for c in Swift.stride(from: 0, to: cells, by: stride) where !map.isLand(c) && 2 * c + 1 < map.sites.count {
                spots.append(CGPoint(x: CGFloat(map.sites[2 * c]), y: CGFloat(map.sites[2 * c + 1])))
            }
            effects.seaSpots = spots
            syncWaves()
            controller.onSheet = { [weak self] in
                guard let self else { return }
                self.gliding = false
                self.syncWaves()
                self.syncWeather()
                if self.controller.sheetOpen {
                    self.mtk.preferredFramesPerSecond = 30
                    self.drift?.invalidate(); self.drift = nil
                    if self.animation == nil && self.controller.revealClock == nil {
                        self.link?.invalidate(); self.link = nil
                    }
                } else {
                    self.mtk.preferredFramesPerSecond = self.controller.play.mapFPS
                    if self.controller.drifting { self.startDrift() }
                    if self.renderer?.isAnimating == true { self.startLink() }
                }
                self.link?.preferredFrameRateRange = self.frameRange
            }
            controller.cameraScale = { [weak self] in
                guard let self, let renderer = self.renderer else { return (0, 0) }
                return (renderer.camera.scale, self.bounds.lowerBound)
            }
            controller.onFramingRequest = { [weak self] in self?.applyFramingRequests() }
            controller.nameFrame = { [weak self] in self?.labels?.nameFrame() ?? [:] }
            controller.renderer = { [weak self] in self?.renderer }
            controller.placed = { [weak self] key in
                guard let p = self?.renderer?.placedSprites().first(where: { $0.sprite.key == key }) else { return nil }
                return (Double(p.x), Double(p.y))
            }
            metrics.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
            metrics.textColor = .white; metrics.backgroundColor = UIColor.black.withAlphaComponent(0.6)
            metrics.numberOfLines = 0; metrics.layer.cornerRadius = 8; metrics.layer.masksToBounds = true
            metrics.isHidden = true; metrics.translatesAutoresizingMaskIntoConstraints = false
            container.addSubview(metrics)
            NSLayoutConstraint.activate([metrics.leadingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.leadingAnchor, constant: 16),
                                         metrics.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor, constant: 64)])
            container.onLayout = { [weak self] in self?.layoutChanged() }
            installGestures()
            return container
        }

        private func installGestures() {
            let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
            pan.maximumNumberOfTouches = 1
            let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
            let double = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
            double.numberOfTapsRequired = 2
            let twoFinger = UITapGestureRecognizer(target: self, action: #selector(handleTwoFingerTap(_:)))
            twoFinger.numberOfTouchesRequired = 2
            let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
            tap.require(toFail: double)
            let press = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
            press.minimumPressDuration = 0.42
            for g in [pan, pinch, double, twoFinger, tap, press] as [UIGestureRecognizer] { g.delegate = self; mtk.addGestureRecognizer(g) }
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            (g is UIPinchGestureRecognizer || g is UIPanGestureRecognizer) && (other is UIPinchGestureRecognizer || other is UIPanGestureRecognizer)
        }
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            // Any new touch stops a fling or a camera animation, as in Maps, and defers director cruise.
            controller.lastUserTouchTime = CACurrentMediaTime()
            stopMotion(); return true
        }

        // MARK: camera

        private func layoutChanged() {
            let b = container.bounds
            guard let renderer, b.width > 0, b.height > 0 else { return }
            UIView.performWithoutAnimation {
                if mtk.frame != b { mtk.frame = b }
                for v in [effects, labels!, floats, troops, weather] as [UIView] where v.frame != b {
                    v.frame = b
                }
            }
            if !placed { renderer.camera = MapCamera.cover(map: mapSize, viewport: viewport); placed = true }
            set(renderer.camera)
            applyFramingRequests()
            if !mountNotified {
                mountNotified = true
                controller.mapMountToken &+= 1
                controller.onMapMounted?()
            }
            if controller.revealClock != nil && !controller.revealDone && appliedRevealSerial != controller.revealClockSerial {
                revealStarted()
            }
        }
        private func set(_ camera: MapCamera, sync: Bool = false, skipLabels: Bool = false) {
            guard let renderer else { return }
            let vpSize = mtk.bounds.size
            guard vpSize.width > 0, vpSize.height > 0 else { return }
            let vp = (width: Double(vpSize.width), height: Double(vpSize.height))
            let b = MapCamera.scaleBounds(map: mapSize, viewport: vp)
            var c = camera.isValid ? camera : MapCamera.cover(map: mapSize, viewport: vp)
            c.scale = min(b.upperBound, max(b.lowerBound, c.scale))
            let clamped = c.clamped(map: mapSize, viewport: vp, margin: scrollEdgeMargin)
            let wantSync = sync || cameraInteractive
            setSyncPresent(wantSync)
            renderer.camera = clamped
            let clipRect = mapScreenRect(camera: clamped, viewport: vpSize)
            let canvasFrame = CGRect(x: -clipRect.minX, y: -clipRect.minY, width: vpSize.width, height: vpSize.height)
            let fullBounds = CGRect(origin: .zero, size: vpSize)
            UIView.performWithoutAnimation {
                if overlayHost.frame != clipRect { overlayHost.frame = clipRect }
                if overlayCanvas.frame != canvasFrame { overlayCanvas.frame = canvasFrame }
                for v in [effects, labels!, floats, troops, weather] as [UIView] where v.frame != fullBounds {
                    v.frame = fullBounds
                }
                if !skipLabels && labels.alpha > 0.01 {
                    labels.update(camera: clamped, viewport: vpSize, mapRect: clipRect)
                }
                if !skipLabels && effects.alpha > 0.01 {
                    effects.update(camera: clamped, viewport: vpSize)
                }
                if !skipLabels && renderer.reveal >= 1 {
                    updateTroops()
                    syncWeather()
                }
                placeSpot()
            }
            mtk.setNeedsDisplay()
        }
        private func updateTroops() {
            guard let renderer else { return }
            // Zoomed out the banners carry no marks: skip collecting every army's position each frame.
            if !troops.shows(renderer.camera) && troops.isEmpty { return }
            troops.texts = controller.troopTexts
            troops.ratios = controller.troopRatios
            troops.colors = controller.troopBarColors
            troops.update(renderer.placedSprites(), camera: renderer.camera, viewport: mtk.bounds.size, spread: renderer.spread)
        }
        private var camera: MapCamera { renderer?.camera ?? MapCamera(centerX: 0, centerY: 0, scale: 1) }

        private var boxStart: CGPoint?
        private lazy var boxLayer: CAShapeLayer = {
            let l = CAShapeLayer()
            l.fillColor = UIColor(red: 0.706, green: 0.255, blue: 0.18, alpha: 0.10).cgColor
            l.strokeColor = UIColor(red: 0.706, green: 0.255, blue: 0.18, alpha: 0.9).cgColor
            l.lineWidth = 1.5; l.lineDashPattern = [6, 4]
            mtk.superview?.layer.addSublayer(l)
            return l
        }()
        /// RTS box selection: the armies inside the box, of the state that has the most of them.
        private func boxSelect(_ g: UIPanGestureRecognizer) {
            let p = g.location(in: mtk)
            switch g.state {
            case .began: boxStart = p
            case .changed:
                if let s = boxStart { boxLayer.path = UIBezierPath(rect: CGRect(x: min(s.x, p.x), y: min(s.y, p.y), width: abs(p.x - s.x), height: abs(p.y - s.y))).cgPath }
            default:
                boxLayer.path = nil
                guard let s = boxStart, let armies = controller.armies else { boxStart = nil; return }
                let rect = CGRect(x: min(s.x, p.x), y: min(s.y, p.y), width: abs(p.x - s.x), height: abs(p.y - s.y)).insetBy(dx: -10, dy: -10)
                let inside = armies.filter { a in guard a.army >= 0 else { return false }; let q = camera.toScreen(x: Double(a.x), y: Double(a.y), viewport: viewport); return rect.contains(CGPoint(x: q.x, y: q.y)) }
                var count = [Int: Int](); for a in inside { count[a.nation, default: 0] += 1 }
                let nation = count.max { $0.value != $1.value ? $0.value < $1.value : $0.key > $1.key }?.key
                controller.groupArmies = inside.filter { $0.nation == nation }.map(\.army)
                controller.boxSelecting = false
                boxStart = nil
                if !controller.groupArmies.isEmpty { selection.selectionChanged() }
            }
        }
        private var lastPainted: Int?
        private lazy var brushRing: CAShapeLayer = {
            let l = CAShapeLayer(); l.fillColor = UIColor(white: 1, alpha: 0.12).cgColor
            l.strokeColor = UIColor(red: 0.706, green: 0.255, blue: 0.18, alpha: 0.9).cgColor; l.lineWidth = 1.5; l.lineDashPattern = [4, 3]
            mtk.layer.addSublayer(l); return l
        }()
        private func showBrush(at p: CGPoint?) {
            guard let p else { brushRing.isHidden = true; return }
            let r = CGFloat(controller.brushRadius * camera.scale)
            CATransaction.begin(); CATransaction.setDisableActions(true)
            brushRing.isHidden = false; brushRing.path = UIBezierPath(ovalIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)).cgPath
            CATransaction.commit()
        }
        @objc private func handlePan(_ g: UIPanGestureRecognizer) {
            if controller.boxSelecting || boxStart != nil { boxSelect(g); return }
            // 自绘地图: one finger draws (two fingers still move and zoom the map).
            if controller.terrainBrush && !pinching && g.numberOfTouches <= 1 {
                let p = g.location(in: mtk)
                if g.state == .ended || g.state == .cancelled || g.state == .failed { showBrush(at: nil); controller.onTerrainStrokeEnd?(); return }
                let w = camera.toWorld(x: Double(p.x), y: Double(p.y), viewport: viewport)
                showBrush(at: p)
                controller.onTerrainStroke?(w.x, w.y)
                return
            }
            // Painting: one finger drags the brush over provinces (two fingers still move the map).
            if controller.paintNation != nil && !pinching && g.numberOfTouches <= 1 {
                if g.state == .ended || g.state == .cancelled { lastPainted = nil; return }
                let p = g.location(in: mtk), w = camera.toWorld(x: Double(p.x), y: Double(p.y), viewport: viewport)
                if let cell = picker.cell(atX: Float(w.x), y: Float(w.y)), map.province[cell] >= 0 {
                    let province = Int(map.province[cell])
                    if province != lastPainted { lastPainted = province; selection.selectionChanged(); controller.onPaint?(province) }
                }
                return
            }
            // While two fingers pinch, the pinch alone moves the map (no double drag), and the
            // finger left after a pinch does not fling.
            if pinching { panning = false; g.setTranslation(.zero, in: mtk); return }
            switch g.state {
            case .began:
                panning = true
                controller.onMapBrowsing?(true)
                let t = g.translation(in: mtk)
                set(camera.panned(dx: Double(t.x), dy: Double(t.y)), sync: true)
                g.setTranslation(.zero, in: mtk)
            case .changed:
                panning = true
                let t = g.translation(in: mtk)
                set(camera.panned(dx: Double(t.x), dy: Double(t.y)), sync: true)
                g.setTranslation(.zero, in: mtk)
            case .ended:
                panning = false
                controller.onMapBrowsing?(false)
                let t = g.translation(in: mtk)
                if t != .zero { set(camera.panned(dx: Double(t.x), dy: Double(t.y)), sync: true); g.setTranslation(.zero, in: mtk) }
                velocity = g.velocity(in: mtk)
                if hypot(velocity.x, velocity.y) > 60 { startLink() } else { setSyncPresent(cameraInteractive) }
            default:
                panning = false
                controller.onMapBrowsing?(false)
                setSyncPresent(cameraInteractive)
            }
        }
        private var atUnrollFloor = false
        @objc private func handlePinch(_ g: UIPinchGestureRecognizer) {
            let p = g.location(in: mtk)
            switch g.state {
            case .began:
                lastPinch = p; pinching = true; panning = false
                controller.onMapBrowsing?(true)
                atUnrollFloor = camera.scale <= bounds.lowerBound * 1.015
            case .changed:
                // A finger lifted or added moves the touch centre: re-anchor instead of jumping.
                if g.numberOfTouches != pinchTouches { pinchTouches = g.numberOfTouches; lastPinch = p; g.scale = 1; return }
                // The fingers both zoom and drag the map.
                let moved = camera.panned(dx: Double(p.x - lastPinch.x), dy: Double(p.y - lastPinch.y))
                let nextCam = moved.zoomed(by: Double(g.scale), anchorX: Double(p.x), anchorY: Double(p.y), viewport: viewport, bounds: bounds)
                let hitFloor = nextCam.scale <= bounds.lowerBound * 1.012
                if hitFloor && !atUnrollFloor && g.scale < 1 {
                    selection.selectionChanged()
                }
                atUnrollFloor = hitFloor
                set(nextCam, sync: true)
                g.scale = 1; lastPinch = p
            default:
                pinching = false; pinchTouches = 2
                controller.onMapBrowsing?(false)
                setSyncPresent(cameraInteractive)
            }
        }
        @objc private func handleDoubleTap(_ g: UITapGestureRecognizer) {
            let p = g.location(in: mtk)
            impact.impactOccurred()
            animate(to: camera.zoomed(by: 2, anchorX: Double(p.x), anchorY: Double(p.y), viewport: viewport, bounds: bounds))
        }
        @objc private func handleTwoFingerTap(_ g: UITapGestureRecognizer) {
            let p = g.location(in: mtk)
            animate(to: camera.zoomed(by: 0.5, anchorX: Double(p.x), anchorY: Double(p.y), viewport: viewport, bounds: bounds))
        }
        /// A long press ends as a tap too: that tap is not a selection.
        private var pressing = false
        @objc private func handleLongPress(_ g: UILongPressGestureRecognizer) {
            if g.state == .ended || g.state == .cancelled || g.state == .failed { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in self?.pressing = false }; return }
            guard !controller.replayLocked else { return }
            guard g.state == .began, controller.pickPrompt == nil, controller.marchingArmy == nil, controller.marchingFleet == nil, controller.paintNation == nil, !controller.boxSelecting, !controller.terrainBrush else { return }
            let p = g.location(in: mtk), w = camera.toWorld(x: Double(p.x), y: Double(p.y), viewport: viewport)
            guard let cell = picker.cell(atX: Float(w.x), y: Float(w.y)), map.province[cell] >= 0 else { return }
            pressing = true
            impact.impactOccurred()
            controller.onLongPress?(Int(map.province[cell]), p)
        }
        @objc private func handleTap(_ g: UITapGestureRecognizer) {
            if pressing || controller.replayLocked { return }
            let p = g.location(in: mtk), w = camera.toWorld(x: Double(p.x), y: Double(p.y), viewport: viewport)
            if controller.terrainBrush { controller.onTerrainStroke?(w.x, w.y); controller.onTerrainStrokeEnd?(); return }
            var province: Int?
            if let cell = picker.cell(atX: Float(w.x), y: Float(w.y)), map.province[cell] >= 0 { province = Int(map.province[cell]) }
            if controller.pickPrompt != nil {
                if let province { impact.impactOccurred(); controller.onPick?(province) }
                return
            }
            if controller.marchingArmy != nil {
                if let province { impact.impactOccurred(); controller.onMarchTarget?(province) }
                return
            }
            if controller.paintNation != nil {
                if let province { impact.impactOccurred(); controller.onPaint?(province) }
                return
            }
            if controller.marchingFleet != nil {
                if let province { impact.impactOccurred(); controller.onFleetTarget?(province) }
                return
            }
            if !controller.groupArmies.isEmpty {
                if let province { impact.impactOccurred(); controller.onGroupTarget?(province) }
                return
            }
            // An army icon under the finger takes the tap before the province. 命中检测与绘制同一位置：
            // 同处多军排成小圆环时按各自的座位偏移（以前用未偏移的中心，密集时点到的不是看到的那支）；
            // 半径随图标屏幕尺寸，至少 16 点。
            if controller.armies != nil, let renderer {
                let placed = renderer.placedSprites()
                let icon = MapRenderer.iconPoints(camera.scale, iconScale: controller.play.iconScale), reach = max(22, icon * 0.78)
                var best: (army: Int, key: String, d: Double)?
                for a in placed where a.sprite.army > -100_000 && a.x.isFinite && a.y.isFinite {
                    let s = camera.toScreen(x: Double(a.x), y: Double(a.y), viewport: viewport), o = renderer.spread[a.sprite.key] ?? .zero
                    guard s.x.isFinite && s.y.isFinite else { continue }
                    let d = hypot(s.x + Double(o.x) * icon - Double(p.x), s.y + Double(o.y) * icon - Double(p.y))
                    if d < reach, best == nil || d < best!.d { best = (a.sprite.army, a.sprite.key, d) }
                }
                if let best {
                    selection.selectionChanged()
                    if best.army < 0 {
                        controller.selectedFleetId = best.key.isEmpty ? nil : best.key
                        controller.selectedFleet = -best.army - 1
                    } else {
                        controller.selectedArmyId = best.key.isEmpty ? nil : best.key
                        controller.selectedArmy = best.army
                    }
                    return
                }
            }
            if province != controller.selectedProvince { selection.selectionChanged() }
            controller.onMapTap?(province == nil)
            controller.selectedProvince = province
        }

        private func animate(to target: MapCamera, duration: Double = 0.38) {
            guard target.isValid else { return }
            var t = target
            t.scale = min(bounds.upperBound, max(bounds.lowerBound, t.scale))
            let start = camera.isValid ? camera : MapCamera.cover(map: mapSize, viewport: viewport)
            animation = (start, t.clamped(map: mapSize, viewport: viewport, margin: scrollEdgeMargin), CACurrentMediaTime(), max(0.05, duration))
            velocity = .zero
            startLink()
        }
        private func stopMotion() { velocity = .zero; animation = nil }
        private func startLink() {
            guard link == nil else { return }
            let l = CADisplayLink(target: self, selector: #selector(step(_:)))
            l.preferredFrameRateRange = frameRange
            l.add(to: .main, forMode: .common); link = l; gliding = false
        }
        private static func range(_ fps: Int) -> CAFrameRateRange {
            let f = Float(fps)
            return CAFrameRateRange(minimum: max(10, f / 2), maximum: f, preferred: f)
        }
        private var frameRange: CAFrameRateRange {
            controller.sheetOpen ? Self.range(30) : Self.range(Energy.hot ? min(30, controller.play.mapFPS) : Energy.level >= 1 ? min(60, controller.play.mapFPS) : controller.play.mapFPS)
        }
        /// While only the armies glide (the camera still): 60 frames, 30 when the phone runs hot. Icons
        /// moving a few points a frame look the same, and the map is drawn half as often as at 120.
        private var glideRange: CAFrameRateRange {
            controller.sheetOpen ? Self.range(30) : Self.range(Energy.hot ? min(20, controller.play.marchFPS) : Energy.level >= 1 ? min(30, controller.play.marchFPS) : controller.play.marchFPS)
        }
        private var gliding = false
        private var shownWashes = WashFrame.empty
        private var shownWashEpoch = -1
        private var appliedPlay: PlaySettings?
        private func pace(_ l: CADisplayLink, glide: Bool) {
            guard glide != gliding else { return }
            gliding = glide
            l.preferredFrameRateRange = glide ? glideRange : frameRange
        }
        /// A reveal clock began: the map follows it frame by frame; with `push` the camera eases out from 1.25×.
        private func revealStarted() {
            guard placed else { return }
            appliedRevealSerial = controller.revealClockSerial
            if let c = controller.revealClock, let renderer {
                renderer.setReveal(controller.revealNow ?? c.from)
                if c.push {
                    let target = camera
                    var from = target; from.scale = target.scale * 1.25
                    set(from)
                    animate(to: target, duration: c.duration * 1.1)
                }
            }
            startLink()
        }
        /// One frame of the reveal clock; false when none runs.
        private func advanceReveal() -> Bool {
            guard let t = controller.revealNow, let renderer else { return false }
            renderer.setReveal(t)
            labels?.alpha = CGFloat(max(0, min(1, (t - 0.85) / 0.15)))
            effects.alpha = CGFloat(max(0, min(1, (t - 0.9) / 0.1)))
            mtk.setNeedsDisplay()
            // The owner (GameModel) clears the clock once the published value has caught up.
            if controller.revealDone { renderer.setReveal(controller.revealClock?.to ?? t); return false }
            return true
        }
        @objc private func step(_ l: CADisplayLink) {
            let dt = min(0.05, l.targetTimestamp - l.timestamp)
            let revealing = advanceReveal()
            let cameraMoving = cameraInteractive
            pace(l, glide: !cameraMoving)
            if let a = animation {
                let x = min(1, (CACurrentMediaTime() - a.start) / a.duration)
                let eased = x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
                set(MapCamera.arcInterpolate(a.from, a.to, eased, bounds: bounds), sync: true)
                if x >= 1 { animation = nil; setSyncPresent(cameraInteractive) }
            } else if hypot(velocity.x, velocity.y) > 8 {
                // Exponential deceleration close to UIScrollView's normal rate.
                set(camera.panned(dx: Double(velocity.x) * dt, dy: Double(velocity.y) * dt), sync: true)
                let decay = CGFloat(pow(0.998, dt * 1000))
                velocity = CGPoint(x: velocity.x * decay, y: velocity.y * decay)
            } else if !controller.sheetOpen && renderer?.isAnimating == true {
                if !cameraInteractive { setSyncPresent(false) }
                velocity = .zero
                updateTroops()
                mtk.setNeedsDisplay()
            } else if !revealing {
                if !cameraInteractive { setSyncPresent(false) }
                velocity = .zero
                if !controller.sheetOpen { mtk.setNeedsDisplay() }
                link?.invalidate(); link = nil
            }
        }

        // MARK: SwiftUI → map

        private static func worldChanged(_ a: WorldMap, _ b: WorldMap) -> Bool {
            if a.meta.provinces.count != b.meta.provinces.count || a.meta.labels.count != b.meta.labels.count || a.meta.nations.count != b.meta.nations.count { return true }
            for i in a.meta.provinces.indices where a.meta.provinces[i].nation != b.meta.provinces[i].nation { return true }
            for i in a.meta.labels.indices {
                let l = a.meta.labels[i], r = b.meta.labels[i]
                if l.nation != r.nation || l.x != r.x || l.y != r.y { return true }
            }
            for i in a.meta.nations.indices {
                let l = a.meta.nations[i], r = b.meta.nations[i]
                if l.name != r.name || l.color != r.color { return true }
            }
            return false
        }

        func sync() {
            var dirty = false
            if let renderer, renderer.seasonPhase != controller.seasonPhase {
                renderer.seasonPhase = controller.seasonPhase
                syncWeather()
                dirty = true
            }
            if let renderer, shownWeatherRevision != controller.weatherRevision {
                shownWeatherRevision = controller.weatherRevision
                renderer.setWeatherZones(controller.weatherGPUZones)
                syncWeather()
                dirty = true
            }
            if controller.worldRevision != shownRevision, let next = controller.world, Self.worldChanged(next, map) {
                shownRevision = controller.worldRevision
                map = next
                renderer?.setMap(next, skipStatic: controller.replayLocked, skipOutlines: controller.replayScrubbing, animateColors: !controller.replayLocked || controller.replayAnimate)
                // 回放期间城池位置不变，跳过主线程 CoreText 全城重绘，彻底消除逐帧掉帧与卡顿。
                if !controller.replayLocked { labels.setCities(map: next) }
                // 快速拖拽回放进度条期间跳过国名框重建，松手或单步/自动播放时即时更新。
                if !controller.replayScrubbing {
                    if let groups = controller.viewLabels { labels.setGroups(groups, animated: false) } else { labels.setNations(map: next, animated: false) }
                    if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size)) }
                }
                dirty = true
            }
            // While a reveal clock runs the display link draws it; the published value is only coarse.
            if controller.revealClock != nil && !controller.revealDone && link == nil { startLink() }
            if controller.revealClock == nil {
                if let renderer, renderer.reveal != controller.reveal { renderer.setReveal(controller.reveal); dirty = true }
                // Names ink in last, with the cities.
                labels?.alpha = CGFloat(max(0, min(1, (controller.reveal - 0.85) / 0.15)))
                effects.alpha = CGFloat(max(0, min(1, (controller.reveal - 0.9) / 0.1)))
            }
            mtk?.isUserInteractionEnabled = controller.interactive
            if controller.drifting { startDrift() }
            syncWaves()
            let nextApp = (mode: controller.mode, highlight: controller.selectedProvince, relations: controller.relations, fills: controller.viewFills, view: controller.viewKey)
            let appChanged: Bool = {
                guard let prev = lastAppearanceKey else { return true }
                return prev.mode != nextApp.mode || prev.highlight != nextApp.highlight || prev.relations != nextApp.relations || prev.fills != nextApp.fills || prev.view != nextApp.view
            }()
            if appChanged {
                lastAppearanceKey = nextApp
                renderer?.setAppearance(mode: nextApp.mode, highlight: nextApp.highlight, tint: nextApp.relations.mapValues { RGB(hex: $0) }, fills: nextApp.fills, view: nextApp.view)
                dirty = true
            }
            if controller.worldRevision != shownRevision { shownRevision = controller.worldRevision }
            if controller.editorRevision != shownEditorRevision, let next = controller.editorMap {
                shownEditorRevision = controller.editorRevision
                map = next
                renderer?.setTerrain(next, refreshSea: controller.editorSeaDirty)
                controller.editorSeaDirty = false
                labels.setNations(map: next, animated: false)
                labels.setCities(map: next)
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size)) }
                dirty = true
            }
            if controller.armiesRevision != shownArmiesRevision, let armies = controller.armies {
                shownArmiesRevision = controller.armiesRevision
                // Playing: glide linearly over one step so marching does not pulse; a single move eases.
                let snapped = controller.snapArmies
                renderer?.tweenDuration = controller.tween
                renderer?.tweenEase = controller.tween <= 0.3
                renderer?.deathDelays = controller.deathDelays
                renderer?.setArmies(armies, route: controller.route, snap: snapped)
                controller.snapArmies = false
                if snapped || !controller.route.isEmpty { dirty = true }
                if !controller.sheetOpen {
                    updateTroops()
                    if renderer?.isAnimating == true { startLink() }
                }
            }
            if controller.washes != shownWashes || controller.washEpoch != shownWashEpoch {
                shownWashes = controller.washes; shownWashEpoch = controller.washEpoch
                renderer?.setWashes(shownWashes, epoch: shownWashEpoch)
                if !controller.sheetOpen && renderer?.isAnimating == true { startLink() }
                dirty = true
            }
            if controller.viewLabels != shownViewLabels {
                let animated = controller.viewLabels?.map(\.name) != shownViewLabels?.map(\.name)
                shownViewLabels = controller.viewLabels
                if let groups = shownViewLabels { labels.setGroups(groups, animated: animated) } else { labels.setNations(map: map, animated: animated) }
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size)) }
                dirty = true
            }
            if controller.effects != shownEffects { shownEffects = controller.effects; effects.set(shownEffects); effects.alpha = controller.reveal >= 1 ? 1 : 0; dirty = true }
            labels?.setSelected(controller.selectedProvince)
            if let renderer {
                var wide = Set<Int>()
                if let n = controller.relationsNation { wide.insert(n) }
                if let p = controller.selectedProvince, map.meta.provinces.indices.contains(p) {
                    let owner = map.meta.provinces[p].nation
                    if owner >= 0 { wide.insert(owner) }
                }
                if wide != lastBorderWide {
                    lastBorderWide = wide
                    renderer.setBorderEmphasis(wide)
                    dirty = true
                }
            }
            if let renderer {
                let wantArmies = controller.play.showArmies || controller.replayLocked
                if renderer.showArmies != wantArmies || renderer.iconScale != Float(controller.play.iconScale) { dirty = true }
                renderer.showArmies = wantArmies
                renderer.iconScale = Float(controller.play.iconScale)
                effects.showArrows = controller.play.warArrows || controller.replayLocked
                troops.iconScale = controller.play.iconScale
                if !controller.sheetOpen { mtk.preferredFramesPerSecond = controller.play.mapFPS }
                // 画面 settings: the simulation's share, cooling, the effects' frames and the map's pixels.
                Energy.autoCool = controller.play.autoCool
                Energy.load = Double(controller.play.simLoad) / 100
                EffectsView.fps = controller.play.effectFPS
                let scale = min(UIScreen.main.scale, controller.play.renderScale)
                if mtk.contentScaleFactor != scale { mtk.contentScaleFactor = scale; dirty = true }
                if controller.play != appliedPlay {
                    appliedPlay = controller.play
                    syncWaves()
                    gliding = false; link?.preferredFrameRateRange = frameRange
                    dirty = true
                }
            }
            if let renderer, renderer.display != controller.display {
                renderer.setDisplay(controller.display)
                dirty = true
            }
            if renderer?.setSeaPorts(controller.seaPorts) == true { dirty = true }
            if renderer?.setForts(controller.forts, holy: controller.holy) == true { dirty = true }
            if labels.setCustom(controller.customLabels) { dirty = true }
            if labels.setImages(controller.customImages) { dirty = true }
            if renderer?.setExtraRivers(controller.customRivers) == true { dirty = true }
            if labels.nameScale != controller.display.nationNameScale || labels.fullNames != controller.display.fullNationNames {
                labels.nameScale = controller.display.nationNameScale
                let namesChanged = labels.fullNames != controller.display.fullNationNames
                labels.fullNames = controller.display.fullNationNames
                if namesChanged, controller.viewLabels == nil { labels.setNations(map: map, animated: false) }
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size)) }
                dirty = true
            }
            if let labels, labels.showCities != controller.display.cityNames {
                labels.showCities = controller.display.cityNames
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size)) }
                dirty = true
            }
            metrics.isHidden = !controller.showMetrics
            if let f = controller.focus, f.id != focusID {
                focusID = f.id
                if map.meta.provinces.indices.contains(f.province) {
                    let p = map.meta.provinces[f.province]
                    if p.x.isFinite && p.y.isFinite {
                        animate(to: MapCamera(centerX: Double(p.x), centerY: Double(p.y), scale: max(camera.scale, bounds.lowerBound * 4)), duration: 0.5)
                    }
                }
            }
            if let f = controller.focusPoint, f.id != focusPointID {
                focusPointID = f.id
                if f.x.isFinite && f.y.isFinite && viewport.width > 0 && viewport.height > 0 {
                    let scale = max(0.05, max(camera.scale, bounds.lowerBound * 7))
                    // The sheet covers the lower part of the screen: the unit sits in the upper third.
                    animate(to: MapCamera(centerX: f.x, centerY: f.y + Double(viewport.height) * 0.2 / scale, scale: scale), duration: 0.55)
                }
            }
            if let s = controller.spotlight, s.id != spotlightID {
                spotlightID = s.id
                if s.x.isFinite && s.y.isFinite && viewport.width > 0 && viewport.height > 0 {
                    // The sheet (dropped to its lowest stop) covers the lower part: the place sits at 30 % from the top.
                    animate(to: MapCamera.spotlight(x: s.x, y: s.y, from: camera, map: mapSize, viewport: viewport), duration: 0.75)
                    showSpot(x: s.x, y: s.y)
                }
            }
            if let z = controller.zoomRequest, z.id != zoomID {
                zoomID = z.id
                animate(to: camera.zoomed(by: z.factor, anchorX: viewport.width / 2, anchorY: viewport.height / 2, viewport: viewport, bounds: bounds), duration: 0.3)
            }
            applyFramingRequests()
            if dirty { setSyncPresent(cameraInteractive); mtk?.setNeedsDisplay() }
        }

        /// 展开和复位独立于推演刷新，命令可在地图静止时直接启动镜头。
        private func applyFramingRequests() {
            guard renderer != nil, viewport.width > 0, viewport.height > 0 else { return }
            if controller.unrollRequest != unrollID {
                unrollID = controller.unrollRequest
                animate(to: MapCamera.fit(map: mapSize, viewport: viewport), duration: 0.6)
            }
            if controller.resetRequest != resetID {
                resetID = controller.resetRequest
                animate(to: MapCamera.cover(map: mapSize, viewport: viewport), duration: 0.45)
            }
        }

        private func frameDrawn(_ t: CFTimeInterval) {
            if lastFrame > 0, t - lastFrame < 0.25 { stats.record(seconds: t - lastFrame) }
            lastFrame = t
            if !metrics.isHidden, t - lastReport > 0.5 {
                lastReport = t
                metrics.text = String(format: "  平均 %.2f ms · 1%% low %.0f fps  \n  绘制间隔（按需重绘，非 GPU 耗时）  ", stats.averageMilliseconds, stats.onePercentLow)
                    + (controller.simText.isEmpty ? "" : "\n" + controller.simText)
                PerfLog.record(frameMs: stats.averageMilliseconds, lowFPS: stats.onePercentLow, sim: controller.simText)
            }
        }

        func stop() { link?.invalidate(); link = nil; drift?.invalidate(); drift = nil; effects.stopWaves() }

        private var drift: CADisplayLink?
        private var driftFrame = 0
        private func startDrift() {
            guard drift == nil, !controller.sheetOpen else { return }
            let l = CADisplayLink(target: self, selector: #selector(driftStep(_:)))
            // 主页面舆图缓游：满帧 60Hz（ProMotion 最高 120Hz）丝滑匀速平推，弹窗打开或开卷时立即礼让，彻底告别低帧卡顿感。
            l.preferredFrameRateRange = CAFrameRateRange(minimum: 48, maximum: 120, preferred: 60)
            l.add(to: .main, forMode: .common); drift = l
        }
        @objc private func driftStep(_ l: CADisplayLink) {
            guard controller.drifting else { drift?.invalidate(); drift = nil; return }
            // 弹窗覆盖主页（新建世界/设置/卷宗等）或开卷主时钟正在绘制时，暂缓背景漂移，释放主线程与 GPU。
            if controller.sheetOpen || (controller.revealClock != nil && !controller.revealDone) { return }
            driftFrame &+= 1
            let dt = min(0.05, max(0.0, l.targetTimestamp - l.timestamp))
            let prev = camera
            let next = prev.panned(dx: -4.2 * dt, dy: 0)
            // 绝大多数漂移帧走零网格重算的纯像素平移（60fps 丝滑无抖动），仅每 24 帧重排一次新入镜国名。
            if driftFrame % 24 == 0 {
                set(next, sync: false, skipLabels: false)
            } else {
                set(next, sync: false, skipLabels: true)
                if let r = renderer {
                    let screenDx = CGFloat((prev.centerX - r.camera.centerX) * r.camera.scale)
                    let screenDy = CGFloat((prev.centerY - r.camera.centerY) * r.camera.scale)
                    if abs(screenDx) > 0.0001 || abs(screenDy) > 0.0001 {
                        labels?.panVisible(dx: screenDx, dy: screenDy)
                    }
                }
            }
        }
    }
}

final class MapContainerView: UIView {
    var onLayout: (() -> Void)?
    override func layoutSubviews() { super.layoutSubviews(); onLayout?() }
}

/// Map labels as the web draws them (map.ts / original-labels47.ts), in the original's TW-Kai:
/// - state names: one per LabelUtility box, TextMeshPro auto-size between fontMin and fontMax, black with
///   an outline in the state colour at 0.8; they zoom with the map;
/// - city names: size 64 × BurgLabelScale 0.13 (capital × 1.5) placed 0.7 × scale above the city, skipped
///   below 9 pt on screen.
/// Text is re-rendered at the on-screen size whenever the zoom moves it by more than 25 %, so it stays sharp.
final class MapLabelsView: UIView {
    static let fontName = "TW-Kai-98_1"
    private final class Label {
        let view = UIImageView()
        let text: String
        var x: Double, y: Double, mapEm: Double
        let fill: UIColor, stroke: UIColor, strokeWidth: Double, minPoints: Double, province: Int?
        var rendered: Double = 0
        /// Tilt in radians (a state name along its land).
        var angle: Double = 0
        /// The smallest size on screen (a capital's name), and the city's own place the enlarged name stands above.
        var floorPoints: Double = 0
        var anchorY: Double?
        init(text: String, x: Double, y: Double, mapEm: Double, fill: UIColor, stroke: UIColor, strokeWidth: Double, minPoints: Double, province: Int?) {
            self.text = text; self.x = x; self.y = y; self.mapEm = mapEm; self.fill = fill; self.stroke = stroke; self.strokeWidth = strokeWidth; self.minPoints = minPoints; self.province = province
        }
    }
    private var nations: [Label] = []
    private var custom: [Label] = []
    private struct Picture { let view: UIImageView; let x: Double; let y: Double; let width: Double; let angle: Double }
    private var pictures: [Picture] = []
    private var picturesShown: [GameModel.MapImage] = []
    /// 工笔手绘舆图装饰与微缩地标（海洋古罗盘玫瑰、王都城楼、雄关烽燧、古港灯塔），位于全部地名之下、纯 GPU 平移缩放零额外着色开销。
    private struct MapStamp {
        let view: UIImageView
        let x: Double
        let y: Double
        let worldWidth: Double
        let minScale: Double
        let maxAlpha: CGFloat
        let screenMin: CGFloat
        let screenMax: CGFloat
    }
    private var stamps: [MapStamp] = []
    /// 地图图片: under the names, or over them when the player asks.
    func setImages(_ list: [GameModel.MapImage]) -> Bool {
        guard list != picturesShown else { return false }
        picturesShown = list
        for p in pictures { p.view.removeFromSuperview() }
        pictures = list.filter(\.visible).compactMap { m in
            guard let data = Data(base64Encoded: m.data), let image = UIImage(data: data) else { return nil }
            let v = UIImageView(image: image); v.alpha = m.alpha; v.isHidden = true
            if m.front { addSubview(v) } else { insertSubview(v, at: 0) }
            return Picture(view: v, x: m.x, y: m.y, width: m.width, angle: m.angle)
        }
        return true
    }
    private var customShown: [GameModel.MapLabel] = []
    /// The player's own words on the map; they come before every other name.
    func setCustom(_ list: [GameModel.MapLabel]) -> Bool {
        guard list != customShown else { return false }
        customShown = list
        for l in custom { l.view.removeFromSuperview() }
        custom = list.map { m in
            let l = Label(text: m.text, x: m.x, y: m.y, mapEm: m.size, fill: Self.color(m.color), stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.75), strokeWidth: 6.0 / 64, minPoints: 3, province: nil)
            l.angle = m.angle
            return l
        }
        for l in custom { l.view.isHidden = true; addSubview(l.view) }
        return true
    }
    private var cities: [Label] = []
    private var capitalCityLabels: [Label] = []
    private var otherCityLabels: [Label] = []

    static func font(_ size: CGFloat) -> UIFont { UIFont(name: fontName, size: size) ?? .systemFont(ofSize: size, weight: .semibold) }

    init(map: WorldMap) {
        super.init(frame: .zero)
        let unit = Double(MapLayers.fontUnit)
        nations = Self.nationLabels(map, unit: unit, full: true)
        cities = Self.cityLabels(map)
        capitalCityLabels = cities.filter { $0.fill === Self.capitalInk }
        otherCityLabels = cities.filter { $0.fill !== Self.capitalInk }
        for l in cities + nations { l.view.isHidden = true; addSubview(l.view) }
        setSeals(map)
        rebuildStamps(map)
    }
    private func rebuildStamps(_ map: WorldMap) {
        // v4.2 极简古舆图线描都城微标：在王都城圈旁轻敷半透明焦墨手绘宫阙/城楼线稿印记，放大观图时呈现古图志风韵，远景自动隐去零干扰。
        for s in stamps { s.view.removeFromSuperview() }
        stamps.removeAll(keepingCapacity: true)
        for n in map.meta.nations where map.meta.cities.indices.contains(n.capital) {
            let c = map.meta.cities[n.capital]
            guard let img = BundleArt.capitalInkStamp(for: n.culture) else { continue }
            let iv = UIImageView(image: img)
            iv.bounds = CGRect(origin: .zero, size: img.size)
            iv.isHidden = true
            insertSubview(iv, at: 0)
            stamps.append(MapStamp(
                view: iv,
                x: Double(c.x),
                y: Double(c.y) - 3.6,
                worldWidth: 14.5,
                minScale: 1.08,
                maxAlpha: 0.68,
                screenMin: 15,
                screenMax: 29
            ))
        }
    }
    private static func cityLabels(_ map: WorldMap) -> [Label] {
        return zip(map.meta.cities, MapLayers.cityMarks(map)).filter { !$0.0.name.isEmpty }.map { c, mark in
            let s: Double = mark == .capital ? 1.5 : mark == .provinceSeat ? 1.28 : 1
            let em = 64 * 0.13 * s / 10 * (1600.0 / 240.0), offset = 0.7 * s * (1600.0 / 240.0)
            // A capital's name in vermilion: it stays centred over its mark and is found at a glance.
            let l = Label(text: c.name, x: Double(c.x), y: Double(c.y) - offset, mapEm: em, fill: mark == .capital ? Self.capitalInk : UIColor(white: 0x11 / 255.0, alpha: 1),
                         stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.7), strokeWidth: 6.0 / 64, minPoints: 8, province: c.province)
            // 首都名分级: a capital's name is written at eleven points at the least, so it is read at the zoom the
            // game opens at (it used to show only close up); it keeps clear of the capital's rings.
            if mark == .capital { l.floorPoints = 11; l.anchorY = Double(c.y) }
            return l
        }.sorted { $0.mapEm > $1.mapEm }
    }
    /// The cities changed (a preview replaced by the founded world, whose cities have names): rebuild them.
    private var cityKey = ""
    func setCities(map: WorldMap) {
        let key = map.meta.cities.map(\.name).joined(separator: "|") + zip(map.meta.cities.indices, MapLayers.cityMarks(map)).filter { $0.1 == .capital }.map { "\($0.0)" }.joined(separator: ",")
        guard key != cityKey else { return }
        cityKey = key
        for l in cities { l.view.removeFromSuperview() }
        cities = Self.cityLabels(map)
        capitalCityLabels = cities.filter { $0.fill === Self.capitalInk }
        otherCityLabels = cities.filter { $0.fill !== Self.capitalInk }
        for l in cities { l.view.isHidden = true; insertSubview(l.view, at: 0) }
        setSeals(map)
        rebuildStamps(map)
    }

    /// Where the capitals stand: their marks (the original's rings, MapLayers.cityIcons) are kept clear
    /// of every name, and their own names are placed before the state names, so a state's name never
    /// covers its capital.
    private var capitals: [(x: Double, y: Double)] = []
    /// The capital names' vermilion (one instance, so the layout can tell those names apart).
    static let capitalInk = UIColor(red: 0.62, green: 0.1, blue: 0.07, alpha: 1)
    private func setSeals(_ map: WorldMap) {
        capitals = zip(map.meta.cities, MapLayers.cityMarks(map)).filter { $0.1 == .capital }.map { c, _ in (Double(c.x), Double(c.y)) }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private static func nationLabels(_ map: WorldMap, unit: Double, full: Bool) -> [Label] {
        map.meta.labels.filter { $0.nation >= 0 && map.meta.nations.indices.contains($0.nation) }.map { box in
            let n = map.meta.nations[box.nation]
            let shown = MapLayers.stateLabel(n.name, full: full)
            let measured = (shown as NSString).size(withAttributes: [.font: font(1)])
            let size = MapLayers.labelFontSize(box: box, emWidth: Float(measured.width), emHeight: Float(measured.height))
            let l = Label(text: shown, x: Double(box.x), y: Double(box.y), mapEm: Double(size) * unit, fill: .black, stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.75), strokeWidth: 6.0 / 64, minPoints: 3.2, province: nil)
            l.angle = Double(box.angle ?? 0)
            return l
        }.sorted { $0.mapEm != $1.mapEm ? $0.mapEm > $1.mapEm : $0.text < $1.text }
    }
    /// Ownership changed: replace the state names, keep every city label and its rendered image.
    /// A colour view names its groups (culture, family, religion) where the state names were.
    func setGroups(_ groups: [GroupLabel], animated: Bool = true) {
        let unit = Double(MapLayers.fontUnit)
        let fresh = groups.map { g -> Label in
            let measured = (g.name as NSString).size(withAttributes: [.font: Self.font(1)])
            let size = MapLayers.labelFontSize(box: g.box, emWidth: Float(measured.width), emHeight: Float(measured.height))
            return Label(text: g.name, x: Double(g.box.x), y: Double(g.box.y), mapEm: Double(size) * unit, fill: .black, stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.75), strokeWidth: 6.0 / 64, minPoints: 4, province: nil)
        }.sorted { $0.mapEm > $1.mapEm }
        guard animated else { continueNames(fresh); return }
        fadeOut(nations, animated)
        nations = fresh
        fadeIn(nations, animated)
    }
    func setNations(map: WorldMap, animated: Bool = true) {
        let fresh = Self.nationLabels(map, unit: Double(MapLayers.fontUnit), full: fullNames)
        guard animated else { continueNames(fresh); return }
        fadeOut(nations, animated)
        nations = fresh
        fadeIn(nations, animated)
    }
    /// 国名不闪: borders changed while the same names stay on the map. A name that is still there keeps
    /// its view (rebuilding them all made every name vanish and fade in again with each province that
    /// changed hands), and keeps its place when its box barely moved (NameStability).
    private func continueNames(_ fresh: [Label]) {
        func placement(_ l: Label) -> NameStability.Placement { .init(text: l.text, x: l.x, y: l.y, em: l.mapEm, angle: l.angle) }
        let old = nations, matches = NameStability.match(old: old.map(placement), fresh: fresh.map(placement))
        var kept = Set<Int>(), next = [Label]()
        for (f, m) in zip(fresh, matches) {
            guard let i = m.reuse else {
                f.view.isHidden = true; addSubview(f.view); next.append(f); Self.namesCreated += 1; continue
            }
            let o = old[i]; kept.insert(i)
            // 若旧标签恰好在淡入/淡出动画中途被复用，强制恢复不透明，防止国名隐身。
            if !o.view.isHidden && o.view.alpha < 0.99 { o.view.layer.removeAllAnimations(); o.view.alpha = 1 }
            if !m.keep { o.x = f.x; o.y = f.y; o.mapEm = f.mapEm; o.angle = f.angle; Self.namesMoved += 1 }
            next.append(o)
        }
        for (i, o) in old.enumerated() where !kept.contains(i) { o.view.removeFromSuperview() }
        nations = next.sorted { $0.mapEm != $1.mapEm ? $0.mapEm > $1.mapEm : $0.text < $1.text }
    }
    /// The state names showing now and the opacity each is drawn with this frame (the presentation
    /// layer: a name that is fading in reads below 1).
    func nameFrame() -> [String: Float] {
        var out = [String: Float]()
        for l in nations where !l.view.isHidden { out["\(l.text)#\(ObjectIdentifier(l.view).hashValue)"] = (l.view.layer.presentation() ?? l.view.layer).opacity }
        return out
    }
    /// CI's 国名稳定 check: names created and moved by border changes, and names that faded in.
    static var namesCreated = 0, namesMoved = 0, namesFadedIn = 0
    /// Name sets cross-fade when a view switches or borders change, instead of popping.
    private func fadeOut(_ old: [Label], _ animated: Bool) {
        let views = old.map(\.view)
        guard animated else { for v in views { v.removeFromSuperview() }; return }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction], animations: { for v in views { v.alpha = 0 } },
                       completion: { _ in for v in views { v.removeFromSuperview() } })
    }
    private func fadeIn(_ new: [Label], _ animated: Bool) {
        for l in new { l.view.isHidden = true; l.view.alpha = animated ? 0 : 1; addSubview(l.view) }
        guard animated else { return }
        UIView.animate(withDuration: 0.3, delay: 0.08, options: [.allowUserInteraction], animations: { for l in new { l.view.alpha = 1 } })
    }
    /// Rendered label images by text, size and colours: zooming back and forth reuses them.
    /// 字图缓存：按像素字节计成本、上限约 48MB（以前只按 500 张计，四百多城在几档字号间来回缩放就不停被挤掉重画）。
    private static let images: NSCache<NSString, UIImage> = { let c = NSCache<NSString, UIImage>(); c.countLimit = 6000; c.totalCostLimit = 48 << 20; return c }()
    private static func store(_ image: UIImage, _ key: NSString) { images.setObject(image, forKey: key, cost: Int(image.size.width * image.size.height * image.scale * image.scale * 4)) }
    /// CI：清空字图缓存（缩放对照前各自从空缓存开始）。
    static func clearImages() { images.removeAllObjects() }

    static func color(_ css: String) -> UIColor {
        let c = RGB(css: css) ?? RGB(0.5, 0.5, 0.5)
        return UIColor(red: CGFloat(c.r), green: CGFloat(c.g), blue: CGFloat(c.b), alpha: 1)
    }

    var showCities = true
    /// Multiplies state-name size. 1 leaves the label boxes as they are.
    var nameScale = 1.0
    var fullNames = true
    private var selected: Int?
    func setSelected(_ province: Int?) { selected = province }

    /// The web's Pixi text: the outline (a round-joined stroke, its width a fraction of the em) is
    /// drawn first and the fill on top, with the browser's synthetic bold (a thin fill-coloured stroke).
    static func render(_ text: String, size: CGFloat, fill: UIColor, stroke: UIColor, strokeEm: CGFloat) -> UIImage {
        let font = font(size), width = size * strokeEm, pad = ceil(width / 2 + 2)
        let measured = (text as NSString).size(withAttributes: [.font: font])
        let canvas = CGSize(width: ceil(measured.width + pad * 2), height: ceil(measured.height + pad * 2))
        return UIGraphicsImageRenderer(size: canvas).image { ctx in
            let c = ctx.cgContext
            c.setLineJoin(.round); c.setLineCap(.round)
            let origin = CGPoint(x: pad, y: pad)
            // NSAttributedString stroke width is a percentage of the point size, centred on the outline.
            (text as NSString).draw(at: origin, withAttributes: [.font: font, .strokeColor: stroke, .strokeWidth: strokeEm * 100])
            (text as NSString).draw(at: origin, withAttributes: [.font: font, .foregroundColor: fill, .strokeColor: fill, .strokeWidth: -3.5])
        }
    }

    /// A name on the screen: its centre, half size and tilt.
    private struct Box {
        let x, y, halfW, halfH, cosine, sine: CGFloat; let nation: Bool; let text: String
        var reach: CGFloat { (halfW * halfW + halfH * halfH).squareRoot() }
    }
    /// Separating-axis test for two tilted names; the same state's name is also kept well apart from itself.
    private static func clash(_ a: Box, _ b: Box, margin: CGFloat) -> Bool {
        let dx = b.x - a.x, dy = b.y - a.y, far = a.reach + b.reach + margin, gap = dx * dx + dy * dy
        if a.nation && b.nation && a.text == b.text {
            let apart = (a.halfW + b.halfW) * 1.6
            if gap < apart * apart { return true }
        }
        if gap > far * far { return false }
        for (ux, uy) in [(a.cosine, a.sine), (-a.sine, a.cosine), (b.cosine, b.sine), (-b.sine, b.cosine)] {
            func radius(_ q: Box) -> CGFloat { q.halfW * abs(q.cosine * ux + q.sine * uy) + q.halfH * abs(-q.sine * ux + q.cosine * uy) }
            if abs(dx * ux + dy * uy) > radius(a) + radius(b) + margin { return false }
        }
        return true
    }

    /// CI 对照：true 时走旧路径（缩放跨档时在主线程同步重绘全部字图、避让两两相比、每个重现的名字各起一段淡入），
    /// 巡览用它在同一世界测出缩放卡顿的改前改后。
    static var legacy = false
    private static let renderQueue = DispatchQueue(label: "lieguoji.map-labels", qos: .userInitiated)
    private var rendering = Set<NSString>()
    private var lastCamera: MapCamera?
    private var lastViewport: CGSize = .zero
    private var lastMapRect: CGRect = .zero
    private var refreshQueued = false
    /// 字图换档：缓存里有就直接换；首帧最多同步绘制有限配额的主要国名，其余全部转后台串行光栅化后一次性补排，
    /// 彻底消除进入主页、点击读档或切图瞬间主线程同步绘制上百张毛笔描边字图引起的明显卡顿。
    private func resize(_ l: Label, to size: Double, syncBudget: inout Int) {
        let key = "\(l.text)|\(size)|\(l.fill.hashValue)|\(l.stroke.hashValue)" as NSString
        func apply(_ image: UIImage) { l.rendered = size; l.view.transform = .identity; l.view.image = image; l.view.bounds = CGRect(origin: .zero, size: image.size) }
        if let cached = Self.images.object(forKey: key) { apply(cached); return }
        if Self.legacy || ((l.rendered == 0 || l.view.image == nil) && syncBudget > 0) {
            syncBudget -= 1
            let image = Self.render(l.text, size: CGFloat(size), fill: l.fill, stroke: l.stroke, strokeEm: CGFloat(l.strokeWidth))
            Self.store(image, key); apply(image); return
        }
        guard !rendering.contains(key) else { return }
        rendering.insert(key)
        let text = l.text, fill = l.fill, stroke = l.stroke, em = CGFloat(l.strokeWidth)
        Self.renderQueue.async { [weak self] in
            let image = Self.render(text, size: CGFloat(size), fill: fill, stroke: stroke, strokeEm: em)
            DispatchQueue.main.async {
                Self.store(image, key)
                guard let self else { return }
                self.rendering.remove(key)
                self.refreshSoon()
            }
        }
    }
    /// 后台字图画好后补排一次（同一轮里画好的合并成一次）。
    private func refreshSoon() {
        guard !refreshQueued else { return }
        refreshQueued = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.refreshQueued = false
            if let c = self.lastCamera { self.update(camera: c, viewport: self.lastViewport, mapRect: self.lastMapRect.isEmpty ? nil : self.lastMapRect) }
        }
    }

    /// 轻量纯平移快路径：主页背景 60fps 缓游期间直接平移可见标签与舆图罗盘／地标坐标，零网格分配、零碰撞重算。
    func panVisible(dx: CGFloat, dy: CGFloat) {
        UIView.performWithoutAnimation {
            for s in stamps where !s.view.isHidden { s.view.center.x += dx; s.view.center.y += dy }
            for p in pictures where !p.view.isHidden { p.view.center.x += dx; p.view.center.y += dy }
            for l in custom where !l.view.isHidden { l.view.center.x += dx; l.view.center.y += dy }
            for l in nations where !l.view.isHidden { l.view.center.x += dx; l.view.center.y += dy }
            for l in cities where !l.view.isHidden { l.view.center.x += dx; l.view.center.y += dy }
        }
    }

    func update(camera: MapCamera, viewport: CGSize, mapRect: CGRect? = nil) {
        lastCamera = camera; lastViewport = viewport
        let innerMap = (mapRect != nil && !mapRect!.isEmpty) ? mapRect! : CGRect(origin: .zero, size: viewport)
        lastMapRect = innerMap
        let safeFallbackRect = innerMap.width > 12 && innerMap.height > 12 ? innerMap.insetBy(dx: 4, dy: 4) : innerMap
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        // 避让: the biggest names first; a name that would land on one already placed waits until the
        // player zooms in. One already showing gets a little slack, so names do not flicker at the limit.
        // 已占的框按屏幕网格分桶，只和附近的框比（以前每个名字与全部已排名字两两相比，几百个城名时每帧上万次）。
        var taken = [Box](); taken.reserveCapacity(nations.count + 64)
        var grid = [Int: [Int]]()
        let cell: CGFloat = 96
        func cells(_ b: Box, _ pad: CGFloat) -> [Int] {
            let r = b.reach * 1.6 + pad
            let x0 = Int((b.x - r) / cell), x1 = Int((b.x + r) / cell), y0 = Int((b.y - r) / cell), y1 = Int((b.y + r) / cell)
            var out = [Int](); out.reserveCapacity((x1 - x0 + 1) * (y1 - y0 + 1))
            for x in x0...max(x0, x1) { for y in y0...max(y0, y1) { out.append(x &* 73_856_093 ^ y &* 19_349_663) } }
            return out
        }
        func blocked(_ b: Box, margin: CGFloat) -> Bool {
            if Self.legacy { return taken.contains { Self.clash($0, b, margin: margin) } }
            for c in cells(b, margin) { for i in grid[c] ?? [] where Self.clash(taken[i], b, margin: margin) { return true } }
            return false
        }
        func place(_ b: Box) {
            taken.append(b)
            if !Self.legacy { for c in cells(b, 0) { grid[c, default: []].append(taken.count - 1) } }
        }
        var appeared = 0
        for s in stamps {
            if s.minScale > 0 && (!showCities || camera.scale < s.minScale) {
                if !s.view.isHidden { s.view.isHidden = true }
                continue
            }
            let at = camera.toScreen(x: s.x, y: s.y, viewport: vp)
            let targetW = min(s.screenMax, max(s.screenMin, CGFloat(s.worldWidth * camera.scale)))
            guard targetW > 4, at.x > -Double(targetW), at.y > -Double(targetW), at.x < vp.width + Double(targetW), at.y < vp.height + Double(targetW) else {
                if !s.view.isHidden { s.view.isHidden = true }
                continue
            }
            let fade: CGFloat = s.minScale > 0 ? min(1, max(0, CGFloat((camera.scale - s.minScale) / 0.35))) : 1
            let baseW = max(1, s.view.bounds.width)
            let k = targetW / baseW
            UIView.performWithoutAnimation {
                s.view.transform = CGAffineTransform(scaleX: k, y: k)
                s.view.center = CGPoint(x: at.x, y: at.y)
                s.view.alpha = s.maxAlpha * fade
                s.view.isHidden = false
            }
        }
        for p in pictures {
            let at = camera.toScreen(x: p.x, y: p.y, viewport: vp), w = p.width * camera.scale, size = p.view.bounds.width
            guard size > 0, w > 2, at.x > -w, at.y > -w, at.x < vp.width + w, at.y < vp.height + w else { p.view.isHidden = true; continue }
            UIView.performWithoutAnimation {
                p.view.transform = CGAffineTransform(rotationAngle: CGFloat(p.angle)).scaledBy(x: CGFloat(w / Double(size)), y: CGFloat(w / Double(size)))
                p.view.center = CGPoint(x: at.x, y: at.y); p.view.isHidden = false
            }
        }
        if !showCities { for l in cities { l.view.isHidden = true } }
        // The capitals' rings are kept clear first (with a little margin), and the capitals' names are
        // placed before the state names: a state's name gives way instead of covering its capital.
        let ring = Double(MapLayers.cityUnit) * 1.5 * MapLayers.capitalOuter * camera.scale
        if showCities {
            for c in capitals {
                let p = camera.toScreen(x: c.x, y: c.y, viewport: vp)
                guard p.x > -40, p.y > -40, p.x < vp.width + 40, p.y < vp.height + 40 else { continue }
                let half = CGFloat(max(ring, 3) + 3)
                place(Box(x: CGFloat(p.x), y: CGFloat(p.y), halfW: half, halfH: half, cosine: 1, sine: 0, nation: false, text: ""))
            }
        }
        let capitalNames = showCities ? capitalCityLabels : []
        let otherCities = showCities ? otherCityLabels : []
        // Enlarged capital names (the map seen from afar) give way to the state names; at their own size
        // (close up) they come first, as before.
        let enlarged = capitalNames.first.map { $0.mapEm * camera.scale < $0.floorPoints } ?? false
        // 国名先排、都城名其次：首都圈已最先占位，国名不会盖住首都标记；都城名若与国名相撞，先换到圈下方再试。
        // （都城名排在国名前时，近看能显示的都城名会把附近的大国名挤掉，边界一动国名就时隐时现。）
        _ = enlarged
        let order = custom + nations + capitalNames + otherCities
        var placedNationTexts = Set<String>()
        var syncBudget = 6
        func blockedByTextOnly(_ b: Box, margin: CGFloat) -> Bool {
            if Self.legacy { return taken.contains { !$0.text.isEmpty && Self.clash($0, b, margin: margin) } }
            for c in cells(b, margin) { for i in grid[c] ?? [] where !taken[i].text.isEmpty && Self.clash(taken[i], b, margin: margin) { return true } }
            return false
        }
        for l in order {
            var points = l.mapEm * camera.scale * (l.province == nil ? nameScale : 1)
            var p = camera.toScreen(x: l.x, y: l.y, viewport: vp)
            if points < l.floorPoints, points >= 4.5, l.anchorY != nil { points = l.floorPoints }
            if let anchor = l.anchorY, points >= 4.5 {
                let at = camera.toScreen(x: l.x, y: anchor, viewport: vp)
                // Clear of its own rings as the layout sees them (their box, the slack a hidden name is asked
                // for, and half the name's height): 1.14 put the name a point too low and it hid itself.
                // 近看时（字号不必放大）名字原位也可能压在自身首都圈的占位框上而被隐藏：同样抬到圈外。
                let lift = max(ring, 3) + 3 + 7 + points * 0.78
                let aboveY = min(p.y, at.y - lift)
                p = (x: at.x, y: aboveY < Double(innerMap.minY) + points * 0.55 ? at.y + lift : aboveY)
            }
            // A name larger than the screen can show is hidden (a continent-wide group zoomed in close).
            // 滞回：已显示的名字在下限的 88% 以下才隐藏，免得缩放停在临界处时名字反复出没。
            let minimum = l.view.isHidden ? l.minPoints : l.minPoints * 0.88
            guard points.isFinite, p.x.isFinite, p.y.isFinite, points >= minimum, points < 900, p.x > -300, p.y > -120, p.x < vp.width + 300, p.y < vp.height + 120 else { l.view.isHidden = true; continue }
            // Rendered at most 96 pt and scaled beyond: a label image never grows to thousands of pixels
            // (that ran memory out and closed the app when a big group label was zoomed in).
            let wanted = min(96, points)
            if l.rendered == 0 || wanted / l.rendered > 1.25 || wanted / l.rendered < 0.8 {
                // Sizes on a ×1.25 ladder, so the cached images are reused while zooming.
                resize(l, to: min(96, pow(1.25, (log(wanted) / log(1.25)).rounded())), syncBudget: &syncBudget)
            }
            guard l.rendered > 0 else { l.view.isHidden = true; continue }
            var k = CGFloat(points / l.rendered)
            let image = l.view.image?.size ?? .zero
            var box = Box(x: CGFloat(p.x), y: CGFloat(p.y), halfW: image.width * k / 2, halfH: image.height * k / 2, cosine: CGFloat(cos(l.angle)), sine: CGFloat(sin(l.angle)), nation: l.province == nil, text: l.text)
            let margin: CGFloat = l.view.isHidden ? 6 : 0
            if blocked(box, margin: margin) {
                if let anchor = l.anchorY {
                    // 都城名：上方被占时改写在首都圈下方。
                    let at = camera.toScreen(x: l.x, y: anchor, viewport: vp)
                    let below = at.y + (max(ring, 3) + 3 + 7 + points * 0.78)
                    box = Box(x: CGFloat(p.x), y: CGFloat(below), halfW: box.halfW, halfH: box.halfH, cosine: box.cosine, sine: box.sine, nation: box.nation, text: box.text)
                    if blocked(box, margin: margin) { l.view.isHidden = true; continue }
                    p = (x: p.x, y: below)
                } else if l.province == nil {
                    // 国名避让补救：只蹭到首都圈或邻国字边时先微移避让，仍被挡且该国主名尚未出现则略缩再试，避免国名无故消失。
                    let stepY = max(12.0, Double(box.halfH) + max(ring, 4) + 5)
                    let stepX = max(14.0, Double(box.halfW) * 0.45)
                    let shifts: [(Double, Double)] = [(0, -stepY), (0, stepY), (-stepX, 0), (stepX, 0), (0, -stepY * 1.6), (0, stepY * 1.6)]
                    var placedFallback = false
                    for (dx, dy) in shifts {
                        let nx = p.x + dx, ny = p.y + dy
                        guard safeFallbackRect.contains(CGPoint(x: nx, y: ny)) else { continue }
                        let cand = Box(x: CGFloat(nx), y: CGFloat(ny), halfW: box.halfW, halfH: box.halfH, cosine: box.cosine, sine: box.sine, nation: true, text: l.text)
                        if !blocked(cand, margin: 1) {
                            box = cand; p = (x: nx, y: ny); placedFallback = true; break
                        }
                    }
                    if !placedFallback && !placedNationTexts.contains(l.text) {
                        let shrunkK = k * 0.82
                        let sw = image.width * shrunkK / 2, sh = image.height * shrunkK / 2
                        let rescues: [(Double, Double)] = [(0, 0), (0, -stepY), (0, stepY)]
                        for (dx, dy) in rescues {
                            let nx = p.x + dx, ny = p.y + dy
                            guard safeFallbackRect.contains(CGPoint(x: nx, y: ny)) else { continue }
                            let cand = Box(x: CGFloat(nx), y: CGFloat(ny), halfW: sw, halfH: sh, cosine: box.cosine, sine: box.sine, nation: true, text: l.text)
                            if !blockedByTextOnly(cand, margin: 0) {
                                k = shrunkK; box = cand; p = (x: nx, y: ny); placedFallback = true; break
                            }
                        }
                    }
                    if !placedFallback { l.view.isHidden = true; continue }
                } else {
                    l.view.isHidden = true; continue
                }
            }
            if l.province == nil { placedNationTexts.insert(l.text) }
            place(box)
            // 始终在无动画事务内写回 transform 与 center，彻底防止 SwiftUI 外层 withAnimation 劫持标签位移导致与底图脱节。
            UIView.performWithoutAnimation {
                l.view.transform = CGAffineTransform(rotationAngle: CGFloat(l.angle)).scaledBy(x: k, y: k)
                l.view.center = CGPoint(x: p.x, y: p.y)
            }
            if l.view.isHidden {
                // A name that gave way comes back softly. 缩放时一帧里冒出很多名字：只给前十二个起淡入动画，其余直接显示。
                l.view.isHidden = false
                if l.province == nil { Self.namesFadedIn += 1 }
                appeared += 1
                if appeared <= 12 || Self.legacy {
                    l.view.alpha = 0
                    UIView.animate(withDuration: 0.22, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) { l.view.alpha = 1 }
                } else { l.view.alpha = 1 }
            } else if l.view.alpha < 0.99 && (l.view.layer.animationKeys()?.isEmpty ?? true) {
                l.view.alpha = 1
            }
        }
    }
}

/// Troop/hull strength bars and zoomed-in counts under army & fleet icons; they follow the icons while they glide.
final class TroopLabelsView: UIView {
    var texts: [String: String] = [:]
    var ratios: [String: Float] = [:]
    var colors: [String: RGB] = [:]
    private var layers = [String: CATextLayer]()
    private var bars = [String: (track: CALayer, fill: CALayer)]()
    private static let font = UIFont(name: "TW-Kai-98_1", size: 10.5) ?? .systemFont(ofSize: 10.5, weight: .semibold)
    override init(frame: CGRect) { super.init(frame: frame); isUserInteractionEnabled = false }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    /// The army icons' size setting (推演与画面).
    var iconScale = 1.0
    var isEmpty: Bool { layers.isEmpty && bars.isEmpty }
    /// Whether icons are large enough at this zoom to carry a strength bar or troop mark.
    func shows(_ camera: MapCamera) -> Bool { MapRenderer.iconPoints(camera.scale, iconScale: iconScale) >= 12 }
    func update(_ placed: [(sprite: MapRenderer.ArmySprite, x: Float, y: Float)], camera: MapCamera, viewport: CGSize, spread: [String: SIMD2<Float>] = [:]) {
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        // Icon size on screen (the renderer's icon size in map units × scale).
        let icon = MapRenderer.iconPoints(camera.scale, iconScale: iconScale)
        var seenText = Set<String>(), seenBar = Set<String>()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        if icon >= 12 {
            let barW = min(26.0, max(16.0, icon * 1.05))
            let barH: Double = 3.0
            for p in placed where p.sprite.army > -100_000 {
                let key = p.sprite.key
                guard let ratio = ratios[key], ratio > 0 else { continue }
                let s = camera.toScreen(x: Double(p.x), y: Double(p.y), viewport: vp)
                guard s.x > -40, s.y > -40, s.x < vp.width + 40, s.y < vp.height + 40 else { continue }
                let o = spread[key] ?? SIMD2<Float>(0, 0)
                let bx = s.x + Double(o.x) * icon
                let by = s.y + (Double(o.y) + 0.62) * icon
                let pair = bars[key] ?? makeBar(key)
                let clamped = Double(min(1, max(0.04, ratio)))
                let h = p.sprite.fighting ? 3.8 : barH
                pair.track.bounds = CGRect(x: 0, y: 0, width: barW, height: h)
                pair.track.position = CGPoint(x: bx, y: by)
                pair.fill.frame = CGRect(x: 0, y: 0, width: barW * clamped, height: h)
                if clamped < 0.25 {
                    pair.fill.backgroundColor = UIColor(red: 0.78, green: 0.18, blue: 0.14, alpha: 1).cgColor
                } else if clamped < 0.48 {
                    pair.fill.backgroundColor = UIColor(red: 0.85, green: 0.56, blue: 0.14, alpha: 1).cgColor
                } else if let c = colors[key] {
                    pair.fill.backgroundColor = UIColor(red: CGFloat(c.r), green: CGFloat(c.g), blue: CGFloat(c.b), alpha: 1).cgColor
                } else {
                    pair.fill.backgroundColor = UIColor(red: 0.22, green: 0.58, blue: 0.36, alpha: 1).cgColor
                }
                seenBar.insert(key)

                // 高倍观战交锋时去文字化：交战部队仅保留清晰血条，避免密密麻麻数字遮挡兵种序列帧演出
                if icon >= 19, !p.sprite.fighting, let text = texts[key] {
                    let l = layers[key] ?? make(key)
                    if (l.string as? String) != text {
                        l.string = text
                        let w = ceil((text as NSString).size(withAttributes: [.font: Self.font]).width) + 6
                        l.bounds = CGRect(x: 0, y: 0, width: w, height: 14)
                    }
                    l.position = CGPoint(x: bx, y: by + 9.5)
                    seenText.insert(key)
                }
            }
        }
        for (k, pair) in bars where !seenBar.contains(k) { pair.track.removeFromSuperlayer(); bars[k] = nil }
        for (k, l) in layers where !seenText.contains(k) { l.removeFromSuperlayer(); layers[k] = nil }
        CATransaction.commit()
    }
    private func makeBar(_ key: String) -> (track: CALayer, fill: CALayer) {
        let track = CALayer()
        track.backgroundColor = UIColor(red: 0.12, green: 0.09, blue: 0.07, alpha: 0.72).cgColor
        track.cornerRadius = 1.5; track.masksToBounds = true
        track.borderWidth = 0.55; track.borderColor = UIColor(red: 0.98, green: 0.95, blue: 0.88, alpha: 0.92).cgColor
        let fill = CALayer()
        track.addSublayer(fill)
        layer.addSublayer(track)
        let pair = (track, fill)
        bars[key] = pair
        return pair
    }
    private func make(_ key: String) -> CATextLayer {
        let l = CATextLayer()
        l.font = Self.font; l.fontSize = 10.5; l.alignmentMode = .center; l.contentsScale = UIScreen.main.scale
        // A paper-white character with an ink shadow, written under the strength bar.
        l.foregroundColor = UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 1).cgColor
        l.shadowColor = UIColor(white: 0.05, alpha: 1).cgColor; l.shadowOpacity = 0.9; l.shadowRadius = 1.2; l.shadowOffset = .zero
        // Rasterized once: these labels move with their armies every frame, and a live text shadow
        // was re-rendered offscreen each time (a cause of dropped frames while playing).
        l.shouldRasterize = true; l.rasterizationScale = UIScreen.main.scale
        layer.addSublayer(l); layers[key] = l
        return l
    }
}
