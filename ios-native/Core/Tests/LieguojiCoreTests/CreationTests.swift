import XCTest
import Foundation
@testable import LieguojiCore

/// Golden new-world bases from the web (src/native-export/creation-golden.test.ts): the world with its
/// provinces, cities, nations and statecraft ledger, the founding rulers, chronicle, people and life,
/// exactly as createCivilizationWorld47 hands them to attachFamilies47 (key order included).
final class CreationTests: XCTestCase {
    func testCreationBaseMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent(), resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let doc = try TerrainDocument(data: Data(contentsOf: resources.appendingPathComponent("doc20k.bin")))
        // The app's catalogs (exported from the current web catalogue by catalog-export.test.ts).
        let catalog = resources.deletingLastPathComponent().appendingPathComponent("Catalog")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: catalog.appendingPathComponent("traits.json")), nobleCultures: Data(contentsOf: catalog.appendingPathComponent("noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("cultures.json")))
        let cultures = Founding.cultures
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/creation.json")))
        var partitions = [String: [Regions.Region]]()
        for s in golden.samples.asArray {
            let label = "\(s.seed.asString) \(s.template.asString) \(s.cities.asInt) \(s.setup.mode.asString)", key = "\(s.seed.asString) \(s.template.asString) \(s.cities.asInt)"
            let regions = try partitions[key] ?? XCTUnwrap(Regions.partition(doc, elevations: [UInt8](Data(base64Encoded: s.heights.asString)!).map(Int.init), cities: s.cities.asInt)).regions
            partitions[key] = regions
            let layout = Opening.layout(regions, count: s.count.asInt)
            let base = try XCTUnwrap(Creation.base(regions: regions, seeds: layout.seeds, owners: layout.owners, width: doc.width, height: doc.height, worldId: s.worldId.asString,
                                                   runId: s.base.id.asString, relations: s.relations.asString, mode: s.setup.mode.asString,
                                                   enabled: s.setup.enabled.asArray.map(\.asString), cultures: cultures))
            for part in ["world", "civilization", "chronicle", "people", "life"] {
                if let d = base[part].difference(s.base[part], path: part) { XCTFail("\(label): \(d)") }
            }
            if base.json != s.base.json { XCTFail("key order or values differ, \(label)") }
        }
    }

    /// attachFamilies47 then attachOrigins47 on the web's base (kin, ruling families, sovereignty, origins), and
    /// attachNobility47 (noble families, territories and members).
    func testFamiliesAndOriginsMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent(), resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")), nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/creation.json")))
        for s in golden.samples.asArray {
            let label = "\(s.seed.asString) \(s.template.asString) \(s.cities.asInt) \(s.setup.mode.asString)"
            let r = s.base.clone()
            Creation.attachFamilies(r); Creation.attachOrigins(r)
            if let d = r.difference(s.families) { XCTFail("\(label): \(d)") } else if r.json != s.families.json { XCTFail("key order differs, \(label)") }
            // attachNobility47 on the web's own families stage, then the empty reign and state-trait records.
            let n = s.families.clone()
            Creation.attachNobility(n); n.reigns47 = .object(); n.stateTraits47 = .object()
            if let d = n.difference(s.created) { XCTFail("nobility, \(label): \(d)") } else if n.json != s.created.json { XCTFail("nobility key order differs, \(label)") }
        }
    }
}
