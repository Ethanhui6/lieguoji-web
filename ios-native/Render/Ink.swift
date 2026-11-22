import Foundation
import Metal
import QuartzCore
import simd
import LieguojiCore

/// 战争墨迹的渲染：墨落在哪些格子由 LieguojiCore 的 InkCells 决定（沿格子与地势洇开，攻占即收、议和淡去），
/// 这里只把它的逐顶点数据（落墨国、显出时刻、淡去时刻、覆盖比例）交给显卡：每帧沿陆地三角形合成，
/// 按时间显出与淡去，覆盖比例过阈值处见色，阈值受纸纹扰动，边缘参差。
/// 墨只显示在与落墨方交战的敌国领土上；颜色按与陆地完全相同的算法从落墨方国色算出（高度灰、国色浓度、山影）。
/// 1.22 的两张世界纹理与每帧落墨、演进的离屏渲染都不再需要：推演每步才更新一次数据，静止时显卡只画一遍合成。
struct InkPipelines {
    let composite: MTLRenderPipelineState

    static func make(device: MTLDevice, library: MTLLibrary, mainFormat: MTLPixelFormat, sampleCount: Int) throws -> InkPipelines {
        let c = MTLRenderPipelineDescriptor()
        c.vertexFunction = library.makeFunction(name: "inkCompositeVertex")
        c.fragmentFunction = library.makeFunction(name: "inkCompositeFragment")
        c.colorAttachments[0].pixelFormat = mainFormat
        c.rasterSampleCount = sampleCount
        c.colorAttachments[0].isBlendingEnabled = true
        c.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha; c.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        c.colorAttachments[0].sourceAlphaBlendFactor = .one; c.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
        return InkPipelines(composite: try device.makeRenderPipelineState(descriptor: c))
    }

    /// 着色器（拼在 MapRenderer.shaders 之后，用其中的 Uniforms、clip、fbm）。
    static let shaders = """
    // —— 战争墨迹 ——
    struct InkCompositeOut {
        float4 position [[position]]; float2 world;
        int nation [[flat]]; int owner [[flat]]; float gray [[flat]];
        float shade; float3 terrain; float arrive; float leave; float weight;
    };
    vertex InkCompositeOut inkCompositeVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], const device float4* owners [[buffer(1)]],
                                              constant Uniforms& u [[buffer(2)]], const device float4* terrain [[buffer(3)]], const device float4* ink [[buffer(4)]]) {
        InkCompositeOut o; o.world = positions[id]; o.position = clip(o.world, u, float2(0.0));
        float4 w = owners[id]; o.owner = w.w > 0.5 ? int(w.x + 0.5) : -1; o.gray = w.y; o.shade = w.z; o.terrain = terrain[id].rgb;
        float4 k = ink[id]; o.nation = k.x > -0.5 ? int(k.x + 0.5) : -1; o.arrive = k.y; o.leave = k.z; o.weight = k.w;
        return o;
    }
    struct InkLook { float now; float reveal; float fade; float visible; float soft; float noise; float freq; float stateAlpha; float density; float nations; float2 pad; };
    static float inkToLinear(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
    static float inkToSrgb(float c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(max(c, 0.0), 1.0 / 2.4) - 0.055; }
    fragment float4 inkCompositeFragment(InkCompositeOut in [[stage_in]], constant InkLook& k [[buffer(0)]], const device float* enemies [[buffer(1)]], const device float4* colours [[buffer(2)]]) {
        if (in.nation < 0 || in.owner < 0 || float(in.nation) >= k.nations || float(in.owner) >= k.nations) discard_fragment();
        // 只在与落墨方交战的敌国领土上：本国、友邦、第三国、议和后的旧敌上都不显示。
        bool war = false;
        for (int i = 0; i < 8; i++) {
            float e = enemies[in.owner * 8 + i];
            if (e < -0.5) break;
            if (int(e + 0.5) == in.nation) { war = true; break; }
        }
        if (!war) discard_fragment();
        float show = clamp((k.now - in.arrive) / k.reveal, 0.0, 1.0);
        float fade = 1.0 - clamp((k.now - in.leave) / k.fade, 0.0, 1.0);
        float amount = in.weight * show * fade;
        if (amount < 0.01) discard_fragment();
        // 柔润水墨宣纸晕染前沿：以低频纸纤维连续波动替代高频碎裂噪声，配合宽柔过渡带（soft），消除碎块斑点感。
        float2 q = in.world;
        float n1 = fbm(q * k.freq), n2 = vnoise(q * k.freq * 2.1 + float2(5.1, 1.7));
        float level = amount + (n1 - 0.5) * 2.0 * k.noise + (n2 - 0.5) * (k.noise * 0.35);
        float reached = smoothstep(k.visible - k.soft, k.visible + k.soft, level);
        if (reached < 0.004) discard_fragment();
        float3 e = colours[in.nation].rgb;
        float3 lin = float3(inkToLinear(e.r), inkToLinear(e.g), inkToLinear(e.b));
        lin = in.gray + (lin - in.gray) * k.stateAlpha;
        float3 col = float3(inkToSrgb(lin.r), inkToSrgb(lin.g), inkToSrgb(lin.b));
        col = in.terrain + (col - in.terrain) * k.density;
        col = min(float3(1.0), col * in.shade);
        // 细微宣纸湿墨边缘：前沿处略微聚墨收深，保留原色清透质感，不抢国色。
        float capillary = reached * (1.0 - reached) * 4.0 * (1.0 - show * 0.42);
        col *= (1.0 - 0.11 * capillary);
        // 刚显出时略淡，像墨刚落下还在洇。
        return float4(col, reached * (0.85 + 0.15 * show));
    }
    """
}

/// 墨迹的渲染状态：格子模型（拓扑建好后才有）、两块轮换的顶点数据缓冲、主人与地形、交战表与国色。
final class InkField {
    struct Look { var now: Float; var reveal: Float; var fade: Float; var visible: Float; var soft: Float; var noise: Float; var freq: Float; var stateAlpha: Float; var density: Float; var nations: Float; var pad = SIMD2<Float>(0, 0) }

    /// 格子模型只在 queue 上改（每步的落墨、清墨在后台算，主线程只拷算好的顶点数据）。
    var cells: InkCells?
    let queue = DispatchQueue(label: "lieguoji.ink", qos: .userInitiated)
    /// 主线程上的显出、淡去截止时刻（后台算完后带回）。
    var busyUntil: Float = 0
    /// 顶点数据：每次更新写进另一块，正在被显卡读的那块不动。
    private var buffers: [MTLBuffer?] = [nil, nil]
    private var current = 0
    private var uploaded = -1
    var data: MTLBuffer? { buffers[current] }
    /// 每个顶点：主人国号、高度灰（线性）、山影、陆地标记；地形色（未加山影）。
    var owners: MTLBuffer?
    var terrain: MTLBuffer?
    /// 预缓存的不变地形高度灰与山影，以及双缓冲 owners 顶点池（避免每次易主在主线程重新分配 4MB Metal 缓冲与重算地形色）。
    var staticGrayShade: [Float] = []
    var staticVertexProvince: [Int32] = []
    var ownerBuffers: [MTLBuffer?] = [nil, nil]
    var ownerCurrent = 0
    var lastProvinceOwners: [Int] = []
    var scrubbingReplay = false
    /// 每个国家 8 格：与它交战的国家号（−1 结尾）；每个国家的国色。
    var enemies: MTLBuffer?
    var colours: MTLBuffer?
    var enemyKey: [Int: [Int]]?
    var nationCount = 0
    let world: SIMD2<Float>

    init(map: WorldMap) { world = SIMD2(Float(max(1, map.width)), Float(max(1, map.height))) }

    /// 有新数据就拷进另一块缓冲（推演每步一次，约两百万字节的内存拷贝）。
    func upload(_ device: MTLDevice, _ data: [Float], revision: Int) {
        guard revision != uploaded else { return }
        uploaded = revision
        let next = 1 - current, length = max(16, data.count * 4)
        if buffers[next] == nil || buffers[next]!.length < length { buffers[next] = device.makeBuffer(length: length, options: .storageModeShared) }
        guard let b = buffers[next] else { return }
        data.withUnsafeBytes { memcpy(b.contents(), $0.baseAddress!, $0.count) }
        current = next
    }

    /// 在后台改格子模型，算完回主线程上传并要求重绘。
    func update(_ renderer: MapRenderer, _ change: @escaping (InkCells) -> Void) {
        guard let cells else { return }
        queue.async { [weak self, weak renderer] in
            change(cells)
            let data = cells.vertexData, revision = cells.revision, busy = cells.busyUntil
            DispatchQueue.main.async {
                guard let self, let renderer, self.cells === cells else { return }
                self.busyUntil = busy
                self.upload(renderer.device, data, revision: revision)
                renderer.onOutlines?()
            }
        }
    }

    /// 是否还在显出或淡去（要连续重绘）。
    func busy(_ now: Float) -> Bool { busyUntil > now }
}

extension MapRenderer {
    /// 每个顶点的主人国号、高度灰、山影与地形色：静态地形只建一次，易主时仅双缓冲原位更新归属，彻底消除主线程重复分配与掉帧。
    func rebuildInkOwners(forceTerrain: Bool = false) {
        guard let ink else { return }
        let count = map.vertices.count / 2
        guard count > 0 else { return }
        let provinces = map.meta.provinces
        let currentOwners = provinces.map(\.nation)

        // 1. 静态地形缓冲（ink.terrain）与顶点高度灰/山影表仅在首次或自绘地形变更时构建一次
        if forceTerrain || ink.terrain == nil || ink.staticGrayShade.count != count * 2 || ink.staticVertexProvince.count != count {
            var gs = [Float](repeating: 1, count: count * 2)
            var vp = [Int32](repeating: -1, count: count)
            var ground = [Float](repeating: 0, count: count * 4)
            let terrain = terrainBase, shades = shade
            for c in 0..<map.cellCount where map.isLand(c) {
                let p = map.province[c]
                let gray = MapPalette.heightGray(map.elevation[c])
                for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                    vp[v] = p
                    gs[v * 2] = gray
                    gs[v * 2 + 1] = shades.count == count ? shades[v] : 1
                    if let terrain, terrain.count == count * 4 {
                        for j in 0..<3 { ground[v * 4 + j] = terrain[v * 4 + j] }
                    } else {
                        let srgb = MapPalette.linearToSrgb(gray)
                        for j in 0..<3 { ground[v * 4 + j] = srgb }
                    }
                }
            }
            ink.staticGrayShade = gs
            ink.staticVertexProvince = vp
            ink.terrain = device.makeBuffer(bytes: ground, length: max(16, ground.count * 4), options: .storageModeShared)
            ink.lastProvinceOwners = []
        }

        // 2. 若各州归属完全未变（如仅点选高亮或开闭面板触发 recolor），直接零开销跳过！
        if !forceTerrain && ink.owners != nil && ink.lastProvinceOwners == currentOwners {
            rebuildInkEnemies()
            return
        }
        ink.lastProvinceOwners = currentOwners

        // 3. 双缓冲原位写入顶点主人号（零新 MTLBuffer 分配）
        let nextSlot = 1 - ink.ownerCurrent
        let byteLen = max(16, count * 16)
        if ink.ownerBuffers[nextSlot] == nil || ink.ownerBuffers[nextSlot]!.length < byteLen {
            ink.ownerBuffers[nextSlot] = device.makeBuffer(length: byteLen, options: .storageModeShared)
        }
        if let buf = ink.ownerBuffers[nextSlot] {
            let ptr = buf.contents().bindMemory(to: Float.self, capacity: count * 4)
            let gs = ink.staticGrayShade
            let vp = ink.staticVertexProvince
            let pCount = currentOwners.count
            for v in 0..<count {
                let p = Int(vp[v])
                let n = (p >= 0 && p < pCount) ? currentOwners[p] : -1
                let o = v * 4
                ptr[o] = Float(max(0, n))
                ptr[o + 1] = gs[v * 2]
                ptr[o + 2] = gs[v * 2 + 1]
                ptr[o + 3] = n >= 0 ? 1 : 0
            }
            ink.ownerCurrent = nextSlot
            ink.owners = buf
        }
        if !ink.scrubbingReplay {
            let now = clock()
            ink.update(self) { $0.owners(currentOwners, now: now) }
        }
        ink.enemyKey = nil
        rebuildInkEnemies()
    }

    /// 交战表与国色：敌对关系或国色变了时重建。
    func rebuildInkEnemies() {
        guard let ink else { return }
        let n = nationColors.count
        var table = [Int: Set<Int>]()
        for (a, list) in washFrame.enemies { for b in list where a != b { table[a, default: []].insert(b); table[b, default: []].insert(a) } }
        let key = table.mapValues { $0.sorted() }
        if ink.enemyKey == key && ink.nationCount == n && ink.enemies != nil { return }
        var data = [Float](repeating: -1, count: max(1, n) * 8)
        for (owner, list) in key where owner >= 0 && owner < n {
            for (i, e) in list.prefix(8).enumerated() { data[owner * 8 + i] = Float(e) }
        }
        var colours = [Float](repeating: 0.6, count: max(1, n) * 4)
        for i in 0..<n { let c = nationColors[i]; colours[i * 4] = c.r; colours[i * 4 + 1] = c.g; colours[i * 4 + 2] = c.b; colours[i * 4 + 3] = 1 }
        ink.enemies = device.makeBuffer(bytes: data, length: data.count * 4, options: .storageModeShared)
        ink.colours = device.makeBuffer(bytes: colours, length: colours.count * 4, options: .storageModeShared)
        ink.enemyKey = key; ink.nationCount = n
    }

    /// 新的一步：按这一步的输入落墨、清墨（拓扑建好之前的步跳过）。
    /// 传给 InkCells 的各州主人必须与已安装到底色缓冲的归属一致（`ink.lastProvinceOwners`），
    /// 防止后台 `baseColors` 尚未算完时提前擦除占领墨迹、造成被攻占州闪回旧主底色 1–3 帧。
    func inkFrame(_ frame: WashFrame, topology: WashTopology?) {
        guard let ink else { return }
        if ink.cells == nil || ink.cells!.topology !== topology, let topology { ink.cells = InkCells(topology: topology, elevation: map.elevation) }
        let installed = ink.lastProvinceOwners.count == map.meta.provinces.count ? ink.lastProvinceOwners : map.meta.provinces.map(\.nation)
        let now = clock(), tween = Float(max(0.15, tweenDuration))
        ink.update(self) { $0.apply(frame, owners: installed, now: now, tween: tween) }
    }

    /// 主画面里（陆地之上、州界之下）合成墨迹。
    func drawInk(_ encoder: MTLRenderCommandEncoder, _ u: inout Uniforms) {
        guard let ink, let data = ink.data, let owners = ink.owners, let terrain = ink.terrain, indexCount > 0, reveal >= 1, display.battleGround ?? true else { return }
        rebuildInkEnemies()
        guard let enemies = ink.enemies, let colours = ink.colours, ink.enemyKey?.isEmpty == false else { return }
        let scale = washTopology?.scale ?? 30
        let density = mode == .political ? Float(max(0, min(1, display.colorDensity))) : 1
        var look = InkField.Look(now: clock(frameTime), reveal: InkCells.revealSeconds, fade: InkCells.fadeSeconds, visible: 0.42, soft: 0.21, noise: 0.068,
                                 freq: 1 / (scale * 1.15), stateAlpha: MapPalette.stateAlpha, density: density, nations: Float(ink.nationCount))
        encoder.setRenderPipelineState(inkPipes.composite)
        encoder.setVertexBuffer(positions, offset: 0, index: 0)
        encoder.setVertexBuffer(owners, offset: 0, index: 1)
        encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
        encoder.setVertexBuffer(terrain, offset: 0, index: 3)
        encoder.setVertexBuffer(data, offset: 0, index: 4)
        encoder.setFragmentBytes(&look, length: MemoryLayout<InkField.Look>.stride, index: 0)
        encoder.setFragmentBuffer(enemies, offset: 0, index: 1)
        encoder.setFragmentBuffer(colours, offset: 0, index: 2)
        encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0)
    }
}
