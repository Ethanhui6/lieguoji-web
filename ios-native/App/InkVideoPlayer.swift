import SwiftUI
import UIKit
import AVFoundation

/// 原生硬件加速古风水墨短视频循环播放器（AVQueuePlayer + AVPlayerLooper）：
/// - 100% 静音、零音频会话抢占、不打断背景雅乐，60fps 硬件解码丝滑循环；
/// - 宣纸羽化晕边蒙版（Feathered Parchment Mask），使动态水墨视频画卷与御卷/奏折底纸浑然天成。
struct InkVideoStage: View {
    let clip: String
    var cornerRadius: CGFloat = 8
    var tint: Color = Theme.seal

    private static let urlCache: [String: URL] = {
        let names = ["herald-war", "herald-naval", "herald-siege", "herald-peace", "herald-regime", "herald-weather"]
        var map: [String: URL] = [:]
        for n in names {
            if let u = Bundle.main.url(forResource: n, withExtension: "mp4", subdirectory: "Video") ?? Bundle.main.url(forResource: n, withExtension: "mp4") {
                map[n] = u
            }
        }
        return map
    }()

    static func url(for name: String) -> URL? {
        urlCache[name]
    }

    static func hasVideo(_ name: String) -> Bool {
        urlCache[name] != nil
    }

    var body: some View {
        ZStack {
            InkVideoPlayerRepresentable(clip: clip)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .mask(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            RadialGradient(
                                colors: [.white, .white, .white.opacity(0.92), .white.opacity(0.65)],
                                center: .center,
                                startRadius: 4,
                                endRadius: 56
                            )
                        )
                )
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [tint.opacity(0.36), Color(red: 0.82, green: 0.66, blue: 0.32).opacity(0.42), tint.opacity(0.22)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 0.85
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
    private var currentClip: String = ""
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
        let art: UIImage?
        let bgTop: UIColor
        let bgBot: UIColor
        switch clip {
        case "herald-naval":
            art = BundleArt.navalEast
            bgTop = UIColor(red: 0.90, green: 0.94, blue: 0.95, alpha: 1)
            bgBot = UIColor(red: 0.78, green: 0.87, blue: 0.90, alpha: 1)
        case "herald-siege":
            art = BundleArt.fxSiegeFlame
            bgTop = UIColor(red: 0.96, green: 0.90, blue: 0.84, alpha: 1)
            bgBot = UIColor(red: 0.89, green: 0.78, blue: 0.68, alpha: 1)
        case "herald-peace":
            art = BundleArt.heraldPeace
            bgTop = UIColor(red: 0.93, green: 0.96, blue: 0.93, alpha: 1)
            bgBot = UIColor(red: 0.85, green: 0.92, blue: 0.87, alpha: 1)
        case "herald-regime":
            art = BundleArt.heraldEdictEast
            bgTop = UIColor(red: 0.98, green: 0.94, blue: 0.85, alpha: 1)
            bgBot = UIColor(red: 0.93, green: 0.86, blue: 0.72, alpha: 1)
        case "herald-weather":
            art = BundleArt.fxWeatherSnow
            bgTop = UIColor(red: 0.92, green: 0.95, blue: 0.98, alpha: 1)
            bgBot = UIColor(red: 0.83, green: 0.89, blue: 0.95, alpha: 1)
        default:
            art = BundleArt.heraldWarEast
            bgTop = UIColor(red: 0.96, green: 0.91, blue: 0.85, alpha: 1)
            bgBot = UIColor(red: 0.91, green: 0.82, blue: 0.73, alpha: 1)
        }
        let size = CGSize(width: 240, height: 135)
        let img = UIGraphicsImageRenderer(size: size).image { ctx in
            let g = ctx.cgContext
            let space = CGColorSpaceCreateDeviceRGB()
            if let grad = CGGradient(colorsSpace: space, colors: [bgTop.cgColor, bgBot.cgColor] as CFArray, locations: [0, 1]) {
                g.drawLinearGradient(grad, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
            }
            if let art {
                let h: CGFloat = 114
                let w = h * (art.size.width / max(1, art.size.height))
                art.draw(in: CGRect(x: (size.width - w) * 0.5, y: (size.height - h) * 0.5, width: w, height: h), blendMode: .normal, alpha: 0.94)
            }
        }
        posterCache[clip] = img
        return img
    }

    func load(clip: String) {
        guard clip != currentClip else { return }
        teardown()
        currentClip = clip
        posterView.image = Self.posterImage(for: clip)
        // 无头模拟器巡览（LGJ_SHOT=1）时仅展示首帧画卷底图，避免无硬件音频/视频解码器的 CI 虚拟机 mediaserverd 与 simctl io 争用死锁；真机与常规运行走 AVQueuePlayer 硬件循环解码。
        guard !ShotTour.on, let url = InkVideoStage.url(for: clip) else {
            posterView.isHidden = false
            return
        }
        posterView.isHidden = true
        let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: false])
        let item = AVPlayerItem(asset: asset)
        let player = AVQueuePlayer()
        player.isMuted = true
        player.volume = 0
        player.preventsDisplaySleepDuringVideoPlayback = false
        player.automaticallyWaitsToMinimizeStalling = false
        let looper = AVPlayerLooper(player: player, templateItem: item)
        self.queuePlayer = player
        self.looper = looper
        playerLayer.player = player
        player.play()
    }

    func teardown() {
        queuePlayer?.pause()
        looper?.disableLooping()
        looper = nil
        playerLayer.player = nil
        queuePlayer?.removeAllItems()
        queuePlayer = nil
        currentClip = ""
    }

    deinit {
        queuePlayer?.pause()
        looper?.disableLooping()
    }
}
