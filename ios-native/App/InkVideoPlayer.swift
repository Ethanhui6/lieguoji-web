import SwiftUI
import UIKit
import ImageIO

/// 轻量级古风历史长卷画卷舞台（零 AVQueuePlayer/H.264 硬件解码内存与 mediaserverd 发热卡顿）：
/// - 完整保留 54 卷全文明预烘焙历史长卷画作（poster-*.jpg），8MB 有界缓存且支持系统内存警告自动释放；
/// - 0 毫秒瞬间显现，辅以零 CPU 占用的轻柔 CoreAnimation 镜缓缓推（Ken Burns），彻底杜绝传报与面板拉起视频解码器引发的发烫、掉帧与真机闪退。
struct InkVideoStage: View {
    let clip: String
    var cornerRadius: CGFloat = 8
    var tint: Color = Theme.seal
    var playVideo: Bool = true

    static let allClips: [String] = [
        "herald-war", "herald-naval", "herald-siege", "herald-peace", "herald-regime", "herald-weather",
        "herald-coronation", "herald-reform", "herald-voyage", "herald-relief",
        "herald-uprising", "herald-marriage", "herald-drought", "herald-plague",
        "herald-voyage-fleet", "herald-flood", "herald-capture", "herald-extinction", "herald-alliance",
        "herald-cavalry", "herald-ambush", "herald-artillery", "herald-winter-march",
        "herald-samurai-charge", "herald-knights-joust", "herald-desert-war", "herald-camp-muster",
        "herald-fire-ships", "herald-longship-raid", "herald-galleon-broadside", "herald-harbor-trade", "herald-blockade",
        "herald-senate", "herald-parliament", "herald-election", "herald-exam-hall",
        "herald-shogun-court", "herald-sultan-divan", "herald-vassal-tribute",
        "herald-spy", "herald-banquet", "herald-ultimatum", "herald-succession", "herald-betrayal",
        "herald-silkroad", "herald-mint", "herald-library", "herald-cathedral", "herald-monastery", "herald-festival",
        "herald-comet", "herald-volcano", "herald-locust", "herald-beacon"
    ]

    static func pick(from candidates: [String], seed: Int) -> String {
        let valid = candidates.filter { hasVideo($0) }
        guard !valid.isEmpty else { return candidates.first ?? "herald-war" }
        let idx = abs(seed) % valid.count
        return valid[idx]
    }

    private static let posterURLCache: [String: URL] = {
        var map: [String: URL] = [:]
        for n in allClips {
            let p = "poster-" + n
            if let u = Bundle.main.url(forResource: p, withExtension: "jpg", subdirectory: "Video")
                ?? Bundle.main.url(forResource: p, withExtension: "jpg") {
                map[n] = u
            }
        }
        return map
    }()

    static func url(for name: String) -> URL? { posterURL(for: name) }
    static func posterURL(for name: String) -> URL? {
        if let hot = HotPackManager.resourceURL(name: "poster-" + name, ext: "jpg", subdirectory: "Video") {
            return hot
        }
        return posterURLCache[name]
    }
    static func hasVideo(_ name: String) -> Bool { posterURL(for: name) != nil || allClips.contains(name) }

    var body: some View {
        ZStack {
            InkScrollPosterRepresentable(clip: clip, animate: playVideo)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [tint.opacity(0.42), Color(red: 0.82, green: 0.66, blue: 0.32).opacity(0.48), tint.opacity(0.26)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1.0
                )
        }
        .allowsHitTesting(false)
    }
}

private struct InkScrollPosterRepresentable: UIViewRepresentable {
    let clip: String
    let animate: Bool

    func makeUIView(context: Context) -> InkPlayerHostView {
        let view = InkPlayerHostView()
        view.load(clip: clip, playVideo: animate)
        return view
    }

    func updateUIView(_ uiView: InkPlayerHostView, context: Context) {
        uiView.load(clip: clip, playVideo: animate)
    }

    static func dismantleUIView(_ uiView: InkPlayerHostView, coordinator: ()) {
        uiView.teardown()
    }
}

final class InkPlayerHostView: UIView {
    private var currentClip: String = ""
    private let posterView = UIImageView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        clipsToBounds = true
        posterView.contentMode = .scaleAspectFill
        posterView.clipsToBounds = true
        posterView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        posterView.frame = bounds
        addSubview(posterView)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        posterView.frame = bounds
    }

    nonisolated private static let posterCache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 24
        c.totalCostLimit = 8 << 20
        NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { _ in
            c.removeAllObjects()
        }
        return c
    }()

    nonisolated private static let decodeQueue = DispatchQueue(label: "lieguoji.poster.decode", qos: .userInitiated, attributes: .concurrent)

    static func clearCache() { posterCache.removeAllObjects() }

    nonisolated private static func decodeDownsampled(url: URL, maxPx: CGFloat = 240) -> UIImage? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPx
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }

    private static func cachedPoster(for clip: String) -> UIImage? {
        posterCache.object(forKey: clip as NSString)
    }

    static func prewarmPoster(for clip: String) {
        let key = clip as NSString
        if posterCache.object(forKey: key) != nil { return }
        guard let url = InkVideoStage.posterURL(for: clip)
            ?? Bundle.main.url(forResource: "poster-herald-war", withExtension: "jpg", subdirectory: "Video") else { return }
        decodeQueue.async {
            if let img = decodeDownsampled(url: url, maxPx: 240) {
                let cost = Int(img.size.width * img.size.height * img.scale * img.scale * 4)
                posterCache.setObject(img, forKey: key, cost: max(1, cost))
            }
        }
    }

    func load(clip: String, playVideo: Bool = true) {
        guard clip != currentClip else { return }
        teardown()
        currentClip = clip
        let expectedClip = clip
        if let cached = Self.cachedPoster(for: clip) {
            posterView.image = cached
        } else {
            posterView.image = nil
            posterView.backgroundColor = UIColor(Theme.wash)
            if let url = InkVideoStage.posterURL(for: clip) {
                Self.decodeQueue.async { [weak self] in
                    guard let img = Self.decodeDownsampled(url: url, maxPx: 240) else { return }
                    let cost = Int(img.size.width * img.size.height * img.scale * img.scale * 4)
                    Self.posterCache.setObject(img, forKey: expectedClip as NSString, cost: max(1, cost))
                    DispatchQueue.main.async {
                        guard let self, self.currentClip == expectedClip else { return }
                        self.posterView.image = img
                        self.posterView.backgroundColor = .clear
                    }
                }
            } else {
                // 54 卷传报长卷画幅已瘦身移至腾讯云：按需秒拉 (~14 KB) 并永久缓存本地，绝不卡主线程
                Task.detached(priority: .userInitiated) { [weak self] in
                    guard let remoteURL = await HotPackManager.fetchOnDemand(path: "Video/poster-\(expectedClip).jpg"),
                          let img = Self.decodeDownsampled(url: remoteURL, maxPx: 240) else { return }
                    let cost = Int(img.size.width * img.size.height * img.scale * img.scale * 4)
                    Self.posterCache.setObject(img, forKey: expectedClip as NSString, cost: max(1, cost))
                    await MainActor.run {
                        guard let self, self.currentClip == expectedClip else { return }
                        self.posterView.image = img
                        self.posterView.backgroundColor = .clear
                    }
                }
            }
        }
        guard playVideo, !ShotTour.on, !Energy.hot, !UIAccessibility.isReduceMotionEnabled else { return }
        let zoom = CABasicAnimation(keyPath: "transform.scale")
        zoom.fromValue = 1.0
        zoom.toValue = 1.05
        zoom.duration = 3.6
        zoom.autoreverses = true
        zoom.repeatCount = .infinity
        zoom.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        posterView.layer.add(EffectsView.calm(zoom), forKey: "scrollDrift")
    }

    func teardown() {
        posterView.layer.removeAllAnimations()
        currentClip = ""
    }
}
