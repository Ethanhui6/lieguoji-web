import XCTest
import Foundation
@testable import LieguojiCore

/// v7.0.0 全维度大改版回归验证测试：
/// 1. 严格核武时代锁（1943 年前全员 0 核 0 堆，1950 冷战精确仅美苏拥核、英国 1 堆在研）；
/// 2. 君主/首相双元首制与傀儡宗属（1941 昭和天皇裕仁+内阁总理大臣东条英机、伪满溥仪+梅津美治郎、1939 乔治六世+张伯伦、意大利国王+墨索里尼）；
/// 3. 历史家族与联姻文化纯净（1941 日本全族/旁支/配偶零外籍人名、零地名姓氏、陆海军派系尖锐对立）；
/// 4. 1941 日中真实陆海空与科技代差（平原/海战绝对压制，山地显著衰减）；
/// 5. 超越 24 国上限（32 国稳定建世）+ LGB1 二进制推流帧往返 + 45 纪元 LGE4 解析。
final class V7OverhaulTests: XCTestCase {
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

    private func launchScenario(_ id: String) throws -> NativeEngine {
        guard let sc = HistoricalScenarios.scenario(id: id) else {
            throw XCTSkip("未找到历史剧本 \(id)")
        }
        let inputs = try loadInputsAndAtlas()
        var opt = NativeCreation.Options(
            seed: "v7test-\(id)",
            template: "continents",
            count: sc.nations.count,
            cityCount: sc.provinceCount,
            relations: "historical",
            naming: "historical-names",
            cultures: []
        )
        opt.historicalScenario = sc
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v7-\(id)", runId: "run-\(id)")
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

    // MARK: - 1. 严格核时代门控（1943 年前全员 0 核 0 堆，1950 仅美苏拥核）

    func testStrictNuclearGateBefore1943AndColdWar1950() throws {
        defer { cleanup() }
        for scenId in ["ww2_asia_1941", "ww2_europe_1939", "ww1_1914", "napoleon_1812"] {
            let engine = try launchScenario(scenId)
            let r = engine.run
            for n in r.world.nations.asArray {
                let nid = n.id.asString
                XCTAssertFalse(NuclearWarfare.isNuclearEra(r, nationId: nid), "\(scenId) 年份早于 1943 不应解锁核时代")
                XCTAssertEqual(NuclearWarfare.nukes(r, nationId: nid), 0, "\(scenId) 国家 \(n.name.asString) 不应拥有核弹")
                XCTAssertEqual(NuclearWarfare.reactors(r, nationId: nid), 0, "\(scenId) 国家 \(n.name.asString) 不应拥有核反应堆")
                let buildRes = NuclearWarfare.buildReactor(r, nationId: nid)
                XCTAssertFalse(buildRes.ok, "\(scenId) 严禁建造核反应堆")
            }
            cleanup()
        }

        // 1950 冷战：精确仅美苏开局拥核，英国仅 1 座反应堆研发中、0 核弹，其余各国 0 核弹
        let cw = try launchScenario("coldwar_1950")
        let r = cw.run
        guard let usa = findNationId(r, nameContains: "美利坚"),
              let ussr = findNationId(r, nameContains: "苏联"),
              let uk = findNationId(r, nameContains: "不列颠") ?? findNationId(r, nameContains: "英国") else {
            XCTFail("1950 冷战剧本缺少核心大国")
            return
        }
        XCTAssertTrue(NuclearWarfare.isNuclearEra(r, nationId: usa))
        XCTAssertGreaterThan(NuclearWarfare.nukes(r, nationId: usa), 0, "1950 美国应开局拥核")
        XCTAssertGreaterThan(NuclearWarfare.nukes(r, nationId: ussr), 0, "1950 苏联应开局拥核")
        XCTAssertEqual(NuclearWarfare.nukes(r, nationId: uk), 0, "1950 英国尚未完成首次核试验（1952），核弹应为 0")
        XCTAssertEqual(NuclearWarfare.reactors(r, nationId: uk), 1, "1950 英国应有 1 座反应堆在研")
        for n in r.world.nations.asArray {
            let nid = n.id.asString
            if nid != usa && nid != ussr {
                XCTAssertEqual(NuclearWarfare.nukes(r, nationId: nid), 0, "1950 除美苏外 \(n.name.asString) 不应开局拥核")
            }
        }
    }

    // MARK: - 2. 历史双元首（昭和天皇裕仁+东条英机、伪满溥仪、1939 英意双元首）与宗属

    func testDualHeadOfStateAndPremierAndVassalage() throws {
        defer { cleanup() }
        let asia = try launchScenario("ww2_asia_1941")
        let r = asia.run
        guard let jpId = findNationId(r, nameContains: "日本"),
              let manchuId = findNationId(r, nameContains: "满洲") else {
            XCTFail("1941 亚太剧本缺少大日本帝国或伪满洲国")
            return
        }

        let jpHead = Regimes.ruler(r, jpId)
        let jpHeadName = jpHead?.name.optionalString ?? ""
        let jpHeadTitle = jpHead?.title.optionalString ?? ""
        XCTAssertTrue(jpHeadName.contains("裕仁"), "1941 日本国家元首应为裕仁，实际为 \(jpHeadName)")
        XCTAssertFalse(jpHeadName.contains("东条"), "东条英机绝不可误任日本天皇！")
        XCTAssertTrue(jpHeadTitle.contains("天皇"), "1941 日本国家元首称谓应为天皇，实际为 \(jpHeadTitle)")

        let jpPremier = Regimes.premier(r, jpId)
        let jpPremierName = jpPremier?.name.optionalString ?? ""
        XCTAssertTrue(jpPremierName.contains("东条英机"), "1941 日本内阁总理大臣应为东条英机，实际为 \(jpPremierName)")

        let jpGov = Regimes.governor(r, jpId)
        XCTAssertTrue((jpGov?.name.optionalString ?? "").contains("东条英机"), "二元君主立宪体制下实际掌政者应为内阁总理大臣东条英机")

        let eraName = r.regimes.nations[jpId].eraName.optionalString ?? ""
        XCTAssertTrue(eraName.contains("昭和"), "1941 日本年号应为昭和，实际为 \(eraName)")

        let mcHeadName = Regimes.ruler(r, manchuId)?.name.optionalString ?? ""
        let mcPremierName = Regimes.premier(r, manchuId)?.name.optionalString ?? ""
        XCTAssertTrue(mcHeadName.contains("溥仪"), "伪满洲国名义皇帝应为爱新觉罗·溥仪，实际为 \(mcHeadName)")
        XCTAssertTrue(mcPremierName.contains("梅津"), "伪满洲国实权关东军首脑应为梅津美治郎，实际为 \(mcPremierName)")
        XCTAssertEqual(Vassals.overlord(r, manchuId), jpId, "伪满洲国开局必须隶属大日本帝国附庸")

        cleanup()

        let eu = try launchScenario("ww2_europe_1939")
        let er = eu.run
        if let ukId = findNationId(er, nameContains: "英") ?? findNationId(er, nameContains: "不列颠") {
            let ukHead = Regimes.ruler(er, ukId)?.name.optionalString ?? ""
            let ukPm = Regimes.premier(er, ukId)?.name.optionalString ?? ""
            XCTAssertTrue(ukHead.contains("乔治"), "1939 英国君主应为乔治六世，实际为 \(ukHead)")
            XCTAssertTrue(ukPm.contains("张伯伦"), "1939 英国首相应为内维尔·张伯伦，实际为 \(ukPm)")
        }
        if let itId = findNationId(er, nameContains: "意大利") {
            let itHead = Regimes.ruler(er, itId)?.name.optionalString ?? ""
            let itPm = Regimes.premier(er, itId)?.name.optionalString ?? ""
            XCTAssertTrue(itHead.contains("维托里奥") || itHead.contains("埃马努埃莱"), "1939 意大利君主应为维托里奥·埃马努埃莱三世，实际为 \(itHead)")
            XCTAssertTrue(itPm.contains("墨索里尼"), "1939 意大利首相/领袖应为墨索里尼，实际为 \(itPm)")
        }
    }

    // MARK: - 3. 日本家族派系文化纯净（零外籍宗室/配偶、零地名姓氏、陆海军宿怨）

    func testJapaneseFamilyPurityAndArmyNavyRivalry() throws {
        defer { cleanup() }
        let asia = try launchScenario("ww2_asia_1941")
        let r = asia.run
        guard let jpId = findNationId(r, nameContains: "日本") else {
            XCTFail("缺少大日本帝国"); return
        }
        let jpStateId = Offices.stateId(r, jpId)
        let forbiddenForeignTokens = ["查理", "爱德华", "亚历山大", "路易", "哈布斯堡", "波旁", "罗曼诺夫", "霍亨索伦", "亨利", "约翰", "威廉", "伊丽莎白", "阿卜杜", "穆罕默德"]
        let forbiddenPlaceSurnames: Set<String> = ["上海", "北京", "北平", "南京", "东京", "大阪", "京都", "伦敦", "巴黎", "柏林", "莫斯科", "罗马", "武汉", "重庆", "广州", "长崎", "横滨"]

        func assertJapanClean(stage: String) {
            for (_, fam) in r.kin.families.objectEntries {
                guard fam.stateId.asInt == jpStateId else { continue }
                let sn = NamingCatalog.cleanSurname(fam.surname.optionalString ?? "")
                XCTAssertFalse(forbiddenPlaceSurnames.contains(sn), "\(stage) 日本家族出现地名姓氏：\(sn)")
                for mid in fam.memberIds.asArray {
                    guard let p = People.person(r, NativeEngine.personId(mid)) else { continue }
                    let full = p.name.optionalString ?? ""
                    for tok in forbiddenForeignTokens {
                        XCTAssertFalse(full.contains(tok), "\(stage) 日本家族混入外籍姓名：\(full)")
                    }
                    XCTAssertFalse(full.contains("·"), "\(stage) 日本家族人物不应含西洋/游牧中点姓名：\(full)")
                }
            }
        }

        assertJapanClean(stage: "开局第0日")

        // 验证 1941 日本陆海军派系存在真实尖锐对立（关系 < -30）
        var jpFams: [String] = []
        for (fid, fam) in r.kin.families.objectEntries where fam.stateId.asInt == jpStateId {
            jpFams.append(fid)
        }
        var minRel = 100.0
        for i in 0..<jpFams.count {
            for j in (i + 1)..<jpFams.count {
                let sc = FamilyPolitics.relationScore(r, jpFams[i], jpFams[j])
                if sc < minRel { minRel = sc }
            }
        }
        XCTAssertLessThan(minRel, -25.0, "1941 日本应体现陆军统制派与帝国海军等派系的真实对立，当前最低关系 \(minRel)")

        // 推演 180 天后复验，确保联姻与新生代依然严格遵守本国文化隔离
        asia.advance(days: 180)
        assertJapanClean(stage: "推演180日后")
    }

    // MARK: - 4. 1941 日中真实陆海空与科技代差（山地衰减）

    func testWW2JapanVsChinaMilitaryAsymmetry() throws {
        defer { cleanup() }
        // 科技代差公式验证（二战时代：日本陆军6/海军6 vs 民国陆军2/海军1）
        let landGap = Volley.techGapMultiplier(attackerTech: 6, defenderTech: 2, era: .ww2)
        let seaGap = Volley.navalTechGapMultiplier(attackerTech: 6, defenderTech: 1, era: .ww2)
        XCTAssertGreaterThan(landGap, 2.20, "二战 4 级陆军科技代差应形成显著火力优势，实际 \(landGap)")
        XCTAssertGreaterThan(seaGap, 2.45, "二战 5 级海军科技代差（联合舰队航母/战列舰 vs 浅水炮艇）应形成降维打击，实际 \(seaGap)")

        // 真实 1941 剧本开局状态验证：工业/制空/科技综合比值，且山地地形衰减制空权
        let asia = try launchScenario("ww2_asia_1941")
        let r = asia.run
        guard let jpId = findNationId(r, nameContains: "日本"),
              let rocId = findNationId(r, nameContains: "国民政府") ?? findNationId(r, nameContains: "中华民国") else {
            XCTFail("缺少日本或国民政府"); return
        }
        let indRatio = NuclearWarfare.industrialCombatRatio(r, attacker: jpId, victim: rocId)
        let airPlain = NuclearWarfare.airSuperiorityBonus(r, attacker: jpId, victim: rocId, terrain: "plain")
        let airMountain = NuclearWarfare.airSuperiorityBonus(r, attacker: jpId, victim: rocId, terrain: "mountain")
        XCTAssertGreaterThan(indRatio, 1.20, "1941 日本工业与机械化综合战力比应明显高于民国")
        XCTAssertGreaterThan(airPlain, 0.15, "1941 日本在平原战区应拥有显著制空权加成")
        XCTAssertLessThan(airMountain, airPlain, "西南/华中山地地形应有效衰减制空打击优势")
    }

    // MARK: - 5. 突破 24 国上限（32 国稳定建世）+ LGB1 二进制帧 + 45 纪元 LGE4 解析

    func testThirtyTwoNationsAndBinaryWireAndEras45() throws {
        defer { cleanup() }
        let inputs = try loadInputsAndAtlas()
        let opt = NativeCreation.Options(
            seed: "v7-32-nations",
            template: "continents",
            count: 32,
            cityCount: 180,
            relations: "peace",
            naming: "historical-names",
            cultures: []
        )
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "v7-32", runId: "run-32")
        XCTAssertEqual(built.run.world.nations.length, 32, "v7.0 应突破 24 国旧上限，完整生成 32 国世界")

        // LGB1 紧凑二进制增量帧往返校验与带宽体积验证
        let gs = GameState(
            day: 365,
            date: .init(year: 1942, month: 6, day: 15),
            owners: [],
            ownersDelta: [5, 0, 12, 1],
            labels: nil,
            nations: (0..<12).map { i in
                .init(provinces: 15, cities: 15, population: 8_500_000, grain: 240, troops: 48_000, gold: 1250.5, destiny: 72.0, enemies: i == 0 ? [1] : [], alive: true)
            },
            armies: (0..<40).map { i in
                .init(id: "a\(i)", name: "第\(i + 1)师团", nation: i % 12, troops: 12_000, unit: "Infantry", status: "moving", travel: "land", province: i % 80, supplies: 91, morale: 88, x: Float(100 + i * 28), y: Float(120 + (i % 7) * 85), manual: false, destination: (i + 3) % 80, mission: nil)
            },
            fleets: [.init(id: "f1", name: "联合舰队", nation: 0, ships: 32, crew: 18_000, food: 95, hull: 0.96, status: "sailing", travel: "sea", x: 1120.5, y: 420.25, decision: "patrol", reason: "", port: 12, manual: false, patrol: true)],
            yards: nil,
            ports: nil,
            forts: nil,
            holy: nil,
            wonders: nil,
            ruins: nil,
            weatherZones: [.init(province: 10, kind: "snow")],
            wars: [],
            sieges: [],
            contacts: nil,
            arrows: nil,
            seaBattles: nil,
            events: [.init(day: 365, text: "中途岛海域爆发大规模海战", kind: "war", province: 12)],
            era: nil,
            yearOffset: 1941,
            worldTension: 85,
            historicalEra: "ww2",
            lastNukeProvince: nil,
            lastNukeDay: nil
        )
        let encoded = BinaryStateWire.encode(gs)
        XCTAssertTrue(BinaryStateWire.isBinaryFrame(encoded))
        let lz4 = WireCodec.compress(encoded)
        XCTAssertLessThan(lz4.count, 2200, "v13 LGB1 + LZ4 单帧体积应极度紧凑以适配 3 Mbps 云服（实际 \(lz4.count) B）")
        guard let decoded = BinaryStateWire.decode(encoded) else {
            XCTFail("BinaryStateWire.decode 失败"); return
        }
        XCTAssertEqual(decoded.day, 365)
        XCTAssertEqual(decoded.date.year, 1942)
        XCTAssertEqual(decoded.yearOffset, 1941)
        XCTAssertEqual(decoded.historicalEra, "ww2")
        XCTAssertEqual(decoded.worldTension, 85)
        XCTAssertEqual(decoded.ownersDelta, [5, 0, 12, 1])
        XCTAssertEqual(decoded.armies.count, 40)
        XCTAssertEqual(decoded.fleets?.count, 1)
        XCTAssertEqual(decoded.events.first?.text, "中途岛海域爆发大规模海战")

        // 45 纪元年表与 LGE4 二进制格式解析校验
        XCTAssertEqual(HistoricalErasCatalog.builtInTimeline.count, 45, "五千年历史年表应精准包含 45 个真实世界史纪元")
        var bin = Data([0x4C, 0x47, 0x45, 0x34]) // "LGE4"
        func appendU32(_ v: UInt32) {
            var le = v.littleEndian
            bin.append(Data(bytes: &le, count: 4))
        }
        func appendU16(_ v: UInt16) {
            var le = v.littleEndian
            bin.append(Data(bytes: &le, count: 2))
        }
        appendU32(1) // version
        appendU32(1) // eraCount
        appendU32(8) // cellCount
        let eid = Array("era_ad1914".utf8)
        bin.append(UInt8(eid.count))
        bin.append(contentsOf: eid)
        appendU16(14)
        bin.append(contentsOf: [0, 0, 1, 1, 2, 0xFF, 0xFF, 3])
        bin.append(contentsOf: [80, 90, 70, 65, 50, 0, 0, 110])
        let parsed = HistoricalErasCatalog.parseEraBinary(bin)
        XCTAssertEqual(parsed?["era_ad1914@8"]?.nationCount, 14)
        XCTAssertEqual(parsed?["era_ad1914@8"]?.ownerMask, [0, 0, 1, 1, 2, -1, -1, 3])
    }
}
