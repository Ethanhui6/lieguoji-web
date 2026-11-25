import SwiftUI
import AVFoundation
import UIKit

/// Sound and touch: the original's background music (RandomMusicPlayer: its five tracks in random
/// order, one after another), haptic feedback, and the switches for both and for particle effects.
@MainActor final class GameFeel: NSObject, ObservableObject, AVAudioPlayerDelegate {
    static let shared = GameFeel()

    @Published var music: Bool { didSet { store(); music ? play() : fadeOut() } }
    @Published var volume: Double { didSet { store(); player?.volume = Float(volume) } }
    @Published var sfx: Bool { didSet { store() } }
    @Published var sfxVolume: Double { didSet { store() } }
    @Published var haptics: Bool { didSet { store() } }
    @Published var particles: Bool { didSet { store(); EffectsView.particles = particles } }
    /// Opening a big panel pauses the world (and the map redraws at 30 fps) until it closes.
    @Published var pauseInMenus: Bool { didSet { store() } }
    @Published private(set) var track = ""

    enum InkSound: String, CaseIterable {
        case seal   = "sfx-seal"
        case scroll = "sfx-scroll"
        case anchor = "sfx-anchor"
        case march  = "sfx-march"
        case clash  = "sfx-clash"
        case cannon = "sfx-cannon"
        case herald = "sfx-herald"
    }

    static let tracks = ["deplasa-pe", "final-stance", "guild-of-adventurers", "land-of-heroes", "wonders-and-mysteries-alt"]
    static let trackNames = ["deplasa-pe": "Deplasa Pe", "final-stance": "Final Stance", "guild-of-adventurers": "Guild of Adventurers",
                             "land-of-heroes": "Land of Heroes", "wonders-and-mysteries-alt": "Wonders and Mysteries"]
    private var player: AVAudioPlayer?
    private var sfxPlayers = [InkSound: AVAudioPlayer]()
    private var queue: [String] = []

    private override init() {
        let d = UserDefaults.standard
        music = d.object(forKey: "feel.music") as? Bool ?? true
        volume = d.object(forKey: "feel.volume") as? Double ?? 0.55
        sfx = d.object(forKey: "feel.sfx") as? Bool ?? true
        sfxVolume = d.object(forKey: "feel.sfxVolume") as? Double ?? 0.65
        haptics = d.object(forKey: "feel.haptics") as? Bool ?? true
        particles = d.object(forKey: "feel.particles") as? Bool ?? true
        pauseInMenus = d.object(forKey: "feel.pauseInMenus") as? Bool ?? true
        super.init()
        EffectsView.particles = particles
    }
    private func store() {
        let d = UserDefaults.standard
        d.set(music, forKey: "feel.music"); d.set(volume, forKey: "feel.volume")
        d.set(sfx, forKey: "feel.sfx"); d.set(sfxVolume, forKey: "feel.sfxVolume")
        d.set(haptics, forKey: "feel.haptics"); d.set(particles, forKey: "feel.particles"); d.set(pauseInMenus, forKey: "feel.pauseInMenus")
    }

    // MARK: music

    /// Starts the music if it is on (ambient: it mixes with other audio and follows the silent switch).
    func start() {
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default)
        // A longer audio buffer: under a busy simulation the music no longer drops samples (heard as crackle).
        try? AVAudioSession.sharedInstance().setPreferredIOBufferDuration(0.046)
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

    // MARK: haptics & antique SFX

    private let light = UIImpactFeedbackGenerator(style: .light), heavy = UIImpactFeedbackGenerator(style: .heavy), rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notice = UINotificationFeedbackGenerator()
    func playSfx(_ sound: InkSound, gain: Float = 1.0) {
        guard sfx, !ShotTour.on else { return }
        guard due("sfx.\(sound.rawValue)", sound == .seal ? 0.08 : 0.25) else { return }
        if let cached = sfxPlayers[sound] {
            cached.volume = Float(sfxVolume) * gain
            cached.currentTime = 0
            cached.play()
            return
        }
        guard let url = Bundle.main.url(forResource: sound.rawValue, withExtension: "wav", subdirectory: "Audio")
                ?? Bundle.main.url(forResource: sound.rawValue, withExtension: "wav"),
              let p = try? AVAudioPlayer(contentsOf: url) else { return }
        p.volume = Float(sfxVolume) * gain
        p.prepareToPlay()
        p.play()
        sfxPlayers[sound] = p
    }
    func tap() { if haptics { light.impactOccurred() }; playSfx(.seal, gain: 0.42) }
    func scrollOpen() { if haptics { light.impactOccurred(intensity: 0.55) }; playSfx(.scroll, gain: 0.55) }
    func orderMarch() { if haptics { rigid.impactOccurred(intensity: 0.7) }; playSfx(.march, gain: 0.75) }
    func orderAnchor() { if haptics { rigid.impactOccurred(intensity: 0.65) }; playSfx(.anchor, gain: 0.72) }
    /// A new battle: at most once every eight seconds (with many armies a new fight began every step,
    /// and the phone buzzed without pause).
    func clash() {
        if due("clash", 8) {
            if haptics { rigid.impactOccurred(intensity: 0.6) }
            playSfx(.clash, gain: 0.58)
        }
    }
    func cannon() {
        if due("cannon", 6) {
            if haptics { heavy.impactOccurred(intensity: 0.55) }
            playSfx(.cannon, gain: 0.65)
        }
    }
    /// News of the world (a war, a peace, a fall): at most once every five seconds, each kind.
    func news(_ kind: UINotificationFeedbackGenerator.FeedbackType) {
        if due("news", 5) {
            if haptics { notice.notificationOccurred(kind) }
            playSfx(kind == .warning ? .clash : .herald, gain: 0.62)
        }
    }
    func newsTap() {
        if due("news", 5) {
            if haptics { light.impactOccurred(intensity: 0.6) }
            playSfx(.herald, gain: 0.48)
        }
    }
    private var last = [String: CFTimeInterval]()
    private func due(_ key: String, _ gap: CFTimeInterval) -> Bool {
        let now = CACurrentMediaTime()
        if let t = last[key], now - t < gap { return false }
        last[key] = now; return true
    }
    func notify(_ kind: UINotificationFeedbackGenerator.FeedbackType) { if haptics { notice.notificationOccurred(kind) } }
}

/// 远程计算与云端服务：支持局域网直连（2–8ms）与云端高速 WebSocket 中转、退后台自动无感重连、实时延迟监测与一键云端存档同步。
struct RemoteSettings: View {
    @ObservedObject var model: GameModel
    @State private var address = UserDefaults.standard.string(forKey: "remote.address") ?? ""
    @State private var roomCode = UserDefaults.standard.string(forKey: "remote.roomCode") ?? ""
    @State private var busy = false
    @State private var cloudUploading = false
    @State private var message = ""
    @State private var messageGood = false
    @State private var advanced = false

    private var statusTitle: String {
        if model.remoteAddress != nil {
            let rtt = model.remoteRTTMs.map { " · \($0)ms" } ?? ""
            return "已连电脑（\(model.remoteTransport.isEmpty ? "远程" : model.remoteTransport)\(rtt)）"
        }
        if model.remoteReconnecting { return "正在无感重连电脑…" }
        return model.autoRemote ? "正在待命连接电脑" : "本机推演"
    }
    private var statusSubtitle: String {
        if let addr = model.remoteAddress { return "\(addr) · 电脑后台持续预推演，手机低发热零卡顿" }
        if model.remoteReconnecting { return "世界仍热保存在电脑内存中，返回前台自动续接" }
        return model.autoRemote ? "电脑开着「列国纪远程计算 v5」即自动接入，切后台不断档" : "开启后自动将重型模拟交由电脑运行，手机仅负责渲染画面"
    }

    var body: some View {
        Group2 {
            HStack(spacing: 10) {
                Circle()
                    .fill(model.remoteAddress != nil ? Theme.jade : (model.remoteReconnecting || model.autoRemote) ? Color.orange.opacity(0.75) : Theme.ink.opacity(0.25))
                    .frame(width: 9, height: 9)
                VStack(alignment: .leading, spacing: 2) {
                    Text(statusTitle).font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit()
                    Text(statusSubtitle).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 6)
                if busy { InkBusy().frame(width: 48) }
                else if model.remoteAddress == nil {
                    Button("立即连接") {
                        busy = true; message = ""
                        Task {
                            let ok = await model.findComputerNow()
                            busy = false
                            messageGood = ok
                            message = ok ? "已接通电脑算力，大地图推演将由电脑承担。" : "未发现电脑在线：请先在电脑运行「列国纪远程计算 v5」（配对码 \(NativeHost.activeRoomCode)）。"
                            GameFeel.shared.notify(ok ? .success : .warning)
                        }
                    }
                    .font(Theme.body).foregroundStyle(Theme.seal)
                } else {
                    HStack(spacing: 12) {
                        Button("测速") {
                            busy = true
                            Task {
                                let ms = await model.refreshRemoteRTT()
                                busy = false
                                messageGood = ms != nil
                                message = ms.map { "当前往返延迟 \($0) ms，连接稳固。" } ?? "测速超时，已触发自动重连。"
                            }
                        }
                        .font(Theme.label).foregroundStyle(Theme.jade)
                        Button("断开") { busy = true; Task { await model.disconnectRemote(); busy = false; message = "" } }
                            .font(Theme.label).foregroundStyle(Theme.seal)
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)

            if !message.isEmpty {
                Text(message).font(Theme.label).foregroundStyle(messageGood ? Theme.jade : Theme.seal)
                    .padding(.horizontal, 16).padding(.bottom, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Divider2()
            PaperSwitch(title: "自动连接我的电脑计算", on: Binding(get: { model.autoRemote }, set: { model.autoRemote = $0 }))
            Divider2()
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("云端存档即时同步").font(Theme.body).foregroundStyle(Theme.ink)
                    Text("房间码 \(NativeHost.activeRoomCode) · 无需电脑开机，换设备随时下载").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                Spacer(minLength: 6)
                EditorialTactileButton(title: cloudUploading ? "上传中…" : "上传云端", solid: true, compact: true) {
                    guard !cloudUploading else { return }
                    cloudUploading = true; message = ""
                    Task {
                        let res = await model.uploadCurrentToCloud()
                        switch res {
                        case .success(let card):
                            messageGood = true
                            message = "云端存档已同步：「\(card.title)」（\(card.sizeText)）"
                            GameFeel.shared.notify(.success)
                        case .failure(let err):
                            messageGood = false
                            message = err.localizedDescription
                            GameFeel.shared.notify(.error)
                        }
                        cloudUploading = false
                    }
                }
                .disabled(cloudUploading || (model.state == nil && !model.hasSave))
            }
            .padding(.horizontal, 16).padding(.vertical, 11)
            Divider2()
            Button { withAnimation(Motion.tap) { advanced.toggle() } } label: {
                HStack {
                    Text("高级：自定配对码或手动直连地址").font(Theme.label).foregroundStyle(Theme.ink2)
                    Spacer()
                    InkIcon(glyph: .chevronDown, size: 11, weight: 1.7).foregroundStyle(Theme.ink2).rotationEffect(.degrees(advanced ? 180 : 0))
                }
                .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if advanced {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        TextField("", text: $roomCode, prompt: Text("专属房间码（默认 \(RemoteRoom.personal)）").foregroundColor(Theme.ink2.opacity(0.6)))
                            .paperField().keyboardType(.asciiCapable).autocorrectionDisabled().textInputAutocapitalization(.characters)
                        Button("保存") {
                            let clean = roomCode.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "-", with: "").uppercased()
                            UserDefaults.standard.set(clean, forKey: "remote.roomCode")
                            messageGood = true
                            message = "房间码已更新为 \(NativeHost.activeRoomCode)（电脑端 pairing.txt 填相同码即可配对）"
                        }
                        .font(Theme.body).foregroundStyle(Theme.seal)
                    }
                    if model.remoteAddress == nil {
                        HStack {
                            TextField("", text: $address, prompt: Text("局域网 IP:8765 或配对码").foregroundColor(Theme.ink2.opacity(0.6)))
                                .paperField().keyboardType(.asciiCapable).autocorrectionDisabled().textInputAutocapitalization(.never)
                            Button("直连") {
                                busy = true; message = ""
                                Task {
                                    let error = await model.connectRemote(address)
                                    busy = false
                                    messageGood = (error == nil)
                                    message = error ?? "已成功接入电脑计算。"
                                    GameFeel.shared.notify(error == nil ? .success : .error)
                                }
                            }
                            .font(Theme.body).foregroundStyle(Theme.seal).disabled(busy || address.isEmpty)
                        }
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 12)
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
            VStack(alignment: .leading, spacing: 8) {
                if feel.music && !feel.track.isEmpty {
                    Button { feel.next() } label: {
                        HStack(spacing: 6) {
                            InkIcon(glyph: .play, size: 12, weight: 1.8)
                            Text("切曲 · \(feel.track)").font(Theme.label).lineLimit(1)
                        }
                        .foregroundStyle(Theme.seal)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                PaperSlider(title: "音乐音量", value: $feel.volume, range: 0...1, step: 0.05) { "\(Int($0 * 100))%" }
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            Divider2()
            PaperSwitch(title: "古风交互音效（落印/翻卷/兵戈/海炮）", on: $feel.sfx)
            if feel.sfx {
                PaperSlider(title: "音效音量", value: $feel.sfxVolume, range: 0...1, step: 0.05) { "\(Int($0 * 100))%" }
                    .padding(.horizontal, 16).padding(.bottom, 8)
            }
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
