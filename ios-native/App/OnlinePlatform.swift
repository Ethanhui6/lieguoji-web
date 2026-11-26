import Foundation
import Security
import SwiftUI
import UIKit
import LieguojiCore

// MARK: - 数据模型（严格与列国纪云端行宫服务器 /api/v1 协议一致）

struct OnlineRankInfo: Codable, Equatable {
    let level: Int
    let title: String
    let grade: String
    let exp: Int
    let levelMinExp: Int
    let nextExp: Int
    let nextTitle: String

    var progress: Double {
        guard nextExp > levelMinExp else { return 1.0 }
        return min(1.0, max(0.0, Double(exp - levelMinExp) / Double(nextExp - levelMinExp)))
    }
}

struct OnlineUser: Codable, Identifiable, Equatable {
    let id: String
    let username: String
    let nickname: String
    let bio: String
    let sealChar: String
    let sealStyle: String
    let role: String?
    let isAdmin: Bool?
    let isGuest: Bool
    let exp: Int
    let rank: OnlineRankInfo
    let checkinStreak: Int
    let totalCheckins: Int
    let checkedInToday: Bool
    let cloudSaveCount: Int
    let cloudSaveQuota: Int
    let unreadMailCount: Int
    let createdAt: Double

    var isAdminAccount: Bool { isAdmin == true || role == "admin" }
}

struct MirrorProbeResult: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let url: String
    let latencyMs: Int?
    let speedMBs: Double?
    let ok: Bool
    let supportsRange: Bool
    let contentLength: Int64

    init(
        id: String,
        name: String,
        url: String,
        latencyMs: Int?,
        speedMBs: Double?,
        ok: Bool,
        supportsRange: Bool = false,
        contentLength: Int64 = 0
    ) {
        self.id = id
        self.name = name
        self.url = url
        self.latencyMs = latencyMs
        self.speedMBs = speedMBs
        self.ok = ok
        self.supportsRange = supportsRange
        self.contentLength = contentLength
    }

    var label: String { name }
    var ttfbMs: Int { latencyMs ?? 0 }
    var speedMBps: Double { speedMBs ?? 0 }
    var speedText: String {
        guard ok else { return "暂不可达" }
        if let spd = speedMBs, spd >= 0.05 {
            return String(format: "%.1f MB/s", spd)
        }
        if let spd = speedMBs, spd > 0 {
            return "<0.1 MB/s"
        }
        return "连通正常"
    }
}

struct CloudChangelogEntry: Codable, Identifiable, Equatable, Sendable {
    var id: String { version }
    let version: String
    let build: Int?
    let date: String?
    let lines: [String]
}

struct AppUpdateInfo: Codable, Equatable, Sendable {
    let hasAppUpdate: Bool
    let forceUpdate: Bool
    let currentVersion: String
    let currentBuild: Int
    let latestVersion: String
    let latestBuild: Int
    let releaseDate: String
    let ipaSizeMB: Double
    let downloadUrl: String
    let directIpaUrl: String
    let webDownloadUrl: String
    let releaseNotes: [String]
    let ipaMirrors: [String]?

    var preferredExternalURL: URL? {
        if !webDownloadUrl.isEmpty, let u = URL(string: webDownloadUrl) { return u }
        if let first = ipaMirrors?.first(where: { !$0.isEmpty }), let u = URL(string: first) { return u }
        if !directIpaUrl.isEmpty, let u = URL(string: directIpaUrl) { return u }
        if !downloadUrl.isEmpty, let u = URL(string: downloadUrl) { return u }
        return nil
    }
}

struct ServerSnapshot: Codable, Equatable {
    let name: String
    let region: String
    let publicHost: String?
    let computeHost: String
    let computeOnline: Bool
    let computeGreeting: String?
    let onlineCount: Int
    let totalUsers: Int?
    let totalSaves: Int?
    let uptimeSeconds: Int?
    let maintenance: Bool?
    let maintenanceMessage: String?
    let serverTimeMs: Double

    var uptimeText: String {
        let secs = uptimeSeconds ?? 0
        let h = secs / 3600
        let d = h / 24
        if d > 0 { return "\(d) 天 \(h % 24) 时" }
        if h > 0 { return "\(h) 小时 \((secs % 3600) / 60) 分" }
        return "\(max(1, secs / 60)) 分钟"
    }
}

struct AdminOverview: Decodable {
    struct Compute: Decodable {
        let online: Bool
        let rttMs: Int?
        let playing: Bool
        let stepMs: Int
        let provinces: Int
        let clients: Int
    }
    struct Host: Decodable {
        let cpuLoad1m: Double
        let memUsedMB: Int
        let memTotalMB: Int
        let diskFreeGB: Double
        let diskTotalGB: Double
    }
    struct Security: Decodable {
        let blockedRequests: Int
        let scannerHits: Int
        let loginFailures: Int
        let activeBlockedIPs: Int
    }
    let name: String
    let region: String
    let onlineCount: Int
    let totalUsers: Int
    let totalSaves: Int
    let bannedUsers: Int
    let uptimeSeconds: Int
    let compute: Compute
    let host: Host
    let security: Security
    let maintenance: Bool
    let maintenanceMessage: String
    let hotpackVersion: Int
    let hotpackBytes: Int64
    let hotpackFiles: Int
    let notice: String
    let latestVersion: String
    let latestBuild: Int
    let forceUpdate: Bool
    let tuning: [String: Double]?
    let pace: [String: Int]?
}

struct AdminUserRow: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let nickname: String
    let sealChar: String
    let sealStyle: String
    let role: String
    let banned: Bool
    let isGuest: Bool
    let exp: Int
    let rankTitle: String
    let cloudSaveCount: Int
    let lastSeenAt: Double
}

private final class SafeDateFormatter: @unchecked Sendable {
    private let lock = NSLock()
    private let formatter: DateFormatter

    init(_ format: String) {
        let f = DateFormatter()
        f.dateFormat = format
        self.formatter = f
    }

    func string(from date: Date) -> String {
        lock.lock()
        defer { lock.unlock() }
        return formatter.string(from: date)
    }
}

struct AnnouncementItem: Codable, Identifiable, Equatable {
    private static let formatter = SafeDateFormatter("MM月dd日 HH:mm")

    let id: Int
    let badge: String
    let title: String
    let content: String
    let pinned: Bool
    let createdAt: Double

    var dateText: String {
        Self.formatter.string(from: Date(timeIntervalSince1970: createdAt / 1000.0))
    }
}

struct InboxMail: Codable, Identifiable, Equatable {
    private static let formatter = SafeDateFormatter("MM.dd HH:mm")

    let id: Int
    let sender: String
    let title: String
    let content: String
    var read: Bool
    let createdAt: Double

    var dateText: String {
        Self.formatter.string(from: Date(timeIntervalSince1970: createdAt / 1000.0))
    }
}

struct LeaderboardEntry: Codable, Identifiable, Equatable {
    var id: String { "\(rank)-\(userId)" }
    let rank: Int
    let userId: String
    let nickname: String
    let sealChar: String
    let sealStyle: String
    let rankTitle: String
    let exp: Int
    let worldTitle: String
    let topNation: String
    let provincesHeld: Int
    let yearsElapsed: Int
    let wondersCount: Int
}

struct WorkshopMapSummary: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let authorName: String
    let region: String
    let eraYear: Int
    let eraName: String
    let description: String
    let nationCount: Int
    let provinceCount: Int
    var downloads: Int
    var likes: Int
    let tags: [String]
    let createdAt: Int
}

// MARK: - 轻量安全令牌存储（iOS Keychain + UserDefaults 兜底）

private enum TokenVault {
    private static let service = "com.lieguoji.native.platform"
    private static let account = "session.token"
    private static let fallbackKey = "online.token.fallback.v1"

    static func load() -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var ref: AnyObject?
        if SecItemCopyMatching(q as CFDictionary, &ref) == errSecSuccess,
           let data = ref as? Data,
           let s = String(data: data, encoding: .utf8), !s.isEmpty {
            return s
        }
        return UserDefaults.standard.string(forKey: fallbackKey)
    }

    static func save(_ token: String?) {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(q as CFDictionary)
        guard let token, !token.isEmpty, let data = token.data(using: .utf8) else {
            UserDefaults.standard.removeObject(forKey: fallbackKey)
            return
        }
        var item = q
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        if SecItemAdd(item as CFDictionary, nil) != errSecSuccess {
            UserDefaults.standard.set(token, forKey: fallbackKey)
        } else {
            UserDefaults.standard.removeObject(forKey: fallbackKey)
        }
    }
}

// MARK: - IPA 多源满速并发分块下载辅助（全 Sendable，严格并发与句柄安全）

private struct IPAMirrorCandidate: Sendable {
    let id: String
    let name: String
    let url: String
}

private struct ByteChunk: Sendable {
    let index: Int
    let start: Int64
    let end: Int64
    var length: Int64 { end - start + 1 }
}

private struct ChunkResult: Sendable {
    let bytes: Int64
    let nodeName: String
    let ok: Bool
}

private final class ProbeMetricsDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var _bodyDuration: Double?
    private var _ttfbMs: Int?

    var bodyDuration: Double? {
        lock.lock()
        defer { lock.unlock() }
        return _bodyDuration
    }

    var ttfbMs: Int? {
        lock.lock()
        defer { lock.unlock() }
        return _ttfbMs
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        guard let tx = metrics.transactionMetrics.last(where: { $0.responseStartDate != nil && $0.responseEndDate != nil }) else {
            return
        }
        lock.lock()
        defer { lock.unlock() }
        if let rs = tx.responseStartDate, let re = tx.responseEndDate {
            let body = re.timeIntervalSince(rs)
            if body > 0 {
                _bodyDuration = body
            }
            if let start = tx.fetchStartDate ?? tx.requestStartDate {
                let ttfb = rs.timeIntervalSince(start)
                if ttfb >= 0 {
                    _ttfbMs = max(1, Int((ttfb * 1000.0).rounded()))
                }
            }
        }
    }
}

private final class ChunkFileWriter: @unchecked Sendable {
    private let lock = NSLock()
    private var handle: FileHandle?
    private var isClosed = false

    init(fileURL: URL, totalSize: Int64) throws {
        let fm = FileManager.default
        try fm.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if fm.fileExists(atPath: fileURL.path) {
            try fm.removeItem(at: fileURL)
        }
        guard fm.createFile(atPath: fileURL.path, contents: nil) else {
            throw NSError(domain: "OnlinePlatform.ChunkWriter", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法创建本地缓存文件"])
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

    deinit {
        close()
    }

    func write(_ data: Data, at offset: Int64) throws {
        lock.lock()
        defer { lock.unlock() }
        guard !isClosed, let fh = handle else {
            throw NSError(domain: "OnlinePlatform.ChunkWriter", code: 2, userInfo: [NSLocalizedDescriptionKey: "下载文件句柄已关闭"])
        }
        try fh.seek(toOffset: UInt64(offset))
        try fh.write(contentsOf: data)
    }

    func close() {
        lock.lock()
        defer { lock.unlock() }
        guard !isClosed else { return }
        isClosed = true
        if let fh = handle {
            try? fh.synchronize()
            try? fh.close()
            handle = nil
        }
    }
}

private final class ChunkWorkQueue: @unchecked Sendable {
    private let lock = NSLock()
    private var chunks: [ByteChunk]
    private var cursor = 0

    init(_ chunks: [ByteChunk]) {
        self.chunks = chunks
    }

    func popNext() -> ByteChunk? {
        lock.lock()
        defer { lock.unlock() }
        guard cursor < chunks.count else { return nil }
        let next = chunks[cursor]
        cursor += 1
        return next
    }
}

private final class WeightedMirrorPool: @unchecked Sendable {
    struct Entry: Sendable {
        let candidate: IPAMirrorCandidate
        let speedMBps: Double
        let isBackup: Bool
    }

    private let lock = NSLock()
    private let primaryEntries: [Entry]
    private let backupEntries: [Entry]
    private let schedule: [Int]
    private var rrCursor = 0
    private var failCounts: [String: Int] = [:]
    private var cooldownUntil: [String: CFAbsoluteTime] = [:]

    var primaryCount: Int { primaryEntries.count }
    var totalCount: Int { primaryEntries.count + backupEntries.count }

    init(primary: [(IPAMirrorCandidate, Double)], backups: [(IPAMirrorCandidate, Double)], pinnedFirst: Bool) {
        self.primaryEntries = primary.map { Entry(candidate: $0.0, speedMBps: max(0.05, $0.1), isBackup: false) }
        self.backupEntries = backups.map { Entry(candidate: $0.0, speedMBps: max(0.05, $0.1), isBackup: true) }

        // 按实测吞吐加权生成交错轮询表，让高带宽节点拉取更多分块，同时多节点并发打满总带宽
        if primaryEntries.isEmpty {
            self.schedule = []
        } else {
            let minSpd = max(0.2, primaryEntries.map(\.speedMBps).min() ?? 1.0)
            let weights: [Int] = primaryEntries.enumerated().map { idx, item in
                var w = max(1, min(5, Int((item.speedMBps / minSpd).rounded())))
                if pinnedFirst && idx == 0 {
                    w = max(w, 3)
                }
                return w
            }
            var built: [Int] = []
            let maxW = weights.max() ?? 1
            for round in 0..<maxW {
                for idx in weights.indices where weights[idx] > round {
                    built.append(idx)
                }
            }
            self.schedule = built.isEmpty ? Array(primaryEntries.indices) : built
        }
    }

    func nextMirror(excluding tried: Set<String>) -> Entry? {
        lock.lock()
        defer { lock.unlock() }
        let now = CFAbsoluteTimeGetCurrent()

        if !schedule.isEmpty {
            for offset in 0..<schedule.count {
                let slot = (rrCursor + offset) % schedule.count
                let entryIdx = schedule[slot]
                let entry = primaryEntries[entryIdx]
                if tried.contains(entry.candidate.url) { continue }
                if (cooldownUntil[entry.candidate.url] ?? 0) > now { continue }
                rrCursor = (slot + 1) % schedule.count
                return entry
            }
            // 若主池全部处于冷却，仍优先尝试未在本次分块失败过的节点
            for offset in 0..<schedule.count {
                let slot = (rrCursor + offset) % schedule.count
                let entryIdx = schedule[slot]
                let entry = primaryEntries[entryIdx]
                if !tried.contains(entry.candidate.url) {
                    rrCursor = (slot + 1) % schedule.count
                    return entry
                }
            }
        }

        for entry in backupEntries {
            if tried.contains(entry.candidate.url) { continue }
            if (cooldownUntil[entry.candidate.url] ?? 0) > now { continue }
            return entry
        }
        for entry in backupEntries where !tried.contains(entry.candidate.url) {
            return entry
        }
        return primaryEntries.first ?? backupEntries.first
    }

    func reportSuccess(url: String) {
        lock.lock()
        failCounts[url] = 0
        cooldownUntil.removeValue(forKey: url)
        lock.unlock()
    }

    func reportFailure(url: String) {
        lock.lock()
        let fails = (failCounts[url] ?? 0) + 1
        failCounts[url] = fails
        let backoff: Double = fails >= 2 ? 30.0 : 8.0
        cooldownUntil[url] = CFAbsoluteTimeGetCurrent() + backoff
        lock.unlock()
    }

    func routeSummaryLabel() -> String {
        lock.lock()
        defer { lock.unlock() }
        let now = CFAbsoluteTimeGetCurrent()
        let healthyPrimary = primaryEntries.filter { (cooldownUntil[$0.candidate.url] ?? 0) <= now }
        let activeCount = max(1, healthyPrimary.isEmpty ? primaryEntries.count : healthyPrimary.count)
        if primaryEntries.count >= 2 && activeCount >= 2 {
            return "多路满速并发 · \(activeCount) 节点"
        }
        if let first = healthyPrimary.first ?? primaryEntries.first ?? backupEntries.first {
            return "\(first.candidate.name) · 8 路分块"
        }
        return "多路满速并发"
    }
}

private final class SessionLifecycleBox: @unchecked Sendable {
    private let lock = NSLock()
    private var heartbeatTask: Task<Void, Never>?
    private var ipaDownloadTask: Task<Void, Never>?
    private var ipaDownloadSession: URLSession?
    private var singleDownloadSession: URLSession?
    private var singleDownloadTask: URLSessionDownloadTask?

    func hasHeartbeat() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return heartbeatTask != nil
    }

    func setHeartbeat(_ task: Task<Void, Never>?) {
        lock.lock()
        let old = heartbeatTask
        heartbeatTask = task
        lock.unlock()
        old?.cancel()
    }

    func replaceIPATask(_ task: Task<Void, Never>?) {
        lock.lock()
        let old = ipaDownloadTask
        ipaDownloadTask = task
        lock.unlock()
        old?.cancel()
    }

    func replaceIPASession(_ session: URLSession?) {
        lock.lock()
        let old = ipaDownloadSession
        ipaDownloadSession = session
        lock.unlock()
        old?.invalidateAndCancel()
    }

    func clearIPASession(ifMatches session: URLSession) {
        lock.lock()
        let matched = (ipaDownloadSession === session)
        if matched { ipaDownloadSession = nil }
        lock.unlock()
        session.invalidateAndCancel()
    }

    func replaceSingleDownload(session: URLSession?, task: URLSessionDownloadTask?) {
        lock.lock()
        let oldTask = singleDownloadTask
        let oldSession = singleDownloadSession
        singleDownloadTask = task
        singleDownloadSession = session
        lock.unlock()
        oldTask?.cancel()
        oldSession?.invalidateAndCancel()
    }

    func clearSingleDownload(ifMatches session: URLSession?) {
        lock.lock()
        let oldTask = singleDownloadTask
        let oldSession = singleDownloadSession
        if session == nil || oldSession === session {
            singleDownloadTask = nil
            singleDownloadSession = nil
        }
        lock.unlock()
        if session == nil || oldSession === session {
            oldTask?.cancel()
            oldSession?.invalidateAndCancel()
        }
    }

    func cancelDownloads() {
        lock.lock()
        let t1 = ipaDownloadTask; ipaDownloadTask = nil
        let s1 = ipaDownloadSession; ipaDownloadSession = nil
        let t2 = singleDownloadTask; singleDownloadTask = nil
        let s2 = singleDownloadSession; singleDownloadSession = nil
        lock.unlock()
        t1?.cancel()
        s1?.invalidateAndCancel()
        t2?.cancel()
        s2?.invalidateAndCancel()
    }

    func invalidateAll() {
        lock.lock()
        let hb = heartbeatTask; heartbeatTask = nil
        let t1 = ipaDownloadTask; ipaDownloadTask = nil
        let s1 = ipaDownloadSession; ipaDownloadSession = nil
        let t2 = singleDownloadTask; singleDownloadTask = nil
        let s2 = singleDownloadSession; singleDownloadSession = nil
        lock.unlock()
        hb?.cancel()
        t1?.cancel()
        s1?.invalidateAndCancel()
        t2?.cancel()
        s2?.invalidateAndCancel()
    }
}

private final class IPADownloadDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    let onProgress: @Sendable (Double, Int64, Int64, Double) -> Void
    let onFinish: @Sendable (Result<URL, Error>) -> Void
    private let destination: URL
    private let startTime = CFAbsoluteTimeGetCurrent()
    private let finishLock = NSLock()
    private var finished = false

    init(destination: URL,
         onProgress: @escaping @Sendable (Double, Int64, Int64, Double) -> Void,
         onFinish: @escaping @Sendable (Result<URL, Error>) -> Void) {
        self.destination = destination
        self.onProgress = onProgress
        self.onFinish = onFinish
    }

    private func deliverFinishOnce(_ result: Result<URL, Error>) {
        finishLock.lock()
        let shouldSend = !finished
        finished = true
        finishLock.unlock()
        if shouldSend {
            onFinish(result)
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                    didWriteData bytesWritten: Int64, totalBytesWritten: Int64,
                    totalBytesExpectedToWrite: Int64) {
        let frac = totalBytesExpectedToWrite > 0
            ? min(1.0, max(0.0, Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)))
            : 0.0
        let elapsed = max(0.15, CFAbsoluteTimeGetCurrent() - startTime)
        let speedMBs = (Double(totalBytesWritten) / 1_048_576.0) / elapsed
        onProgress(frac, totalBytesWritten, totalBytesExpectedToWrite, speedMBs)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        do {
            let fm = FileManager.default
            try fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            if fm.fileExists(atPath: destination.path) { try fm.removeItem(at: destination) }
            try fm.moveItem(at: location, to: destination)
            deliverFinishOnce(.success(destination))
        } catch {
            deliverFinishOnce(.failure(error))
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            deliverFinishOnce(.failure(error))
        }
    }
}

private final class TokenBox: @unchecked Sendable {
    static let shared = TokenBox()
    private let lock = NSLock()
    private var value: String?
    func get() -> String? {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
    func set(_ t: String?) {
        lock.lock()
        value = t
        lock.unlock()
    }
}

// MARK: - 列国纪云端行宫平台总控（登录 / 云更新 / 热更 / 签到 / 公告 / 邮件 / 排行榜）

@MainActor final class OnlinePlatform: ObservableObject {
    static let shared = OnlinePlatform()

    /// 默认专属腾讯云平台地址与计算节点（开机优先 443 运营商防限速专线 + 8765/8443 并行竞速直连）
    nonisolated static let defaultPlatformBase = "http://111.230.153.235"
    nonisolated static let defaultComputeHost = "111.230.153.235:443"
    nonisolated static let defaultComputeEndpoints: [String] = [
        "111.230.153.235:443",
        "111.230.153.235:8765",
        "111.230.153.235:8443"
    ]

    nonisolated static var apiBase: String {
        let custom = (UserDefaults.standard.string(forKey: "platform.baseURL") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return custom.isEmpty ? defaultPlatformBase : custom.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    /// 供后台云存档服务直接读取的当前登录令牌（非隔离线程安全访问）
    nonisolated static var currentToken: String? {
        TokenBox.shared.get()
    }
    private static func syncCachedToken(_ t: String?) {
        TokenBox.shared.set(t)
    }

    @Published private(set) var user: OnlineUser?
    @Published private(set) var server: ServerSnapshot?
    @Published private(set) var apiRTTMs: Int?
    @Published private(set) var updateInfo: AppUpdateInfo?
    @Published var showUpdateSheet = false
    @Published var showAuthSheet = false
    @Published var showHubSheet = false
    @Published var hubInitialTab = "profile"

    @Published private(set) var checkingUpdate = false
    @Published private(set) var hotpatchVersion = UserDefaults.standard.integer(forKey: "online.hotpatch.v")
    @Published private(set) var hotpatchSummary = UserDefaults.standard.string(forKey: "online.hotpatch.summary") ?? ""
    @Published private(set) var hotpatchSHA = UserDefaults.standard.string(forKey: "online.hotpatch.sha") ?? ""
    @Published private(set) var hotpatchBanner: String?
    @Published private(set) var hotpatchProgress: Double = 0
    @Published private(set) var lastCheckedAt: Date?

    @Published private(set) var announcements: [AnnouncementItem] = []
    @Published private(set) var inbox: [InboxMail] = []
    @Published private(set) var leaderboard: [LeaderboardEntry] = []
    @Published private(set) var leaderboardCategory = "provinces"

    // 创意工坊云端舆图库状态（Platform v6）
    @Published var workshopMaps: [WorkshopMapSummary] = []
    @Published var workshopLoading = false
    @Published var workshopError: String? = nil

    // IPA 站内 8 路多源并发分块下载与真实吞吐测速状态
    @Published private(set) var downloadingIPA = false
    @Published private(set) var downloadProgress: Double = 0
    @Published private(set) var downloadDetail: String = ""
    @Published var downloadedIPAURL: URL?
    @Published private(set) var mirrorResults: [MirrorProbeResult] = []
    @Published private(set) var probingMirrors = false
    @Published private(set) var activeDownloadNode: String = ""
    @Published private(set) var downloadSpeedMBs: Double = 0
    @Published var preferredMirrorIndex: Int? = nil
    @Published private(set) var cloudChangelog: [CloudChangelogEntry] = []

    var downloadRouteLabel: String { activeDownloadNode }
    var downloadSpeedMBps: Double { downloadSpeedMBs }

    private var token: String?
    private nonisolated let lifecycleBox = SessionLifecycleBox()
    private var lastMirrorProbeAt: CFAbsoluteTime = 0
    private var bootstrappedOnce = false

    private nonisolated let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 10
        cfg.timeoutIntervalForResource = 25
        cfg.waitsForConnectivity = false
        return URLSession(configuration: cfg)
    }()

    static var currentVersionString: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "6.0.0"
    }
    static var currentBuildNumber: Int {
        Int((Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "189") ?? 189
    }
    private static var deviceUUID: String {
        let k = "online.deviceId.v1"
        if let saved = UserDefaults.standard.string(forKey: k), !saved.isEmpty { return saved }
        let id = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        UserDefaults.standard.set(id, forKey: k)
        return id
    }

    var isLoggedIn: Bool { user != nil && token != nil }
    var hasPendingBadge: Bool {
        if updateInfo?.hasAppUpdate == true { return true }
        if let u = user, (!u.checkedInToday || u.unreadMailCount > 0) { return true }
        return false
    }

    private init() {
        let savedToken = TokenVault.load()
        self.token = savedToken
        Self.syncCachedToken(savedToken)
        if let rawUser = UserDefaults.standard.data(forKey: "online.cachedUser.v1"),
           let decoded = try? JSONDecoder().decode(OnlineUser.self, from: rawUser) {
            self.user = decoded
        }
    }

    deinit {
        lifecycleBox.invalidateAll()
        session.invalidateAndCancel()
    }

    private func persistSession(token: String?, user: OnlineUser?) {
        self.token = token
        Self.syncCachedToken(token)
        TokenVault.save(token)
        self.user = user
        if let user, let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: "online.cachedUser.v1")
        } else {
            UserDefaults.standard.removeObject(forKey: "online.cachedUser.v1")
        }
    }

    private func makeRequest(_ path: String, method: String = "GET", jsonBody: [String: Any]? = nil, timeout: TimeInterval = 10) -> URLRequest? {
        guard let url = URL(string: Self.apiBase + path) else { return nil }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        req.httpMethod = method
        if let token, !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let jsonBody {
            req.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: jsonBody)
        }
        return req
    }

    // MARK: - 启动云检测（版本自动检测 + 热更新同步 + 会话续签 + 服务器态势）

    @discardableResult
    func bootstrap(manual: Bool = false, autoPrompt: Bool = true) async -> Bool {
        if !manual && bootstrappedOnce { return false }
        bootstrappedOnce = true
        checkingUpdate = true
        defer { checkingUpdate = false }

        let ver = Self.currentVersionString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "5.3.0"
        let build = Self.currentBuildNumber
        let path = "/api/v1/bootstrap?version=\(ver)&build=\(build)&patch=\(hotpatchVersion)"
        guard let req = makeRequest(path, method: "GET", timeout: 8) else { return false }

        let t0 = Date().timeIntervalSinceReferenceDate
        do {
            let (data, resp) = try await session.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return false }
            let ms = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
            apiRTTMs = ms
            lastCheckedAt = Date()

            guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  (root["ok"] as? Bool) == true else { return false }

            let dec = JSONDecoder()

            if let srvObj = root["server"],
               let srvData = try? JSONSerialization.data(withJSONObject: srvObj),
               let snap = try? dec.decode(ServerSnapshot.self, from: srvData) {
                self.server = snap
            }

            if let annObj = root["announcements"],
               let annData = try? JSONSerialization.data(withJSONObject: annObj),
               let list = try? dec.decode([AnnouncementItem].self, from: annData) {
                self.announcements = list
            }

            if let clObj = root["changelog"],
               let clData = try? JSONSerialization.data(withJSONObject: clObj),
               let entries = try? dec.decode([CloudChangelogEntry].self, from: clData) {
                self.cloudChangelog = entries
            }

            if let userObj = root["user"], !(userObj is NSNull),
               let uData = try? JSONSerialization.data(withJSONObject: userObj),
               let u = try? dec.decode(OnlineUser.self, from: uData) {
                persistSession(token: self.token, user: u)
            } else if self.token != nil && (root["user"] == nil || root["user"] is NSNull) {
                // Token 已失效或被服务端清理
                persistSession(token: nil, user: nil)
            }

            var hotpatchApplied = false
            if let hp = root["hotpatch"] as? [String: Any] {
                let pVer = (hp["patchVersion"] as? NSNumber)?.intValue ?? 0
                let summary = hp["summary"] as? String ?? ""
                let sha = hp["sha256"] as? String ?? ""
                let hasPatch = (hp["hasPatchUpdate"] as? Bool) == true
                if let cfgObj = hp["config"], !(cfgObj is NSNull),
                   let cfgData = try? JSONSerialization.data(withJSONObject: cfgObj) {
                    if hasPatch || pVer > hotpatchVersion {
                        hotpatchBanner = "正在同步云端热更 v\(pVer)…"
                        hotpatchProgress = 0.42
                        try? await Task.sleep(nanoseconds: 220_000_000)
                        hotpatchProgress = 0.88
                        _ = CloudConfig.shared.applyServerHotpatch(cfgData, patchVersion: pVer)
                        hotpatchVersion = pVer
                        hotpatchSummary = summary
                        hotpatchSHA = sha
                        UserDefaults.standard.set(pVer, forKey: "online.hotpatch.v")
                        UserDefaults.standard.set(summary, forKey: "online.hotpatch.summary")
                        UserDefaults.standard.set(sha, forKey: "online.hotpatch.sha")
                        hotpatchProgress = 1.0
                        hotpatchBanner = "云端热更 v\(pVer) 已自动生效"
                        hotpatchApplied = true
                        Task { @MainActor in
                            try? await Task.sleep(nanoseconds: 2_600_000_000)
                            if self.hotpatchProgress >= 1.0 {
                                withAnimation(Motion.fade) { self.hotpatchBanner = nil }
                            }
                        }
                    } else {
                        _ = CloudConfig.shared.applyServerHotpatch(cfgData, patchVersion: pVer)
                        if !summary.isEmpty { hotpatchSummary = summary }
                        if !sha.isEmpty { hotpatchSHA = sha }
                    }
                }
            }

            if let updObj = root["update"],
               let updData = try? JSONSerialization.data(withJSONObject: updObj),
               let upd = try? dec.decode(AppUpdateInfo.self, from: updData) {
                self.updateInfo = upd
                let dismissedBuild = UserDefaults.standard.integer(forKey: "online.dismissedUpdateBuild")
                if autoPrompt && upd.hasAppUpdate && (manual || upd.forceUpdate || dismissedBuild < upd.latestBuild) {
                    if !ShotTour.on {
                        self.showUpdateSheet = true
                    }
                }
            }

            startHeartbeatLoop()
            return hotpatchApplied
        } catch {
            return false
        }
    }

    func dismissCurrentUpdatePrompt() {
        if let b = updateInfo?.latestBuild {
            UserDefaults.standard.set(b, forKey: "online.dismissedUpdateBuild")
        }
        showUpdateSheet = false
    }

    private func startHeartbeatLoop() {
        guard !lifecycleBox.hasHeartbeat() else { return }
        let task = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 90_000_000_000)
                await self.sendHeartbeat()
            }
        }
        lifecycleBox.setHeartbeat(task)
    }

    func sendHeartbeat() async {
        guard let req = makeRequest("/api/v1/heartbeat", method: "POST", jsonBody: [:], timeout: 6) else { return }
        let t0 = Date().timeIntervalSinceReferenceDate
        if let (data, resp) = try? await session.data(for: req),
           (resp as? HTTPURLResponse)?.statusCode == 200,
           let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let srvObj = root["server"],
           let srvData = try? JSONSerialization.data(withJSONObject: srvObj),
           let snap = try? JSONDecoder().decode(ServerSnapshot.self, from: srvData) {
            apiRTTMs = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
            server = snap
        }
    }

    func pingServer() async -> Int? {
        guard let req = makeRequest("/api/v1/ping", method: "GET", timeout: 5) else { return nil }
        let t0 = Date().timeIntervalSinceReferenceDate
        guard let (_, resp) = try? await session.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        let ms = max(1, Int(((Date().timeIntervalSinceReferenceDate - t0) * 1000).rounded()))
        apiRTTMs = ms
        await sendHeartbeat()
        return ms
    }

    // MARK: - 账号认证（注册 / 登录 / 游客入世 / 转正绑定 / 编辑名帖 / 登出）

    private struct AuthResponse: Decodable {
        let ok: Bool
        let token: String?
        let user: OnlineUser?
        let error: String?
    }

    func register(username: String, password: String, nickname: String, sealChar: String, sealStyle: String) async -> String? {
        let body: [String: Any] = [
            "username": username.trimmingCharacters(in: .whitespacesAndNewlines),
            "password": password,
            "nickname": nickname.trimmingCharacters(in: .whitespacesAndNewlines),
            "sealChar": sealChar,
            "sealStyle": sealStyle,
            "deviceName": UIDevice.current.name,
            "appVersion": Self.currentVersionString
        ]
        guard let req = makeRequest("/api/v1/auth/register", method: "POST", jsonBody: body, timeout: 12) else { return "网络请求创建失败" }
        do {
            let (data, _) = try await session.data(for: req)
            let res = try JSONDecoder().decode(AuthResponse.self, from: data)
            if res.ok, let t = res.token, let u = res.user {
                persistSession(token: t, user: u)
                await refreshInbox()
                return nil
            }
            return res.error ?? "注册失败，请重试"
        } catch {
            return "连接云端服务器失败，请检查网络"
        }
    }

    func login(username: String, password: String) async -> String? {
        let body: [String: Any] = [
            "username": username.trimmingCharacters(in: .whitespacesAndNewlines),
            "password": password,
            "deviceName": UIDevice.current.name,
            "appVersion": Self.currentVersionString
        ]
        guard let req = makeRequest("/api/v1/auth/login", method: "POST", jsonBody: body, timeout: 12) else { return "网络请求创建失败" }
        do {
            let (data, _) = try await session.data(for: req)
            let res = try JSONDecoder().decode(AuthResponse.self, from: data)
            if res.ok, let t = res.token, let u = res.user {
                persistSession(token: t, user: u)
                await refreshInbox()
                return nil
            }
            return res.error ?? "账号或密令不正确"
        } catch {
            return "连接云端服务器失败，请检查网络"
        }
    }

    func loginAsGuest() async -> String? {
        let body: [String: Any] = [
            "deviceId": Self.deviceUUID,
            "deviceName": UIDevice.current.name,
            "appVersion": Self.currentVersionString
        ]
        guard let req = makeRequest("/api/v1/auth/guest", method: "POST", jsonBody: body, timeout: 12) else { return "网络请求创建失败" }
        do {
            let (data, _) = try await session.data(for: req)
            let res = try JSONDecoder().decode(AuthResponse.self, from: data)
            if res.ok, let t = res.token, let u = res.user {
                persistSession(token: t, user: u)
                await refreshInbox()
                return nil
            }
            return res.error ?? "游客入世失败"
        } catch {
            return "连接云端服务器失败，请检查网络"
        }
    }

    func bindGuest(username: String, password: String, nickname: String) async -> String? {
        let body: [String: Any] = [
            "username": username.trimmingCharacters(in: .whitespacesAndNewlines),
            "password": password,
            "nickname": nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        guard let req = makeRequest("/api/v1/auth/bind", method: "POST", jsonBody: body, timeout: 12) else { return "请先登录" }
        do {
            let (data, _) = try await session.data(for: req)
            let res = try JSONDecoder().decode(AuthResponse.self, from: data)
            if res.ok, let u = res.user {
                persistSession(token: self.token, user: u)
                return nil
            }
            return res.error ?? "绑定失败"
        } catch {
            return "连接服务器失败"
        }
    }

    func updateProfile(nickname: String, bio: String, sealChar: String, sealStyle: String) async -> String? {
        let body: [String: Any] = [
            "nickname": nickname.trimmingCharacters(in: .whitespacesAndNewlines),
            "bio": bio.trimmingCharacters(in: .whitespacesAndNewlines),
            "sealChar": sealChar,
            "sealStyle": sealStyle
        ]
        guard let req = makeRequest("/api/v1/auth/profile", method: "POST", jsonBody: body, timeout: 12) else { return "请先登录" }
        do {
            let (data, _) = try await session.data(for: req)
            let res = try JSONDecoder().decode(AuthResponse.self, from: data)
            if res.ok, let u = res.user {
                persistSession(token: self.token, user: u)
                return nil
            }
            return res.error ?? "保存名帖失败"
        } catch {
            return "连接服务器失败"
        }
    }

    func logout() async {
        if let req = makeRequest("/api/v1/auth/logout", method: "POST", jsonBody: [:], timeout: 6) {
            _ = try? await session.data(for: req)
        }
        persistSession(token: nil, user: nil)
        inbox = []
    }

    // MARK: - 每日临朝签到 / 信匣 / 天下史榜

    func dailyCheckin() async -> (ok: Bool, message: String) {
        struct CheckinResp: Decodable {
            let ok: Bool
            let already: Bool?
            let gainedExp: Int?
            let message: String?
            let error: String?
            let user: OnlineUser?
        }
        guard let req = makeRequest("/api/v1/checkin", method: "POST", jsonBody: [:], timeout: 10) else {
            return (false, "请先登临账号")
        }
        do {
            let (data, _) = try await session.data(for: req)
            let res = try JSONDecoder().decode(CheckinResp.self, from: data)
            if res.ok, let u = res.user {
                persistSession(token: self.token, user: u)
                return (true, res.message ?? "临朝签到成礼！")
            }
            return (false, res.error ?? "签到失败")
        } catch {
            return (false, "连接服务器失败")
        }
    }

    func refreshInbox() async {
        struct InboxResp: Decodable { let ok: Bool; let messages: [InboxMail]? }
        guard isLoggedIn, let req = makeRequest("/api/v1/inbox", method: "GET", timeout: 8) else { return }
        if let (data, resp) = try? await session.data(for: req),
           (resp as? HTTPURLResponse)?.statusCode == 200,
           let res = try? JSONDecoder().decode(InboxResp.self, from: data),
           let msgs = res.messages {
            self.inbox = msgs
        }
    }

    func markMailRead(_ mail: InboxMail) async {
        guard !mail.read, let req = makeRequest("/api/v1/inbox/\(mail.id)/read", method: "POST", jsonBody: [:], timeout: 8) else { return }
        if let idx = inbox.firstIndex(where: { $0.id == mail.id }) {
            inbox[idx].read = true
        }
        _ = try? await session.data(for: req)
        await refreshUserProfile()
    }

    func refreshUserProfile() async {
        guard isLoggedIn, let req = makeRequest("/api/v1/auth/me", method: "GET", timeout: 8) else { return }
        if let (data, resp) = try? await session.data(for: req),
           (resp as? HTTPURLResponse)?.statusCode == 200,
           let res = try? JSONDecoder().decode(AuthResponse.self, from: data),
           res.ok, let u = res.user {
            persistSession(token: self.token, user: u)
        }
    }

    func refreshLeaderboard(category: String? = nil) async {
        struct LBResp: Decodable { let ok: Bool; let entries: [LeaderboardEntry]? }
        let cat = category ?? leaderboardCategory
        leaderboardCategory = cat
        guard let req = makeRequest("/api/v1/leaderboard?category=\(cat)", method: "GET", timeout: 10) else { return }
        if let (data, resp) = try? await session.data(for: req),
           (resp as? HTTPURLResponse)?.statusCode == 200,
           let res = try? JSONDecoder().decode(LBResp.self, from: data),
           let list = res.entries {
            self.leaderboard = list
        }
    }

    func reportWorldStats(worldTitle: String, topNation: String, provincesHeld: Int, totalDays: Int, nationsCount: Int, warsCount: Int, wondersCount: Int) async -> String? {
        guard isLoggedIn else { return "请先登临账号后再铭刻史册" }
        let body: [String: Any] = [
            "worldTitle": worldTitle,
            "topNation": topNation,
            "provincesHeld": provincesHeld,
            "totalDays": totalDays,
            "yearsElapsed": max(1, totalDays / 365),
            "nationsCount": nationsCount,
            "warsCount": warsCount,
            "wondersCount": wondersCount
        ]
        guard let req = makeRequest("/api/v1/stats/report", method: "POST", jsonBody: body, timeout: 12) else { return "请求构造失败" }
        do {
            let (data, _) = try await session.data(for: req)
            let res = try JSONDecoder().decode(AuthResponse.self, from: data)
            if res.ok {
                if let u = res.user { persistSession(token: self.token, user: u) }
                await refreshLeaderboard()
                return nil
            }
            return res.error ?? "铭刻史册失败"
        } catch {
            return "连接服务器失败"
        }
    }

    // MARK: - 256 KB 吞吐测速择优 + 多源 8 路工作窃取并发分块下载 IPA（下完即刻呼出安装/自签共享窗）

    nonisolated static func mirrorLabel(for urlString: String) -> String {
        let lower = urlString.lowercased()
        if lower.contains("cdn.gh-proxy.org") { return "国内高速主线 A" }
        if lower.contains("edgeone.gh-proxy.com") { return "腾讯云 EdgeOne 专线" }
        if lower.contains("gh-proxy.org") { return "国内高速主线 B" }
        if lower.contains("gh-proxy.com") { return "国内加速节点 C" }
        if lower.contains("ghfast.top") { return "极速镜像节点 D" }
        if lower.contains("lieguoji-edge.pages.dev") { return "Cloudflare 海外边缘" }
        if lower.contains("github.com") || lower.contains("githubusercontent.com") { return "GitHub 直连" }
        if lower.contains("111.230.153.235") || lower.contains("/downloads/") { return "腾讯云源站兜底" }
        if let host = URL(string: urlString)?.host, !host.isEmpty { return host }
        return "加速节点"
    }

    nonisolated private static func mirrorDisplayName(for urlString: String) -> String {
        mirrorLabel(for: urlString)
    }

    nonisolated private static func isOriginFallbackURL(_ urlString: String) -> Bool {
        let lower = urlString.lowercased()
        return lower.contains("111.230.153.235") || lower.contains("/downloads/lieguoji-latest.ipa")
    }

    nonisolated private static func isBrokenMirrorURL(_ urlString: String) -> Bool {
        urlString.lowercased().contains("lieguoji-web.pages.dev")
    }

    nonisolated private static func buildMirrorCandidates(
        info: AppUpdateInfo?,
        preferredURL: String?,
        priorResults: [MirrorProbeResult],
        includeLatestFallback: Bool
    ) -> [IPAMirrorCandidate] {
        var out: [IPAMirrorCandidate] = []
        var deferredOrigins: [IPAMirrorCandidate] = []
        var seen = Set<String>()

        func appendUnique(id: String, name: String? = nil, url: String, allowOriginEarly: Bool = false) {
            let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty,
                  !isBrokenMirrorURL(trimmed),
                  URL(string: trimmed) != nil,
                  !seen.contains(trimmed) else { return }
            seen.insert(trimmed)
            let candidate = IPAMirrorCandidate(id: id, name: name ?? mirrorLabel(for: trimmed), url: trimmed)
            if isOriginFallbackURL(trimmed) && !allowOriginEarly {
                deferredOrigins.append(candidate)
            } else {
                out.append(candidate)
            }
        }

        if let preferredURL, !preferredURL.isEmpty {
            appendUnique(id: "preferred", url: preferredURL, allowOriginEarly: true)
        }

        for r in priorResults where r.ok && !isOriginFallbackURL(r.url) {
            appendUnique(id: r.id, name: mirrorLabel(for: r.url), url: r.url)
        }

        if let info, !info.latestVersion.isEmpty, info.latestBuild > 0 {
            let ver = info.latestVersion.hasPrefix("v") ? String(info.latestVersion.dropFirst()) : info.latestVersion
            let tag = "v\(ver)"
            let fname = "lieguoji-\(ver)-build\(info.latestBuild)-unsigned.ipa"
            let ghAsset = "https://github.com/Ethanhui6/lieguoji-web/releases/download/\(tag)/\(fname)"

            appendUnique(id: "cdn-gh-proxy-org", name: "国内高速主线 A", url: "https://cdn.gh-proxy.org/\(ghAsset)")
            appendUnique(id: "edgeone-gh-proxy", name: "腾讯云 EdgeOne 专线", url: "https://edgeone.gh-proxy.com/\(ghAsset)")
            appendUnique(id: "gh-proxy-org", name: "国内高速主线 B", url: "https://gh-proxy.org/\(ghAsset)")
            appendUnique(id: "gh-proxy-com", name: "国内加速节点 C", url: "https://gh-proxy.com/\(ghAsset)")
            appendUnique(id: "ghfast-top", name: "极速镜像节点 D", url: "https://ghfast.top/\(ghAsset)")
            appendUnique(id: "cf-edge", name: "Cloudflare 海外边缘", url: "https://lieguoji-edge.pages.dev/api/cdn/ipa/\(tag)/\(fname)")
            if let extras = info.ipaMirrors {
                for (idx, raw) in extras.enumerated() {
                    appendUnique(id: "mirror-\(idx)", url: raw)
                }
            }
            appendUnique(id: "github-direct", name: "GitHub 直连", url: ghAsset)
            if !info.directIpaUrl.isEmpty {
                appendUnique(id: "direct-ipa", url: info.directIpaUrl)
            }
        } else {
            if let info {
                if let extras = info.ipaMirrors {
                    for (idx, raw) in extras.enumerated() {
                        appendUnique(id: "mirror-\(idx)", url: raw)
                    }
                }
                if !info.directIpaUrl.isEmpty {
                    appendUnique(id: "direct-ipa", url: info.directIpaUrl)
                }
            }
            appendUnique(id: "cf-edge-latest", name: "Cloudflare 海外边缘", url: "https://lieguoji-edge.pages.dev/api/cdn/ipa/latest")
        }

        if includeLatestFallback {
            appendUnique(id: "cf-edge-latest", name: "Cloudflare 海外边缘", url: "https://lieguoji-edge.pages.dev/api/cdn/ipa/latest")
        }

        let originBase = OnlinePlatform.apiBase
        appendUnique(id: "tencent-origin", name: "腾讯云源站兜底", url: "\(originBase)/downloads/lieguoji-latest.ipa")
        if originBase != OnlinePlatform.defaultPlatformBase {
            appendUnique(id: "tencent-origin-default", name: "腾讯云源站兜底", url: "\(OnlinePlatform.defaultPlatformBase)/downloads/lieguoji-latest.ipa")
        }

        out.append(contentsOf: deferredOrigins)
        return out
    }

    nonisolated private static func parseTotalBytes(fromContentRange header: String?) -> Int64? {
        guard let header, let slash = header.lastIndex(of: "/") else { return nil }
        let suffix = header[header.index(after: slash)...].trimmingCharacters(in: .whitespacesAndNewlines)
        guard let total = Int64(suffix), total > 0 else { return nil }
        return total
    }

    nonisolated private static func isLikelyZipHeader(_ data: Data) -> Bool {
        if data.count >= 2 {
            let i0 = data.startIndex
            let i1 = data.index(after: i0)
            return data[i0] == 0x50 && data[i1] == 0x4B
        }
        if data.count == 1 {
            return data[data.startIndex] == 0x50
        }
        return false
    }

    /// 256 KB 真实持续吞吐探针（HTTP 206 + Content-Range 校验，严禁 1 字节 Ping 误判）。
    nonisolated private static func probeSingleMirror256K(_ candidate: IPAMirrorCandidate, session: URLSession) async -> MirrorProbeResult {
        guard let url = URL(string: candidate.url) else {
            return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6.0)
        req.httpMethod = "GET"
        req.setValue("bytes=0-262143", forHTTPHeaderField: "Range")
        req.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        let metrics = ProbeMetricsDelegate()
        let t0 = CFAbsoluteTimeGetCurrent()
        do {
            let (data, resp) = try await session.data(for: req, delegate: metrics)
            let wallDt = max(0.02, CFAbsoluteTimeGetCurrent() - t0)
            guard let http = resp as? HTTPURLResponse,
                  data.count >= 4096,
                  Self.isLikelyZipHeader(data) else {
                return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
            }
            let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
            if ct.contains("text/html") {
                return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
            }

            let supportsRange: Bool
            let contentLength: Int64
            if http.statusCode == 206 {
                guard let total = Self.parseTotalBytes(fromContentRange: http.value(forHTTPHeaderField: "Content-Range")),
                      total > 100_000 else {
                    return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
                }
                supportsRange = true
                contentLength = total
            } else if http.statusCode == 200 {
                let clHeader = http.value(forHTTPHeaderField: "Content-Length").flatMap { Int64($0) }
                let total = clHeader ?? Int64(data.count)
                guard total > 100_000 else {
                    return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
                }
                supportsRange = false
                contentLength = total
            } else {
                return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
            }

            let rawBody = metrics.bodyDuration
            let bodyDuration: Double
            if let rawBody, rawBody >= 0.005 {
                bodyDuration = max(0.02, rawBody)
            } else {
                bodyDuration = wallDt
            }
            let speedMBps = (Double(data.count) / 1_048_576.0) / max(0.02, bodyDuration)
            let ttfbMs = metrics.ttfbMs ?? max(1, Int((wallDt * 1000.0).rounded()))
            return MirrorProbeResult(
                id: candidate.id,
                name: candidate.name,
                url: candidate.url,
                latencyMs: ttfbMs,
                speedMBs: speedMBps,
                ok: true,
                supportsRange: supportsRange,
                contentLength: contentLength
            )
        } catch {
            return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
        }
    }

    /// 严格吞吐排序：高速外部镜像（非 111.230.153.235 且 ≥ 0.15 MB/s）严格优先于源站，再按实测 MB/s 降序排列。
    nonisolated private static func sortProbeResults(_ results: inout [MirrorProbeResult]) {
        results.sort { a, b in
            if a.ok != b.ok { return a.ok && !b.ok }
            if a.ok && b.ok {
                let aFastExt = !Self.isOriginFallbackURL(a.url) && a.speedMBps >= 0.15
                let bFastExt = !Self.isOriginFallbackURL(b.url) && b.speedMBps >= 0.15
                if aFastExt != bFastExt { return aFastExt }
                if abs(a.speedMBps - b.speedMBps) > 0.01 { return a.speedMBps > b.speedMBps }
                if a.supportsRange != b.supportsRange { return a.supportsRange && !b.supportsRange }
                return (a.latencyMs ?? Int.max) < (b.latencyMs ?? Int.max)
            }
            return a.name < b.name
        }
    }

    nonisolated private static func runConcurrent256KProbe(candidates: [IPAMirrorCandidate]) async -> [MirrorProbeResult] {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 6.0
        cfg.timeoutIntervalForResource = 7.0
        cfg.waitsForConnectivity = false
        cfg.httpMaximumConnectionsPerHost = 6
        let probeSession = URLSession(configuration: cfg)
        defer { probeSession.invalidateAndCancel() }

        var results: [MirrorProbeResult] = []
        await withTaskGroup(of: MirrorProbeResult.self) { group in
            for c in candidates {
                group.addTask {
                    await Self.probeSingleMirror256K(c, session: probeSession)
                }
            }
            for await res in group {
                results.append(res)
            }
        }
        Self.sortProbeResults(&results)
        return results
    }

    nonisolated private static func downloadSingleChunkFromPool(
        _ chunk: ByteChunk,
        pool: WeightedMirrorPool,
        writer: ChunkFileWriter,
        session: URLSession
    ) async -> ChunkResult {
        let maxAttempts = max(4, pool.totalCount * 2)
        var tried = Set<String>()
        for _ in 0..<maxAttempts {
            if Task.isCancelled { return ChunkResult(bytes: 0, nodeName: "", ok: false) }
            if tried.count >= pool.totalCount {
                tried.removeAll()
            }
            guard let entry = pool.nextMirror(excluding: tried) else {
                return ChunkResult(bytes: 0, nodeName: "", ok: false)
            }
            let mirror = entry.candidate
            tried.insert(mirror.url)
            guard let url = URL(string: mirror.url) else {
                pool.reportFailure(url: mirror.url)
                continue
            }
            let chunkTimeout: TimeInterval = (entry.isBackup || Self.isOriginFallbackURL(mirror.url)) ? 24.0 : 14.0
            var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: chunkTimeout)
            req.httpMethod = "GET"
            req.setValue("bytes=\(chunk.start)-\(chunk.end)", forHTTPHeaderField: "Range")
            req.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
            do {
                let (data, resp) = try await session.data(for: req)
                guard let http = resp as? HTTPURLResponse,
                      http.statusCode == 206,
                      Int64(data.count) == chunk.length else {
                    pool.reportFailure(url: mirror.url)
                    continue
                }
                let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                if ct.contains("text/html") {
                    pool.reportFailure(url: mirror.url)
                    continue
                }
                if chunk.index == 0 && !Self.isLikelyZipHeader(data) {
                    pool.reportFailure(url: mirror.url)
                    continue
                }
                try writer.write(data, at: chunk.start)
                pool.reportSuccess(url: mirror.url)
                return ChunkResult(bytes: chunk.length, nodeName: mirror.name, ok: true)
            } catch {
                if Task.isCancelled { return ChunkResult(bytes: 0, nodeName: mirror.name, ok: false) }
                pool.reportFailure(url: mirror.url)
                try? await Task.sleep(nanoseconds: 120_000_000)
            }
        }
        return ChunkResult(bytes: 0, nodeName: "", ok: false)
    }

    func probeMirrors() async {
        await probeDownloadMirrors()
    }

    func probeDownloadMirrors() async {
        guard !probingMirrors else { return }
        probingMirrors = true
        defer { probingMirrors = false }

        let candidates = Self.buildMirrorCandidates(
            info: updateInfo,
            preferredURL: nil,
            priorResults: [],
            includeLatestFallback: false
        )
        let results = await Self.runConcurrent256KProbe(candidates: candidates)
        self.mirrorResults = results
        self.lastMirrorProbeAt = CFAbsoluteTimeGetCurrent()
    }

    func startIPADownload(preferredMirrorURL: String? = nil) {
        guard !downloadingIPA else { return }
        downloadingIPA = true
        downloadProgress = 0
        downloadSpeedMBs = 0
        activeDownloadNode = "正在 256KB 实测吞吐择优…"
        downloadDetail = "正在并发探测各高速镜像真实吞吐（MB/s）与分块能力…"
        downloadedIPAURL = nil

        let explicitPinned = preferredMirrorURL?.trimmingCharacters(in: .whitespacesAndNewlines)
        let indexPinned: String? = {
            guard let idx = preferredMirrorIndex,
                  mirrorResults.indices.contains(idx),
                  mirrorResults[idx].ok else { return nil }
            return mirrorResults[idx].url
        }()
        let pinnedURL: String? = (explicitPinned?.isEmpty == false) ? explicitPinned : indexPinned

        let infoSnapshot = updateInfo
        let priorSnapshot = mirrorResults
        let priorAge = CFAbsoluteTimeGetCurrent() - lastMirrorProbeAt
        let candidates = Self.buildMirrorCandidates(
            info: infoSnapshot,
            preferredURL: pinnedURL,
            priorResults: priorSnapshot,
            includeLatestFallback: true
        )
        let ver = infoSnapshot?.latestVersion ?? Self.currentVersionString
        let build = infoSnapshot?.latestBuild ?? Self.currentBuildNumber
        let fallbackSizeMB = infoSnapshot?.ipaSizeMB ?? 42.7
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let dest = caches.appendingPathComponent("Updates/lieguoji-\(ver)-b\(build).ipa")
        let partDest = caches.appendingPathComponent("Updates/lieguoji-\(ver)-b\(build).ipa.part")

        let dlTask = Task { [weak self] in
            guard let self else { return }

            // 若 45 秒内已有完整的 256 KB 吞吐测速结果且包含目标节点，直接复用免等待；否则立即并发实测 256 KB 吞吐
            let hasFreshProbes: Bool = {
                guard priorAge < 45.0,
                      priorSnapshot.contains(where: { $0.ok && $0.supportsRange && $0.contentLength > 100_000 }) else {
                    return false
                }
                if let pinnedURL, !priorSnapshot.contains(where: { $0.url == pinnedURL && $0.ok && $0.contentLength > 100_000 }) {
                    return false
                }
                return true
            }()

            let probedResults: [MirrorProbeResult]
            if hasFreshProbes {
                var sorted = priorSnapshot
                Self.sortProbeResults(&sorted)
                probedResults = sorted
            } else {
                let fresh = await Self.runConcurrent256KProbe(candidates: candidates)
                if !Task.isCancelled {
                    self.mirrorResults = fresh
                    self.lastMirrorProbeAt = CFAbsoluteTimeGetCurrent()
                }
                probedResults = fresh
            }

            if Task.isCancelled {
                self.downloadingIPA = false
                self.downloadSpeedMBs = 0
                return
            }

            var healthy = probedResults.filter(\.ok)
            if let pinnedURL, let pinIdx = healthy.firstIndex(where: { $0.url == pinnedURL }), pinIdx > 0 {
                let pinnedItem = healthy.remove(at: pinIdx)
                healthy.insert(pinnedItem, at: 0)
            }

            guard let winner = healthy.first(where: { $0.supportsRange && $0.contentLength > 2 * 1024 * 1024 }) ?? healthy.first else {
                self.downloadingIPA = false
                self.activeDownloadNode = ""
                self.downloadSpeedMBs = 0
                self.downloadDetail = "未找到可用的满速直链，请点击「浏览器下载」或稍后重试"
                GameFeel.shared.notify(.error)
                return
            }

            let chunkBytes: Int64 = 2 * 1024 * 1024
            if winner.supportsRange && winner.contentLength > chunkBytes {
                let totalBytes = winner.contentLength
                let compatible = healthy.filter { $0.supportsRange && $0.contentLength == totalBytes }

                // 精选 Top 3 最快高速外部镜像并行拉取；其余可用镜像与源站作为热备故障切换池
                let fastExternal = compatible.filter { !Self.isOriginFallbackURL($0.url) && $0.speedMBps >= 0.15 }
                let slowOrOrigin = compatible.filter { Self.isOriginFallbackURL($0.url) || $0.speedMBps < 0.15 }

                var primaryProbes: [MirrorProbeResult] = []
                var backupProbes: [MirrorProbeResult] = []

                if !fastExternal.isEmpty {
                    if let pinnedURL,
                       let pinnedSlow = slowOrOrigin.first(where: { $0.url == pinnedURL }) {
                        primaryProbes.append(pinnedSlow)
                        primaryProbes.append(contentsOf: fastExternal.prefix(2))
                        backupProbes.append(contentsOf: fastExternal.dropFirst(2))
                        backupProbes.append(contentsOf: slowOrOrigin.filter { $0.url != pinnedURL })
                    } else {
                        primaryProbes = Array(fastExternal.prefix(3))
                        backupProbes.append(contentsOf: fastExternal.dropFirst(3))
                        backupProbes.append(contentsOf: slowOrOrigin)
                    }
                } else {
                    primaryProbes = Array(compatible.prefix(3))
                    backupProbes = Array(compatible.dropFirst(3))
                }
                if primaryProbes.isEmpty {
                    primaryProbes = [winner]
                }

                let primaryTuples: [(IPAMirrorCandidate, Double)] = primaryProbes.map {
                    (IPAMirrorCandidate(id: $0.id, name: $0.name, url: $0.url), $0.speedMBps)
                }
                let backupTuples: [(IPAMirrorCandidate, Double)] = backupProbes.map {
                    (IPAMirrorCandidate(id: $0.id, name: $0.name, url: $0.url), $0.speedMBps)
                }
                let pool = WeightedMirrorPool(primary: primaryTuples, backups: backupTuples, pinnedFirst: pinnedURL != nil)

                let dlCfg = URLSessionConfiguration.ephemeral
                dlCfg.httpMaximumConnectionsPerHost = 12
                dlCfg.timeoutIntervalForRequest = 16
                dlCfg.timeoutIntervalForResource = 300
                dlCfg.waitsForConnectivity = true
                let dlSession = URLSession(configuration: dlCfg)
                self.lifecycleBox.replaceIPASession(dlSession)
                defer {
                    self.lifecycleBox.clearIPASession(ifMatches: dlSession)
                }

                let writer: ChunkFileWriter
                do {
                    writer = try ChunkFileWriter(fileURL: partDest, totalSize: totalBytes)
                } catch {
                    self.startSingleStreamIPADownload(
                        candidate: IPAMirrorCandidate(id: winner.id, name: winner.name, url: winner.url),
                        dest: dest,
                        fallbackSizeMB: fallbackSizeMB
                    )
                    return
                }
                defer { writer.close() }

                var chunks: [ByteChunk] = []
                var offset: Int64 = 0
                var idx = 0
                while offset < totalBytes {
                    let end = min(totalBytes - 1, offset + chunkBytes - 1)
                    chunks.append(ByteChunk(index: idx, start: offset, end: end))
                    offset = end + 1
                    idx += 1
                }

                let workQueue = ChunkWorkQueue(chunks)
                let totalMB = Double(totalBytes) / 1_048_576.0
                let initialLabel = pool.routeSummaryLabel()
                self.activeDownloadNode = initialLabel
                self.downloadDetail = String(format: "%@ · 0.0 / %.1f MB", initialLabel, totalMB)

                let startTime = CFAbsoluteTimeGetCurrent()
                var bytesDone: Int64 = 0
                var failedChunks = 0
                let workerCount = min(8, chunks.count)
                var samples: [(Double, Int64)] = [(startTime, 0)]

                await withTaskGroup(of: ChunkResult.self) { group in
                    for _ in 0..<workerCount {
                        if let ch = workQueue.popNext() {
                            group.addTask {
                                await Self.downloadSingleChunkFromPool(ch, pool: pool, writer: writer, session: dlSession)
                            }
                        }
                    }
                    for await res in group {
                        if res.ok {
                            bytesDone += res.bytes
                            let now = CFAbsoluteTimeGetCurrent()
                            samples.append((now, bytesDone))
                            while samples.count > 2 && (now - samples[0].0) > 3.0 {
                                samples.removeFirst()
                            }
                            let avgMBs = (Double(bytesDone) / 1_048_576.0) / max(0.12, now - startTime)
                            let windowDt = now - samples[0].0
                            let instMBs = windowDt >= 0.30
                                ? (Double(bytesDone - samples[0].1) / 1_048_576.0) / windowDt
                                : avgMBs
                            let smoothMBs = self.downloadSpeedMBs > 0.01
                                ? (self.downloadSpeedMBs * 0.4 + instMBs * 0.6)
                                : instMBs

                            let routeLabel = pool.routeSummaryLabel()
                            self.activeDownloadNode = routeLabel
                            self.downloadSpeedMBs = smoothMBs
                            self.downloadProgress = min(0.99, Double(bytesDone) / Double(totalBytes))
                            self.downloadDetail = String(
                                format: "%@ · %.1f / %.1f MB · %.1f MB/s",
                                routeLabel,
                                Double(bytesDone) / 1_048_576.0,
                                totalMB,
                                smoothMBs
                            )
                        } else {
                            failedChunks += 1
                            group.cancelAll()
                        }
                        if failedChunks == 0 && !Task.isCancelled, let nextChunk = workQueue.popNext() {
                            group.addTask {
                                await Self.downloadSingleChunkFromPool(nextChunk, pool: pool, writer: writer, session: dlSession)
                            }
                        }
                    }
                }

                writer.close()

                if Task.isCancelled {
                    try? FileManager.default.removeItem(at: partDest)
                    self.downloadingIPA = false
                    self.downloadSpeedMBs = 0
                    return
                }

                if failedChunks == 0 && bytesDone == totalBytes {
                    do {
                        let fm = FileManager.default
                        let attrs = try fm.attributesOfItem(atPath: partDest.path)
                        let diskSize = (attrs[.size] as? NSNumber)?.int64Value ?? 0
                        guard diskSize == totalBytes else {
                            throw NSError(domain: "OnlinePlatform.Download", code: 3, userInfo: [NSLocalizedDescriptionKey: "安装包校验体积不一致"])
                        }
                        if fm.fileExists(atPath: dest.path) {
                            try fm.removeItem(at: dest)
                        }
                        try fm.moveItem(at: partDest, to: dest)
                        self.downloadingIPA = false
                        self.downloadProgress = 1.0
                        self.downloadDetail = String(format: "安装包已就绪（%.1f MB），请选择巨魔 / AltStore / SideStore 安装", totalMB)
                        self.downloadedIPAURL = dest
                        GameFeel.shared.notify(.success)
                        return
                    } catch {
                        try? FileManager.default.removeItem(at: partDest)
                        self.downloadingIPA = false
                        self.downloadSpeedMBs = 0
                        self.downloadDetail = "保存安装包失败：\(error.localizedDescription)"
                        GameFeel.shared.notify(.error)
                        return
                    }
                }

                try? FileManager.default.removeItem(at: partDest)
                self.startSingleStreamIPADownload(
                    candidate: IPAMirrorCandidate(id: winner.id, name: winner.name, url: winner.url),
                    dest: dest,
                    fallbackSizeMB: fallbackSizeMB
                )
            } else {
                self.startSingleStreamIPADownload(
                    candidate: IPAMirrorCandidate(id: winner.id, name: winner.name, url: winner.url),
                    dest: dest,
                    fallbackSizeMB: fallbackSizeMB
                )
            }
        }
        lifecycleBox.replaceIPATask(dlTask)
    }

    private func startSingleStreamIPADownload(candidate: IPAMirrorCandidate, dest: URL, fallbackSizeMB: Double) {
        lifecycleBox.clearSingleDownload(ifMatches: nil)

        guard let url = URL(string: candidate.url) else {
            downloadingIPA = false
            downloadSpeedMBs = 0
            downloadDetail = "下载链接无效"
            GameFeel.shared.notify(.error)
            return
        }
        activeDownloadNode = candidate.name
        downloadDetail = "正在从「\(candidate.name)」高速下载…"
        let nodeName = candidate.name

        let delegate = IPADownloadDelegate(
            destination: dest,
            onProgress: { [weak self] frac, got, total, speedMBs in
                Task { @MainActor in
                    guard let self else { return }
                    self.downloadProgress = frac
                    self.downloadSpeedMBs = speedMBs
                    let gotMB = Double(got) / 1_048_576.0
                    let totMB = total > 0 ? Double(total) / 1_048_576.0 : fallbackSizeMB
                    self.downloadDetail = String(format: "%@ · %.1f / %.1f MB · %.1f MB/s", nodeName, gotMB, totMB, speedMBs)
                }
            },
            onFinish: { [weak self] result in
                Task { @MainActor in
                    guard let self else { return }
                    self.lifecycleBox.clearSingleDownload(ifMatches: nil)
                    self.downloadingIPA = false
                    switch result {
                    case .success(let fileURL):
                        self.downloadProgress = 1.0
                        self.downloadDetail = "安装包已就绪，请选择巨魔 / AltStore / SideStore 安装"
                        self.downloadedIPAURL = fileURL
                        GameFeel.shared.notify(.success)
                    case .failure(let err):
                        self.downloadSpeedMBs = 0
                        if (err as? URLError)?.code == .cancelled {
                            self.downloadDetail = "已取消下载"
                        } else {
                            self.downloadDetail = "下载中止：\(err.localizedDescription)"
                            GameFeel.shared.notify(.error)
                        }
                    }
                }
            }
        )
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 25
        cfg.timeoutIntervalForResource = 300
        let s = URLSession(configuration: cfg, delegate: delegate, delegateQueue: nil)
        let task = s.downloadTask(with: url)
        lifecycleBox.replaceSingleDownload(session: s, task: task)
        task.resume()
    }

    func cancelIPADownload() {
        lifecycleBox.cancelDownloads()
        downloadingIPA = false
        downloadSpeedMBs = 0
        downloadDetail = "已取消下载"
    }

    // MARK: - 御前司礼监 · 管理员中枢接口（服务端严格校验 ethanhui 管理员令牌）

    private struct SimpleResp: Decodable {
        let ok: Bool
        let error: String?
    }

    func fetchAdminOverview() async -> AdminOverview? {
        struct Wrap: Decodable { let ok: Bool; let overview: AdminOverview? }
        guard let req = makeRequest("/api/v1/admin/overview", method: "GET", timeout: 10) else { return nil }
        guard let (data, resp) = try? await session.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let wrap = try? JSONDecoder().decode(Wrap.self, from: data), wrap.ok else { return nil }
        return wrap.overview
    }

    func fetchAdminUsers(query: String = "") async -> [AdminUserRow] {
        struct Wrap: Decodable { let ok: Bool; let users: [AdminUserRow]? }
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let req = makeRequest("/api/v1/admin/users?q=\(q)", method: "GET", timeout: 10) else { return [] }
        guard let (data, resp) = try? await session.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let wrap = try? JSONDecoder().decode(Wrap.self, from: data), wrap.ok else { return [] }
        return wrap.users ?? []
    }

    func adminPost(_ path: String, body: [String: Any]) async -> String? {
        guard let req = makeRequest(path, method: "POST", jsonBody: body, timeout: 12) else { return "网络请求失败" }
        do {
            let (data, _) = try await session.data(for: req)
            let res = try JSONDecoder().decode(SimpleResp.self, from: data)
            return res.ok ? nil : (res.error ?? "操作失败")
        } catch {
            return "连接服务器失败"
        }
    }

    func adminDeleteAnnouncement(id: Int) async -> String? {
        guard let req = makeRequest("/api/v1/admin/announcement/\(id)", method: "DELETE", timeout: 10) else { return "请求失败" }
        do {
            let (data, _) = try await session.data(for: req)
            let res = try JSONDecoder().decode(SimpleResp.self, from: data)
            if res.ok { _ = await bootstrap(manual: true, autoPrompt: false) }
            return res.ok ? nil : (res.error ?? "删除失败")
        } catch {
            return "连接服务器失败"
        }
    }

    // MARK: - 平台 v6 创意工坊云端舆图 API（浏览 / 下载 / 上传 / 点赞）

    private enum WorkshopError: LocalizedError {
        case message(String)
        var errorDescription: String? {
            if case .message(let m) = self { return m }
            return nil
        }
    }

    func fetchWorkshopMaps(region: String = "all", query: String = "") async -> [WorkshopMapSummary] {
        struct ListResp: Decodable {
            let ok: Bool
            let maps: [WorkshopMapSummary]?
            let error: String?
        }
        workshopLoading = true
        workshopError = nil
        defer { workshopLoading = false }

        var items: [URLQueryItem] = []
        let cleanRegion = region.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanRegion.isEmpty && cleanRegion.lowercased() != "all" {
            items.append(URLQueryItem(name: "region", value: cleanRegion))
        }
        let cleanQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanQuery.isEmpty {
            items.append(URLQueryItem(name: "q", value: cleanQuery))
        }
        var comps = URLComponents(string: Self.apiBase + "/api/v1/maps")
        if !items.isEmpty { comps?.queryItems = items }
        guard let url = comps?.url else {
            workshopError = "无效的工坊接口地址"
            return []
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        req.httpMethod = "GET"
        if let token, !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        do {
            let (data, resp) = try await session.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                workshopError = "获取工坊舆图列表失败"
                return []
            }
            let decoded = try JSONDecoder().decode(ListResp.self, from: data)
            if decoded.ok {
                let list = decoded.maps ?? []
                self.workshopMaps = list
                return list
            }
            workshopError = decoded.error ?? "获取工坊舆图列表失败"
            return []
        } catch {
            workshopError = "连接工坊服务器失败：\(error.localizedDescription)"
            return []
        }
    }

    func downloadWorkshopScenario(id: String) async throws -> HistoricalScenario {
        struct DetailResp: Decodable {
            let ok: Bool
            let map: WorkshopMapSummary?
            let scenario: HistoricalScenario?
            let error: String?
        }
        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        guard let req = makeRequest("/api/v1/maps/\(encodedId)", method: "GET", timeout: 20) else {
            throw WorkshopError.message("无效的舆图下载地址")
        }
        let (data, resp) = try await session.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let decoded = try JSONDecoder().decode(DetailResp.self, from: data)
        guard (200..<300).contains(status), decoded.ok, let scenario = decoded.scenario else {
            throw WorkshopError.message(decoded.error ?? "下载舆图失败（HTTP \(status)）")
        }
        if let updatedMap = decoded.map, let idx = workshopMaps.firstIndex(where: { $0.id == updatedMap.id }) {
            workshopMaps[idx] = updatedMap
        }
        return scenario
    }

    func uploadWorkshopScenario(_ scenario: HistoricalScenario, authorName: String? = nil) async throws -> WorkshopMapSummary {
        struct UploadBody: Encodable {
            let scenario: HistoricalScenario
            let authorName: String?
        }
        struct UploadResp: Decodable {
            let ok: Bool
            let id: String?
            let map: WorkshopMapSummary?
            let error: String?
        }
        guard let url = URL(string: Self.apiBase + "/api/v1/maps/upload") else {
            throw WorkshopError.message("无效的工坊上传地址")
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25)
        req.httpMethod = "POST"
        req.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        if let token, !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let trimmedAuthor = authorName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload = UploadBody(scenario: scenario, authorName: (trimmedAuthor?.isEmpty == false) ? trimmedAuthor : nil)
        req.httpBody = try JSONEncoder().encode(payload)

        let (data, resp) = try await session.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let decoded = try JSONDecoder().decode(UploadResp.self, from: data)
        guard (200..<300).contains(status), decoded.ok, let summary = decoded.map else {
            throw WorkshopError.message(decoded.error ?? "上传舆图失败（HTTP \(status)）")
        }
        if let idx = workshopMaps.firstIndex(where: { $0.id == summary.id }) {
            workshopMaps[idx] = summary
        } else {
            workshopMaps.insert(summary, at: 0)
        }
        return summary
    }

    func likeWorkshopMap(id: String) async -> Int? {
        struct LikeResp: Decodable {
            let ok: Bool
            let likes: Int?
        }
        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        guard let req = makeRequest("/api/v1/maps/\(encodedId)/like", method: "POST", jsonBody: [:], timeout: 10) else {
            return nil
        }
        guard let (data, resp) = try? await session.data(for: req),
              let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let decoded = try? JSONDecoder().decode(LikeResp.self, from: data),
              decoded.ok, let newLikes = decoded.likes else {
            return nil
        }
        if let idx = workshopMaps.firstIndex(where: { $0.id == id }) {
            workshopMaps[idx].likes = newLikes
        }
        return newLikes
    }
}

// MARK: - 本地创意工坊舆图仓库（Documents/列国纪/工坊舆图/）

enum LocalWorkshopStore {
    private static var directoryURL: URL {
        let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let dir = base.appendingPathComponent("列国纪/工坊舆图", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static func safeFileName(for id: String) -> String {
        let filtered = id.unicodeScalars.filter {
            ($0.value >= 48 && $0.value <= 57) ||
            ($0.value >= 65 && $0.value <= 90) ||
            ($0.value >= 97 && $0.value <= 122) ||
            $0.value == 45 || $0.value == 95
        }
        let clean = String(String(String.UnicodeScalarView(filtered)).prefix(64))
        if !clean.isEmpty { return "\(clean).json" }
        var h: UInt64 = 14695981039346656037
        for b in id.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        return "map_\(String(h, radix: 16)).json"
    }

    static func list() -> [HistoricalScenario] {
        let dir = directoryURL
        let fm = FileManager.default
        guard let urls = try? fm.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }
        let jsonFiles = urls.filter { $0.pathExtension.lowercased() == "json" }.sorted { a, b in
            let da = (try? a.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let db = (try? b.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return da > db
        }
        let decoder = JSONDecoder()
        return jsonFiles.compactMap { url in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return try? decoder.decode(HistoricalScenario.self, from: data)
        }
    }

    static func save(_ scenario: HistoricalScenario) throws {
        let dir = directoryURL
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let target = dir.appendingPathComponent(safeFileName(for: scenario.id))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(scenario)
        try data.write(to: target, options: .atomic)
    }

    static func delete(id: String) {
        let target = directoryURL.appendingPathComponent(safeFileName(for: id))
        try? FileManager.default.removeItem(at: target)
    }
}
