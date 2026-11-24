import Foundation
import Metal
import QuartzCore
import simd
import LieguojiCore

/// 战争晕染的渲染端调度：每步的输入交给 GPU 墨场（Render/Ink.swift），颜色真的变了的州交给易主扫色（FlipSweep），
/// 政变、复辟等大事从首都扫一道墨圈。拓扑在后台建一次（换世界、自绘地形后重建）。
extension MapRenderer {
    /// 墨还在落、扫色还在走时要求连续重绘；静止时不占显示链路。关掉战争晕染时不画。
    var washesAnimating: Bool {
        guard (display.battleGround ?? true) && reveal >= 1 else { return false }
        return (sweep?.animating(at: clock(frameTime)) ?? false) || (ink?.busy(clock(frameTime)) ?? false)
    }

    /// 某国首都所在城的位置。
    func capitalPoint(_ nation: Int) -> SIMD2<Float>? {
        guard map.meta.nations.indices.contains(nation) else { return nil }
        let cap = map.meta.nations[nation].capital
        guard map.meta.cities.indices.contains(cap) else { return nil }
        return SIMD2(map.meta.cities[cap].x, map.meta.cities[cap].y)
    }

    /// 地图几何对应的拓扑；在后台建，建好之前的输入先存着。
    private func readyTopology() -> WashTopology? {
        if ink == nil || ink!.world != SIMD2(Float(max(1, map.width)), Float(max(1, map.height))) {
            ink = InkField(map: map)
            rebuildInkOwners()
        }
        let key = WashTopology.key(of: map)
        if let t = washTopology, t.key == key { return t }
        if washTopology != nil { washTopology = nil; sweep = nil; sweepMeshCache = nil; ink?.cells = nil }
        guard washBuilding != key else { return nil }
        washBuilding = key
        let source = map
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let topology = WashTopology(map: source)
            DispatchQueue.main.async {
                guard let self, WashTopology.key(of: self.map) == topology.key else { return }
                self.washBuilding = 0
                self.washTopology = topology
                self.sweep = FlipSweep(topology: topology)
                self.washOld = [Float](repeating: 0, count: topology.vertexCount * 3)
                self.inkFrame(self.washFrame, topology: topology)
                self.onOutlines?()
            }
        }
        return nil
    }

    /// 每步推演的输入。`epoch` 变了（读档、换世界、重开）就清空，不带旧世界的墨。
    func setWashes(_ frame: WashFrame, epoch: Int) {
        if epoch != washEpoch {
            washEpoch = epoch
            sweep?.clear(); sweepMeshCache = nil
            ink?.reset(self)
            washCaptures = [:]; washRegimes = [:]
        }
        washFrame = frame
        let now = clock()
        washCaptures = washCaptures.filter { now - $0.value.time < 3 }
        washRegimes = washRegimes.filter { now - $0.value < 4 }
        for i in frame.inputs where i.kind == .capture { washCaptures[i.province] = (i.attacker, i.armies, now) }
        let topology = readyTopology()
        inkFrame(frame, topology: topology)
        // 政变、复辟、改制：从首都扫过全国的一道墨圈（颜色若因此变了，安装颜色时按换色扫）。
        if let sweep, !frame.ripples.isEmpty, reveal >= 1 {
            var groups = [(provinces: [Int], seeds: [SIMD2<Float>])]()
            for n in frame.ripples {
                washRegimes[n] = now
                let list = map.meta.provinces.indices.filter { map.meta.provinces[$0].nation == n }
                if !list.isEmpty { groups.append((list, capitalPoint(n).map { [$0] } ?? [])) }
            }
            sweep.start(groups, recolour: false, now: now)
        }
    }

    /// 新的陆地颜色即将安装：归属变了（攻占、反叛、割地、新立国）或刚有大事的国家颜色变了（改朝换代在家族等视图里换色）
    /// 的州交给扫色——底色立即换，新颜色从攻占的军队或新主人的首都扫过去。记下这些州每个顶点此刻显示的颜色作为旧色。
    func washHandover(next: [Float], owners: [Int], now: Float) -> Set<Int> {
        guard let sweep, let t = washTopology, display.battleGround ?? true, landFade.to.count == next.count else { return [] }
        let previousOwners = ink?.lastProvinceOwners ?? [], shown = landFade.to
        func owner(_ p: Int) -> Int { owners.indices.contains(p) ? owners[p] : -1 }
        var captured = [(provinces: [Int], seeds: [SIMD2<Float>])](), byOwner = [Int: [Int]]()
        for p in t.provinceCells.indices where !t.provinceCells[p].isEmpty {
            let n = owner(p)
            guard n >= 0 else { continue }
            let moved = previousOwners.indices.contains(p) && previousOwners[p] != n
            guard moved || washRegimes[n] != nil else { continue }
            var changed = false
            search: for c in t.provinceCells[p] {
                for v in t.vertexRange(Int(c)) {
                    let i = v * 4
                    guard i + 2 < next.count else { continue }
                    if next[i] != shown[i] || next[i + 1] != shown[i + 1] || next[i + 2] != shown[i + 2] { changed = true; break search }
                }
            }
            guard changed else { continue }
            if let cap = washCaptures[p], cap.nation == n, !cap.armies.isEmpty { captured.append(([p], cap.armies)) }
            else { byOwner[n, default: []].append(p) }
        }
        var groups = captured
        let inkSnapshot = ink?.snapshot
        for n in byOwner.keys.sorted() {
            let list = byOwner[n]!
            var frontSeeds = [SIMD2<Float>]()
            if let inkSnapshot, t.cellCount == inkSnapshot.nation.count {
                let targetSet = Set(list)
                for p in list {
                    for c32 in t.provinceCells[p] {
                        let c = Int(c32)
                        if inkSnapshot.nation[c] == Int32(n) {
                            frontSeeds.append(t.site[c]); continue
                        }
                        for nb32 in t.neighbors(c) {
                            let nb = Int(nb32), np = Int(t.province[nb])
                            guard np >= 0 else { continue }
                            if !targetSet.contains(np), (owner(np) == n || (inkSnapshot.nation[nb] == Int32(n) && inkSnapshot.leave[nb] >= InkCells.never)) {
                                frontSeeds.append(t.site[c]); break
                            }
                        }
                    }
                }
            }
            if frontSeeds.count > 12 {
                let step = max(1, frontSeeds.count / 8)
                frontSeeds = stride(from: 0, to: frontSeeds.count, by: step).map { frontSeeds[$0] }
            }
            groups.append((list, frontSeeds.isEmpty ? (capitalPoint(n).map { [$0] } ?? []) : frontSeeds))
        }
        guard !groups.isEmpty else { return [] }
        let prevSweepModes = sweep.mode, prevSweepArrive = sweep.arrive, prevOld = washOld
        let taken = sweep.start(groups, recolour: true, now: now)
        if washOld.count != t.vertexCount * 3 { washOld = [Float](repeating: 0, count: t.vertexCount * 3) }
        for p in taken {
            washCaptures[p] = nil
            let newOwner = owner(p)
            for c in t.provinceCells[p] {
                for v in t.vertexRange(Int(c)) {
                    var col = landFade.shown(v, at: now)
                    if prevSweepModes[v] > 0.5, prevOld.count >= v * 3 + 3 {
                        let x = min(Float(1), max(0, ((now - prevSweepArrive[v]) / FlipSweep.edge + 1) / 2))
                        let r = x * x * (3 - 2 * x)
                        let oldC = SIMD3(prevOld[v * 3], prevOld[v * 3 + 1], prevOld[v * 3 + 2])
                        col = oldC + (col - oldC) * r
                    }
                    // 若该顶点在易主/正式割让前已被新主人的战时墨迹覆盖，从当前墨色无缝衔接新主底色，杜绝闪回旧国底色 1 帧。
                    if let inkSnapshot, newOwner >= 0, v * 4 + 3 < inkSnapshot.vertices.count,
                       inkSnapshot.vertices[v * 4] >= 0, Int(inkSnapshot.vertices[v * 4] + 0.5) == newOwner, v * 4 + 2 < next.count {
                        let inkAmt = inkSnapshot.level(v, at: now)
                        if inkAmt > 0.01 {
                            let nextC = SIMD3(next[v * 4], next[v * 4 + 1], next[v * 4 + 2])
                            col = col + (nextC - col) * inkAmt
                        }
                    }
                    washOld[v * 3] = col.x; washOld[v * 3 + 1] = col.y; washOld[v * 3 + 2] = col.z
                }
            }
        }
        return Set(taken)
    }

    /// 换视图（颜色含义变了）：扫色收尾。
    func washViewChanged() {
        sweep?.clear()
        sweepMeshCache = nil
    }

    /// 扫色顶点缓冲：每个正在扫的格子的顶点拷贝 8 个数（x, y, 到达时刻, 模式, 旧色 rgb, 备用）与扇形索引。
    private func sweepMesh(_ sweep: FlipSweep) -> (vertices: MTLBuffer, indices: MTLBuffer, count: Int)? {
        if let m = sweepMeshCache, m.revision == sweep.revision { return m.count > 0 ? (m.vertices, m.indices, m.count) : nil }
        let t = sweep.topology
        var vertexTotal = 0, triangleTotal = 0
        for c in sweep.active { let n = t.vertexRange(Int(c)).count; if n >= 3 { vertexTotal += n; triangleTotal += n - 2 } }
        guard triangleTotal > 0 else { sweepMeshCache = nil; return nil }
        var data = [Float](repeating: 0, count: vertexTotal * 8), index = [UInt32](repeating: 0, count: triangleTotal * 3)
        var vertexCount = 0, indexCount = 0
        let old = washOld
        for c in sweep.active {
            let range = t.vertexRange(Int(c))
            guard range.count >= 3 else { continue }
            let base = UInt32(vertexCount)
            for v in range {
                let p = t.position(v), o = vertexCount * 8
                data[o] = p.x; data[o + 1] = p.y; data[o + 2] = sweep.arrive[v]; data[o + 3] = sweep.mode[v]
                if old.count >= v * 3 + 3 { data[o + 4] = old[v * 3]; data[o + 5] = old[v * 3 + 1]; data[o + 6] = old[v * 3 + 2] }
                vertexCount += 1
            }
            for j in 1..<(range.count - 1) {
                index[indexCount] = base; index[indexCount + 1] = base + UInt32(j); index[indexCount + 2] = base + UInt32(j + 1)
                indexCount += 3
            }
        }
        guard indexCount > 0, let vb = device.makeBuffer(bytes: data, length: vertexCount * 8 * 4, options: .storageModeShared),
              let ib = device.makeBuffer(bytes: index, length: indexCount * 4, options: .storageModeShared) else { sweepMeshCache = nil; return nil }
        sweepMeshCache = (sweep.revision, vb, ib, indexCount)
        return (vb, ib, indexCount)
    }

    /// 每帧：扫色（盖旧色、湿边）在墨场之下，二者都在陆地之上、州界之下。
    func drawWashes(_ encoder: MTLRenderCommandEncoder, _ u: inout Uniforms, command: MTLCommandBuffer) {
        let now = clock(frameTime)
        if let sweep {
            sweep.tick(now)
            if !sweep.isEmpty, let mesh = sweepMesh(sweep) {
                let detail = Float(min(1, max(0, (camera.scale - 0.7) / 0.6)))
                let scale = sweep.topology.scale
                let w: [Float] = [now, FlipSweep.edge, FlipSweep.after, 0.5, 0.28, 1 / (scale * 1.24), detail, 0]
                encoder.setRenderPipelineState(sweepPipeline)
                encoder.setVertexBuffer(mesh.vertices, offset: 0, index: 0)
                encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
                encoder.setFragmentBytes(w, length: w.count * MemoryLayout<Float>.stride, index: 0)
                encoder.drawIndexedPrimitives(type: .triangle, indexCount: mesh.count, indexType: .uint32, indexBuffer: mesh.indices, indexBufferOffset: 0)
            }
        }
        drawInk(encoder, &u, command: command)
    }

    /// 扫色着色器（拼在 MapRenderer.shaders 之后）：沿用 Claude 原版利落宣纸湿墨锋，并精调微纸纹与双层暖金笔光。
    static let sweepShaders = """
    // —— 易主扫色 ——
    struct SweepOut { float4 position [[position]]; float2 world; float arrive; float mode; float3 old; };
    vertex SweepOut sweepVertex(uint id [[vertex_id]], const device float* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        const device float* p = v + id * 8;
        SweepOut o; o.world = float2(p[0], p[1]); o.position = clip(o.world, u, float2(0.0));
        o.arrive = p[2]; o.mode = p[3]; o.old = float3(p[4], p[5], p[6]);
        return o;
    }
    struct SweepLook { float now; float edge; float after; float tint; float noise; float freq; float detail; float pad; };
    fragment float4 sweepFragment(SweepOut in [[stage_in]], constant SweepLook& k [[buffer(0)]]) {
        if (in.mode < -0.5) discard_fragment();
        float2 q = in.world;
        // 轻量化 2 阶宣纸纤维扰动 + 细纸毛孔，生宣毛口温润自然且 GPU 片元耗时再降 35%
        float nMain = fbm2(q * k.freq);
        float nFine = vnoise(q * k.freq * 2.35 + float2(3.7, 5.1));
        float rough = (nMain - 0.5) * 2.0 * k.noise + (nFine - 0.5) * (k.noise * 0.34);
        float s = (k.now - in.arrive) / k.edge + rough;
        float reached = smoothstep(-1.02, 1.02, s);
        float a = 0.0;
        if (in.mode > 0.5) {
            // 未到达处完整承接旧色；到达处旧色余韵沿纸纹顺滑淡去，过渡干净不拖泥带水。
            float fade = (1.0 - k.tint) * clamp(1.0 - (k.now - in.arrive) / k.after, 0.0, 1.0);
            a = mix(1.0, fade, reached);
        }
        // 原版经典湿墨脊 + 细微先导暖金纸光（攻占为克制浓湿墨锋，改朝换代墨圈略添古金华彩）
        float rim = exp(-s * s * 0.74) * (in.mode > 0.5 ? 0.14 + 0.11 * k.detail : 0.21 + 0.13 * k.detail);
        float crest = exp(-(s + 0.42) * (s + 0.42) * 2.4) * (in.mode > 0.5 ? 0.035 : 0.11);
        float total = min(1.0, a + (rim + crest) * (1.0 - a));
        if (total < 0.003) discard_fragment();
        float3 rimCol = in.mode > 0.5 ? float3(0.20, 0.14, 0.10) : float3(0.58, 0.38, 0.14);
        float3 crestCol = float3(0.86, 0.72, 0.38);
        float3 rgb = (in.old * a * (1.0 - rim) + rimCol * rim + crestCol * crest * (1.0 - a)) / max(total, 1e-4);
        return float4(clamp(rgb, 0.0, 1.0), total);
    }
    """
}
