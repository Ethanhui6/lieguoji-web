import XCTest
import Foundation
@testable import LieguojiCore

/// v11.0.0 全链路终极回归测试：
/// 1. 7,289 座 100% 简体纯中文城市大典（0 繁体 / 0 拉丁 / 0 iso=="XX" / 0 非法单字残片）；
/// 2. 局部历史剧本港口与舰队回归（修复 `SeaGraph.harbors()` 封锁局部内海 Bug）；
/// 3. `HistoricalEvents` 严格年份门控（1936 剧本第 120 天绝不提前触发 1939 闪击波兰）与架空路线互动开关；
/// 4. `War26.compositePower` 同盟成员（`rec.members`）与核武账本真实计分；
/// 5. `EngineService` `open(withoutMap: true, withoutState: true)` 40B 秒连与 LZ4 `tuning` 压缩解压；
/// 6. 1914 / 1931 / 1936 / 1950 史实花名册与配色考据修复校验。
final class V11OverhaulTests: XCTestCase {
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

    private func launchScenario(_ id: String, seed: String, route: String = "historical") throws -> NativeEngine {
        guard let sc = HistoricalScenarios.scenario(id: id) else {
            throw NSError(domain: "V11OverhaulTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing scenario \(id)"])
        }
        let inputs = try loadInputsAndAtlas()
        var opt = NativeCreation.Options(
            seed: seed,
            template: "continents",
            count: sc.nations.count,
            cityCount: sc.provinceCount,
            relations: "historical",
            naming: "historical-names",
            cultures: []
        )
        opt.historicalScenario = sc
        opt.historicalRoute = route
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v11-\(id)", runId: "run-\(id)")
        let engine = try NativeEngine(world: Data(built.json.utf8))
        engine.enableAppRules()
        return engine
    }

    // MARK: - 1. 城市大典 100% 简体纯中文校验

    func testCitiesGazetteerPureSimplifiedChinese() throws {
        let atlasDir = NativeCreationTests.resources.appendingPathComponent("HistoricalAtlas")
        let citiesURL = atlasDir.appendingPathComponent("cities_zh.json")
        let data = try Data(contentsOf: citiesURL)
        let list = try JSONDecoder().decode([HistoricalBasemaps.GazetteerCity].self, from: data)
        XCTAssertGreaterThanOrEqual(list.count, 7200, "纯简体城市库应包含 7,200+ 座真实城市")

        let tradChars = Set("國廣東華臺灣龍漢門馬區縣廠鐵衛軍戰機長電雲車風島灣嶺陽陰峽愛開關萬興義書會歲慶麗學寶實察導層幣師帶幫廳應懷態憲應戰戲戶揚擴攝攜敘數斷時晝書會業樂樓標樣權歡歸氣漢澤濟濱灣無煙營爭爾獨產畢畫當發盡監盧眾碼禮稱穀積穩競筆築節範籌簽簡糧紅級紀約純紙紋納紐統絲維綱網綿緊線練組細織終結給絕絡統繪續羅美義習聞聯聲職聽肅腦膠臺與興舉舊薩蘇蘭處號衛裝製西見觀覺覽解言計訊討訓託記訪設許訴診評詞詢試詩話該詳語誤說請諸諾讀變讓貝貞負財貢貧貨貫責貴買費貸貿賀資賈賊賓賜賞賢賣質賴購賽贊贏趙趕趨足路躍身車軍軒軟較載輔輕輛輩輪輯輸轉辦辭農運過達違遙遠適遭遮遲遷選遺避邀還邁邑鄉鄭鄰鄧釀釋里重野量金針釣鈴銀銅銘銜銷鋒鋼錄錢錦錫錯鍵鍾鎮鏡長門閃閉開閏閑間悶閘鬧聞閥閣閱闊隊陽陰陣階際陸陳險隨隱隸難雲電霧露霸青靜非面韓韻頁頂項順須預頑頓領頗頭頻題額顏願顛類顧顯風飛食飢飯飲飼飽飾餅養餐餘館首香馬馳駁駐駕駝騎騙騷驅驗驚骨高鬥鬧鬱鬼魂魏魔魚魯鮮鯨鳥鳳鳴鴨鴻鵝鶴鷹鹿麥麻黃點黨齊齋齒齡龍龜")
        var tradSamples: [String] = []
        var bogusSingleChar: [String] = []
        for c in list {
            XCTAssertFalse(c.iso.isEmpty || c.iso.uppercased() == "XX", "存在无效 ISO: \(c.n)")
            if c.n.count == 1 && !(c.n == "津" && c.iso.uppercased() == "JP") {
                bogusSingleChar.append("\(c.n)(\(c.iso))")
            }
            for ch in c.n {
                if tradChars.contains(ch) {
                    if tradSamples.count < 10 { tradSamples.append("\(c.n)(\(c.iso))") }
                    break
                }
            }
        }
        XCTAssertTrue(bogusSingleChar.isEmpty, "城市库不应含残字单字名：\(bogusSingleChar)")
        XCTAssertTrue(tradSamples.isEmpty, "城市库不应残留繁体字：\(tradSamples)")
    }

    // MARK: - 2. 局部历史战区港口与舰队回归

    func testRegionalScenariosHaveHarborsAndFleets() throws {
        for scId in ["ww2_europe_1939", "ww2_asia_1941", "sengoku_1560"] {
            defer { cleanup() }
            let engine = try launchScenario(scId, seed: "v11-harbor-\(scId)")
            let r = engine.run
            let harborsCount = r.harbors.isNull ? 0 : r.harbors.sites.asArray.count
            let fleetsCount = r.navy.isNull ? 0 : r.navy.fleets.asArray.count
            XCTAssertGreaterThan(harborsCount, 0, "\(scId) 局部历史战区必须生成真实沿海港口，当前为 0")
            XCTAssertGreaterThan(fleetsCount, 0, "\(scId) 局部历史战区必须生成史实舰队，当前为 0")
        }
    }

    // MARK: - 3. 历史事件严格年份门控与架空互动开关

    func testHistoricalEventsStrictDateGateAndSandboxFlag() throws {
        do {
            defer { cleanup() }
            let engine = try launchScenario("ww2_eve_1936", seed: "v11-ev36-hist", route: "historical")
            engine.advance(days: 120)
            let fired = engine.run.regimes.firedEvents
            XCTAssertTrue(fired["fall_weiss"].isNull, "1936 剧本推进 120 天后绝不应提前 3.5 年触发 1939 闪击波兰！")
            XCTAssertFalse(engine.run.regimes.playerInteractiveEvents.isTruthy, "史实路线默认不开启架空交互弹窗开关")
        }
        do {
            defer { cleanup() }
            let engine = try launchScenario("ww2_eve_1936", seed: "v11-ev36-sand", route: "sandbox")
            XCTAssertTrue(engine.run.regimes.playerInteractiveEvents.isTruthy, "架空路线必须开启 playerInteractiveEvents 供玩家抉择")
        }
    }

    // MARK: - 4. 五维综合国力同盟与核武计分修复

    func testCompositePowerCountsAlliancesAndNukes() throws {
        defer { cleanup() }
        let engine = try launchScenario("ww2_europe_1939", seed: "v11-power-eu39", route: "historical")
        let r = engine.run
        guard let gerId = HistoricalEvents.nationId(r, specId: "germany"),
              let ukId = HistoricalEvents.nationId(r, specId: "uk") else {
            XCTFail("缺少德/英国家 ID"); return
        }
        let beforeUk = War26.compositePower(r, ukId)
        XCTAssertGreaterThan(beforeUk.total, 40, "英国综合国力应处于大国区间")
        XCTAssertGreaterThan(beforeUk.diplomacy, 0, "同盟国英国应包含同盟外交计分")

        // 验证 NuclearWarfare 反应堆/核弹写入后实时计入工业与军事国力
        NuclearWarfare.ensureInitialized(r)
        let beforeGer = War26.compositePower(r, gerId)
        r.regimes.hoi4.nations[gerId].reactors = JS(2)
        r.regimes.hoi4.nations[gerId].nukes = JS(3)
        let afterGer = War26.compositePower(r, gerId)
        XCTAssertGreaterThan(afterGer.industry, beforeGer.industry + 10.0, "反应堆应计入工业国力")
        XCTAssertGreaterThan(afterGer.military, beforeGer.military + 50.0, "核弹应计入军事威慑国力")
    }

    // MARK: - 5. EngineService 秒连 withoutMap/withoutState 与 LZ4 tuning

    func testEngineServiceFastOpenAndLZ4Tuning() throws {
        defer { cleanup() }
        let engine = try launchScenario("sengoku_1560", seed: "v11-svc-sg")
        let svc = EngineService()
        _ = svc.adopt(engine)
        let saved = svc.handle("save", [:])
        XCTAssertTrue(saved.ok)
        guard let payload = saved.data, !payload.isEmpty else {
            XCTFail("save 未返回世界存档数据"); return
        }

        let remoteSvc = EngineService()
        let opened = remoteSvc.handle("open", ["withoutMap": true, "withoutState": true], payload: payload)
        XCTAssertTrue(opened.ok, "open(withoutMap, withoutState) 应成功：\(opened.reason)")
        XCTAssertNil(opened.map, "withoutMap: true 不应回传 2–30MB 冗余 mapJSON")
        XCTAssertNil(opened.data, "withoutState: true 不应回传冗余首帧 state")

        let tuningJSON = Data("{\"lethality\":2.5}".utf8)
        let compressedTuning = WireCodec.compress(tuningJSON)
        let tReply = remoteSvc.handle("tuning", [:], payload: compressedTuning)
        XCTAssertTrue(tReply.ok, "tuning 应支持 WireCodec LZ4 压缩体：\(tReply.reason)")
    }

    // MARK: - 6. 1914 / 1931 / 1936 / 1950 史实花名册与配色考据

    func testHistoricalRosterAndScenarioColorsCorrected() {
        if let ww1 = HistoricalScenarios.scenario(id: "ww1_1914"),
           let be = ww1.nations.first(where: { $0.id == "belgium" }),
           let ah = ww1.nations.first(where: { $0.id == "austria_hungary" }) {
            XCTAssertNotEqual(be.color.lowercased(), ah.color.lowercased(), "1914 比利时不应与奥匈帝国撞色")
        } else {
            XCTFail("缺少 ww1_1914 剧本或比利时/奥匈条目")
        }

        if let c31 = HistoricalScenarios.scenario(id: "china_1931"),
           let xj = c31.nations.first(where: { $0.id == "xinjiang" }) {
            XCTAssertEqual(xj.rulerName, "金树仁", "1931 九一八时新疆省主席应为金树仁")
        } else {
            XCTFail("缺少 china_1931 新疆条目")
        }

        if let cw = HistoricalScenarios.scenario(id: "coldwar_1950"),
           let ym = cw.nations.first(where: { $0.id == "yugo_mideast" }) {
            XCTAssertEqual(ym.capitalName, "贝尔格莱德", "1950 不结盟阵营首都应与铁托匹配为贝尔格莱德")
        } else {
            XCTFail("缺少 coldwar_1950 不结盟条目")
        }

        let uk36 = HistoricalRoster.nationRoster(scenarioId: "ww2_eve_1936", nationIndex: 2)
        XCTAssertEqual(uk36?.notables.first(where: { $0.role == "Chancellor" })?.name, "斯坦利·鲍德温", "1936 年英国首相应为斯坦利·鲍德温")

        let sp36 = HistoricalRoster.nationRoster(scenarioId: "ww2_eve_1936", nationIndex: 6)
        XCTAssertEqual(sp36?.founder.name, "曼努埃尔·阿萨尼亚", "1936 年初西班牙应为第二共和国阿萨尼亚而非佛朗哥政权")
        XCTAssertEqual(sp36?.parties.first?.name, "人民阵线", "1936 年西班牙执政党应为人民阵线")
    }
}
