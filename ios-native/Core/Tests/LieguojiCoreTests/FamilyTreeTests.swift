import XCTest
@testable import LieguojiCore

/// 族谱页（家族页）闪退回归：引擎输出与 App 解码/分代用的是同一份 `FamilyTree` 实现。
final class FamilyTreeTests: XCTestCase {
    private func world() throws -> NativeEngine {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        engine.advance(days: 40)
        return engine
    }
    private func cleanup() { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil }
    private func decode(_ data: Data?) throws -> FamilyTree { try JSONDecoder().decode(FamilyTree.self, from: XCTUnwrap(data)) }
    /// 有成员的家族键（按键排序，结果稳定）。
    private func houses(_ r: JS) -> [String] {
        r.kin.families.objectKeys.sorted().filter { !r.kin.families[$0].memberIds.isNull && r.kin.families[$0].memberIds.length > 0 }
    }

    /// 族谱读取原先对人物记录用强制取值（`isAlive.asBool`、`memberIds.asArray`、成员 `asInt`、特质 `asString`），
    /// 旧档或手改存档里缺字段、类型不符的记录会让引擎 fatalError、整个 App 闪退。现在这些记录照常出谱。
    func testCorruptRecordsDoNotCrashTheEngine() throws {
        let engine = try world(); defer { cleanup() }
        let r = engine.run
        func living(_ k: String) -> [Int] { r.kin.families[k].memberIds.asArray.map(\.asInt).filter { People.person(r, $0)?.isAlive.optionalBool == true } }
        let key = try XCTUnwrap(houses(r).first { living($0).count >= 2 })
        let fam = r.kin.families[key]
        var seen = Set<Int>()
        let ids = fam.memberIds.asArray.map(\.asInt).filter { People.person(r, $0) != nil && seen.insert($0).inserted }
        let alive = living(key)
        let a = try XCTUnwrap(People.person(r, alive[0])), b = try XCTUnwrap(People.person(r, alive[1]))
        a.delete("isAlive")                                  // 缺 isAlive
        b.traits = .array([JS(3), JS("Brave"), .null])       // 特质里混入数字与空值
        b.roles = JS.object()                                // roles 不是数组
        b.age = JS(Double.nan)                               // 年龄非数
        a.fatherId = JS("x"); a.spouseId = a.id.clone()      // 父亲 ID 类型错、自己是自己的配偶
        fam.memberIds.push(JS("7")); fam.memberIds.push(JS(987_654_321)); fam.memberIds.push(a.id.clone()); fam.memberIds.push(.null)
        fam.headId = JS("head")
        let tree = try decode(engine.familyTree(key))
        XCTAssertEqual(tree.members.map(\.id), ids, "非法、无对应人物与重复的成员 ID 被略去，其余顺序不变")
        XCTAssertEqual(tree.head, 0)
        XCTAssertTrue(tree.byId[alive[0]]!.alive, "缺 isAlive 且无卒年者视为在世")
        XCTAssertEqual(tree.byId[alive[1]]!.age, 0)
        XCTAssertEqual(tree.byId[alive[1]]!.traits.count, 1, "特质只取字符串项")
        XCTAssertNil(tree.spouse(of: tree.byId[alive[0]]!), "自己不是自己的配偶")
        XCTAssertEqual(tree.generations.flatMap { $0 }.count, tree.members.count)
        // 成员表根本不是数组、家族不存在：不闪退，前者为空谱，后者无数据（页面显示失败与重试）。
        fam.memberIds = JS.object()
        XCTAssertEqual(try decode(engine.familyTree(key)).members.count, 0)
        XCTAssertNil(engine.familyTree("no-such-house"))
    }

    /// 真实页面流程：每个家族都能出谱；婚配、添丁、处死后再读，族谱随之变化；连续开合不改世界。
    func testEveryHouseOpensAndActionsShowUp() throws {
        let engine = try world(); defer { cleanup() }
        let r = engine.run
        let keys = houses(r)
        XCTAssertFalse(keys.isEmpty)
        for key in keys {
            let tree = try decode(engine.familyTree(key))
            XCTAssertEqual(Set(tree.members.map(\.id)).count, tree.members.count, "成员 ID 唯一：\(key)")
            XCTAssertEqual(tree.generations.flatMap { $0 }.count, tree.members.count)
        }
        let before = r.json
        for _ in 0..<20 { for key in keys.prefix(5) { _ = engine.familyTree(key) } }
        XCTAssertEqual(r.json, before, "读族谱不改世界")
        // 为一位在世、未婚的成年人婚配（文化无人名表者引擎会给出原因，换下一位）。
        var picked: (String, FamilyTree.Member, Int)?
        search: for key in keys {
            let t = try decode(engine.familyTree(key))
            for m in t.members where m.alive && m.age >= 18 && m.age <= 40 && m.spouse == 0 {
                if engine.familyAction(m.id, action: "spouse").ok { picked = (key, m, t.members.count); break search }
            }
        }
        let (key, m, n0) = try XCTUnwrap(picked)
        let t1 = try decode(engine.familyTree(key))
        XCTAssertEqual(t1.members.count, n0 + 1)
        XCTAssertNotNil(t1.spouse(of: t1.byId[m.id]!))
        let child = engine.familyAction(m.id, action: "child")
        if child.ok { XCTAssertEqual(try decode(engine.familyTree(key)).members.count, n0 + 2) }
        XCTAssertTrue(engine.familyAction(m.id, action: "kill").ok)
        XCTAssertFalse(try decode(engine.familyTree(key)).byId[m.id]!.alive)
        XCTAssertFalse(engine.familyAction(m.id, action: "kill").ok, "已故者不能再处死，原因可见")
        // 切换国家后再开族谱（不同家族）仍正常。
        for key in keys.reversed().prefix(3) { XCTAssertNotNil(engine.familyTree(key)) }
    }

    /// 「设定年龄」要经得起按月重算：以前只改 age 不改生年，下个月就被改回去。
    func testSetAgeSurvivesMonthlyAging() throws {
        let engine = try world(); defer { cleanup() }
        let r = engine.run
        let key = try XCTUnwrap(houses(r).first)
        let m = try XCTUnwrap(try decode(engine.familyTree(key)).members.first { $0.alive })
        XCTAssertTrue(engine.renamePerson(m.id, first: nil, last: nil, age: 33).ok)
        engine.advance(days: 70)
        let now = try XCTUnwrap(try decode(engine.familyTree(key)).byId[m.id])
        if now.alive { XCTAssertEqual(now.age, 33) }
    }

    /// 解码宽容：缺字段、类型错的单个成员不连累整页；重复 ID 只留一位。
    func testDecodeToleratesBrokenMembers() throws {
        let json = """
        {"surname":"李","head":9,"members":[
          {"id":1,"name":"甲","female":false,"age":60,"alive":true,"father":0,"mother":0,"spouse":2,"title":"家主","traits":["勇敢"],"skills":[1,2,3,4]},
          {"id":2,"name":"乙","age":58.5},
          {"id":"3","name":"坏ID"},
          {"id":0,"name":"零"},
          {"id":4,"name":"丁","age":null,"father":1.0,"skills":[1,2]},
          {"id":1,"name":"重复"},
          {"name":"无ID"}, 5, null
        ]}
        """
        let t = try JSONDecoder().decode(FamilyTree.self, from: Data(json.utf8))
        XCTAssertEqual(t.members.map(\.id), [1, 2, 4])
        XCTAssertEqual(t.byId[1]?.name, "甲")
        XCTAssertNil(t.headMember, "家主不在成员中")
        XCTAssertEqual(t.byId[4]?.skills, [50, 50, 50, 50])
        XCTAssertEqual(t.generations.map { $0.map(\.id) }, [[1, 2], [4]])
        // 整体残缺：仍然解码为空谱。
        let empty = try JSONDecoder().decode(FamilyTree.self, from: Data("{}".utf8))
        XCTAssertTrue(empty.members.isEmpty); XCTAssertTrue(empty.generations.isEmpty)
    }

    /// 分代：亲缘成环、自为父母、父母缺失、超长世系与大家族都能在有限步内分好代。
    func testGenerationsSurviveCyclesAndDeepLines() {
        typealias M = FamilyTree.Member
        // 环：1 的父亲是 2，2 的父亲是 1；3 是自己的父亲；5 的父亲 99 不在族中。
        let cyc = FamilyTree(surname: "", head: 1, members: [M(id: 1, name: "a", age: 50, father: 2), M(id: 2, name: "b", age: 40, father: 1),
                                                            M(id: 3, name: "c", age: 30, father: 3), M(id: 5, name: "e", age: 20, father: 99, mother: 1)])
        XCTAssertEqual(cyc.generations.flatMap { $0 }.count, 4)
        XCTAssertEqual(Set(cyc.generations[0].map(\.id)).isSuperset(of: [3]), true)
        // 5 的父亲不在族中，按母亲 1 排在 1 的下一代。
        let d = Dictionary(uniqueKeysWithValues: cyc.generations.enumerated().flatMap { g, ms in ms.map { ($0.id, g) } })
        XCTAssertEqual(d[5], d[1]! + 1)
        // 一万代单传：迭代计算，不爆栈。
        let deep = (1...10_000).map { M(id: $0, name: "\($0)", age: Double(10_000 - $0), father: $0 - 1) }
        let t = FamilyTree(surname: "", head: 1, members: deep.shuffled())
        XCTAssertEqual(t.generations.count, 10_000)
        XCTAssertEqual(t.generations[9_999].first?.id, 10_000)
        // 大家族：三千人、十代，分代结果与人数一致，同代内年长在前。
        var big = [M]()
        for i in 1...3_000 { big.append(M(id: i, name: "\(i)", age: Double(i % 90), father: i > 300 ? i - 300 : 0)) }
        let bt = FamilyTree(surname: "", head: 1, members: big)
        XCTAssertEqual(bt.generations.count, 10)
        XCTAssertEqual(bt.generations.flatMap { $0 }.count, 3_000)
        for g in bt.generations { XCTAssertEqual(g.map(\.age), g.map(\.age).sorted(by: >)) }
        XCTAssertEqual(FamilyTree.numeral(1), "一"); XCTAssertEqual(FamilyTree.numeral(10), "十"); XCTAssertEqual(FamilyTree.numeral(13), "十三"); XCTAssertEqual(FamilyTree.numeral(25), "25")
    }
}
