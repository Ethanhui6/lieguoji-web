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
    struct Battle: Equatable { let key: String; let x: Double; let y: Double; var left: Side? = nil; var right: Side? = nil }
    struct Burst: Equatable { enum Kind { case destroyed, founded, shock }; let id: String; let x: Double; let y: Double; let kind: Kind; let r: Double; let g: Double; let b: Double }
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
    private var battleLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var siegeLayers: [String: (layer: CALayer, ring: CAShapeLayer, x: Double, y: Double)] = [:]
    private var flashLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var arrowLayers: [String: (layer: CAShapeLayer, head: CAShapeLayer, d: MapEffects.Declaration)] = [:]
    private var claimLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var peaceLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var burstLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var battleArrows: [String: (root: CALayer, fill: CAShapeLayer, gradient: CAGradientLayer, outline: CAShapeLayer, head: CAShapeLayer, reveal: CAShapeLayer, a: MapEffects.Arrow)] = [:]
    private var seen = Set<String>()
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
    private func battleSmoke() -> CAEmitterLayer {
        let e = CAEmitterLayer(); e.emitterShape = .circle; e.emitterSize = CGSize(width: 18, height: 10); e.renderMode = .additive
        e.emitterCells = [
            cell(Self.puff, color: UIColor(white: 0.35, alpha: 0.35), rate: 6, life: 2.2, velocity: 9, range: .pi / 2, scale: 0.55, scaleSpeed: 0.35, alphaSpeed: -0.16, spin: 0.4, angle: -.pi / 2),
            cell(Self.spark, color: UIColor(red: 1, green: 0.72, blue: 0.3, alpha: 1), rate: 14, life: 0.55, velocity: 38, scale: 0.55, scaleSpeed: -0.6, alphaSpeed: -1.6, accel: 30),
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
        let l = CALayer()
        l.bounds = CGRect(x: 0, y: 0, width: 34, height: 34 * 194 / 258)
        l.contents = Self.swords; l.contentsGravity = .resize
        l.contentsRect = CGRect(x: 0, y: 0, width: 0.2, height: 0.125)
        let clip = CAKeyframeAnimation(keyPath: "contentsRect")
        clip.values = (0..<40).map { NSValue(cgRect: CGRect(x: CGFloat($0 % 5) * 0.2, y: CGFloat($0 / 5) * 0.125, width: 0.2, height: 0.125)) }
        clip.calculationMode = .discrete; clip.duration = 40.0 / 12; clip.repeatCount = .infinity
        l.add(clip, forKey: "clip")
        // Particles cost: only the first few battles on the map smoke.
        if battleLayers.count < 6 { let smoke = battleSmoke(); smoke.emitterPosition = CGPoint(x: l.bounds.midX, y: l.bounds.midY); l.insertSublayer(smoke, at: 0) }
        return l
    }

    private func siegeLayer(color: UIColor) -> (CALayer, CAShapeLayer) {
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 30, height: 30)
        let track = CAShapeLayer(); track.frame = root.bounds
        track.path = UIBezierPath(ovalIn: CGRect(x: 4, y: 4, width: 22, height: 22)).cgPath
        track.fillColor = UIColor(white: 1, alpha: 0.75).cgColor; track.strokeColor = UIColor(white: 0, alpha: 0.18).cgColor; track.lineWidth = 3.5
        let ring = CAShapeLayer(); ring.frame = root.bounds
        ring.path = UIBezierPath(arcCenter: CGPoint(x: 15, y: 15), radius: 11, startAngle: -.pi / 2, endAngle: .pi * 1.5, clockwise: true).cgPath
        ring.fillColor = UIColor.clear.cgColor; ring.strokeColor = color.cgColor; ring.lineWidth = 3.5; ring.lineCap = .round
        let flag = CALayer(); flag.frame = CGRect(x: 9, y: 9, width: 12, height: 12)
        flag.contents = UIImage(systemName: "flag.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 9, weight: .bold))?.withTintColor(color, renderingMode: .alwaysOriginal).cgImage
        flag.contentsGravity = .resizeAspect
        let fire = CAEmitterLayer(); fire.emitterShape = .line; fire.emitterSize = CGSize(width: 22, height: 1); fire.emitterPosition = CGPoint(x: 15, y: 30)
        fire.emitterCells = [cell(Self.puff, color: UIColor(red: 1, green: 0.45, blue: 0.12, alpha: 0.55), rate: 10, life: 1.0, velocity: 14, range: .pi / 6, scale: 0.28, scaleSpeed: -0.18, alphaSpeed: -0.8, angle: -.pi / 2),
                             cell(Self.spark, color: UIColor(red: 1, green: 0.8, blue: 0.4, alpha: 1), rate: 5, life: 1.4, velocity: 22, range: .pi / 4, scale: 0.4, scaleSpeed: -0.2, alphaSpeed: -0.7, angle: -.pi / 2)]
        root.addSublayer(fire)
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
        return root
    }

    /// PlayerController.DrawAttackArrowAnim: the pattern flows 5 units a second, gone after 2 s.
    private func declarationLayers() -> (CAShapeLayer, CAShapeLayer) {
        let line = CAShapeLayer()
        line.strokeColor = UIColor(red: 0.86, green: 0.12, blue: 0.1, alpha: 0.92).cgColor; line.fillColor = UIColor.clear.cgColor
        line.lineWidth = 5; line.lineCap = .round; line.lineDashPattern = [14, 8]
        let flow = CABasicAnimation(keyPath: "lineDashPhase"); flow.fromValue = 0; flow.toValue = -44; flow.duration = 0.45; flow.repeatCount = .infinity
        line.add(flow, forKey: "flow")
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
        let outline = CAShapeLayer(); outline.fillColor = UIColor.clear.cgColor; outline.strokeColor = UIColor(red: 0.11, green: 0.1, blue: 0.09, alpha: 0.55).cgColor; outline.lineWidth = 1.2; outline.lineJoin = .round
        let head = CAShapeLayer(); head.fillColor = color(a.deep); head.strokeColor = outline.strokeColor; head.lineWidth = 0.8
        // The deep tail half (the arrow darkens towards its head).
        let reveal = CAShapeLayer(); reveal.fillColor = color(a.deep)
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
        func width(_ k: CGFloat) -> CGFloat { (8 - 5 * k * k * (3 - 2 * k)) * 1.3 }
        var left = [CGPoint](), right = [CGPoint]()
        for (i, p) in points.enumerated() {
            let q = points[min(i + 1, 29)], o = points[max(i - 1, 0)], dx = q.x - o.x, dy = q.y - o.y, len = max(0.001, hypot(dx, dy))
            let w = width(CGFloat(i) / 29) / 2
            left.append(CGPoint(x: p.x - dy / len * w, y: p.y + dx / len * w)); right.append(CGPoint(x: p.x + dy / len * w, y: p.y - dx / len * w))
        }
        let body = UIBezierPath(); body.move(to: left[0]); for p in left.dropFirst() { body.addLine(to: p) }; for p in right.reversed() { body.addLine(to: p) }; body.close()
        v.fill.path = body.cgPath; v.outline.path = body.cgPath
        let tip = points[29], before = points[28], dx = tip.x - before.x, dy = tip.y - before.y, len = max(0.001, hypot(dx, dy)), ux = dx / len, uy = dy / len
        let h: CGFloat = 7.8, l: CGFloat = 11.7
        let head = UIBezierPath(); head.move(to: CGPoint(x: tip.x - uy * h, y: tip.y + ux * h)); head.addLine(to: CGPoint(x: tip.x + ux * l, y: tip.y + uy * l)); head.addLine(to: CGPoint(x: tip.x + uy * h, y: tip.y - ux * h)); head.close()
        v.head.path = head.cgPath
        let center = UIBezierPath(); center.move(to: points[0]); for p in points.dropFirst() { center.addLine(to: p) }; center.addLine(to: CGPoint(x: tip.x + ux * l, y: tip.y + uy * l))
        _ = center
        let tail = UIBezierPath(); tail.move(to: left[15]); for p in left[16...] { tail.addLine(to: p) }; for p in right[15...].reversed() { tail.addLine(to: p) }; tail.close()
        v.reveal.path = tail.cgPath
        v.gradient.startPoint = CGPoint(x: s.x / max(1, bounds.width), y: s.y / max(1, bounds.height)); v.gradient.endPoint = CGPoint(x: e.x / max(1, bounds.width), y: e.y / max(1, bounds.height))
    }

    /// One-shot bursts: smoke for an army destroyed, coloured sparks and a rising flag for a new state,
    /// a red shockwave at the capital of a state that was declared on.
    private func burstLayer(_ b: MapEffects.Burst) -> CALayer {
        let color = UIColor(red: b.r, green: b.g, blue: b.b, alpha: 1)
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 120, height: 120)
        switch b.kind {
        case .destroyed:
            let e = CAEmitterLayer(); e.emitterPosition = CGPoint(x: 60, y: 60); e.emitterShape = .point
            e.emitterCells = [cell(Self.puff, color: UIColor(white: 0.25, alpha: 0.6), rate: 80, life: 1.4, velocity: 30, scale: 0.6, scaleSpeed: 0.5, alphaSpeed: -0.6, spin: 0.6)]
            root.addSublayer(e)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { e.birthRate = 0 }
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

    private func once(_ id: String, after seconds: Double, remove: @escaping () -> Void) {
        seen.insert(id)
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { remove() }
    }

    func set(_ effects: MapEffects) {
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let battles = Set(effects.battles.map(\.key))
        for (key, v) in battleLayers where !battles.contains(key) { v.layer.removeFromSuperlayer(); battleLayers[key] = nil }
        for b in effects.battles {
            if let old = battleLayers[b.key] { battleLayers[b.key] = (old.layer, b.x, b.y) }
            else {
                let l = battleLayer(); layer.addSublayer(l); battleLayers[b.key] = (l, b.x, b.y)
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
            let l = burstLayer(b); layer.addSublayer(l); burstLayers[b.id] = (l, b.x, b.y)
            let id = b.id
            once(id, after: 2.6) { [weak self] in self?.burstLayers[id]?.layer.removeFromSuperlayer(); self?.burstLayers[id] = nil }
        }
        for d in effects.declarations where !seen.contains(d.id) {
            let (line, head) = declarationLayers(); layer.addSublayer(line); layer.addSublayer(head)
            arrowLayers[d.id] = (line, head, d)
            let id = d.id
            once(id, after: 2.1) { [weak self] in self?.arrowLayers[id]?.layer.removeFromSuperlayer(); self?.arrowLayers[id]?.head.removeFromSuperlayer(); self?.arrowLayers[id] = nil }
        }
        for c in effects.claims where !seen.contains(c.id) {
            let l = claimLayer(c); layer.addSublayer(l); claimLayers[c.id] = (l, c.x, c.y)
            let id = c.id
            once(id, after: 4.2 + c.delay) { [weak self] in self?.claimLayers[id]?.layer.removeFromSuperlayer(); self?.claimLayers[id] = nil }
        }
        for p in effects.peaces where !seen.contains(p.id) {
            let l = peaceLayer(); layer.addSublayer(l); peaceLayers[p.id] = (l, p.x, p.y)
            let id = p.id
            once(id, after: 1.8) { [weak self] in self?.peaceLayers[id]?.layer.removeFromSuperlayer(); self?.peaceLayers[id] = nil }
        }
        CATransaction.commit()
        if let camera { update(camera: camera, viewport: viewport) }
    }

    func update(camera: MapCamera, viewport: CGSize) {
        self.camera = camera; self.viewport = viewport
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        func screen(_ x: Double, _ y: Double) -> CGPoint { let p = camera.toScreen(x: x, y: y, viewport: vp); return CGPoint(x: p.x, y: p.y) }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let k = CGFloat(max(0.6, min(1.4, camera.scale / 2)))
        for v in battleLayers.values { v.layer.position = screen(v.x, v.y); v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k)) }
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
        CATransaction.commit()
    }
}
