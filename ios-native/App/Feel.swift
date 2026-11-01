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
