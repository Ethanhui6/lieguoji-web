import XCTest
@testable import LieguojiCore

final class MapWorkRevisionTests: XCTestCase {
    func testSelectingBorderDoesNotCancelPendingTint() {
        var revisions = MapWorkRevision()
        let tint = revisions.changeAppearance()
        let border = revisions.changeOutlines()
        XCTAssertTrue(revisions.acceptsAppearance(tint))
        XCTAssertTrue(revisions.acceptsOutlines(border))
    }
    func testSelectingBorderDoesNotCancelConquestCityAndProvinceMarks() {
        var revisions = MapWorkRevision()
        let conquest = revisions.replaceMap()
        let border = revisions.changeOutlines()
        XCTAssertTrue(revisions.acceptsMap(conquest))
        XCTAssertTrue(revisions.acceptsAppearance(conquest))
        XCTAssertFalse(revisions.acceptsOutlines(conquest))
        XCTAssertTrue(revisions.acceptsOutlines(border))
    }
    func testNewTintKeepsConquestGeometryAndBorders() {
        var revisions = MapWorkRevision()
        let conquest = revisions.replaceMap()
        let tint = revisions.changeAppearance()
        XCTAssertTrue(revisions.acceptsMap(conquest))
        XCTAssertTrue(revisions.acceptsOutlines(conquest))
        XCTAssertFalse(revisions.acceptsAppearance(conquest))
        XCTAssertTrue(revisions.acceptsAppearance(tint))
    }
    func testReplacingMapRejectsEveryOldResult() {
        var revisions = MapWorkRevision()
        let oldMap = revisions.replaceMap()
        let oldTint = revisions.changeAppearance()
        let oldBorder = revisions.changeOutlines()
        let current = revisions.replaceMap()
        for work in [oldMap, oldTint, oldBorder] {
            XCTAssertFalse(revisions.acceptsMap(work))
            XCTAssertFalse(revisions.acceptsAppearance(work))
            XCTAssertFalse(revisions.acceptsOutlines(work))
        }
        XCTAssertTrue(revisions.acceptsMap(current))
        XCTAssertTrue(revisions.acceptsAppearance(current))
        XCTAssertTrue(revisions.acceptsOutlines(current))
    }
    func testNewAppearanceAndOutlineEachRejectTheirOwnOlderResult() {
        var revisions = MapWorkRevision()
        let oldTint = revisions.changeAppearance()
        let oldBorder = revisions.changeOutlines()
        let tint = revisions.changeAppearance()
        let border = revisions.changeOutlines()
        XCTAssertFalse(revisions.acceptsAppearance(oldTint))
        XCTAssertFalse(revisions.acceptsOutlines(oldBorder))
        XCTAssertTrue(revisions.acceptsAppearance(tint))
        XCTAssertTrue(revisions.acceptsOutlines(border))
    }

    /// 高倍速时归属每半秒变一次而后台重算更慢：旧一点的地图结果也要能先装上（不比屏幕上的旧），
    /// 但不能盖掉已经装上的更新结果，也不能用切换视图之前的颜色。
    func testOlderMapColoursInstallUntilANewerOneArrives() {
        var revisions = MapWorkRevision()
        let first = revisions.replaceMap()
        let second = revisions.replaceMap()
        XCTAssertTrue(revisions.acceptsColours(first))
        revisions.installColours(first)
        XCTAssertTrue(revisions.acceptsColours(second))
        revisions.installColours(second)
        XCTAssertFalse(revisions.acceptsColours(first), "旧结果不能盖掉更新的")
        let third = revisions.replaceMap()
        _ = revisions.changeAppearance()
        XCTAssertFalse(revisions.acceptsColours(third), "视图换了，按旧视图算的颜色作废")
        let view = revisions.changeAppearance()
        XCTAssertTrue(revisions.acceptsColours(view))
        XCTAssertTrue(revisions.acceptsGeometry(third))
        revisions.installGeometry(third)
        XCTAssertFalse(revisions.acceptsGeometry(second))
        let border = revisions.changeOutlines()
        XCTAssertFalse(revisions.acceptsOutlineGeometry(third))
        XCTAssertTrue(revisions.acceptsOutlineGeometry(border))
    }
}
