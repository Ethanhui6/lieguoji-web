import UIKit
import LieguojiCore

/// Live markers drawn over the map with Core Animation (no per-frame work while the camera rests):
/// battles pulse, sieges show their remaining resistance as a ring in the besieger's colour, and a
/// captured province flashes with the conqueror's colour.
struct MapEffects: Equatable {
    struct Battle: Equatable { let key: String; let x: Double; let y: Double }
    struct Siege: Equatable { let key: String; let x: Double; let y: Double; let progress: Double; let r: Double; let g: Double; let b: Double }
    struct Flash: Equatable { let id: String; let x: Double; let y: Double; let r: Double; let g: Double; let b: Double }
    var battles: [Battle] = []
    var sieges: [Siege] = []
    var flashes: [Flash] = []
}

final class EffectsView: UIView {
    private var battleLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var siegeLayers: [String: (layer: CALayer, ring: CAShapeLayer, x: Double, y: Double)] = [:]
    private var flashLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var seenFlashes = Set<String>()
    private var camera: MapCamera?
    private var viewport: CGSize = .zero

    override init(frame: CGRect) { super.init(frame: frame); isUserInteractionEnabled = false }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private static let seal = UIColor(red: 0.706, green: 0.255, blue: 0.18, alpha: 1)

    private func battleLayer() -> CALayer {
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 40, height: 40)
        for i in 0..<2 {
            let ring = CAShapeLayer()
            ring.path = UIBezierPath(ovalIn: CGRect(x: 8, y: 8, width: 24, height: 24)).cgPath
            ring.fillColor = UIColor.clear.cgColor; ring.strokeColor = Self.seal.cgColor; ring.lineWidth = 2
            ring.frame = root.bounds
            let scale = CABasicAnimation(keyPath: "transform.scale"); scale.fromValue = 0.5; scale.toValue = 1.7
            let fade = CABasicAnimation(keyPath: "opacity"); fade.fromValue = 0.95; fade.toValue = 0
            let group = CAAnimationGroup(); group.animations = [scale, fade]; group.duration = 1.4; group.repeatCount = .infinity
            group.beginTime = CACurrentMediaTime() + Double(i) * 0.7; group.timingFunction = CAMediaTimingFunction(name: .easeOut)
            ring.add(group, forKey: "pulse"); root.addSublayer(ring)
        }
        let icon = CALayer(); icon.frame = CGRect(x: 11, y: 11, width: 18, height: 18)
        let config = UIImage.SymbolConfiguration(pointSize: 13, weight: .bold)
        let image = UIImage(systemName: "flame.fill", withConfiguration: config)?.withTintColor(Self.seal, renderingMode: .alwaysOriginal)
        let disk = CAShapeLayer(); disk.path = UIBezierPath(ovalIn: CGRect(x: 9, y: 9, width: 22, height: 22)).cgPath
        disk.fillColor = UIColor(red: 0.984, green: 0.972, blue: 0.945, alpha: 0.95).cgColor; disk.strokeColor = Self.seal.cgColor; disk.lineWidth = 1.5
        root.addSublayer(disk)
        icon.contents = image?.cgImage; icon.contentsGravity = .resizeAspect; root.addSublayer(icon)
        return root
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

    func set(_ effects: MapEffects) {
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let battles = Set(effects.battles.map(\.key))
        for (key, v) in battleLayers where !battles.contains(key) {
            v.layer.removeFromSuperlayer(); battleLayers[key] = nil
        }
        for b in effects.battles {
            if let old = battleLayers[b.key] { battleLayers[b.key] = (old.layer, b.x, b.y) }
            else {
                let l = battleLayer(); layer.addSublayer(l); battleLayers[b.key] = (l, b.x, b.y)
                l.transform = CATransform3DMakeScale(0.1, 0.1, 1)
                let pop = CASpringAnimation(keyPath: "transform.scale"); pop.fromValue = 0.1; pop.toValue = 1; pop.damping = 9; pop.duration = pop.settlingDuration
                l.add(pop, forKey: "pop"); l.transform = CATransform3DIdentity
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
        for f in effects.flashes where !seenFlashes.contains(f.id) {
            seenFlashes.insert(f.id)
            let l = flashLayer(color: UIColor(red: f.r, green: f.g, blue: f.b, alpha: 1)); layer.addSublayer(l)
            flashLayers[f.id] = (l, f.x, f.y)
            let id = f.id
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) { [weak self] in self?.flashLayers[id]?.layer.removeFromSuperlayer(); self?.flashLayers[id] = nil }
        }
        CATransaction.commit()
        if let camera { update(camera: camera, viewport: viewport) }
    }

    func update(camera: MapCamera, viewport: CGSize) {
        self.camera = camera; self.viewport = viewport
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let k = CGFloat(max(0.55, min(1.3, camera.scale / 2)))
        for v in battleLayers.values { let p = camera.toScreen(x: v.x, y: v.y, viewport: vp); v.layer.position = CGPoint(x: p.x, y: p.y); v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k)) }
        for v in siegeLayers.values { let p = camera.toScreen(x: v.x, y: v.y, viewport: vp); v.layer.position = CGPoint(x: p.x, y: p.y - 16 * k); v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k)) }
        for v in flashLayers.values { let p = camera.toScreen(x: v.x, y: v.y, viewport: vp); v.layer.position = CGPoint(x: p.x, y: p.y) }
        CATransaction.commit()
    }
}
