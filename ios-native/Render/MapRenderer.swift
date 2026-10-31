import UIKit
import MetalKit
import LieguojiCore

/// Draws the world with Metal: filled Voronoi cells, then province / nation / coast borders widened to a
/// constant on-screen width. Geometry is uploaded once; colours only when the view mode or selection
/// changes. The view redraws on demand (camera change, animation), not continuously.
final class MapRenderer: NSObject, MTKViewDelegate {
    private let device: MTLDevice
    private let queue: MTLCommandQueue
    private let cellPipeline: MTLRenderPipelineState
    private let linePipeline: MTLRenderPipelineState
    private let positions: MTLBuffer
    private let indices: MTLBuffer
    private let indexCount: Int
    private var colors: MTLBuffer
    private var borders: [BorderMesh.Kind: (buffer: MTLBuffer, count: Int)] = [:]
    let map: WorldMap
    private let nationColors: [RGB]
    var camera: MapCamera
    var onDraw: ((CFTimeInterval) -> Void)?
    private(set) var mode: MapMode = .political
    private(set) var highlight: Int?

    struct Uniforms { var viewport: SIMD2<Float>; var center: SIMD2<Float>; var scale: Float; var halfWidth: Float }

    init?(view: MTKView, map: WorldMap) {
        guard let device = view.device, let queue = device.makeCommandQueue() else { return nil }
        self.device = device; self.queue = queue; self.map = map
        nationColors = map.meta.nations.map { RGB(css: $0.color) ?? RGB(0.6, 0.6, 0.6) }
        camera = MapCamera.fit(map: (Double(map.width), Double(map.height)), viewport: (390, 844))
        view.sampleCount = 4
        // Colours are already sRGB (as the web renders them): store them unconverted.
        view.colorPixelFormat = .bgra8Unorm
        do {
            let library = try device.makeLibrary(source: MapRenderer.shaders, options: nil)
            func pipeline(_ vertex: String, _ fragment: String, blend: Bool) throws -> MTLRenderPipelineState {
                let d = MTLRenderPipelineDescriptor()
                d.vertexFunction = library.makeFunction(name: vertex)
                d.fragmentFunction = library.makeFunction(name: fragment)
                d.colorAttachments[0].pixelFormat = view.colorPixelFormat
                d.rasterSampleCount = view.sampleCount
                if blend {
                    let a: MTLRenderPipelineColorAttachmentDescriptor = d.colorAttachments[0]
                    a.isBlendingEnabled = true
                    a.sourceRGBBlendFactor = .sourceAlpha; a.destinationRGBBlendFactor = .oneMinusSourceAlpha
                    a.sourceAlphaBlendFactor = .one; a.destinationAlphaBlendFactor = .oneMinusSourceAlpha
                }
                return try device.makeRenderPipelineState(descriptor: d)
            }
            cellPipeline = try pipeline("cellVertex", "cellFragment", blend: false)
            linePipeline = try pipeline("lineVertex", "lineFragment", blend: true)
        } catch { return nil }
        let mesh = CellMesh(map: map)
        guard let p = device.makeBuffer(bytes: mesh.positions, length: mesh.positions.count * 4, options: .storageModeShared),
              let i = device.makeBuffer(bytes: mesh.indices, length: mesh.indices.count * 4, options: .storageModeShared) else { return nil }
        positions = p; indices = i; indexCount = mesh.indices.count
        let c = CellMesh.colors(map: map, mode: .political, nationColors: nationColors)
        guard let cb = device.makeBuffer(bytes: c, length: c.count * 4, options: .storageModeShared) else { return nil }
        colors = cb
        super.init()
        let lines = BorderMesh(map: map)
        for (kind, data) in lines.vertices where !data.isEmpty {
            if let b = device.makeBuffer(bytes: data, length: data.count * 4, options: .storageModeShared) { borders[kind] = (b, data.count / 4) }
        }
    }

    /// Recolours the cells (view mode or selected province highlight).
    func setAppearance(mode: MapMode, highlight: Int?) {
        guard mode != self.mode || highlight != self.highlight else { return }
        self.mode = mode; self.highlight = highlight
        let c = CellMesh.colors(map: map, mode: mode, nationColors: nationColors, highlightProvince: highlight)
        if let b = device.makeBuffer(bytes: c, length: c.count * 4, options: .storageModeShared) { colors = b }
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
              let buffer = queue.makeCommandBuffer(), let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        let size = view.bounds.size
        var u = Uniforms(viewport: SIMD2(Float(size.width), Float(size.height)), center: SIMD2(Float(camera.centerX), Float(camera.centerY)), scale: Float(camera.scale), halfWidth: 0)
        encoder.setRenderPipelineState(cellPipeline)
        encoder.setVertexBuffer(positions, offset: 0, index: 0)
        encoder.setVertexBuffer(colors, offset: 0, index: 1)
        encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
        encoder.drawIndexedPrimitives(type: .triangle, indexCount: indexCount, indexType: .uint32, indexBuffer: indices, indexBufferOffset: 0)
        encoder.setRenderPipelineState(linePipeline)
        // Province lines thin and faint, nation borders and coast stronger; widths in points.
        let zoomIn = Float(min(1, max(0, (camera.scale - 1.2) / 3)))
        let styles: [(BorderMesh.Kind, Float, SIMD4<Float>)] = [
            (.province, 0.35, SIMD4(0.12, 0.12, 0.12, 0.25 + 0.35 * zoomIn)),
            (.coast, 0.6, SIMD4(0.37, 0.37, 0.37, 0.9)),
            (.nation, 1.1, SIMD4(0.08, 0.08, 0.10, 0.85)),
        ]
        for (kind, width, color) in styles {
            guard let line = borders[kind] else { continue }
            u.halfWidth = width
            var c = color
            encoder.setVertexBuffer(line.buffer, offset: 0, index: 0)
            encoder.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
            encoder.setFragmentBytes(&c, length: MemoryLayout<SIMD4<Float>>.stride, index: 0)
            encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: line.count)
        }
        encoder.endEncoding()
        buffer.present(drawable)
        buffer.commit()
        onDraw?(CACurrentMediaTime())
    }

    static let shaders = """
    #include <metal_stdlib>
    using namespace metal;
    struct Uniforms { float2 viewport; float2 center; float scale; float halfWidth; };
    struct CellOut { float4 position [[position]]; float4 color; };
    static float4 clip(float2 world, constant Uniforms& u, float2 offset) {
        float2 s = (world - u.center) * u.scale + u.viewport * 0.5 + offset;
        return float4(s.x / u.viewport.x * 2.0 - 1.0, 1.0 - s.y / u.viewport.y * 2.0, 0.0, 1.0);
    }
    vertex CellOut cellVertex(uint id [[vertex_id]], const device float2* positions [[buffer(0)]],
                              const device float4* colors [[buffer(1)]], constant Uniforms& u [[buffer(2)]]) {
        CellOut o; o.position = clip(positions[id], u, float2(0.0)); o.color = colors[id]; return o;
    }
    fragment float4 cellFragment(CellOut in [[stage_in]]) { return in.color; }
    struct LineOut { float4 position [[position]]; };
    vertex LineOut lineVertex(uint id [[vertex_id]], const device float4* v [[buffer(0)]], constant Uniforms& u [[buffer(2)]]) {
        LineOut o; float4 p = v[id]; o.position = clip(p.xy, u, p.zw * u.halfWidth); return o;
    }
    fragment float4 lineFragment(LineOut in [[stage_in]], constant float4& color [[buffer(0)]]) { return color; }
    """
}
