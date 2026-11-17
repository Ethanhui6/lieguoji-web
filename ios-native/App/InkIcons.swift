import SwiftUI

/// One hand-drawn icon set for the whole chrome (bottom tabs and top buttons): the same 24-unit grid,
/// motifs of the period — a gate tower for the state, crossed halberds for the army, a sealed scroll for
/// diplomacy, a bound book for the chronicle, a stepped stand for rankings, layered hills for the map
/// views, a command banner for the box order.
///
/// 笔触：每一笔按毛笔写——起笔略顿、行笔饱满、收笔出锋，闭合的形（印、书、卷）沿边有轻重；底下一层淡墨洇开。
/// 图标换形（开/合、选中/取消）时新笔画由左向右写出，旧的淡去。
enum InkGlyph: String {
    case nation, military, diplomacy, chronicle, ranking, views, command, menu, close
    case sea, plain, mountain, raise, lower, smooth
    /// 战事（顶栏的战争数）：两杆交叉的戈。
    case war
}

struct InkIcon: View {
    let glyph: InkGlyph
    var size: CGFloat = 22
    var weight: CGFloat = 1.7
    var filled = false
    var body: some View {
        let w = weight * size / 22
        ZStack {
            if filled { InkPath(glyph: glyph, fillOnly: true).fill(.tint.opacity(0.18)) }
            // 洇墨：同一笔画放宽、模糊、很淡。
            BrushShape(glyph: glyph, width: w * 1.7).fill(.foreground.opacity(0.16)).blur(radius: w * 0.45)
            BrushShape(glyph: glyph, width: w * 1.25).fill(.foreground)
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
            // 累计长度（定轻重）。
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
                // 斜接：拐角处按夹角放宽，最多两倍。
                let cos = max(0.5, m.x * a.x + m.y * a.y)
                return CGPoint(x: -m.y / cos, y: m.x / cos)
            }
            if run.closed {
                // 闭合的形：沿边轻重起伏（不出锋），外缘与内缘围成一圈。
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
                // 圆头：起笔、收笔各一个与该处笔宽相同的圆。
                for (i, t) in [(0, CGFloat(0)), (n - 1, CGFloat(1))] {
                    let r = width * profile(t) / 2
                    out.addEllipse(in: CGRect(x: pts[i].x - r, y: pts[i].y - r, width: r * 2, height: r * 2))
                }
            }
        }
        return out
    }
}

struct InkPath: Shape {
    let glyph: InkGlyph
    var fillOnly = false
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
            // Gate tower: a sweeping roof, the hall, the gate arch and the wall.
            p.move(to: pt(3, 9)); p.addQuadCurve(to: pt(12, 4), control: pt(8, 8)); p.addQuadCurve(to: pt(21, 9), control: pt(16, 8))
            p.move(to: pt(6, 9)); p.addLine(to: pt(6, 13)); p.addLine(to: pt(18, 13)); p.addLine(to: pt(18, 9))
            p.move(to: pt(3, 20)); p.addLine(to: pt(3, 13)); p.addLine(to: pt(21, 13)); p.addLine(to: pt(21, 20)); p.addLine(to: pt(3, 20))
            p.move(to: pt(9.5, 20)); p.addLine(to: pt(9.5, 17)); p.addQuadCurve(to: pt(14.5, 17), control: pt(12, 14)); p.addLine(to: pt(14.5, 20))
        case .military, .war:
            // Crossed halberds over a shield line.
            p.move(to: pt(4, 20)); p.addLine(to: pt(18, 6)); p.move(to: pt(20, 20)); p.addLine(to: pt(6, 6))
            p.move(to: pt(15, 4)); p.addQuadCurve(to: pt(20, 9), control: pt(20, 4)); p.addLine(to: pt(18, 6))
            p.move(to: pt(9, 4)); p.addQuadCurve(to: pt(4, 9), control: pt(4, 4)); p.addLine(to: pt(6, 6))
            if glyph == .military { p.move(to: pt(9, 15)); p.addLine(to: pt(15, 15)) }
        case .diplomacy:
            // A scroll rolled at both ends, tied with a sealed cord.
            p.addRoundedRect(in: CGRect(origin: pt(5, 4), size: CGSize(width: 14 * k, height: 16 * k)), cornerSize: CGSize(width: 2 * k, height: 2 * k))
            p.move(to: pt(3, 4)); p.addLine(to: pt(21, 4)); p.move(to: pt(3, 20)); p.addLine(to: pt(21, 20))
            p.move(to: pt(8, 9)); p.addLine(to: pt(16, 9)); p.move(to: pt(8, 12)); p.addLine(to: pt(13, 12))
            p.addEllipse(in: CGRect(origin: pt(13, 13.5), size: CGSize(width: 4 * k, height: 4 * k)))
        case .chronicle:
            // A thread-bound book: cover, spine stitches, a title slip.
            p.addRoundedRect(in: CGRect(origin: pt(5, 3), size: CGSize(width: 15 * k, height: 18 * k)), cornerSize: CGSize(width: 1.5 * k, height: 1.5 * k))
            for y in [6.0, 10.5, 15.0, 19.0] { p.move(to: pt(5, CGFloat(y))); p.addLine(to: pt(8, CGFloat(y))) }
            p.move(to: pt(8, 3)); p.addLine(to: pt(8, 21))
            p.addRect(CGRect(origin: pt(12, 6), size: CGSize(width: 4 * k, height: 9 * k)))
        case .ranking:
            // A stepped stand: second, first, third.
            p.move(to: pt(3, 20)); p.addLine(to: pt(21, 20))
            p.addRect(CGRect(origin: pt(4, 12), size: CGSize(width: 5 * k, height: 8 * k)))
            p.addRect(CGRect(origin: pt(9.5, 7), size: CGSize(width: 5 * k, height: 13 * k)))
            p.addRect(CGRect(origin: pt(15, 14), size: CGSize(width: 5 * k, height: 6 * k)))
            p.move(to: pt(12, 2.5)); p.addLine(to: pt(12, 4.5))
        case .views:
            // Layered hills under a sun: the map's faces.
            p.move(to: pt(2, 19)); p.addQuadCurve(to: pt(10, 9), control: pt(6, 9)); p.addQuadCurve(to: pt(16, 15), control: pt(13, 10))
            p.move(to: pt(11, 19)); p.addQuadCurve(to: pt(17, 12), control: pt(14, 12)); p.addQuadCurve(to: pt(22, 19), control: pt(20, 12))
            p.move(to: pt(2, 19)); p.addLine(to: pt(22, 19))
            p.addEllipse(in: CGRect(origin: pt(16, 3), size: CGSize(width: 4 * k, height: 4 * k)))
        case .command:
            // A command banner on its pole over a dashed field.
            p.move(to: pt(7, 21)); p.addLine(to: pt(7, 3))
            p.move(to: pt(7, 4)); p.addLine(to: pt(18, 4)); p.addLine(to: pt(15, 7.5)); p.addLine(to: pt(18, 11)); p.addLine(to: pt(7, 11))
            for x in stride(from: 3.0, to: 22.0, by: 4.0) { p.move(to: pt(CGFloat(x), 21)); p.addLine(to: pt(CGFloat(x) + 2, 21)) }
        case .menu:
            p.move(to: pt(5, 7)); p.addLine(to: pt(19, 7)); p.move(to: pt(5, 12)); p.addLine(to: pt(16, 12)); p.move(to: pt(5, 17)); p.addLine(to: pt(19, 17))
        case .close:
            p.move(to: pt(6, 6)); p.addLine(to: pt(18, 18)); p.move(to: pt(18, 6)); p.addLine(to: pt(6, 18))
        }
        return fillOnly ? Path(p.boundingRect) : p
    }
}

/// Gameplay symbols share the navigation glyphs; utility actions keep familiar system symbols.
struct GameActionLabel: View {
    let title: String
    let symbol: String
    private var glyph: InkGlyph? {
        switch symbol {
        case "flag.2.crossed": return .military
        case "map", "mountain.2": return .views
        case "doc.text", "scroll", "scroll.fill": return .diplomacy
        case "flag", "flag.fill": return .command
        default: return nil
        }
    }
    var body: some View {
        HStack(spacing: 8) {
            Group {
                if let glyph { InkIcon(glyph: glyph, size: 20) }
                else { Image(systemName: symbol).font(.system(size: 18, weight: .medium)) }
            }.frame(width: 22, height: 22).accessibilityHidden(true)
            Text(title).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
        }
    }
}
