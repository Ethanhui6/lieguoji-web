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

    // MARK: GPU 墨场（CPU 复算：与着色器同一公式）

    /// CPU 上的墨场：一行采样点（沿行军线 y = 0），按着色器的笔触（胶囊、横向衰减 falloff、预乘“叠加”混合）累计浓度。
    struct InkLine {
        var cover: [Float]
        let xs: [Float]
        init(from: Float, to: Float, step: Float) { xs = Array(stride(from: from, through: to, by: step)); cover = Array(repeating: 0, count: xs.count) }
        /// 一笔：a → b（两端齐平；a = b 为圆点），半径 r，不透明度 alpha；采样点在 (x, offset)。与着色器同一算法（InkPlan.stroke）。
        mutating func stamp(_ a: SIMD2<Float>, _ b: SIMD2<Float>, r: Float, alpha: Float, offset: Float = 0) {
            for i in xs.indices {
                let s = InkPlan.stroke(SIMD2(xs[i], offset), a, b, radius: r, alpha: alpha)
                cover[i] = s + cover[i] * (1 - s)
            }
        }
    }

    /// 军队以 speed（世界单位/秒）从 x = 0 走到 x = length，按 fps 逐帧落墨（与 encodeInk 相同：上一帧落墨处 → 此刻位置）。
    static func walk(fps: Float, speed: Float, length: Float = 200, radius: Float = 12, offset: Float = 0) -> InkLine {
        var line = InkLine(from: 20, to: length - 20, step: 1)
        let dt = 1 / fps
        var x: Float = 0, last = SIMD2<Float>(0, 0)
        while x < length {
            x = min(length, x + speed * dt)
            let p = SIMD2(x, 0)
            line.stamp(last, p, r: radius, alpha: InkPlan.trailAlpha(len: (p - last).x, radius: radius), offset: offset)
            last = p
        }
        return line
    }

    func testTrailIsContinuousAtAnyFrameRateAndSpeed() {
        // 手机上 30/60/120 帧、慢走与急行军（一帧走过半个墨迹宽到三个墨迹宽）：路线中心处处见色，没有断档。
        for fps: Float in [30, 60, 120] {
            for speed: Float in [20, 120, 600, 2000] {
                let line = Self.walk(fps: fps, speed: speed)
                let lo = line.cover.min()!, hi = line.cover.max()!
                XCTAssertGreaterThan(lo, InkPlan.visible + 0.25, "\(fps) 帧、速度 \(speed)：路线上最淡处 \(lo) 不见色（断档）")
                XCTAssertLessThan(hi - lo, 0.03, "\(fps) 帧、速度 \(speed)：浓淡起伏 \(hi - lo) 过大（一段一段）")
            }
        }
        // 与帧率无关：同样的路，30 帧与 120 帧的浓度差很小。
        let a = Self.walk(fps: 30, speed: 120), b = Self.walk(fps: 120, speed: 120)
        for i in a.cover.indices { XCTAssertEqual(a.cover[i], b.cover[i], accuracy: 0.06) }
        // 横向有宽度、有边：离路线一个半半径处已看不见。
        let side = Self.walk(fps: 60, speed: 120, offset: 18)
        XCTAssertLessThan(side.cover.max()!, InkPlan.visible, "墨迹是一条有宽度的路，不是一整片")
        let near = Self.walk(fps: 60, speed: 120, offset: 6)
        XCTAssertGreaterThan(near.cover.min()!, InkPlan.visible)
    }

    func testStandingStillOnlySpreadsWithSimulatedDays() {
        // 原地不动：没有行军墨（暂停时不长）；推演天数在走才洇开，越久越开。
        XCTAssertEqual(InkPlan.trailAlpha(len: 0, radius: 12), 0)
        XCTAssertEqual(InkPlan.dwellAlpha(days: 0), 0)
        var line = InkLine(from: -60, to: 60, step: 1)
        var clock = InkPlan.Clock()
        var reach = [Float]()
        for _ in 0..<20 {
            clock.add(days: 1, over: 0.5)                 // 每步一天、动画 0.5 秒
            for _ in 0..<30 {                             // 60 帧下这一步的 30 帧
                let days = clock.take(1 / 60)
                line.stamp(.zero, .zero, r: InkPlan.dwellRadius(scale: 30, troops: 4000), alpha: InkPlan.dwellAlpha(days: days))
            }
            reach.append(Float(line.cover.filter { $0 > InkPlan.visible }.count))
        }
        XCTAssertEqual(clock.left, 0, accuracy: 1e-4, "一步的天数在这一步的动画里用完")
        for i in 1..<reach.count { XCTAssertGreaterThanOrEqual(reach[i], reach[i - 1]) }
        XCTAssertGreaterThan(reach.last!, reach[2] + 10, "驻留越久洇得越开")
        // 时钟：暂停（不再加天数）后不再落墨。
        XCTAssertEqual(clock.take(1), 0)
    }

    func testDayClockSpendsEachStepOverItsAnimation() {
        var clock = InkPlan.Clock()
        clock.add(days: 5, over: 0.5)
        var spent: Float = 0
        for _ in 0..<15 { spent += clock.take(1 / 60) }    // 0.25 秒
        XCTAssertEqual(spent, 2.5, accuracy: 0.05, "匀速：半个动画时长用掉一半天数")
        clock.add(days: 5, over: 0.5)                       // 下一步提前到来：剩下的与新来的一起在新的时长里用完
        for _ in 0..<40 { spent += clock.take(1 / 60) }
        XCTAssertEqual(spent, 10, accuracy: 1e-3)
        XCTAssertEqual(InkPlan.decay(days: 0), 1)
        XCTAssertLessThan(InkPlan.decay(days: 30), 0.45, "一个月后墨褪去一大半")
    }

    func testSiegeFillsFromTheArmyToTheWholeProvince() {
        let far: Float = 100, scale: Float = 30
        var last: Float = -1
        for q in stride(from: Float(0), through: 1, by: 0.1) {
            let r = InkPlan.siegeRadius(progress: q, far: far, scale: scale)
            XCTAssertGreaterThanOrEqual(r, last); last = r
        }
        XCTAssertGreaterThan(InkPlan.siegeCover(distance: far, radius: InkPlan.siegeRadius(progress: 1, far: far, scale: scale), scale: scale), InkPlan.visible + 0.3, "进度满时最远处也铺满")
        XCTAssertLessThan(InkPlan.siegeCover(distance: far, radius: InkPlan.siegeRadius(progress: 0.3, far: far, scale: scale), scale: scale), InkPlan.visible, "进度低时远处还没到")
        XCTAssertGreaterThan(InkPlan.siegeCover(distance: 0, radius: InkPlan.siegeRadius(progress: 0.05, far: far, scale: scale), scale: scale), InkPlan.visible, "军队脚下先见色")
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
    }
}
