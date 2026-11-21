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
    var onDismiss: (() -> Void)? = nil
    @State private var start = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private func color(_ n: Int) -> Color { map.meta.nations.indices.contains(n) ? Names.color(map.meta.nations[n].color) : Theme.ink2 }
    private func name(_ n: Int) -> String { map.meta.nations.indices.contains(n) ? map.meta.nations[n].name : "" }
    private var accent: Color {
        switch herald.kind {
        case .war, .uprising, .house, .coup, .ultimatum: return Theme.seal
        case .peace, .capital, .treaty: return Theme.jade
        case .marriage: return Color(red: 0.78, green: 0.28, blue: 0.34)
        case .restoration, .regime: return Color(red: 0.72, green: 0.52, blue: 0.2)
        case .capture, .extinction: return Theme.ink
        }
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 3 : context.date.timeIntervalSince(start)
            scene(t)
        }
        // 窄条：高 58 点、最宽 340 点，挂在顶栏下，不遮地图中部；轻点可立即收卷。
        .frame(maxWidth: 340).frame(height: 58)
        .padding(.horizontal, 24)
        .contentShape(Rectangle())
        .onTapGesture {
            GameFeel.shared.tap()
            onDismiss?()
        }
        .onAppear { start = Date() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(herald.text)
    }

    private static func ease(_ x: Double) -> Double { let t = min(1, max(0, x)); return t * t * (3 - 2 * t) }
    private static func easeOutBack(_ x: Double) -> Double {
        let t = min(1, max(0, x)) - 1
        let c = 1.15
        return 1 + (c + 1) * t * t * t + c * t * t
    }
    private static func span(_ t: Double, _ a: Double, _ b: Double) -> Double { ease((t - a) / (b - a)) }

    @ViewBuilder private func scene(_ t: Double) -> some View {
        let unroll = min(1.02, Self.easeOutBack(min(1, max(0, t / 0.48))))
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            let paperW = max(24, min(w, w * (0.08 + 0.92 * unroll)))
            let content = Self.span(t, 0.28, 0.58)
            ZStack {
                // 纸卷：宣纸卷面、朱金内框、两端鎏金木轴。
                RoundedRectangle(cornerRadius: 5, style: .continuous).fill(Theme.paper2)
                    .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(Theme.ink.opacity(0.14), lineWidth: 0.7))
                    .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous).strokeBorder(accent.opacity(0.28), lineWidth: 0.8).padding(3.5))
                    .shadow(color: Theme.ink.opacity(0.16), radius: 6, y: 2.5)
                    .frame(width: paperW, height: h - 4)
                ForEach([-1.0, 1.0], id: \.self) { side in
                    VStack(spacing: 0) {
                        Capsule().fill(LinearGradient(colors: [Color(red: 0.82, green: 0.68, blue: 0.36), Color(red: 0.56, green: 0.42, blue: 0.16)], startPoint: .leading, endPoint: .trailing))
                            .frame(width: 7, height: 4.5)
                        Rectangle().fill(LinearGradient(colors: [Color(red: 0.34, green: 0.22, blue: 0.14), Color(red: 0.54, green: 0.38, blue: 0.24), Color(red: 0.28, green: 0.18, blue: 0.11)], startPoint: .leading, endPoint: .trailing))
                            .frame(width: 6, height: max(10, h - 9))
                        Capsule().fill(LinearGradient(colors: [Color(red: 0.82, green: 0.68, blue: 0.36), Color(red: 0.56, green: 0.42, blue: 0.16)], startPoint: .leading, endPoint: .trailing))
                            .frame(width: 7, height: 4.5)
                    }
                    .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
                    .offset(x: side * (paperW / 2 + 1.5))
                }
                // 左侧一幅小画（场景按 208 × 100 的画面绘制、缩到一半），右侧事由。
                HStack(spacing: 8) {
                    Canvas { ctx, size in
                        var c = ctx; c.scaleBy(x: size.width / 208, y: size.height / 100)
                        // 单主体的画面原本画在中线左侧 46 处（给注脚让位），小画里居中。
                        if herald.kind != .war && herald.kind != .peace && herald.kind != .marriage && herald.kind != .treaty && herald.kind != .ultimatum { c.translateBy(x: 46, y: 0) }
                        draw(c, size: CGSize(width: 208, height: 100), t: t)
                    }
                    .frame(width: 96, height: 46)
                    Rectangle().fill(Theme.ink.opacity(0.12)).frame(width: 0.7, height: 30)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).font(Theme.caption).foregroundStyle(accent).lineLimit(1)
                        Text(herald.text).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(2).minimumScaleFactor(0.76)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .opacity(Self.span(t, 0.46, 0.82)).offset(x: (1 - Self.span(t, 0.46, 0.82)) * 7)
                    Spacer(minLength: 0)
                }
                .padding(.leading, 12).padding(.trailing, 14)
                .frame(width: max(24, paperW), height: h)
                .clipped()
                .opacity(content)
            }
            .frame(width: w, height: h)
        }
    }

    /// 传报的类别名（右栏上方一行小字，按事件着色）。
    private var title: String {
        switch herald.kind {
        case .war: return "宣战"
        case .peace: return "议和"
        case .capture: return "攻克"
        case .uprising: return "起义"
        case .restoration: return "复辟"
        case .extinction: return "绝嗣"
        case .capital: return "迁都"
        case .marriage: return "联姻"
        case .house: return "世家"
        case .coup: return "政变"
        case .regime: return "改制"
        case .treaty: return "邦交"
        case .ultimatum: return "通牒"
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
        case .marriage:
            silkMarriage(ctx, size: size, base: base, t: t)
        case .house:
            houseSeal(ctx, at: CGPoint(x: cx - 46, y: base - 24), t: t)
        case .coup:
            coupSlash(ctx, at: CGPoint(x: cx - 46, y: base - 24), t: t)
        case .regime:
            regimeShift(ctx, at: CGPoint(x: cx - 46, y: base - 24), t: t)
        case .treaty:
            let a = herald.nations.first.map(color) ?? Theme.jade, b = herald.nations.dropFirst().first.map(color) ?? Color(red: 0.72, green: 0.52, blue: 0.2)
            let close = Self.span(t, 0.45, 1.05) * 16
            pennant(ctx, x: 30 + close + (1 - flags) * -30, base: base, color: a, t: t, facing: 1, alpha: flags)
            pennant(ctx, x: size.width - 30 - close + (1 - flags) * 30, base: base, color: b, t: t, facing: -1, alpha: flags)
            treatySeal(ctx, cx: cx, y: base - 34, t: t)
        case .ultimatum:
            ultimatumBolt(ctx, size: size, base: base, t: t)
        }
    }

    /// 政变：旧印现裂痕，一杆朱墨重戟斜劈而下，墨点与震波炸开。
    private func coupSlash(_ ctx: GraphicsContext, at p: CGPoint, t: Double) {
        let stamp = Self.span(t, 0.35, 0.72)
        guard stamp > 0 else { return }
        let s: CGFloat = 20
        let rect = CGRect(x: p.x - s, y: p.y - s, width: s * 2, height: s * 2)
        let split = CGFloat(Self.span(t, 0.85, 1.25)) * 4.5
        var left = ctx; left.opacity = Double(stamp) * (1 - Double(split) * 0.08)
        left.translateBy(x: -split, y: split * 0.4)
        left.fill(Path(roundedRect: rect, cornerRadius: 4), with: .color(Theme.ink.opacity(0.22)))
        left.stroke(Path(roundedRect: rect, cornerRadius: 4), with: .color(Theme.ink.opacity(0.6)), lineWidth: 1.8)
        // 戟刃斜斩轨迹
        let slash = Self.span(t, 0.65, 0.98)
        if slash > 0 {
            var cut = Path()
            cut.move(to: CGPoint(x: p.x - 32, y: p.y + 24))
            cut.addLine(to: CGPoint(x: p.x + 34, y: p.y - 28))
            ctx.stroke(cut.trimmedPath(from: 0, to: slash), with: .color(Theme.seal), style: StrokeStyle(lineWidth: 3.6, lineCap: .round))
            splash(ctx, at: p, t: t, start: 0.88, color: Theme.seal)
        }
    }

    /// 改制／革命／立宪：旧玉印虚化退场，鎏金波纹扫过，新玺凌空盖下定鼎。
    private func regimeShift(_ ctx: GraphicsContext, at p: CGPoint, t: Double) {
        let gold = Color(red: 0.76, green: 0.56, blue: 0.2)
        let oldFade = 1 - Self.span(t, 0.55, 0.95)
        if oldFade > 0.01 {
            var old = ctx; old.opacity = oldFade * 0.65
            let r = CGRect(x: p.x - 16, y: p.y - 16, width: 32, height: 32)
            old.stroke(Path(roundedRect: r, cornerRadius: 5), with: .color(Theme.ink2), style: StrokeStyle(lineWidth: 1.8, dash: [4, 3]))
        }
        let drop = Self.span(t, 0.75, 1.15)
        if drop > 0 {
            let scale = 1.45 - 0.45 * CGFloat(drop)
            let s = 18 * scale
            let rect = CGRect(x: p.x - s, y: p.y - s, width: s * 2, height: s * 2)
            var c = ctx; c.opacity = drop
            c.fill(Path(roundedRect: rect, cornerRadius: 5), with: .color(gold.opacity(0.9)))
            c.stroke(Path(roundedRect: rect.insetBy(dx: 3.5, dy: 3.5), cornerRadius: 3), with: .color(Theme.paper2.opacity(0.85)), lineWidth: 1.4)
            let wave = Self.span(t, 1.05, 1.75)
            if wave > 0 && wave < 1 {
                let rr = 16 + 26 * CGFloat(wave)
                ctx.stroke(Path(ellipseIn: CGRect(x: p.x - rr, y: p.y - rr, width: rr * 2, height: rr * 2)),
                           with: .color(gold.opacity(0.55 * (1 - wave))), lineWidth: 2)
            }
        }
    }

    /// 邦交／通商／包围网：两枚金青玉印在中央合符，光晕涟漪荡开。
    private func treatySeal(_ ctx: GraphicsContext, cx: CGFloat, y: CGFloat, t: Double) {
        let meet = Self.span(t, 0.65, 1.15)
        guard meet > 0 else { return }
        let gold = Color(red: 0.76, green: 0.56, blue: 0.2)
        let offset = (1 - CGFloat(meet)) * 24
        var c = ctx; c.opacity = meet
        c.fill(Path(ellipseIn: CGRect(x: cx - 12 - offset, y: y - 12, width: 22, height: 22)), with: .color(Theme.jade.opacity(0.75)))
        c.fill(Path(ellipseIn: CGRect(x: cx - 10 + offset, y: y - 12, width: 22, height: 22)), with: .color(gold.opacity(0.75)))
        if meet > 0.9 {
            let aura = Self.span(t, 1.05, 1.75)
            if aura > 0 && aura < 1 {
                let rr = 12 + 24 * CGFloat(aura)
                ctx.stroke(Path(ellipseIn: CGRect(x: cx - rr, y: y - rr, width: rr * 2, height: rr * 2)),
                           with: .color(gold.opacity(0.5 * (1 - aura))), lineWidth: 1.8)
            }
        }
    }

    /// 最后通牒：朱砂敕令羽箭横空掠过，命中靶心激起赤红冲击波。
    private func ultimatumBolt(_ ctx: GraphicsContext, size: CGSize, base: CGFloat, t: Double) {
        let fly = Self.span(t, 0.42, 0.95)
        guard fly > 0 else { return }
        let y = base - 32
        let x0: CGFloat = 24, x1: CGFloat = size.width - 36
        let tipX = x0 + (x1 - x0) * CGFloat(fly)
        var shaft = Path()
        shaft.move(to: CGPoint(x: max(x0, tipX - 52), y: y))
        shaft.addLine(to: CGPoint(x: tipX, y: y))
        ctx.stroke(shaft, with: .color(Theme.seal), style: StrokeStyle(lineWidth: 3.0, lineCap: .round))
        var head = Path()
        head.move(to: CGPoint(x: tipX + 8, y: y))
        head.addLine(to: CGPoint(x: tipX - 4, y: y - 6))
        head.addLine(to: CGPoint(x: tipX - 4, y: y + 6))
        head.closeSubpath()
        ctx.fill(head, with: .color(Theme.seal))
        splash(ctx, at: CGPoint(x: x1, y: y), t: t, start: 0.92, color: Theme.seal)
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
        // 兵戈相击的朱砂气波环。
        let ring = Self.span(t, start, start + 0.55)
        if ring > 0 && ring < 1 {
            let rr = 12 + 28 * CGFloat(ring)
            c.stroke(Path(ellipseIn: CGRect(x: p.x - rr, y: p.y - rr * 0.78, width: rr * 2, height: rr * 1.56)),
                     with: .color(color.opacity(0.5 * (1 - ring))), lineWidth: 2.2 * CGFloat(1 - 0.5 * ring))
        }
    }

    /// 国色在纸上洇开（纯矢量三层半透墨晕，零离屏模糊开销）。
    private func spread(_ ctx: GraphicsContext, at p: CGPoint, t: Double, start: Double, color: Color) {
        let k = Self.span(t, start, start + 0.6)
        guard k > 0 else { return }
        let r = 30 * CGFloat(k)
        for (scale, alpha) in [(CGFloat(1.38), 0.10), (1.12, 0.18), (0.82, 0.28)] {
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - r * 1.3 * scale, y: p.y - r * 0.6 * scale, width: r * 2.6 * scale, height: r * 1.2 * scale)),
                     with: .color(color.opacity(alpha)))
        }
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
            let aura = Self.span(t, 1.15, 1.85)
            if aura > 0 && aura < 1 {
                let ar = r + 14 * CGFloat(aura)
                ctx.stroke(Path(ellipseIn: CGRect(x: m.x - ar, y: m.y - ar, width: ar * 2, height: ar * 2)),
                           with: .color(Theme.jade.opacity(0.42 * (1 - aura))), lineWidth: 1.8)
            }
            ctx.fill(Path(ellipseIn: CGRect(x: m.x - r, y: m.y - r, width: r * 2, height: r * 2)), with: .color(Theme.jade.opacity(0.85)))
            ctx.fill(Path(ellipseIn: CGRect(x: m.x - r * 0.35, y: m.y - r * 0.35, width: r * 0.7, height: r * 0.7)), with: .color(Theme.paper2))
        }
    }

    /// 联姻：两道朱金红绸自左右交织成同心结，双玉佩相扣，数片落花轻飘。
    private func silkMarriage(_ ctx: GraphicsContext, size: CGSize, base: CGFloat, t: Double) {
        let cx = size.width / 2, cy = base - 26
        let draw = Self.span(t, 0.35, 0.95)
        guard draw > 0 else { return }
        var leftRibbon = Path()
        leftRibbon.move(to: CGPoint(x: 18, y: cy + 12))
        leftRibbon.addCurve(to: CGPoint(x: cx, y: cy), control1: CGPoint(x: 52, y: cy - 22), control2: CGPoint(x: cx - 22, y: cy + 20))
        ctx.stroke(leftRibbon.trimmedPath(from: 0, to: draw), with: .color(Color(red: 0.78, green: 0.24, blue: 0.3)), style: StrokeStyle(lineWidth: 3.2, lineCap: .round))

        var rightRibbon = Path()
        rightRibbon.move(to: CGPoint(x: size.width - 18, y: cy + 12))
        rightRibbon.addCurve(to: CGPoint(x: cx, y: cy), control1: CGPoint(x: size.width - 52, y: cy - 22), control2: CGPoint(x: cx + 22, y: cy + 20))
        ctx.stroke(rightRibbon.trimmedPath(from: 0, to: draw), with: .color(Color(red: 0.82, green: 0.56, blue: 0.22)), style: StrokeStyle(lineWidth: 2.8, lineCap: .round))

        let rings = Self.span(t, 0.72, 1.15)
        if rings > 0 {
            let r = 12 * CGFloat(rings)
            for dx in [CGFloat(-7), 7] {
                ctx.stroke(Path(ellipseIn: CGRect(x: cx + dx - r, y: cy - r, width: r * 2, height: r * 2)),
                           with: .color(dx < 0 ? Theme.seal : Color(red: 0.76, green: 0.56, blue: 0.2)), lineWidth: 2.8)
            }
        }
        let petals = Self.span(t, 0.6, 1.9)
        if petals > 0 {
            for i in 0..<7 {
                let px = cx + CGFloat([-46, -24, -8, 12, 30, 48, 2][i]) + CGFloat(sin(t * 3 + Double(i))) * 4
                let py = cy - 24 + CGFloat((Double(i) * 7 + t * 22).truncatingRemainder(dividingBy: 56))
                ctx.fill(Path(ellipseIn: CGRect(x: px - 2.4, y: py - 1.5, width: 4.8, height: 3.0)),
                         with: .color(Color(red: 0.86, green: 0.42, blue: 0.46).opacity(0.65 * (1 - 0.35 * petals))))
            }
        }
    }

    /// 世家大变：金墨笔锋横扫，朱印自上落下盖定，四周微尘散开。
    private func houseSeal(_ ctx: GraphicsContext, at p: CGPoint, t: Double) {
        let sweep = Self.span(t, 0.35, 0.75)
        if sweep > 0 {
            var slash = Path()
            slash.move(to: CGPoint(x: p.x - 42, y: p.y + 18))
            slash.addQuadCurve(to: CGPoint(x: p.x + 42, y: p.y - 18), control: CGPoint(x: p.x, y: p.y + 4))
            ctx.stroke(slash.trimmedPath(from: 0, to: sweep), with: .color(Color(red: 0.76, green: 0.56, blue: 0.22).opacity(0.85)),
                       style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
        }
        let drop = Self.span(t, 0.55, 0.92)
        if drop > 0 {
            let scale = 1.65 - 0.65 * CGFloat(drop)
            let s: CGFloat = 28 * scale
            let rect = CGRect(x: p.x - s / 2, y: p.y - s / 2, width: s, height: s)
            var c = ctx; c.opacity = drop
            c.fill(Path(roundedRect: rect, cornerRadius: 4), with: .color(Theme.seal))
            c.stroke(Path(roundedRect: rect.insetBy(dx: 3, dy: 3), cornerRadius: 2), with: .color(Theme.paper2.opacity(0.8)), lineWidth: 1.3)
            let inner = InkPath(glyph: .house).path(in: rect.insetBy(dx: 5, dy: 5))
            c.stroke(inner, with: .color(Theme.paper2), style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
        }
        let ring = Self.span(t, 0.85, 1.35)
        if ring > 0 && ring < 1 {
            let rr = 14 + 26 * CGFloat(ring)
            ctx.stroke(Path(ellipseIn: CGRect(x: p.x - rr, y: p.y - rr, width: rr * 2, height: rr * 2)),
                       with: .color(Theme.seal.opacity(0.45 * (1 - ring))), lineWidth: 1.8)
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
