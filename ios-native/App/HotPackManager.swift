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
        cfg.httpMaximumConnectionsPerHost = 6
        cfg.timeoutIntervalForRequest = 20
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
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
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

    /// 启动 4 路并发游戏内流式热更新（SHA256 逐文件校验 + 断点续传 + 完成即热加载生效，无需重启或换包）。
    func startHotUpdate(onApplied: (() async -> Void)? = nil) {
        guard !updating, let m = manifest, !pendingFiles.isEmpty else { return }
        updating = true
        errorMessage = nil
        progress = 0
        downloadedBytes = 0
        speedBytesPerSec = 0
        let queue = pendingFiles
        let total = max(1, pendingBytes)
        let moduleNames = Dictionary(uniqueKeysWithValues: m.modules.map { ($0.id, $0.name) })
        let base = OnlinePlatform.apiBase

        updateTask?.cancel()
        updateTask = Task { [weak self] in
            guard let self else { return }
            let startTime = Date()
            var completedCount = 0
            var completedBytes: Int64 = 0
            var failed = 0
            let batchSize = 4

            var cursor = 0
            while cursor < queue.count && !Task.isCancelled {
                let end = min(queue.count, cursor + batchSize)
                let slice = Array(queue[cursor..<end])
                cursor = end

                if let first = slice.first {
                    self.currentModuleName = moduleNames[first.module] ?? first.module
                }

                await withTaskGroup(of: (HotPackFile, Bool).self) { group in
                    for file in slice {
                        group.addTask { [session] in
                            let encodedPath = file.path
                                .split(separator: "/")
                                .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
                                .joined(separator: "/")
                            guard let url = URL(string: "\(base)/api/v1/hotpack/file/\(encodedPath)") else { return (file, false) }
                            var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
                            do {
                                let (data, resp) = try await session.data(for: req)
                                guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return (file, false) }
                                let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
                                guard digest == file.sha256 else { return (file, false) }
                                let dst = Self.rootURL.appendingPathComponent(file.path)
                                try FileManager.default.createDirectory(at: dst.deletingLastPathComponent(), withIntermediateDirectories: true)
                                try data.write(to: dst, options: .atomic)
                                return (file, true)
                            } catch {
                                return (file, false)
                            }
                        }
                    }
                    for await (file, ok) in group {
                        if ok {
                            self.installedHashes[file.path] = file.sha256
                            completedCount += 1
                            completedBytes += file.size
                        } else {
                            failed += 1
                        }
                    }
                }

                // 每批持久化索引，确保断网中途也能精确断点续传
                self.saveInstalledIndex()
                self.downloadedBytes = completedBytes
                self.progress = min(1.0, Double(completedBytes) / Double(total))
                let elapsed = max(0.15, Date().timeIntervalSince(startTime))
                self.speedBytesPerSec = Double(completedBytes) / elapsed
                self.statusMessage = String(
                    format: "正在更新「%@」%d/%d · %@ / %@ · %.1f MB/s",
                    self.currentModuleName,
                    completedCount,
                    queue.count,
                    Self.formatBytes(completedBytes),
                    Self.formatBytes(total),
                    self.speedBytesPerSec / 1_048_576.0
                )
            }

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
