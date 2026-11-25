import SwiftUI
import LieguojiCore

/// 顶部大事传报御卷（v4.5 零掉帧 GPU 合成重铸）：
/// - 彻底废除旧版 30fps SwiftUI TimelineView 每帧动态改写纸宽与重算阴影导致的地图掉帧卡顿；
/// - 采用固定布局几何 + 异步缩略解码画卷 + 纯 GPU 合成的弹簧入场（60/120Hz 原生 ProMotion 满帧丝滑，0ms 主线程逐帧重排开销）；
/// - 配合加长可读停顿节奏与轻滑即消交互，清晰易读不抢帧。
struct HeraldBanner: View {
    let herald: GameModel.Herald
    let playVideo: Bool
    private let participantColors: [Color]
    private let leadCulture: String
    private let leadPolity: String
    private let onTap: (() -> Void)?
    private let onDismiss: (() -> Void)?
    @State private var appeared = false
    @State private var dragY: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(herald: GameModel.Herald, map: WorldMap, playVideo: Bool = true, onTap: (() -> Void)? = nil, onDismiss: (() -> Void)? = nil) {
        self.herald = herald
        self.playVideo = playVideo
        self.onTap = onTap
        self.onDismiss = onDismiss
        let nations = map.meta.nations
        participantColors = herald.nations.prefix(2).map { n in
            nations.indices.contains(n) ? Names.color(nations[n].color) : Theme.ink2
        }
        if let first = herald.nations.first, nations.indices.contains(first) {
            leadCulture = nations[first].culture
            leadPolity = nations[first].polity
        } else {
            leadCulture = ""
            leadPolity = ""
        }
    }

    private var accent: Color {
        switch herald.kind {
        case .war, .uprising, .house, .coup, .ultimatum: return Theme.seal
        case .peace, .capital, .treaty, .marriage: return Theme.ink
        case .restoration, .regime, .succession, .harvest: return Color(red: 0.62, green: 0.42, blue: 0.14)
        case .blizzard, .drought, .flood, .plague: return Theme.ink2
        case .capture, .extinction: return Theme.ink
        }
    }

    private enum StyleForm { case warDispatch, peaceScroll, imperialEdict, weatherScroll, fieldSlip }
    private var form: StyleForm {
        switch herald.kind {
        case .war, .ultimatum, .coup, .uprising: return .warDispatch
        case .peace, .treaty, .marriage: return .peaceScroll
        case .regime, .restoration, .house, .succession: return .imperialEdict
        case .blizzard, .drought, .flood, .harvest, .plague: return .weatherScroll
        case .capture, .capital, .extinction: return .fieldSlip
        }
    }
    private var bannerWidth: CGFloat {
        switch form {
        case .fieldSlip: return 320
        default: return 358
        }
    }
    private var bannerHeight: CGFloat {
        switch form {
        case .fieldSlip: return 58
        default: return 70
        }
    }
    private var rollerColors: [Color] {
        switch form {
        case .warDispatch: return [Color(red: 0.44, green: 0.13, blue: 0.10), Theme.seal, Color(red: 0.34, green: 0.10, blue: 0.08)]
        case .imperialEdict: return [Color(red: 0.28, green: 0.21, blue: 0.15), Color(red: 0.46, green: 0.35, blue: 0.23), Color(red: 0.20, green: 0.15, blue: 0.10)]
        case .peaceScroll, .weatherScroll: return [Color(red: 0.25, green: 0.20, blue: 0.16), Color(red: 0.40, green: 0.32, blue: 0.25), Color(red: 0.19, green: 0.15, blue: 0.11)]
        case .fieldSlip: return []
        }
    }

    var body: some View {
        let corner: CGFloat = form == .fieldSlip ? 10 : 7
        let showContent = appeared || reduceMotion || ShotTour.on
        HStack(spacing: 0) {
            if form != .fieldSlip { scrollRoller }

            HStack(spacing: 11) {
                if form == .fieldSlip {
                    Capsule()
                        .fill(participantColors.first ?? accent)
                        .frame(width: 3.5, height: 34)
                }

                livingArtStage
                    .frame(width: form == .fieldSlip ? 62 : 76, height: form == .fieldSlip ? 42 : 50)

                Rectangle()
                    .fill(Theme.hairline)
                    .frame(width: 0.75, height: form == .fieldSlip ? 28 : 38)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        if !participantColors.isEmpty {
                            HStack(spacing: 3) {
                                ForEach(Array(participantColors.enumerated()), id: \.offset) { _, c in
                                    Capsule().fill(c).frame(width: 8, height: 3.5)
                                }
                            }
                        }
                        Text(title)
                            .font(Theme.caption)
                            .foregroundStyle(accent)
                            .lineLimit(1)
                        if !herald.dateText.isEmpty {
                            Text(herald.dateText)
                                .font(Theme.kai(10.5))
                                .monospacedDigit()
                                .foregroundStyle(Theme.ink2)
                                .padding(.horizontal, 6).padding(.vertical, 1)
                                .background(Theme.wash.opacity(0.75), in: Capsule())
                                .lineLimit(1)
                        }
                    }
                    Text(herald.text)
                        .font(Theme.body)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, form == .fieldSlip ? 12 : 11)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.paperLight.opacity(0.97), in: RoundedRectangle(cornerRadius: corner, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: corner, style: .continuous)
                    .strokeBorder(accent.opacity(form == .warDispatch ? 0.45 : 0.24), lineWidth: 0.9)
            )
            .overlay(
                RoundedRectangle(cornerRadius: max(2, corner - 2.5), style: .continuous)
                    .strokeBorder(Color(red: 0.78, green: 0.62, blue: 0.30).opacity(form == .fieldSlip ? 0.18 : 0.36), lineWidth: 0.6)
                    .padding(3)
            )

            if form != .fieldSlip { scrollRoller }
        }
        .frame(maxWidth: bannerWidth).frame(height: bannerHeight)
        .shadow(color: Theme.ink.opacity(0.14), radius: 5, y: 2)
        .padding(.horizontal, 16)
        .scaleEffect(x: showContent ? 1 : 0.92, y: showContent ? 1 : 0.95)
        .offset(y: (showContent ? 0 : -10) + min(0, dragY))
        .opacity(showContent ? Double(max(0.25, 1 + min(0, dragY) / 48)) : 0)
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
        .onAppear {
            if reduceMotion || ShotTour.on {
                appeared = true
            } else {
                withAnimation(.snappy(duration: 0.24, extraBounce: 0.04)) { appeared = true }
            }
        }
        .onChange(of: herald.id) { _, _ in
            dragY = 0
            if reduceMotion || ShotTour.on {
                appeared = true
            } else {
                appeared = false
                withAnimation(.snappy(duration: 0.22, extraBounce: 0.04)) { appeared = true }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(herald.text)
    }

    private var scrollRoller: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Color(red: 0.80, green: 0.64, blue: 0.34))
                .frame(width: 7, height: 3.5)
            Rectangle()
                .fill(LinearGradient(colors: rollerColors, startPoint: .leading, endPoint: .trailing))
                .frame(width: 5, height: max(12, bannerHeight - 10))
            Capsule()
                .fill(Color(red: 0.80, green: 0.64, blue: 0.34))
                .frame(width: 7, height: 3.5)
        }
    }

    /// 54 卷全文明防重复短视频池：结合文明谱系、政体类型、战报关键词与近 16 条已播记忆环，
    /// 让连续数十条大事传报每一卷都与文明风貌契合、几乎零重复。
    private static var recentClips: [String] = []
    private static var resolvedByHeraldId: [UUID: String] = [:]

    private static func pickClip(for herald: GameModel.Herald, culture: String, polity: String) -> String {
        if let cached = resolvedByHeraldId[herald.id] { return cached }
        let t = herald.text
        let c = culture.lowercased()
        let p = polity.lowercased()
        let isEastAsia = c.contains("chinese") || c.contains("han") || c.contains("korean") || c.contains("viet")
        let isJapan = c.contains("japan")
        let isSteppe = c.contains("mongol") || c.contains("turk") || c.contains("steppe") || c.contains("nomad") || c.contains("manchu")
        let isIslamic = c.contains("arab") || c.contains("persian") || c.contains("ottoman") || c.contains("islamic") || c.contains("egypt")
        let isNordic = c.contains("nordic") || c.contains("viking") || c.contains("norse")
        let isClassical = c.contains("greek") || c.contains("roman") || c.contains("byzantine") || c.contains("hellen")
        let isRepublic = p.contains("republic") || p.contains("parliament") || p.contains("senat") || p.contains("consul") || p.contains("dogate") || p.contains("free") || p.contains("hanse")

        var candidates: [String] = []
        if t.contains("大航海") || t.contains("船坞") || t.contains("下水") || t.contains("远洋") || t.contains("海贸") || t.contains("商路") || t.contains("商港") {
            candidates = ["herald-harbor-trade", "herald-voyage-fleet", "herald-voyage", "herald-longship-raid", "herald-silkroad", "herald-galleon-broadside"]
        } else if t.contains("水师") || t.contains("舰队") || t.contains("海港") || t.contains("封锁") || t.contains("海战") || t.contains("抢滩") || t.contains("火船") {
            if isNordic {
                candidates = ["herald-longship-raid", "herald-galleon-broadside", "herald-blockade", "herald-fire-ships", "herald-naval"]
            } else if isEastAsia || isJapan {
                candidates = ["herald-fire-ships", "herald-naval", "herald-blockade", "herald-voyage-fleet", "herald-galleon-broadside"]
            } else {
                candidates = ["herald-galleon-broadside", "herald-blockade", "herald-fire-ships", "herald-naval", "herald-longship-raid", "herald-voyage-fleet"]
            }
        } else if t.contains("议会") || t.contains("大选") || t.contains("元老") || t.contains("表决") || t.contains("公选") || t.contains("共和") {
            candidates = isClassical
                ? ["herald-senate", "herald-election", "herald-parliament", "herald-reform", "herald-library"]
                : ["herald-parliament", "herald-senate", "herald-election", "herald-reform", "herald-regime"]
        } else if t.contains("谍") || t.contains("暗杀") || t.contains("密探") || t.contains("刺客") || t.contains("离间") || t.contains("资助") {
            candidates = ["herald-spy", "herald-betrayal", "herald-uprising", "herald-ultimatum", "herald-regime"]
        } else if t.contains("通商") || t.contains("丝路") || t.contains("铸币") || t.contains("国库") || t.contains("岁入") || t.contains("商税") {
            candidates = ["herald-silkroad", "herald-mint", "herald-harbor-trade", "herald-festival", "herald-relief"]
        } else if t.contains("圣地") || t.contains("宗教") || t.contains("教派") || t.contains("寺") || t.contains("圣殿") || t.contains("祈福") {
            candidates = (isEastAsia || isJapan)
                ? ["herald-monastery", "herald-festival", "herald-cathedral", "herald-peace", "herald-exam-hall"]
                : ["herald-cathedral", "herald-monastery", "herald-sultan-divan", "herald-peace", "herald-succession"]
        } else if t.contains("登基") || t.contains("即位") || t.contains("就职") || t.contains("加冕") || t.contains("传玺") || t.contains("储君") || t.contains("驾崩") || t.contains("崩逝") || t.contains("逝世") || t.contains("去世") || t.contains("圆寂") {
            if isRepublic {
                candidates = ["herald-senate", "herald-parliament", "herald-election", "herald-coronation", "herald-succession"]
            } else if isIslamic {
                candidates = ["herald-sultan-divan", "herald-coronation", "herald-succession", "herald-vassal-tribute", "herald-regime"]
            } else if isJapan {
                candidates = ["herald-shogun-court", "herald-coronation", "herald-succession", "herald-regime"]
            } else {
                candidates = ["herald-succession", "herald-coronation", "herald-vassal-tribute", "herald-regime", "herald-camp-muster"]
            }
        } else if t.contains("科技") || t.contains("突破") || t.contains("维新") || t.contains("变法") || t.contains("革新") || t.contains("学宫") || t.contains("科举") {
            candidates = (isEastAsia || isJapan)
                ? ["herald-exam-hall", "herald-reform", "herald-library", "herald-mint", "herald-monastery"]
                : ["herald-library", "herald-reform", "herald-election", "herald-mint", "herald-exam-hall"]
        } else if t.contains("进贡") || t.contains("藩属") || t.contains("附庸") || t.contains("称臣") || t.contains("册封") {
            candidates = ["herald-vassal-tribute", "herald-sultan-divan", "herald-ultimatum", "herald-coronation", "herald-banquet"]
        } else if t.contains("赈灾") || t.contains("赈济") || t.contains("丰登") || t.contains("丰年") || t.contains("屯田") || t.contains("大稔") || t.contains("灯会") {
            candidates = ["herald-festival", "herald-relief", "herald-locust", "herald-harbor-trade", "herald-peace", "herald-banquet"]
        } else if t.contains("彗星") || t.contains("天象") || t.contains("星变") || t.contains("火山") || t.contains("地震") {
            candidates = ["herald-comet", "herald-volcano", "herald-beacon", "herald-weather"]
        } else {
            switch herald.kind {
            case .war:
                if isSteppe {
                    candidates = ["herald-cavalry", "herald-beacon", "herald-ambush", "herald-war", "herald-camp-muster", "herald-desert-war"]
                } else if isJapan {
                    candidates = ["herald-samurai-charge", "herald-ambush", "herald-war", "herald-artillery", "herald-siege", "herald-camp-muster"]
                } else if isIslamic {
                    candidates = ["herald-desert-war", "herald-cavalry", "herald-artillery", "herald-war", "herald-siege", "herald-beacon"]
                } else if isEastAsia {
                    candidates = ["herald-camp-muster", "herald-war", "herald-beacon", "herald-cavalry", "herald-artillery", "herald-ambush", "herald-winter-march"]
                } else {
                    candidates = ["herald-knights-joust", "herald-ambush", "herald-artillery", "herald-winter-march", "herald-war", "herald-cavalry", "herald-siege"]
                }
            case .ultimatum:
                candidates = ["herald-ultimatum", "herald-beacon", "herald-camp-muster", "herald-sultan-divan", "herald-war", "herald-regime"]
            case .coup:
                candidates = ["herald-betrayal", "herald-spy", "herald-uprising", "herald-senate", "herald-regime", "herald-war"]
            case .uprising:
                candidates = ["herald-uprising", "herald-betrayal", "herald-beacon", "herald-artillery", "herald-siege", "herald-war"]
            case .capture:
                candidates = ["herald-capture", "herald-artillery", "herald-ultimatum", "herald-siege", "herald-samurai-charge", "herald-knights-joust"]
            case .extinction:
                candidates = ["herald-extinction", "herald-betrayal", "herald-volcano", "herald-siege", "herald-comet", "herald-drought"]
            case .peace:
                candidates = ["herald-peace", "herald-banquet", "herald-festival", "herald-alliance", "herald-harbor-trade", "herald-relief"]
            case .treaty:
                candidates = ["herald-alliance", "herald-banquet", "herald-vassal-tribute", "herald-silkroad", "herald-peace", "herald-sultan-divan"]
            case .marriage:
                candidates = ["herald-marriage", "herald-banquet", "herald-festival", "herald-peace", "herald-succession", "herald-coronation"]
            case .regime, .succession:
                candidates = isRepublic
                    ? ["herald-parliament", "herald-senate", "herald-election", "herald-reform", "herald-regime"]
                    : ["herald-succession", "herald-coronation", "herald-regime", "herald-vassal-tribute", "herald-exam-hall", "herald-shogun-court", "herald-sultan-divan"]
            case .restoration:
                candidates = ["herald-succession", "herald-coronation", "herald-camp-muster", "herald-capture", "herald-vassal-tribute"]
            case .house:
                candidates = ["herald-exam-hall", "herald-banquet", "herald-spy", "herald-shogun-court", "herald-regime", "herald-marriage"]
            case .capital:
                candidates = ["herald-festival", "herald-vassal-tribute", "herald-cathedral", "herald-monastery", "herald-coronation", "herald-harbor-trade"]
            case .harvest:
                candidates = ["herald-relief", "herald-festival", "herald-locust", "herald-silkroad", "herald-mint", "herald-peace"]
            case .blizzard:
                candidates = ["herald-weather", "herald-winter-march", "herald-beacon", "herald-flood"]
            case .drought:
                candidates = ["herald-drought", "herald-locust", "herald-desert-war", "herald-volcano", "herald-extinction"]
            case .flood:
                candidates = ["herald-flood", "herald-weather", "herald-volcano", "herald-comet"]
            case .plague:
                candidates = ["herald-plague", "herald-comet", "herald-spy", "herald-extinction", "herald-drought"]
            }
        }
        let available = candidates.filter { InkVideoStage.hasVideo($0) }
        // 按 herald.id 哈希轮转起点，避免同类事件每次从第 0 个开始挑，叠加 16 卷记忆环彻底杜绝重复。
        let rot = abs(herald.text.hashValue) % max(1, available.count)
        let rotated = available.isEmpty ? [] : Array(available[rot...]) + Array(available[..<rot])
        let chosen = rotated.first { !recentClips.contains($0) }
            ?? rotated.first
            ?? candidates.first
            ?? "herald-war"
        recentClips.append(chosen)
        if recentClips.count > 16 { recentClips.removeFirst() }
        if resolvedByHeraldId.count > 64 { resolvedByHeraldId.removeAll(keepingCapacity: true) }
        resolvedByHeraldId[herald.id] = chosen
        return chosen
    }

    private var videoClipName: String {
        Self.pickClip(for: herald, culture: leadCulture, polity: leadPolity)
    }

    /// 左侧异步缩略解码古风历史长卷画窗（零主线程卡顿，无图时回退至极简古籍水墨徽标）。
    @ViewBuilder private var livingArtStage: some View {
        let clip = videoClipName
        if InkVideoStage.hasVideo(clip) {
            InkVideoStage(clip: clip, cornerRadius: 6, tint: accent, playVideo: playVideo && !reduceMotion && !Energy.hot)
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Theme.wash.opacity(0.7))
                Seal(text: String(title.prefix(1)), size: 30)
            }
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
        case .succession:
            if herald.text.contains("驾崩") || herald.text.contains("崩逝") { return "大行崩逝" }
            if herald.text.contains("大选") || herald.text.contains("当选") { return "大选更替" }
            if herald.text.contains("圆寂") { return "教宗圆寂" }
            if herald.text.contains("逝世") || herald.text.contains("去世") || herald.text.contains("被处死") { return "元首逝世" }
            return "新主继统"
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
