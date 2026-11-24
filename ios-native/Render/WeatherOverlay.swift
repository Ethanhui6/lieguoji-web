import UIKit
import LieguojiCore

/// 轻量级局部天时灾异州郡微标层（零私有 KVC、零全屏 CAEmitterLayer 粒子风暴、零 5MB 序列帧常驻）：
/// 仅在当前存在活跃灾异/丰年州郡时于对应坐标挂载少量微标，空闲时 0 显存、0 粒子、0 GPU 占用。
final class WeatherOverlayView: UIView {
    struct Zone: Equatable {
        let province: Int
        let x: Double
        let y: Double
        let kind: Int // 1=snow, 2=drought, 3=flood, 4=plague, 5=harvest
    }

    private var zoneLayers: [Int: (layer: CALayer, zone: Zone)] = [:]

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        clipsToBounds = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func update(seasonPhase: Float, zones: [Zone], camera: MapCamera, viewport: CGSize, active: Bool) {
        _ = seasonPhase
        let visibleZones = (active && !UIAccessibility.isReduceMotionEnabled && viewport.width > 10) ? Array(zones.prefix(6)) : []
        if visibleZones.isEmpty {
            if !zoneLayers.isEmpty {
                CATransaction.begin()
                CATransaction.setDisableActions(true)
                for (_, entry) in zoneLayers { entry.layer.removeFromSuperlayer() }
                zoneLayers.removeAll()
                CATransaction.commit()
            }
            return
        }

        let keep = Set(visibleZones.map(\.province))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        for (pid, entry) in zoneLayers where !keep.contains(pid) {
            entry.layer.removeFromSuperlayer()
            zoneLayers[pid] = nil
        }

        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        let visible = CGRect(origin: .zero, size: viewport).insetBy(dx: -40, dy: -40)
        let k = CGFloat(max(0.78, min(1.18, camera.scale * 0.72)))

        for z in visibleZones {
            let entry: (layer: CALayer, zone: Zone)
            if let existing = zoneLayers[z.province], existing.zone.kind == z.kind {
                entry = (existing.layer, z)
                zoneLayers[z.province] = entry
            } else {
                zoneLayers[z.province]?.layer.removeFromSuperlayer()
                let l = makeZoneLayer(kind: z.kind)
                layer.addSublayer(l)
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
    }

    private func makeZoneLayer(kind: Int) -> CALayer {
        let root = CALayer()
        root.bounds = CGRect(x: 0, y: 0, width: 26, height: 26)
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
            sprite.opacity = 0.90
            root.addSublayer(sprite)
        }
        return root
    }
}
