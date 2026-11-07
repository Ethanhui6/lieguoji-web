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
    }
    struct Burst: Equatable { enum Kind { case destroyed, founded, shock, harvest, disaster, talent, plague, trade, regime, coup }; let id: String; let x: Double; let y: Double; let kind: Kind; let r: Double; let g: Double; let b: Double; var unit = "" }
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
    private var battleArrows: [String: (root: CALayer, fill: CAShapeLayer, gradient: CAGradientLayer, outline: CAShapeLayer, head: CAShapeLayer, reveal: CAShapeLayer, a: MapEffects.Arrow)] = [:]
    private var seen = Set<String>()
    private var seenOrder: [String] = []
    private var camera: MapCamera?
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
    func float(_ text: String, at p: CGPoint, naval: Bool) {
        guard !Energy.hot, floats < 12, window != nil else { return }
        let font = UIFont(name: "TW-Kai-98_1", size: 16) ?? .boldSystemFont(ofSize: 16)
        let fill = naval ? UIColor(red: 0.16, green: 0.4, blue: 0.72, alpha: 1) : UIColor(red: 0.74, green: 0.16, blue: 0.1, alpha: 1)
        let l = CATextLayer()
        // Filled and outlined in paper, readable over land, sea and borders without a shadow pass.
        l.string = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: fill, .strokeColor: UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 1), .strokeWidth: -4])
        l.alignmentMode = .center; l.contentsScale = UIScreen.main.scale
        l.bounds = CGRect(x: 0, y: 0, width: 110, height: 22); l.position = p
        layer.addSublayer(l)
        let up = CABasicAnimation(keyPath: "position.y"); up.fromValue = p.y; up.toValue = p.y - 36
        let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 1, 1, 0]; fade.keyTimes = [0, 0.12, 0.7, 1]
        let pop = CAKeyframeAnimation(keyPath: "transform.scale"); pop.values = [0.5, 1.2, 1, 1]; pop.keyTimes = [0, 0.18, 0.35, 1]
        let g = CAAnimationGroup(); g.animations = [up, fade, pop]; g.duration = 1.4; g.fillMode = .forwards; g.isRemovedOnCompletion = false
        g.timingFunction = CAMediaTimingFunction(name: .easeOut)
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
        let e = CAEmitterLayer(); e.emitterShape = .circle; e.emitterSize = CGSize(width: 10, height: 6)
        e.emitterCells = [
            cell(Self.puff, color: UIColor(white: 0.3, alpha: 0.16), rate: 2.5, life: 1.6, velocity: 7, range: .pi / 3, scale: 0.28, scaleSpeed: 0.12, alphaSpeed: -0.1, spin: 0.3, angle: -.pi / 2),
            cell(Self.spark, color: UIColor(red: 1, green: 0.72, blue: 0.3, alpha: 1), rate: 6, life: 0.4, velocity: 26, scale: 0.4, scaleSpeed: -0.6, alphaSpeed: -2, accel: 30),
        ]
        e.renderMode = .unordered
        return e
    }
    /// The battle tag under the swords: the two states' colours and names.
    private func battleTag(_ b: MapEffects.Battle) -> CALayer? {
        guard let l = b.left, let r = b.right else { return nil }
        let font = UIFont(name: "TW-Kai-98_1", size: 10) ?? .systemFont(ofSize: 10)
        let text = NSMutableAttributedString()
        func add(_ s: String, _ c: UIColor) { text.append(NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: c])) }
        add("■ ", UIColor(red: l.r, green: l.g, blue: l.b, alpha: 1)); add(l.name, UIColor(white: 0.08, alpha: 1))
        add("  ⚔  ", UIColor(red: 0.706, green: 0.255, blue: 0.18, alpha: 1))
        add("■ ", UIColor(red: r.r, green: r.g, blue: r.b, alpha: 1)); add(r.name, UIColor(white: 0.08, alpha: 1))
        let size = text.size()
        let tag = CATextLayer(); tag.string = text; tag.contentsScale = UIScreen.main.scale; tag.alignmentMode = .center
        tag.frame = CGRect(x: 0, y: 0, width: ceil(size.width) + 12, height: ceil(size.height) + 4)
        tag.backgroundColor = UIColor(red: 0.984, green: 0.972, blue: 0.945, alpha: 0.9).cgColor; tag.cornerRadius = 5
        tag.borderColor = UIColor(white: 0, alpha: 0.18).cgColor; tag.borderWidth = 0.6
        return tag
    }

    private func battleLayer() -> CALayer {
        // A small contact flash, not a badge: the opposing unit symbols remain the focal point.
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 24, height: 18)
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
            blades.bounds = CGRect(x: 0, y: 0, width: 40, height: 30); blades.position = CGPoint(x: 12, y: -6)
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
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 30, height: 30)
        let track = CAShapeLayer(); track.frame = root.bounds
        let bar = UIBezierPath(); bar.move(to: CGPoint(x: 4, y: 23)); bar.addLine(to: CGPoint(x: 26, y: 23))
        track.path = bar.cgPath
        track.fillColor = nil; track.strokeColor = UIColor(white: 0, alpha: 0.18).cgColor; track.lineWidth = 3.5
        let ring = CAShapeLayer(); ring.frame = root.bounds
        ring.path = bar.cgPath
        ring.fillColor = UIColor.clear.cgColor; ring.strokeColor = color.cgColor; ring.lineWidth = 3.5; ring.lineCap = .round
        let flag = CALayer(); flag.frame = CGRect(x: 9, y: 5, width: 12, height: 12)
        flag.contents = UIImage(systemName: "flag.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 9, weight: .bold))?.withTintColor(color, renderingMode: .alwaysOriginal).cgImage
        flag.contentsGravity = .resizeAspect
        let fire = CAEmitterLayer(); fire.emitterShape = .line; fire.emitterSize = CGSize(width: 22, height: 1); fire.emitterPosition = CGPoint(x: 15, y: 30)
        fire.emitterCells = [cell(Self.puff, color: UIColor(red: 1, green: 0.45, blue: 0.12, alpha: 0.4), rate: 5, life: 0.8, velocity: 10, range: .pi / 6, scale: 0.18, scaleSpeed: -0.12, alphaSpeed: -0.9, angle: -.pi / 2),
                             cell(Self.spark, color: UIColor(red: 1, green: 0.8, blue: 0.4, alpha: 1), rate: 3, life: 1.0, velocity: 16, range: .pi / 4, scale: 0.3, scaleSpeed: -0.2, alphaSpeed: -0.7, angle: -.pi / 2)]
        if Self.particles { root.addSublayer(fire) }
        root.addSublayer(track); root.addSublayer(ring); root.addSublayer(flag)
        return (root, ring)
    }

    private func flashLayer(color: UIColor) -> CALayer {
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 120, height: 120)
        for i in 0..<3 {
            let ring = CAShapeLayer(); ring.frame = root.bounds
            ring.path = UIBezierPath(ovalIn: CGRect(x: 30, y: 30, width: 60, height: 60)).cgPath
            ring.fillColor = (i == 0 ? color.withAlphaComponent(0.35) : UIColor.clear).cgColor
            ring.strokeColor = color.cgColor; ring.lineWidth = i == 0 ? 0 : 3
            ring.opacity = 0
            let scale = CABasicAnimation(keyPath: "transform.scale"); scale.fromValue = 0.2; scale.toValue = 1.6 + Double(i) * 0.3
            let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 1, 0]; fade.keyTimes = [0, 0.15, 1]
            let group = CAAnimationGroup(); group.animations = [scale, fade]; group.duration = 1.5
            group.beginTime = CACurrentMediaTime() + Double(i) * 0.18; group.timingFunction = CAMediaTimingFunction(name: .easeOut)
            group.fillMode = .both; group.isRemovedOnCompletion = false
            ring.add(group, forKey: "burst"); root.addSublayer(ring)
        }
        // The new owner plants its banner: the pole drops in, the flag waves, then all fades.
        let pole = CALayer(); pole.backgroundColor = UIColor(white: 0.18, alpha: 1).cgColor
        pole.bounds = CGRect(x: 0, y: 0, width: 1.6, height: 26); pole.anchorPoint = CGPoint(x: 0.5, y: 1); pole.position = CGPoint(x: 60, y: 62)
        let cloth = CAShapeLayer()
        let wave = UIBezierPath(); wave.move(to: .zero); wave.addQuadCurve(to: CGPoint(x: 16, y: 1), controlPoint: CGPoint(x: 8, y: -3))
        wave.addLine(to: CGPoint(x: 15, y: 11)); wave.addQuadCurve(to: CGPoint(x: 0, y: 10), controlPoint: CGPoint(x: 7, y: 13)); wave.close()
        cloth.path = wave.cgPath; cloth.fillColor = color.cgColor; cloth.strokeColor = UIColor(white: 0.15, alpha: 0.6).cgColor; cloth.lineWidth = 0.6
        cloth.frame = CGRect(x: 0.8, y: 0, width: 16, height: 12); cloth.anchorPoint = CGPoint(x: 0, y: 0.5); cloth.position = CGPoint(x: 0.8, y: 6)
        let flutter = CAKeyframeAnimation(keyPath: "transform.scale.x"); flutter.values = [1, 0.82, 1.04, 0.9, 1]; flutter.duration = 0.8; flutter.repeatCount = .infinity
        cloth.add(Self.calm(flutter), forKey: "flutter"); pole.addSublayer(cloth)
        let drop = CASpringAnimation(keyPath: "transform.translation.y"); drop.fromValue = -30; drop.toValue = 0; drop.damping = 9; drop.duration = drop.settlingDuration
        let fadeOut = CAKeyframeAnimation(keyPath: "opacity"); fadeOut.values = [0, 1, 1, 0]; fadeOut.keyTimes = [0, 0.08, 0.75, 1]; fadeOut.duration = 2.1
        let plant = CAAnimationGroup(); plant.animations = [drop, fadeOut]; plant.duration = 2.1; plant.fillMode = .forwards; plant.isRemovedOnCompletion = false
        pole.add(plant, forKey: "plant"); root.addSublayer(pole)
        return root
    }

    /// PlayerController.DrawAttackArrowAnim: the pattern flows 5 units a second, gone after 2 s.
    private func declarationLayers() -> (CAShapeLayer, CAShapeLayer) {
        let line = CAShapeLayer()
        line.strokeColor = UIColor(red: 0.86, green: 0.12, blue: 0.1, alpha: 0.92).cgColor; line.fillColor = UIColor.clear.cgColor
        line.lineWidth = 5; line.lineCap = .round; line.lineDashPattern = [14, 8]
        let flow = CABasicAnimation(keyPath: "lineDashPhase"); flow.fromValue = 0; flow.toValue = -44; flow.duration = 0.45; flow.repeatCount = .infinity
        line.add(Self.calm(flow), forKey: "flow")
        let head = CAShapeLayer(); head.fillColor = line.strokeColor
        for l in [line, head] {
            let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 1, 1, 0]; fade.keyTimes = [0, 0.1, 0.85, 1]; fade.duration = 2
            fade.fillMode = .both; fade.isRemovedOnCompletion = false; l.add(fade, forKey: "life")
        }
        return (line, head)
    }

    /// WarClaimMarker: 0.22 s entry from 60°, 0.18 s impact (squash 0.88), 3 s hold with a 5 % pulse,
    /// 0.6 s fade.
    private func claimLayer(_ c: MapEffects.Claim) -> CALayer {
        let l = CALayer(); l.bounds = CGRect(x: 0, y: 0, width: 22, height: 22 * 74 / 96)
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
        let outline = CAShapeLayer(); outline.fillColor = UIColor.clear.cgColor; outline.strokeColor = UIColor(red: 0.09, green: 0.07, blue: 0.05, alpha: 0.8).cgColor; outline.lineWidth = 1.3; outline.lineJoin = .round
        let head = CAShapeLayer(); head.fillColor = color(a.deep); head.strokeColor = outline.strokeColor; head.lineWidth = 0.8
        fill.fillColor = color(a.shallow); fill.opacity = 0.92
        // The arrow deepens towards its head in six overlapping bands, each a step deeper (a smooth
        // ramp instead of the two flat halves that met in a hard seam).
        let reveal = CAShapeLayer(); reveal.fillColor = UIColor.clear.cgColor
        for i in 1...6 {
            let k = Double(i) / 6
            let band = CAShapeLayer()
            band.fillColor = color((a.shallow.0 + (a.deep.0 - a.shallow.0) * k, a.shallow.1 + (a.deep.1 - a.shallow.1) * k, a.shallow.2 + (a.deep.2 - a.shallow.2) * k))
            band.opacity = 0.92
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
        func width(_ k: CGFloat) -> CGFloat { (6.5 - 4.5 * k * k * (3 - 2 * k)) * 1.15 }
        var left = [CGPoint](), right = [CGPoint]()
        for (i, p) in points.enumerated() {
            let q = points[min(i + 1, 29)], o = points[max(i - 1, 0)], dx = q.x - o.x, dy = q.y - o.y, len = max(0.001, hypot(dx, dy))
            let w = width(CGFloat(i) / 29) / 2
            left.append(CGPoint(x: p.x - dy / len * w, y: p.y + dx / len * w)); right.append(CGPoint(x: p.x + dy / len * w, y: p.y - dx / len * w))
        }
        let body = UIBezierPath(); body.move(to: left[0]); for p in left.dropFirst() { body.addLine(to: p) }; for p in right.reversed() { body.addLine(to: p) }; body.close()
        v.fill.path = body.cgPath; v.outline.path = body.cgPath
        let tip = points[29], before = points[28], dx = tip.x - before.x, dy = tip.y - before.y, len = max(0.001, hypot(dx, dy)), ux = dx / len, uy = dy / len
        let h: CGFloat = 7.5, l: CGFloat = 13
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
            // An army falls in ink: its unit mark sinks and fades while a blot of ink spreads beneath it
            // and dries away — the map's own brush, not an explosion.
            let blot = CAShapeLayer(); blot.frame = root.bounds
            blot.path = UIBezierPath(ovalIn: CGRect(x: 48, y: 52, width: 24, height: 16)).cgPath
            blot.fillColor = UIColor(red: 0.16, green: 0.13, blue: 0.1, alpha: 0.55).cgColor
            blot.shadowColor = blot.fillColor; blot.shadowOpacity = 1; blot.shadowRadius = 4; blot.shadowOffset = .zero
            let spread = CABasicAnimation(keyPath: "transform.scale"); spread.fromValue = 0.2; spread.toValue = 1.5
            spread.timingFunction = CAMediaTimingFunction(name: .easeOut)
            let dry = CAKeyframeAnimation(keyPath: "opacity"); dry.values = [0, 0.85, 0.6, 0]; dry.keyTimes = [0, 0.15, 0.6, 1]
            let blotGroup = CAAnimationGroup(); blotGroup.animations = [spread, dry]; blotGroup.duration = 2.2; blotGroup.fillMode = .forwards; blotGroup.isRemovedOnCompletion = false
            blot.add(blotGroup, forKey: "ink"); root.addSublayer(blot)
            if let icon = Self.unitImage(b.unit, tint: color) {
                let mark = CALayer(); mark.contents = icon; mark.contentsGravity = .resizeAspect
                mark.bounds = CGRect(x: 0, y: 0, width: 22, height: 22); mark.position = CGPoint(x: 60, y: 58)
                let sink = CABasicAnimation(keyPath: "transform.translation.y"); sink.fromValue = 0; sink.toValue = 6
                let shrink = CABasicAnimation(keyPath: "transform.scale"); shrink.fromValue = 1; shrink.toValue = 0.7
                let tilt = CABasicAnimation(keyPath: "transform.rotation.z"); tilt.fromValue = 0; tilt.toValue = 0.35
                let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [1, 0.9, 0]; fade.keyTimes = [0, 0.3, 1]
                let g = CAAnimationGroup(); g.animations = [sink, shrink, tilt, fade]; g.duration = 1.6
                g.timingFunction = CAMediaTimingFunction(name: .easeIn); g.fillMode = .forwards; g.isRemovedOnCompletion = false
                mark.add(g, forKey: "fall"); root.addSublayer(mark)
            }
        case .founded:
            let e = CAEmitterLayer(); e.emitterPosition = CGPoint(x: 60, y: 60); e.emitterShape = .point
            e.emitterCells = [cell(Self.spark, color: color, rate: 160, life: 1.2, velocity: 70, scale: 0.9, scaleSpeed: -0.5, alphaSpeed: -0.8, accel: 40),
                              cell(Self.spark, color: UIColor(red: 1, green: 0.85, blue: 0.4, alpha: 1), rate: 60, life: 1.0, velocity: 50, scale: 0.6, scaleSpeed: -0.4, alphaSpeed: -0.9, accel: 40)]
            root.addSublayer(e)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { e.birthRate = 0 }
            let flag = CALayer(); flag.frame = CGRect(x: 48, y: 36, width: 24, height: 24)
            if let symbol = UIImage(systemName: "flag.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .bold))?.withTintColor(color, renderingMode: .alwaysOriginal) {
                flag.contents = UIGraphicsImageRenderer(size: symbol.size).image { _ in symbol.draw(at: .zero) }.cgImage
            }
            flag.contentsGravity = .resizeAspect
            let rise = CABasicAnimation(keyPath: "transform.translation.y"); rise.fromValue = 14; rise.toValue = -10; rise.duration = 0.9; rise.timingFunction = CAMediaTimingFunction(name: .easeOut)
            let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 1, 1, 0]; fade.keyTimes = [0, 0.2, 0.7, 1]; fade.duration = 2.2
            let group = CAAnimationGroup(); group.animations = [rise, fade]; group.duration = 2.2; group.fillMode = .both; group.isRemovedOnCompletion = false
            flag.add(group, forKey: "rise"); root.addSublayer(flag)
        case .harvest:
            // 五谷丰登: golden grain motes rise in a warm glow.
            root.addSublayer(glow(UIColor(red: 0.98, green: 0.82, blue: 0.35, alpha: 1)))
            root.addSublayer(motes(UIColor(red: 1, green: 0.85, blue: 0.3, alpha: 1), rate: 40, velocity: 26, angle: -.pi / 2, range: .pi / 3, accel: -10))
        case .trade:
            // 商路大开: coins spray out and fall.
            root.addSublayer(glow(UIColor(red: 0.95, green: 0.75, blue: 0.3, alpha: 1)))
            root.addSublayer(motes(UIColor(red: 1, green: 0.78, blue: 0.25, alpha: 1), rate: 60, velocity: 55, angle: -.pi / 2, range: .pi * 0.9, accel: 90))
        case .talent:
            // 名臣辈出: a star of light opens and turns.
            let rays = CAShapeLayer(); rays.frame = root.bounds
            let path = UIBezierPath()
            for i in 0..<12 {
                let a = Double(i) * .pi / 6, r1: Double = 8, r2: Double = i % 2 == 0 ? 34 : 22
                path.move(to: CGPoint(x: 60 + cos(a) * r1, y: 60 + sin(a) * r1)); path.addLine(to: CGPoint(x: 60 + cos(a) * r2, y: 60 + sin(a) * r2))
            }
            rays.path = path.cgPath; rays.strokeColor = UIColor(red: 1, green: 0.88, blue: 0.5, alpha: 1).cgColor; rays.lineWidth = 2.2; rays.lineCap = .round
            rays.shadowColor = rays.strokeColor; rays.shadowOpacity = 1; rays.shadowRadius = 4; rays.shadowOffset = .zero
            let open = CABasicAnimation(keyPath: "transform.scale"); open.fromValue = 0.2; open.toValue = 1.3
            let turn = CABasicAnimation(keyPath: "transform.rotation.z"); turn.fromValue = 0; turn.toValue = Double.pi / 3
            let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 1, 1, 0]; fade.keyTimes = [0, 0.15, 0.6, 1]
            let g = CAAnimationGroup(); g.animations = [open, turn, fade]; g.duration = 2.2; g.timingFunction = CAMediaTimingFunction(name: .easeOut); g.fillMode = .forwards; g.isRemovedOnCompletion = false
            rays.add(g, forKey: "star"); root.addSublayer(rays)
        case .disaster:
            // 天灾: a dark cloud gathers and rain sweeps down.
            root.addSublayer(cloud(UIColor(white: 0.25, alpha: 0.55)))
            let rain = CAEmitterLayer(); rain.emitterPosition = CGPoint(x: 60, y: 46); rain.emitterShape = .line; rain.emitterSize = CGSize(width: 46, height: 1)
            let drop = CAEmitterCell()
            drop.contents = UIGraphicsImageRenderer(size: CGSize(width: 2, height: 9)).image { _ in UIColor.white.setFill(); UIRectFill(CGRect(x: 0, y: 0, width: 2, height: 9)) }.cgImage
            drop.color = UIColor(red: 0.55, green: 0.65, blue: 0.8, alpha: 0.8).cgColor; drop.birthRate = 70; drop.lifetime = 0.6; drop.velocity = 70; drop.emissionLongitude = .pi / 2 + 0.25; drop.scale = 0.7; drop.alphaSpeed = -1
            rain.emitterCells = [drop]; rain.isHidden = !Self.particles; root.addSublayer(rain)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { rain.birthRate = 0 }
        case .plague:
            // 瘟疫: a sickly mist creeps outward.
            root.addSublayer(cloud(UIColor(red: 0.45, green: 0.55, blue: 0.25, alpha: 0.45)))
            root.addSublayer(motes(UIColor(red: 0.55, green: 0.7, blue: 0.3, alpha: 1), rate: 20, velocity: 14, angle: 0, range: .pi * 2, accel: 0))
        case .regime, .coup:
            // 革命 / 篡位: a great seal is pressed onto the capital, a ring of ink spreads.
            let seal = CATextLayer()
            seal.string = b.kind == .coup ? "篡" : "革"
            seal.font = UIFont(name: "TW-Kai-98_1", size: 30) ?? UIFont.systemFont(ofSize: 30); seal.fontSize = 30
            seal.alignmentMode = .center; seal.contentsScale = UIScreen.main.scale
            seal.foregroundColor = UIColor(red: 0.98, green: 0.95, blue: 0.88, alpha: 1).cgColor
            seal.backgroundColor = (b.kind == .coup ? UIColor(red: 0.42, green: 0.08, blue: 0.08, alpha: 0.95) : UIColor(red: 0.75, green: 0.18, blue: 0.12, alpha: 0.95)).cgColor
            seal.cornerRadius = 6; seal.frame = CGRect(x: 40, y: 38, width: 40, height: 40)
            seal.borderColor = UIColor(red: 0.98, green: 0.95, blue: 0.88, alpha: 0.8).cgColor; seal.borderWidth = 1.5
            let press = CAKeyframeAnimation(keyPath: "transform.scale"); press.values = [2.6, 0.9, 1.05, 1]; press.keyTimes = [0, 0.35, 0.55, 1]
            let tilt = CABasicAnimation(keyPath: "transform.rotation.z"); tilt.fromValue = -0.3; tilt.toValue = -0.08
            let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 1, 1, 0]; fade.keyTimes = [0, 0.12, 0.8, 1]
            let g = CAAnimationGroup(); g.animations = [press, tilt, fade]; g.duration = 2.4; g.fillMode = .forwards; g.isRemovedOnCompletion = false
            seal.add(g, forKey: "stamp"); root.addSublayer(seal)
            let ring = CAShapeLayer(); ring.frame = root.bounds
            ring.path = UIBezierPath(ovalIn: CGRect(x: 30, y: 28, width: 60, height: 60)).cgPath
            ring.fillColor = UIColor.clear.cgColor; ring.strokeColor = UIColor(red: 0.6, green: 0.12, blue: 0.08, alpha: 0.6).cgColor; ring.lineWidth = 3; ring.opacity = 0
            let grow = CABasicAnimation(keyPath: "transform.scale"); grow.fromValue = 0.6; grow.toValue = 1.8
            let ringFade = CAKeyframeAnimation(keyPath: "opacity"); ringFade.values = [0, 0.9, 0]; ringFade.keyTimes = [0, 0.3, 1]
            let rg = CAAnimationGroup(); rg.animations = [grow, ringFade]; rg.duration = 1.4; rg.beginTime = CACurrentMediaTime() + 0.3; rg.fillMode = .both; rg.isRemovedOnCompletion = false
            ring.add(rg, forKey: "ring"); root.addSublayer(ring)
            if b.kind == .coup {
                let slash = CAShapeLayer(); slash.frame = root.bounds
                let sp = UIBezierPath(); sp.move(to: CGPoint(x: 28, y: 84)); sp.addLine(to: CGPoint(x: 92, y: 32))
                slash.path = sp.cgPath; slash.strokeColor = UIColor(red: 0.85, green: 0.1, blue: 0.08, alpha: 0.9).cgColor; slash.lineWidth = 3.5; slash.lineCap = .round; slash.strokeEnd = 0
                let cut = CABasicAnimation(keyPath: "strokeEnd"); cut.fromValue = 0; cut.toValue = 1; cut.duration = 0.25; cut.beginTime = CACurrentMediaTime() + 0.5; cut.fillMode = .forwards; cut.isRemovedOnCompletion = false
                let gone = CABasicAnimation(keyPath: "opacity"); gone.fromValue = 1; gone.toValue = 0; gone.beginTime = CACurrentMediaTime() + 1.4; gone.duration = 0.8; gone.fillMode = .forwards; gone.isRemovedOnCompletion = false
                slash.add(cut, forKey: "cut"); slash.add(gone, forKey: "gone"); root.addSublayer(slash)
            }
        case .shock:
            for i in 0..<3 {
                let ring = CAShapeLayer(); ring.frame = root.bounds
                ring.path = UIBezierPath(ovalIn: CGRect(x: 40, y: 40, width: 40, height: 40)).cgPath
                ring.fillColor = UIColor.clear.cgColor; ring.strokeColor = color.cgColor; ring.lineWidth = 3; ring.opacity = 0
                let scale = CABasicAnimation(keyPath: "transform.scale"); scale.fromValue = 0.3; scale.toValue = 2.6
                let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 0.9, 0]; fade.keyTimes = [0, 0.12, 1]
                let group = CAAnimationGroup(); group.animations = [scale, fade]; group.duration = 1.3; group.beginTime = CACurrentMediaTime() + Double(i) * 0.22
                group.timingFunction = CAMediaTimingFunction(name: .easeOut); group.fillMode = .both; group.isRemovedOnCompletion = false
                ring.add(group, forKey: "shock"); root.addSublayer(ring)
            }
        }
        return root
    }

    /// A soft glow pulsing once (event effects).
    private func glow(_ color: UIColor) -> CALayer {
        let g = CAGradientLayer(); g.type = .radial; g.frame = CGRect(x: 20, y: 20, width: 80, height: 80)
        g.colors = [color.withAlphaComponent(0.55).cgColor, color.withAlphaComponent(0).cgColor]; g.startPoint = CGPoint(x: 0.5, y: 0.5); g.endPoint = CGPoint(x: 1, y: 1)
        let pulse = CAKeyframeAnimation(keyPath: "opacity"); pulse.values = [0, 1, 0.6, 0]; pulse.keyTimes = [0, 0.2, 0.6, 1]; pulse.duration = 2.2; pulse.fillMode = .forwards; pulse.isRemovedOnCompletion = false
        let swell = CABasicAnimation(keyPath: "transform.scale"); swell.fromValue = 0.5; swell.toValue = 1.4; swell.duration = 2.2; swell.fillMode = .forwards; swell.isRemovedOnCompletion = false
        g.add(pulse, forKey: "pulse"); g.add(swell, forKey: "swell")
        return g
    }
    /// A short spray of motes (grain, coins, spores).
    private func motes(_ color: UIColor, rate: Float, velocity: CGFloat, angle: CGFloat, range: CGFloat, accel: CGFloat) -> CAEmitterLayer {
        let e = CAEmitterLayer(); e.emitterPosition = CGPoint(x: 60, y: 60); e.emitterShape = .circle; e.emitterSize = CGSize(width: 14, height: 14)
        e.emitterCells = [cell(Self.spark, color: color, rate: rate, life: 1.3, velocity: velocity, range: range, scale: 0.6, scaleSpeed: -0.3, alphaSpeed: -0.7, angle: angle, accel: accel)]
        e.isHidden = !Self.particles
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { e.birthRate = 0 }
        return e
    }
    /// A cloud of puffs gathering and fading (disaster, plague).
    private func cloud(_ color: UIColor) -> CALayer {
        let root = CALayer(); root.frame = CGRect(x: 0, y: 0, width: 120, height: 120)
        for (dx, dy, r) in [(-12.0, -18.0, 16.0), (4.0, -22.0, 19.0), (18.0, -16.0, 14.0), (-2.0, -12.0, 15.0)] {
            let puff = CALayer(); puff.backgroundColor = color.cgColor; puff.cornerRadius = r
            puff.frame = CGRect(x: 60 + dx - r, y: 60 + dy - r, width: r * 2, height: r * 2)
            puff.shadowColor = color.cgColor; puff.shadowOpacity = 1; puff.shadowRadius = 6; puff.shadowOffset = .zero
            let gather = CABasicAnimation(keyPath: "transform.scale"); gather.fromValue = 0.3; gather.toValue = 1.15
            let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 1, 1, 0]; fade.keyTimes = [0, 0.25, 0.7, 1]
            let g = CAAnimationGroup(); g.animations = [gather, fade]; g.duration = 2.4; g.timingFunction = CAMediaTimingFunction(name: .easeOut); g.fillMode = .forwards; g.isRemovedOnCompletion = false
            puff.add(g, forKey: "cloud"); root.addSublayer(puff)
        }
        return root
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
        for (key, v) in battleLayers where !battles.contains(key) { v.layer.removeFromSuperlayer(); battleLayers[key] = nil }
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
            if let old = battleLayers[b.key] { battleLayers[b.key] = (old.layer, b.x, b.y) }
            else {
                let l = b.key.hasPrefix("s") ? navalLayer() : battleLayer(); layer.addSublayer(l); battleLayers[b.key] = (l, b.x, b.y)
                let pop = CASpringAnimation(keyPath: "transform.scale"); pop.fromValue = 0.2; pop.toValue = 1; pop.damping = 9; pop.duration = pop.settlingDuration
                l.add(pop, forKey: "pop")
            }
        }
        let sieges = Set(effects.sieges.map(\.key))
        for (key, v) in siegeLayers where !sieges.contains(key) { v.layer.removeFromSuperlayer(); siegeLayers[key] = nil }
        for s in effects.sieges {
            let color = UIColor(red: s.r, green: s.g, blue: s.b, alpha: 1)
            let entry = siegeLayers[s.key] ?? { let (l, ring) = siegeLayer(color: color); layer.addSublayer(l); return (l, ring, s.x, s.y) }()
            siegeLayers[s.key] = (entry.layer, entry.ring, s.x, s.y)
            CATransaction.setDisableActions(false)
            entry.ring.strokeEnd = CGFloat(max(0.02, min(1, 1 - s.progress)))
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
        for (key, v) in battleArrows where !liveArrows.contains(key) { v.root.removeFromSuperlayer(); battleArrows[key] = nil }
        for a in effects.arrows {
            if let old = battleArrows[a.key] { battleArrows[a.key] = (old.root, old.fill, old.gradient, old.outline, old.head, old.reveal, a) }
            else { let l = arrowLayer(a); layer.insertSublayer(l.0, at: 0); battleArrows[a.key] = (l.0, l.1, l.2, l.3, l.4, l.5, a) }
        }
        for b in effects.bursts where !seen.contains(b.id) {
            guard burstLayers.count < 24 else { continue }
            let l = burstLayer(b); layer.addSublayer(l); burstLayers[b.id] = (l, b.x, b.y)
            let id = b.id
            once(id, after: 2.6) { [weak self] in self?.burstLayers[id]?.layer.removeFromSuperlayer(); self?.burstLayers[id] = nil }
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
        let k = CGFloat(max(0.85, min(1.4, camera.scale / 2)))
        // The swords hang just above the armies they belong to (the figures stay visible beneath),
        // and battles that would overlap on screen share one mark.
        var marks = [CGPoint]()
        for key in battleLayers.keys.sorted() {
            let v = battleLayers[key]!
            var p = screen(v.x, v.y); p.y -= 24 * k
            let crowded = marks.contains { hypot($0.x - p.x, $0.y - p.y) < 34 * k }
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
        for v in siegeLayers.values { var p = screen(v.x, v.y); p.y -= 16 * k; v.layer.position = p; v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k)) }
        for v in flashLayers.values { v.layer.position = screen(v.x, v.y) }
        for v in claimLayers.values { v.layer.position = screen(v.x, v.y) }
        for v in burstLayers.values { v.layer.position = screen(v.x, v.y) }
        for v in peaceLayers.values { var p = screen(v.x, v.y); p.y -= 10; v.layer.position = p }
        for v in battleArrows.values { v.root.frame = bounds; v.gradient.frame = bounds; v.fill.frame = bounds; v.reveal.frame = bounds; layoutArrow(v) { screen($0, $1) } }
        for v in arrowLayers.values {
            let a = screen(v.d.fromX, v.d.fromY), b = screen(v.d.toX, v.d.toY)
            let dx = b.x - a.x, dy = b.y - a.y, len = max(1, hypot(dx, dy)), ux = dx / len, uy = dy / len
            let tip = CGPoint(x: b.x - ux * 6, y: b.y - uy * 6), base = CGPoint(x: tip.x - ux * 16, y: tip.y - uy * 16)
            let path = UIBezierPath(); path.move(to: a); path.addLine(to: base); v.layer.path = path.cgPath
            let head = UIBezierPath(); head.move(to: tip)
            head.addLine(to: CGPoint(x: base.x - uy * 9, y: base.y + ux * 9)); head.addLine(to: CGPoint(x: base.x + uy * 9, y: base.y - ux * 9)); head.close()
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
