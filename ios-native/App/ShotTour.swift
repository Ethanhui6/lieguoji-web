import SwiftUI

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
        var options = GameModel.NewWorld()
        options.seed = "20261101"; options.nations = 12; options.provinces = "140"; options.relations = "war"
        Task { @MainActor in
            while model.phase != .founding && model.phase != .playing { await wait(0.2) }
            if model.phase == .founding { await wait(1.2); await shoot("02-founding") }
        }
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
            model.controller.fly(x: Double(a.x), y: Double(a.y)); await wait(1.5)
            for i in 0..<10 { await shoot(String(format: "08-march-%02d", i)); await wait(1) }
        }
        model.pause(saving: false)
        views(true); await wait(1); await shoot("07-views"); views(false)
        let panels: [(String, Panel)] = [("10-nations", .nations), ("11-nation", .nation(model.state?.nations.indices.max { (model.state?.nations[$0].provinces ?? 0) < (model.state?.nations[$1].provinces ?? 0) } ?? 0)),
                                         ("12-military", .military), ("13-army", .army(0)), ("14-diplomacy", .diplomacy), ("15-chronicle", .chronicle),
                                         ("16-statistics", .statistics), ("17-edicts", .edicts), ("18-menu", .menu), ("19-province", .province(0))]
        for (name, panel) in panels {
            if case .army = panel, model.state?.armies.isEmpty ?? true { continue }
            show(panel); await wait(1.4); await shoot(name)
        }
        show(nil); await wait(1)
        await shoot("done")
    }
}
