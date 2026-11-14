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
        build(input, heights: TerrainGenerator.generate(graph: input.grid, seed: seed, template: template), nations: nations, cities: cities)
    }

    /// Terrain only (自绘地图 while drawing): heights, the climate's biomes and the depth-shaded sea; no
    /// provinces or states.
    public static func terrain(_ input: Inputs, heights: [UInt8], sea withSea: Bool = true) -> (map: WorldMap, surface: Climate.Surface) {
        var m = input.base
        let elevations = heights.map(Int.init)
        let surface = Climate.surface(input.document, elevations: elevations)
        let n = min(m.cellCount, heights.count)
        m.elevation = (0..<m.cellCount).map { $0 < n ? Int16(heights[$0]) : 0 }
        m.biome = (0..<m.cellCount).map { $0 < n ? surface.ids[$0] : 0 }
        var rgb = [UInt8](repeating: 0, count: m.cellCount * 3)
        for c in 0..<n { let v = biomeColors[Int(min(12, surface.ids[c]))]; rgb[c * 3] = UInt8(v >> 16 & 255); rgb[c * 3 + 1] = UInt8(v >> 8 & 255); rgb[c * 3 + 2] = UInt8(v & 255) }
        m.biomeRGB = rgb
        m.coast = []; m.rivers = []
        // The bundled map's armies belong to its own land: on this one they would stand in the open sea.
        m.meta.economy = nil
        m.province = [Int32](repeating: -1, count: m.cellCount)
        m.meta.provinces = []; m.meta.nations = []; m.meta.cities = []; m.meta.labels = []
        if withSea { m.seaRGBA = sea(m) }
        return (m, surface)
    }

    /// The colour of a height before the climate is known (live feedback while a stroke is drawn).
    public static func quickColor(_ h: Int) -> (UInt8, UInt8, UInt8) {
        switch h {
        case ..<20: return (0x46, 0x6e, 0xab)
        case ..<30: return (0xc8, 0xd6, 0x8f)
        case ..<42: return (0x29, 0xbc, 0x56)
        case ..<55: return (0x40, 0x9c, 0x43)
        case ..<70: return (0x96, 0x78, 0x4b)
        default: return (0xd5, 0xe7, 0xeb)
        }
    }

    /// The opening on given heights: terrain, provinces (the settlement partition) and the states'
    /// starting land and capitals, as the engine will found them.
    public static func build(_ input: Inputs, heights: [UInt8], nations: Int, cities: Int) -> WorldMap {
        let t = terrain(input, heights: heights, sea: false)
        var m = t.map
        let surface = t.surface, elevations = heights.map(Int.init), n = min(m.cellCount, heights.count)
        // Provinces: each land cell joins the province of a clipped face it belongs to.
        var province = [Int32](repeating: -1, count: m.cellCount)
        var provinces = [WorldMeta.Province](), owners = [Int](), seeds = [Int]()
        // Too few provinces for this land: the same steps up as the engine, so the two still agree.
        var target = cities
        var found = Regions.partition(input.document, elevations: elevations, cities: target, surface: surface)
        while found == nil && target < 480 {
            target = raisedCities(target)
            found = Regions.partition(input.document, elevations: elevations, cities: target, surface: surface)
        }
        if let part = found {
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
            WorldMeta.Nation(id: "n-\(i)", name: "", color: palette[i % palette.count], line: NativeEngine.stateLineColor(palette[i % palette.count]), capital: i, culture: "", polity: "", religion: "")
        }
        m.meta.cities = seeds.enumerated().map { i, s in WorldMeta.City(id: "c-\(s)", name: "", x: provinces[s].x, y: provinces[s].y, province: s) }
        m.meta.labels = []
        m.seaRGBA = sea(m)
        return m
    }

    /// engine.ts raisedCities.
    static func raisedCities(_ n: Int) -> Int { min(480, max(n + 1, Int((Double(n) * 1.15).rounded(.up)))) }

    /// A small shaded chart of the land these heights make, for the new-world sheet.
    public static func thumbnail(_ input: Inputs, heights: [UInt8], width: Int) -> (rgba: [UInt8], width: Int, height: Int) {
        let map = input.base, picker = CellPicker(map: map)
        let w = max(2, width), h = max(2, Int(Float(w) * map.height / map.width))
        var field = [Float](repeating: 0, count: w * h)
        for y in 0..<h { for x in 0..<w {
            let px = (Float(x) + 0.5) * map.width / Float(w), py = (Float(y) + 0.5) * map.height / Float(h)
            if let c = picker.cell(atX: px, y: py), c < heights.count { field[y * w + x] = Float(heights[c]) }
        } }
        let deep = MapPalette.Ocean.warmPaper.deep, shallow = MapPalette.Ocean.warmPaper.shallow, ink = RGB(hex: 0x4A3A28)
        let ramp: [(at: Float, color: RGB)] = [(20, RGB(hex: 0xD3D49B)), (34, RGB(hex: 0xA9BC78)), (48, RGB(hex: 0xBFA96F)), (66, RGB(hex: 0x927A54)), (84, RGB(hex: 0xEFE8D8))]
        func mix(_ a: RGB, _ b: RGB, _ t: Float) -> (Float, Float, Float) { (a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t) }
        func land(_ v: Float) -> (Float, Float, Float) {
            for k in 1..<ramp.count where v < ramp[k].at { return mix(ramp[k - 1].color, ramp[k].color, (v - ramp[k - 1].at) / (ramp[k].at - ramp[k - 1].at)) }
            let top = ramp[ramp.count - 1].color
            return (top.r, top.g, top.b)
        }
        var out = [UInt8](repeating: 255, count: w * h * 4)
        for y in 0..<h { for x in 0..<w {
            let i = y * w + x, v = field[i]
            let north = field[max(0, y - 1) * w + x], west = field[y * w + max(0, x - 1)], nw = field[max(0, y - 1) * w + max(0, x - 1)]
            var c: (Float, Float, Float)
            if v < 20 { let t = v / 20; c = mix(deep, shallow, t * t) }
            else {
                c = land(v)
                let light: Float = max(0.78, min(1.2, 1 + (v - nw) * 0.022))
                c = (c.0 * light, c.1 * light, c.2 * light)
                // The coast inked in.
                if north < 20 || west < 20 { c = (c.0 + (ink.r - c.0) * 0.6, c.1 + (ink.g - c.1) * 0.6, c.2 + (ink.b - c.2) * 0.6) }
            }
            out[i * 4] = UInt8(max(0, min(1, c.0)) * 255); out[i * 4 + 1] = UInt8(max(0, min(1, c.1)) * 255); out[i * 4 + 2] = UInt8(max(0, min(1, c.2)) * 255)
        } }
        return (out, w, h)
    }

    /// A sea texture shaded by depth, authored in the warm-paper pair (deep 0x527c86 → shallow 0x8eafb1).
    /// The renderer recolours this onto the selected preset, so the coastal gradient stays put.
    static func sea(_ m: WorldMap) -> [UInt8] {
        let picker = CellPicker(map: m), w = m.seaWidth, h = m.seaHeight
        var out = [UInt8](repeating: 255, count: w * h * 4)
        let deep = MapPalette.Ocean.warmPaper.deep, shallow = MapPalette.Ocean.warmPaper.shallow
        for y in 0..<h { for x in 0..<w {
            let px = (Float(x) + 0.5) * m.width / Float(w), py = (Float(y) + 0.5) * m.height / Float(h)
            let e = picker.cell(atX: px, y: py).map { Float(min(20, max(0, Int(m.elevation[$0])))) / 20 } ?? 0
            let t = e * e, o = (y * w + x) * 4
            out[o] = UInt8((deep.r + (shallow.r - deep.r) * t) * 255); out[o + 1] = UInt8((deep.g + (shallow.g - deep.g) * t) * 255); out[o + 2] = UInt8((deep.b + (shallow.b - deep.b) * t) * 255)
        } }
        return out
    }
}
