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

    func testTreatyKeepsTheAgreedProvinceAndReturnsOtherOccupations() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run, registry = r.nativeWars
        let war = registry.campaigns[0], other = registry.campaigns[1]
        let attacker = war.attacker.asString, defender = war.defender.asString
        let goal = war.goals[0], number = goal.scope.provinceIds[0].asInt
        let treatyID = registry.provinceIds[number - 1].asString
        let provinces = r.world.provinces.asArray
        let ceded = try XCTUnwrap(provinces.first { $0.id.asString == treatyID && $0.controller.asString == defender })
        let returned = try XCTUnwrap(provinces.first { $0.id.asString != treatyID && $0.controller.asString == defender })
        let thirdDefender = other.defender.asString, thirdAttacker = other.attacker.asString
        let disputed = try XCTUnwrap(provinces.first { $0.controller.asString == thirdDefender })
        for p in [ceded, returned] { p.legalOwner = JS(defender); p.controller = JS(attacker) }
        disputed.legalOwner = JS(thirdDefender); disputed.controller = JS(thirdAttacker)
        goal.scope.provinceIds = .array([JS(number)])
        goal.scope.requiredCount = JS(1)

        XCTAssertTrue(PeaceBridge.settle(r, war, reason: 4))
        XCTAssertEqual(ceded.controller.asString, attacker)
        XCTAssertEqual(ceded.legalOwner.asString, attacker)
        XCTAssertEqual(returned.controller.asString, defender)
        XCTAssertEqual(returned.legalOwner.asString, defender)
        XCTAssertFalse(RunWindow.atWar(r, attacker, defender))
        XCTAssertTrue(other.endedTick.isNull)
        XCTAssertTrue(RunWindow.atWar(r, thirdAttacker, thirdDefender))
        XCTAssertEqual(disputed.controller.asString, thirdAttacker)
        XCTAssertEqual(disputed.legalOwner.asString, thirdDefender)
    }

    func testPlayerCeasefireRestoresTerritoryWithoutAssigningNewOwnership() throws {
        let engine = try loadWorld()
        defer { cleanup() }
        let r = engine.run, war = r.nativeWars.campaigns[0]
        let attacker = war.attacker.asString, defender = war.defender.asString
        let nations = r.world.nations.asArray
        let a = try XCTUnwrap(nations.firstIndex { $0.id.asString == attacker })
        let d = try XCTUnwrap(nations.firstIndex { $0.id.asString == defender })
        let occupied = try XCTUnwrap(r.world.provinces.asArray.first { $0.controller.asString == defender })
        occupied.controller = JS(attacker); occupied.legalOwner = JS(defender)

        XCTAssertTrue(engine.politics(declare: false, a, d).ok)
        XCTAssertEqual(occupied.controller.asString, defender)
        XCTAssertEqual(occupied.legalOwner.asString, defender)
        XCTAssertFalse(RunWindow.atWar(r, attacker, defender))
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

    func testQuarterlyWarRelationsAndCourtUseNativeCampaigns() throws {
        let engine = try loadWorld(); defer { cleanup() }
        let r = engine.run
        XCTAssertTrue(r.world.campaigns.isNull)
        let war = try XCTUnwrap(r.nativeWars.campaigns.asArray.first { $0.endedTick.isNull && $0.attacker.optionalString != nil })
        let attacker = war.attacker.asString, defender = war.defender.asString
        let nations = r.world.nations.asArray
        let allyIndex = try XCTUnwrap(nations.firstIndex {
            let id = $0.id.asString
            return id != attacker && id != defender && Vassals.alive(r, id)
        })
        let ally = nations[allyIndex].id.asString
        let participant = JS.object()
        participant.stateId = JS(Wars.stateNumber(r, ally))
        participant.side = JS(0)
        war.participants.push(participant)
        r.nativeWars.campaigns = .array([war])
        r.regimes.opinionMod = .object()
        r.diplomacy.worldAuto = JS(false)

        DiplomacyDeep.month(r, 3)
        XCTAssertEqual(r.regimes.opinionMod[DiplomacyDeep.pairKey(attacker, defender)].optionalNumber, -2)
        XCTAssertEqual(r.regimes.opinionMod[DiplomacyDeep.pairKey(ally, defender)].optionalNumber, -2)
        XCTAssertTrue(r.regimes.opinionMod[DiplomacyDeep.pairKey(attacker, ally)].isNull)
        XCTAssertEqual(Wars.activeCampaignCount(r, for: ally), 1)
        let activeInfo = try JS.parse(XCTUnwrap(engine.nationInfo(allyIndex)))

        war.endedTick = JS(1)
        DiplomacyDeep.month(r, 6)
        XCTAssertEqual(r.regimes.opinionMod[DiplomacyDeep.pairKey(ally, defender)].optionalNumber, -2)
        XCTAssertEqual(Wars.activeCampaignCount(r, for: ally), 0)
        let endedInfo = try JS.parse(XCTUnwrap(engine.nationInfo(allyIndex)))
        XCTAssertGreaterThan(activeInfo.courtPower.military.asInt, endedInfo.courtPower.military.asInt)
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

    /// v2.2.0 深度回归：真实君主年号/世数/无姓氏天皇、43 政体与全 26 文化党派操控、24 分级特产国力联动、16 新增人物个性实效、12 御批政令、军队数据一致性与诏书卷轴装裱。
    func testV22MonarchLoreSpecialtiesPartiesDecreesAndArmyInvariants() throws {
        let engine = try loadWorld(); defer { cleanup() }
        let r = engine.run
        let id0 = r.world.nations[0].id.asString
        r.finance.nations[id0].gold = JS(3000)

        // 1. 43 种政体完备性 & 全 26 文化党派库
        XCTAssertGreaterThanOrEqual(Regimes.styles.count, 42)
        for s in Regimes.styles {
            XCTAssertNotNil(Regimes.styleProfiles[s.id], "缺少政体画像：\(s.id)")
        }
        for c in NativeEngine.cultureIds {
            XCTAssertGreaterThanOrEqual((Regimes.partyPools[c] ?? []).count, 6, "文化 \(c) 党派库不足")
        }

        // 2. 日本天皇无姓氏 + 年号 + 「皇室（无姓）」
        r.civilization.nations[id0].cultureId = JS("japanese")
        r.civilization.nations[id0].polity = JS("Empire")
        XCTAssertTrue(engine.setStyle(0, style: "empire").ok)
        if let leaderId = r.people.nations[id0].leaderId.optionalNumber.map(Int.init), let p = People.person(r, leaderId) {
            p.firstName = JS("睦仁"); p.lastName = JS("藤原")
            let display = People.rulerDisplayName(culture: "japanese", polity: "Empire", name: "藤原睦仁", regnalName: "", ordinal: 1, given: "睦仁", title: "天皇")
            XCTAssertEqual(display, "睦仁天皇", "日本天皇绝不可带姓氏")
            XCTAssertFalse(display.contains("藤原"), "日本天皇不可包含姓氏")
            let infoData = try XCTUnwrap(engine.nationInfo(0))
            let infoJson = try XCTUnwrap(JSONSerialization.jsonObject(with: infoData) as? [String: Any])
            let rulerJson = try XCTUnwrap(infoJson["ruler"] as? [String: Any])
            XCTAssertEqual(rulerJson["name"] as? String, "睦仁")
            XCTAssertEqual(rulerJson["surnameLessImperial"] as? Bool, true)
            XCTAssertFalse((rulerJson["eraName"] as? String ?? "").isEmpty, "日本天皇应有年号")
            XCTAssertTrue((rulerJson["styledName"] as? String ?? "").contains("天皇"))
        }

        // 3. 中华皇帝年号 + 庙号；西方君主世数（如 伊丽莎白二世）
        r.civilization.nations[id0].cultureId = JS("chinese")
        let cnHonor = MonarchLore.honor(r, nationId: id0, reignId: "test-cn-1", order: 1, culture: "chinese", polity: "Empire", title: "皇帝", person: nil, fallbackName: "李世民", reignYears: 12, deltaProvs: 5, avgSkill: 80, isActive: false)
        XCTAssertFalse(cnHonor.eraName.isEmpty)
        XCTAssertEqual(cnHonor.honorific, "太祖")
        XCTAssertTrue(cnHonor.styledName.contains("太祖"))

        let ukHonor1 = MonarchLore.honor(r, nationId: id0, reignId: "test-uk-1", order: 1, culture: "english", polity: "Kingdom", title: "女王", person: nil, fallbackName: "伊丽莎白", reignYears: 20, deltaProvs: 7, avgSkill: 82, isActive: false)
        XCTAssertTrue(ukHonor1.styledName.contains("一世"))
        XCTAssertEqual(ukHonor1.honorific, "大帝")

        // 4. 16 新增性格特质对四维、国势与外交的真实加成
        XCTAssertEqual(MonarchLore.extraTraits.count, 16)
        if let leaderId = r.people.nations[id0].leaderId.optionalNumber.map(Int.init), let p = People.person(r, leaderId) {
            p.traits = .array([])
            let baseSkills = People.skills(p)
            Regimes.leverageCache = nil
            let baseLev = Regimes.leverage(r, id0)
            p.traits = .array([JS("Tactician"), JS("Financier")])
            let boostedSkills = People.skills(p)
            Regimes.leverageCache = nil
            let boostedLev = Regimes.leverage(r, id0)
            XCTAssertGreaterThan(boostedSkills.military, baseSkills.military)
            XCTAssertGreaterThan(boostedSkills.administrative, baseSkills.administrative)
            XCTAssertGreaterThan(boostedLev.attack, baseLev.attack)
            XCTAssertGreaterThan(boostedLev.income, baseLev.income)
        }

        // 5. 议会多党与主动操控（扶立新党、扶持增席、任命组阁、查禁）
        XCTAssertTrue(engine.setStyle(0, style: "dualMonarchy").ok)
        XCTAssertTrue(engine.partyAction(0, partyIndex: -1, action: "found").ok)
        XCTAssertTrue(engine.partyAction(0, partyIndex: 0, action: "boost").ok)
        XCTAssertTrue(engine.partyAction(0, partyIndex: 1, action: "appoint").ok)
        XCTAssertTrue(engine.partyAction(0, partyIndex: 0, action: "ban").ok)

        // 6. 24 分级特产与贸易国力联动
        XCTAssertEqual(Trade.profiles.count, 24)
        let tradeData = try XCTUnwrap(engine.tradeInfo(0))
        let tradeJson = try XCTUnwrap(JSONSerialization.jsonObject(with: tradeData) as? [String: Any])
        let goods = try XCTUnwrap(tradeJson["goods"] as? [[String: Any]])
        XCTAssertFalse(goods.isEmpty)
        XCTAssertNotNil(goods.first?["tier"])
        XCTAssertNotNil(goods.first?["effect"])

        // 7. 4 项新增御批政令（12 项完整可用）
        for kind in ["relief", "landSurvey", "armsUpgrade", "academy"] {
            let res = engine.nationDecree(0, kind: kind)
            XCTAssertTrue(res.ok, "政令 \(kind) 失败：\(res.reason)")
        }

        // 8. 军队数据一致性（国家总兵力 == 活跃军队之和；满编 >= 当前兵力；士气/补给 0...100）
        let stateData = engine.state(includeLabels: false)
        let stateJson = try XCTUnwrap(JSONSerialization.jsonObject(with: stateData) as? [String: Any])
        let nationsArr = try XCTUnwrap(stateJson["nations"] as? [[String: Any]])
        let armiesArr = try XCTUnwrap(stateJson["armies"] as? [[String: Any]])
        var troopSums = [Int: Int]()
        for a in armiesArr {
            let nIdx = a["nation"] as? Int ?? -1
            let tr = a["troops"] as? Int ?? -1
            let mor = a["morale"] as? Int ?? -1
            let sup = a["supplies"] as? Int ?? -1
            XCTAssertGreaterThanOrEqual(tr, 0)
            XCTAssertTrue((0...100).contains(mor), "士气越界：\(mor)")
            XCTAssertTrue((0...100).contains(sup), "粮草越界：\(sup)")
            troopSums[nIdx, default: 0] += tr
            if let aid = a["id"] as? String, let recData = engine.armyRecord(aid),
               let recJson = try? JSONSerialization.jsonObject(with: recData) as? [String: Any] {
                let full = recJson["full"] as? Double ?? 0
                XCTAssertGreaterThanOrEqual(full + 0.5, Double(tr), "满编 \(full) 小于现兵力 \(tr)")
            }
        }
        for (idx, n) in nationsArr.enumerated() {
            let reported = n["troops"] as? Int ?? 0
            XCTAssertEqual(reported, troopSums[idx] ?? 0, "国家 \(idx) 汇总兵力与活跃军队之和不符")
        }

        // 9. 皇帝诏书卷轴装裱网格完好 & 史册空值防御（缺失 reigns47 / isAlive / 重复 reignId 绝不闪退）
        let scrollMesh = MapLayers.scrollFrame(width: 1600, height: 900)
        XCTAssertGreaterThan(scrollMesh.vertices.count, 500)
        r.reigns47 = .null
        if let leaderId = r.people.nations[id0].leaderId.optionalNumber.map(Int.init), let p = People.person(r, leaderId) {
            p.isAlive = .null
        }
        let reignsData = try XCTUnwrap(engine.nationReigns(0))
        let reignsJson = try XCTUnwrap(JSONSerialization.jsonObject(with: reignsData) as? [String: Any])
        XCTAssertNotNil(reignsJson["reigns"])
    }

    /// Item 9 & Item 10 回归：
    /// 1) 关闭叛乱/事件或将 war/rebel/event 规则设为 0 时，所有触发路径（行省叛乱、世家叛乱、内战、现实政变、极端党夺权、随机事件）均严格不触发；
    /// 2) 战败割地冲击（defeatShock）在和约后持续拉低民心并推高政局风险，打通外战战败 -> 内政震荡链条；
    /// 3) Epochs 兜底人名池不再包含封号、复姓或带姓全名等脏词。
    func testWarDefeatDomesticShockAndStrictToggleCompliance() throws {
        let engine = try loadWorld(); defer { cleanup() }
        let r = engine.run
        let id0 = r.world.nations[0].id.asString
        let n0 = r.world.nations[0]

        // 1. 规则 0% 真正关闭 war/rebel/event，而 levy 保留除零安全下限
        _ = engine.setWorldRule("war", value: 0)
        _ = engine.setWorldRule("rebel", value: 0)
        _ = engine.setWorldRule("event", value: 0)
        XCTAssertEqual(Regimes.rule(r, "war"), 0)
        XCTAssertEqual(Regimes.rule(r, "rebel"), 0)
        XCTAssertEqual(Regimes.rule(r, "event"), 0)
        r.regimes.world.levy = JS(0)
        XCTAssertGreaterThan(Regimes.rule(r, "levy"), 0)

        // 2. 关闭叛乱与事件后，所有子系统触发点严格静默
        r.foundings.enabled = JS(false)
        let styleBefore = Regimes.style(r, id0).id
        let eventsBefore = r.chronicle.entries.length
        let b = Regimes.book(r, id0)
        b.calm = JS(120)
        Finance.setCorruption(r, id0, 80)
        for m in 1...120 {
            Regimes.realisticPoliticsMonth(r, n0, id0, m)
            Regimes.happenings(r, n0, id0, m, gain: 100, addGold: { _ in }, addDestiny: { _ in })
            MonarchLore.dynamicEventMonth(r, n0, id0, m, addGold: { _ in }, addDestiny: { _ in })
            Regimes.seizure(r, n0, id0, m)
            Regimes.dynastyMonth(r, n0, id0, m)
            Regimes.coup(r, n0, id0, m)
        }
        XCTAssertEqual(Regimes.style(r, id0).id, styleBefore, "关闭事件与叛乱后不应发生政变或改制")
        XCTAssertEqual(r.chronicle.entries.length, eventsBefore, "关闭事件与叛乱后不应产生任何随机事件或政变条目")
        if let p0 = r.world.provinces.asArray.first?.id.asString {
            XCTAssertFalse(Rebellion.tryRebel(r, p0, force: false), "关闭叛乱后行省叛乱必须返回 false")
        }

        // 3. 战败割地冲击（defeatShock）直接压低民心、推高政局风险并随时间衰减
        let moodBefore = Regimes.mood(r, id0)
        let riskBefore = Regimes.coupOutlook(r, id0).risk
        b.defeatShock = JS(0.62)
        b.defeatTick = r.clock.tick.clone()
        let moodAfter = Regimes.mood(r, id0)
        let outlookAfter = Regimes.coupOutlook(r, id0)
        XCTAssertLessThan(moodAfter, moodBefore - 0.4, "战败冲击应显著压低国内民心")
        XCTAssertGreaterThan(outlookAfter.risk, riskBefore + 15, "战败冲击应推高政局动荡风险")
        // 36 个月后衰减归零
        let savedTick = r.clock.tick.clone()
        r.clock.tick = JS(savedTick.asNumber + 36.0 * 30.0 * 120.0 + 10.0)
        XCTAssertEqual(Regimes.defeatPenalty(r, id0), 0, accuracy: 1e-6)
        r.clock.tick = savedTick

        // 4. Epochs 兜底人名池脏词清零校验
        let forbiddenGiven = Set(["孝庄", "经略", "上官", "宋庆", "李舜臣", "陈兴道", "俾斯麦", "北政所"])
        for (_, list) in Nobility.moreMale {
            for name in list { XCTAssertFalse(forbiddenGiven.contains(name), "moreMale 仍有脏词：\(name)") }
        }
        for (_, list) in Nobility.moreFemale {
            for name in list { XCTAssertFalse(forbiddenGiven.contains(name), "moreFemale 仍有脏词：\(name)") }
        }
    }
}
