import XCTest
@testable import LieguojiCore

final class AdvanceOwnershipTests: XCTestCase {
    func testPauseCanDrainButResumeRejectsTheOldReply() {
        var gate = AdvanceOwnership()
        let playing = gate.begin(world: 4)
        XCTAssertTrue(gate.owns(playing, world: 4), "pause does not discard an already accepted tail")
        let resumed = gate.begin(world: 4)
        XCTAssertFalse(gate.owns(playing, world: 4))
        XCTAssertTrue(gate.owns(resumed, world: 4))
    }
    func testSwitchingWorldRejectsReplyWithoutWaitingForAnotherPlay() {
        var gate = AdvanceOwnership()
        let old = gate.begin(world: 4)
        XCTAssertFalse(gate.owns(old, world: 5))
    }
    func testReverseDecodeCompletionDoesNotMoveTheClockBack() {
        var gate = AdvanceOwnership()
        let old = gate.begin(world: 2), newest = gate.begin(world: 2)
        var displayedDay = 10
        for (ticket, day) in [(newest, 14), (old, 11)] {
            if gate.owns(ticket, world: 2) { displayedDay = day }
        }
        XCTAssertEqual(displayedDay, 14)
    }
    func testSingleStepSupersedesTheOldLoopButNotItsWorld() {
        var gate = AdvanceOwnership()
        let loop = gate.begin(world: 1), single = gate.begin(world: 1)
        XCTAssertEqual(loop.world, single.world)
        XCTAssertFalse(gate.owns(loop, world: 1))
        XCTAssertTrue(gate.owns(single, world: 1))
    }
    func testActorRejectsOldQueuedProducerAfterNewerStepWasAdmitted() throws {
        var session = AdvanceSession()
        let world = try XCTUnwrap(session.replaceWorld(world: 1))
        XCTAssertTrue(session.admit(revision: world, producer: 1))
        XCTAssertTrue(session.admit(revision: world, producer: 2))
        XCTAssertFalse(session.admit(revision: world, producer: 1))
        XCTAssertTrue(session.admit(revision: world, producer: 2), "one loop can request more than one batch")
    }
    func testOldQueuedRequestCannotAdvanceReplacementWorld() throws {
        var session = AdvanceSession()
        let old = try XCTUnwrap(session.replaceWorld(world: 1))
        XCTAssertTrue(session.admit(revision: old, producer: 100))
        let current = try XCTUnwrap(session.replaceWorld(world: 2))
        XCTAssertFalse(session.admit(revision: old, producer: 101))
        XCTAssertTrue(session.admit(revision: current, producer: 1), "producer ordering is local to a world")
    }
    func testOlderWorldOpenCannotReplaceANewerWorld() throws {
        var session = AdvanceSession()
        let current = try XCTUnwrap(session.replaceWorld(world: 8))
        XCTAssertNil(session.replaceWorld(world: 7))
        XCTAssertEqual(session.revision, current)
        XCTAssertTrue(session.admit(revision: current, producer: 1))
    }
}
