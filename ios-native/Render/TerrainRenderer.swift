import MetalKit
import LieguojiCore

struct TerrainFile: Decodable, Sendable {
    struct Cell: Decodable, Sendable { let points: [Double]; let height: Int }
    let width: Double; let height: Double; let cells: [Cell]
}
struct TerrainVertex { var position: SIMD2<Float>; var color: SIMD4<Float> }
struct PreparedTile: Sendable { let vertices: [TerrainVertex]; let bounds: SIMD4<Double> }
extension TerrainVertex: Sendable {}
struct GPUTile { let buffer: MTLBuffer; let count: Int; let bounds: SIMD4<Double> }
actor TerrainLoader {
    func load() throws -> [PreparedTile] {
        guard let url = Bundle.main.url(forResource: "terrain", withExtension: "json") else { throw CocoaError(.fileNoSuchFile) }
        let data = try JSONDecoder().decode(TerrainFile.self, from: Data(contentsOf: url))
        var groups: [Int: [TerrainVertex]] = [:]
        var bounds: [Int: SIMD4<Double>] = [:]
        for cell in data.cells where cell.points.count >= 6 {
            let points = stride(from: 0, to: cell.points.count, by: 2).map { SIMD2<Float>(Float(cell.points[$0]), Float(cell.points[$0+1])) }
            let center = points.reduce(SIMD2<Float>.zero, +) / Float(points.count)
            let key = Int(center.y / 128) * 13 + Int(center.x / 128)
            let d = Double(min(100,max(20,cell.height))) - 20
            let low = [0.9679999947547913,1.0,0.9129999876022339]
            let slope = [0.0008000001544132829,-0.007850000634789467,-0.010075000114738941]
            let high = [1.0,0.6859999895095825,0.5099999904632568]
            let highSlope = [-0.38600003719329834,-0.9559999704360962,-1.0199999809265137]
            let rgb = (0..<3).map { i -> Float in
                let c = d <= 40 ? low[i]+slope[i]*d : high[i]+highSlope[i]*(d*0.012500000186264515-0.5)
                let linear = c*(c*(0.30530601739883423*c+0.682171106338501)+0.012522878125309944)
                return Float(linear <= 0.0031308 ? 12.92*linear : 1.055*pow(linear,1/2.4)-0.055)
            }
            let color = SIMD4<Float>(rgb[0],rgb[1],rgb[2],1)
            var vertices = groups[key] ?? []
            for i in 1..<(points.count-1) {
                for point in [points[0],points[i],points[i+1]] { vertices.append(TerrainVertex(position: point,color: color)) }
            }
            groups[key] = vertices
            var box = bounds[key] ?? SIMD4(Double.infinity,Double.infinity,-Double.infinity,-Double.infinity)
            for point in points { box.x = min(box.x,Double(point.x)); box.y = min(box.y,Double(point.y)); box.z = max(box.z,Double(point.x)); box.w = max(box.w,Double(point.y)) }
            bounds[key] = box
        }
        return groups.keys.sorted().map { PreparedTile(vertices: groups[$0]!,bounds: bounds[$0]!) }
    }
}
final class TerrainRenderer {
    private var tiles: [GPUTile] = []
    private let pipeline: MTLRenderPipelineState
    private let device: MTLDevice
    private let parchment: MTLTexture
    private var sea: MTLBuffer?
    private let inFlight = DispatchSemaphore(value: 3)
    var camera = MapCamera(scale: 0.6)
    var velocity = CGPoint.zero
    var visibleTiles = 0
    init(device: MTLDevice, format: MTLPixelFormat) throws {
        self.device = device
        guard let paperURL = Bundle.main.url(forResource: "parchment",withExtension: "jpg") else { throw CocoaError(.fileNoSuchFile) }
        parchment = try MTKTextureLoader(device: device).newTexture(URL: paperURL,options: [.SRGB: false])
        let seaColor = SIMD4<Float>(82.0/255,124.0/255,134.0/255,1)
        let vertices = [SIMD2<Float>(0,0),SIMD2<Float>(1600,0),SIMD2<Float>(1600,900),SIMD2<Float>(0,0),SIMD2<Float>(1600,900),SIMD2<Float>(0,900)].map { TerrainVertex(position: $0,color: seaColor) }
        sea = vertices.withUnsafeBytes { device.makeBuffer(bytes: $0.baseAddress!,length: $0.count,options: .storageModeShared) }
        let library = try device.makeLibrary(source: Self.shader, options: nil)
        let descriptor = MTLRenderPipelineDescriptor()
        descriptor.vertexFunction = library.makeFunction(name: "terrainVertex")
        descriptor.fragmentFunction = library.makeFunction(name: "terrainFragment")
        descriptor.colorAttachments[0].pixelFormat = format
        pipeline = try device.makeRenderPipelineState(descriptor: descriptor)
    }
    func install(_ prepared: [PreparedTile]) {
        tiles = prepared.compactMap { tile in
            let buffer = tile.vertices.withUnsafeBytes { device.makeBuffer(bytes: $0.baseAddress!, length: $0.count, options: .storageModeShared) }
            return buffer.map { GPUTile(buffer: $0,count: tile.vertices.count,bounds: tile.bounds) }
        }
    }
    func coast(seconds: Double) {
        guard seconds > 0 && seconds < 0.1 else { return }
        camera.pan(dx: velocity.x * seconds, dy: velocity.y * seconds)
        let decay = exp(-6 * seconds); velocity.x *= decay; velocity.y *= decay
    }
    func draw(view: MTKView, queue: MTLCommandQueue) {
        guard inFlight.wait(timeout: .now()) == .success else { return }
        guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable, let command = queue.makeCommandBuffer(), let encoder = command.makeRenderCommandEncoder(descriptor: pass) else { inFlight.signal(); return }
        encoder.setRenderPipelineState(pipeline)
        var uniforms = SIMD4<Float>(Float(camera.x),Float(camera.y),Float(view.bounds.width / (2*camera.scale)),Float(view.bounds.height / (2*camera.scale)))
        encoder.setVertexBytes(&uniforms,length: MemoryLayout<SIMD4<Float>>.stride,index: 1)
        encoder.setFragmentTexture(parchment,index: 0)
        if let sea { encoder.setVertexBuffer(sea,offset: 0,index: 0); encoder.drawPrimitives(type: .triangle,vertexStart: 0,vertexCount: 6) }
        visibleTiles = 0
        for tile in tiles where camera.intersects(minX: tile.bounds.x,minY: tile.bounds.y,maxX: tile.bounds.z,maxY: tile.bounds.w,width: view.bounds.width,height: view.bounds.height) {
            encoder.setVertexBuffer(tile.buffer,offset: 0,index: 0)
            encoder.drawPrimitives(type: .triangle,vertexStart: 0,vertexCount: tile.count); visibleTiles += 1
        }
        encoder.endEncoding()
        let semaphore = inFlight
        command.addCompletedHandler { _ in semaphore.signal() }
        command.present(drawable); command.commit()
    }
    private static let shader = """
    #include <metal_stdlib>
    using namespace metal;
    struct Vertex { float2 position; float4 color; };
    struct Output { float4 position [[position]]; float4 color; float2 world; };
    vertex Output terrainVertex(uint id [[vertex_id]], const device Vertex* vertices [[buffer(0)]], constant float4& camera [[buffer(1)]]) {
        Output out; float2 p = (vertices[id].position-camera.xy)/camera.zw;
        out.position = float4(p.x,-p.y,0,1); out.color = vertices[id].color; out.world = vertices[id].position; return out;
    }
    fragment float4 terrainFragment(Output in [[stage_in]], texture2d<float> paper [[texture(0)]]) {
        constexpr sampler filtering(coord::normalized,address::clamp_to_edge,filter::linear);
        float2 uv = (in.world-float2(800,450))/float2(249.3/0.15,137.2/0.15)+0.5;
        return float4(in.color.rgb*paper.sample(filtering,uv).rgb,1);
    }
    """
}
