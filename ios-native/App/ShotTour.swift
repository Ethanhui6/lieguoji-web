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

    /// Title → new-world options → splash frames (if still on splash) → generate with founding frames.
    @MainActor static func start(_ model: GameModel) async {
        // Opening splash frames while RootView still shows SplashView (introAnimation on by default).
        if model.phase == .splash {
            await wait(0.6); await shoot("00-splash-1")
            await wait(0.9); await shoot("00-splash-2")
            await wait(0.9); await shoot("00-splash-3")
            while model.phase == .splash { await wait(0.2) }
        }
        await wait(1.2)
        await shoot("01-title")

        // New World options page (full sheet) before generating.
        var options = GameModel.NewWorld.load()
        options.seed = "20261101"; options.nations = 12; options.provinces = "140"; options.relations = "war"
        options.landRatio = 0.4; options.mountains = 0.55; options.rivers = 0.55; options.climate = 0.5
        options.nationSize = "balanced"; options.navy = true; options.startYear = 1
        // Present options UI via a temporary overlay flag on the model for the tour.
        NewWorldShotHost.shared.present(options)
        await wait(1.2)
        await shoot("01b-new-world")
        NewWorldShotHost.shared.dismiss()

        Task { @MainActor in
            while model.phase != .founding && model.phase != .playing { await wait(0.15) }
            if model.phase == .founding {
                // Three frames along the reveal timeline: land → provinces/cities → names/camera.
                await wait(1.0); await shoot("02-founding-1")
                await wait(2.2); await shoot("02-founding-2")
                await wait(2.4); await shoot("02-founding-3")
            }
        }
        await model.generate(options)
    }

    /// In the world: war, city marks close-up, nation panel + person detail, then other panels.
    @MainActor static func play(_ model: GameModel, show: @escaping (Panel?) -> Void, views: @escaping (Bool) -> Void) async {
        await wait(3)
        await shoot("03-world")
        model.play()
        for i in 0..<3 { await wait(12); await shoot("04-war-\(i)") }
        if let state = model.state, let a = state.armies.filter({ $0.status == "fighting" || $0.status == "sieging" }).max(by: { $0.troops < $1.troops }) ?? state.armies.first {
            model.controller.fly(x: Double(a.x), y: Double(a.y))
            await wait(2); await shoot("05-battle-close")
            await wait(4); await shoot("06-battle-close-later")
        }
        if let state = model.state {
            if let a = state.armies.filter({ $0.status != "fighting" && $0.status != "sieging" }).max(by: { $0.troops < $1.troops }) {
                model.controller.fly(x: Double(a.x), y: Double(a.y)); await wait(2.5); await shoot("06b-army-close")
            }
            if let a = state.armies.first(where: { $0.banner != nil }) {
                model.controller.fly(x: Double(a.x), y: Double(a.y)); await wait(2.5); await shoot("06c-banner-close")
            }
        }
        // Province / city marks close-up: fly to a capital and zoom in so 国都／府城／普通城可读。
        if let map = model.map, let n = map.meta.nations.first, n.capital >= 0, n.capital < map.meta.cities.count {
            let city = map.meta.cities[n.capital]
            model.controller.fly(x: Double(city.x), y: Double(city.y))
            model.controller.selectedProvince = city.province
            await wait(2.2); await shoot("09-cities-close")
        }
        if let state = model.state, let a = state.armies.first(where: { $0.travel == "moving" && $0.destination != nil }) {
            model.controller.fly(x: Double(a.x), y: Double(a.y)); await wait(1.5)
            for i in 0..<10 { await shoot(String(format: "08-march-%02d", i)); await wait(1) }
        }
        model.pause(saving: false)
        views(true); await wait(1); await shoot("07-views"); views(false)
        let biggest = model.state?.nations.indices.max { (model.state?.nations[$0].provinces ?? 0) < (model.state?.nations[$1].provinces ?? 0) } ?? 0
        let panels: [(String, Panel)] = [
            ("10-nations", .nations),
            ("11-nation", .nation(biggest)),
            ("12-military", .military), ("13-army", .army(0)), ("14-diplomacy", .diplomacy), ("15-chronicle", .chronicle),
            ("16-statistics", .statistics), ("17-edicts", .edicts), ("18-menu", .menu), ("19-province", .province(0)),
        ]
        for (name, panel) in panels {
            if case .army = panel, model.state?.armies.isEmpty ?? true { continue }
            show(panel); await wait(1.4); await shoot(name)
            // After nation overview, open person detail via a second shot while the sheet is up.
            if name == "11-nation" {
                NationShotHost.shared.openPeople = true
                await wait(1.2); await shoot("11b-nation-people")
                NationShotHost.shared.openPersonDetail = true
                await wait(1.2); await shoot("11c-person-detail")
                NationShotHost.shared.openPeople = false
                NationShotHost.shared.openPersonDetail = false
            }
        }
        show(nil); await wait(1)
        await shoot("done")
    }
}

/// Lightweight bridge so ShotTour can present the New World options page without going through TitleView buttons.
@MainActor final class NewWorldShotHost: ObservableObject {
    static let shared = NewWorldShotHost()
    @Published var presented = false
    @Published var options = GameModel.NewWorld()
    func present(_ options: GameModel.NewWorld) { self.options = options; presented = true }
    func dismiss() { presented = false }
}

/// ShotTour hooks into NationSheet drill navigation without a full UI automation stack.
@MainActor final class NationShotHost: ObservableObject {
    static let shared = NationShotHost()
    @Published var openPeople = false
    @Published var openPersonDetail = false
}
