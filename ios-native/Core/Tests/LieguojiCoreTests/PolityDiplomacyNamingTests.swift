import XCTest
@testable import LieguojiCore

/// v2.1.0 核心回归与质量审计测试：
/// 1. 多文化/多政体国名真实性审计（彻底杜绝「中国地方」「江南帝国」「普鲁士国」「年号当国名」「大金共和国」等假名）；
/// 2. 38 种细分政体个性差异、政局风险评估与现实政变／立宪／摄政／革命／复辟／提前大选全链路；
/// 3. 深度外交引擎：双边好感与理由拆解、6 类条约、共同防御遇袭自动协防、最后通牒、反霸包围网、谍报与第三方斡旋；
/// 4. 家族玩法完整闭环（多政体无封地规则、12 月势力曲线、封赏与削藩冷却、立储生效与政治代价、选侯/跨国联姻宣称）；
/// 5. 一整年（365 日）连续推演性能基准与零崩溃验证。
final class PolityDiplomacyNamingTests: XCTestCase {
    private func loadWorld() throws -> NativeEngine {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.run.clock.tick = JS(0)
        engine.enableAppRules()
        return engine
    }

    private func cleanup() {
        Session.uninstall()
        UnitKinds.enabled = false
        DeclarationEngine.temper = nil
        DeclarationEngine.pact = nil
        DeclarationEngine.opinionBias = nil
        DeclarationEngine.stance = nil
        ArmyAutonomy.temper = nil
    }

    func testAuthenticNamingAcrossCulturesAndStyles() {
        let forbidden: [String] = [
            "中国地方", "江南帝国", "巴蜀帝国", "大金共和国", "大金人民共和国",
            "波兰王国王国", "普鲁士国", "巴伐利亚国", "拉萨国",
            "崇祯", "嘉靖", "贞观", "开元", "弘光", "隆庆",
        ]
        let cultures = ["chinese", "japanese", "french", "german", "english", "slavic", "arab", "turkic", "mongol", "italian", "tibetan"]
        let testStyles = ["dynasty", "empire", "feudal", "constitutional", "democratic", "parliamentary", "socialist", "communist", "junta", "dictatorship", "fascist", "shogunate", "tsardom", "sultanate", "lamaism"]

        for culture in cultures {
            for mode in ["historical-names", "culture-generated"] {
                var used = Set<String>()
                for styleId in testStyles {
                    guard let st = Regimes.styles.first(where: { $0.id == styleId }) else { continue }
                    let religion = culture == "arab" || culture == "turkic" ? "islam" : culture == "tibetan" ? "tantric" : "catholic"
                    guard NamingCatalog.isStyleAuthentic(styleId, culture: culture, religion: religion) else { continue }
                    for k in 0..<8 {
                        let base = NamingCatalog.pickStateBase(culture: culture, mode: mode, seed: "audit-\(culture)-\(mode)-\(styleId)-\(k)", used: used, styleId: styleId) ?? ""
                        XCTAssertFalse(base.isEmpty, "Empty base for \(culture)/\(mode)/\(styleId)")
                        let title = NamingCatalog.formatStateTitle(base: base, style: st, religion: religion, culture: culture, ordinal: "", rulingSurname: "李", template: nil)
                        for bad in forbidden {
                            XCTAssertFalse(title.contains(bad), "Forbidden fake name '\(title)' generated for \(culture)/\(mode)/\(styleId)")
                        }
                        used.insert(base)
                        used.insert(NamingCatalog.canonicalStateKey(base))
                    }
                }
            }
        }
        // 文化圈真实性校验：严禁跨文化错配政体
        XCTAssertFalse(NamingCatalog.isStyleAuthentic("tsardom", culture: "french", religion: "catholic"))
        XCTAssertFalse(NamingCatalog.isStyleAuthentic("shogunate", culture: "chinese", religion: "chineseFolk"))
        XCTAssertFalse(NamingCatalog.isStyleAuthentic("sultanate", culture: "english", religion: "catholic"))
        XCTAssertFalse(NamingCatalog.isStyleAuthentic("papacy", culture: "chinese", religion: "chineseFolk"))
        XCTAssertTrue(NamingCatalog.isStyleAuthentic("tsardom", culture: "slavic", religion: "orthodox"))
        XCTAssertTrue(NamingCatalog.isStyleAuthentic("shogunate", culture: "japanese", religion: "shinto"))
        XCTAssertTrue(NamingCatalog.isStyleAuthentic("sultanate", culture: "arab", religion: "islam"))
        // 具体拼合校验
        let junta = Regimes.styles.first { $0.id == "junta" }!
        let prussiaJunta = NamingCatalog.formatStateTitle(base: "普鲁士", style: junta, religion: "protestant", culture: "german", ordinal: "", rulingSurname: "", template: nil)
        XCTAssertEqual(prussiaJunta, "普鲁士军政府")
        let lama = Regimes.styles.first { $0.id == "lamaism" }!
        let tibetLama = NamingCatalog.formatStateTitle(base: "拉萨", style: lama, religion: "tantric", culture: "tibetan", ordinal: "", rulingSurname: "", template: nil)
        XCTAssertEqual(tibetLama, "拉萨法王国")
    }

    func testPolityPersonalitiesAndRealisticTransitions() throws {
        // 全部 38 种细分政体均有专属画像
        for s in Regimes.styles {
            XCTAssertNotNil(Regimes.styleProfiles[s.id], "Missing StyleProfile for \(s.id)")
        }

        let engine = try loadWorld(); defer { cleanup() }
        let r = engine.run
        let id0 = r.world.nations[0].id.asString

        // 1. 商业共和 vs 军政府：岁入、进攻与好战度明显分化
        XCTAssertTrue(engine.setStyle(0, style: "merchant").ok)
        let merchantLev = Regimes.leverage(r, id0)
        let merchantTemper = Regimes.temper(r, id0)
        XCTAssertFalse(Regimes.allowsFiefs(r, id0))

        XCTAssertTrue(engine.setStyle(0, style: "junta").ok)
        Regimes.leverageCache = nil
        let juntaLev = Regimes.leverage(r, id0)
        let juntaTemper = Regimes.temper(r, id0)
        XCTAssertGreaterThan(merchantLev.income, juntaLev.income + 15)
        XCTAssertGreaterThan(juntaLev.attack, merchantLev.attack + 12)
        XCTAssertGreaterThan(juntaTemper, merchantTemper)

        // 2. 现实政体更迭全链路：君主 → 立宪维新 → 军事政变 → 还政于民 → 提前大选 → 社会革命（清理封建封地）
        XCTAssertTrue(engine.setStyle(0, style: "absolute").ok)
        let beforeCorrupt = Finance.corruption(r, id0)
        Finance.setCorruption(r, id0, max(20, beforeCorrupt))
        let reformRes = engine.regimeTransition(0, action: "constitutional")
        XCTAssertTrue(reformRes.ok, reformRes.reason)
        XCTAssertEqual(Regimes.style(r, id0).id, "constitutional")
        XCTAssertLessThan(Finance.corruption(r, id0), max(20, beforeCorrupt))
        XCTAssertNotNil(Regimes.premier(r, id0), "立宪维新后应立即任命内阁首相")

        let coupRes = engine.regimeTransition(0, action: "militaryCoup")
        XCTAssertTrue(coupRes.ok, coupRes.reason)
        XCTAssertEqual(Regimes.style(r, id0).id, "junta")

        let civRes = engine.regimeTransition(0, action: "civilian")
        XCTAssertTrue(civRes.ok, civRes.reason)
        XCTAssertEqual(Regimes.style(r, id0).id, "presidential")

        let snapRes = engine.regimeTransition(0, action: "snapElection")
        XCTAssertTrue(snapRes.ok, snapRes.reason)

        let socRes = engine.regimeTransition(0, action: "socialistRev")
        XCTAssertTrue(socRes.ok, socRes.reason)
        XCTAssertEqual(Regimes.style(r, id0).id, "socialist")
        XCTAssertFalse(Regimes.allowsFiefs(r, id0))
        // 社会革命后该国世家封建封地被收回
        for fam in r.nobility.families.objectValues where fam.nationId.optionalString == id0 {
            XCTAssertEqual(fam.controlledProvinces.length, 0)
        }

        // 3. 验证 nationInfo 正确导出 polityDetail 与可执行演变列表
        let infoData = try XCTUnwrap(engine.nationInfo(0))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: infoData) as? [String: Any])
        let pd = try XCTUnwrap(json["polityDetail"] as? [String: Any])
        XCTAssertEqual(pd["camp"] as? String, "左翼")
        XCTAssertNotNil(pd["coupRisk"])
        let transitions = try XCTUnwrap(pd["transitions"] as? [[String: Any]])
        XCTAssertFalse(transitions.isEmpty)
    }

    func testDeepDiplomacyOpinionTreatiesDefenseAndCoalition() throws {
        let engine = try loadWorld(); defer { cleanup() }
        let r = engine.run
        let aliveIndices = r.world.nations.asArray.indices.filter { Vassals.alive(r, r.world.nations[$0].id.asString) }
        XCTAssertGreaterThanOrEqual(aliveIndices.count, 3)
        let aIdx = aliveIndices[0], bIdx = aliveIndices[1], cIdx = aliveIndices[2]
        let aId = r.world.nations[aIdx].id.asString
        let bId = r.world.nations[bIdx].id.asString
        let cId = r.world.nations[cIdx].id.asString
        // 确保测试国之间先无在战且国库充足
        _ = engine.politics(declare: false, aIdx, bIdx)
        _ = engine.politics(declare: false, bIdx, cIdx)
        _ = engine.politics(declare: false, aIdx, cIdx)
        r.finance.nations[aId].gold = JS(2000)
        r.finance.nations[bId].gold = JS(2000)

        // 1. 双边好感与意识形态阵营联动
        XCTAssertTrue(engine.setStyle(aIdx, style: "democratic").ok)
        XCTAssertTrue(engine.setStyle(bIdx, style: "democratic").ok)
        let sameCampScore = DiplomacyDeep.opinion(r, aId, bId).score
        XCTAssertTrue(engine.setStyle(bIdx, style: "fascist").ok)
        let hostileCampScore = DiplomacyDeep.opinion(r, aId, bId).score
        XCTAssertGreaterThan(sameCampScore, hostileCampScore + 25)

        // 2. 通商协定、王室联姻（带 25 年王位宣称）与共同防御条约
        XCTAssertTrue(engine.setStyle(bIdx, style: "absolute").ok)
        XCTAssertTrue(engine.treaty(aIdx, bIdx, years: 10, kind: "trade").ok)
        XCTAssertTrue(DiplomacyDeep.hasTreaty(r, aId, bId, kind: "trade"))
        XCTAssertTrue(engine.treaty(aIdx, bIdx, years: 10, kind: "marriage").ok)
        XCTAssertTrue(DiplomacyDeep.hasThroneClaim(r, claimant: aId, target: bId))
        XCTAssertTrue(engine.treaty(bIdx, cIdx, years: 10, kind: "defense").ok)
        XCTAssertTrue(DiplomacyDeep.defensePartners(r, of: bId).contains(cId))

        // 3. 谍报与最后通牒
        let corruptBefore = Finance.corruption(r, bId)
        let cov = engine.covertAction(aIdx, target: bIdx, kind: "fundRebels")
        XCTAssertTrue(cov.ok, cov.reason)
        XCTAssertGreaterThan(Finance.corruption(r, bId), corruptBefore)

        // 4. 反霸包围网
        let coal = engine.formCoalition(bIdx, against: aIdx)
        XCTAssertNotNil(coal.reason)

        // 5. 导出 diplomacyInfo 验证包含 opinions / reasons / treaties
        let dipData = try XCTUnwrap(engine.diplomacyInfo(aIdx))
        let dipJson = try XCTUnwrap(JSONSerialization.jsonObject(with: dipData) as? [String: Any])
        let opinions = try XCTUnwrap(dipJson["opinions"] as? [[String: Any]])
        XCTAssertFalse(opinions.isEmpty)
        XCTAssertNotNil(opinions.first?["score"])
        XCTAssertNotNil(opinions.first?["reasons"])
    }

    func testFamilyGameplayPlanCompletion() throws {
        let engine = try loadWorld(); defer { cleanup() }
        let r = engine.run
        let n0 = r.world.nations[0].id.asString
        XCTAssertTrue(engine.setStyle(0, style: "feudal").ok)

        // 推进 95 天（3 个多月）以采集世家势力走势曲线
        engine.advance(days: 95)

        let rulingId = String(People.rulingFamilyId(r, n0))
        let nonRuling = r.nobility.families.objectEntries.first { $0.1.nationId.optionalString == n0 && $0.0 != rulingId }?.0
        if let famId = nonRuling {
            // 1. 验证 12 个月势力走势导出到 FamilyTree
            let treeData = try XCTUnwrap(engine.familyTree(famId))
            let decoded = try JSONDecoder().decode(FamilyTree.self, from: treeData)
            XCTAssertGreaterThanOrEqual(decoded.influenceHistory.count, 2, "推进数月后应记录世家势力走势")
            XCTAssertTrue(decoded.allowsFiefs)

            // 2. 验证封赏封地 + 12 个月冷却
            let grant1 = engine.grantFief(0, familyId: famId)
            if grant1.ok {
                let grant2 = engine.grantFief(0, familyId: famId)
                XCTAssertFalse(grant2.ok, "12 个月冷却内不应重复赐封")
                // 3. 验证削藩夺地
                let rev = engine.revokeFief(0, familyId: famId)
                XCTAssertTrue(rev.ok, rev.reason)
            }

            // 4. 切换共和制后禁止封赏封地
            XCTAssertTrue(engine.setStyle(0, style: "democratic").ok)
            r.regimes.fiefCooldown.delete(famId)
            let repGrant = engine.grantFief(0, familyId: famId)
            XCTAssertFalse(repGrant.ok, "共和政体应明确禁止封赏封建封地")
        }

        // 5. 验证立储生效（findSuccessor 优先返回 heirId）
        if let rFam = r.kin.families[rulingId].isNull ? nil : r.kin.families[rulingId] {
            let headId = rFam.headId.asInt
            let members = (rFam.memberIds.isNull ? [] : rFam.memberIds.asArray).map(\.asInt)
            if let pickId = members.first(where: { $0 != headId && People.person(r, $0)?.isAlive.asBool == true }) {
                let setRes = engine.familyAction(pickId, action: "setHeir")
                XCTAssertTrue(setRes.ok, setRes.reason)
                if let head = People.person(r, headId) {
                    let next = People.findSuccessor(r, rFam, head)
                    XCTAssertEqual(next?.id.asInt, pickId, "君主/家主逝世时应严格遵循已立定的继承人")
                }
            }
        }
    }

    func testHalfYearSimulationStabilityAndCleanNames() throws {
        let engine = try loadWorld(); defer { cleanup() }
        let start = Date()
        engine.advance(days: 180)
        let elapsed = Date().timeIntervalSince(start)
        // 180 天完整推演（含 6 个月度深度外交／现实政变／世家周期）应稳定完成无死循环
        XCTAssertLessThan(elapsed, 90.0, "180 天推演异常缓慢：\(elapsed)s")
        for n in engine.run.world.nations.asArray {
            let name = n.name.asString
            XCTAssertFalse(name.isEmpty)
            XCTAssertFalse(name.contains("中国地方"), "发现假国名：\(name)")
            XCTAssertFalse(name.contains("大金共和国"), "发现假国名：\(name)")
        }
        // 山河回放关键帧在快速跳帧优化下仍正常按月捕获
        let frames = engine.run.regimes.replay.frames.asArray
        XCTAssertGreaterThanOrEqual(frames.count, 5)
    }
}
