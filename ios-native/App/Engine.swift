import SwiftUI
import WebKit
import LieguojiCore

/// The web game's own engine (src/native-bridge/engine.ts, bundled as Resources/Engine/engine.js),
/// hosted in an invisible WebKit context so it runs with the JavaScript JIT. Nothing of it is ever
/// shown: the app draws the map and every panel natively and only exchanges JSON with the engine.
@MainActor final class EngineHost: NSObject, WKNavigationDelegate {
    let web: WKWebView
    private var ready: CheckedContinuation<Void, Error>?
    private var loaded = false

    override init() {
        let config = WKWebViewConfiguration()
        config.suppressesIncrementalRendering = true
        web = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        web.isUserInteractionEnabled = false
        web.alpha = 0.01
        super.init()
        web.navigationDelegate = self
    }

    func start() async throws {
        if loaded { return }
        guard let html = Bundle.main.url(forResource: "engine", withExtension: "html", subdirectory: "Engine") else { throw EngineError.message("安装包缺少游戏引擎") }
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            ready = c
            web.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())
        }
        loaded = true
    }
    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { Task { @MainActor in ready?.resume(); ready = nil } }
    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { Task { @MainActor in ready?.resume(throwing: error); ready = nil } }
    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { Task { @MainActor in ready?.resume(throwing: error); ready = nil } }
    /// WebKit restarts a terminated content process with an empty page; the game must be reloaded.
    var onCrash: (() -> Void)?
    nonisolated func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { Task { @MainActor in loaded = false; onCrash?() } }

    /// Calls `NativeGame.<body>` and returns its JSON string.
    func call(_ body: String, _ arguments: [String: Any] = [:]) async throws -> String {
        try await start()
        do {
            let value = try await web.callAsyncJavaScript("return await NativeGame.\(body)", arguments: arguments, in: nil, contentWorld: .page)
            guard let text = value as? String else { throw EngineError.message("引擎没有返回结果") }
            return text
        } catch let error as NSError {
            let message = (error.userInfo["WKJavaScriptExceptionMessage"] as? String) ?? error.localizedDescription
            throw EngineError.message(message.replacingOccurrences(of: "Error: ", with: ""))
        }
    }
}

enum EngineError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
}

/// Keeps the engine's web view inside the window (WebKit suspends detached views).
struct EngineView: UIViewRepresentable {
    let host: EngineHost
    func makeUIView(context: Context) -> UIView { let v = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1)); v.addSubview(host.web); v.isUserInteractionEnabled = false; return v }
    func updateUIView(_ view: UIView, context: Context) {}
}

// MARK: the engine's compact state (engine.ts state())

struct GameState: Decodable, Equatable {
    struct Date: Decodable, Equatable { let year: Int; let month: Int; let day: Int }
    struct Nation: Decodable, Equatable {
        /// Identity (Swift engine): states founded in play extend the opening map's legend.
        var id: String? = nil; var name: String? = nil; var color: String? = nil; var line: String? = nil
        var capital: Int? = nil; var culture: String? = nil; var polity: String? = nil; var religion: String? = nil
        let provinces: Int; let cities: Int; let population: Int; let grain: Double; let troops: Int; let gold: Double; let destiny: Double
        let enemies: [Int]; let alive: Bool
    }
    struct Army: Decodable, Equatable, Identifiable {
        let id: String; let name: String; let nation: Int; let troops: Int; let unit: String; let status: String; let travel: String
        let province: Int; let supplies: Int; let morale: Int; let x: Float; let y: Float; let manual: Bool
        let destination: Int?; let mission: String?
    }
    /// A fleet at its actual sea point (open-sea worlds) and its naval command.
    struct Fleet: Decodable, Equatable, Identifiable {
        let id: String; let name: String; let nation: Int; let ships: Int; let crew: Int; let food: Int; let hull: Double
        let status: String; let travel: String; let x: Float; let y: Float; let decision: String; let reason: String; let port: Int; let manual: Bool; let patrol: Bool
    }
    /// A harbour port: its land owner, current occupier and control value.
    struct Port: Decodable, Equatable { let province: Int; let x: Float; let y: Float; let owner: Int; let occupier: Int; let value: Double }
    struct Participant: Decodable, Equatable { let nation: Int; let side: Int }
    struct Claim: Decodable, Equatable { let province: Int; let nation: Int }
    struct War: Decodable, Equatable, Identifiable {
        let id: Int; let attacker: Int; let defender: Int; let casusBelli: String; let goal: String; let startDay: Int; let participants: [Participant]
        var claims: [Claim]? = nil
    }
    struct Siege: Decodable, Equatable { let province: Int; let nation: Int; let progress: Double }
    struct Event: Decodable, Equatable { let day: Int; let text: String; let kind: String }
    let day: Int
    let date: Date
    let owners: [Int]
    let labels: [WorldMeta.LabelBox]?
    let nations: [Nation]
    let armies: [Army]
    var fleets: [Fleet]? = nil
    var ports: [Port]? = nil
    let wars: [War]
    let sieges: [Siege]
    /// Armies in contact (indices into armies), where the battle animation plays.
    var contacts: [[Int]]? = nil
    let events: [Event]

    var dateText: String { date.year > 0 ? "公元\(date.year)年\(date.month)月\(date.day)日" : "公元前\(1 - date.year)年\(date.month)月\(date.day)日" }
    var shortDate: String { "\(date.year)年\(date.month)月" }
    func atWar(_ a: Int, _ b: Int) -> Bool { nations.indices.contains(a) && nations[a].enemies.contains(b) }
}

struct ProvinceInfo: Decodable { let population: Int; let grain: Double; let capacity: Int; let supply: Double; let controller: Int; let owner: Int }
struct CommandResult: Decodable { let ok: Bool; let reason: String; let state: GameState? }

struct LoadedWorld: Decodable {
    let bin: String
    let meta: WorldMeta
    let state: GameState
}
