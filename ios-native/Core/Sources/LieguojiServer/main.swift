import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import LieguojiCore
#if os(Windows)
import WinSDK
#elseif canImport(Glibc)
import Glibc
#else
import Darwin
#endif

// 列国纪在线计算服务器 v6（真·网游级全双工主动推流 + LZ4 高速压缩 + 专属云服/家用电脑双模）：
// 1. 全双工多路复用直连 TCP（端口 8765，支持 `enableMux` 升级）：服务器按恒定帧率单向主动推送 LZ4 压缩精简帧（5–10 KB/帧），
//    手机端 0ms 等待并发下发暂停/加速/军令/查面板指令，局域网 2–6 ms、国内云服务器 15–35 ms。
// 2. 云端中转单向推流管道（Cloudflare Pages / Durable Object `/push` -> 手机 WebSocket `MSG_PUSH`）：
//    外出 4G/5G 省去整趟「手机→中转→PC」请求来回，消除停顿问答感；同时双路长轮询即时处理控制指令。
// 3. 局域网 UDP 自动发现信标（端口 8766）：同一 Wi-Fi 下无需经过外网中转，10ms 内秒连家用电脑。
// 4. 专属 24h 云服务器就绪：支持环境变量 `LGJ_PORT` / `LGJ_PAIRING_CODE` / `LGJ_DATA_DIR` / `LGJ_DISABLE_RELAY`，
//    以及服务端每 60 秒自动磁盘热备（彻底告别手机每 30 秒拉取 10MB 存档造成的卡顿）。

setvbuf(stdout, nil, _IONBF, 0)
let env = ProcessInfo.processInfo.environment
let port = UInt16(CommandLine.arguments.dropFirst().first ?? env["LGJ_PORT"] ?? "") ?? 8765
let disableRelay = (env["LGJ_DISABLE_RELAY"] == "1" || env["LGJ_DISABLE_RELAY"]?.lowercased() == "true")
let disableStartup = (env["LGJ_NO_STARTUP"] == "1" || env["LGJ_DATA_DIR"] != nil)
let service = EngineService()
let engineLock = NSLock()

let serverDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
let saveDirURL: URL = {
    if let d = env["LGJ_DATA_DIR"], !d.isEmpty { return URL(fileURLWithPath: d, isDirectory: true) }
    return serverDir.appendingPathComponent("saves", isDirectory: true)
}()
let autoSaveURL = saveDirURL.appendingPathComponent("autosave.lgj")

#if os(Windows)
typealias Socket = SOCKET
let invalidSocket = INVALID_SOCKET
func closeSocket(_ s: Socket) { closesocket(s) }
var wsa = WSADATA()
guard WSAStartup(0x0202, &wsa) == 0 else { print("网络初始化失败"); exit(1) }
#else
typealias Socket = Int32
let invalidSocket: Int32 = -1
func closeSocket(_ s: Socket) { close(s) }
signal(SIGPIPE, SIG_IGN)
#endif

func sendAll(_ s: Socket, _ data: Data) -> Bool {
    var sent = 0
    return data.withUnsafeBytes { (buf: UnsafeRawBufferPointer) -> Bool in
        guard let base = buf.baseAddress else { return true }
        while sent < data.count {
            let chunk = min(data.count - sent, 1 << 20)
            #if os(Windows)
            let n = Int(send(s, base.advanced(by: sent).assumingMemoryBound(to: CChar.self), Int32(chunk), 0))
            #elseif canImport(Glibc)
            let n = Glibc.send(s, base.advanced(by: sent), chunk, Int32(MSG_NOSIGNAL))
            #else
            let n = Darwin.send(s, base.advanced(by: sent), chunk, 0)
            #endif
            if n <= 0 { return false }
            sent += n
        }
        return true
    }
}

func receiveExactly(_ s: Socket, _ count: Int) -> Data? {
    if count == 0 { return Data() }
    var out = Data(count: count), got = 0
    let ok = out.withUnsafeMutableBytes { (buf: UnsafeMutableRawBufferPointer) -> Bool in
        guard let base = buf.baseAddress else { return false }
        while got < count {
            let chunk = min(count - got, 1 << 20)
            #if os(Windows)
            let n = Int(recv(s, base.advanced(by: got).assumingMemoryBound(to: CChar.self), Int32(chunk), 0))
            #elseif canImport(Glibc)
            let n = Glibc.recv(s, base.advanced(by: got), chunk, 0)
            #else
            let n = Darwin.recv(s, base.advanced(by: got), chunk, 0)
            #endif
            if n <= 0 { return false }
            got += n
        }
        return true
    }
    return ok ? out : nil
}

func readU32(_ s: Socket) -> Int? { receiveExactly(s, 4).map { EngineWire.readU32($0, at: 0) } }

final class DirectClient {
    let socket: Socket
    let gen: UInt64
    let writeLock = NSLock()
    var mux = false
    var compress = false
    var closed = false

    init(socket: Socket, gen: UInt64) {
        self.socket = socket
        self.gen = gen
    }

    @discardableResult
    func sendMux(type: UInt8, id: UInt32, body: Data) -> Bool {
        writeLock.lock()
        defer { writeLock.unlock() }
        if closed { return false }
        return sendAll(socket, EngineWire.muxFrame(type: type, id: id, body: body))
    }

    @discardableResult
    func sendLegacy(_ data: Data) -> Bool {
        writeLock.lock()
        defer { writeLock.unlock() }
        if closed { return false }
        return sendAll(socket, data)
    }

    func markClosed() {
        writeLock.lock()
        closed = true
        writeLock.unlock()
        closeSocket(socket)
    }
}

let clientLock = NSLock()
var activeDirect: DirectClient?
var clientGeneration: UInt64 = 0

let relayBaseLock = NSLock()
var activeRelayBase: String?

// MARK: - 云端单向推流发送器（专职 HTTP/2 Keep-Alive POST /push，不阻塞主推演线程）

final class RelayPusher {
    private let lock = NSLock()
    private let sem = DispatchSemaphore(value: 0)
    private var pending: (seq: UInt32, body: Data)?
    private var noPhoneStreak = 0
    private let code: String
    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.httpMaximumConnectionsPerHost = 2
        cfg.timeoutIntervalForRequest = 8
        cfg.timeoutIntervalForResource = 12
        return URLSession(configuration: cfg)
    }()

    init(code: String) { self.code = code }

    func enqueue(seq: UInt32, body: Data) {
        lock.lock()
        let wasEmpty = (pending == nil)
        pending = (seq, body)
        lock.unlock()
        if wasEmpty { sem.signal() }
    }

    func clear() {
        lock.lock()
        pending = nil
        noPhoneStreak = 0
        lock.unlock()
    }

    func start(onPhoneGone: @escaping () -> Void) {
        Thread.detachNewThread { [weak self] in
            while let self {
                self.sem.wait()
                self.lock.lock()
                let item = self.pending
                self.pending = nil
                self.lock.unlock()
                guard let item else { continue }
                relayBaseLock.lock()
                let base = activeRelayBase
                relayBaseLock.unlock()
                guard let base else { continue }
                guard let url = URL(string: "\(base)/room/\(self.code)/push?seq=\(item.seq)") else { continue }
                var req = URLRequest(url: url)
                req.httpMethod = "POST"
                req.httpBody = item.body
                req.setValue("application/octet-stream", forHTTPHeaderField: "content-type")
                req.timeoutInterval = 8

                let done = DispatchSemaphore(value: 0)
                var status = 0
                self.session.dataTask(with: req) { _, resp, _ in
                    status = (resp as? HTTPURLResponse)?.statusCode ?? 0
                    done.signal()
                }.resume()
                done.wait()

                if status == 202 {
                    self.lock.lock(); self.noPhoneStreak = 0; self.lock.unlock()
                } else if status == 204 {
                    self.lock.lock()
                    self.noPhoneStreak += 1
                    let gone = self.noPhoneStreak >= 3
                    self.lock.unlock()
                    if gone { onPhoneGone() }
                }
            }
        }
    }
}

func pairingCode() -> String {
    if let e = env["LGJ_PAIRING_CODE"]?.trimmingCharacters(in: .whitespacesAndNewlines), e.count >= 6 {
        return e.replacingOccurrences(of: "-", with: "").uppercased()
    }
    let file = serverDir.appendingPathComponent("pairing.txt")
    if let saved = try? String(contentsOf: file, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
       saved.count >= 6 { return saved.replacingOccurrences(of: "-", with: "").uppercased() }
    return RemoteRoom.personal
}

let code = pairingCode()
let relayPusher = RelayPusher(code: code)

/// 服务端恒定节拍主动推流引擎（v6）：
/// - 直连 Mux TCP 时直接以 `MUX_PUSH` 推送 LZ4 精简帧（0ms 问答停顿）；
/// - 云端中转时交由 `RelayPusher` 单向推入 Cloudflare -> 手机长连 WebSocket；
/// - 兼容旧版 v5 手机客户端（保留 1 帧预推演缓冲给 `pullLatest`）。
final class SimStreamer {
    private let stateLock = NSLock()
    private var playing = false
    private var pushEnabled = false
    private var daysPerStep = 3
    private var intervalSec: Double = 0.16
    private var streamEpoch: UInt32 = 1
    private var streamSeq: UInt32 = 0
    private var bufferedFrame: Data?
    private var lastClientActivity = Date()
    private var lastDiskSave = Date.distantPast
    private var pushedCount = 0
    private var pushedBytes = 0
    private var statStarted = Date()

    func configure(playing: Bool, days: Int, intervalMs: Int, epoch: Int?, push: Bool) {
        stateLock.lock()
        self.playing = playing
        self.pushEnabled = push
        self.daysPerStep = max(1, min(60, days))
        self.intervalSec = Double(max(70, min(800, intervalMs))) / 1000.0
        if let e = epoch, e >= 0 { self.streamEpoch = UInt32(e & 0xFF) }
        else { self.streamEpoch = (self.streamEpoch + 1) & 0xFF }
        self.streamSeq = 0
        self.lastClientActivity = Date()
        self.bufferedFrame = nil
        stateLock.unlock()
        if !playing { relayPusher.clear() }
    }

    func invalidatePending() {
        stateLock.lock()
        self.bufferedFrame = nil
        self.lastClientActivity = Date()
        stateLock.unlock()
        relayPusher.clear()
    }

    func touch() {
        stateLock.lock()
        self.lastClientActivity = Date()
        stateLock.unlock()
    }

    func park() {
        stateLock.lock()
        self.playing = false
        self.bufferedFrame = nil
        stateLock.unlock()
        relayPusher.clear()
        saveCheckpoint(force: true)
    }

    func stopForIdle() {
        stateLock.lock()
        self.playing = false
        self.bufferedFrame = nil
        stateLock.unlock()
        relayPusher.clear()
    }

    func pull(fallbackDays: Int, slim: Bool) -> EngineService.Reply {
        stateLock.lock()
        self.lastClientActivity = Date()
        if let ready = self.bufferedFrame {
            self.bufferedFrame = nil
            stateLock.unlock()
            return EngineService.Reply(ok: true, reason: "", data: ready)
        }
        stateLock.unlock()

        engineLock.lock()
        defer { engineLock.unlock() }
        return service.handle("step", ["days": max(1, min(60, fallbackDays)), "slim": slim], payload: nil)
    }

    func saveCheckpoint(force: Bool = false) {
        let now = Date()
        stateLock.lock()
        let due = force || now.timeIntervalSince(lastDiskSave) >= 60
        if due { lastDiskSave = now }
        stateLock.unlock()
        guard due else { return }

        engineLock.lock()
        let snapshot = service.engine?.save()
        engineLock.unlock()
        guard let snapshot else { return }
        try? FileManager.default.createDirectory(at: saveDirURL, withIntermediateDirectories: true)
        try? snapshot.write(to: autoSaveURL, options: .atomic)
    }

    func start() {
        Thread.detachNewThread { [weak self] in
            while let self {
                let tickStart = Date()
                self.stateLock.lock()
                let active = self.playing
                let doPush = self.pushEnabled
                let needsLegacyBuf = !doPush && (self.bufferedFrame == nil)
                let days = self.daysPerStep
                let period = self.intervalSec
                let epoch = self.streamEpoch
                let idleSecs = tickStart.timeIntervalSince(self.lastClientActivity)
                if active && idleSecs > 45 {
                    self.playing = false
                    self.bufferedFrame = nil
                }
                self.stateLock.unlock()

                if active && idleSecs <= 45 && (doPush || needsLegacyBuf) {
                    engineLock.lock()
                    let reply = service.handle("step", ["days": days, "slim": doPush], payload: nil)
                    engineLock.unlock()

                    if reply.ok, let rawData = reply.data, !rawData.isEmpty {
                        if doPush {
                            let compressed = WireCodec.compress(rawData)
                            self.stateLock.lock()
                            let stillValid = self.playing && self.streamEpoch == epoch
                            self.streamSeq = (self.streamSeq + 1) & 0x00FF_FFFF
                            let tag: UInt32 = (epoch << 24) | self.streamSeq
                            if stillValid {
                                self.pushedCount += 1
                                self.pushedBytes += compressed.count
                                if tickStart.timeIntervalSince(self.statStarted) >= 30 {
                                    let avgKB = Double(self.pushedBytes) / Double(max(1, self.pushedCount)) / 1024.0
                                    print(String(format: "（主动推流）近 30 秒已推送 %d 帧 · 平均 %.1f KB/帧（LZ4）", self.pushedCount, avgKB))
                                    self.pushedCount = 0; self.pushedBytes = 0; self.statStarted = tickStart
                                }
                            }
                            self.stateLock.unlock()

                            if stillValid {
                                clientLock.lock()
                                let direct = activeDirect
                                clientLock.unlock()
                                if let direct, direct.mux {
                                    if !direct.sendMux(type: EngineWire.muxPush, id: tag, body: compressed) {
                                        self.stopForIdle()
                                    }
                                } else if !disableRelay {
                                    relayPusher.enqueue(seq: tag, body: compressed)
                                }
                            }
                        } else {
                            self.stateLock.lock()
                            if self.playing && self.streamEpoch == epoch { self.bufferedFrame = rawData }
                            self.stateLock.unlock()
                        }
                    }
                    self.saveCheckpoint(force: false)
                    let elapsed = Date().timeIntervalSince(tickStart)
                    let sleepFor = doPush ? max(0.012, period - elapsed) : 0.015
                    Thread.sleep(forTimeInterval: sleepFor)
                } else {
                    Thread.sleep(forTimeInterval: 0.025)
                }
            }
        }
    }
}

let streamer = SimStreamer()
streamer.start()
if !disableRelay {
    relayPusher.start { streamer.stopForIdle() }
}

func serve(_ call: String, _ args: [String: Any], _ payload: Data?) -> EngineService.Reply {
    streamer.touch()
    if call == "streamConfig" {
        let on = (args["playing"] as? NSNumber)?.boolValue ?? (args["playing"] as? Bool) ?? false
        let days = (args["days"] as? NSNumber)?.intValue ?? (args["days"] as? Int) ?? 3
        let intervalMs = (args["intervalMs"] as? NSNumber)?.intValue ?? (args["intervalMs"] as? Int) ?? 160
        let epoch = (args["epoch"] as? NSNumber)?.intValue ?? (args["epoch"] as? Int)
        let push = (args["push"] as? NSNumber)?.boolValue ?? (args["push"] as? Bool) ?? false
        streamer.configure(playing: on, days: days, intervalMs: intervalMs, epoch: epoch, push: push)
        return EngineService.Reply(ok: true, reason: "stream:\(on ? days : 0):\(push ? "push" : "pull")")
    }
    if call == "pullLatest" {
        let days = (args["days"] as? NSNumber)?.intValue ?? (args["days"] as? Int) ?? 3
        let slim = (args["slim"] as? NSNumber)?.boolValue ?? (args["slim"] as? Bool) ?? false
        return streamer.pull(fallbackDays: days, slim: slim)
    }
    if call == "park" {
        streamer.park()
        engineLock.lock(); defer { engineLock.unlock() }
        return service.handle("park", args, payload: nil)
    }
    if call == "enableMux" {
        return EngineService.Reply(ok: true, reason: "mux-v6")
    }
    let readOnly: Set<String> = [
        "ping", "isOpen", "state", "province", "nationInfo", "diplomacyInfo", "tradeInfo",
        "armyRecord", "financeInfo", "regionInfo", "chronicle", "generals", "familyTree",
        "view", "worldSettings", "worldRules", "nationHistory", "nationReigns", "nationBreakdown",
        "provinceBreakdown", "warCompare", "grandInfo", "replayTimeline", "statistics", "route",
        "regime", "posts", "postCandidates", "officeCandidates", "allianceList", "districtList",
        "familyList", "placeNames", "mapExtras", "extraUnits", "unitProfile", "catalogEdits",
        "mapLabels", "throneCandidates", "nationProvinces", "profileReport"
    ]
    if !readOnly.contains(call) { streamer.invalidatePending() }

    engineLock.lock()
    defer { engineLock.unlock() }
    let reply = service.handle(call, args, payload: payload)
    if call == "open" && reply.ok {
        DispatchQueue.global(qos: .utility).async { streamer.saveCheckpoint(force: true) }
    }
    return reply
}

// MARK: - 云端中转工作线程（双路热连接接指令 + 单向推流通道发状态）

let relayBases = [
    "https://lieguoji-edge.pages.dev/api/relay",
    "https://claude-native-map.lieguoji-web.pages.dev/api/relay",
    "https://lieguoji-web.pages.dev/api/relay"
]

let relaySession: URLSession = {
    let cfg = URLSessionConfiguration.default
    cfg.httpMaximumConnectionsPerHost = 6
    cfg.timeoutIntervalForRequest = 60
    cfg.timeoutIntervalForResource = 180
    return URLSession(configuration: cfg)
}()

typealias HTTPResult = (status: Int, body: Data, response: HTTPURLResponse?)
func http(_ request: URLRequest) -> HTTPResult? {
    let done = DispatchSemaphore(value: 0)
    var out: (Int, Data, HTTPURLResponse?)?
    relaySession.dataTask(with: request) { data, response, _ in
        if let h = response as? HTTPURLResponse { out = (h.statusCode, data ?? Data(), h) }
        done.signal()
    }.resume()
    done.wait()
    return out
}

let announceLock = NSLock()
var relayOnlineAnnounced = false
var relayClientSupportsLZ4 = false

func relayWorker(workerId: Int, code: String) {
    var base: String?
    var announcedOffline = false
    var carried: HTTPResult?
    while true {
        if base == nil {
            for b in relayBases {
                var probe = URLRequest(url: URL(string: b + "/room/\(code)/ping")!)
                probe.timeoutInterval = 12
                if let r = http(probe), r.status == 200, (try? JSONSerialization.jsonObject(with: r.body)) is [String: Any] {
                    base = b
                    relayBaseLock.lock(); activeRelayBase = b; relayBaseLock.unlock()
                    break
                }
            }
            if base == nil {
                if workerId == 1 && !announcedOffline {
                    print("暂时连不上云端中转（稍后自动重试）；同一 Wi-Fi 下仍可毫秒级局域网直连。")
                    announcedOffline = true
                }
                Thread.sleep(forTimeInterval: 6)
                continue
            }
            announceLock.lock()
            if !relayOnlineAnnounced {
                print("已连上列国纪云端高速推流网关（v6 双向压缩 + 双通道待命）：外出 4G/5G 也可自动连入。")
                relayOnlineAnnounced = true
            }
            announceLock.unlock()
            announcedOffline = false
        }

        let r: HTTPResult
        if let ready = carried {
            r = ready; carried = nil
        } else {
            let lan = localAddresses().map { "\($0):\(port)" }.joined(separator: ",")
            var qs = "v=6"
            if !lan.isEmpty { qs += "&lan=" + lan }
            var poll = URLRequest(url: URL(string: base! + "/room/\(code)/next?" + qs)!)
            poll.timeoutInterval = 40
            guard let polled = http(poll) else {
                base = nil
                Thread.sleep(forTimeInterval: 2)
                continue
            }
            r = polled
        }
        if r.status == 204 { continue }
        guard r.status == 200, r.body.count >= 8,
              let id = r.response?.value(forHTTPHeaderField: "x-request-id") else {
            Thread.sleep(forTimeInterval: 1)
            continue
        }
        let h = EngineWire.readU32(r.body, at: 0)
        guard h >= 0, r.body.count >= 8 + h else { continue }
        let header = r.body.subdata(in: 4..<4 + h)
        let pl = EngineWire.readU32(r.body, at: 4 + h)
        let payload = (pl > 0 && r.body.count >= 8 + h + pl) ? r.body.subdata(in: 8 + h..<8 + h + pl) : Data()
        let o = (try? JSONSerialization.jsonObject(with: header)) as? [String: Any] ?? [:]
        let call = o["call"] as? String ?? "", args = o["args"] as? [String: Any] ?? [:]
        if call == "ping" {
            let v = (args["v"] as? NSNumber)?.intValue ?? (args["v"] as? Int) ?? 0
            announceLock.lock(); relayClientSupportsLZ4 = (v >= 6); announceLock.unlock()
        }
        let reply = serve(call, args, payload.isEmpty ? nil : payload)
        if call == "open" { print(reply.ok ? "（云端推流）世界已载入，开始高速推演" : "（云端推流）世界载入失败：\(reply.reason)") }
        if call == "park" { print("（云端推流）手机已切入后台，世界热保留在服务器内存并已自动落盘") }

        announceLock.lock(); let useLZ4 = relayClientSupportsLZ4; announceLock.unlock()
        let lan = localAddresses().map { "\($0):\(port)" }.joined(separator: ",")
        var postURL = base! + "/room/\(code)/reply/\(id)?next=1&v=6"
        if !lan.isEmpty { postURL += "&lan=" + lan }
        var post = URLRequest(url: URL(string: postURL)!)
        post.httpMethod = "POST"
        post.httpBody = EngineWire.reply(reply, compress: useLZ4)
        post.timeoutInterval = 90
        post.setValue("application/octet-stream", forHTTPHeaderField: "content-type")
        if let answer = http(post), answer.status == 200 { carried = answer }
    }
}

/// 开机自动运行 (Windows): 在启动文件夹写入最小化自启脚本（无头/测试模式自动跳过）。
func installStartup() {
    if disableStartup { return }
    #if os(Windows)
    guard let appData = ProcessInfo.processInfo.environment["APPDATA"] else { return }
    let dir = URL(fileURLWithPath: appData).appendingPathComponent("Microsoft/Windows/Start Menu/Programs/Startup")
    let script = dir.appendingPathComponent("lieguoji-server.cmd")
    var exe = CommandLine.arguments[0].replacingOccurrences(of: "/", with: "\\")
    if !exe.contains(":") { exe = FileManager.default.currentDirectoryPath.replacingOccurrences(of: "/", with: "\\") + "\\" + exe }
    let text = "@echo off\r\nstart \"\" /min \"\(exe)\"\r\n"
    if (try? String(contentsOf: script, encoding: .utf8)) == text { print("已设为开机自动运行。"); return }
    do {
        try text.write(to: script, atomically: true, encoding: .utf8)
        print("已设为开机自动运行（以后电脑开机即在后台待命；不需要时删除启动文件夹里的 lieguoji-server.cmd）。")
    } catch { print("未能设置开机自动运行：\(error.localizedDescription)") }
    #endif
}

if !disableRelay {
    Thread.detachNewThread { relayWorker(workerId: 1, code: code) }
    Thread.detachNewThread { Thread.sleep(forTimeInterval: 0.35); relayWorker(workerId: 2, code: code) }
}

// MARK: - 局域网 UDP 自动发现信标（端口 port + 1，同一 Wi-Fi 下 10ms 零配置秒连）

func startUDPDiscovery(tcpPort: UInt16, roomCode: String) {
    let udpPort: UInt16 = tcpPort < 65535 ? tcpPort + 1 : 8766
    Thread.detachNewThread {
        #if os(Windows)
        let sock = socket(AF_INET, Int32(SOCK_DGRAM), Int32(IPPROTO_UDP.rawValue))
        #elseif canImport(Glibc)
        let sock = socket(AF_INET, Int32(SOCK_DGRAM.rawValue), 0)
        #else
        let sock = socket(AF_INET, SOCK_DGRAM, 0)
        #endif
        guard sock != invalidSocket else { return }
        var one: Int32 = 1
        #if os(Windows)
        withUnsafePointer(to: &one) {
            $0.withMemoryRebound(to: CChar.self, capacity: 4) { ptr in
                _ = setsockopt(sock, Int32(SOL_SOCKET), Int32(SO_REUSEADDR), ptr, 4)
            }
        }
        #else
        setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &one, socklen_t(MemoryLayout<Int32>.size))
        #endif

        var addr = sockaddr_in()
        #if os(Windows)
        addr.sin_family = ADDRESS_FAMILY(AF_INET)
        addr.sin_addr.S_un.S_addr = 0
        let addrLen = Int32(MemoryLayout<sockaddr_in>.size)
        #else
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_addr.s_addr = 0
        let addrLen = socklen_t(MemoryLayout<sockaddr_in>.size)
        #endif
        addr.sin_port = udpPort.bigEndian
        let ok = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(sock, $0, addrLen) }
        }
        guard ok == 0 else { closeSocket(sock); return }

        let replyBytes = Array("LGJ_HERE:\(roomCode):\(tcpPort):v6".utf8)
        var buf = [UInt8](repeating: 0, count: 256)
        while true {
            var from = sockaddr_in()
            #if os(Windows)
            var fromLen = Int32(MemoryLayout<sockaddr_in>.size)
            let got: Int = buf.withUnsafeMutableBytes { raw in
                guard let p = raw.baseAddress?.assumingMemoryBound(to: CChar.self) else { return -1 }
                return withUnsafeMutablePointer(to: &from) { fp in
                    fp.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                        Int(recvfrom(sock, p, Int32(raw.count), 0, sa, &fromLen))
                    }
                }
            }
            #else
            var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)
            let got: Int = buf.withUnsafeMutableBytes { raw in
                guard let p = raw.baseAddress else { return -1 }
                return withUnsafeMutablePointer(to: &from) { fp in
                    fp.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                        Int(recvfrom(sock, p, raw.count, 0, sa, &fromLen))
                    }
                }
            }
            #endif
            if got <= 0 { continue }
            let msg = String(decoding: buf.prefix(got), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            if msg == "LGJ_DISCOVER" || msg == "LGJ_DISCOVER:\(roomCode)" || msg == "LGJ_DISCOVER:*" {
                replyBytes.withUnsafeBytes { raw in
                    guard let p = raw.baseAddress else { return }
                    withUnsafePointer(to: &from) { fp in
                        fp.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                            #if os(Windows)
                            _ = sendto(sock, p.assumingMemoryBound(to: CChar.self), Int32(raw.count), 0, sa, fromLen)
                            #else
                            _ = sendto(sock, p, raw.count, 0, sa, fromLen)
                            #endif
                        }
                    }
                }
            }
        }
    }
}

// MARK: - 直连 TCP（支持局域网与公网专属云服务器，多路复用主动推流 + TCP_NODELAY + SO_KEEPALIVE）

func tuneClientSocket(_ s: Socket) {
    var one: Int32 = 1
    #if os(Windows)
    withUnsafePointer(to: &one) {
        $0.withMemoryRebound(to: CChar.self, capacity: 4) { ptr in
            _ = setsockopt(s, Int32(IPPROTO_TCP.rawValue), Int32(TCP_NODELAY), ptr, 4)
            _ = setsockopt(s, Int32(SOL_SOCKET), Int32(SO_KEEPALIVE), ptr, 4)
        }
    }
    var timeoutMs: DWORD = 60_000
    withUnsafePointer(to: &timeoutMs) {
        $0.withMemoryRebound(to: CChar.self, capacity: 4) { ptr in
            _ = setsockopt(s, Int32(SOL_SOCKET), Int32(SO_RCVTIMEO), ptr, 4)
            _ = setsockopt(s, Int32(SOL_SOCKET), Int32(SO_SNDTIMEO), ptr, 4)
        }
    }
    #elseif canImport(Glibc)
    setsockopt(s, Int32(IPPROTO_TCP), TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(s, SOL_SOCKET, SO_KEEPALIVE, &one, socklen_t(MemoryLayout<Int32>.size))
    var tv = timeval(tv_sec: 60, tv_usec: 0)
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    #else
    setsockopt(s, IPPROTO_TCP, TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(s, SOL_SOCKET, SO_KEEPALIVE, &one, socklen_t(MemoryLayout<Int32>.size))
    var tv = timeval(tv_sec: 60, tv_usec: 0)
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    #endif
}

func localAddresses() -> [String] {
    var name = [CChar](repeating: 0, count: 256)
    #if os(Windows)
    guard gethostname(&name, Int32(name.count)) == 0 else { return [] }
    #else
    guard gethostname(&name, name.count) == 0 else { return [] }
    #endif
    var hints = addrinfo(); hints.ai_family = AF_INET
    #if os(Windows)
    hints.ai_socktype = Int32(SOCK_STREAM)
    #elseif canImport(Glibc)
    hints.ai_socktype = Int32(SOCK_STREAM.rawValue)
    #else
    hints.ai_socktype = SOCK_STREAM
    #endif
    var result: UnsafeMutablePointer<addrinfo>?
    guard getaddrinfo(name, nil, &hints, &result) == 0 else { return [] }
    defer { freeaddrinfo(result) }
    var list = [String](), p = result
    while let info = p {
        if let addr = info.pointee.ai_addr {
            var host = [CChar](repeating: 0, count: 64)
            #if os(Windows)
            let len = Int32(info.pointee.ai_addrlen)
            #else
            let len = socklen_t(info.pointee.ai_addrlen)
            #endif
            if getnameinfo(addr, len, &host, 64, nil, 0, Int32(NI_NUMERICHOST)) == 0 {
                let s = String(cString: host)
                if !list.contains(s) && !s.hasPrefix("127.") && !s.hasPrefix("169.254.") { list.append(s) }
            }
        }
        p = info.pointee.ai_next
    }
    return list
}

#if os(Windows)
let listener = socket(AF_INET, Int32(SOCK_STREAM), Int32(IPPROTO_TCP.rawValue))
#elseif canImport(Glibc)
let listener = socket(AF_INET, Int32(SOCK_STREAM.rawValue), 0)
#else
let listener = socket(AF_INET, SOCK_STREAM, 0)
#endif
guard listener != invalidSocket else { print("无法创建监听端口"); exit(1) }
var yes: Int32 = 1
#if os(Windows)
withUnsafePointer(to: &yes) {
    $0.withMemoryRebound(to: CChar.self, capacity: 4) { ptr in
        _ = setsockopt(listener, Int32(SOL_SOCKET), Int32(SO_REUSEADDR), ptr, 4)
    }
}
#else
setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
#endif
var address = sockaddr_in()
#if os(Windows)
address.sin_family = ADDRESS_FAMILY(AF_INET)
let addressLength = Int32(MemoryLayout<sockaddr_in>.size)
#else
address.sin_family = sa_family_t(AF_INET)
let addressLength = socklen_t(MemoryLayout<sockaddr_in>.size)
#endif
address.sin_port = port.bigEndian
#if os(Windows)
address.sin_addr.S_un.S_addr = 0
#else
address.sin_addr.s_addr = 0
#endif
let bound = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(listener, $0, addressLength) } }
if bound != 0 || listen(listener, 16) != 0 {
    print("直连端口 \(port) 不可用（可在命令后加其他端口号，例如 LieguojiServer 8766）；云端中转不受影响。")
    while true { Thread.sleep(forTimeInterval: 3600) }
}

startUDPDiscovery(tcpPort: port, roomCode: code)

print("列国纪在线计算服务器 v6（全双工主动推流 + LZ4 压缩 + 局域网自动发现 + 自动热备）已启动")
print("配对码：\(code)\(disableRelay ? "（纯直连专属云服模式）" : "")")
print("手机打开游戏即自动接入；同一 Wi-Fi 自动毫秒级直连推流，切后台再返回秒级无感重连。")
installStartup()
print("直连监听端口：TCP \(port) · 局域网发现 UDP \(port < 65535 ? port + 1 : 8766)")
let addresses = localAddresses()
if addresses.isEmpty {
    print("本机地址：可用 ipconfig / hostname -I 查看 IP，端口 \(port)")
} else {
    print("局域网直连地址：" + addresses.map { "\($0):\(port)" }.joined(separator: "  或  "))
}
print("首次运行若弹出防火墙提示，请允许专用网络访问。按 Ctrl+C 退出。")

func parseRequestBody(_ body: Data) -> (call: String, args: [String: Any], payload: Data?)? {
    guard body.count >= 8 else { return nil }
    let h = EngineWire.readU32(body, at: 0)
    guard h >= 0, body.count >= 8 + h else { return nil }
    let header = body.subdata(in: 4..<4 + h)
    let pl = EngineWire.readU32(body, at: 4 + h)
    guard pl >= 0, body.count >= 8 + h + pl else { return nil }
    let payload = pl > 0 ? body.subdata(in: 8 + h..<8 + h + pl) : Data()
    let o = (try? JSONSerialization.jsonObject(with: header)) as? [String: Any] ?? [:]
    let call = o["call"] as? String ?? ""
    let args = o["args"] as? [String: Any] ?? [:]
    return (call, args, payload.isEmpty ? nil : payload)
}

func handleLANClient(_ conn: DirectClient) {
    let client = conn.socket
    tuneClientSocket(client)
    print("（直连 TCP）手机已接入 [#\(conn.gen)]")
    var calls = 0, started = Date()

    // 阶段一：经典 EngineWire 握手（完全兼容 v4/v5；收到 `enableMux` 立即切换至 v6 全双工多路复用推流模式）
    while !conn.mux,
          let headerLength = readU32(client), headerLength >= 0, headerLength < 16 << 20,
          let header = receiveExactly(client, headerLength),
          let payloadLength = readU32(client), payloadLength >= 0, payloadLength < 1 << 30,
          let payload = receiveExactly(client, payloadLength) {
        let o = (try? JSONSerialization.jsonObject(with: header)) as? [String: Any] ?? [:]
        let call = o["call"] as? String ?? "", args = o["args"] as? [String: Any] ?? [:]
        if call == "ping" {
            let v = (args["v"] as? NSNumber)?.intValue ?? (args["v"] as? Int) ?? 0
            if v >= 6 { conn.compress = true }
        }
        let reply = serve(call, args, payload.isEmpty ? nil : payload)
        if call == "open" { print(reply.ok ? "（直连）世界已载入，准备推演" : "（直连）世界载入失败：\(reply.reason)") }
        if call == "park" { print("（直连）手机已切入后台，世界热保留在服务器内存") }
        let isMuxUpgrade = (call == "enableMux" && reply.ok)
        if !conn.sendLegacy(EngineWire.reply(reply, compress: conn.compress && !isMuxUpgrade)) { break }
        if isMuxUpgrade {
            conn.mux = true
            conn.compress = true
            print("（直连 TCP [#\(conn.gen)]）已升级至 v6 全双工主动推流 + LZ4 压缩模式")
            break
        }
    }

    // 阶段二：v6 全双工多路复用（服务器主动发 MUX_PUSH，同时零等待响应手机 MUX_REQ 与 MUX_PING）
    if conn.mux {
        while let prefix = receiveExactly(client, 9) {
            let type = prefix[prefix.startIndex]
            let frameId = UInt32(EngineWire.readU32(prefix, at: 1))
            let bodyLen = EngineWire.readU32(prefix, at: 5)
            guard bodyLen >= 0, bodyLen < 256 << 20, let body = receiveExactly(client, bodyLen) else { break }

            if type == EngineWire.muxPing {
                streamer.touch()
                if !conn.sendMux(type: EngineWire.muxPong, id: frameId, body: body) { break }
                continue
            }
            if type == EngineWire.muxRequest {
                guard let req = parseRequestBody(body) else { break }
                let reply = serve(req.call, req.args, req.payload)
                if req.call == "open" { print(reply.ok ? "（直连推流）世界已载入，随时高速开推" : "（直连推流）世界载入失败：\(reply.reason)") }
                if req.call == "park" { print("（直连推流）手机已切入后台，世界热保留并已落盘") }
                calls += 1
                if Date().timeIntervalSince(started) > 30 {
                    print("（直连推流）近 30 秒处理 \(calls) 次指令/查询")
                    calls = 0; started = Date()
                }
                if !conn.sendMux(type: EngineWire.muxReply, id: frameId, body: EngineWire.reply(reply, compress: true)) { break }
            }
        }
    }

    clientLock.lock()
    if clientGeneration == conn.gen && activeDirect === conn {
        activeDirect = nil
        streamer.stopForIdle()
    }
    clientLock.unlock()
    conn.markClosed()
    print("（直连 TCP）连接 [#\(conn.gen)] 已关闭（世界安全保留在内存中，手机返回前台秒级无感重连）")
}

while true {
    let client = accept(listener, nil, nil)
    if client == invalidSocket { continue }
    clientLock.lock()
    let prev = activeDirect
    clientGeneration &+= 1
    let gen = clientGeneration
    let conn = DirectClient(socket: client, gen: gen)
    activeDirect = conn
    clientLock.unlock()
    if let prev { prev.markClosed() }
    Thread.detachNewThread { handleLANClient(conn) }
}
