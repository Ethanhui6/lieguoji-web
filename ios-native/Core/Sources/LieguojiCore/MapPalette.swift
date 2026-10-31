import Foundation

/// Colours of the original first display preset (src/fms/original/original-style.ts ORIGINAL_PRESETS[0]
/// and original-layers.ts originalCellColor): land is the height background, grey = 1 − elevation / 100,
/// and a state colour is laid over at StateMapTransparency 0.8, mixed in linear space. The terrain view
/// uses the original per-cell biome colour. Sea fades from shallow to deep with depth.
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
    public static let stateAlpha: Float = 0.8
    public static let shallowSea = RGB(hex: 0x3C9CFF)
    public static let deepSea = RGB(hex: 0x1487FF)
    public static let coastLine = RGB(hex: 0x5F5F5F)
    public static let stateLine = RGB(hex: 0x1487FF)

    public static func srgbToLinear(_ c: Float) -> Float { c <= 0.04045 ? c / 12.92 : powf((c + 0.055) / 1.055, 2.4) }
    public static func linearToSrgb(_ c: Float) -> Float { c <= 0.0031308 ? 12.92 * c : 1.055 * powf(c, 1 / 2.4) - 0.055 }

    /// Height background grey (linear) for an elevation.
    public static func heightGray(_ elevation: Int16) -> Float { 1 - Float(min(100, max(0, Int(elevation)))) / 100 }

    /// Final sRGB colour of a cell.
    public static func cellColor(map: WorldMap, cell: Int, mode: MapMode, nationColors: [RGB]) -> RGB {
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
        guard let n = map.nation(ofCell: cell), n < nationColors.count else {
            let s = linearToSrgb(gray); return RGB(s, s, s)
        }
        let state = nationColors[n]
        func mix(_ s: Float) -> Float { linearToSrgb(gray + (srgbToLinear(s) - gray) * stateAlpha) }
        return RGB(mix(state.r), mix(state.g), mix(state.b))
    }
}
