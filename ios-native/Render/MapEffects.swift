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
        /// 主战文明标识（自动匹配东亚画戟/楼船、西欧长剑/盖伦舰、北欧维京长船）。
        var culture = ""
    }
    struct Burst: Equatable {
        enum Kind { case destroyed, founded, shock, harvest, disaster, drought, snow, flood, talent, plague, trade, regime, coup }
        let id: String; let x: Double; let y: Double; let kind: Kind; let r: Double; let g: Double; let b: Double; var unit = ""
        var culture = ""
        /// 何时开始（秒，自收到这一步起）：一步里相继阵亡的军队错开播放。
        var delay = 0.0
        /// 同处合并的数量（阵亡几支合为一处）。
        var count = 1
    }
    struct Siege: Equatable { let key: String; let x: Double; let y: Double; let progress: Double; let r: Double; let g: Double; let b: Double }
    struct Flash: Equatable {
        let id: String; let x: Double; let y: Double; let r: Double; let g: Double; let b: Double
        /// 征服方文明标识（插旗时自动匹配东亚龙旗／西欧纹章旗／伊斯兰弯月旗／草原苏鲁锭军纛）。
        var culture = ""
        /// 山河回放专用图志晕环样式（以水墨鎏金扩散晕环与舆图星徽取代插旗，清爽高级不遮挡疆域）。
        var atlasStyle: Bool = false
    }
    struct Declaration: Equatable { let id: String; let fromX: Double; let fromY: Double; let toX: Double; let toY: Double }
    struct Claim: Equatable { let id: String; let x: Double; let y: Double; let r: Double; let g: Double; let b: Double; let delay: Double }
    struct Peace: Equatable { let id: String; let x: Double; let y: Double }
    struct Arrow: Equatable {
        let key: String; let sx: Double; let sy: Double; let cx: Double; let cy: Double; let ex: Double; let ey: Double
        let shallow: (Double, Double, Double); let deep: (Double, Double, Double)
        static func == (a: Arrow, b: Arrow) -> Bool { a.key == b.key && a.sx == b.sx && a.sy == b.sy && a.ex == b.ex && a.ey == b.ey && a.cx == b.cx && a.cy == b.cy && a.deep == b.deep }
    }
    /// 外交地缘视线弧线与军团海陆补给脉络（war: 朱红敌对线；ally: 青玉同盟线；vassal: 鎏金宗藩线；supply: 军团后勤补给虚线）。
    struct GeoArc: Equatable {
        enum Kind: Equatable { case war, ally, vassal, supply }
        let key: String; let fromX: Double; let fromY: Double; let toX: Double; let toY: Double
        let kind: Kind; var severed: Bool = false
    }
    /// 近海港口封锁警戒圈（旋转朱墨锁链环 + 警示波纹）。
    struct Blockade: Equatable {
        let key: String; let x: Double; let y: Double; let r: Double; let g: Double; let b: Double
    }
    /// 两栖抢滩登陆波浪与近海舰炮支援弹道。
    struct Landing: Equatable {
        let key: String; let x: Double; let y: Double; let fx: Double; let fy: Double; let hasFire: Bool
        let r: Double; let g: Double; let b: Double
    }
    var battles: [Battle] = []
    var sieges: [Siege] = []
    var flashes: [Flash] = []
    var declarations: [Declaration] = []
    var claims: [Claim] = []
    var peaces: [Peace] = []
    var arrows: [Arrow] = []
    var bursts: [Burst] = []
    var geoArcs: [GeoArc] = []
    var blockades: [Blockade] = []
    var landings: [Landing] = []
}

final class EffectsView: UIView {
    /// Smoke, fire and sparks (设置 › 粒子特效).
    static var particles = true
    /// 动画帧率 (推演与画面): 默认解锁真 60/120fps 丝滑实时动画（仅高温时柔和回落至 30fps）。
    static var fps = 60
    static func calm(_ a: CAAnimation) -> CAAnimation {
        let f = Float(Energy.hot ? min(fps, 30) : max(60, fps))
        a.preferredFrameRateRange = CAFrameRateRange(minimum: max(30, f / 2), maximum: max(f, 120), preferred: f)
        return a
    }
    private var battleLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var battleOrder: [String] = []
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
    private var geoArcLayers: [String: (layer: CAShapeLayer, arc: MapEffects.GeoArc)] = [:]
    private var blockadeLayers: [String: (layer: CALayer, x: Double, y: Double)] = [:]
    private var landingLayers: [String: (layer: CALayer, arc: CAShapeLayer?, item: MapEffects.Landing)] = [:]
    private var seen = Set<String>()
    private var seenOrder: [String] = []
    private var camera: MapCamera?
    /// 地图上军队图标此刻的边长（点）：阵亡动画里倒下的军旗与之同大。
    private var iconPoints: CGFloat { CGFloat(MapRenderer.iconPoints(camera?.scale ?? 1, iconScale: 1)) }
    private var viewport: CGSize = .zero
    private var reduceMotion = false

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
        // 高倍缩放观战时实行战场去文字化：隐藏重叠战损飘字，把舞台完全交给序列帧交锋、箭雨炮火与双色兵力条。
        guard !Energy.hot, (camera?.scale ?? 1.0) < 1.45, floats < 6, window != nil else { return }
        let font = UIFont(name: "TW-Kai-98_1", size: 13.5) ?? .boldSystemFont(ofSize: 13.5)
        let fill = naval ? UIColor(red: 0.12, green: 0.36, blue: 0.72, alpha: 1) : UIColor(red: 0.76, green: 0.14, blue: 0.08, alpha: 1)
        let l = CATextLayer()
        // Filled and outlined in paper, readable over land, sea and borders without a shadow pass.
        l.string = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: fill, .strokeColor: UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 1), .strokeWidth: -5])
        l.alignmentMode = .center; l.contentsScale = UIScreen.main.scale
        l.bounds = CGRect(x: 0, y: 0, width: 108, height: 22); l.position = p
        (floatHost ?? layer).addSublayer(l)
        // 轻轻浮起、淡出：柔和缓动上升一小段，清晰不抢眼。
        let up = CABasicAnimation(keyPath: "position.y"); up.fromValue = p.y; up.toValue = p.y - 26
        up.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 0.84, 0.3, 1)
        let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 0.96, 0.96, 0]; fade.keyTimes = [0, 0.14, 0.68, 1]
        let pop = CAKeyframeAnimation(keyPath: "transform.scale"); pop.values = [0.82, 1.06, 1, 0.98]; pop.keyTimes = [0, 0.18, 0.36, 1]
        let g = CAAnimationGroup(); g.animations = [up, fade, pop]; g.duration = 1.45; g.fillMode = .forwards; g.isRemovedOnCompletion = false
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
    /// 海战: 48×34pt 多层次 60/120fps 双舰群舷炮齐射剧场（三重海浪激波 + 左右舷连环炮口炽焰 + 6 道交错抛物火炮弹道 + 落弹洁白水柱浪环 + 清晰 40×4.8pt 战力对比条）。
    private func navalLayer(culture: String) -> CALayer {
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 48, height: 34)
        let strength = CALayer(); strength.name = "strength"; strength.bounds = CGRect(x: 0, y: 0, width: 40, height: 4.8); strength.position = CGPoint(x: 24, y: -12)
        strength.cornerRadius = 2.4; strength.masksToBounds = true; strength.borderWidth = 0.85
        strength.borderColor = UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 0.96).cgColor; strength.isHidden = true
        strength.addSublayer(CALayer()); strength.addSublayer(CALayer()); root.addSublayer(strength)
        // 三重扩散海浪水花环
        for idx in 0..<3 {
            let ring = CAShapeLayer(); ring.frame = root.bounds
            ring.path = UIBezierPath(ovalIn: CGRect(x: 8, y: 7, width: 32, height: 20)).cgPath
            ring.fillColor = nil
            ring.strokeColor = (idx == 0 ? UIColor(red: 0.96, green: 0.99, blue: 1.0, alpha: 0.94) : idx == 1 ? UIColor(red: 0.62, green: 0.86, blue: 0.98, alpha: 0.80) : UIColor(red: 1.0, green: 0.78, blue: 0.34, alpha: 0.65)).cgColor
            ring.lineWidth = idx == 0 ? 1.85 : 1.25
            let grow = CABasicAnimation(keyPath: "transform.scale"); grow.fromValue = 0.38; grow.toValue = 2.05
            let fade = CABasicAnimation(keyPath: "opacity"); fade.fromValue = 0.95; fade.toValue = 0
            let g = CAAnimationGroup(); g.animations = [grow, fade]; g.duration = 1.32; g.repeatCount = .infinity
            g.timeOffset = Double(idx) * 0.44 + Double.random(in: 0..<0.22)
            ring.add(Self.calm(g), forKey: "splash-\(idx)")
            root.addSublayer(ring)
        }
        // 炮火暖金赤焰呼吸核心与双舷炮口闪光
        let fireGlow = CAShapeLayer(); fireGlow.frame = root.bounds
        fireGlow.path = UIBezierPath(ovalIn: CGRect(x: 14, y: 7, width: 20, height: 20)).cgPath
        fireGlow.fillColor = UIColor(red: 1.0, green: 0.56, blue: 0.14, alpha: 0.38).cgColor
        let glowAnim = CAKeyframeAnimation(keyPath: "opacity"); glowAnim.values = [0.28, 0.96, 0.32]; glowAnim.duration = 0.74; glowAnim.repeatCount = .infinity
        fireGlow.add(Self.calm(glowAnim), forKey: "glow")
        root.addSublayer(fireGlow)
        // 左右舷各 2 道交错齐射炮火弹道弧线 + 炮口闪焰 + 落弹洁白激浪环
        for side in 0..<2 {
            for salvo in 0..<2 {
                let dy = CGFloat(salvo) * 3.5
                let volley = CAShapeLayer(); volley.frame = root.bounds
                let vp = UIBezierPath()
                if side == 0 {
                    vp.move(to: CGPoint(x: 4, y: 22 - dy * 0.5))
                    vp.addQuadCurve(to: CGPoint(x: 41, y: 12 + dy * 0.6), controlPoint: CGPoint(x: 22, y: 1 + dy))
                } else {
                    vp.move(to: CGPoint(x: 44, y: 22 - dy * 0.5))
                    vp.addQuadCurve(to: CGPoint(x: 7, y: 12 + dy * 0.6), controlPoint: CGPoint(x: 26, y: 1 + dy))
                }
                volley.path = vp.cgPath; volley.fillColor = nil
                volley.strokeColor = (salvo == 0 ? UIColor(red: 1.0, green: 0.88, blue: 0.36, alpha: 0.98) : UIColor(red: 1.0, green: 0.58, blue: 0.18, alpha: 0.92)).cgColor
                volley.lineWidth = salvo == 0 ? 2.25 : 1.65; volley.lineCap = .round
                let shoot = CAKeyframeAnimation(keyPath: "strokeEnd"); shoot.values = [0.0, 1.0, 1.0]; shoot.keyTimes = [0, 0.44, 1]
                let tail = CAKeyframeAnimation(keyPath: "strokeStart"); tail.values = [0.0, 0.16, 1.0]; tail.keyTimes = [0, 0.32, 1]
                let vFade = CAKeyframeAnimation(keyPath: "opacity"); vFade.values = [0.0, 1.0, 0.0]; vFade.keyTimes = [0, 0.26, 1]
                let vg = CAAnimationGroup(); vg.animations = [shoot, tail, vFade]; vg.duration = 0.86; vg.repeatCount = .infinity
                let offset = Double(side) * 0.43 + Double(salvo) * 0.16
                vg.timeOffset = offset
                volley.add(Self.calm(vg), forKey: "volley-\(side)-\(salvo)")
                root.addSublayer(volley)

                // 炮弹入水洁白浪环
                let splash = CAShapeLayer(); splash.frame = CGRect(x: side == 0 ? 34 : 2, y: 6 + dy * 0.5, width: 12, height: 10)
                splash.path = UIBezierPath(ovalIn: CGRect(x: 1, y: 1, width: 10, height: 8)).cgPath
                splash.fillColor = nil
                splash.strokeColor = UIColor(red: 0.96, green: 0.99, blue: 1.0, alpha: 0.95).cgColor
                splash.lineWidth = 1.5; splash.opacity = 0
                let sScale = CAKeyframeAnimation(keyPath: "transform.scale"); sScale.values = [0.30, 0.30, 1.80]; sScale.keyTimes = [0, 0.36, 1]
                let sFade = CAKeyframeAnimation(keyPath: "opacity"); sFade.values = [0.0, 0.0, 0.96, 0.0]; sFade.keyTimes = [0, 0.36, 0.54, 1]
                let sg = CAAnimationGroup(); sg.animations = [sScale, sFade]; sg.duration = 0.86; sg.repeatCount = .infinity
                sg.timeOffset = offset
                splash.add(Self.calm(sg), forKey: "splash-\(side)-\(salvo)")
                root.addSublayer(splash)
            }
        }
        _ = culture
        if Self.particles && !Energy.hot && battleLayers.count < 8 {
            let e = CAEmitterLayer(); e.emitterShape = .line; e.emitterSize = CGSize(width: 30, height: 1); e.emitterPosition = CGPoint(x: 24, y: 17)
            e.emitterCells = [
                cell(Self.puff, color: UIColor(white: 0.96, alpha: 0.30), rate: 4.2, life: 1.7, velocity: 9, range: .pi / 4, scale: 0.30, scaleSpeed: 0.16, alphaSpeed: -0.14, spin: 0.25, angle: -.pi / 2),
                cell(Self.spark, color: UIColor(red: 1, green: 0.74, blue: 0.24, alpha: 1), rate: 7.5, life: 0.34, velocity: 25, range: .pi / 3, scale: 0.56, scaleSpeed: -1.2, alphaSpeed: -2.8, angle: -.pi / 2),
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
        guard let bar = root.sublayers?.first(where: { $0.name == "strength" }), bar.sublayers?.count == 2 else { return }
        let total = b.leftTroops + b.rightTroops
        guard let l = b.left, let r = b.right, total > 0 else { bar.isHidden = true; return }
        let wasHidden = bar.isHidden
        bar.isHidden = false
        let w = bar.bounds.width, h = bar.bounds.height, share = w * CGFloat(b.leftTroops) / CGFloat(total)
        // 首次出现立即落位（避免从复用旧条滑变），交战中再平滑过渡兵力消长。
        CATransaction.setDisableActions(wasHidden)
        if !wasHidden { CATransaction.setAnimationDuration(0.35) }
        defer { CATransaction.setDisableActions(true) }
        bar.sublayers![0].frame = CGRect(x: 0, y: 0, width: share, height: h); bar.sublayers![0].backgroundColor = UIColor(red: l.r, green: l.g, blue: l.b, alpha: 1).cgColor
        bar.sublayers![1].frame = CGRect(x: share, y: 0, width: w - share, height: h); bar.sublayers![1].backgroundColor = UIColor(red: r.r, green: r.g, blue: r.b, alpha: 1).cgColor
    }
    private func battleLayer(culture: String) -> CALayer {
        // 60/120fps 多层次水墨交锋剧场：双重朱墨震波 + 双层鎏金象牙刀光疾斩 + 八芒寒铁撞击火花 + 多波次流矢齐射抛物线 + 清晰双色兵力条。
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 48, height: 38)
        let strength = CALayer(); strength.name = "strength"; strength.bounds = CGRect(x: 0, y: 0, width: 42, height: 4.8); strength.position = CGPoint(x: 24, y: -10)
        strength.cornerRadius = 2.4; strength.masksToBounds = true; strength.borderWidth = 0.85; strength.borderColor = UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 0.95).cgColor; strength.isHidden = true
        strength.addSublayer(CALayer()); strength.addSublayer(CALayer()); root.addSublayer(strength)

        let phase = Double.random(in: 0..<0.55)

        // 1. 双层朱墨鎏金冲击波环（60/120fps 弹性外扩）
        for rIdx in 0..<2 {
            let pulseRing = CAShapeLayer(); pulseRing.frame = root.bounds
            pulseRing.path = UIBezierPath(ovalIn: CGRect(x: 13, y: 10, width: 22, height: 18)).cgPath
            pulseRing.fillColor = nil
            pulseRing.strokeColor = (rIdx == 0 ? UIColor(red: 0.82, green: 0.22, blue: 0.14, alpha: 0.62) : UIColor(red: 0.94, green: 0.72, blue: 0.24, alpha: 0.52)).cgColor
            pulseRing.lineWidth = rIdx == 0 ? 1.5 : 1.1
            let prScale = CABasicAnimation(keyPath: "transform.scale"); prScale.fromValue = 0.52; prScale.toValue = 1.92
            let prFade = CAKeyframeAnimation(keyPath: "opacity"); prFade.values = [0.0, 0.76, 0.0]; prFade.keyTimes = [0, 0.22, 1]
            let prGroup = CAAnimationGroup(); prGroup.animations = [prScale, prFade]; prGroup.duration = 1.06; prGroup.repeatCount = .infinity
            prGroup.timeOffset = phase + Double(rIdx) * 0.53
            prGroup.timingFunction = CAMediaTimingFunction(name: .easeOut)
            pulseRing.add(Self.calm(prGroup), forKey: "clashRing-\(rIdx)")
            root.addSublayer(pulseRing)
        }

        // 2. 双弧双层凌厉交锋刀光（外层赤金刀气 + 内层象牙寒芒，120Hz 真丝滑）
        for side in 0..<2 {
            let sp = UIBezierPath()
            if side == 0 {
                sp.move(to: CGPoint(x: 10, y: 29))
                sp.addQuadCurve(to: CGPoint(x: 38, y: 7), controlPoint: CGPoint(x: 17, y: 10))
            } else {
                sp.move(to: CGPoint(x: 38, y: 29))
                sp.addQuadCurve(to: CGPoint(x: 10, y: 7), controlPoint: CGPoint(x: 31, y: 10))
            }
            for layerIdx in 0..<2 {
                let slash = CAShapeLayer(); slash.frame = root.bounds
                slash.path = sp.cgPath; slash.fillColor = nil
                if layerIdx == 0 {
                    slash.strokeColor = (side == 0 ? UIColor(red: 0.86, green: 0.24, blue: 0.14, alpha: 0.78) : UIColor(red: 0.94, green: 0.58, blue: 0.16, alpha: 0.78)).cgColor
                    slash.lineWidth = 4.2
                } else {
                    slash.strokeColor = (side == 0 ? UIColor(red: 1.0, green: 0.97, blue: 0.86, alpha: 0.98) : UIColor(red: 0.99, green: 0.84, blue: 0.36, alpha: 0.96)).cgColor
                    slash.lineWidth = 2.1
                }
                slash.lineCap = .round
                let sEnd = CAKeyframeAnimation(keyPath: "strokeEnd"); sEnd.values = [0.0, 1.0, 1.0]; sEnd.keyTimes = [0, 0.34, 1]
                let sStart = CAKeyframeAnimation(keyPath: "strokeStart"); sStart.values = [0.0, 0.14, 1.0]; sStart.keyTimes = [0, 0.24, 0.74]
                let sOp = CAKeyframeAnimation(keyPath: "opacity"); sOp.values = [0.0, 1.0, 0.92, 0.0]; sOp.keyTimes = [0, 0.12, 0.42, 0.78]
                let sg = CAAnimationGroup(); sg.animations = [sEnd, sStart, sOp]; sg.duration = 0.74; sg.repeatCount = .infinity
                sg.timeOffset = phase + Double(side) * 0.37
                sg.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 0.86, 0.28, 1)
                slash.add(Self.calm(sg), forKey: "slash-\(side)-\(layerIdx)")
                root.addSublayer(slash)
            }
        }

        // 3. 刀锋相接处金红十字星芒瞬闪
        let sparkStar = CAShapeLayer(); sparkStar.frame = CGRect(x: 16, y: 11, width: 16, height: 16)
        let gp = UIBezierPath()
        gp.move(to: CGPoint(x: 8, y: 0.5)); gp.addLine(to: CGPoint(x: 9.7, y: 6.3)); gp.addLine(to: CGPoint(x: 15.5, y: 8))
        gp.addLine(to: CGPoint(x: 9.7, y: 9.7)); gp.addLine(to: CGPoint(x: 8, y: 15.5)); gp.addLine(to: CGPoint(x: 6.3, y: 9.7))
        gp.addLine(to: CGPoint(x: 0.5, y: 8)); gp.addLine(to: CGPoint(x: 6.3, y: 6.3)); gp.close()
        sparkStar.path = gp.cgPath
        sparkStar.fillColor = UIColor(red: 1.0, green: 0.93, blue: 0.58, alpha: 0.98).cgColor
        sparkStar.strokeColor = UIColor(red: 0.86, green: 0.24, blue: 0.12, alpha: 0.88).cgColor
        sparkStar.lineWidth = 0.75
        let stScale = CAKeyframeAnimation(keyPath: "transform.scale"); stScale.values = [0.25, 1.32, 0.45, 0.25]; stScale.keyTimes = [0, 0.22, 0.58, 1]
        let stRot = CABasicAnimation(keyPath: "transform.rotation.z"); stRot.fromValue = 0; stRot.toValue = Double.pi * 0.5
        let stOp = CAKeyframeAnimation(keyPath: "opacity"); stOp.values = [0.0, 1.0, 0.0, 0.0]; stOp.keyTimes = [0, 0.18, 0.58, 1]
        let stg = CAAnimationGroup(); stg.animations = [stScale, stRot, stOp]; stg.duration = 0.37; stg.repeatCount = .infinity
        stg.timeOffset = phase + 0.10
        sparkStar.add(Self.calm(stg), forKey: "clashSpark")
        root.addSublayer(sparkStar)

        // 4. 双侧各 2 波次流矢齐射抛物线（错落有致，呈现两军箭雨攒射态势）
        for side in 0..<2 {
            for volleyIdx in 0..<2 {
                let dy = CGFloat(volleyIdx) * 3.2
                let arc = CAShapeLayer(); arc.frame = root.bounds
                let p = UIBezierPath()
                if side == 0 {
                    p.move(to: CGPoint(x: 3, y: 26 - dy * 0.5))
                    p.addQuadCurve(to: CGPoint(x: 45, y: 18 + dy * 0.5), controlPoint: CGPoint(x: 24, y: 1 + dy))
                } else {
                    p.move(to: CGPoint(x: 45, y: 26 - dy * 0.5))
                    p.addQuadCurve(to: CGPoint(x: 3, y: 18 + dy * 0.5), controlPoint: CGPoint(x: 24, y: 3 + dy))
                }
                arc.path = p.cgPath; arc.fillColor = nil
                arc.strokeColor = (side == 0 ? UIColor(red: 0.99, green: 0.86, blue: 0.44, alpha: 0.90) : UIColor(red: 0.95, green: 0.54, blue: 0.22, alpha: 0.86)).cgColor
                arc.lineWidth = volleyIdx == 0 ? 1.45 : 1.15; arc.lineCap = .round
                let head = CAKeyframeAnimation(keyPath: "strokeEnd"); head.values = [0.0, 1.0, 1.0]; head.keyTimes = [0, 0.42, 1]
                let tail = CAKeyframeAnimation(keyPath: "strokeStart"); tail.values = [0.0, 0.24, 1.0]; tail.keyTimes = [0, 0.34, 1]
                let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0.0, 0.94, 0.0]; fade.keyTimes = [0, 0.28, 1]
                let ag = CAAnimationGroup(); ag.animations = [head, tail, fade]; ag.duration = 0.90; ag.repeatCount = .infinity
                ag.timeOffset = phase + Double(side) * 0.45 + Double(volleyIdx) * 0.14
                arc.add(Self.calm(ag), forKey: "volley-\(side)-\(volleyIdx)")
                root.addSublayer(arc)
            }
        }

        if Self.particles && !Energy.hot && battleLayers.count < 8 {
            let smoke = battleSmoke(); smoke.emitterPosition = CGPoint(x: 24, y: 19); root.insertSublayer(smoke, at: 0)
        }
        _ = culture
        return root
    }

    private func siegeLayer(color: UIColor) -> (CALayer, CAShapeLayer) {
        // 60/120fps 清雅围城城圈：宣纸底细墨环 + 顺时针国色合拢进度弧 + 旋转攻城外环 + 跃动朱金火舌与暖金余烬。
        let side: CGFloat = 34, mid = side / 2, radius: CGFloat = 11.4
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: side, height: side)
        let circle = UIBezierPath(arcCenter: CGPoint(x: mid, y: mid), radius: radius, startAngle: -.pi / 2, endAngle: .pi * 1.5, clockwise: true)

        let back = CAShapeLayer(); back.frame = root.bounds; back.path = circle.cgPath
        back.fillColor = UIColor(red: 0.97, green: 0.94, blue: 0.87, alpha: 0.56).cgColor
        back.strokeColor = UIColor(red: 0.16, green: 0.12, blue: 0.09, alpha: 0.34).cgColor; back.lineWidth = 1.7

        let ring = CAShapeLayer(); ring.frame = root.bounds; ring.path = circle.cgPath
        ring.fillColor = nil; ring.strokeColor = color.cgColor; ring.lineWidth = 2.8; ring.lineCap = .round; ring.strokeEnd = 0

        let outer = CAShapeLayer(); outer.frame = root.bounds
        outer.path = UIBezierPath(ovalIn: CGRect(x: mid - 14.5, y: mid - 14.5, width: 29, height: 29)).cgPath
        outer.fillColor = nil; outer.strokeColor = color.withAlphaComponent(0.55).cgColor
        outer.lineWidth = 1.0; outer.lineDashPattern = [3, 4]
        let rot = CABasicAnimation(keyPath: "transform.rotation.z"); rot.fromValue = 0; rot.toValue = Double.pi * 2; rot.duration = 7.0; rot.repeatCount = .infinity
        outer.add(Self.calm(rot), forKey: "rot")

        let pulse = CAShapeLayer(); pulse.frame = root.bounds; pulse.path = circle.cgPath
        pulse.fillColor = nil; pulse.strokeColor = color.withAlphaComponent(0.52).cgColor; pulse.lineWidth = 1.1
        let pScale = CABasicAnimation(keyPath: "transform.scale"); pScale.fromValue = 1.0; pScale.toValue = 1.56
        let pFade = CABasicAnimation(keyPath: "opacity"); pFade.fromValue = 0.58; pFade.toValue = 0.0
        let pGroup = CAAnimationGroup(); pGroup.animations = [pScale, pFade]; pGroup.duration = 1.65; pGroup.repeatCount = .infinity
        pGroup.timingFunction = CAMediaTimingFunction(name: .easeOut)
        pulse.add(Self.calm(pGroup), forKey: "pulse")

        // 城心跃动火舌与国色微呼吸点
        let core = CAShapeLayer(); core.frame = root.bounds
        core.path = UIBezierPath(ovalIn: CGRect(x: mid - 2.8, y: mid - 2.8, width: 5.6, height: 5.6)).cgPath
        core.fillColor = color.withAlphaComponent(0.90).cgColor
        let cPulse = CAKeyframeAnimation(keyPath: "transform.scale"); cPulse.values = [0.80, 1.26, 0.80]; cPulse.duration = 1.1; cPulse.repeatCount = .infinity
        cPulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        core.add(Self.calm(cPulse), forKey: "core")

        root.addSublayer(pulse); root.addSublayer(outer); root.addSublayer(back); root.addSublayer(ring); root.addSublayer(core)

        if Self.particles && !Energy.hot && siegeLayers.count < 10 {
            let e = CAEmitterLayer(); e.emitterShape = .point; e.emitterPosition = CGPoint(x: mid, y: mid - 2)
            e.emitterCells = [
                cell(Self.puff, color: UIColor(red: 0.28, green: 0.24, blue: 0.20, alpha: 0.18), rate: 2.0, life: 1.4, velocity: 8, range: .pi / 5, scale: 0.19, scaleSpeed: 0.10, alphaSpeed: -0.11, angle: -.pi / 2),
                cell(Self.spark, color: UIColor(red: 0.99, green: 0.60, blue: 0.18, alpha: 0.96), rate: 3.4, life: 0.68, velocity: 15, range: .pi / 3, scale: 0.36, scaleSpeed: -0.35, alphaSpeed: -1.3, angle: -.pi / 2)
            ]
            e.renderMode = .unordered
            root.insertSublayer(e, at: 0)
        }
        return (root, ring)
    }

    /// 近海港口封锁警戒圈：旋转朱墨锁链虚线环 + 逆向十字锚标刻度 + 外扩封锁警示脉冲。
    private func blockadeLayer(color: UIColor) -> CALayer {
        let side: CGFloat = 44, mid = side / 2
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: side, height: side)
        let crimson = UIColor(red: 0.82, green: 0.18, blue: 0.14, alpha: 0.92)

        let pulse = CAShapeLayer(); pulse.frame = root.bounds
        pulse.path = UIBezierPath(ovalIn: CGRect(x: mid - 14, y: mid - 14, width: 28, height: 28)).cgPath
        pulse.fillColor = nil; pulse.strokeColor = crimson.withAlphaComponent(0.55).cgColor; pulse.lineWidth = 1.2
        let pScale = CABasicAnimation(keyPath: "transform.scale"); pScale.fromValue = 0.82; pScale.toValue = 1.45
        let pFade = CABasicAnimation(keyPath: "opacity"); pFade.fromValue = 0.72; pFade.toValue = 0.0
        let pg = CAAnimationGroup(); pg.animations = [pScale, pFade]; pg.duration = 1.5; pg.repeatCount = .infinity
        pulse.add(Self.calm(pg), forKey: "blkPulse")
        root.addSublayer(pulse)

        let chain = CAShapeLayer(); chain.frame = root.bounds
        chain.path = UIBezierPath(ovalIn: CGRect(x: mid - 16, y: mid - 16, width: 32, height: 32)).cgPath
        chain.fillColor = nil; chain.strokeColor = crimson.cgColor
        chain.lineWidth = 1.9; chain.lineDashPattern = [5, 3.5]; chain.lineCap = .round
        let spin = CABasicAnimation(keyPath: "transform.rotation.z"); spin.fromValue = 0; spin.toValue = Double.pi * 2; spin.duration = 5.4; spin.repeatCount = .infinity
        chain.add(Self.calm(spin), forKey: "blkSpin")
        root.addSublayer(chain)

        let inner = CAShapeLayer(); inner.frame = root.bounds
        let ip = UIBezierPath(ovalIn: CGRect(x: mid - 11.5, y: mid - 11.5, width: 23, height: 23))
        inner.path = ip.cgPath; inner.fillColor = nil
        inner.strokeColor = color.withAlphaComponent(0.78).cgColor
        inner.lineWidth = 1.2; inner.lineDashPattern = [2.5, 4.5]
        let rev = CABasicAnimation(keyPath: "transform.rotation.z"); rev.fromValue = Double.pi * 2; rev.toValue = 0; rev.duration = 4.2; rev.repeatCount = .infinity
        inner.add(Self.calm(rev), forKey: "blkRev")
        root.addSublayer(inner)
        return root
    }

    /// 两栖抢滩登陆滩头阵地与近海舰炮岸轰弹道弧。
    private func landingLayer(color: UIColor, hasFire: Bool) -> (CALayer, CAShapeLayer?) {
        let side: CGFloat = 40, mid = side / 2
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: side, height: side)
        let gold = UIColor(red: 0.96, green: 0.78, blue: 0.28, alpha: 0.95)
        let surf = UIColor(red: 0.94, green: 0.99, blue: 1.0, alpha: 0.90)

        for i in 0..<2 {
            let wave = CAShapeLayer(); wave.frame = root.bounds
            let r = CGFloat(9 + i * 5)
            wave.path = UIBezierPath(ovalIn: CGRect(x: mid - r, y: mid - r * 0.72, width: r * 2, height: r * 1.44)).cgPath
            wave.fillColor = nil
            wave.strokeColor = (i == 0 ? surf : gold).cgColor
            wave.lineWidth = i == 0 ? 1.8 : 1.3; wave.lineDashPattern = [6, 3]
            let s = CABasicAnimation(keyPath: "transform.scale"); s.fromValue = 0.55; s.toValue = 1.55
            let o = CAKeyframeAnimation(keyPath: "opacity"); o.values = [0.0, 0.92, 0.0]; o.keyTimes = [0, 0.28, 1]
            let g = CAAnimationGroup(); g.animations = [s, o]; g.duration = 1.20; g.repeatCount = .infinity
            g.timeOffset = Double(i) * 0.60
            wave.add(Self.calm(g), forKey: "lndWave-\(i)")
            root.addSublayer(wave)
        }

        var fireArc: CAShapeLayer? = nil
        if hasFire {
            let arc = CAShapeLayer()
            arc.fillColor = nil
            arc.strokeColor = UIColor(red: 1.0, green: 0.76, blue: 0.24, alpha: 0.95).cgColor
            arc.lineWidth = 2.1; arc.lineCap = .round
            let head = CAKeyframeAnimation(keyPath: "strokeEnd"); head.values = [0.0, 1.0, 1.0]; head.keyTimes = [0, 0.48, 1]
            let tail = CAKeyframeAnimation(keyPath: "strokeStart"); tail.values = [0.0, 0.18, 1.0]; tail.keyTimes = [0, 0.34, 1]
            let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0.0, 1.0, 0.0]; fade.keyTimes = [0, 0.28, 1]
            let ag = CAAnimationGroup(); ag.animations = [head, tail, fade]; ag.duration = 0.96; ag.repeatCount = .infinity
            arc.add(Self.calm(ag), forKey: "navalSupportFire")
            fireArc = arc
        }
        return (root, fireArc)
    }

    private func flashLayer(color: UIColor, culture: String) -> CALayer {
        // 60/120fps 真丝滑矢量国色飘扬战旗：旗杆弹性插落 + 连续贝塞尔路径丝绸招展（真正 60/120fps 柔波）+ 双层水墨与国色涟漪 + 鎏金星芒。
        _ = culture
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 120, height: 120)
        let ink = UIColor(red: 0.16, green: 0.12, blue: 0.09, alpha: 1)
        let gold = UIColor(red: 0.94, green: 0.76, blue: 0.28, alpha: 1)

        let ripple = CAShapeLayer(); ripple.frame = root.bounds
        ripple.path = UIBezierPath(ovalIn: CGRect(x: 48, y: 57, width: 24, height: 10)).cgPath
        ripple.fillColor = nil; ripple.strokeColor = ink.withAlphaComponent(0.55).cgColor; ripple.lineWidth = 1.2; ripple.opacity = 0
        let grow = CABasicAnimation(keyPath: "transform.scale"); grow.fromValue = 0.4; grow.toValue = 2.35
        let fadeRing = CAKeyframeAnimation(keyPath: "opacity"); fadeRing.values = [0, 0.88, 0]; fadeRing.keyTimes = [0, 0.2, 1]
        let rippleGroup = CAAnimationGroup(); rippleGroup.animations = [grow, fadeRing]; rippleGroup.duration = 1.15
        rippleGroup.beginTime = CACurrentMediaTime() + 0.18; rippleGroup.timingFunction = CAMediaTimingFunction(controlPoints: 0.15, 0.6, 0.3, 1)
        rippleGroup.fillMode = .both; rippleGroup.isRemovedOnCompletion = false
        ripple.add(Self.calm(rippleGroup), forKey: "ripple"); root.addSublayer(ripple)

        let echo = CAShapeLayer(); echo.frame = root.bounds
        echo.path = UIBezierPath(ovalIn: CGRect(x: 46, y: 56, width: 28, height: 12)).cgPath
        echo.fillColor = nil; echo.strokeColor = color.withAlphaComponent(0.76).cgColor; echo.lineWidth = 1.5; echo.opacity = 0
        let echoGrow = CABasicAnimation(keyPath: "transform.scale"); echoGrow.fromValue = 0.5; echoGrow.toValue = 2.8
        let echoFade = CAKeyframeAnimation(keyPath: "opacity"); echoFade.values = [0, 0.86, 0]; echoFade.keyTimes = [0, 0.22, 1]
        let echoGroup = CAAnimationGroup(); echoGroup.animations = [echoGrow, echoFade]; echoGroup.duration = 1.25
        echoGroup.beginTime = CACurrentMediaTime() + 0.28; echoGroup.timingFunction = CAMediaTimingFunction(controlPoints: 0.15, 0.6, 0.3, 1)
        echoGroup.fillMode = .both; echoGroup.isRemovedOnCompletion = false
        echo.add(Self.calm(echoGroup), forKey: "echo"); root.addSublayer(echo)

        // 矢量国色燕尾旗组合层（旗杆不动，旗面 60/120fps 连续贝塞尔柔波变形）
        let flagHost = CALayer()
        flagHost.bounds = CGRect(x: 0, y: 0, width: 42, height: 42)
        flagHost.anchorPoint = CGPoint(x: 0.24, y: 0.92)
        flagHost.position = CGPoint(x: 60, y: 63)

        let pole = CAShapeLayer(); pole.frame = flagHost.bounds
        let pp = UIBezierPath(); pp.move(to: CGPoint(x: 10, y: 39)); pp.addLine(to: CGPoint(x: 10, y: 7))
        pole.path = pp.cgPath; pole.strokeColor = ink.cgColor; pole.lineWidth = 1.9; pole.lineCap = .round
        flagHost.addSublayer(pole)

        let finial = CAShapeLayer(); finial.frame = flagHost.bounds
        let fp = UIBezierPath()
        fp.move(to: CGPoint(x: 10, y: 2.5)); fp.addLine(to: CGPoint(x: 12.2, y: 7)); fp.addLine(to: CGPoint(x: 10, y: 9.2)); fp.addLine(to: CGPoint(x: 7.8, y: 7)); fp.close()
        finial.path = fp.cgPath; finial.fillColor = gold.cgColor; finial.strokeColor = ink.withAlphaComponent(0.6).cgColor; finial.lineWidth = 0.6
        flagHost.addSublayer(finial)

        func clothPath(waveA: CGFloat, waveB: CGFloat, tipY: CGFloat) -> CGPath {
            let p = UIBezierPath()
            p.move(to: CGPoint(x: 11, y: 9))
            p.addCurve(to: CGPoint(x: 35, y: 10 + tipY),
                       controlPoint1: CGPoint(x: 18, y: 6 + waveA),
                       controlPoint2: CGPoint(x: 27, y: 13 + waveB))
            p.addLine(to: CGPoint(x: 30, y: 16.5 + tipY * 0.7))
            p.addLine(to: CGPoint(x: 35.5, y: 22.5 + tipY))
            p.addCurve(to: CGPoint(x: 11, y: 23),
                       controlPoint1: CGPoint(x: 27, y: 25.5 + waveB),
                       controlPoint2: CGPoint(x: 18, y: 19 + waveA))
            p.close()
            return p.cgPath
        }

        let cloth = CAShapeLayer(); cloth.frame = flagHost.bounds
        let p0 = clothPath(waveA: -2.4, waveB: 2.6, tipY: -1.4)
        let p1 = clothPath(waveA: 2.4, waveB: -2.2, tipY: 1.6)
        let p2 = clothPath(waveA: -1.8, waveB: -1.4, tipY: -0.6)
        cloth.path = p0
        cloth.fillColor = color.cgColor
        cloth.strokeColor = ink.withAlphaComponent(0.68).cgColor
        cloth.lineWidth = 1.05; cloth.lineJoin = .round

        let flutter = CAKeyframeAnimation(keyPath: "path")
        flutter.values = [p0, p1, p2, p0]
        flutter.keyTimes = [0, 0.36, 0.70, 1]
        flutter.duration = 0.72; flutter.repeatCount = .infinity
        flutter.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        cloth.add(Self.calm(flutter), forKey: "flutter")
        flagHost.addSublayer(cloth)

        let drop = CABasicAnimation(keyPath: "transform.translation.y"); drop.fromValue = -16; drop.toValue = 0; drop.duration = 0.22
        drop.timingFunction = CAMediaTimingFunction(name: .easeIn)
        let squash = CAKeyframeAnimation(keyPath: "transform.scale.y"); squash.values = [1.0, 0.86, 1.05, 1.0]; squash.keyTimes = [0, 0.4, 0.76, 1]; squash.beginTime = 0.22; squash.duration = 0.22
        let fadeOut = CAKeyframeAnimation(keyPath: "opacity"); fadeOut.values = [0, 1, 1, 0]; fadeOut.keyTimes = [0, 0.08, 0.78, 1]; fadeOut.duration = 2.15
        let plant = CAAnimationGroup(); plant.animations = [drop, squash, fadeOut]; plant.duration = 2.15
        plant.fillMode = .forwards; plant.isRemovedOnCompletion = false
        flagHost.add(Self.calm(plant), forKey: "plant")
        root.addSublayer(flagHost)

        // 旗竿插落瞬间的鎏金星芒微闪
        let glint = CAShapeLayer(); glint.frame = CGRect(x: 52, y: 26, width: 16, height: 16)
        let gp = UIBezierPath()
        gp.move(to: CGPoint(x: 8, y: 1)); gp.addLine(to: CGPoint(x: 9.8, y: 6.2)); gp.addLine(to: CGPoint(x: 15, y: 8))
        gp.addLine(to: CGPoint(x: 9.8, y: 9.8)); gp.addLine(to: CGPoint(x: 8, y: 15)); gp.addLine(to: CGPoint(x: 6.2, y: 9.8))
        gp.addLine(to: CGPoint(x: 1, y: 8)); gp.addLine(to: CGPoint(x: 6.2, y: 6.2)); gp.close()
        glint.path = gp.cgPath
        glint.fillColor = UIColor(red: 0.98, green: 0.80, blue: 0.30, alpha: 0.96).cgColor
        glint.opacity = 0
        let gScale = CAKeyframeAnimation(keyPath: "transform.scale"); gScale.values = [0.2, 1.25, 0.4]; gScale.keyTimes = [0, 0.35, 1]
        let gFade = CAKeyframeAnimation(keyPath: "opacity"); gFade.values = [0, 0.95, 0]; gFade.keyTimes = [0, 0.3, 1]
        let gg = CAAnimationGroup(); gg.animations = [gScale, gFade]; gg.duration = 0.65; gg.beginTime = CACurrentMediaTime() + 0.22
        gg.fillMode = .both; gg.isRemovedOnCompletion = false
        glint.add(Self.calm(gg), forKey: "glint"); root.addSublayer(glint)
        return root
    }

    /// 山河回放专用图志动效：水墨晕染圆斑 + 鎏金国色双圈涟漪 + 舆图菱星，替代插旗，高速回放零闪烁更雅致。
    private func atlasRippleLayer(color: UIColor) -> CALayer {
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 96, height: 96)
        let gold = UIColor(red: 0.84, green: 0.66, blue: 0.28, alpha: 1)

        // 1. 柔润国色水彩晕斑（轻洇即干）
        let wash = CAShapeLayer(); wash.frame = root.bounds
        wash.path = UIBezierPath(ovalIn: CGRect(x: 34, y: 34, width: 28, height: 28)).cgPath
        wash.fillColor = color.withAlphaComponent(0.26).cgColor; wash.opacity = 0
        let wScale = CABasicAnimation(keyPath: "transform.scale"); wScale.fromValue = 0.35; wScale.toValue = 1.65
        let wFade = CAKeyframeAnimation(keyPath: "opacity"); wFade.values = [0, 0.88, 0]; wFade.keyTimes = [0, 0.24, 1]
        let wg = CAAnimationGroup(); wg.animations = [wScale, wFade]; wg.duration = 0.92
        wg.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 0.72, 0.28, 1)
        wg.fillMode = .forwards; wg.isRemovedOnCompletion = false
        wash.add(Self.calm(wg), forKey: "atlasWash"); root.addSublayer(wash)

        // 2. 外圈国色墨环扩散
        let ring = CAShapeLayer(); ring.frame = root.bounds
        ring.path = UIBezierPath(ovalIn: CGRect(x: 36, y: 36, width: 24, height: 24)).cgPath
        ring.fillColor = nil; ring.strokeColor = color.withAlphaComponent(0.85).cgColor; ring.lineWidth = 1.8; ring.opacity = 0
        let rScale = CABasicAnimation(keyPath: "transform.scale"); rScale.fromValue = 0.48; rScale.toValue = 2.25
        let rThin = CABasicAnimation(keyPath: "lineWidth"); rThin.fromValue = 2.0; rThin.toValue = 0.35
        let rFade = CAKeyframeAnimation(keyPath: "opacity"); rFade.values = [0, 0.92, 0]; rFade.keyTimes = [0, 0.18, 1]
        let rg = CAAnimationGroup(); rg.animations = [rScale, rThin, rFade]; rg.duration = 1.05
        rg.timingFunction = CAMediaTimingFunction(controlPoints: 0.14, 0.66, 0.3, 1)
        rg.fillMode = .forwards; rg.isRemovedOnCompletion = false
        ring.add(Self.calm(rg), forKey: "atlasRing"); root.addSublayer(ring)

        // 3. 内圈鎏金细环余波
        let inner = CAShapeLayer(); inner.frame = root.bounds
        inner.path = UIBezierPath(ovalIn: CGRect(x: 40, y: 40, width: 16, height: 16)).cgPath
        inner.fillColor = nil; inner.strokeColor = gold.withAlphaComponent(0.82).cgColor; inner.lineWidth = 1.1; inner.opacity = 0
        let iScale = CABasicAnimation(keyPath: "transform.scale"); iScale.fromValue = 0.55; iScale.toValue = 1.95
        let iFade = CAKeyframeAnimation(keyPath: "opacity"); iFade.values = [0, 0.85, 0]; iFade.keyTimes = [0, 0.25, 1]
        let ig = CAAnimationGroup(); ig.animations = [iScale, iFade]; ig.duration = 0.86
        ig.beginTime = CACurrentMediaTime() + 0.08
        ig.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 0.7, 0.3, 1)
        ig.fillMode = .both; ig.isRemovedOnCompletion = false
        inner.add(Self.calm(ig), forKey: "atlasInner"); root.addSublayer(inner)

        // 4. 州心微光四角舆图星徽
        let star = CAShapeLayer(); star.frame = CGRect(x: 41, y: 41, width: 14, height: 14)
        let sp = UIBezierPath()
        sp.move(to: CGPoint(x: 7, y: 1.5)); sp.addLine(to: CGPoint(x: 8.6, y: 5.4)); sp.addLine(to: CGPoint(x: 12.5, y: 7))
        sp.addLine(to: CGPoint(x: 8.6, y: 8.6)); sp.addLine(to: CGPoint(x: 7, y: 12.5)); sp.addLine(to: CGPoint(x: 5.4, y: 8.6))
        sp.addLine(to: CGPoint(x: 1.5, y: 7)); sp.addLine(to: CGPoint(x: 5.4, y: 5.4)); sp.close()
        star.path = sp.cgPath; star.fillColor = gold.withAlphaComponent(0.95).cgColor; star.opacity = 0
        let sScale = CAKeyframeAnimation(keyPath: "transform.scale"); sScale.values = [0.3, 1.15, 0.65]; sScale.keyTimes = [0, 0.35, 1]
        let sFade = CAKeyframeAnimation(keyPath: "opacity"); sFade.values = [0, 0.95, 0]; sFade.keyTimes = [0, 0.28, 1]
        let sg = CAAnimationGroup(); sg.animations = [sScale, sFade]; sg.duration = 0.68
        sg.fillMode = .forwards; sg.isRemovedOnCompletion = false
        star.add(Self.calm(sg), forKey: "atlasStar"); root.addSublayer(star)
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

    /// 和约：60/120fps 青碧墨涟漪 + 极简宣纸白羽翔升（双翼以贝塞尔关键帧顺滑振翅飞渡，彻底融于纸面）。
    private func peaceLayer() -> CALayer {
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 88, height: 88)
        let jade = UIColor(red: 0.20, green: 0.52, blue: 0.42, alpha: 1)
        root.addSublayer(inkRing(jade))

        func wingPath(lift: CGFloat) -> CGPath {
            let p = UIBezierPath()
            p.move(to: CGPoint(x: 18, y: 16))
            p.addQuadCurve(to: CGPoint(x: 3, y: 12 - lift), controlPoint: CGPoint(x: 10, y: 8 - lift))
            p.addQuadCurve(to: CGPoint(x: 18, y: 20), controlPoint: CGPoint(x: 11, y: 18))
            p.addQuadCurve(to: CGPoint(x: 33, y: 12 - lift), controlPoint: CGPoint(x: 25, y: 18))
            p.addQuadCurve(to: CGPoint(x: 18, y: 16), controlPoint: CGPoint(x: 26, y: 8 - lift))
            p.close()
            return p.cgPath
        }

        let bird = CAShapeLayer()
        bird.bounds = CGRect(x: 0, y: 0, width: 36, height: 32)
        bird.position = CGPoint(x: 44, y: 44)
        let wUp = wingPath(lift: 5.5), wMid = wingPath(lift: 0.5), wDown = wingPath(lift: -4.2)
        bird.path = wUp
        bird.fillColor = UIColor(red: 0.99, green: 0.98, blue: 0.94, alpha: 0.96).cgColor
        bird.strokeColor = jade.withAlphaComponent(0.75).cgColor
        bird.lineWidth = 1.15; bird.lineJoin = .round; bird.opacity = 0

        let flap = CAKeyframeAnimation(keyPath: "path")
        flap.values = [wUp, wMid, wDown, wMid, wUp]
        flap.duration = 0.48; flap.repeatCount = .infinity
        flap.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        bird.add(Self.calm(flap), forKey: "flap")

        let rise = CABasicAnimation(keyPath: "transform.translation.y"); rise.fromValue = 6; rise.toValue = -30; rise.duration = 1.9
        rise.timingFunction = CAMediaTimingFunction(controlPoints: 0.22, 0.72, 0.3, 1)
        let drift = CABasicAnimation(keyPath: "transform.translation.x"); drift.fromValue = 6; drift.toValue = -14; drift.duration = 1.9
        let opacity = CAKeyframeAnimation(keyPath: "opacity"); opacity.values = [0, 1, 1, 0]; opacity.keyTimes = [0, 0.16, 0.74, 1]; opacity.duration = 1.9
        let group = CAAnimationGroup(); group.animations = [rise, drift, opacity]; group.duration = 1.9; group.fillMode = .both; group.isRemovedOnCompletion = false
        bird.add(Self.calm(group), forKey: "peace"); root.addSublayer(bird)
        return root
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
            // 阵亡/沉没：陆军被焦墨吞没，舰队则伴随深海墨浪与白沫水花沉入海底。
            let isNaval = b.unit == "Fleet"
            let count = CGFloat(max(1, b.count)), grow = min(1.6, 1 + 0.2 * (count - 1))
            let ink = isNaval
                ? UIColor(red: 0.10 + 0.18 * b.r, green: 0.22 + 0.18 * b.g, blue: 0.32 + 0.18 * b.b, alpha: 1)
                : UIColor(red: 0.14 + 0.22 * b.r, green: 0.11 + 0.22 * b.g, blue: 0.09 + 0.22 * b.b, alpha: 1)
            var seed = UInt64(truncatingIfNeeded: b.id.hashValue)
            func rnd() -> CGFloat { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return CGFloat((seed >> 33) % 10_000) / 10_000 }
            let begin = CACurrentMediaTime() + b.delay
            func play(_ l: CALayer, _ animations: [CAAnimation], duration: Double, ease: CAMediaTimingFunctionName = .easeOut) {
                let g = CAAnimationGroup(); g.animations = animations; g.duration = duration; g.beginTime = begin
                g.timingFunction = CAMediaTimingFunction(name: ease); g.fillMode = .forwards; g.isRemovedOnCompletion = false
                l.add(g, forKey: "fall")
            }
            // 墨团：内外双层不规则墨晕叠成一块，洇开后慢慢干去（移除 CAShapeLayer 离屏 shadowRadius，零 GPU 阴影开销）。
            let halo = CAShapeLayer(); halo.frame = root.bounds
            let blot = CAShapeLayer(); blot.frame = root.bounds
            let path = UIBezierPath()
            let outerPath = UIBezierPath()
            for k in 0..<3 {
                let w = (13 + 7 * rnd()) * grow, h = (9 + 4 * rnd()) * grow
                let cx = 60 + (rnd() - 0.5) * 10 * grow, cy = 62 + (rnd() - 0.5) * 6 * grow
                path.append(UIBezierPath(ovalIn: CGRect(x: cx - w / 2, y: cy - h / 2, width: w, height: h)))
                outerPath.append(UIBezierPath(ovalIn: CGRect(x: cx - w * 0.68, y: cy - h * 0.68, width: w * 1.36, height: h * 1.36)))
                if k == 0 { path.append(UIBezierPath(ovalIn: CGRect(x: cx - w * 0.15, y: cy - h * 0.2, width: w * 0.3, height: h * 0.25))) }
            }
            halo.path = outerPath.cgPath; halo.fillColor = ink.withAlphaComponent(0.22).cgColor; halo.opacity = 0
            blot.path = path.cgPath; blot.fillColor = ink.withAlphaComponent(0.56).cgColor; blot.opacity = 0
            let spread = CAKeyframeAnimation(keyPath: "transform.scale"); spread.values = [0.15, 1.0, 1.08]; spread.keyTimes = [0, 0.3, 1]
            let dry = CAKeyframeAnimation(keyPath: "opacity"); dry.values = [0, 0.95, 0.7, 0]; dry.keyTimes = [0, 0.12, 0.55, 1]
            play(halo, [spread, dry], duration: 2.35)
            play(blot, [spread, dry], duration: 2.3)
            root.addSublayer(halo)
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
            // 军团棋子 / 战舰棋子倾覆下沉：直接复用与地图完全同源的国色 UnitArt 雕漆棋子，丝滑倾倒褪去、零贴图割裂感。
            if let icon = Self.unitImage(b.unit, tint: color) {
                let side: CGFloat = rnd() < 0.5 ? -1 : 1
                let size = max(20, min(32, iconPoints * 1.15))
                let mark = CALayer(); mark.contents = icon; mark.contentsGravity = .resizeAspect
                mark.bounds = CGRect(x: 0, y: 0, width: size, height: size)
                mark.anchorPoint = CGPoint(x: 0.5, y: 0.85)
                mark.position = CGPoint(x: 60, y: 62 + size * 0.18)
                mark.opacity = 0
                if isNaval {
                    let pitch = CAKeyframeAnimation(keyPath: "transform.rotation.z")
                    pitch.values = [0, -0.22, -0.58, -0.74]; pitch.keyTimes = [0, 0.20, 0.65, 1]
                    let sink = CAKeyframeAnimation(keyPath: "transform.translation.y")
                    sink.values = [0, -2, 6, 14]; sink.keyTimes = [0, 0.16, 0.58, 1]
                    let shrink = CAKeyframeAnimation(keyPath: "transform.scale")
                    shrink.values = [1.0, 1.04, 0.86, 0.66]; shrink.keyTimes = [0, 0.18, 0.62, 1]
                    let fade = CAKeyframeAnimation(keyPath: "opacity")
                    fade.values = [1, 1, 0.68, 0]; fade.keyTimes = [0, 0.24, 0.64, 1]
                    play(mark, [pitch, sink, shrink, fade], duration: 1.50, ease: .easeIn)
                } else {
                    let snap = CAKeyframeAnimation(keyPath: "transform.rotation.z")
                    snap.values = [0, -side * 0.14, side * 0.34, side * 1.18, side * 1.32]; snap.keyTimes = [0, 0.14, 0.34, 0.72, 1]
                    let sink = CAKeyframeAnimation(keyPath: "transform.translation.y")
                    sink.values = [0, -3.0, 2, 9, 12]; sink.keyTimes = [0, 0.14, 0.36, 0.76, 1]
                    let fade = CAKeyframeAnimation(keyPath: "opacity")
                    fade.values = [1, 1, 0.82, 0.38, 0]; fade.keyTimes = [0, 0.26, 0.58, 0.82, 1]
                    play(mark, [snap, sink, fade], duration: 1.55, ease: .easeInEaseOut)
                }
                root.addSublayer(mark)
            }
            // 残烟与星火自倒旗处袅袅升腾
            if Self.particles && !Energy.hot && burstLayers.count < 8 {
                let e = CAEmitterLayer()
                e.emitterShape = .circle; e.emitterSize = CGSize(width: 10, height: 6)
                e.emitterPosition = CGPoint(x: 60, y: 58)
                e.beginTime = begin
                e.emitterCells = [
                    cell(Self.puff, color: isNaval ? UIColor(white: 0.95, alpha: 0.42) : UIColor(red: 0.24, green: 0.20, blue: 0.17, alpha: 0.32),
                         rate: 5, life: 1.2, velocity: 12, range: .pi / 3, scale: 0.26, scaleSpeed: 0.18, alphaSpeed: -0.24, spin: 0.4, angle: -.pi / 2),
                    cell(Self.spark, color: isNaval ? UIColor(red: 0.78, green: 0.92, blue: 1.0, alpha: 0.9) : UIColor(red: 0.98, green: 0.52, blue: 0.16, alpha: 0.95),
                         rate: 6, life: 0.7, velocity: 20, range: .pi * 0.8, scale: 0.45, scaleSpeed: -0.45, alphaSpeed: -1.1, angle: -.pi / 2, accel: 14)
                ]
                root.addSublayer(e)
                DispatchQueue.main.asyncAfter(deadline: .now() + b.delay + 0.55) { e.birthRate = 0 }
            }
        default:
            // 60/120fps 纯净水墨线描事件活态徽记（与纸墨舆图浑然一体，告别厚重贴图）
            let accent = Self.eventColor(b.kind, nation: color)
            root.addSublayer(inkRing(accent))
            root.addSublayer(calligraphicEventLayer(b.kind, accent: accent))
        }
        return root
    }

    /// 每类地图大事件的水墨晕环与笔触配色。
    private static func eventColor(_ kind: MapEffects.Burst.Kind, nation: UIColor) -> UIColor {
        switch kind {
        case .founded:   return nation
        case .shock:     return UIColor(red: 0.76, green: 0.18, blue: 0.12, alpha: 1)
        case .harvest:   return UIColor(red: 0.76, green: 0.56, blue: 0.16, alpha: 1)
        case .trade:     return UIColor(red: 0.74, green: 0.52, blue: 0.14, alpha: 1)
        case .talent:    return UIColor(red: 0.18, green: 0.48, blue: 0.38, alpha: 1)
        case .drought:   return UIColor(red: 0.80, green: 0.38, blue: 0.12, alpha: 1)
        case .snow:      return UIColor(red: 0.28, green: 0.54, blue: 0.78, alpha: 1)
        case .flood, .disaster: return UIColor(red: 0.22, green: 0.38, blue: 0.62, alpha: 1)
        case .plague:    return UIColor(red: 0.40, green: 0.48, blue: 0.20, alpha: 1)
        case .regime:    return UIColor(red: 0.72, green: 0.50, blue: 0.16, alpha: 1)
        case .coup:      return UIColor(red: 0.76, green: 0.18, blue: 0.12, alpha: 1)
        case .destroyed: return UIColor(white: 0.22, alpha: 1)
        }
    }

    /// 双层墨晕：主圈与错峰余波由事件中心 60/120fps 荡开并淡去（1.55 秒）。
    private func inkRing(_ color: UIColor) -> CALayer {
        let host = CALayer(); host.frame = CGRect(x: 0, y: 0, width: 120, height: 120)
        for (idx, delay) in [(0, 0.0), (1, 0.18)] {
            let ring = CAShapeLayer(); ring.frame = host.bounds
            ring.path = UIBezierPath(ovalIn: CGRect(x: 42, y: 42, width: 36, height: 36)).cgPath
            ring.fillColor = nil; ring.strokeColor = color.withAlphaComponent(idx == 0 ? 0.74 : 0.38).cgColor
            ring.lineWidth = idx == 0 ? 1.6 : 0.95; ring.opacity = 0
            let grow = CABasicAnimation(keyPath: "transform.scale"); grow.fromValue = 0.48; grow.toValue = idx == 0 ? 2.05 : 2.52
            let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 0.92, 0]; fade.keyTimes = [0, 0.24, 1]
            let g = CAAnimationGroup(); g.animations = [grow, fade]; g.duration = 1.55; g.beginTime = CACurrentMediaTime() + delay
            g.timingFunction = CAMediaTimingFunction(controlPoints: 0.18, 0.78, 0.3, 1); g.fillMode = .both; g.isRemovedOnCompletion = false
            ring.add(Self.calm(g), forKey: "ink"); host.addSublayer(ring)
        }
        return host
    }

    /// 60/120fps 水墨线描事件活态演出：淡宣微底＋手绘矢量意象，依事件语义丝滑飘升、劈斩、摇曳或流转（2.35 秒）。
    private func calligraphicEventLayer(_ kind: MapEffects.Burst.Kind, accent: UIColor) -> CALayer {
        let host = CALayer()
        host.bounds = CGRect(x: 0, y: 0, width: 42, height: 42)
        host.position = CGPoint(x: 60, y: 56)
        host.opacity = 0

        // 轻透宣纸晕底（非实心圆框，仅提亮线描辨识度）
        let wash = CAShapeLayer(); wash.frame = host.bounds
        wash.path = UIBezierPath(ovalIn: CGRect(x: 7, y: 7, width: 28, height: 28)).cgPath
        wash.fillColor = UIColor(red: 0.975, green: 0.952, blue: 0.900, alpha: 0.84).cgColor
        wash.strokeColor = accent.withAlphaComponent(0.45).cgColor
        wash.lineWidth = 1.0
        host.addSublayer(wash)

        let glyph = CAShapeLayer(); glyph.frame = host.bounds
        glyph.fillColor = nil; glyph.strokeColor = accent.cgColor
        glyph.lineWidth = 1.9; glyph.lineCap = .round; glyph.lineJoin = .round
        let p = UIBezierPath()
        switch kind {
        case .shock, .coup:
            // 双锋斜劈＋中心火花
            p.move(to: CGPoint(x: 13, y: 29)); p.addLine(to: CGPoint(x: 29, y: 13))
            p.move(to: CGPoint(x: 29, y: 29)); p.addLine(to: CGPoint(x: 13, y: 13))
            p.move(to: CGPoint(x: 11, y: 24)); p.addLine(to: CGPoint(x: 18, y: 31))
            p.move(to: CGPoint(x: 31, y: 24)); p.addLine(to: CGPoint(x: 24, y: 31))
        case .founded:
            // 舒展燕尾立国旗
            p.move(to: CGPoint(x: 15, y: 31)); p.addLine(to: CGPoint(x: 15, y: 11))
            p.addLine(to: CGPoint(x: 29, y: 14)); p.addLine(to: CGPoint(x: 25, y: 18)); p.addLine(to: CGPoint(x: 29, y: 22)); p.addLine(to: CGPoint(x: 15, y: 22))
        case .harvest:
            // 双枝金穗
            p.move(to: CGPoint(x: 21, y: 31)); p.addQuadCurve(to: CGPoint(x: 16, y: 12), controlPoint: CGPoint(x: 16, y: 22))
            p.move(to: CGPoint(x: 21, y: 31)); p.addQuadCurve(to: CGPoint(x: 26, y: 12), controlPoint: CGPoint(x: 26, y: 22))
            p.move(to: CGPoint(x: 14, y: 18)); p.addLine(to: CGPoint(x: 18, y: 16))
            p.move(to: CGPoint(x: 28, y: 18)); p.addLine(to: CGPoint(x: 24, y: 16))
        case .trade:
            // 方孔通宝钱
            p.append(UIBezierPath(ovalIn: CGRect(x: 12.5, y: 12.5, width: 17, height: 17)))
            p.append(UIBezierPath(rect: CGRect(x: 18.2, y: 18.2, width: 5.6, height: 5.6)))
        case .talent:
            // 四芒才星＋舒卷书轴
            p.move(to: CGPoint(x: 21, y: 10)); p.addLine(to: CGPoint(x: 23.2, y: 18.8)); p.addLine(to: CGPoint(x: 32, y: 21))
            p.addLine(to: CGPoint(x: 23.2, y: 23.2)); p.addLine(to: CGPoint(x: 21, y: 32)); p.addLine(to: CGPoint(x: 18.8, y: 23.2))
            p.addLine(to: CGPoint(x: 10, y: 21)); p.addLine(to: CGPoint(x: 18.8, y: 18.8)); p.close()
        case .drought:
            // 烈日炙芒
            p.append(UIBezierPath(ovalIn: CGRect(x: 16, y: 16, width: 10, height: 10)))
            for i in 0..<8 {
                let a = CGFloat(i) * .pi / 4
                p.move(to: CGPoint(x: 21 + cos(a) * 7.2, y: 21 + sin(a) * 7.2))
                p.addLine(to: CGPoint(x: 21 + cos(a) * 10.6, y: 21 + sin(a) * 10.6))
            }
        case .snow:
            // 六出霜晶
            for i in 0..<6 {
                let a = CGFloat(i) * .pi / 3
                p.move(to: CGPoint(x: 21, y: 21))
                p.addLine(to: CGPoint(x: 21 + cos(a) * 9.8, y: 21 + sin(a) * 9.8))
            }
        case .flood, .disaster:
            // 骤雨雷电
            p.move(to: CGPoint(x: 23, y: 11)); p.addLine(to: CGPoint(x: 16, y: 22)); p.addLine(to: CGPoint(x: 21.5, y: 22))
            p.addLine(to: CGPoint(x: 18.5, y: 31)); p.addLine(to: CGPoint(x: 26.5, y: 19.5)); p.addLine(to: CGPoint(x: 21.5, y: 19.5)); p.close()
        case .plague:
            // 瘴雾双旋
            p.append(UIBezierPath(arcCenter: CGPoint(x: 21, y: 21), radius: 7.5, startAngle: 0.2, endAngle: .pi * 1.45, clockwise: true))
            p.append(UIBezierPath(arcCenter: CGPoint(x: 21, y: 21), radius: 3.6, startAngle: .pi * 0.9, endAngle: .pi * 2.25, clockwise: true))
        default:
            // 改朝宝玺菱印
            p.move(to: CGPoint(x: 21, y: 11)); p.addLine(to: CGPoint(x: 31, y: 21))
            p.addLine(to: CGPoint(x: 21, y: 31)); p.addLine(to: CGPoint(x: 11, y: 21)); p.close()
            p.append(UIBezierPath(ovalIn: CGRect(x: 18, y: 18, width: 6, height: 6)))
        }
        glyph.path = p.cgPath
        host.addSublayer(glyph)

        let fade = CAKeyframeAnimation(keyPath: "opacity")
        fade.values = [0, 1, 1, 0]; fade.keyTimes = [0, 0.10, 0.78, 1]
        var anims: [CAAnimation] = [fade]

        switch kind {
        case .shock, .coup:
            let slam = CAKeyframeAnimation(keyPath: "transform.scale")
            slam.values = [1.45, 0.90, 1.06, 1.0, 0.96]; slam.keyTimes = [0, 0.14, 0.28, 0.44, 1]
            let shake = CAKeyframeAnimation(keyPath: "transform.rotation.z")
            shake.values = [-0.14, 0.12, -0.07, 0.04, 0]; shake.keyTimes = [0, 0.20, 0.40, 0.62, 1]
            anims += [slam, shake]
        case .harvest, .trade, .talent:
            let pop = CAKeyframeAnimation(keyPath: "transform.scale")
            pop.values = [0.60, 1.12, 1.0, 1.03, 0.96]; pop.keyTimes = [0, 0.18, 0.36, 0.72, 1]
            let floatUp = CABasicAnimation(keyPath: "transform.translation.y"); floatUp.fromValue = 7; floatUp.toValue = -13
            anims += [pop, floatUp]
        case .drought:
            let pulse = CAKeyframeAnimation(keyPath: "transform.scale")
            pulse.values = [0.68, 1.14, 0.98, 1.12, 0.98, 1.06]; pulse.keyTimes = [0, 0.16, 0.36, 0.56, 0.76, 1]
            anims += [pulse]
        case .snow:
            let spin = CABasicAnimation(keyPath: "transform.rotation.z"); spin.fromValue = -0.25; spin.toValue = 0.65
            let down = CABasicAnimation(keyPath: "transform.translation.y"); down.fromValue = -8; down.toValue = 5
            anims += [spin, down]
        case .flood, .disaster:
            let pop = CAKeyframeAnimation(keyPath: "transform.scale"); pop.values = [0.66, 1.16, 0.96, 1.08, 1.0]
            let jolt = CAKeyframeAnimation(keyPath: "transform.translation.x"); jolt.values = [0, -3, 3, -2, 1.5, 0]
            anims += [pop, jolt]
        case .plague:
            let swell = CAKeyframeAnimation(keyPath: "transform.scale"); swell.values = [0.58, 1.08, 1.16]
            let swirl = CABasicAnimation(keyPath: "transform.rotation.z"); swirl.fromValue = 0; swirl.toValue = 0.45
            anims += [swell, swirl]
        default:
            let drop = CAKeyframeAnimation(keyPath: "transform.translation.y"); drop.values = [-12, 1, -1.5, 0]; drop.keyTimes = [0, 0.22, 0.38, 1]
            let scale = CAKeyframeAnimation(keyPath: "transform.scale"); scale.values = [0.74, 1.12, 0.98, 1.0]; scale.keyTimes = [0, 0.22, 0.38, 1]
            anims += [drop, scale]
        }

        let g = CAAnimationGroup()
        g.animations = anims; g.duration = 2.35
        g.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        g.fillMode = .forwards; g.isRemovedOnCompletion = false
        host.add(Self.calm(g), forKey: "eventGlyph")
        return host
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
                let l = b.key.hasPrefix("s") ? navalLayer(culture: b.culture) : battleLayer(culture: b.culture); layer.addSublayer(l); battleLayers[b.key] = (l, b.x, b.y)
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
            let col = UIColor(red: f.r, green: f.g, blue: f.b, alpha: 1)
            let l = f.atlasStyle ? atlasRippleLayer(color: col) : flashLayer(color: col, culture: f.culture)
            layer.addSublayer(l)
            flashLayers[f.id] = (l, f.x, f.y)
            let id = f.id
            let ttl = f.atlasStyle ? 1.15 : 2.2
            once(id, after: ttl) { [weak self] in self?.flashLayers[id]?.layer.removeFromSuperlayer(); self?.flashLayers[id] = nil }
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
        let liveGeo = Set(effects.geoArcs.map(\.key))
        for (key, v) in geoArcLayers where !liveGeo.contains(key) { v.layer.removeFromSuperlayer(); geoArcLayers[key] = nil }
        for arc in effects.geoArcs {
            if let old = geoArcLayers[arc.key] {
                geoArcLayers[arc.key] = (old.layer, arc)
            } else {
                let l = CAShapeLayer()
                l.fillColor = nil; l.lineCap = .round
                switch arc.kind {
                case .war:
                    l.strokeColor = UIColor(red: 0.72, green: 0.20, blue: 0.14, alpha: 0.72).cgColor
                    l.lineWidth = 1.6; l.lineDashPattern = [5, 4]
                case .ally:
                    l.strokeColor = UIColor(red: 0.18, green: 0.44, blue: 0.36, alpha: 0.68).cgColor
                    l.lineWidth = 1.5
                case .vassal:
                    l.strokeColor = UIColor(red: 0.76, green: 0.56, blue: 0.18, alpha: 0.70).cgColor
                    l.lineWidth = 1.4; l.lineDashPattern = [3, 3]
                case .supply:
                    l.strokeColor = arc.severed
                        ? UIColor(red: 0.68, green: 0.18, blue: 0.14, alpha: 0.58).cgColor
                        : UIColor(red: 0.22, green: 0.20, blue: 0.16, alpha: 0.56).cgColor
                    l.lineWidth = 1.4; l.lineDashPattern = arc.severed ? [2, 5] : [4, 3]
                }
                layer.insertSublayer(l, at: 0)
                geoArcLayers[arc.key] = (l, arc)
            }
        }
        let liveBlockades = Set(effects.blockades.map(\.key))
        for (key, v) in blockadeLayers where !liveBlockades.contains(key) { Self.retire(v.layer); blockadeLayers[key] = nil }
        for blk in effects.blockades.prefix(32) {
            if let old = blockadeLayers[blk.key] {
                blockadeLayers[blk.key] = (old.layer, blk.x, blk.y)
            } else {
                let col = UIColor(red: blk.r, green: blk.g, blue: blk.b, alpha: 1)
                let l = blockadeLayer(color: col)
                layer.addSublayer(l)
                blockadeLayers[blk.key] = (l, blk.x, blk.y)
            }
        }
        let liveLandings = Set(effects.landings.map(\.key))
        for (key, v) in landingLayers where !liveLandings.contains(key) {
            Self.retire(v.layer)
            v.arc?.removeFromSuperlayer()
            landingLayers[key] = nil
        }
        for lnd in effects.landings.prefix(24) {
            if let old = landingLayers[lnd.key] {
                landingLayers[lnd.key] = (old.layer, old.arc, lnd)
            } else {
                let col = UIColor(red: lnd.r, green: lnd.g, blue: lnd.b, alpha: 1)
                let (l, arc) = landingLayer(color: col, hasFire: lnd.hasFire)
                layer.addSublayer(l)
                if let arc { layer.addSublayer(arc) }
                landingLayers[lnd.key] = (l, arc, lnd)
            }
        }
        CATransaction.commit()
        battleOrder = battleLayers.keys.sorted()
        if let camera { update(camera: camera, viewport: viewport, effectsChanged: true) }
    }

    private func visibility(_ item: CALayer, visible: Bool) {
        if item.isHidden == visible { item.isHidden = !visible }
        let paused = !visible || reduceMotion
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

    func update(camera: MapCamera, viewport: CGSize, effectsChanged: Bool = false) {
        let reduceMotion = UIAccessibility.isReduceMotionEnabled
        guard effectsChanged || camera != self.camera || viewport != self.viewport || reduceMotion != self.reduceMotion else { return }
        self.camera = camera; self.viewport = viewport; self.reduceMotion = reduceMotion
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        let visibleRect = CGRect(origin: .zero, size: viewport).insetBy(dx: -80, dy: -80)
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
        for key in battleOrder {
            guard let v = battleLayers[key] else { continue }
            var p = screen(v.x, v.y); p.y -= 15 * k
            guard visibleRect.contains(p) else {
                visibility(v.layer, visible: false)
                continue
            }
            let crowded = marks.contains { hypot($0.x - p.x, $0.y - p.y) < 28 * k }
            visibility(v.layer, visible: !crowded)
            guard !crowded else { continue }
            marks.append(p)
            v.layer.position = p; v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k))
        }
        for v in clashLayers.values {
            let m = screen(v.battle.x, v.battle.y)
            let visible = visibleRect.contains(m)
            visibility(v.a, visible: visible); visibility(v.b, visible: visible)
            guard visible else { continue }
            let a = screen(v.battle.ax, v.battle.ay), b = screen(v.battle.bx, v.battle.by)
            let pa = UIBezierPath(); pa.move(to: a); pa.addLine(to: m); v.a.path = pa.cgPath
            let pb = UIBezierPath(); pb.move(to: b); pb.addLine(to: m); v.b.path = pb.cgPath
            v.a.lineWidth = 1 + k * 0.6; v.b.lineWidth = 1 + k * 0.6
        }
        for v in siegeLayers.values { var p = screen(v.x, v.y); p.y -= 14 * k; v.layer.position = p; v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k)) }
        for v in flashLayers.values { v.layer.position = screen(v.x, v.y) }
        for v in claimLayers.values { v.layer.position = screen(v.x, v.y) }
        for v in burstLayers.values { v.layer.position = screen(v.x, v.y) }
        for v in peaceLayers.values { var p = screen(v.x, v.y); p.y -= 10; v.layer.position = p }
        let vpRect = CGRect(origin: .zero, size: viewport)
        for v in battleArrows.values {
            v.root.frame = vpRect; v.gradient.frame = vpRect; v.fill.frame = vpRect
            v.outline.frame = vpRect; v.head.frame = vpRect; v.reveal.frame = vpRect
            layoutArrow(v) { screen($0, $1) }
        }
        for v in geoArcLayers.values {
            let a = screen(v.arc.fromX, v.arc.fromY), b = screen(v.arc.toX, v.arc.toY)
            let dx = b.x - a.x, dy = b.y - a.y, len = max(1, hypot(dx, dy))
            let bow = min(56, len * 0.16)
            let ctrl = CGPoint(x: (a.x + b.x) * 0.5 - (dy / len) * bow, y: (a.y + b.y) * 0.5 + (dx / len) * bow)
            let path = UIBezierPath(); path.move(to: a); path.addQuadCurve(to: b, controlPoint: ctrl)
            v.layer.path = path.cgPath
        }
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
        for v in siegeLayers.values { visibility(v.layer, visible: visibleRect.contains(v.layer.position)) }
        for v in blockadeLayers.values {
            let p = screen(v.x, v.y)
            v.layer.position = p
            v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k))
            visibility(v.layer, visible: visibleRect.contains(p))
        }
        for v in landingLayers.values {
            let p = screen(v.item.x, v.item.y)
            v.layer.position = p
            v.layer.setAffineTransform(CGAffineTransform(scaleX: k, y: k))
            let vis = visibleRect.contains(p)
            visibility(v.layer, visible: vis)
            if let arc = v.arc {
                let fp = screen(v.item.fx, v.item.fy)
                let dist = hypot(p.x - fp.x, p.y - fp.y)
                if vis && dist > 6 {
                    let ctrl = CGPoint(x: (fp.x + p.x) * 0.5, y: min(fp.y, p.y) - min(42, dist * 0.35))
                    let bp = UIBezierPath(); bp.move(to: fp); bp.addQuadCurve(to: p, controlPoint: ctrl)
                    arc.path = bp.cgPath
                    visibility(arc, visible: true)
                } else {
                    visibility(arc, visible: false)
                }
            }
        }
        CATransaction.commit()
    }
}
