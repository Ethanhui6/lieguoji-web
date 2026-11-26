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
}

struct AppUpdateInfo: Codable, Equatable {
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

    var preferredExternalURL: URL? {
        if !webDownloadUrl.isEmpty, let u = URL(string: webDownloadUrl) { return u }
        if !directIpaUrl.isEmpty, let u = URL(string: directIpaUrl) { return u }
        if !downloadUrl.isEmpty, let u = URL(string: downloadUrl) { return u }
        return nil
    }
}

struct ServerSnapshot: Codable, Equatable {
    let name: String
    let region: String
    let publicHost: String
    let computeHost: String
    let computeOnline: Bool
    let computeGreeting: String
    let onlineCount: Int
    let totalUsers: Int
    let totalSaves: Int
    let uptimeSeconds: Int
    let serverTimeMs: Double

    var uptimeText: String {
        let h = uptimeSeconds / 3600
        let d = h / 24
        if d > 0 { return "\(d) 天 \(h % 24) 时" }
        if h > 0 { return "\(h) 小时 \((uptimeSeconds % 3600) / 60) 分" }
        return "\(max(1, uptimeSeconds / 60)) 分钟"
    }
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

// MARK: - IPA 下载进度代理

private final class IPADownloadDelegate: NSObject, URLSessionDownloadDelegate {
    let onProgress: (Double, Int64, Int64) -> Void
    let onFinish: (Result<URL, Error>) -> Void
    private let destination: URL

    init(destination: URL,
         onProgress: @escaping (Double, Int64, Int64) -> Void,
         onFinish: @escaping (Result<URL, Error>) -> Void) {
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
        onProgress(frac, totalBytesWritten, totalBytesExpectedToWrite)
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
    private static let tokenLock = NSLock()
    private static var _cachedToken: String?
    nonisolated static var currentToken: String? {
        tokenLock.lock()
        defer { tokenLock.unlock() }
        return _cachedToken
    }
    private static func syncCachedToken(_ t: String?) {
        tokenLock.lock()
        _cachedToken = t
        tokenLock.unlock()
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

    // IPA 站内流式下载状态
    @Published private(set) var downloadingIPA = false
    @Published private(set) var downloadProgress: Double = 0
    @Published private(set) var downloadDetail: String = ""
    @Published var downloadedIPAURL: URL?

    private var token: String?
    private var heartbeatTask: Task<Void, Never>?
    private var downloadSession: URLSession?
    private var downloadTask: URLSessionDownloadTask?
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
    func bootstrap(manual: Bool = false) async -> Bool {
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
                if upd.hasAppUpdate && (manual || upd.forceUpdate || dismissedBuild < upd.latestBuild) {
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

    // MARK: - 应用内国内直链流式下载 IPA（下完即刻呼出系统安装/自签共享窗）

    func startIPADownload() {
        guard !downloadingIPA,
              let info = updateInfo,
              !info.directIpaUrl.isEmpty,
              let url = URL(string: info.directIpaUrl) else { return }
        downloadingIPA = true
        downloadProgress = 0
        downloadDetail = "正在连接国内加速节点…"
        downloadedIPAURL = nil

        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let dest = caches.appendingPathComponent("Updates/lieguoji-\(info.latestVersion)-b\(info.latestBuild).ipa")

        let delegate = IPADownloadDelegate(
            destination: dest,
            onProgress: { [weak self] frac, got, total in
                Task { @MainActor in
                    guard let self else { return }
                    self.downloadProgress = frac
                    let gotMB = Double(got) / 1_048_576.0
                    let totMB = total > 0 ? Double(total) / 1_048_576.0 : info.ipaSizeMB
                    self.downloadDetail = String(format: "国内专线下载中 %.1f / %.1f MB（%d%%）", gotMB, totMB, Int(frac * 100))
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
                        self.downloadDetail = "下载中止：\(err.localizedDescription)"
                        GameFeel.shared.notify(.error)
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
        downloadTask?.cancel()
        downloadSession?.invalidateAndCancel()
        downloadTask = nil
        downloadSession = nil
        downloadingIPA = false
        downloadDetail = "已取消下载"
    }
}
