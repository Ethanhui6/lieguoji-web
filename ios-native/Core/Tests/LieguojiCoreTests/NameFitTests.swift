import XCTest
@testable import LieguojiCore

/// 国名排布：相撞时先缩小、再在本国境内挪开，不直接消失；挪开不出国境；上一帧的位置优先（不闪）。
final class NameFitTests: XCTestCase {
    private func box(_ x: Double, _ y: Double, _ w: Double, _ h: Double, _ text: String) -> NameFit.Box {
        NameFit.Box(x: x, y: y, halfW: w, halfH: h, angle: 0, nation: true, text: text)
    }

    func testFreeNameStaysWhereItIs() {
        let fit = NameFit.place(box(100, 100, 30, 10, "甲"), taken: [], margin: 0, minHalfH: 3, preferred: nil, inside: nil)
        XCTAssertEqual(fit?.index, 0)
        XCTAssertEqual(fit?.box.x, 100)
    }

    func testCrowdedNameShrinksBeforeGivingUp() {
        // 右侧紧挨着一个已排好的大名：原大相撞，缩小一档后就放得下。
        let big = box(150, 100, 22, 12, "大国")
        let fit = NameFit.place(box(100, 100, 30, 10, "小国"), taken: [big], margin: 0, minHalfH: 3, preferred: nil, inside: nil)
        XCTAssertNotNil(fit, "相撞时应先缩小而不是消失")
        XCTAssertLessThan(fit!.box.halfW, 30)
    }

    func testCoveredNameMovesWithinItsLand() {
        // 原位被大名整片压住（缩小也躲不开）；国境是 y∈[60, 140] 的横条：上下挪开后仍在境内。
        let cover = box(100, 100, 60, 9, "大国")
        let inside: (Double, Double) -> Bool = { _, y in y >= 60 && y <= 140 }
        let fit = NameFit.place(box(100, 100, 24, 8, "小国"), taken: [cover], margin: 0, minHalfH: 3, preferred: nil, inside: inside)
        XCTAssertNotNil(fit)
        XCTAssertNotEqual(fit!.box.y, 100)
        XCTAssertTrue(fit!.box.corners().allSatisfy { inside($0.x, $0.y) }, "挪开后不能出国境")
        // 没有境内判定（分组名）时只缩小不挪位：放不下就等放大。
        XCTAssertNil(NameFit.place(box(100, 100, 24, 8, "小国"), taken: [cover], margin: 0, minHalfH: 3, preferred: nil, inside: nil))
        // 境外的位置不取：国境太窄时宁可隐去。
        XCTAssertNil(NameFit.place(box(100, 100, 24, 8, "小国"), taken: [cover], margin: 0, minHalfH: 3, preferred: nil, inside: { _, y in abs(y - 100) < 9 }))
    }

    func testOneProvinceStateIsNotHiddenByItsOwnCapital() {
        // 单州小国：首都圈占住名字原位（缩小也躲不开），国境只够放下名字中心，放不下整个名字。
        // 宁可略出国境也要显示，且名字中心仍在本国境内。
        let ring = NameFit.Box(x: 100, y: 100, halfW: 9, halfH: 9, angle: 0, nation: false, text: "")
        let inside: (Double, Double) -> Bool = { _, y in abs(y - 100) < 22 }
        let fit = NameFit.place(box(100, 100, 30, 8, "丰后帝国"), taken: [ring], margin: 0, minHalfH: 3, preferred: nil, inside: inside)
        XCTAssertNotNil(fit, "单州小国的名字不能在任何缩放下都看不到")
        XCTAssertTrue(inside(fit!.box.x, fit!.box.y))
        XCTAssertFalse(NameFit.clash(ring, fit!.box, margin: 0))
    }

    func testPreviousSlotIsTriedFirst() {
        // 原位此时也放得下，但上一帧用的是挪开的位置：仍用它，名字不来回跳。
        let fit = NameFit.place(box(100, 100, 24, 8, "小国"), taken: [], margin: 0, minHalfH: 3, preferred: 3, inside: { _, _ in true })
        XCTAssertEqual(fit?.index, 3)
    }

    func testTooSmallToReadIsHidden() {
        let cover = box(100, 100, 60, 9, "大国")
        XCTAssertNil(NameFit.place(box(100, 100, 24, 4, "小国"), taken: [cover], margin: 0, minHalfH: 3.5, preferred: nil, inside: nil))
    }
}
