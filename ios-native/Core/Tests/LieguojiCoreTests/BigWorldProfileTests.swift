import XCTest
import Foundation
@testable import LieguojiCore

/// The app's day on a large map (240 provinces, 16 states; exported by src/native-export/big-world.test.ts):
/// the per-day cost and where it goes, and how often land changes hands, at the sizes players choose.
final class BigWorldProfileTests: XCTestCase {
    func testBigWorldDayProfile() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        defer { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil; Profile.enabled = false }
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/big-world.json")))
        engine.enableAppRules()
        let r = engine.run
        var owners = r.world.provinces.asArray.map(\.controller.asString), changes = 0
        Profile.reset(); Profile.enabled = true
        let start = Date()
        for _ in 0..<120 {
            Profile.measure("app.advance") { engine.advance(days: 1) }
            _ = Profile.measure("app.state") { engine.state(includeLabels: false) }
            let now = r.world.provinces.asArray.map(\.controller.asString)
            changes += zip(owners, now).filter { $0 != $1 }.count; owners = now
        }
        let seconds = Date().timeIntervalSince(start)
        print(String(format: "BIGWORLD %d provinces · %.1f ms/day · %d armies · %d wars open · %d provinces changed hands in 120 days",
                     r.world.provinces.length, seconds / 120 * 1000, r.world.armies.length,
                     r.nativeWars.campaigns.asArray.filter { $0.endedTick.isNull }.count, changes))
        print(Profile.report.split(separator: "\n").prefix(24).map { "BIGPROFILE " + $0 }.joined(separator: "\n"))
    }
}
