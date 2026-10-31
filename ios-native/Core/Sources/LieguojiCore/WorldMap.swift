import Foundation

/// Map data exported from the web source by src/native-export/world-export.test.ts (stage 2).
/// The binary layout is documented there; every value is little-endian.
public struct WorldMap: Sendable {
    public let width: Float
    public let height: Float
    /// Vertex index range of cell i is offsets[i] ..< offsets[i + 1].
    public let offsets: [UInt32]
    /// Flat x, y pairs in map units (0...width, 0...height).
    public let vertices: [Float]
    public let elevation: [Int16]
    public let biome: [UInt8]
    /// Province index of a land cell, −1 for sea.
    public let province: [Int32]
    /// Original per-cell biome colour, sRGB 0...255, three bytes per cell.
    public let biomeRGB: [UInt8]
    public let edges: [Edge]
    /// Voronoi site of each cell (OriginalGrid.points).
    public let sites: [Float]
    /// Sea colour texture (reference-paper appearance, distance from the smoothed coast), RGBA.
    public let seaWidth: Int
    public let seaHeight: Int
    public let seaRGBA: [UInt8]
    /// Smoothed coastline segments x1, y1, x2, y2.
    public let coast: [Float]
    /// River ribbons as triangles, x, y per vertex.
    public let rivers: [Float]
    public let meta: WorldMeta

    public struct Edge: Sendable, Equatable {
        public let a: Int32
        public let b: Int32
        public let x1: Float, y1: Float, x2: Float, y2: Float
    }

    public static let seaLevel: Int16 = 20
    public var cellCount: Int { elevation.count }
    public func isLand(_ cell: Int) -> Bool { elevation[cell] >= WorldMap.seaLevel }

    public enum LoadError: Error, Equatable { case truncated, badMagic, unsupportedVersion(UInt32), inconsistent(String) }

    public init(binary data: Data, meta: WorldMeta) throws {
        var reader = ByteReader(data)
        guard try reader.u32() == 0x574A_474C else { throw LoadError.badMagic }
        let version = try reader.u32()
        guard version == 2 else { throw LoadError.unsupportedVersion(version) }
        width = try reader.f32()
        height = try reader.f32()
        let cells = Int(try reader.u32()), vertexCount = Int(try reader.u32()), edgeCount = Int(try reader.u32())
        offsets = try reader.u32s(cells + 1)
        guard offsets.last.map({ Int($0) }) == vertexCount else { throw LoadError.inconsistent("offsets") }
        vertices = try reader.f32s(vertexCount * 2)
        elevation = try reader.i16s(cells)
        biome = try reader.bytes(cells)
        try reader.align4()
        province = try reader.i32s(cells)
        biomeRGB = try reader.bytes(cells * 3)
        try reader.align4()
        var list: [Edge] = []
        list.reserveCapacity(edgeCount)
        for _ in 0..<edgeCount {
            list.append(Edge(a: try reader.i32(), b: try reader.i32(), x1: try reader.f32(), y1: try reader.f32(), x2: try reader.f32(), y2: try reader.f32()))
        }
        edges = list
        sites = try reader.f32s(cells * 2)
        seaWidth = Int(try reader.u32()); seaHeight = Int(try reader.u32())
        seaRGBA = try reader.bytes(seaWidth * seaHeight * 4)
        coast = try reader.f32s(Int(try reader.u32()) * 4)
        rivers = try reader.f32s(Int(try reader.u32()) * 2)
        guard reader.remaining == 0 else { throw LoadError.inconsistent("trailing bytes") }
        guard province.allSatisfy({ $0 < Int32(meta.provinces.count) }) else { throw LoadError.inconsistent("province index") }
        self.meta = meta
    }

    /// Loads world.bin and world.json from a directory (the app bundle or the repository).
    public static func load(directory: URL) throws -> WorldMap {
        let meta = try JSONDecoder().decode(WorldMeta.self, from: Data(contentsOf: directory.appendingPathComponent("world.json")))
        return try WorldMap(binary: Data(contentsOf: directory.appendingPathComponent("world.bin")), meta: meta)
    }

    /// Owner nation index of a cell, nil for sea or an unowned province.
    public func nation(ofCell cell: Int) -> Int? {
        let p = Int(province[cell])
        guard p >= 0 else { return nil }
        let n = meta.provinces[p].nation
        return n >= 0 ? n : nil
    }
}

public struct WorldMeta: Codable, Sendable {
    public struct Province: Codable, Sendable { public let id: String; public let name: String; public let x: Float; public let y: Float; public var nation: Int; public let terrain: String }
    public struct Nation: Codable, Sendable {
        public let id: String; public let name: String; public let color: String
        /// State-line colour (ColorUtils.AdjustColor of the nation colour, fmsStateLineColor).
        public let line: String
        public let capital: Int; public let culture: String; public let polity: String; public let religion: String
    }
    /// LabelUtility name box of a nation, map units; font size between fontMin and fontMax.
    public struct LabelBox: Codable, Sendable, Equatable { public let nation: Int; public let x: Float; public let y: Float; public let width: Float; public let height: Float; public let fontMax: Float; public let fontMin: Float }
    public struct Event: Codable, Sendable { public let day: Int; public let text: String; public let reason: String }
    public struct Rect: Codable, Sendable { public let x: Float; public let y: Float; public let width: Float; public let height: Float }
    public struct City: Codable, Sendable { public let id: String; public let name: String; public let x: Float; public let y: Float; public let province: Int }
    public let format: String
    public let version: Int
    public let seed: String
    public let template: String
    public let grid: String
    public var provinces: [Province]
    public let nations: [Nation]
    public let cities: [City]
    public var labels: [LabelBox]
    /// The world's opening chronicle.
    public let events: [Event]
    /// Where the Swift simulation starts (day 0 of the web world).
    public let economy: EconomyStart?
    /// Month-end treasury and destiny start.
    public let monthly: [MonthlyStart]?
    /// Army motion start (travel.bin): scale, clock, each army's travel cell, point and speed.
    public let travel: TravelStart?
    /// Diplomacy start: geography, day-0 snapshot and calendar.
    public let diplomacy: DiplomacyStart?
    /// Army autonomy start.
    public let armyAi: ArmyAIStart?
    /// Where the parchment texture lies over the map (originalParchmentRect).
    public let parchment: Rect
    public let source: [String: String]?
}

struct ByteReader {
    private let data: Data
    private var offset = 0
    init(_ data: Data) { self.data = data }
    var remaining: Int { data.count - offset }
    private mutating func take(_ n: Int) throws -> Data {
        guard n >= 0, remaining >= n else { throw WorldMap.LoadError.truncated }
        let start = data.startIndex + offset
        offset += n
        return data.subdata(in: start..<(start + n))
    }
    mutating func align4() throws { let pad = (4 - offset % 4) % 4; _ = try take(pad) }
    mutating func u32() throws -> UInt32 { try u32s(1)[0] }
    mutating func i32() throws -> Int32 { Int32(bitPattern: try u32()) }
    mutating func f32() throws -> Float { Float(bitPattern: try u32()) }
    mutating func bytes(_ n: Int) throws -> [UInt8] { [UInt8](try take(n)) }
    mutating func u32s(_ n: Int) throws -> [UInt32] {
        let raw = try take(n * 4)
        return raw.withUnsafeBytes { p in (0..<n).map { UInt32(littleEndian: p.loadUnaligned(fromByteOffset: $0 * 4, as: UInt32.self)) } }
    }
    mutating func i32s(_ n: Int) throws -> [Int32] { try u32s(n).map { Int32(bitPattern: $0) } }
    mutating func f32s(_ n: Int) throws -> [Float] { try u32s(n).map { Float(bitPattern: $0) } }
    mutating func i16s(_ n: Int) throws -> [Int16] {
        let raw = try take(n * 2)
        return raw.withUnsafeBytes { p in (0..<n).map { Int16(bitPattern: UInt16(littleEndian: p.loadUnaligned(fromByteOffset: $0 * 2, as: UInt16.self))) } }
    }
}
