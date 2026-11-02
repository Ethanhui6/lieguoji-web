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
    /// 显示设置 (web 0.5.40 map display options), kept between launches.
    @Published var display = DisplaySettings.load() { didSet { display.save() } }
    /// Province to fly to; the id makes repeated requests for the same province animate again.
    @Published var focus: (province: Int, id: UUID)?
    @Published var resetRequest = UUID()
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
    /// A fleet waiting for its port: the next province tap is its destination.
    @Published var marchingFleet: Int?
    /// 绘制疆域: provinces tapped or dragged over go to this state.
    @Published var paintNation: Int?
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
    /// A sheet covers the map: it redraws at 30 frames a second.
    var sheetOpen = false { didSet { onSheet?() } }
    var onSheet: (() -> Void)?
    var onFleetTarget: ((Int) -> Void)?
    /// Generation reveal (title screen), 0…1; labels and markers appear at 1.
    @Published var reveal: Float = 1
    /// Title screen: the map is a backdrop and takes no gestures.
    @Published var interactive = true
    /// Slow drift of the title backdrop.
    @Published var drifting = false
    func fly(to province: Int) { focus = (province, UUID()) }
    /// Flies to a map point and zooms in (an army or fleet), the point above the sheet.
    @Published var focusPoint: (x: Double, y: Double, id: UUID)?
    func fly(x: Double, y: Double) { focusPoint = (x, y, UUID()) }
    func zoom(_ factor: Double) { zoomRequest = (factor, UUID()) }
}

/// Map display options: state borders, province lines, city names and icons, vegetation and
/// relief ornaments, and how strongly state colours cover the land (1 = the original look).
struct DisplaySettings: Codable, Equatable {
    var borders = true
    var provinceLines = true
    var cityNames = true
    var cityIcons = true
    var vegetation = true
    /// State colours over the terrain: below full so mountains, forests and deserts show through.
    var colorDensity = 0.7
    static let key = "displaySettings.v1"
    static func load() -> DisplaySettings {
        guard let data = UserDefaults.standard.data(forKey: key), let v = try? JSONDecoder().decode(DisplaySettings.self, from: data) else { return DisplaySettings() }
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
        private let selection = UISelectionFeedbackGenerator()
        private let impact = UIImpactFeedbackGenerator(style: .light)

        init(map: WorldMap, controller: MapController) {
            self.map = map; self.controller = controller; picker = CellPicker(map: map)
            super.init()
            resetID = controller.resetRequest
        }

        var mapSize: (width: Double, height: Double) { (Double(map.width), Double(map.height)) }
        var viewport: (width: Double, height: Double) { (Double(mtk.bounds.width), Double(mtk.bounds.height)) }
        var bounds: ClosedRange<Double> { MapCamera.scaleBounds(map: mapSize, viewport: viewport) }

        func build() -> MapContainerView {
            container = MapContainerView()
            mtk = MTKView(frame: .zero, device: MTLCreateSystemDefaultDevice())
            mtk.clearColor = MTLClearColor(red: 0x52 / 255.0, green: 0x7C / 255.0, blue: 0x86 / 255.0, alpha: 1)
            mtk.isPaused = true
            mtk.enableSetNeedsDisplay = true
            mtk.preferredFramesPerSecond = 120
            mtk.autoResizeDrawable = true
            renderer = MapRenderer(view: mtk, map: map, parchmentURL: Bundle.main.url(forResource: "parchment", withExtension: "jpg", subdirectory: "World"),
                                   unitURL: { Bundle.main.url(forResource: "unit-\($0)", withExtension: "png", subdirectory: "World") })
            mtk.delegate = renderer
            renderer?.onDraw = { [weak self] t in self?.frameDrawn(t) }
            renderer?.onOutlines = { [weak self] in self?.mtk.setNeedsDisplay() }
            labels = MapLabelsView(map: map)
            for v in [mtk!, labels!] as [UIView] { v.frame = container.bounds; v.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(v) }
            labels.isUserInteractionEnabled = false
            effects.frame = container.bounds; effects.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(effects)
            troops.frame = container.bounds; troops.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(troops)
            controller.onSheet = { [weak self] in
                guard let self else { return }
                self.link?.preferredFrameRateRange = self.frameRange
                self.mtk.preferredFramesPerSecond = self.controller.sheetOpen ? 30 : 120
            }
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
                                         metrics.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor, constant: -16)])
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
            for g in [pan, pinch, double, twoFinger, tap] as [UIGestureRecognizer] { g.delegate = self; mtk.addGestureRecognizer(g) }
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
            renderer.camera = c.clamped(map: mapSize, viewport: viewport)
            labels.update(camera: renderer.camera, viewport: mtk.bounds.size)
            effects.update(camera: renderer.camera, viewport: mtk.bounds.size)
            updateTroops()
            mtk.setNeedsDisplay()
        }
        private func updateTroops() {
            guard let renderer else { return }
            troops.texts = controller.troopTexts
            troops.update(renderer.placedSprites(), camera: renderer.camera, viewport: mtk.bounds.size)
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
        @objc private func handleTap(_ g: UITapGestureRecognizer) {
            let p = g.location(in: mtk), w = camera.toWorld(x: Double(p.x), y: Double(p.y), viewport: viewport)
            if controller.terrainBrush { controller.onTerrainStroke?(w.x, w.y); controller.onTerrainStrokeEnd?(); return }
            var province: Int?
            if let cell = picker.cell(atX: Float(w.x), y: Float(w.y)), map.province[cell] >= 0 { province = Int(map.province[cell]) }
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
            animation = (camera, t.clamped(map: mapSize, viewport: viewport), CACurrentMediaTime(), duration)
            velocity = .zero
            startLink()
        }
        private func stopMotion() { velocity = .zero; animation = nil }
        private func startLink() {
            guard link == nil else { return }
            let l = CADisplayLink(target: self, selector: #selector(step(_:)))
            l.preferredFrameRateRange = frameRange
            l.add(to: .main, forMode: .common); link = l
        }
        private var frameRange: CAFrameRateRange {
            controller.sheetOpen ? CAFrameRateRange(minimum: 15, maximum: 30, preferred: 30) : CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        }
        @objc private func step(_ l: CADisplayLink) {
            let dt = min(0.05, l.targetTimestamp - l.timestamp)
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
            } else {
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
            if let renderer, renderer.reveal != controller.reveal { renderer.setReveal(controller.reveal) }
            // Names ink in last, with the cities.
            labels?.alpha = CGFloat(max(0, min(1, (controller.reveal - 0.85) / 0.15)))
            mtk?.isUserInteractionEnabled = controller.interactive
            if controller.drifting { startDrift() }
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
                renderer?.setArmies(armies, route: controller.route)
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
            if let renderer, renderer.display != controller.display { renderer.setDisplay(controller.display); mtk.setNeedsDisplay() }
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
            if let z = controller.zoomRequest, z.id != zoomID {
                zoomID = z.id
                animate(to: camera.zoomed(by: z.factor, anchorX: viewport.width / 2, anchorY: viewport.height / 2, viewport: viewport, bounds: bounds), duration: 0.3)
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
            }
        }

        func stop() { link?.invalidate(); link = nil; drift?.invalidate(); drift = nil }

        private var drift: CADisplayLink?
        private func startDrift() {
            guard drift == nil else { return }
            let l = CADisplayLink(target: self, selector: #selector(driftStep(_:)))
            l.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
            l.add(to: .main, forMode: .common); drift = l
        }
        @objc private func driftStep(_ l: CADisplayLink) {
            guard controller.drifting else { drift?.invalidate(); drift = nil; return }
            set(camera.panned(dx: -8 * (l.targetTimestamp - l.timestamp), dy: 0))
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
        let text: String, x: Double, y: Double, mapEm: Double, fill: UIColor, stroke: UIColor, strokeWidth: Double, minPoints: Double, province: Int?
        var rendered: Double = 0
        init(text: String, x: Double, y: Double, mapEm: Double, fill: UIColor, stroke: UIColor, strokeWidth: Double, minPoints: Double, province: Int?) {
            self.text = text; self.x = x; self.y = y; self.mapEm = mapEm; self.fill = fill; self.stroke = stroke; self.strokeWidth = strokeWidth; self.minPoints = minPoints; self.province = province
        }
    }
    private var nations: [Label] = []
    private var cities: [Label] = []

    static func font(_ size: CGFloat) -> UIFont { UIFont(name: fontName, size: size) ?? .systemFont(ofSize: size, weight: .semibold) }

    init(map: WorldMap) {
        super.init(frame: .zero)
        let unit = Double(MapLayers.fontUnit)
        nations = Self.nationLabels(map, unit: unit)
        cities = Self.cityLabels(map)
        for l in cities + nations { l.view.isHidden = true; addSubview(l.view) }
    }
    private static func cityLabels(_ map: WorldMap) -> [Label] {
        let capitals = Set(map.meta.nations.compactMap { map.meta.cities.indices.contains($0.capital) ? map.meta.cities[$0.capital].id : nil })
        return map.meta.cities.filter { !$0.name.isEmpty }.map { c in
            let s = capitals.contains(c.id) ? 1.5 : 1.0, em = 64 * 0.13 * s / 10 * (1600.0 / 240.0), offset = 0.7 * s * (1600.0 / 240.0)
            return Label(text: c.name, x: Double(c.x), y: Double(c.y) - offset, mapEm: em, fill: UIColor(white: 0x11 / 255.0, alpha: 1),
                         stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.7), strokeWidth: 6.0 / 64, minPoints: 8, province: c.province)
        }
    }
    /// The cities changed (a preview replaced by the founded world, whose cities have names): rebuild them.
    private var cityKey = ""
    func setCities(map: WorldMap) {
        let key = map.meta.cities.map(\.name).joined(separator: "|")
        guard key != cityKey else { return }
        cityKey = key
        for l in cities { l.view.removeFromSuperview() }
        cities = Self.cityLabels(map)
        for l in cities { l.view.isHidden = true; insertSubview(l.view, at: 0) }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private static func nationLabels(_ map: WorldMap, unit: Double) -> [Label] {
        map.meta.labels.filter { $0.nation >= 0 }.map { box in
            let n = map.meta.nations[box.nation]
            let measured = (n.name as NSString).size(withAttributes: [.font: font(1)])
            let size = MapLayers.labelFontSize(box: box, emWidth: Float(measured.width), emHeight: Float(measured.height))
            return Label(text: n.name, x: Double(box.x), y: Double(box.y), mapEm: Double(size) * unit, fill: .black, stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.75), strokeWidth: 6.0 / 64, minPoints: 4, province: nil)
        }
    }
    /// Ownership changed: replace the state names, keep every city label and its rendered image.
    /// A colour view names its groups (culture, family, religion) where the state names were.
    func setGroups(_ groups: [GroupLabel], animated: Bool = true) {
        fadeOut(nations, animated)
        let unit = Double(MapLayers.fontUnit)
        nations = groups.map { g in
            let measured = (g.name as NSString).size(withAttributes: [.font: Self.font(1)])
            let size = MapLayers.labelFontSize(box: g.box, emWidth: Float(measured.width), emHeight: Float(measured.height))
            return Label(text: g.name, x: Double(g.box.x), y: Double(g.box.y), mapEm: Double(size) * unit, fill: .black, stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.75), strokeWidth: 6.0 / 64, minPoints: 4, province: nil)
        }
        fadeIn(nations, animated)
    }
    func setNations(map: WorldMap, animated: Bool = true) {
        fadeOut(nations, animated)
        nations = Self.nationLabels(map, unit: Double(MapLayers.fontUnit))
        fadeIn(nations, animated)
    }
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

    func update(camera: MapCamera, viewport: CGSize) {
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        if !showCities { for l in cities { l.view.isHidden = true } }
        for l in nations + (showCities ? cities : []) {
            let points = l.mapEm * camera.scale
            let p = camera.toScreen(x: l.x, y: l.y, viewport: vp)
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
            let k = CGFloat(points / l.rendered)
            l.view.transform = CGAffineTransform(scaleX: k, y: k)
            l.view.center = CGPoint(x: p.x, y: p.y)
            l.view.isHidden = false
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

    func update(_ placed: [(sprite: MapRenderer.ArmySprite, x: Float, y: Float)], camera: MapCamera, viewport: CGSize) {
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        // Icon size on screen (the renderer's icon size in map units × scale).
        let icon = 2.56 * 0.84 * 0.35 * (1600.0 / 240.0) * max(camera.scale, 22.0 / 5.02)
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
                // On the banner's flag (see rebuildArmies: the banner stands up and to the left).
                l.position = CGPoint(x: s.x - icon * 0.46, y: s.y - icon * 0.92)
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
        layer.addSublayer(l); layers[key] = l
        return l
    }
}
