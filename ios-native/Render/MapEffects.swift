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
    /// 外交地缘视线弧线与军团海陆补给/护航脉络（war: 朱红敌对线；ally: 青玉同盟线；vassal: 鎏金宗藩线；supply: 军团后勤补给虚线；escort: 舰队护航虚线）。
    struct GeoArc: Equatable {
        enum Kind: Equatable { case war, ally, vassal, supply, escort }
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

    nonisolated private static func image(_ name: String) -> CGImage? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "World"),
              let img = UIImage(contentsOfFile: url.path) else { return nil }
        return (img.preparingForDisplay() ?? img).cgImage
    }
    private static var prewarmed = false
    /// 后台预解码剑影、海浪、宣称与和平鸽图集，杜绝首次交战/海浪现身时的主线程掉帧。
    static func prewarmAsync() {
        guard !prewarmed else { return }
        prewarmed = true
        DispatchQueue.global(qos: .utility).async {
            _ = swords
            _ = waveSheet
            _ = claimIcon
            _ = dove
        }
    }
    /// The original BattleSword atlas: 5 × 8 frames of 258 × 194.
    nonisolated private static let swords = image("battle-sword")
    private static let swordFrames: [NSValue] = (0..<40).map { i in NSValue(cgRect: CGRect(x: CGFloat(i % 5) / 5, y: CGFloat(i / 5) / 8, width: 1.0 / 5, height: 1.0 / 8)) }

    // MARK: Sea waves
    /// The original's Water_Cartoon_Min: a wave that rises, curls and breaks, 8 × 8 frames. Like the
    /// original, waves come and go at random points of the sea in view.
    nonisolated private static let waveSheet = image("sea-wave")
    private static let waveFrames: [NSValue] = (0..<64).map { i in NSValue(cgRect: CGRect(x: CGFloat(i % 8) / 8, y: CGFloat(i / 8) / 8, width: 1.0 / 8, height: 1.0 / 8)) }
    /// Sea points (cell centres) waves may rise at; set with the map.
    var seaSpots: [CGPoint] = []
    private var waves: [(layer: CALayer, x: Double, y: Double, scale: Double)] = []
    private var waveTimer: Timer?
    /// 战况飘字: a loss rises, swells and fades over the fight (vermilion on land, blue at sea).
    /// 锚定在地图世界坐标 (worldX, worldY) 的容器层上，随镜头拖拽、缩放、惯性滑行逐帧贴地跟随，绝不滞留屏幕原地！
    private var activeFloats: [(id: UUID, host: CALayer, x: Double, y: Double)] = []
    /// 飘字放在地名之上的一层（特效本身在地名之下）。
    weak var floatHost: CALayer?
    func float(_ text: String, worldX: Double, worldY: Double, naval: Bool) {
        // 超高倍近观时适度让位给精细战局演出，其余倍镜一律精准贴合地图世界坐标随动。
        guard !Energy.hot, (camera?.scale ?? 1.0) < 2.2, activeFloats.count < 8, window != nil,
              let camera, viewport.width > 0, viewport.height > 0 else { return }
        let vp = (width: Double(viewport.width), height: Double(viewport.height))
        let s = camera.toScreen(x: worldX, y: worldY, viewport: vp)
        guard s.x > -40, s.y > 20, s.x < vp.width + 40, s.y < vp.height + 20 else { return }
        let font = UIFont(name: "TW-Kai-98_1", size: 13.5) ?? .boldSystemFont(ofSize: 13.5)
        let fill = naval ? UIColor(red: 0.12, green: 0.36, blue: 0.72, alpha: 1) : UIColor(red: 0.76, green: 0.14, blue: 0.08, alpha: 1)
        let host = CALayer()
        host.bounds = .zero
        host.position = CGPoint(x: s.x, y: s.y)
        let l = CATextLayer()
        // Filled and outlined in paper, readable over land, sea and borders without a shadow pass.
        l.string = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: fill, .strokeColor: UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 1), .strokeWidth: -5])
        l.alignmentMode = .center; l.contentsScale = UIScreen.main.scale
        l.bounds = CGRect(x: 0, y: 0, width: 108, height: 22); l.position = CGPoint(x: 0, y: -18)
        host.addSublayer(l)
        (floatHost ?? layer).addSublayer(host)
        // 在世界坐标锚点局部向上柔和浮起、淡出；外层 host 每帧由 camera.toScreen 驱动，平移缩放丝毫不偏移。
        let up = CABasicAnimation(keyPath: "position.y"); up.fromValue = -18.0; up.toValue = -44.0
        up.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 0.84, 0.3, 1)
        let fade = CAKeyframeAnimation(keyPath: "opacity"); fade.values = [0, 0.96, 0.96, 0]; fade.keyTimes = [0, 0.14, 0.68, 1]
        let pop = CAKeyframeAnimation(keyPath: "transform.scale"); pop.values = [0.82, 1.06, 1, 0.98]; pop.keyTimes = [0, 0.18, 0.36, 1]
        let g = CAAnimationGroup(); g.animations = [up, fade, pop]; g.duration = 1.45; g.fillMode = .forwards; g.isRemovedOnCompletion = false
        l.opacity = 0
        l.add(Self.calm(g), forKey: "float")
        let id = UUID()
        activeFloats.append((id: id, host: host, x: worldX, y: worldY))
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.48) { [weak self] in
            host.removeFromSuperlayer()
            self?.activeFloats.removeAll { $0.id == id }
        }
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
    nonisolated private static let claimIcon = image("war-claim")
    nonisolated private static let dove = image("peace-bird")

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
    /// 海战: 56×50pt 36 帧（6×6 @ 30fps）高清多图拼接序列帧剧场（双舷连环火炮齐射闪焰＋黑铁炮弹火弧＋冲天白浪水柱＋64 帧海浪碎沫＋双色战力对比条）。
    private func navalLayer(culture: String) -> CALayer {
        _ = culture
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 56, height: 50)
        let strength = CALayer(); strength.name = "strength"; strength.bounds = CGRect(x: 0, y: 0, width: 42, height: 4.8); strength.position = CGPoint(x: 28, y: -6)
        strength.cornerRadius = 2.4; strength.masksToBounds = true; strength.borderWidth = 0.85
        strength.borderColor = UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 0.96).cgColor; strength.isHidden = true
        strength.addSublayer(CALayer()); strength.addSublayer(CALayer()); root.addSublayer(strength)

        let phase = Double.random(in: 0..<1.2)
        let sheet = SpriteSheetLayer(spec: .atlasNaval36)
        sheet.frame = CGRect(x: 1, y: 0, width: 54, height: 54)
        sheet.minificationFilter = .trilinear
        sheet.magnificationFilter = .linear
        sheet.configure(spec: .atlasNaval36, state: .combat, fps: 30.0, phaseOffset: phase)
        root.addSublayer(sheet)

        if Self.particles && !Energy.hot && battleLayers.count < 8 {
            let e = CAEmitterLayer(); e.emitterShape = .line; e.emitterSize = CGSize(width: 28, height: 1); e.emitterPosition = CGPoint(x: 28, y: 24)
            e.emitterCells = [
                cell(Self.puff, color: UIColor(white: 0.96, alpha: 0.24), rate: 3.4, life: 1.6, velocity: 8, range: .pi / 4, scale: 0.26, scaleSpeed: 0.14, alphaSpeed: -0.14, spin: 0.22, angle: -.pi / 2),
                cell(Self.spark, color: UIColor(red: 1, green: 0.76, blue: 0.28, alpha: 1), rate: 5.5, life: 0.34, velocity: 22, range: .pi / 3, scale: 0.48, scaleSpeed: -1.1, alphaSpeed: -2.6, angle: -.pi / 2),
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
        // 36 帧（6×6 @ 30fps）高清多帧拼接交锋动画：复用原作 40 帧双剑挥斩交击序列，精铸寒钢铜柄刀剑＋交击朱金气浪环＋四溅火星与扬尘，彻底告别简陋代码折线！
        _ = culture
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 48, height: 44)
        let strength = CALayer(); strength.name = "strength"; strength.bounds = CGRect(x: 0, y: 0, width: 42, height: 4.8); strength.position = CGPoint(x: 24, y: -6)
        strength.cornerRadius = 2.4; strength.masksToBounds = true; strength.borderWidth = 0.85
        strength.borderColor = UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 0.95).cgColor; strength.isHidden = true
        strength.addSublayer(CALayer()); strength.addSublayer(CALayer()); root.addSublayer(strength)

        let phase = Double.random(in: 0..<1.2)
        let sheet = SpriteSheetLayer(spec: .atlasBattle36)
        sheet.frame = CGRect(x: 1, y: 0, width: 46, height: 46)
        sheet.minificationFilter = .trilinear
        sheet.magnificationFilter = .linear
        sheet.configure(spec: .atlasBattle36, state: .combat, fps: 30.0, phaseOffset: phase)
        root.addSublayer(sheet)

        if Self.particles && !Energy.hot && battleLayers.count < 8 {
            let smoke = battleSmoke(); smoke.emitterPosition = CGPoint(x: 24, y: 22); root.insertSublayer(smoke, at: 0)
        }
        return root
    }

    private func siegeLayer(color: UIColor) -> (CALayer, CAShapeLayer) {
        // 无圆框纯净攻城烽烟（36 帧 6×6 @ 30fps 烈焰浓烟）＋城下纤细水平围城进度条（彻底去除丑陋白色圆盘罩）
        let side: CGFloat = 38
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: side, height: side)

        let siegeAnim = SpriteSheetLayer(spec: .atlasSiege36)
        siegeAnim.frame = CGRect(x: 4, y: 1, width: 30, height: 30)
        siegeAnim.minificationFilter = .trilinear
        siegeAnim.magnificationFilter = .linear
        siegeAnim.configure(spec: .atlasSiege36, state: .siege, fps: 30.0, phaseOffset: Double.random(in: 0..<1.2))
        root.addSublayer(siegeAnim)

        let barPath = UIBezierPath()
        barPath.move(to: CGPoint(x: 5, y: 33.5))
        barPath.addLine(to: CGPoint(x: 33, y: 33.5))

        let track = CAShapeLayer(); track.frame = root.bounds; track.path = barPath.cgPath
        track.fillColor = nil; track.strokeColor = UIColor(red: 0.14, green: 0.10, blue: 0.08, alpha: 0.65).cgColor
        track.lineWidth = 3.2; track.lineCap = .round

        let bar = CAShapeLayer(); bar.frame = root.bounds; bar.path = barPath.cgPath
        bar.fillColor = nil; bar.strokeColor = color.cgColor
        bar.lineWidth = 2.2; bar.lineCap = .round; bar.strokeEnd = 0

        root.addSublayer(track)
        root.addSublayer(bar)
        return (root, bar)
    }

    /// 近海港口封锁徽记：无圆框精细朱砂铁锚锁链微标 + 轻柔海波浮沉动效（彻底去除三重旋转虚线圆圈）。
    private func blockadeLayer(color: UIColor) -> CALayer {
        let side: CGFloat = 34
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: side, height: side)
        let crimson = UIColor(red: 0.78, green: 0.17, blue: 0.13, alpha: 0.96)
        let ink = UIColor(red: 0.16, green: 0.12, blue: 0.09, alpha: 0.88)

        // 精细铁锚轮廓
        let anchor = CAShapeLayer(); anchor.frame = root.bounds
        let ap = UIBezierPath()
        ap.move(to: CGPoint(x: 17, y: 7)); ap.addLine(to: CGPoint(x: 17, y: 24))
        ap.move(to: CGPoint(x: 12, y: 12)); ap.addLine(to: CGPoint(x: 22, y: 12))
        ap.move(to: CGPoint(x: 10, y: 19))
        ap.addQuadCurve(to: CGPoint(x: 17, y: 25), controlPoint: CGPoint(x: 11.5, y: 24.5))
        ap.addQuadCurve(to: CGPoint(x: 24, y: 19), controlPoint: CGPoint(x: 22.5, y: 24.5))
        anchor.path = ap.cgPath; anchor.fillColor = nil
        anchor.strokeColor = ink.cgColor; anchor.lineWidth = 1.9; anchor.lineCap = .round; anchor.lineJoin = .round
        anchor.shadowColor = UIColor(red: 0.99, green: 0.97, blue: 0.91, alpha: 1).cgColor
        anchor.shadowOpacity = 0.85; anchor.shadowRadius = 1.5; anchor.shadowOffset = .zero
        root.addSublayer(anchor)

        // 朱砂封锁斜封条
        let slash = CAShapeLayer(); slash.frame = root.bounds
        let sp = UIBezierPath()
        sp.move(to: CGPoint(x: 8.5, y: 25.5)); sp.addLine(to: CGPoint(x: 25.5, y: 8.5))
        slash.path = sp.cgPath; slash.fillColor = nil
        slash.strokeColor = crimson.cgColor; slash.lineWidth = 2.1; slash.lineCap = .round
        let pulse = CAKeyframeAnimation(keyPath: "opacity"); pulse.values = [0.65, 1.0, 0.65]; pulse.duration = 1.6; pulse.repeatCount = .infinity
        slash.add(Self.calm(pulse), forKey: "blkPulse")
        root.addSublayer(slash)

        // 轻盈国色双波尾迹
        let wake = CAShapeLayer(); wake.frame = root.bounds
        let wp = UIBezierPath()
        wp.move(to: CGPoint(x: 9, y: 28)); wp.addQuadCurve(to: CGPoint(x: 17, y: 27), controlPoint: CGPoint(x: 13, y: 29.5))
        wp.addQuadCurve(to: CGPoint(x: 25, y: 28), controlPoint: CGPoint(x: 21, y: 29.5))
        wake.path = wp.cgPath; wake.fillColor = nil
        wake.strokeColor = color.withAlphaComponent(0.88).cgColor; wake.lineWidth = 1.5; wake.lineCap = .round
        root.addSublayer(wake)

        let bob = CAKeyframeAnimation(keyPath: "transform.translation.y")
        bob.values = [0, -1.6, 0, 1.2, 0]; bob.duration = 2.2; bob.repeatCount = .infinity
        bob.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        root.add(Self.calm(bob), forKey: "blkBob")
        return root
    }

    /// 两栖抢滩登陆 36 帧（6×6 @ 30fps）无圆框岸轰炮火序列帧 + 近海舰炮金火弹道弧。
    private func landingLayer(color: UIColor, hasFire: Bool) -> (CALayer, CAShapeLayer?) {
        _ = color
        let side: CGFloat = 46
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: side, height: side)

        let sheet = SpriteSheetLayer(spec: .atlasAmphibious36)
        sheet.frame = root.bounds
        sheet.minificationFilter = .trilinear
        sheet.magnificationFilter = .linear
        sheet.configure(spec: .atlasAmphibious36, state: .combat, fps: 30.0, phaseOffset: Double.random(in: 0..<1.2))
        root.addSublayer(sheet)

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
        // 无圆框纯净攻占插旗：36 帧淡烟升腾序列帧 + 60/120fps 矢量国色飘扬燕尾战旗 + 鎏金星芒（彻底去除地面双椭圆套圈）。
        _ = culture
        let root = CALayer(); root.bounds = CGRect(x: 0, y: 0, width: 120, height: 120)
        let ink = UIColor(red: 0.16, green: 0.12, blue: 0.09, alpha: 1)
        let gold = UIColor(red: 0.94, green: 0.76, blue: 0.28, alpha: 1)

        let dust = SpriteSheetLayer(spec: .atlasCaptureFlag36)
        dust.frame = CGRect(x: 34, y: 34, width: 52, height: 52)
        dust.minificationFilter = .trilinear
        dust.magnificationFilter = .linear
        dust.opacity = 0.86
        dust.configure(spec: .atlasCaptureFlag36, state: .combat, fps: 30.0, phaseOffset: 0)
        let dustFade = CAKeyframeAnimation(keyPath: "opacity"); dustFade.values = [0, 0.86, 0.72, 0]; dustFade.keyTimes = [0, 0.14, 0.70, 1]; dustFade.duration = 2.0
        dustFade.fillMode = .forwards; dustFade.isRemovedOnCompletion = false
        dust.add(Self.calm(dustFade), forKey: "dustFade")
        root.addSublayer(dust)

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
            // 纯净无圆框手绘宋画事件微标（彻底去除套圈与外扩圆环，仅保留精致微标浮现与轻柔阴影）
            let accent = Self.eventColor(b.kind, nation: color)
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

    /// 纯净无圆框手绘事件浮标：优先展示透明手绘水墨徽标（附轻柔宣纸阴影提亮），无圆盘、无套圈，依事件语义丝滑浮升淡出。
    private func calligraphicEventLayer(_ kind: MapEffects.Burst.Kind, accent: UIColor) -> CALayer {
        let host = CALayer()
        host.bounds = CGRect(x: 0, y: 0, width: 36, height: 36)
        host.position = CGPoint(x: 60, y: 54)
        host.opacity = 0

        let artImage: UIImage? = {
            switch kind {
            case .harvest: return BundleArt.fxHarvest
            case .trade: return BundleArt.fxTrade
            case .talent: return BundleArt.fxTalent
            case .drought: return BundleArt.fxWeatherDrought
            case .snow: return BundleArt.fxWeatherSnow
            case .flood, .disaster: return BundleArt.fxWeatherStorm
            case .plague: return BundleArt.fxPlague
            case .shock, .coup: return BundleArt.heraldWar
            case .regime, .founded: return BundleArt.heraldEdict
            case .destroyed: return nil
            }
        }()

        if let cg = artImage?.cgImage {
            let sprite = CALayer()
            sprite.frame = CGRect(x: 3, y: 3, width: 30, height: 30)
            sprite.contents = cg
            sprite.contentsGravity = .resizeAspect
            sprite.minificationFilter = .trilinear
            sprite.magnificationFilter = .linear
            sprite.shadowColor = UIColor(red: 0.99, green: 0.97, blue: 0.91, alpha: 1).cgColor
            sprite.shadowOpacity = 0.85
            sprite.shadowRadius = 2.0
            sprite.shadowOffset = .zero
            host.addSublayer(sprite)
        } else {
            let glyph = CAShapeLayer(); glyph.frame = host.bounds
            glyph.fillColor = nil; glyph.strokeColor = accent.cgColor
            glyph.lineWidth = 2.0; glyph.lineCap = .round; glyph.lineJoin = .round
            glyph.shadowColor = UIColor(red: 0.99, green: 0.97, blue: 0.91, alpha: 1).cgColor
            glyph.shadowOpacity = 0.90; glyph.shadowRadius = 1.8; glyph.shadowOffset = .zero
            let p = UIBezierPath()
            p.move(to: CGPoint(x: 18, y: 9)); p.addLine(to: CGPoint(x: 27, y: 18))
            p.addLine(to: CGPoint(x: 18, y: 27)); p.addLine(to: CGPoint(x: 9, y: 18)); p.close()
            glyph.path = p.cgPath
            host.addSublayer(glyph)
        }

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
            guard flashLayers.count < 12 else { continue }
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
            guard burstLayers.count < 12 else { continue }
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
                case .escort:
                    l.strokeColor = UIColor(red: 0.16, green: 0.48, blue: 0.68, alpha: 0.72).cgColor
                    l.lineWidth = 1.5; l.lineDashPattern = [6, 3]
                }
                layer.insertSublayer(l, at: 0)
                geoArcLayers[arc.key] = (l, arc)
            }
        }
        let liveBlockades = Set(effects.blockades.map(\.key))
        for (key, v) in blockadeLayers where !liveBlockades.contains(key) { Self.retire(v.layer); blockadeLayers[key] = nil }
        for blk in effects.blockades.prefix(16) {
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
        for lnd in effects.landings.prefix(12) {
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
        for f in activeFloats {
            f.host.position = screen(f.x, f.y)
        }
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
