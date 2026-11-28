import Foundation
import CryptoKit
import SwiftUI
import LieguojiCore

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

    /// 持久化热更资源目录（位于 Application Support/LieguojiHotPack，系统永不自动清理，并自动标记不纳入 iCloud 备份）
    nonisolated static var rootURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("LieguojiHotPack", isDirectory: true)
    }

    nonisolated private static func excludeRootFromBackup() {
        var dir = rootURL
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? dir.setResourceValues(values)
    }

    nonisolated private static func availableDiskSpaceBytes() -> Int64? {
        let probe = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory())
        if let vals = try? probe.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
           let avail = vals.volumeAvailableCapacityForImportantUsage {
            return avail
        }
        if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: probe.path),
           let free = (attrs[.systemFreeSize] as? NSNumber)?.int64Value {
            return free
        }
        return nil
    }

    /// 经广州实测验证的中国大陆高速镜像池（已剔除 HTTP 403 失效 Cloudflare 节点，最快节点优先）
    nonisolated static let cdnMirrors: [(name: String, baseURL: String)] = [
        ("国内极速 CDN", "https://cdn.gh-proxy.org/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main"),
        ("香港极速专线", "https://hk.gh-proxy.org/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main"),
        ("腾讯云 EdgeOne 专线", "https://edgeone.gh-proxy.com/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main"),
        ("国内高速主线 A", "https://gh-proxy.com/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main"),
        ("国内高速主线 B", "https://gh-proxy.org/https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main"),
        ("Gcore 全球加速", "https://gcore.jsdelivr.net/gh/Ethanhui6/lieguoji-web@main"),
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

    /// 查找已通过 228MB Hotpack v5 下载落地的真实地理与五千年史典目录（支持 `HistoricalAtlas/` 与分模块目录）。
    nonisolated static func downloadedAtlasDirectoryURL() -> URL? {
        let fm = FileManager.default
        let candidates = [
            rootURL.appendingPathComponent("HistoricalAtlas", isDirectory: true),
            rootURL.appendingPathComponent("gis-basemaps-10m", isDirectory: true),
            rootURL.appendingPathComponent("gis-historical-45eras", isDirectory: true),
        ]
        for dir in candidates {
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: dir.path, isDirectory: &isDir), isDir.boolValue else { continue }
            if fm.fileExists(atPath: dir.appendingPathComponent("basemaps.bin").path)
                || fm.fileExists(atPath: dir.appendingPathComponent("scenarios_gis.bin").path)
                || fm.fileExists(atPath: dir.appendingPathComponent("cities_zh.json").path) {
                return dir
            }
        }
        return nil
    }

    /// 优先返回随新版本内置的最新 20K 权威 GIS 图集（防止旧版 v5 残留目录覆盖新版 12 剧本无人之地与国界），60K/120K 仍由 `HDMeshes/` 自动叠加生效。
    nonisolated static func bestAtlasDirectoryURL() -> URL? {
        if let bundled = Bundle.main.url(forResource: "HistoricalAtlas", withExtension: nil) {
            return bundled
        }
        return downloadedAtlasDirectoryURL()
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

    nonisolated private static func atomicMoveTemp(_ tmp: URL, to dst: URL) throws {
        let fm = FileManager.default
        let dir = dst.deletingLastPathComponent()
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        if fm.fileExists(atPath: dst.path) {
            _ = try fm.replaceItemAt(dst, withItemAt: tmp)
        } else {
            try fm.moveItem(at: tmp, to: dst)
        }
    }

    /// 流式分块计算磁盘文件 SHA256（256 KB 缓冲，228MB 大包校验零内存尖峰）。
    nonisolated private static func sha256OfFile(at url: URL) -> String? {
        guard let fh = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? fh.close() }
        var hasher = SHA256()
        while true {
            let chunk: Data
            do {
                guard let read = try fh.read(upToCount: 262_144), !read.isEmpty else { break }
                chunk = read
            } catch {
                return nil
            }
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// 大文件流式随机偏移落盘句柄（支持 `.part` 真实断点续传写入，内存占用恒定 < 10 MB）。
    private final class StreamingDiskWriter: @unchecked Sendable {
        private let lock = NSLock()
        private var handle: FileHandle?
        private var closed = false

        init(fileURL: URL, totalSize: Int64, resume: Bool = false) throws {
            let fm = FileManager.default
            try fm.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            if resume,
               fm.fileExists(atPath: fileURL.path),
               let attrs = try? fm.attributesOfItem(atPath: fileURL.path),
               let curSize = (attrs[.size] as? NSNumber)?.int64Value,
               curSize == totalSize {
                self.handle = try FileHandle(forUpdating: fileURL)
                return
            }
            if fm.fileExists(atPath: fileURL.path) { try fm.removeItem(at: fileURL) }
            guard fm.createFile(atPath: fileURL.path, contents: nil) else {
                throw NSError(domain: "HotPackManager.DiskWriter", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法创建热更临时文件"])
            }
            let fh = try FileHandle(forWritingTo: fileURL)
            do {
                try fh.truncate(atOffset: UInt64(max(0, totalSize)))
            } catch {
                try? fh.close()
                try? fm.removeItem(at: fileURL)
                throw error
            }
            self.handle = fh
        }

        deinit { close() }

        func write(_ data: Data, at offset: Int64) throws {
            lock.lock()
            defer { lock.unlock() }
            guard !closed, let fh = handle else {
                throw NSError(domain: "HotPackManager.DiskWriter", code: 2, userInfo: [NSLocalizedDescriptionKey: "热更临时句柄已关闭"])
            }
            try fh.seek(toOffset: UInt64(offset))
            try fh.write(contentsOf: data)
        }

        func close() {
            lock.lock()
            defer { lock.unlock() }
            guard !closed else { return }
            closed = true
            if let fh = handle {
                try? fh.synchronize()
                try? fh.close()
                handle = nil
            }
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
                        // v12.0.0：历史事件画卷与名将肖像支持零热更联网按需自动缓存！
                        // 1) 优先直拉广州行宫 18KB 极速压缩版 JPEG（国内 <150ms 秒出图）；
                        // 2) 兜底自动回退至 GitHub Release hotpack-v7 五路满速 CDN 镜像（EventScrolls__*.png）。
                        if top == "EventScrolls" || top == "GeneralPortraits" {
                            if let originFast = URL(string: "\(OnlinePlatform.apiBase)/api/v1/hotpack/file/\(encoded)") {
                                candidates.append(originFast)
                            }
                            let stem = (rest as NSString).deletingPathExtension
                            let flatAsset = "\(top)__\(stem).png"
                            let flatEnc = flatAsset.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? flatAsset
                            let releaseBase = "https://github.com/Ethanhui6/lieguoji-web/releases/download/hotpack-v7/\(flatEnc)"
                            for prefix in [
                                "https://cdn.gh-proxy.org/",
                                "https://edgeone.gh-proxy.com/",
                                "https://gh-proxy.com/",
                                "https://gh-proxy.org/",
                                ""
                            ] {
                                if let u = URL(string: "\(prefix)\(releaseBase)") {
                                    candidates.append(u)
                                }
                            }
                        } else {
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
                    }
                    if let origin = URL(string: "\(OnlinePlatform.apiBase)/api/v1/hotpack/file/\(encoded)"),
                       !candidates.contains(origin) {
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
    /// 玩家可按模块自由勾选下载（默认全选 228MB+ 全量 GIS 与典藏模块，亦可单独挑选地貌/45纪元国界/7,342城百科）。
    @Published var selectedModuleIds: Set<String> = []
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

    /// 已生效资产实时自检项（实测磁盘与内存/GPU 挂载状态，杜绝“更新完像没生效”的黑盒感）
    struct ActiveAssetCheck: Identifiable, Equatable, Sendable {
        let id: String
        let title: String
        let detail: String
        let active: Bool
        let sizeBytes: Int64
    }
    @Published private(set) var activeAssetReport: [ActiveAssetCheck] = []
    @Published private(set) var mountedActiveBytes: Int64 = 0

    private var installedHashes: [String: String] = [:]
    private var updateGeneration: UInt64 = 0
    private nonisolated let taskBox = HotTaskBox()

    private nonisolated let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.httpMaximumConnectionsPerHost = 12
        cfg.timeoutIntervalForRequest = 24
        cfg.timeoutIntervalForResource = 600
        return URLSession(configuration: cfg)
    }()

    var hasPendingUpdate: Bool { !pendingFiles.isEmpty }
    var pendingSummaryText: String {
        "\(pendingFiles.count) 项资源 · \(Self.formatBytes(pendingBytes))"
    }
    func isModuleSelected(_ moduleId: String) -> Bool {
        selectedModuleIds.isEmpty || selectedModuleIds.contains(moduleId)
    }
    func toggleModule(_ moduleId: String) {
        if selectedModuleIds.isEmpty, let m = manifest {
            selectedModuleIds = Set(m.modules.map(\.id))
        }
        if selectedModuleIds.contains(moduleId) {
            selectedModuleIds.remove(moduleId)
        } else {
            selectedModuleIds.insert(moduleId)
        }
    }
    func selectAllModules() {
        if let m = manifest {
            selectedModuleIds = Set(m.modules.map(\.id))
        }
    }
    var selectedPendingFiles: [HotPackFile] {
        guard !selectedModuleIds.isEmpty else { return pendingFiles }
        return pendingFiles.filter { selectedModuleIds.contains($0.module) }
    }
    var selectedPendingBytes: Int64 {
        selectedPendingFiles.reduce(0) { $0 + $1.size }
    }
    var selectedPendingSummaryText: String {
        "\(selectedPendingFiles.count) 项资源 · \(Self.formatBytes(selectedPendingBytes))"
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
        if bytes >= 1_073_741_824 { return String(format: "%.2f GB", Double(bytes) / 1_073_741_824.0) }
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
            if selectedModuleIds.isEmpty {
                selectedModuleIds = Set(m.modules.map(\.id))
            }

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
            cooldownUntil[nodeID] = CFAbsoluteTimeGetCurrent() + (fails >= 2 ? 30.0 : 10.0)
            lock.unlock()
        }

        func isCoolingDown(nodeID: String) -> Bool {
            lock.lock()
            defer { lock.unlock() }
            return (cooldownUntil[nodeID] ?? 0) > CFAbsoluteTimeGetCurrent()
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
                name: "腾讯云源站专线",
                kind: .origin,
                prefix: "\(cleanBase)/api/v1/hotpack/download/",
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
            if ["Music", "Art", "Video", "Engine", "Catalog", "World", "Audio", "HistoricalAtlas"].contains(top) {
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

    /// 合并清单内声明的 `cdnUrls`（支持 228MB Hotpack v5 GitHub Release / EdgeOne / Cloudflare / 腾讯云直链）与动态竞速镜像池，自动去重。
    nonisolated private static func candidateURLs(
        for file: HotPackFile,
        nodes: [HotCDNNode],
        originBase: String
    ) -> [(nodeId: String, name: String, url: URL, isOrigin: Bool, supportsRange: Bool)] {
        var out: [(nodeId: String, name: String, url: URL, isOrigin: Bool, supportsRange: Bool)] = []
        var originDeferred: [(nodeId: String, name: String, url: URL, isOrigin: Bool, supportsRange: Bool)] = []
        var seen = Set<String>()

        func append(_ nodeId: String, _ name: String, _ url: URL, isOrigin: Bool, supportsRange: Bool) {
            let key = url.absoluteString
            guard !seen.contains(key) else { return }
            seen.insert(key)
            let item = (nodeId, name, url, isOrigin, supportsRange)
            if isOrigin {
                originDeferred.append(item)
            } else {
                out.append(item)
            }
        }

        // 1) 优先匹配高速测速池节点（针对常规仓库内资源）
        for node in nodes where node.kind == .rawProxy {
            if let u = urlForPath(file.path, on: node) {
                append(node.id, node.name, u, isOrigin: false, supportsRange: node.supportsRange)
            }
        }

        let topDir = file.path.split(separator: "/").first.map { String($0).lowercased() } ?? ""
        let isExternalReleaseAsset = [
            "hdmeshes", "relieftiles", "encyclopedia", "eraunits",
            "eventscrolls", "generalportraits", "audiohd", "eras45"
        ].contains(topDir) && !(file.cdnUrls?.isEmpty ?? true)

        // 2) 纳入清单下发的多镜像 `cdnUrls`（按实时测速胜出主机排序，剔除超时死节点与 VPS 404 回源）
        if let manifestURLs = file.cdnUrls {
            let rankedHosts = nodes.compactMap { URL(string: $0.prefix)?.host?.lowercased() }
            let sortedRaw = manifestURLs.enumerated().sorted { a, b in
                let ha = URL(string: a.element.trimmingCharacters(in: .whitespacesAndNewlines))?.host?.lowercased() ?? ""
                let hb = URL(string: b.element.trimmingCharacters(in: .whitespacesAndNewlines))?.host?.lowercased() ?? ""
                let ia = rankedHosts.firstIndex(of: ha) ?? 99
                let ib = rankedHosts.firstIndex(of: hb) ?? 99
                if ia != ib { return ia < ib }
                return a.offset < b.offset
            }
            for (idx, raw) in sortedRaw {
                let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                guard let u = URL(string: trimmed) else { continue }
                let host = (u.host ?? "").lowercased()
                if host.contains("ghfast.top") || host.contains("lieguoji-edge.pages.dev") || host.contains("lieguoji-web.pages.dev") { continue }
                let isOrigin = host.contains("111.230.153.235") || trimmed.contains("/api/v1/hotpack/")
                if isExternalReleaseAsset && isOrigin { continue }
                let label = OnlinePlatform.mirrorLabel(for: trimmed)
                append("manifest-\(idx)-\(host)", label, u, isOrigin: isOrigin, supportsRange: true)
            }
        }

        // 3) 源站双路径兜底（仅用于托管在 VPS 磁盘的轻量动态资源；2GB GitHub Release 大包不落 VPS 磁盘，避免无意义的 404 回源重试）
        if !isExternalReleaseAsset {
            let cleanBase = originBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            let encodedPath = file.path
                .split(separator: "/")
                .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
                .joined(separator: "/")
            if let dl = URL(string: "\(cleanBase)/api/v1/hotpack/download/\(encodedPath)") {
                append("tencent-origin-dl", "腾讯云源站专线", dl, isOrigin: true, supportsRange: true)
            }
            if let legacy = URL(string: "\(cleanBase)/api/v1/hotpack/file/\(encodedPath)") {
                append("tencent-origin-file", "腾讯云源站兜底", legacy, isOrigin: true, supportsRange: true)
            }
        }
        return out + originDeferred
    }

    /// 轻量吞吐测速（探测 World/cultures.json 53 KB，避免 raw.githubusercontent.com 忽略 Range 全量回吐 2.9 MB engine.js 导致测速超时）：严格按实测 MB/s 降序排列，Top 3 组建高速多镜像池。
    nonisolated private static func raceHotCDNs(base: String) async -> (fast: [HotCDNNode], backups: [HotCDNNode]) {
        let all = defaultHotCDNs(base: base)
        let externalNodes = all.filter { $0.kind == .rawProxy }
        let originNode = all.first(where: { $0.kind == .origin })
        let probePath = "World/cultures.json"

        let probeCfg = URLSessionConfiguration.ephemeral
        probeCfg.timeoutIntervalForRequest = 2.5
        probeCfg.timeoutIntervalForResource = 3.2
        probeCfg.waitsForConnectivity = false
        probeCfg.httpMaximumConnectionsPerHost = 6
        let probeSession = URLSession(configuration: probeCfg)
        defer { probeSession.invalidateAndCancel() }

        var measured: [HotCDNNode] = []
        await withTaskGroup(of: HotCDNNode?.self) { group in
            for node in externalNodes {
                group.addTask {
                    guard let url = Self.urlForPath(probePath, on: node) else { return nil }
                    var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 2.5)
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
                    // 拿到 3 个有效国内高速镜像即立刻结束竞速（< 0.5 秒起跑，绝不干等慢节点超时）
                    if measured.count >= 3 {
                        group.cancelAll()
                        break
                    }
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

    private struct ResumePartMeta: Codable, Sendable {
        let sha256: String
        let size: Int64
        let chunkBytes: Int64
        var done: [Int]
    }

    private final class ResumeMetaStore: @unchecked Sendable {
        private let lock = NSLock()
        private let metaURL: URL
        private let sha256: String
        private let size: Int64
        private let chunkBytes: Int64
        private var doneSet: Set<Int>
        private var dirtyCount = 0

        init(metaURL: URL, sha256: String, size: Int64, chunkBytes: Int64, initialDone: Set<Int>) {
            self.metaURL = metaURL
            self.sha256 = sha256
            self.size = size
            self.chunkBytes = chunkBytes
            self.doneSet = initialDone
        }

        func markDone(_ idx: Int) {
            var snapshot: ResumePartMeta?
            lock.lock()
            doneSet.insert(idx)
            dirtyCount += 1
            if dirtyCount >= 8 {
                dirtyCount = 0
                snapshot = ResumePartMeta(sha256: sha256, size: size, chunkBytes: chunkBytes, done: Array(doneSet).sorted())
            }
            lock.unlock()
            if let snapshot, let data = try? JSONEncoder().encode(snapshot) {
                try? data.write(to: metaURL, options: .atomic)
            }
        }

        func flush() {
            lock.lock()
            let shouldWrite = dirtyCount > 0 || !doneSet.isEmpty
            dirtyCount = 0
            let snapshot = ResumePartMeta(sha256: sha256, size: size, chunkBytes: chunkBytes, done: Array(doneSet).sorted())
            lock.unlock()
            if shouldWrite, let data = try? JSONEncoder().encode(snapshot) {
                try? data.write(to: metaURL, options: .atomic)
            }
        }
    }

    /// 中大文件（≥ 1 MB）多镜像 4 路并发 HTTP Range 真实断点续传（`.part` + `.meta` 分片位图持久化）+ 流式 SHA256 校验。
    nonisolated private static func downloadLargeFileRangeStreaming(
        file: HotPackFile,
        candidates: [(nodeId: String, name: String, url: URL, isOrigin: Bool, supportsRange: Bool)],
        pool: HotMirrorPool,
        session: URLSession,
        onBytes: @escaping @Sendable (Int64) -> Void
    ) async -> String? {
        let expectedSize = file.size
        guard expectedSize >= 1_048_576 else { return nil }
        let rangeCandidates = candidates.filter(\.supportsRange)
        guard !rangeCandidates.isEmpty else { return nil }

        let dst = rootURL.appendingPathComponent(file.path)
        let dir = dst.deletingLastPathComponent()
        let partURL = dir.appendingPathComponent(".\(dst.lastPathComponent).part")
        let metaURL = dir.appendingPathComponent(".\(dst.lastPathComponent).meta")

        // 1–8 MB 文件用 512 KB 分片，≥ 8 MB 大图集用 1 MB 分片（每文件最多 4 路并发，配合 2 文件并发 = 8 连接 ≤ 12 宿主上限，告别连接池饥饿）
        let chunkBytes: Int64 = expectedSize >= 8_000_000 ? 1_048_576 : 524_288
        var allSlices: [(idx: Int, start: Int64, end: Int64)] = []
        var offset: Int64 = 0
        var sIdx = 0
        while offset < expectedSize {
            let end = min(expectedSize - 1, offset + chunkBytes - 1)
            allSlices.append((sIdx, offset, end))
            offset = end + 1
            sIdx += 1
        }
        guard allSlices.count >= 2 else { return nil }

        let fm = FileManager.default
        var resumedDone = Set<Int>()
        var canResume = false
        if fm.fileExists(atPath: partURL.path),
           let attrs = try? fm.attributesOfItem(atPath: partURL.path),
           let diskSz = (attrs[.size] as? NSNumber)?.int64Value,
           diskSz == expectedSize,
           let rawMeta = try? Data(contentsOf: metaURL),
           let parsed = try? JSONDecoder().decode(ResumePartMeta.self, from: rawMeta),
           parsed.sha256 == file.sha256,
           parsed.size == expectedSize,
           parsed.chunkBytes == chunkBytes {
            resumedDone = Set(parsed.done.filter { $0 >= 0 && $0 < allSlices.count })
            canResume = true
        } else {
            try? fm.removeItem(at: metaURL)
        }

        let writer: StreamingDiskWriter
        do {
            writer = try StreamingDiskWriter(fileURL: partURL, totalSize: expectedSize, resume: canResume)
        } catch {
            return nil
        }

        let metaStore = ResumeMetaStore(
            metaURL: metaURL,
            sha256: file.sha256,
            size: expectedSize,
            chunkBytes: chunkBytes,
            initialDone: resumedDone
        )

        var alreadyBytes: Int64 = 0
        var missingSlices: [(idx: Int, start: Int64, end: Int64)] = []
        for s in allSlices {
            if resumedDone.contains(s.idx) {
                alreadyBytes += (s.end - s.start + 1)
            } else {
                missingSlices.append(s)
            }
        }
        if alreadyBytes > 0 {
            onBytes(alreadyBytes)
        }

        var usedNodeName = rangeCandidates[0].name
        var reportedBytes: Int64 = alreadyBytes

        if !missingSlices.isEmpty {
            final class SliceCursor: @unchecked Sendable {
                private let lock = NSLock()
                private let items: [(idx: Int, start: Int64, end: Int64)]
                private var pos = 0
                init(_ items: [(idx: Int, start: Int64, end: Int64)]) { self.items = items }
                func next() -> (idx: Int, start: Int64, end: Int64)? {
                    lock.lock(); defer { lock.unlock() }
                    guard pos < items.count else { return nil }
                    let item = items[pos]; pos += 1; return item
                }
            }
            let cursor = SliceCursor(missingSlices)
            let workers = min(4, missingSlices.count)

            let okAll = await withTaskGroup(of: (Bool, String?, Int64).self, returning: Bool.self) { group in
                for w in 0..<workers {
                    group.addTask {
                        var workerLastName: String? = nil
                        var workerBytes: Int64 = 0
                        while let slice = cursor.next() {
                            if Task.isCancelled { return (false, workerLastName, workerBytes) }
                            let wantLen = Int(slice.end - slice.start + 1)
                            let healthyExternal = rangeCandidates.filter { !$0.isOrigin && !pool.isCoolingDown(nodeID: $0.nodeId) }
                            let coolingExternal = rangeCandidates.filter { !$0.isOrigin && pool.isCoolingDown(nodeID: $0.nodeId) }
                            let origins = rangeCandidates.filter(\.isOrigin)
                            var ordered: [(nodeId: String, name: String, url: URL, isOrigin: Bool, supportsRange: Bool)] = []
                            if !healthyExternal.isEmpty {
                                let rot = (slice.idx + w) % healthyExternal.count
                                for k in 0..<healthyExternal.count {
                                    ordered.append(healthyExternal[(rot + k) % healthyExternal.count])
                                }
                            }
                            ordered.append(contentsOf: origins)
                            ordered.append(contentsOf: coolingExternal)
                            var sliceDone = false
                            for cand in ordered {
                                if Task.isCancelled { return (false, workerLastName, workerBytes) }
                                var req = URLRequest(url: cand.url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: cand.isOrigin ? 28 : 12)
                                req.setValue("bytes=\(slice.start)-\(slice.end)", forHTTPHeaderField: "Range")
                                req.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
                                do {
                                    let (data, resp) = try await session.data(for: req)
                                    guard let http = resp as? HTTPURLResponse,
                                          http.statusCode == 206,
                                          data.count == wantLen else {
                                        pool.reportFailure(nodeID: cand.nodeId)
                                        continue
                                    }
                                    let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                                    if ct.contains("text/html") {
                                        pool.reportFailure(nodeID: cand.nodeId)
                                        continue
                                    }
                                    try writer.write(data, at: slice.start)
                                    metaStore.markDone(slice.idx)
                                    pool.reportSuccess(nodeID: cand.nodeId)
                                    workerLastName = cand.name
                                    workerBytes += Int64(wantLen)
                                    onBytes(Int64(wantLen))
                                    sliceDone = true
                                    break
                                } catch {
                                    if Task.isCancelled { return (false, workerLastName, workerBytes) }
                                    pool.reportFailure(nodeID: cand.nodeId)
                                }
                            }
                            if !sliceDone {
                                return (false, workerLastName, workerBytes)
                            }
                        }
                        return (true, workerLastName, workerBytes)
                    }
                }
                var success = true
                for await (ok, name, got) in group {
                    reportedBytes += got
                    if let name { usedNodeName = name }
                    if !ok {
                        success = false
                        group.cancelAll()
                    }
                }
                return success
            }

            metaStore.flush()
            writer.close()
            if !okAll || Task.isCancelled {
                // 保留 .part 与 .meta 供下次一键秒级断点续传（绝不清空已下完的数百 MB 数据！）
                if !Task.isCancelled && reportedBytes > 0 { onBytes(-reportedBytes) }
                return nil
            }
        } else {
            writer.close()
        }

        let digest = Self.sha256OfFile(at: partURL)
        guard digest == file.sha256 else {
            if reportedBytes > 0 { onBytes(-reportedBytes) }
            try? fm.removeItem(at: partURL)
            try? fm.removeItem(at: metaURL)
            return nil
        }
        do {
            try Self.atomicMoveTemp(partURL, to: dst)
            try? fm.removeItem(at: metaURL)
            return usedNodeName
        } catch {
            if reportedBytes > 0 { onBytes(-reportedBytes) }
            try? fm.removeItem(at: partURL)
            try? fm.removeItem(at: metaURL)
            return nil
        }
    }

    nonisolated private static func downloadOne(
        _ file: HotPackFile,
        slot: Int,
        pool: HotMirrorPool,
        originBase: String,
        session: URLSession,
        onBytes: @escaping @Sendable (Int64) -> Void
    ) async -> (HotPackFile, Bool, String?) {
        let isLargeFile = file.size >= 1_048_576
        let nodes = pool.orderedNodes(forSlot: slot)
        let candidates = Self.candidateURLs(for: file, nodes: nodes, originBase: originBase)
        let dst = rootURL.appendingPathComponent(file.path)

        // 中大文件（≥ 1 MB）优先走多镜像 4 路并发 HTTP Range 真实断点续传 + 流式 SHA256 校验
        if isLargeFile {
            if let usedName = await Self.downloadLargeFileRangeStreaming(
                file: file,
                candidates: candidates,
                pool: pool,
                session: session,
                onBytes: onBytes
            ) {
                return (file, true, usedName)
            }
            if Task.isCancelled { return (file, false, nil) }
        }

        for cand in candidates {
            if Task.isCancelled { return (file, false, nil) }
            let timeout: TimeInterval = cand.isOrigin ? (isLargeFile ? 90 : 30) : (isLargeFile ? 60 : 14)
            var req = URLRequest(url: cand.url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
            req.setValue(isLargeFile ? "identity" : "gzip", forHTTPHeaderField: "Accept-Encoding")
            do {
                if isLargeFile {
                    // 流式直接落盘（不经 Data 内存缓冲），适合数十 MB GIS 图集文件
                    let (tempFileURL, resp) = try await session.download(for: req)
                    guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
                        try? FileManager.default.removeItem(at: tempFileURL)
                        pool.reportFailure(nodeID: cand.nodeId)
                        continue
                    }
                    let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                    if ct.contains("text/html") {
                        try? FileManager.default.removeItem(at: tempFileURL)
                        pool.reportFailure(nodeID: cand.nodeId)
                        continue
                    }
                    let digest = Self.sha256OfFile(at: tempFileURL)
                    guard digest == file.sha256 else {
                        try? FileManager.default.removeItem(at: tempFileURL)
                        pool.reportFailure(nodeID: cand.nodeId)
                        continue
                    }
                    if Task.isCancelled {
                        try? FileManager.default.removeItem(at: tempFileURL)
                        return (file, false, nil)
                    }
                    try Self.atomicMoveTemp(tempFileURL, to: dst)
                    pool.reportSuccess(nodeID: cand.nodeId)
                    onBytes(file.size)
                    return (file, true, cand.name)
                } else {
                    let (data, resp) = try await session.data(for: req)
                    guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
                        pool.reportFailure(nodeID: cand.nodeId)
                        continue
                    }
                    let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                    if ct.contains("text/html") {
                        pool.reportFailure(nodeID: cand.nodeId)
                        continue
                    }
                    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
                    guard digest == file.sha256 else {
                        pool.reportFailure(nodeID: cand.nodeId)
                        continue
                    }
                    if Task.isCancelled { return (file, false, nil) }
                    try Self.atomicWrite(data, to: dst)
                    pool.reportSuccess(nodeID: cand.nodeId)
                    onBytes(file.size)
                    return (file, true, cand.name)
                }
            } catch {
                if Task.isCancelled { return (file, false, nil) }
                pool.reportFailure(nodeID: cand.nodeId)
                continue
            }
        }
        return (file, false, nil)
    }

    /// 启动多镜像流式热更新（支持 228MB+ Hotpack v5 按模块勾选下载、大文件流式写盘与实时 MB 进度更新 + 严格 SHA256 校验）。
    func startHotUpdate(modules: Set<String>? = nil, onApplied: (() async -> Void)? = nil) {
        let targetFilter = modules ?? (selectedModuleIds.isEmpty ? nil : selectedModuleIds)
        let targetFiles: [HotPackFile] = {
            guard let filter = targetFilter, !filter.isEmpty else { return pendingFiles }
            return pendingFiles.filter { filter.contains($0.module) }
        }()
        guard !updating, let m = manifest, !targetFiles.isEmpty else { return }
        let targetBytes = targetFiles.reduce(Int64(0)) { $0 + $1.size }
        let total = max(1, targetBytes)
        Self.excludeRootFromBackup()
        if let freeBytes = Self.availableDiskSpaceBytes(), freeBytes < total + 200_000_000 {
            errorMessage = "设备可用存储空间不足（剩余 \(Self.formatBytes(freeBytes))，本次同步需预留约 \(Self.formatBytes(total + 200_000_000))），请清理空间后重试"
            statusMessage = "存储空间不足，已取消下载"
            GameFeel.shared.notify(.warning)
            return
        }
        updating = true
        errorMessage = nil
        progress = 0
        downloadedBytes = 0
        speedBytesPerSec = 0
        activeCDNName = ""
        rankedFastMirrors = []
        statusMessage = "正在 256KB 实测各国内高速镜像吞吐（MB/s）…"

        // 优先下载轻量核心包、高精网格与 45 纪元剧本，再并行拉取 8K–16K 卫星地貌瓦片与高清音画
        let priority: [String: Int] = [
            "content": 0, "scenarios": 0, "rules": 0, "lore": 1, "catalog": 1, "world": 2,
            "hd-meshes": 2, "eras-45": 3, "encyclopedia": 4, "era-units": 5,
            "gis-basemaps-10m": 3, "gis-historical-45eras": 4, "gis-cities-encyclopedia": 5,
            "audio-hd": 6, "relief-tiles": 7,
            "video": 8, "engine": 9, "art": 10, "audio": 11, "music": 12
        ]
        let queue = targetFiles.sorted {
            let pa = priority[$0.module] ?? 9, pb = priority[$1.module] ?? 9
            if pa != pb { return pa < pb }
            return $0.size < $1.size
        }
        let moduleNames = Dictionary(uniqueKeysWithValues: m.modules.map { ($0.id, $0.name) })
        let base = OnlinePlatform.apiBase
        let hasVeryLargeFiles = queue.contains { $0.size >= 10_000_000 }

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
                routeBanner = fastNodes.first?.name ?? backupNodes.first?.name ?? "腾讯云源站专线"
            }
            self.activeCDNName = routeBanner
            // 2 个大文件 × 4 路分片 = 8 并发连接（严守 httpMaximumConnectionsPerHost = 12 上限，彻底告别连接池排队与超时雪崩）
            let maxWorkers = hasVeryLargeFiles ? 2 : 8
            self.statusMessage = "已锁定「\(routeBanner)」，正在 \(maxWorkers) 路并发断点续传（\(Self.formatBytes(total))）…"

            final class ProgressAccumulator: @unchecked Sendable {
                private let lock = NSLock()
                private var bytes: Int64 = 0
                private var lastPublishAt: CFAbsoluteTime = 0
                func add(_ delta: Int64) -> (total: Int64, shouldPublish: Bool) {
                    lock.lock(); defer { lock.unlock() }
                    bytes = max(0, bytes + delta)
                    let now = CFAbsoluteTimeGetCurrent()
                    let publish = (now - lastPublishAt) >= 0.18
                    if publish { lastPublishAt = now }
                    return (bytes, publish)
                }
                func current() -> Int64 {
                    lock.lock(); defer { lock.unlock() }
                    return bytes
                }
            }
            let liveAcc = ProgressAccumulator()
            let startTime = CFAbsoluteTimeGetCurrent()
            var completedCount = 0
            var failed = 0
            var nextIdx = 0
            var speedSamples: [(Double, Int64)] = [(startTime, 0)]

            let publishProgress: @MainActor (Int64) -> Void = { [weak self] curBytes in
                guard let self, self.updateGeneration == runGen else { return }
                let clamped = min(total, max(0, curBytes))
                self.downloadedBytes = clamped
                self.progress = min(1.0, Double(clamped) / Double(total))
                let now = CFAbsoluteTimeGetCurrent()
                speedSamples.append((now, clamped))
                while speedSamples.count > 2 && (now - speedSamples[0].0) > 3.0 {
                    speedSamples.removeFirst()
                }
                let totalElapsed = max(0.12, now - startTime)
                let avgSpeed = Double(clamped) / totalElapsed
                let windowDt = now - speedSamples[0].0
                let instSpeed = windowDt >= 0.3 ? Double(max(0, clamped - speedSamples[0].1)) / windowDt : avgSpeed
                self.speedBytesPerSec = self.speedBytesPerSec > 0 ? (self.speedBytesPerSec * 0.4 + instSpeed * 0.6) : instSpeed
                let modLabel = self.currentModuleName.isEmpty ? "真实地理与典藏包" : self.currentModuleName
                self.statusMessage = "正在同步「\(modLabel)」· \(completedCount)/\(queue.count)"
            }

            let onBytesDelta: @Sendable (Int64) -> Void = { delta in
                let snap = liveAcc.add(delta)
                if snap.shouldPublish {
                    Task { @MainActor in publishProgress(snap.total) }
                }
            }

            await withTaskGroup(of: (HotPackFile, Bool, String?).self) { group in
                let initial = min(maxWorkers, queue.count)
                for _ in 0..<initial {
                    let slot = nextIdx
                    let f = queue[slot]
                    nextIdx += 1
                    group.addTask {
                        await Self.downloadOne(f, slot: slot, pool: mirrorPool, originBase: base, session: dlSession, onBytes: onBytesDelta)
                    }
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
                        self.currentModuleName = moduleNames[file.module] ?? file.module
                        if fastNodes.count < 2, let usedNode, !usedNode.isEmpty {
                            self.activeCDNName = usedNode
                        }
                    } else {
                        failed += 1
                    }
                    if completedCount - lastPersistCount >= 4 || nextIdx >= queue.count {
                        self.saveInstalledIndex()
                        lastPersistCount = completedCount
                    }
                    publishProgress(liveAcc.current())
                    if nextIdx < queue.count && !Task.isCancelled && self.updateGeneration == runGen {
                        let slot = nextIdx
                        let f = queue[slot]
                        nextIdx += 1
                        group.addTask {
                            await Self.downloadOne(f, slot: slot, pool: mirrorPool, originBase: base, session: dlSession, onBytes: onBytesDelta)
                        }
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

            // 重新计算剩余待同步文件（支持玩家仅勾选部分模块下载）
            let fm = FileManager.default
            var remain: [HotPackFile] = []
            var remainBytes: Int64 = 0
            for f in m.files {
                let dst = Self.rootURL.appendingPathComponent(f.path)
                if self.installedHashes[f.path] == f.sha256, fm.fileExists(atPath: dst.path) { continue }
                remain.append(f)
                remainBytes += f.size
            }
            self.pendingFiles = remain
            self.pendingBytes = remainBytes

            // 按模块记录已完整同步的包版本，解决「仅勾选部分模块下载后 installedVersion 不升级导致瓦片/百科无法挂载」的陷阱！
            for mod in m.modules {
                let modFiles = m.files.filter { $0.module == mod.id }
                if !modFiles.isEmpty && modFiles.allSatisfy({ f in
                    let dst = Self.rootURL.appendingPathComponent(f.path)
                    return self.installedHashes[f.path] == f.sha256 && fm.fileExists(atPath: dst.path)
                }) {
                    UserDefaults.standard.set(m.packVersion, forKey: "hotpack.moduleVersion.\(mod.id)")
                }
            }

            if failed == 0 {
                self.progress = 1.0
                if remain.isEmpty {
                    self.installedVersion = m.packVersion
                    self.installedTag = m.releaseTag
                    self.installedTotalBytes = m.totalBytes
                    UserDefaults.standard.set(m.packVersion, forKey: "hotpack.installedVersion")
                    UserDefaults.standard.set(m.releaseTag, forKey: "hotpack.installedTag")
                    UserDefaults.standard.set(Int(min(Int64(Int.max), m.totalBytes)), forKey: "hotpack.installedBytes")
                    self.statusMessage = "热更新已完成（\(m.releaseTag) · \(Self.formatBytes(m.totalBytes))），高精网格、25.6K 卫星地貌瓦片、纯净中文城市大典与时代音画已全部实时挂载生效"
                } else {
                    self.statusMessage = "所选模块已同步完成并实时挂载生效（尚余 \(remain.count) 项未选模块 · \(Self.formatBytes(remainBytes))）"
                }
                self.reloadHotContent()
                await onApplied?()
                GameFeel.shared.notify(.success)
            } else {
                self.errorMessage = "有 \(failed) 项资源校验未通过，可点击继续补全（已完成分片已自动保留，随时续传）"
                _ = await self.checkManifest(autoPrompt: false)
                GameFeel.shared.notify(.warning)
            }
        }
        taskBox.replace(newTask)
    }

    func cancelHotUpdate() {
        taskBox.cancel()
        DispatchQueue.global(qos: .utility).async {
            Self.cleanupOrphanTempFiles()
        }
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
        UserDefaults.standard.removeObject(forKey: "hotpack.moduleVersion.relief-tiles")
        UserDefaults.standard.removeObject(forKey: "hotpack.moduleVersion.encyclopedia")
        statusMessage = "已清理本地热更资源缓存"
    }

    /// 立即热加载本地已安装的 1 GB+ 全量模块（高精 60K/120K 网格、8K–16K 卫星瓦片、45 纪元剧本、50K 城市百科、6 时代兵模与高清交响音画，免换包免重启立即生效）。
    func reloadHotContent() {
        let dec = JSONDecoder()
        let fm = FileManager.default

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

        // 1. 挂载 6 时代高清兵模贴图目录并清理 Metal 兵模缓存
        let eraUnitsURL = Self.rootURL.appendingPathComponent("EraUnits", isDirectory: true)
        var isDir: ObjCBool = false
        if fm.fileExists(atPath: eraUnitsURL.path, isDirectory: &isDir), isDir.boolValue {
            UnitArt.hotPackEraUnitsRoot = eraUnitsURL
        } else {
            UnitArt.hotPackEraUnitsRoot = nil
        }
        MapRenderer.invalidateUnitTextureCache()

        // 2. 清理旧网格与美术缓存，使新下载的 60K/120K 网格立即进入可选档位
        InkPlayerHostView.clearCache()
        BundleArt.clearCache()
        NativeHost.invalidateCatalogCache()
        NativeHost.invalidateCreationInputsCache()

        // 3. 后台无阻塞挂载：8K–16K GPU 卫星瓦片金字塔 + 60K/120K GIS 底图 + 45 纪元国界库 + 纯正中文城市百科
        // 支持单模块勾选下载后独立挂载生效（同时仍拦截旧版 v6–v8 错位瓦片与旧版乱码城市表）
        let root = Self.rootURL
        let atlasFallback = Self.bestAtlasDirectoryURL()
        let activePackVer = installedVersion
        let reliefModVer = UserDefaults.standard.integer(forKey: "hotpack.moduleVersion.relief-tiles")
        let encModVer = UserDefaults.standard.integer(forKey: "hotpack.moduleVersion.encyclopedia")
        let allowRelief = (activePackVer >= 9 || reliefModVer >= 9)
        let allowEncyclopedia = (activePackVer >= 10 || encModVer >= 10)
        DispatchQueue.global(qos: .userInitiated).async {
            let tilesDir = root.appendingPathComponent("ReliefTiles", isDirectory: true)
            if allowRelief && fm.fileExists(atPath: tilesDir.path) {
                MapTileStreamer.shared.mountDirectory(tilesDir)
            } else {
                MapTileStreamer.shared.clearGPUCache()
            }
            if let atlasURL = atlasFallback {
                HistoricalBasemaps.loadAtlasDirectory(atlasURL)
            }
            let hdMeshDir = root.appendingPathComponent("HDMeshes", isDirectory: true)
            if fm.fileExists(atPath: hdMeshDir.path) {
                HistoricalBasemaps.loadAtlasDirectory(hdMeshDir)
            }
            let encDir = root.appendingPathComponent("Encyclopedia", isDirectory: true)
            if allowEncyclopedia && fm.fileExists(atPath: encDir.path) {
                HistoricalBasemaps.loadAtlasDirectory(encDir)
            }
            let erasDir = root.appendingPathComponent("Eras45", isDirectory: true)
            if fm.fileExists(atPath: erasDir.path) {
                HistoricalErasCatalog.loadDirectory(erasDir)
            }
            DispatchQueue.main.async {
                HotPackManager.shared.refreshActiveAssetReport()
                GameFeel.shared.reloadAudioEngine()
            }
        }
        refreshActiveAssetReport()
    }

    nonisolated private static func directorySize(_ dir: URL) -> (bytes: Int64, files: Int) {
        let fm = FileManager.default
        guard let en = fm.enumerator(at: dir, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey], options: [.skipsHiddenFiles]) else {
            return (0, 0)
        }
        var total: Int64 = 0
        var count = 0
        for case let u as URL in en {
            if let v = try? u.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]), v.isRegularFile == true {
                total += Int64(v.fileSize ?? 0)
                count += 1
            }
        }
        return (total, count)
    }

    /// 实时自检 v8.0.0（hotpack-v7 · 2.1 GB+）7 大零水分精绘模块的磁盘体积与内存/GPU 生效状态。
    func refreshActiveAssetReport() {
        let root = Self.rootURL
        let has60k = MeshCatalog.isAvailable(.high60K, hotPackRoot: root)
        let has120k = MeshCatalog.isAvailable(.ultra120K, hotPackRoot: root)
        let meshStat = Self.directorySize(root.appendingPathComponent("HDMeshes", isDirectory: true))
        let tileSummary = MapTileStreamer.shared.mountedSummary
        let encStat = Self.directorySize(root.appendingPathComponent("Encyclopedia", isDirectory: true))
        let cityCount = HistoricalBasemaps.globalCities().count
        let unitStat = Self.directorySize(root.appendingPathComponent("EraUnits", isDirectory: true))
        let scrollStat = Self.directorySize(root.appendingPathComponent("EventScrolls", isDirectory: true))
        let portraitStat = Self.directorySize(root.appendingPathComponent("GeneralPortraits", isDirectory: true))
        let audioStat = Self.directorySize(root.appendingPathComponent("AudioHD", isDirectory: true))
        let hasStudioV8 = FileManager.default.fileExists(atPath: root.appendingPathComponent("AudioHD/studio-master-v8.json").path)

        let meshDetail: String = (has60k && has120k)
            ? "已挂载 60K（1,200 州）与 120K（2,400 州）精绘拓扑及 12 剧本高精 GIS 国界"
            : (has60k ? "已挂载 60K（1,200 州）精绘拓扑" : "当前使用内置 20K 拓扑 · 下载即解锁 60K/120K 细密州郡")
        let tileDetail: String = tileSummary.regions > 0
            ? "Metal GPU 瓦片金字塔实时流式就绪：\(tileSummary.regions) 大战区 · \(tileSummary.tiles) 块 25.6K 级山川河谷瓦片"
            : "尚未挂载 · 下载即解锁 25.6K 级真实山脉河谷与深海地貌渲染"
        let encDetail: String = cityCount >= 10000
            ? "已挂载 \(cityCount) 座 100% 纯中文真实城市志与 6,000+ 历史将帅人物谱"
            : "当前内置 \(cityCount) 座城市 · 下载扩展至 15,000+ 纯中文真实地名与名将库"
        let unitDetail: String = unitStat.files > 0
            ? "已接管 Metal 兵模管线：\(unitStat.files) 套 6 时代高清军团与舰船贴图"
            : "当前使用程序化雕漆兵模 · 下载即随时代自动换装"
        let scrollDetail: String = scrollStat.files > 0
            ? "已挂载 \(scrollStat.files) 幅史实大事件古舆插画（德奥合并·九一八·闪击波兰·中途岛等）"
            : "尚未挂载 · 下载后历史大事件弹窗展示高清战史卷轴画卷"
        let portraitDetail: String = portraitStat.files > 0
            ? "已挂载 \(portraitStat.files) 枚史实名将与君主肖像徽章"
            : "尚未挂载 · 下载后军团与朝堂展示名将肖像徽章"
        let audioDetail: String = hasStudioV8
            ? "已接管 AVAudio 引擎：v8 工作室物理建模重制（\(audioStat.files) 条交响乐章与实感拟音）"
            : (audioStat.files > 0 ? "检测到旧版音频缓存，更新至 hotpack-v7 即刻切换重制交响母带" : "当前使用经典原作纯净原声 · 下载即解锁重制版时代交响")

        let rows: [ActiveAssetCheck] = [
            ActiveAssetCheck(id: "hd-meshes", title: "60K / 120K 精绘拓扑与 12 剧本 GIS 国界", detail: meshDetail, active: has60k || has120k, sizeBytes: meshStat.bytes),
            ActiveAssetCheck(id: "relief-tiles", title: "25.6K 真实山川河流 GPU 地形瓦片", detail: tileDetail, active: tileSummary.regions > 0, sizeBytes: tileSummary.bytes),
            ActiveAssetCheck(id: "encyclopedia", title: "100% 纯中文 15,000+ 城市与名将大典", detail: encDetail, active: encStat.bytes > 0 || cityCount >= 10000, sizeBytes: encStat.bytes),
            ActiveAssetCheck(id: "era-units", title: "6 时代高清兵模与战舰贴图", detail: unitDetail, active: unitStat.files > 0, sizeBytes: unitStat.bytes),
            ActiveAssetCheck(id: "event-scrolls", title: "50+ 真实历史大事件战史画卷", detail: scrollDetail, active: scrollStat.files > 0, sizeBytes: scrollStat.bytes),
            ActiveAssetCheck(id: "general-portraits", title: "48 位真实名将与统帅肖像徽章", detail: portraitDetail, active: portraitStat.files > 0, sizeBytes: portraitStat.bytes),
            ActiveAssetCheck(id: "audio-hd", title: "v8 工作室物理建模重制交响与实感拟音", detail: audioDetail, active: hasStudioV8, sizeBytes: audioStat.bytes),
        ]
        activeAssetReport = rows
        mountedActiveBytes = rows.reduce(0) { $0 + $1.sizeBytes }
    }
}
