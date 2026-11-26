import SwiftUI
import UIKit
import MetalKit
import LieguojiCore

/// State shared between SwiftUI panels and the Metal map.
@MainActor final class MapController: ObservableObject {
    /// 4.2.9 严格世界代次隔离锁：
    /// 切换世界时 `prepareForWorldSwitch(to:)` 会先推进 `activeWorldID` 并静默旧 `MapView #1`，
    /// 彻底杜绝 `flushSync()` / `scheduleSync()` 在新 `MapView #2` 挂载前把新世界数据错投进旧渲染器引发的
    /// `terrain[v * 4 + j]` 越界 (`SIGTRAP`) 或 Metal GPU 越界读闪退。
    var activeWorldID = UUID()
    private weak var syncOwner: AnyObject?
    private var syncWorldID: UUID?
    private var onNeedsSync: (() -> Void)?
    private var onReleaseMap: (() -> Void)?
    private var syncScheduled = false

    func prepareForWorldSwitch(to nextWorldID: UUID) {
        activeWorldID = nextWorldID
        syncScheduled = false
        onReleaseMap?()
    }
    func registerSync(owner: AnyObject, worldID: UUID, onRelease: (() -> Void)? = nil, handler: @escaping () -> Void) {
        guard worldID == activeWorldID || syncOwner == nil else { return }
        syncOwner = owner
        syncWorldID = worldID
        onNeedsSync = handler
        if let onRelease { onReleaseMap = onRelease }
    }
    func unregisterSync(owner: AnyObject) {
        if syncOwner === owner {
            syncOwner = nil
            syncWorldID = nil
            onNeedsSync = nil
            onReleaseMap = nil
            onRevealClock = nil
            onSkipReveal = nil
            onHits = nil
            onSheet = nil
            onFramingRequest = nil
            cameraScale = nil
            nameFrame = nil
            renderer = nil
            placed = nil
        }
    }
    func isSyncOwner(_ owner: AnyObject, worldID: UUID) -> Bool { syncOwner === owner && syncWorldID == worldID }
    func scheduleSync() {
        guard syncWorldID == activeWorldID, onNeedsSync != nil else { return }
        guard !syncScheduled else { return }
        syncScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.syncScheduled = false
            guard self.syncWorldID == self.activeWorldID else { return }
            self.onNeedsSync?()
        }
    }
    func flushSync() {
        syncScheduled = false
        guard syncWorldID == activeWorldID else { return }
        onNeedsSync?()
    }

    @Published var mode: MapMode = .political
    /// The selected state's relations on the map (StateRelationsHighlighter): nation → 0xRRGGBB.
    var relations: [Int: UInt32] = [:] { didSet { scheduleSync() } }
    /// A colour view's province fills (nil: the state view).
    var viewFills: [RGB]? { didSet { scheduleSync() } }
    /// The state whose relation colours are shown (its sheet page set them).
    var relationsNation: Int? { didSet { scheduleSync() } }
    /// A colour view's group names, shown instead of the state names (nil: state names).
    var viewLabels: [GroupLabel]? { didSet { scheduleSync() } }
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
    var focus: (province: Int, id: UUID)? { didSet { scheduleSync() } }
    var resetRequest = UUID() { didSet { onFramingRequest?() } }
    /// 地图展开: the camera draws back until the whole map is on screen.
    var unrollRequest = UUID() { didSet { onFramingRequest?() } }
    var onFramingRequest: (() -> Void)?
    /// The camera's scale now and the scale at which the whole map fits (CI checks the map can be unrolled).
    var cameraScale: (() -> (scale: Double, fit: Double))?
    /// CI 测量：当前的地图渲染器。
    var renderer: (() -> MapRenderer?)?
    /// Zoom by a factor around the screen centre (the + / − buttons).
    var zoomRequest: (factor: Double, id: UUID)? { didSet { scheduleSync() } }
    /// Army icons and the selected army's remaining route, from the simulation (nil keeps the opening icons).
    var armies: [MapRenderer.ArmySprite]? { didSet { armiesRevision &+= 1; troopsRevision &+= 1; scheduleSync() } }
    var route: [SIMD2<Float>] = [] { didSet { armiesRevision &+= 1; scheduleSync() } }
    private(set) var armiesRevision = 0
    /// Bumped whenever armies, troop counts/ratios/colors, or seaPorts change so pan frames never copy large troop dictionaries.
    var troopsRevision: UInt64 = 0
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
    var effects = MapEffects() { didSet { scheduleSync() } }
    /// The live world (ownership and nation labels follow the engine); nil keeps the opening map.
    var world: WorldMap? { didSet { worldRevision &+= 1; scheduleSync() } }
    /// Bumped on every world change: the map compares this instead of every province.
    private(set) var worldRevision = 0
    /// How long army icons glide to their next positions (the play step interval).
    var tween: Double = 0.3
    /// Troop / ship counts by army or fleet id, shown under the icons when zoomed in.
    var troopTexts: [String: String] = [:] { didSet { troopsRevision &+= 1 } }
    /// Per-army strength ratio (troops / full) or fleet hull (0…1), rendered as a crisp bar directly under each icon.
    var troopRatios: [String: Float] = [:] { didSet { troopsRevision &+= 1 } }
    var troopBarColors: [String: RGB] = [:] { didSet { troopsRevision &+= 1 } }
    /// 战争晕染（墨场）：本步的行军、守军、围城与最近的攻占（GameModel.refreshWashes），与世界代次（读档、换世界时变）。
    var washes = WashFrame.empty { didSet { scheduleSync() } }
    /// 本步阵亡军队（军队标识 → 阵亡时刻，秒，自本步动画开始）：图标停到那一刻，阵亡动画同时开始。
    var deathDelays: [String: Double] = [:]
    var washEpoch = 0 { didSet { scheduleSync() } }
    /// CI 巡览演示占领晕染时为真：推演不覆盖演示输入。
    var washDemo = false
    /// 当前着色视图的标识（同一视图里填色随推演刷新时渐变，换视图时瞬切）。
    var viewKey = ""
    /// 四时节气光影相位（0..1，由模拟日期驱动）。
    var seasonPhase: Float = -1 { didSet { scheduleSync() } }
    /// 实时活跃天时与灾异州郡（暴雪/大旱/洪涝/瘟疫/丰年），同步驱动 GPU 地表着色与全屏/局部天气粒子层。
    var weatherZones: [WeatherOverlayView.Zone] = []
    var weatherGPUZones: [(x: Float, y: Float, radius: Float, kind: Float)] = []
    var weatherRevision: Int = 0 { didSet { scheduleSync() } }
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
    var seaPorts: [SIMD2<Float>] = [] { didSet { troopsRevision &+= 1; scheduleSync() } }
    /// 要塞 marks: the cities of fortified provinces, in map units.
    var forts: [SIMD2<Float>] = [] { didSet { scheduleSync() } }
    /// 圣地 marks: the cities of holy provinces, in map units.
    var holy: [SIMD2<Float>] = [] { didSet { scheduleSync() } }
    /// 已建成天下奇观坐标（在地图上绘出重檐金顶古阁）。
    var wonders: [SIMD2<Float>] = [] { didSet { scheduleSync() } }
    /// 已发掘四海古迹坐标（在地图上绘出古铜青玉星碑）。
    var ruins: [SIMD2<Float>] = [] { didSet { scheduleSync() } }
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
    var editorRevision = 0 { didSet { scheduleSync() } }
    /// The brush circle under the finger (map units), drawn while painting.
    var brushRadius: Double = 30
    var onPaint: ((Int) -> Void)?
    /// 世界编辑的笔刷: its name on the banner and what it does to a province.
    @Published var brushName: String?
    var brushAction: ((Int) -> Void)?
    /// 地图标注.
    var customLabels: [GameModel.MapLabel] = [] { didSet { scheduleSync() } }
    var customImages: [GameModel.MapImage] = [] { didSet { scheduleSync() } }
    var customRivers: [[Float]] = [] { didSet { scheduleSync() } }
    /// 长按地图: the province and the finger's place in the view.
    var onLongPress: ((Int, CGPoint) -> Void)?
    /// 地图点选: a page asked for a province (a new capital…): the prompt on the banner and what the tap does.
    @Published var pickPrompt: String?
    var onPick: ((Int) -> Void)?
    /// A sheet covers the map: immediately pauses decorative effects and freezes Metal when covering ≥62% of the map.
    var sheetOpen = false { didSet { onSheet?() } }
    /// 当前竖屏底部抽屉占据屏幕高度的比例（如高档 0.89、半屏 0.50、低档 0.38、收起 0），用于镜头聚焦自动上移至可视安全区正中央及后台零帧率冻结。
    var sheetBottomFraction: Double = 0 {
        didSet {
            if abs(sheetBottomFraction - oldValue) > 1e-4 { onSheet?() }
        }
    }
    /// 当前横屏右侧边栏占据屏幕宽度的比例（如 0.44），用于横屏镜头聚焦自动左移至可视安全区正中央。
    var sheetTrailingFraction: Double = 0
    /// 二级菜单/高抽屉覆盖主画面（底部弹窗 ≥62% 或全屏模态）时彻底冻结后台 Metal 与粒子渲染，省电防发烫并把 100% 帧率留给列表滚动。
    public var sheetCoversMap: Bool { sheetOpen && sheetBottomFraction >= 0.62 }
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
    var onSkipReveal: (() -> Void)?
    /// Battle losses to float over the map (map point, text, at sea).
    var onHits: (([(x: Float, y: Float, text: String, naval: Bool)]) -> Void)?
    func animateReveal(from: Float = 0, to: Float = 1, duration: Double, push: Bool = false) {
        revealClockSerial &+= 1
        revealClock = (from, to, CACurrentMediaTime(), max(0.05, duration), push)
        onRevealClock?()
    }
    func skipReveal() {
        revealClock = nil
        reveal = 1
        onSkipReveal?()
    }
    /// The clock's value now (nil when none runs); it clears itself at the end.
    var revealNow: Float? {
        guard let c = revealClock else { return nil }
        let x = max(0, min(1, (CACurrentMediaTime() - c.start) / max(0.05, c.duration)))
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
    /// 聚焦整个国家核心疆域与国名中心（避免国家大字被底部抽屉顶边截断）。
    var focusNation: (nation: Int, id: UUID)? { didSet { scheduleSync() } }
    func fly(toNation nation: Int) { focusNation = (nation, UUID()) }
    /// 点选州郡弹出底部半屏抽屉时，若目标恰好落在抽屉遮挡区内则平滑轻移至上方可视安全区正中（不突兀改缩放）。
    var panAboveSheet: (province: Int, id: UUID)? { didSet { scheduleSync() } }
    func panAboveSheetIfNeeded(province: Int) { panAboveSheet = (province, UUID()) }
    /// Flies to a map point and zooms in (an army or fleet), the point above the sheet.
    var focusPoint: (x: Double, y: Double, id: UUID)? { didSet { scheduleSync() } }
    func fly(x: Double, y: Double) { focusPoint = (x, y, UUID()) }
    func zoom(_ factor: Double) { zoomRequest = (factor, UUID()) }
    /// 查看都城: the camera glides to the place, zooms in and a vermilion seal ring closes on it.
    var spotlight: (x: Double, y: Double, id: UUID)? { didSet { scheduleSync() } }
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
    var showTroopBars = true
    var warArrows = true
    var iconScale = 1.0
    /// Frames a second while the map is dragged or zoomed, while armies march, and for
    /// looping effects (smooth 60fps when cool; automatically steps down to 30/20/15fps if device warms up).
    var mapFPS = 60
    var marchFPS = 60
    var effectFPS = 60
    /// Pixels per point the map is drawn at (capped at the screen's own; the names stay sharp).
    var renderScale = 2.0
    /// The share of real time the simulation may keep a core busy, in percent.
    var simLoad = 60
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
    private enum Keys: String, CodingKey { case showArmies, showTroopBars, warArrows, iconScale, highFrameRate, mapFPS, marchFPS, effectFPS, renderScale, simLoad, autoCool, introCamera, easeReveal, autosave, pauseOnNews, showTacticalPill, showScrollPlacard, showReplayPlacard, directorCruise, showHeralds, showBattleFloats, seaWaves, pauseOnSheet }
    // Every field is optional in a stored setting: older versions saved fewer (and a 高帧率 switch).
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        showArmies = try c.decodeIfPresent(Bool.self, forKey: .showArmies) ?? true
        showTroopBars = try c.decodeIfPresent(Bool.self, forKey: .showTroopBars) ?? true
        warArrows = try c.decodeIfPresent(Bool.self, forKey: .warArrows) ?? true
        iconScale = try c.decodeIfPresent(Double.self, forKey: .iconScale) ?? 1
        mapFPS = try c.decodeIfPresent(Int.self, forKey: .mapFPS) ?? ((try c.decodeIfPresent(Bool.self, forKey: .highFrameRate)) == true ? 120 : 60)
        marchFPS = try c.decodeIfPresent(Int.self, forKey: .marchFPS) ?? 60
        effectFPS = try c.decodeIfPresent(Int.self, forKey: .effectFPS) ?? 60
        renderScale = try c.decodeIfPresent(Double.self, forKey: .renderScale) ?? 2
        simLoad = try c.decodeIfPresent(Int.self, forKey: .simLoad) ?? 60
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
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(showArmies, forKey: .showArmies); try c.encode(showTroopBars, forKey: .showTroopBars); try c.encode(warArrows, forKey: .warArrows); try c.encode(iconScale, forKey: .iconScale)
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
    /// 画面档位: 极省电, 省电, 均衡, 流畅 (nil: the values were set one by one).
    static let presets: [(key: String, name: String, mapFPS: Int, marchFPS: Int, effectFPS: Int, renderScale: Double, simLoad: Int)] = [
        ("cool", "极省电", 30, 20, 15, 1.5, 45),
        ("saver", "省电", 60, 30, 30, 1.5, 50),
        ("balanced", "均衡", 60, 60, 60, 2, 60),
        ("smooth", "流畅", 120, 60, 60, 2.5, 80),
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

/// Breaks `CADisplayLink` strong-target retain cycles: if `owner` is deallocated without `stop()`,
/// the next VSync tick automatically invalidates the link and releases the proxy.
@MainActor private final class WeakDisplayLinkProxy: NSObject {
    private weak var owner: AnyObject?
    private let action: @MainActor (CADisplayLink) -> Void
    init(owner: AnyObject, action: @escaping @MainActor (CADisplayLink) -> Void) {
        self.owner = owner
        self.action = action
    }
    @objc func tick(_ link: CADisplayLink) {
        guard owner != nil else {
            link.invalidate()
            return
        }
        action(link)
    }
}

struct MapView: UIViewRepresentable {
    let map: WorldMap
    @ObservedObject var controller: MapController
    let worldID: UUID

    func makeCoordinator() -> Coordinator { Coordinator(map: map, controller: controller, worldID: worldID) }
    func makeUIView(context: Context) -> MapContainerView { context.coordinator.build() }
    func updateUIView(_ view: MapContainerView, context: Context) {
        let c = context.coordinator
        guard c.worldID == controller.activeWorldID else { return }
        if !controller.isSyncOwner(c, worldID: c.worldID) {
            c.bindController()
        }
        c.sync()
    }
    static func dismantleUIView(_ view: MapContainerView, coordinator: Coordinator) { coordinator.stop() }

    @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var map: WorldMap
        let controller: MapController
        let worldID: UUID
        private let picker: CellPicker
        private var container: MapContainerView?
        private var mtk: MTKView?
        private var renderer: MapRenderer?
        private let overlayHost = UIView()
        private let overlayCanvas = UIView()
        private let overlayClipMask: CAShapeLayer = {
            let m = CAShapeLayer()
            m.fillColor = UIColor.black.cgColor
            m.actions = ["path": NSNull(), "bounds": NSNull(), "position": NSNull(), "frame": NSNull()]
            return m
        }()
        private var labels: MapLabelsView?
        private let effects = EffectsView()
        private let floats = UIView()
        private let troops = TroopLabelsView()
        private var shownEffects = MapEffects()
        private var shownRevision = -1
        private var shownArmiesRevision = -1
        private var shownEditorRevision = 0
        private var shownViewLabels: [GroupLabel]?
        private var appliedTroopsRevision: UInt64 = .max
        private var lastOverlayFullBounds: CGRect = .null
        private var lastClipMaskRect: CGRect = .null
        private var overlayMaskAttached = false
        private var needsFullLabelUpdate = false
        private var lastAppearanceKey: (mode: MapMode, highlight: Int?, relations: [Int: UInt32], fills: [RGB]?, view: String)?
        private var lastBorderWide: Set<Int> = []
        private var scrollEdgeMargin: Double { (controller.display.scrollMount ?? controller.display.darkEdges) ? 78 : 12 }
        private var panning = false
        private var sheetThrottled = false
        private var mapFrozenForSheet = false
        private var pendingFlushAfterSheet = false
        private var lastHalfSheetDrawTime: CFTimeInterval = 0
        private var sheetSettleWork: DispatchWorkItem?
        private var isDrawingInline = false
        /// VSync 手势合帧缓冲：120Hz 触控事件先累积到 pendingCamera，统一在 CADisplayLink 每帧提交 1 次原子同事务渲染。
        private var pendingCamera: MapCamera?
        private var pendingPurePan = false
        private var gestureCamera: MapCamera { pendingCamera ?? camera }
        private var fingerDragging: Bool { pinching || panning }
        private var isFlinging: Bool { velocity.x.isFinite && velocity.y.isFinite && hypot(velocity.x, velocity.y) > 8 }
        private var interactiveGestureActive: Bool { pinching || panning || pendingCamera != nil || isFlinging }
        private var cameraInteractive: Bool { interactiveGestureActive || animation != nil }
        private var cameraMoving: Bool { pinching || panning || pendingCamera != nil || isFlinging || animation != nil || controller.drifting }
        /// 仅在主动动效/行军/墨晕/拖拽/飞行时驱动显示链路；地图静止时彻底休眠 0% GPU 占用，彻底解决真机持续发烫与卡顿。
        private var ambientActive: Bool { false }
        /// 地图画心 [0, map.width] × [0, map.height] 在屏幕坐标系里的精确裁剪框，确保国名、箭头与特效严守卷轴画框内缘。
        private func mapScreenRect(camera: MapCamera, viewport: CGSize) -> CGRect {
            guard viewport.width.isFinite, viewport.height.isFinite, viewport.width > 0, viewport.height > 0 else { return .zero }
            let vp = (width: Double(viewport.width), height: Double(viewport.height))
            let tl = camera.toScreen(x: 0, y: 0, viewport: vp)
            let br = camera.toScreen(x: Double(map.width), y: Double(map.height), viewport: vp)
            guard tl.x.isFinite, tl.y.isFinite, br.x.isFinite, br.y.isFinite else { return CGRect(origin: .zero, size: viewport) }
            let raw = CGRect(x: tl.x, y: tl.y, width: max(0, br.x - tl.x), height: max(0, br.y - tl.y))
            let clipped = raw.intersection(CGRect(origin: .zero, size: viewport))
            return clipped.isNull ? .zero : clipped
        }
        private func syncWaves() {
            let want = !controller.drifting && !controller.sheetOpen && controller.reveal >= 1 && controller.play.seaWaves && mtk?.window != nil
            if want { effects.startWaves() } else { effects.stopWaves() }
        }
        private let metrics = UILabel()
        private let weather = WeatherOverlayView()
        private var shownWeatherRevision = -1
        private var shownWeatherSeasonBucket = -999
        private func syncWeather(purePan: Bool = false) {
            if purePan && controller.weatherZones.isEmpty && weather.isZonesEmpty { return }
            guard let renderer, let mtk else { return }
            let active = !controller.drifting && !controller.sheetOpen && controller.reveal >= 1
            weather.update(seasonPhase: controller.seasonPhase, zones: controller.weatherZones, camera: renderer.camera, viewport: mtk.bounds.size, active: active, purePan: purePan)
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
        private var focusNationID: UUID?
        private var panAboveSheetID: UUID?
        private var focusPointID: UUID?
        private var resetID: UUID?
        private var zoomID: UUID?
        private var unrollID: UUID?
        private var spotlightID: UUID?
        /// The seal ring over a spotlit place; it follows the map while it shows.
        private var spot: (x: Double, y: Double, layer: CALayer)?
        /// 落指点选水晕同样锚定世界坐标，随地图平移缩放同步跟随。
        private var tapRipples: [(id: UUID, layer: CALayer, x: Double, y: Double)] = []
        private func placeSpot() {
            guard spot != nil || !tapRipples.isEmpty, let renderer else { return }
            let vp = viewport
            guard vp.width > 0, vp.height > 0 else { return }
            CATransaction.begin(); CATransaction.setDisableActions(true)
            if let spot {
                let p = renderer.camera.toScreen(x: spot.x, y: spot.y, viewport: vp)
                if p.x.isFinite && p.y.isFinite { spot.layer.position = CGPoint(x: p.x, y: p.y) }
            }
            for r in tapRipples {
                let p = renderer.camera.toScreen(x: r.x, y: r.y, viewport: vp)
                if p.x.isFinite && p.y.isFinite { r.layer.position = CGPoint(x: p.x, y: p.y) }
            }
            CATransaction.commit()
        }
        /// 朱印高亮: two vermilion rings close in on the place like a seal pressed on paper, a soft wash
        /// of cinnabar under them, and they pulse three times before fading.
        private func showSpot(x: Double, y: Double) {
            guard x.isFinite && y.isFinite else { return }
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
            (labels?.layer ?? floats.layer).addSublayer(root)
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

        init(map: WorldMap, controller: MapController, worldID: UUID) {
            self.map = map; self.controller = controller; self.worldID = worldID; picker = CellPicker(map: map)
            super.init()
            resetID = controller.resetRequest
            unrollID = controller.unrollRequest
        }

        var mapSize: (width: Double, height: Double) { (Double(map.width), Double(map.height)) }
        var viewport: (width: Double, height: Double) {
            guard let mtk else { return (0, 0) }
            return (Double(mtk.bounds.width), Double(mtk.bounds.height))
        }
        /// From the whole map on screen (地图展开: the chart lies unrolled on its paper) to the closest zoom.
        /// The game opens covering the screen (MapCamera.cover); 1.12 made that the furthest zoom too, and
        /// the map could no longer be unrolled.
        var bounds: ClosedRange<Double> { MapCamera.scaleBounds(map: mapSize, viewport: viewport) }

        func build() -> MapContainerView {
            let containerView = MapContainerView()
            containerView.clipsToBounds = true
            self.container = containerView
            let mtkView = MTKView(frame: .zero, device: MTLCreateSystemDefaultDevice())
            mtkView.clipsToBounds = true
            // Beyond the map: warm antique parchment desk tone (0 GPU cost hardware clear).
            mtkView.clearColor = MTLClearColor(red: 0.875, green: 0.824, blue: 0.735, alpha: 1)
            mtkView.isPaused = true
            mtkView.enableSetNeedsDisplay = true
            // 静止与推演走异步上屏；拖拽/双指缩放/惯性滑行/飞行期间由 syncPresentCameraFrame 切为同事务同步提交，零文字晃动。
            mtkView.presentsWithTransaction = false
            mtkView.preferredFramesPerSecond = Energy.mapFPS(preferred: controller.play.mapFPS, interactive: false)
            mtkView.autoResizeDrawable = true
            mtkView.depthStencilPixelFormat = .invalid
            mtkView.framebufferOnly = true
            // 地图清晰度 (default 2×): on a 3× screen the map (drawn with 4× multisampling) cost more than twice
            // the GPU work for no visible gain; the names and labels above it stay at full resolution.
            mtkView.contentScaleFactor = min(UIScreen.main.scale, controller.play.renderScale)
            self.mtk = mtkView
            renderer = MapRenderer(view: mtkView, map: map, parchmentURL: Bundle.main.url(forResource: "parchment", withExtension: "jpg", subdirectory: "World"),
                                   unitURL: { Bundle.main.url(forResource: "unit-\($0)", withExtension: "png", subdirectory: "World") })
            let initialReveal = controller.revealNow ?? controller.reveal
            renderer?.setReveal(initialReveal)
            mtkView.delegate = renderer
            renderer?.onDraw = { [weak self] t in self?.frameDrawn(t) }
            renderer?.onOutlines = { [weak self] in
                guard let self, self.worldID == self.controller.activeWorldID else { return }
                if self.mapFrozenForSheet {
                    self.pendingFlushAfterSheet = true
                    return
                }
                self.startLink()
                self.requestAsyncMetalRedraw()
            }
            let labelsView = MapLabelsView(map: map)
            self.labels = labelsView
            labelsView.alpha = CGFloat(max(0, min(1, (initialReveal - 0.85) / 0.15)))
            effects.alpha = CGFloat(max(0, min(1, (initialReveal - 0.9) / 0.1)))
            syncTroopVisibility(reveal: initialReveal)
            mtkView.frame = containerView.bounds; mtkView.autoresizingMask = [.flexibleWidth, .flexibleHeight]; containerView.addSubview(mtkView)
            // 统一将全部地图覆盖层（战争特效、国名地名、飘字、兵力条、天气）收入静态全屏的 overlayHost -> overlayCanvas，
            // 平移缩放永不改其 frame；仅在缩远露出卷轴边框时挂载单个复用 CAShapeLayer 蒙版裁在画心内。
            overlayHost.frame = containerView.bounds
            overlayHost.isUserInteractionEnabled = false; overlayHost.clipsToBounds = true
            overlayCanvas.frame = containerView.bounds
            overlayCanvas.isUserInteractionEnabled = false
            overlayHost.addSubview(overlayCanvas)
            containerView.addSubview(overlayHost)
            // 战争特效在地名之下（地图之上）：交战、围城、攻占、事件印都不盖住国名与城名；
            // 战况飘字与兵力条另放在地名之上；不设 autoresizingMask 以免平移画框时级联触发子视图 layoutSubviews。
            let overlayViews: [UIView] = [effects, labelsView, floats, troops, weather]
            for v in overlayViews {
                v.frame = overlayCanvas.bounds
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
            bindController()
            metrics.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
            metrics.textColor = .white; metrics.backgroundColor = UIColor.black.withAlphaComponent(0.6)
            metrics.numberOfLines = 0; metrics.layer.cornerRadius = 8; metrics.layer.masksToBounds = true
            metrics.isHidden = true; metrics.translatesAutoresizingMaskIntoConstraints = false
            containerView.addSubview(metrics)
            NSLayoutConstraint.activate([metrics.leadingAnchor.constraint(equalTo: containerView.safeAreaLayoutGuide.leadingAnchor, constant: 16),
                                         metrics.topAnchor.constraint(equalTo: containerView.safeAreaLayoutGuide.topAnchor, constant: 64)])
            containerView.onLayout = { [weak self] in self?.layoutChanged() }
            containerView.onWindowChange = { [weak self] attached in self?.windowAttachmentChanged(attached) }
            installGestures()
            return containerView
        }

        /// 将本世界的所有控制回调原子注册到 `MapController`（仅当前活跃 `activeWorldID` 允许接管，绝不被旧视图抢占）。
        func bindController() {
            guard worldID == controller.activeWorldID else { return }
            controller.registerSync(owner: self, worldID: worldID, onRelease: { [weak self] in
                self?.quiesceForWorldSwitch()
            }) { [weak self] in
                self?.sync()
            }
            controller.onRevealClock = { [weak self] in
                guard let self, self.worldID == self.controller.activeWorldID else { return }
                self.revealStarted()
            }
            controller.onSkipReveal = { [weak self] in
                guard let self, self.worldID == self.controller.activeWorldID, let renderer = self.renderer else { return }
                self.animation = nil
                renderer.setReveal(1)
                self.labels?.alpha = 1
                self.effects.alpha = 1
                self.syncTroopVisibility(reveal: 1)
                if self.viewport.width > 0 && self.viewport.height > 0 {
                    self.set(MapCamera.cover(map: self.mapSize, viewport: self.viewport), sync: false)
                }
            }
            controller.onHits = { [weak self] hits in
                guard let self, self.worldID == self.controller.activeWorldID, self.controller.play.showBattleFloats, !self.controller.sheetOpen else { return }
                for h in hits {
                    self.effects.float(h.text, worldX: Double(h.x), worldY: Double(h.y), naval: h.naval)
                }
            }
            controller.onSheet = { [weak self] in
                guard let self, self.worldID == self.controller.activeWorldID else { return }
                self.applySheetState()
            }
            controller.cameraScale = { [weak self] in
                guard let self, let renderer = self.renderer else { return (0, 0) }
                return (renderer.camera.scale, self.bounds.lowerBound)
            }
            controller.onFramingRequest = { [weak self] in
                guard let self, self.worldID == self.controller.activeWorldID else { return }
                self.applyFramingRequests()
            }
            controller.nameFrame = { [weak self] in self?.labels?.nameFrame() ?? [:] }
            controller.renderer = { [weak self] in self?.renderer }
            controller.placed = { [weak self] key in
                guard let p = self?.renderer?.placedSprites().first(where: { $0.sprite.key == key }) else { return nil }
                return (Double(p.x), Double(p.y))
            }
        }

        /// 二级菜单 / 抽屉覆盖状态即时切换：
        /// - `sheetCoversMap`（底部弹窗 ≥62% 或全屏模态）：0ms 立即停止 `CADisplayLink`、`drift`、天气粒子与战争特效，彻底冻结 Metal（0fps 零发热）；
        /// - 半屏抽屉（`sheetOpen && !sheetCoversMap`）：立即停天气粒子与浪花，把后台 Metal 与显示链路限至 12–15fps，为列表保留满帧；
        /// - 抽屉收起（`!sheetOpen`）：立即解冻并一次性刷新期间积压的覆盖层与画布。
        private func applySheetState() {
            sheetSettleWork?.cancel()
            sheetSettleWork = nil
            appliedFrameRange = nil

            if controller.sheetOpen {
                weather.setPaused(true)
                effects.stopWaves()
                drift?.invalidate(); drift = nil
                sheetThrottled = true

                if controller.sheetCoversMap {
                    mapFrozenForSheet = true
                    effects.setPaused(true)
                    link?.invalidate(); link = nil
                    mtk?.isPaused = true
                    mtk?.enableSetNeedsDisplay = false
                    mtk?.presentsWithTransaction = false
                } else {
                    let wasFrozen = mapFrozenForSheet
                    mapFrozenForSheet = false
                    effects.setPaused(false)
                    mtk?.isPaused = true
                    mtk?.enableSetNeedsDisplay = true
                    mtk?.preferredFramesPerSecond = 15
                    if let l = link {
                        pace(l, to: cameraInteractive ? .full : .sheetHalf)
                    }
                    if wasFrozen {
                        let hadPending = pendingFlushAfterSheet
                        pendingFlushAfterSheet = false
                        if hadPending {
                            sync()
                            flushFrozenCameraFrame(forceRedraw: true)
                        }
                        if renderer?.isAnimating == true || animation != nil || (controller.revealClock != nil && !controller.revealDone) {
                            startLink()
                            if let l = link { pace(l, to: cameraInteractive ? .full : .sheetHalf) }
                        }
                    }
                }
            } else {
                let wasFrozen = mapFrozenForSheet
                let hadPending = pendingFlushAfterSheet
                mapFrozenForSheet = false
                pendingFlushAfterSheet = false
                sheetThrottled = false
                mtk?.isPaused = true
                mtk?.enableSetNeedsDisplay = true
                let restoredFPS = min(UIScreen.main.maximumFramesPerSecond, Energy.mapFPS(preferred: controller.play.mapFPS, interactive: cameraInteractive))
                mtk?.preferredFramesPerSecond = restoredFPS
                effects.setPaused(false)
                weather.setPaused(false)
                syncWaves()
                syncWeather()
                if controller.drifting { startDrift() }
                if wasFrozen || hadPending {
                    if hadPending {
                        sync()
                        flushFrozenCameraFrame(forceRedraw: true)
                    } else if let mtk, mtk.window != nil {
                        mtk.setNeedsDisplay()
                    }
                }
                if renderer?.isAnimating == true || animation != nil || ambientActive || (controller.revealClock != nil && !controller.revealDone) {
                    startLink()
                }
                if let l = link {
                    pace(l, to: cameraInteractive ? .full : .glide)
                }
            }
        }

        private func flushFrozenCameraFrame(forceRedraw: Bool) {
            guard let renderer, let mtk else { return }
            if let a = animation, CACurrentMediaTime() - a.start >= a.duration {
                animation = nil
                renderer.camera = a.to
            }
            if mtk.window != nil {
                renderer.pinnedFrameTime = CACurrentMediaTime()
            }
            syncPresentCameraFrame(skipLabels: false, purePan: false, forceSync: false, fromLayout: false, forceAsyncRedraw: forceRedraw)
        }

        /// 世界切换前静默本旧视图：立即停掉显示链路、漂移与浪花并释放重型瞬态墨场/拓扑内存，避免与新世界叠加触发真机 Jetsam。
        private func quiesceForWorldSwitch() {
            sheetSettleWork?.cancel(); sheetSettleWork = nil
            link?.invalidate(); link = nil; appliedFrameRange = nil
            drift?.invalidate(); drift = nil
            mtk?.presentsWithTransaction = false
            weather.setPaused(true)
            effects.setPaused(true)
            renderer?.releaseHeavyTransientResources()
        }

        private func windowAttachmentChanged(_ attached: Bool) {
            if !attached {
                link?.invalidate(); link = nil; appliedFrameRange = nil
                drift?.invalidate(); drift = nil
                mtk?.presentsWithTransaction = false
                weather.setPaused(true)
                effects.stopWaves()
            } else if worldID == controller.activeWorldID {
                applySheetState()
            }
        }

        private func installGestures() {
            guard let mtk else { return }
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
            guard worldID == controller.activeWorldID, let container, let mtk else { return }
            let b = container.bounds
            guard let renderer, b.width.isFinite, b.height.isFinite, b.width > 0, b.height > 0 else { return }
            if mtk.frame != b || lastOverlayFullBounds != b {
                CATransaction.begin()
                CATransaction.setDisableActions(true)
                if mtk.frame != b { mtk.frame = b }
                lastOverlayFullBounds = b
                if overlayHost.frame != b { overlayHost.frame = b }
                if overlayCanvas.frame != b { overlayCanvas.frame = b }
                overlayClipMask.frame = b
                lastClipMaskRect = .null
                if effects.frame != b { effects.frame = b }
                if let labels, labels.frame != b { labels.frame = b }
                if floats.frame != b { floats.frame = b }
                if troops.frame != b { troops.frame = b }
                if weather.frame != b { weather.frame = b }
                CATransaction.commit()
            }
            if !placed { renderer.camera = MapCamera.cover(map: mapSize, viewport: viewport); placed = true }
            if !mapFrozenForSheet {
                set(renderer.camera, fromLayout: true)
            } else {
                pendingFlushAfterSheet = true
            }
            applyFramingRequests()
            if !mountNotified {
                mountNotified = true
                bindController()
                controller.mapMountToken &+= 1
                controller.onMapMounted?()
                controller.scheduleSync()
            }
            if controller.revealClock != nil && !controller.revealDone && appliedRevealSerial != controller.revealClockSerial {
                // 严禁在 UIView.layoutSubviews() 内同步重入修改子视图 frame 与起动动画，延至下个 RunLoop 安全起动开卷。
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.worldID == self.controller.activeWorldID,
                          self.controller.revealClock != nil, !self.controller.revealDone,
                          self.appliedRevealSerial != self.controller.revealClockSerial else { return }
                    self.revealStarted()
                }
            }
        }
        private func syncTroopVisibility(reveal: Float) {
            let allow = reveal >= 0.99 && (controller.play.showArmies || controller.replayLocked) && controller.play.showTroopBars
            troops.alpha = allow ? 1 : 0
            troops.isHidden = !allow
            if !allow && !troops.isEmpty {
                troops.clear()
            }
        }
        private func requestAsyncMetalRedraw(force: Bool = false) {
            guard let mtk, !mapFrozenForSheet else {
                if mapFrozenForSheet { pendingFlushAfterSheet = true }
                return
            }
            if controller.sheetOpen && !force {
                let now = CACurrentMediaTime()
                guard now - lastHalfSheetDrawTime >= 0.085 else { return }
                lastHalfSheetDrawTime = now
            }
            mtk.setNeedsDisplay()
        }
        private func scheduleClearPresentsWithTransactionIfIdle() {
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.cameraMoving else { return }
                if let mtk = self.mtk, mtk.presentsWithTransaction {
                    mtk.presentsWithTransaction = false
                }
            }
        }
        private func updateOverlayClipMask(clipRect: CGRect, fullBounds: CGRect) {
            let coversFull = abs(clipRect.minX - fullBounds.minX) < 0.01
                && abs(clipRect.minY - fullBounds.minY) < 0.01
                && abs(clipRect.width - fullBounds.width) < 0.01
                && abs(clipRect.height - fullBounds.height) < 0.01
            if coversFull {
                if overlayMaskAttached || overlayHost.layer.mask != nil {
                    overlayHost.layer.mask = nil
                    overlayMaskAttached = false
                    lastClipMaskRect = .null
                }
            } else {
                if !overlayMaskAttached || overlayHost.layer.mask !== overlayClipMask {
                    overlayClipMask.frame = fullBounds
                    overlayHost.layer.mask = overlayClipMask
                    overlayMaskAttached = true
                }
                if lastClipMaskRect != clipRect {
                    overlayClipMask.path = CGPath(rect: clipRect, transform: nil)
                    lastClipMaskRect = clipRect
                }
            }
        }
        private func applyOverlays(skipLabels: Bool, purePan: Bool, camera clamped: MapCamera, viewport vpSize: CGSize, clipRect: CGRect, fullBounds: CGRect) {
            guard let renderer else { return }
            if lastOverlayFullBounds != fullBounds {
                lastOverlayFullBounds = fullBounds
                if overlayHost.frame != fullBounds { overlayHost.frame = fullBounds }
                if overlayCanvas.frame != fullBounds { overlayCanvas.frame = fullBounds }
                overlayClipMask.frame = fullBounds
                lastClipMaskRect = .null
                if effects.frame != fullBounds { effects.frame = fullBounds }
                if let labels, labels.frame != fullBounds { labels.frame = fullBounds }
                if floats.frame != fullBounds { floats.frame = fullBounds }
                if troops.frame != fullBounds { troops.frame = fullBounds }
                if weather.frame != fullBounds { weather.frame = fullBounds }
            }
            updateOverlayClipMask(clipRect: clipRect, fullBounds: fullBounds)
            if !skipLabels, let labels, labels.alpha > 0.01 {
                if purePan {
                    labels.repositionVisible(camera: clamped, viewport: vpSize, mapRect: clipRect)
                    needsFullLabelUpdate = true
                } else {
                    labels.update(camera: clamped, viewport: vpSize, mapRect: clipRect)
                    needsFullLabelUpdate = false
                }
            }
            if !skipLabels && effects.alpha > 0.01 {
                effects.update(camera: clamped, viewport: vpSize)
            }
            if !skipLabels && renderer.reveal >= 0.99 {
                updateTroops(fastPan: purePan)
                syncWeather(purePan: purePan)
            } else if renderer.reveal < 0.99 {
                syncTroopVisibility(reveal: renderer.reveal)
            }
            placeSpot()
        }
        /// 统一原子提交帧：镜头平移/缩放/惯性/飞行/主页漂移时在同一 `CATransaction` 内同时定位所有覆盖层并执行 `mtk.draw()`
        ///（`presentsWithTransaction = true` + `waitUntilScheduled()`），令国名、城名、兵力数字与 Metal 底图严锁同一 VSync，零左右晃动。
        private func syncPresentCameraFrame(skipLabels: Bool, purePan: Bool = false, forceSync: Bool = false, fromLayout: Bool = false, forceAsyncRedraw: Bool = false) {
            guard let renderer, let mtk else { return }
            let vpSize = mtk.bounds.size
            guard vpSize.width.isFinite, vpSize.height.isFinite, vpSize.width > 0, vpSize.height > 0 else { return }
            let clamped = renderer.camera
            let clipRect = mapScreenRect(camera: clamped, viewport: vpSize)
            let fullBounds = CGRect(origin: .zero, size: vpSize)
            let moving = cameraMoving || forceSync
            let canDrawInline = moving && !fromLayout && !isDrawingInline && !mapFrozenForSheet && mtk.window != nil

            CATransaction.begin()
            CATransaction.setDisableActions(true)
            applyOverlays(skipLabels: skipLabels, purePan: purePan, camera: clamped, viewport: vpSize, clipRect: clipRect, fullBounds: fullBounds)
            if canDrawInline {
                if !mtk.presentsWithTransaction { mtk.presentsWithTransaction = true }
                isDrawingInline = true
                mtk.draw()
                isDrawingInline = false
            } else {
                if mtk.presentsWithTransaction { mtk.presentsWithTransaction = false }
                if !mapFrozenForSheet {
                    requestAsyncMetalRedraw(force: forceAsyncRedraw)
                }
            }
            CATransaction.commit()
        }
        /// 手势、惯性滑行或飞行动画收尾：补齐一次完整国名/城名避让排版，并切回异步上屏（`presentsWithTransaction = false`）。
        private func settleLabels(cameraOverride: MapCamera? = nil) {
            if let override = cameraOverride, override != camera {
                set(override, sync: true, fastPan: false)
                scheduleClearPresentsWithTransactionIfIdle()
                return
            }
            if let mtk, mtk.presentsWithTransaction {
                mtk.presentsWithTransaction = false
            }
            if needsFullLabelUpdate && !mapFrozenForSheet {
                syncPresentCameraFrame(skipLabels: false, purePan: false, forceSync: false)
            }
        }
        private func set(_ camera: MapCamera, sync: Bool = false, skipLabels: Bool = false, fastPan: Bool = false, fromLayout: Bool = false) {
            guard let renderer, let mtk else { return }
            let vpSize = mtk.bounds.size
            guard vpSize.width.isFinite, vpSize.height.isFinite, vpSize.width > 0, vpSize.height > 0 else { return }
            let vp = (width: Double(vpSize.width), height: Double(vpSize.height))
            let b = MapCamera.scaleBounds(map: mapSize, viewport: vp)
            let prevCam = renderer.camera
            var c = camera.isValid ? camera : MapCamera.cover(map: mapSize, viewport: vp)
            c.scale = min(b.upperBound, max(b.lowerBound, c.scale))
            let clamped = c.clamped(map: mapSize, viewport: vp, margin: scrollEdgeMargin)
            renderer.camera = clamped
            if mapFrozenForSheet {
                pendingFlushAfterSheet = true
                return
            }
            if mtk.window != nil {
                renderer.pinnedFrameTime = CACurrentMediaTime()
            }
            let purePan = (fastPan || panning) && abs(prevCam.scale - clamped.scale) < 1e-6
            syncPresentCameraFrame(skipLabels: skipLabels, purePan: purePan, forceSync: sync, fromLayout: fromLayout)
        }
        private func updateTroops(fastPan: Bool = false) {
            guard let renderer, let mtk else { return }
            let allow = renderer.reveal >= 0.99 && (controller.play.showArmies || controller.replayLocked) && controller.play.showTroopBars
            guard allow else {
                troops.alpha = 0
                troops.isHidden = true
                if !troops.isEmpty { troops.clear() }
                return
            }
            if !troops.shows(renderer.camera) {
                if !troops.isEmpty { troops.clear() }
                return
            }
            if troops.alpha != 1 { troops.alpha = 1 }
            if troops.isHidden { troops.isHidden = false }
            if appliedTroopsRevision != controller.troopsRevision {
                appliedTroopsRevision = controller.troopsRevision
                troops.texts = controller.troopTexts
                troops.ratios = controller.troopRatios
                troops.colors = controller.troopBarColors
            }
            _ = fastPan
            troops.update(renderer.placedSprites(), camera: renderer.camera, viewport: mtk.bounds.size, spread: renderer.spread)
        }
        private var camera: MapCamera { renderer?.camera ?? MapCamera(centerX: 0, centerY: 0, scale: 1) }

        private var boxStart: CGPoint?
        private lazy var boxLayer: CAShapeLayer = {
            let l = CAShapeLayer()
            l.fillColor = UIColor(red: 0.706, green: 0.255, blue: 0.18, alpha: 0.10).cgColor
            l.strokeColor = UIColor(red: 0.706, green: 0.255, blue: 0.18, alpha: 0.9).cgColor
            l.lineWidth = 1.5; l.lineDashPattern = [6, 4]
            mtk?.superview?.layer.addSublayer(l)
            return l
        }()
        /// RTS box selection: the armies inside the box, of the state that has the most of them.
        private func boxSelect(_ g: UIPanGestureRecognizer) {
            guard let mtk else { return }
            let p = g.location(in: mtk)
            guard p.x.isFinite && p.y.isFinite else { return }
            switch g.state {
            case .began: boxStart = p
            case .changed:
                if let s = boxStart, s.x.isFinite, s.y.isFinite {
                    boxLayer.path = UIBezierPath(rect: CGRect(x: min(s.x, p.x), y: min(s.y, p.y), width: abs(p.x - s.x), height: abs(p.y - s.y))).cgPath
                }
            default:
                boxLayer.path = nil
                guard let s = boxStart, let armies = controller.armies else { boxStart = nil; return }
                let rect = CGRect(x: min(s.x, p.x), y: min(s.y, p.y), width: abs(p.x - s.x), height: abs(p.y - s.y)).insetBy(dx: -10, dy: -10)
                let inside = armies.filter { a in guard a.army >= 0 else { return false }; let q = camera.toScreen(x: Double(a.x), y: Double(a.y), viewport: viewport); return q.x.isFinite && q.y.isFinite && rect.contains(CGPoint(x: q.x, y: q.y)) }
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
            mtk?.layer.addSublayer(l); return l
        }()
        private func showBrush(at p: CGPoint?) {
            guard let p, p.x.isFinite, p.y.isFinite else { brushRing.isHidden = true; return }
            let r = CGFloat(max(1, controller.brushRadius * camera.scale))
            guard r.isFinite else { brushRing.isHidden = true; return }
            CATransaction.begin(); CATransaction.setDisableActions(true)
            brushRing.isHidden = false; brushRing.path = UIBezierPath(ovalIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)).cgPath
            CATransaction.commit()
        }
        @objc private func handlePan(_ g: UIPanGestureRecognizer) {
            guard let mtk else { return }
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
                if let cell = picker.cell(atX: Float(w.x), y: Float(w.y)), map.province.indices.contains(cell), map.province[cell] >= 0 {
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
                if t.x.isFinite && t.y.isFinite {
                    pendingCamera = gestureCamera.panned(dx: Double(t.x), dy: Double(t.y))
                    pendingPurePan = true
                }
                g.setTranslation(.zero, in: mtk)
                startLink()
                if let l = link { pace(l, to: .full) }
            case .changed:
                panning = true
                let t = g.translation(in: mtk)
                if t.x.isFinite && t.y.isFinite {
                    pendingCamera = gestureCamera.panned(dx: Double(t.x), dy: Double(t.y))
                    pendingPurePan = true
                }
                g.setTranslation(.zero, in: mtk)
                startLink()
                if let l = link { pace(l, to: .full) }
            case .ended:
                panning = false
                controller.onMapBrowsing?(false)
                let t = g.translation(in: mtk)
                let finalCam: MapCamera?
                if t != .zero && t.x.isFinite && t.y.isFinite {
                    finalCam = gestureCamera.panned(dx: Double(t.x), dy: Double(t.y))
                    g.setTranslation(.zero, in: mtk)
                } else {
                    finalCam = pendingCamera
                }
                pendingCamera = nil
                pendingPurePan = false
                let rawVel = g.velocity(in: mtk)
                velocity = (rawVel.x.isFinite && rawVel.y.isFinite) ? rawVel : .zero
                let willFling = hypot(velocity.x, velocity.y) > 60
                if willFling {
                    if let finalCam {
                        set(finalCam, fastPan: true)
                    }
                    startLink()
                    if let l = link { pace(l, to: .full) }
                } else {
                    velocity = .zero
                    settleLabels(cameraOverride: finalCam)
                }
            default:
                panning = false
                velocity = .zero
                controller.onMapBrowsing?(false)
                let pending = pendingCamera
                pendingCamera = nil
                pendingPurePan = false
                settleLabels(cameraOverride: pending)
            }
        }
        private var atUnrollFloor = false
        @objc private func handlePinch(_ g: UIPinchGestureRecognizer) {
            guard let mtk else { return }
            let p = g.location(in: mtk)
            guard p.x.isFinite && p.y.isFinite else { return }
            switch g.state {
            case .began:
                lastPinch = p; pinching = true; panning = false
                controller.onMapBrowsing?(true)
                atUnrollFloor = gestureCamera.scale <= bounds.lowerBound * 1.015
                startLink()
                if let l = link { pace(l, to: .full) }
            case .changed:
                // A finger lifted or added moves the touch centre: re-anchor instead of jumping.
                if g.numberOfTouches != pinchTouches { pinchTouches = g.numberOfTouches; lastPinch = p; g.scale = 1; return }
                let scaleFactor = Double(g.scale)
                guard scaleFactor.isFinite, scaleFactor > 0, viewport.width > 0, viewport.height > 0 else { g.scale = 1; lastPinch = p; return }
                // The fingers both zoom and drag the map — coalesce into VSync display link (max 1 GPU draw per frame).
                let moved = gestureCamera.panned(dx: Double(p.x - lastPinch.x), dy: Double(p.y - lastPinch.y))
                let nextCam = moved.zoomed(by: scaleFactor, anchorX: Double(p.x), anchorY: Double(p.y), viewport: viewport, bounds: bounds)
                let hitFloor = nextCam.scale <= bounds.lowerBound * 1.012
                if hitFloor && !atUnrollFloor && g.scale < 1 {
                    selection.selectionChanged()
                }
                atUnrollFloor = hitFloor
                pendingCamera = nextCam
                pendingPurePan = false
                g.scale = 1; lastPinch = p
                startLink()
                if let l = link { pace(l, to: .full) }
            default:
                pinching = false; pinchTouches = 2
                controller.onMapBrowsing?(false)
                let finalCam = pendingCamera
                pendingCamera = nil
                pendingPurePan = false
                settleLabels(cameraOverride: finalCam)
            }
        }
        @objc private func handleDoubleTap(_ g: UITapGestureRecognizer) {
            guard let mtk else { return }
            let p = g.location(in: mtk)
            guard p.x.isFinite && p.y.isFinite else { return }
            impact.impactOccurred()
            animate(to: camera.zoomed(by: 2, anchorX: Double(p.x), anchorY: Double(p.y), viewport: viewport, bounds: bounds))
        }
        @objc private func handleTwoFingerTap(_ g: UITapGestureRecognizer) {
            guard let mtk else { return }
            let p = g.location(in: mtk)
            guard p.x.isFinite && p.y.isFinite else { return }
            animate(to: camera.zoomed(by: 0.5, anchorX: Double(p.x), anchorY: Double(p.y), viewport: viewport, bounds: bounds))
        }
        /// A long press ends as a tap too: that tap is not a selection.
        private var pressing = false
        @objc private func handleLongPress(_ g: UILongPressGestureRecognizer) {
            guard let mtk else { return }
            if g.state == .ended || g.state == .cancelled || g.state == .failed { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in self?.pressing = false }; return }
            guard !controller.replayLocked else { return }
            guard g.state == .began, controller.pickPrompt == nil, controller.marchingArmy == nil, controller.marchingFleet == nil, controller.paintNation == nil, !controller.boxSelecting, !controller.terrainBrush else { return }
            let p = g.location(in: mtk), w = camera.toWorld(x: Double(p.x), y: Double(p.y), viewport: viewport)
            guard let cell = picker.cell(atX: Float(w.x), y: Float(w.y)), map.province.indices.contains(cell), map.province[cell] >= 0 else { return }
            pressing = true
            impact.impactOccurred()
            controller.onLongPress?(Int(map.province[cell]), p)
        }
        @objc private func handleTap(_ g: UITapGestureRecognizer) {
            guard let mtk else { return }
            if pressing || controller.replayLocked { return }
            let p = g.location(in: mtk), w = camera.toWorld(x: Double(p.x), y: Double(p.y), viewport: viewport)
            if controller.terrainBrush { controller.onTerrainStroke?(w.x, w.y); controller.onTerrainStrokeEnd?(); return }
            var province: Int?
            if let cell = picker.cell(atX: Float(w.x), y: Float(w.y)), map.province.indices.contains(cell), map.province[cell] >= 0 { province = Int(map.province[cell]) }
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
                    if d < reach, best.map({ d < $0.d }) ?? true { best = (a.sprite.army, a.sprite.key, d) }
                }
                if let best {
                    selection.selectionChanged()
                    showTapFeedback(worldX: w.x, worldY: w.y, isUnit: true)
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
            if province != nil { showTapFeedback(worldX: w.x, worldY: w.y, isUnit: false) }
            if province != controller.selectedProvince { selection.selectionChanged() }
            controller.onMapTap?(province == nil)
            controller.selectedProvince = province
        }

        /// 零延迟 GPU/CoreAnimation 朱墨落指水晕：锚定世界坐标，点选军团、战船或州郡即刻绽开并严密贴地随动。
        private func showTapFeedback(worldX: Double, worldY: Double, isUnit: Bool) {
            guard mtk != nil, let renderer, worldX.isFinite, worldY.isFinite else { return }
            let accent = isUnit
                ? UIColor(red: 0.76, green: 0.24, blue: 0.16, alpha: 0.88)
                : UIColor(red: 0.58, green: 0.42, blue: 0.18, alpha: 0.72)
            let radius: CGFloat = isUnit ? 22 : 18
            let s = renderer.camera.toScreen(x: worldX, y: worldY, viewport: viewport)
            guard s.x.isFinite && s.y.isFinite else { return }
            let ring = CAShapeLayer()
            ring.bounds = CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2)
            ring.position = CGPoint(x: s.x, y: s.y)
            ring.path = UIBezierPath(ovalIn: ring.bounds).cgPath
            ring.fillColor = accent.withAlphaComponent(isUnit ? 0.14 : 0.08).cgColor
            ring.strokeColor = accent.cgColor
            ring.lineWidth = isUnit ? 2.0 : 1.5
            floats.layer.addSublayer(ring)
            let id = UUID()
            tapRipples.append((id: id, layer: ring, x: worldX, y: worldY))

            let scale = CABasicAnimation(keyPath: "transform.scale")
            scale.fromValue = 0.42
            scale.toValue = isUnit ? 1.52 : 1.38
            let fade = CABasicAnimation(keyPath: "opacity")
            fade.fromValue = 1.0
            fade.toValue = 0.0
            let group = CAAnimationGroup()
            group.animations = [scale, fade]
            group.duration = 0.32
            group.timingFunction = CAMediaTimingFunction(name: .easeOut)
            group.isRemovedOnCompletion = false
            group.fillMode = .forwards
            ring.add(group, forKey: "tapRipple")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self, weak ring] in
                ring?.removeFromSuperlayer()
                self?.tapRipples.removeAll { $0.id == id }
            }
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
            guard link == nil, !mapFrozenForSheet else { return }
            let proxy = WeakDisplayLinkProxy(owner: self) { [weak self] l in
                self?.step(l)
            }
            let l = CADisplayLink(target: proxy, selector: #selector(WeakDisplayLinkProxy.tick(_:)))
            let initial = frameRange
            l.preferredFrameRateRange = initial
            appliedFrameRange = initial
            l.add(to: .main, forMode: .common); link = l; linkPace = controller.sheetOpen && !cameraInteractive ? .sheetHalf : .full
        }
        private static func rangesEqual(_ a: CAFrameRateRange?, _ b: CAFrameRateRange) -> Bool {
            guard let a else { return false }
            return a.minimum == b.minimum && a.maximum == b.maximum && a.preferred == b.preferred
        }
        private static let halfSheetRange = CAFrameRateRange(minimum: 10, maximum: 15, preferred: 12)
        private static func range(_ fps: Int, interactive: Bool = false) -> CAFrameRateRange {
            let f = Float(max(15, min(120, fps)))
            if interactive {
                if f >= 90 {
                    return CAFrameRateRange(minimum: 60, maximum: f, preferred: f)
                }
                if f >= 60 {
                    return CAFrameRateRange(minimum: 60, maximum: f, preferred: f)
                }
                let lo = min(f, max(30, f - 5))
                return CAFrameRateRange(minimum: lo, maximum: f, preferred: f)
            }
            let floor: Float = f >= 60 ? 45 : max(24, f * 0.75)
            return CAFrameRateRange(minimum: min(f, floor), maximum: f, preferred: f)
        }
        private var frameRange: CAFrameRateRange {
            if controller.sheetOpen && animation == nil && controller.revealClock == nil && !interactiveGestureActive {
                return Self.halfSheetRange
            }
            let active = cameraInteractive
            let fps = Energy.mapFPS(preferred: controller.play.mapFPS, interactive: active)
            return Self.range(fps, interactive: active)
        }
        private var glideRange: CAFrameRateRange {
            if controller.sheetOpen && animation == nil && controller.revealClock == nil {
                return Self.halfSheetRange
            }
            return Self.range(Energy.glideFPS(preferred: controller.play.marchFPS), interactive: false)
        }
        private var ambientRange: CAFrameRateRange { Self.range(24, interactive: false) }
        private enum LinkPace: Equatable { case full, glide, ambient, sheetHalf }
        private var linkPace: LinkPace = .full
        private var appliedFrameRange: CAFrameRateRange?
        private var shownWashes = WashFrame.empty
        private var shownWashEpoch = -1
        private var appliedPlay: PlaySettings?
        private func pace(_ l: CADisplayLink, to next: LinkPace) {
            linkPace = next
            let target: CAFrameRateRange
            switch next {
            case .full: target = frameRange
            case .glide: target = glideRange
            case .ambient: target = ambientRange
            case .sheetHalf: target = Self.halfSheetRange
            }
            if !Self.rangesEqual(appliedFrameRange, target) {
                appliedFrameRange = target
                l.preferredFrameRateRange = target
                if !controller.sheetOpen {
                    mtk?.preferredFramesPerSecond = min(UIScreen.main.maximumFramesPerSecond, Int((target.preferred ?? target.maximum).rounded()))
                } else if !mapFrozenForSheet {
                    mtk?.preferredFramesPerSecond = 15
                }
            }
        }
        /// A reveal clock began: the map follows it frame by frame; with `push` the camera eases out gently from 1.18×.
        private func revealStarted() {
            guard placed else { return }
            appliedRevealSerial = controller.revealClockSerial
            if let c = controller.revealClock, let renderer {
                let startReveal = controller.revealNow ?? c.from
                renderer.setReveal(startReveal)
                syncTroopVisibility(reveal: startReveal)
                if c.push {
                    let target = camera
                    var from = target; from.scale = target.scale * 1.18
                    set(from)
                    animate(to: target, duration: c.duration * 1.08)
                }
            }
            startLink()
        }
        /// One frame of the reveal clock; false when none runs.
        private func advanceReveal() -> Bool {
            guard let t = controller.revealNow, let renderer else { return false }
            renderer.setReveal(t)
            let labelRaw = max(0, min(1, (t - 0.80) / 0.20))
            let labelEase = 1 - pow(1 - labelRaw, 3)
            let effectRaw = max(0, min(1, (t - 0.86) / 0.14))
            let effectEase = 1 - pow(1 - effectRaw, 3)
            labels?.alpha = CGFloat(labelEase)
            effects.alpha = CGFloat(effectEase)
            syncTroopVisibility(reveal: t)
            requestAsyncMetalRedraw(force: true)
            // The owner (GameModel) clears the clock once the published value has caught up.
            if controller.revealDone {
                let finalT = controller.revealClock?.to ?? t
                renderer.setReveal(finalT)
                labels?.alpha = 1
                effects.alpha = 1
                syncTroopVisibility(reveal: finalT)
                return false
            }
            return true
        }
        private func step(_ l: CADisplayLink) {
            if mapFrozenForSheet {
                link?.invalidate(); link = nil; appliedFrameRange = nil
                return
            }
            let rawDt = l.targetTimestamp - l.timestamp
            let dt = rawDt.isFinite ? min(0.05, max(0.001, rawDt)) : (1.0 / 60.0)
            let revealing = advanceReveal()
            if let pending = pendingCamera {
                let purePan = pendingPurePan
                pendingCamera = nil
                pendingPurePan = false
                pace(l, to: .full)
                set(pending, fastPan: purePan)
                return
            }
            if let a = animation {
                pace(l, to: .full)
                let x = max(0, min(1, (CACurrentMediaTime() - a.start) / max(0.001, a.duration)))
                let eased = x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
                let done = x >= 1
                if done { animation = nil }
                set(MapCamera.arcInterpolate(a.from, a.to, eased, bounds: bounds), sync: true, fastPan: false)
                if done { scheduleClearPresentsWithTransactionIfIdle() }
            } else if isFlinging {
                pace(l, to: .full)
                let prevCam = camera
                let dx = Double(velocity.x) * dt
                let dy = Double(velocity.y) * dt
                let nextCam = prevCam.panned(dx: dx, dy: dy)
                // Exponential deceleration close to UIScrollView's normal rate.
                let decay = CGFloat(pow(0.998, dt * 1000))
                let nextVel = CGPoint(x: velocity.x * decay, y: velocity.y * decay)
                let clampedNext = nextCam.clamped(map: mapSize, viewport: viewport, margin: scrollEdgeMargin)
                let pinnedAgainstEdge = hypot(dx, dy) > 0.5
                    && abs(clampedNext.centerX - prevCam.centerX) < 1e-6
                    && abs(clampedNext.centerY - prevCam.centerY) < 1e-6
                let stopping = pinnedAgainstEdge || hypot(nextVel.x, nextVel.y) <= 8
                if stopping {
                    velocity = .zero
                    set(nextCam, sync: true, fastPan: false)
                    scheduleClearPresentsWithTransactionIfIdle()
                } else {
                    velocity = nextVel
                    set(nextCam, fastPan: true)
                }
            } else if fingerDragging {
                // 手指按住未动时保持链路就绪但不空画，松手或下一帧滑动即刻跟手。
                pace(l, to: .full)
                if !mapFrozenForSheet && renderer?.isAnimating == true {
                    if let mtk, mtk.window != nil {
                        renderer?.pinnedFrameTime = CACurrentMediaTime()
                        if mtk.presentsWithTransaction { mtk.presentsWithTransaction = false }
                    }
                    if (renderer?.reveal ?? 0) >= 0.99 { updateTroops(fastPan: true) }
                    requestAsyncMetalRedraw()
                }
            } else if renderer?.isAnimating == true {
                pace(l, to: controller.sheetOpen ? .sheetHalf : .glide)
                velocity = .zero
                if let mtk, mtk.presentsWithTransaction { mtk.presentsWithTransaction = false }
                if !controller.sheetOpen && (renderer?.reveal ?? 0) >= 0.99 {
                    if mtk?.window != nil { renderer?.pinnedFrameTime = CACurrentMediaTime() }
                    updateTroops(fastPan: false)
                }
                requestAsyncMetalRedraw()
            } else if revealing {
                pace(l, to: .full)
            } else if ambientActive {
                pace(l, to: .ambient)
                velocity = .zero
                requestAsyncMetalRedraw()
            } else {
                velocity = .zero
                if needsFullLabelUpdate {
                    settleLabels()
                } else {
                    if let mtk, mtk.presentsWithTransaction { mtk.presentsWithTransaction = false }
                    if !controller.sheetOpen && !mapFrozenForSheet {
                        requestAsyncMetalRedraw()
                    }
                }
                link?.invalidate(); link = nil; appliedFrameRange = nil
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
            // 严格代次隔离：已过期旧世界视图绝不消费新世界的任何状态、军队、墨晕或地图更新。
            guard worldID == controller.activeWorldID, renderer != nil else { return }
            if mapFrozenForSheet != controller.sheetCoversMap || controller.sheetOpen != sheetThrottled {
                applySheetState()
            }
            var dirty = false
            if let renderer, renderer.seasonPhase != controller.seasonPhase {
                renderer.seasonPhase = controller.seasonPhase
                let sBucket = controller.seasonPhase < 0 ? -1 : Int((controller.seasonPhase * 24).rounded())
                if sBucket != shownWeatherSeasonBucket {
                    shownWeatherSeasonBucket = sBucket
                    if !mapFrozenForSheet { syncWeather() }
                }
                dirty = true
            }
            if let renderer, shownWeatherRevision != controller.weatherRevision {
                shownWeatherRevision = controller.weatherRevision
                renderer.setWeatherZones(controller.weatherGPUZones)
                if !mapFrozenForSheet { syncWeather() }
                dirty = true
            }
            if controller.worldRevision != shownRevision, let next = controller.world,
               next.vertices.count == map.vertices.count, next.cellCount == map.cellCount,
               Self.worldChanged(next, map) {
                shownRevision = controller.worldRevision
                map = next
                renderer?.setMap(next, skipStatic: controller.replayLocked, skipOutlines: controller.replayScrubbing, animateColors: !controller.replayLocked || controller.replayAnimate)
                // 回放期间城池位置不变，跳过主线程 CoreText 全城重绘，彻底消除逐帧掉帧与卡顿。
                if !controller.replayLocked { labels?.setCities(map: next) }
                // 快速拖拽回放进度条期间跳过国名框重建，松手或单步/自动播放时即时更新。
                if !controller.replayScrubbing {
                    if let groups = controller.viewLabels { labels?.setGroups(groups, animated: false) } else { labels?.setNations(map: next, animated: false) }
                    if !mapFrozenForSheet, let renderer, let mtk {
                        labels?.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size))
                    }
                }
                dirty = true
            }
            // While a reveal clock runs the display link draws it; the published value is only coarse.
            if !mapFrozenForSheet && controller.revealClock != nil && !controller.revealDone && link == nil { startLink() }
            if controller.revealClock == nil {
                if let renderer, renderer.reveal != controller.reveal { renderer.setReveal(controller.reveal); dirty = true }
                // Names ink in last, with the cities; troop bars stay completely hidden & cleared until reveal completes.
                labels?.alpha = CGFloat(max(0, min(1, (controller.reveal - 0.85) / 0.15)))
                effects.alpha = CGFloat(max(0, min(1, (controller.reveal - 0.9) / 0.1)))
                if !mapFrozenForSheet { syncTroopVisibility(reveal: controller.reveal) }
            }
            mtk?.isUserInteractionEnabled = controller.interactive
            if controller.drifting && !controller.sheetOpen && !mapFrozenForSheet { startDrift() }
            if !mapFrozenForSheet { syncWaves() }
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
            if controller.editorRevision != shownEditorRevision, let next = controller.editorMap,
               next.vertices.count == map.vertices.count, next.cellCount == map.cellCount {
                shownEditorRevision = controller.editorRevision
                map = next
                renderer?.setTerrain(next, refreshSea: controller.editorSeaDirty)
                controller.editorSeaDirty = false
                labels?.setNations(map: next, animated: false)
                labels?.setCities(map: next)
                if !mapFrozenForSheet, let renderer, let mtk {
                    labels?.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size))
                }
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
                dirty = true
                if !mapFrozenForSheet {
                    if (renderer?.reveal ?? 0) >= 0.99 {
                        if !controller.sheetOpen { updateTroops() }
                        if renderer?.isAnimating == true { startLink() }
                    } else {
                        syncTroopVisibility(reveal: renderer?.reveal ?? 0)
                    }
                }
            }
            if controller.washes != shownWashes || controller.washEpoch != shownWashEpoch {
                shownWashes = controller.washes; shownWashEpoch = controller.washEpoch
                renderer?.setWashes(shownWashes, epoch: shownWashEpoch)
                if !controller.sheetOpen && !mapFrozenForSheet && renderer?.isAnimating == true { startLink() }
                dirty = true
            }
            if controller.viewLabels != shownViewLabels {
                let animated = !mapFrozenForSheet && (controller.viewLabels?.map(\.name) != shownViewLabels?.map(\.name))
                shownViewLabels = controller.viewLabels
                if let groups = shownViewLabels { labels?.setGroups(groups, animated: animated) } else { labels?.setNations(map: map, animated: animated) }
                if !mapFrozenForSheet, let renderer, let mtk {
                    labels?.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size))
                }
                dirty = true
            }
            if !mapFrozenForSheet && controller.effects != shownEffects {
                shownEffects = controller.effects
                effects.set(shownEffects)
                effects.alpha = controller.reveal >= 1 ? 1 : 0
                dirty = true
            }
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
                if !controller.sheetOpen && !mapFrozenForSheet {
                    mtk?.preferredFramesPerSecond = min(UIScreen.main.maximumFramesPerSecond, Energy.mapFPS(preferred: controller.play.mapFPS, interactive: cameraInteractive))
                }
                // 画面 settings: the simulation's share, cooling, the effects' frames and the map's pixels.
                Energy.autoCool = controller.play.autoCool
                Energy.load = Double(controller.play.simLoad) / 100
                EffectsView.fps = controller.play.effectFPS
                let scale = min(UIScreen.main.scale, controller.play.renderScale)
                if let mtk, mtk.contentScaleFactor != scale { mtk.contentScaleFactor = scale; dirty = true }
                if controller.play != appliedPlay {
                    appliedPlay = controller.play
                    if !mapFrozenForSheet {
                        syncWaves()
                        updateTroops()
                        appliedFrameRange = nil
                        if let l = link { pace(l, to: controller.sheetOpen ? .sheetHalf : .full) }
                    }
                    dirty = true
                }
            }
            if let renderer, renderer.display != controller.display {
                renderer.setDisplay(controller.display)
                dirty = true
            }
            if renderer?.setSeaPorts(controller.seaPorts) == true { dirty = true }
            if renderer?.setForts(controller.forts, holy: controller.holy, wonders: controller.wonders, ruins: controller.ruins) == true { dirty = true }
            if labels?.setCustom(controller.customLabels) == true { dirty = true }
            if labels?.setImages(controller.customImages) == true { dirty = true }
            if renderer?.setExtraRivers(controller.customRivers) == true { dirty = true }
            if let labels, labels.nameScale != controller.display.nationNameScale || labels.fullNames != controller.display.fullNationNames {
                labels.nameScale = controller.display.nationNameScale
                let namesChanged = labels.fullNames != controller.display.fullNationNames
                labels.fullNames = controller.display.fullNationNames
                if namesChanged, controller.viewLabels == nil { labels.setNations(map: map, animated: false) }
                if !mapFrozenForSheet, let renderer, let mtk {
                    labels.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size))
                }
                dirty = true
            }
            if let labels, labels.showCities != controller.display.cityNames {
                labels.showCities = controller.display.cityNames
                if !mapFrozenForSheet, let renderer, let mtk {
                    labels.update(camera: renderer.camera, viewport: mtk.bounds.size, mapRect: mapScreenRect(camera: renderer.camera, viewport: mtk.bounds.size))
                }
                dirty = true
            }
            metrics.isHidden = !controller.showMetrics

            // 二级菜单/高抽屉覆盖主画面时仅保持轻量数据同步，彻底跳过 CADisplayLink、覆盖层排版与 Metal 重绘（0fps 零发热）。
            if mapFrozenForSheet {
                let hasDeferredWork = controller.effects != shownEffects
                    || controller.focus?.id != focusID
                    || controller.focusNation?.id != focusNationID
                    || controller.panAboveSheet?.id != panAboveSheetID
                    || controller.focusPoint?.id != focusPointID
                    || controller.spotlight?.id != spotlightID
                    || controller.zoomRequest?.id != zoomID
                    || controller.unrollRequest != unrollID
                    || controller.resetRequest != resetID
                if dirty || hasDeferredWork || renderer?.isAnimating == true {
                    pendingFlushAfterSheet = true
                }
                return
            }

            if ambientActive && link == nil { startLink() }
            let effTrailing = controller.sheetTrailingFraction
            let effBottom = effTrailing > 0.05 ? 0.0 : (controller.sheetBottomFraction > 0.05 ? controller.sheetBottomFraction : (controller.sheetOpen ? 0.50 : 0.0))
            if let f = controller.focus, f.id != focusID {
                focusID = f.id
                if map.meta.provinces.indices.contains(f.province) {
                    let p = map.meta.provinces[f.province]
                    if p.x.isFinite && p.y.isFinite {
                        let targetScale = max(camera.scale, bounds.lowerBound * 4)
                        animate(to: MapCamera.focused(worldX: Double(p.x), worldY: Double(p.y), scale: targetScale, viewport: viewport, bottomFraction: effBottom, trailingFraction: effTrailing), duration: 0.48)
                    }
                }
            }
            if let fn = controller.focusNation, fn.id != focusNationID {
                focusNationID = fn.id
                if map.meta.nations.indices.contains(fn.nation) {
                    let label = map.meta.labels.first(where: { $0.nation == fn.nation })
                    let capIdx = map.meta.nations[fn.nation].capital
                    let capCity = map.meta.cities.indices.contains(capIdx) ? map.meta.cities[capIdx] : nil
                    let tx: Double
                    let ty: Double
                    if let label, label.x.isFinite, label.y.isFinite {
                        // 优先对准国名与疆域重心（若与都城邻近则取加权居中），确保国名大字与核心领土完整落于抽屉上方可视安全区正中央
                        if let capCity, capCity.x.isFinite, capCity.y.isFinite {
                            tx = Double(label.x) * 0.72 + Double(capCity.x) * 0.28
                            ty = Double(label.y) * 0.72 + Double(capCity.y) * 0.28
                        } else {
                            tx = Double(label.x); ty = Double(label.y)
                        }
                    } else if let capCity, capCity.x.isFinite, capCity.y.isFinite {
                        tx = Double(capCity.x); ty = Double(capCity.y)
                    } else {
                        tx = .nan; ty = .nan
                    }
                    if tx.isFinite && ty.isFinite && viewport.width > 0 && viewport.height > 0 {
                        let minScale = bounds.lowerBound * 2.4
                        let maxScale = bounds.lowerBound * 5.2
                        let targetScale = min(maxScale, max(minScale, camera.scale))
                        animate(to: MapCamera.focused(worldX: tx, worldY: ty, scale: targetScale, viewport: viewport, bottomFraction: max(effBottom, effTrailing > 0.05 ? 0 : 0.50), trailingFraction: effTrailing), duration: 0.50)
                    }
                }
            }
            if let pa = controller.panAboveSheet, pa.id != panAboveSheetID {
                panAboveSheetID = pa.id
                if map.meta.provinces.indices.contains(pa.province), viewport.width > 0, viewport.height > 0 {
                    let p = map.meta.provinces[pa.province]
                    if p.x.isFinite && p.y.isFinite {
                        let bottomFrac = max(effBottom, effTrailing > 0.05 ? 0 : 0.50)
                        let sc = camera.toScreen(x: Double(p.x), y: Double(p.y), viewport: viewport)
                        let coveredPortrait = bottomFrac > 0.05 && (sc.y > viewport.height * (1.0 - bottomFrac) - 52 || sc.y < 86)
                        let coveredLandscape = effTrailing > 0.05 && (sc.x > viewport.width * (1.0 - effTrailing) - 48 || sc.x < 68)
                        if coveredPortrait || coveredLandscape {
                            animate(to: MapCamera.focused(worldX: Double(p.x), worldY: Double(p.y), scale: camera.scale, viewport: viewport, bottomFraction: bottomFrac, trailingFraction: effTrailing), duration: 0.36)
                        }
                    }
                }
            }
            if let f = controller.focusPoint, f.id != focusPointID {
                focusPointID = f.id
                if f.x.isFinite && f.y.isFinite && viewport.width > 0 && viewport.height > 0 {
                    let scale = max(0.05, max(camera.scale, bounds.lowerBound * 7))
                    animate(to: MapCamera.focused(worldX: f.x, worldY: f.y, scale: scale, viewport: viewport, bottomFraction: effBottom, trailingFraction: effTrailing), duration: 0.52)
                }
            }
            if let s = controller.spotlight, s.id != spotlightID {
                spotlightID = s.id
                if s.x.isFinite && s.y.isFinite && viewport.width > 0 && viewport.height > 0 {
                    let b = MapCamera.scaleBounds(map: mapSize, viewport: viewport)
                    let scale = max(1e-4, min(b.upperBound, max(camera.scale, b.lowerBound * 10)))
                    let spotBottom = effTrailing > 0.05 ? 0.0 : max(effBottom, controller.sheetOpen ? 0.38 : 0.0)
                    animate(to: MapCamera.focused(worldX: s.x, worldY: s.y, scale: scale, viewport: viewport, bottomFraction: spotBottom, trailingFraction: effTrailing), duration: 0.72)
                    showSpot(x: s.x, y: s.y)
                }
            }
            if let z = controller.zoomRequest, z.id != zoomID {
                zoomID = z.id
                animate(to: camera.zoomed(by: z.factor, anchorX: viewport.width / 2, anchorY: viewport.height / 2, viewport: viewport, bounds: bounds), duration: 0.3)
            }
            applyFramingRequests()
            if (renderer?.reveal ?? 0) >= 0.99, renderer?.isAnimating == true, link == nil {
                startLink()
            }
            if dirty { requestAsyncMetalRedraw() }
        }

        /// 展开和复位独立于推演刷新，命令可在地图静止时直接启动镜头。
        private func applyFramingRequests() {
            guard renderer != nil, viewport.width > 0, viewport.height > 0 else { return }
            if mapFrozenForSheet {
                if controller.unrollRequest != unrollID || controller.resetRequest != resetID {
                    pendingFlushAfterSheet = true
                }
                return
            }
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

        func stop() {
            sheetSettleWork?.cancel(); sheetSettleWork = nil
            link?.invalidate(); link = nil; appliedFrameRange = nil
            drift?.invalidate(); drift = nil
            mtk?.presentsWithTransaction = false
            weather.setPaused(true)
            effects.setPaused(true)
            container?.onLayout = nil
            container?.onWindowChange = nil
            mtk?.delegate = nil
            renderer?.releaseResources()
            renderer = nil
            controller.unregisterSync(owner: self)
        }

        private var drift: CADisplayLink?
        private var driftFrame = 0
        private func startDrift() {
            guard drift == nil, !controller.sheetOpen, !mapFrozenForSheet else { return }
            let proxy = WeakDisplayLinkProxy(owner: self) { [weak self] l in
                self?.driftStep(l)
            }
            let l = CADisplayLink(target: proxy, selector: #selector(WeakDisplayLinkProxy.tick(_:)))
            l.preferredFrameRateRange = CAFrameRateRange(minimum: 24, maximum: 36, preferred: 30)
            l.add(to: .main, forMode: .common); drift = l
        }
        private func driftStep(_ l: CADisplayLink) {
            guard controller.drifting else {
                drift?.invalidate(); drift = nil
                scheduleClearPresentsWithTransactionIfIdle()
                return
            }
            // 弹窗覆盖主页（新建世界/设置/卷宗等）或开卷主时钟正在绘制时，暂缓背景漂移，释放主线程与 GPU。
            if controller.sheetOpen || mapFrozenForSheet || (controller.revealClock != nil && !controller.revealDone) { return }
            driftFrame &+= 1
            let rawDt = l.targetTimestamp - l.timestamp
            let dt = rawDt.isFinite ? min(0.05, max(0.0, rawDt)) : (1.0 / 30.0)
            let prev = camera
            let next = prev.panned(dx: -3.0 * dt, dy: 0)
            // 绝大多数漂移帧走 O(visible) 纯平移快路径并与 Metal 同事务原子上屏；每 16 帧重排一次新入镜国名。
            set(next, skipLabels: false, fastPan: driftFrame % 16 != 0)
        }
    }
}

final class MapContainerView: UIView {
    var onLayout: (() -> Void)?
    var onWindowChange: ((Bool) -> Void)?
    override func layoutSubviews() { super.layoutSubviews(); onLayout?() }
    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        if newWindow == nil { onWindowChange?(false) }
    }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { onWindowChange?(true) }
    }
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
        /// 上次完整避让排版相对世界坐标投影点的偏移量（用于高速拖动时按世界坐标精确零漂移跟地定位）。
        var screenOffsetX: Double = 0
        var screenOffsetY: Double = 0
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
        visibleCacheValid = false
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
        visibleCacheValid = false
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
        // 保持王都双圈城徽（Metal cityIcons）与朱红都城名清晰纯粹，不再叠加与城圈撞位发糊的额外小印记。
        for s in stamps { s.view.removeFromSuperview() }
        stamps.removeAll(keepingCapacity: false)
        _ = map
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
    /// 4.2.6 零字符串分配快速签名比对：普通疆域易主跳过全城字符串拼接与 MapLayers.cityMarks 扫描。
    private var citySignature: (count: Int, nameHash: Int, capitals: [Int])?
    func setCities(map: WorldMap) {
        var hasher = Hasher()
        for c in map.meta.cities { hasher.combine(c.name) }
        let sig = (count: map.meta.cities.count, nameHash: hasher.finalize(), capitals: map.meta.nations.map(\.capital))
        if let old = citySignature, old.count == sig.count && old.nameHash == sig.nameHash && old.capitals == sig.capitals { return }
        citySignature = sig
        for l in cities { l.view.removeFromSuperview() }
        cities = Self.cityLabels(map)
        capitalCityLabels = cities.filter { $0.fill === Self.capitalInk }
        otherCityLabels = cities.filter { $0.fill !== Self.capitalInk }
        for l in cities { l.view.isHidden = true; insertSubview(l.view, at: 0) }
        visibleCacheValid = false
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

    /// 缓存 1pt 单位字宽测量结果，疆域易主重算国名盒时免去重复主线程 CoreText 排版开销。
    private static var emSizeCache: [String: CGSize] = [:]
    private static func measureEm(_ text: String) -> CGSize {
        if let hit = emSizeCache[text] { return hit }
        let measured = (text as NSString).size(withAttributes: [.font: font(1)])
        if emSizeCache.count > 512 { emSizeCache.removeAll(keepingCapacity: true) }
        emSizeCache[text] = measured
        return measured
    }

    private static func nationLabels(_ map: WorldMap, unit: Double, full: Bool) -> [Label] {
        map.meta.labels.filter { $0.nation >= 0 && map.meta.nations.indices.contains($0.nation) }.map { box in
            let n = map.meta.nations[box.nation]
            let shown = MapLayers.stateLabel(n.name, full: full)
            let measured = measureEm(shown)
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
            let measured = Self.measureEm(g.name)
            let size = MapLayers.labelFontSize(box: g.box, emWidth: Float(measured.width), emHeight: Float(measured.height))
            return Label(text: g.name, x: Double(g.box.x), y: Double(g.box.y), mapEm: Double(size) * unit, fill: .black, stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.75), strokeWidth: 6.0 / 64, minPoints: 4, province: nil)
        }.sorted { $0.mapEm > $1.mapEm }
        guard animated else { continueNames(fresh); return }
        fadeOut(nations, animated)
        nations = fresh
        visibleCacheValid = false
        fadeIn(nations, animated)
    }
    func setNations(map: WorldMap, animated: Bool = true) {
        let fresh = Self.nationLabels(map, unit: Double(MapLayers.fontUnit), full: fullNames)
        guard animated else { continueNames(fresh); return }
        fadeOut(nations, animated)
        nations = fresh
        visibleCacheValid = false
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
            guard let i = m.reuse, old.indices.contains(i) else {
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
        visibleCacheValid = false
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
    /// 字图缓存：严控上限 16MB 并在系统内存吃紧时自动清空，避免与建世/推演争抢真机内存。
    private static let images: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 1200
        c.totalCostLimit = 16 << 20
        NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { _ in
            c.removeAllObjects()
        }
        return c
    }()
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
        let safeSize = (size.isFinite && size > 0.5) ? min(128, size) : 12
        let font = font(safeSize), width = safeSize * max(0, strokeEm), pad = ceil(width / 2 + 2)
        let measured = (text as NSString).size(withAttributes: [.font: font])
        let cw = max(1, min(2048, ceil(measured.width + pad * 2)))
        let ch = max(1, min(2048, ceil(measured.height + pad * 2)))
        let canvas = CGSize(width: cw, height: ch)
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
    private var visibleLabels: [Label] = []
    private var visibleStamps: [MapStamp] = []
    private var visiblePictures: [Picture] = []
    private var visibleCacheValid = false
    private var isPanning = false
    private var panAccumulatedDistance: Double = 0
    private var panLastCamera: MapCamera?
    /// 字图换档：缓存里有就直接换；首帧最多同步绘制有限配额的主要国名，其余全部转后台串行光栅化后一次性补排，
    /// 彻底消除进入主页、点击读档或切图瞬间主线程同步绘制上百张毛笔描边字图引起的明显卡顿。
    private func resize(_ l: Label, to size: Double, syncBudget: inout Int) {
        let key = "\(l.text)|\(size)|\(l.fill.hashValue)|\(l.stroke.hashValue)" as NSString
        func apply(_ image: UIImage) { l.rendered = size; l.view.transform = .identity; l.view.image = image; l.view.bounds = CGRect(origin: .zero, size: image.size) }
        if let cached = Self.images.object(forKey: key) { apply(cached); return }
        if Self.legacy || ((l.rendered == 0 || l.view.image == nil) && (l.province == nil || syncBudget > 0)) {
            if l.province != nil { syncBudget -= 1 }
            let image = Self.render(l.text, size: CGFloat(size), fill: l.fill, stroke: l.stroke, strokeEm: CGFloat(l.strokeWidth))
            Self.store(image, key); apply(image); return
        }
        guard !rendering.contains(key) else { return }
        rendering.insert(key)
        let text = l.text, fill = l.fill, stroke = l.stroke, em = CGFloat(l.strokeWidth)
        Self.renderQueue.async { [weak self] in
            guard self != nil else { return }
            let image = Self.render(text, size: CGFloat(size), fill: fill, stroke: stroke, strokeEm: em)
            DispatchQueue.main.async { [weak self] in
                Self.store(image, key)
                guard let self else { return }
                self.rendering.remove(key)
                self.refreshSoon()
            }
        }
    }
    /// 后台字图画好后补排一次（同一轮里画好的合并成一次）；若正在平移则延迟至平移结束后自然补齐，绝不打断 60/120fps 跟手。
    private func refreshSoon() {
        guard !refreshQueued else { return }
        refreshQueued = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.refreshQueued = false
            guard !self.isPanning else { return }
            if let c = self.lastCamera { self.update(camera: c, viewport: self.lastViewport, mapRect: self.lastMapRect.isEmpty ? nil : self.lastMapRect) }
        }
    }

    /// 轻量纯平移快路径：仅遍历已缓存的当前可见标签（O(visible) ~0.04ms），直接在无动画 CATransaction 内写 `CALayer.position`（连续浮点零取整、零 UIKit 布局失效）；
    /// 若单次连续拖拽累计超过 0.45 倍屏宽，在同事务内顺滑补排一次新入镜边缘国家。
    func repositionVisible(camera: MapCamera, viewport: CGSize, mapRect: CGRect? = nil) {
        guard viewport.width.isFinite, viewport.height.isFinite, viewport.width > 0, viewport.height > 0, camera.isValid else { return }
        isPanning = true
        lastCamera = camera; lastViewport = viewport
        if let prev = panLastCamera, prev.isValid {
            let stepDx = (prev.centerX - camera.centerX) * camera.scale
            let stepDy = (prev.centerY - camera.centerY) * camera.scale
            if stepDx.isFinite && stepDy.isFinite {
                panAccumulatedDistance += hypot(stepDx, stepDy)
            }
        }
        panLastCamera = camera
        if panAccumulatedDistance > Double(viewport.width) * 0.45 {
            panAccumulatedDistance = 0
            update(camera: camera, viewport: viewport, mapRect: mapRect ?? (lastMapRect.isEmpty ? nil : lastMapRect))
            isPanning = true
            panLastCamera = camera
            return
        }
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        if visibleCacheValid {
            for s in visibleStamps {
                let p = camera.toScreen(x: s.x, y: s.y, viewport: vp)
                if p.x.isFinite && p.y.isFinite { s.view.layer.position = CGPoint(x: p.x, y: p.y) }
            }
            for p in visiblePictures {
                let at = camera.toScreen(x: p.x, y: p.y, viewport: vp)
                if at.x.isFinite && at.y.isFinite { p.view.layer.position = CGPoint(x: at.x, y: at.y) }
            }
            for l in visibleLabels {
                let at = camera.toScreen(x: l.x, y: l.anchorY ?? l.y, viewport: vp)
                let cx = at.x + l.screenOffsetX, cy = at.y + l.screenOffsetY
                if cx.isFinite && cy.isFinite { l.view.layer.position = CGPoint(x: cx, y: cy) }
            }
        } else {
            for s in stamps where !s.view.isHidden {
                let p = camera.toScreen(x: s.x, y: s.y, viewport: vp)
                if p.x.isFinite && p.y.isFinite { s.view.layer.position = CGPoint(x: p.x, y: p.y) }
            }
            for p in pictures where !p.view.isHidden {
                let at = camera.toScreen(x: p.x, y: p.y, viewport: vp)
                if at.x.isFinite && at.y.isFinite { p.view.layer.position = CGPoint(x: at.x, y: at.y) }
            }
            for l in custom where !l.view.isHidden {
                let at = camera.toScreen(x: l.x, y: l.y, viewport: vp)
                let cx = at.x + l.screenOffsetX, cy = at.y + l.screenOffsetY
                if cx.isFinite && cy.isFinite { l.view.layer.position = CGPoint(x: cx, y: cy) }
            }
            for l in nations where !l.view.isHidden {
                let at = camera.toScreen(x: l.x, y: l.y, viewport: vp)
                let cx = at.x + l.screenOffsetX, cy = at.y + l.screenOffsetY
                if cx.isFinite && cy.isFinite { l.view.layer.position = CGPoint(x: cx, y: cy) }
            }
            for l in cities where !l.view.isHidden {
                let at = camera.toScreen(x: l.x, y: l.anchorY ?? l.y, viewport: vp)
                let cx = at.x + l.screenOffsetX, cy = at.y + l.screenOffsetY
                if cx.isFinite && cy.isFinite { l.view.layer.position = CGPoint(x: cx, y: cy) }
            }
        }
    }

    /// 轻量纯平移快路径：主页背景 60fps 缓游期间直接平移可见标签与舆图罗盘／地标坐标，零网格分配、零碰撞重算。
    func panVisible(dx: CGFloat, dy: CGFloat) {
        guard dx.isFinite && dy.isFinite else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        if visibleCacheValid {
            for s in visibleStamps {
                let pos = s.view.layer.position
                s.view.layer.position = CGPoint(x: pos.x + dx, y: pos.y + dy)
            }
            for p in visiblePictures {
                let pos = p.view.layer.position
                p.view.layer.position = CGPoint(x: pos.x + dx, y: pos.y + dy)
            }
            for l in visibleLabels {
                let pos = l.view.layer.position
                l.view.layer.position = CGPoint(x: pos.x + dx, y: pos.y + dy)
            }
        } else {
            for s in stamps where !s.view.isHidden {
                let pos = s.view.layer.position
                s.view.layer.position = CGPoint(x: pos.x + dx, y: pos.y + dy)
            }
            for p in pictures where !p.view.isHidden {
                let pos = p.view.layer.position
                p.view.layer.position = CGPoint(x: pos.x + dx, y: pos.y + dy)
            }
            for l in custom where !l.view.isHidden {
                let pos = l.view.layer.position
                l.view.layer.position = CGPoint(x: pos.x + dx, y: pos.y + dy)
            }
            for l in nations where !l.view.isHidden {
                let pos = l.view.layer.position
                l.view.layer.position = CGPoint(x: pos.x + dx, y: pos.y + dy)
            }
            for l in cities where !l.view.isHidden {
                let pos = l.view.layer.position
                l.view.layer.position = CGPoint(x: pos.x + dx, y: pos.y + dy)
            }
        }
    }

    func update(camera: MapCamera, viewport: CGSize, mapRect: CGRect? = nil) {
        guard viewport.width.isFinite, viewport.height.isFinite, viewport.width > 0, viewport.height > 0, camera.isValid else { return }
        isPanning = false
        panAccumulatedDistance = 0
        panLastCamera = camera
        lastCamera = camera; lastViewport = viewport
        let innerMap = mapRect.flatMap { $0.isEmpty ? nil : $0 } ?? CGRect(origin: .zero, size: viewport)
        lastMapRect = innerMap
        let safeFallbackRect = innerMap.width > 12 && innerMap.height > 12 ? innerMap.insetBy(dx: 4, dy: 4) : innerMap
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        visibleLabels.removeAll(keepingCapacity: true)
        visibleStamps.removeAll(keepingCapacity: true)
        visiblePictures.removeAll(keepingCapacity: true)
        // 避让: the biggest names first; a name that would land on one already placed waits until the
        // player zooms in. One already showing gets a little slack, so names do not flicker at the limit.
        // 已占的框按屏幕网格分桶，只和附近的框比（以前每个名字与全部已排名字两两相比，几百个城名时每帧上万次）。
        var taken = [Box](); taken.reserveCapacity(nations.count + 64)
        var grid = [Int: [Int]]()
        let cell: CGFloat = 96
        func cells(_ b: Box, _ pad: CGFloat) -> [Int] {
            let r = b.reach * 1.6 + pad
            guard b.x.isFinite, b.y.isFinite, r.isFinite, r >= 0 else { return [] }
            let loX = max(-64.0, min(64.0, Double((b.x - r) / cell)))
            let hiX = max(loX, min(64.0, Double((b.x + r) / cell)))
            let loY = max(-64.0, min(64.0, Double((b.y - r) / cell)))
            let hiY = max(loY, min(64.0, Double((b.y + r) / cell)))
            let x0 = Int(loX), x1 = Int(hiX), y0 = Int(loY), y1 = Int(hiY)
            var out = [Int](); out.reserveCapacity((x1 - x0 + 1) * (y1 - y0 + 1))
            for x in x0...x1 { for y in y0...y1 { out.append(x &* 73_856_093 ^ y &* 19_349_663) } }
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
            guard targetW > 4, at.x.isFinite, at.y.isFinite, at.x > -Double(targetW), at.y > -Double(targetW), at.x < vp.width + Double(targetW), at.y < vp.height + Double(targetW) else {
                if !s.view.isHidden { s.view.isHidden = true }
                continue
            }
            let fade: CGFloat = s.minScale > 0 ? min(1, max(0, CGFloat((camera.scale - s.minScale) / 0.35))) : 1
            let baseW = max(1, s.view.bounds.width)
            let k = targetW / baseW
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            s.view.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k))
            s.view.layer.position = CGPoint(x: at.x, y: at.y)
            s.view.alpha = s.maxAlpha * fade
            s.view.isHidden = false
            CATransaction.commit()
            visibleStamps.append(s)
        }
        for p in pictures {
            let at = camera.toScreen(x: p.x, y: p.y, viewport: vp), w = p.width * camera.scale, size = p.view.bounds.width
            guard size > 0, w.isFinite, w > 2, at.x.isFinite, at.y.isFinite, at.x > -w, at.y > -w, at.x < vp.width + w, at.y < vp.height + w else { p.view.isHidden = true; continue }
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            p.view.layer.setAffineTransform(CGAffineTransform(rotationAngle: CGFloat(p.angle)).scaledBy(x: CGFloat(w / Double(size)), y: CGFloat(w / Double(size))))
            p.view.layer.position = CGPoint(x: at.x, y: at.y)
            p.view.isHidden = false
            CATransaction.commit()
            visiblePictures.append(p)
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
        // 大图性能优化：预计算世界坐标可视视锥，屏外标签零投影直接 O(1) 隐藏；且免除每帧合并 4 个大数组的内存分配。
        let invScale = 1.0 / max(0.001, camera.scale)
        let padX = 320.0 * invScale, padY = 140.0 * invScale
        let halfW = (vp.width * 0.5) * invScale + padX
        let halfH = (vp.height * 0.5) * invScale + padY
        let visMinX = camera.centerX - halfW, visMaxX = camera.centerX + halfW
        let visMinY = camera.centerY - halfH, visMaxY = camera.centerY + halfH
        var placedNationTexts = Set<String>()
        var syncBudget = 6
        func blockedByTextOnly(_ b: Box, margin: CGFloat) -> Bool {
            if Self.legacy { return taken.contains { !$0.text.isEmpty && Self.clash($0, b, margin: margin) } }
            for c in cells(b, margin) { for i in grid[c] ?? [] where !taken[i].text.isEmpty && Self.clash(taken[i], b, margin: margin) { return true } }
            return false
        }
        func layoutGroup(_ group: [Label]) {
        for l in group {
            // 视锥预剔除（多州大图 200+ 城池直接 O(1) 跳过屏外与远景极小城名）
            if l.x < visMinX || l.x > visMaxX || l.y < visMinY || l.y > visMaxY {
                if !l.view.isHidden { l.view.isHidden = true }
                continue
            }
            var points = l.mapEm * camera.scale * (l.province == nil ? nameScale : 1)
            let minimum = l.view.isHidden ? l.minPoints : l.minPoints * 0.88
            if points < l.floorPoints, points >= 4.5, l.anchorY != nil { points = l.floorPoints }
            if !points.isFinite || points < minimum || points >= 900 {
                if !l.view.isHidden { l.view.isHidden = true }
                continue
            }
            var p = camera.toScreen(x: l.x, y: l.y, viewport: vp)
            if let anchor = l.anchorY, points >= 4.5 {
                let at = camera.toScreen(x: l.x, y: anchor, viewport: vp)
                // Clear of its own rings as the layout sees them (their box, the slack a hidden name is asked
                // for, and half the name's height): 1.14 put the name a point too low and it hid itself.
                // 近看时（字号不必放大）名字原位也可能压在自身首都圈的占位框上而被隐藏：同样抬到圈外。
                let lift = max(ring, 3) + 3 + 7 + points * 0.78
                let aboveY = min(p.y, at.y - lift)
                p = (x: at.x, y: aboveY < Double(innerMap.minY) + points * 0.55 ? at.y + lift : aboveY)
            }
            guard p.x.isFinite, p.y.isFinite, p.x > -300, p.y > -120, p.x < vp.width + 300, p.y < vp.height + 120 else {
                if !l.view.isHidden { l.view.isHidden = true }
                continue
            }
            // Rendered at most 96 pt and scaled beyond: a label image never grows to thousands of pixels
            // (that ran memory out and closed the app when a big group label was zoomed in).
            let wanted = max(0.5, min(96, points))
            if l.rendered == 0 || wanted / l.rendered > 1.25 || wanted / l.rendered < 0.8 {
                // Sizes on a ×1.25 ladder, so the cached images are reused while zooming.
                resize(l, to: max(1, min(96, pow(1.25, (log(wanted) / log(1.25)).rounded()))), syncBudget: &syncBudget)
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
                    // 国名避让补救：优先在原腹地锚点略微缩字保位，再做极克制的小幅微移（杜绝把国名推越国界或推到海里）。
                    var placedFallback = false
                    let stepY = min(22.0, max(9.0, Double(box.halfH) * 0.95 + max(ring, 3) + 3))
                    let stepX = min(24.0, max(10.0, Double(box.halfW) * 0.24))
                    let tightShifts: [(Double, Double)] = [(0, -stepY), (0, stepY), (-stepX, 0), (stepX, 0)]
                    // 1) 原位轻缩 86% 最先尝试，确保锚点留在领土最深腹地
                    let mildK = k * 0.86
                    let mildBox = Box(x: CGFloat(p.x), y: CGFloat(p.y), halfW: image.width * mildK / 2, halfH: image.height * mildK / 2, cosine: box.cosine, sine: box.sine, nation: true, text: l.text)
                    if !blocked(mildBox, margin: 1) {
                        k = mildK; box = mildBox; placedFallback = true
                    }
                    // 2) 若原位仍被都城圈等遮挡，仅做单步紧邻微移
                    if !placedFallback {
                        for (dx, dy) in tightShifts {
                            let nx = p.x + dx, ny = p.y + dy
                            guard safeFallbackRect.contains(CGPoint(x: nx, y: ny)) else { continue }
                            let cand = Box(x: CGFloat(nx), y: CGFloat(ny), halfW: box.halfW, halfH: box.halfH, cosine: box.cosine, sine: box.sine, nation: true, text: l.text)
                            if !blocked(cand, margin: 1) {
                                box = cand; p = (x: nx, y: ny); placedFallback = true; break
                            }
                        }
                    }
                    // 3) 兜底确保主国名不会彻底消失：仅与文字防撞，缩至 78% 并紧贴原锚点
                    if !placedFallback && !placedNationTexts.contains(l.text) {
                        let shrunkK = k * 0.78
                        let sw = image.width * shrunkK / 2, sh = image.height * shrunkK / 2
                        let rescues: [(Double, Double)] = [(0, 0), (0, -stepY * 0.85), (0, stepY * 0.85)]
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
            let baseScreen = camera.toScreen(x: l.x, y: l.anchorY ?? l.y, viewport: vp)
            l.screenOffsetX = p.x - baseScreen.x
            l.screenOffsetY = p.y - baseScreen.y
            // 始终在无动画 CATransaction 内直接写回 CALayer transform 与连续浮点 position，杜绝 UIKit 布局失效与 SwiftUI 外层动画劫持。
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            l.view.layer.setAffineTransform(CGAffineTransform(rotationAngle: CGFloat(l.angle)).scaledBy(x: k, y: k))
            l.view.layer.position = CGPoint(x: p.x, y: p.y)
            CATransaction.commit()
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
            visibleLabels.append(l)
        }
        }
        layoutGroup(custom)
        layoutGroup(nations)
        layoutGroup(capitalNames)
        layoutGroup(otherCities)
        visibleCacheValid = true
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
    private static let lowFillColor = UIColor(red: 0.78, green: 0.18, blue: 0.14, alpha: 1).cgColor
    private static let midFillColor = UIColor(red: 0.85, green: 0.56, blue: 0.14, alpha: 1).cgColor
    private static let defaultFillColor = UIColor(red: 0.22, green: 0.58, blue: 0.36, alpha: 1).cgColor
    override init(frame: CGRect) { super.init(frame: frame); isUserInteractionEnabled = false }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    /// The army icons' size setting (推演与画面).
    var iconScale = 1.0
    var isEmpty: Bool { layers.isEmpty && bars.isEmpty }
    func clear() {
        guard !bars.isEmpty || !layers.isEmpty else { return }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        for (_, pair) in bars { pair.track.removeFromSuperlayer() }
        for (_, l) in layers { l.removeFromSuperlayer() }
        bars.removeAll(); layers.removeAll()
        CATransaction.commit()
    }
    /// 仅在大幅度放大近观时才显露纤细兵力条（不遮挡中远景舆图与军团棋子），并支持在设置中一键彻底关闭。
    func shows(_ camera: MapCamera) -> Bool { MapRenderer.iconPoints(camera.scale, iconScale: iconScale) >= 19.5 }
    func update(_ placed: [(sprite: MapRenderer.ArmySprite, x: Float, y: Float)], camera: MapCamera, viewport: CGSize, spread: [String: SIMD2<Float>] = [:]) {
        guard viewport.width.isFinite, viewport.height.isFinite, viewport.width > 0, viewport.height > 0, camera.isValid else { return }
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        // Icon size on screen (the renderer's icon size in map units × scale).
        let icon = MapRenderer.iconPoints(camera.scale, iconScale: iconScale)
        guard icon >= 19.5 else {
            if !isEmpty { clear() }
            return
        }
        var seenText = Set<String>(), seenBar = Set<String>()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let barW = min(22.0, max(14.0, icon * 0.78))
        let barH: Double = 2.6
        for p in placed where p.sprite.army > -100_000 {
            let key = p.sprite.key
            guard let ratio = ratios[key], ratio.isFinite, ratio > 0 else { continue }
            let s = camera.toScreen(x: Double(p.x), y: Double(p.y), viewport: vp)
            guard s.x.isFinite, s.y.isFinite, s.x > -40, s.y > -40, s.x < vp.width + 40, s.y < vp.height + 40 else { continue }
            let o = spread[key] ?? SIMD2<Float>(0, 0)
            let bx = s.x + Double(o.x) * icon
            let by = s.y + (Double(o.y) + 0.66) * icon
            guard bx.isFinite && by.isFinite else { continue }
            let pair = bars[key] ?? makeBar(key)
            let clamped = Double(min(1, max(0.04, ratio)))
            let h = p.sprite.fighting ? 3.2 : barH
            let targetBounds = CGRect(x: 0, y: 0, width: barW, height: h)
            if pair.track.bounds != targetBounds { pair.track.bounds = targetBounds }
            pair.track.position = CGPoint(x: bx, y: by)
            let targetFill = CGRect(x: 0, y: 0, width: barW * clamped, height: h)
            if pair.fill.frame != targetFill { pair.fill.frame = targetFill }
            if clamped < 0.25 {
                pair.fill.backgroundColor = Self.lowFillColor
            } else if clamped < 0.48 {
                pair.fill.backgroundColor = Self.midFillColor
            } else if let c = colors[key] {
                pair.fill.backgroundColor = UIColor(red: CGFloat(c.r), green: CGFloat(c.g), blue: CGFloat(c.b), alpha: 1).cgColor
            } else {
                pair.fill.backgroundColor = Self.defaultFillColor
            }
            seenBar.insert(key)

            // 超高倍近观且非交战时才浮现小号兵力数字，保持画面清透。
            if icon >= 22.5, !p.sprite.fighting, let text = texts[key] {
                let l = layers[key] ?? make(key)
                if (l.string as? String) != text {
                    l.string = text
                    let w = ceil((text as NSString).size(withAttributes: [.font: Self.font]).width) + 6
                    l.bounds = CGRect(x: 0, y: 0, width: w, height: 14)
                }
                l.position = CGPoint(x: bx, y: by + 8.5)
                seenText.insert(key)
            }
        }
        for (k, pair) in bars where !seenBar.contains(k) { pair.track.removeFromSuperlayer(); bars[k] = nil }
        for (k, l) in layers where !seenText.contains(k) { l.removeFromSuperlayer(); layers[k] = nil }
        CATransaction.commit()
    }
    private func makeBar(_ key: String) -> (track: CALayer, fill: CALayer) {
        let track = CALayer()
        track.backgroundColor = UIColor(red: 0.12, green: 0.09, blue: 0.07, alpha: 0.62).cgColor
        track.cornerRadius = 1.3; track.masksToBounds = true
        track.borderWidth = 0.45; track.borderColor = UIColor(red: 0.96, green: 0.93, blue: 0.86, alpha: 0.68).cgColor
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
