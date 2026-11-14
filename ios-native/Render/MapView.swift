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
    var relationsNation: Int?
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
    @Published var resetRequest = UUID()
    /// 地图展开: the camera draws back until the whole map is on screen.
    @Published var unrollRequest = UUID()
    /// The camera's scale now and the scale at which the whole map fits (CI checks the map can be unrolled).
    var cameraScale: (() -> (scale: Double, fit: Double))?
    /// Zoom by a factor around the screen centre (the + / − buttons).
    @Published var zoomRequest: (factor: Double, id: UUID)?
    /// Army icons and the selected army's remaining route, from the simulation (nil keeps the opening icons).
    @Published var armies: [MapRenderer.ArmySprite]?
    @Published var route: [SIMD2<Float>] = []
    @Published var selectedArmy: Int?
    /// A tapped fleet (index in the state's fleets); fleet sprites carry army −(index + 1).
    @Published var selectedFleet: Int?
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
    var onRevealClock: (() -> Void)?
    /// Battle losses to float over the map (map point, text, at sea).
    var onHits: (([(x: Float, y: Float, text: String, naval: Bool)]) -> Void)?
    func animateReveal(from: Float = 0, to: Float = 1, duration: Double, push: Bool = false) {
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
    /// State colours over the terrain: below full so mountains, forests and deserts show through.
    var colorDensity = 0.7
    /// Sea routes between harbours. Default on.
    var seaRoutes = true
    /// Scroll-edge darkening. Default on (IsEnableDarkBorder).
    var darkEdges = true
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
    /// Frames a second while the map is dragged or zoomed, while only the armies march, and for the
    /// looping effects (waves, battle marks, flags, arrows).
    var mapFPS = 60
    var marchFPS = 30
    var effectFPS = 30
    /// Pixels per point the map is drawn at (capped at the screen's own; the names stay sharp).
    var renderScale = 2.0
    /// The share of real time the simulation may keep a core busy, in percent.
    var simLoad = 65
    /// Lower the frames and rest the simulation when the phone runs hot or in Low Power Mode.
    var autoCool = true
    /// 可回退: the entry camera (eases out to the whole world) and the reveal's ease (else linear, as before).
    var introCamera = true
    var easeReveal = true
    /// Autosave while playing, seconds (0: off; pausing and leaving still save).
    var autosave = 120
    /// 大事暂停: a declaration of war, a rising or a state's end stops the clock.
    var pauseOnNews = false
    static let key = "playSettings.v1"
    init() {}
    private enum Keys: String, CodingKey { case showArmies, warArrows, iconScale, highFrameRate, mapFPS, marchFPS, effectFPS, renderScale, simLoad, autoCool, introCamera, easeReveal, autosave, pauseOnNews }
    // Every field is optional in a stored setting: older versions saved fewer (and a 高帧率 switch).
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        showArmies = try c.decodeIfPresent(Bool.self, forKey: .showArmies) ?? true
        warArrows = try c.decodeIfPresent(Bool.self, forKey: .warArrows) ?? true
        iconScale = try c.decodeIfPresent(Double.self, forKey: .iconScale) ?? 1
        mapFPS = try c.decodeIfPresent(Int.self, forKey: .mapFPS) ?? ((try c.decodeIfPresent(Bool.self, forKey: .highFrameRate)) == true ? 120 : 60)
        marchFPS = try c.decodeIfPresent(Int.self, forKey: .marchFPS) ?? 30
        effectFPS = try c.decodeIfPresent(Int.self, forKey: .effectFPS) ?? 30
        renderScale = try c.decodeIfPresent(Double.self, forKey: .renderScale) ?? 2
        simLoad = try c.decodeIfPresent(Int.self, forKey: .simLoad) ?? 65
        autoCool = try c.decodeIfPresent(Bool.self, forKey: .autoCool) ?? true
        introCamera = try c.decodeIfPresent(Bool.self, forKey: .introCamera) ?? true
        easeReveal = try c.decodeIfPresent(Bool.self, forKey: .easeReveal) ?? true
        autosave = try c.decodeIfPresent(Int.self, forKey: .autosave) ?? 120
        pauseOnNews = try c.decodeIfPresent(Bool.self, forKey: .pauseOnNews) ?? false
        // 1.12: the old 均衡 (marching at 60 frames, the simulation at 80 %) kept the phone hot; who had it
        // takes the new 均衡. A setting chosen one by one is left as it was.
        if mapFPS == 60 && marchFPS == 60 && effectFPS == 30 && renderScale == 2 && simLoad == 80 { marchFPS = 30; simLoad = 65 }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(showArmies, forKey: .showArmies); try c.encode(warArrows, forKey: .warArrows); try c.encode(iconScale, forKey: .iconScale)
        try c.encode(mapFPS, forKey: .mapFPS); try c.encode(marchFPS, forKey: .marchFPS); try c.encode(effectFPS, forKey: .effectFPS)
        try c.encode(renderScale, forKey: .renderScale); try c.encode(simLoad, forKey: .simLoad); try c.encode(autoCool, forKey: .autoCool)
        try c.encode(introCamera, forKey: .introCamera); try c.encode(easeReveal, forKey: .easeReveal)
        try c.encode(autosave, forKey: .autosave); try c.encode(pauseOnNews, forKey: .pauseOnNews)
    }
    /// 画面档位: 省电, 均衡, 流畅 (nil: the values were set one by one).
    static let presets: [(key: String, name: String, mapFPS: Int, marchFPS: Int, effectFPS: Int, renderScale: Double, simLoad: Int)] = [
        ("saver", "省电", 60, 30, 15, 1.5, 50), ("balanced", "均衡", 60, 30, 30, 2, 65), ("smooth", "流畅", 120, 120, 60, 3, 100),
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
        private var labels: MapLabelsView!
        private let effects = EffectsView()
        private let troops = TroopLabelsView()
        private var shownEffects = MapEffects()
        private var shownRevision = -1
        private var shownEditorRevision = 0
        private var shownViewLabels: [GroupLabel]?
        private let metrics = UILabel()
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
            mtk = MTKView(frame: .zero, device: MTLCreateSystemDefaultDevice())
            // Beyond the map: the paper of its mounting (#DED1C5).
            mtk.clearColor = MTLClearColor(red: 0.87, green: 0.82, blue: 0.77, alpha: 1)
            mtk.isPaused = true
            mtk.enableSetNeedsDisplay = true
            mtk.preferredFramesPerSecond = 120
            mtk.autoResizeDrawable = true
            // 地图清晰度 (default 2×): on a 3× screen the map (drawn with 4× multisampling) cost more than twice
            // the GPU work for no visible gain; the names and labels above it stay at full resolution.
            mtk.contentScaleFactor = min(UIScreen.main.scale, controller.play.renderScale)
            renderer = MapRenderer(view: mtk, map: map, parchmentURL: Bundle.main.url(forResource: "parchment", withExtension: "jpg", subdirectory: "World"),
                                   unitURL: { Bundle.main.url(forResource: "unit-\($0)", withExtension: "png", subdirectory: "World") })
            mtk.delegate = renderer
            renderer?.onDraw = { [weak self] t in self?.frameDrawn(t) }
            renderer?.onOutlines = { [weak self] in self?.startLink(); self?.mtk.setNeedsDisplay() }
            controller.onRevealClock = { [weak self] in self?.revealStarted() }
            controller.onHits = { [weak self] hits in
                guard let self, let renderer = self.renderer else { return }
                let size = self.mtk.bounds.size, vp = (width: Double(size.width), height: Double(size.height))
                for h in hits {
                    let s = renderer.camera.toScreen(x: Double(h.x), y: Double(h.y), viewport: vp)
                    guard s.x > 10, s.y > 60, s.x < vp.width - 10, s.y < vp.height - 60 else { continue }
                    self.effects.float(h.text, at: CGPoint(x: s.x, y: s.y - 18), naval: h.naval)
                }
            }
            labels = MapLabelsView(map: map)
            for v in [mtk!, labels!] as [UIView] { v.frame = container.bounds; v.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(v) }
            labels.isUserInteractionEnabled = false
            effects.frame = container.bounds; effects.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(effects)
            // Sea points for the waves: open-sea cell centres, thinned to a few thousand.
            var spots = [CGPoint]()
            let cells = map.cellCount, stride = max(1, cells / 3000)
            for c in Swift.stride(from: 0, to: cells, by: stride) where !map.isLand(c) && 2 * c + 1 < map.sites.count {
                spots.append(CGPoint(x: CGFloat(map.sites[2 * c]), y: CGFloat(map.sites[2 * c + 1])))
            }
            effects.seaSpots = spots
            effects.startWaves()
            troops.frame = container.bounds; troops.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(troops)
            controller.onSheet = { [weak self] in
                guard let self else { return }
                self.gliding = false
                self.link?.preferredFrameRateRange = self.frameRange
                self.mtk.preferredFramesPerSecond = self.controller.sheetOpen ? 30 : 120
            }
            controller.cameraScale = { [weak self] in
                guard let self else { return (0, 0) }
                return (self.camera.scale, self.bounds.lowerBound)
            }
            controller.nameFrame = { [weak self] in self?.labels?.nameFrame() ?? [:] }
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
            // Any new touch stops a fling or a camera animation, as in Maps.
            stopMotion(); return true
        }

        // MARK: camera

        private func layoutChanged() {
            guard let renderer, mtk.bounds.width > 0, mtk.bounds.height > 0 else { return }
            if !placed { renderer.camera = MapCamera.cover(map: mapSize, viewport: viewport); placed = true }
            set(renderer.camera)
        }
        private func set(_ camera: MapCamera) {
            guard let renderer else { return }
            let b = bounds
            var c = camera
            c.scale = min(b.upperBound, max(b.lowerBound, c.scale))
            renderer.camera = c.clamped(map: mapSize, viewport: viewport, margin: 0)
            labels.update(camera: renderer.camera, viewport: mtk.bounds.size)
            effects.update(camera: renderer.camera, viewport: mtk.bounds.size)
            updateTroops()
            placeSpot()
            mtk.setNeedsDisplay()
        }
        private func updateTroops() {
            guard let renderer else { return }
            // Zoomed out the banners carry no marks: skip collecting every army's position each frame.
            if !troops.shows(renderer.camera) && troops.isEmpty { return }
            troops.texts = controller.troopTexts
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
            if pinching { g.setTranslation(.zero, in: mtk); return }
            let t = g.translation(in: mtk)
            set(camera.panned(dx: Double(t.x), dy: Double(t.y)))
            g.setTranslation(.zero, in: mtk)
            if g.state == .ended {
                velocity = g.velocity(in: mtk)
                if hypot(velocity.x, velocity.y) > 60 { startLink() }
            }
        }
        @objc private func handlePinch(_ g: UIPinchGestureRecognizer) {
            let p = g.location(in: mtk)
            switch g.state {
            case .began: lastPinch = p; pinching = true
            case .changed:
                // A finger lifted or added moves the touch centre: re-anchor instead of jumping.
                if g.numberOfTouches != pinchTouches { pinchTouches = g.numberOfTouches; lastPinch = p; g.scale = 1; return }
                // The fingers both zoom and drag the map.
                let moved = camera.panned(dx: Double(p.x - lastPinch.x), dy: Double(p.y - lastPinch.y))
                set(moved.zoomed(by: Double(g.scale), anchorX: Double(p.x), anchorY: Double(p.y), viewport: viewport, bounds: bounds))
                g.scale = 1; lastPinch = p
            default: pinching = false; pinchTouches = 2
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
            guard g.state == .began, controller.pickPrompt == nil, controller.marchingArmy == nil, controller.marchingFleet == nil, controller.paintNation == nil, !controller.boxSelecting, !controller.terrainBrush else { return }
            let p = g.location(in: mtk), w = camera.toWorld(x: Double(p.x), y: Double(p.y), viewport: viewport)
            guard let cell = picker.cell(atX: Float(w.x), y: Float(w.y)), map.province[cell] >= 0 else { return }
            pressing = true
            impact.impactOccurred()
            controller.onLongPress?(Int(map.province[cell]), p)
        }
        @objc private func handleTap(_ g: UITapGestureRecognizer) {
            if pressing { return }
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
            // An army icon under the finger (14 points) takes the tap before the province.
            if controller.armies != nil, let placed = renderer?.placedSprites() {
                var best: (army: Int, d: Double)?
                for a in placed where a.sprite.army > -100_000 {
                    let s = camera.toScreen(x: Double(a.x), y: Double(a.y), viewport: viewport)
                    let d = hypot(s.x - Double(p.x), s.y - Double(p.y))
                    if d < 16, best == nil || d < best!.d { best = (a.sprite.army, d) }
                }
                if let best { selection.selectionChanged(); if best.army < 0 { controller.selectedFleet = -best.army - 1 } else { controller.selectedArmy = best.army }; return }
            }
            if province != controller.selectedProvince { selection.selectionChanged() }
            controller.selectedProvince = province
        }

        private func animate(to target: MapCamera, duration: Double = 0.38) {
            var t = target
            t.scale = min(bounds.upperBound, max(bounds.lowerBound, t.scale))
            animation = (camera, t.clamped(map: mapSize, viewport: viewport, margin: 0), CACurrentMediaTime(), duration)
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
        private var appliedPlay: PlaySettings?
        private func pace(_ l: CADisplayLink, glide: Bool) {
            guard glide != gliding else { return }
            gliding = glide
            l.preferredFrameRateRange = glide ? glideRange : frameRange
        }
        /// A reveal clock began: the map follows it frame by frame; with `push` the camera eases in from afar.
        private func revealStarted() {
            if let c = controller.revealClock, c.push, renderer != nil {
                let target = camera
                var from = target; from.scale = target.scale * 1.25
                set(from)
                animate(to: target, duration: c.duration * 1.1)
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
            pace(l, glide: animation == nil && hypot(velocity.x, velocity.y) <= 8)
            if let a = animation {
                let x = min(1, (CACurrentMediaTime() - a.start) / a.duration)
                let eased = x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
                set(MapCamera.interpolate(a.from, a.to, eased))
                if x >= 1 { animation = nil }
            } else if hypot(velocity.x, velocity.y) > 8 {
                // Exponential deceleration close to UIScrollView's normal rate.
                set(camera.panned(dx: Double(velocity.x) * dt, dy: Double(velocity.y) * dt))
                let decay = CGFloat(pow(0.998, dt * 1000))
                velocity = CGPoint(x: velocity.x * decay, y: velocity.y * decay)
            } else if renderer?.isAnimating == true {
                velocity = .zero
                updateTroops()
                mtk.setNeedsDisplay()
            } else if !revealing {
                velocity = .zero
                mtk.setNeedsDisplay()
                link?.invalidate(); link = nil
            }
        }

        // MARK: SwiftUI → map

        func sync() {
            if controller.worldRevision != shownRevision, let next = controller.world, next.meta.provinces.map(\.nation) != map.meta.provinces.map(\.nation) || next.meta.labels.count != map.meta.labels.count
                || zip(next.meta.labels, map.meta.labels).contains(where: { p in p.0.nation != p.1.nation || p.0.x != p.1.x || p.0.y != p.1.y })
                || next.meta.nations.count != map.meta.nations.count || zip(next.meta.nations, map.meta.nations).contains(where: { $0.0.name != $0.1.name || $0.0.color != $0.1.color }) {
                shownRevision = controller.worldRevision
                map = next
                renderer?.setMap(next)
                // City names never change hands with a province: only the state names are rebuilt.
                labels.setCities(map: next)
                // Daily border changes swap the names in place; only a view switch cross-fades.
                if let groups = controller.viewLabels { labels.setGroups(groups, animated: false) } else { labels.setNations(map: next, animated: false) }
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size) }
                mtk.setNeedsDisplay()
            }
            // While a reveal clock runs the display link draws it; the published value is only coarse.
            if controller.revealClock != nil && !controller.revealDone && link == nil { startLink() }
            if controller.revealClock == nil {
                if let renderer, renderer.reveal != controller.reveal { renderer.setReveal(controller.reveal) }
                // Names ink in last, with the cities.
                labels?.alpha = CGFloat(max(0, min(1, (controller.reveal - 0.85) / 0.15)))
                effects.alpha = CGFloat(max(0, min(1, (controller.reveal - 0.9) / 0.1)))
            }
            mtk?.isUserInteractionEnabled = controller.interactive
            if controller.drifting { startDrift() }
            // No sea waves behind the title (they kept spawning animated layers over the drifting map).
            if controller.drifting { effects.stopWaves() } else if controller.reveal >= 1 { effects.startWaves() }
            renderer?.setAppearance(mode: controller.mode, highlight: controller.selectedProvince, tint: controller.relations.mapValues { RGB(hex: $0) }, fills: controller.viewFills)
            if controller.worldRevision != shownRevision { shownRevision = controller.worldRevision }
            if controller.editorRevision != shownEditorRevision, let next = controller.editorMap {
                shownEditorRevision = controller.editorRevision
                map = next
                renderer?.setTerrain(next, refreshSea: controller.editorSeaDirty)
                controller.editorSeaDirty = false
                labels.setNations(map: next, animated: false)
                labels.setCities(map: next)
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size) }
                mtk.setNeedsDisplay()
            }
            if let armies = controller.armies {
                // Playing: glide linearly over one step so marching does not pulse; a single move eases.
                renderer?.tweenDuration = controller.tween
                renderer?.tweenEase = controller.tween <= 0.3
                renderer?.setArmies(armies, route: controller.route, snap: controller.snapArmies)
                controller.snapArmies = false
                updateTroops()
                if renderer?.isAnimating == true { startLink() }
            }
            if controller.viewLabels != shownViewLabels {
                let animated = controller.viewLabels?.map(\.name) != shownViewLabels?.map(\.name)
                shownViewLabels = controller.viewLabels
                if let groups = shownViewLabels { labels.setGroups(groups, animated: animated) } else { labels.setNations(map: map, animated: animated) }
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size) }
            }
            if controller.effects != shownEffects { shownEffects = controller.effects; effects.set(shownEffects); effects.alpha = controller.reveal >= 1 ? 1 : 0 }
            labels?.setSelected(controller.selectedProvince)
            if let renderer {
                var wide = Set<Int>()
                if let n = controller.relationsNation { wide.insert(n) }
                if let p = controller.selectedProvince, map.meta.provinces.indices.contains(p) {
                    let owner = map.meta.provinces[p].nation
                    if owner >= 0 { wide.insert(owner) }
                }
                renderer.setBorderEmphasis(wide)
            }
            if let renderer {
                renderer.showArmies = controller.play.showArmies
                renderer.iconScale = Float(controller.play.iconScale)
                effects.showArrows = controller.play.warArrows
                troops.iconScale = controller.play.iconScale
                if mtk.preferredFramesPerSecond > 30 { mtk.preferredFramesPerSecond = controller.play.mapFPS }
                // 画面 settings: the simulation's share, cooling, the effects' frames and the map's pixels.
                Energy.autoCool = controller.play.autoCool
                Energy.load = Double(controller.play.simLoad) / 100
                EffectsView.fps = controller.play.effectFPS
                let scale = min(UIScreen.main.scale, controller.play.renderScale)
                if mtk.contentScaleFactor != scale { mtk.contentScaleFactor = scale; mtk.setNeedsDisplay() }
                if controller.play != appliedPlay {
                    appliedPlay = controller.play
                    gliding = false; link?.preferredFrameRateRange = frameRange
                }
            }
            if let renderer, renderer.display != controller.display {
                let oceanChanged = renderer.display.ocean != controller.display.ocean
                renderer.setDisplay(controller.display)
                mtk.setNeedsDisplay()
            }
            if renderer?.setSeaPorts(controller.seaPorts) == true { mtk.setNeedsDisplay() }
            if renderer?.setForts(controller.forts, holy: controller.holy) == true { mtk.setNeedsDisplay() }
            if labels.setCustom(controller.customLabels) { mtk.setNeedsDisplay() }
            if labels.setImages(controller.customImages) { mtk.setNeedsDisplay() }
            if renderer?.setExtraRivers(controller.customRivers) == true { mtk.setNeedsDisplay() }
            if labels.nameScale != controller.display.nationNameScale || labels.fullNames != controller.display.fullNationNames {
                labels.nameScale = controller.display.nationNameScale
                let namesChanged = labels.fullNames != controller.display.fullNationNames
                labels.fullNames = controller.display.fullNationNames
                if namesChanged, controller.viewLabels == nil { labels.setNations(map: map, animated: false) }
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size) }
            }
            if let labels, labels.showCities != controller.display.cityNames {
                labels.showCities = controller.display.cityNames
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size) }
            }
            metrics.isHidden = !controller.showMetrics
            if let f = controller.focus, f.id != focusID {
                focusID = f.id
                let p = map.meta.provinces[f.province]
                animate(to: MapCamera(centerX: Double(p.x), centerY: Double(p.y), scale: max(camera.scale, bounds.lowerBound * 4)), duration: 0.5)
            }
            if let f = controller.focusPoint, f.id != focusPointID {
                focusPointID = f.id
                let scale = max(camera.scale, bounds.lowerBound * 7)
                // The sheet covers the lower part of the screen: the unit sits in the upper third.
                animate(to: MapCamera(centerX: f.x, centerY: f.y + Double(viewport.height) * 0.2 / scale, scale: scale), duration: 0.55)
            }
            if let s = controller.spotlight, s.id != spotlightID {
                spotlightID = s.id
                // The sheet (dropped to its lowest stop) covers the lower part: the place sits at 30 % from the top.
                animate(to: MapCamera.spotlight(x: s.x, y: s.y, from: camera, map: mapSize, viewport: viewport), duration: 0.75)
                showSpot(x: s.x, y: s.y)
            }
            if let z = controller.zoomRequest, z.id != zoomID {
                zoomID = z.id
                animate(to: camera.zoomed(by: z.factor, anchorX: viewport.width / 2, anchorY: viewport.height / 2, viewport: viewport, bounds: bounds), duration: 0.3)
            }
            if controller.unrollRequest != unrollID {
                unrollID = controller.unrollRequest
                animate(to: MapCamera.fit(map: mapSize, viewport: viewport), duration: 0.6)
            }
            if controller.resetRequest != resetID {
                resetID = controller.resetRequest
                animate(to: MapCamera.cover(map: mapSize, viewport: viewport), duration: 0.45)
            }
            mtk?.setNeedsDisplay()
        }

        private func frameDrawn(_ t: CFTimeInterval) {
            if lastFrame > 0, t - lastFrame < 0.25 { stats.record(seconds: t - lastFrame) }
            lastFrame = t
            if !metrics.isHidden, t - lastReport > 0.5 {
                lastReport = t
                metrics.text = String(format: "  平均 %.2f ms · 1%% low %.0f fps  \n  绘制间隔（按需重绘，非 GPU 耗时）  ", stats.averageMilliseconds, stats.onePercentLow)
                    + (controller.simText.isEmpty ? "" : "\n" + controller.simText)
            }
        }

        func stop() { link?.invalidate(); link = nil; drift?.invalidate(); drift = nil; effects.stopWaves() }

        private var drift: CADisplayLink?
        private func startDrift() {
            guard drift == nil else { return }
            let l = CADisplayLink(target: self, selector: #selector(driftStep(_:)))
            // The title backdrop drifts three points a second (eight read as hurried): at that pace
            // twenty frames are as smooth to the eye and cost a third of the redraws of sixty.
            l.preferredFrameRateRange = CAFrameRateRange(minimum: 15, maximum: 24, preferred: 20)
            l.add(to: .main, forMode: .common); drift = l
        }
        @objc private func driftStep(_ l: CADisplayLink) {
            guard controller.drifting else { drift?.invalidate(); drift = nil; return }
            set(camera.panned(dx: -3 * (l.targetTimestamp - l.timestamp), dy: 0))
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

    static func font(_ size: CGFloat) -> UIFont { UIFont(name: fontName, size: size) ?? .systemFont(ofSize: size, weight: .semibold) }

    init(map: WorldMap) {
        super.init(frame: .zero)
        let unit = Double(MapLayers.fontUnit)
        nations = Self.nationLabels(map, unit: unit, full: true)
        cities = Self.cityLabels(map)
        for l in cities + nations { l.view.isHidden = true; addSubview(l.view) }
        setSeals(map)
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
        for l in cities { l.view.isHidden = true; insertSubview(l.view, at: 0) }
        setSeals(map)
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
            let l = Label(text: shown, x: Double(box.x), y: Double(box.y), mapEm: Double(size) * unit, fill: .black, stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.75), strokeWidth: 6.0 / 64, minPoints: 4, province: nil)
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
    private static let images: NSCache<NSString, UIImage> = { let c = NSCache<NSString, UIImage>(); c.countLimit = 500; return c }()

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

    func update(camera: MapCamera, viewport: CGSize) {
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        // 避让: the biggest names first; a name that would land on one already placed waits until the
        // player zooms in. One already showing gets a little slack, so names do not flicker at the limit.
        var taken = [Box](); taken.reserveCapacity(nations.count + 64)
        for p in pictures {
            let at = camera.toScreen(x: p.x, y: p.y, viewport: vp), w = p.width * camera.scale, size = p.view.bounds.width
            guard size > 0, w > 2, at.x > -w, at.y > -w, at.x < vp.width + w, at.y < vp.height + w else { p.view.isHidden = true; continue }
            p.view.transform = CGAffineTransform(rotationAngle: CGFloat(p.angle)).scaledBy(x: CGFloat(w / Double(size)), y: CGFloat(w / Double(size)))
            p.view.center = CGPoint(x: at.x, y: at.y); p.view.isHidden = false
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
                taken.append(Box(x: CGFloat(p.x), y: CGFloat(p.y), halfW: half, halfH: half, cosine: 1, sine: 0, nation: false, text: ""))
            }
        }
        let capitalNames = showCities ? cities.filter { $0.fill === Self.capitalInk } : []
        let otherCities = showCities ? cities.filter { $0.fill !== Self.capitalInk } : []
        // Enlarged capital names (the map seen from afar) give way to the state names; at their own size
        // (close up) they come first, as before.
        let enlarged = capitalNames.first.map { $0.mapEm * camera.scale < $0.floorPoints } ?? false
        let order = enlarged ? custom + nations + capitalNames + otherCities : custom + capitalNames + nations + otherCities
        for l in order {
            var points = l.mapEm * camera.scale * (l.province == nil ? nameScale : 1)
            var p = camera.toScreen(x: l.x, y: l.y, viewport: vp)
            if points < l.floorPoints, points >= 4.5, let anchor = l.anchorY {
                points = l.floorPoints
                let at = camera.toScreen(x: l.x, y: anchor, viewport: vp)
                p = (x: at.x, y: at.y - (max(ring, 3) + 4 + points * 0.62))
            }
            // A name larger than the screen can show is hidden (a continent-wide group zoomed in close).
            guard points.isFinite, points >= l.minPoints, points < 900, p.x > -300, p.y > -120, p.x < vp.width + 300, p.y < vp.height + 120 else { l.view.isHidden = true; continue }
            // Rendered at most 96 pt and scaled beyond: a label image never grows to thousands of pixels
            // (that ran memory out and closed the app when a big group label was zoomed in).
            let wanted = min(96, points)
            if l.rendered == 0 || wanted / l.rendered > 1.25 || wanted / l.rendered < 0.8 {
                // Sizes on a ×1.25 ladder, so the cached images are reused while zooming.
                l.rendered = min(96, pow(1.25, (log(wanted) / log(1.25)).rounded()))
                l.view.transform = .identity
                let key = "\(l.text)|\(l.rendered)|\(l.fill.hashValue)|\(l.stroke.hashValue)" as NSString
                if let cached = Self.images.object(forKey: key) { l.view.image = cached }
                else { let image = Self.render(l.text, size: CGFloat(l.rendered), fill: l.fill, stroke: l.stroke, strokeEm: CGFloat(l.strokeWidth)); Self.images.setObject(image, forKey: key); l.view.image = image }
                l.view.sizeToFit()
            }
            let k = CGFloat(points / l.rendered), image = l.view.image?.size ?? .zero
            let box = Box(x: CGFloat(p.x), y: CGFloat(p.y), halfW: image.width * k / 2, halfH: image.height * k / 2, cosine: CGFloat(cos(l.angle)), sine: CGFloat(sin(l.angle)), nation: l.province == nil, text: l.text)
            let margin: CGFloat = l.view.isHidden ? 6 : 0
            if taken.contains(where: { Self.clash($0, box, margin: margin) }) { l.view.isHidden = true; continue }
            taken.append(box)
            l.view.transform = CGAffineTransform(rotationAngle: CGFloat(l.angle)).scaledBy(x: k, y: k)
            l.view.center = CGPoint(x: p.x, y: p.y)
            if l.view.isHidden {
                // A name that gave way comes back softly.
                l.view.isHidden = false; l.view.alpha = 0
                if l.province == nil { Self.namesFadedIn += 1 }
                UIView.animate(withDuration: 0.22, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) { l.view.alpha = 1 }
            }
        }
    }
}

/// Troop and ship counts under the icons once the map is zoomed in (the original shows unit
/// strength up close); they follow the icons while they glide.
final class TroopLabelsView: UIView {
    var texts: [String: String] = [:]
    private var layers = [String: CATextLayer]()
    private static let font = UIFont(name: "TW-Kai-98_1", size: 11) ?? .systemFont(ofSize: 11, weight: .semibold)
    override init(frame: CGRect) { super.init(frame: frame); isUserInteractionEnabled = false }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    /// The army icons' size setting (推演与画面).
    var iconScale = 1.0
    var isEmpty: Bool { layers.isEmpty }
    /// Whether banners are large enough at this zoom to carry a mark.
    func shows(_ camera: MapCamera) -> Bool { 2.56 * 0.84 * 0.35 * (1600.0 / 240.0) * 0.6 * iconScale * max(camera.scale, 14.0 / 3.01) >= 22 }
    func update(_ placed: [(sprite: MapRenderer.ArmySprite, x: Float, y: Float)], camera: MapCamera, viewport: CGSize, spread: [String: SIMD2<Float>] = [:]) {
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        // Icon size on screen (the renderer's icon size in map units × scale).
        let icon = 2.56 * 0.84 * 0.35 * (1600.0 / 240.0) * 0.6 * iconScale * max(camera.scale, 14.0 / 3.01)
        var seen = Set<String>()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        // Banner marks only when the banner is big enough to carry a character.
        if icon >= 22 {
            for p in placed where p.sprite.army > -100_000 {
                guard let text = texts[p.sprite.key] else { continue }
                let s = camera.toScreen(x: Double(p.x), y: Double(p.y), viewport: vp)
                guard s.x > -40, s.y > -40, s.x < vp.width + 40, s.y < vp.height + 40 else { continue }
                let l = layers[p.sprite.key] ?? make(p.sprite.key)
                if (l.string as? String) != text {
                    l.string = text
                    let w = ceil((text as NSString).size(withAttributes: [.font: Self.font]).width) + 6
                    l.bounds = CGRect(x: 0, y: 0, width: w, height: 15)
                }
                // Under the plaque (rebuildArmies: the plaque sits 0.16 below the point, half an icon tall),
                // following the army's seat in a ring of armies on one spot.
                let o = spread[p.sprite.key] ?? SIMD2<Float>(0, 0)
                l.position = CGPoint(x: s.x + Double(o.x) * icon, y: s.y + (Double(o.y) + 0.78) * icon)
                seen.insert(p.sprite.key)
            }
        }
        for (k, l) in layers where !seen.contains(k) { l.removeFromSuperlayer(); layers[k] = nil }
        CATransaction.commit()
    }
    private func make(_ key: String) -> CATextLayer {
        let l = CATextLayer()
        l.font = Self.font; l.fontSize = 11; l.alignmentMode = .center; l.contentsScale = UIScreen.main.scale
        // A paper-white character with an ink shadow, written on the flag.
        l.foregroundColor = UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 1).cgColor
        l.shadowColor = UIColor(white: 0.05, alpha: 1).cgColor; l.shadowOpacity = 0.9; l.shadowRadius = 1.2; l.shadowOffset = .zero
        // Rasterized once: these labels move with their armies every frame, and a live text shadow
        // was re-rendered offscreen each time (a cause of dropped frames while playing).
        l.shouldRasterize = true; l.rasterizationScale = UIScreen.main.scale
        layer.addSublayer(l); layers[key] = l
        return l
    }
}
