import XCTest
import Foundation
@testable import LieguojiCore

/// 战争晕染（墨场）：行军留痕、相邻战区同场、围城与攻占扫满、褪墨回收，以及逐顶点易主渐变。
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

    // MARK: 墨场

    /// 一行：州 2（进攻方 9 的领土）x 0…3，州 0 x 4…11，州 1 x 12…19（守方 5）；高 6 格。
    static func wide() -> WashTopology { grid(20, 6) { x, _ in x < 4 ? 2 : x < 12 ? 0 : 1 } }
    static let wideOwners = [0: 5, 1: 5, 2: 9]
    static func wideOwner(_ p: Int) -> Int { wideOwners[p] ?? -1 }

    /// 动画走完之后（远处的时刻）某些顶点的浓度。
    static func final(_ book: WashBook, _ v: Int) -> Float { book.shown(v, at: 1e6) }
    /// 某州里浓度过半（着色器里大致见色）的顶点占比。
    static func covered(_ book: WashBook, _ p: Int, at t: Float = 1e6) -> Float {
        let topo = book.topology
        var all = 0, hit = 0
        for c in topo.provinceCells[p] { for v in topo.vertexRange(Int(c)) { all += 1; if book.shown(v, at: t) >= 0.5 { hit += 1 } } }
        return all == 0 ? 0 : Float(hit) / Float(all)
    }
    /// 离某点最近的顶点。
    static func vertex(_ t: WashTopology, near p: SIMD2<Float>, in province: Int? = nil) -> Int {
        var best = (0, Float.infinity)
        for v in 0..<t.vertexCount where province == nil || Int(t.vertexProvince[v]) == province! {
            let d = washDistance2(t.position(v), p)
            if d < best.1 { best = (v, d) }
        }
        return best.0
    }
    static func march(_ from: SIMD2<Float>, _ to: SIMD2<Float>, day: Int, province: Int = 0, troops: Float = 6000) -> WashInput {
        WashInput(province: province, attacker: 9, kind: .march, day: day, armies: [from, to], troops: troops)
    }

    func testMarchLeavesATrailAlongItsPathOnly() {
        let t = Self.wide(), book = WashBook(topology: t)
        // 从本国（x≈2）沿 y = 3 走到敌州深处（x≈18）。
        book.update(WashFrame(day: 1, inputs: [Self.march(SIMD2(2, 3), SIMD2(18, 3), day: 1)], enemies: [9: [5]]), owner: Self.wideOwner, now: 0)
        for x in stride(from: Float(5), through: 17, by: 2) {
            XCTAssertGreaterThan(Self.final(book, Self.vertex(t, near: SIMD2(x, 3))), 0.5, "路线上 x = \(x) 应留墨")
        }
        XCTAssertEqual(Self.final(book, Self.vertex(t, near: SIMD2(8, 0))), 0, "离路线远的地方不着墨（不是整州一片）")
        XCTAssertEqual(Self.final(book, Self.vertex(t, near: SIMD2(2, 3), in: 2)), 0, "本国领土不着墨")
        XCTAssertLessThan(Self.covered(book, 0), 0.8, "走过一趟只是一道墨痕")
        // 沿路线按经过先后显现：远端的顶点开始得晚。
        let near = Self.vertex(t, near: SIMD2(5, 3)), far = Self.vertex(t, near: SIMD2(17, 3))
        XCTAssertLessThan(book.start[near], book.start[far])
        XCTAssertLessThan(book.shown(far, at: 0.05), book.shown(near, at: book.start[near] + book.length[near]))
    }

    func testTrailOnlyInksEnemyLand() {
        // 州 0 是敌国 5，州 1 是友邦 7（借道）：穿过友邦的路段不着墨。
        let t = Self.wide(), book = WashBook(topology: t)
        book.update(WashFrame(day: 1, inputs: [Self.march(SIMD2(6, 3), SIMD2(18, 3), day: 1)], enemies: [9: [5]]), owner: { [0: 5, 1: 7, 2: 9][$0] ?? -1 }, now: 0)
        XCTAssertGreaterThan(Self.final(book, Self.vertex(t, near: SIMD2(8, 3))), 0.5)
        XCTAssertEqual(Self.final(book, Self.vertex(t, near: SIMD2(16, 3))), 0, "友邦领土不着墨")
    }

    func testNeighbouringFrontsAreOneFieldWithoutEmptyProvinces() {
        // 复现 1.18.0 的“空”：两相邻州都在打，州 1 的军队站在州中间、进度还低。旧做法里州 1 的前沿要从区域边界
        // （x = 4）推过来，进度 10% 时阈值还没到州 1，军队脚下是空的；交战的州又整块让位给战场地面。
        let t = Self.wide(), book = WashBook(topology: t)
        let army = SIMD2<Float>(16, 3)
        var inputs = [Self.march(SIMD2(2, 3), army, day: 1, province: 1),
                      WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.4, day: 1, armies: [SIMD2(7, 3)]),
                      WashInput(province: 1, attacker: 9, kind: .siege, progress: 0.1, day: 1, armies: [army])]
        book.update(WashFrame(day: 1, inputs: inputs, enemies: [9: [5]]), owner: Self.wideOwner, now: 0)
        XCTAssertGreaterThan(Self.final(book, Self.vertex(t, near: army)), 0.5, "军队脚下必须有墨")
        XCTAssertGreaterThan(Self.covered(book, 0), 0.1)
        XCTAssertGreaterThan(Self.covered(book, 1), 0.05, "相邻同时打仗的州都不空")
        // 跨州界连续：州界两侧同一位置的顶点（各格自己的拷贝）浓度相同。
        let left = Self.vertex(t, near: SIMD2(12, 3), in: 0), right = Self.vertex(t, near: SIMD2(12, 3), in: 1)
        XCTAssertEqual(t.position(left), t.position(right))
        XCTAssertEqual(Self.final(book, left), Self.final(book, right), accuracy: 1e-5)
        // 输入顺序不影响结果。
        inputs.reverse()
        let other = WashBook(topology: t)
        other.update(WashFrame(day: 1, inputs: inputs, enemies: [9: [5]]), owner: Self.wideOwner, now: 0)
        XCTAssertEqual(other.to, book.to)
        XCTAssertEqual(other.stain, book.stain)
    }

    func testSiegeGrowsFromTheArmyUntilTheProvinceIsFull() {
        let t = Self.wide(), book = WashBook(topology: t)
        let army = SIMD2<Float>(10, 3)
        var last: Float = 0
        for (day, q) in [(1, Float(0.2)), (2, 0.5), (3, 0.8), (4, 1.0)] {
            book.update(WashFrame(day: day, inputs: [WashInput(province: 0, attacker: 9, kind: .siege, progress: q, day: day, armies: [army])]), owner: Self.wideOwner, now: Float(day))
            let c = Self.covered(book, 0)
            XCTAssertGreaterThanOrEqual(c, last, "覆盖随进度只增不减")
            last = c
            XCTAssertGreaterThan(Self.final(book, Self.vertex(t, near: army)), 0.5)
            if q < 0.6 { XCTAssertLessThan(c, 0.85, "进度 \(q) 不该铺满") }
        }
        XCTAssertEqual(last, 1, "进度满时全州着墨")
        // 先铺军队这一侧（x = 10），远端（x = 4）最后。
        let book2 = WashBook(topology: t)
        book2.update(WashFrame(day: 1, inputs: [WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.4, day: 1, armies: [army])]), owner: Self.wideOwner, now: 0)
        XCTAssertGreaterThan(Self.final(book2, Self.vertex(t, near: SIMD2(11, 3), in: 0)), Self.final(book2, Self.vertex(t, near: SIMD2(4, 3), in: 0)))
    }

    func testDwellingSpreadsAndLeavingFades() {
        let t = Self.wide(), book = WashBook(topology: t)
        let at = SIMD2<Float>(8, 3)
        var covers = [Float]()
        for day in 1...12 {
            book.update(WashFrame(day: day, inputs: [Self.march(at, at, day: day, troops: 3000)]), owner: Self.wideOwner, now: Float(day))
            covers.append(Self.covered(book, 0))
        }
        XCTAssertGreaterThan(covers.last!, covers.first! + 0.05, "驻留越久洇得越开")
        for i in 1..<covers.count { XCTAssertGreaterThanOrEqual(covers[i], covers[i - 1]) }
        // 军队离开：墨按天褪去，最后格子移出。
        var day = 12, now: Float = 12
        while day < 200 && !book.isEmpty {
            day += 5; now += 1
            book.update(WashFrame(day: day, inputs: []), owner: Self.wideOwner, now: now)
            book.tick(now + 5)
        }
        XCTAssertTrue(book.isEmpty, "军队走后墨会褪尽并回收")
    }

    func testHoldingDefenderPushesTheInkBack() {
        let t = Self.wide(), book = WashBook(topology: t)
        let at = SIMD2<Float>(8, 3)
        book.update(WashFrame(day: 1, inputs: [Self.march(SIMD2(5, 3), at, day: 1)], enemies: [9: [5]]), owner: Self.wideOwner, now: 0)
        let before = Self.final(book, Self.vertex(t, near: at))
        book.update(WashFrame(day: 4, inputs: [WashInput(province: 0, attacker: 5, kind: .hold, day: 4, armies: [at], troops: 5000)]), owner: Self.wideOwner, now: 1)
        XCTAssertLessThan(Self.final(book, Self.vertex(t, near: at)), before - 0.3, "守军把周围的敌墨推回")
    }

    func testRetargetStartsFromTheShownValue() {
        let t = Self.wide(), book = WashBook(topology: t)
        let army = SIMD2<Float>(10, 3)
        book.update(WashFrame(day: 1, inputs: [WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.3, day: 1, armies: [army])]), owner: Self.wideOwner, now: 0)
        let v = Self.vertex(t, near: SIMD2(7, 1), in: 0)
        let mid = book.start[v] + book.length[v] * 0.5
        let shown = book.shown(v, at: mid)
        book.update(WashFrame(day: 2, inputs: [WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.9, day: 2, armies: [army])]), owner: Self.wideOwner, now: mid)
        XCTAssertEqual(book.shown(v, at: mid), shown, accuracy: 1e-5, "新目标从当前显示值接着走，不跳")
    }

    func testCaptureSweepsFromTheInkedSideThenRetires() {
        let t = Self.wide(), book = WashBook(topology: t)
        let army = SIMD2<Float>(6, 3)
        book.update(WashFrame(day: 1, inputs: [WashInput(province: 0, attacker: 9, kind: .siege, progress: 0.35, day: 1, armies: [army])]), owner: Self.wideOwner, now: 0)
        // 攻占：这一步归属已变（州 0 归 9），墨不能按“已成本国领土”清掉，等底色换过来再扫满。
        let owned: (Int) -> Int = { [0: 9, 1: 5, 2: 9][$0] ?? -1 }
        book.update(WashFrame(day: 2, inputs: [WashInput(province: 0, attacker: 9, kind: .capture, progress: 1, day: 2, armies: [army])]), owner: owned, now: 1)
        XCTAssertGreaterThan(Self.final(book, Self.vertex(t, near: army)), 0.5)
        XCTAssertEqual(book.flipCandidates(owner: owned), [0])
        XCTAssertEqual(book.landFlipped([0], owner: owned, now: 2), [0])
        let near = Self.vertex(t, near: SIMD2(7, 3), in: 0), far = Self.vertex(t, near: SIMD2(11, 5), in: 0)
        XCTAssertLessThan(book.start[near], book.start[far], "从已染处向外扫")
        XCTAssertEqual(book.flipAt[far], 2)
        XCTAssertEqual(Self.covered(book, 0), 1)
        // 扫满之后收尾：顶点清空，格子回收（底色已是新主人）。
        let end = book.flipping[0]!
        book.tick(end + 0.01)
        book.tick(end + 10)
        XCTAssertTrue(book.isEmpty)
        XCTAssertFalse(book.animating(at: end + 10))
        // 和约割地（没有军队、没有墨）不接手。
        XCTAssertEqual(book.landFlipped([1], owner: { _ in 9 }, now: 30), [])
    }

    func testViewChangeFinishesSweeps() {
        let t = Self.wide(), book = WashBook(topology: t)
        let owned: (Int) -> Int = { [0: 9, 1: 5, 2: 9][$0] ?? -1 }
        book.update(WashFrame(day: 1, inputs: [WashInput(province: 0, attacker: 9, kind: .capture, progress: 1, day: 1, armies: [SIMD2(6, 3)])]), owner: owned, now: 0)
        XCTAssertEqual(book.landFlipped([0], owner: owned, now: 0), [0])
        book.viewChanged()
        book.tick(100)
        XCTAssertTrue(book.isEmpty)
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

    func testRealMapCost() throws {
        let map = WorldMapTests.map
        let clock = Date()
        let t = WashTopology(map: map)
        let built = Date().timeIntervalSince(clock)
        XCTAssertEqual(t.cellCount, map.cellCount)
        XCTAssertGreaterThan(t.scale, 1)
        // 后期大战：300 支军队在敌境行军（每支每步走半个州），30 天里每天一步。
        let owners = map.meta.provinces.map(\.nation)
        func owner(_ p: Int) -> Int { owners.indices.contains(p) ? (owners[p] == 0 ? 1 : owners[p]) : -1 }
        let book = WashBook(topology: t)
        let provinces = map.meta.provinces.indices.filter { !t.provinceCells[$0].isEmpty }
        var armies = (0..<300).map { k -> SIMD2<Float> in let p = provinces[(k * 7919) % provinces.count]; return t.centroid(p) }
        var worst: Double = 0, total: Double = 0
        for day in 1...30 {
            var inputs = [WashInput]()
            for k in armies.indices {
                let from = armies[k]
                let angle = Float(k) * 0.7 + Float(day) * 0.1
                armies[k] = from + SIMD2(cos(angle), sin(angle)) * t.scale * 0.5
                inputs.append(WashInput(province: Int(t.province[Int(t.cells(near: armies[k], armies[k], radius: t.scale).first ?? 0)]), attacker: 0, kind: .march, day: day, armies: [from, armies[k]], troops: 5000))
            }
            let start = Date()
            book.update(WashFrame(day: day, inputs: inputs), owner: owner, now: Float(day) * 0.5)
            book.tick(Float(day) * 0.5)
            let spent = Date().timeIntervalSince(start)
            worst = max(worst, spent); total += spent
        }
        print(String(format: "墨场测量：拓扑 %.1f ms（%d 格，%d 顶点），300 军每步平均 %.2f ms、最慢 %.2f ms，有墨格子 %d", built * 1000, t.cellCount, t.vertexCount, total / 30 * 1000, worst * 1000, book.active.count))
        XCTAssertFalse(book.isEmpty)
        XCTAssertLessThan(worst, 0.08, "一步落墨应远低于一帧预算之外的后台节拍")
    }
}
