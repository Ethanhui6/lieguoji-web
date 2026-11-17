import SwiftUI
import QuartzCore
import LieguojiCore

/// CI 巡览：占领晕染的演示与测量。同一世界、同一镜头、同一事件流程跑两遍——先用旧做法（逐州战场地面 +
/// 全图一个起点的易主渐变），再用新做法（连通区域距离场 + 逐顶点渐变）——各录一段视频、留几张关键帧，
/// 并在固定世界坐标逐帧记录填色与前沿，统计“反复变色”的次数与帧间隔。结果写进 wash-demo.json。
extension ShotTour {
    /// 演示的地块：进攻方、守方的一串相连州（第一个挨着进攻方领土），以及别处一个不相连的州。
    struct WashStage { let attacker: Int; let chain: [Int]; let far: (province: Int, attacker: Int)?; let crowd: [(province: Int, attacker: Int)] }

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
            let near = Set(chain.flatMap { t.provinceNeighbors[$0].map(Int.init) } + chain)
            var far: (province: Int, attacker: Int)?
            for r in owners.indices where !near.contains(r) && owners[r] >= 0 {
                if let s = t.provinceNeighbors[r].map(Int.init).first(where: { owners[$0] >= 0 && owners[$0] != owners[r] && !near.contains($0) }) { far = (r, owners[s]); break }
            }
            // 压力测试：所有挨着别国的州都被邻国围攻（几十个州同时变化）。
            var crowd = [(province: Int, attacker: Int)]()
            for r in owners.indices where owners[r] >= 0 {
                if let s = t.provinceNeighbors[r].map(Int.init).first(where: { owners[$0] >= 0 && owners[$0] != owners[r] }) { crowd.append((r, owners[s])) }
            }
            return WashStage(attacker: a, chain: chain, far: far, crowd: Array(crowd.prefix(48)))
        }
        return nil
    }

    /// 旧做法的占领地面（1.17.1 的 occupationGrounds，回归对照用）：每州一块，从军队一侧（无军队时取最近的进攻方州）
    /// 洇入，面积 = 进度，守方颜色在对侧。
    static func legacyGrounds(_ inputs: [WashInput], map: WorldMap, owners: [Int]) -> [BattleGround] {
        var list = [(BattleGround, Float)]()
        for i in inputs where i.kind == .siege && map.meta.provinces.indices.contains(i.province) {
            let c = SIMD2(map.meta.provinces[i.province].x, map.meta.provinces[i.province].y)
            var best: (Float, SIMD2<Float>)?
            for (k, o) in owners.enumerated() where o == i.attacker && map.meta.provinces.indices.contains(k) {
                let at = SIMD2(map.meta.provinces[k].x, map.meta.provinces[k].y), d = ((at - c) * (at - c)).sum().squareRoot()
                if d > 0.01, best == nil || d < best!.0 { best = (d, at) }
            }
            var dir = (best?.1 ?? c + SIMD2(0, -1)) - c
            dir = dir / max(0.001, (dir * dir).sum().squareRoot()) * 10
            let p = min(1, max(0, i.progress)), owner = owners[i.province]
            list.append((BattleGround(province: i.province, camps: [.init(nation: i.attacker, toward: c + dir, troops: max(0.02, p)), .init(nation: owner, toward: c - dir, troops: max(0.02, 1 - p))]), p))
        }
        return list.sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0.province < $1.0.province }.prefix(24).map(\.0)
    }

    /// 逐帧记录：固定世界坐标（每州一个顶点）显示的陆地颜色、各州晕染的覆盖占比；帧间隔、绘制与 GPU 耗时。
    @MainActor final class WashRecorder: NSObject {
        private var link: CADisplayLink?
        private var last: CFTimeInterval = 0
        var gaps: [Double] = []
        private var colours: [Int: [Float]] = [:]
        private var coverage: [Int: [Float]] = [:]
        private let renderer: () -> MapRenderer?
        private let probes: [Int: Int]
        init(renderer: @escaping () -> MapRenderer?, probes: [Int: Int]) { self.renderer = renderer; self.probes = probes }
        func start() {
            gaps = []; last = 0; colours = [:]; coverage = [:]
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
            // 只看推进中的州（解围回退、被替换淡出的本来就该往回走）。
            if let book = r.washBook { for e in book.entries.values where e.phase == .siege || e.phase == .capture { coverage[e.id, default: []].append(e.field.fraction(e.shown, pad: book.pad)) } }
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
            // 覆盖占比的倒退（推进中的州前沿往回缩）：解围回退之外不该有。
            var backs = 0
            for series in coverage.values where series.count > 1 { for i in 1..<series.count where series[i] < series[i - 1] - 0.02 { backs += 1 } }
            let callback: [String: Double] = ["samples": Double(s.count), "p95": q(95), "p99": q(99), "max": s.last ?? 0,
                                              "over50ms": Double(s.filter { $0 > 50 }.count), "over33ms": Double(s.filter { $0 > 33.4 }.count)]
            var out = [String: Any]()
            out["callbackGapMs"] = callback
            out["encodeMs"] = stats(probe?.encode ?? []); out["washEncodeMs"] = stats(probe?.wash ?? []); out["gpuMs"] = stats(probe?.gpu ?? [])
            out["presentGapMs"] = stats(probe?.presented ?? []); out["recolorMs"] = stats(probe?.recolor ?? [])
            out["colourReversals"] = colours.values.map(Self.reversals).reduce(0, +)
            out["coverageBacksteps"] = backs
            return out
        }
    }

    /// 演示一遍：`legacy` 用旧做法。返回测量结果。
    @MainActor static func washRun(_ model: GameModel, stage: WashStage, legacy: Bool, label: String) async -> [String: Any] {
        guard let map = model.map, let start = model.controller.world ?? model.map, let state = model.state else { return [:] }
        let owners = state.owners
        let c = model.controller
        MapRenderer.legacyLandFade = legacy
        c.washDemo = true; c.groundDemo = legacy
        c.washes = []; c.washEpoch &+= 1; c.battleGrounds = []; c.objectWillChange.send()
        // 镜头：五州的中心，适中的远近（能同时看到整片推进）。
        let chain = stage.chain
        let mid = chain.reduce(SIMD2<Float>(0, 0)) { $0 + SIMD2(map.meta.provinces[$1].x, map.meta.provinces[$1].y) } / Float(chain.count)
        c.fly(x: Double(mid.x), y: Double(mid.y)); await wait(2)
        var probes = [Int: Int]()
        let t = WashTopology(map: map)
        for p in chain + [stage.far?.province].compactMap({ $0 }) {
            if let cell = t.provinceCells[p].first { probes[p] = Int(map.offsets[Int(cell)]) }
        }
        let recorder = WashRecorder(renderer: { c.renderer?() }, probes: probes)
        await shoot("rec-\(label)-start")
        recorder.start()
        var world = start
        var progress = [Int: Float](), captured = Set<Int>(), cancelled = Set<Int>()
        var day = 1
        func send() {
            var inputs = [WashInput]()
            for (p, v) in progress where !captured.contains(p) && !cancelled.contains(p) {
                let a = p == stage.far?.province ? stage.far!.attacker : stage.attacker
                inputs.append(WashInput(province: p, attacker: a, kind: .siege, progress: v, day: day))
            }
            for p in captured { inputs.append(WashInput(province: p, attacker: p == stage.far?.province ? stage.far!.attacker : stage.attacker, kind: .capture, progress: 1, day: 1000 + p)) }
            inputs.sort { $0.province < $1.province }
            if legacy { c.battleGrounds = legacyGrounds(inputs, map: map, owners: world.meta.provinces.map(\.nation)) } else { c.washes = inputs }
            c.objectWillChange.send()
        }
        /// 推进 seconds 秒，每 0.1 秒一步（像推演一样分步到来）。
        func drive(_ seconds: Double, _ body: (Double) -> Void) async {
            let steps = Int(seconds * 10)
            for k in 0..<steps { body(Double(k + 1) / Double(steps)); day += 1; send(); await wait(0.1) }
        }
        func capture(_ list: [Int]) {
            for p in list { captured.insert(p); world.meta.provinces[p].nation = p == stage.far?.province ? stage.far!.attacker : stage.attacker }
            c.world = world
        }
        // 1 单州；2 相邻两州；3 五州从同一方向分批加入，外加不相连的一州；
        await drive(1.6) { k in progress[chain[0]] = Float(k) * 0.6 }
        await shoot("40a-wash-single-\(label)")
        await drive(1.6) { k in progress[chain[0]] = 0.6 + Float(k) * 0.2; progress[chain[1]] = Float(k) * 0.5 }
        await shoot("40b-wash-two-\(label)")
        await drive(2.4) { k in
            for (i, p) in chain.dropFirst(2).enumerated() where k > Double(i) * 0.25 { progress[p] = Float(k - Double(i) * 0.25) * 0.6 }
            progress[chain[1]] = 0.5 + Float(k) * 0.3
            if let f = stage.far { progress[f.province] = Float(k) * 0.5 }
        }
        await shoot("40c-wash-chain-\(label)")
        // 4 攻占（底色换成进攻方），连续几州分批；5 一州解围回退；6 缩放、平移、换视图、开页面。
        capture([chain[0], chain[1]])
        await drive(1.2) { _ in }
        await shoot("40d-wash-capture-\(label)")
        capture([chain[2]])
        cancelled.insert(chain[chain.count - 1])
        await drive(1.0) { k in progress[chain[3]] = 0.6 + Float(k) * 0.3 }
        c.resetRequest = UUID()
        await drive(1.4) { _ in }
        await shoot("40e-wash-zoomed-out-\(label)")
        model.mapView = .alliance
        await drive(1.0) { _ in }
        model.mapView = .state
        capture([chain[3]] + [stage.far?.province].compactMap { $0 })
        await drive(1.6) { _ in }
        await shoot("40f-wash-settled-\(label)")
        // 13 结束后持续观察：终态稳定、资源回收。
        await drive(1.5) { _ in }
        await shoot("rec-\(label)-stop")
        var out = recorder.stop()
        out["washBuffersLeft"] = c.renderer?()?.washBuffers.count ?? -1
        out["washEntriesLeft"] = c.renderer?()?.washBook?.all.count ?? -1
        // 压力：几十个州同时被围、分批攻占，镜头拉远。
        c.resetRequest = UUID(); await wait(1)
        let stress = WashRecorder(renderer: { c.renderer?() }, probes: [:])
        stress.start()
        progress = [:]; captured = []; cancelled = []
        let crowd = stage.crowd
        func sendCrowd(_ k: Double) {
            var inputs = [WashInput]()
            for (i, x) in crowd.enumerated() {
                let phase = k * 1.6 - Double(i % 6) * 0.1
                if phase > 1 { inputs.append(WashInput(province: x.province, attacker: x.attacker, kind: .capture, progress: 1, day: 5000 + x.province)) }
                else if phase > 0 { inputs.append(WashInput(province: x.province, attacker: x.attacker, kind: .siege, progress: Float(phase), day: day)) }
            }
            if legacy { c.battleGrounds = legacyGrounds(inputs, map: map, owners: owners) } else { c.washes = inputs }
            c.objectWillChange.send()
        }
        for k in 0..<40 { day += 1; sendCrowd(Double(k) / 40); await wait(0.1) }
        await shoot("40g-wash-stress-\(label)")
        var heavy = stress.stop()
        heavy["provinces"] = crowd.count
        out["stress"] = heavy
        // 收尾：恢复归属与演示开关。
        c.washes = []; c.battleGrounds = []; c.washEpoch &+= 1
        c.world = start; c.objectWillChange.send()
        await wait(1.2)
        c.washDemo = false; c.groundDemo = false
        MapRenderer.legacyLandFade = false
        return out
    }

    @MainActor static func washTour(_ model: GameModel) async {
        guard let map = model.map, let state = model.state, let stage = washStage(map, state.owners) else { return }
        let wasPlaying = model.playing
        model.pause(saving: false)
        await wait(0.8)
        let before = await washRun(model, stage: stage, legacy: true, label: "before")
        let after = await washRun(model, stage: stage, legacy: false, label: "after")
        let report: [String: Any] = ["version": 1, "chain": stage.chain, "attacker": stage.attacker, "before": before, "after": after,
                                     "note": "callbackGapMs 为主线程显示回调间隔；encodeMs 为整帧编码（CPU）；gpuMs 为命令缓冲 GPU 执行；presentGapMs 为实际上屏间隔"]
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys, .prettyPrinted]) {
            try? data.write(to: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("wash-demo.json"), options: .atomic)
        }
        if wasPlaying { model.play() }
    }
}
