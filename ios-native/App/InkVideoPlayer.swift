import SwiftUI
import UIKit
import AVFoundation

/// 原生硬件加速古风水墨短视频循环播放器（AVQueuePlayer + AVPlayerLooper）：
/// - 19 部全画幅 60fps 古风历史长卷视频 + 预烘焙轻量首帧缩略图（poster-*.jpg），彻底根除主线程 AVAssetImageGenerator 解码卡顿；
/// - 打开面板或横幅第 0 毫秒立即呈现预烘焙首帧画卷（< 0.5ms），延迟 0.12s 待弹簧动画丝滑落定后再异步拉起硬件 H.264 循环解码，零掉帧零白屏；
/// - 100% 静音、零音频会话抢占、不打断背景雅乐。
struct InkVideoStage: View {
    let clip: String
    var cornerRadius: CGFloat = 8
    var tint: Color = Theme.seal

    static let allClips: [String] = [
        "herald-war", "herald-naval", "herald-siege", "herald-peace", "herald-regime", "herald-weather",
        "herald-coronation", "herald-reform", "herald-voyage", "herald-relief",
        "herald-uprising", "herald-marriage", "herald-drought", "herald-plague",
        "herald-voyage-fleet", "herald-flood", "herald-capture", "herald-extinction", "herald-alliance"
    ]

    private static let urlCache: [String: URL] = {
        var map: [String: URL] = [:]
        for n in allClips {
            if let u = Bundle.main.url(forResource: n, withExtension: "mp4", subdirectory: "Video")
                ?? Bundle.main.url(forResource: n, withExtension: "mp4") {
                map[n] = u
            }
        }
        return map
    }()

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

    static func url(for name: String) -> URL? {
        urlCache[name]
    }

    static func posterURL(for name: String) -> URL? {
        posterURLCache[name]
    }

    static func hasVideo(_ name: String) -> Bool {
        urlCache[name] != nil
    }

    var body: some View {
        ZStack {
            InkVideoPlayerRepresentable(clip: clip)
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

private struct InkVideoPlayerRepresentable: UIViewRepresentable {
    let clip: String

    func makeUIView(context: Context) -> InkPlayerHostView {
        let view = InkPlayerHostView()
        view.load(clip: clip)
        return view
    }

    func updateUIView(_ uiView: InkPlayerHostView, context: Context) {
        uiView.load(clip: clip)
    }

    static func dismantleUIView(_ uiView: InkPlayerHostView, coordinator: ()) {
        uiView.teardown()
    }
}

final class InkPlayerHostView: UIView {
    override static var layerClass: AnyClass { AVPlayerLayer.self }
    private var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    private var queuePlayer: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var readyObs: NSKeyValueObservation?
    private var pendingStart: DispatchWorkItem?
    private var currentClip: String = ""
    private var loadGeneration: Int = 0
    private let posterView = UIImageView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        posterView.contentMode = .scaleAspectFill
        posterView.clipsToBounds = true
        posterView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        posterView.frame = bounds
        addSubview(posterView)
        playerLayer.videoGravity = .resizeAspectFill
        playerLayer.backgroundColor = UIColor.clear.cgColor
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        posterView.frame = bounds
    }

    private static var posterCache: [String: UIImage] = [:]
    private static func posterImage(for clip: String) -> UIImage? {
        if let cached = posterCache[clip] { return cached }
        // 零主线程视频解码：直接读取预烘焙的 320×180 JPG 首帧缩略图（< 0.5ms），彻底杜绝 AVAssetImageGenerator 同步卡顿。
        if let url = InkVideoStage.posterURL(for: clip),
           let ui = UIImage(contentsOfFile: url.path) {
            posterCache[clip] = ui
            return ui
        }
        let fallback = UIImage(contentsOfFile: Bundle.main.url(forResource: "poster-herald-war", withExtension: "jpg", subdirectory: "Video")?.path ?? "")
        if let fallback {
            posterCache[clip] = fallback
            return fallback
        }
        return nil
    }

    func load(clip: String) {
        guard clip != currentClip else { return }
        teardown()
        currentClip = clip
        loadGeneration &+= 1
        let gen = loadGeneration

        // 1. 第 0 毫秒立即展示清晰全画幅首帧静画，面板弹簧滑入与横幅展卷全程零掉帧。
        posterView.image = Self.posterImage(for: clip)
        posterView.alpha = 1
        posterView.isHidden = false

        // 无头模拟器巡览（LGJ_SHOT=1）仅展示高清首帧画卷，避免虚拟机 mediaserverd 争用。
        guard !ShotTour.on, let url = InkVideoStage.url(for: clip) else { return }

        // 2. 延后 0.12s 待弹窗/横幅首帧入场动画稳定后，再于后台轻装创建 AVURLAsset 并切入 60fps 硬件循环播放。
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.loadGeneration == gen, self.window != nil else { return }
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: false])
                let item = AVPlayerItem(asset: asset)
                item.preferredForwardBufferDuration = 1.0
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.loadGeneration == gen, self.window != nil else { return }
                    let player = AVQueuePlayer()
                    player.isMuted = true
                    player.volume = 0
                    player.preventsDisplaySleepDuringVideoPlayback = false
                    player.automaticallyWaitsToMinimizeStalling = false
                    let looper = AVPlayerLooper(player: player, templateItem: item)
                    self.queuePlayer = player
                    self.looper = looper
                    self.playerLayer.player = player
                    self.readyObs = self.playerLayer.observe(\.isReadyForDisplay, options: [.new, .initial]) { [weak self] layer, _ in
                        guard layer.isReadyForDisplay else { return }
                        DispatchQueue.main.async { [weak self] in
                            guard let self, self.loadGeneration == gen else { return }
                            UIView.animate(withDuration: 0.16, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
                                self.posterView.alpha = 0
                            } completion: { _ in
                                if self.loadGeneration == gen { self.posterView.isHidden = true }
                            }
                        }
                    }
                    player.play()
                }
            }
        }
        pendingStart = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12, execute: work)
    }

    func teardown() {
        loadGeneration &+= 1
        pendingStart?.cancel()
        pendingStart = nil
        readyObs?.invalidate()
        readyObs = nil
        queuePlayer?.pause()
        looper?.disableLooping()
        looper = nil
        playerLayer.player = nil
        queuePlayer?.removeAllItems()
        queuePlayer = nil
        currentClip = ""
    }

    deinit {
        pendingStart?.cancel()
        readyObs?.invalidate()
        queuePlayer?.pause()
        looper?.disableLooping()
    }
}
