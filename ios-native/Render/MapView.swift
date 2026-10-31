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
    func fly(to province: Int) { focus = (province, UUID()) }
}

struct MapView: UIViewRepresentable {
    let map: WorldMap
    @ObservedObject var controller: MapController

    func makeCoordinator() -> Coordinator { Coordinator(map: map, controller: controller) }
    func makeUIView(context: Context) -> MapContainerView { context.coordinator.build() }
    func updateUIView(_ view: MapContainerView, context: Context) { context.coordinator.sync() }
    static func dismantleUIView(_ view: MapContainerView, coordinator: Coordinator) { coordinator.stop() }

    @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        let map: WorldMap
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
            mtk.clearColor = MTLClearColor(red: 0.078, green: 0.53, blue: 1, alpha: 1)
            mtk.isPaused = true
            mtk.enableSetNeedsDisplay = true
            mtk.preferredFramesPerSecond = 120
            mtk.autoResizeDrawable = true
            renderer = MapRenderer(view: mtk, map: map)
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
            renderer?.setAppearance(mode: controller.mode, highlight: controller.selectedProvince)
            labels?.setSelected(controller.selectedProvince)
            metrics.isHidden = !controller.showMetrics
            if let f = controller.focus, f.id != focusID {
                focusID = f.id
                let p = map.meta.provinces[f.province]
                animate(to: MapCamera(centerX: Double(p.x), centerY: Double(p.y), scale: max(camera.scale, bounds.lowerBound * 4)), duration: 0.5)
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

        func stop() { link?.invalidate(); link = nil }
    }
}

final class MapContainerView: UIView {
    var onLayout: (() -> Void)?
    override func layoutSubviews() { super.layoutSubviews(); onLayout?() }
}

/// Nation names scale with the map like the original's state labels; city names keep a fixed
/// size and appear once the map is close enough to read them.
final class MapLabelsView: UIView {
    private let map: WorldMap
    private var nationLabels: [(label: UILabel, x: Double, y: Double)] = []
    private var cityLabels: [(label: UILabel, dot: UIView, x: Double, y: Double, province: Int)] = []
    private static let nationBase: CGFloat = 32

    init(map: WorldMap) {
        self.map = map
        super.init(frame: .zero)
        for (i, n) in map.meta.nations.enumerated() {
            let owned = map.meta.provinces.filter { $0.nation == i }
            guard !owned.isEmpty else { continue }
            let x = owned.reduce(0.0) { $0 + Double($1.x) } / Double(owned.count), y = owned.reduce(0.0) { $0 + Double($1.y) } / Double(owned.count)
            let label = UILabel()
            label.attributedText = NSAttributedString(string: n.name, attributes: [
                .font: UIFont.systemFont(ofSize: Self.nationBase, weight: .heavy),
                .foregroundColor: UIColor(white: 0.05, alpha: 0.9),
                .strokeColor: UIColor(white: 1, alpha: 0.55), .strokeWidth: -2.5, .kern: 4,
            ])
            label.sizeToFit()
            addSubview(label)
            nationLabels.append((label, x, y))
        }
        for c in map.meta.cities {
            let capital = map.meta.nations.contains { $0.capital >= 0 && map.meta.cities.indices.contains($0.capital) && map.meta.cities[$0.capital].id == c.id }
            let label = UILabel()
            label.attributedText = NSAttributedString(string: c.name, attributes: [
                .font: UIFont.systemFont(ofSize: capital ? 13 : 11, weight: capital ? .bold : .semibold),
                .foregroundColor: UIColor(white: 0.08, alpha: 1), .strokeColor: UIColor(white: 1, alpha: 0.85), .strokeWidth: -3,
            ])
            label.sizeToFit()
            let dot = UIView(frame: CGRect(x: 0, y: 0, width: capital ? 7 : 5, height: capital ? 7 : 5))
            dot.backgroundColor = capital ? UIColor(red: 0.75, green: 0.1, blue: 0.1, alpha: 1) : UIColor(white: 0.1, alpha: 1)
            dot.layer.cornerRadius = dot.bounds.width / 2
            dot.layer.borderColor = UIColor.white.cgColor; dot.layer.borderWidth = 1
            addSubview(dot); addSubview(label)
            cityLabels.append((label, dot, Double(c.x), Double(c.y), c.province))
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private var selected: Int?
    func setSelected(_ province: Int?) {
        guard province != selected else { return }
        selected = province
        for c in cityLabels { c.label.alpha = province == nil || c.province == province ? 1 : 0.75 }
    }

    func update(camera: MapCamera, viewport: CGSize) {
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        // About 22 map units tall; never smaller than 11 pt or larger than 72 pt on screen.
        let size = min(72, max(11, 22 * camera.scale))
        let k = CGFloat(size) / Self.nationBase
        let fadeOut = camera.scale > 5 ? max(0, 1 - (camera.scale - 5) / 3) : 1
        for n in nationLabels {
            let p = camera.toScreen(x: n.x, y: n.y, viewport: vp)
            n.label.transform = CGAffineTransform(scaleX: k, y: k)
            n.label.center = CGPoint(x: p.x, y: p.y)
            n.label.alpha = CGFloat(fadeOut)
        }
        let showCities = camera.scale > 1.4
        for c in cityLabels {
            c.label.isHidden = !showCities; c.dot.isHidden = !showCities
            guard showCities else { continue }
            let p = camera.toScreen(x: c.x, y: c.y, viewport: vp)
            guard p.x > -80, p.y > -40, p.x < vp.width + 80, p.y < vp.height + 40 else { c.label.isHidden = true; c.dot.isHidden = true; continue }
            c.dot.center = CGPoint(x: p.x, y: p.y)
            c.label.center = CGPoint(x: CGFloat(p.x), y: CGFloat(p.y) - c.label.bounds.height / 2 - 4)
        }
    }
}
