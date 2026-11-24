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
        let index = 1 - current
        let buffer: MTLBuffer
        if let slot = slots[index], slot.buffer.length >= length,
           slot.lastRead == nil || slot.lastRead?.status == .completed || slot.lastRead?.status == .error {
            buffer = slot.buffer
        } else {
            guard let replacement = device.makeBuffer(length: max(length, capacity ?? length), options: .storageModeShared) else { return nil }
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
}

/// Draws the world with Metal in the web renderer's layer order (original-play-renderer + map.ts):
/// coastal-distance sea texture → land cells → province lines → rivers → mountain and forest
/// ornaments → state outlines and coastline → city icons → the original parchment multiplied over
/// everything. Geometry is uploaded once; land colours only when the view mode or selection
/// changes. The view redraws on demand (camera change, animation), not continuously.
final class MapRenderer: NSObject, MTKViewDelegate {
    let device: MTLDevice
    private let queue: MTLCommandQueue
    private let cellPipeline: MTLRenderPipelineState
    /// 开卷, the generation reveal on the GPU: the sea is brushed onto blank paper (veil), the land is
    /// inked in from the shore to the peaks, then the states' colours spread from their capitals.
    private let revealPipeline: MTLRenderPipelineState
    private let veilPipeline: MTLRenderPipelineState
    /// 易主渐变（逐顶点，LieguojiCore 的 LandFade）：每个顶点从自己当时显示的颜色渐变到新颜色，
    /// 连续几次易主互不打断；由战争晕染接手的州底色立即换，过渡由墨场扫满（Render/Wash.swift）。
    private let fadePipeline: MTLRenderPipelineState
    private var previousColors: MTLBuffer?
    private(set) var landFade = LandFade()
    private var fadeOnRecolor = false
    /// 统一的单调渲染时钟（秒）：易主渐变与战争晕染都按同一帧时刻推进，帧率不同表现一致。
    let clockStart = CACurrentMediaTime()
    func clock(_ t: CFTimeInterval = CACurrentMediaTime()) -> Float { Float(t - clockStart) }
    /// 本帧的时刻（draw 开头取一次，各图层共用）。
    private(set) var frameTime: CFTimeInterval = CACurrentMediaTime()
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
    /// 最近的攻占（州 → 进攻方、军队位置、登记时刻）、刚有大事的国家、上次安装颜色时各州的主人。
    var washCaptures: [Int: (nation: Int, armies: [SIMD2<Float>], time: Float)] = [:]
    var washRegimes: [Int: Float] = [:]
    /// 易主扫满时各顶点的旧色（rgb，按顶点号）。
    var washOld: [Float] = []
    private let linePipeline: MTLRenderPipelineState
    private let flatPipeline: MTLRenderPipelineState
    private let coloredPipeline: MTLRenderPipelineState
    private let deskPipeline: MTLRenderPipelineState
    private let seaPipeline: MTLRenderPipelineState
    private let texturePipeline: MTLRenderPipelineState
    private let multiplyPipeline: MTLRenderPipelineState
    private let spriteShadowPipeline: MTLRenderPipelineState
    private let spritePipeline: MTLRenderPipelineState
    /// 4×1 横向透明序列帧动画专用 GPU 管线（步兵行军、骑兵冲锋、东西方战舰破浪、跨海运输船队，60/120fps 逐帧切换无代码晃动）。
    private let spriteSheetShadowPipeline: MTLRenderPipelineState
    private let spriteSheetPipeline: MTLRenderPipelineState
    /// 宋画青绿山水地形精灵与程序化高精细古风舆图卷轴装裱（紫檀木轴、包金玉轴头、宋锦绫罗暗纹、四角回纹包角、柔和内阴影）专用 GPU 管线。
    private let terrainPipeline: MTLRenderPipelineState
    private let scrollBorderPipeline: MTLRenderPipelineState
    /// 4.2.6 离屏静态地图双层缓存合成管线（cachedBaseTex 底图海陆 + cachedOverlayTex 静态州界/河网/地貌/国界/城徽，Dirty Flag 按需重绘）。
    private let blitOpaquePipeline: MTLRenderPipelineState
    private let blitPremulPipeline: MTLRenderPipelineState
    private var cacheMSAATex: MTLTexture?
    private var cachedBaseTex: MTLTexture?
    private var cachedOverlayTex: MTLTexture?
    private var cachePixelSize: (Int, Int) = (0, 0)
    private var cacheSampleCount: Int = 0
    private var cachedCamera = MapCamera(centerX: .nan, centerY: .nan, scale: .nan)
    private var lastFrameCamera = MapCamera(centerX: .nan, centerY: .nan, scale: .nan)
    private var cachedSeasonBucket: Int = -999
    private var cachedLightBucket: Int = -999
    private var baseCacheValid = false
    private var overlayCacheValid = false
    private var terrainTextures: [Int: MTLTexture] = [:]
    private var terrainBatches: [(texture: MTLTexture, buffer: MTLBuffer, count: Int)] = []
    private var scrollMountBuffer: (buffer: MTLBuffer, count: Int)?
    /// 实时天气与灾异区域（1 + 12 个 float4：`[0].x = 数量`，`[1...12] = (worldX, worldY, radius, kind)`，1雪/2旱/3涝/4疫/5丰）。
    var weatherUniforms: [SIMD4<Float>] = Array(repeating: .zero, count: 13)
    /// Army icons grouped by unit type: the texture and its quads.
    private var units: [(texture: MTLTexture, buffer: MTLBuffer, count: Int, pool: MapBufferPool, isSheet: Bool)] = []
    let positions: MTLBuffer
    private(set) var indices: MTLBuffer
    private(set) var indexCount: Int
    private var colors: MTLBuffer
    private var provinceLines: (buffer: MTLBuffer, count: Int)?
    private var rivers: (buffer: MTLBuffer, count: Int)?
    private var relief: (buffer: MTLBuffer, count: Int)?
    private var outlines: (buffer: MTLBuffer, count: Int)?
    private var icons: (buffer: MTLBuffer, count: Int)?
    /// Sea lanes between harbours. Rebuilt when the port list changes, hidden by the display switch.
    private var seaLanes: (buffer: MTLBuffer, count: Int)?
    /// 海岸海港微缩徽记（木栈桥＋港湾锚标，随海港列表同步更新）。
    private var portIcons: (buffer: MTLBuffer, count: Int)?
    /// 经纬线: twelve meridians and eight parallels over the map, built once on first use.
    private lazy var gridLines: (buffer: MTLBuffer, count: Int)? = {
        var m = ColoredMesh()
        let w = self.map.width, h = self.map.height, ink = RGB(hex: 0x3A3027), width = MapLayers.lineWidth * 0.5
        for i in 1..<12 { let x = w * Float(i) / 12; m.polyline([x, 0, x, h], width: width, ink, alpha: 0.28) }
        for j in 1..<8 { let y = h * Float(j) / 8; m.polyline([0, y, w, y], width: width, ink, alpha: j == 4 ? 0.42 : 0.28) }
        return self.buffer(m.vertices, stride: 6)
    }()
    private var seaLaneKey: [SIMD2<Float>] = []
    /// 要塞 marks beside fortified cities.
    private var forts: (buffer: MTLBuffer, count: Int)?
    private var fortKey: [SIMD2<Float>] = []
    private var holyKey: [SIMD2<Float>] = []
    /// Warm-authored sea bytes. Recoloured into `sea` for the selected preset.
    private var seaSource: [UInt8] = []
    private var seaMask: [UInt8] = []
    private var coastRefined = false
    /// 卷轴边缘: the map's paper edge darkens like an old scroll and a double ink rule frames it.
    private var frame: (buffer: MTLBuffer, count: Int)?
    /// The paper band and rules round the map (always drawn).
    private var mount: (buffer: MTLBuffer, count: Int)?
    private let sea: MTLTexture?
    private let parchment: MTLTexture?
    private let paperDetail: MTLTexture?
    private let sampler: MTLSamplerState?
    private let repeatSampler: MTLSamplerState?
    private(set) var map: WorldMap { didSet { revealFields = nil; revealFieldData = nil; coastInk = nil } }
    /// 勾勒海岸 (MapDetail.coastInk), kept only while a reveal runs.
    private var coastInk: (buffer: MTLBuffer, count: Int)?
    private(set) var nationColors: [RGB]
    private(set) var tint: [Int: RGB] = [:]
    private(set) var fills: [RGB]?
    /// 视图标识（国家、联盟、家族……）：同一视图里填色随归属变是数据刷新（渐变），换视图是瞬切。
    private(set) var viewKey = ""
    var camera: MapCamera
    var onDraw: ((CFTimeInterval) -> Void)?
    private(set) var mode: MapMode = .political
    private(set) var highlight: Int?
    /// 四时节气光影相位（0..1 对应春→夏→秋→冬，负数表示未启用）。
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
    }
    /// 跨世界复用的共享 Metal 资产（已编译着色器库、20 条渲染管线、宣纸/纤维纹理、16 张军牌兵种纹理与采样器）：
    /// 标题页首次建图编译一次，随后进入新世界、读档或自绘地图直接零耗时复用，彻底根治进局 ~450ms 冻结卡顿！
    private struct SharedMetalAssets {
        let deviceID: ObjectIdentifier
        let pixelFormat: MTLPixelFormat
        let sampleCount: Int
        let cellPipeline: MTLRenderPipelineState
        let revealPipeline: MTLRenderPipelineState
        let veilPipeline: MTLRenderPipelineState
        let fadePipeline: MTLRenderPipelineState
        let linePipeline: MTLRenderPipelineState
        let flatPipeline: MTLRenderPipelineState
        let coloredPipeline: MTLRenderPipelineState
        let deskPipeline: MTLRenderPipelineState
        let seaPipeline: MTLRenderPipelineState
        let texturePipeline: MTLRenderPipelineState
        let multiplyPipeline: MTLRenderPipelineState
        let spriteShadowPipeline: MTLRenderPipelineState
        let spritePipeline: MTLRenderPipelineState
        let spriteSheetShadowPipeline: MTLRenderPipelineState
        let spriteSheetPipeline: MTLRenderPipelineState
        let terrainPipeline: MTLRenderPipelineState
        let scrollBorderPipeline: MTLRenderPipelineState
        let blitOpaquePipeline: MTLRenderPipelineState
        let blitPremulPipeline: MTLRenderPipelineState
        let sweepPipeline: MTLRenderPipelineState
        let inkPipes: InkPipelines
        let parchment: MTLTexture?
        let paperDetail: MTLTexture?
        let sampler: MTLSamplerState?
        let repeatSampler: MTLSamplerState?
        let unitTextures: [String: MTLTexture]
    }
    private static var sharedAssets: SharedMetalAssets?

    /// The blank sheet the map is painted on (the parchment is multiplied over it).
    static let paper = RGB(hex: 0xEDE3CC)
    struct QuadUniforms { var origin: SIMD2<Float>; var size: SIMD2<Float> }

    init?(view: MTKView, map: WorldMap, parchmentURL: URL?, unitURL: (String) -> URL? = { _ in nil }) {
        guard let device = view.device, let queue = device.makeCommandQueue() else {
            NSLog("Lieguoji Metal: no rendering device or command queue")
            return nil
        }
        self.device = device; self.queue = queue; self.map = map
        nationColors = map.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        camera = MapCamera.fit(map: (Double(map.width), Double(map.height)), viewport: (390, 844))
        // 2× MSAA 在高分 Retina 屏上观感清晰且显存带宽与发热减半（较 4× MSAA 显著降温省电）。
        view.sampleCount = device.supportsTextureSampleCount(2) ? 2 : 1
        // Colours are sRGB as the web draws them; blend and store them unconverted, like Pixi.
        view.colorPixelFormat = .bgra8Unorm

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
                enum Blend { case none, alpha, premultiplied, multiply }
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
                    case .premultiplied:
                        a.isBlendingEnabled = true
                        a.sourceRGBBlendFactor = .one; a.destinationRGBBlendFactor = .oneMinusSourceAlpha
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

                var uTex: [String: MTLTexture] = [:]
                for role in ["infantry", "spear", "shield", "archer", "crossbow", "cavalry", "heavy", "horseArcher", "elite", "elephant", "Fleet", "Transport", "Port", "Merchant"] {
                    let probe = ["Fleet", "Transport", "Port", "Merchant"].contains(role) ? role : (UnitKinds.kinds.first { $0.role.rawValue == role }?.key ?? "Infantry")
                    guard let image = UnitArt.image(probe) else { continue }
                    if let texture = try? loader.newTexture(cgImage: image, options: [.SRGB: false, .generateMipmaps: true]) { uTex[role] = texture }
                    else if let texture = Self.texture(device, image) { uTex[role] = texture }
                }
                uTex["banner"] = uTex["elite"]
                let plateArt = UIGraphicsImageRenderer(size: CGSize(width: 128, height: 128), format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; f.preferredRange = .standard; return f }()).image { ctx in
                    let g = ctx.cgContext
                    func shieldPath(inset d: CGFloat) -> CGPath {
                        let p = CGMutablePath()
                        let l = 10 + d, r = 118 - d, t = 8 + d, midY = 74 - d * 0.15, b = 120 - d
                        let corner: CGFloat = max(4, 16 - d * 0.65)
                        p.move(to: CGPoint(x: l + corner, y: t))
                        p.addLine(to: CGPoint(x: r - corner, y: t))
                        p.addQuadCurve(to: CGPoint(x: r, y: t + corner), control: CGPoint(x: r, y: t))
                        p.addLine(to: CGPoint(x: r, y: midY))
                        p.addQuadCurve(to: CGPoint(x: 64, y: b), control: CGPoint(x: r - 2, y: b - 14))
                        p.addQuadCurve(to: CGPoint(x: l, y: midY), control: CGPoint(x: l + 2, y: b - 14))
                        p.addLine(to: CGPoint(x: l, y: t + corner))
                        p.addQuadCurve(to: CGPoint(x: l + corner, y: t), control: CGPoint(x: l, y: t))
                        p.closeSubpath()
                        return p
                    }
                    g.setFillColor(red: 0.10, green: 0.10, blue: 0.10, alpha: 1)
                    g.addPath(shieldPath(inset: 0)); g.fillPath()
                    g.setFillColor(red: 0.68, green: 0.68, blue: 0.68, alpha: 1)
                    g.addPath(shieldPath(inset: 5.5)); g.fillPath()
                    let inner = shieldPath(inset: 8.5)
                    g.saveGState()
                    g.addPath(inner); g.clip()
                    if let grad = CGGradient(colorSpace: CGColorSpaceCreateDeviceRGB(), colorComponents: [1.0, 1.0, 1.0, 1.0, 0.93, 0.93, 0.93, 1.0, 0.78, 0.78, 0.78, 1.0], locations: [0.0, 0.52, 1.0], count: 3) {
                        g.drawLinearGradient(grad, start: CGPoint(x: 16, y: 12), end: CGPoint(x: 112, y: 116), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
                    } else {
                        g.setFillColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1); g.fill(CGRect(x: 0, y: 0, width: 128, height: 128))
                    }
                    g.restoreGState()
                    g.setStrokeColor(red: 0.36, green: 0.36, blue: 0.36, alpha: 0.50); g.setLineWidth(1.9)
                    g.addPath(shieldPath(inset: 14.0)); g.strokePath()
                    g.setFillColor(red: 0.34, green: 0.34, blue: 0.34, alpha: 0.60)
                    g.fillEllipse(in: CGRect(x: 28, y: 20, width: 5.5, height: 5.5))
                    g.fillEllipse(in: CGRect(x: 94.5, y: 20, width: 5.5, height: 5.5))
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
                    linePipeline: try pipeline("lineVertex", "flatFragment", .alpha),
                    flatPipeline: try pipeline("flatVertex", "flatFragment", .alpha),
                    coloredPipeline: try pipeline("coloredVertex", "colorFragment", .alpha),
                    deskPipeline: try pipeline("deskVertex", "deskFragment", .none),
                    seaPipeline: try pipeline("seaVertex", "seaFragment", .none),
                    texturePipeline: try pipeline("quadVertex", "textureFragment", .none),
                    multiplyPipeline: try pipeline("seaVertex", "parchmentFragment", .multiply),
                    spriteShadowPipeline: try pipeline("spriteShadowVertex", "spriteShadowFragment", .alpha),
                    spritePipeline: try pipeline("spriteVertex", "spriteFragment", .alpha),
                    spriteSheetShadowPipeline: try pipeline("spriteSheetShadowVertex", "spriteShadowFragment", .alpha),
                    spriteSheetPipeline: try pipeline("spriteSheetVertex", "spriteSheetFragment", .alpha),
                    terrainPipeline: try pipeline("terrainVertex", "terrainFragment", .alpha),
                    scrollBorderPipeline: try pipeline("terrainVertex", "scrollMountFragment", .alpha),
                    blitOpaquePipeline: try pipeline("blitVertex", "blitFragment", .none),
                    blitPremulPipeline: try pipeline("blitVertex", "blitFragment", .premultiplied),
                    sweepPipeline: try pipeline("sweepVertex", "sweepFragment", .alpha),
                    inkPipes: try InkPipelines.make(device: device, library: library, mainFormat: view.colorPixelFormat, sampleCount: view.sampleCount),
                    parchment: pTex,
                    paperDetail: dTex,
                    sampler: smp,
                    repeatSampler: rsmp,
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
        linePipeline = assets.linePipeline
        flatPipeline = assets.flatPipeline
        coloredPipeline = assets.coloredPipeline
        deskPipeline = assets.deskPipeline
        seaPipeline = assets.seaPipeline
        texturePipeline = assets.texturePipeline
        multiplyPipeline = assets.multiplyPipeline
        spriteShadowPipeline = assets.spriteShadowPipeline
        spritePipeline = assets.spritePipeline
        spriteSheetShadowPipeline = assets.spriteSheetShadowPipeline
        spriteSheetPipeline = assets.spriteSheetPipeline
        terrainPipeline = assets.terrainPipeline
        scrollBorderPipeline = assets.scrollBorderPipeline
        blitOpaquePipeline = assets.blitOpaquePipeline
        blitPremulPipeline = assets.blitPremulPipeline
        sweepPipeline = assets.sweepPipeline
        inkPipes = assets.inkPipes
        parchment = assets.parchment
        paperDetail = assets.paperDetail
        sampler = assets.sampler
        repeatSampler = assets.repeatSampler
        unitTextures = assets.unitTextures

        let mesh = CellMesh(map: map)
        guard let p = device.makeBuffer(bytes: mesh.positions, length: mesh.positions.count * 4, options: .storageModeShared),
              let i = device.makeBuffer(bytes: mesh.indices, length: mesh.indices.count * 4, options: .storageModeShared) else { return nil }
        positions = p; indices = i; indexCount = mesh.indices.count
        let c = CellMesh.colors(map: map, mode: .political, nationColors: nationColors)
        guard let cb = device.makeBuffer(bytes: c, length: c.count * 4, options: .storageModeShared) else { return nil }
        colors = cb
        // Sea texture: authored warm, shown in the active preset (preset 0 until settings arrive).
        let seaDescriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: map.seaWidth, height: map.seaHeight, mipmapped: false)
        seaDescriptor.usage = .shaderRead
        let seaTexture = device.makeTexture(descriptor: seaDescriptor)
        sea = seaTexture
        seaSource = map.seaRGBA
        super.init()
        // Layers built off the main thread for this very map are used as they are.
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
        frame = buffer(MapLayers.scrollFrame(width: map.width, height: map.height).vertices, stride: 6)
        mount = buffer(MapLayers.mapMount(width: map.width, height: map.height).vertices, stride: 6)
        uploadSea()
        terrainTextures.removeAll()
        terrainBatches.removeAll()
        rebuildScrollBorders(width: map.width, height: map.height)
        if let start = map.meta.economy {
            setArmies(start.armies.filter { $0.troops > 0 }.enumerated().map { ArmySprite(army: $0.offset, x: $0.element.x, y: $0.element.y, unit: $0.element.unit, nation: $0.element.nation, selected: false) }, route: [])
        }
    }

    /// 自绘地图: the terrain itself changed (land raised from the sea, coasts moved): the land mesh,
    /// relief marks, province lines and outlines are rebuilt, and the sea texture when given.
    func setTerrain(_ next: WorldMap, refreshSea: Bool) {
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
        terrainBatches.removeAll()
        outlines = buffer(MapLayers.outlines(next, wide: borderWide).vertices, stride: 6)
        icons = buffer(MapLayers.cityIcons(next).vertices, stride: 6)
        if refreshSea {
            seaSource = next.seaRGBA; seaMask = MapLayers.waterlines(next); uploadSea(); seaLaneKey = []; seaLanes = nil
            ornaments = buffer(MapLayers.ornaments(next).vertices, stride: 6); fineDetail = buffer(MapLayers.fineDetail(next).vertices, stride: 6)
        }
        ink?.terrain = nil
        baseCacheValid = false
        overlayCacheValid = false
        recolor()
    }

    /// Harbour points in map units. Empty hides the lanes even when the switch is on.
    @discardableResult func setSeaPorts(_ ports: [SIMD2<Float>]) -> Bool {
        guard ports != seaLaneKey else { return false }
        seaLaneKey = ports
        overlayCacheValid = false
        seaLanes = buffer(MapLayers.seaLanes(map, ports: ports.map { (x: $0.x, y: $0.y) }).vertices, stride: 6)
        // 海岸海港微缩徽记：柔影＋实木栈桥＋靛蓝象牙铁锚圆徽
        var m = ColoredMesh()
        let u = MapLayers.cityUnit
        let shadow = RGB(hex: 0x1A242B), navy = RGB(hex: 0x264866), ivory = RGB(hex: 0xF7EFE0), timber = RGB(hex: 0x6F4A2B), gold = RGB(hex: 0xD6AB4E)
        for p in ports {
            let x = p.x, y = p.y, r = u * 1.15
            m.disc(x + r * 0.22, y + r * 0.25, radius: r * 1.05, shadow, alpha: 0.26, sides: 12)
            m.segment(x - r * 1.15, y + r * 0.55, x + r * 1.15, y + r * 0.55, width: r * 0.42, timber, alpha: 0.92)
            m.disc(x, y, radius: r, navy, alpha: 0.96, sides: 14)
            m.disc(x, y, radius: r * 0.72, ivory, alpha: 0.96, sides: 12)
            // 迷你锚杆与横杠
            m.segment(x, y - r * 0.46, x, y + r * 0.42, width: r * 0.22, navy, alpha: 0.96)
            m.segment(x - r * 0.34, y - r * 0.16, x + r * 0.34, y - r * 0.16, width: r * 0.18, navy, alpha: 0.96)
            m.polyline([x - r * 0.38, y + r * 0.18, x, y + r * 0.46, x + r * 0.38, y + r * 0.18], width: r * 0.19, navy, alpha: 0.96)
            m.disc(x, y - r * 0.46, radius: r * 0.18, gold, alpha: 0.96, sides: 8)
        }
        portIcons = ports.isEmpty ? nil : buffer(m.vertices, stride: 6)
        return true
    }

    /// 手绘河流（玩家在编辑器里画的）。
    private var extraRivers: (buffer: MTLBuffer, count: Int)?
    /// 舆图细节 (MapDetail.swift): the chart ornaments, and what shows only when zoomed in.
    private var ornaments: (buffer: MTLBuffer, count: Int)?
    private var fineDetail: (buffer: MTLBuffer, count: Int)?
    private var extraRiverKey: [[Float]] = []
    /// 手绘河流: the player's rivers, in the map's own water colour.
    func setExtraRivers(_ paths: [[Float]]) -> Bool {
        guard paths != extraRiverKey else { return false }
        extraRiverKey = paths
        overlayCacheValid = false
        var m = ColoredMesh()
        for p in paths where p.count >= 4 { m.polyline(p, width: 2.6, RGB(0.23, 0.49, 0.6), alpha: 0.92) }
        extraRivers = paths.isEmpty ? nil : buffer(m.vertices, stride: 6)
        return true
    }
    @discardableResult func setForts(_ points: [SIMD2<Float>], holy: [SIMD2<Float>] = []) -> Bool {
        guard points != fortKey || holy != holyKey else { return false }
        fortKey = points; holyKey = holy
        overlayCacheValid = false
        var m = ColoredMesh()
        let u = MapLayers.cityUnit
        let shadow = RGB(hex: 0x1E140A), ink = RGB(0.18, 0.13, 0.09), wallLit = RGB(0.95, 0.91, 0.82), wallShade = RGB(0.76, 0.70, 0.59), seal = RGB(0.74, 0.18, 0.14)
        func rect(_ x0: Float, _ y0: Float, _ x1: Float, _ y1: Float, _ c: RGB, alpha: Float = 1) { m.fill([x0, y0, x1, y0, x1, y1, x0, y1], c, alpha: alpha) }
        for p in points {
            let x = p.x + 2.55 * u, y = p.y - 2.35 * u, w = 2.45 * u, h = 1.85 * u, k = w / 5
            // 要塞东南投影 + 墨石城垛 + 明暗双坡石壁 + 拱形铁门 + 城头小红旗
            rect(x - w / 2 + 0.45 * u, y - h / 2 + 0.50 * u, x + w / 2 + 0.55 * u, y + h / 2 + 0.55 * u, shadow, alpha: 0.28)
            rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, ink)
            for i in [0, 2, 4] { rect(x - w / 2 + Float(i) * k, y - h / 2 - k * 1.15, x - w / 2 + Float(i + 1) * k, y - h / 2, ink) }
            rect(x - w / 2 + k * 0.52, y - h / 2 + k * 0.52, x, y + h / 2 - k * 0.52, wallLit)
            rect(x, y - h / 2 + k * 0.52, x + w / 2 - k * 0.52, y + h / 2 - k * 0.52, wallShade)
            rect(x - k * 0.48, y + h / 2 - k * 1.85, x + k * 0.48, y + h / 2, ink)
            // 守备朱红令旗
            m.segment(x + w * 0.30, y - h * 0.5 - k * 1.1, x + w * 0.30, y - h * 0.5 - k * 2.7, width: k * 0.35, ink, alpha: 0.95)
            m.fill([x + w * 0.30, y - h * 0.5 - k * 2.7, x + w * 0.30 + k * 1.6, y - h * 0.5 - k * 2.15, x + w * 0.30, y - h * 0.5 - k * 1.6], seal, alpha: 0.96)
        }
        // 圣地：柔和金辉光晕 + 八芒墨边鎏金圣星 + 象牙珠心
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
        forts = buffer(m.vertices, stride: 6)
        return true
    }

    private func uploadSea() {
        guard let sea, seaSource.count == map.seaWidth * map.seaHeight * 4 else { return }
        var bytes = MapPalette.recolorSea(seaSource, from: .warmPaper, to: MapPalette.ocean(display.ocean))
        if display.mapDetail ?? true {
            // The brush's wash under the waterlines (the lines stay crisp), on the cold sea and the warm one alike.
            MapLayers.applySeaWash(width: map.seaWidth, height: map.seaHeight, to: &bytes)
            MapLayers.applyWaterlines(seaMask, to: &bytes)
        }
        bytes.withUnsafeBytes { raw in
            if let base = raw.baseAddress {
                sea.replace(region: MTLRegionMake2D(0, 0, map.seaWidth, map.seaHeight), mipmapLevel: 0, withBytes: base, bytesPerRow: map.seaWidth * 4)
            }
        }
        baseCacheValid = false
    }

    /// Ownership changed (conquest, rebellion): recolour the land and redraw the state outlines.
    /// The state outlines are rebuilt on a background queue (the whole map's border walk); the land
    /// is recoloured at once, and the new outlines replace the old ones when ready.
    /// `skipStatic`: during replay, static city icons & province lines never change and are skipped to avoid stutter.
    /// `skipOutlines`: during fast replay slider scrubbing, skips border retessellation until the finger pauses/releases.
    /// `animateColors`: enables smooth GPU vertex color dissolve (`fadeVertex`) between frames.
    func setMap(_ next: WorldMap, replayFast: Bool = false, skipStatic: Bool = false, skipOutlines: Bool = false, animateColors: Bool? = nil) {
        let work = workRevision.replaceMap()
        let noStatic = replayFast || skipStatic
        let doFade = animateColors ?? !replayFast
        ink?.scrubbingReplay = skipOutlines
        // The founded world brings the smoothed coast the preview lacked: the waterlines and sand follow it.
        if !coastRefined && !next.coast.isEmpty {
            coastRefined = true
            DispatchQueue.global(qos: .utility).async { [weak self] in
                let mask = MapLayers.waterlines(next), marks = MapLayers.ornaments(next).vertices
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.seaSource = next.seaRGBA; self.seaMask = mask; self.ornaments = self.buffer(marks, stride: 6); self.overlayCacheValid = false; self.uploadSea(); self.onOutlines?()
                }
            }
        }
        map = next
        nationColors = next.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        // 州界多边形终身静态无需重建；城池图标仅在都城迁移或首次载入时重建，彻底消除战争推进期每步重造百万顶点卡顿。
        let capitals = next.meta.nations.map(\.capital)
        let rebuildIcons = !noStatic && (icons == nil || capitals != lastCapitalKey)
        if rebuildIcons { lastCapitalKey = capitals }
        let wide = borderWide
        let inputs = BaseInputs(mode: mode, nationColors: nationColors, highlight: highlight, tint: tint, fills: fills, density: Float(display.colorDensity), terrain: terrainBase, shade: shade)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let vertices = skipOutlines ? nil : MapLayers.outlines(next, wide: wide).vertices
            let marks = rebuildIcons ? MapLayers.cityIcons(next).vertices : nil
            let colours = MapRenderer.baseColors(next, inputs)
            DispatchQueue.main.async {
                guard let self, self.workRevision.acceptsGeometry(work) else { return }
                if let vertices, self.workRevision.acceptsOutlineGeometry(work) { self.outlines = self.buffer(vertices, stride: 6); self.overlayCacheValid = false }
                if let marks { self.icons = self.buffer(marks, stride: 6); self.overlayCacheValid = false }
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
    /// What the land colours are computed from (copied, so a background thread can work on them).
    struct BaseInputs {
        let mode: MapMode; let nationColors: [RGB]; let highlight: Int?; let tint: [Int: RGB]; let fills: [RGB]?
        let density: Float; let terrain: [Float]?; let shade: [Float]
    }
    /// The shaded land colours of a mode and the terrain colours (recolor's base), as a pure function.
    static func baseColors(_ map: WorldMap, _ i: BaseInputs) -> (land: [Float], terrain: [Float], terrainBase: [Float], shade: [Float]) {
        var c = CellMesh.colors(map: map, mode: i.mode, nationColors: i.nationColors, highlightProvince: i.highlight, tint: i.tint, provinceColors: i.mode == .political ? i.fills : nil)
        let terrainBase = i.terrain ?? CellMesh.colors(map: map, mode: .terrain, nationColors: i.nationColors)
        var terrain = terrainBase
        if i.mode == .political && i.density < 1 {
            // 专题视图（联盟/文化/家族/宗教/政体等）须忠实呈现图例分色，避免低浓度被底图草地/沙漠漂淡撞色。
            let k = i.fills != nil ? max(0.84, i.density) : max(0, i.density)
            for j in 0..<min(c.count, terrain.count) where j % 4 != 3 { c[j] = terrain[j] + (c[j] - terrain[j]) * k }
        }
        let shade = i.shade.count == map.vertices.count / 2 ? i.shade : MapLayers.vertexHillshade(map)
        for v in shade.indices {
            let k = shade[v]
            for j in 0..<3 { c[v * 4 + j] = min(1, c[v * 4 + j] * k); terrain[v * 4 + j] = min(1, terrain[v * 4 + j] * k) }
        }
        return (c, terrain, terrainBase, shade)
    }
    private var workRevision = MapWorkRevision()
    private var lastCapitalKey: [Int] = []
    private var borderWide = Set<Int>()
    /// The open nation and the owner of the selected province, drawn at twice the border width.
    func setBorderEmphasis(_ wide: Set<Int>) {
        guard wide != borderWide else { return }
        borderWide = wide
        let work = workRevision.changeOutlines()
        let next = map
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let vertices = MapLayers.outlines(next, wide: wide).vertices
            DispatchQueue.main.async {
                guard let self, self.workRevision.acceptsOutlineGeometry(work) else { return }
                self.outlines = self.buffer(vertices, stride: 6)
                self.overlayCacheValid = false
                self.onOutlines?()
            }
        }
    }
    /// Called on the main queue when new outlines are ready to draw.
    var onOutlines: (() -> Void)?

    /// 开卷: 0 is blank paper; the sea is brushed in, the land inked from the shore to the peaks, the
    /// states' colours spread from their capitals, then lines, marks and names; at 1 every layer is drawn.
    private(set) var reveal: Float = 1
    /// Only a value for the reveal shader: no colours are recomputed while the map is painted.
    func setReveal(_ t: Float) {
        reveal = max(0, min(1, t))
        if reveal < 1 { baseCacheValid = false; overlayCacheValid = false }
        if base == nil { recolor() }
    }
    /// The map's colours before the generation reveal: the land colours of the current mode and the
    /// terrain colours, both shaded. Kept while only the reveal moves, so the animation does not
    /// recompute every cell's palette 60 times a second.
    private(set) var base: (land: [Float], terrain: [Float], owners: [Int], palette: [RGB])? { didSet { revealTerrain = nil } }
    /// For the reveal shader: each vertex's two fields (RevealFields.swift) and the shaded terrain colours.
    private var revealFields: MTLBuffer?
    private var revealFieldData: [Float]?
    private var revealTerrain: MTLBuffer?
    private func revealBuffers() -> (fields: MTLBuffer, terrain: MTLBuffer)? {
        guard let base else { return nil }
        if revealTerrain == nil { revealTerrain = device.makeBuffer(bytes: base.terrain, length: max(4, base.terrain.count * 4), options: .storageModeShared) }
        if revealFields == nil {
            var data = revealFieldData ?? []
            if data.count != map.vertices.count { data = MapLayers.revealFields(map) }
            revealFieldData = nil
            revealFields = device.makeBuffer(bytes: data, length: max(8, data.count * 4), options: .storageModeShared)
        }
        guard let a = revealFields, let b = revealTerrain else { return nil }
        return (a, b)
    }

    private(set) var display = DisplaySettings()
    func setDisplay(_ d: DisplaySettings) {
        let recolour = d.colorDensity != display.colorDensity
        let seaChanged = d.ocean != display.ocean, detailChanged = d.mapDetail != display.mapDetail
        display = d
        baseCacheValid = false
        overlayCacheValid = false
        if seaChanged || detailChanged { uploadSea() }
        if recolour { rebuildAppearance() }
    }
    private func recolor() {
        if base == nil {
            var c = CellMesh.colors(map: map, mode: mode, nationColors: nationColors, highlightProvince: highlight, tint: tint, provinceColors: mode == .political ? fills : nil)
            if terrainBase == nil { terrainBase = CellMesh.colors(map: map, mode: .terrain, nationColors: nationColors) }
            var terrain = terrainBase!
            // 国家颜色浓度: state colours blended toward the terrain colours; 专题视图保持高保真分色。
            if mode == .political && display.colorDensity < 1 {
                let k = fills != nil ? Float(max(0.84, display.colorDensity)) : Float(max(0, display.colorDensity))
                for i in 0..<min(c.count, terrain.count) where i % 4 != 3 { c[i] = terrain[i] + (c[i] - terrain[i]) * k }
            }
            // Relief shading on the land (every map mode).
            if shade.count != map.vertices.count / 2 { shade = MapLayers.vertexHillshade(map) }
            for v in shade.indices {
                let k = shade[v]
                for j in 0..<3 {
                    c[v * 4 + j] = min(1, c[v * 4 + j] * k)
                    terrain[v * 4 + j] = min(1, terrain[v * 4 + j] * k)
                }
            }
            base = (c, terrain, map.meta.provinces.map(\.nation), nationColors)
        }
        guard let base else { return }
        // The generation reveal (land rising from the coast to the peaks over 0…0.45, the states' colours
        // washing in over 0.55…0.75) is drawn by revealVertex from these colours: no per-frame CPU work.
        let c = base.land
        let colourBytes = c.count * MemoryLayout<Float>.stride
        let uploaded = colorBufferPool.write(device: device, length: max(16, colourBytes)) { buffer in
            c.withUnsafeBytes { raw in
                if let ptr = raw.baseAddress { memcpy(buffer.contents(), ptr, colourBytes) }
            }
        }
        if let b = uploaded {
            // 归属变化（揭幕之后）逐顶点渐变；切换视图与揭幕立即到位。正在晕染的州由晕染接手。
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
            baseCacheValid = false
        }
    }
    private let colorBufferPool = MapBufferPool()
    private let prevColorBufferPool = MapBufferPool()
    private(set) var shade: [Float] = []
    private(set) var terrainBase: [Float]?

    /// tier: 1–3 figures by strength; banner: 0 none, 1 a general's, 2 the ruler's (御驾亲征).
    /// The bitmap copied straight into a texture (if the loader refuses it).
    static func texture(_ device: MTLDevice, _ image: CGImage) -> MTLTexture? {
        let w = image.width, h = image.height
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
        /// 正在交锋：驱动序列帧切换至高频交战动作（零代码抖动）。
        var fighting = false
        /// Falling back: drawn faded (败退), without the idle drift.
        var retreating = false
        /// 所属文明标识（用于区分东方楼船战舰与西洋风帆战舰等差异化序列帧）。
        var culture: String = ""
        /// 是否处于跨海登船运兵状态（切换为运兵运输船序列帧）。
        var embarked: Bool = false
        /// 显式出发点（用于山河回放中先锋大军沿战线真实行军至目标州）。
        var startX: Float? = nil
        var startY: Float? = nil
    }
    private var unitTextures: [String: MTLTexture] = [:]
    private var route: (buffer: MTLBuffer, count: Int)?
    private(set) var armySprites: [ArmySprite] = []
    /// 溃散: armies gone since the last snapshot, fading out where they fell over one leg (drawn only).
    private var dying: [ArmySprite] = []
    /// 本步阵亡军队的阵亡时刻（秒，自本步动画开始；GameModel 按先后错开），图标停在原处到那一刻再淡去。
    var deathDelays: [String: Double] = [:]
    private var routePoints: [SIMD2<Float>] = []

    /// Army icons at their current points (moving armies follow their journey) and the selected
    /// army's remaining route.
    /// Icons walk: each drawn point chases its army's engine point every frame (exponential approach
    /// whose time constant follows the play step), so a new target never makes an icon jump — not on
    /// a long step, not when two armies meet, not when a battle ends. Only a jump across the map
    /// (an army re-formed at home) appears at once.
    /// Every icon walks at an even pace from where it stood to its new point over one play step. The
    /// two points are written once per step and the GPU moves the icons every frame (spriteVertex
    /// mixes them by `progress`); the CPU used to rebuild every army's vertices and buffers each frame.
    private var legFrom: [String: SIMD2<Float>] = [:]
    private var legTo: [String: SIMD2<Float>] = [:]
    private var legStart: CFTimeInterval = 0
    private var legLength: CFTimeInterval = 0.3
    /// Icons that fade in over this leg (new armies, re-formed ones).
    private var fresh = Set<String>()
    private var chasing = false
    /// The play step interval (seconds); a leg lasts a little longer so the next one starts before it ends.
    var tweenDuration: CFTimeInterval = 0.3
    var tweenEase = true
    var isAnimating: Bool { chasing || fading || washesAnimating }
    private func progress(_ now: CFTimeInterval) -> Float {
        legLength <= 0 ? 1 : Float(min(1, max(0, (now - legStart) / legLength)))
    }
    /// 军队图标此刻画出的位置（墨场按它落墨）。
    func displayedPoint(_ s: ArmySprite) -> SIMD2<Float> { displayed(s) }
    private func displayed(_ s: ArmySprite) -> SIMD2<Float> {
        guard !s.key.isEmpty, let a = legFrom[s.key], let b = legTo[s.key] else {
            return (s.x.isFinite && s.y.isFinite) ? SIMD2(s.x, s.y) : .zero
        }
        return Self.hermite(a, b, legLead[s.key] ?? (b - a), progress(CACurrentMediaTime()))
    }
    /// The leg's curve (as spriteVertex draws it): from a leaving along m0, arriving at b along b − a.
    static func hermite(_ a: SIMD2<Float>, _ b: SIMD2<Float>, _ m0: SIMD2<Float>, _ t: Float) -> SIMD2<Float> {
        let fallback = (b.x.isFinite && b.y.isFinite) ? b : ((a.x.isFinite && a.y.isFinite) ? a : SIMD2<Float>(0, 0))
        guard a.x.isFinite, a.y.isFinite, b.x.isFinite, b.y.isFinite, m0.x.isFinite, m0.y.isFinite, t.isFinite else { return fallback }
        let clamped = min(1, max(0, t))
        let t2 = clamped * clamped, t3 = t2 * clamped
        let p = a * (2 * t3 - 3 * t2 + 1) + m0 * (t3 - 2 * t2 + clamped) + b * (3 * t2 - 2 * t3) + (b - a) * (t3 - t2)
        return (p.x.isFinite && p.y.isFinite) ? p : fallback
    }
    /// Each army's leaving tangent for this leg (map units over the leg) and last real velocity (map units / sec)
    /// so consecutive simulation steps maintain C1 smooth velocity without stop-start hitches even if a step lands slightly late.
    private var legLead: [String: SIMD2<Float>] = [:]
    private var lastLegVelocity: [String: (vel: SIMD2<Float>, time: CFTimeInterval)] = [:]
    /// Each standing army's seat in its ring (icon units), for the labels drawn over the map.
    private(set) var spread: [String: SIMD2<Float>] = [:]
    /// Whether the icons are still walking (the GPU does the moving).
    private func advanceChase() -> Float {
        let t = progress(CACurrentMediaTime())
        chasing = t < 1
        return t
    }

    /// Where every icon is drawn right now (mid-walk included), for taps and troop labels.
    /// 上版经典缩放曲线，供着色器和屏幕点选、兵力条共用。
    static func iconZoom(_ scale: Double) -> Double { 1.12 * min(21.0 / 3.0112, max(6.8 / 3.0112, scale * 0.66)) }
    /// 一支军队主图标在屏幕上的边长（点）。
    static func iconPoints(_ scale: Double, iconScale: Double) -> Double { 2.56 * 0.84 * 0.35 * (1600.0 / 240.0) * 0.6 * iconScale * iconZoom(scale) }
    func placedSprites() -> [(sprite: ArmySprite, x: Float, y: Float)] {
        armySprites.map { s in let p = displayed(s); return (s, p.x, p.y) }
    }

    func setArmies(_ rawSprites: [ArmySprite], route rawPoints: [SIMD2<Float>], snap: Bool = false) {
        let sprites = rawSprites.filter { $0.x.isFinite && $0.y.isFinite }
        let points = rawPoints.filter { $0.x.isFinite && $0.y.isFinite }
        if snap || sprites != armySprites {
            let now = CACurrentMediaTime(), t = progress(now)
            let previous = Dictionary(armySprites.map { ($0.key, $0.reorganizing) }, uniquingKeysWith: { a, _ in a })
            var from = [String: SIMD2<Float>](), to = [String: SIMD2<Float>](), fading = Set<String>(), lead = [String: SIMD2<Float>]()
            var nextVel = [String: (vel: SIMD2<Float>, time: CFTimeInterval)]()
            // 轻微放宽单步滑行时长至步间隔的 1.18 倍，使下一步总在进度约 85% 处无缝接力，消除军队走走停停的顿挫感。
            let newLength = snap ? 0 : max(0.16, tweenDuration * 1.18)
            for s in sprites where !s.key.isEmpty {
                let target = SIMD2(s.x, s.y)
                if !snap, let sx = s.startX, let sy = s.startY, sx.isFinite, sy.isFinite {
                    let origin = SIMD2(sx, sy)
                    from[s.key] = origin; to[s.key] = target
                    lead[s.key] = (target - origin) * 0.55
                    continue
                }
                // Where the icon stands now, mid-walk included (nil: a new army, or a world just opened).
                let here: SIMD2<Float>? = snap ? nil : legFrom[s.key].flatMap { a in legTo[s.key].map { b in Self.hermite(a, b, legLead[s.key] ?? (b - a), t) } }
                guard let p = here, p.x.isFinite, p.y.isFinite else {
                    // A new army fades in where it stands (no walk from nowhere); none on a fresh world.
                    from[s.key] = target; to[s.key] = target
                    if !snap && !armySprites.isEmpty { fading.insert(s.key) }
                    continue
                }
                if s.reorganizing && previous[s.key] != true {
                    // An army re-formed at home: it appears there (the fall plays where it was).
                    from[s.key] = target; to[s.key] = target; fading.insert(s.key)
                } else {
                    from[s.key] = p; to[s.key] = target
                    let chord = target - p, along = (chord.x * chord.x + chord.y * chord.y).squareRoot()
                    if newLength > 0, along.isFinite, along > 0.001 {
                        nextVel[s.key] = (chord / Float(newLength), now)
                    }
                    // 平滑行军：即使上一步刚刚结束（t == 1 且滞后 < 0.45s），也延续上一步实测速度切线，令军团跨步丝滑连贯零停顿。
                    var carriedPerSec: SIMD2<Float>? = nil
                    if let a = legFrom[s.key], let b = legTo[s.key], legLength > 0, t < 0.995 {
                        let m0 = legLead[s.key] ?? (b - a), t2 = t * t
                        let v = a * (6 * t2 - 6 * t) + m0 * (3 * t2 - 4 * t + 1) + b * (6 * t - 6 * t2) + (b - a) * (3 * t2 - 2 * t)
                        carriedPerSec = v / Float(legLength)
                    } else if let prev = lastLegVelocity[s.key], now - prev.time < 0.45 {
                        carriedPerSec = prev.vel
                    }
                    if let vPerSec = carriedPerSec, newLength > 0 {
                        var m = vPerSec * Float(newLength)
                        let k = (m.x * m.x + m.y * m.y).squareRoot()
                        if along < 0.001 || k < 0.0001 || !along.isFinite || !k.isFinite {
                            m = .zero
                        } else {
                            let cos = (m.x * chord.x + m.y * chord.y) / (k * along)
                            if !cos.isFinite || cos < 0.65 {
                                m = chord
                            } else {
                                let w = (cos - 0.65) / 0.35
                                m = m * w + chord * (1 - w)
                                let k2 = (m.x * m.x + m.y * m.y).squareRoot()
                                if k2.isFinite && k2 > along * 0.72 { m *= (along * 0.72) / k2 }
                            }
                        }
                        if m.x.isFinite && m.y.isFinite { lead[s.key] = m }
                    }
                }
            }
            lastLegVelocity = nextVel
            // Armies destroyed or disbanded since the last snapshot fade out where they stood instead of
            // vanishing between two frames (none on a snap: a world opened or reloaded).
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

    // Immutable start/target buffers are replaced only when the snapshot changes.
    // Per-frame interpolation runs in Metal; never overwrite a GPU in-flight buffer.
    private func rebuildArmies() {
        do {
            let sprites = armySprites + dying
            let ghosts = Set(dying.map(\.key))
            let iconSize = Float(2.56 * 0.84 * 0.35 * (1600.0 / 240.0) * 0.6)
            var byRole: [String: [Float]] = [:]
            byRole.reserveCapacity(16)
            // Alpha −1 asks the shader to fade the icon in with the leg's progress.
            var fade: Float = 1
            var end = SIMD2<Float>(0, 0)
            var lead = SIMD2<Float>(0, 0)
            func quad(_ role: String, _ at: SIMD2<Float>, _ c: RGB, _ size: Float, _ sx: Float, _ sy: Float) {
                for (cx, cy) in [(Float(-0.5), Float(-0.5)), (0.5, -0.5), (-0.5, 0.5), (-0.5, 0.5), (0.5, -0.5), (0.5, 0.5)] {
                    byRole[role, default: []].append(contentsOf: [at.x, at.y, cx, cy, c.r, c.g, c.b, fade, size, end.x, end.y, sx, sy, lead.x, lead.y])
                }
            }
            // Armies standing on one spot (a city several armies hold or fight over) fan out in a small
            // ring around it instead of stacking into one blob. Only armies standing still this leg: a
            // marching column re-formed its ring at every step and jerked up, down and sideways.
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
                    // A stable seat for each army in the ring (by its key), whatever the order of the state.
                    list.sort { sprites[$0].key < sprites[$1].key }
                    let radius: Float = list.count <= 3 ? 0.42 : list.count <= 6 ? 0.6 : 0.78
                    for (j, i) in list.enumerated() {
                        let angle = Float(j) / Float(list.count) * 2 * .pi - .pi / 2
                        spread[sprites[i].key] = SIMD2(cos(angle) * radius, sin(angle) * radius)
                    }
                }
            }
            // A column setting out from a ring keeps its seat's offset while it marches (it used to snap from
            // the ring to the centre at the first step: a visible jerk); it takes a new seat when it stops.
            for a in sprites where a.army >= 0 && spread[a.key] == nil && !ghosts.contains(a.key) {
                if let was = self.spread[a.key], (legFrom[a.key] ?? .zero) != (legTo[a.key] ?? .zero) { spread[a.key] = was }
            }
            self.spread = spread
            for a in sprites {
                // Harbours (and merchantmen) keep still: alpha 0.99 tells the shader not to let them drift.
                fade = ghosts.contains(a.key) ? -2 - Float(min(0.85, max(0, (deathDelays[String(a.key.dropFirst())] ?? 0) / max(0.05, legLength)))) : fresh.contains(a.key) ? -1 : a.fighting ? 2 : a.retreating ? 0.55 : a.army <= -100_000 ? 0.99 : 1
                let o = spread[a.key] ?? SIMD2<Float>(0, 0)
                let c = a.selected ? RGB(1, 0.93, 0.55) : nationColors.indices.contains(a.nation) ? nationColors[a.nation] : RGB(1, 1, 1)
                let role = UnitArt.role(a.unit), at = legFrom[a.key] ?? SIMD2(a.x, a.y)
                end = legTo[a.key] ?? at
                lead = legLead[a.key] ?? (end - at)
                let size = iconSize * iconScale * (a.unit == "Port" ? 0.7 : a.unit == "Merchant" ? 0.75 : 1) * (a.selected ? 1.3 : 1)

                // 恢复上版经典雕漆漆盾军牌 + 按编制排成 1–3 枚棋子战阵 / 水师破浪编队，层次清晰锐利。
                let resolvedRole: String = (a.embarked || a.unit == "Transport") ? "Transport" : role
                let isNavalPiece = (resolvedRole == "Fleet" || resolvedRole == "Transport")

                // 统帅／君主亲征帅旗立于棋子右后方
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
                // 陆军按编制排成清晰棋子战阵，水师舰队按舰数排成破浪编队
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
            }.compactMap { role -> (texture: MTLTexture, buffer: MTLBuffer, count: Int, pool: MapBufferPool, isSheet: Bool)? in
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
                return (texture: texture, buffer: buffer, count: data.count / 15, pool: pool, isSheet: role.hasPrefix("sheet_"))
            }
        }
    }
    private var unitBufferPool: [String: MapBufferPool] = [:]

    /// 显示军队 and the icons' size (推演与画面).
    var showArmies = true
    var iconScale: Float = 1 { didSet { if iconScale != oldValue { rebuildArmies() } } }
    /// Layers prepared off the main thread for the next map view (MapLayers.prepare).
    static var prepared: MapLayers.Prepared?

    /// 按地图拓扑构建 5 组青绿山水手绘地形精灵顶点缓冲（每顶点 6 Float：worldX, worldY, u, v, kind, shade），5 次 DrawCall 即可绘满千峰万林。
    func rebuildTerrainSprites(_ source: WorldMap) {
        let stamps = MapLayers.terrainStamps(source)
        var byKind = [Int: [Float]]()
        for st in stamps {
            let k = st.kind.rawValue
            guard terrainTextures[k] != nil else { continue }
            let x0 = st.x - st.width * 0.5, x1 = st.x + st.width * 0.5
            let y0 = st.y - st.height * 0.5, y1 = st.y + st.height * 0.5
            let u0: Float = st.flipX ? 1 : 0, u1: Float = st.flipX ? 0 : 1
            let kf = Float(k), sh = st.shade
            byKind[k, default: []].append(contentsOf: [
                x0, y0, u0, 0, kf, sh,
                x1, y0, u1, 0, kf, sh,
                x0, y1, u0, 1, kf, sh,
                x0, y1, u0, 1, kf, sh,
                x1, y0, u1, 0, kf, sh,
                x1, y1, u1, 1, kf, sh
            ])
        }
        // 按 水乡/沙漠/冻原/丘陵 → 草原/林海 → 山峰 顺序绘制，令高峰雄峙于丘林之上
        let drawOrder = [7, 4, 8, 5, 6, 2, 3, 0, 1]
        terrainBatches = drawOrder.compactMap { k in
            guard let tex = terrainTextures[k], let data = byKind[k], !data.isEmpty,
                  let buf = device.makeBuffer(bytes: data, length: data.count * MemoryLayout<Float>.stride, options: .storageModeShared) else { return nil }
            return (texture: tex, buffer: buf, count: data.count / 6)
        }
    }

    /// 构建程序化古风舆图卷轴装裱的空心四框几何（仅覆盖边缘装裱、卷轴轴头与画心柔和内阴影区，画心内部零片元过绘）。
    private func rebuildScrollBorders(width w: Float, height h: Float) {
        guard w > 0, h > 0 else {
            scrollMountBuffer = nil
            return
        }
        let unit = min(w, h)
        let padX = unit * 0.092
        let padY = unit * 0.104
        let inner = min(unit * 0.030, min(w, h) * 0.25)
        var verts = [Float]()
        verts.reserveCapacity(4 * 6 * 6)
        func appendQuad(_ x0: Float, _ y0: Float, _ x1: Float, _ y1: Float) {
            verts.append(contentsOf: [
                x0, y0, 0, 0, 0, 1,
                x1, y0, 1, 0, 0, 1,
                x0, y1, 0, 1, 0, 1,
                x0, y1, 0, 1, 0, 1,
                x1, y0, 1, 0, 0, 1,
                x1, y1, 1, 1, 0, 1
            ])
        }
        // 四条互不重叠的空心框带：严格避免重叠区域二次混合，同时完全跳过 90%+ 画心内部像素。
        appendQuad(-padX, -padY, w + padX, inner)              // 上带（含上绫边、上轴头、上画心内阴影）
        appendQuad(-padX, h - inner, w + padX, h + padY)       // 下带（含下绫边、下轴头、下画心内阴影）
        appendQuad(-padX, inner, inner, h - inner)             // 左带（含左紫檀轴、左绫边、左画心内阴影）
        appendQuad(w - inner, inner, w + padX, h - inner)      // 右带（含右紫檀轴、右绫边、右画心内阴影）
        if let buf = device.makeBuffer(bytes: verts, length: verts.count * MemoryLayout<Float>.stride, options: .storageModeShared) {
            scrollMountBuffer = (buf, verts.count / 6)
        } else {
            scrollMountBuffer = nil
        }
    }

    /// 更新实时活跃的天时灾异区域（雪灾/大旱/洪涝/瘟疫/丰年），零网格重建直达 GPU 片元着色器。
    func setWeatherZones(_ zones: [(x: Float, y: Float, radius: Float, kind: Float)]) {
        var next = Array(repeating: SIMD4<Float>.zero, count: 13)
        let n = min(12, zones.count)
        next[0] = SIMD4(Float(n), 0, 0, 0)
        for i in 0..<n {
            next[i + 1] = SIMD4(zones[i].x, zones[i].y, max(12, zones[i].radius), zones[i].kind)
        }
        if next != weatherUniforms {
            weatherUniforms = next
            baseCacheValid = false
        }
    }

    private func buffer(_ data: [Float], stride: Int) -> (MTLBuffer, Int)? {
        guard !data.isEmpty, let b = device.makeBuffer(bytes: data, length: data.count * 4, options: .storageModeShared) else { return nil }
        return (b, data.count / stride)
    }

    /// Recolours the land (view mode or selected province highlight).
    func setAppearance(mode: MapMode, highlight: Int?, tint: [Int: RGB] = [:], fills: [RGB]? = nil, view: String = "") {
        guard mode != self.mode || highlight != self.highlight || tint != self.tint || fills != self.fills || view != viewKey else { return }
        // 同一视图里只是填色随推演刷新（归属、联盟变动）：按归属变化渐变，攻占交给晕染。
        let data = mode == self.mode && highlight == self.highlight && tint == self.tint && view == viewKey && fills != nil && self.fills != nil
        // 只换了选中的州（高亮）：不算换视图，正在进行的晕染不收尾。
        let highlightOnly = mode == self.mode && tint == self.tint && fills == self.fills && view == viewKey
        self.mode = mode; self.highlight = highlight; self.tint = tint; self.fills = fills; viewKey = view
        rebuildAppearance(fade: data, viewSwitch: !data && !highlightOnly)
    }
    /// 下一次重着色是换视图（颜色含义变了）：已换底的晕染收尾。
    private var washViewSwitch = false
    private func rebuildAppearance(fade: Bool = false, viewSwitch: Bool = true) {
        // The whole map's colours are worked out off the main thread (opening a state's page tints its
        // friends and foes, and recolouring every vertex there stalled the page's slide-in); the old
        // colours stay on screen until the new ones are ready.
        let work = workRevision.changeAppearance(), map = self.map
        let inputs = BaseInputs(mode: mode, nationColors: nationColors, highlight: highlight, tint: tint, fills: fills, density: Float(display.colorDensity), terrain: terrainBase, shade: shade)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let colours = MapRenderer.baseColors(map, inputs)
            DispatchQueue.main.async {
                // A newer appearance, or a new map since (its own pass sets the colours), wins.
                guard let self, self.workRevision.acceptsColours(work) else { return }
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

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        baseCacheValid = false
        overlayCacheValid = false
    }

    /// 分配或复用离屏静态地图双层缓存纹理（物理机启用 .memoryless 零显存 MSAA 瞬态目标，彻底避免每帧重绘 20,000+ 地块与 13 层静态矢量）。
    private func ensureCacheTextures(width: Int, height: Int, pixelFormat: MTLPixelFormat, sampleCount: Int) -> Bool {
        guard width > 0, height > 0 else { return false }
        if cachePixelSize == (width, height), cacheSampleCount == sampleCount,
           cachedBaseTex != nil, cachedOverlayTex != nil,
           (sampleCount <= 1 || cacheMSAATex != nil) {
            return true
        }
        cachePixelSize = (width, height)
        cacheSampleCount = sampleCount
        baseCacheValid = false
        overlayCacheValid = false
        let desc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: pixelFormat, width: width, height: height, mipmapped: false)
        desc.usage = [.renderTarget, .shaderRead]
        desc.storageMode = .private
        cachedBaseTex = device.makeTexture(descriptor: desc)
        cachedOverlayTex = device.makeTexture(descriptor: desc)
        if sampleCount > 1 {
            let msaa = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: pixelFormat, width: width, height: height, mipmapped: false)
            msaa.textureType = .type2DMultisample
            msaa.sampleCount = sampleCount
            msaa.usage = [.renderTarget]
            #if targetEnvironment(simulator)
            msaa.storageMode = .private
            #else
            msaa.storageMode = .memoryless
            #endif
            cacheMSAATex = device.makeTexture(descriptor: msaa)
        } else {
            cacheMSAATex = nil
        }
        return cachedBaseTex != nil && cachedOverlayTex != nil && (sampleCount <= 1 || cacheMSAATex != nil)
    }

    private func makeCachePass(resolveTo target: MTLTexture, clear: Bool, sampleCount: Int) -> MTLRenderPassDescriptor {
        let rp = MTLRenderPassDescriptor()
        let att = rp.colorAttachments[0]!
        att.loadAction = clear ? .clear : .dontCare
        att.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        if sampleCount > 1, let msaa = cacheMSAATex {
            att.texture = msaa
            att.resolveTexture = target
            att.storeAction = .multisampleResolve
        } else {
            att.texture = target
            att.storeAction = .store
        }
        return rp
    }

    func draw(in view: MTKView) {
        guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable, let buffer = queue.makeCommandBuffer() else { return }
        frameTime = CACurrentMediaTime()
        let probe = Self.frameProbe
        var spriteProgress: Float = advanceChase()
        let size = view.bounds.size
        guard size.width > 0, size.height > 0 else { return }
        if !camera.isValid {
            camera = MapCamera.cover(map: (Double(map.width), Double(map.height)), viewport: (Double(size.width), Double(size.height)))
        }
        let targetTex = pass.colorAttachments[0].texture ?? drawable.texture
        let dw = min(targetTex.width, drawable.texture.width), dh = min(targetTex.height, drawable.texture.height)
        guard dw > 0, dh > 0 else { return }

        let lightStrength: Float = (display.lighting ?? true) ? (Energy.hot ? 0.55 : 1.0) : 0.0
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
            iconZoom: Float(Self.iconZoom(camera.scale))
        )
        let uniformLength = MemoryLayout<Uniforms>.stride
        let fullScissor = MTLScissorRect(x: 0, y: 0, width: dw, height: dh)

        // 严格按画心 [0, map.width] × [0, map.height] 裁剪全部地图内层（海洋、地形、国界、军团、行军线、羊皮纸），
        // 杜绝缩放或平移时任何底图瓦片、军团棋子或线框飞出卷轴画框覆盖上下留白区。
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

        func encodeQuad(_ enc: MTLRenderCommandEncoder, _ texture: MTLTexture?, _ pipeline: MTLRenderPipelineState, x: Float, y: Float, width: Float, height: Float) {
            guard let texture else { return }
            var q = QuadUniforms(origin: SIMD2(x, y), size: SIMD2(width, height))
            enc.setRenderPipelineState(pipeline)
            enc.setVertexBytes(&u, length: uniformLength, index: 2)
            enc.setVertexBytes(&q, length: MemoryLayout<QuadUniforms>.stride, index: 3)
            enc.setFragmentBytes(&u, length: uniformLength, index: 2)
            enc.setFragmentTexture(texture, index: 0)
            enc.setFragmentSamplerState(sampler, index: 0)
            enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
        }
        func encodeColored(_ enc: MTLRenderCommandEncoder, _ layer: (buffer: MTLBuffer, count: Int)?, alpha: Float = 1) {
            guard let layer, alpha > 0 else { return }
            u.alpha = alpha
            enc.setRenderPipelineState(coloredPipeline)
            enc.setVertexBuffer(layer.buffer, offset: 0, index: 0)
            enc.setVertexBytes(&u, length: uniformLength, index: 2)
            enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: layer.count)
            u.alpha = 1
        }
        func encodeStaticOverlays(_ enc: MTLRenderCommandEncoder, stage: Float) {
            func ramp(_ from: Float) -> Float { min(1, max(0, (stage - from) / 0.07)) }
            if stage < 0.82 {
                if coastInk == nil { coastInk = self.buffer(MapLayers.coastInk(map).vertices, stride: 6) }
                encodeColored(enc, coastInk, alpha: ramp(0.1) * (1 - ramp(0.75)))
            } else if coastInk != nil { coastInk = nil }
            if display.provinceLines { encodeColored(enc, provinceLines, alpha: ramp(0.5)) }
            if let rivers, stage > 0.42 {
                let rAlpha = ramp(0.42)
                let off = min(Float(0.18), 0.36 / max(1.0, u.scale))
                var bankColor = SIMD4<Float>(MapLayers.river.r * 0.58, MapLayers.river.g * 0.64, MapLayers.river.b * 0.70, rAlpha * 0.34)
                var bankU = u
                bankU.center.x -= off
                bankU.center.y -= off
                enc.setRenderPipelineState(flatPipeline)
                enc.setVertexBuffer(rivers.buffer, offset: 0, index: 0)
                enc.setVertexBytes(&bankU, length: uniformLength, index: 2)
                enc.setFragmentBytes(&bankColor, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
                enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: rivers.count)

                var color = SIMD4<Float>(MapLayers.river.r, MapLayers.river.g, MapLayers.river.b, rAlpha)
                enc.setVertexBytes(&u, length: uniformLength, index: 2)
                enc.setFragmentBytes(&color, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
                enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: rivers.count)
            }
            if stage > 0.42 { encodeColored(enc, extraRivers, alpha: ramp(0.42)) }
            if display.seaRoutes { encodeColored(enc, seaLanes, alpha: ramp(0.7)) }
            if display.gridLines == true && stage >= 1 { encodeColored(enc, gridLines) }
            let chart = display.mapDetail ?? true
            if chart { encodeColored(enc, ornaments, alpha: ramp(0.44)) }
            let fineFade = Float(min(1, max(0, (camera.scale - 0.92) / 0.55)))
            if chart && fineFade > 0.01 { encodeColored(enc, fineDetail, alpha: ramp(0.44) * fineFade) }
            if display.vegetation {
                let vegAlpha = ramp(0.44)
                encodeColored(enc, relief, alpha: vegAlpha * 0.76)
            }
            if display.borders { encodeColored(enc, outlines, alpha: ramp(0.75)) }
            if display.cityIcons {
                encodeColored(enc, icons, alpha: ramp(0.85))
                encodeColored(enc, forts, alpha: ramp(0.85))
                encodeColored(enc, portIcons, alpha: ramp(0.85))
            }
        }

        // 离屏静态地图双层缓存（Dirty Flag）：镜头静止且揭幕完成后，海陆 20,000+ 地块与 13 层静态矢量仅按需烘焙一次；
        // 推演期间军队滑行、战争墨晕与战斗特效每帧 60fps 只需 2 个全屏三角形直通合成，GPU 耗时暴降 ~85%！
        let isFading = fading
        let settled = (reveal >= 1) && (camera == lastFrameCamera) && mapScissor.width > 0 && mapScissor.height > 0
        lastFrameCamera = camera
        let seasonBucket = seasonPhase < 0 ? -1 : Int((seasonPhase * 24).rounded())
        let lightBucket = Int((lightStrength * 100).rounded())
        if cachedCamera != camera || cachePixelSize != (dw, dh) || cacheSampleCount != view.sampleCount {
            baseCacheValid = false
            overlayCacheValid = false
        }
        if cachedSeasonBucket != seasonBucket || cachedLightBucket != lightBucket {
            baseCacheValid = false
        }
        var useBaseCache = false
        var useOverlayCache = false
        if settled && ensureCacheTextures(width: dw, height: dh, pixelFormat: view.colorPixelFormat, sampleCount: view.sampleCount) {
            cachedCamera = camera
            cachedSeasonBucket = seasonBucket
            cachedLightBucket = lightBucket
            if !isFading, let baseTex = cachedBaseTex {
                if !baseCacheValid {
                    let rp = makeCachePass(resolveTo: baseTex, clear: true, sampleCount: view.sampleCount)
                    if let bEnc = buffer.makeRenderCommandEncoder(descriptor: rp) {
                        bEnc.setScissorRect(mapScissor)
                        encodeQuad(bEnc, sea, seaPipeline, x: 0, y: 0, width: map.width, height: map.height)
                        bEnc.setRenderPipelineState(cellPipeline)
                        bEnc.setFragmentBytes(&u, length: uniformLength, index: 2)
                        bEnc.setFragmentBytes(&weatherUniforms, length: weatherUniforms.count * MemoryLayout<SIMD4<Float>>.stride, index: 3)
                        bEnc.setVertexBuffer(positions, offset: 0, index: 0)
                        bEnc.setVertexBuffer(colors, offset: 0, index: 1)
                        colorBufferPool.recordRead(in: buffer)
                        bEnc.setVertexBytes(&u, length: uniformLength, index: 2)
                        if indexCount > 0 { bEnc.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0) }
                        bEnc.endEncoding()
                        baseCacheValid = true
                    }
                }
                useBaseCache = baseCacheValid
            }
            if let ovTex = cachedOverlayTex {
                if !overlayCacheValid {
                    let rp = makeCachePass(resolveTo: ovTex, clear: true, sampleCount: view.sampleCount)
                    if let oEnc = buffer.makeRenderCommandEncoder(descriptor: rp) {
                        oEnc.setScissorRect(mapScissor)
                        encodeStaticOverlays(oEnc, stage: 1)
                        oEnc.endEncoding()
                        overlayCacheValid = true
                    }
                }
                useOverlayCache = overlayCacheValid
            }
        }

        guard let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        func quad(_ texture: MTLTexture?, _ pipeline: MTLRenderPipelineState, x: Float, y: Float, width: Float, height: Float) {
            encodeQuad(encoder, texture, pipeline, x: x, y: y, width: width, height: height)
        }
        func colored(_ layer: (buffer: MTLBuffer, count: Int)?, alpha: Float = 1) {
            encodeColored(encoder, layer, alpha: alpha)
        }
        // 0. 全视口无缝「御案织锦」背景：统一西北来光书案聚光 + 细腻云锦暗纹，彻底消除拉远全图上下割裂。
        encoder.setScissorRect(fullScissor)
        encoder.setRenderPipelineState(deskPipeline)
        encoder.setVertexBytes(&u, length: uniformLength, index: 2)
        encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)

        if mapScissor.width > 0 && mapScissor.height > 0 {
        encoder.setScissorRect(mapScissor)

        if useBaseCache, let baseTex = cachedBaseTex {
            if previousColors != nil { previousColors = nil }
            encoder.setRenderPipelineState(blitOpaquePipeline)
            encoder.setFragmentTexture(baseTex, index: 0)
            encoder.setFragmentSamplerState(sampler, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        } else {
            // 1. 精致多层海洋渲染：在海图深度纹理之上叠加铜版细浪纹理、微洋流与古纸颗粒，远近皆细腻通透。
            quad(sea, seaPipeline, x: 0, y: 0, width: map.width, height: map.height)
            if reveal < 0.2 {
                // Blank paper over the sea, soaked through from the middle of the sheet outwards.
                var q = QuadUniforms(origin: SIMD2(0, 0), size: SIMD2(map.width, map.height))
                var sheet = SIMD4<Float>(Self.paper.r, Self.paper.g, Self.paper.b, reveal)
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
            if reveal < 1, let rb = revealBuffers() {
                // Land not yet inked is the paper itself, left white while the sea is painted round it.
                var r = SIMD4<Float>(Self.paper.r, Self.paper.g, Self.paper.b, reveal)
                encoder.setRenderPipelineState(revealPipeline)
                encoder.setVertexBuffer(rb.terrain, offset: 0, index: 3)
                encoder.setVertexBuffer(rb.fields, offset: 0, index: 4)
                encoder.setFragmentBytes(&r, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
            } else if isFading, let previous = previousColors {
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
            if indexCount > 0 { encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0) }
        }
        // 战争晕染（墨场）：在陆地颜色之上、州界与军队之下；专题分色视图（联盟/文化/家族/宗教等）不叠绘国家占领墨色。
        if reveal >= 1 && (display.battleGround ?? true) && fills == nil {
            let t0 = CACurrentMediaTime()
            drawWashes(encoder, &u, command: buffer)
            probe?.wash.append((CACurrentMediaTime() - t0) * 1000)
        }
        if useOverlayCache, let ovTex = cachedOverlayTex {
            encoder.setRenderPipelineState(blitPremulPipeline)
            encoder.setFragmentTexture(ovTex, index: 0)
            encoder.setFragmentSamplerState(sampler, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        } else {
            encodeStaticOverlays(encoder, stage: reveal)
        }
        if reveal >= 1 {
        colored(route)
        encoder.setVertexBytes(&spriteProgress, length: MemoryLayout<Float>.stride, index: 4)
        var clock = Float(frameTime.truncatingRemainder(dividingBy: 600))
        encoder.setVertexBytes(&clock, length: MemoryLayout<Float>.stride, index: 5)
        let shadowFade = Float(min(1, max(0, (camera.scale - 0.62) / 0.25)))
        if showArmies && lightStrength > 0.1 && shadowFade > 0.02 {
            // 军团棋子东南落地阴影：漆盾军牌与水师战舰投下柔和统一落影
            u.alpha = shadowFade
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentSamplerState(sampler, index: 0)
            let wakeTex = unitTextures["0fleetwake"]
            for unit in units {
                if let wakeTex, unit.texture === wakeTex { continue }
                encoder.setRenderPipelineState(unit.isSheet ? spriteSheetShadowPipeline : spriteShadowPipeline)
                encoder.setVertexBuffer(unit.buffer, offset: 0, index: 0)
                encoder.setFragmentTexture(unit.texture, index: 0)
                encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: unit.count)
            }
            u.alpha = 1
        }
        if showArmies && !units.isEmpty {
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentSamplerState(sampler, index: 0)
            for unit in units {
                encoder.setRenderPipelineState(unit.isSheet ? spriteSheetPipeline : spritePipeline)
                encoder.setVertexBuffer(unit.buffer, offset: 0, index: 0)
                encoder.setFragmentTexture(unit.texture, index: 0)
                encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: unit.count)
                unit.pool.recordRead(in: buffer)
            }
        }
        }
        // The original's mounting (a paper band and black rules along the edge) read as a hard brown frame
        // on a phone screen; the scroll edge below (a soft aged wash) frames the map instead.
        _ = mount
        if display.parchment, let parchment {
            // 严丝合缝裁切在地图画心内，高倍放大时自动混入 512×512 无缝原作宣纸纤维细节纹理（paperDetail），任意缩放倍率均纤毫毕现、零马赛克色块！
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
        } // end mapScissor
        encoder.setScissorRect(fullScissor)
        if display.scrollMount ?? display.darkEdges {
            if let mb = scrollMountBuffer {
                encoder.setRenderPipelineState(scrollBorderPipeline)
                encoder.setVertexBytes(&u, length: uniformLength, index: 2)
                encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
                encoder.setVertexBuffer(mb.buffer, offset: 0, index: 0)
                encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: mb.count)
            } else {
                colored(frame)
            }
        }
        encoder.endEncoding()
        if let probe {
            probe.encode.append((CACurrentMediaTime() - frameTime) * 1000)
            buffer.addCompletedHandler { b in
                let g = (b.gpuEndTime - b.gpuStartTime) * 1000
                DispatchQueue.main.async { probe.gpu.append(g) }
            }
            // 上屏回调只有真机 SDK 有（模拟器 SDK 的 CAMetalDrawable 没有 addPresentedHandler）。
            #if !targetEnvironment(simulator)
            drawable.addPresentedHandler { d in
                let t = d.presentedTime
                DispatchQueue.main.async {
                    if t > 0 { if probe.lastPresent > 0 { probe.presented.append((t - probe.lastPresent) * 1000) }; probe.lastPresent = t }
                }
            }
            #endif
        }
        if view.presentsWithTransaction {
            // 同事务呈现：提交后等到排入 GPU 再呈现，画面与同一事务里的 UIKit 图层一起上屏。
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
    struct Uniforms { float2 viewport; float2 center; float scale; float halfWidth; float alpha; float time; float lighting; float mapWidth; float mapHeight; float pad; float iconZoom; };
    struct QuadUniforms { float2 origin; float2 size; };
    struct ColorOut { float4 position [[position]]; float4 color; };
    struct LandOut { float4 position [[position]]; float4 color; float2 world; float scale; };
    struct FlatOut { float4 position [[position]]; };
    struct QuadOut { float4 position [[position]]; float2 uv; };
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
    // 统一全局光影：柔和东南飘移浮云投影（轻量化双频噪声，海陆同频流动且低功耗）
    static float cloudCover(float2 world, float time) {
        float2 drift = float2(time * 2.4, time * 1.35);
        float c1 = vnoise((world - drift) * 0.0052 + float2(3.1, 7.4));
        return smoothstep(0.42, 0.82, c1);
    }
    // 统一西北御案主光（uv 0..1）：西北角微沐暖阳，东南角微沉古意
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
    // 陆地光影与宣纸质感（GPU 提速 + 立体光影大升级）：
    // - 强化西北暖阳与东南青灰谷影对比，凸显山川地形起伏与海岸明暗层次；
    // - 轻量化双次共享噪声（低倍缩放省去高频颗粒），流畅驱动四季天光、丝滑飘云与实时灾异。
    fragment float4 landFragment(LandOut in [[stage_in]], constant Uniforms& u [[buffer(2)]], constant float4* weather [[buffer(3)]]) {
        float detail = clamp((in.scale - 0.55) / 1.45, 0.0, 1.0);
        float envNoise = vnoise(in.world * 0.020 + float2(7.3, 19.1));
        float grain = detail > 0.12 ? (vnoise(in.world * 0.92) - 0.5) * (0.028 * detail) : 0.0;
        float3 rgb = in.color.rgb;
        float lum = dot(rgb, float3(0.299, 0.587, 0.114));
        if (u.lighting > 0.01) {
            float k = u.lighting;
            // 地形高低光影层次：向阳高坡泛柔金暖光，背阴低谷微透古青冷影，立显沙盘浮雕立体感
            float reliefMask = smoothstep(0.24, 0.78, lum);
            float3 warmSun = float3(1.072, 1.036, 0.968);
            float3 coolValley = float3(0.916, 0.946, 1.024);
            rgb *= mix(float3(1.0), mix(coolValley, warmSun, reliefMask), k);
            // 丝滑飘移浮云柔影（与海洋云影完全同频流动）
            float cloud = cloudCover(in.world, u.time);
            float3 cloudTint = mix(float3(1.026, 1.018, 0.996), float3(0.918, 0.938, 0.974), cloud);
            rgb *= mix(float3(1.0), cloudTint, k * 0.78);
            float2 mapUV = clamp(in.world / float2(max(1.0, u.mapWidth), max(1.0, u.mapHeight)), 0.0, 1.0);
            rgb *= studioLight(mapUV, k * 1.15);
            // 鲜明可辨的四时节气天光与地貌演变（u.pad 0.0=隆冬, 0.25=仲春, 0.50=盛夏, 0.75=金秋）
            if (u.pad >= 0.0) {
                float ang = u.pad * 6.2831853;
                float wWinter = smoothstep(-0.14, 0.84,  cos(ang));
                float wSpring = smoothstep(-0.14, 0.84,  sin(ang));
                float wSummer = smoothstep(-0.14, 0.84, -cos(ang));
                float wAutumn = smoothstep(-0.14, 0.84, -sin(ang));
                float wSum = max(0.001, wWinter + wSpring + wSummer + wAutumn);
                wWinter /= wSum; wSpring /= wSum; wSummer /= wSum; wAutumn /= wSum;

                float3 springTint = float3(0.955, 1.068, 0.980);
                float3 summerTint = float3(1.078, 1.038, 0.912);
                float3 autumnTint = float3(1.145, 0.985, 0.805);
                float3 winterTint = float3(0.905, 0.962, 1.095);
                float3 seasonTint = springTint * wSpring + summerTint * wSummer + autumnTint * wAutumn + winterTint * wWinter;
                rgb *= mix(float3(1.0), seasonTint, k * 0.88);

                if (wSpring > 0.02) {
                    float springMist = wSpring * smoothstep(0.30, 0.84, envNoise) * 0.09 * k;
                    rgb = mix(rgb, float3(0.86, 0.98, 0.90), springMist);
                }
                if (wSummer > 0.02) {
                    float sunGlow = wSummer * smoothstep(0.36, 0.86, envNoise) * 0.07 * k;
                    rgb = mix(rgb, rgb * float3(1.08, 1.04, 0.88) + float3(0.025, 0.018, -0.008), sunGlow);
                }
                if (wAutumn > 0.02) {
                    float midLat = smoothstep(0.05, 0.36, mapUV.y) * smoothstep(0.95, 0.56, mapUV.y);
                    float autumnWash = wAutumn * (0.34 + 0.66 * midLat) * smoothstep(0.24, 0.78, envNoise) * 0.28 * k;
                    rgb = mix(rgb, rgb * float3(1.20, 0.88, 0.62) + float3(0.05, 0.018, -0.025), autumnWash);
                }
                if (wWinter > 0.02) {
                    float northBelt = smoothstep(0.74, 0.08, mapUV.y);
                    float highlandBelt = smoothstep(0.46, 0.78, lum);
                    float snowField = clamp(northBelt * 0.68 + highlandBelt * 0.34 + (envNoise - 0.44) * 0.34, 0.0, 1.0);
                    float snowCover = wWinter * smoothstep(0.22, 0.80, snowField) * 0.54 * k;
                    rgb = mix(rgb, float3(0.955, 0.975, 1.0), snowCover);
                }
            }
        }
        // 实时活跃天时灾异区域地表视觉反馈（无活跃灾异时 0 循环开销）
        int wCount = clamp(int(weather[0].x + 0.5), 0, 12);
        if (wCount > 0) {
            for (int wi = 0; wi < wCount; wi++) {
                float4 wz = weather[wi + 1];
                float dist = distance(in.world, wz.xy);
                if (dist > wz.z * 1.35) continue;
                float mask = 1.0 - smoothstep(wz.z * 0.35, wz.z * 1.15, dist + (envNoise - 0.5) * wz.z * 0.42);
                if (mask <= 0.005) continue;
                int wKind = int(wz.w + 0.5);
                if (wKind == 1) {
                    rgb = mix(rgb, float3(0.96, 0.985, 1.0), mask * 0.62);
                } else if (wKind == 2) {
                    float crack = smoothstep(0.065, 0.0, abs(vnoise(in.world * 0.14) - 0.5)) * (0.4 + 0.6 * detail);
                    float3 parched = mix(rgb * float3(1.16, 0.94, 0.62), float3(0.82, 0.60, 0.32), 0.46);
                    parched = mix(parched, float3(0.42, 0.28, 0.14), crack * 0.42);
                    rgb = mix(rgb, parched, mask * 0.68);
                } else if (wKind == 3) {
                    rgb = mix(rgb, rgb * float3(0.74, 0.82, 0.94) + float3(0.0, 0.02, 0.06), mask * 0.54);
                } else if (wKind == 4) {
                    rgb = mix(rgb, mix(rgb, float3(0.52, 0.58, 0.32), 0.48), mask * 0.48);
                } else if (wKind == 5) {
                    rgb = mix(rgb, rgb * float3(1.12, 1.05, 0.84) + float3(0.05, 0.035, 0.0), mask * 0.44);
                }
            }
        }
        rgb = clamp(rgb + grain, 0.0, 1.0);
        return float4(rgb, in.color.a);
    }

    // —— 宋画青绿山水地形精灵（山脉、雪峰、阔叶林、松柏林、大漠沙丘）与四角鎏金云纹包角 ——
    struct TerrainVertex { packed_float2 world; packed_float2 uv; float kind; float shade; };
    struct TerrainOut { float4 position [[position]]; float2 world; float2 uv; float kind; float shade; };
    vertex TerrainOut terrainVertex(uint id [[vertex_id]], const device TerrainVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        TerrainVertex tv = v[id];
        TerrainOut o;
        o.world = float2(tv.world);
        o.position = clip(o.world, u, float2(0.0));
        o.uv = float2(tv.uv);
        o.kind = tv.kind;
        o.shade = tv.shade;
        return o;
    }
    fragment float4 terrainFragment(TerrainOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]],
                                    constant Uniforms& u [[buffer(2)]], constant float4* weather [[buffer(3)]]) {
        float4 p = t.sample(s, in.uv);
        if (p.a < 0.02) discard_fragment();
        // iOS MTKTextureLoader 载入 PNG 默认预乘 Alpha，先还原直通道色值再交由 .alpha 管线混合，边缘通透零黑边。
        float3 srcRgb = clamp(p.rgb / max(p.a, 0.001), 0.0, 1.0);
        // 四角鎏金云纹包角原色锐利呈现（kind == 9）
        if (in.kind > 8.5) {
            return float4(srcRgb, p.a * u.alpha);
        }
        float3 rgb = srcRgb * in.shade;
        float2 mapUV = clamp(in.world / float2(max(1.0, u.mapWidth), max(1.0, u.mapHeight)), 0.0, 1.0);
        if (u.lighting > 0.01) {
            rgb *= studioLight(mapUV, u.lighting * 0.85);
            if (u.pad >= 0.0) {
                float ang = u.pad * 6.2831853;
                float wWinter = smoothstep(-0.14, 0.84,  cos(ang));
                float wSpring = smoothstep(-0.14, 0.84,  sin(ang));
                float wSummer = smoothstep(-0.14, 0.84, -cos(ang));
                float wAutumn = smoothstep(-0.14, 0.84, -sin(ang));
                float wSum = max(0.001, wWinter + wSpring + wSummer + wAutumn);
                wWinter /= wSum; wSpring /= wSum; wSummer /= wSum; wAutumn /= wSum;
                float lum = dot(rgb, float3(0.299, 0.587, 0.114));
                int kind = int(in.kind + 0.5);
                if (kind == 2) {
                    // 阔叶林海随四季剧变：春绽嫩翠微粉花冠、夏郁苍青、秋燃炽红丹枫金黄、冬覆北国霜雪
                    if (wSpring > 0.02) {
                        float blossom = smoothstep(0.60, 0.16, in.uv.y) * smoothstep(0.32, 0.65, lum);
                        rgb = mix(rgb * float3(0.95, 1.12, 0.96), float3(0.96, 0.82, 0.84), wSpring * blossom * 0.28);
                    }
                    if (wAutumn > 0.02) {
                        float varN = vnoise(in.world * 0.045);
                        float3 maple = mix(float3(0.86, 0.30, 0.12), float3(0.94, 0.66, 0.18), varN) * (0.45 + lum * 1.18);
                        rgb = mix(rgb, clamp(maple, 0.0, 1.0), wAutumn * 0.84);
                    }
                    if (wWinter > 0.02) {
                        float north = smoothstep(0.74, 0.10, mapUV.y);
                        float crown = smoothstep(0.75, 0.18, in.uv.y);
                        rgb = mix(rgb * float3(0.82, 0.86, 0.92), float3(0.94, 0.97, 1.0), wWinter * (0.28 + 0.58 * north) * crown);
                    }
                } else if (kind == 3) {
                    // 松柏泰加林：秋保持苍郁青松，隆冬针冠挂雪
                    if (wAutumn > 0.02) rgb *= mix(float3(1.0), float3(1.06, 0.98, 0.86), wAutumn * 0.5);
                    if (wWinter > 0.02) {
                        float crown = smoothstep(0.72, 0.16, in.uv.y);
                        rgb = mix(rgb, float3(0.92, 0.96, 1.0), wWinter * crown * 0.64);
                    }
                } else if (kind == 0 || kind == 1 || kind == 5) {
                    // 青绿山峰与温润丘陵：秋沐金赭斜阳，隆冬山巅与北坡积雪漫降
                    if (wAutumn > 0.02) rgb *= mix(float3(1.0), float3(1.14, 0.98, 0.80), wAutumn * 0.65);
                    if (wWinter > 0.02) {
                        float north = smoothstep(0.80, 0.12, mapUV.y);
                        float ridge = smoothstep(0.72, 0.14, in.uv.y);
                        float snowAmt = (kind == 5) ? (0.24 + 0.42 * north) : (0.36 + 0.48 * north);
                        rgb = mix(rgb, float3(0.95, 0.975, 1.0), wWinter * ridge * snowAmt);
                    }
                } else if (kind == 6 || kind == 7) {
                    // 草原树丛与江南水乡泽国：秋染金苇暖赭，隆冬微覆轻霜
                    if (wAutumn > 0.02) rgb *= mix(float3(1.0), float3(1.16, 0.92, 0.68), wAutumn * 0.72);
                    if (wWinter > 0.02) {
                        float north = smoothstep(0.70, 0.10, mapUV.y);
                        rgb = mix(rgb, float3(0.90, 0.94, 0.98), wWinter * north * 0.42);
                    }
                } else if (kind == 8) {
                    // 极北苔原冻土：盛夏微透苍苔青意，隆冬银霜覆雪
                    if (wSummer > 0.02) rgb *= mix(float3(1.0), float3(0.94, 1.03, 0.95), wSummer * 0.45);
                    if (wWinter > 0.02) rgb = mix(rgb, float3(0.95, 0.98, 1.0), wWinter * 0.36);
                }
            }
        }
        // 局部雪灾/大旱实时影响该处山林风貌
        int wCount = clamp(int(weather[0].x + 0.5), 0, 12);
        for (int wi = 0; wi < wCount; wi++) {
            float4 wz = weather[wi + 1];
            float mask = 1.0 - smoothstep(wz.z * 0.35, wz.z * 1.05, distance(in.world, wz.xy));
            if (mask <= 0.005) continue;
            int wKind = int(wz.w + 0.5);
            if (wKind == 1) {
                rgb = mix(rgb, float3(0.96, 0.985, 1.0), mask * 0.72 * smoothstep(0.84, 0.18, in.uv.y));
            } else if (wKind == 2) {
                rgb = mix(rgb, rgb * float3(1.14, 0.88, 0.52) + float3(0.06, 0.02, -0.02), mask * 0.75);
            }
        }
        return float4(clamp(rgb, 0.0, 1.0), p.a * u.alpha);
    }

    // 4.2.6 高精细程序化古风舆图卷轴装裱着色器：
    // - 紫檀圆柱木轴（真实柱面法线、细长木纹年轮与红漆高光、上下包金箍 + 车制碧玉弧顶轴头）；
    // - 米金宋锦绫罗装裱宽边（织物经纬暗纹 + 菱格暗花光泽 + 牙白隔水边 + 泥金墨线双框 + 做旧宣纸微韵）；
    // - 四角回纹云纹纤细鎏金包角（全视网膜分辨率抗锯齿矢量绘制）；
    // - 画心交界处柔和多阶内阴影（Inner Shadow）与宣纸手工毛边晕染过渡 + 书案定向柔和投影。
    static float sdBox2D(float2 p, float2 b) {
        float2 q = abs(p) - b;
        return length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0);
    }
    static float sdSeg2D(float2 p, float2 a, float2 b) {
        float2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / max(0.00001, dot(ba, ba)), 0.0, 1.0);
        return length(pa - ba * h);
    }
    fragment float4 scrollMountFragment(TerrainOut in [[stage_in]], constant Uniforms& u [[buffer(2)]]) {
        float W = max(1.0, u.mapWidth);
        float H = max(1.0, u.mapHeight);
        float unit = min(W, H);
        float2 p = in.world;
        float aa = max(length(float2(dfdx(p.x), dfdy(p.y))) * 0.72, 0.25);

        // 装裱比例参数
        float matH = unit * 0.036;
        float matSide = unit * 0.025;
        float rollerD = unit * 0.030;
        float rollerR = rollerD * 0.5;
        float collarH = unit * 0.0105;
        float finialH = unit * 0.0295;
        float innerW = unit * 0.024;

        float matLeft = -matSide;
        float matRight = W + matSide;
        float matTop = -matH;
        float matBottom = H + matH;
        float rxL = matLeft - rollerR;
        float rxR = matRight + rollerR;

        // 西北御案主光方向
        float3 lightDir = normalize(float3(-0.56, -0.32, 0.76));
        float3 viewDir = float3(0.0, 0.0, 1.0);
        float3 halfDir = normalize(lightDir + viewDir);

        // 0. 画心内部：手工毛边微起伏 + 多阶柔和内阴影（Inner Shadow）与宣纸微卷晕染
        float deckle = (fbm2(p * 0.068 + float2(4.1, 9.7)) - 0.5) * unit * 0.0016;
        float dInL = p.x + deckle;
        float dInR = (W - p.x) - deckle;
        float dInT = p.y + deckle;
        float dInB = (H - p.y) - deckle;
        float dIn = min(min(dInL, dInR), min(dInT, dInB));

        // 1. 计算左右紫檀卷轴与两端包金玉轴头（最高立体图层，压在绫边外侧并投下接触阴影）
        float dxL = p.x - rxL;
        float dxR = p.x - rxR;
        bool useRight = abs(dxR) < abs(dxL);
        float rxDist = useRight ? dxR : dxL;
        float yFromTop = -matTop - p.y;       // > 0 表示向上伸出上绫边
        float yFromBot = p.y - matBottom;     // > 0 表示向下伸出下绫边
        float yBeyond = max(yFromTop, yFromBot);
        float yEndSign = (yFromTop > yFromBot) ? -1.0 : 1.0;

        float rollerCov = 0.0;
        float3 rollerRgb = float3(0.0);
        if (yBeyond <= collarH + finialH + aa * 2.0 && abs(rxDist) <= rollerR * 1.15 + aa * 2.0) {
            float targetR = rollerR;
            int part = 0; // 0 = 紫檀木轴身, 1 = 包金箍, 2 = 车制碧玉轴头
            float localSlopeY = 0.0;
            float tPart = 0.0;
            if (yBeyond <= 0.0) {
                part = 0;
                targetR = rollerR;
            } else if (yBeyond <= collarH) {
                part = 1;
                tPart = yBeyond / max(0.001, collarH);
                // 包金箍双道微凸弦纹轮廓
                float bead = sin(tPart * 3.14159265) * 0.065 + sin(tPart * 9.424778) * 0.02;
                targetR = rollerR * (1.01 + bead);
                localSlopeY = cos(tPart * 3.14159265) * 0.14 * yEndSign;
            } else {
                part = 2;
                tPart = clamp((yBeyond - collarH) / max(0.001, finialH), 0.0, 1.0);
                // 古典卷轴车制玉轴头：颈部微收 → 饱满弧肚 → 圆润拱顶，彻底告别生硬方块
                float neck = mix(0.82, 0.96, smoothstep(0.0, 0.34, tPart));
                float domeT = clamp((tPart - 0.60) / 0.40, 0.0, 1.0);
                float dome = sqrt(max(0.0, 1.0 - domeT * domeT));
                targetR = rollerR * neck * mix(1.0, dome, smoothstep(0.54, 0.64, tPart));
                localSlopeY = (domeT > 0.01 ? domeT * 0.85 : -0.18 * (1.0 - smoothstep(0.0, 0.35, tPart))) * yEndSign;
            }

            float edgeDist = abs(rxDist) - targetR;
            float tipDist = yBeyond - (collarH + finialH);
            float sdfRoller = max(edgeDist, tipDist);
            rollerCov = 1.0 - smoothstep(-aa, aa, sdfRoller);

            if (rollerCov > 0.001) {
                float nx = clamp(rxDist / max(0.001, targetR), -0.99, 0.99);
                float nz = sqrt(max(0.02, 1.0 - nx * nx));
                float3 N = normalize(float3(nx, localSlopeY, nz));
                float diff = clamp(dot(N, lightDir), 0.0, 1.0);
                float rim = pow(1.0 - nz, 2.2) * 0.18;

                if (part == 0) {
                    // 紫檀/红酸枝细密木纹 + 漆面柔和纵贯高光
                    float grainWave = sin(nx * 14.0 + fbm2(float2(nx * 3.8 + (useRight ? 5.2 : 0.0), p.y * 0.028)) * 5.6);
                    float finePore = fbm2(float2(nx * 24.0, p.y * 0.11));
                    float gMix = clamp(grainWave * 0.34 + 0.5 + (finePore - 0.5) * 0.36, 0.0, 1.0);
                    float3 darkWood = float3(0.17, 0.075, 0.048);
                    float3 warmWood = float3(0.42, 0.20, 0.115);
                    float3 woodBase = mix(darkWood, warmWood, gMix);
                    float spec = pow(max(dot(N, halfDir), 0.0), 26.0) * 0.34;
                    rollerRgb = woodBase * (0.42 + 0.72 * diff) + float3(0.96, 0.84, 0.66) * spec + float3(0.28, 0.15, 0.09) * rim;
                    // 轴身靠上下绫边处的细鎏金嵌环
                    float trimBand = min(abs(p.y - matTop - unit * 0.004), abs(p.y - matBottom + unit * 0.004));
                    float bandMask = 1.0 - smoothstep(unit * 0.0014, unit * 0.0028, trimBand);
                    if (bandMask > 0.01) {
                        float goldSpec = pow(max(dot(N, halfDir), 0.0), 42.0) * 0.52;
                        float3 goldCol = float3(0.78, 0.61, 0.28) * (0.48 + 0.68 * diff) + float3(1.0, 0.94, 0.74) * goldSpec;
                        rollerRgb = mix(rollerRgb, goldCol, bandMask * 0.88);
                    }
                } else if (part == 1) {
                    // 包金箍：拉丝古铜鎏金 + 双道微凹刻槽 + 锐利金属高光
                    float groove = abs(sin(tPart * 6.2831853));
                    float brushed = (vnoise(float2(nx * 28.0, p.y * 0.45)) - 0.5) * 0.07;
                    float3 goldShadow = float3(0.36, 0.26, 0.11);
                    float3 goldLit = float3(0.88, 0.73, 0.38);
                    float spec = pow(max(dot(N, halfDir), 0.0), 44.0) * 0.64;
                    rollerRgb = mix(goldShadow, goldLit, 0.28 + 0.72 * diff + brushed) * (0.86 + 0.14 * groove)
                              + float3(1.0, 0.95, 0.78) * spec;
                } else {
                    // 碧玉/羊脂玉轴头：温润青白玉泽、隐隐玉纹与透润反光
                    float jadeVein = fbm2(float2(nx * 4.5 + 2.3, tPart * 6.5));
                    float3 jadeDark = float3(0.45, 0.52, 0.46);
                    float3 jadeMid = float3(0.74, 0.80, 0.73);
                    float3 jadeLight = float3(0.92, 0.94, 0.88);
                    float3 jadeCol = mix(jadeDark, mix(jadeMid, jadeLight, smoothstep(0.35, 0.85, jadeVein)), 0.32 + 0.68 * diff);
                    float spec = pow(max(dot(N, halfDir), 0.0), 36.0) * 0.46;
                    float subRim = pow(1.0 - nz, 2.0) * 0.22;
                    rollerRgb = jadeCol + float3(0.98, 0.99, 0.96) * spec + float3(0.68, 0.78, 0.68) * subRim;
                    // 玉轴颈部一道极细暗金收口线
                    float neckLine = 1.0 - smoothstep(0.02, 0.10, tPart);
                    rollerRgb = mix(rollerRgb, float3(0.46, 0.35, 0.17), neckLine * 0.62);
                }
            }
        }

        // 2. 米金宋锦绫罗装裱宽边（位于 [matLeft, matRight] × [matTop, matBottom] 减去画心 [0, W] × [0, H]）
        float2 matCenter = float2((matLeft + matRight) * 0.5, (matTop + matBottom) * 0.5);
        float2 matHalf = float2((matRight - matLeft) * 0.5, (matBottom - matTop) * 0.5);
        float sdfMatOuter = sdBox2D(p - matCenter, matHalf);
        float matOuterCov = 1.0 - smoothstep(-aa, aa, sdfMatOuter);
        float outCanvasCov = 1.0 - smoothstep(-aa, aa, dIn); // > 0 在画心之外（绫边区域）
        float matCov = matOuterCov * outCanvasCov;

        float3 matRgb = float3(0.0);
        if (matCov > 0.001) {
            // 距画心外缘距离 dOut（>= 0）与距绫边外缘距离 dEdge
            float dOut = max(0.0, -dIn);
            float dEdge = max(0.0, -sdfMatOuter);

            // 温润古旧米金宣绢底色 + 做旧纸纹微韵
            float patina = fbm2(p * 0.026 + float2(11.3, 3.7));
            float fiberFine = (vnoise(p * 0.38) - 0.5) * 0.028;
            float3 silkBase = mix(float3(0.825, 0.752, 0.608), float3(0.902, 0.842, 0.708), patina) + fiberFine;

            // 宋锦织物经纬暗纹 + 菱格云锦暗花（随缩放平滑消隐，杜绝摩尔纹）
            float detailFade = clamp((u.scale - 0.30) * 0.85, 0.0, 1.0);
            float weaveFreq = 2.6;
            float warpWeft = (sin(p.x * weaveFreq) * 0.5 + sin(p.y * weaveFreq) * 0.5) * 0.011 * detailFade;
            float2 dUV = float2(p.x + p.y, p.y - p.x) * (0.095 / max(0.35, unit / 800.0));
            float2 fUV = fract(dUV) - 0.5;
            float diamond = abs(abs(fUV.x) + abs(fUV.y) - 0.44);
            float damaskLine = 1.0 - smoothstep(0.03, 0.11, diamond);
            float rosette = 1.0 - smoothstep(0.08, 0.22, length(fUV));
            float damask = max(damaskLine * 0.85, rosette * 0.55) * (0.45 + 0.55 * detailFade);
            silkBase += warpWeft + float3(0.072, 0.062, 0.036) * damask;

            // 牙白隔水边（紧贴画心外缘 0 .. 0.0046*unit）与墨/泥金双细框
            float slipW = unit * 0.0046;
            float slipMask = 1.0 - smoothstep(slipW - aa * 0.8, slipW + aa * 0.8, dOut);
            float3 ivorySlip = float3(0.945, 0.912, 0.836) + fiberFine * 0.7;
            matRgb = mix(silkBase, ivorySlip, slipMask);

            // 三道精致装裱细线：画心墨口线、隔水泥金线、绫边内收细线
            float hairW = max(aa * 0.85, unit * 0.00085);
            float lineInner = 1.0 - smoothstep(hairW * 0.5, hairW * 1.4, abs(dOut - hairW * 0.6));
            float lineGold  = 1.0 - smoothstep(hairW * 0.5, hairW * 1.4, abs(dOut - slipW));
            float lineRule  = 1.0 - smoothstep(hairW * 0.4, hairW * 1.2, abs(dOut - unit * 0.0082));
            matRgb = mix(matRgb, float3(0.24, 0.18, 0.13), lineInner * 0.68);
            matRgb = mix(matRgb, float3(0.76, 0.60, 0.30), lineGold * 0.78);
            matRgb = mix(matRgb, float3(0.46, 0.37, 0.24), lineRule * 0.36);

            // 上下外缘紫檀细包边（含极细鎏金内线）
            float outerRimW = unit * 0.0048;
            float topBotMask = (p.y < 0.0 || p.y > H) ? 1.0 : 0.0;
            float outerRim = (1.0 - smoothstep(outerRimW - aa, outerRimW + aa, min(p.y - matTop, matBottom - p.y))) * topBotMask;
            float outerGoldLine = (1.0 - smoothstep(hairW * 0.5, hairW * 1.4, abs(min(p.y - matTop, matBottom - p.y) - outerRimW))) * topBotMask;
            matRgb = mix(matRgb, float3(0.27, 0.13, 0.082), outerRim * 0.94);
            matRgb = mix(matRgb, float3(0.76, 0.61, 0.32), outerGoldLine * 0.65);

            // 四角纤细回纹/云纹鎏金包角（严格在绫边四角，线条纤细流畅、对称无锯齿）
            float cx = min(p.x - matLeft, matRight - p.x);
            float cy = min(p.y - matTop, matBottom - p.y);
            float gx = cx / matH;
            float gy = cy / matH;
            if (gx >= 0.06 && gx <= 2.25 && gy >= 0.06 && gy <= 2.15) {
                float lw = max(0.026, (aa / matH) * 1.05);
                // 纤细 L 形双轨金边 + 转角回纹方格 + 端头云头小勾
                float dF = 1e6;
                // 横臂外轨与内轨（上/下宽绫边）
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.16, 0.22), float2(1.96, 0.22)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.44, 0.58), float2(1.66, 0.58)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(1.96, 0.22), float2(1.96, 0.44)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(1.96, 0.44), float2(1.66, 0.44)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(1.66, 0.44), float2(1.66, 0.58)));
                // 竖臂外轨与内轨（左/右窄绫边，严格止于 gx <= 0.58 不入画心）
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.16, 0.22), float2(0.16, 1.88)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.44, 0.58), float2(0.44, 1.58)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.16, 1.88), float2(0.36, 1.88)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.36, 1.88), float2(0.36, 1.58)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.36, 1.58), float2(0.44, 1.58)));
                // 隅角万字回纹心（细腻小巧的回旋勾）
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.16, 0.58), float2(0.32, 0.58)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.32, 0.58), float2(0.32, 0.38)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.32, 0.38), float2(0.58, 0.38)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(0.58, 0.38), float2(0.58, 0.22)));
                // 横臂中段云纹小回格
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(1.06, 0.22), float2(1.06, 0.42)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(1.06, 0.42), float2(1.30, 0.42)));
                dF = min(dF, sdSeg2D(float2(gx, gy), float2(1.30, 0.42), float2(1.30, 0.58)));

                float filigree = 1.0 - smoothstep(lw * 0.45, lw * 1.45, dF);
                float filigreeGroove = 1.0 - smoothstep(lw * 1.2, lw * 2.5, dF);
                // 柔和暗铜刻槽底衬 + 细腻温润鎏金丝线
                matRgb = mix(matRgb, float3(0.38, 0.28, 0.16), filigreeGroove * 0.24);
                float3 goldThread = mix(float3(0.70, 0.54, 0.25), float3(0.92, 0.80, 0.48), clamp(1.0 - (gx + gy) * 0.22, 0.0, 1.0));
                matRgb = mix(matRgb, goldThread, filigree * 0.90);
            }

            // 卷轴贴合绫边处自然卷入阴影（令绫布仿佛真实缠绕进左右紫檀木轴）
            float distRollerSide = min(abs(p.x - matLeft), abs(p.x - matRight));
            float rollShade = exp(-distRollerSide / (unit * 0.0055)) * 0.38;
            matRgb *= (1.0 - rollShade);

            // 绫边外缘柔和倒角立体光
            float edgeBevel = exp(-dEdge / (unit * 0.0032)) * 0.10;
            matRgb *= (1.0 - edgeBevel);
        }

        // 3. 画心交界处柔和内阴影（Inner Shadow）与宣纸微卷晕染过渡
        float innerAlpha = 0.0;
        float3 innerRgb = float3(0.18, 0.13, 0.085);
        if (dIn >= -aa && dIn < innerW) {
            float dPos = max(0.0, dIn);
            // 西北受光：上缘与左缘内阴影略深，下缘与右缘更柔润（连续平滑权重，四角零斜接痕）
            float wTL = max(exp(-max(0.0, dInT) / (unit * 0.015)), exp(-max(0.0, dInL) / (unit * 0.015)));
            float dirWeight = mix(0.80, 1.18, clamp(wTL, 0.0, 1.0));

            float tightShadow = exp(-dPos / (unit * 0.0038)) * 0.30 * dirWeight;
            float softShadow  = exp(-dPos / (unit * 0.0135)) * 0.13 * dirWeight;
            float paperSoak = 0.88 + 0.24 * fbm2(p * 0.11);
            float insideMask = smoothstep(-aa, aa, dIn);
            innerAlpha = clamp((tightShadow + softShadow) * paperSoak, 0.0, 0.44) * insideMask;
            // 近接缝处极微弱的宣纸暖黄做旧边晕
            innerRgb = mix(float3(0.16, 0.115, 0.075), float3(0.36, 0.27, 0.17), clamp(dPos / innerW, 0.0, 1.0));
        }

        // 4. 书案定向柔和投影（卷轴与装裱向东南投射在深核桃木书案上）
        float2 sp = p - float2(unit * 0.007, unit * 0.010);
        float dMatSh = sdBox2D(sp - matCenter, matHalf);
        float dRolLSh = sdBox2D(sp - float2(rxL, H * 0.5), float2(rollerR * 0.94, H * 0.5 + matH + collarH + finialH * 0.92));
        float dRolRSh = sdBox2D(sp - float2(rxR, H * 0.5), float2(rollerR * 0.94, H * 0.5 + matH + collarH + finialH * 0.92));
        float dAnySh = min(dMatSh, min(dRolLSh, dRolRSh));
        float deskShadowAlpha = 0.0;
        if (dAnySh > -aa && dAnySh < unit * 0.036 && dIn < 0.0) {
            deskShadowAlpha = exp(-max(0.0, dAnySh) / (unit * 0.0105)) * 0.44;
        }

        // 5. 自底向上精确合成（书案投影 → 画心内阴影 → 宋锦绫边 → 紫檀卷轴与玉轴头）
        float4 col = float4(0.0);
        if (deskShadowAlpha > 0.002) {
            col = float4(0.055, 0.038, 0.024, deskShadowAlpha);
        }
        if (innerAlpha > 0.002) {
            col.rgb = mix(col.rgb, innerRgb, innerAlpha / max(0.001, col.a + innerAlpha * (1.0 - col.a)));
            col.a = col.a + innerAlpha * (1.0 - col.a);
        }
        if (matCov > 0.002) {
            float3 m = matRgb;
            if (u.lighting > 0.01) {
                float2 mapUV = clamp(p / float2(W, H), 0.0, 1.0);
                m *= studioLight(mapUV, u.lighting * 0.55);
            }
            float outA = matCov + col.a * (1.0 - matCov);
            col.rgb = (m * matCov + col.rgb * col.a * (1.0 - matCov)) / max(0.001, outA);
            col.a = outA;
        }
        if (rollerCov > 0.002) {
            float3 r = rollerRgb;
            if (u.lighting > 0.01) {
                float2 mapUV = clamp(p / float2(W, H), 0.0, 1.0);
                r *= studioLight(mapUV, u.lighting * 0.45);
            }
            float outA = rollerCov + col.a * (1.0 - rollerCov);
            col.rgb = (r * rollerCov + col.rgb * col.a * (1.0 - rollerCov)) / max(0.001, outA);
            col.a = outA;
        }

        if (col.a < 0.003) discard_fragment();
        return float4(clamp(col.rgb, 0.0, 1.0), col.a * u.alpha);
    }

    // 逐顶点易主渐变：previous = 起始颜色 rgb + 开始时刻；clock = (此刻, 时长)。
    vertex LandOut fadeVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], const device float4* colors [[buffer(1)]],
                              constant Uniforms& u [[buffer(2)]], const device float4* previous [[buffer(3)]], constant float2& clock [[buffer(4)]]) {
        float4 p = previous[id];
        float x = clamp((clock.x - p.a) / clock.y, 0.0, 1.0);
        x = x * x * (3.0 - 2.0 * x);
        float2 w = positions[id];
        LandOut o; o.position = clip(w, u, float2(0.0)); o.color = float4(mix(p.rgb, colors[id].rgb, x), colors[id].a); o.world = w; o.scale = u.scale; return o;
    }
    // 开卷. Paper grain for the brush: value noise, four octaves.
    struct RevealOut { float4 position [[position]]; float4 color; float4 terrain; float2 world; float2 field; };
    vertex RevealOut revealVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], const device float4* colors [[buffer(1)]],
                                  constant Uniforms& u [[buffer(2)]], const device float4* terrain [[buffer(3)]], const device float2* fields [[buffer(4)]]) {
        RevealOut o; o.position = clip(positions[id], u, float2(0.0));
        o.color = colors[id]; o.terrain = terrain[id]; o.world = positions[id]; o.field = fields[id];
        return o;
    }
    // The land. Every edge is decided per pixel from fields that run smoothly across cells, so the ink
    // creeps like a wash on paper instead of popping up cell by cell.
    fragment float4 revealFragment(RevealOut in [[stage_in]], constant float4& r [[buffer(0)]]) {
        float2 q = in.world;
        // Inked from the shore up to the peaks over 0.14…0.44 (2-octave fbm2 keeps 60/120fps silky smooth).
        float rise = clamp((r.w - 0.14) / 0.30, 0.0, 1.0);
        float e = rise * 1.25 - 0.1 - (in.field.x * 0.8 + fbm2(q * 0.02) * 0.25);
        float shown = smoothstep(-0.03, 0.05, e);
        // Each state's colour spreads from its capital over 0.5…0.75.
        float spread = clamp((r.w - 0.5) / 0.25, 0.0, 1.0);
        float ew = spread * 1.3 - 0.1 - (clamp(in.field.y, 0.0, 1.0) * 0.85 + fbm2(q * 0.015 + float2(31.7, 11.3)) * 0.3);
        float washed = smoothstep(-0.02, 0.07, ew);
        // The first wash is ink and tea, as a landscape is laid in before it is coloured.
        float light = dot(in.terrain.rgb, float3(0.3, 0.59, 0.11));
        float3 sepia = mix(float3(0.42, 0.34, 0.24), r.rgb, smoothstep(0.15, 0.85, light) * 0.8);
        float3 ground = mix(mix(sepia, in.terrain.rgb, 0.32), in.color.rgb, washed);
        // Fresh ink is darker until it dries.
        ground *= 1.0 - 0.12 * clamp(1.0 - e * 4.0, 0.0, 1.0) * shown;
        float3 c = mix(r.rgb, ground, shown);
        float rim = shown * (1.0 - shown) * 4.0, front = washed * (1.0 - washed) * 4.0;
        c = mix(c, float3(0.14, 0.11, 0.08), rim * 0.5);
        c = mix(c, c * 0.72, front * 0.5);
        return float4(c, 1.0);
    }
    // The blank sheet over the sea, soaked through smoothly from three organic ink-wash pools over 0…0.18 (r: paper and the reveal).
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
    vertex FlatOut lineVertex(uint id [[vertex_id]], const device float4* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        FlatOut o; float4 p = v[id]; o.position = clip(p.xy, u, p.zw * u.halfWidth); return o;
    }
    vertex FlatOut flatVertex(uint id [[vertex_id]], const device float2* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        FlatOut o; o.position = clip(v[id], u, float2(0.0)); return o;
    }
    fragment float4 flatFragment(FlatOut in [[stage_in]], constant float4& color [[buffer(0)]]) { return color; }
    vertex QuadOut quadVertex(uint id [[vertex_id]], constant Uniforms& u [[buffer(2)]], constant QuadUniforms& q [[buffer(3)]]) {
        const float2 corners[6] = { float2(0, 0), float2(1, 0), float2(0, 1), float2(0, 1), float2(1, 0), float2(1, 1) };
        QuadOut o; float2 c = corners[id]; o.position = clip(q.origin + c * q.size, u, float2(0.0)); o.uv = c; return o;
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
        // 真实二维矢量驱动棋子动态：按实际行军航向倾身、踏步起伏、微微弹性呼吸，交战双向冲锋回弹
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
    // 4×1 透明序列帧统一 GPU 动画顶点着色器：零代码晃动，按行军／交战／航行／待机／沉没自动切帧与转向。
    vertex SpriteOut spriteSheetVertex(uint id [[vertex_id]], const device SpriteVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]], constant float& progress [[buffer(4)]],
                                       constant float& time [[buffer(5)]]) {
        SpriteVertex s = v[id];
        float pixels = s.size * u.iconZoom;
        float4 tint = float4(s.tint);
        bool fighting = (tint.a > 1.5);
        bool dying = (tint.a < -1.5);
        float sinkOffset = 0.0;
        if (dying) {
            float d = -tint.a - 2.0;
            float fadeT = clamp((progress - d) / 0.18, 0.0, 1.0);
            tint.a = 1.0 - fadeT;
            sinkOffset = fadeT * 0.24 * pixels;
        } else if (tint.a < 0.0) {
            tint.a = progress;
        } else if (fighting) {
            tint.a = 1.0;
        }
        float t = progress, t2 = t * t, t3 = t2 * t;
        float2 a = float2(s.center), b = float2(s.target);
        float2 delta = b - a;
        bool moving = (length(delta) > 0.05);
        float2 walk = a * (2.0 * t3 - 3.0 * t2 + 1.0) + float2(s.lead) * (t3 - 2.0 * t2 + t) + b * (3.0 * t2 - 2.0 * t3) + delta * (t3 - t2);
        float seed = fract(s.center[0] * 0.137 + s.center[1] * 0.071) * 4.0;
        float fps = fighting ? 10.5 : (moving ? 7.6 : 3.2);
        float frameIdx = floor(fmod(time * fps + seed, 4.0));
        float localU = s.corner[0] + 0.5;
        if (delta.x < -0.05) { localU = 1.0 - localU; }
        float cellU = clamp(localU, 0.008, 0.992);
        float sheetU = (frameIdx + cellU) * 0.25;
        float sheetV = clamp(s.corner[1] + 0.5, 0.004, 0.996);
        SpriteOut o;
        o.position = clip(walk, u, (float2(s.corner) + float2(s.shift)) * pixels + float2(0.0, sinkOffset));
        o.uv = float2(sheetU, sheetV);
        o.tint = tint;
        return o;
    }
    vertex SpriteOut spriteSheetShadowVertex(uint id [[vertex_id]], const device SpriteVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]], constant float& progress [[buffer(4)]],
                                             constant float& time [[buffer(5)]]) {
        SpriteVertex s = v[id];
        float pixels = s.size * u.iconZoom;
        float4 tint = float4(s.tint);
        bool fighting = (tint.a > 1.5);
        if (tint.a < -1.5) {
            float d = -tint.a - 2.0;
            tint.a = 1.0 - clamp((progress - d) / 0.18, 0.0, 1.0);
        } else if (tint.a < 0.0) {
            tint.a = progress;
        } else if (fighting) {
            tint.a = 1.0;
        }
        float t = progress, t2 = t * t, t3 = t2 * t;
        float2 a = float2(s.center), b = float2(s.target);
        float2 delta = b - a;
        bool moving = (length(delta) > 0.05);
        float2 walk = a * (2.0 * t3 - 3.0 * t2 + 1.0) + float2(s.lead) * (t3 - 2.0 * t2 + t) + b * (3.0 * t2 - 2.0 * t3) + delta * (t3 - t2);
        float seed = fract(s.center[0] * 0.137 + s.center[1] * 0.071) * 4.0;
        float fps = fighting ? 10.5 : (moving ? 7.6 : 3.2);
        float frameIdx = floor(fmod(time * fps + seed, 4.0));
        float localU = s.corner[0] + 0.5;
        if (delta.x < -0.05) { localU = 1.0 - localU; }
        float sheetU = (frameIdx + clamp(localU, 0.008, 0.992)) * 0.25;
        float2 shOffset = float2(2.2, 2.6);
        SpriteOut o;
        o.position = clip(walk, u, (float2(s.corner) * float2(1.04, 0.92) + float2(s.shift)) * pixels + shOffset);
        o.uv = float2(sheetU, clamp(s.corner[1] + 0.5, 0.004, 0.996));
        o.tint = float4(0.10, 0.07, 0.04, tint.a * 0.26 * u.lighting * u.alpha);
        return o;
    }
    fragment float4 spriteSheetFragment(SpriteOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        float4 p = t.sample(s, in.uv);
        if (p.a <= 0.03) discard_fragment();
        float3 srcRgb = clamp(p.rgb / max(p.a, 0.001), 0.0, 1.0);
        // 保留厚涂水墨手绘细节与墨线轮廓，同时在亮部披风／旗帜微微晕染所属国色，兼顾赏画质感与阵营识别度
        float lum = dot(srcRgb, float3(0.299, 0.587, 0.114));
        float lightGrad = 1.05 - 0.10 * in.uv.y;
        float3 tinted = mix(srcRgb, srcRgb * (0.76 + 0.38 * in.tint.rgb), smoothstep(0.22, 0.78, lum) * 0.26);
        return float4(clamp(tinted * lightGrad, 0.0, 1.0), p.a * in.tint.a);
    }
    // A piece: the texture multiplied by the state's colour (white body → the colour, grey rim → its
    // shade, as the original's SpriteRenderer.color), the rim pulled towards ink so it reads on land
    // of the same colour, and lit a little from above.
    // 军团棋子东南落地投影着色器（复用同一顶点缓冲，与西北主光及 60/120fps 棋子微韵严格同步）
    vertex SpriteOut spriteShadowVertex(uint id [[vertex_id]], const device SpriteVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]], constant float& progress [[buffer(4)]],
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
        float seed = fract(s.center[0] * 0.137 + s.center[1] * 0.071) * 6.2831853;
        float2 corner = float2(s.corner) * float2(1.04, 0.96);
        float2 shOffset = float2(2.1, 2.5 + sinkY);
        if (fighting) {
            float beat = sin(time * 8.4 + seed);
            float lunge = pow(max(0.0, beat), 3.0) - 0.25 * max(0.0, -beat);
            float2 thrustDir = moving ? dir : float2((fract(seed * 1.7) > 0.5) ? 1.0 : -1.0, (fract(seed * 3.1) - 0.5) * 0.45);
            shOffset += thrustDir * (lunge * pixels * 0.12);
            float ang = clamp(thrustDir.x * lunge * 0.11, -0.16, 0.16);
            float ca = cos(ang), sa = sin(ang);
            corner = float2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
        } else if (moving && !dying) {
            float stride = sin(time * 9.2 + seed);
            shOffset += dir * (stride * min(1.1, pixels * 0.036));
            float lean = clamp(dir.x * 0.085 + dir.y * 0.035 + stride * 0.042, -0.15, 0.15);
            float ca = cos(lean), sa = sin(lean);
            corner = float2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
        }
        SpriteOut o;
        o.position = clip(walk, u, (corner + float2(s.shift)) * pixels + shOffset);
        o.uv = float2(s.corner) + 0.5;
        o.tint = float4(0.10, 0.07, 0.04, tint.a * 0.28 * u.lighting * u.alpha);
        return o;
    }
    fragment float4 spriteShadowFragment(SpriteOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        float a = t.sample(s, in.uv).a;
        if (a <= 0.05) discard_fragment();
        return float4(in.tint.rgb, a * in.tint.a);
    }
    fragment float4 spriteFragment(SpriteOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        float4 p = t.sample(s, in.uv);
        if (p.a <= 0.01) discard_fragment();
        float lum = p.r / max(p.a, 0.001);
        // 西北受光雕漆棋面高光，东南边缘沉稳压深，提升军牌与战舰立体质感
        float lightGrad = 1.12 - 0.16 * in.uv.y - 0.08 * in.uv.x;
        float3 fill = clamp(in.tint.rgb * lightGrad, 0.0, 1.0);
        float3 rim = mix(float3(0.11, 0.09, 0.07), in.tint.rgb, 0.24);
        float3 c = mix(rim, fill, smoothstep(0.42, 0.94, lum));
        return float4(c, p.a * in.tint.a);
    }
    fragment float4 textureFragment(QuadOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        return float4(t.sample(s, in.uv).rgb, 1.0);
    }
    // 离屏静态地图双层缓存直通合成（零顶点缓冲全屏三角形，1:1 视网膜像素零失真）
    vertex QuadOut blitVertex(uint id [[vertex_id]]) {
        float2 uv = float2((id == 1) ? 2.0 : 0.0, (id == 2) ? 2.0 : 0.0);
        QuadOut o;
        o.position = float4(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
        o.uv = uv;
        return o;
    }
    fragment float4 blitFragment(QuadOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        return t.sample(s, in.uv);
    }
    // 全视口无缝「御案织锦」书案背景：与卷轴、海陆统一西北暖光聚光 + 细腻双经纬织锦云花，四面一体零割裂。
    struct DeskOut { float4 position [[position]]; float2 uv; float2 screenPx; };
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
        // 细腻双经纬织锦丝纹 + 典雅云锦双层菱格暗花
        float warp = sin(p.x * 1.55) * 0.5 + 0.5;
        float weft = sin(p.y * 1.55) * 0.5 + 0.5;
        float weave = (warp * 0.5 + weft * 0.5 - 0.5) * 0.015;
        float2 dCell = fract(p / 36.0) - 0.5;
        float diamond = abs(dCell.x) + abs(dCell.y);
        float outerLatt = smoothstep(0.45, 0.49, diamond) * (1.0 - smoothstep(0.49, 0.53, diamond));
        float innerMed = smoothstep(0.20, 0.23, diamond) * (1.0 - smoothstep(0.23, 0.26, diamond));
        float damask = (outerLatt * 0.020 + innerMed * 0.013);
        float paperGrain = (vnoise(p * 0.14) - 0.5) * 0.022;
        // 西北御案柔和主光聚光 + 四周温润古茶书案暗角
        float2 lightCenter = float2(0.42, 0.58);
        float2 c = (in.uv - lightCenter) * float2(1.38, 1.32);
        float r2 = clamp(dot(c, c), 0.0, 1.35);
        float3 centerTone = float3(0.896, 0.856, 0.778);
        float3 outerTone = float3(0.732, 0.668, 0.562);
        float3 rgb = mix(centerTone, outerTone, smoothstep(0.06, 1.05, r2));
        rgb = clamp(rgb + weave + damask + paperGrain, 0.0, 1.0);
        return float4(rgb, 1.0);
    }
    // 海洋多层动态古图光影着色：深浅海棚渐变 + 多频海浪法线西北日照水光闪烁 + 铜版细浪刻纹 + 飘云投影 + 近岸呼吸白沫。
    struct SeaOut { float4 position [[position]]; float2 uv; float2 world; float scale; };
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
        float detail = clamp((in.scale - 0.30) / 1.35, 0.0, 1.0);
        float2 w = in.world;
        float tm = u.time;
        // 1. 青碧浅海大陆架 → 靛蓝深洋渐变（柔和提亮近岸碧波，令海陆过渡通透如宋画青绿海图）
        float current = (vnoise(w * 0.011 + float2(4.2 + tm * 0.06, 8.7)) - 0.5) * 0.050;
        float lum = dot(base, float3(0.299, 0.587, 0.114));
        float shallowMask = smoothstep(0.42, 0.78, lum);
        float3 shallowTint = float3(0.92, 1.075, 1.065);
        float3 deepTint = float3(0.89, 0.948, 1.055);
        float3 rgb = base * mix(deepTint, shallowTint, shallowMask);
        rgb += float3(0.014, 0.042, 0.036) * shallowMask;

        // 2. 丝滑连续海面波光高光 + 宋画细波铜版刻纹 + 浅岸微沫呼吸光晕
        float p1 = w.x * 0.18 + w.y * 0.58 - tm * 0.68;
        float p2 = w.x * 0.31 - w.y * 0.44 + tm * 0.46;
        float waveSlopeX = cos(p1) * 0.18 + cos(p2) * 0.21;
        float waveSlopeY = cos(p1) * 0.58 - cos(p2) * 0.30;
        float3 waveN = normalize(float3(-waveSlopeX * 0.34, -waveSlopeY * 0.34, 1.0));
        float3 halfVec = normalize(float3(-0.34, -0.30, 0.89));
        float spec = pow(max(0.0, dot(waveN, halfVec)), 18.0);
        float glint = spec * (0.062 + 0.082 * detail) * u.lighting;

        float engraving = sin(w.y * 0.82 + sin(w.x * 0.14 + tm * 0.18) * 1.25) * (0.011 + 0.010 * detail);
        float surfPulse = (sin(w.x * 0.11 + w.y * 0.13 - tm * 1.15) * 0.5 + 0.5) * shallowMask * 0.038 * u.lighting;

        rgb += current + engraving + surfPulse;
        rgb += float3(1.0, 0.96, 0.85) * glint;

        if (u.lighting > 0.01) {
            float k = u.lighting;
            float cloud = cloudCover(w, tm);
            float3 cloudTint = mix(float3(1.024, 1.018, 1.006), float3(0.905, 0.930, 0.972), cloud);
            rgb *= mix(float3(1.0), cloudTint, k * 0.88);
            rgb *= studioLight(in.uv, k * 1.10);
            // 海面四季色温与冬日北洋寒霜浮冰感
            if (u.pad >= 0.0) {
                float ang = u.pad * 6.2831853;
                float wWinter = smoothstep(-0.18, 0.86,  cos(ang));
                float wSpring = smoothstep(-0.18, 0.86,  sin(ang));
                float wSummer = smoothstep(-0.18, 0.86, -cos(ang));
                float wAutumn = smoothstep(-0.18, 0.86, -sin(ang));
                float wSum = max(0.001, wWinter + wSpring + wSummer + wAutumn);
                wWinter /= wSum; wSpring /= wSum; wSummer /= wSum; wAutumn /= wSum;
                float3 seaSeason = float3(0.95, 1.045, 1.02) * wSpring
                                 + float3(1.02, 1.04, 0.98) * wSummer
                                 + float3(1.05, 0.97, 0.91) * wAutumn
                                 + float3(0.89, 0.95, 1.06) * wWinter;
                rgb *= mix(float3(1.0), seaSeason, k * 0.85);
                if (wWinter > 0.02) {
                    float northSea = smoothstep(0.50, 0.04, in.uv.y);
                    float iceRim = wWinter * northSea * (0.14 + 0.16 * shallowMask) * k;
                    rgb = mix(rgb, float3(0.84, 0.91, 0.97), iceRim);
                }
            }
        }
        rgb = clamp(rgb, 0.0, 1.0);
        return float4(rgb, 1.0);
    }
    // 高倍缩放无缝古宣纸肌理正片叠底：远景保留古卷宏明暗，近景渐进注入双尺度无缝宣纸纤维（零拉伸噪块、零色偏）。
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
            float fiberDelta = (f1 * 0.62 + f2 * 0.38) * 0.82 * zoom;
            float3 cleanMacro = mix(macro, mix(macro, float3(0.955, 0.936, 0.896), 0.42), zoom);
            macro = clamp(cleanMacro + fiberDelta, 0.0, 1.0);
        }
        return float4(macro, 1.0);
    }
    """
}
