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
        func install(on view: MTKView) {
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
        func stop() { link?.invalidate(); link = nil }
        @objc private func frame(_ sender: CADisplayLink) {
            if previous > 0, sender.timestamp - previous < 1 { stats.record(seconds: sender.timestamp - previous) }
            previous = sender.timestamp
            if sender.timestamp - lastReport >= 0.5 {
                label.text = String(format: " 平均 %.2f ms · 1%% low %.1f fps \n CADisplayLink 回调，非 GPU 耗时 ", stats.averageMilliseconds, stats.onePercentLow)
                lastReport = sender.timestamp
            }
        }
        func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}
        func draw(in view: MTKView) {
            guard let descriptor = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
                  let buffer = queue?.makeCommandBuffer(), let encoder = buffer.makeRenderCommandEncoder(descriptor: descriptor) else { return }
            encoder.endEncoding(); buffer.present(drawable); buffer.commit()
        }
    }
}
