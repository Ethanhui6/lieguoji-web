import XCTest
@testable import LieguojiCore

final class IosTraitRulesTests: XCTestCase {
    override func tearDown() {
        IosTraitRules.enabled = false
        super.tearDown()
    }

    func testDisabledIsNoOp() {
        IosTraitRules.enabled = false
        let r = JS.object()
        r.world = .object(); r.world.day = JS(30); r.world.nations = .array()
        r.regimes = .object()
        IosTraitRules.monthly(r)
        XCTAssertTrue(r.regimes.iosCorruption.isNull)
    }

    func testSimplifiedConstants() {
        XCTAssertEqual(IosTraitRules.SIMPLIFIED_reformSpan, 20)
        XCTAssertEqual(IosTraitRules.SIMPLIFIED_corruptionGold, 0.004, accuracy: 1e-9)
        XCTAssertEqual(IosTraitRules.SIMPLIFIED_baseBuildMonths, 6)
        XCTAssertEqual(IosTraitRules.SIMPLIFIED_hullPerShip, 100)
        // ShipMaster localization ×0.5 → 3 month interval.
        XCTAssertEqual(max(1, Int((Double(IosTraitRules.SIMPLIFIED_baseBuildMonths) * 0.5).rounded())), 3)
    }

    func testCorruptionClamp() {
        IosTraitRules.enabled = true
        let r = JS.object()
        r.regimes = .object()
        IosTraitRules.setCorruption(r, "n-0", 250)
        XCTAssertEqual(IosTraitRules.corruption(r, "n-0"), 100)
        IosTraitRules.setCorruption(r, "n-0", -250)
        XCTAssertEqual(IosTraitRules.corruption(r, "n-0"), -100)
    }
}
