import Foundation

/// A drawable world built on the device from the ported generators, in a second or two: the same
/// heights, climate, provinces and capitals the web engine will create for this seed, laid onto the
/// original 20k grid geometry of a bundled map. It is shown while the engine builds the full world
/// (people, armies, history) and then replaced by that world.
public enum PreviewWorld {
    public struct Inputs: Sendable {
        public let base: WorldMap, grid: TerrainGraph, document: TerrainDocument
        public init(base: WorldMap, grid: TerrainGraph, document: TerrainDocument) { self.base = base; self.grid = grid; self.document = document }
    }
    /// settlement25-palette (the recovered c12 colours, then the web's additional shades).
    public static let palette = ["#80b1d3", "#fb8072", "#b3de69", "#bc80bd", "#ffed6f", "#8dd3c7", "#fdb462", "#eb8de7", "#a4c5ed", "#cfaf76", "#a8df9f", "#f0adc4",
                                 "#8ba7a1", "#df9875", "#c4bef0", "#d6d28e", "#a1ccd8", "#d98bb0", "#83c89d", "#bb935e", "#abc079", "#c99282", "#95a3dc", "#b2d1b7"]
    /// terrain13 FMS_BIOMES colours.
    static let biomeColors: [UInt32] = [0x466eab, 0xfbe79f, 0xb5b887, 0xd2d082, 0xc8d68f, 0xb6d95d, 0x29bc56, 0x7dcb35, 0x409c43, 0x4b6b32, 0x96784b, 0xd5e7eb, 0x0b9131]

    public static func build(_ input: Inputs, seed: String, template: String, nations: Int, cities: Int) -> WorldMap {
        var m = input.base
        let heights = TerrainGenerator.generate(graph: input.grid, seed: seed, template: template)
        let elevations = heights.map(Int.init)
        let surface = Climate.surface(input.document, elevations: elevations)
        let n = min(m.cellCount, heights.count)
        m.elevation = (0..<m.cellCount).map { $0 < n ? Int16(heights[$0]) : 0 }
        m.biome = (0..<m.cellCount).map { $0 < n ? surface.ids[$0] : 0 }
        var rgb = [UInt8](repeating: 0, count: m.cellCount * 3)
        for c in 0..<n { let v = biomeColors[Int(min(12, surface.ids[c]))]; rgb[c * 3] = UInt8(v >> 16 & 255); rgb[c * 3 + 1] = UInt8(v >> 8 & 255); rgb[c * 3 + 2] = UInt8(v & 255) }
        m.biomeRGB = rgb
        m.coast = []; m.rivers = []
        // Provinces: each land cell joins the province of a clipped face it belongs to.
        var province = [Int32](repeating: -1, count: m.cellCount)
        var provinces = [WorldMeta.Province](), owners = [Int](), seeds = [Int]()
        if let part = Regions.partition(input.document, elevations: elevations, cities: cities, surface: surface) {
            for (r, region) in part.regions.enumerated() { for f in region.members { for s in part.faces[f].source where s < n && heights[s] >= 20 && province[s] < 0 { province[s] = Int32(r) } } }
            let count = min(nations, part.regions.count)
            let layout = Opening.layout(part.regions, count: count)
            owners = layout.owners; seeds = layout.seeds
            provinces = part.regions.enumerated().map { i, r in
                WorldMeta.Province(id: "p-\(i)", name: "", x: Float(r.center.0), y: Float(r.center.1), nation: owners[i], terrain: r.height > 65 ? "mountain" : r.height > 45 ? "forest" : "plain")
            }
        }
        for c in 0..<n where heights[c] >= 20 && province[c] < 0 { province[c] = provinces.isEmpty ? -1 : 0 }
        m.province = province
        m.meta.provinces = provinces
        m.meta.nations = seeds.indices.map { i in
            WorldMeta.Nation(id: "n-\(i)", name: "", color: palette[i % palette.count], line: "#1487ff", capital: i, culture: "", polity: "", religion: "")
        }
        m.meta.cities = seeds.enumerated().map { i, s in WorldMeta.City(id: "c-\(s)", name: "", x: provinces[s].x, y: provinces[s].y, province: s) }
        m.meta.labels = []
        m.seaRGBA = sea(m)
        return m
    }

    /// A sea texture shaded by depth (deep 0x527c86 → shallow 0x8eafb1), sampled from the cell under each texel.
    static func sea(_ m: WorldMap) -> [UInt8] {
        let picker = CellPicker(map: m), w = m.seaWidth, h = m.seaHeight
        var out = [UInt8](repeating: 255, count: w * h * 4)
        let deep = MapPalette.deepSea, shallow = MapPalette.shallowSea
        for y in 0..<h { for x in 0..<w {
            let px = (Float(x) + 0.5) * m.width / Float(w), py = (Float(y) + 0.5) * m.height / Float(h)
            let e = picker.cell(atX: px, y: py).map { Float(min(20, max(0, Int(m.elevation[$0])))) / 20 } ?? 0
            let t = e * e, o = (y * w + x) * 4
            out[o] = UInt8((deep.r + (shallow.r - deep.r) * t) * 255); out[o + 1] = UInt8((deep.g + (shallow.g - deep.g) * t) * 255); out[o + 2] = UInt8((deep.b + (shallow.b - deep.b) * t) * 255)
        } }
        return out
    }
}
