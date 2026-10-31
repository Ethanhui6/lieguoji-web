import XCTest
import Foundation
@testable import LieguojiCore

/// Golden samples from the web (src/native-export/climate-golden.test.ts): settlementBiomeData of
/// generated terrain, 2 seeds × 4 templates — precipitation, temperature, rivers and biomes per cell.
private struct ClimateGolden: Decodable {
    struct Sample: Decodable { let seed: String; let template: String; let heights: String; let ids: String; let precipitation: String; let temperatures: String; let riverIds: String; let segments: [Int]; let riverCount: Int }
    let samples: [Sample]
}

final class ClimateTests: XCTestCase {
    func testClimateRiversAndBiomesMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let doc = try TerrainDocument(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/doc20k.bin")))
        let golden = try JSONDecoder().decode(ClimateGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/climate.json")))
        func bytes(_ s: String) -> [UInt8] { [UInt8](Data(base64Encoded: s)!) }
        for s in golden.samples {
            let label = "\(s.seed) \(s.template)"
            let elevations = bytes(s.heights).map(Int.init)
            let got = Climate.surface(doc, elevations: elevations)
            XCTAssertEqual(zip(got.precipitation, bytes(s.precipitation)).filter { $0 != $1 }.count, 0, "precipitation, \(label)")
            XCTAssertEqual(zip(got.temperatures.map { UInt8(bitPattern: $0) }, bytes(s.temperatures)).filter { $0 != $1 }.count, 0, "temperature, \(label)")
            let rivers = bytes(s.riverIds), riverIds = stride(from: 0, to: rivers.count, by: 2).map { UInt16(rivers[$0]) | UInt16(rivers[$0 + 1]) << 8 }
            XCTAssertEqual(zip(got.rivers.riverIds, riverIds).filter { $0 != $1 }.count, 0, "river ids, \(label)")
            XCTAssertEqual(got.rivers.riverCount, s.riverCount, "river count, \(label)")
            XCTAssertEqual(got.rivers.segments.flatMap { [$0.0, $0.1] }, s.segments, "river segments, \(label)")
            XCTAssertEqual(zip(got.ids, bytes(s.ids)).filter { $0 != $1 }.count, 0, "biomes, \(label)")
        }
    }
}
