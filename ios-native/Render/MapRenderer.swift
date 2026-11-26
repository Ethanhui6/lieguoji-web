import UIKit
import MetalKit
import LieguojiCore

/// Reuse the inactive slot only after its most recent read on the render queue has ended.
final class MapBufferPool {
    private struct Slot {
        let buffer: MTLBuffer
        var lastRead: MTLCommandBuffer?
    }

    private var slots: [Slot?] = [nil, nil]
    private var current = 0
    var buffer: MTLBuffer? { slots[current]?.buffer }

    func write(device: MTLDevice, length: Int, capacity: Int? = nil, _ fill: (MTLBuffer) -> Void) -> MTLBuffer? {
        let safeLength = max(16, length)
        let allocLength = max(safeLength, capacity ?? safeLength)
        let index = 1 - current
        let buffer: MTLBuffer
        if let slot = slots[index], slot.buffer.length >= safeLength,
           slot.lastRead == nil || slot.lastRead?.status == .completed || slot.lastRead?.status == .error {
            buffer = slot.buffer
        } else {
            guard let replacement = device.makeBuffer(length: allocLength, options: .storageModeShared) else { return nil }
            buffer = replacement
        }
        fill(buffer)
        slots[index] = Slot(buffer: buffer, lastRead: nil)
        current = index
        return buffer
    }

    func recordRead(in command: MTLCommandBuffer) {
        slots[current]?.lastRead = command
    }

    func reset() {
        slots = [nil, nil]
        current = 0
    }
}

/// Hardcore single-pass Metal map renderer (Claude lean architecture):
/// sea texture → land cells (1-multiply seasonal tint) → war ink wash & flip sweep →
/// province lines → rivers → ornaments / relief → state borders → city/fort/port icons →
/// carved-lacquer armies & fleets → parchment multiply → precomputed geometric antique scroll mount.
/// Zero offscreen render targets, zero per-pixel noise/SDF heaters, zero dead pipelines.
final class MapRenderer: NSObject, MTKViewDelegate {
    let device: MTLDevice
    private let queue: MTLCommandQueue
    private let cellPipeline: MTLRenderPipelineState
    /// 开卷: GPU generation reveal (sea veil → shore-to-peak ink → state wash from capitals).
    private let revealPipeline: MTLRenderPipelineState
    private let veilPipeline: MTLRenderPipelineState
    /// 易主逐顶点平滑渐变（LieguojiCore.LandFade）。
    private let fadePipeline: MTLRenderPipelineState
    private var previousColors: MTLBuffer?
    private(set) var landFade = LandFade()
    private var fadeOnRecolor = false
    /// 统一单调渲染时钟（秒）。
    let clockStart = CACurrentMediaTime()
    func clock(_ t: CFTimeInterval = CACurrentMediaTime()) -> Float { Float(t - clockStart) }
    /// 本帧时刻（draw 开头取一次，各图层共用；同事务拖拽缩放时由 MapView 钉住同一时刻，确保军队与兵力数字 0px 错位）。
    private(set) var frameTime: CFTimeInterval = CACurrentMediaTime()
    var pinnedFrameTime: CFTimeInterval?
    private var fading: Bool { previousColors != nil && landFade.fading(at: clock()) }
    /// 某顶点此刻显示的陆地颜色（CI 逐帧记录用）。
    func displayedLand(_ v: Int, at t: Float) -> SIMD3<Float> { landFade.shown(v, at: t) }
    /// CI 测量：整帧编码、战争晕染编码、GPU 执行、实际上屏间隔、易主重着色（毫秒）。
    final class FrameProbe { var encode = [Double](), wash = [Double](), gpu = [Double](), presented = [Double](), recolor = [Double](); var lastPresent: CFTimeInterval = 0 }
    static var frameProbe: FrameProbe?
    /// 战争晕染：GPU 墨场（Render/Ink.swift）与易主扫色（Render/Wash.swift）。
    let sweepPipeline: MTLRenderPipelineState
    let inkPipes: InkPipelines
    var ink: InkField?
    var sweep: FlipSweep?
    var washTopology: WashTopology?
    var washBuilding = 0
    var washFrame = WashFrame.empty
    var washEpoch = 0
    var sweepMeshCache: (revision: Int, vertices: MTLBuffer, indices: MTLBuffer, count: Int)?
    var washCaptures: [Int: (nation: Int, armies: [SIMD2<Float>], time: Float)] = [:]
    var washRegimes: [Int: Float] = [:]
    var washOld: [Float] = []

    private let flatPipeline: MTLRenderPipelineState
    private let coloredPipeline: MTLRenderPipelineState
    private let deskPipeline: MTLRenderPipelineState
    private let seaPipeline: MTLRenderPipelineState
    private let reliefTilePipeline: MTLRenderPipelineState
    private let multiplyPipeline: MTLRenderPipelineState
    private let spritePipeline: MTLRenderPipelineState
    private let scrollBorderPipeline: MTLRenderPipelineState
    private let scrollArtPipeline: MTLRenderPipelineState
    /// 当前激活的真实地理分区（用于流式挂载 HotPack v6 `ReliefTiles/{region}.lgtr` 8K–16K 卫星地貌瓦片）。
    var activeHistoricalRegion: String = ""
    private var loadedUnitEra: String = ""
    private var loadedUnitRootPath: String = ""

    /// Army icons grouped by unit type: texture, vertex buffer, count, and pool.
    private var units: [(texture: MTLTexture, buffer: MTLBuffer, count: Int, pool: MapBufferPool)] = []
    let positions: MTLBuffer
    private let vertexCount: Int
    private(set) var indices: MTLBuffer
    private(set) var indexCount: Int
    private var colors: MTLBuffer
    private var provinceLines: (buffer: MTLBuffer, count: Int)?
    private var rivers: (buffer: MTLBuffer, count: Int)?
    private var extraRivers: (buffer: MTLBuffer, count: Int)?
    private var relief: (buffer: MTLBuffer, count: Int)?
    private var outlines: (buffer: MTLBuffer, count: Int)?
    private var icons: (buffer: MTLBuffer, count: Int)?
    private var ornaments: (buffer: MTLBuffer, count: Int)?
    private var fineDetail: (buffer: MTLBuffer, count: Int)?
    private var seaLanes: (buffer: MTLBuffer, count: Int)?
    private var portIcons: (buffer: MTLBuffer, count: Int)?
    private lazy var gridLines: (buffer: MTLBuffer, count: Int)? = {
        var m = ColoredMesh()
        let w = self.map.width, h = self.map.height, ink = RGB(hex: 0x3A3027), width = MapLayers.lineWidth * 0.5
        for i in 1..<12 { let x = w * Float(i) / 12; m.polyline([x, 0, x, h], width: width, ink, alpha: 0.28) }
        for j in 1..<8 { let y = h * Float(j) / 8; m.polyline([0, y, w, y], width: width, ink, alpha: j == 4 ? 0.42 : 0.28) }
        return self.buffer(m.vertices, stride: 6)
    }()
    private var seaLaneKey: [SIMD2<Float>] = []
    private var forts: (buffer: MTLBuffer, count: Int)?
    private var fortKey: [SIMD2<Float>] = []
    private var holyKey: [SIMD2<Float>] = []
    private var seaSource: [UInt8] = []
    private var seaMask: [UInt8] = []
    private var coastRefined = false
    /// 博物馆级御览手卷矢量装裱画框（24 段 Phong 紫檀滚轴 + 碧玉葫芦轴头 + 鎏金回纹包角 + 云锦菱格 + 45° 斜接柔影，任意倍缩放纤毫毕现）。
    private var scrollFrameMesh: (buffer: MTLBuffer, count: Int)?
    private var scrollMount: (buffer: MTLBuffer, count: Int)?
    private var scrollArtH: (buffer: MTLBuffer, count: Int)?
    private var scrollArtV: (buffer: MTLBuffer, count: Int)?
    private var scrollArtCorners: (buffer: MTLBuffer, count: Int)?
    private var sea: MTLTexture?
    private let parchment: MTLTexture?
    private let paperDetail: MTLTexture?
    private let scrollBorderHTex: MTLTexture?
    private let scrollRollerVTex: MTLTexture?
    private let scrollCornerTex: MTLTexture?
    private let sampler: MTLSamplerState?
    private let repeatSampler: MTLSamplerState?
    private let mirrorSampler: MTLSamplerState?
    private(set) var map: WorldMap { didSet { revealFields = nil; revealFieldData = nil; coastInk = nil } }
    private var coastInk: (buffer: MTLBuffer, count: Int)?
    private(set) var nationColors: [RGB]
    private(set) var tint: [Int: RGB] = [:]
    private(set) var fills: [RGB]?
    private(set) var viewKey = ""
    var camera: MapCamera
    var onDraw: ((CFTimeInterval) -> Void)?
    private(set) var mode: MapMode = .political
    private(set) var highlight: Int?
    /// 四时节气相位（0..1，负数表示未启用）；在 CPU 预算出 RGB 系数传入 Uniform，片元零三角函数运算。
    var seasonPhase: Float = -1

    struct Uniforms {
        var viewport: SIMD2<Float>
        var center: SIMD2<Float>
        var scale: Float
        var halfWidth: Float
        var alpha: Float = 1
        var time: Float = 0
        var lighting: Float = 1
        var mapWidth: Float = 1600
        var mapHeight: Float = 900
        var pad: Float = 0
        var iconZoom: Float = 1
        var pad2: Float = 0
        var pad3: Float = 0
        var pad4: Float = 0
        var landTint: SIMD4<Float> = SIMD4(1, 1, 1, 1)
        var seaTint: SIMD4<Float> = SIMD4(1, 1, 1, 1)
        /// CPU 预计算四季权重 `(winter, spring, summer, autumn)`，片元零三角函数运算。
        var seasonWeights: SIMD4<Float> = SIMD4(0, 0, 0, 0)
    }

    /// 跨世界复用的 12 条精简单 Pass Metal 管线与共享贴图（启动编译一次，后续切换世界零编译耗时）。
    private struct SharedMetalAssets {
        let deviceID: ObjectIdentifier
        let pixelFormat: MTLPixelFormat
        let sampleCount: Int
        let cellPipeline: MTLRenderPipelineState
        let revealPipeline: MTLRenderPipelineState
        let veilPipeline: MTLRenderPipelineState
        let fadePipeline: MTLRenderPipelineState
        let flatPipeline: MTLRenderPipelineState
        let coloredPipeline: MTLRenderPipelineState
        let deskPipeline: MTLRenderPipelineState
        let seaPipeline: MTLRenderPipelineState
        let reliefTilePipeline: MTLRenderPipelineState
        let multiplyPipeline: MTLRenderPipelineState
        let spritePipeline: MTLRenderPipelineState
        let scrollBorderPipeline: MTLRenderPipelineState
        let scrollArtPipeline: MTLRenderPipelineState
        let sweepPipeline: MTLRenderPipelineState
        let inkPipes: InkPipelines
        let parchment: MTLTexture?
        let paperDetail: MTLTexture?
        let scrollBorderHTex: MTLTexture?
        let scrollRollerVTex: MTLTexture?
        let scrollCornerTex: MTLTexture?
        let sampler: MTLSamplerState?
        let repeatSampler: MTLSamplerState?
        let mirrorSampler: MTLSamplerState?
        let unitTextures: [String: MTLTexture]
    }
    private static var sharedAssets: SharedMetalAssets?

    static let paper = RGB(hex: 0xEDE3CC)
    struct QuadUniforms { var origin: SIMD2<Float>; var size: SIMD2<Float> }

    /// 零 UB 安全 Metal 缓冲构造：当数组为空时绝不传入空指针调用 `makeBuffer(bytes:length:)`，确保全海面或极端地图绝不越界崩溃。
    private static func makeSafeBuffer<T>(device: MTLDevice, _ data: [T], minLength: Int = 16) -> MTLBuffer? {
        let byteCount = data.count * MemoryLayout<T>.stride
        let length = max(minLength, byteCount)
        if byteCount == 0 {
            return device.makeBuffer(length: length, options: .storageModeShared)
        }
        if byteCount == length {
            return data.withUnsafeBytes { raw in
                guard let base = raw.baseAddress else { return nil }
                return device.makeBuffer(bytes: base, length: length, options: .storageModeShared)
            }
        }
        guard let buf = device.makeBuffer(length: length, options: .storageModeShared) else { return nil }
        data.withUnsafeBytes { raw in
            if let base = raw.baseAddress { memcpy(buf.contents(), base, byteCount) }
        }
        return buf
    }

    init?(view: MTKView, map: WorldMap, parchmentURL: URL?, unitURL: (String) -> URL? = { _ in nil }) {
        _ = unitURL
        guard let device = view.device, let queue = device.makeCommandQueue() else {
            NSLog("Lieguoji Metal: no rendering device or command queue")
            return nil
        }
        self.device = device; self.queue = queue; self.map = map; self.vertexCount = map.vertices.count / 2
        nationColors = map.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        camera = MapCamera.fit(map: (Double(map.width), Double(map.height)), viewport: (390, 844))
        // 2× MSAA + 无深度缓冲 + framebufferOnly：清晰抗锯齿且带宽仅为 4× MSAA 一半，显著降温降内存。
        view.sampleCount = device.supportsTextureSampleCount(2) ? 2 : 1
        view.colorPixelFormat = .bgra8Unorm
        view.depthStencilPixelFormat = .invalid
        view.framebufferOnly = true

        let devID = ObjectIdentifier(device)
        let assets: SharedMetalAssets
        if let cached = Self.sharedAssets,
           cached.deviceID == devID,
           cached.pixelFormat == view.colorPixelFormat,
           cached.sampleCount == view.sampleCount {
            assets = cached
        } else {
            do {
                let library = try device.makeLibrary(source: MapRenderer.shaders + MapRenderer.sweepShaders + InkPipelines.shaders, options: nil)
                enum Blend { case none, alpha, multiply }
                func pipeline(_ vertex: String, _ fragment: String, _ blend: Blend) throws -> MTLRenderPipelineState {
                    let d = MTLRenderPipelineDescriptor()
                    d.vertexFunction = library.makeFunction(name: vertex)
                    d.fragmentFunction = library.makeFunction(name: fragment)
                    d.colorAttachments[0].pixelFormat = view.colorPixelFormat
                    d.rasterSampleCount = view.sampleCount
                    let a: MTLRenderPipelineColorAttachmentDescriptor = d.colorAttachments[0]
                    switch blend {
                    case .none: break
                    case .alpha:
                        a.isBlendingEnabled = true
                        a.sourceRGBBlendFactor = .sourceAlpha; a.destinationRGBBlendFactor = .oneMinusSourceAlpha
                        a.sourceAlphaBlendFactor = .one; a.destinationAlphaBlendFactor = .oneMinusSourceAlpha
                    case .multiply:
                        a.isBlendingEnabled = true
                        a.sourceRGBBlendFactor = .destinationColor; a.destinationRGBBlendFactor = .zero
                        a.sourceAlphaBlendFactor = .zero; a.destinationAlphaBlendFactor = .one
                    }
                    return try device.makeRenderPipelineState(descriptor: d)
                }
                let loader = MTKTextureLoader(device: device)
                let pTex: MTLTexture? = parchmentURL.flatMap { try? loader.newTexture(URL: $0, options: [.SRGB: false, .generateMipmaps: true]) }
                let dTex: MTLTexture? = Bundle.main.url(forResource: "paper-detail", withExtension: "jpg", subdirectory: "World")
                    .flatMap { try? loader.newTexture(URL: $0, options: [.SRGB: false, .generateMipmaps: true]) }
                let sbHTex: MTLTexture? = Bundle.main.url(forResource: "scroll-border-h", withExtension: "png", subdirectory: "Art")
                    .flatMap { try? loader.newTexture(URL: $0, options: [.SRGB: false, .generateMipmaps: true]) }
                let srVTex: MTLTexture? = Bundle.main.url(forResource: "scroll-roller-v", withExtension: "png", subdirectory: "Art")
                    .flatMap { try? loader.newTexture(URL: $0, options: [.SRGB: false, .generateMipmaps: true]) }
                let scTex: MTLTexture? = Bundle.main.url(forResource: "scroll-corner", withExtension: "png", subdirectory: "Art")
                    .flatMap { try? loader.newTexture(URL: $0, options: [.SRGB: false, .generateMipmaps: true]) }
                let sDesc = MTLSamplerDescriptor()
                sDesc.minFilter = .linear; sDesc.magFilter = .linear; sDesc.mipFilter = .linear
                sDesc.maxAnisotropy = 4
                sDesc.sAddressMode = .clampToEdge; sDesc.tAddressMode = .clampToEdge
                let smp = device.makeSamplerState(descriptor: sDesc)
                let rsDesc = MTLSamplerDescriptor()
                rsDesc.minFilter = .linear; rsDesc.magFilter = .linear; rsDesc.mipFilter = .linear
                rsDesc.maxAnisotropy = 4
                rsDesc.sAddressMode = .repeat; rsDesc.tAddressMode = .repeat
                let rsmp = device.makeSamplerState(descriptor: rsDesc)
                let msDesc = MTLSamplerDescriptor()
                msDesc.minFilter = .linear; msDesc.magFilter = .linear; msDesc.mipFilter = .linear
                msDesc.maxAnisotropy = 4
                msDesc.sAddressMode = .mirrorRepeat; msDesc.tAddressMode = .clampToEdge
                let msmp = device.makeSamplerState(descriptor: msDesc)

                var uTex: [String: MTLTexture] = [:]
                for role in ["infantry", "spear", "shield", "archer", "crossbow", "cavalry", "heavy", "horseArcher", "elite", "elephant", "Fleet", "Transport", "Port", "Merchant"] {
                    let probe = ["Fleet", "Transport", "Port", "Merchant"].contains(role) ? role : (UnitKinds.kinds.first { $0.role.rawValue == role }?.key ?? "Infantry")
                    guard let image = UnitArt.image(probe) else { continue }
                    if let texture = try? loader.newTexture(cgImage: image, options: [.SRGB: false, .generateMipmaps: true]) { uTex[role] = texture }
                    else if let texture = Self.texture(device, image) { uTex[role] = texture }
                }
                uTex["banner"] = uTex["elite"]
                // 4.1 经典雕漆盾牌军牌（内嵌柔和落地柔影，零额外阴影 Pass 渲染开销）
                let plateArt = UIGraphicsImageRenderer(size: CGSize(width: 128, height: 128), format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; f.preferredRange = .standard; return f }()).image { ctx in
                    let g = ctx.cgContext
                    func shieldPath(inset d: CGFloat, dx: CGFloat = 0, dy: CGFloat = 0) -> CGPath {
                        let p = CGMutablePath()
                        let l = 10 + d + dx, r = 114 - d + dx, t = 8 + d + dy, midY = 72 - d * 0.15 + dy, b = 116 - d + dy
                        let corner: CGFloat = max(4, 15 - d * 0.65)
                        p.move(to: CGPoint(x: l + corner, y: t))
                        p.addLine(to: CGPoint(x: r - corner, y: t))
                        p.addQuadCurve(to: CGPoint(x: r, y: t + corner), control: CGPoint(x: r, y: t))
                        p.addLine(to: CGPoint(x: r, y: midY))
                        p.addQuadCurve(to: CGPoint(x: 62 + dx, y: b), control: CGPoint(x: r - 2, y: b - 14))
                        p.addQuadCurve(to: CGPoint(x: l, y: midY), control: CGPoint(x: l + 2, y: b - 14))
                        p.addLine(to: CGPoint(x: l, y: t + corner))
                        p.addQuadCurve(to: CGPoint(x: l + corner, y: t), control: CGPoint(x: l, y: t))
                        p.closeSubpath()
                        return p
                    }
                    // 烘焙柔和东南落影（无需额外 GPU 阴影 Pass）
                    g.setFillColor(red: 0.08, green: 0.06, blue: 0.04, alpha: 0.30)
                    g.addPath(shieldPath(inset: -1, dx: 4.5, dy: 5.5)); g.fillPath()
                    g.setFillColor(red: 0.10, green: 0.10, blue: 0.10, alpha: 1)
                    g.addPath(shieldPath(inset: 0)); g.fillPath()
                    g.setFillColor(red: 0.68, green: 0.68, blue: 0.68, alpha: 1)
                    g.addPath(shieldPath(inset: 5.5)); g.fillPath()
                    let inner = shieldPath(inset: 8.5)
                    g.saveGState()
                    g.addPath(inner); g.clip()
                    if let grad = CGGradient(colorSpace: CGColorSpaceCreateDeviceRGB(), colorComponents: [1.0, 1.0, 1.0, 1.0, 0.93, 0.93, 0.93, 1.0, 0.78, 0.78, 0.78, 1.0], locations: [0.0, 0.52, 1.0], count: 3) {
                        g.drawLinearGradient(grad, start: CGPoint(x: 16, y: 12), end: CGPoint(x: 108, y: 112), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
                    } else {
                        g.setFillColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1); g.fill(CGRect(x: 0, y: 0, width: 128, height: 128))
                    }
                    g.restoreGState()
                    g.setStrokeColor(red: 0.36, green: 0.36, blue: 0.36, alpha: 0.50); g.setLineWidth(1.9)
                    g.addPath(shieldPath(inset: 14.0)); g.strokePath()
                    g.setFillColor(red: 0.34, green: 0.34, blue: 0.34, alpha: 0.60)
                    g.fillEllipse(in: CGRect(x: 27, y: 20, width: 5.5, height: 5.5))
                    g.fillEllipse(in: CGRect(x: 91.5, y: 20, width: 5.5, height: 5.5))
                }.cgImage
                if let plateArt { uTex["0plate"] = (try? loader.newTexture(cgImage: plateArt, options: [.SRGB: false, .generateMipmaps: true])) ?? Self.texture(device, plateArt) }
                let wakeArt = UIGraphicsImageRenderer(size: CGSize(width: 128, height: 128), format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; f.preferredRange = .standard; return f }()).image { ctx in
                    let g = ctx.cgContext
                    g.setLineCap(.round)
                    g.setFillColor(red: 0.96, green: 0.98, blue: 1.0, alpha: 0.24)
                    g.fillEllipse(in: CGRect(x: 10, y: 66, width: 108, height: 42))
                    g.setStrokeColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.72)
                    g.setLineWidth(3.4)
                    g.strokeEllipse(in: CGRect(x: 18, y: 74, width: 92, height: 28))
                    g.setStrokeColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.42)
                    g.setLineWidth(2.0)
                    g.strokeEllipse(in: CGRect(x: 8, y: 68, width: 112, height: 40))
                }.cgImage
                if let wakeArt { uTex["0fleetwake"] = (try? loader.newTexture(cgImage: wakeArt, options: [.SRGB: false, .generateMipmaps: true])) ?? Self.texture(device, wakeArt) }

                assets = SharedMetalAssets(
                    deviceID: devID,
                    pixelFormat: view.colorPixelFormat,
                    sampleCount: view.sampleCount,
                    cellPipeline: try pipeline("cellVertex", "landFragment", .none),
                    revealPipeline: try pipeline("revealVertex", "revealFragment", .none),
                    veilPipeline: try pipeline("quadVertex", "veilFragment", .alpha),
                    fadePipeline: try pipeline("fadeVertex", "landFragment", .none),
                    flatPipeline: try pipeline("flatVertex", "flatFragment", .alpha),
                    coloredPipeline: try pipeline("coloredVertex", "colorFragment", .alpha),
                    deskPipeline: try pipeline("deskVertex", "deskFragment", .none),
                    seaPipeline: try pipeline("seaVertex", "seaFragment", .none),
                    reliefTilePipeline: try pipeline("seaVertex", "reliefTileFragment", .alpha),
                    multiplyPipeline: try pipeline("seaVertex", "parchmentFragment", .multiply),
                    spritePipeline: try pipeline("spriteVertex", "spriteFragment", .alpha),
                    scrollBorderPipeline: try pipeline("scrollRingVertex", "scrollShadowFragment", .alpha),
                    scrollArtPipeline: try pipeline("scrollArtVertex", "scrollArtFragment", .alpha),
                    sweepPipeline: try pipeline("sweepVertex", "sweepFragment", .alpha),
                    inkPipes: try InkPipelines.make(device: device, library: library, mainFormat: view.colorPixelFormat, sampleCount: view.sampleCount),
                    parchment: pTex,
                    paperDetail: dTex,
                    scrollBorderHTex: sbHTex,
                    scrollRollerVTex: srVTex,
                    scrollCornerTex: scTex,
                    sampler: smp,
                    repeatSampler: rsmp,
                    mirrorSampler: msmp,
                    unitTextures: uTex
                )
                Self.sharedAssets = assets
            } catch {
                NSLog("Lieguoji Metal: pipeline setup failed at %dx MSAA: %@", view.sampleCount, error.localizedDescription)
                return nil
            }
        }
        cellPipeline = assets.cellPipeline
        revealPipeline = assets.revealPipeline
        veilPipeline = assets.veilPipeline
        fadePipeline = assets.fadePipeline
        flatPipeline = assets.flatPipeline
        coloredPipeline = assets.coloredPipeline
        deskPipeline = assets.deskPipeline
        seaPipeline = assets.seaPipeline
        reliefTilePipeline = assets.reliefTilePipeline
        multiplyPipeline = assets.multiplyPipeline
        spritePipeline = assets.spritePipeline
        scrollBorderPipeline = assets.scrollBorderPipeline
        scrollArtPipeline = assets.scrollArtPipeline
        sweepPipeline = assets.sweepPipeline
        inkPipes = assets.inkPipes
        parchment = assets.parchment
        paperDetail = assets.paperDetail
        scrollBorderHTex = assets.scrollBorderHTex
        scrollRollerVTex = assets.scrollRollerVTex
        scrollCornerTex = assets.scrollCornerTex
        sampler = assets.sampler
        repeatSampler = assets.repeatSampler
        mirrorSampler = assets.mirrorSampler
        unitTextures = assets.unitTextures
        loadedUnitEra = UnitArt.activeEra
        loadedUnitRootPath = UnitArt.hotPackEraUnitsRoot?.path ?? ""

        let mesh = CellMesh(map: map)
        guard let p = Self.makeSafeBuffer(device: device, mesh.positions, minLength: 16),
              let i = Self.makeSafeBuffer(device: device, mesh.indices, minLength: 16) else { return nil }
        positions = p; indices = i; indexCount = mesh.indices.count
        let c = CellMesh.colors(map: map, mode: .political, nationColors: nationColors)
        guard let cb = Self.makeSafeBuffer(device: device, c, minLength: 16) else { return nil }
        colors = cb

        let seaDescriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: max(1, map.seaWidth), height: max(1, map.seaHeight), mipmapped: false)
        seaDescriptor.usage = .shaderRead
        sea = device.makeTexture(descriptor: seaDescriptor)
        seaSource = map.seaRGBA
        super.init()

        let ready = Self.prepared.flatMap { $0.key == MapLayers.key(map) ? $0 : nil }
        Self.prepared = nil
        revealFieldData = ready?.reveal
        provinceLines = buffer(ready?.provinceLines ?? MapLayers.provinceLines(map).vertices, stride: 6)
        if !map.rivers.isEmpty { rivers = buffer(map.rivers, stride: 2) }
        relief = buffer(ready?.relief ?? MapLayers.relief(map).vertices, stride: 6)
        outlines = buffer(ready?.outlines ?? MapLayers.outlines(map).vertices, stride: 6)
        icons = buffer(ready?.icons ?? MapLayers.cityIcons(map).vertices, stride: 6)
        ornaments = buffer(ready?.ornaments ?? MapLayers.ornaments(map).vertices, stride: 6)
        fineDetail = buffer(ready?.fine ?? MapLayers.fineDetail(map).vertices, stride: 6)
        seaMask = ready?.sea ?? MapLayers.waterlines(map)
        scrollFrameMesh = buffer(MapLayers.scrollFrame(width: map.width, height: map.height).vertices, stride: 6)
        scrollMount = Self.buildScrollMount(device: device, width: map.width, height: map.height)
        scrollArtH = nil
        scrollArtV = nil
        scrollArtCorners = nil
        uploadSea()
        if let start = map.meta.economy {
            setArmies(start.armies.filter { $0.troops > 0 }.enumerated().map { ArmySprite(army: $0.offset, x: $0.element.x, y: $0.element.y, unit: $0.element.unit, nation: $0.element.nation, selected: false) }, route: [])
        }
    }

    /// 热更下载完成或切换时代时清理共享管线里的旧兵模贴图缓存，确保新 `EraUnits/` 即刻生效。
    static func invalidateUnitTextureCache() {
        sharedAssets = nil
        UnitArt.clearCache()
    }

    /// 当历史时代切换或 HotPack v6 `EraUnits/` 刚刚挂载时，原地热替换 GPU 兵模贴图（保留盾牌底托与战舰尾浪）。
    @discardableResult
    func reloadUnitTexturesIfNeeded() -> Bool {
        let curEra = UnitArt.activeEra
        let curRoot = UnitArt.hotPackEraUnitsRoot?.path ?? ""
        guard curEra != loadedUnitEra || curRoot != loadedUnitRootPath else { return false }
        loadedUnitEra = curEra
        loadedUnitRootPath = curRoot
        let loader = MTKTextureLoader(device: device)
        var next = unitTextures
        for role in ["infantry", "spear", "shield", "archer", "crossbow", "cavalry", "heavy", "horseArcher", "elite", "elephant", "Fleet", "Transport", "Port", "Merchant"] {
            let probe = ["Fleet", "Transport", "Port", "Merchant"].contains(role) ? role : (UnitKinds.kinds.first { $0.role.rawValue == role }?.key ?? "Infantry")
            guard let image = UnitArt.image(probe, era: curEra) else { continue }
            if let texture = try? loader.newTexture(cgImage: image, options: [.SRGB: false, .generateMipmaps: true]) {
                next[role] = texture
            } else if let texture = Self.texture(device, image) {
                next[role] = texture
            }
        }
        next["banner"] = next["elite"]
        unitTextures = next
        rebuildArmies()
        return true
    }

    private var released = false

    /// 世界切换前夕抢先释放高内存瞬态数据（墨场、拓扑、扫色、海面源字节与展卷场），在保留最后一帧静图的同时削平双世界内存尖峰。
    func releaseHeavyTransientResources() {
        ink = nil
        sweep = nil
        washTopology = nil
        sweepMeshCache = nil
        washOld.removeAll(keepingCapacity: false)
        previousColors = nil
        revealFields = nil
        revealFieldData = nil
        revealTerrain = nil
        seaSource.removeAll(keepingCapacity: false)
        seaMask.removeAll(keepingCapacity: false)
        coastInk = nil
    }

    /// 切换世界卸载旧地图时主动释放重型顶点与墨场缓冲，防止真机内存叠加触发 Jetsam 闪退。
    func releaseResources() {
        released = true
        _ = workRevision.replaceMap()
        onDraw = nil
        onOutlines = nil
        releaseHeavyTransientResources()
        base = nil
        terrainBase = nil
        shade.removeAll(keepingCapacity: false)
        sea = nil
        provinceLines = nil
        rivers = nil
        extraRivers = nil
        relief = nil
        outlines = nil
        icons = nil
        ornaments = nil
        fineDetail = nil
        seaLanes = nil
        portIcons = nil
        forts = nil
        scrollFrameMesh = nil
        scrollMount = nil
        scrollArtH = nil
        scrollArtV = nil
        scrollArtCorners = nil
        route = nil
        armySprites.removeAll(keepingCapacity: false)
        dying.removeAll(keepingCapacity: false)
        deathDelays.removeAll(keepingCapacity: false)
        routePoints.removeAll(keepingCapacity: false)
        legFrom.removeAll(keepingCapacity: false)
        legTo.removeAll(keepingCapacity: false)
        legLead.removeAll(keepingCapacity: false)
        lastLegVelocity.removeAll(keepingCapacity: false)
        spread.removeAll(keepingCapacity: false)
        fresh.removeAll(keepingCapacity: false)
        cachedPlacedSprites.removeAll(keepingCapacity: false)
        cachedPlacedSpritesTime = -1
        armySpritesRevision &+= 1
        units.removeAll(keepingCapacity: false)
        unitBufferPool.removeAll(keepingCapacity: false)
        colorBufferPool.reset()
        prevColorBufferPool.reset()
    }

    /// 中空四边带卷轴内外投影网格（仅 24 顶点覆盖外缘投影区与画心窄内影带，画心中央 90% 面积 0% 过绘）。
    private static func buildScrollMount(device: MTLDevice, width w: Float, height h: Float) -> (MTLBuffer, Int)? {
        guard w > 0, h > 0 else { return nil }
        let u = min(w, h)
        let padX = u * (0.082 + 0.044)
        let padY = u * (0.056 + 0.044)
        let innerW = min(u * 0.026, min(w, h) * 0.45)

        var out: [Float] = []
        out.reserveCapacity(48)
        func strip(_ x0: Float, _ y0: Float, _ x1: Float, _ y1: Float) {
            guard x1 > x0 && y1 > y0 else { return }
            out.append(contentsOf: [
                x0, y0, x1, y0, x0, y1,
                x0, y1, x1, y0, x1, y1,
            ])
        }
        strip(-padX, -padY, w + padX, innerW)
        strip(-padX, h - innerW, w + padX, h + padY)
        strip(-padX, innerW, innerW, h - innerW)
        strip(w - innerW, innerW, w + padX, h - innerW)

        guard !out.isEmpty,
              let buf = device.makeBuffer(bytes: out, length: out.count * 4, options: .storageModeShared) else { return nil }
        return (buf, out.count / 2)
    }

    /// 构建真实手绘生图卷轴装裱网格（`scroll-border-h.png` 上下宋锦绫边 + `scroll-roller-v.png` 左右紫檀滚轴与宋锦侧边 + `scroll-corner.png` 四角白玉鎏金云纹包角）：
    /// 全部位于画心外缘，0% 画心过绘，近景缩放自动视锥剔除，全视网膜分辨率纤毫毕现。
    private static func buildScrollArt(device: MTLDevice, width w: Float, height h: Float)
        -> (h: (MTLBuffer, Int)?, v: (MTLBuffer, Int)?, corners: (MTLBuffer, Int)?) {
        guard w > 0, h > 0 else { return (nil, nil, nil) }
        let u = min(w, h)
        let matH = u * 0.056
        let sideTotal = u * 0.082
        let silkW = sideTotal * 0.56
        let cornerS = u * 0.096

        func makeBuf(_ verts: [Float]) -> (MTLBuffer, Int)? {
            guard !verts.isEmpty,
                  let b = device.makeBuffer(bytes: verts, length: verts.count * 4, options: .storageModeShared) else { return nil }
            return (b, verts.count / 4)
        }
        func appendQuad(_ arr: inout [Float], x0: Float, y0: Float, x1: Float, y1: Float, u0: Float, v0: Float, u1: Float, v1: Float) {
            arr.append(contentsOf: [
                x0, y0, u0, v0,
                x1, y0, u1, v0,
                x0, y1, u0, v1,
                x0, y1, u0, v1,
                x1, y0, u1, v0,
                x1, y1, u1, v1,
            ])
        }

        // 1. 上下宋锦织锦横边（mirrorRepeat 无缝按 1024×192 原比例平铺，绝不拉伸变形）
        let uSpan = max(1.0, w / max(1.0, matH * 5.3333))
        var hVerts: [Float] = []
        appendQuad(&hVerts, x0: 0, y0: -matH, x1: w, y1: 0, u0: 0, v0: 0, u1: uSpan, v1: 1)
        appendQuad(&hVerts, x0: 0, y0: h, x1: w, y1: h + matH, u0: 0, v0: 1, u1: uSpan, v1: 0)

        // 2. 左右紫檀雕云木轴＋宋锦侧绫边（左侧原图、右侧水平镜像，绫边紧贴画心、木轴居外侧）
        var vVerts: [Float] = []
        appendQuad(&vVerts, x0: -sideTotal, y0: -matH, x1: 0, y1: h + matH, u0: 0, v0: 0, u1: 1, v1: 1)
        appendQuad(&vVerts, x0: w, y0: -matH, x1: w + sideTotal, y1: h + matH, u0: 1, v0: 0, u1: 0, v1: 1)

        // 3. 四角白玉鎏金云纹包角（严密落在四隅宋锦框上，不侵占画心分毫）
        var cVerts: [Float] = []
        appendQuad(&cVerts, x0: -silkW, y0: -matH, x1: -silkW + cornerS, y1: -matH + cornerS, u0: 0, v0: 0, u1: 1, v1: 1)
        appendQuad(&cVerts, x0: w + silkW - cornerS, y0: -matH, x1: w + silkW, y1: -matH + cornerS, u0: 1, v0: 0, u1: 0, v1: 1)
        appendQuad(&cVerts, x0: -silkW, y0: h + matH - cornerS, x1: -silkW + cornerS, y1: h + matH, u0: 0, v0: 1, u1: 1, v1: 0)
        appendQuad(&cVerts, x0: w + silkW - cornerS, y0: h + matH - cornerS, x1: w + silkW, y1: h + matH, u0: 1, v0: 1, u1: 0, v1: 0)

        return (makeBuf(hVerts), makeBuf(vVerts), makeBuf(cVerts))
    }

    func setTerrain(_ next: WorldMap, refreshSea: Bool) {
        guard next.vertices.count == map.vertices.count, next.cellCount == map.cellCount else { return }
        let work = workRevision.replaceMap()
        workRevision.installColours(work)
        workRevision.installGeometry(work)
        map = next; base = nil; shade = []; terrainBase = nil
        nationColors = next.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        let mesh = CellMesh(map: next)
        if !mesh.indices.isEmpty, let i = device.makeBuffer(bytes: mesh.indices, length: mesh.indices.count * 4, options: .storageModeShared) { indices = i; indexCount = mesh.indices.count }
        else if mesh.indices.isEmpty { indexCount = 0 }
        provinceLines = buffer(MapLayers.provinceLines(next).vertices, stride: 6)
        rivers = next.rivers.isEmpty ? nil : buffer(next.rivers, stride: 2)
        relief = buffer(MapLayers.relief(next).vertices, stride: 6)
        outlines = buffer(MapLayers.outlines(next, wide: borderWide).vertices, stride: 6)
        icons = buffer(MapLayers.cityIcons(next).vertices, stride: 6)
        if refreshSea {
            seaSource = next.seaRGBA; seaMask = MapLayers.waterlines(next); uploadSea(); seaLaneKey = []; seaLanes = nil
            ornaments = buffer(MapLayers.ornaments(next).vertices, stride: 6); fineDetail = buffer(MapLayers.fineDetail(next).vertices, stride: 6)
        }
        ink?.terrain = nil
        recolor()
    }

    @discardableResult func setSeaPorts(_ ports: [SIMD2<Float>]) -> Bool {
        guard ports != seaLaneKey else { return false }
        seaLaneKey = ports
        seaLanes = buffer(MapLayers.seaLanes(map, ports: ports.map { (x: $0.x, y: $0.y) }).vertices, stride: 6)
        if ports.isEmpty {
            portIcons = nil
        } else {
            var m = ColoredMesh()
            let u = MapLayers.cityUnit
            let shadow = RGB(hex: 0x1E140A), timber = RGB(0.46, 0.30, 0.17), deck = RGB(0.72, 0.56, 0.37)
            let navy = RGB(0.14, 0.32, 0.48), ivory = RGB(0.98, 0.96, 0.90)
            for p in ports {
                let x = p.x, y = p.y, r = 1.45 * u
                m.disc(x + 0.30 * u, y + 0.35 * u, radius: r * 1.05, shadow, alpha: 0.24, sides: 14)
                m.fill([x - 1.65 * u, y + 0.65 * u, x + 1.65 * u, y + 0.65 * u, x + 1.65 * u, y + 1.25 * u, x - 1.65 * u, y + 1.25 * u], timber, alpha: 0.94)
                m.fill([x - 1.45 * u, y + 0.75 * u, x + 1.45 * u, y + 0.75 * u, x + 1.45 * u, y + 1.05 * u, x - 1.45 * u, y + 1.05 * u], deck, alpha: 0.92)
                m.disc(x, y - 0.10 * u, radius: r, navy, alpha: 0.94, sides: 16)
                m.disc(x, y - 0.10 * u, radius: r * 0.76, ivory, alpha: 0.96, sides: 16)
                m.segment(x, y - 0.68 * u, x, y + 0.44 * u, width: 0.30 * u, navy, alpha: 0.96)
                m.segment(x - 0.46 * u, y - 0.32 * u, x + 0.46 * u, y - 0.32 * u, width: 0.24 * u, navy, alpha: 0.96)
                m.polyline([x - 0.58 * u, y + 0.16 * u, x - 0.34 * u, y + 0.42 * u, x, y + 0.50 * u, x + 0.34 * u, y + 0.42 * u, x + 0.58 * u, y + 0.16 * u], width: 0.26 * u, navy, alpha: 0.96)
            }
            portIcons = buffer(m.vertices, stride: 6)
        }
        return true
    }

    @discardableResult func setExtraRivers(_ paths: [[Float]]) -> Bool {
        guard paths != extraRiverKey else { return false }
        extraRiverKey = paths
        var m = ColoredMesh()
        for p in paths where p.count >= 4 { m.polyline(p, width: 2.6, RGB(0.23, 0.49, 0.6), alpha: 0.92) }
        extraRivers = paths.isEmpty ? nil : buffer(m.vertices, stride: 6)
        return true
    }
    private var extraRiverKey: [[Float]] = []

    private var wonderKey: [SIMD2<Float>] = []
    private var ruinKey: [SIMD2<Float>] = []
    @discardableResult func setForts(_ points: [SIMD2<Float>], holy: [SIMD2<Float>] = [], wonders: [SIMD2<Float>] = [], ruins: [SIMD2<Float>] = []) -> Bool {
        guard points != fortKey || holy != holyKey || wonders != wonderKey || ruins != ruinKey else { return false }
        fortKey = points; holyKey = holy; wonderKey = wonders; ruinKey = ruins
        var m = ColoredMesh()
        let u = MapLayers.cityUnit
        let shadow = RGB(hex: 0x1E140A), ink = RGB(0.18, 0.13, 0.09), wallLit = RGB(0.95, 0.91, 0.82), wallShade = RGB(0.76, 0.70, 0.59), seal = RGB(0.74, 0.18, 0.14)
        func rect(_ x0: Float, _ y0: Float, _ x1: Float, _ y1: Float, _ c: RGB, alpha: Float = 1) { m.fill([x0, y0, x1, y0, x1, y1, x0, y1], c, alpha: alpha) }
        for p in points {
            let x = p.x + 2.55 * u, y = p.y - 2.35 * u, w = 2.45 * u, h = 1.85 * u, k = w / 5
            rect(x - w / 2 + 0.45 * u, y - h / 2 + 0.50 * u, x + w / 2 + 0.55 * u, y + h / 2 + 0.55 * u, shadow, alpha: 0.28)
            rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, ink)
            for i in [0, 2, 4] { rect(x - w / 2 + Float(i) * k, y - h / 2 - k * 1.15, x - w / 2 + Float(i + 1) * k, y - h / 2, ink) }
            rect(x - w / 2 + k * 0.52, y - h / 2 + k * 0.52, x, y + h / 2 - k * 0.52, wallLit)
            rect(x, y - h / 2 + k * 0.52, x + w / 2 - k * 0.52, y + h / 2 - k * 0.52, wallShade)
            rect(x - k * 0.48, y + h / 2 - k * 1.85, x + k * 0.48, y + h / 2, ink)
            m.segment(x + w * 0.30, y - h * 0.5 - k * 1.1, x + w * 0.30, y - h * 0.5 - k * 2.7, width: k * 0.35, ink, alpha: 0.95)
            m.fill([x + w * 0.30, y - h * 0.5 - k * 2.7, x + w * 0.30 + k * 1.6, y - h * 0.5 - k * 2.15, x + w * 0.30, y - h * 0.5 - k * 1.6], seal, alpha: 0.96)
        }
        let gold = RGB(0.90, 0.70, 0.24), goldHi = RGB(0.99, 0.92, 0.68), pearl = RGB(0.99, 0.97, 0.91)
        for p in holy {
            let x = p.x - 2.55 * u, y = p.y - 2.35 * u
            m.disc(x + 0.35 * u, y + 0.40 * u, radius: 1.65 * u, shadow, alpha: 0.22, sides: 14)
            m.disc(x, y, radius: 2.05 * u, goldHi, alpha: 0.28, sides: 16)
            for (r, c) in [(1.72 * u, ink), (1.36 * u, gold)] {
                let k = r * 0.34, d = r * 0.70, dk = r * 0.26
                m.fill([x, y - r, x + k, y - k, x + r, y, x + k, y + k, x, y + r, x - k, y + k, x - r, y, x - k, y - k], c, alpha: 1)
                m.fill([x - d, y - d, x, y - dk, x + d, y - d, x + dk, y, x + d, y + d, x, y + dk, x - d, y + d, x - dk, y], c, alpha: 0.92)
            }
            m.disc(x, y, radius: 0.42 * u, pearl, alpha: 0.98, sides: 10)
        }
        // 已建成天下奇观：重檐金顶朱柱古阁印记（单 Pass 矢量，零贴图额外开销）
        for p in wonders {
            let x = p.x, y = p.y - 3.05 * u
            m.disc(x + 0.30 * u, y + 0.35 * u, radius: 1.95 * u, shadow, alpha: 0.24, sides: 14)
            m.disc(x, y, radius: 2.30 * u, goldHi, alpha: 0.26, sides: 16)
            // 底座与朱柱殿身
            rect(x - 1.55 * u, y + 0.55 * u, x + 1.55 * u, y + 1.12 * u, ink, alpha: 0.96)
            rect(x - 1.25 * u, y + 0.65 * u, x + 1.25 * u, y + 0.98 * u, wallLit, alpha: 0.96)
            rect(x - 1.05 * u, y - 0.55 * u, x + 1.05 * u, y + 0.58 * u, seal, alpha: 0.96)
            // 下檐 + 上檐飞角金顶
            m.fill([x - 1.85 * u, y - 0.35 * u, x, y - 1.25 * u, x + 1.85 * u, y - 0.35 * u], ink, alpha: 0.96)
            m.fill([x - 1.52 * u, y - 0.45 * u, x, y - 1.12 * u, x + 1.52 * u, y - 0.45 * u], gold, alpha: 0.98)
            m.fill([x - 1.22 * u, y - 1.12 * u, x, y - 2.05 * u, x + 1.22 * u, y - 1.12 * u], ink, alpha: 0.96)
            m.fill([x - 0.92 * u, y - 1.18 * u, x, y - 1.88 * u, x + 0.92 * u, y - 1.18 * u], goldHi, alpha: 0.98)
            m.disc(x, y - 2.08 * u, radius: 0.34 * u, gold, alpha: 1.0, sides: 10)
        }
        // 已发掘四海古迹秘境：古铜青玉八角星碑
        let bronze = RGB(0.58, 0.43, 0.24), jade = RGB(0.24, 0.56, 0.46)
        for p in ruins {
            let x = p.x + 2.35 * u, y = p.y + 2.25 * u
            m.disc(x + 0.22 * u, y + 0.26 * u, radius: 1.35 * u, shadow, alpha: 0.20, sides: 12)
            let r1 = 1.48 * u, r2 = 1.12 * u
            m.fill([x, y - r1, x + r1, y, x, y + r1, x - r1, y], ink, alpha: 0.92)
            m.fill([x, y - r2, x + r2, y, x, y + r2, x - r2, y], bronze, alpha: 0.96)
            m.disc(x, y, radius: 0.48 * u, jade, alpha: 0.98, sides: 10)
        }
        forts = buffer(m.vertices, stride: 6)
        return true
    }

    private func uploadSea() {
        guard !released, let sea, map.seaWidth > 0, map.seaHeight > 0,
              sea.width == map.seaWidth, sea.height == map.seaHeight,
              seaSource.count == map.seaWidth * map.seaHeight * 4 else { return }
        var bytes = MapPalette.recolorSea(seaSource, from: .warmPaper, to: MapPalette.ocean(display.ocean))
        if display.mapDetail ?? true {
            MapLayers.applySeaWash(width: map.seaWidth, height: map.seaHeight, to: &bytes)
            MapLayers.applyWaterlines(seaMask, to: &bytes)
        }
        bytes.withUnsafeBytes { raw in
            if let base = raw.baseAddress {
                sea.replace(region: MTLRegionMake2D(0, 0, map.seaWidth, map.seaHeight), mipmapLevel: 0, withBytes: base, bytesPerRow: map.seaWidth * 4)
            }
        }
    }

    func setMap(_ next: WorldMap, replayFast: Bool = false, skipStatic: Bool = false, skipOutlines: Bool = false, animateColors: Bool? = nil) {
        // 硬隔离：setMap 仅用于同一地图网格的疆域/国色更新，严禁跨拓扑传入新世界（否则旧 terrainBase/positions 长度失配会瞬间越界闪退）。
        guard !released, next.vertices.count == map.vertices.count, next.cellCount == map.cellCount else { return }
        let work = workRevision.replaceMap()
        let noStatic = replayFast || skipStatic
        let doFade = animateColors ?? !replayFast
        ink?.scrubbingReplay = skipOutlines
        if !coastRefined && !next.coast.isEmpty {
            coastRefined = true
            DispatchQueue.global(qos: .utility).async { [weak self] in
                guard self != nil else { return }
                let mask = MapLayers.waterlines(next), marks = MapLayers.ornaments(next).vertices
                DispatchQueue.main.async { [weak self] in
                    guard let self, !self.released, self.sea != nil, self.map.vertices.count == next.vertices.count else { return }
                    self.seaSource = next.seaRGBA; self.seaMask = mask; self.ornaments = self.buffer(marks, stride: 6); self.uploadSea(); self.onOutlines?()
                }
            }
        }
        map = next
        nationColors = next.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        let capitals = next.meta.nations.map(\.capital)
        let rebuildIcons = !noStatic && (icons == nil || capitals != lastCapitalKey)
        if rebuildIcons { lastCapitalKey = capitals }
        let wide = borderWide
        let inputs = BaseInputs(mode: mode, nationColors: nationColors, highlight: highlight, tint: tint, fills: fills, density: Float(display.colorDensity), terrain: terrainBase, shade: shade)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard self != nil else { return }
            let vertices = skipOutlines ? nil : MapLayers.outlines(next, wide: wide).vertices
            let marks = rebuildIcons ? MapLayers.cityIcons(next).vertices : nil
            let colours = MapRenderer.baseColors(next, inputs)
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.released, self.workRevision.acceptsGeometry(work) else { return }
                if let vertices, self.workRevision.acceptsOutlineGeometry(work) { self.outlines = self.buffer(vertices, stride: 6) }
                if let marks { self.icons = self.buffer(marks, stride: 6) }
                self.workRevision.installGeometry(work)
                if self.terrainBase == nil { self.terrainBase = colours.terrainBase }
                if self.shade.isEmpty { self.shade = colours.shade }
                if self.workRevision.acceptsColours(work) {
                    self.workRevision.installColours(work)
                    self.base = (colours.land, colours.terrain, next.meta.provinces.map(\.nation), inputs.nationColors)
                    self.fadeOnRecolor = doFade
                    self.recolor()
                    self.fadeOnRecolor = false
                }
                self.onOutlines?()
            }
        }
    }

    struct BaseInputs {
        let mode: MapMode; let nationColors: [RGB]; let highlight: Int?; let tint: [Int: RGB]; let fills: [RGB]?
        let density: Float; let terrain: [Float]?; let shade: [Float]
    }
    static func baseColors(_ map: WorldMap, _ i: BaseInputs) -> (land: [Float], terrain: [Float], terrainBase: [Float], shade: [Float]) {
        var c = CellMesh.colors(map: map, mode: i.mode, nationColors: i.nationColors, highlightProvince: i.highlight, tint: i.tint, provinceColors: i.mode == .political ? i.fills : nil)
        let terrainBase = (i.terrain?.count == c.count ? i.terrain : nil) ?? CellMesh.colors(map: map, mode: .terrain, nationColors: i.nationColors)
        var terrain = terrainBase
        if i.mode == .political && i.density < 1 {
            let k = i.fills != nil ? max(0.84, i.density) : max(0, i.density)
            for j in 0..<min(c.count, terrain.count) where j % 4 != 3 { c[j] = terrain[j] + (c[j] - terrain[j]) * k }
        }
        let shade = i.shade.count == map.vertices.count / 2 ? i.shade : MapLayers.vertexHillshade(map)
        let safeLimit = min(shade.count, c.count / 4, terrain.count / 4)
        for v in 0..<safeLimit {
            let k = shade[v], o = v * 4
            for j in 0..<3 { c[o + j] = min(1, c[o + j] * k); terrain[o + j] = min(1, terrain[o + j] * k) }
        }
        return (c, terrain, terrainBase, shade)
    }

    private var workRevision = MapWorkRevision()
    private var lastCapitalKey: [Int] = []
    private var borderWide = Set<Int>()
    func setBorderEmphasis(_ wide: Set<Int>) {
        guard !released, wide != borderWide else { return }
        borderWide = wide
        let work = workRevision.changeOutlines()
        let next = map
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard self != nil else { return }
            let vertices = MapLayers.outlines(next, wide: wide).vertices
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.released, self.workRevision.acceptsOutlineGeometry(work) else { return }
                self.outlines = self.buffer(vertices, stride: 6)
                self.onOutlines?()
            }
        }
    }
    var onOutlines: (() -> Void)?

    private(set) var reveal: Float = 1
    func setReveal(_ t: Float) {
        reveal = max(0, min(1, t))
        if base == nil { recolor() }
    }
    private(set) var base: (land: [Float], terrain: [Float], owners: [Int], palette: [RGB])? { didSet { revealTerrain = nil } }
    private var revealFields: MTLBuffer?
    private var revealFieldData: [Float]?
    private var revealTerrain: MTLBuffer?
    private func revealBuffers() -> (fields: MTLBuffer, terrain: MTLBuffer)? {
        guard let base else { return nil }
        if revealTerrain == nil { revealTerrain = Self.makeSafeBuffer(device: device, base.terrain, minLength: 16) }
        if revealFields == nil {
            var data = revealFieldData ?? []
            if data.count != map.vertices.count { data = MapLayers.revealFields(map) }
            revealFieldData = nil
            revealFields = Self.makeSafeBuffer(device: device, data, minLength: 16)
        }
        guard let a = revealFields, let b = revealTerrain else { return nil }
        return (a, b)
    }

    private(set) var display = DisplaySettings()
    func setDisplay(_ d: DisplaySettings) {
        let recolour = d.colorDensity != display.colorDensity
        let seaChanged = d.ocean != display.ocean, detailChanged = d.mapDetail != display.mapDetail
        display = d
        if seaChanged || detailChanged { uploadSea() }
        if recolour { rebuildAppearance() }
    }

    private func recolor() {
        if base == nil {
            var c = CellMesh.colors(map: map, mode: mode, nationColors: nationColors, highlightProvince: highlight, tint: tint, provinceColors: mode == .political ? fills : nil)
            if terrainBase?.count != c.count { terrainBase = CellMesh.colors(map: map, mode: .terrain, nationColors: nationColors) }
            var terrain = terrainBase ?? CellMesh.colors(map: map, mode: .terrain, nationColors: nationColors)
            if mode == .political && display.colorDensity < 1 {
                let k = fills != nil ? Float(max(0.84, display.colorDensity)) : Float(max(0, display.colorDensity))
                for i in 0..<min(c.count, terrain.count) where i % 4 != 3 { c[i] = terrain[i] + (c[i] - terrain[i]) * k }
            }
            if shade.count != map.vertices.count / 2 { shade = MapLayers.vertexHillshade(map) }
            let safeLimit = min(shade.count, c.count / 4, terrain.count / 4)
            for v in 0..<safeLimit {
                let k = shade[v], o = v * 4
                for j in 0..<3 {
                    c[o + j] = min(1, c[o + j] * k)
                    terrain[o + j] = min(1, terrain[o + j] * k)
                }
            }
            base = (c, terrain, map.meta.provinces.map(\.nation), nationColors)
        }
        guard let base else { return }
        let c = base.land
        guard c.count == vertexCount * 4 else { return }
        let colourBytes = c.count * MemoryLayout<Float>.stride
        let uploaded = colorBufferPool.write(device: device, length: max(16, colourBytes)) { buffer in
            c.withUnsafeBytes { raw in
                if let ptr = raw.baseAddress { memcpy(buffer.contents(), ptr, colourBytes) }
            }
        }
        if let b = uploaded {
            let now = clock(), began = CACurrentMediaTime()
            defer { if let probe = Self.frameProbe, fadeOnRecolor { probe.recolor.append((CACurrentMediaTime() - began) * 1000) } }
            let fade = fadeOnRecolor && reveal >= 1 && colors.length == b.length
            let handed = fade ? washHandover(next: c, owners: base.owners, now: now) : []
            let vp = washTopology?.vertexProvince
            landFade.set(c, at: now, fade: fade, instant: { v in
                guard !handed.isEmpty, let vp, v < vp.count else { return false }
                return handed.contains(Int(vp[v]))
            })
            if !fade && reveal >= 1 && washViewSwitch { washViewChanged() }
            rebuildInkOwners()
            if landFade.fading(at: now) {
                let previousBytes = landFade.from.count * MemoryLayout<Float>.stride
                previousColors = prevColorBufferPool.write(device: device, length: max(16, previousBytes)) { pb in
                    landFade.from.withUnsafeBytes { raw in
                        if let ptr = raw.baseAddress { memcpy(pb.contents(), ptr, previousBytes) }
                    }
                }
            } else { previousColors = nil }
            colors = b
        }
    }
    private let colorBufferPool = MapBufferPool()
    private let prevColorBufferPool = MapBufferPool()
    private(set) var shade: [Float] = []
    private(set) var terrainBase: [Float]?

    static func texture(_ device: MTLDevice, _ image: CGImage) -> MTLTexture? {
        let w = image.width, h = image.height
        guard w > 0, h > 0 else { return nil }
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: w, height: h, mipmapped: false)
        guard let t = device.makeTexture(descriptor: d) else { return nil }
        t.replace(region: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0, withBytes: bytes, bytesPerRow: w * 4)
        return t
    }

    struct ArmySprite: Equatable {
        var army: Int; var x: Float; var y: Float; var unit: String; var nation: Int; var selected: Bool; var key = ""; var tier = 1; var banner = 0; var reorganizing = false
        var fighting = false
        var retreating = false
        var culture: String = ""
        var embarked: Bool = false
        var startX: Float? = nil
        var startY: Float? = nil
    }

    private var unitTextures: [String: MTLTexture] = [:]
    private var route: (buffer: MTLBuffer, count: Int)?
    private(set) var armySprites: [ArmySprite] = []
    private var dying: [ArmySprite] = []
    var deathDelays: [String: Double] = [:]
    private var routePoints: [SIMD2<Float>] = []
    private var legFrom: [String: SIMD2<Float>] = [:]
    private var legTo: [String: SIMD2<Float>] = [:]
    private var legStart: CFTimeInterval = 0
    private var legLength: CFTimeInterval = 0.3
    private var fresh = Set<String>()
    private var chasing = false
    var tweenDuration: CFTimeInterval = 0.3
    var tweenEase = true
    var isAnimating: Bool { chasing || fading || washesAnimating }

    private var cachedPlacedSprites: [(sprite: ArmySprite, x: Float, y: Float)] = []
    private var cachedPlacedSpritesTime: CFTimeInterval = -1
    private var cachedPlacedSpritesRevision: UInt64 = 0
    private var armySpritesRevision: UInt64 = 0

    private func progress(_ now: CFTimeInterval) -> Float {
        guard now.isFinite, legStart.isFinite, legLength.isFinite, legLength > 1e-6 else { return 1 }
        return Float(min(1, max(0, (now - legStart) / legLength)))
    }
    func displayedPoint(_ s: ArmySprite) -> SIMD2<Float> { displayed(s) }
    private func displayed(_ s: ArmySprite) -> SIMD2<Float> {
        displayed(s, progress: progress(pinnedFrameTime ?? CACurrentMediaTime()))
    }
    private func displayed(_ s: ArmySprite, progress t: Float) -> SIMD2<Float> {
        guard !s.key.isEmpty, let a = legFrom[s.key], let b = legTo[s.key] else {
            return (s.x.isFinite && s.y.isFinite) ? SIMD2(s.x, s.y) : .zero
        }
        if t >= 1 {
            return (b.x.isFinite && b.y.isFinite) ? b : ((s.x.isFinite && s.y.isFinite) ? SIMD2(s.x, s.y) : .zero)
        }
        return Self.hermite(a, b, legLead[s.key] ?? (b - a), t)
    }
    static func hermite(_ a: SIMD2<Float>, _ b: SIMD2<Float>, _ m0: SIMD2<Float>, _ t: Float) -> SIMD2<Float> {
        let fallback = (b.x.isFinite && b.y.isFinite) ? b : ((a.x.isFinite && a.y.isFinite) ? a : SIMD2<Float>(0, 0))
        guard a.x.isFinite, a.y.isFinite, b.x.isFinite, b.y.isFinite, m0.x.isFinite, m0.y.isFinite, t.isFinite else { return fallback }
        let clamped = min(1, max(0, t))
        let t2 = clamped * clamped, t3 = t2 * clamped
        let p = a * (2 * t3 - 3 * t2 + 1) + m0 * (t3 - 2 * t2 + clamped) + b * (3 * t2 - 2 * t3) + (b - a) * (t3 - t2)
        return (p.x.isFinite && p.y.isFinite) ? p : fallback
    }
    private var legLead: [String: SIMD2<Float>] = [:]
    private var lastLegVelocity: [String: (vel: SIMD2<Float>, time: CFTimeInterval)] = [:]
    private(set) var spread: [String: SIMD2<Float>] = [:]
    private func advanceChase(at time: CFTimeInterval) -> Float {
        let t = progress(time)
        chasing = t < 1
        return t
    }

    static func iconZoom(_ scale: Double) -> Double {
        let safeScale = (scale.isFinite && scale > 0) ? scale : 1
        return 1.12 * min(21.0 / 3.0112, max(6.8 / 3.0112, safeScale * 0.66))
    }
    static func iconPoints(_ scale: Double, iconScale: Double) -> Double {
        let safeIcon = (iconScale.isFinite && iconScale > 0) ? iconScale : 1
        return 2.56 * 0.84 * 0.35 * (1600.0 / 240.0) * 0.6 * safeIcon * iconZoom(scale)
    }
    /// Returns current army world positions, caching settled positions (when spline animation has completed)
    /// and same-frame queries so interactive pan/fling never recomputes Hermite splines for every army.
    func placedSprites() -> [(sprite: ArmySprite, x: Float, y: Float)] {
        guard !armySprites.isEmpty else { return [] }
        let now = pinnedFrameTime ?? CACurrentMediaTime()
        let t = progress(now)
        if cachedPlacedSpritesRevision == armySpritesRevision && cachedPlacedSpritesTime >= 0 {
            if (t >= 1 && cachedPlacedSpritesTime == .infinity) || cachedPlacedSpritesTime == now {
                return cachedPlacedSprites
            }
        }
        let result: [(sprite: ArmySprite, x: Float, y: Float)]
        if t >= 1 {
            result = armySprites.map { s in
                let p: SIMD2<Float>
                if !s.key.isEmpty, let b = legTo[s.key], b.x.isFinite, b.y.isFinite {
                    p = b
                } else if s.x.isFinite && s.y.isFinite {
                    p = SIMD2(s.x, s.y)
                } else {
                    p = .zero
                }
                return (s, p.x, p.y)
            }
            cachedPlacedSprites = result
            cachedPlacedSpritesRevision = armySpritesRevision
            cachedPlacedSpritesTime = .infinity
        } else {
            result = armySprites.map { s in
                let p = displayed(s, progress: t)
                return (s, p.x, p.y)
            }
            cachedPlacedSprites = result
            cachedPlacedSpritesRevision = armySpritesRevision
            cachedPlacedSpritesTime = now
        }
        return result
    }

    func setArmies(_ rawSprites: [ArmySprite], route rawPoints: [SIMD2<Float>], snap: Bool = false) {
        let sprites = rawSprites.filter { $0.x.isFinite && $0.y.isFinite }
        let points = rawPoints.filter { $0.x.isFinite && $0.y.isFinite }
        if snap || sprites != armySprites {
            let now = CACurrentMediaTime(), t = progress(now)
            let previous = Dictionary(armySprites.map { ($0.key, $0.reorganizing) }, uniquingKeysWith: { a, _ in a })
            var from = [String: SIMD2<Float>](), to = [String: SIMD2<Float>](), fading = Set<String>(), lead = [String: SIMD2<Float>]()
            var nextVel = [String: (vel: SIMD2<Float>, time: CFTimeInterval)]()
            let safeTween = tweenDuration.isFinite ? tweenDuration : 0.3
            let newLength = snap ? 0 : max(0.055, safeTween)
            for s in sprites where !s.key.isEmpty {
                let target = SIMD2(s.x, s.y)
                if !snap, let sx = s.startX, let sy = s.startY, sx.isFinite, sy.isFinite {
                    let origin = SIMD2(sx, sy)
                    from[s.key] = origin; to[s.key] = target
                    lead[s.key] = (target - origin) * 0.55
                    continue
                }
                let here: SIMD2<Float>? = snap ? nil : legFrom[s.key].flatMap { a in legTo[s.key].map { b in Self.hermite(a, b, legLead[s.key] ?? (b - a), t) } }
                guard let p = here, p.x.isFinite, p.y.isFinite else {
                    from[s.key] = target; to[s.key] = target
                    if !snap && !armySprites.isEmpty { fading.insert(s.key) }
                    continue
                }
                if s.reorganizing && previous[s.key] != true {
                    from[s.key] = target; to[s.key] = target; fading.insert(s.key)
                } else {
                    let chord = target - p, along = (chord.x * chord.x + chord.y * chord.y).squareRoot()
                    if !along.isFinite || along > 120 {
                        // 军团远距重整/瞬移时直接落位，避免拖出横贯全图的残影。
                        from[s.key] = target; to[s.key] = target
                        continue
                    }
                    from[s.key] = p; to[s.key] = target
                    if newLength > 1e-5, along > 0.001 {
                        nextVel[s.key] = (chord / Float(newLength), now)
                    }
                    var carriedPerSec: SIMD2<Float>? = nil
                    if let a = legFrom[s.key], let b = legTo[s.key], legLength > 1e-5, t < 0.995 {
                        let m0 = legLead[s.key] ?? (b - a), t2 = t * t
                        let v = a * (6 * t2 - 6 * t) + m0 * (3 * t2 - 4 * t + 1) + b * (6 * t - 6 * t2) + (b - a) * (3 * t2 - 2 * t)
                        carriedPerSec = v / Float(legLength)
                    } else if let prev = lastLegVelocity[s.key], now - prev.time < 0.45 {
                        carriedPerSec = prev.vel
                    }
                    if let vPerSec = carriedPerSec, newLength > 1e-5 {
                        var m = vPerSec * Float(newLength)
                        let k = (m.x * m.x + m.y * m.y).squareRoot()
                        let denom = k * along
                        if along < 0.001 || k < 0.0001 || !k.isFinite || !denom.isFinite || denom < 1e-9 {
                            m = .zero
                        } else {
                            let cos = (m.x * chord.x + m.y * chord.y) / denom
                            if !cos.isFinite || cos < 0.45 {
                                m = chord
                            } else {
                                let w = (cos - 0.45) / 0.55
                                m = m * w + chord * (1 - w)
                                let k2 = (m.x * m.x + m.y * m.y).squareRoot()
                                if k2.isFinite && k2 > 1e-6 && k2 > along * 1.05 { m *= (along * 1.05) / k2 }
                            }
                        }
                        if m.x.isFinite && m.y.isFinite { lead[s.key] = m }
                    }
                }
            }
            lastLegVelocity = nextVel
            var gone = [ArmySprite]()
            if !snap {
                let keys = Set(sprites.map(\.key))
                for s in armySprites where !s.key.isEmpty && !keys.contains(s.key) && s.army > -100_000 && gone.count < 40 {
                    var g = s
                    let p = legFrom[s.key].flatMap { a in legTo[s.key].map { b in Self.hermite(a, b, legLead[s.key] ?? (b - a), t) } } ?? SIMD2(s.x, s.y)
                    g.key = "✝" + s.key; g.x = p.x; g.y = p.y; g.selected = false; g.fighting = false
                    from[g.key] = p; to[g.key] = p; gone.append(g)
                }
            }
            dying = gone
            legFrom = from; legTo = to; legLead = lead; fresh = fading
            legStart = now; legLength = newLength
            armySprites = sprites
            armySpritesRevision &+= 1
            cachedPlacedSprites.removeAll(keepingCapacity: true)
            cachedPlacedSpritesTime = -1
            chasing = !snap
            rebuildArmies()
        }
        if points != routePoints {
            routePoints = points
            var mesh = ColoredMesh()
            let ink = RGB(0.55, 0.12, 0.08)
            for (a, b) in zip(points, points.dropFirst()) { mesh.segment(a.x, a.y, b.x, b.y, width: 1.1, ink, alpha: 0.85) }
            route = buffer(mesh.vertices, stride: 6)
        }
    }

    private func rebuildArmies() {
        let sprites = armySprites + dying
        let ghosts = Set(dying.map(\.key))
        let iconSize = Float(2.56 * 0.84 * 0.35 * (1600.0 / 240.0) * 0.6)
        var byRole: [String: [Float]] = [:]
        byRole.reserveCapacity(16)
        var fade: Float = 1
        var end = SIMD2<Float>(0, 0)
        var lead = SIMD2<Float>(0, 0)
        func quad(_ role: String, _ at: SIMD2<Float>, _ c: RGB, _ size: Float, _ sx: Float, _ sy: Float) {
            for (cx, cy) in [(Float(-0.5), Float(-0.5)), (0.5, -0.5), (-0.5, 0.5), (-0.5, 0.5), (0.5, -0.5), (0.5, 0.5)] {
                byRole[role, default: []].append(contentsOf: [at.x, at.y, cx, cy, c.r, c.g, c.b, fade, size, end.x, end.y, sx, sy, lead.x, lead.y])
            }
        }
        var spread = [String: SIMD2<Float>]()
        do {
            let cell = max(0.001, iconSize * iconScale * 0.6)
            var cluster = [SIMD2<Int32>: [Int]]()
            for (i, a) in sprites.enumerated() where a.army >= 0 && !ghosts.contains(a.key) && (legFrom[a.key] ?? SIMD2(a.x, a.y)) == (legTo[a.key] ?? SIMD2(a.x, a.y)) {
                let e = legTo[a.key] ?? SIMD2(a.x, a.y)
                guard e.x.isFinite && e.y.isFinite else { continue }
                let gx = max(-1_000_000, min(1_000_000, (e.x / cell).rounded()))
                let gy = max(-1_000_000, min(1_000_000, (e.y / cell).rounded()))
                cluster[SIMD2(Int32(gx), Int32(gy)), default: []].append(i)
            }
            for var list in cluster.values where list.count > 1 {
                list.sort { sprites[$0].key < sprites[$1].key }
                let radius: Float = list.count <= 3 ? 0.42 : list.count <= 6 ? 0.6 : 0.78
                for (j, i) in list.enumerated() {
                    let angle = Float(j) / Float(list.count) * 2 * .pi - .pi / 2
                    spread[sprites[i].key] = SIMD2(cos(angle) * radius, sin(angle) * radius)
                }
            }
        }
        for a in sprites where a.army >= 0 && spread[a.key] == nil && !ghosts.contains(a.key) {
            if let was = self.spread[a.key], (legFrom[a.key] ?? .zero) != (legTo[a.key] ?? .zero) { spread[a.key] = was }
        }
        self.spread = spread
        for a in sprites {
            fade = ghosts.contains(a.key) ? -2 - Float(min(0.85, max(0, (deathDelays[String(a.key.dropFirst())] ?? 0) / max(0.05, legLength)))) : fresh.contains(a.key) ? -1 : a.fighting ? 2 : a.retreating ? 0.55 : a.army <= -100_000 ? 0.99 : 1
            let o = spread[a.key] ?? SIMD2<Float>(0, 0)
            let c = a.selected ? RGB(1, 0.93, 0.55) : nationColors.indices.contains(a.nation) ? nationColors[a.nation] : RGB(1, 1, 1)
            let role = UnitArt.role(a.unit), at = legFrom[a.key] ?? SIMD2(a.x, a.y)
            end = legTo[a.key] ?? at
            lead = legLead[a.key] ?? (end - at)
            let size = iconSize * iconScale * (a.unit == "Port" ? 0.7 : a.unit == "Merchant" ? 0.75 : 1) * (a.selected ? 1.3 : 1)
            let resolvedRole: String = (a.embarked || a.unit == "Transport") ? "Transport" : role
            let isNavalPiece = (resolvedRole == "Fleet" || resolvedRole == "Transport")

            if a.banner > 0 {
                let k: Float = 0.62
                quad("banner", at, a.banner == 2 ? RGB(0.95, 0.76, 0.24) : RGB(0.78, 0.20, 0.14), size * k, (0.52 + o.x) / k, (-0.42 + o.y) / k)
            }
            if isNavalPiece, unitTextures["0fleetwake"] != nil {
                quad("0fleetwake", at, RGB(0.95, 0.98, 1.0), size * 1.24, o.x / 1.24, (0.22 + o.y) / 1.24)
            }
            let token = !isNavalPiece && role != "Port" && role != "Merchant" && a.army > -100_000 && unitTextures["0plate"] != nil
            if token {
                quad("0plate", at, c, size * 0.98, o.x / 0.98, (0.14 + o.y) / 0.98)
            }
            let piece: RGB = token
                ? RGB(0.86 + c.r * 0.14, 0.86 + c.g * 0.14, 0.86 + c.b * 0.14)
                : (isNavalPiece ? RGB(min(1, c.r * 1.10 + 0.12), min(1, c.g * 1.10 + 0.12), min(1, c.b * 1.10 + 0.12)) : c)
            let n = role == "Port" || a.army <= -100_000 ? 1 : max(1, min(3, a.tier))
            let layout: [(Float, Float, Float)] = {
                if isNavalPiece {
                    return n == 1 ? [(0, 0, 1.08)]
                        : n == 2 ? [(-0.32, -0.14, 0.78), (0.10, 0.04, 1.08)]
                        : [(-0.38, -0.10, 0.74), (0.38, -0.10, 0.74), (0, 0.06, 1.10)]
                }
                return n == 1 ? [(0, -0.06, 1)] : n == 2 ? [(0.26, -0.16, 0.74), (0, -0.04, 1)]
                    : [(-0.28, -0.16, 0.70), (0.28, -0.16, 0.70), (0, -0.04, 1)]
            }()
            for (i, (dx, dy, k)) in layout.enumerated() {
                let shade: Float = i < layout.count - 1 && n > 1 ? 0.90 : 1
                quad(resolvedRole, at, RGB(piece.r * shade, piece.g * shade, piece.b * shade), size * k, (dx + o.x) / k, (dy + o.y) / k)
            }
        }
        func roleLayerOrder(_ key: String) -> Int {
            switch key {
            case "0fleetwake": return 0
            case "banner": return 1
            case "0plate": return 2
            default: return 3
            }
        }
        units = byRole.keys.sorted {
            let oa = roleLayerOrder($0), ob = roleLayerOrder($1)
            return oa != ob ? oa < ob : $0 < $1
        }.compactMap { role -> (texture: MTLTexture, buffer: MTLBuffer, count: Int, pool: MapBufferPool)? in
            guard let data = byRole[role], !data.isEmpty, let texture = unitTextures[role] else { return nil }
            let byteLen = data.count * MemoryLayout<Float>.stride
            let pool = unitBufferPool[role] ?? MapBufferPool()
            unitBufferPool[role] = pool
            let uploaded = pool.write(device: device, length: byteLen, capacity: max(256, byteLen * 3 / 2)) { buffer in
                data.withUnsafeBytes { raw in
                    if let base = raw.baseAddress { memcpy(buffer.contents(), base, byteLen) }
                }
            }
            guard let buffer = uploaded else { return nil }
            return (texture: texture, buffer: buffer, count: data.count / 15, pool: pool)
        }
    }
    private var unitBufferPool: [String: MapBufferPool] = [:]

    var showArmies = true
    var iconScale: Float = 1 { didSet { if iconScale != oldValue { rebuildArmies() } } }
    static var prepared: MapLayers.Prepared?

    /// 局部天时灾异地貌着染表（最多 12 处，纯解析距离无噪声，0 处时片元跳过循环零开销）。
    private var weatherUniforms: [SIMD4<Float>] = Array(repeating: .zero, count: 13)
    func setWeatherZones(_ zones: [(x: Float, y: Float, radius: Float, kind: Float)]) {
        var next = [SIMD4<Float>](repeating: .zero, count: 13)
        let capped = min(12, zones.count)
        next[0] = SIMD4(Float(capped), 0, 0, 0)
        for i in 0..<capped {
            let z = zones[i]
            next[i + 1] = SIMD4(z.x, z.y, max(24, z.radius), z.kind)
        }
        weatherUniforms = next
    }

    private func buffer(_ data: [Float], stride: Int) -> (MTLBuffer, Int)? {
        guard stride > 0, !data.isEmpty, let b = device.makeBuffer(bytes: data, length: data.count * 4, options: .storageModeShared) else { return nil }
        return (b, data.count / stride)
    }

    func setAppearance(mode: MapMode, highlight: Int?, tint: [Int: RGB] = [:], fills: [RGB]? = nil, view: String = "") {
        guard mode != self.mode || highlight != self.highlight || tint != self.tint || fills != self.fills || view != viewKey else { return }
        let data = mode == self.mode && highlight == self.highlight && tint == self.tint && view == viewKey && fills != nil && self.fills != nil
        let highlightOnly = mode == self.mode && tint == self.tint && fills == self.fills && view == viewKey
        self.mode = mode; self.highlight = highlight; self.tint = tint; self.fills = fills; viewKey = view
        rebuildAppearance(fade: data, viewSwitch: !data && !highlightOnly)
    }
    private var washViewSwitch = false
    private func rebuildAppearance(fade: Bool = false, viewSwitch: Bool = true) {
        guard !released else { return }
        let work = workRevision.changeAppearance(), map = self.map
        let inputs = BaseInputs(mode: mode, nationColors: nationColors, highlight: highlight, tint: tint, fills: fills, density: Float(display.colorDensity), terrain: terrainBase, shade: shade)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard self != nil else { return }
            let colours = MapRenderer.baseColors(map, inputs)
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.released, self.workRevision.acceptsColours(work) else { return }
                self.workRevision.installColours(work)
                if self.terrainBase == nil { self.terrainBase = colours.terrainBase }
                if self.shade.isEmpty { self.shade = colours.shade }
                self.base = (colours.land, colours.terrain, map.meta.provinces.map(\.nation), inputs.nationColors)
                self.fadeOnRecolor = fade
                self.washViewSwitch = viewSwitch
                self.recolor()
                self.washViewSwitch = false
                self.fadeOnRecolor = false
                self.onOutlines?()
            }
        }
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    /// 在 CPU 单次预算出四季色温系数与四季权重 `(winter, spring, summer, autumn)`，海陆片元零三角函数、零噪声运算。
    /// 政区模式下陆地色温严格克制（≤ ±3.5%），杜绝秋冬白雪/赭染把列国国色盖灰或混色；地形模式保留饱满四季色貌。
    private static func seasonalTints(phase: Float, lighting: Float, terrainMode: Bool) -> (land: SIMD4<Float>, sea: SIMD4<Float>, weights: SIMD4<Float>) {
        guard lighting.isFinite, phase.isFinite, lighting > 0.01, phase >= 0 else { return (SIMD4(1, 1, 1, 1), SIMD4(1, 1, 1, 1), SIMD4(0, 0, 0, 0)) }
        let ang = phase * Float.pi * 2
        func smooth(_ a: Float, _ b: Float, _ x: Float) -> Float {
            let t = max(0, min(1, (x - a) / (b - a)))
            return t * t * (3 - 2 * t)
        }
        let wWinter = smooth(-0.14, 0.84, cos(ang))
        let wSpring = smooth(-0.14, 0.84, sin(ang))
        let wSummer = smooth(-0.14, 0.84, -cos(ang))
        let wAutumn = smooth(-0.14, 0.84, -sin(ang))
        let wSum = max(0.001, wWinter + wSpring + wSummer + wAutumn)
        let nW = wWinter / wSum, nSp = wSpring / wSum, nSu = wSummer / wSum, nA = wAutumn / wSum

        let landS = SIMD3<Float>(0.956, 1.058, 0.980) * nSp
            + SIMD3<Float>(1.052, 1.028, 0.924) * nSu
            + SIMD3<Float>(1.118, 0.982, 0.846) * nA
            + SIMD3<Float>(0.916, 0.962, 1.074) * nW
        let seaS = SIMD3<Float>(0.946, 1.052, 1.024) * nSp
            + SIMD3<Float>(1.024, 1.044, 0.978) * nSu
            + SIMD3<Float>(1.054, 0.974, 0.916) * nA
            + SIMD3<Float>(0.896, 0.950, 1.078) * nW
        let kLand = min(1, lighting) * (terrainMode ? 0.92 : 0.28)
        let kSea = min(1, lighting) * 0.88
        let lt = SIMD3<Float>(1, 1, 1) + (landS - SIMD3<Float>(1, 1, 1)) * kLand
        let st = SIMD3<Float>(1, 1, 1) + (seaS - SIMD3<Float>(1, 1, 1)) * kSea
        return (SIMD4(lt.x, lt.y, lt.z, 1), SIMD4(st.x, st.y, st.z, 1), SIMD4(nW, nSp, nSu, nA))
    }

    func draw(in view: MTKView) {
        guard !released else { return }
        let size = view.bounds.size
        guard size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else { return }
        guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable, let buffer = queue.makeCommandBuffer() else { return }
        let now = CACurrentMediaTime()
        if let pinned = pinnedFrameTime, pinned.isFinite, abs(now - pinned) < 0.05 {
            frameTime = pinned
        } else {
            frameTime = now
        }
        pinnedFrameTime = nil
        let probe = Self.frameProbe
        var spriteProgress: Float = advanceChase(at: frameTime)
        if !camera.isValid {
            camera = MapCamera.cover(map: (Double(map.width), Double(map.height)), viewport: (Double(size.width), Double(size.height)))
        }
        let targetTex = pass.colorAttachments[0].texture ?? drawable.texture
        let dw = min(targetTex.width, drawable.texture.width), dh = min(targetTex.height, drawable.texture.height)
        guard dw > 0, dh > 0 else { return }

        let lightStrength: Float = (display.lighting ?? true) ? (Energy.hot ? 0.55 : 1.0) : 0.0
        let isTerrainMode = (mode == .terrain)
        let tints = Self.seasonalTints(phase: seasonPhase, lighting: lightStrength, terrainMode: isTerrainMode)
        var u = Uniforms(
            viewport: SIMD2(Float(size.width), Float(size.height)),
            center: SIMD2(Float(camera.centerX), Float(camera.centerY)),
            scale: Float(camera.scale),
            halfWidth: 0,
            alpha: 1,
            time: Float(frameTime.truncatingRemainder(dividingBy: 3600)),
            lighting: lightStrength,
            mapWidth: max(1, map.width),
            mapHeight: max(1, map.height),
            pad: seasonPhase,
            iconZoom: Float(Self.iconZoom(camera.scale)),
            pad2: isTerrainMode ? 1.0 : 0.0,
            pad3: 0,
            pad4: 0,
            landTint: tints.land,
            seaTint: tints.sea,
            seasonWeights: tints.weights
        )
        let uniformLength = MemoryLayout<Uniforms>.stride
        let fullScissor = MTLScissorRect(x: 0, y: 0, width: dw, height: dh)

        let vpW = Double(size.width), vpH = Double(size.height)
        let mapTL = camera.toScreen(x: 0, y: 0, viewport: (vpW, vpH))
        let mapBR = camera.toScreen(x: Double(map.width), y: Double(map.height), viewport: (vpW, vpH))
        let pxScaleX = Double(dw) / max(1, vpW), pxScaleY = Double(dh) / max(1, vpH)
        let rawX0 = (mapTL.x * pxScaleX).isFinite ? mapTL.x * pxScaleX : 0
        let rawY0 = (mapTL.y * pxScaleY).isFinite ? mapTL.y * pxScaleY : 0
        let rawX1 = (mapBR.x * pxScaleX).isFinite ? mapBR.x * pxScaleX : Double(dw)
        let rawY1 = (mapBR.y * pxScaleY).isFinite ? mapBR.y * pxScaleY : Double(dh)
        let sx0 = Int(max(0, min(Double(dw), floor(rawX0))))
        let sy0 = Int(max(0, min(Double(dh), floor(rawY0))))
        let sx1 = Int(max(Double(sx0), min(Double(dw), ceil(rawX1))))
        let sy1 = Int(max(Double(sy0), min(Double(dh), ceil(rawY1))))
        let mapScissor = MTLScissorRect(x: sx0, y: sy0, width: sx1 - sx0, height: sy1 - sy0)
        let deskVisible = sx0 > 0 || sy0 > 0 || sx1 < dw || sy1 < dh

        guard let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }

        // 0. 仅当缩远露出书案时绘制「御案织锦」背景（近景满屏看图时完全跳过，0 像素开销）
        if deskVisible {
            encoder.setScissorRect(fullScissor)
            encoder.setRenderPipelineState(deskPipeline)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
        }

        func quad(_ texture: MTLTexture?, _ pipeline: MTLRenderPipelineState, x: Float, y: Float, width: Float, height: Float) {
            guard let texture else { return }
            var q = QuadUniforms(origin: SIMD2(x, y), size: SIMD2(width, height))
            encoder.setRenderPipelineState(pipeline)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setVertexBytes(&q, length: MemoryLayout<QuadUniforms>.stride, index: 3)
            encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentTexture(texture, index: 0)
            encoder.setFragmentSamplerState(sampler, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
        }
        func colored(_ layer: (buffer: MTLBuffer, count: Int)?, alpha: Float = 1) {
            guard let layer, layer.count > 0, alpha > 0 else { return }
            u.alpha = alpha
            encoder.setRenderPipelineState(coloredPipeline)
            encoder.setVertexBuffer(layer.buffer, offset: 0, index: 0)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: layer.count)
            u.alpha = 1
        }

        if mapScissor.width > 0 && mapScissor.height > 0 {
            encoder.setScissorRect(mapScissor)
            let stage = reveal
            func ramp(_ from: Float) -> Float { min(1, max(0, (stage - from) / 0.07)) }

            // 1. 宋画青绿海图底图（浅海青碧渐变 + 解析双波日照波光 + 铜版细浪 + 极北冬冰，零噪声）
            quad(sea, seaPipeline, x: 0, y: 0, width: map.width, height: map.height)
            if stage < 0.2 {
                var q = QuadUniforms(origin: SIMD2(0, 0), size: SIMD2(map.width, map.height))
                var sheet = SIMD4<Float>(Self.paper.r, Self.paper.g, Self.paper.b, stage)
                let deep = MapPalette.ocean(display.ocean).deep
                var water = SIMD4<Float>(deep.r, deep.g, deep.b, 0), extent = SIMD4<Float>(map.width, map.height, 0, 0)
                encoder.setRenderPipelineState(veilPipeline)
                encoder.setVertexBytes(&u, length: uniformLength, index: 2)
                encoder.setVertexBytes(&q, length: MemoryLayout<QuadUniforms>.stride, index: 3)
                encoder.setFragmentBytes(&sheet, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
                encoder.setFragmentBytes(&water, length: MemoryLayout<SIMD4<Float>>.stride, index: 1)
                encoder.setFragmentBytes(&extent, length: MemoryLayout<SIMD4<Float>>.stride, index: 2)
                encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
            }

            // 2. 陆地地块（西北日照浮雕明暗 + 四季天光与北国冬雪，零噪声；硬校验缓冲字节长度）
            let minColorBytes = vertexCount * 16
            let minFieldBytes = vertexCount * 8
            let canDrawLand = indexCount > 0 && vertexCount > 0 && positions.length >= minFieldBytes && colors.length >= minColorBytes
            if canDrawLand {
                if stage < 1, let rb = revealBuffers(), rb.terrain.length >= minColorBytes, rb.fields.length >= minFieldBytes {
                    var r = SIMD4<Float>(Self.paper.r, Self.paper.g, Self.paper.b, stage)
                    encoder.setRenderPipelineState(revealPipeline)
                    encoder.setVertexBuffer(rb.terrain, offset: 0, index: 3)
                    encoder.setVertexBuffer(rb.fields, offset: 0, index: 4)
                    encoder.setFragmentBytes(&r, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
                } else if fading, let previous = previousColors, previous.length >= minColorBytes {
                    var t = SIMD2<Float>(clock(frameTime), LandFade.duration)
                    encoder.setRenderPipelineState(fadePipeline)
                    encoder.setVertexBuffer(previous, offset: 0, index: 3)
                    prevColorBufferPool.recordRead(in: buffer)
                    encoder.setVertexBytes(&t, length: MemoryLayout<SIMD2<Float>>.stride, index: 4)
                    encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
                    encoder.setFragmentBytes(&weatherUniforms, length: weatherUniforms.count * MemoryLayout<SIMD4<Float>>.stride, index: 3)
                } else {
                    if previousColors != nil { previousColors = nil }
                    encoder.setRenderPipelineState(cellPipeline)
                    encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
                    encoder.setFragmentBytes(&weatherUniforms, length: weatherUniforms.count * MemoryLayout<SIMD4<Float>>.stride, index: 3)
                }
                encoder.setVertexBuffer(positions, offset: 0, index: 0)
                encoder.setVertexBuffer(colors, offset: 0, index: 1)
                colorBufferPool.recordRead(in: buffer)
                encoder.setVertexBytes(&u, length: uniformLength, index: 2)
                encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0)
            }

            // 2.5. 8K–16K 真实卫星地貌与海深 GPU 瓦片金字塔叠层（HotPack v6 ReliefTiles/*.lgtr，按视口流式采样）
            if stage >= 0.95 && !activeHistoricalRegion.isEmpty && (display.mapDetail ?? true) {
                let tiles = MapTileStreamer.shared.visibleTiles(
                    region: activeHistoricalRegion,
                    device: device,
                    camera: camera,
                    viewport: size,
                    mapWidth: map.width,
                    mapHeight: map.height
                )
                if !tiles.isEmpty {
                    u.alpha = isTerrainMode ? 0.56 : (fills == nil ? 0.24 : 0.14)
                    for tile in tiles {
                        quad(tile.texture, reliefTilePipeline, x: tile.x, y: tile.y, width: tile.w, height: tile.h)
                    }
                    u.alpha = 1
                }
            }

            // 3. 战争晕染与易主扫色（Claude 原版单 Pass 墨场）
            if stage >= 1 && (display.battleGround ?? true) && fills == nil {
                let t0 = CACurrentMediaTime()
                drawWashes(encoder, &u, command: buffer)
                probe?.wash.append((CACurrentMediaTime() - t0) * 1000)
            }

            // 4. 矢量图层（1 指令 colorFragment / flatFragment）
            if stage < 0.82 {
                if coastInk == nil { coastInk = self.buffer(MapLayers.coastInk(map).vertices, stride: 6) }
                colored(coastInk, alpha: ramp(0.1) * (1 - ramp(0.75)))
            } else if coastInk != nil { coastInk = nil }
            if display.provinceLines { colored(provinceLines, alpha: ramp(0.5)) }
            if let rivers, rivers.count > 0, stage > 0.42 {
                var color = SIMD4<Float>(MapLayers.river.r, MapLayers.river.g, MapLayers.river.b, ramp(0.42))
                encoder.setRenderPipelineState(flatPipeline)
                encoder.setVertexBuffer(rivers.buffer, offset: 0, index: 0)
                encoder.setVertexBytes(&u, length: uniformLength, index: 2)
                encoder.setFragmentBytes(&color, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
                encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: rivers.count)
            }
            if stage > 0.42 { colored(extraRivers, alpha: ramp(0.42)) }
            if display.seaRoutes { colored(seaLanes, alpha: ramp(0.7)) }
            if display.gridLines == true && stage >= 1 { colored(gridLines) }
            let chart = display.mapDetail ?? true
            if chart { colored(ornaments, alpha: ramp(0.44)) }
            let fineFade = Float(min(1, max(0, (camera.scale - 0.46) / 0.44)))
            if chart && fineFade > 0.01 { colored(fineDetail, alpha: ramp(0.44) * fineFade) }
            if display.vegetation { colored(relief, alpha: ramp(0.44) * 0.94) }
            if display.borders { colored(outlines, alpha: ramp(0.75)) }
            if display.cityIcons {
                colored(icons, alpha: ramp(0.85))
                colored(forts, alpha: ramp(0.85))
                colored(portIcons, alpha: ramp(0.85))
            }

            // 5. 军队、舰队与行军线（v4.1 雕漆军牌 + 航向踏步倾身冲锋微韵，单 Pass 零重复阴影绘制）
            if stage >= 1 {
                colored(route)
                if showArmies && !units.isEmpty {
                    var clock = Float(frameTime.truncatingRemainder(dividingBy: 600))
                    encoder.setRenderPipelineState(spritePipeline)
                    encoder.setVertexBytes(&u, length: uniformLength, index: 2)
                    encoder.setVertexBytes(&spriteProgress, length: MemoryLayout<Float>.stride, index: 4)
                    encoder.setVertexBytes(&clock, length: MemoryLayout<Float>.stride, index: 5)
                    encoder.setFragmentSamplerState(sampler, index: 0)
                    for unit in units where unit.count > 0 {
                        encoder.setVertexBuffer(unit.buffer, offset: 0, index: 0)
                        encoder.setFragmentTexture(unit.texture, index: 0)
                        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: unit.count)
                        unit.pool.recordRead(in: buffer)
                    }
                }
            }

            // 6. 原作羊皮纸正片叠底 + 高倍缩放双尺度无缝宣纸纤维（远景单采样、近景纤毫毕现无糊块）
            if display.parchment, let parchment {
                var q = QuadUniforms(origin: SIMD2(0, 0), size: SIMD2(map.width, map.height))
                encoder.setRenderPipelineState(multiplyPipeline)
                encoder.setVertexBytes(&u, length: uniformLength, index: 2)
                encoder.setVertexBytes(&q, length: MemoryLayout<QuadUniforms>.stride, index: 3)
                encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
                encoder.setFragmentTexture(parchment, index: 0)
                encoder.setFragmentTexture(paperDetail ?? parchment, index: 1)
                encoder.setFragmentSamplerState(sampler, index: 0)
                encoder.setFragmentSamplerState(repeatSampler ?? sampler, index: 1)
                encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
            }
        }

        // 7. 博物馆级「御览万里手卷」矢量装裱画框（24 段 Phong 紫檀滚轴、碧玉葫芦轴头、鎏金云锦绫边、回纹包角与 45° 斜接落影，全分辨率零拉伸失真）
        encoder.setScissorRect(fullScissor)
        if display.scrollMount ?? display.darkEdges {
            colored(scrollFrameMesh, alpha: 1)
        }

        encoder.endEncoding()
        if let probe {
            let encodeMs = (CACurrentMediaTime() - frameTime) * 1000
            if encodeMs.isFinite && encodeMs >= 0 { probe.encode.append(encodeMs) }
            buffer.addCompletedHandler { [weak probe] b in
                let g = (b.gpuEndTime - b.gpuStartTime) * 1000
                guard g.isFinite && g >= 0 else { return }
                DispatchQueue.main.async { [weak probe] in
                    probe?.gpu.append(g)
                }
            }
            #if !targetEnvironment(simulator)
            drawable.addPresentedHandler { [weak probe] d in
                let t = d.presentedTime
                guard t.isFinite && t > 0 else { return }
                DispatchQueue.main.async { [weak probe] in
                    guard let probe else { return }
                    if probe.lastPresent > 0 {
                        let gap = (t - probe.lastPresent) * 1000
                        if gap.isFinite && gap >= 0 { probe.presented.append(gap) }
                    }
                    probe.lastPresent = t
                }
            }
            #endif
        }
        if view.presentsWithTransaction {
            buffer.commit()
            buffer.waitUntilScheduled()
            drawable.present()
        } else {
            buffer.present(drawable)
            buffer.commit()
        }
        onDraw?(CACurrentMediaTime())
    }

    static let shaders = """
    #include <metal_stdlib>
    using namespace metal;
    struct Uniforms {
        float2 viewport;
        float2 center;
        float scale;
        float halfWidth;
        float alpha;
        float time;
        float lighting;
        float mapWidth;
        float mapHeight;
        float pad;
        float iconZoom;
        float pad2;
        float pad3;
        float pad4;
        float4 landTint;
        float4 seaTint;
        float4 seasonWeights;
    };
    struct QuadUniforms { float2 origin; float2 size; };
    struct ColorOut { float4 position [[position]]; float4 color; };
    struct LandOut { float4 position [[position]]; float4 color; float2 world; float scale; };
    struct FlatOut { float4 position [[position]]; };
    struct QuadOut { float4 position [[position]]; float2 uv; };
    struct SeaOut { float4 position [[position]]; float2 uv; float2 world; float scale; };
    struct DeskOut { float4 position [[position]]; float2 uv; float2 screenPx; };
    struct ScrollRingOut { float4 position [[position]]; float2 world; };

    static float4 clip(float2 world, constant Uniforms& u, float2 offset) {
        float2 s = (world - u.center) * u.scale + u.viewport * 0.5 + offset;
        return float4(s.x / u.viewport.x * 2.0 - 1.0, 1.0 - s.y / u.viewport.y * 2.0, 0.0, 1.0);
    }
    static float hash21(float2 p) { p = fract(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    static float vnoise(float2 p) {
        float2 i = floor(p), f = fract(p), w = f * f * (3.0 - 2.0 * f);
        float a = hash21(i), b = hash21(i + float2(1.0, 0.0)), c = hash21(i + float2(0.0, 1.0)), d = hash21(i + float2(1.0, 1.0));
        return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
    }
    static float fbm2(float2 p) {
        return vnoise(p) * 0.65 + vnoise(p * 2.04 + float2(17.1, 9.2)) * 0.35;
    }
    static float fbm(float2 p) {
        float v = 0.0, a = 0.54;
        for (int k = 0; k < 3; k++) { v += a * vnoise(p); p = p * 2.03 + float2(17.1, 9.2); a *= 0.48; }
        return v;
    }
    // 统一西北御案主光（纯解析零噪声：西北角温润暖阳，东南角柔和古意）
    static float3 studioLight(float2 uv, float strength) {
        float diag = clamp(1.0 - (uv.x * 0.55 + uv.y * 0.45), 0.0, 1.0);
        float3 nwSun = float3(1.032, 1.018, 0.988);
        float3 seDepth = float3(0.946, 0.942, 0.954);
        return mix(float3(1.0), mix(seDepth, nwSun, diag), strength);
    }

    vertex LandOut cellVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]],
                              const device float4* colors [[buffer(1)]], constant Uniforms& u [[buffer(2)]]) {
        LandOut o; float2 w = positions[id];
        o.position = clip(w, u, float2(0.0)); o.color = colors[id]; o.world = w; o.scale = u.scale; return o;
    }
    struct ColoredVertex { packed_float2 position; packed_float4 color; };
    vertex ColorOut coloredVertex(uint id [[vertex_id]], const device ColoredVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        ColorOut o; o.position = clip(float2(v[id].position), u, float2(0.0)); o.color = float4(v[id].color); o.color.a *= u.alpha; return o;
    }
    fragment float4 colorFragment(ColorOut in [[stage_in]]) { return in.color; }
    // 陆地浮雕光影、鲜明四季地域风貌、流云投影与局部天时灾异地貌着染（纯解析零噪声：极低 GPU 发热同时呈现分明四季与实景天象）
    fragment float4 landFragment(LandOut in [[stage_in]], constant Uniforms& u [[buffer(2)]], constant float4* weather [[buffer(3)]]) {
        float3 rgb = in.color.rgb * u.landTint.rgb;
        float lum = dot(in.color.rgb, float3(0.299, 0.587, 0.114));
        if (u.lighting > 0.01) {
            float k = u.lighting;
            float reliefMask = smoothstep(0.22, 0.78, lum);
            float3 warmSun = float3(1.060, 1.030, 0.970);
            float3 coolValley = float3(0.924, 0.950, 1.022);
            rgb *= mix(float3(1.0), mix(coolValley, warmSun, reliefMask), k);
            float2 mapUV = clamp(in.world / float2(max(1.0, u.mapWidth), max(1.0, u.mapHeight)), 0.0, 1.0);
            rgb *= studioLight(mapUV, k * 0.94);

            // 解析四季地域风貌（u.pad2 == 1 为地形图全强度，政区图采用克制清透微韵，确保四季轮转绝不遮盖或浑浊列国国色）
            float isTerrain = u.pad2;
            float sScale = mix(0.24, 1.0, isTerrain);
            float wWinter = u.seasonWeights.x;
            float wSpring = u.seasonWeights.y;
            float wSummer = u.seasonWeights.z;
            float wAutumn = u.seasonWeights.w;
            if (wSpring > 0.02) {
                float valleyMist = smoothstep(0.65, 0.25, lum) * smoothstep(0.08, 0.45, mapUV.y);
                rgb = mix(rgb, rgb * float3(0.96, 1.07, 0.98) + float3(0.010, 0.020, 0.010), wSpring * valleyMist * 0.26 * sScale * k);
            }
            if (wSummer > 0.02) {
                float sunBelt = smoothstep(0.15, 0.72, mapUV.y);
                rgb = mix(rgb, rgb * float3(1.06, 1.03, 0.92) + float3(0.016, 0.012, -0.006), wSummer * sunBelt * 0.22 * sScale * k);
            }
            if (wAutumn > 0.02) {
                float midLat = smoothstep(0.04, 0.34, mapUV.y) * smoothstep(0.96, 0.54, mapUV.y);
                float foliage = (sin(in.world.x * 0.022 + cos(in.world.y * 0.019) * 1.3) * 0.5 + 0.5) * 0.20 + 0.80;
                rgb = mix(rgb, rgb * float3(1.13, 0.94, 0.76) + float3(0.032, 0.012, -0.012), wAutumn * midLat * foliage * 0.36 * sScale * k);
            }
            if (wWinter > 0.02) {
                float northBelt = smoothstep(mix(0.56, 0.76, isTerrain), 0.05, mapUV.y);
                float highlandBelt = smoothstep(mix(0.56, 0.46, isTerrain), 0.82, lum);
                float organic = (sin(in.world.x * 0.024 + sin(in.world.y * 0.019) * 1.4) * 0.5 + 0.5) * 0.14;
                float winterCap = mix(0.17, 0.62, isTerrain);
                float snowCover = wWinter * smoothstep(mix(0.32, 0.18, isTerrain), 0.84, northBelt * 0.64 + highlandBelt * 0.42 + organic) * winterCap * k;
                rgb = mix(rgb, float3(0.955, 0.976, 1.0), snowCover);
            }

            // 极轻量解析流云投影（仅 2 次正弦，零噪声，为大陆赋予呼吸流动感）
            float c1 = sin(in.world.x * 0.0085 + in.world.y * 0.0045 - u.time * 0.14);
            float c2 = sin(in.world.x * 0.0052 - in.world.y * 0.0092 - u.time * 0.09);
            float cloudShadow = smoothstep(0.32, 0.94, (c1 + c2) * 0.5);
            rgb *= 1.0 - cloudShadow * mix(0.045, 0.072, isTerrain) * k;
        }

        // 局部天时灾异与丰年地貌实景着染（政区模式下保持半透清雅，既见天象又不淹没国家色块）
        int wCount = int(weather[0].x + 0.5);
        if (wCount > 0) {
            float wzScale = mix(0.42, 1.0, u.pad2);
            float org = sin(in.world.x * 0.045 + cos(in.world.y * 0.038) * 1.5) * 0.14;
            for (int i = 1; i <= wCount && i <= 12; i++) {
                float4 wz = weather[i];
                float d = length(in.world - wz.xy) / max(1.0, wz.z);
                if (d >= 1.18) continue;
                float edge = 1.0 - smoothstep(0.28, 1.12, d + org);
                if (edge <= 0.005) continue;
                int kind = int(wz.w + 0.5);
                if (kind == 1) {
                    rgb = mix(rgb, float3(0.955, 0.978, 1.0), edge * 0.72 * wzScale);
                } else if (kind == 2) {
                    rgb = mix(rgb, rgb * float3(1.14, 0.90, 0.64) + float3(0.065, 0.024, -0.018), edge * 0.60 * wzScale);
                } else if (kind == 3) {
                    rgb = mix(rgb, rgb * float3(0.70, 0.80, 0.92) + float3(-0.015, 0.008, 0.032), edge * 0.52 * wzScale);
                } else if (kind == 4) {
                    rgb = mix(rgb, float3(lum * 0.84, lum * 0.90, lum * 0.74), edge * 0.54 * wzScale);
                } else {
                    rgb = mix(rgb, rgb * float3(1.09, 1.04, 0.84) + float3(0.042, 0.032, -0.008), edge * 0.45 * wzScale);
                }
            }
        }
        return float4(clamp(rgb, 0.0, 1.0), in.color.a);
    }

    vertex LandOut fadeVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], const device float4* colors [[buffer(1)]],
                              constant Uniforms& u [[buffer(2)]], const device float4* previous [[buffer(3)]], constant float2& clock [[buffer(4)]]) {
        float4 p = previous[id];
        float x = clamp((clock.x - p.a) / clock.y, 0.0, 1.0);
        x = x * x * (3.0 - 2.0 * x);
        float2 w = positions[id];
        LandOut o; o.position = clip(w, u, float2(0.0)); o.color = float4(mix(p.rgb, colors[id].rgb, x), colors[id].a); o.world = w; o.scale = u.scale; return o;
    }

    struct RevealOut { float4 position [[position]]; float4 color; float4 terrain; float2 world; float2 field; };
    vertex RevealOut revealVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], const device float4* colors [[buffer(1)]],
                                  constant Uniforms& u [[buffer(2)]], const device float4* terrain [[buffer(3)]], const device float2* fields [[buffer(4)]]) {
        RevealOut o; o.position = clip(positions[id], u, float2(0.0));
        o.color = colors[id]; o.terrain = terrain[id]; o.world = positions[id]; o.field = fields[id];
        return o;
    }
    fragment float4 revealFragment(RevealOut in [[stage_in]], constant float4& r [[buffer(0)]]) {
        float2 q = in.world;
        float rise = clamp((r.w - 0.14) / 0.30, 0.0, 1.0);
        float e = rise * 1.25 - 0.1 - (in.field.x * 0.8 + fbm2(q * 0.02) * 0.25);
        float shown = smoothstep(-0.03, 0.05, e);
        float spread = clamp((r.w - 0.5) / 0.25, 0.0, 1.0);
        float ew = spread * 1.3 - 0.1 - (clamp(in.field.y, 0.0, 1.0) * 0.85 + fbm2(q * 0.015 + float2(31.7, 11.3)) * 0.3);
        float washed = smoothstep(-0.02, 0.07, ew);
        float light = dot(in.terrain.rgb, float3(0.3, 0.59, 0.11));
        float3 sepia = mix(float3(0.42, 0.34, 0.24), r.rgb, smoothstep(0.15, 0.85, light) * 0.8);
        float3 ground = mix(mix(sepia, in.terrain.rgb, 0.32), in.color.rgb, washed);
        ground *= 1.0 - 0.12 * clamp(1.0 - e * 4.0, 0.0, 1.0) * shown;
        float3 c = mix(r.rgb, ground, shown);
        float rim = shown * (1.0 - shown) * 4.0, front = washed * (1.0 - washed) * 4.0;
        c = mix(c, float3(0.14, 0.11, 0.08), rim * 0.5);
        c = mix(c, c * 0.72, front * 0.5);
        return float4(c, 1.0);
    }
    fragment float4 veilFragment(QuadOut in [[stage_in]], constant float4& r [[buffer(0)]], constant float4& water [[buffer(1)]], constant float4& extent [[buffer(2)]]) {
        float2 q = in.uv * extent.xy;
        float2 p1 = extent.xy * float2(0.32, 0.44);
        float2 p2 = extent.xy * float2(0.68, 0.38);
        float2 p3 = extent.xy * float2(0.50, 0.68);
        float norm = max(1.0, length(extent.xy) * 0.42);
        float d = min(distance(q, p1), min(distance(q, p2), distance(q, p3))) / norm;
        float flood = fbm2(q * 0.0075) * 0.48 + 0.52 * clamp(d, 0.0, 1.2);
        float prog = clamp(r.w / 0.18, 0.0, 1.0);
        float wet = smoothstep(-0.06, 0.08, prog * 1.32 - 0.08 - flood);
        float rim = wet * (1.0 - wet) * 4.0;
        float3 col = mix(r.rgb, water.rgb * 0.68, wet);
        col = mix(col, float3(0.26, 0.36, 0.42), rim * 0.32);
        return float4(col, 1.0 - wet);
    }

    vertex FlatOut flatVertex(uint id [[vertex_id]], const device float2* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        FlatOut o; o.position = clip(v[id], u, float2(0.0)); return o;
    }
    fragment float4 flatFragment(FlatOut in [[stage_in]], constant float4& color [[buffer(0)]]) { return color; }

    vertex QuadOut quadVertex(uint id [[vertex_id]], constant Uniforms& u [[buffer(2)]], constant QuadUniforms& q [[buffer(3)]]) {
        const float2 corners[6] = { float2(0, 0), float2(1, 0), float2(0, 1), float2(0, 1), float2(1, 0), float2(1, 1) };
        QuadOut o; float2 c = corners[id]; o.position = clip(q.origin + c * q.size, u, float2(0.0)); o.uv = c; return o;
    }

    // 御案织锦书案背景（纯解析零噪声，仅在缩远露出卷轴外书案时渲染）：西北柔光聚光 + 经纬云锦暗纹
    vertex DeskOut deskVertex(uint id [[vertex_id]], constant Uniforms& u [[buffer(2)]]) {
        const float2 ndc[6] = { float2(-1, -1), float2(1, -1), float2(-1, 1), float2(-1, 1), float2(1, -1), float2(1, 1) };
        float2 p = ndc[id];
        DeskOut o;
        o.position = float4(p, 0.0, 1.0);
        o.uv = p * 0.5 + 0.5;
        o.screenPx = o.uv * u.viewport;
        return o;
    }
    fragment float4 deskFragment(DeskOut in [[stage_in]], constant Uniforms& u [[buffer(2)]]) {
        float2 p = in.screenPx;
        float warp = sin(p.x * 1.55) * 0.5 + 0.5;
        float weft = sin(p.y * 1.55) * 0.5 + 0.5;
        float weave = (warp * 0.5 + weft * 0.5 - 0.5) * 0.014;
        float2 dCell = fract(p / 36.0) - 0.5;
        float diamond = abs(dCell.x) + abs(dCell.y);
        float outerLatt = smoothstep(0.45, 0.49, diamond) * (1.0 - smoothstep(0.49, 0.53, diamond));
        float innerMed = smoothstep(0.20, 0.23, diamond) * (1.0 - smoothstep(0.23, 0.26, diamond));
        float damask = outerLatt * 0.020 + innerMed * 0.013;
        float2 lightCenter = float2(0.44, 0.56);
        float2 c = (in.uv - lightCenter) * float2(1.36, 1.30);
        float r2 = clamp(dot(c, c), 0.0, 1.35);
        float3 centerTone = float3(0.896, 0.854, 0.774);
        float3 outerTone = float3(0.736, 0.672, 0.566);
        float3 rgb = mix(centerTone, outerTone, smoothstep(0.06, 1.05, r2));
        rgb = clamp(rgb + weave + damask, 0.0, 1.0);
        return float4(rgb, 1.0);
    }

    // 宋画青绿海图着色器（纯解析零噪声）：青碧浅海大陆架 + 双波法线日照波光 + 铜版细浪刻纹 + 近岸微沫 + 冬日北洋寒冰
    vertex SeaOut seaVertex(uint id [[vertex_id]], constant Uniforms& u [[buffer(2)]], constant QuadUniforms& q [[buffer(3)]]) {
        const float2 corners[6] = { float2(0, 0), float2(1, 0), float2(0, 1), float2(0, 1), float2(1, 0), float2(1, 1) };
        float2 c = corners[id];
        float2 w = q.origin + c * q.size;
        SeaOut o;
        o.position = clip(w, u, float2(0.0));
        o.uv = c;
        o.world = w;
        o.scale = u.scale;
        return o;
    }
    fragment float4 seaFragment(SeaOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]], constant Uniforms& u [[buffer(2)]]) {
        float3 base = t.sample(s, in.uv).rgb;
        float detail = clamp((in.scale - 0.28) / 1.10, 0.0, 1.0);
        float closeZoom = clamp((in.scale - 0.85) / 1.85, 0.0, 1.0);
        float2 w = in.world;
        float tm = u.time;
        float lum = dot(base, float3(0.299, 0.587, 0.114));
        float shallowMask = smoothstep(0.40, 0.78, lum);

        // 澄澈古海图层次：深海沉蔚靛青 ↔ 浅海陆棚青碧通透，消除低分辨率底图发灰发糊感
        float3 shallowTint = float3(0.91, 1.085, 1.072);
        float3 deepTint = float3(0.84, 0.925, 1.042);
        float3 rgb = base * mix(deepTint, shallowTint, shallowMask);
        rgb += float3(0.015, 0.048, 0.042) * shallowMask;

        // 缩放无关高清解析「海图等深水线」（基于屏幕导数 fwidth 保持任意缩放均为 1px 锐利古图墨青细线，彻底告别模糊宽边）
        float fw = max(0.012, fwidth(shallowMask) * 1.45);
        float iso1 = 1.0 - smoothstep(0.0, fw * 1.25, abs(shallowMask - 0.78));
        float iso2 = 1.0 - smoothstep(0.0, fw * 1.35, abs(shallowMask - 0.56));
        float iso3 = 1.0 - smoothstep(0.0, fw * 1.45, abs(shallowMask - 0.34));
        float iso4 = 1.0 - smoothstep(0.0, fw * 1.55, abs(shallowMask - 0.16));
        float isoLine = iso1 * 0.36 + iso2 * 0.28 + iso3 * 0.20 + iso4 * 0.12;
        rgb = mix(rgb, float3(0.84, 0.94, 0.95), clamp(isoLine * (0.55 + 0.45 * detail), 0.0, 0.48));

        // 宋画古海图双频铜版细浪刻纹（纯解析零噪声：中近景呈现清锐鱼鳞细浪与日光波光，绝不发糊）
        float p1 = w.x * 0.20 + w.y * 0.62 - tm * 0.62;
        float p2 = w.x * 0.34 - w.y * 0.48 + tm * 0.44;
        float waveSlopeX = cos(p1) * 0.20 + cos(p2) * 0.24;
        float waveSlopeY = cos(p1) * 0.62 - cos(p2) * 0.32;
        float3 waveN = normalize(float3(-waveSlopeX * 0.36, -waveSlopeY * 0.36, 1.0));
        float3 halfVec = normalize(float3(-0.34, -0.30, 0.89));
        float spec = pow(max(0.0, dot(waveN, halfVec)), 16.0);
        float glint = spec * (0.068 + 0.095 * detail) * u.lighting;

        float scallop = sin(w.y * 0.86 + sin(w.x * 0.16 + tm * 0.20) * 1.35);
        float crestEnv = smoothstep(0.15, 0.92, sin(w.x * 0.065 + w.y * 0.042) * sin(w.x * 0.048 - w.y * 0.078) * 0.5 + 0.5);
        float fineRipple = sin(w.y * 2.15 + sin(w.x * 0.42 - tm * 0.35) * 1.1) * closeZoom;
        float engraving = scallop * (0.016 + 0.022 * detail) * (0.45 + 0.55 * crestEnv) + fineRipple * 0.016;
        float surfPulse = (sin(w.x * 0.12 + w.y * 0.14 - tm * 1.10) * 0.5 + 0.5) * shallowMask * 0.042 * u.lighting;
        rgb += engraving + surfPulse;
        rgb += float3(1.0, 0.96, 0.86) * glint;

        // 远洋极细古航海经纬刻度暗纹（纯解析 1px 铜版细线，赋予大片海域博物馆海图质感）
        float gridStep = 112.0;
        float gx = abs(fract(w.x / gridStep + 0.5) - 0.5) * gridStep;
        float gy = abs(fract(w.y / gridStep + 0.5) - 0.5) * gridStep;
        float pxW = max(0.35, 1.05 / max(0.25, in.scale));
        float gLine = max(1.0 - smoothstep(0.0, pxW, gx), 1.0 - smoothstep(0.0, pxW, gy));
        float openOcean = 1.0 - shallowMask * 0.72;
        rgb = mix(rgb, rgb * 0.84 + float3(0.02, 0.03, 0.04), gLine * openOcean * (0.14 + 0.10 * detail));

        if (u.lighting > 0.01) {
            float k = u.lighting;
            rgb *= studioLight(in.uv, k * 0.96);
            rgb *= u.seaTint.rgb;
            float wWinter = u.seasonWeights.x;
            if (wWinter > 0.02) {
                float northSea = smoothstep(0.54, 0.04, in.uv.y);
                float iceRim = wWinter * northSea * (0.22 + 0.24 * shallowMask) * k;
                rgb = mix(rgb, float3(0.86, 0.93, 0.99), iceRim);
            }
            float sc1 = sin(w.x * 0.0085 + w.y * 0.0045 - tm * 0.14);
            float sc2 = sin(w.x * 0.0052 - w.y * 0.0092 - tm * 0.09);
            rgb *= 1.0 - smoothstep(0.32, 0.94, (sc1 + sc2) * 0.5) * 0.055 * k;
        }
        return float4(clamp(rgb, 0.0, 1.0), 1.0);
    }

    // 8K–16K 真实地球卫星地貌与水深瓦片叠层着色器（HotPack v6 ReliefTiles/*.lgtr 流式采样，零全量显存占用）
    fragment float4 reliefTileFragment(SeaOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]], constant Uniforms& u [[buffer(2)]]) {
        float3 rgb = t.sample(s, in.uv).rgb;
        if (u.lighting > 0.01) {
            float2 mapUV = clamp(in.world / float2(max(1.0, u.mapWidth), max(1.0, u.mapHeight)), 0.0, 1.0);
            rgb *= studioLight(mapUV, u.lighting * 0.52);
        }
        return float4(clamp(rgb, 0.0, 1.0), clamp(u.alpha, 0.0, 1.0));
    }

    // 高倍缩放无缝古宣纸肌理正片叠底：远景单纹理保留古卷明暗，近景渐进混入双尺度无缝宣纸纤维（零糊块、零色偏）
    fragment float4 parchmentFragment(SeaOut in [[stage_in]],
                                      texture2d<float> macroTex [[texture(0)]],
                                      texture2d<float> detailTex [[texture(1)]],
                                      sampler clampS [[sampler(0)]],
                                      sampler repS [[sampler(1)]]) {
        float3 macro = macroTex.sample(clampS, in.uv).rgb;
        float zoom = smoothstep(0.72, 2.55, in.scale);
        if (zoom > 0.005) {
            float3 d1 = detailTex.sample(repS, in.world / 168.0).rgb;
            float3 d2 = detailTex.sample(repS, in.world / 52.0 + float2(0.37, 0.61)).rgb;
            float f1 = dot(d1, float3(0.299, 0.587, 0.114)) - 0.885;
            float f2 = dot(d2, float3(0.299, 0.587, 0.114)) - 0.885;
            float fiberDelta = (f1 * 0.62 + f2 * 0.38) * 0.80 * zoom;
            float3 cleanMacro = mix(macro, mix(macro, float3(0.955, 0.936, 0.896), 0.42), zoom);
            macro = clamp(cleanMacro + fiberDelta, 0.0, 1.0);
        }
        return float4(macro, 1.0);
    }

    // 中空四边带卷轴内外投影着色器（极轻量：仅绘书案定向柔影 + 画心四边内阴影与细墨金口，本体交由真实生图贴图 `scrollArtFragment` 呈献）
    static float sdBox2D(float2 p, float2 b) {
        float2 q = abs(p) - b;
        return length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0);
    }
    vertex ScrollRingOut scrollRingVertex(uint id [[vertex_id]], const device float2* pos [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        ScrollRingOut o;
        float2 w = pos[id];
        o.world = w;
        o.position = clip(w, u, float2(0.0));
        return o;
    }
    fragment float4 scrollShadowFragment(ScrollRingOut in [[stage_in]], constant Uniforms& u [[buffer(2)]]) {
        float W = max(1.0, u.mapWidth);
        float H = max(1.0, u.mapHeight);
        float unit = min(W, H);
        float2 p = in.world;
        float aa = max(length(float2(dfdx(p.x), dfdy(p.y))) * 0.72, 0.25);

        float matH = unit * 0.056;
        float sideTotal = unit * 0.082;
        float innerW = unit * 0.024;

        float dInL = p.x;
        float dInR = W - p.x;
        float dInT = p.y;
        float dInB = H - p.y;
        float dIn = min(min(dInL, dInR), min(dInT, dInB));

        // 1. 画心四边柔和双阶内阴影 + 紧贴画心的极细墨金口线
        if (dIn >= -aa && dIn < innerW) {
            float dPos = max(0.0, dIn);
            float wTL = max(exp(-max(0.0, dInT) / (unit * 0.015)), exp(-max(0.0, dInL) / (unit * 0.015)));
            float dirWeight = mix(0.80, 1.18, clamp(wTL, 0.0, 1.0));
            float tightShadow = exp(-dPos / (unit * 0.0038)) * 0.30 * dirWeight;
            float softShadow  = exp(-dPos / (unit * 0.0135)) * 0.13 * dirWeight;
            float insideMask = smoothstep(-aa, aa, dIn);
            float innerAlpha = clamp(tightShadow + softShadow, 0.0, 0.44) * insideMask;
            float3 innerRgb = mix(float3(0.16, 0.115, 0.075), float3(0.36, 0.27, 0.17), clamp(dPos / innerW, 0.0, 1.0));
            float hairW = max(aa * 0.9, unit * 0.0009);
            float hair = (1.0 - smoothstep(hairW * 0.4, hairW * 1.4, abs(dPos - hairW * 0.5))) * insideMask;
            if (hair > 0.01) {
                innerRgb = mix(innerRgb, float3(0.20, 0.15, 0.10), hair * 0.72);
                innerAlpha = max(innerAlpha, hair * 0.65);
            }
            if (innerAlpha < 0.003) discard_fragment();
            return float4(innerRgb, innerAlpha * u.alpha);
        }

        // 2. 书案东南定向柔和投影（托起整个装裱卷轴，零过绘）
        if (dIn < 0.0) {
            float2 outerCenter = float2(W * 0.5, H * 0.5);
            float2 outerHalf = float2(W * 0.5 + sideTotal, H * 0.5 + matH);
            float2 sp = p - float2(unit * 0.008, unit * 0.012);
            float dSh = sdBox2D(sp - outerCenter, outerHalf);
            if (dSh > -aa && dSh < unit * 0.038) {
                float a = exp(-max(0.0, dSh) / (unit * 0.011)) * 0.46;
                if (a >= 0.003) { return float4(0.06, 0.04, 0.025, a * u.alpha); }
            }
        }
        discard_fragment();
    }

    // 真实手绘生图卷轴装裱贴图管线（scroll-border-h / scroll-roller-v / scroll-corner，1 次纹理采样 + 西北主光统一色温）
    struct ScrollArtVertex { packed_float2 world; packed_float2 uv; };
    struct ScrollArtOut { float4 position [[position]]; float2 world; float2 uv; };
    vertex ScrollArtOut scrollArtVertex(uint id [[vertex_id]], const device ScrollArtVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        ScrollArtVertex sv = v[id];
        ScrollArtOut o;
        o.world = float2(sv.world);
        o.position = clip(o.world, u, float2(0.0));
        o.uv = float2(sv.uv);
        return o;
    }
    fragment float4 scrollArtFragment(ScrollArtOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]], constant Uniforms& u [[buffer(2)]]) {
        float4 p = t.sample(s, in.uv);
        if (p.a < 0.02) discard_fragment();
        float3 rgb = clamp(p.rgb / max(p.a, 0.001), 0.0, 1.0);
        if (u.lighting > 0.01) {
            float2 mapUV = clamp(in.world / float2(max(1.0, u.mapWidth), max(1.0, u.mapHeight)), 0.0, 1.0);
            rgb *= studioLight(mapUV, u.lighting * 0.48);
        }
        return float4(clamp(rgb, 0.0, 1.0), p.a * u.alpha);
    }

    struct SpriteVertex { packed_float2 center; packed_float2 corner; packed_float4 tint; float size; packed_float2 target; packed_float2 shift; packed_float2 lead; };
    struct SpriteOut { float4 position [[position]]; float2 uv; float4 tint; };
    vertex SpriteOut spriteVertex(uint id [[vertex_id]], const device SpriteVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]], constant float& progress [[buffer(4)]],
                                  constant float& time [[buffer(5)]]) {
        SpriteVertex s = v[id];
        float pixels = s.size * u.iconZoom;
        float4 tint = float4(s.tint);
        bool fighting = (tint.a > 1.5);
        bool dying = (tint.a < -1.5);
        float sinkY = 0.0;
        if (dying) {
            float d = -tint.a - 2.0;
            float fadeT = clamp((progress - d) / 0.16, 0.0, 1.0);
            tint.a = 1.0 - fadeT;
            sinkY = fadeT * 0.22 * pixels;
        } else if (tint.a < 0.0) {
            tint.a = progress;
        } else if (fighting) {
            tint.a = 1.0;
        }
        float t = progress, t2 = t * t, t3 = t2 * t;
        float2 a = float2(s.center), b = float2(s.target);
        float2 delta = b - a;
        float dist = length(delta);
        bool moving = (dist > 0.06);
        float2 dir = moving ? (delta / dist) : float2(1.0, 0.0);
        float2 walk = a * (2.0 * t3 - 3.0 * t2 + 1.0) + float2(s.lead) * (t3 - 2.0 * t2 + t) + b * (3.0 * t2 - 2.0 * t3) + delta * (t3 - t2);
        // 真实航向踏步倾身、弹性呼吸与交战双向冲锋回弹（仅顶点着色器运算，零片元负担，完整保留 4.1 雕漆兵牌造型）
        float seed = fract(s.center[0] * 0.137 + s.center[1] * 0.071) * 6.2831853;
        float2 corner = float2(s.corner);
        float2 extraPx = float2(0.0, sinkY);
        if (fighting) {
            float beat = sin(time * 8.4 + seed);
            float lunge = pow(max(0.0, beat), 3.0) - 0.25 * max(0.0, -beat);
            float2 thrustDir = moving ? dir : float2((fract(seed * 1.7) > 0.5) ? 1.0 : -1.0, (fract(seed * 3.1) - 0.5) * 0.45);
            extraPx += thrustDir * (lunge * pixels * 0.12) + float2(0.0, -abs(lunge) * pixels * 0.05);
            float squash = 1.0 + lunge * 0.055;
            corner = float2(corner.x * squash, corner.y / squash);
            float ang = clamp(thrustDir.x * lunge * 0.11, -0.16, 0.16);
            float ca = cos(ang), sa = sin(ang);
            corner = float2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
        } else if (moving && !dying) {
            float stride = sin(time * 9.2 + seed);
            float stepLift = abs(stride);
            extraPx += dir * (stride * min(1.1, pixels * 0.036)) + float2(0.0, -stepLift * min(1.8, pixels * 0.062));
            float stretchY = 1.0 + (stepLift - 0.5) * 0.055;
            corner = float2(corner.x / sqrt(stretchY), corner.y * stretchY);
            float lean = clamp(dir.x * 0.085 + dir.y * 0.035 + stride * 0.042, -0.15, 0.15);
            float ca = cos(lean), sa = sin(lean);
            corner = float2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
        } else if (!dying) {
            float breath = sin(time * 2.4 + seed) * 0.016;
            corner *= float2(1.0 - breath * 0.5, 1.0 + breath);
        }
        SpriteOut o;
        o.position = clip(walk, u, (corner + float2(s.shift)) * pixels + extraPx);
        o.uv = float2(s.corner) + 0.5;
        o.tint = tint;
        return o;
    }
    fragment float4 spriteFragment(SpriteOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        float4 p = t.sample(s, in.uv);
        if (p.a <= 0.01) discard_fragment();
        float lum = p.r / max(p.a, 0.001);
        float lightGrad = 1.12 - 0.16 * in.uv.y - 0.08 * in.uv.x;
        float3 fill = clamp(in.tint.rgb * lightGrad, 0.0, 1.0);
        float3 rim = mix(float3(0.11, 0.09, 0.07), in.tint.rgb, 0.24);
        float3 c = mix(rim, fill, smoothstep(0.42, 0.94, lum));
        return float4(c, p.a * in.tint.a);
    }
    """
}
