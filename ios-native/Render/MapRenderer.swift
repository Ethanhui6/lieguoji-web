import UIKit
import MetalKit
import LieguojiCore

/// Draws the world with Metal in the web renderer's layer order (original-play-renderer + map.ts):
/// coastal-distance sea texture → land cells → province lines → rivers → mountain and forest
/// ornaments → state outlines and coastline → city icons → the original parchment multiplied over
/// everything. Geometry is uploaded once; land colours only when the view mode or selection
/// changes. The view redraws on demand (camera change, animation), not continuously.
final class MapRenderer: NSObject, MTKViewDelegate {
    private let device: MTLDevice
    private let queue: MTLCommandQueue
    private let cellPipeline: MTLRenderPipelineState
    /// The generation reveal on the GPU: land rises from the sea by height, then the states' colours wash in.
    private let revealPipeline: MTLRenderPipelineState
    /// 易主渐变: a conquered province's colour blends from its old owner's to the new one's.
    private let fadePipeline: MTLRenderPipelineState
    private var previousColors: MTLBuffer?
    private var fadeStart: CFTimeInterval = 0
    private var fadeOnRecolor = false
    static let fadeDuration: CFTimeInterval = 0.7
    private var fading: Bool { previousColors != nil && CACurrentMediaTime() - fadeStart < Self.fadeDuration }
    private let linePipeline: MTLRenderPipelineState
    private let flatPipeline: MTLRenderPipelineState
    private let coloredPipeline: MTLRenderPipelineState
    private let texturePipeline: MTLRenderPipelineState
    private let multiplyPipeline: MTLRenderPipelineState
    private let spritePipeline: MTLRenderPipelineState
    /// Army icons grouped by unit type: the texture and its quads.
    private var units: [(texture: MTLTexture, buffer: MTLBuffer, count: Int)] = []
    private let positions: MTLBuffer
    private var indices: MTLBuffer
    private var indexCount: Int
    private var colors: MTLBuffer
    private var provinceLines: (buffer: MTLBuffer, count: Int)?
    private var rivers: (buffer: MTLBuffer, count: Int)?
    private var relief: (buffer: MTLBuffer, count: Int)?
    private var outlines: (buffer: MTLBuffer, count: Int)?
    private var icons: (buffer: MTLBuffer, count: Int)?
    /// Sea lanes between harbours. Rebuilt when the port list changes, hidden by the display switch.
    private var seaLanes: (buffer: MTLBuffer, count: Int)?
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
    /// 卷轴边缘: the map's paper edge darkens like an old scroll and a double ink rule frames it.
    private var frame: (buffer: MTLBuffer, count: Int)?
    private let sea: MTLTexture?
    private let parchment: MTLTexture?
    private let sampler: MTLSamplerState?
    private(set) var map: WorldMap { didSet { revealHeights = nil } }
    private var nationColors: [RGB]
    private var tint: [Int: RGB] = [:]
    private var fills: [RGB]?
    var camera: MapCamera
    var onDraw: ((CFTimeInterval) -> Void)?
    private(set) var mode: MapMode = .political
    private(set) var highlight: Int?

    struct Uniforms { var viewport: SIMD2<Float>; var center: SIMD2<Float>; var scale: Float; var halfWidth: Float }
    struct QuadUniforms { var origin: SIMD2<Float>; var size: SIMD2<Float> }

    init?(view: MTKView, map: WorldMap, parchmentURL: URL?, unitURL: (String) -> URL? = { _ in nil }) {
        guard let device = view.device, let queue = device.makeCommandQueue() else { return nil }
        self.device = device; self.queue = queue; self.map = map
        nationColors = map.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        camera = MapCamera.fit(map: (Double(map.width), Double(map.height)), viewport: (390, 844))
        view.sampleCount = 4
        // Colours are sRGB as the web draws them; blend and store them unconverted, like Pixi.
        view.colorPixelFormat = .bgra8Unorm
        do {
            let library = try device.makeLibrary(source: MapRenderer.shaders, options: nil)
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
            cellPipeline = try pipeline("cellVertex", "colorFragment", .none)
            revealPipeline = try pipeline("revealVertex", "colorFragment", .none)
            fadePipeline = try pipeline("fadeVertex", "colorFragment", .none)
            linePipeline = try pipeline("lineVertex", "flatFragment", .alpha)
            flatPipeline = try pipeline("flatVertex", "flatFragment", .alpha)
            coloredPipeline = try pipeline("coloredVertex", "colorFragment", .alpha)
            texturePipeline = try pipeline("quadVertex", "textureFragment", .none)
            multiplyPipeline = try pipeline("quadVertex", "textureFragment", .multiply)
            spritePipeline = try pipeline("spriteVertex", "spriteFragment", .alpha)
        } catch { return nil }
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
        s.sAddressMode = .clampToEdge; s.tAddressMode = .clampToEdge
        sampler = device.makeSamplerState(descriptor: s)
        super.init()
        // Layers built off the main thread for this very map are used as they are.
        let ready = Self.prepared.flatMap { $0.key == MapLayers.key(map) ? $0 : nil }
        Self.prepared = nil
        provinceLines = buffer(ready?.provinceLines ?? MapLayers.provinceLines(map).vertices, stride: 6)
        if !map.rivers.isEmpty { rivers = buffer(map.rivers, stride: 2) }
        relief = buffer(ready?.relief ?? MapLayers.relief(map).vertices, stride: 6)
        outlines = buffer(ready?.outlines ?? MapLayers.outlines(map).vertices, stride: 6)
        icons = buffer(ready?.icons ?? MapLayers.cityIcons(map).vertices, stride: 6)
        frame = buffer(MapLayers.scrollFrame(width: map.width, height: map.height).vertices, stride: 6)
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
        // 军牌底盘: a round token under each army, a light disc in a dark rim, tinted with its state's colour,
        // so armies stand out from the terrain at every zoom (pale pieces alone vanished into the land).
        let plateArt = UIGraphicsImageRenderer(size: CGSize(width: 96, height: 96), format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; return f }()).image { ctx in
            let g = ctx.cgContext
            // The original's avatarSquare: a rounded square plaque, dark rim, light face.
            g.setFillColor(UIColor.black.cgColor); g.addPath(UIBezierPath(roundedRect: CGRect(x: 4, y: 4, width: 88, height: 88), cornerRadius: 18).cgPath); g.fillPath()
            g.setFillColor(UIColor.white.cgColor); g.addPath(UIBezierPath(roundedRect: CGRect(x: 11, y: 11, width: 74, height: 74), cornerRadius: 13).cgPath); g.fillPath()
        }.cgImage
        if let plateArt { unitTextures["0plate"] = (try? loader.newTexture(cgImage: plateArt, options: [.SRGB: false, .generateMipmaps: true])) ?? Self.texture(device, plateArt) }
        if let start = map.meta.economy {
            setArmies(start.armies.filter { $0.troops > 0 }.enumerated().map { ArmySprite(army: $0.offset, x: $0.element.x, y: $0.element.y, unit: $0.element.unit, nation: $0.element.nation, selected: false) }, route: [])
        }
    }

    /// 自绘地图: the terrain itself changed (land raised from the sea, coasts moved): the land mesh,
    /// relief marks, province lines and outlines are rebuilt, and the sea texture when given.
    func setTerrain(_ next: WorldMap, refreshSea: Bool) {
        map = next; base = nil; shade = []; terrainBase = nil
        nationColors = next.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        let mesh = CellMesh(map: next)
        if !mesh.indices.isEmpty, let i = device.makeBuffer(bytes: mesh.indices, length: mesh.indices.count * 4, options: .storageModeShared) { indices = i; indexCount = mesh.indices.count }
        else if mesh.indices.isEmpty { indexCount = 0 }
        provinceLines = buffer(MapLayers.provinceLines(next).vertices, stride: 6)
        rivers = next.rivers.isEmpty ? nil : buffer(next.rivers, stride: 2)
        relief = buffer(MapLayers.relief(next).vertices, stride: 6)
        outlines = buffer(MapLayers.outlines(next).vertices, stride: 6)
        icons = buffer(MapLayers.cityIcons(next).vertices, stride: 6)
        if refreshSea { seaSource = next.seaRGBA; uploadSea(); seaLaneKey = []; seaLanes = nil }
        recolor()
    }

    /// Harbour points in map units. Empty hides the lanes even when the switch is on.
    @discardableResult func setSeaPorts(_ ports: [SIMD2<Float>]) -> Bool {
        guard ports != seaLaneKey else { return false }
        seaLaneKey = ports
        seaLanes = buffer(MapLayers.seaLanes(map, ports: ports.map { (x: $0.x, y: $0.y) }).vertices, stride: 6)
        return true
    }

    /// A small battlement beside each fortified city (above right of its mark), in ink with a light inner wall.
    @discardableResult func setForts(_ points: [SIMD2<Float>], holy: [SIMD2<Float>] = []) -> Bool {
        guard points != fortKey || holy != holyKey else { return false }
        fortKey = points; holyKey = holy
        var m = ColoredMesh()
        let u = MapLayers.cityUnit, ink = RGB(0.16, 0.12, 0.1), wall = RGB(0.93, 0.89, 0.8)
        func rect(_ x0: Float, _ y0: Float, _ x1: Float, _ y1: Float, _ c: RGB) { m.fill([x0, y0, x1, y0, x1, y1, x0, y1], c, alpha: 1) }
        for p in points {
            let x = p.x + 2.5 * u, y = p.y - 2.4 * u, w = 2.2 * u, h = 1.6 * u, k = w / 5
            rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, ink)
            for i in [0, 2, 4] { rect(x - w / 2 + Float(i) * k, y - h / 2 - k * 1.1, x - w / 2 + Float(i + 1) * k, y - h / 2, ink) }
            rect(x - w / 2 + k * 0.6, y - h / 2 + k * 0.6, x + w / 2 - k * 0.6, y + h / 2 - k * 0.6, wall)
            rect(x - k * 0.45, y + h / 2 - k * 1.8, x + k * 0.45, y + h / 2, ink)
        }
        // 圣地: a gold four-pointed star with an ink rim above left of the city mark.
        let gold = RGB(0.86, 0.66, 0.2)
        for p in holy {
            let x = p.x - 2.5 * u, y = p.y - 2.4 * u
            for (r, c) in [(1.55 * u, ink), (1.2 * u, gold)] {
                let k = r * 0.36
                m.fill([x, y - r, x + k, y - k, x + r, y, x + k, y + k, x, y + r, x - k, y + k, x - r, y, x - k, y - k], c, alpha: 1)
            }
        }
        forts = buffer(m.vertices, stride: 6)
        return true
    }

    private func uploadSea() {
        guard let sea, seaSource.count == map.seaWidth * map.seaHeight * 4 else { return }
        let bytes = MapPalette.recolorSea(seaSource, from: .warmPaper, to: MapPalette.ocean(display.ocean))
        bytes.withUnsafeBytes { raw in
            if let base = raw.baseAddress {
                sea.replace(region: MTLRegionMake2D(0, 0, map.seaWidth, map.seaHeight), mipmapLevel: 0, withBytes: base, bytesPerRow: map.seaWidth * 4)
            }
        }
    }

    /// Ownership changed (conquest, rebellion): recolour the land and redraw the state outlines.
    /// The state outlines are rebuilt on a background queue (the whole map's border walk); the land
    /// is recoloured at once, and the new outlines replace the old ones when ready.
    func setMap(_ next: WorldMap) {
        map = next
        nationColors = next.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        outlineGeneration += 1
        let generation = outlineGeneration
        let wide = borderWide
        // Everything an ownership change redraws — every vertex's colour, the state outlines and the
        // city marks — is computed off the main thread and swapped in together (the colours used to be
        // recomputed for the whole map on the main thread at each conquest).
        let inputs = BaseInputs(mode: mode, nationColors: nationColors, highlight: highlight, tint: tint, fills: fills, density: Float(display.colorDensity), terrain: terrainBase, shade: shade)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let vertices = MapLayers.outlines(next, wide: wide).vertices
            let marks = MapLayers.cityIcons(next).vertices
            let provinceLines = MapLayers.provinceLines(next).vertices
            let colours = MapRenderer.baseColors(next, inputs)
            DispatchQueue.main.async {
                guard let self, generation == self.outlineGeneration else { return }
                self.outlines = self.buffer(vertices, stride: 6)
                self.icons = self.buffer(marks, stride: 6)
                self.provinceLines = self.buffer(provinceLines, stride: 6)
                if self.terrainBase == nil { self.terrainBase = colours.terrainBase }
                if self.shade.isEmpty { self.shade = colours.shade }
                // Only if nothing changed the look meanwhile (a mode switch rebuilds its own base).
                if self.mode == inputs.mode && self.fills == inputs.fills && self.highlight == inputs.highlight && self.tint == inputs.tint { self.base = (colours.land, colours.terrain) }
                else { self.base = nil }
                self.fadeOnRecolor = true
                self.recolor()
                self.fadeOnRecolor = false
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
            let k = max(0, i.density)
            for j in 0..<min(c.count, terrain.count) where j % 4 != 3 { c[j] = terrain[j] + (c[j] - terrain[j]) * k }
        }
        let shade = i.shade.count == map.vertices.count / 2 ? i.shade : MapLayers.vertexHillshade(map)
        for v in shade.indices {
            let k = shade[v]
            for j in 0..<3 { c[v * 4 + j] = min(1, c[v * 4 + j] * k); terrain[v * 4 + j] = min(1, terrain[v * 4 + j] * k) }
        }
        return (c, terrain, terrainBase, shade)
    }
    private var outlineGeneration = 0
    private var borderWide = Set<Int>()
    /// The open nation and the owner of the selected province, drawn at twice the border width.
    func setBorderEmphasis(_ wide: Set<Int>) {
        guard wide != borderWide else { return }
        borderWide = wide
        outlineGeneration += 1
        let generation = outlineGeneration
        let next = map
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let vertices = MapLayers.outlines(next, wide: wide).vertices
            DispatchQueue.main.async {
                guard let self, generation == self.outlineGeneration else { return }
                self.outlines = self.buffer(vertices, stride: 6)
                self.onOutlines?()
            }
        }
    }
    /// Called on the main queue when new outlines are ready to draw.
    var onOutlines: (() -> Void)?

    /// The title screen's generation animation: 0 shows only the sea; land rises from the coast to the
    /// mountains, then the states' colours wash over it; at 1 every layer is drawn.
    private(set) var reveal: Float = 1
    /// Only a value for the reveal shader: no colours are recomputed while the land rises.
    func setReveal(_ t: Float) { reveal = max(0, min(1, t)); if base == nil { recolor() } }
    /// The map's colours before the generation reveal: the land colours of the current mode and the
    /// terrain colours, both shaded. Kept while only the reveal moves, so the rising animation does not
    /// recompute every cell's palette 60 times a second.
    private var base: (land: [Float], terrain: [Float])? { didSet { revealTerrain = nil } }
    /// For the reveal shader: each vertex's height (0 coast … 1 peak; −1 water) and the shaded terrain colours.
    private var revealHeights: MTLBuffer?
    private var revealTerrain: MTLBuffer?
    private func revealBuffers() -> (heights: MTLBuffer, terrain: MTLBuffer)? {
        guard let base else { return nil }
        if revealTerrain == nil { revealTerrain = device.makeBuffer(bytes: base.terrain, length: max(4, base.terrain.count * 4), options: .storageModeShared) }
        if revealHeights == nil {
            var h = [Float](repeating: -1, count: map.vertices.count / 2)
            let top = Float(max(21, map.elevation.max().map(Int.init) ?? 100))
            for cell in 0..<map.cellCount where map.isLand(cell) {
                let v = (Float(map.elevation[cell]) - 20) / (top - 20)
                for i in Int(map.offsets[cell])..<min(h.count, Int(map.offsets[cell + 1])) { h[i] = max(0, v) }
            }
            revealHeights = device.makeBuffer(bytes: h, length: max(4, h.count * 4), options: .storageModeShared)
        }
        guard let a = revealHeights, let b = revealTerrain else { return nil }
        return (a, b)
    }

    private(set) var display = DisplaySettings()
    func setDisplay(_ d: DisplaySettings) {
        let recolour = d.colorDensity != display.colorDensity || d.ocean != display.ocean
        let seaChanged = d.ocean != display.ocean
        display = d
        if seaChanged { uploadSea() }
        if recolour { base = nil; recolor() }
    }
    private func recolor() {
        if base == nil {
            var c = CellMesh.colors(map: map, mode: mode, nationColors: nationColors, highlightProvince: highlight, tint: tint, provinceColors: mode == .political ? fills : nil)
            if terrainBase == nil { terrainBase = CellMesh.colors(map: map, mode: .terrain, nationColors: nationColors) }
            var terrain = terrainBase!
            // 国家颜色浓度: state colours blended toward the terrain colours.
            if mode == .political && display.colorDensity < 1 {
                let k = Float(max(0, display.colorDensity))
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
            base = (c, terrain)
        }
        guard let base else { return }
        // The generation reveal (land rising from the coast to the peaks over 0…0.45, the states' colours
        // washing in over 0.55…0.75) is drawn by revealVertex from these colours: no per-frame CPU work.
        let c = base.land
        if let b = device.makeBuffer(bytes: c, length: c.count * 4, options: .storageModeShared) {
            // An ownership change after the reveal fades in; mode switches and the reveal stay instant.
            if fadeOnRecolor && reveal >= 1 && colors.length == b.length { previousColors = fading ? previousColors : colors; fadeStart = CACurrentMediaTime() }
            colors = b
        }
    }
    private var shade: [Float] = []
    private var terrainBase: [Float]?

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
    struct ArmySprite: Equatable { var army: Int; var x: Float; var y: Float; var unit: String; var nation: Int; var selected: Bool; var key = ""; var tier = 1; var banner = 0; var reorganizing = false
        /// Locked in battle: its pieces lunge and recoil on the map (spriteVertex, alpha marker 2).
        var fighting = false
        /// Falling back: drawn faded (败退), without the idle drift.
        var retreating = false }
    private var unitTextures: [String: MTLTexture] = [:]
    private var route: (buffer: MTLBuffer, count: Int)?
    private var armySprites: [ArmySprite] = []
    /// 溃散: armies gone since the last snapshot, fading out where they fell over one leg (drawn only).
    private var dying: [ArmySprite] = []
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
    var isAnimating: Bool { chasing || fading }
    private func progress(_ now: CFTimeInterval) -> Float {
        legLength <= 0 ? 1 : Float(min(1, max(0, (now - legStart) / legLength)))
    }
    private func displayed(_ s: ArmySprite) -> SIMD2<Float> {
        guard !s.key.isEmpty, let a = legFrom[s.key], let b = legTo[s.key] else { return SIMD2(s.x, s.y) }
        return Self.hermite(a, b, legLead[s.key] ?? (b - a), progress(CACurrentMediaTime()))
    }
    /// The leg's curve (as spriteVertex draws it): from a leaving along m0, arriving at b along b − a.
    static func hermite(_ a: SIMD2<Float>, _ b: SIMD2<Float>, _ m0: SIMD2<Float>, _ t: Float) -> SIMD2<Float> {
        let t2 = t * t, t3 = t2 * t
        return a * (2 * t3 - 3 * t2 + 1) + m0 * (t3 - 2 * t2 + t) + b * (3 * t2 - 2 * t3) + (b - a) * (t3 - t2)
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
    /// Armies that re-formed far away since the last call (key and where they fell), for the effects.
    private(set) var jumped: [(key: String, x: Float, y: Float)] = []
    func takeJumped() -> [(key: String, x: Float, y: Float)] { defer { jumped = [] }; return jumped }
    func placedSprites() -> [(sprite: ArmySprite, x: Float, y: Float)] {
        armySprites.map { s in let p = displayed(s); return (s, p.x, p.y) }
    }

    func setArmies(_ sprites: [ArmySprite], route points: [SIMD2<Float>], snap: Bool = false) {
        if snap || sprites != armySprites {
            let now = CACurrentMediaTime(), t = progress(now)
            let previous = Dictionary(armySprites.map { ($0.key, $0.reorganizing) }, uniquingKeysWith: { a, _ in a })
            var from = [String: SIMD2<Float>](), to = [String: SIMD2<Float>](), fading = Set<String>(), lead = [String: SIMD2<Float>]()
            let newLength = snap ? 0 : max(0.12, tweenDuration * 1.08)
            for s in sprites where !s.key.isEmpty {
                let target = SIMD2(s.x, s.y)
                // Where the icon stands now, mid-walk included (nil: a new army, or a world just opened).
                let here: SIMD2<Float>? = snap ? nil : legFrom[s.key].flatMap { a in legTo[s.key].map { b in Self.hermite(a, b, legLead[s.key] ?? (b - a), t) } }
                guard let p = here else {
                    // A new army fades in where it stands (no walk from nowhere); none on a fresh world.
                    from[s.key] = target; to[s.key] = target
                    if !snap && !armySprites.isEmpty { fading.insert(s.key) }
                    continue
                }
                if s.reorganizing && previous[s.key] != true {
                    // An army re-formed at home: it appears there (the fall plays where it was).
                    from[s.key] = target; to[s.key] = target; fading.insert(s.key); jumped.append((s.key, p.x, p.y))
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
                        if k > along * 1.2 + 0.0001 { m *= (along * 1.2) / k }
                        lead[s.key] = m
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
                    cluster[SIMD2(Int32((e.x / cell).rounded()), Int32((e.y / cell).rounded())), default: []].append(i)
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
            self.spread = spread
            for a in sprites {
                // Harbours (and merchantmen) keep still: alpha 0.99 tells the shader not to let them drift.
                fade = ghosts.contains(a.key) ? -2 : fresh.contains(a.key) ? -1 : a.fighting ? 2 : a.retreating ? 0.55 : a.army <= -100_000 ? 0.99 : 1
                let o = spread[a.key] ?? SIMD2<Float>(0, 0)
                let c = a.selected ? RGB(1, 0.93, 0.55) : nationColors.indices.contains(a.nation) ? nationColors[a.nation] : RGB(1, 1, 1)
                let role = UnitArt.role(a.unit), at = legFrom[a.key] ?? SIMD2(a.x, a.y)
                end = legTo[a.key] ?? at
                lead = legLead[a.key] ?? (end - at)
                let size = iconSize * iconScale * (a.unit == "Port" ? 0.7 : a.unit == "Merchant" ? 0.75 : 1) * (a.selected ? 1.3 : 1)
                // The commander's gonfalon stands behind the pieces: gold for the ruler in person.
                if a.banner > 0 && role != "Fleet" {
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
            // A fixed draw order (banners first, then by role): a fresh dictionary's order changed every
            // rebuild, so overlapping icons swapped in front of each other and flickered.
            // Banners, then the tokens ("0plate" sorts before every arm), then the pieces.
            units = byRole.keys.sorted { ($0 == "banner" ? "" : $0) < ($1 == "banner" ? "" : $1) }.compactMap { role -> (texture: MTLTexture, buffer: MTLBuffer, count: Int)? in
                guard let data = byRole[role], let texture = unitTextures[role], let b = device.makeBuffer(bytes: data, length: data.count * 4, options: .storageModeShared) else { return nil }
                return (texture: texture, buffer: b, count: data.count / 15)
            }
        }
    }

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
    func setAppearance(mode: MapMode, highlight: Int?, tint: [Int: RGB] = [:], fills: [RGB]? = nil) {
        guard mode != self.mode || highlight != self.highlight || tint != self.tint || fills != self.fills else { return }
        self.mode = mode; self.highlight = highlight; self.tint = tint; self.fills = fills
        // The whole map's colours are worked out off the main thread (opening a state's page tints its
        // friends and foes, and recolouring every vertex there stalled the page's slide-in); the old
        // colours stay on screen until the new ones are ready.
        appearanceGeneration += 1
        let generation = appearanceGeneration, map = self.map, outlines = outlineGeneration
        let inputs = BaseInputs(mode: mode, nationColors: nationColors, highlight: highlight, tint: tint, fills: fills, density: Float(display.colorDensity), terrain: terrainBase, shade: shade)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let colours = MapRenderer.baseColors(map, inputs)
            DispatchQueue.main.async {
                // A newer appearance, or a new map since (its own pass sets the colours), wins.
                guard let self, generation == self.appearanceGeneration, outlines == self.outlineGeneration else { return }
                if self.terrainBase == nil { self.terrainBase = colours.terrainBase }
                if self.shade.isEmpty { self.shade = colours.shade }
                self.base = (colours.land, colours.terrain)
                self.recolor()
                self.onOutlines?()
            }
        }
    }
    private var appearanceGeneration = 0

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
              let buffer = queue.makeCommandBuffer(), let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        var spriteProgress: Float = advanceChase()
        let size = view.bounds.size
        var u = Uniforms(viewport: SIMD2(Float(size.width), Float(size.height)), center: SIMD2(Float(camera.centerX), Float(camera.centerY)), scale: Float(camera.scale), halfWidth: 0)
        let uniformLength = MemoryLayout<Uniforms>.stride
        func quad(_ texture: MTLTexture?, _ pipeline: MTLRenderPipelineState, x: Float, y: Float, width: Float, height: Float) {
            guard let texture else { return }
            var q = QuadUniforms(origin: SIMD2(x, y), size: SIMD2(width, height))
            encoder.setRenderPipelineState(pipeline)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setVertexBytes(&q, length: MemoryLayout<QuadUniforms>.stride, index: 3)
            encoder.setFragmentTexture(texture, index: 0)
            encoder.setFragmentSamplerState(sampler, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
        }
        func colored(_ layer: (buffer: MTLBuffer, count: Int)?) {
            guard let layer else { return }
            encoder.setRenderPipelineState(coloredPipeline)
            encoder.setVertexBuffer(layer.buffer, offset: 0, index: 0)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: layer.count)
        }
        quad(sea, texturePipeline, x: 0, y: 0, width: map.width, height: map.height)
        if reveal < 1, let rb = revealBuffers() {
            let sea = MapPalette.ocean(display.ocean).shallow
            var r = SIMD4<Float>(sea.r, sea.g, sea.b, reveal)
            encoder.setRenderPipelineState(revealPipeline)
            encoder.setVertexBuffer(rb.terrain, offset: 0, index: 3)
            encoder.setVertexBuffer(rb.heights, offset: 0, index: 4)
            encoder.setVertexBytes(&r, length: MemoryLayout<SIMD4<Float>>.stride, index: 5)
        } else if fading, let previous = previousColors {
            let x = Float(min(1, (CACurrentMediaTime() - fadeStart) / Self.fadeDuration))
            var t = x * x * (3 - 2 * x)
            encoder.setRenderPipelineState(fadePipeline)
            encoder.setVertexBuffer(previous, offset: 0, index: 3)
            encoder.setVertexBytes(&t, length: MemoryLayout<Float>.stride, index: 4)
        } else {
            if previousColors != nil { previousColors = nil }
            encoder.setRenderPipelineState(cellPipeline)
        }
        encoder.setVertexBuffer(positions, offset: 0, index: 0)
        encoder.setVertexBuffer(colors, offset: 0, index: 1)
        encoder.setVertexBytes(&u, length: uniformLength, index: 2)
        if indexCount > 0 { encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0) }
        // Province lines: 0.55 screen px once zoomed in. Colour is the measured #B2B2B2.
        // The screen width is the previous client choice; it is not a measured original width.
        // Province borders: smoothed ink lines at every zoom (MapLayers.provinceLines), so each
        // province reads as clearly as in the original.
        if display.provinceLines && reveal >= 0.55 { colored(provinceLines) }
        if let rivers, reveal > 0.38 {
            var color = SIMD4<Float>(MapLayers.river.r, MapLayers.river.g, MapLayers.river.b, 1)
            encoder.setRenderPipelineState(flatPipeline)
            encoder.setVertexBuffer(rivers.buffer, offset: 0, index: 0)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentBytes(&color, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: rivers.count)
        }
        if display.seaRoutes && reveal >= 0.7 { colored(seaLanes) }
        if display.gridLines == true && reveal >= 1 { colored(gridLines) }
        if display.vegetation && reveal >= 0.45 { colored(relief) }
        if display.borders && reveal >= 0.75 { colored(outlines) }
        if display.cityIcons && reveal >= 0.85 { colored(icons); colored(forts) }
        if reveal >= 1 {
        colored(route)
        encoder.setVertexBytes(&spriteProgress, length: MemoryLayout<Float>.stride, index: 4)
        var clock = Float(CACurrentMediaTime().truncatingRemainder(dividingBy: 600))
        encoder.setVertexBytes(&clock, length: MemoryLayout<Float>.stride, index: 5)
        for unit in units where showArmies {
            encoder.setRenderPipelineState(spritePipeline)
            encoder.setVertexBuffer(unit.buffer, offset: 0, index: 0)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentTexture(unit.texture, index: 0)
            encoder.setFragmentSamplerState(sampler, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: unit.count)
        }
        }
        if display.parchment {
            let r = map.meta.parchment
            quad(parchment, multiplyPipeline, x: r.x, y: r.y, width: r.width, height: r.height)
        }
        if display.darkEdges && reveal >= 0.2 { colored(frame) }
        encoder.endEncoding()
        buffer.present(drawable)
        buffer.commit()
        onDraw?(CACurrentMediaTime())
    }

    static let shaders = """
    #include <metal_stdlib>
    using namespace metal;
    struct Uniforms { float2 viewport; float2 center; float scale; float halfWidth; };
    struct QuadUniforms { float2 origin; float2 size; };
    struct ColorOut { float4 position [[position]]; float4 color; };
    struct FlatOut { float4 position [[position]]; };
    struct QuadOut { float4 position [[position]]; float2 uv; };
    static float4 clip(float2 world, constant Uniforms& u, float2 offset) {
        float2 s = (world - u.center) * u.scale + u.viewport * 0.5 + offset;
        return float4(s.x / u.viewport.x * 2.0 - 1.0, 1.0 - s.y / u.viewport.y * 2.0, 0.0, 1.0);
    }
    vertex ColorOut cellVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]],
                               const device float4* colors [[buffer(1)]], constant Uniforms& u [[buffer(2)]]) {
        ColorOut o; o.position = clip(positions[id], u, float2(0.0)); o.color = colors[id]; return o;
    }
    struct ColoredVertex { packed_float2 position; packed_float4 color; };
    vertex ColorOut coloredVertex(uint id [[vertex_id]], const device ColoredVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        ColorOut o; o.position = clip(float2(v[id].position), u, float2(0.0)); o.color = float4(v[id].color); return o;
    }
    fragment float4 colorFragment(ColorOut in [[stage_in]]) { return in.color; }
    vertex ColorOut fadeVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], const device float4* colors [[buffer(1)]],
                               constant Uniforms& u [[buffer(2)]], const device float4* previous [[buffer(3)]], constant float& t [[buffer(4)]]) {
        ColorOut o; o.position = clip(positions[id], u, float2(0.0)); o.color = mix(previous[id], colors[id], t); return o;
    }
    vertex ColorOut revealVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]], const device float4* colors [[buffer(1)]],
                                 constant Uniforms& u [[buffer(2)]], const device float4* terrain [[buffer(3)]], const device float* heights [[buffer(4)]],
                                 constant float4& r [[buffer(5)]]) {
        ColorOut o; o.position = clip(positions[id], u, float2(0.0));
        float4 c = colors[id]; float h = heights[id];
        if (h >= 0.0) {
            float2 q = positions[id];
            // A slow field over the map: the states' colours spread like ink soaking into paper, in
            // patches, rather than all at once.
            float n = 0.5 + 0.5 * sin(q.x * 0.0115 + 1.7) * cos(q.y * 0.0137 - 0.6) * 0.8 + 0.1 * sin((q.x + q.y) * 0.031);
            // Heights are per cell, so a cell used to pop up whole (a mosaic of blocks). A fine field over
            // each vertex varies the height inside the cell, and a wider band lets the shore creep in.
            float fine = 0.5 * sin(q.x * 0.071 + q.y * 0.013) + 0.5 * cos(q.y * 0.083 - q.x * 0.021);
            // The rise follows a field of map position only: neighbouring cells meet at the same points, so
            // they reach the same value there and the shore blends across cell borders instead of
            // stepping cell by cell (a cell's own height jumped at every border: the mosaic).
            float field = 0.5 + 0.28 * sin(q.x * 0.0093 + 1.3) * cos(q.y * 0.0108 - 0.4) + 0.14 * sin((q.x - q.y) * 0.0231) + 0.08 * cos(q.x * 0.041 + q.y * 0.037);
            float hh = field + fine * 0.03;
            float rise = min(1.0, r.w / 0.45), wash = clamp((r.w - 0.5 - n * 0.22 - fine * 0.04) / 0.16, 0.0, 1.0);
            float shown = smoothstep(0.0, 1.0, clamp((rise * 1.2 - hh) * 3.2, 0.0, 1.0));
            float3 ground = terrain[id].rgb + (c.rgb - terrain[id].rgb) * wash;
            c.rgb = r.rgb + (ground - r.rgb) * shown;
            // An ink line runs along the rising shore, and a darker rim where the colour arrives.
            float shore = shown * (1.0 - shown) * 4.0, front = wash * (1.0 - wash) * 4.0;
            c.rgb = mix(c.rgb, float3(0.14, 0.11, 0.08), shore * 0.55);
            c.rgb = mix(c.rgb, c.rgb * 0.72, front * 0.6);
        }
        o.color = c; return o;
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
        float pixels = s.size * max(u.scale, 14.0 / 3.01);
        // Alpha below zero: the icon fades in over the leg (new and re-formed armies).
        // Alpha −2: an army that fell fades out over the leg.
        float4 tint = float4(s.tint); if (tint.a < -1.5) tint.a = 1.0 - progress; else if (tint.a < 0.0) tint.a = progress;
        // Alpha 2: an army in battle. Its pieces lunge and recoil, each army on its own beat.
        float2 jab = float2(0.0);
        if (tint.a > 1.5) {
            tint.a = 1.0;
            float seed = fract(s.center[0] * 0.137 + s.center[1] * 0.071) * 6.2832, beat = time * 9.0 + seed;
            jab = float2(sin(beat) * 0.07, -max(0.0, sin(beat * 0.5)) * 0.12);
        } else if (s.center[0] == s.target[0] && s.center[1] == s.target[1] && tint.a > 0.995) {
            // 州郡内游走 (the original's RandomMoveInProvince): a standing army drifts slowly about its
            // post instead of standing frozen on one point.
            float seed = fract(s.center[0] * 0.173 + s.center[1] * 0.059) * 6.2832;
            jab = float2(sin(time * 0.33 + seed), cos(time * 0.27 + seed * 1.7)) * 0.16;
        }
        // 平滑行军: a Hermite curve leaving along the last leg's heading (lead), arriving straight.
        float t = progress, t2 = t * t, t3 = t2 * t;
        float2 a = float2(s.center), b = float2(s.target);
        float2 walk = a * (2.0 * t3 - 3.0 * t2 + 1.0) + float2(s.lead) * (t3 - 2.0 * t2 + t) + b * (3.0 * t2 - 2.0 * t3) + (b - a) * (t3 - t2);
        SpriteOut o; o.position = clip(walk, u, (float2(s.corner) + float2(s.shift) + jab) * pixels); o.uv = float2(s.corner) + 0.5; o.tint = tint; return o;
    }
    // A piece: the texture multiplied by the state's colour (white body → the colour, grey rim → its
    // shade, as the original's SpriteRenderer.color), the rim pulled towards ink so it reads on land
    // of the same colour, and lit a little from above.
    fragment float4 spriteFragment(SpriteOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        float4 p = t.sample(s, in.uv);
        if (p.a <= 0.01) discard_fragment();
        float lum = p.r / max(p.a, 0.001);
        float3 fill = in.tint.rgb * (1.06 - 0.16 * in.uv.y);
        float3 rim = mix(float3(0.14, 0.11, 0.08), in.tint.rgb, 0.3);
        float3 c = mix(rim, fill, smoothstep(0.45, 0.95, lum));
        return float4(c, p.a * in.tint.a);
    }
    fragment float4 textureFragment(QuadOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        return float4(t.sample(s, in.uv).rgb, 1.0);
    }
    """
}
