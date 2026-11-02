import SwiftUI
import AVFoundation
import UIKit

/// Sound and touch: the original's background music (RandomMusicPlayer: its five tracks in random
/// order, one after another), haptic feedback, and the switches for both and for particle effects.
@MainActor final class GameFeel: NSObject, ObservableObject, AVAudioPlayerDelegate {
    static let shared = GameFeel()

    @Published var music: Bool { didSet { store(); music ? play() : fadeOut() } }
    @Published var volume: Double { didSet { store(); player?.volume = Float(volume) } }
    @Published var haptics: Bool { didSet { store() } }
    @Published var particles: Bool { didSet { store(); EffectsView.particles = particles } }
    @Published private(set) var track = ""

    static let tracks = ["deplasa-pe", "final-stance", "guild-of-adventurers", "land-of-heroes", "wonders-and-mysteries-alt"]
    static let trackNames = ["deplasa-pe": "Deplasa Pe", "final-stance": "Final Stance", "guild-of-adventurers": "Guild of Adventurers",
                             "land-of-heroes": "Land of Heroes", "wonders-and-mysteries-alt": "Wonders and Mysteries"]
    private var player: AVAudioPlayer?
    private var queue: [String] = []

    private override init() {
        let d = UserDefaults.standard
        music = d.object(forKey: "feel.music") as? Bool ?? true
        volume = d.object(forKey: "feel.volume") as? Double ?? 0.55
        haptics = d.object(forKey: "feel.haptics") as? Bool ?? true
        particles = d.object(forKey: "feel.particles") as? Bool ?? true
        super.init()
        EffectsView.particles = particles
    }
    private func store() {
        let d = UserDefaults.standard
        d.set(music, forKey: "feel.music"); d.set(volume, forKey: "feel.volume"); d.set(haptics, forKey: "feel.haptics"); d.set(particles, forKey: "feel.particles")
    }

    // MARK: music

    /// Starts the music if it is on (ambient: it mixes with other audio and follows the silent switch).
    func start() {
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
        if music && player == nil { play() }
    }
    func next() { player?.stop(); player = nil; play() }
    private func play() {
        guard music else { return }
        if let player, !player.isPlaying { player.play(); fade(to: Float(volume)); return }
        if player != nil { return }
        if queue.isEmpty { queue = Self.tracks.shuffled() }
        let name = queue.removeFirst()
        guard let url = Bundle.main.url(forResource: name, withExtension: "m4a", subdirectory: "Music"), let p = try? AVAudioPlayer(contentsOf: url) else { return }
        p.delegate = self; p.volume = 0; p.prepareToPlay(); p.play()
        player = p; track = Self.trackNames[name] ?? name
        fade(to: Float(volume))
    }
    private func fade(to v: Float) { player?.setVolume(v, fadeDuration: 1.5) }
    private func fadeOut() {
        guard let p = player else { return }
        p.setVolume(0, fadeDuration: 0.8)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.85) { [weak self] in if self?.music == false { p.pause() } }
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.player = nil; self.play() }
    }

    // MARK: haptics

    private let light = UIImpactFeedbackGenerator(style: .light), heavy = UIImpactFeedbackGenerator(style: .heavy), rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notice = UINotificationFeedbackGenerator()
    func tap() { if haptics { light.impactOccurred() } }
    func thud() { if haptics { heavy.impactOccurred(intensity: 0.9) } }
    func clash() { if haptics { rigid.impactOccurred(intensity: 0.7) } }
    func notify(_ kind: UINotificationFeedbackGenerator.FeedbackType) { if haptics { notice.notificationOccurred(kind) } }
}

/// 远程计算: the computer (LieguojiServer on the same Wi-Fi) simulates, the phone only draws.
struct RemoteSettings: View {
    @ObservedObject var model: GameModel
    @State private var address = UserDefaults.standard.string(forKey: "remote.address") ?? ""
    @State private var busy = false
    @State private var message = ""
    var body: some View {
        Group2 {
            PaperSwitch(title: "自动接入我的电脑（开机即用，无需设置）", on: Binding(get: { model.autoRemote }, set: { model.autoRemote = $0 }))
            Divider2()
            HStack(spacing: 10) {
                Circle().fill(model.remoteAddress != nil ? Theme.jade : Theme.ink.opacity(0.25)).frame(width: 9, height: 9)
                Text(model.remoteAddress.map { "电脑计算中 · \($0)" } ?? "本机计算").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                Spacer()
                if busy { ProgressView().tint(Theme.seal) }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider2()
            if model.remoteAddress == nil {
                HStack {
                    TextField("", text: $address, prompt: Text("配对码（如 ABCD-2345）或局域网地址").foregroundColor(Theme.ink2.opacity(0.6)))
                        .font(Theme.kai(16)).keyboardType(.asciiCapable).autocorrectionDisabled().textInputAutocapitalization(.characters)
                    Button("连接") {
                        busy = true; message = ""
                        Task { let error = await model.connectRemote(address); busy = false; message = error ?? "已连接，推演改由电脑完成"; GameFeel.shared.notify(error == nil ? .success : .error) }
                    }
                    .font(Theme.kai(16)).foregroundStyle(Theme.seal).disabled(busy || address.isEmpty)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            } else {
                Button {
                    busy = true
                    Task { await model.disconnectRemote(); busy = false; message = "已切回本机计算" }
                } label: { Text("断开，回到本机计算").font(Theme.kai(16)).foregroundStyle(Theme.seal).frame(maxWidth: .infinity).padding(.vertical, 11) }
                .buttonStyle(.plain).disabled(busy)
            }
            if !message.isEmpty { Text(message).font(Theme.kai(13)).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.bottom, 10).frame(maxWidth: .infinity, alignment: .leading) }
            Divider2()
            Text("在电脑上运行「列国纪远程计算」LieguojiServer.exe（Windows），窗口会显示配对码。填入配对码即可连接，不需要同一 Wi-Fi，用流量在外面也行；以后进入世界会自动接入。同一 Wi-Fi 下也可填窗口里的局域网地址直连（更快）。断开时世界搬回手机继续。").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                .padding(.horizontal, 16).padding(.vertical, 10).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
    }
}

/// 声音与触感 settings (menu and title screen).
struct FeelSettings: View {
    @ObservedObject var feel = GameFeel.shared
    var body: some View {
        Group2 {
            PaperSwitch(title: "背景音乐（原作曲目）", on: $feel.music)
            Divider2()
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("音量 \(Int(feel.volume * 100))%").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                    Spacer()
                    if feel.music && !feel.track.isEmpty {
                        Button { feel.next() } label: { Label(feel.track, systemImage: "forward.fill").font(Theme.kai(13)).foregroundStyle(Theme.seal).lineLimit(1) }
                    }
                }
                Slider(value: $feel.volume, in: 0...1, step: 0.05).tint(Theme.jade)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            Divider2()
            PaperSwitch(title: "震动反馈", on: $feel.haptics)
            Divider2()
            PaperSwitch(title: "粒子特效（烟雾、火光）", on: $feel.particles)
        }
        .padding(.horizontal, 16)
    }
}
