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
    struct Battle: Equatable { let key: String; let x: Double; let y: Double }
    struct Siege: Equatable { let key: String; let x: Double; let y: Double; let progress: Double; let r: Double; let g: Double; let b: Double }
    struct Flash: Equatable { let id: String; let x: Double; let y: Double; let r: Double; let g: Double; let b: Double }
    struct Declaration: Equatable { let id: String; let fromX: Double; let fromY: Double; let toX: Double; let toY: Double }
    struct Claim: Equatable { let id: String; let x: Double; let y: Double; let r: Double; let g: Double; let b: Double; let delay: Double }
    struct Peace: Equatable { let id: String; let x: Double; let y: Double }
    var battles: [Battle] = []
    var sieges: [Siege] = []
    var flashes: [Flash] = []
    var declarations: [Declaration] = []
    var claims: [Claim] = []
    var peaces: [Peace] = []
}

final class EffectsView: UIView {
    private var battleLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var siegeLayers: [String: (layer: CALayer, ring: CAShapeLayer, x: Double, y: Double)] = [:]
    private var flashLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var arrowLayers: [String: (layer: CAShapeLayer, head: CAShapeLayer, d: MapEffects.Declaration)] = [:]
    private var claimLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var peaceLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
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

    private func battleLayer() -> CALayer {
        let l = CALayer()
        l.bounds = CGRect(x: 0, y: 0, width: 34, height: 34 * 194 / 258)
        l.contents = Self.swords; l.contentsGravity = .resize
        l.contentsRect = CGRect(x: 0, y: 0, width: 0.2, height: 0.125)
        let clip = CAKeyframeAnimation(keyPath: "contentsRect")
        clip.values = (0..<40).map { NSValue(cgRect: CGRect(x: CGFloat($0 % 5) * 0.2, y: CGFloat($0 / 5) * 0.125, width: 0.2, height: 0.125)) }
        clip.calculationMode = .discrete; clip.duration = 40.0 / 12; clip.repeatCount = .infinity
        l.add(clip, forKey: "clip")
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
        for v in peaceLayers.values { var p = screen(v.x, v.y); p.y -= 10; v.layer.position = p }
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
