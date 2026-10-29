import XCTest
@testable import LieguojiCore
final class FrameStatisticsTests: XCTestCase {
    func testRefreshRateAndOutliers() {
        var stats = FrameStatistics()
        for _ in 0..<200 { stats.record(seconds: 1.0 / 120) }
        XCTAssertEqual(stats.averageMilliseconds, 1000.0 / 120, accuracy: 0.001)
        XCTAssertEqual(stats.onePercentLow, 120, accuracy: 0.001)
        stats.record(seconds: 0.1)
        XCTAssertLessThan(stats.onePercentLow, 30)
    }
    func testBoundedAndInvalidSamples() {
        var stats = FrameStatistics()
        stats.record(seconds: .nan); stats.record(seconds: -1)
        XCTAssertEqual(stats.averageMilliseconds, 0)
        for _ in 0..<300 { stats.record(seconds: 0.01) }
        XCTAssertEqual(stats.samples.count, 240)
    }
}
