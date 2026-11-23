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

    static func url(for name: String) -> URL? {
        if let u = Bundle.main.url(forResource: name, withExtension: "mp4", subdirectory: "Video") { return u }
        return Bundle.main.url(forResource: name, withExtension: "mp4")
    }

    static func hasVideo(_ name: String) -> Bool {
        url(for: name) != nil
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

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        playerLayer.videoGravity = .resizeAspectFill
        playerLayer.backgroundColor = UIColor.clear.cgColor
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    func load(clip: String) {
        guard clip != currentClip else {
            if queuePlayer?.timeControlStatus != .playing {
                queuePlayer?.play()
            }
            return
        }
        teardown()
        guard let url = InkVideoStage.url(for: clip) else { return }
        currentClip = clip
        let asset = AVURLAsset(url: url)
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
