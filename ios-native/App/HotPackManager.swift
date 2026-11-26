import Foundation
import CryptoKit
import SwiftUI

// MARK: - 游戏内免换包热更新资源引擎（SHA256 精确差分 · 4 路并发断点续传 · 实时热加载生效）

struct HotPackModule: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let detail: String
    let bytes: Int64
    let fileCount: Int

    var sizeText: String { HotPackManager.formatBytes(bytes) }
}

struct HotPackFile: Codable, Equatable, Sendable {
    let path: String
    let module: String
    let size: Int64
    let sha256: String
    let cdnUrls: [String]?
}

struct HotPackManifest: Codable, Equatable, Sendable {
    let ok: Bool
    let packVersion: Int
    let releaseTag: String
    let summary: String
    let totalBytes: Int64
    let updatedAt: Double
    let modules: [HotPackModule]
    let files: [HotPackFile]
}

/// 可热更精选剧本模型（服务器随时下发新剧本，免换包直接出现在「新世界 › 精选剧本」）
struct HotScenarioPreset: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let note: String
    let seal: String
    let symbol: String
    let template: String
    let nations: Int
    let provinces: Int
    let relations: String
    let cultures: [String]
}

struct HotLoreEntry: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let category: String
    let title: String
    let body: String
}

@MainActor final class HotPackManager: ObservableObject {
    static let shared = HotPackManager()

    /// 持久化热更资源目录（位于 Application Support/LieguojiHotPack，系统永不自动清理）
    nonisolated static var rootURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("LieguojiHotPack", isDirectory: true)
    }

    /// 经中国大陆实测验证的高速 RAW 镜像池（彻底剔除失效站点与慢速源）
    nonisolated static let cdnMirrors: [(name: String, baseURL: String)] = [
        ("腾讯云 EdgeOne 专线", "https://edgeone.gh-proxy.com/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main"),
        ("极速镜像节点", "https://ghfast.top/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main"),
        ("国内高速主线 B", "https://gh-proxy.org/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main"),
        ("国内加速节点 C", "https://gh-proxy.com/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main"),
        ("Gcore 全球加速", "https://gcore.jsdelivr.net/gh/Ethanhui6/lieguoji-web@main"),
        ("Cloudflare 海外边缘", "https://lieguoji-edge.pages.dev/api/cdn/raw")
    ]

    /// 优先查找已热更落地的最新资源文件，不存在时自动回落至安装包 Bundle，实现全量资源免换包热更。
    nonisolated static func resourceURL(name: String, ext: String, subdirectory: String) -> URL? {
        let fileName = ext.isEmpty ? name : "\(name).\(ext)"
        let candidate = rootURL.appendingPathComponent(subdirectory, isDirectory: true).appendingPathComponent(fileName)
        if FileManager.default.fileExists(atPath: candidate.path) {
            return candidate
        }
        return Bundle.main.url(forResource: name, withExtension: ext, subdirectory: subdirectory)
    }

    nonisolated private static func atomicWrite(_ data: Data, to dst: URL) throws {
        let fm = FileManager.default
        let dir = dst.deletingLastPathComponent()
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let tmp = dir.appendingPathComponent(".\(dst.lastPathComponent).tmp.\(UUID().uuidString)")
        do {
            try data.write(to: tmp, options: .atomic)
            if fm.fileExists(atPath: dst.path) {
                _ = try fm.replaceItemAt(dst, withItemAt: tmp)
            } else {
                try fm.moveItem(at: tmp, to: dst)
            }
        } catch {
            try? fm.removeItem(at: tmp)
            throw error
        }
    }

    nonisolated private static func cleanupOrphanTempFiles() {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(at: rootURL, includingPropertiesForKeys: nil) else { return }
        for case let fileURL as URL in enumerator {
            if fileURL.lastPathComponent.contains(".tmp.") {
                try? fm.removeItem(at: fileURL)
            }
        }
    }

    private final class OnDemandFlightBox: @unchecked Sendable {
        private let lock = NSLock()
        private var inflight: [String: Task<URL?, Never>] = [:]
        private let session: URLSession = {
            let cfg = URLSessionConfiguration.default
            cfg.httpMaximumConnectionsPerHost = 12
            cfg.timeoutIntervalForRequest = 14
            cfg.timeoutIntervalForResource = 120
            return URLSession(configuration: cfg)
        }()

        deinit {
            lock.lock()
            let tasks = Array(inflight.values)
            inflight.removeAll()
            lock.unlock()
            for t in tasks { t.cancel() }
            session.invalidateAndCancel()
        }

        func fetch(path: String) async -> URL? {
            let dst = HotPackManager.rootURL.appendingPathComponent(path)
            if FileManager.default.fileExists(atPath: dst.path) { return dst }

            let task: Task<URL?, Never> = {
                lock.lock()
                defer { lock.unlock() }
                if let existing = inflight[path] { return existing }
                let s = session
                let t = Task<URL?, Never> { [weak self] in
                    defer {
                        self?.lock.lock()
                        self?.inflight.removeValue(forKey: path)
                        self?.lock.unlock()
                    }
                    let encoded = path
                        .split(separator: "/")
                        .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
                        .joined(separator: "/")
                    var candidates: [URL] = []
                    let parts = path.split(separator: "/", maxSplits: 1)
                    if parts.count == 2 {
                        let top = String(parts[0])
                        let rest = String(parts[1])
                        let ghPath: String? = ["Music", "Art", "Video", "Engine", "Catalog", "World"].contains(top)
                            ? "ios-native/Resources/\(top)/\(rest)"
                            : (top == "Content" ? "server-deploy/platform/hotpack-content/\(rest)" : nil)
                        if let ghPath {
                            let ghEnc = ghPath
                                .split(separator: "/")
                                .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
                                .joined(separator: "/")
                            for mirror in HotPackManager.cdnMirrors {
                                let cleanPrefix = mirror.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                                if let u = URL(string: "\(cleanPrefix)/\(ghEnc)") {
                                    candidates.append(u)
                                }
                            }
                        }
                    }
                    if let origin = URL(string: "\(OnlinePlatform.apiBase)/api/v1/hotpack/file/\(encoded)") {
                        candidates.append(origin)
                    }
                    for url in candidates {
                        if Task.isCancelled { return nil }
                        let host = (url.host ?? "").lowercased()
                        let isOrigin = host.contains("111.230.153.235")
                        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: isOrigin ? 25 : 10)
                        req.setValue("gzip", forHTTPHeaderField: "Accept-Encoding")
                        if let (data, resp) = try? await s.data(for: req),
                           let http = resp as? HTTPURLResponse,
                           http.statusCode == 200,
                           !data.isEmpty {
                            let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                            if ct.contains("text/html") { continue }
                            if Task.isCancelled { return nil }
                            do {
                                try HotPackManager.atomicWrite(data, to: dst)
                                return dst
                            } catch {
                                return nil
                            }
                        }
                    }
                    return nil
                }
                inflight[path] = t
                return t
            }()
            return await task.value
        }
    }

    private final class HotProbeMetricsDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        private let lock = NSLock()
        private var _bodyDuration: Double?

        var bodyDuration: Double? {
            lock.lock()
            defer { lock.unlock() }
            return _bodyDuration
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
            guard let tx = metrics.transactionMetrics.last(where: { $0.responseStartDate != nil && $0.responseEndDate != nil }) else {
                return
            }
            if let rs = tx.responseStartDate, let re = tx.responseEndDate {
                let dt = re.timeIntervalSince(rs)
                if dt > 0 {
                    lock.lock()
                    _bodyDuration = dt
                    lock.unlock()
                }
            }
        }
    }

    private final class HotTaskBox: @unchecked Sendable {
        private let lock = NSLock()
        private var task: Task<Void, Never>?

        func replace(_ newTask: Task<Void, Never>?) {
            lock.lock()
            let old = task
            task = newTask
            lock.unlock()
            old?.cancel()
        }

        func cancel() {
            replace(nil)
        }
    }

    nonisolated private static let onDemandBox = OnDemandFlightBox()

    /// 云端按需静默拉取并永久缓存资源（用于瘦身后移至云端的原声音乐、54 卷传报画幅与旧版引擎），并发自动去重。
    nonisolated static func fetchOnDemand(path: String) async -> URL? {
        await onDemandBox.fetch(path: path)
    }

    @Published private(set) var manifest: HotPackManifest?
    @Published private(set) var installedVersion: Int = UserDefaults.standard.integer(forKey: "hotpack.installedVersion")
    @Published private(set) var installedTag: String = UserDefaults.standard.string(forKey: "hotpack.installedTag") ?? ""
    @Published private(set) var installedTotalBytes: Int64 = Int64(UserDefaults.standard.integer(forKey: "hotpack.installedBytes"))

    @Published private(set) var pendingFiles: [HotPackFile] = []
    @Published private(set) var pendingBytes: Int64 = 0
    @Published private(set) var checking = false
    @Published private(set) var updating = false
    @Published private(set) var progress: Double = 0
    @Published private(set) var downloadedBytes: Int64 = 0
    @Published private(set) var speedBytesPerSec: Double = 0
    @Published private(set) var activeCDNName: String = ""
    @Published private(set) var rankedFastMirrors: [String] = []
    @Published private(set) var currentModuleName: String = ""
    @Published private(set) var statusMessage: String = ""
    @Published private(set) var errorMessage: String?
    @Published var showHotUpdateSheet = false

    /// 实时热加载生效的内容集合（免重装立即生效）
    @Published private(set) var extraScenarios: [HotScenarioPreset] = []
    @Published private(set) var extraMottos: [String] = []
    @Published private(set) var loreEntries: [HotLoreEntry] = []

    private var installedHashes: [String: String] = [:]
    private var updateGeneration: UInt64 = 0
    private nonisolated let taskBox = HotTaskBox()

    private nonisolated let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.httpMaximumConnectionsPerHost = 12
        cfg.timeoutIntervalForRequest = 16
        cfg.timeoutIntervalForResource = 180
        return URLSession(configuration: cfg)
    }()

    var hasPendingUpdate: Bool { !pendingFiles.isEmpty }
    var pendingSummaryText: String {
        "\(pendingFiles.count) 项资源 · \(Self.formatBytes(pendingBytes))"
    }

    private init() {
        loadInstalledIndex()
        reloadHotContent()
    }

    deinit {
        taskBox.cancel()
        session.invalidateAndCancel()
    }

    nonisolated static func formatBytes(_ bytes: Int64) -> String {
        if bytes >= 1_048_576 { return String(format: "%.1f MB", Double(bytes) / 1_048_576.0) }
        if bytes >= 1024 { return "\(max(1, bytes / 1024)) KB" }
        return "\(max(0, bytes)) B"
    }

    private static var indexURL: URL { rootURL.appendingPathComponent("installed-index.json") }

    private func loadInstalledIndex() {
        if let raw = try? Data(contentsOf: Self.indexURL),
           let map = try? JSONDecoder().decode([String: String].self, from: raw) {
            installedHashes = map
        }
    }

    private func saveInstalledIndex() {
        try? FileManager.default.createDirectory(at: Self.rootURL, withIntermediateDirectories: true)
        if let raw = try? JSONEncoder().encode(installedHashes) {
            try? raw.write(to: Self.indexURL, options: .atomic)
        }
    }

    /// 检查服务器热更资源清单，计算 SHA256 精确增量；首次自动弹出 20MB+ 典藏内容热更确认卡，后续仅拉取变动文件。
    @discardableResult
    func checkManifest(autoPrompt: Bool = false) async -> Bool {
        guard !checking && !updating else { return false }
        checking = true
        errorMessage = nil
        defer { checking = false }

        guard let url = URL(string: OnlinePlatform.apiBase + "/api/v1/hotpack/manifest") else { return false }
        let req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        do {
            let (data, resp) = try await session.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return false }
            let m = try JSONDecoder().decode(HotPackManifest.self, from: data)
            guard m.ok else { return false }
            manifest = m

            // 计算差分：只下载缺失或 SHA256 已更新的文件
            let fm = FileManager.default
            var diff: [HotPackFile] = []
            var diffBytes: Int64 = 0
            for f in m.files {
                let dst = Self.rootURL.appendingPathComponent(f.path)
                if installedHashes[f.path] == f.sha256, fm.fileExists(atPath: dst.path) {
                    continue
                }
                diff.append(f)
                diffBytes += f.size
            }
            pendingFiles = diff
            pendingBytes = diffBytes

            if diff.isEmpty {
                installedVersion = m.packVersion
                installedTag = m.releaseTag
                installedTotalBytes = m.totalBytes
                UserDefaults.standard.set(m.packVersion, forKey: "hotpack.installedVersion")
                UserDefaults.standard.set(m.releaseTag, forKey: "hotpack.installedTag")
                UserDefaults.standard.set(Int(min(Int64(Int.max), m.totalBytes)), forKey: "hotpack.installedBytes")
                statusMessage = "全部游戏资源与内容已是最新（\(m.releaseTag)）"
                return false
            } else {
                statusMessage = "发现免换包游戏内更新：\(Self.formatBytes(diffBytes))（\(diff.count) 项）"
                let dismissedVer = UserDefaults.standard.integer(forKey: "hotpack.dismissedVersion")
                if autoPrompt && !ShotTour.on && dismissedVer < m.packVersion {
                    showHotUpdateSheet = true
                }
                return true
            }
        } catch {
            errorMessage = "热更清单检查失败，请稍后重试"
            return false
        }
    }

    func dismissPrompt() {
        if let v = manifest?.packVersion {
            UserDefaults.standard.set(v, forKey: "hotpack.dismissedVersion")
        }
        showHotUpdateSheet = false
    }

    private struct HotCDNNode: Sendable {
        enum Kind: Sendable {
            case rawProxy
            case origin
        }
        let id: String
        let name: String
        let kind: Kind
        let prefix: String
        let supportsRange: Bool
        let speedMBps: Double
    }

    private final class HotMirrorPool: @unchecked Sendable {
        private let lock = NSLock()
        let fastNodes: [HotCDNNode]
        let backupNodes: [HotCDNNode]
        private var failCounts: [String: Int] = [:]
        private var cooldownUntil: [String: CFAbsoluteTime] = [:]

        init(fastNodes: [HotCDNNode], backupNodes: [HotCDNNode]) {
            self.fastNodes = fastNodes
            self.backupNodes = backupNodes
        }

        /// 为第 `slot` 号文件生成跨多镜像负载均衡的有序尝试链（高速池轮转起步 -> 其余高速池 -> 备用外镜 -> 源站兜底）
        func orderedNodes(forSlot slot: Int) -> [HotCDNNode] {
            lock.lock()
            defer { lock.unlock() }
            let now = CFAbsoluteTimeGetCurrent()

            var primaryHealthy: [HotCDNNode] = []
            var primaryCooling: [HotCDNNode] = []
            if !fastNodes.isEmpty {
                let start = slot % fastNodes.count
                for offset in 0..<fastNodes.count {
                    let node = fastNodes[(start + offset) % fastNodes.count]
                    if (cooldownUntil[node.id] ?? 0) > now {
                        primaryCooling.append(node)
                    } else {
                        primaryHealthy.append(node)
                    }
                }
            }
            var backupHealthy: [HotCDNNode] = []
            var backupCooling: [HotCDNNode] = []
            for node in backupNodes {
                if (cooldownUntil[node.id] ?? 0) > now {
                    backupCooling.append(node)
                } else {
                    backupHealthy.append(node)
                }
            }
            return primaryHealthy + backupHealthy + primaryCooling + backupCooling
        }

        func reportSuccess(nodeID: String) {
            lock.lock()
            failCounts[nodeID] = 0
            cooldownUntil.removeValue(forKey: nodeID)
            lock.unlock()
        }

        func reportFailure(nodeID: String) {
            lock.lock()
            let fails = (failCounts[nodeID] ?? 0) + 1
            failCounts[nodeID] = fails
            cooldownUntil[nodeID] = CFAbsoluteTimeGetCurrent() + (fails >= 3 ? 25.0 : 8.0)
            lock.unlock()
        }
    }

    nonisolated private static func defaultHotCDNs(base: String) -> [HotCDNNode] {
        let cleanBase = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var nodes: [HotCDNNode] = cdnMirrors.enumerated().map { idx, item in
            let cleanPrefix = item.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/"
            return HotCDNNode(
                id: "cdn-\(idx)",
                name: item.name,
                kind: .rawProxy,
                prefix: cleanPrefix,
                supportsRange: true,
                speedMBps: 0
            )
        }
        nodes.append(
            HotCDNNode(
                id: "tencent-origin",
                name: "腾讯云源站兜底",
                kind: .origin,
                prefix: "\(cleanBase)/api/v1/hotpack/file/",
                supportsRange: true,
                speedMBps: 0
            )
        )
        return nodes
    }

    nonisolated private static func urlForPath(_ path: String, on node: HotCDNNode) -> URL? {
        switch node.kind {
        case .origin:
            let encodedPath = path
                .split(separator: "/")
                .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
                .joined(separator: "/")
            return URL(string: node.prefix + encodedPath)
        case .rawProxy:
            let parts = path.split(separator: "/", maxSplits: 1)
            guard parts.count == 2 else { return nil }
            let top = String(parts[0])
            let rest = String(parts[1])
            let ghPath: String
            if ["Music", "Art", "Video", "Engine", "Catalog", "World"].contains(top) {
                ghPath = "ios-native/Resources/\(top)/\(rest)"
            } else if top == "Content" {
                ghPath = "server-deploy/platform/hotpack-content/\(rest)"
            } else {
                return nil
            }
            let ghEnc = ghPath
                .split(separator: "/")
                .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
                .joined(separator: "/")
            return URL(string: node.prefix + ghEnc)
        }
    }

    /// 256 KB 吞吐测速（探测 Engine/engine.js Range: bytes=0-262143）：严格按实测 MB/s 降序排列，Top 3 组建高速多镜像池，绝不让 3 Mbps 源站挤占前排。
    nonisolated private static func raceHotCDNs(base: String) async -> (fast: [HotCDNNode], backups: [HotCDNNode]) {
        let all = defaultHotCDNs(base: base)
        let externalNodes = all.filter { $0.kind == .rawProxy }
        let originNode = all.first(where: { $0.kind == .origin })
        let probePath = "Engine/engine.js"

        let probeCfg = URLSessionConfiguration.ephemeral
        probeCfg.timeoutIntervalForRequest = 6.0
        probeCfg.timeoutIntervalForResource = 7.0
        probeCfg.waitsForConnectivity = false
        probeCfg.httpMaximumConnectionsPerHost = 6
        let probeSession = URLSession(configuration: probeCfg)
        defer { probeSession.invalidateAndCancel() }

        var measured: [HotCDNNode] = []
        await withTaskGroup(of: HotCDNNode?.self) { group in
            for node in externalNodes {
                group.addTask {
                    guard let url = Self.urlForPath(probePath, on: node) else { return nil }
                    var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6.0)
                    req.setValue("bytes=0-262143", forHTTPHeaderField: "Range")
                    req.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
                    let metrics = HotProbeMetricsDelegate()
                    let t0 = CFAbsoluteTimeGetCurrent()
                    do {
                        let (data, resp) = try await probeSession.data(for: req, delegate: metrics)
                        let wallDt = max(0.02, CFAbsoluteTimeGetCurrent() - t0)
                        guard let http = resp as? HTTPURLResponse,
                              (http.statusCode == 206 || http.statusCode == 200),
                              data.count >= 16_384 else {
                            return nil
                        }
                        let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                        if ct.contains("text/html") { return nil }
                        let bodyDuration: Double
                        if let rawBody = metrics.bodyDuration, rawBody >= 0.005 {
                            bodyDuration = max(0.02, rawBody)
                        } else {
                            bodyDuration = wallDt
                        }
                        let speedMBps = (Double(data.count) / 1_048_576.0) / max(0.02, bodyDuration)
                        return HotCDNNode(
                            id: node.id,
                            name: node.name,
                            kind: node.kind,
                            prefix: node.prefix,
                            supportsRange: http.statusCode == 206,
                            speedMBps: speedMBps
                        )
                    } catch {
                        return nil
                    }
                }
            }
            for await item in group {
                if let item {
                    measured.append(item)
                }
            }
        }

        if measured.isEmpty {
            // 极端弱网全部超时：保留国内高速镜像与源站兜底
            let fallbackFast = Array(externalNodes.prefix(3))
            var backups = Array(externalNodes.dropFirst(3))
            if let originNode { backups.append(originNode) }
            return (fallbackFast, backups)
        }

        measured.sort { a, b in
            if abs(a.speedMBps - b.speedMBps) > 0.01 { return a.speedMBps > b.speedMBps }
            return a.supportsRange && !b.supportsRange
        }

        let fastTop3 = Array(measured.prefix(3))
        var backups = Array(measured.dropFirst(3))
        // 源站 111.230.153.235 严格放在队尾兜底（永不排在可用高速外镜前面；亦保障管理员刚热更 hot-rules.json 时可回源）
        if let originNode {
            backups.append(originNode)
        }
        return (fastTop3, backups)
    }

    /// 大文件（≥ 3 MB，例如 11.7 MB 史诗配乐）跨多高速镜像 4 路并发 HTTP Range 分片下载并严格 SHA256 校验。
    nonisolated private static func downloadRange4Streams(
        file: HotPackFile,
        nodes: [HotCDNNode],
        pool: HotMirrorPool,
        session: URLSession
    ) async -> (Data, String)? {
        let expectedSize = file.size
        guard expectedSize >= 3_000_000 else { return nil }
        let rangeNodes = nodes.filter { $0.supportsRange && $0.kind == .rawProxy }
        guard !rangeNodes.isEmpty else { return nil }

        let streamCount = 4
        let partSize = (expectedSize + Int64(streamCount) - 1) / Int64(streamCount)
        var slices: [(Int, Int64, Int64)] = []
        var offset: Int64 = 0
        var idx = 0
        while offset < expectedSize {
            let end = min(expectedSize - 1, offset + partSize - 1)
            slices.append((idx, offset, end))
            offset = end + 1
            idx += 1
        }
        guard slices.count >= 2 else { return nil }

        var parts = Array<Data?>(repeating: nil, count: slices.count)
        var usedNodeName = rangeNodes[0].name
        let okAll = await withTaskGroup(of: (Int, Data?, String?).self, returning: Bool.self) { group in
            for (i, start, end) in slices {
                let wantLen = Int(end - start + 1)
                group.addTask {
                    let attempts = min(rangeNodes.count, 3)
                    for attempt in 0..<attempts {
                        if Task.isCancelled { return (i, nil, nil) }
                        let node = rangeNodes[(i + attempt) % rangeNodes.count]
                        guard let url = Self.urlForPath(file.path, on: node) else { continue }
                        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
                        req.setValue("bytes=\(start)-\(end)", forHTTPHeaderField: "Range")
                        req.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
                        do {
                            let (data, resp) = try await session.data(for: req)
                            guard let http = resp as? HTTPURLResponse,
                                  http.statusCode == 206,
                                  data.count == wantLen else {
                                pool.reportFailure(nodeID: node.id)
                                continue
                            }
                            let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                            if ct.contains("text/html") {
                                pool.reportFailure(nodeID: node.id)
                                continue
                            }
                            pool.reportSuccess(nodeID: node.id)
                            return (i, data, node.name)
                        } catch {
                            if Task.isCancelled { return (i, nil, nil) }
                            pool.reportFailure(nodeID: node.id)
                        }
                    }
                    return (i, nil, nil)
                }
            }
            var success = true
            for await (i, data, name) in group {
                if let data {
                    parts[i] = data
                    if let name { usedNodeName = name }
                } else {
                    success = false
                    group.cancelAll()
                }
            }
            return success
        }
        guard okAll else { return nil }

        var combined = Data(capacity: Int(expectedSize))
        for p in parts {
            guard let p else { return nil }
            combined.append(p)
        }
        guard Int64(combined.count) == expectedSize else { return nil }
        let digest = SHA256.hash(data: combined).map { String(format: "%02x", $0) }.joined()
        guard digest == file.sha256 else { return nil }
        return (combined, usedNodeName)
    }

    nonisolated private static func downloadOne(
        _ file: HotPackFile,
        slot: Int,
        pool: HotMirrorPool,
        session: URLSession
    ) async -> (HotPackFile, Bool, String?) {
        let isLargeFile = file.size >= 3_000_000
        let nodes = pool.orderedNodes(forSlot: slot)

        // 大文件优先在高速外镜池上走跨节点 4 路 HTTP Range 并发拉取 + 严格 SHA256 校验
        if isLargeFile {
            if let (rangedData, usedName) = await Self.downloadRange4Streams(file: file, nodes: nodes, pool: pool, session: session) {
                if Task.isCancelled { return (file, false, nil) }
                do {
                    let dst = rootURL.appendingPathComponent(file.path)
                    try Self.atomicWrite(rangedData, to: dst)
                    return (file, true, usedName)
                } catch {
                    return (file, false, nil)
                }
            }
        }

        for node in nodes {
            if Task.isCancelled { return (file, false, nil) }
            guard let url = Self.urlForPath(file.path, on: node) else { continue }

            let timeout: TimeInterval = node.kind == .origin ? 30 : (isLargeFile ? 24 : 12)
            var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
            req.setValue("gzip", forHTTPHeaderField: "Accept-Encoding")
            do {
                let (data, resp) = try await session.data(for: req)
                guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
                    pool.reportFailure(nodeID: node.id)
                    continue
                }
                let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                if ct.contains("text/html") {
                    pool.reportFailure(nodeID: node.id)
                    continue
                }
                let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
                guard digest == file.sha256 else {
                    pool.reportFailure(nodeID: node.id)
                    continue
                }
                if Task.isCancelled { return (file, false, nil) }
                let dst = rootURL.appendingPathComponent(file.path)
                try Self.atomicWrite(data, to: dst)
                pool.reportSuccess(nodeID: node.id)
                return (file, true, node.name)
            } catch {
                if Task.isCancelled { return (file, false, nil) }
                pool.reportFailure(nodeID: node.id)
                continue
            }
        }
        return (file, false, nil)
    }

    /// 启动 12 路多镜像吞吐竞速热更新（256 KB 吞吐测速择优 Top 3 镜像 + 12 并发跨镜分发 + 大文件 4 路 Range 分片 + 严格 SHA256 校验）。
    func startHotUpdate(onApplied: (() async -> Void)? = nil) {
        guard !updating, let m = manifest, !pendingFiles.isEmpty else { return }
        updating = true
        errorMessage = nil
        progress = 0
        downloadedBytes = 0
        speedBytesPerSec = 0
        activeCDNName = ""
        rankedFastMirrors = []
        statusMessage = "正在 256KB 实测各国内高速镜像吞吐（MB/s）…"

        // 优先下载轻量核心包（剧本/规则/词典/传报画幅），再并行拉取大体积美术与原声音乐
        let priority: [String: Int] = ["content": 0, "catalog": 1, "world": 2, "video": 3, "engine": 4, "art": 5, "music": 6]
        let queue = pendingFiles.sorted {
            let pa = priority[$0.module] ?? 9, pb = priority[$1.module] ?? 9
            if pa != pb { return pa < pb }
            return $0.size < $1.size
        }
        let total = max(1, pendingBytes)
        let moduleNames = Dictionary(uniqueKeysWithValues: m.modules.map { ($0.id, $0.name) })
        let base = OnlinePlatform.apiBase

        updateGeneration &+= 1
        let runGen = updateGeneration

        let newTask = Task { [weak self] in
            guard let self else { return }
            let dlSession = self.session
            Self.cleanupOrphanTempFiles()

            let (fastNodes, backupNodes) = await Self.raceHotCDNs(base: base)
            let mirrorPool = HotMirrorPool(fastNodes: fastNodes, backupNodes: backupNodes)

            if Task.isCancelled || self.updateGeneration != runGen {
                if self.updateGeneration == runGen {
                    self.updating = false
                    self.statusMessage = "已暂停热更新（已完成部分已自动保存，随时可续传）"
                }
                Self.cleanupOrphanTempFiles()
                return
            }

            self.rankedFastMirrors = fastNodes.map(\.name)
            let routeBanner: String
            if fastNodes.count >= 2, let lead = fastNodes.first {
                routeBanner = "多路并发 · \(lead.name) 等 \(fastNodes.count) 节点"
            } else {
                routeBanner = fastNodes.first?.name ?? backupNodes.first?.name ?? "腾讯云源站兜底"
            }
            self.activeCDNName = routeBanner
            self.statusMessage = "已锁定「\(routeBanner)」，正在 12 路并发满速下载…"

            let startTime = CFAbsoluteTimeGetCurrent()
            var completedCount = 0
            var completedBytes: Int64 = 0
            var failed = 0
            var nextIdx = 0
            let maxWorkers = 12
            var speedSamples: [(Double, Int64)] = [(startTime, 0)]

            await withTaskGroup(of: (HotPackFile, Bool, String?).self) { group in
                let initial = min(maxWorkers, queue.count)
                for _ in 0..<initial {
                    let slot = nextIdx
                    let f = queue[slot]
                    nextIdx += 1
                    group.addTask { await Self.downloadOne(f, slot: slot, pool: mirrorPool, session: dlSession) }
                }
                var lastPersistCount = 0
                for await (file, ok, usedNode) in group {
                    if Task.isCancelled || self.updateGeneration != runGen {
                        group.cancelAll()
                        continue
                    }
                    if ok {
                        self.installedHashes[file.path] = file.sha256
                        completedCount += 1
                        completedBytes += file.size
                        self.currentModuleName = moduleNames[file.module] ?? file.module
                        if fastNodes.count < 2, let usedNode, !usedNode.isEmpty {
                            self.activeCDNName = usedNode
                        }
                    } else {
                        failed += 1
                    }
                    if completedCount - lastPersistCount >= 8 || nextIdx >= queue.count {
                        self.saveInstalledIndex()
                        lastPersistCount = completedCount
                    }
                    self.downloadedBytes = completedBytes
                    self.progress = min(1.0, Double(completedBytes) / Double(total))
                    let now = CFAbsoluteTimeGetCurrent()
                    speedSamples.append((now, completedBytes))
                    while speedSamples.count > 2 && (now - speedSamples[0].0) > 3.0 {
                        speedSamples.removeFirst()
                    }
                    let totalElapsed = max(0.12, now - startTime)
                    let avgSpeed = Double(completedBytes) / totalElapsed
                    let windowDt = now - speedSamples[0].0
                    let instSpeed = windowDt >= 0.3 ? Double(completedBytes - speedSamples[0].1) / windowDt : avgSpeed
                    self.speedBytesPerSec = self.speedBytesPerSec > 0 ? (self.speedBytesPerSec * 0.4 + instSpeed * 0.6) : instSpeed
                    self.statusMessage = String(
                        format: "%@ ·「%@」%d/%d · %@ / %@ · %.1f MB/s",
                        self.activeCDNName.isEmpty ? routeBanner : self.activeCDNName,
                        self.currentModuleName,
                        completedCount,
                        queue.count,
                        Self.formatBytes(completedBytes),
                        Self.formatBytes(total),
                        self.speedBytesPerSec / 1_048_576.0
                    )
                    if nextIdx < queue.count && !Task.isCancelled && self.updateGeneration == runGen {
                        let slot = nextIdx
                        let f = queue[slot]
                        nextIdx += 1
                        group.addTask { await Self.downloadOne(f, slot: slot, pool: mirrorPool, session: dlSession) }
                    }
                }
            }
            Self.cleanupOrphanTempFiles()

            guard self.updateGeneration == runGen else { return }

            if Task.isCancelled {
                self.saveInstalledIndex()
                self.updating = false
                self.statusMessage = "已暂停热更新（已完成部分已自动保存，随时可续传）"
                _ = await self.checkManifest(autoPrompt: false)
                return
            }

            self.saveInstalledIndex()
            self.updating = false

            if failed == 0 {
                self.pendingFiles = []
                self.pendingBytes = 0
                self.progress = 1.0
                self.installedVersion = m.packVersion
                self.installedTag = m.releaseTag
                self.installedTotalBytes = m.totalBytes
                UserDefaults.standard.set(m.packVersion, forKey: "hotpack.installedVersion")
                UserDefaults.standard.set(m.releaseTag, forKey: "hotpack.installedTag")
                UserDefaults.standard.set(Int(min(Int64(Int.max), m.totalBytes)), forKey: "hotpack.installedBytes")
                self.reloadHotContent()
                await onApplied?()
                self.statusMessage = "热更新已完成（\(m.releaseTag)），新增剧本与音画资源已立即生效"
                GameFeel.shared.notify(.success)
            } else {
                self.errorMessage = "有 \(failed) 项资源校验未通过，可点击继续补全（已完成部分无需重下）"
                _ = await self.checkManifest(autoPrompt: false)
                GameFeel.shared.notify(.warning)
            }
        }
        taskBox.replace(newTask)
    }

    func cancelHotUpdate() {
        taskBox.cancel()
        Self.cleanupOrphanTempFiles()
    }

    /// 清除本地热更缓存（排错或释放空间用）
    func clearCache() {
        updateGeneration &+= 1
        taskBox.cancel()
        updating = false
        try? FileManager.default.removeItem(at: Self.rootURL)
        installedHashes = [:]
        installedVersion = 0
        installedTag = ""
        installedTotalBytes = 0
        rankedFastMirrors = []
        extraScenarios = []
        extraMottos = []
        loreEntries = []
        UserDefaults.standard.removeObject(forKey: "hotpack.installedVersion")
        UserDefaults.standard.removeObject(forKey: "hotpack.installedTag")
        UserDefaults.standard.removeObject(forKey: "hotpack.installedBytes")
        statusMessage = "已清理本地热更资源缓存"
    }

    /// 立即热加载本地已安装的剧本、题词、典故、词典与平衡规则（无需重启 App、无需换包）。
    func reloadHotContent() {
        let dec = JSONDecoder()

        let scenURL = Self.rootURL.appendingPathComponent("Content/scenarios.json")
        if let raw = try? Data(contentsOf: scenURL),
           let list = try? dec.decode([HotScenarioPreset].self, from: raw) {
            extraScenarios = list
        }

        let mottoURL = Self.rootURL.appendingPathComponent("Content/mottos.json")
        if let raw = try? Data(contentsOf: mottoURL),
           let list = try? dec.decode([String].self, from: raw) {
            extraMottos = list
        }

        let loreURL = Self.rootURL.appendingPathComponent("Content/chronicle-lore.json")
        if let raw = try? Data(contentsOf: loreURL),
           let list = try? dec.decode([HotLoreEntry].self, from: raw) {
            loreEntries = list
        }

        let rulesURL = Self.rootURL.appendingPathComponent("Content/hot-rules.json")
        if let raw = try? Data(contentsOf: rulesURL) {
            _ = CloudConfig.shared.applyServerHotpatch(raw, patchVersion: max(installedVersion, CloudConfig.shared.version))
        }

        // 刷新海报与图集缓存，让新热更的美术与传报长卷立即呈现
        InkPlayerHostView.clearCache()
        BundleArt.clearCache()
        NativeHost.invalidateCatalogCache()
    }
}
