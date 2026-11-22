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

    /// Item 3 审计：统计 80 城模板的州面积分布与连通性（校验无退化细条/无效区划，并输出实测分位）。
    func testEightyCityPartitionAreaDistribution() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let doc = try TerrainDocument(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/doc20k.bin")))
        let golden = try JSONDecoder().decode(RegionsGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/regions.json")))
        var tested = 0
        for s in golden.samples where s.cities == 80 && s.regions != nil {
            let elevations = [UInt8](Data(base64Encoded: s.heights)!).map(Int.init)
            let got = try XCTUnwrap(Regions.partition(doc, elevations: elevations, cities: s.cities))
            let areas = got.regions.map(\.area).sorted()
            let members = got.regions.map(\.members.count).sorted()
            let med = areas[areas.count / 2]
            let p10 = areas[max(0, areas.count / 10)]
            let minCells = members.first ?? 0
            let singleCellCount = members.filter { $0 <= 1 }.count
            print("[80城审计] \(s.seed)/\(s.template): 州数=\(got.regions.count) 最小格数=\(minCells) 单格州=\(singleCellCount) 面积P10/中位=\(String(format: "%.2f", p10 / max(1e-9, med))) 最小/中位=\(String(format: "%.2f", (areas.first ?? 0) / max(1e-9, med)))")
            XCTAssertEqual(got.regions.count, 80)
            XCTAssertGreaterThan(areas.first ?? 0, 0)
            for r in got.regions { XCTAssertGreaterThanOrEqual(r.ring.count, 3) }
            tested += 1
        }
        XCTAssertGreaterThan(tested, 0)
    }
}
