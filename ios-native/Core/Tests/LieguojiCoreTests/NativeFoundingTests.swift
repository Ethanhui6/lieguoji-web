import XCTest
import Foundation
@testable import LieguojiCore

/// 原生建世界分段黄金对照（src/native-export/native-founding-golden.test.ts）：从政府段完成的整局出发，
/// 逐段比对 Swift 与网页改变的顶层键、world 子键及整局键序。
final class NativeFoundingTests: XCTestCase {
    static let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    static var resources: URL { dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources") }
    static func setUpCatalogs() throws {
        let res = resources
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: res.appendingPathComponent("Catalog/traits.json")), nobleCultures: Data(contentsOf: res.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: res.appendingPathComponent("World/cultures.json")))
    }

    /// 一段的比对：stage 记录的每个改变键（含键序）、world 子键，以及整局与 world 的键序。
    static func compare(_ r: JS, _ stage: JS, _ label: String) -> [String] {
        var out = [String]()
        for (k, v) in stage.changed.objectEntries {
            if let d = r[k].difference(v, path: k) { out.append("\(label): \(d)") } else if r[k].json != v.json { out.append("\(label): \(k) 键序不同") }
        }
        for (k, v) in stage.world.objectEntries {
            if let d = r.world[k].difference(v, path: "world.\(k)") { out.append("\(label): \(d)") } else if r.world[k].json != v.json { out.append("\(label): world.\(k) 键序不同") }
        }
        let keys = r.objectKeys.filter { $0 != "terrain" }
        if keys != stage.keys.asArray.map(\.asString) { out.append("\(label): 整局键序 \(keys) vs \(stage.keys.asArray.map(\.asString))") }
        if r.world.objectKeys != stage.worldKeys.asArray.map(\.asString) { out.append("\(label): world 键序不同") }
        return out
    }

    func testFoundingForcesMatchTheWeb() throws {
        try Self.setUpCatalogs()
        let doc = try TerrainDocument(data: Data(contentsOf: Self.resources.appendingPathComponent("World/doc20k.bin")))
        let golden = try JS.parse(Data(contentsOf: Self.dir.appendingPathComponent("Golden/native-founding.json")))
        for s in golden.samples.asArray {
            let label = "\(s.seed.asString) \(s.template.asString) forces"
            let r = s.input.clone(), h = [UInt8](Data(base64Encoded: s.heights.asString)!).map(Int.init)
            let provinces = r.world.provinces.asArray
            let sea = SeaGraph(doc, elevations: h, provinces: provinces)
            CreationForces.attach(r, doc, elevations: h, sea: sea, faceBiomes: CreationForces.faceBiomes(doc, elevations: h, ids: Climate.surface(doc, elevations: h).ids), method: "capital-neighbor-v2")
            for m in Self.compare(r, s.forces, label) { XCTFail(m) }
        }
    }

    /// attachPolitics47（再换上局号），开战开局再 initializeOpeningWars47（先装上 Swift 建的静态几何）。
    func testPoliticsAndOpeningWarsMatchTheWeb() throws {
        try Self.setUpCatalogs()
        let doc = try TerrainDocument(data: Data(contentsOf: Self.resources.appendingPathComponent("World/doc20k.bin")))
        let golden = try JS.parse(Data(contentsOf: Self.dir.appendingPathComponent("Golden/native-founding.json")))
        for s in golden.samples.asArray {
            let label = "\(s.seed.asString) \(s.template.asString)"
            let r = s.input.clone(), h = [UInt8](Data(base64Encoded: s.heights.asString)!).map(Int.init)
            for (k, v) in s.forces.changed.objectEntries { r[k] = v.clone() }
            for (k, v) in s.forces.world.objectEntries { r.world[k] = v.clone() }
            CreationPolitics.attach(r)
            r.id = JS("fms-00000000-0000-4000-8000-000000000047"); r.world.custom.id = r.id.clone()
            for m in Self.compare(r, s.politics, "\(label) politics") { XCTFail(m) }
            guard s.relations.asString == "war" else { continue }
            let provinces = r.world.provinces.asArray
            let sea = SeaGraph(doc, elevations: h, provinces: provinces)
            let travel = CreationGeography.travelGraph(doc, elevations: h, provinces: provinces, sea: sea)
            let engine = try NativeEngine(created: r, statics: CreationStatics.build(r, doc, elevations: h, sea: sea, travel: travel))
            War26.install()
            CreationPolitics.openingWars(r, engine: Session.engine!)
            _ = engine
            for m in Self.compare(r, s.wars, "\(label) wars") { XCTFail(m) }
        }
    }
}
