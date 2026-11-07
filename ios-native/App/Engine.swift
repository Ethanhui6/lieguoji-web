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
        /// 帅旗: "general" or "ruler" (御驾亲征), the commander's mark and name; nil for other armies.
        var reorganizing: Bool? = nil
        var banner: String? = nil; var bannerMark: String? = nil; var commander: String? = nil
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
    /// Sunk fleets being rebuilt at their docks (造舰), with the months left.
    struct Yard: Decodable, Equatable { let name: String; let nation: Int; let months: Double }
    var yards: [Yard]? = nil
    var ports: [Port]? = nil
    let wars: [War]
    let sieges: [Siege]
    /// Armies in contact (indices into armies), where the battle animation plays.
    var contacts: [[Int]]? = nil
    /// Province battle arrows: source, target, attacker, defender, start x y, control x y, end x y.
    var arrows: [[Double]]? = nil
    /// Contacts involving a fleet: the midpoint of the two forces.
    var seaBattles: [[Double]]? = nil
    let events: [Event]

    /// 纪年 (custom): an era name and a shift of the year, display only.
    var era: String? = nil
    var yearOffset: Int? = nil
    var displayYear: Int { date.year + (yearOffset ?? 0) }
    var dateText: String {
        let y = displayYear
        if let era, !era.isEmpty { return "\(era)\(y > 0 ? "\(y)" : "前\(1 - y)")年\(date.month)月\(date.day)日" }
        return y > 0 ? "公元\(y)年\(date.month)月\(date.day)日" : "公元前\(1 - y)年\(date.month)月\(date.day)日"
    }
    var shortDate: String { "\(date.year)年\(date.month)月" }
    func atWar(_ a: Int, _ b: Int) -> Bool { nations.indices.contains(a) && nations[a].enemies.contains(b) }
}

struct ProvinceInfo: Decodable {
    let population: Int; let grain: Double; let capacity: Int; let supply: Double; let controller: Int; let owner: Int
    let core: Bool?; let defense: Double?; let mountain: Bool?; let biomes: [Double]?; let income: Double?
    /// The main land (地形) and an army's march pace over it (1 = normal).
    var terrain: String? = nil; var pace: Double? = nil
    /// 特产 and its index in the goods list.
    var specialty: String? = nil; var specialtyIndex: Int? = nil
    /// The province city's own culture.
    var cityCulture: String? = nil
    /// 地利: each original arm's attack and defence multiplier on this land.
    struct Arm: Decodable { let unit: String; let attack: Double; let defense: Double }
    var combat: [Arm]? = nil
    /// The kinds of land this is, from what the engine weighs (core, fortress, granary, rich, mountain).
    var kinds: [(String, String)] {
        var out = [(String, String)]()
        if core == true { out.append(("核心", "近于国都，守军 +15%")) } else { out.append(("边地", "远离国都，无核心加成")) }
        if mountain == true { out.append(("山地", "易守难攻，行军减半")) }
        else if let t = terrain, let p = pace { out.append((t, p >= 1 ? "行军通畅" : "行军慢 \(Int(((1 - p) * 100).rounded()))%")) }
        if (defense ?? 1) >= 3 { out.append(("要塞", "城防 \(Int(defense ?? 1)) 级")) }
        if capacity > 0, Double(population) >= Double(capacity) * 0.8 { out.append(("富庶", "人口近于上限")) }
        if grain >= Double(max(1, population)) * 0.5 { out.append(("粮仓", "存粮充足")) }
        if let i = income, i > 1.02 { out.append(("善治", "地方官增收 \(Int(((i - 1) * 100).rounded()))%")) }
        return out
    }
}
struct CommandResult: Decodable { let ok: Bool; let reason: String; let state: GameState? }

struct LoadedWorld: Decodable {
    let bin: String
    let meta: WorldMeta
    let state: GameState
}

/// 编制: an army's echelon by its strength, named in its state's tradition (军/师/旅 in the east,
/// legions and cohorts for Rome, ten-thousands and thousands for the steppe), with an ordinal per state.
enum Echelon {
    static let thresholds = [40_000, 20_000, 10_000, 5_000, 2_000, 0]
    static func names(_ culture: String) -> [String] {
        switch culture {
        case "roman", "greek": return ["方面军", "军团群", "双军团", "军团", "大队", "百人队"]
        case "mongol", "turkic": return ["大军", "双万户", "万户", "千户", "千户", "百户"]
        case "japanese": return ["方面军", "军", "师团", "旅团", "联队", "大队"]
        case "arab", "persian", "egyptian": return ["大军", "军", "师", "旅", "团", "营"]
        default: return ["集团军", "军", "师", "旅", "团", "营"]
        }
    }
    static func level(_ troops: Int) -> Int { thresholds.firstIndex { troops >= $0 } ?? 5 }
    static func name(troops: Int, culture: String) -> String { names(culture)[level(troops)] }
    /// 第N师: the army's place among its state's armies of the same echelon (by strength).
    static func designation(_ state: GameState, _ map: WorldMap, army i: Int) -> String {
        guard state.armies.indices.contains(i) else { return "" }
        let a = state.armies[i], culture = map.meta.nations.indices.contains(a.nation) ? map.meta.nations[a.nation].culture : ""
        let lvl = level(a.troops)
        let peers = state.armies.indices.filter { state.armies[$0].nation == a.nation && level(state.armies[$0].troops) == lvl }
            .sorted { state.armies[$0].troops != state.armies[$1].troops ? state.armies[$0].troops > state.armies[$1].troops : state.armies[$0].id < state.armies[$1].id }
        let n = (peers.firstIndex(of: i) ?? 0) + 1
        return "第" + ChineseNumeral.of(min(99, n)) + names(culture)[lvl]
    }
}
