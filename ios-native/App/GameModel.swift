import SwiftUI
import UIKit
import simd
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
    private(set) var state: GameState? { didSet { publishState() } }
    /// A page is open over the map: its numbers refresh twice a second instead of with every step.
    var pageOpen = false
    private var lastPublish = 0.0, publishPending = false
    private func publishState() {
        let now = Date().timeIntervalSinceReferenceDate, gap = pageOpen ? 0.5 : 0.1
        if now - lastPublish >= gap || state == nil { lastPublish = now; objectWillChange.send(); return }
        guard !publishPending else { return }
        publishPending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + gap) { [weak self] in
            guard let self else { return }
            publishPending = false; lastPublish = Date().timeIntervalSinceReferenceDate
            objectWillChange.send()
        }
    }
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
    /// used as soon as it is on, once the player turns this on in 设置 › 远程计算.
    var autoRemote: Bool {
        // Off unless the player turns it on (设置 › 远程计算): the phone computes everything itself; a
        // computer that was often unreachable made the default worse than the phone alone.
        get { UserDefaults.standard.object(forKey: "remote.autoAll") as? Bool ?? false }
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
    /// A war declared, a peace made, a royal marriage, house coup, regime shift, treaty or ultimatum: shown as a banner for a moment.
    struct Herald: Equatable, Identifiable { let id = UUID(); let kind: Kind; let text: String; let nations: [Int]; enum Kind { case war, peace, capture, uprising, restoration, extinction, capital, marriage, house, coup, regime, treaty, ultimatum } }
    @Published var herald: Herald?
    private var heraldQueue: [Herald] = []
    private var heraldTask: Task<Void, Never>?
    /// Bumped whenever a different world is opened, so the map view rebuilds.
    @Published private(set) var worldID = UUID() { didSet { Task { await refreshCustom(); loadCheckpoints() } } }
    /// 山河回放状态（正放、倒放、时间轴拖动与可续推历史节点）
    @Published var replayActive = false
    @Published var replayTimelineData: ReplayTimelineData?
    @Published var replayIndex = 0
    @Published var replayPlaying = false
    @Published var replayReversing = false
    @Published var replaySpeed = 1
    @Published var checkpoints: [WorldCheckpoint] = []
    var lastCheckpointDay = -9999
    var checkpointBusy = false
    var savedLiveWorld: WorldMap?
    var savedLiveArmies: [MapRenderer.ArmySprite]?
    var savedLiveEffects: MapEffects?
    var savedLiveMapView: MapViewMode = .state
    var replayTimer: Task<Void, Never>?
    var lastReplayOwners: [Int] = []
    /// 后备网页引擎：纯 Swift 已接管全部建世、推演、指令与存档，启动与日常游玩零 WKWebView 实例；
    /// 仅在读取极早期旧版 JSON 存档、远程气候回退或 CI 对照计时时按需创建并挂载。
    @Published private(set) var legacyEngine: EngineHost?
    func ensureLegacyEngine() -> EngineHost {
        if let legacyEngine { return legacyEngine }
        let host = EngineHost()
        host.onProgress = { [weak self] stage in self?.noteFoundingStage(stage) }
        legacyEngine = host
        return host
    }
    /// 纯 Swift 核心引擎：建世、每日推演、指令、外交、政令与存档全部在本机 Swift（或远程 LieguojiServer）运行。
    let native = NativeHost()
    let controller = MapController()
    private var loop: Task<Void, Never>?
    var advanceOwnership = AdvanceOwnership()
    var nativeRevision: UInt64 = 0
    private var singleStep: (world: Int, task: Task<Void, Never>)?
    var onAdvanceApplied: (@MainActor (Int) -> Void)?
    private var lastSavedDay = 0
    private var lastSaveTime = Date()
    private var lastMapUpdate: CFTimeInterval = 0
    private var pendingLabels: [WorldMeta.LabelBox]?
    /// 上一次建世界所走的路（swift / web）与耗时（秒）。
    private(set) var lastFounding: (path: String, seconds: Double)?

    init() {}

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
        worldEpoch &+= 1
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
        controller.terrainBrush = false; controller.onTerrainStroke = nil; controller.onTerrainStrokeEnd = nil; editor?.releasePaint()
        editor = nil
    }
    func closeEditor() { detachEditor(); controller.editorMap = nil; controller.mode = .political; phase = .title }

    /// Founds the world on the drawn terrain: the engine runs its climate, rivers, settlement and
    /// opening on these heights; the drawn map stays on screen while it does.
    func foundCustomWorld(_ ed: MapEditor) async {
        failure = nil
        worldEpoch &+= 1
        let epoch = worldEpoch
        controller.foundingStage = 0
        let o = editorOptions
        o.climate.apply()
        var json: [String: Any] = ["climate": o.climate.json, "template": ed.template, "count": ed.nations, "cityCount": max(ed.nations, ed.provinces), "seed": ed.seed,
                                   "relations": o.relations, "naming": o.naming, "cultures": Names.cultureIds.filter { o.cultures.contains($0) },
                                   "heights": Data(ed.heights).base64EncodedString()]
        // 划定列国: the drawn states (their land and capitals) found the world as laid out.
        if let layout = ed.layout { json["layout"] = layout; json["count"] = layout["seeds"]?.count ?? ed.nations }
        guard let text = String(data: (try? JSONSerialization.data(withJSONObject: json)) ?? Data(), encoding: .utf8) else { return }
        detachEditor()
        map = ed.map
        controller.reveal = 1
        phase = .founding
        let settled = Date()
        var made = Self.nativeOptions(seed: ed.seed, template: ed.template, nations: ed.nations, provinces: max(ed.nations, ed.provinces), relations: o.relations,
                                      naming: o.naming, cultures: o.cultures, climate: o.climate)
        made.heights = ed.heights
        if let layout = ed.layout, let seeds = layout["seeds"], let owners = layout["owners"] { made.layout = (seeds, owners); made.count = seeds.count }
        do {
            let founded = try await found(made, webOptions: text, epoch: epoch)
            guard epoch == worldEpoch else { return }
            let world: WorldMap
            switch founded {
            case .native(let made):
                world = try await adoptNative(made)
                controller.editorMap = world; controller.editorSeaDirty = true; controller.editorRevision &+= 1
            case .web(let built):
                world = try await open(built)
                try checkWorld(epoch)
                // The engine's world (rivers, cities, names) replaces the drawn preview in place.
                controller.editorMap = world; controller.editorSeaDirty = true; controller.editorRevision &+= 1
                controller.foundingStage = 3
                try await handOver()
            }
            guard epoch == worldEpoch else { return }
            let wait = 2.6 - Date().timeIntervalSince(settled)
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            guard epoch == worldEpoch else { return }
            controller.editorMap = nil
            phase = .playing; controller.interactive = true
            await archiveCurrent()
            save()
            autoConnect()
        } catch {
            guard epoch == worldEpoch else { return }
            failure = error.localizedDescription
            toTitle()
        }
    }

    /// Longest the engine may take to found a world before it is replaced (a phone needs well under a minute).
    private static let foundingLimit: Double = 180
    /// Bumped when another world is begun: whatever the last one still had under way is dropped.
    var worldEpoch = 0
    private func checkWorld(_ epoch: Int) throws {
        guard epoch == worldEpoch else { throw CancellationError() }
    }
    /// 放弃: the founding is abandoned, the busy engine replaced, and the title comes back.
    func cancelGeneration() {
        worldEpoch &+= 1
        legacyEngine?.reset(EngineError.message("已放弃这次开创。"))
        controller.endReveal()
        toTitle()
    }
    private func toTitle() {
        controller.interactive = false; controller.drifting = true; controller.reveal = 1
        phase = .title
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

    /// 气候: percent of the original's rainfall, degrees of temperature, and the latitude bounds × 100.
    struct ClimateSettings: Equatable {
        var rain = 80, temperature = 0, north = 90, south = -90
        var json: [String: Any] { ["precipitation": rain, "temperatureOffset": temperature, "north": Double(north) / 100, "south": Double(min(south, north - 10)) / 100] }
        func apply() { Climate.precipitationInput = Double(rain); Climate.temperatureOffset = Double(temperature); Climate.north = Double(north) / 100; Climate.south = Double(min(south, north - 10)) / 100 }
    }
    private struct WorldBinary: Decodable { let bin: String }
    /// 重算气候: new biomes and rivers on the same land.
    func reclimate(_ c: ClimateSettings) async -> String? {
        guard let text = String(data: (try? JSONSerialization.data(withJSONObject: c.json)) ?? Data(), encoding: .utf8), let current = controller.world ?? map else { return "世界尚未载入" }
        do {
            // 本机世界由 Swift 重算；不行（远程计算等）再交给网页引擎。
            let bin: Data
            if let local = try? await native.reclimate(precipitation: Double(c.rain), temperatureOffset: Double(c.temperature), north: Double(c.north) / 100, south: Double(min(c.south, c.north - 10)) / 100) {
                bin = local
            } else {
                let webHost = ensureLegacyEngine()
                await Task.yield()
                let out = try await webHost.call("reclimate(options)", ["options": text])
                let decoded = try JSONDecoder().decode(WorldBinary.self, from: Data(out.utf8))
                guard let web = Data(base64Encoded: decoded.bin) else { return "地图数据损坏" }
                bin = web
            }
            let next = try WorldMap(binary: bin, meta: current.meta)
            c.apply(); map = next; controller.world = next
            // New land colours, rivers and sea: the terrain path, not the ownership one.
            controller.editorMap = next; controller.editorSeaDirty = true; controller.editorRevision += 1
            return nil
        } catch { return error.localizedDescription }
    }
    struct NewWorld {
        var template = "continents"; var nations = 8; var seed = ""; var provinces = "80"
        /// 开局关系 (peace / war), the cultures that appear, and real or generated names.
        var relations = "peace"; var naming = "historical-names"
        var climate = ClimateSettings()
        var cultures: Set<String> = Set(Names.cultureIds)
        /// One city per province; the web engine (native-bridge generate) clamps to nations…480.
        var provinceCount: Int { max(nations, min(480, Int(provinces) ?? nations * 10)) }
    }

    /// The terrain, rivers, provinces and capitals are generated on the device at once (the Swift
    /// ports give the web engine's exact result for the same seed) and rise on screen while the
    /// engine builds the same world with its people and armies; that world then takes over.
    func generate(_ options: NewWorld) async {
        pause()
        failure = nil
        worldEpoch &+= 1
        let epoch = worldEpoch
        controller.foundingStage = 0
        generationNote = "正在生成地形"
        // Straight into the founding: the sea fills the screen at once and the new land rises from it as
        // soon as it is built (the separate loading screen in between is gone). Without the device-built
        // preview the engine's world is awaited on the loading screen as before.
        controller.drifting = false
        if previewInputs != nil { controller.reveal = 0; phase = .founding } else { phase = .generating }
        let seed = options.seed.isEmpty ? String(UInt32.random(in: 0...UInt32.max)) : options.seed
        do {
            options.climate.apply()
            let json: [String: Any] = ["climate": options.climate.json, "template": options.template, "count": options.nations, "cityCount": options.provinceCount, "seed": seed,
                                       "relations": options.relations, "naming": options.naming, "cultures": Names.cultureIds.filter { options.cultures.contains($0) }]
            let text = String(data: try JSONSerialization.data(withJSONObject: json), encoding: .utf8)!
            // 新世界由 Swift 在本机建成（与网页引擎逐位相同）；Swift 失败时才交给网页引擎。
            let made = Self.nativeOptions(seed: seed, template: options.template, nations: options.nations, provinces: options.provinceCount, relations: options.relations,
                                          naming: options.naming, cultures: options.cultures, climate: options.climate)
            let full = Task { try await self.found(made, webOptions: text, epoch: epoch) }
            if let inputs = previewInputs {
                let nations = options.nations, provinceCount = options.provinceCount
                // The world and its map layers are built off the main thread, so the map appears
                // without a pause (the renderer used to build the layers on the main thread).
                let (preview, layers) = await Task.detached(priority: .userInitiated) { () -> (WorldMap, MapLayers.Prepared) in
                    let w = PreviewWorld.build(inputs, seed: seed, template: options.template, nations: nations, cities: provinceCount)
                    return (w, MapLayers.prepare(w))
                }.value
                guard epoch == worldEpoch else { return }
                MapRenderer.prepared = layers
                state = nil; controller.world = nil; controller.armies = []; controller.effects = MapEffects(); controller.seaPorts = []
                map = preview; worldID = UUID()
                generationNote = ""
                phase = .founding
                await rise(epoch)
                guard epoch == worldEpoch else { return }
            }
            let settled = Date()
            let founded = try await full.value
            guard epoch == worldEpoch else { return }
            let world: WorldMap
            switch founded {
            case .native(let made): world = try await adoptNative(made)
            case .web(let built):
                world = try await open(built)
                try checkWorld(epoch)
                controller.foundingStage = 3
                try await handOver()
            }
            guard epoch == worldEpoch else { return }
            // The founding captions after the map (houses, armies, relations) each get their moment.
            let wait = 2.6 - Date().timeIntervalSince(settled)
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            guard epoch == worldEpoch else { return }
            generationNote = ""
            if phase != .founding { await reveal(world) } else { phase = .playing; controller.interactive = true }
            // A coast too broken for the provinces asked for: the engine took more.
            if world.meta.provinces.count > options.provinceCount { notice = "这片陆地支离破碎，州郡已增至 \(world.meta.provinces.count) 个" }
            await archiveCurrent()
            save()
            autoConnect()
        } catch {
            guard epoch == worldEpoch else { return }
            failure = error.localizedDescription
            toTitle()
        }
    }

    /// The generation animation on the device-built world.
    private func rise(_ epoch: Int) async {
        controller.interactive = false
        controller.reveal = 0
        if !ShotTour.on { await playReveal(duration: 9, push: true, while: { self.worldEpoch == epoch }); return }
        // CI waits on these frames: the clock is pinned to each stage in turn while its shot is taken.
        let shots: [(at: Float, name: String)] = [(0.03, "02-founding"), (0.10, "02a-sea"), (0.24, "02b-rise"), (0.36, "02c-ink"), (0.62, "02d-states"), (0.80, "02e-borders")]
        for shot in shots {
            controller.reveal = shot.at
            await Task.yield()
            try? await Task.sleep(nanoseconds: 120_000_000)
            await ShotTour.shoot(shot.name)
        }
        controller.reveal = 1
    }

    func continueGame() async {
        pause()
        worldEpoch &+= 1
        let epoch = worldEpoch
        phase = .generating; failure = nil; generationNote = "正在读取存档"
        do {
            let data = try Data(contentsOf: Self.saveURL)
            let world: WorldMap
            let quote = "\""
            if data.starts(with: Array(("{" + quote + "format" + quote + ":" + quote + NativeEngine.saveFormat + quote).utf8)) {
                // A Swift save: the full run and its geometry, no replay.
                let opened = try await native.open(data, world: epoch)
                try checkWorld(epoch)
                nativeRevision = opened.revision
                await applyCloud()
                try checkWorld(epoch)
                await native.enableAppRules()
                try checkWorld(epoch)
                guard let mapData = opened.map else { throw EngineError.message("存档缺少地图") }
                let loaded = try await Task.detached(priority: .userInitiated) { () throws -> (WorldMap, GameState, MapLayers.Prepared) in
                    struct Saved: Decodable { let bin: String; let meta: WorldMeta }
                    let m = try JSONDecoder().decode(Saved.self, from: mapData)
                    guard let bin = Data(base64Encoded: m.bin) else { throw EngineError.message("地图数据损坏") }
                    let w = try WorldMap(binary: bin, meta: m.meta)
                    return (w, try JSONDecoder().decode(GameState.self, from: opened.state), MapLayers.prepare(w))
                }.value
                try checkWorld(epoch)
                MapRenderer.prepared = loaded.2
                map = loaded.0; worldID = UUID(); controller.world = nil
                apply(loaded.1); lastSavedDay = loaded.1.day
                world = loaded.0
            } else {
                let saved = String(decoding: data, as: UTF8.self)
                let webHost = ensureLegacyEngine()
                await Task.yield()
                let restored = try await webHost.call("load(text)", ["text": saved])
                try checkWorld(epoch)
                world = try await open(restored)
                try checkWorld(epoch)
                try await handOver()
            }
            try checkWorld(epoch)
            generationNote = ""
            await reveal(world)
            try checkWorld(epoch)
            autoConnect()
        } catch { if epoch == worldEpoch { failure = "存档无法读取：\(error.localizedDescription)"; phase = .title } }
    }

    private func open(_ text: String) async throws -> WorldMap {
        let epoch = worldEpoch
        let keeps = phase == .founding
        let loaded = try await Task.detached(priority: .userInitiated) { () throws -> (WorldMap, GameState, MapLayers.Prepared?) in
            let decoded = try JSONDecoder().decode(LoadedWorld.self, from: Data(text.utf8))
            guard let bin = Data(base64Encoded: decoded.bin) else { throw EngineError.message("地图数据损坏") }
            let world = try WorldMap(binary: bin, meta: decoded.meta)
            // A new map view will be built (a loaded save): its layers are prepared here, off the main thread.
            return (world, decoded.state, keeps ? nil : MapLayers.prepare(world))
        }.value
        try checkWorld(epoch)
        return show(loaded.0, loaded.1, layers: loaded.2)
    }
    /// 本机 Swift 建好的世界（NativeHost.create）：地图与首个状态同 open，再做交接的后半段。
    private func adoptNative(_ made: NativeHost.Made) async throws -> WorldMap {
        let epoch = worldEpoch
        guard let mapData = made.map else { throw EngineError.message("新世界缺少地图") }
        let keeps = phase == .founding
        let loaded = try await Task.detached(priority: .userInitiated) { () throws -> (WorldMap, GameState, MapLayers.Prepared?) in
            struct Saved: Decodable { let bin: String; let meta: WorldMeta }
            let m = try JSONDecoder().decode(Saved.self, from: mapData)
            guard let bin = Data(base64Encoded: m.bin) else { throw EngineError.message("地图数据损坏") }
            let world = try WorldMap(binary: bin, meta: m.meta)
            return (world, try JSONDecoder().decode(GameState.self, from: made.state), keeps ? nil : MapLayers.prepare(world))
        }.value
        try checkWorld(epoch)
        let world = show(loaded.0, loaded.1, layers: loaded.2)
        controller.foundingStage = 3
        nativeRevision = made.revision
        try await finishHandOver(epoch)
        return world
    }
    /// The decoded world on screen (shared by open and adoptNative).
    private func show(_ world: WorldMap, _ first: GameState, layers: MapLayers.Prepared?) -> WorldMap {
        let loaded = (world, first)
        if let layers { MapRenderer.prepared = layers }
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
        // The land rises and the camera eases out to the whole world (on the display link).
        await playReveal(duration: 3.2, push: controller.play.introCamera)
        controller.interactive = true
    }

    /// Plays a reveal on the map's display link, smooth at the screen's rate; the published value the
    /// panels read (stage list, bars) follows ten times a second instead of every frame.
    func playReveal(duration: Double, push: Bool = false, while keep: () -> Bool = { true }) async {
        controller.reveal = 0
        controller.animateReveal(duration: duration, push: push)
        while !controller.revealDone && keep() {
            try? await Task.sleep(nanoseconds: 100_000_000)
            controller.reveal = controller.revealNow ?? 1
        }
        // Cut short (the title left for a new world): the next reveal owns the map from here.
        if keep() { controller.reveal = 1 }
        controller.endReveal()
    }

    func backToTitle() { pause(); save(); phase = .title }

    // MARK: time

    /// 云更新: the cloud's balance numbers to the engine (before a world's rules are enabled, and again
    /// when a newer config arrives during play).
    func applyCloud() async { if let d = CloudConfig.shared.tuningData { await native.setTuning(d) } }
    /// Panel data decoded off the main thread: a state page carries every person and house, and decoding
    /// it on the main thread froze the screen for a moment each time a page opened.
    nonisolated static func decode<T: Decodable>(_ type: T.Type, from data: Data) async -> T? {
        await Task.detached(priority: .userInitiated) { try? JSONDecoder().decode(T.self, from: data) }.value
    }
    /// 详情页只读查询：请求或解码期间若已换了世界（读档、新建、回标题），丢弃旧世界的结果，
    /// 免得族谱、国家页把上一个世界的人物与 ID 交给新世界的操作。
    func query<T: Decodable>(_ type: T.Type, _ fetch: () async -> Data?) async -> T? {
        guard state != nil else { return nil }
        let epoch = worldEpoch
        guard let data = await fetch(), epoch == worldEpoch else { return nil }
        let value = await Self.decode(T.self, from: data)
        return epoch == worldEpoch ? value : nil
    }
    func togglePlay() { playing ? pause() : play() }
    private func owns(_ ticket: AdvanceOwnership.Ticket) -> Bool {
        phase == .playing && advanceOwnership.owns(ticket, world: worldEpoch)
    }
    private func requestStep(days: Int, ticket: AdvanceOwnership.Ticket, revision: UInt64) -> Task<NativeHost.Step?, Never> {
        Task { [weak self] in
            guard let self, self.owns(ticket), self.playing else { return nil }
            return await self.native.step(days: days, revision: revision, producer: ticket.producer)
        }
    }
    func play() {
        guard !replayActive, loop == nil, state != nil, phase == .playing else { return }
        let epoch = worldEpoch, revision = nativeRevision
        let manual = singleStep?.world == worldEpoch ? singleStep?.task : nil
        playing = true
        loop = Task { [weak self] in
            // A cancelled play waiting for a manual step never became a producer. Keep that step's
            // ownership until it can display its result, even if play was paused before it finished.
            if let manual { await manual.value }
            guard let self, !Task.isCancelled, self.playing, self.phase == .playing, self.worldEpoch == epoch else { return }
            let ticket = self.advanceOwnership.begin(world: epoch)
            // Through the relay the next step is already asked for while this one is applied, so
            // the computer never waits for the phone (a round trip there costs most of a step).
            var ahead: Task<NativeHost.Step?, Never>?
            // Drain a real accepted tail, but never let a previous loop overwrite a resumed world.
            defer { if let ahead { Task { if let data = await ahead.value, self.owns(ticket) { try? await self.apply(step: data, ticket: ticket) } } } }
            while !Task.isCancelled {
                guard self.owns(ticket) else { return }
                let started = Date()
                // Speed is days per step: the engine runs that many days in one call and the map,
                // the state and the panels refresh once, so 2×, 4× and 8× really are faster.
                // Through the relay each round trip costs time: twice the days per step.
                let far = self.remoteAddress.map { !$0.contains("局域网") } ?? false
                // Days per step: as many as the device computes in its share of a step (measured),
                // up to the speed's pace — a quick phone runs near the original's pace, a slow one
                // runs fewer days rather than stuttering. The map glides between steps.
                // 1× is fifteen days a second (half again the original's ten, which felt slow on a phone), five steps a second.
                let wanted = CloudConfig.shared.pace[self.speed] ?? [1: 3, 2: 6, 4: 12, 8: 24, 16: 40][self.speed] ?? 3
                // A step may take longer at the higher speeds (the map glides over a whole step on the GPU,
                // so a longer step is still smooth): large worlds then really run faster at 4× and 8×.
                let stepTime = [1: 0.13, 2: 0.2, 4: 0.32, 8: 0.5, 16: 0.6][self.speed] ?? 0.13
                // Only a share of each step goes to the engine (less when the phone runs warm; see Energy).
                let affordable = max(1, Int((stepTime * Energy.duty / max(0.004, self.dayCost)).rounded(.down)))
                let pace = min(wanted, affordable)
                let days = far ? pace * 2 : pace
                self.lastDays = days
                do {
                    // The next step is asked for before this one is applied: the engine works on it while
                    // the main thread applies the last (on the phone too, not only through the relay —
                    // the two used to take turns, and a day cost the sum of both).
                    if ahead == nil { ahead = self.requestStep(days: days, ticket: ticket, revision: revision) }
                    guard let data = await ahead!.value else { ahead = nil; return }
                    ahead = nil
                    guard self.owns(ticket) else { return }
                    if !Task.isCancelled, self.playing { ahead = self.requestStep(days: days, ticket: ticket, revision: revision) }
                    try await self.apply(step: data, ticket: ticket)
                }
                catch { if self.owns(ticket) { self.failure = error.localizedDescription; self.pause() }; return }
                guard self.owns(ticket), !Task.isCancelled else { return }
                let spent = Date().timeIntervalSince(started)
                // A single slow step (a save, a month's politics) is clipped, so it cannot drag the pace
                // down to one day a step for many steps after it.
                if !far { self.dayCost = self.dayCost * 0.7 + min(spent / Double(max(1, days)), self.dayCost * 2.5) * 0.3 }
                let budget = max(0.2, stepTime)
                // The processor rests for part of every step, more when the phone is warm: a large world
                // used to keep a core busy without pause, which is what heated the phone.
                let rest = max(budget - spent, far ? 0 : spent * (1 / Energy.duty - 1))
                if rest > 0 { try? await Task.sleep(nanoseconds: UInt64(rest * 1_000_000_000)) } else { await Task.yield() }
            }
        }
    }
    func pause(saving: Bool = true) {
        let was = playing; loop?.cancel(); loop = nil; playing = false
        // Ownership held back while playing reaches the map — after the page that paused the game has
        // slid in (a page opening paused and redrew the map and every state name during its animation:
        // the stutter measured on every page).
        // A page pausing the game (saving: false) leaves the map as it is: closing the page resumes play,
        // which brings the map up to date anyway, and redrawing it under the opening page was the stutter.
        if was, saving, let s = state { apply(s) }
        if saving, was, let day = state?.day { save(); lastSavedDay = day }
    }
    func cycleSpeed() { speed = speed == 1 ? 2 : speed == 2 ? 4 : speed == 4 ? 8 : speed == 8 ? 16 : 1 }
    func stepOnce() {
        guard !replayActive, !playing, phase == .playing, state != nil else { return }
        let ticket = advanceOwnership.begin(world: worldEpoch), revision = nativeRevision
        let previous = singleStep?.world == worldEpoch ? singleStep?.task : nil
        let task = Task { [weak self] in
            if let previous { await previous.value }
            guard let self, self.phase == .playing, self.worldEpoch == ticket.world else { return }
            if let data = await self.native.step(days: 1, revision: revision, producer: ticket.producer), self.owns(ticket) {
                do { try await self.apply(step: data, ticket: ticket) }
                catch { if self.owns(ticket) { self.failure = error.localizedDescription } }
            }
        }
        singleStep = (worldEpoch, task)
    }

    /// The web engine's world goes to the Swift engine, which runs it from now on.
    private func handOver() async throws {
        let epoch = worldEpoch
        let webHost = ensureLegacyEngine()
        await Task.yield()
        let text = try await webHost.call("nativeWorld()", timeout: 90)
        try checkWorld(epoch)
        let opened = try await native.open(Data(text.utf8), world: epoch)
        try checkWorld(epoch)
        nativeRevision = opened.revision
        try await finishHandOver(epoch)
    }
    /// 交接的后半段（网页世界交给 Swift 之后，或 Swift 建好之后）：云端调校、本作规则与 Swift 引擎的首个状态。
    private func finishHandOver(_ epoch: Int) async throws {
        await applyCloud()
        try checkWorld(epoch)
        await native.enableAppRules()
        try checkWorld(epoch)
        // The Swift engine's own first state (its army points, the arms by culture) replaces the web
        // engine's at once: otherwise the first step after 开始 slid every army from the web's
        // points to the engine's, a burst of "teleport" walks before the game began.
        if let data = await native.state(), let next = await Self.decode(GameState.self, from: data) {
            try checkWorld(epoch)
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
    private func apply(step: NativeHost.Step, ticket: AdvanceOwnership.Ticket) async throws {
        let lost = await native.lost, isRemote = await native.isRemote
        guard owns(ticket) else { return }
        if lost { remoteLost(); return }
        // 本机推演直接拿到结构体；远程的 JSON 已在引擎执行器上解码。
        let next = try step.get()
        guard owns(ticket) else { return }
        if remoteAddress != nil, !isRemote { remoteAddress = nil }
        let now = CACurrentMediaTime()
        if playing, let last = lastApplied, now - last < 2 { stepInterval = stepInterval * 0.7 + (now - last) * 0.3 }
        lastApplied = playing ? now : nil
        controller.tween = playing ? min(1.2, max(0.12, stepInterval * 1.05)) : 0.3
        let applying = CACurrentMediaTime()
        apply(next)
        onAdvanceApplied?(next.day)
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

    /// 战况飘字: each province's battle losses this step (and fleets' hull lost at sea) float up over the
    /// map, so a fight reads at a glance. Ten at most a step, the biggest first.
    private func battleHits(_ a: GameState, _ b: GameState) {
        guard controller.onHits != nil, controller.reveal >= 1, controller.play.showArmies else { return }
        var before = [String: Int](); for x in a.armies { before[x.id] = x.troops }
        var byProvince = [Int: (x: Float, y: Float, n: Int, loss: Int)]()
        for x in b.armies where x.province >= 0 {
            guard let t = before[x.id], t > x.troops, x.status == "fighting" || x.status == "retreating" else { continue }
            var e = byProvince[x.province] ?? (0, 0, 0, 0)
            e.x += x.x; e.y += x.y; e.n += 1; e.loss += t - x.troops
            byProvince[x.province] = e
        }
        var hits = byProvince.values.filter { $0.loss >= 20 && $0.n > 0 }.sorted { $0.loss > $1.loss }.prefix(8)
            .map { (x: $0.x / Float($0.n), y: $0.y / Float($0.n), text: "−" + Names.wan($0.loss), naval: false) }
        var hull = [String: Double](); for f in a.fleets ?? [] { hull[f.id] = f.hull }
        for f in (b.fleets ?? []) where (hull[f.id] ?? f.hull) - f.hull >= 1 {
            if hits.count >= 10 { break }
            hits.append((x: f.x, y: f.y, text: "−\(Int(((hull[f.id] ?? f.hull) - f.hull).rounded()))船", naval: true))
        }
        if !hits.isEmpty { controller.onHits?(hits) }
    }
    func apply(_ next: GameState) {
        if replayActive { return }
        let previous = state
        state = next
        if let previous { announce(previous, next); if playing { battleHits(previous, next) } }
        guard var world = controller.world ?? map else { return }
        var changed = false
        // Ownership reaches the map at most twice a second while playing (each change recolours every
        // cell and rebuilds the borders and names); labels that arrive meanwhile wait for it.
        if let labels = next.labels { pendingLabels = labels }
        let now = CACurrentMediaTime()
        if !playing || now - lastMapUpdate >= 0.5 {
            for (i, owner) in next.owners.enumerated() where i < world.meta.provinces.count && world.meta.provinces[i].nation != owner {
                world.meta.provinces[i].nation = owner; changed = true
            }
            if let labels = pendingLabels { world.meta.labels = labels; pendingLabels = nil; changed = true }
            if changed { lastMapUpdate = now }
        }
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
        if let meta = map?.meta, (next.forts != nil || next.holy != nil) {
            var cityByProv = [Int: WorldMeta.City]()
            cityByProv.reserveCapacity(meta.cities.count)
            for c in meta.cities where cityByProv[c.province] == nil { cityByProv[c.province] = c }
            if let list = next.forts {
                let forts = list.compactMap { p -> SIMD2<Float>? in
                    guard meta.provinces.indices.contains(p) else { return nil }
                    if let c = cityByProv[p] { return SIMD2(c.x, c.y) }
                    return SIMD2(meta.provinces[p].x, meta.provinces[p].y)
                }
                if forts != controller.forts { controller.forts = forts }
            }
            if let list = next.holy {
                let holy = list.compactMap { h -> SIMD2<Float>? in
                    guard meta.provinces.indices.contains(h.province) else { return nil }
                    if let c = cityByProv[h.province] { return SIMD2(c.x, c.y) }
                    return SIMD2(meta.provinces[h.province].x, meta.provinces[h.province].y)
                }
                if holy != controller.holy { controller.holy = holy }
            }
        }
        refreshLanes()
        refreshWashes(previous: previous, next: next)
        refreshArmies()
        refreshEffects(previous: previous)
        if mapView != .state && mapView != .terrain, !playing || CACurrentMediaTime() - lastViewRefresh > 0.6 {
            lastViewRefresh = CACurrentMediaTime()
            Task { await refreshView() }
        }
        maybeRecordCheckpoint(next)
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
        // Revolutions, coups, regime shifts, treaties, ultimatums and royal marriages are proclaimed with bespoke ink animations.
        let seen = Set(old.events.map(\.text))
        for e in next.events where !seen.contains(e.text) {
            if e.text.contains("最后通牒") {
                enqueue(Herald(kind: .ultimatum, text: e.text, nations: []))
            } else if e.text.contains("政变") || e.text.contains("兵变") || e.text.contains("夺权") {
                enqueue(Herald(kind: .coup, text: e.text, nations: []))
            } else if e.text.contains("篡位") || e.text.contains("削藩激变") {
                enqueue(Herald(kind: .house, text: e.text, nations: []))
            } else if e.text.contains("联姻") || e.text.contains("结为秦晋之好") {
                enqueue(Herald(kind: .marriage, text: e.text, nations: []))
            } else if e.text.contains("包围网") || e.text.contains("共同防御") || e.text.contains("通商协定") || e.text.contains("斡旋") {
                enqueue(Herald(kind: .treaty, text: e.text, nations: []))
            } else if e.text.contains("革命") || e.text.contains("立宪") || e.text.contains("改称") || e.text.contains("改制") || e.text.contains("禅位") || e.text.contains("改建") || e.text.contains("改行") || e.text.contains("复辟") || e.text.contains("还政于民") {
                enqueue(Herald(kind: .regime, text: e.text, nations: []))
            }
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
    func dismissHerald() {
        herald = nil
        heraldQueue.removeAll()
        heraldTask?.cancel()
        heraldTask = nil
    }
    private func enqueue(_ h: Herald) {
        if controller.play.pauseOnNews, playing, [Herald.Kind.war, .uprising, .extinction].contains(h.kind) { pause(saving: false) }
        guard controller.play.showHeralds else { return }
        heraldQueue.append(h)
        if heraldQueue.count > 4 { heraldQueue.removeFirst(heraldQueue.count - 4) }
        guard heraldTask == nil else { return }
        heraldTask = Task { [weak self] in
            while let self, !Task.isCancelled, !self.heraldQueue.isEmpty {
                let h = self.heraldQueue.removeFirst()
                self.herald = h
                switch h.kind {
                case .war, .uprising, .house, .coup, .ultimatum: GameFeel.shared.news(.warning)
                case .peace, .restoration, .marriage, .treaty, .regime: GameFeel.shared.news(.success)
                case .capture, .extinction, .capital: GameFeel.shared.newsTap()
                }
                // 场景时长：宣战/政变/通牒 2.9 秒、议和/改制/邦交 2.6 秒、攻克 1.8 秒，其余 2.4 秒。
                let seconds: Double = (h.kind == .war || h.kind == .coup || h.kind == .ultimatum) ? 2.9 : (h.kind == .peace || h.kind == .regime || h.kind == .treaty) ? 2.6 : h.kind == .capture ? 1.8 : 2.4
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                if Task.isCancelled { break }
                self.herald = nil
                try? await Task.sleep(nanoseconds: 350_000_000)
            }
            self?.heraldTask = nil
        }
    }

    /// 放置军队的动效: a burst of the state's colour where they land and how many rose there.
    func playMuster(nation n: Int, province p: Int, count: Int) {
        guard let map, let at = map.meta.cities.first(where: { $0.province == p }) else { return }
        let c = n >= 0 && n < map.meta.nations.count ? (RGB(css: map.meta.nations[n].color) ?? RGB(0.6, 0.6, 0.6)) : RGB(0.6, 0.6, 0.6)
        var e = controller.effects
        e.bursts.append(.init(id: "muster-\(p)-\(UUID().uuidString)", x: Double(at.x), y: Double(at.y), kind: .founded, r: Double(c.r), g: Double(c.g), b: Double(c.b)))
        controller.effects = e
        controller.onHits?([(x: at.x, y: at.y, text: "+\(count) 军", naval: false)])
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
        var fighters = [String: [Int: Int]]()
        for pair in state.contacts ?? [] where pair.count == 2 && state.armies.indices.contains(pair[0]) && state.armies.indices.contains(pair[1]) {
            let a = state.armies[pair[0]], b = state.armies[pair[1]]
            let x = Double(a.x + b.x) / 2, y = Double(a.y + b.y) / 2
            let key = "\(Int(x / 6)):\(Int(y / 6))"
            let old = spots[key] ?? (0, 0, 0)
            spots[key] = (old.x + x, old.y + y, old.n + 1)
            if sides[key] == nil { sides[key] = (a.nation, b.nation); ends[key] = (Double(a.x), Double(a.y), Double(b.x), Double(b.y)) }
            fighters[key, default: [:]][pair[0]] = a.nation; fighters[key, default: [:]][pair[1]] = b.nation
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
            if let s, let f = fighters[key] {
                for (i, n) in f { if n == s.0 { battle.leftTroops += state.armies[i].troops } else { battle.rightTroops += state.armies[i].troops } }
            }
            e.battles.append(battle)
        }
        // A new clash on the map is felt (once per step).
        if !Set(e.battles.map(\.key)).subtracting(controller.effects.battles.map(\.key)).isEmpty { GameFeel.shared.clash() }
        // One-shot bursts: an army destroyed, a state founded, a war declared (shockwave at the defender).
        e.bursts = controller.effects.bursts
        if let previous {
            // 阵亡：每支被消灭的军队（覆灭离场，或打光后回本土重整）在它的图标此刻画出的位置倒下——不是引擎上一步的坐标
            // （图标正走在半路、或在城下排成小圆环时差得很远）。引擎按天结算，一步里相继覆灭的几支按兵力由弱到强错开，
            // 图标停在原处到自己的那一刻、与动画同时消失；同处扎堆的几支合为一处，墨团随之变大，不满屏乱炸。
            let alive = Set(state.armies.map(\.id))
            let prior = Dictionary(previous.armies.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            var placed = [String: SIMD2<Float>]()
            for p in controller.renderer?()?.placedSprites() ?? [] where !p.sprite.key.isEmpty { placed[p.sprite.key] = SIMD2(p.x, p.y) }
            var fallen = [(army: GameState.Army, id: String, at: SIMD2<Float>)]()
            for a in previous.armies where !alive.contains(a.id) { fallen.append((a, "d\(a.id)", placed[a.id] ?? SIMD2(a.x, a.y))) }
            for a in state.armies {
                guard let old = prior[a.id], a.reorganizing == true, old.reorganizing != true else { continue }
                fallen.append((old, "d\(a.id)-\(state.day)", placed[a.id] ?? SIMD2(old.x, old.y)))
            }
            fallen.sort { $0.army.troops != $1.army.troops ? $0.army.troops < $1.army.troops : $0.id < $1.id }
            var groups = [(key: SIMD2<Int32>, members: [Int])]()
            for (i, f) in fallen.enumerated() {
                let key = SIMD2(Int32((f.at.x / 24).rounded(.down)), Int32((f.at.y / 24).rounded(.down)))
                if let k = groups.firstIndex(where: { $0.key == key }) { groups[k].members.append(i) } else { groups.append((key, [i])) }
            }
            let span = min(0.8, max(0, controller.tween * 0.8))
            var delays = [String: Double]()
            for (g, group) in groups.enumerated() {
                let delay = groups.count > 1 ? span * Double(g) / Double(groups.count - 1) : 0
                let lead = fallen[group.members[0]]
                let at = group.members.reduce(SIMD2<Float>(0, 0)) { $0 + fallen[$1].at } / Float(group.members.count)
                let c = rgb(lead.army.nation)
                var burst = MapEffects.Burst(id: lead.id, x: Double(at.x), y: Double(at.y), kind: .destroyed, r: c.0, g: c.1, b: c.2, unit: lead.army.unit)
                burst.delay = delay; burst.count = group.members.count
                e.bursts.append(burst)
                for m in group.members { delays[fallen[m].army.id] = delay }
            }
            controller.deathDelays = delays
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
            var ripples = [Int]()
            let kinds: [(String, MapEffects.Burst.Kind)] = [("农民起义", .shock), ("军阀割据", .coup), ("藩镇独立", .coup), ("神国起义", .regime), ("复国运动", .founded), ("复辟", .regime), ("改制", .regime), ("禅位", .regime), ("改建", .regime), ("推行", .talent), ("诗文", .talent), ("书院", .talent), ("文艺复兴", .talent), ("寺观", .talent), ("五谷丰登", .harvest), ("人丁兴旺", .harvest), ("婴戏盈门", .harvest), ("天灾", .disaster), ("大旱", .disaster), ("水患", .disaster), ("大雪", .disaster), ("蝗灾", .disaster), ("地震", .disaster), ("洪水", .disaster), ("大火", .disaster), ("名臣辈出", .talent), ("开科", .talent), ("名医", .talent), ("学者", .talent), ("瘟疫", .plague), ("商路大开", .trade), ("互市", .trade), ("宝藏", .trade), ("矿藏", .trade), ("万国来朝", .trade), ("篡位", .coup), ("政变", .coup), ("夺权", .coup), ("革命", .coup), ("倒台", .regime), ("改称", .regime), ("改行", .regime), ("改奉", .regime), ("破产", .regime), ("总罢工", .shock), ("街头冲突", .shock), ("学潮", .shock)]
            for ev in state.events where !seenText.contains(ev.text) {
                guard let kind = kinds.first(where: { ev.text.contains($0.0) })?.1 else { continue }
                // Where it happened, when the chronicle knows the place.
                if let p = ev.province, let city = map.meta.cities.first(where: { $0.province == p }) {
                    e.bursts.append(.init(id: "e\(ev.day)-\(ev.text.hashValue)", x: Double(city.x), y: Double(city.y), kind: kind, r: 0.86, g: 0.2, b: 0.12))
                    if kind == .regime || kind == .coup, state.owners.indices.contains(p), state.owners[p] >= 0, !ripples.contains(state.owners[p]) { ripples.append(state.owners[p]) }
                    continue
                }
                let named = map.meta.nations.indices.filter { !map.meta.nations[$0].name.isEmpty && ev.text.hasPrefix(map.meta.nations[$0].name) }
                guard let n = named.max(by: { map.meta.nations[$0].name.count < map.meta.nations[$1].name.count }) else { continue }
                let cap = map.meta.nations[n].capital
                guard map.meta.cities.indices.contains(cap) else { continue }
                let c = rgb(n)
                e.bursts.append(.init(id: "e\(ev.day)-\(ev.text.hashValue)", x: Double(map.meta.cities[cap].x), y: Double(map.meta.cities[cap].y), kind: kind, r: c.0, g: c.1, b: c.2))
                // 改朝换代、政变、篡位：从首都扫过全国的一道墨圈（颜色因此变了的州按换色扫）。
                if kind == .regime || kind == .coup, !ripples.contains(n) { ripples.append(n) }
            }
            if !ripples.isEmpty, !controller.washDemo { controller.washes.ripples = ripples.sorted() }
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
        let url = Self.saveURL, card = Self.currentCardURL, info = currentCard()
        return await Task.detached(priority: .utility) { () -> Bool in
            guard (try? data.write(to: url, options: .atomic)) != nil else { return false }
            if let info, let raw = try? JSONEncoder().encode(info) { try? raw.write(to: card, options: .atomic) }
            return true
        }.value
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
        try? FileManager.default.removeItem(at: Self.currentCardURL)
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

    /// 战争晕染（墨场）的输入：本步的行军、守军、围城（权威进度）与攻占。攻占保留约两秒（界面合并几步时也不漏），
    /// 期间若又易手就作废。读档、换世界（没有上一步状态）时换代，渲染端清空旧墨。
    private var washSerial = 0
    private var recentCaptures: [Int: (input: WashInput, time: CFTimeInterval)] = [:]
    private func refreshWashes(previous: GameState?, next: GameState) {
        if previous == nil { washSerial &+= 1; recentCaptures = [:] }
        var frame = WashFrame.from(previous: previous, next: next)
        let now = CACurrentMediaTime()
        for c in frame.inputs where c.kind == .capture { recentCaptures[c.province] = (c, now) }
        recentCaptures = recentCaptures.filter { now - $0.value.time < 2 && next.owners.indices.contains($0.key) && next.owners[$0.key] == $0.value.input.attacker }
        let fresh = Set(frame.inputs.filter { $0.kind == .capture }.map(\.province))
        frame.inputs += recentCaptures.keys.sorted().filter { !fresh.contains($0) }.map { recentCaptures[$0]!.input }
        guard !controller.washDemo else { return }
        controller.washEpoch = washSerial
        controller.washes = frame
    }

    func refreshArmies() {
        guard let state else { controller.armies = []; return }
        let selected = controller.marchingArmy ?? controller.selectedArmy
        var sprites: [MapRenderer.ArmySprite] = state.armies.enumerated().compactMap { i, a in
            guard a.x.isFinite && a.y.isFinite else { return nil }
            let isSel = i == selected || (controller.selectedArmyId != nil && a.id == controller.selectedArmyId) || controller.groupArmies.contains(i)
            return MapRenderer.ArmySprite(army: i, x: a.x, y: a.y, unit: a.unit, nation: a.nation, selected: isSel, key: a.id,
                                          tier: a.troops < 2000 ? 1 : a.troops < 6000 ? 2 : 3, banner: a.banner == "ruler" ? 2 : a.banner == "general" ? 1 : 0, reorganizing: a.reorganizing ?? false, fighting: a.status == "fighting", retreating: a.status == "retreating")
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
        // 兵力 under each army's plaque (the original's army label), shown once zoomed in enough.
        var counts = [String: String]()
        // 兵力前加一字军情：战（交战）、退（撤退）、集（集结待发）、守（驻防）、援（回援本土）、征（出征）、行（行军）；驻扎不标。
        for a in state.armies where a.troops > 0 {
            let n = a.troops >= 10000 ? String(format: "%.1f万", Double(a.troops) / 10000) : "\(a.troops)"
            counts[a.id] = Self.stateMark(a).map { $0 + " " + n } ?? n
        }
        controller.troopTexts = counts
        controller.armies = sprites
        if let selected, state.armies.indices.contains(selected), state.armies[selected].travel == "moving" {
            let id = state.armies[selected].id
            Task {
                let points = await native.route(armyId: id)
                controller.route = points.map { SIMD2(Float($0[0]), Float($0[1])) }
            }
        } else { controller.route = [] }
    }

    /// 军队状态的一字标记（与军事页的分类一致）；驻扎不动的军队不标。
    static func stateMark(_ a: GameState.Army) -> String? {
        if a.status == "fighting" { return "战" }
        if a.status == "retreating" { return "退" }
        switch a.duty {
        case "staging": return "集"
        case "guarding": return "守"
        case "supporting": return "援"
        case "attacking": return "征"
        default: return a.travel == "moving" ? "行" : nil
        }
    }
    static func offset(_ sprites: inout [MapRenderer.ArmySprite]) {
        // Always applied (an offset switched on only when crowded made icons hop as columns passed).
        for i in sprites.indices where sprites[i].army > -100_000 {
            var h: UInt32 = 2166136261
            for u in sprites[i].key.utf8 { h = (h ^ UInt32(u)) &* 16777619 }
            let angle = Float(h % 360) * .pi / 180, r = Float(1.6 + Double(h >> 9 % 100) / 100 * 1.6)
            sprites[i].x += cos(angle) * r; sprites[i].y += sin(angle) * r
        }
    }


    func fleet(_ index: Int?) -> GameState.Fleet? { index.flatMap { i in state?.fleets?.indices.contains(i) == true ? state!.fleets![i] : nil } }
    func army(_ index: Int?) -> GameState.Army? { index.flatMap { i in state?.armies.indices.contains(i) == true ? state!.armies[i] : nil } }
    /// 按稳定 ID 找回军团（推演中数组顺序变更时不会错位，覆灭时返回 nil 以便界面优雅提示而非空白屏）。
    func resolveArmy(id: String?, fallback index: Int?) -> (index: Int, army: GameState.Army)? {
        guard let list = state?.armies else { return nil }
        if let id, !id.isEmpty, let i = list.firstIndex(where: { $0.id == id }) { return (i, list[i]) }
        if let index, list.indices.contains(index) { return (index, list[index]) }
        return nil
    }
    func resolveFleet(id: String?, fallback index: Int?) -> (index: Int, fleet: GameState.Fleet)? {
        guard let list = state?.fleets else { return nil }
        if let id, !id.isEmpty, let i = list.firstIndex(where: { $0.id == id }) { return (i, list[i]) }
        if let index, list.indices.contains(index) { return (index, list[index]) }
        return nil
    }

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
            controller.viewKey = ""
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
        controller.viewKey = mode.rawValue
        if controller.viewFills != fills { controller.viewFills = fills }
        if viewLegend != v.legend { viewLegend = v.legend }
    }
    /// 天下规则: world rates in percent (war, damage, march, levy, ships).
    func worldRules() async -> [String: Int] {
        guard let data = await native.worldRules(), let v = await Self.decode([String: Double].self, from: data) else { return [:] }
        return v.mapValues { Int($0.rounded()) }
    }
    func setWorldRule(_ key: String, _ value: Double?) async -> String? { finish(await native.setWorldRule(key, value: value)) }
    func editFleet(_ id: String, ships: Int?, name: String?) async -> String? { finish(await native.editFleet(id, ships: ships, name: name)) }
    func worldSettings() async -> WorldSettings? {
        guard let data = await native.worldSettings() else { return nil }
        return await Self.decode(WorldSettings.self, from: data)
    }
    func setWorld(_ key: String, _ value: Int) async -> String? { finish(await native.setWorld(key, value)) }
    func triggerCivilWar(_ n: Int) async -> String? { finish(await native.triggerCivilWar(n)) }
    func regime(_ n: Int) async -> (history: [String], trait: String) { await native.regime(n) }
    func editPerson(_ id: Int, skills: [Double], traits: [String]) async -> String? { finish(await native.editPerson(id, skills: skills, traits: traits)) }
    func editNation(_ n: Int, gold: Double?, destiny: Double?, polity: String?, culture: String? = nil, religion: String? = nil) async -> String? { finish(await native.editNation(n, gold: gold, destiny: destiny, polity: polity, culture: culture, religion: religion)) }
    func officeCandidates(_ n: Int, office: String) async -> [NationInfo.Person] {
        guard let d = await native.officeCandidates(n, office: office) else { return [] }
        return (await Self.decode([NationInfo.Person].self, from: d)) ?? []
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
        return (await Self.decode([PostInfo].self, from: d)) ?? []
    }
    func postCandidates(_ n: Int, post: String) async -> [NationInfo.Person] {
        guard let d = await native.postCandidates(n, post: post) else { return [] }
        return (await Self.decode([NationInfo.Person].self, from: d)) ?? []
    }
    func appointPost(_ n: Int, post: String, person: Int) async -> String? { finish(await native.appointPost(n, post: post, person: person)) }
    func editCourt(_ n: Int, key: String, value: Double) async -> String? { finish(await native.editCourt(n, key: key, value: value)) }
    func appointOffice(_ n: Int, office: String, person: Int) async -> String? { finish(await native.appointOffice(n, office: office, person: person)) }
    func setCourtManual(_ n: Int, manual: Bool) async -> String? { finish(await native.setCourtManual(n, manual: manual)) }
    func edit(_ name: String, _ args: [String: Any]) async -> String? { finish(await native.edit(name, args)) }
    struct DistrictRow: Decodable, Identifiable { let id: Int; let name: String; let provinces: Int }
    struct FamilyRow: Decodable, Identifiable { let id: String; let name: String; let provinces: Int; let influence: Double }
    struct AllianceRow: Decodable, Identifiable { let id: Int; let name: String; let color: String; let unbreakable: Bool; let members: [Int] }
    struct ExtraUnit: Decodable, Hashable { let base: String; let name: String; let power: Double; let speed: Double; let weight: Double }
    struct MapImage: Decodable, Identifiable, Equatable { let id: Int; let name: String; let data: String; let x: Double; let y: Double; let width: Double; let angle: Double; let alpha: Double; let front: Bool; let visible: Bool }
    struct MapExtras: Decodable { var rivers: [[Double]]? = nil; var images: [MapImage]? = nil; var abandon: Bool? = nil; var noAssist: Bool? = nil }
    struct PlaceNames: Decodable { let cities: [String]; let provinces: [String] }
    @Published var customImages: [MapImage] = []
    private func list<T: Decodable>(_ type: T.Type, _ name: String, _ args: [String: Any] = [:]) async -> T? {
        guard let d = await native.query(name, args) else { return nil }
        return await Self.decode(type, from: d)
    }
    func districtList() async -> [DistrictRow] { await list([DistrictRow].self, "districtList") ?? [] }
    func familyList() async -> [FamilyRow] { await list([FamilyRow].self, "familyList") ?? [] }
    func allianceList() async -> [AllianceRow] { await list([AllianceRow].self, "allianceList") ?? [] }
    func mapExtras() async -> MapExtras { await list(MapExtras.self, "mapExtras") ?? MapExtras() }
    func extraUnits(_ n: Int) async -> [ExtraUnit] { await list([ExtraUnit].self, "extraUnits", ["n": n]) ?? [] }
    func addRiver(_ points: [Double]) async -> String? { let e = finish(await native.edit("addMapRiver", ["points": points])); await refreshCustom(); return e }
    func setMapImage(id: Int, name: String, data: String?, x: Double, y: Double, width: Double, angle: Double, alpha: Double, front: Bool, visible: Bool) async -> String? {
        let body: [String: Any] = ["id": id, "name": name, "data": data.map { $0 as Any } ?? NSNull(), "x": Int(x), "y": Int(y), "width": Int(width), "angle": Int(angle * 1000), "alpha": Int(alpha * 1000), "front": front ? 1 : 0, "visible": visible ? 1 : 0]
        let e = finish(await native.edit("setMapImage", body)); await refreshCustom(); return e
    }
    /// 档案包 to a file for sharing.
    func exportPackage(_ n: Int, name: String) async -> URL? {
        guard let d = await native.query("exportPackage", ["n": n]) else { return nil }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name + ".json")
        return (try? d.write(to: url)) == nil ? nil : url
    }
    func importPackage(_ n: Int, from url: URL) async -> String? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return "读取文件失败" }
        let e = finish(await native.edit("importPackage", ["n": n, "text": text])); await refreshCustom(); return e
    }
    /// Renamed places reach the map.
    private func refreshPlaceNames() async {
        guard let names = await list(PlaceNames.self, "placeNames"), var world = controller.world ?? map else { return }
        guard names.cities.count == world.meta.cities.count, names.provinces.count == world.meta.provinces.count else { return }
        var changed = false
        for i in world.meta.cities.indices where world.meta.cities[i].name != names.cities[i] { world.meta.cities[i].name = names.cities[i]; changed = true }
        for i in world.meta.provinces.indices where world.meta.provinces[i].name != names.provinces[i] { world.meta.provinces[i].name = names.provinces[i]; changed = true }
        if changed { map?.meta.cities = world.meta.cities; map?.meta.provinces = world.meta.provinces; controller.world = world }
    }
    struct UnitRow: Decodable, Identifiable { let key: String; let base: String; let name: String; let note: String; let power: Double; let speed: Double; let weight: Double; var id: String { key } }
    struct MapLabel: Decodable, Identifiable, Equatable { let id: Int; let text: String; let x: Double; let y: Double; let size: Double; let color: String; let angle: Double }
    struct CultureEdit: Decodable { var base: String? = nil; var name: String? = nil; var text: String? = nil; var male: [String]? = nil; var female: [String]? = nil }
    struct FaithEdit: Decodable { var name: String? = nil; var text: String? = nil }
    struct Catalog: Decodable { var cultures: [String: CultureEdit] = [:]; var faiths: [String: FaithEdit] = [:] }
    @Published var customLabels: [MapLabel] = []
    @Published var catalog = Catalog()
    private let baseCulture = Names.culture, baseReligion = Names.religion, baseCultureIds = Names.cultureIds
    /// The world's labels and reworded cultures and faiths.
    func refreshCustom() async {
        if let d = await native.mapLabels(), let list = await Self.decode([MapLabel].self, from: d) { customLabels = list; controller.customLabels = list }
        let extras = await mapExtras()
        customImages = extras.images ?? []; controller.customImages = customImages; controller.customRivers = (extras.rivers ?? []).map { $0.map { Float($0) } }
        await refreshPlaceNames()
        if let d = await native.catalogEdits(), let c = await Self.decode(Catalog.self, from: d) {
            catalog = c
            Names.culture = baseCulture; Names.religion = baseReligion; Names.cultureIds = baseCultureIds + c.cultures.filter { $0.value.base != nil }.keys.sorted()
            for (k, e) in c.cultures { if let n = e.name { Names.culture[k] = n } }
            for (k, e) in c.faiths { if let n = e.name { Names.religion[k] = n } }
        }
    }
    func setStateTrait(_ n: Int, trait: String?, on: Bool) async -> String? { finish(await native.setStateTrait(n, trait: trait, on: on)) }
    func setOfficeTitle(_ n: Int, office: String, title: String?) async -> String? { finish(await native.setOfficeTitle(n, office: office, title: title)) }
    func unitProfile(_ n: Int) async -> [UnitRow] {
        guard let d = await native.unitProfile(n) else { return [] }
        return await Self.decode([UnitRow].self, from: d) ?? []
    }
    func setUnitProfile(_ n: Int, unit: String, name: String?, power: Double?, speed: Double?, weight: Double?) async -> String? { finish(await native.setUnitProfile(n, unit: unit, name: name, power: power.map { Int($0) }, speed: speed.map { Int($0) }, weight: weight.map { Int($0) })) }
    func leaveAlliance(_ n: Int) async -> String? { finish(await native.leaveAlliance(n)) }
    func setCultureEdit(_ k: String, name: String?, text: String?, male: [String], female: [String]) async -> String? { let e = finish(await native.setCultureEdit(k, name: name, text: text, male: male, female: female)); await refreshCustom(); return e }
    func setFaithEdit(_ k: String, name: String?, text: String?) async -> String? { let e = finish(await native.setFaithEdit(k, name: name, text: text)); await refreshCustom(); return e }
    func setMapLabel(id: Int, text: String, x: Double, y: Double, size: Double, color: String, angle: Double) async -> String? {
        let e = finish(await native.setMapLabel(id: id, text: text, x: Int(x), y: Int(y), size: Int(size), color: color, angle: Int(angle * 1000)))
        await refreshCustom(); return e
    }
    func removeMapLabel(_ id: Int) async -> String? { let e = finish(await native.removeMapLabel(id: id)); await refreshCustom(); return e }
    /// 导出大事记: the whole chronicle as a text file.
    func exportChronicle() async -> URL? {
        let all = await chronicle("all"), land = await chronicle("territory")
        let rows = (all + land).sorted { $0.day < $1.day }
        guard !rows.isEmpty else { return nil }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("列国纪大事记.txt")
        let text = rows.map { "第\($0.day)日　\($0.text)" + ($0.reason.isEmpty ? "" : "（\($0.reason)）") }.joined(separator: "\n")
        return (try? text.write(to: url, atomically: true, encoding: .utf8)) == nil ? nil : url
    }
    func grantRegion(_ province: Int, size: Int, to nation: Int) async -> String? { finish(await native.grantRegion(province, size: size, to: nation)) }
    func greatRebellion(_ province: Int, size: Int, kind: String?) async -> String? { finish(await native.greatRebellion(province, size: size, kind: kind)) }
    func restoreNation(_ province: Int, nation: Int, size: Int) async -> String? { finish(await native.restoreNation(province, nation: nation, size: size)) }
    func provinceDisaster(_ province: Int, kind: String?) async -> String? { finish(await native.provinceDisaster(province, kind: kind)) }
    func clearArmies(_ province: Int) async -> String? { finish(await native.clearArmies(province)) }
    func setProvinceFaith(_ province: Int, religion: String) async -> String? { finish(await native.setProvinceFaith(province, religion: religion)) }
    func setProvinceGrain(_ province: Int, grain: Double) async -> String? { finish(await native.setProvinceGrain(province, grain: Int(grain))) }
    func setReform(_ n: Int, reform: String, on: Bool) async -> String? { finish(await native.setReform(n, reform: reform, on: on)) }
    func addArmy(_ n: Int, province: Int, count: Int = 1) async -> String? { finish(await native.addArmy(n, province: province, count: count)) }
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
    /// 全军交 AI: these armies (every player-commanded army and fleet when empty) back to the war council.
    func releaseToAI(armies: [Int]) async -> (ok: Bool, reason: String) {
        let out = await native.releaseToAI(armies.compactMap { army($0)?.id })
        if let data = out.state, let next = try? JSONDecoder().decode(GameState.self, from: data) { apply(next) }
        return (out.ok, out.reason)
    }
    func nationHistory(_ n: Int) async -> [GameState.Event] {
        guard let data = await native.nationHistory(n) else { return [] }
        return (await Self.decode([GameState.Event].self, from: data)) ?? []
    }
    func grant(province: Int, to nation: Int) async -> String? { finish(await native.territory([province], to: nation)) }
    func retreat(army index: Int, to province: Int) async -> String? {
        guard let a = army(index) else { return "这支军队不存在或已失去战斗力。" }
        return finish(await native.retreat(armyId: a.id, province: province))
    }
    func statistics(_ category: String) async -> [StatisticsRow] {
        guard let data = await native.statistics(category) else { return [] }
        return (await Self.decode([StatisticsRow].self, from: data)) ?? []
    }

    func financeInfo(_ index: Int) async -> FinanceOverview? {
        await query(FinanceOverview.self) { await native.financeInfo(index) }
    }
    func changeDebt(_ n: Int, borrow: Bool) async -> String? { finish(await native.changeDebt(n, borrow: borrow)) }
    func changeCorruption(_ n: Int, lower: Bool) async -> String? { finish(await native.changeCorruption(n, lower: lower)) }
    func inciteRebellion(_ n: Int) async -> String? { finish(await native.inciteRebellion(n)) }
    func setHolyProvince(_ province: Int) async -> String? { finish(await native.setHolyProvince(province)) }
    func foundNation(_ province: Int, war: Bool) async -> String? { finish(await native.foundNation(province, war: war)) }
    func familyAction(_ id: Int, action: String) async -> String? { finish(await native.familyAction(id, action: action)) }
    func setTax(_ n: Int, _ value: String) async -> String? { finish(await native.setTax(n, value)) }
    func regionInfo(_ province: Int) async -> RegionInfo? {
        await query(RegionInfo.self) { await native.regionInfo(province) }
    }
    func renameRegion(_ province: Int, _ name: String) async -> String? { finish(await native.renameRegion(province, name)) }
    func setRegionCenter(_ province: Int) async -> String? { finish(await native.setRegionCenter(province)) }
    /// 大事记 by category, newest first.
    /// 名将谱: the commanders who earned a rank, the most merit first.
    func generals() async -> [GeneralEntry] {
        await query([GeneralEntry].self) { await native.generals() } ?? []
    }
    func chronicle(_ category: String) async -> [ChronicleEntry] {
        await query([ChronicleEntry].self) { await native.chronicle(category) } ?? []
    }
    func setCalendar(era: String, year: Int?) async -> String? { finish(await native.setCalendar(era: era, year: year)) }
    func setCityCulture(_ province: Int, _ culture: String) async -> String? { finish(await native.setCityCulture(province, culture)) }
    func tradeInfo(_ index: Int) async -> TradeOverview? {
        await query(TradeOverview.self) { await native.tradeInfo(index) }
    }
    func familyTree(_ family: String) async -> FamilyTree? {
        await query(FamilyTree.self) { await native.familyTree(family) }
    }
    func setLivelihood(_ n: Int, _ value: String) async -> String? { finish(await native.setLivelihood(n, value)) }
    func setSpecialty(_ province: Int, _ good: Int?) async -> String? { finish(await native.setSpecialty(province, good)) }
    func armyRecord(_ id: String) async -> ArmyService? {
        await query(ArmyService.self) { await native.armyRecord(id) }
    }
    func diplomacyInfo(_ index: Int) async -> DiplomacyOverview? {
        await query(DiplomacyOverview.self) { await native.diplomacyInfo(index) }
    }
    func nationInfo(_ index: Int) async -> NationInfo? {
        await query(NationInfo.self) { await native.nationInfo(index) }
    }
    struct NationProvinceRow: Decodable, Identifiable {
        var id: Int { index }
        let index: Int; let name: String; let population: Int; let capacity: Int
        let defense: Int; let fortress: Bool; let capital: Bool; let port: Bool
        let specialty: String; let culture: String; let religion: String
        var governor: String? = nil; var governorFit: Double? = nil
        var familyId: String? = nil; var familyName: String? = nil
        let armies: Int
    }
    func nationProvinces(_ index: Int) async -> [NationProvinceRow] {
        await query([NationProvinceRow].self) { await native.nationProvinces(index) } ?? []
    }
    func throneCandidates(_ index: Int) async -> [NationInfo.Person] {
        await query([NationInfo.Person].self) { await native.throneCandidates(index) } ?? []
    }
    func enthronePerson(_ index: Int, person: Int) async -> String? {
        finish(await native.enthronePerson(index, person: person))
    }
    /// Alliance with another state, or leaving the current one (b < 0).
    func alliance(_ a: Int, with b: Int) async -> String? { finish(await native.alliance(a, with: b)) }
    func releaseVassal(_ n: Int) async -> String? { finish(await native.releaseVassal(n)) }
    func makeVassal(_ vassal: Int, of overlord: Int) async -> String? { finish(await native.makeVassal(vassal, of: overlord)) }
    func annex(_ target: Int, by annexer: Int) async -> String? { finish(await native.annex(target, by: annexer)) }
    func setAutoDiplomacy(_ n: Int, _ enabled: Bool) async -> String? { finish(await native.setAutoDiplomacy(n, enabled)) }
    func regimeTransition(_ n: Int, action: String) async -> String? { await edit("regimeTransition", ["n": n, "action": action]) }
    func partyAction(_ n: Int, party: Int, action: String) async -> String? { await edit("partyAction", ["n": n, "party": party, "action": action]) }
    func sendUltimatum(_ from: Int, to: Int, demand: String) async -> String? { await edit("sendUltimatum", ["from": from, "to": to, "demand": demand]) }
    func formCoalition(_ caller: Int, against target: Int) async -> String? { await edit("formCoalition", ["caller": caller, "target": target]) }
    func covertAction(_ from: Int, target: Int, kind: String) async -> String? { await edit("covertAction", ["from": from, "target": target, "kind": kind]) }
    func mediatePeace(_ mediator: Int, between a: Int, and b: Int) async -> String? { await edit("mediatePeace", ["mediator": mediator, "a": a, "b": b]) }
    func grantFief(_ n: Int, family: String, province: Int? = nil) async -> String? {
        var args: [String: Any] = ["n": n, "family": family]
        if let province { args["province"] = province }
        return await edit("grantFief", args)
    }
    func revokeFief(_ n: Int, family: String) async -> String? { await edit("revokeFief", ["n": n, "family": family]) }

    func provinceInfo(_ index: Int) async -> ProvinceInfo? {
        await query(ProvinceInfo.self) { await native.province(index) }
    }
}

extension GameModel {
    /// 建世界进度（people、armies、map）→ 开创画面的阶段说明。
    func noteFoundingStage(_ stage: String) {
        guard let index = ["people": 0, "armies": 1, "map": 2][stage] else { return }
        controller.foundingStage = index
    }
    /// 建好的世界：本机 Swift 建成，或（Swift 失败时）网页引擎建成后交接。
    enum Founded { case native(NativeHost.Made), web(String) }
    /// 先用 Swift 建世界；失败（且世界未切换）才退回网页引擎。记录耗时与所走的路。
    func found(_ options: NativeCreation.Options, webOptions: String, epoch: Int) async throws -> Founded {
        let started = Date()
        do {
            let made = try await native.create(options, world: epoch, progress: { stage in Task { @MainActor [weak self] in self?.noteFoundingStage(stage) } })
            noteFounding("swift", Date().timeIntervalSince(started), cityCount: made.cityCount, error: nil)
            return .native(made)
        } catch {
            guard epoch == worldEpoch else { throw error }
            let reason = error.localizedDescription
            let webHost = ensureLegacyEngine()
            await Task.yield()
            let text = try await webHost.call("generate(options)", ["options": webOptions], timeout: Self.foundingLimit)
            noteFounding("web", Date().timeIntervalSince(started), cityCount: nil, error: reason)
            return .web(text)
        }
    }
    /// 建世界耗时（CI 巡游写到 Documents/founding-time.json，含同一世界用网页引擎建的对照耗时）。
    func noteFounding(_ path: String, _ seconds: Double, cityCount: Int?, error: String?) {
        lastFounding = (path, seconds)
        guard ShotTour.on else { return }
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("founding-time.json")
        var o = (try? JSONSerialization.jsonObject(with: Data(contentsOf: url))) as? [String: Any] ?? [:]
        o[path] = ["seconds": (seconds * 1000).rounded() / 1000, "cityCount": cityCount.map { $0 as Any } ?? NSNull(), "error": error.map { $0 as Any } ?? NSNull()]
        if let data = try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys, .prettyPrinted]) { try? data.write(to: url) }
    }
    /// NewWorld / 自绘地图选项 → NativeCreation.Options（与给网页引擎的 JSON 同义）。
    static func nativeOptions(seed: String, template: String, nations: Int, provinces: Int, relations: String, naming: String, cultures: Set<String>, climate: ClimateSettings) -> NativeCreation.Options {
        var o = NativeCreation.Options(seed: seed, template: template, count: nations, cityCount: provinces, relations: relations == "war" ? "war" : "peace",
                                       naming: naming == "culture-generated" ? "culture-generated" : "historical-names", cultures: Names.cultureIds.filter { cultures.contains($0) })
        o.precipitation = Double(climate.rain); o.temperatureOffset = Double(climate.temperature)
        o.north = Double(climate.north) / 100; o.south = Double(min(climate.south, climate.north - 10)) / 100
        return o
    }
}
