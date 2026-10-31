import XCTest
import Foundation
@testable import LieguojiCore

/// Golden heightmaps from the web generator (src/native-export/terrain-golden.test.ts): 6 seeds × the
/// four original templates on the 20k grid, compared cell by cell.
private struct TerrainGolden: Decodable {
    struct Sample: Decodable { let seed: String; let template: String; let heights: String }
    let samples: [Sample]
}

final class TerrainTests: XCTestCase {
    func testHeightmapsMatchTheWebGenerator() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let graph = try TerrainGraph(data: Data(contentsOf: dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World/grid20k.bin")))
        let golden = try JSONDecoder().decode(TerrainGolden.self, from: Data(contentsOf: dir.appendingPathComponent("Golden/terrain.json")))
        for s in golden.samples {
            let want = [UInt8](Data(base64Encoded: s.heights)!)
            let got = TerrainGenerator.generate(graph: graph, seed: s.seed, template: s.template)
            let diff = zip(got, want).filter { $0 != $1 }.count
            XCTAssertEqual(diff, 0, "cells differing for seed \(s.seed) \(s.template)")
        }
    }

    func testAleaMatchesTheReference() {
        var a = Alea("421730")
        let x = a.next(), y = a.next()
        XCTAssertTrue(x >= 0 && x < 1 && y >= 0 && y < 1 && x != y)
    }
}
