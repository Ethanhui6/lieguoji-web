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

// 列国纪远程计算服务器 v5：
// 1. 局域网直连（TCP 8765，支持多连瞬切抢占，彻底根治手机退后台重进时旧半开连接卡死 accept 的顽疾；启用 TCP_NODELAY / SO_KEEPALIVE / 35s 超时）。
// 2. 服务端流水线预推演引擎（SimStreamer）：电脑后台线程始终抢先一步在本地 CPU 完成推演，手机拉取 pullLatest 零等待回包，彻底消除「每步等一来回」卡顿。
// 3. 双路并发云端中转长轮询（Cloudflare Pages / Durable Object）：始终保持两条热连接待命，零轮询空窗期，4G/5G 户外也能丝滑推演。
// 4. 自动磁盘热备（saves/autosave.lgj）：切后台 park 与每 90 秒自动落盘，重启服务器也能秒恢复最近世界。

setvbuf(stdout, nil, _IONBF, 0)
let port = UInt16(CommandLine.arguments.dropFirst().first ?? "") ?? 8765
let service = EngineService()
let engineLock = NSLock()

let serverDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
let autoSaveURL = serverDir.appendingPathComponent("saves", isDirectory: true).appendingPathComponent("autosave.lgj")

/// 服务端后台单帧预推演器：开启播放流后，在网络传输与手机渲染期间抢先算好下一帧 GameState，
/// 既保证手机拉取 0ms 算力等待，又严格最多领先 1 帧防止手机切后台后世界脱缰狂奔。
final class SimStreamer {
    private let stateLock = NSLock()
    private var playing = false
    private var daysPerStep = 3
    private var bufferedFrame: Data?
    private var lastClientActivity = Date()
    private var lastDiskSave = Date.distantPast

    func configure(playing: Bool, days: Int) {
        stateLock.lock()
        self.playing = playing
        self.daysPerStep = max(1, min(60, days))
        self.lastClientActivity = Date()
        if !playing { self.bufferedFrame = nil }
        stateLock.unlock()
    }

    func invalidateBuffer() {
        stateLock.lock()
        self.bufferedFrame = nil
        self.lastClientActivity = Date()
        stateLock.unlock()
    }

    func park() {
        stateLock.lock()
        self.playing = false
        self.bufferedFrame = nil
        stateLock.unlock()
        saveCheckpoint(force: true)
    }

    func pull(fallbackDays: Int) -> EngineService.Reply {
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
        return service.handle("step", ["days": max(1, min(60, fallbackDays))], payload: nil)
    }

    func saveCheckpoint(force: Bool = false) {
        let now = Date()
        stateLock.lock()
        let due = force || now.timeIntervalSince(lastDiskSave) >= 90
        if due { lastDiskSave = now }
        stateLock.unlock()
        guard due else { return }

        engineLock.lock()
        let snapshot = service.engine?.save()
        engineLock.unlock()
        guard let snapshot else { return }
        let dir = autoSaveURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? snapshot.write(to: autoSaveURL, options: .atomic)
    }

    func start() {
        Thread.detachNewThread { [weak self] in
            while let self {
                self.stateLock.lock()
                let active = self.playing
                let needsFrame = self.bufferedFrame == nil
                let days = self.daysPerStep
                let idleSecs = Date().timeIntervalSince(self.lastClientActivity)
                if active && idleSecs > 25 {
                    self.playing = false
                    self.bufferedFrame = nil
                }
                self.stateLock.unlock()

                if active && needsFrame && idleSecs <= 25 {
                    engineLock.lock()
                    let reply = service.handle("step", ["days": days], payload: nil)
                    engineLock.unlock()
                    if reply.ok, let data = reply.data, !data.isEmpty {
                        self.stateLock.lock()
                        if self.playing { self.bufferedFrame = data }
                        self.stateLock.unlock()
                    }
                    self.saveCheckpoint(force: false)
                    Thread.sleep(forTimeInterval: 0.015)
                } else {
                    Thread.sleep(forTimeInterval: 0.03)
                }
            }
        }
    }
}

let streamer = SimStreamer()
streamer.start()

func serve(_ call: String, _ args: [String: Any], _ payload: Data?) -> EngineService.Reply {
    if call == "streamConfig" {
        let on = (args["playing"] as? NSNumber)?.boolValue ?? (args["playing"] as? Bool) ?? false
        let days = (args["days"] as? NSNumber)?.intValue ?? (args["days"] as? Int) ?? 3
        streamer.configure(playing: on, days: days)
        return EngineService.Reply(ok: true, reason: "stream:\(on ? days : 0)")
    }
    if call == "pullLatest" {
        let days = (args["days"] as? NSNumber)?.intValue ?? (args["days"] as? Int) ?? 3
        return streamer.pull(fallbackDays: days)
    }
    if call == "park" {
        streamer.park()
        engineLock.lock(); defer { engineLock.unlock() }
        return service.handle("park", args, payload: nil)
    }
    // 除只读查询外，一切写入或切世界指令均清空旧预推演缓存，确保玩家指令 100% 即时生效。
    let readOnly: Set<String> = [
        "ping", "isOpen", "state", "province", "nationInfo", "diplomacyInfo", "tradeInfo",
        "armyRecord", "financeInfo", "regionInfo", "chronicle", "generals", "familyTree",
        "view", "worldSettings", "worldRules", "nationHistory", "nationReigns", "nationBreakdown",
        "provinceBreakdown", "warCompare", "grandInfo", "replayTimeline", "statistics", "route",
        "regime", "posts", "postCandidates", "officeCandidates", "allianceList", "districtList",
        "familyList", "placeNames", "mapExtras", "extraUnits", "unitProfile", "catalogEdits",
        "mapLabels", "throneCandidates", "nationProvinces", "profileReport"
    ]
    if !readOnly.contains(call) { streamer.invalidateBuffer() }

    engineLock.lock()
    defer { engineLock.unlock() }
    let reply = service.handle(call, args, payload: payload)
    if call == "open" && reply.ok {
        DispatchQueue.global(qos: .utility).async { streamer.saveCheckpoint(force: true) }
    }
    return reply
}

// MARK: - 中转（双路并发长轮询：零空窗低延迟，无需局域网与公网 IP）

let relayBases = [
    "https://lieguoji-edge.pages.dev/api/relay",
    "https://claude-native-map.lieguoji-web.pages.dev/api/relay",
    "https://lieguoji-web.pages.dev/api/relay"
]

func pairingCode() -> String {
    let file = serverDir.appendingPathComponent("pairing.txt")
    if let saved = try? String(contentsOf: file, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
       saved.count >= 6 { return saved.uppercased() }
    return RemoteRoom.personal
}

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
                    base = b; break
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
                print("已连上列国纪云端高速中转（双通道待命）：手机在任何网络下均可自动接入，无需输入任何地址。")
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
            var qs = "v=5"
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
        let reply = serve(call, args, payload.isEmpty ? nil : payload)
        if call == "open" { print(reply.ok ? "（云端中转）世界已载入，开始高速推演" : "（云端中转）世界载入失败：\(reply.reason)") }
        if call == "park" { print("（云端中转）手机已切入后台，世界热保留在电脑内存并已自动备份") }

        let lan = localAddresses().map { "\($0):\(port)" }.joined(separator: ",")
        var postURL = base! + "/room/\(code)/reply/\(id)?next=1&v=5"
        if !lan.isEmpty { postURL += "&lan=" + lan }
        var post = URLRequest(url: URL(string: postURL)!)
        post.httpMethod = "POST"
        post.httpBody = EngineWire.reply(reply)
        post.timeoutInterval = 90
        post.setValue("application/octet-stream", forHTTPHeaderField: "content-type")
        if let answer = http(post), answer.status == 200 { carried = answer }
    }
}

let code = pairingCode()

/// 开机自动运行 (Windows): 在启动文件夹写入最小化自启脚本。
func installStartup() {
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

// 启动双路并发中转工作线程（永远至少有一条热连接在中转等待下一指令，消除轮询空窗延迟）
Thread.detachNewThread { relayWorker(workerId: 1, code: code) }
Thread.detachNewThread { Thread.sleep(forTimeInterval: 0.4); relayWorker(workerId: 2, code: code) }

// MARK: - 局域网低延迟 TCP 直连（多连即时抢占 + TCP_NODELAY + SO_KEEPALIVE + 35s 读超时）

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

func tuneClientSocket(_ s: Socket) {
    var one: Int32 = 1
    #if os(Windows)
    _ = withUnsafePointer(to: &one) { $0.withMemoryRebound(to: CChar.self, capacity: 4) {
        setsockopt(s, Int32(IPPROTO_TCP.rawValue), TCP_NODELAY, $0, 4)
        setsockopt(s, SOL_SOCKET, SO_KEEPALIVE, $0, 4)
    } }
    var timeoutMs: DWORD = 45_000
    _ = withUnsafePointer(to: &timeoutMs) { $0.withMemoryRebound(to: CChar.self, capacity: 4) {
        setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, $0, 4)
        setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, $0, 4)
    } }
    #elseif canImport(Glibc)
    setsockopt(s, Int32(IPPROTO_TCP), TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(s, SOL_SOCKET, SO_KEEPALIVE, &one, socklen_t(MemoryLayout<Int32>.size))
    var tv = timeval(tv_sec: 45, tv_usec: 0)
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    #else
    setsockopt(s, IPPROTO_TCP, TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(s, SOL_SOCKET, SO_KEEPALIVE, &one, socklen_t(MemoryLayout<Int32>.size))
    var tv = timeval(tv_sec: 45, tv_usec: 0)
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    #endif
}

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
_ = withUnsafePointer(to: &yes) { $0.withMemoryRebound(to: CChar.self, capacity: 4) { setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, $0, 4) } }
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
if bound != 0 || listen(listener, 8) != 0 {
    print("局域网端口 \(port) 不可用（可在命令后加其他端口号，例如 LieguojiServer 8766）；云端中转不受影响。")
    while true { Thread.sleep(forTimeInterval: 3600) }
}

print("列国纪远程计算服务器 v5（高速流水线 + 云端双通道 + 自动热备）已启动")
print("配对码：\(code)")
print("手机打开游戏即自动接入；同一 Wi-Fi 自动毫秒级直连，切后台再返回秒级无感重连。")
installStartup()
print("局域网直连端口：\(port)")
let addresses = localAddresses()
if addresses.isEmpty {
    print("局域网地址：可用 ipconfig 查看本机 IP，端口 \(port)")
} else {
    print("局域网地址：" + addresses.map { "\($0):\(port)" }.joined(separator: "  或  "))
}
print("首次运行若弹出防火墙提示，请允许专用网络访问。按 Ctrl+C 退出。")

let clientLock = NSLock()
var activeClient: Socket = invalidSocket
var clientGeneration: UInt64 = 0

func handleLANClient(_ client: Socket, gen: UInt64) {
    tuneClientSocket(client)
    print("（局域网直连）手机已接入 [#\(gen)]")
    var calls = 0, started = Date()
    while let headerLength = readU32(client), headerLength >= 0, headerLength < 16 << 20,
          let header = receiveExactly(client, headerLength),
          let payloadLength = readU32(client), payloadLength >= 0, payloadLength < 1 << 30,
          let payload = receiveExactly(client, payloadLength) {
        let o = (try? JSONSerialization.jsonObject(with: header)) as? [String: Any] ?? [:]
        let call = o["call"] as? String ?? "", args = o["args"] as? [String: Any] ?? [:]
        let reply = serve(call, args, payload.isEmpty ? nil : payload)
        if call == "open" { print(reply.ok ? "（局域网）世界已载入，开始高速推演" : "（局域网）世界载入失败：\(reply.reason)") }
        if call == "park" { print("（局域网）手机已切入后台，世界热保留在电脑内存") }
        calls += 1
        if Date().timeIntervalSince(started) > 30 {
            print("（局域网）近 30 秒已高速处理 \(calls) 次推演/指令")
            calls = 0; started = Date()
        }
        if !sendAll(client, EngineWire.reply(reply)) { break }
    }
    clientLock.lock()
    if clientGeneration == gen && activeClient == client {
        activeClient = invalidSocket
        streamer.configure(playing: false, days: 3)
    }
    clientLock.unlock()
    closeSocket(client)
    print("（局域网）连接 [#\(gen)] 已关闭（世界安全保留在电脑上，手机切回前台秒级重连）")
}

while true {
    let client = accept(listener, nil, nil)
    if client == invalidSocket { continue }
    clientLock.lock()
    let prev = activeClient
    clientGeneration &+= 1
    let gen = clientGeneration
    activeClient = client
    clientLock.unlock()
    // 立即关闭可能遗留的半开旧连接，杜绝手机退后台重进时新连接被旧僵尸 socket 死锁！
    if prev != invalidSocket { closeSocket(prev) }
    Thread.detachNewThread { handleLANClient(client, gen: gen) }
}
