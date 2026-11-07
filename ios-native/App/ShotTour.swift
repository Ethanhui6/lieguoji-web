import SwiftUI
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
        await shoot("01c-new-world")
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
        model.play()
        for i in 0..<3 { await wait(12); await shoot("04-war-\(i)") }
        // Up close on the biggest fight: armies that are fighting or besieging.
        if let state = model.state, let a = state.armies.filter({ $0.status == "fighting" || $0.status == "sieging" }).max(by: { $0.troops < $1.troops }) ?? state.armies.first {
            model.controller.fly(x: Double(a.x), y: Double(a.y))
            await wait(2); await shoot("05-battle-close")
            await wait(4); await shoot("06-battle-close-later")
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
        model.speed = speed
        model.pause(saving: false)
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
        await shootRulerTraits(model, nation: nation, show: show)
        show(nil); await wait(1)
        await shoot("done")
    }

    /// Opens 人物 for the largest state after giving its ruler the ShipMaster and Reformer traits.
    /// Main-thread frame gaps on the display link: average, 95th percentile, worst, and how many over
    /// 50 ms (a visible hitch).
    @MainActor final class HitchMeter: NSObject {
        private var link: CADisplayLink?, last: CFTimeInterval = 0, gaps: [Double] = []
        func start() {
            gaps = []; last = 0
            let l = CADisplayLink(target: self, selector: #selector(tick(_:))); l.add(to: .main, forMode: .common); link = l
        }
        @objc private func tick(_ l: CADisplayLink) { if last > 0 { gaps.append((l.timestamp - last) * 1000) }; last = l.timestamp }
        func stop() -> String {
            link?.invalidate(); link = nil
            let s = gaps.sorted()
            guard let worst = s.last else { return "none" }
            let p95 = s[min(s.count - 1, s.count * 95 / 100)], avg = s.reduce(0, +) / Double(s.count)
            return String(format: "avg%.0fms-p95_%.0fms-max%.0fms-hitches%d", avg, p95, worst, s.filter { $0 > 50 }.count)
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
