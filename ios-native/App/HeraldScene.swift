import SwiftUI
import LieguojiCore

/// 大事传报：一卷纸从中间向两侧展开，画面讲事情，文字只作注脚。
/// - 宣战：两国国色的燕尾旗从卷轴两端擎出、迎风招展；中间两杆长戈一笔一笔写出、交叉，交点溅开一团朱墨。
/// - 议和：两旗相向靠拢，一条青绿的绶带从一杆系到另一杆，中间一枚玉璧。
/// - 攻克：一面旗从天而降插在城头，国色在纸上洇开。
/// - 起义：三簇火苗在纸上跳动；复辟：一轮日自纸面升起；绝嗣：一面旗褪色倒下；迁都：一座城楼的笔画写出。
/// 节奏：0–0.45 秒展卷，0.35–0.8 秒旗出，0.6–1.0 秒主画面，1.0 秒后注脚淡入；GameModel 按类型留够时长后收起。
struct HeraldBanner: View {
    let herald: GameModel.Herald
    let map: WorldMap
    @State private var start = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private func color(_ n: Int) -> Color { map.meta.nations.indices.contains(n) ? Names.color(map.meta.nations[n].color) : Theme.ink2 }
    private func name(_ n: Int) -> String { map.meta.nations.indices.contains(n) ? map.meta.nations[n].name : "" }
    private var accent: Color {
        switch herald.kind {
        case .war, .uprising: return Theme.seal
        case .peace, .capital: return Theme.jade
        case .restoration: return Color(red: 0.72, green: 0.52, blue: 0.2)
        case .capture, .extinction: return Theme.ink
        }
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion)) { context in
            let t = reduceMotion ? 3 : context.date.timeIntervalSince(start)
            scene(t)
        }
        .frame(maxWidth: 440).frame(height: 116)
        .padding(.horizontal, 14)
        .onAppear { start = Date() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(herald.text)
    }

    private static func ease(_ x: Double) -> Double { let t = min(1, max(0, x)); return t * t * (3 - 2 * t) }
    private static func span(_ t: Double, _ a: Double, _ b: Double) -> Double { ease((t - a) / (b - a)) }

    @ViewBuilder private func scene(_ t: Double) -> some View {
        let unroll = Self.span(t, 0, 0.45)
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            let paperW = max(24, w * (0.08 + 0.92 * unroll))
            ZStack {
                // 纸卷：纸面、两端卷轴。
                RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Theme.paper2)
                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Theme.ink.opacity(0.12), lineWidth: 0.8))
                    .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(accent.opacity(0.28), lineWidth: 0.8).padding(5))
                    .shadow(color: Theme.ink.opacity(0.18), radius: 8, y: 3)
                    .frame(width: paperW, height: h - 8)
                ForEach([-1.0, 1.0], id: \.self) { side in
                    Capsule().fill(LinearGradient(colors: [Color(red: 0.33, green: 0.22, blue: 0.14), Color(red: 0.52, green: 0.36, blue: 0.22), Color(red: 0.3, green: 0.2, blue: 0.12)], startPoint: .leading, endPoint: .trailing))
                        .frame(width: 9, height: h)
                        .offset(x: side * (paperW / 2 + 2))
                }
                // 画面。
                Canvas { ctx, size in draw(ctx, size: size, t: t) }
                    .frame(width: paperW - 16, height: h - 8)
                    .clipped()
                // 注脚：双方国名与一句事由。
                captions(t, width: paperW)
            }
            .frame(width: w, height: h)
        }
    }

    @ViewBuilder private func captions(_ t: Double, width: CGFloat) -> some View {
        let names = Self.span(t, 0.75, 1.1), line = Self.span(t, 1.0, 1.4)
        VStack(spacing: 2) {
            Spacer(minLength: 0)
            Text(herald.text).font(Theme.kai(14)).foregroundStyle(Theme.ink2).lineLimit(1).minimumScaleFactor(0.7)
                .opacity(line).offset(y: (1 - line) * 4)
                .padding(.horizontal, 22)
        }
        .padding(.bottom, 10)
        .frame(width: width)
        .overlay(alignment: .top) {
            if herald.nations.count >= 2 {
                HStack {
                    Text(name(herald.nations[0])).font(Theme.kai(17)).foregroundStyle(Theme.ink)
                    Spacer()
                    Text(name(herald.nations[1])).font(Theme.kai(17)).foregroundStyle(Theme.ink)
                }
                .lineLimit(1).minimumScaleFactor(0.6)
                .padding(.horizontal, 70).padding(.top, 14)
                .opacity(names)
            } else if herald.nations.count == 1 {
                Text(name(herald.nations[0])).font(Theme.kai(17)).foregroundStyle(Theme.ink).padding(.top, 14).opacity(names)
                    .offset(x: 46)
            }
        }
    }

    // MARK: 画面

    private func draw(_ ctx: GraphicsContext, size: CGSize, t: Double) {
        let cx = size.width / 2, base = size.height * 0.78
        let flags = Self.span(t, 0.35, 0.8)
        switch herald.kind {
        case .war:
            let a = herald.nations.first.map(color) ?? Theme.seal, b = herald.nations.dropFirst().first.map(color) ?? Theme.ink2
            pennant(ctx, x: 28 + (1 - flags) * -30, base: base, color: a, t: t, facing: 1, alpha: flags)
            pennant(ctx, x: size.width - 28 + (1 - flags) * 30, base: base, color: b, t: t, facing: -1, alpha: flags)
            halberds(ctx, cx: cx, base: base, t: t)
            splash(ctx, at: CGPoint(x: cx, y: base - 30), t: t, start: 0.98, color: Theme.seal)
        case .peace:
            let a = herald.nations.first.map(color) ?? Theme.jade, b = herald.nations.dropFirst().first.map(color) ?? Theme.jade
            let close = Self.span(t, 0.5, 1.1) * 18
            pennant(ctx, x: 30 + close + (1 - flags) * -30, base: base, color: a, t: t, facing: 1, alpha: flags)
            pennant(ctx, x: size.width - 30 - close + (1 - flags) * 30, base: base, color: b, t: t, facing: -1, alpha: flags)
            ribbon(ctx, from: CGPoint(x: 30 + close, y: base - 40), to: CGPoint(x: size.width - 30 - close, y: base - 40), t: t)
        case .capture:
            let c = herald.nations.first.map(color) ?? Theme.ink
            let drop = Self.span(t, 0.4, 0.75)
            spread(ctx, at: CGPoint(x: cx - 46, y: base - 18), t: t, start: 0.7, color: c)
            pennant(ctx, x: cx - 46, base: base - (1 - drop) * 60, color: c, t: t, facing: 1, alpha: drop)
        case .uprising:
            for (i, x) in [cx - 70, cx - 46, cx - 22].enumerated() { flame(ctx, at: CGPoint(x: x, y: base - 6), t: t, start: 0.4 + Double(i) * 0.12, scale: i == 1 ? 1.2 : 0.9) }
        case .restoration:
            sunrise(ctx, at: CGPoint(x: cx - 46, y: base), t: t)
        case .extinction:
            let fall = Self.span(t, 0.7, 1.6)
            var c = ctx; c.opacity = 1 - 0.6 * fall
            c.translateBy(x: cx - 46, y: base); c.rotate(by: .radians(fall * 1.1)); c.translateBy(x: -(cx - 46), y: -base)
            pennant(c, x: cx - 46, base: base, color: Theme.ink2, t: t * (1 - fall), facing: 1, alpha: flags)
        case .capital:
            var c = ctx; c.translateBy(x: cx - 66, y: base - 46)
            let p = InkPath(glyph: .nation).path(in: CGRect(x: 0, y: 0, width: 40, height: 40))
            c.stroke(p.trimmedPath(from: 0, to: Self.span(t, 0.4, 1.1)), with: .color(Theme.jade), style: StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round))
        }
    }

    /// 燕尾旗：旗杆、旗面（随风起伏，越近旗尾摆得越大）、杆头一点。facing：旗面朝向（1 向右）。
    private func pennant(_ ctx: GraphicsContext, x: CGFloat, base: CGFloat, color: Color, t: Double, facing: CGFloat, alpha: Double) {
        guard alpha > 0.01 else { return }
        var c = ctx; c.opacity = alpha
        let top = base - 58
        var pole = Path(); pole.move(to: CGPoint(x: x, y: base)); pole.addLine(to: CGPoint(x: x, y: top))
        c.stroke(pole, with: .color(Color(red: 0.3, green: 0.2, blue: 0.12)), style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
        c.fill(Path(ellipseIn: CGRect(x: x - 2.6, y: top - 3, width: 5.2, height: 5.2)), with: .color(Color(red: 0.62, green: 0.48, blue: 0.2)))
        let w: CGFloat = 40, hgt: CGFloat = 25, phase = t * 5.5
        func wave(_ f: CGFloat) -> CGFloat { CGFloat(sin(Double(f) * 4.2 - phase)) * 3.2 * f }
        var flag = Path()
        let steps = 12
        flag.move(to: CGPoint(x: x, y: top + 2))
        for i in 1...steps { let f = CGFloat(i) / CGFloat(steps); flag.addLine(to: CGPoint(x: x + facing * w * f, y: top + 2 + wave(f))) }
        // 燕尾：缺口在旗尾正中。
        flag.addLine(to: CGPoint(x: x + facing * w * 0.78, y: top + 2 + hgt / 2 + wave(0.78)))
        flag.addLine(to: CGPoint(x: x + facing * w, y: top + 2 + hgt + wave(1)))
        for i in stride(from: steps, through: 0, by: -1) { let f = CGFloat(i) / CGFloat(steps); flag.addLine(to: CGPoint(x: x + facing * w * f, y: top + 2 + hgt + wave(f))) }
        flag.closeSubpath()
        c.fill(flag, with: .color(color))
        c.stroke(flag, with: .color(Theme.ink.opacity(0.35)), lineWidth: 0.8)
        // 旗面的褶光：一道随风走的淡亮带。
        var shine = Path()
        let s = CGFloat((sin(phase * 0.5) + 1) / 2) * 0.6 + 0.2
        shine.move(to: CGPoint(x: x + facing * w * s, y: top + 4 + wave(s))); shine.addLine(to: CGPoint(x: x + facing * w * s, y: top + hgt + wave(s)))
        c.stroke(shine, with: .color(.white.opacity(0.22)), lineWidth: 3)
    }

    /// 两杆长戈：从两侧斜着一笔写出、交于中央，戈头最后落下。
    private func halberds(_ ctx: GraphicsContext, cx: CGFloat, base: CGFloat, t: Double) {
        for side in [CGFloat(-1), 1] {
            let p = Self.span(t, side < 0 ? 0.55 : 0.68, side < 0 ? 0.9 : 1.0)
            guard p > 0 else { continue }
            let from = CGPoint(x: cx + side * 44, y: base + 2), to = CGPoint(x: cx - side * 34, y: base - 64)
            var shaft = Path(); shaft.move(to: from); shaft.addLine(to: to)
            ctx.stroke(shaft.trimmedPath(from: 0, to: p), with: .color(Theme.ink), style: StrokeStyle(lineWidth: 3.2, lineCap: .round))
            if p > 0.85 {
                var head = ctx; head.opacity = (p - 0.85) / 0.15
                let dx = (to.x - from.x), dy = (to.y - from.y), len = hypot(dx, dy), ux = dx / len, uy = dy / len
                var blade = Path()
                blade.move(to: CGPoint(x: to.x + ux * 9, y: to.y + uy * 9))
                blade.addQuadCurve(to: CGPoint(x: to.x - uy * 9 * side, y: to.y + ux * 9 * side), control: CGPoint(x: to.x + ux * 6 - uy * 8 * side, y: to.y + uy * 6 + ux * 8 * side))
                blade.addLine(to: CGPoint(x: to.x - ux * 3, y: to.y - uy * 3))
                blade.closeSubpath()
                head.fill(blade, with: .color(Theme.ink))
                // 红缨。
                head.fill(Path(ellipseIn: CGRect(x: to.x - ux * 8 - 3, y: to.y - uy * 8 - 3, width: 6, height: 6)), with: .color(Theme.seal))
            }
        }
    }

    /// 一团朱墨：几团圆在交点处洇开，飞出几点，然后稍稍淡去停住。
    private func splash(_ ctx: GraphicsContext, at p: CGPoint, t: Double, start: Double, color: Color) {
        let k = Self.span(t, start, start + 0.35)
        guard k > 0 else { return }
        let settle = 1 - 0.25 * Self.span(t, start + 0.4, start + 1.2)
        var c = ctx; c.opacity = settle
        let blobs: [(CGFloat, CGFloat, CGFloat)] = [(0, 0, 13), (9, -5, 7), (-10, 3, 8), (4, 9, 6), (-6, -9, 5)]
        for (dx, dy, r) in blobs {
            let rr = r * CGFloat(k)
            c.fill(Path(ellipseIn: CGRect(x: p.x + dx * CGFloat(k) - rr, y: p.y + dy * CGFloat(k) - rr * 0.85, width: rr * 2, height: rr * 1.7)), with: .color(color.opacity(0.85)))
        }
        let fly = Self.span(t, start, start + 0.45)
        for i in 0..<9 {
            let a = Double(i) * 0.7 + 0.3, d = CGFloat(18 + (i % 3) * 7) * CGFloat(fly), r = CGFloat(1.2 + Double(i % 3) * 0.8)
            c.fill(Path(ellipseIn: CGRect(x: p.x + CGFloat(cos(a)) * d - r, y: p.y + CGFloat(sin(a)) * d * 0.7 - r, width: r * 2, height: r * 2)), with: .color(color.opacity(0.8 * (1 - 0.6 * fly))))
        }
    }

    /// 国色在纸上洇开。
    private func spread(_ ctx: GraphicsContext, at p: CGPoint, t: Double, start: Double, color: Color) {
        let k = Self.span(t, start, start + 0.6)
        guard k > 0 else { return }
        var c = ctx; c.opacity = 0.35
        c.addFilter(.blur(radius: 4))
        let r = 30 * CGFloat(k)
        c.fill(Path(ellipseIn: CGRect(x: p.x - r * 1.3, y: p.y - r * 0.6, width: r * 2.6, height: r * 1.2)), with: .color(color))
    }

    /// 绶带与玉璧：从一杆旗系到另一杆。
    private func ribbon(_ ctx: GraphicsContext, from a: CGPoint, to b: CGPoint, t: Double) {
        let k = Self.span(t, 0.8, 1.3)
        guard k > 0 else { return }
        var band = Path(); band.move(to: a); band.addQuadCurve(to: b, control: CGPoint(x: (a.x + b.x) / 2, y: a.y + 26))
        ctx.stroke(band.trimmedPath(from: 0, to: k), with: .color(Theme.jade), style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
        let disc = Self.span(t, 1.1, 1.45)
        if disc > 0 {
            let m = CGPoint(x: (a.x + b.x) / 2, y: a.y + 13), r = 10 * CGFloat(disc)
            ctx.fill(Path(ellipseIn: CGRect(x: m.x - r, y: m.y - r, width: r * 2, height: r * 2)), with: .color(Theme.jade.opacity(0.85)))
            ctx.fill(Path(ellipseIn: CGRect(x: m.x - r * 0.35, y: m.y - r * 0.35, width: r * 0.7, height: r * 0.7)), with: .color(Theme.paper2))
        }
    }

    /// 火苗：跳动的焰形。
    private func flame(_ ctx: GraphicsContext, at p: CGPoint, t: Double, start: Double, scale: CGFloat) {
        let k = Self.span(t, start, start + 0.3)
        guard k > 0 else { return }
        let flicker = CGFloat(sin(t * 13 + Double(p.x)) * 0.12 + 1), h = 26 * scale * CGFloat(k) * flicker, w = 9 * scale * CGFloat(k)
        var f = Path()
        f.move(to: CGPoint(x: p.x, y: p.y - h))
        f.addQuadCurve(to: CGPoint(x: p.x + w, y: p.y - h * 0.25), control: CGPoint(x: p.x + w * 0.9, y: p.y - h * 0.7))
        f.addQuadCurve(to: CGPoint(x: p.x - w, y: p.y - h * 0.25), control: CGPoint(x: p.x, y: p.y + h * 0.2))
        f.addQuadCurve(to: CGPoint(x: p.x, y: p.y - h), control: CGPoint(x: p.x - w * 0.9, y: p.y - h * 0.7))
        ctx.fill(f, with: .color(Theme.seal.opacity(0.9)))
        ctx.fill(f.applying(CGAffineTransform(translationX: -p.x, y: -p.y).concatenating(CGAffineTransform(scaleX: 0.5, y: 0.55)).concatenating(CGAffineTransform(translationX: p.x, y: p.y))), with: .color(Color(red: 0.95, green: 0.72, blue: 0.3)))
        var stick = Path(); stick.move(to: CGPoint(x: p.x, y: p.y)); stick.addLine(to: CGPoint(x: p.x, y: p.y + 10))
        ctx.stroke(stick, with: .color(Theme.ink), style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
    }

    /// 日出：一轮日从纸面升起，光芒一笔笔写出。
    private func sunrise(_ ctx: GraphicsContext, at p: CGPoint, t: Double) {
        let k = Self.span(t, 0.4, 1.0)
        guard k > 0 else { return }
        let c = CGPoint(x: p.x, y: p.y - 8 - 22 * CGFloat(k)), r: CGFloat = 13
        ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)), with: .color(Color(red: 0.8, green: 0.5, blue: 0.18)))
        let rays = Self.span(t, 0.8, 1.3)
        for i in 0..<8 {
            let a = Double(i) / 8 * Double.pi * 2
            var ray = Path()
            ray.move(to: CGPoint(x: c.x + CGFloat(cos(a)) * (r + 3), y: c.y + CGFloat(sin(a)) * (r + 3)))
            ray.addLine(to: CGPoint(x: c.x + CGFloat(cos(a)) * (r + 3 + 8 * CGFloat(rays)), y: c.y + CGFloat(sin(a)) * (r + 3 + 8 * CGFloat(rays))))
            ctx.stroke(ray, with: .color(Color(red: 0.8, green: 0.5, blue: 0.18).opacity(0.8)), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
        }
        var horizon = Path(); horizon.move(to: CGPoint(x: p.x - 34, y: p.y)); horizon.addLine(to: CGPoint(x: p.x + 34, y: p.y))
        ctx.stroke(horizon, with: .color(Theme.ink.opacity(0.6)), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
    }
}
