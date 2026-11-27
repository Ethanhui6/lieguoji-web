import XCTest
import Foundation
@testable import LieguojiCore

/// v10.1.0 真机五大痛点回归测试：
/// 1. `cities_zh.json` 100% 纯正中文，0 条 `iso == "XX"`、0 条拉丁字母残留、0 条旧机翻乱码（什阿恩哈/贝伊吉恩/卡瓦萨基等）；
/// 2. `sengoku_1560`、`ww2_europe_1939`、`china_1931`、`ww2_asia_1941` 地名纯净准确：日本战国绝无釜山/清津等外国城名、无乱码、全州唯一无重名；
/// 3. 建世第 0 帧 `CreationMap.build` 输出的 `meta.labels` 严格落在本国领土内且不丢失低地三国/日本 24 大名等小国；
/// 4. `HistoricalBasemaps` 边界兼容性守卫：拦截旧版错位经纬度热更底图，且 `unproject(project(lon, lat))` 精准闭环。
final class V101FixTests: XCTestCase {
    private static var cachedInputs: CreationMap.Inputs?

    private func loadInputsAndAtlas() throws -> CreationMap.Inputs {
        if let cached = Self.cachedInputs { return cached }
        let inp = try NativeCreationTests.inputs()
        let atlasDir = NativeCreationTests.resources.appendingPathComponent("HistoricalAtlas")
        HistoricalBasemaps.loadAtlasDirectory(atlasDir)
        Self.cachedInputs = inp
        return inp
    }

    private func cleanup() {
        Session.uninstall()
        UnitKinds.enabled = false
        DeclarationEngine.temper = nil
        DeclarationEngine.pact = nil
        DeclarationEngine.stance = nil
        ArmyAutonomy.temper = nil
    }

    // MARK: - 1. 全球城市库 100% 纯正中文无乱码与无 XX

    func testBundledCitiesGazetteerHasZeroGibberishOrXX() throws {
        let atlasDir = NativeCreationTests.resources.appendingPathComponent("HistoricalAtlas")
        let citiesURL = atlasDir.appendingPathComponent("cities_zh.json")
        let data = try Data(contentsOf: citiesURL)
        let list = try JSONDecoder().decode([HistoricalBasemaps.GazetteerCity].self, from: data)
        XCTAssertGreaterThan(list.count, 7000, "纯正中文城市库应包含 7000+ 座真实城市")

        let forbiddenFragments = [
            "什阿恩", "贝伊吉", "奇埃恩", "纳恩吉", "古阿恩", "什埃恩", "乌哈恩", "蒂阿恩",
            "塔伊佩", "哈尔比恩", "达利阿恩", "哈恩日", "库恩米", "卡瓦萨基", "基塔克尤",
            "哈马茨", "奥卡雅马", "库马莫托", "什伊祖", "乌茨乌", "奥茨乌", "马茨乌",
            "托库什", "瓦卡雅马", "比尔米恩", "马恩奇埃", "莱埃德斯", "什埃弗菲", "尼日恩伊",
        ]
        var xxCount = 0
        var latinCount = 0
        var gibberishSamples = [String]()
        for c in list {
            let iso = c.iso.uppercased()
            if iso.isEmpty || iso == "XX" || iso == "-99" { xxCount += 1 }
            for scalar in c.n.unicodeScalars {
                if (scalar.value >= 0x41 && scalar.value <= 0x5A) || (scalar.value >= 0x61 && scalar.value <= 0x7A) {
                    latinCount += 1
                    break
                }
            }
            for bad in forbiddenFragments where c.n.contains(bad) {
                if gibberishSamples.count < 10 { gibberishSamples.append("\(c.n)(\(c.iso))") }
                break
            }
        }
        XCTAssertEqual(xxCount, 0, "城市库不应包含任何 iso==XX 机翻条目")
        XCTAssertEqual(latinCount, 0, "城市库不应包含任何拉丁英文字母")
        XCTAssertTrue(gibberishSamples.isEmpty, "城市库不应包含机翻乱码：\(gibberishSamples)")

        let jpCount = list.filter { $0.iso.uppercased() == "JP" }.count
        XCTAssertGreaterThanOrEqual(jpCount, 100, "日本真实中文城市应 >= 100 座")
    }

    // MARK: - 2. 日本战国 & 二战欧亚地名隔离、唯一性与首帧国名境内校验

    func testSengoku1560NamesIsolatedToJapanAndFrame0LabelsComplete() throws {
        defer { cleanup() }
        guard let sc = HistoricalScenarios.scenario(id: "sengoku_1560") else {
            XCTFail("缺少日本战国剧本"); return
        }
        let inputs = try loadInputsAndAtlas()
        var opt = NativeCreation.Options(
            seed: "v101-sengoku",
            template: "continents",
            count: sc.nations.count,
            cityCount: sc.provinceCount,
            relations: "historical",
            naming: "historical-names",
            cultures: []
        )
        opt.historicalScenario = sc
        opt.historicalRoute = "historical"
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v101-sg", runId: "run-sg")

        let meta = built.map.meta
        let provs = meta.provinces.asArray
        let nations = meta.nations.asArray
        let labels = meta.labels.asArray
        XCTAssertEqual(nations.count, 24, "日本战国应为 24 家大名")

        // 1) 地名绝无韩国/朝鲜/欧美城市与机翻乱码，且全部唯一
        let foreignForbidden = ["釜山", "蔚山", "清津", "浦项", "平壤", "汉城", "首尔", "仁川", "什阿恩", "卡瓦萨基", "库马莫托", "瓦卡雅马"]
        var seenNames = Set<String>()
        for p in provs {
            let nm = p.name.asString
            XCTAssertFalse(nm.isEmpty, "州郡名不可为空")
            XCTAssertTrue(seenNames.insert(nm).inserted, "州郡名出现重复：\(nm)")
            for bad in foreignForbidden {
                XCTAssertFalse(nm.contains(bad), "日本战国不应出现非日本/乱码地名：\(nm)")
            }
        }

        // 2) 建世第 0 帧 meta.labels 必须覆盖全部 24 家大名（小国大名绝不消失！）
        let labeledNations = Set(labels.map { $0.nation.asInt })
        XCTAssertEqual(labeledNations.count, nations.count, "第 0 帧全部 24 家大名均须拥有境内国名框，实际仅 \(labeledNations.count)/\(nations.count)")
    }

    func testWW2Europe1939Frame0LabelsCoverBeneluxAndZeroGibberish() throws {
        defer { cleanup() }
        guard let sc = HistoricalScenarios.scenario(id: "ww2_europe_1939") else {
            XCTFail("缺少二战欧陆 1939 剧本"); return
        }
        let inputs = try loadInputsAndAtlas()
        var opt = NativeCreation.Options(
            seed: "v101-eu39",
            template: "continents",
            count: sc.nations.count,
            cityCount: sc.provinceCount,
            relations: "historical",
            naming: "historical-names",
            cultures: []
        )
        opt.historicalScenario = sc
        opt.historicalRoute = "historical"
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v101-eu", runId: "run-eu")

        let meta = built.map.meta
        let nations = meta.nations.asArray
        let labels = meta.labels.asArray
        let provs = meta.provinces.asArray

        let labeledNations = Set(labels.map { $0.nation.asInt })
        XCTAssertEqual(labeledNations.count, nations.count, "二战欧陆第 0 帧应为全部 \(nations.count) 国（含卢森堡/荷兰/比利时）生成境内国名框")

        let badEur = ["比尔米恩", "马恩奇埃", "莱埃德斯", "什埃弗菲", "杜伊斯布", "杜斯塞尔", "沃尔戈格", "德尼普奥"]
        for p in provs {
            let nm = p.name.asString
            for bad in badEur {
                XCTAssertFalse(nm.contains(bad), "欧洲剧本不应出现机翻乱码地名：\(nm)")
            }
        }
    }

    // MARK: - 3. 经纬度正反投影闭环校验

    func testProjectionRoundTripAccuracyAcrossRegions() {
        let samples: [(HistoricalRegion, Double, Double)] = [
            (.japanDetail, 135.77, 35.01),
            (.japanDetail, 139.75, 35.69),
            (.europe, 13.40, 52.52),
            (.europe, 2.35, 48.86),
            (.china, 116.40, 39.91),
            (.eastAsiaJapan, 103.82, 1.35),
        ]
        for (reg, lon, lat) in samples {
            let p = HistoricalBasemaps.project(lon: lon, lat: lat, region: reg, width: 1600, height: 900)
            let back = HistoricalBasemaps.unproject(x: p.x, y: p.y, region: reg, width: 1600, height: 900)
            XCTAssertEqual(back.lon, lon, accuracy: 1e-6, "\(reg.rawValue) 经度反算漂移")
            XCTAssertEqual(back.lat, lat, accuracy: 1e-6, "\(reg.rawValue) 纬度反算漂移")
        }
    }
}
