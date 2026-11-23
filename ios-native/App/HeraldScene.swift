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
    private let participantColors: [Color]
    private let onTap: (() -> Void)?
    private let onDismiss: (() -> Void)?
    @State private var start = Date().timeIntervalSinceReferenceDate
    @State private var motionSettled = false
    @State private var dragY: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(herald: GameModel.Herald, map: WorldMap, onTap: (() -> Void)? = nil, onDismiss: (() -> Void)? = nil) {
        self.herald = herald
        self.onTap = onTap
        self.onDismiss = onDismiss
        let nations = map.meta.nations
        participantColors = herald.nations.prefix(2).map { n in
            nations.indices.contains(n) ? Names.color(nations[n].color) : Theme.ink2
        }
    }

    private var animationDuration: TimeInterval {
        switch herald.kind {
        case .war, .coup, .ultimatum: return 2.2
        case .peace, .marriage, .treaty: return 1.9
        case .extinction, .regime, .uprising: return 1.8
        case .house, .restoration: return 1.35
        case .capture: return 1.3
        case .capital: return 1.1
        }
    }

    private var accent: Color {
        switch herald.kind {
        case .war, .uprising, .house, .coup, .ultimatum: return Theme.seal
        case .peace, .capital, .treaty: return Theme.jade
        case .marriage: return Color(red: 0.78, green: 0.28, blue: 0.34)
        case .restoration, .regime: return Color(red: 0.72, green: 0.52, blue: 0.2)
        case .capture, .extinction: return Theme.ink
        }
    }

    /// 四类迥异形制：遮住文字也能凭外框、底色与展开节奏瞬间分辨兵戈急报、和约玉简、国玺易代与轻捷战报。
    private enum StyleForm { case warDispatch, peaceScroll, imperialEdict, fieldSlip }
    private var form: StyleForm {
        switch herald.kind {
        case .war, .ultimatum, .coup, .uprising: return .warDispatch
        case .peace, .treaty, .marriage: return .peaceScroll
        case .regime, .restoration, .house: return .imperialEdict
        case .capture, .capital, .extinction: return .fieldSlip
        }
    }
    private var bannerWidth: CGFloat {
        switch form {
        case .warDispatch: return 348
        case .peaceScroll, .imperialEdict: return 344
        case .fieldSlip: return 284
        }
    }
    private var bannerHeight: CGFloat {
        switch form {
        case .warDispatch, .imperialEdict: return 62
        case .peaceScroll: return 60
        case .fieldSlip: return 46
        }
    }
    private var paperFill: Color {
        switch form {
        case .warDispatch: return Color(red: 0.97, green: 0.91, blue: 0.85)
        case .peaceScroll: return Color(red: 0.93, green: 0.96, blue: 0.93)
        case .imperialEdict: return Color(red: 0.98, green: 0.94, blue: 0.84)
        case .fieldSlip: return Theme.paper2
        }
    }
    private var rollerColors: [Color] {
        switch form {
        case .warDispatch: return [Color(red: 0.42, green: 0.14, blue: 0.11), Color(red: 0.62, green: 0.22, blue: 0.16), Color(red: 0.34, green: 0.11, blue: 0.09)]
        case .peaceScroll: return [Color(red: 0.18, green: 0.40, blue: 0.32), Color(red: 0.28, green: 0.56, blue: 0.46), Color(red: 0.14, green: 0.34, blue: 0.27)]
        case .imperialEdict: return [Color(red: 0.66, green: 0.48, blue: 0.18), Color(red: 0.86, green: 0.70, blue: 0.34), Color(red: 0.54, green: 0.38, blue: 0.14)]
        case .fieldSlip: return []
        }
    }

    var body: some View {
        // 解锁原生 60/120Hz ProMotion 帧率（移除原先硬锁的 30fps 间隔），令顶部传报卷轴展开、兵戈动效与卷轴微震丝滑顺畅。
        TimelineView(.animation(minimumInterval: nil, paused: reduceMotion || motionSettled)) { ctx in
            let elapsed = max(0, ctx.date.timeIntervalSinceReferenceDate - start)
            let t = reduceMotion ? 3 : min(elapsed, animationDuration)
            scene(t)
        }
        // 按事件级别区分尺寸与形制，挂在顶栏下不遮地图中部；轻点定位并收卷，上滑直接收卷。
        .frame(maxWidth: bannerWidth).frame(height: bannerHeight)
        .padding(.horizontal, 20)
        .offset(y: min(0, dragY))
        .opacity(Double(max(0.25, 1 + min(0, dragY) / 48)))
        .contentShape(Rectangle())
        .onTapGesture {
            GameFeel.shared.tap()
            if let onTap { onTap() } else { onDismiss?() }
        }
        .gesture(
            DragGesture(minimumDistance: 10)
                .onChanged { v in
                    dragY = v.translation.height < 0 ? v.translation.height : 0
                }
                .onEnded { v in
                    if v.translation.height < -18 || v.predictedEndTranslation.height < -32 {
                        GameFeel.shared.tap()
                        onDismiss?()
                    } else {
                        withAnimation(Motion.tap) { dragY = 0 }
                    }
                }
        )
        .task(id: herald.id) {
            start = Date().timeIntervalSinceReferenceDate
            motionSettled = false
            dragY = 0
            do {
                try await Task.sleep(nanoseconds: UInt64(animationDuration * 1_000_000_000))
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            motionSettled = true
        }
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
        // 四类差异化动效节奏：急报疾展微震、和约徐徐舒展、国玺庄重下印、轻捷战报轻快滑现。
        let unroll: Double = {
            switch form {
            case .warDispatch: return min(1.03, Self.easeOutBack(min(1, max(0, t / 0.24))))
            case .peaceScroll: return Self.ease(min(1, max(0, t / 0.58)))
            case .imperialEdict: return Self.ease(min(1, max(0, t / 0.42)))
            case .fieldSlip: return Self.ease(min(1, max(0, t / 0.28)))
            }
        }()
        let tremorX: CGFloat = (form == .warDispatch && t >= 0.72 && t <= 0.94 && !reduceMotion)
            ? CGFloat(sin((t - 0.72) * 58) * (1 - (t - 0.72) / 0.22) * 2.4) : 0
        let dropY: CGFloat = form == .imperialEdict ? CGFloat((1 - unroll) * -10) : 0
        let corner: CGFloat = form == .fieldSlip ? 12 : form == .imperialEdict ? 3 : 5
        GeometryReader { g in
            let w = g.size.width.isFinite ? max(0, g.size.width) : 0
            let h = g.size.height.isFinite ? max(0, g.size.height) : 0
            let widthFactor = form == .imperialEdict ? 0.86 + 0.14 * unroll : 0.10 + 0.90 * unroll
            let paperW = min(w, max(24, w * CGFloat(widthFactor)))
            let content = form == .warDispatch ? Self.span(t, 0.14, 0.36) : Self.span(t, 0.24, 0.56)
            let textIn = Self.span(t, form == .warDispatch ? 0.28 : 0.44, form == .warDispatch ? 0.56 : 0.80)
            ZStack {
                // 主底板：四类专属宣纸色、边线厚度与装饰语言
                RoundedRectangle(cornerRadius: corner, style: .continuous).fill(paperFill)
                    .overlay(RoundedRectangle(cornerRadius: corner, style: .continuous).strokeBorder(accent.opacity(form == .warDispatch ? 0.55 : form == .imperialEdict ? 0.65 : 0.26), lineWidth: form == .fieldSlip ? 0.8 : 1.2))
                    .overlay(
                        Group {
                            if form != .fieldSlip {
                                RoundedRectangle(cornerRadius: max(2, corner - 2), style: .continuous)
                                    .strokeBorder(accent.opacity(form == .warDispatch ? 0.42 : 0.32), lineWidth: form == .imperialEdict ? 1.1 : 0.8)
                                    .padding(3.5)
                            }
                        }
                    )
                    .shadow(color: Theme.ink.opacity(form == .fieldSlip ? 0.12 : 0.20), radius: form == .fieldSlip ? 4 : 7, y: 2.5)
                    .frame(width: paperW, height: max(0, h - 4))
                // 轻捷战报用左侧国色竖条；三大重磅传报用专属双轴/金角
                if form == .fieldSlip {
                    let stripeColor = participantColors.first ?? accent
                    Capsule().fill(stripeColor)
                        .frame(width: 3.5, height: max(12, h - 18))
                        .offset(x: -(paperW / 2 - 7))
                } else {
                    ForEach([-1.0, 1.0], id: \.self) { side in
                        VStack(spacing: 0) {
                            Capsule().fill(LinearGradient(colors: [Color(red: 0.86, green: 0.72, blue: 0.38), Color(red: 0.56, green: 0.42, blue: 0.16)], startPoint: .leading, endPoint: .trailing))
                                .frame(width: form == .imperialEdict ? 8.5 : 7, height: 4.5)
                            Rectangle().fill(LinearGradient(colors: rollerColors, startPoint: .leading, endPoint: .trailing))
                                .frame(width: form == .imperialEdict ? 7 : 6, height: max(10, h - 9))
                            Capsule().fill(LinearGradient(colors: [Color(red: 0.86, green: 0.72, blue: 0.38), Color(red: 0.56, green: 0.42, blue: 0.16)], startPoint: .leading, endPoint: .trailing))
                                .frame(width: form == .imperialEdict ? 8.5 : 7, height: 4.5)
                        }
                        .shadow(color: .black.opacity(0.22), radius: 2, y: 1)
                        .offset(x: side * (paperW / 2 + 1.5))
                    }
                }
                // 左侧工笔手绘徽章 + 动态笔墨小画，右侧事由。
                HStack(spacing: form == .fieldSlip ? 7 : 9) {
                    if form == .warDispatch, let art = BundleArt.wargodCrest {
                        Image(uiImage: art)
                            .resizable().interpolation(.high).scaledToFit()
                            .frame(width: 40, height: 40)
                            .scaleEffect(0.76 + 0.24 * content)
                            .shadow(color: Theme.seal.opacity(0.28), radius: 3, y: 1)
                    } else if (form == .imperialEdict || form == .peaceScroll), let art = BundleArt.edictCrest {
                        Image(uiImage: art)
                            .resizable().interpolation(.high).scaledToFit()
                            .frame(width: 40, height: 40)
                            .scaleEffect(0.76 + 0.24 * content)
                            .shadow(color: accent.opacity(0.24), radius: 3, y: 1)
                    } else {
                        Canvas { ctx, size in
                            guard size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else { return }
                            var c = ctx; c.scaleBy(x: size.width / 208, y: size.height / 100)
                            // 单主体的画面原本画在中线左侧 46 处（给注脚让位），小画里居中。
                            if herald.kind != .war && herald.kind != .peace && herald.kind != .marriage && herald.kind != .treaty && herald.kind != .ultimatum { c.translateBy(x: 46, y: 0) }
                            draw(c, size: CGSize(width: 208, height: 100), t: t)
                        }
                        .frame(width: form == .fieldSlip ? 62 : 84, height: form == .fieldSlip ? 32 : 44)
                    }
                    Rectangle().fill(accent.opacity(0.22)).frame(width: 0.8, height: form == .fieldSlip ? 22 : 30)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).font(Theme.caption).foregroundStyle(accent).lineLimit(1)
                        Text(herald.text).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(form == .fieldSlip ? 1 : 2).minimumScaleFactor(0.76)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .opacity(textIn)
                    .offset(x: CGFloat((1 - textIn) * 7))
                    Spacer(minLength: 0)
                }
                .padding(.leading, form == .fieldSlip ? 14 : 12).padding(.trailing, 14)
                .frame(width: paperW, height: h)
                .clipped()
                .opacity(content)
            }
            .offset(x: tremorX, y: dropY)
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
            let a = participantColors.first ?? Theme.seal, b = participantColors.dropFirst().first ?? Theme.ink2
            pennant(ctx, x: 28 + (1 - flags) * -30, base: base, color: a, t: t, facing: 1, alpha: flags)
            pennant(ctx, x: size.width - 28 + (1 - flags) * 30, base: base, color: b, t: t, facing: -1, alpha: flags)
            halberds(ctx, cx: cx, base: base, t: t)
            splash(ctx, at: CGPoint(x: cx, y: base - 30), t: t, start: 0.98, color: Theme.seal)
            // 兵戈急报飞白斜划：双戟相交刹那一道干笔朱墨斜锋划破画格
            let warSlash = Self.span(t, 0.76, 1.08)
            if warSlash > 0 && warSlash < 1 {
                var slashPath = Path()
                slashPath.move(to: CGPoint(x: cx - 34, y: base - 8))
                slashPath.addLine(to: CGPoint(x: cx + 36, y: base - 52))
                ctx.stroke(slashPath.trimmedPath(from: max(0, warSlash - 0.55), to: warSlash),
                           with: .color(Theme.seal.opacity(0.75 * (1 - warSlash * 0.4))),
                           style: StrokeStyle(lineWidth: 2.8, lineCap: .round))
            }
        case .peace:
            let a = participantColors.first ?? Theme.jade, b = participantColors.dropFirst().first ?? Theme.jade
            let close = Self.span(t, 0.5, 1.1) * 18
            pennant(ctx, x: 30 + close + (1 - flags) * -30, base: base, color: a, t: t, facing: 1, alpha: flags)
            pennant(ctx, x: size.width - 30 - close + (1 - flags) * 30, base: base, color: b, t: t, facing: -1, alpha: flags)
            ribbon(ctx, from: CGPoint(x: 30 + close, y: base - 40), to: CGPoint(x: size.width - 30 - close, y: base - 40), t: t)
            // 玉帛合盟温润光晕：礼成之时中线玉璧泛起一层翠白瑞光
            let jadeGlow = Self.span(t, 0.85, 1.45)
            if jadeGlow > 0 {
                let r = CGFloat(8 + 10 * jadeGlow)
                let glowRect = CGRect(x: cx - r, y: base - 32 - r, width: r * 2, height: r * 2)
                ctx.stroke(Path(ellipseIn: glowRect), with: .color(Theme.jade.opacity((1 - jadeGlow) * 0.55)), lineWidth: 1.6)
            }
        case .capture:
            let c = participantColors.first ?? Theme.ink
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
            let a = participantColors.first ?? Theme.jade, b = participantColors.dropFirst().first ?? Color(red: 0.72, green: 0.52, blue: 0.2)
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

    /// 绶带与玉璧：从一杆旗系到另一杆，中央悬一枚金边翡翠玉璧，遮住文字亦可一眼辨出议和。
    private func ribbon(_ ctx: GraphicsContext, from a: CGPoint, to b: CGPoint, t: Double) {
        let k = Self.span(t, 0.8, 1.3)
        guard k > 0 else { return }
        var band = Path(); band.move(to: a); band.addQuadCurve(to: b, control: CGPoint(x: (a.x + b.x) / 2, y: a.y + 26))
        ctx.stroke(band.trimmedPath(from: 0, to: k), with: .color(Theme.jade), style: StrokeStyle(lineWidth: 3.1, lineCap: .round))
        let disc = Self.span(t, 1.05, 1.4)
        if disc > 0 {
            let m = CGPoint(x: (a.x + b.x) / 2, y: a.y + 13), r = 11.5 * CGFloat(disc)
            let aura = Self.span(t, 1.15, 1.85)
            if aura > 0 && aura < 1 {
                let ar = r + 15 * CGFloat(aura)
                ctx.stroke(Path(ellipseIn: CGRect(x: m.x - ar, y: m.y - ar, width: ar * 2, height: ar * 2)),
                           with: .color(Theme.jade.opacity(0.45 * (1 - aura))), lineWidth: 2.0)
            }
            let ringRect = CGRect(x: m.x - r, y: m.y - r, width: r * 2, height: r * 2)
            ctx.fill(Path(ellipseIn: ringRect), with: .color(Theme.jade.opacity(0.9)))
            ctx.stroke(Path(ellipseIn: ringRect), with: .color(Color(red: 0.78, green: 0.6, blue: 0.24).opacity(0.85)), lineWidth: 1.4)
            ctx.fill(Path(ellipseIn: CGRect(x: m.x - r * 0.36, y: m.y - r * 0.36, width: r * 0.72, height: r * 0.72)), with: .color(Theme.paper2))
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
            for (i, x) in [CGFloat(-46), -24, -8, 12, 30, 48, 2].enumerated() {
                let px = cx + x + CGFloat(sin(t * 3 + Double(i))) * 4
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
