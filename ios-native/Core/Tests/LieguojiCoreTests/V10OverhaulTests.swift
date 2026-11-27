import XCTest
import Foundation
@testable import LieguojiCore

/// v10.0.0 全维度回归验证测试：
/// 1. AoH3 级日本战国 24 家大名 + 放大 `japanDetail` 地图框 + 津轻以北虾夷地无人之地 + 修复北条误写派系/伊达误写札幌；
/// 2. 非均匀真实地理密度细分（核心战略区州郡面积远小于东俄/西伯利亚荒原大州，且台湾/港澳/新加坡/欧陆核心高密细化）；
/// 3. 真实历史开局兵力编制与前线战略部署（彻底根治苏联/广土大国按省份数在西伯利亚无脑爆兵）；
/// 4. 五维综合国力排行（工业/质量军事海权/四线科技/递减核心体量/外交稳定：1939 德英苏法居首，1941 日美压制低工业广土）；
/// 5. 政权/政党/王权/君主真实性（意/希/罗君主制、一党制禁虚假选举、王权等级与终生领袖保护）。
final class V10OverhaulTests: XCTestCase {
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

    private func launchScenario(_ id: String, route: String = "historical") throws -> NativeEngine {
        guard let sc = HistoricalScenarios.scenario(id: id) else {
            throw XCTSkip("未找到历史剧本 \(id)")
        }
        let inputs = try loadInputsAndAtlas()
        var opt = NativeCreation.Options(
            seed: "v10test-\(id)-\(route)",
            template: "continents",
            count: sc.nations.count,
            cityCount: sc.provinceCount,
            relations: "historical",
            naming: "historical-names",
            cultures: []
        )
        opt.historicalScenario = sc
        opt.historicalRoute = route
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v10-\(id)", runId: "run-\(id)")
        let engine = try NativeEngine(world: Data(built.json.utf8))
        engine.enableAppRules()
        return engine
    }

    private func findNationId(_ r: JS, nameContains substr: String) -> String? {
        for n in r.world.nations.asArray {
            if (n.name.optionalString ?? "").contains(substr) {
                return n.id.asString
            }
        }
        return nil
    }

    // MARK: - 1. AoH3 级日本战国 24 家大名、放大画框与数据纠偏

    func testSengoku24ClansEnlargedFrameAndPurity() throws {
        defer { cleanup() }
        guard let sc = HistoricalScenarios.scenario(id: "sengoku_1560") else {
            XCTFail("缺少日本战国剧本"); return
        }
        XCTAssertEqual(sc.nations.count, 24, "v10.0.0 日本战国应细化为 24 家真实 1560 大名")
        let requiredIds = ["oda", "matsudaira", "ashikaga", "azai", "rokkaku", "kitabatake", "amago", "ukita", "satake", "mogami", "nanbu"]
        let allIds = Set(sc.nations.map(\.id))
        for rid in requiredIds {
            XCTAssertTrue(allIds.contains(rid), "日本战国剧本缺少关键大名 \(rid)")
        }
        XCTAssertEqual(sc.nations.first(where: { $0.id == "ashikaga" })?.style, "shogunate", "足利幕府应为幕府体制")
        XCTAssertEqual(sc.nations.first(where: { $0.id == "miyoshi" })?.style, "feudal", "三好家应为战国大名而非幕府")
        if let dateSpec = sc.nations.first(where: { $0.id == "date" }) {
            XCTAssertFalse(dateSpec.anchors.contains { $0.provinceName.contains("札幌") }, "1560 伊达家绝不应包含虾夷地札幌锚点")
        }

        // 校验放大后的 japanDetail 地图框比例
        XCTAssertLessThanOrEqual(HistoricalRegion.japanDetail.lonMax - HistoricalRegion.japanDetail.lonMin, 14.5)
        XCTAssertLessThanOrEqual(HistoricalRegion.japanDetail.latMax - HistoricalRegion.japanDetail.latMin, 12.5)

        // 校验 24 家名册完整且修复北条误写「尾张革新派」
        let roster = HistoricalRoster.roster(scenarioId: "sengoku_1560")
        XCTAssertEqual(roster.count, 24, "日本战国 24 家大名应全部配备真实名册")
        if let hojoRoster = roster.first(where: { $0.nationIndex == 4 }) {
            XCTAssertFalse(hojoRoster.parties.contains { $0.name.contains("尾张") }, "北条家派系不得误写为尾张革新派")
        }

        // 端到端建世校验：24 国皆有城池领土且各自保有紧凑战国兵力
        let eng = try launchScenario("sengoku_1560")
        let r = eng.run
        XCTAssertEqual(r.world.nations.length, 24)
        for n in r.world.nations.asArray {
            let nid = n.id.asString
            let provs = r.world.provinces.asArray.filter { $0.controller.optionalString == nid }.count
            XCTAssertGreaterThanOrEqual(provs, 1, "战国大名 \(n.name.asString) 至少应拥有 1 州领地")
            let armies = r.world.armies.asArray.filter { $0.nationId.optionalString == nid && $0.troops.asNumber > 0 }.count
            XCTAssertGreaterThanOrEqual(armies, 1)
            XCTAssertLessThanOrEqual(armies, 8, "战国大名 \(n.name.asString) 开局军团不应超额刷兵（实际 \(armies)）")
        }
    }

    // MARK: - 2. 非均匀真实地理密度划分（俄西伯利亚大州 vs 欧陆/东亚核心超细化）

    func testNonUniformGeographicProvinceDensitySizing() throws {
        defer { cleanup() }
        let eu = try launchScenario("ww2_europe_1939")
        let r = eu.run
        let provs = r.world.provinces.asArray

        var westCoreCells = [Int]()
        var eastSparseCells = [Int]()
        for p in provs {
            let cx = p.center[0].asNumber
            let cy = p.center[1].asNumber
            let geo = HistoricalBasemaps.unproject(x: cx, y: cy, region: .europe, width: 1600, height: 900)
            let cellCount = p.cells.length
            if geo.lon >= 2.0 && geo.lon <= 19.0 && geo.lat >= 46.5 && geo.lat <= 54.0 {
                westCoreCells.append(cellCount)
            } else if geo.lon >= 36.0 && geo.lat >= 50.0 {
                eastSparseCells.append(cellCount)
            }
        }
        XCTAssertFalse(westCoreCells.isEmpty)
        XCTAssertFalse(eastSparseCells.isEmpty)
        let avgWest = Double(westCoreCells.reduce(0, +)) / Double(westCoreCells.count)
        let avgEast = Double(eastSparseCells.reduce(0, +)) / Double(eastSparseCells.count)
        XCTAssertLessThan(avgWest, avgEast * 0.85, "欧洲核心区州郡应显著比东俄广袤草原更细密（西中欧均格 \(avgWest) vs 东俄均格 \(avgEast)）")
    }

    // MARK: - 3. 真实开局兵力编制与前线战略部署（杜绝苏联/广土荒原开局爆兵）

    func testAuthenticOpeningOOBAndStrategicDeployment() throws {
        defer { cleanup() }
        let eu = try launchScenario("ww2_europe_1939")
        let r = eu.run
        guard let gerId = findNationId(r, nameContains: "德意志"),
              let ussrId = findNationId(r, nameContains: "苏联"),
              let luxId = findNationId(r, nameContains: "卢森堡") else {
            XCTFail("缺少 1939 欧洲关键国家"); return
        }
        let gerArmies = r.world.armies.asArray.filter { $0.nationId.optionalString == gerId && $0.troops.asNumber > 0 }.count
        let ussrArmies = r.world.armies.asArray.filter { $0.nationId.optionalString == ussrId && $0.troops.asNumber > 0 }.count
        let luxArmies = r.world.armies.asArray.filter { $0.nationId.optionalString == luxId && $0.troops.asNumber > 0 }.count

        XCTAssertGreaterThanOrEqual(gerArmies, 12, "1939 德军应保持精锐进攻主力（实际 \(gerArmies)）")
        XCTAssertLessThanOrEqual(gerArmies, 18)
        XCTAssertLessThanOrEqual(ussrArmies, 16, "1939.9 苏联绝不可按省份面积开局爆出几十支军（实际 \(ussrArmies)）")
        XCTAssertLessThanOrEqual(luxArmies, 2, "卢森堡等袖珍国开局应为 1-2 支守备军（实际 \(luxArmies)）")
        XCTAssertGreaterThanOrEqual(gerArmies, ussrArmies, "1939.9 开战时刻已完成动员的德国现役师团数不应低于未全面卫国动员的苏联")
        cleanup()

        // 1950 冷战世界全图：苏联同样不得按西伯利亚面积铺兵
        let cw = try launchScenario("coldwar_1950")
        let cr = cw.run
        if let cwUssr = findNationId(cr, nameContains: "苏联"),
           let cwUsa = findNationId(cr, nameContains: "美利坚") {
            let uCount = cr.world.armies.asArray.filter { $0.nationId.optionalString == cwUssr && $0.troops.asNumber > 0 }.count
            let aCount = cr.world.armies.asArray.filter { $0.nationId.optionalString == cwUsa && $0.troops.asNumber > 0 }.count
            XCTAssertLessThanOrEqual(uCount, 18, "1950 苏联开局常备军应保持克制精锐编制（实际 \(uCount)）")
            XCTAssertLessThanOrEqual(aCount, 16, "1950 美国开局常备军应保持克制精锐编制（实际 \(aCount)）")
        } else {
            XCTFail("1950 冷战缺少美苏")
        }
    }

    // MARK: - 4. 五维综合国力排行（工业 + 质量军事海权 + 科技 + 递减核心 + 外交稳定）

    func testMultiPillarCompositePowerRanking() throws {
        defer { cleanup() }
        let eu = try launchScenario("ww2_europe_1939")
        let r = eu.run
        guard let gerId = findNationId(r, nameContains: "德意志"),
              let ukId = findNationId(r, nameContains: "大英帝国"),
              let ussrId = findNationId(r, nameContains: "苏联"),
              let frId = findNationId(r, nameContains: "法兰西"),
              let spainId = findNationId(r, nameContains: "西班牙"),
              let turkeyId = findNationId(r, nameContains: "土耳其") else {
            XCTFail("缺少 1939 欧洲大国"); return
        }
        let ranked = r.world.nations.asArray
            .map { (id: $0.id.asString, name: $0.name.asString, p: War26.compositePower(r, $0.id.asString)) }
            .sorted { $0.p.total > $1.p.total }
        let top4Ids = Set(ranked.prefix(4).map(\.id))
        XCTAssertTrue(top4Ids.contains(gerId), "1939 德意志第三帝国应稳居欧洲综合国力前四（实际前四：\(ranked.prefix(4).map(\.name))）")
        XCTAssertTrue(top4Ids.contains(ukId), "1939 大英帝国凭借工业/科技/皇家海军应稳居综合国力前四（实际前四：\(ranked.prefix(4).map(\.name))）")
        XCTAssertTrue(top4Ids.contains(ussrId), "1939 苏联应稳居综合国力前四")
        XCTAssertTrue(top4Ids.contains(frId), "1939 法国应稳居综合国力前四")

        let gerP = War26.compositePower(r, gerId)
        let ukP = War26.compositePower(r, ukId)
        let spainP = War26.compositePower(r, spainId)
        let turkeyP = War26.compositePower(r, turkeyId)
        XCTAssertGreaterThan(gerP.total, spainP.total * 2.0, "1939 德国综合国力应远超西班牙")
        XCTAssertGreaterThan(ukP.total, turkeyP.total * 2.0, "1939 英国综合国力应远超土耳其")
        XCTAssertGreaterThan(gerP.industry, spainP.industry * 2.0)
        cleanup()

        // 1941 亚太：日本与美军太平洋凭借压倒性工业、科技与海权稳居前二
        let asia = try launchScenario("ww2_asia_1941")
        let ar = asia.run
        if let jpId = findNationId(ar, nameContains: "日本"),
           let rocId = findNationId(ar, nameContains: "国民政府") ?? findNationId(ar, nameContains: "中华民国"),
           let thaiId = findNationId(ar, nameContains: "泰国") {
            let jpP = War26.compositePower(ar, jpId)
            let rocP = War26.compositePower(ar, rocId)
            let thaiP = War26.compositePower(ar, thaiId)
            XCTAssertGreaterThan(jpP.total, rocP.total * 1.4, "1941 大日本帝国综合国力（工业/科技/联合舰队）应明显领先抗战中的国民政府")
            XCTAssertGreaterThan(jpP.total, thaiP.total * 2.5, "1941 日本综合国力应远超泰国")
        } else {
            XCTFail("1941 亚太缺少核心国家")
        }
    }

    // MARK: - 5. 真实政权、王权等级与一党制党派校验

    func testRegimeMonarchySinglePartyAndRoyalAuthority() throws {
        defer { cleanup() }
        let eu = try launchScenario("ww2_europe_1939")
        let r = eu.run
        guard let gerId = findNationId(r, nameContains: "德意志"),
              let ukId = findNationId(r, nameContains: "大英帝国"),
              let itId = findNationId(r, nameContains: "意大利"),
              let romId = findNationId(r, nameContains: "罗马尼亚"),
              let grId = findNationId(r, nameContains: "希腊") else {
            XCTFail("缺少关键欧洲政权"); return
        }

        // 意大利/希腊/罗马尼亚/英国均保持真实君主制而非误设为共和
        XCTAssertEqual(Regimes.style(r, itId).id, "dualMonarchy")
        XCTAssertEqual(Regimes.style(r, grId).id, "dualMonarchy")
        XCTAssertEqual(Regimes.style(r, romId).id, "absolute")
        XCTAssertEqual(Regimes.style(r, ukId).id, "constitutional")

        // 希腊王国君主乔治二世 + 首相梅塔克萨斯双首脑就位
        let grHead = Regimes.ruler(r, grId).map { NativeEngine.displayPersonName($0) } ?? ""
        let grPm = Regimes.premier(r, grId).map { NativeEngine.displayPersonName($0) } ?? ""
        XCTAssertTrue(grHead.contains("乔治"), "1939 希腊国王应为乔治二世，实际 \(grHead)")
        XCTAssertTrue(grPm.contains("梅塔克萨斯"), "1939 希腊王国首相应为梅塔克萨斯，实际 \(grPm)")

        // 王权实权阶梯（君主专制 > 二元君主 > 虚君立宪）
        let ukInfo = NationInfo.detail(r, ukId)
        let itInfo = NationInfo.detail(r, itId)
        let romInfo = NationInfo.detail(r, romId)
        let ukAuth = ukInfo.polityDetail.royalAuthority.asInt
        let itAuth = itInfo.polityDetail.royalAuthority.asInt
        let romAuth = romInfo.polityDetail.royalAuthority.asInt
        XCTAssertGreaterThan(romAuth, itAuth, "君主专制王权（罗马尼亚 \(romAuth)）应高于二元君主制（意大利 \(itAuth)）")
        XCTAssertGreaterThan(itAuth, ukAuth, "二元君主制王权（意大利 \(itAuth)）应高于虚君立宪（英国 \(ukAuth)）")
        XCTAssertFalse((ukInfo.polityDetail.royalAuthorityLabel.optionalString ?? "").isEmpty)

        // 一党制国家（德意志第三帝国）不因定期选举丢失 100% 执政党席位或更换终身领袖
        let beforeParty = r.regimes.nations[gerId].parties[0].seats.asInt
        XCTAssertEqual(beforeParty, 100)
        Regimes.election(r, gerId)
        XCTAssertEqual(r.regimes.nations[gerId].parties[0].seats.asInt, 100, "一党制政权严禁虚构多党席位洗牌")
        XCTAssertEqual(r.regimes.nations[gerId].parties.length, 1)
    }
}
