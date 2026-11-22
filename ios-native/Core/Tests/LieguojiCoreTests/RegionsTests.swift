import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web (src/native-export/regions-golden.test.ts): the province partition of
/// generated terrain, 2 seeds × 4 templates × 40 / 80 / 120 cities, including the cases the web rejects.
private struct RegionsGolden: Decodable {
    struct Region: Decodable { let members: [Int]; let x: Double; let y: Double; let height: Double; let area: Double; let neighbors: [Int]; let ring: [String] }
    struct Sample: Decodable { let seed: String; let template: String; let cities: Int; let heights: String; let faces: Int; let algorithm: String?; let regions: [Region]?; let error: String? }
    let samples: [Sample]
}

final class RegionsTests: XCTestCase {
    func testProvincePartitionMatchesTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let doc = try TerrainDocument(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/doc20k.bin")))
        let golden = try JSONDecoder().decode(RegionsGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/regions.json")))
        for s in golden.samples {
            let label = "\(s.seed) \(s.template) \(s.cities)"
            let elevations = [UInt8](Data(base64Encoded: s.heights)!).map(Int.init)
            XCTAssertEqual(Regions.landFaces(doc, elevations).count, s.faces, "faces, \(label)")
            let got = Regions.partition(doc, elevations: elevations, cities: s.cities)
            guard let want = s.regions else { XCTAssertNil(got, "the web rejects \(label)"); continue }
            guard let got else { XCTFail("no partition, \(label)"); continue }
            XCTAssertEqual(got.perimeter, s.algorithm == "terrain-connected-unions-perimeter-v1", "algorithm, \(label)")
            XCTAssertEqual(got.regions.count, want.count, "provinces, \(label)")
            for (i, (g, w)) in zip(got.regions, want).enumerated() {
                XCTAssertEqual(g.members, w.members, "members of \(i), \(label)")
                XCTAssertEqual(g.center.0, w.x, "city x of \(i), \(label)"); XCTAssertEqual(g.center.1, w.y, "city y of \(i), \(label)")
                XCTAssertEqual(g.area, w.area, "area of \(i), \(label)"); XCTAssertEqual(g.height, w.height, "height of \(i), \(label)")
                XCTAssertEqual(g.neighbors, w.neighbors, "neighbours of \(i), \(label)")
                XCTAssertEqual(g.ring.map(\.key), w.ring, "border of \(i), \(label)")
                if g.members != w.members { return }
            }
        }
    }

    /// Item 3 审计与前后对照：对比 80 城模板改前（原版）与改后（微岛清理 + 面积均衡）的 P10/中位面积比。
    func testEightyCityPartitionAreaDistribution() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let doc = try TerrainDocument(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/doc20k.bin")))
        let golden = try JSONDecoder().decode(RegionsGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/regions.json")))
        var tested = 0
        for s in golden.samples where s.cities == 80 && s.regions != nil {
            let elevations = [UInt8](Data(base64Encoded: s.heights)!).map(Int.init)
            let raw = try XCTUnwrap(Regions.partition(doc, elevations: elevations, cities: s.cities))
            let cleaned = Regions.cleanTinyIslets(doc, elevations: elevations, cities: s.cities)
            let balanced = try XCTUnwrap(Regions.partition(doc, elevations: cleaned, cities: s.cities, balanceAreas: true))
            let rawAreas = raw.regions.map(\.area).sorted()
            let balAreas = balanced.regions.map(\.area).sorted()
            let rawP10 = rawAreas[max(0, rawAreas.count / 10)] / max(1e-9, rawAreas[rawAreas.count / 2])
            let balP10 = balAreas[max(0, balAreas.count / 10)] / max(1e-9, balAreas[balAreas.count / 2])
            let balMin = (balAreas.first ?? 0) / max(1e-9, balAreas[balAreas.count / 2])
            print("[80城对照] \(s.seed)/\(s.template): P10/中位 \(String(format: "%.2f", rawP10)) -> \(String(format: "%.2f", balP10))，最小/中位=\(String(format: "%.2f", balMin))")
            XCTAssertEqual(balanced.regions.count, 80)
            XCTAssertGreaterThanOrEqual(balP10 + 1e-6, rawP10, "均衡区划后 P10/中位面积比不应退化：\(s.seed)/\(s.template)")
            for r in balanced.regions { XCTAssertGreaterThanOrEqual(r.ring.count, 3) }
            tested += 1
        }
        XCTAssertGreaterThan(tested, 0)
    }
}
