import SwiftUI
import AVFoundation
import UIKit
import LieguojiCore

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
    private var musicFetchTask: Task<Void, Never>?
    func next() { musicFetchTask?.cancel(); player?.stop(); player = nil; play() }
    private func play() {
        guard music else { return }
        if let player, !player.isPlaying { player.play(); fade(to: Float(volume)); return }
        if player != nil { return }
        if queue.isEmpty { queue = Self.tracks.shuffled() }
        let name = queue.removeFirst()
        if let url = HotPackManager.resourceURL(name: name, ext: "m4a", subdirectory: "Music") {
            startTrack(name: name, url: url)
            return
        }
        // 配乐已瘦身移至腾讯云：按需后台拉取当前曲目并永久缓存在本地，下载完成自动渐入播放
        musicFetchTask?.cancel()
        track = (Self.trackNames[name] ?? name) + "（云端缓冲中…）"
        musicFetchTask = Task { @MainActor [weak self] in
            guard let url = await HotPackManager.fetchOnDemand(path: "Music/\(name).m4a") else {
                self?.track = ""
                return
            }
            guard let self, self.music, self.player == nil, !Task.isCancelled else { return }
            self.startTrack(name: name, url: url)
        }
    }
    private func startTrack(name: String, url: URL) {
        guard let p = try? AVAudioPlayer(contentsOf: url) else { return }
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
        guard let url = HotPackManager.resourceURL(name: sound.rawValue, ext: "wav", subdirectory: "Audio")
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

/// 在线计算服务器与云端存档（v9 真·网游级微步主动推流架构）：
/// 支持 ① 纯本机满帧直演（默认推荐看海，0ms 零延迟）、
/// ② 专属国内云服务器 / 局域网毫秒级推流 v9（省电挂机，LZ4 精简帧 5–10 KB/帧）、③ 退后台无感重连与一键云端存档。
struct RemoteSettings: View {
    @ObservedObject var model: GameModel
    @State private var directAddress = NativeHost.savedDirectAddress
    @State private var roomCode = UserDefaults.standard.string(forKey: "remote.roomCode") ?? ""
    @State private var busy = false
    @State private var cloudUploading = false
    @State private var message = ""
    @State private var messageGood = false
    @State private var advanced = false

    private var statusTitle: String {
        if model.remoteAddress != nil {
            let rtt = model.remoteRTTMs.map { " · \($0)ms" } ?? ""
            let kb = (model.remoteFrameKB ?? 0) > 0 ? String(format: " · %.1fKB/帧", model.remoteFrameKB ?? 0) : ""
            return "已连服务器（\(model.remoteTransport.isEmpty ? "在线" : model.remoteTransport)\(rtt)\(kb)）"
        }
        if model.remoteReconnecting { return "正在自动续连九州云服 v10…" }
        return model.autoRemote ? "正在待命连接九州云服 v10" : "离线单机 · 本机满帧 0ms"
    }
    private var statusSubtitle: String {
        if let addr = model.remoteAddress {
            return "\(addr) · v10 主动推流 + worldId 热续连 + LZ4 压缩，手机零计算负担"
        }
        if model.remoteReconnecting { return "世界进度安全托管云端，网络就绪后自动秒连续推" }
        return model.autoRemote ? "优先直连专属云服或同 Wi-Fi 电脑（UDP 秒发现），断链自动持久重连" : "当前由手机本机满帧直演（0ms 零延迟）；开启九州云服 v10 后可享断链续连与省电挂机"
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
                            message = ok ? "已接通在线服务器（v9 主动推流模式），大地图由服务器全速承担。" : "未发现服务器在线：可填入专属云服务器 IP:8765，或在电脑运行「列国纪远程计算 v9」（配对码 \(NativeHost.activeRoomCode)）。"
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
                                let kbText = (model.remoteFrameKB ?? 0) > 0 ? String(format: "，单帧 %.1f KB", model.remoteFrameKB ?? 0) : ""
                                message = ms.map { "实时网络延迟 \($0) ms\(kbText)，链路稳固。" } ?? "测速超时，已触发自动重连。"
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
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("算力与运行模式").font(Theme.body).foregroundStyle(Theme.ink)
                    Spacer()
                    Text(model.autoRemote ? "九州云服 v10 · 断链自动续连" : "离线单机 · 本机满帧 0ms")
                        .font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                ChipPicker(
                    items: [(true, "在线云服 v10（默认 · 自动续连）"), (false, "离线单机（纯本机 0ms）")],
                    selection: Binding(
                        get: { model.autoRemote },
                        set: { on in
                            model.objectWillChange.send()
                            model.autoRemote = on
                            if !on {
                                if model.remoteAddress != nil {
                                    Task { await model.disconnectRemote() }
                                } else {
                                    model.switchToOfflineLocal()
                                }
                            } else if model.remoteAddress == nil && model.state != nil {
                                Task { _ = await model.findComputerNow() }
                            }
                        }
                    )
                )
                Text("默认开启「在线云服 v10」，切后台返回或网络波动时自动续连且绝不误踢单机；需离线游玩时可手动切至「离线单机」。")
                    .font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16).padding(.vertical, 11)
            Divider2()
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("专属云服务器 / 局域网直连（推荐 · 2–35ms）").font(Theme.body).foregroundStyle(Theme.ink)
                    Spacer()
                    if !directAddress.isEmpty && model.remoteAddress == nil {
                        Button("清除") {
                            directAddress = ""
                            model.clearDirectServer()
                            messageGood = true
                            message = "已清除固定直连地址，将自动通过局域网发现或云端中转连接。"
                        }
                        .font(Theme.caption).foregroundStyle(Theme.ink2)
                    }
                }
                Text("填写国内轻量云服务器或电脑内网地址（例 120.55.x.x:8765），永久记住、跳过海外中转直达满帧丝滑。").font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                HStack {
                    TextField("", text: $directAddress, prompt: Text("云服务器或局域网 IP:8765").foregroundColor(Theme.ink2.opacity(0.6)))
                        .paperField().keyboardType(.asciiCapable).autocorrectionDisabled().textInputAutocapitalization(.never)
                    EditorialTactileButton(title: "直连", solid: true, compact: true) {
                        busy = true; message = ""
                        Task {
                            let error = await model.connectDirectServer(directAddress)
                            busy = false
                            messageGood = (error == nil)
                            message = error ?? "已成功接通专属直连推流服务器（已永久记住，下次打开秒连）。"
                            GameFeel.shared.notify(error == nil ? .success : .error)
                        }
                    }
                    .disabled(busy || directAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 11)
            Divider2()
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("云端存档即时同步").font(Theme.body).foregroundStyle(Theme.ink)
                    Text("房间码 \(NativeHost.activeRoomCode) · 无需电脑开机，换设备随时下载").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                Spacer(minLength: 6)
                EditorialTactileButton(title: cloudUploading ? "上传中…" : "上传云端", solid: false, compact: true) {
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
                    Text("高级：自定家用电脑配对码").font(Theme.label).foregroundStyle(Theme.ink2)
                    Spacer()
                    InkIcon(glyph: .chevronDown, size: 11, weight: 1.7).foregroundStyle(Theme.ink2).rotationEffect(.degrees(advanced ? 180 : 0))
                }
                .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if advanced {
                HStack {
                    TextField("", text: $roomCode, prompt: Text("专属房间码（默认 \(RemoteRoom.personal)）").foregroundColor(Theme.ink2.opacity(0.6)))
                        .paperField().keyboardType(.asciiCapable).autocorrectionDisabled().textInputAutocapitalization(.characters)
                    Button("保存") {
                        let clean = roomCode.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "-", with: "").uppercased()
                        UserDefaults.standard.set(clean, forKey: "remote.roomCode")
                        messageGood = true
                        message = "房间码已更新为 \(NativeHost.activeRoomCode)（电脑端 pairing.txt 或环境变量 LGJ_PAIRING_CODE 填相同码即可）"
                    }
                    .font(Theme.body).foregroundStyle(Theme.seal)
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
