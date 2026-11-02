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
    /// Opening a big panel pauses the world (and the map redraws at 30 fps) until it closes.
    @Published var pauseInMenus: Bool { didSet { store() } }
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
        pauseInMenus = d.object(forKey: "feel.pauseInMenus") as? Bool ?? true
        super.init()
        EffectsView.particles = particles
    }
    private func store() {
        let d = UserDefaults.standard
        d.set(music, forKey: "feel.music"); d.set(volume, forKey: "feel.volume"); d.set(haptics, forKey: "feel.haptics"); d.set(particles, forKey: "feel.particles"); d.set(pauseInMenus, forKey: "feel.pauseInMenus")
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
    @State private var advanced = false
    /// 傻瓜式: the phone finds the player's computer by itself; nothing to type. Only a status, a
    /// "find now" button and the on/off switch show; a manual address hides under 高级.
    var body: some View {
        Group2 {
            HStack(spacing: 10) {
                Circle().fill(model.remoteAddress != nil ? Theme.jade : model.autoRemote ? Color.orange.opacity(0.7) : Theme.ink.opacity(0.25)).frame(width: 9, height: 9)
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.remoteAddress != nil ? "已连接你的电脑" : model.autoRemote ? "正在等你的电脑上线" : "本机计算").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                    Text(model.remoteAddress ?? (model.autoRemote ? "电脑开着就会自动接上，不用填写任何东西" : "推演由手机完成")).font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                }
                Spacer()
                if busy { ProgressView().tint(Theme.seal) }
                else if model.remoteAddress == nil && model.autoRemote {
                    Button("立即查找") {
                        busy = true; message = ""
                        Task { let ok = await model.findComputerNow(); busy = false; message = ok ? "" : "没找到电脑：请确认电脑上的「列国纪远程计算」在运行。"; GameFeel.shared.notify(ok ? .success : .warning) }
                    }
                    .font(Theme.kai(15)).foregroundStyle(Theme.seal)
                } else if model.remoteAddress != nil {
                    Button("断开") { busy = true; Task { await model.disconnectRemote(); busy = false } }.font(Theme.kai(15)).foregroundStyle(Theme.seal)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            if !message.isEmpty { Text(message).font(Theme.kai(13)).foregroundStyle(Theme.seal).padding(.horizontal, 16).padding(.bottom, 10).frame(maxWidth: .infinity, alignment: .leading) }
            Divider2()
            PaperSwitch(title: "用我的电脑计算（自动）", on: Binding(get: { model.autoRemote }, set: { model.autoRemote = $0 }))
            Divider2()
            Text("只需在电脑上运行一次「列国纪远程计算」（之后开机自动运行），手机进入世界就会自动接上：同一 Wi-Fi 直连，在外面经中转。").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                .padding(.horizontal, 16).padding(.vertical, 10).fixedSize(horizontal: false, vertical: true)
            Divider2()
            Button { withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { advanced.toggle() } } label: {
                HStack { Text("高级：手动连接（一般不需要）").font(Theme.kai(14)).foregroundStyle(Theme.ink2); Spacer(); Image(systemName: advanced ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.ink2) }
                    .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if advanced && model.remoteAddress == nil {
                HStack {
                    TextField("", text: $address, prompt: Text("局域网地址或配对码").foregroundColor(Theme.ink2.opacity(0.6)))
                        .font(Theme.kai(15)).keyboardType(.asciiCapable).autocorrectionDisabled().textInputAutocapitalization(.never)
                    Button("连接") {
                        busy = true; message = ""
                        Task { let error = await model.connectRemote(address); busy = false; message = error ?? ""; GameFeel.shared.notify(error == nil ? .success : .error) }
                    }
                    .font(Theme.kai(15)).foregroundStyle(Theme.seal).disabled(busy || address.isEmpty)
                }
                .padding(.horizontal, 16).padding(.bottom, 10)
            }
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
            Divider2()
            PaperSwitch(title: "打开面板时暂停（更流畅）", on: $feel.pauseInMenus)
        }
        .padding(.horizontal, 16)
    }
}
