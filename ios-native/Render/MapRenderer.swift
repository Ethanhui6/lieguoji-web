import UIKit
import MetalKit
import LieguojiCore

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
    /// Army icons grouped by unit type: the texture and its quads.
    private var units: [(texture: MTLTexture, buffer: MTLBuffer, count: Int)] = []
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
    private let sampler: MTLSamplerState?
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
            multiplyPipeline = try pipeline("quadVertex", "textureFragment", .multiply)
            spriteShadowPipeline = try pipeline("spriteShadowVertex", "spriteShadowFragment", .alpha)
            spritePipeline = try pipeline("spriteVertex", "spriteFragment", .alpha)
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
        let s = MTLSamplerDescriptor()
        s.minFilter = .linear; s.magFilter = .linear; s.mipFilter = .linear
        s.maxAnisotropy = 4
        s.sAddressMode = .clampToEdge; s.tAddressMode = .clampToEdge
        sampler = device.makeSamplerState(descriptor: s)
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
        // Original Army sprites (map.ts): one unit icon per army, tinted with its state colour, 2.56 × 0.84
        // × ArmyIconScale 0.35 world units (elite × 1.5), never smaller than 7 points on screen.
        // The pieces (UnitArt), one texture per role; the commander's banner is the gonfalon piece.
        let loader = MTKTextureLoader(device: device)
        for role in ["infantry", "spear", "shield", "archer", "crossbow", "cavalry", "heavy", "horseArcher", "elite", "elephant", "Fleet", "Port", "Merchant"] {
            let probe = ["Fleet", "Port", "Merchant"].contains(role) ? role : (UnitKinds.kinds.first { $0.role.rawValue == role }?.key ?? "Infantry")
            guard let image = UnitArt.image(probe) else { continue }
            if let texture = try? loader.newTexture(cgImage: image, options: [.SRGB: false, .generateMipmaps: true]) { unitTextures[role] = texture }
            else if let texture = Self.texture(device, image) { unitTextures[role] = texture }
        }
        unitTextures["banner"] = unitTextures["elite"]
        // 军牌底盘: a carved token plaque under each army (outer lacquer rim + northwest-to-southeast shaded face + inner carved groove),
        // tinted with its state's colour so armies stand out with tactile presence at every zoom.
        let plateArt = UIGraphicsImageRenderer(size: CGSize(width: 96, height: 96), format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; return f }()).image { ctx in
            let g = ctx.cgContext
            let outer = UIBezierPath(roundedRect: CGRect(x: 4, y: 4, width: 88, height: 88), cornerRadius: 19).cgPath
            g.setFillColor(UIColor(white: 0.10, alpha: 1).cgColor); g.addPath(outer); g.fillPath()
            let innerRect = CGRect(x: 10.5, y: 10.5, width: 75, height: 75)
            let inner = UIBezierPath(roundedRect: innerRect, cornerRadius: 14).cgPath
            g.saveGState()
            g.addPath(inner); g.clip()
            if let grad = CGGradient(colorSpace: CGColorSpaceCreateDeviceGray(), colorComponents: [1.0, 1.0, 0.94, 1.0, 0.84, 1.0], locations: [0.0, 0.55, 1.0], count: 3) {
                g.drawLinearGradient(grad, start: CGPoint(x: 10, y: 10), end: CGPoint(x: 86, y: 86), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
            } else {
                g.setFillColor(UIColor.white.cgColor); g.fill(innerRect)
            }
            g.restoreGState()
            let groove = UIBezierPath(roundedRect: CGRect(x: 14.5, y: 14.5, width: 67, height: 67), cornerRadius: 11).cgPath
            g.setStrokeColor(UIColor(white: 0.42, alpha: 0.45).cgColor); g.setLineWidth(1.6); g.addPath(groove); g.strokePath()
        }.cgImage
        if let plateArt { unitTextures["0plate"] = (try? loader.newTexture(cgImage: plateArt, options: [.SRGB: false, .generateMipmaps: true])) ?? Self.texture(device, plateArt) }
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
        let wide = borderWide
        let inputs = BaseInputs(mode: mode, nationColors: nationColors, highlight: highlight, tint: tint, fills: fills, density: Float(display.colorDensity), terrain: terrainBase, shade: shade)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let vertices = skipOutlines ? nil : MapLayers.outlines(next, wide: wide).vertices
            let marks = noStatic ? nil : MapLayers.cityIcons(next).vertices
            let provinceLines = noStatic ? nil : MapLayers.provinceLines(next).vertices
            let colours = MapRenderer.baseColors(next, inputs)
            DispatchQueue.main.async {
                guard let self, self.workRevision.acceptsGeometry(work) else { return }
                if let vertices, self.workRevision.acceptsOutlineGeometry(work) { self.outlines = self.buffer(vertices, stride: 6) }
                if let marks { self.icons = self.buffer(marks, stride: 6) }
                if let provinceLines { self.provinceLines = self.buffer(provinceLines, stride: 6) }
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
        let byteLen = max(16, c.count * 4)
        colorPoolSlot = 1 - colorPoolSlot
        if colorBufferPool[colorPoolSlot] == nil || colorBufferPool[colorPoolSlot]!.length < byteLen {
            colorBufferPool[colorPoolSlot] = device.makeBuffer(length: byteLen, options: .storageModeShared)
        }
        if let b = colorBufferPool[colorPoolSlot] {
            c.withUnsafeBytes { raw in
                if let ptr = raw.baseAddress { memcpy(b.contents(), ptr, c.count * 4) }
            }
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
                let prevLen = max(16, landFade.from.count * 4)
                if prevColorBufferPool[colorPoolSlot] == nil || prevColorBufferPool[colorPoolSlot]!.length < prevLen {
                    prevColorBufferPool[colorPoolSlot] = device.makeBuffer(length: prevLen, options: .storageModeShared)
                }
                if let pb = prevColorBufferPool[colorPoolSlot] {
                    landFade.from.withUnsafeBytes { raw in
                        if let ptr = raw.baseAddress { memcpy(pb.contents(), ptr, landFade.from.count * 4) }
                    }
                    previousColors = pb
                }
            } else { previousColors = nil }
            colors = b
        }
    }
    private var colorBufferPool: [MTLBuffer?] = [nil, nil]
    private var prevColorBufferPool: [MTLBuffer?] = [nil, nil]
    private var colorPoolSlot = 0
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
        /// Locked in battle: its pieces lunge and recoil on the map (spriteVertex, alpha marker 2).
        var fighting = false
        /// Falling back: drawn faded (败退), without the idle drift.
        var retreating = false
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
    /// 军队图标的缩放系数（屏幕点 / 图标基准尺寸），与着色器 spriteVertex 同一规则（收巧约 22%，远景看海更清爽，不遮国界与战线）。
    static func iconZoom(_ scale: Double) -> Double { min(21.0 / 3.0112, max(6.8 / 3.0112, scale * 0.66)) }
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
                // The commander's gonfalon stands behind the pieces: gold for the ruler in person, crimson for generals & flagship armadas.
                if a.banner > 0 {
                    let k: Float = 0.62
                    quad("banner", at, a.banner == 2 ? RGB(0.93, 0.74, 0.25) : RGB(0.72, 0.22, 0.16), size * k, (0.55 + o.x) / k, (-0.5 + o.y) / k)
                }
                // The state's token under land armies; the pieces on it are drawn light so they read on it.
                let token = role != "Fleet" && role != "Port" && role != "Merchant" && a.army > -100_000 && unitTextures["0plate"] != nil
                if token { quad("0plate", at, c, size * 0.92, o.x / 0.92, (0.16 + o.y) / 0.92) }
                let piece = token ? RGB(0.62 + c.r * 0.38, 0.62 + c.g * 0.38, 0.62 + c.b * 0.38) : c
                // Strength as one to three pieces of the arm (the back ones a shade darker).
                let n = role == "Port" || a.army <= -100_000 ? 1 : max(1, min(3, a.tier))
                // Strength: the piece, with one or two smaller pieces just behind it (not a wide spread).
                let layout: [(Float, Float, Float)] = n == 1 ? [(0, 0, 1)] : n == 2 ? [(0.2, -0.12, 0.7), (0, 0, 1)]
                    : [(-0.22, -0.12, 0.65), (0.22, -0.12, 0.65), (0, 0, 1)]
                for (i, (dx, dy, k)) in layout.enumerated() {
                    let shade: Float = i < layout.count - 1 && n > 1 ? 0.9 : 1
                    quad(role, at, RGB(piece.r * shade, piece.g * shade, piece.b * shade), size * k, (dx + o.x) / k, (dy + o.y) / k)
                }
            }
            // 双缓冲复用各兵种顶点 MTLBuffer，避免在大规模军团同屏行军时每步向内核重复申请 12 块新缓冲区导致卡顿。
            unitPoolSlot = 1 - unitPoolSlot
            let slot = unitPoolSlot
            units = byRole.keys.sorted { ($0 == "banner" ? "" : $0) < ($1 == "banner" ? "" : $1) }.compactMap { role -> (texture: MTLTexture, buffer: MTLBuffer, count: Int)? in
                guard let data = byRole[role], !data.isEmpty, let texture = unitTextures[role] else { return nil }
                let byteLen = data.count * 4
                var pair = unitBufferPool[role] ?? [nil, nil]
                if pair[slot] == nil || pair[slot]!.length < byteLen {
                    pair[slot] = device.makeBuffer(length: max(256, byteLen * 3 / 2), options: .storageModeShared)
                    unitBufferPool[role] = pair
                }
                guard let b = pair[slot] else { return nil }
                data.withUnsafeBytes { raw in
                    if let base = raw.baseAddress { memcpy(b.contents(), base, byteLen) }
                }
                return (texture: texture, buffer: b, count: data.count / 15)
            }
        }
    }
    private var unitBufferPool: [String: [MTLBuffer?]] = [:]
    private var unitPoolSlot = 0

    /// 显示军队 and the icons' size (推演与画面).
    var showArmies = true
    var iconScale: Float = 1 { didSet { if iconScale != oldValue { rebuildArmies() } } }
    /// Layers prepared off the main thread for the next map view (MapLayers.prepare).
    static var prepared: MapLayers.Prepared?

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
            pad: Energy.hot ? -1 : seasonPhase
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
        let dw = drawable.texture.width, dh = drawable.texture.height
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
        let sx0 = max(0, min(dw, Int(floor(mapTL.x * pxScaleX))))
        let sy0 = max(0, min(dh, Int(floor(mapTL.y * pxScaleY))))
        let sx1 = max(sx0, min(dw, Int(ceil(mapBR.x * pxScaleX))))
        let sy1 = max(sy0, min(dh, Int(ceil(mapBR.y * pxScaleY))))
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
            encoder.setVertexBytes(&t, length: MemoryLayout<SIMD2<Float>>.stride, index: 4)
            encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
        } else {
            if previousColors != nil { previousColors = nil }
            encoder.setRenderPipelineState(cellPipeline)
            encoder.setFragmentBytes(&u, length: uniformLength, index: 2)
        }
        encoder.setVertexBuffer(positions, offset: 0, index: 0)
        encoder.setVertexBuffer(colors, offset: 0, index: 1)
        encoder.setVertexBytes(&u, length: uniformLength, index: 2)
        if indexCount > 0 { encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0) }
        // 战争晕染（墨场）：在陆地颜色之上、州界与军队之下；专题分色视图（联盟/文化/家族/宗教等）不叠绘国家占领墨色。
        if reveal >= 1 && (display.battleGround ?? true) && fills == nil {
            let t0 = CACurrentMediaTime()
            drawWashes(encoder, &u)
            probe?.wash.append((CACurrentMediaTime() - t0) * 1000)
        }
        // Province lines: 0.55 screen px once zoomed in. Colour is the measured #B2B2B2.
        // The screen width is the previous client choice; it is not a measured original width.
        // Province borders: smoothed ink lines at every zoom (MapLayers.provinceLines), so each
        // province reads as clearly as in the original.
        if reveal < 0.82 {
            // The shore is outlined first and gives way to the finished borders.
            if coastInk == nil { coastInk = self.buffer(MapLayers.coastInk(map).vertices, stride: 6) }
            colored(coastInk, alpha: ramp(0.1) * (1 - ramp(0.75)))
        } else if display.mapDetail ?? true {
            // 精致古图海岸微墨描边：常态下保留一道克制细墨岸线，令海湾岛屿轮廓清晰锐利。
            if coastInk == nil { coastInk = self.buffer(MapLayers.coastInk(map).vertices, stride: 6) }
            colored(coastInk, alpha: 0.24)
        } else if coastInk != nil { coastInk = nil }
        if display.provinceLines { colored(provinceLines, alpha: ramp(0.5)) }
        if let rivers, reveal > 0.42 {
            // 双层真实河道：先绘微偏移深青河岸暗影，再绘湛蓝清澈河心水体，层次立体自然。
            let rAlpha = ramp(0.42)
            var bankColor = SIMD4<Float>(MapLayers.river.r * 0.56, MapLayers.river.g * 0.62, MapLayers.river.b * 0.68, rAlpha * 0.52)
            var bankU = u
            bankU.center.x -= 0.45 / max(0.3, u.scale)
            bankU.center.y -= 0.55 / max(0.3, u.scale)
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
        let fineFade = Float(min(1, max(0, (camera.scale - 1.25) / 0.55)))
        if chart && fineFade > 0.01 { colored(fineDetail, alpha: ramp(0.44) * fineFade) }
        if display.vegetation { colored(relief, alpha: ramp(0.44)) }
        if display.borders { colored(outlines, alpha: ramp(0.75)) }
        if display.cityIcons { colored(icons, alpha: ramp(0.85)); colored(forts, alpha: ramp(0.85)); colored(portIcons, alpha: ramp(0.85)) }
        if reveal >= 1 {
        colored(route)
        encoder.setVertexBytes(&spriteProgress, length: MemoryLayout<Float>.stride, index: 4)
        var clock = Float(CACurrentMediaTime().truncatingRemainder(dividingBy: 600))
        encoder.setVertexBytes(&clock, length: MemoryLayout<Float>.stride, index: 5)
        let shadowFade = Float(min(1, max(0, (camera.scale - 0.62) / 0.25)))
        if showArmies && lightStrength > 0.1 && shadowFade > 0.02 {
            // 军团棋子东南落地阴影：随缩放平滑淡入淡出，零额外 CPU 开销，令大军如微缩棋子立于舆图之上
            u.alpha = shadowFade
            encoder.setRenderPipelineState(spriteShadowPipeline)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentSamplerState(sampler, index: 0)
            for unit in units {
                encoder.setVertexBuffer(unit.buffer, offset: 0, index: 0)
                encoder.setFragmentTexture(unit.texture, index: 0)
                encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: unit.count)
            }
            u.alpha = 1
        }
        if showArmies && !units.isEmpty {
            encoder.setRenderPipelineState(spritePipeline)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentSamplerState(sampler, index: 0)
            for unit in units {
                encoder.setVertexBuffer(unit.buffer, offset: 0, index: 0)
                encoder.setFragmentTexture(unit.texture, index: 0)
                encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: unit.count)
            }
        }
        }
        // The original's mounting (a paper band and black rules along the edge) read as a hard brown frame
        // on a phone screen; the scroll edge below (a soft aged wash) frames the map instead.
        _ = mount
        if display.parchment {
            // 严丝合缝裁切在地图画心 (0, 0, map.width, map.height) 内，彻底杜绝旧版羊皮纸外漏在画框下方的难看凸块！
            quad(parchment, multiplyPipeline, x: 0, y: 0, width: map.width, height: map.height)
        }
        } // end mapScissor
        encoder.setScissorRect(fullScissor)
        if display.scrollMount ?? display.darkEdges { colored(frame) }
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
    struct Uniforms { float2 viewport; float2 center; float scale; float halfWidth; float alpha; float time; float lighting; float mapWidth; float mapHeight; float pad; };
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
    static float fbm(float2 p) {
        float v = 0.0, a = 0.5;
        for (int k = 0; k < 4; k++) { v += a * vnoise(p); p = p * 2.03 + float2(17.1, 9.2); a *= 0.5; }
        return v;
    }
    // 统一全局光影：柔和东南飘移浮云投影（0 = 晴朗微光，1 = 轻云覆影，海陆同频流动）
    static float cloudCover(float2 world, float time) {
        float2 drift = float2(time * 2.4, time * 1.35);
        float c1 = vnoise((world - drift) * 0.0048 + float2(3.1, 7.4));
        float c2 = vnoise((world - drift * 1.45) * 0.0112 + float2(19.3, 11.7));
        float f = c1 * 0.65 + c2 * 0.35;
        return smoothstep(0.46, 0.80, f);
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
    // 陆地光影与宣纸质感：统一西北日照暖阳/青影层次 + 轻柔浮云投影 + 全局书案光氛 + 双频宣纸肌理。
    fragment float4 landFragment(LandOut in [[stage_in]], constant Uniforms& u [[buffer(2)]]) {
        float detail = clamp((in.scale - 0.5) / 1.5, 0.0, 1.0);
        float g1 = vnoise(in.world * 0.55) - 0.5;
        float g2 = vnoise(in.world * 1.95 + float2(13.7, 7.3)) - 0.5;
        float grain = (g1 * 0.025 + g2 * 0.024 * detail);
        float3 rgb = in.color.rgb;
        float lum = dot(rgb, float3(0.299, 0.587, 0.114));
        if (u.lighting > 0.01) {
            float k = u.lighting;
            // 西北向阳面泛暖玉金光，东南背阴面沉静冷青，山河起伏层次更鲜明且绝不发灰脏浊
            float3 warm = float3(1.048, 1.024, 0.976);
            float3 cool = float3(0.942, 0.962, 1.016);
            rgb *= mix(float3(1.0), mix(cool, warm, smoothstep(0.28, 0.74, lum)), k);
            // 柔和飘云斑驳光影（克制浓度，绝不压暗国界与地名）
            float cloud = cloudCover(in.world, u.time);
            float3 cloudTint = mix(float3(1.018, 1.012, 0.996), float3(0.938, 0.952, 0.976), cloud);
            rgb *= mix(float3(1.0), cloudTint, k * 0.72);
            // 统一全局西北御案光照
            float2 mapUV = clamp(in.world / float2(max(1.0, u.mapWidth), max(1.0, u.mapHeight)), 0.0, 1.0);
            rgb *= studioLight(mapUV, k);
            // 四时节气光影流转（u.pad 存放 0..1 年相：春润青玉、夏沐暖金、秋染缃赭、冬覆清霜）
            if (u.pad >= 0.0) {
                float ang = u.pad * 6.2831853;
                float springSummer = sin(ang);
                float autumnWinter = cos(ang);
                float3 seasonTint = float3(
                    1.0 + 0.014 * springSummer - 0.012 * autumnWinter,
                    1.0 + 0.011 * springSummer - 0.006 * autumnWinter,
                    1.0 - 0.012 * springSummer + 0.016 * autumnWinter
                );
                rgb *= mix(float3(1.0), seasonTint, k * 0.85);
                // 冬日北境高纬微霜薄雾（仅在冬季且靠北疆域轻敷 <= 2.2% 银霜感）
                float winterAmt = clamp(autumnWinter, 0.0, 1.0);
                float northFrost = winterAmt * smoothstep(0.42, 0.06, mapUV.y) * 0.022 * k;
                rgb = mix(rgb, float3(0.95, 0.96, 0.98), northFrost);
            }
        }
        rgb = clamp(rgb + grain, 0.0, 1.0);
        return float4(rgb, in.color.a);
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
        // Inked from the shore up to the peaks over 0.14…0.44.
        float rise = clamp((r.w - 0.14) / 0.30, 0.0, 1.0);
        float e = rise * 1.25 - 0.1 - (in.field.x * 0.8 + fbm(q * 0.02) * 0.25);
        float shown = smoothstep(-0.03, 0.05, e);
        // Each state's colour spreads from its capital over 0.5…0.75.
        float spread = clamp((r.w - 0.5) / 0.25, 0.0, 1.0);
        float ew = spread * 1.3 - 0.1 - (clamp(in.field.y, 0.0, 1.0) * 0.85 + fbm(q * 0.015 + float2(31.7, 11.3)) * 0.3);
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
        float flood = fbm(q * 0.006) * 0.55 + 0.45 * distance(q, middle) / max(1.0, length(middle));
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
        // Marks at least 22 points tall (an army mark is 5 map units), so whose army it is reads at
        // every zoom; banner and pips keep their proportions. The shift (in the quad's own size)
        // places the banner and the pips around the army's point.
        // 屏幕尺寸规则（与 MapRenderer.iconZoom 一致）：远景 6.8 点、随缩放增长、近景封顶 21 点，
        // 图标收巧约 22%，清晰露出国界与战线推进，触控区仍由 MapView 保持 ≥22pt。
        float pixels = s.size * clamp(u.scale * 0.66, 6.8 / 3.0112, 21.0 / 3.0112);
        // Alpha below zero: the icon fades in over the leg (new and re-formed armies).
        // Alpha −2: an army that fell fades out over the leg.
        float4 tint = float4(s.tint);
        // 阵亡的图标（标记 −2 − d）：在原处停到自己的阵亡时刻 d（本步动画进度），再在 0.15 内淡去——与阵亡动画同时开始。
        if (tint.a < -1.5) { float d = -tint.a - 2.0; tint.a = 1.0 - clamp((progress - d) / 0.15, 0.0, 1.0); }
        else if (tint.a < 0.0) tint.a = progress;
        // Alpha 2: an army in battle. Its pieces lunge and recoil, each army on its own beat.
        float2 jab = float2(0.0);
        if (tint.a > 1.5) {
            tint.a = 1.0;
            // 交战：节奏放缓、幅度减小，只表达“正在交锋”，不抖动（原先每秒九拍，看起来像晃动）。
            float seed = fract(s.center[0] * 0.137 + s.center[1] * 0.071) * 6.2832, beat = time * 4.5 + seed;
            jab = float2(sin(beat) * 0.04, -max(0.0, sin(beat * 0.5)) * 0.07);
        }
        // 驻扎的军队停稳不动：原先的“州郡内游走”让全图静止的军队一直缓慢漂移，与行军晃动混在一起难以分辨，已去掉。
        // 平滑行军: a Hermite curve leaving along the last leg's heading (lead), arriving straight.
        float t = progress, t2 = t * t, t3 = t2 * t;
        float2 a = float2(s.center), b = float2(s.target);
        float2 walk = a * (2.0 * t3 - 3.0 * t2 + 1.0) + float2(s.lead) * (t3 - 2.0 * t2 + t) + b * (3.0 * t2 - 2.0 * t3) + (b - a) * (t3 - t2);
        SpriteOut o; o.position = clip(walk, u, (float2(s.corner) + float2(s.shift) + jab) * pixels); o.uv = float2(s.corner) + 0.5; o.tint = tint; return o;
    }
    // A piece: the texture multiplied by the state's colour (white body → the colour, grey rim → its
    // shade, as the original's SpriteRenderer.color), the rim pulled towards ink so it reads on land
    // of the same colour, and lit a little from above.
    // 军团棋子东南落地投影着色器（复用同一顶点缓冲，与西北主光严格同向）
    vertex SpriteOut spriteShadowVertex(uint id [[vertex_id]], const device SpriteVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]], constant float& progress [[buffer(4)]],
                                        constant float& time [[buffer(5)]]) {
        SpriteVertex s = v[id];
        float pixels = s.size * clamp(u.scale * 0.66, 6.8 / 3.0112, 21.0 / 3.0112);
        float4 tint = float4(s.tint);
        if (tint.a < -1.5) { float d = -tint.a - 2.0; tint.a = 1.0 - clamp((progress - d) / 0.15, 0.0, 1.0); }
        else if (tint.a < 0.0) tint.a = progress;
        else if (tint.a > 1.5) tint.a = 1.0;
        float t = progress, t2 = t * t, t3 = t2 * t;
        float2 a = float2(s.center), b = float2(s.target);
        float2 walk = a * (2.0 * t3 - 3.0 * t2 + 1.0) + float2(s.lead) * (t3 - 2.0 * t2 + t) + b * (3.0 * t2 - 2.0 * t3) + (b - a) * (t3 - t2);
        float2 shOffset = float2(2.1, 2.5);
        SpriteOut o;
        o.position = clip(walk, u, (float2(s.corner) * float2(1.04, 0.96) + float2(s.shift)) * pixels + shOffset);
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
        // 西北受光棋面微高光，东南边缘柔和压深，增强军团立体棋子感
        float lightGrad = 1.09 - 0.14 * in.uv.y - 0.06 * in.uv.x;
        float3 fill = in.tint.rgb * lightGrad;
        float3 rim = mix(float3(0.14, 0.11, 0.08), in.tint.rgb, 0.28);
        float3 c = mix(rim, fill, smoothstep(0.45, 0.95, lum));
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
        // 1. 远洋宽带洋流与深海层次
        float current = (fbm(w * 0.010 + float2(4.2, 8.7)) - 0.5) * 0.062;
        float lum = dot(base, float3(0.299, 0.587, 0.114));
        float shallowMask = smoothstep(0.46, 0.78, lum);
        float3 shallowTint = float3(0.955, 1.032, 1.028);
        float3 deepTint = float3(0.935, 0.972, 1.035);
        float3 rgb = base * mix(deepTint, shallowTint, shallowMask);

        // 2. 铜版细腻水平微浪纹 + 动态海浪法线与西北日光波光高光
        float p1 = w.x * 0.19 + w.y * 0.62 - tm * 0.55;
        float p2 = w.x * 0.34 - w.y * 0.48 + tm * 0.38;
        float p3 = w.x * 0.11 + w.y * 0.92 + sin(w.x * 0.06) * 2.2 - tm * 0.25;
        float waveSlopeX = cos(p1) * 0.19 + cos(p2) * 0.22;
        float waveSlopeY = cos(p1) * 0.62 - cos(p2) * 0.31 + cos(p3) * 0.38;
        float3 waveN = normalize(float3(-waveSlopeX * 0.32, -waveSlopeY * 0.32, 1.0));
        // 与全局一致的西北太阳半程方向 -> 产生温润柔和的水面金白波光
        float3 halfVec = normalize(float3(-0.34, -0.30, 0.89));
        float spec = pow(max(0.0, dot(waveN, halfVec)), 22.0);
        float glint = spec * (0.048 + 0.065 * detail) * u.lighting;

        float engraving = sin(w.y * 0.88 + sin(w.x * 0.15 + fbm(w * 0.045) * 2.8) * 1.35) * (0.012 + 0.012 * detail);
        // 浅海沿岸柔和浪花呼吸光晕
        float surfPulse = (sin(w.x * 0.12 + w.y * 0.14 - tm * 0.9) * 0.5 + 0.5) * shallowMask * 0.032 * u.lighting;
        float grain = (vnoise(w * 0.68) - 0.5) * 0.022;

        rgb += current + engraving + grain + surfPulse;
        rgb += float3(1.0, 0.96, 0.84) * glint;

        if (u.lighting > 0.01) {
            float cloud = cloudCover(w, tm);
            float3 cloudTint = mix(float3(1.018, 1.016, 1.008), float3(0.915, 0.935, 0.972), cloud);
            rgb *= mix(float3(1.0), cloudTint, u.lighting * 0.90);
            rgb *= studioLight(in.uv, u.lighting);
        }
        rgb = clamp(rgb, 0.0, 1.0);
        return float4(rgb, 1.0);
    }
    """
}
