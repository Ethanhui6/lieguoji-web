import XCTest
@testable import LieguojiCore

/// 同盟图：同盟各有分明且稳定的墨色，不在同盟者淡纸色，图例列成员，地图写同盟名。
final class AllianceViewTests: XCTestCase {
    private func world() throws -> NativeEngine {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let resources = dir.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources")
        try NativeEngine.loadCatalogs(traits: Data(contentsOf: resources.appendingPathComponent("Catalog/traits.json")),
                                      nobleCultures: Data(contentsOf: resources.appendingPathComponent("Catalog/noble-cultures.json")),
                                      cultures: Data(contentsOf: resources.appendingPathComponent("World/cultures.json")))
        let engine = try NativeEngine(world: Data(contentsOf: dir.appendingPathComponent("Golden/bridge-world.json")))
        engine.enableAppRules()
        return engine
    }
    private func cleanup() { Session.uninstall(); UnitKinds.enabled = false; DeclarationEngine.temper = nil; DeclarationEngine.pact = nil; DeclarationEngine.stance = nil; ArmyAutonomy.temper = nil }
    private func view(_ e: NativeEngine) throws -> JS { try JS.parse(e.view("alliance")) }
    private func fill(_ v: JS, of nation: Int, _ e: NativeEngine) -> String? {
        let id = e.run.world.nations[nation].id.asString
        guard let p = e.run.world.provinces.asArray.firstIndex(where: { $0.controller.optionalString == id }) else { return nil }
        return v.fills[p].asString
    }

    func testAlliancesHaveDistinctStableColoursAndMembers() throws {
        let e = try world(); defer { cleanup() }
        let r = e.run
        // 先解散所有现有同盟，从「无同盟」开始。
        for i in 0..<r.world.nations.length { _ = e.alliance(i, with: -1) }
        let alive = (0..<r.world.nations.length).filter { i in Vassals.alive(r, r.world.nations[i].id.asString) && r.world.provinces.asArray.contains { $0.controller.optionalString == r.world.nations[i].id.asString } }
        XCTAssertGreaterThanOrEqual(alive.count, 5)
        // 无同盟：全图淡纸色，图例只有「不在同盟」。
        var v = try view(e)
        XCTAssertTrue(v.fills.asArray.allSatisfy { $0.asString == NativeEngine.unaligned || $0.asString == "#ffffff" })
        XCTAssertEqual(v.legend.asArray.map { $0.key.asString }, ["none"])
        // 地名栅格只存在于完整世界（测试世界没有时不出名字框）。
        let named = !e.statics.labelGrid.isNull
        if named { XCTAssertGreaterThan(v.labels.length, 0, "不在同盟的国家仍写本国名") }
        // 两个同盟：颜色互不相同、都不是淡纸色；图例列出成员；地图上写同盟名。
        let (a, b, c, d, x) = (alive[0], alive[1], alive[2], alive[3], alive[4])
        XCTAssertTrue(e.alliance(a, with: b).ok); XCTAssertTrue(e.alliance(c, with: d).ok)
        v = try view(e)
        let first = try XCTUnwrap(fill(v, of: a, e)), second = try XCTUnwrap(fill(v, of: c, e))
        XCTAssertEqual(fill(v, of: b, e), first); XCTAssertEqual(fill(v, of: d, e), second)
        XCTAssertNotEqual(first, second); XCTAssertNotEqual(first, NativeEngine.unaligned)
        XCTAssertEqual(fill(v, of: x, e), NativeEngine.unaligned)
        let rows = v.legend.asArray.filter { $0.key.asString.hasPrefix("alliance:") }
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(Set(rows.flatMap { $0.members.asArray.map(\.asInt) }), [a, b, c, d])
        XCTAssertEqual(v.legend.asArray.last?.key.asString, "none")
        let pactNames = Set(rows.map { $0.name.asString })
        if named { XCTAssertTrue(v.labels.asArray.contains { pactNames.contains($0.name.asString) }, "同盟区域写同盟名") }
        // 成员加入、退出：另一同盟颜色不变；图例成员随之更新。
        XCTAssertTrue(e.alliance(x, with: a).ok)
        v = try view(e)
        XCTAssertEqual(fill(v, of: x, e), first); XCTAssertEqual(fill(v, of: c, e), second)
        XCTAssertTrue(v.legend.asArray.contains { Set($0.members.isNull ? [] : $0.members.asArray.map(\.asInt)) == [a, b, x] })
        XCTAssertTrue(e.alliance(x, with: -1).ok)
        v = try view(e)
        XCTAssertEqual(fill(v, of: x, e), NativeEngine.unaligned); XCTAssertEqual(fill(v, of: c, e), second); XCTAssertEqual(fill(v, of: a, e), first)
        // 解散一个同盟：剩下的颜色不变。
        _ = e.alliance(a, with: -1); _ = e.alliance(b, with: -1)
        v = try view(e)
        XCTAssertEqual(fill(v, of: c, e), second)
        XCTAssertEqual(v.legend.asArray.filter { $0.key.asString.hasPrefix("alliance:") }.count, 1)
    }

    /// 地图着色视图闪退回归：分组（家族、文化、宗教……）多于国家时，名字框排布曾按分组号取国家数组而越界闪退
    /// （切到「家族」视图时最常见）。这里逐个视图打开，并在分组多于国家时确认名字框照常给出。
    func testEveryColourViewOpensWhenGroupsOutnumberStates() throws {
        let e = try world(); defer { cleanup() }
        Regimes.enable(e.run)
        e.advance(days: 30)
        let states = e.run.world.nations.length, provinces = e.run.world.provinces.length
        // 名字栅格：每州占一条 6 列 × 40 行的连片格子（测试世界自带的栅格为空，排名字的代码走不到）。
        let rows = 40, cellsX = provinces * 6
        var points = [JS](), cells = [JS]()
        for row in 0..<rows { for column in 0..<cellsX { points += [JS(Double(column) * 2), JS(Double(row) * 2)]; cells.append(JS(column / 6)) } }
        let grid = JS.object(); grid.cellsX = JS(cellsX); grid.points = .array(points); grid.cells = .array(cells)
        e.statics.labelGrid = grid
        var outnumbered = 0
        for mode in ["state", "alliance", "culture", "family", "religion", "polity", "economy", "goods", "region"] {
            let v = try JS.parse(e.view(mode))
            XCTAssertEqual(v.fills.length, e.run.world.provinces.length, mode)
            if !v.labels.isNull, v.legend.length > states { outnumbered += 1; XCTAssertGreaterThan(v.labels.length, 0, mode) }
        }
        XCTAssertGreaterThan(outnumbered, 0, "至少一个视图的分组多于国家（覆盖越界路径）")
    }
}
