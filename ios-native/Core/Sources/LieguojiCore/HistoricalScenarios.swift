import Foundation
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif

/// 历史剧本中的地理锚点：用于在真实底图上将周边州郡归属到对应国家并赋予真实历史州郡名。
public struct HistoricalAnchor: Codable, Equatable, Sendable {
    public var lon: Double
    public var lat: Double
    public var provinceName: String
    public var weight: Double

    public init(lon: Double, lat: Double, provinceName: String, weight: Double = 1.0) {
        self.lon = lon
        self.lat = lat
        self.provinceName = provinceName
        self.weight = weight
    }
}

/// 历史剧本中的国家设定：含国名、色号、文化、信仰、基础政体、细分政体样式、都城坐标、地理锚点与开局真实领袖。
public struct HistoricalNationSpec: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var shortName: String
    public var color: String
    public var culture: String
    public var religion: String
    public var polity: String
    public var style: String
    public var capitalLon: Double
    public var capitalLat: Double
    public var capitalName: String
    public var anchors: [HistoricalAnchor]
    public var rulerName: String
    public var rulerTitle: String
    public var rulerMilitary: Int
    public var rulerAdmin: Int
    public var rulerDiplo: Int
    public var rulerCharisma: Int
    public var rulerTraits: [String]

    public init(
        id: String,
        name: String,
        shortName: String,
        color: String,
        culture: String,
        religion: String,
        polity: String,
        style: String,
        capitalLon: Double,
        capitalLat: Double,
        capitalName: String,
        anchors: [HistoricalAnchor] = [],
        rulerName: String,
        rulerTitle: String,
        rulerMilitary: Int = 65,
        rulerAdmin: Int = 65,
        rulerDiplo: Int = 65,
        rulerCharisma: Int = 65,
        rulerTraits: [String] = []
    ) {
        self.id = id
        self.name = name
        self.shortName = shortName
        self.color = color
        self.culture = culture
        self.religion = religion
        self.polity = polity
        self.style = style
        self.capitalLon = capitalLon
        self.capitalLat = capitalLat
        self.capitalName = capitalName
        self.anchors = anchors
        self.rulerName = rulerName
        self.rulerTitle = rulerTitle
        self.rulerMilitary = rulerMilitary
        self.rulerAdmin = rulerAdmin
        self.rulerDiplo = rulerDiplo
        self.rulerCharisma = rulerCharisma
        self.rulerTraits = rulerTraits
    }
}

/// 历史剧本开局既定战事（攻守双方使用 `HistoricalNationSpec.id`）。
public struct HistoricalWarSpec: Codable, Equatable, Sendable {
    public var attackerId: String
    public var defenderId: String
    public var casusBelli: String

    public init(attackerId: String, defenderId: String, casusBelli: String) {
        self.attackerId = attackerId
        self.defenderId = defenderId
        self.casusBelli = casusBelli
    }
}

/// 历史剧本开局既定同盟（成员使用 `HistoricalNationSpec.id`）。
public struct HistoricalAllianceSpec: Codable, Equatable, Sendable {
    public var name: String
    public var memberIds: [String]

    public init(name: String, memberIds: [String]) {
        self.name = name
        self.memberIds = memberIds
    }
}

/// 历史剧本开局既定宗属/傀儡附庸关系（如 1941 大日本帝国 -> 伪满洲国）。
public struct HistoricalVassalSpec: Codable, Equatable, Sendable {
    public var overlordId: String
    public var vassalId: String
    public var tributeRate: Double

    public init(overlordId: String, vassalId: String, tributeRate: Double = 0.15) {
        self.overlordId = overlordId
        self.vassalId = vassalId
        self.tributeRate = tributeRate
    }
}

/// 完整历史剧本定义（官方内置与玩家自制上传共用同一份可序列化结构）。
public struct HistoricalScenario: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var subtitle: String
    public var region: HistoricalRegion
    public var year: Int
    public var eraName: String
    public var description: String
    public var author: String
    public var isOfficial: Bool
    public var provinceCount: Int
    public var customHeightsBase64: String?
    public var customProvinceCells: [Int]?
    public var nations: [HistoricalNationSpec]
    public var openingWars: [HistoricalWarSpec]
    public var openingAlliances: [HistoricalAllianceSpec]
    public var openingVassals: [HistoricalVassalSpec]?
    public var tags: [String]
    /// 叛乱模式：`"off"`（禁止叛乱）/ `"historical"`（史实克制，官方默认）/ `"classic"`（经典沙盒）。
    public var rebelMode: String?
    /// 显式锁定历史时代：`"antiquity"` / `"medieval"` / `"gunpowder"` / `"ww1"` / `"ww2"` / `"modern"`。
    public var eraOverride: String?
    /// v8.0.0 历史剧本推演路线：`"historical"`（严格史实事件+锁盟，默认）或 `"sandbox"`（多分支架空推演）。
    public var historicalRoute: String?

    public init(
        id: String,
        title: String,
        subtitle: String,
        region: HistoricalRegion,
        year: Int,
        eraName: String,
        description: String,
        author: String = "列国纪官方",
        isOfficial: Bool = false,
        provinceCount: Int = 120,
        customHeightsBase64: String? = nil,
        customProvinceCells: [Int]? = nil,
        nations: [HistoricalNationSpec],
        openingWars: [HistoricalWarSpec] = [],
        openingAlliances: [HistoricalAllianceSpec] = [],
        openingVassals: [HistoricalVassalSpec]? = nil,
        tags: [String] = [],
        rebelMode: String? = nil,
        eraOverride: String? = nil,
        historicalRoute: String? = nil
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.region = region
        self.year = year
        self.eraName = eraName
        self.description = description
        self.author = author
        self.isOfficial = isOfficial
        self.provinceCount = provinceCount
        self.customHeightsBase64 = customHeightsBase64
        self.customProvinceCells = customProvinceCells
        self.nations = nations
        self.openingWars = openingWars
        self.openingAlliances = openingAlliances
        self.openingVassals = openingVassals
        self.tags = tags
        self.rebelMode = rebelMode
        self.eraOverride = eraOverride
        self.historicalRoute = historicalRoute
    }

    public var yearDisplayText: String {
        year < 0 ? "公元前\(-year)年" : "公元\(year)年"
    }

    /// 跨平台 RLE + Base64 压缩高程数组（LGH1 魔数 + 4 字节小端长度 + (runLen, value) 字节对）。
    public static func encodeHeights(_ heights: [UInt8]) -> String {
        var bytes = [UInt8]()
        bytes.reserveCapacity(min(heights.count, 16384) + 16)
        // Magic: "LGH1"
        bytes.append(0x4C)
        bytes.append(0x47)
        bytes.append(0x48)
        bytes.append(0x31)
        let count = UInt32(clamping: heights.count).littleEndian
        withUnsafeBytes(of: count) { bytes.append(contentsOf: $0) }
        var i = 0
        let n = heights.count
        while i < n {
            let val = min(100, heights[i])
            var run = 1
            while i + run < n && run < 255 && min(100, heights[i + run]) == val {
                run += 1
            }
            bytes.append(UInt8(run))
            bytes.append(val)
            i += run
        }
        return Data(bytes).base64EncodedString()
    }

    /// 解码 `encodeHeights` 生成的 Base64 RLE 高程串；长度不符或损坏时返回 nil。
    public static func decodeHeights(_ base64: String, expectedCount: Int) -> [UInt8]? {
        guard let data = Data(base64Encoded: base64), data.count >= 8 else { return nil }
        let bytes = [UInt8](data)
        guard bytes[0] == 0x4C, bytes[1] == 0x47, bytes[2] == 0x48, bytes[3] == 0x31 else { return nil }
        let storedCount = Int(UInt32(bytes[4])
            | (UInt32(bytes[5]) << 8)
            | (UInt32(bytes[6]) << 16)
            | (UInt32(bytes[7]) << 24))
        guard storedCount > 0, storedCount <= 250_000 else { return nil }
        if expectedCount > 0 && storedCount != expectedCount { return nil }
        var out = [UInt8]()
        out.reserveCapacity(storedCount)
        var idx = 8
        while idx + 1 < bytes.count {
            let run = Int(bytes[idx])
            let val = min(100, bytes[idx + 1])
            idx += 2
            guard run > 0, out.count + run <= storedCount else { return nil }
            for _ in 0..<run { out.append(val) }
        }
        guard out.count == storedCount else { return nil }
        return out
    }
}

/// 官方 10 大真实历史剧本库、国界锁定布局、4,200 城零假名地理命名与整局历史状态覆写引擎。
public enum HistoricalScenarios {
    public static func encodeHeights(_ heights: [UInt8]) -> String {
        HistoricalScenario.encodeHeights(heights)
    }

    public static func decodeHeights(_ base64: String, expectedCount: Int) -> [UInt8]? {
        HistoricalScenario.decodeHeights(base64, expectedCount: expectedCount)
    }

    public static func scenario(id: String) -> HistoricalScenario? {
        officialScenarios.first { $0.id == id }
    }

    public static func scenarios(for region: HistoricalRegion) -> [HistoricalScenario] {
        officialScenarios.filter { $0.region == region }
    }

    // MARK: - 1. 零假名历史地理地名词典（先秦/两汉/三国/隋唐/宋金 240+ 真实州郡 + 日本战国 125+ 令制国城下町 + 全球 4200 真实城市库）

    private static let ancientChinaCities: [(name: String, lon: Double, lat: Double)] = [
        // 关中・秦陇・河西・巴蜀・汉中
        ("咸阳", 108.71, 34.33), ("长安", 108.94, 34.27), ("雍城", 107.39, 34.52), ("栎阳", 109.25, 34.65),
        ("蓝田", 109.32, 34.15), ("陈仓", 107.14, 34.36), ("凤翔", 107.40, 34.52), ("同州", 109.94, 34.80),
        ("华州", 109.77, 34.51), ("潼关", 110.25, 34.55), ("邠州", 108.08, 35.03), ("泾州", 107.36, 35.33),
        ("延州", 109.49, 36.59), ("绥州", 110.26, 37.51), ("上郡", 109.73, 38.29), ("麟州", 110.49, 38.84),
        ("丰州", 107.98, 40.76), ("胜州", 111.22, 40.25), ("朔方", 108.95, 38.01), ("夏州", 108.88, 38.00),
        ("灵州", 106.34, 38.10), ("兴庆府", 106.27, 38.47), ("天水", 105.72, 34.58), ("秦州", 105.70, 34.59),
        ("陇西", 104.63, 35.00), ("金城", 103.83, 36.06), ("临洮", 103.86, 35.38), ("河州", 103.21, 35.60),
        ("湟中", 101.78, 36.62), ("临羌", 101.24, 36.69), ("凉州", 102.64, 37.93), ("武威", 102.63, 37.92),
        ("张掖", 100.45, 38.93), ("酒泉", 98.49, 39.73), ("玉门", 97.04, 40.29), ("敦煌", 94.66, 40.14),
        ("汉中", 107.03, 33.07), ("南郑", 106.94, 33.00), ("阳平", 106.15, 33.15), ("兴元", 107.02, 33.08),
        ("成州", 105.73, 33.74), ("利州", 105.84, 32.44), ("剑州", 105.52, 32.29), ("阆中", 105.97, 31.56),
        ("梓潼", 105.16, 31.63), ("绵竹", 104.22, 31.34), ("成都", 104.07, 30.67), ("益州", 104.06, 30.66),
        ("眉州", 103.85, 30.08), ("嘉州", 103.77, 29.56), ("雅州", 103.00, 29.98), ("邛州", 103.46, 30.41),
        ("梓州", 105.09, 31.10), ("遂州", 105.59, 30.53), ("果州", 106.11, 30.80), ("合州", 106.28, 29.97),
        ("江州", 106.55, 29.56), ("渝州", 106.56, 29.57), ("巴州", 106.76, 31.86), ("达州", 107.50, 31.21),
        ("忠州", 108.04, 30.30), ("万州", 108.41, 30.81), ("夔州", 109.47, 31.02), ("永安", 109.52, 31.04),
        ("泸州", 105.44, 28.87), ("戎州", 104.64, 28.75), ("邛都", 102.26, 27.90), ("松州", 103.60, 32.64),
        // 山西・河北・燕赵・塞北・辽东
        ("邯郸", 114.49, 36.61), ("邺城", 114.47, 36.26), ("相州", 114.35, 36.10), ("邢州", 114.50, 37.07),
        ("巨鹿", 115.03, 37.22), ("赵州", 114.78, 37.76), ("恒山", 114.57, 38.14), ("定州", 114.99, 38.52),
        ("中山", 115.00, 38.51), ("瀛州", 116.10, 38.44), ("沧州", 116.86, 38.30), ("冀州", 115.58, 37.54),
        ("贝州", 115.67, 37.07), ("魏州", 115.15, 36.29), ("博州", 115.98, 36.45), ("德州", 116.36, 37.44),
        ("晋阳", 112.50, 37.71), ("太原", 112.55, 37.87), ("上党", 113.12, 36.20), ("长平", 112.92, 35.80),
        ("平阳", 111.52, 36.09), ("安邑", 111.00, 35.14), ("河东", 110.45, 34.86), ("蒲州", 110.29, 34.85),
        ("绛州", 111.22, 35.62), ("汾州", 111.79, 37.26), ("石州", 111.14, 37.52), ("忻州", 112.73, 38.42),
        ("雁门", 112.96, 39.07), ("代郡", 114.57, 39.84), ("马邑", 112.43, 39.33), ("云中", 111.83, 40.38),
        ("大同", 113.30, 40.08), ("定襄", 111.85, 40.23), ("阴山", 110.05, 40.95), ("五原", 108.27, 41.10),
        ("蓟城", 116.39, 39.90), ("幽州", 116.40, 39.91), ("燕京", 116.38, 39.89), ("涿郡", 115.97, 39.48),
        ("易州", 115.50, 39.35), ("渔阳", 117.40, 40.05), ("檀州", 116.84, 40.38), ("平州", 118.88, 39.88),
        ("右北平", 118.70, 40.95), ("辽西", 120.45, 41.58), ("营州", 120.45, 41.57), ("锦州", 121.13, 41.11),
        ("襄平", 123.17, 41.27), ("辽东", 123.18, 41.28), ("沈阳", 123.43, 41.80), ("玄菟", 124.95, 41.90),
        ("安东", 124.35, 40.00), ("扶余", 124.82, 45.18), ("上京", 126.97, 45.54), ("会宁府", 126.98, 45.55),
        ("乐浪", 125.75, 39.02), ("平壤", 125.76, 39.03), ("开京", 126.56, 37.97), ("汉城", 126.98, 37.57),
        // 河南・中原・山东・淮海
        ("洛阳", 112.45, 34.62), ("大梁", 114.31, 34.80), ("汴京", 114.32, 34.79), ("陈留", 114.51, 34.74),
        ("许昌", 113.85, 34.04), ("新郑", 113.74, 34.40), ("阳翟", 113.47, 34.16), ("宜阳", 112.18, 34.52),
        ("郑州", 113.65, 34.76), ("荥阳", 113.38, 34.79), ("虎牢", 113.20, 34.82), ("朝歌", 114.20, 35.61),
        ("怀州", 112.94, 35.09), ("孟州", 112.79, 34.91), ("陕州", 111.20, 34.77), ("滑州", 114.52, 35.58),
        ("濮阳", 115.03, 35.76), ("宋州", 115.65, 34.41), ("睢阳", 115.66, 34.42), ("陈州", 114.88, 33.73),
        ("蔡州", 114.36, 33.01), ("颍州", 115.81, 32.89), ("亳州", 115.78, 33.85), ("宿州", 116.96, 33.65),
        ("宛城", 112.53, 33.00), ("南阳", 112.52, 32.99), ("邓州", 112.09, 32.69), ("唐州", 112.83, 32.69),
        ("汝州", 112.84, 34.17), ("申州", 114.07, 32.13), ("光州", 115.05, 32.13),
        ("临淄", 118.31, 36.82), ("青州", 118.48, 36.69), ("即墨", 120.45, 36.39), ("胶东", 120.02, 36.86),
        ("登州", 120.76, 37.81), ("莱州", 119.94, 37.18), ("东阿", 116.25, 36.34), ("济北", 116.45, 36.29),
        ("济南", 117.00, 36.67), ("博昌", 118.12, 37.15), ("棣州", 117.50, 37.49), ("郓州", 116.46, 35.93),
        ("兖州", 116.83, 35.55), ("曲阜", 116.99, 35.60), ("曹州", 115.48, 35.23), ("濮州", 115.45, 35.75),
        ("密州", 119.40, 35.99), ("琅琊", 118.35, 35.05), ("沂州", 118.36, 35.06), ("徐州", 117.18, 34.26),
        ("彭城", 117.19, 34.27), ("下邳", 117.95, 34.12), ("海州", 119.16, 34.57), ("泗州", 118.50, 33.00),
        ("楚州", 119.14, 33.50), ("濠州", 117.56, 32.87), ("寿春", 116.78, 32.58), ("滁州", 118.32, 32.30),
        ("和州", 118.35, 31.74), ("庐州", 117.28, 31.86), ("合淝", 117.29, 31.87), ("濡须", 117.96, 31.48),
        ("舒州", 116.57, 30.63), ("广陵", 119.42, 32.39), ("扬州", 119.41, 32.40), ("泰州", 119.92, 32.46),
        // 荆楚・湖湘・江西・吴越・闽广・交趾・滇黔・吐蕃・西域
        ("襄阳", 112.14, 32.04), ("樊城", 112.14, 32.06), ("随州", 113.38, 31.69), ("安州", 113.69, 31.26),
        ("郢都", 112.19, 30.42), ("江陵", 112.24, 30.33), ("荆州", 112.23, 30.34), ("夷陵", 111.29, 30.70),
        ("归州", 110.97, 30.83), ("峡州", 111.30, 30.71), ("复州", 113.17, 30.66), ("江夏", 114.31, 30.54),
        ("夏口", 114.29, 30.56), ("鄂州", 114.89, 30.40), ("黄州", 114.87, 30.45), ("蕲州", 115.44, 30.03),
        ("岳州", 113.13, 29.37), ("朗州", 111.69, 29.03), ("武陵", 111.68, 29.04), ("澧州", 111.76, 29.63),
        ("长沙", 112.94, 28.23), ("潭州", 112.95, 28.22), ("衡州", 112.61, 26.89), ("邵州", 111.47, 27.24),
        ("永州", 111.61, 26.42), ("零陵", 111.62, 26.22), ("道州", 111.59, 25.53), ("郴州", 113.03, 25.79),
        ("桂阳", 112.73, 25.75), ("辰州", 110.40, 28.45),
        ("建业", 118.79, 32.06), ("金陵", 118.78, 32.05), ("润州", 119.45, 32.20), ("常州", 119.97, 31.81),
        ("姑苏", 120.62, 31.30), ("吴郡", 120.61, 31.31), ("苏州", 120.63, 31.30), ("松江", 121.23, 31.03),
        ("湖州", 120.09, 30.89), ("宣州", 118.76, 30.94), ("歙州", 118.43, 29.87), ("临安", 120.15, 30.28),
        ("杭州", 120.16, 30.27), ("会稽", 120.58, 30.00), ("越州", 120.59, 30.01), ("明州", 121.55, 29.87),
        ("台州", 121.12, 28.85), ("婺州", 119.65, 29.08), ("衢州", 118.87, 28.94), ("处州", 119.92, 28.45),
        ("温州", 120.70, 28.00), ("柴桑", 115.99, 29.71), ("江州九江", 115.98, 29.70), ("豫章", 115.86, 28.68),
        ("洪州", 115.87, 28.69), ("饶州", 116.67, 29.00), ("抚州", 116.36, 27.95), ("吉州", 114.99, 27.11),
        ("袁州", 114.39, 27.80), ("虔州", 114.93, 25.85),
        ("建安", 118.32, 27.04), ("福州", 119.30, 26.07), ("东冶", 119.31, 26.08), ("泉州", 118.68, 24.87),
        ("漳州", 117.65, 24.51), ("汀州", 116.36, 25.83), ("夷洲", 120.97, 23.80), ("淡水", 121.44, 25.17),
        ("潮州", 116.62, 23.66), ("循州", 114.42, 23.11), ("韶州", 113.60, 24.81), ("番禺", 113.26, 23.13),
        ("广州", 113.27, 23.12), ("端州", 112.46, 23.05), ("封州", 111.50, 23.43), ("梧州", 111.28, 23.48),
        ("桂林", 110.29, 25.27), ("柳州", 109.41, 24.33), ("藤州", 110.91, 23.38), ("容州", 110.55, 22.86),
        ("邕州", 108.37, 22.82), ("象郡", 108.35, 22.81), ("廉州", 109.20, 21.66), ("合浦", 109.21, 21.67),
        ("雷州", 110.10, 20.91), ("琼州", 110.35, 20.02), ("崖州", 109.17, 18.36), ("交趾", 105.85, 21.03),
        ("升龙", 105.84, 21.02), ("九真", 105.78, 19.81), ("日南", 107.59, 16.46),
        ("滇池", 102.71, 25.04), ("拓东", 102.72, 25.05), ("建宁", 103.80, 25.50), ("大理", 100.23, 25.60),
        ("太和城", 100.22, 25.59), ("永昌", 99.16, 25.11), ("蒙舍", 100.31, 25.23), ("夜郎", 106.71, 26.57),
        ("牂牁", 107.52, 26.26), ("逻些", 91.13, 29.65), ("日喀则", 88.88, 29.27), ("昌都", 97.17, 31.14),
        ("阿里", 80.10, 32.50), ("那曲", 92.05, 31.48), ("玉树", 97.01, 33.00), ("甘孜", 99.99, 31.62),
        ("安西", 82.96, 41.72), ("龟兹", 82.95, 41.71), ("疏勒", 75.99, 39.47), ("于阗", 79.93, 37.11),
        ("高昌", 89.53, 42.85), ("庭州", 89.18, 44.00), ("伊州", 93.51, 42.82), ("碎叶", 75.20, 42.80),
        ("头曼城", 109.84, 41.20), ("弹汗山", 114.20, 42.40), ("鄂尔浑", 102.84, 47.20), ("和林", 102.83, 47.21),
        ("斡难河", 111.50, 49.00), ("库伦", 106.91, 47.92), ("居延", 101.07, 42.00), ("阴山城", 111.67, 40.84),
    ]

    private static let sengokuJapanCities: [(name: String, lon: Double, lat: Double)] = [
        // 尾张・美浓・三河・远江・骏河・甲斐・信浓・越后・北陆
        ("清洲", 136.85, 35.21), ("那古野", 136.91, 35.18), ("犬山", 136.94, 35.38), ("津岛", 136.73, 35.18),
        ("稻叶山", 136.78, 35.43), ("岐阜", 136.76, 35.42), ("大垣", 136.61, 35.36), ("郡上八幡", 136.96, 35.75),
        ("高山", 137.25, 36.15), ("冈崎", 137.16, 34.95), ("吉田", 137.39, 34.77), ("滨松", 137.73, 34.71),
        ("挂川", 138.01, 34.77), ("曳马", 137.72, 34.72), ("骏府", 138.38, 34.98), ("沼津", 138.86, 35.10),
        ("韮山", 138.96, 35.05), ("踯躅崎馆", 138.58, 35.69), ("甲府", 138.57, 35.66), ("岩殿", 138.95, 35.62),
        ("诹访", 138.11, 36.04), ("高远", 138.06, 35.83), ("松本", 137.97, 36.24), ("上田", 138.25, 36.40),
        ("海津", 138.20, 36.56), ("小诸", 138.42, 36.33), ("饭田", 137.82, 35.51),
        ("春日山", 138.20, 37.14), ("直江津", 138.24, 37.17), ("新发田", 139.33, 37.95), ("长冈", 138.85, 37.45),
        ("村上", 139.48, 38.22), ("佐渡相川", 138.24, 38.04), ("富山", 137.21, 36.70), ("鱼津", 137.40, 36.82),
        ("七尾", 136.97, 37.04), ("金泽", 136.66, 36.56), ("小松", 136.45, 36.41), ("一乘谷", 136.30, 36.00),
        ("敦贺", 136.07, 35.65), ("小滨", 135.75, 35.50), ("北庄", 136.22, 36.06),
        // 关东・奥羽・虾夷
        ("小田原", 139.15, 35.25), ("镰仓", 139.55, 35.32), ("江户", 139.75, 35.69), ("川越", 139.49, 35.92),
        ("钵形", 139.20, 36.11), ("忍城", 139.45, 36.14), ("馆山", 139.87, 34.99), ("久留里", 140.08, 35.29),
        ("佐仓", 140.22, 35.72), ("古河", 139.70, 36.19), ("水户", 140.47, 36.37), ("太田", 140.53, 36.54),
        ("宇都宫", 139.88, 36.56), ("箕轮", 138.96, 36.40), ("厩桥", 139.06, 36.39), ("沼田", 139.04, 36.64),
        ("会津若松", 139.93, 37.49), ("白河", 140.21, 37.13), ("二本松", 140.43, 37.59), ("米泽", 140.11, 37.92),
        ("山形", 140.34, 38.25), ("庄内", 139.83, 38.73), ("酒田", 139.84, 38.91), ("仙台", 140.87, 38.27),
        ("岩出山", 140.87, 38.65), ("白石", 140.62, 38.00), ("石卷", 141.30, 38.43), ("盛冈", 141.15, 39.70),
        ("花卷", 141.12, 39.39), ("八户", 141.49, 40.51), ("弘前", 140.46, 40.60), ("浪冈", 140.59, 40.71),
        ("秋田", 140.10, 39.72), ("桧山", 140.08, 40.18), ("横手", 140.55, 39.31), ("松前", 140.11, 41.43),
        ("箱馆", 140.73, 41.77), ("札幌", 141.35, 43.06), ("旭川", 142.37, 43.77), ("钏路", 144.38, 42.98),
        // 畿内・近江・伊势・纪伊・丹波・播磨
        ("京都", 135.77, 35.01), ("二条", 135.75, 35.01), ("伏见", 135.77, 34.94), ("大坂", 135.53, 34.69),
        ("堺", 135.48, 34.57), ("岸和田", 135.37, 34.46), ("尼崎", 135.42, 34.72), ("伊丹", 135.41, 34.78),
        ("姬路", 134.69, 34.84), ("赤穗", 134.39, 34.75), ("三木", 134.99, 34.80), ("奈良", 135.83, 34.68),
        ("筒井", 135.78, 34.61), ("多闻山", 135.83, 34.69), ("高取", 135.83, 34.43), ("和歌山", 135.17, 34.23),
        ("杂贺", 135.15, 34.21), ("新宫", 135.99, 33.72), ("大津", 135.87, 35.00), ("观音寺", 136.16, 35.15),
        ("安土", 136.14, 35.16), ("小谷", 136.28, 35.46), ("长滨", 136.26, 35.38), ("津城", 136.51, 34.72),
        ("松坂", 136.53, 34.58), ("桑名", 136.69, 35.06), ("上野伊贺", 136.13, 34.77), ("龟山", 135.58, 35.01),
        ("福知山", 135.13, 35.30), ("宫津", 135.20, 35.53), ("竹田", 134.83, 35.30),
        // 中国地方・四国・九州
        ("鸟取", 134.24, 35.50), ("米子", 133.33, 35.43), ("月山富田", 133.19, 35.36), ("松江", 133.05, 35.47),
        ("津山", 134.00, 35.07), ("冈山", 133.93, 34.66), ("备中高松", 133.82, 34.69), ("福山", 133.36, 34.49),
        ("尾道", 133.20, 34.41), ("吉田郡山", 132.71, 34.67), ("广岛", 132.46, 34.39), ("严岛", 132.32, 34.30),
        ("岩国", 132.18, 34.17), ("山口", 131.47, 34.18), ("萩城", 131.38, 34.41), ("下关", 130.94, 33.96),
        ("德岛", 134.55, 34.07), ("胜瑞", 134.53, 34.13), ("高松", 134.05, 34.35), ("丸龟", 133.80, 34.29),
        ("松山", 132.77, 33.84), ("汤筑", 132.79, 33.85), ("宇和岛", 132.56, 33.22), ("今治", 133.00, 34.07),
        ("冈丰", 133.62, 33.60), ("高知", 133.53, 33.56), ("中村", 132.93, 32.99),
        ("博多", 130.40, 33.59), ("立花山", 130.47, 33.68), ("久留米", 130.51, 33.32), ("柳川", 130.40, 33.16),
        ("小仓", 130.88, 33.88), ("佐贺", 130.30, 33.26), ("平户", 129.55, 33.37), ("长崎", 129.87, 32.75),
        ("岛原", 130.37, 32.79), ("熊本", 130.71, 32.80), ("八代", 130.60, 32.51), ("人吉", 130.77, 32.21),
        ("府内", 131.61, 33.24), ("臼杵", 131.80, 33.12), ("中津", 131.19, 33.60), ("佐伯", 131.90, 32.96),
        ("延冈", 131.66, 32.58), ("佐土原", 131.47, 32.05), ("都城", 131.06, 31.72), ("鹿儿岛", 130.56, 31.60),
        ("内城", 130.57, 31.61), ("伊集院", 130.40, 31.63), ("对马", 129.29, 34.20), ("那霸", 127.68, 26.21),
    ]

    /// 在严格国界锁定的 `owners` 数组中，为每个历史国家选出最接近其都城坐标的所属州郡作为首都 seed。
    public static func pickSeedsForLockedOwners(
        scenario: HistoricalScenario,
        regions: [Regions.Region],
        owners: inout [Int],
        width: Double,
        height: Double
    ) -> [Int] {
        guard !regions.isEmpty, !scenario.nations.isEmpty else { return [] }
        let nationCount = min(scenario.nations.count, regions.count)
        var seeds = [Int](repeating: 0, count: nationCount)
        var usedSeeds = Set<Int>()
        for ni in 0..<nationCount {
            let spec = scenario.nations[ni]
            let cap = HistoricalBasemaps.project(lon: spec.capitalLon, lat: spec.capitalLat, region: scenario.region, width: width, height: height)
            var bestIdx = -1
            var bestD2 = Double.infinity
            // 第一优先：只在本国实际拥有的州郡内选择距都城坐标最近者
            for (ri, reg) in regions.enumerated() where owners.indices.contains(ri) && owners[ri] == ni && !usedSeeds.contains(ri) {
                let dx = reg.center.0 - cap.x, dy = reg.center.1 - cap.y
                let d2 = dx * dx + dy * dy
                if d2 < bestD2 { bestD2 = d2; bestIdx = ri }
            }
            // 防御兜底：若极端情形下该国未分得任何州，取距其都城最近的非首府州并改归该国
            if bestIdx < 0 {
                for (ri, reg) in regions.enumerated() where !usedSeeds.contains(ri) {
                    let dx = reg.center.0 - cap.x, dy = reg.center.1 - cap.y
                    let d2 = dx * dx + dy * dy
                    if d2 < bestD2 { bestD2 = d2; bestIdx = ri }
                }
                if bestIdx >= 0 && owners.indices.contains(bestIdx) {
                    owners[bestIdx] = ni
                }
            }
            if bestIdx < 0 {
                bestIdx = regions.indices.first(where: { !usedSeeds.contains($0) }) ?? 0
            }
            seeds[ni] = bestIdx
            usedSeeds.insert(bestIdx)
        }
        return seeds
    }

    /// 零假名真实地理命名引擎：
    /// 1) 各国首府州郡锁定史实都城名；
    /// 2) 距剧本自定义地理锚点 ≤ 2.5° 优先匹配锚点真实地名；
    /// 3) 按时代匹配 `ancientChinaCities` / `sengokuJapanCities` 或全球 4,200 城 `HistoricalBasemaps.globalCities()`；
    /// 4) 彻底杜绝任何「东/西/南/北/上/下」机械方位拼接假名！
    public static func assignProvinceNames(
        scenario: HistoricalScenario,
        regions: [Regions.Region],
        owners: [Int],
        seeds: [Int],
        width: Double,
        height: Double
    ) -> [String] {
        guard !regions.isEmpty else { return [] }
        let nationCount = min(scenario.nations.count, seeds.count)
        let activeSpecs = Array(scenario.nations.prefix(nationCount))
        let globalCities = HistoricalBasemaps.globalCities()

        var usedNames = Set<String>()
        var finalNames = [String](repeating: "", count: regions.count)
        var seedSet = Set<Int>()

        // 1. 反投影每个州郡中心到真实经纬度
        var provGeo = [(lon: Double, lat: Double)]()
        provGeo.reserveCapacity(regions.count)
        for reg in regions {
            provGeo.append(HistoricalBasemaps.unproject(x: reg.center.0, y: reg.center.1, region: scenario.region, width: width, height: height))
        }

        @inline(__always)
        func geoDist(_ lon1: Double, _ lat1: Double, _ lon2: Double, _ lat2: Double) -> Double {
            let midLat = (lat1 + lat2) * 0.5
            let cLat = max(0.25, cos(midLat * Double.pi / 180.0))
            let dx = (lon1 - lon2) * cLat
            let dy = lat1 - lat2
            return hypot(dx, dy)
        }

        // 2. 锁定全部各国都城原名
        for ni in 0..<nationCount {
            let s = seeds[ni]
            guard regions.indices.contains(s) else { continue }
            seedSet.insert(s)
            let cap = activeSpecs[ni].capitalName.trimmingCharacters(in: .whitespacesAndNewlines)
            if !cap.isEmpty && usedNames.insert(cap).inserted {
                finalNames[s] = cap
            }
        }

        // 3. 剧本自定义地理锚点匹配（距锚点 ≤ 2.5°，按由近及远分配，避免远州抢占近州真名）
        struct GeoAnchorEntry {
            let nationIndex: Int
            let lon: Double
            let lat: Double
            let name: String
        }
        var anchorEntries = [GeoAnchorEntry]()
        for (ni, spec) in activeSpecs.enumerated() {
            for a in spec.anchors {
                let nm = a.provinceName.trimmingCharacters(in: .whitespacesAndNewlines)
                if !nm.isEmpty {
                    anchorEntries.append(GeoAnchorEntry(nationIndex: ni, lon: a.lon, lat: a.lat, name: nm))
                }
            }
        }

        var anchorCandidates = [(ri: Int, name: String, dist: Double)]()
        for ri in regions.indices where finalNames[ri].isEmpty {
            let g = provGeo[ri]
            let own = owners.indices.contains(ri) ? owners[ri] : -1
            var bestName = ""
            var bestDist = Double.infinity
            for a in anchorEntries {
                let d = geoDist(g.lon, g.lat, a.lon, a.lat)
                // 本国锚点享有轻微优先（等价 −0.35°），保证同国名城优先落在本国境内
                let adj = a.nationIndex == own ? d : (d + 0.35)
                if d <= 2.5 && adj < bestDist {
                    bestDist = adj
                    bestName = a.name
                }
            }
            if !bestName.isEmpty {
                anchorCandidates.append((ri, bestName, bestDist))
            }
        }
        anchorCandidates.sort { a, b in a.dist != b.dist ? a.dist < b.dist : a.ri < b.ri }
        for cand in anchorCandidates where finalNames[cand.ri].isEmpty {
            if usedNames.insert(cand.name).inserted {
                finalNames[cand.ri] = cand.name
            }
        }

        // 4. 判定时代匹配词典（古代中国 / 日本战国 / 全球 4,200 真城库）
        let isAncientChina = ["zhanguo_260bce", "sanguo_208", "tang_755", "song_jin_1142"].contains(scenario.id)
            || (scenario.year < 1800 && (scenario.region == .china || scenario.region == .huaxia))
        let isSengokuJapan = scenario.id == "sengoku_1560"
            || (scenario.year < 1850 && scenario.region == .japanDetail)

        func pickNearestFromCurated(_ list: [(name: String, lon: Double, lat: Double)], lon: Double, lat: Double, maxDeg: Double) -> String? {
            var bestName: String? = nil
            var bestDist = maxDeg
            for item in list where !usedNames.contains(item.name) {
                let d = geoDist(lon, lat, item.lon, item.lat)
                if d < bestDist {
                    bestDist = d
                    bestName = item.name
                }
            }
            return bestName
        }

        func pickNearestGlobal(lon: Double, lat: Double) -> String? {
            guard !globalCities.isEmpty else { return nil }
            var bestName: String? = nil
            var bestScore = Double.infinity
            for c in globalCities {
                guard !c.n.isEmpty, !usedNames.contains(c.n) else { continue }
                let d = geoDist(lon, lat, c.lon, c.lat)
                let score: Double
                if d <= 6.0 {
                    // 6° 内对大都市/首都给予温和加权（≤ 0.24°），确保名城压过近郊小镇且绝不跨区抢名
                    let popBoost = max(0.0, log10(max(1000.0, c.pop)) - 3.0) * 0.045
                    let capBoost = c.cap > 0 ? 0.10 : 0.0
                    score = d - min(0.24, popBoost + capBoost)
                } else {
                    score = d
                }
                if score < bestScore {
                    bestScore = score
                    bestName = c.n
                }
            }
            return bestName
        }

        var extraByCulture = [String: [String]]()
        var allExtra = [String]()
        for entry in CreationNames.extraPlaces {
            extraByCulture[entry.culture] = entry.names
            allExtra.append(contentsOf: entry.names)
        }
        var extraCursor = [String: Int]()
        var allExtraCursor = 0

        // 逐州赋名（包含未锁定重名首都的兜底情况）
        for ri in regions.indices where finalNames[ri].isEmpty {
            let g = provGeo[ri]
            var picked: String? = nil

            if isAncientChina {
                picked = pickNearestFromCurated(ancientChinaCities, lon: g.lon, lat: g.lat, maxDeg: 3.8)
            } else if isSengokuJapan {
                picked = pickNearestFromCurated(sengokuJapanCities, lon: g.lon, lat: g.lat, maxDeg: 2.4)
            }

            if picked == nil {
                picked = pickNearestGlobal(lon: g.lon, lat: g.lat)
            }

            // 仅当离线 cities_zh.json 未加载（如独立单测未调用 loadAtlasDirectory）时使用真实历史地名词池回退，绝不拼接方位假名！
            if picked == nil && isAncientChina {
                picked = pickNearestFromCurated(ancientChinaCities, lon: g.lon, lat: g.lat, maxDeg: Double.infinity)
            }
            if picked == nil && isSengokuJapan {
                picked = pickNearestFromCurated(sengokuJapanCities, lon: g.lon, lat: g.lat, maxDeg: Double.infinity)
            }
            if picked == nil {
                let own = owners.indices.contains(ri) ? owners[ri] : 0
                let culture = activeSpecs.indices.contains(own) ? activeSpecs[own].culture : "chinese"
                if let pool = extraByCulture[culture] {
                    var idx = extraCursor[culture] ?? 0
                    while idx < pool.count {
                        let cand = pool[idx]; idx += 1
                        if !usedNames.contains(cand) { picked = cand; break }
                    }
                    extraCursor[culture] = idx
                }
            }
            if picked == nil {
                while allExtraCursor < allExtra.count {
                    let cand = allExtra[allExtraCursor]; allExtraCursor += 1
                    if !usedNames.contains(cand) { picked = cand; break }
                }
            }

            if let name = picked, usedNames.insert(name).inserted {
                finalNames[ri] = name
            } else {
                var n = ri + 1
                while !usedNames.insert("郡\(n)").inserted { n += 1 }
                finalNames[ri] = "郡\(n)"
            }
        }

        return finalNames
    }

    /// 兼容回退布局（用于无 `scenarios_gis.bin` 的玩家自绘历史剧本或单测）：按加权锚点归属国家并调用零假名地名引擎。
    public static func buildLayout(
        scenario: HistoricalScenario,
        regions: [Regions.Region],
        width: Double,
        height: Double
    ) -> (seeds: [Int], owners: [Int], provinceNames: [String]) {
        guard !regions.isEmpty, !scenario.nations.isEmpty else { return ([], [], []) }
        let nationCount = min(scenario.nations.count, regions.count)
        let activeSpecs = Array(scenario.nations.prefix(nationCount))

        var seeds = [Int](repeating: 0, count: nationCount)
        var usedSeeds = Set<Int>()
        var capitalCoords = [(Double, Double)]()
        capitalCoords.reserveCapacity(nationCount)

        for (ni, spec) in activeSpecs.enumerated() {
            let projected = HistoricalBasemaps.project(lon: spec.capitalLon, lat: spec.capitalLat, region: scenario.region, width: width, height: height)
            capitalCoords.append(projected)
            var bestIdx = -1
            var bestDistSq = Double.infinity
            for (ri, reg) in regions.enumerated() where !usedSeeds.contains(ri) {
                let dx = reg.center.0 - projected.0
                let dy = reg.center.1 - projected.1
                let d2 = dx * dx + dy * dy
                if d2 < bestDistSq {
                    bestDistSq = d2
                    bestIdx = ri
                }
            }
            if bestIdx < 0 {
                bestIdx = regions.indices.first(where: { !usedSeeds.contains($0) }) ?? 0
            }
            seeds[ni] = bestIdx
            usedSeeds.insert(bestIdx)
        }

        struct ProjectedAnchor {
            let nationIndex: Int
            let x: Double
            let y: Double
            let invWeightSq: Double
        }
        var allAnchors = [ProjectedAnchor]()
        allAnchors.reserveCapacity(nationCount * 8)
        for (ni, spec) in activeSpecs.enumerated() {
            let cap = capitalCoords[ni]
            let capWeight = 1.25
            allAnchors.append(ProjectedAnchor(nationIndex: ni, x: cap.0, y: cap.1, invWeightSq: 1.0 / (capWeight * capWeight)))
            for a in spec.anchors {
                let pt = HistoricalBasemaps.project(lon: a.lon, lat: a.lat, region: scenario.region, width: width, height: height)
                let w = max(0.2, a.weight)
                allAnchors.append(ProjectedAnchor(nationIndex: ni, x: pt.0, y: pt.1, invWeightSq: 1.0 / (w * w)))
            }
        }

        var seedToNation = [Int: Int]()
        for (ni, s) in seeds.enumerated() { seedToNation[s] = ni }

        var owners = [Int](repeating: 0, count: regions.count)
        for (ri, reg) in regions.enumerated() {
            if let ni = seedToNation[ri] {
                owners[ri] = ni
                continue
            }
            var bestNation = 0
            var bestScore = Double.infinity
            for anchor in allAnchors {
                let dx = reg.center.0 - anchor.x
                let dy = reg.center.1 - anchor.y
                let score = (dx * dx + dy * dy) * anchor.invWeightSq
                if score < bestScore {
                    bestScore = score
                    bestNation = anchor.nationIndex
                }
            }
            owners[ri] = bestNation
        }
        for (ni, s) in seeds.enumerated() { owners[s] = ni }

        let finalNames = assignProvinceNames(scenario: scenario, regions: regions, owners: owners, seeds: seeds, width: width, height: height)
        return (seeds, owners, finalNames)
    }

    // MARK: - 2. 整局历史设定覆写（纯净纪年、真实人口工业密度、国名政体、历史名臣名将注入、开局同盟与战事）

    /// 将历史剧本的真实设定覆写到新建的 `run` 中：
    /// 不提前采样回放第 0 帧；调用 `HistoricalRoster.apply` 注入真实名将内阁世家与舰队；重写开篇史册消除任何通用旧名。
    public static func applyOverrides(
        run r: JS,
        scenario: HistoricalScenario,
        provinceNames: [String],
        popDensities: [UInt8]? = nil,
        engine: DeclarationEngine? = nil,
        travel: CreationGeography.Graph? = nil
    ) {
        // 初始化 regimes 容器而不提前触发 ReplayEngine.capture（彻底根治回放第 0 帧错国 bug！）
        if r.regimes.isNull {
            let o = JS.object()
            o.nations = JS.object()
            o.month = JS(-1)
            r.regimes = o
        }
        r.regimes.enabled = JS(true)
        r.regimes.replay = .null

        // 若尚未初始化 offices47 骨架，预先准备以便 HistoricalRoster.apply 写入真实内阁与元帅
        if r.offices47.isNull {
            let books = JS.object()
            for n in r.world.nations.asArray {
                let b = JS.object()
                b.assignments = .array()
                b.reviewYear = JS(-1)
                books[n.id.asString] = b
            }
            let off = JS.object()
            off.version = JS(1)
            off.rule = JS("original-government-office-v1")
            off.revision = JS(0)
            off.wars = JS(1)
            off.nations = books
            r.offices47 = off
        }

        // 1. 世界标题、纯净历史时间时钟（calendar.era 置空，绝不把地图名塞进左上角时钟）、历史时代与叛乱模式
        if !r.world.isNull && !r.world.custom.isNull {
            r.world.custom.name = JS(scenario.title)
        }
        let yearOffset = scenario.year - 1
        let cal = JS.object()
        cal.era = JS("")
        cal.offset = JS(yearOffset)
        r.regimes.calendar = cal
        r.regimes.era = JS("")
        r.regimes.yearOffset = JS(yearOffset)
        r.regimes.historicalScenarioId = JS(scenario.id)
        r.regimes.historicalEra = JS(scenario.eraOverride ?? HistoricalEra.from(year: scenario.year).rawValue)
        if r.regimes.world.isNull { r.regimes.world = JS.object() }
        let rebelMode = scenario.rebelMode ?? "historical"
        r.regimes.world.rebelMode = JS(rebelMode)
        if rebelMode == "off" {
            r.regimes.world.rebel = JS(0)
        }
        r.regimes.namesVaried = JS(true)
        r.regimes.distinctColors = JS(true)
        r.regimes.faithReady = JS(true)
        if r.regimes.faith.isNull { r.regimes.faith = JS.object() }
        if r.regimes.style.isNull { r.regimes.style = JS.object() }

        // 2. 覆写全部州郡与城池的真实历史地名 + 真实 GIS 人口/工业密度缩放
        let provinces = r.world.provinces.asArray
        let cities = r.world.cities.asArray
        var cityByProvince = [String: JS]()
        for c in cities {
            if let pid = c.provinceId.optionalString { cityByProvince[pid] = c }
        }
        var statecraftByPid = [String: JS]()
        if !r.world.statecraft.isNull && !r.world.statecraft.provinces.isNull {
            for sp in r.world.statecraft.provinces.asArray {
                if let pid = sp.provinceId.optionalString { statecraftByPid[pid] = sp }
            }
        }
        for (i, p) in provinces.enumerated() {
            let pid = p.id.asString
            if i < provinceNames.count {
                let pname = provinceNames[i]
                if !pname.isEmpty {
                    p.name = JS(pname)
                    let city: JS? = (i < cities.count && cities[i].provinceId.optionalString == p.id.optionalString)
                        ? cities[i]
                        : cityByProvince[pid]
                    if let city {
                        city.name = JS(pname)
                        let cid = city.id.asString
                        let civCity = r.civilization.cities[cid]
                        if !civCity.isNull {
                            civCity.name.value = JS(pname)
                            civCity.name.custom = JS(pname)
                        }
                    }
                }
            }
            if let densities = popDensities, i < densities.count {
                let d = Double(max(10, Int(densities[i])))
                let factor = 0.22 + pow(d / 128.0, 1.35) * 1.15
                var maxCap = 60_000.0
                if !r.finance.isNull && !r.finance.provinces.isNull && !r.finance.provinces[pid].isNull {
                    let oldMax = max(5000.0, r.finance.provinces[pid].maxPopulation.optionalNumber ?? 40_000.0)
                    maxCap = max(4000.0, (oldMax * factor).rounded())
                    r.finance.provinces[pid].maxPopulation = JS(maxCap)
                }
                if let sp = statecraftByPid[pid] {
                    let oldPop = max(3000.0, sp.population.optionalNumber ?? 25_000.0)
                    let scaledPop = min(maxCap, max(2500.0, (oldPop * factor).rounded()))
                    sp.population = JS(scaledPop)
                    sp.grain = JS((scaledPop * 20.0).rounded())
                    if !r.governmentOpening.isNull && !r.governmentOpening.population.isNull {
                        r.governmentOpening.population[pid] = JS(scaledPop)
                    }
                }
            }
        }

        // 3. 逐国覆写国名、配色、文化、宗教、政体细分与基础领袖
        let nations = r.world.nations.asArray
        let validCultures = Set(NativeCreation.cultureIds)

        for (i, n) in nations.enumerated() where i < scenario.nations.count {
            let spec = scenario.nations[i]
            let nid = n.id.asString

            let resolvedStyle = Regimes.styles.first(where: { $0.id == spec.style && Regimes.styleProfiles[$0.id] != nil })
                ?? Regimes.styles.first(where: { $0.id == spec.style })
                ?? Regimes.styles.first(where: { $0.base == spec.polity })
                ?? Regimes.styles[0]
            let validPolity = resolvedStyle.base
            let validCulture = validCultures.contains(spec.culture) ? spec.culture : "chinese"
            let validReligion = Regimes.creeds[spec.religion] != nil ? spec.religion : "confucian"

            n.name = JS(spec.name)
            n.color = JS(spec.color)

            let civN = r.civilization.nations[nid]
            if !civN.isNull {
                let shortVal = spec.shortName.isEmpty ? spec.name : spec.shortName
                civN.name.value = JS(shortVal)
                civN.name.custom = JS(spec.name)
                civN.cultureId = JS(validCulture)
                civN.religionId = JS(validReligion)
                civN.polity = JS(validPolity)
            }
            if !r.upperCombat.isNull && !r.upperCombat.nations[nid].isNull {
                r.upperCombat.nations[nid].polity = JS(validPolity)
            }

            let book = Regimes.book(r, nid)
            book.style = JS(resolvedStyle.id)
            book.history = .array([JS(validPolity)])
            book.empires = JS(validPolity == "Empire" ? 1 : 0)
            book.parties = .null
            r.regimes.style[nid] = JS(resolvedStyle.id)

            // v9.0.0：按历史时代与国情预置真实开局国策与法案（二战/一战/冷战采用 HOI4 经济/征兵/贸易/治理法案与国家专项国策）
            let scEra = HistoricalEra(rawValue: scenario.eraOverride ?? "") ?? HistoricalEra.from(year: scenario.year)
            if Regimes.isModernEra(scEra) {
                let openingLaws = Self.openingModernLaws(scenarioId: scenario.id, spec: spec, era: scEra)
                book.reforms = .array(openingLaws.map { JS($0) })
            }

            for p in provinces where p.controller.optionalString == nid {
                let pid = p.id.asString
                r.regimes.faith[pid] = JS(validReligion)
                if !r.sovereignty.isNull && !r.sovereignty.provinces[pid].isNull {
                    r.sovereignty.provinces[pid].mapCultureId = JS(validCulture)
                }
                if let city = cityByProvince[pid] {
                    let civCity = r.civilization.cities[city.id.asString]
                    if !civCity.isNull { civCity.cultureId = JS(validCulture) }
                }
            }

            if !r.nobility.isNull && !r.nobility.families.isNull {
                for (fkey, fam) in r.nobility.families.objectEntries where fam.nationId.optionalString == nid {
                    fam.religionId = JS(validReligion)
                    let kfam = r.kin.families[fkey]
                    if !kfam.isNull {
                        kfam.cultureName = JS(validCulture)
                        for m in People.ids(kfam.memberIds) {
                            if let person = People.person(r, m) {
                                person.cultureName = JS(validCulture)
                                person.religionId = JS(validReligion)
                            }
                        }
                    }
                }
            }

            applyRulerOverride(
                run: r,
                nationId: nid,
                spec: spec,
                scenario: scenario,
                culture: validCulture,
                religion: validReligion,
                polity: validPolity
            )
        }

        // 4. 同步开局军团番号与初始水师母港名
        var provinceNameById = [String: String]()
        for p in provinces { provinceNameById[p.id.asString] = p.name.asString }
        for army in r.world.armies.asArray where army.troops.asNumber > 0 && army.status.asString != "destroyed" {
            let aid = army.id.asString
            let homeId = r.tactics.forces[aid].homeId.optionalString ?? army.provinceId.asString
            if let pname = provinceNameById[homeId], !pname.isEmpty {
                let unitKey = r.units[aid].optionalString ?? "Infantry"
                let unitName = UnitKinds.byKey[unitKey]?.name ?? UnitKinds.name(unitKey)
                army.name = JS("\(pname)\(unitName)")
            }
        }
        if !r.navy.isNull && !r.navy.fleets.isNull && !r.harbors.isNull && !r.harbors.sites.isNull {
            var harborProvById = [String: String]()
            for site in r.harbors.sites.asArray {
                if let sid = site.id.optionalString, let pid = site.provinceId.optionalString {
                    harborProvById[sid] = pid
                }
            }
            for fl in r.navy.fleets.asArray {
                if let dockId = fl.dockId.optionalString,
                   let pid = harborProvById[dockId],
                   let pname = provinceNameById[pid], !pname.isEmpty {
                    fl.name = JS("\(pname)港水师")
                }
            }
        }

        // 5. 注入史实名君年龄保护、历史顺位继承人、名将元帅/海军上将/内阁大臣、政党世家、时代科技、工业产能与主力舰队
        HistoricalRoster.apply(run: r, scenarioId: scenario.id)

        // 5.5 v10.0.0：按真实历史编制与战略要冲重部署开局常备军（彻底废除按省份数 2/3 在西伯利亚/荒原无脑爆兵的痼疾！）
        deployHistoricalStartingArmies(run: r, scenario: scenario, popDensities: popDensities, travel: travel)

        // 6. 覆写全部开篇史册条目与开局系统事件，确保彻底清除 Creation.base 遗留的随机旧国名与旧君主名
        rewriteOpeningChronicle(run: r, scenario: scenario)

        // 7. 兼容旧调用方（显式传入 engine 时即时缔结开局同盟与战事；NativeCreation 流程中由 applyDiplomacy 在建好 statics 后调用）
        if let engine {
            applyDiplomacy(run: r, scenario: scenario, engine: engine)
        }

        // 8. 写入世家开局关系，并确保回放箱保持清空等待开局最终首帧采集
        FamilyPolitics.seedOpeningRelations(r, seed: r.world.custom.seed.optionalString ?? scenario.id)
        r.regimes.replay = .null
    }

    /// v10.0.0：历史剧本真实开局兵力编制与前线战略部署器。
    /// - 数量依据 `HistoricalPowerSpec.startingArmies`（或由工业/科技/动员推导的真实编制），彻底告别苏联/广土大国按省份数在西伯利亚/青藏荒原狂刷几十支军的荒谬现象；
    /// - 部署点严格按战略价值排序：交战前线 > 非盟友边境 > 首都 > 稠密核心都会/港口，对低密度荒原（popDensity < 38）施加 −110 惩罚，确保精锐全部驻防关键战线与枢纽！
    private static func deployHistoricalStartingArmies(
        run r: JS,
        scenario: HistoricalScenario,
        popDensities: [UInt8]?,
        travel: CreationGeography.Graph?
    ) {
        let provinces = r.world.provinces.asArray
        let nations = r.world.nations.asArray
        guard !provinces.isEmpty, !nations.isEmpty else { return }

        var specIdByNationId = [String: String]()
        var nationIdBySpecId = [String: String]()
        var capitalNameByNationId = [String: String]()
        for (i, n) in nations.enumerated() where i < scenario.nations.count {
            let nid = n.id.asString
            let sid = scenario.nations[i].id
            specIdByNationId[nid] = sid
            nationIdBySpecId[sid] = nid
            capitalNameByNationId[nid] = scenario.nations[i].capitalName
        }

        var warEnemies = [String: Set<String>]()
        for w in scenario.openingWars {
            if let a = nationIdBySpecId[w.attackerId], let b = nationIdBySpecId[w.defenderId] {
                warEnemies[a, default: []].insert(b)
                warEnemies[b, default: []].insert(a)
            }
        }
        var openingAllies = [String: Set<String>]()
        for al in scenario.openingAlliances {
            let mids = al.memberIds.compactMap { nationIdBySpecId[$0] }
            for a in mids {
                for b in mids where a != b {
                    openingAllies[a, default: []].insert(b)
                }
            }
        }

        var provIndexById = [String: Int](minimumCapacity: provinces.count)
        var provById = [String: JS](minimumCapacity: provinces.count)
        var densityByPid = [String: Int](minimumCapacity: provinces.count)
        for (i, p) in provinces.enumerated() {
            let pid = p.id.asString
            provIndexById[pid] = i
            provById[pid] = p
            densityByPid[pid] = (popDensities != nil && i < (popDensities?.count ?? 0)) ? Int(popDensities![i]) : 85
        }
        var harborPids = Set<String>()
        if !r.harbors.isNull && !r.harbors.sites.isNull {
            for site in r.harbors.sites.asArray {
                if let pid = site.provinceId.optionalString { harborPids.insert(pid) }
            }
        }
        var capitalPidByNation = [String: String]()
        for c in r.world.cities.asArray {
            if c.isCapital.isTruthy, let nid = c.nationId.optionalString, let pid = c.provinceId.optionalString {
                capitalPidByNation[nid] = pid
            }
        }
        var cityNameByPid = [String: String]()
        for c in r.world.cities.asArray {
            if let pid = c.provinceId.optionalString, let nm = c.name.optionalString, !nm.isEmpty {
                cityNameByPid[pid] = nm
            }
        }
        var scByPid = [String: JS]()
        for sp in r.world.statecraft.provinces.asArray {
            if let pid = sp.provinceId.optionalString { scByPid[pid] = sp }
        }
        let sortedPops = r.world.statecraft.provinces.asArray.map(\.population.asNumber).sorted()
        let medPop: Double = {
            guard !sortedPops.isEmpty else { return 10_000 }
            let mid = sortedPops.count >> 1
            return sortedPops.count % 2 == 1 ? sortedPops[mid] : (sortedPops[mid - 1] + sortedPops[mid]) / 2
        }()

        // 保留既有 armyPositions 中已知的 provinceId -> travelCell 映射（当外部单测未传 travel 时仍可无缝复用）
        var knownCellByPid = [String: Int]()
        if !r.armyPositions.isNull && !r.armyPositions.records.isNull {
            for a in r.world.armies.asArray {
                let aid = a.id.asString
                let pid = a.provinceId.asString
                if knownCellByPid[pid] == nil, let node = r.armyPositions.records[aid].nodes[0].optionalNumber {
                    knownCellByPid[pid] = Int(node)
                }
            }
        }

        // 清空 OpeningGovernment 按领土 2/3 暴力铺开的旧军队与附属账本，重新按史实编制精准驻防
        r.world.armies = .array()
        r.units = .object()
        r.tactics.forces = .object()
        r.forceSpeed.armies = .object()
        r.combatPersonnel.armies = .object()
        r.armyAutonomy.armies = .object()
        r.upperCombat.armies = .object()
        if !r.armyPositions.isNull { r.armyPositions.records = .object() }

        let era = HistoricalEra.current(r)
        let seed = r.world.custom.seed.optionalString ?? scenario.id
        let tick = r.clock.tick.asInt
        var nextId = 1

        for n in nations {
            let nid = n.id.asString
            let owned = provinces.filter { $0.controller.optionalString == nid && $0.legalOwner.optionalString == nid }
            guard !owned.isEmpty else { continue }

            let hp = r.regimes.historicalPower.isNull ? JS.null : r.regimes.historicalPower[nid]
            let indIdx = hp.industryIndex.optionalNumber ?? 1.0
            let mpScale = hp.manpowerScale.optionalNumber ?? 1.0
            let techMil = Int(hp.techMil.optionalNumber ?? 3.0)
            let warSupport = hp.warSupport.optionalNumber ?? 60.0

            let targetArmies: Int = {
                if let explicit = hp.startingArmies.optionalNumber, explicit >= 1 {
                    return max(1, min(26, Int(explicit.rounded())))
                }
                let maxCap = hp.maxArmies.optionalNumber.map { Int($0.rounded()) }
                    ?? max(3, min(28, Int((3.5 + indIdx * 4.5 + mpScale * 3.0 + Double(techMil) * 0.7).rounded())))
                let ratio = max(0.32, min(0.68, 0.44 + (warSupport - 55.0) / 220.0))
                let raw = max(1, Int((Double(maxCap) * ratio).rounded()))
                return max(1, min(22, min(raw, max(2, owned.count * 2))))
            }()

            let capPid = capitalPidByNation[nid] ?? owned.first(where: { $0.name.optionalString == capitalNameByNationId[nid] })?.id.asString ?? owned[0].id.asString
            let enemies = warEnemies[nid] ?? []
            let allies = openingAllies[nid] ?? []
            let culture = r.civilization.isNull ? "" : (r.civilization.nations[nid].cultureId.optionalString ?? "")
            let cavalry = Armies.stateTraits(r, nid).contains("CavalryTradition")
            let dTraits = Armies.damageTraits(r, nid)

            // 逐州战略权重评分：前线敌境 > 潜在敌对边境 > 首都 > 稠密工业核心/军港；低密度寒漠荒原重罚（禁止把兵撒进西伯利亚！）
            var scored = [(prov: JS, pid: String, score: Double, isWilderness: Bool)]()
            scored.reserveCapacity(owned.count)
            for p in owned {
                let pid = p.id.asString
                let dens = densityByPid[pid] ?? 85
                var sc = Double(dens) * 0.28
                let isCap = (pid == capPid)
                if isCap { sc += 82.0 }
                var bordersWar = false
                var bordersForeign = false
                for nb in p.neighbors.asArray {
                    guard let np = provById[nb.asString], let other = np.controller.optionalString, other != nid else { continue }
                    if enemies.contains(other) { bordersWar = true }
                    else if !allies.contains(other) { bordersForeign = true }
                }
                if bordersWar { sc += 145.0 }
                else if bordersForeign { sc += 56.0 }
                if harborPids.contains(pid) { sc += 22.0 }
                let isWild = (dens < 40 && !bordersWar && !isCap)
                if isWild { sc -= 120.0 }
                scored.append((p, pid, sc, isWild))
            }
            scored.sort { a, b in a.score != b.score ? a.score > b.score : a.pid < b.pid }

            // 过滤掉纯荒原备选（除非该国全部领土皆为荒原），允许在战略热点最多叠防 3 支主力军团
            let strategicPool = scored.filter { !$0.isWilderness }
            let pool = strategicPool.isEmpty ? scored : strategicPool
            var assignedCount = [String: Int]()
            var picks = [JS]()
            picks.reserveCapacity(targetArmies)
            var cursor = 0
            while picks.count < targetArmies {
                let cand = pool[cursor % pool.count]
                let used = assignedCount[cand.pid] ?? 0
                let maxStack = (cursor < pool.count) ? 1 : (cand.score >= 120 ? 3 : 2)
                if used < maxStack || cursor >= pool.count * 3 {
                    picks.append(cand.prov)
                    assignedCount[cand.pid] = used + 1
                }
                cursor += 1
                if cursor > targetArmies * 8 + pool.count * 4 { break }
            }

            for prov in picks {
                let pid = prov.id.asString
                let armyId = "force-\(nextId)"
                nextId += 1

                let pop = scByPid[pid]?.population.optionalNumber ?? medPop
                let baseStr = Muster.legionStrength(pop, median: medPop)
                let densityFactor = max(0.55, min(1.30, 0.72 + (pop / max(1.0, medPop)) * 0.28))
                let strMult = max(0.55, min(2.25, indIdx.squareRoot() * mpScale * (0.65 + 0.35 * densityFactor)))
                let troops = max(800, Int((Double(baseStr) * strMult / 100.0).rounded() * 100.0))

                let uk = UnitKinds.pickForEra(era, culture: culture, id: armyId)
                let uName = Regimes.unitName(r, nid, uk)
                Regimes.noteExtraUnit(r, army: armyId, uk)
                let branchInfo = Regimes.assignArmyBranchAndName(r, nation: nid, armyId: armyId, home: pid, unitKey: uk.key, unitName: uName, kind: "regular")
                let finalName = branchInfo.name.isEmpty ? ((cityNameByPid[pid] ?? prov.name.asString) + uName) : branchInfo.name

                let a = JS.object()
                a.id = JS(armyId); a.name = JS(finalName); a.nationId = JS(nid); a.provinceId = JS(pid); a.originId = JS(pid)
                a.troops = JS(troops); a.morale = JS(min(98.0, 76.0 + (warSupport - 50.0) * 0.30)); a.supplies = JS(100)
                a.status = JS("idle"); a.route = .array(); a.progress = JS(0)
                r.world.armies.push(a)
                r.units[armyId] = JS(uk.key)

                let force = JS.object()
                force.homeId = JS(pid); force.kind = JS("regular"); force.fullStrength = JS(troops)
                r.tactics.forces[armyId] = force

                let sp = JS.object()
                sp.nationAtInitialization = JS(nid); sp.initializedTick = JS(tick); sp.cavalryTradition = JS(cavalry)
                sp.base = JS(Armies.speed(seed: seed, armyId: armyId, nationId: nid, tick: tick, cavalry: cavalry))
                r.forceSpeed.armies[armyId] = sp

                let cp = JS.object()
                cp.nationAtInitialization = JS(nid); cp.initializedTick = JS(tick); cp.command = JS("central")
                cp.damageTraitsAtInitialization = .array(dTraits.map { JS($0) })
                cp.damageToArmy = JS(Native.fr((dTraits.contains("FieldCombatElite") ? Native.fr(1.5) : 1) * 40))
                cp.damageToProvince = JS(Native.fr((dTraits.contains("SiegeCapture") ? Native.fr(1.5) : 1) * 10))
                r.combatPersonnel.armies[armyId] = cp

                let dec = JS.object()
                dec.targetId = .null; dec.garrisonId = .null; dec.campaignId = .null; dec.decision = JS("waiting")
                dec.nextTick = JS(0); dec.issuedTick = .null; dec.reason = JS("等待自主军令评估。")
                r.armyAutonomy.armies[armyId] = dec

                let up = JS.object()
                up.base = JS(Native.fr(Native.fr(1) * 1.25)); up.initializedTick = JS(tick)
                r.upperCombat.armies[armyId] = up

                if travel == nil, !r.armyPositions.isNull, let cellId = knownCellByPid[pid] ?? knownCellByPid.values.first {
                    let tr = JS.object()
                    tr.version = JS(1); tr.armyId = JS(armyId); tr.origin = prov.center.clone()
                    tr.nodes = .array([JS(cellId)]); tr.leg = JS(0); tr.offset = JS(0); tr.crossed = JS(false); tr.status = JS("arrived")
                    r.armyPositions.records[armyId] = tr
                }
            }
        }
        r.tactics.nextArmyId = JS(nextId)
        if let travel, !r.armyPositions.isNull {
            let binding = r.armyPositions.binding.optionalString ?? ""
            r.armyPositions = CreationGeography.armyPositions(r, graph: travel, binding: binding)
        }
    }

    /// v9.0.0：为一战/二战/冷战剧本的真实国家预置开局 HOI4 级经济动员、征兵、贸易、治理体制与国家专属专项国策。
    private static func openingModernLaws(scenarioId: String, spec: HistoricalNationSpec, era: HistoricalEra) -> [String] {
        let sid = spec.id
        let is1939 = scenarioId == "ww2_europe_1939"
        let is1941 = scenarioId == "ww2_asia_1941"
        let is1936 = scenarioId == "ww2_eve_1936"
        let is1914 = scenarioId == "ww1_1914"
        let is1950 = scenarioId == "coldwar_1950"

        var laws = [String]()
        // 1. 经济动员法案
        if (is1939 && ["germany", "poland", "uk", "france"].contains(sid))
            || (is1941 && ["japan", "roc", "yanan", "manchukuo"].contains(sid))
            || (is1914 && ["germany", "austria_hungary", "france", "russia", "britain", "serbia", "belgium", "ottoman"].contains(sid)) {
            laws.append("econ_war")
        } else if (is1936 && ["germany", "ussr", "italy"].contains(sid))
            || ["ussr", "ussr_fe", "prc", "usa_pacific", "philippines", "uk_burma", "uk_malaya", "dutch_ei", "northeast"].contains(sid)
            || (scenarioId == "china_1931" && ["roc", "cpc", "japan", "northeast"].contains(sid)) {
            laws.append("econ_partial")
        } else {
            laws.append("econ_civilian")
        }

        // 2. 现代征兵法案
        if ["germany", "ussr", "ussr_fe", "japan", "roc", "yanan", "cpc", "prc", "poland", "france", "austria_hungary", "russia", "serbia"].contains(sid) && !is1936 {
            laws.append("draft_extensive")
        } else if ["uk", "britain", "usa", "usa_pacific", "sweden", "switzerland", "ireland", "portugal"].contains(sid) && !is1914 {
            laws.append(is1939 || is1941 ? "draft_limited" : "draft_volunteer")
        } else {
            laws.append("draft_limited")
        }

        // 3. 贸易路线
        if ["germany", "ussr", "ussr_fe", "japan", "italy", "prc", "warsaw_east", "manchukuo"].contains(sid) {
            laws.append("trade_autarky")
        } else if ["uk", "britain", "usa", "usa_pacific", "netherlands", "dutch_ei", "uk_malaya", "sweden", "switzerland", "belgium"].contains(sid) {
            laws.append("trade_free")
        } else {
            laws.append("trade_export")
        }

        // 4. 国家治理体制
        if spec.style == "communist" || spec.style == "socialist" {
            laws.append("gov_planned")
        } else if ["nazi", "fascist", "dictatorship", "junta", "warlord", "regency"].contains(spec.style) || sid == "japan" {
            laws.append("gov_wartime_ctrl")
        } else {
            laws.append("gov_const_parl")
        }

        // 5. 国家专属 HOI4 专项国策
        switch sid {
        case "germany":
            laws.append("focus_four_year")
            if !is1914 { laws.append("focus_blitz_armored") }
        case "ussr", "ussr_fe":
            laws.append("focus_five_year")
            if is1950 { laws.append("focus_atomic_proj") }
        case "uk", "britain":
            if !is1914 { laws.append("focus_radar_airdef") }
            laws.append("focus_carrier_fleet")
        case "usa", "usa_pacific":
            laws.append("focus_lend_lease")
            laws.append("focus_carrier_fleet")
            if is1950 { laws.append("focus_atomic_proj") }
        case "japan":
            laws.append("focus_carrier_fleet")
            laws.append("focus_four_year")
        case "roc", "yanan", "cpc", "prc":
            laws.append("focus_people_war")
            if is1950 { laws.append("focus_five_year") }
        case "france":
            laws.append("focus_radar_airdef")
        case "finland", "switzerland", "greece", "poland", "yugoslavia":
            laws.append("focus_people_war")
        default:
            break
        }
        return laws
    }

    /// 缔结历史剧本的开局同盟、宗属与开局战事，并初始化 v8.0.0 历史路线/事件链/军事学说与实装将领。
    public static func applyDiplomacy(
        run r: JS,
        scenario: HistoricalScenario,
        engine: DeclarationEngine?,
        route: String = "historical"
    ) {
        let nations = r.world.nations.asArray
        var specIdToNationId = [String: String]()
        for (i, n) in nations.enumerated() where i < scenario.nations.count {
            specIdToNationId[scenario.nations[i].id] = n.id.asString
        }
        HistoricalEvents.initScenario(r, scenario: scenario, route: route, specIdToNationId: specIdToNationId)
        applyOpeningAlliances(run: r, scenario: scenario, specIdToNationId: specIdToNationId, locked: route != "sandbox")
        applyOpeningVassals(run: r, scenario: scenario, specIdToNationId: specIdToNationId)
        applyOpeningWars(run: r, scenario: scenario, specIdToNationId: specIdToNationId, engine: engine ?? Session.engine)
        MilitaryDoctrines.assignHistoricalCommanders(r)
    }

    private static func applyOpeningVassals(
        run r: JS,
        scenario: HistoricalScenario,
        specIdToNationId: [String: String]
    ) {
        guard let list = scenario.openingVassals, !list.isEmpty else { return }
        if r.vassals.isNull {
            let v = JS.object()
            v.version = JS(1); v.revision = JS(0); v.enabled = JS(true)
            v.originTime = r.life.gameTime.clone(); v.originTick = r.clock.tick.clone()
            v.records = .array()
            r.vassals = v
        }
        let now = JS(Native.fr(r.life.gameTime.asNumber))
        for spec in list {
            guard let lordId = specIdToNationId[spec.overlordId],
                  let vassalId = specIdToNationId[spec.vassalId],
                  lordId != vassalId,
                  Vassals.overlord(r, vassalId) == nil else { continue }
            let rec = JS.object()
            rec.overlordId = JS(lordId)
            rec.vassalId = JS(vassalId)
            rec.tributeRate = JS(max(0.05, min(0.35, spec.tributeRate)))
            rec.time = now.clone()
            rec.tick = r.clock.tick.clone()
            rec.updateDay = JS(1)
            rec.endedTick = .null
            rec.endReason = .null
            r.vassals.records.push(rec)
            Vassals.bump(r.vassals)
            DiplomacyDeep.adjustOpinionMod(r, lordId, vassalId, delta: 25)
        }
    }

    /// 在全部历史覆写与 `HistoricalRoster.apply` 完成后，统一重写开篇登基史册与开局事件，彻底消除随机旧名。
    private static func rewriteOpeningChronicle(run r: JS, scenario: HistoricalScenario) {
        let nations = r.world.nations.asArray
        var nationNameById = [String: String]()
        var specByNationId = [String: HistoricalNationSpec]()
        for (i, n) in nations.enumerated() {
            let nid = n.id.asString
            nationNameById[nid] = n.name.asString
            if i < scenario.nations.count { specByNationId[nid] = scenario.nations[i] }
        }

        if !r.chronicle.isNull && !r.chronicle.entries.isNull {
            for entry in r.chronicle.entries.asArray where entry.kind.optionalString == "accession" {
                guard let nid = entry.nationIds.asArray.first?.optionalString,
                      let nationName = nationNameById[nid] else { continue }
                let spec = specByNationId[nid]
                var rulerName = spec?.rulerName ?? ""
                var rulerTitle = spec?.rulerTitle ?? ""
                var rulerId = "ruler-\(nid)-1"
                var regnal = ""
                if !r.chronicle.leaders[nid].isNull && r.chronicle.leaders[nid].length > 0 {
                    let lead = r.chronicle.leaders[nid][0]
                    if let lid = lead.id.optionalString, !lid.isEmpty { rulerId = lid }
                    if let nm = lead.name.optionalString, !nm.isEmpty { rulerName = nm }
                    if let rg = lead.regnalName.optionalString, !rg.isEmpty { regnal = rg }
                }
                let civRuler = r.civilization.rulers[rulerId]
                if !civRuler.isNull {
                    if let t = civRuler.titleAtAccession.optionalString, !t.isEmpty { rulerTitle = t }
                    if rulerName.isEmpty, let nm = civRuler.name.optionalString { rulerName = nm }
                    if regnal.isEmpty, let g = civRuler.given.optionalString { regnal = g }
                }
                if !rulerName.isEmpty {
                    let titlePrefix = rulerTitle.isEmpty ? "" : rulerTitle
                    entry.text = JS("\(nationName)开篇：\(titlePrefix)\(rulerName)主政（\(scenario.yearDisplayText)）")
                    entry.reason = JS("历史剧本「\(scenario.title)」开局设定：按真实历史疆界、政体与史实人物开局推演。")
                    for p in entry.people.asArray {
                        p.name = JS(rulerName)
                        if !regnal.isEmpty { p.regnalName = JS(regnal) }
                    }
                }
            }
        }

        // 清理 Creation.base / OpeningGovernment / CreationForces 留下的旧随机名开局事件，写入干净的历史开篇纪事
        if !r.world.isNull && !r.world.events.isNull {
            let e = JS.object()
            e.id = JS(1)
            e.day = JS(0)
            e.kind = JS("system")
            e.text = JS("历史剧本「\(scenario.title)」开局（\(scenario.yearDisplayText)）")
            e.reason = JS(scenario.description)
            r.world.events = .array([e])
            r.world.nextEventId = JS(2)
        }
    }

    private static func splitRulerName(_ fullName: String, culture: String) -> (given: String, house: String) {
        let trimmed = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return ("无名", "") }
        if trimmed.contains("·") {
            let parts = trimmed.split(separator: "·", omittingEmptySubsequences: true).map(String.init)
            if parts.count >= 2 {
                if ["hungarian", "mongol", "turkic", "tibetan"].contains(culture) {
                    return (parts.dropFirst().joined(separator: "·"), parts[0])
                }
                return (parts.dropLast().joined(separator: "·"), parts.last ?? "")
            }
        }
        if culture == "japanese" {
            if trimmed.contains("天皇") { return (trimmed, "") }
            let longClans = ["长宗我部", "宇喜多", "小早川"]
            for c in longClans where trimmed.hasPrefix(c) && trimmed.count > c.count {
                return (String(trimmed.dropFirst(c.count)), c)
            }
            if trimmed.count >= 3 {
                return (String(trimmed.dropFirst(2)), String(trimmed.prefix(2)))
            }
        }
        if culture == "chinese" || culture == "korean" || culture == "vietnamese" {
            let compoundSurnames = ["司马", "公孙", "诸葛", "欧阳", "上官", "夏侯", "慕容", "宇文", "独孤", "拓跋", "耶律", "完颜", "爱新觉罗"]
            for s in compoundSurnames where trimmed.hasPrefix(s) && trimmed.count > s.count {
                return (String(trimmed.dropFirst(s.count)), s)
            }
            if trimmed.count >= 2 && trimmed.count <= 4 && !trimmed.hasSuffix("王") && !trimmed.hasSuffix("帝") {
                return (String(trimmed.dropFirst(1)), String(trimmed.prefix(1)))
            }
        }
        return (trimmed, "")
    }

    private static func applyRulerOverride(
        run r: JS,
        nationId nid: String,
        spec: HistoricalNationSpec,
        scenario: HistoricalScenario,
        culture: String,
        religion: String,
        polity: String
    ) {
        let parsed = splitRulerName(spec.rulerName, culture: culture)
        let given = parsed.given
        let house = parsed.house
        let isFemale = spec.rulerTitle.contains("女王") || spec.rulerTitle.contains("女皇") || spec.rulerTitle.contains("太后")
        let gender = isFemale ? 1 : 0

        let mil = Double(max(1, min(100, spec.rulerMilitary)))
        let adm = Double(max(1, min(100, spec.rulerAdmin)))
        let dip = Double(max(1, min(100, spec.rulerDiplo)))
        let cha = Double(max(1, min(100, spec.rulerCharisma)))
        let traitJS = JS.array(spec.rulerTraits.map { JS($0) })

        // A. chronicle.leaders[nid][0]
        var rulerId = "ruler-\(nid)-1"
        if !r.chronicle.isNull && !r.chronicle.leaders[nid].isNull && r.chronicle.leaders[nid].length > 0 {
            let lead = r.chronicle.leaders[nid][0]
            if let existingId = lead.id.optionalString, !existingId.isEmpty { rulerId = existingId }
            lead.name = JS(spec.rulerName)
            lead.family = JS(house)
            lead.regnalName = JS(given)
        }

        // B. civilization.rulers[rulerId]
        let civRuler = r.civilization.rulers[rulerId]
        if !civRuler.isNull {
            civRuler.name = JS(spec.rulerName)
            civRuler.given = JS(given)
            civRuler.house = JS(house)
            civRuler.regnalName = JS(given)
            civRuler.cultureId = JS(culture)
            civRuler.religionId = JS(religion)
            civRuler.polityAtAccession = JS(polity)
            civRuler.titleAtAccession = JS(spec.rulerTitle)
            civRuler.gender = JS(gender)
        }

        // C. people.persons[leaderPersonId] & kin.persons[leaderPersonId]
        let leaderPidNum = r.people.nations[nid].leaderId.optionalNumber
        if let pidNum = leaderPidNum {
            let pidKey = String(Int(pidNum))
            let court = r.people.persons[pidKey]
            if !court.isNull {
                court.name = JS(spec.rulerName)
                court.family = JS(house)
                if court.base.isNull { court.base = JS.object() }
                court.base.military = JS(mil)
                court.base.administrative = JS(adm)
                court.base.diplomatic = JS(dip)
                court.base.charisma = JS(cha)
                court.traits = traitJS.clone()
            }
            let kinPerson = r.kin.persons[pidKey]
            if !kinPerson.isNull {
                kinPerson.firstName = JS(given)
                kinPerson.lastName = JS(house)
                kinPerson.cultureName = JS(culture)
                kinPerson.religionId = JS(religion)
                kinPerson.gender = JS(gender)
                if kinPerson.base.isNull { kinPerson.base = JS.object() }
                kinPerson.base.military = JS(mil)
                kinPerson.base.administrative = JS(adm)
                kinPerson.base.diplomatic = JS(dip)
                kinPerson.base.charisma = JS(cha)
                kinPerson.traits = traitJS.clone()
                if case .object = kinPerson.identity.storage {
                    kinPerson.identity.name = JS(spec.rulerName)
                    kinPerson.identity.given = JS(given)
                    kinPerson.identity.house = JS(house)
                    kinPerson.identity.cultureId = JS(culture)
                    kinPerson.identity.gender = JS(gender)
                } else {
                    let ident = JS.object()
                    ident.name = JS(spec.rulerName)
                    ident.given = JS(given)
                    ident.house = JS(house)
                    ident.cultureId = JS(culture)
                    ident.gender = JS(gender)
                    kinPerson.identity = ident
                }
                if !kinPerson.roles.isNull {
                    for role in kinPerson.roles.asArray where role.nativeKind.optionalString == "leader" {
                        role.title = JS(spec.rulerTitle)
                    }
                }
                // 同步统治家族姓氏
                let fid = kinPerson.familyId.asInt
                if fid > 0, !house.isEmpty {
                    let fam = r.kin.families[String(fid)]
                    if !fam.isNull {
                        fam.surname = JS(house)
                        fam.cultureName = JS(culture)
                    }
                }
            }
        }

        // D. 更新开篇史册条目为真实历史开篇描述
        if !r.chronicle.isNull && !r.chronicle.entries.isNull {
            for entry in r.chronicle.entries.asArray where entry.kind.optionalString == "accession" {
                let matchesRuler = entry.people.isArray && entry.people.asArray.contains { $0.id.optionalString == rulerId }
                let matchesNation = entry.nationIds.isArray && entry.nationIds.asArray.contains { $0.optionalString == nid }
                if matchesRuler || matchesNation {
                    entry.text = JS("\(spec.name)开篇：\(spec.rulerTitle)\(spec.rulerName)主政（\(scenario.yearDisplayText) · \(scenario.eraName)）")
                    entry.reason = JS("历史剧本「\(scenario.title)」开局设定：按真实历史年代、政体与人物开局推演。")
                    for p in entry.people.asArray where p.id.optionalString == rulerId {
                        p.name = JS(spec.rulerName)
                        p.regnalName = JS(given)
                    }
                    break
                }
            }
        }
    }

    private static func applyOpeningAlliances(
        run r: JS,
        scenario: HistoricalScenario,
        specIdToNationId: [String: String],
        locked: Bool = true
    ) {
        guard !scenario.openingAlliances.isEmpty else { return }
        if r.alliances.isNull {
            let a = JS.object()
            a.version = JS(1); a.revision = JS(0); a.nextId = JS(1); a.enabled = JS(true)
            a.originTime = r.life.gameTime.clone(); a.originTick = r.clock.tick.clone()
            a.records = .array(); a.lastAction = .object()
            r.alliances = a
        }
        let now = JS(Native.fr(r.life.gameTime.asNumber))
        var alreadyAllied = Set<String>()

        for al in scenario.openingAlliances {
            var members = [String]()
            for mid in al.memberIds {
                if let nid = specIdToNationId[mid], !alreadyAllied.contains(nid), !members.contains(nid) {
                    members.append(nid)
                }
            }
            guard members.count >= 2 else { continue }
            for m in members { alreadyAllied.insert(m) }

            let nextId = r.alliances.nextId.asNumber
            r.alliances.nextId = JS(nextId + 1)
            let rec = JS.object()
            rec.id = JS(nextId)
            rec.name = JS(al.name)
            rec.founders = .array(members.prefix(2).map { JS($0) })
            rec.members = .array(members.map { JS($0) })
            rec.startedTime = now.clone()
            rec.joinedTime = JS(-100)
            rec.startedTick = r.clock.tick.clone()
            rec.endedTick = .null
            rec.unbreakable = JS(locked)
            r.alliances.records.push(rec)
            for m in members { r.alliances.lastAction[m] = now.clone() }
            Vassals.bump(r.alliances)

            // 提升盟友双边好感度
            for i in 0..<members.count {
                for j in (i + 1)..<members.count {
                    DiplomacyDeep.adjustOpinionMod(r, members[i], members[j], delta: 35)
                }
            }
            let namesText = members.map { Vassals.name(r, $0) }.joined(separator: "、")
            _ = People.announce(
                r,
                kind: "diplomacy",
                text: "\(al.name)结盟",
                reason: "\(namesText)于\(scenario.yearDisplayText)缔结历史同盟，对外战事协同进退。",
                nations: members,
                province: nil
            )
        }
    }

    private static func applyOpeningWars(
        run r: JS,
        scenario: HistoricalScenario,
        specIdToNationId: [String: String],
        engine: DeclarationEngine?
    ) {
        guard !scenario.openingWars.isEmpty else { return }
        var openedAny = false

        for war in scenario.openingWars {
            guard let aNid = specIdToNationId[war.attackerId],
                  let dNid = specIdToNationId[war.defenderId],
                  aNid != dNid else { continue }

            DiplomacyDeep.adjustOpinionMod(r, aNid, dNid, delta: -45)

            // 已处于交战状态（例如因同盟参战已被拉入战团），仅补记历史战因不再重复注册
            if Wars.relation(r, aNid, dNid)?.status.asString == "war" {
                continue
            }

            if let engine, DiplomacyBridge.declareWar(r, aNid, dNid, engine: engine) == nil {
                openedAny = true
                let an = Vassals.name(r, aNid), bn = Vassals.name(r, dNid)
                _ = People.recordHistory(
                    r,
                    kind: "diplomacy",
                    text: "\(war.casusBelli)：\(an)与\(bn)开战",
                    reason: "历史剧本「\(scenario.title)」开局既定战事（\(scenario.yearDisplayText)）。",
                    nations: [aNid, dNid],
                    province: nil
                )
                continue
            }

            // 跨洋或未直接接壤的历史交战国（如 1939 德英、1941 日美菲/日英缅）：直接按引擎规范登记完整战争与阵营
            if registerHistoricalWarDirectly(r, attacker: aNid, defender: dNid, casusBelli: war.casusBelli, scenario: scenario) {
                openedAny = true
            }
        }

        if openedAny {
            War26.reconcileForces(r, [])
            if Naval.sea != nil {
                Naval.reconcileLandOwners(r)
            }
            DiplomacyBridge.reconcile(r)
        }
    }

    @discardableResult
    static func registerHistoricalWarDirectly(
        _ r: JS,
        attacker aNid: String,
        defender dNid: String,
        casusBelli: String,
        scenario: HistoricalScenario
    ) -> Bool {
        guard Vassals.alive(r, aNid), Vassals.alive(r, dNid),
              Wars.relation(r, aNid, dNid) != nil else { return false }

        let members = Vassals.buildParticipants(r, attacker: aNid, defender: dNid)
        Vassals.openCoalitionRelations(r, members)

        let attackerStateId = Wars.stateNumber(r, aNid)
        let defenderStateId = Wars.stateNumber(r, dNid)
        let defenderProvs = Wars.orderedProvinces(r, dNid)
        let targetProvIds = Array(defenderProvs.prefix(max(1, min(3, defenderProvs.count))))
            .map { Wars.provinceNumber(r.nativeWars, $0.id.asString) }
            .filter { $0 > 0 }

        let goal = JS.object()
        goal.id = JS(1)
        goal.type = JS(1)
        goal.addedBy = JS(attackerStateId)
        goal.target = JS(defenderStateId)
        goal.beneficiary = JS(attackerStateId)
        let scope = JS.object()
        scope.provinceIds = .array(targetProvIds.map { JS($0) })
        scope.requiredCount = JS(max(1, targetProvIds.count))
        goal.scope = scope
        let goals = JS.array([goal])

        let war = Wars.register(r, attacker: aNid, defender: dNid, goals: goals, members: members)

        // 同步写入 nativeDiplomacy.declarations 与双方冷却时间
        if !r.nativeDiplomacy.isNull {
            let decl = JS.object()
            decl.warId = war.id.clone()
            decl.attackerId = JS(attackerStateId)
            decl.defenderId = JS(defenderStateId)
            decl.casusBelliId = JS(1)
            let dGoal = goal.clone()
            dGoal.primary = JS(true)
            dGoal.scopeType = JS(0)
            dGoal.districtId = JS(0)
            dGoal.secondaryStateId = JS(0)
            decl.goals = .array([dGoal])
            r.nativeDiplomacy.declarations.push(decl)
            let now = JS(Native.fr(r.life.gameTime.asNumber))
            if !r.nativeDiplomacy.nations[aNid].isNull { r.nativeDiplomacy.nations[aNid].activeTime = now.clone() }
            if !r.nativeDiplomacy.nations[dNid].isNull { r.nativeDiplomacy.nations[dNid].passiveTime = now.clone() }
            Vassals.bump(r.nativeDiplomacy)
        }

        let an = Vassals.name(r, aNid), bn = Vassals.name(r, dNid)
        let side0 = members.asArray.filter { $0.side.asInt == 0 }.count
        let side1 = members.asArray.filter { $0.side.asInt == 1 }.count
        var headline = "\(an)对\(bn)宣战：\(casusBelli)"
        if side0 > 1 || side1 > 1 { headline += "（\(an)方\(side0)国 vs \(bn)方\(side1)国）" }
        _ = People.announce(
            r,
            kind: "diplomacy",
            text: headline,
            reason: "历史剧本「\(scenario.title)」开局战事（\(scenario.yearDisplayText) · \(casusBelli)）。",
            nations: members.asArray.map { Wars.nationOf(r.nativeWars, $0.stateId.asInt) },
            province: nil
        )
        return true
    }

    // MARK: - 3. 官方精选 12 大真实历史剧本库（含 1936 战云密布、1931 九一八抗战与 27 国细化欧洲）

    public static let officialScenarios: [HistoricalScenario] = [
        zhanguo260BCE,
        sanguo208,
        tang755,
        songJin1142,
        sengoku1560,
        napoleon1812,
        ww1_1914,
        china1931,
        ww2Eve1936,
        ww2Europe1939,
        ww2Asia1941,
        coldwar1950,
    ]

    // 剧本 1：战国七雄（公元前 260 年 · 长平决战前夜 · 华夏精图 · 10 国）
    private static let zhanguo260BCE = HistoricalScenario(
        id: "zhanguo_260bce",
        title: "战国七雄",
        subtitle: "长平决战 · 合纵连横",
        region: .huaxia,
        year: -260,
        eraName: "周赧王五十五年",
        description: "公元前260年，秦昭襄王远交近攻、白起陈兵上党，与赵国爆发决定天下命运的长平之战。三晋合纵岌岌可危，齐楚燕虎视关东，漠北匈奴、岭南百越与西陲羌戎各据一方。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 240,
        nations: [
            HistoricalNationSpec(
                id: "qin", name: "秦国", shortName: "秦", color: "#363E4A",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "despotism",
                capitalLon: 108.7, capitalLat: 34.3, capitalName: "咸阳",
                anchors: [
                    HistoricalAnchor(lon: 107.2, lat: 34.4, provinceName: "雍城", weight: 1.2),
                    HistoricalAnchor(lon: 104.1, lat: 30.7, provinceName: "成都", weight: 1.35),
                    HistoricalAnchor(lon: 106.5, lat: 29.6, provinceName: "江州", weight: 1.1),
                    HistoricalAnchor(lon: 107.0, lat: 33.1, provinceName: "汉中", weight: 1.15),
                    HistoricalAnchor(lon: 110.5, lat: 34.9, provinceName: "河东", weight: 0.95),
                    HistoricalAnchor(lon: 109.7, lat: 38.0, provinceName: "上郡", weight: 1.05),
                    HistoricalAnchor(lon: 104.6, lat: 35.0, provinceName: "陇西", weight: 1.25),
                    HistoricalAnchor(lon: 112.1, lat: 31.8, provinceName: "襄阳", weight: 1.0),
                ],
                rulerName: "嬴稷", rulerTitle: "秦昭襄王",
                rulerMilitary: 88, rulerAdmin: 86, rulerDiplo: 82, rulerCharisma: 84,
                rulerTraits: ["Unifier", "Ambitious", "IronFist", "Strategist"]
            ),
            HistoricalNationSpec(
                id: "zhao", name: "赵国", shortName: "赵", color: "#C6444B",
                culture: "chinese", religion: "confucian", polity: "Kingdom", style: "feudal",
                capitalLon: 114.5, capitalLat: 36.6, capitalName: "邯郸",
                anchors: [
                    HistoricalAnchor(lon: 114.6, lat: 39.8, provinceName: "代郡", weight: 1.05),
                    HistoricalAnchor(lon: 113.1, lat: 36.2, provinceName: "上党", weight: 0.9),
                    HistoricalAnchor(lon: 112.5, lat: 37.9, provinceName: "晋阳", weight: 1.05),
                    HistoricalAnchor(lon: 111.8, lat: 40.4, provinceName: "云中", weight: 1.0),
                    HistoricalAnchor(lon: 115.0, lat: 37.2, provinceName: "巨鹿", weight: 0.9),
                ],
                rulerName: "赵丹", rulerTitle: "赵孝成王",
                rulerMilitary: 74, rulerAdmin: 66, rulerDiplo: 72, rulerCharisma: 70,
                rulerTraits: ["Brave", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "qi", name: "齐国", shortName: "齐", color: "#2E7BC1",
                culture: "chinese", religion: "confucian", polity: "Kingdom", style: "feudal",
                capitalLon: 118.3, capitalLat: 36.8, capitalName: "临淄",
                anchors: [
                    HistoricalAnchor(lon: 120.8, lat: 37.5, provinceName: "胶东", weight: 1.1),
                    HistoricalAnchor(lon: 116.5, lat: 36.4, provinceName: "济北", weight: 0.95),
                    HistoricalAnchor(lon: 118.4, lat: 35.1, provinceName: "琅琊", weight: 1.0),
                    HistoricalAnchor(lon: 120.4, lat: 36.4, provinceName: "即墨", weight: 0.95),
                    HistoricalAnchor(lon: 117.0, lat: 35.6, provinceName: "曲阜", weight: 0.85),
                ],
                rulerName: "田建", rulerTitle: "齐王建",
                rulerMilitary: 52, rulerAdmin: 70, rulerDiplo: 64, rulerCharisma: 68,
                rulerTraits: ["Dovish", "Financier"]
            ),
            HistoricalNationSpec(
                id: "chu", name: "楚国", shortName: "楚", color: "#2D8C52",
                culture: "chinese", religion: "chineseFolk", polity: "Kingdom", style: "feudal",
                capitalLon: 116.8, capitalLat: 32.6, capitalName: "寿春",
                anchors: [
                    HistoricalAnchor(lon: 112.2, lat: 30.3, provinceName: "江陵", weight: 1.15),
                    HistoricalAnchor(lon: 113.0, lat: 28.2, provinceName: "长沙", weight: 1.25),
                    HistoricalAnchor(lon: 120.6, lat: 31.3, provinceName: "吴郡", weight: 1.2),
                    HistoricalAnchor(lon: 120.6, lat: 30.0, provinceName: "会稽", weight: 1.15),
                    HistoricalAnchor(lon: 119.4, lat: 32.4, provinceName: "广陵", weight: 1.05),
                    HistoricalAnchor(lon: 112.5, lat: 33.0, provinceName: "宛城", weight: 0.95),
                    HistoricalAnchor(lon: 115.9, lat: 28.7, provinceName: "豫章", weight: 1.15),
                    HistoricalAnchor(lon: 117.2, lat: 34.3, provinceName: "彭城", weight: 0.95),
                ],
                rulerName: "熊完", rulerTitle: "楚考烈王",
                rulerMilitary: 68, rulerAdmin: 72, rulerDiplo: 76, rulerCharisma: 75,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "wei", name: "魏国", shortName: "魏", color: "#D9A426",
                culture: "chinese", religion: "confucian", polity: "Kingdom", style: "feudal",
                capitalLon: 114.3, capitalLat: 34.8, capitalName: "大梁",
                anchors: [
                    HistoricalAnchor(lon: 113.8, lat: 35.3, provinceName: "朝歌", weight: 0.85),
                    HistoricalAnchor(lon: 111.0, lat: 35.1, provinceName: "安邑", weight: 0.85),
                    HistoricalAnchor(lon: 115.6, lat: 34.4, provinceName: "睢阳", weight: 0.85),
                ],
                rulerName: "魏圉", rulerTitle: "魏安釐王",
                rulerMilitary: 64, rulerAdmin: 68, rulerDiplo: 70, rulerCharisma: 66,
                rulerTraits: ["Patient", "Scholar"]
            ),
            HistoricalNationSpec(
                id: "han", name: "韩国", shortName: "韩", color: "#8B52B8",
                culture: "chinese", religion: "confucian", polity: "Kingdom", style: "feudal",
                capitalLon: 113.7, capitalLat: 34.4, capitalName: "新郑",
                anchors: [
                    HistoricalAnchor(lon: 113.5, lat: 34.1, provinceName: "阳翟", weight: 0.8),
                    HistoricalAnchor(lon: 112.5, lat: 33.0, provinceName: "南阳", weight: 0.8),
                    HistoricalAnchor(lon: 112.4, lat: 34.6, provinceName: "洛阳", weight: 0.8),
                ],
                rulerName: "韩然", rulerTitle: "韩桓惠王",
                rulerMilitary: 56, rulerAdmin: 62, rulerDiplo: 74, rulerCharisma: 60,
                rulerTraits: ["Diplomatic", "Lawgiver"]
            ),
            HistoricalNationSpec(
                id: "yan", name: "燕国", shortName: "燕", color: "#1E8E88",
                culture: "chinese", religion: "confucian", polity: "Kingdom", style: "feudal",
                capitalLon: 116.4, capitalLat: 39.9, capitalName: "蓟城",
                anchors: [
                    HistoricalAnchor(lon: 123.2, lat: 41.3, provinceName: "襄平", weight: 1.25),
                    HistoricalAnchor(lon: 117.4, lat: 40.1, provinceName: "渔阳", weight: 1.0),
                    HistoricalAnchor(lon: 115.9, lat: 39.5, provinceName: "涿郡", weight: 0.95),
                    HistoricalAnchor(lon: 118.7, lat: 40.9, provinceName: "右北平", weight: 1.1),
                    HistoricalAnchor(lon: 125.8, lat: 39.0, provinceName: "乐浪", weight: 1.25),
                ],
                rulerName: "姬喜", rulerTitle: "燕王喜",
                rulerMilitary: 62, rulerAdmin: 60, rulerDiplo: 65, rulerCharisma: 62,
                rulerTraits: ["Ambitious", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "xiongnu", name: "匈奴", shortName: "匈奴", color: "#B87333",
                culture: "mongol", religion: "tengri", polity: "Tribal", style: "khanate",
                capitalLon: 109.8, capitalLat: 41.2, capitalName: "头曼城",
                anchors: [
                    HistoricalAnchor(lon: 108.3, lat: 41.1, provinceName: "五原", weight: 1.25),
                    HistoricalAnchor(lon: 110.1, lat: 41.0, provinceName: "阴山", weight: 1.2),
                    HistoricalAnchor(lon: 101.1, lat: 42.0, provinceName: "居延", weight: 1.3),
                    HistoricalAnchor(lon: 119.0, lat: 43.2, provinceName: "大宁", weight: 1.3),
                ],
                rulerName: "头曼", rulerTitle: "单于",
                rulerMilitary: 84, rulerAdmin: 58, rulerDiplo: 62, rulerCharisma: 78,
                rulerTraits: ["Hawkish", "Brave", "Conqueror"]
            ),
            HistoricalNationSpec(
                id: "baiyue", name: "百越", shortName: "百越", color: "#2A7A68",
                culture: "vietnamese", religion: "chineseFolk", polity: "Tribal", style: "chiefdom",
                capitalLon: 113.3, capitalLat: 23.1, capitalName: "番禺",
                anchors: [
                    HistoricalAnchor(lon: 119.3, lat: 26.1, provinceName: "东冶", weight: 1.25),
                    HistoricalAnchor(lon: 110.3, lat: 25.3, provinceName: "桂林", weight: 1.2),
                    HistoricalAnchor(lon: 108.4, lat: 22.8, provinceName: "象郡", weight: 1.25),
                    HistoricalAnchor(lon: 105.8, lat: 21.0, provinceName: "交趾", weight: 1.3),
                    HistoricalAnchor(lon: 121.0, lat: 23.8, provinceName: "夷洲", weight: 1.2),
                ],
                rulerName: "无诸", rulerTitle: "闽越王",
                rulerMilitary: 72, rulerAdmin: 66, rulerDiplo: 68, rulerCharisma: 74,
                rulerTraits: ["NavalMastery", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "qiangrong", name: "羌戎", shortName: "羌", color: "#9C5B34",
                culture: "tibetan", religion: "tengri", polity: "Tribal", style: "chiefdom",
                capitalLon: 101.2, capitalLat: 36.7, capitalName: "临羌",
                anchors: [
                    HistoricalAnchor(lon: 100.4, lat: 38.9, provinceName: "张掖", weight: 1.2),
                    HistoricalAnchor(lon: 98.5, lat: 39.7, provinceName: "酒泉", weight: 1.2),
                    HistoricalAnchor(lon: 97.2, lat: 31.1, provinceName: "昌都", weight: 1.3),
                    HistoricalAnchor(lon: 100.2, lat: 25.6, provinceName: "大理", weight: 1.3),
                    HistoricalAnchor(lon: 102.7, lat: 25.0, provinceName: "滇池", weight: 1.25),
                ],
                rulerName: "无弋爰剑", rulerTitle: "羌豪",
                rulerMilitary: 78, rulerAdmin: 56, rulerDiplo: 58, rulerCharisma: 72,
                rulerTraits: ["Brave", "BattleHardened"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "qin", defenderId: "zhao", casusBelli: "长平之战 · 上党决战"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "合纵抗秦同盟", memberIds: ["zhao", "wei", "han"]),
        ],
        tags: ["先秦", "中国", "长平之战", "经典"],
        rebelMode: "historical",
        eraOverride: "antiquity"
    )

    // 剧本 2：三国鼎立 · 赤壁风云（公元 208 年 · 建安十三年 · 华夏精图 · 9 国）
    private static let sanguo208 = HistoricalScenario(
        id: "sanguo_208",
        title: "三国鼎立 · 赤壁风云",
        subtitle: "曹操南下 · 孙刘合纵",
        region: .huaxia,
        year: 208,
        eraName: "建安十三年",
        description: "建安十三年，曹操平定河北后挥师南下荆州，舳舻千里直指江东。孙权、刘备结盟于柴桑，赤壁烈火一触即发；益州刘璋、西凉马腾、汉中张鲁、辽东公孙、塞北鲜卑与交州士燮各守一方。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 250,
        nations: [
            HistoricalNationSpec(
                id: "caowei", name: "曹魏", shortName: "魏", color: "#2D64A8",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "warlord",
                capitalLon: 113.8, capitalLat: 34.0, capitalName: "许昌",
                anchors: [
                    HistoricalAnchor(lon: 112.4, lat: 34.6, provinceName: "洛阳", weight: 1.15),
                    HistoricalAnchor(lon: 114.5, lat: 36.3, provinceName: "邺城", weight: 1.2),
                    HistoricalAnchor(lon: 108.9, lat: 34.3, provinceName: "长安", weight: 1.2),
                    HistoricalAnchor(lon: 117.2, lat: 34.3, provinceName: "徐州", weight: 1.15),
                    HistoricalAnchor(lon: 118.5, lat: 36.7, provinceName: "青州", weight: 1.25),
                    HistoricalAnchor(lon: 116.4, lat: 39.9, provinceName: "幽州", weight: 1.2),
                    HistoricalAnchor(lon: 112.5, lat: 37.9, provinceName: "晋阳", weight: 1.15),
                    HistoricalAnchor(lon: 112.5, lat: 33.0, provinceName: "宛城", weight: 1.05),
                    HistoricalAnchor(lon: 112.1, lat: 32.0, provinceName: "襄阳", weight: 1.05),
                    HistoricalAnchor(lon: 117.3, lat: 31.9, provinceName: "合淝", weight: 1.0),
                ],
                rulerName: "曹操", rulerTitle: "丞相",
                rulerMilitary: 94, rulerAdmin: 92, rulerDiplo: 84, rulerCharisma: 90,
                rulerTraits: ["Genius", "Strategist", "Visionary", "Unifier"]
            ),
            HistoricalNationSpec(
                id: "sunwu", name: "孙吴", shortName: "吴", color: "#C84038",
                culture: "chinese", religion: "chineseFolk", polity: "Kingdom", style: "feudal",
                capitalLon: 118.8, capitalLat: 32.1, capitalName: "建业",
                anchors: [
                    HistoricalAnchor(lon: 120.6, lat: 31.3, provinceName: "吴郡", weight: 1.15),
                    HistoricalAnchor(lon: 120.6, lat: 30.0, provinceName: "会稽", weight: 1.2),
                    HistoricalAnchor(lon: 116.0, lat: 29.7, provinceName: "柴桑", weight: 1.05),
                    HistoricalAnchor(lon: 115.9, lat: 28.7, provinceName: "豫章", weight: 1.15),
                    HistoricalAnchor(lon: 114.8, lat: 30.4, provinceName: "江夏", weight: 0.95),
                    HistoricalAnchor(lon: 118.3, lat: 27.0, provinceName: "建安", weight: 1.25),
                    HistoricalAnchor(lon: 121.0, lat: 23.8, provinceName: "夷洲", weight: 1.2),
                ],
                rulerName: "孙权", rulerTitle: "吴侯",
                rulerMilitary: 80, rulerAdmin: 86, rulerDiplo: 88, rulerCharisma: 86,
                rulerTraits: ["NavalMastery", "Diplomatic", "SeaVision"]
            ),
            HistoricalNationSpec(
                id: "liubei", name: "刘备", shortName: "汉", color: "#2E8B57",
                culture: "chinese", religion: "confucian", polity: "Kingdom", style: "feudal",
                capitalLon: 112.2, capitalLat: 30.3, capitalName: "江陵",
                anchors: [
                    HistoricalAnchor(lon: 114.2, lat: 30.5, provinceName: "夏口", weight: 0.9),
                    HistoricalAnchor(lon: 111.7, lat: 29.0, provinceName: "武陵", weight: 1.05),
                    HistoricalAnchor(lon: 111.6, lat: 26.4, provinceName: "零陵", weight: 1.1),
                    HistoricalAnchor(lon: 113.0, lat: 28.2, provinceName: "长沙", weight: 1.05),
                    HistoricalAnchor(lon: 112.7, lat: 25.8, provinceName: "桂阳", weight: 1.0),
                ],
                rulerName: "刘备", rulerTitle: "左将军",
                rulerMilitary: 82, rulerAdmin: 80, rulerDiplo: 88, rulerCharisma: 95,
                rulerTraits: ["Charismatic", "Benevolent", "Beloved", "NaturalLeader"]
            ),
            HistoricalNationSpec(
                id: "liuzhang", name: "益州刘璋", shortName: "蜀", color: "#D4A017",
                culture: "chinese", religion: "daoism", polity: "Empire", style: "jiedushi",
                capitalLon: 104.1, capitalLat: 30.7, capitalName: "成都",
                anchors: [
                    HistoricalAnchor(lon: 105.2, lat: 31.6, provinceName: "梓潼", weight: 1.05),
                    HistoricalAnchor(lon: 106.5, lat: 29.6, provinceName: "江州", weight: 1.1),
                    HistoricalAnchor(lon: 109.5, lat: 31.0, provinceName: "永安", weight: 1.0),
                    HistoricalAnchor(lon: 102.7, lat: 25.0, provinceName: "建宁", weight: 1.4),
                    HistoricalAnchor(lon: 99.2, lat: 25.1, provinceName: "永昌", weight: 1.35),
                ],
                rulerName: "刘璋", rulerTitle: "益州牧",
                rulerMilitary: 46, rulerAdmin: 64, rulerDiplo: 58, rulerCharisma: 62,
                rulerTraits: ["Merciful", "Dovish"]
            ),
            HistoricalNationSpec(
                id: "mateng", name: "西凉马腾", shortName: "凉", color: "#A85632",
                culture: "chinese", religion: "chineseFolk", polity: "Empire", style: "warlord",
                capitalLon: 102.6, capitalLat: 37.9, capitalName: "武威",
                anchors: [
                    HistoricalAnchor(lon: 105.7, lat: 34.6, provinceName: "天水", weight: 1.05),
                    HistoricalAnchor(lon: 104.6, lat: 35.0, provinceName: "陇西", weight: 1.05),
                    HistoricalAnchor(lon: 103.8, lat: 36.1, provinceName: "金城", weight: 1.05),
                    HistoricalAnchor(lon: 100.5, lat: 38.9, provinceName: "张掖", weight: 1.2),
                    HistoricalAnchor(lon: 98.5, lat: 39.7, provinceName: "酒泉", weight: 1.3),
                ],
                rulerName: "马腾", rulerTitle: "征西将军",
                rulerMilitary: 84, rulerAdmin: 60, rulerDiplo: 62, rulerCharisma: 78,
                rulerTraits: ["Brave", "BattleHardened", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "zhanglu", name: "汉中张鲁", shortName: "米", color: "#7D3C98",
                culture: "chinese", religion: "daoism", polity: "Theocracy", style: "theocracy",
                capitalLon: 107.0, capitalLat: 33.1, capitalName: "南郑",
                anchors: [
                    HistoricalAnchor(lon: 106.2, lat: 33.2, provinceName: "阳平", weight: 0.9),
                    HistoricalAnchor(lon: 106.8, lat: 31.8, provinceName: "巴州", weight: 0.85),
                ],
                rulerName: "张鲁", rulerTitle: "师君",
                rulerMilitary: 62, rulerAdmin: 76, rulerDiplo: 66, rulerCharisma: 78,
                rulerTraits: ["Just", "Benevolent"]
            ),
            HistoricalNationSpec(
                id: "gongsun", name: "辽东公孙", shortName: "辽", color: "#5D6D7E",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "jiedushi",
                capitalLon: 123.2, capitalLat: 41.3, capitalName: "襄平",
                anchors: [
                    HistoricalAnchor(lon: 125.8, lat: 39.0, provinceName: "乐浪", weight: 1.2),
                    HistoricalAnchor(lon: 127.0, lat: 37.5, provinceName: "带方", weight: 1.2),
                    HistoricalAnchor(lon: 124.9, lat: 41.9, provinceName: "玄菟", weight: 1.25),
                ],
                rulerName: "公孙康", rulerTitle: "辽东太守",
                rulerMilitary: 70, rulerAdmin: 72, rulerDiplo: 68, rulerCharisma: 66,
                rulerTraits: ["Patient", "Administrator"]
            ),
            HistoricalNationSpec(
                id: "xianbei", name: "鲜卑", shortName: "鲜卑", color: "#B7950B",
                culture: "mongol", religion: "tengri", polity: "Tribal", style: "khanate",
                capitalLon: 114.2, capitalLat: 42.4, capitalName: "弹汗山",
                anchors: [
                    HistoricalAnchor(lon: 110.0, lat: 41.2, provinceName: "阴山", weight: 1.25),
                    HistoricalAnchor(lon: 108.3, lat: 41.1, provinceName: "五原", weight: 1.25),
                    HistoricalAnchor(lon: 101.1, lat: 42.0, provinceName: "居延", weight: 1.3),
                ],
                rulerName: "轲比能", rulerTitle: "大人",
                rulerMilitary: 86, rulerAdmin: 68, rulerDiplo: 72, rulerCharisma: 82,
                rulerTraits: ["Brave", "Hawkish", "Tactician"]
            ),
            HistoricalNationSpec(
                id: "shixie", name: "交州士燮", shortName: "交", color: "#1E8E88",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "jiedushi",
                capitalLon: 105.8, capitalLat: 21.0, capitalName: "交趾",
                anchors: [
                    HistoricalAnchor(lon: 113.3, lat: 23.1, provinceName: "番禺", weight: 1.25),
                    HistoricalAnchor(lon: 110.3, lat: 25.3, provinceName: "桂林", weight: 1.15),
                    HistoricalAnchor(lon: 109.2, lat: 21.7, provinceName: "合浦", weight: 1.1),
                    HistoricalAnchor(lon: 110.3, lat: 20.0, provinceName: "琼州", weight: 1.1),
                ],
                rulerName: "士燮", rulerTitle: "交趾太守",
                rulerMilitary: 64, rulerAdmin: 84, rulerDiplo: 82, rulerCharisma: 80,
                rulerTraits: ["Scholar", "Administrator", "Patient"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "caowei", defenderId: "liubei", casusBelli: "赤壁之战 · 荆襄南征"),
            HistoricalWarSpec(attackerId: "caowei", defenderId: "sunwu", casusBelli: "赤壁之战 · 江东决战"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "孙刘联盟", memberIds: ["sunwu", "liubei"]),
        ],
        tags: ["三国", "赤壁之战", "中国", "名将"],
        rebelMode: "historical",
        eraOverride: "antiquity"
    )

    // 剧本 3：盛唐天宝（公元 755 年 · 天宝十四载 · 中国全图 · 7 国）
    private static let tang755 = HistoricalScenario(
        id: "tang_755",
        title: "盛唐天宝",
        subtitle: "万国来朝 · 边疆风云",
        region: .china,
        year: 755,
        eraName: "天宝十四载",
        description: "公元755年，开元天宝盛世已臻极盛，大唐西域安西四镇远播葱岭，然吐蕃强盛于青藏、南诏崛起于滇中、黑衣大食虎视西域、回纥雄踞漠北、渤海与新罗拱卫海东。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 260,
        nations: [
            HistoricalNationSpec(
                id: "tang", name: "大唐", shortName: "唐", color: "#D49B2A",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "dynasty",
                capitalLon: 108.9, capitalLat: 34.3, capitalName: "长安",
                anchors: [
                    HistoricalAnchor(lon: 112.4, lat: 34.6, provinceName: "洛阳", weight: 1.2),
                    HistoricalAnchor(lon: 112.5, lat: 37.9, provinceName: "太原", weight: 1.2),
                    HistoricalAnchor(lon: 116.4, lat: 39.9, provinceName: "幽州", weight: 1.3),
                    HistoricalAnchor(lon: 104.1, lat: 30.7, provinceName: "成都", weight: 1.3),
                    HistoricalAnchor(lon: 119.4, lat: 32.4, provinceName: "扬州", weight: 1.35),
                    HistoricalAnchor(lon: 113.3, lat: 23.1, provinceName: "广州", weight: 1.4),
                    HistoricalAnchor(lon: 114.3, lat: 34.8, provinceName: "汴京", weight: 1.2),
                    HistoricalAnchor(lon: 112.2, lat: 30.3, provinceName: "江陵", weight: 1.25),
                    HistoricalAnchor(lon: 102.6, lat: 37.9, provinceName: "凉州", weight: 1.25),
                    HistoricalAnchor(lon: 94.7, lat: 40.1, provinceName: "敦煌", weight: 1.3),
                    HistoricalAnchor(lon: 82.9, lat: 41.7, provinceName: "安西", weight: 1.35),
                    HistoricalAnchor(lon: 89.2, lat: 44.0, provinceName: "庭州", weight: 1.3),
                    HistoricalAnchor(lon: 118.6, lat: 24.9, provinceName: "泉州", weight: 1.3),
                    HistoricalAnchor(lon: 105.8, lat: 21.0, provinceName: "交趾", weight: 1.3),
                    HistoricalAnchor(lon: 118.5, lat: 36.7, provinceName: "青州", weight: 1.2),
                ],
                rulerName: "李隆基", rulerTitle: "唐玄宗",
                rulerMilitary: 76, rulerAdmin: 82, rulerDiplo: 88, rulerCharisma: 92,
                rulerTraits: ["Charismatic", "Visionary", "Scholar"]
            ),
            HistoricalNationSpec(
                id: "tibet", name: "吐蕃", shortName: "蕃", color: "#B83B2E",
                culture: "tibetan", religion: "tantric", polity: "Kingdom", style: "absolute",
                capitalLon: 91.1, capitalLat: 29.7, capitalName: "逻些",
                anchors: [
                    HistoricalAnchor(lon: 97.2, lat: 31.1, provinceName: "昌都", weight: 1.3),
                    HistoricalAnchor(lon: 101.8, lat: 36.6, provinceName: "湟中", weight: 1.25),
                    HistoricalAnchor(lon: 103.6, lat: 32.6, provinceName: "松州", weight: 1.0),
                    HistoricalAnchor(lon: 88.9, lat: 29.3, provinceName: "日喀则", weight: 1.35),
                    HistoricalAnchor(lon: 80.1, lat: 32.5, provinceName: "阿里", weight: 1.45),
                    HistoricalAnchor(lon: 92.0, lat: 31.5, provinceName: "那曲", weight: 1.35),
                ],
                rulerName: "赤松德赞", rulerTitle: "赞普",
                rulerMilitary: 88, rulerAdmin: 82, rulerDiplo: 76, rulerCharisma: 86,
                rulerTraits: ["Brave", "Conqueror", "Ambitious"]
            ),
            HistoricalNationSpec(
                id: "uyghur", name: "回纥", shortName: "回纥", color: "#2D7FB8",
                culture: "turkic", religion: "tengri", polity: "Tribal", style: "khanate",
                capitalLon: 102.8, capitalLat: 47.2, capitalName: "鄂尔浑",
                anchors: [
                    HistoricalAnchor(lon: 106.9, lat: 47.9, provinceName: "库伦", weight: 1.55),
                    HistoricalAnchor(lon: 101.1, lat: 42.0, provinceName: "居延", weight: 1.25),
                    HistoricalAnchor(lon: 91.0, lat: 48.0, provinceName: "科布多", weight: 1.55),
                    HistoricalAnchor(lon: 117.0, lat: 48.0, provinceName: "呼伦贝尔", weight: 1.5),
                    HistoricalAnchor(lon: 111.7, lat: 40.8, provinceName: "阴山", weight: 1.3),
                ],
                rulerName: "磨延啜", rulerTitle: "葛勒可汗",
                rulerMilitary: 86, rulerAdmin: 70, rulerDiplo: 78, rulerCharisma: 82,
                rulerTraits: ["BattleHardened", "Hawkish", "Tactician"]
            ),
            HistoricalNationSpec(
                id: "nanzhao", name: "南诏", shortName: "诏", color: "#259155",
                culture: "chinese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 100.2, capitalLat: 25.6, capitalName: "太和城",
                anchors: [
                    HistoricalAnchor(lon: 100.2, lat: 25.6, provinceName: "大理", weight: 1.1),
                    HistoricalAnchor(lon: 102.7, lat: 25.0, provinceName: "拓东", weight: 1.2),
                    HistoricalAnchor(lon: 99.1, lat: 25.1, provinceName: "永昌", weight: 1.15),
                    HistoricalAnchor(lon: 100.3, lat: 25.2, provinceName: "蒙舍", weight: 1.15),
                ],
                rulerName: "阁罗凤", rulerTitle: "南诏王",
                rulerMilitary: 82, rulerAdmin: 74, rulerDiplo: 76, rulerCharisma: 78,
                rulerTraits: ["Strategist", "Brave"]
            ),
            HistoricalNationSpec(
                id: "bohai", name: "渤海国", shortName: "渤", color: "#7E4B9E",
                culture: "korean", religion: "confucian", polity: "Kingdom", style: "feudal",
                capitalLon: 129.0, capitalLat: 44.1, capitalName: "上京龙泉府",
                anchors: [
                    HistoricalAnchor(lon: 123.5, lat: 41.8, provinceName: "沈阳", weight: 1.15),
                    HistoricalAnchor(lon: 130.5, lat: 42.9, provinceName: "珲春", weight: 1.25),
                    HistoricalAnchor(lon: 126.6, lat: 45.8, provinceName: "哈尔滨", weight: 1.4),
                    HistoricalAnchor(lon: 133.0, lat: 47.5, provinceName: "伯力", weight: 1.45),
                ],
                rulerName: "大钦茂", rulerTitle: "渤海文王",
                rulerMilitary: 72, rulerAdmin: 84, rulerDiplo: 82, rulerCharisma: 80,
                rulerTraits: ["Scholar", "Administrator", "Diligent"]
            ),
            HistoricalNationSpec(
                id: "silla", name: "新罗", shortName: "罗", color: "#4CA8DE",
                culture: "korean", religion: "buddhism", polity: "Kingdom", style: "absolute",
                capitalLon: 129.2, capitalLat: 35.8, capitalName: "庆州",
                anchors: [
                    HistoricalAnchor(lon: 127.0, lat: 37.5, provinceName: "汉城", weight: 1.15),
                    HistoricalAnchor(lon: 125.8, lat: 39.0, provinceName: "平壤", weight: 1.1),
                    HistoricalAnchor(lon: 127.1, lat: 35.8, provinceName: "全州", weight: 1.1),
                ],
                rulerName: "金宪英", rulerTitle: "景德王",
                rulerMilitary: 68, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 76,
                rulerTraits: ["Scholar", "Merciful"]
            ),
            HistoricalNationSpec(
                id: "abbasid", name: "黑衣大食西域", shortName: "大食", color: "#2F3B47",
                culture: "arab", religion: "islam", polity: "Theocracy", style: "caliphate",
                capitalLon: 75.9, capitalLat: 39.5, capitalName: "疏勒",
                anchors: [
                    HistoricalAnchor(lon: 75.2, lat: 42.8, provinceName: "碎叶", weight: 1.25),
                    HistoricalAnchor(lon: 79.9, lat: 37.1, provinceName: "于阗", weight: 1.05),
                ],
                rulerName: "阿布·穆斯林", rulerTitle: "呼罗珊总督",
                rulerMilitary: 88, rulerAdmin: 78, rulerDiplo: 74, rulerCharisma: 84,
                rulerTraits: ["Tactician", "Hawkish", "IronFist"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "tibet", defenderId: "tang", casusBelli: "河陇青海争衡"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "唐回和亲盟约", memberIds: ["tang", "uyghur"]),
        ],
        tags: ["大唐", "丝绸之路", "盛世", "中国"],
        rebelMode: "historical",
        eraOverride: "medieval"
    )

    // 剧本 4：宋金对峙 · 绍兴和议（公元 1142 年 · 华夏精图 · 8 国）
    private static let songJin1142 = HistoricalScenario(
        id: "song_jin_1142",
        title: "宋金对峙 · 绍兴和议",
        subtitle: "划淮为界 · 九州鼎立",
        region: .huaxia,
        year: 1142,
        eraName: "绍兴十二年",
        description: "公元1142年，宋金绍兴和议初定，大金铁骑雄踞中原燕云，南宋偏安临安坐拥江南巴蜀富庶之地；西夏雄守河西、大理据守西南、蒙古诸部兴起于漠北草原，高丽、吐蕃诸部与大越环峙四方。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 240,
        nations: [
            HistoricalNationSpec(
                id: "jin", name: "金朝", shortName: "金", color: "#C99327",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "dynasty",
                capitalLon: 116.4, capitalLat: 39.9, capitalName: "燕京",
                anchors: [
                    HistoricalAnchor(lon: 114.3, lat: 34.8, provinceName: "汴京", weight: 1.2),
                    HistoricalAnchor(lon: 108.9, lat: 34.3, provinceName: "长安", weight: 1.15),
                    HistoricalAnchor(lon: 112.5, lat: 37.9, provinceName: "太原", weight: 1.15),
                    HistoricalAnchor(lon: 117.0, lat: 36.7, provinceName: "济南", weight: 1.15),
                    HistoricalAnchor(lon: 123.4, lat: 41.8, provinceName: "沈阳", weight: 1.2),
                    HistoricalAnchor(lon: 112.4, lat: 34.6, provinceName: "洛阳", weight: 1.1),
                    HistoricalAnchor(lon: 113.3, lat: 40.1, provinceName: "大同", weight: 1.1),
                ],
                rulerName: "完颜亶", rulerTitle: "金熙宗",
                rulerMilitary: 82, rulerAdmin: 80, rulerDiplo: 76, rulerCharisma: 78,
                rulerTraits: ["Conqueror", "Reformer", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "nsong", name: "南宋", shortName: "宋", color: "#2B78AD",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "dynasty",
                capitalLon: 120.2, capitalLat: 30.3, capitalName: "临安",
                anchors: [
                    HistoricalAnchor(lon: 118.8, lat: 32.1, provinceName: "金陵", weight: 1.2),
                    HistoricalAnchor(lon: 119.4, lat: 32.4, provinceName: "扬州", weight: 1.15),
                    HistoricalAnchor(lon: 112.1, lat: 32.0, provinceName: "襄阳", weight: 1.1),
                    HistoricalAnchor(lon: 114.3, lat: 30.5, provinceName: "鄂州", weight: 1.15),
                    HistoricalAnchor(lon: 104.1, lat: 30.7, provinceName: "成都", weight: 1.25),
                    HistoricalAnchor(lon: 113.0, lat: 28.2, provinceName: "潭州", weight: 1.15),
                    HistoricalAnchor(lon: 118.7, lat: 24.9, provinceName: "泉州", weight: 1.2),
                    HistoricalAnchor(lon: 113.3, lat: 23.1, provinceName: "广州", weight: 1.25),
                ],
                rulerName: "赵构", rulerTitle: "宋高宗",
                rulerMilitary: 62, rulerAdmin: 78, rulerDiplo: 82, rulerCharisma: 76,
                rulerTraits: ["Financier", "Patient", "Scholar"]
            ),
            HistoricalNationSpec(
                id: "xixia", name: "西夏", shortName: "夏", color: "#9E4A36",
                culture: "chinese", religion: "buddhism", polity: "Empire", style: "dynasty",
                capitalLon: 106.3, capitalLat: 38.5, capitalName: "兴庆府",
                anchors: [
                    HistoricalAnchor(lon: 102.6, lat: 37.9, provinceName: "凉州", weight: 1.15),
                    HistoricalAnchor(lon: 100.5, lat: 38.9, provinceName: "张掖", weight: 1.15),
                    HistoricalAnchor(lon: 98.5, lat: 39.7, provinceName: "酒泉", weight: 1.2),
                    HistoricalAnchor(lon: 106.3, lat: 38.1, provinceName: "灵州", weight: 1.05),
                ],
                rulerName: "李仁孝", rulerTitle: "夏仁宗",
                rulerMilitary: 76, rulerAdmin: 84, rulerDiplo: 80, rulerCharisma: 80,
                rulerTraits: ["Scholar", "Administrator", "Patient"]
            ),
            HistoricalNationSpec(
                id: "dali", name: "大理", shortName: "理", color: "#2E8B57",
                culture: "chinese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 100.2, capitalLat: 25.6, capitalName: "大理",
                anchors: [
                    HistoricalAnchor(lon: 102.7, lat: 25.0, provinceName: "拓东", weight: 1.2),
                    HistoricalAnchor(lon: 99.2, lat: 25.1, provinceName: "永昌", weight: 1.15),
                ],
                rulerName: "段正严", rulerTitle: "大理宪宗",
                rulerMilitary: 68, rulerAdmin: 78, rulerDiplo: 76, rulerCharisma: 78,
                rulerTraits: ["Benevolent", "Merciful", "Patient"]
            ),
            HistoricalNationSpec(
                id: "mongol", name: "蒙古诸部", shortName: "蒙", color: "#A87B2D",
                culture: "mongol", religion: "tengri", polity: "Tribal", style: "khanate",
                capitalLon: 109.8, capitalLat: 42.5, capitalName: "斡难河",
                anchors: [
                    HistoricalAnchor(lon: 111.7, lat: 40.8, provinceName: "阴山", weight: 1.25),
                    HistoricalAnchor(lon: 101.1, lat: 42.0, provinceName: "居延", weight: 1.25),
                ],
                rulerName: "合不勒汗", rulerTitle: "大汗",
                rulerMilitary: 88, rulerAdmin: 64, rulerDiplo: 66, rulerCharisma: 84,
                rulerTraits: ["Hawkish", "Brave", "Conqueror"]
            ),
            HistoricalNationSpec(
                id: "goryeo", name: "高丽", shortName: "丽", color: "#4EA0D8",
                culture: "korean", religion: "buddhism", polity: "Kingdom", style: "absolute",
                capitalLon: 126.6, capitalLat: 38.0, capitalName: "开京",
                anchors: [
                    HistoricalAnchor(lon: 125.8, lat: 39.0, provinceName: "平壤", weight: 1.1),
                    HistoricalAnchor(lon: 127.0, lat: 37.6, provinceName: "汉城", weight: 1.05),
                    HistoricalAnchor(lon: 129.2, lat: 35.8, provinceName: "庆州", weight: 1.1),
                ],
                rulerName: "王楷", rulerTitle: "高丽仁宗",
                rulerMilitary: 64, rulerAdmin: 76, rulerDiplo: 80, rulerCharisma: 74,
                rulerTraits: ["Scholar", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "tibet_tribes", name: "吐蕃诸部", shortName: "蕃", color: "#B83B2E",
                culture: "tibetan", religion: "tantric", polity: "Theocracy", style: "lamaism",
                capitalLon: 97.2, capitalLat: 31.1, capitalName: "昌都",
                anchors: [
                    HistoricalAnchor(lon: 97.0, lat: 33.0, provinceName: "玉树", weight: 1.2),
                    HistoricalAnchor(lon: 100.0, lat: 31.6, provinceName: "甘孜", weight: 1.2),
                    HistoricalAnchor(lon: 101.8, lat: 36.6, provinceName: "湟中", weight: 1.15),
                ],
                rulerName: "贡嘎宁波", rulerTitle: "萨迦法王",
                rulerMilitary: 70, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 82,
                rulerTraits: ["Just", "Patient"]
            ),
            HistoricalNationSpec(
                id: "daiviet", name: "大越", shortName: "越", color: "#248A6A",
                culture: "vietnamese", religion: "buddhism", polity: "Kingdom", style: "absolute",
                capitalLon: 105.8, capitalLat: 21.0, capitalName: "升龙",
                anchors: [
                    HistoricalAnchor(lon: 105.8, lat: 19.8, provinceName: "九真", weight: 1.1),
                    HistoricalAnchor(lon: 107.6, lat: 16.5, provinceName: "顺化", weight: 1.1),
                ],
                rulerName: "李天祚", rulerTitle: "李英宗",
                rulerMilitary: 72, rulerAdmin: 74, rulerDiplo: 76, rulerCharisma: 74,
                rulerTraits: ["BattleHardened", "Patient"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "mongol", defenderId: "jin", casusBelli: "漠北草原与金边之争"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "金夏盟约", memberIds: ["jin", "xixia"]),
        ],
        tags: ["宋金", "两宋", "中国", "华夏"],
        rebelMode: "historical",
        eraOverride: "medieval"
    )

    // 剧本 5：日本战国 · 桶狭间（公元 1560 年 · 永禄三年 · AoH3 级日本列岛放大精图 · 24 家战国大名）
    private static let sengoku1560 = HistoricalScenario(
        id: "sengoku_1560",
        title: "日本战国 · 桶狭间",
        subtitle: "永禄三年 · 24 家大名令制国超细精图 · 群雄上洛",
        region: .japanDetail,
        year: 1560,
        eraName: "永禄三年",
        description: "永禄三年五月，东海道第一弓取今川义元率大军携三河松平元康上洛，织田信长于尾张清洲奇袭桶狭间。足利幕府坐镇京都、三好/浅井/六角/北畠/朝仓/斋藤雄踞近畿美浓，甲斐武田与越后上杉决战川中岛，关东北条与常陆佐竹对峙，中国毛利与尼子、宇喜多争霸山阴山阳，四国长宗我部、九州岛津大友龙造寺与奥羽伊达最上南部二十四家大名纵横扶桑！",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 310,
        nations: [
            HistoricalNationSpec(
                id: "oda", name: "织田家", shortName: "织田", color: "#C6444B",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 136.85, capitalLat: 35.21, capitalName: "清洲",
                anchors: [
                    HistoricalAnchor(lon: 136.91, lat: 35.18, provinceName: "那古野", weight: 1.15),
                    HistoricalAnchor(lon: 136.94, lat: 35.38, provinceName: "犬山", weight: 1.05),
                ],
                rulerName: "织田信长", rulerTitle: "上总介",
                rulerMilitary: 95, rulerAdmin: 92, rulerDiplo: 84, rulerCharisma: 94,
                rulerTraits: ["Genius", "Unifier", "Visionary", "Conqueror"]
            ),
            HistoricalNationSpec(
                id: "imagawa", name: "今川家", shortName: "今川", color: "#8E44AD",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 138.38, capitalLat: 34.98, capitalName: "骏府",
                anchors: [
                    HistoricalAnchor(lon: 137.73, lat: 34.71, provinceName: "滨松", weight: 0.9),
                    HistoricalAnchor(lon: 138.01, lat: 34.77, provinceName: "挂川", weight: 0.85),
                ],
                rulerName: "今川义元", rulerTitle: "治部大辅",
                rulerMilitary: 80, rulerAdmin: 86, rulerDiplo: 84, rulerCharisma: 82,
                rulerTraits: ["Administrator", "Diplomatic", "Financier"]
            ),
            HistoricalNationSpec(
                id: "takeda", name: "武田家", shortName: "武田", color: "#A93226",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 138.57, capitalLat: 35.66, capitalName: "甲府",
                anchors: [
                    HistoricalAnchor(lon: 138.11, lat: 36.04, provinceName: "诹访", weight: 0.95),
                    HistoricalAnchor(lon: 138.20, lat: 36.56, provinceName: "海津", weight: 1.0),
                    HistoricalAnchor(lon: 137.97, lat: 36.24, provinceName: "松本", weight: 0.95),
                ],
                rulerName: "武田信玄", rulerTitle: "甲斐守",
                rulerMilitary: 96, rulerAdmin: 88, rulerDiplo: 86, rulerCharisma: 90,
                rulerTraits: ["Strategist", "Tactician", "Lawgiver"]
            ),
            HistoricalNationSpec(
                id: "uesugi", name: "上杉家", shortName: "上杉", color: "#2980B9",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 138.20, capitalLat: 37.14, capitalName: "春日山",
                anchors: [
                    HistoricalAnchor(lon: 138.85, lat: 37.45, provinceName: "长冈", weight: 1.0),
                    HistoricalAnchor(lon: 139.33, lat: 37.95, provinceName: "新发田", weight: 1.0),
                    HistoricalAnchor(lon: 137.21, lat: 36.70, provinceName: "富山", weight: 0.95),
                ],
                rulerName: "上杉谦信", rulerTitle: "关东管领",
                rulerMilitary: 98, rulerAdmin: 76, rulerDiplo: 72, rulerCharisma: 88,
                rulerTraits: ["Brave", "Just", "Tactician", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "hojo", name: "北条家", shortName: "北条", color: "#1F618D",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 139.15, capitalLat: 35.25, capitalName: "小田原",
                anchors: [
                    HistoricalAnchor(lon: 139.75, lat: 35.69, provinceName: "江户", weight: 1.05),
                    HistoricalAnchor(lon: 139.49, lat: 35.92, provinceName: "川越", weight: 0.95),
                    HistoricalAnchor(lon: 140.22, lat: 35.72, provinceName: "佐仓", weight: 1.0),
                ],
                rulerName: "北条氏康", rulerTitle: "相模守",
                rulerMilitary: 88, rulerAdmin: 92, rulerDiplo: 84, rulerCharisma: 86,
                rulerTraits: ["Administrator", "Diligent", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "mori", name: "毛利家", shortName: "毛利", color: "#27AE60",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 132.71, capitalLat: 34.67, capitalName: "吉田郡山",
                anchors: [
                    HistoricalAnchor(lon: 132.46, lat: 34.39, provinceName: "广岛", weight: 0.95),
                    HistoricalAnchor(lon: 131.47, lat: 34.18, provinceName: "山口", weight: 1.0),
                    HistoricalAnchor(lon: 133.36, lat: 34.49, provinceName: "福山", weight: 0.9),
                ],
                rulerName: "毛利元就", rulerTitle: "陆奥守",
                rulerMilitary: 90, rulerAdmin: 88, rulerDiplo: 94, rulerCharisma: 88,
                rulerTraits: ["Strategist", "MasterDiplomat", "Patient"]
            ),
            HistoricalNationSpec(
                id: "miyoshi", name: "三好家", shortName: "三好", color: "#D68910",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 135.48, capitalLat: 34.57, capitalName: "堺",
                anchors: [
                    HistoricalAnchor(lon: 134.55, lat: 34.07, provinceName: "德岛", weight: 0.95),
                    HistoricalAnchor(lon: 134.69, lat: 34.84, provinceName: "姬路", weight: 0.95),
                    HistoricalAnchor(lon: 135.53, lat: 34.69, provinceName: "大坂", weight: 0.85),
                ],
                rulerName: "三好长庆", rulerTitle: "修理大夫",
                rulerMilitary: 84, rulerAdmin: 86, rulerDiplo: 82, rulerCharisma: 84,
                rulerTraits: ["Administrator", "Visionary"]
            ),
            HistoricalNationSpec(
                id: "shimazu", name: "岛津家", shortName: "岛津", color: "#34495E",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 130.56, capitalLat: 31.60, capitalName: "鹿儿岛",
                anchors: [
                    HistoricalAnchor(lon: 131.06, lat: 31.72, provinceName: "都城", weight: 0.95),
                    HistoricalAnchor(lon: 131.47, lat: 32.05, provinceName: "佐土原", weight: 0.95),
                ],
                rulerName: "岛津贵久", rulerTitle: "陆奥守",
                rulerMilitary: 88, rulerAdmin: 80, rulerDiplo: 76, rulerCharisma: 84,
                rulerTraits: ["Brave", "BattleHardened", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "otomo", name: "大友家", shortName: "大友", color: "#E67E22",
                culture: "japanese", religion: "catholic", polity: "Kingdom", style: "feudal",
                capitalLon: 131.61, capitalLat: 33.24, capitalName: "府内",
                anchors: [
                    HistoricalAnchor(lon: 131.80, lat: 33.12, provinceName: "臼杵", weight: 0.9),
                    HistoricalAnchor(lon: 131.19, lat: 33.60, provinceName: "中津", weight: 0.9),
                    HistoricalAnchor(lon: 130.88, lat: 33.88, provinceName: "小仓", weight: 0.9),
                ],
                rulerName: "大友宗麟", rulerTitle: "丰后守",
                rulerMilitary: 78, rulerAdmin: 80, rulerDiplo: 86, rulerCharisma: 80,
                rulerTraits: ["Diplomatic", "SeaVision"]
            ),
            HistoricalNationSpec(
                id: "date", name: "伊达家", shortName: "伊达", color: "#16A085",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 140.11, capitalLat: 37.92, capitalName: "米泽",
                anchors: [
                    HistoricalAnchor(lon: 140.87, lat: 38.27, provinceName: "仙台", weight: 1.0),
                    HistoricalAnchor(lon: 140.43, lat: 37.59, provinceName: "二本松", weight: 0.9),
                    HistoricalAnchor(lon: 139.93, lat: 37.49, provinceName: "会津若松", weight: 0.95),
                ],
                rulerName: "伊达晴宗", rulerTitle: "奥州探题",
                rulerMilitary: 78, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 78,
                rulerTraits: ["Ambitious", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "chosokabe", name: "长宗我部家", shortName: "长宗", color: "#2E7D32",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 133.62, capitalLat: 33.60, capitalName: "冈丰",
                anchors: [
                    HistoricalAnchor(lon: 133.53, lat: 33.56, provinceName: "高知", weight: 0.95),
                    HistoricalAnchor(lon: 132.77, lat: 33.84, provinceName: "松山", weight: 0.95),
                ],
                rulerName: "长宗我部国亲", rulerTitle: "宫内少辅",
                rulerMilitary: 82, rulerAdmin: 78, rulerDiplo: 74, rulerCharisma: 80,
                rulerTraits: ["Brave", "Ambitious"]
            ),
            HistoricalNationSpec(
                id: "asakura", name: "朝仓家", shortName: "朝仓", color: "#6C3483",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 136.30, capitalLat: 36.00, capitalName: "一乘谷",
                anchors: [
                    HistoricalAnchor(lon: 136.07, lat: 35.65, provinceName: "敦贺", weight: 0.9),
                    HistoricalAnchor(lon: 136.66, lat: 36.56, provinceName: "金泽", weight: 0.95),
                    HistoricalAnchor(lon: 136.97, lat: 37.04, provinceName: "七尾", weight: 0.9),
                ],
                rulerName: "朝仓义景", rulerTitle: "左卫门督",
                rulerMilitary: 62, rulerAdmin: 74, rulerDiplo: 70, rulerCharisma: 72,
                rulerTraits: ["Scholar", "Patient"]
            ),
            HistoricalNationSpec(
                id: "saito", name: "斋藤家", shortName: "斋藤", color: "#B9770E",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 136.78, capitalLat: 35.43, capitalName: "稻叶山",
                anchors: [
                    HistoricalAnchor(lon: 136.61, lat: 35.36, provinceName: "大垣", weight: 0.85),
                    HistoricalAnchor(lon: 137.25, lat: 36.15, provinceName: "高山", weight: 0.95),
                ],
                rulerName: "斋藤义龙", rulerTitle: "美浓守",
                rulerMilitary: 84, rulerAdmin: 74, rulerDiplo: 70, rulerCharisma: 76,
                rulerTraits: ["BattleHardened", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "ryuzoji", name: "龙造寺家", shortName: "龙造寺", color: "#4A6FA5",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 130.30, capitalLat: 33.26, capitalName: "佐贺",
                anchors: [
                    HistoricalAnchor(lon: 129.87, lat: 32.75, provinceName: "长崎", weight: 0.95),
                    HistoricalAnchor(lon: 130.71, lat: 32.80, provinceName: "熊本", weight: 0.95),
                    HistoricalAnchor(lon: 129.55, lat: 33.37, provinceName: "平户", weight: 0.9),
                ],
                rulerName: "龙造寺隆信", rulerTitle: "山城守",
                rulerMilitary: 86, rulerAdmin: 70, rulerDiplo: 68, rulerCharisma: 80,
                rulerTraits: ["Hawkish", "Brave", "Conqueror"]
            ),
            // v10.0.0 新增 10 家 1560 史实战国大名（共 24 家，AoH3 级超细令制国格局！）
            HistoricalNationSpec(
                id: "matsudaira", name: "松平家", shortName: "松平", color: "#2E86C1",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 137.16, capitalLat: 34.95, capitalName: "冈崎",
                anchors: [
                    HistoricalAnchor(lon: 137.39, lat: 34.77, provinceName: "吉田", weight: 0.85),
                ],
                rulerName: "松平元康", rulerTitle: "藏人佐",
                rulerMilitary: 90, rulerAdmin: 94, rulerDiplo: 90, rulerCharisma: 88,
                rulerTraits: ["Patient", "Strategist", "Administrator", "Lawgiver"]
            ),
            HistoricalNationSpec(
                id: "ashikaga", name: "足利幕府", shortName: "足利", color: "#7D3C98",
                culture: "japanese", religion: "buddhism", polity: "Empire", style: "shogunate",
                capitalLon: 135.77, capitalLat: 35.01, capitalName: "京都",
                anchors: [
                    HistoricalAnchor(lon: 135.58, lat: 35.01, provinceName: "龟山", weight: 0.85),
                    HistoricalAnchor(lon: 135.13, lat: 35.30, provinceName: "福知山", weight: 0.85),
                ],
                rulerName: "足利义辉", rulerTitle: "征夷大将军",
                rulerMilitary: 88, rulerAdmin: 76, rulerDiplo: 82, rulerCharisma: 86,
                rulerTraits: ["Brave", "Just", "NaturalLeader"]
            ),
            HistoricalNationSpec(
                id: "azai", name: "浅井家", shortName: "浅井", color: "#1ABC9C",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 136.28, capitalLat: 35.46, capitalName: "小谷",
                anchors: [
                    HistoricalAnchor(lon: 136.26, lat: 35.38, provinceName: "长滨", weight: 0.8),
                ],
                rulerName: "浅井长政", rulerTitle: "备前守",
                rulerMilitary: 84, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 86,
                rulerTraits: ["Brave", "Just", "Charismatic"]
            ),
            HistoricalNationSpec(
                id: "rokkaku", name: "六角家", shortName: "六角", color: "#9B59B6",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 136.16, capitalLat: 35.15, capitalName: "观音寺",
                anchors: [
                    HistoricalAnchor(lon: 136.13, lat: 34.77, provinceName: "上野伊贺", weight: 0.85),
                ],
                rulerName: "六角义贤", rulerTitle: "左京大夫",
                rulerMilitary: 76, rulerAdmin: 80, rulerDiplo: 82, rulerCharisma: 78,
                rulerTraits: ["Administrator", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "kitabatake", name: "北畠家", shortName: "北畠", color: "#D35400",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 136.53, capitalLat: 34.58, capitalName: "松坂",
                anchors: [
                    HistoricalAnchor(lon: 136.51, lat: 34.72, provinceName: "津城", weight: 0.85),
                    HistoricalAnchor(lon: 135.17, lat: 34.23, provinceName: "和歌山", weight: 0.95),
                    HistoricalAnchor(lon: 135.99, lat: 33.72, provinceName: "新宫", weight: 0.9),
                ],
                rulerName: "北畠具教", rulerTitle: "伊势国司",
                rulerMilitary: 88, rulerAdmin: 74, rulerDiplo: 76, rulerCharisma: 82,
                rulerTraits: ["Brave", "BattleHardened", "Scholar"]
            ),
            HistoricalNationSpec(
                id: "amago", name: "尼子家", shortName: "尼子", color: "#2471A3",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 133.19, capitalLat: 35.36, capitalName: "月山富田",
                anchors: [
                    HistoricalAnchor(lon: 134.24, lat: 35.50, provinceName: "鸟取", weight: 0.95),
                    HistoricalAnchor(lon: 133.33, lat: 35.43, provinceName: "米子", weight: 0.9),
                    HistoricalAnchor(lon: 134.83, lat: 35.30, provinceName: "竹田", weight: 0.85),
                ],
                rulerName: "尼子晴久", rulerTitle: "修理大夫",
                rulerMilitary: 84, rulerAdmin: 82, rulerDiplo: 78, rulerCharisma: 82,
                rulerTraits: ["BattleHardened", "Stubborn", "Administrator"]
            ),
            HistoricalNationSpec(
                id: "ukita", name: "宇喜多家", shortName: "宇喜多", color: "#C0392B",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 133.93, capitalLat: 34.66, capitalName: "冈山",
                anchors: [
                    HistoricalAnchor(lon: 134.00, lat: 35.07, provinceName: "津山", weight: 0.85),
                ],
                rulerName: "宇喜多直家", rulerTitle: "和泉守",
                rulerMilitary: 82, rulerAdmin: 86, rulerDiplo: 92, rulerCharisma: 80,
                rulerTraits: ["Strategist", "Ambitious", "MasterDiplomat"]
            ),
            HistoricalNationSpec(
                id: "satake", name: "佐竹家", shortName: "佐竹", color: "#5499C7",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 140.53, capitalLat: 36.54, capitalName: "太田",
                anchors: [
                    HistoricalAnchor(lon: 140.47, lat: 36.37, provinceName: "水户", weight: 0.9),
                    HistoricalAnchor(lon: 139.88, lat: 36.56, provinceName: "宇都宫", weight: 0.95),
                    HistoricalAnchor(lon: 140.21, lat: 37.13, provinceName: "白河", weight: 0.9),
                ],
                rulerName: "佐竹义昭", rulerTitle: "常陆介",
                rulerMilitary: 82, rulerAdmin: 82, rulerDiplo: 80, rulerCharisma: 82,
                rulerTraits: ["Veteran", "Patient", "Administrator"]
            ),
            HistoricalNationSpec(
                id: "mogami", name: "最上家", shortName: "最上", color: "#5D6D7E",
                culture: "japanese", religion: "buddhism", polity: "Kingdom", style: "feudal",
                capitalLon: 140.34, capitalLat: 38.25, capitalName: "山形",
                anchors: [
                    HistoricalAnchor(lon: 139.83, lat: 38.73, provinceName: "庄内", weight: 0.95),
                    HistoricalAnchor(lon: 140.10, lat: 39.72, provinceName: "秋田", weight: 1.0),
                ],
                rulerName: "最上义守", rulerTitle: "出羽守",
                rulerMilitary: 76, rulerAdmin: 80, rulerDiplo: 84, rulerCharisma: 78,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "nanbu", name: "南部家", shortName: "南部", color: "#1E8449",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "feudal",
                capitalLon: 141.15, capitalLat: 39.70, capitalName: "盛冈",
                anchors: [
                    HistoricalAnchor(lon: 141.49, lat: 40.51, provinceName: "八户", weight: 1.0),
                    HistoricalAnchor(lon: 140.46, lat: 40.60, provinceName: "弘前", weight: 1.0),
                ],
                rulerName: "南部晴政", rulerTitle: "大膳大夫",
                rulerMilitary: 84, rulerAdmin: 80, rulerDiplo: 76, rulerCharisma: 82,
                rulerTraits: ["Conqueror", "Brave", "CavalryTradition"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "imagawa", defenderId: "oda", casusBelli: "桶狭间合战 · 尾张上洛战"),
            HistoricalWarSpec(attackerId: "takeda", defenderId: "uesugi", casusBelli: "川中岛合战 · 信浓争锋"),
            HistoricalWarSpec(attackerId: "mori", defenderId: "amago", casusBelli: "月山富田攻防 · 山阴争霸"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "甲相骏三国同盟", memberIds: ["takeda", "hojo", "imagawa"]),
            HistoricalAllianceSpec(name: "越前北近江同盟", memberIds: ["asakura", "azai"]),
        ],
        openingVassals: [
            HistoricalVassalSpec(overlordId: "imagawa", vassalId: "matsudaira", tributeRate: 0.15),
        ],
        tags: ["日本战国", "桶狭间", "24家大名", "AoH3级精图"],
        rebelMode: "historical",
        eraOverride: "gunpowder"
    )

    // 剧本 6：拿破仑欧陆 · 远征莫斯科（公元 1812 年 · 欧洲全图 · 10 国）
    private static let napoleon1812 = HistoricalScenario(
        id: "napoleon_1812",
        title: "拿破仑欧陆 · 远征莫斯科",
        subtitle: "法兰西帝国巅峰 · 大军东征",
        region: .europe,
        year: 1812,
        eraName: "法兰西第一帝国",
        description: "1812年夏，拿破仑率六十万大军强渡涅曼河远征莫斯科。法兰西第一帝国及其莱茵邦联、华沙大公国与意大利诸邦雄踞欧陆，大英帝国以制海权与西班牙半岛战线牵制法军，俄、奥、普、奥斯曼与北欧诸王各自博弈。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 260,
        nations: [
            HistoricalNationSpec(
                id: "france", name: "法兰西第一帝国", shortName: "法", color: "#2557A7",
                culture: "french", religion: "catholic", polity: "Empire", style: "empire",
                capitalLon: 2.3, capitalLat: 48.9, capitalName: "巴黎",
                anchors: [
                    HistoricalAnchor(lon: 4.8, lat: 45.8, provinceName: "里昂", weight: 1.25),
                    HistoricalAnchor(lon: 5.4, lat: 43.3, provinceName: "马赛", weight: 1.2),
                    HistoricalAnchor(lon: -0.6, lat: 44.8, provinceName: "波尔多", weight: 1.25),
                    HistoricalAnchor(lon: 4.4, lat: 50.8, provinceName: "布鲁塞尔", weight: 1.15),
                    HistoricalAnchor(lon: 4.9, lat: 52.4, provinceName: "阿姆斯特丹", weight: 1.15),
                    HistoricalAnchor(lon: 8.7, lat: 50.1, provinceName: "法兰克福", weight: 1.2),
                    HistoricalAnchor(lon: 11.6, lat: 48.1, provinceName: "慕尼黑", weight: 1.1),
                    HistoricalAnchor(lon: 9.2, lat: 45.5, provinceName: "米兰", weight: 1.2),
                    HistoricalAnchor(lon: 12.5, lat: 41.9, provinceName: "罗马", weight: 1.25),
                    HistoricalAnchor(lon: 14.3, lat: 40.8, provinceName: "那不勒斯", weight: 1.2),
                    HistoricalAnchor(lon: 21.0, lat: 52.2, provinceName: "华沙", weight: 1.2),
                    HistoricalAnchor(lon: 9.0, lat: 42.2, provinceName: "阿雅克肖", weight: 1.1),
                ],
                rulerName: "拿破仑·波拿巴", rulerTitle: "皇帝",
                rulerMilitary: 99, rulerAdmin: 92, rulerDiplo: 82, rulerCharisma: 96,
                rulerTraits: ["Genius", "Strategist", "Conqueror", "Lawgiver"]
            ),
            HistoricalNationSpec(
                id: "russia", name: "俄罗斯帝国", shortName: "俄", color: "#2D7D4F",
                culture: "slavic", religion: "orthodox", polity: "Empire", style: "tsardom",
                capitalLon: 30.3, capitalLat: 59.9, capitalName: "圣彼得堡",
                anchors: [
                    HistoricalAnchor(lon: 37.6, lat: 55.8, provinceName: "莫斯科", weight: 1.5),
                    HistoricalAnchor(lon: 30.5, lat: 50.4, provinceName: "基辅", weight: 1.35),
                    HistoricalAnchor(lon: 27.6, lat: 53.9, provinceName: "明斯克", weight: 1.25),
                    HistoricalAnchor(lon: 32.0, lat: 54.8, provinceName: "斯摩棱斯克", weight: 1.3),
                    HistoricalAnchor(lon: 46.0, lat: 55.8, provinceName: "喀山", weight: 1.6),
                    HistoricalAnchor(lon: 30.7, lat: 46.5, provinceName: "敖德萨", weight: 1.25),
                    HistoricalAnchor(lon: 25.0, lat: 60.2, provinceName: "赫尔辛基", weight: 1.35),
                    HistoricalAnchor(lon: 24.1, lat: 56.9, provinceName: "里加", weight: 1.15),
                    HistoricalAnchor(lon: 39.7, lat: 47.2, provinceName: "顿河畔罗斯托夫", weight: 1.5),
                    HistoricalAnchor(lon: 44.8, lat: 41.7, provinceName: "第比利斯", weight: 1.35),
                ],
                rulerName: "亚历山大一世", rulerTitle: "沙皇",
                rulerMilitary: 80, rulerAdmin: 82, rulerDiplo: 88, rulerCharisma: 86,
                rulerTraits: ["Diplomatic", "Patient", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "britain", name: "大英帝国", shortName: "英", color: "#C63637",
                culture: "english", religion: "protestant", polity: "Federation", style: "union",
                capitalLon: -0.1, capitalLat: 51.5, capitalName: "伦敦",
                anchors: [
                    HistoricalAnchor(lon: -3.2, lat: 55.9, provinceName: "爱丁堡", weight: 1.25),
                    HistoricalAnchor(lon: -2.2, lat: 53.5, provinceName: "曼彻斯特", weight: 1.15),
                    HistoricalAnchor(lon: -6.3, lat: 53.3, provinceName: "都柏林", weight: 1.3),
                    HistoricalAnchor(lon: 13.4, lat: 38.1, provinceName: "巴勒莫", weight: 1.15),
                    HistoricalAnchor(lon: 9.1, lat: 39.2, provinceName: "卡利亚里", weight: 1.1),
                ],
                rulerName: "利物浦勋爵", rulerTitle: "首相",
                rulerMilitary: 78, rulerAdmin: 88, rulerDiplo: 90, rulerCharisma: 80,
                rulerTraits: ["NavalMastery", "Financier", "SeaVision"]
            ),
            HistoricalNationSpec(
                id: "austria", name: "奥地利帝国", shortName: "奥", color: "#D9A726",
                culture: "german", religion: "catholic", polity: "Empire", style: "empire",
                capitalLon: 16.4, capitalLat: 48.2, capitalName: "维也纳",
                anchors: [
                    HistoricalAnchor(lon: 14.4, lat: 50.1, provinceName: "布拉格", weight: 1.1),
                    HistoricalAnchor(lon: 19.0, lat: 47.5, provinceName: "布达佩斯", weight: 1.25),
                    HistoricalAnchor(lon: 19.9, lat: 50.1, provinceName: "克拉科夫", weight: 1.05),
                    HistoricalAnchor(lon: 12.3, lat: 45.4, provinceName: "威尼斯", weight: 1.0),
                    HistoricalAnchor(lon: 23.6, lat: 46.8, provinceName: "克卢日", weight: 1.15),
                ],
                rulerName: "弗朗茨一世", rulerTitle: "皇帝",
                rulerMilitary: 70, rulerAdmin: 80, rulerDiplo: 88, rulerCharisma: 76,
                rulerTraits: ["MasterDiplomat", "Patient"]
            ),
            HistoricalNationSpec(
                id: "prussia", name: "普鲁士王国", shortName: "普", color: "#465362",
                culture: "german", religion: "protestant", polity: "Kingdom", style: "absolute",
                capitalLon: 13.4, capitalLat: 52.5, capitalName: "柏林",
                anchors: [
                    HistoricalAnchor(lon: 20.5, lat: 54.7, provinceName: "柯尼斯堡", weight: 1.1),
                    HistoricalAnchor(lon: 17.0, lat: 51.1, provinceName: "布雷斯劳", weight: 1.05),
                    HistoricalAnchor(lon: 14.6, lat: 53.4, provinceName: "什切青", weight: 1.0),
                ],
                rulerName: "腓特烈·威廉三世", rulerTitle: "国王",
                rulerMilitary: 76, rulerAdmin: 78, rulerDiplo: 72, rulerCharisma: 72,
                rulerTraits: ["Reformer", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "spain", name: "西班牙王国", shortName: "西", color: "#E09F1F",
                culture: "spanish", religion: "catholic", polity: "Kingdom", style: "constitutional",
                capitalLon: -3.7, capitalLat: 40.4, capitalName: "马德里",
                anchors: [
                    HistoricalAnchor(lon: -6.0, lat: 37.4, provinceName: "塞维利亚", weight: 1.2),
                    HistoricalAnchor(lon: 2.2, lat: 41.4, provinceName: "巴塞罗那", weight: 1.1),
                    HistoricalAnchor(lon: -0.4, lat: 39.5, provinceName: "瓦伦西亚", weight: 1.1),
                    HistoricalAnchor(lon: -5.6, lat: 42.6, provinceName: "莱昂", weight: 1.15),
                ],
                rulerName: "费尔南多七世", rulerTitle: "国王",
                rulerMilitary: 64, rulerAdmin: 60, rulerDiplo: 66, rulerCharisma: 68,
                rulerTraits: ["Brave", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "portugal", name: "葡萄牙王国", shortName: "葡", color: "#1E8449",
                culture: "portuguese", religion: "catholic", polity: "Kingdom", style: "absolute",
                capitalLon: -9.1, capitalLat: 38.7, capitalName: "里斯本",
                anchors: [
                    HistoricalAnchor(lon: -8.6, lat: 41.1, provinceName: "波尔图", weight: 0.9),
                    HistoricalAnchor(lon: -8.0, lat: 37.0, provinceName: "法鲁", weight: 0.85),
                ],
                rulerName: "若昂六世", rulerTitle: "摄政王",
                rulerMilitary: 62, rulerAdmin: 72, rulerDiplo: 78, rulerCharisma: 70,
                rulerTraits: ["SeaVision", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "ottoman", name: "奥斯曼帝国", shortName: "奥斯曼", color: "#196F3D",
                culture: "turkic", religion: "islam", polity: "Kingdom", style: "sultanate",
                capitalLon: 28.9, capitalLat: 41.0, capitalName: "君士坦丁堡",
                anchors: [
                    HistoricalAnchor(lon: 23.3, lat: 42.7, provinceName: "索菲亚", weight: 1.2),
                    HistoricalAnchor(lon: 23.7, lat: 38.0, provinceName: "雅典", weight: 1.25),
                    HistoricalAnchor(lon: 20.5, lat: 44.8, provinceName: "贝尔格莱德", weight: 1.15),
                    HistoricalAnchor(lon: 32.9, lat: 39.9, provinceName: "安卡拉", weight: 1.45),
                    HistoricalAnchor(lon: 27.1, lat: 38.4, provinceName: "伊兹密尔", weight: 1.25),
                    HistoricalAnchor(lon: 39.7, lat: 41.0, provinceName: "特拉布宗", weight: 1.35),
                    HistoricalAnchor(lon: 25.1, lat: 35.3, provinceName: "伊拉克利翁", weight: 1.15),
                    HistoricalAnchor(lon: 10.2, lat: 36.8, provinceName: "突尼斯", weight: 1.4),
                    HistoricalAnchor(lon: 3.0, lat: 36.7, provinceName: "阿尔及尔", weight: 1.45),
                ],
                rulerName: "马哈茂德二世", rulerTitle: "苏丹",
                rulerMilitary: 76, rulerAdmin: 82, rulerDiplo: 76, rulerCharisma: 80,
                rulerTraits: ["Reformer", "IronFist"]
            ),
            HistoricalNationSpec(
                id: "sweden", name: "瑞典王国", shortName: "瑞", color: "#2874A6",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 18.1, capitalLat: 59.3, capitalName: "斯德哥尔摩",
                anchors: [
                    HistoricalAnchor(lon: 12.0, lat: 57.7, provinceName: "哥德堡", weight: 1.15),
                    HistoricalAnchor(lon: 20.3, lat: 63.8, provinceName: "于默奥", weight: 1.35),
                ],
                rulerName: "贝尔纳多特", rulerTitle: "王储摄政",
                rulerMilitary: 84, rulerAdmin: 80, rulerDiplo: 84, rulerCharisma: 82,
                rulerTraits: ["Strategist", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "denmark", name: "丹麦-挪威", shortName: "丹", color: "#A93226",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "absolute",
                capitalLon: 12.6, capitalLat: 55.7, capitalName: "哥本哈根",
                anchors: [
                    HistoricalAnchor(lon: 10.7, lat: 59.9, provinceName: "奥斯陆", weight: 1.25),
                    HistoricalAnchor(lon: 5.3, lat: 60.4, provinceName: "卑尔根", weight: 1.2),
                    HistoricalAnchor(lon: 10.4, lat: 63.4, provinceName: "特隆赫姆", weight: 1.3),
                ],
                rulerName: "弗雷德里克六世", rulerTitle: "国王",
                rulerMilitary: 68, rulerAdmin: 76, rulerDiplo: 70, rulerCharisma: 72,
                rulerTraits: ["NavalMastery", "Patient"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "france", defenderId: "russia", casusBelli: "1812俄法战争 · 远征莫斯科"),
            HistoricalWarSpec(attackerId: "france", defenderId: "britain", casusBelli: "拿破仑战争 · 欧陆封锁"),
            HistoricalWarSpec(attackerId: "france", defenderId: "spain", casusBelli: "伊比利亚半岛战争"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "反法同盟", memberIds: ["britain", "russia", "portugal", "spain"]),
            HistoricalAllianceSpec(name: "法兰西大陆同盟", memberIds: ["france", "denmark"]),
        ],
        tags: ["拿破仑", "欧洲", "近代", "列强"],
        rebelMode: "historical",
        eraOverride: "gunpowder"
    )

    // 剧本 7：第一次世界大战 · 欧陆炮火（公元 1914 年 8 月 · 欧洲精图 · 20 国细化）
    private static let ww1_1914 = HistoricalScenario(
        id: "ww1_1914",
        title: "第一次世界大战 · 欧陆炮火",
        subtitle: "1914年8月 · 同盟国 vs 协约国 · 20国欧洲精图",
        region: .europe,
        year: 1914,
        eraName: "一战欧洲",
        description: "1914年8月，萨拉热窝枪声引爆欧陆大战。德军按施里芬计划经低地三国突击法国，奥匈挥师塞尔维亚与俄国，奥斯曼封锁海峡；20国细化局部欧洲战区，告别粗略世界大地图，精准呈现西线堑壕、东线坦能堡、巴尔干与阿尔卑斯山脉防线。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 310,
        nations: [
            HistoricalNationSpec(
                id: "germany", name: "德意志帝国", shortName: "德", color: "#4A5568",
                culture: "german", religion: "protestant", polity: "Empire", style: "dualMonarchy",
                capitalLon: 13.4, capitalLat: 52.5, capitalName: "柏林",
                anchors: [
                    HistoricalAnchor(lon: 11.6, lat: 48.1, provinceName: "慕尼黑", weight: 1.05),
                    HistoricalAnchor(lon: 10.0, lat: 53.5, provinceName: "汉堡", weight: 1.05),
                    HistoricalAnchor(lon: 7.0, lat: 50.9, provinceName: "科隆", weight: 1.0),
                    HistoricalAnchor(lon: 7.75, lat: 48.58, provinceName: "斯特拉斯堡", weight: 0.9),
                    HistoricalAnchor(lon: 20.5, lat: 54.7, provinceName: "柯尼斯堡", weight: 1.05),
                    HistoricalAnchor(lon: 17.0, lat: 51.1, provinceName: "布雷斯劳", weight: 1.0),
                    HistoricalAnchor(lon: 16.9, lat: 52.4, provinceName: "波森", weight: 0.95),
                    HistoricalAnchor(lon: 18.6, lat: 54.3, provinceName: "但泽", weight: 0.95),
                ],
                rulerName: "威廉二世", rulerTitle: "德皇",
                rulerMilitary: 84, rulerAdmin: 82, rulerDiplo: 66, rulerCharisma: 80,
                rulerTraits: ["Hawkish", "Ambitious", "NavalMastery"]
            ),
            HistoricalNationSpec(
                id: "austria_hungary", name: "奥匈帝国", shortName: "奥匈", color: "#D4A017",
                culture: "german", religion: "catholic", polity: "Empire", style: "dualMonarchy",
                capitalLon: 16.4, capitalLat: 48.2, capitalName: "维也纳",
                anchors: [
                    HistoricalAnchor(lon: 19.0, lat: 47.5, provinceName: "布达佩斯", weight: 1.15),
                    HistoricalAnchor(lon: 14.4, lat: 50.1, provinceName: "布拉格", weight: 1.05),
                    HistoricalAnchor(lon: 19.9, lat: 50.1, provinceName: "克拉科夫", weight: 1.0),
                    HistoricalAnchor(lon: 24.0, lat: 49.8, provinceName: "伦贝格", weight: 1.0),
                    HistoricalAnchor(lon: 16.0, lat: 45.8, provinceName: "萨格勒布", weight: 0.95),
                    HistoricalAnchor(lon: 18.4, lat: 43.9, provinceName: "萨拉热窝", weight: 0.95),
                    HistoricalAnchor(lon: 23.6, lat: 46.8, provinceName: "克卢日", weight: 1.0),
                    HistoricalAnchor(lon: 13.8, lat: 45.65, provinceName: "的里雅斯特", weight: 0.9),
                ],
                rulerName: "弗朗茨·约瑟夫", rulerTitle: "皇帝",
                rulerMilitary: 72, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 78,
                rulerTraits: ["Patient", "Just"]
            ),
            HistoricalNationSpec(
                id: "ottoman", name: "奥斯曼帝国", shortName: "奥斯曼", color: "#1B7A43",
                culture: "turkic", religion: "islam", polity: "Kingdom", style: "sultanate",
                capitalLon: 28.9, capitalLat: 41.0, capitalName: "君士坦丁堡",
                anchors: [
                    HistoricalAnchor(lon: 32.9, lat: 39.9, provinceName: "安卡拉", weight: 1.25),
                    HistoricalAnchor(lon: 27.1, lat: 38.4, provinceName: "伊兹密尔", weight: 1.15),
                    HistoricalAnchor(lon: 35.3, lat: 37.0, provinceName: "阿达纳", weight: 1.2),
                    HistoricalAnchor(lon: 41.3, lat: 39.9, provinceName: "埃尔祖鲁姆", weight: 1.3),
                    HistoricalAnchor(lon: 36.3, lat: 33.5, provinceName: "大马士革", weight: 1.2),
                ],
                rulerName: "穆罕默德五世", rulerTitle: "苏丹",
                rulerMilitary: 68, rulerAdmin: 66, rulerDiplo: 68, rulerCharisma: 70,
                rulerTraits: ["Veteran", "Patient"]
            ),
            HistoricalNationSpec(
                id: "britain", name: "大英帝国", shortName: "英", color: "#C63637",
                culture: "english", religion: "protestant", polity: "Federation", style: "union",
                capitalLon: -0.1, capitalLat: 51.5, capitalName: "伦敦",
                anchors: [
                    HistoricalAnchor(lon: -3.2, lat: 55.9, provinceName: "爱丁堡", weight: 1.25),
                    HistoricalAnchor(lon: -2.2, lat: 53.5, provinceName: "曼彻斯特", weight: 1.15),
                    HistoricalAnchor(lon: -6.26, lat: 53.35, provinceName: "都柏林", weight: 1.25),
                    HistoricalAnchor(lon: -5.9, lat: 54.6, provinceName: "贝尔法斯特", weight: 1.0),
                    HistoricalAnchor(lon: 33.4, lat: 35.2, provinceName: "尼科西亚", weight: 1.0),
                ],
                rulerName: "乔治五世", rulerTitle: "国王",
                rulerMilitary: 82, rulerAdmin: 88, rulerDiplo: 90, rulerCharisma: 86,
                rulerTraits: ["NavalMastery", "SeaVision", "Financier"]
            ),
            HistoricalNationSpec(
                id: "france", name: "法兰西第三共和国", shortName: "法", color: "#2B5C9E",
                culture: "french", religion: "catholic", polity: "Republic", style: "parliamentary",
                capitalLon: 2.3, capitalLat: 48.9, capitalName: "巴黎",
                anchors: [
                    HistoricalAnchor(lon: 4.8, lat: 45.8, provinceName: "里昂", weight: 1.15),
                    HistoricalAnchor(lon: 5.4, lat: 43.3, provinceName: "马赛", weight: 1.15),
                    HistoricalAnchor(lon: -0.6, lat: 44.8, provinceName: "波尔多", weight: 1.2),
                    HistoricalAnchor(lon: 3.1, lat: 50.6, provinceName: "里尔", weight: 0.9),
                    HistoricalAnchor(lon: 5.4, lat: 49.16, provinceName: "凡尔登", weight: 0.9),
                    HistoricalAnchor(lon: 3.0, lat: 36.7, provinceName: "阿尔及尔", weight: 1.4),
                    HistoricalAnchor(lon: 10.2, lat: 36.8, provinceName: "突尼斯", weight: 1.25),
                ],
                rulerName: "雷蒙·普恩加莱", rulerTitle: "总统",
                rulerMilitary: 78, rulerAdmin: 82, rulerDiplo: 84, rulerCharisma: 80,
                rulerTraits: ["BattleHardened", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "russia", name: "俄罗斯帝国", shortName: "俄", color: "#2E8B57",
                culture: "slavic", religion: "orthodox", polity: "Empire", style: "tsardom",
                capitalLon: 30.3, capitalLat: 59.9, capitalName: "圣彼得堡",
                anchors: [
                    HistoricalAnchor(lon: 37.6, lat: 55.8, provinceName: "莫斯科", weight: 1.5),
                    HistoricalAnchor(lon: 21.0, lat: 52.2, provinceName: "华沙", weight: 1.1),
                    HistoricalAnchor(lon: 25.0, lat: 60.2, provinceName: "赫尔辛基", weight: 1.3),
                    HistoricalAnchor(lon: 24.1, lat: 56.9, provinceName: "里加", weight: 1.1),
                    HistoricalAnchor(lon: 27.6, lat: 53.9, provinceName: "明斯克", weight: 1.2),
                    HistoricalAnchor(lon: 30.5, lat: 50.4, provinceName: "基辅", weight: 1.3),
                    HistoricalAnchor(lon: 30.7, lat: 46.5, provinceName: "敖德萨", weight: 1.2),
                    HistoricalAnchor(lon: 44.5, lat: 48.7, provinceName: "察里津", weight: 1.55),
                    HistoricalAnchor(lon: 44.8, lat: 41.7, provinceName: "第比利斯", weight: 1.4),
                    HistoricalAnchor(lon: 40.5, lat: 64.5, provinceName: "阿尔汉格尔斯克", weight: 1.6),
                ],
                rulerName: "尼古拉二世", rulerTitle: "沙皇",
                rulerMilitary: 68, rulerAdmin: 64, rulerDiplo: 72, rulerCharisma: 74,
                rulerTraits: ["Stubborn", "Just"]
            ),
            HistoricalNationSpec(
                id: "italy", name: "意大利王国", shortName: "意", color: "#3E8E41",
                culture: "italian", religion: "catholic", polity: "Kingdom", style: "constitutional",
                capitalLon: 12.5, capitalLat: 41.9, capitalName: "罗马",
                anchors: [
                    HistoricalAnchor(lon: 9.2, lat: 45.5, provinceName: "米兰", weight: 1.05),
                    HistoricalAnchor(lon: 12.3, lat: 45.4, provinceName: "威尼斯", weight: 0.95),
                    HistoricalAnchor(lon: 14.3, lat: 40.8, provinceName: "那不勒斯", weight: 1.1),
                    HistoricalAnchor(lon: 13.4, lat: 38.1, provinceName: "巴勒莫", weight: 1.15),
                ],
                rulerName: "维托里奥·埃马努埃莱三世", rulerTitle: "国王",
                rulerMilitary: 70, rulerAdmin: 74, rulerDiplo: 78, rulerCharisma: 74,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "serbia", name: "塞尔维亚王国", shortName: "塞", color: "#6A5ACD",
                culture: "slavic", religion: "orthodox", polity: "Kingdom", style: "constitutional",
                capitalLon: 20.46, capitalLat: 44.82, capitalName: "贝尔格莱德",
                anchors: [
                    HistoricalAnchor(lon: 21.9, lat: 43.3, provinceName: "尼什", weight: 0.85),
                    HistoricalAnchor(lon: 21.4, lat: 42.0, provinceName: "斯科普里", weight: 0.85),
                ],
                rulerName: "彼得一世", rulerTitle: "国王",
                rulerMilitary: 82, rulerAdmin: 76, rulerDiplo: 78, rulerCharisma: 86,
                rulerTraits: ["Brave", "BattleHardened", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "belgium", name: "比利时王国", shortName: "比", color: "#D4A017",
                culture: "french", religion: "catholic", polity: "Kingdom", style: "constitutional",
                capitalLon: 4.35, capitalLat: 50.85, capitalName: "布鲁塞尔",
                anchors: [
                    HistoricalAnchor(lon: 4.4, lat: 51.2, provinceName: "安特卫普", weight: 0.72),
                    HistoricalAnchor(lon: 5.57, lat: 50.63, provinceName: "列日", weight: 0.72),
                ],
                rulerName: "阿尔贝一世", rulerTitle: "国王",
                rulerMilitary: 84, rulerAdmin: 80, rulerDiplo: 82, rulerCharisma: 88,
                rulerTraits: ["Brave", "Beloved", "Just"]
            ),
            HistoricalNationSpec(
                id: "netherlands", name: "荷兰王国", shortName: "荷", color: "#E67E22",
                culture: "dutch", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 4.9, capitalLat: 52.4, capitalName: "阿姆斯特丹",
                anchors: [
                    HistoricalAnchor(lon: 4.5, lat: 51.9, provinceName: "鹿特丹", weight: 0.78),
                    HistoricalAnchor(lon: 6.6, lat: 53.2, provinceName: "格罗宁根", weight: 0.78),
                ],
                rulerName: "威廉明娜", rulerTitle: "女王",
                rulerMilitary: 64, rulerAdmin: 86, rulerDiplo: 84, rulerCharisma: 88,
                rulerTraits: ["Financier", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "luxembourg", name: "卢森堡大公国", shortName: "卢", color: "#5DADE2",
                culture: "french", religion: "catholic", polity: "Kingdom", style: "principality",
                capitalLon: 6.13, capitalLat: 49.61, capitalName: "卢森堡",
                anchors: [],
                rulerName: "玛丽-阿德莱德", rulerTitle: "女大公",
                rulerMilitary: 50, rulerAdmin: 76, rulerDiplo: 80, rulerCharisma: 80,
                rulerTraits: ["Dovish", "Patient"]
            ),
            HistoricalNationSpec(
                id: "switzerland", name: "瑞士联邦", shortName: "瑞士", color: "#D93838",
                culture: "german", religion: "protestant", polity: "Federation", style: "confederation",
                capitalLon: 7.45, capitalLat: 46.95, capitalName: "伯尔尼",
                anchors: [
                    HistoricalAnchor(lon: 8.54, lat: 47.37, provinceName: "苏黎世", weight: 0.72),
                    HistoricalAnchor(lon: 6.14, lat: 46.20, provinceName: "日内瓦", weight: 0.72),
                ],
                rulerName: "乌尔里希·维勒", rulerTitle: "联邦总司令",
                rulerMilitary: 84, rulerAdmin: 86, rulerDiplo: 86, rulerCharisma: 84,
                rulerTraits: ["Patient", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "spain", name: "西班牙王国", shortName: "西", color: "#E2B13C",
                culture: "spanish", religion: "catholic", polity: "Kingdom", style: "constitutional",
                capitalLon: -3.7, capitalLat: 40.4, capitalName: "马德里",
                anchors: [
                    HistoricalAnchor(lon: 2.2, lat: 41.4, provinceName: "巴塞罗那", weight: 1.1),
                    HistoricalAnchor(lon: -6.0, lat: 37.4, provinceName: "塞维利亚", weight: 1.15),
                    HistoricalAnchor(lon: -0.4, lat: 39.5, provinceName: "瓦伦西亚", weight: 1.05),
                ],
                rulerName: "阿方索十三世", rulerTitle: "国王",
                rulerMilitary: 66, rulerAdmin: 72, rulerDiplo: 78, rulerCharisma: 76,
                rulerTraits: ["Dovish", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "portugal", name: "葡萄牙共和国", shortName: "葡", color: "#2D7A4F",
                culture: "portuguese", religion: "catholic", polity: "Republic", style: "presidential",
                capitalLon: -9.14, capitalLat: 38.72, capitalName: "里斯本",
                anchors: [
                    HistoricalAnchor(lon: -8.61, lat: 41.15, provinceName: "波尔图", weight: 0.85),
                ],
                rulerName: "曼努埃尔·德·阿里亚加", rulerTitle: "总统",
                rulerMilitary: 64, rulerAdmin: 74, rulerDiplo: 78, rulerCharisma: 74,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "sweden", name: "瑞典王国", shortName: "瑞", color: "#2E75B6",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 18.1, capitalLat: 59.3, capitalName: "斯德哥尔摩",
                anchors: [
                    HistoricalAnchor(lon: 12.0, lat: 57.7, provinceName: "哥德堡", weight: 1.05),
                    HistoricalAnchor(lon: 20.3, lat: 63.8, provinceName: "于默奥", weight: 1.25),
                ],
                rulerName: "古斯塔夫五世", rulerTitle: "国王",
                rulerMilitary: 64, rulerAdmin: 82, rulerDiplo: 84, rulerCharisma: 80,
                rulerTraits: ["Dovish", "Financier"]
            ),
            HistoricalNationSpec(
                id: "norway", name: "挪威王国", shortName: "挪", color: "#9E3B3B",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 10.7, capitalLat: 59.9, capitalName: "奥斯陆",
                anchors: [
                    HistoricalAnchor(lon: 5.3, lat: 60.4, provinceName: "卑尔根", weight: 1.1),
                    HistoricalAnchor(lon: 10.4, lat: 63.4, provinceName: "特隆赫姆", weight: 1.2),
                ],
                rulerName: "哈康七世", rulerTitle: "国王",
                rulerMilitary: 68, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 84,
                rulerTraits: ["Just", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "denmark", name: "丹麦王国", shortName: "丹", color: "#B83B4B",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 12.57, capitalLat: 55.68, capitalName: "哥本哈根",
                anchors: [
                    HistoricalAnchor(lon: 10.21, lat: 56.16, provinceName: "奥胡斯", weight: 0.78),
                ],
                rulerName: "克里斯蒂安十世", rulerTitle: "国王",
                rulerMilitary: 62, rulerAdmin: 80, rulerDiplo: 82, rulerCharisma: 84,
                rulerTraits: ["Dovish", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "romania", name: "罗马尼亚王国", shortName: "罗", color: "#C9A227",
                culture: "roman", religion: "orthodox", polity: "Kingdom", style: "constitutional",
                capitalLon: 26.1, capitalLat: 44.4, capitalName: "布加勒斯特",
                anchors: [
                    HistoricalAnchor(lon: 28.6, lat: 44.2, provinceName: "康斯坦察", weight: 0.9),
                    HistoricalAnchor(lon: 27.6, lat: 47.2, provinceName: "雅西", weight: 0.9),
                ],
                rulerName: "卡罗尔一世", rulerTitle: "国王",
                rulerMilitary: 74, rulerAdmin: 80, rulerDiplo: 80, rulerCharisma: 78,
                rulerTraits: ["Veteran", "Patient"]
            ),
            HistoricalNationSpec(
                id: "bulgaria", name: "保加利亚王国", shortName: "保", color: "#4E8B63",
                culture: "slavic", religion: "orthodox", polity: "Kingdom", style: "absolute",
                capitalLon: 23.32, capitalLat: 42.70, capitalName: "索菲亚",
                anchors: [
                    HistoricalAnchor(lon: 24.75, lat: 42.14, provinceName: "普罗夫迪夫", weight: 0.85),
                    HistoricalAnchor(lon: 27.91, lat: 43.21, provinceName: "瓦尔纳", weight: 0.82),
                ],
                rulerName: "斐迪南一世", rulerTitle: "沙皇",
                rulerMilitary: 72, rulerAdmin: 76, rulerDiplo: 78, rulerCharisma: 74,
                rulerTraits: ["Ambitious", "Hawkish"]
            ),
            HistoricalNationSpec(
                id: "greece", name: "希腊王国", shortName: "希", color: "#4DA6E0",
                culture: "greek", religion: "orthodox", polity: "Kingdom", style: "constitutional",
                capitalLon: 23.7, capitalLat: 38.0, capitalName: "雅典",
                anchors: [
                    HistoricalAnchor(lon: 22.9, lat: 40.6, provinceName: "塞萨洛尼基", weight: 0.95),
                    HistoricalAnchor(lon: 25.1, lat: 35.3, provinceName: "伊拉克利翁", weight: 1.05),
                ],
                rulerName: "康斯坦丁一世", rulerTitle: "国王",
                rulerMilitary: 78, rulerAdmin: 74, rulerDiplo: 76, rulerCharisma: 80,
                rulerTraits: ["Veteran", "BattleHardened"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "germany", defenderId: "france", casusBelli: "施里芬计划 · 西线决战"),
            HistoricalWarSpec(attackerId: "germany", defenderId: "belgium", casusBelli: "借道比利时 · 进攻列日"),
            HistoricalWarSpec(attackerId: "germany", defenderId: "russia", casusBelli: "八月炮火 · 东线宣战"),
            HistoricalWarSpec(attackerId: "austria_hungary", defenderId: "serbia", casusBelli: "七月危机 · 巴尔干战火"),
            HistoricalWarSpec(attackerId: "austria_hungary", defenderId: "russia", casusBelli: "东线总动员宣战"),
            HistoricalWarSpec(attackerId: "germany", defenderId: "britain", casusBelli: "比利时中立遭破坏"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "同盟国", memberIds: ["germany", "austria_hungary", "ottoman"]),
            HistoricalAllianceSpec(name: "协约国", memberIds: ["britain", "france", "russia", "serbia", "belgium"]),
        ],
        tags: ["一战", "欧洲精图", "20国细化", "堑壕战"],
        rebelMode: "historical",
        eraOverride: "ww1"
    )

    // 剧本 8：民国危局 · 九一八事变（公元 1931 年 9 月 · 中国全图 · 15 势力精绘）
    private static let china1931 = HistoricalScenario(
        id: "china_1931",
        title: "民国危局 · 九一八事变",
        subtitle: "1931年9月 · 柳条湖风雷与全民族觉醒 · 15势力精绘",
        region: .china,
        year: 1931,
        eraName: "民国二十年",
        description: "1931年9月，日本关东军蓄谋制造柳条湖事件，铁蹄踏碎白山黑水。南京国民政府、张学良东北军、瑞金红军、晋绥、新桂、川军、滇军、西北马家军、新疆与西藏各据一方，周边英属印缅、法属印支、苏联远东与外蒙古环峙四境。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 300,
        nations: [
            HistoricalNationSpec(
                id: "roc", name: "中华民国国民政府", shortName: "国", color: "#2B6CB0",
                culture: "chinese", religion: "confucian", polity: "Republic", style: "presidential",
                capitalLon: 118.8, capitalLat: 32.1, capitalName: "南京",
                anchors: [
                    HistoricalAnchor(lon: 121.5, lat: 31.2, provinceName: "上海", weight: 1.15),
                    HistoricalAnchor(lon: 120.2, lat: 30.3, provinceName: "杭州", weight: 1.05),
                    HistoricalAnchor(lon: 114.3, lat: 30.6, provinceName: "武汉", weight: 1.2),
                    HistoricalAnchor(lon: 113.0, lat: 28.2, provinceName: "长沙", weight: 1.15),
                    HistoricalAnchor(lon: 113.65, lat: 34.76, provinceName: "郑州", weight: 1.15),
                    HistoricalAnchor(lon: 117.0, lat: 36.67, provinceName: "济南", weight: 1.15),
                    HistoricalAnchor(lon: 108.94, lat: 34.27, provinceName: "西安", weight: 1.15),
                    HistoricalAnchor(lon: 119.3, lat: 26.07, provinceName: "福州", weight: 1.1),
                    HistoricalAnchor(lon: 113.26, lat: 23.13, provinceName: "广州", weight: 1.25),
                ],
                rulerName: "蒋中正", rulerTitle: "国民政府主席",
                rulerMilitary: 82, rulerAdmin: 80, rulerDiplo: 84, rulerCharisma: 84,
                rulerTraits: ["Stubborn", "IronFist", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "northeast", name: "东北边防军", shortName: "奉", color: "#5C7BA6",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "warlord",
                capitalLon: 123.43, capitalLat: 41.80, capitalName: "沈阳",
                anchors: [
                    HistoricalAnchor(lon: 125.3, lat: 43.9, provinceName: "长春", weight: 1.15),
                    HistoricalAnchor(lon: 126.6, lat: 45.8, provinceName: "哈尔滨", weight: 1.25),
                    HistoricalAnchor(lon: 123.9, lat: 47.3, provinceName: "齐齐哈尔", weight: 1.2),
                    HistoricalAnchor(lon: 121.1, lat: 41.1, provinceName: "锦州", weight: 1.05),
                    HistoricalAnchor(lon: 117.9, lat: 41.0, provinceName: "承德", weight: 1.05),
                    HistoricalAnchor(lon: 116.4, lat: 39.9, provinceName: "北平", weight: 1.1),
                    HistoricalAnchor(lon: 117.2, lat: 39.1, provinceName: "天津", weight: 1.0),
                ],
                rulerName: "张学良", rulerTitle: "东北边防军司令长官",
                rulerMilitary: 76, rulerAdmin: 74, rulerDiplo: 78, rulerCharisma: 84,
                rulerTraits: ["Charismatic", "Brave", "Patient"]
            ),
            HistoricalNationSpec(
                id: "cpc", name: "中华苏维埃根据地", shortName: "红", color: "#C82829",
                culture: "chinese", religion: "chineseFolk", polity: "Republic", style: "communist",
                capitalLon: 116.03, capitalLat: 25.88, capitalName: "瑞金",
                anchors: [
                    HistoricalAnchor(lon: 114.93, lat: 25.85, provinceName: "赣州", weight: 0.85),
                    HistoricalAnchor(lon: 116.36, lat: 25.83, provinceName: "长汀", weight: 0.85),
                    HistoricalAnchor(lon: 114.99, lat: 27.11, provinceName: "吉安", weight: 0.85),
                ],
                rulerName: "毛泽东", rulerTitle: "主席",
                rulerMilitary: 95, rulerAdmin: 92, rulerDiplo: 88, rulerCharisma: 96,
                rulerTraits: ["Genius", "Strategist", "Visionary", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "japan", name: "大日本帝国·关东军", shortName: "日", color: "#A92B2B",
                culture: "japanese", religion: "shinto", polity: "Empire", style: "dualMonarchy",
                capitalLon: 127.0, capitalLat: 37.6, capitalName: "汉城",
                anchors: [
                    HistoricalAnchor(lon: 125.75, lat: 39.02, provinceName: "平壤", weight: 1.15),
                    HistoricalAnchor(lon: 129.0, lat: 35.18, provinceName: "釜山", weight: 1.15),
                    HistoricalAnchor(lon: 121.6, lat: 38.9, provinceName: "旅大", weight: 0.72),
                    HistoricalAnchor(lon: 121.5, lat: 25.0, provinceName: "台北", weight: 1.2),
                    HistoricalAnchor(lon: 130.4, lat: 33.6, provinceName: "福冈", weight: 1.25),
                ],
                rulerName: "裕仁", rulerTitle: "天皇",
                rulerMilitary: 74, rulerAdmin: 78, rulerDiplo: 74, rulerCharisma: 82,
                rulerTraits: ["Stubborn", "Patient", "NaturalLeader"]
            ),
            HistoricalNationSpec(
                id: "shanxi", name: "晋绥军政府", shortName: "晋", color: "#8B6C42",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "warlord",
                capitalLon: 112.55, capitalLat: 37.87, capitalName: "太原",
                anchors: [
                    HistoricalAnchor(lon: 113.3, lat: 40.08, provinceName: "大同", weight: 1.0),
                    HistoricalAnchor(lon: 111.67, lat: 40.84, provinceName: "归绥", weight: 1.05),
                    HistoricalAnchor(lon: 109.84, lat: 40.66, provinceName: "包头", weight: 1.0),
                ],
                rulerName: "阎锡山", rulerTitle: "太原绥靖公署主任",
                rulerMilitary: 80, rulerAdmin: 86, rulerDiplo: 84, rulerCharisma: 78,
                rulerTraits: ["Financier", "Administrator", "Patient"]
            ),
            HistoricalNationSpec(
                id: "guangxi", name: "新桂系军团", shortName: "桂", color: "#2D8A68",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "warlord",
                capitalLon: 110.29, capitalLat: 25.27, capitalName: "桂林",
                anchors: [
                    HistoricalAnchor(lon: 108.37, lat: 22.82, provinceName: "南宁", weight: 1.05),
                    HistoricalAnchor(lon: 109.41, lat: 24.33, provinceName: "柳州", weight: 1.0),
                ],
                rulerName: "李宗仁", rulerTitle: "第四集团军总司令",
                rulerMilitary: 91, rulerAdmin: 82, rulerDiplo: 82, rulerCharisma: 88,
                rulerTraits: ["Tactician", "BattleHardened", "NaturalLeader"]
            ),
            HistoricalNationSpec(
                id: "sichuan", name: "川军与西南", shortName: "川", color: "#D4A017",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "warlord",
                capitalLon: 104.07, capitalLat: 30.67, capitalName: "成都",
                anchors: [
                    HistoricalAnchor(lon: 106.55, lat: 29.56, provinceName: "重庆", weight: 1.15),
                    HistoricalAnchor(lon: 106.71, lat: 26.57, provinceName: "贵阳", weight: 1.1),
                    HistoricalAnchor(lon: 104.64, lat: 28.75, provinceName: "宜宾", weight: 1.0),
                ],
                rulerName: "刘湘", rulerTitle: "川军总司令",
                rulerMilitary: 82, rulerAdmin: 78, rulerDiplo: 76, rulerCharisma: 82,
                rulerTraits: ["BattleHardened", "Veteran", "Brave"]
            ),
            HistoricalNationSpec(
                id: "ma_clique", name: "西北马家军", shortName: "马", color: "#A85632",
                culture: "chinese", religion: "islam", polity: "Empire", style: "warlord",
                capitalLon: 103.83, capitalLat: 36.06, capitalName: "兰州",
                anchors: [
                    HistoricalAnchor(lon: 101.78, lat: 36.62, provinceName: "西宁", weight: 1.2),
                    HistoricalAnchor(lon: 106.27, lat: 38.47, provinceName: "银川", weight: 1.15),
                    HistoricalAnchor(lon: 98.49, lat: 39.73, provinceName: "酒泉", weight: 1.25),
                ],
                rulerName: "马鸿逵", rulerTitle: "宁夏省主席",
                rulerMilitary: 80, rulerAdmin: 72, rulerDiplo: 72, rulerCharisma: 76,
                rulerTraits: ["BattleHardened", "IronFist"]
            ),
            HistoricalNationSpec(
                id: "xinjiang", name: "新疆省政府", shortName: "新", color: "#8E5A9E",
                culture: "chinese", religion: "islam", polity: "Empire", style: "warlord",
                capitalLon: 87.62, capitalLat: 43.82, capitalName: "迪化",
                anchors: [
                    HistoricalAnchor(lon: 75.99, lat: 39.47, provinceName: "喀什", weight: 1.35),
                    HistoricalAnchor(lon: 81.33, lat: 43.92, provinceName: "伊犁", weight: 1.25),
                    HistoricalAnchor(lon: 93.51, lat: 42.82, provinceName: "哈密", weight: 1.25),
                ],
                rulerName: "盛世才", rulerTitle: "新疆边防督办",
                rulerMilitary: 78, rulerAdmin: 76, rulerDiplo: 76, rulerCharisma: 74,
                rulerTraits: ["Ambitious", "IronFist"]
            ),
            HistoricalNationSpec(
                id: "ussr_fe", name: "苏联远东", shortName: "苏", color: "#9B1C1C",
                culture: "slavic", religion: "orthodox", polity: "Republic", style: "communist",
                capitalLon: 131.9, capitalLat: 43.1, capitalName: "海参崴",
                anchors: [
                    HistoricalAnchor(lon: 135.1, lat: 48.5, provinceName: "伯力", weight: 1.4),
                    HistoricalAnchor(lon: 113.5, lat: 52.0, provinceName: "赤塔", weight: 1.6),
                    HistoricalAnchor(lon: 104.3, lat: 52.3, provinceName: "伊尔库茨克", weight: 1.6),
                ],
                rulerName: "瓦西里·布柳赫尔", rulerTitle: "远东特别集团军元帅",
                rulerMilitary: 92, rulerAdmin: 80, rulerDiplo: 76, rulerCharisma: 88,
                rulerTraits: ["BattleHardened", "Strategist", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "mongolia", name: "外蒙古", shortName: "蒙", color: "#B7950B",
                culture: "mongol", religion: "buddhism", polity: "Republic", style: "communist",
                capitalLon: 106.91, capitalLat: 47.92, capitalName: "乌兰巴托",
                anchors: [
                    HistoricalAnchor(lon: 91.64, lat: 48.0, provinceName: "科布多", weight: 1.4),
                    HistoricalAnchor(lon: 114.5, lat: 48.07, provinceName: "乔巴山", weight: 1.4),
                ],
                rulerName: "霍尔洛·乔巴山", rulerTitle: "元帅",
                rulerMilitary: 82, rulerAdmin: 78, rulerDiplo: 76, rulerCharisma: 80,
                rulerTraits: ["IronFist", "Veteran"]
            ),
            // v9.0.0 补齐 1931 中国全图四境真实势力（追加在末尾 11..14，完整保留 0..10 名将花名册索引）
            HistoricalNationSpec(
                id: "tibet", name: "西藏地方", shortName: "藏", color: "#B85C38",
                culture: "tibetan", religion: "tantric", polity: "Theocracy", style: "lamaism",
                capitalLon: 91.13, capitalLat: 29.65, capitalName: "拉萨",
                anchors: [
                    HistoricalAnchor(lon: 88.88, lat: 29.27, provinceName: "日喀则", weight: 1.25),
                    HistoricalAnchor(lon: 97.17, lat: 31.14, provinceName: "昌都", weight: 1.15),
                    HistoricalAnchor(lon: 80.10, lat: 32.50, provinceName: "阿里", weight: 1.35),
                ],
                rulerName: "土登嘉措", rulerTitle: "十三世达赖",
                rulerMilitary: 62, rulerAdmin: 78, rulerDiplo: 78, rulerCharisma: 86,
                rulerTraits: ["Patient", "Just"]
            ),
            HistoricalNationSpec(
                id: "yunnan", name: "滇军龙云", shortName: "滇", color: "#3D8B6E",
                culture: "chinese", religion: "confucian", polity: "Empire", style: "warlord",
                capitalLon: 102.71, capitalLat: 25.04, capitalName: "昆明",
                anchors: [
                    HistoricalAnchor(lon: 100.23, lat: 25.60, provinceName: "大理", weight: 1.1),
                    HistoricalAnchor(lon: 99.16, lat: 25.11, provinceName: "保山", weight: 1.05),
                ],
                rulerName: "龙云", rulerTitle: "云南省主席",
                rulerMilitary: 82, rulerAdmin: 80, rulerDiplo: 78, rulerCharisma: 84,
                rulerTraits: ["BattleHardened", "Veteran", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "uk_india", name: "英属印度与缅甸", shortName: "英印", color: "#C95252",
                culture: "english", religion: "hinduism", polity: "Republic", style: "protectorate",
                capitalLon: 77.21, capitalLat: 28.61, capitalName: "新德里",
                anchors: [
                    HistoricalAnchor(lon: 88.36, lat: 22.57, provinceName: "加尔各答", weight: 1.35),
                    HistoricalAnchor(lon: 96.08, lat: 21.95, provinceName: "曼德勒", weight: 1.25),
                    HistoricalAnchor(lon: 74.35, lat: 31.55, provinceName: "拉合尔", weight: 1.3),
                    HistoricalAnchor(lon: 85.32, lat: 27.72, provinceName: "加德满都", weight: 1.15),
                ],
                rulerName: "威灵顿勋爵", rulerTitle: "印度总督",
                rulerMilitary: 78, rulerAdmin: 84, rulerDiplo: 82, rulerCharisma: 78,
                rulerTraits: ["Administrator", "Financier"]
            ),
            HistoricalNationSpec(
                id: "indochina", name: "法属印度支那", shortName: "印支", color: "#4A74B4",
                culture: "vietnamese", religion: "catholic", polity: "Republic", style: "protectorate",
                capitalLon: 105.84, capitalLat: 21.03, capitalName: "河内",
                anchors: [
                    HistoricalAnchor(lon: 102.63, lat: 17.97, provinceName: "万象", weight: 1.1),
                    HistoricalAnchor(lon: 107.59, lat: 16.46, provinceName: "顺化", weight: 1.05),
                ],
                rulerName: "皮埃尔·帕斯基耶", rulerTitle: "印支总督",
                rulerMilitary: 66, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 70,
                rulerTraits: ["Administrator", "Patient"]
            ),
        ],
        openingWars: [],
        openingAlliances: [
            HistoricalAllianceSpec(name: "国民政府国防协定", memberIds: ["roc", "northeast", "shanxi", "sichuan", "yunnan", "ma_clique"]),
            HistoricalAllianceSpec(name: "苏蒙互助协定", memberIds: ["ussr_fe", "mongolia"]),
        ],
        tags: ["民国", "九一八事变", "抗战史实链", "15势力精绘"],
        rebelMode: "historical",
        eraOverride: "ww2"
    )

    // 剧本 9：二战前夜 · 欧陆风云（公元 1936 年 · 欧洲精图 · 28 国完整还原奥地利/捷克斯洛伐克/低地三国）
    private static let ww2Eve1936 = HistoricalScenario(
        id: "ww2_eve_1936",
        title: "二战前夜 · 欧陆风云",
        subtitle: "1936年 · 德奥合并·慕尼黑·闪击波兰全史实链",
        region: .europe,
        year: 1936,
        eraName: "大战前夜",
        description: "1936年，凡尔赛体系摇摇欲坠：莱茵兰非军事区、西班牙内战、德奥合并、慕尼黑协定、苏德密约、白色方案闪击波兰、威瑟演习、黄色方案绕道低地三国直至巴巴罗萨全面爆发——28国细化欧洲局部地图，支持严格史实路线或自由架空推演！",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 340,
        nations: [
            HistoricalNationSpec(
                id: "germany", name: "德意志第三帝国", shortName: "德", color: "#3D454F",
                culture: "german", religion: "protestant", polity: "Republic", style: "nazi",
                capitalLon: 13.4, capitalLat: 52.5, capitalName: "柏林",
                anchors: [
                    HistoricalAnchor(lon: 11.6, lat: 48.1, provinceName: "慕尼黑", weight: 1.05),
                    HistoricalAnchor(lon: 10.0, lat: 53.5, provinceName: "汉堡", weight: 1.05),
                    HistoricalAnchor(lon: 7.0, lat: 50.9, provinceName: "科隆", weight: 1.05),
                    HistoricalAnchor(lon: 20.5, lat: 54.7, provinceName: "柯尼斯堡", weight: 0.95),
                    HistoricalAnchor(lon: 17.0, lat: 51.1, provinceName: "布雷斯劳", weight: 0.95),
                ],
                rulerName: "阿道夫·希特勒", rulerTitle: "元首",
                rulerMilitary: 84, rulerAdmin: 80, rulerDiplo: 70, rulerCharisma: 90,
                rulerTraits: ["Hawkish", "Conqueror", "Tyrant", "Ambitious"]
            ),
            HistoricalNationSpec(
                id: "ussr", name: "苏联", shortName: "苏", color: "#B92B27",
                culture: "slavic", religion: "orthodox", polity: "Republic", style: "communist",
                capitalLon: 37.6, capitalLat: 55.8, capitalName: "莫斯科",
                anchors: [
                    HistoricalAnchor(lon: 30.3, lat: 59.9, provinceName: "列宁格勒", weight: 1.35),
                    HistoricalAnchor(lon: 30.5, lat: 50.4, provinceName: "基辅", weight: 1.3),
                    HistoricalAnchor(lon: 27.6, lat: 53.9, provinceName: "明斯克", weight: 1.15),
                    HistoricalAnchor(lon: 44.5, lat: 48.7, provinceName: "斯大林格勒", weight: 1.55),
                    HistoricalAnchor(lon: 36.2, lat: 50.0, provinceName: "哈尔科夫", weight: 1.35),
                    HistoricalAnchor(lon: 30.7, lat: 46.5, provinceName: "敖德萨", weight: 1.2),
                    HistoricalAnchor(lon: 44.8, lat: 41.7, provinceName: "第比利斯", weight: 1.45),
                    HistoricalAnchor(lon: 33.1, lat: 68.9, provinceName: "摩尔曼斯克", weight: 1.4),
                    HistoricalAnchor(lon: 40.5, lat: 64.5, provinceName: "阿尔汉格尔斯克", weight: 1.6),
                ],
                rulerName: "约瑟夫·斯大林", rulerTitle: "总书记",
                rulerMilitary: 86, rulerAdmin: 88, rulerDiplo: 80, rulerCharisma: 84,
                rulerTraits: ["IronFist", "Paranoid", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "uk", name: "大英帝国", shortName: "英", color: "#D34848",
                culture: "english", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: -0.1, capitalLat: 51.5, capitalName: "伦敦",
                anchors: [
                    HistoricalAnchor(lon: -3.2, lat: 55.9, provinceName: "爱丁堡", weight: 1.25),
                    HistoricalAnchor(lon: -2.2, lat: 53.5, provinceName: "曼彻斯特", weight: 1.15),
                    HistoricalAnchor(lon: -5.9, lat: 54.6, provinceName: "贝尔法斯特", weight: 0.85),
                    HistoricalAnchor(lon: 33.4, lat: 35.2, provinceName: "尼科西亚", weight: 1.1),
                ],
                rulerName: "乔治六世", rulerTitle: "国王",
                rulerMilitary: 74, rulerAdmin: 82, rulerDiplo: 86, rulerCharisma: 90,
                rulerTraits: ["Brave", "Just", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "france", name: "法兰西第三共和国", shortName: "法", color: "#265DA6",
                culture: "french", religion: "catholic", polity: "Republic", style: "parliamentary",
                capitalLon: 2.3, capitalLat: 48.9, capitalName: "巴黎",
                anchors: [
                    HistoricalAnchor(lon: 4.8, lat: 45.8, provinceName: "里昂", weight: 1.15),
                    HistoricalAnchor(lon: 5.4, lat: 43.3, provinceName: "马赛", weight: 1.15),
                    HistoricalAnchor(lon: -0.6, lat: 44.8, provinceName: "波尔多", weight: 1.2),
                    HistoricalAnchor(lon: 7.7, lat: 48.6, provinceName: "斯特拉斯堡", weight: 0.95),
                    HistoricalAnchor(lon: 3.0, lat: 36.7, provinceName: "阿尔及尔", weight: 1.45),
                    HistoricalAnchor(lon: 10.2, lat: 36.8, provinceName: "突尼斯", weight: 1.3),
                    HistoricalAnchor(lon: -6.8, lat: 34.0, provinceName: "拉巴特", weight: 1.35),
                ],
                rulerName: "莱昂·布鲁姆", rulerTitle: "总理",
                rulerMilitary: 66, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 78,
                rulerTraits: ["Patient", "Diplomatic", "Reformer"]
            ),
            HistoricalNationSpec(
                id: "poland", name: "波兰第二共和国", shortName: "波", color: "#E06D7E",
                culture: "polish", religion: "catholic", polity: "Republic", style: "presidential",
                capitalLon: 21.0, capitalLat: 52.2, capitalName: "华沙",
                anchors: [
                    HistoricalAnchor(lon: 19.9, lat: 50.1, provinceName: "克拉科夫", weight: 0.95),
                    HistoricalAnchor(lon: 16.9, lat: 52.4, provinceName: "波兹南", weight: 0.9),
                    HistoricalAnchor(lon: 18.6, lat: 54.3, provinceName: "格但斯克", weight: 0.9),
                    HistoricalAnchor(lon: 24.0, lat: 49.8, provinceName: "利沃夫", weight: 0.95),
                ],
                rulerName: "爱德华·希米格维", rulerTitle: "元帅",
                rulerMilitary: 80, rulerAdmin: 76, rulerDiplo: 72, rulerCharisma: 82,
                rulerTraits: ["Brave", "Hawkish", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "italy", name: "意大利王国", shortName: "意", color: "#3C8D40",
                culture: "italian", religion: "catholic", polity: "Empire", style: "dualMonarchy",
                capitalLon: 12.5, capitalLat: 41.9, capitalName: "罗马",
                anchors: [
                    HistoricalAnchor(lon: 9.2, lat: 45.5, provinceName: "米兰", weight: 1.05),
                    HistoricalAnchor(lon: 12.3, lat: 45.4, provinceName: "威尼斯", weight: 0.95),
                    HistoricalAnchor(lon: 14.3, lat: 40.8, provinceName: "那不勒斯", weight: 1.1),
                    HistoricalAnchor(lon: 13.4, lat: 38.1, provinceName: "巴勒莫", weight: 1.15),
                ],
                rulerName: "维托里奥·埃马努埃莱三世", rulerTitle: "国王",
                rulerMilitary: 62, rulerAdmin: 72, rulerDiplo: 74, rulerCharisma: 72,
                rulerTraits: ["Patient", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "spain", name: "西班牙第二共和国", shortName: "西", color: "#E0A426",
                culture: "spanish", religion: "catholic", polity: "Republic", style: "parliamentary",
                capitalLon: -3.7, capitalLat: 40.4, capitalName: "马德里",
                anchors: [
                    HistoricalAnchor(lon: 2.2, lat: 41.4, provinceName: "巴塞罗那", weight: 1.1),
                    HistoricalAnchor(lon: -6.0, lat: 37.4, provinceName: "塞维利亚", weight: 1.15),
                    HistoricalAnchor(lon: -0.4, lat: 39.5, provinceName: "瓦伦西亚", weight: 1.05),
                ],
                rulerName: "曼努埃尔·阿萨尼亚", rulerTitle: "总统",
                rulerMilitary: 66, rulerAdmin: 78, rulerDiplo: 78, rulerCharisma: 80,
                rulerTraits: ["Scholar", "Reformer", "Patient"]
            ),
            HistoricalNationSpec(
                id: "finland", name: "芬兰共和国", shortName: "芬", color: "#76A5AF",
                culture: "norse", religion: "protestant", polity: "Republic", style: "presidential",
                capitalLon: 25.0, capitalLat: 60.2, capitalName: "赫尔辛基",
                anchors: [
                    HistoricalAnchor(lon: 23.8, lat: 61.5, provinceName: "坦佩雷", weight: 1.05),
                    HistoricalAnchor(lon: 25.5, lat: 65.0, provinceName: "奥卢", weight: 1.25),
                    HistoricalAnchor(lon: 28.7, lat: 60.7, provinceName: "维堡", weight: 0.9),
                ],
                rulerName: "曼纳海姆", rulerTitle: "元帅",
                rulerMilitary: 92, rulerAdmin: 80, rulerDiplo: 82, rulerCharisma: 88,
                rulerTraits: ["Tactician", "Veteran", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "sweden", name: "瑞典王国", shortName: "瑞", color: "#2E75B6",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 18.1, capitalLat: 59.3, capitalName: "斯德哥尔摩",
                anchors: [
                    HistoricalAnchor(lon: 12.0, lat: 57.7, provinceName: "哥德堡", weight: 1.05),
                    HistoricalAnchor(lon: 20.3, lat: 63.8, provinceName: "于默奥", weight: 1.2),
                ],
                rulerName: "古斯塔夫五世", rulerTitle: "国王",
                rulerMilitary: 64, rulerAdmin: 82, rulerDiplo: 86, rulerCharisma: 80,
                rulerTraits: ["Dovish", "Financier"]
            ),
            HistoricalNationSpec(
                id: "norway", name: "挪威王国", shortName: "挪", color: "#9E3B3B",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 10.7, capitalLat: 59.9, capitalName: "奥斯陆",
                anchors: [
                    HistoricalAnchor(lon: 5.3, lat: 60.4, provinceName: "卑尔根", weight: 1.1),
                    HistoricalAnchor(lon: 10.4, lat: 63.4, provinceName: "特隆赫姆", weight: 1.2),
                    HistoricalAnchor(lon: 17.4, lat: 68.4, provinceName: "纳尔维克", weight: 1.25),
                ],
                rulerName: "哈康七世", rulerTitle: "国王",
                rulerMilitary: 68, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 84,
                rulerTraits: ["Just", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "netherlands", name: "荷兰王国", shortName: "荷", color: "#E67E22",
                culture: "dutch", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 4.9, capitalLat: 52.4, capitalName: "阿姆斯特丹",
                anchors: [
                    HistoricalAnchor(lon: 4.5, lat: 51.9, provinceName: "鹿特丹", weight: 0.78),
                    HistoricalAnchor(lon: 6.6, lat: 53.2, provinceName: "格罗宁根", weight: 0.78),
                ],
                rulerName: "威廉明娜", rulerTitle: "女王",
                rulerMilitary: 64, rulerAdmin: 86, rulerDiplo: 84, rulerCharisma: 88,
                rulerTraits: ["Financier", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "romania", name: "罗马尼亚王国", shortName: "罗", color: "#C9A227",
                culture: "roman", religion: "orthodox", polity: "Kingdom", style: "constitutional",
                capitalLon: 26.1, capitalLat: 44.4, capitalName: "布加勒斯特",
                anchors: [
                    HistoricalAnchor(lon: 23.6, lat: 46.8, provinceName: "克卢日", weight: 1.0),
                    HistoricalAnchor(lon: 28.6, lat: 44.2, provinceName: "康斯坦察", weight: 0.95),
                    HistoricalAnchor(lon: 27.6, lat: 47.2, provinceName: "雅西", weight: 0.95),
                ],
                rulerName: "卡罗尔二世", rulerTitle: "国王",
                rulerMilitary: 68, rulerAdmin: 70, rulerDiplo: 72, rulerCharisma: 70,
                rulerTraits: ["Ambitious", "Greedy"]
            ),
            HistoricalNationSpec(
                id: "hungary", name: "匈牙利王国", shortName: "匈", color: "#8D5A38",
                culture: "hungarian", religion: "catholic", polity: "Kingdom", style: "regency",
                capitalLon: 19.0, capitalLat: 47.5, capitalName: "布达佩斯",
                anchors: [
                    HistoricalAnchor(lon: 21.6, lat: 47.5, provinceName: "德布勒森", weight: 0.88),
                    HistoricalAnchor(lon: 20.1, lat: 46.3, provinceName: "塞格德", weight: 0.85),
                ],
                rulerName: "米克洛什·霍尔蒂", rulerTitle: "摄政王",
                rulerMilitary: 76, rulerAdmin: 74, rulerDiplo: 74, rulerCharisma: 76,
                rulerTraits: ["NavalMastery", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "yugoslavia", name: "南斯拉夫王国", shortName: "南", color: "#5B6ABF",
                culture: "slavic", religion: "orthodox", polity: "Kingdom", style: "regency",
                capitalLon: 20.5, capitalLat: 44.8, capitalName: "贝尔格莱德",
                anchors: [
                    HistoricalAnchor(lon: 16.0, lat: 45.8, provinceName: "萨格勒布", weight: 0.95),
                    HistoricalAnchor(lon: 18.4, lat: 43.9, provinceName: "萨拉热窝", weight: 0.95),
                    HistoricalAnchor(lon: 21.4, lat: 42.0, provinceName: "斯科普里", weight: 0.9),
                ],
                rulerName: "保罗亲王", rulerTitle: "摄政王",
                rulerMilitary: 70, rulerAdmin: 72, rulerDiplo: 76, rulerCharisma: 74,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "greece", name: "希腊王国", shortName: "希", color: "#4DA6E0",
                culture: "greek", religion: "orthodox", polity: "Empire", style: "dualMonarchy",
                capitalLon: 23.7, capitalLat: 38.0, capitalName: "雅典",
                anchors: [
                    HistoricalAnchor(lon: 22.9, lat: 40.6, provinceName: "塞萨洛尼基", weight: 0.95),
                    HistoricalAnchor(lon: 25.1, lat: 35.3, provinceName: "伊拉克利翁", weight: 1.1),
                ],
                rulerName: "乔治二世", rulerTitle: "国王",
                rulerMilitary: 68, rulerAdmin: 76, rulerDiplo: 80, rulerCharisma: 78,
                rulerTraits: ["Patient", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "turkey", name: "土耳其共和国", shortName: "土", color: "#C0392B",
                culture: "turkic", religion: "islam", polity: "Republic", style: "presidential",
                capitalLon: 32.9, capitalLat: 39.9, capitalName: "安卡拉",
                anchors: [
                    HistoricalAnchor(lon: 28.9, lat: 41.0, provinceName: "伊斯坦布尔", weight: 1.15),
                    HistoricalAnchor(lon: 27.1, lat: 38.4, provinceName: "伊兹密尔", weight: 1.15),
                    HistoricalAnchor(lon: 41.3, lat: 39.9, provinceName: "埃尔祖鲁姆", weight: 1.3),
                    HistoricalAnchor(lon: 35.3, lat: 37.0, provinceName: "阿达纳", weight: 1.2),
                ],
                rulerName: "穆斯塔法·凯末尔", rulerTitle: "国父总统",
                rulerMilitary: 95, rulerAdmin: 94, rulerDiplo: 92, rulerCharisma: 96,
                rulerTraits: ["Genius", "Reformer", "Unifier", "Visionary"]
            ),
            HistoricalNationSpec(
                id: "belgium", name: "比利时王国", shortName: "比", color: "#D4A017",
                culture: "french", religion: "catholic", polity: "Kingdom", style: "constitutional",
                capitalLon: 4.35, capitalLat: 50.85, capitalName: "布鲁塞尔",
                anchors: [
                    HistoricalAnchor(lon: 4.4, lat: 51.2, provinceName: "安特卫普", weight: 0.72),
                    HistoricalAnchor(lon: 5.57, lat: 50.63, provinceName: "列日", weight: 0.70),
                ],
                rulerName: "利奥波德三世", rulerTitle: "国王",
                rulerMilitary: 72, rulerAdmin: 78, rulerDiplo: 76, rulerCharisma: 78,
                rulerTraits: ["Stubborn", "Patient"]
            ),
            HistoricalNationSpec(
                id: "luxembourg", name: "卢森堡大公国", shortName: "卢", color: "#5DADE2",
                culture: "french", religion: "catholic", polity: "Kingdom", style: "principality",
                capitalLon: 6.13, capitalLat: 49.61, capitalName: "卢森堡",
                anchors: [],
                rulerName: "夏洛特女大公", rulerTitle: "大公",
                rulerMilitary: 52, rulerAdmin: 82, rulerDiplo: 84, rulerCharisma: 86,
                rulerTraits: ["Dovish", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "switzerland", name: "瑞士联邦", shortName: "瑞士", color: "#D93838",
                culture: "german", religion: "protestant", polity: "Federation", style: "confederation",
                capitalLon: 7.45, capitalLat: 46.95, capitalName: "伯尔尼",
                anchors: [
                    HistoricalAnchor(lon: 8.54, lat: 47.37, provinceName: "苏黎世", weight: 0.72),
                    HistoricalAnchor(lon: 6.14, lat: 46.20, provinceName: "日内瓦", weight: 0.72),
                ],
                rulerName: "亨利·吉桑", rulerTitle: "联邦总司令",
                rulerMilitary: 86, rulerAdmin: 88, rulerDiplo: 88, rulerCharisma: 88,
                rulerTraits: ["Patient", "Strategist", "Just"]
            ),
            HistoricalNationSpec(
                id: "denmark", name: "丹麦王国", shortName: "丹", color: "#B83B4B",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 12.57, capitalLat: 55.68, capitalName: "哥本哈根",
                anchors: [
                    HistoricalAnchor(lon: 10.21, lat: 56.16, provinceName: "奥胡斯", weight: 0.78),
                ],
                rulerName: "克里斯蒂安十世", rulerTitle: "国王",
                rulerMilitary: 62, rulerAdmin: 80, rulerDiplo: 82, rulerCharisma: 86,
                rulerTraits: ["Dovish", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "portugal", name: "葡萄牙共和国", shortName: "葡", color: "#2D7A4F",
                culture: "portuguese", religion: "catholic", polity: "Republic", style: "dictatorship",
                capitalLon: -9.14, capitalLat: 38.72, capitalName: "里斯本",
                anchors: [
                    HistoricalAnchor(lon: -8.61, lat: 41.15, provinceName: "波尔图", weight: 0.85),
                ],
                rulerName: "安东尼奥·萨拉查", rulerTitle: "总理",
                rulerMilitary: 66, rulerAdmin: 84, rulerDiplo: 84, rulerCharisma: 76,
                rulerTraits: ["Financier", "Patient", "Administrator"]
            ),
            HistoricalNationSpec(
                id: "ireland", name: "爱尔兰自由邦", shortName: "爱", color: "#3CB371",
                culture: "english", religion: "catholic", polity: "Republic", style: "parliamentary",
                capitalLon: -6.26, capitalLat: 53.35, capitalName: "都柏林",
                anchors: [
                    HistoricalAnchor(lon: -8.47, lat: 51.90, provinceName: "科克", weight: 0.85),
                ],
                rulerName: "埃蒙·德瓦莱拉", rulerTitle: "总理",
                rulerMilitary: 68, rulerAdmin: 80, rulerDiplo: 84, rulerCharisma: 82,
                rulerTraits: ["Stubborn", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "bulgaria", name: "保加利亚王国", shortName: "保", color: "#4E8B63",
                culture: "slavic", religion: "orthodox", polity: "Empire", style: "dualMonarchy",
                capitalLon: 23.32, capitalLat: 42.70, capitalName: "索菲亚",
                anchors: [
                    HistoricalAnchor(lon: 24.75, lat: 42.14, provinceName: "普罗夫迪夫", weight: 0.85),
                    HistoricalAnchor(lon: 27.91, lat: 43.21, provinceName: "瓦尔纳", weight: 0.82),
                ],
                rulerName: "鲍里斯三世", rulerTitle: "沙皇",
                rulerMilitary: 72, rulerAdmin: 78, rulerDiplo: 84, rulerCharisma: 82,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "austria", name: "奥地利联邦国", shortName: "奥", color: "#E5C158",
                culture: "german", religion: "catholic", polity: "Republic", style: "dictatorship",
                capitalLon: 16.37, capitalLat: 48.21, capitalName: "维也纳",
                anchors: [
                    HistoricalAnchor(lon: 15.44, lat: 47.07, provinceName: "格拉茨", weight: 0.78),
                    HistoricalAnchor(lon: 11.40, lat: 47.26, provinceName: "因斯布鲁克", weight: 0.78),
                ],
                rulerName: "库尔特·许士尼格", rulerTitle: "联邦总理",
                rulerMilitary: 64, rulerAdmin: 78, rulerDiplo: 76, rulerCharisma: 74,
                rulerTraits: ["Patient", "Dovish", "Administrator"]
            ),
            HistoricalNationSpec(
                id: "czechoslovakia", name: "捷克斯洛伐克", shortName: "捷", color: "#5482B8",
                culture: "slavic", religion: "catholic", polity: "Republic", style: "parliamentary",
                capitalLon: 14.42, capitalLat: 50.08, capitalName: "布拉格",
                anchors: [
                    HistoricalAnchor(lon: 16.61, lat: 49.19, provinceName: "布尔诺", weight: 0.82),
                    HistoricalAnchor(lon: 17.11, lat: 48.15, provinceName: "布拉迪斯拉发", weight: 0.85),
                    HistoricalAnchor(lon: 21.26, lat: 48.72, provinceName: "科希策", weight: 0.82),
                ],
                rulerName: "爱德华·贝奈斯", rulerTitle: "总统",
                rulerMilitary: 74, rulerAdmin: 86, rulerDiplo: 86, rulerCharisma: 82,
                rulerTraits: ["Diplomatic", "Administrator", "Scholar"]
            ),
            HistoricalNationSpec(
                id: "lithuania", name: "立陶宛共和国", shortName: "立", color: "#A58A3C",
                culture: "polish", religion: "catholic", polity: "Republic", style: "presidential",
                capitalLon: 25.28, capitalLat: 54.69, capitalName: "维尔纽斯",
                anchors: [
                    HistoricalAnchor(lon: 23.90, lat: 54.90, provinceName: "考纳斯", weight: 0.78),
                ],
                rulerName: "安塔纳斯·斯梅托纳", rulerTitle: "总统",
                rulerMilitary: 64, rulerAdmin: 74, rulerDiplo: 74, rulerCharisma: 72,
                rulerTraits: ["Patient", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "latvia", name: "拉脱维亚共和国", shortName: "拉", color: "#8C3B4A",
                culture: "polish", religion: "protestant", polity: "Republic", style: "presidential",
                capitalLon: 24.11, capitalLat: 56.95, capitalName: "里加",
                anchors: [],
                rulerName: "卡尔利斯·乌尔马尼斯", rulerTitle: "总统",
                rulerMilitary: 64, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 76,
                rulerTraits: ["Administrator", "Patient"]
            ),
            HistoricalNationSpec(
                id: "estonia", name: "爱沙尼亚共和国", shortName: "爱沙", color: "#4D82B8",
                culture: "norse", religion: "protestant", polity: "Republic", style: "presidential",
                capitalLon: 24.75, capitalLat: 59.44, capitalName: "塔林",
                anchors: [],
                rulerName: "康斯坦丁·帕茨", rulerTitle: "总统",
                rulerMilitary: 64, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 74,
                rulerTraits: ["Administrator", "Patient"]
            ),
        ],
        openingWars: [],
        openingAlliances: [
            HistoricalAllianceSpec(name: "英法协约同盟", memberIds: ["uk", "france"]),
            HistoricalAllianceSpec(name: "小协约国", memberIds: ["czechoslovakia", "romania", "yugoslavia"]),
        ],
        tags: ["1936", "德奥合并", "慕尼黑", "28国细化"],
        rebelMode: "historical",
        eraOverride: "ww2"
    )

    // 剧本 10：二战欧洲战场 · 欧陆烽烟（公元 1939 年 9 月 · 欧洲精图 · 27 国细化）
    private static let ww2Europe1939 = HistoricalScenario(
        id: "ww2_europe_1939",
        title: "二战欧洲战场 · 欧陆烽烟",
        subtitle: "1939年9月 · 闪电战降临 · 27国细化欧洲",
        region: .europe,
        year: 1939,
        eraName: "二战欧洲",
        description: "1939年9月1日，德军闪击波兰，英法对德宣战，第二次世界大战欧洲战场全面爆发。欧陆二十七国完整拆分（荷兰/比利时/卢森堡/瑞士/丹麦/葡萄牙/爱尔兰/保加利亚/斯洛伐克/波罗的海三国），真实还原苏德瓜分波兰、威瑟演习、黄色方案绕道低地三国与巴巴罗萨！",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 340,
        nations: [
            HistoricalNationSpec(
                id: "germany", name: "德意志第三帝国", shortName: "德", color: "#3D454F",
                culture: "german", religion: "protestant", polity: "Republic", style: "nazi",
                capitalLon: 13.4, capitalLat: 52.5, capitalName: "柏林",
                anchors: [
                    HistoricalAnchor(lon: 11.6, lat: 48.1, provinceName: "慕尼黑", weight: 1.1),
                    HistoricalAnchor(lon: 10.0, lat: 53.5, provinceName: "汉堡", weight: 1.05),
                    HistoricalAnchor(lon: 7.0, lat: 50.9, provinceName: "科隆", weight: 1.05),
                    HistoricalAnchor(lon: 16.4, lat: 48.2, provinceName: "维也纳", weight: 1.05),
                    HistoricalAnchor(lon: 14.4, lat: 50.1, provinceName: "布拉格", weight: 1.0),
                    HistoricalAnchor(lon: 20.5, lat: 54.7, provinceName: "柯尼斯堡", weight: 0.95),
                    HistoricalAnchor(lon: 17.0, lat: 51.1, provinceName: "布雷斯劳", weight: 0.95),
                ],
                rulerName: "阿道夫·希特勒", rulerTitle: "元首",
                rulerMilitary: 82, rulerAdmin: 76, rulerDiplo: 62, rulerCharisma: 88,
                rulerTraits: ["Hawkish", "Conqueror", "Tyrant", "Ambitious"]
            ),
            HistoricalNationSpec(
                id: "ussr", name: "苏联", shortName: "苏", color: "#B92B27",
                culture: "slavic", religion: "orthodox", polity: "Republic", style: "communist",
                capitalLon: 37.6, capitalLat: 55.8, capitalName: "莫斯科",
                anchors: [
                    HistoricalAnchor(lon: 30.3, lat: 59.9, provinceName: "列宁格勒", weight: 1.35),
                    HistoricalAnchor(lon: 30.5, lat: 50.4, provinceName: "基辅", weight: 1.3),
                    HistoricalAnchor(lon: 27.6, lat: 53.9, provinceName: "明斯克", weight: 1.15),
                    HistoricalAnchor(lon: 44.5, lat: 48.7, provinceName: "斯大林格勒", weight: 1.55),
                    HistoricalAnchor(lon: 36.2, lat: 50.0, provinceName: "哈尔科夫", weight: 1.35),
                    HistoricalAnchor(lon: 30.7, lat: 46.5, provinceName: "敖德萨", weight: 1.2),
                    HistoricalAnchor(lon: 44.8, lat: 41.7, provinceName: "第比利斯", weight: 1.45),
                    HistoricalAnchor(lon: 33.1, lat: 68.9, provinceName: "摩尔曼斯克", weight: 1.4),
                    HistoricalAnchor(lon: 40.5, lat: 64.5, provinceName: "阿尔汉格尔斯克", weight: 1.6),
                ],
                rulerName: "约瑟夫·斯大林", rulerTitle: "总书记",
                rulerMilitary: 86, rulerAdmin: 88, rulerDiplo: 80, rulerCharisma: 84,
                rulerTraits: ["IronFist", "Paranoid", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "uk", name: "大英帝国", shortName: "英", color: "#D34848",
                culture: "english", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: -0.1, capitalLat: 51.5, capitalName: "伦敦",
                anchors: [
                    HistoricalAnchor(lon: -3.2, lat: 55.9, provinceName: "爱丁堡", weight: 1.25),
                    HistoricalAnchor(lon: -2.2, lat: 53.5, provinceName: "曼彻斯特", weight: 1.15),
                    HistoricalAnchor(lon: -5.9, lat: 54.6, provinceName: "贝尔法斯特", weight: 0.85),
                    HistoricalAnchor(lon: 33.4, lat: 35.2, provinceName: "尼科西亚", weight: 1.1),
                ],
                rulerName: "乔治六世", rulerTitle: "国王",
                rulerMilitary: 74, rulerAdmin: 82, rulerDiplo: 86, rulerCharisma: 90,
                rulerTraits: ["Brave", "Just", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "france", name: "法兰西第三共和国", shortName: "法", color: "#265DA6",
                culture: "french", religion: "catholic", polity: "Republic", style: "parliamentary",
                capitalLon: 2.3, capitalLat: 48.9, capitalName: "巴黎",
                anchors: [
                    HistoricalAnchor(lon: 4.8, lat: 45.8, provinceName: "里昂", weight: 1.15),
                    HistoricalAnchor(lon: 5.4, lat: 43.3, provinceName: "马赛", weight: 1.15),
                    HistoricalAnchor(lon: -0.6, lat: 44.8, provinceName: "波尔多", weight: 1.2),
                    HistoricalAnchor(lon: 7.7, lat: 48.6, provinceName: "斯特拉斯堡", weight: 0.95),
                    HistoricalAnchor(lon: 3.0, lat: 36.7, provinceName: "阿尔及尔", weight: 1.45),
                    HistoricalAnchor(lon: 10.2, lat: 36.8, provinceName: "突尼斯", weight: 1.3),
                    HistoricalAnchor(lon: -6.8, lat: 34.0, provinceName: "拉巴特", weight: 1.35),
                ],
                rulerName: "爱德华·达拉第", rulerTitle: "总理",
                rulerMilitary: 68, rulerAdmin: 74, rulerDiplo: 76, rulerCharisma: 72,
                rulerTraits: ["Patient", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "poland", name: "波兰第二共和国", shortName: "波", color: "#E06D7E",
                culture: "polish", religion: "catholic", polity: "Republic", style: "presidential",
                capitalLon: 21.0, capitalLat: 52.2, capitalName: "华沙",
                anchors: [
                    HistoricalAnchor(lon: 19.9, lat: 50.1, provinceName: "克拉科夫", weight: 0.95),
                    HistoricalAnchor(lon: 16.9, lat: 52.4, provinceName: "波兹南", weight: 0.9),
                    HistoricalAnchor(lon: 18.6, lat: 54.3, provinceName: "格但斯克", weight: 0.9),
                    HistoricalAnchor(lon: 24.0, lat: 49.8, provinceName: "利沃夫", weight: 1.0),
                    HistoricalAnchor(lon: 23.7, lat: 52.1, provinceName: "布列斯特", weight: 0.95),
                ],
                rulerName: "爱德华·希米格维", rulerTitle: "元帅",
                rulerMilitary: 76, rulerAdmin: 68, rulerDiplo: 70, rulerCharisma: 76,
                rulerTraits: ["Brave", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "italy", name: "意大利王国", shortName: "意", color: "#3B8749",
                culture: "italian", religion: "catholic", polity: "Empire", style: "dualMonarchy",
                capitalLon: 12.5, capitalLat: 41.9, capitalName: "罗马",
                anchors: [
                    HistoricalAnchor(lon: 9.2, lat: 45.5, provinceName: "米兰", weight: 1.05),
                    HistoricalAnchor(lon: 12.3, lat: 45.4, provinceName: "威尼斯", weight: 1.0),
                    HistoricalAnchor(lon: 14.3, lat: 40.8, provinceName: "那不勒斯", weight: 1.1),
                    HistoricalAnchor(lon: 13.4, lat: 38.1, provinceName: "巴勒莫", weight: 1.15),
                    HistoricalAnchor(lon: 9.1, lat: 39.2, provinceName: "卡利亚里", weight: 1.1),
                    HistoricalAnchor(lon: 19.8, lat: 41.3, provinceName: "地拉那", weight: 0.9),
                    HistoricalAnchor(lon: 13.2, lat: 32.9, provinceName: "的黎波里", weight: 1.45),
                ],
                rulerName: "维托里奥·埃马努埃莱三世", rulerTitle: "国王",
                rulerMilitary: 62, rulerAdmin: 72, rulerDiplo: 74, rulerCharisma: 72,
                rulerTraits: ["Patient", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "spain", name: "西班牙", shortName: "西", color: "#D99B26",
                culture: "spanish", religion: "catholic", polity: "Republic", style: "fascist",
                capitalLon: -3.7, capitalLat: 40.4, capitalName: "马德里",
                anchors: [
                    HistoricalAnchor(lon: 2.2, lat: 41.4, provinceName: "巴塞罗那", weight: 1.1),
                    HistoricalAnchor(lon: -6.0, lat: 37.4, provinceName: "塞维利亚", weight: 1.15),
                    HistoricalAnchor(lon: -2.9, lat: 43.3, provinceName: "毕尔巴鄂", weight: 1.05),
                    HistoricalAnchor(lon: -0.4, lat: 39.5, provinceName: "瓦伦西亚", weight: 1.05),
                ],
                rulerName: "弗朗西斯科·佛朗哥", rulerTitle: "考迪罗",
                rulerMilitary: 78, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 72,
                rulerTraits: ["IronFist", "Patient", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "finland", name: "芬兰共和国", shortName: "芬", color: "#6FA8DC",
                culture: "norse", religion: "protestant", polity: "Republic", style: "presidential",
                capitalLon: 25.0, capitalLat: 60.2, capitalName: "赫尔辛基",
                anchors: [
                    HistoricalAnchor(lon: 25.5, lat: 65.0, provinceName: "奥卢", weight: 1.2),
                    HistoricalAnchor(lon: 28.7, lat: 60.7, provinceName: "维堡", weight: 0.95),
                    HistoricalAnchor(lon: 25.7, lat: 66.5, provinceName: "罗瓦涅米", weight: 1.2),
                ],
                rulerName: "曼纳海姆", rulerTitle: "元帅",
                rulerMilitary: 92, rulerAdmin: 80, rulerDiplo: 82, rulerCharisma: 88,
                rulerTraits: ["Tactician", "Veteran", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "sweden", name: "瑞典王国", shortName: "瑞", color: "#2E75B6",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 18.1, capitalLat: 59.3, capitalName: "斯德哥尔摩",
                anchors: [
                    HistoricalAnchor(lon: 12.0, lat: 57.7, provinceName: "哥德堡", weight: 1.05),
                    HistoricalAnchor(lon: 20.3, lat: 63.8, provinceName: "于默奥", weight: 1.2),
                ],
                rulerName: "古斯塔夫五世", rulerTitle: "国王",
                rulerMilitary: 64, rulerAdmin: 82, rulerDiplo: 86, rulerCharisma: 80,
                rulerTraits: ["Dovish", "Financier"]
            ),
            HistoricalNationSpec(
                id: "norway", name: "挪威王国", shortName: "挪", color: "#9E3B3B",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 10.7, capitalLat: 59.9, capitalName: "奥斯陆",
                anchors: [
                    HistoricalAnchor(lon: 5.3, lat: 60.4, provinceName: "卑尔根", weight: 1.1),
                    HistoricalAnchor(lon: 10.4, lat: 63.4, provinceName: "特隆赫姆", weight: 1.2),
                    HistoricalAnchor(lon: 17.4, lat: 68.4, provinceName: "纳尔维克", weight: 1.25),
                ],
                rulerName: "哈康七世", rulerTitle: "国王",
                rulerMilitary: 68, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 84,
                rulerTraits: ["Just", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "netherlands", name: "荷兰王国", shortName: "荷", color: "#E67E22",
                culture: "dutch", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 4.9, capitalLat: 52.4, capitalName: "阿姆斯特丹",
                anchors: [
                    HistoricalAnchor(lon: 4.5, lat: 51.9, provinceName: "鹿特丹", weight: 0.78),
                    HistoricalAnchor(lon: 6.6, lat: 53.2, provinceName: "格罗宁根", weight: 0.78),
                ],
                rulerName: "威廉明娜", rulerTitle: "女王",
                rulerMilitary: 64, rulerAdmin: 86, rulerDiplo: 84, rulerCharisma: 88,
                rulerTraits: ["Financier", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "romania", name: "罗马尼亚王国", shortName: "罗", color: "#C9A227",
                culture: "roman", religion: "orthodox", polity: "Kingdom", style: "absolute",
                capitalLon: 26.1, capitalLat: 44.4, capitalName: "布加勒斯特",
                anchors: [
                    HistoricalAnchor(lon: 23.6, lat: 46.8, provinceName: "克卢日", weight: 1.0),
                    HistoricalAnchor(lon: 28.6, lat: 44.2, provinceName: "康斯坦察", weight: 0.95),
                    HistoricalAnchor(lon: 27.6, lat: 47.2, provinceName: "雅西", weight: 0.95),
                ],
                rulerName: "卡罗尔二世", rulerTitle: "国王",
                rulerMilitary: 68, rulerAdmin: 70, rulerDiplo: 72, rulerCharisma: 70,
                rulerTraits: ["Ambitious", "Greedy"]
            ),
            HistoricalNationSpec(
                id: "hungary", name: "匈牙利王国", shortName: "匈", color: "#8D5A38",
                culture: "hungarian", religion: "catholic", polity: "Kingdom", style: "regency",
                capitalLon: 19.0, capitalLat: 47.5, capitalName: "布达佩斯",
                anchors: [
                    HistoricalAnchor(lon: 21.6, lat: 47.5, provinceName: "德布勒森", weight: 0.88),
                    HistoricalAnchor(lon: 20.1, lat: 46.3, provinceName: "塞格德", weight: 0.85),
                ],
                rulerName: "米克洛什·霍尔蒂", rulerTitle: "摄政王",
                rulerMilitary: 76, rulerAdmin: 74, rulerDiplo: 74, rulerCharisma: 76,
                rulerTraits: ["NavalMastery", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "yugoslavia", name: "南斯拉夫王国", shortName: "南", color: "#5B6ABF",
                culture: "slavic", religion: "orthodox", polity: "Kingdom", style: "regency",
                capitalLon: 20.5, capitalLat: 44.8, capitalName: "贝尔格莱德",
                anchors: [
                    HistoricalAnchor(lon: 16.0, lat: 45.8, provinceName: "萨格勒布", weight: 0.95),
                    HistoricalAnchor(lon: 18.4, lat: 43.9, provinceName: "萨拉热窝", weight: 0.95),
                    HistoricalAnchor(lon: 21.4, lat: 42.0, provinceName: "斯科普里", weight: 0.9),
                ],
                rulerName: "保罗亲王", rulerTitle: "摄政王",
                rulerMilitary: 70, rulerAdmin: 72, rulerDiplo: 76, rulerCharisma: 74,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "greece", name: "希腊王国", shortName: "希", color: "#4DA6E0",
                culture: "greek", religion: "orthodox", polity: "Empire", style: "dualMonarchy",
                capitalLon: 23.7, capitalLat: 38.0, capitalName: "雅典",
                anchors: [
                    HistoricalAnchor(lon: 22.9, lat: 40.6, provinceName: "塞萨洛尼基", weight: 0.95),
                    HistoricalAnchor(lon: 25.1, lat: 35.3, provinceName: "伊拉克利翁", weight: 1.1),
                ],
                rulerName: "乔治二世", rulerTitle: "国王",
                rulerMilitary: 68, rulerAdmin: 76, rulerDiplo: 80, rulerCharisma: 78,
                rulerTraits: ["Patient", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "turkey", name: "土耳其共和国", shortName: "土", color: "#C0392B",
                culture: "turkic", religion: "islam", polity: "Republic", style: "presidential",
                capitalLon: 32.9, capitalLat: 39.9, capitalName: "安卡拉",
                anchors: [
                    HistoricalAnchor(lon: 28.9, lat: 41.0, provinceName: "伊斯坦布尔", weight: 1.15),
                    HistoricalAnchor(lon: 27.1, lat: 38.4, provinceName: "伊兹密尔", weight: 1.15),
                    HistoricalAnchor(lon: 41.3, lat: 39.9, provinceName: "埃尔祖鲁姆", weight: 1.3),
                    HistoricalAnchor(lon: 35.3, lat: 37.0, provinceName: "阿达纳", weight: 1.2),
                ],
                rulerName: "伊斯梅特·伊纳尼", rulerTitle: "总统",
                rulerMilitary: 80, rulerAdmin: 84, rulerDiplo: 90, rulerCharisma: 82,
                rulerTraits: ["MasterDiplomat", "Reformer", "Patient"]
            ),
            // v8.0.0 彻底细化拆分：比利时、卢森堡、瑞士、丹麦、葡萄牙、爱尔兰、保加利亚、斯洛伐克、波罗的海三国（共 27 国！）
            HistoricalNationSpec(
                id: "belgium", name: "比利时王国", shortName: "比", color: "#D4A017",
                culture: "french", religion: "catholic", polity: "Kingdom", style: "constitutional",
                capitalLon: 4.35, capitalLat: 50.85, capitalName: "布鲁塞尔",
                anchors: [
                    HistoricalAnchor(lon: 4.4, lat: 51.2, provinceName: "安特卫普", weight: 0.72),
                    HistoricalAnchor(lon: 5.57, lat: 50.63, provinceName: "列日", weight: 0.70),
                ],
                rulerName: "利奥波德三世", rulerTitle: "国王",
                rulerMilitary: 72, rulerAdmin: 78, rulerDiplo: 76, rulerCharisma: 78,
                rulerTraits: ["Stubborn", "Patient"]
            ),
            HistoricalNationSpec(
                id: "luxembourg", name: "卢森堡大公国", shortName: "卢", color: "#5DADE2",
                culture: "french", religion: "catholic", polity: "Kingdom", style: "principality",
                capitalLon: 6.13, capitalLat: 49.61, capitalName: "卢森堡",
                anchors: [],
                rulerName: "夏洛特女大公", rulerTitle: "大公",
                rulerMilitary: 52, rulerAdmin: 82, rulerDiplo: 84, rulerCharisma: 86,
                rulerTraits: ["Dovish", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "switzerland", name: "瑞士联邦", shortName: "瑞士", color: "#D93838",
                culture: "german", religion: "protestant", polity: "Federation", style: "confederation",
                capitalLon: 7.45, capitalLat: 46.95, capitalName: "伯尔尼",
                anchors: [
                    HistoricalAnchor(lon: 8.54, lat: 47.37, provinceName: "苏黎世", weight: 0.72),
                    HistoricalAnchor(lon: 6.14, lat: 46.20, provinceName: "日内瓦", weight: 0.72),
                ],
                rulerName: "亨利·吉桑", rulerTitle: "联邦总司令",
                rulerMilitary: 86, rulerAdmin: 88, rulerDiplo: 88, rulerCharisma: 88,
                rulerTraits: ["Patient", "Strategist", "Just"]
            ),
            HistoricalNationSpec(
                id: "denmark", name: "丹麦王国", shortName: "丹", color: "#B83B4B",
                culture: "norse", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: 12.57, capitalLat: 55.68, capitalName: "哥本哈根",
                anchors: [
                    HistoricalAnchor(lon: 10.21, lat: 56.16, provinceName: "奥胡斯", weight: 0.78),
                ],
                rulerName: "克里斯蒂安十世", rulerTitle: "国王",
                rulerMilitary: 62, rulerAdmin: 80, rulerDiplo: 82, rulerCharisma: 86,
                rulerTraits: ["Dovish", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "portugal", name: "葡萄牙共和国", shortName: "葡", color: "#2D7A4F",
                culture: "portuguese", religion: "catholic", polity: "Republic", style: "dictatorship",
                capitalLon: -9.14, capitalLat: 38.72, capitalName: "里斯本",
                anchors: [
                    HistoricalAnchor(lon: -8.61, lat: 41.15, provinceName: "波尔图", weight: 0.85),
                ],
                rulerName: "安东尼奥·萨拉查", rulerTitle: "总理",
                rulerMilitary: 66, rulerAdmin: 84, rulerDiplo: 84, rulerCharisma: 76,
                rulerTraits: ["Financier", "Patient", "Administrator"]
            ),
            HistoricalNationSpec(
                id: "ireland", name: "爱尔兰自由邦", shortName: "爱", color: "#3CB371",
                culture: "english", religion: "catholic", polity: "Republic", style: "parliamentary",
                capitalLon: -6.26, capitalLat: 53.35, capitalName: "都柏林",
                anchors: [
                    HistoricalAnchor(lon: -8.47, lat: 51.90, provinceName: "科克", weight: 0.85),
                ],
                rulerName: "埃蒙·德瓦莱拉", rulerTitle: "总理",
                rulerMilitary: 68, rulerAdmin: 80, rulerDiplo: 84, rulerCharisma: 82,
                rulerTraits: ["Stubborn", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "bulgaria", name: "保加利亚王国", shortName: "保", color: "#4E8B63",
                culture: "slavic", religion: "orthodox", polity: "Empire", style: "dualMonarchy",
                capitalLon: 23.32, capitalLat: 42.70, capitalName: "索菲亚",
                anchors: [
                    HistoricalAnchor(lon: 24.75, lat: 42.14, provinceName: "普罗夫迪夫", weight: 0.85),
                    HistoricalAnchor(lon: 27.91, lat: 43.21, provinceName: "瓦尔纳", weight: 0.82),
                ],
                rulerName: "鲍里斯三世", rulerTitle: "沙皇",
                rulerMilitary: 72, rulerAdmin: 78, rulerDiplo: 84, rulerCharisma: 82,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "slovakia", name: "斯洛伐克共和国", shortName: "斯", color: "#6E88B8",
                culture: "slavic", religion: "catholic", polity: "Republic", style: "dictatorship",
                capitalLon: 17.11, capitalLat: 48.15, capitalName: "布拉迪斯拉发",
                anchors: [
                    HistoricalAnchor(lon: 21.26, lat: 48.72, provinceName: "科希策", weight: 0.72),
                ],
                rulerName: "约瑟夫·蒂索", rulerTitle: "总统",
                rulerMilitary: 60, rulerAdmin: 70, rulerDiplo: 68, rulerCharisma: 68,
                rulerTraits: ["Dovish", "Patient"]
            ),
            HistoricalNationSpec(
                id: "lithuania", name: "立陶宛共和国", shortName: "立", color: "#A58A3C",
                culture: "polish", religion: "catholic", polity: "Republic", style: "presidential",
                capitalLon: 25.28, capitalLat: 54.69, capitalName: "维尔纽斯",
                anchors: [
                    HistoricalAnchor(lon: 23.90, lat: 54.90, provinceName: "考纳斯", weight: 0.78),
                ],
                rulerName: "安塔纳斯·斯梅托纳", rulerTitle: "总统",
                rulerMilitary: 64, rulerAdmin: 74, rulerDiplo: 74, rulerCharisma: 72,
                rulerTraits: ["Patient", "Stubborn"]
            ),
            HistoricalNationSpec(
                id: "latvia", name: "拉脱维亚共和国", shortName: "拉", color: "#8C3B4A",
                culture: "polish", religion: "protestant", polity: "Republic", style: "presidential",
                capitalLon: 24.11, capitalLat: 56.95, capitalName: "里加",
                anchors: [],
                rulerName: "卡尔利斯·乌尔马尼斯", rulerTitle: "总统",
                rulerMilitary: 64, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 76,
                rulerTraits: ["Administrator", "Patient"]
            ),
            HistoricalNationSpec(
                id: "estonia", name: "爱沙尼亚共和国", shortName: "爱沙", color: "#4D82B8",
                culture: "norse", religion: "protestant", polity: "Republic", style: "presidential",
                capitalLon: 24.75, capitalLat: 59.44, capitalName: "塔林",
                anchors: [],
                rulerName: "康斯坦丁·帕茨", rulerTitle: "总统",
                rulerMilitary: 64, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 74,
                rulerTraits: ["Administrator", "Patient"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "germany", defenderId: "poland", casusBelli: "白色方案 · 闪击波兰"),
            HistoricalWarSpec(attackerId: "germany", defenderId: "uk", casusBelli: "二战爆发 · 英德宣战"),
            HistoricalWarSpec(attackerId: "germany", defenderId: "france", casusBelli: "西线对峙 · 法德宣战"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "反法西斯同盟国", memberIds: ["uk", "france", "poland"]),
            HistoricalAllianceSpec(name: "轴心国", memberIds: ["germany", "italy", "slovakia"]),
        ],
        openingVassals: [
            HistoricalVassalSpec(overlordId: "germany", vassalId: "slovakia", tributeRate: 0.15),
        ],
        tags: ["二战", "欧洲战场", "闪电战", "27国细化"],
        rebelMode: "historical",
        eraOverride: "ww2"
    )

    // 剧本 11：二战亚洲太平洋 · 太平洋风暴（公元 1941 年 12 月 · 东亚与太平洋 · 13 国细化）
    private static let ww2Asia1941 = HistoricalScenario(
        id: "ww2_asia_1941",
        title: "二战亚洲太平洋 · 太平洋风暴",
        subtitle: "1941年12月 · 全民族抗战与太平洋战火 · 13国细化",
        region: .eastAsiaJapan,
        year: 1941,
        eraName: "二战亚太",
        description: "1941年12月，太平洋战争爆发，日军南下香港、马来、新加坡、荷属东印度与菲律宾；正面战场国民政府死守西南大后方，延安抗日根据地深入敌后牵制华北，关东军与苏联远东、外蒙古陈兵百万对峙，美军太平洋舰队严阵以待！",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 320,
        nations: [
            HistoricalNationSpec(
                id: "roc", name: "中华民国国民政府", shortName: "国", color: "#2B6CB0",
                culture: "chinese", religion: "confucian", polity: "Republic", style: "presidential",
                capitalLon: 106.5, capitalLat: 29.5, capitalName: "重庆",
                anchors: [
                    HistoricalAnchor(lon: 104.1, lat: 30.7, provinceName: "成都", weight: 1.35),
                    HistoricalAnchor(lon: 102.7, lat: 25.0, provinceName: "昆明", weight: 1.4),
                    HistoricalAnchor(lon: 108.9, lat: 34.3, provinceName: "西安", weight: 1.15),
                    HistoricalAnchor(lon: 113.0, lat: 28.2, provinceName: "长沙", weight: 1.2),
                    HistoricalAnchor(lon: 110.3, lat: 25.3, provinceName: "桂林", weight: 1.25),
                    HistoricalAnchor(lon: 106.7, lat: 26.6, provinceName: "贵阳", weight: 1.25),
                    HistoricalAnchor(lon: 103.8, lat: 36.1, provinceName: "兰州", weight: 1.5),
                    HistoricalAnchor(lon: 114.9, lat: 25.8, provinceName: "赣州", weight: 1.15),
                ],
                rulerName: "蒋中正", rulerTitle: "国民政府主席",
                rulerMilitary: 80, rulerAdmin: 78, rulerDiplo: 84, rulerCharisma: 82,
                rulerTraits: ["BattleHardened", "Diplomatic", "IronFist"]
            ),
            HistoricalNationSpec(
                id: "yanan", name: "延安抗日根据地", shortName: "延", color: "#C82829",
                culture: "chinese", religion: "chineseFolk", polity: "Republic", style: "communist",
                capitalLon: 109.5, capitalLat: 36.6, capitalName: "延安",
                anchors: [
                    HistoricalAnchor(lon: 113.1, lat: 36.2, provinceName: "长治", weight: 0.95),
                    HistoricalAnchor(lon: 114.5, lat: 38.0, provinceName: "石家庄", weight: 0.95),
                    HistoricalAnchor(lon: 112.5, lat: 37.9, provinceName: "太原", weight: 0.95),
                ],
                rulerName: "毛泽东", rulerTitle: "主席",
                rulerMilitary: 95, rulerAdmin: 90, rulerDiplo: 88, rulerCharisma: 96,
                rulerTraits: ["Genius", "Strategist", "Visionary", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "japan", name: "大日本帝国", shortName: "日", color: "#A92B2B",
                culture: "japanese", religion: "shinto", polity: "Empire", style: "dualMonarchy",
                capitalLon: 139.7, capitalLat: 35.7, capitalName: "东京",
                anchors: [
                    HistoricalAnchor(lon: 135.5, lat: 34.7, provinceName: "大阪", weight: 1.15),
                    HistoricalAnchor(lon: 136.9, lat: 35.2, provinceName: "名古屋", weight: 1.05),
                    HistoricalAnchor(lon: 130.4, lat: 33.6, provinceName: "福冈", weight: 1.2),
                    HistoricalAnchor(lon: 141.3, lat: 43.1, provinceName: "札幌", weight: 1.35),
                    HistoricalAnchor(lon: 127.0, lat: 37.6, provinceName: "汉城", weight: 1.25),
                    HistoricalAnchor(lon: 129.0, lat: 35.2, provinceName: "釜山", weight: 1.15),
                    HistoricalAnchor(lon: 121.5, lat: 25.0, provinceName: "台北", weight: 1.2),
                    HistoricalAnchor(lon: 121.5, lat: 31.2, provinceName: "上海", weight: 1.15),
                    HistoricalAnchor(lon: 118.8, lat: 32.1, provinceName: "南京", weight: 1.1),
                    HistoricalAnchor(lon: 116.4, lat: 39.9, provinceName: "北平", weight: 1.1),
                    HistoricalAnchor(lon: 114.3, lat: 30.6, provinceName: "武汉", weight: 1.05),
                    HistoricalAnchor(lon: 113.3, lat: 23.1, provinceName: "广州", weight: 1.05),
                    HistoricalAnchor(lon: 127.7, lat: 26.2, provinceName: "那霸", weight: 1.1),
                    HistoricalAnchor(lon: 110.3, lat: 20.0, provinceName: "海口", weight: 1.1),
                ],
                rulerName: "裕仁", rulerTitle: "天皇",
                rulerMilitary: 74, rulerAdmin: 78, rulerDiplo: 74, rulerCharisma: 82,
                rulerTraits: ["Stubborn", "Patient", "NaturalLeader"]
            ),
            HistoricalNationSpec(
                id: "manchukuo", name: "伪满洲国·关东军", shortName: "满", color: "#B7950B",
                culture: "chinese", religion: "confucian", polity: "Kingdom", style: "regency",
                capitalLon: 125.3, capitalLat: 43.9, capitalName: "长春",
                anchors: [
                    HistoricalAnchor(lon: 123.4, lat: 41.8, provinceName: "奉天", weight: 1.15),
                    HistoricalAnchor(lon: 126.6, lat: 45.8, provinceName: "哈尔滨", weight: 1.25),
                    HistoricalAnchor(lon: 121.6, lat: 38.9, provinceName: "大连", weight: 1.05),
                    HistoricalAnchor(lon: 123.9, lat: 47.3, provinceName: "齐齐哈尔", weight: 1.25),
                    HistoricalAnchor(lon: 117.9, lat: 41.0, provinceName: "承德", weight: 1.1),
                ],
                rulerName: "爱新觉罗·溥仪", rulerTitle: "傀儡皇帝",
                rulerMilitary: 42, rulerAdmin: 54, rulerDiplo: 60, rulerCharisma: 56,
                rulerTraits: ["Dovish", "Paranoid"]
            ),
            HistoricalNationSpec(
                id: "ussr_fe", name: "苏联远东", shortName: "苏", color: "#9B1C1C",
                culture: "slavic", religion: "orthodox", polity: "Republic", style: "communist",
                capitalLon: 131.9, capitalLat: 43.1, capitalName: "海参崴",
                anchors: [
                    HistoricalAnchor(lon: 135.1, lat: 48.5, provinceName: "伯力", weight: 1.45),
                    HistoricalAnchor(lon: 113.5, lat: 52.0, provinceName: "赤塔", weight: 1.65),
                    HistoricalAnchor(lon: 127.5, lat: 50.3, provinceName: "布拉戈维申斯克", weight: 1.4),
                ],
                rulerName: "约瑟夫·阿帕纳先科", rulerTitle: "远东方面军司令",
                rulerMilitary: 88, rulerAdmin: 78, rulerDiplo: 70, rulerCharisma: 84,
                rulerTraits: ["BattleHardened", "IronFist", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "uk_burma", name: "英属印度与缅甸", shortName: "英印", color: "#D65A5A",
                culture: "english", religion: "protestant", polity: "Republic", style: "protectorate",
                capitalLon: 96.2, capitalLat: 16.8, capitalName: "仰光",
                anchors: [
                    HistoricalAnchor(lon: 96.1, lat: 22.0, provinceName: "曼德勒", weight: 1.25),
                    HistoricalAnchor(lon: 97.4, lat: 25.4, provinceName: "密支那", weight: 1.25),
                    HistoricalAnchor(lon: 88.4, lat: 22.6, provinceName: "加尔各答", weight: 1.35),
                    HistoricalAnchor(lon: 93.9, lat: 24.8, provinceName: "英帕尔", weight: 1.2),
                    HistoricalAnchor(lon: 114.2, lat: 22.3, provinceName: "香港", weight: 0.72),
                ],
                rulerName: "阿奇博尔德·韦维尔", rulerTitle: "远东总司令",
                rulerMilitary: 80, rulerAdmin: 78, rulerDiplo: 80, rulerCharisma: 78,
                rulerTraits: ["Veteran", "Patient"]
            ),
            HistoricalNationSpec(
                id: "indochina", name: "法属印度支那", shortName: "印支", color: "#4A74B4",
                culture: "vietnamese", religion: "catholic", polity: "Republic", style: "protectorate",
                capitalLon: 105.8, capitalLat: 21.0, capitalName: "河内",
                anchors: [
                    HistoricalAnchor(lon: 106.7, lat: 10.8, provinceName: "西贡", weight: 1.15),
                    HistoricalAnchor(lon: 107.6, lat: 16.5, provinceName: "顺化", weight: 1.1),
                    HistoricalAnchor(lon: 102.6, lat: 18.0, provinceName: "万象", weight: 1.05),
                    HistoricalAnchor(lon: 104.9, lat: 11.6, provinceName: "金边", weight: 1.05),
                ],
                rulerName: "让·德古", rulerTitle: "总督",
                rulerMilitary: 66, rulerAdmin: 74, rulerDiplo: 72, rulerCharisma: 68,
                rulerTraits: ["Administrator", "Patient"]
            ),
            HistoricalNationSpec(
                id: "philippines", name: "美属菲律宾", shortName: "美菲", color: "#3B82C4",
                culture: "english", religion: "catholic", polity: "Federation", style: "federal",
                capitalLon: 121.0, capitalLat: 14.6, capitalName: "马尼拉",
                anchors: [
                    HistoricalAnchor(lon: 123.9, lat: 10.3, provinceName: "宿务", weight: 1.15),
                    HistoricalAnchor(lon: 125.6, lat: 7.1, provinceName: "达沃", weight: 1.1),
                ],
                rulerName: "道格拉斯·麦克阿瑟", rulerTitle: "远东总司令",
                rulerMilitary: 90, rulerAdmin: 80, rulerDiplo: 82, rulerCharisma: 90,
                rulerTraits: ["Charismatic", "NavalMastery", "Tactician"]
            ),
            HistoricalNationSpec(
                id: "thailand", name: "泰国", shortName: "泰", color: "#2E8B57",
                culture: "vietnamese", religion: "buddhism", polity: "Empire", style: "junta",
                capitalLon: 100.5, capitalLat: 13.8, capitalName: "曼谷",
                anchors: [
                    HistoricalAnchor(lon: 99.0, lat: 18.8, provinceName: "清迈", weight: 1.15),
                    HistoricalAnchor(lon: 102.1, lat: 15.0, provinceName: "呵叻", weight: 1.05),
                ],
                rulerName: "銮披汶·颂堪", rulerTitle: "元帅",
                rulerMilitary: 74, rulerAdmin: 74, rulerDiplo: 78, rulerCharisma: 76,
                rulerTraits: ["Ambitious", "Diplomatic"]
            ),
            // v8.0.0 细化拆分亚太战区：英属马来新加坡、荷属东印度、蒙古人民共和国、美军太平洋前哨（共 13 国）
            HistoricalNationSpec(
                id: "uk_malaya", name: "英属马来与新加坡", shortName: "马来", color: "#E06D7E",
                culture: "english", religion: "protestant", polity: "Republic", style: "protectorate",
                capitalLon: 103.82, capitalLat: 1.35, capitalName: "新加坡",
                anchors: [
                    HistoricalAnchor(lon: 101.69, lat: 3.14, provinceName: "吉隆坡", weight: 1.0),
                    HistoricalAnchor(lon: 110.35, lat: 1.55, provinceName: "古晋", weight: 1.05),
                    HistoricalAnchor(lon: 116.07, lat: 5.98, provinceName: "亚庇", weight: 1.05),
                ],
                rulerName: "亚瑟·帕西瓦尔", rulerTitle: "马来亚总司令",
                rulerMilitary: 72, rulerAdmin: 76, rulerDiplo: 74, rulerCharisma: 74,
                rulerTraits: ["Patient", "Veteran"]
            ),
            HistoricalNationSpec(
                id: "dutch_ei", name: "荷属东印度", shortName: "东印", color: "#E67E22",
                culture: "dutch", religion: "protestant", polity: "Republic", style: "protectorate",
                capitalLon: 106.85, capitalLat: -6.21, capitalName: "巴达维亚",
                anchors: [
                    HistoricalAnchor(lon: 112.75, lat: -7.25, provinceName: "泗水", weight: 1.05),
                    HistoricalAnchor(lon: 98.67, lat: 3.59, provinceName: "棉兰", weight: 1.1),
                    HistoricalAnchor(lon: 116.85, lat: -1.27, provinceName: "巴厘巴板", weight: 1.1),
                ],
                rulerName: "海因·特·波尔滕", rulerTitle: "荷印陆军总司令",
                rulerMilitary: 76, rulerAdmin: 78, rulerDiplo: 76, rulerCharisma: 76,
                rulerTraits: ["NavalMastery", "Brave"]
            ),
            HistoricalNationSpec(
                id: "mongolia", name: "蒙古人民共和国", shortName: "蒙", color: "#A88B2E",
                culture: "mongol", religion: "buddhism", polity: "Republic", style: "communist",
                capitalLon: 106.91, capitalLat: 47.92, capitalName: "乌兰巴托",
                anchors: [
                    HistoricalAnchor(lon: 97.0, lat: 46.5, provinceName: "科布多", weight: 1.25),
                    HistoricalAnchor(lon: 114.5, lat: 48.0, provinceName: "乔巴山", weight: 1.2),
                ],
                rulerName: "霍尔洛·乔巴山", rulerTitle: "元帅",
                rulerMilitary: 84, rulerAdmin: 78, rulerDiplo: 76, rulerCharisma: 82,
                rulerTraits: ["IronFist", "BattleHardened"]
            ),
            HistoricalNationSpec(
                id: "usa_pacific", name: "美军太平洋舰队", shortName: "美太", color: "#1F5EA8",
                culture: "english", religion: "protestant", polity: "Federation", style: "federal",
                capitalLon: 147.0, capitalLat: -6.7, capitalName: "莱城",
                anchors: [
                    HistoricalAnchor(lon: 145.8, lat: -5.2, provinceName: "马当", weight: 1.15),
                    HistoricalAnchor(lon: 143.6, lat: -3.55, provinceName: "韦瓦克", weight: 1.15),
                    HistoricalAnchor(lon: 144.79, lat: 13.44, provinceName: "关岛", weight: 1.0),
                    HistoricalAnchor(lon: 145.75, lat: 15.18, provinceName: "塞班", weight: 1.0),
                ],
                rulerName: "切斯特·尼米兹", rulerTitle: "太平洋舰队总司令",
                rulerMilitary: 97, rulerAdmin: 90, rulerDiplo: 84, rulerCharisma: 92,
                rulerTraits: ["Genius", "NavalMastery", "Strategist"]
            ),
        ],
        openingWars: [
            HistoricalWarSpec(attackerId: "japan", defenderId: "roc", casusBelli: "全面抗日战争"),
            HistoricalWarSpec(attackerId: "japan", defenderId: "yanan", casusBelli: "华北敌后抗战"),
            HistoricalWarSpec(attackerId: "japan", defenderId: "philippines", casusBelli: "太平洋战争 · 吕宋战役"),
            HistoricalWarSpec(attackerId: "japan", defenderId: "uk_burma", casusBelli: "香港与缅甸战役"),
            HistoricalWarSpec(attackerId: "japan", defenderId: "uk_malaya", casusBelli: "马来亚与新加坡战役"),
            HistoricalWarSpec(attackerId: "japan", defenderId: "dutch_ei", casusBelli: "南进石油 · 荷印战役"),
            HistoricalWarSpec(attackerId: "japan", defenderId: "usa_pacific", casusBelli: "偷袭珍珠港 · 太平洋决战"),
        ],
        openingAlliances: [
            HistoricalAllianceSpec(name: "世界反法西斯同盟", memberIds: ["roc", "yanan", "uk_burma", "uk_malaya", "dutch_ei", "philippines", "usa_pacific"]),
            HistoricalAllianceSpec(name: "东亚轴心", memberIds: ["japan", "manchukuo", "thailand"]),
            HistoricalAllianceSpec(name: "苏蒙互助同盟", memberIds: ["ussr_fe", "mongolia"]),
        ],
        openingVassals: [
            HistoricalVassalSpec(overlordId: "japan", vassalId: "manchukuo", tributeRate: 0.20),
        ],
        tags: ["二战", "亚太战场", "抗战", "13国细化"],
        rebelMode: "historical",
        eraOverride: "ww2"
    )

    // 剧本 12：冷战铁幕 · 1950（公元 1950 年 · 世界全图 · 12 大阵营/强国）
    private static let coldwar1950 = HistoricalScenario(
        id: "coldwar_1950",
        title: "冷战铁幕 · 1950",
        subtitle: "两大阵营 · 核威慑时代（全球总图）",
        region: .world,
        year: 1950,
        eraName: "冷战时代",
        description: "1950年，铁幕横贯欧陆、新中国屹立东方，美苏两大超级大国进入原子弹与战略导弹威慑时代。北大西洋公约组织与东方阵营剑拔弩张，印度、不结盟国家与拉美各国在两极格局中寻求自立。",
        author: "列国纪官方",
        isOfficial: true,
        provinceCount: 340,
        nations: [
            HistoricalNationSpec(
                id: "usa", name: "美利坚合众国", shortName: "美", color: "#2B6CB0",
                culture: "english", religion: "protestant", polity: "Federation", style: "federal",
                capitalLon: -77.0, capitalLat: 38.9, capitalName: "华盛顿",
                anchors: [
                    HistoricalAnchor(lon: -74.0, lat: 40.7, provinceName: "纽约", weight: 1.4),
                    HistoricalAnchor(lon: -87.6, lat: 41.9, provinceName: "芝加哥", weight: 1.55),
                    HistoricalAnchor(lon: -118.2, lat: 34.1, provinceName: "洛杉矶", weight: 1.65),
                    HistoricalAnchor(lon: -75.7, lat: 45.4, provinceName: "渥太华", weight: 1.65),
                    HistoricalAnchor(lon: -149.9, lat: 61.2, provinceName: "安克雷奇", weight: 1.65),
                    HistoricalAnchor(lon: -99.1, lat: 19.4, provinceName: "墨西哥城", weight: 1.45),
                ],
                rulerName: "哈里·杜鲁门", rulerTitle: "总统",
                rulerMilitary: 88, rulerAdmin: 88, rulerDiplo: 88, rulerCharisma: 84,
                rulerTraits: ["NavalMastery", "IronFist", "Financier"]
            ),
            HistoricalNationSpec(
                id: "ussr", name: "苏联", shortName: "苏", color: "#B92B27",
                culture: "slavic", religion: "orthodox", polity: "Republic", style: "communist",
                capitalLon: 37.6, capitalLat: 55.8, capitalName: "莫斯科",
                anchors: [
                    HistoricalAnchor(lon: 30.3, lat: 59.9, provinceName: "列宁格勒", weight: 1.45),
                    HistoricalAnchor(lon: 30.5, lat: 50.4, provinceName: "基辅", weight: 1.4),
                    HistoricalAnchor(lon: 60.6, lat: 56.8, provinceName: "斯维尔德洛夫斯克", weight: 1.85),
                    HistoricalAnchor(lon: 82.9, lat: 55.0, provinceName: "新西伯利亚", weight: 2.0),
                    HistoricalAnchor(lon: 131.9, lat: 43.1, provinceName: "海参崴", weight: 1.75),
                    HistoricalAnchor(lon: 69.2, lat: 41.3, provinceName: "塔什干", weight: 1.6),
                ],
                rulerName: "约瑟夫·斯大林", rulerTitle: "部长会议主席",
                rulerMilitary: 90, rulerAdmin: 88, rulerDiplo: 82, rulerCharisma: 86,
                rulerTraits: ["IronFist", "BattleHardened", "Paranoid"]
            ),
            HistoricalNationSpec(
                id: "prc", name: "中华人民共和国", shortName: "中", color: "#D9363E",
                culture: "chinese", religion: "confucian", polity: "Republic", style: "communist",
                capitalLon: 116.4, capitalLat: 39.9, capitalName: "北京",
                anchors: [
                    HistoricalAnchor(lon: 121.5, lat: 31.2, provinceName: "上海", weight: 1.35),
                    HistoricalAnchor(lon: 113.3, lat: 23.1, provinceName: "广州", weight: 1.35),
                    HistoricalAnchor(lon: 104.1, lat: 30.7, provinceName: "成都", weight: 1.4),
                    HistoricalAnchor(lon: 123.4, lat: 41.8, provinceName: "沈阳", weight: 1.3),
                    HistoricalAnchor(lon: 87.6, lat: 43.8, provinceName: "乌鲁木齐", weight: 1.6),
                    HistoricalAnchor(lon: 91.1, lat: 29.7, provinceName: "拉萨", weight: 1.5),
                ],
                rulerName: "毛泽东", rulerTitle: "主席",
                rulerMilitary: 96, rulerAdmin: 90, rulerDiplo: 88, rulerCharisma: 96,
                rulerTraits: ["Genius", "Strategist", "Visionary", "Unifier"]
            ),
            HistoricalNationSpec(
                id: "uk", name: "大英帝国", shortName: "英", color: "#C84B52",
                culture: "english", religion: "protestant", polity: "Kingdom", style: "constitutional",
                capitalLon: -0.1, capitalLat: 51.5, capitalName: "伦敦",
                anchors: [
                    HistoricalAnchor(lon: -3.2, lat: 55.9, provinceName: "爱丁堡", weight: 1.15),
                    HistoricalAnchor(lon: 18.4, lat: -33.9, provinceName: "开普敦", weight: 1.65),
                    HistoricalAnchor(lon: 36.8, lat: -1.3, provinceName: "内罗毕", weight: 1.45),
                    HistoricalAnchor(lon: 103.8, lat: 1.3, provinceName: "新加坡", weight: 1.45),
                ],
                rulerName: "乔治六世", rulerTitle: "国王",
                rulerMilitary: 70, rulerAdmin: 82, rulerDiplo: 86, rulerCharisma: 90,
                rulerTraits: ["Brave", "Just", "Beloved"]
            ),
            HistoricalNationSpec(
                id: "france", name: "法兰西第四共和国", shortName: "法", color: "#2E5FA8",
                culture: "french", religion: "catholic", polity: "Republic", style: "parliamentary",
                capitalLon: 2.3, capitalLat: 48.9, capitalName: "巴黎",
                anchors: [
                    HistoricalAnchor(lon: 5.4, lat: 43.3, provinceName: "马赛", weight: 1.1),
                    HistoricalAnchor(lon: 3.0, lat: 36.7, provinceName: "阿尔及尔", weight: 1.4),
                    HistoricalAnchor(lon: -17.4, lat: 14.7, provinceName: "达喀尔", weight: 1.75),
                    HistoricalAnchor(lon: 15.3, lat: -4.3, provinceName: "布拉柴维尔", weight: 1.55),
                    HistoricalAnchor(lon: 47.5, lat: -18.9, provinceName: "塔那那利佛", weight: 1.4),
                ],
                rulerName: "樊尚·奥里奥尔", rulerTitle: "总统",
                rulerMilitary: 76, rulerAdmin: 80, rulerDiplo: 84, rulerCharisma: 78,
                rulerTraits: ["Diplomatic", "Patient"]
            ),
            HistoricalNationSpec(
                id: "west_europe", name: "西欧北约", shortName: "西欧", color: "#4A89C8",
                culture: "german", religion: "catholic", polity: "Federation", style: "federal",
                capitalLon: 7.1, capitalLat: 50.7, capitalName: "波恩",
                anchors: [
                    HistoricalAnchor(lon: 12.5, lat: 41.9, provinceName: "罗马", weight: 1.25),
                    HistoricalAnchor(lon: -3.7, lat: 40.4, provinceName: "马德里", weight: 1.25),
                    HistoricalAnchor(lon: 18.1, lat: 59.3, provinceName: "斯德哥尔摩", weight: 1.3),
                    HistoricalAnchor(lon: 10.7, lat: 59.9, provinceName: "奥斯陆", weight: 1.25),
                ],
                rulerName: "康拉德·阿登纳", rulerTitle: "总理",
                rulerMilitary: 76, rulerAdmin: 90, rulerDiplo: 88, rulerCharisma: 84,
                rulerTraits: ["Administrator", "Financier", "Reformer"]
            ),
            HistoricalNationSpec(
                id: "warsaw_east", name: "东欧华约", shortName: "东欧", color: "#A63A46",
                culture: "polish", religion: "catholic", polity: "Republic", style: "communist",
                capitalLon: 21.0, capitalLat: 52.2, capitalName: "华沙",
                anchors: [
                    HistoricalAnchor(lon: 14.4, lat: 50.1, provinceName: "布拉格", weight: 1.05),
                    HistoricalAnchor(lon: 19.0, lat: 47.5, provinceName: "布达佩斯", weight: 1.05),
                    HistoricalAnchor(lon: 26.1, lat: 44.4, provinceName: "布加勒斯特", weight: 1.1),
                ],
                rulerName: "博莱斯瓦夫·贝鲁特", rulerTitle: "总统",
                rulerMilitary: 76, rulerAdmin: 78, rulerDiplo: 74, rulerCharisma: 74,
                rulerTraits: ["IronFist", "Administrator"]
            ),
            HistoricalNationSpec(
                id: "india", name: "印度共和国", shortName: "印", color: "#E08E26",
                culture: "indian", religion: "hinduism", polity: "Republic", style: "parliamentary",
                capitalLon: 77.2, capitalLat: 28.6, capitalName: "新德里",
                anchors: [
                    HistoricalAnchor(lon: 72.9, lat: 19.1, provinceName: "孟买", weight: 1.4),
                    HistoricalAnchor(lon: 88.4, lat: 22.6, provinceName: "加尔各答", weight: 1.4),
                    HistoricalAnchor(lon: 80.3, lat: 13.1, provinceName: "金奈", weight: 1.35),
                    HistoricalAnchor(lon: 106.8, lat: -6.2, provinceName: "雅加达", weight: 1.5),
                ],
                rulerName: "贾瓦哈拉尔·尼赫鲁", rulerTitle: "总理",
                rulerMilitary: 72, rulerAdmin: 84, rulerDiplo: 90, rulerCharisma: 86,
                rulerTraits: ["MasterDiplomat", "Scholar", "Visionary"]
            ),
            HistoricalNationSpec(
                id: "japan", name: "日本", shortName: "日", color: "#D46A7E",
                culture: "japanese", religion: "shinto", polity: "Kingdom", style: "constitutional",
                capitalLon: 139.7, capitalLat: 35.7, capitalName: "东京",
                anchors: [
                    HistoricalAnchor(lon: 135.5, lat: 34.7, provinceName: "大阪", weight: 1.05),
                    HistoricalAnchor(lon: 141.3, lat: 43.1, provinceName: "札幌", weight: 1.05),
                ],
                rulerName: "裕仁", rulerTitle: "天皇",
                rulerMilitary: 64, rulerAdmin: 78, rulerDiplo: 82, rulerCharisma: 84,
                rulerTraits: ["Patient", "Dovish", "Just"]
            ),
            HistoricalNationSpec(
                id: "yugo_mideast", name: "南斯拉夫与中东", shortName: "不结盟", color: "#3D9970",
                culture: "arab", religion: "islam", polity: "Republic", style: "socialist",
                capitalLon: 31.2, capitalLat: 30.0, capitalName: "开罗",
                anchors: [
                    HistoricalAnchor(lon: 20.5, lat: 44.8, provinceName: "贝尔格莱德", weight: 1.25),
                    HistoricalAnchor(lon: 32.9, lat: 39.9, provinceName: "安卡拉", weight: 1.3),
                    HistoricalAnchor(lon: 44.4, lat: 33.3, provinceName: "巴格达", weight: 1.4),
                    HistoricalAnchor(lon: 51.4, lat: 35.7, provinceName: "德黑兰", weight: 1.45),
                    HistoricalAnchor(lon: 46.7, lat: 24.7, provinceName: "利雅得", weight: 1.5),
                ],
                rulerName: "约瑟普·铁托", rulerTitle: "总统",
                rulerMilitary: 86, rulerAdmin: 82, rulerDiplo: 88, rulerCharisma: 88,
                rulerTraits: ["Charismatic", "BattleHardened", "Diplomatic"]
            ),
            HistoricalNationSpec(
                id: "latam", name: "巴西与拉美", shortName: "拉美", color: "#27AE60",
                culture: "portuguese", religion: "catholic", polity: "Federation", style: "federal",
                capitalLon: -43.2, capitalLat: -22.9, capitalName: "里约热内卢",
                anchors: [
                    HistoricalAnchor(lon: -58.4, lat: -34.6, provinceName: "布宜诺斯艾利斯", weight: 1.55),
                    HistoricalAnchor(lon: -70.7, lat: -33.4, provinceName: "圣地亚哥", weight: 1.45),
                    HistoricalAnchor(lon: -77.0, lat: -12.0, provinceName: "利马", weight: 1.45),
                    HistoricalAnchor(lon: -74.1, lat: 4.6, provinceName: "波哥大", weight: 1.5),
                ],
                rulerName: "热图利奥·瓦加斯", rulerTitle: "总统",
                rulerMilitary: 72, rulerAdmin: 82, rulerDiplo: 80, rulerCharisma: 82,
                rulerTraits: ["Reformer", "Administrator", "Financier"]
            ),
            HistoricalNationSpec(
                id: "australia", name: "澳大利亚联邦", shortName: "澳", color: "#5B9BD5",
                culture: "english", religion: "protestant", polity: "Federation", style: "federal",
                capitalLon: 149.1, capitalLat: -35.3, capitalName: "堪培拉",
                anchors: [
                    HistoricalAnchor(lon: 151.2, lat: -33.9, provinceName: "悉尼", weight: 1.4),
                    HistoricalAnchor(lon: 145.0, lat: -37.8, provinceName: "墨尔本", weight: 1.4),
                    HistoricalAnchor(lon: 115.9, lat: -32.0, provinceName: "珀斯", weight: 1.7),
                    HistoricalAnchor(lon: 174.8, lat: -41.3, provinceName: "惠灵顿", weight: 1.55),
                ],
                rulerName: "罗伯特·孟席斯", rulerTitle: "总理",
                rulerMilitary: 74, rulerAdmin: 84, rulerDiplo: 84, rulerCharisma: 80,
                rulerTraits: ["NavalMastery", "Financier", "Diplomatic"]
            ),
        ],
        openingWars: [],
        openingAlliances: [
            HistoricalAllianceSpec(name: "北大西洋公约组织", memberIds: ["usa", "uk", "france", "west_europe", "japan", "australia"]),
            HistoricalAllianceSpec(name: "东方社会主义阵营", memberIds: ["ussr", "prc", "warsaw_east"]),
        ],
        tags: ["冷战", "世界全图", "核威慑", "现代"],
        rebelMode: "historical",
        eraOverride: "modern"
    )
}
