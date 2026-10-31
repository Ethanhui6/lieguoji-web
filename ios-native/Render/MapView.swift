import SwiftUI
import UIKit
import MetalKit
import LieguojiCore

/// State shared between SwiftUI panels and the Metal map.
@MainActor final class MapController: ObservableObject {
    @Published var mode: MapMode = .political
    @Published var selectedProvince: Int?
    @Published var showMetrics = false
    /// Province to fly to; the id makes repeated requests for the same province animate again.
    @Published var focus: (province: Int, id: UUID)?
    @Published var resetRequest = UUID()
    /// Zoom by a factor around the screen centre (the + / − buttons).
    @Published var zoomRequest: (factor: Double, id: UUID)?
    /// Army icons and the selected army's remaining route, from the simulation (nil keeps the opening icons).
    @Published var armies: [MapRenderer.ArmySprite]?
    @Published var route: [SIMD2<Float>] = []
    @Published var selectedArmy: Int?
    /// While set, the next tap on land is the march destination of this army.
    @Published var marchingArmy: Int?
    var onMarchTarget: ((Int) -> Void)?
    /// The live world (ownership and nation labels follow the engine); nil keeps the opening map.
    @Published var world: WorldMap?
    /// Generation reveal (title screen), 0…1; labels and markers appear at 1.
    @Published var reveal: Float = 1
    /// Title screen: the map is a backdrop and takes no gestures.
    @Published var interactive = true
    /// Slow drift of the title backdrop.
    @Published var drifting = false
    func fly(to province: Int) { focus = (province, UUID()) }
    func zoom(_ factor: Double) { zoomRequest = (factor, UUID()) }
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
        private let metrics = UILabel()
        private var stats = FrameStatistics()
        private var lastFrame: CFTimeInterval = 0
        private var lastReport: CFTimeInterval = 0
        private var link: CADisplayLink?
        private var velocity = CGPoint.zero
        private var animation: (from: MapCamera, to: MapCamera, start: CFTimeInterval, duration: Double)?
        private var lastPinch = CGPoint.zero
        private var placed = false
        private var focusID: UUID?
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
            labels = MapLabelsView(map: map)
            for v in [mtk!, labels!] as [UIView] { v.frame = container.bounds; v.autoresizingMask = [.flexibleWidth, .flexibleHeight]; container.addSubview(v) }
            labels.isUserInteractionEnabled = false
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
            mtk.setNeedsDisplay()
        }
        private var camera: MapCamera { renderer?.camera ?? MapCamera(centerX: 0, centerY: 0, scale: 1) }

        @objc private func handlePan(_ g: UIPanGestureRecognizer) {
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
            case .began: lastPinch = p
            case .changed:
                // The fingers both zoom and drag the map.
                let moved = camera.panned(dx: Double(p.x - lastPinch.x), dy: Double(p.y - lastPinch.y))
                set(moved.zoomed(by: Double(g.scale), anchorX: Double(p.x), anchorY: Double(p.y), viewport: viewport, bounds: bounds))
                g.scale = 1; lastPinch = p
            default: break
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
            var province: Int?
            if let cell = picker.cell(atX: Float(w.x), y: Float(w.y)), map.province[cell] >= 0 { province = Int(map.province[cell]) }
            if controller.marchingArmy != nil {
                if let province { impact.impactOccurred(); controller.onMarchTarget?(province) }
                return
            }
            // An army icon under the finger (14 points) takes the tap before the province.
            if let armies = controller.armies {
                var best: (army: Int, d: Double)?
                for a in armies {
                    let s = camera.toScreen(x: Double(a.x), y: Double(a.y), viewport: viewport)
                    let d = hypot(s.x - Double(p.x), s.y - Double(p.y))
                    if d < 14, best == nil || d < best!.d { best = (a.army, d) }
                }
                if let best { selection.selectionChanged(); controller.selectedArmy = best.army; return }
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
            l.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
            l.add(to: .main, forMode: .common); link = l
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
            } else {
                velocity = .zero
                link?.invalidate(); link = nil
            }
        }

        // MARK: SwiftUI → map

        func sync() {
            if let next = controller.world, next.meta.provinces.map(\.nation) != map.meta.provinces.map(\.nation) || next.meta.labels.count != map.meta.labels.count
                || zip(next.meta.labels, map.meta.labels).contains(where: { p in p.0.nation != p.1.nation || p.0.x != p.1.x || p.0.y != p.1.y }) {
                map = next
                renderer?.setMap(next)
                let fresh = MapLabelsView(map: next)
                fresh.frame = labels.frame; fresh.autoresizingMask = labels.autoresizingMask; fresh.isUserInteractionEnabled = false
                container.insertSubview(fresh, aboveSubview: labels); labels.removeFromSuperview(); labels = fresh
                if let renderer { labels.update(camera: renderer.camera, viewport: mtk.bounds.size) }
            }
            if let renderer, renderer.reveal != controller.reveal { renderer.setReveal(controller.reveal) }
            labels?.alpha = controller.reveal >= 1 ? 1 : 0
            mtk?.isUserInteractionEnabled = controller.interactive
            if controller.drifting { startDrift() }
            renderer?.setAppearance(mode: controller.mode, highlight: controller.selectedProvince)
            if let armies = controller.armies { renderer?.setArmies(armies, route: controller.route) }
            labels?.setSelected(controller.selectedProvince)
            metrics.isHidden = !controller.showMetrics
            if let f = controller.focus, f.id != focusID {
                focusID = f.id
                let p = map.meta.provinces[f.province]
                animate(to: MapCamera(centerX: Double(p.x), centerY: Double(p.y), scale: max(camera.scale, bounds.lowerBound * 4)), duration: 0.5)
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
        let view = UILabel()
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
        for box in map.meta.labels where box.nation >= 0 {
            let n = map.meta.nations[box.nation]
            let measured = (n.name as NSString).size(withAttributes: [.font: Self.font(1)])
            let size = MapLayers.labelFontSize(box: box, emWidth: Float(measured.width), emHeight: Float(measured.height))
            let tint = Self.color(n.color).withAlphaComponent(0.8)
            nations.append(Label(text: n.name, x: Double(box.x), y: Double(box.y), mapEm: Double(size) * unit, fill: .black, stroke: tint, strokeWidth: -14, minPoints: 4, province: nil))
        }
        let capitals = Set(map.meta.nations.compactMap { $0.capital >= 0 ? map.meta.cities[$0.capital].id : nil })
        for c in map.meta.cities {
            let s = capitals.contains(c.id) ? 1.5 : 1.0, em = 64 * 0.13 * s / 10 * (1600.0 / 240.0), offset = 0.7 * s * (1600.0 / 240.0)
            cities.append(Label(text: c.name, x: Double(c.x), y: Double(c.y) - offset, mapEm: em, fill: UIColor(white: 0x11 / 255.0, alpha: 1),
                                stroke: UIColor(red: 0xF3 / 255.0, green: 0xE7 / 255.0, blue: 0xCA / 255.0, alpha: 0.7), strokeWidth: -10, minPoints: 9, province: c.province))
        }
        for l in cities + nations { l.view.isHidden = true; addSubview(l.view) }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    static func color(_ css: String) -> UIColor {
        let c = RGB(css: css) ?? RGB(0.5, 0.5, 0.5)
        return UIColor(red: CGFloat(c.r), green: CGFloat(c.g), blue: CGFloat(c.b), alpha: 1)
    }

    private var selected: Int?
    func setSelected(_ province: Int?) { selected = province }

    func update(camera: MapCamera, viewport: CGSize) {
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        for l in nations + cities {
            let points = l.mapEm * camera.scale
            let p = camera.toScreen(x: l.x, y: l.y, viewport: vp)
            guard points >= l.minPoints, p.x > -300, p.y > -120, p.x < vp.width + 300, p.y < vp.height + 120 else { l.view.isHidden = true; continue }
            if l.rendered == 0 || points / l.rendered > 1.25 || points / l.rendered < 0.8 {
                l.rendered = (points * 2).rounded() / 2
                l.view.transform = .identity
                l.view.attributedText = NSAttributedString(string: l.text, attributes: [.font: Self.font(CGFloat(l.rendered)), .foregroundColor: l.fill,
                                                                                        .strokeColor: l.stroke, .strokeWidth: l.strokeWidth])
                l.view.sizeToFit()
            }
            let k = CGFloat(points / l.rendered)
            l.view.transform = CGAffineTransform(scaleX: k, y: k)
            l.view.center = CGPoint(x: p.x, y: p.y)
            l.view.isHidden = false
        }
    }
}
