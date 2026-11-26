import Foundation
import Network
import Darwin
#if canImport(UIKit)
import UIKit
#endif
import LieguojiCore

/// 轻量级系统网络路径监听器（NWPathMonitor）：
/// 监听 Wi-Fi ↔ 5G 切换、断网恢复或接口变更；当链路重新 `.satisfied` 时即时触发回调（<300ms 秒连云服）。
final class NetworkPathWatcher: @unchecked Sendable {
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "lieguoji.netpath", qos: .utility)
    private let lock = NSLock()
    private var started = false
    private var stopped = false
    private var hasInitial = false
    private var lastStatus: NWPath.Status = .unsatisfied
    private var lastInterfaceSignature: String = ""
    private var onRecovered: (@Sendable (String) -> Void)?

    init(onRecovered: @escaping @Sendable (String) -> Void) {
        self.onRecovered = onRecovered
    }

    func start() {
        lock.lock()
        guard !started && !stopped else { lock.unlock(); return }
        started = true
        lock.unlock()

        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let sig = Self.interfaceSignature(for: path)
            let status = path.status
            self.lock.lock()
            let first = !self.hasInitial
            let prevStatus = self.lastStatus
            let prevSig = self.lastInterfaceSignature
            self.hasInitial = true
            self.lastStatus = status
            self.lastInterfaceSignature = sig
            let cb = self.stopped ? nil : self.onRecovered
            self.lock.unlock()

            if first { return }
            if status == .satisfied && (prevStatus != .satisfied || sig != prevSig) {
                cb?(sig)
            }
        }
        monitor.start(queue: queue)
    }

    func stop() {
        lock.lock()
        if stopped { lock.unlock(); return }
        stopped = true
        onRecovered = nil
        let wasStarted = started
        lock.unlock()
        monitor.pathUpdateHandler = nil
        if wasStarted {
            monitor.cancel()
        }
    }

    deinit {
        stop()
    }

    private static func interfaceSignature(for path: NWPath) -> String {
        var kinds: [String] = []
        if path.usesInterfaceType(.wifi) { kinds.append("wifi") }
        if path.usesInterfaceType(.cellular) { kinds.append("cellular") }
        if path.usesInterfaceType(.wiredEthernet) { kinds.append("wired") }
        if path.usesInterfaceType(.other) { kinds.append("other") }
        return kinds.isEmpty ? "none" : kinds.joined(separator: "+")
    }
}

#if canImport(UIKit)
private final class BackgroundTaskToken: @unchecked Sendable {
    private let lock = NSLock()
    private var taskId: UIBackgroundTaskIdentifier = .invalid

    @MainActor
    func begin(name: String) {
        let id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            self?.end()
        }
        lock.lock()
        taskId = id
        lock.unlock()
    }

    func end() {
        lock.lock()
        let id = taskId
        taskId = .invalid
        lock.unlock()
        guard id != .invalid else { return }
        Task { @MainActor in
            UIApplication.shared.endBackgroundTask(id)
        }
    }
}
#endif

/// 独立于主线程与 Actor 之外的客户端推流解码缓冲队列（v8 滑动窗口背压 + Jitter Buffer）：
/// - 收到服务器主动推送的 LZ4 压缩精简帧后，立即在后台并发队列完成解压 + JSON 解码，0ms 阻塞 UI 查询与点击；
/// - 每消费一帧立刻触发 `onFrameConsumed?(tag)` 回传 9 字节 `MUX_ACK`，严格控制全链路至多 2 帧在途，
///   彻底消灭 TCP Bufferbloat、1000ms 队列堆积延迟与一月瞬移七月！
final class StreamFrameBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private let decodeQueue = DispatchQueue(label: "lieguoji.stream.decode", qos: .userInitiated)
    private var epoch: UInt8 = 0
    private var queue: [(tag: UInt32, state: GameState)] = []
    private var waiter: CheckedContinuation<GameState?, Never>?
    private var waiterToken: UInt64 = 0
    private var waiterWorkItem: DispatchWorkItem?
    private var lastCompressedBytes: Int = 0
    private var lastRawBytes: Int = 0
    private var framesReceived: Int = 0
    private var latestDecodedDay: Int = 0
    private var baselineOwners: [Int] = []
    private let maxBuffered = 3
    var onFrameConsumed: (@Sendable (UInt32) -> Void)?

    var lastDay: Int {
        lock.lock()
        defer { lock.unlock() }
        return latestDecodedDay
    }

    func resetDay() {
        lock.lock()
        latestDecodedDay = 0
        baselineOwners.removeAll(keepingCapacity: true)
        lock.unlock()
    }

    func resetBaseline() {
        lock.lock()
        baselineOwners.removeAll(keepingCapacity: true)
        lock.unlock()
    }

    func seedBaselineOwners(_ owners: [Int]) {
        guard !owners.isEmpty else { return }
        lock.lock()
        baselineOwners = owners
        lock.unlock()
    }

    /// 将服务端 v11 下发的 `ownersDelta` 差量帧安全还原为完整 `owners` 数组，并在收到全量帧时刷新基线。
    func reconstructOwnersIfNeeded(_ state: inout GameState) {
        lock.lock()
        defer { lock.unlock() }
        if !state.owners.isEmpty {
            baselineOwners = state.owners
            return
        }
        if let delta = state.ownersDelta, !baselineOwners.isEmpty {
            var rebuilt = baselineOwners
            var i = 0
            while i + 1 < delta.count {
                let idx = delta[i]
                let owner = delta[i + 1]
                if idx >= 0 && idx < rebuilt.count {
                    rebuilt[idx] = owner
                }
                i += 2
            }
            state.owners = rebuilt
            baselineOwners = rebuilt
        }
    }

    func reset(epoch: UInt8) {
        lock.lock()
        self.epoch = epoch
        queue.removeAll(keepingCapacity: true)
        let w = waiter
        waiter = nil
        waiterToken &+= 1
        let item = waiterWorkItem
        waiterWorkItem = nil
        lock.unlock()
        item?.cancel()
        w?.resume(returning: nil)
    }

    func ingest(tag: UInt32, compressedPayload: Data) {
        let frameEpoch = UInt8((tag >> 24) & 0xFF)
        lock.lock()
        let accept = (frameEpoch == epoch)
        lock.unlock()
        guard accept else { return }

        let compSize = compressedPayload.count
        decodeQueue.async { [weak self] in
            guard let self else { return }
            let raw = WireCodec.decompressIfNeeded(compressedPayload)
            guard !raw.isEmpty, var decoded = try? JSONDecoder().decode(GameState.self, from: raw) else { return }
            self.lock.lock()
            guard frameEpoch == self.epoch else {
                self.lock.unlock()
                return
            }
            if !decoded.owners.isEmpty {
                self.baselineOwners = decoded.owners
            } else if let delta = decoded.ownersDelta, !self.baselineOwners.isEmpty {
                var rebuilt = self.baselineOwners
                var i = 0
                while i + 1 < delta.count {
                    let idx = delta[i]
                    let owner = delta[i + 1]
                    if idx >= 0 && idx < rebuilt.count {
                        rebuilt[idx] = owner
                    }
                    i += 2
                }
                decoded.owners = rebuilt
                self.baselineOwners = rebuilt
            }
            self.lastCompressedBytes = compSize
            self.lastRawBytes = raw.count
            self.framesReceived += 1
            if decoded.day > self.latestDecodedDay { self.latestDecodedDay = decoded.day }
            let ackCb = self.onFrameConsumed
            if let w = self.waiter {
                self.waiter = nil
                self.waiterToken &+= 1
                let item = self.waiterWorkItem
                self.waiterWorkItem = nil
                self.lock.unlock()
                item?.cancel()
                ackCb?(tag)
                w.resume(returning: decoded)
                return
            }
            var droppedTag: UInt32?
            if self.queue.count >= self.maxBuffered {
                droppedTag = self.queue.removeFirst().tag
            }
            self.queue.append((tag, decoded))
            self.lock.unlock()
            if let dt = droppedTag { ackCb?(dt) }
        }
    }

    func nextFrame(timeoutSeconds: Double = 2.4) async -> GameState? {
        lock.lock()
        if !queue.isEmpty {
            let first = queue.removeFirst()
            let ackCb = onFrameConsumed
            lock.unlock()
            ackCb?(first.tag)
            return first.state
        }
        lock.unlock()

        return await withCheckedContinuation { (cont: CheckedContinuation<GameState?, Never>) in
            lock.lock()
            if !queue.isEmpty {
                let first = queue.removeFirst()
                let ackCb = onFrameConsumed
                lock.unlock()
                ackCb?(first.tag)
                cont.resume(returning: first.state)
                return
            }
            let prev = waiter
            let prevItem = waiterWorkItem
            waiter = cont
            waiterToken &+= 1
            let myToken = waiterToken
            let activeEpoch = epoch
            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                self.lock.lock()
                if self.epoch == activeEpoch, self.waiterToken == myToken, let w = self.waiter {
                    self.waiter = nil
                    self.waiterWorkItem = nil
                    self.lock.unlock()
                    w.resume(returning: nil)
                } else {
                    self.lock.unlock()
                }
            }
            waiterWorkItem = work
            lock.unlock()
            prevItem?.cancel()
            prev?.resume(returning: nil)

            DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + timeoutSeconds, execute: work)
        }
    }

    func stats() -> (buffered: Int, frameKB: Double, rawKB: Double, total: Int) {
        lock.lock()
        defer { lock.unlock() }
        return (queue.count, Double(lastCompressedBytes) / 1024.0, Double(lastRawBytes) / 1024.0, framesReceived)
    }
}

/// 局域网 UDP 零配置自动发现（端口 8766）：同一 Wi-Fi 下无需经过外网中转，10–30 ms 秒连电脑。
enum LANDiscovery {
    static func discover(roomCode: String, timeoutSeconds: Double = 0.65) async -> String? {
        await Task.detached(priority: .userInitiated) { () -> String? in
            let sock = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
            guard sock >= 0 else { return nil }
            defer { Darwin.close(sock) }
            var one: Int32 = 1
            _ = setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &one, socklen_t(MemoryLayout<Int32>.size))
            let usec = Int32(max(50_000, Int(timeoutSeconds * 1_000_000)))
            var tv = timeval(tv_sec: Int(usec / 1_000_000), tv_usec: usec % 1_000_000)
            _ = setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

            var bcast = sockaddr_in()
            bcast.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            bcast.sin_family = sa_family_t(AF_INET)
            bcast.sin_port = UInt16(8766).bigEndian
            bcast.sin_addr.s_addr = in_addr_t(0xFFFF_FFFF)

            let probe = Array("LGJ_DISCOVER:\(roomCode)".utf8)
            _ = probe.withUnsafeBytes { raw in
                guard let p = raw.baseAddress else { return -1 }
                return withUnsafePointer(to: &bcast) { bp in
                    bp.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                        sendto(sock, p, raw.count, 0, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
                    }
                }
            }

            var buf = [UInt8](repeating: 0, count: 256)
            var from = sockaddr_in()
            var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)
            let got = buf.withUnsafeMutableBytes { raw in
                guard let p = raw.baseAddress else { return -1 }
                return withUnsafeMutablePointer(to: &from) { fp in
                    fp.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                        recvfrom(sock, p, raw.count, 0, sa, &fromLen)
                    }
                }
            }
            guard got > 0 else { return nil }
            let text = String(decoding: buf.prefix(got), as: UTF8.self)
            let parts = text.split(separator: ":")
            guard parts.count >= 3, parts[0] == "LGJ_HERE", String(parts[1]).uppercased() == roomCode.uppercased() else { return nil }
            var ipBuf = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            var addr = from.sin_addr
            guard inet_ntop(AF_INET, &addr, &ipBuf, socklen_t(INET_ADDRSTRLEN)) != nil else { return nil }
            let ip = String(cString: ipBuf)
            let tcpPort = String(parts[2])
            return "\(ip):\(tcpPort)"
        }.value
    }
}

/// The engine of the running world on its own serial executor (the engine keeps static tables, so
/// every call goes through this one actor). Days, commands and saves run in Swift — on the phone, or,
/// with 远程计算, on a computer / dedicated cloud server running LieguojiServer (the phone then only draws).
actor NativeHost {
    private let service = EngineService()
    private var remote: EngineLink?
    private(set) var remoteAddress: String?
    private(set) var remoteTransport: String = ""
    private(set) var lastRTTMs: Int?
    private(set) var serverSupportsStream = false
    private(set) var serverSupportsPush = false
    private(set) var serverSupportsLZ4 = false
    private(set) var parked = false
    private(set) var lastResumedState: Data?
    private var currentWorldId: String = ""
    private var currentKnownDay: Int = 0
    private var baselineOwners: [Int] = []
    private var reattaching = false
    private var onLinkLost: (@Sendable () -> Void)?
    private var streamEpoch: UInt8 = 1
    private static var catalogs = false

    func consumeResumedState() -> Data? {
        let data = lastResumedState
        lastResumedState = nil
        return data
    }

    func setOnLinkLost(_ handler: (@Sendable () -> Void)?) {
        onLinkLost = handler
    }

    func updateKnownDay(_ day: Int) {
        if day > currentKnownDay { currentKnownDay = day }
    }

    private func handleUnexpectedLinkDrop(_ dropped: EngineLink) {
        guard let current = remote, (current as AnyObject) === (dropped as AnyObject) else { return }
        current.cancel()
        remote = nil
        remoteAddress = nil
        serverSupportsStream = false
        serverSupportsPush = false
        serverSupportsLZ4 = false
        streamBuffer.onFrameConsumed = nil
        streamEpoch &+= 1
        streamBuffer.reset(epoch: streamEpoch)
        if !parked {
            lost = true
            onLinkLost?()
        }
    }

    private nonisolated static func parsePingText(_ text: String?) -> (day: Int?, worldId: String?, hasCatalogs: Bool) {
        guard let text, !text.isEmpty else { return (nil, nil, false) }
        var day: Int?
        var wid: String?
        var hasCat = false
        for part in text.split(separator: "|") {
            if part.hasPrefix("day:") {
                day = Int(part.dropFirst(4))
            } else if part.hasPrefix("wid:") {
                let v = String(part.dropFirst(4))
                if !v.isEmpty { wid = v }
            } else if part == "cat:1" {
                hasCat = true
            }
        }
        return (day, wid, hasCat)
    }

    private func knownWorldMeta() -> (worldId: String, day: Int) {
        let svcWid = service.currentWorldId
        let wid = !svcWid.isEmpty ? svcWid : currentWorldId
        let svcDay = service.engine != nil ? service.currentDay : 0
        let day = max(svcDay, currentKnownDay, streamBuffer.lastDay)
        return (wid, day)
    }

    /// 独立非隔离推流缓冲队列：服务器推送帧直接在此解码排队，绝不与主线程或面板查询争锁。
    nonisolated let streamBuffer = StreamFrameBuffer()

    /// 玩家自定或默认配对房间码（用于远程计算与云端存档统一寻址）。
    nonisolated static var activeRoomCode: String {
        let custom = (UserDefaults.standard.string(forKey: "remote.roomCode") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "-", with: "")
            .uppercased()
        if custom.count >= 6, custom.count <= 16, custom.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) {
            return custom
        }
        return RemoteRoom.personal
    }

    /// 玩家保存的专属云服务器或固定局域网直连地址；默认内置腾讯云专属计算节点，开箱即享 20–40 ms 真网游推流。
    nonisolated static var savedDirectAddress: String {
        if UserDefaults.standard.bool(forKey: "remote.directAddressCleared") {
            return ""
        }
        let saved = (UserDefaults.standard.string(forKey: "remote.directAddress") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !saved.isEmpty { return saved }
        return OnlinePlatform.defaultComputeHost
    }

    nonisolated static func invalidateCatalogCache() {
        Task { await resetCatalogFlag() }
    }
    private static func resetCatalogFlag() {
        catalogs = false
    }

    static func catalogData() throws -> (traits: Data, noble: Data, cultures: Data) {
        func data(_ name: String, _ ext: String, _ dir: String) throws -> Data {
            guard let url = HotPackManager.resourceURL(name: name, ext: ext, subdirectory: dir) else {
                throw EngineError.message("安装包缺少\(name)数据")
            }
            return try Data(contentsOf: url)
        }
        return (try data("traits", "json", "Catalog"), try data("noble-cultures", "json", "Catalog"), try data("cultures", "json", "World"))
    }
    static func loadCatalogs() throws {
        if catalogs { return }
        let c = try catalogData()
        try NativeEngine.loadCatalogs(traits: c.traits, nobleCultures: c.noble, cultures: c.cultures)
        catalogs = true
    }

    // MARK: - channel

    /// The world the computer last returned (a save), so a broken link or PC restart can recover seamlessly.
    private var lastWorld: Data?

    /// 实时纯网络延迟存储（EWMA 平滑，由零锁 `MUX_PING` 独立更新，抵抗弱网单包尖峰抖动）。
    private final class RTTBox: @unchecked Sendable {
        private let lock = NSLock()
        private var ms: Int?
        var value: Int? {
            get { lock.lock(); defer { lock.unlock() }; return ms }
            set {
                lock.lock()
                if let nv = newValue {
                    ms = ms.map { Int((Double($0) * 0.70 + Double(nv) * 0.30).rounded()) } ?? nv
                } else {
                    ms = nil
                }
                lock.unlock()
            }
        }
        func reset(_ v: Int?) { lock.lock(); ms = v; lock.unlock() }
    }
    private let rttBox = RTTBox()
    nonisolated var liveRTTMs: Int? { rttBox.value }
    private var cloudHandingOff = false

    /// One request, on the computer when connected, else in process.
    private func call(_ name: String, _ args: [String: Any] = [:], payload: Data? = nil) async -> EngineService.Reply {
        if let remote {
            let t0 = Date().timeIntervalSinceReferenceDate
            do {
                let r = try await remote.call(name, args, payload: payload)
                let ms = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
                if name == "ping" || name == "streamConfig" {
                    rttBox.value = ms
                    lastRTTMs = rttBox.value
                }
                return r
            } catch {
                remote.cancel(); self.remote = nil; remoteAddress = nil
                serverSupportsStream = false; serverSupportsPush = false; serverSupportsLZ4 = false
                streamBuffer.onFrameConsumed = nil
                streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
                if name != "open" && name != "catalogs" && !parked {
                    if let _ = await reattachQuick() {
                        if let fresh = self.remote, let retry = try? await fresh.call(name, args, payload: payload) {
                            return retry
                        }
                    }
                }
                lost = true
                return EngineService.Reply(ok: false, reason: "与服务器的连接中断")
            }
        }
        if parked { return EngineService.Reply(ok: false, reason: "已暂存后台，返回前台即自动续连") }
        if lost { return EngineService.Reply(ok: false, reason: "与服务器的连接中断，正在重连") }
        return service.handle(name, args, payload: payload)
    }

    /// Connects to a dedicated cloud server, LAN computer, or Cloudflare push relay and moves the world there.
    func connect(_ address: String, timeout: Double = 5.5, reattach: Bool = false) async throws -> String {
        let text = address.trimmingCharacters(in: .whitespaces)
        let code = text.replacingOccurrences(of: "-", with: "").uppercased()
        let link: EngineLink, label: String, transport: String
        var isDirectTCP = false
        var directLinkRef: RemoteLink?
        var wsLinkRef: RelayWSLink?

        if code.count >= 6, code.count <= 16, code.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }), !text.contains(".") && !text.contains(":") {
            guard let status = await RelayLink.probeStatus(code: code) else {
                throw EngineError.message("连不上云端中转服务器，请检查网络。")
            }
            guard status.online else { throw EngineError.message("电脑不在线：请在电脑上运行「列国纪远程计算」，并核对配对码。") }
            if let ws = try? await RelayWSLink.connect(code: code, base: status.activeBase) {
                link = ws
                wsLinkRef = ws
                transport = "云端推流"
                label = code == Self.activeRoomCode ? "云端高速推流" : "配对码 \(code.prefix(4))-\(code.dropFirst(4))"
            } else {
                let relay = RelayLink(code: code)
                try await relay.start()
                link = relay
                transport = "云端中转"
                label = code == Self.activeRoomCode ? "云端中转" : "配对码 \(code.prefix(4))-\(code.dropFirst(4))"
            }
        } else {
            var host = text, port: UInt16 = 8765
            if let i = host.lastIndex(of: ":"), let p = UInt16(host[host.index(after: i)...]) { port = p; host = String(host[..<i]) }
            guard !host.isEmpty else { throw EngineError.message("请填写专属服务器地址（IP:8765）或配对码") }
            let direct = RemoteLink(host: host, port: port)
            try await direct.start(timeout: timeout)
            link = direct
            directLinkRef = direct
            isDirectTCP = true
            let isPrivate = host.hasPrefix("192.168.") || host.hasPrefix("10.") || host.hasPrefix("172.") || host.hasPrefix("127.") || host.hasSuffix(".local")
            transport = isPrivate ? "局域网直连" : "专属云服"
            label = isPrivate ? "\(host):\(port)（局域网）" : "\(host):\(port)（专属服）"
        }

        let t0 = Date().timeIntervalSinceReferenceDate
        let hello = try await link.call("ping", ["v": 6], payload: nil)
        let rtt = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
        guard hello.ok else { link.cancel(); throw EngineError.message("对方不是列国纪远程计算服务器") }
        guard EngineWire.compatibleGreetings.contains(hello.reason) else {
            link.cancel()
            throw EngineError.message("服务器版本较旧，请更新后再连接；这局先用手机计算。")
        }

        let pingMeta = Self.parsePingText(hello.text)
        var serverHasCatalogs = pingMeta.hasCatalogs
        let isV6 = (hello.reason == EngineWire.greeting)
        let isV5OrNewer = isV6 || hello.reason == "列国纪远程计算·5"
        var pushCapable = false

        // v10 协议：直连 TCP 升级为全双工多路复用 + 滑动窗口背压（MUX_ACK）+ 2.5s 心跳；云端 WS 挂载单向 MSG_PUSH + LZ4。
        let buf = self.streamBuffer
        let box = self.rttBox
        if isV6 {
            if let directLinkRef {
                directLinkRef.onPushFrame = { tag, data in buf.ingest(tag: tag, compressedPayload: data) }
                directLinkRef.onRTTMeasured = { ms in box.value = ms }
                directLinkRef.onUnexpectedClose = { [weak self, weak directLinkRef] in
                    guard let self, let dropped = directLinkRef else { return }
                    Task { await self.handleUnexpectedLinkDrop(dropped) }
                }
                if (try? await directLinkRef.upgradeToMux()) == true {
                    pushCapable = true
                    buf.onFrameConsumed = { [weak directLinkRef] tag in directLinkRef?.sendMuxAck(tag: tag) }
                }
            } else if let wsLinkRef {
                wsLinkRef.compressUploads = true
                wsLinkRef.onPushFrame = { tag, data in buf.ingest(tag: tag, compressedPayload: data) }
                wsLinkRef.onUnexpectedClose = { [weak self, weak wsLinkRef] in
                    guard let self, let dropped = wsLinkRef else { return }
                    Task { await self.handleUnexpectedLinkDrop(dropped) }
                }
                buf.onFrameConsumed = nil
                pushCapable = true
            }
        }
        let finalTransport = (pushCapable && isDirectTCP) ? "\(transport)推流" : transport

        // v10 worldId 感知秒级热续连：优先尝试 resumeWorld（内存 0ms / SSD 50ms，0 MB 上传！），适用于后台切回、断网重连与重进游戏！
        let localMeta = knownWorldMeta()
        if !localMeta.worldId.isEmpty {
            var resumed = try? await link.call("resumeWorld", ["worldId": localMeta.worldId, "day": localMeta.day], payload: nil)
            if let r = resumed, !r.ok, r.reason == "need_catalogs" {
                if let c = try? Self.catalogData(),
                   let catPayload = try? JSONSerialization.data(withJSONObject: [
                       "traits": c.traits.base64EncodedString(),
                       "nobleCultures": c.noble.base64EncodedString(),
                       "cultures": c.cultures.base64EncodedString()
                   ]) {
                    let catReply = try? await link.call("catalogs", [:], payload: catPayload)
                    if catReply?.ok == true {
                        serverHasCatalogs = true
                        resumed = try? await link.call("resumeWorld", ["worldId": localMeta.worldId, "day": localMeta.day], payload: nil)
                    }
                }
            }
            if let r = resumed, r.ok {
                lastResumedState = (r.data?.isEmpty == false) ? r.data : nil
                currentWorldId = localMeta.worldId
                if let sDay = pingMeta.day, sDay > currentKnownDay { currentKnownDay = sDay }
                remote = link; remoteAddress = label; remoteTransport = finalTransport
                rttBox.reset(rtt); lastRTTMs = rtt; serverSupportsStream = isV5OrNewer
                serverSupportsPush = pushCapable; serverSupportsLZ4 = isV6
                lost = false; parked = false; lastAddress = address
                return label
            }
        }

        if reattach {
            let canReuseOpen = (pingMeta.worldId == nil || localMeta.worldId.isEmpty || pingMeta.worldId == localMeta.worldId)
            let isOpen: Bool
            if canReuseOpen {
                let openReply = try? await link.call("isOpen", [:], payload: nil)
                isOpen = openReply?.ok ?? false
            } else {
                isOpen = false
            }
            if isOpen {
                remote = link; remoteAddress = label; remoteTransport = finalTransport
                rttBox.reset(rtt); lastRTTMs = rtt; serverSupportsStream = isV5OrNewer
                serverSupportsPush = pushCapable; serverSupportsLZ4 = isV6
                lost = false; parked = false; lastAddress = address
                return label
            }
            if let backup = lastWorld ?? service.engine?.save() {
                if !serverHasCatalogs {
                    let c = try Self.catalogData()
                    let catalogs = try JSONSerialization.data(withJSONObject: [
                        "traits": c.traits.base64EncodedString(),
                        "nobleCultures": c.noble.base64EncodedString(),
                        "cultures": c.cultures.base64EncodedString()
                    ])
                    guard (try await link.call("catalogs", [:], payload: catalogs)).ok else {
                        link.cancel()
                        throw EngineError.message("服务器重启后加载目录失败")
                    }
                }
                guard (try await link.call("open", [:], payload: backup)).ok else {
                    link.cancel()
                    throw EngineError.message("服务器重启后恢复世界失败")
                }
                _ = try? await link.call("enableAppRules", [:], payload: nil)
                remote = link; remoteAddress = label; remoteTransport = finalTransport
                rttBox.reset(rtt); lastRTTMs = rtt; serverSupportsStream = isV5OrNewer
                serverSupportsPush = pushCapable; serverSupportsLZ4 = isV6
                lost = false; parked = false; lastAddress = address
                return label
            }
            link.cancel(); throw EngineError.message("服务器上的世界已关闭")
        }

        // 关键零卡顿优化：先在 actor 内快速快照世界存档与版本号，再彻底释放 actor 在后台脱离上传存档；
        // 若服务器 ping 已回报 cat:1，跳过 2 MB 目录上传直接 LZ4 压缩传输世界！
        let startRev = advances.revision
        let startDay = service.engine?.run.world.day.asInt ?? 0
        var latestSave = service.engine?.save()
        let initialSave = latestSave
        let catalogsPayload: Data?
        if serverHasCatalogs {
            catalogsPayload = nil
        } else {
            let c = try Self.catalogData()
            catalogsPayload = try JSONSerialization.data(withJSONObject: [
                "traits": c.traits.base64EncodedString(),
                "nobleCultures": c.noble.base64EncodedString(),
                "cultures": c.cultures.base64EncodedString()
            ])
        }

        try await Task.detached(priority: .userInitiated) {
            do {
                if let catalogs = catalogsPayload {
                    let loaded = try await link.call("catalogs", [:], payload: catalogs)
                    guard loaded.ok else { throw EngineError.message(loaded.reason) }
                }
                if let save = initialSave {
                    let opened = try await link.call("open", [:], payload: save)
                    guard opened.ok else { throw EngineError.message("服务器载入世界失败：\(opened.reason)") }
                    _ = try? await link.call("enableAppRules", [:], payload: nil)
                }
            } catch {
                link.cancel()
                throw error
            }
        }.value

        // 若上传途中玩家已切到其他世界，礼貌释放这条旧连接。
        guard advances.revision == startRev else {
            link.cancel()
            throw EngineError.message("世界已切换，已取消旧连接")
        }

        // 若后台上传期间本机已先推演了若干天，精确追平差值天数或重新快照，严禁截断回退造成军队拉回！
        if initialSave != nil {
            var serverDay = startDay
            var nowDay = service.engine?.run.world.day.asInt ?? startDay
            var deltaDays = nowDay - serverDay

            if deltaDays > 15 {
                guard let freshSave = service.engine?.save() else {
                    link.cancel()
                    throw EngineError.message("本机世界已变化，已取消自动切换")
                }
                let freshDay = service.engine?.run.world.day.asInt ?? nowDay
                try await Task.detached(priority: .userInitiated) {
                    do {
                        let reopened = try await link.call("open", [:], payload: freshSave)
                        guard reopened.ok else { throw EngineError.message("服务器同步最新世界失败：\(reopened.reason)") }
                        _ = try? await link.call("enableAppRules", [:], payload: nil)
                    } catch {
                        link.cancel()
                        throw error
                    }
                }.value
                guard advances.revision == startRev else {
                    link.cancel()
                    throw EngineError.message("世界已切换，已取消旧连接")
                }
                latestSave = freshSave
                serverDay = freshDay
                nowDay = service.engine?.run.world.day.asInt ?? serverDay
                deltaDays = nowDay - serverDay
                if deltaDays > 15 {
                    link.cancel()
                    throw EngineError.message("本机推演推进较快，已取消本次切换以避免进度回退")
                }
            }

            if deltaDays > 0 {
                let step1 = deltaDays
                try await Task.detached(priority: .userInitiated) {
                    do {
                        let r1 = try await link.call("step", ["days": step1, "slim": true], payload: nil)
                        guard r1.ok else { throw EngineError.message("服务器同步进度失败：\(r1.reason)") }
                    } catch {
                        link.cancel()
                        throw error
                    }
                }.value
                guard advances.revision == startRev else {
                    link.cancel()
                    throw EngineError.message("世界已切换，已取消旧连接")
                }
                serverDay += step1

                let recheckDay = service.engine?.run.world.day.asInt ?? serverDay
                let remaining = recheckDay - serverDay
                if remaining > 15 {
                    link.cancel()
                    throw EngineError.message("本机推演推进较快，已取消本次切换以避免进度回退")
                } else if remaining > 0 {
                    let step2 = remaining
                    try await Task.detached(priority: .userInitiated) {
                        do {
                            let r2 = try await link.call("step", ["days": step2, "slim": true], payload: nil)
                            guard r2.ok else { throw EngineError.message("服务器追平进度失败：\(r2.reason)") }
                        } catch {
                            link.cancel()
                            throw error
                        }
                    }.value
                    guard advances.revision == startRev else {
                        link.cancel()
                        throw EngineError.message("世界已切换，已取消旧连接")
                    }
                    serverDay += step2
                }
            }
        }

        if let latestSave { lastWorld = latestSave }
        if !localMeta.worldId.isEmpty { currentWorldId = localMeta.worldId }
        currentKnownDay = max(currentKnownDay, service.engine?.run.world.day.asInt ?? startDay)
        remote = link; remoteAddress = label; remoteTransport = finalTransport
        rttBox.reset(rtt); lastRTTMs = rtt; serverSupportsStream = isV5OrNewer
        serverSupportsPush = pushCapable; serverSupportsLZ4 = isV6
        lastAddress = address; lost = false; parked = false
        return label
    }

    /// Back to the phone: the computer's world comes home first (LZ4-compressed for speed).
    func disconnect() async {
        parked = false; lost = false
        lastResumedState = nil
        serverSupportsStream = false; serverSupportsPush = false; serverSupportsLZ4 = false
        rttBox.reset(nil); lastRTTMs = nil
        streamBuffer.onFrameConsumed = nil
        streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
        guard let link = remote else { remoteAddress = nil; remoteTransport = ""; return }
        _ = try? await link.call("streamConfig", ["playing": false, "days": 1, "push": false], payload: nil)
        if let save = try? await link.call("save", [:], payload: nil), let data = save.data {
            _ = service.handle("open", [:], payload: data); service.engine?.enableAppRules()
            currentWorldId = service.currentWorldId
            currentKnownDay = service.currentDay
            lastWorld = data
        }
        link.cancel(); remote = nil; remoteAddress = nil; remoteTransport = ""; lastAddress = nil
    }

    /// 退入后台：仅发送 ~30 字节 `streamConfig` + `park` 通知服务器在云端落盘热备（30ms 内完成，绝不在 iOS 5 秒冻结窗口里下载 15MB 存档导致断联）。
    func parkForBackground() async -> Bool {
        streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
        guard let link = remote else { return false }
        parked = true
        #if canImport(UIKit)
        let bgToken = BackgroundTaskToken()
        await bgToken.begin(name: "lieguoji.park")
        defer { bgToken.end() }
        #endif
        _ = try? await link.call("streamConfig", ["playing": false, "days": 1, "push": false], payload: nil)
        _ = try? await link.call("park", [:], payload: nil)
        return true
    }

    /// 回到前台：1.2s 硬超时极速探活（绝不卡死在 12s 默认 RPC 超时上）；一旦识别 iOS 僵尸套接字立即 0ms 销毁并直连 `reattachBest()`（`resumeWorld` ~40ms 无上传秒续）。
    func resumeFromForeground() async -> (connected: Bool, label: String?, transport: String, rttMs: Int?, state: Data?) {
        // 先清空后台滞留的推流缓冲与暂停标记，避免切回瞬间旧帧积压跳格
        streamEpoch &+= 1
        streamBuffer.reset(epoch: streamEpoch)
        lastResumedState = nil

        if let link = remote {
            let probeRTT: Int?
            if let direct = link as? RemoteLink {
                probeRTT = await direct.fastProbeRTT(timeoutSeconds: 1.2)
            } else if let ws = link as? RelayWSLink {
                probeRTT = await ws.fastProbeRTT(timeoutSeconds: 1.2)
            } else {
                probeRTT = await Self.fastGenericPing(link, timeoutSeconds: 1.2)
            }

            if let rtt = probeRTT {
                rttBox.reset(rtt)
                lastRTTMs = rtt
                parked = false
                lost = false
                let resumed = (try? await link.call(serverSupportsStream ? "resume" : "state", [:], payload: nil))?.data
                return (true, remoteAddress, remoteTransport, rtt, resumed)
            }

            // iOS 后台回收/僵死的半开套接字：0ms 立即切断并销毁，绝不等待 12s 超时！
            link.cancel()
            remote = nil
            remoteAddress = nil
            serverSupportsStream = false
            serverSupportsPush = false
            serverSupportsLZ4 = false
            streamBuffer.onFrameConsumed = nil
            streamEpoch &+= 1
            streamBuffer.reset(epoch: streamEpoch)
        }

        let hasConfiguredTarget = !Self.savedDirectAddress.isEmpty || lastAddress != nil || parked || lost
        guard hasConfiguredTarget else { return (false, nil, "", nil, nil) }

        if let label = await reattachBest() {
            streamEpoch &+= 1
            streamBuffer.reset(epoch: streamEpoch)
            let cached = consumeResumedState()
            let resumed: Data?
            if let cached {
                resumed = cached
            } else {
                resumed = (try? await remote?.call(serverSupportsStream ? "resume" : "state", [:], payload: nil))?.data
            }
            return (true, label, remoteTransport, liveRTTMs ?? lastRTTMs, resumed)
        }
        return (false, nil, "", nil, nil)
    }

    private nonisolated static func fastGenericPing(_ link: EngineLink, timeoutSeconds: Double) async -> Int? {
        let t0 = Date().timeIntervalSinceReferenceDate
        return await withTaskGroup(of: Int?.self) { group in
            group.addTask {
                if let pong = try? await link.call("ping", ["v": 6], payload: nil), pong.ok {
                    return max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
                }
                return nil
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(max(0.2, timeoutSeconds) * 1_000_000_000))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }

    private(set) var lost = false
    private var lastAddress: String?

    private func reattachQuick() async -> String? {
        guard let address = lastAddress else { return nil }
        if let label = try? await connect(address, timeout: 2.0, reattach: true) { return label }
        let room = Self.activeRoomCode
        if address != room, let label = try? await connect(room, timeout: 2.8, reattach: true) { return label }
        return nil
    }

    /// 最优路径秒级重连：专属直连地址 → 局域网 UDP 自动发现 → 云端最新 LAN IP → 云端 WebSocket 推流。
    private func reattachBest() async -> String? {
        if let existing = remoteAddress, remote != nil { return existing }
        guard !reattaching else { return nil }
        reattaching = true
        defer { reattaching = false }

        let room = Self.activeRoomCode
        let pinned = Self.savedDirectAddress
        if !pinned.isEmpty, let label = try? await connect(pinned, timeout: 2.2, reattach: true) { return label }
        if let lanFound = await LANDiscovery.discover(roomCode: room, timeoutSeconds: 0.55),
           let label = try? await connect(lanFound, timeout: 1.4, reattach: true) { return label }
        if let status = await RelayLink.probeStatus(code: room), status.online {
            for lanAddr in status.lan {
                if let label = try? await connect(lanAddr, timeout: 1.3, reattach: true) { return label }
            }
            if let label = try? await connect(room, timeout: 4.0, reattach: true) { return label }
        }
        if let address = lastAddress, address != pinned, address != room,
           let label = try? await connect(address, timeout: 3.0, reattach: true) { return label }
        return nil
    }

    func reattach() async -> String? {
        if let existing = remoteAddress, remote != nil { return existing }
        if lost || parked || service.engine != nil || lastWorld != nil {
            return await reattachBest()
        }
        return nil
    }

    func fallbackLocal() {
        lost = false; parked = false
        serverSupportsStream = false; serverSupportsPush = false; serverSupportsLZ4 = false
        rttBox.reset(nil); lastRTTMs = nil
        streamBuffer.onFrameConsumed = nil
        streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
        remote?.cancel(); remote = nil; remoteAddress = nil; remoteTransport = ""
        if let lastWorld { _ = service.handle("open", [:], payload: lastWorld); service.engine?.enableAppRules() }
    }
    var isRemote: Bool { remote != nil }
    var isRemoteActiveOrParked: Bool { remote != nil || parked || lost }

    /// 实时测速：全双工直连走零锁 9 字节 `MUX_PING`，真实反映纯网络 RTT。
    func measureRTT() async -> Int? {
        guard let link = remote else { return nil }
        if let direct = link as? RemoteLink, direct.isMuxActive {
            if let ms = await direct.muxPingRTT() {
                lastRTTMs = ms
                return ms
            }
        }
        let t0 = Date().timeIntervalSinceReferenceDate
        guard let pong = try? await link.call("ping", ["v": 6], payload: nil), pong.ok else { return nil }
        let ms = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
        lastRTTMs = ms
        return ms
    }

    /// 配置服务器端推流（v11 启用差量疆域 + 滑动窗口背压 + 弱网 RTT > 300ms 自适应节流 + epoch 防乱序）。
    func configureRemoteStream(playing: Bool, days: Int, intervalMs: Int = 80, resetEpoch: Bool = true) async {
        if resetEpoch || !playing {
            streamEpoch &+= 1
            streamBuffer.reset(epoch: streamEpoch)
        }
        guard let link = remote, serverSupportsStream else { return }
        let useWindow = (link is RemoteLink) && serverSupportsPush
        let rtt = liveRTTMs ?? lastRTTMs ?? 0
        let adaptedIntervalMs: Int
        if rtt > 600 {
            adaptedIntervalMs = min(850, max(intervalMs, Int((Double(intervalMs) * 1.55).rounded())))
        } else if rtt > 300 {
            adaptedIntervalMs = min(650, max(intervalMs, Int((Double(intervalMs) * 1.30).rounded())))
        } else {
            adaptedIntervalMs = intervalMs
        }
        _ = await call("streamConfig", [
            "playing": playing,
            "days": max(1, min(32, days)),
            "intervalMs": max(35, min(900, adaptedIntervalMs)),
            "epoch": Int(streamEpoch),
            "push": serverSupportsPush && playing,
            "window": useWindow
        ])
    }

    /// 自动接入：专属云服务器地址 → 局域网 UDP 10ms 秒发现 → 云端中转 LAN 列表 → 云端 WebSocket 推流。
    func connectAuto() async -> (label: String, transport: String, rttMs: Int?)? {
        guard !cloudHandingOff else { return nil }
        cloudHandingOff = true
        defer { cloudHandingOff = false }
        if lost || parked {
            if let label = await reattachBest() { return (label, remoteTransport, liveRTTMs ?? lastRTTMs) }
            return nil
        }
        guard remote == nil, service.engine != nil else { return nil }
        let pinned = Self.savedDirectAddress
        if !pinned.isEmpty, let label = try? await connect(pinned, timeout: 2.2) {
            return (label, remoteTransport, liveRTTMs ?? lastRTTMs)
        }
        let room = Self.activeRoomCode
        if let lanFound = await LANDiscovery.discover(roomCode: room, timeoutSeconds: 0.65),
           let label = try? await connect(lanFound, timeout: 1.5) {
            return (label, remoteTransport, liveRTTMs ?? lastRTTMs)
        }
        guard let status = await RelayLink.probeStatus(code: room), status.online else { return nil }
        for address in status.lan {
            if let label = try? await connect(address, timeout: 1.3) { return (label, remoteTransport, liveRTTMs ?? lastRTTMs) }
        }
        if let label = try? await connect(room) { return (label, remoteTransport, liveRTTMs ?? lastRTTMs) }
        return nil
    }

    // MARK: - requests

    private var advances = AdvanceSession()

    func open(_ data: Data, world: Int) async throws -> (map: Data?, state: Data, revision: UInt64) {
        guard let revision = advances.replaceWorld(world: world) else { throw EngineError.message("世界已经切换，忽略旧的载入请求") }
        try Self.loadCatalogs()
        lastResumedState = nil
        baselineOwners.removeAll(keepingCapacity: true)
        streamBuffer.resetDay()
        if remote != nil { lastWorld = data }
        streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
        let r = await call("open", payload: data)
        guard advances.revision == revision else { throw EngineError.message("世界已经切换，忽略旧的载入结果") }
        guard r.ok else { throw EngineError.message(r.reason) }
        if remote == nil {
            currentWorldId = service.currentWorldId
            currentKnownDay = service.currentDay
        } else if let info = try? await remote?.call("worldInfo", [:], payload: nil), info.ok, let text = info.text {
            let parts = text.split(separator: "|", omittingEmptySubsequences: false)
            if parts.count >= 2 {
                currentWorldId = String(parts[0])
                currentKnownDay = Int(parts[1]) ?? 0
            }
        }
        return (r.map, r.data ?? Data(), revision)
    }

    private static let inputsLock = NSLock()
    private static var sharedGrid: (base: WorldMap, grid: TerrainGraph, document: TerrainDocument)?
    private static var creationInputs: CreationMap.Inputs?
    nonisolated static func seedSharedInputs(base: WorldMap, grid: TerrainGraph, document: TerrainDocument) {
        inputsLock.lock()
        if sharedGrid == nil { sharedGrid = (base, grid, document) }
        inputsLock.unlock()
    }
    static func loadCreationInputs() throws -> CreationMap.Inputs {
        inputsLock.lock()
        if let existing = creationInputs { inputsLock.unlock(); return existing }
        let cached = sharedGrid
        inputsLock.unlock()
        try loadCatalogs()
        guard let world = Bundle.main.url(forResource: "World", withExtension: nil),
              let resources = Bundle.main.url(forResource: "biome-resources", withExtension: "json", subdirectory: "Catalog") else { throw EngineError.message("安装包缺少建世界数据") }
        try OpeningGovernment.loadResources(Data(contentsOf: resources))
        let base = try cached?.base ?? WorldMap.load(directory: world)
        let grid = try cached?.grid ?? TerrainGraph(data: Data(contentsOf: world.appendingPathComponent("grid20k.bin")))
        let edges = try CreationMap.GridEdges(data: Data(contentsOf: world.appendingPathComponent("edges20k.bin")))
        let document = try cached?.document ?? TerrainDocument(data: Data(contentsOf: world.appendingPathComponent("doc20k.bin")))
        let x = CreationMap.Inputs(base: base, grid: grid, edges: edges, document: document)
        inputsLock.lock()
        creationInputs = x
        sharedGrid = nil
        inputsLock.unlock()
        return x
    }

    typealias Made = (map: Data?, state: Data, revision: UInt64, cityCount: Int)
    func create(_ options: NativeCreation.Options, world: Int, progress: @escaping @Sendable (String) -> Void) async throws -> Made {
        guard let revision = advances.replaceWorld(world: world) else { throw EngineError.message("世界已经切换，忽略旧的建世界请求") }
        let x = try Self.loadCreationInputs()
        let runId = "fms-" + UUID().uuidString.lowercased()
        let built = try autoreleasepool {
            try NativeCreation.generate(options, inputs: x, worldId: UUID().uuidString.lowercased(), runId: runId, progress: progress)
        }
        guard advances.revision == revision else { throw EngineError.message("世界已经切换，忽略旧的建世界结果") }
        lastResumedState = nil
        baselineOwners.removeAll(keepingCapacity: true)
        streamBuffer.resetDay()
        streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
        let r: EngineService.Reply
        if remote != nil {
            let data = autoreleasepool { Data(built.json.utf8) }
            lastWorld = data
            r = await call("open", payload: data)
        } else {
            r = try autoreleasepool { service.adopt(try NativeEngine(created: built)) }
        }
        guard advances.revision == revision else { throw EngineError.message("世界已经切换，忽略旧的建世界结果") }
        guard r.ok else { throw EngineError.message(r.reason) }
        currentWorldId = runId
        currentKnownDay = 0
        return (r.map, r.data ?? Data(), revision, built.cityCount)
    }

    func reclimate(precipitation: Double, temperatureOffset: Double, north: Double, south: Double) async throws -> Data {
        guard remote == nil, let e = service.engine else { throw EngineError.message("世界尚未载入。") }
        let json = try e.reclimate(try Self.loadCreationInputs(), precipitation: precipitation, temperatureOffset: temperatureOffset, north: north, south: south)
        struct Map: Decodable { let bin: String }
        guard let bin = Data(base64Encoded: try JSONDecoder().decode(Map.self, from: json).bin) else { throw EngineError.message("地图数据损坏") }
        return bin
    }
    func close(world: Int) async {
        guard advances.replaceWorld(world: world) != nil else { return }
        lastResumedState = nil
        currentWorldId = ""
        currentKnownDay = 0
        streamBuffer.resetDay()
        streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
        if remote != nil, serverSupportsStream {
            _ = try? await remote?.call("streamConfig", ["playing": false, "days": 3, "push": false], payload: nil)
        }
        _ = await call("close")
    }

    typealias Step = Result<GameState, Error>
    func step(days: Int, revision: UInt64, producer: UInt64) async -> Step? {
        guard advances.admit(revision: revision, producer: producer) else { return nil }
        if remote == nil && !lost && !parked {
            guard let s = service.stepState(days: days) else { return .failure(EngineError.message("推演没有返回有效世界状态")) }
            currentKnownDay = max(currentKnownDay, s.day)
            return .success(s)
        }
        let op = serverSupportsStream ? "pullLatest" : "step"
        let data = await call(op, ["days": days, "slim": serverSupportsLZ4]).data ?? Data()
        guard !data.isEmpty else { return .failure(EngineError.message("推演没有返回有效世界状态")) }
        let res: Result<GameState, Error> = Result {
            var decoded = try JSONDecoder().decode(GameState.self, from: data)
            if !decoded.owners.isEmpty {
                baselineOwners = decoded.owners
                streamBuffer.seedBaselineOwners(decoded.owners)
            } else if let delta = decoded.ownersDelta, !baselineOwners.isEmpty {
                var rebuilt = baselineOwners
                var i = 0
                while i + 1 < delta.count {
                    let idx = delta[i]
                    let owner = delta[i + 1]
                    if idx >= 0 && idx < rebuilt.count { rebuilt[idx] = owner }
                    i += 2
                }
                decoded.owners = rebuilt
                baselineOwners = rebuilt
                streamBuffer.seedBaselineOwners(rebuilt)
            } else {
                streamBuffer.reconstructOwnersIfNeeded(&decoded)
                if !decoded.owners.isEmpty { baselineOwners = decoded.owners }
            }
            return decoded
        }
        if case .success(let decoded) = res { currentKnownDay = max(currentKnownDay, decoded.day) }
        return res
    }
    func state() async -> Data? { await call("state").data }
    func localDayForTour() -> Int? {
        guard ShotTour.on, remote == nil, let engine = service.engine else { return nil }
        return engine.run.world.day.asInt
    }
    private func command(_ name: String, _ args: [String: Any]) async -> (ok: Bool, reason: String, state: Data?) {
        let r = await call(name, args); return (r.ok, r.reason, r.data)
    }
    private static func opt<T>(_ v: T?) -> Any { v.map { $0 as Any } ?? NSNull() }
    func armyAction(_ action: String, armyId: String, text: String = "", flag: Bool = false) async -> (ok: Bool, reason: String, state: Data?) {
        await command(action, ["armyId": armyId, "text": text, "manual": flag])
    }
    func order(armyId: String, province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("order", ["armyId": armyId, "province": province]) }
    func politics(declare: Bool, _ a: Int, _ b: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("politics", ["declare": declare, "a": a, "b": b]) }
    func fleetOrder(id: String, province: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("fleetOrder", ["id": id, "province": Self.opt(province)]) }
    func province(_ index: Int) async -> Data? { await call("province", ["index": index]).data }
    func nationInfo(_ index: Int) async -> Data? { await call("nationInfo", ["index": index]).data }
    func nationProvinces(_ index: Int) async -> Data? { await call("nationProvinces", ["n": index]).data }
    func throneCandidates(_ index: Int) async -> Data? { await call("throneCandidates", ["n": index]).data }
    func enthronePerson(_ index: Int, person: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("enthronePerson", ["n": index, "person": person]) }
    func diplomacyInfo(_ index: Int) async -> Data? { await call("diplomacyInfo", ["index": index]).data }
    func setTuning(_ data: Data) async { _ = await call("tuning", [:], payload: data) }
    func tradeInfo(_ index: Int) async -> Data? { await call("tradeInfo", ["index": index]).data }
    func armyRecord(_ id: String) async -> Data? { await call("armyRecord", ["armyId": id]).data }
    func financeInfo(_ index: Int) async -> Data? { await call("financeInfo", ["index": index]).data }
    func regionInfo(_ province: Int) async -> Data? { await call("regionInfo", ["province": province]).data }
    func renameRegion(_ province: Int, _ name: String) async -> (ok: Bool, reason: String, state: Data?) { await command("renameRegion", ["province": province, "name": name]) }
    func setRegionCenter(_ province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setRegionCenter", ["province": province]) }
    func generals() async -> Data? { await call("generals").data }
    func chronicle(_ category: String) async -> Data? { await call("chronicle", ["category": category]).data }
    func setCalendar(era: String, year: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("setCalendar", ["era": era, "year": Self.opt(year)]) }
    func setCityCulture(_ province: Int, _ culture: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setCityCulture", ["province": province, "culture": culture]) }
    func changeDebt(_ n: Int, borrow: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("debt", ["n": n, "borrow": borrow]) }
    func changeCorruption(_ n: Int, lower: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("corruption", ["n": n, "lower": lower]) }
    func inciteRebellion(_ n: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("incite", ["n": n]) }
    func setHolyProvince(_ province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setHoly", ["province": province]) }
    func foundNation(_ province: Int, war: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("foundNation", ["province": province, "war": war ? 1 : 0]) }
    func familyAction(_ id: Int, action: String) async -> (ok: Bool, reason: String, state: Data?) { await command("familyAction", ["id": id, "action": action]) }
    func setTax(_ n: Int, _ value: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setTax", ["n": n, "value": value]) }
    func familyTree(_ family: String) async -> Data? { await call("familyTree", ["family": family]).data }
    func setLivelihood(_ n: Int, _ value: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setLivelihood", ["n": n, "value": value]) }
    func setSpecialty(_ province: Int, _ good: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("setSpecialty", ["province": province, "good": Self.opt(good)]) }
    func view(_ mode: String) async -> Data? { await call("view", ["mode": mode]).data }
    func worldSettings() async -> Data? { await call("worldSettings").data }
    func worldRules() async -> Data? { await call("worldRules").data }
    func setWorldRule(_ key: String, value: Double?, revision: UInt64) async -> (ok: Bool, reason: String) {
        guard advances.revision == revision else { return (false, "世界已经切换。") }
        let result = await call("setWorldRule", ["key": key, "value": Self.opt(value), "withoutState": true])
        return (result.ok, result.reason)
    }
    func editFleet(_ id: String, ships: Int?, name: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("editFleet", ["id": id, "ships": Self.opt(ships), "name": Self.opt(name)]) }
    func setWorld(_ key: String, _ value: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setWorld", ["key": key, "value": value]) }
    func triggerCivilWar(_ n: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("triggerCivilWar", ["n": n]) }
    func rts(_ armyIds: [String], nation: Int, province: Int, defend: Bool) async -> (ok: Bool, reason: String, state: Data?) {
        await command("rts", ["armyIds": armyIds, "nation": nation, "province": province, "defend": defend])
    }
    func releaseToAI(_ armyIds: [String]) async -> (ok: Bool, reason: String, state: Data?) { await command("releaseToAI", ["armyIds": armyIds]) }
    func nationHistory(_ n: Int) async -> Data? { await call("nationHistory", ["n": n]).data }
    func nationReigns(_ n: Int) async -> Data? { await call("nationReigns", ["n": n]).data }
    func nationBreakdown(_ n: Int) async -> Data? { await call("nationBreakdown", ["n": n]).data }
    func grandInfo(_ n: Int) async -> Data? { await call("grandInfo", ["n": n]).data }
    func provinceBreakdown(_ province: Int) async -> Data? { await call("provinceBreakdown", ["province": province]).data }
    func warCompare(attacker: Int, defender: Int) async -> Data? { await call("warCompare", ["a": attacker, "b": defender]).data }
    func replayTimeline() async -> Data? { await call("replayTimeline").data }
    func territory(_ provinces: [Int], to nation: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("territory", ["provinces": provinces, "nation": nation]) }
    func retreat(armyId: String, province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("retreat", ["armyId": armyId, "province": province]) }
    func statistics(_ category: String) async -> Data? { await call("statistics", ["category": category]).data }
    func alliance(_ a: Int, with b: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("alliance", ["a": a, "b": b]) }
    func releaseVassal(_ n: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("releaseVassal", ["n": n]) }
    func makeVassal(_ vassal: Int, of overlord: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("makeVassal", ["vassal": vassal, "overlord": overlord]) }
    func annex(_ target: Int, by annexer: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("annex", ["target": target, "annexer": annexer]) }
    func setAutoDiplomacy(_ n: Int, _ enabled: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("setAutoDiplomacy", ["n": n, "enabled": enabled]) }
    func route(armyId: String) async -> [[Double]] { await call("route", ["armyId": armyId]).points ?? [] }
    func save() async -> Data? {
        let d = await call("save").data
        if remote != nil, let d { lastWorld = d }
        return d
    }
    func enableAppRules() async { _ = await call("enableAppRules") }
    func regime(_ n: Int) async -> (history: [String], trait: String) { let r = await call("regime", ["n": n]); return (r.strings ?? [], r.text ?? "") }
    func editPerson(_ id: Int, skills: [Double], traits: [String]) async -> (ok: Bool, reason: String, state: Data?) { await command("editPerson", ["id": id, "skills": skills, "traits": traits]) }
    func editNation(_ n: Int, gold: Double?, destiny: Double?, polity: String?, culture: String? = nil, religion: String? = nil) async -> (ok: Bool, reason: String, state: Data?) {
        await command("editNation", ["n": n, "gold": Self.opt(gold), "destiny": Self.opt(destiny), "polity": Self.opt(polity), "culture": Self.opt(culture), "religion": Self.opt(religion)])
    }
    func setBonus(_ n: Int, key: String, value: Double?) async -> (ok: Bool, reason: String, state: Data?) { await command("setBonus", ["n": n, "key": key, "value": Self.opt(value)]) }
    func scaleTotal(_ n: Int, key: String, value: Double) async -> (ok: Bool, reason: String, state: Data?) { await command("scaleTotal", ["n": n, "key": key, "value": value]) }
    func editParty(_ n: Int, party: Int, name: String?, seats: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("editParty", ["n": n, "party": party, "name": Self.opt(name), "seats": Self.opt(seats)]) }
    func editIdentity(_ n: Int, name: String?, color: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("editIdentity", ["n": n, "name": Self.opt(name), "color": Self.opt(color)]) }
    func setCapital(_ n: Int, province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setCapital", ["n": n, "province": province]) }
    func editProvince(_ index: Int, population: Double?, fortress: Bool?) async -> (ok: Bool, reason: String, state: Data?) { await command("editProvince", ["index": index, "population": Self.opt(population), "fortress": Self.opt(fortress)]) }
    func setTemper(_ n: Int, _ value: Double?) async -> (ok: Bool, reason: String, state: Data?) { await command("setTemper", ["n": n, "value": Self.opt(value)]) }
    func renamePerson(_ id: Int, first: String?, last: String?, age: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("renamePerson", ["id": id, "first": Self.opt(first), "last": Self.opt(last), "age": Self.opt(age)]) }
    func setStyle(_ n: Int, style: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setStyle", ["n": n, "style": style]) }
    func treaty(_ a: Int, _ b: Int, years: Int, kind: String) async -> (ok: Bool, reason: String, state: Data?) { await command("treaty", ["a": a, "b": b, "years": years, "kind": kind]) }
    func gift(_ from: Int, to: Int, gold: Double) async -> (ok: Bool, reason: String, state: Data?) { await command("gift", ["from": from, "to": to, "gold": gold]) }
    func posts(_ n: Int) async -> Data? { await call("posts", ["n": n]).data }
    func postCandidates(_ n: Int, post: String) async -> Data? { await call("postCandidates", ["n": n, "post": post]).data }
    func appointPost(_ n: Int, post: String, person: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("appointPost", ["n": n, "post": post, "person": person]) }
    func officeCandidates(_ n: Int, office: String) async -> Data? { await call("officeCandidates", ["n": n, "office": office]).data }
    func editCourt(_ n: Int, key: String, value: Double) async -> (ok: Bool, reason: String, state: Data?) { await command("editCourt", ["n": n, "key": key, "value": value]) }
    func appointOffice(_ n: Int, office: String, person: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("appointOffice", ["n": n, "office": office, "person": person]) }
    func setCourtManual(_ n: Int, manual: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("setCourtManual", ["n": n, "manual": manual]) }
    func setStateTrait(_ n: Int, trait: String?, on: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("setStateTrait", ["n": n, "trait": trait.map { $0 as Any } ?? NSNull(), "on": on ? 1 : 0]) }
    func setOfficeTitle(_ n: Int, office: String, title: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("setOfficeTitle", ["n": n, "office": office, "title": title.map { $0 as Any } ?? NSNull()]) }
    func unitProfile(_ n: Int) async -> Data? { await call("unitProfile", ["n": n]).data }
    func setUnitProfile(_ n: Int, unit: String, name: String?, power: Int?, speed: Int?, weight: Int?) async -> (ok: Bool, reason: String, state: Data?) { await command("setUnitProfile", ["n": n, "unit": unit, "name": name.map { $0 as Any } ?? NSNull(), "power": power.map { $0 as Any } ?? NSNull(), "speed": speed.map { $0 as Any } ?? NSNull(), "weight": weight.map { $0 as Any } ?? NSNull()]) }
    func leaveAlliance(_ n: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("leaveAlliance", ["n": n]) }
    func catalogEdits() async -> Data? { await call("catalogEdits", [:]).data }
    func setCultureEdit(_ culture: String, name: String?, text: String?, male: [String], female: [String]) async -> (ok: Bool, reason: String, state: Data?) { await command("setCultureEdit", ["culture": culture, "name": name.map { $0 as Any } ?? NSNull(), "text": text.map { $0 as Any } ?? NSNull(), "male": male, "female": female]) }
    func setFaithEdit(_ faith: String, name: String?, text: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("setFaithEdit", ["faith": faith, "name": name.map { $0 as Any } ?? NSNull(), "text": text.map { $0 as Any } ?? NSNull()]) }
    func mapLabels() async -> Data? { await call("mapLabels", [:]).data }
    func setMapLabel(id: Int, text: String, x: Int, y: Int, size: Int, color: String, angle: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setMapLabel", ["id": id, "text": text, "x": x, "y": y, "size": size, "color": color, "angle": angle]) }
    func removeMapLabel(id: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("removeMapLabel", ["id": id]) }
    func edit(_ name: String, _ args: [String: Any]) async -> (ok: Bool, reason: String, state: Data?) { await command(name, args) }
    func query(_ name: String, _ args: [String: Any]) async -> Data? { await call(name, args).data }
    func grantRegion(_ province: Int, size: Int, to nation: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("grantRegion", ["province": province, "size": size, "n": nation]) }
    func greatRebellion(_ province: Int, size: Int, kind: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("greatRebellion", ["province": province, "size": size, "kind": kind.map { $0 as Any } ?? NSNull()]) }
    func restoreNation(_ province: Int, nation: Int, size: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("restoreNation", ["province": province, "n": nation, "size": size]) }
    func provinceDisaster(_ province: Int, kind: String?) async -> (ok: Bool, reason: String, state: Data?) { await command("provinceDisaster", ["province": province, "kind": kind.map { $0 as Any } ?? NSNull()]) }
    func clearArmies(_ province: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("clearArmies", ["province": province]) }
    func setProvinceFaith(_ province: Int, religion: String) async -> (ok: Bool, reason: String, state: Data?) { await command("setProvinceFaith", ["province": province, "religion": religion]) }
    func setProvinceGrain(_ province: Int, grain: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("setProvinceGrain", ["province": province, "grain": grain]) }
    func setReform(_ n: Int, reform: String, on: Bool) async -> (ok: Bool, reason: String, state: Data?) { await command("setReform", ["n": n, "reform": reform, "on": on ? 1 : 0]) }
    func addArmy(_ n: Int, province: Int, count: Int = 1) async -> (ok: Bool, reason: String, state: Data?) { await command("addArmy", ["n": n, "province": province, "count": count]) }
    func editArmy(_ armyId: String, troops: Int?, unit: String?, morale: Double?) async -> (ok: Bool, reason: String, state: Data?) {
        await command("editArmy", ["armyId": armyId, "troops": Self.opt(troops), "unit": Self.opt(unit), "morale": Self.opt(morale)])
    }
}

/// A channel to LieguojiServer: direct full-duplex TCP (LAN / Cloud VPS), persistent WebSocket Push relay, or HTTP/2 fallback.
protocol EngineLink: AnyObject, Sendable {
    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply
    func cancel()
}

private func decodeWireReply(_ data: Data) throws -> EngineService.Reply {
    guard data.count >= 12 else { throw EngineError.message("服务器返回的数据不完整") }
    let h = EngineWire.readU32(data, at: 0)
    guard h >= 0, data.count >= 12 + h else { throw EngineError.message("服务器帧头损坏") }
    let header = data.subdata(in: 4..<4 + h)
    let d = EngineWire.readU32(data, at: 4 + h)
    guard d >= 0, data.count >= 12 + h + d else { throw EngineError.message("服务器载荷不完整") }
    let body = data.subdata(in: 8 + h..<8 + h + d)
    let m = EngineWire.readU32(data, at: 8 + h + d)
    guard m >= 0, data.count >= 12 + h + d + m else { throw EngineError.message("服务器地图数据不完整") }
    let map = data.subdata(in: 12 + h + d..<12 + h + d + m)
    return EngineService.Reply.decode(header: header, data: body, map: map)
}

/// 持久双向 WebSocket 中转通道：支持服务器单向 `MSG_PUSH` (type=3) 推流直达与 LZ4 压缩，12 秒主动心跳保活。
final class RelayWSLink: EngineLink, @unchecked Sendable {
    private let session: URLSession
    private let task: URLSessionWebSocketTask
    private let lock = NSLock()
    private var nextId: UInt32 = 1
    private var pending: [UInt32: CheckedContinuation<Data, Error>] = [:]
    private var closed = false
    private var userCancelled = false
    private var heartbeatTask: Task<Void, Never>?
    var compressUploads = false
    var onPushFrame: (@Sendable (UInt32, Data) -> Void)?
    var onUnexpectedClose: (@Sendable () -> Void)?

    private init(session: URLSession, task: URLSessionWebSocketTask) {
        self.session = session
        self.task = task
        receiveLoop()
        startHeartbeat()
    }

    deinit {
        cancel()
    }

    static func connect(code: String, base: String) async throws -> RelayWSLink {
        let wsBase = base.replacingOccurrences(of: "https://", with: "wss://").replacingOccurrences(of: "http://", with: "ws://")
        guard let url = URL(string: wsBase + "/room/\(code)/ws?role=phone") else {
            throw EngineError.message("无效的中转 WebSocket 地址")
        }
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 30
        cfg.timeoutIntervalForResource = 600
        cfg.waitsForConnectivity = false
        let session = URLSession(configuration: cfg)
        let wsTask = session.webSocketTask(with: url)
        wsTask.maximumMessageSize = 64 * 1024 * 1024
        wsTask.resume()

        let link = RelayWSLink(session: session, task: wsTask)
        do {
            try await link.verifyHandshake(timeoutSeconds: 3.5)
            return link
        } catch {
            link.cancel()
            throw error
        }
    }

    private func verifyHandshake(timeoutSeconds: Double) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
                    self.task.sendPing { err in
                        if let err { c.resume(throwing: err) } else { c.resume() }
                    }
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeoutSeconds * 1_000_000_000))
                throw EngineError.message("WebSocket 握手超时")
            }
            _ = try await group.next()
            group.cancelAll()
        }
    }

    private func startHeartbeat() {
        heartbeatTask = Task.detached(priority: .utility) { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 12_000_000_000)
                guard let self else { return }
                let isClosed: Bool = { self.lock.lock(); defer { self.lock.unlock() }; return self.closed }()
                if isClosed { return }
                var ping = Data([4])
                var now = UInt64(Date().timeIntervalSince1970 * 1000).bigEndian
                withUnsafeBytes(of: &now) { ping.append(contentsOf: $0) }
                try? await self.task.send(.data(ping))
            }
        }
    }

    private func failAll(_ err: Error) {
        lock.lock()
        if closed { lock.unlock(); return }
        closed = true
        let map = pending
        pending.removeAll()
        let shouldNotify = !userCancelled
        let closeCb = shouldNotify ? onUnexpectedClose : nil
        onUnexpectedClose = nil
        lock.unlock()
        heartbeatTask?.cancel()
        for (_, cont) in map { cont.resume(throwing: err) }
        closeCb?()
    }

    private func receiveLoop() {
        task.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let err):
                self.failAll(err)
            case .success(let message):
                if case .data(let raw) = message, raw.count >= 5 {
                    let type = raw[raw.startIndex]
                    if type == 2 { // MSG_REPLY
                        let id = UInt32(EngineWire.readU32(raw, at: 1))
                        let payload = raw.subdata(in: (raw.startIndex + 5)..<raw.endIndex)
                        self.lock.lock()
                        let cont = self.pending.removeValue(forKey: id)
                        self.lock.unlock()
                        cont?.resume(returning: payload)
                    } else if type == 3 { // MSG_PUSH (服务器单向主动推流帧)
                        let tag = UInt32(EngineWire.readU32(raw, at: 1))
                        let payload = raw.subdata(in: (raw.startIndex + 5)..<raw.endIndex)
                        self.onPushFrame?(tag, payload)
                    }
                }
                self.receiveLoop()
            }
        }
    }

    func fastProbeRTT(timeoutSeconds: Double = 1.2) async -> Int? {
        let isClosed: Bool = { lock.lock(); defer { lock.unlock() }; return closed }()
        guard !isClosed else { return nil }
        let t0 = Date().timeIntervalSinceReferenceDate
        return await withTaskGroup(of: Int?.self) { group in
            group.addTask { [weak self] in
                guard let self else { return nil }
                if let pong = try? await self.call("ping", ["v": 6], payload: nil), pong.ok {
                    return max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
                }
                return nil
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(max(0.2, timeoutSeconds) * 1_000_000_000))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }

    func cancel() {
        lock.lock()
        userCancelled = true
        onUnexpectedClose = nil
        lock.unlock()
        failAll(EngineError.message("WebSocket 连接已关闭"))
        task.cancel(with: .normalClosure, reason: nil)
        session.invalidateAndCancel()
    }

    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply {
        let reqId: UInt32 = {
            lock.lock(); defer { lock.unlock() }
            let v = nextId; nextId &+= 1; if nextId == 0 { nextId = 1 }
            return v
        }()
        var frame = Data([1]) // MSG_REQ
        frame.append(EngineWire.u32(Int(reqId)))
        frame.append(EngineWire.request(name, args, payload: payload, compressPayload: compressUploads))

        let replyData: Data = try await withCheckedThrowingContinuation { cont in
            lock.lock()
            if closed {
                lock.unlock()
                cont.resume(throwing: EngineError.message("与云端通道的连接已断开"))
                return
            }
            pending[reqId] = cont
            lock.unlock()

            task.send(.data(frame)) { [weak self] err in
                if let err, let self {
                    self.lock.lock()
                    let c = self.pending.removeValue(forKey: reqId)
                    self.lock.unlock()
                    c?.resume(throwing: err)
                }
            }
        }
        return try decodeWireReply(replyData)
    }
}

/// HTTP/2 + gzip fallback relay channel.
final class RelayLink: EngineLink, @unchecked Sendable {
    static let bases = [
        "https://lieguoji-edge.pages.dev/api/relay",
        "https://claude-native-map.lieguoji-web.pages.dev/api/relay",
        "https://lieguoji-web.pages.dev/api/relay"
    ]
    /// 共享只读探测专用 URLSession：彻底根除每 10 秒 `RelayLink(code:).status()` 新建且永不释放 URLSession 导致的内存与线程泄漏！
    private static let probeSession: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 10
        c.timeoutIntervalForResource = 20
        c.waitsForConnectivity = false
        c.httpMaximumConnectionsPerHost = 4
        return URLSession(configuration: c)
    }()

    static func probeStatus(code: String) async -> (online: Bool, lan: [String], savesCount: Int, activeBase: String)? {
        for b in Self.bases {
            guard let url = URL(string: b + "/room/\(code)/status") else { continue }
            var r = URLRequest(url: url); r.timeoutInterval = 8
            guard let (data, response) = try? await Self.probeSession.data(for: r), (response as? HTTPURLResponse)?.statusCode == 200,
                  let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            return (o["online"] as? Bool == true, o["lan"] as? [String] ?? [], o["savesCount"] as? Int ?? 0, b)
        }
        return nil
    }

    let code: String
    private let lock = NSLock()
    private(set) var activeBase = RelayLink.bases[0]
    private var _session: URLSession?
    private var cancelled = false

    init(code: String) { self.code = code }

    deinit {
        cancel()
    }

    private func activeSession() throws -> URLSession {
        lock.lock()
        defer { lock.unlock() }
        if cancelled { throw EngineError.message("中转连接已关闭") }
        if let existing = _session { return existing }
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 65; c.timeoutIntervalForResource = 180; c.waitsForConnectivity = false
        c.httpMaximumConnectionsPerHost = 4
        let created = URLSession(configuration: c)
        _session = created
        return created
    }

    func start() async throws {
        var reached = false
        for b in Self.bases {
            guard let url = URL(string: b + "/room/\(code)/status") else { continue }
            var r = URLRequest(url: url); r.timeoutInterval = 10
            guard let (data, response) = try? await Self.probeSession.data(for: r), (response as? HTTPURLResponse)?.statusCode == 200,
                  let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            reached = true
            lock.lock(); activeBase = b; lock.unlock()
            if o["online"] as? Bool == true { return }
        }
        throw EngineError.message(reached ? "电脑不在线：请在电脑上运行「列国纪远程计算」，并核对配对码。" : "连不上中转服务器，请检查网络。")
    }

    func cancel() {
        lock.lock()
        cancelled = true
        let s = _session
        _session = nil
        lock.unlock()
        s?.invalidateAndCancel()
    }

    func status() async -> (online: Bool, lan: [String], savesCount: Int)? {
        guard let res = await Self.probeStatus(code: code) else { return nil }
        lock.lock(); activeBase = res.activeBase; lock.unlock()
        return (res.online, res.lan, res.savesCount)
    }

    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply {
        let base: String = { lock.lock(); defer { lock.unlock() }; return activeBase }()
        guard let url = URL(string: base + "/room/\(code)/call") else {
            throw EngineError.message("无效的中转服务器地址")
        }
        let session = try activeSession()
        var r = URLRequest(url: url)
        r.httpMethod = "POST"; r.setValue("application/octet-stream", forHTTPHeaderField: "content-type")
        let (data, response) = try await session.upload(for: r, from: EngineWire.request(name, args, payload: payload))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw EngineError.message(String(data: data, encoding: .utf8).flatMap { $0.isEmpty ? nil : $0 } ?? "中转出错（\(status)）") }
        return try decodeWireReply(data)
    }
}

/// 全双工多路复用直连 TCP 通道（局域网 2–6ms / 国内专属云服务器 15–35ms）：
/// 握手后自动升级 `enableMux`，同时接收服务器 `MUX_PUSH` 主动压缩推流帧与并发指令回包；
/// 内置请求 12s / 心跳 2.5s（连续 3 次失答判定断链，抗单次抖动、~7.5s 精准识别真断联）。
final class RemoteLink: EngineLink, @unchecked Sendable {
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "lieguoji.remote")
    private let lock = NSLock()
    private var mux = false
    private var closed = false
    private var userCancelled = false
    private var nextId: UInt32 = 1
    private var pending: [UInt32: (cont: CheckedContinuation<Data, Error>, watchdog: DispatchWorkItem)] = [:]
    private var heartbeatTask: Task<Void, Never>?
    var onPushFrame: (@Sendable (UInt32, Data) -> Void)?
    var onRTTMeasured: (@Sendable (Int) -> Void)?
    var onUnexpectedClose: (@Sendable () -> Void)?

    deinit {
        cancel()
    }

    var isMuxActive: Bool {
        lock.lock(); defer { lock.unlock() }
        return mux && !closed
    }

    var isClosed: Bool {
        lock.lock(); defer { lock.unlock() }
        return closed
    }

    /// 非阻塞回传 9 字节 `MUX_ACK` 滑动窗口确认帧，告诉服务器已消费一帧，准许推下一帧。
    func sendMuxAck(tag: UInt32) {
        guard isMuxActive else { return }
        let frame = EngineWire.muxFrame(type: EngineWire.muxAck, id: tag, body: Data())
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }

    init(host: String, port: UInt16) {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        tcp.enableKeepalive = true
        tcp.keepaliveIdle = 15
        tcp.keepaliveInterval = 5
        tcp.keepaliveCount = 4
        tcp.connectionTimeout = 6
        connection = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port) ?? 8765, using: NWParameters(tls: nil, tcp: tcp))
    }

    func start(timeout: Double = 5) async throws {
        let gate = Gate()
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            @Sendable func finish(_ r: Result<Void, Error>) { if gate.open() { c.resume(with: r) } }
            connection.stateUpdateHandler = { [weak self] state in
                switch state {
                case .ready:
                    finish(.success(()))
                    self?.connection.stateUpdateHandler = { [weak self] laterState in
                        if case .failed(let err) = laterState {
                            self?.failAll(err)
                        }
                    }
                case .failed(let e): finish(.failure(e))
                case .waiting(let e): finish(.failure(EngineError.message("连不上服务器（\(e.localizedDescription)）。请确认服务器已运行且端口开放。")))
                default: break
                }
            }
            connection.start(queue: queue)
            queue.asyncAfter(deadline: .now() + timeout) { finish(.failure(EngineError.message("连接超时：请确认服务器已运行且地址正确。"))) }
        }
    }

    /// 协商升级为 v10 非阻塞全双工多路复用主动推流模式。
    func upgradeToMux() async throws -> Bool {
        let r = try await legacyCall("enableMux", [:], payload: nil)
        guard r.ok else { return false }
        lock.lock(); mux = true; lock.unlock()
        startMuxReader()
        startMuxHeartbeat()
        return true
    }

    func muxPingRTT(timeoutSeconds: Double = 3.5) async -> Int? {
        guard isMuxActive else { return nil }
        let t0 = Date().timeIntervalSinceReferenceDate
        let reqId = allocId()
        let frame = EngineWire.muxFrame(type: EngineWire.muxPing, id: reqId, body: Data())
        do {
            _ = try await sendMuxAndWait(id: reqId, frame: frame, timeoutSeconds: timeoutSeconds)
            return max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
        } catch {
            return nil
        }
    }

    /// 极速链路探活（严格 `timeoutSeconds` 硬截止，绝不等待 12s 默认 RPC 超时）：切回前台瞬间判别 iOS 僵尸套接字。
    func fastProbeRTT(timeoutSeconds: Double = 1.2) async -> Int? {
        if isMuxActive {
            return await muxPingRTT(timeoutSeconds: timeoutSeconds)
        }
        guard !isClosed else { return nil }
        let t0 = Date().timeIntervalSinceReferenceDate
        return await withTaskGroup(of: Int?.self) { group in
            group.addTask { [weak self] in
                guard let self else { return nil }
                if let pong = try? await self.call("ping", ["v": 6], payload: nil), pong.ok {
                    return max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
                }
                return nil
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(max(0.2, timeoutSeconds) * 1_000_000_000))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }

    private func allocId() -> UInt32 {
        lock.lock(); defer { lock.unlock() }
        let v = nextId; nextId &+= 1; if nextId == 0 { nextId = 1 }
        return v
    }

    private func failAll(_ err: Error) {
        lock.lock()
        if closed { lock.unlock(); return }
        closed = true
        let map = pending
        pending.removeAll()
        let shouldNotify = !userCancelled
        let closeCb = shouldNotify ? onUnexpectedClose : nil
        onUnexpectedClose = nil
        lock.unlock()
        heartbeatTask?.cancel()
        for (_, entry) in map {
            entry.watchdog.cancel()
            entry.cont.resume(throwing: err)
        }
        closeCb?()
    }

    private func startMuxHeartbeat() {
        heartbeatTask = Task.detached(priority: .utility) { [weak self] in
            var missedPings = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_800_000_000)
                guard let self, self.isMuxActive else { return }
                if let ms = await self.muxPingRTT(timeoutSeconds: 3.5) {
                    missedPings = 0
                    self.onRTTMeasured?(ms)
                } else {
                    missedPings += 1
                    // 容忍蜂窝弱网 1–3 秒瞬时丢包，连续 4 次失答才判定真实断链
                    if missedPings >= 4 {
                        self.failAll(EngineError.message("心跳超时，直连链路已断开"))
                        self.connection.cancel()
                        return
                    }
                }
            }
        }
    }

    private func startMuxReader() {
        Task.detached(priority: .userInitiated) { [weak self] in
            guard let self else { return }
            do {
                while self.isMuxActive {
                    let prefix = try await self.receive(9)
                    let type = prefix[prefix.startIndex]
                    let frameId = UInt32(EngineWire.readU32(prefix, at: 1))
                    let bodyLen = EngineWire.readU32(prefix, at: 5)
                    guard bodyLen >= 0, bodyLen < 256 << 20 else {
                        throw EngineError.message("服务器帧长异常")
                    }
                    let body = try await self.receive(bodyLen)
                    if type == EngineWire.muxPush {
                        self.onPushFrame?(frameId, body)
                    } else if type == EngineWire.muxReply || type == EngineWire.muxPong {
                        self.lock.lock()
                        let entry = self.pending.removeValue(forKey: frameId)
                        self.lock.unlock()
                        entry?.watchdog.cancel()
                        entry?.cont.resume(returning: body)
                    }
                }
            } catch {
                self.failAll(error)
            }
        }
    }

    private final class Gate: @unchecked Sendable {
        private var done = false; private let lock = NSLock()
        func open() -> Bool { lock.lock(); defer { lock.unlock() }; if done { return false }; done = true; return true }
    }

    func cancel() {
        lock.lock()
        userCancelled = true
        onUnexpectedClose = nil
        lock.unlock()
        failAll(EngineError.message("直连连接已关闭"))
        connection.stateUpdateHandler = nil
        connection.cancel()
    }

    private func send(_ data: Data) async throws {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { e in if let e { c.resume(throwing: e) } else { c.resume() } })
        }
    }

    private func receive(_ count: Int) async throws -> Data {
        if count == 0 { return Data() }
        var out = Data()
        out.reserveCapacity(count)
        while out.count < count {
            let want = count - out.count
            let chunk: Data = try await withCheckedThrowingContinuation { c in
                connection.receive(minimumIncompleteLength: 1, maximumLength: want) { data, _, complete, e in
                    if let e { c.resume(throwing: e) }
                    else if let data, !data.isEmpty { c.resume(returning: data) }
                    else if complete { c.resume(throwing: EngineError.message("服务器断开了连接")) }
                    else { c.resume(returning: Data()) }
                }
            }
            out.append(chunk)
        }
        return out
    }

    private func sendMuxAndWait(id: UInt32, frame: Data, timeoutSeconds: Double = 12.0) async throws -> Data {
        try await withCheckedThrowingContinuation { cont in
            let watchdog = DispatchWorkItem { [weak self] in
                guard let self else { return }
                self.lock.lock()
                let entry = self.pending.removeValue(forKey: id)
                self.lock.unlock()
                entry?.cont.resume(throwing: EngineError.message("服务器响应超时，正在重连"))
            }

            lock.lock()
            if closed {
                lock.unlock()
                cont.resume(throwing: EngineError.message("直连通道已断开"))
                return
            }
            pending[id] = (cont, watchdog)
            lock.unlock()

            queue.asyncAfter(deadline: .now() + timeoutSeconds, execute: watchdog)

            connection.send(content: frame, completion: .contentProcessed { [weak self] err in
                if let err, let self {
                    self.lock.lock()
                    let entry = self.pending.removeValue(forKey: id)
                    self.lock.unlock()
                    entry?.watchdog.cancel()
                    entry?.cont.resume(throwing: err)
                }
            })
        }
    }

    private func legacyCall(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply {
        try await send(EngineWire.request(name, args, payload: payload))
        let h = EngineWire.readU32(try await receive(4), at: 0), header = try await receive(h)
        let d = EngineWire.readU32(try await receive(4), at: 0), data = try await receive(d)
        let m = EngineWire.readU32(try await receive(4), at: 0), map = try await receive(m)
        return EngineService.Reply.decode(header: header, data: data, map: map)
    }

    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply {
        if isMuxActive {
            let reqId = allocId()
            let inner = EngineWire.request(name, args, payload: payload, compressPayload: true)
            let frame = EngineWire.muxFrame(type: EngineWire.muxRequest, id: reqId, body: inner)
            let rpcTimeout: Double = (name == "open" || name == "save" || name == "catalogs") ? 35.0 : 12.0
            let replyBody = try await sendMuxAndWait(id: reqId, frame: frame, timeoutSeconds: rpcTimeout)
            return try decodeWireReply(replyBody)
        }
        return try await legacyCall(name, args, payload: payload)
    }
}
