import XCTest
import Foundation
@testable import LieguojiCore

/// Golden government stage (src/native-export/opening-government-golden.test.ts) on the creation-golden worlds.
final class OpeningGovernmentTests: XCTestCase {
    func testProvinceGeographyMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent(), resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let doc = try TerrainDocument(data: Data(contentsOf: resources.appendingPathComponent("doc20k.bin")))
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/opening-government.json")))
        let creation = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/creation.json")))
        for (i, s) in golden.samples.asArray.enumerated() {
            let label = "\(s.seed.asString) \(s.template.asString)"
            let world = creation.samples[i * 2].created.world
            let h = [UInt8](Data(base64Encoded: s.heights.asString)!).map(Int.init)
            let g = OpeningGovernment.provinceGeography(doc, elevations: h, provinces: world.provinces.asArray, scale: 1000 / max(doc.width, doc.height))
            if let d = g.terrain.difference(s.out.terrainContext, path: "terrainContext") { XCTFail("\(label): \(d)") }
            for id in g.order {
                let want = s.out.finance.provinces[id]
                if g.cells[id]!.cellBiomes.json != want.cellBiomes.json || g.cells[id]!.seaNeighbor.json != want.seaNeighbor.json { XCTFail("\(label): cells \(id)"); break }
                let c = g.combat[id], w = s.out.upperCombat.provinces[id]
                for k in ["biomeCounts", "biomeOrder", "storedDefense", "locked", "manualSet", "manualFortress"] where c[k].json != w[k].json { XCTFail("\(label): combat \(id).\(k) \(c[k].json) vs \(w[k].json)") }
            }
        }
    }
}
