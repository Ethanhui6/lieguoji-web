import SwiftUI
import UIKit
import LieguojiCore

/// The whole app's state: the launch sequence, the title screen, world generation and the running
/// game, driven by the web engine (EngineHost). Speeds follow the web: 1倍速 ≈ 10 days a second when
/// the device keeps up, 2 / 4 倍速 proportionally faster.
@MainActor final class GameModel: ObservableObject {
    enum Phase: Equatable { case splash, title, generating, founding, playing, editing }
    @Published var phase: Phase = .splash
    /// CI tour only. "settings" or "new-world" holds that title sheet open.
    @Published var tourTitle: String?
    @Published private(set) var map: WorldMap?
    @Published private(set) var state: GameState?
    @Published private(set) var playing = false
    @Published var speed = 1
    /// 远程计算: the computer simulating this world (nil: the phone does).
    @Published private(set) var remoteAddress: String?
    /// A one-line notice for the game screen (e.g. the computer's link broke).
    @Published var notice: String?
    func connectRemote(_ address: String) async -> String? {
        do {
            let a = try await native.connect(address)
            remoteAddress = a; UserDefaults.standard.set(address, forKey: "remote.address"); UserDefaults.standard.set(true, forKey: "remote.auto")
            return nil
        } catch { return error.localizedDescription }
    }
    func disconnectRemote() async { await native.disconnect(); remoteAddress = nil; UserDefaults.standard.set(false, forKey: "remote.auto") }
    /// 自动接入: while a world is open, the player's computer is looked for (now and every 90 s) and
    /// used as soon as it is on — nothing to set up on the phone. 设置 › 远程计算 can turn it off.
    var autoRemote: Bool {
        get { UserDefaults.standard.object(forKey: "remote.autoAll") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "remote.autoAll"); if newValue { autoConnect() } }
    }
    private var autoTask: Task<Void, Never>?
    /// 立即查找: look for the computer now (instead of the next 90-second check).
    /// The computer's link broke (background, network): pause quietly and reattach; after several
    /// failures continue on the phone from the last copy.
    private var reconnecting = false
    func remoteLost() {
        let wasPlaying = playing
        if playing { loop?.cancel(); loop = nil; playing = false }
        remoteAddress = nil
        guard !reconnecting else { return }
        reconnecting = true
        notice = "与电脑的连接中断，正在重连…"
        Task {
            for _ in 0..<8 {
                if let a = await native.reattach() {
                    remoteAddress = a; reconnecting = false; notice = "已重新接上电脑"
                    if wasPlaying { play() }
                    return
                }
                try? await Task.sleep(nanoseconds: 4_000_000_000)
            }
            await native.fallbackLocal()
            reconnecting = false
            notice = "电脑暂时连不上，改用手机继续（从最近一次存档）"
            if let data = await native.state(), let next = try? JSONDecoder().decode(GameState.self, from: data) { apply(next) }
        }
    }
    func findComputerNow() async -> Bool {
        guard remoteAddress == nil else { return true }
        guard let a = await native.connectAuto() else { return false }
        remoteAddress = a; notice = "已接入你的电脑（\(a)）"
        return true
    }
    func autoConnect() {
        guard autoTask == nil else { return }
        autoTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                if self.autoRemote, self.remoteAddress == nil, self.phase == .playing {
                    if let a = await self.native.connectAuto() { self.remoteAddress = a; self.notice = "已自动接入电脑计算（\(a)）" }
                    else if let saved = UserDefaults.standard.string(forKey: "remote.address"), !saved.isEmpty, UserDefaults.standard.bool(forKey: "remote.auto"),
                            let a = try? await self.native.connect(saved) { self.remoteAddress = a; self.notice = "已自动接入电脑计算（\(a)）" }
                }
                try? await Task.sleep(nanoseconds: 90_000_000_000)
            }
        }
    }
    @Published var failure: String?
    @Published var generationNote = ""
    /// A war declared, a peace made or a province taken: shown as a banner for a moment.
    struct Herald: Equatable, Identifiable { let id = UUID(); let kind: Kind; let text: String; let nations: [Int]; enum Kind { case war, peace, capture, uprising, restoration, extinction, capital } }
    @Published var herald: Herald?
    private var heraldQueue: [Herald] = []
    private var heraldTask: Task<Void, Never>?
    /// Bumped whenever a different world is opened, so the map view rebuilds.
    @Published private(set) var worldID = UUID()
    let engine = EngineHost()
    /// The Swift engine: after a world is built (or a Swift save opened) it runs every day,
    /// command and save; the web engine only builds new worlds.
    let native = NativeHost()
    let controller = MapController()
    private var loop: Task<Void, Never>?
    private var lastSavedDay = 0
    private var lastSaveTime = Date()

    init() {
        engine.onCrash = { [weak self] in self?.engineCrashed() }
    }

    /// The bundled world, used as the title backdrop before a game exists.
    /// The original grid geometry and the ported generators, for worlds built on the device.
    private(set) var previewInputs: PreviewWorld.Inputs?
    /// 自绘地图: the open map editor and the world options chosen for it.
    @Published private(set) var editor: MapEditor?
    private var editorOptions = NewWorld()

    /// Opens the map editor on a template terrain (drawn over, or replaced by open sea).
    func openEditor(_ options: NewWorld) {
        guard let inputs = previewInputs else { failure = "缺少原作地图网格，无法绘制"; return }
        pause()
        state = nil; controller.world = nil; controller.armies = []; controller.effects = MapEffects(); controller.viewFills = nil; controller.viewLabels = nil
        editorOptions = options
        let seed = options.seed.isEmpty ? String(UInt32.random(in: 0...UInt32.max)) : options.seed
        let heights = TerrainGenerator.generate(graph: inputs.grid, seed: seed, template: options.template)
        let ed = MapEditor(inputs: inputs, heights: heights, seed: seed, template: options.template, controller: controller)
        ed.nations = options.nations; ed.provinces = options.provinceCount
        editor = ed; map = ed.map; worldID = UUID()
        controller.drifting = false; controller.mode = .terrain; controller.reveal = 1; controller.interactive = true
        controller.terrainBrush = true
        controller.onTerrainStroke = { [weak ed] x, y in ed?.stamp(x: x, y: y) }
        controller.onTerrainStrokeEnd = { [weak ed] in ed?.endStroke() }
        phase = .editing
    }
    private func detachEditor() {
        controller.terrainBrush = false; controller.onTerrainStroke = nil; controller.onTerrainStrokeEnd = nil
        editor = nil
    }
    func closeEditor() { detachEditor(); controller.editorMap = nil; controller.mode = .political; phase = .title }

    /// Founds the world on the drawn terrain: the engine runs its climate, rivers, settlement and
    /// opening on these heights; the drawn map stays on screen while it does.
    func foundCustomWorld(_ ed: MapEditor) async {
        failure = nil
        let o = editorOptions
        let json: [String: Any] = ["template": ed.template, "count": ed.nations, "cityCount": max(ed.nations, ed.provinces), "seed": ed.seed,
                                   "relations": o.relations, "naming": o.naming, "cultures": Names.cultureIds.filter { o.cultures.contains($0) },
                                   "heights": Data(ed.heights).base64EncodedString()]
        guard let text = String(data: (try? JSONSerialization.data(withJSONObject: json)) ?? Data(), encoding: .utf8) else { return }
        detachEditor()
        map = ed.map
        controller.reveal = 1
        phase = .founding
        let settled = Date()
        do {
            let world = try await open(try await engine.call("generate(options)", ["options": text]))
            // The engine's world (rivers, cities, names) replaces the drawn preview in place.
            controller.editorMap = world; controller.editorSeaDirty = true; controller.editorRevision &+= 1
            try await handOver()
            let wait = 2.6 - Date().timeIntervalSince(settled)
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            controller.editorMap = nil
            phase = .playing; controller.interactive = true
            save()
            autoConnect()
        } catch {
            failure = error.localizedDescription
            phase = .title
        }
    }

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

    struct NewWorld {
        var template = "continents"; var nations = 8; var seed = ""; var provinces = "80"
        /// 开局关系 (peace / war), the cultures that appear, and real or generated names.
        var relations = "peace"; var naming = "historical-names"
        var cultures: Set<String> = Set(Names.cultureIds)
        /// One city per province; the web engine (native-bridge generate) clamps to nations…480.
        var provinceCount: Int { max(nations, min(480, Int(provinces) ?? nations * 10)) }
    }

    /// The terrain, rivers, provinces and capitals are generated on the device at once (the Swift
    /// ports give the web engine's exact result for the same seed) and rise on screen while the
    /// engine builds the same world with its people and armies; that world then takes over.
    func generate(_ options: NewWorld) async {
        pause()
        phase = .generating; failure = nil
        generationNote = "正在生成地形"
        let seed = options.seed.isEmpty ? String(UInt32.random(in: 0...UInt32.max)) : options.seed
        do {
            let json: [String: Any] = ["template": options.template, "count": options.nations, "cityCount": options.provinceCount, "seed": seed,
                                       "relations": options.relations, "naming": options.naming, "cultures": Names.cultureIds.filter { options.cultures.contains($0) }]
            let text = String(data: try JSONSerialization.data(withJSONObject: json), encoding: .utf8)!
            let engine = self.engine
            let full = Task { try await engine.call("generate(options)", ["options": text]) }
            if let inputs = previewInputs {
                let nations = options.nations, provinceCount = options.provinceCount
                // The world and its map layers are built off the main thread, so the map appears
                // without a pause (the renderer used to build the layers on the main thread).
                let (preview, layers) = await Task.detached(priority: .userInitiated) { () -> (WorldMap, MapLayers.Prepared) in
                    let w = PreviewWorld.build(inputs, seed: seed, template: options.template, nations: nations, cities: provinceCount)
                    return (w, MapLayers.prepare(w))
                }.value
                MapRenderer.prepared = layers
                state = nil; controller.world = nil; controller.armies = []; controller.effects = MapEffects(); controller.seaPorts = []
                map = preview; worldID = UUID()
                generationNote = ""
                phase = .founding
                await rise()
            }
            let settled = Date()
            let world = try await open(try await full.value)
            try await handOver()
            // The founding captions after the map (houses, armies, relations) each get their moment.
            let wait = 2.6 - Date().timeIntervalSince(settled)
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            generationNote = ""
            if phase != .founding { await reveal(world) } else { phase = .playing; controller.interactive = true }
            save()
            autoConnect()
        } catch { failure = error.localizedDescription; phase = .title }
    }

    /// The generation animation on the device-built world.
    private func rise() async {
        controller.interactive = false
        controller.reveal = 0
        var elapsed: Float = 0
        var last = Date()
        var shotSea = false
        var shotRise = false
        while true {
            let now = Date()
            elapsed += Float(now.timeIntervalSince(last))
            last = now
            let t = min(1, elapsed / 9)
            controller.reveal = t
            // CI waits on these frames. The clock pauses, then the next shot is pinned to a later stage.
            if ShotTour.on, !shotSea, t >= 0.02 {
                shotSea = true
                elapsed = 0.03 * 9
                controller.reveal = 0.03
                await Task.yield()
                try? await Task.sleep(nanoseconds: 80_000_000)
                await ShotTour.shoot("02-founding")
                last = Date()
                continue
            }
            if ShotTour.on, !shotRise, t >= 0.40 {
                shotRise = true
                // 冲刷江河 is the stage while reveal is in [0.38, 0.45).
                elapsed = 0.42 * 9
                controller.reveal = 0.42
                await Task.yield()
                try? await Task.sleep(nanoseconds: 80_000_000)
                await ShotTour.shoot("02b-rise")
                last = Date()
                continue
            }
            if t >= 1 { break }
            try? await Task.sleep(nanoseconds: 16_000_000)
        }
    }

    func continueGame() async {
        pause()
        phase = .generating; failure = nil; generationNote = "正在读取存档"
        do {
            let data = try Data(contentsOf: Self.saveURL)
            let world: WorldMap
            let quote = "\""
            if data.starts(with: Array(("{" + quote + "format" + quote + ":" + quote + NativeEngine.saveFormat + quote).utf8)) {
                // A Swift save: the full run and its geometry, no replay.
                let opened = try await native.open(data)
                await native.enableAppRules()
                guard let mapData = opened.map else { throw EngineError.message("存档缺少地图") }
                let loaded = try await Task.detached(priority: .userInitiated) { () throws -> (WorldMap, GameState, MapLayers.Prepared) in
                    struct Saved: Decodable { let bin: String; let meta: WorldMeta }
                    let m = try JSONDecoder().decode(Saved.self, from: mapData)
                    guard let bin = Data(base64Encoded: m.bin) else { throw EngineError.message("地图数据损坏") }
                    let w = try WorldMap(binary: bin, meta: m.meta)
                    return (w, try JSONDecoder().decode(GameState.self, from: opened.state), MapLayers.prepare(w))
                }.value
                MapRenderer.prepared = loaded.2
                map = loaded.0; worldID = UUID(); controller.world = nil
                apply(loaded.1); lastSavedDay = loaded.1.day
                world = loaded.0
            } else {
                let saved = String(decoding: data, as: UTF8.self)
                world = try await open(try await engine.call("load(text)", ["text": saved]))
                try await handOver()
            }
            generationNote = ""
            await reveal(world)
            autoConnect()
        } catch { failure = "存档无法读取：\(error.localizedDescription)"; phase = .title }
    }

    private func open(_ text: String) async throws -> WorldMap {
        let keeps = phase == .founding
        let loaded = try await Task.detached(priority: .userInitiated) { () throws -> (WorldMap, GameState, MapLayers.Prepared?) in
            let decoded = try JSONDecoder().decode(LoadedWorld.self, from: Data(text.utf8))
            guard let bin = Data(base64Encoded: decoded.bin) else { throw EngineError.message("地图数据损坏") }
            let world = try WorldMap(binary: bin, meta: decoded.meta)
            // A new map view will be built (a loaded save): its layers are prepared here, off the main thread.
            return (world, decoded.state, keeps ? nil : MapLayers.prepare(world))
        }.value
        if let layers = loaded.2 { MapRenderer.prepared = layers }
        if phase == .founding, let shown = map, shown.province.count == loaded.0.province.count, shown.meta.provinces.count == loaded.0.meta.provinces.count {
            // The device-built preview has the same geometry: keep its map view (rebuilding the Metal
            // map and every label here was the hitch before entering the world); only states and names update.
            map = loaded.0; controller.world = loaded.0
        } else {
            map = loaded.0; worldID = UUID(); controller.world = nil
        }
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
            // Through the relay the next step is already asked for while this one is applied, so
            // the computer never waits for the phone (a round trip there costs most of a step).
            var ahead: Task<Data, Never>?
            defer { if let ahead, let self { Task { let data = await ahead.value; try? await self.apply(stepData: data) } } }
            while !Task.isCancelled {
                guard let self else { return }
                let started = Date()
                // Speed is days per step: the engine runs that many days in one call and the map,
                // the state and the panels refresh once, so 2×, 4× and 8× really are faster.
                // Through the relay each round trip costs time: twice the days per step.
                let far = self.remoteAddress.map { !$0.contains("局域网") } ?? false
                // Days per step: as many as the device computes in its share of a step (measured),
                // up to the speed's pace — a quick phone runs near the original's pace, a slow one
                // runs fewer days rather than stuttering. The map glides between steps.
                // The original's pace: 1× is ten days a second (secondsPerDay 0.1), five steps a second.
                let wanted = [1: 2, 2: 4, 4: 8, 8: 16][self.speed] ?? 2
                let affordable = max(1, Int((0.13 / max(0.004, self.dayCost)).rounded(.down)))
                let pace = min(wanted, affordable)
                let days = far ? pace * 2 : pace
                self.lastDays = days
                do {
                    if far {
                        let native = self.native
                        let data = await (ahead ?? Task { await native.step(days: days) }).value
                        ahead = Task { await native.step(days: days) }
                        try await self.apply(stepData: data)
                    } else {
                        if let pending = ahead { ahead = nil; try await self.apply(stepData: await pending.value) }
                        try await self.step(days: days)
                    }
                }
                catch { self.failure = error.localizedDescription; self.pause(); return }
                let spent = Date().timeIntervalSince(started)
                // A single slow step (a save, a month's politics) is clipped, so it cannot drag the pace
                // down to one day a step for many steps after it.
                if !far { self.dayCost = self.dayCost * 0.7 + min(spent / Double(max(1, days)), self.dayCost * 2.5) * 0.3 }
                let budget = 0.2
                let rest = budget - spent
                if rest > 0 { try? await Task.sleep(nanoseconds: UInt64(rest * 1_000_000_000)) } else { await Task.yield() }
            }
        }
    }
    func pause(saving: Bool = true) { let was = playing; loop?.cancel(); loop = nil; playing = false; if saving, was, let day = state?.day { save(); lastSavedDay = day } }
    func cycleSpeed() { speed = speed == 1 ? 2 : speed == 2 ? 4 : speed == 4 ? 8 : 1 }
    func stepOnce() { guard !playing else { return }; Task { try? await step(days: 1) } }

    /// The web engine's world goes to the Swift engine, which runs it from now on.
    private func handOver() async throws {
        let text = try await engine.call("nativeWorld()")
        _ = try await native.open(Data(text.utf8))
        await native.enableAppRules()
        // The Swift engine's own first state (its army points, the arms by culture) replaces the web
        // engine's at once: otherwise the first step after 开始 slid every army from the web's
        // points to the engine's, a burst of "teleport" walks before the game began.
        if let data = await native.state(), let next = try? JSONDecoder().decode(GameState.self, from: data) {
            controller.snapArmies = true
            state = nil   // no heralds for the web state's wars and events read again
            apply(next)
        }
    }

    /// Measured seconds one simulated day costs (step and apply), smoothed; the pace follows it.
    private var dayCost: Double = 0.03
    /// Days in the last step and the main-thread cost of applying it (for the metrics overlay).
    private var lastDays = 1, applyCost: Double = 0
    /// Colour views refresh at most this often while playing (each refresh queues on the engine).
    private var lastViewRefresh: CFTimeInterval = 0
    /// Smoothed time between two applied steps while playing; army icons glide over it.
    private var stepInterval: Double = 0.2
    private var lastApplied: CFTimeInterval?
    private func step(days: Int) async throws { try await apply(stepData: await native.step(days: days)) }
    private func apply(stepData data: Data) async throws {
        if await native.lost { remoteLost(); return }
        if remoteAddress != nil, !(await native.isRemote) { remoteAddress = nil }
        let next = try await Task.detached { try JSONDecoder().decode(GameState.self, from: data) }.value
        let now = CACurrentMediaTime()
        if playing, let last = lastApplied, now - last < 2 { stepInterval = stepInterval * 0.7 + (now - last) * 0.3 }
        lastApplied = playing ? now : nil
        controller.tween = playing ? min(1.2, max(0.12, stepInterval * 1.05)) : 0.3
        let applying = CACurrentMediaTime()
        apply(next)
        applyCost = applyCost * 0.7 + (CACurrentMediaTime() - applying) * 0.3
        if controller.showMetrics {
            controller.simText = String(format: "  推演 %.1f ms/日 · 每步 %d 日 · 界面更新 %.1f ms  ", dayCost * 1000, lastDays, applyCost * 1000)
        }
        // Autosave by real time, at most every two minutes while playing (a save serializes the whole
        // world on the engine and the steps wait behind it: every 90 days stalled fast play every few
        // seconds). Pausing, leaving and backgrounding still save at once. With a computer, every
        // 30 seconds, so its world is never far from the phone's copy.
        let interval: TimeInterval = remoteAddress != nil ? 30 : Double(controller.play.autosave)
        if interval > 0, next.day != lastSavedDay, Date().timeIntervalSince(lastSaveTime) >= interval { save(); lastSavedDay = next.day; lastSaveTime = Date() }
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
        // States founded by rebellion or civil war, and renamed states, join the legend.
        var legend = false
        for (i, s) in next.nations.enumerated() {
            guard let id = s.id, let name = s.name, let color = s.color else { continue }
            let entry = WorldMeta.Nation(id: id, name: name, color: color, line: s.line ?? color, capital: s.capital ?? -1, culture: s.culture ?? "", polity: s.polity ?? "", religion: s.religion ?? "")
            if i < world.meta.nations.count {
                let old = world.meta.nations[i]
                if old.name != name || old.color != color || old.polity != entry.polity || old.capital != entry.capital { world.meta.nations[i] = entry; legend = true }
            } else { world.meta.nations.append(entry); legend = true }
        }
        if legend { changed = true; map?.meta.nations = world.meta.nations }
        if changed { controller.world = world }
        let ports = (next.ports ?? []).map { SIMD2<Float>($0.x, $0.y) }
        if ports != controller.seaPorts { controller.seaPorts = ports }
        refreshLanes()
        refreshArmies()
        refreshEffects(previous: previous)
        if mapView != .state && mapView != .terrain, !playing || CACurrentMediaTime() - lastViewRefresh > 0.6 {
            lastViewRefresh = CACurrentMediaTime()
            Task { await refreshView() }
        }
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
        // Revolutions, restorations and coups are proclaimed like wars.
        let seen = Set(old.events.map(\.text))
        for e in next.events where !seen.contains(e.text) && (e.text.contains("篡位") || e.text.contains("改称")) {
            enqueue(Herald(kind: .war, text: e.text, nations: []))
        }
        // Rebellions, restorations, dynasties dying out and capitals moving: the original's big news.
        for e in next.events where !seen.contains(e.text) {
            switch e.kind {
            case "uprising": enqueue(Herald(kind: .uprising, text: e.text, nations: []))
            case "restoration": enqueue(Herald(kind: .restoration, text: e.text, nations: []))
            case "extinction": enqueue(Herald(kind: .extinction, text: e.text, nations: []))
            case "capital": enqueue(Herald(kind: .capital, text: e.text, nations: []))
            default: break
            }
        }
        // Only a fallen capital is proclaimed (every captured province flooded the screen with banners).
        let capitals = Set(map.meta.nations.compactMap { map.meta.cities.indices.contains($0.capital) ? map.meta.cities[$0.capital].province : nil })
        var captures = 0
        for (p, owner) in next.owners.enumerated() where p < old.owners.count && old.owners[p] != owner && owner >= 0 && capitals.contains(p) {
            captures += 1; if captures > 1 { break }
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
                switch h.kind { case .war, .uprising: GameFeel.shared.notify(.warning); case .peace, .restoration: GameFeel.shared.notify(.success); case .capture, .extinction, .capital: GameFeel.shared.tap() }
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
        // The original BattleSword plays between every pair of armies in contact; pairs at one
        // spot share a single animation.
        var spots = [String: (x: Double, y: Double, n: Double)]()
        var sides = [String: (Int, Int)](), ends = [String: (Double, Double, Double, Double)]()
        for pair in state.contacts ?? [] where pair.count == 2 && state.armies.indices.contains(pair[0]) && state.armies.indices.contains(pair[1]) {
            let a = state.armies[pair[0]], b = state.armies[pair[1]]
            let x = Double(a.x + b.x) / 2, y = Double(a.y + b.y) / 2
            let key = "\(Int(x / 6)):\(Int(y / 6))"
            let old = spots[key] ?? (0, 0, 0)
            spots[key] = (old.x + x, old.y + y, old.n + 1)
            if sides[key] == nil { sides[key] = (a.nation, b.nation); ends[key] = (Double(a.x), Double(a.y), Double(b.x), Double(b.y)) }
        }
        for p in state.seaBattles ?? [] where p.count == 2 {
            let key = "s\(Int(p[0] / 6)):\(Int(p[1] / 6))", old = spots[key] ?? (0, 0, 0)
            spots[key] = (old.x + p[0], old.y + p[1], old.n + 1)
        }
        func side(_ n: Int) -> MapEffects.Side? {
            guard n >= 0, n < map.meta.nations.count else { return nil }
            let c = rgb(n); return .init(name: map.meta.nations[n].name, r: c.0, g: c.1, b: c.2)
        }
        for (key, v) in spots.sorted(by: { $0.key < $1.key }) {
            let s = sides[key]
            var battle = MapEffects.Battle(key: key, x: v.x / v.n, y: v.y / v.n, left: s.flatMap { side($0.0) }, right: s.flatMap { side($0.1) })
            if let p = ends[key] { battle.ax = p.0; battle.ay = p.1; battle.bx = p.2; battle.by = p.3 }
            e.battles.append(battle)
        }
        // A new clash on the map is felt (once per step).
        if !Set(e.battles.map(\.key)).subtracting(controller.effects.battles.map(\.key)).isEmpty { GameFeel.shared.clash() }
        // One-shot bursts: an army destroyed, a state founded, a war declared (shockwave at the defender).
        e.bursts = controller.effects.bursts
        if let previous {
            let alive = Set(state.armies.map(\.id))
            // Every army that leaves the map falls: its banner topples in its colour, smoke rises.
            for a in previous.armies where !alive.contains(a.id) {
                let c = rgb(a.nation)
                e.bursts.append(.init(id: "d\(a.id)", x: Double(a.x), y: Double(a.y), kind: .destroyed, r: c.0, g: c.1, b: c.2, unit: a.unit))
            }
            // An army beaten to nothing re-forms at home under the same banner (the original's
            // reorganisation): it falls where it fought and rises again at home, instead of its icon
            // sliding across the map.
            let prior = Dictionary(previous.armies.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            for a in state.armies {
                guard let old = prior[a.id] else { continue }
                guard a.reorganizing == true, old.reorganizing != true else { continue }
                let c = rgb(a.nation)
                e.bursts.append(.init(id: "d\(a.id)-\(state.day)", x: Double(old.x), y: Double(old.y), kind: .destroyed, r: c.0, g: c.1, b: c.2, unit: old.unit))
            }
            for n in previous.nations.count..<max(previous.nations.count, state.nations.count) where n < map.meta.nations.count {
                let c = rgb(n), cap = map.meta.nations[n].capital
                if cap >= 0, cap < map.meta.cities.count { e.bursts.append(.init(id: "n\(n)-\(state.day)", x: Double(map.meta.cities[cap].x), y: Double(map.meta.cities[cap].y), kind: .founded, r: c.0, g: c.1, b: c.2)) }
            }
            let before = Set(previous.wars.map(\.id))
            for w in state.wars where !before.contains(w.id) {
                if w.defender >= 0, w.defender < map.meta.nations.count {
                    let cap = map.meta.nations[w.defender].capital
                    if cap >= 0, cap < map.meta.cities.count { e.bursts.append(.init(id: "s\(w.id)", x: Double(map.meta.cities[cap].x), y: Double(map.meta.cities[cap].y), kind: .shock, r: 0.86, g: 0.12, b: 0.1)) }
                }
            }
            // The chronicle's happenings play at the capital of the state they name.
            let seenText = Set(previous.events.map(\.text))
            let kinds: [(String, MapEffects.Burst.Kind)] = [("五谷丰登", .harvest), ("天灾", .disaster), ("名臣辈出", .talent), ("瘟疫", .plague), ("商路大开", .trade), ("篡位", .coup), ("改称", .regime)]
            for ev in state.events where !seenText.contains(ev.text) {
                guard let kind = kinds.first(where: { ev.text.contains($0.0) })?.1 else { continue }
                let named = map.meta.nations.indices.filter { !map.meta.nations[$0].name.isEmpty && ev.text.hasPrefix(map.meta.nations[$0].name) }
                guard let n = named.max(by: { map.meta.nations[$0].name.count < map.meta.nations[$1].name.count }) else { continue }
                let cap = map.meta.nations[n].capital
                guard map.meta.cities.indices.contains(cap) else { continue }
                let c = rgb(n)
                e.bursts.append(.init(id: "e\(ev.day)-\(ev.text.hashValue)", x: Double(map.meta.cities[cap].x), y: Double(map.meta.cities[cap].y), kind: kind, r: c.0, g: c.1, b: c.2))
            }
            e.bursts = Array(e.bursts.suffix(30))
        }
        // Declarations, claimed provinces and peace (WarEffects47): one-shot, keyed by war.
        func pole(_ n: Int) -> (Double, Double)? {
            guard n >= 0, n < map.meta.nations.count else { return nil }
            let c = map.meta.nations[n].capital
            if c >= 0, c < map.meta.cities.count { return (Double(map.meta.cities[c].x), Double(map.meta.cities[c].y)) }
            if let p = state.owners.firstIndex(of: n), p < map.meta.provinces.count { return (Double(map.meta.provinces[p].x), Double(map.meta.provinces[p].y)) }
            return nil
        }
        e.declarations = controller.effects.declarations; e.claims = controller.effects.claims; e.peaces = controller.effects.peaces
        // Province battle arrows in the attacker's shallow → deep colour (MaterialManager.UpdateStateColor).
        for a in state.arrows ?? [] where a.count == 10 {
            let c = rgb(Int(a[2])), shallow = NativeEngine.adjustColor(c, -0.05, -0.05), deep = NativeEngine.adjustColor(c, 0.1, 0.05)
            e.arrows.append(.init(key: "\(Int(a[0]))>\(Int(a[1]))", sx: a[4], sy: a[5], cx: a[6], cy: a[7], ex: a[8], ey: a[9], shallow: shallow, deep: deep))
        }
        if let previous {
            let before = Set(previous.wars.map(\.id)), after = Set(state.wars.map(\.id))
            for w in state.wars where !before.contains(w.id) {
                if let a = pole(w.attacker), let b = pole(w.defender) { e.declarations.append(.init(id: "w\(w.id)", fromX: a.0, fromY: a.1, toX: b.0, toY: b.1)) }
                for (i, c) in (w.claims ?? []).prefix(30).enumerated() where c.province >= 0 && c.province < map.meta.provinces.count {
                    let p = map.meta.provinces[c.province], col = rgb(c.nation)
                    e.claims.append(.init(id: "w\(w.id)-\(c.province)", x: Double(p.x), y: Double(p.y), r: col.0, g: col.1, b: col.2, delay: Double(i) * 0.05))
                }
            }
            for w in previous.wars where !after.contains(w.id) {
                for n in Set(w.participants.map(\.nation) + [w.attacker, w.defender]) { if let p = pole(n) { e.peaces.append(.init(id: "p\(w.id)-\(n)", x: p.0, y: p.1)) } }
            }
            e.declarations = Array(e.declarations.suffix(8)); e.claims = Array(e.claims.suffix(60)); e.peaces = Array(e.peaces.suffix(24))
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
        Task { await saveNow() }
    }
    /// Saves and waits for the file (export needs it on disk).
    @discardableResult func saveNow() async -> Bool {
        guard state != nil, let data = await native.save() else { return false }
        let url = Self.saveURL
        return await Task.detached(priority: .utility) { (try? data.write(to: url, options: .atomic)) != nil }.value
    }
    /// 导出存档: a dated copy of the current save for the share sheet (Files, AirDrop…), a backup
    /// against the 7-day expiry of a self-signed install.
    func exportCopy() async -> URL? {
        if state != nil { await saveNow() }
        guard hasSave else { return nil }
        let f = DateFormatter(); f.dateFormat = "yyyyMMdd-HHmm"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("列国纪存档-\(f.string(from: Date())).lgj")
        try? FileManager.default.removeItem(at: url)
        do { try FileManager.default.copyItem(at: Self.saveURL, to: url); return url } catch { return nil }
    }
    /// 导入存档: a chosen .lgj replaces the current save (the old one is kept as 导入前备份.lgj), then loads.
    func importSave(from url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url), data.first == UInt8(ascii: "{") else { failure = "这不是列国纪存档。"; return }
        let backup = Self.saveURL.deletingLastPathComponent().appendingPathComponent("导入前备份.lgj")
        if hasSave { try? FileManager.default.removeItem(at: backup); try? FileManager.default.copyItem(at: Self.saveURL, to: backup) }
        do { try data.write(to: Self.saveURL, options: .atomic) } catch { failure = "存档无法写入：\(error.localizedDescription)"; return }
        await continueGame()
    }

    // MARK: armies on the map

    /// The sea lanes between harbours (built off the main thread when the harbours change), with the
    /// running length along each, for the merchant ships.
    private var lanes: [(from: Int, to: Int, points: [SIMD2<Float>], cumulative: [Float])] = []
    private var laneKey = ""
    private func refreshLanes() {
        guard let map, let ports = state?.ports, ports.count >= 2 else { return }
        let key = "\(worldID)-\(ports.count)"
        guard key != laneKey else { return }
        laneKey = key
        let points = ports.map { (x: $0.x, y: $0.y) }
        Task {
            let built = await Task.detached(priority: .utility) { () -> [(from: Int, to: Int, points: [SIMD2<Float>], cumulative: [Float])] in
                MapLayers.seaLanePaths(map, ports: points).map { lane in
                    var run: Float = 0, cumulative = [Float]()
                    for (j, p) in lane.points.enumerated() { if j > 0 { let v = p - lane.points[j - 1]; run += (v.x * v.x + v.y * v.y).squareRoot() }; cumulative.append(run) }
                    return (lane.from, lane.to, lane.points, cumulative)
                }
            }.value
            guard self.laneKey == key else { return }
            self.lanes = built
        }
    }

    func refreshArmies() {
        guard let state else { controller.armies = []; return }
        let selected = controller.marchingArmy ?? controller.selectedArmy
        var sprites: [MapRenderer.ArmySprite] = state.armies.enumerated().map { i, a in
            MapRenderer.ArmySprite(army: i, x: a.x, y: a.y, unit: a.unit, nation: a.nation, selected: i == selected || controller.groupArmies.contains(i), key: a.id,
                                   tier: a.troops < 2000 ? 1 : a.troops < 6000 ? 2 : 3, banner: a.banner == "ruler" ? 2 : a.banner == "general" ? 1 : 0, reorganizing: a.reorganizing ?? false)
        }
        // Harbour anchors in the occupier's colour (not tappable; the province panel lists them), then fleets.
        let choosing = controller.marchingFleet ?? controller.selectedFleet
        for (i, p) in (state.ports ?? []).enumerated() {
            sprites.append(MapRenderer.ArmySprite(army: -100_000 - i, x: p.x, y: p.y, unit: "Port", nation: p.occupier, selected: false, key: "port-\(p.province)"))
        }
        for (i, f) in (state.fleets ?? []).enumerated() {
            // One to three ships on the map for one, two to three, and four or more hulls.
            sprites.append(MapRenderer.ArmySprite(army: -(i + 1), x: f.x, y: f.y, unit: "Fleet", nation: f.nation, selected: i == choosing, key: f.id,
                                                  tier: f.ships >= 4 ? 3 : f.ships >= 2 ? 2 : 1))
        }
        // 商船: merchant ships ply the sea lanes between harbours whose holders are at peace, back and
        // forth, in the colour of the harbour they sailed from (the original's merchant ships carrying
        // specialties). Placed by the day, so they glide with the steps like the armies.
        if let ports = state.ports {
            for (i, lane) in lanes.prefix(40).enumerated() {
                guard ports.indices.contains(lane.from), ports.indices.contains(lane.to), let total = lane.cumulative.last, total > 4 else { continue }
                let a = ports[lane.from].occupier, b = ports[lane.to].occupier
                guard state.nations.indices.contains(a), state.nations.indices.contains(b), !state.nations[a].enemies.contains(b) else { continue }
                let travel = Float(state.day) * 3 + Float(i * 37)
                var d = travel.truncatingRemainder(dividingBy: 2 * total)
                let back = d > total; if back { d = 2 * total - d }
                let k = lane.cumulative.firstIndex { $0 >= d } ?? lane.cumulative.count - 1
                let p0 = lane.points[max(0, k - 1)], p1 = lane.points[k], c0 = lane.cumulative[max(0, k - 1)], c1 = lane.cumulative[k]
                let f = c1 > c0 ? (d - c0) / (c1 - c0) : 0, at = p0 + (p1 - p0) * f
                sprites.append(MapRenderer.ArmySprite(army: -300_000 - i, x: at.x, y: at.y, unit: "Merchant", nation: back ? b : a, selected: false, key: "merchant-\(i)"))
            }
        }
        // Icons never sit on one another: armies (and fleets) closer than an icon are eased apart, the
        // later one moving, a few passes. Display only; an army in battle keeps its spot facing the foe.
        Self.offset(&sprites)
        // Commander identity stays in the army page; no floating surname over the map.
        controller.troopTexts = [:]
        controller.armies = sprites
        if let selected, state.armies.indices.contains(selected), state.armies[selected].travel == "moving" {
            let id = state.armies[selected].id
            Task {
                let points = await native.route(armyId: id)
                controller.route = points.map { SIMD2(Float($0[0]), Float($0[1])) }
            }
        } else { controller.route = [] }
    }

    /// Each icon keeps one small fixed offset from its army's point (by its id): stacked armies fan out
    /// and a column marching together keeps its order instead of reshuffling every step.
    static func offset(_ sprites: inout [MapRenderer.ArmySprite]) {
        // Always applied (an offset switched on only when crowded made icons hop as columns passed).
        for i in sprites.indices where sprites[i].army > -100_000 {
            var h: UInt32 = 2166136261
            for u in sprites[i].key.utf8 { h = (h ^ UInt32(u)) &* 16777619 }
            let angle = Float(h % 360) * .pi / 180, r = Float(1.6 + Double(h >> 9 % 100) / 100 * 1.6)
            sprites[i].x += cos(angle) * r; sprites[i].y += sin(angle) * r
        }
    }

    static func spread(_ sprites: inout [MapRenderer.ArmySprite], minimum: Float) {
        let movable = sprites.indices.filter { sprites[$0].army > -100_000 }
        guard movable.count > 1 else { return }
        let cell = minimum
        for _ in 0..<3 {
            var grid = [Int64: [Int]]()
            func cellKey(_ a: Int64, _ b: Int64) -> Int64 { (a << 32) | (b & 0xFFFF_FFFF) }
            func key(_ x: Float, _ y: Float) -> Int64 { cellKey(Int64(floor(x / cell)), Int64(floor(y / cell))) }
            for i in movable { grid[key(sprites[i].x, sprites[i].y), default: []].append(i) }
            var moved = false
            for i in movable {
                let gx = Int64(floor(sprites[i].x / cell)), gy = Int64(floor(sprites[i].y / cell))
                for dx in -1...1 { for dy in -1...1 {
                    for j in grid[cellKey(gx + Int64(dx), gy + Int64(dy))] ?? [] where j > i {
                        var vx = sprites[j].x - sprites[i].x, vy = sprites[j].y - sprites[i].y
                        var d = (vx * vx + vy * vy).squareRoot()
                        guard d < minimum else { continue }
                        if d < 0.01 {
                            // Exactly stacked: fan out by index (deterministic).
                            let a = Float(j % 8) * .pi / 4; vx = cos(a); vy = sin(a); d = 1
                        } else { vx /= d; vy /= d }
                        let push = (minimum - min(d, minimum)) * 0.55
                        sprites[i].x -= vx * push; sprites[i].y -= vy * push
                        sprites[j].x += vx * push; sprites[j].y += vy * push
                        moved = true
                    }
                } }
            }
            if !moved { break }
        }
    }

    func fleet(_ index: Int?) -> GameState.Fleet? { index.flatMap { i in state?.fleets?.indices.contains(i) == true ? state!.fleets![i] : nil } }
    func army(_ index: Int?) -> GameState.Army? { index.flatMap { i in state?.armies.indices.contains(i) == true ? state!.armies[i] : nil } }

    // MARK: commands

    /// A player march to a province, or a halt (province nil).
    func order(army index: Int, to province: Int?) async -> String? {
        guard let a = army(index) else { return "这支军队不存在或已失去战斗力。" }
        return finish(await native.order(armyId: a.id, province: province ?? -1))
    }
    func fleetOrder(id: String, province: Int?) async -> String? {
        finish(await native.fleetOrder(id: id, province: province))
    }
    func declareWar(_ a: Int, on b: Int) async -> String? { finish(await native.politics(declare: true, a, b)) }
    func makePeace(_ a: Int, _ b: Int) async -> String? { finish(await native.politics(declare: false, a, b)) }

    /// Returns nil on success, or the engine's reason.
    private func finish(_ result: (ok: Bool, reason: String, state: Data?)) -> String? {
        if let data = result.state, let next = try? JSONDecoder().decode(GameState.self, from: data) { apply(next) }
        return result.ok ? nil : result.reason
    }

    // MARK: map views and statistics

    /// The colour view on the map (国家、联盟、文化、家族、宗教、地形).
    @Published var mapView: MapViewMode = .state { didSet { Task { await refreshView() } } }
    @Published private(set) var viewLegend: [MapViewData.Entry] = []
    /// A colour view refresh is running / another was asked for meanwhile (refreshes coalesce, so
    /// fast play does not pile up view computations).
    private var viewBusy = false, viewDirty = false
    func refreshView() async {
        controller.mode = mapView == .terrain ? .terrain : .political
        let mode = mapView
        guard mode != .state && mode != .terrain else {
            if controller.viewFills != nil { controller.viewFills = nil }
            if controller.viewLabels != nil { controller.viewLabels = nil }
            if !viewLegend.isEmpty { viewLegend = [] }
            return
        }
        if viewBusy { viewDirty = true; return }
        viewBusy = true
        defer { viewBusy = false; if viewDirty { viewDirty = false; Task { await refreshView() } } }
        guard let data = await native.view(mode.rawValue),
              let v = try? await Task.detached(operation: { try JSONDecoder().decode(MapViewData.self, from: data) }).value else { return }
        // The player switched views while this one was computed: drop it (the switch refreshes again).
        guard mapView == mode else { return }
        let fills = v.fills.map { RGB(css: $0) ?? RGB(1, 1, 1) }
        if controller.viewLabels != v.labels { controller.viewLabels = v.labels }
        if controller.viewFills != fills { controller.viewFills = fills }
        if viewLegend != v.legend { viewLegend = v.legend }
    }
    /// 天下规则: world rates in percent (war, damage, march, levy, ships).
    func worldRules() async -> [String: Int] {
        guard let data = await native.worldRules(), let v = try? JSONDecoder().decode([String: Double].self, from: data) else { return [:] }
        return v.mapValues { Int($0.rounded()) }
    }
    func setWorldRule(_ key: String, _ value: Double?) async -> String? { finish(await native.setWorldRule(key, value: value)) }
    func editFleet(_ id: String, ships: Int?, name: String?) async -> String? { finish(await native.editFleet(id, ships: ships, name: name)) }
    func worldSettings() async -> WorldSettings? {
        guard let data = await native.worldSettings() else { return nil }
        return try? JSONDecoder().decode(WorldSettings.self, from: data)
    }
    func setWorld(_ key: String, _ value: Int) async -> String? { finish(await native.setWorld(key, value)) }
    func triggerCivilWar(_ n: Int) async -> String? { finish(await native.triggerCivilWar(n)) }
    func regime(_ n: Int) async -> (history: [String], trait: String) { await native.regime(n) }
    func editPerson(_ id: Int, skills: [Double], traits: [String]) async -> String? { finish(await native.editPerson(id, skills: skills, traits: traits)) }
    func editNation(_ n: Int, gold: Double?, destiny: Double?, polity: String?, culture: String? = nil, religion: String? = nil) async -> String? { finish(await native.editNation(n, gold: gold, destiny: destiny, polity: polity, culture: culture, religion: religion)) }
    func officeCandidates(_ n: Int, office: String) async -> [NationInfo.Person] {
        guard let d = await native.officeCandidates(n, office: office) else { return [] }
        return (try? JSONDecoder().decode([NationInfo.Person].self, from: d)) ?? []
    }
    func setBonus(_ n: Int, key: String, value: Double?) async -> String? { finish(await native.setBonus(n, key: key, value: value)) }
    func scaleTotal(_ n: Int, key: String, value: Double) async -> String? { finish(await native.scaleTotal(n, key: key, value: value)) }
    func editParty(_ n: Int, party: Int, name: String?, seats: Int?) async -> String? { finish(await native.editParty(n, party: party, name: name, seats: seats)) }
    func editIdentity(_ n: Int, name: String?, color: String?) async -> String? { finish(await native.editIdentity(n, name: name, color: color)) }
    func setCapital(_ n: Int, province: Int) async -> String? { finish(await native.setCapital(n, province: province)) }
    func editProvince(_ index: Int, population: Double?, fortress: Bool?) async -> String? { finish(await native.editProvince(index, population: population, fortress: fortress)) }
    func setTemper(_ n: Int, _ value: Double?) async -> String? { finish(await native.setTemper(n, value)) }
    func renamePerson(_ id: Int, first: String?, last: String?, age: Int?) async -> String? { finish(await native.renamePerson(id, first: first, last: last, age: age)) }
    func setStyle(_ n: Int, style: String) async -> String? { finish(await native.setStyle(n, style: style)) }
    func treaty(_ a: Int, _ b: Int, years: Int, kind: String) async -> String? { finish(await native.treaty(a, b, years: years, kind: kind)) }
    func gift(_ from: Int, to: Int, gold: Double) async -> String? { finish(await native.gift(from, to: to, gold: gold)) }
    struct PostInfo: Decodable, Identifiable { let id: String; let title: String; let effect: String; let skill: Int; let holder: NationInfo.Person?; let value: Double? }
    func posts(_ n: Int) async -> [PostInfo] {
        guard let d = await native.posts(n) else { return [] }
        return (try? JSONDecoder().decode([PostInfo].self, from: d)) ?? []
    }
    func postCandidates(_ n: Int, post: String) async -> [NationInfo.Person] {
        guard let d = await native.postCandidates(n, post: post) else { return [] }
        return (try? JSONDecoder().decode([NationInfo.Person].self, from: d)) ?? []
    }
    func appointPost(_ n: Int, post: String, person: Int) async -> String? { finish(await native.appointPost(n, post: post, person: person)) }
    func editCourt(_ n: Int, key: String, value: Double) async -> String? { finish(await native.editCourt(n, key: key, value: value)) }
    func appointOffice(_ n: Int, office: String, person: Int) async -> String? { finish(await native.appointOffice(n, office: office, person: person)) }
    func setCourtManual(_ n: Int, manual: Bool) async -> String? { finish(await native.setCourtManual(n, manual: manual)) }
    func addArmy(_ n: Int, province: Int) async -> String? { finish(await native.addArmy(n, province: province)) }
    func editArmy(_ id: String, troops: Int?, unit: String?, morale: Double?) async -> String? { finish(await native.editArmy(id, troops: troops, unit: unit, morale: morale)) }
    /// One army order: whether it took, and the engine's message either way.
    func armyAction(_ action: String, armyId: String, text: String = "", flag: Bool = false) async -> (ok: Bool, message: String) {
        let out = await native.armyAction(action, armyId: armyId, text: text, flag: flag)
        if let data = out.state, let next = try? JSONDecoder().decode(GameState.self, from: data) { apply(next) }
        return (out.ok, out.reason)
    }
    /// 即时战略模式: the box-selected armies of one state to a province; nil reason on success.
    func rts(armies: [Int], to province: Int, defend: Bool) async -> (ok: Bool, reason: String) {
        let rows = armies.compactMap { army($0) }
        guard let nation = rows.first?.nation else { return (false, "没有选中军队。") }
        let out = await native.rts(rows.map(\.id), nation: nation, province: province, defend: defend)
        if let data = out.state, let next = try? JSONDecoder().decode(GameState.self, from: data) { apply(next) }
        return (out.ok, out.reason)
    }
    func nationHistory(_ n: Int) async -> [GameState.Event] {
        guard let data = await native.nationHistory(n) else { return [] }
        return (try? JSONDecoder().decode([GameState.Event].self, from: data)) ?? []
    }
    func grant(province: Int, to nation: Int) async -> String? { finish(await native.territory([province], to: nation)) }
    func retreat(army index: Int, to province: Int) async -> String? {
        guard let a = army(index) else { return "这支军队不存在或已失去战斗力。" }
        return finish(await native.retreat(armyId: a.id, province: province))
    }
    func statistics(_ category: String) async -> [StatisticsRow] {
        guard let data = await native.statistics(category) else { return [] }
        return (try? JSONDecoder().decode([StatisticsRow].self, from: data)) ?? []
    }

    func financeInfo(_ index: Int) async -> FinanceOverview? {
        guard state != nil, let data = await native.financeInfo(index) else { return nil }
        return try? JSONDecoder().decode(FinanceOverview.self, from: data)
    }
    func setTax(_ n: Int, _ value: String) async -> String? { finish(await native.setTax(n, value)) }
    func regionInfo(_ province: Int) async -> RegionInfo? {
        guard state != nil, let data = await native.regionInfo(province) else { return nil }
        return try? JSONDecoder().decode(RegionInfo.self, from: data)
    }
    func renameRegion(_ province: Int, _ name: String) async -> String? { finish(await native.renameRegion(province, name)) }
    func setRegionCenter(_ province: Int) async -> String? { finish(await native.setRegionCenter(province)) }
    /// 大事记 by category, newest first.
    func chronicle(_ category: String) async -> [ChronicleEntry] {
        guard state != nil, let data = await native.chronicle(category) else { return [] }
        return (try? JSONDecoder().decode([ChronicleEntry].self, from: data)) ?? []
    }
    func setCalendar(era: String, year: Int?) async -> String? { finish(await native.setCalendar(era: era, year: year)) }
    func setCityCulture(_ province: Int, _ culture: String) async -> String? { finish(await native.setCityCulture(province, culture)) }
    func tradeInfo(_ index: Int) async -> TradeOverview? {
        guard state != nil, let data = await native.tradeInfo(index) else { return nil }
        return try? JSONDecoder().decode(TradeOverview.self, from: data)
    }
    func familyTree(_ family: String) async -> FamilyTree? {
        guard state != nil, let data = await native.familyTree(family) else { return nil }
        return try? JSONDecoder().decode(FamilyTree.self, from: data)
    }
    func setLivelihood(_ n: Int, _ value: String) async -> String? { finish(await native.setLivelihood(n, value)) }
    func setSpecialty(_ province: Int, _ good: Int?) async -> String? { finish(await native.setSpecialty(province, good)) }
    func diplomacyInfo(_ index: Int) async -> DiplomacyOverview? {
        guard state != nil, let data = await native.diplomacyInfo(index) else { return nil }
        return try? JSONDecoder().decode(DiplomacyOverview.self, from: data)
    }
    func nationInfo(_ index: Int) async -> NationInfo? {
        guard state != nil, let data = await native.nationInfo(index) else { return nil }
        return try? JSONDecoder().decode(NationInfo.self, from: data)
    }
    /// Alliance with another state, or leaving the current one (b < 0).
    func alliance(_ a: Int, with b: Int) async -> String? { finish(await native.alliance(a, with: b)) }
    func releaseVassal(_ n: Int) async -> String? { finish(await native.releaseVassal(n)) }
    func makeVassal(_ vassal: Int, of overlord: Int) async -> String? { finish(await native.makeVassal(vassal, of: overlord)) }
    func annex(_ target: Int, by annexer: Int) async -> String? { finish(await native.annex(target, by: annexer)) }
    func setAutoDiplomacy(_ n: Int, _ enabled: Bool) async -> String? { finish(await native.setAutoDiplomacy(n, enabled)) }

    func provinceInfo(_ index: Int) async -> ProvinceInfo? {
        guard state != nil, let data = await native.province(index) else { return nil }
        return try? JSONDecoder().decode(ProvinceInfo.self, from: data)
    }
}
