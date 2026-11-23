import QuartzCore
import SwiftUI
import UIKit

/// 序列帧动画状态：待机、行军、交战、航行、沉没、攻城与天象循环。
enum SpriteAnimationState: String, Hashable {
    case idle
    case march
    case combat
    case sail
    case sink
    case siege
}

/// 等宽等高网格序列帧图集描述（默认 4×1 横向透明条带，尺寸 1024×256）。
struct SpriteSheetSpec {
    let name: String
    let cols: Int
    let rows: Int
    let defaultFPS: Double

    var frameCount: Int { max(1, cols * rows) }

    static let infantryMarch = SpriteSheetSpec(name: "sheet-infantry-march", cols: 4, rows: 1, defaultFPS: 7.5)
    static let cavalryCharge = SpriteSheetSpec(name: "sheet-cavalry-charge", cols: 4, rows: 1, defaultFPS: 9.0)
    static let warshipEast = SpriteSheetSpec(name: "sheet-warship-east", cols: 4, rows: 1, defaultFPS: 5.5)
    static let warshipWest = SpriteSheetSpec(name: "sheet-warship-west", cols: 4, rows: 1, defaultFPS: 5.5)
    static let transportShip = SpriteSheetSpec(name: "sheet-transport-ship", cols: 4, rows: 1, defaultFPS: 4.8)
    static let battleClash = SpriteSheetSpec(name: "sheet-battle-clash", cols: 4, rows: 1, defaultFPS: 8.5)
    static let siegeSmoke = SpriteSheetSpec(name: "sheet-siege-smoke", cols: 4, rows: 1, defaultFPS: 6.5)

    /// 按状态调节实际播放帧率，保证待机舒缓、行军稳健、交战激昂。
    func fps(for state: SpriteAnimationState) -> Double {
        switch state {
        case .idle: return defaultFPS * 0.45
        case .march: return defaultFPS
        case .combat: return defaultFPS * 1.35
        case .sail: return defaultFPS
        case .sink: return defaultFPS * 0.85
        case .siege: return defaultFPS
        }
    }
}

/// 统一的 CoreAnimation 零拷贝序列帧播放器：直接对整张透明图集做离散 `contentsRect` 切帧，
/// 不在 CPU 逐帧裁剪位图，支持 60/120fps 丝滑循环、单次播放、随机起始相位与状态切换。
final class SpriteSheetLayer: CALayer {
    private(set) var spec: SpriteSheetSpec
    private(set) var state: SpriteAnimationState = .idle
    private var playing = false

    init(spec: SpriteSheetSpec, image: UIImage? = nil) {
        self.spec = spec
        super.init()
        contentsGravity = .resizeAspect
        isOpaque = false
        allowsEdgeAntialiasing = true
        let resolved = image ?? BundleArt.spriteSheet(spec.name)
        contents = resolved?.cgImage
        contentsRect = frameRect(index: 0)
    }

    required init?(coder: NSCoder) {
        self.spec = .battleClash
        super.init(coder: coder)
    }

    override init(layer: Any) {
        if let other = layer as? SpriteSheetLayer {
            self.spec = other.spec
            self.state = other.state
        } else {
            self.spec = .battleClash
        }
        super.init(layer: layer)
    }

    /// 切换图集与动作状态（如从待机切换为行军/交战/沉没）。
    func configure(
        spec newSpec: SpriteSheetSpec? = nil,
        image: UIImage? = nil,
        state newState: SpriteAnimationState,
        fps customFPS: Double? = nil,
        repeatCount: Float = .infinity,
        phaseOffset: Double = 0
    ) {
        let specChanged = newSpec != nil && newSpec?.name != spec.name
        if let newSpec {
            spec = newSpec
            let img = image ?? BundleArt.spriteSheet(newSpec.name)
            contents = img?.cgImage
        } else if let image {
            contents = image.cgImage
        }
        let stateChanged = newState != state
        state = newState
        if specChanged || stateChanged || !playing || animation(forKey: "sprite.sheet.play") == nil {
            play(fps: customFPS ?? spec.fps(for: newState), repeatCount: repeatCount, phaseOffset: phaseOffset)
        }
    }

    /// 启动离散序列帧动画循环。
    func play(fps: Double? = nil, repeatCount: Float = .infinity, phaseOffset: Double = 0) {
        let count = spec.frameCount
        guard count > 1 else {
            contentsRect = frameRect(index: 0)
            return
        }
        let rate = max(1.0, fps ?? spec.fps(for: state))
        let cycleDuration = Double(count) / rate
        let rects = (0..<count).map { NSValue(cgRect: frameRect(index: $0)) }
        let keyTimes = (0..<count).map { NSNumber(value: Double($0) / Double(count)) }

        let anim = CAKeyframeAnimation(keyPath: "contentsRect")
        anim.values = rects
        anim.keyTimes = keyTimes
        anim.duration = cycleDuration
        anim.calculationMode = .discrete
        anim.repeatCount = repeatCount
        anim.isRemovedOnCompletion = false
        anim.fillMode = .forwards
        if phaseOffset > 0 {
            anim.timeOffset = phaseOffset.truncatingRemainder(dividingBy: cycleDuration)
        }
        removeAnimation(forKey: "sprite.sheet.play")
        add(anim, forKey: "sprite.sheet.play")
        playing = true
    }

    /// 停止并定格在指定帧。
    func stop(at frameIndex: Int = 0) {
        removeAnimation(forKey: "sprite.sheet.play")
        playing = false
        contentsRect = frameRect(index: frameIndex)
    }

    private func frameRect(index: Int) -> CGRect {
        let cols = max(1, spec.cols)
        let rows = max(1, spec.rows)
        let clamped = ((index % (cols * rows)) + cols * rows) % (cols * rows)
        let col = clamped % cols
        let row = clamped / cols
        let w = 1.0 / CGFloat(cols)
        let h = 1.0 / CGFloat(rows)
        return CGRect(x: CGFloat(col) * w, y: CGFloat(row) * h, width: w, height: h)
    }
}

/// SwiftUI 封装版序列帧动画视图：在传报横幅、国家页或战况详情中直接播放透明序列帧图集。
struct SpriteSheetView: UIViewRepresentable {
    let spec: SpriteSheetSpec
    var state: SpriteAnimationState = .march
    var fps: Double? = nil
    var flipped: Bool = false

    final class HostView: UIView {
        let spriteLayer: SpriteSheetLayer
        init(spec: SpriteSheetSpec) {
            self.spriteLayer = SpriteSheetLayer(spec: spec)
            super.init(frame: .zero)
            backgroundColor = .clear
            isUserInteractionEnabled = false
            layer.addSublayer(spriteLayer)
        }
        required init?(coder: NSCoder) { fatalError() }
        override func layoutSubviews() {
            super.layoutSubviews()
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            spriteLayer.frame = bounds
            CATransaction.commit()
        }
    }

    func makeUIView(context: Context) -> HostView {
        let v = HostView(spec: spec)
        v.spriteLayer.configure(spec: spec, state: state, fps: fps)
        v.transform = flipped ? CGAffineTransform(scaleX: -1, y: 1) : .identity
        return v
    }

    func updateUIView(_ uiView: HostView, context: Context) {
        uiView.spriteLayer.configure(spec: spec, state: state, fps: fps)
        uiView.transform = flipped ? CGAffineTransform(scaleX: -1, y: 1) : .identity
    }
}
