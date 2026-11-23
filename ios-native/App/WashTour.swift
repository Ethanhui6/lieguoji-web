import SwiftUI
import QuartzCore
import LieguojiCore

/// CI 巡览：战争晕染（墨场）的演示与测量。合成两路进攻军从本国出发、穿过一串敌州：沿途落墨、驻留洇开、
/// 围城从军队处铺开、守军把敌墨推回、攻占时从已染处扫满；再拉远、换视图，最后几十州同时打的压力段。
/// 录一段视频、留关键帧，并在固定世界坐标逐帧记录填色，统计“反复变色”的次数与帧间隔。结果写进 wash-demo.json。
extension ShotTour {
    /// 演示的地块：进攻方、守方的一串相连州（第一个挨着进攻方领土）与进攻方的出发州，以及压力段的各州。
    struct WashStage { let attacker: Int; let defender: Int; let home: Int; let chain: [Int]; let crowd: [(province: Int, attacker: Int, from: Int)] }

    @MainActor static func washStage(_ map: WorldMap, _ owners: [Int]) -> WashStage? {
        let t = WashTopology(map: map)
        for p in owners.indices where owners[p] >= 0 && t.provinceNeighbors.indices.contains(p) {
            guard let q = t.provinceNeighbors[p].map(Int.init).first(where: { owners.indices.contains($0) && owners[$0] >= 0 && owners[$0] != owners[p] }) else { continue }
            let d = owners[p], a = owners[q]
            var chain = [p], frontier = [p]
            while chain.count < 6, !frontier.isEmpty {
                let x = frontier.removeFirst()
                for n in t.provinceNeighbors[x].map(Int.init) where owners[n] == d && !chain.contains(n) && chain.count < 6 { chain.append(n); frontier.append(n) }
            }
            guard chain.count >= 5 else { continue }
            // 压力测试：挨着别国的州被邻国从邻州打进来（几十个州同时变化）。
            var crowd = [(province: Int, attacker: Int, from: Int)]()
            for r in owners.indices where owners[r] >= 0 {
                if let s = t.provinceNeighbors[r].map(Int.init).first(where: { owners[$0] >= 0 && owners[$0] != owners[r] }) { crowd.append((r, owners[s], s)) }
            }
            return WashStage(attacker: a, defender: d, home: q, chain: chain, crowd: Array(crowd.prefix(48)))
        }
        return nil
    }

    /// 逐帧记录：固定世界坐标（每州一个顶点）显示的陆地颜色；帧间隔、绘制与 GPU 耗时、扫色中的格子数。
    @MainActor final class WashRecorder: NSObject {
        private var link: CADisplayLink?
        private var last: CFTimeInterval = 0
        var gaps: [Double] = []
        private var colours: [Int: [Float]] = [:]
        private var inked = 0
        private let renderer: () -> MapRenderer?
        private let probes: [Int: Int]
        init(renderer: @escaping () -> MapRenderer?, probes: [Int: Int]) { self.renderer = renderer; self.probes = probes }
        func start() {
            gaps = []; last = 0; colours = [:]; inked = 0
            MapRenderer.frameProbe = MapRenderer.FrameProbe()
            let l = CADisplayLink(target: self, selector: #selector(tick(_:))); l.add(to: .main, forMode: .common); link = l
        }
        @objc private func tick(_ l: CADisplayLink) {
            if last > 0 { gaps.append((l.timestamp - last) * 1000) }
            last = l.timestamp
            guard let r = renderer() else { return }
            let now = r.clock()
            for (p, v) in probes where r.landFade.to.count > v * 4 + 2 {
                let c = r.displayedLand(v, at: now)
                colours[p, default: []].append(c.x * 0.3 + c.y * 0.59 + c.z * 0.11)
            }
            inked = max(inked, r.sweep?.active.count ?? 0)
        }
        /// 反复变色：一个固定点的亮度变化方向在一秒内来回翻转（超过 1% 的变化才算）。
        static func reversals(_ series: [Float]) -> Int {
            var count = 0, lastSign: Float = 0, lastIndex = -1000
            for i in 1..<max(1, series.count) {
                let d = series[i] - series[i - 1]
                guard abs(d) > 0.01 else { continue }
                let s: Float = d > 0 ? 1 : -1
                if lastSign != 0 && s != lastSign && i - lastIndex < 60 { count += 1 }
                lastSign = s; lastIndex = i
            }
            return count
        }
        func stop() -> [String: Any] {
            link?.invalidate(); link = nil
            let s = gaps.sorted()
            func q(_ p: Int) -> Double { s.isEmpty ? 0 : s[min(s.count - 1, s.count * p / 100)] }
            let probe = MapRenderer.frameProbe
            MapRenderer.frameProbe = nil
            func stats(_ x: [Double]) -> [String: Double] {
                let v = x.sorted(); guard !v.isEmpty else { return ["samples": 0] }
                return ["samples": Double(v.count), "averageMs": v.reduce(0, +) / Double(v.count), "p95Ms": v[min(v.count - 1, v.count * 95 / 100)], "maxMs": v.last!]
            }
            let callback: [String: Double] = ["samples": Double(s.count), "p95": q(95), "p99": q(99), "max": s.last ?? 0,
                                              "over50ms": Double(s.filter { $0 > 50 }.count), "over33ms": Double(s.filter { $0 > 33.4 }.count)]
            var out = [String: Any]()
            out["callbackGapMs"] = callback
            out["encodeMs"] = stats(probe?.encode ?? []); out["washEncodeMs"] = stats(probe?.wash ?? []); out["gpuMs"] = stats(probe?.gpu ?? [])
            out["presentGapMs"] = stats(probe?.presented ?? []); out["recolorMs"] = stats(probe?.recolor ?? [])
            out["colourReversals"] = colours.values.map(Self.reversals).reduce(0, +)
            out["inkedCellsMax"] = inked
            return out
        }
    }

    /// 演示一遍，返回测量结果。
    @MainActor static func washRun(_ model: GameModel, stage: WashStage) async -> [String: Any] {
        guard let map = model.map, let start = model.controller.world ?? model.map else { return [:] }
        let c = model.controller
        c.washDemo = true
        c.washes = .empty; c.washEpoch &+= 1; c.objectWillChange.send()
        let chain = stage.chain, a = stage.attacker, d = stage.defender
        func centre(_ p: Int) -> SIMD2<Float> { SIMD2(map.meta.provinces[p].x, map.meta.provinces[p].y) }
        // 镜头：这串州的中心，适中的远近（能同时看到整片推进）。
        let mid = chain.reduce(SIMD2<Float>(0, 0)) { $0 + centre($1) } / Float(chain.count)
        c.fly(x: Double(mid.x), y: Double(mid.y)); await wait(2)
        var probes = [Int: Int]()
        let t = WashTopology(map: map)
        for p in chain { if let cell = t.provinceCells[p].first { probes[p] = Int(map.offsets[Int(cell)]) } }
        let recorder = WashRecorder(renderer: { c.renderer?() }, probes: probes)
        recorder.start()
        var world = start
        var day = 1
        // 两路进攻军（A 走 home → 0 → 1，B 走 home → 0 → 3），一支守军守在 2。
        var armyA = centre(stage.home), armyB = centre(stage.home)
        var lastA = armyA, lastB = armyB
        var sieges = [Int: Float](), captured = [Int](), holding: SIMD2<Float>? = nil
        func send() {
            var inputs = [WashInput]()
            for (from, at, p, key) in [(lastA, armyA, chain[1], "demo-a"), (lastB, armyB, chain[3], "demo-b")] {
                inputs.append(WashInput(province: p, attacker: a, kind: .march, day: day, armies: [from, at], troops: 6000, key: key))
            }
            for (p, v) in sieges.sorted(by: { $0.key < $1.key }) where !captured.contains(p) {
                let at = p == chain[1] ? [armyA] : p == chain[3] ? [armyB] : []
                inputs.append(WashInput(province: p, attacker: a, kind: .siege, progress: v, day: day, armies: at))
            }
            for p in captured { inputs.append(WashInput(province: p, attacker: a, kind: .capture, progress: 1, day: day, armies: [armyA])) }
            if let h = holding { inputs.append(WashInput(province: chain[2], attacker: d, kind: .hold, day: day, armies: [h], troops: 5000, key: "demo-d")) }
            lastA = armyA; lastB = armyB
            c.washes = WashFrame(day: day, inputs: inputs, enemies: [a: [d], d: [a]])
            c.objectWillChange.send()
        }
        /// 推进 seconds 秒，每 0.25 秒一步（像推演一样分步到来，每步一天）。
        func drive(_ seconds: Double, _ body: (Double) -> Void) async {
            let steps = max(1, Int(seconds * 4))
            for k in 0..<steps { body(Double(k + 1) / Double(steps)); day += 1; send(); await wait(0.25) }
        }
        func along(_ path: [SIMD2<Float>], _ k: Double) -> SIMD2<Float> {
            let x = Float(k) * Float(path.count - 1), i = min(path.count - 2, Int(x))
            return path[i] + (path[i + 1] - path[i]) * (x - Float(i))
        }
        func capture(_ p: Int) {
            captured.append(p); world.meta.provinces[p].nation = a
            c.world = world
        }
        // 1 行军：两路从本国出发穿过前沿州，路线上留下墨痕。
        let routeA = [centre(stage.home), centre(chain[0]), centre(chain[1])], routeB = [centre(stage.home), centre(chain[0]), centre(chain[3])]
        await drive(3) { k in armyA = along(routeA, k); armyB = along(routeB, k) }
        // 2 驻留与围城：两处各自从军队位置洇开（相邻的前沿州连成一片）。
        await drive(3) { k in sieges[chain[1]] = Float(k) * 0.7; sieges[chain[3]] = Float(k) * 0.5 }
        // 3 守军在 2 号州与之相持，把 B 路的墨推回。
        holding = centre(chain[2])
        await drive(2) { k in sieges[chain[1]] = 0.7 + Float(k) * 0.25 }
        // 4 攻占 1 号州：底色换成进攻方，从已染处扫满。
        capture(chain[1])
        await drive(1.5) { _ in }
        // 5 拉远、换视图再换回。
        c.resetRequest = UUID()
        await drive(1.5) { _ in }
        model.mapView = .alliance
        await drive(1) { _ in }
        model.mapView = .state
        // 6 B 路解围撤走：墨慢慢褪去。
        sieges[chain[3]] = nil; holding = nil
        await drive(2.5) { k in armyB = along([centre(chain[3]), centre(chain[0])], k) }
        var out = recorder.stop()
        out["sweepActiveLeft"] = c.renderer?()?.sweep?.active.count ?? -1
        // 全部停战时依然绘制正在淡出的墨。
        if let renderer = c.renderer?(), let snapshot = renderer.ink?.snapshot {
            let now = renderer.clock()
            let v = (0..<t.vertexCount).first { v in
                let p = Int(t.vertexProvince[v])
                return world.meta.provinces.indices.contains(p) && world.meta.provinces[p].nation == d &&
                    snapshot.vertices.indices.contains(v * 4 + 3) && snapshot.level(v, at: now) > 0.8
            }
            if let v {
                let before = snapshot.level(v, at: now)
                c.washes = WashFrame(day: day + 1, inputs: [], enemies: [:])
                c.objectWillChange.send()
                await wait(0.5)
                let during = renderer.ink?.snapshot?.level(v, at: renderer.clock()) ?? 0
                await wait(1.5)
                let after = renderer.ink?.snapshot?.level(v, at: renderer.clock()) ?? 0
                out["ceasefire"] = ["before": before, "during": during, "after": after,
                                    "passed": before > during && during > 0 && after == 0] as [String: Any]
            }
        }
        // 压力：几十个州同时被邻国从邻州打进来、分批攻占，镜头拉远。
        c.resetRequest = UUID(); await wait(1)
        let stress = WashRecorder(renderer: { c.renderer?() }, probes: [:])
        stress.start()
        let crowd = stage.crowd
        for k in 0..<40 {
            day += 1
            var inputs = [WashInput]()
            for (i, x) in crowd.enumerated() {
                let phase = Double(k) / 40 * 1.6 - Double(i % 6) * 0.1
                let path = [centre(x.from), centre(x.province)]
                let at = along(path, min(1, max(0, phase * 2))), from = along(path, min(1, max(0, phase * 2 - 0.1)))
                if phase > 1 { inputs.append(WashInput(province: x.province, attacker: x.attacker, kind: .capture, progress: 1, day: day, armies: [at])) }
                else if phase > 0 {
                    inputs.append(WashInput(province: x.province, attacker: x.attacker, kind: .march, day: day, armies: [from, at], troops: 4000, key: "crowd-\(i)"))
                    inputs.append(WashInput(province: x.province, attacker: x.attacker, kind: .siege, progress: Float(phase), day: day, armies: [at]))
                }
            }
            // 墨只显示在交战敌国的领土上：每路进攻方与它所攻之州的原主人交战。
            var enemies = [Int: [Int]]()
            for x in crowd { let o = world.meta.provinces[x.province].nation; if o >= 0 && o != x.attacker && !(enemies[x.attacker] ?? []).contains(o) { enemies[x.attacker, default: []].append(o) } }
            c.washes = WashFrame(day: day, inputs: inputs, enemies: enemies)
            c.objectWillChange.send()
            await wait(0.1)
        }
        var heavy = stress.stop()
        heavy["provinces"] = crowd.count
        out["stress"] = heavy
        // 收尾：恢复归属与演示开关。
        c.washes = .empty; c.washEpoch &+= 1
        c.world = start; c.objectWillChange.send()
        await wait(1.2)
        c.washDemo = false
        return out
    }

    @MainActor static func washTour(_ model: GameModel) async {
        guard let map = model.map, let state = model.state, let stage = washStage(map, state.owners) else { return }
        let wasPlaying = model.playing
        model.pause(saving: false)
        await wait(0.8)
        let after = await washRun(model, stage: stage)
        let report: [String: Any] = ["version": 3, "chain": stage.chain, "attacker": stage.attacker, "after": after,
                                     "note": "callbackGapMs 为主线程显示回调间隔；encodeMs 为整帧编码（CPU）；gpuMs 为命令缓冲 GPU 执行；presentGapMs 为实际上屏间隔"]
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys, .prettyPrinted]) {
            try? data.write(to: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("wash-demo.json"), options: .atomic)
        }
        if wasPlaying { model.play() }
    }
}
