import XCTest
@testable import LieguojiCore

/// 国色分明: neighbours are told apart at a glance.
final class NationColorsTests: XCTestCase {
    private func capitals(_ n: Int, seed: UInt64) -> [(x: Double, y: Double)] {
        var s = seed
        func next() -> Double { s = (s &* 6364136223846793005 &+ 1442695040888963407); return Double(s >> 33) / Double(1 << 31) }
        return (0..<n).map { _ in (x: next() * 1600, y: next() * 900) }
    }
    private func nearest(_ c: [(x: Double, y: Double)], _ i: Int, _ k: Int) -> [Int] {
        Array(c.indices.filter { $0 != i }.sorted { hypot(c[$0].x - c[i].x, c[$0].y - c[i].y) < hypot(c[$1].x - c[i].x, c[$1].y - c[i].y) }.prefix(k))
    }

    func testThePaletteItselfIsDistinct() {
        let p = NationColors.palette
        XCTAssertEqual(Set(p).count, p.count)
        for i in p.indices { for j in p.indices where j > i { XCTAssertGreaterThan(NationColors.difference(p[i], p[j]), 8, "\(p[i]) \(p[j])") } }
    }

    /// From a dozen to a hundred and sixty states: a state and its four nearest never wear colours
    /// closer than ΔE 18. The original's by-index palette came as close as ΔE 10 between neighbours.
    func testNeighboursDiffer() {
        for n in [2, 8, 12, 24, 40, 80, 160] {
            for trial in 0..<4 {
                let c = capitals(n, seed: UInt64(n * 31 + trial))
                let colors = NationColors.assign(capitals: c)
                XCTAssertEqual(colors.count, n)
                for i in 0..<n {
                    for j in nearest(c, i, 4) {
                        XCTAssertGreaterThan(NationColors.difference(colors[i], colors[j]), 18, "\(n) states, trial \(trial): \(i) \(colors[i]) beside \(j) \(colors[j])")
                    }
                }
            }
        }
    }

    /// The preview is in map units and the finished world in its own scale: the colours agree.
    func testTheSameColoursAtAnyScale() {
        let c = capitals(24, seed: 5)
        let scaled = c.map { (x: $0.x * 3.75, y: $0.y * 3.75) }
        XCTAssertEqual(NationColors.assign(capitals: c), NationColors.assign(capitals: scaled))
        XCTAssertEqual(NationColors.assign(capitals: c), NationColors.assign(capitals: c))
        XCTAssertTrue(NationColors.assign(capitals: []).isEmpty)
    }
}
