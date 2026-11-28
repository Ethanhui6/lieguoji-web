import Foundation
import Network
import Darwin
#if canImport(UIKit)
import UIKit
#endif
import LieguojiCore

/// 九州云服直连专线与可选局域网直连元数据（v12.0.0：优先原生 8765 避开运营商 443 非 TLS 限速，顺次容灾回退 8443 / 443）。
struct ComputeRouteInfo: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let address: String
    let tag: String
    var rttMs: Int?
    var active: Bool

    static let builtInRoutes: [ComputeRouteInfo] = [
        ComputeRouteInfo(id: "tencent-8765", name: "九州云服 v17 · 8765 原生直连主线", address: "111.230.153.235:8765", tag: "推荐主线 · LGC2 极速直连", rttMs: nil, active: false),
        ComputeRouteInfo(id: "tencent-8443", name: "九州云服 v17 · 8443 高速容灾专线", address: "111.230.153.235:8443", tag: "高速容灾 · LGC2 极速直连", rttMs: nil, active: false),
        ComputeRouteInfo(id: "tencent-443", name: "九州云服 v17 · 443 备用穿透专线", address: "111.230.153.235:443", tag: "企业网/校园网穿透备用", rttMs: nil, active: false),
        ComputeRouteInfo(id: "lan-udp", name: "同 Wi-Fi 电脑端直连（可选）", address: "lan", tag: "仅在电脑运行服务端时可用", rttMs: nil, active: false),
    ]

    static let directCloudAddresses: [String] = [
        "111.230.153.235:8765",
        "111.230.153.235:8443",
        "111.230.153.235:443",
    ]
}

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
    private var lastAcceptedSeq: UInt32 = 0
    private var baselineOwners: [Int] = []
    private var baselineArmies: [String: GameState.Army] = [:]
    private var baselineArmyOrder: [String] = []
    private var baselineNations: [GameState.Nation] = []
    private var baselineFleets: [GameState.Fleet]? = nil
    private var baselineFleetsMap: [String: GameState.Fleet] = [:]
    private var baselineFleetOrder: [String] = []
    private let maxBuffered = 6
    var onFrameConsumed: (@Sendable (UInt32) -> Void)?

    var lastDay: Int {
        lock.lock()
        defer { lock.unlock() }
        return latestDecodedDay
    }

    func resetDay() {
        lock.lock()
        latestDecodedDay = 0
        lastAcceptedSeq = 0
        baselineOwners.removeAll(keepingCapacity: true)
        baselineArmies.removeAll(keepingCapacity: true)
        baselineArmyOrder.removeAll(keepingCapacity: true)
        baselineNations.removeAll(keepingCapacity: true)
        baselineFleets = nil
        baselineFleetsMap.removeAll(keepingCapacity: true)
        baselineFleetOrder.removeAll(keepingCapacity: true)
        lock.unlock()
    }

    func resetBaseline() {
        lock.lock()
        baselineOwners.removeAll(keepingCapacity: true)
        baselineArmies.removeAll(keepingCapacity: true)
        baselineArmyOrder.removeAll(keepingCapacity: true)
        baselineNations.removeAll(keepingCapacity: true)
        baselineFleets = nil
        baselineFleetsMap.removeAll(keepingCapacity: true)
        baselineFleetOrder.removeAll(keepingCapacity: true)
        lock.unlock()
    }

    func seedBaselineOwners(_ owners: [Int]) {
        guard !owners.isEmpty else { return }
        lock.lock()
        baselineOwners = owners
        lock.unlock()
    }

    func seedBaselineArmies(_ armies: [GameState.Army]) {
        lock.lock()
        baselineArmies.removeAll(keepingCapacity: true)
        baselineArmyOrder.removeAll(keepingCapacity: true)
        for a in armies {
            baselineArmies[a.id] = a
            baselineArmyOrder.append(a.id)
        }
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
        self.lastAcceptedSeq = 0
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
        let frameSeq = tag & 0x00FF_FFFF
        lock.lock()
        let accept = (frameEpoch == epoch)
        lock.unlock()
        guard accept else { return }

        let compSize = compressedPayload.count
        decodeQueue.async { [weak self] in
            guard let self else { return }
            let raw = WireCodec.decompressIfNeeded(compressedPayload)
            guard !raw.isEmpty, var decoded = BinaryStateWire.decode(raw) else { return }
            self.lock.lock()
            guard frameEpoch == self.epoch else {
                self.lock.unlock()
                return
            }
            // UDP 乱序/迟到包防护：丢弃同 epoch 下序号倒退的旧包（允许 24-bit 回绕）
            if self.lastAcceptedSeq > 0 && frameSeq > 0 && frameSeq <= self.lastAcceptedSeq && (self.lastAcceptedSeq - frameSeq) < 100_000 {
                self.lock.unlock()
                return
            }
            if frameSeq > 0 { self.lastAcceptedSeq = frameSeq }

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
            // v12.0.0 保序军队实体差量合并（根治 Array(dict.values) 哈希乱序打乱 contacts 交锋坐标与强制每帧重建渲染！）
            if decoded.armyDeltaMode == true {
                for a in decoded.armies {
                    if self.baselineArmies[a.id] == nil {
                        self.baselineArmyOrder.append(a.id)
                    }
                    self.baselineArmies[a.id] = a
                }
                if let rem = decoded.removedArmyIds, !rem.isEmpty {
                    let remSet = Set(rem)
                    for rid in rem { self.baselineArmies.removeValue(forKey: rid) }
                    self.baselineArmyOrder.removeAll { remSet.contains($0) }
                }
                var orderedArmies = [GameState.Army]()
                orderedArmies.reserveCapacity(self.baselineArmyOrder.count)
                for aid in self.baselineArmyOrder {
                    if let a = self.baselineArmies[aid] { orderedArmies.append(a) }
                }
                decoded.armies = orderedArmies
                decoded.armyDeltaMode = false
                decoded.removedArmyIds = nil
            } else {
                self.baselineArmies.removeAll(keepingCapacity: true)
                self.baselineArmyOrder.removeAll(keepingCapacity: true)
                for a in decoded.armies {
                    self.baselineArmies[a.id] = a
                    self.baselineArmyOrder.append(a.id)
                }
            }
            // v12.0.0 合并精简国家身份字符串（服务端中间帧剥离重复 UTF-8 名称/国色/宗教字符串，此处自动从基线补全！）
            if !decoded.nations.isEmpty {
                if decoded.nations.count == self.baselineNations.count {
                    for i in decoded.nations.indices {
                        if decoded.nations[i].id == nil {
                            let prev = self.baselineNations[i]
                            decoded.nations[i].id = prev.id
                            decoded.nations[i].name = prev.name
                            decoded.nations[i].color = prev.color
                            decoded.nations[i].line = prev.line
                            decoded.nations[i].capital = prev.capital
                            decoded.nations[i].culture = prev.culture
                            decoded.nations[i].polity = prev.polity
                            decoded.nations[i].religion = prev.religion
                        }
                    }
                }
                self.baselineNations = decoded.nations
            } else if !self.baselineNations.isEmpty {
                decoded.nations = self.baselineNations
            }
            if decoded.fleetDeltaMode == true {
                if let fl = decoded.fleets {
                    for f in fl {
                        if self.baselineFleetsMap[f.id] == nil {
                            self.baselineFleetOrder.append(f.id)
                        }
                        self.baselineFleetsMap[f.id] = f
                    }
                }
                if let rem = decoded.removedFleetIds, !rem.isEmpty {
                    let remSet = Set(rem)
                    for rid in rem { self.baselineFleetsMap.removeValue(forKey: rid) }
                    self.baselineFleetOrder.removeAll { remSet.contains($0) }
                }
                var orderedFleets = [GameState.Fleet]()
                orderedFleets.reserveCapacity(self.baselineFleetOrder.count)
                for fid in self.baselineFleetOrder {
                    if let f = self.baselineFleetsMap[fid] { orderedFleets.append(f) }
                }
                decoded.fleets = orderedFleets
                decoded.fleetDeltaMode = false
                decoded.removedFleetIds = nil
                self.baselineFleets = orderedFleets
            } else if let fl = decoded.fleets {
                self.baselineFleets = fl
                self.baselineFleetsMap.removeAll(keepingCapacity: true)
                self.baselineFleetOrder.removeAll(keepingCapacity: true)
                for f in fl {
                    self.baselineFleetsMap[f.id] = f
                    self.baselineFleetOrder.append(f.id)
                }
            } else if let prevFl = self.baselineFleets {
                decoded.fleets = prevFl
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
            var shouldAckNow = false
            if self.queue.count >= self.maxBuffered {
                _ = self.queue.removeFirst()
                shouldAckNow = true
            } else {
                // v12.0.0 入队即确认 MUX_ACK（队列未满时不等主线程睡醒消费），彻底消除 4G 80–150ms RTT 下的滑动窗口饿死卡顿！
                shouldAckNow = true
            }
            self.queue.append((tag, decoded))
            self.lock.unlock()
            if shouldAckNow { ackCb?(tag) }
        }
    }

    func nextFrame(timeoutSeconds: Double = 2.4) async -> GameState? {
        lock.lock()
        if !queue.isEmpty {
            let first = queue.removeFirst()
            lock.unlock()
            return first.state
        }
        lock.unlock()

        return await withCheckedContinuation { (cont: CheckedContinuation<GameState?, Never>) in
            lock.lock()
            if !queue.isEmpty {
                let first = queue.removeFirst()
                lock.unlock()
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

/// 局域网 UDP 零配置自动发现（端口 8766）：使用非阻塞 `poll()` 50ms 切片循环，支持立即取消且不被杂包提前中断。
enum LANDiscovery {
    static func discover(roomCode: String, timeoutSeconds: Double = 0.65) async -> String? {
        await Task.detached(priority: .userInitiated) { () -> String? in
            let sock = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
            guard sock >= 0 else { return nil }
            defer { Darwin.close(sock) }
            var one: Int32 = 1
            _ = setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &one, socklen_t(MemoryLayout<Int32>.size))
            let flags = fcntl(sock, F_GETFL, 0)
            if flags >= 0 { _ = fcntl(sock, F_SETFL, flags | O_NONBLOCK) }

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

            let deadline = Date().timeIntervalSinceReferenceDate + max(0.1, timeoutSeconds)
            let targetCode = roomCode.uppercased()
            var buf = [UInt8](repeating: 0, count: 256)
            while !Task.isCancelled {
                let remainMs = Int32(((deadline - Date().timeIntervalSinceReferenceDate) * 1000).rounded(.down))
                if remainMs <= 0 { break }
                var pfd = pollfd(fd: sock, events: Int16(POLLIN), revents: 0)
                let ready = Darwin.poll(&pfd, 1, min(50, remainMs))
                if ready <= 0 { continue }

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
                guard got > 0 else { continue }
                let text = String(decoding: buf.prefix(got), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
                let parts = text.split(separator: ":")
                guard parts.count >= 3, parts[0] == "LGJ_HERE", String(parts[1]).uppercased() == targetCode else { continue }
                var ipBuf = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                var addr = from.sin_addr
                guard inet_ntop(AF_INET, &addr, &ipBuf, socklen_t(INET_ADDRSTRLEN)) != nil else { continue }
                let ip = String(cString: ipBuf)
                let tcpPort = String(parts[2])
                return "\(ip):\(tcpPort)"
            }
            return nil
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
    private(set) var activeRouteId: String = ""
    private(set) var activeDirectAddress: String = ""
    private var fastestRouteHint: String?
    private var discoveredLANAddress: String?
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
        activeRouteId = ""
        activeDirectAddress = ""
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

    func setRouteProbeHints(fastestDirect: String?, lanAddress: String?) {
        if let fastestDirect, !fastestDirect.isEmpty {
            fastestRouteHint = fastestDirect
        }
        if let lanAddress, !lanAddress.isEmpty {
            discoveredLANAddress = lanAddress
        }
    }

    func cachedLANAddress() -> String? { discoveredLANAddress }

    nonisolated static func routeId(forAddress address: String, transport: String) -> String {
        let lower = address.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if lower == "111.230.153.235:443" { return "tencent-443" }
        if lower == "111.230.153.235:8765" { return "tencent-8765" }
        if lower == "111.230.153.235:8443" { return "tencent-8443" }
        if lower == "lan" || transport.contains("局域网") { return "lan-udp" }
        if lower == "relay" || transport.contains("云端") { return "cf-relay" }
        if lower.hasSuffix(":443") { return "tencent-443" }
        if lower.hasSuffix(":8443") { return "tencent-8443" }
        if lower.hasSuffix(":8765") { return "tencent-8765" }
        return ""
    }

    /// 轻量级非驱逐直连 TCP 探针（硬截止 + 取消立即销毁 socket，绝不在黑洞端口挂死 `withTaskGroup`），返回真实往返 RTT（毫秒）。
    nonisolated static func probeDirectTCP(_ address: String, timeout: Double = 1.4) async -> Int? {
        let clean = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }
        var host = clean
        var port: UInt16 = 8765
        if let idx = host.lastIndex(of: ":"), let p = UInt16(host[host.index(after: idx)...]) {
            port = p
            host = String(host[..<idx])
        }
        guard !host.isEmpty else { return nil }
        let link = RemoteLink(host: host, port: port)
        let clampedTimeout = max(0.3, timeout)
        let t0 = Date().timeIntervalSinceReferenceDate
        let rtt: Int? = await withTaskCancellationHandler {
            await withTaskGroup(of: Int?.self) { group in
                group.addTask {
                    do {
                        try await link.start(timeout: clampedTimeout)
                        let hello = try await link.call("ping", ["v": 6], payload: nil)
                        guard hello.ok, EngineWire.compatibleGreetings.contains(hello.reason) else { return nil }
                        return max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
                    } catch {
                        return nil
                    }
                }
                group.addTask {
                    try? await Task.sleep(nanoseconds: UInt64(clampedTimeout * 1_000_000_000))
                    link.cancel()
                    return nil
                }
                let first = await group.next() ?? nil
                link.cancel()
                group.cancelAll()
                return first
            }
        } onCancel: {
            link.cancel()
        }
        link.cancel()
        return rtt
    }

    /// 并行竞速多个直连端口（如 443 / 8765 / 8443）：首个健康节点 <50ms 胜出并立即取消其余探测。
    nonisolated static func raceDirectAddresses(_ addresses: [String], timeout: Double = 1.5) async -> (address: String, rttMs: Int)? {
        var unique: [String] = []
        var seen = Set<String>()
        for raw in addresses {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, trimmed.contains(".") || trimmed.contains(":"), !seen.contains(trimmed) else { continue }
            seen.insert(trimmed)
            unique.append(trimmed)
        }
        guard !unique.isEmpty else { return nil }
        return await withTaskGroup(of: (String, Int)?.self) { group in
            for addr in unique {
                group.addTask {
                    if let rtt = await Self.probeDirectTCP(addr, timeout: timeout) {
                        return (addr, rtt)
                    }
                    return nil
                }
            }
            for await candidate in group {
                if let winner = candidate {
                    group.cancelAll()
                    return (winner.0, winner.1)
                }
            }
            return nil
        }
    }

    /// 轻量探测 Cloudflare 中继线路可用性与往返延迟（1.4s 硬超时）。
    nonisolated static func probeRelayRoute(roomCode: String, timeout: Double = 1.4) async -> Int? {
        let clampedTimeout = max(0.3, timeout)
        let t0 = Date().timeIntervalSinceReferenceDate
        return await withTaskGroup(of: Int?.self) { group in
            group.addTask {
                guard let status = await RelayLink.probeStatus(code: roomCode), status.online else { return nil }
                return max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(clampedTimeout * 1_000_000_000))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
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
                activeRouteId = ""; activeDirectAddress = ""
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
                // v8.0.0 永不锁死玩家：云服掉线时立刻无缝回落本机引擎继续可玩（绝不再逼玩家手动重连才能点地图！）
                if service.engine == nil, let snap = lastWorld {
                    _ = service.handle("open", [:], payload: snap)
                    service.engine?.enableAppRules()
                }
                if service.engine != nil {
                    lost = false
                    onLinkLost?()
                    return service.handle(name, args, payload: payload)
                }
                lost = true
                return EngineService.Reply(ok: false, reason: "与服务器的连接中断")
            }
        }
        if parked { return EngineService.Reply(ok: false, reason: "已暂存后台，返回前台即自动续连") }
        if lost {
            if service.engine == nil, let snap = lastWorld {
                _ = service.handle("open", [:], payload: snap)
                service.engine?.enableAppRules()
            }
            if service.engine != nil {
                lost = false
                return service.handle(name, args, payload: payload)
            }
            return EngineService.Reply(ok: false, reason: "与服务器的连接中断，正在重连")
        }
        return service.handle(name, args, payload: payload)
    }

    /// 原子切换至已握手的新远程链接：立即关闭旧链接、推进推流 epoch 并重置差量基线，杜绝跨线路僵尸套接字泄漏与基线污染。
    private func installConnectedLink(
        _ link: EngineLink,
        label: String,
        transport: String,
        text: String,
        address: String,
        rtt: Int,
        supportsStream: Bool,
        supportsPush: Bool,
        supportsLZ4: Bool
    ) {
        if let prev = remote, (prev as AnyObject) !== (link as AnyObject) {
            prev.cancel()
        }
        streamEpoch &+= 1
        streamBuffer.reset(epoch: streamEpoch)
        streamBuffer.resetBaseline()
        baselineOwners.removeAll(keepingCapacity: true)
        remote = link
        remoteAddress = label
        remoteTransport = transport
        activeRouteId = Self.routeId(forAddress: text, transport: transport)
        activeDirectAddress = text
        rttBox.reset(rtt)
        lastRTTMs = rtt
        serverSupportsStream = supportsStream
        serverSupportsPush = supportsPush
        serverSupportsLZ4 = supportsLZ4
        lost = false
        parked = false
        lastAddress = address
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
            let portTag = port == 443 ? "443专线" : (port == 8443 ? "8443专线" : "专属服")
            label = isPrivate ? "\(host):\(port)（局域网）" : "\(host):\(port)（\(portTag)）"
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
                installConnectedLink(link, label: label, transport: finalTransport, text: text, address: address, rtt: rtt, supportsStream: isV5OrNewer, supportsPush: pushCapable, supportsLZ4: isV6)
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
                installConnectedLink(link, label: label, transport: finalTransport, text: text, address: address, rtt: rtt, supportsStream: isV5OrNewer, supportsPush: pushCapable, supportsLZ4: isV6)
                return label
            }
            if let backup = (service.engine != nil ? nil : lastWorld) {
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
                guard (try await link.call("open", ["withoutMap": true, "withoutState": true], payload: backup)).ok else {
                    link.cancel()
                    throw EngineError.message("服务器重启后恢复世界失败")
                }
                _ = try? await link.call("enableAppRules", [:], payload: nil)
                installConnectedLink(link, label: label, transport: finalTransport, text: text, address: address, rtt: rtt, supportsStream: isV5OrNewer, supportsPush: pushCapable, supportsLZ4: isV6)
                return label
            }
            if let localEngine = service.engine {
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
                try await uploadCompactWorldToRemote(engine: localEngine, link: link)
                installConnectedLink(link, label: label, transport: finalTransport, text: text, address: address, rtt: rtt, supportsStream: isV5OrNewer, supportsPush: pushCapable, supportsLZ4: isV6)
                return label
            }
            link.cancel(); throw EngineError.message("服务器上的世界已关闭")
        }

        // v13.0.0 全二进制 LGC2 + statics-cache 极速上传：
        // 先 0 锁探测 hasStatics(hash)（14ms）：命中时仅传 ~1.8 MB run-only；未命中时传 ~9 MB Float32 v2 LGC2（较旧版 66 MB 缩减 7×–35×）！
        let startRev = advances.revision
        let startDay = service.engine?.run.world.day.asInt ?? 0
        let hasEngine = (service.engine != nil)
        let staticsHash = service.engine?.computeStaticsHash
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

        let staticsHit: Bool
        if let hash = staticsHash, !hash.isEmpty {
            staticsHit = (try? await link.call("hasStatics", ["hash": hash], payload: nil))?.ok == true
        } else {
            staticsHit = false
        }
        let initialSave: Data? = {
            guard let e = service.engine else { return nil }
            return staticsHit ? e.saveRunOnlyForCompute(staticsHash: staticsHash) : e.saveForCompute()
        }()

        let needsFullRetry: Bool = try await Task.detached(priority: .userInitiated) {
            do {
                if let catalogs = catalogsPayload {
                    let loaded = try await link.call("catalogs", [:], payload: catalogs)
                    guard loaded.ok else { throw EngineError.message(loaded.reason) }
                }
                if let save = initialSave {
                    let opened = try await link.call("open", ["withoutMap": true, "withoutState": true], payload: save)
                    if !opened.ok && staticsHit && opened.reason.contains("statics_miss") {
                        return true
                    }
                    guard opened.ok else { throw EngineError.message("服务器载入世界失败：\(opened.reason)") }
                    _ = try? await link.call("enableAppRules", [:], payload: nil)
                }
                return false
            } catch {
                link.cancel()
                throw error
            }
        }.value

        if needsFullRetry, let full = service.engine?.saveForCompute() {
            do {
                let opened = try await link.call("open", ["withoutMap": true, "withoutState": true], payload: full)
                guard opened.ok else { link.cancel(); throw EngineError.message("服务器载入世界失败：\(opened.reason)") }
                _ = try? await link.call("enableAppRules", [:], payload: nil)
            } catch {
                link.cancel()
                throw error
            }
        }

        // 若上传途中玩家已切到其他世界，礼貌释放这条旧连接。
        guard advances.revision == startRev else {
            link.cancel()
            throw EngineError.message("世界已切换，已取消旧连接")
        }

        // 若后台上传期间本机仍有少量推进，按 ≤25 日小切片平滑追齐（杜绝二次 60MB 重传与 10s step(365) 自杀超时！）
        if hasEngine {
            let nowDay = service.engine?.run.world.day.asInt ?? startDay
            var remainDays = max(0, min(120, nowDay - startDay))
            while remainDays > 0 {
                let chunk = min(25, remainDays)
                try await Task.detached(priority: .userInitiated) {
                    do {
                        let r1 = try await link.call("step", ["days": chunk, "slim": true], payload: nil)
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
                remainDays -= chunk
            }
        }

        if let fullBackup = service.engine?.save() { lastWorld = fullBackup }
        if !localMeta.worldId.isEmpty { currentWorldId = localMeta.worldId }
        currentKnownDay = max(currentKnownDay, service.engine?.run.world.day.asInt ?? startDay)
        installConnectedLink(link, label: label, transport: finalTransport, text: text, address: address, rtt: rtt, supportsStream: isV5OrNewer, supportsPush: pushCapable, supportsLZ4: isV6)
        return label
    }

    /// v13.0.0 统一紧凑上传助手：先 0 锁探测云服 `hasStatics(hash)`，命中传 ~1.8 MB run-only，未命中传 ~9 MB LGC2（若被淘汰则自动回落完整 LGC2）。
    private func uploadCompactWorldToRemote(engine: NativeEngine, link: EngineLink) async throws {
        let hash = engine.computeStaticsHash
        let hit = (try? await link.call("hasStatics", ["hash": hash], payload: nil))?.ok == true
        let primary = hit ? engine.saveRunOnlyForCompute(staticsHash: hash) : engine.saveForCompute()
        var opened = try await link.call("open", ["withoutMap": true, "withoutState": true], payload: primary)
        if !opened.ok && hit && opened.reason.contains("statics_miss") {
            opened = try await link.call("open", ["withoutMap": true, "withoutState": true], payload: engine.saveForCompute())
        }
        guard opened.ok else {
            link.cancel()
            throw EngineError.message("服务器载入世界失败：\(opened.reason)")
        }
        _ = try? await link.call("enableAppRules", [:], payload: nil)
    }

    /// Back to the phone: the computer's world comes home first (LZ4-compressed / LGC2 for speed, preserving local `statics.map`).
    func disconnect() async {
        parked = false; lost = false
        lastResumedState = nil
        activeRouteId = ""; activeDirectAddress = ""
        serverSupportsStream = false; serverSupportsPush = false; serverSupportsLZ4 = false
        rttBox.reset(nil); lastRTTMs = nil
        streamBuffer.onFrameConsumed = nil
        streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
        guard let link = remote else { remoteAddress = nil; remoteTransport = ""; return }
        _ = try? await link.call("streamConfig", ["playing": false, "days": 1, "push": false], payload: nil)
        if let save = try? await link.call("save", [:], payload: nil), let data = save.data {
            if let local = service.engine, local.mapJSON != nil, (try? local.replaceRun(fromRemoteSave: data)) != nil {
                local.enableAppRules()
                currentWorldId = service.currentWorldId
                currentKnownDay = service.currentDay
                lastWorld = local.save()
            } else {
                _ = service.handle("open", [:], payload: data); service.engine?.enableAppRules()
                currentWorldId = service.currentWorldId
                currentKnownDay = service.currentDay
                lastWorld = data
            }
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
        if Self.hasCustomRelayRoomCode && address != room, let label = try? await connect(room, timeout: 2.8, reattach: true) { return label }
        return nil
    }

    /// 构造并去重直连云服候选地址（优先 443 / 8765 / 8443 三端口并行竞速 + 玩家自定专属地址）。
    private func directRaceCandidates() -> [String] {
        var list: [String] = []
        let pinned = Self.savedDirectAddress
        if let hint = fastestRouteHint, !hint.isEmpty { list.append(hint) }
        if !pinned.isEmpty { list.append(pinned) }
        list.append(contentsOf: ComputeRouteInfo.directCloudAddresses)
        if let last = lastAddress, last.contains(".") || last.contains(":") { list.append(last) }
        var seen = Set<String>()
        return list.filter { addr in
            let clean = addr.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty, clean.contains(".") || clean.contains(":"), !seen.contains(clean) else { return false }
            seen.insert(clean)
            return true
        }
    }

    /// v10.0.0 单轮 1.8 秒极速并行竞速（443 / 8765 / 8443 + 局域网 UDP 同期起跑）：彻底废除旧版 35 秒串行超时死等！
    private nonisolated static func raceDirectAndLAN(directCandidates: [String], roomCode: String, timeout: Double = 1.6) async -> (address: String, isLAN: Bool)? {
        await withTaskGroup(of: (String, Bool)?.self) { group in
            for addr in directCandidates {
                group.addTask {
                    if await Self.probeDirectTCP(addr, timeout: timeout) != nil {
                        return (addr, false)
                    }
                    return nil
                }
            }
            group.addTask {
                if let lanFound = await LANDiscovery.discover(roomCode: roomCode, timeoutSeconds: min(0.8, timeout)) {
                    return (lanFound, true)
                }
                return nil
            }
            for await hit in group {
                if let winner = hit {
                    group.cancelAll()
                    return winner
                }
            }
            return nil
        }
    }

    private nonisolated static var hasCustomRelayRoomCode: Bool {
        let custom = (UserDefaults.standard.string(forKey: "remote.roomCode") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return custom.count >= 6
    }

    /// v12.0.0 多端口有序容灾重连：先只读 ping 竞速排序，再按延迟由低到高依次单一连接（绝不同时对多端口发 enableMux 互相踢线！）。
    private func reattachBest() async -> String? {
        if let existing = remoteAddress, remote != nil { return existing }
        guard !reattaching else { return nil }
        reattaching = true
        defer { reattaching = false }

        let room = Self.activeRoomCode
        let directCandidates = directRaceCandidates()
        var ordered: [String] = []
        if let winner = await Self.raceDirectAndLAN(directCandidates: directCandidates, roomCode: room, timeout: 1.8) {
            if winner.isLAN { discoveredLANAddress = winner.address } else { fastestRouteHint = winner.address }
            ordered.append(winner.address)
        }
        for addr in directCandidates where !ordered.contains(addr) {
            ordered.append(addr)
        }
        for addr in ordered {
            if let label = try? await connect(addr, timeout: 3.2, reattach: true) {
                return label
            }
        }
        if Self.hasCustomRelayRoomCode, let status = await RelayLink.probeStatus(code: room), status.online {
            if let label = try? await connect(room, timeout: 3.5, reattach: true) { return label }
        }
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
        activeRouteId = ""; activeDirectAddress = ""
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

    /// 配置服务器端推流（v12.0.0：消除与 GameModel 的双重 RTT 降频叠加，并启用 4–6 帧动态滑动窗口）。
    func configureRemoteStream(playing: Bool, days: Int, intervalMs: Int = 68, resetEpoch: Bool = true) async {
        if resetEpoch || !playing {
            streamEpoch &+= 1
            streamBuffer.reset(epoch: streamEpoch)
        }
        guard let link = remote, serverSupportsStream else { return }
        let useWindow = (link is RemoteLink) && serverSupportsPush
        _ = await call("streamConfig", [
            "playing": playing,
            "days": max(1, min(64, days)),
            "intervalMs": max(32, min(900, intervalMs)),
            "epoch": Int(streamEpoch),
            "push": serverSupportsPush && playing,
            "window": useWindow,
            "binary": serverSupportsPush && serverSupportsLZ4,
            "fleetDelta": serverSupportsPush && serverSupportsLZ4
        ])
    }

    /// v12.0.0 多端口有序容灾接入：先只读 ping 选出最快端口，失败则依次回退 8765 → 8443 → 443，杜绝单点误死与并发互踢。
    func connectAuto() async -> (label: String, transport: String, rttMs: Int?)? {
        guard !cloudHandingOff else { return nil }
        cloudHandingOff = true
        defer { cloudHandingOff = false }
        if lost || parked {
            if let label = await reattachBest() { return (label, remoteTransport, liveRTTMs ?? lastRTTMs) }
            return nil
        }
        guard remote == nil, service.engine != nil else { return nil }
        let room = Self.activeRoomCode
        let directCandidates = directRaceCandidates()
        var ordered: [String] = []
        if let winner = await Self.raceDirectAndLAN(directCandidates: directCandidates, roomCode: room, timeout: 1.8) {
            if winner.isLAN { discoveredLANAddress = winner.address } else { fastestRouteHint = winner.address }
            ordered.append(winner.address)
        }
        for addr in directCandidates where !ordered.contains(addr) {
            ordered.append(addr)
        }
        for addr in ordered {
            if let label = try? await connect(addr, timeout: 3.2) {
                return (label, remoteTransport, liveRTTMs ?? lastRTTMs)
            }
        }
        if Self.hasCustomRelayRoomCode, let status = await RelayLink.probeStatus(code: room), status.online {
            if let label = try? await connect(room, timeout: 3.5) { return (label, remoteTransport, liveRTTMs ?? lastRTTMs) }
        }
        return nil
    }

    // MARK: - requests

    private var advances = AdvanceSession()

    func open(_ data: Data, world: Int) async throws -> (map: Data?, state: Data, revision: UInt64) {
        guard let revision = advances.replaceWorld(world: world) else { throw EngineError.message("世界已经切换，忽略旧的载入请求") }
        try Self.loadCatalogs()
        lastResumedState = nil
        lost = false
        parked = false
        baselineOwners.removeAll(keepingCapacity: true)
        streamBuffer.resetDay()
        lastWorld = data
        streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
        // v8.0.0 零等待瞬开：始终先载入本机权威引擎，彻底根除开局卡连接/连不上导致无法进图的痼疾！
        let localReply = service.handle("open", [:], payload: data)
        service.engine?.enableAppRules()
        guard advances.revision == revision else { throw EngineError.message("世界已经切换，忽略旧的载入结果") }
        guard localReply.ok else { throw EngineError.message(localReply.reason) }
        currentWorldId = service.currentWorldId
        currentKnownDay = service.currentDay
        // 若此前已连着远程云服，以紧凑 LGC2 / run-only 安全同步新世界到云服；同步失败则静默切回本机继续 0ms 畅玩
        if let link = remote, let localEngine = service.engine {
            do {
                try await uploadCompactWorldToRemote(engine: localEngine, link: link)
            } catch {
                link.cancel(); remote = nil; remoteAddress = nil; remoteTransport = ""
                activeRouteId = ""; activeDirectAddress = ""
                serverSupportsStream = false; serverSupportsPush = false; serverSupportsLZ4 = false
            }
        }
        return (localReply.map, localReply.data ?? Data(), revision)
    }

    private static let inputsLock = NSLock()
    private static var sharedGrid: (base: WorldMap, grid: TerrainGraph, document: TerrainDocument)?
    private static var creationInputsCache: [MapResolutionTier: CreationMap.Inputs] = [:]

    /// 当前选中的地图拓扑分辨率档位（支持 20K 标准 / 60K 高精 / 120K 史诗；仅当高精热更底图边界与当前版本权威 GIS 吻合时才启用 60K/120K，防止旧版热更包错位）。
    nonisolated static var selectedResolutionTier: MapResolutionTier {
        get {
            if let raw = UserDefaults.standard.string(forKey: "map.resolutionTier"),
               let tier = MapResolutionTier(rawValue: raw),
               MeshCatalog.isAvailable(tier, hotPackRoot: HotPackManager.rootURL),
               (tier == .standard20K || HistoricalBasemaps.hasCompatibleAtlas(expectedCellCount: tier.expectedCells)) {
                return tier
            }
            if MeshCatalog.isAvailable(.high60K, hotPackRoot: HotPackManager.rootURL),
               HistoricalBasemaps.hasCompatibleAtlas(expectedCellCount: MapResolutionTier.high60K.expectedCells) {
                return .high60K
            }
            return .standard20K
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: "map.resolutionTier")
        }
    }

    nonisolated static func invalidateCreationInputsCache() {
        inputsLock.lock()
        creationInputsCache.removeAll()
        inputsLock.unlock()
    }

    nonisolated static func seedSharedInputs(base: WorldMap, grid: TerrainGraph, document: TerrainDocument) {
        inputsLock.lock()
        if sharedGrid == nil { sharedGrid = (base, grid, document) }
        inputsLock.unlock()
    }
    static func loadCreationInputs(tier: MapResolutionTier? = nil) throws -> CreationMap.Inputs {
        let wanted = tier ?? selectedResolutionTier
        inputsLock.lock()
        if let existing = creationInputsCache[wanted] { inputsLock.unlock(); return existing }
        let cached = (wanted == .standard20K) ? sharedGrid : nil
        inputsLock.unlock()
        try loadCatalogs()
        guard let world = Bundle.main.url(forResource: "World", withExtension: nil),
              let resources = Bundle.main.url(forResource: "biome-resources", withExtension: "json", subdirectory: "Catalog") else { throw EngineError.message("安装包缺少建世界数据") }
        try OpeningGovernment.loadResources(Data(contentsOf: resources))
        let x: CreationMap.Inputs
        if let cached {
            let edges = try CreationMap.GridEdges(data: Data(contentsOf: world.appendingPathComponent("edges20k.bin")))
            x = CreationMap.Inputs(base: cached.base, grid: cached.grid, edges: edges, document: cached.document)
        } else {
            let loaded = try MeshCatalog.loadInputs(tier: wanted, hotPackRoot: HotPackManager.rootURL, bundleWorldURL: world)
            x = loaded.inputs
        }
        inputsLock.lock()
        creationInputsCache[wanted] = x
        if wanted == .standard20K { sharedGrid = nil }
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
        lost = false
        parked = false
        baselineOwners.removeAll(keepingCapacity: true)
        streamBuffer.resetDay()
        streamEpoch &+= 1; streamBuffer.reset(epoch: streamEpoch)
        // v8.0.0 零等待瞬开：新世界永远 0ms 载入本机即可开玩；若已连云服则后台同步，失败不阻塞开局！
        let r = try autoreleasepool { service.adopt(try NativeEngine(created: built)) }
        guard advances.revision == revision else { throw EngineError.message("世界已经切换，忽略旧的建世界结果") }
        guard r.ok else { throw EngineError.message(r.reason) }
        currentWorldId = runId
        currentKnownDay = 0
        if let link = remote, let localEngine = service.engine {
            lastWorld = autoreleasepool { Data(built.json.utf8) }
            do {
                try await uploadCompactWorldToRemote(engine: localEngine, link: link)
            } catch {
                link.cancel(); remote = nil; remoteAddress = nil; remoteTransport = ""
                activeRouteId = ""; activeDirectAddress = ""
                serverSupportsStream = false; serverSupportsPush = false; serverSupportsLZ4 = false
            }
        }
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

    /// v11.0.0：随每步结果一并返回网络元信息，令 `GameModel.apply(step:)` 0 次 `await native.*`，彻底消除预取流水线串行死锁！
    struct StepPacket: Sendable {
        let result: Result<GameState, Error>
        let lost: Bool
        let isRemote: Bool
        let serverSupportsLZ4: Bool
        let rttMs: Int?
    }
    typealias Step = StepPacket

    func step(days: Int, revision: UInt64, producer: UInt64) async -> Step? {
        guard advances.admit(revision: revision, producer: producer) else { return nil }
        if remote == nil && !lost && !parked {
            guard let s = service.stepState(days: days) else {
                return StepPacket(result: .failure(EngineError.message("推演没有返回有效世界状态")), lost: false, isRemote: false, serverSupportsLZ4: false, rttMs: nil)
            }
            currentKnownDay = max(currentKnownDay, s.day)
            return StepPacket(result: .success(s), lost: false, isRemote: false, serverSupportsLZ4: false, rttMs: nil)
        }
        let op = serverSupportsStream ? "pullLatest" : "step"
        let data = await call(op, ["days": days, "slim": serverSupportsLZ4]).data ?? Data()
        guard !data.isEmpty else {
            return StepPacket(result: .failure(EngineError.message("推演没有返回有效世界状态")), lost: lost, isRemote: remote != nil, serverSupportsLZ4: serverSupportsLZ4, rttMs: liveRTTMs ?? lastRTTMs)
        }
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
        return StepPacket(result: res, lost: lost, isRemote: remote != nil, serverSupportsLZ4: serverSupportsLZ4, rttMs: liveRTTMs ?? lastRTTMs)
    }
    func currentLocalState() -> GameState? {
        guard remote == nil else { return nil }
        return service.currentGameState(slim: false)
    }
    func state() async -> Data? { await call("state").data }
    func localDayForTour() -> Int? {
        guard ShotTour.on, remote == nil, let engine = service.engine else { return nil }
        return engine.run.world.day.asInt
    }
    private func command(_ name: String, _ args: [String: Any]) async -> (ok: Bool, reason: String, state: Data?) {
        var reqArgs = args
        if remote != nil && serverSupportsLZ4 && reqArgs["slim"] == nil && reqArgs["withoutState"] == nil {
            reqArgs["slim"] = true
        }
        let r = await call(name, reqArgs)
        return (r.ok, r.reason, r.data)
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
        if remote != nil, let d {
            if let local = service.engine, local.mapJSON != nil, (try? local.replaceRun(fromRemoteSave: d)) != nil {
                let full = local.save()
                lastWorld = full
                return full
            }
            lastWorld = d
        }
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
    func nuclearInfo(_ nation: Int) async -> Data? { await call("nuclearInfo", ["n": nation]).data }
    func buildReactor(_ nation: Int) async -> (ok: Bool, reason: String, state: Data?) { await command("buildReactor", ["n": nation]) }
    func nuclearStrike(attacker: Int, province: Int) async -> (ok: Bool, reason: String, state: Data?) {
        await command("nuclearStrike", ["attacker": attacker, "n": attacker, "province": province])
    }
    func mobilizeIndustry(_ nation: Int, level: String) async -> (ok: Bool, reason: String, state: Data?) {
        await command("mobilizeIndustry", ["n": nation, "level": level])
    }
    func setRebelMode(_ mode: String) async -> (ok: Bool, reason: String, state: Data?) {
        await command("setRebelMode", ["mode": mode])
    }
    func eraMilitaryInfo(_ nation: Int) async -> Data? { await call("eraMilitaryInfo", ["n": nation]).data }
    func resolveHistoricalEvent(eventId: String, choiceIndex: Int) async -> (ok: Bool, reason: String, state: Data?) {
        await command("resolveHistoricalEvent", ["eventId": eventId, "choiceIndex": choiceIndex])
    }
    func setDoctrine(nation: Int, doctrineId: String) async -> (ok: Bool, reason: String, state: Data?) {
        await command("setDoctrine", ["n": nation, "doctrineId": doctrineId])
    }
    func doctrineInfo(_ nation: Int) async -> Data? { await call("doctrineInfo", ["n": nation]).data }
    func setPlayerNation(_ nation: Int) async -> (ok: Bool, reason: String, state: Data?) {
        await command("setPlayerNation", ["n": nation])
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
        let isLarge = (name == "open" || name == "save" || name == "catalogs")
        let timeoutSec: Double = isLarge ? 45.0 : 15.0

        let replyData: Data = try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { cont in
                let watchdog = DispatchWorkItem { [weak self] in
                    guard let self else { return }
                    self.lock.lock()
                    let c = self.pending.removeValue(forKey: reqId)
                    self.lock.unlock()
                    c?.resume(throwing: EngineError.message("云端中转响应超时"))
                }
                lock.lock()
                if closed {
                    lock.unlock()
                    cont.resume(throwing: EngineError.message("与云端通道的连接已断开"))
                    return
                }
                pending[reqId] = cont
                lock.unlock()
                DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + timeoutSec, execute: watchdog)

                task.send(.data(frame)) { [weak self] err in
                    if let err, let self {
                        watchdog.cancel()
                        self.lock.lock()
                        let c = self.pending.removeValue(forKey: reqId)
                        self.lock.unlock()
                        c?.resume(throwing: err)
                    }
                }
            }
        } onCancel: { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let c = self.pending.removeValue(forKey: reqId)
            self.lock.unlock()
            c?.resume(throwing: CancellationError())
        }
        return try decodeWireReply(replyData)
    }
}

/// HTTP/2 + gzip fallback relay channel.
final class RelayLink: EngineLink, @unchecked Sendable {
    static let bases = [
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
    private let hostString: String
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "lieguoji.remote")
    private let lock = NSLock()
    private var mux = false
    private var closed = false
    private var userCancelled = false
    private var activeLargeRPCs = 0
    private var nextId: UInt32 = 1
    private var pending: [UInt32: (cont: CheckedContinuation<Data, Error>, watchdog: DispatchWorkItem)] = [:]
    private var heartbeatTask: Task<Void, Never>?
    private var udpConn: NWConnection?
    private var udpKeepaliveTask: Task<Void, Never>?
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

    private var hasActiveLargeRPC: Bool {
        lock.lock(); defer { lock.unlock() }
        return activeLargeRPCs > 0
    }

    /// 非阻塞回传 9 字节 `MUX_ACK` 滑动窗口确认帧，告诉服务器已消费一帧，准许推下一帧。
    func sendMuxAck(tag: UInt32) {
        guard isMuxActive else { return }
        let frame = EngineWire.muxFrame(type: EngineWire.muxAck, id: tag, body: Data())
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }

    init(host: String, port: UInt16) {
        self.hostString = host
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
        try await withTaskCancellationHandler {
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
                        self?.connection.viabilityUpdateHandler = { [weak self] viable in
                            guard let self, !viable else { return }
                            self.queue.asyncAfter(deadline: .now() + 2.5) { [weak self] in
                                guard let self, self.isMuxActive, self.connection.state != .ready || !self.isViableNow() else { return }
                                self.failAll(EngineError.message("网络链路中断，已快速切换回本机"))
                                self.connection.cancel()
                            }
                        }
                    case .failed(let e): finish(.failure(e))
                    case .cancelled: finish(.failure(EngineError.message("连接已取消")))
                    case .waiting:
                        break
                    default: break
                    }
                }
                connection.start(queue: queue)
                queue.asyncAfter(deadline: .now() + timeout) { [weak self] in
                    if gate.open() {
                        self?.connection.cancel()
                        c.resume(throwing: EngineError.message("连接超时：请确认服务器已运行且地址正确。"))
                    }
                }
            }
        } onCancel: { [weak self] in
            self?.connection.cancel()
        }
    }

    private func isViableNow() -> Bool {
        connection.currentPath?.status == .satisfied
    }

    /// 协商升级为 v15 非阻塞全双工多路复用 + 纯有序 TCP MUX LGB2 差量推流模式（彻底禁用不可靠 UDP 丢包错乱）。
    func upgradeToMux() async throws -> Bool {
        let r = try await legacyCall("enableMux", [:], payload: nil)
        guard r.ok else { return false }
        lock.lock(); mux = true; lock.unlock()
        startMuxReader()
        startMuxHeartbeat()
        return true
    }

    private func startUDPPushChannel(port: UInt16, token: UInt64) {
        guard let nwPort = NWEndpoint.Port(rawValue: port) else { return }
        let udp = NWConnection(host: NWEndpoint.Host(hostString), port: nwPort, using: .udp)
        lock.lock()
        udpConn?.cancel()
        udpConn = udp
        lock.unlock()

        var reg = Data(capacity: 12)
        reg.append(contentsOf: [0x4C, 0x47, 0x4A, 0x55]) // "LGJU"
        var tokBE = token.bigEndian
        withUnsafeBytes(of: &tokBE) { reg.append(contentsOf: $0) }
        let regPacket = reg

        func receiveNextDatagram() {
            udp.receiveMessage { [weak self] data, _, _, err in
                guard let self, err == nil, self.isMuxActive else { return }
                if let d = data, d.count >= 8 {
                    let s = d.startIndex
                    if d[s] == 0x4C && d[s + 1] == 0x47 && d[s + 2] == 0x55 && d[s + 3] == 0x46 { // "LGUF"
                        let tag = UInt32(EngineWire.readU32(d, at: 4))
                        let payload = d.subdata(in: (s + 8)..<d.endIndex)
                        self.onPushFrame?(tag, payload)
                    }
                }
                receiveNextDatagram()
            }
        }

        udp.stateUpdateHandler = { [weak udp] state in
            if case .ready = state {
                // 连发两枚 NAT 打洞注册包，确保国内运营商 NAT 即刻放行 UDP 8767 零队头阻塞下行帧
                udp?.send(content: regPacket, completion: .contentProcessed { _ in })
                DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 0.14) { [weak udp] in
                    udp?.send(content: regPacket, completion: .contentProcessed { _ in })
                }
                receiveNextDatagram()
            }
        }
        udp.start(queue: queue)

        udpKeepaliveTask?.cancel()
        udpKeepaliveTask = Task.detached(priority: .utility) { [weak self, weak udp] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_200_000_000)
                guard let self, self.isMuxActive, let udp else { return }
                udp.send(content: regPacket, completion: .contentProcessed { _ in })
            }
        }
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
        let udp = udpConn
        udpConn = nil
        lock.unlock()
        heartbeatTask?.cancel()
        udpKeepaliveTask?.cancel()
        udp?.cancel()
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
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                guard let self, self.isMuxActive else { return }
                // v10.1.0 关键修复：正在上传大世界存档（open / save / catalogs）时，服务器接收线程正忙于读完大包体，
                // 此时跳过心跳探针且清零失答计数，彻底根除 5.4s 心跳误杀自己刚发出的开局上传！
                if self.hasActiveLargeRPC {
                    missedPings = 0
                    continue
                }
                if let ms = await self.muxPingRTT(timeoutSeconds: 2.5) {
                    missedPings = 0
                    self.onRTTMeasured?(ms)
                } else if self.hasActiveLargeRPC {
                    missedPings = 0
                } else {
                    missedPings += 1
                    // 连续 4 次 2.5s 失答（~16s）才判定真实断链并触发无感回落，彻底杜绝蜂窝/弱网单次抖动掉线！
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
                    if type == EngineWire.muxPush || type == EngineWire.muxBinaryPush {
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

    private func legacyCall(_ name: String, _ args: [String: Any], payload: Data?, timeoutSeconds: Double = 8.0) async throws -> EngineService.Reply {
        let deadlineTimer = DispatchWorkItem { [weak self] in
            self?.connection.cancel()
        }
        queue.asyncAfter(deadline: .now() + timeoutSeconds, execute: deadlineTimer)
        defer { deadlineTimer.cancel() }
        return try await withTaskCancellationHandler {
            try await send(EngineWire.request(name, args, payload: payload))
            let h = EngineWire.readU32(try await receive(4), at: 0), header = try await receive(h)
            let d = EngineWire.readU32(try await receive(4), at: 0), data = try await receive(d)
            let m = EngineWire.readU32(try await receive(4), at: 0), map = try await receive(m)
            return EngineService.Reply.decode(header: header, data: data, map: map)
        } onCancel: { [weak self] in
            self?.connection.cancel()
        }
    }

    func call(_ name: String, _ args: [String: Any], payload: Data?) async throws -> EngineService.Reply {
        let isLarge = (name == "open" || name == "save" || name == "catalogs")
        let isSlowStep = (name == "step" || name == "stepBatch" || name == "resumeWorld")
        if isLarge {
            lock.lock(); activeLargeRPCs += 1; lock.unlock()
        }
        defer {
            if isLarge {
                lock.lock(); activeLargeRPCs = max(0, activeLargeRPCs - 1); lock.unlock()
            }
        }
        if isMuxActive {
            let reqId = allocId()
            let inner = EngineWire.request(name, args, payload: payload, compressPayload: true)
            let frame = EngineWire.muxFrame(type: EngineWire.muxRequest, id: reqId, body: inner)
            let rpcTimeout: Double = isLarge ? 60.0 : (isSlowStep ? 30.0 : 12.0)
            let replyBody = try await sendMuxAndWait(id: reqId, frame: frame, timeoutSeconds: rpcTimeout)
            return try decodeWireReply(replyBody)
        }
        return try await legacyCall(name, args, payload: payload)
    }
}
