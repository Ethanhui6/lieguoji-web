import XCTest
@testable import LieguojiCore

/// 2.0.1 核心回归测试：
/// 1. 彻底根治中华文明后期无限出现「大金」与重复国号；
/// 2. 政体 ↔ 国名现实匹配（中华王朝不叠拼王国/帝国，改制共和国自动切换地理基名，欧陆/中东/日本皇室名改制同步）；
/// 3. 后期防崩加固（自定义/未知文化建国、空履历/缺角连续性修复、MapCamera NaN/Inf 免疫）；
/// 4. 国家历代君主 (`nationReigns`) 强势程度、国土峰值与地图定位；
/// 5. 大事记山河回放 (`ReplayEngine` RLE 压缩、关键帧捕获、时间轴导出)。
final class LateGameAndReplayTests: XCTestCase {
    private func appWorld() throws -> NativeEngine {
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
        DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil
    }

    /// 验证：连续 60 次中华新国立国/起义，绝不会出现反复「大金」循环或核心国号撞车。
    func testChineseLateGameNoRepeatedDaJin() {
        var used = Set<String>()
        used.insert("大金")
        used.insert(NamingCatalog.canonicalStateKey("大金"))
        var generated = [String]()
        for i in 0..<60 {
            let pick = NamingCatalog.pickStateBase(culture: "chinese", mode: "historical-names", seed: "late-game-seed/\(i)", used: used, styleId: "dynasty")
            XCTAssertNotNil(pick)
            if let pick {
                let core = NamingCatalog.canonicalStateKey(pick)
                XCTAssertNotEqual(core, "金", "不应在已占用「大金」后再度抽中「金/大金」")
                XCTAssertFalse(used.contains(core), "第 \(i) 次抽中重复国号核心：\(pick)")
                used.insert(pick)
                used.insert(core)
                generated.append(pick)
            }
        }
        XCTAssertEqual(generated.count, 60)
        XCTAssertEqual(Set(generated.map { NamingCatalog.canonicalStateKey($0) }).count, 60)
    }

    /// 验证：政体与国名严格符合现实，不再出现「大金共和国」「北宋王国」「大顺帝国」「波旁联邦」。
    func testPolityStateNameRealism() throws {
        let engine = try appWorld(); defer { cleanup() }
        let r = engine.run

        let kingdom = Regimes.styles.first { $0.id == "absolute" }!
        let empire = Regimes.styles.first { $0.id == "empire" }!
        let dynasty = Regimes.styles.first { $0.id == "dynasty" }!
        let democratic = Regimes.styles.first { $0.id == "democratic" }!
        let federal = Regimes.styles.first { $0.id == "federal" }!

        // 中华双字断代朝代在王制/帝制下保留原号，绝不拼成「北宋王国」「蜀汉帝国」「大顺王国」
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "北宋", style: kingdom, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "赵", template: nil), "北宋")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "蜀汉", style: empire, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "刘", template: nil), "蜀汉")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "大顺", style: kingdom, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "李", template: nil), "大顺")
        // 中华单字在王制下为「齐国」而非「大齐王国」
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "齐", style: kingdom, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "姜", template: nil), "齐国")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "唐", style: dynasty, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "李", template: nil), "大唐")

        // 中华「大金」/「北宋」改行共和国时自动切换为地理共和名（如中华/江南/巴蜀共和国）
        let id0 = r.world.nations[0].id.asString
        r.civilization.nations[id0].cultureId = JS("chinese")
        r.civilization.nations[id0].name.value = JS("大金")
        r.civilization.nations[id0].name.custom = .null
        r.world.nations[0].name = JS("大金")
        let repName = Regimes.change(r, id0, to: "Republic", reason: "革命")
        XCTAssertFalse(repName.contains("大金"), "革命建立共和国后不应保留王朝号「大金」：\(repName)")
        XCTAssertTrue(repName.hasSuffix("共和国"), "共和国政体后缀应匹配：\(repName)")

        // 法国「波旁」改为联邦时自动切换为地理基名，而非「波旁联邦」
        let adaptedFr = NamingCatalog.adaptBaseForStyle(base: "波旁", culture: "french", style: federal, seed: "fr-test", used: [])
        XCTAssertNotEqual(adaptedFr, "波旁")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: adaptedFr, style: federal, religion: "catholic", culture: "french", ordinal: "", rulingSurname: "", template: nil), adaptedFr + "联邦")

        // 阿拉伯「阿拔斯」改为共和国时自动切换为地理基名
        let adaptedAr = NamingCatalog.adaptBaseForStyle(base: "阿拔斯", culture: "arab", style: democratic, seed: "ar-test", used: [])
        XCTAssertNotEqual(adaptedAr, "阿拔斯")
        XCTAssertTrue(NamingCatalog.modernRegionStates["arab"]!.contains(adaptedAr))
    }

    /// 验证：后期防崩加固 — 未知/自定义文化建国、缺失 leader role、MapCamera NaN/Inf 免疫。
    func testLateGameCrashHardeningAndCameraNaNImmunity() throws {
        let engine = try appWorld(); defer { cleanup() }
        let r = engine.run

        // 1. 给某城设置自定义/未知文化后建国，绝不因 cultures.first! 闪退
        if let prov = r.world.provinces.asArray.dropFirst().first,
           let city = r.world.cities.asArray.first(where: { $0.provinceId.asString == prov.id.asString }) {
            let parent = prov.controller.asString
            r.civilization.cities[city.id.asString].cultureId = JS("custom-mars-culture")
            let founded = Founding.foundState(r, parent: parent, provinces: [prov.id.asString], reason: "未知文化测试")
            XCTAssertFalse(founded.nationId.optionalString?.isEmpty ?? true, "未知文化建国应安全回退成功")
        }

        // 2. 清空某国领袖 roles 后触发 closeLeaderRole / reconcileContinuity 绝不闪退
        let nid = r.world.nations[0].id.asString
        if let lid = r.people.nations[nid].leaderId.optionalNumber, let p = People.person(r, Int(lid)) {
            p.roles = .array()
        }
        Government.reconcileContinuity(r)

        // 3. MapCamera 对 NaN / Inf / scale=0 全面免疫，绝不会造成 Metal 满屏白色
        let bad = MapCamera(centerX: .nan, centerY: .infinity, scale: 0)
        XCTAssertTrue(bad.isValid)
        let clamped = bad.clamped(map: (1600, 900), viewport: (390, 844))
        XCTAssertTrue(clamped.centerX.isFinite && clamped.centerY.isFinite && clamped.scale.isFinite && clamped.scale > 0)
        let spot = MapCamera.spotlight(x: .nan, y: .nan, from: clamped, map: (1600, 900), viewport: (390, 844))
        XCTAssertTrue(spot.centerX.isFinite && spot.centerY.isFinite && spot.scale > 0)
        let interp = MapCamera.interpolate(clamped, MapCamera(centerX: 800, centerY: 450, scale: 2), .nan)
        XCTAssertTrue(interp.centerX.isFinite && interp.centerY.isFinite && interp.scale > 0)
    }

    /// 验证：国家历代君主 (`nationReigns`) 导出完整、有强势评级与国土峰值、支持定位；山河回放 RLE 无损且时间轴有效。
    func testNationReignsAndReplayTimeline() throws {
        let engine = try appWorld(); defer { cleanup() }
        // 推进 400 天，产生多帧回放与任期记录
        engine.advance(days: 400)

        // 1. 历代君主导出
        let reignData = try XCTUnwrap(engine.nationReigns(0))
        let reignObj = try XCTUnwrap(try JSONSerialization.jsonObject(with: reignData) as? [String: Any])
        let reigns = try XCTUnwrap(reignObj["reigns"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(reigns.count, 1)
        let first = reigns[0]
        XCTAssertNotNil(first["name"] as? String)
        XCTAssertNotNil(first["powerRank"] as? String)
        let score = try XCTUnwrap(first["powerScore"] as? Double)
        XCTAssertTrue((5...100).contains(score))
        let peak = try XCTUnwrap(first["peakProvinces"] as? Int)
        XCTAssertGreaterThanOrEqual(peak, 0)
        let capProv = try XCTUnwrap(first["capitalProvince"] as? Int)
        XCTAssertGreaterThanOrEqual(capProv, 0)

        // 2. 山河回放 RLE 无损往返测试
        let sample = [0, 0, 0, 1, 1, -1, 2, 2, 2, 2, 0]
        let rle = ReplayEngine.encodeRLE(sample)
        XCTAssertEqual(ReplayEngine.decodeRLE(rle, count: sample.count), sample)

        // 3. 山河回放时间轴导出（月度加密采样：400 天至少产生 10 帧且每帧含大国占比 topPowers）
        let tlData = try XCTUnwrap(engine.replayTimeline())
        let tl = try XCTUnwrap(try JSONSerialization.jsonObject(with: tlData) as? [String: Any])
        let frames = try XCTUnwrap(tl["frames"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(frames.count, 10, "月度采样 400 天应至少采集 10 帧山河关键帧")
        let provCount = try XCTUnwrap(tl["provinceCount"] as? Int)
        for frame in frames {
            let encoded = try XCTUnwrap(frame["rle"] as? [Int])
            let decoded = ReplayEngine.decodeRLE(encoded, count: provCount)
            XCTAssertEqual(decoded.count, provCount)
            let powers = try XCTUnwrap(frame["topPowers"] as? [[String: Any]])
            XCTAssertFalse(powers.isEmpty, "每帧应附带 topPowers 大国占比")
        }
    }

    /// 2.0.2 验证：App 规则国名排布倾角柔和（≤ ±20°）且多轴进攻自动分兵不扎堆。
    func testLabelCalmAngleAndMultiAxisArmyFlanking() throws {
        let engine = try appWorld(); defer { cleanup() }
        // bridge-world.json 不含离线 labelGrid，构造一块 16×12 合成格网归属第 0 州以直接检验 App 规则排布算法
        let cols = 16, rows = 12
        var pts = [JS](), cells = [JS]()
        for y in 0..<rows {
            for x in 0..<cols {
                pts.append(JS(Double(x) * 10 + 100))
                pts.append(JS(Double(y) * 10 + 100))
                cells.append(JS(0))
            }
        }
        let grid = JS.object()
        grid.cellsX = JS(cols); grid.points = .array(pts); grid.cells = .array(cells)
        engine.statics.labelGrid = grid
        let state = engine.gameState(includeLabels: true)
        let boxes = try XCTUnwrap(state.labels)
        XCTAssertFalse(boxes.isEmpty)
        for b in boxes {
            XCTAssertTrue(b.x.isFinite && b.y.isFinite && b.width > 0 && b.height > 0)
            XCTAssertLessThanOrEqual(abs(b.angle ?? 0), 0.36, "2.0.2 App 规则国名倾角应收敛在 ±20° 以内")
        }

        // 6 支 2000 兵力进攻两个各需 2000 兵力的相邻敌州（都在 x=0 附近出发），多余兵力不应全堆到同一个州
        let forces = (0..<6).map { WarCouncil.Force(id: "a\($0)", troops: 2000, x: Double($0), y: 0, feature: 1, target: nil, movable: true) }
        let p1 = WarCouncil.Post(province: 10, x: 5, y: 0, feature: 1, need: 2000)
        let p2 = WarCouncil.Post(province: 11, x: 25, y: 0, feature: 1, need: 2000)
        let duties = WarCouncil.assign(forces: forces, defend: [], hold: [], holdBudget: 0, attack: [p1, p2])
        let onP1 = duties.values.filter { $0 == .attack(10) }.count
        let onP2 = duties.values.filter { $0 == .attack(11) }.count
        XCTAssertGreaterThanOrEqual(onP2, 2, "副攻轴线应分得足够兵力以形成多路包抄，实际 p1=\(onP1) p2=\(onP2)")
        XCTAssertLessThanOrEqual(onP1, 4, "主攻轴线不应过度堆兵溢出")
    }
}
