import XCTest
import Foundation
@testable import LieguojiCore

/// 纯 Swift 建新世界的端到端对照（src/native-export/native-creation-golden.test.ts）：App 实际调用的网页
/// generate(options) + nativeWorld()，4 种地形模板 × 2 种命名；整局每个顶层键、静态几何每项、地图二进制与元数据
/// 各比长度与两个散列，最后比整份 JSON。
final class NativeCreationTests: XCTestCase {
    static let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    static var resources: URL { dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources") }

    /// native-creation-golden.test.ts digest：UTF-8 字节数、FNV-1a、djb2 异或变体。
    static func digest(_ text: String) -> [Double] {
        var a: UInt32 = 0x811c9dc5, b: UInt32 = 5381, n = 0
        for x in text.utf8 { a = (a ^ UInt32(x)) &* 0x1000193; b = (b &* 33) ^ UInt32(x); n += 1 }
        return [Double(n), Double(a), Double(b)]
    }
    static func inputs() throws -> CreationMap.Inputs {
        let res = resources
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: res.appendingPathComponent("Catalog/traits.json")), nobleCultures: Data(contentsOf: res.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: res.appendingPathComponent("World/cultures.json")))
        try OpeningGovernment.loadResources(Data(contentsOf: res.appendingPathComponent("Catalog/biome-resources.json")))
        let world = res.appendingPathComponent("World")
        return CreationMap.Inputs(base: try WorldMap.load(directory: world), grid: try TerrainGraph(data: Data(contentsOf: world.appendingPathComponent("grid20k.bin"))),
                                  edges: try CreationMap.GridEdges(data: Data(contentsOf: world.appendingPathComponent("edges20k.bin"))),
                                  document: try TerrainDocument(data: Data(contentsOf: world.appendingPathComponent("doc20k.bin"))))
    }
    static func options(_ s: JS) -> NativeCreation.Options {
        let o = s.options
        var opt = NativeCreation.Options(seed: o.seed.asString, template: o.template.asString, count: o.count.asInt, cityCount: o.cityCount.asInt, relations: o.relations.asString,
                                          naming: o.naming.asString, cultures: o.cultures.asArray.map(\.asString))
        opt.precipitation = o.climate.precipitation.asNumber; opt.temperatureOffset = o.climate.temperatureOffset.asNumber
        opt.north = o.climate.north.asNumber; opt.south = o.climate.south.asNumber
        return opt
    }
    /// 网页导出时 crypto.randomUUID 依次编号：地形文档总是第 2 个；局号随加州数重试而后移，记在黄金里。
    static let worldId = "00000000-0000-4000-8000-000000000002"

    static func check(_ w: NativeCreation.World, _ s: JS, _ label: String) -> [String] {
        var out = [String]()
        if w.cityCount != s.cityCount.asInt { out.append("\(label): 州数 \(w.cityCount) vs \(s.cityCount.asInt)") }
        func same(_ v: JS, _ want: JS) -> Bool { digest(v.json) == want.asArray.map(\.asNumber) }
        let keys = w.run.objectKeys
        if keys != s.runKeys.asArray.map(\.asString) { out.append("\(label): 整局键序 \(keys)") }
        for (k, want) in s.run.objectEntries where !same(w.run[k], want) { out.append("\(label): run.\(k)") }
        if w.statics.objectKeys != s.staticKeys.asArray.map(\.asString) { out.append("\(label): 静态键序 \(w.statics.objectKeys)") }
        for (k, want) in s.statics.objectEntries where !same(w.statics[k], want) { out.append("\(label): statics.\(k)") }
        if digest(w.statics.map.bin.asString) != s.map.bin.asArray.map(\.asNumber) { out.append("\(label): map.bin") }
        if !same(w.statics.map.meta, s.map.meta) { out.append("\(label): map.meta") }
        if digest(w.json) != s.whole.asArray.map(\.asNumber) { out.append("\(label): 整份 nativeWorld") }
        return out
    }

    func testNativeCreationMatchesTheWeb() throws {
        let x = try Self.inputs()
        let golden = try JS.parse(Data(contentsOf: Self.dir.appendingPathComponent("Golden/native-creation.json")))
        for (i, s) in golden.samples.asArray.enumerated() {
            let label = "case\(i) \(s.options.template.asString) \(s.options.naming.asString)"
            let started = Date()
            let w = try NativeCreation.generate(Self.options(s), inputs: x, worldId: Self.worldId, runId: s.runId.asString)
            print("\(label)：\(String(format: "%.2f", Date().timeIntervalSince(started))) 秒，\(w.cityCount) 州")
            for m in Self.check(w, s, label) { XCTFail(m) }
        }
    }
}
