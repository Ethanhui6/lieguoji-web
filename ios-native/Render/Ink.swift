import Foundation
import Metal
import QuartzCore
import simd
import LieguojiCore

/// 战争墨迹的渲染：墨落在哪些格子由 LieguojiCore 的 InkCells 决定（沿格子与地势洇开，攻占即收、议和淡去），
/// 这里只把它的逐顶点数据（落墨国、显出时刻、淡去时刻、覆盖比例）交给显卡：每帧沿陆地三角形合成，
/// 按时间显出与淡去，覆盖比例过阈值处见色，阈值受纸纹扰动，边缘参差。
/// 交战与退墨由格子模型结算。颜色从落墨方国色算出（高度灰、国色浓度、山影）。
/// 1.22 的两张世界纹理与每帧落墨、演进的离屏渲染都不再需要：推演每步才更新一次数据，静止时显卡只画一遍合成。
struct InkPipelines {
    let composite: MTLRenderPipelineState

    static func make(device: MTLDevice, library: MTLLibrary, mainFormat: MTLPixelFormat, depthFormat: MTLPixelFormat, sampleCount: Int) throws -> InkPipelines {
        let c = MTLRenderPipelineDescriptor()
        c.vertexFunction = library.makeFunction(name: "inkCompositeVertex")
        c.fragmentFunction = library.makeFunction(name: "inkCompositeFragment")
        c.colorAttachments[0].pixelFormat = mainFormat
        c.depthAttachmentPixelFormat = depthFormat
        c.rasterSampleCount = sampleCount
        c.colorAttachments[0].isBlendingEnabled = true
        c.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha; c.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        c.colorAttachments[0].sourceAlphaBlendFactor = .one; c.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
        return InkPipelines(composite: try device.makeRenderPipelineState(descriptor: c))
    }

    /// 着色器（拼在 MapRenderer.shaders 之后，用其中的 Uniforms、clip、fbm）。
    static let shaders = """
    // —— 战争墨迹 ——
    struct InkLook { float now; float reveal; float fade; float visible; float soft; float noise; float freq; float stateAlpha; float density; float nations; float2 pad; };
    struct InkCompositeOut {
        float4 position [[position]]; float2 world;
        int nation [[flat]]; int owner [[flat]]; float gray [[flat]];
        float shade; float3 terrain; float show; float fade; float amount;
    };
    vertex InkCompositeOut inkCompositeVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], const device float4* owners [[buffer(1)]],
                                              constant Uniforms& u [[buffer(2)]], const device float4* terrain [[buffer(3)]],
                                              const device float4* ink [[buffer(4)]], constant InkLook& look [[buffer(5)]]) {
        InkCompositeOut o; o.world = positions[id]; o.position = clip(o.world, u, float2(0.0));
        float4 w = owners[id]; o.owner = w.w > 0.5 ? int(w.x + 0.5) : -1; o.gray = w.y; o.shade = w.z; o.terrain = terrain[id].rgb;
        float4 k = ink[id]; o.nation = k.x > -0.5 ? int(k.x + 0.5) : -1;
        // 先算顶点的墨量再插值，让持续留墨的顶点和正在退墨的顶点平滑相接。
        o.show = clamp((min(look.now, k.z) - k.y) / look.reveal, 0.0, 1.0);
        float fade = 1.0 - clamp((look.now - k.z) / look.fade, 0.0, 1.0);
        o.fade = fade;
        o.amount = k.w * o.show * fade;
        return o;
    }
    static float inkToLinear(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
    static float inkToSrgb(float c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(max(c, 0.0), 1.0 / 2.4) - 0.055; }
    fragment float4 inkCompositeFragment(InkCompositeOut in [[stage_in]], constant InkLook& k [[buffer(0)]], const device float4* colours [[buffer(1)]]) {
        if (in.nation < 0 || in.owner < 0 || in.nation == in.owner || float(in.nation) >= k.nations) discard_fragment();
        float show = smoothstep(0.0, 1.0, in.show);
        float fade = smoothstep(0.0, 1.0, in.fade);
        float amount = in.amount;
        if (amount < 0.008) discard_fragment();
        // 还原「生成地图开卷 revealFragment」同款生宣水墨漫渗：
        // 大尺度有机毛细脉络（0.015 级低频 fbm2 × 0.27 强扰动）+ 利落清透湿墨前沿 + 墨锋蓄色深边；
        // 敌军踏境时如滴墨落宣层层氤氲，我军路过回染时沿纸纹自然收水回卷、还我国色。
        float2 q = in.world;
        float macro = fbm2(q * k.freq + float2(31.7, 11.3));
        float fiber = vnoise(q * (k.freq * 3.1) + float2(5.1, 1.7));
        float paperMod = (macro - 0.5) * 2.0 * k.noise + (fiber - 0.5) * (k.noise * 0.28);
        float level = amount + paperMod;
        float retreat = 1.0 - fade;
        float thresh = k.visible + retreat * 0.34;
        float soft = k.soft * (1.0 + retreat * 0.30);
        // 类似 revealFragment 的 smoothstep(-0.02, 0.07, ew)：边缘清锐且充满宣纸有机花瓣状渗痕，毫不发糊
        float reached = smoothstep(thresh - soft * 0.35, thresh + soft, level);
        // 水先墨行：推进锋面外缘极轻的润纸水痕
        float waterRim = smoothstep(thresh - soft * 1.15, thresh - soft * 0.25, level) * (1.0 - reached) * (1.0 - show * 0.65) * fade;
        float outAlpha = clamp(reached * (0.86 + 0.14 * show) * (0.24 + 0.76 * fade) + waterRim * 0.12, 0.0, 1.0);
        if (outAlpha < 0.004) discard_fragment();
        float3 e = colours[in.nation].rgb;
        float3 lin = float3(inkToLinear(e.r), inkToLinear(e.g), inkToLinear(e.b));
        lin = in.gray + (lin - in.gray) * min(0.94, k.stateAlpha * 1.10);
        float3 col = float3(inkToSrgb(lin.r), inkToSrgb(lin.g), inkToSrgb(lin.b));
        float luma = dot(col, float3(0.299, 0.587, 0.114));
        col = clamp(mix(float3(luma), col, 1.14), 0.0, 1.0);
        col = in.terrain + (col - in.terrain) * max(0.76, k.density);
        col = min(float3(1.0), col * in.shade);
        // 与 revealFragment 一致的初湿墨沉 + 湿锋蓄墨深环（front = reached * (1 - reached) * 4.0）
        float fresh = clamp(1.0 - max(0.0, level - thresh) * 4.2, 0.0, 1.0) * reached * (1.0 - show * 0.45) * fade;
        float front = reached * (1.0 - reached) * 4.0;
        float3 inkCol = col * (1.0 - 0.14 * fresh);
        inkCol = mix(inkCol, inkCol * 0.68, front * (0.56 * fade + 0.18 * retreat));
        // 回染收水时泛出淡淡宣纸润白水际
        inkCol += float3(0.04 * front * retreat);
        float3 haloCol = mix(col * 0.92, in.terrain * in.shade, 0.48);
        float3 finalCol = mix(haloCol, inkCol, clamp(reached / max(outAlpha, 1e-4), 0.0, 1.0));
        return float4(clamp(finalCol, 0.0, 1.0), outAlpha);
    }
    """
}

/// 墨迹的渲染状态：格子模型、已发布的画面、两块轮换的顶点缓冲、主人、地形与国色。
final class InkField {
    struct Look { var now: Float; var reveal: Float; var fade: Float; var visible: Float; var soft: Float; var noise: Float; var freq: Float; var stateAlpha: Float; var density: Float; var nations: Float; var pad = SIMD2<Float>(0, 0) }

    /// 格子模型只在 queue 上改（每步的落墨、清墨在后台算，主线程只拷算好的顶点数据）。
    var cells: InkCells? {
        didSet { if oldValue !== cells { snapshot = nil } }
    }
    private let queue = DispatchQueue(label: "lieguoji.ink", qos: .userInitiated)
    private var generation = 0
    private(set) var snapshot: InkCells.RenderSnapshot?
    /// 顶点数据：每次更新写进另一块，正在被显卡读的那块不动。
    let vertexBuffers = MapBufferPool()
    /// 每个顶点：主人国号、高度灰（线性）、山影、陆地标记；地形色（未加山影）。
    var terrain: MTLBuffer?
    /// 预缓存的不变地形高度灰与山影，以及双缓冲 owners 顶点池（避免每次易主在主线程重新分配 4MB Metal 缓冲与重算地形色）。
    var staticGrayShade: [Float] = []
    var staticVertexProvince: [Int32] = []
    let ownerBuffers = MapBufferPool()
    var lastProvinceOwners: [Int] = []
    var scrubbingReplay = false
    var colours: MTLBuffer?
    var colourValues: [RGB] = []
    let world: SIMD2<Float>

    init(map: WorldMap) { world = SIMD2(Float(max(1, map.width)), Float(max(1, map.height))) }

    /// 有新数据就拷进另一块缓冲（推演每步一次，约两百万字节的内存拷贝）。
    private func upload(_ device: MTLDevice, _ data: [Float]) -> Bool {
        let length = max(16, data.count * MemoryLayout<Float>.stride)
        let uploaded = vertexBuffers.write(device: device, length: length) { buffer in
            data.withUnsafeBytes { if let address = $0.baseAddress { memcpy(buffer.contents(), address, $0.count) } }
        }
        return uploaded != nil
    }

    /// 在后台改格子模型，算完回主线程上传并要求重绘。
    func update(_ renderer: MapRenderer, _ change: @escaping (InkCells) -> Void) {
        guard let cells else { return }
        let generation = self.generation
        queue.async { [weak self, weak renderer] in
            let revision = cells.revision
            change(cells)
            guard revision != cells.revision else { return }
            let snapshot = cells.renderSnapshot()
            DispatchQueue.main.async {
                guard let self, let renderer, renderer.ink === self, self.cells === cells,
                      self.generation == generation, self.upload(renderer.device, snapshot.vertices) else { return }
                self.snapshot = snapshot
                renderer.onOutlines?()
            }
        }
    }

    func reset(_ renderer: MapRenderer) {
        generation &+= 1
        snapshot = nil
        update(renderer) { $0.clear() }
    }

    /// 是否还在显出或淡去（要连续重绘）。
    func busy(_ now: Float) -> Bool { (snapshot?.busyUntil ?? 0) > now }
}

extension MapRenderer {
    /// 每个顶点的主人国号、高度灰、山影与地形色：静态地形只建一次，易主时仅双缓冲原位更新归属，彻底消除主线程重复分配与掉帧。
    func rebuildInkOwners(forceTerrain: Bool = false) {
        guard let ink else { return }
        let count = map.vertices.count / 2
        guard count > 0 else { return }
        let provinces = map.meta.provinces
        // 推演可能已收到更新的地图；墨迹的主人号始终跟随本次安装的底色。
        let currentOwners = base?.owners ?? provinces.map(\.nation)

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

        rebuildInkColours(base?.palette ?? nationColors)
        // 点选、换色等未改变归属时，复用已有的主人缓冲。
        if !forceTerrain && ink.ownerBuffers.buffer != nil && ink.lastProvinceOwners == currentOwners { return }

        // 3. 双缓冲原位写入顶点主人号（零新 MTLBuffer 分配）
        let byteLen = max(16, count * 4 * MemoryLayout<Float>.stride)
        let uploaded = ink.ownerBuffers.write(device: device, length: byteLen) { buf in
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
        }
        guard uploaded != nil else { return }
        ink.lastProvinceOwners = currentOwners
        if !ink.scrubbingReplay {
            let now = clock()
            ink.update(self) { $0.owners(currentOwners, now: now) }
        }
    }

    /// 国色变化时重建色表，交战状态由后台发布的墨迹快照决定。
    private func rebuildInkColours(_ palette: [RGB]) {
        guard let ink else { return }
        guard ink.colours == nil || ink.colourValues != palette else { return }
        var colours: [Float] = palette.flatMap { color -> [Float] in [color.r, color.g, color.b, 1] }
        if colours.isEmpty { colours = [0.6, 0.6, 0.6, 1] }
        ink.colours = device.makeBuffer(bytes: colours, length: colours.count * 4, options: .storageModeShared)
        ink.colourValues = palette
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
    func drawInk(_ encoder: MTLRenderCommandEncoder, _ u: inout Uniforms, command: MTLCommandBuffer) {
        let now = clock(frameTime)
        let vCount = map.vertices.count / 2
        guard vCount > 0, let ink, let snapshot = ink.snapshot, snapshot.visibleUntil > now, let data = ink.vertexBuffers.buffer,
              let owners = ink.ownerBuffers.buffer, let terrain = ink.terrain, let colours = ink.colours,
              positions.length >= vCount * 8, data.length >= vCount * 16, owners.length >= vCount * 16, terrain.length >= vCount * 16,
              indexCount > 0, reveal >= 1, display.battleGround ?? true else { return }
        let scale = washTopology?.scale ?? 30
        let density = mode == .political ? Float(max(0, min(1, display.colorDensity))) : 1
        var look = InkField.Look(now: now, reveal: InkCells.revealSeconds, fade: InkCells.fadeSeconds, visible: 0.38, soft: 0.062, noise: 0.265,
                                 freq: 1 / (scale * 1.92), stateAlpha: MapPalette.stateAlpha, density: density, nations: Float(ink.colourValues.count))
        encoder.setRenderPipelineState(inkPipes.composite)
        encoder.setVertexBuffer(positions, offset: 0, index: 0)
        encoder.setVertexBuffer(owners, offset: 0, index: 1)
        encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
        encoder.setVertexBuffer(terrain, offset: 0, index: 3)
        encoder.setVertexBuffer(data, offset: 0, index: 4)
        encoder.setVertexBytes(&look, length: MemoryLayout<InkField.Look>.stride, index: 5)
        encoder.setFragmentBytes(&look, length: MemoryLayout<InkField.Look>.stride, index: 0)
        encoder.setFragmentBuffer(colours, offset: 0, index: 1)
        encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0)
        ink.vertexBuffers.recordRead(in: command)
        ink.ownerBuffers.recordRead(in: command)
    }
}
