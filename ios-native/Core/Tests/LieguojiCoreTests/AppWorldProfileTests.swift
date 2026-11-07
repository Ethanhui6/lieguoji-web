import XCTest
import Foundation
@testable import LieguojiCore

/// Where a day goes on a live world with the app rules on (the phone's case): 60 days timed by phase.
final class AppWorldProfileTests: XCTestCase {
    func testAppRulesDayProfile() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        defer { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; ArmyAutonomy.temper = nil; Profile.enabled = false }
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        Profile.reset(); Profile.enabled = true
        let start = Date()
        for _ in 0..<60 {
            Profile.measure("app.advance") { engine.advance(days: 1) }
            _ = Profile.measure("app.state") { engine.state(includeLabels: false) }
        }
        let seconds = Date().timeIntervalSince(start)
        print(String(format: "APPWORLD %.1f ms/day, %d armies", seconds / 60 * 1000, engine.run.world.armies.length))
        print(Profile.report.split(separator: "\n").map { "APPPROFILE " + $0 }.joined(separator: "\n"))
    }
}
