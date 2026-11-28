import SwiftUI
import UIKit
import ImageIO
import LieguojiCore

/// v12.0.0 零主线程卡顿 + 服务器自动按需下载与永久磁盘缓存的历史事件画卷加载器：
/// - 优先读本地缓存（HotPack/按需缓存）并 ImageIO 后台下采样至 840px；
/// - 本地未命中时**自动静默从服务器拉取 18KB 高清压缩画卷（国内 <150ms）并永久落盘缓存**，无需手动下载 2GB 整包！
enum EventScrollImageCache {
    private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 24
        c.totalCostLimit = 20 * 1024 * 1024
        return c
    }()

    static func cached(_ key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    private static func decodeDownsampled(url: URL) -> UIImage? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: 840,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }

    static func loadAsync(_ key: String) async -> UIImage? {
        guard !key.isEmpty else { return nil }
        if let hit = cache.object(forKey: key as NSString) { return hit }

        // 1) 本地磁盘快速命中（已安装的 2GB 热更 PNG 或之前自动缓存的 JPG）
        let localHit: UIImage? = await Task.detached(priority: .userInitiated) {
            for ext in ["jpg", "png", "webp"] {
                guard let url = HotPackManager.resourceURL(name: key, ext: ext, subdirectory: "EventScrolls") else { continue }
                if let img = decodeDownsampled(url: url) {
                    return img
                }
            }
            return nil
        }.value
        if let localHit {
            cache.setObject(localHit, forKey: key as NSString)
            return localHit
        }

        // 2) 联网自动从广州行宫 / CDN 按需下载并永久缓存到本地磁盘（~18KB JPG 秒出图）
        var fetchedURL = await HotPackManager.fetchOnDemand(path: "EventScrolls/\(key).jpg")
        if fetchedURL == nil {
            fetchedURL = await HotPackManager.fetchOnDemand(path: "EventScrolls/\(key).png")
        }
        if let fetchedURL {
            let decoded: UIImage? = await Task.detached(priority: .userInitiated) {
                decodeDownsampled(url: fetchedURL)
            }.value
            if let decoded {
                cache.setObject(decoded, forKey: key as NSString)
                return decoded
            }
        }
        return nil
    }

    /// 进入历史剧本时在后台低优静默预缓存即将触发的前若干幅历史画卷，弹窗弹出瞬间 0ms 亮图！
    static func prewarm(keys: [String]) {
        let unique = Array(Set(keys.filter { !$0.isEmpty })).prefix(8)
        guard !unique.isEmpty else { return }
        Task.detached(priority: .utility) {
            for key in unique {
                if Task.isCancelled { break }
                if cached(key) != nil { continue }
                _ = await loadAsync(key)
            }
        }
    }
}

/// v14.0.0 全量 HOI4 效果码解析器：同时兼容 `|` 与 `;` 分隔符，精确解码全部 20+ 种真实机械效果与具体涉事国名、红绿有符号数值！
private struct EventEffectChip: Identifiable {
    let id: String
    let label: String
    let color: Color

    private static let tagNames: [String: String] = [
        "germany": "德国", "ussr": "苏联", "uk": "英国", "france": "法国", "poland": "波兰",
        "italy": "意大利", "austria": "奥地利", "czechoslovakia": "捷克斯洛伐克", "romania": "罗马尼亚",
        "hungary": "匈牙利", "finland": "芬兰", "spain": "西班牙", "yugoslavia": "南斯拉夫",
        "greece": "希腊", "turkey": "土耳其", "sweden": "瑞典", "norway": "挪威",
        "usa": "美国", "usa_pacific": "美国", "japan": "日本", "roc": "国民政府", "cpc": "抗日根据地",
        "northeast": "东北军", "manchukuo": "伪满洲国", "india": "英属印度", "australia": "澳大利亚",
        "tang": "大唐", "yan": "大燕", "tibet": "吐蕃", "uighur": "回纥",
        "song": "大宋", "jin": "大金", "liao": "大辽", "xia": "西夏", "mongol": "蒙古",
        "ming": "大明", "qing": "后金/清", "shun": "大顺",
        "oda": "织田", "takeda": "武田", "tokugawa": "德川", "uesugi": "上杉",
        "mori": "毛利", "hojo": "北条", "shimazu": "岛津", "akechi": "明智", "hashiba": "羽柴",
        "wei": "曹魏", "shu": "蜀汉", "wu": "东吴", "qin": "大秦", "chu": "大楚",
        "han": "大汉", "xiongnu": "匈奴", "rome": "罗马", "carthage": "迦太基", "parthia": "帕提亚",
        "prussia": "普鲁士", "russia": "沙俄", "ottoman": "奥斯曼", "britain": "不列颠",
        "union": "联邦", "confederacy": "邦联"
    ]

    private static let lawNames: [String: String] = [
        "econ_total": "总体战体制",
        "econ_war": "战时经济",
        "econ_partial": "早期/部分动员",
        "econ_civilian": "民用经济",
        "total_mobilization": "总体战体制",
        "war_economy": "战时经济",
        "partial_mobilization": "部分动员",
        "civilian_economy": "民用经济",
        "extensive_conscription": "全面征兵",
        "service_by_requirement": "全民兵役",
        "all_adults_serve": "全龄服役",
        "limited_conscription": "有限征兵",
        "volunteer_only": "志愿兵役"
    ]

    private static func tagLabel(_ raw: String) -> String {
        let key = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let hit = tagNames[key] { return hit }
        return raw.count <= 6 ? raw : String(raw.prefix(6))
    }

    private static func signedInt(_ raw: String?) -> (value: Int, text: String) {
        let v = Int(Double(raw ?? "0") ?? 0)
        return (v, v >= 0 ? "+\(v)" : "\(v)")
    }

    static func parse(_ code: String) -> [EventEffectChip] {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != "ack" else { return [] }
        let positiveColor = Color(red: 0.14, green: 0.48, blue: 0.32)
        let negativeColor = Color(red: 0.72, green: 0.18, blue: 0.15)
        let warnColor = Color(red: 0.74, green: 0.42, blue: 0.08)
        let blueColor = Color(red: 0.20, green: 0.42, blue: 0.62)
        let indigoColor = Color(red: 0.30, green: 0.32, blue: 0.62)
        let purpleColor = Color(red: 0.48, green: 0.26, blue: 0.56)

        var out: [EventEffectChip] = []
        let tokens = trimmed.split(whereSeparator: { $0 == "|" || $0 == ";" })
        for (i, rawPart) in tokens.enumerated() {
            let parts = rawPart.split(separator: ":").map { String($0).trimmingCharacters(in: .whitespaces) }
            guard let kind = parts.first, !kind.isEmpty else { continue }
            switch kind {
            case "war":
                let a = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let b = parts.count >= 3 ? tagLabel(parts[2]) : ""
                let solo = (parts.count >= 4 && parts[3] == "0")
                let title = (!a.isEmpty && !b.isEmpty)
                    ? (solo ? "\(a) 单独对 \(b) 宣战" : "\(a) 向 \(b) 宣战")
                    : "爆发全面战争"
                out.append(EventEffectChip(id: "\(i)-war", label: title, color: Theme.seal))
            case "annex":
                let a = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let b = parts.count >= 3 ? tagLabel(parts[2]) : ""
                let title = (!a.isEmpty && !b.isEmpty) ? "\(a) 吞并 \(b)" : "直接吞并疆域"
                out.append(EventEffectChip(id: "\(i)-annex", label: title, color: negativeColor))
            case "cede", "cede_west", "annex_half", "partition":
                let a = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let b = parts.count >= 3 ? tagLabel(parts[2]) : ""
                let pct = parts.count >= 4 ? (Int(parts[3]) ?? 25) : 25
                let title = (!a.isEmpty && !b.isEmpty) ? "\(b) 割让 \(pct)% 州郡予 \(a)" : "割让核心州郡"
                out.append(EventEffectChip(id: "\(i)-cede", label: title, color: warnColor))
            case "cede_east":
                let a = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let b = parts.count >= 3 ? tagLabel(parts[2]) : ""
                let pct = parts.count >= 4 ? (Int(parts[3]) ?? 45) : 45
                let title = (!a.isEmpty && !b.isEmpty) ? "\(a) 接管 \(b) 东部 \(pct)% 州郡" : "东部疆域瓜分"
                out.append(EventEffectChip(id: "\(i)-ceast", label: title, color: warnColor))
            case "puppet_split":
                let pct = parts.count >= 4 ? (Int(parts[3]) ?? 55) : 55
                let pname = parts.count >= 5 ? parts[4] : "傀儡政权"
                out.append(EventEffectChip(id: "\(i)-psplit", label: "割占 \(pct)% 并建立\(pname)", color: negativeColor))
            case "vassal", "puppet":
                let a = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let b = parts.count >= 3 ? tagLabel(parts[2]) : ""
                let title = (!a.isEmpty && !b.isEmpty) ? "\(b) 称臣附庸于 \(a)" : "确立宗藩附庸"
                out.append(EventEffectChip(id: "\(i)-vas", label: title, color: warnColor))
            case "ally", "coalition":
                let a = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let b = parts.count >= 3 ? tagLabel(parts[2]) : ""
                let title = (!a.isEmpty && !b.isEmpty) ? "\(a) 与 \(b) 缔结同盟" : "缔结战略同盟"
                out.append(EventEffectChip(id: "\(i)-ally", label: title, color: positiveColor))
            case "pact":
                let a = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let b = parts.count >= 3 ? tagLabel(parts[2]) : ""
                let yrs = parts.count >= 4 ? parts[3] : "5"
                let title = (!a.isEmpty && !b.isEmpty) ? "\(a)·\(b) \(yrs)年互不侵犯" : "签署互不侵犯条约"
                out.append(EventEffectChip(id: "\(i)-pact", label: title, color: blueColor))
            case "peace", "truce":
                let a = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let b = parts.count >= 3 ? tagLabel(parts[2]) : ""
                let title = (!a.isEmpty && !b.isEmpty) ? "\(a) 与 \(b) 停战议和" : "签署停战和约"
                out.append(EventEffectChip(id: "\(i)-peace", label: title, color: blueColor))
            case "buff", "blitz", "surge":
                // 格式：buff:specId:label:atk:def:spd:nav:days
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let label = parts.count >= 3 ? parts[2] : ""
                let atk = parts.count >= 4 ? (Double(parts[3]) ?? 0) : 0
                let def = parts.count >= 5 ? (Double(parts[4]) ?? 0) : 0
                let nav = parts.count >= 7 ? (Double(parts[6]) ?? 0) : 0
                let days = parts.count >= 8 ? parts[7] : (parts.count >= 3 ? parts[2] : "90")
                let isDebuff = (atk < 0 || (atk == 0 && def < 0))
                var detail: [String] = []
                if atk != 0 { detail.append("攻\(atk > 0 ? "+" : "")\(Int(atk.rounded()))%") }
                if def != 0 { detail.append("防\(def > 0 ? "+" : "")\(Int(def.rounded()))%") }
                if nav != 0 { detail.append("海\(nav > 0 ? "+" : "")\(Int(nav.rounded()))%") }
                let metric = detail.isEmpty ? "\(days)日战局加成" : "\(detail.joined(separator: "/")) · \(days)日"
                let text = (!label.isEmpty && Int(label) == nil) ? "\(who)「\(label)」\(metric)" : "\(who) \(metric)"
                out.append(EventEffectChip(id: "\(i)-buff", label: text.trimmingCharacters(in: .whitespaces), color: isDebuff ? negativeColor : warnColor))
            case "ic":
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let s = signedInt(parts.count >= 3 ? parts[2] : nil)
                out.append(EventEffectChip(id: "\(i)-ic", label: "\(who) 军工产力 \(s.text)%", color: s.value >= 0 ? positiveColor : negativeColor))
            case "tension":
                let s = signedInt(parts.count >= 2 ? parts[1] : "10")
                out.append(EventEffectChip(id: "\(i)-ten", label: "全球紧张度 \(s.text)%", color: s.value > 0 ? Theme.seal : positiveColor))
            case "nuke", "tech":
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let cnt = max(1, Int(parts.count >= 3 ? parts[2] : "1") ?? 1)
                out.append(EventEffectChip(id: "\(i)-nuke", label: "\(who) 战略核武 +\(cnt)", color: indigoColor))
            case "gold":
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let s = signedInt(parts.count >= 3 ? parts[2] : "0")
                out.append(EventEffectChip(id: "\(i)-gold", label: "\(who) 国库军费 \(s.text)", color: s.value >= 0 ? warnColor : negativeColor))
            case "gold_months":
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let m = Double(parts.count >= 3 ? parts[2] : "0") ?? 0
                let mText = m == floor(m) ? "\(m >= 0 ? "+" : "")\(Int(m))" : String(format: "%+.1f", m)
                out.append(EventEffectChip(id: "\(i)-gm", label: "\(who) 财政 \(mText) 月岁入", color: m >= 0 ? positiveColor : negativeColor))
            case "lend_lease", "aid", "lendlease":
                // 格式：lend_lease:donorSpec:recipSpec:icDelta:goldMonths
                let from = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let to = parts.count >= 3 ? tagLabel(parts[2]) : ""
                let icD = parts.count >= 4 ? (Int(Double(parts[3]) ?? 0)) : 0
                let icTag = icD > 0 ? "（IC+\(icD)）" : ""
                let title = (!from.isEmpty && !to.isEmpty) ? "\(from) 军援 \(to)\(icTag)" : "跨洋战略军援"
                out.append(EventEffectChip(id: "\(i)-ll", label: title, color: positiveColor))
            case "spawn_army", "army", "levy", "mobilize":
                // 格式：spawn_army:specId:troops:label
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let troops = parts.count >= 3 ? (Int(parts[2]) ?? 10000) : 10000
                let unitName = parts.count >= 4 && !parts[3].isEmpty ? "「\(parts[3])」" : "精锐军团"
                out.append(EventEffectChip(id: "\(i)-spawn", label: "\(who) 编成\(unitName) \(Names.wan(troops))", color: indigoColor))
            case "stability":
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let s = signedInt(parts.count >= 3 ? parts[2] : "0")
                out.append(EventEffectChip(id: "\(i)-stab", label: "\(who) 稳定度 \(s.text)%", color: s.value >= 0 ? positiveColor : negativeColor))
            case "war_support":
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let s = signedInt(parts.count >= 3 ? parts[2] : "0")
                out.append(EventEffectChip(id: "\(i)-ws", label: "\(who) 战争支持 \(s.text)%", color: s.value >= 0 ? warnColor : negativeColor))
            case "morale", "destiny":
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let s = signedInt(parts.count >= 3 ? parts[2] : "0")
                out.append(EventEffectChip(id: "\(i)-mor", label: "\(who) 士气 \(s.text)%", color: s.value >= 0 ? purpleColor : negativeColor))
            case "law":
                let who = parts.count >= 2 ? tagLabel(parts[1]) : ""
                let rawLaw = parts.count >= 3 ? parts[2] : ""
                let lawText = lawNames[rawLaw] ?? rawLaw
                out.append(EventEffectChip(id: "\(i)-law", label: "\(who) 推行「\(lawText)」", color: blueColor))
            default:
                continue
            }
        }
        return Array(out.prefix(6))
    }
}

/// v14.0.0 钢铁雄心级羊皮纸历史大事件弹窗（双布局：重大抉择卷轴 / 史实号外快报）：
/// - `GeometryReader` 全设备安全区自适应（零 `UIScreen.main.bounds` 硬编码）；
/// - 实时「双方兵力 / 疆域 / 工业实力对比条」（直观反映国力差距与局势公平性）；
/// - 真·可用「暂隐看图 / 定位战区」按钮：收起遮罩并解冻地图镜头，看完地形再点顶部续阅条回卷抉择；
/// - 等权宣纸选项卡片（摒弃旧版主红副灰的偏颇引导），全量解析 `|` 机械后果徽章；
/// - 精美矢量舆图纹样无图降级画卷 + 联网 18KB 高清战史画卷自动缓存。
struct HistoricalEventModalOverlay: View {
    let modal: HistoricalEvents.PendingModal
    let route: String
    let onChoose: (Int) -> Void
    var onLocate: ((Int) -> Void)? = nil
    var onMinimize: ((Int?) -> Void)? = nil

    @AppStorage("events.expressBanner") private var expressBanner: Bool = false
    @State private var decodedImage: UIImage?
    @State private var loadingImage: Bool = false
    @State private var appeared: Bool = false

    private var isResolvedNotice: Bool {
        modal.resolved == true || (modal.choices.count == 1 && modal.choices[0].effectCode == "ack")
    }

    private var hasForceStats: Bool {
        (modal.actorTroops ?? 0) > 0 || (modal.targetTroops ?? 0) > 0
            || (modal.actorProvinces ?? 0) > 0 || (modal.targetProvinces ?? 0) > 0
    }

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height
            let cardMaxWidth: CGFloat = isLandscape
                ? min(576, max(360, geo.size.width - 72))
                : min(428, max(300, geo.size.width - 26))
            let cardMaxHeight: CGFloat = max(320, geo.size.height - (isLandscape ? 28 : 76))
            let bannerHeight: CGFloat = isLandscape ? 108 : (isResolvedNotice ? 142 : 154)

            ZStack {
                Color.black.opacity(appeared ? 0.50 : 0.0)
                    .ignoresSafeArea()
                    .onTapGesture {
                        if isResolvedNotice {
                            onChoose(0)
                        }
                    }

                VStack(alignment: .leading, spacing: 0) {
                    editorialMasthead(isLandscape: isLandscape)
                    bannerSection(height: bannerHeight, isLandscape: isLandscape)
                    if modal.actorName != nil || modal.focusProvince != nil {
                        strategicCompareStrip
                    }
                    narrativeSection(cardMaxHeight: cardMaxHeight)
                    Divider2().padding(.horizontal, 16)
                    choicesFooter
                }
                .frame(maxWidth: cardMaxWidth)
                .frame(maxHeight: cardMaxHeight)
                .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                        .stroke(Theme.seal.opacity(0.46), lineWidth: 1.15)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12.5, style: .continuous)
                        .stroke(Theme.seal.opacity(0.14), lineWidth: 0.6)
                        .padding(3)
                        .allowsHitTesting(false)
                )
                .compositingGroup()
                .shadow(color: Color.black.opacity(0.28), radius: 14, y: 6)
                .scaleEffect(appeared ? 1.0 : 0.94)
                .opacity(appeared ? 1.0 : 0.0)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .onAppear {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                appeared = true
            }
        }
        .task(id: modal.illustration) {
            if let hit = EventScrollImageCache.cached(modal.illustration) {
                decodedImage = hit
                loadingImage = false
            } else {
                decodedImage = nil
                loadingImage = !modal.illustration.isEmpty
                decodedImage = await EventScrollImageCache.loadAsync(modal.illustration)
                loadingImage = false
            }
        }
    }

    // MARK: - 1. 报头 / 诏书顶栏

    private func editorialMasthead(isLandscape: Bool) -> some View {
        HStack(spacing: 7) {
            Text(isResolvedNotice ? (route == "sandbox" ? "战局号外 · 已生效" : "史实号外 · 已生效") : "重大历史抉择")
                .font(Theme.sans(11, weight: .semibold))
                .foregroundStyle(Theme.paperLight)
                .padding(.horizontal, 9)
                .padding(.vertical, 3.5)
                .background(isResolvedNotice ? Theme.ink.opacity(0.84) : Theme.seal, in: Capsule())

            Text(modal.dateLabel)
                .font(Theme.sans(11.5, weight: .medium))
                .monospacedDigit()
                .foregroundStyle(Theme.ink2)
                .lineLimit(1)

            Spacer(minLength: 4)

            if let onMinimize {
                Button {
                    GameFeel.shared.tap()
                    onMinimize(modal.focusProvince)
                } label: {
                    HStack(spacing: 3.5) {
                        InkIcon(glyph: modal.focusProvince != nil ? .locate : .eye, size: 11)
                            .foregroundStyle(Theme.seal)
                        Text(modal.focusProvince != nil ? "暂隐看战区" : "暂隐看图")
                            .font(Theme.sans(11, weight: .semibold))
                            .foregroundStyle(Theme.seal)
                    }
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(Theme.seal.opacity(0.11), in: Capsule())
                    .overlay(Capsule().stroke(Theme.seal.opacity(0.28), lineWidth: 0.65))
                    .frame(minHeight: 36)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else if let pIdx = modal.focusProvince, let onLocate {
                Button {
                    GameFeel.shared.tap()
                    onLocate(pIdx)
                } label: {
                    HStack(spacing: 3.5) {
                        InkIcon(glyph: .locate, size: 11).foregroundStyle(Theme.seal)
                        Text("定位战区").font(Theme.sans(11, weight: .semibold)).foregroundStyle(Theme.seal)
                    }
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(Theme.seal.opacity(0.11), in: Capsule())
                    .frame(minHeight: 36).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }

            if isResolvedNotice {
                Button {
                    GameFeel.shared.tap()
                    expressBanner.toggle()
                } label: {
                    HStack(spacing: 3) {
                        InkIcon(glyph: .speed, size: 10.5)
                            .foregroundStyle(expressBanner ? Theme.paperLight : Theme.ink2)
                        Text(expressBanner ? "快讯开" : "快讯")
                            .font(Theme.sans(10.5, weight: .medium))
                            .foregroundStyle(expressBanner ? Theme.paperLight : Theme.ink2)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(expressBanner ? Theme.seal : Theme.wash, in: Capsule())
                    .frame(minHeight: 36)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, isLandscape ? 5 : 7)
        .background(Theme.paper2.opacity(0.92))
    }

    // MARK: - 2. 战史画卷（支持云端高清图 + 舆图水墨矢量降级底纹）

    private func bannerSection(height: CGFloat, isLandscape: Bool) -> some View {
        ZStack(alignment: .bottomLeading) {
            if let img = decodedImage {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .frame(height: height)
                    .clipped()
            } else {
                cartographicFallbackArt(height: height)
            }

            LinearGradient(
                colors: [.clear, Color.black.opacity(decodedImage != nil ? 0.80 : 0.62)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: height * 0.72)

            VStack(alignment: .leading, spacing: 3) {
                Text(modal.title)
                    .font(Theme.kai(isLandscape ? 20 : 23))
                    .foregroundStyle(Color(red: 0.99, green: 0.97, blue: 0.92))
                    .shadow(color: .black.opacity(0.70), radius: 2.5, y: 1)
                    .lineLimit(2)
                if !modal.headline.isEmpty {
                    Text(modal.headline)
                        .font(Theme.sans(12, weight: .medium))
                        .foregroundStyle(Color(red: 0.97, green: 0.88, blue: 0.69))
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.bottom, 10)
        }
        .frame(height: height)
        .clipped()
    }

    private func cartographicFallbackArt(height: CGFloat) -> some View {
        let actorCol = Names.color(modal.actorColor ?? "#9E3B2B")
        let targetCol = Names.color(modal.targetColor ?? "#365678")
        return ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.24, green: 0.20, blue: 0.16),
                    Color(red: 0.30, green: 0.24, blue: 0.19),
                    Color(red: 0.17, green: 0.14, blue: 0.12)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            HStack(spacing: 0) {
                actorCol.opacity(0.22)
                targetCol.opacity(0.18)
            }
            .blur(radius: 24)

            // 精致舆图罗盘同心环与十字经纬线
            ZStack {
                Circle()
                    .stroke(Color(red: 0.95, green: 0.89, blue: 0.76).opacity(0.14), lineWidth: 1)
                    .frame(width: height * 1.15, height: height * 1.15)
                Circle()
                    .stroke(Color(red: 0.95, green: 0.89, blue: 0.76).opacity(0.10), style: StrokeStyle(lineWidth: 0.8, dash: [4, 4]))
                    .frame(width: height * 0.76, height: height * 0.76)
                Rectangle()
                    .fill(Color(red: 0.95, green: 0.89, blue: 0.76).opacity(0.08))
                    .frame(height: 0.75)
                Rectangle()
                    .fill(Color(red: 0.95, green: 0.89, blue: 0.76).opacity(0.08))
                    .frame(width: 0.75)
            }
            .offset(x: 78, y: -14)

            HStack(spacing: 6) {
                InkIcon(glyph: .chronicle, size: 15)
                    .foregroundStyle(Color(red: 0.95, green: 0.89, blue: 0.76).opacity(0.55))
                if loadingImage {
                    Text("正在拉取战史画卷…")
                        .font(Theme.sans(11))
                        .foregroundStyle(Color(red: 0.95, green: 0.89, blue: 0.76).opacity(0.68))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .padding(.top, 10)
            .padding(.trailing, 14)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
    }

    // MARK: - 3. 实时局势与双方国力对比条

    private var strategicCompareStrip: some View {
        let actorCol = Names.color(modal.actorColor ?? "#B84A39")
        let targetCol = Names.color(modal.targetColor ?? "#4A6B8A")
        let aTroops = max(0, modal.actorTroops ?? 0)
        let tTroops = max(0, modal.targetTroops ?? 0)
        let aProv = max(0, modal.actorProvinces ?? 0)
        let tProv = max(0, modal.targetProvinces ?? 0)
        let aIC = max(0, modal.actorIC ?? 0)
        let tIC = max(0, modal.targetIC ?? 0)
        let totalPower = max(1.0, Double(aTroops + tTroops) + Double(aIC + tIC) * 180.0 + Double(aProv + tProv) * 350.0)
        let actorPower = Double(aTroops) + Double(aIC) * 180.0 + Double(aProv) * 350.0
        let actorShare = min(0.88, max(0.12, actorPower / totalPower))

        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 8) {
                if let actor = modal.actorName, !actor.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            RoundedRectangle(cornerRadius: 2).fill(actorCol).frame(width: 4, height: 13)
                            Text(actor)
                                .font(Theme.sans(12.5, weight: .semibold))
                                .foregroundStyle(Theme.ink)
                                .lineLimit(1)
                        }
                        if hasForceStats {
                            Text(forceMetricLine(troops: aTroops, prov: aProv, ic: aIC))
                                .font(Theme.sans(10.5))
                                .monospacedDigit()
                                .foregroundStyle(Theme.ink2)
                                .lineLimit(1)
                        }
                    }
                }

                Spacer(minLength: 4)

                if let target = modal.targetName, !target.isEmpty {
                    Text("VS")
                        .font(Theme.sans(10, weight: .bold))
                        .foregroundStyle(Theme.seal.opacity(0.85))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Theme.seal.opacity(0.09), in: Capsule())

                    Spacer(minLength: 4)

                    VStack(alignment: .trailing, spacing: 2) {
                        HStack(spacing: 5) {
                            Text(target)
                                .font(Theme.sans(12.5, weight: .semibold))
                                .foregroundStyle(Theme.ink)
                                .lineLimit(1)
                            RoundedRectangle(cornerRadius: 2).fill(targetCol).frame(width: 4, height: 13)
                        }
                        if hasForceStats {
                            Text(forceMetricLine(troops: tTroops, prov: tProv, ic: tIC))
                                .font(Theme.sans(10.5))
                                .monospacedDigit()
                                .foregroundStyle(Theme.ink2)
                                .lineLimit(1)
                        }
                    }
                }
            }

            if hasForceStats, let target = modal.targetName, !target.isEmpty {
                GeometryReader { barGeo in
                    let w = max(20, barGeo.size.width)
                    HStack(spacing: 1.5) {
                        RoundedRectangle(cornerRadius: 2.5)
                            .fill(actorCol.opacity(0.88))
                            .frame(width: max(8, w * actorShare - 1))
                        RoundedRectangle(cornerRadius: 2.5)
                            .fill(targetCol.opacity(0.84))
                            .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 5)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Theme.wash.opacity(0.45))
        .overlay(alignment: .bottom) { Divider2() }
    }

    private func forceMetricLine(troops: Int, prov: Int, ic: Int) -> String {
        var segs: [String] = []
        if troops > 0 { segs.append("\(Names.wan(troops))兵") }
        if prov > 0 { segs.append("\(prov)州") }
        if ic > 0 { segs.append("IC \(ic)") }
        return segs.joined(separator: " · ")
    }

    // MARK: - 4. 史实叙事与已生效后果区

    private func narrativeSection(cardMaxHeight: CGFloat) -> some View {
        let appliedChips = isResolvedNotice
            ? EventEffectChip.parse(modal.appliedEffectCode ?? "")
            : []
        return ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 10) {
                Text(modal.body)
                    .font(Theme.sans(13.6))
                    .foregroundStyle(Theme.ink.opacity(0.92))
                    .lineSpacing(4.2)
                    .fixedSize(horizontal: false, vertical: true)

                if isResolvedNotice, let chosen = modal.chosenTitle, !chosen.isEmpty {
                    HStack(spacing: 6) {
                        Text("历史走向")
                            .font(Theme.sans(10.5, weight: .semibold))
                            .foregroundStyle(Theme.paperLight)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2.5)
                            .background(Theme.seal.opacity(0.88), in: Capsule())
                        Text(chosen)
                            .font(Theme.serif(13))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(2)
                    }
                }

                if !modal.effectSummary.isEmpty || !appliedChips.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 5) {
                            InkIcon(glyph: .military, size: 12)
                                .foregroundStyle(Theme.seal)
                            Text(isResolvedNotice ? "对当前战局的实际影响" : "战略局势参考")
                                .font(Theme.sans(12, weight: .semibold))
                                .foregroundStyle(Theme.seal)
                        }
                        if !modal.effectSummary.isEmpty {
                            Text(modal.effectSummary)
                                .font(Theme.sans(12.2))
                                .foregroundStyle(Theme.ink.opacity(0.86))
                                .lineSpacing(3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if !appliedChips.isEmpty {
                            effectChipsGrid(appliedChips)
                        }
                    }
                    .padding(.horizontal, 11)
                    .padding(.vertical, 9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .stroke(Theme.seal.opacity(0.22), lineWidth: 0.75)
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
        }
        .frame(minHeight: 78, maxHeight: max(112, cardMaxHeight * 0.42))
    }

    // MARK: - 5. 等权宣纸抉择卡 / 合卷按钮

    private var choicesFooter: some View {
        VStack(spacing: 8) {
            if isResolvedNotice {
                Button {
                    onChoose(0)
                } label: {
                    HStack(spacing: 8) {
                        InkIcon(glyph: .play, size: 13)
                            .foregroundStyle(Theme.paperLight)
                        Text("合卷继续推演")
                            .font(Theme.serif(15))
                            .foregroundStyle(Theme.paperLight)
                    }
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(Theme.seal, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(PressStyle())
            } else {
                ForEach(Array(modal.choices.enumerated()), id: \.offset) { idx, ch in
                    let chips = EventEffectChip.parse(ch.effectCode)
                    let accent: Color = ch.isHistorical ? Theme.seal : Color(red: 0.22, green: 0.44, blue: 0.56)
                    Button {
                        onChoose(idx)
                    } label: {
                        HStack(spacing: 0) {
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .fill(accent)
                                .frame(width: 4)
                                .padding(.vertical, 8)
                                .padding(.leading, 8)

                            VStack(alignment: .leading, spacing: 5) {
                                HStack(alignment: .center, spacing: 6) {
                                    Text(ch.title)
                                        .font(Theme.serif(14.5))
                                        .foregroundStyle(Theme.ink)
                                        .lineLimit(2)
                                        .multilineTextAlignment(.leading)
                                    Spacer(minLength: 4)
                                    Text(ch.isHistorical ? "史实路线" : "架空分支")
                                        .font(Theme.sans(10, weight: .semibold))
                                        .foregroundStyle(accent)
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 2.5)
                                        .background(accent.opacity(0.12), in: Capsule())
                                }
                                if !ch.subtitle.isEmpty {
                                    Text(ch.subtitle)
                                        .font(Theme.sans(12))
                                        .foregroundStyle(Theme.ink2)
                                        .lineLimit(3)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                if !chips.isEmpty {
                                    effectChipsGrid(chips)
                                }
                            }
                            .padding(.horizontal, 11)
                            .padding(.vertical, 9)
                        }
                        .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                        .background(Theme.paper2.opacity(0.92), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(accent.opacity(0.32), lineWidth: 0.85)
                        )
                    }
                    .buttonStyle(PressStyle())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 13)
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private func effectChipsGrid(_ chips: [EventEffectChip]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 5) {
                ForEach(chips) { chip in
                    Text(chip.label)
                        .font(Theme.sans(10.5, weight: .semibold))
                        .foregroundStyle(chip.color)
                        .padding(.horizontal, 7.5)
                        .padding(.vertical, 3)
                        .background(chip.color.opacity(0.12), in: Capsule())
                        .overlay(Capsule().stroke(chip.color.opacity(0.24), lineWidth: 0.5))
                }
            }
        }
    }
}

/// 玩家暂隐事件弹窗勘察地图期间挂在顶部的轻量「返卷批阅」条：零遮挡且一键回归抉择！
struct MinimizedHistoricalEventBanner: View {
    let modal: HistoricalEvents.PendingModal
    let onRestore: () -> Void
    var onLocate: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Theme.seal)
                .frame(width: 7, height: 7)
            VStack(alignment: .leading, spacing: 1.5) {
                Text("待批阅：\(modal.title)")
                    .font(Theme.serif(13))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text("地图已解冻，勘察完战区形势即可返卷抉择")
                    .font(Theme.sans(10.5))
                    .foregroundStyle(Theme.ink2)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            if let onLocate, modal.focusProvince != nil {
                Button {
                    GameFeel.shared.tap()
                    onLocate()
                } label: {
                    InkIcon(glyph: .locate, size: 13)
                        .foregroundStyle(Theme.seal)
                        .frame(width: 32, height: 32)
                        .background(Theme.seal.opacity(0.10), in: Circle())
                }
                .buttonStyle(PressStyle())
            }
            Button {
                GameFeel.shared.tap()
                onRestore()
            } label: {
                Text("继续抉择")
                    .font(Theme.sans(11.5, weight: .semibold))
                    .foregroundStyle(Theme.paperLight)
                    .padding(.horizontal, 11)
                    .frame(height: 30)
                    .background(Theme.seal, in: Capsule())
            }
            .buttonStyle(PressStyle())
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .frame(maxWidth: 460)
        .background(Theme.paperLight.opacity(0.97), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.seal.opacity(0.45), lineWidth: 0.95))
        .shadow(color: Color.black.opacity(0.16), radius: 6, y: 2)
    }
}

/// 高速看海 / 快讯模式顶部号外播报条：零暂停零卡顿展示刚发生的已生效历史大事件（绝不代选未决议的玩家抉择）。
struct HistoricalExpressBanner: View {
    let modal: HistoricalEvents.PendingModal
    let onTapOpen: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            PaperTag(text: modal.dateLabel, color: Theme.seal, size: 10)
            VStack(alignment: .leading, spacing: 1.5) {
                Text(modal.title)
                    .font(Theme.serif(13.5))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                if !modal.headline.isEmpty {
                    Text(modal.headline)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            Button {
                onDismiss()
            } label: {
                InkIcon(glyph: .close, size: 13)
                    .foregroundStyle(Theme.ink2)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("关闭历史号外")
        }
        .padding(.leading, 12)
        .padding(.trailing, 2)
        .padding(.vertical, 2)
        .background(Theme.paperLight.opacity(0.97), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.seal.opacity(0.40), lineWidth: 0.9))
        .shadow(color: Color.black.opacity(0.14), radius: 5, y: 2)
        .contentShape(Rectangle())
        .onTapGesture { onTapOpen() }
    }
}
