import Foundation
import LieguojiCore

/// 云更新: the balance numbers (Tuning), the game pace and a notice, fetched at launch from the
/// repository's ios-native/Cloud/config.json (jsDelivr first, then GitHub) and kept for launches
/// without a network. Numbers and notices change for every player at their next launch; new features
/// still need a new build (iOS runs no downloaded code).
@MainActor final class CloudConfig: ObservableObject {
    static let shared = CloudConfig()
    struct Payload: Decodable { var version: Int?; var notice: String?; var pace: [String: Int]?; var tuning: Tuning? }
    @Published private(set) var notice: String?
    @Published private(set) var version = 0
    /// Days per step by speed (1×, 2×, …), overriding the built-in table where given.
    private(set) var pace: [Int: Int] = [:]
    /// The Tuning as JSON, for the engine.
    private(set) var tuningData: Data?
    static let urls = ["https://cdn.jsdelivr.net/gh/Ethanhui6/lieguoji-web@main/ios-native/Cloud/config.json",
                       "https://raw.githubusercontent.com/Ethanhui6/lieguoji-web/main/ios-native/Cloud/config.json"]
    static let key = "cloudConfig.v1"
    private init() { if let d = UserDefaults.standard.data(forKey: Self.key) { _ = apply(d) } }
    private func apply(_ data: Data) -> Bool {
        guard let p = try? JSONDecoder().decode(Payload.self, from: data) else { return false }
        notice = (p.notice ?? "").isEmpty ? nil : p.notice
        version = p.version ?? 0
        pace = Dictionary((p.pace ?? [:]).compactMap { k, v in Int(k).map { ($0, max(1, min(60, v))) } }, uniquingKeysWith: { a, _ in a })
        tuningData = p.tuning.flatMap { try? JSONEncoder().encode($0) }
        return true
    }
    /// Fetches the latest config; true when it differs from the one kept.
    @discardableResult
    func refresh() async -> Bool {
        for s in Self.urls {
            guard let url = URL(string: s) else { continue }
            let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
            guard let (data, response) = try? await URLSession.shared.data(for: request), (response as? HTTPURLResponse)?.statusCode == 200 else { continue }
            let old = UserDefaults.standard.data(forKey: Self.key)
            guard apply(data) else { continue }
            UserDefaults.standard.set(data, forKey: Self.key)
            return old != data
        }
        return false
    }
}
