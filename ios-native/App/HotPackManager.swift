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
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("LieguojiHotPack", isDirectory: true)
    }

    /// 优先查找已热更落地的最新资源文件，不存在时自动回落至安装包 Bundle，实现全量资源免换包热更。
    nonisolated static func resourceURL(name: String, ext: String, subdirectory: String) -> URL? {
        let fileName = ext.isEmpty ? name : "\(name).\(ext)"
        let candidate = rootURL.appendingPathComponent(subdirectory, isDirectory: true).appendingPathComponent(fileName)
        if FileManager.default.fileExists(atPath: candidate.path) {
            return candidate
        }
        return Bundle.main.url(forResource: name, withExtension: ext, subdirectory: subdirectory)
    }

    private final class OnDemandFlightBox: @unchecked Sendable {
        private let lock = NSLock()
        private var inflight: [String: Task<URL?, Never>] = [:]
        private let session: URLSession = {
            let cfg = URLSessionConfiguration.default
            cfg.httpMaximumConnectionsPerHost = 12
            cfg.timeoutIntervalForRequest = 16
            cfg.timeoutIntervalForResource = 120
            return URLSession(configuration: cfg)
        }()

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
                            let ghEnc = ghPath.split(separator: "/").map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }.joined(separator: "/")
                            if let u0 = URL(string: "https://lieguoji-edge.pages.dev/api/cdn/raw/\(ghEnc)") { candidates.append(u0) }
                            if let u1 = URL(string: "https://lieguoji-web.pages.dev/api/cdn/raw/\(ghEnc)") { candidates.append(u1) }
                            if let u2 = URL(string: "https://fastly.jsdelivr.net/gh/Ethanhui6/lieguoji-web@main/\(ghEnc)") { candidates.append(u2) }
                            if let u3 = URL(string: "https://cdn.jsdelivr.net/gh/Ethanhui6/lieguoji-web@main/\(ghEnc)") { candidates.append(u3) }
                        }
                    }
                    if let origin = URL(string: "\(OnlinePlatform.apiBase)/api/v1/hotpack/file/\(encoded)") {
                        candidates.append(origin)
                    }
                    for url in candidates {
                        let host = url.host ?? ""
                        let isEdgeOrCDN = host.contains("pages.dev") || host.contains("jsdelivr")
                        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: isEdgeOrCDN ? 8 : 25)
                        req.setValue("gzip", forHTTPHeaderField: "Accept-Encoding")
                        if let (data, resp) = try? await s.data(for: req),
                           let http = resp as? HTTPURLResponse,
                           http.statusCode == 200,
                           !data.isEmpty {
                            let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                            if ct.contains("text/html") { continue }
                            do {
                                try FileManager.default.createDirectory(at: dst.deletingLastPathComponent(), withIntermediateDirectories: true)
                                try data.write(to: dst, options: .atomic)
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
    @Published private(set) var currentModuleName: String = ""
    @Published private(set) var statusMessage: String = ""
    @Published private(set) var errorMessage: String?
    @Published var showHotUpdateSheet = false

    /// 实时热加载生效的内容集合（免重装立即生效）
    @Published private(set) var extraScenarios: [HotScenarioPreset] = []
    @Published private(set) var extraMottos: [String] = []
    @Published private(set) var loreEntries: [HotLoreEntry] = []

    private var installedHashes: [String: String] = [:]
    private var updateTask: Task<Void, Never>?

    private let session: URLSession = {
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
    }

    nonisolated private static func defaultHotCDNs(base: String) -> [HotCDNNode] {
        let cleanBase = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return [
            HotCDNNode(id: "cf-edge", name: "Cloudflare 极速边缘", kind: .rawProxy, prefix: "https://lieguoji-edge.pages.dev/api/cdn/raw/", supportsRange: true),
            HotCDNNode(id: "cf-web", name: "Cloudflare 主站边缘", kind: .rawProxy, prefix: "https://lieguoji-web.pages.dev/api/cdn/raw/", supportsRange: true),
            HotCDNNode(id: "fastly", name: "Fastly 全球节点", kind: .rawProxy, prefix: "https://fastly.jsdelivr.net/gh/Ethanhui6/lieguoji-web@main/", supportsRange: true),
            HotCDNNode(id: "jsdelivr", name: "jsDelivr 节点", kind: .rawProxy, prefix: "https://cdn.jsdelivr.net/gh/Ethanhui6/lieguoji-web@main/", supportsRange: true),
            HotCDNNode(id: "tencent", name: "腾讯云兜底源", kind: .origin, prefix: "\(cleanBase)/api/v1/hotpack/file/", supportsRange: true)
        ]
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

    /// 1.5 秒并行竞速 5 路节点：按真实响应延迟排序，并直接剔除失效/超时 CDN，避免每个文件重复浪费 10 秒超时。
    nonisolated private static func raceHotCDNs(probeFile: HotPackFile, base: String, session: URLSession) async -> [HotCDNNode] {
        let all = defaultHotCDNs(base: base)
        let probePath = probeFile.path
        var results: [(HotCDNNode, Double)] = []

        await withTaskGroup(of: (HotCDNNode, Double?).self) { group in
            for node in all {
                group.addTask {
                    guard let url = Self.urlForPath(probePath, on: node) else { return (node, nil) }
                    var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 1.5)
                    req.setValue("gzip", forHTTPHeaderField: "Accept-Encoding")
                    let t0 = CFAbsoluteTimeGetCurrent()
                    do {
                        let (data, resp) = try await session.data(for: req)
                        guard let http = resp as? HTTPURLResponse, http.statusCode == 200, !data.isEmpty else {
                            return (node, nil)
                        }
                        let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                        if ct.contains("text/html") { return (node, nil) }
                        return (node, CFAbsoluteTimeGetCurrent() - t0)
                    } catch {
                        return (node, nil)
                    }
                }
            }
            for await (node, dt) in group {
                if let dt {
                    results.append((node, dt))
                }
            }
        }

        if results.isEmpty {
            // 极端弱网下 1.5s 全部未及返回时，保留 Cloudflare 边缘与腾讯云兜底，不直接放弃更新
            return all.filter { $0.id == "cf-edge" || $0.id == "cf-web" || $0.id == "tencent" }
        }

        results.sort { $0.1 < $1.1 }
        var ranked = results.map(\.0)
        // 始终保留源站兜底于队尾（防止管理员刚热更 hot-rules.json 导致镜像 SHA 未同步时单文件无法回源）
        if !ranked.contains(where: { $0.kind == .origin }), let origin = all.first(where: { $0.kind == .origin }) {
            ranked.append(origin)
        }
        return ranked
    }

    /// 大文件（≥ 3 MB，例如 11.7 MB 史诗配乐）4 路并发 HTTP Range 分片下载并严格 SHA256 校验。
    nonisolated private static func downloadRange4Streams(url: URL, expectedSize: Int64, expectedSHA: String, session: URLSession) async -> Data? {
        guard expectedSize >= 3_000_000 else { return nil }
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
        let okAll = await withTaskGroup(of: (Int, Data?).self, returning: Bool.self) { group in
            for (i, start, end) in slices {
                let wantLen = Int(end - start + 1)
                group.addTask {
                    var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 22)
                    req.setValue("bytes=\(start)-\(end)", forHTTPHeaderField: "Range")
                    req.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
                    do {
                        let (data, resp) = try await session.data(for: req)
                        guard let http = resp as? HTTPURLResponse,
                              http.statusCode == 206,
                              data.count == wantLen else {
                            return (i, nil)
                        }
                        return (i, data)
                    } catch {
                        return (i, nil)
                    }
                }
            }
            var success = true
            for await (i, data) in group {
                if let data {
                    parts[i] = data
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
        guard digest == expectedSHA else { return nil }
        return combined
    }

    nonisolated private static func downloadOne(_ file: HotPackFile, nodes: [HotCDNNode], session: URLSession) async -> (HotPackFile, Bool, String?) {
        let isLargeFile = file.size >= 3_000_000
        for (idx, node) in nodes.enumerated() {
            if Task.isCancelled { return (file, false, nil) }
            guard let url = Self.urlForPath(file.path, on: node) else { continue }

            // 大文件优先在优胜边缘节点上走 4 路 HTTP Range 并行拉取
            if isLargeFile && node.supportsRange && idx == 0 {
                if let rangedData = await Self.downloadRange4Streams(url: url, expectedSize: file.size, expectedSHA: file.sha256, session: session) {
                    do {
                        let dst = rootURL.appendingPathComponent(file.path)
                        try FileManager.default.createDirectory(at: dst.deletingLastPathComponent(), withIntermediateDirectories: true)
                        try rangedData.write(to: dst, options: .atomic)
                        return (file, true, node.name)
                    } catch {
                        return (file, false, nil)
                    }
                }
            }

            let timeout: TimeInterval = node.kind == .origin ? 30 : (isLargeFile ? 25 : 10)
            var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
            req.setValue("gzip", forHTTPHeaderField: "Accept-Encoding")
            do {
                let (data, resp) = try await session.data(for: req)
                guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { continue }
                let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
                guard digest == file.sha256 else { continue }
                let dst = rootURL.appendingPathComponent(file.path)
                try FileManager.default.createDirectory(at: dst.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: dst, options: .atomic)
                return (file, true, node.name)
            } catch {
                if Task.isCancelled { return (file, false, nil) }
                continue
            }
        }
        return (file, false, nil)
    }

    /// 启动 12 路自适应竞速流水线满速热更新（1.5s 边缘竞速剔除死节点 + 12 路并发 + 大文件 4 路 Range 分片 + SHA256 严格校验）。
    func startHotUpdate(onApplied: (() async -> Void)? = nil) {
        guard !updating, let m = manifest, !pendingFiles.isEmpty else { return }
        updating = true
        errorMessage = nil
        progress = 0
        downloadedBytes = 0
        speedBytesPerSec = 0
        activeCDNName = ""
        statusMessage = "正在 1.5s 竞速择优边缘 CDN 节点…"
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
        let probeCandidate = m.files.first(where: { $0.path == "Content/hot-rules.json" }) ?? queue.first

        updateTask?.cancel()
        updateTask = Task { [weak self] in
            guard let self else { return }
            let dlSession = self.session

            let rankedNodes: [HotCDNNode]
            if let probe = probeCandidate {
                rankedNodes = await Self.raceHotCDNs(probeFile: probe, base: base, session: dlSession)
            } else {
                rankedNodes = Self.defaultHotCDNs(base: base)
            }

            if Task.isCancelled {
                self.updating = false
                self.statusMessage = "已暂停热更新（已完成部分已自动保存，随时可续传）"
                return
            }

            let winningNodeName = rankedNodes.first?.name ?? "腾讯云兜底源"
            self.activeCDNName = winningNodeName
            self.statusMessage = "已锁定极速节点「\(winningNodeName)」，正在 12 路并发下载…"

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
                    let f = queue[nextIdx]
                    nextIdx += 1
                    group.addTask { await Self.downloadOne(f, nodes: rankedNodes, session: dlSession) }
                }
                var lastPersistCount = 0
                for await (file, ok, usedNode) in group {
                    if ok {
                        self.installedHashes[file.path] = file.sha256
                        completedCount += 1
                        completedBytes += file.size
                        self.currentModuleName = moduleNames[file.module] ?? file.module
                        if let usedNode, !usedNode.isEmpty {
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
                        self.activeCDNName.isEmpty ? winningNodeName : self.activeCDNName,
                        self.currentModuleName,
                        completedCount,
                        queue.count,
                        Self.formatBytes(completedBytes),
                        Self.formatBytes(total),
                        self.speedBytesPerSec / 1_048_576.0
                    )
                    if nextIdx < queue.count && !Task.isCancelled {
                        let f = queue[nextIdx]
                        nextIdx += 1
                        group.addTask { await Self.downloadOne(f, nodes: rankedNodes, session: dlSession) }
                    }
                }
            }
            self.saveInstalledIndex()

            self.updating = false
            if Task.isCancelled {
                self.statusMessage = "已暂停热更新（已完成部分已自动保存，随时可续传）"
                _ = await self.checkManifest(autoPrompt: false)
                return
            }

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
    }

    func cancelHotUpdate() {
        updateTask?.cancel()
        updateTask = nil
    }

    /// 清除本地热更缓存（排错或释放空间用）
    func clearCache() {
        cancelHotUpdate()
        try? FileManager.default.removeItem(at: Self.rootURL)
        installedHashes = [:]
        installedVersion = 0
        installedTag = ""
        installedTotalBytes = 0
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
