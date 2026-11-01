import XCTest
import Foundation
@testable import LieguojiCore

/// The hand-over from the web (src/native-export/bridge-golden.test.ts): the Swift engine opens the
/// bridge's world with the app's catalogues, saves and reopens it, advances 20 days and reaches the
/// web's run; the view state decodes.
final class BridgeTests: XCTestCase {
    func testHandOverSaveAndTwentyDaysMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        defer { Session.uninstall() }
        let first = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        let engine = try NativeEngine(world: first.save())
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: engine.state(includeLabels: true)))
        engine.advance(days: 20)
        let expected = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/bridge-after.json")))
        let r = engine.run.clone()
        for k in ["terrainContext", "portControl", "harbors", "navalAutonomy", "navalOpening", "governmentOpening", "diplomaticGeography"] { r.delete(k) }
        if let d = r.difference(expected) { XCTFail(d) }
        let state = try JSONSerialization.jsonObject(with: engine.state(includeLabels: false)) as? [String: Any]
        XCTAssertEqual(state?["day"] as? Int, expected.world.day.asInt)
        // The nation panel and the state-level actions run on the live run.
        for i in 0..<engine.run.world.nations.length { XCTAssertNotNil(try JSONSerialization.jsonObject(with: XCTUnwrap(engine.nationInfo(i)))) }
        // 人物 section: every living state lists at least its monarch.
        let info0 = try JS.parse(XCTUnwrap(engine.nationInfo(0))); XCTAssertGreaterThan(info0.people.length, 0); XCTAssertEqual(info0.people[0].role.asString, "君主")
        XCTAssertFalse(info0.truces.isNull); for w in info0.wars.asArray { XCTAssertLessThanOrEqual(abs(w.score.asNumber), 100) }
        let a = (0..<engine.run.world.nations.length).filter { Vassals.alive(engine.run, engine.run.world.nations[$0].id.asString) }
        XCTAssertTrue(engine.alliance(a[0], with: a[1]).ok)
        XCTAssertNotNil(Vassals.allianceOf(engine.run, engine.run.world.nations[a[0]].id.asString))
        XCTAssertFalse(engine.alliance(a[0], with: a[1]).ok)
        XCTAssertTrue(engine.alliance(a[0], with: -1).ok)
        XCTAssertTrue(engine.setAutoDiplomacy(a[0], enabled: false).ok)
        XCTAssertFalse(engine.setAutoDiplomacy(a[0], enabled: false).ok)
        XCTAssertTrue(engine.makeVassal(a[1], of: a[0]).ok)
        XCTAssertEqual(Vassals.overlord(engine.run, engine.run.world.nations[a[1]].id.asString), engine.run.world.nations[a[0]].id.asString)
        XCTAssertTrue(engine.releaseVassal(a[1]).ok)
        XCTAssertTrue(engine.annex(a[2], by: a[0]).ok)
        XCTAssertFalse(Vassals.alive(engine.run, engine.run.world.nations[a[2]].id.asString))
        for mode in ["state", "alliance", "culture", "family", "religion"] {
            let v = try JS.parse(engine.view(mode)); XCTAssertEqual(v.fills.length, engine.run.world.provinces.length); XCTAssertGreaterThan(v.legend.length, 0)
        }
        for c in ["power", "population", "economy", "war", "religion"] { XCTAssertNoThrow(try JS.parse(engine.statistics(c))) }
        engine.advance(days: 3)
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: engine.state(includeLabels: true)))
    }
}
