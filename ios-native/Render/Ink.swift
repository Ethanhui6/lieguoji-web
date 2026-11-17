import Foundation
import Metal
import QuartzCore
import simd
import LieguojiCore

/// GPU 墨场（战争晕染的军队墨迹）：一张世界坐标的纹理，存预乘的国色与浓度。每帧（推演在走、军队在动时）：
/// 先按推演天数整体褪色，再画行军笔触（从上一帧落墨处到图标此刻画出的位置）、驻留洇开、守军擦墨、围城铺开。
/// 合成时沿陆地三角形采样，墨落在本国领土上不显示（底色已是同一种颜色），浓度过阈值处见色，边缘有纸纹起伏与一道湿边。
/// 强度公式见 LieguojiCore 的 InkPlan（测试用同样的公式在 CPU 上验证连续、与帧率无关）。
struct InkPipelines {
    let over: MTLRenderPipelineState
    let erase: MTLRenderPipelineState
    let siege: MTLRenderPipelineState
    let decay: MTLRenderPipelineState
    let composite: MTLRenderPipelineState
    static let format = MTLPixelFormat.rgba16Float

    static func make(device: MTLDevice, library: MTLLibrary, mainFormat: MTLPixelFormat, sampleCount: Int) throws -> InkPipelines {
        enum Kind { case over, erase, max, multiply }
        func pipe(_ vertex: String, _ fragment: String, _ kind: Kind) throws -> MTLRenderPipelineState {
            let d = MTLRenderPipelineDescriptor()
            d.vertexFunction = library.makeFunction(name: vertex)
            d.fragmentFunction = library.makeFunction(name: fragment)
            let a = d.colorAttachments[0]!
            a.pixelFormat = format
            a.isBlendingEnabled = true
            switch kind {
            case .over:
                a.sourceRGBBlendFactor = .one; a.destinationRGBBlendFactor = .oneMinusSourceAlpha
                a.sourceAlphaBlendFactor = .one; a.destinationAlphaBlendFactor = .oneMinusSourceAlpha
            case .erase:
                a.sourceRGBBlendFactor = .zero; a.destinationRGBBlendFactor = .oneMinusSourceAlpha
                a.sourceAlphaBlendFactor = .zero; a.destinationAlphaBlendFactor = .oneMinusSourceAlpha
            case .max:
                a.rgbBlendOperation = .max; a.alphaBlendOperation = .max
                a.sourceRGBBlendFactor = .one; a.destinationRGBBlendFactor = .one
                a.sourceAlphaBlendFactor = .one; a.destinationAlphaBlendFactor = .one
            case .multiply:
                a.sourceRGBBlendFactor = .zero; a.destinationRGBBlendFactor = .sourceColor
                a.sourceAlphaBlendFactor = .zero; a.destinationAlphaBlendFactor = .sourceAlpha
            }
            return try device.makeRenderPipelineState(descriptor: d)
        }
        let c = MTLRenderPipelineDescriptor()
        c.vertexFunction = library.makeFunction(name: "inkCompositeVertex")
        c.fragmentFunction = library.makeFunction(name: "inkCompositeFragment")
        c.colorAttachments[0].pixelFormat = mainFormat
        c.rasterSampleCount = sampleCount
        c.colorAttachments[0].isBlendingEnabled = true
        c.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha; c.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        c.colorAttachments[0].sourceAlphaBlendFactor = .one; c.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
        return InkPipelines(over: try pipe("inkStampVertex", "inkStampFragment", .over),
                            erase: try pipe("inkStampVertex", "inkEraseFragment", .erase),
                            siege: try pipe("inkWorldVertex", "inkSiegeFragment", .max),
                            decay: try pipe("inkFullVertex", "inkDecayFragment", .multiply),
                            composite: try device.makeRenderPipelineState(descriptor: c))
    }

    /// 着色器（拼在 MapRenderer.shaders 之后，用其中的 Uniforms、clip、fbm）。
    static let shaders = """
    // —— GPU 墨场 ——
    struct InkStamp { float2 a; float2 b; float radius; float alpha; float2 pad; float4 colour; };
    struct InkWorld { float2 size; float2 pad; };
    struct InkStampOut { float4 position [[position]]; float2 world; float2 a; float2 b; float radius; float alpha; float4 colour; };
    static float4 inkClip(float2 w, float2 size) { float2 t = w / size; return float4(t.x * 2.0 - 1.0, 1.0 - t.y * 2.0, 0.0, 1.0); }
    vertex InkStampOut inkStampVertex(uint vid [[vertex_id]], uint iid [[instance_id]], const device InkStamp* stamps [[buffer(0)]], constant InkWorld& w [[buffer(1)]]) {
        InkStamp s = stamps[iid];
        float2 d = s.b - s.a; float len = length(d);
        float2 u = len > 1e-4 ? d / len : float2(1.0, 0.0), n = float2(-u.y, u.x);
        float e = s.radius * 1.7;
        float2 corners[6] = { s.a - u * e - n * e, s.b + u * e - n * e, s.b + u * e + n * e, s.a - u * e - n * e, s.b + u * e + n * e, s.a - u * e + n * e };
        InkStampOut o; o.world = corners[vid]; o.position = inkClip(o.world, w.size);
        o.a = s.a; o.b = s.b; o.radius = s.radius; o.alpha = s.alpha; o.colour = s.colour;
        return o;
    }
    // 与 InkPlan.stroke 同一算法：行军笔触两端齐平（相邻两帧首尾相接、不重叠），原地的笔触是圆点。
    static float inkStrength(InkStampOut in) {
        float2 ab = in.b - in.a; float l2 = dot(ab, ab);
        float t = 0.0;
        if (l2 > 1e-8) {
            t = dot(in.world - in.a, ab) / l2;
            if (t < 0.0 || t >= 1.0) return 0.0;
        }
        float q = length(in.world - (in.a + ab * t)) / max(in.radius, 1e-4);
        return in.alpha * exp(-2.5 * q * q);
    }
    fragment float4 inkStampFragment(InkStampOut in [[stage_in]]) {
        float a = inkStrength(in);
        if (a < 0.0005) discard_fragment();
        return float4(in.colour.rgb * a, a);
    }
    fragment float4 inkEraseFragment(InkStampOut in [[stage_in]]) {
        float a = inkStrength(in);
        if (a < 0.0005) discard_fragment();
        return float4(0.0, 0.0, 0.0, a);
    }
    struct InkSiege { float2 center; float radius; float scale; float4 colour; };
    struct InkWorldOut { float4 position [[position]]; float2 world; };
    vertex InkWorldOut inkWorldVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], constant InkWorld& w [[buffer(1)]]) {
        InkWorldOut o; o.world = positions[id]; o.position = inkClip(o.world, w.size); return o;
    }
    fragment float4 inkSiegeFragment(InkWorldOut in [[stage_in]], constant InkSiege& s [[buffer(0)]]) {
        float c = clamp(0.5 + (s.radius - length(in.world - s.center)) / (s.scale * 0.45), 0.0, 0.9);
        return float4(s.colour.rgb * c, c);
    }
    vertex float4 inkFullVertex(uint id [[vertex_id]]) {
        float2 p = float2(id == 1 ? 3.0 : -1.0, id == 2 ? 3.0 : -1.0);
        return float4(p, 0.0, 1.0);
    }
    fragment float4 inkDecayFragment(constant float& k [[buffer(0)]]) { return float4(k); }
    // 合成：沿陆地三角形采样墨场。本国领土上的墨不显示；浓度过阈值处见色，纸纹起伏、近看有浓淡，前沿一道湿边。
    struct InkCompositeOut { float4 position [[position]]; float2 world; float4 owner [[flat]]; };
    vertex InkCompositeOut inkCompositeVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], const device float4* owners [[buffer(1)]], constant Uniforms& u [[buffer(2)]]) {
        InkCompositeOut o; o.world = positions[id]; o.position = clip(o.world, u, float2(0.0)); o.owner = owners[id]; return o;
    }
    struct InkLook { float2 size; float tint; float visible; float soft; float noise; float freq; float detail; };
    fragment float4 inkCompositeFragment(InkCompositeOut in [[stage_in]], texture2d<float> ink [[texture(0)]], sampler s [[sampler(0)]], constant InkLook& k [[buffer(0)]]) {
        float4 v = ink.sample(s, in.world / k.size);
        if (v.a < 0.02) discard_fragment();
        float3 c = v.rgb / v.a;
        float own = smoothstep(0.05, 0.13, length(c - in.owner.rgb));
        if (own < 0.01) discard_fragment();
        float2 q = in.world;
        float level = v.a + (fbm(q * k.freq) - 0.5) * 2.0 * k.noise;
        float sx = level - k.visible;
        float reached = smoothstep(-k.soft, k.soft, sx);
        float grain = fbm(q * k.freq * 2.7 + float2(7.3, 2.9));
        float body = k.tint * reached * (0.82 + 0.2 * smoothstep(0.55, 0.95, v.a) + 0.22 * (grain - 0.5) * k.detail);
        float rim = exp(-(sx * sx) / max(k.soft * k.soft * 0.6, 1e-6)) * (0.1 + 0.1 * k.detail);
        float total = (body + rim * (1.0 - body)) * own;
        float3 rgb = mix(c, float3(0.16, 0.12, 0.09), rim * (1.0 - body) / max(body + rim * (1.0 - body), 1e-4));
        return float4(rgb, total);
    }
    """
}

/// 墨场纹理与每帧落墨的状态。
final class InkField {
    struct Stamp { var a: SIMD2<Float>; var b: SIMD2<Float>; var radius: Float; var alpha: Float; var pad = SIMD2<Float>(0, 0); var colour: SIMD4<Float> }
    struct World { var size: SIMD2<Float>; var pad = SIMD2<Float>(0, 0) }
    struct Siege { var center: SIMD2<Float>; var radius: Float; var scale: Float; var colour: SIMD4<Float> }
    struct Look { var size: SIMD2<Float>; var tint: Float; var visible: Float; var soft: Float; var noise: Float; var freq: Float; var detail: Float }

    let texture: MTLTexture
    let world: SIMD2<Float>
    let sampler: MTLSamplerState?
    /// 下一次落墨先清空（读档、换世界）。
    var clearPending = true
    /// 纹理里已经有墨（合成才画）。
    var used = false
    var clock = InkPlan.Clock()
    var lastTick: CFTimeInterval = 0
    /// 每支军队上一次落墨的位置。
    var lastStamp: [String: SIMD2<Float>] = [:]
    var lastDay: Int?
    /// 围城：州 → 中心、到最远点的距离、进度（上一步显示值 → 这一步）、进攻方。
    struct Besieged { var center: SIMD2<Float>; var far: Float; var from: Float; var to: Float; var nation: Int }
    var sieges: [Int: Besieged] = [:]
    var siegeStart: CFTimeInterval = 0
    var siegeLength: CFTimeInterval = 0.3
    /// 各州的三角形索引（围城只画在州内）。
    var provinceIndex: [Int: (buffer: MTLBuffer, count: Int)] = [:]
    var stampBuffer: MTLBuffer?
    /// 每个顶点的主人国色（rgb）与陆地标记：合成时本国领土上的墨不显示。
    var owners: MTLBuffer?

    init?(device: MTLDevice, map: WorldMap) {
        let w = max(1, Double(map.width)), h = max(1, Double(map.height))
        let k = min(1.0, 1024 / max(w, h))
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: InkPipelines.format, width: max(1, Int(w * k)), height: max(1, Int(h * k)), mipmapped: false)
        d.usage = [.renderTarget, .shaderRead]
        d.storageMode = .private
        guard let t = device.makeTexture(descriptor: d) else { return nil }
        texture = t; world = SIMD2(Float(w), Float(h))
        let s = MTLSamplerDescriptor()
        s.minFilter = .linear; s.magFilter = .linear; s.sAddressMode = .clampToEdge; s.tAddressMode = .clampToEdge
        sampler = device.makeSamplerState(descriptor: s)
    }

    /// 是否还需要每帧落墨（推演天数没用完、围城进度在过渡）。
    func busy(_ now: CFTimeInterval) -> Bool { clock.left > 0 || (!sieges.isEmpty && now - siegeStart < siegeLength) || clearPending }
}

extension MapRenderer {
    /// 各国国色（政治色，墨的颜色；与合成时判断“本国领土”用的是同一套）。
    func inkColour(_ nation: Int) -> SIMD4<Float> {
        let c = nationColors.indices.contains(nation) ? nationColors[nation] : RGB(0.6, 0.6, 0.6)
        return SIMD4(c.r, c.g, c.b, 1)
    }

    /// 每个顶点的主人国色：与陆地颜色同一时刻安装（易主扫色开始时墨的显隐跟着换）。
    func rebuildInkOwners() {
        guard let ink else { return }
        var data = [Float](repeating: 0, count: map.vertices.count / 2 * 4)
        let provinces = map.meta.provinces
        for c in 0..<map.cellCount where map.isLand(c) {
            let p = Int(map.province[c])
            let n = provinces.indices.contains(p) ? provinces[p].nation : -1
            let col = n >= 0 ? inkColour(n) : SIMD4<Float>(-1, -1, -1, 0)
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) { data[v * 4] = col.x; data[v * 4 + 1] = col.y; data[v * 4 + 2] = col.z; data[v * 4 + 3] = 1 }
        }
        ink.owners = device.makeBuffer(bytes: data, length: max(16, data.count * 4), options: .storageModeShared)
    }

    /// 新的一步：推演天数交给墨场时钟（在这一步的动画时长里用掉），围城目标更新。
    func inkFrame(_ frame: WashFrame, topology: WashTopology?) {
        guard let ink else { return }
        let now = CACurrentMediaTime()
        if let last = ink.lastDay, frame.day > last { ink.clock.add(days: Float(frame.day - last), over: Float(max(0.15, tweenDuration))) }
        ink.lastDay = frame.day
        // 围城：进度从当前显示值过渡到新值；中心取进攻军位置（军队暂离时沿用上次）。
        var next = [Int: InkField.Besieged]()
        let t0 = ink.siegeLength > 0 ? Float(min(1, max(0, (now - ink.siegeStart) / ink.siegeLength))) : 1
        for i in frame.inputs where i.kind == .siege {
            guard let topology, topology.provinceCells.indices.contains(i.province), !topology.provinceCells[i.province].isEmpty else { continue }
            let old = ink.sieges[i.province]
            var center = old?.center ?? topology.centroid(i.province)
            if !i.armies.isEmpty {
                let mean = i.armies.reduce(SIMD2<Float>(0, 0), +) / Float(i.armies.count)
                if old == nil || simd_distance(old!.center, mean) > topology.scale * 0.3 { center = mean }
            }
            var far: Float = 0
            for c in topology.provinceCells[i.province] { for v in topology.vertexRange(Int(c)) { far = max(far, simd_distance(topology.position(v), center)) } }
            let shown = old.map { $0.from + ($0.to - $0.from) * t0 } ?? 0
            next[i.province] = .init(center: center, far: far, from: old?.nation == i.attacker ? shown : 0, to: i.progress, nation: i.attacker)
        }
        ink.sieges = next
        ink.siegeStart = now; ink.siegeLength = max(0.15, tweenDuration)
    }

    private func provinceTriangles(_ p: Int, _ topology: WashTopology) -> (buffer: MTLBuffer, count: Int)? {
        guard let ink else { return nil }
        if let c = ink.provinceIndex[p] { return c }
        var list = [UInt32]()
        for c in topology.provinceCells[p] {
            let r = topology.vertexRange(Int(c))
            guard r.count >= 3 else { continue }
            for j in (r.lowerBound + 1)..<(r.upperBound - 1) { list += [UInt32(r.lowerBound), UInt32(j), UInt32(j + 1)] }
        }
        guard !list.isEmpty, let b = device.makeBuffer(bytes: list, length: list.count * 4, options: .storageModeShared) else { return nil }
        ink.provinceIndex[p] = (b, list.count)
        return (b, list.count)
    }

    /// 每帧（主画面之前）：按本帧经过的推演天数与军队此刻画出的位置更新墨场纹理。
    func encodeInk(_ buffer: MTLCommandBuffer) {
        guard let ink, reveal >= 1, display.battleGround ?? true else { return }
        let now = frameTime
        let dt = Float(ink.lastTick > 0 ? min(0.1, max(0, now - ink.lastTick)) : 0)
        ink.lastTick = now
        let days = ink.clock.take(dt)
        let topology = washTopology
        let scale = topology?.scale ?? 30
        var stamps = [InkField.Stamp](), erase = [InkField.Stamp]()
        // 军队此刻画出的位置（图标插值走到哪里，墨就落到哪里）。
        var placed = [String: SIMD2<Float>]()
        for s in armySprites where !s.key.isEmpty { placed[s.key] = displayedPoint(s) }
        var seen = Set<String>()
        for i in washFrame.inputs where i.kind == .march && i.armies.count == 2 {
            let key = i.key.isEmpty ? "\(i.attacker)-\(i.armies[1])" : i.key
            seen.insert(key)
            let p = placed[key] ?? i.armies[1]
            let colour = inkColour(i.attacker)
            let last = ink.lastStamp[key].flatMap { simd_distance($0, p) < scale * 6 ? $0 : nil } ?? p
            let r = InkPlan.trailRadius(scale: scale, troops: i.troops)
            let a = InkPlan.trailAlpha(len: simd_distance(last, p), radius: r)
            if a > 0.0005 { stamps.append(.init(a: last, b: p, radius: r, alpha: a, colour: colour)) }
            let dwell = InkPlan.dwellAlpha(days: days)
            if dwell > 0.0005 { stamps.append(.init(a: p, b: p, radius: InkPlan.dwellRadius(scale: scale, troops: i.troops), alpha: dwell, colour: colour)) }
            ink.lastStamp[key] = p
        }
        // 离开敌境（或覆灭）的军队：下次进入时从新位置起笔。
        if ink.lastStamp.count != seen.count { ink.lastStamp = ink.lastStamp.filter { seen.contains($0.key) } }
        if days > 0 {
            for i in washFrame.inputs where i.kind == .hold && !i.armies.isEmpty {
                let p = placed[i.key] ?? i.armies[0]
                erase.append(.init(a: p, b: p, radius: InkPlan.holdRadius(scale: scale), alpha: InkPlan.holdAlpha(days: days), colour: .zero))
            }
        }
        let siegeT = ink.siegeLength > 0 ? Float(min(1, max(0, (now - ink.siegeStart) / ink.siegeLength))) : 1
        let siegeMoving = !ink.sieges.isEmpty && siegeT < 1
        let decay = InkPlan.decay(days: days)
        guard ink.clearPending || !stamps.isEmpty || !erase.isEmpty || decay < 0.99999 || siegeMoving || (days > 0 && !ink.sieges.isEmpty) else { return }
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = ink.texture
        pass.colorAttachments[0].loadAction = ink.clearPending ? .clear : .load
        pass.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        pass.colorAttachments[0].storeAction = .store
        guard let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        ink.clearPending = false
        var w = InkField.World(size: ink.world)
        if decay < 0.99999 {
            var k = decay
            encoder.setRenderPipelineState(inkPipes.decay)
            encoder.setFragmentBytes(&k, length: 4, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        }
        func draw(_ list: [InkField.Stamp], _ pipeline: MTLRenderPipelineState, offset: Int) {
            guard !list.isEmpty, let b = ink.stampBuffer else { return }
            encoder.setRenderPipelineState(pipeline)
            encoder.setVertexBuffer(b, offset: offset * MemoryLayout<InkField.Stamp>.stride, index: 0)
            encoder.setVertexBytes(&w, length: MemoryLayout<InkField.World>.stride, index: 1)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6, instanceCount: list.count)
        }
        let all = stamps + erase
        if !all.isEmpty {
            let length = all.count * MemoryLayout<InkField.Stamp>.stride
            if ink.stampBuffer == nil || ink.stampBuffer!.length < length { ink.stampBuffer = device.makeBuffer(length: max(length, 64 * MemoryLayout<InkField.Stamp>.stride), options: .storageModeShared) }
            if let b = ink.stampBuffer { all.withUnsafeBytes { memcpy(b.contents(), $0.baseAddress!, length) } }
            draw(stamps, inkPipes.over, offset: 0)
            draw(erase, inkPipes.erase, offset: stamps.count)
        }
        if let topology, !ink.sieges.isEmpty {
            encoder.setRenderPipelineState(inkPipes.siege)
            encoder.setVertexBuffer(positions, offset: 0, index: 0)
            encoder.setVertexBytes(&w, length: MemoryLayout<InkField.World>.stride, index: 1)
            for (p, s) in ink.sieges.sorted(by: { $0.key < $1.key }) {
                guard let tri = provinceTriangles(p, topology) else { continue }
                let q = s.from + (s.to - s.from) * siegeT
                var u = InkField.Siege(center: s.center, radius: InkPlan.siegeRadius(progress: q, far: s.far, scale: scale), scale: scale, colour: inkColour(s.nation))
                encoder.setFragmentBytes(&u, length: MemoryLayout<InkField.Siege>.stride, index: 0)
                encoder.drawIndexedPrimitives(type: .triangle, indexCount: tri.count, indexType: .uint32, indexBuffer: tri.buffer, indexBufferOffset: 0)
            }
        }
        encoder.endEncoding()
        ink.used = true
    }

    /// 主画面里（陆地之上、州界之下）合成墨场。
    func drawInk(_ encoder: MTLRenderCommandEncoder, _ u: inout Uniforms) {
        guard let ink, ink.used, let owners = ink.owners, indexCount > 0 else { return }
        let detail = Float(min(1, max(0, (camera.scale - 0.7) / 0.6)))
        let scale = washTopology?.scale ?? 30
        var look = InkField.Look(size: ink.world, tint: 0.5, visible: InkPlan.visible, soft: 0.09, noise: 0.16, freq: 1 / (scale * 0.9), detail: detail)
        encoder.setRenderPipelineState(inkPipes.composite)
        encoder.setVertexBuffer(positions, offset: 0, index: 0)
        encoder.setVertexBuffer(owners, offset: 0, index: 1)
        encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
        encoder.setFragmentTexture(ink.texture, index: 0)
        encoder.setFragmentSamplerState(ink.sampler, index: 0)
        encoder.setFragmentBytes(&look, length: MemoryLayout<InkField.Look>.stride, index: 0)
        encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0)
    }
}
