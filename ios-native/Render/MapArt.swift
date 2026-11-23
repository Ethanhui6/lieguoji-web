import SwiftUI
import UIKit

/// 基于 `cultures.json` 全部 26 种历史文明划分的十大美术大系，自动驱动各国差异化都城、要塞、港口、战旗、战舰与传报画卷。
enum CultureStyle: String, CaseIterable {
    case chinese      // 中华汉字圈：汉、朝鲜、越南、吐蕃
    case japanese     // 日本和风：天守阁、和风军旗
    case western      // 西欧骑士：英、法、德、西、意、葡、荷、匈
    case classical    // 古典罗马/希腊：大理石卫城与穹顶宫殿
    case nordic       // 北欧维京：龙头木堡与维京长船
    case slavic       // 斯拉夫：克里姆林洋葱穹顶红砖要塞
    case islamic      // 中东伊斯兰/古埃及：青绿穹顶宣礼塔宫殿与弯月战旗
    case steppe       // 草原蒙古：黄金汗帐与苏鲁锭牦尾军纛
    case indian       // 南亚印度：红砂岩白大理石穹亭宫城
    case mesoamerican // 美洲阿兹特克/印加：阶梯石砌金字塔神庙

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

/// 打包在 `Resources/Art` 的全套纯 AI 生成无圆框透明美术资源（只解码一次，零主线程重复 IO，全文明差异化自动调度）。
enum BundleArt {
    // MARK: - 地图舆图罗盘与装裱角饰
    static let compassRose: UIImage? = load("compass-rose")
    static let scrollCorner: UIImage? = load("scroll-corner")

    // MARK: - 十大文明大系都城微缩地标
    static let capitalChinese: UIImage? = load("landmark-capital")
    static let capitalJapanese: UIImage? = load("capital-japanese")
    static let capitalWestern: UIImage? = load("capital-western")
    static let capitalClassical: UIImage? = load("capital-classical")
    static let capitalNordic: UIImage? = load("capital-nordic")
    static let capitalSlavic: UIImage? = load("capital-slavic")
    static let capitalIslamic: UIImage? = load("capital-islamic")
    static let capitalSteppe: UIImage? = load("capital-steppe")
    static let capitalIndian: UIImage? = load("capital-indian")
    static let capitalMesoamerican: UIImage? = load("capital-mesoamerican")

    // MARK: - 多文明要塞与海港地标
    static let fortressEast: UIImage? = load("landmark-fortress")
    static let fortressWest: UIImage? = load("fortress-west")
    static let fortressIslamic: UIImage? = load("fortress-islamic")
    static let portEast: UIImage? = load("landmark-port")
    static let portWest: UIImage? = load("port-west")

    // MARK: - 多文明活态战旗（攻占飘扬 / 战败折断）与战舰
    static let bannerVictoryEast: UIImage? = load("banner-victory-east")
    static let bannerVictoryWest: UIImage? = load("banner-victory-west")
    static let bannerVictoryIslamic: UIImage? = load("banner-victory-islamic")
    static let bannerVictorySteppe: UIImage? = load("banner-victory-steppe")

    static let bannerFallenEast: UIImage? = load("fx-banner-fallen")
    static let bannerFallenWest: UIImage? = load("banner-fallen-west")
    static let bannerFallenIslamic: UIImage? = load("banner-fallen-islamic")

    static let navalEast: UIImage? = load("naval-east")
    static let navalWest: UIImage? = load("naval-west")
    static let navalNordic: UIImage? = load("naval-nordic")

    // MARK: - 无圆框传报与世界事件插画
    static let heraldWarEast: UIImage? = load("herald-war")
    static let heraldWarWest: UIImage? = load("herald-war-west")
    static let heraldEdictEast: UIImage? = load("herald-edict")
    static let heraldEdictWest: UIImage? = load("herald-edict-west")
    static let heraldPeace: UIImage? = load("herald-peace")
    static let heraldUprising: UIImage? = load("herald-uprising")

    // MARK: - 攻城、四季天气与世界灾丰事件真 AI 透明图
    static let fxSiegeFlame: UIImage? = load("fx-siege-flame")
    static let fxHarvest: UIImage? = load("fx-harvest")
    static let fxTrade: UIImage? = load("fx-trade")
    static let fxTalent: UIImage? = load("fx-talent")
    static let fxWeatherSnow: UIImage? = load("fx-weather-snow")
    static let fxWeatherDrought: UIImage? = load("fx-weather-drought")
    static let fxWeatherStorm: UIImage? = load("fx-weather-storm")
    static let fxPlague: UIImage? = load("fx-plague")

    // MARK: - 四季实时大气粒子真 AI 透明图
    static let fxPetal: UIImage? = load("fx-petal")
    static let fxMaple: UIImage? = load("fx-maple")
    static let fxSnowflake: UIImage? = load("fx-snowflake")

    // MARK: - 真 AI 篆刻朱砂／鎏金古风印章（全面取代代码简易红框）
    static let sealChronicle: UIImage? = load("seal-chronicle")
    static let sealReplay: UIImage? = load("seal-replay")
    static let sealCourt: UIImage? = load("seal-court")
    static let sealCouncil: UIImage? = load("seal-council")

    // MARK: - 4×1 透明序列帧动画图集（1024×256，供 SpriteAnimator 与 Metal GPU 管线共享）
    static let sheetInfantryMarch: UIImage? = load("sheet-infantry-march")
    static let sheetCavalryCharge: UIImage? = load("sheet-cavalry-charge")
    static let sheetWarshipEast: UIImage? = load("sheet-warship-east")
    static let sheetWarshipWest: UIImage? = load("sheet-warship-west")
    static let sheetWarshipNordic: UIImage? = load("sheet-warship-nordic")
    static let sheetWarshipIslamic: UIImage? = load("sheet-warship-islamic")
    static let sheetTransportShip: UIImage? = load("sheet-transport-ship")
    static let sheetBattleClash: UIImage? = load("sheet-battle-clash")
    static let sheetSiegeSmoke: UIImage? = load("sheet-siege-smoke")
    static let sheetBannerWave: UIImage? = load("sheet-banner-wave")

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
        default: return load(name)
        }
    }

    /// 将全应用面板与印信语义映射至对应的 museum-grade 真 AI 雕刻印章，彻底消灭代码红框单字印。
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

    // MARK: - 默认兼容别名（全部为无圆框纯 AI 透明图）
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

    // MARK: - 按文明大系自动调度差异化建筑、旗帜、战舰与兵戈画卷
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

    /// 供 Metal `MTKTextureLoader` 载入世界写实山脉、森林、沙漠与卷轴角饰贴图。
    static func url(_ name: String) -> URL? {
        if let u = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "Art") { return u }
        return Bundle.main.url(forResource: name, withExtension: "png")
    }

    private static func load(_ name: String) -> UIImage? {
        guard let u = url(name) else { return nil }
        return UIImage(contentsOfFile: u.path)
    }
}

/// 全应用统一清雅水墨线描微标（彻底替代小尺寸发糊、风格割裂的厚涂 AI 贴图，与宣纸奏折界面浑然一体）。
struct ArtEmblem: View {
    let image: UIImage?
    var size: CGFloat = 32
    var fallback: InkGlyph = .crown
    var body: some View {
        let _ = image
        InkIcon(glyph: fallback, size: max(13, size * 0.68), weight: 1.75, accent: Theme.seal.opacity(0.18))
            .foregroundStyle(Theme.seal)
            .frame(width: size, height: size)
    }
}
