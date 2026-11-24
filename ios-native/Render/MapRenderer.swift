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
    /// 宋画青绿山水地形精灵（山脉、雪峰、阔叶林、松柏林、大漠沙丘）与御卷四角鎏金云纹包角专用 GPU 管线。
    private let terrainPipeline: MTLRenderPipelineState
    private var terrainTextures: [Int: MTLTexture] = [:]
    private var terrainBatches: [(texture: MTLTexture, buffer: MTLBuffer, count: Int)] = []
    private var scrollCornerTexture: MTLTexture?
    private var scrollCornerBuffer: (buffer: MTLBuffer, count: Int)?
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
            cellPipeline = try pipeline("cellVertex", "landFragment", .none)
            revealPipeline = try pipeline("revealVertex", "revealFragment", .none)
            veilPipeline = try pipeline("quadVertex", "veilFragment", .alpha)
            fadePipeline = try pipeline("fadeVertex", "landFragment", .none)
            linePipeline = try pipeline("lineVertex", "flatFragment", .alpha)
            flatPipeline = try pipeline("flatVertex", "flatFragment", .alpha)
            coloredPipeline = try pipeline("coloredVertex", "colorFragment", .alpha)
            deskPipeline = try pipeline("deskVertex", "deskFragment", .none)
            seaPipeline = try pipeline("seaVertex", "seaFragment", .none)
            texturePipeline = try pipeline("quadVertex", "textureFragment", .none)
            multiplyPipeline = try pipeline("seaVertex", "parchmentFragment", .multiply)
            spriteShadowPipeline = try pipeline("spriteShadowVertex", "spriteShadowFragment", .alpha)
            spritePipeline = try pipeline("spriteVertex", "spriteFragment", .alpha)
            spriteSheetShadowPipeline = try pipeline("spriteSheetShadowVertex", "spriteShadowFragment", .alpha)
            spriteSheetPipeline = try pipeline("spriteSheetVertex", "spriteSheetFragment", .alpha)
            terrainPipeline = try pipeline("terrainVertex", "terrainFragment", .alpha)
            sweepPipeline = try pipeline("sweepVertex", "sweepFragment", .alpha)
            inkPipes = try InkPipelines.make(device: device, library: library, mainFormat: view.colorPixelFormat, sampleCount: view.sampleCount)
        } catch {
            NSLog("Lieguoji Metal: pipeline setup failed at %dx MSAA: %@", view.sampleCount, error.localizedDescription)
            return nil
        }
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
        if let url = parchmentURL {
            parchment = try? MTKTextureLoader(device: device).newTexture(URL: url, options: [.SRGB: false, .generateMipmaps: true])
        } else { parchment = nil }
        if let detailURL = Bundle.main.url(forResource: "paper-detail", withExtension: "jpg", subdirectory: "World") {
            paperDetail = try? MTKTextureLoader(device: device).newTexture(URL: detailURL, options: [.SRGB: false, .generateMipmaps: true])
        } else { paperDetail = nil }
        let s = MTLSamplerDescriptor()
        s.minFilter = .linear; s.magFilter = .linear; s.mipFilter = .linear
        s.maxAnisotropy = 4
        s.sAddressMode = .clampToEdge; s.tAddressMode = .clampToEdge
        sampler = device.makeSamplerState(descriptor: s)
        let rs = MTLSamplerDescriptor()
        rs.minFilter = .linear; rs.magFilter = .linear; rs.mipFilter = .linear
        rs.maxAnisotropy = 4
        rs.sAddressMode = .repeat; rs.tAddressMode = .repeat
        repeatSampler = device.makeSamplerState(descriptor: rs)
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
        // v4.2.2 彻底停用 AI 生图地貌贴片（零贴图违和感），全面回归与地图画风 100% 浑然一体的纯矢量水彩精绘地貌层（MapLayers.relief）。
        let loader = MTKTextureLoader(device: device)
        terrainTextures.removeAll()
        terrainBatches.removeAll()
        scrollCornerTexture = nil
        scrollCornerBuffer = nil
        // 恢复上版经典雕漆漆盾国色军团与水师战舰棋子（256×256 四阶象牙浮雕矢量纹理），任意缩放倍率均精致清晰。
        for role in ["infantry", "spear", "shield", "archer", "crossbow", "cavalry", "heavy", "horseArcher", "elite", "elephant", "Fleet", "Transport", "Port", "Merchant"] {
            let probe = ["Fleet", "Transport", "Port", "Merchant"].contains(role) ? role : (UnitKinds.kinds.first { $0.role.rawValue == role }?.key ?? "Infantry")
            guard let image = UnitArt.image(probe) else { continue }
            if let texture = try? loader.newTexture(cgImage: image, options: [.SRGB: false, .generateMipmaps: true]) { unitTextures[role] = texture }
            else if let texture = Self.texture(device, image) { unitTextures[role] = texture }
        }
        unitTextures["banner"] = unitTextures["elite"]
        // 军牌底盘 (128×128): 精雕漆盾军牌（平肩微弧收尖盾形 + 浓墨外漆框 + 西北至东南立体受光面 + 内切雕槽与双铆钉），
        // 叠加国色后与顶部象牙浮雕兵种纹样层次分明，任意缩放下都兼具古舆图战棋质感。
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
            // 外圈浓墨漆框
            g.setFillColor(red: 0.10, green: 0.10, blue: 0.10, alpha: 1)
            g.addPath(shieldPath(inset: 0)); g.fillPath()
            // 中层温润亮边倒角
            g.setFillColor(red: 0.68, green: 0.68, blue: 0.68, alpha: 1)
            g.addPath(shieldPath(inset: 5.5)); g.fillPath()
            // 内盾受光渐变面
            let inner = shieldPath(inset: 8.5)
            g.saveGState()
            g.addPath(inner); g.clip()
            if let grad = CGGradient(colorSpace: CGColorSpaceCreateDeviceRGB(), colorComponents: [1.0, 1.0, 1.0, 1.0, 0.93, 0.93, 0.93, 1.0, 0.78, 0.78, 0.78, 1.0], locations: [0.0, 0.52, 1.0], count: 3) {
                g.drawLinearGradient(grad, start: CGPoint(x: 16, y: 12), end: CGPoint(x: 112, y: 116), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
            } else {
                g.setFillColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1); g.fill(CGRect(x: 0, y: 0, width: 128, height: 128))
            }
            g.restoreGState()
            // 盾内细雕槽 + 顶部双铆钉
            g.setStrokeColor(red: 0.36, green: 0.36, blue: 0.36, alpha: 0.50); g.setLineWidth(1.9)
            g.addPath(shieldPath(inset: 14.0)); g.strokePath()
            g.setFillColor(red: 0.34, green: 0.34, blue: 0.34, alpha: 0.60)
            g.fillEllipse(in: CGRect(x: 28, y: 20, width: 5.5, height: 5.5))
            g.fillEllipse(in: CGRect(x: 94.5, y: 20, width: 5.5, height: 5.5))
        }.cgImage
        if let plateArt { unitTextures["0plate"] = (try? loader.newTexture(cgImage: plateArt, options: [.SRGB: false, .generateMipmaps: true])) ?? Self.texture(device, plateArt) }
        // 水师舰队浪花尾迹底纹 (128×128): 双层弧形碎浪与微晕水环，衬托战舰浮于碧海之上的立体感。
        let wakeArt = UIGraphicsImageRenderer(size: CGSize(width: 128, height: 128), format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; f.preferredRange = .standard; return f }()).image { ctx in
            let g = ctx.cgContext
            g.setLineCap(.round)
            // 柔和半透明海沫底椭圆
            g.setFillColor(red: 0.96, green: 0.98, blue: 1.0, alpha: 0.24)
            g.fillEllipse(in: CGRect(x: 10, y: 66, width: 108, height: 42))
            // 主浪弧与外层余波
            g.setStrokeColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.72)
            g.setLineWidth(3.4)
            g.strokeEllipse(in: CGRect(x: 18, y: 74, width: 92, height: 28))
            g.setStrokeColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.42)
            g.setLineWidth(2.0)
            g.strokeEllipse(in: CGRect(x: 8, y: 68, width: 112, height: 40))
        }.cgImage
        if let wakeArt { unitTextures["0fleetwake"] = (try? loader.newTexture(cgImage: wakeArt, options: [.SRGB: false, .generateMipmaps: true])) ?? Self.texture(device, wakeArt) }
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
        recolor()
    }

    /// Harbour points in map units. Empty hides the lanes even when the switch is on.
    @discardableResult func setSeaPorts(_ ports: [SIMD2<Float>]) -> Bool {
        guard ports != seaLaneKey else { return false }
        seaLaneKey = ports
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
        var m = ColoredMesh()
        for p in paths where p.count >= 4 { m.polyline(p, width: 2.6, RGB(0.23, 0.49, 0.6), alpha: 0.92) }
        extraRivers = paths.isEmpty ? nil : buffer(m.vertices, stride: 6)
        return true
    }
    @discardableResult func setForts(_ points: [SIMD2<Float>], holy: [SIMD2<Float>] = []) -> Bool {
        guard points != fortKey || holy != holyKey else { return false }
        fortKey = points; holyKey = holy
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
                    self.seaSource = next.seaRGBA; self.seaMask = mask; self.ornaments = self.buffer(marks, stride: 6); self.uploadSea(); self.onOutlines?()
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
    func setReveal(_ t: Float) { reveal = max(0, min(1, t)); if base == nil { recolor() } }
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
    /// Each army's leaving tangent for this leg (map units over the leg).
    private var legLead: [String: SIMD2<Float>] = [:]
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
            let newLength = snap ? 0 : max(0.12, tweenDuration * 1.08)
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
                    // 平滑行军 (the original walks a smoothed path at an even pace): this leg leaves in the
                    // direction and at the speed the last one was going (its Hermite tangent there), so the
                    // walk bends through each step instead of turning sharply at it. Capped, so a stop
                    // does not overshoot.
                    if let a = legFrom[s.key], let b = legTo[s.key], legLength > 0, t < 1 {
                        // The old curve's velocity where the icon stands now, rescaled to the new leg's time.
                        let m0 = legLead[s.key] ?? (b - a), t2 = t * t
                        let v = a * (6 * t2 - 6 * t) + m0 * (3 * t2 - 4 * t + 1) + b * (6 * t - 6 * t2) + (b - a) * (3 * t2 - 2 * t)
                        let chord = target - p, along = (chord.x * chord.x + chord.y * chord.y).squareRoot()
                        var m = v * Float(newLength / legLength)
                        let k = (m.x * m.x + m.y * m.y).squareRoot()
                        // 行军不扭: the carried-over heading only rounds a gentle bend. A sharp turn, a stop or
                        // a reversal (a column halted, sent back or re-routed) starts the new leg straight at
                        // its target, and the heading never exceeds 0.6 of the leg — longer ones bowed the path
                        // outwards and the icon swayed side to side.
                        if along < 0.001 || k < 0.0001 || !along.isFinite || !k.isFinite { m = .zero }
                        else {
                            let cos = (m.x * chord.x + m.y * chord.y) / (k * along)
                            if !cos.isFinite || cos < 0.7 { m = chord }
                            else {
                                // Lean towards the chord the more the two differ.
                                let w = (cos - 0.7) / 0.3
                                m = m * w + chord * (1 - w)
                                let k2 = (m.x * m.x + m.y * m.y).squareRoot()
                                if k2.isFinite && k2 > along * 0.6 { m *= (along * 0.6) / k2 }
                            }
                        }
                        if m.x.isFinite && m.y.isFinite { lead[s.key] = m }
                    }
                }
            }
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

    /// 构建地图画心四隅「鎏金碧玉云纹包角」四边形缓冲（左上/右上/左下/右下镜像精确贴合舆图内框）。
    private func rebuildScrollCorners(width w: Float, height h: Float) {
        guard scrollCornerTexture != nil, w > 0, h > 0 else { scrollCornerBuffer = nil; return }
        let unit = min(w, h)
        let pad = unit * 0.004
        let s = unit * 0.064
        var verts = [Float]()
        func cornerQuad(_ x0: Float, _ y0: Float, _ x1: Float, _ y1: Float, _ u0: Float, _ v0: Float, _ u1: Float, _ v1: Float) {
            verts.append(contentsOf: [
                x0, y0, u0, v0, 9, 1,
                x1, y0, u1, v0, 9, 1,
                x0, y1, u0, v1, 9, 1,
                x0, y1, u0, v1, 9, 1,
                x1, y0, u1, v0, 9, 1,
                x1, y1, u1, v1, 9, 1
            ])
        }
        // 左上、右上、左下、右下四角精确对称贴合画框
        cornerQuad(pad, pad, pad + s, pad + s, 0, 0, 1, 1)
        cornerQuad(w - pad - s, pad, w - pad, pad + s, 1, 0, 0, 1)
        cornerQuad(pad, h - pad - s, pad + s, h - pad, 0, 1, 1, 0)
        cornerQuad(w - pad - s, h - pad - s, w - pad, h - pad, 1, 1, 0, 0)
        if let buf = device.makeBuffer(bytes: verts, length: verts.count * MemoryLayout<Float>.stride, options: .storageModeShared) {
            scrollCornerBuffer = (buf, verts.count / 6)
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
        weatherUniforms = next
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

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable, let buffer = queue.makeCommandBuffer() else { return }
        frameTime = CACurrentMediaTime()
        guard let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        let probe = Self.frameProbe
        var spriteProgress: Float = advanceChase()
        let size = view.bounds.size
        guard size.width > 0, size.height > 0 else { encoder.endEncoding(); return }
        if !camera.isValid {
            camera = MapCamera.cover(map: (Double(map.width), Double(map.height)), viewport: (Double(size.width), Double(size.height)))
        }
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
            guard let layer, alpha > 0 else { return }
            u.alpha = alpha
            encoder.setRenderPipelineState(coloredPipeline)
            encoder.setVertexBuffer(layer.buffer, offset: 0, index: 0)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: layer.count)
            u.alpha = 1
        }
        // 0. 全视口无缝「御案织锦」背景：统一西北来光书案聚光 + 细腻云锦暗纹，彻底消除拉远全图上下割裂。
        let targetTex = pass.colorAttachments[0].texture ?? drawable.texture
        let dw = min(targetTex.width, drawable.texture.width), dh = min(targetTex.height, drawable.texture.height)
        guard dw > 0, dh > 0 else { encoder.endEncoding(); return }
        let fullScissor = MTLScissorRect(x: 0, y: 0, width: dw, height: dh)
        encoder.setScissorRect(fullScissor)
        encoder.setRenderPipelineState(deskPipeline)
        encoder.setVertexBytes(&u, length: uniformLength, index: 2)
        encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)

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
        if mapScissor.width > 0 && mapScissor.height > 0 {
        encoder.setScissorRect(mapScissor)

        // 开卷: each layer is brushed in over a moment at its turn, none pops up whole.
        let stage = reveal
        func ramp(_ from: Float) -> Float { min(1, max(0, (stage - from) / 0.07)) }
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
        } else if fading, let previous = previousColors {
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
        // 战争晕染（墨场）：在陆地颜色之上、州界与军队之下；专题分色视图（联盟/文化/家族/宗教等）不叠绘国家占领墨色。
        if reveal >= 1 && (display.battleGround ?? true) && fills == nil {
            let t0 = CACurrentMediaTime()
            drawWashes(encoder, &u, command: buffer)
            probe?.wash.append((CACurrentMediaTime() - t0) * 1000)
        }
        // Province lines: 0.55 screen px once zoomed in. Colour is the measured #B2B2B2.
        // The screen width is the previous client choice; it is not a measured original width.
        // Province borders: smoothed ink lines at every zoom (MapLayers.provinceLines), so each
        // province reads as clearly as in the original.
        if reveal < 0.82 {
            // The shore is outlined first and gives way to the finished soft shoal & border pass.
            if coastInk == nil { coastInk = self.buffer(MapLayers.coastInk(map).vertices, stride: 6) }
            colored(coastInk, alpha: ramp(0.1) * (1 - ramp(0.75)))
        } else if coastInk != nil { coastInk = nil }
        if display.provinceLines { colored(provinceLines, alpha: ramp(0.5)) }
        if let rivers, reveal > 0.42 {
            // 双层河道紧贴河床：微距河岸柔影（限制最大世界偏移，彻底杜绝高倍放大后河影与河心脱节成双线）
            let rAlpha = ramp(0.42)
            let off = min(Float(0.18), 0.36 / max(1.0, u.scale))
            var bankColor = SIMD4<Float>(MapLayers.river.r * 0.58, MapLayers.river.g * 0.64, MapLayers.river.b * 0.70, rAlpha * 0.34)
            var bankU = u
            bankU.center.x -= off
            bankU.center.y -= off
            encoder.setRenderPipelineState(flatPipeline)
            encoder.setVertexBuffer(rivers.buffer, offset: 0, index: 0)
            encoder.setVertexBytes(&bankU, length: uniformLength, index: 2)
            encoder.setFragmentBytes(&bankColor, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: rivers.count)

            var color = SIMD4<Float>(MapLayers.river.r, MapLayers.river.g, MapLayers.river.b, rAlpha)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentBytes(&color, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: rivers.count)
        }
        // 手绘河流与天然河流同层（以前画在最后，压在国界、城池和军队上面）。
        if reveal > 0.42 { colored(extraRivers, alpha: ramp(0.42)) }
        if display.seaRoutes { colored(seaLanes, alpha: ramp(0.7)) }
        if display.gridLines == true && reveal >= 1 { colored(gridLines) }
        let chart = display.mapDetail ?? true
        if chart { colored(ornaments, alpha: ramp(0.44)) }
        let fineFade = Float(min(1, max(0, (camera.scale - 0.92) / 0.55)))
        if chart && fineFade > 0.01 { colored(fineDetail, alpha: ramp(0.44) * fineFade) }
        if display.vegetation {
            let vegAlpha = ramp(0.44)
            // 纯矢量水彩融纸地貌层（0 张 AI 生图贴片），与宣纸底图、河流、城池精度完全统一，任意高倍缩放依然锐利典雅。
            colored(relief, alpha: vegAlpha * 0.76)
        }
        if display.borders { colored(outlines, alpha: ramp(0.75)) }
        if display.cityIcons { colored(icons, alpha: ramp(0.85)); colored(forts, alpha: ramp(0.85)); colored(portIcons, alpha: ramp(0.85)) }
        if reveal >= 1 {
        colored(route)
        encoder.setVertexBytes(&spriteProgress, length: MemoryLayout<Float>.stride, index: 4)
        var clock = Float(CACurrentMediaTime().truncatingRemainder(dividingBy: 600))
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
            colored(frame)
            if let cornerTex = scrollCornerTexture, let cb = scrollCornerBuffer {
                u.alpha = 0.96
                encoder.setRenderPipelineState(terrainPipeline)
                encoder.setVertexBuffer(cb.buffer, offset: 0, index: 0)
                encoder.setVertexBytes(&u, length: uniformLength, index: 2)
                encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
                encoder.setFragmentBytes(&weatherUniforms, length: weatherUniforms.count * MemoryLayout<SIMD4<Float>>.stride, index: 3)
                encoder.setFragmentTexture(cornerTex, index: 0)
                encoder.setFragmentSamplerState(sampler, index: 0)
                encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: cb.count)
                u.alpha = 1
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
    // 陆地光影与宣纸质感：单次共享环境噪声驱动鲜明四季地貌演化（春岚／夏阳／秋枫／冬雪）＋实时局部天时灾异（暴雪、大旱龟裂、洪涝、瘟疫、丰年）。
    fragment float4 landFragment(LandOut in [[stage_in]], constant Uniforms& u [[buffer(2)]], constant float4* weather [[buffer(3)]]) {
        float detail = clamp((in.scale - 0.55) / 1.45, 0.0, 1.0);
        float g1 = vnoise(in.world * 0.55) - 0.5;
        float g2 = detail > 0.18 ? (vnoise(in.world * 1.95 + float2(13.7, 7.3)) - 0.5) : 0.0;
        float grain = (g1 * 0.024 + g2 * 0.022 * detail);
        float3 rgb = in.color.rgb;
        float lum = dot(rgb, float3(0.299, 0.587, 0.114));
        float envNoise = vnoise(in.world * 0.020 + float2(7.3, 19.1));
        if (u.lighting > 0.01) {
            float k = u.lighting;
            float3 warm = float3(1.048, 1.024, 0.976);
            float3 cool = float3(0.942, 0.962, 1.016);
            rgb *= mix(float3(1.0), mix(cool, warm, smoothstep(0.28, 0.74, lum)), k);
            float cloud = cloudCover(in.world, u.time);
            float3 cloudTint = mix(float3(1.018, 1.012, 0.996), float3(0.938, 0.952, 0.976), cloud);
            rgb *= mix(float3(1.0), cloudTint, k * 0.72);
            float2 mapUV = clamp(in.world / float2(max(1.0, u.mapWidth), max(1.0, u.mapHeight)), 0.0, 1.0);
            rgb *= studioLight(mapUV, k);
            // 鲜明可辨的四时节气天光与地貌演变（u.pad 0.0=隆冬, 0.25=仲春, 0.50=盛夏, 0.75=金秋）
            if (u.pad >= 0.0) {
                float ang = u.pad * 6.2831853;
                float wWinter = smoothstep(-0.14, 0.84,  cos(ang));
                float wSpring = smoothstep(-0.14, 0.84,  sin(ang));
                float wSummer = smoothstep(-0.14, 0.84, -cos(ang));
                float wAutumn = smoothstep(-0.14, 0.84, -sin(ang));
                float wSum = max(0.001, wWinter + wSpring + wSummer + wAutumn);
                wWinter /= wSum; wSpring /= wSum; wSummer /= wSum; wAutumn /= wSum;

                // 四季鲜明天光基调：春润青碧生机、夏沐炽金暖阳、秋染金赭丹枫、冬覆寒青霜雪
                float3 springTint = float3(0.935, 1.090, 0.975);
                float3 summerTint = float3(1.095, 1.048, 0.892);
                float3 autumnTint = float3(1.185, 0.985, 0.765);
                float3 winterTint = float3(0.875, 0.952, 1.125);
                float3 seasonTint = springTint * wSpring + summerTint * wSummer + autumnTint * wAutumn + winterTint * wWinter;
                rgb *= mix(float3(1.0), seasonTint, k);

                // 春：平野泛嫩绿青岚，低谷浮淡淡桃花春雾
                if (wSpring > 0.02) {
                    float springMist = wSpring * smoothstep(0.28, 0.82, envNoise) * 0.11 * k;
                    rgb = mix(rgb, float3(0.84, 0.98, 0.88), springMist);
                }

                // 夏：低纬与内陆受艳阳炙暖，草木葱茏鲜明
                if (wSummer > 0.02) {
                    float sunGlow = wSummer * smoothstep(0.35, 0.85, envNoise) * 0.075 * k;
                    rgb = mix(rgb, rgb * float3(1.08, 1.04, 0.86) + float3(0.03, 0.02, -0.01), sunGlow);
                }

                // 秋：广袤中北纬林野浸染鲜明金赭与丹红秋韵
                if (wAutumn > 0.02) {
                    float midLat = smoothstep(0.04, 0.36, mapUV.y) * smoothstep(0.96, 0.56, mapUV.y);
                    float autumnWash = wAutumn * (0.36 + 0.64 * midLat) * smoothstep(0.22, 0.76, envNoise) * 0.34 * k;
                    rgb = mix(rgb, rgb * float3(1.26, 0.86, 0.58) + float3(0.06, 0.02, -0.03), autumnWash);
                }

                // 冬：清晰厚实的银白积雪自北境与高山岭脊漫铺南下（国色依然清晰可辨）
                if (wWinter > 0.02) {
                    float northBelt = smoothstep(0.76, 0.06, mapUV.y);
                    float highlandBelt = smoothstep(0.44, 0.76, lum);
                    float snowField = clamp(northBelt * 0.72 + highlandBelt * 0.36 + (envNoise - 0.44) * 0.38, 0.0, 1.0);
                    float snowCover = wWinter * smoothstep(0.18, 0.78, snowField) * 0.62 * k;
                    rgb = mix(rgb, float3(0.955, 0.975, 1.0), snowCover);
                }
            }
        }
        // 实时活跃天时灾异区域地表视觉反馈（1=暴雪积白、2=大旱赤地龟裂、3=洪涝乌云湿暗、4=瘟疫阴霭、5=丰年金辉）
        int wCount = clamp(int(weather[0].x + 0.5), 0, 12);
        for (int wi = 0; wi < wCount; wi++) {
            float4 wz = weather[wi + 1];
            float dist = distance(in.world, wz.xy);
            float mask = 1.0 - smoothstep(wz.z * 0.35, wz.z * 1.15, dist + (envNoise - 0.5) * wz.z * 0.42);
            if (mask <= 0.005) continue;
            int wKind = int(wz.w + 0.5);
            if (wKind == 1) {
                rgb = mix(rgb, float3(0.96, 0.985, 1.0), mask * 0.66);
            } else if (wKind == 2) {
                float crack = smoothstep(0.065, 0.0, abs(vnoise(in.world * 0.14) - 0.5)) * (0.4 + 0.6 * detail);
                float3 parched = mix(rgb * float3(1.16, 0.94, 0.62), float3(0.82, 0.60, 0.32), 0.48);
                parched = mix(parched, float3(0.42, 0.28, 0.14), crack * 0.45);
                rgb = mix(rgb, parched, mask * 0.72);
            } else if (wKind == 3) {
                rgb = mix(rgb, rgb * float3(0.72, 0.80, 0.92) + float3(0.0, 0.02, 0.06), mask * 0.56);
            } else if (wKind == 4) {
                rgb = mix(rgb, mix(rgb, float3(0.52, 0.58, 0.30), 0.52), mask * 0.52);
            } else if (wKind == 5) {
                rgb = mix(rgb, rgb * float3(1.14, 1.06, 0.82) + float3(0.06, 0.04, 0.0), mask * 0.46);
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
    // The blank sheet over the sea, soaked through over 0…0.16 (r: paper and the reveal).
    fragment float4 veilFragment(QuadOut in [[stage_in]], constant float4& r [[buffer(0)]], constant float4& water [[buffer(1)]], constant float4& extent [[buffer(2)]]) {
        float2 q = in.uv * extent.xy, middle = extent.xy * 0.5;
        float flood = fbm2(q * 0.006) * 0.55 + 0.45 * distance(q, middle) / max(1.0, length(middle));
        float wet = smoothstep(-0.04, 0.04, clamp(r.w / 0.16, 0.0, 1.0) * 1.2 - 0.1 - flood);
        return float4(mix(r.rgb, water.rgb * 0.55, wet), 1.0 - wet);
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
        bool moving = (length(delta) > 0.06);
        float2 walk = a * (2.0 * t3 - 3.0 * t2 + 1.0) + float2(s.lead) * (t3 - 2.0 * t2 + t) + b * (3.0 * t2 - 2.0 * t3) + delta * (t3 - t2);
        // 60/120fps 灵动棋子微韵：行军轻快踏步微倾、交战果断突刺回弹、休整端稳不动
        float seed = fract(s.center[0] * 0.137 + s.center[1] * 0.071) * 6.2831853;
        float2 corner = float2(s.corner);
        float2 extraPx = float2(0.0, sinkY);
        if (fighting) {
            float beat = sin(time * 8.4 + seed);
            float lunge = pow(max(0.0, beat), 3.0) - 0.25 * max(0.0, -beat);
            float dirX = (fract(seed * 1.7) > 0.5) ? 1.0 : -1.0;
            extraPx += float2(dirX * lunge * pixels * 0.10, -abs(lunge) * pixels * 0.04);
            float ang = dirX * lunge * 0.08;
            float ca = cos(ang), sa = sin(ang);
            corner = float2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
        } else if (moving && !dying) {
            float stride = sin(time * 9.2 + seed);
            extraPx.y -= abs(stride) * min(1.3, pixels * 0.045);
            float lean = (delta.x >= 0.0 ? 1.0 : -1.0) * 0.045 + stride * 0.03;
            float ca = cos(lean), sa = sin(lean);
            corner = float2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
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
        bool moving = (length(delta) > 0.06);
        float2 walk = a * (2.0 * t3 - 3.0 * t2 + 1.0) + float2(s.lead) * (t3 - 2.0 * t2 + t) + b * (3.0 * t2 - 2.0 * t3) + delta * (t3 - t2);
        float seed = fract(s.center[0] * 0.137 + s.center[1] * 0.071) * 6.2831853;
        float2 corner = float2(s.corner) * float2(1.04, 0.96);
        float2 shOffset = float2(2.1, 2.5 + sinkY);
        if (fighting) {
            float beat = sin(time * 8.4 + seed);
            float lunge = pow(max(0.0, beat), 3.0) - 0.25 * max(0.0, -beat);
            float dirX = (fract(seed * 1.7) > 0.5) ? 1.0 : -1.0;
            shOffset.x += dirX * lunge * pixels * 0.10;
            float ang = dirX * lunge * 0.08;
            float ca = cos(ang), sa = sin(ang);
            corner = float2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
        } else if (moving && !dying) {
            float stride = sin(time * 9.2 + seed);
            float lean = (delta.x >= 0.0 ? 1.0 : -1.0) * 0.045 + stride * 0.03;
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
        // 1. 远洋宽带洋流与深海层次（单频轻量化噪声，GPU 像素开销再降一倍且层次通透）
        float current = (vnoise(w * 0.011 + float2(4.2, 8.7)) - 0.5) * 0.056;
        float lum = dot(base, float3(0.299, 0.587, 0.114));
        float shallowMask = smoothstep(0.46, 0.78, lum);
        float3 shallowTint = float3(0.955, 1.032, 1.028);
        float3 deepTint = float3(0.935, 0.972, 1.035);
        float3 rgb = base * mix(deepTint, shallowTint, shallowMask);

        // 2. 铜版细腻水平微浪纹 + 动态海浪法线与西北日光波光高光
        float p1 = w.x * 0.19 + w.y * 0.62 - tm * 0.55;
        float p2 = w.x * 0.34 - w.y * 0.48 + tm * 0.38;
        float waveSlopeX = cos(p1) * 0.19 + cos(p2) * 0.22;
        float waveSlopeY = cos(p1) * 0.62 - cos(p2) * 0.31;
        float3 waveN = normalize(float3(-waveSlopeX * 0.32, -waveSlopeY * 0.32, 1.0));
        float3 halfVec = normalize(float3(-0.34, -0.30, 0.89));
        float spec = pow(max(0.0, dot(waveN, halfVec)), 22.0);
        float glint = spec * (0.048 + 0.065 * detail) * u.lighting;

        float engraving = sin(w.y * 0.88 + sin(w.x * 0.15 + vnoise(w * 0.045) * 2.5) * 1.30) * (0.012 + 0.011 * detail);
        // 浅海沿岸柔和浪花呼吸光晕
        float surfPulse = (sin(w.x * 0.12 + w.y * 0.14 - tm * 0.9) * 0.5 + 0.5) * shallowMask * 0.030 * u.lighting;
        float grain = detail > 0.05 ? (vnoise(w * 0.68) - 0.5) * 0.020 * detail : 0.0;

        rgb += current + engraving + grain + surfPulse;
        rgb += float3(1.0, 0.96, 0.84) * glint;

        if (u.lighting > 0.01) {
            float k = u.lighting;
            float cloud = cloudCover(w, tm);
            float3 cloudTint = mix(float3(1.018, 1.016, 1.008), float3(0.915, 0.935, 0.972), cloud);
            rgb *= mix(float3(1.0), cloudTint, k * 0.85);
            rgb *= studioLight(in.uv, k);
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
                                 + float3(1.06, 0.97, 0.90) * wAutumn
                                 + float3(0.88, 0.94, 1.06) * wWinter;
                rgb *= mix(float3(1.0), seaSeason, k * 0.88);
                if (wWinter > 0.02) {
                    float northSea = smoothstep(0.50, 0.04, in.uv.y);
                    float iceRim = wWinter * northSea * (0.16 + 0.16 * shallowMask) * k;
                    rgb = mix(rgb, float3(0.82, 0.90, 0.96), iceRim);
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
