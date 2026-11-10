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
}
