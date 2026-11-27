import SwiftUI
import UIKit
import ImageIO
import LieguojiCore

/// 零主线程卡顿的历史事件卷轴插图异步解码缓存（ImageIO 下采样至 840px + NSCache 复用，彻底根治弹窗掉帧）。
private enum EventScrollImageCache {
    private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 18
        c.totalCostLimit = 16 * 1024 * 1024
        return c
    }()

    static func cached(_ key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    static func loadAsync(_ key: String) async -> UIImage? {
        guard !key.isEmpty else { return nil }
        if let hit = cache.object(forKey: key as NSString) { return hit }
        return await Task.detached(priority: .userInitiated) { () -> UIImage? in
            for ext in ["png", "jpg", "webp"] {
                guard let url = HotPackManager.resourceURL(name: key, ext: ext, subdirectory: "EventScrolls") else { continue }
                guard let src = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else { continue }
                let opts: [CFString: Any] = [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceShouldCacheImmediately: true,
                    kCGImageSourceThumbnailMaxPixelSize: 840,
                ]
                if let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) {
                    let img = UIImage(cgImage: cg)
                    cache.setObject(img, forKey: key as NSString, cost: cg.bytesPerRow * cg.height)
                    return img
                }
            }
            return nil
        }.value
    }
}

/// v9.0.0 丝滑零卡顿、横竖屏自适应不裁切的历史大事件报刊/诏令弹窗：
/// - 插图 100% 后台线程下采样解码与内存缓存，主线程 0ms I/O；
/// - 中段正文置入有界 ScrollView，底部抉择按钮常驻置底，横竖屏任何 iPhone 尺寸绝不溢出裁切；
/// - 顶部内置「快讯不暂停」一键开关，高速看海时可零打断以顶部号外条播报已生效史实大事件。
struct HistoricalEventModalOverlay: View {
    let modal: HistoricalEvents.PendingModal
    let route: String
    let onChoose: (Int) -> Void

    @AppStorage("events.expressBanner") private var expressBanner: Bool = false
    @State private var decodedImage: UIImage?

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height
            let cardMaxWidth: CGFloat = isLandscape ? min(520, geo.size.width - 64) : min(410, geo.size.width - 32)
            let cardMaxHeight: CGFloat = max(280, geo.size.height - (isLandscape ? 28 : 76))
            let bannerHeight: CGFloat = isLandscape ? 84 : 116

            ZStack {
                Color.black.opacity(0.42)
                    .ignoresSafeArea()

                VStack(alignment: .leading, spacing: 0) {
                    // 1. 报刊页眉（固定不滚）
                    HStack(spacing: 8) {
                        PaperTag(text: route == "sandbox" ? "架空分支" : "史实大事记", color: Theme.seal, size: 11)
                        Text(modal.dateLabel)
                            .font(Theme.caption)
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink2)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        Button {
                            GameFeel.shared.tap()
                            expressBanner.toggle()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: expressBanner ? "bolt.fill" : "bolt")
                                    .font(.system(size: 10, weight: .semibold))
                                Text(expressBanner ? "快讯已开" : "快讯不暂停")
                                    .font(Theme.sans(10.5, weight: .medium))
                            }
                            .foregroundStyle(expressBanner ? Theme.paperLight : Theme.ink2)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(
                                expressBanner ? Theme.seal : Theme.wash.opacity(0.65),
                                in: Capsule()
                            )
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 13)
                    .padding(.bottom, 9)

                    // 2. 异步加载的战史画卷横幅（固定高度防跳变）
                    ZStack(alignment: .bottomLeading) {
                        if let img = decodedImage {
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFill()
                                .frame(maxWidth: .infinity)
                                .frame(height: bannerHeight)
                                .clipped()
                        } else {
                            LinearGradient(
                                colors: [Theme.wash.opacity(0.72), Theme.paper2.opacity(0.92)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                            .frame(maxWidth: .infinity)
                            .frame(height: bannerHeight)
                        }
                        LinearGradient(
                            colors: [.clear, Theme.paperLight.opacity(0.92)],
                            startPoint: .center,
                            endPoint: .bottom
                        )
                        .frame(height: bannerHeight)
                        Text(modal.title)
                            .font(Theme.kai(isLandscape ? 20 : 22))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(2)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 6)
                    }
                    .frame(height: bannerHeight)
                    .clipped()

                    // 3. 中段正文与战局实效（有界 ScrollView，确保横竖屏永不裁切）
                    ScrollView(.vertical, showsIndicators: true) {
                        VStack(alignment: .leading, spacing: 8) {
                            if !modal.headline.isEmpty {
                                Text(modal.headline)
                                    .font(Theme.serif(14.5))
                                    .foregroundStyle(Theme.seal)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Text(modal.body)
                                .font(Theme.sans(13.5))
                                .foregroundStyle(Theme.ink.opacity(0.90))
                                .lineSpacing(3.5)
                                .fixedSize(horizontal: false, vertical: true)
                            if !modal.effectSummary.isEmpty {
                                HStack(alignment: .top, spacing: 6) {
                                    Image(systemName: "seal.fill")
                                        .font(.system(size: 10))
                                        .foregroundStyle(Theme.seal)
                                        .padding(.top, 2)
                                    Text("战局实效：\(modal.effectSummary)")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                    .frame(maxHeight: max(110, cardMaxHeight - bannerHeight - 172))

                    Divider2()
                        .padding(.horizontal, 16)

                    // 4. 固定置底抉择按钮（永远清晰可点）
                    VStack(spacing: 8) {
                        ForEach(Array(modal.choices.enumerated()), id: \.offset) { idx, ch in
                            let primary = (idx == 0)
                            Button {
                                onChoose(idx)
                            } label: {
                                VStack(alignment: .leading, spacing: 2.5) {
                                    HStack(spacing: 6) {
                                        Text(ch.title)
                                            .font(Theme.serif(14.5))
                                            .foregroundStyle(primary ? Theme.paperLight : Theme.ink)
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)
                                        Spacer(minLength: 4)
                                        if ch.isHistorical {
                                            Text("史实")
                                                .font(Theme.sans(10, weight: .semibold))
                                                .foregroundStyle(primary ? Theme.paperLight.opacity(0.92) : Theme.seal)
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 2)
                                                .background((primary ? Color.white.opacity(0.18) : Theme.seal.opacity(0.12)), in: Capsule())
                                        }
                                    }
                                    if !ch.subtitle.isEmpty {
                                        Text(ch.subtitle)
                                            .font(Theme.caption)
                                            .foregroundStyle(primary ? Theme.paperLight.opacity(0.88) : Theme.ink2)
                                            .lineLimit(2)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                                .padding(.horizontal, 13)
                                .padding(.vertical, 9)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(
                                    primary ? Theme.seal : Theme.wash.opacity(0.55),
                                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .stroke(primary ? Color.clear : Theme.hairline, lineWidth: 0.75)
                                )
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .padding(.bottom, 14)
                }
                .frame(maxWidth: cardMaxWidth)
                .frame(maxHeight: cardMaxHeight)
                .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(Theme.seal.opacity(0.42), lineWidth: 1.1))
                .shadow(color: Color.black.opacity(0.20), radius: 8, y: 4)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .task(id: modal.illustration) {
            if let hit = EventScrollImageCache.cached(modal.illustration) {
                decodedImage = hit
            } else {
                decodedImage = nil
                decodedImage = await EventScrollImageCache.loadAsync(modal.illustration)
            }
        }
    }
}

/// 高速看海 / 快讯模式顶部号外播报条：零暂停零卡顿展示刚发生的真实历史大事件。
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
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.ink2)
                    .padding(6)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.paperLight.opacity(0.96), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.seal.opacity(0.38), lineWidth: 0.9))
        .shadow(color: Color.black.opacity(0.14), radius: 5, y: 2)
        .contentShape(Rectangle())
        .onTapGesture { onTapOpen() }
    }
}
