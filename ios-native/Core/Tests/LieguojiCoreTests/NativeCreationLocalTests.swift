import XCTest
import Foundation
@testable import LieguojiCore

/// 本机逐键对照：src/native-export/native-creation-golden.test.ts 用 NATIVE_CREATION_DUMP 写出的完整
/// nativeWorld() 输出（不入库）。环境变量 NATIVE_CREATION_DUMP 指向该目录；没有时跳过。
final class NativeCreationLocalTests: XCTestCase {
    static var dumpDir: URL? { ProcessInfo.processInfo.environment["NATIVE_CREATION_DUMP"].map { URL(fileURLWithPath: $0) } }
    static var resources: URL { URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources") }

    func testTravelBinaryMatchesTheDump() throws {
        guard let dir = Self.dumpDir else { throw XCTSkip("没有 NATIVE_CREATION_DUMP") }
        let doc = try TerrainDocument(data: Data(contentsOf: Self.resources.appendingPathComponent("World/doc20k.bin")))
        let grid = try TerrainGraph(data: Data(contentsOf: Self.resources.appendingPathComponent("World/grid20k.bin")))
        let golden = try JS.parse(Data(contentsOf: Self.resources.deletingLastPathComponent().appendingPathComponent("Core/Tests/LieguojiCoreTests/Golden/native-creation.json")))
        for (i, s) in golden.samples.asArray.enumerated() where i % 2 == 0 {
            let w = try JS.parse(Data(contentsOf: dir.appendingPathComponent("case\(i)-native.json")))
            let h = TerrainGenerator.generate(graph: grid, seed: s.options.seed.asString, template: s.options.template.asString).map(Int.init)
            let r = w.run, provinces = r.world.provinces.asArray
            let graph = CreationGeography.travelGraph(doc, elevations: h, provinces: provinces, sea: SeaGraph(doc, elevations: h, provinces: provinces))
            let targets = provinces.map { p -> TravelPoint in
                let c = r.world.cities.asArray.first { $0.provinceId.asString == p.id.asString }
                let v = c?.position ?? p.center; return TravelPoint(x: v.x.asNumber, y: v.y.asNumber)
            }
            let ctx = r.terrainContext.provinces
            let bin = CreationGeography.travelBinary(graph, scale: r.scale.asNumber, mountain: provinces.map { ctx[$0.id.asString].mountain.asBool },
                                                     plateau: provinces.map { ctx[$0.id.asString].plateau.asBool }, targets: targets,
                                                     faceBiomes: r.forceSpeed.faceBiomes.asArray.map { UInt8($0.asInt) })
            let statics = CreationStatics.build(r, doc, elevations: h, sea: SeaGraph(doc, elevations: h, provinces: provinces), travel: graph)
            for k in ["travel", "borders", "homeCells", "diplomacy", "seaPorts", "sea"] where statics[k].json != w.statics[k].json {
                XCTFail("case\(i): statics.\(k) 不同 \(statics[k].difference(w.statics[k], path: k) ?? "（键序）")")
            }
            let want = Data(base64Encoded: w.statics.travel.asString)!
            if bin != want {
                let k = zip(bin, want).enumerated().first { $0.element.0 != $0.element.1 }?.offset ?? min(bin.count, want.count)
                XCTFail("case\(i): travel.bin 不同（\(bin.count) vs \(want.count) 字节，首个差异在 \(k)）")
            }
        }
    }
}
