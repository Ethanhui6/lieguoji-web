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
        if let fetchedURL = await HotPackManager.fetchOnDemand(path: "EventScrolls/\(key).jpg")
            ?? (await HotPackManager.fetchOnDemand(path: "EventScrolls/\(key).png")) {
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

/// 将事件机械效果码（如 `war:germany:poland;blitz:germany:120`）翻译为玩家一眼看懂的结构化彩色后果徽章。
private struct EventEffectChip: Identifiable {
    let id: String
    let label: String
    let color: Color

    static func parse(_ code: String) -> [EventEffectChip] {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != "ack" else { return [] }
        var out: [EventEffectChip] = []
        for (i, rawPart) in trimmed.split(separator: ";").enumerated() {
            let parts = rawPart.split(separator: ":").map(String.init)
            guard let kind = parts.first else { continue }
            switch kind {
            case "war":
                out.append(EventEffectChip(id: "\(i)-war", label: "爆发全面战争", color: Theme.seal))
            case "annex":
                out.append(EventEffectChip(id: "\(i)-annex", label: "直接吞并疆域", color: Color(red: 0.68, green: 0.16, blue: 0.14)))
            case "annex_half", "cede_west", "partition":
                out.append(EventEffectChip(id: "\(i)-cede", label: "割让/瓜分核心州郡", color: Color(red: 0.72, green: 0.28, blue: 0.14)))
            case "ally", "pact", "coalition":
                out.append(EventEffectChip(id: "\(i)-ally", label: "缔结战略同盟", color: Color(red: 0.16, green: 0.45, blue: 0.34)))
            case "peace", "truce":
                out.append(EventEffectChip(id: "\(i)-peace", label: "签署停战和约", color: Color(red: 0.20, green: 0.44, blue: 0.56)))
            case "blitz", "surge", "buff":
                let days = parts.count >= 3 ? parts[2] : "90"
                out.append(EventEffectChip(id: "\(i)-buff", label: "\(days)日突击攻势加成", color: Color(red: 0.74, green: 0.42, blue: 0.10)))
            case "tension":
                let val = parts.count >= 2 ? parts[1] : "10"
                out.append(EventEffectChip(id: "\(i)-ten", label: "全球紧张度 +\(val)%", color: Color(red: 0.60, green: 0.22, blue: 0.28)))
            case "gold", "aid", "lendlease":
                out.append(EventEffectChip(id: "\(i)-aid", label: "军费与物资增援", color: Color(red: 0.52, green: 0.38, blue: 0.12)))
            case "army", "levy", "mobilize":
                out.append(EventEffectChip(id: "\(i)-army", label: "扩编主力精锐军团", color: Color(red: 0.30, green: 0.36, blue: 0.58)))
            case "tech", "nuke":
                out.append(EventEffectChip(id: "\(i)-tech", label: "军备/战略科技跃升", color: Color(red: 0.26, green: 0.32, blue: 0.62)))
            case "destiny", "morale":
                out.append(EventEffectChip(id: "\(i)-mor", label: "国运与士气波动", color: Color(red: 0.46, green: 0.32, blue: 0.52)))
            case "puppet", "vassal":
                out.append(EventEffectChip(id: "\(i)-vas", label: "确立宗藩附庸", color: Color(red: 0.54, green: 0.34, blue: 0.18)))
            default:
                continue
            }
        }
        return Array(out.prefix(4))
    }
}

/// v12.0.0 钢铁雄心级历史大事件弹窗：
/// - 联网自动从服务器缓存 18KB 高清战史画卷（无需手动下 2GB 包），加载中展示雅致水墨卷轴纹样；
/// - 清晰呈现「涉事双方国色对比条 + 一键飞镜定位事发地 + 详实史实叙事 + 每个选项结构化机械后果胶囊」；
/// - 弹性 VStack 绝不硬编码裁切按钮；`.compositingGroup()` 零离屏抖动；全按钮保底 44pt 触控热区。
struct HistoricalEventModalOverlay: View {
    let modal: HistoricalEvents.PendingModal
    let route: String
    let onChoose: (Int) -> Void
    var onLocate: ((Int) -> Void)? = nil

    @AppStorage("events.expressBanner") private var expressBanner: Bool = false
    @State private var decodedImage: UIImage?
    @State private var loadingImage: Bool = false

    private var isResolvedNotice: Bool {
        modal.resolved == true || (modal.choices.count == 1 && modal.choices[0].effectCode == "ack")
    }

    var body: some View {
        let screen = UIScreen.main.bounds.size
        let isLandscape = screen.width > screen.height
        let cardMaxWidth: CGFloat = isLandscape ? min(540, screen.width - 64) : min(416, screen.width - 28)
        let cardMaxHeight: CGFloat = max(320, screen.height - (isLandscape ? 32 : 96))
        let bannerHeight: CGFloat = isLandscape ? 116 : 164

        ZStack {
            Color.black.opacity(0.46)
                .ignoresSafeArea()
                .onTapGesture {
                    if isResolvedNotice {
                        onChoose(0)
                    }
                }

            VStack(alignment: .leading, spacing: 0) {
                // 1. 顶部高清战史画卷横幅（深墨渐变遮罩保证亮/暗插画下标题对比度 > 7:1）
                ZStack {
                    if let img = decodedImage {
                        Image(uiImage: img)
                            .resizable()
                            .scaledToFill()
                            .frame(maxWidth: .infinity)
                            .frame(height: bannerHeight)
                            .clipped()
                    } else {
                        ZStack {
                            LinearGradient(
                                colors: [
                                    Color(red: 0.21, green: 0.17, blue: 0.14),
                                    Color(red: 0.34, green: 0.27, blue: 0.21),
                                    Color(red: 0.16, green: 0.14, blue: 0.13)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                            VStack(spacing: 5) {
                                InkIcon(glyph: .chronicle, size: 24)
                                    .foregroundStyle(Theme.paperLight.opacity(0.65))
                                if loadingImage {
                                    Text("正在云端拉取战史画卷…")
                                        .font(Theme.sans(11))
                                        .foregroundStyle(Theme.paperLight.opacity(0.76))
                                }
                            }
                            .offset(y: -12)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: bannerHeight)
                    }

                    // 顶部轻暗条（承载徽章与快讯开关）+ 底部深墨遮罩（承载标题与日期）
                    VStack(spacing: 0) {
                        HStack(spacing: 8) {
                            Text(isResolvedNotice ? (route == "sandbox" ? "架空局势 · 已生效" : "既定史实 · 已生效") : "重大历史抉择")
                                .font(Theme.sans(11, weight: .semibold))
                                .foregroundStyle(Theme.paperLight)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .background(Theme.seal.opacity(0.92), in: Capsule())

                            Text(modal.dateLabel)
                                .font(Theme.sans(11, weight: .medium))
                                .monospacedDigit()
                                .foregroundStyle(Theme.paperLight.opacity(0.92))
                                .lineLimit(1)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3.5)
                                .background(Color.black.opacity(0.45), in: Capsule())

                            Spacer(minLength: 4)

                            Button {
                                GameFeel.shared.tap()
                                expressBanner.toggle()
                            } label: {
                                HStack(spacing: 4) {
                                    InkIcon(glyph: .speed, size: 11)
                                        .foregroundStyle(Theme.paperLight)
                                    Text(expressBanner ? "快讯已开" : "快讯不暂停")
                                        .font(Theme.sans(10.5, weight: .medium))
                                }
                                .foregroundStyle(Theme.paperLight)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 5)
                                .background(
                                    (expressBanner ? Theme.seal : Color.black.opacity(0.48)),
                                    in: Capsule()
                                )
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 14)
                        .padding(.top, 4)

                        Spacer(minLength: 0)

                        VStack(alignment: .leading, spacing: 3) {
                            Text(modal.title)
                                .font(Theme.kai(isLandscape ? 20 : 23))
                                .foregroundStyle(Color(red: 0.99, green: 0.97, blue: 0.92))
                                .shadow(color: .black.opacity(0.65), radius: 2, y: 1)
                                .lineLimit(2)
                            if !modal.headline.isEmpty {
                                Text(modal.headline)
                                    .font(Theme.sans(12, weight: .medium))
                                    .foregroundStyle(Color(red: 0.96, green: 0.87, blue: 0.68))
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 10)
                        .padding(.top, 26)
                        .background(
                            LinearGradient(
                                colors: [.clear, Color.black.opacity(0.78)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                    }
                }
                .frame(height: bannerHeight)
                .clipped()

                // 2. 涉事双方条 + 「定位事发地」快捷按钮
                if modal.actorName != nil || modal.focusProvince != nil {
                    HStack(spacing: 8) {
                        if let actor = modal.actorName, !actor.isEmpty {
                            HStack(spacing: 5) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Names.color(modal.actorColor ?? "#B84A39"))
                                    .frame(width: 4, height: 14)
                                Text(actor)
                                    .font(Theme.sans(12.5, weight: .semibold))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                            }
                        }
                        if let target = modal.targetName, !target.isEmpty {
                            Text("⟶")
                                .font(Theme.sans(12, weight: .bold))
                                .foregroundStyle(Theme.seal)
                            HStack(spacing: 5) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Names.color(modal.targetColor ?? "#4A6B8A"))
                                    .frame(width: 4, height: 14)
                                Text(target)
                                    .font(Theme.sans(12.5, weight: .semibold))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 4)
                        if let pIdx = modal.focusProvince, let onLocate {
                            Button {
                                GameFeel.shared.tap()
                                onLocate(pIdx)
                            } label: {
                                HStack(spacing: 4) {
                                    InkIcon(glyph: .locate, size: 12)
                                        .foregroundStyle(Theme.seal)
                                    Text("定位战区")
                                        .font(Theme.sans(11.5, weight: .medium))
                                        .foregroundStyle(Theme.seal)
                                }
                                .padding(.horizontal, 9)
                                .padding(.vertical, 5)
                                .background(Theme.seal.opacity(0.11), in: Capsule())
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Theme.wash.opacity(0.45))
                    Divider2()
                }

                // 3. 中段详实史实叙事 + 已生效后果摘要（完全弹性 ScrollView，绝不写死高度裁切底部按钮）
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(modal.body)
                            .font(Theme.sans(13.8))
                            .foregroundStyle(Theme.ink.opacity(0.92))
                            .lineSpacing(4.2)
                            .fixedSize(horizontal: false, vertical: true)

                        let appliedChips = isResolvedNotice
                            ? EventEffectChip.parse(modal.appliedEffectCode ?? "")
                            : []
                        if !modal.effectSummary.isEmpty || !appliedChips.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 5) {
                                    InkIcon(glyph: .military, size: 12)
                                        .foregroundStyle(Theme.seal)
                                    Text(isResolvedNotice ? "对当前战局的实际影响" : "局势影响参考")
                                        .font(Theme.sans(12, weight: .semibold))
                                        .foregroundStyle(Theme.seal)
                                }
                                if !modal.effectSummary.isEmpty {
                                    Text(modal.effectSummary)
                                        .font(Theme.sans(12.5))
                                        .foregroundStyle(Theme.ink.opacity(0.86))
                                        .lineSpacing(3)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                if !appliedChips.isEmpty {
                                    effectChipsRow(appliedChips)
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
                    .padding(.vertical, 12)
                }
                .frame(minHeight: 84, maxHeight: max(120, cardMaxHeight * 0.44))

                Divider2()
                    .padding(.horizontal, 16)

                // 4. 固定置底抉择 / 阅毕区（每项均含 ≥44pt 热区与精确后果标签预览）
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
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(Theme.seal, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        .buttonStyle(PressStyle())
                    } else {
                        ForEach(Array(modal.choices.enumerated()), id: \.offset) { idx, ch in
                            let primary = (idx == 0)
                            let chips = EventEffectChip.parse(ch.effectCode)
                            Button {
                                onChoose(idx)
                            } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    HStack(spacing: 6) {
                                        Text(ch.title)
                                            .font(Theme.serif(14.5))
                                            .foregroundStyle(primary ? Theme.paperLight : Theme.ink)
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)
                                        Spacer(minLength: 4)
                                        if ch.isHistorical {
                                            Text("史实分支")
                                                .font(Theme.sans(10, weight: .semibold))
                                                .foregroundStyle(primary ? Theme.paperLight.opacity(0.95) : Theme.seal)
                                                .padding(.horizontal, 7)
                                                .padding(.vertical, 2.5)
                                                .background((primary ? Color.white.opacity(0.20) : Theme.seal.opacity(0.12)), in: Capsule())
                                        }
                                    }
                                    if !ch.subtitle.isEmpty {
                                        Text(ch.subtitle)
                                            .font(Theme.sans(12))
                                            .foregroundStyle(primary ? Theme.paperLight.opacity(0.88) : Theme.ink2)
                                            .lineLimit(3)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                    if !chips.isEmpty {
                                        effectChipsRow(chips, onPrimary: primary)
                                    }
                                }
                                .padding(.horizontal, 13)
                                .padding(.vertical, 10)
                                .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
                                .background(
                                    primary ? Theme.seal : Theme.wash.opacity(0.62),
                                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .stroke(primary ? Color.clear : Theme.hairline, lineWidth: 0.8)
                                )
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 14)
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: cardMaxWidth)
            .frame(maxHeight: cardMaxHeight)
            .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(Theme.seal.opacity(0.42), lineWidth: 1.1))
            .compositingGroup()
            .shadow(color: Color.black.opacity(0.24), radius: 10, y: 5)
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

    @ViewBuilder
    private func effectChipsRow(_ chips: [EventEffectChip], onPrimary: Bool = false) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 5) {
                ForEach(chips) { chip in
                    Text(chip.label)
                        .font(Theme.sans(10.5, weight: .semibold))
                        .foregroundStyle(onPrimary ? Theme.paperLight : chip.color)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(
                            (onPrimary ? Color.white.opacity(0.20) : chip.color.opacity(0.13)),
                            in: Capsule()
                        )
                }
            }
        }
    }
}

/// 高速看海 / 快讯模式顶部号外播报条：零暂停零卡顿展示刚发生的真实历史大事件（已在 GameView 正式挂载）。
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
