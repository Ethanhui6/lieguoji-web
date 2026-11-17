import XCTest
import Foundation
@testable import LieguojiCore

/// 占领晕染：连通区域的距离场、状态连续性与逐顶点易主渐变。
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

    /// 一行三州：州 2（进攻方领土）x 0…3，州 0 x 4…7，州 1 x 8…11；高 4 格。
    static func row() -> WashTopology { grid(12, 4) { x, _ in x < 4 ? 2 : x < 8 ? 0 : 1 } }
    static let owners = [0: 5, 1: 5, 2: 9]
    static func owner(_ p: Int) -> Int { owners[p] ?? -1 }

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

    func testRegionFieldIsContinuousAcrossProvinceBorder() {
        let t = Self.row(), book = WashBook(topology: t)
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.4, day: 1),
                     WashInput(province: 1, attacker: 9, kind: .siege, progress: 0.1, day: 1)], owner: Self.owner, now: 0)
        let a = book.entries[0]!, b = book.entries[1]!
        XCTAssertEqual(a.region, b.region, "相邻且同一进攻方的两州应并为一个区域")
        // 州界上同一位置的顶点在两州里抵达距离相同（同一张场）。
        var values = [SIMD2<Float>: Float]()
        for (i, p) in a.field.position.enumerated() { values[p] = a.field.arrival[i] }
        var shared = 0
        for (i, p) in b.field.position.enumerated() {
            if let v = values[p] { XCTAssertEqual(v, b.field.arrival[i], accuracy: 1e-5); shared += 1 }
        }
        XCTAssertGreaterThan(shared, 0)
        // 从进攻方领土一侧（x = 4）进来：州 0 最近处在入口边上（离入口格心半格对角），州 1 的最近处再远三个格心（州 0 宽四格）。
        XCTAssertEqual(a.field.minimum, Float(0.5).squareRoot(), accuracy: 0.05)
        XCTAssertEqual(b.field.minimum, 3 + Float(0.5).squareRoot(), accuracy: 0.05)
    }

    func testProgressUpdatesRetargetWithoutRestarting() {
        let t = Self.row(), book = WashBook(topology: t)
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.3, day: 1)], owner: Self.owner, now: 0)
        var last = book.entries[0]!.shown
        var time = 0.0
        for step in 0..<40 {
            // 每 0.1 秒一步，进度缓慢上涨：前沿只会向前，永不归零重来。
            time += 0.1
            book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.3 + Float(step) * 0.01, day: 2 + step)], owner: Self.owner, now: time)
            for k in 1...6 { book.advance(to: time + Double(k) / 60) }
            let shown = book.entries[0]!.shown
            XCTAssertGreaterThanOrEqual(shown, last - 1e-4, "第 \(step) 步前沿后退了")
            last = shown
            time += 0.1
        }
        XCTAssertEqual(book.entries[0]!.id, 1, "同一州的动画状态保持同一标识")
        XCTAssertEqual(book.fieldBuilds, 1, "源与成员不变时不重算距离场")
    }

    func testInputOrderDoesNotChangeState() {
        let inputs = [WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.4, day: 1),
                      WashInput(province: 1, attacker: 9, kind: .siege, progress: 0.2, day: 1)]
        let a = WashBook(topology: Self.row()), b = WashBook(topology: Self.row())
        a.update(inputs, owner: Self.owner, now: 0); b.update(inputs.reversed(), owner: Self.owner, now: 0)
        for k in 1...30 { a.advance(to: Double(k) / 60); b.advance(to: Double(k) / 60) }
        XCTAssertEqual(a.entries.keys.sorted(), b.entries.keys.sorted())
        for p in a.entries.keys { XCTAssertEqual(a.entries[p]!.shown, b.entries[p]!.shown); XCTAssertEqual(a.entries[p]!.field, b.entries[p]!.field) }
    }

    func testJoiningProvinceContinuesTheFrontAndKeepsTheOthers() {
        let t = Self.row(), book = WashBook(topology: t)
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.5, day: 1)], owner: Self.owner, now: 0)
        for k in 1...60 { book.advance(to: Double(k) / 60) }
        let before = book.entries[0]!
        let coverage = before.field.fraction(before.shown, pad: book.pad)
        // 州 1 加入：州 0 换进新区域的场后覆盖占比不变（看到的不跳），州 1 从进入边界起、此刻还看不见。
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.5, day: 2),
                     WashInput(province: 1, attacker: 9, kind: .siege, progress: 0.3, day: 2)], owner: Self.owner, now: 1)
        let after = book.entries[0]!, joined = book.entries[1]!
        XCTAssertEqual(after.id, before.id)
        XCTAssertEqual(after.field.fraction(after.shown, pad: book.pad), coverage, accuracy: 0.02)
        XCTAssertLessThanOrEqual(joined.shown, joined.field.minimum, "新加入的州不应一出现就盖上一片")
    }

    func testSimultaneousCapturesShareOneFront() {
        // 州 0、州 1 同一步被攻占（无守军连下两州）：两州前沿是同一条等距线，在州界处不断开。
        let t = Self.row(), book = WashBook(topology: t)
        book.update([WashInput(province: 0, attacker: 9, kind: .capture, progress: 1, day: 1),
                     WashInput(province: 1, attacker: 9, kind: .capture, progress: 1, day: 1)], owner: Self.owner, now: 0)
        for k in 1...40 {
            book.advance(to: Double(k) / 60)
            guard let a = book.entries[0], let b = book.entries[1] else { break }
            XCTAssertEqual(a.shown, b.shown, accuracy: 1e-3, "第 \(k) 帧两州前沿不一致")
        }
    }

    func testCancelledSiegeRecedesThenDisappears() {
        let t = Self.row(), book = WashBook(topology: t)
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.6, day: 1)], owner: Self.owner, now: 0)
        for k in 1...90 { book.advance(to: Double(k) / 60) }
        let high = book.entries[0]!.shown
        book.update([], owner: Self.owner, now: 1.5)
        XCTAssertEqual(book.entries[0]?.phase, .cancel)
        var previous = high
        var k = 0
        while book.entries[0] != nil && k < 600 {
            k += 1; book.advance(to: 1.5 + Double(k) / 60)
            if let s = book.entries[0]?.shown { XCTAssertLessThanOrEqual(s, previous + 1e-4); previous = s }
        }
        XCTAssertNil(book.entries[0], "解围后的晕染应退回进入边界并回收")
        // 反攻又来：从当前画面（已清空）重新长出，不残留旧状态。
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.2, day: 9)], owner: Self.owner, now: 20)
        XCTAssertNotNil(book.entries[0])
    }

    func testAttackerChangeFadesTheOldOneOut() {
        let t = Self.row(), book = WashBook(topology: t)
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.6, day: 1)], owner: Self.owner, now: 0)
        for k in 1...30 { book.advance(to: Double(k) / 60) }
        book.update([WashInput(province: 0, attacker: 7, kind: .siege, progress: 0.1, day: 2)], owner: Self.owner, now: 0.5)
        XCTAssertEqual(book.entries[0]?.attacker, 7)
        XCTAssertEqual(book.leaving.count, 1)
        for k in 1...120 { book.advance(to: 0.5 + Double(k) / 60) }
        XCTAssertTrue(book.leaving.isEmpty, "被替换的一方淡出后回收")
    }

    func testCaptureHandsOverToTheLandWithoutAJump() {
        let t = Self.row(), book = WashBook(topology: t)
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.7, day: 1)], owner: Self.owner, now: 0)
        for k in 1...60 { book.advance(to: Double(k) / 60) }
        book.update([WashInput(province: 0, attacker: 9, kind: .capture, progress: 1, day: 2)], owner: Self.owner, now: 1)
        XCTAssertEqual(book.landFlipped([0]), [0])
        let e = book.entries[0]!
        // 换底瞬间：已到达处“进攻色 × tint 压旧色” = “旧色 × (1 − tint) 压新色”。
        XCTAssertEqual(e.flipFade, 1 - WashBook.tint, accuracy: 1e-6)
        var k = 0
        while book.entries[0] != nil && k < 600 { k += 1; book.advance(to: 1 + Double(k) / 60) }
        XCTAssertNil(book.entries[0], "攻占铺满、旧色余韵淡去后回收")
        // 同一次攻占再次送达（下一步仍在最近攻占列表里）不会重播。
        book.update([WashInput(province: 0, attacker: 9, kind: .capture, progress: 1, day: 2)], owner: Self.owner, now: 12)
        XCTAssertNil(book.entries[0])
    }

    func testSeparatedProvincesAreSeparateRegions() {
        // 州 0 与州 1 隔着海：各自一个区域，各自的场。
        let t = Self.grid(9, 3) { x, _ in x < 2 ? 2 : x < 4 ? 0 : x == 4 ? -1 : x < 7 ? 1 : 2 }
        let book = WashBook(topology: t)
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.5, day: 1),
                     WashInput(province: 1, attacker: 9, kind: .siege, progress: 0.5, day: 1)], owner: Self.owner, now: 0)
        XCTAssertNotEqual(book.entries[0]!.region, book.entries[1]!.region)
        XCTAssertTrue(book.entries[1]!.field.arrival.allSatisfy(\.isFinite))
    }

    func testThresholdAndFractionAreInverse() {
        let t = Self.row(), book = WashBook(topology: t)
        book.update([WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.5, day: 1)], owner: Self.owner, now: 0)
        let f = book.entries[0]!.field
        for x in stride(from: Float(-1), through: 2, by: 0.05) {
            XCTAssertEqual(f.fraction(f.threshold(x, pad: book.pad), pad: book.pad), x, accuracy: 1e-3)
        }
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

    // MARK: 推演状态 → 输入

    func testCaptureNeedsAnArmyOrASiege() {
        let army = GameState.Army(id: "a", name: "a", nation: 1, troops: 100, unit: "Infantry", status: "idle", travel: "idle", province: 0, supplies: 0, morale: 0, x: 3, y: 4, manual: false, destination: nil, mission: nil)
        func state(_ owners: [Int], armies: [GameState.Army] = [], sieges: [GameState.Siege] = [], day: Int) -> GameState {
            GameState(day: day, date: .init(year: 1, month: 1, day: 1), owners: owners, labels: nil, nations: [], armies: armies, wars: [], sieges: sieges, events: [])
        }
        let a = state([0, 0, 0], sieges: [.init(province: 2, nation: 1, progress: 0.4)], day: 1)
        let b = state([1, 1, 0], armies: [army], sieges: [.init(province: 2, nation: 1, progress: 0.5)], day: 2)
        let out = WashInput.from(previous: a, next: b)
        XCTAssertEqual(out.captures.map(\.province), [0], "州 0 有进攻方军队：攻占；州 1 无军无围：和约割地，不算")
        XCTAssertEqual(out.captures.first?.armies, [SIMD2(3, 4)])
        XCTAssertEqual(out.sieges.map(\.province), [2])
        XCTAssertEqual(out.sieges.first?.progress ?? 0, 0.5, accuracy: 1e-6)
    }

    // MARK: 真实地图

    func testRealMapFieldsAndCost() throws {
        let map = WorldMapTests.map
        let clock = Date()
        let t = WashTopology(map: map)
        let built = Date().timeIntervalSince(clock)
        XCTAssertEqual(t.cellCount, map.cellCount)
        XCTAssertGreaterThan(t.scale, 1)
        // 一片相连的五个州被同一国围攻（从州 0 出发沿邻州找），外加一个不相连的州。
        var chain = [0], frontier = [0]
        while chain.count < 5, let p = frontier.first {
            frontier.removeFirst()
            for n in t.provinceNeighbors[p].map(Int.init) where !chain.contains(n) && chain.count < 5 { chain.append(n); frontier.append(n) }
        }
        let attacker = 99
        let outsider = t.provinceNeighbors[chain[0]].map(Int.init).first { !chain.contains($0) } ?? -1
        func owner(_ p: Int) -> Int { p == outsider ? attacker : map.meta.provinces[p].nation }
        let book = WashBook(topology: t)
        let inputs = chain.enumerated().map { WashInput(province: $0.element, attacker: attacker, kind: .siege, progress: 0.2 + Float($0.offset) * 0.15, day: 1) }
        let start = Date()
        book.update(inputs, owner: owner, now: 0)
        let field = Date().timeIntervalSince(start)
        XCTAssertEqual(Set(chain.map { book.entries[$0]!.region }).count, 1, "相连的五州应为一个区域")
        for p in chain {
            let e = book.entries[p]!
            XCTAssertFalse(e.field.arrival.isEmpty)
            XCTAssertTrue(e.field.arrival.allSatisfy(\.isFinite), "州 \(p) 有到不了的顶点")
        }
        // 每帧推进的开销：几十个州同时变化也只是几个数的更新。
        let frame = Date()
        for k in 1...120 { book.advance(to: Double(k) / 60) }
        let perFrame = Date().timeIntervalSince(frame) / 120
        print(String(format: "晕染测量：拓扑 %.1f ms（%d 格），五州区域场 %.2f ms，每帧推进 %.3f ms", built * 1000, t.cellCount, field * 1000, perFrame * 1000))
        XCTAssertLessThan(perFrame, 0.005)
    }
}
