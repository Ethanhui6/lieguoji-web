import XCTest
import Foundation
@testable import LieguojiCore

/// 战争晕染：GPU 墨场的落墨公式（CPU 复算验证连续、与帧率无关）、易主扫色、推演状态 → 输入，以及逐顶点易主渐变。
final class ConquestWashTests: XCTestCase {
    /// 方格地图：w × h 个单位方格，每格四个顶点（各格自己的拷贝），横竖相邻的格子共享一条边。
    /// `province(x, y)` 给出每格的州（−1 为海）。
    static func grid(_ w: Int, _ h: Int, extraEdges: [(Int, Int, Float)] = [], province: (Int, Int) -> Int32) -> WashTopology {
        var offsets: [UInt32] = [0], vertices = [Float](), sites = [Float](), prov = [Int32](), land = [Bool]()
        for y in 0..<h { for x in 0..<w {
            let fx = Float(x), fy = Float(y)
            vertices += [fx, fy, fx + 1, fy, fx + 1, fy + 1, fx, fy + 1]
            offsets.append(offsets.last! + 4)
            sites += [fx + 0.5, fy + 0.5]
            let p = province(x, y); prov.append(p); land.append(p >= 0)
        } }
        var edges = [(Int, Int, Float)]()
        for y in 0..<h { for x in 0..<w {
            let c = y * w + x
            if x + 1 < w { edges.append((c, c + 1, 1)) }
            if y + 1 < h { edges.append((c, c + w, 1)) }
        } }
        let count = Int(prov.max() ?? 0) + 1
        return WashTopology(offsets: offsets, vertices: vertices, sites: sites, province: prov, land: land, edges: edges + extraEdges, provinceCount: count)
    }

    func testCornerOnlyContactIsNotConnected() {
        // 2×2：左上与右下是州 0、右上与左下是州 1，再加一条退化（长度 0）的对角边。
        // 州 0 的两格只在角点相接 —— 不算连通；州 0 与州 1 共享真实边，是邻州。
        let t = Self.grid(2, 2, extraEdges: [(0, 3, 0)]) { x, y in (x + y) % 2 == 0 ? 0 : 1 }
        XCTAssertEqual(t.provinceNeighbors[0], [1])
        XCTAssertFalse(t.neighbors(0).contains(3), "角点接触的格子不应相邻")
        // 隔海：只有海格相隔的两州不是邻州。
        let sea = Self.grid(5, 1) { x, _ in x == 2 ? -1 : x < 2 ? 0 : 1 }
        XCTAssertEqual(sea.provinceNeighbors[0], [])
    }

    // MARK: 逐顶点易主渐变

    /// 旧做法（回归对照）：全图一个起点、一份上一版颜色，渐变未完又来新颜色时上一版不更新而起点重置。
    struct LegacyFade {
        var previous: [Float]?
        var colors: [Float]
        var start: Float
        func fading(_ t: Float) -> Bool { previous != nil && t - start < LandFade.duration }
        mutating func set(_ next: [Float], at t: Float) { previous = fading(t) ? previous : colors; start = t; colors = next }
        func shown(_ v: Int, at t: Float) -> Float {
            guard let previous, fading(t) else { return colors[v * 4] }
            return previous[v * 4] + (colors[v * 4] - previous[v * 4]) * LandFade.ease((t - start) / LandFade.duration)
        }
    }

    func testOwnershipFadesNeverSnapBack() {
        // 两个顶点：0 号在 t = 0 易主（红 0 → 1），1 号每 0.5 秒（高倍速下归属每半秒刷新一次）来回变一次。
        var legacy = LegacyFade(previous: nil, colors: [0, 0, 0, 1, 0, 0, 0, 1], start: -100)
        var fade = LandFade(); fade.set([0, 0, 0, 1, 0, 0, 0, 1], at: -10, fade: false)
        var maxJumpLegacy: Float = 0, maxJumpNew: Float = 0
        var lastLegacy: Float = legacy.shown(0, at: 0), lastNew: Float = fade.shown(0, at: 0).x
        var t: Float = 0
        var next: [Float] = [1, 0, 0, 1, 0, 0, 0, 1]
        legacy.set(next, at: 0); fade.set(next, at: 0, fade: true)
        while t < 4 {
            t += 1 / 60
            if Int((t * 60).rounded()) % 30 == 0 { next[4] = next[4] == 0 ? 1 : 0; legacy.set(next, at: t); fade.set(next, at: t, fade: true) }
            let a: Float = legacy.shown(0, at: t), b: Float = fade.shown(0, at: t).x
            maxJumpLegacy = max(maxJumpLegacy, abs(a - lastLegacy)); maxJumpNew = max(maxJumpNew, abs(b - lastNew))
            lastLegacy = a; lastNew = b
        }
        XCTAssertGreaterThan(maxJumpLegacy, 0.5, "旧做法：0 号顶点每次别处易主都被打回旧色（复现闪烁）")
        XCTAssertLessThan(maxJumpNew, 0.1, "逐顶点渐变：0 号顶点只渐变一次，之后保持稳定")
        XCTAssertEqual(fade.shown(0, at: t).x, 1)
    }

    func testFadeRestartsFromTheVisibleColour() {
        var fade = LandFade(); fade.set([0, 0, 0, 1], at: -10, fade: false)
        fade.set([1, 0, 0, 1], at: 0, fade: true)
        let mid = fade.shown(0, at: 0.35).x
        fade.set([0, 0, 0, 1], at: 0.35, fade: true)    // 反攻：又换回去
        XCTAssertEqual(fade.shown(0, at: 0.35).x, mid, accuracy: 1e-6, "新目标以当前可见颜色为起点")
        XCTAssertFalse(fade.fading(at: 1.1))
        XCTAssertEqual(fade.shown(0, at: 1.1).x, 0)
        // 由晕染接手的顶点：底色立即到位。
        fade.set([1, 0, 0, 1], at: 2, fade: true, instant: { _ in true })
        XCTAssertEqual(fade.shown(0, at: 2).x, 1)
    }

    // MARK: 沿格子洇开的战争墨迹（InkCells）

    /// 60 × 20 的方格，10 × 10 一州（12 州）；左边三列州是国 0，右边是国 1，两国交战。
    static func front() -> (topology: WashTopology, owners: [Int]) {
        let t = grid(60, 20) { x, y in Int32(x / 10 + 6 * (y / 10)) }
        let owners = (0..<12).map { $0 % 6 < 3 ? 0 : 1 }
        return (t, owners)
    }
    static func march(_ from: SIMD2<Float>, _ to: SIMD2<Float>, day: Int, key: String = "a", troops: Float = 4000, attacker: Int = 0) -> WashInput {
        WashInput(province: 0, attacker: attacker, kind: .march, day: day, armies: [from, to], troops: troops, key: key)
    }
    static func cellAt(_ x: Int, _ y: Int) -> Int { y * 60 + x }

    func testMarchInksTheEnemyCellsAlongTheRouteOnly() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        ink.apply(WashFrame(day: 1, inputs: [Self.march(SIMD2(32, 5.5), SIMD2(46, 5.5), day: 1)], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        for x in 31...46 { XCTAssertEqual(ink.nation[Self.cellAt(x, 5)], 0, "路线上 x=\(x) 落墨") }
        XCTAssertEqual(ink.nation[Self.cellAt(46, 16)], -1, "远离路线处无墨")
        for y in 0..<20 { for x in 0..<30 { XCTAssertEqual(ink.nation[Self.cellAt(x, y)], -1, "本国领土不落墨") } }
        // 显出跟着军队：起点先显，终点在这一步的动画里后显。
        XCTAssertLessThan(ink.arrive[Self.cellAt(32, 5)], ink.arrive[Self.cellAt(46, 5)])
        // 路线中段的格子完全被墨包住：顶点覆盖比例为 1，显出后墨量为 1。
        let v = t.vertexRange(Self.cellAt(40, 5)).lowerBound
        XCTAssertEqual(ink.level(v, at: 10), 1, accuracy: 1e-5)
    }

    func testTrailStaysWhileTheWarLasts() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        ink.apply(WashFrame(day: 1, inputs: [Self.march(SIMD2(32, 5.5), SIMD2(46, 5.5), day: 1)], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        let before = ink.nation.filter { $0 == 0 }.count
        // 军队走开：半年里每步没有军队经过，墨仍在。
        for d in 2...180 { ink.apply(WashFrame(day: d, inputs: [], enemies: [0: [1]]), owners: owners, now: Float(d), tween: 0.5) }
        XCTAssertEqual(ink.nation.filter { $0 == 0 }.count, before, "走过的地方留着墨")
        XCTAssertTrue(ink.leave.allSatisfy { $0 >= InkCells.never })
    }

    func testCapturedProvinceIsClearedAtOnce() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        ink.apply(WashFrame(day: 1, inputs: [Self.march(SIMD2(32, 5.5), SIMD2(46, 5.5), day: 1)], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        // 州 3（x 30…39, y 0…9）被国 0 攻下：这一州的墨立即全部收起，旁边仍在交战的州 4 的墨留着。
        var next = owners; next[3] = 0
        ink.apply(WashFrame(day: 2, inputs: [], enemies: [0: [1]]), owners: next, now: 1, tween: 0.5)
        for c in t.provinceCells[3] { XCTAssertEqual(ink.nation[Int(c)], -1) }
        XCTAssertEqual(ink.nation[Self.cellAt(44, 5)], 0)
    }

    func testPeaceFadesTheInk() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        ink.apply(WashFrame(day: 1, inputs: [Self.march(SIMD2(32, 5.5), SIMD2(46, 5.5), day: 1)], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        ink.apply(WashFrame(day: 2, inputs: [], enemies: [:]), owners: owners, now: 5, tween: 0.5)
        let v = t.vertexRange(Self.cellAt(40, 5)).lowerBound
        XCTAssertEqual(ink.level(v, at: 5), 1, accuracy: 1e-5, "刚议和时还在")
        XCTAssertEqual(ink.level(v, at: 5 + InkCells.fadeSeconds + 0.01), 0, "随后淡尽")
        ink.apply(WashFrame(day: 3, inputs: [], enemies: [:]), owners: owners, now: 10, tween: 0.5)
        XCTAssertTrue(ink.nation.allSatisfy { $0 == -1 })
    }

    func testCeasefireDoesNotRevealInkThatHadNotArrived() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        let march = Self.march(SIMD2(32, 5.5), SIMD2(46, 5.5), day: 1)
        ink.apply(WashFrame(day: 1, inputs: [march], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        let v = t.vertexRange(Self.cellAt(44, 5)).lowerBound
        let ceasefire: Float = 0.05
        XCTAssertEqual(ink.level(v, at: ceasefire), 0)
        ink.apply(WashFrame(day: 2, inputs: [], enemies: [:]), owners: owners, now: ceasefire, tween: 0.5)
        for elapsed in [Float(0.18), 0.4, 0.6, 0.9] {
            XCTAssertEqual(ink.level(v, at: ceasefire + elapsed), 0, "停战后，尚未抵达的战线不能继续染开")
        }
    }

    func testStationaryDefendersDoNotRestartTheFadeEachDay() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        let position = SIMD2<Float>(44.5, 5.5)
        let march = Self.march(position, position, day: 1)
        let hold = WashInput(province: 4, attacker: 1, kind: .hold, day: 2, armies: [position])
        ink.apply(WashFrame(day: 1, inputs: [march], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        let c = Self.cellAt(44, 5)
        let v = t.vertexRange(c).lowerBound
        let start: Float = 2
        ink.apply(WashFrame(day: 2, inputs: [march, hold], enemies: [0: [1]]), owners: owners, now: start, tween: 0.5)
        XCTAssertEqual(ink.leave[c], start)
        for day in 3...7 {
            let now = start + Float(day - 2) * 0.15
            let before = ink.level(v, at: now)
            ink.apply(WashFrame(day: day, inputs: [march, hold], enemies: [0: [1]]), owners: owners, now: now, tween: 0.5)
            XCTAssertEqual(ink.leave[c], start, "同一片守军足迹只能触发一次退墨")
            XCTAssertEqual(ink.level(v, at: now), before, accuracy: 1e-5)
        }
        ink.apply(WashFrame(day: 8, inputs: [march, hold], enemies: [0: [1]]), owners: owners, now: 4, tween: 0.5)
        XCTAssertEqual(ink.nation[c], -1, "守军未离开时，进攻方不应反复在原地补墨")
    }

    func testCompetingFrontsKeepInkThatWasAlreadyVisible() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        let point = SIMD2<Float>(44.5, 5.5)
        let inputs = [Self.march(point, point, day: 1), Self.march(point, point, day: 1, key: "rival", attacker: 2)]
        let enemies = [0: [1], 2: [1]]
        ink.apply(WashFrame(day: 1, inputs: inputs, enemies: enemies), owners: owners, now: 0, tween: 0.5)
        let v = t.vertexRange(Self.cellAt(44, 5)).lowerBound
        let before = ink.level(v, at: 2)
        XCTAssertGreaterThan(before, 0.75)
        ink.apply(WashFrame(day: 2, inputs: inputs, enemies: enemies), owners: owners, now: 2, tween: 0.5)
        XCTAssertEqual(ink.level(v, at: 2), before, accuracy: 1e-5)
    }

    func testNearbyArmiesInkWiderTogether() {
        let (t, owners) = Self.front()
        let one = InkCells(topology: t)
        one.apply(WashFrame(day: 1, inputs: [Self.march(SIMD2(45.5, 10), SIMD2(45.5, 10), day: 1)], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        let two = InkCells(topology: t)
        two.apply(WashFrame(day: 1, inputs: [Self.march(SIMD2(45.5, 10), SIMD2(45.5, 10), day: 1),
                                             Self.march(SIMD2(47.5, 10), SIMD2(47.5, 10), day: 1, key: "b")], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        let a = one.nation.filter { $0 == 0 }.count, b = two.nation.filter { $0 == 0 }.count
        XCTAssertGreaterThan(Float(b), Float(a) * 1.5, "两军挨近合算兵力，墨更宽且连成一片（单 \(a) 格，两军 \(b) 格）")
        // 有上限：再多也不会铺满一州以上。
        let many = InkCells(topology: t)
        many.apply(WashFrame(day: 1, inputs: (0..<8).map { Self.march(SIMD2(45.5, 10), SIMD2(45.5, 10), day: 1, key: "k\($0)", troops: 20000) }, enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        XCTAssertLessThan(many.nation.filter { $0 == 0 }.count, 200)
    }

    func testStandingStillSpreadsWithDaysAndStops() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        var counts = [Int]()
        for d in 1...40 {
            ink.apply(WashFrame(day: d, inputs: [Self.march(SIMD2(45.5, 10), SIMD2(45.5, 10), day: d)], enemies: [0: [1]]), owners: owners, now: Float(d), tween: 0.5)
            counts.append(ink.nation.filter { $0 == 0 }.count)
        }
        for i in 1..<counts.count { XCTAssertGreaterThanOrEqual(counts[i], counts[i - 1]) }
        XCTAssertGreaterThan(counts[25], counts[0], "驻留越久渗得越开")
        XCTAssertEqual(counts.last!, counts[25], "二十天后不再变大")
    }

    func testSiegeFillsTheProvince() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        let low = WashInput(province: 4, attacker: 0, kind: .siege, progress: 0.2, day: 1, armies: [SIMD2(45, 5)])
        ink.apply(WashFrame(day: 1, inputs: [low], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        let part = t.provinceCells[4].filter { ink.nation[Int($0)] == 0 }.count
        XCTAssertGreaterThan(part, 0); XCTAssertLessThan(part, t.provinceCells[4].count)
        let full = WashInput(province: 4, attacker: 0, kind: .siege, progress: 1, day: 2, armies: [SIMD2(45, 5)])
        ink.apply(WashFrame(day: 2, inputs: [full], enemies: [0: [1]]), owners: owners, now: 1, tween: 0.5)
        XCTAssertEqual(t.provinceCells[4].filter { ink.nation[Int($0)] == 0 }.count, t.provinceCells[4].count, "进度满时铺满全州")
        // 只在被围州内：旁边的州 5 没有墨。
        XCTAssertTrue(t.provinceCells[5].allSatisfy { ink.nation[Int($0)] == -1 })
    }

    func testDefendersPushTheInkBack() {
        let (t, owners) = Self.front()
        let ink = InkCells(topology: t)
        ink.apply(WashFrame(day: 1, inputs: [Self.march(SIMD2(32, 5.5), SIMD2(46, 5.5), day: 1)], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        let hold = WashInput(province: 4, attacker: 1, kind: .hold, day: 3, armies: [SIMD2(44.5, 5.5)])
        ink.apply(WashFrame(day: 3, inputs: [hold], enemies: [0: [1]]), owners: owners, now: 2, tween: 0.5)
        XCTAssertLessThan(ink.leave[Self.cellAt(44, 5)], InkCells.never, "守军身边的敌墨淡去")
        XCTAssertGreaterThanOrEqual(ink.leave[Self.cellAt(33, 5)], InkCells.never, "远处的墨不受影响")
    }

    func testMultiProvinceBranchingFrontAndDefenderResistance() {
        // 30 × 20：左下为国 0 前哨 P0，中下为州 A (x 10..19, y 10..19)，右下为 B 无守军 (x 20..29, y 10..19)，中上为 C 有守军 (x 10..19, y 0..9)
        let t = Self.grid(30, 20) { x, y in
            if x < 10 { return 0 }
            if y >= 10 { return x < 20 ? 1 : 2 }
            return x < 20 ? 3 : -1
        }
        let owners = [0, 1, 1, 1]
        let ink = InkCells(topology: t)
        // 第一步：国 0 占领州 A（owners[1] = 0）并在东侧与北侧推进进入 B(p=2)、C(p=3)
        var stepOwners = owners; stepOwners[1] = 0
        // 先让 A 在西侧落过墨、再换归属与同步推进 B/C，验证多省跨界种子与守军阻滞
        ink.apply(WashFrame(day: 1, inputs: [WashInput(province: 1, attacker: 0, kind: .siege, progress: 0.99, day: 1, armies: [SIMD2(10.5, 14.5)])], enemies: [0: [1]]), owners: owners, now: 0, tween: 0.5)
        let aBefore = t.provinceCells[1].filter { ink.nation[Int($0)] == 0 }.count
        XCTAssertEqual(aBefore, t.provinceCells[1].count)

        // 此时 A 已归 0 并稳住，主力跨过 A-B 东界进围 B（无守军），支路跨过 A-C 北界进围 C（有守军驻于 C 北部）
        let siegeB = WashInput(province: 2, attacker: 0, kind: .siege, progress: 0.52, day: 2, armies: [SIMD2(20.5, 14.5)])
        let siegeC = WashInput(province: 3, attacker: 0, kind: .siege, progress: 0.52, day: 2, armies: [SIMD2(14.5, 9.5)])
        let holdC = WashInput(province: 3, attacker: 1, kind: .hold, day: 2, armies: [SIMD2(14.5, 5.5)], troops: 8000)
        ink.apply(WashFrame(day: 2, inputs: [siegeB, siegeC, holdC], enemies: [0: [1]]), owners: stepOwners, now: 1, tween: 0.5)

        // 1. 边界连续进入：B 紧邻 A 的西缘已有墨，而不是只在中心冒圆斑；C 南缘紧邻 A 有墨，而 C 北侧守军正面保持未陷落
        XCTAssertEqual(ink.nation[14 * 30 + 20], 0, "B 紧邻 A 公共省界处应直接承接墨晕")
        XCTAssertEqual(ink.nation[9 * 30 + 14], 0, "C 紧邻 A 北界应有支路墨晕进入")
        XCTAssertNotEqual(ink.nation[5 * 30 + 14], 0, "C 守军正面core范围内未被提前占墨")
        let covB = t.provinceCells[2].filter { ink.nation[Int($0)] == 0 }.count
        let covC = t.provinceCells[3].filter { ink.nation[Int($0)] == 0 }.count
        XCTAssertGreaterThan(covB, covC, "相同进度下，无守军的 B 推进明显快于有守军的 C（B=\(covB), C=\(covC)）")

        // 2. 守军主动反推：无守军与有守军分离，停战后仅交战双方淡出、不影响仍在交战的第三方
        let holdB = WashInput(province: 2, attacker: 1, kind: .hold, day: 2, armies: [SIMD2(21.5, 14.5)], troops: 12000)
        ink.apply(WashFrame(day: 2, inputs: [holdB], enemies: [0: [1]]), owners: stepOwners, now: 2, tween: 0.5)
        XCTAssertLessThan(ink.leave[14 * 30 + 21], InkCells.never, "同日抵达的守军也能立即从所在格擦退敌墨")

        // 3. 多国同地参战隔离：新增第三国 2 对国 1 落墨，随后 0-1 停战，国 0 墨淡出而国 2 墨保持常亮
        let thirdMarch = WashInput(province: 2, attacker: 2, kind: .march, day: 3, armies: [SIMD2(27.5, 15.5), SIMD2(26.5, 15.5)], troops: 6000, key: "p2")
        ink.apply(WashFrame(day: 3, inputs: [thirdMarch], enemies: [2: [1]]), owners: stepOwners, now: 3, tween: 0.5)
        XCTAssertGreaterThanOrEqual(ink.leave[15 * 30 + 26], InkCells.never, "0-1 议和只消退国 0 墨迹，不影响仍在交战的第三国 2")
    }

    // MARK: 易主扫色

    /// 一行：州 2（新主人 9 的领土）x 0…3，州 0 x 4…11，州 1 x 12…19；高 6 格。
    static func wide() -> WashTopology { grid(20, 6) { x, _ in x < 4 ? 2 : x < 12 ? 0 : 1 } }
    static func vertex(_ t: WashTopology, near p: SIMD2<Float>, in province: Int? = nil) -> Int {
        var best = (0, Float.infinity)
        for v in 0..<t.vertexCount where province == nil || Int(t.vertexProvince[v]) == province! {
            let d = washDistance2(t.position(v), p)
            if d < best.1 { best = (v, d) }
        }
        return best.0
    }

    func testSweepRunsFromTheSeedAcrossTheGroupAsOneFront() {
        let t = Self.wide(), sweep = FlipSweep(topology: t)
        // 反叛：州 0、1 一起归新国，从首都（州 1 东端）扫起；同组共用一条前沿，从离种子最近处起。
        let taken = sweep.start([([0, 1], [SIMD2(19.5, 3)])], recolour: true, now: 10)
        XCTAssertEqual(taken, [0, 1])
        let east = Self.vertex(t, near: SIMD2(19, 3), in: 1), border1 = Self.vertex(t, near: SIMD2(12, 3), in: 1), border0 = Self.vertex(t, near: SIMD2(12, 3), in: 0), west = Self.vertex(t, near: SIMD2(4, 3), in: 0)
        XCTAssertLessThan(sweep.arrive[east], sweep.arrive[border1])
        XCTAssertEqual(sweep.arrive[border1], sweep.arrive[border0], accuracy: 1e-5, "州界两侧同一位置同时到达（跨州连续）")
        XCTAssertLessThan(sweep.arrive[border0], sweep.arrive[west])
        XCTAssertEqual(sweep.arrive[east], 10, accuracy: 0.05, "从离种子最近处立即起")
        XCTAssertLessThanOrEqual(sweep.arrive[west] - 10, FlipSweep.maxSeconds + 1e-4, "一组总时长有上限")
        XCTAssertLessThan(sweep.reached(west, at: 10), 0.01)
        XCTAssertGreaterThan(sweep.reached(west, at: sweep.arrive[west] + FlipSweep.edge), 0.99)
        // 墨圈不打断正在换色的州；扫完收尾回收。
        XCTAssertEqual(sweep.start([([0], [])], recolour: false, now: 10.5), [])
        XCTAssertTrue(sweep.animating(at: 11))
        sweep.tick(30)
        XCTAssertTrue(sweep.isEmpty)
        XCTAssertTrue(sweep.active.isEmpty)
        XCTAssertEqual(sweep.mode[west], -1)
    }

    func testSeparateCapturesSweepFromTheirOwnArmies() {
        let t = Self.wide(), sweep = FlipSweep(topology: t)
        sweep.start([([0], [SIMD2(5, 3)]), ([1], [SIMD2(18, 3)])], recolour: true, now: 0)
        let a = Self.vertex(t, near: SIMD2(5, 3), in: 0), b = Self.vertex(t, near: SIMD2(18, 3), in: 1)
        XCTAssertEqual(sweep.arrive[a], 0, accuracy: 0.05)
        XCTAssertEqual(sweep.arrive[b], 0, accuracy: 0.05, "各自从自己的军队起扫，不等另一处")
        XCTAssertLessThan(sweep.arrive[a], sweep.arrive[Self.vertex(t, near: SIMD2(11, 0), in: 0)])
        // 再次易手：重新从新种子扫起。
        sweep.start([([0], [SIMD2(11, 5)])], recolour: true, now: 1)
        XCTAssertGreaterThan(sweep.arrive[a], sweep.arrive[Self.vertex(t, near: SIMD2(11, 5), in: 0)])
        sweep.clear()
        XCTAssertTrue(sweep.isEmpty)
    }

    // MARK: 推演状态 → 输入

    static func army(_ id: String, nation: Int, province: Int, x: Float, y: Float, troops: Int = 100) -> GameState.Army {
        GameState.Army(id: id, name: id, nation: nation, troops: troops, unit: "Infantry", status: "idle", travel: "idle", province: province, supplies: 0, morale: 0, x: x, y: y, manual: false, destination: nil, mission: nil)
    }
    static func nation(_ enemies: [Int]) -> GameState.Nation {
        GameState.Nation(provinces: 1, cities: 0, population: 0, grain: 0, troops: 0, gold: 0, destiny: 0, enemies: enemies, alive: true)
    }
    static func state(_ owners: [Int], nations: [GameState.Nation], armies: [GameState.Army] = [], sieges: [GameState.Siege] = [], day: Int) -> GameState {
        GameState(day: day, date: .init(year: 1, month: 1, day: 1), owners: owners, labels: nil, nations: nations, armies: armies, wars: [], sieges: sieges, events: [])
    }

    func testFrameFromStates() {
        // 国 0 与国 1 交战，国 2 中立。州 0、1 属国 0，州 2 属国 1，州 3 属国 2。
        let nations = [Self.nation([1]), Self.nation([0]), Self.nation([])]
        let a = Self.state([0, 0, 1, 2], nations: nations, armies: [Self.army("m", nation: 1, province: 0, x: 1, y: 1)],
                           sieges: [.init(province: 1, nation: 1, progress: 0.4)], day: 1)
        let b = Self.state([1, 0, 1, 2], nations: nations,
                           armies: [Self.army("m", nation: 1, province: 0, x: 3, y: 4),            // 已占州 0：本国了，不再算行军
                                    Self.army("n", nation: 1, province: 1, x: 5, y: 5),            // 敌境：行军（新军，只有这一步的点）
                                    Self.army("d", nation: 0, province: 1, x: 6, y: 6),            // 守军：本土有敌
                                    Self.army("p", nation: 1, province: 3, x: 9, y: 9)],           // 借道中立国：不落墨
                           sieges: [.init(province: 1, nation: 1, progress: 0.5)], day: 2)
        let f = WashFrame.from(previous: a, next: b)
        let marches = f.inputs.filter { $0.kind == .march }
        XCTAssertEqual(marches.map(\.province), [1])
        XCTAssertEqual(marches.first?.armies, [SIMD2(5, 5), SIMD2(5, 5)])
        XCTAssertEqual(f.inputs.filter { $0.kind == .hold }.map(\.attacker), [0])
        XCTAssertEqual(f.inputs.filter { $0.kind == .siege }.map(\.province), [1])
        XCTAssertEqual(f.inputs.filter { $0.kind == .capture }.map(\.province), [0], "州 0 有进攻方军队：攻占")
        XCTAssertEqual(f.enemies[1], [0])
        // 同一支军队前后两步都在敌境：线段从上一步位置起。
        let c = Self.state([1, 0, 1, 2], nations: nations, armies: [Self.army("n", nation: 1, province: 1, x: 7, y: 5)], day: 3)
        XCTAssertEqual(WashFrame.from(previous: b, next: c).inputs.first { $0.kind == .march }?.armies, [SIMD2(5, 5), SIMD2(7, 5)])
        // 和约割地（无军无围）不算攻占：州 3 从中立国 2 割给国 1。
        let d = Self.state([1, 0, 1, 1], nations: nations, day: 4)
        XCTAssertTrue(WashFrame.from(previous: c, next: d).inputs.filter { $0.kind == .capture }.isEmpty)
    }

    // MARK: 真实地图

    func testRealMapSweepCost() throws {
        let map = WorldMapTests.map
        let clock = Date()
        let t = WashTopology(map: map)
        let built = Date().timeIntervalSince(clock)
        XCTAssertEqual(t.cellCount, map.cellCount)
        XCTAssertGreaterThan(t.scale, 1)
        // 后期大反叛：三分之二的州同时归新国、从首都扫过；其余各州各自被攻占。
        let provinces = map.meta.provinces.indices.filter { !t.provinceCells[$0].isEmpty }
        let sweep = FlipSweep(topology: t)
        let start = Date()
        let rebels = Array(provinces.prefix(provinces.count * 2 / 3))
        var groups: [(provinces: [Int], seeds: [SIMD2<Float>])] = [(rebels, [t.centroid(rebels[0])])]
        for p in provinces.dropFirst(rebels.count) { groups.append(([p], [t.centroid(p)])) }
        let taken = sweep.start(groups, recolour: true, now: 0)
        let spent = Date().timeIntervalSince(start)
        XCTAssertEqual(taken.count, provinces.count)
        print(String(format: "扫色测量：拓扑 %.1f ms（%d 格，%d 顶点），全图各州起扫 %.2f ms，扫色格子 %d", built * 1000, t.cellCount, t.vertexCount, spent * 1000, sweep.active.count))
        XCTAssertLessThan(spent, 0.03)
        XCTAssertLessThanOrEqual(sweep.ends.values.max()!, FlipSweep.maxSeconds + FlipSweep.edge + FlipSweep.after + 0.1)
        // 墨迹每步的开销：全图两百支军队在敌境行军（人人互为敌国），连推十步。
        let owners = map.meta.provinces.map(\.nation)
        let nations = Set(owners).filter { $0 >= 0 }.sorted()
        var enemies = [Int: [Int]](); for n in nations { enemies[n] = nations.filter { $0 != n } }
        let ink = InkCells(topology: t, elevation: map.elevation)
        let sites = (0..<t.cellCount).filter { t.land[$0] }
        var marches = [WashInput]()
        for k in 0..<200 {
            let c = sites[(k * 7919) % sites.count], p = Int(t.province[c])
            let attacker = nations.first { $0 != owners[p] } ?? 0
            let at = t.site[c]
            marches.append(WashInput(province: p, attacker: attacker, kind: .march, day: 1, armies: [at, at + SIMD2(t.scale * 0.3, 0)], troops: 5000, key: "m\(k)"))
        }
        let inkStart = Date()
        for d in 1...10 {
            let moved = marches.map { m -> WashInput in var x = m; x.day = d; x.armies = [m.armies[1], m.armies[1] + SIMD2(t.scale * 0.3 * Float(d), 0)]; return x }
            ink.apply(WashFrame(day: d, inputs: moved, enemies: enemies), owners: owners, now: Float(d), tween: 0.5)
        }
        let inkSpent = Date().timeIntervalSince(inkStart) / 10
        print(String(format: "墨迹测量：两百支军队每步 %.2f ms，有墨的格子 %d", inkSpent * 1000, ink.nation.filter { $0 >= 0 }.count))
        XCTAssertGreaterThan(ink.nation.filter { $0 >= 0 }.count, 200)
        XCTAssertLessThan(inkSpent, 0.02, "每步墨迹更新在 20 毫秒以内（推演每步在后台，渲染端只拷顶点数据）")
    }
}
