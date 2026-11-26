import Foundation
import Security
import SwiftUI
import UIKit

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

struct AnnouncementItem: Codable, Identifiable, Equatable {
    let id: Int
    let badge: String
    let title: String
    let content: String
    let pinned: Bool
    let createdAt: Double

    var dateText: String {
        let f = DateFormatter()
        f.dateFormat = "MM月dd日 HH:mm"
        return f.string(from: Date(timeIntervalSince1970: createdAt / 1000.0))
    }
}

struct InboxMail: Codable, Identifiable, Equatable {
    let id: Int
    let sender: String
    let title: String
    let content: String
    var read: Bool
    let createdAt: Double

    var dateText: String {
        let f = DateFormatter()
        f.dateFormat = "MM.dd HH:mm"
        return f.string(from: Date(timeIntervalSince1970: createdAt / 1000.0))
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

// MARK: - IPA 下载进度代理与 8 路并行分块辅助（全 Sendable，严格并发安全）

private struct IPAMirrorCandidate: Sendable {
    let id: String
    let name: String
    let url: String
}

private struct RangeProbeInfo: Sendable {
    let candidate: IPAMirrorCandidate
    let totalBytes: Int64
    let supportsRange: Bool
    let ttfbMs: Int
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

private final class ChunkFileWriter: @unchecked Sendable {
    private let lock = NSLock()
    private var handle: FileHandle?

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
        try fh.truncate(atOffset: UInt64(max(0, totalSize)))
        self.handle = fh
    }

    func write(_ data: Data, at offset: Int64) throws {
        lock.lock()
        defer { lock.unlock() }
        guard let fh = handle else {
            throw NSError(domain: "OnlinePlatform.ChunkWriter", code: 2, userInfo: [NSLocalizedDescriptionKey: "下载文件句柄已关闭"])
        }
        try fh.seek(toOffset: UInt64(offset))
        try fh.write(contentsOf: data)
    }

    func close() {
        lock.lock()
        defer { lock.unlock() }
        if let fh = handle {
            try? fh.synchronize()
            try? fh.close()
            handle = nil
        }
    }
}

private final class MirrorCursor: @unchecked Sendable {
    private let lock = NSLock()
    private var index = 0
    private var failStreak = 0
    let count: Int

    init(count: Int) {
        self.count = max(1, count)
    }

    func current() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return index
    }

    func reportSuccess(index i: Int) {
        lock.lock()
        index = i % count
        failStreak = 0
        lock.unlock()
    }

    func reportFailure(index i: Int) {
        lock.lock()
        if index == (i % count) {
            failStreak += 1
            if failStreak >= 2 && count > 1 {
                index = (index + 1) % count
                failStreak = 0
            }
        }
        lock.unlock()
    }
}

private final class IPADownloadDelegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    let onProgress: @Sendable (Double, Int64, Int64, Double) -> Void
    let onFinish: @Sendable (Result<URL, Error>) -> Void
    private let destination: URL
    private let startTime = CFAbsoluteTimeGetCurrent()

    init(destination: URL,
         onProgress: @escaping @Sendable (Double, Int64, Int64, Double) -> Void,
         onFinish: @escaping @Sendable (Result<URL, Error>) -> Void) {
        self.destination = destination
        self.onProgress = onProgress
        self.onFinish = onFinish
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
            onFinish(.success(destination))
        } catch {
            onFinish(.failure(error))
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error { onFinish(.failure(error)) }
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

    /// 默认专属腾讯云平台地址与计算节点（开机直连，国内实测 20–40 ms）
    nonisolated static let defaultPlatformBase = "http://111.230.153.235"
    nonisolated static let defaultComputeHost = "111.230.153.235:8765"

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

    // IPA 站内 8 路并行分块下载与多节点实时测速状态
    @Published private(set) var downloadingIPA = false
    @Published private(set) var downloadProgress: Double = 0
    @Published private(set) var downloadDetail: String = ""
    @Published var downloadedIPAURL: URL?
    @Published private(set) var mirrorResults: [MirrorProbeResult] = []
    @Published private(set) var probingMirrors = false
    @Published private(set) var activeDownloadNode: String = ""
    @Published private(set) var downloadSpeedMBs: Double = 0
    @Published private(set) var cloudChangelog: [CloudChangelogEntry] = []

    private var token: String?
    private var heartbeatTask: Task<Void, Never>?
    private var downloadSession: URLSession?
    private var downloadTask: URLSessionDownloadTask?
    private var ipaDownloadTask: Task<Void, Never>?
    private var ipaDownloadSession: URLSession?
    private var bootstrappedOnce = false

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 10
        cfg.timeoutIntervalForResource = 25
        cfg.waitsForConnectivity = false
        return URLSession(configuration: cfg)
    }()

    static var currentVersionString: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "5.3.0"
    }
    static var currentBuildNumber: Int {
        Int((Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "183") ?? 183
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
        guard heartbeatTask == nil else { return }
        heartbeatTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 90_000_000_000)
                await self.sendHeartbeat()
            }
        }
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

    // MARK: - 多节点测速择优 + 8 路并行 HTTP Range 满速分块下载 IPA（下完即刻呼出安装/自签共享窗）

    nonisolated private static func mirrorDisplayName(for urlString: String) -> String {
        let lower = urlString.lowercased()
        if lower.contains("lieguoji-edge.pages.dev") { return "Cloudflare 极速边缘" }
        if lower.contains("lieguoji-web.pages.dev") { return "Cloudflare 主站边缘" }
        if lower.contains("gh-proxy") || lower.contains("ghproxy") { return "GitHub 国内镜像" }
        if lower.contains("github.com") || lower.contains("githubusercontent.com") { return "GitHub 官方源" }
        if lower.contains("111.230.153.235") || lower.contains("/downloads/") { return "腾讯云直连" }
        if let host = URL(string: urlString)?.host, !host.isEmpty { return host }
        return "加速节点"
    }

    nonisolated private static func buildMirrorCandidates(
        info: AppUpdateInfo?,
        preferredURL: String?,
        priorResults: [MirrorProbeResult],
        includeLatestFallback: Bool
    ) -> [IPAMirrorCandidate] {
        var out: [IPAMirrorCandidate] = []
        var seen = Set<String>()

        func appendUnique(id: String, name: String? = nil, url: String) {
            let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, URL(string: trimmed) != nil, !seen.contains(trimmed) else { return }
            seen.insert(trimmed)
            out.append(IPAMirrorCandidate(id: id, name: name ?? mirrorDisplayName(for: trimmed), url: trimmed))
        }

        if let preferredURL, !preferredURL.isEmpty {
            appendUnique(id: "preferred", url: preferredURL)
        }

        for r in priorResults where r.ok {
            appendUnique(id: r.id, name: r.name, url: r.url)
        }

        if let info, !info.latestVersion.isEmpty, info.latestBuild > 0 {
            let ver = info.latestVersion.hasPrefix("v") ? String(info.latestVersion.dropFirst()) : info.latestVersion
            let tag = "v\(ver)"
            let fname = "lieguoji-\(ver)-build\(info.latestBuild)-unsigned.ipa"
            appendUnique(
                id: "cf-edge",
                name: "Cloudflare 极速边缘",
                url: "https://lieguoji-edge.pages.dev/api/cdn/ipa/\(tag)/\(fname)"
            )
            appendUnique(
                id: "cf-web",
                name: "Cloudflare 主站边缘",
                url: "https://lieguoji-web.pages.dev/api/cdn/ipa/\(tag)/\(fname)"
            )
            if let extras = info.ipaMirrors {
                for (idx, raw) in extras.enumerated() {
                    appendUnique(id: "mirror-\(idx)", url: raw)
                }
            }
            appendUnique(
                id: "github-direct",
                name: "GitHub 官方源",
                url: "https://github.com/Ethanhui6/lieguoji-web/releases/download/\(tag)/\(fname)"
            )
            if !info.directIpaUrl.isEmpty {
                appendUnique(id: "direct-ipa", url: info.directIpaUrl)
            }
        } else {
            appendUnique(
                id: "cf-edge-latest",
                name: "Cloudflare 极速边缘",
                url: "https://lieguoji-edge.pages.dev/api/cdn/ipa/latest"
            )
            appendUnique(
                id: "cf-web-latest",
                name: "Cloudflare 主站边缘",
                url: "https://lieguoji-web.pages.dev/api/cdn/ipa/latest"
            )
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
        }

        if includeLatestFallback {
            appendUnique(
                id: "cf-edge-latest",
                name: "Cloudflare 极速边缘",
                url: "https://lieguoji-edge.pages.dev/api/cdn/ipa/latest"
            )
        }

        let originBase = OnlinePlatform.apiBase
        appendUnique(
            id: "tencent-direct",
            name: "腾讯云直连",
            url: "\(originBase)/downloads/lieguoji-latest.ipa"
        )
        if originBase != OnlinePlatform.defaultPlatformBase {
            appendUnique(
                id: "tencent-default",
                name: "腾讯云直连",
                url: "\(OnlinePlatform.defaultPlatformBase)/downloads/lieguoji-latest.ipa"
            )
        }

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

    nonisolated private static func probeSingleMirror128K(_ candidate: IPAMirrorCandidate, session: URLSession) async -> MirrorProbeResult {
        guard let url = URL(string: candidate.url) else {
            return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5.0)
        req.httpMethod = "GET"
        req.setValue("bytes=0-131071", forHTTPHeaderField: "Range")
        req.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        let t0 = CFAbsoluteTimeGetCurrent()
        do {
            let (data, resp) = try await session.data(for: req)
            let dt = max(0.005, CFAbsoluteTimeGetCurrent() - t0)
            guard let http = resp as? HTTPURLResponse,
                  (http.statusCode == 206 || http.statusCode == 200),
                  data.count >= 1024,
                  Self.isLikelyZipHeader(data) else {
                return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
            }
            let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
            if ct.contains("text/html") {
                return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
            }
            let ms = max(1, Int((dt * 1000.0).rounded()))
            let mbps = (Double(data.count) / 1_048_576.0) / dt
            return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: ms, speedMBs: mbps, ok: true)
        } catch {
            return MirrorProbeResult(id: candidate.id, name: candidate.name, url: candidate.url, latencyMs: nil, speedMBs: nil, ok: false)
        }
    }

    nonisolated private static func probeSingleMirrorRange(_ candidate: IPAMirrorCandidate, session: URLSession) async -> RangeProbeInfo? {
        guard let url = URL(string: candidate.url) else { return nil }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5.0)
        req.httpMethod = "GET"
        req.setValue("bytes=0-0", forHTTPHeaderField: "Range")
        req.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        let t0 = CFAbsoluteTimeGetCurrent()
        do {
            let (data, resp) = try await session.data(for: req)
            let ms = max(1, Int(((CFAbsoluteTimeGetCurrent() - t0) * 1000.0).rounded()))
            guard let http = resp as? HTTPURLResponse else { return nil }
            let ct = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
            if ct.contains("text/html") { return nil }
            if http.statusCode == 206 {
                guard Self.isLikelyZipHeader(data),
                      let total = Self.parseTotalBytes(fromContentRange: http.value(forHTTPHeaderField: "Content-Range")),
                      total > 100_000 else {
                    return nil
                }
                return RangeProbeInfo(candidate: candidate, totalBytes: total, supportsRange: true, ttfbMs: ms)
            }
            if http.statusCode == 200 {
                let clHeader = http.value(forHTTPHeaderField: "Content-Length").flatMap { Int64($0) }
                let total = clHeader ?? Int64(data.count)
                guard total > 100_000, Self.isLikelyZipHeader(data) else { return nil }
                return RangeProbeInfo(candidate: candidate, totalBytes: total, supportsRange: false, ttfbMs: ms)
            }
            return nil
        } catch {
            return nil
        }
    }

    nonisolated private static func downloadSingleChunk(
        _ chunk: ByteChunk,
        mirrors: [IPAMirrorCandidate],
        cursor: MirrorCursor,
        writer: ChunkFileWriter,
        session: URLSession
    ) async -> ChunkResult {
        guard !mirrors.isEmpty else { return ChunkResult(bytes: 0, nodeName: "", ok: false) }
        let maxAttempts = max(3, mirrors.count * 2)
        for attempt in 0..<maxAttempts {
            if Task.isCancelled { return ChunkResult(bytes: 0, nodeName: "", ok: false) }
            let mirrorIdx = (cursor.current() + attempt) % mirrors.count
            let mirror = mirrors[mirrorIdx]
            guard let url = URL(string: mirror.url) else {
                cursor.reportFailure(index: mirrorIdx)
                continue
            }
            var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 22)
            req.httpMethod = "GET"
            req.setValue("bytes=\(chunk.start)-\(chunk.end)", forHTTPHeaderField: "Range")
            req.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
            do {
                let (data, resp) = try await session.data(for: req)
                guard let http = resp as? HTTPURLResponse,
                      http.statusCode == 206,
                      Int64(data.count) == chunk.length else {
                    cursor.reportFailure(index: mirrorIdx)
                    continue
                }
                if chunk.index == 0 && !Self.isLikelyZipHeader(data) {
                    cursor.reportFailure(index: mirrorIdx)
                    continue
                }
                try writer.write(data, at: chunk.start)
                cursor.reportSuccess(index: mirrorIdx)
                return ChunkResult(bytes: chunk.length, nodeName: mirror.name, ok: true)
            } catch {
                if Task.isCancelled { return ChunkResult(bytes: 0, nodeName: mirror.name, ok: false) }
                cursor.reportFailure(index: mirrorIdx)
                try? await Task.sleep(nanoseconds: 180_000_000)
            }
        }
        return ChunkResult(bytes: 0, nodeName: "", ok: false)
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
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 5.0
        cfg.timeoutIntervalForResource = 5.5
        cfg.waitsForConnectivity = false
        cfg.httpMaximumConnectionsPerHost = 6
        let probeSession = URLSession(configuration: cfg)
        defer { probeSession.invalidateAndCancel() }

        var results: [MirrorProbeResult] = []
        await withTaskGroup(of: MirrorProbeResult.self) { group in
            for c in candidates {
                group.addTask {
                    await Self.probeSingleMirror128K(c, session: probeSession)
                }
            }
            for await res in group {
                results.append(res)
            }
        }

        results.sort { a, b in
            if a.ok != b.ok { return a.ok && !b.ok }
            if a.ok && b.ok {
                let sa = a.speedMBs ?? 0
                let sb = b.speedMBs ?? 0
                if abs(sa - sb) > 0.05 { return sa > sb }
                return (a.latencyMs ?? Int.max) < (b.latencyMs ?? Int.max)
            }
            return a.name < b.name
        }
        self.mirrorResults = results
    }

    func startIPADownload(preferredMirrorURL: String? = nil) {
        guard !downloadingIPA else { return }
        downloadingIPA = true
        downloadProgress = 0
        downloadSpeedMBs = 0
        activeDownloadNode = "正在测速择优节点…"
        downloadDetail = "正在探测满速下载节点与分块能力…"
        downloadedIPAURL = nil

        let infoSnapshot = updateInfo
        let priorSnapshot = mirrorResults
        let candidates = Self.buildMirrorCandidates(
            info: infoSnapshot,
            preferredURL: preferredMirrorURL,
            priorResults: priorSnapshot,
            includeLatestFallback: true
        )
        let ver = infoSnapshot?.latestVersion ?? Self.currentVersionString
        let build = infoSnapshot?.latestBuild ?? Self.currentBuildNumber
        let fallbackSizeMB = infoSnapshot?.ipaSizeMB ?? 42.5
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let dest = caches.appendingPathComponent("Updates/lieguoji-\(ver)-b\(build).ipa")
        let partDest = caches.appendingPathComponent("Updates/lieguoji-\(ver)-b\(build).ipa.part")

        ipaDownloadTask?.cancel()
        ipaDownloadTask = Task { [weak self] in
            guard let self else { return }

            let probeCfg = URLSessionConfiguration.ephemeral
            probeCfg.timeoutIntervalForRequest = 5.0
            probeCfg.timeoutIntervalForResource = 6.0
            probeCfg.waitsForConnectivity = false
            probeCfg.httpMaximumConnectionsPerHost = 6
            let probeSession = URLSession(configuration: probeCfg)

            var healthyProbes: [RangeProbeInfo] = []
            if let preferredMirrorURL, !preferredMirrorURL.isEmpty, let first = candidates.first(where: { $0.url == preferredMirrorURL }) {
                if let p = await Self.probeSingleMirrorRange(first, session: probeSession) {
                    healthyProbes.append(p)
                }
            }
            if healthyProbes.isEmpty {
                await withTaskGroup(of: RangeProbeInfo?.self) { group in
                    for c in candidates {
                        group.addTask {
                            await Self.probeSingleMirrorRange(c, session: probeSession)
                        }
                    }
                    for await probe in group {
                        if let probe {
                            healthyProbes.append(probe)
                        }
                    }
                }
                healthyProbes.sort { a, b in
                    if a.supportsRange != b.supportsRange { return a.supportsRange && !b.supportsRange }
                    return a.ttfbMs < b.ttfbMs
                }
            } else {
                // 也并发收集其余兼容分块的备用节点，供单块容错秒切
                let primaryURL = healthyProbes[0].candidate.url
                let expectedSize = healthyProbes[0].totalBytes
                let others = candidates.filter { $0.url != primaryURL }
                await withTaskGroup(of: RangeProbeInfo?.self) { group in
                    for c in others {
                        group.addTask {
                            await Self.probeSingleMirrorRange(c, session: probeSession)
                        }
                    }
                    for await probe in group {
                        if let probe, probe.supportsRange, probe.totalBytes == expectedSize {
                            healthyProbes.append(probe)
                        }
                    }
                }
            }
            probeSession.invalidateAndCancel()

            if Task.isCancelled {
                self.downloadingIPA = false
                self.downloadSpeedMBs = 0
                return
            }

            guard let winner = healthyProbes.first else {
                self.downloadingIPA = false
                self.activeDownloadNode = ""
                self.downloadSpeedMBs = 0
                self.downloadDetail = "未找到可用的满速直链，请点击「浏览器下载」或稍后重试"
                GameFeel.shared.notify(.error)
                return
            }

            // 若支持 206 Range 且文件大于 2 MB，则启动 8 路并行 2 MB 分块满速下载
            let chunkBytes: Int64 = 2 * 1024 * 1024
            if winner.supportsRange && winner.totalBytes > chunkBytes {
                let totalBytes = winner.totalBytes
                let rangeMirrors = healthyProbes
                    .filter { $0.supportsRange && $0.totalBytes == totalBytes }
                    .map(\.candidate)
                let activeMirrors = rangeMirrors.isEmpty ? [winner.candidate] : rangeMirrors

                let dlCfg = URLSessionConfiguration.ephemeral
                dlCfg.httpMaximumConnectionsPerHost = 12
                dlCfg.timeoutIntervalForRequest = 20
                dlCfg.timeoutIntervalForResource = 300
                dlCfg.waitsForConnectivity = true
                let dlSession = URLSession(configuration: dlCfg)
                self.ipaDownloadSession = dlSession

                let writer: ChunkFileWriter
                do {
                    writer = try ChunkFileWriter(fileURL: partDest, totalSize: totalBytes)
                } catch {
                    dlSession.invalidateAndCancel()
                    self.ipaDownloadSession = nil
                    self.startSingleStreamIPADownload(candidate: winner.candidate, dest: dest, fallbackSizeMB: fallbackSizeMB)
                    return
                }

                var chunks: [ByteChunk] = []
                var offset: Int64 = 0
                var idx = 0
                while offset < totalBytes {
                    let end = min(totalBytes - 1, offset + chunkBytes - 1)
                    chunks.append(ByteChunk(index: idx, start: offset, end: end))
                    offset = end + 1
                    idx += 1
                }

                let cursor = MirrorCursor(count: activeMirrors.count)
                let totalMB = Double(totalBytes) / 1_048_576.0
                self.activeDownloadNode = winner.candidate.name
                self.downloadDetail = String(format: "%@（8 路满速）· 0.0 / %.1f MB", winner.candidate.name, totalMB)

                let startTime = CFAbsoluteTimeGetCurrent()
                var bytesDone: Int64 = 0
                var failedChunks = 0
                var nextIdx = 0
                let workerCount = 8
                var samples: [(Double, Int64)] = [(startTime, 0)]

                await withTaskGroup(of: ChunkResult.self) { group in
                    let initial = min(workerCount, chunks.count)
                    for _ in 0..<initial {
                        let ch = chunks[nextIdx]
                        nextIdx += 1
                        group.addTask {
                            await Self.downloadSingleChunk(ch, mirrors: activeMirrors, cursor: cursor, writer: writer, session: dlSession)
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
                            let instMBs = windowDt >= 0.35
                                ? (Double(bytesDone - samples[0].1) / 1_048_576.0) / windowDt
                                : avgMBs
                            let smoothMBs = self.downloadSpeedMBs > 0.01
                                ? (self.downloadSpeedMBs * 0.45 + instMBs * 0.55)
                                : instMBs

                            self.activeDownloadNode = res.nodeName
                            self.downloadSpeedMBs = smoothMBs
                            self.downloadProgress = min(0.99, Double(bytesDone) / Double(totalBytes))
                            self.downloadDetail = String(
                                format: "%@（8 路满速）· %.1f / %.1f MB · %.1f MB/s",
                                res.nodeName,
                                Double(bytesDone) / 1_048_576.0,
                                totalMB,
                                smoothMBs
                            )
                        } else {
                            failedChunks += 1
                            group.cancelAll()
                        }
                        if nextIdx < chunks.count && failedChunks == 0 && !Task.isCancelled {
                            let ch = chunks[nextIdx]
                            nextIdx += 1
                            group.addTask {
                                await Self.downloadSingleChunk(ch, mirrors: activeMirrors, cursor: cursor, writer: writer, session: dlSession)
                            }
                        }
                    }
                }

                writer.close()
                dlSession.invalidateAndCancel()
                self.ipaDownloadSession = nil

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

                // 分块异常时清理临时文件并平滑降级至单流下载
                try? FileManager.default.removeItem(at: partDest)
                self.startSingleStreamIPADownload(candidate: winner.candidate, dest: dest, fallbackSizeMB: fallbackSizeMB)
            } else {
                self.startSingleStreamIPADownload(candidate: winner.candidate, dest: dest, fallbackSizeMB: fallbackSizeMB)
            }
        }
    }

    private func startSingleStreamIPADownload(candidate: IPAMirrorCandidate, dest: URL, fallbackSizeMB: Double) {
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
                    self.downloadingIPA = false
                    self.downloadTask = nil
                    self.downloadSession?.invalidateAndCancel()
                    self.downloadSession = nil
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
        let s = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        downloadSession = s
        let task = s.downloadTask(with: url)
        downloadTask = task
        task.resume()
    }

    func cancelIPADownload() {
        ipaDownloadTask?.cancel()
        ipaDownloadTask = nil
        ipaDownloadSession?.invalidateAndCancel()
        ipaDownloadSession = nil
        downloadTask?.cancel()
        downloadSession?.invalidateAndCancel()
        downloadTask = nil
        downloadSession = nil
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
}
