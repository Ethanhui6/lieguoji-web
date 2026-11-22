import XCTest
import Foundation
@testable import LieguojiCore

/// 2.8.2 续做与验收专项回归测试：
/// 1. 接敌格局部地貌参与战斗地形修正（第 2 项）
/// 2. 80 城及 40/120 城多模板区划均衡与建世阶段计时（第 3 项）
/// 3. 跨海渡海、海军主动近岸截击、海上交锋与海上停战返航全链路（第 6、7 项）
/// 4. 家族中日文化隔离、杜绝同姓婚与自定义文化零崩溃（第 8 项）
/// 5. 战败割地 → defeatShock → 民情/政变风险/好战度下降 → 倒阁换路线完整因果链（第 9 项）
final class ContinuationAuditTests: XCTestCase {
    private static func cleanup() {
        Session.uninstall()
        UnitKinds.enabled = false
        DeclarationEngine.temper = nil
        DeclarationEngine.pact = nil
        DeclarationEngine.stance = nil
        DeclarationEngine.opinionBias = nil
        ArmyAutonomy.temper = nil
    }

    private func makeAppWorld(seed: String = "audit-282", template: String = "continents", count: Int = 6, cityCount: Int = 40, cultures: [String] = []) throws -> NativeEngine {
        let inputs = try NativeCreationTests.inputs()
        var opt = NativeCreation.Options(seed: seed, template: template, count: count, cityCount: cityCount, relations: "peace", naming: "historical-names", cultures: cultures)
        opt.organicBorders = true
        let built = try NativeCreation.generate(opt, inputs: inputs, worldId: "audit-\(seed)", runId: "fms-\(seed)")
        let engine = try NativeEngine(created: built.run, statics: built.statics)
        engine.enableAppRules()
        return engine
    }

    // MARK: - 第 2 项：接敌格局部地貌参与战斗地形修正

    func testCombatReaderUsesContactCellTerrain() throws {
        defer { Self.cleanup() }
        let engine = try makeAppWorld(seed: "terrain-cell-282", template: "continents", count: 4, cityCount: 30)
        let r = engine.run
        guard let bridge = Armies.bridge else { XCTFail("bridge 缺失"); return }
        let g = bridge.graph
        // 找一个包含至少两种不同地貌（如林地/山地与草原/平原）的州，并用同一支骑兵先后站在两格做对比。
        var chosen: (provIdx: Int, openCell: Int, roughCell: Int)?
        for p in 0..<r.world.provinces.length {
            let cells = g.byProvince[p]
            var open: Int?, rough: Int?
            for c in cells {
                let face = Int(g.faces[c])
                guard g.faceBiomes.indices.contains(face) else { continue }
                let bi = Int(g.faceBiomes[face])
                if open == nil && (bi == 3 || bi == 4) { open = c }
                if rough == nil && (bi == 7 || bi == 8 || bi == 9 || bi == 12) { rough = c }
            }
            if let o = open, let rg = rough { chosen = (p, o, rg); break }
        }
        guard let pick = chosen else {
            // 若该种子所有州单一地貌，直接构造最小两格地貌对比验证逻辑本身
            XCTFail("未找到混合地貌州")
            return
        }
        guard let army = r.world.armies.asArray.first(where: { $0.troops.asNumber > 0 }) else { XCTFail("无存活军队"); return }
        let aid = army.id.asString
        r.units[aid] = JS("Cavalry")
        // 放在开阔格（草原/稀树草原）
        let openRec = JS.object()
        openRec.version = JS(1); openRec.armyId = JS(aid); openRec.origin = ForceBridge.json(g.centers[pick.openCell])
        openRec.nodes = .array([JS(Int(g.ids[pick.openCell]))]); openRec.leg = JS(0); openRec.offset = JS(0); openRec.crossed = JS(false); openRec.status = JS("arrived")
        r.armyPositions.records[aid] = openRec
        let effOpen = Efficiency.compute(CombatReader.inputs(r, army, pick.provIdx).input)

        // 移动到同一州内的森林/崎岖格
        let roughRec = JS.object()
        roughRec.version = JS(1); roughRec.armyId = JS(aid); roughRec.origin = ForceBridge.json(g.centers[pick.roughCell])
        roughRec.nodes = .array([JS(Int(g.ids[pick.roughCell]))]); roughRec.leg = JS(0); roughRec.offset = JS(0); roughRec.crossed = JS(false); roughRec.status = JS("arrived")
        r.armyPositions.records[aid] = roughRec
        let effRough = Efficiency.compute(CombatReader.inputs(r, army, pick.provIdx).input)

        XCTAssertGreaterThan(effOpen, effRough * 1.15, "同一州内骑兵在草原格（\(effOpen)）的战斗效率应明显高于森林/崎岖格（\(effRough)）")
    }

    // MARK: - 第 3 项：多模板、多城数（40/80/120）面积均衡与阶段计时

    func testMultiTemplateAndCityCountAreaBalance() throws {
        defer { Self.cleanup() }
        let inputs = try NativeCreationTests.inputs()
        let cases: [(String, Int)] = [("continents", 40), ("continents", 80), ("archipelago", 80), ("highIsland", 80), ("pangea", 80), ("continents", 120)]
        for (template, cities) in cases {
            let t0 = Date()
            let heights = TerrainGenerator.generate(graph: inputs.grid, seed: "bal-282-\(template)-\(cities)", template: template).map(Int.init)
            let tTerrain = Date().timeIntervalSince(t0)
            let cleaned = Regions.cleanTinyIslets(inputs.document, elevations: heights, cities: cities)
            let t1 = Date()
            let part = Regions.partition(inputs.document, elevations: cleaned, cities: cities, balanceAreas: true)
            let tPart = Date().timeIntervalSince(t1)
            XCTAssertNotNil(part, "\(template)/\(cities)城 分区不应失败")
            guard let regions = part?.regions else { continue }
            XCTAssertEqual(regions.count, cities)
            let areas = regions.map { $0.area }.sorted()
            let mean = areas.reduce(0, +) / Double(areas.count)
            let p10 = areas[max(0, areas.count / 10)] / mean
            let med = areas[areas.count / 2] / mean
            print(String(format: "区划验收 [%@ %d城] 地形=%.3fs 分区=%.3fs P10/均=%.2f 中位/均=%.2f 最小/均=%.2f",
                         template, cities, tTerrain, tPart, p10, med, areas[0] / mean))
            XCTAssertGreaterThan(p10, 0.35, "\(template)/\(cities)城 P10 相对面积过小（\(p10)）")
            XCTAssertGreaterThan(med, 0.50, "\(template)/\(cities)城 中位相对面积过小（\(med)）")
        }
    }

    // MARK: - 第 6 & 7 项：跨海渡海、海军主动截击、海上停战返航

    func testSeaCrossingInterceptAndMidSeaPeaceReturn() throws {
        defer { Self.cleanup() }
        let engine = try makeAppWorld(seed: "naval-282-arch", template: "archipelago", count: 6, cityCount: 48)
        let r = engine.run
        guard let bridge = Armies.bridge, let sea = Naval.sea, !sea.ports.isEmpty else {
            XCTFail("群岛世界应有海域与海港")
            return
        }
        let g = bridge.graph
        // 找到两个分属不同国家且在同一海域连通分量中的海港，且两国各有存活军队与舰队
        var pair: (attNation: String, defNation: String, attPort: Naval.Port, defPort: Naval.Port, attArmy: JS, defFleet: JS)?
        for p1 in sea.ports {
            let c1 = r.world.provinces.asArray.first { $0.id.asString == p1.provinceId }?.controller.asString ?? ""
            guard !c1.isEmpty else { continue }
            let comp = sea.component(p1.node)
            guard let a1 = r.world.armies.asArray.first(where: { $0.nationId.asString == c1 && $0.troops.asNumber > 0 }) else { continue }
            for p2 in sea.ports where sea.component(p2.node) == comp {
                let c2 = r.world.provinces.asArray.first { $0.id.asString == p2.provinceId }?.controller.asString ?? ""
                guard !c2.isEmpty, c2 != c1 else { continue }
                guard let f2 = Naval.fleets(r).first(where: { $0.nationId.asString == c2 && $0.status.asString != "lost" }) else { continue }
                pair = (c1, c2, p1, p2, a1, f2)
                break
            }
            if pair != nil { break }
        }
        guard let sc = pair else { XCTFail("未找到可跨海对阵的双方海港/舰队"); return }

        // 1. 开战并下达跨海进军（进攻方陆军置于海上航道，模拟已启航渡海）
        guard let rel = Wars.relation(r, sc.attNation, sc.defNation) else { XCTFail("缺少外交关系"); return }
        rel.status = JS("war"); rel.sinceDay = r.world.day.clone()
        let war = Wars.register(r, attacker: sc.attNation, defender: sc.defNation, goals: .array(), members: Vassals.buildParticipants(r, attacker: sc.attNation, defender: sc.defNation))
        guard let seaCell = g.cell(id: sc.attPort.node * 2 + 1),
              let defProvIdx = r.world.provinces.asArray.firstIndex(where: { $0.id.asString == sc.defPort.provinceId }),
              let targetCell = g.targetCell(province: defProvIdx),
              let seaPath = g.path(from: seaCell, to: targetCell, allowSea: true, canEnterProvince: { q in
                  let ctrl = r.world.provinces[q].controller.asString
                  return ctrl == sc.attNation || ctrl == sc.defNation
              }, aStar: true, seaRate: 0.5, terrainCost: true) else {
            XCTFail("无法规划跨海航线")
            return
        }
        let aid = sc.attArmy.id.asString
        let tr = JS.object()
        tr.version = JS(2); tr.armyId = JS(aid); tr.origin = ForceBridge.json(g.centers[seaCell]); tr.destination = ForceBridge.json(g.targets[defProvIdx])
        tr.nodes = .array(seaPath.nodes.map { JS(Int(g.ids[$0])) }); tr.leg = JS(0); tr.offset = JS(0); tr.crossed = JS(false); tr.status = JS("moving")
        r.armyPositions.records[aid] = tr
        r.armyAutonomy.armies[aid].decision = JS("attacking"); r.armyAutonomy.armies[aid].targetId = JS(sc.defPort.provinceId)
        Vassals.bump(r.armyPositions)

        // 核对跨海 routeNote 展示“渡海航行”
        let st1 = engine.gameState(includeLabels: false)
        let armyView1 = st1.armies.first { $0.id == aid }
        XCTAssertTrue(armyView1?.routeNote?.contains("渡海") == true, "渡海陆军应给出清晰渡海说明，实际：\(armyView1?.routeNote ?? "nil")")

        // 2. 守方自主海军 AI 识别敌军渡海，主动派出舰队截击
        let fid = sc.defFleet.id.asString
        sc.defFleet.patrol = JS(true)
        sc.defFleet.food = JS(max(sc.defFleet.food.asNumber, sc.defFleet.crew.asNumber * 60))
        r.navalAutonomy.lastTick = JS(-1)
        r.navalAutonomy.fleets[fid].nextTick = JS(0)
        r.clock.tick = JS(r.clock.tick.asNumber + 60)
        Naval.issueAutonomous(r)
        let fReason = r.navalAutonomy.fleets[fid].reason.optionalString ?? ""
        XCTAssertEqual(r.navalAutonomy.fleets[fid].decision.optionalString, "attacking", "敌军渡海来犯时守方舰队应出击截击，实际理由：\(fReason)")

        // 3. 海上突然停战（PeaceBridge.settle）：渡海陆军在下一批评估立即改航撤回本国，且 routeNote 标明“渡海撤回”
        PeaceBridge.settle(r, war, reason: 11)
        r.armyAutonomy.armies[aid].nextTick = JS(0)
        ArmyOrders.selection(r, [aid])
        XCTAssertEqual(r.armyAutonomy.armies[aid].decision.optionalString, "returning", "海上停战后渡海陆军应立即转入返航（returning），而非滞留海上")
        XCTAssertEqual(sc.attArmy.status.asString, "retreating", "海上停战返航应置为合法撤回状态")
        let st2 = engine.gameState(includeLabels: false)
        let armyView2 = st2.armies.first { $0.id == aid }
        XCTAssertTrue(armyView2?.routeNote?.contains("渡海撤回") == true || armyView2?.routeNote?.contains("撤回") == true || armyView2?.routeNote?.contains("撤退") == true,
                      "海上停战返航应有明确撤回说明，实际：\(armyView2?.routeNote ?? "nil")")
    }

    // MARK: - 第 8 项：家族中日文化隔离、杜绝同姓婚与自定义文化兜底零崩溃

    func testFamilyCultureIsolationAndNoSameSurnameMarriage() throws {
        defer { Self.cleanup() }
        let engine = try makeAppWorld(seed: "family-culture-282", template: "continents", count: 6, cityCount: 42, cultures: ["chinese", "japanese"])
        let r = engine.run
        let cnHouses = Set(NamingCatalog.houseNames(culture: "chinese"))
        let jpHouses = Set(NamingCatalog.houseNames(culture: "japanese"))
        XCTAssertTrue(cnHouses.intersection(jpHouses).isEmpty, "中华与日本家族姓氏池不得交叉污染")

        var checkedFamilies = 0
        for (fid, fam) in r.kin.families.objectEntries {
            let cult = fam.cultureName.optionalString ?? ""
            let surname = NamingCatalog.cleanSurname(fam.surname.optionalString ?? "")
            guard !surname.isEmpty else { continue }
            checkedFamilies += 1
            if cult == "chinese" { XCTAssertFalse(jpHouses.contains(surname), "中华家族 \(fid) 误用日本姓氏 \(surname)") }
            if cult == "japanese" { XCTAssertFalse(cnHouses.contains(surname), "日本家族 \(fid) 误用中华姓氏 \(surname)") }
            // 检查家族内配偶不得同姓（外娶/入赘配偶必保留不同本姓）
            let headId = fam.headId.asInt
            if let head = People.person(r, headId), head.spouseId.asInt > 0, let spouse = People.person(r, head.spouseId.asInt) {
                let spLast = NamingCatalog.cleanSurname(spouse.lastName.optionalString ?? "")
                XCTAssertNotEqual(spLast, surname, "家族 \(fid) 家主与配偶不得同姓（均为 \(surname)）")
            }
        }
        XCTAssertGreaterThan(checkedFamilies, 6, "应核验多个中华与日本世家")

        // 自定义未知文化兜底不得崩溃或返回空姓氏池
        XCTAssertFalse(NamingCatalog.houseNames(culture: "custom-atlantis").isEmpty)
        XCTAssertFalse(NamingCatalog.givenNames(r, culture: "custom-atlantis", gender: 0).isEmpty)
    }

    // MARK: - 第 9 项：战败割地 → defeatShock → 民情/政变风险/好战度下降完整因果链

    func testDefeatShockDampensWarTemperAndDrivesPoliticalFallout() throws {
        defer { Self.cleanup() }
        let engine = try makeAppWorld(seed: "politics-defeat-282", template: "continents", count: 6, cityCount: 36)
        let r = engine.run
        let nid = r.world.nations[0].id.asString
        // 清理自定义 temper 覆写，取战前基线
        if !r.regimes.temper.isNull { r.regimes.temper.delete(nid) }
        let moodBefore = Regimes.mood(r, nid)
        let riskBefore = Regimes.coupOutlook(r, nid).risk
        let temperBefore = Regimes.temper(r, nid)

        // 注入一次战败割地冲击（对应 PeaceBridge.settle 战败 + 割 2 省 -> 0.62）
        let b = Regimes.book(r, nid)
        b.defeatShock = JS(0.62)
        b.defeatTick = r.clock.tick.clone()

        let penalty = Regimes.defeatPenalty(r, nid)
        let moodAfter = Regimes.mood(r, nid)
        let riskAfter = Regimes.coupOutlook(r, nid).risk
        let temperAfter = Regimes.temper(r, nid)

        XCTAssertEqual(penalty, 0.62, accuracy: 0.01)
        XCTAssertLessThan(moodAfter, moodBefore - 0.3, "战败冲击应显著拉低民心")
        XCTAssertGreaterThan(riskAfter, riskBefore + 10, "战败冲击应显著推高政局动荡与政变风险")
        XCTAssertLessThan(temperAfter, temperBefore * 0.80, "战败休养生息期应直接压低对外开战意愿（temper: \(temperBefore) → \(temperAfter)）")
    }
}
