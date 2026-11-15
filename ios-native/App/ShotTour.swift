import SwiftUI
import CryptoKit
import LieguojiCore

/// The CI screenshot tour (launched with LGJ_SHOT=1 in the simulator): it starts a world at war and
/// walks the map and every panel. Each stop leaves a marker file in Documents; the workflow takes
/// the screenshot and deletes the marker, and the tour goes on.
enum ShotTour {
    static let on = ProcessInfo.processInfo.environment["LGJ_SHOT"] == "1"
    private static var dir: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] }

    /// Waits until the workflow has taken the screenshot `name` (or a minute has passed).
    @MainActor static func shoot(_ name: String) async {
        let marker = dir.appendingPathComponent("shot-\(name).ready")
        try? Data(name.utf8).write(to: marker)
        let start = Date()
        while FileManager.default.fileExists(atPath: marker.path), Date().timeIntervalSince(start) < 60 {
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
    }
    static func wait(_ seconds: Double) async { try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) }

    /// Title, then a new world; the founding is shot while it rises.
    @MainActor static func start(_ model: GameModel) async {
        await wait(4)
        await shoot("01-title")
        model.tourTitle = "settings"
        await wait(0.8)
        await shoot("01b-settings")
        model.tourTitle = "new-world"
        await wait(0.8)
        await wait(1.2)
        await shoot("01c-new-world")
        model.tourTitle = "archive"
        await wait(0.8)
        await shoot("01d-archive")
        model.tourTitle = nil
        await wait(0.4)
        var options = GameModel.NewWorld()
        options.seed = "20261101"; options.nations = 12; options.provinces = "140"; options.relations = "war"
        // 02-founding and 02b-rise are taken inside the rise itself, while those lines are on screen.
        await model.generate(options)
    }

    /// In the world: let the war run, look at the fronts up close, then open each panel.
    @MainActor static func play(_ model: GameModel, show: @escaping (Panel?) -> Void, views: @escaping (Bool) -> Void) async {
        await wait(3)
        await shoot("03-world")
        await checkColors(model)
        await checkNames(model)
        await checkAdvanceOwnership(model)
        // 国名稳定: while the war redraws the borders and the camera stands still, every frame is compared
        // with the one before. A name that dips (hidden or fading) and is back within 45 frames blinked.
        let names = NameWatch(model.controller)
        let owners = model.state?.owners ?? []
        MapLabelsView.namesCreated = 0; MapLabelsView.namesMoved = 0; MapLabelsView.namesFadedIn = 0
        names.start()
        model.play()
        for i in 0..<3 { await wait(12); await shoot("04-war-\(i)") }
        var watch = names.stop()
        watch["provincesChanged"] = zip(owners, model.state?.owners ?? []).filter { $0 != $1 }.count
        watch["created"] = MapLabelsView.namesCreated; watch["moved"] = MapLabelsView.namesMoved; watch["fadedIn"] = MapLabelsView.namesFadedIn
        watch["version"] = 1
        let steady = (watch["frames"] ?? 0) >= 300 && (watch["names"] ?? 0) >= 1 && (watch["blinks"] ?? 99) <= 4
        var report = watch.mapValues { $0 as Any }
        report["passed"] = steady
        if let data = try? JSONSerialization.data(withJSONObject: report, options: .sortedKeys) {
            try? data.write(to: dir.appendingPathComponent("name-stability.json"), options: .atomic)
        }
        // 查看都城: the biggest state's 在地图上查看都城 (the camera glides and zooms, the seal ring closes in).
        if let map = model.map, let state = model.state, let top = state.nations.indices.max(by: { state.nations[$0].provinces < state.nations[$1].provinces }),
           map.meta.nations.indices.contains(top), map.meta.cities.indices.contains(map.meta.nations[top].capital) {
            let c = map.meta.cities[map.meta.nations[top].capital]
            model.controller.showPlace(x: Double(c.x), y: Double(c.y))
            await wait(1.3); await shoot("04c-capital-spotlight")
            await wait(2.4)
        }
        // 地图展开: zoomed all the way out, the whole chart is on screen.
        model.controller.unrollRequest = UUID()
        await wait(1.4)
        let reached = model.controller.cameraScale?() ?? (scale: 0, fit: 0)
        let unrolled: [String: Any] = ["version": 1, "scale": reached.scale, "fit": reached.fit, "passed": reached.fit > 0 && reached.scale <= reached.fit * 1.02]
        if let data = try? JSONSerialization.data(withJSONObject: unrolled, options: .sortedKeys) {
            try? data.write(to: dir.appendingPathComponent("map-unrolled.json"), options: .atomic)
        }
        await shoot("04d-map-unrolled")
        model.controller.resetRequest = UUID(); await wait(0.8)
        // Up close on the biggest fight: armies that are fighting or besieging.
        if let state = model.state, let a = state.armies.filter({ $0.status == "fighting" || $0.status == "sieging" }).max(by: { $0.troops < $1.troops }) ?? state.armies.first {
            model.controller.fly(x: Double(a.x), y: Double(a.y))
            await wait(2); await shoot("05-battle-close")
            await wait(4); await shoot("06-battle-close-later")
            // 墨晕关键帧（在这场战斗所在的州）：西侧入境 0.3 秒、占领过半、铺满；两方交战、优势一方推进、三方、结束淡出。
            if a.province >= 0, state.nations.count >= 5 {
                func camp(_ n: Int, _ dx: Float, _ dy: Float, _ t: Float, _ reach: Float = 1) -> BattleGround.Camp {
                    let len = max(0.001, (dx * dx + dy * dy).squareRoot())
                    return BattleGround.Camp(nation: n, direction: SIMD2(dx / len, dy / len), troops: t, reach: reach)
                }
                let frames: [(String, [BattleGround.Camp], Double)] = [
                    ("07a-ink-enter", [camp(0, -1, 0, 5000, InkFront.entryReach)], 0.3),
                    ("07b-ink-half", [camp(0, -1, 0, 5000, 0.6)], 1.2),
                    ("07c-ink-full", [camp(0, -1, 0, 5000, 1)], 1.4),
                    ("07d-ground-two", [camp(0, -1, 0, 5000), camp(1, 1, 0, 5000)], 1.6),
                    ("07e-ground-push", [camp(0, -1, 0, 2500), camp(1, 1, 0, 7500)], 1.6),
                    ("07f-ground-three", [camp(0, -1, 0.4, 5000), camp(1, 1, 0.4, 3000), camp(2, 0, -1, 2000)], 1.6),
                ]
                model.controller.groundDemo = true
                model.controller.battleGrounds = []; model.controller.objectWillChange.send(); await wait(1.2)
                for (name, camps, after) in frames {
                    model.controller.battleGrounds = [BattleGround(province: a.province, camps: camps)]
                    model.controller.objectWillChange.send()
                    await wait(after); await shoot(name)
                }
                // 战斗结束：份额最大的一方铺满，随后淡出。
                model.controller.battleGrounds = []
                model.controller.objectWillChange.send()
                await wait(0.7); await shoot("07g-ground-end")
                model.controller.groundDemo = false
            }
        }
        // Up close on a resting army and on the one under the commander's banner (the figures).
        if let state = model.state {
            if let a = state.armies.filter({ $0.status != "fighting" && $0.status != "sieging" }).max(by: { $0.troops < $1.troops }) {
                model.controller.fly(x: Double(a.x), y: Double(a.y)); await wait(2.5); await shoot("06b-army-close")
            }
            if let a = state.armies.first(where: { $0.banner != nil }) {
                model.controller.fly(x: Double(a.x), y: Double(a.y)); await wait(2.5); await shoot("06c-banner-close")
            }
        }
        // A burst on a marching army, one shot a second, to see how it walks and meets the enemy.
        if let state = model.state, let a = state.armies.first(where: { $0.travel == "moving" && $0.destination != nil }) {
            // At 4× with the metrics overlay: the shots carry the frame time, the engine's cost per
            // day and the main-thread cost of applying a step.
            let speed = model.speed
            model.speed = 4; model.controller.showMetrics = true
            model.controller.fly(x: Double(a.x), y: Double(a.y)); await wait(1.5)
            for i in 0..<10 { await shoot(String(format: "08-march-%02d", i)); await wait(1) }
            model.speed = speed; model.controller.showMetrics = false
        }
        // Close on a province seat, which is drawn differently from a national capital.
        if let map = model.map, let seat = zip(map.meta.cities, MapLayers.cityMarks(map)).first(where: { $0.1 == .provinceSeat })?.0 {
            model.controller.fly(x: Double(seat.x), y: Double(seat.y))
            await wait(2.2); await shoot("05d-province-seat")
        }
        // 卡顿体检: pan across the map while it plays at 4×, then open and close the nation page five
        // times. Frame gaps of the main thread are measured; the result rides in the shot's name.
        let meter = HitchMeter(), speed = model.speed
        model.speed = 4
        meter.start()
        for a in (model.state?.armies ?? []).prefix(8) { model.controller.fly(x: Double(a.x), y: Double(a.y)); await wait(0.7) }
        await shoot("20-stress-pan-" + meter.stop())
        meter.start()
        for _ in 0..<5 { show(.nation(0)); await wait(0.8); show(nil); await wait(0.5) }
        await shoot("21-stress-panels-" + meter.stop())
        // The same for the province and army pages, to see which page is heavy.
        meter.start()
        for _ in 0..<5 { show(.province(0)); await wait(0.8); show(nil); await wait(0.5) }
        await shoot("22-stress-province-" + meter.stop())
        if !(model.state?.armies.isEmpty ?? true) {
            meter.start()
            for _ in 0..<5 { show(.army(0)); await wait(0.8); show(nil); await wait(0.5) }
            await shoot("23-stress-army-" + meter.stop())
        }
        meter.start()
        for _ in 0..<5 { show(.statistics); await wait(0.8); show(nil); await wait(0.5) }
        await shoot("24-stress-ranking-" + meter.stop())
        // 行军静看：镜头不动、1× 推演 8 秒（玩家最常见的状态）。量主线程帧间隔与底图缓存复用率，结果写进截图名。
        model.speed = 1
        let before = model.controller.baseStats?() ?? (0, 0, 0)
        meter.start()
        await wait(8)
        let glide = meter.stop(), after = model.controller.baseStats?() ?? (0, 0, 0)
        let reused = after.reuses - before.reuses, redrawn = after.renders - before.renders
        await shoot("25-stress-glide-" + glide + "-base\(reused)of\(reused + redrawn)-verts\(after.vertices)")
        model.speed = speed
        model.pause(saving: false)
        await profilePausedPanels(model, show: show)
        views(true); await wait(1); await shoot("07-views"); views(false)
        let nation = model.state?.nations.indices.max { (model.state?.nations[$0].provinces ?? 0) < (model.state?.nations[$1].provinces ?? 0) } ?? 0
        let panels: [(String, Panel)] = [("10-nations", .nations), ("11-nation", .nation(nation)),
                                         ("12-military", .military), ("13-army", .army(0)), ("14-diplomacy", .diplomacy), ("15-chronicle", .chronicle),
                                         ("16-statistics", .statistics), ("17-edicts", .edicts), ("18-menu", .menu), ("19-province", .province(0))]
        for (name, panel) in panels {
            if case .army = panel, model.state?.armies.isEmpty ?? true { continue }
            show(panel); await wait(1.4); await shoot(name)
        }
        // The navy: a fleet's page (ships editable) when the world has fleets.
        if !(model.state?.fleets ?? []).isEmpty { show(.fleet(0)); await wait(1.4); await shoot("13b-fleet") }
        // The nation page's tabs, opened full height.
        for (name, t) in [("11c-court", NationSheet.Tab.court), ("11d-nation-military", .military), ("11e-nation-diplomacy", .diplomacy), ("11f-custom", .custom)] {
            NationSheet.tourTab = t
            show(nil); await wait(0.6); show(.nation(nation)); await wait(1.8); await shoot(name)
        }
        NationSheet.tourTab = nil
        // 战局: the wars at a glance.
        MilitarySheet.tourFilter = "wars"
        show(nil); await wait(0.6); show(.military); await wait(1.8); await shoot("12b-wars")
        MilitarySheet.tourFilter = nil
        // 舆图细节: the whole chart, then close on the land.
        show(nil); await wait(0.6)
        if let map = model.map, let c = map.meta.cities.dropFirst(5).first { model.controller.fly(x: Double(c.x), y: Double(c.y)); await wait(2.2); await shoot("05e-map-detail") }
        show(nil); await wait(0.6)
        // 罗盘, and the world editor's pages.
        if let map = model.map { let c = MapLayers.compassCorner(map); model.controller.fly(x: Double(c.x), y: Double(c.y)); await wait(2.2); await shoot("05f-compass") }
        for (name, t) in [("17b-editor-brush", WorldEditorSheet.Tab.brush), ("17c-editor-land", .land), ("17d-editor-pact", .pact), ("17e-editor-map", .map), ("17f-editor-labels", .labels), ("17g-editor-culture", .culture)] {
            WorldEditorSheet.tourTab = t
            show(nil); await wait(0.5); show(.editor); await wait(1.6); await shoot(name)
        }
        WorldEditorSheet.tourTab = nil
        show(nil); await wait(0.5)
        // 长按面板 and 横屏 (its rail and its side page).
        if let p = model.map?.meta.cities.dropFirst(3).first?.province { show(nil); await wait(0.6); show(.quick(p)); await wait(1.4); await shoot("14-quick") }
        show(nil); await wait(0.6)
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight))
            await wait(1.8); await shoot("30-landscape")
            show(.nation(nation)); await wait(1.8); await shoot("31-landscape-nation")
            show(nil); await wait(0.6)
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
            await wait(1.4)
        }
        await shootRulerTraits(model, nation: nation, show: show)
        show(nil); await wait(1)
        await shoot("done")
    }

    /// Real controls and the real Swift engine: fast pause/resume, then queued single steps.
    /// Check every installed reply, and finish only when the paused display matches the engine.
    @MainActor private static func checkAdvanceOwnership(_ model: GameModel) async {
        let startDay = model.state?.day ?? 0
        var days = [Int](), backwards = 0, previous = startDay, controls = 0
        model.onAdvanceApplied = { day in
            if day < previous { backwards += 1 }
            previous = day; days.append(day)
        }
        defer { model.onAdvanceApplied = nil }
        if let world = await model.native.save() {
            try? world.write(to: dir.appendingPathComponent("ci-control-world.lgj"), options: .atomic)
        }
        if let tuning = CloudConfig.shared.tuningData {
            try? tuning.write(to: dir.appendingPathComponent("ci-control-tuning.json"), options: .atomic)
        }
        for _ in 0..<10 {
            model.play(); await wait(0.035)
            model.pause(saving: false); model.stepOnce(); model.stepOnce()
            await wait(0.015)
            model.play(); await wait(0.035)
            model.pause(saving: false)
            controls += 6
        }
        // These three synchronous controls deterministically cancel play before it can await the
        // queued single step. Its real reply must still reach the paused display.
        let beforeManual = await model.native.localDayForTour() ?? -1
        model.stepOnce(); model.play(); model.pause(saving: false)
        controls += 3
        let manualDeadline = Date().addingTimeInterval(15)
        var manualDrain = false
        while Date() < manualDeadline, !manualDrain {
            await wait(0.15)
            if let day = await model.native.localDayForTour() {
                manualDrain = day > beforeManual && model.state?.day == day
            }
        }
        model.play(); await wait(2); model.pause(saving: false)
        controls += 2
        var authoritative = -1, stable = 0
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline, stable < 3 {
            await wait(0.15)
            if let day = await model.native.localDayForTour() {
                let matching = model.state?.day == day
                stable = matching && authoritative == day ? stable + 1 : 0
                authoritative = day
            }
        }
        let endDay = model.state?.day ?? -1
        let passed = manualDrain && backwards == 0 && endDay > startDay && stable >= 3 && endDay == authoritative
        let report: [String: Any] = ["version": 2, "passed": passed, "controls": controls, "samples": days.count,
                                     "startDay": startDay, "endDay": endDay, "authoritativeDay": authoritative,
                                     "backwards": backwards, "manualDrain": manualDrain]
        if let data = try? JSONSerialization.data(withJSONObject: report, options: .sortedKeys) {
            try? data.write(to: dir.appendingPathComponent("advance-ownership.json"), options: .atomic)
        }
        await shoot("09-pause-resume")
    }

    /// Keep one world frozen across all panel measurements. Saving is outside the measured window;
    /// the before/after bytes ensure a background tail or an inspection query did not change it.
    @MainActor private static func profilePausedPanels(_ model: GameModel, show: (Panel?) -> Void) async {
        let deadline = Date().addingTimeInterval(15)
        var stable = 0, day = -1
        while Date() < deadline, stable < 3 {
            await wait(0.15)
            let current = await model.native.localDayForTour() ?? -1
            stable = current >= 0 && current == day && model.state?.day == current ? stable + 1 : 0
            day = current
        }
        let before = await model.native.save()
        if let before { try? before.write(to: dir.appendingPathComponent("ci-panel-world.lgj"), options: .atomic) }
        let scenes: [(String, Panel)] = [("nation", .nation(0)), ("province", .province(0)),
                                         ("army", .army(0)), ("ranking", .statistics)]
        var rows = [[String: Any]]()
        let meter = HitchMeter()
        for (name, panel) in scenes {
            if name == "army", model.state?.armies.isEmpty ?? true { continue }
            meter.start()
            for _ in 0..<3 { show(panel); await wait(0.8); show(nil); await wait(0.5) }
            var row = meter.measure().mapValues { $0 as Any }
            row["scene"] = name
            row["cycles"] = 3
            rows.append(row)
        }
        let after = await model.native.save()
        let engineDay = await model.native.localDayForTour() ?? -1
        let frozen = stable >= 3 && !model.playing && day == engineDay && model.state?.day == day
            && before != nil && before == after
        let digest = before.map { SHA256.hash(data: $0).map { String(format: "%02x", $0) }.joined() } ?? ""
        let report: [String: Any] = ["version": 1, "frozen": frozen, "day": day, "endDay": engineDay,
                                     "worldSHA256": digest, "panels": rows]
        if let data = try? JSONSerialization.data(withJSONObject: report, options: .sortedKeys) {
            try? data.write(to: dir.appendingPathComponent("panel-profile.json"), options: .atomic)
        }
    }

    /// 国色分明: the smallest colour difference (CIELAB ΔE) between a state and the four states whose
    /// capitals are nearest, and a close-up where the capitals stand densest.
    @MainActor private static func checkColors(_ model: GameModel) async {
        guard let map = model.map else { return }
        let seats: [(nation: Int, x: Double, y: Double, color: String)] = map.meta.nations.enumerated().compactMap { i, n in
            guard map.meta.cities.indices.contains(n.capital) else { return nil }
            let c = map.meta.cities[n.capital]
            return (i, Double(c.x), Double(c.y), n.color)
        }
        var least = 999.0, pair = "", densest: (x: Double, y: Double, spread: Double)?
        for a in seats {
            let near = seats.filter { $0.nation != a.nation }.sorted { hypot($0.x - a.x, $0.y - a.y) < hypot($1.x - a.x, $1.y - a.y) }.prefix(4)
            for b in near {
                let d = NationColors.difference(a.color, b.color)
                if d < least { least = d; pair = "\(a.color) \(b.color)" }
            }
            let spread = near.reduce(0) { $0 + hypot($1.x - a.x, $1.y - a.y) }
            if near.count == 4, densest == nil || spread < densest!.spread { densest = (a.x, a.y, spread) }
        }
        let report: [String: Any] = ["version": 1, "states": seats.count, "leastDifference": least, "closestPair": pair, "passed": seats.count >= 2 && least >= 15]
        if let data = try? JSONSerialization.data(withJSONObject: report, options: .sortedKeys) {
            try? data.write(to: dir.appendingPathComponent("color-contrast.json"), options: .atomic)
        }
        if let d = densest {
            model.controller.fly(x: d.x, y: d.y)
            await wait(2.2); await shoot("03b-colors-dense")
            model.controller.resetRequest = UUID(); await wait(0.9)
        }
    }

    /// 国名覆盖：全图总览时显示了哪些国家的名字；没显示的逐个飞到其都城近看，确认能看到。
    /// 结果写入 name-coverage.json（alive 现存国数、overview 总览可见数、closeUp 近看补上的、missing 仍看不到的）。
    @MainActor static func checkNames(_ model: GameModel) async {
        guard let state = model.state, let map = model.map else { return }
        func shown() -> Set<String> { Set((model.controller.nameFrame?() ?? [:]).keys.map { String($0.split(separator: "#").first ?? "") }) }
        let alive = state.nations.indices.filter { state.nations[$0].alive && $0 < map.meta.nations.count && state.nations[$0].provinces > 0 }
        func label(_ n: Int) -> String { MapLayers.stateLabel(map.meta.nations[n].name, full: model.controller.display.fullNationNames) }
        model.controller.resetRequest = UUID(); await wait(1.2)
        let overview = shown()
        await shoot("03c-names-overview")
        var closeUp = [String](), missing = [String]()
        for n in alive where !overview.contains(label(n)) {
            if closeUp.count + missing.count >= 12 { break }
            let capital = map.meta.nations[n].capital
            let at: (Double, Double)? = map.meta.cities.indices.contains(capital) ? (Double(map.meta.cities[capital].x), Double(map.meta.cities[capital].y))
                : state.owners.firstIndex(of: n).map { (Double(map.meta.provinces[$0].x), Double(map.meta.provinces[$0].y)) }
            guard let at else { missing.append(label(n)); continue }
            model.controller.fly(x: at.0, y: at.1); await wait(1.6)
            if shown().contains(label(n)) { closeUp.append(label(n)); if closeUp.count == 1 { await shoot("03d-names-close") } } else { missing.append(label(n)) }
        }
        let report: [String: Any] = ["alive": alive.count, "overview": alive.filter { overview.contains(label($0)) }.count, "closeUp": closeUp, "missing": missing]
        if let data = try? JSONSerialization.data(withJSONObject: report, options: .sortedKeys) {
            try? data.write(to: dir.appendingPathComponent("name-coverage.json"), options: .atomic)
        }
        model.controller.resetRequest = UUID(); await wait(0.9)
    }

    /// 连续帧对比: samples the state names of every displayed frame (MapLabelsView.nameFrame).
    @MainActor final class NameWatch: NSObject {
        private let controller: MapController
        private var link: CADisplayLink?, frame = 0, blinks = 0, seen = Set<String>()
        /// Per name: whether it was fully drawn in the last frame, and the frame it last dipped at.
        private var full = [String: Bool](), dipped = [String: Int]()
        init(_ controller: MapController) { self.controller = controller }
        func start() { let l = CADisplayLink(target: self, selector: #selector(tick(_:))); l.add(to: .main, forMode: .common); link = l }
        @objc private func tick(_ l: CADisplayLink) {
            guard let shown = controller.nameFrame?() else { return }
            frame += 1
            var now = [String: Bool]()
            for (key, opacity) in shown {
                let text = String(key.split(separator: "#").first ?? "")
                now[text] = (now[text] ?? false) || opacity >= 0.98
            }
            for text in seen.union(now.keys) {
                let was = full[text] ?? false, isFull = now[text] ?? false
                if was && !isFull { dipped[text] = frame }
                if !was && isFull, let d = dipped[text], frame - d <= 45 { blinks += 1 }
                full[text] = isFull
            }
            seen.formUnion(now.keys)
        }
        func stop() -> [String: Int] {
            link?.invalidate(); link = nil
            return ["frames": frame, "names": seen.count, "blinks": blinks]
        }
    }
    /// Main-thread frame gaps on the display link: average, 95th percentile, worst, and how many over
    /// 50 ms (a visible hitch).
    @MainActor final class HitchMeter: NSObject {
        private var link: CADisplayLink?, last: CFTimeInterval = 0, gaps: [Double] = []
        func start() {
            gaps = []; last = 0
            let l = CADisplayLink(target: self, selector: #selector(tick(_:))); l.add(to: .main, forMode: .common); link = l
        }
        @objc private func tick(_ l: CADisplayLink) { if last > 0 { gaps.append((l.timestamp - last) * 1000) }; last = l.timestamp }
        func measure() -> [String: Double] {
            link?.invalidate(); link = nil
            let s = gaps.sorted()
            guard let worst = s.last else { return ["samples": 0] }
            let p95 = s[min(s.count - 1, s.count * 95 / 100)], avg = s.reduce(0, +) / Double(s.count)
            return ["samples": Double(s.count), "averageMs": avg, "p95Ms": p95, "maxMs": worst,
                    "hitches": Double(s.filter { $0 > 50 }.count)]
        }
        func stop() -> String {
            let m = measure()
            guard let avg = m["averageMs"], let p95 = m["p95Ms"], let worst = m["maxMs"], let hitches = m["hitches"] else { return "none" }
            return String(format: "avg%.0fms-p95_%.0fms-max%.0fms-hitches%d", avg, p95, worst, Int(hitches))
        }
    }
    @MainActor private static func shootRulerTraits(_ model: GameModel, nation: Int, show: (Panel?) -> Void) async {
        guard let info = await model.nationInfo(nation) else { return }
        let ruler = info.people?.first { $0.role == "君主" } ?? info.people?.first
        guard let ruler, ruler.key >= 0 else { return }
        var traits = ["船舶大师", "改革家"]
        for name in ruler.traits where !traits.contains(name) && traits.count < 4 { traits.append(name) }
        let skills = ruler.skills.count == 4 ? ruler.skills : [50.0, 50, 50, 50]
        _ = await model.editPerson(ruler.key, skills: skills, traits: traits)
        show(.people(nation))
        await wait(1.8)
        await shoot("11b-nation-traits")
    }
}
