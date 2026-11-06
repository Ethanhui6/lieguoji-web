import Foundation

/// Land colours of the web's reference-paper appearance (original-play-renderer: ORIGINAL_PRESETS[7] with
/// StateMapTransparency 0.78; original-layers.ts originalCellColor): land is the height background,
/// grey = 1 − elevation / 100, and a state colour is laid over at 0.78, mixed in linear space. The terrain
/// view uses the original per-cell biome colour. The sea is the exported coastal-distance texture; the
/// per-cell sea colour below is only a fallback.
public enum MapMode: String, CaseIterable, Sendable { case political, terrain }

public struct RGB: Equatable, Sendable {
    public var r: Float, g: Float, b: Float
    public init(_ r: Float, _ g: Float, _ b: Float) { self.r = r; self.g = g; self.b = b }
    public init(hex: UInt32) { self.init(Float(hex >> 16 & 255) / 255, Float(hex >> 8 & 255) / 255, Float(hex & 255) / 255) }
    /// "#rrggbb"; nil for anything else.
    public init?(css: String) {
        guard css.count == 7, css.first == "#", let v = UInt32(css.dropFirst(), radix: 16) else { return nil }
        self.init(hex: v)
    }
}

public enum MapPalette {
    public static let stateAlpha: Float = 0.78
    /// Display preset 0 (displaysettings shallow #3c9cff / deep #1487ff) and the previous warm-paper sea.
    /// Exported and preview textures are authored in the warm pair so a preset can be recoloured without
    /// rebuilding the coastal gradient. Coast #5f5f5f is the same in both.
    public struct Ocean: Equatable, Sendable {
        public var shallow: RGB
        public var deep: RGB
        public static let original = Ocean(shallow: RGB(hex: 0x3C9CFF), deep: RGB(hex: 0x1487FF))
        public static let warmPaper = Ocean(shallow: RGB(hex: 0x8EAFB1), deep: RGB(hex: 0x527C86))
    }
    public static func ocean(_ id: String) -> Ocean { id == "warm" ? .warmPaper : .original }
    /// Cell fallback uses preset 0. The warm pair stays on `Ocean.warmPaper` for authored textures.
    public static let shallowSea = Ocean.original.shallow
    public static let deepSea = Ocean.original.deep
    public static let coastLine = RGB(hex: 0x5F5F5F)
    public static let stateLine = RGB(hex: 0x1487FF)
    /// Province borders when the switch is on. Measured #B2B2B2, not the web #303e37 at 0.2.
    public static let provinceBorder = RGB(hex: 0xB2B2B2)
    /// Sea-route colour from the original display settings. Width and dash are not in this client.
    public static let seaLane = RGB(hex: 0x868686)

    /// Maps a warm-authored sea texture onto another preset, keeping each pixel's place between deep and shallow.
    public static func recolorSea(_ rgba: [UInt8], from: Ocean, to: Ocean) -> [UInt8] {
        if from == to || rgba.count < 4 { return rgba }
        let fd = SIMD3<Float>(from.deep.r, from.deep.g, from.deep.b)
        let fs = SIMD3<Float>(from.shallow.r, from.shallow.g, from.shallow.b)
        let td = SIMD3<Float>(to.deep.r, to.deep.g, to.deep.b)
        let ts = SIMD3<Float>(to.shallow.r, to.shallow.g, to.shallow.b)
        let axis = fs - fd
        let denom = max(1e-8, axis.x * axis.x + axis.y * axis.y + axis.z * axis.z)
        var out = rgba
        var i = 0
        while i + 3 < out.count {
            let c = SIMD3<Float>(Float(rgba[i]) / 255, Float(rgba[i + 1]) / 255, Float(rgba[i + 2]) / 255)
            let along = (c.x - fd.x) * axis.x + (c.y - fd.y) * axis.y + (c.z - fd.z) * axis.z
            let t = min(1, max(0, along / denom))
            let o = td + (ts - td) * t
            func byte(_ v: Float) -> UInt8 { UInt8(clamping: Int((v * 255).rounded())) }
            out[i] = byte(o.x); out[i + 1] = byte(o.y); out[i + 2] = byte(o.z)
            i += 4
        }
        return out
    }

    public static func srgbToLinear(_ c: Float) -> Float { c <= 0.04045 ? c / 12.92 : powf((c + 0.055) / 1.055, 2.4) }
    public static func linearToSrgb(_ c: Float) -> Float { c <= 0.0031308 ? 12.92 * c : 1.055 * powf(c, 1 / 2.4) - 0.055 }

    /// Height background grey (linear) for an elevation.
    public static func heightGray(_ elevation: Int16) -> Float { 1 - Float(min(100, max(0, Int(elevation)))) / 100 }

    /// Final sRGB colour of a cell.
    /// `provinceColors`: a colour view (alliance, culture, family, religion) fills each province.
    public static func cellColor(map: WorldMap, cell: Int, mode: MapMode, nationColors: [RGB], provinceColors: [RGB]? = nil) -> RGB {
        let e = map.elevation[cell]
        if e < WorldMap.seaLevel {
            let t = Float(min(20, max(0, Int(e)))) / 20
            return RGB(deepSea.r + (shallowSea.r - deepSea.r) * t, deepSea.g + (shallowSea.g - deepSea.g) * t, deepSea.b + (shallowSea.b - deepSea.b) * t)
        }
        if mode == .terrain {
            let i = cell * 3
            return RGB(Float(map.biomeRGB[i]) / 255, Float(map.biomeRGB[i + 1]) / 255, Float(map.biomeRGB[i + 2]) / 255)
        }
        let gray = heightGray(e)
        func mixed(_ state: RGB) -> RGB { func mix(_ s: Float) -> Float { linearToSrgb(gray + (srgbToLinear(s) - gray) * stateAlpha) }; return RGB(mix(state.r), mix(state.g), mix(state.b)) }
        if let provinceColors { let p = Int(map.province[cell]); if p >= 0 && p < provinceColors.count { return mixed(provinceColors[p]) } }
        guard let n = map.nation(ofCell: cell), n < nationColors.count else {
            let s = linearToSrgb(gray); return RGB(s, s, s)
        }
        let state = nationColors[n]
        func mix(_ s: Float) -> Float { linearToSrgb(gray + (srgbToLinear(s) - gray) * stateAlpha) }
        return RGB(mix(state.r), mix(state.g), mix(state.b))
    }
}
