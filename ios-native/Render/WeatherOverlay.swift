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

    private static let snowFlake: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 18, height: 18)).image { ctx in
        let c = ctx.cgContext
        let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                              colors: [UIColor(white: 1.0, alpha: 0.92).cgColor, UIColor(red: 0.90, green: 0.96, blue: 1.0, alpha: 0.0).cgColor] as CFArray,
                              locations: [0.18, 1.0])
        if let grad {
            c.drawRadialGradient(grad, startCenter: CGPoint(x: 9, y: 9), startRadius: 0, endCenter: CGPoint(x: 9, y: 9), endRadius: 8.5, options: [])
        }
        c.setStrokeColor(UIColor(white: 1.0, alpha: 0.95).cgColor)
        c.setLineWidth(1.0); c.setLineCap(.round)
        for i in 0..<3 {
            let a = CGFloat(i) * .pi / 3
            c.move(to: CGPoint(x: 9 - cos(a) * 6.2, y: 9 - sin(a) * 6.2))
            c.addLine(to: CGPoint(x: 9 + cos(a) * 6.2, y: 9 + sin(a) * 6.2))
        }
        c.strokePath()
    }.cgImage

    private static let sakuraPetal: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 14, height: 14)).image { ctx in
        let c = ctx.cgContext
        let p = UIBezierPath()
        p.move(to: CGPoint(x: 7, y: 1.5))
        p.addCurve(to: CGPoint(x: 7, y: 12.5), controlPoint1: CGPoint(x: 13.5, y: 4), controlPoint2: CGPoint(x: 12, y: 10.5))
        p.addCurve(to: CGPoint(x: 7, y: 1.5), controlPoint1: CGPoint(x: 2, y: 10.5), controlPoint2: CGPoint(x: 0.5, y: 4))
        p.close()
        c.setFillColor(UIColor(red: 0.98, green: 0.80, blue: 0.84, alpha: 0.88).cgColor)
        c.addPath(p.cgPath); c.fillPath()
    }.cgImage

    private static let mapleLeaf: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16)).image { ctx in
        let c = ctx.cgContext
        let p = UIBezierPath()
        p.move(to: CGPoint(x: 8, y: 1.5))
        p.addLine(to: CGPoint(x: 10, y: 5.5)); p.addLine(to: CGPoint(x: 14, y: 4.5))
        p.addLine(to: CGPoint(x: 11.5, y: 8.5)); p.addLine(to: CGPoint(x: 13.5, y: 12))
        p.addLine(to: CGPoint(x: 8.8, y: 11)); p.addLine(to: CGPoint(x: 8, y: 14.5))
        p.addLine(to: CGPoint(x: 7.2, y: 11)); p.addLine(to: CGPoint(x: 2.5, y: 12))
        p.addLine(to: CGPoint(x: 4.5, y: 8.5)); p.addLine(to: CGPoint(x: 2, y: 4.5))
        p.addLine(to: CGPoint(x: 6, y: 5.5)); p.close()
        c.setFillColor(UIColor(red: 0.86, green: 0.36, blue: 0.16, alpha: 0.88).cgColor)
        c.addPath(p.cgPath); c.fillPath()
    }.cgImage

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
            let flake = Self.snowFlake
            emitter.emitterCells = [
                makeCell(image: flake, color: UIColor(white: 1, alpha: 0.86), rate: 8.5, life: 11.5, vel: 42, velRange: 16,
                         scale: 0.56, scaleRange: 0.24, spin: 0.55, lon: .pi * 0.54, range: 0.32, xAcc: 9, yAcc: 3),
                makeCell(image: flake, color: UIColor(red: 0.90, green: 0.96, blue: 1.0, alpha: 0.58), rate: 6.0, life: 13.5, vel: 24, velRange: 10,
                         scale: 0.34, scaleRange: 0.14, spin: -0.35, lon: .pi * 0.56, range: 0.28, xAcc: 6, yAcc: 2)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.84, green: 0.93, blue: 1.0, alpha: 0.20).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        case .winterBlizzard:
            let flake = Self.snowFlake
            emitter.emitterCells = [
                makeCell(image: flake, color: UIColor(white: 1, alpha: 0.94), rate: 18.0, life: 8.5, vel: 76, velRange: 26,
                         scale: 0.66, scaleRange: 0.28, spin: 1.1, lon: .pi * 0.62, range: 0.26, xAcc: 24, yAcc: 8),
                makeCell(image: flake, color: UIColor(red: 0.86, green: 0.94, blue: 1.0, alpha: 0.70), rate: 12.0, life: 10.0, vel: 50, velRange: 18,
                         scale: 0.38, scaleRange: 0.16, spin: -0.8, lon: .pi * 0.60, range: 0.22, xAcc: 18, yAcc: 6)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.80, green: 0.91, blue: 1.0, alpha: 0.30).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        case .spring:
            let petal = Self.sakuraPetal
            emitter.emitterCells = [
                makeCell(image: petal, color: UIColor(white: 1, alpha: 0.78), rate: 4.5, life: 12.0, vel: 32, velRange: 12,
                         scale: 0.54, scaleRange: 0.20, spin: 1.05, lon: .pi * 0.44, range: 0.36, xAcc: 10, yAcc: 2)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.88, green: 0.98, blue: 0.90, alpha: 0.12).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        case .autumn:
            let maple = Self.mapleLeaf
            emitter.emitterCells = [
                makeCell(image: maple, color: UIColor(white: 1, alpha: 0.82), rate: 5.2, life: 11.0, vel: 40, velRange: 14,
                         scale: 0.56, scaleRange: 0.20, spin: 1.35, lon: .pi * 0.42, range: 0.34, xAcc: 13, yAcc: 4)
            ]
            emitter.birthRate = 1
            edgeTint.colors = [UIColor(red: 0.96, green: 0.76, blue: 0.42, alpha: 0.14).cgColor, UIColor.clear.cgColor]
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
        // 极简轻墨天时微徽（20pt 半透明宣纸圈 + 纤细矢量天气符，60fps 轻浮呼吸，彻底消除粗糙大贴图）
        let root = CALayer()
        root.bounds = CGRect(x: 0, y: 0, width: 20, height: 20)
        let color: UIColor = {
            switch kind {
            case 1: return UIColor(red: 0.24, green: 0.50, blue: 0.76, alpha: 1)
            case 2: return UIColor(red: 0.78, green: 0.38, blue: 0.12, alpha: 1)
            case 3: return UIColor(red: 0.18, green: 0.38, blue: 0.62, alpha: 1)
            case 4: return UIColor(red: 0.42, green: 0.50, blue: 0.20, alpha: 1)
            default: return UIColor(red: 0.76, green: 0.54, blue: 0.12, alpha: 1)
            }
        }()

        let disc = CAShapeLayer(); disc.frame = root.bounds
        disc.path = UIBezierPath(ovalIn: CGRect(x: 1.5, y: 1.5, width: 17, height: 17)).cgPath
        disc.fillColor = UIColor(red: 0.98, green: 0.96, blue: 0.91, alpha: 0.80).cgColor
        disc.strokeColor = color.withAlphaComponent(0.55).cgColor
        disc.lineWidth = 0.95
        root.addSublayer(disc)

        let glyph = CAShapeLayer(); glyph.frame = root.bounds
        glyph.fillColor = nil; glyph.strokeColor = color.cgColor
        glyph.lineWidth = 1.3; glyph.lineCap = .round; glyph.lineJoin = .round
        let p = UIBezierPath()
        switch kind {
        case 1: // 雪晶
            for i in 0..<3 {
                let a = CGFloat(i) * .pi / 3
                p.move(to: CGPoint(x: 10 - cos(a) * 4.6, y: 10 - sin(a) * 4.6))
                p.addLine(to: CGPoint(x: 10 + cos(a) * 4.6, y: 10 + sin(a) * 4.6))
            }
        case 2: // 烈日
            p.append(UIBezierPath(ovalIn: CGRect(x: 7.5, y: 7.5, width: 5, height: 5)))
            for i in 0..<6 {
                let a = CGFloat(i) * .pi / 3
                p.move(to: CGPoint(x: 10 + cos(a) * 3.8, y: 10 + sin(a) * 3.8))
                p.addLine(to: CGPoint(x: 10 + cos(a) * 5.6, y: 10 + sin(a) * 5.6))
            }
        case 3: // 雷雨
            p.move(to: CGPoint(x: 11.2, y: 4.8)); p.addLine(to: CGPoint(x: 7.8, y: 10.2))
            p.addLine(to: CGPoint(x: 10.8, y: 10.2)); p.addLine(to: CGPoint(x: 8.6, y: 15.2))
        case 4: // 瘴雾
            p.move(to: CGPoint(x: 5.5, y: 12)); p.addCurve(to: CGPoint(x: 14.5, y: 11), controlPoint1: CGPoint(x: 8, y: 7.5), controlPoint2: CGPoint(x: 12, y: 14))
            p.move(to: CGPoint(x: 6.5, y: 8.5)); p.addCurve(to: CGPoint(x: 13.5, y: 7.5), controlPoint1: CGPoint(x: 8.5, y: 5.5), controlPoint2: CGPoint(x: 11.5, y: 10))
        default: // 丰年星芒
            p.move(to: CGPoint(x: 10, y: 4.8)); p.addLine(to: CGPoint(x: 10, y: 15.2))
            p.move(to: CGPoint(x: 4.8, y: 10)); p.addLine(to: CGPoint(x: 15.2, y: 10))
        }
        glyph.path = p.cgPath
        root.addSublayer(glyph)

        let bob = CAKeyframeAnimation(keyPath: "transform.translation.y")
        bob.values = [0, -2.2, 0, 1.4, 0]
        bob.duration = 2.6; bob.repeatCount = .infinity
        bob.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        root.add(EffectsView.calm(bob), forKey: "zoneFloat")
        return root
    }
}
