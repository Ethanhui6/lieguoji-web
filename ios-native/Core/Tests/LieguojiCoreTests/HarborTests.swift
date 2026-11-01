import XCTest
import Foundation
@testable import LieguojiCore

/// Golden sea graph and capital harbours (src/native-export/harbor-golden.test.ts), v1 and open-sea v2.
final class HarborTests: XCTestCase {
    func testSeaGraphAndHarboursMatchTheWeb() throws {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent(), resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/World")
        let doc = try TerrainDocument(data: Data(contentsOf: resources.appendingPathComponent("doc20k.bin")))
        let golden = try JS.parse(Data(contentsOf: dir.appendingPathComponent("Golden/harbor.json")))
        for s in golden.samples.asArray {
            let label = "\(s.seed.asString) \(s.template.asString)"
            let h = [UInt8](Data(base64Encoded: s.heights.asString)!).map(Int.init)
            let provinces = s.provinces.asArray, cities = s.cityList.asArray
            let g = SeaGraph(doc, elevations: h, provinces: provinces)
            XCTAssertEqual(g.order.count, Int(s.nodes.count.asNumber), label)
            XCTAssertEqual(g.order, s.nodes.ids.asArray.map { Int($0.asNumber) }, label)
            XCTAssertEqual(g.order.map { g.nodes[$0]!.component }, s.nodes.components.asArray.map { Int($0.asNumber) }, label)
            XCTAssertEqual(g.order.map { g.nodes[$0]!.links.count }, s.nodes.links.asArray.map { Int($0.asNumber) }, label)
            for want in s.nodes.sample.asArray {
                let n = g.nodes[Int(want.id.asNumber)]!
                XCTAssertEqual(n.center.x, want.center.x.asNumber, label); XCTAssertEqual(n.center.y, want.center.y.asNumber, label)
                XCTAssertEqual(n.polygon.map(\.x), want.polygon.asArray.map { $0.x.asNumber }, label)
                for (l, w) in zip(n.links, want.links.asArray) { XCTAssertEqual(l.to, Int(w.to.asNumber)); XCTAssertEqual(l.distance, w.distance.asNumber, label); XCTAssertEqual(l.gate.x, w.gate.x.asNumber) }
            }
            XCTAssertEqual(g.ports.count, s.ports.asArray.count, label)
            for (key, method) in [("harbors", "capital-neighbor-v1"), ("openSea", "capital-neighbor-v2")] {
                let sites = JS.array(g.harbors(doc, provinces: provinces, cities: cities, method: method).map(\.js))
                if let d = sites.difference(s[key].sites, path: key) { XCTFail("\(label): \(d)") } else if sites.json != s[key].sites.json { XCTFail("\(label): order \(key)") }
            }
        }
    }
}
