import SwiftUI
import LieguojiCore

/// 顶部大事传报御卷（v4.1.0 全面重铸）：
/// - 彻底去除贴图感与圆形套框，改用与纸墨舆图浑然一体的 60/120Hz 原生 ProMotion 实时水墨矢量活态舞台 + 宣纸流光粒子；
/// - 宣战双锋凌空交击迸射四芒星闪、起义跃动朱焰、和约双环相扣振翅白鹤、国色战旗正弦波浪迎风飘展、亡国折杆倾倒、暴雪六出旋晶／炽日脉动／骤雨惊雷／金穗摇曳／瘴雾旋纹／宝玺落印皆每帧丝滑演动。
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
        // 顶部横幅改用 60fps 硬件解码全画幅短视频承载持续动效；SwiftUI TimelineView 仅在 0.68s 展卷与文字落定期间运行，
        // 展卷完毕立即停表释放主线程与 GPU，彻底杜绝顶部弹报时拖慢地图帧率。
        return 0.68
    }

    private var accent: Color {
        switch herald.kind {
        case .war, .uprising, .house, .coup, .ultimatum: return Theme.seal
        case .peace, .capital, .treaty: return Theme.jade
        case .marriage: return Color(red: 0.78, green: 0.28, blue: 0.36)
        case .restoration, .regime, .harvest: return Color(red: 0.74, green: 0.50, blue: 0.14)
        case .blizzard: return Color(red: 0.22, green: 0.46, blue: 0.68)
        case .drought: return Color(red: 0.78, green: 0.36, blue: 0.12)
        case .flood: return Color(red: 0.20, green: 0.34, blue: 0.56)
        case .plague: return Color(red: 0.38, green: 0.46, blue: 0.20)
        case .capture, .extinction: return Theme.ink
        }
    }

    private enum StyleForm { case warDispatch, peaceScroll, imperialEdict, weatherScroll, fieldSlip }
    private var form: StyleForm {
        switch herald.kind {
        case .war, .ultimatum, .coup, .uprising: return .warDispatch
        case .peace, .treaty, .marriage: return .peaceScroll
        case .regime, .restoration, .house: return .imperialEdict
        case .blizzard, .drought, .flood, .harvest, .plague: return .weatherScroll
        case .capture, .capital, .extinction: return .fieldSlip
        }
    }
    private var bannerWidth: CGFloat {
        switch form {
        case .fieldSlip: return 316
        default: return 356
        }
    }
    private var bannerHeight: CGFloat {
        switch form {
        case .fieldSlip: return 56
        default: return 68
        }
    }
    private var paperGradient: [Color] {
        switch herald.kind {
        case .war, .ultimatum, .coup, .uprising:
            return [Color(red: 0.985, green: 0.942, blue: 0.885), Color(red: 0.956, green: 0.892, blue: 0.822)]
        case .peace, .treaty, .marriage:
            return [Color(red: 0.948, green: 0.974, blue: 0.950), Color(red: 0.902, green: 0.946, blue: 0.914)]
        case .regime, .restoration, .house, .harvest:
            return [Color(red: 0.992, green: 0.960, blue: 0.872), Color(red: 0.956, green: 0.904, blue: 0.778)]
        case .blizzard:
            return [Color(red: 0.942, green: 0.968, blue: 0.994), Color(red: 0.874, green: 0.926, blue: 0.974)]
        case .drought:
            return [Color(red: 0.988, green: 0.934, blue: 0.844), Color(red: 0.948, green: 0.858, blue: 0.728)]
        case .flood:
            return [Color(red: 0.922, green: 0.946, blue: 0.974), Color(red: 0.856, green: 0.894, blue: 0.942)]
        case .plague:
            return [Color(red: 0.946, green: 0.954, blue: 0.894), Color(red: 0.894, green: 0.908, blue: 0.822)]
        case .capture, .capital, .extinction:
            return [Color(red: 0.978, green: 0.956, blue: 0.908), Color(red: 0.946, green: 0.914, blue: 0.850)]
        }
    }
    private var rollerColors: [Color] {
        switch form {
        case .warDispatch: return [Color(red: 0.42, green: 0.13, blue: 0.10), Color(red: 0.66, green: 0.22, blue: 0.16), Color(red: 0.34, green: 0.10, blue: 0.08)]
        case .peaceScroll: return [Color(red: 0.18, green: 0.42, blue: 0.34), Color(red: 0.32, green: 0.60, blue: 0.48), Color(red: 0.14, green: 0.34, blue: 0.27)]
        case .imperialEdict: return [Color(red: 0.64, green: 0.46, blue: 0.16), Color(red: 0.88, green: 0.72, blue: 0.34), Color(red: 0.50, green: 0.35, blue: 0.12)]
        case .weatherScroll:
            if herald.kind == .blizzard || herald.kind == .flood {
                return [Color(red: 0.22, green: 0.36, blue: 0.54), Color(red: 0.38, green: 0.56, blue: 0.76), Color(red: 0.16, green: 0.28, blue: 0.44)]
            } else if herald.kind == .drought {
                return [Color(red: 0.56, green: 0.28, blue: 0.12), Color(red: 0.78, green: 0.44, blue: 0.18), Color(red: 0.44, green: 0.20, blue: 0.09)]
            }
            return [Color(red: 0.56, green: 0.42, blue: 0.16), Color(red: 0.82, green: 0.64, blue: 0.28), Color(red: 0.44, green: 0.32, blue: 0.12)]
        case .fieldSlip: return []
        }
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: reduceMotion || motionSettled)) { ctx in
            let elapsed = max(0, ctx.date.timeIntervalSinceReferenceDate - start)
            let t = reduceMotion ? 1.8 : min(elapsed, animationDuration)
            scene(t)
        }
        .frame(maxWidth: bannerWidth).frame(height: bannerHeight)
        .padding(.horizontal, 16)
        .offset(y: min(0, dragY))
        .opacity(Double(max(0.25, 1 + min(0, dragY) / 48)))
        .contentShape(Rectangle())
        .onTapGesture {
            GameFeel.shared.tap()
            if let onTap { onTap() } else { onDismiss?() }
        }
        .gesture(
            DragGesture(minimumDistance: 10)
                .onChanged { v in dragY = v.translation.height < 0 ? v.translation.height : 0 }
                .onEnded { v in
                    if v.translation.height < -18 || v.predictedEndTranslation.height < -32 {
                        GameFeel.shared.tap(); onDismiss?()
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
            } catch { return }
            guard !Task.isCancelled else { return }
            motionSettled = true
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(herald.text)
    }

    private static func ease(_ x: Double) -> Double { let t = min(1, max(0, x)); return t * t * (3 - 2 * t) }
    private static func easeOutBack(_ x: Double) -> Double {
        let t = min(1, max(0, x)) - 1
        let c = 1.25
        return 1 + (c + 1) * t * t * t + c * t * t
    }
    private static func span(_ t: Double, _ a: Double, _ b: Double) -> Double { ease((t - a) / max(0.001, b - a)) }

    @ViewBuilder private func scene(_ t: Double) -> some View {
        let unroll: Double = {
            switch form {
            case .warDispatch: return min(1.02, Self.easeOutBack(min(1, max(0, t / 0.28))))
            case .peaceScroll: return Self.ease(min(1, max(0, t / 0.46)))
            case .imperialEdict: return Self.ease(min(1, max(0, t / 0.38)))
            case .weatherScroll: return Self.ease(min(1, max(0, t / 0.40)))
            case .fieldSlip: return Self.ease(min(1, max(0, t / 0.26)))
            }
        }()
        let tremorX: CGFloat = ((form == .warDispatch || herald.kind == .flood) && t >= 0.30 && t <= 0.56 && !reduceMotion)
            ? CGFloat(sin((t - 0.30) * 64) * (1 - (t - 0.30) / 0.26) * 2.2) : 0
        let dropY: CGFloat = form == .imperialEdict ? CGFloat((1 - unroll) * -8) : 0
        let corner: CGFloat = form == .fieldSlip ? 12 : 6
        let contentIn = Self.span(t, 0.12, 0.36)
        let textIn = Self.span(t, 0.22, 0.50)

        GeometryReader { g in
            let w = g.size.width.isFinite ? max(0, g.size.width) : 0
            let h = g.size.height.isFinite ? max(0, g.size.height) : 0
            let widthFactor = form == .imperialEdict ? 0.84 + 0.16 * unroll : 0.14 + 0.86 * unroll
            let paperW = min(w, max(28, w * CGFloat(widthFactor)))

            ZStack {
                // 1. 宣纸云锦御卷主底板（丝滑双色纸纹渐变 + 鎏金内丝边，彻底告别厚重外框与圆圈）
                RoundedRectangle(cornerRadius: corner, style: .continuous)
                    .fill(LinearGradient(colors: paperGradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(
                        RoundedRectangle(cornerRadius: corner, style: .continuous)
                            .strokeBorder(accent.opacity(form == .warDispatch ? 0.46 : 0.32), lineWidth: 1.0)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: max(2, corner - 2), style: .continuous)
                            .strokeBorder(Color(red: 0.82, green: 0.66, blue: 0.32).opacity(form == .fieldSlip ? 0.24 : 0.48), lineWidth: 0.7)
                            .padding(3)
                    )
                    .shadow(color: Theme.ink.opacity(0.18), radius: 8, y: 3)
                    .frame(width: paperW, height: max(0, h - 4))

                // 2. 卷面实时大气流光与粒子动画层（雪花飘落／金芒扫光／战火火星／桃花瓣／骤雨斜线／热浪浮尘，纯 60/120fps Canvas）
                Canvas { ctx, size in
                    drawAtmosphere(ctx, size: size, t: t)
                }
                .frame(width: max(0, paperW - 6), height: max(0, h - 8))
                .clipShape(RoundedRectangle(cornerRadius: max(2, corner - 1), style: .continuous))
                .allowsHitTesting(false)

                // 3. 两侧精细卷轴（轻捷战报用左缘国色丝带；重磅御卷配流金帽紫檀／碧玉细轴）
                if form == .fieldSlip {
                    let stripeColor = participantColors.first ?? accent
                    Capsule().fill(stripeColor)
                        .frame(width: 3.5, height: max(14, h - 18))
                        .offset(x: -(paperW / 2 - 7))
                } else {
                    ForEach([-1.0, 1.0], id: \.self) { side in
                        VStack(spacing: 0) {
                            Capsule().fill(LinearGradient(colors: [Color(red: 0.90, green: 0.76, blue: 0.42), Color(red: 0.56, green: 0.40, blue: 0.14)], startPoint: .leading, endPoint: .trailing))
                                .frame(width: 7.5, height: 4)
                            Rectangle().fill(LinearGradient(colors: rollerColors, startPoint: .leading, endPoint: .trailing))
                                .frame(width: 5.5, height: max(12, h - 10))
                            Capsule().fill(LinearGradient(colors: [Color(red: 0.90, green: 0.76, blue: 0.42), Color(red: 0.56, green: 0.40, blue: 0.14)], startPoint: .leading, endPoint: .trailing))
                                .frame(width: 7.5, height: 4)
                        }
                        .shadow(color: .black.opacity(0.20), radius: 2, y: 1)
                        .offset(x: side * (paperW / 2 + 1.5))
                    }
                }

                // 4. 左侧古风水墨动态短视频画窗（或60/120fps水墨矢量舞台） + 右侧疏朗纪事正文
                HStack(spacing: 10) {
                    livingArtStage(t: t, contentIn: contentIn)
                        .frame(width: form == .fieldSlip ? 64 : 76, height: form == .fieldSlip ? 42 : 50)

                    Rectangle()
                        .fill(LinearGradient(colors: [accent.opacity(0.05), accent.opacity(0.32), accent.opacity(0.05)], startPoint: .top, endPoint: .bottom))
                        .frame(width: 0.9, height: form == .fieldSlip ? 26 : 36)

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            // 两国交锋／议和时并列微型国色丝点，简洁直观无圆框赘感
                            if !participantColors.isEmpty {
                                HStack(spacing: 3) {
                                    ForEach(Array(participantColors.enumerated()), id: \.offset) { _, c in
                                        Capsule().fill(c).frame(width: 8, height: 3.5)
                                    }
                                }
                            }
                            Text(title)
                                .font(Theme.caption.weight(.semibold))
                                .foregroundStyle(accent)
                                .lineLimit(1)
                        }
                        Text(herald.text)
                            .font(Theme.body)
                            .foregroundStyle(Theme.ink)
                            .lineLimit(2)
                            .minimumScaleFactor(0.78)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .opacity(textIn)
                    .offset(x: CGFloat((1 - textIn) * 8))

                    Spacer(minLength: 0)
                }
                .padding(.leading, form == .fieldSlip ? 14 : 12)
                .padding(.trailing, 14)
                .frame(width: paperW, height: h)
                .clipped()
                .opacity(contentIn)
            }
            .offset(x: tremorX, y: dropY)
            .frame(width: w, height: h)
        }
    }

    /// 防重复短视频池：记录近期已播放的 3 部短片，在同类多候选画卷中自动避开刚刚播过的片段，
    /// 配合 19 部全画幅 60fps 历史长卷，让连续大事传报每条都有耳目一新的画卷演出。
    private static var recentClips: [String] = []
    private static var resolvedByHeraldId: [UUID: String] = [:]

    private static func pickClip(for herald: GameModel.Herald) -> String {
        if let cached = resolvedByHeraldId[herald.id] { return cached }
        let t = herald.text
        var candidates: [String] = []
        if t.contains("大航海") || t.contains("船坞") || t.contains("下水") || t.contains("远洋") || t.contains("海贸") || t.contains("商路") {
            candidates = ["herald-voyage-fleet", "herald-voyage", "herald-naval"]
        } else if t.contains("水师") || t.contains("舰队") || t.contains("海港") || t.contains("封锁") || t.contains("海战") || t.contains("抢滩") {
            candidates = ["herald-naval", "herald-voyage-fleet", "herald-voyage"]
        } else if t.contains("登基") || t.contains("即位") || t.contains("大选") || t.contains("就职") || t.contains("加冕") || t.contains("执政") {
            candidates = ["herald-coronation", "herald-regime", "herald-alliance"]
        } else if t.contains("科技") || t.contains("突破") || t.contains("维新") || t.contains("变法") || t.contains("革新") || t.contains("学宫") {
            candidates = ["herald-reform", "herald-regime", "herald-coronation"]
        } else if t.contains("赈灾") || t.contains("赈济") || t.contains("丰登") || t.contains("丰年") || t.contains("屯田") || t.contains("大稔") {
            candidates = ["herald-relief", "herald-alliance", "herald-peace"]
        } else {
            switch herald.kind {
            case .war: candidates = ["herald-war", "herald-capture", "herald-siege", "herald-uprising"]
            case .ultimatum: candidates = ["herald-war", "herald-regime", "herald-uprising"]
            case .coup: candidates = ["herald-uprising", "herald-regime", "herald-war"]
            case .uprising: candidates = ["herald-uprising", "herald-siege", "herald-war"]
            case .capture: candidates = ["herald-capture", "herald-siege", "herald-war"]
            case .extinction: candidates = ["herald-extinction", "herald-siege", "herald-drought"]
            case .peace: candidates = ["herald-peace", "herald-alliance", "herald-relief"]
            case .treaty: candidates = ["herald-alliance", "herald-peace", "herald-reform"]
            case .marriage: candidates = ["herald-marriage", "herald-peace", "herald-coronation"]
            case .regime: candidates = ["herald-coronation", "herald-regime", "herald-reform"]
            case .restoration: candidates = ["herald-coronation", "herald-capture", "herald-regime"]
            case .house: candidates = ["herald-regime", "herald-reform", "herald-coronation"]
            case .capital: candidates = ["herald-coronation", "herald-regime", "herald-alliance"]
            case .harvest: candidates = ["herald-relief", "herald-peace", "herald-alliance"]
            case .blizzard: candidates = ["herald-weather", "herald-flood"]
            case .drought: candidates = ["herald-drought", "herald-extinction"]
            case .flood: candidates = ["herald-flood", "herald-weather"]
            case .plague: candidates = ["herald-plague", "herald-extinction"]
            }
        }
        let available = candidates.filter { InkVideoStage.hasVideo($0) }
        let chosen = available.first { !recentClips.contains($0) }
            ?? available.first
            ?? candidates.first
            ?? "herald-war"
        recentClips.append(chosen)
        if recentClips.count > 4 { recentClips.removeFirst() }
        if resolvedByHeraldId.count > 48 { resolvedByHeraldId.removeAll(keepingCapacity: true) }
        resolvedByHeraldId[herald.id] = chosen
        return chosen
    }

    private var videoClipName: String {
        Self.pickClip(for: herald)
    }

    /// 左侧硬件解码古风水墨动态短视频画窗（无障碍减弱动态效果开启或视频未载入时平滑回退至 60/120fps 纯实时水墨矢量舞台）。
    @ViewBuilder private func livingArtStage(t: Double, contentIn: Double) -> some View {
        let enter = Self.span(t, 0.14, 0.44)
        let clip = videoClipName
        if !reduceMotion && InkVideoStage.hasVideo(clip) {
            InkVideoStage(clip: clip, cornerRadius: 7, tint: accent)
                .opacity(contentIn)
                .scaleEffect(0.92 + 0.08 * enter)
        } else {
            Canvas { ctx, size in
                drawLivingInkEmblem(ctx, size: size, t: t, enter: enter)
            }
            .opacity(contentIn)
        }
    }

    private func drawLivingInkEmblem(_ ctx: GraphicsContext, size: CGSize, t: Double, enter: Double) {
        let cx = size.width * 0.5, cy = size.height * 0.5
        let r = min(size.width, size.height) * 0.38
        let stroke = StrokeStyle(lineWidth: 2.0, lineCap: .round, lineJoin: .round)
        let fine = StrokeStyle(lineWidth: 1.25, lineCap: .round, lineJoin: .round)
        let ink = Theme.ink.opacity(0.84)
        let gold = Color(red: 0.82, green: 0.62, blue: 0.22)
        let c1 = participantColors.first ?? accent
        let c2 = participantColors.dropFirst().first ?? accent.opacity(0.75)

        // 底部轻墨涟漪气韵（无边框、纯呼吸光晕）
        let ringScale = 0.72 + 0.34 * Self.ease(min(1, max(0, (t - 0.12) / 0.55)))
        let ringRect = CGRect(x: cx - r * ringScale, y: cy - r * ringScale, width: r * 2 * ringScale, height: r * 2 * ringScale)
        ctx.stroke(Path(ellipseIn: ringRect), with: .color(accent.opacity(0.24 * enter)), lineWidth: 1.0)

        switch herald.kind {
        case .war, .ultimatum:
            // 双锋凌空交击（120Hz 丝滑拉出刀光并迸射四芒火星）
            let draw = Self.span(t, 0.14, 0.42)
            let clash = Self.span(t, 0.34, 0.58)
            var b1 = Path()
            b1.move(to: CGPoint(x: cx - r * 0.85, y: cy + r * 0.78))
            b1.addLine(to: CGPoint(x: cx - r * 0.85 + r * 1.70 * draw, y: cy + r * 0.78 - r * 1.56 * draw))
            var b2 = Path()
            b2.move(to: CGPoint(x: cx + r * 0.85, y: cy + r * 0.78))
            b2.addLine(to: CGPoint(x: cx + r * 0.85 - r * 1.70 * draw, y: cy + r * 0.78 - r * 1.56 * draw))
            ctx.stroke(b1, with: .color(c1), style: stroke)
            ctx.stroke(b2, with: .color(c2), style: stroke)
            // 护手横格
            if draw > 0.25 {
                var g1 = Path()
                g1.move(to: CGPoint(x: cx - r * 0.66, y: cy + r * 0.26)); g1.addLine(to: CGPoint(x: cx - r * 0.26, y: cy + r * 0.62))
                var g2 = Path()
                g2.move(to: CGPoint(x: cx + r * 0.66, y: cy + r * 0.26)); g2.addLine(to: CGPoint(x: cx + r * 0.26, y: cy + r * 0.62))
                ctx.stroke(g1, with: .color(ink), style: fine)
                ctx.stroke(g2, with: .color(ink), style: fine)
            }
            // 撞击瞬间四芒金朱星闪
            if clash > 0.02 {
                let sR = r * 0.48 * CGFloat(sin(clash * .pi) + 0.35 * (1 - clash))
                var star = Path()
                star.move(to: CGPoint(x: cx, y: cy - sR)); star.addLine(to: CGPoint(x: cx + sR * 0.28, y: cy - sR * 0.28))
                star.addLine(to: CGPoint(x: cx + sR, y: cy)); star.addLine(to: CGPoint(x: cx + sR * 0.28, y: cy + sR * 0.28))
                star.addLine(to: CGPoint(x: cx, y: cy + sR)); star.addLine(to: CGPoint(x: cx - sR * 0.28, y: cy + sR * 0.28))
                star.addLine(to: CGPoint(x: cx - sR, y: cy)); star.addLine(to: CGPoint(x: cx - sR * 0.28, y: cy - sR * 0.28))
                star.closeSubpath()
                ctx.fill(star, with: .color(gold.opacity(0.95)))
            }

        case .uprising, .coup:
            // 跃动朱焰与斜挥战刃（真 60/120fps 火焰曲线摇曳）
            let sway = CGFloat(sin(t * 9.5) * 3.0)
            var flame = Path()
            flame.move(to: CGPoint(x: cx, y: cy + r * 0.85))
            flame.addCurve(to: CGPoint(x: cx + sway, y: cy - r * 0.92 * enter),
                           control1: CGPoint(x: cx - r * 0.85, y: cy + r * 0.25),
                           control2: CGPoint(x: cx - r * 0.30 + sway, y: cy - r * 0.45))
            flame.addCurve(to: CGPoint(x: cx, y: cy + r * 0.85),
                           control1: CGPoint(x: cx + r * 0.55 + sway, y: cy - r * 0.30),
                           control2: CGPoint(x: cx + r * 0.85, y: cy + r * 0.35))
            ctx.fill(flame, with: .color(Theme.seal.opacity(0.86)))
            var inner = Path()
            inner.move(to: CGPoint(x: cx, y: cy + r * 0.72))
            inner.addCurve(to: CGPoint(x: cx + sway * 0.6, y: cy - r * 0.36 * enter),
                           control1: CGPoint(x: cx - r * 0.36, y: cy + r * 0.30),
                           control2: CGPoint(x: cx - r * 0.14, y: cy - r * 0.08))
            inner.addCurve(to: CGPoint(x: cx, y: cy + r * 0.72),
                           control1: CGPoint(x: cx + r * 0.22, y: cy - r * 0.05),
                           control2: CGPoint(x: cx + r * 0.36, y: cy + r * 0.34))
            ctx.fill(inner, with: .color(gold.opacity(0.95)))

        case .peace, .treaty, .marriage:
            // 青玉/绛红双环相扣 + 振翅翔升白鹤剪影（实时 60/120fps 振翼）
            let spread = CGFloat(1.0 - enter) * r * 0.55
            ctx.stroke(Path(ellipseIn: CGRect(x: cx - r * 0.68 - spread, y: cy - r * 0.44, width: r * 0.92, height: r * 0.92)), with: .color(c1.opacity(0.75)), style: fine)
            ctx.stroke(Path(ellipseIn: CGRect(x: cx - r * 0.24 + spread, y: cy - r * 0.44, width: r * 0.92, height: r * 0.92)), with: .color(c2.opacity(0.75)), style: fine)
            let lift = CGFloat(sin(t * 7.2) * 4.5)
            let bob = CGFloat(cos(t * 4.0) * 1.8)
            var wing = Path()
            wing.move(to: CGPoint(x: cx, y: cy + bob))
            wing.addQuadCurve(to: CGPoint(x: cx - r * 0.92, y: cy - r * 0.25 - lift + bob), control: CGPoint(x: cx - r * 0.48, y: cy - r * 0.58 - lift + bob))
            wing.addQuadCurve(to: CGPoint(x: cx, y: cy + r * 0.26 + bob), control: CGPoint(x: cx - r * 0.40, y: cy + r * 0.14 + bob))
            wing.addQuadCurve(to: CGPoint(x: cx + r * 0.92, y: cy - r * 0.25 - lift + bob), control: CGPoint(x: cx + r * 0.40, y: cy + r * 0.14 + bob))
            wing.addQuadCurve(to: CGPoint(x: cx, y: cy + bob), control: CGPoint(x: cx + r * 0.48, y: cy - r * 0.58 - lift + bob))
            ctx.fill(wing, with: .color(Theme.paper2))
            ctx.stroke(wing, with: .color(accent), style: fine)

        case .capture, .capital:
            // 国色丝绸战旗迎风招展（实时正弦波浪每帧重算）
            let poleX = cx - r * 0.56
            let dropY = CGFloat((1 - enter) * -10)
            var pole = Path()
            pole.move(to: CGPoint(x: poleX, y: cy + r * 0.90 + dropY))
            pole.addLine(to: CGPoint(x: poleX, y: cy - r * 0.88 + dropY))
            ctx.stroke(pole, with: .color(ink), style: stroke)
            let w1 = CGFloat(sin(t * 8.2) * 3.4)
            let w2 = CGFloat(cos(t * 8.2 + 0.9) * 3.2)
            var cloth = Path()
            cloth.move(to: CGPoint(x: poleX + 1, y: cy - r * 0.78 + dropY))
            cloth.addCurve(to: CGPoint(x: cx + r * 0.86, y: cy - r * 0.70 + w2 * 0.6 + dropY),
                           control1: CGPoint(x: cx - r * 0.10, y: cy - r * 0.96 + w1 + dropY),
                           control2: CGPoint(x: cx + r * 0.36, y: cy - r * 0.52 + w2 + dropY))
            cloth.addLine(to: CGPoint(x: cx + r * 0.56, y: cy - r * 0.22 + w2 * 0.4 + dropY))
            cloth.addLine(to: CGPoint(x: cx + r * 0.88, y: cy + r * 0.18 + w2 * 0.6 + dropY))
            cloth.addCurve(to: CGPoint(x: poleX + 1, y: cy + r * 0.12 + dropY),
                           control1: CGPoint(x: cx + r * 0.36, y: cy + r * 0.32 + w2 + dropY),
                           control2: CGPoint(x: cx - r * 0.10, y: cy - r * 0.04 + w1 + dropY))
            cloth.closeSubpath()
            ctx.fill(cloth, with: .color(c1.opacity(0.92)))
            ctx.stroke(cloth, with: .color(ink.opacity(0.65)), style: fine)

        case .extinction:
            // 折杆倾倒残旗（随时间平稳倾折淡去）
            let fall = Self.span(t, 0.22, 1.10)
            var shaft = Path()
            shaft.move(to: CGPoint(x: cx - r * 0.45, y: cy + r * 0.78))
            shaft.addLine(to: CGPoint(x: cx - r * 0.08, y: cy - r * 0.05))
            let bx = cx - r * 0.08 + r * 0.72 * CGFloat(sin(0.35 + fall * 0.95))
            let by = cy - r * 0.05 - r * 0.72 * CGFloat(cos(0.35 + fall * 0.95))
            shaft.addLine(to: CGPoint(x: bx, y: by))
            ctx.stroke(shaft, with: .color(ink.opacity(0.85 - fall * 0.25)), style: stroke)

        case .blizzard:
            // 60/120fps 旋舞六瓣冰晶雪花
            let rot = t * 0.95
            for i in 0..<6 {
                let a = rot + Double(i) * .pi / 3
                let ex = cx + CGFloat(cos(a)) * r * 0.86 * enter
                let ey = cy + CGFloat(sin(a)) * r * 0.86 * enter
                var arm = Path()
                arm.move(to: CGPoint(x: cx, y: cy)); arm.addLine(to: CGPoint(x: ex, y: ey))
                let mx = cx + CGFloat(cos(a)) * r * 0.52 * enter
                let my = cy + CGFloat(sin(a)) * r * 0.52 * enter
                for sgn in [-1.0, 1.0] {
                    let ba = a + sgn * 0.65
                    arm.move(to: CGPoint(x: mx, y: my))
                    arm.addLine(to: CGPoint(x: mx + CGFloat(cos(ba)) * r * 0.26 * enter, y: my + CGFloat(sin(ba)) * r * 0.26 * enter))
                }
                ctx.stroke(arm, with: .color(accent), style: fine)
            }

        case .drought:
            // 炙热炽日脉动光芒
            let pulse = CGFloat(0.86 + 0.14 * sin(t * 5.8)) * CGFloat(enter)
            ctx.fill(Path(ellipseIn: CGRect(x: cx - r * 0.36 * pulse, y: cy - r * 0.36 * pulse, width: r * 0.72 * pulse, height: r * 0.72 * pulse)), with: .color(accent.opacity(0.88)))
            for i in 0..<8 {
                let a = t * 0.45 + Double(i) * .pi / 4
                var ray = Path()
                ray.move(to: CGPoint(x: cx + CGFloat(cos(a)) * r * 0.52, y: cy + CGFloat(sin(a)) * r * 0.52))
                ray.addLine(to: CGPoint(x: cx + CGFloat(cos(a)) * r * 0.92 * pulse, y: cy + CGFloat(sin(a)) * r * 0.92 * pulse))
                ctx.stroke(ray, with: .color(accent), style: fine)
            }

        case .flood:
            // 雷电破空 + 疾雨斜纹
            var bolt = Path()
            bolt.move(to: CGPoint(x: cx + r * 0.18, y: cy - r * 0.85))
            bolt.addLine(to: CGPoint(x: cx - r * 0.30, y: cy + r * 0.04))
            bolt.addLine(to: CGPoint(x: cx + r * 0.14, y: cy + r * 0.04))
            bolt.addLine(to: CGPoint(x: cx - r * 0.18, y: cy + r * 0.88))
            ctx.stroke(bolt, with: .color(accent), style: stroke)

        case .harvest:
            // 随风轻拂的金穗四芒瑞辉
            let sway = CGFloat(sin(t * 4.2) * 3.5)
            var stalk = Path()
            stalk.move(to: CGPoint(x: cx, y: cy + r * 0.88))
            stalk.addQuadCurve(to: CGPoint(x: cx + sway, y: cy - r * 0.82 * enter), control: CGPoint(x: cx - r * 0.20, y: cy))
            ctx.stroke(stalk, with: .color(gold), style: stroke)
            for k in 0..<4 {
                let fy = cy + r * 0.35 - CGFloat(k) * r * 0.30
                let fx = cx + sway * CGFloat(k) * 0.25
                var leaf = Path()
                leaf.move(to: CGPoint(x: fx, y: fy)); leaf.addLine(to: CGPoint(x: fx - r * 0.36, y: fy - r * 0.22))
                leaf.move(to: CGPoint(x: fx, y: fy)); leaf.addLine(to: CGPoint(x: fx + r * 0.36, y: fy - r * 0.22))
                ctx.stroke(leaf, with: .color(gold), style: fine)
            }

        case .plague:
            // 盘旋低沉瘴雾纹
            let rot = CGFloat(sin(t * 2.8) * 3.0)
            for dy in [-r * 0.32, 0.0, r * 0.32] {
                var w = Path()
                w.move(to: CGPoint(x: cx - r * 0.72, y: cy + dy))
                w.addCurve(to: CGPoint(x: cx + r * 0.72, y: cy + dy),
                           control1: CGPoint(x: cx - r * 0.24, y: cy + dy - 5 + rot),
                           control2: CGPoint(x: cx + r * 0.24, y: cy + dy + 5 - rot))
                ctx.stroke(w, with: .color(accent.opacity(0.86)), style: fine)
            }

        default:
            // 改朝换代 / 复辟 / 世家：鎏金玉玺稳稳落印
            let drop = CGFloat((1 - Self.easeOutBack(min(1, max(0, (t - 0.12) / 0.36)))) * -10)
            let box = CGRect(x: cx - r * 0.68, y: cy - r * 0.68 + drop, width: r * 1.36, height: r * 1.36)
            ctx.stroke(Path(roundedRect: box, cornerRadius: 4), with: .color(accent), style: stroke)
            ctx.stroke(Path(roundedRect: box.insetBy(dx: 3.5, dy: 3.5), cornerRadius: 2), with: .color(gold.opacity(0.85)), style: fine)
            var crown = Path()
            crown.move(to: CGPoint(x: cx - r * 0.38, y: cy + r * 0.26 + drop))
            crown.addLine(to: CGPoint(x: cx - r * 0.38, y: cy - r * 0.18 + drop))
            crown.addLine(to: CGPoint(x: cx - r * 0.12, y: cy + r * 0.04 + drop))
            crown.addLine(to: CGPoint(x: cx, y: cy - r * 0.30 + drop))
            crown.addLine(to: CGPoint(x: cx + r * 0.12, y: cy + r * 0.04 + drop))
            crown.addLine(to: CGPoint(x: cx + r * 0.38, y: cy - r * 0.18 + drop))
            crown.addLine(to: CGPoint(x: cx + r * 0.38, y: cy + r * 0.26 + drop))
            crown.closeSubpath()
            ctx.stroke(crown, with: .color(accent), style: fine)
        }
    }

    /// 卷面动态氛围粒子与丝绸斜光（60/120fps 纯轻量化路径绘制）
    private func drawAtmosphere(_ ctx: GraphicsContext, size: CGSize, t: Double) {
        guard size.width > 8, size.height > 8 else { return }
        // 1. 全卷徐徐扫过的一道温润金丝斜光
        let sheenProgress = (t - 0.16) / 0.85
        if sheenProgress > 0 && sheenProgress < 1.25 {
            let sx = size.width * CGFloat(sheenProgress * 1.25 - 0.15)
            var band = Path()
            band.move(to: CGPoint(x: sx - 18, y: 0))
            band.addLine(to: CGPoint(x: sx + 14, y: 0))
            band.addLine(to: CGPoint(x: sx - 4, y: size.height))
            band.addLine(to: CGPoint(x: sx - 36, y: size.height))
            band.closeSubpath()
            ctx.fill(band, with: .color(Color.white.opacity(0.22 * (1 - abs(sheenProgress - 0.55)))))
        }

        // 2. 按事件类型撒落对应动态微粒（火星／雪晶／桃花瓣／骤雨／金辉／落叶）
        switch herald.kind {
        case .war, .uprising, .coup, .ultimatum:
            // 兵戈急报：左侧迸发炽热火星＋斜飞火花
            for i in 0..<10 {
                let phase = (t * 0.85 + Double(i) * 0.17).truncatingRemainder(dividingBy: 1.0)
                let x = 26.0 + Double((i * 47) % 72) + phase * 38.0
                let y = Double(size.height) * (0.88 - phase * 0.82) + sin(phase * 8 + Double(i)) * 4.0
                let r = CGFloat(1.3 + Double(i % 3) * 0.7) * CGFloat(1.0 - phase * 0.5)
                let col = i % 2 == 0 ? Color(red: 0.98, green: 0.66, blue: 0.18) : Theme.seal
                ctx.fill(Path(ellipseIn: CGRect(x: x - Double(r), y: y - Double(r), width: Double(r * 2), height: Double(r * 2))),
                         with: .color(col.opacity((1.0 - phase) * 0.78)))
            }
        case .blizzard:
            // 暴雪封山：全卷斜飘晶莹雪花
            for i in 0..<16 {
                let phase = (t * 0.55 + Double(i) * 0.13).truncatingRemainder(dividingBy: 1.0)
                let x = (Double(i) * 29.0 + phase * 42.0).truncatingRemainder(dividingBy: Double(size.width))
                let y = phase * Double(size.height)
                let r = CGFloat(1.4 + Double(i % 3) * 0.8)
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: Double(r * 2), height: Double(r * 2))),
                         with: .color(Color.white.opacity(0.85 * sin(phase * .pi))))
            }
        case .flood:
            // 江河洪涝：斜织银雨＋偶现电光一闪
            let flash = (abs(t - 0.45) < 0.06 || abs(t - 1.35) < 0.06)
            if flash {
                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(red: 1.0, green: 0.98, blue: 0.86).opacity(0.28)))
            }
            for i in 0..<12 {
                let phase = (t * 1.45 + Double(i) * 0.19).truncatingRemainder(dividingBy: 1.0)
                let x = (Double(i) * 34.0 - phase * 26.0 + Double(size.width)).truncatingRemainder(dividingBy: Double(size.width))
                let y = phase * Double(size.height)
                var drop = Path()
                drop.move(to: CGPoint(x: x, y: y))
                drop.addLine(to: CGPoint(x: x - 5, y: y + 11))
                ctx.stroke(drop, with: .color(Color(red: 0.36, green: 0.58, blue: 0.80).opacity(0.45)), lineWidth: 1.0)
            }
        case .drought:
            // 赤地大旱：升腾的炙热金尘热浪
            for i in 0..<10 {
                let phase = (t * 0.48 + Double(i) * 0.21).truncatingRemainder(dividingBy: 1.0)
                let x = Double(i) * Double(size.width) / 10.0 + sin(phase * 6 + Double(i)) * 7.0
                let y = Double(size.height) * (1.0 - phase)
                let r = CGFloat(1.5 + Double(i % 3) * 0.6)
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: Double(r * 2), height: Double(r * 2))),
                         with: .color(Color(red: 0.86, green: 0.48, blue: 0.14).opacity(0.42 * sin(phase * .pi))))
            }
        case .peace, .treaty, .marriage:
            // 和约联姻：舒缓斜飘粉白花瓣
            for i in 0..<10 {
                let phase = (t * 0.42 + Double(i) * 0.23).truncatingRemainder(dividingBy: 1.0)
                let x = (Double(i) * 38.0 + phase * 48.0).truncatingRemainder(dividingBy: Double(size.width))
                let y = phase * Double(size.height) + sin(phase * 5 + Double(i)) * 5.0
                let col = herald.kind == .marriage ? Color(red: 0.94, green: 0.56, blue: 0.64) : Color(red: 0.98, green: 0.78, blue: 0.82)
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 5.0, height: 3.0)),
                         with: .color(col.opacity(0.70 * sin(phase * .pi))))
            }
        case .harvest, .regime, .restoration, .house:
            // 丰年与国玺：暖金浮光微尘
            for i in 0..<10 {
                let phase = (t * 0.45 + Double(i) * 0.19).truncatingRemainder(dividingBy: 1.0)
                let x = Double(i) * Double(size.width) / 10.0 + 12.0
                let y = Double(size.height) * (0.95 - phase * 0.85)
                let r = CGFloat(1.4 + Double(i % 2) * 0.8)
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: Double(r * 2), height: Double(r * 2))),
                         with: .color(Color(red: 0.88, green: 0.68, blue: 0.22).opacity(0.55 * sin(phase * .pi))))
            }
        default:
            break
        }
    }

    private var title: String {
        switch herald.kind {
        case .war: return "宣战急报"
        case .peace: return "和约玉简"
        case .capture: return "攻克城池"
        case .uprising: return "揭竿起义"
        case .restoration: return "旧邦复辟"
        case .extinction: return "社稷倾覆"
        case .capital: return "迁都定鼎"
        case .marriage: return "皇室联姻"
        case .house: return "世家更迭"
        case .coup: return "宫廷政变"
        case .regime: return "改朝换代"
        case .treaty: return "列国盟约"
        case .ultimatum: return "最后通牒"
        case .blizzard: return "天时暴雪"
        case .drought: return "赤地大旱"
        case .flood: return "江河洪涝"
        case .harvest: return "金秋丰登"
        case .plague: return "疾疫蔓延"
        }
    }
}
