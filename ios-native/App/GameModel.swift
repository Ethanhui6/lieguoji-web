import SwiftUI
import UIKit
import LieguojiCore

/// The whole app's state: the launch sequence, the title screen, world generation and the running
/// game, driven by the web engine (EngineHost). Speeds follow the web: 1倍速 ≈ 10 days a second when
/// the device keeps up, 2 / 4 倍速 proportionally faster.
@MainActor final class GameModel: ObservableObject {
    enum Phase: Equatable { case splash, title, generating, founding, playing }
    @Published var phase: Phase = .splash
    @Published private(set) var map: WorldMap?
    @Published private(set) var state: GameState?
    @Published private(set) var playing = false
    @Published var speed = 1
    @Published var failure: String?
    @Published var generationNote = ""
    /// A war declared, a peace made or a province taken: shown as a banner for a moment.
    struct Herald: Equatable, Identifiable { let id = UUID(); let kind: Kind; let text: String; let nations: [Int]; enum Kind { case war, peace, capture } }
    @Published var herald: Herald?
    private var heraldQueue: [Herald] = []
    private var heraldTask: Task<Void, Never>?
    /// Bumped whenever a different world is opened, so the map view rebuilds.
    @Published private(set) var worldID = UUID()
    let engine = EngineHost()
    let controller = MapController()
    private var loop: Task<Void, Never>?
    private var lastSavedDay = 0

    init() {
        engine.onCrash = { [weak self] in self?.engineCrashed() }
    }

    /// The bundled world, used as the title backdrop before a game exists.
    /// The original grid geometry and the ported generators, for worlds built on the device.
    private(set) var previewInputs: PreviewWorld.Inputs?

    /// A fresh random world for the title backdrop, generated on the device by the Swift ports.
    func loadBackdrop() async {
        guard map == nil, let url = Bundle.main.url(forResource: "World", withExtension: nil) else { return }
        let built = try? await Task.detached(priority: .userInitiated) { () throws -> (PreviewWorld.Inputs, WorldMap) in
            let base = try WorldMap.load(directory: url)
            let inputs = PreviewWorld.Inputs(base: base, grid: try TerrainGraph(data: Data(contentsOf: url.appendingPathComponent("grid20k.bin"))),
                                             document: try TerrainDocument(data: Data(contentsOf: url.appendingPathComponent("doc20k.bin"))))
            let template = Names.templates.randomElement()!.id
            return (inputs, PreviewWorld.build(inputs, seed: String(UInt32.random(in: 0...UInt32.max)), template: template, nations: 8, cities: 80))
        }.value
        if let built { previewInputs = built.0; map = built.1; worldID = UUID() }
        else if let world = try? WorldMap.load(directory: url) { map = world; worldID = UUID() }
    }

    static var saveURL: URL {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("列国纪", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("当前世界.lgj")
    }
    var hasSave: Bool { FileManager.default.fileExists(atPath: Self.saveURL.path) }

    // MARK: worlds

    struct NewWorld { var template = "continents"; var nations = 8; var seed = "" }

    /// The terrain, rivers, provinces and capitals are generated on the device at once (the Swift
    /// ports give the web engine's exact result for the same seed) and rise on screen while the
    /// engine builds the same world with its people and armies; that world then takes over.
    func generate(_ options: NewWorld) async {
        pause()
        phase = .generating; failure = nil
        generationNote = "正在生成地形"
        let seed = options.seed.isEmpty ? String(UInt32.random(in: 0...UInt32.max)) : options.seed
        do {
            let json: [String: Any] = ["template": options.template, "count": options.nations, "seed": seed]
            let text = String(data: try JSONSerialization.data(withJSONObject: json), encoding: .utf8)!
            let engine = self.engine
            let full = Task { try await engine.call("generate(options)", ["options": text]) }
            if let inputs = previewInputs {
                let nations = options.nations
                let preview = await Task.detached(priority: .userInitiated) { PreviewWorld.build(inputs, seed: seed, template: options.template, nations: nations, cities: nations * 10) }.value
                state = nil; controller.world = nil; controller.armies = []; controller.effects = MapEffects()
                map = preview; worldID = UUID()
                generationNote = ""
                phase = .founding
                await rise()
            }
            let world = try await open(try await full.value)
            generationNote = ""
            if phase != .founding { await reveal(world) } else { phase = .playing; controller.interactive = true }
            save()
        } catch { failure = error.localizedDescription; phase = .title }
    }

    /// The generation animation on the device-built world.
    private func rise() async {
        controller.interactive = false
        controller.reveal = 0
        let start = Date()
        while true {
            let t = Float(Date().timeIntervalSince(start) / 2.6)
            controller.reveal = min(1, t)
            if t >= 1 { break }
            try? await Task.sleep(nanoseconds: 16_000_000)
        }
    }

    func continueGame() async {
        pause()
        phase = .generating; failure = nil; generationNote = "正在读取存档"
        do {
            let saved = try String(contentsOf: Self.saveURL, encoding: .utf8)
            let world = try await open(try await engine.call("load(text)", ["text": saved]))
            generationNote = ""
            await reveal(world)
        } catch { failure = "存档无法读取：\(error.localizedDescription)"; phase = .title }
    }

    private func open(_ text: String) async throws -> WorldMap {
        let loaded = try await Task.detached(priority: .userInitiated) { () throws -> (WorldMap, GameState) in
            let decoded = try JSONDecoder().decode(LoadedWorld.self, from: Data(text.utf8))
            guard let bin = Data(base64Encoded: decoded.bin) else { throw EngineError.message("地图数据损坏") }
            return (try WorldMap(binary: bin, meta: decoded.meta), decoded.state)
        }.value
        map = loaded.0; worldID = UUID(); controller.world = nil
        apply(loaded.1)
        lastSavedDay = loaded.1.day
        return loaded.0
    }

    /// Land rises from the sea, then the states' colours wash over it (about two seconds).
    private func reveal(_ world: WorldMap) async {
        controller.interactive = false
        controller.reveal = 0
        phase = .playing
        let start = Date()
        while true {
            let t = Float(Date().timeIntervalSince(start) / 2.2)
            controller.reveal = min(1, t)
            if t >= 1 { break }
            try? await Task.sleep(nanoseconds: 16_000_000)
        }
        controller.interactive = true
    }

    func backToTitle() { pause(); save(); phase = .title }

    private func engineCrashed() {
        pause()
        failure = "游戏引擎被系统中止，已回到标题画面；可从存档继续。"
        phase = .title
    }

    // MARK: time

    func togglePlay() { playing ? pause() : play() }
    func play() {
        guard loop == nil, state != nil else { return }
        playing = true
        loop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let started = Date()
                do { try await self.step(days: self.speed >= 4 ? 2 : 1) }
                catch { self.failure = error.localizedDescription; self.pause(); return }
                let budget = (self.speed >= 4 ? 0.2 : 0.1) / Double(min(2, self.speed))
                let rest = budget - Date().timeIntervalSince(started)
                if rest > 0 { try? await Task.sleep(nanoseconds: UInt64(rest * 1_000_000_000)) } else { await Task.yield() }
            }
        }
    }
    func pause() { loop?.cancel(); loop = nil; playing = false }
    func cycleSpeed() { speed = speed == 1 ? 2 : speed == 2 ? 4 : 1 }
    func stepOnce() { guard !playing else { return }; Task { try? await step(days: 1) } }

    private func step(days: Int) async throws {
        let text = try await engine.call("step(days)", ["days": days])
        let next = try await Task.detached { try JSONDecoder().decode(GameState.self, from: Data(text.utf8)) }.value
        apply(next)
        if next.day - lastSavedDay >= 30 { save(); lastSavedDay = next.day }
    }

    private func apply(_ next: GameState) {
        let previous = state
        state = next
        if let previous { announce(previous, next) }
        guard var world = controller.world ?? map else { return }
        var changed = false
        for (i, owner) in next.owners.enumerated() where i < world.meta.provinces.count && world.meta.provinces[i].nation != owner {
            world.meta.provinces[i].nation = owner; changed = true
        }
        if let labels = next.labels { world.meta.labels = labels; changed = true }
        if changed { controller.world = world }
        refreshArmies()
        refreshEffects(previous: previous)
    }

    /// Wars declared or ended and provinces taken since the last state, as banners.
    private func announce(_ old: GameState, _ next: GameState) {
        guard let map else { return }
        let name = { (n: Int) in n >= 0 && n < map.meta.nations.count ? map.meta.nations[n].name : "" }
        let before = Set(old.wars.map(\.id)), after = Set(next.wars.map(\.id))
        for w in next.wars where !before.contains(w.id) {
            enqueue(Herald(kind: .war, text: "\(name(w.attacker))以\(w.casusBelli.isEmpty ? "开战" : w.casusBelli)为由向\(name(w.defender))宣战", nations: [w.attacker, w.defender]))
        }
        for w in old.wars where !after.contains(w.id) {
            enqueue(Herald(kind: .peace, text: "\(name(w.attacker))与\(name(w.defender))议和", nations: [w.attacker, w.defender]))
        }
        var captures = 0
        for (p, owner) in next.owners.enumerated() where p < old.owners.count && old.owners[p] != owner && owner >= 0 {
            captures += 1; if captures > 2 { break }
            enqueue(Herald(kind: .capture, text: "\(name(owner))攻下\(map.meta.provinces[p].name)", nations: [owner]))
        }
    }
    private func enqueue(_ h: Herald) {
        heraldQueue.append(h)
        if heraldQueue.count > 4 { heraldQueue.removeFirst(heraldQueue.count - 4) }
        guard heraldTask == nil else { return }
        heraldTask = Task { [weak self] in
            while let self, !self.heraldQueue.isEmpty {
                let h = self.heraldQueue.removeFirst()
                self.herald = h
                if h.kind == .war { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
                try? await Task.sleep(nanoseconds: h.kind == .capture ? 1_600_000_000 : 2_600_000_000)
                self.herald = nil
                try? await Task.sleep(nanoseconds: 350_000_000)
            }
            self?.heraldTask = nil
        }
    }

    /// Battles (fighting armies, grouped by province), sieges and fresh captures on the map.
    private func refreshEffects(previous: GameState?) {
        guard let state, let map else { return }
        func rgb(_ n: Int) -> (Double, Double, Double) {
            let c = n >= 0 && n < map.meta.nations.count ? (RGB(css: map.meta.nations[n].color) ?? RGB(0.6, 0.6, 0.6)) : RGB(0.6, 0.6, 0.6)
            return (Double(c.r), Double(c.g), Double(c.b))
        }
        var e = MapEffects()
        var seen = Set<Int>()
        for a in state.armies where a.status == "fighting" {
            let key = a.province >= 0 ? a.province : -1
            if key >= 0 && !seen.insert(key).inserted { continue }
            e.battles.append(.init(key: key >= 0 ? "p\(key)" : "a\(a.id)", x: Double(a.x), y: Double(a.y) - 4))
        }
        for s in state.sieges where s.province >= 0 && s.province < map.meta.provinces.count {
            let p = map.meta.provinces[s.province], c = rgb(s.nation)
            e.sieges.append(.init(key: "s\(s.province)", x: Double(p.x), y: Double(p.y), progress: s.progress, r: c.0, g: c.1, b: c.2))
        }
        var flashes = controller.effects.flashes.suffix(6).map { $0 }
        if let previous {
            for (p, owner) in state.owners.enumerated() where p < previous.owners.count && previous.owners[p] != owner && p < map.meta.provinces.count {
                let c = rgb(owner), pr = map.meta.provinces[p]
                flashes.append(.init(id: "\(state.day)-\(p)", x: Double(pr.x), y: Double(pr.y), r: c.0, g: c.1, b: c.2))
            }
        }
        e.flashes = flashes
        controller.effects = e
    }

    func save() {
        guard state != nil else { return }
        Task {
            if let text = try? await engine.call("save()") { try? text.write(to: Self.saveURL, atomically: true, encoding: .utf8) }
        }
    }

    // MARK: armies on the map

    func refreshArmies() {
        guard let state else { controller.armies = []; return }
        let selected = controller.marchingArmy ?? controller.selectedArmy
        controller.armies = state.armies.enumerated().map { i, a in
            MapRenderer.ArmySprite(army: i, x: a.x, y: a.y, unit: a.unit, nation: a.nation, selected: i == selected, key: a.id)
        }
        if let selected, state.armies.indices.contains(selected), state.armies[selected].travel == "moving" {
            let id = state.armies[selected].id
            Task {
                guard let text = try? await engine.call("route(id)", ["id": id]),
                      let points = try? JSONDecoder().decode([[Float]].self, from: Data(text.utf8)) else { return }
                controller.route = points.map { SIMD2($0[0], $0[1]) }
            }
        } else { controller.route = [] }
    }

    func army(_ index: Int?) -> GameState.Army? { index.flatMap { i in state?.armies.indices.contains(i) == true ? state!.armies[i] : nil } }

    // MARK: commands

    /// A player march to a province, or a halt (province nil).
    func order(army index: Int, to province: Int?) async -> String? {
        guard let a = army(index) else { return "这支军队不存在或已失去战斗力。" }
        return await command("order(id, province)", ["id": a.id, "province": province ?? -1])
    }
    func declareWar(_ a: Int, on b: Int) async -> String? { await command("politics(type, a, b)", ["type": "declare-war", "a": a, "b": b]) }
    func makePeace(_ a: Int, _ b: Int) async -> String? { await command("politics(type, a, b)", ["type": "make-peace", "a": a, "b": b]) }

    /// Returns nil on success, or the engine's reason.
    private func command(_ body: String, _ args: [String: Any]) async -> String? {
        do {
            let text = try await engine.call(body, args)
            let result = try JSONDecoder().decode(CommandResult.self, from: Data(text.utf8))
            if let next = result.state { apply(next) }
            return result.ok ? nil : result.reason
        } catch { return error.localizedDescription }
    }

    func provinceInfo(_ index: Int) async -> ProvinceInfo? {
        guard state != nil, let text = try? await engine.call("province(index)", ["index": index]) else { return nil }
        return try? JSONDecoder().decode(ProvinceInfo.self, from: Data(text.utf8))
    }
}
