import UIKit
import LieguojiCore

/// 四季流转与天时灾异实时大气画卷层（100% 公开 CoreAnimation API，零私有 KVC，弹窗或发热时自动彻底暂停）：
/// - 仲春：轻舞手绘桃花瓣（`fx-petal`）＋柔和春岚流云（`fx-cloud-mist`）；
/// - 盛夏：暖金曦光微尘与轻云，大旱期间切换暖赭干风微尘；
/// - 金秋：飘飞手绘丹枫叶（`fx-maple`）＋秋山薄霭；
/// - 隆冬：远近双景深手绘飞雪（`fx-snowflake`）＋寒霜天幕晕染，暴雪期间风雪加密；
/// - 霖雨／洪涝：斜风银雨（`fx-raindrop`，纯公开属性零 KVC）＋ 2 处 30fps 雨澜水花（`atlas-rain-ripple-36`）；
/// - 局部灾区／丰年州郡：浮现手绘天象微章并轻柔起伏。
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
    private var activeEmitterBirthRate: Float = 0
    private var activeCloudBirthRate: Float = 0
    private var isPaused = false
    private var zoneLayers: [Int: (layer: CALayer, zone: Zone)] = [:]
    private var wasZonesEmpty = true
    private var lastAppliedZones: [Zone] = []
    private var lastZoneScale: Double = -1
    private var lastLayoutBounds: CGRect = .zero

    /// Fast-path check for pure-pan callers: true when no local weather zone layers exist or were active.
    var isZonesEmpty: Bool { zoneLayers.isEmpty && wasZonesEmpty }

    /// 立即暂停/恢复全部天气粒子发射器与水波序列帧动画（二级菜单弹出时零后台开销、防发烫）。
    func setPaused(_ paused: Bool) {
        guard isPaused != paused else { return }
        isPaused = paused
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        applyEmitterPaused(emitter, activeRate: currentMode == .off ? 0 : activeEmitterBirthRate, paused: paused)
        applyEmitterPaused(cloudEmitter, activeRate: currentMode == .off ? 0 : activeCloudBirthRate, paused: paused)
        for rl in rippleLayers {
            applyLayerClockPaused(rl, paused: paused)
        }
        for (_, entry) in zoneLayers {
            applyZoneLayerPaused(entry.layer, paused: paused)
        }
    }

    private func applyEmitterPaused(_ target: CAEmitterLayer, activeRate: Float, paused: Bool) {
        target.birthRate = paused ? 0 : activeRate
        applyLayerClockPaused(target, paused: paused)
    }

    private func applyLayerClockPaused(_ target: CALayer, paused: Bool) {
        if paused {
            if target.speed != 0 {
                let pausedTime = target.convertTime(CACurrentMediaTime(), from: nil)
                target.speed = 0
                target.timeOffset = pausedTime
            }
        } else if target.speed == 0 {
            let pausedTime = target.timeOffset
            target.speed = 1
            target.timeOffset = 0
            target.beginTime = 0
            target.beginTime = target.convertTime(CACurrentMediaTime(), from: nil) - pausedTime
        }
    }

    private func applyZoneLayerPaused(_ root: CALayer, paused: Bool) {
        if let subs = root.sublayers {
            for sub in subs {
                if let localEmitter = sub as? CAEmitterLayer {
                    applyEmitterPaused(localEmitter, activeRate: 1, paused: paused)
                } else {
                    applyLayerClockPaused(sub, paused: paused)
                }
            }
        }
        applyLayerClockPaused(root, paused: paused)
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        clipsToBounds = true

        edgeTint.type = .axial
        edgeTint.startPoint = CGPoint(x: 0.5, y: 0)
        edgeTint.endPoint = CGPoint(x: 0.5, y: 0.24)
        edgeTint.opacity = 0
        layer.addSublayer(edgeTint)

        cloudEmitter.emitterShape = .rectangle
        cloudEmitter.renderMode = .unordered
        cloudEmitter.birthRate = 0
        layer.addSublayer(cloudEmitter)

        for _ in 0..<2 {
            let rl = SpriteSheetLayer(spec: .atlasRainRipple36)
            rl.bounds = CGRect(x: 0, y: 0, width: 64, height: 64)
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

    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        if newWindow == nil && currentMode != .off {
            currentMode = .off
            applyEmitterMode(.off)
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds != lastLayoutBounds,
              bounds.width.isFinite, bounds.height.isFinite,
              bounds.width > 0, bounds.height > 0 else { return }
        lastLayoutBounds = bounds
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        edgeTint.frame = bounds
        cloudEmitter.frame = bounds
        cloudEmitter.emitterPosition = CGPoint(x: -90, y: bounds.height * 0.22)
        cloudEmitter.emitterSize = CGSize(width: 40, height: max(80, bounds.height * 0.38))
        emitter.frame = bounds
        emitter.emitterPosition = CGPoint(x: bounds.width * 0.52, y: -18)
        emitter.emitterSize = CGSize(width: max(1, bounds.width * 1.32), height: 4)
        let anchors: [(CGFloat, CGFloat)] = [(0.28, 0.36), (0.72, 0.64)]
        for (idx, rl) in rippleLayers.enumerated() where idx < anchors.count {
            rl.position = CGPoint(x: bounds.width * anchors[idx].0, y: bounds.height * anchors[idx].1)
        }
        CATransaction.commit()
    }

    private static let sunMote: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { ctx in
        let colors = [
            UIColor(red: 1.0, green: 0.94, blue: 0.68, alpha: 0.88).cgColor,
            UIColor(red: 1.0, green: 0.84, blue: 0.42, alpha: 0.0).cgColor
        ] as CFArray
        if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
            ctx.cgContext.drawRadialGradient(g, startCenter: CGPoint(x: 12, y: 12), startRadius: 0, endCenter: CGPoint(x: 12, y: 12), endRadius: 12, options: [])
        }
    }.cgImage

    private static func normScale(_ cg: CGImage?, targetPt: CGFloat) -> CGFloat {
        guard let cg else { return 0.2 }
        let px = CGFloat(max(cg.width, cg.height))
        return targetPt / max(1, px)
    }

    func update(seasonPhase: Float, zones: [Zone], camera: MapCamera, viewport: CGSize, active: Bool, purePan: Bool = false) {
        guard !isPaused else { return }
        guard viewport.width.isFinite, viewport.height.isFinite, camera.isValid else { return }
        if purePan {
            // Pure-pan fast path: never touch emitter configs or allocate collections;
            // return immediately when no zone layers exist, otherwise reposition active zone layers only.
            guard !zoneLayers.isEmpty else {
                if zones.isEmpty { wasZonesEmpty = true }
                return
            }
            guard viewport.width > 10, viewport.height > 0 else { return }
            let vp = (width: Double(viewport.width), height: Double(viewport.height))
            let visible = CGRect(origin: .zero, size: viewport).insetBy(dx: -40, dy: -40)
            let scaleOK = camera.scale >= 0.42
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            defer { CATransaction.commit() }
            for (_, entry) in zoneLayers {
                let p = camera.toScreen(x: entry.zone.x, y: entry.zone.y, viewport: vp)
                let pt = CGPoint(x: p.x, y: p.y)
                let onScreen = scaleOK && pt.x.isFinite && pt.y.isFinite && visible.contains(pt)
                if entry.layer.isHidden == onScreen { entry.layer.isHidden = !onScreen }
                if onScreen {
                    entry.layer.position = pt
                }
            }
            return
        }

        let reduce = UIAccessibility.isReduceMotionEnabled
        let enableParticles = active && EffectsView.particles && !Energy.hot && !reduce && seasonPhase.isFinite && seasonPhase >= 0 && viewport.width > 10

        var hasBlizzard = false
        var hasDrought = false
        var hasFlood = false
        if enableParticles && !zones.isEmpty {
            for z in zones {
                if z.kind == 1 { hasBlizzard = true }
                else if z.kind == 2 { hasDrought = true }
                else if z.kind == 3 { hasFlood = true }
            }
        }

        let targetMode: Mode = {
            guard enableParticles else { return .off }
            if hasBlizzard { return .winterBlizzard }
            if hasFlood { return .stormRain }
            if seasonPhase < (2.0 / 12.0) || seasonPhase >= (11.0 / 12.0) { return .winter }
            if seasonPhase < (5.0 / 12.0) { return .spring }
            if seasonPhase < (8.0 / 12.0) { return hasDrought ? .summerDrought : .summer }
            return .autumn
        }()

        if targetMode != currentMode {
            currentMode = targetMode
            applyEmitterMode(targetMode)
        }

        let effectiveZones = active && !reduce ? zones : []
        if effectiveZones.isEmpty && wasZonesEmpty && zoneLayers.isEmpty {
            return
        }
        updateZoneMarkers(zones: effectiveZones, camera: camera, viewport: viewport)
    }

    private func applyEmitterMode(_ mode: Mode) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        guard mode != .off else {
            activeEmitterBirthRate = 0
            activeCloudBirthRate = 0
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
            yAcc: CGFloat
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
            c.alphaRange = 0.20
            c.alphaSpeed = -0.08 / max(1, life)
            return c
        }

        func configureClouds(tint: UIColor, rate: Float, speed: CGFloat) {
            // 流云投影已由 Metal landFragment 纯解析零开销承担；关闭全屏 210pt CAEmitterLayer 大贴图叠合以大幅降低 GPU 合成负载与掉帧
            cloudEmitter.birthRate = 0
            cloudEmitter.emitterCells = nil
        }

        for (idx, rl) in rippleLayers.enumerated() {
            if mode == .stormRain {
                rl.isHidden = false
                rl.opacity = 0.52
                rl.configure(spec: .atlasRainRipple36, state: .idle, fps: 30.0, phaseOffset: Double(idx) * 0.42)
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
                makeCell(image: petalCG, targetPt: 14.5, ptRange: 4.0, color: UIColor(white: 1, alpha: 0.85),
                         rate: 3.4, life: 12.5, vel: 32, velRange: 11, spin: 0.90, lon: .pi * 0.43, range: 0.30, xAcc: 8, yAcc: 2),
                makeCell(image: petalCG, targetPt: 10.0, ptRange: 2.5, color: UIColor(red: 1.0, green: 0.93, blue: 0.95, alpha: 0.58),
                         rate: 2.2, life: 14.0, vel: 21, velRange: 7, spin: -0.60, lon: .pi * 0.45, range: 0.26, xAcc: 5, yAcc: 1.4)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.94, green: 0.99, blue: 0.96, alpha: 0.18), rate: 0.18, speed: 16)
            edgeTint.colors = [UIColor(red: 0.90, green: 0.98, blue: 0.92, alpha: 0.10).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .summer:
            emitter.emitterCells = [
                makeCell(image: Self.sunMote, targetPt: 10.5, ptRange: 4.0, color: UIColor(red: 1.0, green: 0.94, blue: 0.68, alpha: 0.52),
                         rate: 2.8, life: 11.0, vel: 17, velRange: 8, spin: 0.15, lon: .pi * 0.48, range: 0.42, xAcc: 4, yAcc: 1)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 1.0, green: 0.98, blue: 0.92, alpha: 0.14), rate: 0.14, speed: 14)
            edgeTint.colors = [UIColor(red: 1.0, green: 0.93, blue: 0.68, alpha: 0.10).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .summerDrought:
            emitter.emitterCells = [
                makeCell(image: Self.sunMote, targetPt: 11.5, ptRange: 4.5, color: UIColor(red: 0.96, green: 0.68, blue: 0.28, alpha: 0.60),
                         rate: 6.2, life: 8.0, vel: 46, velRange: 18, spin: 0.3, lon: .pi * 0.32, range: 0.24, xAcc: 18, yAcc: -3)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.98, green: 0.86, blue: 0.64, alpha: 0.16), rate: 0.16, speed: 22)
            edgeTint.colors = [UIColor(red: 0.96, green: 0.64, blue: 0.22, alpha: 0.20).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .autumn:
            emitter.emitterCells = [
                makeCell(image: mapleCG, targetPt: 16.5, ptRange: 4.5, color: UIColor(white: 1, alpha: 0.88),
                         rate: 3.8, life: 11.5, vel: 36, velRange: 13, spin: 1.18, lon: .pi * 0.41, range: 0.30, xAcc: 12, yAcc: 3.2),
                makeCell(image: mapleCG, targetPt: 11.0, ptRange: 3.0, color: UIColor(red: 1.0, green: 0.86, blue: 0.64, alpha: 0.62),
                         rate: 2.5, life: 13.0, vel: 24, velRange: 9, spin: -0.80, lon: .pi * 0.43, range: 0.26, xAcc: 8, yAcc: 2.2)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.98, green: 0.92, blue: 0.82, alpha: 0.17), rate: 0.16, speed: 18)
            edgeTint.colors = [UIColor(red: 0.96, green: 0.76, blue: 0.42, alpha: 0.12).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .winter:
            emitter.emitterCells = [
                makeCell(image: snowCG, targetPt: 15.5, ptRange: 5.0, color: UIColor(white: 1, alpha: 0.90),
                         rate: 5.5, life: 11.5, vel: 40, velRange: 14, spin: 0.50, lon: .pi * 0.54, range: 0.28, xAcc: 7, yAcc: 3),
                makeCell(image: snowCG, targetPt: 9.5, ptRange: 3.0, color: UIColor(red: 0.90, green: 0.96, blue: 1.0, alpha: 0.64),
                         rate: 4.5, life: 13.5, vel: 23, velRange: 8, spin: -0.32, lon: .pi * 0.56, range: 0.24, xAcc: 4, yAcc: 2)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.92, green: 0.96, blue: 1.0, alpha: 0.20), rate: 0.20, speed: 16)
            edgeTint.colors = [UIColor(red: 0.84, green: 0.93, blue: 1.0, alpha: 0.16).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .winterBlizzard:
            emitter.emitterCells = [
                makeCell(image: snowCG, targetPt: 18.0, ptRange: 5.5, color: UIColor(white: 1, alpha: 0.94),
                         rate: 10.5, life: 8.5, vel: 72, velRange: 24, spin: 1.05, lon: .pi * 0.62, range: 0.22, xAcc: 20, yAcc: 7),
                makeCell(image: snowCG, targetPt: 11.0, ptRange: 3.5, color: UIColor(red: 0.88, green: 0.95, blue: 1.0, alpha: 0.72),
                         rate: 8.5, life: 10.0, vel: 46, velRange: 16, spin: -0.72, lon: .pi * 0.60, range: 0.20, xAcc: 14, yAcc: 5)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.88, green: 0.94, blue: 1.0, alpha: 0.28), rate: 0.28, speed: 30)
            edgeTint.colors = [UIColor(red: 0.80, green: 0.91, blue: 1.0, alpha: 0.24).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1

        case .stormRain:
            emitter.emitterCells = [
                makeCell(image: rainCG, targetPt: 26.0, ptRange: 6.0, color: UIColor(white: 1, alpha: 0.78),
                         rate: 16.0, life: 2.5, vel: 290, velRange: 60, spin: 0, lon: .pi * 0.54, range: 0.04, xAcc: -12, yAcc: 120),
                makeCell(image: rainCG, targetPt: 18.0, ptRange: 4.5, color: UIColor(red: 0.84, green: 0.93, blue: 1.0, alpha: 0.50),
                         rate: 12.0, life: 3.0, vel: 210, velRange: 45, spin: 0, lon: .pi * 0.54, range: 0.05, xAcc: -10, yAcc: 85)
            ]
            emitter.birthRate = 1
            configureClouds(tint: UIColor(red: 0.58, green: 0.66, blue: 0.76, alpha: 0.28), rate: 0.26, speed: 24)
            edgeTint.colors = [UIColor(red: 0.24, green: 0.36, blue: 0.52, alpha: 0.20).cgColor, UIColor.clear.cgColor]
            edgeTint.opacity = 1
        }
        activeEmitterBirthRate = 1
        activeCloudBirthRate = 0
        if isPaused {
            applyEmitterPaused(emitter, activeRate: activeEmitterBirthRate, paused: true)
            applyEmitterPaused(cloudEmitter, activeRate: activeCloudBirthRate, paused: true)
            for rl in rippleLayers { applyLayerClockPaused(rl, paused: true) }
        }
    }

    private func updateZoneMarkers(zones: [Zone], camera: MapCamera, viewport: CGSize) {
        guard viewport.width.isFinite, viewport.height.isFinite, camera.isValid else { return }
        if zones.isEmpty || viewport.width <= 10 || viewport.height <= 0 {
            if !zoneLayers.isEmpty {
                CATransaction.begin()
                CATransaction.setDisableActions(true)
                for (_, entry) in zoneLayers { entry.layer.removeFromSuperlayer() }
                zoneLayers.removeAll()
                CATransaction.commit()
            }
            lastAppliedZones = []
            lastZoneScale = -1
            wasZonesEmpty = true
            return
        }

        let visibleZones = Array(zones.prefix(6))
        wasZonesEmpty = false

        let zonesChanged = visibleZones != lastAppliedZones
        let scaleChanged = abs(camera.scale - lastZoneScale) > 1e-6

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        if zonesChanged {
            let keep = Set(visibleZones.map(\.province))
            for (pid, entry) in zoneLayers where !keep.contains(pid) {
                entry.layer.removeFromSuperlayer()
                zoneLayers[pid] = nil
            }
            lastAppliedZones = visibleZones
        }

        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        let visible = CGRect(origin: .zero, size: viewport).insetBy(dx: -40, dy: -40)
        let rawK = CGFloat(max(0.78, min(1.18, camera.scale * 0.72)))
        let k = rawK.isFinite ? rawK : 1.0
        let scaleOK = camera.scale >= 0.42

        for z in visibleZones {
            var created = false
            let entry: (layer: CALayer, zone: Zone)
            if let existing = zoneLayers[z.province], existing.zone.kind == z.kind {
                entry = (existing.layer, z)
                if zonesChanged { zoneLayers[z.province] = entry }
            } else {
                zoneLayers[z.province]?.layer.removeFromSuperlayer()
                let l = makeZoneLayer(kind: z.kind)
                layer.insertSublayer(l, below: cloudEmitter)
                entry = (l, z)
                zoneLayers[z.province] = entry
                created = true
            }
            if scaleChanged || created {
                entry.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k))
            }
            let p = camera.toScreen(x: z.x, y: z.y, viewport: vp)
            let pt = CGPoint(x: p.x, y: p.y)
            let onScreen = scaleOK && pt.x.isFinite && pt.y.isFinite && visible.contains(pt)
            if entry.layer.isHidden == onScreen { entry.layer.isHidden = !onScreen }
            if onScreen {
                entry.layer.position = pt
            }
        }
        lastZoneScale = camera.scale
    }

    private static let softHalo: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 48, height: 48)).image { ctx in
        let colors = [
            UIColor.white.withAlphaComponent(0.55).cgColor,
            UIColor.white.withAlphaComponent(0.18).cgColor,
            UIColor.white.withAlphaComponent(0.0).cgColor
        ] as CFArray
        if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.55, 1]) {
            ctx.cgContext.drawRadialGradient(g, startCenter: CGPoint(x: 24, y: 24), startRadius: 0, endCenter: CGPoint(x: 24, y: 24), endRadius: 24, options: [])
        }
    }.cgImage

    /// 彻底废除违和的旧版贴纸图标，改为与地图融为一体的局部实景大气粒子与涟漪（飘雪旋风 / 旱地浮尘 / 雨澜波纹 / 瘴雾游气 / 丰年金辉）。
    private func makeZoneLayer(kind: Int) -> CALayer {
        let root = CALayer()
        root.bounds = CGRect(x: 0, y: 0, width: 76, height: 76)

        if kind == 3 {
            // 洪涝：局部 36 帧雨澜涟漪与微雨斜丝，直接融于地图水面/地貌
            let ripple = SpriteSheetLayer(spec: .atlasRainRipple36)
            ripple.frame = CGRect(x: 10, y: 10, width: 56, height: 56)
            ripple.opacity = 0.62
            ripple.configure(spec: .atlasRainRipple36, state: .idle, fps: 24.0, phaseOffset: 0.15)
            root.addSublayer(ripple)
            return root
        }

        let localEmitter = CAEmitterLayer()
        localEmitter.frame = root.bounds
        localEmitter.emitterPosition = CGPoint(x: 38, y: 38)
        localEmitter.emitterShape = .circle
        localEmitter.emitterSize = CGSize(width: 52, height: 42)
        localEmitter.renderMode = .unordered

        let c = CAEmitterCell()
        switch kind {
        case 1:
            // 暴雪灾区：局部加密细雪随风斜飘（零雪花图标贴纸）
            c.contents = BundleArt.fxSnowflake?.cgImage ?? Self.softHalo
            c.color = UIColor(red: 0.94, green: 0.98, blue: 1.0, alpha: 0.90).cgColor
            c.birthRate = 6.5
            c.lifetime = 2.6
            c.lifetimeRange = 0.8
            c.velocity = 18
            c.velocityRange = 8
            c.emissionLongitude = .pi * 0.62
            c.emissionRange = 0.45
            c.scale = Self.normScale(BundleArt.fxSnowflake?.cgImage ?? Self.softHalo, targetPt: 11.0)
            c.scaleRange = Self.normScale(BundleArt.fxSnowflake?.cgImage ?? Self.softHalo, targetPt: 4.0)
            c.spin = 0.85
            c.alphaSpeed = -0.30
        case 2:
            // 赤地大旱：缓慢升腾的赭金燥热浮尘（零太阳贴纸）
            c.contents = Self.sunMote
            c.color = UIColor(red: 0.92, green: 0.58, blue: 0.20, alpha: 0.62).cgColor
            c.birthRate = 4.2
            c.lifetime = 3.0
            c.lifetimeRange = 0.9
            c.velocity = 12
            c.velocityRange = 5
            c.emissionLongitude = -.pi * 0.44
            c.emissionRange = 0.40
            c.scale = Self.normScale(Self.sunMote, targetPt: 13.0)
            c.scaleRange = Self.normScale(Self.sunMote, targetPt: 4.5)
            c.alphaSpeed = -0.22
        case 4:
            // 疾疫瘴区：贴地盘旋的低饱和枯青薄瘴气雾（零骷髅/毒泡贴纸）
            c.contents = Self.softHalo
            c.color = UIColor(red: 0.48, green: 0.54, blue: 0.34, alpha: 0.34).cgColor
            c.birthRate = 2.6
            c.lifetime = 3.8
            c.lifetimeRange = 1.0
            c.velocity = 7
            c.velocityRange = 4
            c.emissionRange = .pi * 2
            c.scale = Self.normScale(Self.softHalo, targetPt: 28.0)
            c.scaleSpeed = 0.08
            c.alphaSpeed = -0.14
        default:
            // 金秋丰登：轻盈暖金麦香曦光微尘（零麦穗贴纸）
            c.contents = Self.sunMote
            c.color = UIColor(red: 0.98, green: 0.82, blue: 0.34, alpha: 0.68).cgColor
            c.birthRate = 3.8
            c.lifetime = 2.8
            c.lifetimeRange = 0.8
            c.velocity = 10
            c.velocityRange = 5
            c.emissionLongitude = -.pi * 0.5
            c.emissionRange = 0.7
            c.scale = Self.normScale(Self.sunMote, targetPt: 10.5)
            c.scaleRange = Self.normScale(Self.sunMote, targetPt: 3.5)
            c.alphaSpeed = -0.24
        }
        localEmitter.emitterCells = [c]
        root.addSublayer(localEmitter)
        if isPaused { applyZoneLayerPaused(root, paused: true) }
        return root
    }
}
