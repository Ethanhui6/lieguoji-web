import XCTest
@testable import LieguojiCore

/// 国名、命名规则与家族系统完善回归测试：
/// 1. 26 种文化国名、架空名、人名、姓氏库质检（无双后缀、无叠字、无脏尾缀、无混姓）；
/// 2. 国名模板 `{名}` `{号}` `{序}` `{姓}`、基名修改、暂停时随机国名、地图简写剥离；
/// 3. 同国世家不撞姓、配偶保留独立本姓、人物改名同步、族姓修改同步、立家主/定继承人/女性继承开关、旁系导出。
final class NamingAndFamilyTests: XCTestCase {
    private func appWorld() throws -> NativeEngine {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        // 模拟新建世界第 0 天开局启用 App 规则（触发 NameVariety 与 FamilyPolitics 开局整理）。
        engine.run.clock.tick = JS(0)
        engine.enableAppRules()
        return engine
    }
    private func cleanup() {
        Session.uninstall()
        UnitKinds.enabled = false
        DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil
    }

    /// 全部 26 种文化的国名、人名、姓氏库质量校验。
    func testCatalogQualityAcrossAll26Cultures() {
        let allCultures = NativeEngine.cultureIds
        XCTAssertEqual(allCultures.count, 26)
        for c in allCultures {
            // 历史与架空国名池均非空，且全部不带政体后缀。
            let hist = NamingCatalog.statePool(culture: c, mode: "historical-names")
            let fant = NamingCatalog.statePool(culture: c, mode: "culture-generated")
            XCTAssertGreaterThanOrEqual(hist.count, 10, "\(c) 历史国名池过少")
            XCTAssertGreaterThanOrEqual(fant.count, 14, "\(c) 架空国名池过少")
            XCTAssertEqual(Set(hist).count, hist.count, "\(c) 历史国名有重复")
            XCTAssertEqual(Set(fant).count, fant.count, "\(c) 架空国名有重复")
            for name in hist + fant {
                XCTAssertFalse(NamingCatalog.politySuffixes.contains { name.hasSuffix($0) && name.count > $0.count },
                               "\(c) 国名基名残留政体后缀：\(name)")
                if name.count == 2 {
                    let chars = Array(name)
                    XCTAssertNotEqual(chars[0], chars[1], "\(c) 国名出现叠字：\(name)")
                }
            }
            // 人名与姓氏库均非空、无重复、无“家/人/氏”尾缀。
            let p = NamingCatalog.people[c]
            XCTAssertNotNil(p, "缺少文化人名库：\(c)")
            if let p {
                XCTAssertGreaterThanOrEqual(p.male.count, 30, "\(c) 男名过少")
                XCTAssertGreaterThanOrEqual(p.female.count, 30, "\(c) 女名过少")
                XCTAssertGreaterThanOrEqual(p.houses.count, 20, "\(c) 姓氏过少")
                XCTAssertEqual(Set(p.male).count, p.male.count, "\(c) 男名重复")
                XCTAssertEqual(Set(p.female).count, p.female.count, "\(c) 女名重复")
                XCTAssertEqual(Set(p.houses).count, p.houses.count, "\(c) 姓氏重复")
                for h in p.houses {
                    XCTAssertFalse(h.hasSuffix("家") || h.hasSuffix("人") || h.hasSuffix("氏"), "\(c) 姓氏含脏尾缀：\(h)")
                }
            }
        }
        // 核验曾经出错的具体脏条目已彻底清除。
        XCTAssertFalse(NamingCatalog.people["chinese"]!.male.contains("孝庄"))
        XCTAssertFalse(NamingCatalog.people["chinese"]!.female.contains("上官"))
        XCTAssertFalse(NamingCatalog.people["korean"]!.male.contains("李舜臣"))
        XCTAssertFalse(NamingCatalog.people["vietnamese"]!.male.contains("陈兴道"))
        XCTAssertFalse(NamingCatalog.people["japanese"]!.female.contains("井伊直虎"))
        XCTAssertFalse(NamingCatalog.people["german"]!.male.contains("俾斯麦"))
    }

    /// 人物姓名格式按文化统一，不丢失氏族名。
    func testPersonNameFormattingByCulture() {
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "chinese", given: "文昭", house: "李", gender: 0), "李文昭")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "japanese", given: "信长", house: "织田", gender: 0), "织田信长")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "korean", given: "成桂", house: "李", gender: 0), "李成桂")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "vietnamese", given: "兴道", house: "陈", gender: 0), "陈兴道")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "mongol", given: "铁木真", house: "孛儿只斤", gender: 0), "孛儿只斤·铁木真")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "turkic", given: "土门", house: "阿史那", gender: 0), "阿史那·土门")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "hungarian", given: "马加什", house: "匈雅提", gender: 0), "匈雅提·马加什")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "english", given: "爱德华", house: "金雀花", gender: 0), "爱德华·金雀花")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "arab", given: "萨拉丁", house: "阿尤布", gender: 0), "萨拉丁·阿尤布")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "roman", given: "马库斯", house: "尤利乌斯", gender: 0), "马库斯·尤利乌斯")
        XCTAssertEqual(NamingCatalog.formatPerson(culture: "roman", given: "利维娅", house: "尤利乌斯", gender: 1), "尤利娅·利维娅")
    }

    /// 国名拼合、防重复后缀、模板占位符与地图简洁国名剥离。
    func testStateTitleFormattingAndMapLabelStripping() {
        let kingdom = Regimes.styles.first { $0.id == "absolute" }!
        let dynasty = Regimes.styles.first { $0.id == "dynasty" }!
        let sultanate = Regimes.styles.first { $0.id == "sultanate" }!
        let socialist = Regimes.styles.first { $0.id == "socialist" }!
        // 不再出现「波兰王国王国」「西西里王国共和国」。
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "波兰王国", style: kingdom, religion: "catholic", culture: "polish", ordinal: "", rulingSurname: "皮雅斯特", template: nil), "波兰王国")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "宋国", style: dynasty, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "赵", template: nil), "大宋")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "秦", style: dynasty, religion: "chineseFolk", culture: "chinese", ordinal: "第二", rulingSurname: "嬴", template: nil), "后秦")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "北魏", style: dynasty, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "拓跋", template: nil), "北魏")
        // 模板支持 {名} {号} {序} {姓}。
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "法兰西", style: Regimes.styles.first { $0.id == "empire" }!, religion: "catholic", culture: "french", ordinal: "第二", rulingSurname: "波拿巴", template: "{名}{序}{号}"), "法兰西第二帝国")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "唐", style: dynasty, religion: "chineseFolk", culture: "chinese", ordinal: "", rulingSurname: "李", template: "{姓}氏大{名}"), "李氏大唐")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "法蒂玛", style: sultanate, religion: "islam", culture: "arab", ordinal: "", rulingSurname: "萨利姆", template: nil), "法蒂玛苏丹国")
        // 地图简洁国名能完整剥离各种新政体后缀与单字朝代冠字「大」，且保留「大理」「大越」。
        XCTAssertEqual(MapLayers.stateLabel("法蒂玛苏丹国", full: false), "法蒂玛")
        XCTAssertEqual(MapLayers.stateLabel("卡佩公国", full: false), "卡佩")
        XCTAssertEqual(MapLayers.stateLabel("法兰西社会主义共和国", full: false), "法兰西")
        XCTAssertEqual(MapLayers.stateLabel("不列颠联合王国", full: false), "不列颠")
        XCTAssertEqual(MapLayers.stateLabel("大秦", full: false), "秦")
        XCTAssertEqual(MapLayers.stateLabel("大汉", full: false), "汉")
        XCTAssertEqual(MapLayers.stateLabel("大理", full: false), "大理")
        XCTAssertEqual(MapLayers.stateLabel("大越", full: false), "大越")
        XCTAssertEqual(NamingCatalog.formatStateTitle(base: "法兰西", style: socialist, religion: "catholic", culture: "french", ordinal: "", rulingSurname: "", template: nil), "法兰西社会主义共和国")
    }

    /// 真实 App 世界集成验证：世家去重、独立配偶姓、随机国名、模板与基名、改名同步、族谱管理操作。
    func testAppWorldNamingAndFamilyWorkflows() throws {
        let engine = try appWorld(); defer { cleanup() }
        let r = engine.run

        // 1. 同国世家无撞姓；已婚配偶拥有独立本姓（不再与配偶同姓）。
        var surnamesByNation = [String: Set<String>]()
        for (_, fam) in r.kin.families.objectEntries {
            let nid = fam.nationId.optionalString ?? ""
            let s = fam.surname.optionalString ?? ""
            XCTAssertFalse(s.isEmpty)
            XCTAssertTrue(surnamesByNation[nid, default: []].insert(s).inserted, "国家 \(nid) 出现重姓家族：\(s)")
            let headId = fam.headId.asInt
            if let head = People.person(r, headId), head.spouseId.asInt > 0, let sp = People.person(r, head.spouseId.asInt) {
                XCTAssertNotEqual(sp.lastName.asString, head.lastName.asString, "开局家主与配偶不应同姓：\(head.identity.name.asString) / \(sp.identity.name.asString)")
            }
        }

        // 2. 暂停时连续点「随机国名」，每次必换不同国名。
        let firstName = r.world.nations[0].name.asString
        let r1 = engine.randomNationName(0)
        let name1 = r.world.nations[0].name.asString
        let r2 = engine.randomNationName(0)
        let name2 = r.world.nations[0].name.asString
        XCTAssertTrue(r1.ok && r2.ok)
        XCTAssertNotEqual(name1, firstName)
        XCTAssertNotEqual(name2, name1, "暂停状态下连点随机国名必须换新名")

        // 3. 修改基名与国名模板（含 {姓} 联动）。
        XCTAssertTrue(engine.setBaseName(0, base: "长安").ok)
        XCTAssertTrue(engine.setNameTemplate(0, template: "{姓}氏{名}{号}").ok)
        let nid0 = r.world.nations[0].id.asString
        let rulingFamId = String(People.rulingFamilyId(r, nid0))
        XCTAssertNotEqual(rulingFamId, "0")
        let oldSurname = r.kin.families[rulingFamId].surname.asString
        XCTAssertTrue(r.world.nations[0].name.asString.hasPrefix("\(oldSurname)氏长安"))

        // 4. 修改族姓：同步更新本家成员姓名（不改外姓配偶）及含 {姓} 的国名。
        let headId = r.kin.families[rulingFamId].headId.asInt
        let headBefore = People.person(r, headId)!
        let spouseBefore = headBefore.spouseId.asInt > 0 ? People.person(r, headBefore.spouseId.asInt) : nil
        let spouseLastBefore = spouseBefore?.lastName.asString
        XCTAssertTrue(engine.editFamily(rulingFamId, surname: "轩辕", influence: nil, strip: false, allowFemale: true).ok)
        XCTAssertEqual(r.kin.families[rulingFamId].surname.asString, "轩辕")
        XCTAssertTrue(People.person(r, headId)!.identity.name.asString.contains("轩辕"), "改族姓后家主姓名应同步刷新")
        if let sp = spouseBefore, let oldSpLast = spouseLastBefore, oldSpLast != oldSurname {
            XCTAssertEqual(sp.lastName.asString, oldSpLast, "改族姓不应覆盖外姓配偶的娘家姓")
        }
        XCTAssertTrue(r.world.nations[0].name.asString.hasPrefix("轩辕氏长安"), "宗室改族姓后 {姓} 模板国名应实时刷新")

        // 5. 族谱读取包含新元数据与旁系，且「修改人物名」「立为家主」「指定继承人」全部立即可见。
        let tree1 = try JSONDecoder().decode(FamilyTree.self, from: XCTUnwrap(engine.familyTree(rulingFamId)))
        XCTAssertTrue(tree1.ruling)
        XCTAssertTrue(tree1.allowFemale)
        XCTAssertEqual(tree1.surname, "轩辕")
        XCTAssertTrue(engine.renamePerson(headId, first: "明远", last: nil, age: nil).ok)
        let tree2 = try JSONDecoder().decode(FamilyTree.self, from: XCTUnwrap(engine.familyTree(rulingFamId)))
        XCTAssertTrue(tree2.byId[headId]!.name.contains("明远"), "人物改名后族谱必须立即显示新名字")

        if let other = tree2.members.first(where: { $0.alive && $0.id != headId }) {
            XCTAssertTrue(engine.familyAction(other.id, action: "setHeir").ok)
            let tree3 = try JSONDecoder().decode(FamilyTree.self, from: XCTUnwrap(engine.familyTree(rulingFamId)))
            XCTAssertEqual(tree3.heir, other.id)
            XCTAssertTrue(engine.familyAction(other.id, action: "promoteHead").ok)
            let tree4 = try JSONDecoder().decode(FamilyTree.self, from: XCTUnwrap(engine.familyTree(rulingFamId)))
            XCTAssertEqual(tree4.head, other.id)
        }

        // 6. 手动为其婚配：新配偶不与本族同姓。
        if let unmarried = tree2.members.first(where: { $0.alive && $0.age >= 18 && $0.spouse == 0 }) {
            XCTAssertTrue(engine.familyAction(unmarried.id, action: "spouse").ok)
            let tree5 = try JSONDecoder().decode(FamilyTree.self, from: XCTUnwrap(engine.familyTree(rulingFamId)))
            let sp = try XCTUnwrap(tree5.spouse(of: try XCTUnwrap(tree5.byId[unmarried.id])))
            XCTAssertFalse(sp.natalHouse.isEmpty, "新婚配的配偶应记录独立本姓")
            XCTAssertNotEqual(sp.natalHouse, tree5.surname, "新婚配的配偶不应与本族同姓")
        }

        // 7. 世家往来、扶立新世家、撮合联姻、赏赐/削权/结好/离间与本族纪事。
        let ownedProvIndex = try XCTUnwrap(r.world.provinces.asArray.firstIndex(where: { $0.controller.optionalString == nid0 }))
        let created = engine.createHouse(0, province: ownedProvIndex, surname: "琅琊王")
        XCTAssertTrue(created.ok, created.reason)
        let newHouseId = try XCTUnwrap(r.kin.families.objectEntries.first(where: { $0.1.surname.optionalString == "琅琊王" })?.0)
        XCTAssertTrue(engine.houseDiplomacy(newHouseId, with: nil, kind: "favor").ok)
        XCTAssertTrue(engine.houseDiplomacy(newHouseId, with: nil, kind: "suppress").ok)
        let beforeScore = FamilyPolitics.relationScore(r, rulingFamId, newHouseId)
        XCTAssertTrue(engine.houseDiplomacy(rulingFamId, with: newHouseId, kind: "befriend").ok)
        XCTAssertGreaterThan(FamilyPolitics.relationScore(r, rulingFamId, newHouseId), beforeScore)
        XCTAssertTrue(engine.houseDiplomacy(rulingFamId, with: newHouseId, kind: "estrange").ok)
        let marryRes = engine.marryHouses(rulingFamId, with: newHouseId)
        XCTAssertTrue(marryRes.ok, marryRes.reason)
        let treeNew = try JSONDecoder().decode(FamilyTree.self, from: XCTUnwrap(engine.familyTree(newHouseId)))
        XCTAssertEqual(treeNew.surname, "琅琊王")
        XCTAssertFalse(treeNew.events.isEmpty, "册立、赏赐、联姻后本族纪事应有记录")
        XCTAssertTrue(treeNew.relations.contains(where: { $0.id == rulingFamId && $0.married }), "撮合联姻后两家关系列表应标记姻亲")

        // 8. 月度世家动态安全推演（无崩溃）。
        for m in 1...12 { FamilyPolitics.month(r, m) }
    }
}
