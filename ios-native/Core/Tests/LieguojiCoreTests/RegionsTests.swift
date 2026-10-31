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
}
