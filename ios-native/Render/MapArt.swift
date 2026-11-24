import SwiftUI
import UIKit
import ImageIO

/// 基于 `cultures.json` 全部 26 种历史文明划分的十大美术大系，自动驱动各国差异化都城、要塞、港口、战旗、战舰与传报画卷。
enum CultureStyle: String, CaseIterable {
    case chinese
    case japanese
    case western
    case classical
    case nordic
    case slavic
    case islamic
    case steppe
    case indian
    case mesoamerican

    static func of(_ culture: String?) -> CultureStyle {
        switch (culture ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "japanese": return .japanese
        case "english", "french", "german", "spanish", "italian", "portuguese", "dutch", "hungarian", "western": return .western
        case "roman", "greek", "byzantine", "classical": return .classical
        case "norse", "viking", "nordic": return .nordic
        case "slavic", "polish", "russian": return .slavic
        case "arab", "arabic", "persian", "turkic", "egyptian", "islamic": return .islamic
        case "mongol", "steppe", "nomad": return .steppe
        case "indian", "hindu": return .indian
        case "aztec", "inca", "maya", "mesoamerican": return .mesoamerican
        default: return .chinese
        }
    }

    var isEastAsian: Bool {
        switch self {
        case .chinese, .japanese, .indian: return true
        default: return false
        }
    }

    var isEasternWeapon: Bool {
        switch self {
        case .chinese, .japanese, .steppe, .indian: return true
        default: return false
        }
    }
}

/// 打包在 `Resources/Art` 的美术资源管理器（严格受限 14MB `NSCache` + 缩略解码 + 内存警告自动清空）：
/// 彻底废除旧版 60+ 常驻 `static let` 与进局全量预解码导致的 ~100MB 真机内存峰值与 Jetsam 闪退。
enum BundleArt {
    private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 40
        c.totalCostLimit = 14 << 20
        NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { _ in
            c.removeAllObjects()
        }
        return c
    }()

    static func clearCache() {
        cache.removeAllObjects()
    }

    static func prewarmAsync() {
        // 按需惰性缩略解码，严禁进局瞬间集中把几十兆 PNG 压进真机内存触发闪退。
    }

    static var compassRose: UIImage? { load("compass-rose", maxPx: 256) }
    static var scrollCorner: UIImage? { load("scroll-corner", maxPx: 256) }

    static var capitalChinese: UIImage? { load("landmark-capital", maxPx: 192) }
    static var capitalJapanese: UIImage? { load("capital-japanese", maxPx: 192) }
    static var capitalWestern: UIImage? { load("capital-western", maxPx: 192) }
    static var capitalClassical: UIImage? { load("capital-classical", maxPx: 192) }
    static var capitalNordic: UIImage? { load("capital-nordic", maxPx: 192) }
    static var capitalSlavic: UIImage? { load("capital-slavic", maxPx: 192) }
    static var capitalIslamic: UIImage? { load("capital-islamic", maxPx: 192) }
    static var capitalSteppe: UIImage? { load("capital-steppe", maxPx: 192) }
    static var capitalIndian: UIImage? { load("capital-indian", maxPx: 192) }
    static var capitalMesoamerican: UIImage? { load("capital-mesoamerican", maxPx: 192) }

    static var fortressEast: UIImage? { load("landmark-fortress", maxPx: 160) }
    static var fortressWest: UIImage? { load("fortress-west", maxPx: 160) }
    static var fortressIslamic: UIImage? { load("fortress-islamic", maxPx: 160) }
    static var portEast: UIImage? { load("landmark-port", maxPx: 160) }
    static var portWest: UIImage? { load("port-west", maxPx: 160) }

    static var bannerVictoryEast: UIImage? { load("banner-victory-east", maxPx: 160) }
    static var bannerVictoryWest: UIImage? { load("banner-victory-west", maxPx: 160) }
    static var bannerVictoryIslamic: UIImage? { load("banner-victory-islamic", maxPx: 160) }
    static var bannerVictorySteppe: UIImage? { load("banner-victory-steppe", maxPx: 160) }

    static var bannerFallenEast: UIImage? { load("fx-banner-fallen", maxPx: 160) }
    static var bannerFallenWest: UIImage? { load("banner-fallen-west", maxPx: 160) }
    static var bannerFallenIslamic: UIImage? { load("banner-fallen-islamic", maxPx: 160) }

    static var navalEast: UIImage? { load("naval-east", maxPx: 160) }
    static var navalWest: UIImage? { load("naval-west", maxPx: 160) }
    static var navalNordic: UIImage? { load("naval-nordic", maxPx: 160) }

    static var heraldWarEast: UIImage? { load("herald-war", maxPx: 192) }
    static var heraldWarWest: UIImage? { load("herald-war-west", maxPx: 192) }
    static var heraldEdictEast: UIImage? { load("herald-edict", maxPx: 192) }
    static var heraldEdictWest: UIImage? { load("herald-edict-west", maxPx: 192) }
    static var heraldPeace: UIImage? { load("herald-peace", maxPx: 192) }
    static var heraldUprising: UIImage? { load("herald-uprising", maxPx: 192) }

    static var fxSiegeFlame: UIImage? { load("fx-siege-flame", maxPx: 160) }
    static var fxHarvest: UIImage? { load("fx-harvest", maxPx: 128) }
    static var fxTrade: UIImage? { load("fx-trade", maxPx: 128) }
    static var fxTalent: UIImage? { load("fx-talent", maxPx: 128) }
    static var fxWeatherSnow: UIImage? { load("fx-weather-snow", maxPx: 128) }
    static var fxWeatherDrought: UIImage? { load("fx-weather-drought", maxPx: 128) }
    static var fxWeatherStorm: UIImage? { load("fx-weather-storm", maxPx: 128) }
    static var fxPlague: UIImage? { load("fx-plague", maxPx: 128) }

    static var fxPetal: UIImage? { load("fx-petal", maxPx: 96) }
    static var fxMaple: UIImage? { load("fx-maple", maxPx: 96) }
    static var fxSnowflake: UIImage? { load("fx-snowflake", maxPx: 96) }
    static var fxRaindrop: UIImage? { load("fx-raindrop", maxPx: 96) }
    static var fxCloudMist: UIImage? { load("fx-cloud-mist", maxPx: 192) }

    /// 36 帧（6×6）图集按 576px 缩略解码（每张仅 ~1.3MB 而非 9MB，省下 7 倍内存，屏幕上 48pt 依然清晰锐利）。
    static var atlasBattle36: UIImage? { load("atlas-battle-36", maxPx: 576) }
    static var atlasNaval36: UIImage? { load("atlas-naval-36", maxPx: 576) }
    static var atlasSiege36: UIImage? { load("atlas-siege-36", maxPx: 576) }
    static var atlasRainRipple36: UIImage? { load("atlas-rain-ripple-36", maxPx: 576) }
    static var atlasAmphibious36: UIImage? { load("atlas-amphibious-36", maxPx: 576) }
    static var atlasCaptureFlag36: UIImage? { load("atlas-capture-flag-36", maxPx: 576) }

    static var sealChronicle: UIImage? { load("seal-chronicle", maxPx: 144) }
    static var sealReplay: UIImage? { load("seal-replay", maxPx: 144) }
    static var sealCourt: UIImage? { load("seal-court", maxPx: 144) }
    static var sealCouncil: UIImage? { load("seal-council", maxPx: 144) }

    static var stampCapitalEast: UIImage? { load("stamp-capital-east", maxPx: 160) }
    static var stampCapitalWest: UIImage? { load("stamp-capital-west", maxPx: 160) }
    static var stampCapitalIslamic: UIImage? { load("stamp-capital-islamic", maxPx: 160) }

    static func capitalInkStamp(for culture: String?) -> UIImage? {
        switch CultureStyle.of(culture) {
        case .chinese, .japanese, .indian: return stampCapitalEast
        case .islamic, .steppe, .mesoamerican: return stampCapitalIslamic ?? stampCapitalEast
        case .western, .classical, .nordic, .slavic: return stampCapitalWest ?? stampCapitalEast
        }
    }

    static var sheetInfantryMarch: UIImage? { load("sheet-infantry-march", maxPx: 512) }
    static var sheetCavalryCharge: UIImage? { load("sheet-cavalry-charge", maxPx: 512) }
    static var sheetWarshipEast: UIImage? { load("sheet-warship-east", maxPx: 512) }
    static var sheetWarshipWest: UIImage? { load("sheet-warship-west", maxPx: 512) }
    static var sheetWarshipNordic: UIImage? { load("sheet-warship-nordic", maxPx: 512) }
    static var sheetWarshipIslamic: UIImage? { load("sheet-warship-islamic", maxPx: 512) }
    static var sheetTransportShip: UIImage? { load("sheet-transport-ship", maxPx: 512) }
    static var sheetBattleClash: UIImage? { load("sheet-battle-clash", maxPx: 512) }
    static var sheetSiegeSmoke: UIImage? { load("sheet-siege-smoke", maxPx: 512) }
    static var sheetBannerWave: UIImage? { load("sheet-banner-wave", maxPx: 512) }

    static func spriteSheet(_ name: String) -> UIImage? {
        switch name {
        case "sheet-infantry-march": return sheetInfantryMarch
        case "sheet-cavalry-charge": return sheetCavalryCharge
        case "sheet-warship-east": return sheetWarshipEast
        case "sheet-warship-west": return sheetWarshipWest
        case "sheet-warship-nordic": return sheetWarshipNordic
        case "sheet-warship-islamic": return sheetWarshipIslamic
        case "sheet-transport-ship": return sheetTransportShip
        case "sheet-battle-clash": return sheetBattleClash
        case "sheet-siege-smoke": return sheetSiegeSmoke
        case "sheet-banner-wave": return sheetBannerWave
        case "atlas-battle-36": return atlasBattle36
        case "atlas-naval-36": return atlasNaval36
        case "atlas-siege-36": return atlasSiege36
        case "atlas-rain-ripple-36": return atlasRainRipple36
        case "atlas-amphibious-36": return atlasAmphibious36
        case "atlas-capture-flag-36": return atlasCaptureFlag36
        default: return load(name, maxPx: 512)
        }
    }

    static func sealArt(for tag: String) -> UIImage? {
        switch tag.trimmingCharacters(in: .whitespacesAndNewlines) {
        case "史", "纪", "历", "卷", "典": return sealChronicle ?? sealCouncil
        case "溯", "回": return sealReplay ?? sealChronicle
        case "权", "政", "御", "御览", "禅", "龙", "列", "国", "夏", "万", "新", "阅": return sealCourt ?? sealChronicle
        case "议", "令", "任", "党", "盟", "择", "选", "改", "编", "设", "弃", "底", "误": return sealCouncil ?? sealCourt
        case "战", "兵", "军", "霸", "合": return heraldWarEast ?? sealCourt
        case "舟", "海": return navalEast ?? sealReplay
        case "丝": return fxTrade ?? sealCouncil
        case "官": return fxTalent ?? sealCouncil
        default: return sealCourt ?? sealChronicle
        }
    }

    static var landmarkCapital: UIImage? { capitalChinese }
    static var landmarkFortress: UIImage? { fortressEast }
    static var landmarkPort: UIImage? { portEast }
    static var heraldWar: UIImage? { heraldWarEast }
    static var heraldEdict: UIImage? { heraldEdictEast }
    static var wargodCrest: UIImage? { heraldWarEast }
    static var edictCrest: UIImage? { heraldEdictEast }
    static var fxBannerVictory: UIImage? { bannerVictoryEast }
    static var fxBannerFallen: UIImage? { bannerFallenEast }
    static var fxNavalClash: UIImage? { navalEast }

    static func capital(for culture: String?) -> UIImage? {
        switch CultureStyle.of(culture) {
        case .chinese: return capitalChinese
        case .japanese: return capitalJapanese ?? capitalChinese
        case .western: return capitalWestern ?? capitalChinese
        case .classical: return capitalClassical ?? capitalWestern ?? capitalChinese
        case .nordic: return capitalNordic ?? capitalWestern ?? capitalChinese
        case .slavic: return capitalSlavic ?? capitalWestern ?? capitalChinese
        case .islamic: return capitalIslamic ?? capitalChinese
        case .steppe: return capitalSteppe ?? capitalChinese
        case .indian: return capitalIndian ?? capitalIslamic ?? capitalChinese
        case .mesoamerican: return capitalMesoamerican ?? capitalChinese
        }
    }

    static func fortress(for culture: String?) -> UIImage? {
        switch CultureStyle.of(culture) {
        case .chinese, .japanese, .indian: return fortressEast
        case .islamic, .steppe, .mesoamerican: return fortressIslamic ?? fortressEast
        case .western, .classical, .nordic, .slavic: return fortressWest ?? fortressEast
        }
    }

    static func port(for culture: String?) -> UIImage? {
        CultureStyle.of(culture).isEastAsian ? portEast : (portWest ?? portEast)
    }

    static func victoryBanner(for culture: String?) -> UIImage? {
        switch CultureStyle.of(culture) {
        case .chinese, .japanese, .indian: return bannerVictoryEast
        case .islamic: return bannerVictoryIslamic ?? bannerVictoryEast
        case .steppe: return bannerVictorySteppe ?? bannerVictoryEast
        case .western, .classical, .nordic, .slavic, .mesoamerican: return bannerVictoryWest ?? bannerVictoryEast
        }
    }

    static func fallenBanner(for culture: String?) -> UIImage? {
        switch CultureStyle.of(culture) {
        case .chinese, .japanese, .indian: return bannerFallenEast
        case .islamic, .steppe: return bannerFallenIslamic ?? bannerFallenEast
        case .western, .classical, .nordic, .slavic, .mesoamerican: return bannerFallenWest ?? bannerFallenEast
        }
    }

    static func warship(for culture: String?) -> UIImage? {
        switch CultureStyle.of(culture) {
        case .chinese, .japanese, .indian: return navalEast
        case .nordic: return navalNordic ?? navalWest ?? navalEast
        default: return navalWest ?? navalEast
        }
    }

    static func warCrest(for culture: String?) -> UIImage? {
        CultureStyle.of(culture).isEasternWeapon ? heraldWarEast : (heraldWarWest ?? heraldWarEast)
    }

    static func edictCrest(for culture: String?) -> UIImage? {
        CultureStyle.of(culture).isEasternWeapon ? heraldEdictEast : (heraldEdictWest ?? heraldEdictEast)
    }

    static func url(_ name: String) -> URL? {
        if let u = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "Art") { return u }
        return Bundle.main.url(forResource: name, withExtension: "png")
    }

    /// 使用 ImageIO 硬件缩略管线直接按目标像素上限解码（不先把 1536×1536 9MB 原图铺满内存），并按真实像素字节记入有界缓存。
    private static func load(_ name: String, maxPx: Int) -> UIImage? {
        let key = "\(name)#\(maxPx)" as NSString
        if let hit = cache.object(forKey: key) { return hit }
        guard let u = url(name) else { return nil }
        let image: UIImage?
        if let src = CGImageSourceCreateWithURL(u as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) {
            let opts: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPx
            ]
            if let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) {
                image = UIImage(cgImage: cg)
            } else {
                image = UIImage(contentsOfFile: u.path)
            }
        } else {
            image = UIImage(contentsOfFile: u.path)
        }
        guard let image else { return nil }
        let cost: Int
        if let cg = image.cgImage { cost = cg.bytesPerRow * cg.height }
        else { cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4) }
        cache.setObject(image, forKey: key, cost: max(1, cost))
        return image
    }
}

struct ArtEmblem: View {
    let image: UIImage?
    var size: CGFloat = 32
    var fallback: InkGlyph = .crown
    var body: some View {
        if let image {
            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .antialiased(true)
                .scaledToFit()
                .frame(width: size, height: size)
        } else {
            InkIcon(glyph: fallback, size: max(13, size * 0.68), weight: 1.75, accent: Theme.seal.opacity(0.18))
                .foregroundStyle(Theme.seal)
                .frame(width: size, height: size)
        }
    }
}
