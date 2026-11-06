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
    private var seaLaneKey: [SIMD2<Float>] = []
    /// Warm-authored sea bytes. Recoloured into `sea` for the selected preset.
    private var seaSource: [UInt8] = []
    /// 卷轴边缘: the map's paper edge darkens like an old scroll and a double ink rule frames it.
    private var frame: (buffer: MTLBuffer, count: Int)?
    private let sea: MTLTexture?
    private let parchment: MTLTexture?
    private let sampler: MTLSamplerState?
    private(set) var map: WorldMap
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
        let lines = BorderMesh(map: map)
        if let data = lines.vertices[.province], !data.isEmpty { provinceLines = buffer(data, stride: 4) }
        if !map.rivers.isEmpty { rivers = buffer(map.rivers, stride: 2) }
        relief = buffer(MapLayers.relief(map).vertices, stride: 6)
        outlines = buffer(MapLayers.outlines(map).vertices, stride: 6)
        icons = buffer(MapLayers.cityIcons(map).vertices, stride: 6)
        frame = buffer(MapLayers.scrollFrame(width: map.width, height: map.height).vertices, stride: 6)
        uploadSea()
        // Original Army sprites (map.ts): one unit icon per army, tinted with its state colour, 2.56 × 0.84
        // × ArmyIconScale 0.35 world units (elite × 1.5), never smaller than 7 points on screen.
        // The figures (UnitArt), one texture per role, plus the commander's banner.
        let loader = MTKTextureLoader(device: device)
        for role in ["infantry", "spear", "shield", "archer", "crossbow", "cavalry", "heavy", "horseArcher", "elite", "elephant", "Banner", "Pip", "Fleet", "Port"] {
            let probe = ["Banner", "Pip", "Fleet", "Port"].contains(role) ? role : (UnitKinds.kinds.first { $0.role.rawValue == role }?.key ?? "Infantry")
            guard let image = UnitArt.image(probe) else { continue }
            if let texture = try? loader.newTexture(cgImage: image, options: [.SRGB: false, .generateMipmaps: true]) { unitTextures[role] = texture }
            else if let texture = Self.texture(device, image) { unitTextures[role] = texture }
        }
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
        let lines = BorderMesh(map: next)
        provinceLines = lines.vertices[.province].flatMap { $0.isEmpty ? nil : buffer($0, stride: 4) }
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
        map = next; base = nil
        nationColors = next.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        icons = buffer(MapLayers.cityIcons(next).vertices, stride: 6)
        recolor()
        outlineGeneration += 1
        let generation = outlineGeneration
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let vertices = MapLayers.outlines(next).vertices
            DispatchQueue.main.async {
                guard let self, generation == self.outlineGeneration else { return }
                self.outlines = self.buffer(vertices, stride: 6)
                self.onOutlines?()
            }
        }
    }
    private var outlineGeneration = 0
    /// Called on the main queue when new outlines are ready to draw.
    var onOutlines: (() -> Void)?

    /// The title screen's generation animation: 0 shows only the sea; land rises from the coast to the
    /// mountains, then the states' colours wash over it; at 1 every layer is drawn.
    private(set) var reveal: Float = 1
    func setReveal(_ t: Float) { reveal = max(0, min(1, t)); recolor() }
    /// The map's colours before the generation reveal: the land colours of the current mode and the
    /// terrain colours, both shaded. Kept while only the reveal moves, so the rising animation does not
    /// recompute every cell's palette 60 times a second.
    private var base: (land: [Float], terrain: [Float])?

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
        var c = base.land
        if reveal < 1 {
            // The land fades up together, with state colours following. Borders and cities are drawn later.
            let terrain = base.terrain
            let sea = MapPalette.ocean(display.ocean).shallow
            // A soft rise of the whole land (网页适配). A hard coast-to-peak sweep read as water being poured in.
            let fade = reveal * reveal * (3 - 2 * reveal), wash = min(1, max(0, (reveal - 0.42) / 0.38))
            let top = Float(max(21, map.elevation.max().map(Int.init) ?? 100))
            for cell in 0..<map.cellCount where map.isLand(cell) {
                let h = (Float(map.elevation[cell]) - 20) / (top - 20)
                let shown = min(1, max(0, (fade + (1 - h) * 0.08 - 0.04) / 0.9))
                for v in Int(map.offsets[cell])..<Int(map.offsets[cell + 1]) {
                    for k in 0..<3 {
                        let ground = terrain[v * 4 + k] + (c[v * 4 + k] - terrain[v * 4 + k]) * wash
                        let water = k == 0 ? sea.r : k == 1 ? sea.g : sea.b
                        c[v * 4 + k] = water + (ground - water) * shown
                    }
                }
            }
        }
        if let b = device.makeBuffer(bytes: c, length: c.count * 4, options: .storageModeShared) { colors = b }
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
    struct ArmySprite: Equatable { var army: Int; var x: Float; var y: Float; var unit: String; var nation: Int; var selected: Bool; var key = ""; var tier = 1; var banner = 0; var reorganizing = false }
    private var unitTextures: [String: MTLTexture] = [:]
    private var route: (buffer: MTLBuffer, count: Int)?
    private var armySprites: [ArmySprite] = []
    private var routePoints: [SIMD2<Float>] = []

    /// Army icons at their current points (moving armies follow their journey) and the selected
    /// army's remaining route.
    /// Icons walk: each drawn point chases its army's engine point every frame (exponential approach
    /// whose time constant follows the play step), so a new target never makes an icon jump — not on
    /// a long step, not when two armies meet, not when a battle ends. Only a jump across the map
    /// (an army re-formed at home) appears at once.
    private var shown: [String: SIMD2<Float>] = [:]
    /// Each icon walks at an even pace from where it is drawn to its new point over one play step
    /// (an easing chase sped up and slowed down every step, which read as stop-and-go).
    private var legs: [String: (from: SIMD2<Float>, to: SIMD2<Float>, start: CFTimeInterval)] = [:]
    /// When each icon appeared (new armies and re-formed ones fade in instead of popping up).
    private var born: [String: CFTimeInterval] = [:]
    private var lastChase: CFTimeInterval = CACurrentMediaTime()
    private var chasing = false
    /// The play step interval (seconds); a leg lasts a little longer so the next one starts before it ends.
    var tweenDuration: CFTimeInterval = 0.3
    var tweenEase = true
    var isAnimating: Bool { chasing }
    static let fadeIn: CFTimeInterval = 0.7
    private func displayed(_ s: ArmySprite, _ t: Float = 0) -> SIMD2<Float> {
        guard !s.key.isEmpty, let p = shown[s.key] else { return SIMD2(s.x, s.y) }
        return p
    }
    private func alpha(_ s: ArmySprite, _ now: CFTimeInterval) -> Float {
        guard let b = born[s.key] else { return 1 }
        return Float(min(1, max(0, (now - b) / Self.fadeIn)))
    }
    /// Moves every drawn point along its leg for the current time.
    private func advanceChase() {
        let now = CACurrentMediaTime()
        lastChase = now
        guard chasing else { return }
        let length = max(0.12, tweenDuration * 1.08)
        var moving = false
        for a in armySprites where !a.key.isEmpty {
            guard let leg = legs[a.key] else { continue }
            let t = Float(min(1, (now - leg.start) / length))
            shown[a.key] = leg.from + (leg.to - leg.from) * t
            if t < 1 { moving = true } else { legs[a.key] = nil }
        }
        for (k, b) in born where now - b >= Self.fadeIn { born[k] = nil }
        chasing = moving || !born.isEmpty
        rebuildArmies()
    }

    /// Where every icon is drawn right now (mid-walk included), for taps and troop labels.
    /// Armies that re-formed far away since the last call (key and where they fell), for the effects.
    private(set) var jumped: [(key: String, x: Float, y: Float)] = []
    func takeJumped() -> [(key: String, x: Float, y: Float)] { defer { jumped = [] }; return jumped }
    func placedSprites() -> [(sprite: ArmySprite, x: Float, y: Float)] {
        armySprites.map { s in let p = displayed(s); return (s, p.x, p.y) }
    }

    func setArmies(_ sprites: [ArmySprite], route points: [SIMD2<Float>]) {
        if sprites != armySprites {
            let keys = Set(sprites.map(\.key)), now = CACurrentMediaTime()
            shown = shown.filter { keys.contains($0.key) }; legs = legs.filter { keys.contains($0.key) }; born = born.filter { keys.contains($0.key) }
            let previous = Dictionary(armySprites.map { ($0.key, $0.reorganizing) }, uniquingKeysWith: { a, _ in a })
            for s in sprites where !s.key.isEmpty {
                let target = SIMD2(s.x, s.y)
                guard let p = shown[s.key] else {
                    // A new army fades in where it stands (no walk from nowhere).
                    shown[s.key] = target; if !armySprites.isEmpty { born[s.key] = now }; continue
                }
                let d = target - p
                if s.reorganizing && previous[s.key] != true {
                    // Far more than a march step: an army re-formed at home (the fall plays where it was).
                    shown[s.key] = target; legs[s.key] = nil; born[s.key] = now; jumped.append((s.key, p.x, p.y))
                } else if d.x * d.x + d.y * d.y > 0.0004 { legs[s.key] = (p, target, now) }
            }
            armySprites = sprites
            chasing = true
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
            let sprites = armySprites
            let iconSize = Float(2.56 * 0.84 * 0.35 * (1600.0 / 240.0))
            var byRole: [String: [Float]] = [:]
            var fade: Float = 1
            func quad(_ role: String, _ at: SIMD2<Float>, _ c: RGB, _ size: Float, _ sx: Float, _ sy: Float) {
                for (cx, cy) in [(Float(-0.5), Float(-0.5)), (0.5, -0.5), (-0.5, 0.5), (-0.5, 0.5), (0.5, -0.5), (0.5, 0.5)] {
                    byRole[role, default: []].append(contentsOf: [at.x, at.y, cx, cy, c.r, c.g, c.b, fade, size, at.x, at.y, sx, sy])
                }
            }
            let now = CACurrentMediaTime()
            for a in sprites {
                fade = alpha(a, now)
                let c = a.selected ? RGB(1, 0.93, 0.55) : nationColors.indices.contains(a.nation) ? nationColors[a.nation] : RGB(1, 1, 1)
                let role = UnitArt.role(a.unit), at = displayed(a)
                let size = iconSize * (a.unit == "Port" ? 0.7 : 1) * (a.selected ? 1.3 : 1)
                // The banner stands behind the figures: the state's colour, gold for the ruler himself.
                if a.banner > 0 { quad("Shield", at, a.banner == 2 ? RGB(0.93, 0.74, 0.25) : RGB(0.70, 0.20, 0.14), size * 0.34, 0.95, -0.85) }
                // One clear mark for the arm, and one to three pips beneath for its strength.
                quad(role, at, c, size, 0, 0)
                if a.army > -100_000 && role != "Fleet" {
                    let n = max(1, min(3, a.tier)), pip = size * 0.26
                    for i in 0..<n {
                        let sx = (Float(i) - Float(n - 1) / 2) * 1.15
                        quad("Pip", at, RGB(0.985, 0.965, 0.91), pip, sx, 0.66 * size / pip)
                    }
                }
            }
            // A fixed draw order (banners first, then by role): a fresh dictionary's order changed every
            // rebuild, so overlapping icons swapped in front of each other and flickered.
            units = byRole.keys.sorted { ($0 == "Banner" ? "" : $0) < ($1 == "Banner" ? "" : $1) }.compactMap { role -> (texture: MTLTexture, buffer: MTLBuffer, count: Int)? in
                guard let data = byRole[role], let texture = unitTextures[role], let b = device.makeBuffer(bytes: data, length: data.count * 4, options: .storageModeShared) else { return nil }
                return (texture: texture, buffer: b, count: data.count / 13)
            }
        }
    }

    private func buffer(_ data: [Float], stride: Int) -> (MTLBuffer, Int)? {
        guard !data.isEmpty, let b = device.makeBuffer(bytes: data, length: data.count * 4, options: .storageModeShared) else { return nil }
        return (b, data.count / stride)
    }

    /// Recolours the land (view mode or selected province highlight).
    func setAppearance(mode: MapMode, highlight: Int?, tint: [Int: RGB] = [:], fills: [RGB]? = nil) {
        guard mode != self.mode || highlight != self.highlight || tint != self.tint || fills != self.fills else { return }
        self.mode = mode; self.highlight = highlight; self.tint = tint; self.fills = fills
        base = nil
        recolor()
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
              let buffer = queue.makeCommandBuffer(), let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        advanceChase()
        var spriteProgress: Float = 1
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
        encoder.setRenderPipelineState(cellPipeline)
        encoder.setVertexBuffer(positions, offset: 0, index: 0)
        encoder.setVertexBuffer(colors, offset: 0, index: 1)
        encoder.setVertexBytes(&u, length: uniformLength, index: 2)
        if indexCount > 0 { encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0) }
        // Province lines: 0.55 screen px once zoomed in. Colour is the measured #B2B2B2.
        // The screen width is the previous client choice; it is not a measured original width.
        if let lines = provinceLines, display.provinceLines, camera.scale > 0.9 || reveal < 1, reveal >= 0.55 {
            u.halfWidth = 0.55 / 2
            var color = SIMD4<Float>(MapPalette.provinceBorder.r, MapPalette.provinceBorder.g, MapPalette.provinceBorder.b, 1)
            encoder.setRenderPipelineState(linePipeline)
            encoder.setVertexBuffer(lines.buffer, offset: 0, index: 0)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentBytes(&color, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: lines.count)
        }
        if let rivers, reveal > 0.38 {
            var color = SIMD4<Float>(MapLayers.river.r, MapLayers.river.g, MapLayers.river.b, 1)
            encoder.setRenderPipelineState(flatPipeline)
            encoder.setVertexBuffer(rivers.buffer, offset: 0, index: 0)
            encoder.setVertexBytes(&u, length: uniformLength, index: 2)
            encoder.setFragmentBytes(&color, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: rivers.count)
        }
        if display.seaRoutes && reveal >= 0.7 { colored(seaLanes) }
        if display.vegetation && reveal >= 0.45 { colored(relief) }
        if display.borders && reveal >= 0.75 { colored(outlines) }
        if display.cityIcons && reveal >= 0.85 { colored(icons) }
        if reveal >= 1 {
        colored(route)
        encoder.setVertexBytes(&spriteProgress, length: MemoryLayout<Float>.stride, index: 4)
        for unit in units {
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
    struct SpriteVertex { packed_float2 center; packed_float2 corner; packed_float4 tint; float size; packed_float2 target; packed_float2 shift; };
    struct SpriteOut { float4 position [[position]]; float2 uv; float4 tint; };
    vertex SpriteOut spriteVertex(uint id [[vertex_id]], const device SpriteVertex* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]], constant float& progress [[buffer(4)]]) {
        SpriteVertex s = v[id];
        // Marks at least 22 points tall (an army mark is 5 map units), so whose army it is reads at
        // every zoom; banner and pips keep their proportions. The shift (in the quad's own size)
        // places the banner and the pips around the army's point.
        float pixels = s.size * max(u.scale, 22.0 / 5.02);
        SpriteOut o; o.position = clip(mix(float2(s.center), float2(s.target), progress), u, (float2(s.corner) + float2(s.shift)) * pixels); o.uv = float2(s.corner) + 0.5; o.tint = float4(s.tint); return o;
    }
    // A figure: the state's colour, lit from above, with an ink outline (the silhouette dilated by
    // about a point on screen) so it stands out on any land colour.
    fragment float4 spriteFragment(SpriteOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        float a = t.sample(s, in.uv).a;
        float2 w = fwidth(in.uv) * 1.3;
        float n = a;
        n = max(n, t.sample(s, in.uv + float2(w.x, 0)).a); n = max(n, t.sample(s, in.uv - float2(w.x, 0)).a);
        n = max(n, t.sample(s, in.uv + float2(0, w.y)).a); n = max(n, t.sample(s, in.uv - float2(0, w.y)).a);
        n = max(n, t.sample(s, in.uv + w * 0.7).a); n = max(n, t.sample(s, in.uv - w * 0.7).a);
        n = max(n, t.sample(s, in.uv + float2(w.x, -w.y) * 0.7).a); n = max(n, t.sample(s, in.uv + float2(-w.x, w.y) * 0.7).a);
        if (n <= 0.01) discard_fragment();
        float3 fill = in.tint.rgb * (1.08 - 0.22 * in.uv.y);
        float3 c = mix(float3(0.13, 0.1, 0.07), fill, smoothstep(0.35, 0.85, a));
        return float4(c, n * in.tint.a);
    }
    fragment float4 textureFragment(QuadOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
        return float4(t.sample(s, in.uv).rgb, 1.0);
    }
    """
}
