import UIKit
import LieguojiCore

/// 四季流转与天时灾异实时大气渲染层（纯 CoreAnimation GPU 粒子＋局部灾区活态宋画微标，零逐帧 CPU 开销）：
/// - 仲春：漫天轻飘桃花瓣（`fx-petal`）；
/// - 盛夏：暖金曦光微尘，大旱期间切换炙热干尘热浪；
/// - 金秋：随风翻飞丹红金枫（`fx-maple`）；
/// - 隆冬：斜飘晶莹飞雪（`fx-snowflake`）＋寒霜边缘光晕，暴雪期间风雪骤密；
/// - 局部灾区／丰年州郡：在受灾或丰收州郡上空浮现对应无圆框宋画活态徽标（雪枝、炽日、雷云、瘴雾、金穗），一眼洞悉天下天时。
final class WeatherOverlayView: UIView {
    struct Zone: Equatable {
        let province: Int
        let x: Double
        let y: Double
        let kind: Int // 1=snow, 2=drought, 3=flood, 4=plague, 5=harvest
    }

    private enum Mode: Equatable {
        case off, spring, summer, summerDrought, autumn, winter, winterBlizzard, stormRain
    }

    private let emitter = CAEmitterLayer()
    private let edgeTint = CAGradientLayer()
    private var currentMode: Mode = .off
    private var zoneLayers: [Int: (layer: CALayer, zone: Zone)] = [:]
    private var lastCamera: MapCamera?
    private var lastViewport: CGSize = .zero

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        clipsToBounds = true
        // 顶部极柔和四季天色微晕（纯气氛，绝不遮挡地图与顶栏）
        edgeTint.type = .axial
        edgeTint.startPoint = CGPoint(x: 0.5, y: 0)
        edgeTint.endPoint = CGPoint(x: 0.5, y: 0.28)
        edgeTint.opacity = 0
        layer.addSublayer(edgeTint)
        emitter.emitterShape = .line
        emitter.renderMode = .unordered
        emitter.birthRate = 0
        layer.addSublayer(emitter)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        edgeTint.frame = bounds
        emitter.frame = bounds
        emitter.emitterPosition = CGPoint(x: bounds.width * 0.5, y: -14)
        emitter.emitterSize = CGSize(width: max(1, bounds.width * 1.25), height: 2)
        CATransaction.commit()
    }

    private static let rainStreak: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 26)).image { ctx in
        let c = ctx.cgContext
        c.setStrokeColor(UIColor(red: 0.72, green: 0.86, blue: 0.98, alpha: 0.65).cgColor)
        c.setLineWidth(1.5); c.setLineCap(.round)
        c.move(to: CGPoint(x: 3, y: 1)); c.addLine(to: CGPoint(x: 1, y: 25)); c.strokePath()
    }.cgImage

    private static let sunMote: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16)).image { ctx in
        let colors = [UIColor(red: 1.0, green: 0.90, blue: 0.56, alpha: 0.85).cgColor,
                      UIColor(red: 1.0, green: 0.82, blue: 0.36, alpha: 0).cgColor] as CFArray
        if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
            ctx.cgContext.drawRadialGradient(g, startCenter: CGPoint(x: 8, y: 8), startRadius: 0, endCenter: CGPoint(x: 8, y: 8), endRadius: 8, options: [])
        }
    }.cgImage

    func update(seasonPhase: Float, zones: [Zone], camera: MapCamera, viewport: CGSize, active: Bool) {
        let reduce = UIAccessibility.isReduceMotionEnabled
        let enableParticles = active && EffectsView.particles && !Energy.hot && !reduce && seasonPhase >= 0 && viewport.width > 10

        let hasBlizzard = zones.contains { $0.kind == 1 }
        let hasDrought = zones.contains { $0.kind == 2 }
        let hasFlood = zones.contains { $0.kind == 3 }

        let targetMode: Mode = {
            guard enableParticles else { return .off }
            if hasBlizzard { return .winterBlizzard }
            if hasFlood { return .stormRain }
            // seasonPhase: 0.0=隆冬(1月), 0.25=仲春(4月), 0.50=盛夏(7月), 0.75=金秋(10月)
            if seasonPhase < 0.14 || seasonPhase >= 0.88 { return .winter }
            if seasonPhase < 0.39 { return .spring }
            if seasonPhase < 0.64 { return hasDrought ? .summerDrought : .summer }
            return .autumn
        }()

        if targetMode != currentMode {
            currentMode = targetMode
            applyEmitterMode(targetMode)
        }

        updateZoneMarkers(zones: active && !reduce ? zones : [], camera: camera, viewport: viewport)
    }

    private func applyEmitterMode(_ mode: Mode) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        guard mode != .off else {
            emitter.birthRate = 0
            emitter.emitterCells = nil
            edgeTint.opacity = 0
            return
        }

        func makeCell(image: CGImage?, color: UIColor, rate: Float, life: Float, vel: CGFloat, velRange: CGFloat,
                      scale: CGFloat, scaleRange: CGFloat, spin: CGFloat, lon: CGFloat, range: CGFloat, xAcc: CGFloat, yAcc: CGFloat) -> CAEmitterCell {
            let c = CAEmitterCell()
            c.contents = image
            c.color = color.cgColor
            c.birthRate = rate
            c.lifetime = life
            c.lifetimeRange = life * 0.25
            c.velocity = vel
            c.velocityRange = velRange
            c.emissionLongitude = lon
            c.emissionRange = range
            c.scale = scale
            c.scaleRange = scaleRange
            c.spin = spin
            c.spinRange = spin * 1.2
            c.xAcceleration = xAcc
            c.yAcceleration = yAcc
            c.alphaRange = 0.28
            c.alphaSpeed = -0.10 / max(1, life)
            return c
        }

        switch mode {
        case .off:
            break
        case .winter:
            let flake = BundleArt.fxSnowflake?.cgImage
            emitter.emitterCells = [
                makeCell(image: flake, color: UIColor(white: 1, alpha: 0.88), rate: 8.5, life: 11.5, vel: 44, velRange: 18,
                         scale: 0.18, scaleRange: 0.10, spin: 0.55, lon: .pi * 0.54, range: 0.32, xAcc: 9, yAcc: 3),
                makeCell(image: flake, color: UIColor(red: 0.90, green: 0.96, blue: 1.0, alpha: 0.62), rate: 6.0, life: 13.5, vel: 26, velRange: 10,
                         scale: 0.11, scaleRange: 0.05, spin: -0.35, lon: .pi * 0.56, range: 0.28, xAcc: 6, yAcc: 2)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.84, green: 0.93, blue: 1.0, alpha: 0.24).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        case .winterBlizzard:
            let flake = BundleArt.fxSnowflake?.cgImage
            emitter.emitterCells = [
                makeCell(image: flake, color: UIColor(white: 1, alpha: 0.94), rate: 18.0, life: 8.5, vel: 78, velRange: 28,
                         scale: 0.22, scaleRange: 0.11, spin: 1.1, lon: .pi * 0.62, range: 0.26, xAcc: 24, yAcc: 8),
                makeCell(image: flake, color: UIColor(red: 0.86, green: 0.94, blue: 1.0, alpha: 0.72), rate: 12.0, life: 10.0, vel: 52, velRange: 18,
                         scale: 0.12, scaleRange: 0.06, spin: -0.8, lon: .pi * 0.60, range: 0.22, xAcc: 18, yAcc: 6)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.80, green: 0.91, blue: 1.0, alpha: 0.36).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        case .spring:
            let petal = BundleArt.fxPetal?.cgImage
            emitter.emitterCells = [
                makeCell(image: petal, color: UIColor(white: 1, alpha: 0.82), rate: 4.8, life: 12.0, vel: 34, velRange: 14,
                         scale: 0.17, scaleRange: 0.07, spin: 1.05, lon: .pi * 0.44, range: 0.36, xAcc: 11, yAcc: 2)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.88, green: 0.98, blue: 0.90, alpha: 0.16).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        case .autumn:
            let maple = BundleArt.fxMaple?.cgImage
            emitter.emitterCells = [
                makeCell(image: maple, color: UIColor(white: 1, alpha: 0.86), rate: 5.5, life: 11.0, vel: 42, velRange: 16,
                         scale: 0.19, scaleRange: 0.08, spin: 1.35, lon: .pi * 0.42, range: 0.34, xAcc: 14, yAcc: 4)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.96, green: 0.76, blue: 0.42, alpha: 0.18).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        case .summer:
            emitter.emitterCells = [
                makeCell(image: Self.sunMote, color: UIColor(red: 1.0, green: 0.92, blue: 0.62, alpha: 0.56), rate: 3.2, life: 10.5, vel: 18, velRange: 10,
                         scale: 0.42, scaleRange: 0.20, spin: 0.2, lon: .pi * 0.48, range: 0.50, xAcc: 4, yAcc: 1)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 1.0, green: 0.92, blue: 0.66, alpha: 0.14).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        case .summerDrought:
            emitter.emitterCells = [
                makeCell(image: Self.sunMote, color: UIColor(red: 0.94, green: 0.64, blue: 0.24, alpha: 0.68), rate: 9.5, life: 7.5, vel: 54, velRange: 22,
                         scale: 0.46, scaleRange: 0.22, spin: 0.4, lon: .pi * 0.30, range: 0.28, xAcc: 22, yAcc: -4)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.96, green: 0.62, blue: 0.20, alpha: 0.28).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        case .stormRain:
            emitter.emitterCells = [
                makeCell(image: Self.rainStreak, color: UIColor(white: 1, alpha: 0.75), rate: 26.0, life: 3.2, vel: 240, velRange: 60,
                         scale: 0.78, scaleRange: 0.24, spin: 0, lon: .pi * 0.58, range: 0.06, xAcc: -18, yAcc: 110)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.24, green: 0.36, blue: 0.52, alpha: 0.22).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        }
    }

    /// 局部天时／灾异州郡上空的活态无圆框宋画微标（暴雪松枝、大旱炽日、洪涝雷云、瘟疫瘴雾、丰年稻穗），最多同屏展示 8 处且自动避重。
    private func updateZoneMarkers(zones: [Zone], camera: MapCamera, viewport: CGSize) {
        let keep = Set(zones.prefix(8).map(\.province))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        for (pid, entry) in zoneLayers where !keep.contains(pid) {
            entry.layer.removeFromSuperlayer()
            zoneLayers[pid] = nil
        }

        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        let visible = CGRect(origin: .zero, size: viewport).insetBy(dx: -40, dy: -40)
        let k = CGFloat(max(0.75, min(1.25, camera.scale * 0.72)))

        for z in zones.prefix(8) {
            let entry: (layer: CALayer, zone: Zone)
            if let existing = zoneLayers[z.province], existing.zone.kind == z.kind {
                entry = (existing.layer, z)
                zoneLayers[z.province] = entry
            } else {
                zoneLayers[z.province]?.layer.removeFromSuperlayer()
                let l = makeZoneLayer(kind: z.kind)
                layer.insertSublayer(l, below: emitter)
                entry = (l, z)
                zoneLayers[z.province] = entry
            }
            let p = camera.toScreen(x: z.x, y: z.y, viewport: vp)
            let pt = CGPoint(x: p.x, y: p.y - 16 * Double(k))
            let onScreen = visible.contains(pt) && camera.scale >= 0.55
            entry.layer.isHidden = !onScreen
            if onScreen {
                entry.layer.position = pt
                entry.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k))
            }
        }
        lastCamera = camera
        lastViewport = viewport
    }

    private func makeZoneLayer(kind: Int) -> CALayer {
        let root = CALayer()
        root.bounds = CGRect(x: 0, y: 0, width: 32, height: 32)
        let art: UIImage?
        switch kind {
        case 1: art = BundleArt.fxWeatherSnow
        case 2: art = BundleArt.fxWeatherDrought
        case 3: art = BundleArt.fxWeatherStorm
        case 4: art = BundleArt.fxPlague
        default: art = BundleArt.fxHarvest
        }
        root.contents = art?.cgImage
        root.contentsGravity = .resizeAspect
        root.opacity = 0.90

        let bob = CAKeyframeAnimation(keyPath: "transform.translation.y")
        bob.values = [0, -3.0, 0, 2.0, 0]
        bob.duration = kind == 3 ? 1.8 : 2.8
        bob.repeatCount = .infinity
        bob.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)

        let sway = CAKeyframeAnimation(keyPath: "transform.rotation.z")
        sway.values = [-0.07, 0.07, -0.05, 0.06, -0.07]
        sway.duration = kind == 2 ? 2.1 : 3.2
        sway.repeatCount = .infinity
        sway.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)

        let g = CAAnimationGroup()
        g.animations = [bob, sway]
        g.duration = 2.8
        g.repeatCount = .infinity
        root.add(EffectsView.calm(g), forKey: "zoneFloat")
        return root
    }
}
