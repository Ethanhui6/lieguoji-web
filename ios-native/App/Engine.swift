import SwiftUI
import WebKit
import LieguojiCore

/// The web game's own engine (src/native-bridge/engine.ts, bundled as Resources/Engine/engine.js),
/// hosted in an invisible WebKit context so it runs with the JavaScript JIT. Nothing of it is ever
/// shown: the app draws the map and every panel natively and only exchanges JSON with the engine.
@MainActor final class EngineHost: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    private(set) var web: WKWebView
    private var ready: CheckedContinuation<Void, Error>?
    private var loaded = false
    /// Calls on their way through the engine; a timeout, a reset or a dead engine answers them all.
    private var pending = [UUID: CheckedContinuation<String, Error>]()
    /// The stage the founding has reached, as the engine reports it (a stage name).
    var onProgress: ((String) -> Void)?

    private static func makeWeb() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.suppressesIncrementalRendering = true
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        view.isUserInteractionEnabled = false
        view.alpha = 0.01
        return view
    }

    override init() {
        web = EngineHost.makeWeb()
        super.init()
        web.navigationDelegate = self
        web.configuration.userContentController.add(self, name: "progress")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let stage = message.body as? String { onProgress?(stage) }
    }

    /// Drops the engine, however busy it is (a page cannot be reloaded while its script runs, so a new
    /// one takes its place), and answers everything that was waiting on it.
    func reset(_ error: Error) {
        let old = web, holder = old.superview
        old.navigationDelegate = nil
        old.stopLoading()
        old.configuration.userContentController.removeScriptMessageHandler(forName: "progress")
        old.removeFromSuperview()
        web = Self.makeWeb()
        web.navigationDelegate = self
        web.configuration.userContentController.add(self, name: "progress")
        holder?.addSubview(web)
        loaded = false
        starting = nil
        failAll(error)
    }
    private func failAll(_ error: Error) {
        ready?.resume(throwing: error); ready = nil
        let waiting = pending; pending = [:]
        for call in waiting.values { call.resume(throwing: error) }
    }
    private func finish(_ id: UUID, _ result: Result<String, Error>) { pending.removeValue(forKey: id)?.resume(with: result) }

    /// One load at a time: a second caller (新世界 pressed while the delayed start runs) waits for it
    /// instead of loading again and leaving the first one waiting forever.
    private var starting: Task<Void, Error>?
    func start() async throws {
        if loaded { return }
        if let starting { return try await starting.value }
        let t = Task { try await self.load() }
        starting = t
        defer { starting = nil }
        try await t.value
    }
    private func load() async throws {
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
    /// WebKit restarts a terminated content process with an empty page; the next call reloads the game.
    /// The engine only founds worlds, so a running world is not touched: only what waits on it fails.
    nonisolated func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Task { @MainActor in loaded = false; failAll(EngineError.message("建世引擎被系统中止（多半是内存不足），请关掉其他应用后再试一次。")) }
    }

    /// Calls `NativeGame.<body>` and returns its JSON string. Past `timeout` seconds the engine is
    /// replaced and the call fails, rather than waiting for ever.
    func call(_ body: String, _ arguments: [String: Any] = [:], timeout: Double? = nil) async throws -> String {
        try await start()
        let id = UUID(), page = web
        return try await withCheckedThrowingContinuation { (c: CheckedContinuation<String, Error>) in
            pending[id] = c
            Task { @MainActor [weak self] in
                do {
                    let value = try await page.callAsyncJavaScript("return await NativeGame.\(body)", arguments: arguments, in: nil, contentWorld: .page)
                    guard let text = value as? String else { throw EngineError.message("引擎没有返回结果") }
                    self?.finish(id, .success(text))
                } catch {
                    let e = error as NSError
                    let message = (e.userInfo["WKJavaScriptExceptionMessage"] as? String) ?? e.localizedDescription
                    self?.finish(id, .failure(EngineError.message(message.replacingOccurrences(of: "Error: ", with: ""))))
                }
            }
            if let timeout {
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                    guard let self, self.pending[id] != nil else { return }
                    self.reset(EngineError.message("推算超时：这方世界没有在限定时间内建成，引擎已重启，请再试一次。"))
                }
            }
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
        /// 军机调度: attacking, supporting (relieving home) or guarding; nil when the army has no war post.
        var duty: String? = nil
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
    struct Event: Decodable, Equatable { let day: Int; let text: String; let kind: String; var province: Int? = nil }
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
    /// 要塞: provinces whose city defence is level three or more.
    var forts: [Int]? = nil
    /// 圣地: each faith's holy province.
    struct Holy: Decodable, Equatable { let religion: String; let province: Int }
    var holy: [Holy]? = nil
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

/// A province's region (区域).
struct RegionInfo: Decodable { let id: Int; let name: String; let center: Int; let provinces: [Int]; let population: Double }
/// One chronicle entry with its reason and the states it names.
struct ChronicleEntry: Decodable, Identifiable {
    let day: Int; let text: String; let kind: String; let reason: String; let nations: [Int]
    var province: Int? = nil
    var id: String { "\(day)|\(text)" }
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
    /// 围城: who besieges this province and the city defence left of its full.
    struct SiegeInfo: Decodable { let nation: Int; let resistance: Double; let maximum: Double }
    var sieges: [SiegeInfo]? = nil
    /// 总督 and how well he suits the post, the noble house holding it as a fief, and 民心: the chance it rises at a rebellion check.
    var governor: String? = nil; var governorFit: Double? = nil; var house: String? = nil; var unrest: Int? = nil
    /// 海上封锁: the state whose fleet holds this province's port.
    var blockade: Int? = nil
    /// 持续性天灾 here (plague, famine).
    var disaster: String? = nil
    /// 信仰: the province's own faith when it is not its holder's.
    var faith: String? = nil; var heresy: Bool? = nil
    /// The kinds of land this is, from what the engine weighs (core, fortress, granary, rich, mountain).
    var kinds: [(String, String)] {
        var out = [(String, String)]()
        if core == true { out.append(("核心", "近于国都，守军 +15%")) } else { out.append(("边地", "远离国都，无核心加成")) }
        if mountain == true { out.append(("山地", "易守难攻，行军减半")) }
        else if let t = terrain, let p = pace { out.append((t, p >= 1 ? "行军通畅" : "行军慢 \(Int(((1 - p) * 100).rounded()))%")) }
        if (defense ?? 1) >= 3 { out.append(("要塞", "城防 \(Int(defense ?? 1)) 级")) }
        if capacity > 0, Double(population) >= Double(capacity) * 0.8 { out.append(("富庶", "人口近于上限")) }
        if grain >= Double(max(1, population)) * 0.5 { out.append(("粮仓", "存粮充足")) }
        if let g = governor { out.append(("总督", g + "（" + ((governorFit ?? 0) >= 0.4 ? "称职" : (governorFit ?? 0) >= 0 ? "平庸" : "失职") + "）")) }
        if let h = house { out.append(("封地", h + "世代所据")) }
        if let u = unrest { out.append((u >= 40 ? "民变" : "民心", u > 0 ? "每次检定起事概率 \(u)%" : "安定")) }
        if let f = faith { out.append((heresy == true ? "异端" : "异教", f + (heresy == true ? "，信众易起事" : "，叛乱风险上升"))) }
        if disaster == "plague" { out.append(("瘟疫", "每月人口 −1.2%，向邻州蔓延")) }
        if disaster == "famine" { out.append(("饥荒", "每月人口 −0.5%，存粮锐减")) }
        if blockade != nil { out.append(("封锁", "港口被敌国舰队封锁，海贸与关税断绝")) }
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
