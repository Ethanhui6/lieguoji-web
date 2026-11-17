import Foundation
import Metal
import QuartzCore
import simd
import LieguojiCore

/// 战争晕染（沙盘墨场）的渲染端：状态机在 LieguojiCore（ConquestWash.swift），这里只负责拓扑的后台构建、
/// 有墨格子的一份顶点缓冲（只在墨场改动、易主、换视图时重建）与每帧一次绘制；浓度动画在着色器里按时刻插值。
extension MapRenderer {
    /// 只在墨还在动（落墨、褪墨、易主扫满）时要求连续重绘；静止的墨不占显示链路。关掉战争晕染时不画。
    var washesAnimating: Bool { washAnimating && (display.battleGround ?? true) && reveal >= 1 }

    private func washOwner() -> (Int) -> Int {
        let provinces = map.meta.provinces
        return { p in provinces.indices.contains(p) ? provinces[p].nation : -1 }
    }

    /// 地图几何对应的墨场；拓扑在后台建一次（换世界、自绘地形后重建），建好之前的输入先存着。
    private func readyBook() -> WashBook? {
        let key = WashTopology.key(of: map)
        if let book = washBook, book.topology.key == key { return book }
        if washBook != nil { washBook = nil; washMeshCache = nil; washOld = [] }
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
                self.washOld = [Float](repeating: 0, count: topology.vertexCount * 3)
                book.update(self.washPending, owner: self.washOwner(), now: self.clock())
                self.washAnimating = true
                self.onOutlines?()
            }
        }
        return nil
    }

    /// 每步推演的墨场输入。`epoch` 变了（读档、换世界、重开）就清空，不带旧世界的墨。
    func setWashes(_ frame: WashFrame, epoch: Int) {
        if epoch != washEpoch { washEpoch = epoch; washBook?.reset(); washMeshCache = nil }
        washPending = frame
        guard let book = readyBook() else { return }
        book.update(frame, owner: washOwner(), now: clock())
        washAnimating = true
    }

    /// 新的陆地颜色即将安装：刚攻占（或州里已有新主人的墨）且颜色确实变了的州交给墨场扫满
    /// （底色立即换，未到达处盖旧色）。记下这些州每个顶点此刻显示的颜色作为旧色。返回接手的州。
    func washHandover(next: [Float], now: Float) -> Set<Int> {
        guard let book = washBook, display.battleGround ?? true, landFade.to.count == next.count else { return [] }
        let owner = washOwner(), shown = landFade.to, t = book.topology
        var changed = Set<Int>()
        for p in book.flipCandidates(owner: owner) where t.provinceCells.indices.contains(p) {
            search: for c in t.provinceCells[p] {
                for v in t.vertexRange(Int(c)) {
                    let i = v * 4
                    guard i + 2 < next.count else { continue }
                    if next[i] != shown[i] || next[i + 1] != shown[i + 1] || next[i + 2] != shown[i + 2] { changed.insert(p); break search }
                }
            }
        }
        guard !changed.isEmpty else { return [] }
        let taken = book.landFlipped(changed, owner: owner, now: now)
        if washOld.count != t.vertexCount * 3 { washOld = [Float](repeating: 0, count: t.vertexCount * 3) }
        for p in taken {
            for c in t.provinceCells[p] {
                for v in t.vertexRange(Int(c)) { let col = landFade.shown(v, at: now); washOld[v * 3] = col.x; washOld[v * 3 + 1] = col.y; washOld[v * 3 + 2] = col.z }
            }
        }
        washAnimating = true
        return Set(taken)
    }

    /// 换视图（颜色含义变了）：易主扫满中的州收尾，墨色按新视图重取。
    func washViewChanged() {
        washBook?.viewChanged()
        washColourEpoch &+= 1
    }

    /// 各国在当前视图里的“国色”：联盟、家族等视图取其某一州的填色，否则取国色。
    private func washStates() -> [Int: RGB] {
        var out = [Int: RGB]()
        if mode == .political, let fills {
            for (p, province) in map.meta.provinces.enumerated() where out[province.nation] == nil && fills.indices.contains(p) { out[province.nation] = fills[p] }
        }
        return out
    }

    /// 某格若归墨主时的陆地底色：与底色同一算法（政治色按高度灰调和）；地形视图里取国色本身。
    private func washBase(_ state: RGB, cell c: Int) -> SIMD3<Float> {
        guard mode == .political, map.cellCount > c, c >= 0 else { return SIMD3(state.r, state.g, state.b) }
        let s = MapPalette.stateColor(map: map, cell: c, state: state)
        return SIMD3(s.r, s.g, s.b)
    }
    /// 底色到顶点：颜色浓度（与地形调和）与地形明暗，易主换底时已到达处的颜色不跳。
    private func washFinish(_ base: SIMD3<Float>, vertex v: Int) -> SIMD3<Float> {
        var rgb = base
        if mode == .political, display.colorDensity < 1, let t = terrainBase, t.count > v * 4 + 2 {
            let k = Float(max(0, display.colorDensity)), g = SIMD3(t[v * 4], t[v * 4 + 1], t[v * 4 + 2])
            rgb = g + (rgb - g) * k
        }
        if shade.count > v { rgb = simd_min(rgb * shade[v], SIMD3(repeating: 1)) }
        return rgb
    }

    /// 墨场顶点缓冲：每个有墨格子的顶点拷贝 14 个数（x, y, 起始浓度, 目标浓度, 开始时刻, 时长, 墨色 rgb, 旧色 rgb,
    /// 易主时刻, 备用）与扇形三角形索引。一次分配，底色每格只算一次。
    private func washMesh(_ book: WashBook) -> (vertices: MTLBuffer, indices: MTLBuffer, count: Int)? {
        if let m = washMeshCache, m.revision == book.revision, m.colours == washColourEpoch { return m.count > 0 ? (m.vertices, m.indices, m.count) : nil }
        let t = book.topology
        var states = washStates()
        func state(_ n: Int) -> RGB {
            if let s = states[n] { return s }
            let s = nationColors.indices.contains(n) ? nationColors[n] : RGB(0.6, 0.6, 0.6)
            states[n] = s; return s
        }
        var vertexTotal = 0, triangleTotal = 0
        for c in book.active { let n = t.vertexRange(Int(c)).count; if n >= 3 { vertexTotal += n; triangleTotal += n - 2 } }
        guard triangleTotal > 0 else { washMeshCache = nil; return nil }
        var data = [Float](repeating: 0, count: vertexTotal * 14), index = [UInt32](repeating: 0, count: triangleTotal * 3)
        var vertexCount = 0, indexCount = 0
        let oldColours = washOld
        for c32 in book.active {
            let c = Int(c32), range = t.vertexRange(c)
            guard range.count >= 3 else { continue }
            // 没有自己墨主的顶点（墨没洇到）取本格最浓的墨主，免得前沿处颜色被插值拉偏。
            var dominant: Int32 = -1, best: Float = -1
            for v in range where book.stain[v] >= 0 && max(book.to[v], book.from[v]) > best { best = max(book.to[v], book.from[v]); dominant = book.stain[v] }
            guard dominant >= 0 else { continue }
            let dominantBase = washBase(state(Int(dominant)), cell: c)
            let base = UInt32(vertexCount)
            for v in range {
                let n = book.stain[v] >= 0 ? book.stain[v] : dominant
                let tint = washFinish(n == dominant ? dominantBase : washBase(state(Int(n)), cell: c), vertex: v)
                let flipped = book.flipAt[v] != LandFade.idle && oldColours.count >= v * 3 + 3
                let p = t.position(v), o = vertexCount * 14
                data[o] = p.x; data[o + 1] = p.y
                data[o + 2] = book.from[v]; data[o + 3] = book.to[v]; data[o + 4] = book.start[v]; data[o + 5] = book.length[v]
                data[o + 6] = tint.x; data[o + 7] = tint.y; data[o + 8] = tint.z
                if flipped { data[o + 9] = oldColours[v * 3]; data[o + 10] = oldColours[v * 3 + 1]; data[o + 11] = oldColours[v * 3 + 2] }
                else { data[o + 9] = tint.x; data[o + 10] = tint.y; data[o + 11] = tint.z }
                data[o + 12] = book.flipAt[v]
                vertexCount += 1
            }
            for j in 1..<(range.count - 1) {
                index[indexCount] = base; index[indexCount + 1] = base + UInt32(j); index[indexCount + 2] = base + UInt32(j + 1)
                indexCount += 3
            }
        }
        guard indexCount > 0, let vb = device.makeBuffer(bytes: data, length: vertexCount * 14 * 4, options: .storageModeShared),
              let ib = device.makeBuffer(bytes: index, length: indexCount * 4, options: .storageModeShared) else {
            washMeshCache = nil; return nil
        }
        washMeshCache = (book.revision, washColourEpoch, vb, ib, indexCount)
        return (vb, ib, indexCount)
    }

    /// 每帧：收尾检查后一次绘制（浓度、易主扫满在着色器里按本帧时刻插值）。
    func drawWashes(_ encoder: MTLRenderCommandEncoder, _ u: inout Uniforms) {
        guard let book = washBook else { washAnimating = false; return }
        let now = clock(frameTime)
        book.tick(now)
        washAnimating = book.animating(at: now)
        guard !book.isEmpty, let mesh = washMesh(book) else { return }
        // 远看只留干净的墨块，近看才有纸纹浓淡（连续过渡，缩放时不跳）。
        let detail = Float(min(1, max(0, (camera.scale - 0.7) / 0.6)))
        let w: [Float] = [now, WashBook.soft, WashBook.noise, 1 / (book.topology.scale * 0.9), WashBook.tint, detail, 1, 0]
        encoder.setRenderPipelineState(washPipeline)
        encoder.setVertexBuffer(mesh.vertices, offset: 0, index: 0)
        encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
        encoder.setFragmentBytes(w, length: w.count * MemoryLayout<Float>.stride, index: 0)
        encoder.drawIndexedPrimitives(type: .triangle, indexCount: mesh.count, indexType: .uint32, indexBuffer: mesh.indices, indexBufferOffset: 0)
    }
}
