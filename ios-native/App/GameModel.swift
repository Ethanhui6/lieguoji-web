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
    /// The Swift engine: after a world is built (or a Swift save opened) it runs every day,
    /// command and save; the web engine only builds new worlds.
    let native = NativeHost()
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
                let preview = await Task.detached(priority: .userInitiated) { PreviewWorld.build(inputs, seed: seed, template: options.template, nations: nations, cities: provinceCount) }.value
                state = nil; controller.world = nil; controller.armies = []; controller.effects = MapEffects()
                map = preview; worldID = UUID()
                generationNote = ""
                phase = .founding
                await rise()
            }
            let world = try await open(try await full.value)
            try await handOver()
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
            let data = try Data(contentsOf: Self.saveURL)
            let world: WorldMap
            let quote = "\""
            if data.starts(with: Array(("{" + quote + "format" + quote + ":" + quote + NativeEngine.saveFormat + quote).utf8)) {
                // A Swift save: the full run and its geometry, no replay.
                let opened = try await native.open(data)
                guard let mapData = opened.map else { throw EngineError.message("存档缺少地图") }
                let loaded = try await Task.detached(priority: .userInitiated) { () throws -> (WorldMap, GameState) in
                    struct Saved: Decodable { let bin: String; let meta: WorldMeta }
                    let m = try JSONDecoder().decode(Saved.self, from: mapData)
                    guard let bin = Data(base64Encoded: m.bin) else { throw EngineError.message("地图数据损坏") }
                    return (try WorldMap(binary: bin, meta: m.meta), try JSONDecoder().decode(GameState.self, from: opened.state))
                }.value
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
        } catch { failure = "存档无法读取：\(error.localizedDescription)"; phase = .title }
    }

    private func open(_ text: String) async throws -> WorldMap {
        let loaded = try await Task.detached(priority: .userInitiated) { () throws -> (WorldMap, GameState) in
            let decoded = try JSONDecoder().decode(LoadedWorld.self, from: Data(text.utf8))
            guard let bin = Data(base64Encoded: decoded.bin) else { throw EngineError.message("地图数据损坏") }
            return (try WorldMap(binary: bin, meta: decoded.meta), decoded.state)
        }.value
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

    /// The web engine's world goes to the Swift engine, which runs it from now on.
    private func handOver() async throws {
        let text = try await engine.call("nativeWorld()")
        _ = try await native.open(Data(text.utf8))
    }

    /// Smoothed time between two applied steps while playing; army icons glide over it.
    private var stepInterval: Double = 0.2
    private var lastApplied: CFTimeInterval?
    private func step(days: Int) async throws {
        let data = await native.step(days: days)
        let next = try await Task.detached { try JSONDecoder().decode(GameState.self, from: data) }.value
        let now = CACurrentMediaTime()
        if playing, let last = lastApplied, now - last < 2 { stepInterval = stepInterval * 0.7 + (now - last) * 0.3 }
        lastApplied = playing ? now : nil
        controller.tween = playing ? min(1.2, max(0.12, stepInterval * 1.05)) : 0.3
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
        refreshArmies()
        refreshEffects(previous: previous)
        if mapView != .state && mapView != .terrain { Task { await refreshView() } }
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
        // The original BattleSword plays between every pair of armies in contact; pairs at one
        // spot share a single animation.
        var spots = [String: (x: Double, y: Double, n: Double)]()
        var sides = [String: (Int, Int)]()
        for pair in state.contacts ?? [] where pair.count == 2 && state.armies.indices.contains(pair[0]) && state.armies.indices.contains(pair[1]) {
            let a = state.armies[pair[0]], b = state.armies[pair[1]]
            let x = Double(a.x + b.x) / 2, y = Double(a.y + b.y) / 2
            let key = "\(Int(x / 6)):\(Int(y / 6))"
            let old = spots[key] ?? (0, 0, 0)
            spots[key] = (old.x + x, old.y + y, old.n + 1)
            if sides[key] == nil { sides[key] = (a.nation, b.nation) }
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
            e.battles.append(.init(key: key, x: v.x / v.n, y: v.y / v.n, left: s.flatMap { side($0.0) }, right: s.flatMap { side($0.1) }))
        }
        // One-shot bursts: an army destroyed, a state founded, a war declared (shockwave at the defender).
        e.bursts = controller.effects.bursts
        if let previous {
            let alive = Set(state.armies.map(\.id))
            for a in previous.armies where !alive.contains(a.id) && a.status == "fighting" {
                e.bursts.append(.init(id: "d\(a.id)", x: Double(a.x), y: Double(a.y), kind: .destroyed, r: 0.3, g: 0.27, b: 0.24))
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
        do { try data.write(to: Self.saveURL, options: .atomic); return true } catch { return false }
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

    func refreshArmies() {
        guard let state else { controller.armies = []; return }
        let selected = controller.marchingArmy ?? controller.selectedArmy
        var sprites: [MapRenderer.ArmySprite] = state.armies.enumerated().map { i, a in
            MapRenderer.ArmySprite(army: i, x: a.x, y: a.y, unit: a.unit, nation: a.nation, selected: i == selected || controller.groupArmies.contains(i), key: a.id)
        }
        // Harbour anchors in the occupier's colour (not tappable; the province panel lists them), then fleets.
        let choosing = controller.marchingFleet ?? controller.selectedFleet
        let chooser = fleet(choosing)?.nation
        for (i, p) in (state.ports ?? []).enumerated() where p.occupier != p.owner || (chooser != nil && p.occupier == chooser) {
            sprites.append(MapRenderer.ArmySprite(army: -100_000 - i, x: p.x, y: p.y, unit: "Port", nation: p.occupier, selected: false, key: "port-\(p.province)"))
        }
        for (i, f) in (state.fleets ?? []).enumerated() {
            sprites.append(MapRenderer.ArmySprite(army: -(i + 1), x: f.x, y: f.y, unit: "Fleet", nation: f.nation, selected: i == choosing, key: f.id))
        }
        controller.armies = sprites
        if let selected, state.armies.indices.contains(selected), state.armies[selected].travel == "moving" {
            let id = state.armies[selected].id
            Task {
                let points = await native.route(armyId: id)
                controller.route = points.map { SIMD2(Float($0[0]), Float($0[1])) }
            }
        } else { controller.route = [] }
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
    func worldSettings() async -> WorldSettings? {
        guard let data = await native.worldSettings() else { return nil }
        return try? JSONDecoder().decode(WorldSettings.self, from: data)
    }
    func setWorld(_ key: String, _ value: Int) async -> String? { finish(await native.setWorld(key, value)) }
    func triggerCivilWar(_ n: Int) async -> String? { finish(await native.triggerCivilWar(n)) }
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
