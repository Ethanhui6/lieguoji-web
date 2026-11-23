import SwiftUI
import LieguojiCore

/// 顶部大事传报御卷（v3.0 全面重铸）：
/// - 彻底摒弃圆形徽章套框与静态代码图形，全面采用无圆框自由轮廓宋画工笔插画（`BundleArt`）＋ 60/120Hz 原生 ProMotion 活态物理动效；
/// - 宣战双戟凌空劈合迸射金星、起义火炬战旗猎猎翻飞、和约白鹤衔枝翩跹飞渡、国玺御云沉稳落印、绝嗣断旗倾折化烟、暴雪飘飞／大旱炙浪／洪涝骤雨／金秋丰登各具专属流光画境。
struct HeraldBanner: View {
    let herald: GameModel.Herald
    private let participantColors: [Color]
    private let leadCulture: String?
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
        if let first = herald.nations.first, nations.indices.contains(first) {
            leadCulture = nations[first].culture
        } else if let match = nations.first(where: { !$0.name.isEmpty && herald.text.contains($0.name) }) {
            leadCulture = match.culture
        } else {
            leadCulture = nil
        }
    }

    private var animationDuration: TimeInterval {
        switch herald.kind {
        case .war, .coup, .ultimatum, .blizzard, .drought, .flood: return 2.8
        case .peace, .marriage, .treaty, .harvest, .plague: return 2.5
        case .extinction, .regime, .uprising: return 2.4
        case .house, .restoration: return 2.1
        case .capture, .capital: return 1.9
        }
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

    private var heroArtwork: UIImage? {
        switch herald.kind {
        case .war, .ultimatum: return BundleArt.warCrest(for: leadCulture)
        case .uprising, .coup: return BundleArt.heraldUprising
        case .peace, .treaty, .marriage: return BundleArt.heraldPeace
        case .regime, .restoration, .house: return BundleArt.edictCrest(for: leadCulture)
        case .capture: return BundleArt.victoryBanner(for: leadCulture)
        case .capital: return BundleArt.capital(for: leadCulture)
        case .extinction: return BundleArt.fallenBanner(for: leadCulture)
        case .blizzard: return BundleArt.fxWeatherSnow
        case .drought: return BundleArt.fxWeatherDrought
        case .flood: return BundleArt.fxWeatherStorm
        case .harvest: return BundleArt.fxHarvest
        case .plague: return BundleArt.fxPlague
        }
    }

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

                // 4. 左侧无圆框宋画活态微绘舞台 + 右侧疏朗纪事正文
                HStack(spacing: 10) {
                    livingArtStage(t: t, contentIn: contentIn)
                        .frame(width: form == .fieldSlip ? 48 : 58, height: form == .fieldSlip ? 44 : 54)

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

    /// 左侧无圆框宋画活态动画舞台：每类事件各自拥有专属物理节奏与动作（劈合、招展、倒伏、翔舞、摇曳、落印、震颤）。
    @ViewBuilder private func livingArtStage(t: Double, contentIn: Double) -> some View {
        let enter = Self.span(t, 0.14, 0.44)
        let img = heroArtwork
        ZStack {
            // 底部柔和无边界水墨微晕（纯气氛光影，绝非圆框！）
            RadialGradient(
                colors: [accent.opacity(herald.kind == .drought ? 0.24 : 0.14), Color.clear],
                center: .center, startRadius: 2, endRadius: 28
            )
            .scaleEffect(0.85 + 0.15 * sin(t * 4.2))

            if let img {
                let art = Image(uiImage: img)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                switch herald.kind {
                case .war, .ultimatum:
                    // 双戟凌空劈合＋余震微颤
                    let slam = Self.easeOutBack(min(1, max(0, (t - 0.10) / 0.30)))
                    let shake = t > 0.34 ? sin((t - 0.34) * 28) * exp(-(t - 0.34) * 3.8) * 6.5 : 0
                    art
                        .scaleEffect(0.62 + 0.40 * slam)
                        .rotationEffect(.degrees(shake + (1 - enter) * -14))
                        .shadow(color: Theme.seal.opacity(0.24), radius: 3, y: 1.5)
                case .uprising, .coup:
                    // 火炬烈焰跃动呼吸＋旗帜猎猎摇曳
                    let flicker = 1.0 + 0.045 * sin(t * 15.0)
                    let sway = sin(t * 7.2) * 3.8
                    art
                        .scaleEffect(x: (0.72 + 0.28 * enter) * flicker, y: (0.72 + 0.28 * enter) * (1.0 + 0.05 * cos(t * 13.0)), anchor: .bottom)
                        .rotationEffect(.degrees(sway), anchor: .bottom)
                        .offset(y: CGFloat((1 - enter) * 10))
                case .peace, .treaty, .marriage:
                    // 白鹤衔枝翩跹飞入并轻盈起伏翱翔
                    let glide = Self.span(t, 0.12, 0.62)
                    let bob = sin(t * 4.8) * 2.6
                    let wingTilt = sin(t * 4.8 + 0.6) * 4.0
                    art
                        .offset(x: CGFloat((1 - glide) * 16), y: CGFloat((1 - glide) * 8 + bob))
                        .rotationEffect(.degrees(wingTilt))
                        .scaleEffect(0.80 + 0.22 * glide)
                case .regime, .restoration, .house:
                    // 盘龙传国玉玺自云端庄重落印＋微金辉
                    let drop = Self.easeOutBack(min(1, max(0, (t - 0.12) / 0.36)))
                    let hover = sin(t * 3.2) * 1.4
                    art
                        .offset(y: CGFloat((1 - drop) * -14 + hover))
                        .scaleEffect(0.84 + 0.18 * drop)
                        .shadow(color: Color(red: 0.78, green: 0.56, blue: 0.18).opacity(0.28), radius: 4, y: 2)
                case .capture:
                    // 战旗疾插城头并持续迎风招展
                    let plant = Self.easeOutBack(min(1, max(0, (t - 0.10) / 0.28)))
                    let wave = sin(t * 7.5) * 4.2
                    art
                        .scaleEffect(x: (0.85 + 0.15 * plant) * (1.0 + 0.045 * sin(t * 9.0)), y: 0.85 + 0.15 * plant, anchor: .bottom)
                        .rotationEffect(.degrees(wave), anchor: .bottom)
                        .offset(y: CGFloat((1 - plant) * -12))
                case .extinction:
                    // 断旗哀倾折伏（由直而倾、渐沉化烟）
                    let fall = Self.span(t, 0.24, 1.15)
                    art
                        .rotationEffect(.degrees(-8 + fall * 28), anchor: .bottomLeading)
                        .offset(y: CGFloat(fall * 4))
                        .opacity(1.0 - fall * 0.22)
                case .blizzard:
                    // 积雪松枝寒风轻晃
                    art
                        .rotationEffect(.degrees(sin(t * 3.6) * 3.5), anchor: .leading)
                        .scaleEffect(0.84 + 0.18 * enter)
                case .drought:
                    // 炽日龟裂热浪脉动
                    art
                        .scaleEffect((0.86 + 0.16 * enter) * (1.0 + 0.045 * sin(t * 5.2)))
                case .flood:
                    // 乌云惊雷微震翻涌
                    let flash = (abs(t - 0.45) < 0.08 || abs(t - 1.35) < 0.08) ? 1.12 : 1.0
                    art
                        .scaleEffect((0.84 + 0.18 * enter) * flash)
                        .offset(x: CGFloat(sin(t * 14) * (flash > 1 ? 1.8 : 0.4)))
                case .harvest:
                    // 金黄稻穗随秋风舒缓摇曳
                    art
                        .rotationEffect(.degrees(sin(t * 4.0) * 5.0), anchor: .bottom)
                        .scaleEffect(0.84 + 0.18 * enter)
                case .plague:
                    // 阴霭瘴雾缓慢旋浮
                    art
                        .scaleEffect((0.86 + 0.16 * enter) * (1.0 + 0.05 * sin(t * 3.2)))
                        .rotationEffect(.degrees(sin(t * 2.4) * 6.0))
                case .capital:
                    // 宫阙城楼自祥云升起
                    art
                        .offset(y: CGFloat((1 - enter) * 8))
                        .scaleEffect(0.84 + 0.18 * enter)
                }
            }
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
