import Foundation
import LieguojiCore

/// 云更新配置引擎：优先从列国纪专属腾讯云平台服（/api/v1/bootstrap）实时热加载平衡数值、
/// 推演节拍、服务器节点与开服公告；离线或未连接时平滑回落至本地持久化缓存与 GitHub CDN。
@MainActor final class CloudConfig: ObservableObject {
    static let shared = CloudConfig()
    struct Payload: Decodable {
        var version: Int?
        var notice: String?
        var computeHost: String?
        var pace: [String: Int]?
        var tuning: Tuning?
    }
    @Published private(set) var notice: String?
    @Published private(set) var version = 0
    @Published private(set) var computeHost: String?
    @Published private(set) var tuning: Tuning?
    /// Days per step by speed (1×, 2×, …), overriding the built-in table where given.
    private(set) var pace: [Int: Int] = [:]
    /// The Tuning as JSON, for the engine.
    private(set) var tuningData: Data?
    static let urls = [
        "https://cdn.jsdelivr.net/gh/Ethanhui6/lieguoji-web@main/ios-native/Cloud/config.json",
        "https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main/ios-native/Cloud/config.json"
    ]
    static let key = "cloudConfig.v1"

    private init() {
        if let d = UserDefaults.standard.data(forKey: Self.key) {
            _ = apply(d)
        }
    }

    private func apply(_ data: Data) -> Bool {
        guard let p = try? JSONDecoder().decode(Payload.self, from: data) else { return false }
        // v11.0.0 单调版本守卫：防止低版本 GitHub 静态配置回滚平台服已下发的高版本热调数值
        if let incoming = p.version, incoming > 0, incoming < version {
            return false
        }
        // v11.0.0 永久关闭跑马灯横幅
        notice = nil
        version = max(version, p.version ?? 0)
        if let host = p.computeHost, !host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            computeHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        pace = Dictionary((p.pace ?? [:]).compactMap { k, v in Int(k).map { ($0, max(1, min(60, v))) } }, uniquingKeysWith: { a, _ in a })
        tuning = p.tuning
        tuningData = p.tuning.flatMap { try? JSONEncoder().encode($0) }
        return true
    }

    /// 接入专属平台服务器下发的热更配置包（立即持久化并生效，无需重装客户端）。
    @discardableResult
    func applyServerHotpatch(_ configData: Data, patchVersion: Int) -> Bool {
        let old = UserDefaults.standard.data(forKey: Self.key)
        guard apply(configData) else { return false }
        if patchVersion > version { version = patchVersion }
        UserDefaults.standard.set(configData, forKey: Self.key)
        return old != configData
    }

    /// 兜底拉取仓库静态云配置（仅在平台服不可达时使用）。
    @discardableResult
    func refresh() async -> Bool {
        for s in Self.urls {
            guard let url = URL(string: s) else { continue }
            let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { continue }
            let old = UserDefaults.standard.data(forKey: Self.key)
            guard apply(data) else { continue }
            UserDefaults.standard.set(data, forKey: Self.key)
            return old != data
        }
        return false
    }
}
