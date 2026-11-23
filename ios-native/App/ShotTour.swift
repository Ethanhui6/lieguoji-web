import SwiftUI
import CryptoKit
import LieguojiCore

/// The CI screenshot tour (launched with LGJ_SHOT=1 in the simulator): it starts a world at war and
/// walks the map and every panel. Each stop leaves a marker file in Documents; the workflow takes
/// the screenshot and deletes the marker, and the tour goes on.
enum ShotTour {
    static let on = ProcessInfo.processInfo.environment["LGJ_SHOT"] == "1"
    private static var dir: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] }
    @MainActor static var heldHeraldText: String?

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
        await timeWebFounding(model, options)
        // 02-founding and 02b-rise are taken inside the rise itself, while those lines are on screen.
        let previousDamage = NewWorldWarRules.values["damage"] ?? 100
        NewWorldWarRules.set("damage", to: 175)
        defer { NewWorldWarRules.set("damage", to: previousDamage) }
        await model.generate(options)
    }

    /// 改前对照：同一世界用网页引擎建一次（WebKit 启动、generate、nativeWorld 交接、Swift 解析各计时），写进
    /// founding-time.json；随后 model.generate 走 Swift 并写入 swift 一项。
    @MainActor static func timeWebFounding(_ model: GameModel, _ options: GameModel.NewWorld) async {
        let json: [String: Any] = ["climate": options.climate.json, "template": options.template, "count": options.nations, "cityCount": options.provinceCount, "seed": options.seed,
                                   "relations": options.relations, "naming": options.naming, "cultures": Names.cultureIds.filter { options.cultures.contains($0) }]
        guard let text = String(data: (try? JSONSerialization.data(withJSONObject: json)) ?? Data(), encoding: .utf8) else { return }
        var t = Date()
        let webHost = model.ensureLegacyEngine()
        await wait(0.1)
        do { try await webHost.start() } catch { model.noteFounding("web-startup", Date().timeIntervalSince(t), cityCount: nil, error: error.localizedDescription); return }
        model.noteFounding("web-startup", Date().timeIntervalSince(t), cityCount: nil, error: nil)
        t = Date()
        do {
            _ = try await webHost.call("generate(options)", ["options": text], timeout: 180)
            model.noteFounding("web-generate", Date().timeIntervalSince(t), cityCount: nil, error: nil)
            t = Date()
            let world = try await webHost.call("nativeWorld()", timeout: 90)
            model.noteFounding("web-handover", Date().timeIntervalSince(t), cityCount: nil, error: nil)
            t = Date()
            let parsed = await Task.detached(priority: .userInitiated) { (try? JS.parse(Data(world.utf8))) != nil }.value
            model.noteFounding("web-handover-parse", Date().timeIntervalSince(t), cityCount: nil, error: parsed ? nil : "解析失败")
        } catch { model.noteFounding("web-generate", Date().timeIntervalSince(t), cityCount: nil, error: error.localizedDescription) }
    }

    /// In the world: let the war run, look at the fronts up close, then open each panel.
    @MainActor static func play(_ model: GameModel, show: @escaping (Panel?) -> Void, views: @escaping (Bool) -> Void) async {
        await wait(3)
        await shoot("03-world")
        await checkWarRules(model)
        await checkColors(model)
        await checkAdvanceOwnership(model)
        await checkEarlyHeralds(model)
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
        let unrollStart = Date()
        model.controller.unrollRequest = UUID()
        var reached = model.controller.cameraScale?() ?? (scale: 0, fit: 0)
        while unrollStart.timeIntervalSinceNow > -4, !(reached.fit > 0 && reached.scale <= reached.fit * 1.02) {
            await wait(0.10)
            reached = model.controller.cameraScale?() ?? (scale: 0, fit: 0)
        }
        let unrolled: [String: Any] = ["version": 1, "scale": reached.scale, "fit": reached.fit,
                                       "seconds": -unrollStart.timeIntervalSinceNow,
                                       "passed": reached.fit > 0 && reached.scale <= reached.fit * 1.02]
        if let data = try? JSONSerialization.data(withJSONObject: unrolled, options: .sortedKeys) {
            try? data.write(to: dir.appendingPathComponent("map-unrolled.json"), options: .atomic)
        }
        await shoot("04d-map-unrolled")
        model.controller.resetRequest = UUID(); await wait(0.8)
        // 战争晕染（墨场）：行军、围城、守军、攻占的演示，逐帧记录与压力测量（App/WashTour.swift）。
        await washTour(model)
        show(nil); await wait(0.4)
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
        MenuSheet.tourWarRules = true
        show(.menu); await wait(1.4); await shoot("18b-war-rules")
        show(nil)
        MenuSheet.tourWarRules = false
        // The navy: a fleet's page (ships editable) when the world has fleets.
        if !(model.state?.fleets ?? []).isEmpty { show(.fleet(0)); await wait(1.4); await shoot("13b-fleet") }
        NationSheet.tourTab = .court
        show(nil); await wait(0.5); show(.nation(nation)); await wait(1.4); await shoot("11c-court")
        NationSheet.tourTab = nil
        show(nil); await wait(0.8)
        model.tourLandscape = true
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight))
        }
        await wait(1.2); await shoot("30-landscape")
        show(.nation(nation)); await wait(1.6); await shoot("31-landscape-nation")
        show(nil); await wait(0.6)
        model.tourLandscape = false
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
        }
        await wait(1.0)
        show(nil); await wait(1)
        await shoot("done")
    }

    @MainActor private static func checkWarRules(_ model: GameModel) async {
        let newWorld = (await model.worldRules())["damage"] ?? -1
        let changed = await model.setWorldRule("damage", 125)
        let live = (await model.worldRules())["damage"] ?? -1
        let reset = await model.setWorldRule("damage", 100)
        let restored = (await model.worldRules())["damage"] ?? -1
        let report = ["newWorld": newWorld, "live": changed == nil ? live : -1, "restored": reset == nil ? restored : -1]
        if let data = try? JSONEncoder().encode(report) {
            try? data.write(to: dir.appendingPathComponent("war-rule-settings.json"), options: .atomic)
        }
    }

    /// Feed chronicle events through the real queue while native play updates the opening map.
    @MainActor private static func checkEarlyHeralds(_ model: GameModel) async {
        guard let startDay = model.state?.day else { return }
        let houseText = "巡览世家篡位", marriageText = "巡览两国联姻"
        let heralds = model.controller.play.showHeralds
        let pauseOnNews = model.controller.play.pauseOnNews
        model.dismissHerald()
        model.controller.play.showHeralds = true
        model.controller.play.pauseOnNews = false
        defer {
            heldHeraldText = nil
            model.pause(saving: false)
            model.dismissHerald()
            model.controller.play.showHeralds = heralds
            model.controller.play.pauseOnNews = pauseOnNews
        }
        model.play()
        func announce(_ text: String) -> Bool {
            guard let current = model.state, let bytes = try? JSONEncoder().encode(current),
                  var snapshot = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any],
                  var events = snapshot["events"] as? [[String: Any]] else { return false }
            events.append(["day": current.day, "text": text, "kind": "politics"])
            snapshot["events"] = events
            guard let data = try? JSONSerialization.data(withJSONObject: snapshot),
                  let state = try? JSONDecoder().decode(GameState.self, from: data) else { return false }
            model.apply(state)
            return true
        }
        heldHeraldText = houseText
        guard announce(houseText) else { return }
        await wait(0.5)
        guard model.playing, let house = model.herald, house.kind == .house, house.text == houseText else { return }
        await shoot("41e-herald-house")
        guard model.herald?.id == house.id else { return }
        model.dismissHerald()
        heldHeraldText = marriageText
        guard announce(marriageText) else { return }
        await wait(0.2)
        guard let wedding = model.herald, wedding.kind == .marriage, wedding.text == marriageText,
              announce("巡览朝廷政变") else { return }
        await wait(0.5)
        // The cancelled first banner must not leave two consumers draining the same queue.
        guard model.playing, model.herald?.id == wedding.id, (model.state?.day ?? startDay) > startDay else { return }
        await shoot("41f-herald-marriage")
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
