import SwiftUI

/// 全作统一的手绘水墨图标集（24×24 统一画格）：
/// 以宋代木刻与毛笔意趣描绘——城楼（国家）、双戈（军事/战事）、锦轴国书（外交）、线装史册（纪事）、
/// 玉阶（排行）、青绿叠嶂（地图视图）、帅旗（即时战略）、宗祠（家族）、玉璧连环（联盟）、
/// 礼器九鼎（政体）、方孔铜钱（经济）、文房笔墨（文化）、圣光莲轮（宗教）、商贸货箱（特产）、九州井田（区域）等。
///
/// 笔触：每笔模拟毛笔起顿、行饱、收锋；底下衬以淡墨洇晕，并在核心处点缀克制的朱砂/浅墨焦点层，
/// 彻底告别生硬方框底色。图标换形时支持「自左向右一笔写出」的 `brushWrite` 过渡。
enum InkGlyph: String, CaseIterable {
    case nation, military, diplomacy, chronicle, ranking, views, command, menu, close
    case sea, plain, mountain, raise, lower, smooth
    case war
    case house, crown, alliance, culture, religion, polity, economy, goods, region
    case play, pause, marriage, edict
}

struct InkIcon: View {
    let glyph: InkGlyph
    var size: CGFloat = 22
    var weight: CGFloat = 1.7
    var filled = false
    /// 可选点缀色；为空时在选中态用柔和前景色晕染焦点部件，平时不抢主笔。
    var accent: Color? = nil

    var body: some View {
        let w = weight * size / 22
        ZStack {
            if filled {
                // 选中态的柔和墨/朱砂圆形水晕，替代生硬矩形框。
                Circle()
                    .fill(RadialGradient(colors: [Theme.seal.opacity(0.14), .clear], center: .center, startRadius: 0, endRadius: size * 0.56))
                    .scaleEffect(1.15)
            }
            if let accent {
                InkAccentPath(glyph: glyph).fill(accent)
            } else if filled {
                InkAccentPath(glyph: glyph).fill(.foreground.opacity(0.24))
            }
            // 淡墨洇晕：略宽、微糊、极淡，赋予宣纸落墨的温润质感。
            BrushShape(glyph: glyph, width: w * 1.65)
                .fill(.foreground.opacity(0.14))
                .blur(radius: w * 0.42)
            // 主笔触：起顿行饱收锋。
            BrushShape(glyph: glyph, width: w * 1.24)
                .fill(.foreground)
        }
        .frame(width: size, height: size)
        .drawingGroup()
    }
}

/// 换形时的写出：新图标由左向右显出（像一笔写过去），旧图标淡去。
struct BrushReveal: ViewModifier {
    let progress: CGFloat
    func body(content: Content) -> some View {
        content.mask(alignment: .leading) {
            GeometryReader { g in
                LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: max(0, progress - 0.15)), .init(color: .clear, location: progress)],
                               startPoint: .leading, endPoint: .trailing)
                    .frame(width: g.size.width * 1.2, height: g.size.height).offset(x: -g.size.width * 0.1)
            }
        }
    }
}
extension AnyTransition {
    static var brushWrite: AnyTransition {
        .asymmetric(insertion: .modifier(active: BrushReveal(progress: 0), identity: BrushReveal(progress: 1.15)),
                    removal: .opacity.combined(with: .scale(scale: 0.86)))
    }
}

/// 笔画的形：把 InkPath 的每一笔拆成折线，按毛笔的轻重沿法线左右展开成面。
struct BrushShape: Shape {
    let glyph: InkGlyph
    let width: CGFloat
    func path(in rect: CGRect) -> Path {
        let base = InkPath(glyph: glyph).path(in: rect)
        return Brush.stroke(base.cgPath, width: width)
    }
}

enum Brush {
    /// 折线：一笔的点列与是否闭合。
    struct Run { var points: [CGPoint]; var closed: Bool }

    /// 把路径拆成折线（曲线按 10 段采样）。
    static func runs(_ path: CGPath) -> [Run] {
        var runs = [Run](), current = [CGPoint](), start = CGPoint.zero
        func finish(closed: Bool) {
            if current.count >= 2 { runs.append(Run(points: current, closed: closed)) }
            current = []
        }
        path.applyWithBlock { e in
            let el = e.pointee, p = el.points
            switch el.type {
            case .moveToPoint:
                finish(closed: false); start = p[0]; current = [p[0]]
            case .addLineToPoint:
                current.append(p[0])
            case .addQuadCurveToPoint:
                let a = current.last ?? start
                for i in 1...10 {
                    let t = CGFloat(i) / 10, u = 1 - t
                    current.append(CGPoint(x: u * u * a.x + 2 * u * t * p[0].x + t * t * p[1].x, y: u * u * a.y + 2 * u * t * p[0].y + t * t * p[1].y))
                }
            case .addCurveToPoint:
                let a = current.last ?? start
                for i in 1...10 {
                    let t = CGFloat(i) / 10, u = 1 - t
                    let x = u * u * u * a.x + 3 * u * u * t * p[0].x + 3 * u * t * t * p[1].x + t * t * t * p[2].x
                    let y = u * u * u * a.y + 3 * u * u * t * p[0].y + 3 * u * t * t * p[1].y + t * t * t * p[2].y
                    current.append(CGPoint(x: x, y: y))
                }
            case .closeSubpath:
                if let last = current.last, hypot(last.x - start.x, last.y - start.y) < 0.01 { current.removeLast() }
                finish(closed: true); current = []
            @unknown default: break
            }
        }
        finish(closed: false)
        return runs
    }

    /// 毛笔的轻重：起笔略顿（0.85）、行笔饱满（1）、收笔出锋（0.45）。
    static func profile(_ t: CGFloat) -> CGFloat {
        let body = pow(sin(CGFloat.pi * min(1, max(0, t))), 0.45)
        return max(0.42, min(1.05, 0.42 + 0.58 * body + 0.28 * max(0, 0.25 - t) / 0.25))
    }

    static func stroke(_ path: CGPath, width: CGFloat) -> Path {
        var out = Path()
        for run in runs(path) {
            let pts = run.points
            let n = pts.count
            guard n >= 2 else { continue }
            var len = [CGFloat](repeating: 0, count: n)
            for i in 1..<n { len[i] = len[i - 1] + hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) }
            let total = max(len[n - 1] + (run.closed ? hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y) : 0), 0.001)
            func normal(_ i: Int) -> CGPoint {
                func dir(_ a: CGPoint, _ b: CGPoint) -> CGPoint { let d = hypot(b.x - a.x, b.y - a.y); return d > 1e-6 ? CGPoint(x: (b.x - a.x) / d, y: (b.y - a.y) / d) : .zero }
                let prev = run.closed ? pts[(i - 1 + n) % n] : pts[max(0, i - 1)]
                let next = run.closed ? pts[(i + 1) % n] : pts[min(n - 1, i + 1)]
                let a = i == 0 && !run.closed ? dir(pts[0], pts[1]) : dir(prev, pts[i])
                let b = i == n - 1 && !run.closed ? dir(pts[n - 2], pts[n - 1]) : dir(pts[i], next)
                var m = CGPoint(x: a.x + b.x, y: a.y + b.y)
                let ml = hypot(m.x, m.y)
                m = ml > 1e-6 ? CGPoint(x: m.x / ml, y: m.y / ml) : a
                let cos = max(0.5, m.x * a.x + m.y * a.y)
                return CGPoint(x: -m.y / cos, y: m.x / cos)
            }
            if run.closed {
                var outer = [CGPoint](), inner = [CGPoint]()
                for i in 0..<n {
                    let t = len[i] / total, w = width * (0.82 + 0.18 * sin(CGFloat.pi * 2 * t + 0.6)) / 2
                    let nm = normal(i)
                    outer.append(CGPoint(x: pts[i].x + nm.x * w, y: pts[i].y + nm.y * w))
                    inner.append(CGPoint(x: pts[i].x - nm.x * w, y: pts[i].y - nm.y * w))
                }
                var ring = Path(); ring.addLines(outer); ring.closeSubpath(); ring.addLines(inner.reversed()); ring.closeSubpath()
                out.addPath(ring)
            } else {
                var left = [CGPoint](), right = [CGPoint]()
                for i in 0..<n {
                    let w = width * profile(len[i] / total) / 2
                    let nm = normal(i)
                    left.append(CGPoint(x: pts[i].x + nm.x * w, y: pts[i].y + nm.y * w))
                    right.append(CGPoint(x: pts[i].x - nm.x * w, y: pts[i].y - nm.y * w))
                }
                var band = Path(); band.addLines(left + right.reversed()); band.closeSubpath()
                out.addPath(band)
                for (i, t) in [(0, CGFloat(0)), (n - 1, CGFloat(1))] {
                    let r = width * profile(t) / 2
                    out.addEllipse(in: CGRect(x: pts[i].x - r, y: pts[i].y - r, width: r * 2, height: r * 2))
                }
            }
        }
        return out
    }
}

/// 每个图标的核心填充点缀面（城门拱洞、印章圆印、题签、令旗面、玉璧、日轮、铜钱等），
/// 彻底取代旧版 `Path(p.boundingRect)` 丑陋矩形底色。
struct InkAccentPath: Shape {
    let glyph: InkGlyph
    func path(in rect: CGRect) -> Path {
        let k = min(rect.width, rect.height) / 24
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
        var p = Path()
        switch glyph {
        case .nation:
            // 城门朱拱
            p.move(to: pt(9.5, 20)); p.addLine(to: pt(9.5, 16.6))
            p.addQuadCurve(to: pt(14.5, 16.6), control: pt(12, 13.8))
            p.addLine(to: pt(14.5, 20)); p.closeSubpath()
        case .military, .war:
            // 双戈红缨
            p.addEllipse(in: CGRect(origin: pt(15.2, 6.2), size: CGSize(width: 3.0 * k, height: 3.0 * k)))
            p.addEllipse(in: CGRect(origin: pt(5.8, 6.2), size: CGSize(width: 3.0 * k, height: 3.0 * k)))
        case .diplomacy:
            // 国书圆印
            p.addEllipse(in: CGRect(origin: pt(13.0, 13.2), size: CGSize(width: 4.2 * k, height: 4.2 * k)))
        case .chronicle:
            // 线装书题签
            p.addRoundedRect(in: CGRect(origin: pt(12.2, 6.0), size: CGSize(width: 4.0 * k, height: 9.0 * k)), cornerSize: CGSize(width: 0.8 * k, height: 0.8 * k))
        case .ranking:
            // 榜首玉阶与顶珠
            p.addRect(CGRect(origin: pt(9.5, 7.5), size: CGSize(width: 5.0 * k, height: 12.5 * k)))
            p.addEllipse(in: CGRect(origin: pt(10.6, 2.2), size: CGSize(width: 2.8 * k, height: 2.8 * k)))
        case .views:
            // 山水红日
            p.addEllipse(in: CGRect(origin: pt(15.8, 3.2), size: CGSize(width: 4.2 * k, height: 4.2 * k)))
        case .command:
            // 燕尾令旗面
            p.move(to: pt(7, 4.2)); p.addLine(to: pt(18.5, 4.2)); p.addLine(to: pt(15.2, 7.8)); p.addLine(to: pt(18.5, 11.4)); p.addLine(to: pt(7, 11.4)); p.closeSubpath()
        case .house:
            // 宗祠正门牌匾
            p.addRect(CGRect(origin: pt(9.5, 13.8), size: CGSize(width: 5.0 * k, height: 6.2 * k)))
        case .crown:
            // 冕冠正中玉珠
            p.addEllipse(in: CGRect(origin: pt(10.3, 6.5), size: CGSize(width: 3.4 * k, height: 3.4 * k)))
        case .alliance:
            // 玉璧相交处结
            p.addEllipse(in: CGRect(origin: pt(9.8, 9.8), size: CGSize(width: 4.4 * k, height: 4.4 * k)))
        case .culture:
            // 文房印章
            p.addRoundedRect(in: CGRect(origin: pt(15.5, 14.5), size: CGSize(width: 4.2 * k, height: 4.2 * k)), cornerSize: CGSize(width: 0.9 * k, height: 0.9 * k))
        case .religion:
            // 圣光核心日轮
            p.addEllipse(in: CGRect(origin: pt(9.2, 9.2), size: CGSize(width: 5.6 * k, height: 5.6 * k)))
        case .polity:
            // 礼鼎鼎腹
            p.addRoundedRect(in: CGRect(origin: pt(6.5, 9.2), size: CGSize(width: 11.0 * k, height: 6.2 * k)), cornerSize: CGSize(width: 2.2 * k, height: 2.2 * k))
        case .economy:
            // 铜钱方孔
            p.addRect(CGRect(origin: pt(9.6, 9.6), size: CGSize(width: 4.8 * k, height: 4.8 * k)))
        case .goods:
            // 商货捆绳十字印
            p.addRect(CGRect(origin: pt(10.4, 7.0), size: CGSize(width: 3.2 * k, height: 12.0 * k)))
        case .region:
            // 九州中州
            p.addRect(CGRect(origin: pt(9.2, 9.2), size: CGSize(width: 5.6 * k, height: 5.6 * k)))
        case .play:
            p.move(to: pt(7.2, 5.2)); p.addLine(to: pt(19.2, 12.0)); p.addLine(to: pt(7.2, 18.8)); p.closeSubpath()
        case .pause:
            p.addRoundedRect(in: CGRect(origin: pt(6.8, 5.2), size: CGSize(width: 3.4 * k, height: 13.6 * k)), cornerSize: CGSize(width: 1.0 * k, height: 1.0 * k))
            p.addRoundedRect(in: CGRect(origin: pt(13.8, 5.2), size: CGSize(width: 3.4 * k, height: 13.6 * k)), cornerSize: CGSize(width: 1.0 * k, height: 1.0 * k))
        case .marriage:
            p.addEllipse(in: CGRect(origin: pt(9.8, 9.5), size: CGSize(width: 4.4 * k, height: 4.4 * k)))
        case .edict:
            p.addRoundedRect(in: CGRect(origin: pt(9.5, 13.0), size: CGSize(width: 5.0 * k, height: 4.8 * k)), cornerSize: CGSize(width: 0.9 * k, height: 0.9 * k))
        case .sea, .plain, .mountain, .raise, .lower, .smooth, .menu, .close:
            break
        }
        return p
    }
}

struct InkPath: Shape {
    let glyph: InkGlyph
    func path(in rect: CGRect) -> Path {
        let k = min(rect.width, rect.height) / 24
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
        var p = Path()
        switch glyph {
        case .sea:
            for y in [CGFloat(7), 12, 17] {
                p.move(to: pt(3, y)); p.addCurve(to: pt(21, y), control1: pt(9, y - 5), control2: pt(15, y + 5))
            }
        case .plain:
            p.move(to: pt(3, 18)); p.addQuadCurve(to: pt(21, 18), control: pt(12, 14))
            p.move(to: pt(8, 16)); p.addLine(to: pt(8, 8)); p.move(to: pt(8, 12)); p.addLine(to: pt(5, 9))
            p.move(to: pt(8, 10)); p.addLine(to: pt(11, 7))
            p.move(to: pt(15, 16)); p.addLine(to: pt(15, 10)); p.addLine(to: pt(18, 7))
        case .mountain:
            p.move(to: pt(2, 20)); p.addLine(to: pt(10, 4)); p.addLine(to: pt(18, 20)); p.closeSubpath()
            p.move(to: pt(7, 10)); p.addLine(to: pt(10, 12)); p.addLine(to: pt(13, 10))
            p.move(to: pt(15, 14)); p.addLine(to: pt(18, 9)); p.addLine(to: pt(23, 20)); p.addLine(to: pt(18, 20))
        case .raise, .lower:
            let up = glyph == .raise
            p.move(to: pt(4, 20)); p.addLine(to: pt(20, 20))
            p.move(to: pt(12, 4)); p.addLine(to: pt(12, 16))
            let tip: CGFloat = up ? 4 : 16, base: CGFloat = up ? 9 : 11
            p.move(to: pt(7, base)); p.addLine(to: pt(12, tip)); p.addLine(to: pt(17, base))
        case .smooth:
            p.move(to: pt(3, 7)); p.addLine(to: pt(7, 4)); p.addLine(to: pt(12, 9)); p.addLine(to: pt(17, 5)); p.addLine(to: pt(21, 7))
            p.move(to: pt(3, 17)); p.addCurve(to: pt(21, 17), control1: pt(9, 12), control2: pt(15, 12))
        case .nation:
            // 重檐城楼：飞檐、殿柱、城台与门拱。
            p.move(to: pt(2.5, 8.6)); p.addQuadCurve(to: pt(12, 3.6), control: pt(8, 7.6)); p.addQuadCurve(to: pt(21.5, 8.6), control: pt(16, 7.6))
            p.move(to: pt(5.8, 8.6)); p.addLine(to: pt(5.8, 12.6)); p.move(to: pt(18.2, 8.6)); p.addLine(to: pt(18.2, 12.6))
            p.move(to: pt(9.5, 8.6)); p.addLine(to: pt(9.5, 12.6)); p.move(to: pt(14.5, 8.6)); p.addLine(to: pt(14.5, 12.6))
            p.move(to: pt(3, 12.8)); p.addLine(to: pt(21, 12.8))
            p.move(to: pt(3.5, 12.8)); p.addLine(to: pt(3.5, 20)); p.addLine(to: pt(20.5, 20)); p.addLine(to: pt(20.5, 12.8))
            p.move(to: pt(9.5, 20)); p.addLine(to: pt(9.5, 16.6)); p.addQuadCurve(to: pt(14.5, 16.6), control: pt(12, 13.8)); p.addLine(to: pt(14.5, 20))
        case .military, .war:
            // 交叉双戈：斜杆、月牙戈刃，军事加底部盾衡。
            p.move(to: pt(4, 20.5)); p.addLine(to: pt(18.2, 6.2))
            p.move(to: pt(20, 20.5)); p.addLine(to: pt(5.8, 6.2))
            p.move(to: pt(14.6, 3.8)); p.addQuadCurve(to: pt(20.4, 9.2), control: pt(20.4, 3.8)); p.addLine(to: pt(17.8, 6.6))
            p.move(to: pt(9.4, 3.8)); p.addQuadCurve(to: pt(3.6, 9.2), control: pt(3.6, 3.8)); p.addLine(to: pt(6.2, 6.6))
            if glyph == .military { p.move(to: pt(8.5, 16.2)); p.addLine(to: pt(15.5, 16.2)) }
        case .diplomacy:
            // 锦轴国书：卷轴、轴头、行文与圆印。
            p.addRoundedRect(in: CGRect(origin: pt(5, 4), size: CGSize(width: 14 * k, height: 16 * k)), cornerSize: CGSize(width: 2 * k, height: 2 * k))
            p.move(to: pt(2.8, 4)); p.addLine(to: pt(21.2, 4)); p.move(to: pt(2.8, 20)); p.addLine(to: pt(21.2, 20))
            p.move(to: pt(8, 8.6)); p.addLine(to: pt(16, 8.6)); p.move(to: pt(8, 11.8)); p.addLine(to: pt(13.2, 11.8))
            p.addEllipse(in: CGRect(origin: pt(13, 13.2), size: CGSize(width: 4.2 * k, height: 4.2 * k)))
        case .chronicle:
            // 线装史册：封面、四针装订线与题签。
            p.addRoundedRect(in: CGRect(origin: pt(4.8, 3), size: CGSize(width: 15.2 * k, height: 18 * k)), cornerSize: CGSize(width: 1.5 * k, height: 1.5 * k))
            for y in [6.2, 10.4, 14.6, 18.6] { p.move(to: pt(4.8, CGFloat(y))); p.addLine(to: pt(8.2, CGFloat(y))) }
            p.move(to: pt(8.2, 3)); p.addLine(to: pt(8.2, 21))
            p.addRect(CGRect(origin: pt(12.2, 6), size: CGSize(width: 4 * k, height: 9 * k)))
        case .ranking:
            // 玉阶三甲与冠珠。
            p.move(to: pt(3, 20)); p.addLine(to: pt(21, 20))
            p.addRect(CGRect(origin: pt(4, 12.2), size: CGSize(width: 5.5 * k, height: 7.8 * k)))
            p.addRect(CGRect(origin: pt(9.5, 7.5), size: CGSize(width: 5.0 * k, height: 12.5 * k)))
            p.addRect(CGRect(origin: pt(14.5, 14.0), size: CGSize(width: 5.5 * k, height: 6.0 * k)))
            p.addEllipse(in: CGRect(origin: pt(10.6, 2.2), size: CGSize(width: 2.8 * k, height: 2.8 * k)))
        case .views:
            // 青绿叠嶂与红日。
            p.move(to: pt(2, 19.2)); p.addQuadCurve(to: pt(9.5, 8.6), control: pt(5.8, 8.6)); p.addQuadCurve(to: pt(15.5, 15.2), control: pt(12.8, 9.6))
            p.move(to: pt(10.8, 19.2)); p.addQuadCurve(to: pt(16.8, 11.8), control: pt(13.8, 11.8)); p.addQuadCurve(to: pt(22, 19.2), control: pt(19.6, 12.2))
            p.move(to: pt(2, 19.2)); p.addLine(to: pt(22, 19.2))
            p.addEllipse(in: CGRect(origin: pt(15.8, 3.2), size: CGSize(width: 4.2 * k, height: 4.2 * k)))
        case .command:
            // 帅字令旗与虚线阵列。
            p.move(to: pt(7, 21)); p.addLine(to: pt(7, 3))
            p.move(to: pt(7, 4.2)); p.addLine(to: pt(18.5, 4.2)); p.addLine(to: pt(15.2, 7.8)); p.addLine(to: pt(18.5, 11.4)); p.addLine(to: pt(7, 11.4))
            for x in stride(from: 3.0, to: 21.5, by: 4.2) { p.move(to: pt(CGFloat(x), 21)); p.addLine(to: pt(CGFloat(x) + 2.2, 21)) }
        case .menu:
            p.move(to: pt(4.5, 7)); p.addLine(to: pt(19.5, 7)); p.move(to: pt(4.5, 12)); p.addLine(to: pt(16.5, 12)); p.move(to: pt(4.5, 17)); p.addLine(to: pt(19.5, 17))
        case .close:
            p.move(to: pt(6, 6)); p.addLine(to: pt(18, 18)); p.move(to: pt(18, 6)); p.addLine(to: pt(6, 18))
        case .house:
            // 世家宗祠：歇山屋顶、双柱、正门与石阶。
            p.move(to: pt(3, 10.5)); p.addQuadCurve(to: pt(12, 4.0), control: pt(7.8, 7.6)); p.addQuadCurve(to: pt(21, 10.5), control: pt(16.2, 7.6))
            p.move(to: pt(5.5, 10.2)); p.addLine(to: pt(5.5, 20)); p.move(to: pt(18.5, 10.2)); p.addLine(to: pt(18.5, 20))
            p.move(to: pt(9.5, 20)); p.addLine(to: pt(9.5, 13.8)); p.addLine(to: pt(14.5, 13.8)); p.addLine(to: pt(14.5, 20))
            p.move(to: pt(3.2, 20)); p.addLine(to: pt(20.8, 20))
        case .crown:
            // 帝王冠冕：三峰冠体与底箍。
            p.move(to: pt(3.5, 17.5)); p.addLine(to: pt(20.5, 17.5))
            p.move(to: pt(4.5, 15.2)); p.addLine(to: pt(3.5, 8.0)); p.addLine(to: pt(8.5, 11.5)); p.addLine(to: pt(12, 5.5))
            p.addLine(to: pt(15.5, 11.5)); p.addLine(to: pt(20.5, 8.0)); p.addLine(to: pt(19.5, 15.2)); p.closeSubpath()
        case .alliance:
            // 玉璧连环：双环相扣，象征盟约。
            p.addEllipse(in: CGRect(origin: pt(3.2, 6.2), size: CGSize(width: 11.6 * k, height: 11.6 * k)))
            p.addEllipse(in: CGRect(origin: pt(9.2, 6.2), size: CGSize(width: 11.6 * k, height: 11.6 * k)))
        case .culture:
            // 文房笔墨：斜倚毛笔与纸卷墨印。
            p.move(to: pt(5, 19)); p.addLine(to: pt(17, 5))
            p.move(to: pt(4, 20)); p.addQuadCurve(to: pt(8, 18.2), control: pt(5.2, 16.5))
            p.move(to: pt(11.5, 19.2)); p.addLine(to: pt(20.2, 19.2))
            p.addRoundedRect(in: CGRect(origin: pt(15.5, 14.2), size: CGSize(width: 4.4 * k, height: 4.4 * k)), cornerSize: CGSize(width: 0.8 * k, height: 0.8 * k))
        case .religion:
            // 圣光法轮：日轮与八方芒线。
            p.addEllipse(in: CGRect(origin: pt(8.2, 8.2), size: CGSize(width: 7.6 * k, height: 7.6 * k)))
            for i in 0..<8 {
                let a = CGFloat(i) * .pi / 4
                p.move(to: pt(12 + cos(a) * 5.6, 12 + sin(a) * 5.6))
                p.addLine(to: pt(12 + cos(a) * 9.2, 12 + sin(a) * 9.2))
            }
        case .polity:
            // 礼器青铜鼎：双耳、圆腹、三足，代表国体政制。
            p.move(to: pt(6.5, 8.5)); p.addLine(to: pt(6.5, 5.2)); p.addLine(to: pt(8.8, 5.2)); p.addLine(to: pt(8.8, 8.5))
            p.move(to: pt(15.2, 8.5)); p.addLine(to: pt(15.2, 5.2)); p.addLine(to: pt(17.5, 5.2)); p.addLine(to: pt(17.5, 8.5))
            p.addRoundedRect(in: CGRect(origin: pt(5.2, 8.5), size: CGSize(width: 13.6 * k, height: 7.2 * k)), cornerSize: CGSize(width: 2.8 * k, height: 2.8 * k))
            p.move(to: pt(7.5, 15.8)); p.addLine(to: pt(6.2, 20.5))
            p.move(to: pt(12.0, 15.8)); p.addLine(to: pt(12.0, 20.5))
            p.move(to: pt(16.5, 15.8)); p.addLine(to: pt(17.8, 20.5))
        case .economy:
            // 古铜钱：外圆内方。
            p.addEllipse(in: CGRect(origin: pt(3.5, 3.5), size: CGSize(width: 17 * k, height: 17 * k)))
            p.addRect(CGRect(origin: pt(9.2, 9.2), size: CGSize(width: 5.6 * k, height: 5.6 * k)))
        case .goods:
            // 商贸货箱：方匣与系带。
            p.addRoundedRect(in: CGRect(origin: pt(4.2, 6.8), size: CGSize(width: 15.6 * k, height: 13.0 * k)), cornerSize: CGSize(width: 2.0 * k, height: 2.0 * k))
            p.move(to: pt(4.2, 11.2)); p.addLine(to: pt(19.8, 11.2))
            p.move(to: pt(12, 6.8)); p.addLine(to: pt(12, 19.8))
            p.move(to: pt(8.5, 6.8)); p.addQuadCurve(to: pt(15.5, 6.8), control: pt(12, 3.2))
        case .region:
            // 九州井田：三乘三区划。
            p.addRoundedRect(in: CGRect(origin: pt(4, 4), size: CGSize(width: 16 * k, height: 16 * k)), cornerSize: CGSize(width: 1.8 * k, height: 1.8 * k))
            p.move(to: pt(9.3, 4)); p.addLine(to: pt(9.3, 20)); p.move(to: pt(14.7, 4)); p.addLine(to: pt(14.7, 20))
            p.move(to: pt(4, 9.3)); p.addLine(to: pt(20, 9.3)); p.move(to: pt(4, 14.7)); p.addLine(to: pt(20, 14.7))
        case .play:
            p.move(to: pt(7.2, 5.2)); p.addLine(to: pt(19.2, 12.0)); p.addLine(to: pt(7.2, 18.8)); p.closeSubpath()
        case .pause:
            p.move(to: pt(8.4, 5.4)); p.addLine(to: pt(8.4, 18.6))
            p.move(to: pt(15.6, 5.4)); p.addLine(to: pt(15.6, 18.6))
        case .marriage:
            // 结发同心：双环相牵与垂带。
            p.addEllipse(in: CGRect(origin: pt(3.5, 6.5), size: CGSize(width: 9.2 * k, height: 9.2 * k)))
            p.addEllipse(in: CGRect(origin: pt(11.3, 6.5), size: CGSize(width: 9.2 * k, height: 9.2 * k)))
            p.move(to: pt(10.5, 15.2)); p.addLine(to: pt(8.2, 20.5))
            p.move(to: pt(13.5, 15.2)); p.addLine(to: pt(15.8, 20.5))
        case .edict:
            // 诏书令牌：竖简、吊环与朱印。
            p.addRoundedRect(in: CGRect(origin: pt(6.5, 5.2), size: CGSize(width: 11 * k, height: 15.5 * k)), cornerSize: CGSize(width: 2 * k, height: 2 * k))
            p.move(to: pt(9.8, 5.2)); p.addQuadCurve(to: pt(14.2, 5.2), control: pt(12, 2.4))
            p.move(to: pt(12, 8.2)); p.addLine(to: pt(12, 11.4))
            p.addRoundedRect(in: CGRect(origin: pt(9.5, 13.0), size: CGSize(width: 5 * k, height: 4.8 * k)), cornerSize: CGSize(width: 0.9 * k, height: 0.9 * k))
        }
        return p
    }
}

/// 游戏主按钮与操作标签：优先映射为全作统一的毛笔手绘水墨图标，其余工具操作沿用系统符号。
struct GameActionLabel: View {
    let title: String
    let symbol: String
    static func glyph(for symbol: String) -> InkGlyph? {
        switch symbol {
        case "flag.2.crossed", "flag.2.crossed.fill": return .military
        case "map", "mountain.2", "mountain.2.fill": return .views
        case "doc.text", "doc.text.fill", "scroll", "scroll.fill": return .diplomacy
        case "flag", "flag.fill": return .command
        case "house", "house.fill", "person.3", "person.3.fill": return .house
        case "crown", "crown.fill": return .crown
        case "person.2", "person.2.fill": return .alliance
        case "building.columns", "building.columns.fill": return .polity
        case "book", "book.closed", "book.pages", "character.book.closed.fill": return .chronicle
        case "chart.bar", "chart.bar.fill", "chart.bar.xaxis", "list.number": return .ranking
        case "banknote", "dollarsign.circle": return .economy
        case "shippingbox", "shippingbox.fill": return .goods
        case "square.grid.3x3", "square.grid.3x3.fill": return .region
        case "sun.max", "sun.max.fill": return .religion
        case "heart", "heart.circle": return .marriage
        case "seal": return .edict
        default: return nil
        }
    }
    var body: some View {
        HStack(spacing: 7) {
            if let g = Self.glyph(for: symbol) { InkIcon(glyph: g, size: 17, weight: 1.65) }
            else { Image(systemName: symbol).font(.system(size: 16, weight: .regular)) }
            Text(title)
        }
    }
}
