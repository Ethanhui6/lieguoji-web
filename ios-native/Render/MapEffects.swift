import UIKit
import LieguojiCore

/// Live war presentation drawn over the map with Core Animation (no per-frame work while the
/// camera rests), after the original and the web (CombatOverlay47, WarEffects47):
/// - battles: the original BattleSword clip (40 frames at 12 Hz) between armies in contact;
/// - sieges: the remaining resistance as a ring in the besieger's colour;
/// - captures: the province flashes with the conqueror's colour;
/// - a declaration: a red arrow flowing from the attacker's capital to the defender's for 2 s;
/// - claimed provinces: the war-claim icon in the claimant's colour drops in one by one, pulses
///   for 3 s and fades;
/// - peace: a dove rises above every participant's capital and fades.
struct MapEffects: Equatable {
    /// One side of a battle: the state's name and colour for the battle tag.
    struct Side: Equatable { let name: String; let r: Double; let g: Double; let b: Double }
    struct Battle: Equatable {
        let key: String; let x: Double; let y: Double; var left: Side? = nil; var right: Side? = nil
        /// The two armies in contact (map units): the clash line runs between them in their colours.
        var ax = 0.0, ay = 0.0, bx = 0.0, by = 0.0
        /// Troops on each side, for the strength bar over the fight.
        var leftTroops = 0, rightTroops = 0
    }
    struct Burst: Equatable {
        enum Kind { case destroyed, founded, shock, harvest, disaster, talent, plague, trade, regime, coup }
        let id: String; let x: Double; let y: Double; let kind: Kind; let r: Double; let g: Double; let b: Double; var unit = ""
        /// 何时开始（秒，自收到这一步起）：一步里相继阵亡的军队错开播放。
        var delay = 0.0
        /// 同处合并的数量（阵亡几支合为一处）。
        var count = 1
    }
    struct Siege: Equatable { let key: String; let x: Double; let y: Double; let progress: Double; let r: Double; let g: Double; let b: Double }
    struct Flash: Equatable { let id: String; let x: Double; let y: Double; let r: Double; let g: Double; let b: Double }
    struct Declaration: Equatable { let id: String; let fromX: Double; let fromY: Double; let toX: Double; let toY: Double }
    struct Claim: Equatable { let id: String; let x: Double; let y: Double; let r: Double; let g: Double; let b: Double; let delay: Double }
    struct Peace: Equatable { let id: String; let x: Double; let y: Double }
    struct Arrow: Equatable {
        let key: String; let sx: Double; let sy: Double; let cx: Double; let cy: Double; let ex: Double; let ey: Double
        let shallow: (Double, Double, Double); let deep: (Double, Double, Double)
        static func == (a: Arrow, b: Arrow) -> Bool { a.key == b.key && a.sx == b.sx && a.sy == b.sy && a.ex == b.ex && a.ey == b.ey && a.cx == b.cx && a.cy == b.cy && a.deep == b.deep }
    }
    var battles: [Battle] = []
    var sieges: [Siege] = []
    var flashes: [Flash] = []
    var declarations: [Declaration] = []
    var claims: [Claim] = []
    var peaces: [Peace] = []
    var arrows: [Arrow] = []
    var bursts: [Burst] = []
}

final class EffectsView: UIView {
    /// Smoke, fire and sparks (设置 › 粒子特效).
    static var particles = true
    /// 动画帧率 (推演与画面): looping ambient animations (waves, battle marks, flags, marching arrows)
    /// run at this many frames; with ProMotion unlocked they otherwise ran the screen at 120 all war long.
    static var fps = 30
    static func calm(_ a: CAAnimation) -> CAAnimation {
        let f = Float(Energy.hot ? min(fps, 30) : fps)
        a.preferredFrameRateRange = CAFrameRateRange(minimum: max(8, f / 2), maximum: f, preferred: f)
        return a
    }
    private var battleLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    /// Who fights whom, without text: a line from each army to the clash, in its state's colour.
    private var clashLayers: [String: (a: CAShapeLayer, b: CAShapeLayer, battle: MapEffects.Battle)] = [:]
    /// Off since the icons are drawn meeting at the clash.
    var showClashLines = false
    /// 显示战争箭头 (推演与画面).
    var showArrows = true
    private var siegeLayers: [String: (layer: CALayer, ring: CAShapeLayer, x: Double, y: Double)] = [:]
    private var flashLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var arrowLayers: [String: (layer: CAShapeLayer, head: CAShapeLayer, d: MapEffects.Declaration)] = [:]
    private var claimLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var peaceLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var burstLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    /// 正在显示的事件印（同屏最多三方，不抢视线）。
    private var sealIDs = Set<String>()
    private var battleArrows: [String: (root: CALayer, fill: CAShapeLayer, gradient: CAGradientLayer, outline: CAShapeLayer, head: CAShapeLayer, reveal: CAShapeLayer, a: MapEffects.Arrow)] = [:]
    private var seen = Set<String>()
    private var seenOrder: [String] = []
    private var camera: MapCamera?
    /// 地图上军队图标此刻的边长（点）：阵亡动画里倒下的军旗与之同大。
    private var iconPoints: CGFloat { CGFloat(MapRenderer.iconPoints(camera?.scale ?? 1, iconScale: 1)) }
    private var viewport: CGSize = .zero

    override init(frame: CGRect) { super.init(frame: frame); isUserInteractionEnabled = false }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private static func image(_ name: String) -> CGImage? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "World") else { return nil }
        return UIImage(contentsOfFile: url.path)?.cgImage
    }
    /// The original BattleSword atlas: 5 × 8 frames of 258 × 194.
    private static let swords = image("battle-sword")
    private static let swordFrames: [NSValue] = (0..<40).map { i in NSValue(cgRect: CGRect(x: CGFloat(i % 5) / 5, y: CGFloat(i / 5) / 8, width: 1.0 / 5, height: 1.0 / 8)) }

    // MARK: Sea waves
    /// The original's Water_Cartoon_Min: a wave that rises, curls and breaks, 8 × 8 frames. Like the
    /// original, waves come and go at random points of the sea in view.
    private static let waveSheet = image("sea-wave")
    private static let waveFrames: [NSValue] = (0..<64).map { i in NSValue(cgRect: CGRect(x: CGFloat(i % 8) / 8, y: CGFloat(i / 8) / 8, width: 1.0 / 8, height: 1.0 / 8)) }
    /// Sea points (cell centres) waves may rise at; set with the map.
    var seaSpots: [CGPoint] = []
    private var waves: [(layer: CALayer, x: Double, y: Double, scale: Double)] = []
    private var waveTimer: Timer?
    /// 战况飘字: a loss rises, swells and fades over the fight (vermilion on land, blue at sea).
    private var floats = 0
    /// 飘字放在地名之上的一层（特效本身在地名之下）。
    weak var floatHost: CALayer?
    func float(_ text: String, at p: CGPoint, naval: Bool) {
        guard !Energy.hot, floats < 12, window != nil else { return }
        let font = UIFont(name: "TW-Kai-98_1", size: 13) ?? .boldSystemFont(ofSize: 13)
        let fill = naval ? UIColor(red: 0.16, green: 0.4, blue: 0.72, alpha: 1) : UIColor(red: 0.74, green: 0.16, blue: 0.1, alpha: 1)
        let l = CATextLayer()
        // Filled and outlined in paper, readable over land, sea and borders without a shadow pass.
        l.string = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: fill, .strokeColor: UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 1), .strokeWidth: -4])
        l.alignmentMode = .center; l.contentsScale = UIScreen.main.scale
        l.bounds = CGRect(x: 0, y: 0, width: 96, height: 18); l.position = p
        (floatHost ?? layer).addSublayer(l)
        // 轻轻浮起、淡出：上升一小段，不放大抢眼。
        let up = CABasicAnimation(keyPath: "position.y"); up.fromValue = p.y; up.toValue = p.y - 20
        up.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.7, 0.3, 1)
        let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 0.95, 0.95, 0]; fade.keyTimes = [0, 0.15, 0.65, 1]
        let pop = CAKeyframeAnimation(keyPath: "transform.scale"); pop.values = [0.85, 1.04, 1, 1]; pop.keyTimes = [0, 0.2, 0.35, 1]
        let g = CAAnimationGroup(); g.animations = [up, fade, pop]; g.duration = 1.4; g.fillMode = .forwards; g.isRemovedOnCompletion = false
        l.opacity = 0
        l.add(Self.calm(g), forKey: "float")
        floats += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.45) { [weak self] in l.removeFromSuperlayer(); self?.floats -= 1 }
    }
    func startWaves() {
        guard waveTimer == nil else { return }
        waveTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.spawnWave() }
    }
    func stopWaves() { waveTimer?.invalidate(); waveTimer = nil }
    private func spawnWave() {
        guard Self.particles, !Energy.hot, let sheet = Self.waveSheet, let camera, !seaSpots.isEmpty, waves.count < 9, window != nil, viewport.width > 0 else { return }
        let vp = (width: Double(viewport.width), height: Double(viewport.height)), view = bounds.insetBy(dx: 10, dy: 60)
        var pick: (CGPoint, CGPoint)?
        for _ in 0..<12 {
            let s = seaSpots[Int.random(in: 0..<seaSpots.count)], p = camera.toScreen(x: Double(s.x), y: Double(s.y), viewport: vp)
            let q = CGPoint(x: p.x, y: p.y)
            if view.contains(q) { pick = (s, q); break }
        }
        guard let (spot, at) = pick else { return }
        let side = CGFloat(min(110, max(30, 22 * camera.scale)))
        let l = CALayer()
        l.contents = sheet; l.contentsRect = Self.waveFrames[0].cgRectValue
        l.bounds = CGRect(x: 0, y: 0, width: side, height: side); l.position = at; l.opacity = 0.9
        let flip = CAKeyframeAnimation(keyPath: "contentsRect"); flip.values = Self.waveFrames; flip.calculationMode = .discrete
        flip.duration = 2.7; flip.fillMode = .forwards; flip.isRemovedOnCompletion = false
        l.add(Self.calm(flip), forKey: "wave")
        layer.insertSublayer(l, at: 0)
        waves.append((l, Double(spot.x), Double(spot.y), camera.scale))
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.7) { [weak self] in
            l.removeFromSuperlayer(); self?.waves.removeAll { $0.layer === l }
        }
    }
    private static let claimIcon = image("war-claim")
    private static let dove = image("peace-bird")

    /// Soft round puff and a spark dot for the particle effects, drawn once.
    private static let puff: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32)).image { ctx in
        let colors = [UIColor.white.cgColor, UIColor.white.withAlphaComponent(0).cgColor] as CFArray
        if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
            ctx.cgContext.drawRadialGradient(g, startCenter: CGPoint(x: 16, y: 16), startRadius: 0, endCenter: CGPoint(x: 16, y: 16), endRadius: 16, options: [])
        }
    }.cgImage
    private static let spark: CGImage? = UIGraphicsImageRenderer(size: CGSize(width: 6, height: 6)).image { ctx in
        UIColor.white.setFill(); ctx.cgContext.fillEllipse(in: CGRect(x: 0, y: 0, width: 6, height: 6))
    }.cgImage
    private func cell(_ image: CGImage?, color: UIColor, rate: Float, life: Float, velocity: CGFloat, range: CGFloat = .pi * 2, scale: CGFloat, scaleSpeed: CGFloat, alphaSpeed: Float, spin: CGFloat = 0, angle: CGFloat = 0, accel: CGFloat = 0) -> CAEmitterCell {
        let c = CAEmitterCell()
        c.contents = image; c.color = color.cgColor; c.birthRate = rate; c.lifetime = life; c.lifetimeRange = life * 0.3
        c.velocity = velocity; c.velocityRange = velocity * 0.5; c.emissionRange = range; c.emissionLongitude = angle
        c.scale = scale; c.scaleRange = scale * 0.4; c.scaleSpeed = scaleSpeed; c.alphaSpeed = alphaSpeed; c.spin = spin; c.spinRange = spin; c.yAcceleration = accel
        return c
    }
    /// Battle smoke rolling up and sparks flying where the swords clash.
    /// 海战: broadsides over the water, muzzle flashes and white gun smoke drifting off, and a splash
    /// ring where the shot falls (no blades at sea).
    private func navalLayer() -> CALayer {
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 30, height: 20)
        let ring = CAShapeLayer(); ring.frame = root.bounds
        ring.path = UIBezierPath(ovalIn: CGRect(x: 9, y: 6, width: 12, height: 8)).cgPath
        ring.fillColor = nil; ring.strokeColor = UIColor(white: 1, alpha: 0.8).cgColor; ring.lineWidth = 1.2
        let grow = CABasicAnimation(keyPath: "transform.scale"); grow.fromValue = 0.3; grow.toValue = 1.8
        let fade = CABasicAnimation(keyPath: "opacity"); fade.fromValue = 0.9; fade.toValue = 0
        let g = CAAnimationGroup(); g.animations = [grow, fade]; g.duration = 1.1; g.repeatCount = .infinity; g.timeOffset = Double.random(in: 0..<1.1)
        ring.add(Self.calm(g), forKey: "splash"); root.addSublayer(ring)
        if Self.particles && !Energy.hot && battleLayers.count < 6 {
            let e = CAEmitterLayer(); e.emitterShape = .line; e.emitterSize = CGSize(width: 26, height: 1); e.emitterPosition = CGPoint(x: 15, y: 10)
            e.emitterCells = [
                cell(Self.puff, color: UIColor(white: 0.95, alpha: 0.22), rate: 3, life: 2.0, velocity: 6, range: .pi / 4, scale: 0.3, scaleSpeed: 0.16, alphaSpeed: -0.1, spin: 0.2, angle: -.pi / 2),
                cell(Self.spark, color: UIColor(red: 1, green: 0.62, blue: 0.2, alpha: 1), rate: 4, life: 0.25, velocity: 18, range: .pi / 5, scale: 0.55, scaleSpeed: -1.4, alphaSpeed: -3, angle: -.pi / 2),
            ]
            e.renderMode = .unordered
            root.insertSublayer(e, at: 0)
        }
        return root
    }
    private func battleSmoke() -> CAEmitterLayer {
        // 一缕淡墨烟、几点火星：都很小，只在交锋处一指宽内，不成一团雾遮住地图。
        let e = CAEmitterLayer(); e.emitterShape = .circle; e.emitterSize = CGSize(width: 8, height: 4)
        e.emitterCells = [
            cell(Self.puff, color: UIColor(red: 0.3, green: 0.26, blue: 0.22, alpha: 0.1), rate: 1.6, life: 1.3, velocity: 6, range: .pi / 4, scale: 0.2, scaleSpeed: 0.08, alphaSpeed: -0.08, spin: 0.3, angle: -.pi / 2),
            cell(Self.spark, color: UIColor(red: 0.95, green: 0.62, blue: 0.25, alpha: 1), rate: 4, life: 0.3, velocity: 18, scale: 0.3, scaleSpeed: -0.7, alphaSpeed: -2.6, accel: 30),
        ]
        e.renderMode = .unordered
        return e
    }

    /// The two sides' strength over a fight: one bar in their colours, split by troops.
    private func setStrength(_ root: CALayer, _ b: MapEffects.Battle) {
        guard let bar = root.sublayers?.first(where: { $0.name == "strength" }), bar.sublayers?.count == 2, let l = b.left, let r = b.right else { return }
        let total = b.leftTroops + b.rightTroops
        bar.isHidden = total <= 0
        guard total > 0 else { return }
        let w = bar.bounds.width, h = bar.bounds.height, share = w * CGFloat(b.leftTroops) / CGFloat(total)
        // The balance moves as the fight goes.
        CATransaction.setDisableActions(false); CATransaction.setAnimationDuration(0.35)
        defer { CATransaction.setDisableActions(true) }
        bar.sublayers![0].frame = CGRect(x: 0, y: 0, width: share, height: h); bar.sublayers![0].backgroundColor = UIColor(red: l.r, green: l.g, blue: l.b, alpha: 1).cgColor
        bar.sublayers![1].frame = CGRect(x: share, y: 0, width: w - share, height: h); bar.sublayers![1].backgroundColor = UIColor(red: r.r, green: r.g, blue: r.b, alpha: 1).cgColor
    }
    private func battleLayer() -> CALayer {
        // A small contact flash, not a badge: the opposing unit symbols remain the focal point.
        // 小而精：双刃 28 × 21 点，兵力条细一道，整体只占军队图标上方一小块，不压住周围的地名与图标。
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 24, height: 18)
        let strength = CALayer(); strength.name = "strength"; strength.bounds = CGRect(x: 0, y: 0, width: 24, height: 2.5); strength.position = CGPoint(x: 12, y: -11)
        strength.cornerRadius = 1.25; strength.masksToBounds = true; strength.borderWidth = 0.5; strength.borderColor = UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 0.9).cgColor; strength.isHidden = true
        strength.addSublayer(CALayer()); strength.addSublayer(CALayer()); root.addSublayer(strength)
        let marks = CAShapeLayer(); marks.frame = root.bounds
        let path = UIBezierPath()
        for (x, y) in [(CGFloat(3), CGFloat(4)), (20, 3), (2, 13), (21, 14)] {
            path.move(to: CGPoint(x: 12 + (x - 12) * 0.45, y: 9 + (y - 9) * 0.45))
            path.addLine(to: CGPoint(x: x, y: y))
        }
        marks.path = path.cgPath; marks.fillColor = nil
        marks.strokeColor = UIColor(red: 0.66, green: 0.22, blue: 0.12, alpha: 0.9).cgColor
        marks.lineWidth = 1.4; marks.lineCap = .round
        let flash = CAKeyframeAnimation(keyPath: "opacity")
        flash.values = [0.15, 0.9, 0.2, 0.15]; flash.keyTimes = [0, 0.2, 0.5, 1]
        flash.duration = 1.2; flash.repeatCount = .infinity
        if let sheet = Self.swords {
            // The original BattleSword: two blades clashing over the fight, a 40-frame loop.
            let blades = CALayer()
            blades.contents = sheet; blades.contentsRect = Self.swordFrames[0].cgRectValue
            blades.bounds = CGRect(x: 0, y: 0, width: 28, height: 21); blades.position = CGPoint(x: 12, y: 3)
            let clash = CAKeyframeAnimation(keyPath: "contentsRect"); clash.values = Self.swordFrames; clash.calculationMode = .discrete
            clash.duration = 1.4; clash.repeatCount = .infinity
            clash.timeOffset = Double.random(in: 0..<1.4)
            blades.add(Self.calm(clash), forKey: "clash"); root.addSublayer(blades)
        } else { marks.add(Self.calm(flash), forKey: "contact"); root.addSublayer(marks) }
        if Self.particles && !Energy.hot && battleLayers.count < 4 {
            let smoke = battleSmoke(); smoke.emitterPosition = CGPoint(x: 12, y: 9); root.insertSublayer(smoke, at: 0)
        }
        return root
    }

    private func siegeLayer(color: UIColor) -> (CALayer, CAShapeLayer) {
        // 围城：一枚小小的城圈——宣纸底、细墨圈，进攻方国色的弧随进度从正上方顺时针合拢；
        // 中间一点国色，缓缓呼吸。直径 16 点，挂在城上，不挡地名。
        let side: CGFloat = 20, mid = side / 2, radius: CGFloat = 7
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: side, height: side)
        let circle = UIBezierPath(arcCenter: CGPoint(x: mid, y: mid), radius: radius, startAngle: -.pi / 2, endAngle: .pi * 1.5, clockwise: true)
        let paper = CAShapeLayer(); paper.frame = root.bounds
        paper.path = UIBezierPath(ovalIn: CGRect(x: mid - radius - 1.5, y: mid - radius - 1.5, width: (radius + 1.5) * 2, height: (radius + 1.5) * 2)).cgPath
        paper.fillColor = UIColor(red: 0.98, green: 0.95, blue: 0.88, alpha: 0.82).cgColor
        paper.strokeColor = UIColor(red: 0.16, green: 0.12, blue: 0.09, alpha: 0.45).cgColor; paper.lineWidth = 0.6
        let track = CAShapeLayer(); track.frame = root.bounds; track.path = circle.cgPath
        track.fillColor = nil; track.strokeColor = UIColor(red: 0.16, green: 0.12, blue: 0.09, alpha: 0.14).cgColor; track.lineWidth = 2.4
        let ring = CAShapeLayer(); ring.frame = root.bounds; ring.path = circle.cgPath
        ring.fillColor = nil; ring.strokeColor = color.cgColor; ring.lineWidth = 2.4; ring.lineCap = .round; ring.strokeEnd = 0
        let core = CAShapeLayer(); core.frame = root.bounds
        core.path = UIBezierPath(ovalIn: CGRect(x: mid - 2.2, y: mid - 2.2, width: 4.4, height: 4.4)).cgPath
        core.fillColor = color.cgColor
        let breathe = CAKeyframeAnimation(keyPath: "opacity"); breathe.values = [0.55, 1, 0.55]; breathe.duration = 1.8; breathe.repeatCount = .infinity
        breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        core.add(Self.calm(breathe), forKey: "breathe")
        root.addSublayer(paper); root.addSublayer(track); root.addSublayer(ring); root.addSublayer(core)
        return (root, ring)
    }

    private func flashLayer(color: UIColor) -> CALayer {
        // 攻占：换色交给地图上的扫色（FlipSweep），这里只插一面小旗——旗杆落下、落地处一圈细墨荡开、旗面招展，
        // 然后淡去。不再铺半透明色盘（以前 190 点的色盘与粗环盖住整片地名）。
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 120, height: 120)
        let ink = UIColor(red: 0.16, green: 0.12, blue: 0.09, alpha: 1)
        let ripple = CAShapeLayer(); ripple.frame = root.bounds
        ripple.path = UIBezierPath(ovalIn: CGRect(x: 50, y: 58, width: 20, height: 8)).cgPath
        ripple.fillColor = nil; ripple.strokeColor = ink.withAlphaComponent(0.55).cgColor; ripple.lineWidth = 1; ripple.opacity = 0
        let grow = CABasicAnimation(keyPath: "transform.scale"); grow.fromValue = 0.4; grow.toValue = 2.2
        let fadeRing = CAKeyframeAnimation(keyPath: "opacity"); fadeRing.values = [0, 0.9, 0]; fadeRing.keyTimes = [0, 0.2, 1]
        let rippleGroup = CAAnimationGroup(); rippleGroup.animations = [grow, fadeRing]; rippleGroup.duration = 1.1
        rippleGroup.beginTime = CACurrentMediaTime() + 0.22; rippleGroup.timingFunction = CAMediaTimingFunction(controlPoints: 0.15, 0.6, 0.3, 1)
        rippleGroup.fillMode = .both; rippleGroup.isRemovedOnCompletion = false
        ripple.add(rippleGroup, forKey: "ripple"); root.addSublayer(ripple)
        let pole = CALayer(); pole.backgroundColor = ink.withAlphaComponent(0.85).cgColor
        pole.bounds = CGRect(x: 0, y: 0, width: 1.2, height: 20); pole.anchorPoint = CGPoint(x: 0.5, y: 1); pole.position = CGPoint(x: 60, y: 62)
        let cloth = CAShapeLayer()
        let wave = UIBezierPath(); wave.move(to: .zero); wave.addQuadCurve(to: CGPoint(x: 12, y: 1), controlPoint: CGPoint(x: 6, y: -2))
        wave.addLine(to: CGPoint(x: 10, y: 4.5)); wave.addLine(to: CGPoint(x: 12, y: 8))
        wave.addQuadCurve(to: CGPoint(x: 0, y: 8), controlPoint: CGPoint(x: 6, y: 10)); wave.close()
        cloth.path = wave.cgPath; cloth.fillColor = color.cgColor; cloth.strokeColor = ink.withAlphaComponent(0.5).cgColor; cloth.lineWidth = 0.5
        cloth.frame = CGRect(x: 0.6, y: 0, width: 12, height: 9); cloth.anchorPoint = CGPoint(x: 0, y: 0.5); cloth.position = CGPoint(x: 0.6, y: 4.5)
        let flutter = CAKeyframeAnimation(keyPath: "transform.scale.x"); flutter.values = [1, 0.86, 1.03, 0.92, 1]; flutter.duration = 1.0; flutter.repeatCount = .infinity
        flutter.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        cloth.add(Self.calm(flutter), forKey: "flutter"); pole.addSublayer(cloth)
        let drop = CABasicAnimation(keyPath: "transform.translation.y"); drop.fromValue = -14; drop.toValue = 0; drop.duration = 0.24
        drop.timingFunction = CAMediaTimingFunction(name: .easeIn)
        let settle = CAKeyframeAnimation(keyPath: "transform.scale.y"); settle.values = [1, 0.9, 1]; settle.keyTimes = [0, 0.5, 1]; settle.beginTime = 0.24; settle.duration = 0.18
        let fadeOut = CAKeyframeAnimation(keyPath: "opacity"); fadeOut.values = [0, 1, 1, 0]; fadeOut.keyTimes = [0, 0.1, 0.78, 1]; fadeOut.duration = 2.1
        let plant = CAAnimationGroup(); plant.animations = [drop, settle, fadeOut]; plant.duration = 2.1; plant.fillMode = .forwards; plant.isRemovedOnCompletion = false
        pole.add(plant, forKey: "plant"); root.addSublayer(pole)
        return root
    }

    /// PlayerController.DrawAttackArrowAnim: the pattern flows 5 units a second, gone after 2 s.
    private func declarationLayers() -> (CAShapeLayer, CAShapeLayer) {
        // 宣战：一道朱笔从进攻方都城写向对方都城（0.7 秒写完），笔尾落下箭头，停一停后淡去。
        // 细笔（2.4 点）、朱色略透，不是一条粗红虚线横在地图上。
        let vermilion = UIColor(red: 0.74, green: 0.16, blue: 0.1, alpha: 0.85)
        let line = CAShapeLayer()
        line.strokeColor = vermilion.cgColor; line.fillColor = UIColor.clear.cgColor
        line.lineWidth = 2.4; line.lineCap = .round
        let write = CABasicAnimation(keyPath: "strokeEnd"); write.fromValue = 0; write.toValue = 1; write.duration = 0.7
        write.timingFunction = CAMediaTimingFunction(controlPoints: 0.4, 0, 0.2, 1); write.fillMode = .both; write.isRemovedOnCompletion = false
        line.add(write, forKey: "write")
        let head = CAShapeLayer(); head.fillColor = vermilion.cgColor
        let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [1, 1, 0]; fade.keyTimes = [0, 0.75, 1]; fade.duration = 2
        fade.fillMode = .both; fade.isRemovedOnCompletion = false; line.add(fade, forKey: "life")
        let headIn = CAKeyframeAnimation(keyPath: "opacity"); headIn.values = [0, 0, 1, 1, 0]; headIn.keyTimes = [0, 0.32, 0.42, 0.75, 1]; headIn.duration = 2
        headIn.fillMode = .both; headIn.isRemovedOnCompletion = false; head.add(headIn, forKey: "life")
        return (line, head)
    }

    /// WarClaimMarker: 0.22 s entry from 60°, 0.18 s impact (squash 0.88), 3 s hold with a 5 % pulse,
    /// 0.6 s fade.
    private func claimLayer(_ c: MapEffects.Claim) -> CALayer {
        let l = CALayer(); l.bounds = CGRect(x: 0, y: 0, width: 17, height: 17 * 74 / 96)
        if let icon = Self.claimIcon {
            l.contents = UIImage(cgImage: icon).withTintColor(UIColor(red: c.r, green: c.g, blue: c.b, alpha: 1), renderingMode: .alwaysOriginal).cgImage
        }
        l.contentsGravity = .resizeAspect; l.opacity = 0
        let drop = CABasicAnimation(keyPath: "transform.translation")
        drop.fromValue = NSValue(cgSize: CGSize(width: 32 * cos(Double.pi / 3), height: -32 * sin(Double.pi / 3))); drop.toValue = NSValue(cgSize: .zero)
        drop.duration = 0.22; drop.timingFunction = CAMediaTimingFunction(name: .easeIn)
        let squash = CAKeyframeAnimation(keyPath: "transform.scale.y"); squash.values = [1, 0.88, 1]; squash.beginTime = 0.22; squash.duration = 0.18
        let pulse = CAKeyframeAnimation(keyPath: "transform.scale"); pulse.values = (0...24).map { 1 + 0.05 * sin(Double($0) / 24 * 12) }; pulse.beginTime = 0.4; pulse.duration = 3
        let opacity = CAKeyframeAnimation(keyPath: "opacity"); opacity.values = [0, 1, 1, 0]; opacity.keyTimes = [0, 0.05, 0.85, 1]; opacity.duration = 4
        let group = CAAnimationGroup(); group.animations = [drop, squash, pulse, opacity]; group.duration = 4; group.beginTime = CACurrentMediaTime() + c.delay
        group.fillMode = .both; group.isRemovedOnCompletion = false
        l.add(group, forKey: "claim")
        return l
    }

    /// PeaceAnimation: the dove rises 2 units above the capital in 0.5 s, stays 0.5 s, fades in 0.6 s.
    private func peaceLayer() -> CALayer {
        let l = CALayer(); l.bounds = CGRect(x: 0, y: 0, width: 30, height: 30)
        l.contents = Self.dove; l.contentsGravity = .resizeAspect; l.opacity = 0
        let rise = CABasicAnimation(keyPath: "transform.translation.y"); rise.fromValue = 0; rise.toValue = -20; rise.duration = 0.5
        rise.timingFunction = CAMediaTimingFunction(controlPoints: 0.5, 0, 0.5, 1); rise.fillMode = .forwards; rise.isRemovedOnCompletion = false
        let opacity = CAKeyframeAnimation(keyPath: "opacity"); opacity.values = [0, 1, 1, 0]; opacity.keyTimes = [0, 0.3, 0.62, 1]; opacity.duration = 1.6
        let group = CAAnimationGroup(); group.animations = [rise, opacity]; group.duration = 1.6; group.fillMode = .both; group.isRemovedOnCompletion = false
        l.add(group, forKey: "peace")
        return l
    }

    /// AttackArrowRenderer: a curved arrow growing in over 1 s, width 8 → 3, shallow → deep colour,
    /// with a dark outline.
    private func arrowLayer(_ a: MapEffects.Arrow) -> (CALayer, CAShapeLayer, CAGradientLayer, CAShapeLayer, CAShapeLayer, CAShapeLayer) {
        func color(_ c: (Double, Double, Double)) -> CGColor { UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1).cgColor }
        let root = CALayer(); root.frame = bounds
        // No masks (they did not show on device): the body is filled directly, shallow → deep by two
        // overlapping halves; the gradient layer is kept only as a hidden placeholder.
        let gradient = CAGradientLayer(); gradient.isHidden = true
        let mid = ((a.shallow.0 + a.deep.0) / 2, (a.shallow.1 + a.deep.1) / 2, (a.shallow.2 + a.deep.2) / 2)
        let fill = CAShapeLayer(); fill.fillColor = color(mid)
        let outline = CAShapeLayer(); outline.fillColor = UIColor.clear.cgColor; outline.strokeColor = UIColor(red: 0.09, green: 0.07, blue: 0.05, alpha: 0.5).cgColor; outline.lineWidth = 0.8; outline.lineJoin = .round
        let head = CAShapeLayer(); head.fillColor = color(a.deep); head.strokeColor = outline.strokeColor; head.lineWidth = 0.8
        fill.fillColor = color(a.shallow); fill.opacity = 0.78
        // The arrow deepens towards its head in six overlapping bands, each a step deeper (a smooth
        // ramp instead of the two flat halves that met in a hard seam).
        let reveal = CAShapeLayer(); reveal.fillColor = UIColor.clear.cgColor
        for i in 1...6 {
            let k = Double(i) / 6
            let band = CAShapeLayer()
            band.fillColor = color((a.shallow.0 + (a.deep.0 - a.shallow.0) * k, a.shallow.1 + (a.deep.1 - a.shallow.1) * k, a.shallow.2 + (a.deep.2 - a.shallow.2) * k))
            band.opacity = 0.78
            reveal.addSublayer(band)
        }
        // Grows in over 1 s: the outline draws itself while the body fades in.
        let draw = CABasicAnimation(keyPath: "strokeEnd"); draw.fromValue = 0.1; draw.toValue = 1; draw.duration = 1; draw.timingFunction = CAMediaTimingFunction(name: .easeOut)
        outline.add(draw, forKey: "draw")
        let fade = CABasicAnimation(keyPath: "opacity"); fade.fromValue = 0; fade.toValue = 1; fade.duration = 0.8; fade.timingFunction = CAMediaTimingFunction(name: .easeOut)
        root.add(fade, forKey: "fade")
        root.addSublayer(gradient); root.addSublayer(fill); root.addSublayer(reveal); root.addSublayer(outline); root.addSublayer(head)
        return (root, fill, gradient, outline, head, reveal)
    }
    private func layoutArrow(_ v: (root: CALayer, fill: CAShapeLayer, gradient: CAGradientLayer, outline: CAShapeLayer, head: CAShapeLayer, reveal: CAShapeLayer, a: MapEffects.Arrow), _ screen: (Double, Double) -> CGPoint) {
        let s = screen(v.a.sx, v.a.sy), c = screen(v.a.cx, v.a.cy), e = screen(v.a.ex, v.a.ey)
        func bezier(_ t: CGFloat) -> CGPoint { CGPoint(x: (1 - t) * (1 - t) * s.x + 2 * (1 - t) * t * c.x + t * t * e.x, y: (1 - t) * (1 - t) * s.y + 2 * (1 - t) * t * c.y + t * t * e.y) }
        let points = (0..<30).map { bezier(0.1 + 0.65 * CGFloat($0) / 29) }
        func width(_ k: CGFloat) -> CGFloat { 5.6 - 3.8 * k * k * (3 - 2 * k) }
        var left = [CGPoint](), right = [CGPoint]()
        for (i, p) in points.enumerated() {
            let q = points[min(i + 1, 29)], o = points[max(i - 1, 0)], dx = q.x - o.x, dy = q.y - o.y, len = max(0.001, hypot(dx, dy))
            let w = width(CGFloat(i) / 29) / 2
            left.append(CGPoint(x: p.x - dy / len * w, y: p.y + dx / len * w)); right.append(CGPoint(x: p.x + dy / len * w, y: p.y - dx / len * w))
        }
        let body = UIBezierPath(); body.move(to: left[0]); for p in left.dropFirst() { body.addLine(to: p) }; for p in right.reversed() { body.addLine(to: p) }; body.close()
        v.fill.path = body.cgPath; v.outline.path = body.cgPath
        let tip = points[29], before = points[28], dx = tip.x - before.x, dy = tip.y - before.y, len = max(0.001, hypot(dx, dy)), ux = dx / len, uy = dy / len
        let h: CGFloat = 5.5, l: CGFloat = 10
        let head = UIBezierPath(); head.move(to: CGPoint(x: tip.x - uy * h, y: tip.y + ux * h)); head.addLine(to: CGPoint(x: tip.x + ux * l, y: tip.y + uy * l)); head.addLine(to: CGPoint(x: tip.x + uy * h, y: tip.y - ux * h)); head.close()
        v.head.path = head.cgPath
        let center = UIBezierPath(); center.move(to: points[0]); for p in points.dropFirst() { center.addLine(to: p) }; center.addLine(to: CGPoint(x: tip.x + ux * l, y: tip.y + uy * l))
        _ = center
        // The deepening bands: band i covers the body from a point i/6 along to the head.
        for (i, band) in (v.reveal.sublayers ?? []).enumerated() {
            guard let shape = band as? CAShapeLayer else { continue }
            let from = min(28, 4 * (i + 1))
            let path = UIBezierPath(); path.move(to: left[from]); for p in left[(from + 1)...] { path.addLine(to: p) }; for p in right[from...].reversed() { path.addLine(to: p) }; path.close()
            shape.frame = v.reveal.bounds; shape.path = path.cgPath
        }
        v.reveal.path = nil
        v.gradient.startPoint = CGPoint(x: s.x / max(1, bounds.width), y: s.y / max(1, bounds.height)); v.gradient.endPoint = CGPoint(x: e.x / max(1, bounds.width), y: e.y / max(1, bounds.height))
    }

    /// One-shot bursts: smoke for an army destroyed, coloured sparks and a rising flag for a new state,
    /// a red shockwave at the capital of a state that was declared on.
    private func burstLayer(_ b: MapEffects.Burst) -> CALayer {
        let color = UIColor(red: b.r, green: b.g, blue: b.b, alpha: 1)
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 120, height: 120)
        switch b.kind {
        case .destroyed:
            // 阵亡：这支军队在它倒下的地方被墨吞没——一团墨（掺本国色）由小洇大、边缘几处飞溅，一圈本国色的震痕荡开，
            // 军旗（兵种图标）向一侧倾倒、下沉、褪色。几支同处倒下时墨团随数量变大、飞溅更多。
            let count = CGFloat(max(1, b.count)), grow = min(1.6, 1 + 0.2 * (count - 1))
            let ink = UIColor(red: 0.14 + 0.22 * b.r, green: 0.11 + 0.22 * b.g, blue: 0.09 + 0.22 * b.b, alpha: 1)
            var seed = UInt64(truncatingIfNeeded: b.id.hashValue)
            func rnd() -> CGFloat { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return CGFloat((seed >> 33) % 10_000) / 10_000 }
            let begin = CACurrentMediaTime() + b.delay
            func play(_ l: CALayer, _ animations: [CAAnimation], duration: Double, ease: CAMediaTimingFunctionName = .easeOut) {
                let g = CAAnimationGroup(); g.animations = animations; g.duration = duration; g.beginTime = begin
                g.timingFunction = CAMediaTimingFunction(name: ease); g.fillMode = .forwards; g.isRemovedOnCompletion = false
                l.add(g, forKey: "fall")
            }
            // 墨团：三团不规则的墨叠成一块，洇开后慢慢干去。
            let blot = CAShapeLayer(); blot.frame = root.bounds
            let path = UIBezierPath()
            for k in 0..<3 {
                let w = (13 + 7 * rnd()) * grow, h = (9 + 4 * rnd()) * grow
                let cx = 60 + (rnd() - 0.5) * 10 * grow, cy = 62 + (rnd() - 0.5) * 6 * grow
                path.append(UIBezierPath(ovalIn: CGRect(x: cx - w / 2, y: cy - h / 2, width: w, height: h)))
                if k == 0 { path.append(UIBezierPath(ovalIn: CGRect(x: cx - w * 0.15, y: cy - h * 0.2, width: w * 0.3, height: h * 0.25))) }
            }
            blot.path = path.cgPath; blot.fillColor = ink.withAlphaComponent(0.5).cgColor
            blot.shadowColor = ink.cgColor; blot.shadowOpacity = 0.9; blot.shadowRadius = 3.5; blot.shadowOffset = .zero; blot.opacity = 0
            let spread = CAKeyframeAnimation(keyPath: "transform.scale"); spread.values = [0.15, 1.0, 1.08]; spread.keyTimes = [0, 0.3, 1]
            let dry = CAKeyframeAnimation(keyPath: "opacity"); dry.values = [0, 0.95, 0.7, 0]; dry.keyTimes = [0, 0.12, 0.55, 1]
            play(blot, [spread, dry], duration: 2.3)
            root.addSublayer(blot)
            // 飞溅：几点墨沿各方向甩出、落定、淡去。
            for _ in 0..<min(7, 3 + Int(count)) {
                let dot = CAShapeLayer(); dot.frame = root.bounds
                let r = (1.2 + 1.8 * rnd()) * min(1.4, grow)
                dot.path = UIBezierPath(ovalIn: CGRect(x: 60 - r, y: 62 - r, width: r * 2, height: r * 2)).cgPath
                dot.fillColor = ink.withAlphaComponent(0.75).cgColor; dot.opacity = 0
                let angle = rnd() * CGFloat.pi * 2, dist = (14 + 16 * rnd()) * grow
                let fly = CABasicAnimation(keyPath: "transform.translation"); fly.fromValue = NSValue(cgSize: .zero)
                fly.toValue = NSValue(cgSize: CGSize(width: cos(angle) * dist, height: sin(angle) * dist * 0.7)); fly.duration = 0.32
                fly.timingFunction = CAMediaTimingFunction(controlPoints: 0.1, 0.8, 0.3, 1); fly.fillMode = .forwards; fly.isRemovedOnCompletion = false
                let show = CAKeyframeAnimation(keyPath: "opacity"); show.values = [0, 0.9, 0.7, 0]; show.keyTimes = [0, 0.08, 0.5, 1]; show.duration = 1.9
                play(dot, [fly, show], duration: 1.9)
                root.addSublayer(dot)
            }
            // 震痕：一圈本国色的细环荡开。
            let ring = CAShapeLayer(); ring.frame = root.bounds
            ring.path = UIBezierPath(ovalIn: CGRect(x: 44, y: 50, width: 32, height: 24)).cgPath
            ring.fillColor = UIColor.clear.cgColor; ring.strokeColor = color.withAlphaComponent(0.85).cgColor; ring.lineWidth = 1.6; ring.opacity = 0
            let wave = CABasicAnimation(keyPath: "transform.scale"); wave.fromValue = 0.5; wave.toValue = 2.0 * grow
            let waveFade = CAKeyframeAnimation(keyPath: "opacity"); waveFade.values = [0, 0.9, 0]; waveFade.keyTimes = [0, 0.15, 1]
            let thin = CABasicAnimation(keyPath: "lineWidth"); thin.fromValue = 2.4; thin.toValue = 0.4
            play(ring, [wave, waveFade, thin], duration: 0.85)
            root.addSublayer(ring)
            // 军旗：图标倾倒、下沉、褪色（与地图上的图标同大）。
            if let icon = Self.unitImage(b.unit, tint: color) {
                let side: CGFloat = rnd() < 0.5 ? -1 : 1
                let size = max(12, min(28, iconPoints))
                let mark = CALayer(); mark.contents = icon; mark.contentsGravity = .resizeAspect
                mark.bounds = CGRect(x: 0, y: 0, width: size, height: size); mark.position = CGPoint(x: 60, y: 60); mark.opacity = 0
                mark.anchorPoint = CGPoint(x: 0.5, y: 0.85); mark.position = CGPoint(x: 60, y: 60 + size * 0.35)
                let tilt = CAKeyframeAnimation(keyPath: "transform.rotation.z"); tilt.values = [0, side * 0.12, side * 1.2]; tilt.keyTimes = [0, 0.18, 1]
                let sink = CAKeyframeAnimation(keyPath: "transform.translation.y"); sink.values = [0, -2, 7]; sink.keyTimes = [0, 0.18, 1]
                let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [1, 1, 0.55, 0]; fade.keyTimes = [0, 0.2, 0.6, 1]
                play(mark, [tilt, sink, fade], duration: 1.3, ease: .easeIn)
                root.addSublayer(mark)
            }
        default:
            // 统一的事件语言：一圈墨晕洇开，一方一字印落下（立、战、丰、商、才、灾、疫、革、篡），节奏一致。
            let look = Self.stampLook(b.kind, nation: color)
            root.addSublayer(inkRing(look.ring))
            root.addSublayer(stamp(look.mark, fill: look.fill))
        }
        return root
    }

    /// 各类事件的印文与颜色：建国用该国国色，宣战与革命用朱，天灾、瘟疫用墨与秋香，丰收、通商、名臣用赭黄。
    static func stampLook(_ kind: MapEffects.Burst.Kind, nation: UIColor) -> (mark: String, fill: UIColor, ring: UIColor) {
        let vermilion = UIColor(red: 0.72, green: 0.18, blue: 0.12, alpha: 1), ochre = UIColor(red: 0.72, green: 0.52, blue: 0.2, alpha: 1)
        switch kind {
        case .founded: return ("立", nation, nation)
        case .shock: return ("战", vermilion, vermilion)
        case .harvest: return ("丰", ochre, ochre)
        case .trade: return ("商", ochre, ochre)
        case .talent: return ("才", ochre, ochre)
        case .disaster: return ("灾", UIColor(red: 0.22, green: 0.2, blue: 0.18, alpha: 1), UIColor(white: 0.2, alpha: 1))
        case .plague: return ("疫", UIColor(red: 0.4, green: 0.45, blue: 0.22, alpha: 1), UIColor(red: 0.4, green: 0.45, blue: 0.22, alpha: 1))
        case .regime: return ("革", vermilion, vermilion)
        case .coup: return ("篡", UIColor(red: 0.42, green: 0.08, blue: 0.08, alpha: 1), vermilion)
        case .destroyed: return ("亡", UIColor(white: 0.2, alpha: 1), UIColor(white: 0.2, alpha: 1))
        }
    }
    /// 一圈墨晕：由小到大洇开并淡去（1.4 秒）。
    private func inkRing(_ color: UIColor) -> CALayer {
        let ring = CAShapeLayer(); ring.frame = CGRect(x: 0, y: 0, width: 120, height: 120)
        // 细墨一圈（1.2 点）、不填色：由印下荡开到约 60 点淡去。
        ring.path = UIBezierPath(ovalIn: CGRect(x: 44, y: 44, width: 32, height: 32)).cgPath
        ring.fillColor = nil; ring.strokeColor = color.withAlphaComponent(0.6).cgColor; ring.lineWidth = 1.2; ring.opacity = 0
        let grow = CABasicAnimation(keyPath: "transform.scale"); grow.fromValue = 0.6; grow.toValue = 1.9
        let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 0.9, 0]; fade.keyTimes = [0, 0.25, 1]
        let g = CAAnimationGroup(); g.animations = [grow, fade]; g.duration = 1.4; g.timingFunction = CAMediaTimingFunction(name: .easeOut); g.fillMode = .both; g.isRemovedOnCompletion = false
        ring.add(g, forKey: "ink"); return ring
    }
    /// 一字印：与界面朱印同一印面（方形、内框细线），按下、停留、淡去（2.2 秒）。
    private func stamp(_ mark: String, fill: UIColor) -> CALayer {
        let size: CGFloat = 21
        let seal = CALayer(); seal.frame = CGRect(x: 60 - size / 2, y: 58 - size / 2, width: size, height: size)
        seal.backgroundColor = fill.withAlphaComponent(0.9).cgColor; seal.cornerRadius = size * 0.12
        let frame = CALayer(); frame.frame = seal.bounds.insetBy(dx: size * 0.07, dy: size * 0.07); frame.cornerRadius = size * 0.08
        frame.borderColor = UIColor(red: 0.98, green: 0.95, blue: 0.88, alpha: 0.75).cgColor; frame.borderWidth = 1
        seal.addSublayer(frame)
        let text = CATextLayer(); text.string = mark
        text.font = UIFont(name: "TW-Kai-98_1", size: size * 0.6) ?? UIFont.systemFont(ofSize: size * 0.6); text.fontSize = size * 0.6
        text.alignmentMode = .center; text.contentsScale = UIScreen.main.scale
        text.foregroundColor = UIColor(red: 0.98, green: 0.95, blue: 0.88, alpha: 1).cgColor
        text.frame = CGRect(x: 0, y: (size - size * 0.74) / 2, width: size, height: size * 0.74)
        seal.addSublayer(text)
        let press = CAKeyframeAnimation(keyPath: "transform.scale"); press.values = [1.35, 0.96, 1.0, 1.0]; press.keyTimes = [0, 0.12, 0.2, 1]
        press.timingFunctions = [CAMediaTimingFunction(name: .easeIn), CAMediaTimingFunction(name: .easeOut), CAMediaTimingFunction(name: .linear)]
        let tilt = CABasicAnimation(keyPath: "transform.rotation.z"); tilt.fromValue = -0.12; tilt.toValue = -0.07
        let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 1, 1, 0]; fade.keyTimes = [0, 0.1, 0.75, 1]
        let g = CAAnimationGroup(); g.animations = [press, tilt, fade]; g.duration = 2.2; g.fillMode = .forwards; g.isRemovedOnCompletion = false
        seal.add(g, forKey: "stamp"); return seal
    }


    /// The army's figure (UnitArt) tinted in a state's colour.
    private static var unitImages = [String: CGImage]()
    static func unitImage(_ unit: String, tint: UIColor) -> CGImage? {
        let key = unit + tint.description
        if let c = unitImages[key] { return c }
        let out = UnitArt.tinted(unit.isEmpty ? "Infantry" : unit, tint)?.cgImage
        if unitImages.count > 64 { unitImages.removeAll() }
        unitImages[key] = out
        return out
    }

    /// 退场：0.3 秒淡出再移除（不是一下子消失）。
    private static func retire(_ l: CALayer) {
        let fade = CABasicAnimation(keyPath: "opacity"); fade.fromValue = l.presentation()?.opacity ?? l.opacity; fade.toValue = 0; fade.duration = 0.3
        fade.timingFunction = CAMediaTimingFunction(name: .easeOut)
        l.opacity = 0; l.add(fade, forKey: "retire")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) { l.removeFromSuperlayer() }
    }
    private func once(_ id: String, after seconds: Double, remove: @escaping () -> Void) {
        if seen.insert(id).inserted { seenOrder.append(id) }
        if seenOrder.count > 2048 {
            seen.remove(seenOrder.removeFirst())
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { remove() }
    }

    func set(_ incoming: MapEffects) {
        // Bound presentation cost only; never truncate simulation or battle accounting.
        var effects = incoming
        effects.battles = Array(incoming.battles.prefix(48))
        effects.sieges = Array(incoming.sieges.prefix(64))
        effects.arrows = showArrows ? Array(incoming.arrows.prefix(32)) : []
        effects.flashes = Array(incoming.flashes.prefix(24))
        effects.bursts = Array(incoming.bursts.prefix(24))
        effects.claims = Array(incoming.claims.prefix(24))
        effects.declarations = Array(incoming.declarations.prefix(8))
        effects.peaces = Array(incoming.peaces.prefix(8))
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let battles = Set(effects.battles.map(\.key))
        for (key, v) in battleLayers where !battles.contains(key) { Self.retire(v.layer); battleLayers[key] = nil }
        for (key, v) in clashLayers where !battles.contains(key) { v.a.removeFromSuperlayer(); v.b.removeFromSuperlayer(); clashLayers[key] = nil }
        for b in effects.battles {
            guard showClashLines, let l = b.left, let r = b.right, b.ax != b.bx || b.ay != b.by else { continue }
            if let old = clashLayers[b.key] { clashLayers[b.key] = (old.a, old.b, b); continue }
            func line(_ s: MapEffects.Side) -> CAShapeLayer {
                let c = CAShapeLayer()
                c.strokeColor = UIColor(red: s.r, green: s.g, blue: s.b, alpha: 0.95).cgColor; c.fillColor = nil
                c.lineWidth = 1.4; c.lineCap = .round; c.lineDashPattern = [3, 4]
                c.opacity = 0.75
                // The dashes run towards the clash.
                let flow = CABasicAnimation(keyPath: "lineDashPhase"); flow.fromValue = 9; flow.toValue = 0; flow.duration = 0.45; flow.repeatCount = .infinity
                c.add(Self.calm(flow), forKey: "flow")
                layer.insertSublayer(c, at: 0)
                return c
            }
            clashLayers[b.key] = (line(l), line(r), b)
        }
        for b in effects.battles {
            if let old = battleLayers[b.key] { battleLayers[b.key] = (old.layer, b.x, b.y); setStrength(old.layer, b) }
            else {
                let l = b.key.hasPrefix("s") ? navalLayer() : battleLayer(); layer.addSublayer(l); battleLayers[b.key] = (l, b.x, b.y)
                setStrength(l, b)
                // 交锋处浮现：0.35 秒由淡到实、略放大到原大（不弹跳）。
                let grow = CABasicAnimation(keyPath: "transform.scale"); grow.fromValue = 0.7; grow.toValue = 1
                let show = CABasicAnimation(keyPath: "opacity"); show.fromValue = 0; show.toValue = 1
                let pop = CAAnimationGroup(); pop.animations = [grow, show]; pop.duration = 0.35; pop.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.7, 0.3, 1)
                l.add(pop, forKey: "pop")
            }
        }
        let sieges = Set(effects.sieges.map(\.key))
        for (key, v) in siegeLayers where !sieges.contains(key) { Self.retire(v.layer); siegeLayers[key] = nil }
        for s in effects.sieges {
            let color = UIColor(red: s.r, green: s.g, blue: s.b, alpha: 1)
            let entry = siegeLayers[s.key] ?? { let (l, ring) = siegeLayer(color: color); layer.addSublayer(l); return (l, ring, s.x, s.y) }()
            siegeLayers[s.key] = (entry.layer, entry.ring, s.x, s.y)
            // 进度合拢的弧：每步平滑走到新值。
            CATransaction.setDisableActions(false); CATransaction.setAnimationDuration(0.45)
            entry.ring.strokeEnd = CGFloat(max(0.04, min(1, s.progress)))
            CATransaction.setDisableActions(true)
        }
        for f in effects.flashes where !seen.contains(f.id) {
            guard flashLayers.count < 24 else { continue }
            let l = flashLayer(color: UIColor(red: f.r, green: f.g, blue: f.b, alpha: 1)); layer.addSublayer(l)
            flashLayers[f.id] = (l, f.x, f.y)
            let id = f.id
            once(id, after: 2.2) { [weak self] in self?.flashLayers[id]?.layer.removeFromSuperlayer(); self?.flashLayers[id] = nil }
        }
        let liveArrows = Set(effects.arrows.map(\.key))
        for (key, v) in battleArrows where !liveArrows.contains(key) { Self.retire(v.root); battleArrows[key] = nil }
        for a in effects.arrows {
            if let old = battleArrows[a.key] { battleArrows[a.key] = (old.root, old.fill, old.gradient, old.outline, old.head, old.reveal, a) }
            else { let l = arrowLayer(a); layer.insertSublayer(l.0, at: 0); battleArrows[a.key] = (l.0, l.1, l.2, l.3, l.4, l.5, a) }
        }
        for b in effects.bursts where !seen.contains(b.id) {
            guard burstLayers.count < 24 else { continue }
            if b.kind != .destroyed { if sealIDs.count >= 3 { continue }; sealIDs.insert(b.id) }
            let l = burstLayer(b); layer.addSublayer(l); burstLayers[b.id] = (l, b.x, b.y)
            let id = b.id
            once(id, after: 2.6 + b.delay) { [weak self] in self?.burstLayers[id]?.layer.removeFromSuperlayer(); self?.burstLayers[id] = nil; self?.sealIDs.remove(id) }
        }
        for d in effects.declarations where !seen.contains(d.id) {
            guard arrowLayers.count < 8 else { continue }
            let (line, head) = declarationLayers(); layer.addSublayer(line); layer.addSublayer(head)
            arrowLayers[d.id] = (line, head, d)
            let id = d.id
            once(id, after: 2.1) { [weak self] in self?.arrowLayers[id]?.layer.removeFromSuperlayer(); self?.arrowLayers[id]?.head.removeFromSuperlayer(); self?.arrowLayers[id] = nil }
        }
        for c in effects.claims where !seen.contains(c.id) {
            guard claimLayers.count < 24 else { continue }
            let l = claimLayer(c); layer.addSublayer(l); claimLayers[c.id] = (l, c.x, c.y)
            let id = c.id
            once(id, after: 4.2 + c.delay) { [weak self] in self?.claimLayers[id]?.layer.removeFromSuperlayer(); self?.claimLayers[id] = nil }
        }
        for p in effects.peaces where !seen.contains(p.id) {
            guard peaceLayers.count < 8 else { continue }
            let l = peaceLayer(); layer.addSublayer(l); peaceLayers[p.id] = (l, p.x, p.y)
            let id = p.id
            once(id, after: 1.8) { [weak self] in self?.peaceLayers[id]?.layer.removeFromSuperlayer(); self?.peaceLayers[id] = nil }
        }
        CATransaction.commit()
        if let camera { update(camera: camera, viewport: viewport) }
    }

    private func visibility(_ item: CALayer, visible: Bool) {
        item.isHidden = !visible
        let paused = !visible || UIAccessibility.isReduceMotionEnabled
        if paused && item.speed != 0 {
            let time = item.convertTime(CACurrentMediaTime(), from: nil)
            item.speed = 0
            item.timeOffset = time
        } else if !paused && item.speed == 0 {
            let time = item.timeOffset
            item.speed = 1
            item.timeOffset = 0
            item.beginTime = 0
            item.beginTime = item.convertTime(CACurrentMediaTime(), from: nil) - time
        }
    }

    func update(camera: MapCamera, viewport: CGSize) {
        self.camera = camera; self.viewport = viewport
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        func screen(_ x: Double, _ y: Double) -> CGPoint { let p = camera.toScreen(x: x, y: y, viewport: vp); return CGPoint(x: p.x, y: p.y) }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        for w in waves {
            w.layer.position = screen(w.x, w.y)
            let z = CGFloat(camera.scale / max(0.0001, w.scale)); w.layer.setAffineTransform(CGAffineTransform(scaleX: z, y: z))
        }
        let k = CGFloat(max(0.8, min(1.2, camera.scale / 2)))
        // The swords hang just above the armies they belong to (the figures stay visible beneath),
        // and battles that would overlap on screen share one mark.
        var marks = [CGPoint]()
        for key in battleLayers.keys.sorted() {
            let v = battleLayers[key]!
            var p = screen(v.x, v.y); p.y -= 15 * k
            let crowded = marks.contains { hypot($0.x - p.x, $0.y - p.y) < 28 * k }
            if !crowded { marks.append(p) }
            v.layer.position = p; v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k))
            v.layer.isHidden = crowded
        }
        for v in clashLayers.values {
            let a = screen(v.battle.ax, v.battle.ay), b = screen(v.battle.bx, v.battle.by), m = screen(v.battle.x, v.battle.y)
            let pa = UIBezierPath(); pa.move(to: a); pa.addLine(to: m); v.a.path = pa.cgPath
            let pb = UIBezierPath(); pb.move(to: b); pb.addLine(to: m); v.b.path = pb.cgPath
            v.a.lineWidth = 1 + k * 0.6; v.b.lineWidth = 1 + k * 0.6
        }
        for v in siegeLayers.values { var p = screen(v.x, v.y); p.y -= 14 * k; v.layer.position = p; v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k)) }
        for v in flashLayers.values { v.layer.position = screen(v.x, v.y) }
        for v in claimLayers.values { v.layer.position = screen(v.x, v.y) }
        for v in burstLayers.values { v.layer.position = screen(v.x, v.y) }
        for v in peaceLayers.values { var p = screen(v.x, v.y); p.y -= 10; v.layer.position = p }
        for v in battleArrows.values { v.root.frame = bounds; v.gradient.frame = bounds; v.fill.frame = bounds; v.reveal.frame = bounds; layoutArrow(v) { screen($0, $1) } }
        for v in arrowLayers.values {
            let a = screen(v.d.fromX, v.d.fromY), b = screen(v.d.toX, v.d.toY)
            let dx = b.x - a.x, dy = b.y - a.y, len = max(1, hypot(dx, dy)), ux = dx / len, uy = dy / len
            // 略带弧度的一笔（向左侧拱起距离的 12%），箭头顺着笔尾的方向。
            let tip = CGPoint(x: b.x - ux * 8, y: b.y - uy * 8)
            let bow = min(60, len * 0.12), ctrl = CGPoint(x: (a.x + tip.x) / 2 - uy * bow, y: (a.y + tip.y) / 2 + ux * bow)
            let ex = tip.x - ctrl.x, ey = tip.y - ctrl.y, el = max(1, hypot(ex, ey)), tx = ex / el, ty = ey / el
            let base = CGPoint(x: tip.x - tx * 9, y: tip.y - ty * 9)
            let path = UIBezierPath(); path.move(to: a); path.addQuadCurve(to: base, controlPoint: ctrl); v.layer.path = path.cgPath
            let head = UIBezierPath(); head.move(to: tip)
            head.addQuadCurve(to: CGPoint(x: base.x - ty * 4.5, y: base.y + tx * 4.5), controlPoint: CGPoint(x: tip.x - tx * 5 - ty * 1.5, y: tip.y - ty * 5 + tx * 1.5))
            head.addLine(to: CGPoint(x: base.x + tx * 2, y: base.y + ty * 2))
            head.addLine(to: CGPoint(x: base.x + ty * 4.5, y: base.y - tx * 4.5))
            head.addQuadCurve(to: tip, controlPoint: CGPoint(x: tip.x - tx * 5 + ty * 1.5, y: tip.y - ty * 5 - tx * 1.5)); head.close()
            v.head.path = head.cgPath
        }
        // Hide and freeze continuous offscreen effects. A margin avoids edge flicker.
        let visibleRect = CGRect(origin: .zero, size: viewport).insetBy(dx: -80, dy: -80)
        for v in battleLayers.values where !v.layer.isHidden { visibility(v.layer, visible: visibleRect.contains(v.layer.position)) }
        for v in siegeLayers.values { visibility(v.layer, visible: visibleRect.contains(v.layer.position)) }
        for v in clashLayers.values {
            let visible = visibleRect.contains(screen(v.battle.x, v.battle.y))
            visibility(v.a, visible: visible); visibility(v.b, visible: visible)
        }
        CATransaction.commit()
    }
}
