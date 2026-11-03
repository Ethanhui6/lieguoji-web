import XCTest
@testable import LieguojiCore

final class FrontGuardTests: XCTestCase {
    func testKeepsOneDefenderAndReleasesItWhenThreatLeaves() {
        let forces = [FrontGuard.Force(id: "small", troops: 700, available: true),
                      FrontGuard.Force(id: "large", troops: 2400, available: true)]
        XCTAssertEqual(FrontGuard.choose(forces, threatened: true), "large")
        XCTAssertNil(FrontGuard.choose(forces, threatened: false))
        XCTAssertEqual(FrontGuard.choose([forces[0]], threatened: true), "small")
    }
    func testDoesNotStealManualRetreatingOrDestroyedFormations() {
        let forces = [FrontGuard.Force(id: "manual", troops: 9999, available: false),
                      FrontGuard.Force(id: "destroyed", troops: 0, available: true),
                      FrontGuard.Force(id: "ready", troops: 800, available: true)]
        XCTAssertEqual(FrontGuard.choose(forces, threatened: true), "ready")
    }
    func testTiesAreIndependentOfSnapshotArrayOrder() {
        let forces = [FrontGuard.Force(id: "b", troops: 800, available: true),
                      FrontGuard.Force(id: "a", troops: 800, available: true)]
        XCTAssertEqual(FrontGuard.choose(forces, threatened: true), "a")
        XCTAssertEqual(FrontGuard.choose(Array(forces.reversed()), threatened: true), "a")
    }
}
