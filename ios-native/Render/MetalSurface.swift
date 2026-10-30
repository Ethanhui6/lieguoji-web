import SwiftUI
import MetalKit
import LieguojiCore
struct MetalSurface: UIViewRepresentable {
    let showMetrics: Bool
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> MTKView {
        let view = MTKView(frame: .zero, device: MTLCreateSystemDefaultDevice())
        view.clearColor = MTLClearColor(red: 0.063, green: 0.169, blue: 0.231, alpha: 1)
        view.preferredFramesPerSecond = 120
        view.delegate = context.coordinator
        context.coordinator.queue = view.device?.makeCommandQueue()
        context.coordinator.install(on: view)
        return view
    }
    func updateUIView(_ view: MTKView, context: Context) { context.coordinator.label.isHidden = !showMetrics }
    static func dismantleUIView(_ view: MTKView, coordinator: Coordinator) { coordinator.stop(); view.delegate = nil }
    final class Coordinator: NSObject, MTKViewDelegate {
        var queue: MTLCommandQueue?
        let label = UILabel()
        private var link: CADisplayLink?
        private var previous: CFTimeInterval = 0
        private var lastReport: CFTimeInterval = 0
        private var stats = FrameStatistics()
        private var renderer: TerrainRenderer?
        private weak var mapView: MTKView?
        private var loading: Task<Void, Never>?
        func install(on view: MTKView) {
            mapView = view
            do { if let device = view.device { renderer = try TerrainRenderer(device: device, format: view.colorPixelFormat) } } catch { label.text = error.localizedDescription }
            let pan = UIPanGestureRecognizer(target: self, action: #selector(pan(_:))); pan.maximumNumberOfTouches = 1; view.addGestureRecognizer(pan)
            view.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinch(_:))))
            let tap = UITapGestureRecognizer(target: self, action: #selector(doubleTap(_:))); tap.numberOfTapsRequired = 2; view.addGestureRecognizer(tap)
            loading = Task { @MainActor [weak self] in
                do { let tiles = try await TerrainLoader().load(); guard !Task.isCancelled else { return }; self?.renderer?.install(tiles) }
                catch { self?.label.text = error.localizedDescription; self?.label.isHidden = false }
            }
            label.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
            label.textColor = .white; label.backgroundColor = UIColor.black.withAlphaComponent(0.65)
            label.numberOfLines = 0; label.translatesAutoresizingMaskIntoConstraints = false
            label.text = "等待帧时间样本"; label.isHidden = true
            view.addSubview(label)
            NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12), label.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12)])
            let displayLink = CADisplayLink(target: self, selector: #selector(frame(_:)))
            displayLink.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 120, preferred: 120)
            displayLink.add(to: .main, forMode: .common); link = displayLink
        }
        func stop() { loading?.cancel(); link?.invalidate(); link = nil }
        @objc private func pan(_ g: UIPanGestureRecognizer) {
            let delta = g.translation(in: mapView); renderer?.camera.pan(dx: delta.x,dy: delta.y); g.setTranslation(.zero,in: mapView)
            renderer?.velocity = g.state == .ended ? g.velocity(in: mapView) : .zero
        }
        @objc private func pinch(_ g: UIPinchGestureRecognizer) {
            guard let view = mapView else { return }; let p = g.location(in: view); renderer?.velocity = .zero
            renderer?.camera.zoom(factor: g.scale,anchorX: p.x,anchorY: p.y,width: view.bounds.width,height: view.bounds.height); g.scale = 1
        }
        @objc private func doubleTap(_ g: UITapGestureRecognizer) {
            guard let view = mapView else { return }; let p = g.location(in: view); renderer?.velocity = .zero
            renderer?.camera.zoom(factor: 2,anchorX: p.x,anchorY: p.y,width: view.bounds.width,height: view.bounds.height)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
        @objc private func frame(_ sender: CADisplayLink) {
            if previous > 0, sender.timestamp - previous < 1 { stats.record(seconds: sender.timestamp - previous) }
            renderer?.coast(seconds: sender.timestamp - previous)
            previous = sender.timestamp
            if sender.timestamp - lastReport >= 0.5 {
                label.text = String(format: " 平均 %.2f ms · 1%% low %.1f fps \n CADisplayLink 回调，非 GPU 耗时 ", stats.averageMilliseconds, stats.onePercentLow)
                lastReport = sender.timestamp
            }
        }
        func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}
        func draw(in view: MTKView) {
            guard let queue else { return }
            renderer?.draw(view: view, queue: queue)
        }
    }
}
