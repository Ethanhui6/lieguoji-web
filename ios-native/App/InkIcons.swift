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
    // 2.0.2 补全高频水墨功能图标（定位、回放、倒放、步进、检索、设置、重绘、卷宗、导入、画笔、要塞、锚泊、烽火、撤军、行军）
    case locate, replay, rewind, stepBack, stepForward
    case search, settings, refresh, archive, importSave
    case brush, fortress, anchor, fire, retreat, march
    // 2.5.0 全量补齐手绘水墨图标（湖泊、群岛、增减、废除、交换、显隐、历法、封存、导出、壁纸、丝竹、时速、爵杯、人物、偃兵）
    case lake, island, plus, minus, trash, swap, eye, calendar
    case save, export, wallpaper, sound, speed, trophy, person, peace
    // 2.8.3 补齐折叠与机巧符号（下展、右进、机巧推演），消除 SF Symbol 混搭
    case chevronDown, chevronRight, computer
    // 4.2.6 地形工坊 12 枚独立规范矢量图标（深海、丘陵、高原、雪峰独立成符，告别复用雷同）
    case trench, hill, plateau, peak
}

struct InkIcon: View {
    let glyph: InkGlyph
    var size: CGFloat = 20
    var weight: CGFloat = 1.7
    var filled = false
    /// 保留参数以兼容旧调用位；新中式极简规范下功能图标严格保持单色 Phosphor light/fill，不叠廉价双色晕块。
    var accent: Color? = nil
    /// 地形工坊 12 枚定制地貌笔刷保留统一线宽矢量模式；其余全部功能 UI 图标统一走官方 Phosphor Icons。
    var crisp = false

    private var phosphorGlyph: PhosphorGlyph? {
        switch glyph {
        case .nation: return .nation
        case .military: return .military
        case .diplomacy: return .diplomacy
        case .chronicle: return .chronicle
        case .ranking: return .ranking
        case .views: return .views
        case .command: return .command
        case .menu: return .menu
        case .close: return .close
        case .war: return .war
        case .house: return .house
        case .crown: return .crown
        case .alliance: return .alliance
        case .culture: return .culture
        case .religion: return .religion
        case .polity: return .polity
        case .economy: return .economy
        case .goods: return .goods
        case .region: return .region
        case .play: return .play
        case .pause: return .pause
        case .marriage: return .marriage
        case .edict: return .edict
        case .locate: return .locate
        case .replay: return .replay
        case .rewind: return .rewind
        case .stepBack: return .stepBack
        case .stepForward: return .stepForward
        case .search: return .search
        case .settings: return .settings
        case .refresh: return .refresh
        case .archive: return .archive
        case .importSave: return .importSave
        case .brush: return .brush
        case .fortress: return .fortress
        case .anchor: return .anchor
        case .fire: return .fire
        case .retreat: return .retreat
        case .march: return .march
        case .plus: return .plus
        case .minus: return .minus
        case .trash: return .trash
        case .swap: return .swap
        case .eye: return .eye
        case .calendar: return .calendar
        case .save: return .save
        case .export: return .export
        case .wallpaper: return .wallpaper
        case .sound: return .sound
        case .speed: return .speed
        case .trophy: return .trophy
        case .person: return .person
        case .peace: return .peace
        case .chevronDown: return .chevronDown
        case .chevronRight: return .chevronRight
        case .computer: return .computer
        // 地形工坊 12 枚专用几何地貌笔刷保留既有规范矢量路径
        case .sea, .trench, .lake, .plain, .hill, .plateau, .mountain, .peak, .island, .raise, .lower, .smooth:
            return nil
        }
    }

    var body: some View {
        if let pg = phosphorGlyph {
            PhosphorIcon(glyph: pg, size: size, weight: filled ? .fill : .light)
        } else {
            let scaleBoost: CGFloat = size <= 16 ? 1.12 : 1.0
            let w = weight * (size / 22) * scaleBoost
            ZStack {
                if let accent {
                    InkAccentPath(glyph: glyph).fill(accent)
                }
                InkPath(glyph: glyph)
                    .stroke(.foreground, style: StrokeStyle(lineWidth: max(1.25, w * 1.04), lineCap: .round, lineJoin: .round))
            }
            .frame(width: size, height: size)
        }
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
        case .locate:
            p.addEllipse(in: CGRect(origin: pt(9.8, 9.8), size: CGSize(width: 4.4 * k, height: 4.4 * k)))
        case .replay:
            p.addEllipse(in: CGRect(origin: pt(9.6, 9.6), size: CGSize(width: 4.8 * k, height: 4.8 * k)))
        case .rewind:
            p.move(to: pt(12.2, 6.4)); p.addLine(to: pt(4.6, 12.0)); p.addLine(to: pt(12.2, 17.6)); p.closeSubpath()
            p.move(to: pt(19.4, 6.4)); p.addLine(to: pt(11.8, 12.0)); p.addLine(to: pt(19.4, 17.6)); p.closeSubpath()
        case .stepBack:
            p.move(to: pt(18.5, 6.0)); p.addLine(to: pt(9.5, 12.0)); p.addLine(to: pt(18.5, 18.0)); p.closeSubpath()
        case .stepForward:
            p.move(to: pt(5.5, 6.0)); p.addLine(to: pt(14.5, 12.0)); p.addLine(to: pt(5.5, 18.0)); p.closeSubpath()
        case .fortress:
            p.move(to: pt(12, 5.0)); p.addLine(to: pt(18.2, 7.6)); p.addLine(to: pt(17.2, 14.2)); p.addQuadCurve(to: pt(12, 19.6), control: pt(15.2, 17.8))
            p.addQuadCurve(to: pt(6.8, 14.2), control: pt(8.8, 17.8)); p.addLine(to: pt(5.8, 7.6)); p.closeSubpath()
        case .fire:
            p.move(to: pt(12, 7.2)); p.addQuadCurve(to: pt(16.4, 14.6), control: pt(17.4, 11.2)); p.addQuadCurve(to: pt(12, 19.4), control: pt(15.5, 18.8))
            p.addQuadCurve(to: pt(7.6, 14.6), control: pt(8.5, 18.8)); p.addQuadCurve(to: pt(12, 7.2), control: pt(6.6, 11.2)); p.closeSubpath()
        case .archive:
            p.addRoundedRect(in: CGRect(origin: pt(9.8, 5.2), size: CGSize(width: 4.4 * k, height: 14.4 * k)), cornerSize: CGSize(width: 0.8 * k, height: 0.8 * k))
        case .trench:
            // 深海渊谷底色面
            p.move(to: pt(4.0, 14.2)); p.addLine(to: pt(9.0, 14.2)); p.addLine(to: pt(12.0, 19.6))
            p.addLine(to: pt(15.0, 14.2)); p.addLine(to: pt(20.0, 14.2))
            p.addLine(to: pt(20.0, 20.2)); p.addLine(to: pt(4.0, 20.2)); p.closeSubpath()
        case .sea:
            // 浅海微澜水色带
            p.move(to: pt(3.6, 14.4)); p.addCurve(to: pt(20.4, 14.4), control1: pt(9.0, 11.4), control2: pt(15.0, 17.4))
            p.addLine(to: pt(20.4, 19.2)); p.addLine(to: pt(3.6, 19.2)); p.closeSubpath()
        case .lake:
            // 内湖盆地水镜面
            p.move(to: pt(5.0, 12.6)); p.addLine(to: pt(19.0, 12.6))
            p.addQuadCurve(to: pt(12.0, 18.4), control: pt(18.6, 18.2))
            p.addQuadCurve(to: pt(5.0, 12.6), control: pt(5.4, 18.2)); p.closeSubpath()
        case .plain:
            // 沃野平川微坡面
            p.move(to: pt(3.4, 17.2)); p.addQuadCurve(to: pt(20.6, 17.2), control: pt(12.0, 14.6))
            p.addLine(to: pt(20.6, 20.0)); p.addLine(to: pt(3.4, 20.0)); p.closeSubpath()
        case .hill:
            // 丘陵双穹润坡面
            p.move(to: pt(3.2, 18.6)); p.addQuadCurve(to: pt(13.6, 18.6), control: pt(8.4, 10.6)); p.closeSubpath()
            p.move(to: pt(10.0, 18.6)); p.addQuadCurve(to: pt(20.8, 18.6), control: pt(15.6, 8.2)); p.closeSubpath()
        case .plateau:
            // 高原平顶台地面
            p.move(to: pt(4.2, 18.6)); p.addLine(to: pt(7.6, 9.0)); p.addLine(to: pt(16.4, 9.0)); p.addLine(to: pt(19.8, 18.6)); p.closeSubpath()
        case .mountain:
            // 连绵山脉主峰影
            p.move(to: pt(3.2, 19.0)); p.addLine(to: pt(9.8, 6.4)); p.addLine(to: pt(15.6, 19.0)); p.closeSubpath()
        case .peak:
            // 雪峰洁白积雪顶冠（折齿雪线之上）
            p.move(to: pt(12.0, 4.4)); p.addLine(to: pt(15.4, 11.0))
            p.addLine(to: pt(13.6, 10.0)); p.addLine(to: pt(12.0, 11.8))
            p.addLine(to: pt(10.4, 10.0)); p.addLine(to: pt(8.6, 11.0)); p.closeSubpath()
        case .island:
            // 群岛双屿轮廓面
            p.move(to: pt(4.4, 15.2)); p.addQuadCurve(to: pt(12.2, 15.2), control: pt(8.3, 9.2)); p.closeSubpath()
            p.move(to: pt(13.2, 13.6)); p.addQuadCurve(to: pt(19.4, 13.6), control: pt(16.3, 8.8)); p.closeSubpath()
        case .trophy:
            p.move(to: pt(7.2, 6.2)); p.addLine(to: pt(16.8, 6.2)); p.addQuadCurve(to: pt(12, 13.8), control: pt(16.2, 12.2))
            p.addQuadCurve(to: pt(7.2, 6.2), control: pt(7.8, 12.2)); p.closeSubpath()
        case .eye:
            p.addEllipse(in: CGRect(origin: pt(9.8, 9.8), size: CGSize(width: 4.4 * k, height: 4.4 * k)))
        case .wallpaper:
            p.addEllipse(in: CGRect(origin: pt(14.5, 6.8), size: CGSize(width: 2.8 * k, height: 2.8 * k)))
        case .computer:
            p.addRoundedRect(in: CGRect(origin: pt(7.0, 7.6), size: CGSize(width: 10.0 * k, height: 6.2 * k)), cornerSize: CGSize(width: 1.2 * k, height: 1.2 * k))
        case .raise, .lower, .smooth, .menu, .close,
             .search, .settings, .refresh, .importSave, .brush, .anchor, .retreat, .march,
             .plus, .minus, .trash, .swap, .calendar, .save, .export, .sound, .speed, .person, .peace,
             .chevronDown, .chevronRight:
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
        case .trench:
            // 深海：上方双层重浪 + 下方深邃海沟 V 谷，一眼辨深渊。
            p.move(to: pt(3.6, 6.8)); p.addCurve(to: pt(20.4, 6.8), control1: pt(8.6, 3.8), control2: pt(15.4, 9.8))
            p.move(to: pt(3.6, 11.2)); p.addCurve(to: pt(20.4, 11.2), control1: pt(8.6, 8.2), control2: pt(15.4, 14.2))
            p.move(to: pt(3.6, 15.2)); p.addLine(to: pt(8.6, 15.2)); p.addLine(to: pt(12.0, 19.8)); p.addLine(to: pt(15.4, 15.2)); p.addLine(to: pt(20.4, 15.2))
        case .sea:
            // 浅海：两道轻盈舒缓海波 + 浅滩水纹，明快轻灵。
            p.move(to: pt(3.6, 9.4)); p.addCurve(to: pt(20.4, 9.4), control1: pt(8.8, 6.2), control2: pt(15.2, 12.6))
            p.move(to: pt(3.6, 14.6)); p.addCurve(to: pt(20.4, 14.6), control1: pt(8.8, 11.4), control2: pt(15.2, 17.8))
            p.move(to: pt(8.2, 18.8)); p.addLine(to: pt(15.8, 18.8))
        case .plain:
            // 平原：舒展层叠平川弧线 + 远野两株纤巧禾苗（疏朗不糊团）。
            p.move(to: pt(3.4, 18.4)); p.addQuadCurve(to: pt(20.6, 18.4), control: pt(12.0, 15.6))
            p.move(to: pt(4.6, 14.0)); p.addQuadCurve(to: pt(19.4, 14.0), control: pt(12.0, 12.0))
            p.move(to: pt(9.0, 13.0)); p.addLine(to: pt(9.0, 7.0))
            p.move(to: pt(9.0, 9.6)); p.addQuadCurve(to: pt(6.2, 7.6), control: pt(7.2, 9.4))
            p.move(to: pt(15.0, 13.0)); p.addLine(to: pt(15.0, 8.2))
            p.move(to: pt(15.0, 10.6)); p.addQuadCurve(to: pt(17.8, 8.6), control: pt(16.8, 10.4))
        case .hill:
            // 丘陵：左右交错两座柔缓圆丘（圆润穹顶 + 坡腰等高轻弧）。
            p.move(to: pt(3.2, 18.6)); p.addQuadCurve(to: pt(14.0, 18.6), control: pt(8.6, 9.6))
            p.move(to: pt(9.6, 18.6)); p.addQuadCurve(to: pt(20.8, 18.6), control: pt(15.4, 7.2))
            p.move(to: pt(3.2, 18.6)); p.addLine(to: pt(20.8, 18.6))
            p.move(to: pt(13.2, 14.6)); p.addQuadCurve(to: pt(17.6, 14.6), control: pt(15.4, 12.8))
        case .plateau:
            // 高原：平整桌状台地（宽阔平顶 + 两侧峻崖 + 岩层横纹），与圆润丘陵截然不同。
            p.move(to: pt(3.2, 18.6)); p.addLine(to: pt(4.6, 18.6)); p.addLine(to: pt(7.6, 8.8)); p.addLine(to: pt(16.4, 8.8)); p.addLine(to: pt(19.4, 18.6)); p.addLine(to: pt(20.8, 18.6))
            p.move(to: pt(4.6, 18.6)); p.addLine(to: pt(19.4, 18.6))
            p.move(to: pt(8.2, 13.0)); p.addLine(to: pt(15.8, 13.0))
            p.move(to: pt(7.0, 16.0)); p.addLine(to: pt(17.0, 16.0))
        case .mountain:
            // 山脉：三座苍劲连绵尖峰，山脊棱线交错。
            p.move(to: pt(3.0, 19.0)); p.addLine(to: pt(9.2, 6.6)); p.addLine(to: pt(15.4, 19.0))
            p.move(to: pt(12.8, 13.8)); p.addLine(to: pt(16.4, 9.2)); p.addLine(to: pt(21.0, 19.0))
            p.move(to: pt(3.0, 19.0)); p.addLine(to: pt(21.0, 19.0))
            p.move(to: pt(9.2, 6.6)); p.addLine(to: pt(10.6, 13.4))
        case .peak:
            // 雪峰：巍峨高耸孤峰主巅 + 清晰折齿雪线（峰冠留白映雪）。
            p.move(to: pt(3.4, 19.2)); p.addLine(to: pt(12.0, 4.4)); p.addLine(to: pt(20.6, 19.2)); p.closeSubpath()
            p.move(to: pt(8.6, 11.0)); p.addLine(to: pt(10.4, 10.0)); p.addLine(to: pt(12.0, 11.8)); p.addLine(to: pt(13.6, 10.0)); p.addLine(to: pt(15.4, 11.0))
        case .raise, .lower:
            // 抬高 / 压低：严格镜像对称的基准地线 + 挺拔方向矢 + 地形弧线。
            let up = glyph == .raise
            let baseY: CGFloat = up ? 19.0 : 5.2
            p.move(to: pt(4.4, baseY)); p.addLine(to: pt(19.6, baseY))
            p.move(to: pt(12.0, up ? 5.0 : 19.0)); p.addLine(to: pt(12.0, up ? 15.4 : 8.6))
            let tipY: CGFloat = up ? 5.0 : 19.0
            let wingY: CGFloat = up ? 9.8 : 14.2
            p.move(to: pt(7.6, wingY)); p.addLine(to: pt(12.0, tipY)); p.addLine(to: pt(16.4, wingY))
        case .smooth:
            // 平滑：柔和连续单波曲线 + 平顺基线，统一极简几何语汇。
            p.move(to: pt(3.6, 10.4)); p.addCurve(to: pt(20.4, 10.4), control1: pt(8.6, 5.2), control2: pt(15.4, 15.6))
            p.move(to: pt(3.6, 16.8)); p.addLine(to: pt(20.4, 16.8))
            p.move(to: pt(9.0, 19.4)); p.addLine(to: pt(15.0, 19.4))
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
        case .locate:
            // 舆图准星：同心环与四向刻度。
            p.addEllipse(in: CGRect(origin: pt(5.8, 5.8), size: CGSize(width: 12.4 * k, height: 12.4 * k)))
            p.move(to: pt(12, 2.4)); p.addLine(to: pt(12, 6.2))
            p.move(to: pt(12, 17.8)); p.addLine(to: pt(12, 21.6))
            p.move(to: pt(2.4, 12)); p.addLine(to: pt(6.2, 12))
            p.move(to: pt(17.8, 12)); p.addLine(to: pt(21.6, 12))
            p.addEllipse(in: CGRect(origin: pt(10.6, 10.6), size: CGSize(width: 2.8 * k, height: 2.8 * k)))
        case .replay:
            // 山河回溯：逆向时轮与表针。
            p.addArc(center: pt(12, 12), radius: 7.8 * k, startAngle: .degrees(-130), endAngle: .degrees(190), clockwise: false)
            p.move(to: pt(4.4, 6.2)); p.addLine(to: pt(5.2, 10.6)); p.addLine(to: pt(9.6, 9.6))
            p.move(to: pt(12, 7.6)); p.addLine(to: pt(12, 12.2)); p.addLine(to: pt(15.4, 14.0))
        case .rewind:
            // 倒放双刃三角。
            p.move(to: pt(12.2, 6.4)); p.addLine(to: pt(4.6, 12.0)); p.addLine(to: pt(12.2, 17.6)); p.closeSubpath()
            p.move(to: pt(19.4, 6.4)); p.addLine(to: pt(11.8, 12.0)); p.addLine(to: pt(19.4, 17.6)); p.closeSubpath()
        case .stepBack:
            // 单步回退：竖闸加左三角。
            p.move(to: pt(6.2, 6.0)); p.addLine(to: pt(6.2, 18.0))
            p.move(to: pt(18.2, 6.2)); p.addLine(to: pt(9.8, 12.0)); p.addLine(to: pt(18.2, 17.8)); p.closeSubpath()
        case .stepForward:
            // 单步前进：右三角加竖闸。
            p.move(to: pt(5.8, 6.2)); p.addLine(to: pt(14.2, 12.0)); p.addLine(to: pt(5.8, 17.8)); p.closeSubpath()
            p.move(to: pt(17.8, 6.0)); p.addLine(to: pt(17.8, 18.0))
        case .search:
            // 舆图检索镜。
            p.addEllipse(in: CGRect(origin: pt(4.2, 4.2), size: CGSize(width: 11.4 * k, height: 11.4 * k)))
            p.move(to: pt(14.2, 14.2)); p.addLine(to: pt(20.0, 20.0))
        case .settings:
            // 巧匠调尺：三道横轨与滑珠。
            p.move(to: pt(3.5, 6.5)); p.addLine(to: pt(20.5, 6.5))
            p.addEllipse(in: CGRect(origin: pt(7.2, 4.7), size: CGSize(width: 3.6 * k, height: 3.6 * k)))
            p.move(to: pt(3.5, 12.0)); p.addLine(to: pt(20.5, 12.0))
            p.addEllipse(in: CGRect(origin: pt(13.2, 10.2), size: CGSize(width: 3.6 * k, height: 3.6 * k)))
            p.move(to: pt(3.5, 17.5)); p.addLine(to: pt(20.5, 17.5))
            p.addEllipse(in: CGRect(origin: pt(8.5, 15.7), size: CGSize(width: 3.6 * k, height: 3.6 * k)))
        case .refresh:
            // 重绘换图：双弧循环箭。
            p.addArc(center: pt(12, 12), radius: 7.4 * k, startAngle: .degrees(-150), endAngle: .degrees(-20), clockwise: false)
            p.move(to: pt(16.6, 5.2)); p.addLine(to: pt(19.2, 9.2)); p.addLine(to: pt(14.8, 9.6))
            p.addArc(center: pt(12, 12), radius: 7.4 * k, startAngle: .degrees(30), endAngle: .degrees(160), clockwise: false)
            p.move(to: pt(7.4, 18.8)); p.addLine(to: pt(4.8, 14.8)); p.addLine(to: pt(9.2, 14.4))
        case .archive:
            // 典籍书函：三卷立册。
            p.addRoundedRect(in: CGRect(origin: pt(4.0, 4.4), size: CGSize(width: 4.5 * k, height: 15.6 * k)), cornerSize: CGSize(width: 0.9 * k, height: 0.9 * k))
            p.addRoundedRect(in: CGRect(origin: pt(9.8, 4.4), size: CGSize(width: 4.5 * k, height: 15.6 * k)), cornerSize: CGSize(width: 0.9 * k, height: 0.9 * k))
            p.move(to: pt(15.6, 5.2)); p.addLine(to: pt(19.8, 4.4)); p.addLine(to: pt(21.0, 19.6)); p.addLine(to: pt(16.8, 20.2)); p.closeSubpath()
        case .importSave:
            // 纳卷归匣：下落箭与纸匣。
            p.move(to: pt(12, 3.6)); p.addLine(to: pt(12, 14.2))
            p.move(to: pt(8.2, 10.6)); p.addLine(to: pt(12, 14.6)); p.addLine(to: pt(15.8, 10.6))
            p.move(to: pt(4.2, 13.8)); p.addLine(to: pt(4.2, 19.6)); p.addLine(to: pt(19.8, 19.6)); p.addLine(to: pt(19.8, 13.8))
        case .brush:
            // 绘疆画笔：笔杆与饱满笔锋。
            p.move(to: pt(18.8, 4.2)); p.addLine(to: pt(10.0, 13.0))
            p.move(to: pt(10.0, 13.0)); p.addQuadCurve(to: pt(4.2, 19.8), control: pt(5.8, 13.8))
            p.addQuadCurve(to: pt(11.2, 14.2), control: pt(10.2, 18.8))
            p.move(to: pt(14.5, 8.5)); p.addLine(to: pt(16.0, 10.0))
        case .fortress:
            // 关隘盾徽：城垛护盾。
            p.move(to: pt(12, 3.6)); p.addLine(to: pt(19.2, 6.6)); p.addLine(to: pt(18.2, 14.4))
            p.addQuadCurve(to: pt(12, 20.6), control: pt(16.0, 18.4))
            p.addQuadCurve(to: pt(5.8, 14.4), control: pt(8.0, 18.4))
            p.addLine(to: pt(4.8, 6.6)); p.closeSubpath()
            p.move(to: pt(12, 7.6)); p.addLine(to: pt(12, 16.4))
        case .anchor:
            // 海港铁锚。
            p.addEllipse(in: CGRect(origin: pt(9.8, 3.4), size: CGSize(width: 4.4 * k, height: 4.4 * k)))
            p.move(to: pt(12, 7.8)); p.addLine(to: pt(12, 19.8))
            p.move(to: pt(7.2, 11.0)); p.addLine(to: pt(16.8, 11.0))
            p.move(to: pt(5.2, 14.8)); p.addQuadCurve(to: pt(12, 20.2), control: pt(6.4, 20.0))
            p.addQuadCurve(to: pt(18.8, 14.8), control: pt(17.6, 20.0))
        case .fire:
            // 边关烽火。
            p.move(to: pt(12, 3.8)); p.addQuadCurve(to: pt(18.0, 13.8), control: pt(19.2, 9.6))
            p.addQuadCurve(to: pt(12, 20.4), control: pt(17.2, 19.8))
            p.addQuadCurve(to: pt(6.0, 13.8), control: pt(6.8, 19.8))
            p.addQuadCurve(to: pt(12, 3.8), control: pt(4.8, 9.6)); p.closeSubpath()
            p.move(to: pt(12, 11.5)); p.addQuadCurve(to: pt(14.2, 16.4), control: pt(14.8, 14.2))
            p.addQuadCurve(to: pt(9.8, 16.4), control: pt(12, 18.6))
        case .retreat:
            // 鸣金收兵：回折箭。
            p.move(to: pt(9.5, 5.4)); p.addLine(to: pt(4.6, 9.6)); p.addLine(to: pt(9.5, 13.8))
            p.move(to: pt(5.4, 9.6)); p.addLine(to: pt(14.6, 9.6))
            p.addQuadCurve(to: pt(19.2, 14.4), control: pt(19.2, 9.6))
            p.addQuadCurve(to: pt(14.6, 19.2), control: pt(19.2, 19.2))
            p.addLine(to: pt(7.5, 19.2))
        case .march:
            // 行军指路：斜向行军锋箭。
            p.move(to: pt(4.8, 19.2)); p.addLine(to: pt(18.8, 5.2))
            p.move(to: pt(10.8, 5.2)); p.addLine(to: pt(18.8, 5.2)); p.addLine(to: pt(18.8, 13.2))
            p.move(to: pt(4.2, 11.8)); p.addLine(to: pt(8.6, 11.8)); p.addLine(to: pt(8.6, 15.8))
        case .lake:
            // 内湖：岸畔澄湖盆地 + 两道水平明镜细波 + 远山轻弧（彻底告别眼形误读）。
            p.move(to: pt(3.6, 9.6)); p.addQuadCurve(to: pt(9.8, 7.6), control: pt(6.6, 5.6))
            p.addQuadCurve(to: pt(16.6, 9.2), control: pt(13.2, 9.8))
            p.addQuadCurve(to: pt(20.4, 8.4), control: pt(18.6, 6.8))
            p.move(to: pt(4.4, 12.6)); p.addLine(to: pt(19.6, 12.6))
            p.move(to: pt(5.0, 12.6)); p.addQuadCurve(to: pt(12.0, 18.4), control: pt(5.4, 18.2))
            p.addQuadCurve(to: pt(19.0, 12.6), control: pt(18.6, 18.2))
            p.move(to: pt(8.6, 15.2)); p.addLine(to: pt(15.4, 15.2))
        case .island:
            // 群岛：错落双岛礁浮于舒展水波之上，疏朗精致。
            p.move(to: pt(4.4, 15.2)); p.addQuadCurve(to: pt(12.2, 15.2), control: pt(8.3, 9.2)); p.closeSubpath()
            p.move(to: pt(13.2, 13.6)); p.addQuadCurve(to: pt(19.4, 13.6), control: pt(16.3, 8.8)); p.closeSubpath()
            p.move(to: pt(3.4, 18.6)); p.addCurve(to: pt(20.6, 18.6), control1: pt(8.8, 16.0), control2: pt(15.2, 21.0))
        case .plus:
            p.addEllipse(in: CGRect(origin: pt(3.6, 3.6), size: CGSize(width: 16.8 * k, height: 16.8 * k)))
            p.move(to: pt(12, 7.6)); p.addLine(to: pt(12, 16.4))
            p.move(to: pt(7.6, 12)); p.addLine(to: pt(16.4, 12))
        case .minus:
            p.addEllipse(in: CGRect(origin: pt(3.6, 3.6), size: CGSize(width: 16.8 * k, height: 16.8 * k)))
            p.move(to: pt(7.6, 12)); p.addLine(to: pt(16.4, 12))
        case .trash:
            // 废除删削：简牍匣与竖格。
            p.move(to: pt(4.6, 6.8)); p.addLine(to: pt(19.4, 6.8))
            p.move(to: pt(9.2, 4.2)); p.addLine(to: pt(14.8, 4.2))
            p.move(to: pt(6.4, 6.8)); p.addLine(to: pt(7.6, 19.8)); p.addLine(to: pt(16.4, 19.8)); p.addLine(to: pt(17.6, 6.8))
            p.move(to: pt(10.2, 10.2)); p.addLine(to: pt(10.5, 16.6))
            p.move(to: pt(13.8, 10.2)); p.addLine(to: pt(13.5, 16.6))
        case .swap:
            // 易位换防：上下对向双箭。
            p.move(to: pt(4.5, 8.6)); p.addLine(to: pt(19.2, 8.6))
            p.move(to: pt(15.4, 5.2)); p.addLine(to: pt(19.2, 8.6)); p.addLine(to: pt(15.4, 12.0))
            p.move(to: pt(19.5, 15.6)); p.addLine(to: pt(4.8, 15.6))
            p.move(to: pt(8.6, 12.2)); p.addLine(to: pt(4.8, 15.6)); p.addLine(to: pt(8.6, 19.0))
        case .eye:
            // 观图明察：修眉杏目。
            p.move(to: pt(2.8, 12.0)); p.addQuadCurve(to: pt(21.2, 12.0), control: pt(12.0, 5.0))
            p.addQuadCurve(to: pt(2.8, 12.0), control: pt(12.0, 19.0))
            p.addEllipse(in: CGRect(origin: pt(9.4, 9.4), size: CGSize(width: 5.2 * k, height: 5.2 * k)))
        case .calendar:
            // 纪年历书：历牌、挂环与横栏。
            p.addRoundedRect(in: CGRect(origin: pt(4.2, 5.4), size: CGSize(width: 15.6 * k, height: 14.8 * k)), cornerSize: CGSize(width: 2.0 * k, height: 2.0 * k))
            p.move(to: pt(8.4, 3.2)); p.addLine(to: pt(8.4, 7.2))
            p.move(to: pt(15.6, 3.2)); p.addLine(to: pt(15.6, 7.2))
            p.move(to: pt(4.2, 9.8)); p.addLine(to: pt(19.8, 9.8))
            p.move(to: pt(8.2, 13.4)); p.addLine(to: pt(15.8, 13.4))
            p.move(to: pt(8.2, 16.6)); p.addLine(to: pt(13.2, 16.6))
        case .save:
            // 封存秘档：书签封缄。
            p.move(to: pt(6.0, 3.8)); p.addLine(to: pt(18.0, 3.8)); p.addLine(to: pt(18.0, 20.2))
            p.addLine(to: pt(12.0, 16.0)); p.addLine(to: pt(6.0, 20.2)); p.closeSubpath()
            p.move(to: pt(9.2, 9.0)); p.addLine(to: pt(14.8, 9.0))
        case .export:
            // 传抄输出：出匣上箭。
            p.move(to: pt(12, 14.4)); p.addLine(to: pt(12, 3.8))
            p.move(to: pt(8.2, 7.6)); p.addLine(to: pt(12, 3.6)); p.addLine(to: pt(15.8, 7.6))
            p.move(to: pt(4.2, 13.8)); p.addLine(to: pt(4.2, 19.6)); p.addLine(to: pt(19.8, 19.6)); p.addLine(to: pt(19.8, 13.8))
        case .wallpaper:
            // 山水画帧：装裱框、远山与晓日。
            p.addRoundedRect(in: CGRect(origin: pt(3.6, 4.6), size: CGSize(width: 16.8 * k, height: 14.8 * k)), cornerSize: CGSize(width: 2.0 * k, height: 2.0 * k))
            p.move(to: pt(5.0, 17.2)); p.addLine(to: pt(10.0, 11.4)); p.addLine(to: pt(14.2, 15.2)); p.addLine(to: pt(16.6, 12.6)); p.addLine(to: pt(19.0, 17.2))
            p.addEllipse(in: CGRect(origin: pt(14.4, 6.8), size: CGSize(width: 2.8 * k, height: 2.8 * k)))
        case .sound:
            // 编钟清韵：古钟与声波。
            p.move(to: pt(5.2, 10.0)); p.addLine(to: pt(8.6, 10.0)); p.addLine(to: pt(13.4, 6.2)); p.addLine(to: pt(13.4, 17.8)); p.addLine(to: pt(8.6, 14.0)); p.addLine(to: pt(5.2, 14.0)); p.closeSubpath()
            p.addArc(center: pt(14.2, 12.0), radius: 3.4 * k, startAngle: .degrees(-48), endAngle: .degrees(48), clockwise: false)
            p.addArc(center: pt(14.2, 12.0), radius: 6.2 * k, startAngle: .degrees(-52), endAngle: .degrees(52), clockwise: false)
        case .speed:
            // 日晷时速：半圆表盘与斜针。
            p.addArc(center: pt(12.0, 15.5), radius: 8.2 * k, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
            p.move(to: pt(3.8, 15.5)); p.addLine(to: pt(20.2, 15.5))
            p.move(to: pt(12.0, 15.5)); p.addLine(to: pt(16.8, 9.8))
            p.addEllipse(in: CGRect(origin: pt(10.6, 14.1), size: CGSize(width: 2.8 * k, height: 2.8 * k)))
        case .trophy:
            // 礼爵荣耀：青铜礼杯与双耳。
            p.move(to: pt(6.8, 5.2)); p.addLine(to: pt(17.2, 5.2)); p.addQuadCurve(to: pt(12.0, 14.2), control: pt(16.8, 12.4))
            p.addQuadCurve(to: pt(6.8, 5.2), control: pt(7.2, 12.4))
            p.move(to: pt(6.8, 7.2)); p.addQuadCurve(to: pt(5.2, 11.4), control: pt(3.6, 8.6))
            p.move(to: pt(17.2, 7.2)); p.addQuadCurve(to: pt(18.8, 11.4), control: pt(20.4, 8.6))
            p.move(to: pt(12.0, 14.2)); p.addLine(to: pt(12.0, 18.8))
            p.move(to: pt(8.0, 19.2)); p.addLine(to: pt(16.0, 19.2))
        case .person:
            // 儒生立像：首冠与拱袖肩线。
            p.addEllipse(in: CGRect(origin: pt(8.6, 4.0), size: CGSize(width: 6.8 * k, height: 6.8 * k)))
            p.move(to: pt(4.8, 20.0)); p.addQuadCurve(to: pt(12.0, 13.4), control: pt(5.4, 14.2))
            p.addQuadCurve(to: pt(19.2, 20.0), control: pt(18.6, 14.2))
        case .peace:
            // 偃兵止戈：翠枝双叶。
            p.move(to: pt(5.0, 19.2)); p.addQuadCurve(to: pt(18.8, 5.0), control: pt(10.5, 11.5))
            p.move(to: pt(10.8, 13.4)); p.addQuadCurve(to: pt(16.8, 12.6), control: pt(14.0, 15.8))
            p.move(to: pt(13.6, 10.4)); p.addQuadCurve(to: pt(11.6, 4.6), control: pt(16.0, 7.2))
        case .chevronDown:
            // 墨笔下展折锋。
            p.move(to: pt(5.6, 9.2)); p.addLine(to: pt(12.0, 15.6)); p.addLine(to: pt(18.4, 9.2))
        case .chevronRight:
            // 墨笔右进折锋。
            p.move(to: pt(9.2, 5.6)); p.addLine(to: pt(15.6, 12.0)); p.addLine(to: pt(9.2, 18.4))
        case .computer:
            // 算筹屏案：案屏与底座。
            p.addRoundedRect(in: CGRect(origin: pt(4.2, 5.0), size: CGSize(width: 15.6 * k, height: 11.0 * k)), cornerSize: CGSize(width: 2.0 * k, height: 2.0 * k))
            p.move(to: pt(12.0, 16.0)); p.addLine(to: pt(12.0, 19.2))
            p.move(to: pt(7.6, 19.2)); p.addLine(to: pt(16.4, 19.2))
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
        case "map", "mountain.2", "mountain.2.fill", "globe.asia.australia": return .views
        case "doc.text", "doc.text.fill", "scroll", "scroll.fill", "doc.text.magnifyingglass": return .diplomacy
        case "flag", "flag.fill": return .command
        case "house", "house.fill", "person.3", "person.3.fill", "person.3.sequence": return .house
        case "crown", "crown.fill": return .crown
        case "person.2", "person.2.fill": return .alliance
        case "building.columns", "building.columns.fill", "building.2": return .polity
        case "book", "book.closed", "book.pages", "character.book.closed", "character.book.closed.fill", "text.book.closed", "list.bullet.rectangle", "textformat": return .chronicle
        case "chart.bar", "chart.bar.fill", "chart.bar.xaxis", "list.number", "chart.line.uptrend.xyaxis": return .ranking
        case "banknote", "dollarsign.circle": return .economy
        case "shippingbox", "shippingbox.fill": return .goods
        case "square.grid.3x3", "square.grid.3x3.fill", "square.grid.2x2", "square.dashed", "plus.square.dashed": return .region
        case "sun.max", "sun.max.fill", "hands.sparkles", "sparkle": return .religion
        case "heart", "heart.circle": return .marriage
        case "seal", "checkmark.seal", "checkmark.circle.fill": return .edict
        case "scope", "location", "mappin", "mappin.and.ellipse", "star", "star.fill", "hand.tap": return .locate
        case "clock.arrow.circlepath", "arrow.counterclockwise", "arrow.counterclockwise.circle", "arrow.counterclockwise.circle.fill": return .replay
        case "backward", "backward.fill": return .rewind
        case "backward.frame.fill", "backward.end.fill": return .stepBack
        case "forward.frame.fill", "forward.end.fill": return .stepForward
        case "play", "play.fill": return .play
        case "pause", "pause.fill": return .pause
        case "magnifyingglass": return .search
        case "slider.horizontal.3", "gearshape", "gearshape.fill", "gearshape.2": return .settings
        case "arrow.triangle.2.circlepath", "arrow.clockwise", "dice", "dice.fill": return .refresh
        case "books.vertical", "books.vertical.fill", "folder", "folder.fill", "archivebox": return .archive
        case "tray.and.arrow.down", "square.and.arrow.down", "doc.badge.plus": return .importSave
        case "paintbrush.pointed", "paintbrush.pointed.fill", "paintbrush", "pencil", "pencil.line", "paintpalette", "scribble": return .brush
        case "shield", "shield.fill", "shield.lefthalf.filled", "exclamationmark.shield", "lock": return .fortress
        case "anchor", "ferry", "ferry.fill", "sailboat", "sailboat.fill": return .anchor
        case "flame", "flame.fill", "bolt", "allergens", "drop.degreesign.slash": return .fire
        case "arrow.uturn.backward", "arrow.uturn.left": return .retreat
        case "arrow.triangle.turn.up.right.diamond", "arrow.up.right", "figure.walk": return .march
        case "drop", "drop.fill", "water.waves": return .lake
        case "circle.hexagongrid", "sparkles", "aqi.medium", "moon.stars": return .religion
        case "plus", "plus.circle", "plus.circle.fill", "person.badge.plus": return .plus
        case "minus", "minus.circle", "person.badge.minus", "person.2.slash", "person.fill.xmark": return .minus
        case "trash", "trash.fill", "xmark.bin", "eraser", "hammer", "xmark.octagon", "xmark.shield": return .trash
        case "arrow.left.arrow.right", "arrow.2.squarepath", "square.stack.3d.up", "link.badge.plus", "rectangle.portrait.and.arrow.right", "arrow.triangle.merge": return .swap
        case "eye", "eye.fill", "eye.slash": return .eye
        case "calendar", "calendar.badge.clock", "clock", "clock.fill": return .calendar
        case "bookmark", "bookmark.fill", "opticaldisc", "tray.full": return .save
        case "square.and.arrow.up", "arrow.up.doc": return .export
        case "photo", "photo.artframe", "photo.on.rectangle", "camera": return .wallpaper
        case "speaker.wave.2", "speaker.wave.2.fill", "music.note": return .sound
        case "gauge.with.dots.needle.67percent", "speedometer", "bolt.fill", "hare", "tortoise", "cloud.bolt": return .speed
        case "trophy", "trophy.fill", "medal": return .trophy
        case "person", "person.fill", "person.crop.circle", "person.text.rectangle", "person.badge.shield.checkmark": return .person
        case "leaf", "leaf.fill", "leaf.circle", "hand.raised", "hand.raised.fill", "peace", "cross.case": return .peace
        case "chevron.down", "chevron.compact.down": return .chevronDown
        case "chevron.right", "chevron.compact.right": return .chevronRight
        case "desktopcomputer", "laptopcomputer", "cpu": return .computer
        case "bolt.shield", "lock.shield": return .military
        case "hand.draw": return .brush
        case "arrow.down.to.line": return .march
        case "list.bullet": return .ranking
        case "lock.open", "lock.open.display": return .fortress
        case "arrow.uturn.backward.circle": return .replay
        case "megaphone": return .fire
        default: return nil
        }
    }
    var body: some View {
        HStack(spacing: 7) {
            InkIcon(glyph: Self.glyph(for: symbol) ?? .edict, size: 17, weight: 1.65)
            Text(title)
        }
    }
}
