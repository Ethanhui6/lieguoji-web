import Foundation
import Metal
import QuartzCore
import simd
import LieguojiCore

/// 占领晕染的渲染端：状态机与区域距离场在 LieguojiCore（ConquestWash.swift），这里只负责
/// 拓扑的后台构建、每州一份紧凑顶点缓冲（只在换场、易主、换视图时重建）与每帧几个参数的绘制。
extension MapRenderer {
    /// 只在前沿、透明度或形变还在变时要求连续重绘；静止的围城不占显示链路。关掉战场地面显示时不画也不推进。
    var washesAnimating: Bool { washAnimating && (display.battleGround ?? true) && reveal >= 1 }

    private func washOwner() -> (Int) -> Int {
        let provinces = map.meta.provinces
        return { p in provinces.indices.contains(p) ? provinces[p].nation : -1 }
    }

    /// 地图几何对应的晕染簿；拓扑在后台建一次（换世界、自绘地形后重建），建好之前的输入先存着。
    private func readyBook() -> WashBook? {
        let key = WashTopology.key(of: map)
        if let book = washBook, book.topology.key == key { return book }
        if washBook != nil { washBook = nil; washBuffers = [:]; washOld = [:] }
        guard washBuilding != key else { return nil }
        washBuilding = key
        let source = map
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let topology = WashTopology(map: source)
            DispatchQueue.main.async {
                guard let self, WashTopology.key(of: self.map) == topology.key else { return }
                self.washBuilding = 0
                let book = WashBook(topology: topology)
                self.washBook = book
                book.update(self.washPending, owner: self.washOwner(), now: Double(self.clock()))
                self.washAnimating = !book.isEmpty
                self.onOutlines?()
            }
        }
        return nil
    }

    /// 每步推演的围城与攻占。`epoch` 变了（读档、换世界、重开）就清空，不带旧世界的晕染。
    func setWashes(_ inputs: [WashInput], epoch: Int) {
        if epoch != washEpoch { washEpoch = epoch; washBook?.reset(); washBuffers = [:]; washOld = [:] }
        washPending = inputs
        guard let book = readyBook() else { return }
        book.update(inputs, owner: washOwner(), now: Double(clock()))
        washAnimating = !book.isEmpty
    }

    /// 归属变了：重算受影响区域的进入边界。
    func washRegroup() {
        guard let book = washBook, book.topology.key == WashTopology.key(of: map) else { return }
        book.regroup(owner: washOwner())
    }

    /// 新的陆地颜色即将安装：正在晕染、且这次换成进攻方颜色的州交给晕染（底色立即换，晕染在未到达处盖旧色）。
    /// 记下这些州每个顶点此刻显示的颜色作为旧色。返回接手的州。
    func washHandover(next: [Float], now: Float) -> Set<Int> {
        guard let book = washBook, display.battleGround ?? true, landFade.to.count == next.count else { return [] }
        let owner = washOwner(), shown = landFade.to
        var changed = Set<Int>()
        for e in book.all where !e.flipped && e.phase != .leaving && owner(e.province) == e.attacker {
            for v in e.field.vertex {
                let i = Int(v) * 4
                guard i + 2 < next.count else { continue }
                if next[i] != shown[i] || next[i + 1] != shown[i + 1] || next[i + 2] != shown[i + 2] { changed.insert(e.province); break }
            }
        }
        guard !changed.isEmpty else { return [] }
        let taken = book.landFlipped(changed)
        for p in taken {
            guard let e = book.entries[p] else { continue }
            var old = [Float](); old.reserveCapacity(e.field.vertex.count * 3)
            for v in e.field.vertex { let c = landFade.shown(Int(v), at: now); old += [c.x, c.y, c.z] }
            washOld[e.id] = old
        }
        washAnimating = true
        return Set(taken)
    }

    /// 换视图（颜色含义变了）：已换底的晕染收尾，围城的进攻色按新视图重取。
    func washViewChanged() {
        washBook?.viewChanged()
        washOld = [:]
        washColourEpoch &+= 1
    }

    /// 进攻方在当前视图里的“国色”：联盟、家族等视图取其某一州的填色，否则取国色。
    private func washState(_ nation: Int) -> RGB {
        if mode == .political, let fills, let p = map.meta.provinces.firstIndex(where: { $0.nation == nation }), fills.indices.contains(p) { return fills[p] }
        return nationColors.indices.contains(nation) ? nationColors[nation] : RGB(0.6, 0.6, 0.6)
    }

    /// 某顶点若归进攻方时的陆地颜色：与底色同一算法（政治色按高度灰调和、颜色浓度、地形明暗），
    /// 易主换底时已到达处的颜色不跳。地形视图里以国色淡淡压在地形上。
    private func washTint(_ state: RGB, vertex v: Int, cell c: Int) -> SIMD3<Float> {
        var rgb: SIMD3<Float>
        if mode == .political, map.cellCount > c, c >= 0 {
            let s = MapPalette.stateColor(map: map, cell: c, state: state)
            rgb = SIMD3(s.r, s.g, s.b)
            if display.colorDensity < 1, let t = terrainBase, t.count > v * 4 + 2 {
                let k = Float(max(0, display.colorDensity)), g = SIMD3(t[v * 4], t[v * 4 + 1], t[v * 4 + 2])
                rgb = g + (rgb - g) * k
            }
        } else {
            rgb = SIMD3(state.r, state.g, state.b)
        }
        if shade.count > v { rgb = simd_min(rgb * shade[v], SIMD3(repeating: 1)) }
        return rgb
    }

    /// 一条晕染的顶点缓冲：x, y, 抵达距离, 旧形状, 进攻色 rgb, 旧色 rgb（每顶点 10 个数）。
    private func washMesh(_ e: WashBook.Entry) -> (buffer: MTLBuffer, count: Int)? {
        if let m = washBuffers[e.id], m.revision == e.revision, m.colours == washColourEpoch { return (m.buffer, m.count) }
        let f = e.field, n = f.vertex.count
        guard n > 0, f.cell.count == n else { return nil }
        let state = washState(e.attacker), old = washOld[e.id]
        var data = [Float](repeating: 0, count: n * 10)
        for i in 0..<n {
            let o = i * 10, v = Int(f.vertex[i])
            data[o] = f.position[i].x; data[o + 1] = f.position[i].y
            data[o + 2] = f.arrival[i]
            data[o + 3] = i < e.snapshot.count ? e.snapshot[i] : f.arrival[i] - e.shown
            let t = washTint(state, vertex: v, cell: Int(f.cell[i]))
            data[o + 4] = t.x; data[o + 5] = t.y; data[o + 6] = t.z
            if let old, old.count >= i * 3 + 3 { data[o + 7] = old[i * 3]; data[o + 8] = old[i * 3 + 1]; data[o + 9] = old[i * 3 + 2] }
            else { data[o + 7] = t.x; data[o + 8] = t.y; data[o + 9] = t.z }
        }
        guard let buffer = device.makeBuffer(bytes: data, length: data.count * 4, options: .storageModeShared) else { return nil }
        washBuffers[e.id] = (e.revision, washColourEpoch, buffer, n)
        return (buffer, n)
    }

    /// 每帧：按本帧时刻推进状态机，再逐条绘制。交战中的州让位给战场地面（按地面的透明度互补，不叠色）。
    func drawWashes(_ encoder: MTLRenderCommandEncoder, _ u: inout Uniforms) {
        guard let book = washBook, !book.isEmpty else { washAnimating = false; if !washBuffers.isEmpty { washBuffers = [:]; washOld = [:] }; return }
        washAnimating = book.advance(to: Double(clock(frameTime)))
        // 远看只留干净的整体推进，近看才有纸纹浓淡（连续过渡，缩放时不跳）。
        let detail = Float(min(1, max(0, (camera.scale - 0.7) / 0.6)))
        let freq = 1 / (book.topology.scale * 0.9)
        var live = Set<Int>()
        encoder.setRenderPipelineState(washPipeline)
        encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
        for e in book.all {
            live.insert(e.id)
            let cover = grounds.list[e.province].map { $0.alpha } ?? 0
            let alpha = e.alpha * (1 - min(1, cover))
            guard alpha > 0.004, e.shown.isFinite, let mesh = washMesh(e) else { continue }
            let w: [Float] = [e.shown, book.soft, book.noise, freq, e.morph, WashBook.tint, e.flipped ? 1 : 0, e.flipFade, alpha, detail, 0, 0]
            encoder.setVertexBuffer(mesh.buffer, offset: 0, index: 0)
            encoder.setFragmentBytes(w, length: w.count * MemoryLayout<Float>.stride, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: mesh.count)
        }
        // 结束的晕染：回收缓冲与旧色。
        for id in washBuffers.keys where !live.contains(id) { washBuffers[id] = nil; washOld[id] = nil }
    }
}
