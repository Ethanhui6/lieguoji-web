import UIKit
import LieguojiCore

/// 四季流转与天时灾异实时大气画卷层（全面复用手绘水墨花瓣、丹枫、冰晶雪花、银丝雨滴、流云雾气与 36 帧雨澜序列帧）：
/// - 仲春：漫天轻舞手绘桃花瓣（`fx-petal`）＋轻柔春岚流云（`fx-cloud-mist`）；
/// - 盛夏：暖金曦光微尘与轻云，大旱期间切换炙热干风微尘；
/// - 金秋：随风翻飞手绘丹红金枫（`fx-maple`）＋秋山薄霭；
/// - 隆冬：远近双景深晶莹手绘飞雪（`fx-snowflake`）＋寒霜天幕晕染，暴雪期间风雪骤急；
/// - 霖雨／洪涝：远近双景深手绘斜风银雨（`fx-raindrop`）＋阴云漫卷＋地面 36 帧（30fps）水花涟漪（`atlas-rain-ripple-36`）；
/// - 局部灾区／丰年州郡：浮现手绘天象微章（`fx-weather-snow` / `drought` / `storm` / `fx-plague` / `fx-harvest`）。
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

    private let edgeTint = CAGradientLayer()
    private let cloudEmitter = CAEmitterLayer()
    private let emitter = CAEmitterLayer()
    private var rippleLayers: [SpriteSheetLayer] = []
    private var currentMode: Mode = .off
    private var zoneLayers: [Int: (layer: CALayer, zone: Zone)] = [:]
    private var lastCamera: MapCamera?
    private var lastViewport: CGSize = .zero

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        clipsToBounds = true

        edgeTint.type = .axial
        edgeTint.startPoint = CGPoint(x: 0.5, y: 0)
        edgeTint.endPoint = CGPoint(x: 0.5, y: 0.26)
        edgeTint.opacity = 0
        layer.addSublayer(edgeTint)

        cloudEmitter.emitterShape = .rectangle
        cloudEmitter.renderMode = .unordered
        cloudEmitter.birthRate = 0
        layer.addSublayer(cloudEmitter)

        for _ in 0..<4 {
            let rl = SpriteSheetLayer(spec: .atlasRainRipple36)
            rl.bounds = CGRect(x: 0, y: 0, width: 68, height: 68)
            rl.opacity = 0
            rl.isHidden = true
            layer.addSublayer(rl)
            rippleLayers.append(rl)
        }

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
        cloudEmitter.frame = bounds
        cloudEmitter.emitterPosition = CGPoint(x: -90, y: bounds.height * 0.22)
        cloudEmitter.emitterSize = CGSize(width: 40, height: max(80, bounds.height * 0.42))
        emitter.frame = bounds
        emitter.emitterPosition = CGPoint(x: bounds.width * 0.52, y: -18)
        emitter.emitterSize = CGSize(width: max(1, bounds.width * 1.35), height: 4)
        let anchors: [(CGFloat, CGFloat)] = [(0.24, 0.34), (0.72, 0.30), (0.36, 0.68), (0.76, 0.64)]
        for (idx, rl) in rippleLayers.enumerated() where idx < anchors.count {
            rl.position = CGPoint(x: bounds.width * anchors[idx].0, y: bounds.height * anchors[idx].1)
        }
        CATransaction.commit()
    }

    private static let sunMote: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { ctx in
        let colors = [
            UIColor(red: 1.0, green: 0.94, blue: 0.68, alpha: 0.90).cgColor,
            UIColor(red: 1.0, green: 0.84, blue: 0.42, alpha: 0.0).cgColor
        ] as CFArray
        if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
            ctx.cgContext.drawRadialGradient(g, startCenter: CGPoint(x: 12, y: 12), startRadius: 0, endCenter: CGPoint(x: 12, y: 12), endRadius: 12, options: [])
        }
    }.cgImage

    /// 按目标屏幕点尺寸（pt）自适应归一化任意高分贴图像素尺寸，彻底防止 96px/256px 手绘粒子放大成巨块。
    private static func normScale(_ cg: CGImage?, targetPt: CGFloat) -> CGFloat {
        guard let cg else { return 0.2 }
        let px = CGFloat(max(cg.width, cg.height))
        let screenScale = UIScreen.main.scale
        return (targetPt * screenScale) / max(1, px * screenScale)
    }

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
            cloudEmitter.birthRate = 0
            cloudEmitter.emitterCells = nil
            edgeTint.opacity = 0
            for rl in rippleLayers { rl.stop(); rl.isHidden = true; rl.opacity = 0 }
            return
        }

        func makeCell(
            image: CGImage?,
            targetPt: CGFloat,
            ptRange: CGFloat,
            color: UIColor = .white,
            rate: Float,
            life: Float,
            vel: CGFloat,
            velRange: CGFloat,
            spin: CGFloat,
            lon: CGFloat,
            range: CGFloat,
            xAcc: CGFloat,
            yAcc: CGFloat,
            emissionRotation: CGFloat? = nil
        ) -> CAEmitterCell {
            let c = CAEmitterCell()
            c.contents = image
            c.color = color.cgColor
            c.birthRate = rate
            c.lifetime = life
            c.lifetimeRange = life * 0.24
            c.velocity = vel
            c.velocityRange = velRange
            c.emissionLongitude = lon
            c.emissionRange = range
            c.scale = Self.normScale(image, targetPt: targetPt)
            c.scaleRange = Self.normScale(image, targetPt: ptRange)
            c.spin = spin
            c.spinRange = spin * 1.15
            c.xAcceleration = xAcc
            c.yAcceleration = yAcc
            c.alphaRange = 0.22
            c.alphaSpeed = -0.08 / max(1, life)
            if let rot = emissionRotation {
                c.spin = 0
                c.spinRange = 0
                // 让细长雨丝沿下落方向自然倾斜对齐
                c.setValue("plane", forKey: "particleType")
                c.setValue(rot, forKey: "orientationLongitude")
            }
            return c
        }

        func configureClouds(tint: UIColor, rate: Float, speed: CGFloat) {
            guard let mist = BundleArt.fxCloudMist?.cgImage, rate > 0 else {
                cloudEmitter.birthRate = 0
                cloudEmitter.emitterCells = nil
                return
            }
            let c = CAEmitterCell()
            c.contents = mist
            c.color = tint.cgColor
            c.birthRate = rate
            c.lifetime = 26
            c.lifetimeRange = 6
            c.velocity = speed
            c.velocityRange = speed * 0.35
            c.emissionLongitude = 0
            c.emissionRange = 0.08
            c.scale = Self.normScale(mist, targetPt: 230)
            c.scaleRange = Self.normScale(mist, targetPt: 70)
            c.alphaRange = 0.08
            c.alphaSpeed = -0.006
            cloudEmitter.emitterCells = [c]
            cloudEmitter.birthRate = 1
        }

        // 默认隐藏雨滴涟漪，仅在霖雨／洪涝开启 30fps 序列帧水花
        for (idx, rl) in rippleLayers.enumerated() {
            if mode == .stormRain {
                rl.isHidden = false
                rl.opacity = 0.58
                rl.configure(spec: .atlasRainRipple36, state: .idle, fps: 30.0, phaseOffset: Double(idx) * 0.31)
            } else {
                rl.stop()
                rl.isHidden = true
                rl.opacity = 0
            }
        }

        let petalCG = BundleArt.fxPetal?.cgImage
        let mapleCG = BundleArt.fxMaple?.cgImage
        let snowCG = BundleArt.fxSnowflake?.cgImage
        let rainCG = BundleArt.fxRaindrop?.cgImage

        switch mode {
        case .off:
            break
        case .spring:
            emitter.emitterCells = [
                makeCell(image: petalCG, targetPt: 15.5, ptRange: 4.5, color: UIColor(white: 1, alpha: 0.88),
                         rate: 4.2, life: 12.5, vel: 34, velRange: 12, spin: 0.95, lon: .pi * 0.43, range: 0.32, xAcc: 9, yAcc: 2),
                makeCell(image: petalCG, targetPt: 10.5, ptRange: 3.0, color: UIColor(red: 1.0, green: 0.93, blue: 0.95, alpha: 0.62),
                         rate: 3.0, life: 14.0, vel: 22, velRange: 8, spin: -0.65, lon: .pi * 0.45, range: 0.28, xAcc: 6, yAcc: 1.5)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.94, green: 0.99, blue: 0.96, alpha: 0.22), rate: 0.22, speed: 18)
            edgeTint.colors = [UIColor(red: 0.90, green: 0.98, blue: 0.92, alpha: 0.12).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .summer:
            emitter.emitterCells = [
                makeCell(image: Self.sunMote, targetPt: 11.0, ptRange: 4.5, color: UIColor(red: 1.0, green: 0.94, blue: 0.68, alpha: 0.56),
                         rate: 3.4, life: 11.0, vel: 18, velRange: 9, spin: 0.15, lon: .pi * 0.48, range: 0.45, xAcc: 4, yAcc: 1)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 1.0, green: 0.98, blue: 0.92, alpha: 0.16), rate: 0.16, speed: 15)
            edgeTint.colors = [UIColor(red: 1.0, green: 0.93, blue: 0.68, alpha: 0.13).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .summerDrought:
            emitter.emitterCells = [
                makeCell(image: Self.sunMote, targetPt: 12.0, ptRange: 5.0, color: UIColor(red: 0.96, green: 0.68, blue: 0.28, alpha: 0.66),
                         rate: 8.5, life: 8.0, vel: 50, velRange: 20, spin: 0.3, lon: .pi * 0.32, range: 0.26, xAcc: 20, yAcc: -3)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.98, green: 0.86, blue: 0.64, alpha: 0.18), rate: 0.18, speed: 24)
            edgeTint.colors = [UIColor(red: 0.96, green: 0.64, blue: 0.22, alpha: 0.24).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .autumn:
            emitter.emitterCells = [
                makeCell(image: mapleCG, targetPt: 17.5, ptRange: 5.0, color: UIColor(white: 1, alpha: 0.90),
                         rate: 4.6, life: 11.5, vel: 38, velRange: 14, spin: 1.25, lon: .pi * 0.41, range: 0.32, xAcc: 13, yAcc: 3.5),
                makeCell(image: mapleCG, targetPt: 11.5, ptRange: 3.5, color: UIColor(red: 1.0, green: 0.86, blue: 0.64, alpha: 0.68),
                         rate: 3.2, life: 13.0, vel: 25, velRange: 10, spin: -0.85, lon: .pi * 0.43, range: 0.28, xAcc: 9, yAcc: 2.5)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.98, green: 0.92, blue: 0.82, alpha: 0.20), rate: 0.20, speed: 19)
            edgeTint.colors = [UIColor(red: 0.96, green: 0.76, blue: 0.42, alpha: 0.14).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .winter:
            emitter.emitterCells = [
                makeCell(image: snowCG, targetPt: 16.5, ptRange: 5.5, color: UIColor(white: 1, alpha: 0.92),
                         rate: 7.5, life: 11.5, vel: 42, velRange: 15, spin: 0.55, lon: .pi * 0.54, range: 0.30, xAcc: 8, yAcc: 3),
                makeCell(image: snowCG, targetPt: 10.0, ptRange: 3.5, color: UIColor(red: 0.90, green: 0.96, blue: 1.0, alpha: 0.68),
                         rate: 6.5, life: 13.5, vel: 24, velRange: 9, spin: -0.35, lon: .pi * 0.56, range: 0.26, xAcc: 5, yAcc: 2)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.92, green: 0.96, blue: 1.0, alpha: 0.24), rate: 0.24, speed: 17)
            edgeTint.colors = [UIColor(red: 0.84, green: 0.93, blue: 1.0, alpha: 0.20).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .winterBlizzard:
            emitter.emitterCells = [
                makeCell(image: snowCG, targetPt: 19.0, ptRange: 6.5, color: UIColor(white: 1, alpha: 0.96),
                         rate: 16.0, life: 8.5, vel: 78, velRange: 26, spin: 1.15, lon: .pi * 0.62, range: 0.24, xAcc: 24, yAcc: 8),
                makeCell(image: snowCG, targetPt: 11.5, ptRange: 4.0, color: UIColor(red: 0.88, green: 0.95, blue: 1.0, alpha: 0.76),
                         rate: 13.0, life: 10.0, vel: 50, velRange: 18, spin: -0.80, lon: .pi * 0.60, range: 0.22, xAcc: 16, yAcc: 6)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.88, green: 0.94, blue: 1.0, alpha: 0.34), rate: 0.38, speed: 34)
            edgeTint.colors = [UIColor(red: 0.80, green: 0.91, blue: 1.0, alpha: 0.30).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .stormRain:
            emitter.emitterCells = [
                makeCell(image: rainCG, targetPt: 30.0, ptRange: 8.0, color: UIColor(white: 1, alpha: 0.82),
                         rate: 28.0, life: 2.6, vel: 310, velRange: 70, spin: 0, lon: .pi * 0.56, range: 0.04, xAcc: -16, yAcc: 130),
                makeCell(image: rainCG, targetPt: 20.0, ptRange: 5.0, color: UIColor(red: 0.84, green: 0.93, blue: 1.0, alpha: 0.54),
                         rate: 22.0, life: 3.2, vel: 220, velRange: 50, spin: 0, lon: .pi * 0.56, range: 0.05, xAcc: -12, yAcc: 90)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.58, green: 0.66, blue: 0.76, alpha: 0.32), rate: 0.36, speed: 28)
            edgeTint.colors = [UIColor(red: 0.24, green: 0.36, blue: 0.52, alpha: 0.24).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        }
    }

    /// 局部天时／灾异州郡上空的手绘无圆框宋画微标（`fx-weather-snow` / `drought` / `storm` / `fx-plague` / `fx-harvest`）。
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
        let k = CGFloat(max(0.78, min(1.22, camera.scale * 0.72)))

        for z in zones.prefix(8) {
            let entry: (layer: CALayer, zone: Zone)
            if let existing = zoneLayers[z.province], existing.zone.kind == z.kind {
                entry = (existing.layer, z)
                zoneLayers[z.province] = entry
            } else {
                zoneLayers[z.province]?.layer.removeFromSuperlayer()
                let l = makeZoneLayer(kind: z.kind)
                layer.insertSublayer(l, below: cloudEmitter)
                entry = (l, z)
                zoneLayers[z.province] = entry
            }
            let p = camera.toScreen(x: z.x, y: z.y, viewport: vp)
            let pt = CGPoint(x: p.x, y: p.y - 18 * Double(k))
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
        root.bounds = CGRect(x: 0, y: 0, width: 28, height: 28)

        let artImage: UIImage? = {
            switch kind {
            case 1: return BundleArt.fxWeatherSnow
            case 2: return BundleArt.fxWeatherDrought
            case 3: return BundleArt.fxWeatherStorm
            case 4: return BundleArt.fxPlague
            default: return BundleArt.fxHarvest
            }
        }()

        if let cg = artImage?.cgImage {
            let sprite = CALayer()
            sprite.frame = root.bounds
            sprite.contents = cg
            sprite.contentsGravity = .resizeAspect
            sprite.minificationFilter = .trilinear
            sprite.magnificationFilter = .linear
            sprite.opacity = 0.92
            root.addSublayer(sprite)
        }

        let bob = CAKeyframeAnimation(keyPath: "transform.translation.y")
        bob.values = [0, -2.4, 0, 1.5, 0]
        bob.duration = 2.8
        bob.repeatCount = .infinity
        bob.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        root.add(EffectsView.calm(bob), forKey: "zoneFloat")
        return root
    }
}
